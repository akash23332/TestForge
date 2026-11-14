import { Question } from '../models/Question.js';
import { TestCase } from '../models/TestCase.js';
import { ApiError } from '../utils/apiError.js';
import { validateSingleTestCase } from './codeRunner.service.js';
import {
  parseConstraints,
  detectDuplicateTestCases,
  analyzeScenarioCoverage,
  checkInputAgainstConstraints
} from './testValidation.service.js';
import { validateMetadataContract } from './codeContract.service.js';
import { providerRegistry } from './execution/providerRegistry.js';

export const PUBLISHING_STATES = Object.freeze({
  DRAFT: 'DRAFT',
  VALIDATING: 'VALIDATING',
  READY_TO_PUBLISH: 'READY_TO_PUBLISH',
  PUBLISHED: 'PUBLISHED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VALIDATION_UNAVAILABLE: 'VALIDATION_UNAVAILABLE'
});

/**
 * Extracts reference solution code for a specific language without cross-language pollution.
 * Never copies one language's reference solution into another language's field.
 */
export const getReferenceSolutionForLanguage = (question, language) => {
  if (!question || !language) return '';
  const langKey = language.toLowerCase();

  if (question.referenceSolutions) {
    if (question.referenceSolutions instanceof Map) {
      const code = question.referenceSolutions.get(langKey);
      if (code && code.trim()) return code.trim();
    } else if (typeof question.referenceSolutions === 'object') {
      const keys = Object.keys(question.referenceSolutions);
      const matched = keys.find((k) => k.toLowerCase() === langKey);
      if (matched && question.referenceSolutions[matched]?.trim()) {
        return question.referenceSolutions[matched].trim();
      }
    }
  }

  // Only use top-level referenceSolution if question.language explicitly matches target language
  const qLang = (question.language || '').toLowerCase();
  if (qLang === langKey && question.referenceSolution && question.referenceSolution.trim()) {
    return question.referenceSolution.trim();
  }

  return '';
};

/**
 * Cleans internal stack traces and technical internals from error messages for teacher display.
 */
export const sanitizeTeacherErrorMessage = (rawError) => {
  if (!rawError) return 'Unknown error';
  const str = String(rawError).trim();
  // Strip node internals or long file path prefixes
  const firstLine = str.split('\n')[0].replace(/^Error:\s*/i, '');
  return firstLine.length > 200 ? `${firstLine.slice(0, 197)}...` : firstLine;
};

/**
 * Single Authoritative Publishing Gate for TestForge questions.
 * Enforces the 6 required conditions:
 *  1. Title present
 *  2. Statement present
 *  3. At least one valid sample test case exists
 *  4. Reference solution exists for every enabled language
 *  5. Every configured sample test case executes successfully
 *  6. Every actual output matches its expected output
 *
 * @param {Object} params
 * @param {string|import('mongoose').Types.ObjectId} params.questionId
 * @param {Object} [params.user] - Authenticated user performing the request
 * @param {boolean} [params.dryRun] - If true, evaluates without marking status as PUBLISHED
 * @returns {Promise<Object>} Authoritative validation and publishing report
 */
export const evaluateAndPublishQuestion = async ({
  questionId,
  user = null,
  dryRun = false
}) => {
  const question = await Question.findById(questionId);
  if (!question) {
    throw ApiError.notFound('Question not found');
  }

  // Ownership verification: only owner or admin can publish
  if (user) {
    const isOwnerOrAdmin =
      !question.ownerId ||
      question.ownerId.toString() === user._id.toString() ||
      user.role === 'admin';
    if (!isOwnerOrAdmin) {
      throw ApiError.forbidden('You do not have permission to publish this question.');
    }
  }

  // Concurrency Guard: prevent concurrent publish operations on the same question
  if (question.status === PUBLISHING_STATES.VALIDATING) {
    throw ApiError.conflict('Question is currently undergoing validation. Please wait for completion.');
  }

  // Atomically lock question into VALIDATING state
  const previousStatus = question.status;
  await Question.findByIdAndUpdate(questionId, { status: PUBLISHING_STATES.VALIDATING });

  const blockingErrors = [];
  const warnings = [];
  let providerUnavailable = false;

  try {
    // 1. Title verification
    if (!question.title || !String(question.title).trim()) {
      blockingErrors.push('Question title is required.');
    }

    // 2. Problem Statement verification
    if (!question.statement || !String(question.statement).trim()) {
      blockingErrors.push('Problem statement is required.');
    }

    // 3. Metadata contract verification (detect conflicts between dataStructure and signature)
    const contract = validateMetadataContract({
      executionMode: question.executionMode,
      dataStructure: question.dataStructure,
      parameters: question.functionSignature?.parameters || [],
      returnType: question.functionSignature?.returnType || 'void'
    });
    if (!contract.isValid) {
      for (const err of contract.errors) {
        blockingErrors.push(err);
      }
    }
    for (const w of contract.warnings) {
      warnings.push(w);
    }

    // 4. Sample Test Cases verification
    const allTestCases = await TestCase.find({ questionId }).sort({ createdAt: 1 });
    const sampleTestCases = allTestCases.filter((tc) => tc.category === 'sample');

    if (sampleTestCases.length === 0) {
      blockingErrors.push('At least one valid sample test case is required.');
    }

    for (let i = 0; i < sampleTestCases.length; i++) {
      const tc = sampleTestCases[i];
      if (tc.input === undefined || tc.input === null || String(tc.input).trim() === '') {
        blockingErrors.push(`Sample Test Case #${i + 1}: Missing sample input.`);
      }
      if (tc.expectedOutput === undefined || tc.expectedOutput === null || String(tc.expectedOutput).trim() === '') {
        blockingErrors.push(`Sample Test Case #${i + 1}: Missing expected output.`);
      }
    }

    // Check constraints against sample tests (advisory warnings vs blocking real bounds)
    const parsedRules = parseConstraints(question.constraints);
    for (let i = 0; i < sampleTestCases.length; i++) {
      const tc = sampleTestCases[i];
      if (tc.input) {
        const violations = checkInputAgainstConstraints(tc.input, parsedRules);
        for (const v of violations) {
          if (typeof v === 'object' && v.isWarning) {
            warnings.push(`Sample Test Case #${i + 1}: ${v.message}`);
          } else {
            const msg = typeof v === 'string' ? v : v.message;
            blockingErrors.push(`Sample Test Case #${i + 1}: ${msg}`);
          }
        }
      }
    }

    // Non-blocking quality checks across all test cases
    const duplicateCases = detectDuplicateTestCases(allTestCases);
    if (duplicateCases.length > 0) {
      warnings.push(`${duplicateCases.length} duplicate test case(s) detected in the suite.`);
    }

    const { missingScenarios } = analyzeScenarioCoverage(allTestCases, parsedRules);
    for (const ms of missingScenarios) {
      warnings.push(ms);
    }

    // 5. Enabled Languages & Reference Solutions verification
    const enabledLanguages = (question.supportedLanguages && question.supportedLanguages.length > 0)
      ? question.supportedLanguages
      : [question.language || 'javascript'];

    const langSolutions = new Map();
    for (const lang of enabledLanguages) {
      const code = getReferenceSolutionForLanguage(question, lang);
      if (!code) {
        blockingErrors.push(`${lang} | Missing reference solution. Every enabled language must have a valid reference solution.`);
      } else {
        langSolutions.set(lang, code);
      }
    }

    // Check active execution provider health
    const activeProvider = providerRegistry.getProvider();
    if (activeProvider && typeof activeProvider.checkHealth === 'function') {
      try {
        const health = await activeProvider.checkHealth({ timeoutMs: 3000 });
        if (health && health.healthy === false) {
          providerUnavailable = true;
          blockingErrors.push(`Execution provider '${activeProvider.name || 'default'}' is offline or unavailable.`);
        }
      } catch (healthErr) {
        providerUnavailable = true;
        blockingErrors.push(`Execution provider check failed: ${healthErr.message}`);
      }
    }

    // 6. Execute Reference Solution against every configured sample test case
    let totalSampleExecutions = 0;
    let passedSampleExecutions = 0;
    let compilationPassed = true;
    let runtimePassed = true;
    let outputComparisonPassed = true;

    const languageResults = {};

    // Only proceed to execution if no fundamental static blocking errors and provider is available
    const hasStaticFatalErrors = blockingErrors.some((e) =>
      e.includes('Question title is required') ||
      e.includes('Problem statement is required') ||
      e.includes('At least one valid sample test case is required')
    );

    if (!hasStaticFatalErrors && !providerUnavailable && sampleTestCases.length > 0) {
      for (const lang of enabledLanguages) {
        const refCode = langSolutions.get(lang);
        if (!refCode) continue;

        const langReport = {
          language: lang,
          passed: true,
          total: sampleTestCases.length,
          passedCount: 0,
          failedCount: 0,
          cases: []
        };

        const questionContext = {
          title: question.title,
          tags: question.tags || [],
          language: lang,
          executionMode: question.executionMode || 'STDIN',
          dataStructure: question.dataStructure || 'ARRAY',
          functionName: question.functionName || 'solution',
          returnType: question.functionSignature?.returnType || 'void',
          parameters: question.functionSignature?.parameters || []
        };

        for (let idx = 0; idx < sampleTestCases.length; idx++) {
          const tc = sampleTestCases[idx];
          totalSampleExecutions++;

          if (!tc.input || !tc.expectedOutput) {
            langReport.failedCount++;
            langReport.passed = false;
            continue;
          }

          try {
            const execResult = await validateSingleTestCase({
              code: refCode,
              testCase: tc,
              questionContext,
              timeoutMs: 4500
            });

            if (execResult.status === 'internal_error') {
              providerUnavailable = true;
              blockingErrors.push(`${lang} | Execution provider is unavailable or offline.`);
              langReport.failedCount++;
              langReport.passed = false;
              break;
            }

            if (execResult.status === 'compilation_error' || execResult.status === 'compile_error') {
              compilationPassed = false;
              langReport.failedCount++;
              langReport.passed = false;
              const cleanErr = sanitizeTeacherErrorMessage(execResult.error);
              blockingErrors.push(`${lang} | Test Case #${idx + 1}: Compilation failed. ${cleanErr}`);
              langReport.cases.push({
                testCaseNumber: idx + 1,
                status: 'COMPILATION_ERROR',
                error: cleanErr
              });
            } else if (execResult.status === 'timeout') {
              runtimePassed = false;
              langReport.failedCount++;
              langReport.passed = false;
              blockingErrors.push(`${lang} | Test Case #${idx + 1}: Execution timed out.`);
              langReport.cases.push({
                testCaseNumber: idx + 1,
                status: 'TIMEOUT',
                error: 'Execution timed out.'
              });
            } else if (execResult.status === 'runtime_error' || execResult.status === 'memory_limit_exceeded') {
              runtimePassed = false;
              langReport.failedCount++;
              langReport.passed = false;
              const cleanErr = sanitizeTeacherErrorMessage(execResult.error);
              blockingErrors.push(`${lang} | Test Case #${idx + 1}: Runtime error. ${cleanErr}`);
              langReport.cases.push({
                testCaseNumber: idx + 1,
                status: 'RUNTIME_ERROR',
                error: cleanErr
              });
            } else if (!execResult.passed) {
              outputComparisonPassed = false;
              langReport.failedCount++;
              langReport.passed = false;
              blockingErrors.push(
                `${lang} | Test Case #${idx + 1}: Output mismatch. Expected ${tc.expectedOutput}, received ${execResult.actualOutput}.`
              );
              langReport.cases.push({
                testCaseNumber: idx + 1,
                status: 'OUTPUT_MISMATCH',
                expectedOutput: tc.expectedOutput,
                actualOutput: execResult.actualOutput
              });
            } else {
              passedSampleExecutions++;
              langReport.passedCount++;
              langReport.cases.push({
                testCaseNumber: idx + 1,
                status: 'PASS',
                actualOutput: execResult.actualOutput
              });
            }
          } catch (execErr) {
            runtimePassed = false;
            langReport.failedCount++;
            langReport.passed = false;
            const cleanErr = sanitizeTeacherErrorMessage(execErr.message);
            blockingErrors.push(`${lang} | Test Case #${idx + 1}: Execution error. ${cleanErr}`);
          }
        }

        languageResults[lang] = langReport;
        if (providerUnavailable) break;
      }
    }

    // 7. Authoritative Publishing Decision
    let finalStatus;
    let canPublish = false;

    if (providerUnavailable) {
      finalStatus = PUBLISHING_STATES.VALIDATION_UNAVAILABLE;
      canPublish = false;
    } else if (blockingErrors.length === 0 && sampleTestCases.length > 0) {
      canPublish = true;
      finalStatus = dryRun ? PUBLISHING_STATES.READY_TO_PUBLISH : PUBLISHING_STATES.PUBLISHED;
    } else {
      canPublish = false;
      finalStatus = PUBLISHING_STATES.VALIDATION_FAILED;
    }

    // 8. Teacher Validation Summary Formulation (Section 7)
    const sampleTestsPassedRatio = totalSampleExecutions > 0
      ? `${passedSampleExecutions}/${totalSampleExecutions} passed`
      : '0/0 passed';

    const teacherSummary = {
      referenceSolution: (canPublish && totalSampleExecutions > 0) ? 'Passed' : 'Failed',
      sampleTests: sampleTestsPassedRatio,
      compilation: compilationPassed ? 'Passed' : 'Failed',
      runtime: runtimePassed ? 'Passed' : 'Failed',
      outputComparison: outputComparisonPassed ? 'Passed' : 'Failed',
      warningsCount: warnings.length,
      publishing: providerUnavailable
        ? 'Unavailable'
        : (canPublish ? 'Allowed' : 'Blocked')
    };

    // 9. Atomically Persist Decision to MongoDB
    // If not dryRun, we update the question status; if validation failed, it CANNOT be marked PUBLISHED.
    const persistedStatus = dryRun
      ? (canPublish ? PUBLISHING_STATES.READY_TO_PUBLISH : (previousStatus === 'published' ? 'draft' : previousStatus))
      : finalStatus;

    question.status = persistedStatus;
    question.validationSummary = {
      referenceSolutionStatus: canPublish ? 'PASS' : 'FAIL',
      testCaseValidity: sampleTestCases.length > 0 ? 'VALID' : 'INVALID',
      expectedOutputStatus: canPublish ? 'VERIFIED' : (outputComparisonPassed ? 'UNVERIFIED' : 'MISMATCH'),
      testQualityStatus: warnings.length === 0 ? 'ADEQUATE' : 'NEEDS_IMPROVEMENT',
      publishingStatus: finalStatus,
      lastValidatedAt: new Date()
    };
    await question.save();

    return {
      canPublish,
      status: finalStatus,
      persistedStatus,
      publishingStatus: finalStatus,
      summary: teacherSummary,
      blockingErrors,
      warnings,
      metrics: {
        totalSamples: sampleTestCases.length,
        totalExecutions: totalSampleExecutions,
        passedExecutions: passedSampleExecutions,
        enabledLanguagesCount: enabledLanguages.length,
        warningsCount: warnings.length
      },
      languageResults
    };
  } catch (error) {
    // If an unhandled error occurred, revert from VALIDATING safely
    await Question.findByIdAndUpdate(questionId, {
      status: previousStatus || PUBLISHING_STATES.DRAFT
    });
    throw error;
  }
};

export default {
  PUBLISHING_STATES,
  getReferenceSolutionForLanguage,
  sanitizeTeacherErrorMessage,
  evaluateAndPublishQuestion
};

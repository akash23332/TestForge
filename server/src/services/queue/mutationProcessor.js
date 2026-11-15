import { MutationReport } from '../../models/MutationReport.js';
import { Question } from '../../models/Question.js';
import { TestCase } from '../../models/TestCase.js';
import {
  generateMutants,
  detectLanguage,
  parseInputArguments,
  compareOutputs,
  executeIsolated,
  synthesizeCandidateTests,
  calculateMutationScore
} from '../mutation.service.js';
import { computeExecutionFingerprint } from '../mutation/fingerprintService.js';
import { providerRegistry } from '../execution/providerRegistry.js';

/**
 * Processes a background mutation-testing execution job.
 * Handles partial progress checkpointing, safe retries, and distinct classification of mutant outcomes.
 * 
 * @param {import('bullmq').Job} job
 * @returns {Promise<Object>}
 */
export const processMutationJob = async (job) => {
  const { reportId, questionId, customMutants, options = {} } = job.data;

  // 1. Load MutationReport
  const report = await MutationReport.findById(reportId);
  if (!report) {
    console.warn(`[MutationProcessor] MutationReport ${reportId} not found. Aborting job.`);
    return { success: false, reason: 'Report not found' };
  }

  // Idempotency: If report is already COMPLETED, avoid re-running or duplicating work
  if (report.status === 'COMPLETED') {
    console.log(`[MutationProcessor] Report ${reportId} is already COMPLETED. Skipping duplicate execution.`);
    return { success: true, status: 'ALREADY_COMPLETED', reportId };
  }

  // 2. Mark report as RUNNING
  report.status = 'RUNNING';
  report.startedAt = report.startedAt || new Date();
  report.errorMessage = null;
  await report.save();

  try {
    // 3. Load Question
    const question = await Question.findById(questionId);
    if (!question) {
      report.status = 'FAILED';
      report.activeLock = null;
      report.errorMessage = 'Question no longer exists.';
      report.completedAt = new Date();
      await report.save();
      return { success: false, reason: 'Question not found' };
    }

    // 4. Load Test Cases
    const testCases = await TestCase.find({ questionId }).lean();
    if (!testCases || testCases.length === 0) {
      report.status = 'FAILED';
      report.activeLock = null;
      report.errorMessage = 'Question does not have any test cases configured for mutation verification.';
      report.completedAt = new Date();
      await report.save();
      return { success: false, reason: 'No test cases' };
    }

    // 5. Reference solution
    const referenceCode = question.referenceSolution || question.starterCode || '';
    if (!referenceCode.trim()) {
      report.status = 'FAILED';
      report.activeLock = null;
      report.errorMessage = 'Question does not have reference code configured for mutation testing.';
      report.completedAt = new Date();
      await report.save();
      return { success: false, reason: 'No reference code' };
    }

    const questionContext = {
      title: question.title,
      tags: question.tags || [],
      language: question.language || 'javascript',
      dataStructure: question.dataStructure || 'ARRAY',
      functionName: question.functionName || 'solution'
    };

    const lang = detectLanguage(referenceCode, questionContext);
    const activeProvider = providerRegistry.getProvider();

    // 6. Generate or use supplied mutants
    const generated = customMutants && Array.isArray(customMutants)
      ? customMutants
      : generateMutants(referenceCode, lang, options);

    report.totalMutants = generated.length;
    report.progress.total = generated.length;

    // Stamp execution specification fingerprint on report
    try {
      report.executionFingerprint = computeExecutionFingerprint(question, options);
    } catch (fpErr) {
      console.warn('[MutationProcessor] Failed to compute execution fingerprint:', fpErr.message);
    }

    if (generated.length === 0) {
      report.status = 'COMPLETED';
      report.activeLock = null;
      report.mutationScore = null;
      report.completedAt = new Date();
      await report.save();
      return { success: true, totalMutants: 0, mutationScore: null };
    }

    // 7. Checkpoint Map for safe idempotent retry after partial progress
    const evaluatedMap = new Map();
    if (report.mutants && report.mutants.length > 0) {
      for (const m of report.mutants) {
        if (m.executionStatus && m.executionStatus !== 'PENDING') {
          evaluatedMap.set(m.mutantId, m);
        }
      }
    }

    // Initialize/Update mutants list in report if empty
    if (!report.mutants || report.mutants.length === 0) {
      report.mutants = generated.map((g) => ({
        mutantId: g.id,
        operator: g.operator || 'ARITHMETIC_OPERATOR_REPLACEMENT',
        operatorType: g.operatorType || 'AOR',
        originalSnippet: g.originalSnippet || '',
        mutatedSnippet: g.mutatedSnippet || '',
        mutatedFullCode: g.mutatedFullCode || '',
        validationStatus: g.validationStatus === 'invalid' ? 'INVALID' : 'VALID',
        executionStatus: 'PENDING',
        baselineExecutionStatus: 'PENDING',
        currentClassification: 'PENDING',
        auditHistory: [],
        failureReason: null,
        equivalent: false,
        runtimeMs: 0
      }));
      await report.save();
    }

    // 8. Evaluate each mutant across test cases
    for (let i = 0; i < generated.length; i++) {
      const mutant = generated[i];
      const targetMutantEntry = report.mutants.find((m) => m.mutantId === mutant.id) || report.mutants[i];

      // If already evaluated on previous attempt/run, skip re-evaluating
      if (evaluatedMap.has(mutant.id)) {
        continue;
      }

      report.progress.currentMutant = i + 1;

      let killed = false;
      let killedByTest = null;
      let testInput = null;
      let expectedOutput = null;
      let mutantOutput = null;
      let failureReason = null;
      let execDuration = 0;
      let finalStatus = 'SURVIVED'; // Default if all test cases pass

      for (let j = 0; j < testCases.length; j++) {
        report.progress.currentTestCase = j + 1;
        const tc = testCases[j];
        const parsedArgs = parseInputArguments(tc.input);

        const res = await executeIsolated({
          code: mutant.mutatedFullCode,
          inputArgs: parsedArgs,
          language: lang,
          timeoutMs: options.timeoutMs || 2500,
          questionContext,
          provider: activeProvider
        });

        execDuration += res.runtimeMs || 0;

        // Compilation / Syntax Error
        if (res.status === 'compilation_error' || res.status === 'invalid') {
          finalStatus = 'COMPILATION_ERROR';
          failureReason = res.error || 'Compilation or syntax error occurred';
          break;
        }

        // Infrastructure internal error
        if (res.status === 'internal_error') {
          throw new Error(`[MutationProcessor] Runner infrastructure error during mutant execution: ${res.error || 'Internal error'}`);
        }

        // Timeout (infinite loop / CPU limit)
        if (res.status === 'timeout') {
          finalStatus = 'TIMEOUT';
          killed = true;
          killedByTest = `Test #${j + 1} (${tc.category || 'test'})`;
          testInput = tc.input;
          expectedOutput = String(tc.expectedOutput);
          mutantOutput = 'timeout';
          failureReason = `Execution timed out after ${res.runtimeMs || 2500}ms (infinite loop or resource exhaustion)`;
          break;
        }

        // Runtime Exception
        if (res.status === 'runtime_error') {
          finalStatus = 'RUNTIME_ERROR';
          killed = true;
          killedByTest = `Test #${j + 1} (${tc.category || 'test'})`;
          testInput = tc.input;
          expectedOutput = String(tc.expectedOutput);
          mutantOutput = res.output ? String(res.output) : 'runtime_error';
          failureReason = `Runtime exception encountered: ${res.error || 'Exception'}`;
          break;
        }

        // Output Mismatch (Killed)
        const matchesExpected = compareOutputs(res.output, tc.expectedOutput, questionContext);
        if (!matchesExpected) {
          finalStatus = 'KILLED';
          killed = true;
          killedByTest = `Test #${j + 1} (${tc.category || 'test'})`;
          testInput = tc.input;
          expectedOutput = String(tc.expectedOutput);
          mutantOutput = typeof res.output === 'object' ? JSON.stringify(res.output) : String(res.output);
          failureReason = `Output mismatch. Expected: ${tc.expectedOutput}, got: ${mutantOutput}`;
          break;
        }
      }

      // Record results for this mutant with bounded sizes to protect against document explosion
      if (targetMutantEntry) {
        targetMutantEntry.executionStatus = finalStatus;
        targetMutantEntry.baselineExecutionStatus = finalStatus;
        targetMutantEntry.currentClassification = finalStatus;
        targetMutantEntry.failureReason = failureReason
          ? String(failureReason).slice(0, 5000)
          : (finalStatus === 'SURVIVED' ? 'All test cases passed identically against this mutant.' : null);
        targetMutantEntry.killedByTest = killedByTest ? String(killedByTest).slice(0, 500) : null;
        targetMutantEntry.testInput = testInput ? String(testInput).slice(0, 5000) : null;
        targetMutantEntry.expectedOutput = expectedOutput ? String(expectedOutput).slice(0, 5000) : null;
        targetMutantEntry.mutantOutput = mutantOutput ? String(mutantOutput).slice(0, 5000) : null;
        targetMutantEntry.runtimeMs = Math.max(execDuration, 4);
      }

      // Update counters
      report.killedCount = report.mutants.filter((m) => m.executionStatus === 'KILLED').length;
      report.survivedCount = report.mutants.filter((m) => m.executionStatus === 'SURVIVED').length;
      report.equivalentCount = report.mutants.filter((m) => m.executionStatus === 'EQUIVALENT').length;
      report.compilationErrorCount = report.mutants.filter((m) => m.executionStatus === 'COMPILATION_ERROR').length;
      report.runtimeErrorCount = report.mutants.filter((m) => m.executionStatus === 'RUNTIME_ERROR').length;
      report.timeoutCount = report.mutants.filter((m) => m.executionStatus === 'TIMEOUT').length;

      report.progress.completed = i + 1;

      // Persist checkpoint after each mutant
      await report.save();

      // Update BullMQ Job Progress
      if (job && typeof job.updateProgress === 'function') {
        const percent = Math.round(((i + 1) / generated.length) * 100);
        try {
          await job.updateProgress(percent);
        } catch {}
      }
    }

    // 9. Candidate tests for surviving mutants
    const surviving = report.mutants.filter((m) => m.executionStatus === 'SURVIVED');
    if (surviving.length > 0) {
      try {
        const candidates = await synthesizeCandidateTests({
          referenceCode,
          survivingMutants: surviving.map((m) => ({
            id: m.mutantId,
            operator: m.operator,
            mutatedFullCode: m.mutatedFullCode,
            status: 'survived'
          })),
          testCases,
          questionContext
        });

        report.candidateTests = candidates.slice(0, 20).map((c) => ({
          mutantId: c.mutantId || null,
          input: String(c.input || '').slice(0, 5000),
          expectedOutput: String(c.expectedOutput || '').slice(0, 5000),
          reason: String(c.reason || 'Synthesized to kill surviving mutant').slice(0, 2000),
          verified: c.verified !== false
        }));
      } catch (synthErr) {
        console.warn(`[MutationProcessor] Candidate test synthesis non-fatal warning: ${synthErr.message}`);
      }
    }

    // 10. Calculate final score and mark COMPLETED
    // Formula: Score = Killed / (Killed + Survived) * 100
    const totalEligible = report.killedCount + report.survivedCount;
    report.mutationScore = totalEligible > 0
      ? calculateMutationScore(report.killedCount, report.survivedCount)
      : null;

    report.status = 'COMPLETED';
    report.activeLock = null;
    report.completedAt = new Date();
    await report.save();

    console.log(`[MutationProcessor] Mutation run ${reportId} finished. Score: ${report.mutationScore}%, Killed: ${report.killedCount}, Survived: ${report.survivedCount}, Invalid: ${report.compilationErrorCount}`);

    return {
      success: true,
      reportId: report._id.toString(),
      mutationScore: report.mutationScore,
      killedCount: report.killedCount,
      survivedCount: report.survivedCount,
      totalMutants: report.totalMutants
    };
  } catch (error) {
    console.error(`[MutationProcessor] Fatal error during mutation job ${job.id}: ${error.message}`);
    report.status = 'FAILED';
    report.activeLock = null;
    report.errorMessage = error.message;
    report.completedAt = new Date();
    await report.save();
    throw error;
  }
};

export default {
  processMutationJob
};

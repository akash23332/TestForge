import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { validateSingleTestCase } from './codeRunner.service.js';
import { validateMetadataContract } from './codeContract.service.js';
import { config } from '../config/env.js';
import { Question } from '../models/Question.js';
import { TestCase } from '../models/TestCase.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Computes a deterministic SHA-256 fingerprint binding:
 * - Reference solution
 * - Sample input
 * - Expected output
 * - Execution language
 * - Question execution contract (executionMode, dataStructure, functionName, functionSignature)
 */
export const computeSampleValidationFingerprint = ({
  referenceSolution = '',
  sampleInput = '',
  expectedOutput = '',
  language = 'python',
  executionMode = 'FUNCTION',
  dataStructure = 'NONE',
  functionName = 'solution',
  functionSignature = {}
} = {}) => {
  const normSol = String(referenceSolution || '').replace(/\r\n/g, '\n').trim();
  const normIn = String(sampleInput || '').replace(/\r\n/g, '\n').trim();
  const normOut = String(expectedOutput || '').replace(/\r\n/g, '\n').trim();
  const normLang = String(language || 'python').toLowerCase().trim();
  const normMode = String(executionMode || 'FUNCTION').toUpperCase().trim();
  const rawDS = String(dataStructure || '').toUpperCase().trim();
  const normDS = normMode === 'STDIN' ? 'NONE' : (rawDS && rawDS !== 'NONE' ? rawDS : 'ARRAY');
  const normFn = String(functionName || 'solution').trim();
  
  // Sort parameters deterministically
  const params = Array.isArray(functionSignature?.parameters)
    ? functionSignature.parameters.map((p) => `${p.name}:${p.type}`).sort().join(',')
    : '';
  const retType = String(functionSignature?.returnType || 'void').trim();
  const sigKey = `${params}->${retType}`;

  const payload = `${normSol}::${normIn}::${normOut}::${normLang}::${normMode}::${normDS}::${normFn}::${sigKey}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
};

/**
 * Generates an HMAC-signed validation token.
 * Binds:
 * - fingerprint (deterministic SHA-256 of code, test case, and execution contract)
 * - questionId ('draft' or persistent ObjectId)
 * - draftId (unique server-issued draft UUID for unpersisted drafts)
 * - userId (authenticated faculty owner)
 */
export const signValidationToken = ({
  fingerprint,
  questionId = 'draft',
  draftId = null,
  userId = null
} = {}) => {
  const isDraft = !questionId || String(questionId) === 'draft';
  const effectiveDraftId = isDraft ? String(draftId || crypto.randomUUID()) : null;
  return jwt.sign(
    {
      fingerprint,
      questionId: isDraft ? 'draft' : String(questionId),
      draftId: effectiveDraftId,
      userId: userId ? String(userId) : null,
      v: 1
    },
    config.jwt.secret,
    { expiresIn: '2h' }
  );
};

/**
 * Verifies a validation token against the expected fingerprint, question, draft identifier, and user.
 */
export const verifyValidationToken = (
  token,
  expectedFingerprint,
  expectedQuestionId = null,
  options = {}
) => {
  if (!token) return false;

  let qId = expectedQuestionId;
  let opts = options;
  if (expectedQuestionId && typeof expectedQuestionId === 'object' && !expectedQuestionId._bsontype) {
    if ('expectedDraftId' in expectedQuestionId || 'expectedUserId' in expectedQuestionId) {
      opts = expectedQuestionId;
      qId = null;
    }
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    if (!decoded || decoded.fingerprint !== expectedFingerprint) {
      return false;
    }

    // 1. Strict user binding check (prevent cross-teacher token theft)
    if (opts.expectedUserId && decoded.userId) {
      if (String(decoded.userId) !== String(opts.expectedUserId)) {
        return false;
      }
    }

    // 2. Strict question / draft binding check
    if (qId) {
      if (String(qId) === 'draft') {
        if (decoded.questionId !== 'draft') {
          return false;
        }
        // Strict draft-specific isolation check
        if (opts.expectedDraftId) {
          if (!decoded.draftId || String(decoded.draftId) !== String(opts.expectedDraftId)) {
            return false;
          }
        }
      } else {
        // Persisted question: draft tokens can NEVER authorize an existing persisted question
        if (decoded.questionId === 'draft') {
          return false;
        }
        if (String(decoded.questionId) !== String(qId)) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * Validates a sample test case by executing the reference solution on the server.
 * Returns authoritative compilation status, execution status, output comparison, and timing.
 */
export const validateSampleTestCase = async ({
  questionId = null,
  code,
  referenceSolution = null,
  sampleInput,
  expectedOutput,
  language = 'python',
  executionMode = 'FUNCTION',
  dataStructure = 'NONE',
  functionName = 'solution',
  functionSignature = null,
  title = 'Sample Test',
  timeoutMs = 4500,
  draftId = null,
  userId = null
} = {}) => {
  // If questionId provided, optionally load question
  let dbQuestion = null;
  if (questionId) {
    dbQuestion = await Question.findById(questionId);
  }

  const activeRefSol = referenceSolution || code || (dbQuestion ? dbQuestion.referenceSolution : '');
  const activeInput = sampleInput !== undefined ? sampleInput : '';
  const activeExpected = expectedOutput !== undefined ? expectedOutput : '';
  const activeLang = (language || (dbQuestion ? dbQuestion.language : 'python')).toLowerCase();
  const activeMode = (executionMode || (dbQuestion ? dbQuestion.executionMode : 'FUNCTION')).toUpperCase();
  const rawDS = String(dataStructure || dbQuestion?.dataStructure || '').toUpperCase().trim();
  const activeDS = activeMode === 'STDIN' ? 'NONE' : (rawDS && rawDS !== 'NONE' ? rawDS : 'ARRAY');
  const activeFn = functionName || (dbQuestion ? dbQuestion.functionName : 'solution');
  const activeSig = functionSignature || (dbQuestion ? dbQuestion.functionSignature : { parameters: [], returnType: 'void' });

  if (!activeRefSol || !activeRefSol.trim()) {
    throw ApiError.badRequest('Reference solution is required to run sample test.');
  }

  if (activeInput === undefined || activeInput === null || String(activeInput).trim() === '') {
    throw ApiError.badRequest('Sample test input is required.');
  }

  if (activeExpected === undefined || activeExpected === null || String(activeExpected).trim() === '') {
    throw ApiError.badRequest('Expected sample output is required.');
  }

  // 1. Validate metadata contract
  const contract = validateMetadataContract({
    executionMode: activeMode,
    dataStructure: activeDS,
    parameters: activeSig?.parameters || [],
    returnType: activeSig?.returnType || 'void'
  });

  if (!contract.isValid) {
    return {
      passed: false,
      status: 'contract_error',
      compilationStatus: 'Failed',
      executionStatus: 'Failed',
      outputComparisonStatus: 'Failed',
      actualOutput: null,
      expectedOutput: activeExpected,
      runtimeMs: 0,
      error: `Metadata contract invalid: ${contract.errors.join('; ')}`,
      fingerprint: null,
      draftId: null,
      validationToken: null
    };
  }

  // 2. Build test case execution payload
  const tc = {
    input: String(activeInput).trim(),
    expectedOutput: String(activeExpected).trim(),
    category: 'sample',
    visibility: 'public'
  };

  const questionContext = {
    title: title || (dbQuestion ? dbQuestion.title : 'Sample Test'),
    language: activeLang,
    executionMode: activeMode,
    dataStructure: activeDS,
    functionName: activeFn,
    returnType: activeSig?.returnType || 'void',
    parameters: activeSig?.parameters || []
  };

  // 3. Execute reference solution through hardened execution provider
  const execResult = await validateSingleTestCase({
    code: activeRefSol,
    testCase: tc,
    questionContext,
    timeoutMs
  });

  const isCompilationError = execResult.status === 'compilation_error' || execResult.status === 'compile_error';
  const isTimeout = execResult.status === 'timeout';
  const isRuntimeError = execResult.status === 'runtime_error' || execResult.status === 'memory_limit_exceeded';
  const isInternalError = execResult.status === 'internal_error';

  const compilationPassed = !isCompilationError && !isInternalError;
  const executionPassed = !isRuntimeError && !isTimeout && !isInternalError;
  const outputPassed = Boolean(execResult.passed);

  const overallPassed = compilationPassed && executionPassed && outputPassed && execResult.passed === true;

  // 4. Compute fingerprint if passed
  let fingerprint = null;
  let validationToken = null;
  let effectiveDraftId = null;

  if (overallPassed) {
    fingerprint = computeSampleValidationFingerprint({
      referenceSolution: activeRefSol,
      sampleInput: activeInput,
      expectedOutput: activeExpected,
      language: activeLang,
      executionMode: activeMode,
      dataStructure: activeDS,
      functionName: activeFn,
      functionSignature: activeSig
    });

    const isDraft = !dbQuestion || String(dbQuestion._id) === 'draft';
    // The server is strictly authoritative: always generate a fresh, unique draftId during sample validation
    effectiveDraftId = isDraft ? crypto.randomUUID() : null;

    validationToken = signValidationToken({
      fingerprint,
      questionId: dbQuestion ? dbQuestion._id : 'draft',
      draftId: effectiveDraftId,
      userId
    });

    // If persisted question exists in DB, update its sample validation fingerprint
    if (dbQuestion) {
      dbQuestion.sampleValidationFingerprint = fingerprint;
      dbQuestion.sampleValidationPassedAt = new Date();
      await dbQuestion.save();
    }
  } else if (dbQuestion) {
    // Invalidate if failed
    dbQuestion.sampleValidationFingerprint = null;
    dbQuestion.sampleValidationPassedAt = null;
    await dbQuestion.save();
  }

  let finalStatus = 'passed';
  if (isCompilationError) finalStatus = 'compilation_error';
  else if (isTimeout) finalStatus = 'timeout';
  else if (isRuntimeError) finalStatus = 'runtime_error';
  else if (isInternalError) finalStatus = 'internal_error';
  else if (!outputPassed) finalStatus = 'output_mismatch';

  return {
    passed: overallPassed,
    status: finalStatus,
    compilationStatus: compilationPassed ? 'Passed' : 'Failed',
    executionStatus: executionPassed ? 'Passed' : 'Failed',
    outputComparisonStatus: outputPassed ? 'Passed' : 'Failed',
    actualOutput: execResult.actualOutput !== undefined ? execResult.actualOutput : null,
    expectedOutput: tc.expectedOutput,
    runtimeMs: execResult.runtimeMs || 0,
    error: execResult.error || null,
    fingerprint,
    draftId: effectiveDraftId,
    validationToken
  };
};

/**
 * Authoritatively verifies whether a question has a valid, un-tampered sample test validation.
 */
export const verifyQuestionSampleValidation = async (question, validationToken = null) => {
  if (!question) {
    return { isValid: false, reason: 'Question not found' };
  }

  // Find sample test case
  let sampleTestCase = null;
  if (Array.isArray(question.examples) && question.examples.length > 0) {
    const ex = question.examples[0];
    sampleTestCase = { input: ex.input, expectedOutput: ex.output };
  } else {
    const tc = await TestCase.findOne({ questionId: question._id, category: 'sample' });
    if (tc) {
      sampleTestCase = { input: tc.input, expectedOutput: tc.expectedOutput };
    }
  }

  if (!sampleTestCase) {
    return { isValid: false, reason: 'No sample test case configured for question.' };
  }

  const currentFingerprint = computeSampleValidationFingerprint({
    referenceSolution: question.referenceSolution,
    sampleInput: sampleTestCase.input,
    expectedOutput: sampleTestCase.expectedOutput,
    language: question.language,
    executionMode: question.executionMode,
    dataStructure: question.dataStructure,
    functionName: question.functionName,
    functionSignature: question.functionSignature
  });

  // Verify against stored fingerprint on Question
  const matchesDbFingerprint =
    question.sampleValidationFingerprint &&
    question.sampleValidationFingerprint === currentFingerprint;

  // Verify against validation token if supplied
  const matchesToken = validationToken
    ? verifyValidationToken(validationToken, currentFingerprint, question._id)
    : false;

  if (matchesDbFingerprint || matchesToken) {
    return { isValid: true, fingerprint: currentFingerprint };
  }

  return {
    isValid: false,
    reason: 'Sample test case must be successfully executed and validated against the current reference solution before publishing. Modifications to code, input, or output invalidate previous validation.'
  };
};

export default {
  computeSampleValidationFingerprint,
  signValidationToken,
  verifyValidationToken,
  validateSampleTestCase,
  verifyQuestionSampleValidation
};

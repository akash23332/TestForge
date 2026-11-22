import mongoose from 'mongoose';
import crypto from 'crypto';
import { TestCase } from '../models/TestCase.js';
import { Question } from '../models/Question.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  validateQuestionSuite,
  validateSingleTest,
  acceptComputedOutput
} from '../services/testValidation.service.js';
import {
  testCaseGeneratorService,
  computeCanonicalInput,
  computeInputHash
} from '../services/ai/testCaseGenerator.service.js';
import { validateSingleTestCase } from '../services/codeRunner.service.js';

const checkQuestionOwner = (question, user) => {
  if (!user) {
    throw ApiError.unauthorized('Authentication required to inspect or manage test cases.');
  }
  if (user.role === 'admin') return;
  if (!question.ownerId) return;
  if (question.ownerId.toString() === user._id.toString()) return;

  throw ApiError.forbidden('You do not have permission to view or manage test cases for this question.');
};

export const getTestCases = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { visibility } = req.query;

    const question = await Question.findById(id).lean();
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    // Strict Zero-Leak Guard: Only owner teacher or admin can inspect private test suites
    checkQuestionOwner(question, req.user);

    const filter = { questionId: id };
    if (visibility) {
      filter.visibility = visibility;
    }

    const testCases = await TestCase.find(filter).sort('createdAt').lean();
    return ApiResponse.success(res, 200, testCases, 'Test cases retrieved');
  } catch (error) {
    next(error);
  }
};

export const createTestCase = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id);
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    checkQuestionOwner(question, req.user);

    const { input, expectedOutput, category, visibility } = req.body;

    const testCase = await TestCase.create({
      questionId: id,
      input,
      expectedOutput,
      category: category || 'normal',
      visibility: visibility || 'hidden',
      verificationStatus: 'unverified'
    });

    return ApiResponse.success(res, 201, testCase, 'Test case created successfully');
  } catch (error) {
    next(error);
  }
};

export const updateTestCase = async (req, res, next) => {
  try {
    const { id, testId } = req.params;
    const question = await Question.findById(id).lean();
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    checkQuestionOwner(question, req.user);

    const { input, expectedOutput, category, visibility } = req.body;

    const testCase = await TestCase.findOne({ _id: testId, questionId: id });
    if (!testCase) {
      throw ApiError.notFound('Test case not found');
    }

    // If input or expectedOutput changes, reset verification status to unverified
    const inputChanged = input !== undefined && input !== testCase.input;
    const expectedChanged = expectedOutput !== undefined && expectedOutput !== testCase.expectedOutput;

    if (input !== undefined) testCase.input = input;
    if (expectedOutput !== undefined) testCase.expectedOutput = expectedOutput;
    if (category !== undefined) testCase.category = category;
    if (visibility !== undefined) testCase.visibility = visibility;

    if (inputChanged || expectedChanged) {
      testCase.verificationStatus = 'unverified';
    }

    await testCase.save();

    return ApiResponse.success(res, 200, testCase, 'Test case updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteTestCase = async (req, res, next) => {
  try {
    const { id, testId } = req.params;
    const question = await Question.findById(id).lean();
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    checkQuestionOwner(question, req.user);

    const testCase = await TestCase.findOneAndDelete({ _id: testId, questionId: id });
    if (!testCase) {
      throw ApiError.notFound('Test case not found');
    }

    return ApiResponse.success(res, 200, { testId }, 'Test case deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Validates reference solution against tests using isolated VM execution.
 * Evaluates reference solution, test case validity, output matches, quality and readiness.
 */
export const validateReferenceSolution = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id);
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    checkQuestionOwner(question, req.user);

    const targetLang = (req.body?.language || question.language || 'javascript').toLowerCase();

    // Verify reference solution exists before starting
    let refCode = req.body?.code;
    if (!refCode || !refCode.trim()) {
      if (question.referenceSolutions) {
        refCode = question.referenceSolutions instanceof Map
          ? question.referenceSolutions.get(targetLang)
          : question.referenceSolutions[targetLang];
      }
      if (!refCode || !refCode.trim()) {
        if (question.language === targetLang && question.referenceSolution && question.referenceSolution.trim()) {
          refCode = question.referenceSolution;
        }
      }
    }

    if (!refCode || !refCode.trim()) {
      throw ApiError.badRequest(`Question does not have a reference solution configured for language '${targetLang}'. Missing solutions cannot be validated.`);
    }

    const suiteReport = await validateQuestionSuite({
      questionId: id,
      language: targetLang,
      user: req.user
    });

    // Update legacy question verification fields for compatibility
    const questionStatus = suiteReport.referenceSolutionStatus === 'PASS' && suiteReport.testCaseValidity === 'VALID'
      ? 'verified'
      : 'failed';

    question.isVerified = suiteReport.referenceSolutionStatus === 'PASS';
    await question.save();

    return ApiResponse.success(
      res,
      200,
      {
        questionId: id,
        ...suiteReport,
        totalTests: suiteReport.metrics.total,
        passedTests: suiteReport.metrics.passed,
        failedTests: suiteReport.metrics.failed,
        questionStatus,
        isVerified: question.isVerified,
        results: suiteReport.testCaseResults
      },
      `Validation complete: ${suiteReport.metrics.passed}/${suiteReport.metrics.total} tests passed (${suiteReport.publishingStatus})`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Validates a single test case against the question's reference solution.
 */
export const validateSingleTestCaseHandler = async (req, res, next) => {
  try {
    const { id, testId } = req.params;
    const question = await Question.findById(id).lean();
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    checkQuestionOwner(question, req.user);

    const result = await validateSingleTest({
      questionId: id,
      testId,
      language: req.body?.language,
      user: req.user
    });

    return ApiResponse.success(res, 200, result, 'Single test validation complete');
  } catch (error) {
    next(error);
  }
};

/**
 * Requires teacher approval before accepting computed reference solution output as expected output.
 */
export const acceptComputedOutputHandler = async (req, res, next) => {
  try {
    const { id, testId } = req.params;
    const question = await Question.findById(id).lean();
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    checkQuestionOwner(question, req.user);

    const result = await acceptComputedOutput({
      questionId: id,
      testId,
      user: req.user
    });

    return ApiResponse.success(res, 200, result, 'Computed output accepted as official expected output');
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieves latest question validation and quality summary.
 */
export const getValidationStatusHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id).lean();
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    checkQuestionOwner(question, req.user);

    return ApiResponse.success(
      res,
      200,
      question.validationSummary || {
        referenceSolutionStatus: 'PENDING',
        testCaseValidity: 'PENDING',
        expectedOutputStatus: 'PENDING',
        testQualityStatus: 'PENDING',
        publishingStatus: 'NOT_READY'
      },
      'Validation status retrieved'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Generates candidate test cases for a question using Google Gemini and reference solution validation.
 * Returns validated candidate test cases in memory without persisting to MongoDB.
 */
export const generateAITestCasesHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id);
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    checkQuestionOwner(question, req.user);

    // Enforce Question-controlled execution language
    const targetLang = (question.language || 'javascript').toLowerCase();
    if (req.body.language && req.body.language.toLowerCase() !== targetLang) {
      throw ApiError.badRequest(
        `Language mismatch: Question is configured for '${targetLang}', but request specified '${req.body.language}'. Execution language is strictly controlled by Question configuration.`
      );
    }

    const {
      count = 5,
      category = 'all',
      visibility = 'hidden',
      prompt = '',
      instructions = '',
      excludeInputs = []
    } = req.body;

    const targetVisibility = ['public', 'hidden'].includes(visibility) ? visibility : 'hidden';

    const result = await testCaseGeneratorService.generateCandidateTestCases({
      question,
      count: Number(count) || 5,
      category: String(category),
      visibility: targetVisibility,
      instructions: String(prompt || instructions),
      excludeInputs: Array.isArray(excludeInputs) ? excludeInputs : []
    });

    return ApiResponse.success(
      res,
      200,
      result,
      `Generated ${result.acceptedCount} candidate test cases validated against the authoritative reference solution.`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Atomically saves a batch of teacher-approved test cases.
 * - Outside transaction: re-executes all candidate inputs against authoritative reference solution,
 *   recalculates expectedOutput, validates categories/visibilities, and computes inputHash.
 * - Inside short transaction: verifies Question version has not changed, then inserts all documents atomically.
 */
export const batchSaveTestCasesHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { testCases } = req.body;

    if (!Array.isArray(testCases) || testCases.length === 0) {
      throw ApiError.badRequest('testCases array must contain at least 1 candidate test case.');
    }
    if (testCases.length > 25) {
      throw ApiError.badRequest('Batch save exceeds maximum limit of 25 test cases per request.');
    }

    const question = await Question.findById(id);
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    checkQuestionOwner(question, req.user);

    // Enforce Question-controlled execution language
    const targetLang = (question.language || 'javascript').toLowerCase();
    if (req.body.language && req.body.language.toLowerCase() !== targetLang) {
      throw ApiError.badRequest(
        `Language mismatch: Question is configured for '${targetLang}', but request specified '${req.body.language}'. Execution language is strictly controlled by Question configuration.`
      );
    }

    // Resolve authoritative reference solution
    let refCode = null;
    if (question.referenceSolutions) {
      if (question.referenceSolutions instanceof Map) {
        refCode = question.referenceSolutions.get(targetLang);
      } else if (typeof question.referenceSolutions === 'object') {
        refCode = question.referenceSolutions[targetLang];
      }
    }
    if (!refCode || !refCode.trim()) {
      if (question.language === targetLang && question.referenceSolution && question.referenceSolution.trim()) {
        refCode = question.referenceSolution;
      }
    }
    if (!refCode || !refCode.trim()) {
      throw ApiError.badRequest(
        `Question does not have an authoritative reference solution configured for language '${targetLang}'. Missing solutions cannot validate test cases.`
      );
    }

    // Capture execution snapshot
    const preExecutionFingerprint = {
      v: question.__v,
      updatedAt: question.updatedAt.getTime(),
      refSolHash: crypto.createHash('sha256').update(refCode).digest('hex')
    };

    const ALLOWED_CATEGORIES = new Set(['sample', 'normal', 'edge_case', 'boundary', 'performance', 'stress', 'standard']);
    const ALLOWED_VISIBILITY = new Set(['public', 'hidden']);

    const questionContext = {
      title: question.title,
      tags: question.tags || [],
      language: targetLang,
      executionMode: question.executionMode || 'FUNCTION',
      dataStructure: question.dataStructure || (question.executionMode === 'STDIN' ? 'NONE' : 'ARRAY'),
      functionName: question.functionName || 'solution',
      returnType: question.functionSignature?.returnType || 'void',
      parameters: question.functionSignature?.parameters || []
    };

    const docsToInsert = [];
    const batchHashes = new Set();

    // Revalidate EVERY candidate outside the database transaction
    for (let idx = 0; idx < testCases.length; idx++) {
      const item = testCases[idx];
      if (!item || typeof item !== 'object') {
        throw ApiError.badRequest(`Candidate at index ${idx} is not a valid object.`);
      }
      if (item.input === undefined || item.input === null || String(item.input).trim() === '') {
        throw ApiError.badRequest(`Candidate at index ${idx} has empty input.`);
      }

      const rawInput = String(item.input);
      const category = item.category && ALLOWED_CATEGORIES.has(item.category) ? item.category : 'standard';
      const visibility = item.visibility && ALLOWED_VISIBILITY.has(item.visibility) ? item.visibility : 'hidden';

      // Execute candidate against reference solution using compute-only contract
      const execResult = await validateSingleTestCase({
        code: refCode,
        testCase: {
          input: rawInput,
          category: 'custom'
        },
        questionContext,
        timeoutMs: 5000
      });

      if (!execResult.passed || execResult.status !== 'success' || execResult.actualOutput === null || execResult.actualOutput === undefined) {
        throw ApiError.badRequest(
          `Candidate at index ${idx} failed execution against reference solution: ${execResult.error || 'Execution did not complete successfully'}.`,
          { candidateIndex: idx, input: rawInput, runnerStatus: execResult.status }
        );
      }

      const canonicalInput = computeCanonicalInput(rawInput, question.executionMode);
      const inputHash = computeInputHash(canonicalInput);

      if (batchHashes.has(inputHash)) {
        throw ApiError.badRequest(`Duplicate candidate input detected within the same batch at index ${idx}.`);
      }
      batchHashes.add(inputHash);

      docsToInsert.push({
        questionId: question._id,
        input: rawInput,
        expectedOutput: execResult.actualOutput,
        computedOutput: execResult.actualOutput,
        category,
        visibility,
        source: 'ai_generated',
        verificationStatus: 'verified',
        lastError: null,
        inputHash
      });
    }

    // Short atomic database transaction
    let session;
    try {
      session = await mongoose.startSession();
    } catch (sessionErr) {
      throw ApiError.serviceUnavailable(
        'Database transactions are unavailable. Atomic batch persistence cannot be guaranteed.',
        { code: 'TRANSACTIONS_UNAVAILABLE' }
      );
    }

    try {
      session.startTransaction();

      const qQuery = Question.findById(id);
      const currentQ = typeof qQuery?.session === 'function'
        ? await qQuery.session(session)
        : await qQuery;
      if (!currentQ) {
        throw ApiError.notFound('Question no longer exists.');
      }
      if (currentQ.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        throw ApiError.forbidden('Question ownership changed during validation.');
      }

      const currentRef = currentQ.referenceSolutions?.get?.(targetLang) ||
        (typeof currentQ.referenceSolutions === 'object' ? currentQ.referenceSolutions[targetLang] : null) ||
        (currentQ.language === targetLang ? currentQ.referenceSolution : '') || '';
      const currentRefHash = crypto.createHash('sha256').update(currentRef).digest('hex');

      if (currentQ.__v !== preExecutionFingerprint.v || currentRefHash !== preExecutionFingerprint.refSolHash) {
        throw ApiError.conflict(
          'Question or reference solution was modified concurrently during candidate validation. Please refresh and revalidate.',
          { code: 'CONCURRENT_QUESTION_MODIFICATION' }
        );
      }

      const savedDocs = await TestCase.insertMany(docsToInsert, { session, ordered: true });
      await session.commitTransaction();

      return ApiResponse.success(res, 201, savedDocs, `${savedDocs.length} test cases saved successfully.`);
    } catch (err) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      if (err.code === 11000 || (err.name === 'MongoServerError' && err.code === 11000)) {
        throw ApiError.conflict(
          'One or more test cases in this batch already exist for this question.',
          { code: 'DUPLICATE_TEST_CASE_INPUT' }
        );
      }
      throw err;
    } finally {
      session.endSession();
    }
  } catch (error) {
    next(error);
  }
};

export default {
  getTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  validateReferenceSolution,
  validateSingleTestCaseHandler,
  acceptComputedOutputHandler,
  getValidationStatusHandler,
  generateAITestCasesHandler,
  batchSaveTestCasesHandler
};

import { TestCase } from '../models/TestCase.js';
import { Question } from '../models/Question.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  validateQuestionSuite,
  validateSingleTest,
  acceptComputedOutput
} from '../services/testValidation.service.js';

const checkQuestionOwner = (question, user) => {
  if (!user) {
    throw ApiError.unauthorized('Authentication required to inspect or manage test cases.');
  }
  if (user.role !== 'admin' && question.ownerId.toString() !== user._id.toString()) {
    throw ApiError.forbidden('You do not have permission to view or manage test cases for this question.');
  }
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

export default {
  getTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  validateReferenceSolution,
  validateSingleTestCaseHandler,
  acceptComputedOutputHandler,
  getValidationStatusHandler
};

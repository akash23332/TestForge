import { TestCase } from '../models/TestCase.js';
import { Question } from '../models/Question.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { validateSingleTestCase } from '../services/codeRunner.service.js';

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
 * Saves individual verification status back to the database.
 */
export const validateReferenceSolution = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id);
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    checkQuestionOwner(question, req.user);

    const testCases = await TestCase.find({ questionId: id }).sort('createdAt');
    if (testCases.length === 0) {
      return ApiResponse.success(
        res,
        200,
        {
          questionId: id,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          status: 'no_tests',
          results: []
        },
        'No test cases configured for this question'
      );
    }

    const refCode = question.referenceSolution || question.starterCode;
    if (!refCode || !refCode.trim()) {
      throw ApiError.badRequest('Question does not have a reference solution or starter code configured');
    }

    const questionContext = {
      title: question.title,
      tags: question.tags || [],
      language: question.language || 'javascript'
    };

    const results = [];
    let passedCount = 0;
    let failedCount = 0;

    for (const tc of testCases) {
      const execResult = await validateSingleTestCase({
        code: refCode,
        testCase: tc,
        questionContext,
        timeoutMs: 2000
      });

      // Map execution status to TestCase verificationStatus enum
      let dbStatus = 'failed';
      if (execResult.passed) {
        dbStatus = 'verified';
        passedCount++;
      } else {
        failedCount++;
      }

      tc.verificationStatus = dbStatus;
      await tc.save();

      results.push({
        testCaseId: tc._id,
        category: tc.category,
        visibility: tc.visibility,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        actualOutput: execResult.actualOutput,
        passed: execResult.passed,
        verificationStatus: dbStatus,
        error: execResult.error,
        runtimeMs: execResult.runtimeMs
      });
    }

    // Determine overall question verification status
    let questionStatus = 'unverified';
    if (failedCount === 0 && passedCount > 0) {
      questionStatus = 'verified';
    } else if (failedCount > 0) {
      questionStatus = 'failed';
    }

    question.isVerified = questionStatus === 'verified';
    question.status = questionStatus === 'verified' ? 'active' : 'draft';
    await question.save();

    return ApiResponse.success(
      res,
      200,
      {
        questionId: id,
        totalTests: testCases.length,
        passedTests: passedCount,
        failedTests: failedCount,
        questionStatus,
        isVerified: question.isVerified,
        results
      },
      `Validation complete: ${passedCount}/${testCases.length} tests passed`
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
  validateReferenceSolution
};

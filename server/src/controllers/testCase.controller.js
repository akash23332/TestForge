import { TestCase } from '../models/TestCase.js';
import { Question } from '../models/Question.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { validateSingleTestCase } from '../services/codeRunner.service.js';

export const getTestCases = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { visibility } = req.query;

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
        if (execResult.status === 'timeout') {
          dbStatus = 'timeout';
        } else if (execResult.status === 'runtime_error') {
          dbStatus = 'error';
        } else if (execResult.status === 'invalid_test') {
          dbStatus = 'invalid_test';
        } else {
          dbStatus = 'failed';
        }
      }

      // Update test case status in DB
      tc.verificationStatus = dbStatus;
      await tc.save();

      results.push({
        testCaseId: tc._id,
        category: tc.category,
        visibility: tc.visibility,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        actualOutput: execResult.actualOutput,
        status: execResult.status,
        verificationStatus: dbStatus,
        passed: execResult.passed,
        error: execResult.error,
        runtimeMs: execResult.runtimeMs
      });
    }

    const allPassed = passedCount === testCases.length;

    return ApiResponse.success(
      res,
      200,
      {
        questionId: id,
        totalTests: testCases.length,
        passedTests: passedCount,
        failedTests: failedCount,
        status: allPassed ? 'all_passed' : 'failed',
        results
      },
      allPassed
        ? 'Reference solution verified against all test cases'
        : `Validation completed with ${failedCount} failure(s)`
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

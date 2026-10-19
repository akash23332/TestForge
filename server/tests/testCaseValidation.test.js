import request from 'supertest';
import app from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import codeRunner from '../src/services/codeRunner.service.js';

describe('Test Case Studio Validation & Code Runner Engine', () => {
  let questionId = '';
  let testAId = '';
  let testBId = '';
  let testCId = '';

  beforeAll(async () => {
    await connectDatabase();

    // Find Two Sum question in database
    const twoSum = await Question.findOne({ title: /two sum/i });
    if (twoSum) {
      questionId = twoSum._id.toString();
    } else {
      // Create a test question if not found
      const newQ = await Question.create({
        title: 'Two Sum',
        slug: 'two-sum-test',
        statement: 'Find two indices that sum up to target',
        difficulty: 'easy',
        starterCode: 'function twoSum(nums, target) {}',
        referenceSolution: `function twoSum(nums, target) {
          const map = new Map();
          for (let i = 0; i < nums.length; i++) {
            const complement = target - nums[i];
            if (map.has(complement)) {
              return [map.get(complement), i];
            }
            map.set(nums[i], i);
          }
          return [];
        }`,
        category: 'arrays',
        tags: ['two sum', 'hash-table']
      });
      questionId = newQ._id.toString();
    }
  });

  afterAll(async () => {
    // Clean up temporary test cases
    if (testAId) await TestCase.findByIdAndDelete(testAId);
    if (testBId) await TestCase.findByIdAndDelete(testBId);
    if (testCId) await TestCase.findByIdAndDelete(testCId);
    await disconnectDatabase();
  });

  // --- 1. Unit tests for codeRunner service ---
  describe('codeRunner Service isolated logic', () => {
    const twoSumCode = `function twoSum(nums, target) {
      const map = new Map();
      for (let i = 0; i < nums.length; i++) {
        const complement = target - nums[i];
        if (map.has(complement)) {
          return [map.get(complement), i];
        }
        map.set(nums[i], i);
      }
      return [];
    }`;

    test('Test A: nums = [10,20,30], target = 50 -> Expected [1,2] MUST PASS', async () => {
      const res = await codeRunner.validateSingleTestCase({
        code: twoSumCode,
        testCase: {
          input: 'nums = [10, 20, 30], target = 50',
          expectedOutput: '[1, 2]'
        },
        questionContext: { title: 'Two Sum' }
      });

      expect(res.passed).toBe(true);
      expect(res.status).toBe('passed');
      expect(res.actualOutput).toBe('[1,2]');
    });

    test('Test B: nums = [10,20,30], target = 1 -> Expected [1,2] MUST FAIL (not verified)', async () => {
      const res = await codeRunner.validateSingleTestCase({
        code: twoSumCode,
        testCase: {
          input: 'nums = [10, 20, 30], target = 1',
          expectedOutput: '[1, 2]'
        },
        questionContext: { title: 'Two Sum' }
      });

      expect(res.passed).toBe(false);
      expect(res.status).toBe('failed');
      expect(res.actualOutput).toBe('[]');
      expect(res.error).toContain('Output mismatch');
    });

    test('Test C: nums = [3,3], target = 6 -> Expected [0,1] MUST PASS (duplicates)', async () => {
      const res = await codeRunner.validateSingleTestCase({
        code: twoSumCode,
        testCase: {
          input: 'nums = [3, 3], target = 6',
          expectedOutput: '[0, 1]'
        },
        questionContext: { title: 'Two Sum' }
      });

      expect(res.passed).toBe(true);
      expect(res.status).toBe('passed');
      expect(res.actualOutput).toBe('[0,1]');
    });

    test('Unordered index comparison for Two Sum: [2, 1] matches [1, 2]', () => {
      const isMatch = codeRunner.compareOutputs([1, 2], '[2, 1]', { title: 'Two Sum' });
      expect(isMatch).toBe(true);
    });

    test('Strict order enforced for non-Two-Sum questions: [2, 1] !== [1, 2]', () => {
      const isMatch = codeRunner.compareOutputs([1, 2], '[2, 1]', { title: 'Sort Array' });
      expect(isMatch).toBe(false);
    });

    test('Infinite loop triggers timeout without crashing Node process', async () => {
      const infiniteCode = 'function solution() { while(true) {} }';
      const res = await codeRunner.runCodeIsolated({
        code: infiniteCode,
        inputArgs: [],
        timeoutMs: 300
      });

      expect(res.status).toBe('timeout');
      expect(res.error).toMatch(/timed out/i);
    });

    test('Runtime exception is isolated and caught gracefully', async () => {
      const errorCode = 'function solution() { throw new Error("Custom boom"); }';
      const res = await codeRunner.runCodeIsolated({
        code: errorCode,
        inputArgs: []
      });

      expect(res.status).toBe('runtime_error');
      expect(res.error).toBe('Custom boom');
    });
  });

  // --- 2. API Endpoints: Test Case CRUD & Validation ---
  describe('Test Case REST API Endpoints', () => {
    test('POST /api/v1/questions/:id/tests should create a test case', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${questionId}/tests`)
        .send({
          input: 'nums = [10, 20, 30], target = 50',
          expectedOutput: '[1, 2]',
          category: 'normal',
          visibility: 'public'
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.verificationStatus).toBe('unverified');
      testAId = res.body.data._id;
    });

    test('Create Test B (incorrect target 1) and Test C (duplicate elements)', async () => {
      const resB = await request(app)
        .post(`/api/v1/questions/${questionId}/tests`)
        .send({
          input: 'nums = [10, 20, 30], target = 1',
          expectedOutput: '[1, 2]',
          category: 'edge_case',
          visibility: 'hidden'
        });
      expect(resB.status).toBe(201);
      testBId = resB.body.data._id;

      const resC = await request(app)
        .post(`/api/v1/questions/${questionId}/tests`)
        .send({
          input: 'nums = [3, 3], target = 6',
          expectedOutput: '[0, 1]',
          category: 'boundary',
          visibility: 'hidden'
        });
      expect(resC.status).toBe(201);
      testCId = resC.body.data._id;
    });

    test('PATCH /api/v1/questions/:id/tests/:testId should update test case', async () => {
      const res = await request(app)
        .patch(`/api/v1/questions/${questionId}/tests/${testAId}`)
        .send({
          category: 'boundary'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.category).toBe('boundary');
    });

    test('POST /api/v1/questions/:id/validate should execute reference solution and flag Test B as failed', async () => {
      const res = await request(app).post(`/api/v1/questions/${questionId}/validate`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('status');
      // Because Test B is an invalid expectation for target 1, overall status MUST be 'failed'
      expect(res.body.data.status).toBe('failed');
      expect(res.body.data.failedTests).toBeGreaterThanOrEqual(1);

      // Verify Test A passed
      const resultA = res.body.data.results.find((r) => r.testCaseId === testAId);
      expect(resultA).toBeDefined();
      expect(resultA.passed).toBe(true);
      expect(resultA.verificationStatus).toBe('verified');

      // Verify Test B failed (Crucial bug fix check!)
      const resultB = res.body.data.results.find((r) => r.testCaseId === testBId);
      expect(resultB).toBeDefined();
      expect(resultB.passed).toBe(false);
      expect(resultB.verificationStatus).toBe('failed');
      expect(resultB.actualOutput).toBe('[]');

      // Verify Test C passed
      const resultC = res.body.data.results.find((r) => r.testCaseId === testCId);
      expect(resultC).toBeDefined();
      expect(resultC.passed).toBe(true);
      expect(resultC.verificationStatus).toBe('verified');
    });

    test('Database persistence: verify Test B has verificationStatus="failed" in MongoDB', async () => {
      const docB = await TestCase.findById(testBId);
      expect(docB.verificationStatus).toBe('failed');

      const docA = await TestCase.findById(testAId);
      expect(docA.verificationStatus).toBe('verified');
    });

    test('DELETE /api/v1/questions/:id/tests/:testId should delete test case', async () => {
      // Delete Test B
      const res = await request(app).delete(`/api/v1/questions/${questionId}/tests/${testBId}`);
      expect(res.status).toBe(200);

      const deletedDoc = await TestCase.findById(testBId);
      expect(deletedDoc).toBeNull();
      testBId = null; // Mark cleaned
    });

    test('POST /api/v1/questions/:id/mutation-runs should return real mutants and candidate tests', async () => {
      const res = await request(app).post(`/api/v1/questions/${questionId}/mutation-runs`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('totalMutants');
      expect(res.body.data).toHaveProperty('mutationScore');
      expect(res.body.data.mutants.length).toBeGreaterThan(0);
      // Mutants have status killed or survived
      for (const m of res.body.data.mutants) {
        expect(['killed', 'survived']).toContain(m.status);
      }
    });
  });
});

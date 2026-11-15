import { jest, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { User } from '../src/models/User.js';
import { MutationReport } from '../src/models/MutationReport.js';
import {
  getMutationQueue,
  enqueueMutationJob,
  setRedisOfflineStatus,
  closeMutationQueue
} from '../src/services/queue/mutationQueue.js';
import { processMutationJob } from '../src/services/queue/mutationProcessor.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { mutateJavaScriptAst } from '../src/services/mutation/ast/jsMutator.js';

describe('Phase 2: Asynchronous Mutation Testing Engine & Persistent Storage', () => {
  let teacherUser;
  let otherTeacherUser;
  let studentUser;
  let adminUser;

  let teacherToken;
  let otherTeacherToken;
  let studentToken;
  let adminToken;

  let testQuestion;
  let testCases = [];

  let originalActiveProvider;
  let mockProvider;

  const signToken = (user) => {
    return jwt.sign(
      { id: user._id.toString(), email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  };

  beforeAll(async () => {
    await connectDatabase();

    // Clean up old test fixtures
    await User.deleteMany({ email: /testforge_p2_/ });
    await Question.deleteMany({ title: /P2_MUTATION_TEST/ });
    await MutationReport.deleteMany({});

    // Seed test users
    teacherUser = await User.create({
      name: 'P2 Teacher',
      email: 'testforge_p2_teacher@test.internal',
      role: 'teacher',
      passwordHash: 'dummy_hash'
    });
    teacherToken = signToken(teacherUser);

    otherTeacherUser = await User.create({
      name: 'P2 Other Teacher',
      email: 'testforge_p2_other@test.internal',
      role: 'teacher',
      passwordHash: 'dummy_hash'
    });
    otherTeacherToken = signToken(otherTeacherUser);

    studentUser = await User.create({
      name: 'P2 Student',
      email: 'testforge_p2_student@test.internal',
      role: 'student',
      passwordHash: 'dummy_hash'
    });
    studentToken = signToken(studentUser);

    adminUser = await User.create({
      name: 'P2 Admin',
      email: 'testforge_p2_admin@test.internal',
      role: 'admin',
      passwordHash: 'dummy_hash'
    });
    adminToken = signToken(adminUser);

    // Seed test question
    testQuestion = await Question.create({
      ownerId: teacherUser._id,
      title: 'P2_MUTATION_TEST: Array Pair Sum',
      statement: 'Given array and target, return true if two elements sum to target.',
      language: 'javascript',
      executionMode: 'FUNCTION',
      functionName: 'hasPairSum',
      referenceSolution: `function hasPairSum(nums, target) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) {
        return true;
      }
    }
  }
  return false;
}`
    });

    // Seed test cases
    testCases = await TestCase.create([
      {
        questionId: testQuestion._id,
        category: 'sample',
        visibility: 'public',
        input: '[1, 2, 3, 9], 8',
        expectedOutput: 'false',
        explanation: 'No pairs sum to 8'
      },
      {
        questionId: testQuestion._id,
        category: 'boundary',
        visibility: 'hidden',
        input: '[1, 2, 4, 4], 8',
        expectedOutput: 'true',
        explanation: '4 + 4 == 8'
      }
    ]);
  });

  afterAll(async () => {
    try {
      await User.deleteMany({ email: /testforge_p2_/ });
      await Question.deleteMany({ title: /P2_MUTATION_TEST/ });
      await TestCase.deleteMany({ questionId: testQuestion._id });
      await MutationReport.deleteMany({ questionId: testQuestion._id });
      await closeMutationQueue();
      await disconnectDatabase();
    } catch {}
  });

  beforeEach(() => {
    originalActiveProvider = providerRegistry.getProvider().name;
    mockProvider = {
      name: 'p2_mock_provider',
      executeCode: jest.fn().mockImplementation(async ({ code, inputArgs }) => {
        // Deterministic mock execution for testing classification
        if (code.includes('COMPILE_FAIL')) {
          return { status: 'compilation_error', error: 'SyntaxError: Unexpected token', runtimeMs: 5 };
        }
        if (code.includes('TIMEOUT_FAIL')) {
          return { status: 'timeout', error: 'Time limit exceeded', runtimeMs: 2500 };
        }
        if (code.includes('RUNTIME_FAIL')) {
          return { status: 'runtime_error', error: 'TypeError: Cannot read property of undefined', runtimeMs: 10 };
        }
        // If code has mutated operator '+ nums[j]' replaced with '- nums[j]'
        if (code.includes('nums[i] - nums[j]')) {
          return { status: 'success', output: false, runtimeMs: 8 };
        }
        // Normal reference solution output: [1,2,4,4], 8 has pair sum -> true; [1,2,3,9], 8 -> false
        const isPair = JSON.stringify(inputArgs).includes('4');
        return { status: 'success', output: isPair ? true : false, runtimeMs: 8 };
      }),
      checkHealth: jest.fn().mockResolvedValue({ healthy: true })
    };
    providerRegistry.register('p2_mock_provider', mockProvider);
    providerRegistry.setActiveProvider('p2_mock_provider');
  });

  afterEach(() => {
    if (originalActiveProvider) {
      providerRegistry.setActiveProvider(originalActiveProvider);
    }
    setRedisOfflineStatus(false);
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. MutationReport Schema, Validation & Indexes
  // =========================================================================
  describe('1. MutationReport Model Validation & Schema', () => {
    it('1.1 Creates report with default PENDING status and initial counters', async () => {
      const report = await MutationReport.create({
        questionId: testQuestion._id,
        teacherId: teacherUser._id
      });

      expect(report._id).toBeDefined();
      expect(report.status).toBe('PENDING');
      expect(report.mutationScore).toBeNull();
      expect(report.totalMutants).toBe(0);
      expect(report.killedCount).toBe(0);
      expect(report.survivedCount).toBe(0);
      expect(report.equivalentCount).toBe(0);
      expect(report.compilationErrorCount).toBe(0);
      expect(report.runtimeErrorCount).toBe(0);
      expect(report.timeoutCount).toBe(0);
      expect(report.progress.total).toBe(0);
      expect(report.progress.completed).toBe(0);
      expect(Array.isArray(report.mutants)).toBe(true);
      expect(Array.isArray(report.candidateTests)).toBe(true);
      expect(report.createdAt).toBeInstanceOf(Date);
    });

    it('1.2 Rejects report creation without required questionId or teacherId', async () => {
      await expect(MutationReport.create({ questionId: testQuestion._id })).rejects.toThrow();
      await expect(MutationReport.create({ teacherId: teacherUser._id })).rejects.toThrow();
    });

    it('1.3 Enforces distinct executionStatus enum values on mutants array', async () => {
      const report = new MutationReport({
        questionId: testQuestion._id,
        teacherId: teacherUser._id,
        mutants: [
          {
            mutantId: 'mut-1',
            operator: 'AOR',
            executionStatus: 'INVALID_STATUS_NAME'
          }
        ]
      });

      await expect(report.validate()).rejects.toThrow();
    });

    it('1.4 Compound indexes are registered in MongoDB schema', () => {
      const indexes = MutationReport.schema.indexes();
      const indexFields = indexes.map((idx) => Object.keys(idx[0]).join(','));
      expect(indexFields).toContain('questionId,createdAt');
      expect(indexFields).toContain('teacherId,createdAt');
      expect(indexFields).toContain('status,createdAt');
    });
  });

  // =========================================================================
  // 2. Queue & Idempotent Enqueue Semantics
  // =========================================================================
  describe('2. BullMQ Mutation Queue Enqueue Semantics', () => {
    it('2.1 Enqueues job with idempotent jobId mut_{reportId}', async () => {
      const reportId = new mongoose.Types.ObjectId();
      const job = await enqueueMutationJob({
        reportId,
        questionId: testQuestion._id,
        teacherId: teacherUser._id
      });

      expect(job).toBeDefined();
      expect(job.id).toBe(`mut_${reportId.toString()}`);
    });

    it('2.2 Zero leak payload: contains only IDs, no source code in payload', async () => {
      const reportId = new mongoose.Types.ObjectId();
      const job = await enqueueMutationJob({
        reportId,
        questionId: testQuestion._id,
        teacherId: teacherUser._id
      });

      expect(job.data).toHaveProperty('reportId', reportId.toString());
      expect(job.data).toHaveProperty('questionId', testQuestion._id.toString());
      expect(job.data).toHaveProperty('teacherId', teacherUser._id.toString());
      expect(job.data.code).toBeUndefined();
      expect(job.data.referenceSolution).toBeUndefined();
    });

    it('2.3 Offline guard: fails cleanly when Redis is offline', async () => {
      setRedisOfflineStatus(true);
      const reportId = new mongoose.Types.ObjectId();

      await expect(
        enqueueMutationJob({
          reportId,
          questionId: testQuestion._id,
          teacherId: teacherUser._id
        })
      ).rejects.toThrow(/Redis.*offline/i);
    });
  });

  // =========================================================================
  // 3. API Endpoints: POST /api/v1/questions/:id/mutation-runs
  // =========================================================================
  describe('3. POST /api/v1/questions/:id/mutation-runs (HTTP 202 Async Enqueue)', () => {
    it('3.1 Rejects unauthenticated caller with HTTP 401', async () => {
      const res = await request(app).post(`/api/v1/questions/${testQuestion._id}/mutation-runs`);
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('3.2 Rejects non-teacher role (student) with HTTP 403', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('3.3 Rejects unauthorized teacher accessing another teacher question with HTTP 403', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs`)
        .set('Authorization', `Bearer ${otherTeacherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error?.message || res.body.message).toMatch(/permission/i);
    });

    it('3.4 Valid teacher request creates MutationReport and returns HTTP 202 with runId', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('runId');
      expect(res.body.data.status).toBe('PENDING');

      // Verify report created in DB
      const report = await MutationReport.findById(res.body.data.runId);
      expect(report).toBeDefined();
      expect(report.status).toBe('PENDING');
      expect(report.questionId.toString()).toBe(testQuestion._id.toString());
    });

    it('3.5 Direct alias /api/questions/:id/mutation-runs also returns HTTP 202', async () => {
      // First clean up any active reports
      await MutationReport.deleteMany({ questionId: testQuestion._id });

      const res = await request(app)
        .post(`/api/questions/${testQuestion._id}/mutation-runs`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(202);
      expect(res.body.data).toHaveProperty('runId');
    });

    it('3.6 Duplicate stampede protection: returns existing active runId if already PENDING or RUNNING', async () => {
      const activeReport = await MutationReport.findOne({
        questionId: testQuestion._id,
        status: { $in: ['PENDING', 'RUNNING'] }
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(202);
      expect(res.body.data.runId).toBe(activeReport._id.toString());
      expect(res.body.data.alreadyActive).toBe(true);
    });

    it('3.7 Rejects question without reference solution with HTTP 400', async () => {
      const emptyQ = await Question.create({
        ownerId: teacherUser._id,
        title: 'P2_MUTATION_TEST: Empty Solution',
        statement: 'No code',
        language: 'javascript',
        referenceSolution: '   '
      });
      await TestCase.create({ questionId: emptyQ._id, input: '1', expectedOutput: '1' });

      const res = await request(app)
        .post(`/api/v1/questions/${emptyQ._id}/mutation-runs`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error?.message || res.body.message).toMatch(/reference code/i);

      await Question.findByIdAndDelete(emptyQ._id);
    });

    it('3.8 Rejects question without test cases with HTTP 400', async () => {
      const noTestsQ = await Question.create({
        ownerId: teacherUser._id,
        title: 'P2_MUTATION_TEST: No Tests',
        statement: 'Has code but no tests',
        language: 'javascript',
        referenceSolution: 'function solution() { return 1; }'
      });

      const res = await request(app)
        .post(`/api/v1/questions/${noTestsQ._id}/mutation-runs`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error?.message || res.body.message).toMatch(/test case/i);

      await Question.findByIdAndDelete(noTestsQ._id);
    });
  });

  // =========================================================================
  // 4. API Endpoints: GET /api/v1/questions/:id/mutation-runs/:runId
  // =========================================================================
  describe('4. GET /api/v1/questions/:id/mutation-runs/:runId', () => {
    let report;

    beforeEach(async () => {
      await MutationReport.deleteMany({ questionId: testQuestion._id });
      report = await MutationReport.create({
        questionId: testQuestion._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        mutationScore: 100,
        totalMutants: 2,
        killedCount: 2,
        survivedCount: 0,
        mutants: [
          {
            mutantId: 'mut-1',
            operator: 'AOR',
            operatorType: 'AOR',
            originalSnippet: 'a + b',
            mutatedSnippet: 'a - b',
            executionStatus: 'KILLED',
            failureReason: 'Output mismatch. Expected: true, got: false'
          }
        ]
      });
    });

    it('4.1 Rejects unauthenticated caller with HTTP 401', async () => {
      const res = await request(app).get(`/api/v1/questions/${testQuestion._id}/mutation-runs/${report._id}`);
      expect(res.status).toBe(401);
    });

    it('4.2 Rejects unauthorized teacher attempting to view another teacher report with HTTP 403', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/mutation-runs/${report._id}`)
        .set('Authorization', `Bearer ${otherTeacherToken}`);

      expect(res.status).toBe(403);
    });

    it('4.3 Allows owner teacher to retrieve full report details with HTTP 200', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/mutation-runs/${report._id}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.runId).toBe(report._id.toString());
      expect(res.body.data.mutationScore).toBe(100);
      expect(res.body.data.killedCount).toBe(2);
      expect(res.body.data.mutants[0].executionStatus).toBe('KILLED');
    });

    it('4.4 Allows admin user to inspect any report with HTTP 200', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/mutation-runs/${report._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.runId).toBe(report._id.toString());
    });

    it('4.5 Returns HTTP 404 for invalid or non-existent reportId', async () => {
      const bogusId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/mutation-runs/${bogusId}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 5. Worker & Processor Execution, Classification, and Progress
  // =========================================================================
  describe('5. Background Mutation Processor & State Classification', () => {
    it('5.1 Accurately classifies KILLED, SURVIVED, COMPILATION_ERROR, RUNTIME_ERROR, TIMEOUT', async () => {
      const report = await MutationReport.create({
        questionId: testQuestion._id,
        teacherId: teacherUser._id,
        status: 'PENDING'
      });

      // Craft 5 synthetic mutants to test every distinct outcome
      const customMutants = [
        {
          id: 'mut-kill',
          operator: 'ARITHMETIC_OPERATOR_REPLACEMENT',
          operatorType: 'AOR',
          mutatedFullCode: 'function hasPairSum() { return nums[i] - nums[j]; }',
          originalSnippet: '+',
          mutatedSnippet: '-'
        },
        {
          id: 'mut-surv',
          operator: 'RELATIONAL_OPERATOR_REPLACEMENT',
          operatorType: 'ROR',
          mutatedFullCode: testQuestion.referenceSolution, // identical behavior -> survives
          originalSnippet: '===',
          mutatedSnippet: '==='
        },
        {
          id: 'mut-comp',
          operator: 'ARITHMETIC_OPERATOR_REPLACEMENT',
          operatorType: 'AOR',
          mutatedFullCode: 'function hasPairSum() { COMPILE_FAIL }',
          originalSnippet: '+',
          mutatedSnippet: '+*'
        },
        {
          id: 'mut-time',
          operator: 'BOUNDARY_OFF_BY_ONE',
          operatorType: 'COR',
          mutatedFullCode: 'function hasPairSum() { TIMEOUT_FAIL }',
          originalSnippet: '<',
          mutatedSnippet: '<='
        },
        {
          id: 'mut-runt',
          operator: 'RETURN_VALUE_MUTATION',
          operatorType: 'RVR',
          mutatedFullCode: 'function hasPairSum() { RUNTIME_FAIL }',
          originalSnippet: 'return false',
          mutatedSnippet: 'return undefined.prop'
        }
      ];

      const mockJob = {
        id: `test_job_${report._id}`,
        data: {
          reportId: report._id.toString(),
          questionId: testQuestion._id.toString(),
          teacherId: teacherUser._id.toString(),
          customMutants
        },
        updateProgress: jest.fn().mockResolvedValue()
      };

      await processMutationJob(mockJob);

      const finished = await MutationReport.findById(report._id);
      expect(finished.status).toBe('COMPLETED');
      expect(finished.totalMutants).toBe(5);

      const killed = finished.mutants.find((m) => m.mutantId === 'mut-kill');
      const survived = finished.mutants.find((m) => m.mutantId === 'mut-surv');
      const compiled = finished.mutants.find((m) => m.mutantId === 'mut-comp');
      const timedOut = finished.mutants.find((m) => m.mutantId === 'mut-time');
      const runErr = finished.mutants.find((m) => m.mutantId === 'mut-runt');

      expect(killed.executionStatus).toBe('KILLED');
      expect(killed.failureReason).toMatch(/mismatch/i);

      expect(survived.executionStatus).toBe('SURVIVED');
      expect(survived.failureReason).toMatch(/passed identically/i);

      expect(compiled.executionStatus).toBe('COMPILATION_ERROR');
      expect(compiled.failureReason).toMatch(/syntax/i);

      expect(timedOut.executionStatus).toBe('TIMEOUT');
      expect(timedOut.failureReason).toMatch(/timed out/i);

      expect(runErr.executionStatus).toBe('RUNTIME_ERROR');
      expect(runErr.failureReason).toMatch(/exception/i);

      // Score denominator verification:
      // Killed = 1 (output mismatch)
      // Survived = 1 (survived)
      // Compilation error is excluded from denominator.
      // Score = 1 / (1 + 1) * 100 = 50.00%
      expect(finished.killedCount).toBe(1);
      expect(finished.survivedCount).toBe(1);
      expect(finished.compilationErrorCount).toBe(1);
      expect(finished.timeoutCount).toBe(1);
      expect(finished.runtimeErrorCount).toBe(1);
      expect(finished.mutationScore).toBe(50);

      // Progress updates called
      expect(mockJob.updateProgress).toHaveBeenCalled();
    });

    it('5.2 Zero eligible mutants yields mutationScore null', async () => {
      const report = await MutationReport.create({
        questionId: testQuestion._id,
        teacherId: teacherUser._id,
        status: 'PENDING'
      });

      const mockJob = {
        id: `test_job_zero_${report._id}`,
        data: {
          reportId: report._id.toString(),
          questionId: testQuestion._id.toString(),
          teacherId: teacherUser._id.toString(),
          customMutants: [
            {
              id: 'mut-only-comp-fail',
              operator: 'AOR',
              operatorType: 'AOR',
              mutatedFullCode: 'COMPILE_FAIL'
            }
          ]
        },
        updateProgress: jest.fn().mockResolvedValue()
      };

      await processMutationJob(mockJob);

      const finished = await MutationReport.findById(report._id);
      expect(finished.status).toBe('COMPLETED');
      expect(finished.killedCount).toBe(0);
      expect(finished.survivedCount).toBe(0);
      expect(finished.compilationErrorCount).toBe(1);
      expect(finished.mutationScore).toBeNull();
    });
  });

  // =========================================================================
  // 6. Idempotent Retry & Crash Resumption
  // =========================================================================
  describe('6. Idempotent Job Retries & Crash Resumption', () => {
    it('6.1 Resumes from partial progress without duplicating completed mutants', async () => {
      // Simulate partial completion: mutant-1 was completed before crash
      const report = await MutationReport.create({
        questionId: testQuestion._id,
        teacherId: teacherUser._id,
        status: 'RUNNING',
        totalMutants: 2,
        progress: { total: 2, completed: 1, currentMutant: 1, currentTestCase: 2 },
        killedCount: 1,
        mutants: [
          {
            mutantId: 'mut-1',
            operator: 'AOR',
            operatorType: 'AOR',
            mutatedFullCode: 'function hasPairSum() { return nums[i] - nums[j]; }',
            executionStatus: 'KILLED',
            failureReason: 'Killed on test 1'
          },
          {
            mutantId: 'mut-2',
            operator: 'ROR',
            operatorType: 'ROR',
            mutatedFullCode: testQuestion.referenceSolution,
            executionStatus: 'PENDING'
          }
        ]
      });

      const mockJob = {
        id: `retry_job_${report._id}`,
        data: {
          reportId: report._id.toString(),
          questionId: testQuestion._id.toString(),
          teacherId: teacherUser._id.toString(),
          customMutants: [
            {
              id: 'mut-1',
              operator: 'AOR',
              mutatedFullCode: 'function hasPairSum() { return nums[i] - nums[j]; }'
            },
            {
              id: 'mut-2',
              operator: 'ROR',
              mutatedFullCode: testQuestion.referenceSolution
            }
          ]
        },
        updateProgress: jest.fn().mockResolvedValue()
      };

      await processMutationJob(mockJob);

      const finished = await MutationReport.findById(report._id);
      expect(finished.status).toBe('COMPLETED');
      expect(finished.killedCount).toBe(1);
      expect(finished.survivedCount).toBe(1);
      expect(finished.progress.completed).toBe(2);
      expect(finished.mutants.length).toBe(2);
    });

    it('6.2 Duplicate job delivery on COMPLETED report is a safe no-op', async () => {
      const report = await MutationReport.create({
        questionId: testQuestion._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        mutationScore: 100,
        killedCount: 1
      });

      const mockJob = {
        id: `dup_job_${report._id}`,
        data: {
          reportId: report._id.toString(),
          questionId: testQuestion._id.toString()
        }
      };

      const result = await processMutationJob(mockJob);
      expect(result.status).toBe('ALREADY_COMPLETED');
    });
  });

  // =========================================================================
  // 7. ROR vs COR Overlap Resolution Regression
  // =========================================================================
  describe('7. ROR vs COR Operator Disjoint Resolution', () => {
    it('7.1 Ensures no single AST condition generates duplicate mutants under both ROR and COR', () => {
      const sampleCode = `function testCondition(a, b) {
        if (a < b) {
          return true;
        }
        for (let i = 0; i < a; i++) {
          b += i;
        }
        return false;
      }`;

      const mutants = mutateJavaScriptAst(sampleCode, { maxMutants: 10 });

      // Collect all mutated codes and verify uniqueness
      const mutatedCodes = mutants.map((m) => m.mutatedFullCode.trim());
      const uniqueCodes = new Set(mutatedCodes);
      expect(uniqueCodes.size).toBe(mutatedCodes.length);

      // Verify operator labels are disjoint
      const rorMutants = mutants.filter((m) => m.operatorType === 'ROR');
      const corMutants = mutants.filter((m) => m.operatorType === 'COR');

      for (const r of rorMutants) {
        for (const c of corMutants) {
          expect(r.mutatedFullCode.trim()).not.toBe(c.mutatedFullCode.trim());
        }
      }
    });
  });

  // =========================================================================
  // 8. Queue Mock vs Real Redis Distinction
  // =========================================================================
  describe('8. Queue Mock vs Real Redis Distinction Verification', () => {
    it('8.1 Identifies queue operating mode based on USE_REAL_REDIS environment setting', () => {
      const queue = getMutationQueue();
      const isRealRedis = Boolean(process.env.USE_REAL_REDIS);

      if (isRealRedis) {
        expect(typeof queue.add).toBe('function');
        expect(queue.constructor.name).toBe('Queue');
      } else {
        expect(typeof queue.add).toBe('function');
        // Mocked queue in test environment
        expect(queue).toHaveProperty('add');
      }
    });
  });
});

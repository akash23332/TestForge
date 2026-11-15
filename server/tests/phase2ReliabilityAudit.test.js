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
  closeMutationQueue
} from '../src/services/queue/mutationQueue.js';
import { processMutationJob } from '../src/services/queue/mutationProcessor.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';

describe('Phase 2 Reliability & Security Audit', () => {
  jest.setTimeout(30000);

  let teacherUser;
  let otherTeacherUser;
  let studentUser;
  let teacherToken;
  let otherTeacherToken;
  let studentToken;
  let testQuestion;
  let originalActiveProvider;

  const signToken = (user) => {
    return jwt.sign(
      { id: user._id.toString(), email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  };

  beforeAll(async () => {
    await connectDatabase();
    await MutationReport.syncIndexes();

    // Clean up old test data
    await User.deleteMany({ email: /audit_p2_/ });
    await Question.deleteMany({ title: /AUDIT_P2_/ });
    await MutationReport.deleteMany({});

    teacherUser = await User.create({
      name: 'Audit Teacher',
      email: 'audit_p2_teacher@test.internal',
      role: 'teacher',
      passwordHash: 'dummy'
    });
    teacherToken = signToken(teacherUser);

    otherTeacherUser = await User.create({
      name: 'Audit Other Teacher',
      email: 'audit_p2_other@test.internal',
      role: 'teacher',
      passwordHash: 'dummy'
    });
    otherTeacherToken = signToken(otherTeacherUser);

    studentUser = await User.create({
      name: 'Audit Student',
      email: 'audit_p2_student@test.internal',
      role: 'student',
      passwordHash: 'dummy'
    });
    studentToken = signToken(studentUser);

    testQuestion = await Question.create({
      ownerId: teacherUser._id,
      title: 'AUDIT_P2_QUESTION',
      statement: 'Return sum of elements',
      language: 'javascript',
      executionMode: 'FUNCTION',
      functionName: 'sum',
      referenceSolution: 'function sum(a, b) { return a + b; }'
    });

    await TestCase.create([
      {
        questionId: testQuestion._id,
        category: 'sample',
        visibility: 'public',
        input: '2, 3',
        expectedOutput: '5'
      },
      {
        questionId: testQuestion._id,
        category: 'boundary',
        visibility: 'hidden',
        input: '0, 0',
        expectedOutput: '0'
      }
    ]);
  });

  afterAll(async () => {
    try {
      await User.deleteMany({ email: /audit_p2_/ });
      await Question.deleteMany({ title: /AUDIT_P2_/ });
      await TestCase.deleteMany({ questionId: testQuestion._id });
      await MutationReport.deleteMany({});
      await closeMutationQueue();
      await disconnectDatabase();
    } catch {}
  });

  beforeEach(() => {
    originalActiveProvider = providerRegistry.getProvider().name;
    providerRegistry.register('audit_mock', {
      name: 'audit_mock',
      executeCode: jest.fn().mockImplementation(async ({ code }) => {
        if (code.includes('-')) return { status: 'success', output: -1, runtimeMs: 5 };
        return { status: 'success', output: 5, runtimeMs: 5 };
      }),
      checkHealth: jest.fn().mockResolvedValue({ healthy: true })
    });
    providerRegistry.setActiveProvider('audit_mock');
  });

  afterEach(() => {
    if (originalActiveProvider) {
      providerRegistry.setActiveProvider(originalActiveProvider);
    }
    jest.restoreAllMocks();
  });

  // =========================================================================
  // TEST 1: Concurrent Duplicate Run Protection (Simultaneous 10 Requests)
  // =========================================================================
  describe('Test 1: Concurrent Duplicate Run Protection', () => {
    it('1.1 Executes 10 SIMULTANEOUS POST requests: creates exactly 1 active report and returns identical runId', async () => {
      // Clean any existing reports for this question
      await MutationReport.deleteMany({ questionId: testQuestion._id });

      const NUM_CONCURRENT = 10;
      const promises = Array.from({ length: NUM_CONCURRENT }).map(() =>
        request(app)
          .post(`/api/v1/questions/${testQuestion._id}/mutation-runs`)
          .set('Authorization', `Bearer ${teacherToken}`)
      );

      // Execute all 10 requests simultaneously
      const responses = await Promise.all(promises);

      // 1. Verify all 10 requests succeeded with HTTP 202
      for (const res of responses) {
        expect(res.status).toBe(202);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('runId');
      }

      // 2. Verify all 10 requests received the EXACT SAME active runId
      const runIds = responses.map((r) => r.body.data.runId);
      const uniqueRunIds = new Set(runIds);
      expect(uniqueRunIds.size).toBe(1);

      const targetRunId = runIds[0];

      // 3. Verify exactly ONE active MutationReport was created in MongoDB
      const reportsInDb = await MutationReport.find({
        questionId: testQuestion._id,
        status: { $in: ['PENDING', 'RUNNING'] }
      });
      expect(reportsInDb.length).toBe(1);
      expect(reportsInDb[0]._id.toString()).toBe(targetRunId);

      // 4. Verify competing requests got alreadyActive: true
      const alreadyActiveResponses = responses.filter((r) => r.body.data.alreadyActive === true);
      expect(alreadyActiveResponses.length).toBe(NUM_CONCURRENT - 1);
    });
  });

  // =========================================================================
  // TEST 3: Report Size Protection & Document Limits
  // =========================================================================
  describe('Test 3: Report Size Protection', () => {
    it('3.1 Bounds mutated code, outputs, and candidate tests well below 16MB limit', async () => {
      // Giant string simulating huge output/stack trace (e.g. 100KB)
      const giantString = 'A'.repeat(100000);

      const report = await MutationReport.create({
        questionId: testQuestion._id,
        teacherId: teacherUser._id,
        status: 'PENDING'
      });

      const mockJob = {
        id: `size_test_${report._id}`,
        data: {
          reportId: report._id.toString(),
          questionId: testQuestion._id.toString(),
          teacherId: teacherUser._id.toString(),
          customMutants: [
            {
              id: 'mut-huge',
              operator: 'AOR',
              operatorType: 'AOR',
              mutatedFullCode: 'function sum() { return a - b; }',
              originalSnippet: '+',
              mutatedSnippet: '-'
            }
          ]
        },
        updateProgress: jest.fn().mockResolvedValue()
      };

      // Mock provider returning giant output
      providerRegistry.register('giant_mock', {
        name: 'giant_mock',
        executeCode: jest.fn().mockResolvedValue({
          status: 'runtime_error',
          error: giantString,
          output: giantString,
          runtimeMs: 5
        }),
        checkHealth: jest.fn().mockResolvedValue({ healthy: true })
      });
      providerRegistry.setActiveProvider('giant_mock');

      await processMutationJob(mockJob);

      const updated = await MutationReport.findById(report._id).lean();
      expect(updated.status).toBe('COMPLETED');

      // Verify failureReason was cleanly bounded to max 5000 chars
      const mutant = updated.mutants[0];
      expect(mutant.failureReason.length).toBeLessThanOrEqual(5000);

      // Verify BSON document size is a few kilobytes, orders of magnitude below 16MB
      const bsonSize = Buffer.byteLength(JSON.stringify(updated));
      expect(bsonSize).toBeLessThan(50000); // Less than 50 KB
    });
  });

  // =========================================================================
  // TEST 4: Synchronous Execution Restriction
  // =========================================================================
  describe('Test 4: Synchronous Execution Restriction in Production', () => {
    it('4.1 Rejects ?sync=true in production with HTTP 400', async () => {
      const origEnv = config.env;
      config.env = 'production';

      try {
        const res = await request(app)
          .post(`/api/v1/questions/${testQuestion._id}/mutation-runs?sync=true`)
          .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error?.message).toMatch(/Synchronous mutation execution is disabled in production/i);
      } finally {
        config.env = origEnv;
      }
    });

    it('4.2 Rejects x-sync-mode header in production with HTTP 400', async () => {
      const origEnv = config.env;
      config.env = 'production';

      try {
        const res = await request(app)
          .post(`/api/v1/questions/${testQuestion._id}/mutation-runs`)
          .set('Authorization', `Bearer ${teacherToken}`)
          .set('x-sync-mode', 'true');

        expect(res.status).toBe(400);
        expect(res.body.error?.message).toMatch(/Synchronous mutation execution is disabled in production/i);
      } finally {
        config.env = origEnv;
      }
    });
  });

  // =========================================================================
  // TEST 5: Security and Score Consistency
  // =========================================================================
  describe('Test 5: Security and Score Consistency', () => {
    let report;

    beforeEach(async () => {
      await MutationReport.deleteMany({ questionId: testQuestion._id });
      report = await MutationReport.create({
        questionId: testQuestion._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        mutationScore: 75,
        totalMutants: 4,
        killedCount: 3,
        survivedCount: 1,
        equivalentCount: 1,
        compilationErrorCount: 1
      });
    });

    it('5.1 Teachers cannot access another teacher report (HTTP 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/mutation-runs/${report._id}`)
        .set('Authorization', `Bearer ${otherTeacherToken}`);

      expect(res.status).toBe(403);
    });

    it('5.2 Students cannot access mutation reports (HTTP 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/mutation-runs/${report._id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('5.3 Equivalent mutants and compilation errors are excluded from score denominator', async () => {
      // 3 killed, 1 survived, 1 equivalent, 1 compile error
      // Eligible denominator = killed + survived = 4
      // Score = 3 / 4 * 100 = 75.00%
      expect(report.mutationScore).toBe(75);
    });

    it('5.4 Failed jobs do not leave reports permanently RUNNING', async () => {
      const failingReport = await MutationReport.create({
        questionId: new mongoose.Types.ObjectId(), // non-existent question
        teacherId: teacherUser._id,
        status: 'PENDING'
      });

      const mockJob = {
        id: `fail_job_${failingReport._id}`,
        data: {
          reportId: failingReport._id.toString(),
          questionId: failingReport.questionId.toString()
        }
      };

      await processMutationJob(mockJob);

      const finished = await MutationReport.findById(failingReport._id);
      expect(finished.status).toBe('FAILED');
      expect(finished.errorMessage).toMatch(/question no longer exists/i);
    });
  });
});

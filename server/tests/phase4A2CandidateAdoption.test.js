import { jest, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Question } from '../src/models/Question.js';
import { MutationReport } from '../src/models/MutationReport.js';
import { TestCase } from '../src/models/TestCase.js';
import { User } from '../src/models/User.js';
import { providerRegistry } from '../src/services/execution/ProviderRegistry.js';
import { MockExecutionProvider } from '../src/services/execution/MockExecutionProvider.js';

jest.setTimeout(60000);

describe('Phase 4A.2.2: Candidate Adoption Backend API & Transactional Workflow', () => {
  let teacherUser;
  let otherTeacherUser;
  let adminUser;
  let studentUser;

  let teacherToken;
  let otherTeacherToken;
  let adminToken;
  let studentToken;

  let testQuestion;
  let testReport;
  let candidate1;
  let candidate2;
  let mutant1;
  let mutant2;

  let mockProvider;

  const createdQuestionIds = [];
  const createdReportIds = [];
  const createdTestCaseIds = [];
  const createdUserIds = [];

  const signToken = (user) =>
    jwt.sign(
      { id: user._id.toString(), email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: '2h' }
    );

  beforeAll(async () => {
    await connectDatabase();

    // Register test mock execution provider
    mockProvider = new MockExecutionProvider();
    providerRegistry.register('adoption_mock_provider', mockProvider);
    providerRegistry.setActiveProvider('adoption_mock_provider');

    // 1. Create test users
    const timestamp = Date.now();
    const mockHash = '$2a$10$wT0lQn2U1X4W5Jc7bYv.e.7pP9Lq7F9Lq7F9Lq7F9Lq7F9Lq7F9Lq';
    teacherUser = await User.create({
      name: 'Adoption Lead Teacher',
      email: `adopt_teacher_${timestamp}@testforge.edu`,
      passwordHash: mockHash,
      role: 'teacher'
    });
    createdUserIds.push(teacherUser._id);

    otherTeacherUser = await User.create({
      name: 'Other Faculty Teacher',
      email: `other_teacher_${timestamp}@testforge.edu`,
      passwordHash: mockHash,
      role: 'teacher'
    });
    createdUserIds.push(otherTeacherUser._id);

    adminUser = await User.create({
      name: 'Platform Admin',
      email: `adopt_admin_${timestamp}@testforge.edu`,
      passwordHash: mockHash,
      role: 'admin'
    });
    createdUserIds.push(adminUser._id);

    studentUser = await User.create({
      name: 'Student Candidate',
      email: `adopt_student_${timestamp}@testforge.edu`,
      passwordHash: mockHash,
      role: 'student'
    });
    createdUserIds.push(studentUser._id);

    teacherToken = signToken(teacherUser);
    otherTeacherToken = signToken(otherTeacherUser);
    adminToken = signToken(adminUser);
    studentToken = signToken(studentUser);

    await TestCase.init();
    await Question.init();
    await MutationReport.init();
  }, 30000);

  afterAll(async () => {
    if (createdTestCaseIds.length > 0) {
      await TestCase.deleteMany({ _id: { $in: createdTestCaseIds } });
    }
    if (createdReportIds.length > 0) {
      await MutationReport.deleteMany({ _id: { $in: createdReportIds } });
    }
    if (createdQuestionIds.length > 0) {
      await Question.deleteMany({ _id: { $in: createdQuestionIds } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    mockProvider?.reset();
    await disconnectDatabase();
  }, 30000);

  beforeEach(async () => {
    mockProvider.reset();
    const timestamp = Date.now() + Math.floor(Math.random() * 100000);

    // Create Base Question with authoritative reference solution
    testQuestion = await Question.create({
      title: `Adoption Test Question ${timestamp}`,
      statement: 'Given an integer x, return x * 3.',
      inputFormat: 'Integer x',
      outputFormat: 'Integer 3*x',
      difficulty: 'Easy',
      language: 'python',
      executionMode: 'FUNCTION',
      functionName: 'triple',
      starterCode: 'def triple(x):\n    return 0',
      referenceSolution: 'def triple(x):\n    return x * 3',
      ownerId: teacherUser._id,
      status: 'published',
      examples: [{ input: '2', output: '6', explanation: '2*3=6' }]
    });
    createdQuestionIds.push(testQuestion._id);

    // Initial sample test case
    const sampleTc = await TestCase.create({
      questionId: testQuestion._id,
      input: '2',
      expectedOutput: '6',
      category: 'sample',
      visibility: 'public',
      weight: 1.0,
      verificationStatus: 'verified'
    });
    createdTestCaseIds.push(sampleTc._id);

    // Create Mutants & Candidate Tests
    candidate1 = {
      candidateId: `cand-kill-001-${timestamp}`,
      mutantId: `mutant-aor-001-${timestamp}`,
      input: '4',
      expectedOutput: '12',
      reason: 'Kills mutant returning x + 3',
      verified: true,
      adoptionStatus: 'PENDING'
    };

    candidate2 = {
      candidateId: `cand-kill-002-${timestamp}`,
      mutantId: `mutant-ror-002-${timestamp}`,
      input: '0',
      expectedOutput: '0',
      reason: 'Edge case with zero',
      verified: true,
      adoptionStatus: 'PENDING'
    };

    mutant1 = {
      mutantId: candidate1.mutantId,
      operator: 'AOR',
      operatorType: 'AOR',
      originalSnippet: 'x * 3',
      mutatedSnippet: 'x + 3',
      mutatedFullCode: 'def triple(x):\n    return x + 3',
      validationStatus: 'VALID',
      executionStatus: 'SURVIVED',
      baselineExecutionStatus: 'SURVIVED',
      currentClassification: 'SURVIVED',
      equivalent: false
    };

    mutant2 = {
      mutantId: candidate2.mutantId,
      operator: 'ROR',
      operatorType: 'ROR',
      originalSnippet: 'x * 3',
      mutatedSnippet: 'x * 2',
      mutatedFullCode: 'def triple(x):\n    return x * 2',
      validationStatus: 'VALID',
      executionStatus: 'SURVIVED',
      baselineExecutionStatus: 'SURVIVED',
      currentClassification: 'SURVIVED',
      equivalent: false
    };

    testReport = await MutationReport.create({
      questionId: testQuestion._id,
      teacherId: teacherUser._id,
      status: 'COMPLETED',
      executionFingerprint: 'fp_initial_test_hash',
      totalMutants: 2,
      killedCount: 0,
      survivedCount: 2,
      equivalentCount: 0,
      mutationScore: 0,
      mutants: [mutant1, mutant2],
      candidateTests: [candidate1, candidate2]
    });
    createdReportIds.push(testReport._id);
  });

  afterEach(async () => {
    mockProvider.reset();
    jest.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SUCCESSFUL ADOPTION (T01, T04, T05)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Successful Adoption Workflow', () => {
    it('successfully adopts an eligible candidate test case through the API', async () => {
      // Configure mock provider:
      // Ref sol (x * 3) -> 4 * 3 = 12 (matches expected)
      // Mutant (x + 3) -> 4 + 3 = 7 != 12 (mutant output mismatch -> KILLED!)
      mockProvider.setHandler(({ code }) => {
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 25 };
        }
        return { status: 'success', output: '7', runtimeMs: 20 };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          category: 'edge_case',
          visibility: 'hidden'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.adoptionStatus).toBe('ADOPTED');
      expect(res.body.data.testCase).toBeDefined();
      expect(res.body.data.testCase._id).toBeDefined();

      const createdTcId = res.body.data.testCase._id;
      createdTestCaseIds.push(createdTcId);

      // Verify TestCase in database
      const dbTestCase = await TestCase.findById(createdTcId);
      expect(dbTestCase).toBeDefined();
      expect(dbTestCase.questionId.toString()).toBe(testQuestion._id.toString());
      expect(dbTestCase.sourceReportId.toString()).toBe(testReport._id.toString());
      expect(dbTestCase.sourceCandidateId).toBe(candidate1.candidateId);
      expect(dbTestCase.input).toBe(candidate1.input);
      expect(dbTestCase.expectedOutput).toBe(candidate1.expectedOutput);
      expect(dbTestCase.visibility).toBe('hidden');
      expect(dbTestCase.category).toBe('edge_case');
      expect(dbTestCase.verificationStatus).toBe('verified');

      // Verify MutationReport candidate lifecycle metadata
      const updatedReport = await MutationReport.findById(testReport._id);
      const adoptedCand = updatedReport.candidateTests.find((c) => c.candidateId === candidate1.candidateId);
      expect(adoptedCand.adoptionStatus).toBe('ADOPTED');
      expect(adoptedCand.adoptedTestCaseId.toString()).toBe(createdTcId.toString());
      expect(adoptedCand.adoptedBy.toString()).toBe(teacherUser._id.toString());
      expect(adoptedCand.adoptedAt).toBeDefined();
      expect(adoptedCand.adoptionOperationId).toBeDefined();
      expect(adoptedCand.verified).toBe(true);

      // Verify Question adoptionLock was released
      const updatedQuestion = await Question.findById(testQuestion._id);
      expect(updatedQuestion.adoptionLock).toBeNull();
    });

    it('successfully adopts when candidate kills mutant via runtime failure (crash)', async () => {
      mockProvider.setHandler(({ code }) => {
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 25 };
        }
        return { status: 'runtime_error', error: 'ZeroDivisionError: division by zero', output: null, runtimeMs: 15 };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.adoptionStatus).toBe('ADOPTED');
      createdTestCaseIds.push(res.body.data.testCase._id);

      const q = await Question.findById(testQuestion._id);
      expect(q.adoptionLock).toBeNull();
    });

    it('successfully adopts when candidate kills mutant via execution timeout', async () => {
      mockProvider.setHandler(({ code }) => {
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 25 };
        }
        return { status: 'timeout', error: 'Execution timed out', output: null, runtimeMs: 4000 };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.adoptionStatus).toBe('ADOPTED');
      createdTestCaseIds.push(res.body.data.testCase._id);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. REFERENCE SOLUTION VERIFICATION FAILURE (T02, T03)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Reference Solution Verification Failures', () => {
    it('rejects adoption with 400 UNVERIFIED_CANDIDATE when candidate fails on reference solution', async () => {
      mockProvider.setHandler(({ code }) => {
        // Ref sol produces mismatch output '10' != '12'
        return { status: 'success', output: '10', runtimeMs: 20 };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNVERIFIED_CANDIDATE');

      // Verify zero writes
      const tc = await TestCase.findOne({ sourceCandidateId: candidate1.candidateId });
      expect(tc).toBeNull();

      // Verify report was not updated
      const rep = await MutationReport.findById(testReport._id);
      expect(rep.candidateTests.find((c) => c.candidateId === candidate1.candidateId).adoptionStatus).toBe('PENDING');

      // Verify lock was released in finally block
      const q = await Question.findById(testQuestion._id);
      expect(q.adoptionLock).toBeNull();
    });

    it('rejects adoption with 400 when Question lacks an authoritative reference solution', async () => {
      await Question.findByIdAndUpdate(testQuestion._id, { referenceSolution: '' });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_AUTHORITATIVE_REFERENCE_SOLUTION');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. MUTANT SURVIVES CANDIDATE (T07)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Mutant Survives Verification', () => {
    it('rejects adoption with 422 CANDIDATE_DOES_NOT_KILL_MUTANT when mutant passes candidate test', async () => {
      mockProvider.setHandler(({ code }) => {
        // Both reference solution and mutant produce '12' -> Mutant SURVIVED!
        return { status: 'success', output: '12', runtimeMs: 20 };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CANDIDATE_DOES_NOT_KILL_MUTANT');

      // Zero writes
      const tc = await TestCase.findOne({ sourceCandidateId: candidate1.candidateId });
      expect(tc).toBeNull();

      // Lock released
      const q = await Question.findById(testQuestion._id);
      expect(q.adoptionLock).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. MUTANT COMPILATION AND INFRASTRUCTURE ERRORS (T08, T09)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Mutant Compilation & Infrastructure Errors', () => {
    it('rejects adoption with 422 MUTANT_COMPILATION_ERROR when mutant fails compilation', async () => {
      mockProvider.setHandler(({ code }) => {
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 20 };
        }
        return { status: 'compilation_error', error: 'SyntaxError: invalid syntax', output: null };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('MUTANT_COMPILATION_ERROR');

      const q = await Question.findById(testQuestion._id);
      expect(q.adoptionLock).toBeNull();
    });

    it('rejects adoption with 503 MUTANT_VERIFICATION_INCONCLUSIVE on provider failure', async () => {
      mockProvider.setHandler(({ code }) => {
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 20 };
        }
        return { status: 'internal_error', error: 'Runner disconnected', output: null };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('MUTANT_VERIFICATION_INCONCLUSIVE');

      const q = await Question.findById(testQuestion._id);
      expect(q.adoptionLock).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. EQUIVALENT MUTANT REJECTION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Equivalent Mutant Rejection', () => {
    it('rejects adoption with 400 when target mutant is classified as EQUIVALENT', async () => {
      // Mark mutant1 as EQUIVALENT in MutationReport
      await MutationReport.updateOne(
        { _id: testReport._id, 'mutants.mutantId': candidate1.mutantId },
        {
          $set: {
            'mutants.$.equivalent': true,
            'mutants.$.currentClassification': 'EQUIVALENT'
          }
        }
      );

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EQUIVALENT_MUTANT_CANNOT_BE_ADOPTED');

      // Zero writes
      const tc = await TestCase.findOne({ sourceCandidateId: candidate1.candidateId });
      expect(tc).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. DUPLICATE ADOPTION & IDEMPOTENCY (T21, T27)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('6. Duplicate Adoption & Idempotency', () => {
    it('returns 200 alreadyAdopted when client resends adoption for already adopted candidate', async () => {
      mockProvider.setHandler(({ code }) => {
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 20 };
        }
        return { status: 'success', output: '7', runtimeMs: 20 };
      });

      const firstRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(firstRes.status).toBe(201);
      const firstTcId = firstRes.body.data.testCase._id;
      createdTestCaseIds.push(firstTcId);

      // Second attempt on the same candidate
      const secondRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.alreadyAdopted).toBe(true);
      expect(secondRes.body.data.testCaseId.toString()).toBe(firstTcId.toString());

      // Exactly ONE test case exists in database
      const allMatches = await TestCase.find({ sourceCandidateId: candidate1.candidateId });
      expect(allMatches.length).toBe(1);
    });

    it('rejects adoption with 409 DUPLICATE_TESTCASE if question already has identical input & output', async () => {
      // Create duplicate test case directly
      const dupTc = await TestCase.create({
        questionId: testQuestion._id,
        input: candidate1.input,
        expectedOutput: candidate1.expectedOutput,
        category: 'edge_case',
        visibility: 'hidden'
      });
      createdTestCaseIds.push(dupTc._id);

      mockProvider.setHandler(({ code }) => {
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 20 };
        }
        return { status: 'success', output: '7', runtimeMs: 20 };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_TESTCASE');

      const q = await Question.findById(testQuestion._id);
      expect(q.adoptionLock).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. CONCURRENT ADOPTION ATTEMPTS & LOCKING (T11, T12)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('7. Concurrency & Adoption Lease Locking', () => {
    it('rejects a second adoption attempt with 409 QUESTION_LOCKED_BY_ADOPTION when question is locked', async () => {
      // Manually set an active lock on the question
      await Question.findByIdAndUpdate(testQuestion._id, {
        adoptionLock: {
          lockToken: 'active-token-111',
          operationId: 'active-op-111',
          reportId: testReport._id,
          candidateId: candidate1.candidateId,
          acquiredBy: teacherUser._id,
          acquiredAt: new Date(),
          expiresAt: new Date(Date.now() + 25000),
          lastHeartbeat: new Date()
        }
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate2.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('QUESTION_LOCKED_BY_ADOPTION');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. EXPIRED LOCK RECOVERY & STALE LOCK ISOLATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('8. Expired Lock Recovery & Stale Lock Isolation', () => {
    it('safely reclaims an expired adoptionLock from a previous abandoned worker', async () => {
      // Set an EXPIRED lock (expired 10 seconds ago)
      await Question.findByIdAndUpdate(testQuestion._id, {
        adoptionLock: {
          lockToken: 'stale-token-999',
          operationId: 'stale-op-999',
          reportId: testReport._id,
          candidateId: 'old-abandoned-cand',
          acquiredBy: otherTeacherUser._id,
          acquiredAt: new Date(Date.now() - 40000),
          expiresAt: new Date(Date.now() - 10000),
          lastHeartbeat: new Date(Date.now() - 40000)
        }
      });

      mockProvider.setHandler(({ code }) => {
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 20 };
        }
        return { status: 'success', output: '7', runtimeMs: 20 };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.adoptionStatus).toBe('ADOPTED');
      createdTestCaseIds.push(res.body.data.testCase._id);

      const q = await Question.findById(testQuestion._id);
      expect(q.adoptionLock).toBeNull();
    });

    it('asserts that a stale worker cannot release a newly acquired lock with a different token', async () => {
      // Worker 2 owns the lock with token 'worker-2-token'
      await Question.findByIdAndUpdate(testQuestion._id, {
        adoptionLock: {
          lockToken: 'worker-2-token',
          operationId: 'worker-2-op',
          reportId: testReport._id,
          candidateId: candidate2.candidateId,
          acquiredBy: teacherUser._id,
          acquiredAt: new Date(),
          expiresAt: new Date(Date.now() + 30000),
          lastHeartbeat: new Date()
        }
      });

      // Worker 1 attempts to release using old 'worker-1-token'
      const releaseAttempt = await Question.updateOne(
        {
          _id: testQuestion._id,
          'adoptionLock.lockToken': 'stale-worker-1-token',
          'adoptionLock.operationId': 'stale-worker-1-op'
        },
        { $set: { adoptionLock: null } }
      );

      expect(releaseAttempt.matchedCount).toBe(0);

      // Verify Worker 2's lock is completely untouched
      const q = await Question.findById(testQuestion._id);
      expect(q.adoptionLock.lockToken).toBe('worker-2-token');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. TRANSACTION ROLLBACK & WRITE FENCING (T14, T25)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('9. Transaction Rollback & Write Fencing', () => {
    it('aborts transaction and rolls back when Question version changes (concurrent edit)', async () => {
      let callCount = 0;
      mockProvider.setHandler(async ({ code }) => {
        callCount++;
        if (callCount === 2) {
          // Mutate Question document during mutant verification before transaction entry
          await Question.findByIdAndUpdate(testQuestion._id, { $inc: { __v: 1 } });
        }
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 20 };
        }
        return { status: 'success', output: '7', runtimeMs: 20 };
      });

      // Wait a moment for the mutation in callCount === 2 to trigger
      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONCURRENT_MODIFICATION');

      // Verify zero test cases created
      const tc = await TestCase.findOne({ sourceCandidateId: candidate1.candidateId });
      expect(tc).toBeNull();

      // Verify candidate remains PENDING
      const rep = await MutationReport.findById(testReport._id);
      expect(rep.candidateTests.find((c) => c.candidateId === candidate1.candidateId).adoptionStatus).toBe('PENDING');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. TEACHER OWNERSHIP AND AUTHORIZATION (T23, T24)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('10. Teacher Ownership & Authorization', () => {
    it('rejects adoption with 403 FORBIDDEN when requested by non-owner teacher', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${otherTeacherToken}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it('allows platform admin to adopt candidate on any teacher question', async () => {
      mockProvider.setHandler(({ code }) => {
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 20 };
        }
        return { status: 'success', output: '7', runtimeMs: 20 };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.adoptionStatus).toBe('ADOPTED');
      createdTestCaseIds.push(res.body.data.testCase._id);
    });

    it('rejects adoption with 400 when MutationReport belongs to a different Question', async () => {
      // Create a second question
      const otherQ = await Question.create({
        title: `Other Question ${Date.now()}`,
        statement: 'Statement text',
        difficulty: 'Easy',
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'solution',
        referenceSolution: 'def solution(): pass',
        ownerId: teacherUser._id,
        status: 'published'
      });
      createdQuestionIds.push(otherQ._id);

      const res = await request(app)
        .post(`/api/v1/questions/${otherQ._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REPORT_QUESTION_BINDING');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. CANDIDATE REJECTION WORKFLOW
  // ─────────────────────────────────────────────────────────────────────────────
  describe('11. Candidate Rejection Workflow', () => {
    it('successfully rejects an eligible candidate test case with rejectionReason and persists metadata', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate2.candidateId}/reject`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          rejectionReason: 'Input is redundant with existing test cases'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.adoptionStatus).toBe('REJECTED');
      expect(res.body.data.rejectionReason).toBe('Input is redundant with existing test cases');
      expect(res.body.data.alreadyRejected).toBe(false);

      // Verify MutationReport in database
      const rep = await MutationReport.findById(testReport._id);
      const cand = rep.candidateTests.find((c) => c.candidateId === candidate2.candidateId);
      expect(cand.adoptionStatus).toBe('REJECTED');
      expect(cand.rejectionReason).toBe('Input is redundant with existing test cases');
      expect(cand.reason).toBe('Input is redundant with existing test cases');
      expect(cand.rejectedAt).toBeDefined();
      expect(cand.rejectedBy.toString()).toBe(teacherUser._id.toString());
    });

    it('supports backward-compatible reason property and persists rejectionReason', async () => {
      // Create a temporary candidate on testReport to test backward compatibility
      const tempCandidateId = 'cand-legacy-reason-test';
      await MutationReport.updateOne(
        { _id: testReport._id },
        {
          $push: {
            candidateTests: {
              candidateId: tempCandidateId,
              mutantId: mutant1.mutantId,
              input: '42',
              expectedOutput: '84',
              reason: 'Generated candidate',
              adoptionStatus: 'PENDING'
            }
          }
        }
      );

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${tempCandidateId}/reject`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          reason: 'Legacy reason parameter'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.rejectionReason).toBe('Legacy reason parameter');

      const rep = await MutationReport.findById(testReport._id);
      const cand = rep.candidateTests.find((c) => c.candidateId === tempCandidateId);
      expect(cand.adoptionStatus).toBe('REJECTED');
      expect(cand.rejectionReason).toBe('Legacy reason parameter');
      expect(cand.rejectedBy.toString()).toBe(teacherUser._id.toString());
    });

    it('is idempotent when candidate is already rejected', async () => {
      // Mark candidate2 as REJECTED directly
      await MutationReport.updateOne(
        { _id: testReport._id, 'candidateTests.candidateId': candidate2.candidateId },
        { $set: { 'candidateTests.$.adoptionStatus': 'REJECTED' } }
      );

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate2.candidateId}/reject`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.alreadyRejected).toBe(true);
      expect(res.body.data.adoptionStatus).toBe('REJECTED');
    });

    it('blocks rejecting a candidate that has already been adopted', async () => {
      mockProvider.setHandler(({ code }) => {
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 20 };
        }
        return { status: 'success', output: '7', runtimeMs: 20 };
      });

      const adoptRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(adoptRes.status).toBe(201);
      createdTestCaseIds.push(adoptRes.body.data.testCase._id);

      // Now attempt to reject candidate1
      const rejectRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/reject`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(rejectRes.status).toBe(400);
      expect(rejectRes.body.error.code).toBe('CANDIDATE_ALREADY_ADOPTED');
    });

    it('blocks adopting a candidate that has been rejected', async () => {
      // First reject candidate2
      await MutationReport.updateOne(
        { _id: testReport._id, 'candidateTests.candidateId': candidate2.candidateId },
        { $set: { 'candidateTests.$.adoptionStatus': 'REJECTED' } }
      );

      // Now attempt to adopt candidate2
      const adoptRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate2.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(adoptRes.status).toBe(400);
      expect(adoptRes.body.error.code).toBe('CANDIDATE_ALREADY_REJECTED');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. STUDENT DATA-LEAK PREVENTION (T26)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('12. Student API Confidentiality & Data-Leak Prevention', () => {
    it('never leaks adopted test cases or reference solution to student views', async () => {
      mockProvider.setHandler(({ code }) => {
        if (code.includes('x * 3')) {
          return { status: 'success', output: '12', runtimeMs: 20 };
        }
        return { status: 'success', output: '7', runtimeMs: 20 };
      });

      const adoptRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ visibility: 'hidden' });

      expect(adoptRes.status).toBe(201);
      createdTestCaseIds.push(adoptRes.body.data.testCase._id);

      // Student calls GET /questions/:id
      const studentRes = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(studentRes.status).toBe(200);
      // Student view must NEVER have referenceSolution
      expect(studentRes.body.data.referenceSolution).toBeUndefined();
      expect(studentRes.body.data.referenceSolutions).toBeUndefined();
      expect(studentRes.body.data.adoptionLock).toBeUndefined();

      // Student calls GET /questions/:id/student-view
      const previewRes = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/student-view`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.referenceSolution).toBeUndefined();
      // Public tests should only contain sample test, NEVER hidden adopted test
      const returnedTests = previewRes.body.data.publicTestCases;
      expect(returnedTests.every((t) => t.category === 'sample')).toBe(true);
      expect(returnedTests.some((t) => t.input === candidate1.input)).toBe(false);

      // Student calls GET /questions/:id/tests -> blocked with 403
      const testsRes = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/tests`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(testsRes.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. REGRESSIONS CHECK (T29, T30)
  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  // 14. API INTEGRITY & PROVENANCE HARDENING (Audit Verification)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('14. API Integrity & Provenance Hardening', () => {
    it('rejects candidate adoption when client-supplied input alters candidate input (provenance defense)', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ input: '999999' }); // Different from candidate1.input ('4')

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANDIDATE_INPUT_MODIFIED');
    });

    it('independently calculates expectedOutput via reference solution and does not trust client output', async () => {
      // If client attempts to spoof expected output
      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ input: candidate1.input, expectedOutput: 'wrong_spoofed_output' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNVERIFIED_CANDIDATE');
    });

    it('returns 503 when reference solution execution experiences infrastructure failure', async () => {
      mockProvider.setHandler(() => {
        return { status: 'internal_error', output: null, error: 'Sandbox cluster unreachable' };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('REFERENCE_VERIFICATION_INCONCLUSIVE');
    });
  });
});

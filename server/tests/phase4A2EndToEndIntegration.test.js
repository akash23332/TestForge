import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
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

jest.setTimeout(90000);

describe('Phase 4A.2.4: End-to-End Integration & Final Hardening Test Suite', () => {
  let primaryTeacher;
  let unauthorizedTeacher;
  let platformAdmin;
  let studentUser;

  let teacherToken;
  let unauthorizedTeacherToken;
  let adminToken;
  let studentToken;

  let testQuestion;
  let testReport;
  let candidate1;
  let candidate2;
  let candidate3;
  let mutant1;
  let mutant2;
  let equivalentMutant;

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

    // Register deterministic mock execution provider
    mockProvider = new MockExecutionProvider();
    providerRegistry.register('e2e_mock_provider', mockProvider);
    providerRegistry.setActiveProvider('e2e_mock_provider');

    const timestamp = Date.now();
    const mockHash = '$2a$10$wT0lQn2U1X4W5Jc7bYv.e.7pP9Lq7F9Lq7F9Lq7F9Lq7F9Lq7F9Lq';

    primaryTeacher = await User.create({
      name: 'E2E Lead Teacher',
      email: `e2e_lead_${timestamp}@testforge.edu`,
      passwordHash: mockHash,
      role: 'teacher'
    });
    createdUserIds.push(primaryTeacher._id);

    unauthorizedTeacher = await User.create({
      name: 'Unauthorized Teacher',
      email: `e2e_unauth_${timestamp}@testforge.edu`,
      passwordHash: mockHash,
      role: 'teacher'
    });
    createdUserIds.push(unauthorizedTeacher._id);

    platformAdmin = await User.create({
      name: 'E2E Platform Admin',
      email: `e2e_admin_${timestamp}@testforge.edu`,
      passwordHash: mockHash,
      role: 'admin'
    });
    createdUserIds.push(platformAdmin._id);

    studentUser = await User.create({
      name: 'E2E Enrolled Student',
      email: `e2e_student_${timestamp}@testforge.edu`,
      passwordHash: mockHash,
      role: 'student'
    });
    createdUserIds.push(studentUser._id);

    teacherToken = signToken(primaryTeacher);
    unauthorizedTeacherToken = signToken(unauthorizedTeacher);
    adminToken = signToken(platformAdmin);
    studentToken = signToken(studentUser);

    await TestCase.init();
    await Question.init();
    await MutationReport.init();
  }, 30000);

  afterAll(async () => {
    try {
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
    } finally {
      await disconnectDatabase();
    }
  }, 30000);

  beforeEach(async () => {
    // Standard mock execution handler:
    // Reference solution produces correct output "8" for input "4" (code: x * 2)
    // Mutant 1 (AOR: x + 2) produces output "6" (killed)
    // Mutant 2 (ROR: x > 2) produces output "1" (killed)
    mockProvider.setHandler(({ code }) => {
      if (code.includes('x + 2')) {
        return { status: 'success', output: '6', runtimeMs: 15 };
      }
      if (code.includes('x > 2')) {
        return { status: 'success', output: '1', runtimeMs: 15 };
      }
      // Reference solution (x * 2)
      return { status: 'success', output: '8', runtimeMs: 15 };
    });

    const timestamp = Date.now();
    testQuestion = await Question.create({
      title: `E2E Hardening Question ${timestamp}`,
      statement: 'Given integer x, return x * 2',
      description: 'Given integer x, return x * 2',
      inputFormat: 'Integer x',
      outputFormat: 'Integer 2*x',
      difficulty: 'Easy',
      language: 'javascript',
      executionMode: 'FUNCTION',
      functionName: 'solve',
      functionSignature: {
        parameters: [{ name: 'x', type: 'integer' }],
        returnType: 'integer'
      },
      referenceSolution: 'function solve(x) { return x * 2; }',
      starterCode: 'function solve(x) { // TODO }',
      ownerId: primaryTeacher._id,
      status: 'DRAFT',
      sampleValidationFingerprint: 'mock-fp-hardened-12345',
      examples: [{ input: '2', output: '4', explanation: '2*2=4' }]
    });
    createdQuestionIds.push(testQuestion._id);

    // Initial sample test case
    const sampleTc = await TestCase.create({
      questionId: testQuestion._id,
      input: '2',
      expectedOutput: '4',
      category: 'sample',
      visibility: 'public',
      weight: 1.0,
      verificationStatus: 'verified'
    });
    createdTestCaseIds.push(sampleTc._id);

    mutant1 = {
      mutantId: `mut-aor-${timestamp}`,
      operator: 'AOR',
      operatorType: 'AOR',
      originalSnippet: 'x * 2',
      mutatedSnippet: 'x + 2',
      mutatedFullCode: 'function solve(x) { return x + 2; }',
      validationStatus: 'VALID',
      executionStatus: 'SURVIVED',
      equivalent: false,
      currentClassification: 'SURVIVED'
    };

    mutant2 = {
      mutantId: `mut-ror-${timestamp}`,
      operator: 'ROR',
      operatorType: 'ROR',
      originalSnippet: 'x * 2',
      mutatedSnippet: 'x > 2',
      mutatedFullCode: 'function solve(x) { return x > 2; }',
      validationStatus: 'VALID',
      executionStatus: 'SURVIVED',
      equivalent: false,
      currentClassification: 'SURVIVED'
    };

    equivalentMutant = {
      mutantId: `mut-eq-${timestamp}`,
      operator: 'AOR',
      operatorType: 'AOR',
      originalSnippet: 'x * 2',
      mutatedSnippet: 'x * 2 + 0',
      mutatedFullCode: 'function solve(x) { return x * 2 + 0; }',
      validationStatus: 'VALID',
      executionStatus: 'SURVIVED',
      equivalent: true,
      currentClassification: 'EQUIVALENT'
    };

    candidate1 = {
      candidateId: `cand-adopt-${timestamp}`,
      mutantId: mutant1.mutantId,
      input: '4',
      expectedOutput: '8',
      reason: 'Kills AOR mutant with input 4',
      verified: true,
      adoptionStatus: 'PENDING'
    };

    candidate2 = {
      candidateId: `cand-reject-${timestamp}`,
      mutantId: mutant2.mutantId,
      input: '5',
      expectedOutput: '10',
      reason: 'Kills ROR mutant with input 5',
      verified: true,
      adoptionStatus: 'PENDING'
    };

    candidate3 = {
      candidateId: `cand-equiv-${timestamp}`,
      mutantId: equivalentMutant.mutantId,
      input: '6',
      expectedOutput: '12',
      reason: 'Synthesized for equivalent mutant',
      verified: true,
      adoptionStatus: 'PENDING'
    };

    testReport = await MutationReport.create({
      questionId: testQuestion._id,
      teacherId: primaryTeacher._id,
      status: 'COMPLETED',
      totalMutants: 3,
      killedMutants: 0,
      survivedMutants: 3,
      mutationScore: 0,
      mutants: [mutant1, mutant2, equivalentMutant],
      candidateTests: [candidate1, candidate2, candidate3],
      auditTrail: []
    });
    createdReportIds.push(testReport._id);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. COMPLETE TEACHER END-TO-END WORKFLOW
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Complete Teacher End-to-End Workflow', () => {
    it('executes full workflow: view report -> adopt candidate -> view in TestCase Studio -> reject second candidate -> verify persistence on refresh', async () => {
      // Step 1: Open completed Mutation Report
      const getReportRes = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(getReportRes.status).toBe(200);
      expect(getReportRes.body.data.status).toBe('COMPLETED');
      expect(getReportRes.body.data.candidateTests.length).toBe(3);

      // Step 2 & 3: Inspect candidate input, expected output, and mutant information
      const targetCandidate = getReportRes.body.data.candidateTests.find(
        (c) => c.candidateId === candidate1.candidateId
      );
      expect(targetCandidate.input).toBe('4');
      expect(targetCandidate.expectedOutput).toBe('8');
      expect(targetCandidate.adoptionStatus).toBe('PENDING');

      // Step 4-7: Adopt candidate 1
      const adoptRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          category: 'edge_case',
          visibility: 'hidden'
        });

      expect(adoptRes.status).toBe(201);
      expect(adoptRes.body.success).toBe(true);
      expect(adoptRes.body.data.adoptionStatus).toBe('ADOPTED');
      expect(adoptRes.body.data.alreadyAdopted).toBe(false);

      const adoptedTestCaseId = adoptRes.body.data.testCase._id;
      createdTestCaseIds.push(adoptedTestCaseId);

      // Step 8: Confirm adopted TestCase appears in TestCase Studio (GET /api/v1/questions/:id/tests)
      const studioRes = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/tests`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(studioRes.status).toBe(200);
      const studioTests = studioRes.body.data;
      const adoptedInStudio = studioTests.find((t) => t._id.toString() === adoptedTestCaseId.toString());

      expect(adoptedInStudio).toBeDefined();
      expect(adoptedInStudio.source).toBe('mutation_derived');
      expect(adoptedInStudio.sourceReportId.toString()).toBe(testReport._id.toString());
      expect(adoptedInStudio.sourceCandidateId).toBe(candidate1.candidateId);
      expect(adoptedInStudio.input).toBe('4');
      expect(adoptedInStudio.expectedOutput).toBe('8');
      expect(adoptedInStudio.category).toBe('edge_case');
      expect(adoptedInStudio.visibility).toBe('hidden');
      expect(adoptedInStudio.verificationStatus).toBe('verified');

      // Step 9: Reject candidate 2 with explicit rejectionReason
      const rejectRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate2.candidateId}/reject`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          rejectionReason: 'Subsumed by comprehensive boundary suite'
        });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.adoptionStatus).toBe('REJECTED');
      expect(rejectRes.body.data.rejectionReason).toBe('Subsumed by comprehensive boundary suite');

      // Step 10: Refresh/re-query Mutation Report and Question to verify all statuses persist cleanly
      const refreshedReportRes = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(refreshedReportRes.status).toBe(200);
      const refreshedCandidates = refreshedReportRes.body.data.candidateTests;

      const persistedAdopted = refreshedCandidates.find((c) => c.candidateId === candidate1.candidateId);
      expect(persistedAdopted.adoptionStatus).toBe('ADOPTED');
      expect(persistedAdopted.adoptedTestCaseId.toString()).toBe(adoptedTestCaseId.toString());
      expect(persistedAdopted.adoptedAt).toBeDefined();
      expect(persistedAdopted.adoptedBy.toString()).toBe(primaryTeacher._id.toString());

      const persistedRejected = refreshedCandidates.find((c) => c.candidateId === candidate2.candidateId);
      expect(persistedRejected.adoptionStatus).toBe('REJECTED');
      expect(persistedRejected.rejectionReason).toBe('Subsumed by comprehensive boundary suite');
      expect(persistedRejected.rejectedAt).toBeDefined();
      expect(persistedRejected.rejectedBy.toString()).toBe(primaryTeacher._id.toString());

      // Verify Question adoptionLock is completely released and null in DB
      const dbQuestion = await Question.findById(testQuestion._id).lean();
      expect(dbQuestion.adoptionLock).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. CONCURRENCY & RELIABILITY HARDENING
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Concurrency & Reliability Hardening', () => {
    it('prevents concurrent adoption of the same Question and rejects the second request with 409', async () => {
      // Simulate slow execution for first request to ensure lock contention
      mockProvider.setHandler(async ({ code }) => {
        if (code.includes('x + 2')) {
          await new Promise((r) => setTimeout(r, 600));
          return { status: 'success', output: '6', runtimeMs: 600 };
        }
        return { status: 'success', output: '8', runtimeMs: 20 };
      });

      // Fire two adoption attempts concurrently for candidate1 and candidate2 on the same Question
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
          .set('Authorization', `Bearer ${teacherToken}`)
          .send({ category: 'edge_case' }),
        request(app)
          .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate2.candidateId}/adopt`)
          .set('Authorization', `Bearer ${teacherToken}`)
          .send({ category: 'boundary' })
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      expect(statuses).toContain(409);

      const conflictRes = res1.status === 409 ? res1 : res2;
      expect(conflictRes.body.error.code).toBe('QUESTION_LOCKED_BY_ADOPTION');

      const successRes = res1.status === 201 ? res1 : res2;
      createdTestCaseIds.push(successRes.body.data.testCase._id);

      // Verify Question adoptionLock was released after completion
      const dbQuestion = await Question.findById(testQuestion._id).lean();
      expect(dbQuestion.adoptionLock).toBeNull();
    });

    it('handles duplicate adoption calls idempotently without duplicate TestCase creation', async () => {
      const res1 = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res1.status).toBe(201);
      const testCaseId = res1.body.data.testCase._id;
      createdTestCaseIds.push(testCaseId);

      // Immediate duplicate call by teacher
      const res2 = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res2.status).toBe(200);
      expect(res2.body.data.alreadyAdopted).toBe(true);
      expect(res2.body.data.testCaseId.toString()).toBe(testCaseId.toString());

      // Verify in DB that only 1 TestCase exists for this candidate
      const count = await TestCase.countDocuments({
        questionId: testQuestion._id,
        sourceCandidateId: candidate1.candidateId
      });
      expect(count).toBe(1);
    });

    it('safely recovers and breaks an expired adoption lease left by an abandoned worker', async () => {
      // Artificially implant an expired adoption lease on the Question
      await Question.updateOne(
        { _id: testQuestion._id },
        {
          $set: {
            adoptionLock: {
              lockToken: 'stale-token-abc',
              operationId: 'stale-op-123',
              reportId: testReport._id,
              candidateId: candidate1.candidateId,
              acquiredBy: primaryTeacher._id,
              acquiredAt: new Date(Date.now() - 30000),
              expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
              lastHeartbeat: new Date(Date.now() - 6000)
            }
          }
        }
      );

      // New adoption request should break the expired lease and succeed
      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(201);
      createdTestCaseIds.push(res.body.data.testCase._id);

      const dbQuestion = await Question.findById(testQuestion._id).lean();
      expect(dbQuestion.adoptionLock).toBeNull();
    });

    it('enforces write fence: aborts adoption and rolls back transaction if Question version changes', async () => {
      // Tamper with question version to simulate concurrent modification during verification
      mockProvider.setHandler(async ({ code }) => {
        // Increment Question __v behind the back of the adoption service
        await Question.updateOne({ _id: testQuestion._id }, { $inc: { __v: 1 } });
        if (code.includes('x + 2')) {
          return { status: 'success', output: '6', runtimeMs: 15 };
        }
        return { status: 'success', output: '8', runtimeMs: 15 };
      });

      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONCURRENT_MODIFICATION');

      // Assert rollback: candidate remains PENDING and no TestCase created
      const reportInDb = await MutationReport.findById(testReport._id);
      const cand = reportInDb.candidateTests.find((c) => c.candidateId === candidate1.candidateId);
      expect(cand.adoptionStatus).toBe('PENDING');

      const testCaseCount = await TestCase.countDocuments({
        questionId: testQuestion._id,
        sourceCandidateId: candidate1.candidateId
      });
      expect(testCaseCount).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SECURITY & DATA INTEGRITY HARDENING
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Security & Data Integrity Hardening', () => {
    it('strictly forbids unauthorized teachers from adopting or rejecting candidates (403)', async () => {
      // Unauthorized teacher attempts adoption
      const adoptRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${unauthorizedTeacherToken}`)
        .send({});

      expect(adoptRes.status).toBe(403);

      // Unauthorized teacher attempts rejection
      const rejectRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate2.candidateId}/reject`)
        .set('Authorization', `Bearer ${unauthorizedTeacherToken}`)
        .send({ rejectionReason: 'Unauthorized rejection attempt' });

      expect(rejectRes.status).toBe(403);
    });

    it('allows platform admin to adopt and reject candidates on any teacher Question', async () => {
      const adoptRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(adoptRes.status).toBe(201);
      createdTestCaseIds.push(adoptRes.body.data.testCase._id);

      const rejectRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate2.candidateId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ rejectionReason: 'Admin verified redundant' });

      expect(rejectRes.status).toBe(200);
    });

    it('prevents BOLA: rejects adoption when MutationReport belongs to a different Question', async () => {
      const foreignQuestion = await Question.create({
        title: 'Foreign Teacher Question',
        statement: 'Given integer x, return x',
        description: 'Independent question',
        inputFormat: 'Integer x',
        outputFormat: 'Integer x',
        difficulty: 'Easy',
        language: 'javascript',
        executionMode: 'FUNCTION',
        functionName: 'solve',
        referenceSolution: 'function solve(x) { return x; }',
        ownerId: primaryTeacher._id,
        examples: [{ input: '1', output: '1' }]
      });
      createdQuestionIds.push(foreignQuestion._id);

      const res = await request(app)
        .post(`/api/v1/questions/${foreignQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REPORT_QUESTION_BINDING');
    });

    it('enforces Zero-Leak Guard: students cannot access reference solution, private tests, or adoption lock', async () => {
      // 1. Adopt hidden test case
      const adoptRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ visibility: 'hidden' });

      expect(adoptRes.status).toBe(201);
      createdTestCaseIds.push(adoptRes.body.data.testCase._id);

      // 2. Student calls GET /questions/:id
      const qRes = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(qRes.status).toBe(200);
      expect(qRes.body.data.referenceSolution).toBeUndefined();
      expect(qRes.body.data.referenceSolutions).toBeUndefined();
      expect(qRes.body.data.adoptionLock).toBeUndefined();

      // 3. Student calls GET /questions/:id/student-view
      const previewRes = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/student-view`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.referenceSolution).toBeUndefined();
      const publicTests = previewRes.body.data.publicTestCases || [];
      expect(publicTests.some((t) => t.input === candidate1.input)).toBe(false);

      // 4. Student calls GET /questions/:id/tests -> blocked 403
      const testsRes = await request(app)
        .get(`/api/v1/questions/${testQuestion._id}/tests`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(testsRes.status).toBe(403);
    });

    it('enforces candidate provenance: rejects adoption if client modifies candidate input', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          input: '999999' // Tampered input
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANDIDATE_INPUT_MODIFIED');
    });

    it('blocks adoption of candidate tests synthesized for equivalent mutants', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate3.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EQUIVALENT_MUTANT_CANNOT_BE_ADOPTED');
    });

    it('enforces state transition rules: adopted candidates cannot be rejected, and rejected cannot be adopted', async () => {
      // 1. Adopt candidate 1
      const adoptRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(adoptRes.status).toBe(201);
      createdTestCaseIds.push(adoptRes.body.data.testCase._id);

      // 2. Attempt to reject candidate 1 -> 400 CANDIDATE_ALREADY_ADOPTED
      const rejectAdoptedRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate1.candidateId}/reject`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ rejectionReason: 'Attempt to reject adopted candidate' });

      expect(rejectAdoptedRes.status).toBe(400);
      expect(rejectAdoptedRes.body.error.code).toBe('CANDIDATE_ALREADY_ADOPTED');

      // 3. Reject candidate 2
      const rejectRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate2.candidateId}/reject`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ rejectionReason: 'Valid rejection reason' });

      expect(rejectRes.status).toBe(200);

      // 4. Attempt to adopt candidate 2 -> 400 CANDIDATE_ALREADY_REJECTED
      const adoptRejectedRes = await request(app)
        .post(`/api/v1/questions/${testQuestion._id}/mutation-runs/${testReport._id}/candidates/${candidate2.candidateId}/adopt`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});

      expect(adoptRejectedRes.status).toBe(400);
      expect(adoptRejectedRes.body.error.code).toBe('CANDIDATE_ALREADY_REJECTED');
    });
  });
});

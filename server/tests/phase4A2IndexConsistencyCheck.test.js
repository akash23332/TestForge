import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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

describe('Phase 4A.2.4: Database Index Consistency & Invariant Verification', () => {
  let teacherUser;
  let teacherToken;
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

    mockProvider = new MockExecutionProvider();
    providerRegistry.register('index_check_mock_provider', mockProvider);
    providerRegistry.setActiveProvider('index_check_mock_provider');

    const timestamp = Date.now();
    const mockHash = '$2a$10$wT0lQn2U1X4W5Jc7bYv.e.7pP9Lq7F9Lq7F9Lq7F9Lq7F9Lq7F9Lq';

    teacherUser = await User.create({
      name: 'Index Auditor Teacher',
      email: `index_audit_${timestamp}@testforge.edu`,
      passwordHash: mockHash,
      role: 'teacher'
    });
    createdUserIds.push(teacherUser._id);
    teacherToken = signToken(teacherUser);

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
      mockProvider?.reset();
      await disconnectDatabase();
    }
  }, 30000);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ATLAS PHYSICAL INDEX DEFINITION CHECK
  // ─────────────────────────────────────────────────────────────────────────────
  it('1. Confirms actual MongoDB Atlas index definition matches approved 3-field structure', async () => {
    const indexes = await TestCase.collection.indexes();
    const adoptedCandidateIndex = indexes.find((idx) => idx.name === 'uniq_question_adopted_candidate');

    expect(adoptedCandidateIndex).toBeDefined();
    expect(adoptedCandidateIndex.unique).toBe(true);
    expect(adoptedCandidateIndex.key).toEqual({
      questionId: 1,
      sourceReportId: 1,
      sourceCandidateId: 1
    });
    expect(adoptedCandidateIndex.partialFilterExpression).toEqual({
      sourceReportId: { $type: 'objectId' },
      sourceCandidateId: { $type: 'string' }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ORDINARY TESTCASES EXCLUSION CHECK
  // ─────────────────────────────────────────────────────────────────────────────
  it('2. Confirms ordinary test cases without sourceReportId remain excluded from the partial index', async () => {
    const q = await Question.create({
      title: `Ordinary Test Question ${Date.now()}`,
      statement: 'Return x',
      description: 'Return x',
      inputFormat: 'x',
      outputFormat: 'x',
      difficulty: 'Easy',
      language: 'javascript',
      executionMode: 'FUNCTION',
      functionName: 'solve',
      ownerId: teacherUser._id,
      referenceSolution: 'function solve(x) { return x; }',
      examples: [{ input: '1', output: '1' }]
    });
    createdQuestionIds.push(q._id);

    // Insert two ordinary testcases with identical inputs (different categories)
    // and null sourceReportId
    const tc1 = await TestCase.create({
      questionId: q._id,
      input: '10',
      expectedOutput: '10',
      category: 'sample',
      visibility: 'public',
      source: 'manual',
      sourceReportId: null,
      sourceCandidateId: null
    });
    createdTestCaseIds.push(tc1._id);

    const tc2 = await TestCase.create({
      questionId: q._id,
      input: '20',
      expectedOutput: '20',
      category: 'normal',
      visibility: 'hidden',
      source: 'manual'
      // sourceReportId and sourceCandidateId omitted entirely
    });
    createdTestCaseIds.push(tc2._id);

    expect(tc1._id).toBeDefined();
    expect(tc2._id).toBeDefined();
    expect(tc1.sourceReportId).toBeNull();
    expect(tc2.sourceReportId).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. ZERO EXISTING DUPLICATES IN PRODUCTION DATABASE
  // ─────────────────────────────────────────────────────────────────────────────
  it('3. Confirms zero duplicate adopted test cases exist in the database', async () => {
    const duplicates = await TestCase.aggregate([
      {
        $match: {
          sourceReportId: { $type: 'objectId' },
          sourceCandidateId: { $type: 'string' }
        }
      },
      {
        $group: {
          _id: {
            questionId: '$questionId',
            sourceReportId: '$sourceReportId',
            sourceCandidateId: '$sourceCandidateId'
          },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]);

    expect(duplicates).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. DUPLICATE ADOPTION ACROSS TWO DIFFERENT MUTATION REPORTS FOR SAME QUESTION
  // ─────────────────────────────────────────────────────────────────────────────
  it('4. Tests adoption across two different MutationReports belonging to the same Question', async () => {
    mockProvider.setHandler(({ code }) => {
      if (code.includes('x + 1')) {
        return { status: 'success', output: '4', runtimeMs: 10 }; // Mutant killed
      }
      if (code.includes('x + 2')) {
        return { status: 'success', output: '5', runtimeMs: 10 }; // Mutant killed
      }
      return { status: 'success', output: '6', runtimeMs: 10 }; // Reference solution (x * 2 for x=3)
    });

    const timestamp = Date.now();
    const q = await Question.create({
      title: `Multi-Report Question ${timestamp}`,
      statement: 'Return x * 2',
      description: 'Return x * 2',
      inputFormat: 'x',
      outputFormat: '2*x',
      difficulty: 'Easy',
      language: 'javascript',
      executionMode: 'FUNCTION',
      functionName: 'solve',
      ownerId: teacherUser._id,
      referenceSolution: 'function solve(x) { return x * 2; }',
      examples: [{ input: '3', output: '6' }]
    });
    createdQuestionIds.push(q._id);

    const mutantR1 = {
      mutantId: `mut-r1-${timestamp}`,
      operator: 'AOR',
      operatorType: 'AOR',
      originalSnippet: 'x * 2',
      mutatedSnippet: 'x + 1',
      mutatedFullCode: 'function solve(x) { return x + 1; }',
      validationStatus: 'VALID',
      executionStatus: 'SURVIVED',
      equivalent: false,
      currentClassification: 'SURVIVED'
    };

    const candidateR1 = {
      candidateId: `cand-r1-${timestamp}`,
      mutantId: mutantR1.mutantId,
      input: '3',
      expectedOutput: '6',
      reason: 'Kills mutant R1',
      verified: true,
      adoptionStatus: 'PENDING'
    };

    const report1 = await MutationReport.create({
      questionId: q._id,
      teacherId: teacherUser._id,
      status: 'COMPLETED',
      totalMutants: 1,
      killedMutants: 0,
      survivedMutants: 1,
      mutationScore: 0,
      mutants: [mutantR1],
      candidateTests: [candidateR1]
    });
    createdReportIds.push(report1._id);

    const mutantR2 = {
      mutantId: `mut-r2-${timestamp}`,
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

    const candidateR2 = {
      candidateId: `cand-r2-${timestamp}`,
      mutantId: mutantR2.mutantId,
      input: '4',
      expectedOutput: '8',
      reason: 'Kills mutant R2',
      verified: true,
      adoptionStatus: 'PENDING'
    };

    const report2 = await MutationReport.create({
      questionId: q._id,
      teacherId: teacherUser._id,
      status: 'COMPLETED',
      totalMutants: 1,
      killedMutants: 0,
      survivedMutants: 1,
      mutationScore: 0,
      mutants: [mutantR2],
      candidateTests: [candidateR2]
    });
    createdReportIds.push(report2._id);

    // 4a. Adopt candidate from Report 1
    const resAdoptR1 = await request(app)
      .post(`/api/v1/questions/${q._id}/mutation-runs/${report1._id}/candidates/${candidateR1.candidateId}/adopt`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ category: 'edge_case' });

    expect(resAdoptR1.status).toBe(201);
    expect(resAdoptR1.body.data.adoptionStatus).toBe('ADOPTED');
    createdTestCaseIds.push(resAdoptR1.body.data.testCase._id);

    // 4b. Adopt candidate from Report 2 into the SAME Question
    mockProvider.setHandler(({ code }) => {
      if (code.includes('x + 2')) {
        return { status: 'success', output: '6', runtimeMs: 10 }; // Mutant killed
      }
      return { status: 'success', output: '8', runtimeMs: 10 }; // Reference solution (x * 2 for x=4)
    });

    const resAdoptR2 = await request(app)
      .post(`/api/v1/questions/${q._id}/mutation-runs/${report2._id}/candidates/${candidateR2.candidateId}/adopt`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ category: 'boundary' });

    expect(resAdoptR2.status).toBe(201);
    expect(resAdoptR2.body.data.adoptionStatus).toBe('ADOPTED');
    createdTestCaseIds.push(resAdoptR2.body.data.testCase._id);

    // 4c. Verify both adopted test cases coexist cleanly in Question's test suite
    const suiteRes = await request(app)
      .get(`/api/v1/questions/${q._id}/tests`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(suiteRes.status).toBe(200);
    const adoptedCases = suiteRes.body.data.filter((t) => t.source === 'mutation_derived');
    expect(adoptedCases).toHaveLength(2);

    const tcFromR1 = adoptedCases.find((t) => t.sourceCandidateId === candidateR1.candidateId);
    const tcFromR2 = adoptedCases.find((t) => t.sourceCandidateId === candidateR2.candidateId);
    expect(tcFromR1.sourceReportId.toString()).toBe(report1._id.toString());
    expect(tcFromR2.sourceReportId.toString()).toBe(report2._id.toString());

    // 4d. Cross-report adoption attempt: Calling adopt on Report 2 with Candidate 1 (from Report 1)
    // Must be rejected with 404 CANDIDATE_NOT_FOUND because Candidate 1 does not belong to Report 2
    const crossReportRes = await request(app)
      .post(`/api/v1/questions/${q._id}/mutation-runs/${report2._id}/candidates/${candidateR1.candidateId}/adopt`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({});

    expect(crossReportRes.status).toBe(404);
    expect(crossReportRes.body.error.code).toBe('CANDIDATE_NOT_FOUND');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. STORAGE ENGINE DUPLICATE PREVENTION UNDER PARTIAL UNIQUE INDEX
  // ─────────────────────────────────────────────────────────────────────────────
  it('5. Confirms MongoDB engine strictly rejects duplicate adoption insertion with E11000', async () => {
    const qId = new mongoose.Types.ObjectId();
    const rId = new mongoose.Types.ObjectId();
    const cId = crypto.randomUUID();

    const firstDoc = await TestCase.create({
      questionId: qId,
      sourceReportId: rId,
      sourceCandidateId: cId,
      input: '100',
      expectedOutput: '200',
      source: 'mutation_derived'
    });
    createdTestCaseIds.push(firstDoc._id);

    let duplicateErr = null;
    try {
      await TestCase.create({
        questionId: qId,
        sourceReportId: rId,
        sourceCandidateId: cId,
        input: '100',
        expectedOutput: '200',
        source: 'mutation_derived'
      });
    } catch (err) {
      duplicateErr = err;
    }

    expect(duplicateErr).not.toBeNull();
    expect(duplicateErr.code).toBe(11000);
    expect(duplicateErr.message).toContain('uniq_question_adopted_candidate');
  });
});

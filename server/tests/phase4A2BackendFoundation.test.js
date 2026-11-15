import mongoose from 'mongoose';
import crypto from 'crypto';
import { TestCase } from '../src/models/TestCase.js';
import { Question } from '../src/models/Question.js';
import { MutationReport } from '../src/models/MutationReport.js';
import User from '../src/models/User.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { evaluateAndPublishQuestion } from '../src/services/publishingGate.service.js';
import { migrateCandidateAdoptionSchemasPhase4A2 } from '../scripts/migrations/migrateCandidateAdoptionSchemasPhase4A2.mjs';

describe('Phase 4A.2.1: Backend Foundation Implementation', () => {
  let teacherUser;
  let testQuestion;
  const createdTestCaseIds = [];
  const createdQuestionIds = [];
  const createdReportIds = [];

  beforeAll(async () => {
    await connectDatabase();

    // Ensure test teacher user exists
    teacherUser = await User.findOne({ role: 'teacher' });
    if (!teacherUser) {
      teacherUser = await User.create({
        name: 'Phase4A2 Test Teacher',
        email: `teacher_p4a2_${Date.now()}@testforge.edu`,
        password: 'Password123!',
        role: 'teacher'
      });
    }

    // Ensure index is created on TestCase collection
    await TestCase.init();
    await Question.init();
    await MutationReport.init();
  }, 30000);

  afterAll(async () => {
    // Cleanup created test records
    if (createdTestCaseIds.length > 0) {
      await TestCase.deleteMany({ _id: { $in: createdTestCaseIds } });
    }
    if (createdQuestionIds.length > 0) {
      await Question.deleteMany({ _id: { $in: createdQuestionIds } });
    }
    if (createdReportIds.length > 0) {
      await MutationReport.deleteMany({ _id: { $in: createdReportIds } });
    }
    await disconnectDatabase();
  }, 30000);

  beforeEach(async () => {
    // Create base question for tests
    testQuestion = await Question.create({
      title: `Foundation Question ${Date.now()}`,
      statement: 'Write a function returning double the input.',
      inputFormat: 'Integer n',
      outputFormat: 'Integer 2*n',
      difficulty: 'Easy',
      language: 'javascript',
      executionMode: 'FUNCTION',
      functionName: 'doubleNum',
      starterCode: 'function doubleNum(n) {\n  return 0;\n}',
      referenceSolution: 'function doubleNum(n) {\n  return n * 2;\n}',
      ownerId: teacherUser._id,
      status: 'DRAFT',
      examples: [{ input: '2', output: '4', explanation: '2*2=4' }]
    });
    createdQuestionIds.push(testQuestion._id);
  });

  describe('1. TestCase Partial Unique Index & Ordinary TestCase Isolation', () => {
    it('allows multiple ordinary TestCases without adoption metadata on the same question', async () => {
      const tc1 = await TestCase.create({
        questionId: testQuestion._id,
        input: '5',
        expectedOutput: '10',
        category: 'normal',
        source: 'manual',
        visibility: 'public'
      });
      createdTestCaseIds.push(tc1._id);

      const tc2 = await TestCase.create({
        questionId: testQuestion._id,
        input: '6',
        expectedOutput: '12',
        category: 'normal',
        source: 'manual',
        visibility: 'public'
      });
      createdTestCaseIds.push(tc2._id);

      expect(tc1.sourceReportId).toBeNull();
      expect(tc1.sourceCandidateId).toBeNull();
      expect(tc2.sourceReportId).toBeNull();
      expect(tc2.sourceCandidateId).toBeNull();
    });

    it('allows multiple ordinary TestCases with identical inputs without conflicting with the partial unique index', async () => {
      // Ordinary test cases without sourceReportId should NEVER collide on the partial unique index
      const tc1 = await TestCase.create({
        questionId: testQuestion._id,
        input: '100',
        expectedOutput: '200',
        category: 'edge_case',
        source: 'manual'
      });
      createdTestCaseIds.push(tc1._id);

      const tc2 = await TestCase.create({
        questionId: testQuestion._id,
        input: '100',
        expectedOutput: '200',
        category: 'stress',
        source: 'ai_generated'
      });
      createdTestCaseIds.push(tc2._id);

      expect(tc1._id).toBeDefined();
      expect(tc2._id).toBeDefined();
      expect(tc1._id.toString()).not.toBe(tc2._id.toString());
    });

    it('allows insertion of a mutation-adopted TestCase with valid sourceReportId and sourceCandidateId', async () => {
      const mockReportId = new mongoose.Types.ObjectId();
      const mockCandidateId = crypto.randomUUID();

      const adoptedTc = await TestCase.create({
        questionId: testQuestion._id,
        sourceReportId: mockReportId,
        sourceCandidateId: mockCandidateId,
        input: '42',
        expectedOutput: '84',
        category: 'edge_case',
        source: 'mutation_derived',
        verificationStatus: 'verified',
        visibility: 'hidden'
      });
      createdTestCaseIds.push(adoptedTc._id);

      expect(adoptedTc.sourceReportId.toString()).toBe(mockReportId.toString());
      expect(adoptedTc.sourceCandidateId).toBe(mockCandidateId);
      expect(adoptedTc.source).toBe('mutation_derived');
      expect(adoptedTc.visibility).toBe('hidden');
    });

    it('strictly rejects duplicate adoption of the same candidate for the same question via partial unique index', async () => {
      const mockReportId = new mongoose.Types.ObjectId();
      const mockCandidateId = crypto.randomUUID();

      const adopted1 = await TestCase.create({
        questionId: testQuestion._id,
        sourceReportId: mockReportId,
        sourceCandidateId: mockCandidateId,
        input: '99',
        expectedOutput: '198',
        source: 'mutation_derived'
      });
      createdTestCaseIds.push(adopted1._id);

      let duplicateError = null;
      try {
        await TestCase.create({
          questionId: testQuestion._id,
          sourceReportId: mockReportId,
          sourceCandidateId: mockCandidateId,
          input: '99',
          expectedOutput: '198',
          source: 'mutation_derived'
        });
      } catch (err) {
        duplicateError = err;
      }

      expect(duplicateError).not.toBeNull();
      // Must be a MongoDB E11000 duplicate key error on the partial unique index
      expect(duplicateError.code === 11000 || duplicateError.name === 'MongoServerError').toBe(true);
      expect(duplicateError.message).toContain('uniq_question_adopted_candidate');
    });

    it('allows adoption of the same candidateId on a DIFFERENT question without collision', async () => {
      const secondQuestion = await Question.create({
        title: `Second Question ${Date.now()}`,
        statement: 'Another statement',
        inputFormat: 'n',
        outputFormat: '2*n',
        difficulty: 'Easy',
        language: 'javascript',
        ownerId: teacherUser._id,
        status: 'DRAFT'
      });
      createdQuestionIds.push(secondQuestion._id);

      const mockReportId = new mongoose.Types.ObjectId();
      const sharedCandidateId = crypto.randomUUID();

      const adoptedQ1 = await TestCase.create({
        questionId: testQuestion._id,
        sourceReportId: mockReportId,
        sourceCandidateId: sharedCandidateId,
        input: '7',
        expectedOutput: '14',
        source: 'mutation_derived'
      });
      createdTestCaseIds.push(adoptedQ1._id);

      const adoptedQ2 = await TestCase.create({
        questionId: secondQuestion._id,
        sourceReportId: mockReportId,
        sourceCandidateId: sharedCandidateId,
        input: '7',
        expectedOutput: '14',
        source: 'mutation_derived'
      });
      createdTestCaseIds.push(adoptedQ2._id);

      expect(adoptedQ1._id).toBeDefined();
      expect(adoptedQ2._id).toBeDefined();
    });
  });

  describe('2. Question Model adoptionLock Schema Verification', () => {
    it('defaults adoptionLock to null upon Question creation', async () => {
      const freshQ = await Question.findById(testQuestion._id);
      expect(freshQ.adoptionLock).toBeNull();
    });

    it('persists a valid adoptionLock structure atomically', async () => {
      const lockToken = crypto.randomUUID();
      const operationId = crypto.randomUUID();
      const reportId = new mongoose.Types.ObjectId();
      const candidateId = crypto.randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30000);

      const updatedQ = await Question.findByIdAndUpdate(
        testQuestion._id,
        {
          $set: {
            adoptionLock: {
              lockToken,
              operationId,
              reportId,
              candidateId,
              acquiredBy: teacherUser._id,
              acquiredAt: now,
              expiresAt,
              lastHeartbeat: now
            }
          }
        },
        { new: true }
      );

      expect(updatedQ.adoptionLock).not.toBeNull();
      expect(updatedQ.adoptionLock.lockToken).toBe(lockToken);
      expect(updatedQ.adoptionLock.operationId).toBe(operationId);
      expect(updatedQ.adoptionLock.reportId.toString()).toBe(reportId.toString());
      expect(updatedQ.adoptionLock.candidateId).toBe(candidateId);
      expect(updatedQ.adoptionLock.acquiredBy.toString()).toBe(teacherUser._id.toString());
      expect(new Date(updatedQ.adoptionLock.expiresAt).getTime()).toBe(expiresAt.getTime());
    });

    it('releases the adoptionLock cleanly back to null', async () => {
      await Question.findByIdAndUpdate(testQuestion._id, {
        $set: { adoptionLock: null }
      });
      const clearedQ = await Question.findById(testQuestion._id);
      expect(clearedQ.adoptionLock).toBeNull();
    });
  });

  describe('3. MutationReport Candidate Lifecycle Schema & Validation', () => {
    it('automatically assigns default candidateId and adoptionStatus=PENDING to new candidate tests', async () => {
      const report = await MutationReport.create({
        questionId: testQuestion._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        candidateTests: [
          {
            mutantId: 'mut_01',
            input: '10',
            expectedOutput: '20',
            reason: 'Kills boundary mutant'
          }
        ]
      });
      createdReportIds.push(report._id);

      const savedCandidate = report.candidateTests[0];
      expect(savedCandidate.candidateId).toBeDefined();
      expect(typeof savedCandidate.candidateId).toBe('string');
      expect(savedCandidate.candidateId.length).toBeGreaterThan(10);
      expect(savedCandidate.adoptionStatus).toBe('PENDING');
      expect(savedCandidate.adoptionOperationId).toBeNull();
      expect(savedCandidate.adoptedTestCaseId).toBeNull();
      expect(savedCandidate.adoptedAt).toBeNull();
      expect(savedCandidate.adoptedBy).toBeNull();
    });

    it('allows valid transitions to ADOPTED and REJECTED states with metadata', async () => {
      const adoptedTcId = new mongoose.Types.ObjectId();
      const operationId = crypto.randomUUID();
      const now = new Date();

      const report = await MutationReport.create({
        questionId: testQuestion._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        candidateTests: [
          {
            candidateId: 'cand_test_01',
            mutantId: 'mut_02',
            input: '-5',
            expectedOutput: '-10',
            adoptionStatus: 'ADOPTED',
            adoptionOperationId: operationId,
            adoptedTestCaseId: adoptedTcId,
            adoptedAt: now,
            adoptedBy: teacherUser._id
          },
          {
            candidateId: 'cand_test_02',
            mutantId: 'mut_03',
            input: '0',
            expectedOutput: '0',
            adoptionStatus: 'REJECTED'
          }
        ]
      });
      createdReportIds.push(report._id);

      const c1 = report.candidateTests.find((c) => c.candidateId === 'cand_test_01');
      expect(c1.adoptionStatus).toBe('ADOPTED');
      expect(c1.adoptionOperationId).toBe(operationId);
      expect(c1.adoptedTestCaseId.toString()).toBe(adoptedTcId.toString());
      expect(c1.adoptedBy.toString()).toBe(teacherUser._id.toString());

      const c2 = report.candidateTests.find((c) => c.candidateId === 'cand_test_02');
      expect(c2.adoptionStatus).toBe('REJECTED');
    });

    it('rejects invalid adoptionStatus values via Mongoose schema validation', async () => {
      let validationError = null;
      try {
        await MutationReport.create({
          questionId: testQuestion._id,
          teacherId: teacherUser._id,
          status: 'COMPLETED',
          candidateTests: [
            {
              input: '1',
              expectedOutput: '2',
              adoptionStatus: 'INVALID_STATUS'
            }
          ]
        });
      } catch (err) {
        validationError = err;
      }

      expect(validationError).not.toBeNull();
      expect(validationError.name).toBe('ValidationError');
    });
  });

  describe('4. Migration Idempotency & Backward Compatibility', () => {
    it('safely runs the Phase 4A.2 migration script without corrupting existing records', async () => {
      // Create a mock legacy MutationReport with candidateTests missing candidateId & adoptionStatus
      const legacyReport = await MutationReport.create({
        questionId: testQuestion._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        candidateTests: [
          {
            input: '15',
            expectedOutput: '30',
            reason: 'Legacy candidate without adoption fields'
          }
        ]
      });
      createdReportIds.push(legacyReport._id);

      // Force-strip fields via raw MongoDB driver to simulate historical document
      await MutationReport.collection.updateOne(
        { _id: legacyReport._id },
        {
          $unset: {
            'candidateTests.0.candidateId': '',
            'candidateTests.0.adoptionStatus': ''
          }
        }
      );

      // Execute migration
      const migrationStats = await migrateCandidateAdoptionSchemasPhase4A2({ silent: true });
      expect(migrationStats).toBeDefined();

      // Verify legacy document was backfilled safely
      const migrated = await MutationReport.findById(legacyReport._id);
      const migratedCandidate = migrated.candidateTests[0];
      expect(migratedCandidate.candidateId).toBeDefined();
      expect(typeof migratedCandidate.candidateId).toBe('string');
      expect(migratedCandidate.adoptionStatus).toBe('PENDING');

      // Re-running migration is idempotent
      const secondRunStats = await migrateCandidateAdoptionSchemasPhase4A2({ silent: true });
      expect(secondRunStats.reportsModified).toBe(0);
    });
  });

  describe('5. Existing Publishing Gate Compatibility', () => {
    it('maintains full compatibility with existing evaluateAndPublishQuestion functionality', async () => {
      // Add a valid sample test case to the question
      const sampleTc = await TestCase.create({
        questionId: testQuestion._id,
        input: '3',
        expectedOutput: '6',
        category: 'sample',
        source: 'manual',
        visibility: 'public',
        verificationStatus: 'verified'
      });
      createdTestCaseIds.push(sampleTc._id);

      const publishResult = await evaluateAndPublishQuestion({
        questionId: testQuestion._id,
        user: teacherUser,
        dryRun: true
      });

      expect(publishResult).toBeDefined();
      expect(typeof publishResult.canPublish).toBe('boolean');
      expect(Array.isArray(publishResult.blockingErrors)).toBe(true);
    });
  });
});

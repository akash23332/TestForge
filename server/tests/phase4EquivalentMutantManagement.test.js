import { jest, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Question } from '../src/models/Question.js';
import { MutationReport } from '../src/models/MutationReport.js';
import { User } from '../src/models/User.js';
import { TestCase } from '../src/models/TestCase.js';
import {
  calculateReportMetrics,
  updateMutantClassification
} from '../src/services/mutation/equivalenceService.js';
import {
  canonicalizeTagged,
  computeExecutionFingerprint
} from '../src/services/mutation/fingerprintService.js';
import { migrateHistoricalMutationReports } from '../scripts/migrations/migrateMutationReportsPhase4.mjs';

jest.setTimeout(60000);

describe('Phase 4A.1: Equivalent Mutant Management Test Suite', () => {
  let teacherUser;
  let otherTeacherUser;
  let studentUser;
  let adminUser;

  let teacherToken;
  let otherTeacherToken;
  let studentToken;
  let adminToken;

  let question;
  let report;

  beforeAll(async () => {
    await connectDatabase();

    // 1. Create test users
    const signToken = (user) =>
      jwt.sign(
        { id: user._id.toString(), email: user.email, role: user.role },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

    teacherUser = await User.create({
      name: 'Dr. Mutation Teacher',
      email: `teacher_eq_${Date.now()}@testforge.edu`,
      passwordHash: 'hashed_password_123',
      role: 'teacher'
    });
    teacherToken = signToken(teacherUser);

    otherTeacherUser = await User.create({
      name: 'Other Teacher',
      email: `other_teacher_${Date.now()}@testforge.edu`,
      passwordHash: 'hashed_password_123',
      role: 'teacher'
    });
    otherTeacherToken = signToken(otherTeacherUser);

    studentUser = await User.create({
      name: 'Student User',
      email: `student_eq_${Date.now()}@testforge.edu`,
      passwordHash: 'hashed_password_123',
      role: 'student'
    });
    studentToken = signToken(studentUser);

    adminUser = await User.create({
      name: 'Admin User',
      email: `admin_eq_${Date.now()}@testforge.edu`,
      passwordHash: 'hashed_password_123',
      role: 'admin'
    });
    adminToken = signToken(adminUser);
  }, 60000);

  afterAll(async () => {
    try {
      if (teacherUser?._id) {
        await User.deleteMany({
          _id: { $in: [teacherUser._id, otherTeacherUser?._id, studentUser?._id, adminUser?._id].filter(Boolean) }
        });
      }
      await disconnectDatabase();
    } catch {}
  }, 30000);

  beforeEach(async () => {
    // 2. Create question
    question = await Question.create({
      title: 'Equivalent Mutant Test Question',
      statement: 'Return array sum',
      ownerId: teacherUser._id,
      language: 'javascript',
      executionMode: 'FUNCTION',
      functionName: 'solve',
      referenceSolution: 'function solve(arr) { let sum = 0; for (let i = 0; i < arr.length; i++) sum += arr[i]; return sum; }'
    });

    // 3. Create active test cases
    await TestCase.create({
      questionId: question._id,
      input: '[1, 2, 3]',
      expectedOutput: '6',
      visibility: 'public',
      source: 'manual'
    });

    // 4. Create completed mutation report with distinct mutant statuses
    report = await MutationReport.create({
      questionId: question._id,
      teacherId: teacherUser._id,
      status: 'COMPLETED',
      totalMutants: 4,
      killedCount: 2,
      survivedCount: 2,
      equivalentCount: 0,
      compilationErrorCount: 0,
      mutationScore: 50.0, // 2 killed / (2 killed + 2 survived) = 50.0%
      mutants: [
        {
          mutantId: 'm-survived-1',
          operator: 'RELATIONAL_OPERATOR_REPLACEMENT',
          operatorType: 'ROR',
          originalSnippet: 'i < arr.length',
          mutatedSnippet: 'i <= arr.length - 1',
          executionStatus: 'SURVIVED',
          baselineExecutionStatus: 'SURVIVED',
          currentClassification: 'SURVIVED',
          equivalent: false,
          auditHistory: []
        },
        {
          mutantId: 'm-survived-2',
          operator: 'ARITHMETIC_OPERATOR_REPLACEMENT',
          operatorType: 'AOR',
          originalSnippet: 'sum += arr[i]',
          mutatedSnippet: 'sum = sum + arr[i]',
          executionStatus: 'SURVIVED',
          baselineExecutionStatus: 'SURVIVED',
          currentClassification: 'SURVIVED',
          equivalent: false,
          auditHistory: []
        },
        {
          mutantId: 'm-killed-1',
          operator: 'ARITHMETIC_OPERATOR_REPLACEMENT',
          operatorType: 'AOR',
          originalSnippet: 'sum += arr[i]',
          mutatedSnippet: 'sum -= arr[i]',
          executionStatus: 'KILLED',
          baselineExecutionStatus: 'KILLED',
          currentClassification: 'KILLED',
          equivalent: false,
          auditHistory: []
        },
        {
          mutantId: 'm-killed-2',
          operator: 'RETURN_VALUE_REPLACEMENT',
          operatorType: 'RVR',
          originalSnippet: 'return sum;',
          mutatedSnippet: 'return 0;',
          executionStatus: 'KILLED',
          baselineExecutionStatus: 'KILLED',
          currentClassification: 'KILLED',
          equivalent: false,
          auditHistory: []
        }
      ]
    });
  });

  afterEach(async () => {
    await MutationReport.deleteMany({ questionId: question._id });
    await TestCase.deleteMany({ questionId: question._id });
    await Question.deleteOne({ _id: question._id });
  });

  describe('1. Valid Classification Transitions', () => {
    test('SURVIVED -> EQUIVALENT: excludes mutant from score denominator and updates counts', async () => {
      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-survived-1/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Loop index i <= arr.length - 1 is semantically identical to i < arr.length'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentClassification).toBe('EQUIVALENT');
      expect(res.body.data.previousClassification).toBe('SURVIVED');

      // Score recalculation:
      // Killed: 2, Survived: 1, Equivalent: 1
      // Score = 2 / (2 + 1) * 100 = 66.67%
      expect(res.body.data.metrics.killedCount).toBe(2);
      expect(res.body.data.metrics.survivedCount).toBe(1);
      expect(res.body.data.metrics.equivalentCount).toBe(1);
      expect(res.body.data.mutationScore).toBe(66.67);

      // Audit history entry verified
      expect(res.body.data.auditEntry).toMatchObject({
        previousClassification: 'SURVIVED',
        newClassification: 'EQUIVALENT',
        reason: 'Loop index i <= arr.length - 1 is semantically identical to i < arr.length'
      });

      // Database assertion
      const reloaded = await MutationReport.findById(report._id);
      expect(reloaded.mutationScore).toBe(66.67);
      expect(reloaded.equivalentCount).toBe(1);
      expect(reloaded.survivedCount).toBe(1);

      const m = reloaded.mutants.find((item) => item.mutantId === 'm-survived-1');
      expect(m.currentClassification).toBe('EQUIVALENT');
      expect(m.baselineExecutionStatus).toBe('SURVIVED'); // Baseline preserved!
      expect(m.equivalent).toBe(true);
      expect(m.auditHistory.length).toBe(1);
    });

    test('EQUIVALENT -> SURVIVED: reverts mutant classification and restores score denominator', async () => {
      // Step 1: Mark as equivalent
      await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-survived-1/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'First review marking as equivalent'
        });

      // Step 2: Revert to survived
      const revertRes = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-survived-1/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'SURVIVED',
          reason: 'Discovered edge case where negative indices differ; reverting to survived.'
        });

      expect(revertRes.status).toBe(200);
      expect(revertRes.body.data.currentClassification).toBe('SURVIVED');
      expect(revertRes.body.data.previousClassification).toBe('EQUIVALENT');

      // Restored Score: 2 / (2 + 2) = 50.0%
      expect(revertRes.body.data.metrics.killedCount).toBe(2);
      expect(revertRes.body.data.metrics.survivedCount).toBe(2);
      expect(revertRes.body.data.metrics.equivalentCount).toBe(0);
      expect(revertRes.body.data.mutationScore).toBe(50.0);

      // Database assertion: Audit history has 2 chronological entries
      const reloaded = await MutationReport.findById(report._id);
      const m = reloaded.mutants.find((item) => item.mutantId === 'm-survived-1');
      expect(m.auditHistory.length).toBe(2);
      expect(m.auditHistory[0].newClassification).toBe('EQUIVALENT');
      expect(m.auditHistory[1].newClassification).toBe('SURVIVED');
      expect(m.baselineExecutionStatus).toBe('SURVIVED'); // Permanent baseline invariant
    });
  });

  describe('2. Invalid Classification Transitions & Tampering Rejection', () => {
    test('KILLED -> EQUIVALENT is rejected with 400 Bad Request', async () => {
      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-killed-1/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Attempting to mark physically killed mutant as equivalent'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INVALID_CLASSIFICATION_TRANSITION');

      // Database assertion: Status remains KILLED
      const reloaded = await MutationReport.findById(report._id);
      const m = reloaded.mutants.find((item) => item.mutantId === 'm-killed-1');
      expect(m.currentClassification).toBe('KILLED');
      expect(m.auditHistory.length).toBe(0);
    });

    test('SURVIVED -> KILLED tampering is rejected with 400 Bad Request', async () => {
      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-survived-1/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'KILLED',
          reason: 'Attempting to manually fabricate killed verdict'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INVALID_CLASSIFICATION');
    });

    test('Identical transition SURVIVED -> SURVIVED is rejected as noop', async () => {
      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-survived-1/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'SURVIVED',
          reason: 'No change requested'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NOOP_CLASSIFICATION_TRANSITION');
    });

    test('Rejects reason shorter than 5 characters with 400 Bad Request', async () => {
      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-survived-1/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'abc' // only 3 chars
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REASON');
    });
  });

  describe('2.1 Legacy Execution Status Safety & Missing Status Rejection', () => {
    test('baselineExecutionStatus missing but executionStatus SURVIVED resolves safely and allows classification', async () => {
      const legacyRaw = await MutationReport.collection.insertOne({
        questionId: question._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        mutationScore: 50.0,
        killedCount: 1,
        survivedCount: 1,
        equivalentCount: 0,
        mutants: [
          { mutantId: 'legacy-surv', executionStatus: 'SURVIVED', equivalent: false }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${legacyRaw.insertedId}/mutants/legacy-surv/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Valid equivalence review on surviving legacy mutant'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.currentClassification).toBe('EQUIVALENT');

      await MutationReport.deleteOne({ _id: legacyRaw.insertedId });
    });

    test('executionStatus missing but baselineExecutionStatus SURVIVED resolves safely and allows classification', async () => {
      const legacyRaw = await MutationReport.collection.insertOne({
        questionId: question._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        mutationScore: 50.0,
        killedCount: 1,
        survivedCount: 1,
        equivalentCount: 0,
        mutants: [
          { mutantId: 'legacy-baseline-surv', baselineExecutionStatus: 'SURVIVED', equivalent: false }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${legacyRaw.insertedId}/mutants/legacy-baseline-surv/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Valid equivalence review when only baselineExecutionStatus is present'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.currentClassification).toBe('EQUIVALENT');

      await MutationReport.deleteOne({ _id: legacyRaw.insertedId });
    });

    test('Both baselineExecutionStatus and executionStatus missing is rejected with 400 Bad Request (never silently SURVIVED)', async () => {
      const missingRaw = await MutationReport.collection.insertOne({
        questionId: question._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        mutationScore: 50.0,
        killedCount: 1,
        survivedCount: 1,
        equivalentCount: 0,
        mutants: [
          { mutantId: 'legacy-missing-both', equivalent: false }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${missingRaw.insertedId}/mutants/legacy-missing-both/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Attempting to mark mutant without verified execution result as equivalent'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(['INVALID_BASELINE_STATUS', 'INVALID_CLASSIFICATION_TRANSITION']).toContain(res.body.error.code);

      // Verify database record remains untouched and no audit history was appended
      const rawDoc = await MutationReport.collection.findOne({ _id: missingRaw.insertedId });
      expect(rawDoc.mutants[0].currentClassification).toBeUndefined();
      expect(rawDoc.mutants[0].auditHistory).toBeUndefined();
      expect(rawDoc.mutationScore).toBe(50.0);

      await MutationReport.deleteOne({ _id: missingRaw.insertedId });
    });

    test('Unrecognized executionStatus value is rejected with 400 Bad Request', async () => {
      const unrecognizedRaw = await MutationReport.collection.insertOne({
        questionId: question._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        mutationScore: 50.0,
        killedCount: 1,
        survivedCount: 1,
        equivalentCount: 0,
        mutants: [
          { mutantId: 'legacy-unrecognized', executionStatus: 'CORRUPTED_OR_INVALID_STATUS', equivalent: false }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${unrecognizedRaw.insertedId}/mutants/legacy-unrecognized/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Attempting to classify mutant with unrecognized execution status'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(['INVALID_BASELINE_STATUS', 'INVALID_CLASSIFICATION_TRANSITION']).toContain(res.body.error.code);

      await MutationReport.deleteOne({ _id: unrecognizedRaw.insertedId });
    });

    test('Baseline status UNKNOWN_LEGACY is rejected with 400 Bad Request', async () => {
      const unknownLegacyRaw = await MutationReport.collection.insertOne({
        questionId: question._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        mutationScore: 50.0,
        killedCount: 1,
        survivedCount: 1,
        equivalentCount: 0,
        mutants: [
          { mutantId: 'legacy-unknown-status', baselineExecutionStatus: 'UNKNOWN_LEGACY', currentClassification: 'UNKNOWN_LEGACY', equivalent: false }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${unknownLegacyRaw.insertedId}/mutants/legacy-unknown-status/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Attempting to classify mutant with UNKNOWN_LEGACY baseline'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(['INVALID_BASELINE_STATUS', 'INVALID_CLASSIFICATION_TRANSITION']).toContain(res.body.error.code);

      await MutationReport.deleteOne({ _id: unknownLegacyRaw.insertedId });
    });

    test('Baseline status COMPILATION_ERROR, RUNTIME_ERROR, and TIMEOUT are rejected with 400 Bad Request', async () => {
      const errorStatuses = ['COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIMEOUT'];
      for (const st of errorStatuses) {
        const errorRaw = await MutationReport.collection.insertOne({
          questionId: question._id,
          teacherId: teacherUser._id,
          status: 'COMPLETED',
          mutationScore: 50.0,
          killedCount: 1,
          survivedCount: 1,
          equivalentCount: 0,
          mutants: [
            { mutantId: `err-${st}`, baselineExecutionStatus: st, currentClassification: st, equivalent: false }
          ],
          createdAt: new Date(),
          updatedAt: new Date()
        });

        const res = await request(app)
          .patch(`/api/v1/questions/${question._id}/mutation-runs/${errorRaw.insertedId}/mutants/err-${st}/classification`)
          .set('Authorization', `Bearer ${teacherToken}`)
          .send({
            newClassification: 'EQUIVALENT',
            reason: `Attempting to classify ${st} mutant as equivalent`
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
        expect(res.body.error.code).toBe('INVALID_CLASSIFICATION_TRANSITION');

        await MutationReport.deleteOne({ _id: errorRaw.insertedId });
      }
    });
  });

  describe('3. Authorization & Access Control', () => {
    test('Other teacher cannot modify mutation report (Cross-teacher access rejected with 403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-survived-1/classification`)
        .set('Authorization', `Bearer ${otherTeacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Attempted classification by unauthorized faculty member'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
    });

    test('Student cannot access classification endpoint (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-survived-1/classification`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Attempted classification by student'
        });

      expect(res.status).toBe(403);
    });

    test('Admin user has permission to classify mutants', async () => {
      const res = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-survived-1/classification`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Administrative review confirming equivalence'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.currentClassification).toBe('EQUIVALENT');
    });
  });

  describe('4. Concurrency Protection & Optimistic Concurrency Control (OCC)', () => {
    test('Concurrent classification request with stale version fails with 409 Conflict', async () => {
      const initialReport = await MutationReport.findById(report._id);
      const staleVersion = initialReport.__v;

      // Request 1 updates mutant 1 -> increments __v to staleVersion + 1
      const res1 = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-survived-1/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Legitimate first update',
          expectedVersion: staleVersion
        });
      expect(res1.status).toBe(200);

      // Competing Request 2 passes the staleVersion -> must fail with 409 Conflict
      const res2 = await request(app)
        .patch(`/api/v1/questions/${question._id}/mutation-runs/${report._id}/mutants/m-survived-2/classification`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          newClassification: 'EQUIVALENT',
          reason: 'Competing update based on stale view',
          expectedVersion: staleVersion // Stale version!
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('CONCURRENT_MODIFICATION');

      // Database assertion: Mutant 2 was not modified by the stale request
      const finalReport = await MutationReport.findById(report._id);
      const m2 = finalReport.mutants.find((item) => item.mutantId === 'm-survived-2');
      expect(m2.currentClassification).toBe('SURVIVED');
      expect(m2.auditHistory.length).toBe(0);
    });

    test('Simultaneous competing updates on the same mutant preserve audit history without overwrites', async () => {
      // Simulate two racing service calls
      const promise1 = updateMutantClassification({
        reportId: report._id.toString(),
        mutantId: 'm-survived-1',
        newClassification: 'EQUIVALENT',
        reason: 'Race attempt 1',
        user: teacherUser,
        expectedVersion: report.__v
      });

      const promise2 = updateMutantClassification({
        reportId: report._id.toString(),
        mutantId: 'm-survived-1',
        newClassification: 'EQUIVALENT',
        reason: 'Race attempt 2',
        user: teacherUser,
        expectedVersion: report.__v
      });

      const results = await Promise.allSettled([promise1, promise2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0].reason.statusCode).toBe(409);

      const finalReport = await MutationReport.findById(report._id);
      const m = finalReport.mutants.find((item) => item.mutantId === 'm-survived-1');
      expect(m.auditHistory.length).toBe(1); // Exactly one audit history entry written
    });
  });

  describe('5. Safe Migration for Legacy Reports', () => {
    let legacyReportId;

    beforeEach(async () => {
      // Create a genuine legacy report missing Phase 4 fields
      const res = await MutationReport.collection.insertOne({
        questionId: question._id,
        teacherId: teacherUser._id,
        status: 'COMPLETED',
        mutationScore: 60.0,
        killedCount: 3,
        survivedCount: 2,
        equivalentCount: 0,
        mutants: [
          { mutantId: 'legacy-1', executionStatus: 'KILLED', equivalent: false },
          { mutantId: 'legacy-2', executionStatus: 'SURVIVED', equivalent: false },
          { mutantId: 'legacy-3', executionStatus: 'SURVIVED', equivalent: true }
          // baselineExecutionStatus, currentClassification, auditHistory intentionally absent
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      });
      legacyReportId = res.insertedId;
    });

    afterEach(async () => {
      await MutationReport.deleteOne({ _id: legacyReportId });
    });

    test('Migrates missing fields individually while preserving historical execution results and score', async () => {
      const summary = await migrateHistoricalMutationReports({ silent: true });
      expect(summary.baselineUpdatedCount).toBeGreaterThanOrEqual(3);
      expect(summary.classificationUpdatedCount).toBeGreaterThanOrEqual(3);
      expect(summary.auditHistoryUpdatedCount).toBeGreaterThanOrEqual(3);

      const migrated = await MutationReport.findById(legacyReportId);
      expect(migrated.mutationScore).toBe(60.0); // Exact score preserved!

      const m1 = migrated.mutants.find((m) => m.mutantId === 'legacy-1');
      expect(m1.baselineExecutionStatus).toBe('KILLED');
      expect(m1.currentClassification).toBe('KILLED');
      expect(m1.auditHistory).toEqual([]);

      const m2 = migrated.mutants.find((m) => m.mutantId === 'legacy-2');
      expect(m2.baselineExecutionStatus).toBe('SURVIVED');
      expect(m2.currentClassification).toBe('SURVIVED');

      const m3 = migrated.mutants.find((m) => m.mutantId === 'legacy-3');
      expect(m3.baselineExecutionStatus).toBe('SURVIVED');
      expect(m3.currentClassification).toBe('EQUIVALENT'); // Derived from equivalent=true
    });

    test('Migration is strictly idempotent on rerun', async () => {
      await migrateHistoricalMutationReports({ silent: true });
      const rerun = await migrateHistoricalMutationReports({ silent: true });
      expect(rerun.baselineUpdatedCount).toBe(0);
      expect(rerun.classificationUpdatedCount).toBe(0);
      expect(rerun.auditHistoryUpdatedCount).toBe(0);
    });

    test('Migration does not overwrite concurrent teacher classification', async () => {
      // Simulate teacher reviewing legacy-2 right before migration update runs
      await MutationReport.updateOne(
        { _id: legacyReportId, 'mutants.mutantId': 'legacy-2' },
        {
          $set: {
            'mutants.$.baselineExecutionStatus': 'SURVIVED',
            'mutants.$.currentClassification': 'EQUIVALENT',
            'mutants.$.auditHistory': [{
              auditId: 'audit-pre-mig',
              previousClassification: 'SURVIVED',
              newClassification: 'EQUIVALENT',
              reason: 'Teacher classified before migration sweep',
              timestamp: new Date()
            }]
          }
        }
      );

      // Run migration
      await migrateHistoricalMutationReports({ silent: true });

      const finalReport = await MutationReport.findById(legacyReportId);
      const m2 = finalReport.mutants.find((m) => m.mutantId === 'legacy-2');
      expect(m2.currentClassification).toBe('EQUIVALENT'); // Teacher classification NOT overwritten!
      expect(m2.auditHistory.length).toBe(1);
      expect(m2.auditHistory[0].reason).toBe('Teacher classified before migration sweep');
    });
  });

  describe('6. Hardened Tagged Canonicalization & Execution Fingerprint', () => {
    test('Deterministic UTF-16 code-point ordering across permutations', () => {
      const q1 = {
        title: 'Two Sum Problem',
        referenceSolution: 'return 1;',
        referenceSolutions: new Map([['python', 'codeA'], ['java', 'codeB']]),
        functionSignature: {
          parameters: [{ name: 'b', order: 1 }, { name: 'a', order: 0 }]
        }
      };

      const q2 = {
        title: 'Two Sum Problem',
        referenceSolution: 'return 1;',
        referenceSolutions: new Map([['java', 'codeB'], ['python', 'codeA']]),
        functionSignature: {
          parameters: [{ name: 'a', order: 0 }, { name: 'b', order: 1 }]
        }
      };

      expect(computeExecutionFingerprint(q1)).toBe(computeExecutionFingerprint(q2));
    });

    test('Rejects non-plain objects and invalid values with controlled TypeError', () => {
      expect(() => canonicalizeTagged(/abc/g)).toThrow(TypeError);
      expect(() => canonicalizeTagged(Buffer.from('hello'))).toThrow(TypeError);
      expect(() => canonicalizeTagged(new Date('invalid'))).toThrow(TypeError);
      expect(() => canonicalizeTagged(NaN)).toThrow(TypeError);
      expect(() => canonicalizeTagged(Infinity)).toThrow(TypeError);
      expect(() => canonicalizeTagged({ [Symbol('key')]: 1 })).toThrow(TypeError);
    });

    test('Detects cyclic structures and throws controlled TypeError', () => {
      const cycle = {};
      cycle.self = cycle;
      expect(() => canonicalizeTagged(cycle)).toThrow(TypeError);
    });
  });
});

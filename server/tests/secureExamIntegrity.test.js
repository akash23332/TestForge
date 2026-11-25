import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { Submission } from '../src/models/Submission.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { GLOBAL_SECURE_EXAM_POLICY } from '../src/config/securityPolicy.js';

describe('Secure Exam Mode - Progressive Tab-Switch Enforcement & Exam-Only Fullscreen', () => {
  const jwtSecret = config.jwt.secret || 'test_secret_for_jwt_tokens_min_32_chars';
  let examId;
  let attemptId;
  let attemptToken;
  let server;

  beforeAll((done) => {
    examId = new mongoose.Types.ObjectId();
    attemptId = new mongoose.Types.ObjectId();

    attemptToken = jwt.sign(
      { attemptId: attemptId.toString(), role: 'candidate' },
      jwtSecret,
      { expiresIn: '3h' }
    );

    server = app.listen(0, '127.0.0.1', done);
  });

  afterAll((done) => {
    if (server) server.close(done);
    else done();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Global Policy Configuration', () => {
    test('Defines progressive policy thresholds and autoSubmitReason', () => {
      expect(GLOBAL_SECURE_EXAM_POLICY.warningThreshold).toBe(1);
      expect(GLOBAL_SECURE_EXAM_POLICY.finalWarningThreshold).toBe(2);
      expect(GLOBAL_SECURE_EXAM_POLICY.lockThreshold).toBe(3);
      expect(GLOBAL_SECURE_EXAM_POLICY.autoSubmitThreshold).toBe(4);
      expect(GLOBAL_SECURE_EXAM_POLICY.maxTabSwitches).toBe(4);
      expect(GLOBAL_SECURE_EXAM_POLICY.graduatedPolicy.level1).toBeDefined();
      expect(GLOBAL_SECURE_EXAM_POLICY.graduatedPolicy.level2).toBeDefined();
      expect(GLOBAL_SECURE_EXAM_POLICY.graduatedPolicy.level3).toBeDefined();
      expect(GLOBAL_SECURE_EXAM_POLICY.graduatedPolicy.level4).toBeDefined();
    });
  });

  describe('2. Progressive Tab-Switch Enforcement Sequence', () => {
    test('1st Tab Switch: returns warning level 1, isLocked false, autoSubmitted false', async () => {
      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        tabSwitchCount: 0,
        blurCount: 0,
        fullscreenExitCount: 0,
        clipboardViolationCount: 0,
        totalViolations: 0,
        needsReview: false,
        reviewReason: null,
        lastHeartbeat: new Date(),
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(ActivityLog, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue(null)
      });
      jest.spyOn(ActivityLog, 'create').mockResolvedValue({});

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/activity`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({ eventType: 'TAB_SWITCH', details: 'Candidate switched tab' });

      expect(res.status).toBe(200);
      expect(res.body.data.tabSwitchCount).toBe(1);
      expect(res.body.data.violationLevel).toBe(1);
      expect(res.body.data.isLocked).toBe(false);
      expect(res.body.data.autoSubmitted).toBe(false);
      expect(res.body.data.needsReview).toBe(false);
      expect(mockAttempt.status).toBe('IN_PROGRESS');
    });

    test('2nd Tab Switch: returns final warning level 2, isLocked false, autoSubmitted false', async () => {
      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        tabSwitchCount: 1,
        blurCount: 0,
        fullscreenExitCount: 0,
        clipboardViolationCount: 0,
        totalViolations: 1,
        needsReview: false,
        reviewReason: null,
        lastHeartbeat: new Date(),
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(ActivityLog, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          eventType: 'TAB_SWITCH',
          timestamp: new Date(Date.now() - 10000)
        })
      });
      jest.spyOn(ActivityLog, 'create').mockResolvedValue({});

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/activity`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({ eventType: 'TAB_SWITCH', details: 'Candidate switched tab again' });

      expect(res.status).toBe(200);
      expect(res.body.data.tabSwitchCount).toBe(2);
      expect(res.body.data.violationLevel).toBe(2);
      expect(res.body.data.isLocked).toBe(false);
      expect(res.body.data.autoSubmitted).toBe(false);
      expect(res.body.data.needsReview).toBe(false);
      expect(mockAttempt.status).toBe('IN_PROGRESS');
    });

    test('3rd Tab Switch: returns lock level 3, isLocked true, flags needsReview true, attempt remains IN_PROGRESS', async () => {
      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        tabSwitchCount: 2,
        blurCount: 0,
        fullscreenExitCount: 0,
        clipboardViolationCount: 0,
        totalViolations: 2,
        needsReview: false,
        reviewReason: null,
        lastHeartbeat: new Date(),
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(ActivityLog, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          eventType: 'TAB_SWITCH',
          timestamp: new Date(Date.now() - 10000)
        })
      });
      jest.spyOn(ActivityLog, 'create').mockResolvedValue({});

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/activity`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({ eventType: 'TAB_SWITCH', details: 'Candidate switched tab third time' });

      expect(res.status).toBe(200);
      expect(res.body.data.tabSwitchCount).toBe(3);
      expect(res.body.data.violationLevel).toBe(3);
      expect(res.body.data.isLocked).toBe(true);
      expect(res.body.data.needsReview).toBe(true);
      expect(res.body.data.autoSubmitted).toBe(false);
      expect(mockAttempt.status).toBe('IN_PROGRESS');
      expect(mockAttempt.needsReview).toBe(true);
      expect(mockAttempt.reviewReason).toContain('3 tab switches');
    });

    test('4th Tab Switch: triggers atomic automatic submission, marks autoSubmitted and needsReview', async () => {
      const mockAttempt = {
        _id: attemptId,
        examId,
        status: 'IN_PROGRESS',
        tabSwitchCount: 3,
        blurCount: 0,
        fullscreenExitCount: 0,
        clipboardViolationCount: 0,
        totalViolations: 3,
        needsReview: true,
        reviewReason: '3 integrity events recorded: 3 tab switches',
        lastHeartbeat: new Date(),
        totalScore: 40,
        maxScore: 100,
        percentage: 40,
        save: jest.fn().mockResolvedValue(true)
      };

      // ExamAttempt.findById is called first in recordActivity, then in recalculateAttemptGrading
      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

      const mockSubQuery = Promise.resolve([]);
      mockSubQuery.select = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });
      jest.spyOn(Submission, 'find').mockReturnValue(mockSubQuery);

      jest.spyOn(ActivityLog, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          eventType: 'TAB_SWITCH',
          timestamp: new Date(Date.now() - 10000)
        })
      });
      jest.spyOn(ActivityLog, 'create').mockResolvedValue({});

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/activity`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({ eventType: 'TAB_SWITCH', details: 'Candidate switched tab fourth time' });

      expect(res.status).toBe(200);
      expect(res.body.data.tabSwitchCount).toBe(4);
      expect(res.body.data.autoSubmitted).toBe(true);
      expect(res.body.data.autoSubmitReason).toBe('Exceeded maximum permitted tab switches (4 violations)');
      expect(res.body.data.isLocked).toBe(true);
      expect(res.body.data.violationLevel).toBe(4);
      expect(res.body.data.status).toBe('SUBMITTED');
      expect(mockAttempt.status).toBe('SUBMITTED');
      expect(mockAttempt.autoSubmitted).toBe(true);
      expect(mockAttempt.save).toHaveBeenCalled();
    });
  });

  describe('3. Separation of Fullscreen Exits from Tab Switches', () => {
    test('FULLSCREEN_EXIT does NOT increment tabSwitchCount and does NOT trigger auto-submission', async () => {
      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        tabSwitchCount: 3,
        blurCount: 0,
        fullscreenExitCount: 1,
        clipboardViolationCount: 0,
        totalViolations: 4,
        needsReview: true,
        reviewReason: '4 integrity events recorded',
        lastHeartbeat: new Date(),
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(ActivityLog, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue(null)
      });
      jest.spyOn(ActivityLog, 'create').mockResolvedValue({});

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/activity`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({ eventType: 'FULLSCREEN_EXIT', details: 'Candidate pressed Escape' });

      expect(res.status).toBe(200);
      expect(res.body.data.tabSwitchCount).toBe(3); // Unchanged!
      expect(res.body.data.fullscreenExitCount).toBe(2);
      expect(res.body.data.autoSubmitted).toBe(false); // NOT auto-submitted
      expect(mockAttempt.status).toBe('IN_PROGRESS');
    });
  });

  describe('4. Post-Submission Activity Invalidation', () => {
    test('Rejects activity recording when attempt is already SUBMITTED', async () => {
      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        tabSwitchCount: 4,
        autoSubmitted: true
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/activity`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({ eventType: 'TAB_SWITCH', details: 'Post submit event' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("status 'SUBMITTED'");
    });
  });
});

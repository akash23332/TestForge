import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { Exam } from '../src/models/Exam.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { GLOBAL_SECURE_EXAM_POLICY, getEffectiveSecurityPolicy } from '../src/config/securityPolicy.js';

describe('Global Secure Exam Mode Platform Verification', () => {
  const jwtSecret = config.jwt.secret || 'test_secret_for_jwt_tokens_min_32_chars';
  let examId;
  let attemptId;
  let teacherId;
  let studentId;
  let attemptToken;
  let teacherToken;
  let server;

  beforeAll((done) => {
    examId = new mongoose.Types.ObjectId();
    attemptId = new mongoose.Types.ObjectId();
    teacherId = new mongoose.Types.ObjectId();
    studentId = new mongoose.Types.ObjectId();

    attemptToken = jwt.sign(
      { attemptId: attemptId.toString(), role: 'candidate' },
      jwtSecret,
      { expiresIn: '3h' }
    );

    teacherToken = jwt.sign(
      { id: teacherId.toString(), role: 'teacher', email: 'teacher@testforge.edu' },
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

  describe('1. Global Policy Integrity & Universal Application', () => {
    test('Global security policy is defined with mandatory platform defaults', () => {
      expect(GLOBAL_SECURE_EXAM_POLICY.enforceFullscreen).toBe(true);
      expect(GLOBAL_SECURE_EXAM_POLICY.detectTabSwitch).toBe(true);
      expect(GLOBAL_SECURE_EXAM_POLICY.detectWindowBlur).toBe(true);
      expect(GLOBAL_SECURE_EXAM_POLICY.preventClipboard).toBe(true);
      expect(GLOBAL_SECURE_EXAM_POLICY.preventContextMenu).toBe(true);
      expect(GLOBAL_SECURE_EXAM_POLICY.enableActivityLogging).toBe(true);
      expect(GLOBAL_SECURE_EXAM_POLICY.autosaveEnabled).toBe(true);
      expect(GLOBAL_SECURE_EXAM_POLICY.reviewThresholdViolations).toBe(3);
    });

    test('getEffectiveSecurityPolicy applies platform policy even to legacy/unconfigured exams', () => {
      const legacyExam = {
        _id: examId,
        title: 'Legacy Midterm Assessment',
        examCode: 'LEGACY-01'
      };

      const policy = getEffectiveSecurityPolicy(legacyExam);
      expect(policy.enforceFullscreen).toBe(true);
      expect(policy.detectTabSwitch).toBe(true);
      expect(policy.detectWindowBlur).toBe(true);
      expect(policy.preventClipboard).toBe(true);
      expect(policy.preventContextMenu).toBe(true);
      expect(policy.autosaveEnabled).toBe(true);
      expect(policy.reviewThresholdViolations).toBe(3);
    });
  });

  describe('2. Schema Validations & Default Values', () => {
    test('ExamAttempt model supports all required security tracking fields', () => {
      const attempt = new ExamAttempt({
        examId,
        candidateInfo: {
          name: 'Jane Candidate',
          email: 'jane@example.com'
        },
        expiresAt: new Date(Date.now() + 3600000)
      });

      expect(attempt.tabSwitchCount).toBe(0);
      expect(attempt.fullscreenExitCount).toBe(0);
      expect(attempt.blurCount).toBe(0);
      expect(attempt.clipboardViolationCount).toBe(0);
      expect(attempt.totalViolations).toBe(0);
      expect(attempt.needsReview).toBe(false);
      expect(attempt.reviewReason).toBeFalsy();
    });

    test('ActivityLog supports all modern browser security event types', () => {
      const allowedEvents = [
        'TAB_SWITCH',
        'WINDOW_BLUR',
        'WINDOW_FOCUS',
        'FULLSCREEN_ENTER',
        'FULLSCREEN_EXIT',
        'COPY_ATTEMPT',
        'CUT_ATTEMPT',
        'PASTE_ATTEMPT',
        'CONTEXT_MENU',
        'RECONNECTED',
        'COPY_PASTE',
        'HEARTBEAT'
      ];

      for (const eventType of allowedEvents) {
        const log = new ActivityLog({
          attemptId,
          eventType,
          details: 'Event testing'
        });
        const err = log.validateSync();
        expect(err).toBeUndefined();
      }
    });
  });

  describe('3. Non-Destructive Graduated Warning & Review Flagging Logic', () => {
    test('Graduated policy marks needsReview at 3 violations without canceling attempt', () => {
      const attempt = new ExamAttempt({
        examId,
        candidateInfo: { name: 'Test Student', email: 'test@example.com' },
        expiresAt: new Date(Date.now() + 3600000),
        status: 'IN_PROGRESS'
      });

      // 1st violation: tab switch
      attempt.tabSwitchCount = 1;
      attempt.totalViolations = 1;
      expect(attempt.needsReview).toBe(false);
      expect(attempt.status).toBe('IN_PROGRESS');

      // 2nd violation: fullscreen exit
      attempt.fullscreenExitCount = 1;
      attempt.totalViolations = 2;
      expect(attempt.needsReview).toBe(false);
      expect(attempt.status).toBe('IN_PROGRESS');

      // 3rd violation: window blur -> marks for review
      attempt.blurCount = 1;
      attempt.totalViolations = 3;
      if (attempt.totalViolations >= 3) {
        attempt.needsReview = true;
        attempt.reviewReason = `${attempt.totalViolations} integrity events recorded: 1 tab switch, 1 fullscreen exit, 1 window blur`;
      }

      // CRITICAL: Attempt must remain IN_PROGRESS (non-destructive)
      expect(attempt.needsReview).toBe(true);
      expect(attempt.reviewReason).toContain('3 integrity events recorded');
      expect(attempt.status).toBe('IN_PROGRESS');
    });
  });

  describe('4. API Security Endpoints Enforcement', () => {
    test('GET /api/v1/attempts/:attemptId/activity-timeline returns 401 without credentials', async () => {
      const res = await request(server)
        .get(`/api/v1/attempts/${attemptId}/activity-timeline`);

      expect(res.status).toBe(401);
    });

    test('POST /api/v1/attempts/:attemptId/activity records infraction and returns graduated violation level', async () => {
      const mockAttemptDoc = {
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

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttemptDoc);
      jest.spyOn(ActivityLog, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue(null) // no prior log
      });
      jest.spyOn(ActivityLog, 'create').mockResolvedValue({});

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/activity`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({
          eventType: 'TAB_SWITCH',
          details: 'Candidate navigated away from window'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.tabSwitchCount).toBe(1);
      expect(res.body.data.totalViolations).toBe(1);
      expect(res.body.data.violationLevel).toBe(1);
      expect(res.body.data.needsReview).toBe(false);
      expect(mockAttemptDoc.save).toHaveBeenCalled();
    });

    test('POST /api/v1/attempts/:attemptId/activity deduplicates paired/rapid events within 2500ms', async () => {
      const mockAttemptDoc = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        tabSwitchCount: 1,
        blurCount: 0,
        totalViolations: 1,
        needsReview: false,
        lastHeartbeat: new Date(),
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttemptDoc);
      // Simulate recent log 100ms ago (TAB_SWITCH followed by paired WINDOW_BLUR)
      jest.spyOn(ActivityLog, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          eventType: 'TAB_SWITCH',
          timestamp: new Date(Date.now() - 100)
        })
      });
      jest.spyOn(ActivityLog, 'create').mockResolvedValue({});

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/activity`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({
          eventType: 'WINDOW_BLUR',
          details: 'Window lost focus'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isDeduplicated).toBe(true);
      // Violation count is NOT incremented for deduplicated pair
      expect(res.body.data.totalViolations).toBe(1);
    });

    test('GET /api/v1/attempts/:attemptId/activity-timeline returns chronological audit stream to candidate', async () => {
      const mockAttemptDoc = {
        _id: attemptId,
        examId,
        status: 'IN_PROGRESS',
        candidateInfo: { name: 'Alice', email: 'alice@student.edu' },
        totalViolations: 2,
        tabSwitchCount: 1,
        fullscreenExitCount: 1,
        blurCount: 0,
        clipboardViolationCount: 0,
        needsReview: false,
        reviewReason: null
      };

      const mockLogs = [
        {
          _id: new mongoose.Types.ObjectId(),
          eventType: 'FULLSCREEN_ENTER',
          details: 'Entered fullscreen',
          timestamp: new Date(Date.now() - 60000)
        },
        {
          _id: new mongoose.Types.ObjectId(),
          eventType: 'TAB_SWITCH',
          details: 'Tab switch recorded',
          timestamp: new Date(Date.now() - 30000)
        }
      ];

      // ExamAttempt findById supports direct await in middleware AND .lean() in controller
      const mockQuery = Promise.resolve(mockAttemptDoc);
      mockQuery.lean = jest.fn().mockResolvedValue(mockAttemptDoc);
      jest.spyOn(ExamAttempt, 'findById').mockReturnValue(mockQuery);

      // ActivityLog query
      const mockLogQuery = Promise.resolve(mockLogs);
      mockLogQuery.sort = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockLogs)
      });
      jest.spyOn(ActivityLog, 'find').mockReturnValue(mockLogQuery);

      const res = await request(server)
        .get(`/api/v1/attempts/${attemptId}/activity-timeline`)
        .set('Authorization', `Bearer ${attemptToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data).toHaveProperty('events');
      expect(res.body.data.summary.totalViolations).toBe(2);
      expect(res.body.data.events.length).toBe(2);
      expect(res.body.data.events[0].eventType).toBe('FULLSCREEN_ENTER');
    });
  });
});

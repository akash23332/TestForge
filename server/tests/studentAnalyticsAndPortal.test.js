import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import {
  getStudentAnalytics,
  getStudentNotifications,
  markNotificationRead
} from '../src/controllers/attempt.controller.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { Exam } from '../src/models/Exam.js';
import { User } from '../src/models/User.js';

describe('Student Analytics & Portal Endpoints Integration', () => {
  const studentId = new mongoose.Types.ObjectId().toString();
  const examId = new mongoose.Types.ObjectId().toString();

  const studentUser = {
    _id: studentId,
    name: 'Alex Rivera',
    email: 'student@testforge.edu',
    role: 'student'
  };

  const createMockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = jest.fn().mockImplementation((code) => {
      res.statusCode = code;
      return res;
    });
    res.json = jest.fn().mockImplementation((data) => {
      res.body = data;
      return res;
    });
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1. getStudentAnalytics returns aggregated metrics, count-ups, and score progression', async () => {
    const mockAttempts = [
      {
        _id: new mongoose.Types.ObjectId().toString(),
        studentId,
        candidateInfo: { email: 'student@testforge.edu', name: 'Alex Rivera' },
        status: 'submitted',
        score: 88,
        createdAt: new Date('2026-11-01T10:00:00Z'),
        submittedAt: new Date('2026-11-01T11:30:00Z'),
        examId: {
          _id: examId,
          title: 'Data Structures Midterm',
          totalMarks: 100
        }
      }
    ];

    jest.spyOn(ExamAttempt, 'find').mockReturnValue({
      populate: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockAttempts)
        })
      })
    });

    jest.spyOn(Exam, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: new mongoose.Types.ObjectId().toString(), status: 'LIVE', title: 'OS Exam' }
      ])
    });

    const req = { user: studentUser };
    const res = createMockRes();
    const next = jest.fn();

    await getStudentAnalytics(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('metrics');
    expect(res.body.data.metrics.testsAttempted).toBe(1);
    expect(res.body.data.metrics.completed).toBe(1);
    expect(res.body.data.metrics.averageScore).toBe(88);
    expect(res.body.data).toHaveProperty('scoreProgression');
    expect(res.body.data).toHaveProperty('subjectPerformance');
    expect(Array.isArray(res.body.data.scoreProgression)).toBe(true);
    expect(res.body.data.scoreProgression.length).toBeGreaterThan(0);
  });

  it('2. getStudentNotifications returns notification stream and unread count', async () => {
    jest.spyOn(Exam, 'find').mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: new mongoose.Types.ObjectId().toString(),
              title: 'Database Systems & SQL Optimization',
              examCode: 'TF-SQL02',
              durationMinutes: 60,
              totalMarks: 80,
              status: 'LIVE'
            }
          ])
        })
      })
    });

    const req = { user: studentUser };
    const res = createMockRes();
    const next = jest.fn();

    await getStudentNotifications(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('notifications');
    expect(res.body.data).toHaveProperty('unreadCount');
    expect(Array.isArray(res.body.data.notifications)).toBe(true);
    expect(res.body.data.notifications.length).toBeGreaterThan(0);
  });

  it('3. markNotificationRead successfully returns read: true for notification ID', async () => {
    const req = { user: studentUser, params: { id: 'notif_welcome' } };
    const res = createMockRes();
    const next = jest.fn();

    await markNotificationRead(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.read).toBe(true);
    expect(res.body.data.id).toBe('notif_welcome');
  });

  it('4. A student with zero attempts receives zero metrics and empty arrays', async () => {
    jest.spyOn(ExamAttempt, 'find').mockReturnValue({
      populate: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      })
    });

    jest.spyOn(Exam, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    });

    const req = { user: studentUser };
    const res = createMockRes();
    const next = jest.fn();

    await getStudentAnalytics(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data.metrics.testsAttempted).toBe(0);
    expect(res.body.data.metrics.completed).toBe(0);
    expect(res.body.data.metrics.averageScore).toBe(0);
    expect(res.body.data.metrics.streak).toBe(0);
    expect(res.body.data.scoreProgression).toEqual([]);
    expect(res.body.data.subjectPerformance).toEqual([]);
  });
});

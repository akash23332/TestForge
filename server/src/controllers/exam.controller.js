import crypto from 'crypto';
import { Exam } from '../models/Exam.js';
import { ExamAttempt } from '../models/ExamAttempt.js';
import { StudentAnswer } from '../models/StudentAnswer.js';
import { Question } from '../models/Question.js';
import { TestCase } from '../models/TestCase.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';

/**
 * Generate a unique 6-character alphanumeric exam access code
 */
const generateExamCode = async () => {
  let unique = false;
  let code = '';
  while (!unique) {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    code = `TF-${randomHex}`;
    const existing = await Exam.findOne({ examCode: code });
    if (!existing) {
      unique = true;
    }
  }
  return code;
};

/**
 * Teacher creates a new exam
 */
export const createExam = async (req, res, next) => {
  try {
    const {
      title,
      description,
      durationMinutes,
      sections,
      instructions,
      accessMode,
      settings,
      proctoringSettings,
      status,
      schedule
    } = req.body;

    if (!title || !title.trim()) {
      throw ApiError.badRequest('Exam title is required.');
    }

    const examCode = await generateExamCode();

    const exam = await Exam.create({
      examCode,
      title: title.trim(),
      description: description || '',
      durationMinutes: durationMinutes || 60,
      createdBy: req.user._id,
      sections: sections || [],
      instructions: instructions && instructions.length ? instructions : undefined,
      accessMode: accessMode || 'PUBLIC_CODE',
      settings: settings || {},
      proctoringSettings: proctoringSettings || {},
      status: status || 'LIVE',
      schedule: schedule || {}
    });

    return ApiResponse.success(res, 201, exam, 'Exam created and published successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Teacher retrieves all exams they authored
 */
export const getTeacherExams = async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' && req.query.all === 'true'
      ? {}
      : { createdBy: req.user._id };

    const exams = await Exam.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    // Attach candidate attempt counts
    const examIds = exams.map((e) => e._id);
    const attempts = await ExamAttempt.aggregate([
      { $match: { examId: { $in: examIds } } },
      {
        $group: {
          _id: '$examId',
          totalCandidates: { $sum: 1 },
          completedCandidates: {
            $sum: { $cond: [{ $in: ['$status', ['SUBMITTED', 'TIMED_OUT']] }, 1, 0] }
          },
          avgScore: { $avg: '$percentage' }
        }
      }
    ]);

    const statsMap = {};
    for (const item of attempts) {
      statsMap[item._id.toString()] = item;
    }

    const enhancedExams = exams.map((exam) => {
      const stat = statsMap[exam._id.toString()] || {
        totalCandidates: 0,
        completedCandidates: 0,
        avgScore: 0
      };
      return {
        ...exam,
        stats: {
          totalCandidates: stat.totalCandidates,
          completedCandidates: stat.completedCandidates,
          avgScore: Math.round(stat.avgScore || 0)
        }
      };
    });

    return ApiResponse.success(res, 200, enhancedExams, 'Teacher exams retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Teacher retrieves a single exam with question references populated
 */
export const getExamById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, createdBy: req.user._id };
    const exam = await Exam.findOne(filter)
      .populate('sections.questions.questionId')
      .lean();

    if (!exam) {
      throw ApiError.notFound('Exam not found or you do not have permission.');
    }

    return ApiResponse.success(res, 200, exam, 'Exam details retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Teacher updates an exam
 */
export const updateExam = async (req, res, next) => {
  try {
    const { id } = req.params;
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, createdBy: req.user._id };
    const exam = await Exam.findOne(filter);

    if (!exam) {
      throw ApiError.notFound('Exam not found or access denied.');
    }

    const allowedUpdates = [
      'title',
      'description',
      'durationMinutes',
      'sections',
      'instructions',
      'accessMode',
      'settings',
      'proctoringSettings',
      'status',
      'schedule'
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        exam[field] = req.body[field];
      }
    });

    await exam.save();
    return ApiResponse.success(res, 200, exam, 'Exam updated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Teacher deletes an exam
 */
export const deleteExam = async (req, res, next) => {
  try {
    const { id } = req.params;
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, createdBy: req.user._id };
    const exam = await Exam.findOneAndDelete(filter);

    if (!exam) {
      throw ApiError.notFound('Exam not found or access denied.');
    }

    return ApiResponse.success(res, 200, null, 'Exam deleted successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Teacher retrieves live leaderboard and candidate attempts
 */
export const getExamAnalytics = async (req, res, next) => {
  try {
    const { id } = req.params;
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, createdBy: req.user._id };
    const exam = await Exam.findOne(filter);

    if (!exam) {
      throw ApiError.notFound('Exam not found or access denied.');
    }

    const attempts = await ExamAttempt.find({ examId: id })
      .sort({ totalScore: -1, submittedAt: 1 })
      .lean();

    return ApiResponse.success(
      res,
      200,
      {
        exam: {
          _id: exam._id,
          title: exam.title,
          examCode: exam.examCode,
          durationMinutes: exam.durationMinutes,
          totalMarks: exam.totalMarks,
          status: exam.status
        },
        attempts
      },
      'Exam analytics and candidate leaderboard retrieved.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Teacher retrieves aggregated workspace creation activity (Assessments vs Questions)
 */
export const getWorkspaceActivity = async (req, res, next) => {
  try {
    const { range = '7d', startDate, endDate } = req.query;

    const now = new Date();
    let start;
    let end = new Date(now);
    let aggregation = 'daily';

    if (range === '7d') {
      start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      aggregation = 'daily';
    } else if (range === '30d') {
      start = new Date(now);
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      aggregation = 'daily';
    } else if (range === '90d') {
      start = new Date(now);
      start.setDate(now.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      aggregation = 'weekly';
    } else if (range === 'this_year') {
      start = new Date(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      aggregation = 'monthly';
    } else if (range === 'custom') {
      start = startDate ? new Date(startDate) : new Date(now.getTime() - 7 * 86400000);
      end = endDate ? new Date(endDate) : new Date(now);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      if (diffDays <= 31) aggregation = 'daily';
      else if (diffDays <= 120) aggregation = 'weekly';
      else aggregation = 'monthly';
    } else {
      start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      aggregation = 'daily';
    }

    const userId = req.user._id;

    // Fetch actual database records strictly within timestamp boundaries
    const [exams, questions] = await Promise.all([
      Exam.find({
        createdBy: userId,
        createdAt: { $gte: start, $lte: end }
      })
        .select('title examCode durationMinutes status createdAt')
        .sort({ createdAt: 1 })
        .lean(),
      Question.find({
        ownerId: userId,
        createdAt: { $gte: start, $lte: end }
      })
        .select('title language difficulty isVerified createdAt')
        .sort({ createdAt: 1 })
        .lean()
    ]);

    const buckets = [];

    if (aggregation === 'daily') {
      const current = new Date(start);
      while (current <= end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;

        const dayStart = new Date(current);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(current);
        dayEnd.setHours(23, 59, 59, 999);

        const dayExams = exams.filter((e) => {
          const t = new Date(e.createdAt).getTime();
          return t >= dayStart.getTime() && t <= dayEnd.getTime();
        });

        const dayQuestions = questions.filter((q) => {
          const t = new Date(q.createdAt).getTime();
          return t >= dayStart.getTime() && t <= dayEnd.getTime();
        });

        const label = current.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        const fullDate = current.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

        buckets.push({
          key: dateKey,
          label,
          fullDate,
          assessmentsCount: dayExams.length,
          questionsCount: dayQuestions.length,
          totalCount: dayExams.length + dayQuestions.length,
          assessments: dayExams,
          questions: dayQuestions
        });

        current.setDate(current.getDate() + 1);
      }
    } else if (aggregation === 'weekly') {
      const current = new Date(start);
      let weekNum = 1;
      while (current <= end) {
        const weekStart = new Date(current);
        const weekEnd = new Date(current);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd > end) weekEnd.setTime(end.getTime());
        weekEnd.setHours(23, 59, 59, 999);

        const weekExams = exams.filter((e) => {
          const t = new Date(e.createdAt).getTime();
          return t >= weekStart.getTime() && t <= weekEnd.getTime();
        });
        const weekQuestions = questions.filter((q) => {
          const t = new Date(q.createdAt).getTime();
          return t >= weekStart.getTime() && t <= weekEnd.getTime();
        });

        const sLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const eLabel = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        buckets.push({
          key: `W${weekNum}-${sLabel}`,
          label: sLabel,
          fullDate: `${sLabel} - ${eLabel}`,
          assessmentsCount: weekExams.length,
          questionsCount: weekQuestions.length,
          totalCount: weekExams.length + weekQuestions.length,
          assessments: weekExams,
          questions: weekQuestions
        });

        current.setDate(current.getDate() + 7);
        weekNum++;
      }
    } else {
      // Monthly aggregation
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        const mStart = new Date(current.getFullYear(), current.getMonth(), 1, 0, 0, 0, 0);
        const mEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);

        const mExams = exams.filter((e) => {
          const t = new Date(e.createdAt).getTime();
          return t >= mStart.getTime() && t <= mEnd.getTime();
        });
        const mQuestions = questions.filter((q) => {
          const t = new Date(q.createdAt).getTime();
          return t >= mStart.getTime() && t <= mEnd.getTime();
        });

        const label = current.toLocaleDateString('en-US', { month: 'short' });
        const fullDate = current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        buckets.push({
          key: `${current.getFullYear()}-${current.getMonth() + 1}`,
          label,
          fullDate,
          assessmentsCount: mExams.length,
          questionsCount: mQuestions.length,
          totalCount: mExams.length + mQuestions.length,
          assessments: mExams,
          questions: mQuestions
        });

        current.setMonth(current.getMonth() + 1);
      }
    }

    const totalAssessments = exams.length;
    const totalQuestions = questions.length;
    const totalActivity = totalAssessments + totalQuestions;

    return ApiResponse.success(
      res,
      200,
      {
        buckets,
        totals: {
          totalAssessments,
          totalQuestions,
          totalActivity
        },
        period: {
          range,
          startDate: start,
          endDate: end,
          aggregation
        }
      },
      'Workspace activity analytics retrieved.'
    );
  } catch (error) {
    next(error);
  }
};

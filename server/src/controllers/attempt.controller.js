import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { Exam } from '../models/Exam.js';
import { ExamAttempt } from '../models/ExamAttempt.js';
import { StudentAnswer } from '../models/StudentAnswer.js';
import { Submission } from '../models/Submission.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { Question } from '../models/Question.js';
import { TestCase } from '../models/TestCase.js';
import { McqQuestion } from '../models/McqQuestion.js';
import { GradingAuditLog } from '../models/GradingAuditLog.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { validateSingleTestCase } from '../services/codeRunner.service.js';
import { enqueueExecutionJob } from '../services/queue/executionQueue.js';
import { recalculateAttemptGrading } from '../services/attemptGrading.service.js';
import { clearUnresolvedRemoteExecution } from '../services/queue/executionRecovery.js';
import { getEffectiveSecurityPolicy } from '../config/securityPolicy.js';

/**
 * Deterministic Idempotency Key Generator for Distributed Concurrency
 * Generates identical keys for identical execution requests across multiple server instances.
 * Distinct code or inputs produce distinct keys, preserving separate identities for legitimate requests.
 */
export const generateDeterministicIdempotencyKey = ({
  studentId = 'student',
  attemptId,
  questionId,
  runType,
  code = '',
  customInput = '',
  clientKey = null
}) => {
  const cleanStudent = String(studentId || 'anon').trim();
  const cleanAttempt = String(attemptId).trim();
  const cleanQuestion = String(questionId).trim();
  const cleanRunType = String(runType).trim().toUpperCase();

  if (clientKey) {
    const cleanClientKey = String(clientKey).trim().slice(0, 128);
    return `client:${cleanStudent}:${cleanAttempt}:${cleanQuestion}:${cleanRunType}:${cleanClientKey}`;
  }
  const codeHash = crypto.createHash('sha256').update(String(code || '')).digest('hex').slice(0, 16);
  if (cleanRunType === 'CUSTOM_INPUT') {
    const inputHash = crypto.createHash('sha256').update(String(customInput || '')).digest('hex').slice(0, 16);
    return `exec:${cleanStudent}:${cleanAttempt}:${cleanQuestion}:${cleanRunType}:${codeHash}:${inputHash}`;
  }
  return `exec:${cleanStudent}:${cleanAttempt}:${cleanQuestion}:${cleanRunType}:${codeHash}`;
};

// In-memory atomic lock set to prevent concurrent double-click / simultaneous duplicate submission races
const inFlightOperations = new Set();

/**
 * Sanitizes coding question for student: strictly removes reference solutions
 */
export const sanitizeQuestionForStudent = (question, maxMarks = 10) => {
  return {
    _id: question._id,
    type: 'coding',
    title: question.title,
    statement: question.statement,
    constraints: question.constraints || '',
    difficulty: question.difficulty,
    executionMode: question.executionMode || 'STDIN',
    dataStructure: question.dataStructure || 'ARRAY',
    functionName: question.functionName || 'solution',
    functionSignature: question.functionSignature || null,
    supportedLanguages: question.supportedLanguages || ['javascript', 'python', 'java', 'cpp'],
    language: question.language || 'javascript',
    tags: question.tags || [],
    starterCode: question.starterCode || '',
    starterCodes: question.starterCodes ? (question.starterCodes instanceof Map ? Object.fromEntries(question.starterCodes) : question.starterCodes) : {},
    examples: question.examples || [],
    maxMarks
  };
};

/**
 * Verifies an examination access code and returns eligibility status + sanitized preview
 */
export const verifyExamCode = async (req, res, next) => {
  try {
    const { examCode } = req.body;
    const cleanEmail = (req.user?.email || req.body?.candidateEmail || '').trim().toLowerCase();

    if (!examCode || typeof examCode !== 'string' || !examCode.trim()) {
      return ApiResponse.success(res, 200, {
        eligible: false,
        status: 'INVALID_CODE',
        message: 'Invalid code. Check the code with your teacher and try again.'
      });
    }

    const cleanCode = examCode.trim().toUpperCase();
    const exam = await Exam.findOne({ examCode: cleanCode })
      .populate('createdBy', 'name email')
      .lean();

    if (!exam) {
      return ApiResponse.success(res, 200, {
        eligible: false,
        status: 'INVALID_CODE',
        message: 'Invalid code. Check the code with your teacher and try again.'
      });
    }

    if (exam.status === 'DRAFT' || exam.status === 'ARCHIVED') {
      return ApiResponse.success(res, 200, {
        eligible: false,
        status: 'UNPUBLISHED',
        message: 'This test is unpublished or inactive. Check with your instructor.'
      });
    }

    const now = Date.now();

    // Check if test has expired
    if (exam.status === 'COMPLETED' || (exam.schedule?.endTime && now > new Date(exam.schedule.endTime).getTime())) {
      return ApiResponse.success(res, 200, {
        eligible: false,
        status: 'EXPIRED',
        message: 'This test has expired and can no longer be started.'
      });
    }

    // Check if test is scheduled for future
    if (exam.schedule?.startTime && now < new Date(exam.schedule.startTime).getTime()) {
      const openTime = new Date(exam.schedule.startTime).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
      return ApiResponse.success(res, 200, {
        eligible: false,
        status: 'NOT_OPEN_YET',
        message: `This test is not open yet. It will open on ${openTime}.`,
        canStart: false
      });
    }

    // Check if user has already attempted this test
    if (cleanEmail || req.user?._id) {
      const query = { examId: exam._id };
      if (req.user?._id && cleanEmail) {
        query.$or = [{ studentId: req.user._id }, { 'candidateInfo.email': cleanEmail }];
      } else if (req.user?._id) {
        query.studentId = req.user._id;
      } else {
        query['candidateInfo.email'] = cleanEmail;
      }

      const existingAttempt = await ExamAttempt.findOne(query).sort({ createdAt: -1 });

      if (existingAttempt) {
        if (existingAttempt.status === 'SUBMITTED' || existingAttempt.status === 'DISQUALIFIED') {
          return ApiResponse.success(res, 200, {
            eligible: false,
            status: 'ALREADY_ATTEMPTED',
            message: 'You have already attempted this test. Each test can be attempted once.',
            attemptId: existingAttempt._id,
            hasResult: true
          });
        }

        if (existingAttempt.status === 'IN_PROGRESS') {
          if (now > new Date(existingAttempt.expiresAt).getTime()) {
            existingAttempt.status = 'TIMED_OUT';
            await existingAttempt.save();
            return ApiResponse.success(res, 200, {
              eligible: false,
              status: 'ALREADY_ATTEMPTED',
              message: 'You have already attempted this test. Each test can be attempted once.',
              attemptId: existingAttempt._id,
              hasResult: true
            });
          }

          // Active attempt available to resume
          return ApiResponse.success(res, 200, {
            eligible: true,
            status: 'IN_PROGRESS',
            message: 'You have an active in-progress attempt for this test.',
            canStart: true,
            attemptId: existingAttempt._id,
            isResuming: true,
            preview: {
              examCode: exam.examCode,
              title: exam.title,
              teacher: exam.createdBy?.name || 'Instructor',
              subject: exam.sections?.[0]?.name || 'Assessment',
              duration: `${exam.durationMinutes || 60} mins`,
              durationMinutes: exam.durationMinutes || 60,
              totalMarks: exam.totalMarks || 100,
              questions: (exam.sections || []).reduce((acc, s) => acc + (s.questions?.length || 0), 0)
            }
          });
        }
      }
    }

    // Calculate metadata
    const questionCount = (exam.sections || []).reduce((acc, s) => acc + (s.questions?.length || 0), 0);
    const defaultInstructions = [
      'The examination timer cannot be paused once started.',
      'Answers autosave automatically and can also be saved manually.',
      'Questions can be flagged for review and navigated via the question palette.',
      'The test will automatically submit when the allotted time ends.'
    ];

    return ApiResponse.success(res, 200, {
      eligible: true,
      status: 'ELIGIBLE',
      message: 'You are eligible to take this test.',
      canStart: true,
      preview: {
        examCode: exam.examCode,
        title: exam.title,
        teacher: exam.createdBy?.name || 'Instructor',
        subject: exam.sections?.[0]?.name || 'Computer Science',
        duration: `${exam.durationMinutes || 60} mins`,
        durationMinutes: exam.durationMinutes || 60,
        totalMarks: exam.totalMarks || 100,
        questions: questionCount,
        deadline: exam.schedule?.endTime
          ? new Date(exam.schedule.endTime).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
          : 'No strict deadline',
        instructions: (exam.instructions && exam.instructions.length > 0) ? exam.instructions : defaultInstructions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Student joins an exam using an exam code and candidate credentials
 */
export const joinExamByCode = async (req, res, next) => {
  try {
    const { examCode, candidateInfo } = req.body;

    if (!examCode || !examCode.trim()) {
      throw ApiError.badRequest('Please enter a valid exam code.');
    }

    if (!candidateInfo || !candidateInfo.name?.trim() || !candidateInfo.email?.trim()) {
      throw ApiError.badRequest('Candidate full name and email are required to enter the exam.');
    }

    const cleanCode = examCode.trim().toUpperCase();
    const cleanEmail = candidateInfo.email.trim().toLowerCase();
    const cleanName = candidateInfo.name.trim();
    const cleanRoll = candidateInfo.rollNumber?.trim() || '';

    const exam = await Exam.findOne({ examCode: cleanCode })
      .populate('sections.questions.questionId')
      .populate('sections.questions.mcqQuestionId')
      .lean();

    if (!exam) {
      throw ApiError.notFound(`No examination found matching code "${cleanCode}". Please verify your code.`);
    }

    if (exam.status !== 'LIVE') {
      throw ApiError.badRequest(
        exam.status === 'COMPLETED'
          ? 'This examination has already concluded.'
          : 'This examination is currently not active. Please contact your instructor.'
      );
    }

    // Check if attempt already exists
    let attempt = await ExamAttempt.findOne({
      examId: exam._id,
      'candidateInfo.email': cleanEmail
    });

    const now = Date.now();

    // Helper to sign scoped attempt session token (valid for exam duration + 4h buffer)
    const signAttemptToken = (targetAttempt) => {
      return jwt.sign(
        {
          attemptId: targetAttempt._id,
          email: cleanEmail,
          examId: exam._id,
          type: 'attempt_session'
        },
        config.jwt.secret,
        { expiresIn: `${Math.max(2, Math.ceil((exam.durationMinutes || 60) / 60) + 4)}h` }
      );
    };

    if (attempt) {
      const attemptToken = signAttemptToken(attempt);

      if (attempt.status === 'SUBMITTED' || attempt.status === 'DISQUALIFIED') {
        return ApiResponse.success(
          res,
          200,
          {
            alreadyCompleted: true,
            attemptId: attempt._id,
            token: attemptToken,
            status: attempt.status,
            totalScore: attempt.totalScore,
            maxScore: attempt.maxScore,
            percentage: attempt.percentage,
            submittedAt: attempt.submittedAt
          },
          'You have already submitted this examination.'
        );
      }

      if (now > new Date(attempt.expiresAt).getTime()) {
        attempt.status = 'TIMED_OUT';
        await attempt.save();
        return ApiResponse.success(
          res,
          200,
          {
            alreadyCompleted: true,
            attemptId: attempt._id,
            token: attemptToken,
            status: 'TIMED_OUT',
            totalScore: attempt.totalScore,
            maxScore: attempt.maxScore,
            percentage: attempt.percentage,
            submittedAt: attempt.expiresAt
          },
          'The allotted time for this examination session has expired.'
        );
      }
    } else {
      // Create new exam attempt
      const durationMs = (exam.durationMinutes || 60) * 60 * 1000;
      const expiresAt = new Date(now + durationMs);

      // Calculate max possible marks & gather question items
      let maxMarks = 0;
      const questionItems = [];

      for (const sec of exam.sections || []) {
        for (const q of sec.questions || []) {
          const qType = q.type || 'coding';
          const qMarks = q.marks || (qType === 'mcq' ? 2 : 10);
          maxMarks += qMarks;

          let targetId;
          if (qType === 'mcq') {
            targetId = q.mcqQuestionId?._id || q.mcqQuestionId || q._id;
          } else {
            targetId = q.questionId?._id || q.questionId || q._id;
          }

          questionItems.push({
            type: qType,
            questionId: targetId,
            marks: qMarks
          });
        }
      }

      attempt = await ExamAttempt.create({
        examId: exam._id,
        studentId: req.user?._id || null,
        candidateInfo: {
          name: cleanName,
          email: cleanEmail,
          rollNumber: cleanRoll
        },
        startedAt: new Date(now),
        expiresAt,
        status: 'IN_PROGRESS',
        maxScore: maxMarks
      });

      // Initialize blank student answers for each question
      for (const item of questionItems) {
        const qIdStr = item.questionId.toString();
        if (item.type === 'mcq') {
          await StudentAnswer.create({
            attemptId: attempt._id,
            questionId: qIdStr,
            questionType: 'mcq',
            selectedOption: '',
            maxMarks: item.marks
          });
        } else {
          const questionDoc = await Question.findById(item.questionId).lean();
          await StudentAnswer.create({
            attemptId: attempt._id,
            questionId: qIdStr,
            questionType: 'coding',
            code: questionDoc?.starterCode || '',
            language: questionDoc?.language || 'javascript',
            maxMarks: item.marks
          });
        }
      }
    }

    // Prepare questions with public test cases only (Zero-Leak)
    const sanitizedQuestions = [];

    for (const sec of exam.sections || []) {
      for (const q of sec.questions || []) {
        const qType = q.type || 'coding';
        const qMarks = q.marks || (qType === 'mcq' ? 2 : 10);

        if (qType === 'mcq') {
          const mcqId = (q.mcqQuestionId?._id || q.mcqQuestionId || q._id).toString();
          const mcqData = q.mcqData || q.mcqQuestionId || {};

          const sanitizedOptions = Array.isArray(mcqData.options) && mcqData.options.length > 0
            ? mcqData.options.map((opt) => ({ id: opt.id, text: opt.text }))
            : undefined;

          sanitizedQuestions.push({
            _id: mcqId,
            type: 'mcq',
            title: `MCQ: ${(mcqData.statement || mcqData.question || 'Multiple Choice Question').slice(0, 50)}...`,
            statement: mcqData.statement || mcqData.question || '',
            options: sanitizedOptions,
            answerType: mcqData.answerType || 'single',
            optionA: mcqData.optionA || '',
            optionB: mcqData.optionB || '',
            optionC: mcqData.optionC || '',
            optionD: mcqData.optionD || '',
            topic: mcqData.topic || 'General',
            difficulty: mcqData.difficulty || 'Medium',
            maxMarks: qMarks
            // ZERO LEAK: correctAnswers, correctAnswer and explanation are completely withheld
          });
        } else {
          const qDoc = q.questionId;
          if (qDoc) {
            const sanitized = sanitizeQuestionForStudent(qDoc, qMarks);
            sanitized.type = 'coding';

            // Fetch only PUBLIC / SAMPLE test cases
            const publicTestCases = await TestCase.find({
              questionId: qDoc._id,
              $or: [{ visibility: 'public' }, { category: 'sample' }]
            })
              .select('input expectedOutput category')
              .lean();

            sanitized.sampleTestCases = publicTestCases;
            sanitizedQuestions.push(sanitized);
          }
        }
      }
    }

    // Fetch candidate's current answers
    const answers = await StudentAnswer.find({ attemptId: attempt._id }).lean();
    const answersMap = {};
    for (const ans of answers) {
      answersMap[ans.questionId.toString()] = ans;
    }

    const remainingSeconds = Math.max(
      0,
      Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000)
    );

    const activeAttemptToken = signAttemptToken(attempt);

    return ApiResponse.success(
      res,
      200,
      {
        token: activeAttemptToken,
        attempt: {
          _id: attempt._id,
          sessionToken: activeAttemptToken,
          startedAt: attempt.startedAt,
          expiresAt: attempt.expiresAt,
          status: attempt.status,
          tabSwitchCount: attempt.tabSwitchCount || 0,
          fullscreenExitCount: attempt.fullscreenExitCount || 0,
          blurCount: attempt.blurCount || 0,
          clipboardViolationCount: attempt.clipboardViolationCount || 0,
          totalViolations: attempt.totalViolations || 0,
          needsReview: attempt.needsReview || false,
          candidateInfo: attempt.candidateInfo
        },
        remainingSeconds,
        exam: {
          _id: exam._id,
          examCode: exam.examCode,
          title: exam.title,
          description: exam.description,
          instructions: exam.instructions,
          durationMinutes: exam.durationMinutes,
          proctoringSettings: exam.proctoringSettings,
          settings: exam.settings,
          totalMarks: exam.totalMarks
        },
        securityPolicy: getEffectiveSecurityPolicy(exam),
        questions: sanitizedQuestions,
        savedAnswers: answersMap
      },
      'Exam joined successfully. Starting examination workspace.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get active candidate session and current state
 */
export const getAttemptState = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const attempt = await ExamAttempt.findById(attemptId).lean();

    if (!attempt) {
      throw ApiError.notFound('Attempt session not found.');
    }

    const exam = await Exam.findById(attempt.examId).lean();

    const now = Date.now();
    const isExpired = now > new Date(attempt.expiresAt).getTime();

    if (isExpired && attempt.status === 'IN_PROGRESS') {
      await ExamAttempt.findByIdAndUpdate(attemptId, { status: 'TIMED_OUT' });
      attempt.status = 'TIMED_OUT';
    }

    const remainingSeconds = Math.max(
      0,
      Math.floor((new Date(attempt.expiresAt).getTime() - now) / 1000)
    );

    const answers = await StudentAnswer.find({ attemptId }).lean();
    const answersMap = {};
    for (const a of answers) {
      answersMap[a.questionId.toString()] = a;
    }

    return ApiResponse.success(
      res,
      200,
      {
        attempt,
        exam: exam
          ? {
              _id: exam._id,
              title: exam.title,
              examCode: exam.examCode,
              durationMinutes: exam.durationMinutes,
              proctoringSettings: exam.proctoringSettings,
              settings: exam.settings
            }
          : null,
        securityPolicy: getEffectiveSecurityPolicy(exam),
        remainingSeconds,
        answers: answersMap,
        isExpired
      },
      'Attempt state retrieved.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Autosave student answer draft (coding or mcq)
 */
export const autosaveAnswer = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { questionId, code, language, selectedOption, isMarkedForReview } = req.body;

    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt) {
      throw ApiError.notFound('Attempt session not found.');
    }

    if (attempt.status !== 'IN_PROGRESS') {
      throw ApiError.badRequest('This examination session is no longer active.');
    }

    if (Date.now() > new Date(attempt.expiresAt).getTime()) {
      attempt.status = 'TIMED_OUT';
      await attempt.save();
      throw ApiError.badRequest('Examination time has expired. Submissions are locked.');
    }

    const updateFields = {
      lastSavedAt: new Date()
    };
    if (code !== undefined) {
      updateFields.code = code;
      if (code && code.trim().length > 0) updateFields.status = 'SAVED';
    }
    if (selectedOption !== undefined) {
      updateFields.selectedOption = selectedOption;
      if (selectedOption) updateFields.status = 'SAVED';
    }
    if (language !== undefined) updateFields.language = language;
    if (isMarkedForReview !== undefined) updateFields.isMarkedForReview = isMarkedForReview;

    const qIdStr = questionId.toString();
    const answer = await StudentAnswer.findOneAndUpdate(
      { attemptId, $or: [{ questionId: qIdStr }, { questionId }] },
      { $set: updateFields },
      { new: true, upsert: true }
    );

    return ApiResponse.success(res, 200, answer, 'Answer autosaved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Run student code strictly against PUBLIC sample test cases
 */
export const runSampleTests = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { questionId, code, language } = req.body;

    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt || attempt.status !== 'IN_PROGRESS') {
      throw ApiError.badRequest('Exam session is not active.');
    }

    if (Date.now() > new Date(attempt.expiresAt).getTime()) {
      attempt.status = 'TIMED_OUT';
      await attempt.save();
      throw ApiError.badRequest('Time expired.');
    }

    const question = await Question.findById(questionId).lean();
    if (!question) {
      throw ApiError.notFound('Question not found.');
    }

    // Concurrency Lock: Prevent simultaneous duplicate requests for the same attempt and question
    const opKey = `${attemptId}:${questionId}:SAMPLE`;
    if (inFlightOperations.has(opKey)) {
      await new Promise(r => setTimeout(r, 120));
      const justCreated = await Submission.findOne({
        attemptId,
        questionId,
        runType: 'SAMPLE',
        status: { $in: ['QUEUED', 'RUNNING'] }
      }).sort({ createdAt: -1 });
      if (justCreated) {
        return ApiResponse.success(
          res,
          200,
          {
            submissionId: justCreated._id,
            status: justCreated.status,
            jobId: justCreated.jobId,
            runType: 'SAMPLE',
            pollUrl: `/api/v1/attempts/${attemptId}/submissions/${justCreated._id}`,
            isDuplicate: true
          },
          'A sample execution job is already in progress for this question.'
        );
      }
    }
    inFlightOperations.add(opKey);

    try {
      // Duplicate Job Protection: A job is legitimately in-flight if:
      // 1. It is 'RUNNING' with an active, unexpired lease (executionLeaseExpiresAt > now), OR
      // 2. It is 'QUEUED' and was created recently (within last 30s).
      // Stalled jobs with expired leases or stale queued timestamps are safely superseded.
      const now = new Date();
      const queuedGraceThreshold = new Date(now.getTime() - 30000);
      const activeExisting = await Submission.findOne({
        attemptId,
        questionId,
        runType: 'SAMPLE',
        $or: [
          { status: 'RUNNING', executionLeaseExpiresAt: { $gt: now } },
          { status: 'QUEUED', createdAt: { $gte: queuedGraceThreshold } }
        ]
      }).sort({ createdAt: -1 });

      if (activeExisting) {
        return ApiResponse.success(
          res,
          200,
          {
            submissionId: activeExisting._id,
            status: activeExisting.status,
            jobId: activeExisting.jobId,
            runType: 'SAMPLE',
            pollUrl: `/api/v1/attempts/${attemptId}/submissions/${activeExisting._id}`,
            isDuplicate: true
          },
          'A sample execution job is already in progress for this question.'
        );
      }

      const clientKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;
      const studentId = attempt.studentId || attempt.candidateInfo?.email || req.attempt?.studentId || 'student';
      const idempotencyKey = generateDeterministicIdempotencyKey({
        studentId,
        attemptId,
        questionId,
        runType: 'SAMPLE',
        code,
        clientKey
      });

      const retentionWindowMs = config.idempotencyRetentionMs || (10 * 60 * 1000);
      const idempotencyExpiresAt = new Date(now.getTime() + retentionWindowMs);

      // Idempotency Retention Check: Inspect if an execution document currently holds this key
      const existingKeyDoc = await Submission.findOne({ idempotencyKey });
      if (existingKeyDoc) {
        const isExpired = existingKeyDoc.idempotencyExpiresAt && new Date(existingKeyDoc.idempotencyExpiresAt) <= now;
        if (!isExpired) {
          // Within active retention window: return the original submission tracker / results
          const isTerminal = ['COMPLETED', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED'].includes(existingKeyDoc.status);
          return ApiResponse.success(
            res,
            200,
            {
              submissionId: existingKeyDoc._id,
              status: existingKeyDoc.status,
              jobId: existingKeyDoc.jobId,
              runType: existingKeyDoc.runType || 'SAMPLE',
              verdict: existingKeyDoc.verdict,
              pollUrl: `/api/v1/attempts/${attemptId}/submissions/${existingKeyDoc._id}`,
              isDuplicate: true,
              alreadyCompleted: isTerminal
            },
            isTerminal
              ? 'Execution with this idempotency key already completed within retention window.'
              : 'A sample execution job is already in progress for this request.'
          );
        } else {
          // Retention window expired: safely release the key from the historical submission without deleting history
          if (mongoose.connection?.readyState === 1 || (Submission.findOneAndUpdate && Submission.findOneAndUpdate._isMockFunction)) {
            await Submission.findOneAndUpdate(
              { _id: existingKeyDoc._id, idempotencyKey },
              { $set: { idempotencyKey: null } }
            );
          }
        }
      }

      // Stale fallback in-flight lock cleanup: Only clear stale keys for in-flight fallback locks (not client UUIDs)
      if (!clientKey && (mongoose.connection?.readyState === 1 || (Submission.updateMany && Submission.updateMany._isMockFunction))) {
        await Submission.updateMany(
          {
            idempotencyKey,
            $or: [
              { status: { $nin: ['QUEUED', 'RUNNING'] } },
              { status: 'RUNNING', executionLeaseExpiresAt: { $lte: now } },
              { status: 'QUEUED', createdAt: { $lt: queuedGraceThreshold } }
            ]
          },
          { $set: { idempotencyKey: null } }
        ).catch(() => {});
      }

      // 1. Create authoritative Submission record in MongoDB with distributed idempotency key
      let submission;
      try {
        submission = await Submission.create({
          attemptId,
          questionId,
          code: code || '',
          language: language || question.language || 'javascript',
          runType: 'SAMPLE',
          status: 'QUEUED',
          verdict: 'PENDING',
          idempotencyKey,
          idempotencyExpiresAt
        });
      } catch (createErr) {
        // Safe distributed handling: if another instance created the submission concurrently (MongoServerError E11000)
        if (createErr.code === 11000 || createErr.name === 'MongoServerError' || createErr.message?.includes('E11000') || createErr.message?.includes('duplicate key')) {
          const existing = await Submission.findOne({ idempotencyKey })
            || await Submission.findOne({ attemptId, questionId, runType: 'SAMPLE' }).sort({ createdAt: -1 });
          if (existing) {
            return ApiResponse.success(
              res,
              200,
              {
                submissionId: existing._id,
                status: existing.status,
                jobId: existing.jobId,
                runType: 'SAMPLE',
                pollUrl: `/api/v1/attempts/${attemptId}/submissions/${existing._id}`,
                isDuplicate: true
              },
              'A sample execution job is already in progress for this question.'
            );
          }
        }
        throw createErr;
      }

      // 2. Enqueue execution job in BullMQ
      let job;
      try {
        job = await enqueueExecutionJob({
          submissionId: submission._id,
          attemptId,
          questionId,
          runType: 'SAMPLE',
          language: submission.language,
          studentEmail: attempt.candidateInfo?.email || ''
        });
        submission.jobId = job.id;
        await submission.save();
      } catch (queueErr) {
        submission.status = 'EXECUTION_UNAVAILABLE';
        submission.verdict = 'EXECUTION_UNAVAILABLE';
        submission.errorMessage = `Execution queue unavailable: ${queueErr.message}`;
        submission.idempotencyKey = null;
        if (typeof submission.save === 'function') {
          await submission.save();
        }
        throw queueErr;
      }

      // 3. Return 202 immediately with submissionId and pollUrl
      return ApiResponse.success(
        res,
        202,
        {
          submissionId: submission._id,
          status: 'QUEUED',
          jobId: job.id,
          runType: 'SAMPLE',
          pollUrl: `/api/v1/attempts/${attemptId}/submissions/${submission._id}`
        },
        'Sample test run queued successfully.'
      );
    } finally {
      inFlightOperations.delete(opKey);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Run student code with custom stdin input (for STDIN-mode questions)
 */
export const runCustomInput = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { questionId, code, language, customInput } = req.body;

    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt || attempt.status !== 'IN_PROGRESS') {
      throw ApiError.badRequest('Exam session is not active.');
    }

    if (Date.now() > new Date(attempt.expiresAt).getTime()) {
      attempt.status = 'TIMED_OUT';
      await attempt.save();
      throw ApiError.badRequest('Time expired.');
    }

    const question = await Question.findById(questionId).lean();
    if (!question) {
      throw ApiError.notFound('Question not found.');
    }

    // Safety guard: FUNCTION mode questions cannot use raw stdin
    if (question.executionMode === 'FUNCTION') {
      throw ApiError.badRequest(
        'Custom stdin execution is not available for FUNCTION-mode questions. Please test your code against sample test cases using the Run button.'
      );
    }

    // Input bounds validation
    if (code && code.length > 65536) {
      throw ApiError.badRequest('Submitted code exceeds maximum size limit (64KB).');
    }
    if (customInput && customInput.length > 65536) {
      throw ApiError.badRequest('Custom input exceeds maximum size limit (64KB).');
    }

    const now = new Date();
    const queuedGraceThreshold = new Date(now.getTime() - 30000);

    // Duplicate Job Protection
    const activeExisting = await Submission.findOne({
      attemptId,
      questionId,
      runType: 'CUSTOM_INPUT',
      $or: [
        { status: 'RUNNING', executionLeaseExpiresAt: { $gt: now } },
        { status: 'QUEUED', createdAt: { $gte: queuedGraceThreshold } }
      ]
    }).sort({ createdAt: -1 });

    if (activeExisting) {
      return ApiResponse.success(
        res,
        200,
        {
          submissionId: activeExisting._id,
          status: activeExisting.status,
          jobId: activeExisting.jobId,
          runType: 'CUSTOM_INPUT',
          pollUrl: `/api/v1/attempts/${attemptId}/submissions/${activeExisting._id}`,
          isDuplicate: true
        },
        'A custom input execution job is already in progress for this question.'
      );
    }

    const clientKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;
    const studentId = attempt.studentId || attempt.candidateInfo?.email || req.attempt?.studentId || 'student';
    const idempotencyKey = generateDeterministicIdempotencyKey({
      studentId,
      attemptId,
      questionId,
      runType: 'CUSTOM_INPUT',
      code,
      customInput,
      clientKey
    });

    const retentionWindowMs = config.idempotencyRetentionMs || (10 * 60 * 1000);
    const idempotencyExpiresAt = new Date(now.getTime() + retentionWindowMs);

    // Idempotency Retention Check: Inspect if an execution document currently holds this key
    const existingKeyDoc = await Submission.findOne({ idempotencyKey });
    if (existingKeyDoc) {
      const isExpired = existingKeyDoc.idempotencyExpiresAt && new Date(existingKeyDoc.idempotencyExpiresAt) <= now;
      if (!isExpired) {
        const isTerminal = ['COMPLETED', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED'].includes(existingKeyDoc.status);
        return ApiResponse.success(
          res,
          200,
          {
            submissionId: existingKeyDoc._id,
            status: existingKeyDoc.status,
            jobId: existingKeyDoc.jobId,
            runType: existingKeyDoc.runType || 'CUSTOM_INPUT',
            verdict: existingKeyDoc.verdict,
            pollUrl: `/api/v1/attempts/${attemptId}/submissions/${existingKeyDoc._id}`,
            isDuplicate: true,
            alreadyCompleted: isTerminal
          },
          isTerminal
            ? 'Execution with this idempotency key already completed within retention window.'
            : 'A custom input execution job is already in progress for this request.'
        );
      } else {
        // Retention window expired: safely release the key from historical doc without deleting history
        if (mongoose.connection?.readyState === 1 || (Submission.findOneAndUpdate && Submission.findOneAndUpdate._isMockFunction)) {
          await Submission.findOneAndUpdate(
            { _id: existingKeyDoc._id, idempotencyKey },
            { $set: { idempotencyKey: null } }
          );
        }
      }
    }

    // Stale fallback in-flight lock cleanup: Only clear stale keys for in-flight fallback locks (not client UUIDs)
    if (!clientKey && (mongoose.connection?.readyState === 1 || (Submission.updateMany && Submission.updateMany._isMockFunction))) {
      await Submission.updateMany(
        {
          idempotencyKey,
          $or: [
            { status: { $nin: ['QUEUED', 'RUNNING'] } },
            { status: 'RUNNING', executionLeaseExpiresAt: { $lte: now } },
            { status: 'QUEUED', createdAt: { $lt: queuedGraceThreshold } }
          ]
        },
        { $set: { idempotencyKey: null } }
      ).catch(() => {});
    }

    // 1. Create authoritative Submission record in MongoDB with distributed idempotency key
    let submission;
    try {
      submission = await Submission.create({
        attemptId,
        questionId,
        code: code || '',
        language: language || question.language || 'javascript',
        runType: 'CUSTOM_INPUT',
        customInput: customInput !== undefined && customInput !== null ? String(customInput) : '',
        status: 'QUEUED',
        verdict: 'PENDING',
        idempotencyKey,
        idempotencyExpiresAt
      });
    } catch (createErr) {
      if (createErr.code === 11000 || createErr.name === 'MongoServerError' || createErr.message?.includes('E11000') || createErr.message?.includes('duplicate key')) {
        const existing = await Submission.findOne({ idempotencyKey })
          || await Submission.findOne({ attemptId, questionId, runType: 'CUSTOM_INPUT' }).sort({ createdAt: -1 });
        if (existing) {
          return ApiResponse.success(
            res,
            200,
            {
              submissionId: existing._id,
              status: existing.status,
              jobId: existing.jobId,
              runType: 'CUSTOM_INPUT',
              pollUrl: `/api/v1/attempts/${attemptId}/submissions/${existing._id}`,
              isDuplicate: true
            },
            'A custom input execution job is already in progress for this question.'
          );
        }
      }
      throw createErr;
    }

    // 2. Enqueue execution job in BullMQ
    let job;
    try {
      job = await enqueueExecutionJob({
        submissionId: submission._id,
        attemptId,
        questionId,
        runType: 'CUSTOM_INPUT',
        language: submission.language,
        studentEmail: attempt.candidateInfo?.email || ''
      });
      submission.jobId = job.id;
      await submission.save();
    } catch (queueErr) {
      submission.status = 'EXECUTION_UNAVAILABLE';
      submission.verdict = 'EXECUTION_UNAVAILABLE';
      submission.errorMessage = `Execution queue unavailable: ${queueErr.message}`;
      submission.idempotencyKey = null;
      if (typeof submission.save === 'function') {
        await submission.save();
      }
      throw queueErr;
    }

    // 3. Return 202 immediately with submissionId and pollUrl
    return ApiResponse.success(
      res,
      202,
      {
        submissionId: submission._id,
        status: 'QUEUED',
        jobId: job.id,
        runType: 'CUSTOM_INPUT',
        pollUrl: `/api/v1/attempts/${attemptId}/submissions/${submission._id}`
      },
      'Custom input execution queued successfully.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Submit question solution: handles both MCQ questions and Coding problems
 */
export const submitQuestion = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { questionId, code, language, selectedOption } = req.body;

    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt || attempt.status !== 'IN_PROGRESS') {
      throw ApiError.badRequest('Exam session is not active.');
    }

    if (Date.now() > new Date(attempt.expiresAt).getTime()) {
      attempt.status = 'TIMED_OUT';
      await attempt.save();
      throw ApiError.badRequest('Exam time has expired.');
    }

    const exam = await Exam.findById(attempt.examId).lean();
    const qIdStr = questionId.toString();

    // Check if this question is an MCQ & get target marks from exam configuration
    let isMcq = false;
    let targetMarks = 10;
    let mcqTarget = null;

    if (exam && exam.sections) {
      for (const sec of exam.sections) {
        for (const q of sec.questions) {
          const qId = q.type === 'mcq'
            ? (q.mcqQuestionId?._id || q.mcqQuestionId || q._id)
            : (q.questionId?._id || q.questionId || q._id);
          if (qId && qId.toString() === qIdStr) {
            targetMarks = q.marks || (q.type === 'mcq' ? 2 : 10);
            if (q.type === 'mcq') {
              isMcq = true;
              mcqTarget = q;
            }
            break;
          }
        }
      }
    }

    const studentAnswer = await StudentAnswer.findOne({
      attemptId,
      $or: [{ questionId: qIdStr }, { questionId }]
    });

    const maxMarks = studentAnswer?.maxMarks || targetMarks;

    // ── MCQ EVALUATION ────────────────────────────────────────────────────────
    if (isMcq) {
      let correctAnswer = mcqTarget?.mcqData?.correctAnswer;
      let correctAnswers = mcqTarget?.mcqData?.correctAnswers;
      let answerType = mcqTarget?.mcqData?.answerType || 'single';
      if ((!correctAnswer && (!correctAnswers || correctAnswers.length === 0)) && mcqTarget?.mcqQuestionId) {
        const mcqDoc = await McqQuestion.findById(mcqTarget.mcqQuestionId).lean();
        correctAnswer = mcqDoc?.correctAnswer;
        correctAnswers = mcqDoc?.correctAnswers;
        answerType = mcqDoc?.answerType || answerType;
      }

      const candidateChoice = (selectedOption || studentAnswer?.selectedOption || '').trim();
      let isCorrect = false;

      if (answerType === 'multiple' && Array.isArray(correctAnswers) && correctAnswers.length > 0) {
        let studentPicks = [];
        try {
          const parsed = JSON.parse(candidateChoice);
          studentPicks = Array.isArray(parsed) ? parsed : [parsed];
        } catch (_) {
          studentPicks = candidateChoice.split(',').map((s) => s.trim()).filter(Boolean);
        }
        const studentSet = new Set(studentPicks.map((p) => String(p).toUpperCase()));
        const correctSet = new Set(correctAnswers.map((a) => String(a).toUpperCase()));
        isCorrect = studentSet.size === correctSet.size && [...studentSet].every((s) => correctSet.has(s));
      } else {
        const targetAns = (correctAnswer || (correctAnswers && correctAnswers[0]) || '').trim().toUpperCase();
        isCorrect = Boolean(targetAns && candidateChoice.toUpperCase() === targetAns);
      }

      const scoreAwarded = isCorrect ? maxMarks : 0;
      const verdict = isCorrect ? 'ACCEPTED' : 'WRONG_ANSWER';

      if (studentAnswer) {
        studentAnswer.selectedOption = candidateChoice;
        studentAnswer.score = scoreAwarded;
        studentAnswer.status = 'SUBMITTED';
        studentAnswer.testCasesPassed = isCorrect ? 1 : 0;
        studentAnswer.totalTestCases = 1;
        await studentAnswer.save();
      }

      return ApiResponse.success(
        res,
        200,
        {
          isMcq: true,
          scoreAwarded,
          maxMarks,
          verdict,
          candidateChoice,
          totalTests: 1,
          passedTests: isCorrect ? 1 : 0
        },
        'MCQ response evaluated.'
      );
    }

    // ── CODING EVALUATION (ASYNCHRONOUS QUEUE) ────────────────────────────────
    const question = await Question.findById(questionId).lean();
    if (!question) {
      throw ApiError.notFound('Coding challenge not found.');
    }

    // Concurrency Lock: Prevent simultaneous duplicate submissions for the same challenge
    const opKey = `${attemptId}:${questionId}:SUBMISSION`;
    if (inFlightOperations.has(opKey)) {
      await new Promise(r => setTimeout(r, 120));
      const justCreated = await Submission.findOne({
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        status: { $in: ['QUEUED', 'RUNNING'] }
      }).sort({ createdAt: -1 });
      if (justCreated) {
        return ApiResponse.success(
          res,
          200,
          {
            submissionId: justCreated._id,
            status: justCreated.status,
            jobId: justCreated.jobId,
            runType: 'SUBMISSION',
            pollUrl: `/api/v1/attempts/${attemptId}/submissions/${justCreated._id}`,
            isDuplicate: true
          },
          'A submission job is already in progress for this challenge.'
        );
      }
    }
    inFlightOperations.add(opKey);

    try {
      // Duplicate Job Protection: A job is legitimately in-flight if:
      // 1. It is 'RUNNING' with an active, unexpired lease (executionLeaseExpiresAt > now), OR
      // 2. It is 'QUEUED' and was created recently (within last 30s).
      // Stalled jobs with expired leases or stale queued timestamps are safely superseded.
      const now = new Date();
      const queuedGraceThreshold = new Date(now.getTime() - 30000);
      const activeExisting = await Submission.findOne({
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        $or: [
          { status: 'RUNNING', executionLeaseExpiresAt: { $gt: now } },
          { status: 'QUEUED', createdAt: { $gte: queuedGraceThreshold } }
        ]
      }).sort({ createdAt: -1 });

      if (activeExisting) {
        return ApiResponse.success(
          res,
          200,
          {
            submissionId: activeExisting._id,
            status: activeExisting.status,
            jobId: activeExisting.jobId,
            runType: 'SUBMISSION',
            pollUrl: `/api/v1/attempts/${attemptId}/submissions/${activeExisting._id}`,
            isDuplicate: true
          },
          'A submission job is already in progress for this challenge.'
        );
      }

      const clientKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;
      const studentId = attempt.studentId || attempt.candidateInfo?.email || req.attempt?.studentId || 'student';
      const idempotencyKey = generateDeterministicIdempotencyKey({
        studentId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        code,
        clientKey
      });

      const retentionWindowMs = config.idempotencyRetentionMs || (10 * 60 * 1000);
      const idempotencyExpiresAt = new Date(now.getTime() + retentionWindowMs);

      // Idempotency Retention Check: Inspect if an execution document currently holds this key
      const existingKeyDoc = await Submission.findOne({ idempotencyKey });
      if (existingKeyDoc) {
        const isExpired = existingKeyDoc.idempotencyExpiresAt && new Date(existingKeyDoc.idempotencyExpiresAt) <= now;
        if (!isExpired) {
          const isTerminal = ['COMPLETED', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED'].includes(existingKeyDoc.status);
          return ApiResponse.success(
            res,
            200,
            {
              submissionId: existingKeyDoc._id,
              status: existingKeyDoc.status,
              jobId: existingKeyDoc.jobId,
              runType: existingKeyDoc.runType || 'SUBMISSION',
              verdict: existingKeyDoc.verdict,
              pollUrl: `/api/v1/attempts/${attemptId}/submissions/${existingKeyDoc._id}`,
              isDuplicate: true,
              alreadyCompleted: isTerminal
            },
            isTerminal
              ? 'Submission with this idempotency key already completed within retention window.'
              : 'A submission job is already in progress for this challenge.'
          );
        } else {
          // Retention window expired: safely release the key from historical doc without deleting history
          if (mongoose.connection?.readyState === 1 || (Submission.findOneAndUpdate && Submission.findOneAndUpdate._isMockFunction)) {
            await Submission.findOneAndUpdate(
              { _id: existingKeyDoc._id, idempotencyKey },
              { $set: { idempotencyKey: null } }
            );
          }
        }
      }

      // Stale fallback in-flight lock cleanup: Only clear stale keys for in-flight fallback locks (not client UUIDs)
      if (!clientKey && (mongoose.connection?.readyState === 1 || (Submission.updateMany && Submission.updateMany._isMockFunction))) {
        await Submission.updateMany(
          {
            idempotencyKey,
            $or: [
              { status: { $nin: ['QUEUED', 'RUNNING'] } },
              { status: 'RUNNING', executionLeaseExpiresAt: { $lte: now } },
              { status: 'QUEUED', createdAt: { $lt: queuedGraceThreshold } }
            ]
          },
          { $set: { idempotencyKey: null } }
        ).catch(() => {});
      }

      // 1. Create authoritative Submission record in MongoDB with distributed idempotency key
      let submission;
      try {
        submission = await Submission.create({
          attemptId,
          questionId,
          code: code || '',
          language: language || question.language || 'javascript',
          runType: 'SUBMISSION',
          status: 'QUEUED',
          verdict: 'PENDING',
          maxMarks,
          idempotencyKey,
          idempotencyExpiresAt
        });
      } catch (createErr) {
        if (createErr.code === 11000 || createErr.name === 'MongoServerError' || createErr.message?.includes('E11000') || createErr.message?.includes('duplicate key')) {
          const existing = await Submission.findOne({ idempotencyKey })
            || await Submission.findOne({ attemptId, questionId, runType: 'SUBMISSION' }).sort({ createdAt: -1 });
          if (existing) {
            return ApiResponse.success(
              res,
              200,
              {
                submissionId: existing._id,
                status: existing.status,
                jobId: existing.jobId,
                runType: 'SUBMISSION',
                pollUrl: `/api/v1/attempts/${attemptId}/submissions/${existing._id}`,
                isDuplicate: true
              },
              'A submission job is already in progress for this challenge.'
            );
          }
        }
        throw createErr;
      }

      // 2. Enqueue execution job in BullMQ
      let job;
      try {
        job = await enqueueExecutionJob({
          submissionId: submission._id,
          attemptId,
          questionId,
          runType: 'SUBMISSION',
          language: submission.language,
          studentEmail: attempt.candidateInfo?.email || ''
        });
        submission.jobId = job.id;
        await submission.save();
      } catch (queueErr) {
        submission.status = 'EXECUTION_UNAVAILABLE';
        submission.verdict = 'EXECUTION_UNAVAILABLE';
        submission.errorMessage = `Execution queue unavailable: ${queueErr.message}`;
        submission.idempotencyKey = null;
        if (typeof submission.save === 'function') {
          await submission.save();
        }
        throw queueErr;
      }

      // 3. Return 202 immediately with submissionId and pollUrl
      return ApiResponse.success(
        res,
        202,
        {
          submissionId: submission._id,
          status: 'QUEUED',
          jobId: job.id,
          runType: 'SUBMISSION',
          pollUrl: `/api/v1/attempts/${attemptId}/submissions/${submission._id}`
        },
        'Question submission queued for evaluation.'
      );
    } finally {
      inFlightOperations.delete(opKey);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Poll submission execution status and results with ownership verification
 */
export const getSubmissionStatus = async (req, res, next) => {
  try {
    const { attemptId, submissionId } = req.params;

    const submission = await Submission.findOne({
      _id: submissionId,
      attemptId
    }).lean();

    if (!submission) {
      throw ApiError.notFound('Submission record not found.');
    }

    // Ownership verification
    if (req.attempt && submission.attemptId.toString() !== req.attempt._id.toString()) {
      throw ApiError.forbidden('Access denied. Submission does not belong to this attempt.');
    }

    // Zero-Leak Sanitization for student view
    const sanitizedResults = (submission.testResults || []).map((tr, index) => {
      const isHidden = tr.isHidden || tr.visibility === 'hidden';
      if (isHidden) {
        return {
          testIndex: tr.testIndex || index + 1,
          category: 'hidden_suite',
          visibility: 'hidden',
          passed: tr.passed,
          status: tr.status,
          runtimeMs: tr.runtimeMs || 0,
          isHidden: true
        };
      }
      return {
        testIndex: tr.testIndex || index + 1,
        testCaseId: tr.testCaseId,
        category: tr.category,
        visibility: 'public',
        passed: tr.passed,
        status: tr.status,
        input: tr.input,
        expectedOutput: tr.expectedOutput,
        actualOutput: tr.actualOutput,
        runtimeMs: tr.runtimeMs || 0,
        error: tr.error,
        isHidden: false
      };
    });

    const isGraded = submission.status === 'COMPLETED' || 
      ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'MEMORY_LIMIT_EXCEEDED'].includes(submission.verdict);

    return ApiResponse.success(
      res,
      200,
      {
        submissionId: submission._id,
        status: submission.status,
        verdict: submission.verdict,
        runType: submission.runType,
        totalTests: submission.totalTests || 0,
        passedTests: submission.passedTests || 0,
        allPassed: (submission.totalTests > 0) && (submission.passedTests === submission.totalTests),
        passedCount: submission.passedTests || 0,
        totalCount: submission.totalTests || 0,
        scoreAwarded: isGraded ? (submission.scoreAwarded ?? 0) : null,
        maxMarks: submission.maxMarks || 10,
        errorMessage: submission.errorMessage || null,
        testResults: sanitizedResults,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt
      },
      `Submission status: ${submission.status}`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Finalize and submit entire examination
 */
export const finalizeExam = async (req, res, next) => {
  try {
    const { attemptId } = req.params;

    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt) {
      throw ApiError.notFound('Attempt session not found.');
    }

    if (attempt.status === 'SUBMITTED') {
      return ApiResponse.success(
        res,
        200,
        {
          totalScore: attempt.totalScore,
          maxScore: attempt.maxScore,
          finalizedMaxScore: attempt.finalizedMaxScore || attempt.maxScore,
          pendingMaxScore: attempt.pendingMaxScore || 0,
          pendingQuestionsCount: attempt.pendingQuestionsCount || 0,
          isProvisional: Boolean(attempt.isProvisional),
          gradingStatus: attempt.gradingStatus || 'FINALIZED',
          percentage: attempt.percentage,
          status: attempt.status,
          submittedAt: attempt.submittedAt
        },
        'Exam already submitted.'
      );
    }

    attempt.status = 'SUBMITTED';
    attempt.submittedAt = new Date();
    await attempt.save();

    const updatedAttempt = await recalculateAttemptGrading(attempt._id);

    return ApiResponse.success(
      res,
      200,
      {
        totalScore: updatedAttempt.totalScore,
        maxScore: updatedAttempt.maxScore,
        finalizedMaxScore: updatedAttempt.finalizedMaxScore,
        pendingMaxScore: updatedAttempt.pendingMaxScore,
        pendingQuestionsCount: updatedAttempt.pendingQuestionsCount,
        isProvisional: updatedAttempt.isProvisional,
        gradingStatus: updatedAttempt.gradingStatus,
        percentage: updatedAttempt.percentage,
        status: updatedAttempt.status,
        submittedAt: updatedAttempt.submittedAt,
        candidateInfo: updatedAttempt.candidateInfo
      },
      updatedAttempt.isProvisional
        ? `Examination submitted. ${updatedAttempt.pendingQuestionsCount} submission(s) pending runner recovery for grading. Results are provisional.`
        : 'Examination submitted successfully. Your results have been recorded.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Log candidate activity (tab-switches, window blurs, full-screen events) with deduplication & global security policy
 */
export const recordActivity = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { eventType, details } = req.body;

    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt) {
      throw ApiError.notFound('Attempt not found.');
    }

    if (attempt.status !== 'IN_PROGRESS') {
      throw ApiError.badRequest(
        `Cannot record activity for an examination with status '${attempt.status}'. Only active exams accept activity tracking.`
      );
    }

    const safeEventType = eventType || 'HEARTBEAT';
    const now = new Date();

    // Check for rapid duplicate events within 2500ms (e.g. paired blur + visibility change)
    const recentLog = await ActivityLog.findOne({ attemptId }).sort({ timestamp: -1 });
    let isDuplicate = false;

    if (recentLog) {
      const elapsedMs = now.getTime() - new Date(recentLog.timestamp).getTime();
      if (elapsedMs < 2500) {
        if (recentLog.eventType === safeEventType) {
          isDuplicate = true;
        } else if (
          ['TAB_SWITCH', 'WINDOW_BLUR'].includes(recentLog.eventType) &&
          ['TAB_SWITCH', 'WINDOW_BLUR'].includes(safeEventType)
        ) {
          isDuplicate = true;
        }
      }
    }

    // Always persist event log for chronological forensic record
    await ActivityLog.create({
      attemptId,
      eventType: safeEventType,
      details: (details || '') + (isDuplicate ? ' [Deduplicated]' : ''),
      timestamp: now
    });

    const VIOLATION_EVENTS = [
      'TAB_SWITCH',
      'WINDOW_BLUR',
      'FULLSCREEN_EXIT',
      'COPY_ATTEMPT',
      'CUT_ATTEMPT',
      'PASTE_ATTEMPT',
      'CONTEXT_MENU'
    ];

    if (!isDuplicate) {
      if (safeEventType === 'TAB_SWITCH') {
        attempt.tabSwitchCount = (attempt.tabSwitchCount || 0) + 1;
      } else if (safeEventType === 'WINDOW_BLUR') {
        attempt.blurCount = (attempt.blurCount || 0) + 1;
      } else if (safeEventType === 'FULLSCREEN_EXIT') {
        attempt.fullscreenExitCount = (attempt.fullscreenExitCount || 0) + 1;
      } else if (['COPY_ATTEMPT', 'CUT_ATTEMPT', 'PASTE_ATTEMPT'].includes(safeEventType)) {
        attempt.clipboardViolationCount = (attempt.clipboardViolationCount || 0) + 1;
      }

      if (VIOLATION_EVENTS.includes(safeEventType)) {
        attempt.totalViolations = (attempt.totalViolations || 0) + 1;

        // Global violation policy: 3rd infraction marks attempt for teacher review
        if (attempt.totalViolations >= 3 || attempt.tabSwitchCount >= 3) {
          attempt.needsReview = true;
          const reasons = [];
          if (attempt.tabSwitchCount > 0) reasons.push(`${attempt.tabSwitchCount} tab switch${attempt.tabSwitchCount > 1 ? 'es' : ''}`);
          if (attempt.fullscreenExitCount > 0) reasons.push(`${attempt.fullscreenExitCount} fullscreen exit${attempt.fullscreenExitCount > 1 ? 's' : ''}`);
          if (attempt.blurCount > 0) reasons.push(`${attempt.blurCount} window blur${attempt.blurCount > 1 ? 's' : ''}`);
          if (attempt.clipboardViolationCount > 0) reasons.push(`${attempt.clipboardViolationCount} clipboard attempt${attempt.clipboardViolationCount > 1 ? 's' : ''}`);
          attempt.reviewReason = `${attempt.totalViolations} integrity events recorded: ${reasons.join(', ')}`;
        }
      }

      // 4th Confirmed Tab Switch: Atomic Automatic Submission
      if (attempt.tabSwitchCount >= 4) {
        attempt.status = 'SUBMITTED';
        attempt.submittedAt = now;
        attempt.autoSubmitted = true;
        attempt.needsReview = true;
        attempt.autoSubmitReason = 'Exceeded maximum permitted tab switches (4 violations)';
        attempt.lastHeartbeat = now;
        await attempt.save();

        const updatedAttempt = await recalculateAttemptGrading(attempt._id);

        return ApiResponse.success(
          res,
          200,
          {
            tabSwitchCount: attempt.tabSwitchCount || 0,
            blurCount: attempt.blurCount || 0,
            fullscreenExitCount: attempt.fullscreenExitCount || 0,
            clipboardViolationCount: attempt.clipboardViolationCount || 0,
            totalViolations: attempt.totalViolations || 0,
            needsReview: true,
            reviewReason: attempt.reviewReason || null,
            violationLevel: 4,
            isLocked: true,
            autoSubmitted: true,
            autoSubmitReason: attempt.autoSubmitReason,
            status: 'SUBMITTED',
            submittedAt: attempt.submittedAt,
            attempt: {
              _id: updatedAttempt?._id || attempt._id,
              status: 'SUBMITTED',
              autoSubmitted: true,
              autoSubmitReason: attempt.autoSubmitReason,
              totalScore: updatedAttempt?.totalScore ?? attempt.totalScore,
              maxScore: updatedAttempt?.maxScore ?? attempt.maxScore,
              finalizedMaxScore: updatedAttempt?.finalizedMaxScore ?? attempt.finalizedMaxScore,
              pendingMaxScore: updatedAttempt?.pendingMaxScore ?? 0,
              pendingQuestionsCount: updatedAttempt?.pendingQuestionsCount ?? 0,
              isProvisional: updatedAttempt?.isProvisional ?? false,
              gradingStatus: updatedAttempt?.gradingStatus ?? 'FINALIZED',
              percentage: updatedAttempt?.percentage ?? attempt.percentage,
              submittedAt: updatedAttempt?.submittedAt || attempt.submittedAt,
              candidateInfo: updatedAttempt?.candidateInfo || attempt.candidateInfo
            },
            isDeduplicated: false,
            lastHeartbeat: attempt.lastHeartbeat
          },
          'Maximum tab switch limit exceeded. Examination automatically submitted.'
        );
      }
    }

    attempt.lastHeartbeat = now;
    await attempt.save();

    const isLocked = (attempt.tabSwitchCount || 0) >= 3;
    const violationLevel = (attempt.tabSwitchCount || 0) >= 3
      ? 3
      : (attempt.tabSwitchCount === 2
        ? 2
        : (attempt.tabSwitchCount === 1
          ? 1
          : ((attempt.totalViolations || 0) >= 3 ? 3 : (attempt.totalViolations || 0) === 2 ? 2 : (attempt.totalViolations || 0) === 1 ? 1 : 0)));

    return ApiResponse.success(
      res,
      200,
      {
        tabSwitchCount: attempt.tabSwitchCount || 0,
        blurCount: attempt.blurCount || 0,
        fullscreenExitCount: attempt.fullscreenExitCount || 0,
        clipboardViolationCount: attempt.clipboardViolationCount || 0,
        totalViolations: attempt.totalViolations || 0,
        needsReview: !!attempt.needsReview,
        reviewReason: attempt.reviewReason || null,
        violationLevel,
        isLocked,
        autoSubmitted: false,
        isDeduplicated: isDuplicate,
        lastHeartbeat: attempt.lastHeartbeat
      },
      isDuplicate ? 'Activity recorded (deduplicated).' : 'Activity recorded.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve comprehensive integrity audit timeline for an exam attempt
 */
export const getAttemptActivityTimeline = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const attempt = await ExamAttempt.findById(attemptId).lean();
    if (!attempt) {
      throw ApiError.notFound('Attempt not found.');
    }

    const events = await ActivityLog.find({ attemptId })
      .sort({ timestamp: 1 })
      .lean();

    const summary = {
      totalEvents: events.length,
      totalViolations: attempt.totalViolations || 0,
      tabSwitchCount: attempt.tabSwitchCount || 0,
      blurCount: attempt.blurCount || 0,
      fullscreenExitCount: attempt.fullscreenExitCount || 0,
      clipboardViolationCount: attempt.clipboardViolationCount || 0,
      needsReview: !!attempt.needsReview,
      reviewReason: attempt.reviewReason || null,
      autoSubmitted: !!attempt.autoSubmitted,
      autoSubmitReason: attempt.autoSubmitReason || null
    };

    return ApiResponse.success(
      res,
      200,
      {
        attempt: {
          _id: attempt._id,
          candidateInfo: attempt.candidateInfo,
          status: attempt.status,
          startedAt: attempt.startedAt || attempt.createdAt,
          submittedAt: attempt.submittedAt,
          totalScore: attempt.totalScore,
          percentage: attempt.percentage,
          needsReview: attempt.needsReview,
          reviewReason: attempt.reviewReason,
          autoSubmitted: !!attempt.autoSubmitted,
          autoSubmitReason: attempt.autoSubmitReason || null,
          totalViolations: attempt.totalViolations || 0,
          tabSwitchCount: attempt.tabSwitchCount || 0,
          fullscreenExitCount: attempt.fullscreenExitCount || 0,
          blurCount: attempt.blurCount || 0,
          clipboardViolationCount: attempt.clipboardViolationCount || 0
        },
        summary,
        events
      },
      'Activity timeline retrieved successfully.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get past examination attempts and scores for the authenticated student
 */
export const getMyExamAttempts = async (req, res, next) => {
  try {
    const attempts = await ExamAttempt.find({
      $or: [
        { studentId: req.user._id },
        { 'candidateInfo.email': req.user.email.toLowerCase() }
      ]
    })
      .populate('examId', 'title description examCode durationMinutes totalMarks status')
      .sort({ createdAt: -1 })
      .lean();

    return ApiResponse.success(res, 200, attempts, 'Student exam attempts retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Get active examinations available for student to take
 */
export const getAvailableExamsForStudent = async (req, res, next) => {
  try {
    const exams = await Exam.find({ status: 'LIVE' })
      .select('title description examCode durationMinutes totalMarks status createdAt')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    return ApiResponse.success(res, 200, exams, 'Available exams retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Get aggregated student analytics: count-up metrics, score progression, subject breakdown
 */
export const getStudentAnalytics = async (req, res, next) => {
  try {
    const studentQuery = {
      $or: [
        { studentId: req.user._id },
        { 'candidateInfo.email': req.user.email.toLowerCase() }
      ]
    };

    const attempts = await ExamAttempt.find(studentQuery)
      .populate('examId', 'title description examCode durationMinutes totalMarks status')
      .sort({ createdAt: 1 })
      .lean();

    const totalAttempted = attempts.length;
    const submittedAttempts = attempts.filter((a) => a.status === 'submitted');
    const totalCompleted = submittedAttempts.length;

    // Calculate average score percentage
    let totalScoreSum = 0;
    let totalMaxMarksSum = 0;
    const scoreProgression = [];

    submittedAttempts.forEach((att) => {
      const maxMarks = att.examId?.totalMarks || 100;
      const score = att.score ?? 0;
      const pct = maxMarks > 0 ? Math.round((score / maxMarks) * 100) : 0;
      totalScoreSum += score;
      totalMaxMarksSum += maxMarks;

      const d = att.submittedAt || att.createdAt;
      const dateStr = d
        ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'Recent';

      scoreProgression.push({
        date: dateStr,
        score: pct,
        rawScore: score,
        totalMarks: maxMarks,
        title: att.examId?.title || 'Exam'
      });
    });

    const averageScore =
      totalCompleted > 0 && totalMaxMarksSum > 0
        ? Math.round((totalScoreSum / totalMaxMarksSum) * 100)
        : 0;

    // Overall accuracy based strictly on completed assessments
    const accuracy = averageScore;

    // Available / upcoming exams count
    const liveExams = await Exam.find({ status: 'LIVE' }).lean();
    const attemptedExamIds = new Set(
      attempts.map((a) => (a.examId?._id || a.examId)?.toString())
    );
    const upcomingCount = liveExams.filter(
      (e) => !attemptedExamIds.has(e._id.toString())
    ).length;

    // Calculate streak (consecutive days with attempts; 0 if no attempts)
    const uniqueDays = new Set(
      attempts.map((a) =>
        new Date(a.createdAt).toISOString().split('T')[0]
      )
    );
    const streak = attempts.length > 0 ? uniqueDays.size : 0;

    // Subject Performance aggregation based strictly on actual student attempts
    const subjectMap = {};
    attempts.forEach((att) => {
      const subject = att.examId?.title?.split(/[-–:]/)[0]?.trim() || 'Computer Science';
      if (!subjectMap[subject]) {
        subjectMap[subject] = { total: 0, sum: 0, count: 0 };
      }
      const max = att.examId?.totalMarks || 100;
      const sc = att.score ?? 0;
      subjectMap[subject].sum += sc;
      subjectMap[subject].total += max;
      subjectMap[subject].count += 1;
    });

    const subjectPerformance = Object.entries(subjectMap).map(([subject, data]) => ({
      subject,
      score: data.total > 0 ? Math.round((data.sum / data.total) * 100) : 0
    }));

    // Recent activity timeline from real attempts
    const recentActivity = attempts.slice(0, 6).map((att) => ({
      id: att._id,
      title: att.examId?.title || 'Exam Assessment',
      status: att.status,
      score: att.score ?? null,
      maxMarks: att.examId?.totalMarks || 100,
      timestamp: att.updatedAt || att.createdAt,
      type: att.status === 'submitted' ? 'submission' : 'in_progress'
    }));

    return ApiResponse.success(
      res,
      200,
      {
        metrics: {
          testsAttempted: totalAttempted,
          completed: totalCompleted,
          averageScore,
          accuracy,
          upcoming: upcomingCount,
          streak
        },
        scoreProgression,
        subjectPerformance,
        recentActivity
      },
      'Student analytics retrieved successfully.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * In-memory / dynamic notification store for students
 */
export const getStudentNotifications = async (req, res, next) => {
  try {
    const liveExams = await Exam.find({ status: 'LIVE' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const notifications = [
      {
        id: 'notif_welcome',
        title: 'Welcome to TestForge Portal',
        message: 'Your student testing workspace is ready. Practice, join live exams, and track growth.',
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        read: false,
        type: 'system'
      },
      ...liveExams.map((exam, i) => ({
        id: `notif_exam_${exam._id}`,
        title: `Live Exam Available: ${exam.title}`,
        message: `Code: ${exam.examCode} • Duration: ${exam.durationMinutes} mins • Marks: ${exam.totalMarks}`,
        timestamp: exam.createdAt || new Date(Date.now() - 3600000 * (i + 1)).toISOString(),
        read: i > 0,
        type: 'exam',
        examCode: exam.examCode
      }))
    ];

    const unreadCount = notifications.filter((n) => !n.read).length;

    return ApiResponse.success(
      res,
      200,
      {
        notifications,
        unreadCount
      },
      'Student notifications retrieved.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Mark notification as read
 */
export const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    return ApiResponse.success(
      res,
      200,
      { id, read: true },
      'Notification marked as read.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Teacher or Admin grades a manual/subjective question answer
 */
export const gradeStudentAnswer = async (req, res, next) => {
  try {
    const { attemptId, answerId } = req.params;
    const { score, feedback } = req.body;

    if (score === undefined || score === null || isNaN(Number(score))) {
      throw ApiError.badRequest('A valid numeric score is required.');
    }

    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt) {
      throw ApiError.notFound('Exam attempt not found.');
    }

    // Verify ownership of the exam (teacher must be exam creator or admin)
    const exam = await Exam.findById(attempt.examId);
    if (!exam) {
      throw ApiError.notFound('Referenced exam not found.');
    }

    if (req.user.role !== 'admin' && (!exam.createdBy || exam.createdBy.toString() !== req.user._id.toString())) {
      throw ApiError.forbidden('Access denied. Only the exam author or admin may grade student answers.');
    }

    // Verify eligibility: In-progress attempts cannot be manually graded
    if (attempt.status === 'IN_PROGRESS') {
      throw ApiError.badRequest('Attempt session is still in progress. Candidate must submit the examination before grading.');
    }

    // Verify candidate identity associated with this attempt
    if (!attempt.candidateInfo?.email && !attempt.studentId) {
      throw ApiError.badRequest('Attempt session has no valid candidate identity attached.');
    }

    // Find target answer and ensure it belongs to this attempt
    const answer = await StudentAnswer.findOne({
      _id: answerId,
      attemptId
    });

    if (!answer) {
      throw ApiError.notFound('Student answer record not found for this attempt.');
    }

    // Authorization & Consistency Guard: Verify question belongs to the specified exam
    let questionInExam = false;
    let authoritativeMaxMarks = answer.maxMarks;
    const ansQIdStr = answer.questionId?.toString();

    if (exam.sections && exam.sections.length > 0) {
      for (const sec of exam.sections) {
        for (const q of sec.questions || []) {
          const qId = q.type === 'mcq'
            ? (q.mcqQuestionId?._id || q.mcqQuestionId || q._id)?.toString()
            : (q.questionId?._id || q.questionId || q._id)?.toString();
          if (qId === ansQIdStr) {
            questionInExam = true;
            if (q.marks) authoritativeMaxMarks = q.marks;
            break;
          }
        }
        if (questionInExam) break;
      }

      if (!questionInExam) {
        throw ApiError.badRequest('Security violation: Graded question does not belong to the referenced examination.');
      }
    }

    const numericScore = Number(score);
    if (numericScore < 0 || numericScore > authoritativeMaxMarks) {
      throw ApiError.badRequest(`Score must be between 0 and authoritative maximum marks (${authoritativeMaxMarks}).`);
    }

    const roundedScore = Math.round(numericScore * 10) / 10;
    const sanitizedFeedback = feedback ? String(feedback).trim() : '';
    const isRegrade = answer.manualGradingStatus === 'GRADED';
    const regradeReason = req.body.regradeReason ? String(req.body.regradeReason).trim() : '';

    // Regrading requirement: Modifying an already graded answer requires explicit reason
    if (isRegrade && !regradeReason) {
      throw ApiError.badRequest('A regradeReason is required when modifying an already graded answer.');
    }

    // Idempotency: Duplicate request with exact same score and feedback returns existing state
    if (isRegrade && answer.score === roundedScore && (answer.teacherFeedback || '') === sanitizedFeedback) {
      const currentAttempt = await ExamAttempt.findById(attemptId);
      return ApiResponse.success(
        res,
        200,
        {
          answer,
          attempt: currentAttempt
        },
        'Duplicate grading request ignored: answer already graded with identical score and feedback.'
      );
    }

    const previousScore = answer.score ?? null;
    const currentVersion = answer.gradingVersion || 0;
    const newVersion = currentVersion + 1;

    const auditEntry = {
      score: roundedScore,
      gradedBy: req.user._id,
      gradedAt: new Date(),
      feedback: sanitizedFeedback,
      regradeReason: isRegrade ? regradeReason : null,
      previousScore,
      gradingVersion: newVersion
    };

    const auditData = {
      answerId: answer._id,
      attemptId: attempt._id,
      examId: exam._id,
      questionId: answer.questionId || null,
      graderId: req.user._id,
      graderRole: req.user.role || 'teacher',
      previousScore,
      newScore: roundedScore,
      scoreDelta: Math.round((roundedScore - (previousScore || 0)) * 10) / 10,
      authoritativeMaxMarks,
      feedback: sanitizedFeedback,
      regradeReason: isRegrade ? regradeReason : null,
      isRegrade,
      gradingVersion: newVersion,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
      userAgent: typeof req.get === 'function' ? req.get('user-agent') : null
    };

    let session = null;
    let useTransaction = false;
    let updatedAnswer = null;

    if (mongoose.connection?.readyState === 1 && typeof mongoose.startSession === 'function') {
      try {
        session = await mongoose.startSession();
        session.startTransaction();
        useTransaction = true;
      } catch (sessErr) {
        // Standalone MongoDB instances do not support multi-document transactions
        if (session) {
          try { await session.endSession(); } catch (_) {}
          session = null;
        }
        useTransaction = false;
      }
    }

    try {
      if (useTransaction) {
        updatedAnswer = await StudentAnswer.findOneAndUpdate(
          {
            _id: answerId,
            attemptId,
            $or: [
              { gradingVersion: currentVersion },
              { gradingVersion: { $exists: false } }
            ]
          },
          {
            $set: {
              score: roundedScore,
              manualGradingStatus: 'GRADED',
              status: 'SUBMITTED',
              gradedBy: req.user._id,
              gradedAt: new Date(),
              teacherFeedback: sanitizedFeedback
            },
            $inc: { gradingVersion: 1 },
            $push: { gradingHistory: auditEntry }
          },
          { new: true, session }
        );

        if (!updatedAnswer) {
          throw ApiError.conflict('Grading conflict: this answer was modified concurrently by another instructor. Please refresh and review latest marks.');
        }

        await GradingAuditLog.create([auditData], { session });
        await session.commitTransaction();
      } else {
        // 2-Phase Compensating Rollback for Standalone MongoDB / Test Environments
        updatedAnswer = await StudentAnswer.findOneAndUpdate(
          {
            _id: answerId,
            attemptId,
            $or: [
              { gradingVersion: currentVersion },
              { gradingVersion: { $exists: false } }
            ]
          },
          {
            $set: {
              score: roundedScore,
              manualGradingStatus: 'GRADED',
              status: 'SUBMITTED',
              gradedBy: req.user._id,
              gradedAt: new Date(),
              teacherFeedback: sanitizedFeedback
            },
            $inc: { gradingVersion: 1 },
            $push: { gradingHistory: auditEntry }
          },
          { new: true }
        );

        if (!updatedAnswer) {
          throw ApiError.conflict('Grading conflict: this answer was modified concurrently by another instructor. Please refresh and review latest marks.');
        }

        if (mongoose.connection?.readyState === 1 || (GradingAuditLog.create && GradingAuditLog.create._isMockFunction)) {
          try {
            await GradingAuditLog.create(auditData);
          } catch (auditErr) {
            console.error(`[AttemptController] GradingAuditLog creation failed: ${auditErr.message}. Executing 2-phase compensating rollback.`);
            // Roll back the StudentAnswer update
            await StudentAnswer.findOneAndUpdate(
              { _id: answerId, attemptId, gradingVersion: newVersion },
              {
                $set: {
                  score: previousScore,
                  manualGradingStatus: answer.manualGradingStatus || null,
                  status: answer.status,
                  gradedBy: answer.gradedBy || null,
                  gradedAt: answer.gradedAt || null,
                  teacherFeedback: answer.teacherFeedback || ''
                },
                $inc: { gradingVersion: -1 },
                $pull: { gradingHistory: { gradingVersion: newVersion } }
              }
            );
            throw ApiError.internal(`Audit logging failed: score modification was rolled back to maintain audit trail integrity. (${auditErr.message})`);
          }
        }
      }
    } catch (txnError) {
      if (useTransaction && session) {
        try { await session.abortTransaction(); } catch (_) {}
      }
      throw txnError;
    } finally {
      if (session) {
        try { await session.endSession(); } catch (_) {}
      }
    }

    // Trigger authoritative grading recalculation for the entire exam attempt
    const updatedAttempt = await recalculateAttemptGrading(attemptId);

    return ApiResponse.success(
      res,
      200,
      {
        answer: updatedAnswer,
        attempt: updatedAttempt
      },
      'Student answer graded and attempt totals recalculation complete.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Administrator-only clearance for orphaned unconfirmed remote executions.
 * Authenticated, strictly RBAC-restricted to admin, and requires an audit reason.
 */
export const clearOrphanSubmission = async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw ApiError.badRequest('An audit reason is required for administrative orphan clearance.');
    }

    const operatorId = req.user ? req.user._id.toString() : 'unknown';
    const cleared = await clearUnresolvedRemoteExecution(submissionId, operatorId, reason.trim());

    if (!cleared) {
      throw ApiError.notFound('Submission not found or not in an unresolved unconfirmed state.');
    }

    return ApiResponse.success(
      res,
      200,
      { submission: cleared },
      'Unresolved remote execution safely cleared by authorized administrator.'
    );
  } catch (error) {
    next(error);
  }
};

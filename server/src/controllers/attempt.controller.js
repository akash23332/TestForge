import { Exam } from '../models/Exam.js';
import { ExamAttempt } from '../models/ExamAttempt.js';
import { StudentAnswer } from '../models/StudentAnswer.js';
import { Submission } from '../models/Submission.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { Question } from '../models/Question.js';
import { TestCase } from '../models/TestCase.js';
import { McqQuestion } from '../models/McqQuestion.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { validateSingleTestCase } from '../services/codeRunner.service.js';

/**
 * Sanitizes coding question for student: strictly removes reference solutions
 */
const sanitizeQuestionForStudent = (question, maxMarks = 10) => {
  return {
    _id: question._id,
    type: 'coding',
    title: question.title,
    statement: question.statement,
    constraints: question.constraints || '',
    difficulty: question.difficulty,
    language: question.language || 'javascript',
    tags: question.tags || [],
    starterCode: question.starterCode || '',
    examples: question.examples || [],
    maxMarks
  };
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

    if (attempt) {
      if (attempt.status === 'SUBMITTED' || attempt.status === 'DISQUALIFIED') {
        return ApiResponse.success(
          res,
          200,
          {
            alreadyCompleted: true,
            attemptId: attempt._id,
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

          sanitizedQuestions.push({
            _id: mcqId,
            type: 'mcq',
            title: `MCQ: ${(mcqData.question || 'Multiple Choice Question').slice(0, 50)}...`,
            statement: mcqData.question || '',
            optionA: mcqData.optionA || '',
            optionB: mcqData.optionB || '',
            optionC: mcqData.optionC || '',
            optionD: mcqData.optionD || '',
            topic: mcqData.topic || 'General',
            difficulty: mcqData.difficulty || 'Medium',
            maxMarks: qMarks
            // ZERO LEAK: correctAnswer and explanation are completely withheld
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

    return ApiResponse.success(
      res,
      200,
      {
        attempt: {
          _id: attempt._id,
          sessionToken: attempt.sessionToken,
          startedAt: attempt.startedAt,
          expiresAt: attempt.expiresAt,
          status: attempt.status,
          tabSwitchCount: attempt.tabSwitchCount,
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

    const sampleTests = await TestCase.find({
      questionId,
      $or: [{ visibility: 'public' }, { category: 'sample' }]
    }).lean();

    if (!sampleTests.length) {
      return ApiResponse.success(
        res,
        200,
        {
          testResults: [],
          passedCount: 0,
          totalCount: 0,
          message: 'No sample test cases configured for this challenge.'
        },
        'Sample tests evaluated.'
      );
    }

    const testResults = [];
    let passedCount = 0;

    for (const testCase of sampleTests) {
      const result = await validateSingleTestCase({
        code,
        testCase,
        questionContext: { language: language || question.language, title: question.title },
        timeoutMs: 3000
      });

      testResults.push({
        testCaseId: testCase._id,
        category: testCase.category,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: result.actualOutput,
        passed: result.passed,
        status: result.status,
        error: result.error,
        runtimeMs: result.runtimeMs
      });

      if (result.passed) passedCount++;
    }

    return ApiResponse.success(
      res,
      200,
      {
        testResults,
        passedCount,
        totalCount: sampleTests.length,
        allPassed: passedCount === sampleTests.length
      },
      'Sample tests completed.'
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
      if (!correctAnswer && mcqTarget?.mcqQuestionId) {
        const mcqDoc = await McqQuestion.findById(mcqTarget.mcqQuestionId).lean();
        correctAnswer = mcqDoc?.correctAnswer;
      }

      const candidateChoice = (selectedOption || studentAnswer?.selectedOption || '').trim().toUpperCase();
      const isCorrect = correctAnswer && candidateChoice === correctAnswer.trim().toUpperCase();
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

    // ── CODING EVALUATION ─────────────────────────────────────────────────────
    const question = await Question.findById(questionId).lean();
    if (!question) {
      throw ApiError.notFound('Coding challenge not found.');
    }

    const allTests = await TestCase.find({ questionId }).lean();

    if (!allTests.length) {
      if (studentAnswer) {
        studentAnswer.code = code;
        studentAnswer.language = language;
        studentAnswer.score = maxMarks;
        studentAnswer.status = 'SUBMITTED';
        studentAnswer.testCasesPassed = 1;
        studentAnswer.totalTestCases = 1;
        await studentAnswer.save();
      }

      return ApiResponse.success(
        res,
        200,
        {
          scoreAwarded: maxMarks,
          maxMarks,
          passedTests: 1,
          totalTests: 1,
          verdict: 'ACCEPTED',
          testResults: []
        },
        'Submitted successfully.'
      );
    }

    let passedCount = 0;
    const fullResults = [];
    const sanitizedResults = [];

    for (const testCase of allTests) {
      const isHidden = testCase.visibility === 'hidden';
      const result = await validateSingleTestCase({
        code,
        testCase,
        questionContext: { language: language || question.language, title: question.title },
        timeoutMs: 3500
      });

      if (result.passed) passedCount++;

      fullResults.push({
        testCaseId: testCase._id,
        category: testCase.category,
        visibility: testCase.visibility,
        passed: result.passed,
        status: result.status,
        runtimeMs: result.runtimeMs,
        error: result.error
      });

      // ZERO LEAK: input and expectedOutput are omitted for hidden test cases
      if (isHidden) {
        sanitizedResults.push({
          testCaseId: testCase._id,
          category: 'hidden_suite',
          visibility: 'hidden',
          passed: result.passed,
          status: result.status,
          runtimeMs: result.runtimeMs,
          isHidden: true
        });
      } else {
        sanitizedResults.push({
          testCaseId: testCase._id,
          category: testCase.category,
          visibility: 'public',
          passed: result.passed,
          status: result.status,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: result.actualOutput,
          runtimeMs: result.runtimeMs,
          error: result.error,
          isHidden: false
        });
      }
    }

    const passRatio = passedCount / allTests.length;
    const scoreAwarded = Math.round(passRatio * maxMarks * 10) / 10;

    let verdict = 'WRONG_ANSWER';
    if (passedCount === allTests.length) {
      verdict = 'ACCEPTED';
    } else if (passedCount > 0) {
      verdict = 'PARTIALLY_ACCEPTED';
    }

    await Submission.create({
      attemptId,
      questionId,
      code,
      language,
      testResults: fullResults,
      totalTests: allTests.length,
      passedTests: passedCount,
      scoreAwarded,
      maxMarks,
      verdict
    });

    if (studentAnswer) {
      studentAnswer.code = code;
      studentAnswer.language = language;
      studentAnswer.score = scoreAwarded;
      studentAnswer.testCasesPassed = passedCount;
      studentAnswer.totalTestCases = allTests.length;
      studentAnswer.status = 'SUBMITTED';
      await studentAnswer.save();
    }

    return ApiResponse.success(
      res,
      200,
      {
        scoreAwarded,
        maxMarks,
        passedTests: passedCount,
        totalTests: allTests.length,
        verdict,
        testResults: sanitizedResults
      },
      'Solution verified against test suite.'
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
          percentage: attempt.percentage,
          status: attempt.status,
          submittedAt: attempt.submittedAt
        },
        'Exam already submitted.'
      );
    }

    const answers = await StudentAnswer.find({ attemptId }).lean();
    let totalScore = 0;
    let maxScore = 0;

    for (const ans of answers) {
      totalScore += (ans.score || 0);
      maxScore += (ans.maxMarks || (ans.questionType === 'mcq' ? 2 : 10));
    }

    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    attempt.totalScore = Math.round(totalScore * 10) / 10;
    attempt.maxScore = maxScore;
    attempt.percentage = percentage;
    attempt.status = 'SUBMITTED';
    attempt.submittedAt = new Date();
    await attempt.save();

    return ApiResponse.success(
      res,
      200,
      {
        totalScore: attempt.totalScore,
        maxScore: attempt.maxScore,
        percentage: attempt.percentage,
        status: attempt.status,
        submittedAt: attempt.submittedAt,
        candidateInfo: attempt.candidateInfo
      },
      'Examination submitted successfully. Your results have been recorded.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Log candidate activity (tab-switches, window blurs, full-screen events)
 */
export const recordActivity = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { eventType, details } = req.body;

    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt) {
      throw ApiError.notFound('Attempt not found.');
    }

    await ActivityLog.create({
      attemptId,
      eventType: eventType || 'HEARTBEAT',
      details: details || ''
    });

    if (eventType === 'TAB_SWITCH' || eventType === 'WINDOW_BLUR') {
      attempt.tabSwitchCount = (attempt.tabSwitchCount || 0) + 1;
    }
    attempt.lastHeartbeat = new Date();
    await attempt.save();

    return ApiResponse.success(
      res,
      200,
      {
        tabSwitchCount: attempt.tabSwitchCount,
        lastHeartbeat: attempt.lastHeartbeat
      },
      'Activity recorded.'
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

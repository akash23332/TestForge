import { ExamAttempt } from '../models/ExamAttempt.js';
import { StudentAnswer } from '../models/StudentAnswer.js';
import { Submission } from '../models/Submission.js';

/**
 * Authoritative recalculation of examination attempt grading.
 * Enforces strict score integrity:
 * 1. NEVER publishes a final percentage while required questions remain ungraded.
 * 2. NEVER excludes unavailable questions from denominator to compute a false inflated percentage.
 * 3. Preserves all already completed valid question scores.
 * 4. Labels attempts as PROVISIONAL when grading is pending.
 * 5. Automatically transitions to FINALIZED with true percentage when runner recovers and completes grading.
 * 
 * @param {string|import('mongoose').Types.ObjectId} attemptId
 * @returns {Promise<import('../models/ExamAttempt.js').ExamAttempt|null>}
 */
export const recalculateAttemptGrading = async (attemptId) => {
  if (!attemptId) return null;
  const attempt = await ExamAttempt.findById(attemptId);
  if (!attempt || attempt.status !== 'SUBMITTED') return null;

  const answers = await StudentAnswer.find({ attemptId }).lean();

  // Find any submissions for this attempt that are pending or unavailable
  const pendingSubmissions = await Submission.find({
    attemptId,
    runType: 'SUBMISSION',
    status: { $in: ['EXECUTION_UNAVAILABLE', 'QUEUED', 'RUNNING', 'RECOVERING'] }
  }).select('questionId status').lean();

  const pendingQIds = new Set(pendingSubmissions.map((s) => s.questionId.toString()));

  let totalScore = 0;
  let maxScore = 0;
  let gradedMaxScore = 0;
  let pendingGradingQuestions = 0;
  let pendingMaxScore = 0;

  for (const ans of answers) {
    // Exclude cancelled or exempt questions per exam policy
    if (ans.isCancelled || ans.isExcluded) {
      continue;
    }

    const qIdStr = ans.questionId ? ans.questionId.toString() : '';
    const isPendingSubmission = pendingQIds.has(qIdStr);
    const qMaxMarks = ans.maxMarks || (ans.questionType === 'mcq' ? 2 : 10);
    maxScore += qMaxMarks;

    let isPending = false;
    if (ans.questionType === 'subjective') {
      // Subjective question pending if manual grading status is PENDING or score is null
      if (ans.manualGradingStatus === 'PENDING' || ans.score === null || ans.score === undefined) {
        isPending = true;
      }
    } else if (ans.questionType === 'coding') {
      // Coding question is pending if runner execution is active/queued/recovering/unavailable,
      // or if score has not yet been awarded
      if (isPendingSubmission || ans.score === null || ans.score === undefined) {
        isPending = true;
      }
    }

    if (isPending) {
      pendingGradingQuestions++;
      pendingMaxScore += qMaxMarks;
    } else {
      totalScore += (ans.score || 0);
      gradedMaxScore += qMaxMarks;
    }
  }

  // Denominator Integrity: Exam denominator can NEVER be artificially reduced below configured attempt maxScore
  if (attempt.maxScore && attempt.maxScore > maxScore) {
    maxScore = attempt.maxScore;
  }

  const isProvisional = pendingGradingQuestions > 0;

  // STRICT SCORE INTEGRITY RULE:
  // Never publish a final percentage while required questions remain ungraded.
  // Percentage is null while provisional; only computed against full maxScore when all questions are finalized.
  const percentage = isProvisional
    ? null
    : (maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0);

  attempt.totalScore = Math.round(totalScore * 10) / 10;
  attempt.maxScore = maxScore;
  attempt.finalizedMaxScore = gradedMaxScore;
  attempt.pendingMaxScore = pendingMaxScore;
  attempt.pendingQuestionsCount = pendingGradingQuestions;
  attempt.isProvisional = isProvisional;
  attempt.gradingStatus = isProvisional ? 'PROVISIONAL' : 'FINALIZED';
  attempt.percentage = percentage;

  await attempt.save();
  return attempt;
};

export default {
  recalculateAttemptGrading
};

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
  const attempt = await ExamAttempt.findById(attemptId);
  if (!attempt) return null;

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
    const qIdStr = ans.questionId ? ans.questionId.toString() : '';
    const isPending = pendingQIds.has(qIdStr);
    const qMaxMarks = ans.maxMarks || (ans.questionType === 'mcq' ? 2 : 10);
    maxScore += qMaxMarks;

    // If an answer has pending/unavailable execution and has not been finalized with a completed score
    if (isPending && (ans.score === null || ans.score === undefined || ans.status !== 'SUBMITTED')) {
      pendingGradingQuestions++;
      pendingMaxScore += qMaxMarks;
    } else {
      totalScore += (ans.score || 0);
      gradedMaxScore += qMaxMarks;
    }
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

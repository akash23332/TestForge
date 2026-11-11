import { Submission } from '../../models/Submission.js';
import { Question } from '../../models/Question.js';
import { TestCase } from '../../models/TestCase.js';
import { StudentAnswer } from '../../models/StudentAnswer.js';
import { Exam } from '../../models/Exam.js';
import { validateSingleTestCase } from '../codeRunner.service.js';
import { providerRegistry } from '../execution/providerRegistry.js';
import { recalculateAttemptGrading } from '../attemptGrading.service.js';

/**
 * Core execution job processor invoked by BullMQ worker.
 * Idempotently executes test cases, invokes the judging engine, and persists authoritative results to MongoDB.
 * 
 * @param {import('bullmq').Job} job
 */
export const processExecutionJob = async (job) => {
  const { submissionId, attemptId, questionId, runType = 'SUBMISSION' } = job.data;

  // 1. Fetch trusted submission record
  const submission = await Submission.findById(submissionId);
  if (!submission) {
    throw new Error(`[ExecutionProcessor] Submission record ${submissionId} not found in database.`);
  }

  // 2. Idempotency Guard: Avoid duplicate execution if already finalized
  if (submission.status === 'COMPLETED' || submission.status === 'COMPILE_ERROR' || submission.status === 'RUNTIME_ERROR' || submission.status === 'TIME_LIMIT_EXCEEDED') {
    return {
      submissionId: submission._id,
      status: submission.status,
      verdict: submission.verdict,
      alreadyCompleted: true,
      message: 'Submission already processed'
    };
  }

  // 3. Mark state as RUNNING in MongoDB
  submission.status = 'RUNNING';
  submission.jobId = job.id;
  await submission.save();

  try {
    // 4. Fetch trusted problem context and test cases from MongoDB
    const question = await Question.findById(questionId).lean();
    if (!question) {
      submission.status = 'INTERNAL_ERROR';
      submission.errorMessage = `Question ${questionId} not found in database.`;
      await submission.save();
      return;
    }

    const testFilter = { questionId };
    if (runType === 'SAMPLE') {
      testFilter.$or = [{ visibility: 'public' }, { category: 'sample' }];
    }

    const testCases = await TestCase.find(testFilter).lean();

    if (!testCases || testCases.length === 0) {
      submission.status = 'COMPLETED';
      submission.verdict = 'ACCEPTED';
      submission.totalTests = 0;
      submission.passedTests = 0;
      submission.testResults = [];
      await submission.save();
      return;
    }

    const activeProvider = providerRegistry.getProvider();
    const evaluatedResults = [];
    let passedCount = 0;
    let criticalErrorStatus = null;

    // 5. Evaluate each test case through the judging engine
    for (let index = 0; index < testCases.length; index++) {
      const tc = testCases[index];
      const isHidden = tc.visibility === 'hidden';

      const result = await validateSingleTestCase({
        code: submission.code,
        testCase: tc,
        questionContext: {
          title: question.title,
          language: submission.language || question.language
        },
        timeoutMs: 3500,
        provider: activeProvider
      });

      if (result.passed) {
        passedCount++;
      }

      // Check for non-grading systemic statuses
      if (!criticalErrorStatus) {
        if (result.status === 'timeout') criticalErrorStatus = 'TIME_LIMIT_EXCEEDED';
        else if (result.status === 'memory_limit_exceeded') criticalErrorStatus = 'MEMORY_LIMIT_EXCEEDED';
        else if (result.status === 'compilation_error') criticalErrorStatus = 'COMPILE_ERROR';
        else if (result.status === 'runtime_error') criticalErrorStatus = 'RUNTIME_ERROR';
        else if (result.status === 'internal_error') criticalErrorStatus = 'INTERNAL_ERROR';
      }

      // Format result record according to Zero-Leak policy
      evaluatedResults.push({
        testIndex: index + 1,
        testCaseId: isHidden ? null : tc._id,
        category: isHidden ? 'hidden_suite' : tc.category,
        visibility: isHidden ? 'hidden' : 'public',
        passed: result.passed,
        status: result.status,
        runtimeMs: result.runtimeMs || 0,
        error: isHidden ? null : result.error,
        input: isHidden ? null : tc.input,
        expectedOutput: isHidden ? null : tc.expectedOutput,
        actualOutput: isHidden ? null : result.actualOutput,
        isHidden
      });
    }

    // 6. Calculate scoring and verdict
    const totalCount = testCases.length;
    const isInfrastructureFailure = criticalErrorStatus === 'INTERNAL_ERROR';

    let verdict = 'WRONG_ANSWER';
    let finalStatus = criticalErrorStatus || 'COMPLETED';
    let scoreAwarded = null;

    if (isInfrastructureFailure) {
      verdict = 'EXECUTION_UNAVAILABLE';
      finalStatus = 'EXECUTION_UNAVAILABLE';
      scoreAwarded = null;
      submission.errorMessage = 'Execution infrastructure temporarily unavailable. Submission preserved for idempotent retry.';
    } else {
      const passRatio = totalCount > 0 ? passedCount / totalCount : 0;
      const maxMarks = submission.maxMarks || 10;
      scoreAwarded = Math.round(passRatio * maxMarks * 10) / 10;

      if (criticalErrorStatus && passedCount === 0) {
        verdict = criticalErrorStatus;
      } else if (passedCount === totalCount) {
        verdict = 'ACCEPTED';
      } else if (passedCount > 0) {
        verdict = 'PARTIALLY_ACCEPTED';
      }
    }

    // 7. Persist authoritative results to MongoDB
    submission.testResults = evaluatedResults;
    submission.totalTests = totalCount;
    submission.passedTests = passedCount;
    submission.scoreAwarded = scoreAwarded;
    submission.verdict = verdict;
    submission.status = finalStatus;
    await submission.save();

    // 8. If this was a full submission and NOT an infrastructure failure, update student's answer record
    if (runType === 'SUBMISSION' && !isInfrastructureFailure) {
      const qIdStr = questionId.toString();
      await StudentAnswer.findOneAndUpdate(
        { attemptId, $or: [{ questionId: qIdStr }, { questionId }] },
        {
          $set: {
            code: submission.code,
            language: submission.language,
            score: scoreAwarded,
            testCasesPassed: passedCount,
            totalTestCases: totalCount,
            status: 'SUBMITTED',
            verdict
          }
        },
        { new: true, upsert: true }
      );

      // Automatically recalculate attempt scores if the exam attempt was already submitted (e.g. recovery post-submission)
      try {
        await recalculateAttemptGrading(attemptId);
      } catch (err) {
        // Log attempt recalculation failure without failing the submission job
        console.warn(`[ExecutionProcessor] Attempt recalculation warning for ${attemptId}: ${err.message}`);
      }
    }

    // If infrastructure outage, fail closed and throw so BullMQ backoff retry handles it
    if (isInfrastructureFailure) {
      throw new Error(`[ExecutionProcessor] Infrastructure failure: Runner unavailable for submission ${submission._id}. Job queued for retry.`);
    }

    return {
      submissionId: submission._id,
      status: finalStatus,
      verdict,
      passedTests: passedCount,
      totalTests: totalCount,
      scoreAwarded
    };
  } catch (err) {
    if (submission.status !== 'EXECUTION_UNAVAILABLE') {
      submission.status = 'INTERNAL_ERROR';
    }
    submission.errorMessage = err.message || 'Worker processing error';
    await submission.save();
    throw err; // Re-throw to allow BullMQ backoff retry
  }
};

export default {
  processExecutionJob
};

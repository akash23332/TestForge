import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { Question } from '../models/Question.js';
import { TestCase } from '../models/TestCase.js';
import { MutationReport } from '../models/MutationReport.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { enqueueMutationJob } from '../services/queue/mutationQueue.js';
import { processMutationJob } from '../services/queue/mutationProcessor.js';
import { updateMutantClassification } from '../services/mutation/equivalenceService.js';
import { adoptCandidateTest, rejectCandidateTest } from '../services/candidateAdoption.service.js';

/**
 * POST /api/v1/questions/:id/mutation-runs
 * Enqueues an asynchronous mutation-testing run for a question.
 * Returns HTTP 202 with runId and initial PENDING status.
 */
export const runMutations = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.notFound('Invalid question ID');
    }

    const question = await Question.findById(id);
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    // Authorization check: User must be admin or the owner of the question
    if (
      req.user &&
      req.user.role !== 'admin' &&
      question.ownerId &&
      question.ownerId.toString() !== req.user._id.toString()
    ) {
      throw ApiError.forbidden('You do not have permission to run mutations on this question');
    }

    const referenceCode = question.referenceSolution || question.starterCode || '';
    if (!referenceCode.trim()) {
      throw ApiError.badRequest('Question does not have reference code configured for mutation testing');
    }

    const testCaseCount = await TestCase.countDocuments({ questionId: id });
    if (testCaseCount === 0) {
      throw ApiError.badRequest('Question must have at least one test case before running mutation testing');
    }

    // Synchronous execution restriction (strictly prohibited in production environments)
    const isSyncRequested = req.query.sync === 'true' || req.headers['x-sync-mode'] === 'true';
    if (isSyncRequested) {
      if (config.env === 'production' || process.env.NODE_ENV === 'production') {
        throw ApiError.badRequest('Synchronous mutation execution is disabled in production environments. Please use asynchronous queue processing.');
      }
    }

    // Bound mutation options to prevent unbounded workload and report size explosion
    const boundedOptions = {
      ...(req.body?.options || {}),
      maxMutants: Math.min(Math.max(Number(req.body?.options?.maxMutants) || 10, 1), 50)
    };

    // Pre-check for an already active run to prevent duplicate stampeding
    const activeRun = await MutationReport.findOne({
      questionId: id,
      status: { $in: ['PENDING', 'RUNNING'] }
    }).sort({ createdAt: -1 });

    if (activeRun) {
      // Check if the activeRun is stale (> 2 minutes without progress)
      const STALE_RUN_TIMEOUT_MS = 2 * 60 * 1000;
      const isStale = (Date.now() - new Date(activeRun.updatedAt || activeRun.createdAt).getTime()) > STALE_RUN_TIMEOUT_MS;

      if (isStale) {
        console.warn(`[MutationController] Clearing abandoned/stale mutation run ${activeRun._id} (stuck for > 2m).`);
        await MutationReport.updateOne(
          { _id: activeRun._id },
          {
            $set: {
              status: 'FAILED',
              failureReason: 'Mutation run timed out after remaining unresponsive for > 2 minutes.',
              activeLock: null
            }
          }
        );
      } else {
        return ApiResponse.success(
          res,
          202,
          {
            runId: activeRun._id.toString(),
            questionId: question._id.toString(),
            status: activeRun.status,
            progress: activeRun.progress,
            alreadyActive: true
          },
          'A mutation testing run is already active for this question'
        );
      }
    }

    // Atomic create: Sparse unique index on activeLock guarantees that concurrent simultaneous
    // requests will fail atomically with duplicate key error (11000) on activeLock.
    let report;
    try {
      report = await MutationReport.create({
        questionId: question._id,
        teacherId: req.user ? req.user._id : (question.ownerId || new mongoose.Types.ObjectId()),
        status: 'PENDING',
        activeLock: question._id.toString(),
        totalMutants: 0,
        progress: {
          total: 0,
          completed: 0,
          currentMutant: 0,
          currentTestCase: 0
        }
      });
    } catch (createErr) {
      if (createErr.code === 11000) {
        // Atomic race resolution: Another concurrent request won the insert race
        const existingRun = await MutationReport.findOne({
          questionId: id,
          status: { $in: ['PENDING', 'RUNNING'] }
        }).sort({ createdAt: -1 });

        if (existingRun) {
          const lastTouch = new Date(existingRun.updatedAt || existingRun.createdAt).getTime();
          if (Date.now() - lastTouch <= 120000) {
            return ApiResponse.success(
              res,
              202,
              {
                runId: existingRun._id.toString(),
                questionId: question._id.toString(),
                status: existingRun.status,
                progress: existingRun.progress,
                alreadyActive: true
              },
              'A mutation testing run is already active for this question'
            );
          }

          // Existing run is stale (> 2m): release lock and mark failed
          console.warn(`[MutationController] Clearing stale running report ${existingRun._id} on 11000 conflict.`);
          existingRun.status = 'FAILED';
          existingRun.activeLock = null;
          existingRun.errorMessage = 'Mutation run timed out after remaining unresponsive for > 2 minutes.';
          existingRun.completedAt = new Date();
          await existingRun.save();
        } else {
          // 11000 occurred without an active PENDING/RUNNING report (orphaned activeLock)
          console.warn(`[MutationController] Clearing orphaned activeLock on question ${question._id}`);
          await MutationReport.updateMany(
            { activeLock: question._id.toString() },
            { $set: { activeLock: null } }
          );
        }

        // Safe single retry to create new report after clearing stale/orphaned lock
        report = await MutationReport.create({
          questionId: question._id,
          teacherId: req.user ? req.user._id : (question.ownerId || new mongoose.Types.ObjectId()),
          status: 'PENDING',
          activeLock: question._id.toString(),
          totalMutants: 0,
          progress: {
            total: 0,
            completed: 0,
            currentMutant: 0,
            currentTestCase: 0
          }
        });
      } else {
        throw createErr;
      }
    }

    // Synchronous execution hook (for legacy test suites passing ?sync=true in test env)
    if (isSyncRequested) {
      const mockJob = {
        id: `sync_${report._id}`,
        data: {
          reportId: report._id.toString(),
          questionId: question._id.toString(),
          teacherId: (req.user ? req.user._id : question.ownerId).toString(),
          customMutants: req.body?.customMutants,
          options: boundedOptions
        },
        updateProgress: async () => {}
      };

      await processMutationJob(mockJob);
      const finishedReport = await MutationReport.findById(report._id);

      return ApiResponse.success(
        res,
        200,
        {
          runId: finishedReport._id.toString(),
          questionId: id,
          status: finishedReport.status,
          totalMutants: finishedReport.totalMutants,
          totalEligible: finishedReport.killedCount + finishedReport.survivedCount,
          killed: finishedReport.killedCount,
          survived: finishedReport.survivedCount,
          invalid: finishedReport.compilationErrorCount,
          mutationScore: finishedReport.mutationScore,
          mutants: finishedReport.mutants,
          candidateTests: finishedReport.candidateTests
        },
        'Mutation test execution finished synchronously'
      );
    }

    // Asynchronous BullMQ execution
    await enqueueMutationJob({
      reportId: report._id,
      questionId: question._id,
      teacherId: req.user ? req.user._id : question.ownerId,
      customMutants: req.body?.customMutants,
      options: boundedOptions
    });

    return ApiResponse.success(
      res,
      202,
      {
        runId: report._id.toString(),
        questionId: question._id.toString(),
        status: report.status,
        progress: report.progress,
        createdAt: report.createdAt
      },
      'Mutation run enqueued successfully'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/questions/:id/mutation-runs/:runId
 * Retrieves status, progress, scores, counts, mutant results, and candidate tests.
 */
export const getMutationRun = async (req, res, next) => {
  try {
    const { id, runId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(runId)) {
      throw ApiError.notFound('Invalid question or run ID');
    }

    const question = await Question.findById(id);
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    const report = await MutationReport.findById(runId);
    if (!report) {
      throw ApiError.notFound('Mutation report not found');
    }

    if (report.questionId.toString() !== question._id.toString()) {
      throw ApiError.notFound('Mutation report does not belong to this question');
    }

    // Staleness check on GET: If report is stuck in PENDING/RUNNING for > 2 minutes without updates, auto-reconcile
    if (report.status === 'PENDING' || report.status === 'RUNNING') {
      const lastTouch = new Date(report.updatedAt || report.createdAt).getTime();
      if (Date.now() - lastTouch > 120000) {
        console.warn(`[MutationController] Auto-reconciling stale mutation run ${report._id} on GET polling.`);
        report.status = 'FAILED';
        report.activeLock = null;
        report.errorMessage = report.errorMessage || 'Mutation run timed out after remaining unresponsive for > 2 minutes.';
        report.completedAt = new Date();
        await report.save();
      }
    }

    // Authorization check
    if (
      req.user &&
      req.user.role !== 'admin' &&
      report.teacherId.toString() !== req.user._id.toString() &&
      question.ownerId &&
      question.ownerId.toString() !== req.user._id.toString()
    ) {
      throw ApiError.forbidden('You do not have permission to view this mutation report');
    }

    return ApiResponse.success(
      res,
      200,
      {
        runId: report._id.toString(),
        questionId: report.questionId.toString(),
        teacherId: report.teacherId.toString(),
        status: report.status,
        mutationScore: report.mutationScore,
        totalMutants: report.totalMutants,
        killedCount: report.killedCount,
        survivedCount: report.survivedCount,
        equivalentCount: report.equivalentCount,
        compilationErrorCount: report.compilationErrorCount,
        runtimeErrorCount: report.runtimeErrorCount,
        timeoutCount: report.timeoutCount,
        progress: report.progress,
        mutants: report.mutants,
        candidateTests: report.candidateTests,
        errorMessage: report.errorMessage,
        startedAt: report.startedAt,
        completedAt: report.completedAt,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        version: report.__v
      },
      'Mutation report retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/questions/:id/mutation-runs/:runId/mutants/:mutantId/classification
 * Allows teachers to classify a surviving mutant as EQUIVALENT or revert it to SURVIVED.
 * Strict authorization: Only the question/report owner or an admin can classify mutants.
 */
export const classifyMutant = async (req, res, next) => {
  try {
    const { id, runId, mutantId } = req.params;
    const { classification, newClassification, reason, expectedVersion } = req.body;

    const targetClassification = newClassification || classification;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(runId)) {
      throw ApiError.notFound('Invalid question or run ID');
    }

    const question = await Question.findById(id);
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    // Question ownership verification
    if (
      req.user &&
      req.user.role !== 'admin' &&
      question.ownerId &&
      question.ownerId.toString() !== req.user._id.toString()
    ) {
      throw ApiError.forbidden('You do not have permission to modify mutation results for this question');
    }

    const result = await updateMutantClassification({
      reportId: runId,
      mutantId,
      newClassification: targetClassification,
      reason,
      user: req.user,
      expectedVersion
    });

    return ApiResponse.success(res, 200, result, 'Mutant classification updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/questions/:id/mutation-runs/:runId/candidates/:candidateId/adopt
 * Adopts a mutation-generated candidate test case into the Question's TestCase collection.
 */
export const adoptCandidate = async (req, res, next) => {
  try {
    const { id, runId, candidateId } = req.params;
    const { input, expectedOutput, customInput, customExpectedOutput, category, visibility } = req.body || {};

    const effectiveInput = customInput !== undefined ? customInput : input;
    const effectiveExpectedOutput = customExpectedOutput !== undefined ? customExpectedOutput : expectedOutput;

    const result = await adoptCandidateTest({
      questionId: id,
      reportId: runId,
      candidateId,
      user: req.user,
      customInput: effectiveInput,
      customExpectedOutput: effectiveExpectedOutput,
      category,
      visibility
    });

    return ApiResponse.success(
      res,
      result.statusCode || 201,
      result,
      result.alreadyAdopted
        ? 'Candidate test case already adopted'
        : 'Candidate test case successfully adopted into Question test suite'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/questions/:id/mutation-runs/:runId/candidates/:candidateId/reject
 * Rejects an eligible mutation-generated candidate test case with reason tracking.
 */
export const rejectCandidate = async (req, res, next) => {
  try {
    const { id, runId, candidateId } = req.params;
    const { rejectionReason, reason } = req.body || {};
    const effectiveReason = rejectionReason !== undefined ? rejectionReason : reason;

    const result = await rejectCandidateTest({
      questionId: id,
      reportId: runId,
      candidateId,
      user: req.user,
      rejectionReason: effectiveReason
    });

    return ApiResponse.success(
      res,
      result.statusCode || 200,
      result,
      result.alreadyRejected
        ? 'Candidate test case already rejected'
        : 'Candidate test case rejected successfully'
    );
  } catch (error) {
    next(error);
  }
};

export default {
  runMutations,
  getMutationRun,
  classifyMutant,
  adoptCandidate,
  rejectCandidate
};

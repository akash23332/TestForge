import crypto from 'crypto';
import mongoose from 'mongoose';
import { Question } from '../models/Question.js';
import { MutationReport } from '../models/MutationReport.js';
import { TestCase } from '../models/TestCase.js';
import { ApiError } from '../utils/apiError.js';
import { validateSingleTestCase } from './codeRunner.service.js';

/**
 * Adopts a mutation-generated candidate test case into the Question's permanent test suite.
 * Executes dual verification outside database transactions, then commits persistence changes
 * atomically with optimistic concurrency control and write fencing.
 */
export async function adoptCandidateTest({
  questionId,
  reportId,
  candidateId,
  user,
  customInput,
  customExpectedOutput,
  category = 'edge_case',
  visibility = 'hidden'
}) {
  // ─── STAGE 1: AUTHORIZATION & RELATIONSHIP VERIFICATION ───
  if (!mongoose.Types.ObjectId.isValid(questionId)) {
    throw ApiError.badRequest('Invalid question ID format.');
  }
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw ApiError.badRequest('Invalid mutation report ID format.');
  }
  if (!candidateId || typeof candidateId !== 'string') {
    throw ApiError.badRequest('Candidate ID is required.');
  }
  if (!user || !user._id) {
    throw ApiError.unauthorized('Authentication required to adopt candidate test cases.');
  }

  const baseQuestion = await Question.findById(questionId);
  if (!baseQuestion) {
    throw ApiError.notFound('Question not found');
  }

  const isOwner = baseQuestion.ownerId && baseQuestion.ownerId.toString() === user._id.toString();
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('You are not authorized to adopt candidate tests for this question.');
  }

  // Require Authoritative Reference Solution (Starter code fallback strictly eliminated!)
  if (!baseQuestion.referenceSolution || typeof baseQuestion.referenceSolution !== 'string' || baseQuestion.referenceSolution.trim().length === 0) {
    throw new ApiError(400, 'Question lacks an authoritative reference solution.', 'MISSING_AUTHORITATIVE_REFERENCE_SOLUTION');
  }

  // Enforce Strict Question-Report Relationship
  const existingReport = await MutationReport.findById(reportId);
  if (!existingReport) {
    throw ApiError.notFound('Mutation report not found');
  }

  if (existingReport.questionId.toString() !== questionId.toString()) {
    throw new ApiError(400, 'MutationReport does not belong to the specified Question.', 'INVALID_REPORT_QUESTION_BINDING');
  }

  const targetCandidate = existingReport.candidateTests?.find((c) => c.candidateId === candidateId);
  if (!targetCandidate) {
    throw new ApiError(404, 'Candidate test not found in report', 'CANDIDATE_NOT_FOUND');
  }

  // Idempotency Pre-Check
  if (targetCandidate.adoptionStatus === 'ADOPTED') {
    return {
      statusCode: 200,
      testCaseId: targetCandidate.adoptedTestCaseId,
      reportId,
      candidateId,
      adoptionStatus: 'ADOPTED',
      alreadyAdopted: true
    };
  }

  if (targetCandidate.adoptionStatus === 'REJECTED') {
    throw new ApiError(400, 'Candidate test has been rejected and is not eligible for adoption.', 'CANDIDATE_ALREADY_REJECTED');
  }

  // Verify associated target mutant eligibility
  const targetMutant = existingReport.mutants?.find((m) => m.mutantId === targetCandidate.mutantId);
  if (targetMutant && (targetMutant.equivalent === true || targetMutant.currentClassification === 'EQUIVALENT')) {
    throw new ApiError(400, 'Cannot adopt candidate test for a mutant classified as equivalent.', 'EQUIVALENT_MUTANT_CANNOT_BE_ADOPTED');
  }
  if (!targetMutant || !targetMutant.mutatedFullCode) {
    throw new ApiError(422, 'Target mutant code is unavailable for kill verification.', 'MUTANT_UNAVAILABLE_FOR_VERIFICATION');
  }

  // ─── STAGE 2: ATOMIC LEASE ACQUISITION (PRE-TRANSACTION) ───
  const lockToken = crypto.randomUUID();
  const operationId = crypto.randomUUID();
  const now = new Date();
  const leaseDurationMs = 30000;
  let currentLeaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  const leaseAcquired = await Question.findOneAndUpdate(
    {
      _id: questionId,
      $or: [{ adoptionLock: null }, { 'adoptionLock.expiresAt': { $lte: now } }]
    },
    {
      $set: {
        adoptionLock: {
          lockToken,
          operationId,
          reportId,
          candidateId,
          acquiredBy: user._id,
          acquiredAt: now,
          expiresAt: currentLeaseExpiresAt,
          lastHeartbeat: now
        }
      }
    },
    { new: true } // Does NOT bump Question.__v
  );

  if (!leaseAcquired) {
    throw new ApiError(409, 'Question is currently locked by another active adoption.', 'QUESTION_LOCKED_BY_ADOPTION');
  }

  // Dynamic Heartbeat Setup
  let isLeaseActive = true;
  let isHeartbeatBusy = false;
  let inFlightHeartbeatPromise = null;
  const abortController = new AbortController();

  const heartbeatInterval = setInterval(async () => {
    const loopNow = new Date();
    if (loopNow >= currentLeaseExpiresAt) {
      isLeaseActive = false;
      abortController.abort();
      clearInterval(heartbeatInterval);
      return;
    }
    if (isHeartbeatBusy) return;
    isHeartbeatBusy = true;
    inFlightHeartbeatPromise = (async () => {
      try {
        const renewalTime = new Date();
        const newExpiresAt = new Date(renewalTime.getTime() + leaseDurationMs);
        const res = await Question.updateOne(
          {
            _id: questionId,
            'adoptionLock.lockToken': lockToken,
            'adoptionLock.operationId': operationId,
            'adoptionLock.expiresAt': { $gt: renewalTime }
          },
          { $set: { 'adoptionLock.expiresAt': newExpiresAt, 'adoptionLock.lastHeartbeat': renewalTime } }
        );
        if (res.matchedCount === 0) {
          isLeaseActive = false;
          abortController.abort();
          clearInterval(heartbeatInterval);
        } else {
          currentLeaseExpiresAt = newExpiresAt;
        }
      } catch {
        isLeaseActive = false;
        abortController.abort();
        clearInterval(heartbeatInterval);
      } finally {
        isHeartbeatBusy = false;
      }
    })();
  }, 10000);

  let transactionCommitted = false;
  let transactionUnresolved = false;

  try {
    // Preserve inputs and outputs verbatim (No destructive line-ending mutation or trimming!)
    const effectiveInput = customInput !== undefined ? customInput : targetCandidate.input;
    const effectiveExpectedOutput = customExpectedOutput !== undefined ? customExpectedOutput : targetCandidate.expectedOutput;

    // Provenance Assertion: Candidate input cannot be modified during candidate adoption.
    // If a teacher provides custom input that differs from the mutation-generated candidate,
    // it cannot be adopted as that candidate (to prevent falsely representing a modified test as mutation-generated).
    if (customInput !== undefined && String(customInput) !== String(targetCandidate.input)) {
      throw new ApiError(400, 'Candidate input cannot be modified during candidate adoption. The candidate test must be adopted verbatim as generated to preserve mutation provenance.', 'CANDIDATE_INPUT_MODIFIED');
    }

    // ─── STAGE 3: DUAL CODE VERIFICATION ───
    // Phase A: Reference Solution Verification (Oracle Correctness)
    const refResult = await validateSingleTestCase({
      code: baseQuestion.referenceSolution,
      testCase: { input: effectiveInput, expectedOutput: effectiveExpectedOutput },
      questionContext: {
        language: baseQuestion.language,
        executionMode: baseQuestion.executionMode,
        functionName: baseQuestion.functionName,
        dataStructure: baseQuestion.dataStructure,
        returnType: baseQuestion.returnType
      },
      timeoutMs: 4000,
      signal: abortController.signal
    });

    if (refResult.status === 'internal_error' || refResult.status === 'infrastructure_timeout') {
      throw new ApiError(503, 'Sandbox infrastructure failure during reference solution verification.', 'REFERENCE_VERIFICATION_INCONCLUSIVE');
    }

    if (!refResult.passed) {
      throw new ApiError(400, `Candidate verification failed against reference solution: ${refResult.error || 'Output mismatch'}`, 'UNVERIFIED_CANDIDATE');
    }

    // Authoritative Expected Output:
    // Stored expectedOutput is strictly derived from the reference solution's actual execution output,
    // never trusting raw unverified client input.
    const authoritativeExpectedOutput = refResult.actualOutput !== null && refResult.actualOutput !== undefined
      ? String(refResult.actualOutput)
      : String(targetCandidate.expectedOutput);

    // Phase B: Target Mutant Kill Verification (Defect Detection)
    const mutantResult = await validateSingleTestCase({
      code: targetMutant.mutatedFullCode,
      testCase: { input: effectiveInput, expectedOutput: authoritativeExpectedOutput },
      questionContext: {
        language: baseQuestion.language,
        executionMode: baseQuestion.executionMode,
        functionName: baseQuestion.functionName,
        dataStructure: baseQuestion.dataStructure,
        returnType: baseQuestion.returnType
      },
      timeoutMs: 4000,
      signal: abortController.signal
    });

    // Evaluate strict mutant classification
    if (mutantResult.status === 'compilation_error' || mutantResult.status === 'compile_error') {
      throw new ApiError(422, 'Mutated code failed compilation (invalid mutant).', 'MUTANT_COMPILATION_ERROR');
    }
    if (mutantResult.status === 'internal_error' || mutantResult.status === 'infrastructure_timeout') {
      throw new ApiError(503, 'Sandbox infrastructure failure during mutant verification.', 'MUTANT_VERIFICATION_INCONCLUSIVE');
    }
    if (mutantResult.passed) {
      throw new ApiError(422, 'Candidate test does not kill the target mutant (mutant passed the test).', 'CANDIDATE_DOES_NOT_KILL_MUTANT');
    }
    // Confirmed KILLED: wrong_answer, runtime_error, or confirmed execution timeout

    // ─── STAGE 4: CLEAN HEARTBEAT HAND-OFF & GUARANTEED 10S HEADROOM ───
    clearInterval(heartbeatInterval);
    if (inFlightHeartbeatPromise) {
      await inFlightHeartbeatPromise;
    }

    const nowCheck = Date.now();
    const remainingHeadroomMs = currentLeaseExpiresAt.getTime() - nowCheck;
    if (remainingHeadroomMs < 10000) {
      // Synchronously extend the lease to full 30 seconds before transaction entry
      const extendTime = new Date();
      const newExpiresAt = new Date(extendTime.getTime() + 30000);
      const extendResult = await Question.updateOne(
        {
          _id: questionId,
          'adoptionLock.lockToken': lockToken,
          'adoptionLock.operationId': operationId,
          'adoptionLock.expiresAt': { $gt: extendTime }
        },
        { $set: { 'adoptionLock.expiresAt': newExpiresAt, 'adoptionLock.lastHeartbeat': extendTime } }
      );
      if (extendResult.matchedCount !== 1) {
        throw new ApiError(409, 'Failed to extend lease before transaction. Lease lost.', 'LEASE_LOST');
      }
      currentLeaseExpiresAt = newExpiresAt;
    }

    if (!isLeaseActive || Date.now() >= currentLeaseExpiresAt.getTime()) {
      throw new ApiError(409, 'Adoption lease expired before transaction entry.', 'LEASE_LOST');
    }

    // ─── STAGE 5: SHORT MULTI-DOCUMENT TRANSACTION (< 15ms) ───
    const session = await mongoose.startSession();
    session.startTransaction({ maxCommitTimeMS: 2000 });
    const txnStartTime = Date.now();

    try {
      // Step 5: Conditional Question Write Fence (Holds Document Write Lock on Question)
      const fenceFilter = {
        _id: questionId,
        'adoptionLock.lockToken': lockToken,
        'adoptionLock.operationId': operationId,
        'adoptionLock.expiresAt': { $gt: new Date() },
        __v: baseQuestion.__v
      };
      if (baseQuestion.executionFingerprint && existingReport.executionFingerprint) {
        fenceFilter.executionFingerprint = existingReport.executionFingerprint;
      }

      const fencedQuestion = await Question.findOneAndUpdate(
        fenceFilter,
        {
          $set: { 'adoptionLock.lastHeartbeat': new Date() },
          $inc: { __v: 1 } // Serializes concurrent updates
        },
        { session, new: true, maxTimeMS: 2000 }
      );

      if (!fencedQuestion) {
        throw new ApiError(409, 'Question write fence failed: concurrent edit or lease expired.', 'CONCURRENT_MODIFICATION');
      }

      // Step 6: Verbatim Content Deduplication Check
      const duplicateTest = await TestCase.findOne(
        { questionId, input: effectiveInput, expectedOutput: authoritativeExpectedOutput },
        null,
        { session, maxTimeMS: 2000 }
      );
      if (duplicateTest) {
        throw new ApiError(409, 'An identical test case already exists in the question suite.', 'DUPLICATE_TESTCASE');
      }

      // Step 7: Insert TestCase (Participates in Partial Unique Index)
      const [createdTestCase] = await TestCase.create(
        [
          {
            questionId,
            sourceReportId: reportId,
            sourceCandidateId: candidateId,
            input: effectiveInput,
            expectedOutput: authoritativeExpectedOutput,
            category,
            source: 'mutation_derived',
            verificationStatus: 'verified',
            visibility
          }
        ],
        { session }
      );

      // Step 8: Conditional MutationReport Update
      const reportUpdateResult = await MutationReport.updateOne(
        {
          _id: reportId,
          questionId: questionId,
          __v: existingReport.__v,
          'candidateTests.candidateId': candidateId,
          'candidateTests.adoptionStatus': 'PENDING'
        },
        {
          $set: {
            'candidateTests.$.adoptionStatus': 'ADOPTED',
            'candidateTests.$.adoptionOperationId': operationId,
            'candidateTests.$.adoptedTestCaseId': createdTestCase._id,
            'candidateTests.$.adoptedAt': new Date(),
            'candidateTests.$.adoptedBy': user._id,
            'candidateTests.$.verified': true
          },
          $inc: { __v: 1 }
        },
        { session }
      );

      if (reportUpdateResult.matchedCount !== 1 || (reportUpdateResult.modifiedCount !== undefined && reportUpdateResult.modifiedCount !== 1)) {
        throw new ApiError(409, 'MutationReport update failed: concurrent modification.', 'CONCURRENT_MODIFICATION');
      }

      // Step 9: In-Transaction Lease Release with matchedCount verification
      const releaseResult = await Question.updateOne(
        {
          _id: questionId,
          'adoptionLock.lockToken': lockToken,
          'adoptionLock.operationId': operationId
        },
        { $set: { adoptionLock: null } },
        { session }
      );

      if (releaseResult.matchedCount !== 1) {
        throw new ApiError(409, 'Failed to release adoption lease inside transaction.', 'LEASE_RELEASE_FAILED');
      }

      // Assert Transaction Execution Limit (< 3000ms) & Lease Validity
      if (Date.now() - txnStartTime > 3000 || Date.now() >= currentLeaseExpiresAt.getTime()) {
        throw new ApiError(409, 'Transaction duration exceeded permitted limit before commit.', 'TRANSACTION_TIMEOUT');
      }

      // Step 10: Commit Transaction with Protocol-Compliant Retry Loop
      let commitSuccess = false;
      let commitRetries = 0;
      while (!commitSuccess && commitRetries < 3) {
        try {
          commitRetries++;
          await session.commitTransaction();
          commitSuccess = true;
          transactionCommitted = true;
        } catch (commitErr) {
          if (!commitErr.hasErrorLabel?.('UnknownTransactionCommitResult')) {
            throw commitErr;
          }
          await new Promise((r) => setTimeout(r, 100 * commitRetries));
        }
      }

      if (!commitSuccess) {
        // Probe Database with Majority Read Concern
        const probeResult = await MutationReport.findOne(
          { _id: reportId, 'candidateTests.candidateId': candidateId },
          { 'candidateTests.$': 1 },
          { readConcern: { level: 'majority' } }
        );
        const probedCandidate = probeResult?.candidateTests?.[0];
        if (probedCandidate?.adoptionOperationId === operationId && probedCandidate?.adoptionStatus === 'ADOPTED') {
          transactionCommitted = true;
          return {
            statusCode: 201,
            testCase: createdTestCase,
            reportId,
            candidateId,
            adoptionStatus: 'ADOPTED',
            alreadyAdopted: false
          };
        } else {
          transactionUnresolved = true;
          throw new ApiError(503, 'Transaction commit status is unresolved. Please query adoption status.', 'UNRESOLVED_TRANSACTION_STATE');
        }
      }

      return {
        statusCode: 201,
        testCase: createdTestCase,
        reportId,
        candidateId,
        adoptionStatus: 'ADOPTED',
        alreadyAdopted: false
      };
    } catch (txnError) {
      if (!transactionCommitted && !transactionUnresolved) {
        try {
          await session.abortTransaction();
        } catch {
          // Abort errors suppressed on clean rollback
        }
      }
      throw txnError;
    } finally {
      await session.endSession();
    }
  } finally {
    clearInterval(heartbeatInterval);
    // Cleanup lease ONLY if not committed and not unresolved
    if (!transactionCommitted && !transactionUnresolved) {
      try {
        await Question.updateOne(
          { _id: questionId, 'adoptionLock.lockToken': lockToken, 'adoptionLock.operationId': operationId },
          { $set: { adoptionLock: null } }
        );
      } catch {
        // Suppress lease cleanup failure
      }
    }
  }
}

/**
 * Rejects an eligible mutation candidate test case with appropriate lifecycle metadata.
 */
export async function rejectCandidateTest({
  questionId,
  reportId,
  candidateId,
  user,
  rejectionReason,
  reason = ''
}) {
  const effectiveReason = (rejectionReason !== undefined ? rejectionReason : reason) || '';
  const trimmedReason = typeof effectiveReason === 'string' ? effectiveReason.trim() : '';

  if (!mongoose.Types.ObjectId.isValid(questionId)) {
    throw ApiError.badRequest('Invalid question ID format.');
  }
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw ApiError.badRequest('Invalid mutation report ID format.');
  }
  if (!candidateId || typeof candidateId !== 'string') {
    throw ApiError.badRequest('Candidate ID is required.');
  }
  if (!user || !user._id) {
    throw ApiError.unauthorized('Authentication required to reject candidate test cases.');
  }

  const baseQuestion = await Question.findById(questionId);
  if (!baseQuestion) {
    throw ApiError.notFound('Question not found');
  }

  const isOwner = baseQuestion.ownerId && baseQuestion.ownerId.toString() === user._id.toString();
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('You are not authorized to reject candidate tests for this question.');
  }

  const existingReport = await MutationReport.findById(reportId);
  if (!existingReport) {
    throw ApiError.notFound('Mutation report not found');
  }

  if (existingReport.questionId.toString() !== questionId.toString()) {
    throw new ApiError(400, 'MutationReport does not belong to the specified Question.', 'INVALID_REPORT_QUESTION_BINDING');
  }

  const targetCandidate = existingReport.candidateTests?.find((c) => c.candidateId === candidateId);
  if (!targetCandidate) {
    throw new ApiError(404, 'Candidate test not found in report', 'CANDIDATE_NOT_FOUND');
  }

  if (targetCandidate.adoptionStatus === 'REJECTED') {
    return {
      statusCode: 200,
      reportId,
      candidateId,
      adoptionStatus: 'REJECTED',
      rejectionReason: targetCandidate.rejectionReason || targetCandidate.reason || '',
      alreadyRejected: true
    };
  }

  if (targetCandidate.adoptionStatus === 'ADOPTED') {
    throw new ApiError(400, 'Candidate test has already been adopted and cannot be rejected.', 'CANDIDATE_ALREADY_ADOPTED');
  }

  const now = new Date();
  const updateFields = {
    'candidateTests.$.adoptionStatus': 'REJECTED',
    'candidateTests.$.rejectedAt': now,
    'candidateTests.$.rejectedBy': user._id
  };
  if (trimmedReason) {
    updateFields['candidateTests.$.rejectionReason'] = trimmedReason;
    updateFields['candidateTests.$.reason'] = trimmedReason;
  }

  const updateResult = await MutationReport.updateOne(
    {
      _id: reportId,
      questionId,
      'candidateTests.candidateId': candidateId,
      'candidateTests.adoptionStatus': 'PENDING'
    },
    {
      $set: updateFields,
      $inc: { __v: 1 }
    }
  );

  if (updateResult.matchedCount !== 1) {
    throw new ApiError(409, 'Failed to reject candidate test due to concurrent modification.', 'CONCURRENT_MODIFICATION');
  }

  return {
    statusCode: 200,
    reportId,
    candidateId,
    adoptionStatus: 'REJECTED',
    rejectionReason: trimmedReason,
    rejectedAt: now,
    alreadyRejected: false
  };
}

export default {
  adoptCandidateTest,
  rejectCandidateTest
};

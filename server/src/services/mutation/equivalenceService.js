import mongoose from 'mongoose';
import { MutationReport } from '../../models/MutationReport.js';
import { ApiError } from '../../utils/apiError.js';

export const RECOGNIZED_EXECUTION_STATUSES = Object.freeze([
  'PENDING',
  'KILLED',
  'SURVIVED',
  'EQUIVALENT',
  'COMPILATION_ERROR',
  'RUNTIME_ERROR',
  'TIMEOUT',
  'UNKNOWN_LEGACY'
]);

/**
 * Pure calculation of report counts and official mutation score from an array of mutants.
 * Follows Section 3 of Phase 4 specification:
 * - Denominator = killedCount + survivedCount (EQUIVALENT and errors excluded).
 * - If denominator is 0, mutationScore is null.
 * 
 * @param {Array} mutants 
 * @returns {Object}
 */
export function calculateReportMetrics(mutants = []) {
  let killedCount = 0;
  let survivedCount = 0;
  let equivalentCount = 0;
  let compilationErrorCount = 0;
  let runtimeErrorCount = 0;
  let timeoutCount = 0;

  for (const m of mutants) {
    const classification = m.currentClassification || (m.equivalent ? 'EQUIVALENT' : m.executionStatus);

    switch (classification) {
      case 'KILLED':
        killedCount++;
        break;
      case 'SURVIVED':
        survivedCount++;
        break;
      case 'EQUIVALENT':
        equivalentCount++;
        break;
      case 'COMPILATION_ERROR':
        compilationErrorCount++;
        break;
      case 'RUNTIME_ERROR':
        runtimeErrorCount++;
        break;
      case 'TIMEOUT':
        timeoutCount++;
        break;
      default:
        // PENDING or UNKNOWN_LEGACY do not contribute to score
        break;
    }
  }

  const eligibleCount = killedCount + survivedCount;
  const mutationScore = eligibleCount > 0
    ? Number(((killedCount / eligibleCount) * 100).toFixed(2))
    : null;

  return {
    totalMutants: mutants.length,
    killedCount,
    survivedCount,
    equivalentCount,
    compilationErrorCount,
    runtimeErrorCount,
    timeoutCount,
    mutationScore
  };
}

/**
 * Updates a mutant's equivalence classification with strict transition rules,
 * append-only audit history, and atomic optimistic concurrency control (OCC).
 * 
 * Allowed transitions:
 *  - SURVIVED -> EQUIVALENT
 *  - EQUIVALENT -> SURVIVED
 * 
 * All other transitions are rejected.
 * 
 * @param {Object} params
 * @param {string} params.reportId - MutationReport ID
 * @param {string} params.mutantId - Mutant identifier (e.g. 'm-js-ror-1')
 * @param {string} params.newClassification - 'EQUIVALENT' | 'SURVIVED'
 * @param {string} params.reason - Teacher justification (min 5 characters)
 * @param {Object} params.user - Authenticated teacher/admin user document
 * @param {number} [params.expectedVersion] - Expected __v for OCC
 * @returns {Promise<Object>}
 */
export async function updateMutantClassification({
  reportId,
  mutantId,
  newClassification,
  reason,
  user,
  expectedVersion
}) {
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw ApiError.notFound('Invalid mutation report ID');
  }

  if (!newClassification || (newClassification !== 'EQUIVALENT' && newClassification !== 'SURVIVED')) {
    throw new ApiError(
      400,
      "Invalid classification requested. Only 'EQUIVALENT' and 'SURVIVED' are permitted.",
      'INVALID_CLASSIFICATION'
    );
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new ApiError(
      400,
      'A meaningful reason of at least 5 characters is required for equivalence classification changes.',
      'INVALID_REASON'
    );
  }

  const report = await MutationReport.findById(reportId);
  if (!report) {
    throw ApiError.notFound('Mutation report not found');
  }

  // Authorization check: Teacher must own the report or be admin
  const isOwner = report.teacherId && user?._id && report.teacherId.toString() === user._id.toString();
  const isAdmin = user?.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw new ApiError(
      403,
      'You do not have permission to classify mutants for this mutation report.',
      'FORBIDDEN'
    );
  }

  const mutant = report.mutants.find((m) => m.mutantId === mutantId);
  if (!mutant) {
    throw ApiError.notFound(`Mutant with ID '${mutantId}' not found in this report.`);
  }

  // Resolve baseline status strictly without silent fallback to 'SURVIVED'
  const rawBaseline = mutant.baselineExecutionStatus || mutant.executionStatus;

  if (
    !rawBaseline ||
    typeof rawBaseline !== 'string' ||
    rawBaseline === 'UNKNOWN_LEGACY' ||
    !RECOGNIZED_EXECUTION_STATUSES.includes(rawBaseline)
  ) {
    throw new ApiError(
      400,
      `Cannot classify mutant: execution status is missing or unrecognized ('${rawBaseline}'). A verified execution status of SURVIVED is required.`,
      'INVALID_BASELINE_STATUS'
    );
  }

  const baselineStatus = rawBaseline;

  if (baselineStatus !== 'SURVIVED' && baselineStatus !== 'EQUIVALENT') {
    throw new ApiError(
      400,
      `Execution verdict tampering prohibited: mutant baseline status is '${baselineStatus}'. Only surviving mutants can be reviewed for equivalence.`,
      'INVALID_CLASSIFICATION_TRANSITION'
    );
  }

  // Current classification determination without silent fallback to 'SURVIVED'
  const rawClassification = mutant.currentClassification || (mutant.equivalent ? 'EQUIVALENT' : mutant.executionStatus);

  if (!rawClassification || typeof rawClassification !== 'string' || !RECOGNIZED_EXECUTION_STATUSES.includes(rawClassification)) {
    throw new ApiError(
      400,
      `Cannot classify mutant: current classification is missing or unrecognized ('${rawClassification}').`,
      'INVALID_BASELINE_STATUS'
    );
  }

  const currentClassification = rawClassification;

  if (currentClassification === newClassification) {
    throw new ApiError(
      400,
      `Mutant is already classified as '${newClassification}'.`,
      'NOOP_CLASSIFICATION_TRANSITION'
    );
  }

  // Allowed transitions: SURVIVED -> EQUIVALENT or EQUIVALENT -> SURVIVED
  const isSurvivedToEquivalent = currentClassification === 'SURVIVED' && newClassification === 'EQUIVALENT';
  const isEquivalentToSurvived = currentClassification === 'EQUIVALENT' && newClassification === 'SURVIVED';

  if (!isSurvivedToEquivalent && !isEquivalentToSurvived) {
    throw new ApiError(
      400,
      `Illegal transition from '${currentClassification}' to '${newClassification}'. Only SURVIVED <-> EQUIVALENT transitions are permitted.`,
      'INVALID_CLASSIFICATION_TRANSITION'
    );
  }

  // Derive new metrics purely from updated mutant state
  const projectedMutants = report.mutants.map((m) => {
    if (m.mutantId === mutantId) {
      return {
        ...m.toObject(),
        currentClassification: newClassification,
        equivalent: newClassification === 'EQUIVALENT'
      };
    }
    return m.toObject();
  });

  const updatedMetrics = calculateReportMetrics(projectedMutants);

  // Construct new append-only audit history entry
  const newAuditEntry = {
    auditId: new mongoose.Types.ObjectId().toString(),
    previousClassification: currentClassification,
    newClassification,
    teacherId: user._id,
    timestamp: new Date(),
    reason: reason.trim()
  };

  // OCC Version Assertion: use expectedVersion if passed by caller, else report.__v
  const versionFilter = expectedVersion !== undefined && expectedVersion !== null
    ? Number(expectedVersion)
    : (report.__v !== undefined ? report.__v : { $in: [0, null] });

  // For un-migrated documents, currentClassification might be null/missing in raw MongoDB
  const classificationFilter = currentClassification === 'SURVIVED'
    ? { $in: ['SURVIVED', null] }
    : currentClassification;

  const filter = {
    _id: reportId,
    __v: versionFilter,
    'mutants.mutantId': mutantId,
    'mutants.currentClassification': classificationFilter
  };

  const update = {
    $set: {
      'mutants.$.currentClassification': newClassification,
      'mutants.$.equivalent': newClassification === 'EQUIVALENT',
      mutationScore: updatedMetrics.mutationScore,
      killedCount: updatedMetrics.killedCount,
      survivedCount: updatedMetrics.survivedCount,
      equivalentCount: updatedMetrics.equivalentCount,
      compilationErrorCount: updatedMetrics.compilationErrorCount,
      runtimeErrorCount: updatedMetrics.runtimeErrorCount,
      timeoutCount: updatedMetrics.timeoutCount
    },
    $push: {
      'mutants.$.auditHistory': newAuditEntry
    },
    $inc: { __v: 1 }
  };

  const updatedReport = await MutationReport.findOneAndUpdate(filter, update, { new: true });

  if (!updatedReport) {
    throw new ApiError(
      409,
      'The mutation report was modified concurrently by another request. Please reload the latest report and retry.',
      'CONCURRENT_MODIFICATION'
    );
  }

  const updatedMutant = updatedReport.mutants.find((m) => m.mutantId === mutantId);

  return {
    reportId: updatedReport._id.toString(),
    mutantId,
    previousClassification: currentClassification,
    currentClassification: newClassification,
    mutationScore: updatedReport.mutationScore,
    metrics: {
      totalMutants: updatedReport.totalMutants,
      killedCount: updatedReport.killedCount,
      survivedCount: updatedReport.survivedCount,
      equivalentCount: updatedReport.equivalentCount,
      compilationErrorCount: updatedReport.compilationErrorCount,
      runtimeErrorCount: updatedReport.runtimeErrorCount,
      timeoutCount: updatedReport.timeoutCount
    },
    auditEntry: newAuditEntry,
    mutant: updatedMutant,
    version: updatedReport.__v
  };
}

export default {
  calculateReportMetrics,
  updateMutantClassification
};

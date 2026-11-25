import { api } from '../../lib/api';

/**
 * Mutation Lab Frontend API Service
 * Interacts with TestForge backend mutation execution routes.
 */

/**
 * Enqueue a new mutation testing run for a question.
 * @param {string} questionId
 * @param {Object} [options]
 * @returns {Promise<{ runId: string, status: string, progress: Object, createdAt: string, alreadyActive?: boolean }>}
 */
export const startMutationRun = async (questionId, options = {}) => {
  if (!questionId) {
    throw new Error('Question ID is required to start a mutation run');
  }

  try {
    const res = await api.post(`/questions/${questionId}/mutation-runs`, options);
    // Standard ApiResponse payload: res.data = { success: true, message: '...', data: { runId, ... } }
    return res.data?.data || res.data;
  } catch (err) {
    const status = err.response?.status;
    const msg =
      err.response?.data?.error?.message ||
      err.response?.data?.message ||
      err.customMessage ||
      err.message ||
      'Failed to start mutation run';

    const enrichedError = new Error(msg);
    enrichedError.status = status;
    enrichedError.code = err.response?.data?.error?.code || err.code || 'MUTATION_RUN_START_FAILED';
    enrichedError.details = err.response?.data?.error?.details || err.details;
    throw enrichedError;
  }
};

/**
 * Fetch a persistent MutationReport by ID.
 * @param {string} questionId
 * @param {string} runId
 * @returns {Promise<Object>} The MutationReport object
 */
export const getMutationReport = async (questionId, runId) => {
  if (!questionId || !runId) {
    throw new Error('Both questionId and runId are required to fetch a mutation report');
  }

  try {
    const res = await api.get(`/questions/${questionId}/mutation-runs/${runId}`);
    return res.data?.data || res.data;
  } catch (err) {
    const status = err.response?.status;
    const msg =
      err.response?.data?.error?.message ||
      err.response?.data?.message ||
      err.customMessage ||
      err.message ||
      'Failed to fetch mutation report';

    const enrichedError = new Error(msg);
    enrichedError.status = status;
    enrichedError.code = err.response?.data?.error?.code || err.code || 'MUTATION_REPORT_FETCH_FAILED';
    enrichedError.details = err.response?.data?.error?.details || err.details;
    throw enrichedError;
  }
};

/**
 * Classify a mutant as EQUIVALENT or revert it to SURVIVED.
 * @param {string} questionId
 * @param {string} runId
 * @param {string} mutantId
 * @param {Object} payload
 * @param {string} payload.newClassification - 'EQUIVALENT' | 'SURVIVED'
 * @param {string} payload.reason - Teacher justification (min 5 chars)
 * @param {number} [payload.expectedVersion] - OCC expected version
 * @returns {Promise<Object>}
 */
export const classifyMutant = async (questionId, runId, mutantId, payload = {}) => {
  if (!questionId || !runId || !mutantId) {
    throw new Error('questionId, runId, and mutantId are required to classify a mutant');
  }

  try {
    const res = await api.patch(
      `/questions/${questionId}/mutation-runs/${runId}/mutants/${mutantId}/classification`,
      payload
    );
    return res.data?.data || res.data;
  } catch (err) {
    const status = err.response?.status;
    const msg =
      err.response?.data?.error?.message ||
      err.response?.data?.message ||
      err.message ||
      'Failed to update mutant classification';

    const enrichedError = new Error(msg);
    enrichedError.status = status;
    enrichedError.code = err.response?.data?.error?.code || err.code || 'CLASSIFICATION_UPDATE_FAILED';
    enrichedError.details = err.response?.data?.error?.details || err.details;
    throw enrichedError;
  }
};

/**
 * Adopt a mutation-generated candidate test into the Question's TestCase collection.
 * Uses POST /questions/:id/mutation-runs/:runId/candidates/:candidateId/adopt
 * @param {string} questionId
 * @param {string} runId
 * @param {string} candidateId
 * @param {Object} [options]
 * @param {string} [options.category='edge_case']
 * @param {string} [options.visibility='hidden']
 * @returns {Promise<Object>}
 */
export const adoptCandidateTest = async (questionId, runId, candidateId, options = {}) => {
  if (!questionId || !runId || !candidateId) {
    throw new Error('questionId, runId, and candidateId are required to adopt a candidate test');
  }

  // IMPORTANT: Do NOT send custom input or expectedOutput overrides - provenance must be preserved!
  const payload = {
    category: options.category || 'edge_case',
    visibility: options.visibility || 'hidden'
  };

  try {
    const res = await api.post(
      `/questions/${questionId}/mutation-runs/${runId}/candidates/${candidateId}/adopt`,
      payload
    );
    return res.data?.data || res.data;
  } catch (err) {
    const status = err.response?.status;
    const errorCode = err.response?.data?.error?.code || err.code || 'ADOPTION_FAILED';
    const serverMsg = err.response?.data?.error?.message || err.response?.data?.message || err.message;

    let userMsg = serverMsg;
    if (status === 409) {
      if (errorCode === 'QUESTION_LOCKED_BY_ADOPTION') {
        userMsg = 'Another adoption operation is currently in progress for this question. Please wait a few seconds and retry.';
      } else if (errorCode === 'DUPLICATE_TESTCASE') {
        userMsg = 'An identical test case already exists in the question test suite.';
      } else if (errorCode === 'CONCURRENT_MODIFICATION') {
        userMsg = 'The question was modified concurrently. Please refresh the mutation report before adopting.';
      }
    } else if (status === 422) {
      if (errorCode === 'CANDIDATE_DOES_NOT_KILL_MUTANT') {
        userMsg = 'Verification failed: Candidate test does not kill the target mutant (mutant survived the test).';
      } else if (errorCode === 'MUTANT_COMPILATION_ERROR') {
        userMsg = 'Verification failed: The target mutant has compilation errors.';
      }
    } else if (status === 503) {
      userMsg = 'Sandbox execution infrastructure is temporarily unavailable. Please retry shortly.';
    } else if (status === 400 && errorCode === 'EQUIVALENT_MUTANT_CANNOT_BE_ADOPTED') {
      userMsg = 'Cannot adopt candidate test: The target mutant has been classified as equivalent.';
    }

    const enrichedError = new Error(userMsg);
    enrichedError.status = status;
    enrichedError.code = errorCode;
    enrichedError.details = err.response?.data?.error?.details || err.details;
    throw enrichedError;
  }
};

/**
 * Reject an eligible mutation-generated candidate test.
 * Uses POST /questions/:id/mutation-runs/:runId/candidates/:candidateId/reject
 * @param {string} questionId
 * @param {string} runId
 * @param {string} candidateId
 * @param {Object} [options]
 * @param {string} [options.rejectionReason] - Reason for rejecting candidate test case
 * @param {string} [options.reason] - Backwards compatibility alias for rejectionReason
 * @returns {Promise<Object>}
 */
export const rejectCandidateTest = async (questionId, runId, candidateId, options = {}) => {
  if (!questionId || !runId || !candidateId) {
    throw new Error('questionId, runId, and candidateId are required to reject a candidate test');
  }

  const effectiveReason = options.rejectionReason !== undefined ? options.rejectionReason : (options.reason || '');

  const payload = {
    rejectionReason: effectiveReason
  };

  try {
    const res = await api.post(
      `/questions/${questionId}/mutation-runs/${runId}/candidates/${candidateId}/reject`,
      payload
    );
    return res.data?.data || res.data;
  } catch (err) {
    const status = err.response?.status;
    const errorCode = err.response?.data?.error?.code || err.code || 'REJECTION_FAILED';
    const serverMsg = err.response?.data?.error?.message || err.response?.data?.message || err.message;

    const enrichedError = new Error(serverMsg);
    enrichedError.status = status;
    enrichedError.code = errorCode;
    throw enrichedError;
  }
};

/**
 * Request AI to generate killer test cases specifically crafted to kill surviving mutants.
 * @param {string} questionId
 * @param {Object} options
 * @returns {Promise<{ candidates: Array, totalGenerated: number, acceptedCount: number }>}
 */
export const generateAiKillerTests = async (questionId, options = {}) => {
  if (!questionId) throw new Error('Question ID is required');
  try {
    const res = await api.post(`/questions/${questionId}/ai-generate-tests`, {
      count: options.count || 5,
      category: options.category || 'boundary',
      instructions: options.instructions || 'Synthesize boundary/edge-case tests to kill surviving mutants',
      visibility: options.visibility || 'hidden'
    });
    return res.data?.data || res.data;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    throw new Error(msg || 'Failed to generate killer tests with AI');
  }
};

/**
 * Batch save test cases to the question, with optional replacement of existing test cases.
 * @param {string} questionId
 * @param {Array} testCases
 * @param {boolean} [replaceExisting=false]
 * @returns {Promise<Array>}
 */
export const batchSaveTestCases = async (questionId, testCases = [], replaceExisting = false) => {
  if (!questionId) throw new Error('Question ID is required');
  try {
    const res = await api.post(`/questions/${questionId}/tests/batch`, {
      testCases,
      replaceExisting: Boolean(replaceExisting)
    });
    return res.data?.data || res.data;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    throw new Error(msg || 'Failed to save test cases');
  }
};

export default {
  startMutationRun,
  getMutationReport,
  classifyMutant,
  adoptCandidateTest,
  rejectCandidateTest,
  generateAiKillerTests,
  batchSaveTestCases
};

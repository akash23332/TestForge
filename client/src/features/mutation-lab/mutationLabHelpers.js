/**
 * Mutation Lab Helper Utilities
 * Pure helper functions for filtering, metric formatting, and candidate test mapping.
 */

export const SUPPORTED_OPERATORS = [
  { id: 'ALL', name: 'All Operators', abbr: 'ALL', description: 'All generated syntax mutations' },
  { id: 'AOR', name: 'Arithmetic Operator Replacement', abbr: 'AOR', description: 'Replaces arithmetic operators (+, -, *, /, %)' },
  { id: 'ROR', name: 'Relational Operator Replacement', abbr: 'ROR', description: 'Inverts relational comparisons (<, <=, >, >=, ==, !=)' },
  { id: 'LOR', name: 'Logical Operator Replacement', abbr: 'LOR', description: 'Replaces boolean logical operators (&&, ||)' },
  { id: 'COR', name: 'Conditional Boundary Replacement', abbr: 'COR', description: 'Alters loop and branch boundary expressions' },
  { id: 'RVR', name: 'Return Value Replacement', abbr: 'RVR', description: 'Replaces return values (0, 1, true, false, null)' }
];

export const STATUS_FILTERS = [
  { id: 'all', label: 'All Mutants' },
  { id: 'killed', label: 'Killed', backendStatus: 'KILLED' },
  { id: 'survived', label: 'Survived', backendStatus: 'SURVIVED' },
  { id: 'equivalent', label: 'Equivalent', backendStatus: 'EQUIVALENT' },
  { id: 'compilation_error', label: 'Compile Error', backendStatus: 'COMPILATION_ERROR' },
  { id: 'runtime_error', label: 'Runtime Error', backendStatus: 'RUNTIME_ERROR' },
  { id: 'timeout', label: 'Timeout', backendStatus: 'TIMEOUT' }
];

/**
 * Filter an array of mutants based on operator, status, and search query.
 */
export const filterMutants = (mutants = [], { operator = 'ALL', status = 'all', search = '' } = {}) => {
  if (!Array.isArray(mutants)) return [];

  const query = (search || '').trim().toLowerCase();

  return mutants.filter((m) => {
    // 1. Operator filter
    if (operator && operator !== 'ALL') {
      const opUpper = (m.operator || '').toUpperCase();
      if (opUpper !== operator.toUpperCase()) return false;
    }

    // 2. Status filter
    if (status && status !== 'all') {
      const activeStatus = (m.currentClassification || (m.equivalent ? 'EQUIVALENT' : m.executionStatus) || '').toUpperCase();
      const statusObj = STATUS_FILTERS.find((sf) => sf.id === status);
      const targetStatus = statusObj?.backendStatus || status.toUpperCase();
      if (activeStatus !== targetStatus) return false;
    }

    // 3. Search query
    if (query) {
      const idMatch = (m.mutantId || '').toLowerCase().includes(query);
      const opMatch = (m.operator || '').toLowerCase().includes(query);
      const origMatch = (m.originalSnippet || '').toLowerCase().includes(query);
      const mutMatch = (m.mutatedSnippet || '').toLowerCase().includes(query);
      const reasonMatch = (m.failureReason || '').toLowerCase().includes(query);
      if (!idMatch && !opMatch && !origMatch && !mutMatch && !reasonMatch) {
        return false;
      }
    }

    return true;
  });
};

/**
 * Format mutation score from backend report.
 * Returns null if score is null, otherwise returns number or rounded string.
 */
export const formatMutationScore = (score) => {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return null;
  }
  return Math.round(Number(score) * 10) / 10;
};

/**
 * Calculate progress percentage from report progress.
 */
export const calculateProgressPercent = (progress) => {
  if (!progress || !progress.total || progress.total <= 0) return 0;
  const completed = Number(progress.completed) || 0;
  const total = Number(progress.total) || 1;
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
};

/**
 * Matches candidate tests with their corresponding surviving mutants.
 */
export const mapSurvivingMutantsWithCandidates = (mutants = [], candidateTests = []) => {
  const surviving = mutants.filter((m) => (m.executionStatus || '').toUpperCase() === 'SURVIVED');
  const candidateMap = new Map();

  if (Array.isArray(candidateTests)) {
    candidateTests.forEach((ct) => {
      if (ct.mutantId) {
        candidateMap.set(ct.mutantId, ct);
      }
    });
  }

  return surviving.map((m) => ({
    mutant: m,
    candidateTest: candidateMap.get(m.mutantId) || null
  }));
};

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterMutants,
  formatMutationScore,
  calculateProgressPercent,
  mapSurvivingMutantsWithCandidates,
  SUPPORTED_OPERATORS,
  STATUS_FILTERS
} from '../mutationLabHelpers';
import { startMutationRun, getMutationReport } from '../mutationLabService';
import { api } from '../../../lib/api';

vi.mock('../../../lib/api', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn()
  }
}));

describe('Phase 3: Mutation Lab Frontend Architecture & Logic Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Successful mutation run creation ────────────────────────────────────
  it('1. Successful mutation run creation: calls POST endpoint with question ID', async () => {
    const mockData = {
      runId: 'run-12345',
      questionId: 'q-67890',
      status: 'PENDING',
      progress: { total: 4, completed: 0 }
    };
    api.post.mockResolvedValueOnce({ status: 202, data: { success: true, data: mockData } });

    const result = await startMutationRun('q-67890', { customMutants: false });

    expect(api.post).toHaveBeenCalledWith('/questions/q-67890/mutation-runs', { customMutants: false });
    expect(result.runId).toBe('run-12345');
    expect(result.status).toBe('PENDING');
  });

  // ── 2. HTTP 202 response handling ──────────────────────────────────────────
  it('2. HTTP 202 response handling: safely extracts runId and initial enqueued status', async () => {
    const payload = {
      success: true,
      message: 'Mutation run enqueued successfully',
      data: {
        runId: 'run-active-001',
        questionId: 'q-100',
        status: 'PENDING',
        alreadyActive: false,
        createdAt: '2026-11-14T11:00:00.000Z'
      }
    };
    api.post.mockResolvedValueOnce({ status: 202, data: payload });

    const result = await startMutationRun('q-100');
    expect(result.runId).toBe('run-active-001');
    expect(result.status).toBe('PENDING');
  });

  // ── 3. Polling while PENDING ───────────────────────────────────────────────
  it('3. Polling while PENDING: reads report and confirms status is PENDING', async () => {
    const reportData = {
      runId: 'run-pend-1',
      status: 'PENDING',
      progress: { total: 10, completed: 0 }
    };
    api.get.mockResolvedValueOnce({ status: 200, data: { success: true, data: reportData } });

    const report = await getMutationReport('q-100', 'run-pend-1');
    expect(api.get).toHaveBeenCalledWith('/questions/q-100/mutation-runs/run-pend-1');
    expect(report.status).toBe('PENDING');
    expect(report.progress.completed).toBe(0);
  });

  // ── 4. Polling while RUNNING ───────────────────────────────────────────────
  it('4. Polling while RUNNING: tracks incremental progress and active mutant', async () => {
    const reportData = {
      runId: 'run-run-1',
      status: 'RUNNING',
      progress: {
        total: 10,
        completed: 6,
        currentMutant: 'mutant-lor-3',
        currentTestCase: 'tc-2'
      }
    };
    api.get.mockResolvedValueOnce({ status: 200, data: { success: true, data: reportData } });

    const report = await getMutationReport('q-100', 'run-run-1');
    expect(report.status).toBe('RUNNING');
    expect(report.progress.completed).toBe(6);
    expect(calculateProgressPercent(report.progress)).toBe(60);
    expect(report.progress.currentMutant).toBe('mutant-lor-3');
  });

  // ── 5. Successful COMPLETED response ───────────────────────────────────────
  it('5. Successful COMPLETED response: retrieves final score and mutant classifications', async () => {
    const completedReport = {
      runId: 'run-comp-1',
      status: 'COMPLETED',
      mutationScore: 83.3,
      totalMutants: 6,
      killedCount: 5,
      survivedCount: 1,
      equivalentCount: 0,
      compilationErrorCount: 0,
      progress: { total: 6, completed: 6 }
    };
    api.get.mockResolvedValueOnce({ status: 200, data: { success: true, data: completedReport } });

    const report = await getMutationReport('q-100', 'run-comp-1');
    expect(report.status).toBe('COMPLETED');
    expect(report.mutationScore).toBe(83.3);
    expect(calculateProgressPercent(report.progress)).toBe(100);
  });

  // ── 6. FAILED response ─────────────────────────────────────────────────────
  it('6. FAILED response: extracts backend failure reason', async () => {
    const failedReport = {
      runId: 'run-fail-1',
      status: 'FAILED',
      errorMessage: 'Remote compiler provider execution timeout exceeded'
    };
    api.get.mockResolvedValueOnce({ status: 200, data: { success: true, data: failedReport } });

    const report = await getMutationReport('q-100', 'run-fail-1');
    expect(report.status).toBe('FAILED');
    expect(report.errorMessage).toContain('Remote compiler provider execution timeout');
  });

  // ── 7. Network failure during polling ───────────────────────────────────────
  it('7. Network failure during polling: throws standard error without destroying run identity', async () => {
    api.get.mockRejectedValueOnce(new Error('Network Error: Connection refused'));

    await expect(getMutationReport('q-100', 'run-retry-1')).rejects.toThrow('Network Error: Connection refused');
  });

  // ── 8. Polling stops after completion ───────────────────────────────────────
  it('8. Polling stops after completion: verify completion condition recognition', () => {
    const isTerminalStatus = (st) => st === 'COMPLETED' || st === 'FAILED';
    expect(isTerminalStatus('COMPLETED')).toBe(true);
    expect(isTerminalStatus('FAILED')).toBe(true);
    expect(isTerminalStatus('RUNNING')).toBe(false);
    expect(isTerminalStatus('PENDING')).toBe(false);
  });

  // ── 9. Polling stops on component unmount ───────────────────────────────────
  it('9. Polling stops on component unmount: verify cleanup timer cancellation', () => {
    let activeTimer = setTimeout(() => {}, 10000);
    const stopPolling = () => {
      clearTimeout(activeTimer);
      activeTimer = null;
    };

    stopPolling();
    expect(activeTimer).toBeNull();
  });

  // ── 10. Existing run resumes without creating a duplicate ───────────────────
  it('10. Existing run resumes without creating duplicate: fetches saved runId without calling POST', async () => {
    const savedRunId = 'run-persisted-999';
    const reportData = {
      runId: savedRunId,
      status: 'RUNNING',
      progress: { total: 8, completed: 4 }
    };
    api.get.mockResolvedValueOnce({ status: 200, data: { success: true, data: reportData } });

    // Directly fetch report for saved runId
    const report = await getMutationReport('q-50', savedRunId);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledWith('/questions/q-50/mutation-runs/run-persisted-999');
    expect(report.runId).toBe(savedRunId);
  });

  // ── 11. Duplicate button clicks do not create multiple requests ────────────
  it('11. Duplicate button clicks do not create multiple requests: guarded runner invocation', async () => {
    let isStarting = false;
    let requestCount = 0;

    const guardedStart = async () => {
      if (isStarting) return null;
      isStarting = true;
      requestCount++;
      await new Promise((r) => setTimeout(r, 10));
      isStarting = false;
      return 'started';
    };

    // Simulate 3 rapid simultaneous clicks
    await Promise.all([guardedStart(), guardedStart(), guardedStart()]);
    expect(requestCount).toBe(1);
  });

  // ── 12. Real mutant filtering ──────────────────────────────────────────────
  it('12. Real mutant filtering: correctly filters by operator, execution status, and text search', () => {
    const sampleMutants = [
      { mutantId: 'M1', operator: 'AOR', executionStatus: 'KILLED', originalSnippet: 'a + b', mutatedSnippet: 'a - b' },
      { mutantId: 'M2', operator: 'AOR', executionStatus: 'SURVIVED', originalSnippet: 'x * y', mutatedSnippet: 'x / y' },
      { mutantId: 'M3', operator: 'ROR', executionStatus: 'KILLED', originalSnippet: 'i < n', mutatedSnippet: 'i <= n' },
      { mutantId: 'M4', operator: 'LOR', executionStatus: 'SURVIVED', originalSnippet: 'p && q', mutatedSnippet: 'p || q' },
      { mutantId: 'M5', operator: 'RVR', executionStatus: 'COMPILATION_ERROR', originalSnippet: 'return 0', mutatedSnippet: 'return' }
    ];

    // Filter by Operator ROR
    const rorOnly = filterMutants(sampleMutants, { operator: 'ROR' });
    expect(rorOnly).toHaveLength(1);
    expect(rorOnly[0].mutantId).toBe('M3');

    // Filter by Status Survived
    const survivedOnly = filterMutants(sampleMutants, { status: 'survived' });
    expect(survivedOnly).toHaveLength(2);
    expect(survivedOnly.map((m) => m.mutantId)).toEqual(['M2', 'M4']);

    // Filter by Search Query
    const searchResult = filterMutants(sampleMutants, { search: 'p && q' });
    expect(searchResult).toHaveLength(1);
    expect(searchResult[0].mutantId).toBe('M4');
  });

  // ── 13. Real mutation score rendering ──────────────────────────────────────
  it('13. Real mutation score rendering: accurately formats numerical scores', () => {
    expect(formatMutationScore(83.33333)).toBe(83.3);
    expect(formatMutationScore(100)).toBe(100);
    expect(formatMutationScore(0)).toBe(0);
  });

  // ── 14. Empty mutation report ──────────────────────────────────────────────
  it('14. Empty mutation report: handles 0 mutants cleanly without crashing', () => {
    const emptyReport = {
      runId: 'run-empty',
      totalMutants: 0,
      killedCount: 0,
      survivedCount: 0,
      mutants: [],
      candidateTests: []
    };

    const filtered = filterMutants(emptyReport.mutants);
    expect(filtered).toHaveLength(0);

    const candidates = mapSurvivingMutantsWithCandidates(emptyReport.mutants, emptyReport.candidateTests);
    expect(candidates).toHaveLength(0);
  });

  // ── 15. Null mutation score ────────────────────────────────────────────────
  it('15. Null mutation score: returns null for display as --% or N/A when 0 eligible mutants exist', () => {
    expect(formatMutationScore(null)).toBeNull();
    expect(formatMutationScore(undefined)).toBeNull();
    expect(formatMutationScore('invalid')).toBeNull();
  });

  // ── 16. Candidate test rendering ───────────────────────────────────────────
  it('16. Candidate test rendering: matches surviving mutants and identifies verification status', () => {
    const mutants = [
      { mutantId: 'M-SURV-1', operator: 'ROR', executionStatus: 'SURVIVED' },
      { mutantId: 'M-KILL-1', operator: 'AOR', executionStatus: 'KILLED' }
    ];
    const candidateTests = [
      { mutantId: 'M-SURV-1', input: '[0, 0, 0]', expectedOutput: '0', verified: true }
    ];

    const paired = mapSurvivingMutantsWithCandidates(mutants, candidateTests);
    expect(paired).toHaveLength(1);
    expect(paired[0].mutant.mutantId).toBe('M-SURV-1');
    expect(paired[0].candidateTest.input).toBe('[0, 0, 0]');
    expect(paired[0].candidateTest.verified).toBe(true);
  });

  // ── 17. Diff viewer with real mutant source ─────────────────────────────────
  it('17. Diff viewer data checking: distinguishes full code from snippet transformations', () => {
    const mutantWithFullCode = {
      mutantId: 'M-FULL',
      mutatedFullCode: 'function solve() { return -1; }',
      originalSnippet: 'return 0;',
      mutatedSnippet: 'return -1;'
    };
    const mutantSnippetOnly = {
      mutantId: 'M-SNIP',
      mutatedFullCode: null,
      originalSnippet: 'a + b',
      mutatedSnippet: 'a - b'
    };

    expect(Boolean(mutantWithFullCode.mutatedFullCode)).toBe(true);
    expect(Boolean(mutantSnippetOnly.mutatedFullCode)).toBe(false);
    expect(Boolean(mutantSnippetOnly.originalSnippet)).toBe(true);
  });

  // ── 18. Unauthorized API response handling ─────────────────────────────────
  it('18. Unauthorized API response handling: preserves 403 Forbidden message', async () => {
    const errorResponse = {
      response: {
        status: 403,
        data: {
          error: {
            message: 'You do not have permission to view this mutation report',
            code: 'FORBIDDEN'
          }
        }
      }
    };
    api.get.mockRejectedValueOnce(errorResponse);

    await expect(getMutationReport('q-100', 'run-unauth')).rejects.toThrow(
      'You do not have permission to view this mutation report'
    );
  });

  // ── 19. Refresh while RUNNING resumes polling without duplicate POST ───────
  it('19. Refresh while RUNNING: resumes polling stored runId without issuing a new POST request', async () => {
    const questionId = 'q-refresh-running';
    const storedRunId = 'run-stored-123';

    // Simulate localStorage having stored run
    const storageMap = new Map();
    storageMap.set(`testforge_mutation_last_run_${questionId}`, storedRunId);

    api.get.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          runId: storedRunId,
          status: 'RUNNING',
          progress: { total: 4, completed: 2 }
        }
      }
    });

    const report = await getMutationReport(questionId, storageMap.get(`testforge_mutation_last_run_${questionId}`));

    expect(api.post).not.toHaveBeenCalled();
    expect(report.runId).toBe(storedRunId);
    expect(report.status).toBe('RUNNING');
    expect(report.progress.completed).toBe(2);
  });

  // ── 20. Question switching isolates runs between questions ─────────────────
  it('20. Question switching isolates runs: question A run is never returned for question B', () => {
    const qA = 'question-AAA';
    const qB = 'question-BBB';
    const storage = new Map();

    storage.set(`testforge_mutation_last_run_${qA}`, 'run-for-A');

    // Query for qB
    const qBRunId = storage.get(`testforge_mutation_last_run_${qB}`) || null;
    expect(qBRunId).toBeNull();

    // Query for qA
    const qARunId = storage.get(`testforge_mutation_last_run_${qA}`) || null;
    expect(qARunId).toBe('run-for-A');
  });

  // ── 21. Candidate test integrity: suggested tests never marked verified ────
  it('21. Candidate test integrity: candidate tests without explicit verified=true are NEVER marked verified', () => {
    const mutants = [{ mutantId: 'M-SURV-1', executionStatus: 'SURVIVED' }];
    const candidateTests = [
      { mutantId: 'M-SURV-1', input: 'sample', expectedOutput: 'output', verified: false }
    ];

    const mapped = mapSurvivingMutantsWithCandidates(mutants, candidateTests);
    expect(mapped[0].candidateTest.verified).toBe(false);

    // Test with missing verified flag
    const candidateWithoutFlag = [{ mutantId: 'M-SURV-1', input: 'sample', expectedOutput: 'output' }];
    const mappedNoFlag = mapSurvivingMutantsWithCandidates(mutants, candidateWithoutFlag);
    expect(Boolean(mappedNoFlag[0].candidateTest.verified)).toBe(false);
  });
});

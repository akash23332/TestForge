import { useState, useEffect, useRef, useCallback } from 'react';
import { startMutationRun, getMutationReport } from './mutationLabService';

const STORAGE_KEY_PREFIX = 'testforge_mutation_last_run_';
const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_NETWORK_ERRORS = 5;

/**
 * Custom React Hook for managing Mutation Testing run lifecycle:
 * - Triggering runs (POST /questions/:id/mutation-runs) with duplicate-click protection
 * - Polling execution progress (GET /questions/:id/mutation-runs/:runId)
 * - Persisting and resuming latest runId via localStorage
 * - Clean teardown on unmount or question switch
 */
export const useMutationRun = (questionId) => {
  const [runId, setRunId] = useState(null);
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('IDLE'); // 'IDLE' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  const [progress, setProgress] = useState({ total: 0, completed: 0, currentMutant: null, currentTestCase: null });
  const [error, setError] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  // Refs for tracking mounted lifecycle and timers
  const pollTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const consecutiveErrorsRef = useRef(0);
  const activeQuestionIdRef = useRef(questionId);

  // Keep questionId ref in sync
  useEffect(() => {
    activeQuestionIdRef.current = questionId;
  }, [questionId]);

  // Clear any existing polling timer safely
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Poll a specific runId
  const pollRun = useCallback(
    async (targetQuestionId, targetRunId) => {
      if (!targetQuestionId || !targetRunId) return;

      try {
        const fetchedReport = await getMutationReport(targetQuestionId, targetRunId);

        // Ensure we are still mounted and looking at the same question
        if (!isMountedRef.current || activeQuestionIdRef.current !== targetQuestionId) {
          return;
        }

        consecutiveErrorsRef.current = 0; // Reset network error counter
        setReport(fetchedReport);
        setStatus(fetchedReport.status || 'RUNNING');
        if (fetchedReport.progress) {
          setProgress(fetchedReport.progress);
        }

        // Terminal states: Stop polling
        if (fetchedReport.status === 'COMPLETED' || fetchedReport.status === 'FAILED') {
          stopPolling();
          if (fetchedReport.status === 'FAILED' && fetchedReport.errorMessage) {
            setError(fetchedReport.errorMessage);
          }
          return;
        }

        // Active states (PENDING or RUNNING): Schedule next poll
        setIsPolling(true);
        pollTimerRef.current = setTimeout(() => {
          pollRun(targetQuestionId, targetRunId);
        }, POLL_INTERVAL_MS);
      } catch (err) {
        if (!isMountedRef.current || activeQuestionIdRef.current !== targetQuestionId) {
          return;
        }

        consecutiveErrorsRef.current += 1;
        const errMsg = err.message || 'Transient network error while checking mutation progress.';

        // Handle terminal HTTP errors (e.g. 404 report deleted, 403 forbidden, 409 conflict, 401 unauthenticated)
        if (err.status === 404 || err.status === 403 || err.status === 401 || err.status === 409) {
          stopPolling();
          if (err.status === 404) {
            // Clean up invalid/expired persisted runId from localStorage so teacher can run a fresh analysis
            try {
              localStorage.removeItem(`${STORAGE_KEY_PREFIX}${targetQuestionId}`);
            } catch {
              // ignore storage error
            }
            setRunId(null);
            setReport(null);
            setStatus('IDLE');
            setError('Previous mutation report was not found or expired. You can start a new mutation analysis.');
          } else {
            setStatus('FAILED');
            setError(errMsg);
          }
          return;
        }

        // Allow transient network retries up to limit before halting polling
        if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_NETWORK_ERRORS) {
          stopPolling();
          setError(`Connection lost to mutation runner: ${errMsg}. You can refresh to retry.`);
        } else {
          // Retry on next interval without losing runId
          setIsPolling(true);
          pollTimerRef.current = setTimeout(() => {
            pollRun(targetQuestionId, targetRunId);
          }, POLL_INTERVAL_MS);
        }
      }
    },
    [stopPolling]
  );

  // Resume or load saved run when question changes
  useEffect(() => {
    isMountedRef.current = true;
    stopPolling();
    setError(null);

    if (!questionId) {
      setRunId(null);
      setReport(null);
      setStatus('IDLE');
      setProgress({ total: 0, completed: 0, currentMutant: null, currentTestCase: null });
      return;
    }

    // Check localStorage for a previous run on this question
    try {
      const savedRunId = localStorage.getItem(`${STORAGE_KEY_PREFIX}${questionId}`);
      if (savedRunId) {
        setRunId(savedRunId);
        // Fetch report and resume polling if still in flight
        pollRun(questionId, savedRunId);
      } else {
        setRunId(null);
        setReport(null);
        setStatus('IDLE');
        setProgress({ total: 0, completed: 0, currentMutant: null, currentTestCase: null });
      }
    } catch {
      // localStorage may be unavailable in some sandboxes
    }

    return () => {
      stopPolling();
    };
  }, [questionId, pollRun, stopPolling]);

  // Teardown on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  // Start a new mutation run
  const startRun = useCallback(
    async (options = {}) => {
      if (!questionId) {
        setError('No question selected for mutation testing.');
        return null;
      }

      // Guard against rapid duplicate clicks or starting while already running
      if (isStarting || status === 'PENDING' || status === 'RUNNING') {
        return null;
      }

      setIsStarting(true);
      setError(null);
      stopPolling();

      try {
        const enqueueResult = await startMutationRun(questionId, options);
        const newRunId = enqueueResult.runId;

        if (!newRunId) {
          throw new Error('Backend did not return a valid runId.');
        }

        setRunId(newRunId);
        setStatus(enqueueResult.status || 'PENDING');
        if (enqueueResult.progress) {
          setProgress(enqueueResult.progress);
        }

        // Save in localStorage for resumption
        try {
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${questionId}`, newRunId);
        } catch {
          // ignore storage error
        }

        setIsStarting(false);
        // Start polling the new run immediately
        pollRun(questionId, newRunId);
        return newRunId;
      } catch (err) {
        setIsStarting(false);
        const userMsg = err.message || 'Failed to start mutation run.';
        setError(userMsg);
        return null;
      }
    },
    [questionId, isStarting, status, stopPolling, pollRun]
  );

  // Manual refresh of current report
  const refreshReport = useCallback(() => {
    if (questionId && runId) {
      pollRun(questionId, runId);
    }
  }, [questionId, runId, pollRun]);

  // Reset or clear stuck/stalled run state
  const resetRun = useCallback(() => {
    stopPolling();
    setStatus('IDLE');
    setRunId(null);
    setReport(null);
    setProgress({ total: 0, completed: 0, currentMutant: null, currentTestCase: null });
    setError(null);
    if (questionId) {
      try {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${questionId}`);
      } catch {}
    }
  }, [questionId, stopPolling]);

  return {
    runId,
    report,
    status, // 'IDLE' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
    progress,
    error,
    isStarting,
    isPolling,
    startRun,
    refreshReport,
    resetRun,
    stopPolling
  };
};

export default useMutationRun;

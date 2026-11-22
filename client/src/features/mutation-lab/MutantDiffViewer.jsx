import React, { useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import {
  CheckCircle2,
  AlertTriangle,
  Code2,
  FileCode,
  Terminal,
  Clock,
  HelpCircle,
  ShieldAlert,
  History,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Flame,
  XCircle,
  Info,
  Loader2
} from 'lucide-react';

/**
 * MutantDiffViewer
 * Renders real AST mutant diffs against the teacher's reference solution.
 * Supports equivalent mutant classification transitions (SURVIVED <-> EQUIVALENT)
 * and displays append-only audit history with justification reasons.
 */
export const MutantDiffViewer = ({
  activeMutant,
  referenceSolution = '',
  language = 'javascript',
  onClassifyMutant = null,
  isRunning = false
}) => {
  const [viewMode, setViewMode] = useState('snippet'); // 'snippet' | 'full'
  const [isClassifying, setIsClassifying] = useState(false);
  const [targetClassification, setTargetClassification] = useState(null); // 'EQUIVALENT' | 'SURVIVED'
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [classifyError, setClassifyError] = useState(null);
  const [showAuditHistory, setShowAuditHistory] = useState(false);

  if (!activeMutant) {
    return (
      <div className="text-center py-16 text-[#777D78] bg-white rounded-2xl border border-[#DDE1DA]">
        <Code2 className="w-8 h-8 mx-auto mb-2 text-[#CBD0C8]" />
        <p className="text-sm font-bold text-[#171819]">Select a mutant from the ledger to inspect code transformation</p>
      </div>
    );
  }

  const hasFullCode = Boolean(activeMutant.mutatedFullCode && referenceSolution);
  const hasSnippets = Boolean(activeMutant.originalSnippet || activeMutant.mutatedSnippet);

  // Normalize monaco language identifier
  const getMonacoLang = (lang) => {
    const l = (lang || '').toLowerCase();
    if (l.includes('python')) return 'python';
    if (l.includes('java')) return 'java';
    if (l.includes('c++') || l.includes('cpp')) return 'cpp';
    return 'javascript';
  };

  const currentClassification = activeMutant.currentClassification || (activeMutant.equivalent ? 'EQUIVALENT' : activeMutant.executionStatus);

  const getStatusBadge = (status) => {
    const st = (status || '').toUpperCase();
    switch (st) {
      case 'KILLED':
        return {
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          label: 'KILLED (Test Suite Caught Mutation)',
          icon: CheckCircle2
        };
      case 'SURVIVED':
        return {
          bg: 'bg-rose-100 text-rose-800 border-rose-200',
          label: 'SURVIVED (Test Suite Leakage)',
          icon: AlertTriangle
        };
      case 'EQUIVALENT':
        return {
          bg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
          label: 'EQUIVALENT (Reviewed by Teacher)',
          icon: HelpCircle
        };
      case 'COMPILATION_ERROR':
        return {
          bg: 'bg-amber-100 text-amber-800 border-amber-200',
          label: 'COMPILATION ERROR (Excluded)',
          icon: ShieldAlert
        };
      case 'RUNTIME_ERROR':
        return {
          bg: 'bg-orange-100 text-orange-800 border-orange-200',
          label: 'RUNTIME ERROR',
          icon: AlertTriangle
        };
      case 'TIMEOUT':
        return {
          bg: 'bg-purple-100 text-purple-800 border-purple-200',
          label: 'TIMEOUT',
          icon: Clock
        };
      default:
        return {
          bg: 'bg-zinc-100 text-zinc-800 border-zinc-200',
          label: st || 'PENDING',
          icon: Terminal
        };
    }
  };

  const badge = getStatusBadge(currentClassification);
  const StatusIcon = badge.icon;

  const baselineStatus = activeMutant.baselineExecutionStatus || activeMutant.executionStatus || 'UNKNOWN_LEGACY';
  const isEligibleForReview = baselineStatus === 'SURVIVED' || baselineStatus === 'EQUIVALENT';
  const auditHistory = Array.isArray(activeMutant.auditHistory) ? activeMutant.auditHistory : [];

  const handleStartClassification = (target) => {
    setTargetClassification(target);
    setReason('');
    setClassifyError(null);
    setIsClassifying(true);
  };

  const handleCancelClassification = () => {
    setIsClassifying(false);
    setTargetClassification(null);
    setReason('');
    setClassifyError(null);
  };

  const handleSubmitClassification = async (e) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setClassifyError('Reason must be at least 5 characters long.');
      return;
    }

    if (!onClassifyMutant) return;

    setIsSubmitting(true);
    setClassifyError(null);

    try {
      await onClassifyMutant({
        mutantId: activeMutant.mutantId,
        newClassification: targetClassification,
        reason: reason.trim()
      });
      setIsClassifying(false);
      setTargetClassification(null);
      setReason('');
    } catch (err) {
      setClassifyError(err.message || 'Failed to update classification');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA] flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-black px-2.5 py-0.5 rounded-full bg-[#191A1D] text-[#EDFF72]">
              {activeMutant.mutantId}
            </span>
            <span className="text-xs font-bold text-[#777D78]">
              {activeMutant.operatorType || activeMutant.operator} ({activeMutant.operator})
            </span>
          </div>
          <h3 className="text-base font-bold text-[#171819] mt-1 m-0">
            AST Mutation: {activeMutant.operator}
          </h3>
        </div>

        {/* Diff Mode Toggle (Snippet vs Full File) */}
        {hasFullCode && (
          <div className="flex items-center p-0.5 bg-[#F2F3F0] rounded-xl border border-[#DDE1DA]">
            <button
              type="button"
              onClick={() => setViewMode('snippet')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'snippet'
                  ? 'bg-white text-[#171819] shadow-2xs'
                  : 'text-[#777D78] hover:text-[#171819]'
              }`}
            >
              AST Snippet
            </button>
            <button
              type="button"
              onClick={() => setViewMode('full')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'full'
                  ? 'bg-white text-[#171819] shadow-2xs'
                  : 'text-[#777D78] hover:text-[#171819]'
              }`}
            >
              Full Code Diff
            </button>
          </div>
        )}
      </div>

      {/* Code Presentation Surface */}
      {viewMode === 'full' && hasFullCode ? (
        <div className="rounded-2xl overflow-hidden border border-[#DDE1DA] shadow-xs">
          <div className="bg-[#101112] text-xs font-mono px-3.5 py-2 text-zinc-300 flex items-center justify-between border-b border-zinc-800">
            <span className="flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-[#EDFF72]" />
              <span>Reference Solution vs. Mutant {activeMutant.mutantId}</span>
            </span>
            <span className="text-[10px] text-zinc-400">Monaco Diff Engine</span>
          </div>
          <div className="h-[280px]">
            <DiffEditor
              height="280px"
              language={getMonacoLang(language)}
              original={referenceSolution}
              modified={activeMutant.mutatedFullCode}
              theme="vs-dark"
              options={{
                readOnly: true,
                renderSideBySide: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                wordWrap: 'on'
              }}
            />
          </div>
        </div>
      ) : hasSnippets ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-[#171819] block mb-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Original Reference Snippet</span>
            </label>
            <div className="code-diff min-h-[90px] border-l-4 border-l-emerald-500 bg-[#15161a] text-emerald-300 p-3 rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap">
              {activeMutant.originalSnippet || '// Original node not captured'}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#171819] block mb-1.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              <span>Mutated Node Snippet</span>
            </label>
            <div className="code-diff min-h-[90px] border-l-4 border-l-rose-500 bg-[#15161a] text-rose-300 p-3 rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap">
              {activeMutant.mutatedSnippet || '// Mutated node not captured'}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 bg-[#F8F9F7] rounded-2xl border border-dashed border-[#DDE1DA] text-center text-xs text-[#777D78]">
          <Code2 className="w-5 h-5 mx-auto mb-1 text-[#CBD0C8]" />
          <span>Source code diff is unavailable for this mutant record.</span>
        </div>
      )}

      {/* Execution Diagnostic Log */}
      <div>
        <label className="text-xs font-bold text-[#171819] block mb-1.5 flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-[#171819]" />
          <span>Execution Diagnostic Log</span>
        </label>
        <div className="p-3.5 bg-[#15161a] rounded-2xl border border-[#2b2e35] text-xs font-mono space-y-2">
          <div className="flex items-center justify-between text-zinc-400 flex-wrap gap-2">
            <span>Operator: {activeMutant.operator} ({activeMutant.operatorType || 'AST Transformation'})</span>
            <span className="text-[11px] text-zinc-500">Validation: {activeMutant.validationStatus || 'VALID'}</span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
            <span className="text-zinc-400">Current Classification:</span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.bg}`}>
              <StatusIcon className="w-3 h-3" />
              <span>{badge.label}</span>
            </span>
          </div>

          {activeMutant.baselineExecutionStatus && activeMutant.baselineExecutionStatus !== currentClassification && (
            <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800">
              <span>Original Execution Verdict:</span>
              <span className="font-bold text-rose-300">{activeMutant.baselineExecutionStatus}</span>
            </div>
          )}

          {activeMutant.failureReason && (
            <div className="text-rose-300 pt-1.5 border-t border-zinc-800 text-[11px] break-all leading-relaxed">
              <span className="text-zinc-500 font-bold block mb-0.5">Diagnostic Reason:</span>
              {activeMutant.failureReason}
            </div>
          )}
        </div>
      </div>

      {/* Test Case Execution Results Section */}
      <div className="p-3.5 bg-zinc-950 text-zinc-100 rounded-2xl border border-zinc-800 text-xs space-y-3 font-mono">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-[#EDFF72]" />
            <span className="font-bold text-sm tracking-tight text-white font-sans">
              Test Case Execution Results
            </span>
          </div>
          {activeMutant.testCaseResults && activeMutant.testCaseResults.length > 0 && (
            <span className="text-[11px] text-zinc-400">
              {activeMutant.testCaseResults.length} {activeMutant.testCaseResults.length === 1 ? 'test executed' : 'tests executed'}
            </span>
          )}
        </div>

        {isRunning && (!activeMutant.testCaseResults || activeMutant.testCaseResults.length === 0) ? (
          <div className="flex items-center justify-center gap-2 py-6 text-zinc-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-[#EDFF72]" />
            <span>Executing test-case verification against this mutant...</span>
          </div>
        ) : !activeMutant.testCaseResults || activeMutant.testCaseResults.length === 0 ? (
          <div className="py-4 px-3 text-center text-zinc-400 text-xs bg-zinc-900/60 rounded-xl border border-zinc-800/80">
            <Info className="w-4 h-4 mx-auto mb-1 text-zinc-500" />
            <p>Per-test execution details are unavailable for this historical run.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Outcome Banner */}
            {activeMutant.executionStatus === 'KILLED' || currentClassification === 'KILLED' ? (
              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-start gap-2">
                <Flame className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold font-sans">Mutant Killed:</span>{' '}
                  {activeMutant.testCaseResults.find((t) => t.killedMutant) ? (
                    <span>
                      Killed by <b>Test #{activeMutant.testCaseResults.find((t) => t.killedMutant)?.testCaseNumber}</b> (
                      {activeMutant.testCaseResults.find((t) => t.killedMutant)?.errorMessage || 'Output mismatch observed'}
                      ).
                    </span>
                  ) : (
                    <span>{activeMutant.failureReason || 'Output mismatch observed.'}</span>
                  )}
                </div>
              </div>
            ) : activeMutant.executionStatus === 'SURVIVED' || currentClassification === 'SURVIVED' ? (
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold font-sans">Mutant Survived:</span>{' '}
                  All {activeMutant.testCaseResults.length} eligible executed test cases passed identically against this mutant.
                </div>
              </div>
            ) : activeMutant.executionStatus === 'RUNTIME_ERROR' ? (
              <div className="p-2.5 rounded-xl bg-orange-950/40 border border-orange-800/60 text-orange-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold font-sans">Runtime Error:</span>{' '}
                  {activeMutant.failureReason || 'Program runtime exception encountered during execution.'}
                </div>
              </div>
            ) : activeMutant.executionStatus === 'TIMEOUT' ? (
              <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-800/60 text-purple-200 text-xs flex items-start gap-2">
                <Clock className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold font-sans">Execution Timeout:</span>{' '}
                  {activeMutant.failureReason || 'Mutant timed out (infinite loop or resource limit reached).'}
                </div>
              </div>
            ) : activeMutant.executionStatus === 'COMPILATION_ERROR' ? (
              <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold font-sans">Compilation Error:</span>{' '}
                  {activeMutant.failureReason || 'Mutated code failed syntax compilation.'}
                </div>
              </div>
            ) : null}

            {/* Metric Counters Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              <div className="p-2 bg-zinc-900 rounded-xl border border-zinc-800 text-center">
                <div className="text-[10px] text-zinc-400 font-sans">Executed</div>
                <div className="text-base font-bold text-white">{activeMutant.testCaseResults.length}</div>
              </div>
              <div className="p-2 bg-emerald-950/20 rounded-xl border border-emerald-900/40 text-center">
                <div className="text-[10px] text-emerald-400 font-sans">Passed</div>
                <div className="text-base font-bold text-emerald-400">
                  {activeMutant.testCaseResults.filter((t) => t.status === 'PASSED').length}
                </div>
              </div>
              <div className="p-2 bg-rose-950/20 rounded-xl border border-rose-900/40 text-center">
                <div className="text-[10px] text-rose-400 font-sans">Failed (Kills)</div>
                <div className="text-base font-bold text-rose-400">
                  {activeMutant.testCaseResults.filter((t) => t.status === 'FAILED').length}
                </div>
              </div>
              <div className="p-2 bg-orange-950/20 rounded-xl border border-orange-900/40 text-center">
                <div className="text-[10px] text-orange-400 font-sans">Runtime Err</div>
                <div className="text-base font-bold text-orange-400">
                  {activeMutant.testCaseResults.filter((t) => t.status === 'RUNTIME_ERROR').length}
                </div>
              </div>
              <div className="p-2 bg-purple-950/20 rounded-xl border border-purple-900/40 text-center">
                <div className="text-[10px] text-purple-400 font-sans">Timeout</div>
                <div className="text-base font-bold text-purple-400">
                  {activeMutant.testCaseResults.filter((t) => t.status === 'TIMEOUT').length}
                </div>
              </div>
              <div className="p-2 bg-amber-950/20 rounded-xl border border-amber-900/40 text-center">
                <div className="text-[10px] text-amber-400 font-sans">Compile Err</div>
                <div className="text-base font-bold text-amber-400">
                  {activeMutant.testCaseResults.filter((t) => t.status === 'COMPILATION_ERROR' || t.status === 'EXECUTION_ERROR').length}
                </div>
              </div>
            </div>

            {/* Test Results Table */}
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800 font-sans">
                    <th className="py-2 px-3">Test</th>
                    <th className="py-2 px-3">Input</th>
                    <th className="py-2 px-3">Expected</th>
                    <th className="py-2 px-3">Actual</th>
                    <th className="py-2 px-3 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {activeMutant.testCaseResults.map((tc, idx) => {
                    const isPassed = tc.status === 'PASSED';
                    const isKilled = tc.status === 'FAILED';
                    const isRuntimeErr = tc.status === 'RUNTIME_ERROR';
                    const isTimeout = tc.status === 'TIMEOUT';
                    const isCompileErr = tc.status === 'COMPILATION_ERROR';

                    return (
                      <tr
                        key={tc.testCaseId || idx}
                        className={`hover:bg-zinc-900/50 transition-colors ${
                          tc.killedMutant ? 'bg-rose-950/20' : ''
                        }`}
                      >
                        <td className="py-2 px-3 font-bold text-zinc-300 whitespace-nowrap">
                          #{tc.testCaseNumber || idx + 1}
                          {tc.killedMutant && (
                            <span className="ml-1.5 px-1.5 py-0.2 rounded text-[9px] bg-rose-600 text-white font-sans font-bold">
                              KILLER
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-zinc-300 max-w-[120px] truncate" title={tc.input}>
                          {tc.input || '(empty)'}
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[120px] truncate" title={tc.expectedOutput}>
                          {tc.expectedOutput || '(empty)'}
                        </td>
                        <td
                          className={`py-2 px-3 max-w-[120px] truncate ${
                            isPassed ? 'text-emerald-400' : isKilled ? 'text-rose-400' : 'text-zinc-400'
                          }`}
                          title={tc.actualOutput || tc.errorMessage}
                        >
                          {tc.actualOutput || tc.errorMessage || '(none)'}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          {isPassed ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              PASSED
                            </span>
                          ) : isKilled ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                              FAILED (KILLED)
                            </span>
                          ) : isRuntimeErr ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30">
                              RUNTIME ERROR
                            </span>
                          ) : isTimeout ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                              TIMEOUT
                            </span>
                          ) : isCompileErr ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              COMPILE ERROR
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/10 text-zinc-400 border border-zinc-500/30">
                              {tc.status || 'ERROR'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Equivalent Mutant Management Section (Phase 4A.1) */}
      <div className="p-3.5 bg-[#F2F3F0] rounded-2xl border border-[#DDE1DA] text-xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#171819] shrink-0" />
            <span className="font-bold text-[#171819]">Equivalent Mutant Management:</span>
            {currentClassification === 'EQUIVALENT' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                Classified as Equivalent
              </span>
            )}
          </div>

          {isEligibleForReview && !isClassifying && (
            <div>
              {currentClassification === 'SURVIVED' ? (
                <button
                  type="button"
                  onClick={() => handleStartClassification('EQUIVALENT')}
                  className="px-3 py-1.5 rounded-xl bg-[#191A1D] text-[#EDFF72] font-bold text-xs hover:bg-black transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark as Equivalent</span>
                </button>
              ) : currentClassification === 'EQUIVALENT' ? (
                <button
                  type="button"
                  onClick={() => handleStartClassification('SURVIVED')}
                  className="px-3 py-1.5 rounded-xl bg-white text-rose-700 border border-rose-300 font-bold text-xs hover:bg-rose-50 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revert to Survived</span>
                </button>
              ) : null}
            </div>
          )}

          {!isEligibleForReview && (
            <span className="text-[11px] text-[#777D78] italic">
              Locked (Physical verdict '{baselineStatus}' cannot be marked equivalent).
            </span>
          )}
        </div>

        {/* Classification Input Dialog Form */}
        {isClassifying && (
          <form onSubmit={handleSubmitClassification} className="bg-white p-3 rounded-xl border border-[#CBD0C8] space-y-2 mt-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#171819]">
              <span>
                {targetClassification === 'EQUIVALENT'
                  ? 'Confirm Equivalence Classification'
                  : 'Revert to Baseline Survived Classification'}
              </span>
              <span className="text-[11px] font-normal text-[#777D78]">Required justification reason</span>
            </div>

            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this mutant produces semantically equivalent behavior or why it is being restored..."
              className="w-full text-xs p-2.5 rounded-lg border border-[#DDE1DA] focus:border-[#191A1D] focus:outline-none resize-none font-sans"
              disabled={isSubmitting}
            />

            {classifyError && (
              <p className="text-[11px] font-bold text-rose-600 m-0">{classifyError}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancelClassification}
                disabled={isSubmitting}
                className="px-2.5 py-1 text-xs font-bold text-[#777D78] hover:text-[#171819] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || reason.trim().length < 5}
                className="px-3.5 py-1 text-xs font-bold bg-[#191A1D] text-[#EDFF72] rounded-lg hover:bg-black disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isSubmitting ? 'Updating...' : `Confirm ${targetClassification}`}
              </button>
            </div>
          </form>
        )}

        {/* Audit History Timeline */}
        {auditHistory.length > 0 && (
          <div className="pt-2 border-t border-[#DDE1DA]">
            <button
              type="button"
              onClick={() => setShowAuditHistory(!showAuditHistory)}
              className="flex items-center justify-between w-full text-[11px] font-bold text-[#171819] hover:text-black cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-[#777D78]" />
                <span>Audit History ({auditHistory.length} review{auditHistory.length > 1 ? 's' : ''})</span>
              </span>
              {showAuditHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAuditHistory && (
              <div className="space-y-2 mt-2 pt-1">
                {auditHistory.slice().reverse().map((entry, idx) => (
                  <div key={entry.auditId || idx} className="bg-white p-2.5 rounded-xl border border-[#DDE1DA] text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-[#777D78] flex-wrap gap-1">
                      <span className="font-bold text-[#171819]">
                        {entry.previousClassification} &rarr; <span className="text-indigo-700">{entry.newClassification}</span>
                      </span>
                      <span>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'N/A'}</span>
                    </div>
                    <p className="text-[#171819] m-0 text-xs italic bg-[#F8F9F7] p-1.5 rounded-lg border border-[#E9EBE6]">
                      &ldquo;{entry.reason}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MutantDiffViewer;

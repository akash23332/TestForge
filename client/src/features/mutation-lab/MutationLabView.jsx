import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { SearchableQuestionSelect } from '../../components/SearchableQuestionSelect';
import { api } from '../../lib/api';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Zap,
  ArrowRight,
  AlertTriangle
} from 'lucide-react';

export const MutationLabView = ({
  questions = [],
  selectedQuestion,
  onSelectQuestion,
  onNavigate
}) => {
  const currentQ = selectedQuestion || questions[0];
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedMutant, setSelectedMutant] = useState(null);

  const handleRunMutations = async () => {
    if (!currentQ) return;
    setRunning(true);
    try {
      const res = await api.post(`/questions/${currentQ._id}/mutation-runs`, {}, { timeout: 60000 });
      setResult(res.data.data);
      if (res.data.data.mutants && res.data.data.mutants.length > 0) {
        setSelectedMutant(res.data.data.mutants[0]);
      }
    } catch (err) {
      alert(err?.customMessage || 'Failed to execute mutation tests.');
    } finally {
      setRunning(false);
    }
  };

  if (!currentQ) {
    return (
      <div className="text-center py-16 bg-white border border-slate-200 rounded-3xl shadow-xs">
        <Activity className="mx-auto h-10 w-10 text-slate-300 mb-2" />
        <h3 className="text-slate-800 font-bold">No questions available</h3>
        <p className="text-xs text-slate-400 mt-1">Please create a question first to run mutation testing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 rounded-3xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-0.5 bg-orange-600 rounded-full" />
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
              Mutation Testing Lab
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Test Suite Quality & Bug Injection
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Injects bounded deterministic mutations to test if your test cases detect real bugs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1.5 rounded-xl bg-orange-50 text-orange-700 border border-orange-200 font-mono">
            {currentQ.language || 'javascript'}
          </span>

          <SearchableQuestionSelect
            questions={questions}
            selectedQuestion={currentQ}
            onSelectQuestion={(q) => {
              onSelectQuestion(q);
              setResult(null);
              setSelectedMutant(null);
            }}
            className="w-64 sm:w-80"
          />

          <Button size="sm" onClick={handleRunMutations} isLoading={running}>
            <Zap className="h-3.5 w-3.5 fill-current" /> Run Mutations
          </Button>
        </div>
      </div>

      {/* Mutation Score Card */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs md:col-span-1">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Mutation Score</span>
            <div className="text-4xl font-extrabold text-purple-600 mt-2">
              {result.mutationScore !== null && result.mutationScore !== undefined
                ? `${result.mutationScore}%`
                : 'N/A'}
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 mt-3 overflow-hidden">
              <div
                className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${result.mutationScore || 0}%` }}
              />
            </div>
            <div className="text-xs text-slate-500 font-medium mt-2">
              {result.killed} Killed / {result.totalEligible ?? (result.killed + result.survived)} Valid Mutants
              {result.invalid > 0 && ` (${result.invalid} Invalid)`}
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs md:col-span-3 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Quality Assessment</span>
              <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
                {result.summary}
              </p>
              {result.survived > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2 font-medium">
                  <XCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Warning: {result.survived} mutant(s) survived! Your test suite has blind spots.</span>
                </div>
              )}
            </div>

            {result.survived > 0 && (
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button size="sm" variant="secondary" onClick={() => onNavigate('tests')}>
                  Add Boundary Test in Studio <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mutants Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Mutant list */}
        <Card
          title="Generated Mutants"
          subtitle="Click to inspect side-by-side code diff and test response"
          className="lg:col-span-1"
        >
          {!result ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Click "Run Mutations" to generate deterministic code mutations and evaluate test strength.
            </div>
          ) : (
            <div className="space-y-2.5">
              {result.mutants.map((mut) => (
                <div
                  key={mut.id}
                  onClick={() => setSelectedMutant(mut)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    selectedMutant?.id === mut.id
                      ? 'bg-purple-50 border-purple-300 shadow-xs'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono font-bold text-slate-800">{mut.id}</span>
                    <Badge
                      variant={
                        mut.status === 'killed'
                          ? 'success'
                          : mut.status === 'survived'
                          ? 'error'
                          : 'warning'
                      }
                    >
                      {mut.status === 'killed'
                        ? 'Killed'
                        : mut.status === 'survived'
                        ? 'Survived'
                        : 'Invalid'}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-600 line-clamp-1">{mut.description}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Right: Code Diff Inspector */}
        <Card
          title="Mutation Code Diff & Evaluation"
          subtitle={
            selectedMutant
              ? `${selectedMutant.operator} — ${selectedMutant.status.toUpperCase()}`
              : 'Select a mutant to inspect code differences'
          }
          className="lg:col-span-2"
        >
          {selectedMutant ? (
            <div className="space-y-4">
              <div className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="font-bold text-purple-700">Mutation Target: </span>
                {selectedMutant.description}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Original */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-emerald-700 mb-1.5">
                    <span>Original Code</span>
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <pre className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap shadow-inner">
                    {selectedMutant.originalSnippet}
                  </pre>
                </div>

                {/* Mutated */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-rose-600 mb-1.5">
                    <span>Injected Mutant (Bug)</span>
                    <XCircle className="h-4 w-4" />
                  </div>
                  <pre className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-xs font-mono text-rose-300 overflow-x-auto whitespace-pre-wrap shadow-inner">
                    {selectedMutant.mutatedSnippet}
                  </pre>
                </div>
              </div>

              {/* Outcome Banner */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between shadow-xs ${
                  selectedMutant.status === 'killed'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : selectedMutant.status === 'survived'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">
                    {selectedMutant.status === 'killed'
                      ? 'Mutant Killed (Test Suite Caught The Bug)'
                      : selectedMutant.status === 'survived'
                      ? 'Mutant Survived (Weak Test Suite)'
                      : 'Compilation Error / Invalid Mutant'}
                  </div>
                  <div className="text-xs mt-0.5">
                    {selectedMutant.status === 'killed'
                      ? `Caught by: ${selectedMutant.killedByTest}`
                      : selectedMutant.status === 'survived'
                      ? 'None of your test cases failed against this buggy mutation. Add targeted test cases in Studio to kill this mutant.'
                      : 'This mutant failed to compile or threw a syntax error. It is excluded from the score.'}
                  </div>
                </div>
                <Badge
                  variant={
                    selectedMutant.status === 'killed'
                      ? 'success'
                      : selectedMutant.status === 'survived'
                      ? 'error'
                      : 'warning'
                  }
                >
                  {selectedMutant.status === 'killed'
                    ? 'Killed'
                    : selectedMutant.status === 'survived'
                    ? 'Survived'
                    : 'Invalid'}
                </Badge>
              </div>

              {/* Test Execution Telemetry for Killed Mutants */}
              {selectedMutant.status === 'killed' && selectedMutant.testInput && (
                <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between text-emerald-950 font-bold uppercase tracking-wider text-[11px]">
                    <span>Detection Telemetry ({selectedMutant.killedByTest})</span>
                    <span className="font-mono text-emerald-700 font-semibold">Observed Output Mismatch</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">Killing Input</span>
                      <span className="text-slate-900 font-semibold break-all">{selectedMutant.testInput}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">Reference Output</span>
                      <span className="text-emerald-700 font-bold break-all">{selectedMutant.expectedOutput}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">Mutant Output</span>
                      <span className="text-rose-600 font-bold break-all">{selectedMutant.mutantOutput}</span>
                    </div>
                  </div>
                  {selectedMutant.failureReason && (
                    <div className="text-[11px] text-emerald-800/90 font-medium">
                      {selectedMutant.failureReason}
                    </div>
                  )}
                </div>
              )}

              {/* Compilation Error Diagnostic for Debugging */}
              {(selectedMutant.status === 'compilation_error' || selectedMutant.status === 'invalid') &&
                (selectedMutant.compilationError || selectedMutant.error) && (
                  <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300 space-y-2 shadow-xs">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase tracking-wider">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>Compilation Error Diagnostic</span>
                    </div>
                    <pre className="bg-slate-900 text-amber-300 p-3.5 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap border border-slate-800 shadow-inner">
                      {selectedMutant.compilationError || selectedMutant.error}
                    </pre>
                  </div>
                )}

              {/* Verified Candidate Test Recommendations for Surviving Mutants */}
              {result.candidateTests && result.candidateTests.length > 0 && (
                <div className="mt-4 p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                      Proposed Candidate Tests for Surviving Mutants
                    </span>
                    <Badge variant="warning">{result.candidateTests.length} Verified Candidate</Badge>
                  </div>
                  <div className="space-y-2">
                    {result.candidateTests.map((cand, cIdx) => (
                      <div
                        key={cIdx}
                        className="bg-white p-3.5 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-800">{cand.reason}</div>
                          <div className="font-mono text-[11px] text-slate-600">
                            Input: <span className="text-slate-900 font-bold">{cand.input}</span> | Expected:{' '}
                            <span className="text-emerald-700 font-bold">{cand.expectedOutput}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="orange"
                          onClick={async () => {
                            try {
                              await api.post(`/questions/${currentQ._id}/tests`, {
                                input: cand.input,
                                expectedOutput: cand.expectedOutput,
                                category: cand.category || 'boundary',
                                visibility: 'hidden'
                              });
                              alert('Candidate test added to suite! Check Test Studio.');
                              onNavigate('tests');
                            } catch {
                              alert('Failed to add candidate test.');
                            }
                          }}
                        >
                          Add to Suite
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 text-slate-400 text-xs">
              No mutant selected. Run mutations and choose an entry from the list.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default MutationLabView;

import React, { useState } from 'react';
import {
  Sparkles,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Flame,
  PlusCircle,
  FileCode,
  Check,
  ChevronRight,
  ShieldCheck,
  Layers
} from 'lucide-react';
import { generateAiKillerTests, batchSaveTestCases } from './mutationLabService';

export const AiAutoFixModal = ({
  isOpen,
  onClose,
  question,
  report,
  onRunStarted,
  showToast
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedCandidates, setGeneratedCandidates] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');

  if (!isOpen) return null;

  const survivingMutants = (report?.mutants || []).filter(
    (m) => m.executionStatus === 'SURVIVED' && !m.equivalent
  );

  // Trigger AI generation of killer test cases
  const handleGenerateKillerTests = async () => {
    if (!question?._id) return;
    setIsGenerating(true);
    setErrorMsg(null);

    try {
      // Build context from surviving mutants
      const mutantSummary = survivingMutants
        .slice(0, 5)
        .map(
          (m, idx) =>
            `Mutant ${idx + 1} (${m.operator || 'OPR'}): line ${m.line || 'unknown'} -> ${
              m.mutatedSnippet || m.originalSnippet || 'operator modified'
            }`
        )
        .join('; ');

      const instructions = `Generate rigorous boundary and edge-case inputs specifically targeting surviving code mutations: ${mutantSummary}. ${
        customPrompt ? `Additional constraints: ${customPrompt}` : ''
      } Ensure inputs test exact edge boundaries, zero/empty states, and threshold transitions so the mutants will fail.`;

      const result = await generateAiKillerTests(question._id, {
        count: Math.min(8, Math.max(4, survivingMutants.length * 2)),
        category: 'boundary',
        instructions,
        visibility: 'hidden'
      });

      const candidates = result?.candidates || result?.testCases || [];
      if (candidates.length === 0) {
        setErrorMsg('AI did not produce valid candidate test cases. Please retry.');
      } else {
        setGeneratedCandidates(candidates);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to generate killer test cases via AI.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Adopt candidates & immediately trigger mutation run
  const handleAdoptAndRerun = async (replaceExisting = false) => {
    if (!question?._id || generatedCandidates.length === 0 || isSaving) return;
    setIsSaving(true);
    setErrorMsg(null);

    try {
      // 1. Batch save to question's test cases
      await batchSaveTestCases(question._id, generatedCandidates, replaceExisting);

      if (showToast) {
        showToast(
          replaceExisting
            ? `Replaced test cases with ${generatedCandidates.length} new killer tests! Rerunning suite...`
            : `Added ${generatedCandidates.length} killer tests to suite! Rerunning suite...`
        );
      }

      onClose();

      // 2. Trigger mutation run immediately
      if (onRunStarted) {
        setTimeout(() => {
          onRunStarted();
        }, 300);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save test cases and trigger rerun.');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-[#DDE1DA] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-[#191A1D] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#EDFF72] text-[#121212] flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2 m-0">
                <span>AI Auto-Heal Test Suite</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  {survivingMutants.length} Survived
                </span>
              </h3>
              <p className="text-xs text-[#A4A7A1] mt-0.5 m-0">
                Target: {question?.title || 'Selected Question'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isGenerating}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Surviving Mutants Context Card */}
          <div className="p-4 rounded-2xl bg-[#F8F9F7] border border-[#DDE1DA]">
            <div className="flex items-center justify-between text-xs font-bold text-[#171819] mb-2">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Bugs / Mutants That Passed Your Test Suite</span>
              </span>
              <span className="text-[11px] font-mono text-[#777D78]">
                {survivingMutants.length} leaks detected
              </span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {survivingMutants.map((m, idx) => (
                <div
                  key={m.mutantId || idx}
                  className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#E9ECE7] text-xs font-mono"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                      {m.operator || 'OPR'}
                    </span>
                    <span className="text-[#171819] truncate">
                      {m.mutatedSnippet || m.originalSnippet || `Line ${m.line}`}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#777D78] shrink-0">Line {m.line}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* AI Killer Test Generation Trigger */}
          {generatedCandidates.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white border-2 border-dashed border-[#CBD0C8] text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6 fill-amber-400 text-amber-600" />
              </div>
              <div className="max-w-md mx-auto">
                <h4 className="text-sm font-bold text-[#171819] m-0">
                  Synthesize Boundary Killer Test Cases
                </h4>
                <p className="text-xs text-[#777D78] mt-1 m-0">
                  AI will analyze the reference solution and exact mutant AST diffs to generate
                  verified edge-case inputs that cause the mutants to fail.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGenerateKillerTests}
                  disabled={isGenerating}
                  className="px-6 py-3 rounded-full bg-[#191A1D] hover:bg-black text-[#EDFF72] font-bold text-xs inline-flex items-center gap-2 shadow-lg hover:shadow-xl active:scale-95 transition-all cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#EDFF72]" />
                      <span>Synthesizing Killer Tests with AI…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 fill-current text-[#EDFF72]" />
                      <span>Generate Killer Tests with AI (1-Click)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Generated Candidates Review & 1-Click Action */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[#171819]">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    {generatedCandidates.length} Verified Killer Test Cases Generated
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateKillerTests}
                  disabled={isGenerating || isSaving}
                  className="text-[11px] font-bold text-[#777D78] hover:text-[#171819] flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Regenerate</span>
                </button>
              </div>

              {/* Candidates Preview List */}
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {generatedCandidates.map((cand, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] text-xs font-mono space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-[#777D78]">
                      <span className="font-bold text-[#171819]">Test Case #{idx + 1}</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-sans font-bold">
                        {cand.category || 'boundary'}
                      </span>
                    </div>
                    <div className="text-zinc-800 truncate">
                      <span className="text-[#777D78]">Input:</span> {String(cand.input)}
                    </div>
                    <div className="text-emerald-700 truncate">
                      <span className="text-[#777D78]">Expected:</span>{' '}
                      {String(cand.expectedOutput || cand.computedOutput || '')}
                    </div>
                  </div>
                ))}
              </div>

              {/* 1-Click Action Choices */}
              <div className="pt-3 border-t border-[#DDE1DA] space-y-2">
                <span className="text-[11px] font-bold text-[#171819] block">
                  Choose how to apply to Question test suite:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Option 1: Replace Old Tests & Rerun (What user requested) */}
                  <button
                    type="button"
                    onClick={() => handleAdoptAndRerun(true)}
                    disabled={isSaving}
                    className="p-3.5 rounded-2xl bg-[#191A1D] hover:bg-black text-white text-left transition-all border border-[#191A1D] shadow-md hover:shadow-lg cursor-pointer flex flex-col justify-between group"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold text-[#EDFF72] flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        Replace Old Tests &amp; Rerun
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-tight m-0">
                      Replaces existing weak tests with these killer tests and reruns mutation suite to reach 100%.
                    </p>
                  </button>

                  {/* Option 2: Append to Existing Tests & Rerun */}
                  <button
                    type="button"
                    onClick={() => handleAdoptAndRerun(false)}
                    disabled={isSaving}
                    className="p-3.5 rounded-2xl bg-white hover:bg-[#F8F9F7] text-left transition-all border border-[#DDE1DA] hover:border-[#171819] shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between group"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold text-[#171819] flex items-center gap-1.5">
                        <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                        Append to Suite &amp; Rerun
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                    <p className="text-[11px] text-[#777D78] leading-tight m-0">
                      Keeps existing tests and adds these new boundary test cases to strengthen the question.
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#F8F9F7] border-t border-[#DDE1DA] flex items-center justify-between text-xs">
          <span className="text-[11px] text-[#777D78]">
            {isSaving ? (
              <span className="flex items-center gap-1.5 text-[#171819] font-bold">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#191A1D]" />
                Saving test cases and rerunning mutation suite…
              </span>
            ) : (
              'All candidate outputs are verified against your authoritative reference solution.'
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isGenerating}
            className="px-3 py-1.5 rounded-lg border border-[#DDE1DA] bg-white hover:bg-[#F2F3F0] text-[#171819] font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  FileCode,
  ShieldCheck,
  Info
} from 'lucide-react';
import { mapSurvivingMutantsWithCandidates } from './mutationLabHelpers';

/**
 * SurvivingMutantsCandidateTests
 * Dedicated section for surfacing surviving mutants and their synthesized killer tests.
 * Clearly marks tests as 'Suggested Candidate Test' vs 'Verified Candidate Test'
 * and maintains an explicit 'Not Yet Adopted' badge to ensure no automatic commits occur.
 */
export const SurvivingMutantsCandidateTests = ({
  mutants = [],
  candidateTests = [],
  onSelectMutant,
  selectedMutantId,
  onAdoptCandidate,
  onRejectCandidate,
  onOpenAdoptionTab
}) => {
  const survivingPairs = mapSurvivingMutantsWithCandidates(mutants, candidateTests);

  if (survivingPairs.length === 0) {
    return (
      <div className="p-4 bg-[#F8F9F7] rounded-2xl border border-[#DDE1DA] text-center">
        <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
        <h4 className="text-xs font-bold text-[#171819]">No Surviving Mutants</h4>
        <p className="text-[11px] text-[#777D78] mt-0.5">
          All eligible mutants were successfully terminated by the existing test suite.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Informational Guidance Notice */}
      <div className="flex items-start justify-between gap-2 p-2.5 bg-[#F2F3F0] rounded-xl border border-[#DDE1DA] text-xs">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-[#777D78] shrink-0 mt-0.5" />
          <div className="text-[11px] text-[#777D78] leading-tight">
            <span className="font-bold text-[#171819]">Synthesized Candidate Tests:</span> Candidate tests kill surviving mutants and can be adopted into the permanent question test suite.
          </div>
        </div>
        {onOpenAdoptionTab && (
          <button
            type="button"
            onClick={onOpenAdoptionTab}
            className="text-[10px] font-bold text-[#171819] hover:underline shrink-0 bg-white px-2 py-0.5 rounded-lg border border-[#DDE1DA]"
          >
            Adoption Hub &rarr;
          </button>
        )}
      </div>

      <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
        {survivingPairs.map(({ mutant, candidateTest }) => {
          const isSelected = mutant.mutantId === selectedMutantId;
          const isVerified = Boolean(candidateTest?.verified);
          const isEquivalent =
            mutant.equivalent === true || mutant.currentClassification === 'EQUIVALENT';
          const adoptionStatus = (candidateTest?.adoptionStatus || 'PENDING').toUpperCase();
          const isAdopted = adoptionStatus === 'ADOPTED';
          const isRejected = adoptionStatus === 'REJECTED';
          const isPending = adoptionStatus === 'PENDING' && !isEquivalent;

          return (
            <div
              key={mutant.mutantId}
              onClick={() => onSelectMutant && onSelectMutant(mutant.mutantId)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-white border-[#171819] shadow-sm ring-1 ring-[#171819]'
                  : 'bg-white hover:bg-[#F8F9F7] border-[#DDE1DA]'
              }`}
            >
              {/* Mutant Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-xs text-[#171819]">
                    {mutant.mutantId}
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#F2F3F0] text-[#171819] border border-[#DDE1DA]">
                    {mutant.operator}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {isEquivalent && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700">
                      EQUIVALENT
                    </span>
                  )}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                    SURVIVED
                  </span>
                </div>
              </div>

              {/* Mutation Snippet Transformation */}
              <div className="text-[11px] font-mono bg-[#15161a] p-2 rounded-lg mb-2 text-zinc-300 space-y-0.5">
                <div className="text-zinc-500 text-[10px]">Transformation:</div>
                <div className="line-through text-rose-400 truncate">{mutant.originalSnippet}</div>
                <div className="text-emerald-400 truncate">{mutant.mutatedSnippet}</div>
              </div>

              {/* Survival Explanation */}
              <div className="text-[11px] text-[#777D78] mb-2 leading-relaxed">
                <span className="font-semibold text-[#171819]">Why it survived: </span>
                {mutant.failureReason || 'Passed all test assertions without triggering an output discrepancy or runtime exception.'}
              </div>

              {/* Synthesized Candidate Test Details */}
              {candidateTest ? (
                <div className="p-2.5 rounded-xl bg-[#F8F9F7] border border-[#DDE1DA] space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-[10px] font-mono font-bold uppercase text-[#777D78] flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span>Synthesized Input</span>
                    </span>

                    {/* Verification & Adoption Status Badges */}
                    <div className="flex items-center gap-1">
                      {isVerified ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Verified</span>
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          <span>Suggested</span>
                        </span>
                      )}

                      {/* Adoption Status */}
                      {isAdopted ? (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>ADOPTED</span>
                        </span>
                      ) : isRejected ? (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700">
                          REJECTED
                        </span>
                      ) : isEquivalent ? (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                          Ineligible
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          Pending Adoption
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="font-mono text-[11px] bg-white p-2 rounded-lg border border-[#DDE1DA] space-y-1">
                    <div>
                      <span className="text-zinc-400 block text-[10px]">Test Input:</span>
                      <span className="text-[#171819] break-all">{candidateTest.input || 'None'}</span>
                    </div>
                    <div className="pt-1 border-t border-[#F2F3F0]">
                      <span className="text-zinc-400 block text-[10px]">Expected Output:</span>
                      <span className="text-[#171819] break-all">{candidateTest.expectedOutput || 'None'}</span>
                    </div>
                  </div>

                  {/* Quick Action Footer */}
                  {onAdoptCandidate && isPending && (
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#DDE1DA]" onClick={(e) => e.stopPropagation()}>
                      {onRejectCandidate && (
                        <button
                          type="button"
                          onClick={() => onRejectCandidate(candidateTest)}
                          className="text-[10px] font-bold px-2 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
                        >
                          Reject
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onAdoptCandidate(candidateTest)}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-[#191A1D] hover:bg-black text-[#EDFF72] flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Adopt Candidate</span>
                      </button>
                    </div>
                  )}

                  {isAdopted && candidateTest.adoptedTestCaseId && (
                    <div className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center justify-between">
                      <span>TestCase ID: {String(candidateTest.adoptedTestCaseId).slice(-8)}</span>
                      <span className="text-emerald-700 font-sans font-bold">In Suite</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-zinc-400 italic bg-[#F2F3F0] p-2 rounded-lg text-center">
                  Candidate killer test not synthesized for this mutant
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SurvivingMutantsCandidateTests;

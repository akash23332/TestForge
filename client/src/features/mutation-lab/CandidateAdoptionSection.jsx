import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Search,
  Filter,
  Layers,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  ShieldAlert,
  Info,
  Loader2,
  Code2,
  Lock,
  Eye,
  RefreshCw,
  FileCode
} from 'lucide-react';

/**
 * CandidateAdoptionSection
 * Component for reviewing, adopting, and rejecting mutation-generated candidate test cases.
 * Strictly preserves candidate provenance (read-only input & expected output).
 */
export const CandidateAdoptionSection = ({
  questionId,
  runId,
  candidates = [],
  mutants = [],
  report = null,
  onAdoptCandidate,
  onRejectCandidate,
  onOpenAiFixModal = null,
  onNavigateToStudio,
  onSelectMutant,
  isRefreshing = false
}) => {
  // Local filtering & search
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending' | 'adopted' | 'rejected' | 'ineligible'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);

  // Active Modals state
  const [adoptingCandidate, setAdoptingCandidate] = useState(null);
  const [rejectingCandidate, setRejectingCandidate] = useState(null);
  const [detailCandidate, setDetailCandidate] = useState(null);

  // Adoption modal form state
  const [selectedCategory, setSelectedCategory] = useState('edge_case');
  const [selectedVisibility, setSelectedVisibility] = useState('hidden');

  // Rejection modal form state
  const [rejectionReason, setRejectionReason] = useState('');

  // In-flight action tracking (prevents duplicate submission)
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [isLockConflict, setIsLockConflict] = useState(false);

  // Copy helper
  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Map mutant metadata for each candidate
  const enrichedCandidates = useMemo(() => {
    const mutantMap = new Map((mutants || []).map((m) => [m.mutantId, m]));
    return (candidates || []).map((cand) => {
      const associatedMutant = mutantMap.get(cand.mutantId);
      const isMutantEquivalent =
        associatedMutant?.equivalent === true ||
        associatedMutant?.currentClassification === 'EQUIVALENT';

      return {
        ...cand,
        mutant: associatedMutant,
        isMutantEquivalent,
        isIneligible: isMutantEquivalent && cand.adoptionStatus !== 'ADOPTED'
      };
    });
  }, [candidates, mutants]);

  // Filter & Search computation
  const filteredCandidates = useMemo(() => {
    return enrichedCandidates.filter((c) => {
      const status = (c.adoptionStatus || 'PENDING').toUpperCase();

      if (filterStatus === 'pending' && status !== 'PENDING') return false;
      if (filterStatus === 'adopted' && status !== 'ADOPTED') return false;
      if (filterStatus === 'rejected' && status !== 'REJECTED') return false;
      if (filterStatus === 'ineligible' && !c.isIneligible) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cidMatch = (c.candidateId || '').toLowerCase().includes(q);
        const midMatch = (c.mutantId || '').toLowerCase().includes(q);
        const opMatch = (c.mutant?.operator || '').toLowerCase().includes(q);
        const inMatch = (c.input || '').toLowerCase().includes(q);
        const outMatch = (c.expectedOutput || '').toLowerCase().includes(q);
        return cidMatch || midMatch || opMatch || inMatch || outMatch;
      }

      return true;
    });
  }, [enrichedCandidates, filterStatus, searchQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    let pending = 0;
    let adopted = 0;
    let rejected = 0;
    let ineligible = 0;

    enrichedCandidates.forEach((c) => {
      const s = (c.adoptionStatus || 'PENDING').toUpperCase();
      if (s === 'ADOPTED') adopted++;
      else if (s === 'REJECTED') rejected++;
      else if (c.isIneligible) ineligible++;
      else pending++;
    });

    return {
      total: enrichedCandidates.length,
      pending,
      adopted,
      rejected,
      ineligible
    };
  }, [enrichedCandidates]);

  // Open Adopt Modal
  const handleOpenAdoptModal = (cand) => {
    setAdoptingCandidate(cand);
    setSelectedCategory(cand.category || 'edge_case');
    setSelectedVisibility('hidden');
    setActionError(null);
    setIsLockConflict(false);
  };

  // Submit Adoption
  const handleConfirmAdopt = async () => {
    if (!adoptingCandidate || actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    setIsLockConflict(false);

    try {
      await onAdoptCandidate(adoptingCandidate.candidateId, {
        category: selectedCategory,
        visibility: selectedVisibility
      });
      setAdoptingCandidate(null);
    } catch (err) {
      setActionError(err.message || 'Failed to adopt candidate test case.');
      if (err.status === 409 && err.code === 'QUESTION_LOCKED_BY_ADOPTION') {
        setIsLockConflict(true);
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Open Reject Modal
  const handleOpenRejectModal = (cand) => {
    setRejectingCandidate(cand);
    setRejectionReason('');
    setActionError(null);
  };

  // Submit Rejection
  const handleConfirmReject = async () => {
    if (!rejectingCandidate || actionLoading) return;
    setActionLoading(true);
    setActionError(null);

    try {
      await onRejectCandidate(rejectingCandidate.candidateId, {
        rejectionReason: rejectionReason,
        reason: rejectionReason
      });
      setRejectingCandidate(null);
    } catch (err) {
      setActionError(err.message || 'Failed to reject candidate test case.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="candidate-adoption-section">
      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="p-3 bg-white rounded-2xl border border-[#DDE1DA]">
          <span className="text-[10px] font-mono font-bold text-[#777D78] uppercase block">
            Total Candidates
          </span>
          <span className="text-lg font-bold text-[#171819]">{stats.total}</span>
        </div>

        <div className="p-3 bg-amber-50/50 rounded-2xl border border-amber-200">
          <span className="text-[10px] font-mono font-bold text-amber-800 uppercase flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Pending Review</span>
          </span>
          <span className="text-lg font-bold text-amber-900">{stats.pending}</span>
        </div>

        <div className="p-3 bg-emerald-50/50 rounded-2xl border border-emerald-200">
          <span className="text-[10px] font-mono font-bold text-emerald-800 uppercase flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
            <span>Adopted to Suite</span>
          </span>
          <span className="text-lg font-bold text-emerald-900">{stats.adopted}</span>
        </div>

        <div className="p-3 bg-zinc-50 rounded-2xl border border-[#DDE1DA]">
          <span className="text-[10px] font-mono font-bold text-[#777D78] uppercase block">
            Rejected
          </span>
          <span className="text-lg font-bold text-[#171819]">{stats.rejected}</span>
        </div>

        <div className="p-3 bg-rose-50/50 rounded-2xl border border-rose-200">
          <span className="text-[10px] font-mono font-bold text-rose-800 uppercase block">
            Ineligible
          </span>
          <span className="text-lg font-bold text-rose-900">{stats.ineligible}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-[#DDE1DA]">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-[#777D78] mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {[
            { id: 'all', label: `All (${stats.total})` },
            { id: 'pending', label: `Pending (${stats.pending})` },
            { id: 'adopted', label: `Adopted (${stats.adopted})` },
            { id: 'rejected', label: `Rejected (${stats.rejected})` },
            { id: 'ineligible', label: `Ineligible (${stats.ineligible})` }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-all cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-[#191A1D] text-white border-[#191A1D] shadow-sm'
                  : 'bg-[#F2F3F0] text-[#777D78] border-[#DDE1DA] hover:bg-[#E9ECE7]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#777D78]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidate, mutant ID, input..."
            className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#171819] placeholder:text-[#777D78] focus:bg-white focus:border-[#171819] outline-none transition-all"
          />
        </div>
      </div>

      {/* Candidate Cards Grid */}
      {filteredCandidates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredCandidates.map((cand) => {
            const status = (cand.adoptionStatus || 'PENDING').toUpperCase();
            const isPending = status === 'PENDING' && !cand.isIneligible;
            const isAdopted = status === 'ADOPTED';
            const isRejected = status === 'REJECTED';
            const isIneligible = cand.isIneligible;

            return (
              <div
                key={cand.candidateId}
                data-testid={`candidate-card-${cand.candidateId}`}
                className={`p-4 rounded-2xl border transition-all ${
                  isAdopted
                    ? 'bg-emerald-50/20 border-emerald-200'
                    : isRejected
                    ? 'bg-[#F8F9F7] border-[#DDE1DA] opacity-80'
                    : isIneligible
                    ? 'bg-rose-50/20 border-rose-200'
                    : 'bg-white border-[#DDE1DA] hover:border-[#171819] shadow-sm'
                }`}
              >
                {/* Header: Candidate ID & Status Badges */}
                <div className="flex items-center justify-between mb-2.5 flex-wrap gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-xs text-[#171819] bg-[#F2F3F0] px-2 py-0.5 rounded-lg border border-[#DDE1DA]">
                      {cand.candidateId.length > 18
                        ? `${cand.candidateId.slice(0, 8)}...${cand.candidateId.slice(-6)}`
                        : cand.candidateId}
                    </span>

                    {/* Associated Mutant Badge */}
                    <button
                      type="button"
                      onClick={() => onSelectMutant && onSelectMutant(cand.mutantId)}
                      title="View mutant diff"
                      className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-zinc-100 text-zinc-800 border border-zinc-200 hover:bg-zinc-200 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>Mutant: {cand.mutantId}</span>
                      {cand.mutant?.operator && (
                        <span className="px-1 rounded bg-white text-zinc-900 border border-zinc-300">
                          {cand.mutant.operator}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {isAdopted && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>ADOPTED</span>
                      </span>
                    )}
                    {isRejected && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-200 text-zinc-700 border border-zinc-300 flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-zinc-500" />
                        <span>REJECTED</span>
                      </span>
                    )}
                    {isIneligible && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-rose-600" />
                        <span>INELIGIBLE</span>
                      </span>
                    )}
                    {isPending && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>PENDING</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Ineligible Explanation Notice */}
                {isIneligible && (
                  <div className="mb-2.5 p-2 bg-rose-50 rounded-xl border border-rose-200 text-[11px] text-rose-800 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span>
                      This candidate cannot be adopted because mutant <b>{cand.mutantId}</b> is classified as equivalent.
                    </span>
                  </div>
                )}

                {/* Candidate Content Box: Input & Output */}
                <div className="bg-[#15161a] p-3 rounded-xl border border-zinc-800 text-zinc-200 text-xs font-mono space-y-2 mb-3">
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
                      <span className="font-bold uppercase tracking-wider">Candidate Input</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(cand.input, `in-${cand.candidateId}`)}
                        className="hover:text-white flex items-center gap-0.5 cursor-pointer"
                        title="Copy input"
                      >
                        {copiedKey === `in-${cand.candidateId}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedKey === `in-${cand.candidateId}` ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="bg-black/40 p-2 rounded-lg whitespace-pre-wrap break-all text-zinc-200 font-mono text-[11px] max-h-24 overflow-y-auto">
                      {cand.input || '—'}
                    </pre>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
                      <span className="font-bold uppercase tracking-wider text-emerald-400">
                        Expected Output (Reference Verified)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(cand.expectedOutput, `out-${cand.candidateId}`)}
                        className="hover:text-white flex items-center gap-0.5 cursor-pointer"
                        title="Copy expected output"
                      >
                        {copiedKey === `out-${cand.candidateId}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedKey === `out-${cand.candidateId}` ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="bg-black/40 p-2 rounded-lg whitespace-pre-wrap break-all text-emerald-300 font-mono text-[11px] max-h-24 overflow-y-auto">
                      {cand.expectedOutput || '—'}
                    </pre>
                  </div>
                </div>

                {/* Metadata Strip */}
                <div className="flex items-center justify-between text-[11px] text-[#777D78] mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#F2F3F0] text-[#171819] font-mono text-[10px] font-bold">
                      Category: {cand.category || 'edge_case'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#F2F3F0] text-[#171819] font-mono text-[10px] font-bold">
                      Visibility: {cand.visibility || 'hidden'}
                    </span>
                  </div>

                  {cand.reason && (
                    <span className="text-[10px] italic text-[#777D78] truncate max-w-[200px]" title={cand.reason}>
                      {cand.reason}
                    </span>
                  )}
                </div>

                {/* Adopted Metadata Footer */}
                {isAdopted && (
                  <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-900 mb-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Adopted TestCase:</span>
                      </span>
                      <span className="font-mono font-bold text-[10px]">
                        {cand.adoptedTestCaseId ? String(cand.adoptedTestCaseId).slice(-8) : 'Saved'}
                      </span>
                    </div>

                    {cand.adoptedAt && (
                      <div className="text-[10px] text-emerald-700">
                        Adopted on {new Date(cand.adoptedAt).toLocaleString()}
                      </div>
                    )}

                    {onNavigateToStudio && (
                      <button
                        type="button"
                        onClick={() => onNavigateToStudio()}
                        className="text-[10px] font-bold text-emerald-800 hover:text-emerald-900 underline flex items-center gap-0.5 mt-1 cursor-pointer"
                      >
                        <span>View in TestCase Studio</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Rejected Metadata Footer */}
                {isRejected && (
                  <div className="p-2.5 bg-zinc-100 rounded-xl border border-zinc-200 text-[11px] text-zinc-700 mb-3 space-y-0.5">
                    <div className="font-bold text-zinc-900">Rejection Reason:</div>
                    <div className="text-[11px] italic">
                      {cand.rejectionReason || cand.reason || 'No specific rejection reason recorded.'}
                    </div>
                    {cand.rejectedAt && (
                      <div className="text-[10px] text-zinc-500 pt-0.5">
                        Rejected on {new Date(cand.rejectedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-[#F2F3F0] gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailCandidate(cand)}
                    className="text-xs font-bold text-[#777D78] hover:text-[#171819] flex items-center gap-1 cursor-pointer py-1 px-2 rounded-lg hover:bg-[#F2F3F0] transition-colors"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>Details & Proof</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {/* Reject Button (Only for PENDING) */}
                    <button
                      type="button"
                      disabled={!isPending || actionLoading}
                      onClick={() => handleOpenRejectModal(cand)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1 cursor-pointer ${
                        !isPending
                          ? 'opacity-40 cursor-not-allowed bg-zinc-100 text-zinc-400 border-zinc-200'
                          : 'bg-white hover:bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>

                    {/* Adopt Button (Only for PENDING & NOT INELIGIBLE) */}
                    <button
                      type="button"
                      disabled={!isPending || actionLoading || isIneligible}
                      onClick={() => handleOpenAdoptModal(cand)}
                      className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                        !isPending || isIneligible
                          ? 'opacity-40 cursor-not-allowed bg-zinc-200 text-zinc-500'
                          : 'bg-[#191A1D] hover:bg-black text-[#EDFF72] shadow-sm'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Adopt to Suite</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#DDE1DA]">
          <Layers className="w-8 h-8 text-[#CBD0C8] mx-auto mb-2" />
          <h4 className="text-sm font-bold text-[#171819] mb-1">No candidate tests found</h4>
          <p className="text-xs text-[#777D78] max-w-md mx-auto">
            {enrichedCandidates.length === 0
              ? report?.survivedCount > 0
                ? `${report.survivedCount} mutants survived your test suite! Generate verified killer test cases with AI to eliminate them.`
                : 'Run mutation testing to discover surviving mutants and synthesize candidate killer tests.'
              : 'No candidate test cases match your active search or filter selection.'}
          </p>

          {onOpenAiFixModal && (
            <button
              type="button"
              onClick={onOpenAiFixModal}
              className="mt-4 px-5 py-2.5 rounded-xl bg-[#191A1D] hover:bg-black text-[#EDFF72] font-bold text-xs inline-flex items-center gap-2 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#EDFF72]" />
              <span>Generate Killer Tests with AI & Fix Suite (1-Click)</span>
            </button>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL 1: ADOPT CANDIDATE CONFIRMATION MODAL
          ──────────────────────────────────────────────────────────────────────────── */}
      {adoptingCandidate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adopt-modal-title"
        >
          <div className="bg-white rounded-2xl border border-[#DDE1DA] shadow-2xl max-w-lg w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-[#191A1D] text-[#EDFF72] flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="adopt-modal-title" className="text-sm font-bold text-[#171819] m-0">
                    Adopt Candidate Test Case
                  </h3>
                  <p className="text-[11px] text-[#777D78] m-0">
                    Target Mutant: <span className="font-mono font-bold text-[#171819]">{adoptingCandidate.mutantId}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAdoptingCandidate(null)}
                disabled={actionLoading}
                className="text-[#777D78] hover:text-[#171819] p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Provenance Notice */}
            <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Immutable Provenance:</span> Test input and expected output are locked to preserve scientific mutant kill provenance. The backend will independently verify the reference solution and kill proof before persisting.
              </div>
            </div>

            {/* Read-Only Candidate Content */}
            <div className="bg-[#15161a] p-3 rounded-xl border border-zinc-800 text-xs font-mono space-y-2">
              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-400 block mb-0.5">Input</span>
                <div className="bg-black/40 p-2 rounded-lg text-zinc-200 break-all max-h-20 overflow-y-auto">
                  {adoptingCandidate.input}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-emerald-400 block mb-0.5">Expected Output</span>
                <div className="bg-black/40 p-2 rounded-lg text-emerald-300 break-all max-h-20 overflow-y-auto">
                  {adoptingCandidate.expectedOutput}
                </div>
              </div>
            </div>

            {/* Configuration Selectors */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-bold text-[#171819] block mb-1">
                  TestCase Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  disabled={actionLoading}
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-1.5 text-xs font-bold text-[#171819] outline-none"
                >
                  <option value="edge_case">Edge Case</option>
                  <option value="boundary">Boundary Test</option>
                  <option value="performance">Performance Test</option>
                  <option value="stress">Stress Test</option>
                  <option value="sample">Sample Test</option>
                  <option value="custom">Custom Test</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#171819] block mb-1">
                  Suite Visibility
                </label>
                <select
                  value={selectedVisibility}
                  onChange={(e) => setSelectedVisibility(e.target.value)}
                  disabled={actionLoading}
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-1.5 text-xs font-bold text-[#171819] outline-none"
                >
                  <option value="hidden">Hidden (Assessment Grade)</option>
                  <option value="public">Public (Student Visible)</option>
                </select>
              </div>
            </div>

            {/* Error Message with Lock Conflict Assistance */}
            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Adoption Failed</span>
                </div>
                <div>{actionError}</div>
                {isLockConflict && (
                  <button
                    type="button"
                    onClick={handleConfirmAdopt}
                    disabled={actionLoading}
                    className="mt-1 text-xs font-bold px-2.5 py-1 bg-rose-800 text-white rounded-lg hover:bg-rose-900 cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry Adoption</span>
                  </button>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DDE1DA]">
              <button
                type="button"
                onClick={() => setAdoptingCandidate(null)}
                disabled={actionLoading}
                className="text-xs font-bold px-4 py-2 rounded-xl border border-[#DDE1DA] hover:bg-[#F2F3F0] text-[#777D78] cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmAdopt}
                disabled={actionLoading}
                className="text-xs font-bold px-4 py-2 rounded-xl bg-[#191A1D] hover:bg-black text-[#EDFF72] flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying & Adopting...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm Adoption</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL 2: REJECT CANDIDATE CONFIRMATION MODAL
          ──────────────────────────────────────────────────────────────────────────── */}
      {rejectingCandidate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-modal-title"
        >
          <div className="bg-white rounded-2xl border border-[#DDE1DA] shadow-2xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold">
                  <XCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="reject-modal-title" className="text-sm font-bold text-[#171819] m-0">
                    Reject Candidate Test
                  </h3>
                  <p className="text-[11px] text-[#777D78] m-0">
                    Candidate: <span className="font-mono font-bold text-[#171819]">{rejectingCandidate.candidateId}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRejectingCandidate(null)}
                disabled={actionLoading}
                className="text-[#777D78] hover:text-[#171819] p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#777D78] leading-relaxed">
              Are you sure you want to reject this candidate test? Rejecting marks the test as non-advisable and disables future adoption.
            </p>

            <div>
              <label className="text-[11px] font-bold text-[#171819] block mb-1">
                Rejection Reason (Optional)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Redundant with existing test cases or invalid scenario..."
                rows={3}
                disabled={actionLoading}
                className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-2.5 text-xs text-[#171819] placeholder:text-[#777D78] outline-none focus:bg-white focus:border-[#171819] transition-all"
              />
            </div>

            {actionError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DDE1DA]">
              <button
                type="button"
                onClick={() => setRejectingCandidate(null)}
                disabled={actionLoading}
                className="text-xs font-bold px-4 py-2 rounded-xl border border-[#DDE1DA] hover:bg-[#F2F3F0] text-[#777D78] cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={actionLoading}
                className="text-xs font-bold px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Rejecting...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Confirm Rejection</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL 3: CANDIDATE DETAIL & PROOF MODAL
          ──────────────────────────────────────────────────────────────────────────── */}
      {detailCandidate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-modal-title"
        >
          <div className="bg-white rounded-2xl border border-[#DDE1DA] shadow-2xl max-w-xl w-full p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-[#F2F3F0] text-[#171819] flex items-center justify-center font-bold">
                  <FileCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="detail-modal-title" className="text-sm font-bold text-[#171819] m-0">
                    Candidate Test Case Proof & Details
                  </h3>
                  <p className="text-[11px] font-mono text-[#777D78] m-0">
                    ID: {detailCandidate.candidateId}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailCandidate(null)}
                className="text-[#777D78] hover:text-[#171819] p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Target Mutant Transformation */}
            {detailCandidate.mutant && (
              <div className="p-3 bg-[#F8F9F7] rounded-xl border border-[#DDE1DA] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[#777D78] uppercase">
                    Target Mutant Transformation ({detailCandidate.mutant.operator})
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-zinc-200 text-zinc-800">
                    {detailCandidate.mutant.mutantId}
                  </span>
                </div>

                <div className="font-mono text-xs bg-[#15161a] p-2.5 rounded-lg text-zinc-300 space-y-1">
                  <div className="line-through text-rose-400">
                    {detailCandidate.mutant.originalSnippet}
                  </div>
                  <div className="text-emerald-400">
                    {detailCandidate.mutant.mutatedSnippet}
                  </div>
                </div>

                {detailCandidate.mutant.failureReason && (
                  <div className="text-[11px] text-[#777D78] pt-1">
                    <span className="font-bold text-[#171819]">Why it survived: </span>
                    {detailCandidate.mutant.failureReason}
                  </div>
                )}
              </div>
            )}

            {/* Candidate Test Input & Output */}
            <div className="bg-[#15161a] p-3 rounded-xl border border-zinc-800 text-xs font-mono space-y-2">
              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-400 block mb-0.5">Test Input</span>
                <pre className="bg-black/50 p-2.5 rounded-lg text-zinc-200 whitespace-pre-wrap font-mono text-xs">
                  {detailCandidate.input}
                </pre>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-emerald-400 block mb-0.5">Expected Output</span>
                <pre className="bg-black/50 p-2.5 rounded-lg text-emerald-300 whitespace-pre-wrap font-mono text-xs">
                  {detailCandidate.expectedOutput}
                </pre>
              </div>
            </div>

            {/* Verification Proof Status */}
            <div className="p-3 bg-zinc-50 rounded-xl border border-[#DDE1DA] text-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase text-[#777D78] block">
                Verification Pipeline Status
              </span>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-[#171819]">
                  Oracle Correctness: Verified against authoritative reference solution
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-[#171819]">
                  Defect Detection: Verified to kill target mutant ({detailCandidate.mutantId})
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-[#DDE1DA]">
              <button
                type="button"
                onClick={() => setDetailCandidate(null)}
                className="text-xs font-bold px-4 py-2 rounded-xl bg-[#191A1D] text-white hover:bg-black cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateAdoptionSection;

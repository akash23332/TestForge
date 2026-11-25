import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TestTube,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  Search,
  Activity,
  BarChart3,
  SlidersHorizontal,
  Filter,
  ArrowRight,
  Sparkles,
  Layers,
  Code2,
  ShieldCheck,
  Flame,
  Zap,
  Terminal,
  HelpCircle,
  ShieldAlert,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useMutationRun } from './useMutationRun';
import { MutantDiffViewer } from './MutantDiffViewer';
import { SurvivingMutantsCandidateTests } from './SurvivingMutantsCandidateTests';
import { CandidateAdoptionSection } from './CandidateAdoptionSection';
import { AiAutoFixModal } from './AiAutoFixModal';
import {
  classifyMutant as classifyMutantApi,
  adoptCandidateTest as adoptCandidateApi,
  rejectCandidateTest as rejectCandidateApi
} from './mutationLabService';
import {
  SUPPORTED_OPERATORS,
  STATUS_FILTERS,
  filterMutants,
  formatMutationScore,
  calculateProgressPercent
} from './mutationLabHelpers';

// Helper to smoothly count up numbers matching TestForge conventions
const AnimatedCount = ({ value, duration = 600 }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame;
    const start = performance.now();
    const numVal = Number(value) || 0;
    const step = (now) => {
      const elapsed = now - start;
      const k = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(Math.round(numVal * eased));
      if (k < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{display}</>;
};

export const MutationLabView = ({
  questions = [],
  selectedQuestion,
  onSelectQuestion,
  onNavigate
}) => {
  const [currentQ, setCurrentQ] = useState(selectedQuestion || questions[0] || null);
  const [isQuestionDropdownOpen, setIsQuestionDropdownOpen] = useState(false);
  const [questionSearchQuery, setQuestionSearchQuery] = useState('');
  const questionDropdownRef = useRef(null);

  // Sync selected question
  useEffect(() => {
    if (selectedQuestion) {
      setCurrentQ(selectedQuestion);
    } else if (questions.length > 0 && !currentQ) {
      setCurrentQ(questions[0]);
    }
  }, [selectedQuestion, questions]);

  // Outside click listener for question dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (questionDropdownRef.current && !questionDropdownRef.current.contains(e.target)) {
        setIsQuestionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Connect to real backend asynchronous mutation run
  const {
    runId,
    report,
    status,
    progress,
    error,
    isStarting,
    isPolling,
    startRun,
    refreshReport,
    resetRun
  } = useMutationRun(currentQ?._id);

  // Local UI filters and selection
  const [activeLabTab, setActiveLabTab] = useState('explorer'); // 'explorer' | 'candidates'
  const [selectedMutantId, setSelectedMutantId] = useState(null);
  const [selectedOperatorFilter, setSelectedOperatorFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState(null);
  const [isAiFixModalOpen, setIsAiFixModalOpen] = useState(false);

  // 3D Tilt refs
  const heroRef = useRef(null);
  const tiltRef = useRef(null);
  const toastTimerRef = useRef(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2500);
  };

  // Candidate Adoption & Rejection Handlers
  const handleAdoptCandidate = async (candidateId, options = {}) => {
    const qId = currentQ?._id;
    const rId = report?._id || runId;
    if (!qId || !rId || !candidateId) {
      throw new Error('Question ID, Report ID, and Candidate ID are required for adoption.');
    }

    const res = await adoptCandidateApi(qId, rId, candidateId, options);
    if (res?.alreadyAdopted) {
      showToast('Candidate test case was already adopted into question suite.');
    } else {
      showToast('Candidate test case successfully adopted into Question test suite!');
    }
    refreshReport();
    return res;
  };

  const handleRejectCandidate = async (candidateId, options = {}) => {
    const qId = currentQ?._id;
    const rId = report?._id || runId;
    if (!qId || !rId || !candidateId) {
      throw new Error('Question ID, Report ID, and Candidate ID are required for rejection.');
    }

    const res = await rejectCandidateApi(qId, rId, candidateId, options);
    showToast('Candidate test case rejected.');
    refreshReport();
    return res;
  };

  // Mutants from real backend report
  const rawMutants = useMemo(() => {
    return Array.isArray(report?.mutants) ? report.mutants : [];
  }, [report]);

  // Set default selected mutant when mutants list updates
  useEffect(() => {
    if (rawMutants.length > 0) {
      const exists = rawMutants.some((m) => m.mutantId === selectedMutantId);
      if (!exists) {
        setSelectedMutantId(rawMutants[0].mutantId);
      }
    } else {
      setSelectedMutantId(null);
    }
  }, [rawMutants, selectedMutantId]);

  // Filtered mutants list
  const filteredMutants = useMemo(() => {
    return filterMutants(rawMutants, {
      operator: selectedOperatorFilter,
      status: statusFilter,
      search: searchQuery
    });
  }, [rawMutants, selectedOperatorFilter, statusFilter, searchQuery]);

  // Active mutant object
  const activeMutant = useMemo(() => {
    return rawMutants.find((m) => m.mutantId === selectedMutantId) || rawMutants[0] || null;
  }, [rawMutants, selectedMutantId]);

  // 3D Tilt handlers
  const handleHeroMouseMove = (e) => {
    if (!heroRef.current || !tiltRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    tiltRef.current.style.transform = `rotateY(${x * 30}deg) rotateX(${-y * 25}deg)`;
    heroRef.current.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    heroRef.current.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  const handleHeroMouseLeave = () => {
    if (tiltRef.current) {
      tiltRef.current.style.transform = 'rotateY(0deg) rotateX(0deg)';
    }
  };

  // Handle Triggering Run
  const handleTriggerRun = async () => {
    if (!currentQ?._id) {
      showToast('Please select a question first.');
      return;
    }

    showToast('Enqueuing mutation testing run on server...');
    const newRunId = await startRun();
    if (newRunId) {
      showToast(`Run ${newRunId.slice(-6)} enqueued. Monitoring worker progress...`);
    }
  };

  // Handle Equivalent Mutant Classification (Phase 4A.1)
  const handleClassifyMutant = async ({ mutantId, newClassification, reason }) => {
    if (!currentQ?._id || !report?._id) return;
    try {
      await classifyMutantApi(currentQ._id, report._id, mutantId, {
        newClassification,
        reason,
        expectedVersion: report.version ?? report.__v
      });
      showToast(`Mutant classified as ${newClassification} successfully.`);
      if (typeof refreshReport === 'function') {
        await refreshReport(report._id);
      }
    } catch (err) {
      showToast(err.message || 'Failed to update mutant classification');
      throw err;
    }
  };

  const isRunning = status === 'PENDING' || status === 'RUNNING';
  const progressPercent = calculateProgressPercent(progress);
  const formattedScore = formatMutationScore(report?.mutationScore);

  const titleCharacters = 'Mutation Lab'.split('');

  return (
    <div className="tf-ml-root select-none font-sans text-[#171819] pb-16">
      {/* ────────────────────────────────────────────────────────────────────────────
          SCOPED STYLES: TESTFORGE THEME, 3D KINETIC MUTANT HELIX, TECH BENTO
          ──────────────────────────────────────────────────────────────────────────── */}
      <style>{`
        .tf-ml-root {
          --bg: #F2F3F0;
          --card: #ffffff;
          --surf: #E9ECE7;
          --ink: #171819;
          --mute: #777D78;
          --line: #DDE1DA;
          --acc: #EDFF72;
          --ok: #1f9d5a;
          --hard: #e5484d;
          --in: #f4f5f2;
          --mono: "JetBrains Mono", monospace;
          color: var(--ink);
        }
        .tf-ml-root * {
          box-sizing: border-box;
        }

        /* Staggered Rise */
        .tf-ml-root .rise {
          opacity: 0;
          transform: translateY(18px);
          filter: blur(4px);
          animation: mlRise .7s cubic-bezier(.2,.8,.2,1) forwards;
          animation-delay: calc(var(--k, 0) * 80ms + .1s);
        }
        @keyframes mlRise {
          to {
            opacity: 1;
            transform: none;
            filter: none;
          }
        }

        /* Top Grid */
        .tf-ml-root .tf-top {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
          gap: 14px;
          margin-bottom: 14px;
        }
        .tf-ml-root .tf-hero {
          position: relative;
          background: #101112;
          color: #fff;
          border-radius: 28px;
          padding: 30px 34px;
          overflow: hidden;
          min-height: 270px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 20px 40px -20px rgba(0,0,0,0.5);
          isolation: isolate;
        }
        .tf-ml-root .tf-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background: radial-gradient(460px circle at var(--mx, 80%) var(--my, 50%), rgba(237,255,114,.18), transparent 70%);
          transition: background .15s ease-out;
        }
        .tf-ml-root .tf-eyebrow {
          font: 600 11px/1 var(--mono);
          letter-spacing: .14em;
          text-transform: uppercase;
          display: flex;
          gap: 8px;
          align-items: center;
          color: #e3e8e2;
        }
        .tf-ml-root .tf-eyebrow i {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--acc);
          box-shadow: 0 0 0 3px rgba(237,255,114,.25);
        }

        /* Hero Title Staggered Letter Animation */
        .tf-ml-root h1.hero-title {
          font-size: clamp(32px, 4.5vw, 48px);
          margin: 14px 0 8px;
          letter-spacing: -.035em;
          line-height: 1.05;
          font-weight: 700;
          display: flex;
          flex-wrap: wrap;
        }
        .tf-ml-root h1.hero-title span {
          display: inline-block;
          transform: translateY(110%) rotate(6deg);
          opacity: 0;
          animation: mlTitleChar .7s cubic-bezier(.2,.9,.2,1) forwards;
          animation-delay: calc(var(--c) * 35ms + .15s);
        }
        @keyframes mlTitleChar {
          to {
            transform: none;
            opacity: 1;
          }
        }
        .tf-ml-root h1.hero-title .sp2 {
          width: .28em;
        }

        .tf-ml-root .tf-hero p {
          margin: 0 0 16px;
          color: #b7bdb6;
          max-width: 44ch;
          font-size: 14px;
          line-height: 1.5;
        }
        .tf-ml-root .tf-btns {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        .tf-ml-root .tf-btn {
          border: 0;
          cursor: pointer;
          border-radius: 99px;
          padding: 11px 22px;
          font-weight: 600;
          font-size: 13.5px;
          display: inline-flex;
          gap: 8px;
          align-items: center;
          transition: transform .2s, box-shadow .25s, opacity .2s;
        }
        .tf-ml-root .tf-btn:hover:not(:disabled) {
          transform: translateY(-2px);
        }
        .tf-ml-root .tf-btn:active:not(:disabled) {
          transform: scale(.97);
        }
        .tf-ml-root .tf-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .tf-ml-root .tf-btn.pri {
          background: var(--acc);
          color: #111;
          font-weight: 700;
        }
        .tf-ml-root .tf-btn.gh {
          background: #26282b;
          color: #fff;
          border: 1px solid #3a3d41;
        }
        .tf-ml-root .tf-facts {
          display: flex;
          gap: 20px;
          border-top: 1px solid #2b2d30;
          padding-top: 14px;
          margin-top: 18px;
          font-size: 12.5px;
          color: #c8cdc7;
          flex-wrap: wrap;
        }
        .tf-ml-root .tf-facts b {
          color: #fff;
          font-size: 14.5px;
          margin-right: 4px;
        }

        /* 3D Kinetic DNA Helix */
        .tf-ml-root .stage {
          position: absolute;
          right: 20px;
          top: 0;
          bottom: 0;
          width: 44%;
          perspective: 900px;
          display: grid;
          place-items: center;
          pointer-events: none;
          z-index: 1;
        }
        .tf-ml-root .tilt {
          transform-style: preserve-3d;
          transition: transform .14s cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        .tf-ml-root .stage .float {
          animation: mlHelixFloat 4s ease-in-out infinite;
          transform-style: preserve-3d;
        }
        @keyframes mlHelixFloat {
          0%, 100% { transform: translateY(0px) rotateZ(0deg); }
          50% { transform: translateY(-14px) rotateZ(-2deg); }
        }
        .tf-ml-root .helix-rig {
          width: 170px;
          height: 180px;
          position: relative;
          transform-style: preserve-3d;
          transform: rotateX(20deg) rotateY(-15deg);
        }
        .tf-ml-root .helix-spindle {
          width: 100%;
          height: 100%;
          position: relative;
          transform-style: preserve-3d;
          animation: mlHelixSpin 12s linear infinite;
        }
        @keyframes mlHelixSpin {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }
        .tf-ml-root .dna-rung {
          position: absolute;
          left: 10px;
          right: 10px;
          height: 22px;
          transform-style: preserve-3d;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .tf-ml-root .dna-bar {
          position: absolute;
          left: 20px;
          right: 20px;
          top: 10px;
          height: 2px;
          background: linear-gradient(90deg, #EDFF72, rgba(255,255,255,0.4), #EDFF72);
          box-shadow: 0 0 8px rgba(237, 255, 114, 0.5);
        }
        .tf-ml-root .dna-node {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font: 800 9px var(--mono);
          box-shadow: 0 0 12px rgba(237, 255, 114, 0.4);
          z-index: 2;
        }
        .tf-ml-root .node-lime {
          background: #EDFF72;
          color: #101112;
          border: 1.5px solid #ffffff;
        }
        .tf-ml-root .node-dark {
          background: #191A1D;
          color: #EDFF72;
          border: 1.5px solid #363942;
        }
        .tf-ml-root .mutant-core-disc {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 64px;
          height: 64px;
          margin-top: -32px;
          margin-left: -32px;
          border-radius: 50%;
          background: #141518;
          border: 2px solid #EDFF72;
          box-shadow: 0 0 28px rgba(237, 255, 114, 0.5);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          transform: translateZ(28px);
        }
        .tf-ml-root .mutant-orbit {
          position: absolute;
          inset: -16px;
          border-radius: 50%;
          border: 1.5px dashed rgba(237, 255, 114, 0.35);
          animation: mlOrbitCounter 8s linear infinite;
        }
        @keyframes mlOrbitCounter {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        .tf-ml-root .stage .shadow {
          position: absolute;
          bottom: 20px;
          width: 140px;
          height: 22px;
          border-radius: 50%;
          background: rgba(0,0,0,.55);
          filter: blur(10px);
          animation: mlShadow 3.2s ease-in-out infinite;
        }
        @keyframes mlShadow {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(0.72); opacity: 0.28; }
        }

        /* 4 Quick Stats Cards */
        .tf-ml-root .tf-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .tf-ml-root .tf-card {
          background: var(--card);
          border-radius: 28px;
          padding: 18px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,.04);
          border: 1px solid var(--line);
        }
        .tf-ml-root .tf-mini {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 128px;
          position: relative;
          transition: transform .25s ease;
        }
        .tf-ml-root .tf-mini:hover {
          transform: translateY(-2.5px);
        }
        .tf-ml-root .tf-tile {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: var(--surf);
          display: grid;
          place-items: center;
          font: 600 13px var(--mono);
          color: #171819;
        }
        .tf-ml-root .tf-tile.a {
          background: var(--acc);
          color: #111;
        }
        .tf-ml-root .tf-cap {
          font: 600 11px/1 var(--mono);
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--mute);
          margin-top: auto;
        }
        .tf-ml-root .tf-big {
          font-size: 34px;
          font-weight: 700;
          letter-spacing: -.03em;
          line-height: 1;
        }
        .tf-ml-root .tf-sub {
          font-size: 12px;
          color: var(--mute);
        }
        .tf-ml-root .tf-sub.g {
          color: var(--ok);
          font-weight: 600;
        }
        .tf-ml-root .tf-ringm {
          position: absolute;
          right: 16px;
          top: 14px;
          width: 42px;
          height: 42px;
        }
        .tf-ml-root .tf-ringm circle {
          fill: none;
          stroke-width: 6;
          stroke-linecap: round;
        }
        .tf-ml-root .tf-ringm .b {
          stroke: var(--surf);
        }
        .tf-ml-root .tf-ringm .f {
          stroke: #a9c400;
          transition: stroke-dashoffset .8s cubic-bezier(.3,1.3,.5,1);
        }
        .tf-ml-root .tf-ringm svg {
          transform: rotate(-90deg);
        }

        /* 3-Column Workspace Grid */
        .tf-ml-root .tf-workspace {
          display: grid;
          grid-template-columns: 310px minmax(0, 1.45fr) 340px;
          gap: 14px;
          align-items: start;
        }
        .tf-ml-root .tf-col {
          position: sticky;
          top: 12px;
        }

        /* Toast */
        .tf-ml-root .tf-toast {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translate(-50%, 120px);
          background: #111;
          color: #fff;
          padding: 12px 22px;
          border-radius: 99px;
          z-index: 999;
          font-size: 13.5px;
          font-weight: 600;
          box-shadow: 0 12px 32px rgba(0,0,0,0.3);
          transition: transform .4s cubic-bezier(.3,1.4,.5,1);
          pointer-events: none;
        }
        .tf-ml-root .tf-toast.on {
          transform: translate(-50%, 0);
        }

        @media (max-width: 1200px) {
          .tf-ml-root .tf-workspace {
            grid-template-columns: 290px minmax(0, 1fr);
          }
          .tf-ml-root .tf-workspace .right-col {
            grid-column: 1 / -1;
            position: static;
          }
        }
        @media (max-width: 900px) {
          .tf-ml-root .tf-top {
            grid-template-columns: 1fr;
          }
          .tf-ml-root .tf-hero {
            flex-direction: column;
            gap: 20px;
          }
        }
        @media (max-width: 768px) {
          .tf-ml-root .tf-workspace {
            grid-template-columns: 1fr;
          }
          .tf-ml-root .tf-cards {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>

      {/* ────────────────────────────────────────────────────────────────────────────
          TOP QUESTION SELECTOR BAR
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3 bg-white p-3 rounded-2xl border border-[#DDE1DA] shadow-xs">
        <div className="flex items-center gap-2 relative" ref={questionDropdownRef}>
          <span className="text-xs font-bold text-[#777D78] uppercase tracking-wider pl-1">
            Mutation Target:
          </span>
          <button
            type="button"
            onClick={() => setIsQuestionDropdownOpen(!isQuestionDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F2F3F0] hover:bg-[#E9ECE7] border border-[#DDE1DA] text-xs font-bold text-[#171819] transition-all cursor-pointer"
          >
            <TestTube className="w-3.5 h-3.5 text-[#171819]" />
            <span className="max-w-[280px] truncate">{currentQ?.title || 'Select a question...'}</span>
            <ChevronDown className="w-3 h-3 text-[#777D78]" />
          </button>

          {isQuestionDropdownOpen && (
            <div className="absolute top-full left-20 mt-1.5 w-80 bg-white border border-[#DDE1DA] rounded-2xl shadow-xl z-50 p-2 space-y-1">
              <input
                type="text"
                placeholder="Search questions..."
                value={questionSearchQuery}
                onChange={(e) => setQuestionSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl outline-none mb-1 font-medium"
              />
              <div className="max-h-56 overflow-y-auto space-y-1">
                {questions
                  .filter((q) => (q.title || '').toLowerCase().includes(questionSearchQuery.toLowerCase()))
                  .map((q) => (
                    <button
                      key={q._id}
                      type="button"
                      onClick={() => {
                        setCurrentQ(q);
                        if (onSelectQuestion) onSelectQuestion(q);
                        setIsQuestionDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                        q._id === currentQ?._id ? 'bg-[#191A1D] text-white' : 'hover:bg-[#F2F3F0] text-[#171819]'
                      }`}
                    >
                      <span className="truncate pr-2">{q.title}</span>
                      <span className="text-[10px] uppercase font-mono opacity-80">{q.difficulty}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('tests')}
              className="text-xs font-bold text-[#171819] hover:text-black flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#DDE1DA] bg-white hover:bg-[#F2F3F0] transition-colors"
            >
              <span>View Test Studio</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          ERROR BANNER (IF ENCOUNTERED)
          ──────────────────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-3 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={refreshReport}
            className="px-3 py-1 bg-white hover:bg-rose-100 text-rose-900 border border-rose-300 rounded-xl font-bold transition-colors cursor-pointer shrink-0"
          >
            Retry Check
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          TOP BANNER GRID: HERO CARD (3D MUTANT HELIX) + 4 STATS CARDS
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-top">
        {/* Left Hero Card with 3D Mutant Helix */}
        <section
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
          className="tf-hero rise"
          style={{ '--k': 1 }}
        >
          <div style={{ position: 'relative', zIndex: 2, maxWidth: '58%' }}>
            <div className="tf-eyebrow">
              <i />
              Mutation Testing // Suite Robustness
            </div>

            {/* Staggered Animated Title */}
            <h1 className="hero-title" aria-label="Mutation Lab">
              {titleCharacters.map((ch, idx) => (
                <span
                  key={idx}
                  style={{ '--c': idx }}
                  className={ch === ' ' ? 'sp2' : ''}
                >
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              ))}
            </h1>

            <p>Inject syntactical mutants into solution code to measure and reinforce test suite kill efficacy.</p>

            {/* Asynchronous Execution Action Buttons */}
            <div className="tf-btns">
              <button
                type="button"
                onClick={handleTriggerRun}
                disabled={isRunning || isStarting}
                className="tf-btn pri"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing Mutants ({progressPercent}%)</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{report ? 'Rerun Mutation Suite' : 'Run Mutation Analysis'}</span>
                  </>
                )}
              </button>

              {report && (
                <button
                  type="button"
                  onClick={refreshReport}
                  disabled={isStarting}
                  className="tf-btn gh"
                  title="Refresh report state from MongoDB"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Refresh Report</span>
                </button>
              )}

              {report?.survivedCount > 0 && !isRunning && (
                <button
                  type="button"
                  onClick={() => setIsAiFixModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-[#EDFF72] text-[#121212] font-extrabold text-xs flex items-center gap-1.5 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title="Generate killer test cases with AI to eliminate surviving mutants"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-current text-[#121212]" />
                  <span>AI Auto-Heal ({report.survivedCount} Survived)</span>
                </button>
              )}
            </div>

            {/* Live Progress Bar during active run */}
            {isRunning && (
              <div className="mt-4 p-3 bg-zinc-900/90 border border-zinc-700 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#EDFF72] animate-pulse" />
                    <span>Worker Status: {status}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span>
                      {progress.completed || 0} / {progress.total || 0} mutants ({progressPercent}%)
                    </span>
                    <button
                      type="button"
                      onClick={resetRun}
                      title="Reset or cancel stalled run"
                      className="px-2 py-0.5 text-[11px] font-medium text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 rounded-md transition-colors cursor-pointer ml-1"
                    >
                      Reset Run
                    </button>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#EDFF72] transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {Boolean(progress.currentMutant) && (
                  <div className="text-[10px] font-mono text-zinc-400 truncate">
                    Processing {progress.currentMutant} {progress.currentTestCase ? `against ${progress.currentTestCase}` : ''}
                  </div>
                )}
              </div>
            )}

            {/* Live Count Up Facts Bar */}
            <div className="tf-facts">
              <span>
                <b>
                  {formattedScore !== null ? (
                    <AnimatedCount value={formattedScore} />
                  ) : (
                    '--'
                  )}
                  %
                </b>
                mutation score
              </span>
              <span>
                <b><AnimatedCount value={report?.killedCount || 0} /></b>killed
              </span>
              <span>
                <b><AnimatedCount value={report?.survivedCount || 0} /></b>survived
              </span>
              <span>
                <b><AnimatedCount value={report?.totalMutants || 0} /></b>total mutants
              </span>
            </div>
          </div>

          {/* 3D Kinetic DNA Helix & Biohazard Mutation Reactor */}
          <div className="stage" aria-hidden="true">
            <div className="float">
              <div className="tilt" ref={tiltRef}>
                <div className="helix-rig">
                  <div className="mutant-orbit" />
                  
                  {/* Rotating DNA Double Helix Spindle */}
                  <div className="helix-spindle">
                    {/* Rung 1 */}
                    <div className="dna-rung" style={{ top: '10px', transform: 'rotateY(0deg)' }}>
                      <div className="dna-node node-lime">ROR</div>
                      <div className="dna-bar" />
                      <div className="dna-node node-dark">AOR</div>
                    </div>
                    {/* Rung 2 */}
                    <div className="dna-rung" style={{ top: '44px', transform: 'rotateY(45deg)' }}>
                      <div className="dna-node node-dark">RVR</div>
                      <div className="dna-bar" />
                      <div className="dna-node node-lime">COR</div>
                    </div>
                    {/* Rung 3 */}
                    <div className="dna-rung" style={{ top: '78px', transform: 'rotateY(90deg)' }}>
                      <div className="dna-node node-lime">LOR</div>
                      <div className="dna-bar" />
                      <div className="dna-node node-dark">KILL</div>
                    </div>
                    {/* Rung 4 */}
                    <div className="dna-rung" style={{ top: '112px', transform: 'rotateY(135deg)' }}>
                      <div className="dna-node node-dark">OPR</div>
                      <div className="dna-bar" />
                      <div className="dna-node node-lime">PASS</div>
                    </div>
                    {/* Rung 5 */}
                    <div className="dna-rung" style={{ top: '146px', transform: 'rotateY(180deg)' }}>
                      <div className="dna-node node-lime">Δ {formattedScore !== null ? `${formattedScore}%` : 'AST'}</div>
                      <div className="dna-bar" />
                      <div className="dna-node node-dark">SURV</div>
                    </div>
                  </div>

                  {/* Central Floating Biohazard Core Disc */}
                  <div className="mutant-core-disc">
                    <span className="text-[#EDFF72] text-xl font-black leading-none">☣</span>
                    <span className="font-mono text-[8px] font-black text-white uppercase tracking-wider mt-0.5">MUTANT</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="shadow" />
          </div>
        </section>

        {/* Right 2x2 Quick Stats Cards */}
        <div className="tf-cards">
          {/* Card 1: Mutation Robustness Score */}
          <div className="tf-card tf-mini rise" style={{ '--k': 2 }}>
            <div className="tf-tile a">%</div>
            <div className="tf-ringm">
              <svg viewBox="0 0 42 42" width="42" height="42">
                <circle className="b" cx="21" cy="21" r="17" />
                <circle
                  className="f"
                  cx="21"
                  cy="21"
                  r="17"
                  strokeDasharray="107"
                  strokeDashoffset={107 * (1 - (Number(formattedScore) || 0) / 100)}
                />
              </svg>
            </div>
            <div className="tf-cap">Mutation Score</div>
            <div className="tf-big">
              {formattedScore !== null ? (
                <span><AnimatedCount value={formattedScore} />%</span>
              ) : (
                <span className="text-[#777D78] text-2xl">--%</span>
              )}
            </div>
            <div className={`tf-sub ${Number(formattedScore) >= 80 ? 'g' : ''}`}>
              {formattedScore === null
                ? 'No eligible mutants executed'
                : Number(formattedScore) >= 80
                ? 'High Suite Discrimination'
                : 'Test Suite Needs Reinforcement'}
            </div>
          </div>

          {/* Card 2: Mutants Killed */}
          <div className="tf-card tf-mini rise" style={{ '--k': 3 }}>
            <div className="tf-tile">✓</div>
            <div className="tf-cap">Mutants Killed</div>
            <div className="tf-big">
              <AnimatedCount value={report?.killedCount || 0} />
            </div>
            <div className="tf-sub">Caught by existing test assertions</div>
          </div>

          {/* Card 3: Mutants Survived */}
          <div className="tf-card tf-mini rise" style={{ '--k': 4 }}>
            <div className="tf-tile"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /></div>
            <div className="tf-cap">Mutants Survived</div>
            <div className="tf-big" style={{ color: (report?.survivedCount || 0) > 0 ? '#e5484d' : '#171819' }}>
              <AnimatedCount value={report?.survivedCount || 0} />
            </div>
            <div className="tf-sub">
              {(report?.survivedCount || 0) > 0 ? 'Requires killer assertions' : 'Zero test leakage'}
            </div>
          </div>

          {/* Card 4: Syntax Operators */}
          <div className="tf-card tf-mini rise" style={{ '--k': 5 }}>
            <div className="tf-tile">≡</div>
            <div className="tf-cap">Active Operators</div>
            <div className="tf-big">
              <AnimatedCount value={SUPPORTED_OPERATORS.length - 1} />
            </div>
            <div className="tf-sub">AOR, ROR, LOR, COR, RVR</div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          SECONDARY TELEMETRY STRIP (COMPILATION / RUNTIME / TIMEOUT / EQUIVALENT)
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-3 bg-white rounded-2xl border border-[#DDE1DA] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-[#777D78] uppercase block">Equivalent Mutants</span>
            <span className="text-base font-bold text-[#171819]">{report?.equivalentCount || 0}</span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">Excluded</span>
        </div>

        <div className="p-3 bg-white rounded-2xl border border-[#DDE1DA] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-[#777D78] uppercase block">Compilation Errors</span>
            <span className="text-base font-bold text-[#171819]">{report?.compilationErrorCount || 0}</span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">Excluded</span>
        </div>

        <div className="p-3 bg-white rounded-2xl border border-[#DDE1DA] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-[#777D78] uppercase block">Runtime Errors</span>
            <span className="text-base font-bold text-orange-600">{report?.runtimeErrorCount || 0}</span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">Excluded</span>
        </div>

        <div className="p-3 bg-white rounded-2xl border border-[#DDE1DA] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-[#777D78] uppercase block">Timeouts</span>
            <span className="text-base font-bold text-purple-600">{report?.timeoutCount || 0}</span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">Counted</span>
        </div>
      </div>

      {/* View Switcher: Mutant Explorer vs Candidate Adoption Hub */}
      <div className="flex items-center justify-between mb-4 border-b border-[#DDE1DA] pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveLabTab('explorer')}
            className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeLabTab === 'explorer'
                ? 'bg-[#191A1D] text-white shadow-xs'
                : 'bg-white text-[#777D78] border border-[#DDE1DA] hover:bg-[#F2F3F0] hover:text-[#171819]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Mutant Explorer & Code Diff</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveLabTab('candidates')}
            className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeLabTab === 'candidates'
                ? 'bg-[#191A1D] text-[#EDFF72] shadow-xs'
                : 'bg-white text-[#777D78] border border-[#DDE1DA] hover:bg-[#F2F3F0] hover:text-[#171819]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Candidate Test Adoption</span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
              {report?.candidateTests?.length || 0}
            </span>
          </button>
        </div>

        {activeLabTab === 'candidates' && onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('test-cases')}
            className="text-[11px] font-bold text-[#777D78] hover:text-[#171819] flex items-center gap-1 cursor-pointer"
          >
            <span>Open TestCase Studio</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {activeLabTab === 'candidates' ? (
        <CandidateAdoptionSection
          questionId={currentQ?._id}
          runId={report?._id || runId}
          candidates={report?.candidateTests || []}
          mutants={rawMutants}
          report={report}
          onAdoptCandidate={handleAdoptCandidate}
          onRejectCandidate={handleRejectCandidate}
          onOpenAiFixModal={() => setIsAiFixModalOpen(true)}
          onNavigateToStudio={() => onNavigate && onNavigate('test-cases')}
          onSelectMutant={(id) => {
            setSelectedMutantId(id);
            setActiveLabTab('explorer');
          }}
          isRefreshing={isPolling}
        />
      ) : (
        /* ────────────────────────────────────────────────────────────────────────────
            MAIN BODY: 3-COLUMN WORKSPACE
            Col 1: Mutants Ledger | Col 2: Diff Inspector | Col 3: Kill Matrix & Candidates
            ──────────────────────────────────────────────────────────────────────────── */
        <div className="tf-workspace">
        {/* COL 1: Mutants Vault Ledger */}
        <section className="tf-card tf-col rise" style={{ '--k': 6 }} aria-label="Mutants Ledger">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="font-bold text-sm text-[#171819] m-0">Mutants Vault</h3>
            <span className="text-xs font-mono font-bold bg-[#F2F3F0] px-2 py-0.5 rounded-full text-[#777D78]">
              {filteredMutants.length} / {rawMutants.length}
            </span>
          </div>

          {/* Search Input */}
          <div className="relative mb-2.5">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#777D78]" />
            <input
              type="text"
              placeholder="Search mutant, operator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1 text-xs bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl outline-none font-medium"
            />
          </div>

          {/* Status filter pills */}
          <div className="flex gap-1 mb-3 overflow-x-auto pb-1 scrollbar-none">
            {STATUS_FILTERS.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all shrink-0 cursor-pointer ${
                  statusFilter === st.id
                    ? 'bg-[#191A1D] text-white border-[#191A1D]'
                    : 'bg-white text-[#777D78] border-[#DDE1DA] hover:bg-[#F2F3F0]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Mutants list */}
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {filteredMutants.length > 0 ? (
              filteredMutants.map((m) => {
                const isSelected = m.mutantId === activeMutant?.mutantId;
                const isKilled = m.executionStatus === 'KILLED';
                const isSurvived = m.executionStatus === 'SURVIVED';
                return (
                  <div
                    key={m.mutantId}
                    onClick={() => setSelectedMutantId(m.mutantId)}
                    className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#191A1D] text-white border-[#191A1D] shadow-md'
                        : 'bg-[#F2F3F0] hover:bg-[#E9ECE7] border-[#DDE1DA] text-[#171819]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs">{m.mutantId}</span>
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                            isSelected ? 'bg-white/20 text-[#EDFF72]' : 'bg-white text-[#171819] border border-[#DDE1DA]'
                          }`}
                        >
                          {m.operator}
                        </span>
                      </div>

                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                          isKilled
                            ? 'bg-emerald-100 text-emerald-800'
                            : isSurvived
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-zinc-200 text-zinc-800'
                        }`}
                      >
                        {m.executionStatus}
                      </span>
                    </div>

                    <div
                      className={`text-[11px] font-mono truncate mb-0.5 ${
                        isSelected ? 'text-zinc-300' : 'text-[#777D78]'
                      }`}
                    >
                      {m.originalSnippet} → {m.mutatedSnippet}
                    </div>

                    {m.failureReason && (
                      <p
                        className={`text-[10px] truncate m-0 ${
                          isSelected ? 'text-rose-300' : 'text-rose-700'
                        }`}
                      >
                        {m.failureReason}
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-[#777D78]">
                {rawMutants.length === 0 ? (
                  <div>
                    <TestTube className="w-6 h-6 mx-auto mb-2 text-[#CBD0C8]" />
                    <p className="font-bold text-[#171819] mb-1">No mutation runs yet</p>
                    <p className="text-[11px]">Click "Run Mutation Analysis" above to generate and execute controlled AST mutants.</p>
                  </div>
                ) : (
                  <div>No mutants match your active filter.</div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* COL 2: Diff Inspector */}
        <section className="tf-card rise" style={{ '--k': 7 }} aria-label="Mutant Code Diff">
          <MutantDiffViewer
            activeMutant={activeMutant}
            referenceSolution={currentQ?.referenceSolution || currentQ?.starterCode || ''}
            language={currentQ?.language || 'javascript'}
            onClassifyMutant={handleClassifyMutant}
            isRunning={isRunning}
          />
        </section>

        {/* COL 3: Kill Matrix & Candidate Tests */}
        <section className="tf-card tf-col right-col rise" style={{ '--k': 8 }} aria-label="Operators & Candidates">
          <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA] mb-3">
            <h3 className="font-bold text-sm text-[#171819] m-0">Operator Filter</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#EDFF72] text-[#191A1D]">
              AST 5-OPR
            </span>
          </div>

          <div className="space-y-4">
            {/* Operator filter buttons */}
            <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA]">
              <span className="text-[10px] font-mono font-bold uppercase text-[#777D78] block mb-1.5">
                AST Mutation Category
              </span>
              <div className="flex flex-wrap gap-1">
                {SUPPORTED_OPERATORS.map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setSelectedOperatorFilter(op.id)}
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                      selectedOperatorFilter === op.id
                        ? 'bg-[#191A1D] text-white border-[#191A1D]'
                        : 'bg-white text-[#777D78] border-[#DDE1DA] hover:bg-[#E9ECE7]'
                    }`}
                    title={op.description}
                  >
                    {op.abbr}
                  </button>
                ))}
              </div>
            </div>

            {/* Dedicated Surviving Mutants and Synthesized Candidate Tests (Part 8) */}
            <div className="pt-2 border-t border-[#DDE1DA]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-[#171819] flex items-center gap-1.5 m-0">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Surviving Mutants & Candidates</span>
                </h4>
                <span className="text-[10px] font-mono font-bold text-[#777D78]">
                  {report?.survivedCount || 0} survived
                </span>
              </div>

              <SurvivingMutantsCandidateTests
                mutants={rawMutants}
                candidateTests={report?.candidateTests || []}
                selectedMutantId={selectedMutantId}
                onSelectMutant={(id) => setSelectedMutantId(id)}
                onAdoptCandidate={() => setActiveLabTab('candidates')}
                onRejectCandidate={() => setActiveLabTab('candidates')}
                onOpenAdoptionTab={() => setActiveLabTab('candidates')}
              />
            </div>
          </div>
        </section>
      </div>
      )}

      {/* Floating Status Toast */}
      <div className={`tf-toast ${toastMsg ? 'on' : ''}`} role="status">
        {toastMsg}
      </div>

      {/* 1-Click AI Auto-Heal & Killer Test Generator Modal */}
      <AiAutoFixModal
        isOpen={isAiFixModalOpen}
        onClose={() => setIsAiFixModalOpen(false)}
        question={currentQ}
        report={report}
        onRunStarted={handleTriggerRun}
        showToast={showToast}
      />
    </div>
  );
};

export default MutationLabView;

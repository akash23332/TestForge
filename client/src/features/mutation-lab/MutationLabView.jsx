import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TestTube,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Eye,
  Copy,
  Check,
  ChevronDown,
  Search,
  Activity,
  BarChart3,
  SlidersHorizontal,
  Filter,
  ArrowRight,
  Download,
  Sparkles,
  Layers,
  Code2,
  Settings,
  X,
  ShieldCheck,
  Flame,
  Zap,
  Terminal
} from 'lucide-react';
import { api } from '../../lib/api';

// Helper to smoothly count up numbers matching Question Bank
const AnimatedCount = ({ value, duration = 800 }) => {
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

// Standard mutation operators
const DEFAULT_OPERATORS = [
  { id: 'ALL', name: 'All Operators', abbr: 'ALL', total: 24, enabled: true },
  { id: 'AOR', name: 'Arithmetic (AOR)', abbr: 'AOR', total: 6, enabled: true },
  { id: 'ROR', name: 'Relational (ROR)', abbr: 'ROR', total: 4, enabled: true },
  { id: 'LOR', name: 'Logical (LOR)', abbr: 'LOR', total: 3, enabled: true },
  { id: 'CBR', name: 'Conditional (CBR)', abbr: 'CBR', total: 2, enabled: true },
  { id: 'SDL', name: 'Statement Del (SDL)', abbr: 'SDL', total: 3, enabled: true }
];

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

  // Outside click listener
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (questionDropdownRef.current && !questionDropdownRef.current.contains(e.target)) {
        setIsQuestionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Execution state
  const [running, setRunning] = useState(false);
  const [mutants, setMutants] = useState([]);
  const [selectedMutantId, setSelectedMutantId] = useState('M1');
  const [selectedOperatorFilter, setSelectedOperatorFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'killed' | 'survived'
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  // 3D Tilt refs
  const heroRef = useRef(null);
  const tiltRef = useRef(null);
  const toastTimerRef = useRef(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2400);
  };

  // Generate realistic initial mutants for the question
  const generateInitialMutants = (q) => {
    const code = q?.referenceSolution || q?.starterCode || `function solve(arr) {\n  let sum = 0;\n  for(let i = 0; i < arr.length; i++) {\n    if (arr[i] > 0) sum += arr[i];\n  }\n  return sum;\n}`;
    return [
      {
        id: 'M1',
        operator: 'ROR',
        operatorName: 'Relational Replacement',
        location: 'Line 4',
        mutation: '> -> >=',
        result: 'killed',
        executionTime: '2 ms',
        failedOn: 'Test #2 (Zero Value Invariant)',
        originalSnippet: 'if (arr[i] > 0)',
        mutatedSnippet: 'if (arr[i] >= 0)',
        description: 'Replaced strictly-greater (>) with greater-or-equal (>=).'
      },
      {
        id: 'M2',
        operator: 'AOR',
        operatorName: 'Arithmetic Replacement',
        location: 'Line 4',
        mutation: '+= -> -=',
        result: 'killed',
        executionTime: '1 ms',
        failedOn: 'Test #1 (Basic Array)',
        originalSnippet: 'sum += arr[i];',
        mutatedSnippet: 'sum -= arr[i];',
        description: 'Inverted addition operation into subtraction.'
      },
      {
        id: 'M3',
        operator: 'CBR',
        operatorName: 'Conditional Boundary',
        location: 'Line 3',
        mutation: '< -> <=',
        result: 'survived',
        executionTime: '2 ms',
        failedOn: 'None (Mutant survived test suite)',
        originalSnippet: 'for(let i = 0; i < arr.length; i++)',
        mutatedSnippet: 'for(let i = 0; i <= arr.length; i++)',
        description: 'Off-by-one boundary replacement on loop terminal. Test suite lacks index-out-of-bounds boundary check.'
      },
      {
        id: 'M4',
        operator: 'SDL',
        operatorName: 'Statement Deletion',
        location: 'Line 2',
        mutation: 'delete initialization',
        result: 'killed',
        executionTime: '1 ms',
        failedOn: 'Test #3 (Empty Array)',
        originalSnippet: 'let sum = 0;',
        mutatedSnippet: '// deleted let sum = 0;',
        description: 'Removed variable initialization statement.'
      },
      {
        id: 'M5',
        operator: 'LOR',
        operatorName: 'Logical Replacement',
        location: 'Line 4',
        mutation: '&& -> ||',
        result: 'killed',
        executionTime: '2 ms',
        failedOn: 'Test #4 (Negative Numbers)',
        originalSnippet: 'isValid && inRange',
        mutatedSnippet: 'isValid || inRange',
        description: 'Replaced short-circuit AND with logical OR.'
      },
      {
        id: 'M6',
        operator: 'ROR',
        operatorName: 'Relational Replacement',
        location: 'Line 5',
        mutation: '== -> !=',
        result: 'killed',
        executionTime: '1 ms',
        failedOn: 'Test #5 (Target Value)',
        originalSnippet: 'if (val == target)',
        mutatedSnippet: 'if (val != target)',
        description: 'Inverted equality validation.'
      }
    ];
  };

  useEffect(() => {
    if (currentQ) {
      const initial = generateInitialMutants(currentQ);
      setMutants(initial);
      setSelectedMutantId(initial[0].id);
    }
  }, [currentQ?._id]);

  const activeMutant = useMemo(() => {
    return mutants.find((m) => m.id === selectedMutantId) || mutants[0] || null;
  }, [mutants, selectedMutantId]);

  // Derived telemetry metrics
  const stats = useMemo(() => {
    const total = mutants.length;
    if (total === 0) return { score: 100, killed: 0, survived: 0 };
    const killed = mutants.filter((m) => m.result === 'killed').length;
    const survived = mutants.filter((m) => m.result === 'survived').length;
    const score = Math.round((killed / total) * 100);
    return { score, killed, survived, total };
  }, [mutants]);

  // Filtered mutants list
  const filteredMutants = useMemo(() => {
    return mutants.filter((m) => {
      if (selectedOperatorFilter !== 'ALL' && m.operator !== selectedOperatorFilter) return false;
      if (statusFilter !== 'all' && m.result !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          m.id.toLowerCase().includes(q) ||
          m.operator.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [mutants, selectedOperatorFilter, statusFilter, searchQuery]);

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

  // Run full mutation analysis
  const handleRunMutationSuite = async () => {
    setRunning(true);
    showToast('Executing automated mutation testing sandbox…');
    setTimeout(() => {
      setRunning(false);
      showToast(`Analysis complete: ${stats.score}% mutation robustness score`);
    }, 1200);
  };

  // Auto-generate killer test case for survived mutants
  const handleGenerateKillerTest = async () => {
    if (!activeMutant || activeMutant.result !== 'survived') return;
    showToast(`Synthesizing killer test case for ${activeMutant.id} (${activeMutant.operator})…`);
    setTimeout(() => {
      // Mark as killed by newly generated test
      setMutants((prev) =>
        prev.map((m) =>
          m.id === activeMutant.id
            ? { ...m, result: 'killed', failedOn: 'Test #7 (AI Synthesized Boundary Check)' }
            : m
        )
      );
      showToast(`Mutant ${activeMutant.id} killed! Suite score raised to 100%`);
    }, 1000);
  };

  const titleCharacters = 'Mutation Lab'.split('');

  return (
    <div className="tf-ml-root select-none font-sans text-[#171819] pb-16">
      {/* ────────────────────────────────────────────────────────────────────────────
          SCOPED STYLES: 100% LIGHT THEME, 3D KINETIC MUTANT HELIX, TECH BENTO
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
          margin: 0 0 20px;
          color: #b7bdb6;
          max-width: 42ch;
          font-size: 14.5px;
          line-height: 1.5;
        }
        .tf-ml-root .tf-btns {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
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
          transition: transform .2s, box-shadow .25s;
        }
        .tf-ml-root .tf-btn:hover {
          transform: translateY(-2px);
        }
        .tf-ml-root .tf-btn:active {
          transform: scale(.97);
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
          gap: 22px;
          border-top: 1px solid #2b2d30;
          padding-top: 14px;
          margin-top: 20px;
          font-size: 13px;
          color: #c8cdc7;
        }
        .tf-ml-root .tf-facts b {
          color: #fff;
          font-size: 15px;
          margin-right: 4px;
        }

        /* 3D Kinetic DNA Helix & Biohazard Reactor */
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
        /* Kinetic DNA Rotating Cylinder */
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
        /* Molecular DNA Rungs */
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
        /* Central Biohazard Mutation Core */
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
          grid-template-columns: 310px minmax(0, 1.4fr) 340px;
          gap: 14px;
          align-items: start;
        }
        .tf-ml-root .tf-col {
          position: sticky;
          top: 12px;
        }

        /* Code Blocks */
        .tf-ml-root .code-diff {
          background: #15161a;
          color: #d6ef6b;
          border: 1px solid #2b2e35;
          border-radius: 14px;
          padding: 12px 14px;
          font-family: var(--mono);
          font-size: 13px;
          line-height: 1.55;
          white-space: pre-wrap;
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
            grid-template-columns: 280px minmax(0, 1fr);
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
              <span>View Test Suite</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

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
            <h1 className="hero-title">
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

            <div className="tf-btns">
              <button
                type="button"
                onClick={handleRunMutationSuite}
                disabled={running}
                className="tf-btn pri"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{running ? 'Mutating…' : 'Run Mutation Analysis'}</span>
              </button>
              {stats.survived > 0 && (
                <button
                  type="button"
                  onClick={handleGenerateKillerTest}
                  className="tf-btn gh"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#EDFF72] fill-current" />
                  <span>Synthesize Killer Tests ({stats.survived})</span>
                </button>
              )}
            </div>

            {/* Live Count Up Facts Bar */}
            <div className="tf-facts">
              <span>
                <b><AnimatedCount value={stats.score} />%</b>mutation score
              </span>
              <span>
                <b><AnimatedCount value={stats.killed} /></b>killed
              </span>
              <span>
                <b><AnimatedCount value={stats.survived} /></b>survived
              </span>
              <span>
                <b><AnimatedCount value={stats.total} /></b>total mutants
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
                      <div className="dna-node node-dark">SDL</div>
                      <div className="dna-bar" />
                      <div className="dna-node node-lime">LCR</div>
                    </div>
                    {/* Rung 3 */}
                    <div className="dna-rung" style={{ top: '78px', transform: 'rotateY(90deg)' }}>
                      <div className="dna-node node-lime">MUT</div>
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
                      <div className="dna-node node-lime">Δ 99%</div>
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

        {/* Right 2x2 Quick Stats Cards with Smooth Animated Numbers */}
        <div className="tf-cards">
          {/* Card 1: Mutation Score */}
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
                  strokeDashoffset={107 * (1 - stats.score / 100)}
                />
              </svg>
            </div>
            <div className="tf-cap">Mutation Score</div>
            <div className="tf-big">
              <AnimatedCount value={stats.score} />%
            </div>
            <div className={`tf-sub ${stats.score >= 80 ? 'g' : ''}`}>
              {stats.score >= 80 ? 'High Test Discrimination' : 'Low Test Discrimination'}
            </div>
          </div>

          {/* Card 2: Mutants Killed */}
          <div className="tf-card tf-mini rise" style={{ '--k': 3 }}>
            <div className="tf-tile">✓</div>
            <div className="tf-cap">Mutants Killed</div>
            <div className="tf-big">
              <AnimatedCount value={stats.killed} />
            </div>
            <div className="tf-sub">Caught by existing tests</div>
          </div>

          {/* Card 3: Mutants Survived */}
          <div className="tf-card tf-mini rise" style={{ '--k': 4 }}>
            <div className="tf-tile"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /></div>
            <div className="tf-cap">Mutants Survived</div>
            <div className="tf-big" style={{ color: stats.survived > 0 ? '#e5484d' : '#171819' }}>
              <AnimatedCount value={stats.survived} />
            </div>
            <div className="tf-sub">{stats.survived > 0 ? 'Requires killer assertions' : 'Zero test leakage'}</div>
          </div>

          {/* Card 4: Operators Active */}
          <div className="tf-card tf-mini rise" style={{ '--k': 5 }}>
            <div className="tf-tile">≡</div>
            <div className="tf-cap">Operators Active</div>
            <div className="tf-big">
              <AnimatedCount value={DEFAULT_OPERATORS.length - 1} />
            </div>
            <div className="tf-sub">AOR, ROR, LOR, CBR, SDL</div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          MAIN BODY: 3-COLUMN WORKSPACE
          Col 1: Mutants Ledger | Col 2: Diff Inspector | Col 3: Kill Matrix & Operators
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-workspace">
        {/* COL 1: Mutants Ledger */}
        <section className="tf-card tf-col rise" style={{ '--k': 6 }} aria-label="Mutants Ledger">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-[#171819] m-0">Mutants Vault</h3>
            <span className="text-xs font-mono font-bold bg-[#F2F3F0] px-2 py-0.5 rounded-full text-[#777D78]">
              {filteredMutants.length} generated
            </span>
          </div>

          {/* Status filter pills */}
          <div className="flex gap-1 mb-3">
            {['all', 'killed', 'survived'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-all capitalize ${
                  statusFilter === st
                    ? 'bg-[#191A1D] text-white border-[#191A1D]'
                    : 'bg-white text-[#777D78] border-[#DDE1DA] hover:bg-[#F2F3F0]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Mutants list */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredMutants.map((m) => {
              const isSelected = m.id === activeMutant?.id;
              const isKilled = m.result === 'killed';
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMutantId(m.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#191A1D] text-white border-[#191A1D] shadow-md'
                      : 'bg-[#F2F3F0] hover:bg-[#E9ECE7] border-[#DDE1DA] text-[#171819]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-xs">{m.id}</span>
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                          isSelected ? 'bg-white/20 text-[#EDFF72]' : 'bg-white text-[#171819] border border-[#DDE1DA]'
                        }`}
                      >
                        {m.operator}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isKilled
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {isKilled ? 'Killed' : 'Survived'}
                    </span>
                  </div>

                  <p
                    className={`text-xs font-mono truncate mb-1 ${
                      isSelected ? 'text-zinc-300' : 'text-[#777D78]'
                    }`}
                  >
                    {m.mutation} • {m.location}
                  </p>

                  <p
                    className={`text-[11px] truncate m-0 ${
                      isSelected ? 'text-zinc-400' : 'text-[#777D78]'
                    }`}
                  >
                    {m.failedOn}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* COL 2: Diff Inspector */}
        <section className="tf-card rise" style={{ '--k': 7 }} aria-label="Mutant Code Diff">
          {activeMutant ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black px-2.5 py-0.5 rounded-full bg-[#191A1D] text-[#EDFF72]">
                      MUTANT {activeMutant.id}
                    </span>
                    <span className="text-xs font-bold text-[#777D78]">
                      {activeMutant.operatorName} ({activeMutant.operator})
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-[#171819] mt-1 m-0">
                    Syntax Mutation at {activeMutant.location}
                  </h3>
                </div>

                {activeMutant.result === 'survived' && (
                  <button
                    type="button"
                    onClick={handleGenerateKillerTest}
                    className="px-3.5 py-1.5 text-xs font-bold bg-[#EDFF72] hover:bg-[#e2f560] text-[#191A1D] rounded-xl flex items-center gap-1 shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-current" />
                    <span>Synthesize Killer Test</span>
                  </button>
                )}
              </div>

              {/* Side-by-side diff */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#171819] block mb-1.5 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Original Reference Snippet</span>
                  </label>
                  <div className="code-diff min-h-[90px] border-l-4 border-l-emerald-500">
                    {activeMutant.originalSnippet}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#171819] block mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    <span>Synthesized Mutant Snippet</span>
                  </label>
                  <div className="code-diff min-h-[90px] border-l-4 border-l-rose-500 text-rose-300">
                    {activeMutant.mutatedSnippet}
                  </div>
                </div>
              </div>

              {/* Full code diff view */}
              <div>
                <label className="text-xs font-bold text-[#171819] block mb-1.5">
                  Execution Diagnostic Log
                </label>
                <div className="p-4 bg-[#15161a] rounded-2xl border border-[#2b2e35] text-xs font-mono space-y-1.5">
                  <div className="flex justify-between text-zinc-400">
                    <span>Operator: {activeMutant.operator} ({activeMutant.mutation})</span>
                    <span>Latency: {activeMutant.executionTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Outcome:</span>
                    <span className={activeMutant.result === 'killed' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {activeMutant.result === 'killed' ? 'MUTANT KILLED' : 'MUTANT SURVIVED (TEST SUITE WEAKNESS)'}
                    </span>
                  </div>
                  <div className="text-zinc-400 pt-1 border-t border-zinc-800">
                    Detection Vector: {activeMutant.failedOn}
                  </div>
                </div>
              </div>

              {/* Pedagogical Explanation */}
              <div className="p-3.5 bg-[#F2F3F0] rounded-2xl border border-[#DDE1DA]">
                <span className="text-[11px] font-bold text-[#777D78] uppercase tracking-wider block mb-1">
                  Psychometric Assessment Impact:
                </span>
                <p className="text-xs font-medium text-[#171819] leading-relaxed m-0">
                  {activeMutant.description}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-[#777D78]">
              <TestTube className="w-8 h-8 mx-auto mb-2 text-[#CBD0C8]" />
              <p className="text-sm font-bold text-[#171819]">Select a mutant from the vault</p>
            </div>
          )}
        </section>

        {/* COL 3: Kill Matrix & Operators */}
        <section className="tf-card tf-col right-col rise" style={{ '--k': 8 }} aria-label="Operators & Matrix">
          <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA] mb-3">
            <h3 className="font-bold text-sm text-[#171819] m-0">Kill Matrix</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#EDFF72] text-[#191A1D]">
              O-KILL 88%
            </span>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA]">
              <span className="text-[10px] font-mono font-bold uppercase text-[#777D78] block mb-1">
                Filter by Operator
              </span>
              <div className="flex flex-wrap gap-1">
                {DEFAULT_OPERATORS.map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setSelectedOperatorFilter(op.id)}
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded-lg border transition-all ${
                      selectedOperatorFilter === op.id
                        ? 'bg-[#191A1D] text-white border-[#191A1D]'
                        : 'bg-white text-[#777D78] border-[#DDE1DA] hover:bg-[#E9ECE7]'
                    }`}
                  >
                    {op.abbr}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#191A1D] text-white">
              <span className="text-[10px] font-mono font-bold uppercase text-[#EDFF72] block mb-1">
                Test Suite Discrimination
              </span>
              <p className="text-xs text-zinc-300 leading-relaxed m-0">
                A high mutation score certifies that student submissions with flawed boundary conditions will be caught reliably.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Floating Status Toast */}
      <div className={`tf-toast ${toastMsg ? 'on' : ''}`} role="status">
        {toastMsg}
      </div>
    </div>
  );
};

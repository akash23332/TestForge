import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart3,
  TrendingUp,
  Award,
  Users,
  CheckCircle2,
  AlertTriangle,
  Download,
  Filter,
  PieChart,
  Calendar,
  Layers,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Brain
} from 'lucide-react';
import { api } from '../../lib/api';

// Smooth number counter transition
const AnimatedCount = ({ value, duration = 900 }) => {
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

export const AnalyticsView = () => {
  const [timeRange, setTimeRange] = useState('30d');
  const [cohort, setCohort] = useState('ALL');

  const heroRef = useRef(null);
  const tiltRef = useRef(null);

  // Score distribution bins
  const scoreBuckets = [
    { range: '90-100%', count: 48, pct: 40, label: 'Distinction' },
    { range: '80-89%', count: 36, pct: 30, label: 'First Class' },
    { range: '70-79%', count: 22, pct: 18, label: 'Second Class' },
    { range: '60-69%', count: 10, pct: 8, label: 'Pass' },
    { range: '<60%', count: 4, pct: 4, label: 'Remedial' }
  ];

  // Question Discrimination Matrix
  const questionMetrics = [
    { id: 'Q1', title: 'Binary Search Tree Balancing', type: 'Coding', difficulty: 'Medium', discrimination: 0.78, passRate: 84 },
    { id: 'Q2', title: 'Dynamic Programming Memoization', type: 'Coding', difficulty: 'Hard', discrimination: 0.85, passRate: 62 },
    { id: 'Q3', title: 'Hash Table Collision Strategy', type: 'MCQ', difficulty: 'Easy', discrimination: 0.42, passRate: 94 },
    { id: 'Q4', title: 'Dijkstra Path Optimization', type: 'Coding', difficulty: 'Hard', discrimination: 0.91, passRate: 58 },
    { id: 'Q5', title: 'LIFO Stack Property', type: 'MCQ', difficulty: 'Easy', discrimination: 0.38, passRate: 98 }
  ];

  // Gyro Tilt
  const handleHeroMouseMove = (e) => {
    if (!heroRef.current || !tiltRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    tiltRef.current.style.transform = `rotateX(${-y * 18}deg) rotateY(${x * 24}deg)`;
  };

  const handleHeroMouseLeave = () => {
    if (!tiltRef.current) return;
    tiltRef.current.style.transform = 'rotateX(0deg) rotateY(0deg)';
  };

  return (
    <div className="tf-analytics-root select-none font-sans text-[#171819] pb-16">
      {/* ────────────────────────────────────────────────────────────────────────────
          SCOPED STYLES: 100% LIGHT THEME, 3D ANALYTICAL RADAR, QUESTION BANK MOTIONS
          ──────────────────────────────────────────────────────────────────────────── */}
      <style>{`
        .tf-analytics-root {
          --canvas: #F2F3F0;
          --card: #FFFFFF;
          --line: #DDE1DA;
          --ink: #171819;
          --mute: #777D78;
          --acc: #EDFF72;
          --dark: #101112;
        }

        /* Top 2-Column Banner Grid */
        .tf-analytics-root .tf-top {
          display: grid;
          grid-template-columns: 1.55fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        @media (max-width: 1024px) {
          .tf-analytics-root .tf-top {
            grid-template-columns: 1fr;
          }
        }

        /* Bento Cards */
        .tf-analytics-root .tf-card {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 28px;
          position: relative;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }

        /* Hero Bento Card */
        .tf-analytics-root .tf-hero {
          background: #101112;
          color: #ffffff;
          padding: 32px 36px;
          border-radius: 32px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 290px;
          position: relative;
          overflow: hidden;
          border: 1px solid #232528;
        }

        /* Staggered Title Animations */
        .tf-analytics-root .hero-title {
          font-size: clamp(32px, 3.4vw, 46px);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.05;
          margin: 6px 0 10px;
          display: flex;
          flex-wrap: wrap;
        }
        .tf-analytics-root .tfTitleChar {
          display: inline-block;
          animation: tfCharIn 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
          animation-delay: calc(var(--ci) * 0.025s);
        }
        @keyframes tfCharIn {
          from {
            opacity: 0;
            transform: translateY(14px) rotate(4deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
        }

        /* 3D Radar Stage - Aligned like Create Question */
        .tf-analytics-root .stage {
          position: absolute;
          right: 12px;
          top: 0;
          bottom: 0;
          width: 46%;
          perspective: 850px;
          display: grid;
          place-items: center;
          pointer-events: none;
          z-index: 1;
        }
        .tf-analytics-root .stage .float {
          animation: tfRadarFloat 3.2s ease-in-out infinite;
          transform-style: preserve-3d;
        }
        @keyframes tfRadarFloat {
          0%, 100% {
            transform: translateY(0px) rotateZ(0deg);
          }
          50% {
            transform: translateY(-16px) rotateZ(-3deg);
          }
        }
        .tf-analytics-root .tilt {
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform .12s ease-out;
          display: grid;
          place-items: center;
        }
        .tf-analytics-root .radar-disc {
          width: 160px;
          height: 160px;
          position: relative;
          transform-style: preserve-3d;
          transform: rotateX(55deg) rotateZ(25deg);
        }
        .tf-analytics-root .radar-ring-1 {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2.5px solid rgba(237, 255, 114, 0.6);
          box-shadow: 0 0 24px rgba(237, 255, 114, 0.3);
        }
        .tf-analytics-root .radar-ring-2 {
          position: absolute;
          inset: 28px;
          border-radius: 50%;
          border: 2px dashed rgba(255, 255, 255, 0.4);
        }
        .tf-analytics-root .radar-beam {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 80px;
          height: 2.5px;
          background: linear-gradient(90deg, #EDFF72, transparent);
          transform-origin: left center;
          animation: tfSweep 4s linear infinite;
        }
        .tf-analytics-root .stage .shadow {
          position: absolute;
          bottom: 24px;
          width: 140px;
          height: 22px;
          border-radius: 50%;
          background: rgba(0,0,0,.55);
          filter: blur(10px);
          animation: tfShadow 3.2s ease-in-out infinite;
        }
        @keyframes tfShadow {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(0.72); opacity: 0.28; }
        }
        @keyframes tfSweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* 2x2 Telemetry Cards */
        .tf-analytics-root .tf-quad {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .tf-analytics-root .tf-mini {
          padding: 22px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 136px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .tf-analytics-root .tf-mini:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.04);
        }
        .tf-analytics-root .tf-tile {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          background: #F2F3F0;
          border: 1px solid var(--line);
          display: grid;
          place-items: center;
          font-size: 14px;
          font-weight: 800;
          color: var(--ink);
          margin-bottom: 8px;
        }
        .tf-analytics-root .tf-cap {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .tf-analytics-root .tf-big {
          font-size: 32px;
          font-weight: 900;
          letter-spacing: -0.03em;
          color: var(--ink);
          line-height: 1;
        }
        .tf-analytics-root .tf-sub {
          font-size: 11px;
          font-weight: 600;
          color: var(--mute);
          margin-top: 4px;
        }

        /* Rise Entrance Animations */
        .tf-analytics-root .rise {
          animation: tfRise 0.45s ease backwards;
          animation-delay: calc(var(--k, 0) * 0.06s);
        }
        @keyframes tfRise {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* ────────────────────────────────────────────────────────────────────────────
          TOP 2-COLUMN BANNER GRID: HERO CARD + 4 STATS CARDS
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-top">
        {/* Left Hero Card with 3D Radar Visual */}
        <section
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
          className="tf-hero rise"
          style={{ '--k': 1 }}
        >
          <div className="max-w-[520px] relative z-10">
            {/* Pill Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1c1d22] border border-[#2d3036] text-[11px] font-mono font-bold tracking-wider text-[#d5dbd2] uppercase mb-2">
              <span className="w-2 h-2 rounded-full bg-[#EDFF72] shadow-[0_0_8px_#EDFF72]" />
              INSTITUTIONAL PERFORMANCE MATRIX
            </div>

            {/* Animated Staggered Character Title */}
            <h1 className="hero-title" aria-label="Analytics Studio">
              {'Analytics Studio'.split('').map((ch, i) => (
                <span key={i} className="tfTitleChar" style={{ '--ci': i }}>
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              ))}
            </h1>

            <p className="text-xs text-[#a0a59e] max-w-[440px] leading-relaxed mb-6">
              Audit score distributions, quantify question discrimination indices, evaluate Bloom's taxonomy performance, and export accredited gradebooks.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2.5 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-xs font-black text-[#101112] shadow-sm transition-transform active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Export Report</span>
              </button>

              <button
                type="button"
                className="px-4 py-2.5 rounded-full bg-[#1c1d22] hover:bg-[#252830] text-xs font-bold text-white border border-[#30333d] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <TrendingUp className="w-3.5 h-3.5 text-[#a0a59e]" />
                <span>Pacing Index</span>
              </button>
            </div>
          </div>

          {/* Footer Telemetry Strip */}
          <div className="pt-4 border-t border-[#23252a] flex items-center gap-5 text-xs text-[#8c9289] font-mono relative z-10 flex-wrap">
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={120} /></b> submissions
            </span>
            <span>
              <b className="text-[#EDFF72] font-sans text-sm"><AnimatedCount value={82} />%</b> mean score
            </span>
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={94} />%</b> pass rate
            </span>
            <span>
              <b className="text-white font-sans text-sm">0.76</b> discrimination
            </span>
          </div>

          {/* 3D Radar Stage with Gyro Tilt */}
          <div className="stage" aria-hidden="true">
            <div className="float">
              <div className="tilt" ref={tiltRef}>
                <div className="radar-disc">
                  <div className="radar-ring-1" />
                  <div className="radar-ring-2" />
                  <div className="radar-beam" />
                </div>
              </div>
            </div>
            <div className="shadow" />
          </div>
        </section>

        {/* Right 2x2 Telemetry Cards Grid */}
        <div className="tf-quad">
          {/* Card 1: Total Evaluated */}
          <div className="tf-card tf-mini rise" style={{ '--k': 2 }}>
            <div className="tf-tile">
              <BarChart3 className="w-4 h-4 text-[#171819]" />
            </div>
            <div className="tf-cap">Evaluated Attempts</div>
            <div className="tf-big">
              <AnimatedCount value={120} />
            </div>
            <div className="tf-sub">Automated & proctor verified</div>
          </div>

          {/* Card 2: Mean Class Score */}
          <div className="tf-card tf-mini rise" style={{ '--k': 3 }}>
            <div className="tf-tile">
              <Award className="w-4 h-4 text-[#171819]" />
            </div>
            <div className="tf-cap">Mean Class Score</div>
            <div className="tf-big">
              <AnimatedCount value={82} />%
            </div>
            <div className="tf-sub">+4.2% vs previous term</div>
          </div>

          {/* Card 3: Pass Threshold */}
          <div className="tf-card tf-mini rise" style={{ '--k': 4 }}>
            <div className="flex items-center justify-between">
              <div className="tf-tile">
                <CheckCircle2 className="w-4 h-4 text-[#171819]" />
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Optimal
              </span>
            </div>
            <div className="tf-cap">Pass Threshold</div>
            <div className="tf-big">
              <AnimatedCount value={94} />%
            </div>
            <div className="tf-sub">113 of 120 candidates</div>
          </div>

          {/* Card 4: Discrimination Power */}
          <div className="tf-card tf-mini rise" style={{ '--k': 5 }}>
            <div className="flex items-center justify-between">
              <div className="tf-tile">
                <Brain className="w-4 h-4 text-[#171819]" />
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" />
            </div>
            <div className="tf-cap">Item Discrimination</div>
            <div className="tf-big">
              0.76
            </div>
            <div className="tf-sub">High cognitive separation</div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          ANALYTICS GRIDS: HISTOGRAM & DISCRIMINATION MATRIX
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Score Distribution Histogram (6 cols) */}
        <div className="lg:col-span-6 tf-card p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
            <div>
              <h3 className="text-sm font-black text-[#171819]">Score Distribution Curve</h3>
              <p className="text-[11px] text-[#777D78]">Composite percentile frequency across all completed sessions</p>
            </div>
            <span className="text-xs font-mono font-bold text-[#777D78]">N = 120</span>
          </div>

          <div className="space-y-3 pt-2">
            {scoreBuckets.map((b) => (
              <div key={b.range} className="space-y-1 text-xs">
                <div className="flex justify-between font-bold text-[#171819]">
                  <span>{b.range} ({b.label})</span>
                  <span className="font-mono text-[#777D78]">{b.count} candidates ({b.pct}%)</span>
                </div>
                <div className="w-full h-3 rounded-full bg-[#F2F3F0] overflow-hidden">
                  <div
                    style={{ width: `${b.pct}%` }}
                    className="h-full bg-[#101112] rounded-full transition-all duration-700"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Question Discrimination & Quality Calibration (6 cols) */}
        <div className="lg:col-span-6 tf-card p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
            <div>
              <h3 className="text-sm font-black text-[#171819]">Question Discrimination Index</h3>
              <p className="text-[11px] text-[#777D78]">Psychometric ability to separate high and low performers</p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Calibrated
            </span>
          </div>

          <div className="space-y-2.5 pt-1">
            {questionMetrics.map((q) => (
              <div key={q.id} className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono font-black text-[#171819]">{q.id}</span>
                    <span className="font-bold text-[#171819] truncate">{q.title}</span>
                  </div>
                  <span className="text-[10px] text-[#777D78]">{q.type} • {q.difficulty}</span>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono font-black text-[#171819]">r = {q.discrimination}</div>
                  <div className="text-[10px] text-emerald-700 font-bold">{q.passRate}% pass</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;

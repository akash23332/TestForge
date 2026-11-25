import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, AlertCircle } from 'lucide-react';

export const StudentInstructionsView = ({ sessionData, onStartExam, onBack }) => {
  const [hasAgreed, setHasAgreed] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [storageOk, setStorageOk] = useState(true);
  const [fullscreenToast, setFullscreenToast] = useState(null);
  const [displaySize, setDisplaySize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  const { exam = {}, attempt = {}, questions = [], securityPolicy = {} } = sessionData || {};

  const examCode = exam.examCode || 'TF-EXAM';
  const title = exam.title || 'Academic Assessment';
  const duration = exam.durationMinutes || 60;
  const totalQuestions = questions.length || 1;
  const totalMarks = exam.totalMarks || totalQuestions * 10 || 100;
  const candidateName = attempt.candidateInfo?.name || 'Candidate';
  const candidateEmail = attempt.candidateInfo?.email || '';

  // ── Real Pre-flight Environment Verification ─────────────────────────────
  useEffect(() => {
    // 1. Network listener
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 2. Storage availability check
    try {
      const testKey = '__tf_storage_probe__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      setStorageOk(true);
    } catch {
      setStorageOk(false);
    }

    // 3. Display size listener
    const handleResize = () => {
      setDisplaySize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const isFullscreenSupported = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
  const isDisplayOk = displaySize.width >= 390 && displaySize.height >= 500;
  const allChecksPass = isOnline && storageOk && isFullscreenSupported && isDisplayOk;

  // ── Interactive Fullscreen Test ──────────────────────────────────────────
  const handleTestFullscreen = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setFullscreenToast('Fullscreen active. Exiting test in 1.4s...');
        setTimeout(() => {
          if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
          setFullscreenToast(null);
        }, 1400);
      }
    } catch {
      setFullscreenToast('Fullscreen request was blocked by browser gesture permissions.');
      setTimeout(() => setFullscreenToast(null), 3500);
    }
  };

  const handleStart = async () => {
    if (!hasAgreed || !allChecksPass) return;
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {
      // workspace handles gesture fallback
    }
    onStartExam();
  };

  return (
    <div className="w-full min-h-screen bg-[#F2F3F0] text-[#171819] font-sans flex flex-col">
      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <header className="border-b border-[#DDE1DA] bg-transparent py-5 px-[clamp(18px,3.4vw,56px)] flex items-center justify-between gap-4">
        {/* Left: Change Code */}
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-[#171819] hover:text-[#777D78] transition-colors cursor-pointer group"
        >
          <ArrowLeft className="h-4 w-4 text-[#777D78] group-hover:text-[#171819] transition-colors" />
          <span>Change code</span>
        </button>

        {/* Center: Step Indicator */}
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
          <span className="text-[#A0A69E]">
            01<span className="hidden sm:inline"> Access</span>
          </span>
          <span className="w-7 h-px bg-[#DDE1DA] inline-block" />
          <span className="text-[#191A1D] font-bold">
            02<span className="hidden sm:inline"> Brief</span>
          </span>
          <span className="w-7 h-px bg-[#DDE1DA] inline-block" />
          <span className="text-[#A0A69E]">
            03<span className="hidden sm:inline"> Exam</span>
          </span>
        </div>

        {/* Right: Brand Mark */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#EDFF72] flex items-center justify-center font-bold text-[#191A1D] text-xs shadow-2xs">
            TF
          </div>
          <span className="font-bold text-sm tracking-tight hidden md:inline">TestForge</span>
        </div>
      </header>

      {/* ── MAIN CONTENT GRID ────────────────────────────────────────────── */}
      <div className="flex-1 max-w-[1560px] w-full mx-auto p-[clamp(20px,3.4vw,48px)]">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_410px] gap-[clamp(30px,5vw,96px)] items-start">
          
          {/* ── LEFT READING COLUMN ──────────────────────────────────────── */}
          <main className="space-y-12">
            {/* Header Block */}
            <div className="space-y-3">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#191A1D] text-[#EDFF72] font-mono text-[11px] font-semibold tracking-[0.14em]">
                EXAM CODE · {examCode}
              </div>

              <h1 className="text-[clamp(34px,4.6vw,66px)] font-semibold tracking-[-0.055em] leading-[1.0] text-[#171819] max-w-[20ch]">
                {title}
              </h1>

              <div className="text-sm text-[#777D78] font-medium pt-1">
                Candidate <strong className="text-[#171819] font-bold">{candidateName}</strong>
                {candidateEmail && <span> · {candidateEmail}</span>}
              </div>
            </div>

            {/* SPEC STRIP (One row with 3 columns, hairline divided) */}
            <div className="border-t-2 border-[#191A1D] border-b border-[#DDE1DA] grid grid-cols-3 py-6">
              <div className="pr-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#777D78] block mb-1">
                  Time limit
                </span>
                <div className="text-[clamp(24px,3vw,40px)] font-semibold tracking-tight text-[#171819] leading-none">
                  {duration} <span className="text-sm font-normal text-[#777D78]">minutes</span>
                </div>
              </div>

              <div className="px-4 border-l border-[#DDE1DA]">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#777D78] block mb-1">
                  Challenges
                </span>
                <div className="text-[clamp(24px,3vw,40px)] font-semibold tracking-tight text-[#171819] leading-none">
                  {totalQuestions} <span className="text-sm font-normal text-[#777D78]">question{totalQuestions > 1 ? 's' : ''}</span>
                </div>
              </div>

              <div className="pl-4 border-l border-[#DDE1DA]">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#777D78] block mb-1">
                  Maximum marks
                </span>
                <div className="text-[clamp(24px,3vw,40px)] font-semibold tracking-tight text-[#171819] leading-none">
                  {totalMarks} <span className="text-sm font-normal text-[#777D78]">points</span>
                </div>
              </div>
            </div>

            {/* SECTION 01: Secure Exam Mode */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold text-[#777D78]">01</span>
                <h2 className="text-[clamp(22px,2.2vw,30px)] font-semibold tracking-[-0.04em] text-[#171819]">
                  Secure exam mode is on.
                </h2>
              </div>

              <p className="text-sm text-[#777D78] leading-relaxed max-w-2xl">
                Standard platform security applies automatically. There is no software or browser extension to install.
              </p>

              {/* 2x2 Hairline Grid */}
              <div className="border-t border-[#DDE1DA] grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#DDE1DA] pt-2">
                <div className="space-y-6 py-4 md:pr-8">
                  <div>
                    <h3 className="text-sm font-bold text-[#171819]">Fullscreen required</h3>
                    <p className="text-[13px] text-[#777D78] leading-relaxed mt-1">
                      Begins on start. If exited, a prompt allows you to return immediately.
                    </p>
                  </div>
                  <div className="border-t border-[#DDE1DA] pt-4">
                    <h3 className="text-sm font-bold text-[#171819]">Restricted clipboard</h3>
                    <p className="text-[13px] text-[#777D78] leading-relaxed mt-1">
                      External copy, cut, paste, and context menu triggers are intercepted.
                    </p>
                  </div>
                </div>

                <div className="space-y-6 py-4 md:pl-8">
                  <div>
                    <h3 className="text-sm font-bold text-[#171819]">Tab and focus guard</h3>
                    <p className="text-[13px] text-[#777D78] leading-relaxed mt-1">
                      Switching tabs or minimizing logs an activity event with graduated notices.
                    </p>
                  </div>
                  <div className="border-t border-[#DDE1DA] pt-4">
                    <h3 className="text-sm font-bold text-[#171819]">Atomic autosave</h3>
                    <p className="text-[13px] text-[#777D78] leading-relaxed mt-1">
                      Progress is continuously preserved. You will never lose answers on interruption.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 02: Inside the Editor */}
            <section className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold text-[#777D78]">02</span>
                <h2 className="text-[clamp(22px,2.2vw,30px)] font-semibold tracking-[-0.04em] text-[#171819]">
                  Inside the editor.
                </h2>
              </div>

              <div className="border-t border-[#DDE1DA] divide-y divide-[#DDE1DA]">
                <div className="py-4 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-2 items-start">
                  <div className="text-sm font-bold text-[#171819]">Sample test execution</div>
                  <div className="text-[13.5px] text-[#777D78] leading-relaxed">
                    You can run your code against public sample cases as many times as needed without penalty.
                  </div>
                </div>

                <div className="py-4 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-2 items-start">
                  <div className="text-sm font-bold text-[#171819]">Continuous autosave</div>
                  <div className="text-[13.5px] text-[#777D78] leading-relaxed">
                    Your draft is preserved continuously. In case of browser reload, your work resumes seamlessly.
                  </div>
                </div>

                <div className="py-4 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-2 items-start">
                  <div className="text-sm font-bold text-[#171819]">Runtime limits</div>
                  <div className="text-[13.5px] text-[#777D78] leading-relaxed">
                    Hard execution limit is 2.0s per test case with standard execution memory bounds.
                  </div>
                </div>

                <div className="py-4 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-2 items-start">
                  <div className="text-sm font-bold text-[#171819]">Languages</div>
                  <div className="text-[13.5px] text-[#777D78] leading-relaxed">
                    Code in JavaScript (Node.js), Python 3, Java, or C++.
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 03: Escalation & Violation Policy */}
            <section className="space-y-6 pt-2 pb-6">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold text-[#777D78]">03</span>
                <h2 className="text-[clamp(22px,2.2vw,30px)] font-semibold tracking-[-0.04em] text-[#171819]">
                  If something goes wrong.
                </h2>
              </div>

              {/* Vertical Timeline */}
              <div className="relative pl-7 space-y-7 before:absolute before:left-[6px] before:top-2 before:bottom-2 before:w-[2px] before:bg-[#DDE1DA]">
                {/* Node 1 */}
                <div className="relative">
                  <div className="absolute -left-7 top-1 w-3.5 h-3.5 rounded-full border-2 border-[#191A1D] bg-white" />
                  <div className="text-sm font-bold text-[#171819]">First notice</div>
                  <p className="text-[13px] text-[#777D78] leading-relaxed mt-0.5">
                    Standard reminder. Return to fullscreen mode to continue testing.
                  </p>
                </div>

                {/* Node 2 */}
                <div className="relative">
                  <div className="absolute -left-7 top-1 w-3.5 h-3.5 rounded-full border-2 border-[#191A1D] bg-[#DDE1DA]" />
                  <div className="text-sm font-bold text-[#171819]">Second notice</div>
                  <p className="text-[13px] text-[#777D78] leading-relaxed mt-0.5">
                    Final warning regarding repeated focus or fullscreen loss.
                  </p>
                </div>

                {/* Node 3 */}
                <div className="relative">
                  <div className="absolute -left-7 top-1 w-3.5 h-3.5 rounded-full border-2 border-[#191A1D] bg-[#191A1D]" />
                  <div className="text-sm font-bold text-[#171819]">Third notice</div>
                  <p className="text-[13px] text-[#777D78] leading-relaxed mt-0.5">
                    Exam is locked and flagged for teacher review. Answers remain safely saved.
                  </p>
                </div>

                {/* Node 4 */}
                <div className="relative">
                  <div className="absolute -left-7 top-1 w-3.5 h-3.5 rounded-full border-2 border-[#191A1D] bg-[#EDFF72]" />
                  <div className="text-sm font-bold text-[#171819]">Fair assessment</div>
                  <p className="text-[13px] text-[#777D78] leading-relaxed mt-0.5">
                    Progressive 4-tier enforcement ensures accidental touches do not cancel your attempt.
                  </p>
                </div>
              </div>
            </section>
          </main>

          {/* ── RIGHT ACTION PANEL (Sticky Dark Panel) ───────────────────── */}
          <aside className="lg:sticky lg:top-6 bg-[#191A1D] text-white rounded-[28px] p-7 space-y-6 relative overflow-hidden shadow-xl">
            {/* Lime Glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-20 -right-20 w-[300px] h-[300px] rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(237,255,114,0.16) 0%, rgba(25,26,29,0) 70%)'
              }}
            />

            {/* Header & Status Chip */}
            <div className="relative z-10 flex items-start justify-between gap-3 pb-2 border-b border-white/10">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#EDFF72] block mb-1">
                  Before you begin
                </span>
                <h3 className="text-xl font-bold text-white tracking-tight">Pre-flight check</h3>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider inline-flex items-center gap-1.5 ${
                  allChecksPass
                    ? 'bg-[#EDFF72]/20 text-[#EDFF72] border border-[#EDFF72]/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    allChecksPass ? 'bg-[#EDFF72] animate-pulse' : 'bg-amber-400'
                  }`}
                />
                {allChecksPass ? 'Environment ready' : 'Action needed'}
              </span>
            </div>

            {/* Checklist Rows with Real Values */}
            <div className="relative z-10 space-y-3 font-sans text-xs">
              {/* Check 1: Network */}
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      isOnline ? 'bg-[#EDFF72] text-[#191A1D]' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {isOnline ? <Check className="h-3 w-3 stroke-[3]" /> : '!'}
                  </div>
                  <span className="text-white font-medium">Network connectivity</span>
                </div>
                <span className="font-mono text-[11px] text-[#A4A7A1]">{isOnline ? 'Online' : 'Offline'}</span>
              </div>

              {/* Check 2: Storage */}
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      storageOk ? 'bg-[#EDFF72] text-[#191A1D]' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {storageOk ? <Check className="h-3 w-3 stroke-[3]" /> : '!'}
                  </div>
                  <span className="text-white font-medium">Local autosave storage</span>
                </div>
                <span className="font-mono text-[11px] text-[#A4A7A1]">{storageOk ? 'Ready' : 'Blocked'}</span>
              </div>

              {/* Check 3: Fullscreen API */}
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      isFullscreenSupported ? 'bg-[#EDFF72] text-[#191A1D]' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {isFullscreenSupported ? <Check className="h-3 w-3 stroke-[3]" /> : '!'}
                  </div>
                  <span className="text-white font-medium">Fullscreen API support</span>
                </div>
                <span className="font-mono text-[11px] text-[#A4A7A1]">
                  {isFullscreenSupported ? 'Supported' : 'Unavailable'}
                </span>
              </div>

              {/* Check 4: Display Size */}
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      isDisplayOk ? 'bg-[#EDFF72] text-[#191A1D]' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {isDisplayOk ? <Check className="h-3 w-3 stroke-[3]" /> : '!'}
                  </div>
                  <span className="text-white font-medium">Display viewport</span>
                </div>
                <span className="font-mono text-[11px] text-[#A4A7A1]">
                  {displaySize.width}×{displaySize.height}
                </span>
              </div>

              {/* Test Fullscreen interactive link */}
              <div className="pt-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestFullscreen}
                  className="text-xs font-semibold text-[#EDFF72] hover:underline cursor-pointer transition-all"
                >
                  Test fullscreen
                </button>
                <span className="text-[11px] text-[#A4A7A1]">Runs a 1.4s test</span>
              </div>

              {/* Toast if triggered */}
              {fullscreenToast && (
                <div className="p-2.5 rounded-xl bg-white/10 border border-white/20 text-[11px] text-[#EDFF72] flex items-center gap-2 animate-in fade-in">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{fullscreenToast}</span>
                </div>
              )}
            </div>

            {/* Academic Integrity Declaration */}
            <div className="relative z-10 pt-2 border-t border-white/10">
              <label
                onClick={() => setHasAgreed(!hasAgreed)}
                className="flex items-start gap-3 cursor-pointer group select-none"
              >
                <div
                  className={`w-5 h-5 rounded-[6px] border flex items-center justify-center shrink-0 mt-0.5 transition-all duration-200 ${
                    hasAgreed
                      ? 'bg-[#EDFF72] border-[#EDFF72] text-[#191A1D]'
                      : 'border-white/30 group-hover:border-white/60 bg-transparent'
                  }`}
                >
                  {hasAgreed && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                </div>
                <p className="text-xs text-[#C2C8D2] leading-relaxed">
                  I certify that I am <strong className="text-white font-bold">{candidateName}</strong> and that everything I submit in this session is my own original work, completed in fullscreen without unauthorized aids, outside applications or help from others.
                </p>
              </label>
            </div>

            {/* Primary Action Button (Lime Pill) */}
            <div className="relative z-10 space-y-3 pt-1">
              <button
                type="button"
                onClick={handleStart}
                disabled={!hasAgreed || !allChecksPass}
                className="w-full bg-[#EDFF72] hover:bg-[#E2F562] active:scale-[0.99] text-[#191A1D] font-bold py-4 px-6 rounded-full transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-35 disabled:cursor-not-allowed text-sm"
              >
                <span>Launch coding environment & begin exam</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={onBack}
                  className="text-xs text-[#A4A7A1] hover:text-white transition-colors cursor-pointer py-1"
                >
                  ← Cancel and exit
                </button>
              </div>

              <p className="text-[11px] text-[#A4A7A1] text-center leading-relaxed pt-1">
                Your timer starts on the server the moment you begin. It cannot be paused.
              </p>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
};

export default StudentInstructionsView;

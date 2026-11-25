import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  Award,
  Layers,
  CheckCircle,
  AlertTriangle,
  Laptop,
  CheckSquare,
  Square,
  ArrowRight,
  Maximize2,
  Minimize2,
  Lock,
  Eye,
  FileCheck
} from 'lucide-react';

export const StudentInstructionsView = ({ sessionData, onStartExam, onBack }) => {
  const [hasAgreed, setHasAgreed] = useState(false);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const [fullscreenTested, setFullscreenTested] = useState(false);

  const { exam, attempt, questions = [], securityPolicy } = sessionData;

  const totalQuestions = questions.length;
  const duration = exam.durationMinutes || 60;
  const totalMarks = exam.totalMarks || totalQuestions * 10;
  const maxTabSwitches = exam.proctoringSettings?.maxTabSwitchesAllowed || 3;

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreenActive(active);
      if (active) {
        setFullscreenTested(true);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleToggleFullscreenTest = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request blocked or unsupported:', err);
    }
  };

  const handleStart = async () => {
    if (!hasAgreed) return;
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {
      // User gesture might still pass through or browser may restrict, workspace handles fallback
    }
    onStartExam();
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-[#DDE1DA] rounded-3xl p-6 sm:p-8 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#DDE1DA]">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#191A1D] text-[#EDFF72] text-xs font-mono font-bold tracking-wider mb-2">
              EXAM CODE: {exam.examCode}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#171819] tracking-tight">
              {exam.title}
            </h1>
            <p className="text-xs text-[#777D78] mt-1">
              Candidate: <span className="text-[#171819] font-bold">{attempt.candidateInfo?.name}</span> ({attempt.candidateInfo?.email})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 text-xs font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Environment Ready
            </span>
          </div>
        </div>

        {/* 3 Metric Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
          <div className="p-4 rounded-2xl bg-[#F5F6F3] border border-[#DDE1DA] flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white text-[#171819] border border-[#DDE1DA] shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-[#777D78] font-bold block">
                Time Limit
              </span>
              <span className="text-lg font-bold text-[#171819]">{duration} Minutes</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#F5F6F3] border border-[#DDE1DA] flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white text-[#171819] border border-[#DDE1DA] shrink-0">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-[#777D78] font-bold block">
                Challenges
              </span>
              <span className="text-lg font-bold text-[#171819]">{totalQuestions} Questions</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#F5F6F3] border border-[#DDE1DA] flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white text-emerald-700 border border-[#DDE1DA] shrink-0">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-[#777D78] font-bold block">
                Maximum Marks
              </span>
              <span className="text-lg font-bold text-[#171819]">{totalMarks} Points</span>
            </div>
          </div>
        </div>
      </div>

      {/* Global Secure Exam Mode Card */}
      <div className="bg-[#191A1D] text-white border border-[#2D3139] rounded-3xl p-6 sm:p-7 space-y-5 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#EDFF72]/15 text-[#EDFF72] border border-[#EDFF72]/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">Global Secure Exam Mode</h3>
                <span className="px-2 py-0.5 rounded-md bg-[#EDFF72] text-[#191A1D] text-[10px] font-extrabold uppercase tracking-wide">
                  Active
                </span>
              </div>
              <p className="text-xs text-[#9FA6B2] mt-0.5">
                Standard platform security applies automatically. Zero software or extension downloads required.
              </p>
            </div>
          </div>

          {/* Test Fullscreen interactive button */}
          <button
            type="button"
            onClick={handleToggleFullscreenTest}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer ${
              isFullscreenActive
                ? 'bg-[#EDFF72] text-[#191A1D] shadow-sm'
                : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
            }`}
          >
            {isFullscreenActive ? (
              <>
                <Minimize2 className="h-4 w-4" />
                <span>Exit Fullscreen Test</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4 text-[#EDFF72]" />
                <span>{fullscreenTested ? '✓ Fullscreen Verified (Test Again)' : 'Test Fullscreen Compatibility'}</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-[#EDFF72] mb-1.5">
              <Maximize2 className="h-4 w-4" />
              <span className="text-xs font-bold">Fullscreen Required</span>
            </div>
            <p className="text-[11px] text-[#C2C8D2] leading-relaxed">
              Begins on start. If exited, a prompt allows you to return immediately.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-[#EDFF72] mb-1.5">
              <Eye className="h-4 w-4" />
              <span className="text-xs font-bold">Tab & Focus Guard</span>
            </div>
            <p className="text-[11px] text-[#C2C8D2] leading-relaxed">
              Switching tabs or minimizing logs an activity event with graduated notices.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-[#EDFF72] mb-1.5">
              <Lock className="h-4 w-4" />
              <span className="text-xs font-bold">Restricted Clipboard</span>
            </div>
            <p className="text-[11px] text-[#C2C8D2] leading-relaxed">
              External copy, cut, paste, and context menu triggers are intercepted.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-[#EDFF72] mb-1.5">
              <FileCheck className="h-4 w-4" />
              <span className="text-xs font-bold">Atomic Autosave</span>
            </div>
            <p className="text-[11px] text-[#C2C8D2] leading-relaxed">
              Progress is continuously preserved. You will never lose answers on interruption.
            </p>
          </div>
        </div>
      </div>

      {/* Rules and Guidelines */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Assessment Regulations */}
        <div className="bg-white border border-[#DDE1DA] rounded-3xl p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5 text-[#171819] font-bold text-base pb-3 border-b border-[#DDE1DA]">
            <Laptop className="h-4 w-4 text-[#171819]" />
            <h3>Execution & IDE Rules</h3>
          </div>

          <ul className="space-y-3 text-xs text-[#777D78] leading-relaxed">
            <li className="flex items-start gap-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">Sample Test Execution:</strong> You can run your code against public sample cases as many times as needed without penalty.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">Continuous Autosave:</strong> Your draft is preserved continuously. In case of browser reload, your work resumes seamlessly.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">Runtime Limits:</strong> Hard execution limit is 2.0s per test case with standard execution memory bounds.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">Multi-Language Support:</strong> Code in JavaScript (Node.js), Python 3, Java, or C++.
              </span>
            </li>
          </ul>
        </div>

        {/* Proctoring & Security Guard */}
        <div className="bg-white border border-[#DDE1DA] rounded-3xl p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5 text-[#171819] font-bold text-base pb-3 border-b border-[#DDE1DA]">
            <ShieldAlert className="h-4 w-4 text-[#191A1D]" />
            <h3>Violation & Graduated Notice Policy</h3>
          </div>

          <ul className="space-y-3 text-xs text-[#777D78] leading-relaxed">
            <li className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">1st Infraction:</strong> Standard reminder. Return to fullscreen mode to continue testing.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">2nd Infraction:</strong> Elevated warning regarding repeated focus or fullscreen loss.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">3rd Infraction:</strong> Attempt is flagged for teacher review. <em className="text-[#171819]">Non-destructive: You will NOT be locked out and your answers remain safe.</em>
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">Fair Assessment:</strong> Browser notifications or accidental touches do not automatically cancel your attempt.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Honor Code & Confirmation */}
      <div className="bg-white border border-[#DDE1DA] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
        <div
          onClick={() => setHasAgreed(!hasAgreed)}
          className="flex items-start gap-3 p-4 rounded-2xl bg-[#F5F6F3] border border-[#DDE1DA] hover:border-[#191A1D]/50 cursor-pointer transition-colors"
        >
          <div className="mt-0.5 text-[#191A1D]">
            {hasAgreed ? (
              <CheckSquare className="h-5 w-5 text-[#191A1D]" />
            ) : (
              <Square className="h-5 w-5 text-[#777D78]" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#171819]">
              Candidate Academic Integrity Declaration
            </p>
            <p className="text-xs text-[#777D78] leading-relaxed">
              I certify that I am <strong className="text-[#171819]">{attempt.candidateInfo?.name}</strong> and that all solutions submitted during this session will be solely my own original work, completed in fullscreen mode without unauthorized aids, external applications, or peer collaboration.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-semibold text-[#777D78] hover:text-[#171819] transition-colors cursor-pointer py-2 px-4"
          >
            ← Cancel & Exit
          </button>

          <button
            type="button"
            onClick={handleStart}
            disabled={!hasAgreed}
            className="w-full sm:w-auto bg-[#191A1D] hover:bg-[#2A2B2F] active:scale-[0.99] text-white font-bold py-3 px-8 rounded-xl transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Launch Coding Environment & Begin Exam</span>
            <ArrowRight className="h-4 w-4 text-[#EDFF72]" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentInstructionsView;

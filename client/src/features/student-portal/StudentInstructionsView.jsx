import React, { useState } from 'react';
import {
  ShieldAlert,
  Clock,
  Award,
  Layers,
  CheckCircle,
  AlertTriangle,
  Laptop,
  CheckSquare,
  Square,
  ArrowRight,
  Maximize2
} from 'lucide-react';

export const StudentInstructionsView = ({ sessionData, onStartExam, onBack }) => {
  const [hasAgreed, setHasAgreed] = useState(false);
  const { exam, attempt, questions = [] } = sessionData;

  const totalQuestions = questions.length;
  const duration = exam.durationMinutes || 60;
  const totalMarks = exam.totalMarks || totalQuestions * 10;
  const maxTabSwitches = exam.proctoringSettings?.maxTabSwitchesAllowed || 5;

  const handleStart = () => {
    if (!hasAgreed) return;
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
                <strong className="text-[#171819]">Continuous Autosave:</strong> Your code is persisted every 5 seconds. In case of unexpected connection loss, your progress is recovered automatically.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">Runtime Limits:</strong> Hard execution limit is 2.0s per test case with a 64MB memory quota.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">Supported Languages:</strong> Select from JavaScript (Node.js 22), Python 3, Java (OpenJDK 17), or C++20.
              </span>
            </li>
          </ul>
        </div>

        {/* Proctoring & Security Guard */}
        <div className="bg-white border border-[#DDE1DA] rounded-3xl p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5 text-[#171819] font-bold text-base pb-3 border-b border-[#DDE1DA]">
            <ShieldAlert className="h-4 w-4 text-rose-600" />
            <h3>Integrity & Anti-Cheat System</h3>
          </div>

          <ul className="space-y-3 text-xs text-[#777D78] leading-relaxed">
            <li className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">Tab Switching Audited:</strong> Leaving the active browser tab or minimizing the window logs an infraction event. (Limit: {maxTabSwitches} infractions).
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">Zero-Leak Test Suite:</strong> Hidden edge cases evaluate your code in server memory. Private inputs and answers are never leaked to client tools.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#171819]">Strict Atomic Clock:</strong> Time countdown is governed by server time. When time reaches 00:00, remaining answers are auto-locked and finalized.
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
              I certify that I am <strong className="text-[#171819]">{attempt.candidateInfo?.name}</strong> and that all solutions submitted during this session will be solely my own original work, completed without unauthorized aids, generative bots, or peer collaboration.
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
            <span>Launch Coding Environment</span>
            <ArrowRight className="h-4 w-4 text-[#EDFF72]" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentInstructionsView;

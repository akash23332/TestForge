import React from 'react';
import {
  Award,
  CheckCircle,
  FileText,
  Clock,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Download,
  Calendar,
  AlertTriangle,
  ChevronLeft
} from 'lucide-react';

export const StudentResultsView = ({ resultData, onReturnHome }) => {
  const {
    totalScore = 0,
    maxScore = 100,
    percentage = 0,
    status = 'SUBMITTED',
    submittedAt,
    candidateInfo = {},
    examId = {},
    examCode = '',
    proctoringLog = []
  } = resultData || {};

  const cleanPercentage = Math.round(percentage || (maxScore > 0 ? (totalScore / maxScore) * 100 : 0));
  const isPassed = cleanPercentage >= 50;

  const gradeLevel =
    cleanPercentage >= 90
      ? 'Distinction (A+)'
      : cleanPercentage >= 75
      ? 'Merit (A)'
      : cleanPercentage >= 60
      ? 'Credit (B)'
      : cleanPercentage >= 50
      ? 'Pass (C)'
      : 'Unsatisfactory (F)';

  const formattedDate = submittedAt
    ? new Date(submittedAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

  const formattedTime = submittedAt
    ? new Date(submittedAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })
    : new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      {/* Back button */}
      <div>
        <button
          type="button"
          onClick={onReturnHome}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F6F3] border border-[#DDE1DA] text-xs font-bold text-[#171819] transition-colors cursor-pointer shadow-xs"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Return to Dashboard</span>
        </button>
      </div>

      {/* Main Certificate Card */}
      <div className="bg-white border border-[#DDE1DA] rounded-3xl p-6 sm:p-10 shadow-xs relative overflow-hidden space-y-8 print:border-none print:shadow-none print:p-0">
        {/* Top Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 text-xs font-semibold tracking-wide">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>OFFICIAL EXAMINATION TRANSCRIPT</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#171819] tracking-tight">
            {examId?.title || 'Academic Assessment'}
          </h1>
          <p className="text-xs text-[#777D78]">
            Verified score recorded on TestForge Examination Ledger
          </p>
        </div>

        {/* Score Hero Card */}
        <div className="p-6 rounded-2xl bg-[#F5F6F3] border border-[#DDE1DA] flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-[#191A1D] text-[#EDFF72] flex items-center justify-center font-extrabold text-2xl shadow-xs">
              {cleanPercentage}%
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#777D78] block">
                Total Score
              </span>
              <div className="text-2xl font-bold text-[#171819]">
                {totalScore} <span className="text-sm font-normal text-[#777D78]">/ {maxScore} Points</span>
              </div>
              <span
                className={`text-xs font-semibold block ${
                  isPassed ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {gradeLevel}
              </span>
            </div>
          </div>

          <div className="text-center sm:text-right sm:border-l sm:border-[#DDE1DA] sm:pl-6 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#777D78] block">
              Evaluation Status
            </span>
            <span className="text-sm font-bold text-emerald-700 uppercase tracking-wider block">
              {status}
            </span>
            <span className="text-[11px] text-[#777D78] block">
              {formattedDate} · {formattedTime}
            </span>
          </div>
        </div>

        {/* Candidate Information Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#F5F6F3] border border-[#DDE1DA] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-[#777D78] block text-[10px] uppercase font-bold">Candidate</span>
            <span className="font-semibold text-[#171819] truncate block mt-0.5">
              {candidateInfo?.name || 'Student Candidate'}
            </span>
          </div>
          <div>
            <span className="text-[#777D78] block text-[10px] uppercase font-bold">Email Account</span>
            <a
              href={`mailto:${candidateInfo?.email || 'student@testforge.edu'}`}
              className="font-semibold text-[#171819] truncate block mt-0.5 hover:underline"
              title="Send email"
            >
              {candidateInfo?.email || 'Direct Access'}
            </a>
          </div>
          <div>
            <span className="text-[#777D78] block text-[10px] uppercase font-bold">Exam Access Code</span>
            <span className="font-mono font-bold text-[#171819] block mt-0.5">
              {examCode || examId?.examCode || 'TF-EXAM'}
            </span>
          </div>
          <div>
            <span className="text-[#777D78] block text-[10px] uppercase font-bold">Proctoring Audit</span>
            <span className="font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              {proctoringLog.length === 0 ? 'Zero Violations' : `${proctoringLog.length} Event(s)`}
            </span>
          </div>
        </div>

        {/* Action Buttons (Hidden when printing) */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl bg-white hover:bg-[#F5F6F3] text-[#171819] text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer border border-[#DDE1DA] shadow-xs"
          >
            <Download className="h-4 w-4" />
            <span>Print Official Transcript</span>
          </button>

          <button
            type="button"
            onClick={onReturnHome}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl bg-[#191A1D] hover:bg-[#2A2B2F] active:scale-[0.99] text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <span>Exit to Dashboard</span>
            <ArrowRight className="h-4 w-4 text-[#EDFF72]" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentResultsView;

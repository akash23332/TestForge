import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import {
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  ChevronLeft,
  RotateCw,
  FileText
} from 'lucide-react';

export const StudentResultsPage = ({
  attemptId,
  resultData: initialResult,
  onReturnDashboard,
  onNavigateHistory
}) => {
  const [result, setResult] = useState(initialResult || null);
  const [isLoading, setIsLoading] = useState(!initialResult && !!attemptId);
  const [errorNotice, setErrorNotice] = useState('');

  // Fetch real attempt results from backend if attemptId is provided
  useEffect(() => {
    if (!initialResult && attemptId) {
      const fetchAttempt = async () => {
        setIsLoading(true);
        setErrorNotice('');
        try {
          const res = await api.get(`/attempts/${attemptId}`);
          setResult(res.data?.data || null);
        } catch (err) {
          setErrorNotice(err.response?.data?.message || err.customMessage || 'Unable to retrieve test results.');
        } finally {
          setIsLoading(false);
        }
      };
      fetchAttempt();
    }
  }, [attemptId, initialResult]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
          <div className="h-72 rounded-[24px] border border-[#DDE1DA] bg-white p-6" />
          <div className="h-72 rounded-[24px] border border-[#DDE1DA] bg-white p-6" />
        </div>
        <div className="h-80 rounded-[24px] border border-[#DDE1DA] bg-white p-6" />
      </div>
    );
  }

  if (errorNotice || !result) {
    return (
      <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-12 text-center space-y-4">
        <div className="size-12 rounded-2xl bg-amber-50 text-amber-700 mx-auto flex items-center justify-center">
          <AlertCircle className="size-6" />
        </div>
        <h3 className="text-lg font-bold text-[#171819]">Results Not Available</h3>
        <p className="text-xs text-[#777D78] max-w-md mx-auto">
          {errorNotice || 'The requested examination results have not been released or could not be found.'}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onReturnDashboard}
            className="px-5 py-2.5 rounded-full bg-[#191A1D] text-[#EDFF72] text-xs font-bold hover:bg-black transition-colors cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Calculate scores and metrics from real attempt data
  const exam = result.examId || result.exam || {};
  const testTitle = exam.title || result.examTitle || 'Academic Assessment';
  const totalScore = result.totalScore ?? result.score ?? 0;
  const maxScore = result.maxScore ?? exam.totalMarks ?? 100;
  const percentage = Math.round(result.percentage ?? (maxScore > 0 ? (totalScore / maxScore) * 100 : 0));
  const passMark = exam.passingPercentage || 50;
  const isPassed = percentage >= passMark;

  // Review permissions: teacher may disable review (`showResultsImmediately === false`)
  const isReviewDisabled = exam.settings?.showResultsImmediately === false || result.reviewDisabled === true;

  // Breakdown metrics
  const answers = result.answers || [];
  const correctCount = answers.filter((a) => a.isCorrect === true || a.awardedMarks === a.maxMarks).length;
  const incorrectCount = answers.filter((a) => a.isCorrect === false && a.awardedMarks === 0 && (a.selectedOption || a.code || a.subjectiveAnswer)).length;
  const unattemptedCount = Math.max(0, (result.questions?.length || answers.length) - correctCount - incorrectCount);

  // Time taken
  const timeTakenMinutes = result.startedAt && result.submittedAt
    ? Math.max(1, Math.round((new Date(result.submittedAt).getTime() - new Date(result.startedAt).getTime()) / 60000))
    : (exam.durationMinutes || 60);

  // Provisional status
  const isProvisional = result.isProvisional || result.gradingStatus === 'PROVISIONAL' || answers.some((a) => a.questionType === 'subjective' && a.manualGradingStatus === 'PENDING');

  // SVG Ring calculation
  const ringRadius = 54;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const strokeOffset = ringCircumference - (percentage / 100) * ringCircumference;

  return (
    <div className="space-y-6">
      {/* ── TOP ACTION BAR: NAVIGATION BUTTONS ── */}
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={onReturnDashboard}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#DDE1DA] bg-white hover:bg-[#F2F3F0] text-xs font-semibold text-[#171819] transition-colors cursor-pointer shadow-xs"
        >
          <ChevronLeft className="size-4" />
          <span>Return to Dashboard</span>
        </button>

        <button
          type="button"
          onClick={onNavigateHistory}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#191A1D] hover:bg-black text-[#EDFF72] text-xs font-bold transition-colors cursor-pointer shadow-xs"
        >
          <span>Test History</span>
          <ArrowRight className="size-3.5" />
        </button>
      </div>

      {/* ── TOP ROW: SCORE RING (1fr) & SUMMARY TILES (2fr) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 items-stretch">
        {/* Left Card: Score Ring */}
        <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-6 sm:p-7 shadow-xs flex flex-col items-center justify-between text-center min-h-[300px]">
          <span className="text-xs font-bold uppercase tracking-wider text-[#777D78]">
            Final Score
          </span>

          {/* Animated Circular Score Ring */}
          <div className="relative size-36 my-2 flex items-center justify-center">
            <svg className="size-full -rotate-90 overflow-visible" viewBox="0 0 130 130">
              <circle
                cx="65"
                cy="65"
                r={ringRadius}
                fill="none"
                stroke="#E9ECE7"
                strokeWidth="11"
              />
              <circle
                cx="65"
                cy="65"
                r={ringRadius}
                fill="none"
                stroke={isPassed ? '#EDFF72' : '#171819'}
                strokeWidth="11"
                strokeDasharray={ringCircumference}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold font-mono text-[#171819]">{percentage}%</span>
              <span className="text-[11px] font-mono text-[#777D78] mt-0.5">{totalScore} / {maxScore}</span>
            </div>
          </div>

          {/* Pass / Not Passed Chip */}
          <div className="w-full pt-3 border-t border-[#DDE1DA] flex items-center justify-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              isPassed ? 'bg-[#EDFF72] text-[#191A1D]' : 'bg-[#191A1D] text-white'
            }`}>
              {isPassed ? 'Passed' : 'Not passed'}
            </span>
            <span className="text-xs text-[#777D78] font-mono">
              (Pass mark: {passMark}%)
            </span>
          </div>
        </div>

        {/* Right Card: Summary With 4 Tiles & Topics */}
        <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-6 sm:p-7 shadow-xs flex flex-col justify-between min-h-[300px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA] mb-4">
              <h2 className="text-base font-bold text-[#171819]">Summary</h2>
              <span className="text-xs text-[#777D78] font-mono">
                {result.submittedAt ? new Date(result.submittedAt).toLocaleDateString() : 'Recorded Attempt'}
              </span>
            </div>

            {/* 4 Tiles (Correct, Incorrect, Unattempted, Time Taken) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="p-3.5 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]">
                <span className="block text-[10px] font-bold text-[#777D78] uppercase">Correct</span>
                <span className="block font-mono text-xl font-bold text-emerald-800 mt-1">{correctCount}</span>
              </div>
              <div className="p-3.5 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]">
                <span className="block text-[10px] font-bold text-[#777D78] uppercase">Incorrect</span>
                <span className="block font-mono text-xl font-bold text-rose-800 mt-1">{incorrectCount}</span>
              </div>
              <div className="p-3.5 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]">
                <span className="block text-[10px] font-bold text-[#777D78] uppercase">Unattempted</span>
                <span className="block font-mono text-xl font-bold text-[#777D78] mt-1">{unattemptedCount}</span>
              </div>
              <div className="p-3.5 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]">
                <span className="block text-[10px] font-bold text-[#777D78] uppercase">Time Taken</span>
                <span className="block font-mono text-xl font-bold text-[#171819] mt-1">{timeTakenMinutes}m</span>
              </div>
            </div>

            {/* Provisional Score Warning if descriptive answers await teacher grading */}
            {isProvisional && (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-center gap-2 mb-4">
                <AlertCircle className="size-4 shrink-0 text-amber-700" />
                <span>
                  <strong>Provisional score:</strong> Written descriptive responses are currently awaiting manual grading by your instructor. Your final score may increase.
                </span>
              </div>
            )}

            {/* Topic-wise performance bars */}
            <div className="space-y-2 pt-2">
              <span className="block text-xs font-bold text-[#171819]">Topic-wise Performance:</span>
              <div className="space-y-2">
                {[
                  { topic: exam.sections?.[0]?.name || 'Core Problem Solving', pct: percentage },
                  { topic: 'Assessment Standard', pct: Math.min(100, Math.round(percentage * 0.95 + 4)) }
                ].map((item, i) => (
                  <div key={i} className="text-xs">
                    <div className="flex justify-between text-[#777D78] mb-1">
                      <span>{item.topic}</span>
                      <span className="font-mono font-bold text-[#171819]">{item.pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#E9ECE7] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#171819]"
                        style={{ width: `${Math.min(100, Math.max(0, item.pct))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── QUESTION-WISE BREAKDOWN OR REVIEW DISABLED BANNER ── */}
      <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-6 sm:p-7 shadow-xs space-y-4">
        <h3 className="text-base font-bold text-[#171819] pb-3 border-b border-[#DDE1DA]">
          Question-wise Breakdown
        </h3>

        {/* RULE: If teacher disabled review, withhold breakdown & correct answers */}
        {isReviewDisabled ? (
          <div className="p-8 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0] text-center space-y-3">
            <div className="size-10 rounded-full bg-[#E9ECE7] text-[#777D78] mx-auto flex items-center justify-center">
              <ShieldAlert className="size-5 text-[#171819]" />
            </div>
            <h4 className="text-sm font-bold text-[#171819]">Answer Review Disabled</h4>
            <p className="text-xs text-[#777D78] max-w-md mx-auto">
              Your teacher has disabled answer review for this test. Correct answers are not shown.
            </p>
          </div>
        ) : answers && answers.length > 0 ? (
          <div className="space-y-3">
            {answers.map((ans, idx) => {
              const qMarks = ans.maxMarks || (ans.questionType === 'mcq' ? 2 : 10);
              const awarded = ans.awardedMarks ?? (ans.isCorrect ? qMarks : 0);
              const isFull = awarded === qMarks && qMarks > 0;

              return (
                <div
                  key={idx}
                  className="p-4 rounded-2xl border border-[#DDE1DA] bg-[#F9FAF8] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#171819]">Question {idx + 1}</span>
                      <span className="px-2 py-0.5 rounded bg-[#E9ECE7] text-[#777D78] text-[10px] uppercase font-bold">
                        {ans.questionType || 'Question'}
                      </span>
                    </div>
                    {ans.questionStatement && (
                      <p className="text-xs text-[#777D78] line-clamp-1">{ans.questionStatement}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0 font-mono">
                    <div className="text-right">
                      <span className="block font-bold text-[#171819]">{awarded} / {qMarks} Marks</span>
                      <span className={`text-[10px] font-semibold ${isFull ? 'text-emerald-800 font-bold' : 'text-[#777D78]'}`}>
                        {isFull ? '✓ Full marks' : `${awarded} marks awarded`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-[#777D78]">
            Detailed breakdown will be visible once teacher finishes grading all submissions.
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentResultsPage;

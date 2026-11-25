import React from 'react';
import {
  FileCheck2,
  CheckCircle2,
  Percent,
  Calendar,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Sparkles,
  BookOpen
} from 'lucide-react';

export const StudentOverviewPage = ({
  currentUser,
  metrics,
  availableExams = [],
  myAttempts = [],
  scoreProgression = [],
  isLoading = false,
  error = null,
  onRetry,
  onNavigateTab,
  onStartExam
}) => {
  const firstName = currentUser?.name ? currentUser.name.split(' ')[0] : 'Student';
  const hasAttempts = myAttempts && myAttempts.length > 0;
  const hasUpcoming = availableExams && availableExams.length > 0;

  // Render Loading Skeleton
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading Overview">
        {/* Metric Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-[24px] border border-[#DDE1DA] bg-white p-6" />
          ))}
        </div>
        {/* Two-Column Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
          <div className="h-96 rounded-[24px] border border-[#DDE1DA] bg-white p-6" />
          <div className="h-96 rounded-[24px] border border-[#DDE1DA] bg-white p-6" />
        </div>
      </div>
    );
  }

  // Render Error State
  if (error) {
    return (
      <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-10 text-center space-y-4">
        <div className="size-12 rounded-2xl bg-amber-50 text-amber-700 mx-auto flex items-center justify-center">
          <AlertCircle className="size-6" />
        </div>
        <h3 className="text-lg font-bold text-[#171819]">Unable to load overview data</h3>
        <p className="text-xs text-[#777D78] max-w-md mx-auto">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-5 py-2.5 rounded-full bg-[#191A1D] text-[#EDFF72] text-xs font-bold hover:bg-black transition-colors cursor-pointer"
          >
            Retry Loading
          </button>
        )}
      </div>
    );
  }

  // SVG Chart Calculation for Score Progression
  const chartPoints = (scoreProgression && scoreProgression.length > 0)
    ? scoreProgression
    : myAttempts
        .filter((a) => a.status === 'SUBMITTED' || a.status === 'submitted')
        .slice(-7)
        .map((a, i) => ({
          date: a.submittedAt ? new Date(a.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `T${i + 1}`,
          score: Math.round(a.percentage ?? (a.maxScore > 0 ? (a.totalScore / a.maxScore) * 100 : a.totalScore ?? 0)),
          title: a.examId?.title || 'Assessment'
        }));

  const svgWidth = 600;
  const svgHeight = 220;
  const paddingX = 40;
  const paddingY = 30;

  let pathD = '';
  let areaD = '';
  const coordinates = [];

  if (chartPoints.length > 1) {
    const minVal = 0;
    const maxVal = 100;
    const stepX = (svgWidth - paddingX * 2) / (chartPoints.length - 1);

    chartPoints.forEach((pt, idx) => {
      const x = paddingX + idx * stepX;
      const normalizedY = (pt.score - minVal) / (maxVal - minVal);
      const y = svgHeight - paddingY - normalizedY * (svgHeight - paddingY * 2);
      coordinates.push({ x, y, pt });
    });

    pathD = coordinates.reduce((acc, curr, idx) => {
      if (idx === 0) return `M ${curr.x} ${curr.y}`;
      const prev = coordinates[idx - 1];
      const cx = (prev.x + curr.x) / 2;
      return `${acc} C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
    }, '');

    const last = coordinates[coordinates.length - 1];
    const first = coordinates[0];
    areaD = `${pathD} L ${last.x} ${svgHeight - paddingY} L ${first.x} ${svgHeight - paddingY} Z`;
  }

  return (
    <div className="space-y-6">
      {/* ── 1. FOUR METRIC CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Tests Attempted */}
        <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 lg:p-6 shadow-xs hover:-translate-y-0.5 transition-transform flex flex-col justify-between min-h-[130px]">
          <div className="flex items-center justify-between text-[#777D78]">
            <span className="text-xs font-semibold tracking-wide uppercase">Tests Attempted</span>
            <div className="size-8 rounded-xl bg-[#F2F3F0] flex items-center justify-center text-[#171819]">
              <FileCheck2 className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold font-mono tracking-tight text-[#171819]">
              {metrics?.testsAttempted ?? myAttempts.length}
            </div>
            <p className="text-[11px] text-[#777D78] mt-0.5">Total recorded attempts</p>
          </div>
        </div>

        {/* 2. Completed Tests */}
        <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 lg:p-6 shadow-xs hover:-translate-y-0.5 transition-transform flex flex-col justify-between min-h-[130px]">
          <div className="flex items-center justify-between text-[#777D78]">
            <span className="text-xs font-semibold tracking-wide uppercase">Completed</span>
            <div className="size-8 rounded-xl bg-[#F2F3F0] flex items-center justify-center text-[#171819]">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold font-mono tracking-tight text-[#171819]">
              {metrics?.completed ?? myAttempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'submitted').length}
            </div>
            <p className="text-[11px] text-[#777D78] mt-0.5">Submitted examinations</p>
          </div>
        </div>

        {/* 3. Average Score (LIME CARD) */}
        <div className="rounded-[24px] border border-[#DDE1DA] bg-[#EDFF72] p-5 lg:p-6 shadow-xs hover:-translate-y-0.5 transition-transform flex flex-col justify-between min-h-[130px] text-[#171819]">
          <div className="flex items-center justify-between text-[#171819]/80">
            <span className="text-xs font-bold tracking-wide uppercase">Average Score</span>
            <div className="size-8 rounded-xl bg-[#171819] flex items-center justify-center text-[#EDFF72]">
              <Percent className="size-4 stroke-[2.5]" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold font-mono tracking-tight text-[#171819]">
              {metrics?.averageScore ?? 0}%
            </div>
            <p className="text-[11px] font-semibold text-[#171819]/70 mt-0.5">Across all completed tests</p>
          </div>
        </div>

        {/* 4. Upcoming Tests */}
        <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 lg:p-6 shadow-xs hover:-translate-y-0.5 transition-transform flex flex-col justify-between min-h-[130px]">
          <div className="flex items-center justify-between text-[#777D78]">
            <span className="text-xs font-semibold tracking-wide uppercase">Upcoming</span>
            <div className="size-8 rounded-xl bg-[#F2F3F0] flex items-center justify-center text-[#171819]">
              <Calendar className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold font-mono tracking-tight text-[#171819]">
              {availableExams.length}
            </div>
            <p className="text-[11px] text-[#777D78] mt-0.5">Scheduled or open tests</p>
          </div>
        </div>
      </div>

      {/* ── 2. TWO-COLUMN ROW: UPCOMING ASSESSMENTS & SCORE PROGRESSION ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
        {/* Left Column: Upcoming Assessments */}
        <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-[#DDE1DA] mb-4">
            <div>
              <h2 className="text-base font-bold text-[#171819]">Upcoming Assessments</h2>
              <p className="text-xs text-[#777D78]">Examinations available to attempt or scheduled soon</p>
            </div>
            {hasUpcoming && (
              <button
                type="button"
                onClick={() => onNavigateTab('my-tests', '/student/tests')}
                className="text-xs font-bold text-[#171819] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View all</span>
                <ArrowRight className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 flex flex-col justify-center">
            {hasUpcoming ? (
              <div className="space-y-3">
                {availableExams.slice(0, 4).map((exam) => (
                  <div
                    key={exam._id || exam.examCode}
                    className="p-4 rounded-[18px] border border-[#DDE1DA] bg-[#F2F3F0]/60 hover:bg-[#F2F3F0] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#191A1D] text-[#EDFF72]">
                          {exam.examCode}
                        </span>
                        <span className="text-xs font-medium text-[#777D78]">
                          {exam.sections?.[0]?.name || 'Assessment'}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-[#171819] truncate">{exam.title}</h3>
                      <div className="flex items-center gap-3 text-[11px] text-[#777D78] mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          <span>{exam.durationMinutes || 60} mins</span>
                        </span>
                        <span>·</span>
                        <span>{exam.totalMarks || 100} marks</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (onStartExam) {
                          onStartExam(exam.examCode);
                        } else {
                          onNavigateTab('join-test', '/student/join-test');
                        }
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#EDFF72] text-[#191A1D] text-xs font-bold hover:bg-[#d8ee4b] transition-colors cursor-pointer shrink-0 shadow-xs"
                    >
                      <span>Start Test</span>
                      <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center space-y-2">
                <div className="size-10 rounded-2xl bg-[#F2F3F0] text-[#777D78] mx-auto flex items-center justify-center">
                  <Calendar className="size-5" />
                </div>
                <h4 className="text-sm font-bold text-[#171819]">No upcoming assessments</h4>
                <p className="text-xs text-[#777D78] max-w-sm mx-auto">
                  When your instructor publishes or schedules a test, it will appear here.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigateTab('join-test', '/student/join-test')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#191A1D] text-[#EDFF72] text-xs font-bold hover:bg-black transition-colors cursor-pointer"
                  >
                    <span>Enter test code</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Score Progression */}
        <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-[#DDE1DA] mb-4">
            <div>
              <h2 className="text-base font-bold text-[#171819]">Score Progression</h2>
              <p className="text-xs text-[#777D78]">Performance trajectory across assessments</p>
            </div>
            {hasAttempts && (
              <button
                type="button"
                onClick={() => onNavigateTab('analytics', '/student/analytics')}
                className="text-xs font-bold text-[#171819] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Analytics</span>
                <ArrowRight className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 flex flex-col justify-center">
            {chartPoints.length > 1 ? (
              <div className="space-y-4">
                <div className="relative w-full aspect-[2/1] max-h-[220px]">
                  <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    className="w-full h-full overflow-visible"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#EDFF72" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#EDFF72" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {/* Gradient fill */}
                    {areaD && (
                      <path d={areaD} fill="url(#scoreAreaGrad)" />
                    )}

                    {/* Baseline indicator */}
                    <line
                      x1={paddingX}
                      y1={svgHeight - paddingY}
                      x2={svgWidth - paddingX}
                      y2={svgHeight - paddingY}
                      stroke="#DDE1DA"
                      strokeWidth="1.5"
                    />

                    {/* Score curve */}
                    {pathD && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#171819"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Coordinate points */}
                    {coordinates.map((c, i) => (
                      <g key={i}>
                        <circle cx={c.x} cy={c.y} r="5" fill="#EDFF72" stroke="#171819" strokeWidth="2.5" />
                      </g>
                    ))}
                  </svg>
                </div>

                {/* Score Pills */}
                <div className="flex items-center justify-between text-xs font-mono pt-2 border-t border-[#DDE1DA]">
                  {coordinates.map((c, i) => (
                    <div key={i} className="text-center">
                      <span className="block font-bold text-[#171819]">{c.pt.score}%</span>
                      <span className="block text-[10px] text-[#777D78]">{c.pt.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : chartPoints.length === 1 ? (
              <div className="p-6 rounded-[18px] bg-[#F2F3F0] text-center space-y-2">
                <div className="text-4xl font-bold font-mono text-[#171819]">{chartPoints[0].score}%</div>
                <div className="text-xs font-semibold text-[#171819]">{chartPoints[0].title}</div>
                <p className="text-[11px] text-[#777D78]">Complete more assessments to draw your progression curve.</p>
              </div>
            ) : (
              <div className="py-12 text-center space-y-2">
                <div className="size-10 rounded-2xl bg-[#F2F3F0] text-[#777D78] mx-auto flex items-center justify-center">
                  <TrendingUp className="size-5" />
                </div>
                <h4 className="text-sm font-bold text-[#171819]">No score history yet</h4>
                <p className="text-xs text-[#777D78] max-w-sm mx-auto">
                  Take and complete your first examination to begin tracking your score progression curve.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentOverviewPage;

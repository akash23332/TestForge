import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  ChevronDown,
  X,
  Plus,
  BookOpen,
  ClipboardList,
  CheckCircle2,
  Clock,
  ExternalLink,
  ArrowUpRight,
  Filter,
  Sparkles
} from 'lucide-react';
import { api } from '../../lib/api';

export const BentoStatisticsChart = ({
  exams = [],
  questions = [],
  currentUser,
  onNavigate,
  onSelectQuestion
}) => {
  // Date Range state
  const [selectedRange, setSelectedRange] = useState('7d'); // '7d' | '30d' | '90d' | 'this_year' | 'custom'
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Series visibility toggles (Legend)
  const [showAssessments, setShowAssessments] = useState(true);
  const [showQuestions, setShowQuestions] = useState(true);

  // Active hover and click selection state
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [selectedBucketKey, setSelectedBucketKey] = useState(null);

  // Backend fetched activity state (with instant client fallback)
  const [serverActivity, setServerActivity] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Range options definition
  const rangeOptions = [
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
    { id: '90d', label: 'Last 90 Days' },
    { id: 'this_year', label: 'This Year' },
    { id: 'custom', label: 'Custom Range' }
  ];

  // Fetch from backend activity endpoint whenever range or custom dates change
  useEffect(() => {
    let isMounted = true;
    const fetchActivity = async () => {
      setIsLoading(true);
      try {
        let url = `/exams/workspace/activity?range=${selectedRange}`;
        if (selectedRange === 'custom' && customStart && customEnd) {
          url += `&startDate=${encodeURIComponent(customStart)}&endDate=${encodeURIComponent(customEnd)}`;
        }
        const res = await api.get(url);
        if (isMounted && res.data?.data) {
          setServerActivity(res.data.data);
        }
      } catch (err) {
        // Handled silently: fallback computation runs automatically
        if (isMounted) setServerActivity(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchActivity();
    return () => {
      isMounted = false;
    };
  }, [selectedRange, customStart, customEnd]);

  // Client-side fallback aggregation ensuring 100% data continuity using actual createdAt timestamps
  const clientActivity = useMemo(() => {
    const now = new Date();
    let start;
    let end = new Date(now);
    let aggregation = 'daily';

    if (selectedRange === '7d') {
      start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      aggregation = 'daily';
    } else if (selectedRange === '30d') {
      start = new Date(now);
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      aggregation = 'daily';
    } else if (selectedRange === '90d') {
      start = new Date(now);
      start.setDate(now.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      aggregation = 'weekly';
    } else if (selectedRange === 'this_year') {
      start = new Date(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      aggregation = 'monthly';
    } else if (selectedRange === 'custom') {
      start = customStart ? new Date(customStart) : new Date(now.getTime() - 7 * 86400000);
      end = customEnd ? new Date(customEnd) : new Date(now);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      if (diffDays <= 31) aggregation = 'daily';
      else if (diffDays <= 120) aggregation = 'weekly';
      else aggregation = 'monthly';
    } else {
      start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      aggregation = 'daily';
    }

    // Filter faculty records strictly by createdAt timestamp and authenticated user
    const facultyUserId = currentUser?._id ? String(currentUser._id) : null;

    const filteredExams = exams.filter((e) => {
      if (!e.createdAt) return false;
      if (facultyUserId && e.createdBy && String(e.createdBy) !== facultyUserId) return false;
      const t = new Date(e.createdAt).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    const filteredQuestions = questions.filter((q) => {
      if (!q.createdAt) return false;
      if (facultyUserId && q.ownerId && String(q.ownerId) !== facultyUserId) return false;
      const t = new Date(q.createdAt).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    const buckets = [];

    if (aggregation === 'daily') {
      const current = new Date(start);
      while (current <= end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;

        const dayStart = new Date(current);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(current);
        dayEnd.setHours(23, 59, 59, 999);

        const dayExams = filteredExams.filter((e) => {
          const t = new Date(e.createdAt).getTime();
          return t >= dayStart.getTime() && t <= dayEnd.getTime();
        });

        const dayQuestions = filteredQuestions.filter((q) => {
          const t = new Date(q.createdAt).getTime();
          return t >= dayStart.getTime() && t <= dayEnd.getTime();
        });

        const label = current.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        const fullDate = current.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        buckets.push({
          key: dateKey,
          label,
          fullDate,
          assessmentsCount: dayExams.length,
          questionsCount: dayQuestions.length,
          totalCount: dayExams.length + dayQuestions.length,
          assessments: dayExams,
          questions: dayQuestions
        });

        current.setDate(current.getDate() + 1);
      }
    } else if (aggregation === 'weekly') {
      const current = new Date(start);
      let weekNum = 1;
      while (current <= end) {
        const weekStart = new Date(current);
        const weekEnd = new Date(current);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd > end) weekEnd.setTime(end.getTime());
        weekEnd.setHours(23, 59, 59, 999);

        const weekExams = filteredExams.filter((e) => {
          const t = new Date(e.createdAt).getTime();
          return t >= weekStart.getTime() && t <= weekEnd.getTime();
        });
        const weekQuestions = filteredQuestions.filter((q) => {
          const t = new Date(q.createdAt).getTime();
          return t >= weekStart.getTime() && t <= weekEnd.getTime();
        });

        const sLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const eLabel = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        buckets.push({
          key: `W${weekNum}-${sLabel}`,
          label: sLabel,
          fullDate: `${sLabel} - ${eLabel}`,
          assessmentsCount: weekExams.length,
          questionsCount: weekQuestions.length,
          totalCount: weekExams.length + weekQuestions.length,
          assessments: weekExams,
          questions: weekQuestions
        });

        current.setDate(current.getDate() + 7);
        weekNum++;
      }
    } else {
      // Monthly aggregation
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        const mStart = new Date(current.getFullYear(), current.getMonth(), 1, 0, 0, 0, 0);
        const mEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);

        const mExams = filteredExams.filter((e) => {
          const t = new Date(e.createdAt).getTime();
          return t >= mStart.getTime() && t <= mEnd.getTime();
        });
        const mQuestions = filteredQuestions.filter((q) => {
          const t = new Date(q.createdAt).getTime();
          return t >= mStart.getTime() && t <= mEnd.getTime();
        });

        const label = current.toLocaleDateString('en-US', { month: 'short' });
        const fullDate = current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        buckets.push({
          key: `${current.getFullYear()}-${current.getMonth() + 1}`,
          label,
          fullDate,
          assessmentsCount: mExams.length,
          questionsCount: mQuestions.length,
          totalCount: mExams.length + mQuestions.length,
          assessments: mExams,
          questions: mQuestions
        });

        current.setMonth(current.getMonth() + 1);
      }
    }

    return {
      buckets,
      totals: {
        totalAssessments: filteredExams.length,
        totalQuestions: filteredQuestions.length,
        totalActivity: filteredExams.length + filteredQuestions.length
      },
      period: {
        range: selectedRange,
        startDate: start,
        endDate: end,
        aggregation
      }
    };
  }, [exams, questions, currentUser, selectedRange, customStart, customEnd]);

  // Use server activity if present; fallback to clientActivity
  const activityData = serverActivity || clientActivity;
  const buckets = activityData.buckets || [];
  const totals = activityData.totals || { totalAssessments: 0, totalQuestions: 0, totalActivity: 0 };

  // Calculate clean, whole-integer Y-axis scale based on active series
  const { niceMax, yTicks } = useMemo(() => {
    let maxVal = 0;
    for (const b of buckets) {
      const aVal = showAssessments ? b.assessmentsCount : 0;
      const qVal = showQuestions ? b.questionsCount : 0;
      const total = aVal + qVal;
      if (total > maxVal) maxVal = total;
    }

    let step = 1;
    let targetMax = 4;

    if (maxVal <= 4) {
      targetMax = 4;
      step = 1;
    } else if (maxVal <= 8) {
      targetMax = 8;
      step = 2;
    } else if (maxVal <= 16) {
      targetMax = 16;
      step = 4;
    } else if (maxVal <= 40) {
      step = Math.ceil(maxVal / 4);
      targetMax = step * 4;
    } else {
      step = Math.ceil(maxVal / 4 / 5) * 5;
      targetMax = step * 4;
    }

    const ticks = [];
    for (let val = targetMax; val >= 0; val -= step) {
      ticks.push(val);
    }

    return { niceMax: targetMax, yTicks: ticks };
  }, [buckets, showAssessments, showQuestions]);

  // Selected bucket for the Activity Inspector drawer
  const selectedBucket = useMemo(() => {
    if (!selectedBucketKey) return null;
    return buckets.find((b) => b.key === selectedBucketKey) || null;
  }, [selectedBucketKey, buckets]);

  const currentRangeLabel =
    rangeOptions.find((r) => r.id === selectedRange)?.label || 'Filter Range';

  const chartHeightPx = 180;

  // Check if any creation activity exists in the selected period
  const hasActivity = totals.totalActivity > 0;

  return (
    <div className="w-full flex flex-col font-sans select-none">
      {/* ── 1. HEADER ROW: Title, Real Metrics, Series Toggles & Date Selector ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#DDE1DA]">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] flex items-center justify-center text-[#171819]">
              <BarChart3 className="w-4 h-4 stroke-[2.2]" />
            </span>
            <h3 className="text-lg font-extrabold text-[#171819] tracking-tight">
              Workspace Activity Analytics
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E9ECE7] text-[#171819] border border-[#DDE1DA]">
              {totals.totalActivity} events
            </span>
          </div>
          <p className="text-xs text-[#777D78]">
            Actual creation events for assessments and question repository items over time.
          </p>
        </div>

        {/* Right Controls: Series Legend Toggles & Date Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Legend Series Toggles */}
          <div className="flex items-center gap-2 bg-[#F2F3F0] p-1 rounded-2xl border border-[#DDE1DA]">
            {/* Assessments Series */}
            <button
              type="button"
              onClick={() => {
                // Prevent toggling off both series
                if (showAssessments && !showQuestions) return;
                setShowAssessments(!showAssessments);
              }}
              title="Click to toggle Assessments series"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                showAssessments
                  ? 'bg-white text-[#171819] shadow-xs'
                  : 'text-[#777D78] opacity-50 line-through'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#191A1D]" />
              <span>Assessments ({totals.totalAssessments})</span>
            </button>

            {/* Question Bank Series */}
            <button
              type="button"
              onClick={() => {
                if (showQuestions && !showAssessments) return;
                setShowQuestions(!showQuestions);
              }}
              title="Click to toggle Question Bank series"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                showQuestions
                  ? 'bg-white text-[#171819] shadow-xs'
                  : 'text-[#777D78] opacity-50 line-through'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#EDFF72] border border-[#CBD0C8]" />
              <span>Question Bank ({totals.totalQuestions})</span>
            </button>
          </div>

          {/* Date Filter Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsRangeOpen(!isRangeOpen)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white border border-[#DDE1DA] hover:border-[#171819] text-xs font-bold text-[#171819] shadow-2xs transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-[#777D78]" />
              <span>{currentRangeLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#777D78]" />
            </button>

            {isRangeOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-[#DDE1DA] rounded-2xl shadow-xl z-50 p-1.5 space-y-1">
                {rangeOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSelectedRange(opt.id);
                      setIsRangeOpen(false);
                      setSelectedBucketKey(null);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs font-bold rounded-xl transition-colors ${
                      selectedRange === opt.id
                        ? 'bg-[#191A1D] text-[#EDFF72]'
                        : 'text-[#171819] hover:bg-[#F2F3F0]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Custom Range Inline Date Pickers ── */}
      {selectedRange === 'custom' && (
        <div className="mt-3 p-3 bg-[#F2F3F0] border border-[#DDE1DA] rounded-2xl flex flex-wrap items-center gap-3 text-xs">
          <span className="font-bold text-[#171819]">Custom Interval:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[#777D78]">From:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-white border border-[#DDE1DA] rounded-lg px-2 py-1 text-xs text-[#171819] outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#777D78]">To:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-white border border-[#DDE1DA] rounded-lg px-2 py-1 text-xs text-[#171819] outline-none"
            />
          </div>
          {(customStart || customEnd) && (
            <button
              type="button"
              onClick={() => {
                setCustomStart('');
                setCustomEnd('');
              }}
              className="text-xs font-bold text-rose-600 hover:underline ml-auto"
            >
              Reset Custom Range
            </button>
          )}
        </div>
      )}

      {/* ── 2. MAIN STACKED BAR CHART CANVAS ── */}
      <div className="relative w-full mt-6 pt-2 pb-2">
        {/* Empty State Overlay if no activity in this range */}
        {!hasActivity && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs rounded-2xl text-center p-6 space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-[#F2F3F0] text-[#777D78] flex items-center justify-center">
              <Calendar className="w-5 h-5 stroke-[1.8]" />
            </div>
            <h4 className="text-sm font-bold text-[#171819]">
              No Creation Activity in {currentRangeLabel}
            </h4>
            <p className="text-xs text-[#777D78] max-w-xs">
              No new assessments or questions were created in this time window. Create an assessment or question to start tracking workspace telemetry.
            </p>
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('paper')}
                className="px-3.5 py-1.5 rounded-xl bg-[#191A1D] hover:bg-[#282a2f] text-[#EDFF72] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Create Assessment
              </button>
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('create')}
                className="px-3.5 py-1.5 rounded-xl bg-white border border-[#DDE1DA] hover:border-[#171819] text-[#171819] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add Question
              </button>
            </div>
          </div>
        )}

        {/* Integer Y-Axis Labels */}
        <div
          className="absolute left-0 top-0 w-8 flex flex-col justify-between text-[11px] font-mono font-bold text-[#777D78] select-none pointer-events-none"
          style={{ height: `${chartHeightPx}px` }}
        >
          {yTicks.map((val) => (
            <span key={val} className="text-right pr-2">
              {val}
            </span>
          ))}
        </div>

        {/* Horizontal Background Grid Lines */}
        <div
          className="absolute left-8 right-0 top-0 flex flex-col justify-between pointer-events-none"
          style={{ height: `${chartHeightPx}px` }}
        >
          {yTicks.map((val) => (
            <div key={val} className="w-full border-b border-[#DDE1DA]/60" />
          ))}
        </div>

        {/* Bars Container */}
        <div
          className="w-full pl-10 flex items-end justify-between gap-1.5 sm:gap-3 overflow-x-auto scrollbar-none"
          style={{ height: `${chartHeightPx}px` }}
        >
          {buckets.map((bucket, idx) => {
            const aCount = showAssessments ? bucket.assessmentsCount : 0;
            const qCount = showQuestions ? bucket.questionsCount : 0;
            const totalVisible = aCount + qCount;

            const isHovered = hoveredIndex === idx;
            const isSelected = selectedBucketKey === bucket.key;

            // Height computations in pixels
            const totalHeightPx =
              niceMax > 0 ? (totalVisible / niceMax) * (chartHeightPx - 10) : 0;
            const assessmentsHeightPx =
              totalVisible > 0 ? (aCount / totalVisible) * totalHeightPx : 0;
            const questionsHeightPx =
              totalVisible > 0 ? (qCount / totalVisible) * totalHeightPx : 0;

            const hasAnyData = bucket.totalCount > 0;

            return (
              <div
                key={bucket.key}
                className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer min-w-[24px]"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => {
                  setSelectedBucketKey(selectedBucketKey === bucket.key ? null : bucket.key);
                }}
              >
                {/* ── Interactive Floating Tooltip on Hover ── */}
                {isHovered && (
                  <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col items-center whitespace-nowrap animate-fadeIn">
                    <div className="bg-[#191A1D] text-white text-xs font-semibold py-2 px-3 rounded-2xl shadow-2xl border border-stone-800 space-y-1.5 min-w-[170px]">
                      <div className="flex items-center justify-between pb-1 border-b border-stone-800">
                        <span className="font-bold text-white text-[11px]">{bucket.fullDate}</span>
                        <span className="text-[10px] font-mono text-[#EDFF72] bg-[#EDFF72]/15 px-1.5 py-0.5 rounded-md font-bold">
                          {bucket.totalCount} total
                        </span>
                      </div>

                      <div className="space-y-1 text-[11px]">
                        <div className="flex items-center justify-between gap-3 text-stone-300">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#191A1D] border border-white" />
                            <span>Assessments:</span>
                          </span>
                          <span className="font-bold text-white font-mono">
                            {bucket.assessmentsCount}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 text-stone-300">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#EDFF72]" />
                            <span>Question Bank:</span>
                          </span>
                          <span className="font-bold text-[#EDFF72] font-mono">
                            {bucket.questionsCount}
                          </span>
                        </div>
                      </div>

                      <div className="pt-1 border-t border-stone-800 text-[10px] text-stone-400 text-center">
                        Click bar to inspect activity details ↗
                      </div>
                    </div>
                    {/* Tooltip pointer triangle */}
                    <div className="w-2.5 h-2.5 bg-[#191A1D] rotate-45 -mt-1.5" />
                  </div>
                )}

                {/* ── Stacked Bar Representation ── */}
                {totalVisible > 0 ? (
                  <div
                    className={`w-full max-w-[28px] flex flex-col items-center justify-end rounded-t-xl overflow-hidden transition-all duration-300 ${
                      isSelected
                        ? 'ring-2 ring-[#191A1D] ring-offset-2 scale-105'
                        : isHovered
                        ? 'scale-105 shadow-md -translate-y-1'
                        : ''
                    }`}
                    style={{ height: `${Math.max(6, totalHeightPx)}px` }}
                  >
                    {/* Top Segment: Question Bank (Lime #EDFF72) */}
                    {questionsHeightPx > 0 && (
                      <div
                        className="w-full bg-[#EDFF72] border-t border-x border-[#D5E65C] transition-all duration-300"
                        style={{ height: `${questionsHeightPx}px` }}
                        title={`${bucket.questionsCount} Questions added`}
                      />
                    )}

                    {/* Bottom Segment: Assessments (Black #191A1D) */}
                    {assessmentsHeightPx > 0 && (
                      <div
                        className="w-full bg-[#191A1D] transition-all duration-300"
                        style={{ height: `${assessmentsHeightPx}px` }}
                        title={`${bucket.assessmentsCount} Assessments created`}
                      />
                    )}
                  </div>
                ) : (
                  /* Empty Slot Indicator Bar */
                  <div
                    className={`w-full max-w-[28px] h-1.5 rounded-full transition-all ${
                      hasAnyData
                        ? 'bg-stone-300'
                        : 'bg-transparent border border-dashed border-[#DDE1DA]'
                    } ${isHovered ? 'bg-[#191A1D]/20' : ''}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* ── X-Axis Date Labels ── */}
        <div className="w-full pl-10 flex items-center justify-between gap-1.5 sm:gap-3 mt-2 pt-2 border-t border-[#DDE1DA]">
          {buckets.map((bucket, idx) => {
            const isHovered = hoveredIndex === idx;
            const isSelected = selectedBucketKey === bucket.key;
            return (
              <span
                key={bucket.key}
                onClick={() => {
                  setSelectedBucketKey(selectedBucketKey === bucket.key ? null : bucket.key);
                }}
                className={`flex-1 text-center text-[10px] font-semibold transition-colors select-none truncate cursor-pointer ${
                  isSelected
                    ? 'text-[#191A1D] font-extrabold underline'
                    : isHovered
                    ? 'text-[#191A1D] font-bold'
                    : 'text-[#777D78]'
                }`}
                title={bucket.fullDate}
              >
                {bucket.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── 3. ACTIVITY DETAILS INSPECTOR (Appears when a bar is clicked) ── */}
      {selectedBucket && (
        <div className="mt-5 p-4 sm:p-5 bg-[#F2F3F0] border border-[#DDE1DA] rounded-2xl animate-fadeIn space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-white border border-[#DDE1DA] flex items-center justify-center text-[#171819]">
                <Calendar className="w-3.5 h-3.5" />
              </span>
              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-[#171819]">
                  Activity Log: {selectedBucket.fullDate}
                </h4>
                <span className="text-[11px] text-[#777D78]">
                  {selectedBucket.assessmentsCount} Assessments · {selectedBucket.questionsCount} Questions added
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedBucketKey(null)}
              className="p-1.5 rounded-xl bg-white text-[#777D78] hover:text-[#171819] border border-[#DDE1DA] transition-colors cursor-pointer"
              title="Close activity drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {selectedBucket.totalCount === 0 ? (
            <div className="text-center py-6 text-xs text-[#777D78]">
              No creation events were recorded on this date.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Assessments Created Column */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#171819]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#191A1D]" />
                    <span>Assessments Created ({selectedBucket.assessments.length})</span>
                  </span>
                </div>

                {selectedBucket.assessments.length === 0 ? (
                  <p className="text-xs text-[#777D78] italic bg-white p-3 rounded-xl border border-[#DDE1DA]">
                    No assessments were created on this date.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedBucket.assessments.map((ex) => (
                      <div
                        key={ex._id}
                        className="p-3 bg-white border border-[#DDE1DA] rounded-xl flex items-center justify-between shadow-2xs gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <h5 className="text-xs font-bold text-[#171819] truncate">{ex.title}</h5>
                          <span className="text-[10px] text-[#777D78] block font-mono">
                            Code: {ex.examCode} · {ex.durationMinutes} min
                          </span>
                        </div>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            ex.status === 'LIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {ex.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Questions Added Column */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#171819]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#EDFF72] border border-[#CBD0C8]" />
                    <span>Questions Added ({selectedBucket.questions.length})</span>
                  </span>
                </div>

                {selectedBucket.questions.length === 0 ? (
                  <p className="text-xs text-[#777D78] italic bg-white p-3 rounded-xl border border-[#DDE1DA]">
                    No questions were added to the repository on this date.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedBucket.questions.map((q) => (
                      <div
                        key={q._id}
                        onClick={() => {
                          if (onSelectQuestion) onSelectQuestion(q);
                          if (onNavigate) onNavigate('bank');
                        }}
                        className="p-3 bg-white border border-[#DDE1DA] hover:border-[#171819] rounded-xl flex items-center justify-between shadow-2xs gap-2 cursor-pointer transition-colors"
                        title="Click to view question in Question Bank"
                      >
                        <div className="min-w-0 flex-1">
                          <h5 className="text-xs font-bold text-[#171819] truncate">{q.title}</h5>
                          <span className="text-[10px] text-[#777D78] uppercase font-mono">
                            [{q.language}] · {q.difficulty}
                          </span>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#E9ECE7] text-[#171819] flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                          <span>View</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BentoStatisticsChart;

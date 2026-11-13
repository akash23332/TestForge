import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import {
  LayoutDashboard,
  FileText,
  KeyRound,
  Calendar,
  History,
  BarChart3,
  BookOpen,
  Bell,
  User,
  Settings,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Video,
  Mic,
  Wifi,
  Sparkles,
  Flame,
  Award,
  Layers,
  LogOut,
  Sliders,
  Check
} from 'lucide-react';
import { StudentPortalContainer } from './StudentPortalContainer';
import { StudentResultsView } from './StudentResultsView';
import { StudentLayout } from './StudentLayout';
import { StudentLandingView } from './StudentLandingView';

// 3D Card Tilt Component (Perspective 900px, max 5deg, fine pointers only)
const TiltCard = ({ children, className = '' }) => {
  const cardRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -4;
    const rotateY = ((x - centerX) / centerX) * 4;
    setTilt({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 0.15s ease-out'
      }}
      className={className}
    >
      {children}
    </div>
  );
};

// Count-Up Number Component
const CountUp = ({ value = 0, suffix = '', duration = 800 }) => {
  const [displayVal, setDisplayVal] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayVal(Number(value) || 0);
      return;
    }

    let startTimestamp = null;
    const startVal = 0;
    const endVal = Number(value) || 0;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayVal(Math.floor(easeProgress * (endVal - startVal) + startVal));

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayVal(endVal);
      }
    };

    window.requestAnimationFrame(step);
  }, [value, duration]);

  return (
    <span>
      {displayVal}
      {suffix}
    </span>
  );
};

export const StudentDashboardView = ({
  currentUser,
  onSignOut,
  initialTab = 'dashboard',
  onNavigateTab
}) => {
  // Navigation tab state
  const [activeTab, setActiveTab] = useState(initialTab || 'dashboard');

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (tabId, path) => {
    setActiveTab(tabId);
    if (onNavigateTab) {
      onNavigateTab(tabId, path);
    }
  };

  // Quick Join Modal
  const [quickJoinCode, setQuickJoinCode] = useState('');
  const [quickJoinModalOpen, setQuickJoinModalOpen] = useState(false);

  // Active Flow States
  const [activeTakingCode, setActiveTakingCode] = useState(null);
  const [viewingResult, setViewingResult] = useState(null);

  // Real Backend Data States
  const [isLoading, setIsLoading] = useState(true);
  const [availableExams, setAvailableExams] = useState([]);
  const [myAttempts, setMyAttempts] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [testStatusFilter, setTestStatusFilter] = useState('ALL');
  const [errorNotice, setErrorNotice] = useState('');

  // Fetch authentic backend data
  const fetchData = async () => {
    setIsLoading(true);
    setErrorNotice('');
    try {
      const [examsRes, attemptsRes, analyticsRes, notifsRes] = await Promise.allSettled([
        api.get('/attempts/my/available-exams'),
        api.get('/attempts/my/history'),
        api.get('/attempts/my/analytics'),
        api.get('/attempts/my/notifications')
      ]);

      if (examsRes.status === 'fulfilled') {
        setAvailableExams(examsRes.value.data?.data || []);
      }
      if (attemptsRes.status === 'fulfilled') {
        setMyAttempts(attemptsRes.value.data?.data || []);
      }
      if (analyticsRes.status === 'fulfilled') {
        setAnalyticsData(analyticsRes.value.data?.data || null);
      }
      if (notifsRes.status === 'fulfilled') {
        const notifPayload = notifsRes.value.data?.data;
        if (notifPayload) {
          setNotifications(notifPayload.notifications || []);
          setUnreadCount(notifPayload.unreadCount || 0);
        }
      }
    } catch {
      // Degraded / offline state
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute metrics strictly from real backend database numbers
  const metrics = useMemo(() => {
    const raw = analyticsData?.metrics;
    const submittedAttempts = myAttempts.filter((a) => a.status === 'submitted');

    let calculatedAvgScore = 0;
    let questionsSolvedCount = 0;

    if (submittedAttempts.length > 0) {
      let sum = 0;
      let total = 0;
      submittedAttempts.forEach((a) => {
        sum += a.score || 0;
        total += a.examId?.totalMarks || 100;
        if (Array.isArray(a.answers)) {
          questionsSolvedCount += a.answers.length;
        }
      });
      calculatedAvgScore = total > 0 ? Math.round((sum / total) * 100) : 0;
    }

    // Calculate real distinct active submission dates
    const uniqueDays = new Set(
      submittedAttempts
        .map((a) => a.submittedAt || a.createdAt)
        .filter(Boolean)
        .map((d) => new Date(d).toISOString().split('T')[0])
    );

    return {
      testsAttempted: raw?.testsAttempted ?? myAttempts.length,
      completed: raw?.completed ?? submittedAttempts.length,
      averageScore: raw?.averageScore ?? calculatedAvgScore,
      accuracy: raw?.accuracy ?? calculatedAvgScore,
      upcoming: raw?.upcoming ?? availableExams.length,
      streak: raw?.streak ?? uniqueDays.size,
      questionsSolved: raw?.questionsSolved ?? questionsSolvedCount
    };
  }, [analyticsData, myAttempts, availableExams]);

  // Real score progression data from backend
  const scoreProgression = useMemo(() => {
    return analyticsData?.scoreProgression || [];
  }, [analyticsData]);

  // Real subject performance breakdown from backend
  const subjectPerformance = useMemo(() => {
    return analyticsData?.subjectPerformance || [];
  }, [analyticsData]);

  // Exam launch
  const startExamWithCode = (code) => {
    if (!code || !code.trim()) {
      setErrorNotice('Please provide a valid examination code.');
      return;
    }
    setErrorNotice('');
    setActiveTakingCode(code.trim().toUpperCase());
  };

  // Active exam taking
  if (activeTakingCode) {
    return (
      <StudentPortalContainer
        initialExamCode={activeTakingCode}
        currentUser={currentUser}
        onExit={() => {
          setActiveTakingCode(null);
          fetchData();
        }}
      />
    );
  }

  // Active result report
  if (viewingResult) {
    return (
      <StudentResultsView
        attemptId={viewingResult}
        onBack={() => setViewingResult(null)}
      />
    );
  }

  return (
    <StudentLayout
      activeTab={activeTab}
      onNavigate={handleTabChange}
      onSignOut={onSignOut}
      currentUser={currentUser}
      unreadCount={unreadCount}
      onOpenQuickJoin={() => setQuickJoinModalOpen(true)}
    >
      <div className="w-full space-y-5">
        {/* Error Notice */}
        {errorNotice && (
          <div className="flex items-center justify-between rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4" />
              <span>{errorNotice}</span>
            </div>
            <button
              onClick={() => setErrorNotice('')}
              className="text-xs text-rose-500 hover:text-rose-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* View Transitions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {/* ══════════════════════════════════════════════════════════════════
                TAB 1: OVERVIEW (Whitish Canvas + Bento Style Cards)
                ══════════════════════════════════════════════════════════════════ */}
            {/* TAB 0: MAIN DASHBOARD (3D Animated Reference from User Image) */}
            {activeTab === 'dashboard' && (
              <StudentLandingView
                currentUser={currentUser}
                onEnterPortal={() => handleTabChange('overview', '/student/overview')}
                onJoinWithCode={(code) => startExamWithCode(code)}
                onSignIn={() => {}}
                onNavigateHome={() => {
                  window.location.href = '/';
                }}
                onSignOut={onSignOut}
                onNavigateTab={handleTabChange}
              />
            )}

            {/* TAB 1: STUDENT OVERVIEW (Whitish Canvas + Bento Style Cards) */}
            {activeTab === 'overview' && (
              <div className="space-y-5">
                {/* Welcome Hero Banner (Matching Teacher Hero Banner) */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-[28px] border border-[#232528] bg-[#101112] p-6 sm:p-7 text-white shadow-md relative overflow-hidden">
                  <div className="relative z-10">
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EDFF72]/15 border border-[#EDFF72]/30 text-[#EDFF72] text-xs font-semibold mb-2.5">
                      <span className="size-1.5 rounded-full bg-[#EDFF72] animate-pulse" />
                      Student Workspace
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                      Welcome back, {currentUser?.name ? currentUser.name.split(' ')[0] : 'Student'}!
                    </h1>
                    <p className="text-xs text-[#A4A7A1] mt-1.5">
                      {new Date().toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric'
                      })}
                      {' • '}
                      Track your assessments, view released results, and advance your skills.
                    </p>
                  </div>

                  <div className="relative z-10 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuickJoinModalOpen(true)}
                      className="px-5 py-2.5 rounded-full bg-[#EDFF72] hover:bg-[#e2f560] text-[#191A1D] text-xs font-extrabold shadow-md transition-transform hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
                    >
                      <KeyRound className="size-4" />
                      <span>Join with Code</span>
                    </button>
                  </div>

                  {/* Subtle decorative glow */}
                  <div className="pointer-events-none absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-[#EDFF72]/10 blur-3xl" />
                </div>

                {/* 6 Metric Count-Up Cards (Whitish with Lime Average Score Accent) */}
                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
                  {/* 1. Questions Solved */}
                  <TiltCard className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 shadow-xs">
                    <span className="block text-xs font-semibold text-[#777D78]">Questions Solved</span>
                    <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-[#171819]">
                      <CountUp value={metrics.questionsSolved} />
                    </p>
                    <span className="mt-2 block text-[11px] text-[#777D78]">
                      {metrics.questionsSolved > 0 ? 'Verified answers' : 'Awaiting first test'}
                    </span>
                  </TiltCard>

                  {/* 2. Average Score (Electric Lime Card) */}
                  <TiltCard className="rounded-[24px] border border-[#EDFF72] bg-[#EDFF72] p-5 shadow-md text-[#191A1D]">
                    <span className="block text-xs font-extrabold text-[#191A1D]/80">Average Score</span>
                    <p className="mt-2 font-mono text-3xl font-black tracking-tight text-[#191A1D]">
                      <CountUp value={metrics.averageScore} suffix="%" />
                    </p>
                    <span className="mt-2 block text-[11px] font-bold text-[#191A1D]/70">
                      {metrics.completed > 0 ? 'Across released tests' : 'No graded tests yet'}
                    </span>
                  </TiltCard>

                  {/* 3. Learning Streak */}
                  <TiltCard className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="block text-xs font-semibold text-[#777D78]">Streak</span>
                      <Flame className="size-4 text-[#171819]" />
                    </div>
                    <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-[#171819]">
                      <CountUp value={metrics.streak} suffix="d" />
                    </p>
                    <span className="mt-2 block text-[11px] text-[#777D78]">
                      {metrics.streak > 0 ? 'Days active' : '0 days active'}
                    </span>
                  </TiltCard>

                  {/* 4. Tests Attempted */}
                  <TiltCard className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 shadow-xs">
                    <span className="block text-xs font-semibold text-[#777D78]">Attempted</span>
                    <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-[#171819]">
                      <CountUp value={metrics.testsAttempted} />
                    </p>
                    <span className="mt-2 block text-[11px] text-[#777D78]">
                      {metrics.testsAttempted > 0 ? 'Recorded sessions' : 'None yet'}
                    </span>
                  </TiltCard>

                  {/* 5. Completed */}
                  <TiltCard className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 shadow-xs">
                    <span className="block text-xs font-semibold text-[#777D78]">Completed</span>
                    <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-[#171819]">
                      <CountUp value={metrics.completed} />
                    </p>
                    <span className="mt-2 block text-[11px] text-[#777D78]">
                      {metrics.completed > 0 ? 'Submissions' : 'None submitted'}
                    </span>
                  </TiltCard>

                  {/* 6. Upcoming */}
                  <TiltCard className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 shadow-xs">
                    <span className="block text-xs font-semibold text-[#777D78]">Upcoming</span>
                    <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-[#171819]">
                      <CountUp value={metrics.upcoming} />
                    </p>
                    <span className="mt-2 block text-[11px] text-[#777D78]">
                      {metrics.upcoming > 0 ? 'Available exams' : 'All caught up'}
                    </span>
                  </TiltCard>
                </div>

                {/* Score Progression & Quick Actions */}
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
                  {/* Score Progression Chart Card */}
                  <div className="rounded-[28px] border border-[#DDE1DA] bg-white p-6 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-[#171819]">Score Progression</h3>
                        <p className="text-xs text-[#777D78]">Your verified percentage scores across recent assessments</p>
                      </div>
                      <span className="text-xs font-mono font-semibold text-[#171819] bg-[#F2F3F0] px-3 py-1 rounded-full border border-[#DDE1DA]">
                        {metrics.completed} Records
                      </span>
                    </div>

                    {scoreProgression.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/50 p-10 text-center">
                        <BarChart3 className="size-8 text-[#777D78]" />
                        <h4 className="mt-2 text-sm font-bold text-[#171819]">No Test Results Yet</h4>
                        <p className="mt-1 text-xs text-[#777D78] max-w-sm">
                          Complete your first examination to automatically generate your verified score progression chart.
                        </p>
                        <button
                          type="button"
                          onClick={() => setQuickJoinModalOpen(true)}
                          className="mt-4 px-4 py-2 rounded-xl bg-[#191A1D] hover:bg-black text-white text-xs font-bold transition-colors cursor-pointer"
                        >
                          Join Assessment Now
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-end gap-3 h-44 pt-4 px-2 border-b border-[#DDE1DA]">
                          {scoreProgression.map((item, idx) => (
                            <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                              <span className="text-[10px] font-mono font-bold text-[#171819] opacity-0 group-hover:opacity-100 transition-opacity">
                                {item.score}%
                              </span>
                              <div
                                style={{ height: `${Math.max(12, item.score)}%` }}
                                className="w-full max-w-[42px] rounded-t-lg bg-gradient-to-t from-[#EDFF72]/70 to-[#EDFF72] border-t-2 border-[#191A1D] transition-all group-hover:brightness-95 shadow-xs"
                              />
                              <span className="text-[10px] text-[#777D78] truncate w-full text-center">
                                {item.date}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-xs text-[#777D78] pt-1">
                          <span>Early Sessions</span>
                          <span>Latest Completed</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Action Shortcuts Card */}
                  <div className="rounded-[28px] border border-[#DDE1DA] bg-white p-6 shadow-xs flex flex-col justify-between">
                    <div>
                      <h3 className="text-base font-bold text-[#171819]">Quick Actions</h3>
                      <p className="text-xs text-[#777D78] mb-4">Direct shortcuts to candidate tools</p>

                      <div className="space-y-2.5">
                        <button
                          type="button"
                          onClick={() => setQuickJoinModalOpen(true)}
                          className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#F2F3F0] hover:bg-[#E9ECE7] border border-[#DDE1DA] text-left text-xs font-bold text-[#171819] transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-xl bg-[#EDFF72] text-[#191A1D] flex items-center justify-center font-bold shadow-xs">
                              <KeyRound className="size-4" />
                            </div>
                            <div>
                              <span className="block font-bold">Join Assessment</span>
                              <span className="block text-[11px] font-normal text-[#777D78]">Enter access PIN code</span>
                            </div>
                          </div>
                          <ChevronRight className="size-4 text-[#777D78] group-hover:translate-x-0.5 transition-transform" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTabChange('test-history', '/student/history')}
                          className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#F2F3F0] hover:bg-[#E9ECE7] border border-[#DDE1DA] text-left text-xs font-bold text-[#171819] transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-xl bg-white border border-[#DDE1DA] text-[#171819] flex items-center justify-center font-bold">
                              <History className="size-4" />
                            </div>
                            <div>
                              <span className="block font-bold">Test History</span>
                              <span className="block text-[11px] font-normal text-[#777D78]">Review past attempts</span>
                            </div>
                          </div>
                          <ChevronRight className="size-4 text-[#777D78] group-hover:translate-x-0.5 transition-transform" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTabChange('learning', '/student/learning')}
                          className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#F2F3F0] hover:bg-[#E9ECE7] border border-[#DDE1DA] text-left text-xs font-bold text-[#171819] transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-xl bg-white border border-[#DDE1DA] text-[#171819] flex items-center justify-center font-bold">
                              <BookOpen className="size-4" />
                            </div>
                            <div>
                              <span className="block font-bold">My Learning</span>
                              <span className="block text-[11px] font-normal text-[#777D78]">Strengths & focus topics</span>
                            </div>
                          </div>
                          <ChevronRight className="size-4 text-[#777D78] group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-[#DDE1DA]">
                      <div className="flex items-center gap-2 text-[11px] text-[#777D78]">
                        <ShieldCheck className="size-4 text-[#171819]" />
                        <span>Zero-Leak Proctored Assessment Node</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Upcoming Assessments & Recent Activity (Whitish Cards) */}
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
                  {/* Left: Available Assessments */}
                  <div className="rounded-[28px] border border-[#DDE1DA] bg-white p-6 shadow-xs">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-[#171819]">Available Assessments</h3>
                        <p className="text-xs text-[#777D78]">Examinations currently open for participation</p>
                      </div>
                      {availableExams.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleTabChange('my-tests', '/student/tests')}
                          className="text-xs font-bold text-[#171819] hover:underline"
                        >
                          View all ({availableExams.length}) →
                        </button>
                      )}
                    </div>

                    {availableExams.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/50 p-8 text-center">
                        <Calendar className="size-8 text-[#777D78]" />
                        <h4 className="mt-2 text-sm font-bold text-[#171819]">No Active Exams</h4>
                        <p className="mt-1 text-xs text-[#777D78]">
                          Ask your instructor for an assessment access PIN code.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {availableExams.slice(0, 3).map((exam) => (
                          <div
                            key={exam._id}
                            className="flex items-center justify-between rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/60 p-4 hover:bg-[#F2F3F0] transition-colors"
                          >
                            <div className="min-w-0 flex-1 pr-4">
                              <div className="flex items-center gap-2">
                                <span className="rounded-md bg-[#EDFF72] px-2 py-0.5 font-mono text-[10px] font-bold text-[#191A1D]">
                                  {exam.examCode}
                                </span>
                                <span className="text-[11px] text-[#777D78]">
                                  {exam.durationMinutes} mins • {exam.totalMarks} marks
                                </span>
                              </div>
                              <h4 className="mt-1 text-sm font-bold text-[#171819] truncate">{exam.title}</h4>
                            </div>

                            <button
                              type="button"
                              onClick={() => startExamWithCode(exam.examCode)}
                              className="px-4 py-2 rounded-xl bg-[#191A1D] hover:bg-black text-white text-xs font-bold transition-transform hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
                            >
                              Start
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: Recent Attempt Activity */}
                  <div className="rounded-[28px] border border-[#DDE1DA] bg-white p-6 shadow-xs">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-[#171819]">Recent Activity</h3>
                        <p className="text-xs text-[#777D78]">Latest completed test sessions</p>
                      </div>
                      {myAttempts.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleTabChange('test-history', '/student/history')}
                          className="text-xs font-bold text-[#171819] hover:underline"
                        >
                          History →
                        </button>
                      )}
                    </div>

                    {myAttempts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/50 p-8 text-center">
                        <History className="size-8 text-[#777D78]" />
                        <h4 className="mt-2 text-sm font-bold text-[#171819]">No Attempts Recorded</h4>
                        <p className="mt-1 text-xs text-[#777D78]">
                          Your completed tests and scores will be logged here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {myAttempts.slice(0, 3).map((att) => (
                          <div
                            key={att._id}
                            className="flex items-center justify-between rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/60 p-4 hover:bg-[#F2F3F0] transition-colors"
                          >
                            <div className="min-w-0 flex-1 pr-3">
                              <span className="block text-xs font-bold text-[#171819] truncate">
                                {att.examId?.title || 'Assessment Attempt'}
                              </span>
                              <span className="block text-[11px] text-[#777D78] mt-0.5">
                                Score: {att.score ?? 0} / {att.examId?.totalMarks || 100}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setViewingResult(att._id)}
                              className="px-3 py-1.5 rounded-lg border border-[#DDE1DA] bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] transition-colors shrink-0 cursor-pointer"
                            >
                              Review
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                TAB 2: MY TESTS (Whitish Bento Card)
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'my-tests' && (
              <div className="rounded-[28px] border border-[#DDE1DA] bg-white p-6 shadow-xs space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative max-w-sm flex-1">
                    <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#777D78]" />
                    <input
                      type="text"
                      placeholder="Search assessments by title or code..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-full border border-[#DDE1DA] bg-[#F2F3F0] py-2.5 pl-10 pr-4 text-xs font-medium text-[#171819] outline-none focus:border-[#171819]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {['ALL', 'AVAILABLE', 'SCHEDULED'].map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setTestStatusFilter(filter)}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                          testStatusFilter === filter
                            ? 'bg-[#191A1D] text-white shadow-xs'
                            : 'bg-[#F2F3F0] text-[#777D78] hover:text-[#171819]'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {availableExams.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/50 p-12 text-center">
                    <FileText className="size-10 text-[#777D78]" />
                    <h4 className="mt-3 text-base font-bold text-[#171819]">No Assessments Found</h4>
                    <p className="mt-1 text-xs text-[#777D78]">
                      There are currently no active assessments matching your enrollment.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {availableExams
                      .filter((ex) => {
                        const matchesSearch =
                          ex.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ex.examCode?.toLowerCase().includes(searchQuery.toLowerCase());
                        if (testStatusFilter === 'ALL') return matchesSearch;
                        if (testStatusFilter === 'AVAILABLE') return matchesSearch && ex.status === 'LIVE';
                        if (testStatusFilter === 'SCHEDULED') return matchesSearch && ex.status !== 'LIVE';
                        return matchesSearch;
                      })
                      .map((exam) => (
                        <div
                          key={exam._id}
                          className="flex flex-col justify-between rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-5 hover:bg-white hover:shadow-xs transition-all"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="rounded-md bg-[#EDFF72] px-2 py-0.5 font-mono text-[10px] font-bold text-[#191A1D]">
                                {exam.examCode}
                              </span>
                              <span className="rounded-full border border-[#DDE1DA] bg-white px-2.5 py-0.5 text-[10px] font-semibold text-[#777D78]">
                                {exam.status === 'LIVE' ? 'Available' : 'Scheduled'}
                              </span>
                            </div>

                            <h4 className="mt-3 text-base font-bold text-[#171819]">{exam.title}</h4>
                            <p className="mt-1 text-xs text-[#777D78] line-clamp-2">
                              {exam.description || 'Comprehensive evaluation covering course competencies.'}
                            </p>

                            <div className="mt-4 flex items-center gap-3 text-xs text-[#777D78]">
                              <span className="flex items-center gap-1">
                                <Clock className="size-3.5" />
                                {exam.durationMinutes}m
                              </span>
                              <span>•</span>
                              <span>{exam.totalMarks} Marks</span>
                            </div>
                          </div>

                          <div className="mt-5 border-t border-[#DDE1DA] pt-4">
                            <button
                              type="button"
                              onClick={() => startExamWithCode(exam.examCode)}
                              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#191A1D] hover:bg-black py-2.5 text-xs font-bold text-white transition-all cursor-pointer"
                            >
                              <span>Enter Assessment</span>
                              <ArrowRight className="size-3.5 text-[#EDFF72]" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                TAB 3: JOIN TEST
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'join-test' && (
              <div className="mx-auto max-w-2xl rounded-[28px] border border-[#DDE1DA] bg-white p-8 sm:p-10 shadow-xs">
                <div className="text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#EDFF72] text-[#191A1D] shadow-xs">
                    <KeyRound className="size-6" />
                  </div>
                  <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-[#171819]">
                    Join Proctored Assessment
                  </h2>
                  <p className="mt-1.5 text-xs text-[#777D78]">
                    Enter the access PIN code provided by your instructor or institution.
                  </p>
                </div>

                <div className="mt-8 space-y-4">
                  <div>
                    <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[#777D78] mb-2">
                      Assessment Access PIN
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TF-DSA01"
                      value={quickJoinCode}
                      onChange={(e) => setQuickJoinCode(e.target.value.toUpperCase())}
                      className="w-full rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0] px-4 py-3.5 font-mono text-lg font-bold tracking-widest text-[#171819] outline-none focus:border-[#171819]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (quickJoinCode.trim()) {
                        startExamWithCode(quickJoinCode);
                      }
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#EDFF72] hover:bg-[#e2f560] py-3.5 text-sm font-extrabold text-[#191A1D] shadow-sm transition-all cursor-pointer"
                  >
                    <span>Verify & Enter Session</span>
                    <ArrowRight className="size-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                TAB 4: UPCOMING TESTS
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'upcoming-tests' && (
              <div className="rounded-[28px] border border-[#DDE1DA] bg-white p-6 shadow-xs space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-[#171819]">Upcoming Examinations</h3>
                  <p className="text-xs text-[#777D78]">Curriculum assessments scheduled for your candidate group</p>
                </div>

                {availableExams.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/50 p-12 text-center">
                    <Calendar className="size-10 text-[#777D78]" />
                    <h4 className="mt-3 text-base font-bold text-[#171819]">No Upcoming Examinations</h4>
                    <p className="mt-1 text-xs text-[#777D78]">You are fully caught up with all assigned tests.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableExams.map((exam) => (
                      <div
                        key={exam._id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-5 hover:bg-[#F2F3F0] transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-[#EDFF72] px-2 py-0.5 font-mono text-[10px] font-bold text-[#191A1D]">
                              {exam.examCode}
                            </span>
                            <span className="text-xs text-[#777D78]">
                              {exam.durationMinutes} mins • {exam.totalMarks} marks
                            </span>
                          </div>
                          <h4 className="mt-2 text-base font-bold text-[#171819]">{exam.title}</h4>
                          <p className="text-xs text-[#777D78] mt-0.5">{exam.description}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => startExamWithCode(exam.examCode)}
                          className="px-5 py-2.5 rounded-xl bg-[#191A1D] hover:bg-black text-white text-xs font-bold transition-all shrink-0 cursor-pointer"
                        >
                          Enter Session
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                TAB 5: TEST HISTORY
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'test-history' && (
              <div className="rounded-[28px] border border-[#DDE1DA] bg-white p-6 shadow-xs space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-[#171819]">Test History & Results</h3>
                  <p className="text-xs text-[#777D78]">Full audit log of all completed assessments</p>
                </div>

                {myAttempts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/50 p-12 text-center">
                    <History className="size-10 text-[#777D78]" />
                    <h4 className="mt-3 text-base font-bold text-[#171819]">No Attempts Recorded</h4>
                    <p className="mt-1 text-xs text-[#777D78]">Your completed tests and results will appear here.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#DDE1DA] text-[#777D78] font-mono uppercase bg-[#F2F3F0]/60">
                        <tr>
                          <th className="py-3 px-4 rounded-l-xl">Assessment</th>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Score</th>
                          <th className="py-3 px-4 text-right rounded-r-xl">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DDE1DA]">
                        {myAttempts.map((att) => (
                          <tr key={att._id} className="hover:bg-[#F2F3F0]/40 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-[#171819]">
                              {att.examId?.title || 'Course Assessment'}
                            </td>
                            <td className="py-3.5 px-4 text-[#777D78]">
                              {new Date(att.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                {att.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-[#171819]">
                              {att.score ?? 0} / {att.examId?.totalMarks || 100}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => setViewingResult(att._id)}
                                className="px-3.5 py-1.5 rounded-lg border border-[#DDE1DA] bg-white hover:bg-[#F2F3F0] text-[#171819] font-bold transition-colors cursor-pointer"
                              >
                                View Report
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                TAB 6: ANALYTICS
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'analytics' && (
              <div className="space-y-6">
                <div className="rounded-[28px] border border-[#DDE1DA] bg-white p-6 shadow-xs">
                  <h3 className="text-lg font-bold text-[#171819]">Performance Analytics</h3>
                  <p className="text-xs text-[#777D78] mb-6">Subject breakdown and competency progression</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-5">
                      <h4 className="text-sm font-bold text-[#171819] mb-3">Overall Accuracy</h4>
                      <div className="flex items-center gap-4">
                        <div className="font-mono text-5xl font-black text-[#171819]">
                          {metrics.accuracy}%
                        </div>
                        <p className="text-xs text-[#777D78]">
                          Calculated across all verified test attempts and automated coding evaluation passes.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-5">
                      <h4 className="text-sm font-bold text-[#171819] mb-3">Subject Proficiency</h4>
                      {subjectPerformance.length === 0 ? (
                        <p className="text-xs text-[#777D78]">Complete assessments to see topic competency curves.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {subjectPerformance.map((sub, idx) => (
                            <div key={idx}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-[#171819] font-medium">{sub.subject}</span>
                                <span className="font-mono font-bold text-[#171819]">{sub.score}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-[#DDE1DA] overflow-hidden">
                                <div
                                  style={{ width: `${sub.score}%` }}
                                  className="h-full bg-[#191A1D]"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                TAB 7: LEARNING
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'learning' && (
              <div className="rounded-[28px] border border-[#DDE1DA] bg-white p-6 shadow-xs space-y-4">
                <h3 className="text-lg font-bold text-[#171819]">My Learning Path</h3>
                <p className="text-xs text-[#777D78]">Automated topic mastery recommendations based on your test results</p>

                {subjectPerformance.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/50 p-10 text-center mt-4">
                    <BookOpen className="size-8 text-[#777D78]" />
                    <h4 className="mt-2 text-sm font-bold text-[#171819]">No Competency Data Available</h4>
                    <p className="mt-1 text-xs text-[#777D78] max-w-sm">
                      Complete your scheduled assessments to automatically derive your verified strong topics and personalized focus areas.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-5">
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Strong Competencies</span>
                      <ul className="mt-3 space-y-2 text-xs text-[#171819]">
                        {subjectPerformance.filter((s) => s.score >= 70).length === 0 ? (
                          <li className="text-xs text-[#777D78]">Continue assessments to demonstrate subject mastery.</li>
                        ) : (
                          subjectPerformance
                            .filter((s) => s.score >= 70)
                            .map((s, idx) => (
                              <li key={idx} className="flex items-center justify-between">
                                <span className="flex items-center gap-2">✓ {s.subject}</span>
                                <span className="font-mono text-emerald-700 font-bold">{s.score}%</span>
                              </li>
                            ))
                        )}
                      </ul>
                    </div>

                    <div className="rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-5">
                      <span className="text-xs font-bold text-[#171819] uppercase tracking-wider">Focus Areas</span>
                      <ul className="mt-3 space-y-2 text-xs text-[#171819]">
                        {subjectPerformance.filter((s) => s.score < 70).length === 0 ? (
                          <li className="text-xs text-[#777D78]">All evaluated subjects are currently above target proficiency!</li>
                        ) : (
                          subjectPerformance
                            .filter((s) => s.score < 70)
                            .map((s, idx) => (
                              <li key={idx} className="flex items-center justify-between">
                                <span className="flex items-center gap-2">✦ {s.subject}</span>
                                <span className="font-mono text-[#171819] font-bold">{s.score}%</span>
                              </li>
                            ))
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                TAB 8: PROFILE / SETTINGS
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'profile' && (
              <div className="max-w-2xl rounded-[28px] border border-[#DDE1DA] bg-white p-8 shadow-xs space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-[#171819]">Candidate Profile</h3>
                  <p className="text-xs text-[#777D78]">Your student credentials and session configuration</p>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block text-[#777D78] uppercase font-mono text-[10px] mb-1">Full Name</label>
                    <input
                      type="text"
                      disabled
                      value={currentUser?.name || 'Student Candidate'}
                      className="w-full rounded-xl border border-[#DDE1DA] bg-[#F2F3F0] p-3 text-[#171819] font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[#777D78] uppercase font-mono text-[10px] mb-1">Email Address</label>
                    <input
                      type="email"
                      disabled
                      value={currentUser?.email || 'student@testforge.edu'}
                      className="w-full rounded-xl border border-[#DDE1DA] bg-[#F2F3F0] p-3 text-[#171819] font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[#777D78] uppercase font-mono text-[10px] mb-1">Account Role</label>
                    <input
                      type="text"
                      disabled
                      value="Candidate (Student Portal)"
                      className="w-full rounded-xl border border-[#DDE1DA] bg-[#F2F3F0] p-3 text-[#171819] font-bold"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-[#DDE1DA] flex justify-between items-center">
                  <span className="text-xs text-[#777D78]">Session Active</span>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Log Out
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Quick Join Modal */}
        {quickJoinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="relative w-full max-w-md rounded-[28px] border border-[#DDE1DA] bg-white p-6 sm:p-8 text-[#171819] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#DDE1DA] pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-xl bg-[#EDFF72] text-[#191A1D] flex items-center justify-center font-bold shadow-xs">
                    <KeyRound className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#171819] tracking-tight">Quick Join Assessment</h3>
                    <p className="text-xs text-[#777D78]">Direct candidate session entry</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickJoinModalOpen(false)}
                  className="size-8 rounded-full bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] flex items-center justify-center transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-mono font-bold text-[#777D78] mb-2 uppercase tracking-wider">
                    Assessment Access PIN / Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TF-DSA01"
                    value={quickJoinCode}
                    onChange={(e) => setQuickJoinCode(e.target.value.toUpperCase())}
                    className="w-full rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] px-4 py-3 font-mono text-lg font-bold tracking-widest text-[#171819] outline-none focus:border-[#171819]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setQuickJoinModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-[#DDE1DA] bg-white text-xs font-bold text-[#777D78] hover:bg-[#F2F3F0] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (quickJoinCode.trim()) {
                        setQuickJoinModalOpen(false);
                        startExamWithCode(quickJoinCode);
                      }
                    }}
                    className="px-6 py-2.5 rounded-xl bg-[#EDFF72] hover:bg-[#e2f560] text-xs font-extrabold text-[#191A1D] shadow-xs transition-all cursor-pointer"
                  >
                    Verify & Enter →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default StudentDashboardView;

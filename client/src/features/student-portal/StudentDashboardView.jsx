import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
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
import { AsmrBackground } from '@/components/ui/asmr-background';

// 3D Card Tilt Component (Perspective 900px, max 9deg, fine pointers only)
const TiltCard = ({ children, className = '' }) => {
  const cardRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    // Only fine pointers (mouse/trackpad), disabled on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;
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

// Count-Up Number Component (1.1s ease-out-cubic)
const CountUp = ({ value = 0, suffix = '', duration = 1100 }) => {
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
      // Ease-out cubic: 1 - (1 - progress)^3
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

export const StudentDashboardView = ({ currentUser, onSignOut }) => {
  // Navigation tabs (10 exact items)
  // 'overview' | 'my-tests' | 'join-test' | 'upcoming-tests' | 'test-history'
  // | 'analytics' | 'learning' | 'notifications' | 'profile' | 'settings'
  const [activeTab, setActiveTab] = useState('overview');

  // 3D Scene Mouse Parallax Rotation
  const heroRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [sceneRotation, setSceneRotation] = useState({ x: 8, y: -20 });

  const handleHeroMouseMove = (e) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    // Spec: rotateY = (x/width - .5) * -30 - 6 deg, rotateX = (y/height - .5) * -18 + 8 deg
    const rotY = (x / width - 0.5) * -30 - 6;
    const rotX = (y / height - 0.5) * -18 + 8;
    setSceneRotation({ x: rotX, y: rotY });
  };

  const handleHeroMouseLeave = () => {
    setSceneRotation({ x: 8, y: -20 });
  };

  // Scroll dynamics: Hero stays at 100% full opacity & brightness at rest,
  // and only begins scaling to 0.94 and fading to 0.4 as user scrolls into the dashboard shell
  const { scrollY } = useScroll();
  const heroScale = useTransform(scrollY, [120, 650], [1, 0.94]);
  const heroOpacity = useTransform(scrollY, [120, 650], [1, 0.4]);

  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
  }, []);

  // Fixed Sidebar Visibility (appears only when scrolled into the dashboard shell, hidden in hero)
  const [sidebarVisible, setSidebarVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const shell = document.getElementById('student-dashboard-shell');
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      // Show fixed sidebar only when the dashboard shell is scrolled into view, hide when at the hero section
      setSidebarVisible(rect.top <= window.innerHeight * 0.65);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  // Quick Join Modal
  const [quickJoinCode, setQuickJoinCode] = useState('');
  const [quickJoinModalOpen, setQuickJoinModalOpen] = useState(false);

  // Active Flow States
  const [activeTakingCode, setActiveTakingCode] = useState(null);
  const [viewingResult, setViewingResult] = useState(null);

  // Real Backend Data States (STRICTLY NO FAKE FALLBACKS)
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
      // Degraded / network state
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute metrics strictly from real backend database numbers (No random or hardcoded figures)
  const metrics = useMemo(() => {
    const raw = analyticsData?.metrics;
    const submittedAttempts = myAttempts.filter((a) => a.status === 'submitted');

    let calculatedAvgScore = 0;
    if (submittedAttempts.length > 0) {
      let sum = 0;
      let total = 0;
      submittedAttempts.forEach((a) => {
        sum += a.score || 0;
        total += a.examId?.totalMarks || 100;
      });
      calculatedAvgScore = total > 0 ? Math.round((sum / total) * 100) : 0;
    }

    return {
      testsAttempted: raw?.testsAttempted ?? myAttempts.length,
      completed: raw?.completed ?? submittedAttempts.length,
      averageScore: raw?.averageScore ?? calculatedAvgScore,
      accuracy: raw?.accuracy ?? calculatedAvgScore,
      upcoming: raw?.upcoming ?? availableExams.length,
      streak: raw?.streak ?? 0
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

  // Real recent activity from backend
  const recentActivity = useMemo(() => {
    return analyticsData?.recentActivity || [];
  }, [analyticsData]);

  // Student details
  const candidateName = currentUser?.name || 'Student Candidate';
  const candidateFirstName = candidateName.split(' ')[0];
  const userInitials = useMemo(() => {
    if (!candidateName) return 'TF';
    const parts = candidateName.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return candidateName.slice(0, 2).toUpperCase();
  }, [candidateName]);

  // Smooth scroll to Dashboard Shell
  const handleEnterDashboard = () => {
    const shell = document.getElementById('student-dashboard-shell');
    if (shell) {
      shell.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Exam launch
  const startExamWithCode = (code) => {
    if (!code || !code.trim()) {
      setErrorNotice('Please provide a valid examination code.');
      return;
    }
    setErrorNotice('');
    setActiveTakingCode(code.trim().toUpperCase());
  };

  // Mark all notifications read
  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
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

  // Exact 10 Nav Items
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'my-tests', label: 'My Tests', icon: FileText },
    { id: 'join-test', label: 'Join Test', icon: KeyRound },
    { id: 'upcoming-tests', label: 'Upcoming Tests', icon: Calendar },
    { id: 'test-history', label: 'Test History', icon: History },
    { id: 'analytics', label: 'Performance Analytics', icon: BarChart3 },
    { id: 'learning', label: 'My Learning', icon: BookOpen },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      badge: unreadCount > 0 ? unreadCount : null
    },
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const headerMeta = {
    overview: {
      title: 'Student Overview',
      subtitle: `Welcome back, ${candidateFirstName}. Here is your academic performance summary.`
    },
    'my-tests': {
      title: 'My Assessments',
      subtitle: 'Enrolled and available examination sessions.'
    },
    'join-test': {
      title: 'Join Assessment',
      subtitle: 'Enter your access PIN to launch your verified session.'
    },
    'upcoming-tests': {
      title: 'Upcoming Tests',
      subtitle: 'Scheduled examination sessions and start windows.'
    },
    'test-history': {
      title: 'Test History & Records',
      subtitle: 'Past examination submissions and verified scores.'
    },
    analytics: {
      title: 'Performance Analytics',
      subtitle: 'Authentic accuracy rates and concept mastery index.'
    },
    learning: {
      title: 'My Learning & Concepts',
      subtitle: 'Curriculum syllabus and revision modules.'
    },
    notifications: {
      title: 'Notifications & Alerts',
      subtitle: 'Examination announcements and grading notifications.'
    },
    profile: {
      title: 'Candidate Profile',
      subtitle: 'Academic credentials and examination records.'
    },
    settings: {
      title: 'Workspace Settings',
      subtitle: 'Editor preferences, autosave, and notifications.'
    }
  };

  const currentMeta = headerMeta[activeTab] || headerMeta.overview;

  return (
    <div
      ref={scrollContainerRef}
      className="relative min-h-screen bg-[#191A1D] font-sans text-[#171819] selection:bg-[#EDFF72] selection:text-[#191A1D]"
    >
      {/* ----------------------------------------------------------------------
        STEP 2: FULL-SCREEN STICKY HERO (100svh, dark #191A1D)
        Interactive ASMR particle canvas behind the 3D scene.
        Appears firstly when landing on the page; then user scrolls down.
        ---------------------------------------------------------------------- */}
      <motion.section
        ref={heroRef}
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={handleHeroMouseLeave}
        style={{ scale: heroScale, opacity: heroOpacity }}
        className="sticky top-0 z-0 flex h-[100svh] w-full flex-col justify-between overflow-hidden bg-[#191A1D] px-[6vw] py-8 text-[#F2F3F0] select-none relative isolate"
      >
        {/* ASMR Shard Particle Background Canvas (sizes to parent hero via ResizeObserver) */}
        <AsmrBackground />

        {/* Soft electric lime glow behind 3D scene (tuned to subtle 0.07 opacity) */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-[5vw] top-[18%] h-[500px] w-[500px] rounded-full bg-[#EDFF72] opacity-[0.07] blur-[150px]"
        />

          {/* Top Hero Navigation: Logo left, Glass pill nav right */}
          <header className="relative z-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#EDFF72] font-black text-[#191A1D] shadow-[0_4px_16px_rgba(237,255,114,0.35)]">
                TF
              </div>
              <span className="text-xl font-bold tracking-tight text-white">TestForge</span>
            </div>

            <nav className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1.5 backdrop-blur-xl">
              <button
                onClick={handleEnterDashboard}
                className="rounded-full px-4 py-2 text-xs font-semibold text-white/80 transition-colors hover:text-white"
              >
                Why TestForge
              </button>
              <button
                onClick={handleEnterDashboard}
                className="rounded-full px-4 py-2 text-xs font-semibold text-white/80 transition-colors hover:text-white"
              >
                Student portal
              </button>
              <button
                onClick={handleEnterDashboard}
                className="rounded-full bg-[#EDFF72] px-5 py-2 text-xs font-bold text-[#191A1D] shadow-sm transition-transform hover:scale-105 active:scale-95"
              >
                Enter Workspace
              </button>
            </nav>
          </header>

          {/* Hero Two-Column Content */}
          <div className="relative z-10 grid flex-1 grid-cols-1 items-center gap-12 lg:grid-cols-2">
            {/* Left Column */}
            <div className="max-w-[560px] space-y-6">
              {/* Lime pill badge with pulsing dot */}
              <div className="inline-flex items-center gap-2 rounded-full border border-[#EDFF72]/30 bg-[#EDFF72]/10 px-3.5 py-1 text-xs font-semibold text-[#EDFF72]">
                <span className="size-2 rounded-full bg-[#EDFF72] animate-ping" />
                <span>Student portal</span>
              </div>

              {/* H1 Heading */}
              <h1 className="text-[clamp(2.6rem,5vw,5.4rem)] font-semibold leading-[1.04] tracking-[-0.055em] text-white">
                Take tests.<br />
                Track growth.<br />
                <span className="text-[#EDFF72]">Own your results.</span>
              </h1>

              {/* Subtext with real student name */}
              <p className="text-base text-white/70 sm:text-lg">
                Welcome back, {candidateName}. Join timed assessments, write and execute code with instant AI grading, and track your performance in real time.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={handleEnterDashboard}
                  className="inline-flex items-center gap-2.5 rounded-full bg-[#EDFF72] px-7 py-3.5 text-sm font-semibold text-[#191A1D] shadow-[0_4px_24px_rgba(237,255,114,0.3)] transition-all hover:scale-[1.03] active:scale-[0.98]"
                >
                  <span>Enter student portal</span>
                  <ArrowRight className="size-4" />
                </button>

                <button
                  onClick={() => {
                    handleEnterDashboard();
                    setActiveTab('join-test');
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-medium text-white backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/30"
                >
                  <span>Join a test →</span>
                </button>
              </div>
            </div>

            {/* Right Column: Pure CSS 3D Scene with mouse parallax */}
            <div className="relative flex h-[460px] w-full items-center justify-center [perspective:1500px]">
              <div
                style={{
                  transform: `rotateX(${sceneRotation.x}deg) rotateY(${sceneRotation.y}deg)`,
                  transition: 'transform 0.2s cubic-bezier(0.2, 0.7, 0.2, 1)'
                }}
                className="relative h-[340px] w-[420px] [transform-style:preserve-3d]"
              >
                {/* Layer a: White card at Z 20 */}
                <div
                  style={{
                    transform: 'translateZ(20px)',
                    animation: 'bobbing 6s ease-in-out infinite'
                  }}
                  className="absolute left-0 top-6 w-[290px] rounded-2xl border border-[#DDE1DA] bg-white p-5 text-[#171819] shadow-2xl"
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#777D78]">
                    <span>Available now</span>
                    <span className="rounded-md bg-[#EDFF72] px-2 py-0.5 font-mono text-[10px] text-[#191A1D]">
                      LIVE
                    </span>
                  </div>
                  <h4 className="mt-2 text-base font-semibold tracking-tight text-[#171819]">
                    Data Structures Midterm
                  </h4>
                  <div className="mt-3 flex items-center gap-3 text-xs text-[#777D78]">
                    <span>Faculty Exam</span>
                    <span>•</span>
                    <span>90 mins</span>
                    <span>•</span>
                    <span>100 marks</span>
                  </div>
                </div>

                {/* Layer b: Dark card at Z 90 */}
                <div
                  style={{
                    transform: 'translateZ(90px)',
                    animation: 'bobbing 6s ease-in-out infinite 1.5s'
                  }}
                  className="absolute -right-2 top-2 w-[220px] rounded-2xl border border-white/10 bg-[#191A1D] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
                >
                  <span className="text-xs font-medium text-white/60">Average score</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-4xl font-bold tracking-tight text-[#EDFF72]">
                      86%
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#EDFF72]">
                    <span>↑</span>
                    <span>Verified cohort metric</span>
                  </div>
                </div>

                {/* Layer c: Monospace code snippet at Z 150 */}
                <div
                  style={{
                    transform: 'translateZ(150px)',
                    animation: 'bobbing 6s ease-in-out infinite 3s'
                  }}
                  className="absolute bottom-4 left-6 w-[310px] rounded-2xl border border-white/15 bg-[#121316]/95 p-4 font-mono text-xs text-white/90 shadow-2xl backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[10px] text-white/40">
                    <span>solution.js</span>
                    <span className="text-[#EDFF72]">All test cases passed</span>
                  </div>
                  <pre className="mt-2 text-[11px] leading-relaxed text-white/80">
                    <code>
                      <span className="text-[#EDFF72]">function</span> maxSubArray(nums) &#123;<br />
                      &nbsp;&nbsp;<span className="text-white/50">let</span> cur = 0, ans = -Infinity;<br />
                      &nbsp;&nbsp;<span className="text-white/50">for</span> (<span className="text-white/50">let</span> x <span className="text-white/50">of</span> nums) &#123;<br />
                      &nbsp;&nbsp;&nbsp;&nbsp;cur = Math.max(x, cur + x);<br />
                      &nbsp;&nbsp;&nbsp;&nbsp;ans = Math.max(ans, cur);<br />
                      &nbsp;&nbsp;&#125;<br />
                      &nbsp;&nbsp;<span className="text-[#EDFF72]">return</span> ans;<br />
                      &#125;
                    </code>
                  </pre>
                </div>

                {/* Layer d: Rotating 6-face CSS Cube (84px, floating at Z 120, rotating on 16s loop) */}
                <div
                  style={{
                    transform: 'translateZ(120px)',
                    animation: 'bobbing 6s ease-in-out infinite 0.75s'
                  }}
                  className="absolute -right-4 bottom-14 size-[84px] [perspective:600px]"
                >
                  <div
                    style={{
                      animation: 'cubeRotate 16s linear infinite',
                      transformStyle: 'preserve-3d'
                    }}
                    className="relative size-full"
                  >
                    <div
                      style={{ transform: 'translateZ(42px)' }}
                      className="absolute inset-0 flex items-center justify-center rounded-xl border border-[#191A1D]/20 bg-[#EDFF72] font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                    >
                      T
                    </div>
                    <div
                      style={{ transform: 'rotateY(180deg) translateZ(42px)' }}
                      className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/20 bg-white font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                    >
                      F
                    </div>
                    <div
                      style={{ transform: 'rotateY(90deg) translateZ(42px)' }}
                      className="absolute inset-0 flex items-center justify-center rounded-xl border border-[#191A1D]/20 bg-[#EDFF72] font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                    >
                      ✓
                    </div>
                    <div
                      style={{ transform: 'rotateY(-90deg) translateZ(42px)' }}
                      className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/20 bg-white font-mono text-xl font-bold text-[#191A1D] shadow-md"
                    >
                      A+
                    </div>
                    <div
                      style={{ transform: 'rotateX(90deg) translateZ(42px)' }}
                      className="absolute inset-0 flex items-center justify-center rounded-xl border border-[#191A1D]/20 bg-[#EDFF72] font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                    >
                      ✦
                    </div>
                    <div
                      style={{ transform: 'rotateX(-90deg) translateZ(42px)' }}
                      className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/20 bg-white font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                    >
                      #
                    </div>
                  </div>
                </div>

                {/* Layer e: Soft lime elliptical shadow beneath scene */}
                <div
                  aria-hidden
                  style={{
                    transform: 'translateZ(-40px) rotateX(90deg)',
                    filter: 'blur(20px)'
                  }}
                  className="absolute -bottom-8 left-1/2 h-16 w-3/4 -translate-x-1/2 rounded-full bg-[#EDFF72]/20"
                />
              </div>
            </div>
          </div>

          {/* Bottom scroll cue */}
          <div className="relative z-10 flex items-center justify-center pb-2 text-xs text-white/50">
            <button
              onClick={handleEnterDashboard}
              className="flex items-center gap-1.5 transition-colors hover:text-white"
            >
              <span>Scroll down to enter dashboard</span>
              <span>↓</span>
            </button>
          </div>
        </motion.section>

      {/* ----------------------------------------------------------------------
        FIXED SIDEBAR (Sized like teacher part w-[78px], rounded-[32px], fixed,
        and does NOT appear on scrolling to hero section)
        ---------------------------------------------------------------------- */}
      <aside
        className={`fixed left-4 top-4 z-40 hidden lg:flex flex-col items-center w-[78px] h-[calc(100vh-32px)] max-h-[850px] bg-[#191A1D] rounded-[32px] py-4 px-3 shadow-2xl select-none transition-all duration-300 ease-out ${
          sidebarVisible
            ? 'opacity-100 translate-x-0 pointer-events-auto'
            : 'opacity-0 -translate-x-6 pointer-events-none'
        }`}
        aria-label="Student Navigation"
      >
        {/* Top Logo */}
        <div className="flex flex-col items-center w-full">
          <button
            type="button"
            onClick={() => {
              setActiveTab('overview');
              const shell = document.getElementById('student-dashboard-shell');
              if (shell) shell.scrollIntoView({ behavior: 'smooth' });
            }}
            title="TestForge Student Portal"
            className="w-11 h-11 rounded-2xl bg-[#26282E] hover:bg-[#32353D] text-[#EDFF72] flex items-center justify-center transition-all duration-200 shadow-md cursor-pointer group"
          >
            <span className="font-mono font-black text-sm text-[#EDFF72] tracking-tight">TF</span>
          </button>
          <div className="w-8 h-px bg-white/10 my-2.5" />
        </div>

        {/* 10 Navigation Items with Sleek Tooltips */}
        <nav className="flex flex-col items-center gap-1.5 w-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <div key={item.id} className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    const shell = document.getElementById('student-dashboard-shell');
                    if (shell) shell.scrollIntoView({ behavior: 'smooth' });
                  }}
                  aria-label={item.label}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative ${
                    isActive
                      ? 'bg-[#EDFF72] text-[#191A1D] shadow-md font-bold'
                      : 'text-[#777D78] hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon
                    className="w-5 h-5 transition-transform group-hover:scale-110"
                    strokeWidth={isActive ? 2.5 : 2}
                  />

                  {/* Lime Unread Notification Count Badge */}
                  {item.badge ? (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#EDFF72] px-1 font-mono text-[9px] font-bold text-[#191A1D] shadow-sm">
                      {item.badge}
                    </span>
                  ) : null}

                  {/* Active right indicator pill */}
                  {isActive && (
                    <span className="absolute -right-1 w-1 h-3.5 rounded-full bg-[#EDFF72]" />
                  )}
                </button>

                {/* Floating Tooltip matching BentoSidebar style */}
                <div className="pointer-events-none absolute left-full top-1/2 ml-3.5 -translate-y-1/2 whitespace-nowrap rounded-xl bg-[#191A1D] border border-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-xl opacity-0 transition-opacity duration-150 group-hover:opacity-100 z-50">
                  {item.label}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Flexible Spacer */}
        <div className="flex-1 min-h-[16px] w-full" />

        {/* Bottom Utility: Candidate Avatar + Sign Out */}
        <div className="flex flex-col items-center gap-2 w-full pt-2 border-t border-white/10">
          {/* Avatar Profile */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => {
                setActiveTab('profile');
                const shell = document.getElementById('student-dashboard-shell');
                if (shell) shell.scrollIntoView({ behavior: 'smooth' });
              }}
              aria-label="Candidate Profile"
              className="w-10 h-10 rounded-2xl bg-[#26282E] hover:bg-white/10 flex items-center justify-center font-mono text-xs font-bold text-[#EDFF72] ring-1 ring-white/10 transition-all duration-200 cursor-pointer"
            >
              {userInitials}
            </button>
            <div className="pointer-events-none absolute left-full top-1/2 ml-3.5 -translate-y-1/2 whitespace-nowrap rounded-xl bg-[#191A1D] border border-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-xl opacity-0 transition-opacity duration-150 group-hover:opacity-100 z-50">
              {candidateName}
            </div>
          </div>

          {/* Sign Out Button */}
          {onSignOut && (
            <div className="relative group">
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign Out"
                className="w-10 h-10 rounded-2xl flex items-center justify-center text-[#777D78] hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200 cursor-pointer"
              >
                <LogOut className="w-4 h-4 transition-transform group-hover:scale-110" />
              </button>
              <div className="pointer-events-none absolute left-full top-1/2 ml-3.5 -translate-y-1/2 whitespace-nowrap rounded-xl bg-[#191A1D] border border-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-xl opacity-0 transition-opacity duration-150 group-hover:opacity-100 z-50">
                Sign Out
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ----------------------------------------------------------------------
        STEP 3: SLIDE-UP DASHBOARD SHELL
        Sits directly below the hero. Top radius 36px, shadow 0 -30px 80px rgba(0,0,0,.5).
        Outer container: bg #E9ECE7, radius 34px, padding 14px.
        ---------------------------------------------------------------------- */}
      <section
        id="student-dashboard-shell"
        className="relative z-10 rounded-t-[36px] bg-[#F2F3F0] p-3.5 shadow-[0_-30px_80px_rgba(0,0,0,0.5)] transition-all"
      >
        {/* Outer Dashboard Shell Container: bg #E9ECE7, radius 34px, padding 14px, with lg:pl-[96px] to accommodate fixed 78px sidebar */}
        <div className="flex min-h-[calc(100vh-28px)] w-full gap-3.5 rounded-[34px] bg-[#E9ECE7] p-3.5 shadow-sm lg:pl-[96px]">

          {/* ------------------------------------------------------------------
            MAIN CONTENT AREA
            ------------------------------------------------------------------ */}
          <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            {/* Mobile / Tablet Horizontal Pill Bar (under 860px) */}
            <div className="mb-3 block lg:hidden">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        const shell = document.getElementById('student-dashboard-shell');
                        if (shell) shell.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-[#EDFF72] text-[#191A1D] shadow-sm'
                          : 'bg-white text-[#171819] hover:bg-white/80 border border-[#DDE1DA]'
                      }`}
                    >
                      <Icon className="size-3.5" />
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="ml-1 rounded-full bg-[#191A1D] px-1.5 py-0.2 text-[9px] font-bold text-[#EDFF72]">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error banner (⚠ icon on surface-2, NO red fill) */}
            {errorNotice && (
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-[#DDE1DA] bg-white px-4 py-3 text-xs font-medium text-[#171819] shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-[#E9ECE7] font-bold text-[#171819]">
                    ⚠
                  </span>
                  <span>{errorNotice}</span>
                </div>
                <button
                  onClick={() => setErrorNotice('')}
                  className="text-xs text-[#777D78] hover:text-[#171819]"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Page Header (Title, greeting, bell, "＋ Quick Join", avatar) */}
            <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[26px] border border-[#DDE1DA] bg-white px-6 py-5 shadow-sm">
              <div>
                <h1 className="text-[clamp(22px,2.6vw,32px)] font-semibold tracking-[-0.045em] text-[#171819]">
                  {currentMeta.title}
                </h1>
                <p className="mt-0.5 text-xs text-[#777D78]">
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                  {' • '}
                  {currentMeta.subtitle}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Notification Bell with unread dot */}
                <button
                  onClick={() => setActiveTab('notifications')}
                  className="relative flex size-10 items-center justify-center rounded-full border border-[#DDE1DA] bg-[#F2F3F0] text-[#171819] transition-transform hover:scale-105 active:scale-95"
                  title="Notifications"
                >
                  <Bell className="size-4" />
                  {unreadCount > 0 && (
                    <span className="absolute right-2 top-2 size-2 rounded-full bg-[#EDFF72] ring-2 ring-[#191A1D]" />
                  )}
                </button>

                {/* Dark "＋ Quick Join" Pill */}
                <button
                  onClick={() => setQuickJoinModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#191A1D] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-95"
                >
                  <span>＋ Quick Join</span>
                </button>

                {/* Dark Avatar Circle with Lime Initials */}
                <div
                  onClick={() => setActiveTab('profile')}
                  className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-[#191A1D] font-mono text-xs font-bold text-[#EDFF72] ring-2 ring-[#EDFF72]/40 transition-transform hover:scale-105"
                  title="Candidate Profile"
                >
                  {userInitials}
                </div>
              </div>
            </header>

            {/* Quick Join Modal */}
            {quickJoinModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                <div className="relative w-full max-w-md rounded-[28px] border border-[#DDE1DA] bg-white p-6 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-[#DDE1DA] pb-4">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-xl bg-[#EDFF72] text-[#191A1D]">
                        <KeyRound className="size-4" />
                      </div>
                      <h3 className="text-base font-semibold text-[#171819]">Quick Join Assessment</h3>
                    </div>
                    <button
                      onClick={() => setQuickJoinModalOpen(false)}
                      className="text-xs font-medium text-[#777D78] hover:text-[#171819]"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#777D78]">
                      Assessment Access PIN / Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TF-DSA01"
                      value={quickJoinCode}
                      onChange={(e) => setQuickJoinCode(e.target.value.toUpperCase())}
                      className="w-full rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0] px-4 py-3 font-mono text-base font-semibold tracking-wider text-[#171819] outline-none focus:border-[#191A1D]"
                    />

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setQuickJoinModalOpen(false)}
                        className="rounded-full px-4 py-2.5 text-xs font-semibold text-[#777D78] hover:bg-[#F2F3F0]"
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
                        className="rounded-full bg-[#EDFF72] px-6 py-2.5 text-xs font-semibold text-[#191A1D] shadow-sm hover:scale-105 active:scale-95"
                      >
                        Enter Session →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* View Transitions: Fade + 14px rise, 0.5s */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
                className="space-y-6"
              >
                {/* ============================================================
                    TAB 1: OVERVIEW (STRICTLY REAL DATA, MEANINGFUL EMPTY STATES)
                    ============================================================ */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* 6 Metric Count-Up Cards */}
                    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
                      {/* 1. Tests Attempted */}
                      <TiltCard className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 shadow-sm">
                        <span className="block text-xs font-medium text-[#777D78]">Tests Attempted</span>
                        <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-[#171819]">
                          <CountUp value={metrics.testsAttempted} />
                        </p>
                        <span className="mt-2 block text-[11px] text-[#777D78]">
                          {metrics.testsAttempted > 0 ? 'Recorded sessions' : 'No attempts yet'}
                        </span>
                      </TiltCard>

                      {/* 2. Completed */}
                      <TiltCard className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 shadow-sm">
                        <span className="block text-xs font-medium text-[#777D78]">Completed</span>
                        <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-[#171819]">
                          <CountUp value={metrics.completed} />
                        </p>
                        <span className="mt-2 block text-[11px] text-[#777D78]">
                          {metrics.completed > 0 ? 'Graded submissions' : 'None completed yet'}
                        </span>
                      </TiltCard>

                      {/* 3. Average Score (Exact Lime Card #EDFF72) */}
                      <TiltCard className="rounded-[24px] border border-[#EDFF72] bg-[#EDFF72] p-5 shadow-md">
                        <span className="block text-xs font-semibold text-[#191A1D]/80">Average Score</span>
                        <p className="mt-2 font-mono text-3xl font-black tracking-tight text-[#191A1D]">
                          <CountUp value={metrics.averageScore} suffix="%" />
                        </p>
                        <span className="mt-2 block text-[11px] font-semibold text-[#191A1D]/70">
                          {metrics.completed > 0 ? 'Verified average' : 'Awaiting first test'}
                        </span>
                      </TiltCard>

                      {/* 4. Accuracy */}
                      <TiltCard className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 shadow-sm">
                        <span className="block text-xs font-medium text-[#777D78]">Accuracy</span>
                        <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-[#171819]">
                          <CountUp value={metrics.accuracy} suffix="%" />
                        </p>
                        <span className="mt-2 block text-[11px] text-[#777D78]">
                          {metrics.completed > 0 ? 'Score percentage' : 'No records yet'}
                        </span>
                      </TiltCard>

                      {/* 5. Upcoming */}
                      <TiltCard className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 shadow-sm">
                        <span className="block text-xs font-medium text-[#777D78]">Upcoming</span>
                        <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-[#171819]">
                          <CountUp value={metrics.upcoming} />
                        </p>
                        <span className="mt-2 block text-[11px] text-[#777D78]">
                          {metrics.upcoming > 0 ? 'Live & assigned' : 'No tests assigned'}
                        </span>
                      </TiltCard>

                      {/* 6. Streak */}
                      <TiltCard className="rounded-[24px] border border-[#DDE1DA] bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="block text-xs font-medium text-[#777D78]">Streak</span>
                          <Flame className="size-4 text-[#191A1D]" />
                        </div>
                        <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-[#171819]">
                          <CountUp value={metrics.streak} suffix="d" />
                        </p>
                        <span className="mt-2 block text-[11px] text-[#777D78]">
                          {metrics.streak > 0 ? 'Consecutive days' : '0 days active'}
                        </span>
                      </TiltCard>
                    </div>

                    {/* 1.5fr / 1fr Row: Upcoming Assessments & Recent Activity */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
                      {/* Left: Upcoming Assessments */}
                      <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-semibold text-[#171819]">Upcoming Assessments</h3>
                            <p className="text-xs text-[#777D78]">Active and scheduled examinations in your curriculum</p>
                          </div>
                          {availableExams.length > 0 && (
                            <button
                              onClick={() => setActiveTab('my-tests')}
                              className="text-xs font-semibold text-[#171819] hover:underline"
                            >
                              View all ({availableExams.length}) →
                            </button>
                          )}
                        </div>

                        {availableExams.length === 0 ? (
                          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/40 p-8 text-center">
                            <Calendar className="size-8 text-[#777D78]" />
                            <h4 className="mt-2 text-sm font-semibold text-[#171819]">No Upcoming Assessments</h4>
                            <p className="mt-1 text-xs text-[#777D78]">
                              There are currently no examinations scheduled for your candidate profile.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3.5">
                            {availableExams.slice(0, 3).map((exam) => (
                              <div
                                key={exam._id || exam.examCode}
                                className="flex flex-col justify-between gap-4 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/60 p-4 transition-all hover:bg-white hover:shadow-sm sm:flex-row sm:items-center"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-md bg-[#191A1D] px-2 py-0.5 font-mono text-[10px] font-bold text-[#EDFF72]">
                                      {exam.examCode}
                                    </span>
                                    <span className="rounded-full border border-[#DDE1DA] bg-white px-2 py-0.5 text-[10px] font-medium text-[#777D78]">
                                      {exam.status === 'LIVE' ? 'Available Now' : 'Scheduled'}
                                    </span>
                                  </div>
                                  <h4 className="text-sm font-semibold text-[#171819]">{exam.title}</h4>
                                  <p className="text-xs text-[#777D78]">
                                    Faculty Evaluation • {exam.durationMinutes || 60} mins • {exam.totalMarks || 100} marks
                                  </p>
                                </div>

                                <button
                                  onClick={() => startExamWithCode(exam.examCode)}
                                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#EDFF72] px-5 py-2.5 text-xs font-semibold text-[#191A1D] shadow-sm transition-transform hover:scale-105 active:scale-95"
                                >
                                  <span>Start / Resume</span>
                                  <ChevronRight className="size-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right: Recent Activity Timeline */}
                      <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm">
                        <div className="mb-4">
                          <h3 className="text-base font-semibold text-[#171819]">Recent Activity</h3>
                          <p className="text-xs text-[#777D78]">Your verified session timeline</p>
                        </div>

                        {recentActivity.length === 0 && myAttempts.length === 0 ? (
                          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/40 p-8 text-center">
                            <Clock className="size-8 text-[#777D78]" />
                            <h4 className="mt-2 text-sm font-semibold text-[#171819]">No Activity Recorded</h4>
                            <p className="mt-1 text-xs text-[#777D78]">
                              Take an assessment to generate your candidate activity timeline.
                            </p>
                          </div>
                        ) : (
                          <div className="relative space-y-4 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-0.5 before:bg-[#DDE1DA]">
                            {(recentActivity.length > 0 ? recentActivity : myAttempts.slice(0, 4)).map((act, i) => (
                              <div key={i} className="relative flex items-start gap-3.5 pl-1 text-xs">
                                <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-[#DDE1DA] bg-white text-[#191A1D] shadow-xs">
                                  {act.status === 'submitted' ? (
                                    <CheckCircle2 className="size-3.5 text-[#191A1D]" />
                                  ) : (
                                    <Clock className="size-3.5 text-[#191A1D]" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-[#171819]">
                                      {act.title || act.examId?.title || 'Exam Assessment'}
                                    </span>
                                    <span className="font-mono text-[10px] text-[#777D78]">
                                      {act.score !== null && act.score !== undefined
                                        ? `${act.score}/${act.maxMarks || act.examId?.totalMarks || 100}`
                                        : act.status}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-[#777D78]">
                                    {new Date(act.timestamp || act.createdAt || Date.now()).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Score Progression & Subject Performance Row */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      {/* Score Progression */}
                      <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-semibold text-[#171819]">Score Progression</h3>
                            <p className="text-xs text-[#777D78]">Historical percentage trajectory</p>
                          </div>
                        </div>

                        {scoreProgression.length === 0 ? (
                          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/40 p-10 text-center">
                            <BarChart3 className="size-8 text-[#777D78]" />
                            <h4 className="mt-2 text-sm font-semibold text-[#171819]">No Released Results Yet</h4>
                            <p className="mt-1 text-xs text-[#777D78]">
                              Complete your first examination to track your score progression over time.
                            </p>
                            <button
                              onClick={() => setActiveTab('my-tests')}
                              className="mt-4 rounded-full bg-[#191A1D] px-4 py-2 text-xs font-semibold text-white hover:bg-black transition-colors"
                            >
                              Browse Available Assessments
                            </button>
                          </div>
                        ) : (
                          <div className="relative h-48 w-full pt-4">
                            <svg className="h-full w-full overflow-visible" viewBox="0 0 500 150">
                              <defs>
                                <linearGradient id="limeGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#EDFF72" stopOpacity="0.45" />
                                  <stop offset="100%" stopColor="#EDFF72" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>

                              <line x1="0" y1="20" x2="500" y2="20" stroke="#DDE1DA" strokeDasharray="4 4" />
                              <line x1="0" y1="70" x2="500" y2="70" stroke="#DDE1DA" strokeDasharray="4 4" />
                              <line x1="0" y1="120" x2="500" y2="120" stroke="#DDE1DA" strokeDasharray="4 4" />

                              {/* Dynamic Path calculation */}
                              {(() => {
                                const stepX = 500 / Math.max(scoreProgression.length - 1, 1);
                                const points = scoreProgression.map((p, idx) => {
                                  const x = Math.round(idx * stepX);
                                  // Map score 0..100 to y 130..20
                                  const y = Math.round(130 - (Math.min(100, Math.max(0, p.score)) / 100) * 110);
                                  return { x, y, ...p };
                                });

                                const pathD = points.reduce((acc, pt, i) => {
                                  return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
                                }, '');

                                const areaD = `${pathD} L ${points[points.length - 1].x} 140 L ${points[0].x} 140 Z`;

                                return (
                                  <>
                                    <polygon points={points.map((p) => `${p.x},${p.y}`).join(' ') + ` 500,140 0,140`} fill="url(#limeGradient)" />
                                    <path
                                      d={pathD}
                                      fill="none"
                                      stroke="#191A1D"
                                      strokeWidth="3.5"
                                      strokeLinecap="round"
                                      className="transition-all duration-1000"
                                    />
                                    {points.map((pt, i) => (
                                      <g key={i}>
                                        <circle
                                          cx={pt.x}
                                          cy={pt.y}
                                          r="6"
                                          fill="#EDFF72"
                                          stroke="#191A1D"
                                          strokeWidth="2.5"
                                        />
                                        <text
                                          x={pt.x}
                                          y={pt.y - 12}
                                          textAnchor="middle"
                                          className="font-mono text-[10px] font-bold fill-[#191A1D]"
                                        >
                                          {pt.score}%
                                        </text>
                                      </g>
                                    ))}
                                  </>
                                );
                              })()}
                            </svg>

                            <div className="mt-2 flex justify-between px-2 text-[10px] font-medium text-[#777D78]">
                              {scoreProgression.map((p, idx) => (
                                <span key={idx}>{p.date}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Subject Performance */}
                      <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm">
                        <div className="mb-4">
                          <h3 className="text-base font-semibold text-[#171819]">Subject Performance</h3>
                          <p className="text-xs text-[#777D78]">Curriculum topic mastery index</p>
                        </div>

                        {subjectPerformance.length === 0 ? (
                          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/40 p-10 text-center">
                            <BookOpen className="size-8 text-[#777D78]" />
                            <h4 className="mt-2 text-sm font-semibold text-[#171819]">No Subject Records Yet</h4>
                            <p className="mt-1 text-xs text-[#777D78]">
                              Results will appear here categorized by course topics once you take exams.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {subjectPerformance.map((sub, idx) => {
                              const isLime = idx % 2 === 0;
                              return (
                                <div key={sub.subject} className="space-y-1.5">
                                  <div className="flex justify-between text-xs font-semibold">
                                    <span className="text-[#171819]">{sub.subject}</span>
                                    <span className="font-mono">{sub.score}%</span>
                                  </div>
                                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E9ECE7]">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${sub.score}%` }}
                                      transition={{ duration: 1.2, delay: idx * 0.1 }}
                                      className={`h-full rounded-full ${
                                        isLime ? 'bg-[#EDFF72]' : 'bg-[#191A1D]'
                                      }`}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ============================================================
                    TAB 2: MY TESTS
                    ============================================================ */}
                {activeTab === 'my-tests' && (
                  <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm space-y-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="relative max-w-sm flex-1">
                        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#777D78]" />
                        <input
                          type="text"
                          placeholder="Search assessments by title or code..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full rounded-full border border-[#DDE1DA] bg-[#F2F3F0] py-2.5 pl-10 pr-4 text-xs font-medium text-[#171819] outline-none focus:border-[#191A1D]"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        {['ALL', 'AVAILABLE', 'SCHEDULED'].map((filter) => (
                          <button
                            key={filter}
                            onClick={() => setTestStatusFilter(filter)}
                            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                              testStatusFilter === filter
                                ? 'bg-[#191A1D] text-white'
                                : 'bg-[#F2F3F0] text-[#777D78] hover:text-[#171819]'
                            }`}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>
                    </div>

                    {availableExams.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/40 p-12 text-center">
                        <FileText className="size-10 text-[#777D78]" />
                        <h4 className="mt-3 text-base font-semibold text-[#171819]">No Assessments Found</h4>
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
                              className="flex flex-col justify-between rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-5 transition-all hover:bg-white hover:shadow-sm"
                            >
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="rounded-md bg-[#EDFF72] px-2 py-0.5 font-mono text-[10px] font-bold text-[#191A1D]">
                                    {exam.examCode}
                                  </span>
                                  <span className="rounded-full border border-[#DDE1DA] bg-white px-2 py-0.5 text-[10px] font-medium text-[#777D78]">
                                    {exam.status === 'LIVE' ? 'Available' : 'Scheduled'}
                                  </span>
                                </div>

                                <h4 className="mt-3 text-base font-semibold text-[#171819]">{exam.title}</h4>
                                <p className="mt-1 text-xs text-[#777D78] line-clamp-2">
                                  {exam.description || 'Comprehensive evaluation covering foundational course outcomes.'}
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
                                  onClick={() => startExamWithCode(exam.examCode)}
                                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#191A1D] py-2.5 text-xs font-semibold text-white transition-all hover:bg-black"
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

                {/* ============================================================
                    TAB 3: JOIN TEST
                    ============================================================ */}
                {activeTab === 'join-test' && (
                  <div className="mx-auto max-w-2xl rounded-[28px] border border-[#DDE1DA] bg-white p-8 shadow-sm">
                    <div className="text-center">
                      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#EDFF72] text-[#191A1D] shadow-sm">
                        <KeyRound className="size-6" />
                      </div>
                      <h2 className="mt-4 text-2xl font-bold tracking-tight text-[#171819]">
                        Join Proctored Assessment
                      </h2>
                      <p className="mt-1 text-xs text-[#777D78]">
                        Enter your exam access PIN and verify your hardware readiness before starting.
                      </p>
                    </div>

                    <div className="mt-8 space-y-6">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[#777D78]">
                          Assessment Access PIN / Code
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. TF-DSA01"
                          value={quickJoinCode}
                          onChange={(e) => setQuickJoinCode(e.target.value.toUpperCase())}
                          className="mt-2 w-full rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0] px-4 py-3.5 font-mono text-center text-lg font-bold tracking-widest text-[#171819] outline-none focus:border-[#191A1D]"
                        />
                      </div>

                      <div className="rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/60 p-5 space-y-3">
                        <span className="block text-xs font-semibold uppercase tracking-wider text-[#171819]">
                          Pre-flight Hardware Readiness
                        </span>

                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
                          <div className="flex items-center justify-between rounded-xl bg-white p-3 border border-[#DDE1DA]">
                            <div className="flex items-center gap-2">
                              <Video className="size-4 text-[#191A1D]" />
                              <span>Webcam Stream</span>
                            </div>
                            <span className="flex items-center gap-1 font-semibold text-[#191A1D]">
                              <Check className="size-3.5 text-[#191A1D]" /> Ready
                            </span>
                          </div>

                          <div className="flex items-center justify-between rounded-xl bg-white p-3 border border-[#DDE1DA]">
                            <div className="flex items-center gap-2">
                              <Mic className="size-4 text-[#191A1D]" />
                              <span>Audio Input</span>
                            </div>
                            <span className="flex items-center gap-1 font-semibold text-[#191A1D]">
                              <Check className="size-3.5 text-[#191A1D]" /> Ready
                            </span>
                          </div>

                          <div className="flex items-center justify-between rounded-xl bg-white p-3 border border-[#DDE1DA]">
                            <div className="flex items-center gap-2">
                              <Wifi className="size-4 text-[#191A1D]" />
                              <span>Network Latency</span>
                            </div>
                            <span className="font-mono font-semibold text-[#191A1D]">Verified</span>
                          </div>

                          <div className="flex items-center justify-between rounded-xl bg-white p-3 border border-[#DDE1DA]">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="size-4 text-[#191A1D]" />
                              <span>Proctor Integrity</span>
                            </div>
                            <span className="font-semibold text-[#191A1D]">Enabled</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => startExamWithCode(quickJoinCode)}
                        className="w-full rounded-2xl bg-[#EDFF72] py-4 text-sm font-bold text-[#191A1D] shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Launch Examination Workspace →
                      </button>
                    </div>
                  </div>
                )}

                {/* ============================================================
                    TAB 4: UPCOMING TESTS
                    ============================================================ */}
                {activeTab === 'upcoming-tests' && (
                  <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm space-y-6">
                    <div>
                      <h3 className="text-base font-semibold text-[#171819]">Scheduled Assessments</h3>
                      <p className="text-xs text-[#777D78]">Upcoming examination sessions assigned to you</p>
                    </div>

                    {availableExams.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/40 p-10 text-center">
                        <Calendar className="size-8 text-[#777D78]" />
                        <h4 className="mt-2 text-sm font-semibold text-[#171819]">No Upcoming Assessments</h4>
                        <p className="mt-1 text-xs text-[#777D78]">
                          There are currently no scheduled examinations on your calendar.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {availableExams.map((exam) => (
                          <div
                            key={exam._id}
                            className="flex flex-col justify-between gap-4 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/60 p-5 sm:flex-row sm:items-center"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="rounded-md bg-[#191A1D] px-2 py-0.5 font-mono text-[10px] font-bold text-[#EDFF72]">
                                  {exam.examCode}
                                </span>
                                <span className="rounded-full bg-[#EDFF72] px-2.5 py-0.5 font-mono text-[10px] font-bold text-[#191A1D]">
                                  {exam.status === 'LIVE' ? 'Available Now' : 'Scheduled'}
                                </span>
                              </div>
                              <h4 className="mt-2 text-sm font-semibold text-[#171819]">{exam.title}</h4>
                              <p className="text-xs text-[#777D78]">
                                Duration: {exam.durationMinutes} mins • Total Marks: {exam.totalMarks}
                              </p>
                            </div>

                            <button
                              onClick={() => startExamWithCode(exam.examCode)}
                              className="rounded-full border border-[#191A1D] bg-white px-5 py-2 text-xs font-semibold text-[#191A1D] hover:bg-[#191A1D] hover:text-white transition-colors"
                            >
                              Enter Assessment
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ============================================================
                    TAB 5: TEST HISTORY
                    ============================================================ */}
                {activeTab === 'test-history' && (
                  <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm space-y-6">
                    <div>
                      <h3 className="text-base font-semibold text-[#171819]">Examination Records</h3>
                      <p className="text-xs text-[#777D78]">Submitted attempts and score reports</p>
                    </div>

                    {myAttempts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/40 p-12 text-center">
                        <History className="size-10 text-[#777D78]" />
                        <h4 className="mt-3 text-base font-semibold text-[#171819]">No Attempt History Recorded</h4>
                        <p className="mt-1 text-xs text-[#777D78]">
                          When you complete an assessment, your verified rubric and score breakdown will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-[#DDE1DA] text-[11px] font-semibold uppercase tracking-wider text-[#777D78]">
                              <th className="pb-3 pl-2">Assessment</th>
                              <th className="pb-3">Date</th>
                              <th className="pb-3">Status</th>
                              <th className="pb-3">Score</th>
                              <th className="pb-3 text-right pr-2">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#DDE1DA]">
                            {myAttempts.map((att) => (
                              <tr key={att._id} className="hover:bg-[#F2F3F0]/50 transition-colors">
                                <td className="py-3.5 pl-2 font-medium text-[#171819]">
                                  {att.examId?.title || 'Exam Assessment'}
                                </td>
                                <td className="py-3.5 text-[#777D78]">
                                  {new Date(att.createdAt).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </td>
                                <td className="py-3.5">
                                  <span className="rounded-full bg-[#E9ECE7] px-2.5 py-0.5 text-[10px] font-semibold text-[#171819]">
                                    {att.status === 'submitted' ? 'Graded' : 'In Progress'}
                                  </span>
                                </td>
                                <td className="py-3.5 font-mono font-bold text-[#171819]">
                                  {att.score ?? '—'} / {att.examId?.totalMarks || 100}
                                </td>
                                <td className="py-3.5 text-right pr-2">
                                  <button
                                    onClick={() => setViewingResult(att._id)}
                                    className="inline-flex items-center gap-1 rounded-full bg-[#EDFF72] px-3.5 py-1 font-semibold text-[#191A1D] hover:scale-105 transition-transform"
                                  >
                                    <span>View Analysis</span>
                                    <ExternalLink className="size-3" />
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

                {/* ============================================================
                    TAB 6: PERFORMANCE ANALYTICS
                    ============================================================ */}
                {activeTab === 'analytics' && (
                  <div className="space-y-6">
                    {metrics.completed === 0 ? (
                      <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-12 text-center">
                        <BarChart3 className="mx-auto size-12 text-[#777D78]" />
                        <h3 className="mt-3 text-lg font-bold text-[#171819]">No Analytics Available Yet</h3>
                        <p className="mt-1 text-xs text-[#777D78]">
                          Complete your first assessment to unlock accuracy metrics and topic performance breakdown.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-6 shadow-sm">
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#777D78]">
                              Overall Accuracy Rate
                            </span>
                            <h4 className="mt-2 font-mono text-4xl font-bold text-[#171819]">{metrics.accuracy}%</h4>
                            <p className="mt-2 text-xs text-[#777D78]">
                              Calculated across all completed examination submissions.
                            </p>
                          </div>

                          <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-6 shadow-sm">
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#777D78]">
                              Completed Assessments
                            </span>
                            <h4 className="mt-2 font-mono text-4xl font-bold text-[#171819]">{metrics.completed}</h4>
                            <p className="mt-2 text-xs text-[#777D78]">
                              Fully evaluated and recorded in database.
                            </p>
                          </div>
                        </div>

                        {/* Real Subject Breakdown */}
                        {subjectPerformance.length > 0 && (
                          <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm space-y-4">
                            <h3 className="text-base font-semibold text-[#171819]">Topic Mastery Index</h3>
                            <div className="space-y-3">
                              {subjectPerformance.map((sub) => (
                                <div key={sub.subject}>
                                  <div className="flex justify-between text-xs font-medium">
                                    <span>{sub.subject}</span>
                                    <span className="font-mono">{sub.score}%</span>
                                  </div>
                                  <div className="mt-1.5 h-2 w-full rounded-full bg-[#E9ECE7]">
                                    <div
                                      className="h-full rounded-full bg-[#EDFF72]"
                                      style={{ width: `${sub.score}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ============================================================
                    TAB 7: MY LEARNING
                    ============================================================ */}
                {activeTab === 'learning' && (
                  <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm space-y-6">
                    <div>
                      <h3 className="text-base font-semibold text-[#171819]">Curriculum Learning Modules</h3>
                      <p className="text-xs text-[#777D78]">
                        Essential concepts covered in your assessments.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {[
                        {
                          topic: 'Data Structures & Algorithms',
                          desc: 'Arrays, Two Pointers, Dynamic Programming, Trees, and Graph Traversals.'
                        },
                        {
                          topic: 'Database Systems & SQL Optimization',
                          desc: 'Indexing strategies, query normalization, relational algebra, and ACID guarantees.'
                        },
                        {
                          topic: 'Operating Systems & Concurrency',
                          desc: 'Process lifecycle, mutex locks, semaphores, memory paging, and context switching.'
                        },
                        {
                          topic: 'System Architecture & Web Protocols',
                          desc: 'RESTful API principles, stateless authentication, WebSockets, and distributed queues.'
                        }
                      ].map((mod, i) => (
                        <div
                          key={i}
                          className="rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/60 p-5 space-y-2 hover:bg-white transition-colors"
                        >
                          <h4 className="text-sm font-semibold text-[#171819]">{mod.topic}</h4>
                          <p className="text-xs text-[#777D78]">{mod.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ============================================================
                    TAB 8: NOTIFICATIONS
                    ============================================================ */}
                {activeTab === 'notifications' && (
                  <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-[#171819]">All Notifications</h3>
                        <p className="text-xs text-[#777D78]">
                          You have {unreadCount} unread alert{unreadCount === 1 ? '' : 's'}.
                        </p>
                      </div>

                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllNotificationsRead}
                          className="rounded-full bg-[#191A1D] px-4 py-2 text-xs font-semibold text-white hover:bg-black transition-colors"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>

                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDE1DA] bg-[#F2F3F0]/40 p-10 text-center">
                        <Bell className="size-8 text-[#777D78]" />
                        <h4 className="mt-2 text-sm font-semibold text-[#171819]">No Notifications</h4>
                        <p className="mt-1 text-xs text-[#777D78]">You are up to date on all assessment notices.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className={`flex items-start justify-between rounded-2xl border p-4 transition-colors ${
                              !notif.read
                                ? 'border-[#EDFF72] bg-[#EDFF72]/15'
                                : 'border-[#DDE1DA] bg-[#F2F3F0]/40'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                {!notif.read && (
                                  <span className="size-2 rounded-full bg-[#191A1D]" />
                                )}
                                <h4 className="text-xs font-bold text-[#171819]">{notif.title}</h4>
                              </div>
                              <p className="text-xs text-[#777D78]">{notif.message}</p>
                              <span className="text-[10px] text-[#777D78]">
                                {new Date(notif.timestamp).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>

                            {!notif.read && (
                              <span className="rounded-full bg-[#EDFF72] px-2.5 py-0.5 text-[10px] font-bold text-[#191A1D]">
                                New
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ============================================================
                    TAB 9: MY PROFILE
                    ============================================================ */}
                {activeTab === 'profile' && (
                  <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm space-y-6">
                    <div className="flex items-center gap-5 border-b border-[#DDE1DA] pb-6">
                      <div className="flex size-16 items-center justify-center rounded-2xl bg-[#191A1D] font-mono text-2xl font-bold text-[#EDFF72] shadow-sm">
                        {userInitials}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-[#171819]">{candidateName}</h3>
                        <p className="text-xs text-[#777D78]">{currentUser?.email || 'student@testforge.edu'}</p>
                        <span className="mt-1.5 inline-block rounded-full bg-[#EDFF72] px-3 py-0.5 text-[10px] font-bold text-[#191A1D]">
                          Role: Student Candidate
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                      <div className="rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-4">
                        <span className="text-[#777D78] block mb-1">Academic Status</span>
                        <span className="font-semibold text-[#171819]">Active Student Enrollment</span>
                      </div>
                      <div className="rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-4">
                        <span className="text-[#777D78] block mb-1">Academic Department</span>
                        <span className="font-semibold text-[#171819]">Computer Science & Engineering</span>
                      </div>
                    </div>

                    {onSignOut && (
                      <div className="pt-4 border-t border-[#DDE1DA] flex justify-between items-center">
                        <span className="text-xs text-[#777D78]">Signed into TestForge session</span>
                        <button
                          onClick={onSignOut}
                          className="rounded-full bg-[#191A1D] px-5 py-2.5 text-xs font-semibold text-white hover:bg-black transition-colors"
                        >
                          Sign Out
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ============================================================
                    TAB 10: SETTINGS
                    ============================================================ */}
                {activeTab === 'settings' && (
                  <div className="rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-sm space-y-6">
                    <div>
                      <h3 className="text-base font-semibold text-[#171819]">Workspace Preferences</h3>
                      <p className="text-xs text-[#777D78]">
                        Customize your testing environment and accessibility options.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-4">
                        <div>
                          <h4 className="text-xs font-bold text-[#171819]">Automated Code Autosave</h4>
                          <p className="text-[11px] text-[#777D78]">Saves draft code edits every 3 seconds to backend storage.</p>
                        </div>
                        <span className="rounded-full bg-[#191A1D] px-3 py-1 font-mono text-[10px] font-bold text-[#EDFF72]">
                          Enabled
                        </span>
                      </div>

                      <div className="flex items-center justify-between rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-4">
                        <div>
                          <h4 className="text-xs font-bold text-[#171819]">Sound Alerts for Timers</h4>
                          <p className="text-[11px] text-[#777D78]">Plays gentle chime at 15m, 5m, and 1m remaining during exam.</p>
                        </div>
                        <span className="rounded-full bg-[#191A1D] px-3 py-1 font-mono text-[10px] font-bold text-[#EDFF72]">
                          Enabled
                        </span>
                      </div>

                      <div className="flex items-center justify-between rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0]/50 p-4">
                        <div>
                          <h4 className="text-xs font-bold text-[#171819]">High Contrast Accessibility</h4>
                          <p className="text-[11px] text-[#777D78]">Enhances syntax contrast inside code editor.</p>
                        </div>
                        <span className="rounded-full bg-[#E9ECE7] px-3 py-1 font-mono text-[10px] font-bold text-[#171819]">
                          Default
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </section>

      {/* 3D Bobbing and Cube Spin CSS Keyframes */}
      <style>{`
        @keyframes bobbing {
          0%, 100% {
            transform: translateY(0px) translateZ(var(--tz, 0px));
          }
          50% {
            transform: translateY(-16px) translateZ(var(--tz, 0px));
          }
        }
        @keyframes cubeRotate {
          0% {
            transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg);
          }
          100% {
            transform: rotateX(360deg) rotateY(720deg) rotateZ(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default StudentDashboardView;

import React, { useState, useEffect, useMemo, useRef } from 'react';
import '../dashboard/bento-theme.css';
import { api } from '../../lib/api';
import {
  LayoutDashboard,
  BookOpen,
  FileCheck2,
  TrendingUp,
  User,
  Sparkles,
  LogOut,
  Settings,
  Search,
  Bell,
  ChevronDown,
  KeyRound,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Award,
  ShieldCheck,
  AlertCircle,
  Calendar,
  X,
  Menu,
  RefreshCw,
  ChevronRight,
  RotateCcw,
  MoreVertical,
  Layers,
  FileText
} from 'lucide-react';
import { StudentPortalContainer } from './StudentPortalContainer';
import { StudentResultsView } from './StudentResultsView';

export const StudentDashboardView = ({ currentUser, onSignOut }) => {
  // Navigation: 'dashboard' | 'assessments' | 'submissions' | 'performance' | 'profile'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tooltip, setTooltip] = useState({ text: '', top: 0, visible: false });

  // Examination Join State
  const [examCodeInput, setExamCodeInput] = useState('');
  const [availableExams, setAvailableExams] = useState([]);
  const [myAttempts, setMyAttempts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Search & Filter for "My Assessments"
  const [searchQuery, setSearchQuery] = useState('');
  const [assessmentFilter, setAssessmentFilter] = useState('ALL'); // 'ALL' | 'AVAILABLE' | 'COMPLETED'

  // Header quick search state
  const [headerSearch, setHeaderSearch] = useState('');
  const [isHeaderSearchOpen, setIsHeaderSearchOpen] = useState(false);
  const searchRef = useRef(null);

  // Active Flow States
  const [activeTakingCode, setActiveTakingCode] = useState(null);
  const [viewingResult, setViewingResult] = useState(null);

  // Tooltip helpers for sidebar icon rail
  const showTooltip = (e, label) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      text: label,
      top: rect.top + rect.height / 2,
      visible: true
    });
  };

  const hideTooltip = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  // Close header search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsHeaderSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch real student data from backend
  const fetchStudentData = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [examsRes, attemptsRes] = await Promise.allSettled([
        api.get('/attempts/my/available-exams'),
        api.get('/attempts/my/history')
      ]);

      if (examsRes.status === 'fulfilled') {
        setAvailableExams(examsRes.value.data?.data || []);
      }
      if (attemptsRes.status === 'fulfilled') {
        setMyAttempts(attemptsRes.value.data?.data || []);
      }
    } catch {
      setErrorMsg('Failed to sync student assessment records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, []);

  // Handle Join Examination by Access Code
  const handleJoinByCode = (e) => {
    if (e) e.preventDefault();
    const cleanCode = examCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMsg('Please enter a valid examination access code.');
      return;
    }
    setErrorMsg('');
    setActiveTakingCode(cleanCode);
  };

  // Completed & in-progress attempts derived strictly from real data
  const completedAttempts = useMemo(() => {
    return myAttempts.filter(
      (a) => a.status === 'SUBMITTED' || a.status === 'TIMED_OUT'
    );
  }, [myAttempts]);

  // Derived real metrics
  const completedCount = completedAttempts.length;
  const availableCount = availableExams.length;
  const totalAttemptsCount = myAttempts.length;

  const avgScore = useMemo(() => {
    if (completedAttempts.length === 0) return null;
    const sum = completedAttempts.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
    return Math.round(sum / completedAttempts.length);
  }, [completedAttempts]);

  const highestScore = useMemo(() => {
    if (completedAttempts.length === 0) return null;
    const scores = completedAttempts.map((a) => Math.round(a.percentage || 0));
    return Math.max(...scores);
  }, [completedAttempts]);

  const passingRate = useMemo(() => {
    if (completedAttempts.length === 0) return null;
    const passed = completedAttempts.filter((a) => (a.percentage || 0) >= 50).length;
    return Math.round((passed / completedAttempts.length) * 100);
  }, [completedAttempts]);

  // Greeting by current hour
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const candidateFirstName = currentUser?.name ? currentUser.name.split(' ')[0] : 'Candidate';
  const currentDateFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  // Navigation Items matching the icon rail
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'assessments', label: 'My Assessments', icon: BookOpen, badge: availableCount },
    { id: 'submissions', label: 'Submissions', icon: FileCheck2, badge: completedCount },
    { id: 'performance', label: 'Performance', icon: TrendingUp }
  ];

  // Filtered assessments list for "My Assessments" view
  const filteredAssessments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const availableItems = availableExams.map((ex) => ({
      id: ex._id,
      title: ex.title,
      code: ex.examCode,
      duration: ex.durationMinutes || 60,
      totalMarks: ex.totalMarks || 100,
      type: 'AVAILABLE',
      statusLabel: 'Available Now',
      createdAt: ex.createdAt,
      description: ex.description || 'Assigned programming examination.',
      raw: ex
    }));

    const completedItems = completedAttempts.map((att) => ({
      id: att._id,
      title: att.examId?.title || 'Academic Assessment',
      code: att.examCode,
      duration: att.examId?.durationMinutes || 60,
      totalMarks: att.maxScore || 100,
      score: att.totalScore || 0,
      percentage: Math.round(att.percentage || 0),
      type: 'COMPLETED',
      statusLabel: att.status === 'TIMED_OUT' ? 'Timed Out' : 'Completed',
      createdAt: att.submittedAt || att.createdAt,
      description: `Submitted with score ${att.totalScore || 0}/${att.maxScore || 100} pts`,
      raw: att
    }));

    let combined = [];
    if (assessmentFilter === 'AVAILABLE') {
      combined = availableItems;
    } else if (assessmentFilter === 'COMPLETED') {
      combined = completedItems;
    } else {
      combined = [...availableItems, ...completedItems];
    }

    if (!q) return combined;

    return combined.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [availableExams, completedAttempts, searchQuery, assessmentFilter]);

  // Topic & competency analysis from real completed attempts
  const topicPerformance = useMemo(() => {
    if (completedAttempts.length === 0) return [];
    const map = {};
    completedAttempts.forEach((att) => {
      const topic = att.examId?.title ? att.examId.title.split(' ')[0] : 'General Assessment';
      if (!map[topic]) {
        map[topic] = { name: topic, count: 0, totalPct: 0 };
      }
      map[topic].count += 1;
      map[topic].totalPct += att.percentage || 0;
    });

    return Object.values(map).map((t) => ({
      topic: t.name,
      average: Math.round(t.totalPct / t.count),
      attemptsCount: t.count
    }));
  }, [completedAttempts]);

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Dashboard';
      case 'assessments':
        return 'My Assessments';
      case 'submissions':
        return 'Submissions & Transcripts';
      case 'performance':
        return 'Academic Performance';
      case 'profile':
        return 'Profile & Settings';
      default:
        return 'Student Workspace';
    }
  };

  // If student is actively taking an examination
  if (activeTakingCode) {
    return (
      <div className="min-h-screen bg-[#F2F3F0]">
        <StudentPortalContainer
          initialExamCode={activeTakingCode}
          currentUser={currentUser}
          onExitToTeacherPortal={() => {
            setActiveTakingCode(null);
            fetchStudentData();
          }}
        />
      </div>
    );
  }

  // If student is viewing a completed exam transcript
  if (viewingResult) {
    return (
      <div className="min-h-screen bg-[#F2F3F0] py-8 px-4 sm:px-6">
        <StudentResultsView
          resultData={viewingResult}
          onReturnHome={() => setViewingResult(null)}
        />
      </div>
    );
  }

  return (
    <div className="tf-outer-frame selection:bg-[#EDFF72] selection:text-[#191A1D]">
      <div className="tf-inner-canvas">
        {/* ── 1. COMPACT DARK ICON-BASED VERTICAL NAVIGATION RAIL (Matches BentoSidebar) ── */}
        <aside
          className="hidden md:flex flex-col items-center w-[78px] shrink-0 h-[calc(100vh-28px)] my-3.5 ml-3.5 bg-[#191A1D] rounded-[32px] py-4 px-3 shadow-2xl relative z-40 select-none"
          aria-label="TestForge Student Navigation"
        >
          {/* Top Logo Section */}
          <div className="flex flex-col items-center w-full">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              onMouseEnter={(e) => showTooltip(e, 'TestForge Student Portal')}
              onMouseLeave={hideTooltip}
              title="TestForge"
              className="w-11 h-11 rounded-2xl bg-[#26282E] hover:bg-[#32353D] text-[#EDFF72] flex items-center justify-center transition-all duration-200 shadow-md cursor-pointer group"
            >
              <div className="w-6 h-6 rounded-full border-1.5 border-[#EDFF72] flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 fill-current transition-transform group-hover:scale-110" />
              </div>
            </button>

            {/* Subtle Divider under Logo */}
            <div className="w-8 h-px bg-white/10 my-3" />
          </div>

          {/* Main Navigation Group (Identical 8-12px gap, active lime pill treatment) */}
          <nav className="flex flex-col items-center gap-2 w-full">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    hideTooltip();
                    setActiveTab(item.id);
                  }}
                  onMouseEnter={(e) => showTooltip(e, item.label)}
                  onMouseLeave={hideTooltip}
                  aria-label={item.label}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
                    isActive
                      ? 'bg-[#EDFF72] text-[#191A1D] shadow-md font-bold'
                      : 'text-[#777D78] hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon
                    className="w-5 h-5 transition-transform group-hover:scale-110"
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  {isActive && (
                    <span className="absolute -right-1 w-1 h-3.5 rounded-full bg-[#EDFF72]" />
                  )}
                  {item.badge > 0 && !isActive && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#EDFF72]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Large Flexible Empty Space Separator */}
          <div className="flex-1 min-h-[32px] w-full" />

          {/* Bottom Utility Group (Divider line + Settings & Logout) */}
          <div className="flex flex-col items-center gap-2 w-full pt-2">
            <div className="w-8 h-px bg-white/10 my-1" />

            {/* Profile / Settings Button */}
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              onMouseEnter={(e) => showTooltip(e, 'Profile & Settings')}
              onMouseLeave={hideTooltip}
              aria-label="Profile"
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer group ${
                activeTab === 'profile'
                  ? 'bg-[#EDFF72] text-[#191A1D] shadow-md font-bold'
                  : 'text-[#777D78] hover:text-white hover:bg-white/10'
              }`}
            >
              <Settings className="w-5 h-5 transition-transform group-hover:scale-110" />
            </button>

            {/* Logout Button */}
            <button
              type="button"
              onClick={() => setShowSignOutConfirm(true)}
              onMouseEnter={(e) => showTooltip(e, 'Sign Out')}
              onMouseLeave={hideTooltip}
              aria-label="Sign Out"
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-[#777D78] hover:text-rose-400 hover:bg-rose-950/20 transition-all duration-200 cursor-pointer group"
            >
              <LogOut className="w-5 h-5 transition-transform group-hover:scale-110" />
            </button>
          </div>

          {/* Floating Hover Tooltip */}
          {tooltip.visible && (
            <div
              className="fixed left-[98px] -translate-y-1/2 bg-[#191A1D] text-white text-xs font-semibold px-3 py-1.5 rounded-xl shadow-xl border border-white/10 whitespace-nowrap z-50 pointer-events-none animate-fadeIn flex items-center gap-1.5"
              style={{ top: `${tooltip.top}px` }}
            >
              <span>{tooltip.text}</span>
            </div>
          )}
        </aside>

        {/* ── 2. MAIN CONTENT AREA (Matches Teacher Portal max-h / padding) ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto max-h-[calc(100vh-28px)] p-4 sm:p-6 lg:p-7 space-y-6">
          {/* Mobile Top Header (Small Screens) */}
          <div className="md:hidden flex items-center justify-between pb-3 border-b border-[#DDE1DA] mb-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#191A1D] flex items-center justify-center text-[#EDFF72]">
                <Sparkles className="w-4 h-4 fill-current" />
              </div>
              <span className="font-extrabold text-sm text-[#171819]">TestForge</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EDFF72] text-[#191A1D]">
                STUDENT
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-white border border-[#DDE1DA] text-[#171819]"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>

          {/* Mobile Navigation Drawer */}
          {mobileMenuOpen && (
            <div className="md:hidden bg-white border border-[#DDE1DA] rounded-2xl p-3 mb-2 shadow-lg space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                      isActive
                        ? 'bg-[#191A1D] text-[#EDFF72]'
                        : 'text-[#171819] hover:bg-[#F2F3F0]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <div className="pt-2 border-t border-[#DDE1DA] flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('profile');
                    setMobileMenuOpen(false);
                  }}
                  className="flex-1 py-2 text-xs font-bold text-[#171819] bg-[#F2F3F0] rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowSignOutConfirm(true);
                  }}
                  className="flex-1 py-2 text-xs font-bold text-rose-600 bg-rose-50 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}

          {/* ── 3. TOP BENTO HEADER (Exact Match to BentoTopHeader) ── */}
          <header className="w-full flex items-center justify-between gap-4 py-1 px-1 select-none">
            {/* Left: Brand & Breadcrumb (TestForge / Current Tab / STUDENT) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="flex items-center gap-1.5 text-sm font-extrabold text-[#171819] hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span>TestForge</span>
                <span className="w-2 h-2 rounded-xs bg-[#EDFF72] -skew-x-12 inline-block" />
              </button>

              <span className="text-[#CBD0C8] font-bold">/</span>

              <span className="text-xs font-semibold text-[#777D78] px-2.5 py-1 rounded-full bg-white border border-[#DDE1DA]">
                {getPageTitle()}
              </span>

              <span className="hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EDFF72] text-[#191A1D]">
                STUDENT
              </span>
            </div>

            {/* Right Controls: Quick Search, Notification & Student Profile Dropdown */}
            <div className="flex items-center gap-3">
              {/* Quick Search Input */}
              <div ref={searchRef} className="relative w-44 sm:w-60">
                <div className="relative w-full flex items-center">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#777D78] pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search exams..."
                    value={headerSearch}
                    onFocus={() => {
                      if (headerSearch.trim()) setIsHeaderSearchOpen(true);
                    }}
                    onChange={(e) => {
                      setHeaderSearch(e.target.value);
                      setIsHeaderSearchOpen(true);
                    }}
                    className="w-full bg-white hover:bg-[#F8F9F7] focus:bg-white text-[#171819] placeholder-[#777D78] text-xs font-medium rounded-full pl-9 pr-8 py-1.5 border border-[#DDE1DA] focus:border-[#171819] focus:outline-none transition-all shadow-2xs"
                  />
                  <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-[#F2F3F0] text-[9px] font-mono text-[#777D78]">
                    ⌘K
                  </kbd>
                </div>

                {/* Search Dropdown */}
                {isHeaderSearchOpen && headerSearch.trim().length > 0 && (
                  <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-[#DDE1DA] rounded-2xl shadow-xl overflow-hidden z-50 animate-fadeIn">
                    <div className="px-3.5 py-2 bg-[#F8F9F7] border-b border-[#DDE1DA] flex items-center justify-between text-xs">
                      <span className="font-bold text-[#777D78] text-[11px] uppercase">
                        Available Exams
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsHeaderSearchOpen(false);
                          setActiveTab('assessments');
                        }}
                        className="font-bold text-[#171819] hover:underline cursor-pointer text-xs"
                      >
                        View all →
                      </button>
                    </div>

                    <div className="divide-y divide-[#DDE1DA]/60 max-h-72 overflow-y-auto">
                      {availableExams
                        .filter(
                          (ex) =>
                            ex.title.toLowerCase().includes(headerSearch.toLowerCase()) ||
                            ex.examCode.toLowerCase().includes(headerSearch.toLowerCase())
                        )
                        .slice(0, 4)
                        .map((ex) => (
                          <div
                            key={ex._id}
                            onClick={() => {
                              setIsHeaderSearchOpen(false);
                              setActiveTakingCode(ex.examCode);
                            }}
                            className="p-2.5 hover:bg-[#F2F3F0] transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#EDFF72] text-[#191A1D]">
                                {ex.examCode}
                              </span>
                              <span className="text-[9px] text-[#777D78]">
                                {ex.durationMinutes || 60}m
                              </span>
                            </div>
                            <h5 className="text-xs font-bold text-[#171819] line-clamp-1">
                              {ex.title}
                            </h5>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notification Bell with lime unread dot */}
              <button
                type="button"
                title="Notifications"
                className="relative w-8 h-8 rounded-full bg-white border border-[#DDE1DA] flex items-center justify-center text-[#171819] hover:bg-[#F8F9F7] shadow-2xs cursor-pointer transition-transform hover:scale-105 active:scale-95"
              >
                <Bell className="w-3.5 h-3.5 text-[#777D78]" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#EDFF72] border border-[#191A1D]" />
              </button>

              {/* Student Profile Dropdown Button */}
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                title={`Profile & Settings (${currentUser?.name || 'Student'})`}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-white border border-[#DDE1DA] text-xs font-bold text-[#171819] shadow-2xs hover:bg-[#F8F9F7] cursor-pointer transition-transform hover:scale-102 active:scale-95"
              >
                <span className="w-5 h-5 rounded-full bg-[#191A1D] text-[#EDFF72] flex items-center justify-center text-[10px] font-extrabold">
                  {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : <User className="w-3 h-3" />}
                </span>
                <span className="truncate max-w-[100px]">{currentUser?.name || 'Student'}</span>
                <ChevronDown className="w-3 h-3 text-[#777D78]" />
              </button>
            </div>
          </header>

          {/* ── 4. TAB 1: STUDENT DASHBOARD (Bento Grid Visual Language) ── */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Welcome Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl sm:text-[28px] font-bold text-[#171819] tracking-tight flex items-center gap-2">
                    <span>{greeting}, {candidateFirstName}</span>
                    <span className="text-2xl">👋</span>
                  </h1>
                  <p className="text-sm text-[#777D78] mt-0.5">
                    Your candidate assessment workspace. Launch verified exams and review test results.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#DDE1DA] text-xs font-semibold text-[#171819] shadow-xs">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>Zero-Leak Environment Active</span>
                  </div>
                </div>
              </div>

              {/* Bento Card: Join an Assessment */}
              <div className="bg-white border border-[#DDE1DA] rounded-[30px] p-6 shadow-bento space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <h2 className="text-base sm:text-lg font-bold text-[#171819] tracking-tight flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-[#F2F3F0] flex items-center justify-center text-[#171819]">
                        <KeyRound className="w-4 h-4" />
                      </span>
                      <span>Join an Assessment</span>
                    </h2>
                    <p className="text-xs sm:text-[13px] text-[#777D78]">
                      Enter the 6-character access code provided by your instructor or institution.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#777D78] bg-[#F5F6F3] px-3 py-1 rounded-full border border-[#DDE1DA] self-start sm:self-auto font-medium">
                    Format: TF-XXXXXX
                  </span>
                </div>

                {errorMsg && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-[13px] flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleJoinByCode} className="flex flex-col sm:flex-row gap-3 pt-1">
                  <input
                    type="text"
                    required
                    value={examCodeInput}
                    onChange={(e) => setExamCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. TF-8X29"
                    className="flex-1 bg-[#F5F6F3] border border-[#DDE1DA] focus:border-[#191A1D] focus:bg-white rounded-2xl px-4 py-3 text-sm text-[#171819] placeholder:text-[#777D78] font-mono tracking-wider outline-none transition-all"
                  />
                  <button
                    type="submit"
                    className="tf-pill-button tf-pill-button-dark"
                  >
                    <span>Join Examination</span>
                    <ArrowUpRight className="h-4 w-4 text-[#EDFF72]" />
                  </button>
                </form>
              </div>

              {/* Bento Row: 4 Metric Cards (Matching Teacher Bento Proportions) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* CARD 1: AVAILABLE EXAMS (White Card with Capsule Meter) */}
                <div className="bg-white border border-[#DDE1DA] rounded-[30px] p-5 flex flex-col justify-between shadow-bento hover:shadow-bento-hover transition-all duration-300">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-[#F2F3F0] flex items-center justify-center text-[#171819]">
                        <BookOpen className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-bold text-[#171819]">Available Exams</span>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  </div>

                  <div className="my-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-extrabold tracking-tight text-[#171819]">
                        {availableCount}
                      </span>
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EDFF72]/70 border border-[#D8EA56] text-[10px] font-bold text-[#191A1D]">
                        <span>Live Session</span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-[#777D78] block mt-0.5">
                      Ready to launch and complete
                    </span>
                  </div>

                  {/* Interactive Capsule Meter */}
                  <div className="mt-2 pt-2 border-t border-[#DDE1DA]/60">
                    <div className="tf-capsule-meter">
                      {[...Array(8)].map((_, i) => {
                        const isFilled = i < Math.min(8, availableCount);
                        return (
                          <div
                            key={i}
                            className={`tf-capsule-bar ${
                              isFilled ? 'filled-charcoal' : 'unfilled-charcoal'
                            }`}
                            onClick={() => setActiveTab('assessments')}
                            title={`Exam slot #${i + 1}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* CARD 2: COMPLETED ASSESSMENTS (Lime Accent Bento Card) */}
                <div className="bg-[#EDFF72] border border-[#DEEF65] rounded-[30px] p-5 flex flex-col justify-between shadow-bento-lime hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-[#191A1D] flex items-center justify-center text-[#EDFF72]">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-bold text-[#191A1D]">Completed</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-[#191A1D] shadow-xs">
                      Evaluated
                    </span>
                  </div>

                  <div className="my-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-extrabold tracking-tight text-[#191A1D]">
                        {completedCount}
                      </span>
                      <span className="text-xs font-bold text-[#191A1D]/75">Submissions</span>
                    </div>
                    <span className="text-xs font-bold text-[#191A1D]/75 block mt-0.5">
                      All transcripts archived
                    </span>
                  </div>

                  {/* Capsule Row */}
                  <div className="mt-2 pt-2 border-t border-[#191A1D]/15">
                    <div className="tf-capsule-meter">
                      {[...Array(8)].map((_, i) => {
                        const isFilled = i < Math.min(8, completedCount);
                        return (
                          <div
                            key={i}
                            className={`tf-capsule-bar ${
                              isFilled ? 'filled-lime-dark' : 'unfilled-lime'
                            }`}
                            onClick={() => setActiveTab('submissions')}
                            title={`Submission #${i + 1}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* CARD 3: AVERAGE SCORE */}
                <div className="bg-white border border-[#DDE1DA] rounded-[30px] p-5 flex flex-col justify-between shadow-bento hover:shadow-bento-hover transition-all duration-300">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-[#F2F3F0] flex items-center justify-center text-amber-500">
                        <Award className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-bold text-[#171819]">Average Score</span>
                    </div>
                  </div>

                  <div className="my-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-extrabold tracking-tight text-[#171819]">
                        {avgScore !== null ? `${avgScore}%` : '—'}
                      </span>
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F2F3F0] text-[10px] font-bold text-[#777D78]">
                        <span>Cumulative</span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-[#777D78] block mt-0.5">
                      Across {completedCount} completed exams
                    </span>
                  </div>

                  <div className="mt-2 pt-2 border-t border-[#DDE1DA]/60 flex items-center justify-between text-xs text-[#777D78]">
                    <span>Passing Rate</span>
                    <span className="font-bold text-[#171819]">
                      {passingRate !== null ? `${passingRate}%` : '—'}
                    </span>
                  </div>
                </div>

                {/* CARD 4: HIGHEST SCORE */}
                <div className="bg-white border border-[#DDE1DA] rounded-[30px] p-5 flex flex-col justify-between shadow-bento hover:shadow-bento-hover transition-all duration-300">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-[#F2F3F0] flex items-center justify-center text-emerald-600">
                        <Sparkles className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-bold text-[#171819]">Highest Score</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800">
                      Personal Best
                    </span>
                  </div>

                  <div className="my-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-extrabold tracking-tight text-emerald-700">
                        {highestScore !== null ? `${highestScore}%` : '—'}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-[#777D78] block mt-0.5">
                      Record examination achievement
                    </span>
                  </div>

                  <div className="mt-2 pt-2 border-t border-[#DDE1DA]/60 flex items-center justify-between text-xs text-[#777D78]">
                    <span>Audit Status</span>
                    <span className="font-semibold text-emerald-700 flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> Verified
                    </span>
                  </div>
                </div>
              </div>

              {/* 2-Column Bento Section: Available Assessments (~65%) vs Recent Activity & Snapshot (~35%) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left: Available Assessments (8 cols) */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-base sm:text-lg font-bold text-[#171819] tracking-tight flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-[#171819]" />
                      <span>Available Assessments</span>
                      {availableCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#EDFF72] text-[#191A1D]">
                          {availableCount}
                        </span>
                      )}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('assessments')}
                      className="text-xs font-semibold text-[#777D78] hover:text-[#171819] flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <span>View All</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {availableExams.length === 0 ? (
                    <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-10 text-center space-y-3 shadow-bento">
                      <div className="w-12 h-12 rounded-full bg-[#F5F6F3] text-[#777D78] flex items-center justify-center mx-auto">
                        <BookOpen className="h-6 w-6" />
                      </div>
                      <p className="text-base font-bold text-[#171819]">No Open Assessments Scheduled</p>
                      <p className="text-sm text-[#777D78] max-w-md mx-auto">
                        You have completed all scheduled examinations. When your instructor publishes an assessment, it will appear here immediately.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {availableExams.map((exam) => (
                        <div
                          key={exam._id}
                          className="bg-white hover:bg-[#FDFDFD] border border-[#DDE1DA] hover:border-[#191A1D]/30 rounded-[28px] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5 transition-all shadow-bento group"
                        >
                          <div className="space-y-2 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-full bg-[#191A1D] text-[#EDFF72] font-mono text-xs font-bold">
                                {exam.examCode}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 text-xs font-semibold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Available Now
                              </span>
                            </div>
                            <h4 className="text-base font-bold text-[#171819] group-hover:text-[#191A1D] leading-snug">
                              {exam.title}
                            </h4>
                            <p className="text-xs sm:text-[13px] text-[#777D78] line-clamp-2">
                              {exam.description || 'Assigned programming examination with deterministic test suite evaluation.'}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-[#777D78] pt-1">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-[#171819]" />
                                {exam.durationMinutes || 60} mins
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Award className="h-3.5 w-3.5 text-[#171819]" />
                                {exam.totalMarks || 100} pts
                              </span>
                              {exam.createdAt && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5 text-[#777D78]" />
                                    {new Date(exam.createdAt).toLocaleDateString()}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setActiveTakingCode(exam.examCode)}
                            className="tf-pill-button tf-pill-button-dark shrink-0 self-start sm:self-auto"
                          >
                            <span>Start Exam</span>
                            <ArrowUpRight className="h-4 w-4 text-[#EDFF72]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: Submissions & Performance Snapshot (4 cols) */}
                <div className="lg:col-span-4 space-y-5">
                  {/* Recent Submissions */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-base sm:text-lg font-bold text-[#171819] tracking-tight flex items-center gap-2">
                        <FileCheck2 className="h-4 w-4 text-[#171819]" />
                        <span>Recent Submissions</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setActiveTab('submissions')}
                        className="text-xs font-semibold text-[#777D78] hover:text-[#171819] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>History</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {completedAttempts.length === 0 ? (
                      <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-6 text-center space-y-2 shadow-bento">
                        <FileCheck2 className="h-6 w-6 text-[#777D78] mx-auto" />
                        <p className="text-sm font-bold text-[#171819]">No Submissions Yet</p>
                        <p className="text-xs text-[#777D78]">
                          Complete an assessment to view official evaluation records here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {completedAttempts.slice(0, 3).map((att) => (
                          <div
                            key={att._id}
                            className="bg-white border border-[#DDE1DA] rounded-[24px] p-4 flex items-center justify-between gap-3 shadow-bento hover:border-[#191A1D]/20 transition-all"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-[#171819]">
                                  {att.examCode}
                                </span>
                                <span className="text-xs text-[#777D78]">
                                  {att.submittedAt
                                    ? new Date(att.submittedAt).toLocaleDateString()
                                    : 'Completed'}
                                </span>
                              </div>
                              <h4 className="text-xs sm:text-sm font-bold text-[#171819] truncate">
                                {att.examId?.title || 'Academic Assessment'}
                              </h4>
                              <div className="flex items-center gap-2 pt-0.5">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                    (att.percentage || 0) >= 75
                                      ? 'bg-emerald-500/10 text-emerald-800'
                                      : (att.percentage || 0) >= 50
                                      ? 'bg-amber-500/10 text-amber-800'
                                      : 'bg-rose-500/10 text-rose-800'
                                  }`}
                                >
                                  {Math.round(att.percentage || 0)}%
                                </span>
                                <span className="text-xs text-[#777D78]">
                                  {att.totalScore || 0}/{att.maxScore || 100} pts
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setViewingResult(att)}
                              className="tf-pill-button tf-pill-button-white text-xs py-1.5 px-3 shrink-0"
                            >
                              Transcript
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Performance Snapshot Bento Card */}
                  <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-5 sm:p-6 shadow-bento space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-[#171819] uppercase tracking-wider">
                        Performance Snapshot
                      </h4>
                      <TrendingUp className="h-4 w-4 text-[#171819]" />
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                          <span className="text-[#777D78]">Cumulative Average</span>
                          <span className="text-[#171819] font-bold">
                            {avgScore !== null ? `${avgScore}%` : '—'}
                          </span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-[#F5F6F3] overflow-hidden border border-[#DDE1DA]">
                          <div
                            style={{ width: `${avgScore || 0}%` }}
                            className="h-full bg-[#191A1D] rounded-full transition-all duration-500"
                          />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#F2F3F0] grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[#777D78] block">Pass Rate:</span>
                          <span className="font-bold text-[#171819]">
                            {passingRate !== null ? `${passingRate}%` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#777D78] block">Integrity Rating:</span>
                          <span className="font-bold text-emerald-700 flex items-center gap-1">
                            <ShieldCheck className="h-3.5 w-3.5" /> 100% Zero-Leak
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 5. TAB 2: MY ASSESSMENTS ── */}
          {activeTab === 'assessments' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl sm:text-[28px] font-bold text-[#171819] tracking-tight">
                    My Assessments
                  </h1>
                  <p className="text-sm text-[#777D78] mt-0.5">
                    Browse active, scheduled, and completed examinations assigned to you.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3.5 py-1.5 rounded-full bg-white border border-[#DDE1DA] text-xs font-bold text-[#171819]">
                    Total: {filteredAssessments.length}
                  </span>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-4 shadow-bento flex flex-col sm:flex-row items-center gap-3">
                {/* Search Input */}
                <div className="relative flex-1 w-full">
                  <Search className="h-4 w-4 text-[#777D78] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by title, code or description..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[#F5F6F3] border border-[#DDE1DA] focus:border-[#191A1D] focus:bg-white rounded-full text-xs sm:text-sm text-[#171819] placeholder:text-[#777D78] outline-none transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777D78] hover:text-[#171819]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 overflow-x-auto">
                  {['ALL', 'AVAILABLE', 'COMPLETED'].map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setAssessmentFilter(filter)}
                      className={`tf-pill-button text-xs py-2 px-4 ${
                        assessmentFilter === filter
                          ? 'tf-pill-button-dark'
                          : 'tf-pill-button-white'
                      }`}
                    >
                      {filter === 'ALL'
                        ? 'All Exams'
                        : filter === 'AVAILABLE'
                        ? 'Available'
                        : 'Completed'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assessment Cards Grid */}
              {filteredAssessments.length === 0 ? (
                <div className="bg-white border border-[#DDE1DA] rounded-[30px] p-12 text-center space-y-3 shadow-bento">
                  <BookOpen className="h-8 w-8 text-[#777D78] mx-auto" />
                  <p className="text-base font-bold text-[#171819]">No Examinations Found</p>
                  <p className="text-sm text-[#777D78] max-w-md mx-auto">
                    {searchQuery
                      ? 'No assessments match your current search query. Try clearing your search.'
                      : 'There are no assessments in this filter category.'}
                  </p>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="tf-pill-button tf-pill-button-dark mt-2"
                    >
                      Clear Search Filter
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {filteredAssessments.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border border-[#DDE1DA] hover:border-[#191A1D]/30 rounded-[28px] p-5 flex flex-col justify-between gap-4 transition-all shadow-bento"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-[#191A1D] text-[#EDFF72] font-mono text-xs font-bold">
                            {item.code}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              item.type === 'AVAILABLE'
                                ? 'bg-emerald-500/10 text-emerald-800'
                                : 'bg-[#F5F6F3] text-[#777D78] border border-[#DDE1DA]'
                            }`}
                          >
                            {item.statusLabel}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-bold text-[#171819] leading-snug">
                            {item.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-[#777D78] mt-1 line-clamp-2">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#F2F3F0] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 text-xs sm:text-[13px] text-[#777D78]">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-[#171819]" />
                            {item.duration}m
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Award className="h-3.5 w-3.5 text-[#171819]" />
                            {item.totalMarks} pts
                          </span>
                        </div>

                        {item.type === 'AVAILABLE' ? (
                          <button
                            type="button"
                            onClick={() => setActiveTakingCode(item.code)}
                            className="tf-pill-button tf-pill-button-dark py-2 px-4"
                          >
                            <span>Start Exam</span>
                            <ArrowUpRight className="h-4 w-4 text-[#EDFF72]" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setViewingResult(item.raw)}
                            className="tf-pill-button tf-pill-button-white py-2 px-4"
                          >
                            View Result
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 6. TAB 3: SUBMISSIONS & TRANSCRIPTS ── */}
          {activeTab === 'submissions' && (
            <div className="space-y-6">
              {/* Header & Metric Strip */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl sm:text-[28px] font-bold text-[#171819] tracking-tight">
                    Submissions & Transcripts
                  </h1>
                  <p className="text-sm text-[#777D78] mt-0.5">
                    Official record of completed assessments, verified scores, and execution audits.
                  </p>
                </div>
              </div>

              {/* Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-4 sm:p-5 shadow-bento">
                  <span className="text-xs sm:text-[13px] text-[#777D78] block">Total Submissions</span>
                  <span className="text-2xl sm:text-3xl font-extrabold text-[#171819] mt-1 block">
                    {completedCount}
                  </span>
                </div>
                <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-4 sm:p-5 shadow-bento">
                  <span className="text-xs sm:text-[13px] text-[#777D78] block">Average Percentage</span>
                  <span className="text-2xl sm:text-3xl font-extrabold text-[#171819] mt-1 block">
                    {avgScore !== null ? `${avgScore}%` : '—'}
                  </span>
                </div>
                <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-4 sm:p-5 shadow-bento">
                  <span className="text-xs sm:text-[13px] text-[#777D78] block">Top Performance</span>
                  <span className="text-2xl sm:text-3xl font-extrabold text-emerald-700 mt-1 block">
                    {highestScore !== null ? `${highestScore}%` : '—'}
                  </span>
                </div>
                <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-4 sm:p-5 shadow-bento">
                  <span className="text-xs sm:text-[13px] text-[#777D78] block">Integrity Status</span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-700 mt-2 block flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4" /> 100% Verified
                  </span>
                </div>
              </div>

              {/* Submissions Table */}
              <div className="bg-white border border-[#DDE1DA] rounded-[28px] shadow-bento overflow-hidden">
                {completedAttempts.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <FileCheck2 className="h-8 w-8 text-[#777D78] mx-auto" />
                    <p className="text-base font-bold text-[#171819]">No Examination History Found</p>
                    <p className="text-sm text-[#777D78] max-w-md mx-auto">
                      You haven't completed any assessments yet. Join an assessment from the Dashboard to record your first score.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-[#DDE1DA] bg-[#F5F6F3] text-[#777D78] font-bold uppercase tracking-wider text-xs">
                          <th className="py-3.5 px-5">Assessment</th>
                          <th className="py-3.5 px-4">Exam Code</th>
                          <th className="py-3.5 px-4">Submitted</th>
                          <th className="py-3.5 px-4">Score</th>
                          <th className="py-3.5 px-4">Grade</th>
                          <th className="py-3.5 px-4">Audit Status</th>
                          <th className="py-3.5 px-5 text-right">Transcript</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DDE1DA]">
                        {completedAttempts.map((attempt) => {
                          const pct = Math.round(attempt.percentage || 0);
                          return (
                            <tr key={attempt._id} className="hover:bg-[#F9FAF8] transition-colors">
                              <td className="py-4 px-5">
                                <span className="font-bold text-[#171819] block text-sm">
                                  {attempt.examId?.title || 'Academic Assessment'}
                                </span>
                                <span className="text-xs text-[#777D78]">
                                  {attempt.examId?.durationMinutes || 60}m duration
                                </span>
                              </td>
                              <td className="py-4 px-4 font-mono font-bold text-[#171819]">
                                {attempt.examCode}
                              </td>
                              <td className="py-4 px-4 text-[#777D78]">
                                {attempt.submittedAt
                                  ? new Date(attempt.submittedAt).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })
                                  : 'Completed'}
                              </td>
                              <td className="py-4 px-4 font-semibold text-[#171819]">
                                {attempt.totalScore || 0} / {attempt.maxScore || 100} pts
                              </td>
                              <td className="py-4 px-4">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-xs ${
                                    pct >= 75
                                      ? 'bg-emerald-500/10 text-emerald-800'
                                      : pct >= 50
                                      ? 'bg-amber-500/10 text-amber-800'
                                      : 'bg-rose-500/10 text-rose-800'
                                  }`}
                                >
                                  {pct}%
                                </span>
                              </td>
                              <td className="py-4 px-4">
                                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                                  <ShieldCheck className="h-4 w-4" />
                                  <span>Passed</span>
                                </span>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <button
                                  type="button"
                                  onClick={() => setViewingResult(attempt)}
                                  className="tf-pill-button tf-pill-button-dark text-xs py-1.5 px-3.5"
                                >
                                  View Report
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 7. TAB 4: ACADEMIC PERFORMANCE ── */}
          {activeTab === 'performance' && (
            <div className="space-y-6">
              {/* Header */}
              <div>
                <h1 className="text-2xl sm:text-[28px] font-bold text-[#171819] tracking-tight">
                  Academic Performance
                </h1>
                <p className="text-sm text-[#777D78] mt-0.5">
                  Detailed breakdown of your assessment execution, topic competencies, and grade trends.
                </p>
              </div>

              {/* 4 Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-5 shadow-bento space-y-1">
                  <span className="text-xs sm:text-[13px] font-semibold text-[#777D78] uppercase tracking-wider block">
                    Cumulative Average
                  </span>
                  <div className="text-3xl font-extrabold text-[#171819]">
                    {avgScore !== null ? `${avgScore}%` : '—'}
                  </div>
                  <span className="text-xs text-[#777D78] block">Across all submitted exams</span>
                </div>

                <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-5 shadow-bento space-y-1">
                  <span className="text-xs sm:text-[13px] font-semibold text-[#777D78] uppercase tracking-wider block">
                    Highest Score
                  </span>
                  <div className="text-3xl font-extrabold text-emerald-700">
                    {highestScore !== null ? `${highestScore}%` : '—'}
                  </div>
                  <span className="text-xs text-[#777D78] block">Personal best performance</span>
                </div>

                <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-5 shadow-bento space-y-1">
                  <span className="text-xs sm:text-[13px] font-semibold text-[#777D78] uppercase tracking-wider block">
                    Total Completed
                  </span>
                  <div className="text-3xl font-extrabold text-[#171819]">{completedCount}</div>
                  <span className="text-xs text-[#777D78] block">Certified evaluations</span>
                </div>

                <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-5 shadow-bento space-y-1">
                  <span className="text-xs sm:text-[13px] font-semibold text-[#777D78] uppercase tracking-wider block">
                    Proctoring Integrity
                  </span>
                  <div className="text-3xl font-extrabold text-[#171819]">100%</div>
                  <span className="text-xs text-emerald-700 font-semibold block flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4" /> Zero violations logged
                  </span>
                </div>
              </div>

              {/* Score Progression & Activity Visualizer */}
              <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-6 shadow-bento space-y-4">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#171819]">Score Progression History</h3>
                  <p className="text-xs sm:text-sm text-[#777D78]">
                    Chronological scores achieved across your verified examinations.
                  </p>
                </div>

                {completedAttempts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#777D78]">
                    No examination data available to render score chart. Complete assessments to visualize trends.
                  </div>
                ) : (
                  <div className="space-y-4 pt-2">
                    <div className="h-44 flex items-end gap-3 sm:gap-6 pt-4 border-b border-[#DDE1DA] px-2">
                      {completedAttempts
                        .slice()
                        .reverse()
                        .slice(-8)
                        .map((attempt, idx) => {
                          const pct = Math.round(attempt.percentage || 0);
                          const heightPct = Math.max(12, pct);
                          return (
                            <div
                              key={attempt._id || idx}
                              className="flex-1 flex flex-col items-center gap-2 group relative"
                            >
                              {/* Hover Tooltip */}
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-10 bg-[#191A1D] text-white text-xs font-bold px-2.5 py-1 rounded shadow-md pointer-events-none whitespace-nowrap z-10">
                                {pct}% · {attempt.examCode}
                              </div>
                              <div
                                style={{ height: `${heightPct}%` }}
                                className={`w-full rounded-t-xl transition-all duration-300 ${
                                  pct >= 75
                                    ? 'bg-[#191A1D] group-hover:bg-[#2A2B2F]'
                                    : pct >= 50
                                    ? 'bg-[#191A1D]/70'
                                    : 'bg-rose-600/80'
                                }`}
                              />
                            </div>
                          );
                        })}
                    </div>
                    {/* X-Axis labels */}
                    <div className="flex items-center justify-between text-xs font-mono text-[#777D78] px-2">
                      <span>Older Submissions</span>
                      <span>Latest Attempt</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Topic Breakdown & Execution Sandbox Compliance */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Topic Breakdown */}
                <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-6 shadow-bento space-y-4">
                  <h3 className="text-base sm:text-lg font-bold text-[#171819]">Competency Breakdown</h3>
                  {topicPerformance.length === 0 ? (
                    <p className="text-xs sm:text-sm text-[#777D78]">
                      Competency breakdown will populate automatically after submitting topic-tagged assessments.
                    </p>
                  ) : (
                    <div className="space-y-3.5">
                      {topicPerformance.map((topic, i) => (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
                            <span className="text-[#171819]">{topic.topic}</span>
                            <span className="text-[#777D78]">{topic.average}% Avg</span>
                          </div>
                          <div className="w-full h-2.5 rounded-full bg-[#F5F6F3] overflow-hidden border border-[#DDE1DA]">
                            <div
                              style={{ width: `${topic.average}%` }}
                              className="h-full bg-[#191A1D] rounded-full"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Execution Sandbox Compliance */}
                <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-6 shadow-bento space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    <h3 className="text-base sm:text-lg font-bold text-[#171819]">Execution Sandbox Compliance</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-[#777D78] leading-relaxed">
                    All code executions are sandboxed inside isolated micro-containers with strict resource quotas (1.0s CPU time, 256MB RAM). Your solutions are deterministically evaluated against official reference tests with zero data leakage.
                  </p>
                  <div className="pt-2 border-t border-[#F2F3F0] grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[#777D78] block">Audio / Tab Proctoring:</span>
                      <span className="font-semibold text-emerald-700">Strict Compliant</span>
                    </div>
                    <div>
                      <span className="text-[#777D78] block">Compiler Security:</span>
                      <span className="font-semibold text-[#171819]">gVisor / Firecracker</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 8. TAB 5: STUDENT PROFILE & SETTINGS ── */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Header */}
              <div>
                <h1 className="text-2xl sm:text-[28px] font-bold text-[#171819] tracking-tight">Student Profile</h1>
                <p className="text-sm text-[#777D78] mt-0.5">
                  Verified candidate identity, institution records, and session configuration.
                </p>
              </div>

              {/* Profile Card */}
              <div className="bg-white border border-[#DDE1DA] rounded-[30px] p-6 sm:p-7 shadow-bento space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-[#191A1D] text-[#EDFF72] flex items-center justify-center font-black text-2xl shadow-xs">
                      {currentUser?.name ? currentUser.name[0].toUpperCase() : 'S'}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-[#171819]">
                          {currentUser?.name || 'Student Candidate'}
                        </h2>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#EDFF72] text-[#191A1D]">
                          STUDENT
                        </span>
                      </div>
                      <a
                        href={`mailto:${currentUser?.email || 'student@testforge.edu'}`}
                        className="text-xs sm:text-sm text-[#777D78] hover:text-[#171819] hover:underline block"
                        title="Send email"
                      >
                        {currentUser?.email || 'student@testforge.edu'}
                      </a>
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                        <CheckCircle2 className="h-4 w-4" /> Identity Verified
                      </span>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F5F6F3] border border-[#DDE1DA] text-xs font-semibold text-[#171819] self-start sm:self-auto">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Active Session</span>
                  </div>
                </div>

                {/* Academic Metadata Grid */}
                <div className="pt-6 border-t border-[#DDE1DA] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs sm:text-sm">
                  <div className="bg-[#F5F6F3] p-4 rounded-2xl border border-[#DDE1DA]">
                    <span className="text-[#777D78] block text-xs uppercase font-bold tracking-wider">
                      Department
                    </span>
                    <span className="font-semibold text-[#171819] mt-1 block">
                      Computer Science & Engineering
                    </span>
                  </div>

                  <div className="bg-[#F5F6F3] p-4 rounded-2xl border border-[#DDE1DA]">
                    <span className="text-[#777D78] block text-xs uppercase font-bold tracking-wider">
                      Institution
                    </span>
                    <span className="font-semibold text-[#171819] mt-1 block">
                      Chitkara University
                    </span>
                  </div>

                  <div className="bg-[#F5F6F3] p-4 rounded-2xl border border-[#DDE1DA]">
                    <span className="text-[#777D78] block text-xs uppercase font-bold tracking-wider">
                      Candidate ID
                    </span>
                    <span className="font-mono font-semibold text-[#171819] mt-1 block">
                      {currentUser?._id ? `TF-${currentUser._id.slice(-6).toUpperCase()}` : 'TF-STU001'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Security & Authentication */}
              <div className="bg-white border border-[#DDE1DA] rounded-[30px] p-6 sm:p-7 shadow-bento space-y-4">
                <h3 className="text-base sm:text-lg font-bold text-[#171819]">Account Security & Session</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
                  <div className="p-4 rounded-2xl border border-[#DDE1DA] bg-[#F5F6F3] space-y-1">
                    <span className="text-[#777D78] block text-xs font-bold uppercase tracking-wider">
                      Authentication Protocol
                    </span>
                    <span className="font-semibold text-[#171819] block">
                      256-bit JWT Session Token
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl border border-[#DDE1DA] bg-[#F5F6F3] space-y-1">
                    <span className="text-[#777D78] block text-xs font-bold uppercase tracking-wider">
                      Role Privileges
                    </span>
                    <span className="font-semibold text-[#171819] block">
                      Student Assessment & Code Submission
                    </span>
                  </div>
                </div>

                {/* Sign Out Card */}
                <div className="pt-4 border-t border-[#DDE1DA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-[#171819]">Sign Out of TestForge</h4>
                    <p className="text-xs sm:text-sm text-[#777D78]">
                      End your active candidate session on this device.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSignOutConfirm(true)}
                    className="px-5 py-2.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs sm:text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 self-start sm:self-auto"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>

              {/* Academic Support Helpline & Copyright */}
              <div className="bg-white border border-[#DDE1DA] rounded-[30px] p-6 shadow-bento flex flex-wrap items-center justify-between text-xs sm:text-sm text-[#777D78] gap-4">
                <span>© {new Date().getFullYear()} TestForge Academic Systems. All rights reserved.</span>
                <div className="flex items-center gap-4">
                  <a
                    href="tel:+18005553674"
                    className="hover:text-[#171819] transition-colors font-semibold flex items-center gap-1.5"
                    title="Call Student Support Helpline"
                  >
                    <span>Helpline:</span>
                    <span className="font-mono text-[#171819]">+1 (800) 555-3674</span>
                  </a>
                  <span>•</span>
                  <a
                    href="mailto:support@testforge.edu"
                    className="hover:text-[#171819] transition-colors font-semibold flex items-center gap-1.5"
                    title="Email Academic Support"
                  >
                    <span>Support:</span>
                    <span className="text-[#171819]">support@testforge.edu</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SIGN OUT CONFIRMATION MODAL ── */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-6 max-w-sm w-full shadow-2xl space-y-4 animate-scaleIn">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <LogOut className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#171819]">Confirm Sign Out</h3>
              <p className="text-xs sm:text-sm text-[#777D78] mt-1">
                Are you sure you want to end your student candidate session? Any unsaved work in active exams will be lost.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(false)}
                className="tf-pill-button tf-pill-button-white text-xs py-2 px-4"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSignOutConfirm(false);
                  onSignOut();
                }}
                className="tf-pill-button tf-pill-button-dark bg-rose-600 hover:bg-rose-700 text-white text-xs py-2 px-4"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboardView;

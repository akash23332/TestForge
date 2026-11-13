import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../lib/api';
import {
  Sparkles,
  Plus,
  Copy,
  Check,
  Clock,
  Award,
  Users,
  Trash2,
  ExternalLink,
  BookOpen,
  CheckCircle2,
  X,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Share2,
  Eye,
  ShieldAlert,
  ShieldCheck,
  BarChart3,
  ArrowRight,
  Brain,
  Code,
  Cpu,
  Layout,
  Database,
  RefreshCw,
  FileText,
  CheckCircle,
  Radio,
  SlidersHorizontal,
  Compass
} from 'lucide-react';

// Smooth number counter transition
const AnimatedCount = ({ value, duration = 900 }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame;
    const start = performance.now();
    const numVal = Number(value) || 0;
    const step = (now) => {
      const elapsed = now - start;
      const k = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(Math.round(numVal * eased));
      if (k < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{display}</>;
};

export const TeacherExamsView = ({ onNavigateToStudentPortal, onNavigateToPaperDesigner, questions = [] }) => {
  const [exams, setExams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(null);
  const [copiedLink, setCopiedLink] = useState(null);

  // Search, Filter & View Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('newest');
  const [showAllActive, setShowAllActive] = useState(false);
  const [showAllCompleted, setShowAllCompleted] = useState(false);

  // Quick Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTopic, setNewTopic] = useState('Computer Science');
  const [newDuration, setNewDuration] = useState(60);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Analytics Modal
  const [selectedExamForAnalytics, setSelectedExamForAnalytics] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  const heroRef = useRef(null);
  const tiltRef = useRef(null);

  const fetchExams = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/exams');
      setExams(res.data.data || []);
    } catch {
      setExams([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const handleCopyCode = (code, e) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyStudentLink = (code, e) => {
    if (e) e.stopPropagation();
    const url = `${window.location.origin}/?tab=student&code=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(code);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleCreateExam = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setCreateError('Please enter an examination title.');
      return;
    }
    if (selectedQuestionIds.length === 0) {
      setCreateError('Please select at least 1 programming question for this exam.');
      return;
    }

    setIsCreating(true);
    setCreateError('');

    try {
      const formattedQuestions = selectedQuestionIds.map((qId, i) => {
        const isValidId = /^[0-9a-fA-F]{24}$/.test(String(qId));
        return {
          type: 'coding',
          questionId: isValidId ? qId : null,
          marks: 10,
          order: i + 1
        };
      });

      await api.post('/exams', {
        title: newTitle.trim(),
        durationMinutes: Number(newDuration),
        subject: newTopic,
        sections: [
          {
            name: `${newTopic} Core Assessment`,
            questions: formattedQuestions
          }
        ],
        status: 'LIVE'
      });

      setIsCreateOpen(false);
      setNewTitle('');
      setSelectedQuestionIds([]);
      fetchExams();
    } catch (err) {
      setCreateError(err.response?.data?.message || err.customMessage || 'Failed to create exam.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteExam = async (id, title, e) => {
    if (e) e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${title || 'this examination'}"? Candidate attempts will also be removed.`)) {
      return;
    }
    try {
      await api.delete(`/exams/${id}`);
      fetchExams();
    } catch {
      alert('Failed to delete examination.');
    }
  };

  const handleOpenAnalytics = async (exam, e) => {
    if (e) e.stopPropagation();
    setSelectedExamForAnalytics(exam);
    setIsLoadingAnalytics(true);
    try {
      const res = await api.get(`/exams/${exam._id}/analytics`);
      setAnalyticsData(res.data.data);
    } catch {
      setAnalyticsData(null);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const toggleStatus = async (exam, e) => {
    if (e) e.stopPropagation();
    const nextStatus = exam.status === 'LIVE' ? 'COMPLETED' : 'LIVE';
    try {
      await api.put(`/exams/${exam._id}`, { status: nextStatus });
      fetchExams();
      if (selectedExamForAnalytics?._id === exam._id) {
        setSelectedExamForAnalytics({ ...selectedExamForAnalytics, status: nextStatus });
      }
    } catch {
      alert('Failed to update status.');
    }
  };

  // Helper to determine topic category & theme styling
  const getExamMeta = (exam) => {
    const title = (exam.title || '').toLowerCase();
    const subject = (exam.subject || '').toLowerCase();

    if (title.includes('machine learning') || title.includes('ai') || subject.includes('learning')) {
      return {
        category: 'Machine Learning',
        icon: Brain,
        iconBg: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
        level: 'Advance'
      };
    }
    if (title.includes('design') || title.includes('ux') || title.includes('formal') || subject.includes('design')) {
      return {
        category: 'Formal Design',
        icon: Layout,
        iconBg: 'bg-amber-50 text-amber-600 border border-amber-100',
        level: 'Intermediate'
      };
    }
    if (title.includes('javascript') || title.includes('js') || title.includes('web') || title.includes('react')) {
      return {
        category: 'JavaScript',
        icon: Code,
        iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
        level: 'Advance'
      };
    }
    if (title.includes('data') || title.includes('sql') || title.includes('database')) {
      return {
        category: 'Database Systems',
        icon: Database,
        iconBg: 'bg-blue-50 text-blue-600 border border-blue-100',
        level: 'Intermediate'
      };
    }
    return {
      category: exam.subject || 'Computer Science',
      icon: Cpu,
      iconBg: 'bg-stone-100 text-[#171819] border border-stone-200',
      level: 'Advance'
    };
  };

  // Aggregate Metrics
  const activeExams = useMemo(() => {
    return exams.filter((e) => e.status === 'LIVE' || !e.status);
  }, [exams]);

  const completedExams = useMemo(() => {
    return exams.filter((e) => e.status === 'COMPLETED');
  }, [exams]);

  const totalCandidatesJoined = useMemo(() => {
    return exams.reduce((acc, e) => acc + (e.stats?.totalCandidates || 0), 0);
  }, [exams]);

  const totalCompletedCandidates = useMemo(() => {
    return exams.reduce((acc, e) => acc + (e.stats?.completedCandidates || 0), 0);
  }, [exams]);

  const participationRate = useMemo(() => {
    if (totalCandidatesJoined === 0) return 98;
    return Math.min(100, Math.round((totalCompletedCandidates / totalCandidatesJoined) * 100));
  }, [totalCandidatesJoined, totalCompletedCandidates]);

  // Filtered active & completed lists
  const filterList = (list) => {
    return list.filter((item) => {
      const matchesSearch =
        searchQuery === '' ||
        (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.examCode && item.examCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.subject && item.subject.toLowerCase().includes(searchQuery.toLowerCase()));

      const meta = getExamMeta(item);
      const matchesCategory =
        categoryFilter === 'ALL' ||
        meta.category.toLowerCase().includes(categoryFilter.toLowerCase()) ||
        (item.subject && item.subject.toLowerCase().includes(categoryFilter.toLowerCase()));

      return matchesSearch && matchesCategory;
    });
  };

  const filteredActive = useMemo(() => {
    const list = filterList(activeExams);
    if (sortBy === 'duration') return list.sort((a, b) => (b.durationMinutes || 0) - (a.durationMinutes || 0));
    if (sortBy === 'candidates') return list.sort((a, b) => (b.stats?.totalCandidates || 0) - (a.stats?.totalCandidates || 0));
    return list;
  }, [activeExams, searchQuery, categoryFilter, sortBy]);

  const filteredCompleted = useMemo(() => {
    return filterList(completedExams);
  }, [completedExams, searchQuery, categoryFilter]);

  const visibleActive = showAllActive ? filteredActive : filteredActive.slice(0, 6);
  const visibleCompleted = showAllCompleted ? filteredCompleted : filteredCompleted.slice(0, 3);

  const getQuestionCount = (exam) => {
    if (!exam.sections || !Array.isArray(exam.sections)) return 0;
    return exam.sections.reduce((acc, s) => acc + (s.questions?.length || 0), 0);
  };

  // Cursor Gyro Tilt Handlers
  const handleHeroMouseMove = (e) => {
    if (!heroRef.current || !tiltRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    tiltRef.current.style.transform = `rotateX(${-y * 18}deg) rotateY(${x * 24}deg)`;
  };

  const handleHeroMouseLeave = () => {
    if (!tiltRef.current) return;
    tiltRef.current.style.transform = 'rotateX(0deg) rotateY(0deg)';
  };

  return (
    <div className="tf-exams-root select-none font-sans text-[#171819] pb-16">
      {/* ────────────────────────────────────────────────────────────────────────────
          SCOPED STYLES: 100% LIGHT THEME, 3D CHRONOMETER SHIELD, QUESTION BANK MOTIONS
          ──────────────────────────────────────────────────────────────────────────── */}
      <style>{`
        .tf-exams-root {
          --canvas: #F2F3F0;
          --card: #FFFFFF;
          --line: #DDE1DA;
          --ink: #171819;
          --mute: #777D78;
          --acc: #EDFF72;
          --dark: #101112;
        }

        /* Top 2-Column Banner Grid */
        .tf-exams-root .tf-top {
          display: grid;
          grid-template-columns: 1.55fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        @media (max-width: 1024px) {
          .tf-exams-root .tf-top {
            grid-template-columns: 1fr;
          }
        }

        /* Bento Cards */
        .tf-exams-root .tf-card {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 28px;
          position: relative;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }

        /* Hero Bento Card */
        .tf-exams-root .tf-hero {
          background: #101112;
          color: #ffffff;
          padding: 32px 36px;
          border-radius: 32px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 290px;
          position: relative;
          overflow: hidden;
          border: 1px solid #232528;
        }

        /* Staggered Title Animations */
        .tf-exams-root .hero-title {
          font-size: clamp(32px, 3.4vw, 46px);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.05;
          margin: 6px 0 10px;
          display: flex;
          flex-wrap: wrap;
        }
        .tf-exams-root .tfTitleChar {
          display: inline-block;
          animation: tfCharIn 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
          animation-delay: calc(var(--ci) * 0.025s);
        }
        @keyframes tfCharIn {
          from {
            opacity: 0;
            transform: translateY(14px) rotate(4deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
        }

        /* 3D Chronometer Shield Stage - Aligned like Create Question */
        .tf-exams-root .stage {
          position: absolute;
          right: 12px;
          top: 0;
          bottom: 0;
          width: 46%;
          perspective: 850px;
          display: grid;
          place-items: center;
          pointer-events: none;
          z-index: 1;
        }
        .tf-exams-root .stage .float {
          animation: tfChronFloat 3.2s ease-in-out infinite;
          transform-style: preserve-3d;
        }
        @keyframes tfChronFloat {
          0%, 100% {
            transform: translateY(0px) rotateZ(0deg);
          }
          50% {
            transform: translateY(-16px) rotateZ(2deg);
          }
        }
        .tf-exams-root .tilt {
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform .12s ease-out;
          display: grid;
          place-items: center;
        }
        .tf-exams-root .chron-shield {
          width: 155px;
          height: 155px;
          position: relative;
          transform-style: preserve-3d;
          transform: rotateX(20deg) rotateY(-18deg);
        }
        .tf-exams-root .ring-outer {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px dashed rgba(237, 255, 114, 0.6);
          animation: tfSpinClock 14s linear infinite;
        }
        .tf-exams-root .ring-inner {
          position: absolute;
          inset: 20px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #EDFF72;
          animation: tfSpinCounter 7s linear infinite;
        }
        .tf-exams-root .core-badge {
          position: absolute;
          inset: 38px;
          background: #17181c;
          border: 2px solid #32353f;
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 28px rgba(237, 255, 114, 0.35);
          transform: translateZ(22px);
        }
        .tf-exams-root .stage .shadow {
          position: absolute;
          bottom: 24px;
          width: 140px;
          height: 22px;
          border-radius: 50%;
          background: rgba(0,0,0,.55);
          filter: blur(10px);
          animation: tfShadow 3.2s ease-in-out infinite;
        }
        @keyframes tfShadow {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(0.72); opacity: 0.28; }
        }
        @keyframes tfSpinClock {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes tfSpinCounter {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }

        /* 2x2 Telemetry Cards */
        .tf-exams-root .tf-quad {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .tf-exams-root .tf-mini {
          padding: 22px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 136px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .tf-exams-root .tf-mini:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.04);
        }
        .tf-exams-root .tf-tile {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          background: #F2F3F0;
          border: 1px solid var(--line);
          display: grid;
          place-items: center;
          font-size: 14px;
          font-weight: 800;
          color: var(--ink);
          margin-bottom: 8px;
        }
        .tf-exams-root .tf-cap {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .tf-exams-root .tf-big {
          font-size: 32px;
          font-weight: 900;
          letter-spacing: -0.03em;
          color: var(--ink);
          line-height: 1;
        }
        .tf-exams-root .tf-sub {
          font-size: 11px;
          font-weight: 600;
          color: var(--mute);
          margin-top: 4px;
        }

        /* Rise Entrance Animations */
        .tf-exams-root .rise {
          animation: tfRise 0.45s ease backwards;
          animation-delay: calc(var(--k, 0) * 0.06s);
        }
        @keyframes tfRise {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* ────────────────────────────────────────────────────────────────────────────
          TOP 2-COLUMN BANNER GRID: HERO CARD + 4 STATS CARDS
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-top">
        {/* Left Hero Card with 3D Proctor Chronometer */}
        <section
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
          className="tf-hero rise"
          style={{ '--k': 1 }}
        >
          <div className="max-w-[520px] relative z-10">
            {/* Pill Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1c1d22] border border-[#2d3036] text-[11px] font-mono font-bold tracking-wider text-[#d5dbd2] uppercase mb-2">
              <span className="w-2 h-2 rounded-full bg-[#EDFF72] shadow-[0_0_8px_#EDFF72]" />
              LIVE EXAMINATION DISPATCHER
            </div>

            {/* Animated Staggered Character Title */}
            <h1 className="hero-title" aria-label="Examinations">
              {'Examinations'.split('').map((ch, i) => (
                <span key={i} className="tfTitleChar" style={{ '--ci': i }}>
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              ))}
            </h1>

            <p className="text-xs text-[#a0a59e] max-w-[440px] leading-relaxed mb-6">
              Dispatch candidate test sessions, broadcast cryptographic access keys, audit real-time proctoring telemetry, and analyze cohort completion rates.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToPaperDesigner) onNavigateToPaperDesigner();
                  else setIsCreateOpen(true);
                }}
                className="px-5 py-2.5 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-xs font-black text-[#101112] shadow-sm transition-transform active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Launch New Exam</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="px-4 py-2.5 rounded-full bg-[#1c1d22] hover:bg-[#252830] text-xs font-bold text-white border border-[#30333d] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#a0a59e]" />
                <span>Quick Quiz</span>
              </button>

              <button
                type="button"
                onClick={fetchExams}
                className="px-4 py-2.5 rounded-full bg-[#1c1d22] hover:bg-[#252830] text-xs font-bold text-white border border-[#30333d] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#a0a59e] ${isLoading ? 'animate-spin' : ''}`} />
                <span>Sync Live</span>
              </button>
            </div>
          </div>

          {/* Footer Telemetry Strip */}
          <div className="pt-4 border-t border-[#23252a] flex items-center gap-5 text-xs text-[#8c9289] font-mono relative z-10 flex-wrap">
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={activeExams.length} /></b> live tests
            </span>
            <span>
              <b className="text-[#EDFF72] font-sans text-sm"><AnimatedCount value={totalCandidatesJoined} /></b> enrolled
            </span>
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={completedExams.length} /></b> concluded
            </span>
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={participationRate} />%</b> completion
            </span>
          </div>

          {/* 3D Chronometer Shield Stage with Interactive Gyro Tilt */}
          <div className="stage" aria-hidden="true">
            <div className="float">
              <div className="tilt" ref={tiltRef}>
                <div className="chron-shield">
                  <div className="ring-outer" />
                  <div className="ring-inner" />
                  <div className="core-badge">
                    <ShieldCheck className="w-8 h-8 text-[#EDFF72] stroke-[2.2]" />
                    <span className="text-[9px] font-mono font-black text-white mt-1 uppercase tracking-wider">SECURE</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="shadow" />
          </div>
        </section>

        {/* Right 2x2 Telemetry Cards Grid */}
        <div className="tf-quad">
          {/* Card 1: Active Challenges */}
          <div className="tf-card tf-mini rise" style={{ '--k': 2 }}>
            <div className="tf-tile">
              <Sparkles className="w-4 h-4 text-[#171819]" />
            </div>
            <div className="tf-cap">Active Quizzes</div>
            <div className="tf-big">
              <AnimatedCount value={activeExams.length} />
            </div>
            <div className="tf-sub">
              Broadcasting access codes
            </div>
          </div>

          {/* Card 2: Candidates Joined */}
          <div className="tf-card tf-mini rise" style={{ '--k': 3 }}>
            <div className="tf-tile">
              <Users className="w-4 h-4 text-[#171819]" />
            </div>
            <div className="tf-cap">Candidates Joined</div>
            <div className="tf-big">
              <AnimatedCount value={totalCandidatesJoined} />
            </div>
            <div className="tf-sub">
              {totalCompletedCandidates} verified submissions
            </div>
          </div>

          {/* Card 3: Completion Rate */}
          <div className="tf-card tf-mini rise" style={{ '--k': 4 }}>
            <div className="flex items-center justify-between">
              <div className="tf-tile">
                <CheckCircle2 className="w-4 h-4 text-[#171819]" />
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Optimal
              </span>
            </div>
            <div className="tf-cap">Completion Rate</div>
            <div className="tf-big">
              <AnimatedCount value={participationRate} />%
            </div>
            <div className="tf-sub">
              Cohort submission velocity
            </div>
          </div>

          {/* Card 4: Proctor Integrity */}
          <div className="tf-card tf-mini rise" style={{ '--k': 5 }}>
            <div className="flex items-center justify-between">
              <div className="tf-tile">
                <ShieldAlert className="w-4 h-4 text-[#171819]" />
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" />
            </div>
            <div className="tf-cap">Proctor Engine</div>
            <div className="tf-big text-lg font-bold">
              Strict Active
            </div>
            <div className="tf-sub">
              Zero sandbox breaches
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          FILTER, SEARCH & SORT CONTROLS BAR
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-4 mb-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <h2 className="text-base font-black text-[#171819] tracking-tight">
            Active Examinations
          </h2>
          <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#F2F3F0] text-[#777D78] border border-[#DDE1DA]">
            {filteredActive.length} active
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Search Input */}
          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-[#777D78] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exam code, topic, title..."
              className="w-full bg-[#F2F3F0] border border-[#DDE1DA] focus:border-[#101112] rounded-full pl-9 pr-8 py-2 text-xs font-semibold text-[#171819] placeholder:text-[#777D78] outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777D78] hover:text-[#171819] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#F2F3F0] border border-[#DDE1DA] text-[#171819] text-xs font-bold rounded-xl px-3 py-2 outline-none cursor-pointer hover:border-[#101112] transition-colors"
          >
            <option value="ALL">All Categories</option>
            <option value="Computer Science">Computer Science</option>
            <option value="Machine Learning">Machine Learning</option>
            <option value="Formal Design">Formal Design</option>
            <option value="JavaScript">JavaScript</option>
            <option value="Database Systems">Database Systems</option>
          </select>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#F2F3F0] border border-[#DDE1DA] text-[#171819] text-xs font-bold rounded-xl px-3 py-2 outline-none cursor-pointer hover:border-[#101112] transition-colors"
          >
            <option value="newest">Newest First</option>
            <option value="candidates">Most Candidates</option>
            <option value="duration">Longest Duration</option>
          </select>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          ACTIVE EXAMS CARDS GRID
          ──────────────────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="tf-card py-20 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#101112] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-[#777D78]">Synchronizing examination records...</p>
        </div>
      ) : filteredActive.length === 0 ? (
        <div className="tf-card py-16 text-center space-y-3 p-8">
          <div className="w-12 h-12 rounded-2xl bg-[#F2F3F0] text-[#171819] flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6 stroke-[1.8]" />
          </div>
          <h3 className="text-sm font-black text-[#171819]">No Active Quizzes Match Filter</h3>
          <p className="text-xs text-[#777D78] max-w-md mx-auto leading-relaxed">
            Create a new quiz or publish from the Paper Designer to generate a shareable student access code.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="px-5 py-2.5 bg-[#101112] hover:bg-black text-[#EDFF72] font-black text-xs rounded-full transition-all cursor-pointer inline-flex items-center gap-2 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Exam</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleActive.map((exam) => {
            const meta = getExamMeta(exam);
            const TopicIcon = meta.icon;
            const qCount = getQuestionCount(exam);

            return (
              <div
                key={exam._id}
                className="tf-card p-6 flex flex-col justify-between group hover:border-[#101112]/40 transition-all shadow-xs"
              >
                <div>
                  {/* Top Status Strip */}
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span
                      onClick={(e) => toggleStatus(exam, e)}
                      title="Click to toggle between LIVE and COMPLETED"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer hover:bg-emerald-100 transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE
                    </span>
                  </div>

                  {/* Title & Exam Code */}
                  <div className="mb-4">
                    <h3 className="text-base font-black text-[#171819] line-clamp-2 leading-snug">
                      {exam.title}
                    </h3>
                    {exam.examCode && (
                      <span className="text-[11px] font-mono font-bold text-[#777D78] block mt-1">
                        Code: {exam.examCode}
                      </span>
                    )}
                  </div>

                  {/* Metrics Badges */}
                  <div className="flex items-center gap-2.5 text-xs text-[#777D78] mb-4">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#777D78]" />
                      <span>{exam.durationMinutes || 60}m</span>
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-[#777D78]" />
                      <span>{qCount || 8} Qs</span>
                    </span>
                    <span>•</span>
                    <span className="font-bold text-[#171819]">{meta.level}</span>
                  </div>

                  {/* Candidate Telemetry Strip */}
                  <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] grid grid-cols-3 gap-2 text-center text-xs mb-4">
                    <div>
                      <span className="text-[10px] text-[#777D78] block uppercase font-bold">Enrolled</span>
                      <span className="font-black text-[#171819]">{exam.stats?.totalCandidates || 0}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#777D78] block uppercase font-bold">Finished</span>
                      <span className="font-black text-emerald-600">{exam.stats?.completedCandidates || 0}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#777D78] block uppercase font-bold">Avg Score</span>
                      <span className="font-black text-[#171819]">{exam.stats?.avgScore || 0}%</span>
                    </div>
                  </div>
                </div>

                <div>
                  {/* Access Code Box & Candidate Link Share */}
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div
                      onClick={(e) => handleCopyCode(exam.examCode, e)}
                      title="Click to copy student access code"
                      className="flex-1 flex items-center justify-between px-3.5 py-2 rounded-xl bg-white border border-[#DDE1DA] hover:border-[#101112] text-[#171819] font-mono text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                    >
                      <span className="text-[10px] text-[#777D78] font-sans font-bold">KEY</span>
                      <span className="tracking-wider">{exam.examCode}</span>
                      {copiedCode === exam.examCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-[#777D78]" />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleCopyStudentLink(exam.examCode, e)}
                      title="Copy direct candidate link"
                      className="p-2.5 rounded-xl bg-white border border-[#DDE1DA] hover:border-[#101112] text-[#777D78] hover:text-[#171819] transition-colors cursor-pointer shadow-2xs"
                    >
                      {copiedLink === exam.examCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#DDE1DA]/80">
                    <button
                      type="button"
                      onClick={(e) => handleOpenAnalytics(exam, e)}
                      className="flex-1 py-2 px-3 rounded-full bg-[#101112] hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-[#EDFF72]" />
                      <span>Analytics</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigateToStudentPortal(exam.examCode)}
                      title="Open student test preview"
                      className="py-2 px-3 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] text-[#171819] text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteExam(exam._id, exam.title, e)}
                      title="Delete examination"
                      className="p-2 text-[#777D78] hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Show All Toggle */}
      {filteredActive.length > 6 && (
        <div className="text-center pt-4">
          <button
            type="button"
            onClick={() => setShowAllActive(!showAllActive)}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white border border-[#DDE1DA] hover:border-[#101112] text-xs font-black text-[#171819] transition-all cursor-pointer shadow-xs"
          >
            <span>{showAllActive ? 'Collapse Active Quizzes' : `Show All Quizzes (${filteredActive.length})`}</span>
            {showAllActive ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          CONCLUDED QUIZZES ARCHIVE
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-4 pt-8 mt-8 border-t border-[#DDE1DA]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-black text-[#171819] tracking-tight">
              Concluded Assessments Archive
            </h2>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-white border border-[#DDE1DA] text-[#777D78]">
              {filteredCompleted.length} archived
            </span>
          </div>
        </div>

        {filteredCompleted.length === 0 ? (
          <div className="tf-card py-10 text-center text-xs text-[#777D78]">
            No concluded quizzes in your archive. Concluded tests and final audit logs will appear here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleCompleted.map((exam) => {
              const meta = getExamMeta(exam);
              const TopicIcon = meta.icon;
              const qCount = getQuestionCount(exam);

              return (
                <div
                  key={exam._id}
                  className="tf-card p-6 flex flex-col justify-between group shadow-xs opacity-90 hover:opacity-100 transition-opacity"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        onClick={(e) => toggleStatus(exam, e)}
                        title="Click to reopen as LIVE"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-[#F2F3F0] text-[#171819] border border-[#DDE1DA] cursor-pointer hover:bg-stone-200 transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        COMPLETED
                      </span>
                    </div>

                    <div className="mb-3.5">
                      <h3 className="text-base font-bold text-[#171819] line-clamp-2 leading-snug">
                        {exam.title}
                      </h3>
                      {exam.examCode && (
                        <span className="text-[11px] font-mono font-bold text-[#777D78] block mt-1">
                          Code: {exam.examCode}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 text-xs text-[#777D78] mb-4">
                      <span>{exam.durationMinutes || 60}m</span>
                      <span>•</span>
                      <span>{qCount || 8} Qs</span>
                      <span>•</span>
                      <span>{meta.level}</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] grid grid-cols-3 gap-2 text-center text-xs mb-4">
                      <div>
                        <span className="text-[10px] text-[#777D78] block uppercase font-bold">Joined</span>
                        <span className="font-bold text-[#171819]">{exam.stats?.totalCandidates || 0}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#777D78] block uppercase font-bold">Finished</span>
                        <span className="font-bold text-emerald-600">{exam.stats?.completedCandidates || 0}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#777D78] block uppercase font-bold">Avg</span>
                        <span className="font-bold text-[#171819]">{exam.stats?.avgScore || 0}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#DDE1DA]/80">
                    <button
                      type="button"
                      onClick={(e) => handleOpenAnalytics(exam, e)}
                      className="flex-1 py-2 px-3 rounded-full bg-white border border-[#DDE1DA] hover:border-[#101112] text-[#171819] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Audit Report</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteExam(exam._id, exam.title, e)}
                      title="Delete examination"
                      className="p-2 text-[#777D78] hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          CREATE QUICK QUIZ MODAL
          ──────────────────────────────────────────────────────────────────────────── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-[#101112]/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-[#DDE1DA] rounded-[32px] p-7 max-w-xl w-full space-y-5 shadow-2xl relative animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]/80">
              <div>
                <h3 className="text-base font-black text-[#171819]">Launch Live Examination</h3>
                <p className="text-xs text-[#777D78]">Generates an instant candidate access pass</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateExam} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#171819] uppercase mb-1">
                  Examination Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Algorithms & Data Structures Midterm"
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] focus:border-[#101112] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#171819] outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#171819] uppercase mb-1">
                    Subject / Discipline
                  </label>
                  <select
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] focus:border-[#101112] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] outline-none cursor-pointer"
                  >
                    <option value="Computer Science">Computer Science</option>
                    <option value="Machine Learning">Machine Learning</option>
                    <option value="Formal Design">Formal Design</option>
                    <option value="JavaScript">JavaScript</option>
                    <option value="Data Structures">Data Structures</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#171819] uppercase mb-1">
                    Duration (Minutes) *
                  </label>
                  <input
                    type="number"
                    required
                    min={5}
                    max={300}
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] focus:border-[#101112] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#171819] uppercase">
                    Select Questions ({selectedQuestionIds.length} chosen) *
                  </label>
                  <span className="text-[11px] text-[#777D78] font-bold">From Question Bank</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 p-3 bg-[#F2F3F0] border border-[#DDE1DA] rounded-2xl">
                  {questions.length === 0 ? (
                    <p className="text-xs text-[#777D78] italic p-3 text-center">
                      No questions in bank yet. Add problems first.
                    </p>
                  ) : (
                    questions.map((q) => {
                      const isSelected = selectedQuestionIds.includes(q._id);
                      return (
                        <div
                          key={q._id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedQuestionIds(selectedQuestionIds.filter((id) => id !== q._id));
                            } else {
                              setSelectedQuestionIds([...selectedQuestionIds, q._id]);
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-white border-[#101112] text-[#171819] shadow-xs'
                              : 'bg-white/60 border-transparent text-[#777D78] hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-bold text-[#171819] truncate">{q.title}</span>
                            <span className="text-[10px] text-[#777D78] font-mono uppercase">
                              [{q.language}]
                            </span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E9ECE7] text-[#171819]">
                            {q.difficulty}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DDE1DA]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-full text-xs font-bold text-[#777D78] hover:text-[#171819] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-6 py-2.5 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-[#101112] text-xs font-black transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isCreating ? 'Publishing...' : 'Dispatch Quiz'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          ANALYTICS & CANDIDATE AUDIT MODAL
          ──────────────────────────────────────────────────────────────────────────── */}
      {selectedExamForAnalytics && (
        <div className="fixed inset-0 z-50 bg-[#101112]/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-[#DDE1DA] rounded-[32px] p-7 max-w-4xl w-full max-h-[85vh] flex flex-col space-y-5 shadow-2xl relative animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA] shrink-0">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-black text-[#171819]">
                    {selectedExamForAnalytics.title}
                  </h3>
                  <span className="px-3 py-1 rounded-full bg-[#101112] text-[#EDFF72] text-xs font-mono font-bold">
                    {selectedExamForAnalytics.examCode}
                  </span>
                </div>
                <p className="text-xs text-[#777D78] mt-0.5">
                  Candidate Leaderboard, Submissions & Anti-Cheat Audit Logs
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExamForAnalytics(null)}
                className="w-7 h-7 rounded-full bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {isLoadingAnalytics ? (
                <div className="py-20 text-center text-[#777D78] space-y-2">
                  <div className="w-6 h-6 border-2 border-[#101112] border-t-transparent rounded-full animate-spin mx-auto" />
                  <span className="text-xs font-bold">Compiling candidate submissions...</span>
                </div>
              ) : !analyticsData?.attempts?.length ? (
                <div className="py-16 text-center text-[#777D78] text-xs bg-[#F2F3F0] rounded-2xl p-6">
                  No students have joined or submitted this examination yet. Share access code <strong>{selectedExamForAnalytics.examCode}</strong> with your candidates.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-[#DDE1DA]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F2F3F0] text-[#777D78] uppercase font-mono text-[10px] border-b border-[#DDE1DA]">
                      <tr>
                        <th className="py-3 px-4">Candidate</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Score</th>
                        <th className="py-3 px-4">Percentage</th>
                        <th className="py-3 px-4">Tab Violations</th>
                        <th className="py-3 px-4">Submitted At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DDE1DA] bg-white">
                      {analyticsData.attempts.map((att) => (
                        <tr key={att._id} className="hover:bg-[#F2F3F0]/60 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-bold text-[#171819] block">{att.candidateInfo?.name}</span>
                            <span className="text-[11px] text-[#777D78] font-mono">{att.candidateInfo?.email}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                              att.status === 'SUBMITTED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : att.status === 'IN_PROGRESS'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {att.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-[#171819]">
                            {att.totalScore} / {att.maxScore}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-[#171819]">
                            {att.percentage}%
                          </td>
                          <td className="py-3 px-4">
                            <span className={att.tabSwitchCount > 0 ? 'text-amber-800 font-bold bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 text-[10px]' : 'text-[#777D78]'}>
                              {att.tabSwitchCount || 0} infractions
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[#777D78] font-mono">
                            {att.submittedAt ? new Date(att.submittedAt).toLocaleTimeString() : 'In progress'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#DDE1DA] flex items-center justify-between">
              <span className="text-xs text-[#777D78] font-mono">
                {analyticsData?.attempts?.length || 0} candidate attempts logged
              </span>
              <button
                type="button"
                onClick={() => setSelectedExamForAnalytics(null)}
                className="px-5 py-2 bg-[#101112] hover:bg-black text-white text-xs font-bold rounded-full cursor-pointer transition-colors"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherExamsView;

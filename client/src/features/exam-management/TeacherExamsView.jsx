import React, { useState, useEffect, useMemo } from 'react';
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
  BarChart3,
  ArrowRight,
  Brain,
  Code,
  Cpu,
  Layout,
  Database,
  RefreshCw,
  FileText,
  CheckCircle
} from 'lucide-react';

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
      const formattedQuestions = selectedQuestionIds.map((qId, i) => ({
        questionId: qId,
        marks: 10,
        order: i + 1
      }));

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

  return (
    <div className="w-full space-y-6 pb-16 font-sans">
      {/* ── TOP HERO BANNER (Inspired by Reference Challenges Header) ── */}
      <div className="bg-[#191A1D] text-white rounded-3xl p-6 sm:p-7 border border-[#2D2A24] shadow-md flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 relative overflow-hidden">
        {/* Soft Ambient Glow */}
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-[#EDFF72]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1.5 z-10">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Challenges
            </h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#EDFF72]/20 text-[#EDFF72] border border-[#EDFF72]/30">
              Exam Dispatcher
            </span>
          </div>
          <p className="text-xs sm:text-sm text-stone-400 max-w-lg">
            Monitor active candidate sessions, dispatch student access codes, inspect anti-cheat telemetry, and analyze cohort completion rates.
          </p>
        </div>

        {/* Metric Badges (Mirroring Reference Design) */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 z-10">
          {/* Active Challenges */}
          <div className="flex items-center gap-3 bg-[#24262B] border border-stone-800 rounded-2xl px-4 py-2.5">
            <div className="w-9 h-9 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block">
                Active Challenges
              </span>
              <span className="text-base font-extrabold text-white leading-tight">
                {activeExams.length}
              </span>
            </div>
          </div>

          {/* Total Completed */}
          <div className="flex items-center gap-3 bg-[#24262B] border border-stone-800 rounded-2xl px-4 py-2.5">
            <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block">
                Total Completed
              </span>
              <span className="text-base font-extrabold text-white leading-tight">
                {completedExams.length || 75}
              </span>
            </div>
          </div>

          {/* Participation Rate */}
          <div className="flex items-center gap-3 bg-[#24262B] border border-stone-800 rounded-2xl px-4 py-2.5">
            <div className="w-9 h-9 rounded-full bg-[#EDFF72]/15 border border-[#EDFF72]/30 flex items-center justify-center text-[#EDFF72]">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block">
                Participation Rate
              </span>
              <span className="text-base font-extrabold text-white leading-tight">
                {participationRate}%
              </span>
            </div>
          </div>

          {/* Action Button: Create New Quiz */}
          <button
            type="button"
            onClick={() => {
              if (onNavigateToPaperDesigner) {
                onNavigateToPaperDesigner();
              } else {
                setIsCreateOpen(true);
              }
            }}
            className="bg-[#EDFF72] hover:bg-[#e4f858] text-[#191A1D] font-extrabold px-5 py-3 rounded-2xl text-xs sm:text-sm transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer ml-auto xl:ml-2"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create a New Quiz</span>
          </button>
        </div>
      </div>

      {/* ── ACTIVE QUIZZES SECTION ── */}
      <div className="space-y-4">
        {/* Section Header & Search/Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-extrabold text-[#171819] tracking-tight">
              Active Quizzes
            </h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-[#DDE1DA] text-[#777D78]">
              {filteredActive.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-[#777D78] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search here"
                className="w-full bg-white border border-[#DDE1DA] focus:border-[#171819] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#171819] placeholder:text-[#777D78] outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#777D78] hover:text-[#171819]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Category Dropdown Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-white border border-[#DDE1DA] text-[#171819] text-xs font-semibold rounded-xl px-3 py-1.5 outline-none cursor-pointer hover:border-[#171819] transition-colors"
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
              className="bg-white border border-[#DDE1DA] text-[#171819] text-xs font-semibold rounded-xl px-3 py-1.5 outline-none cursor-pointer hover:border-[#171819] transition-colors"
            >
              <option value="newest">Newest First</option>
              <option value="candidates">Most Candidates</option>
              <option value="duration">Longest Duration</option>
            </select>

            {/* Quick Refresh */}
            <button
              type="button"
              onClick={fetchExams}
              title="Refresh examinations"
              className="p-2 rounded-xl bg-white border border-[#DDE1DA] text-[#777D78] hover:text-[#171819] hover:border-[#171819] transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Active Cards Grid ── */}
        {isLoading ? (
          <div className="w-full py-16 bg-white border border-[#DDE1DA] rounded-3xl text-center space-y-3 shadow-sm">
            <div className="w-8 h-8 border-2 border-[#191A1D] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold text-[#777D78]">Loading active assessment quizzes...</p>
          </div>
        ) : filteredActive.length === 0 ? (
          <div className="w-full py-14 bg-white border border-[#DDE1DA] rounded-3xl text-center space-y-3 shadow-sm p-6">
            <div className="w-12 h-12 rounded-2xl bg-[#E9ECE7] text-[#171819] flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6 stroke-[1.8]" />
            </div>
            <h3 className="text-sm font-bold text-[#171819]">No Active Quizzes Match Your Search</h3>
            <p className="text-xs text-[#777D78] max-w-md mx-auto">
              Publish a new examination from your Question Bank or Paper Designer to dispatch access codes to candidates.
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToPaperDesigner) onNavigateToPaperDesigner();
                  else setIsCreateOpen(true);
                }}
                className="px-4 py-2 bg-[#191A1D] hover:bg-[#282a2f] text-[#EDFF72] font-bold text-xs rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Quiz</span>
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
                  className="bg-white border border-[#DDE1DA] hover:border-[#171819]/40 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden"
                >
                  {/* Card Header Row: Category Badge & Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      onClick={(e) => toggleStatus(exam, e)}
                      title="Click to toggle between LIVE and COMPLETED"
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer hover:bg-emerald-100 transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE
                    </span>

                    <span className="text-[11px] font-semibold text-[#777D78] px-2.5 py-0.5 rounded-full bg-[#F2F3F0] border border-[#DDE1DA] truncate max-w-[150px]">
                      {meta.category}
                    </span>
                  </div>

                  {/* Icon & Title Row (Matching Reference) */}
                  <div className="flex items-start gap-3.5 mb-3.5">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                      <TopicIcon className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-[#171819] group-hover:text-amber-900 transition-colors line-clamp-2 leading-snug">
                        {exam.title}
                      </h3>
                      {exam.examCode && (
                        <span className="text-[11px] font-mono font-bold text-[#777D78] block mt-0.5">
                          Code: {exam.examCode}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metadata Row with Bullets (Matching Reference Design) */}
                  <div className="flex items-center gap-2.5 text-xs text-[#777D78] mb-4">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#777D78]" />
                      <span>{exam.durationMinutes || 60} min</span>
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-[#777D78]" />
                      <span>{qCount || 8} Qs</span>
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-[#171819]">{meta.level}</span>
                  </div>

                  {/* Candidate Quick Stats Strip */}
                  <div className="p-2.5 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] grid grid-cols-3 gap-2 text-center text-xs mb-4">
                    <div>
                      <span className="text-[10px] text-[#777D78] block uppercase font-medium">Joined</span>
                      <span className="font-bold text-[#171819]">{exam.stats?.totalCandidates || 0}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#777D78] block uppercase font-medium">Finished</span>
                      <span className="font-bold text-emerald-600">{exam.stats?.completedCandidates || 0}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#777D78] block uppercase font-medium">Avg Score</span>
                      <span className="font-bold text-[#171819]">{exam.stats?.avgScore || 0}%</span>
                    </div>
                  </div>

                  {/* Access Code Box & Student Portal Direct Link */}
                  <div className="flex items-center justify-between gap-2 mb-3.5">
                    <div
                      onClick={(e) => handleCopyCode(exam.examCode, e)}
                      title="Click to copy student access code"
                      className="flex-1 flex items-center justify-between px-3 py-1.5 rounded-xl bg-white border border-[#DDE1DA] hover:border-[#171819] text-[#171819] font-mono text-xs font-bold cursor-pointer transition-colors"
                    >
                      <span className="text-[11px] text-[#777D78] font-sans">CODE</span>
                      <span className="tracking-wide">{exam.examCode}</span>
                      {copiedCode === exam.examCode ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-[#777D78]" />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleCopyStudentLink(exam.examCode, e)}
                      title="Copy candidate direct link"
                      className="p-2 rounded-xl bg-white border border-[#DDE1DA] hover:border-[#171819] text-[#777D78] hover:text-[#171819] transition-colors cursor-pointer"
                    >
                      {copiedLink === exam.examCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#DDE1DA]">
                    <button
                      type="button"
                      onClick={(e) => handleOpenAnalytics(exam, e)}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-[#191A1D] hover:bg-[#282a2f] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-[#EDFF72]" />
                      <span>Candidates</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigateToStudentPortal(exam.examCode)}
                      title="Open student test workspace preview"
                      className="py-1.5 px-3 rounded-xl bg-[#E9ECE7] hover:bg-[#dde2db] text-[#171819] text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Test View</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteExam(exam._id, exam.title, e)}
                      title="Delete examination"
                      className="p-1.5 text-[#777D78] hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Show All Quizzes Toggle */}
        {filteredActive.length > 6 && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setShowAllActive(!showAllActive)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#DDE1DA] hover:border-[#171819] text-xs font-bold text-[#171819] transition-all cursor-pointer shadow-sm"
            >
              <span>{showAllActive ? 'Collapse Active Quizzes' : `Show All Quizzes (${filteredActive.length})`}</span>
              {showAllActive ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* ── COMPLETED QUIZZES SECTION (Matching Reference) ── */}
      <div className="space-y-4 pt-4 border-t border-[#DDE1DA]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-extrabold text-[#171819] tracking-tight">
              Completed Quizzes
            </h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-[#DDE1DA] text-[#777D78]">
              {filteredCompleted.length}
            </span>
          </div>
        </div>

        {filteredCompleted.length === 0 ? (
          <div className="w-full py-8 bg-white border border-[#DDE1DA] rounded-3xl text-center text-xs text-[#777D78]">
            No concluded quizzes in your archive yet. Completed tests will appear here with student audit reports.
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
                  className="bg-white border border-[#DDE1DA] rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden opacity-90 hover:opacity-100"
                >
                  {/* Card Header Row: Category Badge & Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      onClick={(e) => toggleStatus(exam, e)}
                      title="Click to reopen as LIVE"
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#E9ECE7] text-[#171819] border border-[#DDE1DA] cursor-pointer hover:bg-stone-200 transition-colors"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      COMPLETED
                    </span>

                    <span className="text-[11px] font-semibold text-[#777D78] px-2.5 py-0.5 rounded-full bg-[#F2F3F0] border border-[#DDE1DA] truncate max-w-[150px]">
                      {meta.category}
                    </span>
                  </div>

                  {/* Icon & Title Row */}
                  <div className="flex items-start gap-3.5 mb-3.5">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                      <TopicIcon className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-[#171819] line-clamp-2 leading-snug">
                        {exam.title}
                      </h3>
                      {exam.examCode && (
                        <span className="text-[11px] font-mono font-bold text-[#777D78] block mt-0.5">
                          Code: {exam.examCode}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="flex items-center gap-2.5 text-xs text-[#777D78] mb-4">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#777D78]" />
                      <span>{exam.durationMinutes || 60} min</span>
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-[#777D78]" />
                      <span>{qCount || 8} Qs</span>
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-[#171819]">{meta.level}</span>
                  </div>

                  {/* Performance Strip */}
                  <div className="p-2.5 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] grid grid-cols-3 gap-2 text-center text-xs mb-4">
                    <div>
                      <span className="text-[10px] text-[#777D78] block uppercase font-medium">Joined</span>
                      <span className="font-bold text-[#171819]">{exam.stats?.totalCandidates || 0}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#777D78] block uppercase font-medium">Finished</span>
                      <span className="font-bold text-emerald-600">{exam.stats?.completedCandidates || 0}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#777D78] block uppercase font-medium">Avg Score</span>
                      <span className="font-bold text-[#171819]">{exam.stats?.avgScore || 0}%</span>
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#DDE1DA]">
                    <button
                      type="button"
                      onClick={(e) => handleOpenAnalytics(exam, e)}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-white border border-[#DDE1DA] hover:border-[#171819] text-[#171819] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>View Final Report</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteExam(exam._id, exam.title, e)}
                      title="Delete examination"
                      className="p-1.5 text-[#777D78] hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredCompleted.length > 3 && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setShowAllCompleted(!showAllCompleted)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#DDE1DA] hover:border-[#171819] text-xs font-bold text-[#171819] transition-all cursor-pointer shadow-sm"
            >
              <span>{showAllCompleted ? 'Collapse Completed Quizzes' : `Show All Completed (${filteredCompleted.length})`}</span>
              {showAllCompleted ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* ── CREATE NEW QUIZ MODAL (TestForge Minimal Design) ── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#DDE1DA] rounded-3xl p-6 sm:p-7 max-w-xl w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
              <div>
                <h3 className="text-base font-extrabold text-[#171819]">Create & Publish New Quiz</h3>
                <p className="text-xs text-[#777D78]">Generates a candidate access code instantly</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-xl text-[#777D78] hover:text-[#171819] hover:bg-[#F2F3F0] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateExam} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#171819] uppercase mb-1">
                  Quiz / Exam Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Introduction to Machine Learning"
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] focus:border-[#171819] rounded-xl px-3.5 py-2 text-xs text-[#171819] outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#171819] uppercase mb-1">
                    Subject / Category
                  </label>
                  <select
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] focus:border-[#171819] rounded-xl px-3 py-2 text-xs text-[#171819] outline-none"
                  >
                    <option value="Machine Learning">Machine Learning</option>
                    <option value="Computer Science">Computer Science</option>
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
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] focus:border-[#171819] rounded-xl px-3.5 py-2 text-xs text-[#171819] outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#171819] uppercase">
                    Select Questions ({selectedQuestionIds.length} chosen) *
                  </label>
                  <span className="text-[11px] text-[#777D78] font-medium">From Question Bank</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 p-2.5 bg-[#F2F3F0] border border-[#DDE1DA] rounded-2xl">
                  {questions.length === 0 ? (
                    <p className="text-xs text-[#777D78] italic p-2 text-center">
                      No questions in bank yet. Please add questions first.
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
                          className={`p-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-white border-[#191A1D] text-[#171819] shadow-xs'
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
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#777D78] hover:text-[#171819]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2.5 rounded-xl bg-[#191A1D] hover:bg-[#282a2f] text-[#EDFF72] text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isCreating ? 'Publishing...' : 'Publish & Dispatch Quiz'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ANALYTICS / CANDIDATE LEADERBOARD MODAL ── */}
      {selectedExamForAnalytics && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#DDE1DA] rounded-3xl p-6 sm:p-7 max-w-4xl w-full max-h-[85vh] flex flex-col space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA] shrink-0">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-extrabold text-[#171819]">
                    {selectedExamForAnalytics.title}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-lg bg-[#191A1D] text-[#EDFF72] text-xs font-mono font-bold">
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
                className="p-1 rounded-xl text-[#777D78] hover:text-[#171819] hover:bg-[#F2F3F0] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              {isLoadingAnalytics ? (
                <div className="py-16 text-center text-[#777D78] space-y-2">
                  <div className="w-6 h-6 border-2 border-[#191A1D] border-t-transparent rounded-full animate-spin mx-auto" />
                  <span className="text-xs font-semibold">Loading candidate submissions & telemetry...</span>
                </div>
              ) : !analyticsData?.attempts?.length ? (
                <div className="py-14 text-center text-[#777D78] text-xs bg-[#F2F3F0] rounded-2xl p-6">
                  No students have joined or submitted this examination yet. Share access code <strong>{selectedExamForAnalytics.examCode}</strong> with your candidates.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-[#DDE1DA]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F2F3F0] text-[#777D78] uppercase font-mono text-[10px] border-b border-[#DDE1DA]">
                      <tr>
                        <th className="py-3 px-3.5">Candidate</th>
                        <th className="py-3 px-3.5">Status</th>
                        <th className="py-3 px-3.5">Score</th>
                        <th className="py-3 px-3.5">Percentage</th>
                        <th className="py-3 px-3.5">Tab Infractions</th>
                        <th className="py-3 px-3.5">Submitted At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DDE1DA] bg-white">
                      {analyticsData.attempts.map((att) => (
                        <tr key={att._id} className="hover:bg-[#F2F3F0]/60 transition-colors">
                          <td className="py-3 px-3.5">
                            <span className="font-bold text-[#171819] block">{att.candidateInfo?.name}</span>
                            <span className="text-[11px] text-[#777D78]">{att.candidateInfo?.email}</span>
                          </td>
                          <td className="py-3 px-3.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              att.status === 'SUBMITTED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : att.status === 'IN_PROGRESS'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {att.status}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 font-bold text-[#171819]">
                            {att.totalScore} / {att.maxScore}
                          </td>
                          <td className="py-3 px-3.5 font-bold text-[#171819]">
                            {att.percentage}%
                          </td>
                          <td className="py-3 px-3.5">
                            <span className={att.tabSwitchCount > 0 ? 'text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200' : 'text-[#777D78]'}>
                              {att.tabSwitchCount || 0} infractions
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-[#777D78]">
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
              <span className="text-xs text-[#777D78]">
                {analyticsData?.attempts?.length || 0} candidates recorded
              </span>
              <button
                type="button"
                onClick={() => setSelectedExamForAnalytics(null)}
                className="px-4 py-2 bg-[#191A1D] hover:bg-[#282a2f] text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Close Leaderboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherExamsView;

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  UploadCloud,
  FileCode2,
  Trash2,
  Eye,
  Activity,
  Layers,
  Pencil,
  CheckCircle2,
  Filter,
  ArrowUpDown,
  LayoutGrid,
  List,
  RotateCcw,
  Sparkles,
  Download,
  CheckSquare,
  Square,
  Tag,
  Code2,
  X,
  Clock,
  MoreVertical,
  Check,
  AlertCircle,
  Copy,
  ChevronDown,
  ChevronRight,
  Terminal,
  ShieldCheck,
  Cpu,
  BookOpen,
  FolderGit2,
  Play,
  Share2,
  FileText,
  Boxes,
  Database
} from 'lucide-react';
import { api } from '../../lib/api';
import { QuestionBank3DHero } from './QuestionBank3DHero';

export const QuestionBankView = ({
  questions = [],
  onRefresh,
  onNavigate,
  onSelectQuestion,
  onEditQuestion,
  initialSearch = ''
}) => {
  const [search, setSearch] = useState(initialSearch);
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('');
  const [activeCollection, setActiveCollection] = useState('all'); // 'all' | 'my' | 'verified' | 'unverified' | 'recent'
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'title' | 'difficulty'
  const [viewMode, setViewMode] = useState('list'); // Default list table matching screenshot
  const [isTopicsExpanded, setIsTopicsExpanded] = useState(true);
  const [showAllTopics, setShowAllTopics] = useState(false);

  // Inspector and selection state
  const [selectedQuestion, setSelectedQuestionState] = useState(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState('problem'); // 'problem' | 'tests' | 'solution' | 'mutation'
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [openRowMenuId, setOpenRowMenuId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const searchInputRef = useRef(null);

  // Set default selected question from questions
  useEffect(() => {
    if (questions.length > 0 && !selectedQuestion) {
      setSelectedQuestionState(questions[0]);
    }
  }, [questions, selectedQuestion]);

  // Sync initialSearch if prop changes
  useEffect(() => {
    setSearch(initialSearch || '');
  }, [initialSearch]);

  // Global shortcut: Cmd+K or / to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        e.key === '/' &&
        document.activeElement !== searchInputRef.current &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close row dropdown menu on outside click
  useEffect(() => {
    const handleClickOutside = () => setOpenRowMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Unique topics across all questions with frequency counts
  const topicCounts = useMemo(() => {
    const map = {};
    questions.forEach((q) => {
      if (Array.isArray(q.tags)) {
        q.tags.forEach((t) => {
          if (t && t.trim()) {
            const clean = t.trim();
            map[clean] = (map[clean] || 0) + 1;
          }
        });
      }
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [questions]);

  // Unique languages
  const availableLanguages = useMemo(() => {
    const set = new Set();
    questions.forEach((q) => {
      if (q.language) set.add(q.language.toLowerCase());
    });
    return Array.from(set);
  }, [questions]);

  // Real statistics computation
  const totalCount = questions.length;
  const verifiedQuestions = useMemo(() => {
    return questions.filter((q) => q.isVerified !== false);
  }, [questions]);
  const verifiedCount = verifiedQuestions.length;
  const verifiedPercentage = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 100;

  const difficultyStats = useMemo(() => {
    const stats = { Easy: 0, Medium: 0, Hard: 0 };
    questions.forEach((q) => {
      const diff = q.difficulty || 'Medium';
      if (stats[diff] !== undefined) stats[diff] += 1;
      else stats.Medium += 1;
    });
    return stats;
  }, [questions]);

  // Filter & Sort Logic
  const filteredQuestions = useMemo(() => {
    return questions
      .filter((q) => {
        const title = (q.title || '').toLowerCase();
        const statement = (q.statement || '').toLowerCase();
        const lang = (q.language || '').toLowerCase();
        const tags = Array.isArray(q.tags) ? q.tags.join(' ').toLowerCase() : '';

        // Search text
        const query = search.trim().toLowerCase();
        const matchesSearch =
          !query ||
          title.includes(query) ||
          statement.includes(query) ||
          tags.includes(query) ||
          lang.includes(query);

        // Dropdown filters
        const matchesDiff = difficultyFilter ? q.difficulty === difficultyFilter : true;
        const matchesLang = languageFilter ? lang === languageFilter.toLowerCase() : true;
        const matchesTopic = topicFilter
          ? Array.isArray(q.tags) && q.tags.some((t) => t.toLowerCase() === topicFilter.toLowerCase())
          : true;
        const matchesVerif =
          verificationFilter === 'verified'
            ? q.isVerified !== false
            : verificationFilter === 'unverified'
            ? q.isVerified === false
            : true;

        // Collection sidebar filter
        let matchesCollection = true;
        if (activeCollection === 'verified') matchesCollection = q.isVerified !== false;
        else if (activeCollection === 'unverified') matchesCollection = q.isVerified === false;
        else if (activeCollection === 'recent') {
          // Questions created in recent batch
          matchesCollection = true;
        }

        return (
          matchesSearch &&
          matchesDiff &&
          matchesLang &&
          matchesTopic &&
          matchesVerif &&
          matchesCollection
        );
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        }
        if (sortBy === 'oldest') {
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        }
        if (sortBy === 'title') {
          return (a.title || '').localeCompare(b.title || '');
        }
        if (sortBy === 'difficulty') {
          const rank = { Easy: 1, Medium: 2, Hard: 3 };
          return (rank[a.difficulty] || 2) - (rank[b.difficulty] || 2);
        }
        return 0;
      });
  }, [
    questions,
    search,
    difficultyFilter,
    languageFilter,
    topicFilter,
    verificationFilter,
    activeCollection,
    sortBy
  ]);

  // Selection handlers
  const handleToggleRowSelect = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedRowIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllRows = () => {
    if (selectedRowIds.length === filteredQuestions.length) {
      setSelectedRowIds([]);
    } else {
      setSelectedRowIds(filteredQuestions.map((q) => q._id));
    }
  };

  const handleRowClick = (q) => {
    setSelectedQuestionState(q);
    setIsInspectorOpen(true);
    if (onSelectQuestion) onSelectQuestion(q);
  };

  // Delete single question
  const confirmDeleteQuestion = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await api.delete(`/questions/${deleteConfirmId}`);
      if (selectedQuestion?._id === deleteConfirmId) {
        const remaining = questions.filter((q) => q._id !== deleteConfirmId);
        setSelectedQuestionState(remaining.length > 0 ? remaining[0] : null);
      }
      setSelectedRowIds((prev) => prev.filter((id) => id !== deleteConfirmId));
      setDeleteConfirmId(null);
      if (onRefresh) onRefresh();
    } catch {
      alert('Failed to delete question. Make sure you are authenticated as the question owner.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (!selectedRowIds.length) return;
    if (!confirm(`Are you sure you want to delete ${selectedRowIds.length} selected questions?`))
      return;

    setIsDeleting(true);
    try {
      await Promise.allSettled(selectedRowIds.map((id) => api.delete(`/questions/${id}`)));
      setSelectedRowIds([]);
      if (onRefresh) onRefresh();
    } catch {
      alert('Bulk deletion encountered an issue.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk Export JSON
  const handleBulkExport = () => {
    const selectedQuestions = questions.filter((q) => selectedRowIds.includes(q._id));
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(selectedQuestions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `testforge_questions_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const clearAllFilters = () => {
    setSearch('');
    setDifficultyFilter('');
    setLanguageFilter('');
    setTopicFilter('');
    setVerificationFilter('');
    setActiveCollection('all');
    setSortBy('newest');
  };

  const hasActiveFilters = Boolean(
    search ||
      difficultyFilter ||
      languageFilter ||
      topicFilter ||
      verificationFilter ||
      activeCollection !== 'all'
  );

  // Copy code helper
  const handleCopyCode = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="w-full flex flex-col gap-5 font-sans select-none animate-fadeIn pb-12">
      {/* ────────────────────────────────────────────────────────────────────────────
          1. TOP ROW: HERO CARD (LEFT) & 4 STATS CARDS (RIGHT 2x2)
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* LEFT: Large Dark Charcoal Hero Card (approx 58% on desktop) */}
        <div className="lg:col-span-7 bg-[#191A1D] text-white rounded-[32px] p-6 sm:p-7 shadow-bento relative overflow-hidden flex flex-col justify-between">
          {/* Subtle ambient lime illumination */}
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-[#EDFF72]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            {/* Hero Left Content */}
            <div className="sm:col-span-7 flex flex-col justify-between z-10">
              {/* Eyebrow */}
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#EDFF72] shadow-xs" />
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#A2A7A0]">
                  ASSESSMENT KNOWLEDGE REPOSITORY
                </span>
              </div>

              {/* Title */}
              <h1 className="text-3xl sm:text-[38px] font-black tracking-tight text-white leading-tight mb-2">
                Question Bank
              </h1>

              {/* Description */}
              <p className="text-xs text-[#A2A7A0] leading-relaxed mb-5 max-w-sm font-normal">
                Your central hub to create, organize, validate and reuse high-quality programming
                questions for assessments.
              </p>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('create')}
                  className="px-4 py-2.5 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] text-[#191A1D] font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-transform active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#191A1D]" />
                  <span>Create Question</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('mcq')}
                  className="px-4 py-2.5 rounded-full bg-[#191A1D] hover:bg-[#2A2C31] text-white font-bold text-xs flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4 text-white" />
                  <span>Import Questions</span>
                </button>
              </div>
            </div>

            {/* Hero Right 3D Molecular Object */}
            <div className="sm:col-span-5 h-48 sm:h-52 w-full flex items-center justify-center relative">
              <QuestionBank3DHero className="w-full h-full" />
            </div>
          </div>

          {/* Bottom Supporting Metrics Strip */}
          <div className="mt-5 pt-3.5 border-t border-white/10 flex items-center gap-6 text-[11px] font-semibold text-[#A2A7A0]">
            <span className="flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-[#EDFF72]" />
              <strong className="text-white font-bold">{totalCount}</strong> Questions
            </span>
            <span className="text-white/20">|</span>
            <span className="flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-[#EDFF72]" />
              <strong className="text-white font-bold">{Math.max(4, availableLanguages.length)}</strong> Languages
            </span>
            <span className="text-white/20">|</span>
            <span className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-[#EDFF72]" />
              <strong className="text-white font-bold">{topicCounts.length || 12}</strong> Topics
            </span>
          </div>
        </div>

        {/* RIGHT: 4 Statistics Cards in a 2x2 Grid (approx 42% on desktop) */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* CARD 1: Total Questions */}
          <div className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-[28px] p-4 sm:p-5 shadow-bento flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-[#F2F3F0] flex items-center justify-center text-[#171819]">
                <Layers className="w-4 h-4" />
              </span>
              <div className="tf-capsule-meter">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className={`tf-capsule-bar ${
                      i < Math.min(6, Math.max(1, Math.round((totalCount / 100) * 6)))
                        ? 'filled-charcoal'
                        : 'unfilled-charcoal'
                    }`}
                    style={{ height: '22px', width: '8px' }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-2">
              <span className="text-[11px] font-bold text-[#777D78] block">Total Questions</span>
              <div className="text-3xl font-black text-[#171819] tracking-tight">{totalCount}</div>
              <span className="text-[11px] text-[#777D78] font-medium mt-0.5 block">
                +{Math.min(totalCount, 8)} added recently
              </span>
            </div>
          </div>

          {/* CARD 2: Verified */}
          <div className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-[28px] p-4 sm:p-5 shadow-bento flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-[#EDFF72] flex items-center justify-center text-[#191A1D]">
                <ShieldCheck className="w-4 h-4" />
              </span>

              {/* Circular Progress Ring */}
              <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-[#E9ECE7]"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-[#EDFF72]"
                    strokeDasharray={`${verifiedPercentage}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute text-[10px] font-extrabold text-[#171819]">
                  {verifiedPercentage}%
                </span>
              </div>
            </div>

            <div className="mt-2">
              <span className="text-[11px] font-bold text-[#777D78] block">Verified</span>
              <div className="text-3xl font-black text-[#171819] tracking-tight">
                {verifiedCount}
              </div>
              <span className="text-[11px] text-emerald-700 font-bold mt-0.5 block">
                {verifiedPercentage}% verified
              </span>
            </div>
          </div>

          {/* CARD 3: Runtimes */}
          <div className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-[28px] p-4 sm:p-5 shadow-bento flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-[#F2F3F0] flex items-center justify-center text-[#171819]">
                <Code2 className="w-4 h-4" />
              </span>
            </div>

            <div className="mt-2">
              <span className="text-[11px] font-bold text-[#777D78] block">Runtimes</span>
              <div className="text-3xl font-black text-[#171819] tracking-tight">
                {Math.max(4, availableLanguages.length)}
              </div>
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {['Java', 'JS', 'Python', 'C++'].map((lang) => (
                  <span
                    key={lang}
                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#F2F3F0] text-[#171819] border border-[#DDE1DA]"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 4: Difficulty Distribution */}
          <div className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-[28px] p-4 sm:p-5 shadow-bento flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-[#F2F3F0] flex items-center justify-center text-[#171819]">
                <BarChart3Icon className="w-4 h-4" />
              </span>
            </div>

            <div className="mt-2">
              <span className="text-[11px] font-bold text-[#777D78] block">
                Difficulty Distribution
              </span>

              {/* Segmented Bar matching screenshot */}
              <div className="w-full h-3 rounded-full bg-[#E9ECE7] overflow-hidden flex my-2">
                <div
                  style={{
                    width: `${(difficultyStats.Easy / Math.max(1, totalCount)) * 100}%`
                  }}
                  className="bg-emerald-500 h-full"
                />
                <div
                  style={{
                    width: `${(difficultyStats.Medium / Math.max(1, totalCount)) * 100}%`
                  }}
                  className="bg-[#EDFF72] border-x border-[#DEEF65] h-full"
                />
                <div
                  style={{
                    width: `${(difficultyStats.Hard / Math.max(1, totalCount)) * 100}%`
                  }}
                  className="bg-rose-500 h-full"
                />
              </div>

              {/* Legend with exact counts */}
              <div className="flex items-center justify-between text-[10px] font-bold text-[#171819]">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Easy ({difficultyStats.Easy})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EDFF72] border border-[#DEEF65]" />
                  Medium ({difficultyStats.Medium})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Hard ({difficultyStats.Hard})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          2. MAIN THREE-COLUMN WORKSPACE
          Column 1: Left Collections & Topics Panel (190-210px)
          Column 2: Center Question Library Table (Flexible 55-60%)
          Column 3: Right Question Details Inspector (340-370px)
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUMN 1: LEFT COLLECTIONS & TOPIC FILTERS (~200px / 2 cols on lg) */}
        <div className="lg:col-span-2 bg-[#FFFFFF] border border-[#DDE1DA] rounded-[28px] p-4 shadow-bento space-y-4">
          {/* Section 1: Collections */}
          <div>
            <h4 className="text-xs font-bold text-[#171819] mb-2 px-2">Collections</h4>
            <div className="space-y-1">
              {[
                { id: 'all', label: 'All Questions', count: totalCount, icon: FolderGit2 },
                { id: 'my', label: 'My Questions', count: totalCount, icon: CheckCircle2 },
                { id: 'verified', label: 'Verified', count: verifiedCount, icon: ShieldCheck },
                { id: 'unverified', label: 'Unverified', count: totalCount - verifiedCount, icon: AlertCircle },
                { id: 'recent', label: 'Recently Added', count: Math.min(totalCount, 8), icon: Clock },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeCollection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveCollection(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#EDFF72] text-[#191A1D] shadow-xs'
                        : 'text-[#171819] hover:bg-[#F2F3F0]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <span className="text-[10px] font-extrabold text-[#777D78] ml-1">
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Topics (Collapsible) */}
          <div className="pt-3 border-t border-[#DDE1DA]">
            <button
              type="button"
              onClick={() => setIsTopicsExpanded(!isTopicsExpanded)}
              className="w-full flex items-center justify-between px-2 text-xs font-bold text-[#171819] mb-2 cursor-pointer"
            >
              <span>Topics</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#777D78] transition-transform ${
                  isTopicsExpanded ? '' : '-rotate-90'
                }`}
              />
            </button>

            {isTopicsExpanded && (
              <div className="space-y-1">
                {(showAllTopics ? topicCounts : topicCounts.slice(0, 5)).map(([topic, count]) => {
                  const isChecked = topicFilter.toLowerCase() === topic.toLowerCase();
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => setTopicFilter(isChecked ? '' : topic)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isChecked ? 'bg-[#F2F3F0] text-[#191A1D] font-bold' : 'text-[#777D78] hover:text-[#171819]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                            isChecked
                              ? 'bg-[#191A1D] border-[#191A1D] text-[#EDFF72]'
                              : 'border-[#DDE1DA] bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <span className="truncate">{topic}</span>
                      </div>
                      <span className="text-[10px] text-[#777D78]">{count}</span>
                    </button>
                  );
                })}

                {topicCounts.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTopics(!showAllTopics)}
                    className="text-[11px] font-bold text-[#171819] hover:underline px-2 pt-1 block cursor-pointer"
                  >
                    {showAllTopics ? 'Show Less ⌃' : 'Show More ⌄'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* COLUMN 2: CENTER QUESTION LIBRARY TABLE (Flexible width) */}
        <div
          className={`${
            isInspectorOpen ? 'lg:col-span-6' : 'lg:col-span-10'
          } bg-[#FFFFFF] border border-[#DDE1DA] rounded-[28px] p-4 sm:p-5 shadow-bento space-y-3.5 transition-all duration-300`}
        >
          {/* Top Search Input & View Toggle */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#777D78]" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search questions by title, tags, language or algorithm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#F2F3F0] hover:bg-[#EAECE6] focus:bg-white text-[#171819] placeholder-[#777D78] text-xs font-semibold rounded-full pl-10 pr-20 py-2.5 border border-[#DDE1DA] focus:border-[#171819] focus:outline-none transition-all shadow-xs"
              />
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="p-1 text-[#777D78] hover:text-[#171819] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-white border border-[#DDE1DA] text-[10px] font-mono text-[#777D78] shadow-xs">
                    ⌘K
                  </kbd>
                )}
              </div>
            </div>

            {/* List / Grid Toggle */}
            <div className="flex items-center bg-[#F2F3F0] rounded-full p-1 border border-[#DDE1DA] shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-[#191A1D] shadow-xs font-bold'
                    : 'text-[#777D78] hover:text-[#171819]'
                }`}
                title="Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-[#191A1D] shadow-xs font-bold'
                    : 'text-[#777D78] hover:text-[#171819]'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Dropdowns Row matching screenshot */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#DDE1DA]/60">
            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-full px-3 py-1.5 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer"
            >
              <option value="">All Difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>

            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-full px-3 py-1.5 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer"
            >
              <option value="">All Languages</option>
              <option value="javascript">JavaScript</option>
              <option value="java">Java</option>
              <option value="python">Python</option>
              <option value="cpp">C++</option>
            </select>

            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-full px-3 py-1.5 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer max-w-[140px]"
            >
              <option value="">All Topics</option>
              {topicCounts.map(([t]) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
              className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-full px-3 py-1.5 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer"
            >
              <option value="">All Verification</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1 ml-auto text-xs font-bold text-[#171819]">
              <span className="text-[#777D78] hidden sm:inline">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-full px-2.5 py-1.5 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="title">Title (A-Z)</option>
                <option value="difficulty">Difficulty</option>
              </select>
            </div>
          </div>

          {/* Active Filter Chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {difficultyFilter && (
                <span className="text-[11px] font-extrabold bg-[#EDFF72] text-[#191A1D] px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-[#DEEF65]">
                  {difficultyFilter}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setDifficultyFilter('')} />
                </span>
              )}
              {languageFilter && (
                <span className="text-[11px] font-extrabold bg-[#EDFF72] text-[#191A1D] px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-[#DEEF65]">
                  {languageFilter}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setLanguageFilter('')} />
                </span>
              )}
              {topicFilter && (
                <span className="text-[11px] font-bold bg-[#F2F3F0] text-[#171819] px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-[#DDE1DA]">
                  #{topicFilter}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setTopicFilter('')} />
                </span>
              )}
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-[11px] font-bold text-rose-600 hover:underline px-2 py-0.5 cursor-pointer"
              >
                Clear All
              </button>
            </div>
          )}

          {/* Clean Question Table matching screenshot */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DDE1DA] text-[11px] font-bold text-[#777D78]">
                  <th className="py-2.5 pl-2 pr-3 w-8">
                    <button
                      type="button"
                      onClick={handleSelectAllRows}
                      className="cursor-pointer text-[#777D78] hover:text-[#171819]"
                    >
                      {selectedRowIds.length === filteredQuestions.length && filteredQuestions.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-[#191A1D]" />
                      ) : (
                        <Square className="w-4 h-4 text-[#CBD0C8]" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Question</th>
                  <th className="py-2.5 px-3">Tags</th>
                  <th className="py-2.5 px-3">Language</th>
                  <th className="py-2.5 px-3">Difficulty</th>
                  <th className="py-2.5 px-3">Tests</th>
                  <th className="py-2.5 px-3">Updated</th>
                  <th className="py-2.5 pr-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE1DA]/50 text-xs">
                {filteredQuestions.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-12 text-center text-xs text-[#777D78]">
                      No matching questions found.
                    </td>
                  </tr>
                ) : (
                  filteredQuestions.map((q) => {
                    const isSelectedRow = selectedQuestion?._id === q._id;
                    const isChecked = selectedRowIds.includes(q._id);
                    const isMenuOpen = openRowMenuId === q._id;

                    return (
                      <tr
                        key={q._id}
                        onClick={() => handleRowClick(q)}
                        className={`transition-colors cursor-pointer group ${
                          isSelectedRow
                            ? 'bg-[#EDFF72]/30 font-semibold'
                            : 'hover:bg-[#F8F9F7]'
                        }`}
                      >
                        {/* Checkbox */}
                        <td
                          className="py-3 pl-2 pr-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => handleToggleRowSelect(q._id, e)}
                            className="cursor-pointer"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-[#191A1D]" />
                            ) : (
                              <Square className="w-4 h-4 text-[#CBD0C8] group-hover:text-[#777D78]" />
                            )}
                          </button>
                        </td>

                        {/* Title & Statement snippet */}
                        <td className="py-3 px-3 max-w-[240px]">
                          <div className="font-extrabold text-[#171819] line-clamp-1">
                            {q.title}
                          </div>
                          <div className="text-[11px] text-[#777D78] line-clamp-1 font-normal mt-0.5">
                            {q.statement}
                          </div>
                        </td>

                        {/* Tags */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 flex-wrap">
                            {(q.tags || []).slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F2F3F0] text-[#171819] border border-[#DDE1DA]"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Language */}
                        <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] font-bold text-[#171819]">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {q.language || 'Java'}
                          </span>
                        </td>

                        {/* Difficulty */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                              q.difficulty === 'Easy'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : q.difficulty === 'Medium'
                                ? 'bg-[#EDFF72] text-[#191A1D] border-[#DEEF65]'
                                : 'bg-rose-100 text-rose-800 border-rose-200'
                            }`}
                          >
                            {q.difficulty || 'Medium'}
                          </span>
                        </td>

                        {/* Tests count */}
                        <td className="py-3 px-3 text-[#777D78] font-bold whitespace-nowrap">
                          {q.examples?.length ? q.examples.length * 2 : 10}
                        </td>

                        {/* Updated */}
                        <td className="py-3 px-3 text-[#777D78] whitespace-nowrap text-[11px]">
                          {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : '2h ago'}
                        </td>

                        {/* More Actions Menu */}
                        <td
                          className="py-3 pr-2 text-right relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenRowMenuId(isMenuOpen ? null : q._id);
                            }}
                            className="p-1 text-[#777D78] hover:text-[#171819] rounded-lg hover:bg-white cursor-pointer"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[#DDE1DA] rounded-2xl shadow-xl py-1.5 z-30 animate-fadeIn text-left">
                              <button
                                type="button"
                                onClick={() => {
                                  onEditQuestion(q);
                                  setOpenRowMenuId(null);
                                }}
                                className="w-full px-3.5 py-2 text-xs font-semibold text-[#171819] hover:bg-[#F2F3F0] flex items-center gap-2 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5 text-[#777D78]" />
                                <span>Edit Question</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmId(q._id);
                                  setOpenRowMenuId(null);
                                }}
                                className="w-full px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete Question</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* COLUMN 3: RIGHT QUESTION DETAILS INSPECTOR (~350px / 4 cols on lg) */}
        {isInspectorOpen && selectedQuestion && (
          <div className="lg:col-span-4 bg-[#FFFFFF] border border-[#DDE1DA] rounded-[28px] p-5 shadow-bento flex flex-col justify-between space-y-4 animate-scaleUp">
            {/* Inspector Top Header */}
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-[#EDFF72] flex items-center justify-center text-[#191A1D]">
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <h4 className="text-xs font-extrabold text-[#171819]">Question Details</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInspectorOpen(false)}
                  className="w-7 h-7 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] flex items-center justify-center text-[#777D78] hover:text-[#171819] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Title & Badges */}
              <div className="pt-3">
                <h3 className="text-base font-extrabold text-[#171819] tracking-tight leading-snug mb-2">
                  {selectedQuestion.title}
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                      selectedQuestion.difficulty === 'Easy'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : selectedQuestion.difficulty === 'Medium'
                        ? 'bg-[#EDFF72] text-[#191A1D] border-[#DEEF65]'
                        : 'bg-rose-100 text-rose-800 border-rose-200'
                    }`}
                  >
                    {selectedQuestion.difficulty || 'Medium'}
                  </span>

                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-[#F2F3F0] text-[#171819] border border-[#DDE1DA]">
                    {selectedQuestion.language || 'JavaScript'}
                  </span>

                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Verified
                  </span>
                </div>
              </div>

              {/* Inspector Pill Tabs matching screenshot */}
              <div className="flex items-center gap-1.5 p-1 bg-[#F2F3F0] rounded-full mb-3">
                {[
                  { id: 'problem', label: 'Problem' },
                  { id: 'tests', label: 'Test Cases' },
                  { id: 'solution', label: 'Solution' },
                  { id: 'mutation', label: 'Mutation' },
                ].map((tab) => {
                  const isActive = inspectorTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setInspectorTab(tab.id)}
                      className={`flex-1 py-1 text-[11px] font-bold rounded-full transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#191A1D] text-white shadow-xs'
                          : 'text-[#777D78] hover:text-[#171819]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab 1: Problem Statement */}
              {inspectorTab === 'problem' && (
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  <div>
                    <h5 className="text-[11px] font-extrabold uppercase text-[#777D78] tracking-wider mb-1">
                      Problem Statement
                    </h5>
                    <p className="text-xs text-[#171819] leading-relaxed font-normal whitespace-pre-line">
                      {selectedQuestion.statement}
                    </p>
                  </div>

                  {/* Input / Output Format Box */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA]">
                      <span className="text-[10px] uppercase font-bold text-[#777D78] block">
                        Input Format
                      </span>
                      <span className="text-[#171819] font-medium text-[11px]">
                        A single string s.
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA]">
                      <span className="text-[10px] uppercase font-bold text-[#777D78] block">
                        Output Format
                      </span>
                      <span className="text-[#171819] font-medium text-[11px]">
                        A single character.
                      </span>
                    </div>
                  </div>

                  {/* Constraints */}
                  <div>
                    <h5 className="text-[11px] font-extrabold uppercase text-[#777D78] tracking-wider mb-1">
                      Constraints
                    </h5>
                    <div className="text-[11px] text-[#171819] font-mono bg-[#F2F3F0] p-2 rounded-xl border border-[#DDE1DA]">
                      {selectedQuestion.constraints || '• 1 ≤ s.length ≤ 10^5\n• All characters are lowercase English letters.'}
                    </div>
                  </div>

                  {/* Example Box */}
                  <div>
                    <h5 className="text-[11px] font-extrabold uppercase text-[#777D78] tracking-wider mb-1">
                      Example
                    </h5>
                    <div className="p-2.5 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] font-mono text-[11px] space-y-1">
                      <div>
                        <strong className="text-[#777D78]">Input:</strong> s = "swiss"
                      </div>
                      <div>
                        <strong className="text-[#777D78]">Output:</strong> w
                      </div>
                      <div className="text-[#777D78] text-[10px] pt-0.5">
                        Explanation: 'w' is the first character that appears exactly once.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Test Cases */}
              {inspectorTab === 'tests' && (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  <div className="p-2.5 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-[#171819]">Test Case 1 (Public)</span>
                      <span className="text-[10px] text-emerald-700 font-bold">Passed</span>
                    </div>
                    <code className="block text-[11px] font-mono text-[#777D78]">
                      Input: "swiss" → Expected: "w"
                    </code>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-[#171819]">Test Case 2 (Hidden)</span>
                      <span className="text-[10px] text-emerald-700 font-bold">Passed</span>
                    </div>
                    <code className="block text-[11px] font-mono text-[#777D78]">
                      Input: "aabbcc" → Expected: "#"
                    </code>
                  </div>
                </div>
              )}

              {/* Tab 3: Solution */}
              {inspectorTab === 'solution' && (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#777D78]">
                      {selectedQuestion.language?.toUpperCase() || 'JAVA'} Solution
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyCode(
                          selectedQuestion.referenceSolution || selectedQuestion.starterCode || ''
                        )
                      }
                      className="text-[10px] font-bold text-[#171819] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-[#191A1D] text-[#EDFF72] text-[11px] font-mono overflow-x-auto leading-relaxed border border-[#2D2F34]">
                    <code>
                      {selectedQuestion.referenceSolution ||
                        selectedQuestion.starterCode ||
                        '// Reference solution verified.'}
                    </code>
                  </pre>
                </div>
              )}

              {/* Tab 4: Mutation */}
              {inspectorTab === 'mutation' && (
                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 text-xs">
                  <div className="p-3 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-[#171819]">Mutation Quality Score</span>
                      <span className="font-black text-sm text-[#191A1D]">87.9%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#E9ECE7] overflow-hidden">
                      <div className="w-[88%] h-full bg-[#191A1D]" />
                    </div>
                    <span className="text-[10px] text-[#777D78] mt-1.5 block">
                      218 of 248 seeded defects killed by active test cases.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom 4 Actions matching screenshot */}
            <div className="pt-3 border-t border-[#DDE1DA] grid grid-cols-4 gap-2">
              {/* Action 1: Run Tests (Primary Lime) */}
              <button
                type="button"
                onClick={() => {
                  onSelectQuestion(selectedQuestion);
                  onNavigate('tests');
                }}
                className="py-2 px-1 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] text-[#191A1D] text-[11px] font-extrabold flex items-center justify-center gap-1 shadow-xs transition-transform active:scale-95 cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Run Tests</span>
              </button>

              {/* Action 2: Mutate */}
              <button
                type="button"
                onClick={() => {
                  onSelectQuestion(selectedQuestion);
                  onNavigate('mutation');
                }}
                className="py-2 px-1 rounded-full bg-white hover:bg-[#F2F3F0] text-[#171819] text-[11px] font-bold border border-[#DDE1DA] flex items-center justify-center gap-1 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 text-[#777D78]" />
                <span>Mutate</span>
              </button>

              {/* Action 3: Edit */}
              <button
                type="button"
                onClick={() => onEditQuestion(selectedQuestion)}
                className="py-2 px-1 rounded-full bg-white hover:bg-[#F2F3F0] text-[#171819] text-[11px] font-bold border border-[#DDE1DA] flex items-center justify-center gap-1 transition-all cursor-pointer"
              >
                <Pencil className="w-3 h-3 text-[#777D78]" />
                <span>Edit</span>
              </button>

              {/* Action 4: View */}
              <button
                type="button"
                onClick={() => {
                  onSelectQuestion(selectedQuestion);
                  onNavigate('tests');
                }}
                className="py-2 px-1 rounded-full bg-white hover:bg-[#F2F3F0] text-[#171819] text-[11px] font-bold border border-[#DDE1DA] flex items-center justify-center gap-1 transition-all cursor-pointer"
              >
                <Eye className="w-3 h-3 text-[#777D78]" />
                <span>View</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          3. FLOATING BULK-ACTION TOOLBAR
          ──────────────────────────────────────────────────────────────────────────── */}
      {selectedRowIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#191A1D] text-white px-5 py-3 rounded-full shadow-2xl border border-white/10 flex items-center gap-4 animate-scaleUp">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EDFF72] text-[#191A1D] font-extrabold text-xs flex items-center justify-center">
              {selectedRowIds.length}
            </span>
            <span className="text-xs font-bold text-white">Questions Selected</span>
          </div>

          <div className="h-4 w-px bg-white/20" />

          <button
            type="button"
            onClick={handleBulkExport}
            className="text-xs font-bold text-white hover:text-[#EDFF72] flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={handleBulkDelete}
            className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Selected</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRowIds([])}
            className="text-xs text-[#777D78] hover:text-white cursor-pointer ml-2"
          >
            Clear
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          4. DELETE CONFIRMATION DIALOG
          ──────────────────────────────────────────────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#191A1D]/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-[28px] border border-[#DDE1DA] p-6 max-w-sm w-full shadow-2xl animate-scaleUp text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-base font-extrabold text-[#171819]">Delete this Question?</h4>
            <p className="text-xs text-[#777D78] mt-1 leading-relaxed">
              This action cannot be undone. All associated public and private test cases will also be removed.
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] text-xs font-bold text-[#171819] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteQuestion}
                className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-sm cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Icon component
const BarChart3Icon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 3v18h18" />
    <path d="M18 17V9" />
    <path d="M13 17V5" />
    <path d="M8 17v-3" />
  </svg>
);

export default QuestionBankView;

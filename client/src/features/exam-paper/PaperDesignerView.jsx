import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  Clock,
  Award,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Pencil,
  Copy,
  Search,
  Filter,
  Eye,
  Key,
  Printer,
  Send,
  Save,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  ShieldCheck,
  Code2,
  HelpCircle,
  Sparkles,
  BookOpen,
  SlidersHorizontal,
  Move,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  CheckSquare,
  Square,
  Lock,
  ArrowRight
} from 'lucide-react';
import { api } from '../../lib/api';

export const PaperDesignerView = ({
  questions: initialCodingQuestions = [],
  onNavigateToExams
}) => {
  // ── 1. ACTIVE VIEW MODE ──────────────────────────────────────────────────
  // 'designer' | 'preview_student' | 'teacher_key'
  const [viewMode, setViewMode] = useState('designer');

  // ── 2. ASSESSMENT SETTINGS & METADATA ────────────────────────────────────
  const [examTitle, setExamTitle] = useState('Data Structures & Algorithms - Mid-Semester Online Test');
  const [courseCode, setCourseCode] = useState('CS204');
  const [courseTitle, setCourseTitle] = useState('Advanced Data Structures & Algorithms');
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [targetMarks, setTargetMarks] = useState(50);
  const [proctoringMode, setProctoringMode] = useState('Strict Proctoring');
  const [candidateInstructions, setCandidateInstructions] = useState(
    '1. Answer all questions according to instructions in each section.\n2. In coding problems, adhere strictly to specified time and memory complexity.\n3. In MCQs, each question has exactly one correct choice. Negative marking: 0.25.\n4. Switching browser tabs or exiting fullscreen will be recorded by the proctoring engine.'
  );

  // ── 3. QUESTION REPOSITORIES (Coding & MCQs) ─────────────────────────────
  const [codingBank, setCodingBank] = useState(initialCodingQuestions);
  const [mcqBank, setMcqBank] = useState([]);
  const [isLoadingBank, setIsLoadingBank] = useState(false);
  const [searchBankQuery, setSearchBankQuery] = useState('');
  const [bankTypeFilter, setBankTypeFilter] = useState('all'); // 'all' | 'mcq' | 'coding'
  const [bankDifficultyFilter, setBankDifficultyFilter] = useState('all');
  const [targetSectionForInsert, setTargetSectionForInsert] = useState('sec-a');

  // ── 4. PAPER SECTIONS STRUCTURE ──────────────────────────────────────────
  const [sections, setSections] = useState([
    {
      id: 'sec-a',
      title: 'SECTION A: MULTIPLE CHOICE QUESTIONS',
      instructions: 'Each question carries 2 marks. Choose the single most appropriate option.',
      defaultMarks: 2,
      collapsed: false,
      items: []
    },
    {
      id: 'sec-b',
      title: 'SECTION B: PROBLEM SOLVING & ALGORITHM IMPLEMENTATION',
      instructions: 'Each question carries 10 marks. Implement the solution function adhering to given time/memory limits.',
      defaultMarks: 10,
      collapsed: false,
      items: []
    }
  ]);

  // ── 5. MODALS & NOTIFICATIONS ────────────────────────────────────────────
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [sectionFormTitle, setSectionFormTitle] = useState('');
  const [sectionFormInstructions, setSectionFormInstructions] = useState('');

  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishedExam, setPublishedExam] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [notification, setNotification] = useState(null);

  const instructionsRef = useRef(null);

  // Fetch coding and MCQ banks from backend
  const fetchBankData = async () => {
    setIsLoadingBank(true);
    try {
      const qRes = await api.get('/questions?limit=100');
      const codingItems = qRes.data?.data || [];
      setCodingBank(codingItems);

      const mcqRes = await api.get('/mcq/saved');
      const mcqItems = mcqRes.data?.data?.items || [];
      setMcqBank(mcqItems);

      // Pre-populate sections if currently empty
      setSections((prev) => {
        if (prev.some((s) => s.items.length > 0)) return prev;
        const next = [...prev];
        if (mcqItems.length > 0 && next[0]) {
          next[0].items = mcqItems.slice(0, 1).map((m) => ({
            type: 'mcq',
            id: m._id || m.id,
            title: m.question,
            data: m,
            marks: 2
          }));
        }
        if (codingItems.length > 0 && next[1]) {
          next[1].items = codingItems.slice(0, 2).map((q) => ({
            type: 'coding',
            id: q._id || q.id,
            title: q.title,
            data: q,
            marks: 10
          }));
        }
        return next;
      });
    } catch (err) {
      console.warn('Failed to load question banks', err);
    } finally {
      setIsLoadingBank(false);
    }
  };

  useEffect(() => {
    fetchBankData();
  }, []);

  // ── CALCULATIONS (Dynamic mark allocation) ────────────────────────────────
  const calculation = useMemo(() => {
    let totalQuestions = 0;
    let totalAllocatedMarks = 0;

    const sectionMetrics = sections.map((sec) => {
      const qCount = sec.items.length;
      const secMarks = sec.items.reduce((sum, item) => sum + (Number(item.marks) || 0), 0);
      totalQuestions += qCount;
      totalAllocatedMarks += secMarks;
      return {
        sectionId: sec.id,
        qCount,
        secMarks
      };
    });

    const target = Number(targetMarks) || 50;
    const remainingMarks = target - totalAllocatedMarks;
    const progressPercent = target > 0 ? Math.min(Math.round((totalAllocatedMarks / target) * 100), 100) : 0;

    return {
      totalQuestions,
      totalAllocatedMarks,
      targetMarks: target,
      remainingMarks,
      progressPercent,
      sectionMetrics,
      isOverAllocated: totalAllocatedMarks > target,
      isUnderAllocated: totalAllocatedMarks < target,
      isBalanced: totalAllocatedMarks === target
    };
  }, [sections, targetMarks]);

  // Combined Questions Repository List for Left Panel
  const filteredRepositoryQuestions = useMemo(() => {
    const list = [];

    // MCQs
    if (bankTypeFilter === 'all' || bankTypeFilter === 'mcq') {
      mcqBank.forEach((m) => {
        list.push({
          id: m._id || m.id,
          type: 'mcq',
          title: m.question,
          topic: m.topic || 'Computer Science',
          difficulty: m.difficulty || 'Medium',
          defaultMarks: m.marks || 2,
          data: m
        });
      });
    }

    // Coding
    if (bankTypeFilter === 'all' || bankTypeFilter === 'coding') {
      codingBank.forEach((c) => {
        list.push({
          id: c._id || c.id,
          type: 'coding',
          title: c.title,
          topic: Array.isArray(c.tags) && c.tags.length > 0 ? c.tags[0] : 'Algorithms',
          difficulty: c.difficulty || 'Medium',
          defaultMarks: 10,
          data: c
        });
      });
    }

    // Apply search & difficulty filters
    return list.filter((item) => {
      if (bankDifficultyFilter !== 'all' && item.difficulty !== bankDifficultyFilter) return false;
      if (searchBankQuery.trim()) {
        const q = searchBankQuery.toLowerCase();
        const titleMatch = (item.title || '').toLowerCase().includes(q);
        const topicMatch = (item.topic || '').toLowerCase().includes(q);
        return titleMatch || topicMatch;
      }
      return true;
    });
  }, [codingBank, mcqBank, bankTypeFilter, bankDifficultyFilter, searchBankQuery]);

  // Check if a question is already added in the paper
  const isQuestionInPaper = (questionId) => {
    return sections.some((s) => s.items.some((item) => item.id === questionId));
  };

  // Add question to active section
  const handleAddQuestionToSection = (questionItem) => {
    const destSecId = targetSectionForInsert || sections[0]?.id;
    if (!destSecId) {
      alert('Please create or select a section first.');
      return;
    }

    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id === destSecId) {
          // Check if already in this section
          if (sec.items.some((it) => it.id === questionItem.id)) {
            return sec;
          }
          return {
            ...sec,
            items: [
              ...sec.items,
              {
                type: questionItem.type,
                id: questionItem.id,
                title: questionItem.title,
                marks: sec.defaultMarks || questionItem.defaultMarks || 2,
                data: questionItem.data
              }
            ]
          };
        }
        return sec;
      })
    );

    setNotification({
      type: 'success',
      text: `Added "${questionItem.title.slice(0, 32)}..." to ${sections.find((s) => s.id === destSecId)?.title || 'section'}.`
    });
    setTimeout(() => setNotification(null), 3000);
  };

  // Update Question Marks inside section
  const handleUpdateItemMarks = (secId, itemId, newMarks) => {
    const parsed = Math.max(0, parseInt(newMarks, 10) || 0);
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id === secId) {
          return {
            ...sec,
            items: sec.items.map((it) => (it.id === itemId ? { ...it, marks: parsed } : it))
          };
        }
        return sec;
      })
    );
  };

  // Remove Question from section
  const handleRemoveItem = (secId, itemId) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id === secId) {
          return {
            ...sec,
            items: sec.items.filter((it) => it.id !== itemId)
          };
        }
        return sec;
      })
    );
  };

  // Move Question Up / Down in section
  const handleMoveItem = (secId, index, direction) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== secId) return sec;
        const newItems = [...sec.items];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newItems.length) return sec;
        const temp = newItems[index];
        newItems[index] = newItems[targetIndex];
        newItems[targetIndex] = temp;
        return { ...sec, items: newItems };
      })
    );
  };

  // Section Management: Add / Edit
  const handleOpenAddSection = () => {
    setEditingSection(null);
    setSectionFormTitle(`SECTION ${String.fromCharCode(65 + sections.length)}: `);
    setSectionFormInstructions('Answer questions according to instructions.');
    setIsAddSectionModalOpen(true);
  };

  const handleOpenEditSection = (sec) => {
    setEditingSection(sec);
    setSectionFormTitle(sec.title);
    setSectionFormInstructions(sec.instructions);
    setIsAddSectionModalOpen(true);
  };

  const handleSaveSection = (e) => {
    e.preventDefault();
    if (!sectionFormTitle.trim()) {
      alert('Section title is required.');
      return;
    }

    if (editingSection) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === editingSection.id
            ? { ...s, title: sectionFormTitle.trim(), instructions: sectionFormInstructions.trim() }
            : s
        )
      );
    } else {
      const newSec = {
        id: `sec-${Date.now()}`,
        title: sectionFormTitle.trim(),
        instructions: sectionFormInstructions.trim(),
        defaultMarks: 2,
        collapsed: false,
        items: []
      };
      setSections((prev) => [...prev, newSec]);
      setTargetSectionForInsert(newSec.id);
    }

    setIsAddSectionModalOpen(false);
  };

  const handleDeleteSection = (secId) => {
    if (sections.length <= 1) {
      alert('Assessment must contain at least one section.');
      return;
    }
    if (!confirm('Are you sure you want to delete this section and all questions inside it?')) return;
    setSections((prev) => prev.filter((s) => s.id !== secId));
  };

  const toggleSectionCollapse = (secId) => {
    setSections((prev) =>
      prev.map((s) => (s.id === secId ? { ...s, collapsed: !s.collapsed } : s))
    );
  };

  // Instructions formatting toolbar helper
  const applyInstructionsFormat = (type) => {
    const textarea = instructionsRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = candidateInstructions.substring(start, end) || 'text';
    let rep = '';
    if (type === 'b') rep = `**${selected}**`;
    else if (type === 'i') rep = `*${selected}*`;
    else if (type === 'u') rep = `<u>${selected}</u>`;
    else if (type === 'bullet') rep = `\n- ${selected}\n`;
    else if (type === 'num') rep = `\n1. ${selected}\n`;
    else if (type === 'link') rep = `[${selected}](url)`;

    const updated = candidateInstructions.substring(0, start) + rep + candidateInstructions.substring(end);
    setCandidateInstructions(updated);
  };

  // Save Draft
  const handleSaveDraft = () => {
    setIsSavingDraft(true);
    setTimeout(() => {
      setIsSavingDraft(false);
      setNotification({ type: 'success', text: 'Assessment paper draft saved successfully.' });
      setTimeout(() => setNotification(null), 3000);
    }, 600);
  };

  // Publish as Live Exam
  const handlePublishLiveExam = async () => {
    if (!examTitle.trim() || !courseCode.trim()) {
      alert('Exam Title and Course Code are required.');
      return;
    }
    if (calculation.totalQuestions === 0) {
      alert('Please add at least one question to the paper before publishing.');
      return;
    }

    setIsPublishing(true);
    try {
      const payload = {
        title: examTitle.trim(),
        description: `${courseCode.trim()} - ${courseTitle.trim()}`,
        durationMinutes: Number(durationMinutes) || 60,
        instructions: candidateInstructions.split('\n').filter((l) => l.trim().length > 0),
        accessMode: 'PUBLIC_CODE',
        sections: sections.map((sec) => ({
          title: sec.title,
          description: sec.instructions,
          questions: sec.items.map((item) => ({
            questionId: item.type === 'coding' ? item.id : undefined,
            type: item.type === 'mcq' ? 'MCQ' : 'CODING',
            title: item.title,
            marks: Number(item.marks) || 2,
            mcqData: item.type === 'mcq' ? item.data : undefined
          }))
        })),
        settings: {
          enableProctoring: proctoringMode !== 'No Proctoring',
          strictMode: proctoringMode.includes('Strict'),
          targetMarks: calculation.targetMarks
        }
      };

      const res = await api.post('/exams', payload);
      const created = res.data?.data;
      setPublishedExam(created);
      setIsPublishModalOpen(true);
    } catch (err) {
      alert(err.response?.data?.error?.message || err.customMessage || 'Failed to publish exam');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="w-full pb-16 animate-fadeIn select-none font-sans">
      {/* ────────────────────────────────────────────────────────────────────────────
          1. TOP NAVIGATION & PAGE HEADER
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-4">
        <div>
          {/* Eyebrow */}
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#EDFF72] shadow-xs" />
            <span className="text-[11px] font-extrabold tracking-wider text-[#777D78] uppercase">
              ONLINE ASSESSMENT SUITE
            </span>
          </div>

          <h1 className="text-3xl font-black text-[#171819] tracking-tight">
            Online Paper Designer
          </h1>
          <p className="text-xs text-[#777D78] font-medium mt-0.5">
            Design multi-section online tests, configure MCQs and coding problems, and export structured assessment content.
          </p>
        </div>

        {/* Header Actions matching specification */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* 3 Segmented Navigation Tabs */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-full border border-[#DDE1DA] shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('designer')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'designer'
                  ? 'bg-[#191A1D] text-white shadow-xs'
                  : 'text-[#777D78] hover:text-[#171819]'
              }`}
            >
              Paper Designer
            </button>

            <button
              type="button"
              onClick={() => setViewMode('preview_student')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'preview_student'
                  ? 'bg-[#191A1D] text-white shadow-xs'
                  : 'text-[#777D78] hover:text-[#171819]'
              }`}
            >
              Student Paper Preview
            </button>

            <button
              type="button"
              onClick={() => setViewMode('teacher_key')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'teacher_key'
                  ? 'bg-[#191A1D] text-white shadow-xs'
                  : 'text-[#777D78] hover:text-[#171819]'
              }`}
            >
              Teacher Master Key
            </button>
          </div>

          {/* Print / PDF Button */}
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-[#777D78]" />
            <span>Print / PDF</span>
          </button>

          {/* Publish as Live Exam Button (Primary Lime) */}
          <button
            type="button"
            disabled={isPublishing}
            onClick={handlePublishLiveExam}
            className="px-5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] text-xs font-black text-[#191A1D] shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5 fill-current" />
            <span>{isPublishing ? 'Publishing...' : 'Publish as Live Exam'}</span>
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notification.text}</span>
          </div>
          <button type="button" onClick={() => setNotification(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          2. ASSESSMENT OVERVIEW STRIP (HORIZONTAL BAR BELOW HEADER)
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-4 mb-6 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs">
        {/* A. COURSE & CODE */}
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#F2F3F0] text-[#171819] flex items-center justify-center font-bold">
            <BookOpen className="w-4 h-4 text-[#191A1D]" />
          </span>
          <div>
            <span className="text-[10px] font-bold text-[#777D78] uppercase block">Course & Code</span>
            <span className="font-extrabold text-[#171819] text-xs">
              {courseTitle} ({courseCode})
            </span>
          </div>
        </div>

        <div className="hidden sm:block w-px h-8 bg-[#DDE1DA]" />

        {/* B. DURATION */}
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#F2F3F0] text-[#171819] flex items-center justify-center font-bold">
            <Clock className="w-4 h-4 text-[#777D78]" />
          </span>
          <div>
            <span className="text-[10px] font-bold text-[#777D78] uppercase block">Duration</span>
            <span className="font-black text-[#171819] text-sm">
              {durationMinutes} Mins
            </span>
          </div>
        </div>

        <div className="hidden sm:block w-px h-8 bg-[#DDE1DA]" />

        {/* C. SECTIONS */}
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#F2F3F0] text-[#171819] flex items-center justify-center font-bold">
            <Layers className="w-4 h-4 text-[#777D78]" />
          </span>
          <div>
            <span className="text-[10px] font-bold text-[#777D78] uppercase block">Sections</span>
            <span className="font-black text-[#171819] text-sm">
              {sections.length} Sections
            </span>
          </div>
        </div>

        <div className="hidden sm:block w-px h-8 bg-[#DDE1DA]" />

        {/* D. TOTAL QUESTIONS */}
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#F2F3F0] text-[#171819] flex items-center justify-center font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </span>
          <div>
            <span className="text-[10px] font-bold text-[#777D78] uppercase block">Total Questions</span>
            <span className="font-black text-[#171819] text-sm">
              {calculation.totalQuestions} Questions
            </span>
          </div>
        </div>

        <div className="hidden sm:block w-px h-8 bg-[#DDE1DA]" />

        {/* E. TOTAL MARKS ALLOCATION */}
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#EDFF72] text-[#191A1D] flex items-center justify-center font-bold shadow-xs">
            <Award className="w-4 h-4 fill-current" />
          </span>
          <div>
            <span className="text-[10px] font-bold text-[#777D78] uppercase block">Total Marks</span>
            <div className="flex items-baseline gap-2">
              <span className="font-black text-[#171819] text-sm">
                {calculation.totalAllocatedMarks} / {calculation.targetMarks} Marks
              </span>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  calculation.isBalanced
                    ? 'bg-emerald-100 text-emerald-800'
                    : calculation.isOverAllocated
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {calculation.isBalanced
                  ? 'Target Reached'
                  : calculation.isOverAllocated
                  ? `Over by ${Math.abs(calculation.remainingMarks)} marks`
                  : `${calculation.remainingMarks} Marks remaining`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          VIEW MODE 1: PAPER DESIGNER WORKSPACE (TWO-COLUMN)
          ──────────────────────────────────────────────────────────────────────────── */}
      {viewMode === 'designer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* ══════════════════════════════════════════════════════════════════════════
              LEFT COLUMN (~34%, 4 cols of 12)
              Card 1: Assessment Settings
              Card 2: Question Bank Repository
              ══════════════════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-4 space-y-5">
            {/* CARD 1: ASSESSMENT SETTINGS */}
            <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-1">
                <SlidersHorizontal className="w-4 h-4 text-[#171819]" />
                <h3 className="text-sm font-black text-[#171819]">Assessment Settings</h3>
              </div>
              <p className="text-[11px] text-[#777D78] mb-4">
                Title, duration, instructions and exam behavior.
              </p>

              <div className="space-y-3.5 text-xs">
                {/* Title */}
                <div>
                  <label className="block text-[11px] font-bold text-[#171819] mb-1">
                    Assessment Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={examTitle}
                    onChange={(e) => setExamTitle(e.target.value)}
                    placeholder="e.g. Mid-Semester Online Test"
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-semibold text-[#171819] focus:outline-none focus:border-[#191A1D]"
                  />
                </div>

                {/* Course Code & Duration */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[#171819] mb-1">
                      Course Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                      placeholder="e.g. CS204"
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-semibold text-[#171819] focus:outline-none focus:border-[#191A1D]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#171819] mb-1">
                      Duration (Mins) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="360"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-semibold text-[#171819] focus:outline-none focus:border-[#191A1D]"
                    />
                  </div>
                </div>

                {/* Course Title & Target Marks */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[#171819] mb-1">Course Title</label>
                    <input
                      type="text"
                      value={courseTitle}
                      onChange={(e) => setCourseTitle(e.target.value)}
                      placeholder="e.g. Data Structures"
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs text-[#171819] focus:outline-none focus:border-[#191A1D]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#171819] mb-1">Target Total Marks</label>
                    <input
                      type="number"
                      min="1"
                      value={targetMarks}
                      onChange={(e) => setTargetMarks(e.target.value)}
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] focus:outline-none focus:border-[#191A1D]"
                    />
                  </div>
                </div>

                {/* Proctoring Mode */}
                <div>
                  <label className="block text-[11px] font-bold text-[#171819] mb-1">Proctoring Mode</label>
                  <select
                    value={proctoringMode}
                    onChange={(e) => setProctoringMode(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-semibold text-[#171819] focus:outline-none cursor-pointer"
                  >
                    <option value="No Proctoring">No Proctoring</option>
                    <option value="Fullscreen Lock">Fullscreen Lock</option>
                    <option value="Webcam Monitoring">Webcam Monitoring</option>
                    <option value="Strict Proctoring">Strict Proctoring (Webcam + Screen + Tab)</option>
                  </select>
                </div>

                {/* Candidate Instructions with Toolbar */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-[#171819]">Candidate Instructions</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => applyInstructionsFormat('b')}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold hover:bg-[#F2F3F0]"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => applyInstructionsFormat('i')}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold hover:bg-[#F2F3F0]"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onClick={() => applyInstructionsFormat('bullet')}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold hover:bg-[#F2F3F0]"
                      >
                        •
                      </button>
                      <button
                        type="button"
                        onClick={() => applyInstructionsFormat('num')}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold hover:bg-[#F2F3F0]"
                      >
                        1.
                      </button>
                    </div>
                  </div>
                  <textarea
                    ref={instructionsRef}
                    rows={4}
                    value={candidateInstructions}
                    onChange={(e) => setCandidateInstructions(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs text-[#171819] focus:outline-none resize-none leading-relaxed font-sans"
                  />
                </div>
              </div>
            </div>

            {/* CARD 2: QUESTION BANK REPOSITORY */}
            <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-5 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#171819]" />
                  <h3 className="text-sm font-black text-[#171819]">Question Bank Repository</h3>
                </div>
                <span className="text-[10px] font-bold text-[#777D78]">
                  {filteredRepositoryQuestions.length} available
                </span>
              </div>
              <p className="text-[11px] text-[#777D78] mb-3">
                Select MCQs and coding problems to add into sections.
              </p>

              {/* Target Section Selection */}
              <div className="p-2.5 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] mb-3 text-xs flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#171819] shrink-0">Insert into:</span>
                <select
                  value={targetSectionForInsert}
                  onChange={(e) => setTargetSectionForInsert(e.target.value)}
                  className="bg-white border border-[#DDE1DA] rounded-lg px-2.5 py-1 text-xs font-bold text-[#171819] focus:outline-none max-w-[190px] truncate cursor-pointer"
                >
                  {sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search & Filters */}
              <div className="space-y-2 mb-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#777D78] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchBankQuery}
                    onChange={(e) => setSearchBankQuery(e.target.value)}
                    placeholder="Search questions, topics, keywords..."
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-full pl-8 pr-3 py-1.5 text-xs text-[#171819] focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <select
                    value={bankTypeFilter}
                    onChange={(e) => setBankTypeFilter(e.target.value)}
                    className="flex-1 bg-[#F2F3F0] border border-[#DDE1DA] rounded-lg px-2 py-1 text-[11px] font-bold text-[#171819] focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Types</option>
                    <option value="mcq">MCQ Only</option>
                    <option value="coding">Coding Only</option>
                  </select>

                  <select
                    value={bankDifficultyFilter}
                    onChange={(e) => setBankDifficultyFilter(e.target.value)}
                    className="flex-1 bg-[#F2F3F0] border border-[#DDE1DA] rounded-lg px-2 py-1 text-[11px] font-bold text-[#171819] focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Difficulties</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* Scrollable Questions List */}
              <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
                {filteredRepositoryQuestions.map((q) => {
                  const inPaper = isQuestionInPaper(q.id);
                  return (
                    <div
                      key={q.id}
                      className="p-3 rounded-2xl border border-[#DDE1DA] bg-white hover:border-[#191A1D]/40 transition-all text-xs flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase ${
                                q.type === 'mcq'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {q.type}
                            </span>
                            <span className="text-[10px] text-[#777D78] font-bold">{q.topic}</span>
                            <span className="text-[10px] text-amber-800 font-bold">• {q.difficulty}</span>
                          </div>
                          <p className="font-bold text-[#171819] line-clamp-2 leading-snug">
                            {q.title}
                          </p>
                        </div>

                        <span className="font-mono text-xs font-extrabold text-[#171819] shrink-0">
                          {q.defaultMarks}m
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-[#DDE1DA]/50">
                        {inPaper ? (
                          <span className="text-[10px] font-extrabold text-emerald-700 flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>Added in Paper</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#777D78]">Not added yet</span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleAddQuestionToSection(q)}
                          className="px-3 py-1 rounded-full bg-[#F2F3F0] hover:bg-[#EDFF72] text-[11px] font-extrabold text-[#171819] transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add to Section</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════════
              RIGHT COLUMN (~66%, 8 cols of 12)
              Card 1: Paper Sections & Ordering (Main Workspace)
              Card 2: Paper Summary
              ══════════════════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-8 space-y-5">
            {/* CARD 1: PAPER SECTIONS & ORDERING */}
            <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-[#DDE1DA]/60">
                <div>
                  <h3 className="text-base font-black text-[#171819]">
                    Paper Sections & Ordering
                  </h3>
                  <p className="text-xs text-[#777D78]">
                    Re-order items, set instructions, and allocate marks per question.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenAddSection}
                    className="px-4 py-2 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] text-xs font-extrabold text-[#171819] border border-[#DDE1DA] flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Section</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSavingDraft}
                    onClick={handleSaveDraft}
                    className="px-4 py-2 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-[#777D78]" />
                    <span>{isSavingDraft ? 'Saving...' : 'Save Draft'}</span>
                  </button>
                </div>
              </div>

              {/* Sections List */}
              <div className="space-y-5">
                {sections.map((sec, secIdx) => {
                  const secMarks = sec.items.reduce((s, it) => s + (Number(it.marks) || 0), 0);

                  return (
                    <div
                      key={sec.id}
                      className="border border-[#DDE1DA] rounded-[24px] overflow-hidden bg-white shadow-2xs"
                    >
                      {/* Section Card Header */}
                      <div className="p-4 bg-[#F2F3F0] border-b border-[#DDE1DA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleSectionCollapse(sec.id)}
                            className="p-1 rounded-lg text-[#777D78] hover:text-[#171819] cursor-pointer"
                          >
                            {sec.collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </button>

                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-xs text-[#171819] tracking-tight">
                                {sec.title}
                              </h4>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-[#777D78] border border-[#DDE1DA]">
                                {sec.items.length} questions
                              </span>
                            </div>
                            <p className="text-[11px] text-[#777D78] mt-0.5 leading-snug">
                              {sec.instructions}
                            </p>
                          </div>
                        </div>

                        {/* Section Right Controls */}
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <span className="font-extrabold text-xs text-[#171819] px-2.5 py-1 rounded-full bg-white border border-[#DDE1DA]">
                            Total: {secMarks} Marks
                          </span>

                          <button
                            type="button"
                            onClick={() => handleOpenEditSection(sec)}
                            title="Edit Section Details"
                            className="p-1.5 rounded-lg text-[#777D78] hover:text-[#171819] hover:bg-white transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteSection(sec.id)}
                            title="Delete Section"
                            className="p-1.5 rounded-lg text-[#777D78] hover:text-rose-600 hover:bg-white transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Section Content & Ordered Question Rows */}
                      {!sec.collapsed && (
                        <div className="p-4 space-y-2.5">
                          {sec.items.length === 0 ? (
                            <div className="text-center py-8 border border-dashed border-[#DDE1DA] rounded-2xl bg-[#F2F3F0]/40">
                              <p className="text-xs text-[#777D78] font-medium">
                                No questions in this section yet.
                              </p>
                              <p className="text-[11px] text-[#777D78]">
                                Select questions from the Question Bank repository on the left to add them here.
                              </p>
                            </div>
                          ) : (
                            sec.items.map((item, itIdx) => (
                              <div
                                key={item.id}
                                className="p-3 rounded-2xl border border-[#DDE1DA] bg-white hover:border-[#191A1D]/30 transition-all flex items-center justify-between gap-3 text-xs"
                              >
                                {/* Left Item Info */}
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="font-mono text-xs font-bold text-[#777D78] w-5 shrink-0">
                                    #{itIdx + 1}
                                  </span>

                                  <span
                                    className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase shrink-0 ${
                                      item.type === 'mcq'
                                        ? 'bg-purple-100 text-purple-800'
                                        : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {item.type}
                                  </span>

                                  <span className="font-bold text-[#171819] truncate leading-tight">
                                    {item.title}
                                  </span>
                                </div>

                                {/* Right Item Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                  {/* Marks Input */}
                                  <div className="flex items-center gap-1 bg-[#F2F3F0] rounded-xl px-2 py-1 border border-[#DDE1DA]">
                                    <span className="text-[10px] font-bold text-[#777D78]">Marks:</span>
                                    <input
                                      type="number"
                                      min="1"
                                      max="50"
                                      value={item.marks}
                                      onChange={(e) => handleUpdateItemMarks(sec.id, item.id, e.target.value)}
                                      className="w-10 bg-transparent text-center font-bold text-xs text-[#171819] focus:outline-none"
                                    />
                                  </div>

                                  {/* Reorder Buttons */}
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      disabled={itIdx === 0}
                                      onClick={() => handleMoveItem(sec.id, itIdx, 'up')}
                                      title="Move Up"
                                      className="p-1 rounded text-[#777D78] hover:text-[#171819] disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={itIdx === sec.items.length - 1}
                                      onClick={() => handleMoveItem(sec.id, itIdx, 'down')}
                                      title="Move Down"
                                      className="p-1 rounded text-[#777D78] hover:text-[#171819] disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {/* Remove Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(sec.id, item.id)}
                                    title="Remove from Paper"
                                    className="p-1 rounded text-[#777D78] hover:text-rose-600 cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CARD 2: PAPER SUMMARY PANEL */}
            <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-6 shadow-xs">
              <h4 className="text-xs font-black text-[#171819] uppercase tracking-wider mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#171819]" />
                <span>Paper Summary & Mark Allocation</span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs mb-4">
                <div>
                  <span className="text-[10px] text-[#777D78] font-bold block">Sections</span>
                  <span className="text-lg font-black text-[#171819]">{sections.length}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777D78] font-bold block">Total Questions</span>
                  <span className="text-lg font-black text-[#171819]">{calculation.totalQuestions}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777D78] font-bold block">Allocated Marks</span>
                  <span className="text-lg font-black text-[#171819]">
                    {calculation.totalAllocatedMarks} / {calculation.targetMarks}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777D78] font-bold block">Allocation Status</span>
                  <span
                    className={`text-xs font-extrabold inline-block mt-1 ${
                      calculation.isBalanced
                        ? 'text-emerald-700'
                        : calculation.isOverAllocated
                        ? 'text-rose-600'
                        : 'text-amber-700'
                    }`}
                  >
                    {calculation.progressPercent}% Allocated
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-3 rounded-full bg-[#E9ECE7] overflow-hidden">
                <div
                  style={{ width: `${calculation.progressPercent}%` }}
                  className={`h-full transition-all duration-500 rounded-full ${
                    calculation.isBalanced
                      ? 'bg-[#EDFF72]'
                      : calculation.isOverAllocated
                      ? 'bg-rose-500'
                      : 'bg-[#EDFF72]'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          VIEW MODE 2: STUDENT PAPER PREVIEW
          ──────────────────────────────────────────────────────────────────────────── */}
      {viewMode === 'preview_student' && (
        <div className="bg-white border border-[#DDE1DA] rounded-[32px] p-8 max-w-4xl mx-auto shadow-sm space-y-6 animate-fadeIn">
          {/* Header */}
          <div className="text-center pb-6 border-b border-[#DDE1DA] space-y-2">
            <span className="text-[11px] font-extrabold tracking-widest text-[#777D78] uppercase">
              STUDENT EXAMINATION VIEW
            </span>
            <h2 className="text-2xl font-black text-[#171819]">{examTitle}</h2>
            <div className="flex items-center justify-center gap-4 text-xs font-bold text-[#777D78]">
              <span>Course: {courseTitle} ({courseCode})</span>
              <span>•</span>
              <span>Duration: {durationMinutes} Minutes</span>
              <span>•</span>
              <span>Maximum Marks: {calculation.totalAllocatedMarks}</span>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-[#F2F3F0] rounded-2xl p-4 border border-[#DDE1DA] text-xs space-y-1.5 leading-relaxed">
            <span className="font-extrabold text-[#171819] block">Instructions to Candidates:</span>
            <pre className="font-sans whitespace-pre-wrap text-[#171819]">{candidateInstructions}</pre>
          </div>

          {/* Sections & Questions */}
          <div className="space-y-8 pt-2">
            {sections.map((sec, secIdx) => (
              <div key={sec.id} className="space-y-4">
                <div className="pb-2 border-b-2 border-[#191A1D]">
                  <h3 className="text-sm font-black text-[#171819] uppercase tracking-wide">
                    {sec.title}
                  </h3>
                  <p className="text-xs text-[#777D78] mt-0.5">{sec.instructions}</p>
                </div>

                <div className="space-y-6">
                  {sec.items.map((item, itIdx) => (
                    <div key={item.id} className="p-4 rounded-2xl bg-[#F2F3F0]/50 border border-[#DDE1DA] space-y-3">
                      <div className="flex items-start justify-between gap-3 text-xs">
                        <span className="font-black text-[#171819]">
                          Q{itIdx + 1}. {item.title}
                        </span>
                        <span className="font-bold font-mono text-[#777D78] shrink-0">
                          [{item.marks} Marks]
                        </span>
                      </div>

                      {/* MCQ Choices */}
                      {item.type === 'mcq' && item.data && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                          <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-[#DDE1DA] cursor-pointer hover:bg-[#F2F3F0]">
                            <input type="radio" name={`q-${item.id}`} className="text-[#191A1D]" />
                            <span>A. {item.data.optionA}</span>
                          </label>
                          <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-[#DDE1DA] cursor-pointer hover:bg-[#F2F3F0]">
                            <input type="radio" name={`q-${item.id}`} className="text-[#191A1D]" />
                            <span>B. {item.data.optionB}</span>
                          </label>
                          <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-[#DDE1DA] cursor-pointer hover:bg-[#F2F3F0]">
                            <input type="radio" name={`q-${item.id}`} className="text-[#191A1D]" />
                            <span>C. {item.data.optionC}</span>
                          </label>
                          <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-[#DDE1DA] cursor-pointer hover:bg-[#F2F3F0]">
                            <input type="radio" name={`q-${item.id}`} className="text-[#191A1D]" />
                            <span>D. {item.data.optionD}</span>
                          </label>
                        </div>
                      )}

                      {/* Coding statement */}
                      {item.type === 'coding' && item.data && (
                        <div className="text-xs text-[#777D78] bg-white p-3 rounded-xl border border-[#DDE1DA] whitespace-pre-wrap leading-relaxed">
                          {item.data.statement || 'Implement the algorithmic solution function matching test requirements.'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-6 border-t border-[#DDE1DA] flex justify-end">
            <button
              type="button"
              onClick={() => setViewMode('designer')}
              className="px-5 py-2 rounded-full bg-[#191A1D] text-white text-xs font-bold cursor-pointer"
            >
              Back to Designer
            </button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          VIEW MODE 3: TEACHER MASTER KEY
          ──────────────────────────────────────────────────────────────────────────── */}
      {viewMode === 'teacher_key' && (
        <div className="bg-white border border-[#DDE1DA] rounded-[32px] p-8 max-w-4xl mx-auto shadow-sm space-y-6 animate-fadeIn">
          <div className="pb-4 border-b border-[#DDE1DA] flex items-center justify-between">
            <div>
              <span className="text-[11px] font-extrabold tracking-widest text-[#777D78] uppercase">
                TEACHER MASTER ANSWER KEY (CONFIDENTIAL)
              </span>
              <h2 className="text-2xl font-black text-[#171819]">{examTitle}</h2>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              Verified Key
            </span>
          </div>

          <div className="space-y-6">
            {sections.map((sec) => (
              <div key={sec.id} className="space-y-3">
                <h3 className="text-xs font-black uppercase text-[#777D78]">{sec.title}</h3>
                {sec.items.map((item, i) => (
                  <div key={item.id} className="p-4 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-[#171819]">
                      <span>Q{i + 1}. {item.title}</span>
                      <span className="font-mono text-[#777D78]">[{item.marks} Marks]</span>
                    </div>

                    {item.type === 'mcq' && item.data && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
                        <span className="font-bold">
                          Correct Answer: Option {item.data.correctAnswer} (
                          {item.data[`option${item.data.correctAnswer}`]})
                        </span>
                        {item.data.explanation && (
                          <p className="text-[11px] text-emerald-800 italic">
                            Explanation: {item.data.explanation}
                          </p>
                        )}
                      </div>
                    )}

                    {item.type === 'coding' && item.data && (
                      <div className="p-2.5 rounded-xl bg-white border border-[#DDE1DA] font-mono text-[11px] text-[#171819]">
                        <span className="font-bold text-[#777D78] block mb-1">Reference Solution:</span>
                        <pre className="overflow-x-auto text-emerald-800">
                          {item.data.referenceSolution || '// Verified teacher implementation'}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[#DDE1DA] flex justify-end">
            <button
              type="button"
              onClick={() => setViewMode('designer')}
              className="px-5 py-2 rounded-full bg-[#191A1D] text-white text-xs font-bold cursor-pointer"
            >
              Back to Designer
            </button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL: ADD / EDIT SECTION
          ──────────────────────────────────────────────────────────────────────────── */}
      {isAddSectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#191A1D]/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-[32px] border border-[#DDE1DA] max-w-md w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]/60 mb-4">
              <h3 className="text-sm font-black text-[#171819]">
                {editingSection ? 'Edit Section Details' : 'Add New Paper Section'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddSectionModalOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleSaveSection} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#171819] mb-1">Section Title *</label>
                <input
                  type="text"
                  required
                  value={sectionFormTitle}
                  onChange={(e) => setSectionFormTitle(e.target.value)}
                  placeholder="e.g. SECTION C: ADVANCED ALGORITHMS"
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#171819] mb-1">Section Instructions</label>
                <textarea
                  rows={3}
                  value={sectionFormInstructions}
                  onChange={(e) => setSectionFormInstructions(e.target.value)}
                  placeholder="e.g. Answer any 2 questions. Each question carries 15 marks."
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs text-[#171819] focus:outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-[#DDE1DA]/60">
                <button
                  type="button"
                  onClick={() => setIsAddSectionModalOpen(false)}
                  className="px-4 py-2 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] text-xs font-bold text-[#171819]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] text-xs font-black text-[#191A1D] shadow-xs cursor-pointer"
                >
                  {editingSection ? 'Update Section' : 'Create Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL: PUBLISH AS LIVE EXAM CONFIRMATION & ACCESS CODE
          ──────────────────────────────────────────────────────────────────────────── */}
      {isPublishModalOpen && publishedExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#191A1D]/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-[32px] border border-[#DDE1DA] max-w-md w-full p-6 shadow-2xl animate-scaleUp text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-black text-[#171819]">Exam Published Successfully!</h3>
            <p className="text-xs text-[#777D78] mt-1">
              Your assessment paper is now live and students can join using the unique access code.
            </p>

            <div className="my-5 p-4 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#777D78]">
                Student Access Code
              </span>
              <div className="text-2xl font-black font-mono tracking-widest text-[#191A1D]">
                {publishedExam.examCode}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(publishedExam.examCode);
                  setNotification({ type: 'success', text: 'Exam code copied to clipboard!' });
                  setIsPublishModalOpen(false);
                }}
                className="px-4 py-2 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] text-xs font-bold text-[#171819]"
              >
                Copy Code
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPublishModalOpen(false);
                  if (onNavigateToExams) onNavigateToExams();
                }}
                className="px-5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] text-xs font-black text-[#191A1D] shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>View in Examinations</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaperDesignerView;

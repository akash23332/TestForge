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
  ArrowRight,
  Compass,
  FileCheck2,
  Gauge
} from 'lucide-react';
import { api } from '../../lib/api';

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
  const heroRef = useRef(null);
  const tiltRef = useRef(null);

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

  // Interactive 3D Cursor Gyro Handler
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
    <div className="tf-paper-root select-none font-sans text-[#171819] pb-16">
      {/* ────────────────────────────────────────────────────────────────────────────
          SCOPED STYLES: 100% LIGHT THEME, 3D BLUEPRINT FOLIO, QUESTION BANK MOTIONS
          ──────────────────────────────────────────────────────────────────────────── */}
      <style>{`
        .tf-paper-root {
          --canvas: #F2F3F0;
          --card: #FFFFFF;
          --line: #DDE1DA;
          --ink: #171819;
          --mute: #777D78;
          --acc: #EDFF72;
          --dark: #101112;
          --surface: #E9ECE7;
        }

        /* Top 2-Column Banner Grid */
        .tf-paper-root .tf-top {
          display: grid;
          grid-template-columns: 1.55fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        @media (max-width: 1024px) {
          .tf-paper-root .tf-top {
            grid-template-columns: 1fr;
          }
        }

        /* Bento Cards */
        .tf-paper-root .tf-card {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 28px;
          position: relative;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }

        /* Hero Bento Card */
        .tf-paper-root .tf-hero {
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
        .tf-paper-root .hero-title {
          font-size: clamp(32px, 3.4vw, 46px);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.05;
          margin: 6px 0 10px;
          display: flex;
          flex-wrap: wrap;
        }
        .tf-paper-root .tfTitleChar {
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

        /* 3D Blueprint Folio Stage - Aligned like Create Question */
        .tf-paper-root .stage {
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
        .tf-paper-root .stage .float {
          animation: tfPaperFloat 3.2s ease-in-out infinite;
          transform-style: preserve-3d;
        }
        @keyframes tfPaperFloat {
          0%, 100% {
            transform: translateY(0px) rotateZ(-3deg);
          }
          50% {
            transform: translateY(-16px) rotateZ(2deg);
          }
        }
        .tf-paper-root .tilt {
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform .12s ease-out;
          display: grid;
          place-items: center;
        }
        .tf-paper-root .paper-stack {
          width: 155px;
          height: 190px;
          position: relative;
          transform-style: preserve-3d;
          transform: rotateX(25deg) rotateY(-20deg) rotateZ(6deg);
        }
        .tf-paper-root .stage .shadow {
          position: absolute;
          bottom: 24px;
          width: 150px;
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
        .tf-paper-root .sheet {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          transform-style: preserve-3d;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
        }
        .tf-paper-root .sheet-3 {
          background: #1c1d22;
          border: 1px solid #33363e;
          transform: translateZ(-24px) translateY(8px) rotate(-6deg);
        }
        .tf-paper-root .sheet-2 {
          background: #23252c;
          border: 1px solid #3c404b;
          transform: translateZ(-12px) translateY(4px) rotate(-3deg);
        }
        .tf-paper-root .sheet-1 {
          background: #ffffff;
          border: 1.5px solid #d5dbd2;
          padding: 14px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transform: translateZ(0px);
        }
        .tf-paper-root .sheet-line {
          height: 4px;
          border-radius: 2px;
          background: #e5e8e3;
        }
        .tf-paper-root .sheet-stamp {
          position: absolute;
          bottom: 12px;
          right: 10px;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 2px dashed #171819;
          background: var(--acc);
          color: #171819;
          display: grid;
          place-items: center;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          transform: rotate(-12deg);
          box-shadow: 0 4px 12px rgba(237, 255, 114, 0.4);
        }

        /* 2x2 Telemetry Cards */
        .tf-paper-root .tf-quad {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .tf-paper-root .tf-mini {
          padding: 22px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 136px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .tf-paper-root .tf-mini:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.04);
        }
        .tf-paper-root .tf-tile {
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
        .tf-paper-root .tf-cap {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .tf-paper-root .tf-big {
          font-size: 32px;
          font-weight: 900;
          letter-spacing: -0.03em;
          color: var(--ink);
          line-height: 1;
        }
        .tf-paper-root .tf-sub {
          font-size: 11px;
          font-weight: 600;
          color: var(--mute);
          margin-top: 4px;
        }

        /* Rise Entrance Animations */
        .tf-paper-root .rise {
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
          TOP 2-COLUMN BANNER GRID: HERO CARD (3D BLUEPRINT FOLIO) + 4 STATS CARDS
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-top">
        {/* Left Hero Card with 3D Blueprint Document Stack */}
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
              ASSESSMENT PAPER ARCHITECT
            </div>

            {/* Animated Staggered Character Title */}
            <h1 className="hero-title" aria-label="Paper Designer">
              {'Paper Designer'.split('').map((ch, i) => (
                <span key={i} className="tfTitleChar" style={{ '--ci': i }}>
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              ))}
            </h1>

            <p className="text-xs text-[#a0a59e] max-w-[420px] leading-relaxed mb-6">
              Synthesize multi-section examination papers, calibrate mark distributions, preview candidate views, and publish verified assessments directly.
            </p>

            {/* Action Buttons & View Switcher */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                disabled={isPublishing}
                onClick={handlePublishLiveExam}
                className="px-5 py-2.5 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-xs font-black text-[#101112] shadow-sm transition-transform active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5 fill-current" />
                <span>{isPublishing ? 'Publishing...' : 'Publish Live Exam'}</span>
              </button>

              <button
                type="button"
                disabled={isSavingDraft}
                onClick={handleSaveDraft}
                className="px-4 py-2.5 rounded-full bg-[#1c1d22] hover:bg-[#252830] text-xs font-bold text-white border border-[#30333d] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5 text-[#a0a59e]" />
                <span>{isSavingDraft ? 'Saving...' : 'Save Draft'}</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2.5 rounded-full bg-[#1c1d22] hover:bg-[#252830] text-xs font-bold text-white border border-[#30333d] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5 text-[#a0a59e]" />
                <span>Print / PDF</span>
              </button>
            </div>
          </div>

          {/* Footer Telemetry Strip */}
          <div className="pt-4 border-t border-[#23252a] flex items-center gap-5 text-xs text-[#8c9289] font-mono relative z-10 flex-wrap">
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={calculation.totalQuestions} /></b> questions
            </span>
            <span>
              <b className="text-[#EDFF72] font-sans text-sm"><AnimatedCount value={calculation.totalAllocatedMarks} /></b>/{calculation.targetMarks} marks
            </span>
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={sections.length} /></b> sections
            </span>
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={durationMinutes} /></b> mins
            </span>
          </div>

          {/* 3D Blueprint Document Folio Stage with Cursor Gyro Tilt */}
          <div className="stage" aria-hidden="true">
            <div className="float">
              <div className="tilt" ref={tiltRef}>
                <div className="paper-stack">
                  <div className="sheet sheet-3" />
                  <div className="sheet sheet-2" />
                  <div className="sheet sheet-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[7px] font-black text-[#171819] uppercase">TESTFORGE</span>
                      <span className="text-[7px] font-mono text-[#777D78]">{courseCode}</span>
                    </div>
                    <div className="sheet-line w-full bg-[#171819]" />
                    <div className="sheet-line w-3/4" />
                    <div className="sheet-line w-full" />
                    <div className="sheet-line w-5/6" />
                    <div className="sheet-line w-2/3" />
                    <div className="sheet-line w-full" />
                    <div className="sheet-line w-4/5" />
                    <div className="sheet-stamp">100% PASS</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="shadow" />
          </div>
        </section>

        {/* Right 2x2 Telemetry Cards Grid */}
        <div className="tf-quad">
          {/* Card 1: Total Questions */}
          <div className="tf-card tf-mini rise" style={{ '--k': 2 }}>
            <div className="tf-tile">
              <Layers className="w-4 h-4 text-[#171819]" />
            </div>
            <div className="tf-cap">Total Questions</div>
            <div className="tf-big">
              <AnimatedCount value={calculation.totalQuestions} />
            </div>
            <div className="tf-sub">
              {sections.length} active sections assembled
            </div>
          </div>

          {/* Card 2: Marks Allocated */}
          <div className="tf-card tf-mini rise" style={{ '--k': 3 }}>
            <div className="flex items-center justify-between">
              <div className="tf-tile">
                <Award className="w-4 h-4 text-[#171819]" />
              </div>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  calculation.isBalanced
                    ? 'bg-emerald-100 text-emerald-800'
                    : calculation.isOverAllocated
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {calculation.isBalanced ? 'Balanced' : calculation.isOverAllocated ? 'Over' : 'Deficit'}
              </span>
            </div>
            <div className="tf-cap">Marks Allocated</div>
            <div className="tf-big">
              <AnimatedCount value={calculation.totalAllocatedMarks} />
              <span className="text-base text-[#777D78] font-normal"> / {calculation.targetMarks}</span>
            </div>
            <div className="tf-sub">
              {calculation.progressPercent}% of target weight
            </div>
          </div>

          {/* Card 3: Duration */}
          <div className="tf-card tf-mini rise" style={{ '--k': 4 }}>
            <div className="tf-tile">
              <Clock className="w-4 h-4 text-[#171819]" />
            </div>
            <div className="tf-cap">Exam Duration</div>
            <div className="tf-big">
              <AnimatedCount value={durationMinutes} />
              <span className="text-base text-[#777D78] font-normal">m</span>
            </div>
            <div className="tf-sub">
              {calculation.totalQuestions > 0
                ? `~${(durationMinutes / calculation.totalQuestions).toFixed(1)} min per question`
                : 'Pacing not calibrated'}
            </div>
          </div>

          {/* Card 4: Proctoring Mode */}
          <div className="tf-card tf-mini rise" style={{ '--k': 5 }}>
            <div className="flex items-center justify-between">
              <div className="tf-tile">
                <ShieldCheck className="w-4 h-4 text-[#171819]" />
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" />
            </div>
            <div className="tf-cap">Proctoring Mode</div>
            <div className="tf-big text-lg font-bold truncate leading-snug">
              {proctoringMode.split(' ')[0]}
            </div>
            <div className="tf-sub truncate">
              {courseCode} • {courseTitle.slice(0, 18)}...
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          VIEW MODE TOGGLE STRIP
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-6 bg-white border border-[#DDE1DA] rounded-[24px] p-3 shadow-xs flex-wrap">
        <div className="flex items-center gap-1.5 p-1 bg-[#F2F3F0] rounded-full border border-[#DDE1DA]">
          <button
            type="button"
            onClick={() => setViewMode('designer')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'designer'
                ? 'bg-[#101112] text-white shadow-xs'
                : 'text-[#777D78] hover:text-[#171819]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Paper Designer</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('preview_student')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'preview_student'
                ? 'bg-[#101112] text-white shadow-xs'
                : 'text-[#777D78] hover:text-[#171819]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Student Preview</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('teacher_key')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'teacher_key'
                ? 'bg-[#101112] text-white shadow-xs'
                : 'text-[#777D78] hover:text-[#171819]'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Teacher Master Key</span>
          </button>
        </div>

        {/* Quick Summary Pill on Right */}
        <div className="flex items-center gap-3 text-xs pr-2">
          <span className="text-[#777D78] font-bold">Paper Status:</span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 ${
              calculation.isBalanced
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}
          >
            {calculation.isBalanced ? <Check className="w-3 h-3 stroke-[3]" /> : <AlertTriangle className="w-3 h-3" />}
            <span>{calculation.isBalanced ? 'Target Reached (100%)' : `${calculation.remainingMarks} marks remaining`}</span>
          </span>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between animate-fadeIn">
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
          VIEW MODE 1: PAPER DESIGNER WORKSPACE (2-COLUMN ARCHITECTURE)
          ──────────────────────────────────────────────────────────────────────────── */}
      {viewMode === 'designer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ══════════════════════════════════════════════════════════════════════════
              LEFT DRAWER: ASSESSMENT SETTINGS & QUESTION BANK VAULT (4 cols)
              ══════════════════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-4 space-y-6">
            {/* CARD 1: ASSESSMENT SETTINGS */}
            <div className="tf-card p-6">
              <div className="flex items-center gap-2 mb-1">
                <SlidersHorizontal className="w-4 h-4 text-[#171819]" />
                <h3 className="text-sm font-black text-[#171819]">Assessment Settings</h3>
              </div>
              <p className="text-[11px] text-[#777D78] mb-4">
                Configure course metadata, duration, and proctoring constraints.
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
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] focus:outline-none focus:border-[#101112]"
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
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] focus:outline-none focus:border-[#101112]"
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
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] focus:outline-none focus:border-[#101112]"
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
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-semibold text-[#171819] focus:outline-none focus:border-[#101112]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#171819] mb-1">Target Total Marks</label>
                    <input
                      type="number"
                      min="1"
                      value={targetMarks}
                      onChange={(e) => setTargetMarks(e.target.value)}
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-black text-[#171819] focus:outline-none focus:border-[#101112]"
                    />
                  </div>
                </div>

                {/* Proctoring Mode */}
                <div>
                  <label className="block text-[11px] font-bold text-[#171819] mb-1">Proctoring Mode</label>
                  <select
                    value={proctoringMode}
                    onChange={(e) => setProctoringMode(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer"
                  >
                    <option value="No Proctoring">No Proctoring</option>
                    <option value="Fullscreen Lock">Fullscreen Lock</option>
                    <option value="Webcam Monitoring">Webcam Monitoring</option>
                    <option value="Strict Proctoring">Strict Proctoring (Webcam + Screen + Tab)</option>
                  </select>
                </div>

                {/* Candidate Instructions */}
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

            {/* CARD 2: QUESTION BANK REPOSITORY VAULT */}
            <div className="tf-card p-6">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#171819]" />
                  <h3 className="text-sm font-black text-[#171819]">Question Bank Vault</h3>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#F2F3F0] text-[#777D78]">
                  {filteredRepositoryQuestions.length} available
                </span>
              </div>
              <p className="text-[11px] text-[#777D78] mb-3">
                Select verified MCQs and coding problems to add directly into paper sections.
              </p>

              {/* Target Section Selection */}
              <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] mb-3 text-xs flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#171819] shrink-0">Insert into:</span>
                <select
                  value={targetSectionForInsert}
                  onChange={(e) => setTargetSectionForInsert(e.target.value)}
                  className="bg-white border border-[#DDE1DA] rounded-xl px-3 py-1.5 text-xs font-bold text-[#171819] focus:outline-none max-w-[190px] truncate cursor-pointer shadow-2xs"
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
                    placeholder="Search questions, topics, algorithms..."
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-full pl-8 pr-3 py-1.5 text-xs font-semibold text-[#171819] focus:outline-none focus:border-[#101112]"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <select
                    value={bankTypeFilter}
                    onChange={(e) => setBankTypeFilter(e.target.value)}
                    className="flex-1 bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-[#171819] focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Types</option>
                    <option value="mcq">MCQ Only</option>
                    <option value="coding">Coding Only</option>
                  </select>

                  <select
                    value={bankDifficultyFilter}
                    onChange={(e) => setBankDifficultyFilter(e.target.value)}
                    className="flex-1 bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-[#171819] focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Difficulties</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* Scrollable Questions List */}
              <div className="max-h-[420px] overflow-y-auto space-y-2.5 pr-1">
                {filteredRepositoryQuestions.map((q) => {
                  const inPaper = isQuestionInPaper(q.id);
                  return (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-2xl border border-[#DDE1DA] bg-white hover:border-[#101112]/40 transition-all text-xs flex flex-col justify-between gap-2.5 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase ${
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

                        <span className="font-mono text-xs font-black text-[#171819] shrink-0 bg-[#F2F3F0] px-2 py-0.5 rounded-lg">
                          {q.defaultMarks}m
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1.5 border-t border-[#DDE1DA]/60">
                        {inPaper ? (
                          <span className="text-[10px] font-black text-emerald-700 flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>In Paper</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#777D78]">Available</span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleAddQuestionToSection(q)}
                          className="px-3 py-1 rounded-full bg-[#F2F3F0] hover:bg-[#EDFF72] text-[11px] font-black text-[#171819] transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════════
              RIGHT CANVAS: PAPER SECTIONS & INTERACTIVE ASSEMBLER (8 cols)
              ══════════════════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-8 space-y-6">
            {/* CARD 1: PAPER SECTIONS & ORDERING */}
            <div className="tf-card p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-[#DDE1DA]/80">
                <div>
                  <h3 className="text-base font-black text-[#171819]">
                    Paper Sections & Question Assembler
                  </h3>
                  <p className="text-xs text-[#777D78]">
                    Configure section headers, re-order questions, and calibrate points per problem.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenAddSection}
                    className="px-4 py-2 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-xs font-black text-[#101112] flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Section</span>
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
                      className="border border-[#DDE1DA] rounded-[24px] overflow-hidden bg-white shadow-2xs transition-all hover:border-[#101112]/20"
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
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white text-[#777D78] border border-[#DDE1DA]">
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
                          <span className="font-black font-mono text-xs text-[#171819] px-3 py-1 rounded-full bg-white border border-[#DDE1DA]">
                            Subtotal: {secMarks} Marks
                          </span>

                          <button
                            type="button"
                            onClick={() => handleOpenEditSection(sec)}
                            title="Edit Section Details"
                            className="p-1.5 rounded-xl text-[#777D78] hover:text-[#171819] hover:bg-white transition-colors cursor-pointer border border-transparent hover:border-[#DDE1DA]"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteSection(sec.id)}
                            title="Delete Section"
                            className="p-1.5 rounded-xl text-[#777D78] hover:text-rose-600 hover:bg-white transition-colors cursor-pointer border border-transparent hover:border-[#DDE1DA]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Section Content & Ordered Question Rows */}
                      {!sec.collapsed && (
                        <div className="p-4 space-y-2.5">
                          {sec.items.length === 0 ? (
                            <div className="text-center py-10 border border-dashed border-[#DDE1DA] rounded-2xl bg-[#F2F3F0]/40">
                              <p className="text-xs text-[#777D78] font-bold">
                                No questions in this section yet.
                              </p>
                              <p className="text-[11px] text-[#777D78] mt-1">
                                Click "+ Add" on any question from the Question Bank Vault on the left.
                              </p>
                            </div>
                          ) : (
                            sec.items.map((item, itIdx) => (
                              <div
                                key={item.id}
                                className="p-3.5 rounded-2xl border border-[#DDE1DA] bg-white hover:border-[#101112]/40 transition-all flex items-center justify-between gap-3 text-xs shadow-2xs"
                              >
                                {/* Left Item Info */}
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="font-mono text-xs font-black text-[#777D78] w-6 shrink-0 text-center">
                                    Q{itIdx + 1}
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
                                <div className="flex items-center gap-2.5 shrink-0">
                                  {/* Marks Input */}
                                  <div className="flex items-center gap-1.5 bg-[#F2F3F0] rounded-xl px-2.5 py-1 border border-[#DDE1DA]">
                                    <span className="text-[10px] font-bold text-[#777D78]">Marks:</span>
                                    <input
                                      type="number"
                                      min="1"
                                      max="50"
                                      value={item.marks}
                                      onChange={(e) => handleUpdateItemMarks(sec.id, item.id, e.target.value)}
                                      className="w-10 bg-transparent text-center font-black text-xs text-[#171819] focus:outline-none"
                                    />
                                  </div>

                                  {/* Reorder Buttons */}
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      disabled={itIdx === 0}
                                      onClick={() => handleMoveItem(sec.id, itIdx, 'up')}
                                      title="Move Up"
                                      className="p-1 rounded-lg text-[#777D78] hover:text-[#171819] hover:bg-[#F2F3F0] disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={itIdx === sec.items.length - 1}
                                      onClick={() => handleMoveItem(sec.id, itIdx, 'down')}
                                      title="Move Down"
                                      className="p-1 rounded-lg text-[#777D78] hover:text-[#171819] hover:bg-[#F2F3F0] disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {/* Remove Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(sec.id, item.id)}
                                    title="Remove from Paper"
                                    className="p-1 rounded-lg text-[#777D78] hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
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

            {/* CARD 2: PAPER SUMMARY & MARK ALLOCATION CALIBRATION */}
            <div className="tf-card p-6">
              <h4 className="text-xs font-black text-[#171819] uppercase tracking-wider mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#171819]" />
                <span>Paper Calibration & Weight Distribution</span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs mb-4">
                <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA]">
                  <span className="text-[10px] text-[#777D78] font-bold block uppercase">Total Sections</span>
                  <span className="text-xl font-black text-[#171819]">{sections.length}</span>
                </div>
                <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA]">
                  <span className="text-[10px] text-[#777D78] font-bold block uppercase">Total Questions</span>
                  <span className="text-xl font-black text-[#171819]">{calculation.totalQuestions}</span>
                </div>
                <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA]">
                  <span className="text-[10px] text-[#777D78] font-bold block uppercase">Allocated Marks</span>
                  <span className="text-xl font-black text-[#171819]">
                    {calculation.totalAllocatedMarks} <span className="text-xs text-[#777D78] font-normal">/ {calculation.targetMarks}</span>
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA]">
                  <span className="text-[10px] text-[#777D78] font-bold block uppercase">Status</span>
                  <span
                    className={`text-xs font-black inline-block mt-1 ${
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
                      ? 'bg-[#101112]'
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
        <div className="tf-card p-10 max-w-4xl mx-auto shadow-sm space-y-6 animate-fadeIn">
          {/* Header */}
          <div className="text-center pb-6 border-b border-[#DDE1DA] space-y-2">
            <span className="text-[11px] font-mono font-extrabold tracking-widest text-[#777D78] uppercase">
              STUDENT EXAMINATION VIEW
            </span>
            <h2 className="text-2xl font-black text-[#171819]">{examTitle}</h2>
            <div className="flex items-center justify-center gap-4 text-xs font-bold text-[#777D78] flex-wrap">
              <span>Course: {courseTitle} ({courseCode})</span>
              <span>•</span>
              <span>Duration: {durationMinutes} Minutes</span>
              <span>•</span>
              <span>Maximum Marks: {calculation.totalAllocatedMarks}</span>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-[#F2F3F0] rounded-2xl p-5 border border-[#DDE1DA] text-xs space-y-2 leading-relaxed">
            <span className="font-black text-[#171819] block uppercase tracking-wider text-[11px]">Instructions to Candidates:</span>
            <pre className="font-sans whitespace-pre-wrap text-[#171819] leading-relaxed">{candidateInstructions}</pre>
          </div>

          {/* Sections & Questions */}
          <div className="space-y-8 pt-2">
            {sections.map((sec, secIdx) => (
              <div key={sec.id} className="space-y-4">
                <div className="pb-2 border-b-2 border-[#101112]">
                  <h3 className="text-sm font-black text-[#171819] uppercase tracking-wide">
                    {sec.title}
                  </h3>
                  <p className="text-xs text-[#777D78] mt-0.5">{sec.instructions}</p>
                </div>

                <div className="space-y-5">
                  {sec.items.map((item, itIdx) => (
                    <div key={item.id} className="p-5 rounded-2xl bg-[#F2F3F0]/60 border border-[#DDE1DA] space-y-3.5">
                      <div className="flex items-start justify-between gap-3 text-xs">
                        <span className="font-black text-[#171819] text-sm">
                          Q{itIdx + 1}. {item.title}
                        </span>
                        <span className="font-mono font-bold text-[#777D78] shrink-0 bg-white px-2.5 py-1 rounded-lg border border-[#DDE1DA]">
                          [{item.marks} Marks]
                        </span>
                      </div>

                      {/* MCQ Choices */}
                      {item.type === 'mcq' && item.data && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-[#DDE1DA] cursor-pointer hover:bg-[#F2F3F0] transition-colors">
                            <input type="radio" name={`q-${item.id}`} className="text-[#101112]" />
                            <span className="font-semibold">A. {item.data.optionA}</span>
                          </label>
                          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-[#DDE1DA] cursor-pointer hover:bg-[#F2F3F0] transition-colors">
                            <input type="radio" name={`q-${item.id}`} className="text-[#101112]" />
                            <span className="font-semibold">B. {item.data.optionB}</span>
                          </label>
                          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-[#DDE1DA] cursor-pointer hover:bg-[#F2F3F0] transition-colors">
                            <input type="radio" name={`q-${item.id}`} className="text-[#101112]" />
                            <span className="font-semibold">C. {item.data.optionC}</span>
                          </label>
                          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-[#DDE1DA] cursor-pointer hover:bg-[#F2F3F0] transition-colors">
                            <input type="radio" name={`q-${item.id}`} className="text-[#101112]" />
                            <span className="font-semibold">D. {item.data.optionD}</span>
                          </label>
                        </div>
                      )}

                      {/* Coding statement */}
                      {item.type === 'coding' && item.data && (
                        <div className="text-xs text-[#171819] bg-white p-4 rounded-xl border border-[#DDE1DA] whitespace-pre-wrap leading-relaxed font-sans">
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
              className="px-6 py-2.5 rounded-full bg-[#101112] text-white text-xs font-bold cursor-pointer hover:bg-black transition-colors"
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
        <div className="tf-card p-10 max-w-4xl mx-auto shadow-sm space-y-6 animate-fadeIn">
          <div className="pb-4 border-b border-[#DDE1DA] flex items-center justify-between">
            <div>
              <span className="text-[11px] font-mono font-extrabold tracking-widest text-[#777D78] uppercase">
                TEACHER MASTER ANSWER KEY (CONFIDENTIAL)
              </span>
              <h2 className="text-2xl font-black text-[#171819]">{examTitle}</h2>
            </div>
            <span className="px-3.5 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black">
              Verified Key
            </span>
          </div>

          <div className="space-y-6">
            {sections.map((sec) => (
              <div key={sec.id} className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#777D78]">{sec.title}</h3>
                {sec.items.map((item, i) => (
                  <div key={item.id} className="p-4 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-[#171819]">
                      <span>Q{i + 1}. {item.title}</span>
                      <span className="font-mono text-[#777D78]">[{item.marks} Marks]</span>
                    </div>

                    {item.type === 'mcq' && item.data && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
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
                      <div className="p-3 rounded-xl bg-white border border-[#DDE1DA] font-mono text-[11px] text-[#171819]">
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
              className="px-6 py-2.5 rounded-full bg-[#101112] text-white text-xs font-bold cursor-pointer hover:bg-black transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101112]/60 backdrop-blur-xs animate-fadeIn">
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
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs text-[#171819] focus:outline-none resize-none font-sans"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-[#DDE1DA]/60">
                <button
                  type="button"
                  onClick={() => setIsAddSectionModalOpen(false)}
                  className="px-4 py-2 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] text-xs font-bold text-[#171819] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-xs font-black text-[#101112] shadow-xs cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101112]/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-[32px] border border-[#DDE1DA] max-w-md w-full p-6 shadow-2xl animate-scaleUp text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-black text-[#171819]">Exam Published Successfully!</h3>
            <p className="text-xs text-[#777D78] mt-1">
              Your assessment paper is now live and candidates can join using the unique access code.
            </p>

            <div className="my-5 p-4 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#777D78]">
                Student Access Code
              </span>
              <div className="text-2xl font-black font-mono tracking-widest text-[#101112]">
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
                className="px-4 py-2 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] text-xs font-bold text-[#171819] cursor-pointer"
              >
                Copy Code
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPublishModalOpen(false);
                  if (onNavigateToExams) onNavigateToExams();
                }}
                className="px-5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-xs font-black text-[#101112] shadow-xs cursor-pointer flex items-center gap-1.5"
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

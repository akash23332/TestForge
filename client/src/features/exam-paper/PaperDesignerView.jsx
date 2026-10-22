import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import {
  Clock,
  Award,
  CheckCircle2,
  Eye,
  Lock,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Search,
  Code2,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  Layers,
  Settings2,
  Printer,
  Download,
  FileText
} from 'lucide-react';

export const PaperDesignerView = ({ questions: initialCodingQuestions = [] }) => {
  // ── Exam Metadata Header ───────────────────────────────────────────────
  const [examTitle, setExamTitle] = useState('Data Structures & Algorithms - Mid-Semester Online Test');
  const [courseCode, setCourseCode] = useState('CS204');
  const [courseTitle, setCourseTitle] = useState('Advanced Data Structures & Algorithms');
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [targetMarks, setTargetMarks] = useState(50);
  const [proctoringLevel, setProctoringLevel] = useState('Strict (Webcam + Screen + Tab Detection)');
  const [generalInstructions, setGeneralInstructions] = useState(
    '1. Answer all questions according to instructions in each section.\n2. In coding problems, adhere strictly to specified time and memory complexity.\n3. In MCQs, each question has exactly one correct choice. Negative marking: 0.25.\n4. Switching browser tabs or exiting fullscreen will be recorded by the proctoring engine.'
  );

  // ── Questions Repositories ─────────────────────────────────────────────
  const [codingBank, setCodingBank] = useState(initialCodingQuestions);
  const [mcqBank, setMcqBank] = useState([]);
  const [isLoadingBank, setIsLoadingBank] = useState(false);
  const [searchBankQuery, setSearchBankQuery] = useState('');
  const [bankTypeFilter, setBankTypeFilter] = useState('all');
  const [bankDifficultyFilter, setBankDifficultyFilter] = useState('all');

  // ── Paper Structure & Sections ─────────────────────────────────────────
  const [sections, setSections] = useState([
    {
      id: 'sec-a',
      title: 'Section A: Multiple Choice Questions',
      instructions: 'Each question carries 2 marks. Choose the single most appropriate option.',
      defaultMarks: 2,
      items: []
    },
    {
      id: 'sec-b',
      title: 'Section B: Problem Solving & Algorithm Implementation',
      instructions: 'Each question carries 10 marks. Implement the solution function adhering to given time/memory limits.',
      defaultMarks: 10,
      items: []
    }
  ]);

  // ── Active View Mode: 'designer' | 'preview_student' | 'teacher_eval' ──
  const [viewMode, setViewMode] = useState('designer');
  const [activeSectionId, setActiveSectionId] = useState('sec-a');

  // ── Load Bank Data ─────────────────────────────────────────────────────
  const fetchAllBankData = async () => {
    setIsLoadingBank(true);
    try {
      const qRes = await api.get('/questions?limit=100');
      const codingItems = qRes.data?.data || [];
      setCodingBank(codingItems);

      const mcqRes = await api.get('/mcq/saved');
      const mcqItems = mcqRes.data?.data?.items || [];
      setMcqBank(mcqItems);

      // Pre-populate if empty
      setSections((prev) => {
        if (prev.some((s) => s.items.length > 0)) return prev;
        const next = [...prev];
        if (mcqItems.length > 0 && next[0]) {
          next[0].items = mcqItems.slice(0, 4).map((m) => ({
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
      console.error('Failed to load bank data:', err);
    } finally {
      setIsLoadingBank(false);
    }
  };

  useEffect(() => {
    fetchAllBankData();
  }, []);

  // ── Calculation Utilities ──────────────────────────────────────────────
  const calculateTotalMarks = () => {
    return sections.reduce((total, sec) => {
      return total + sec.items.reduce((secTotal, item) => secTotal + (Number(item.marks) || 0), 0);
    }, 0);
  };

  const calculateTotalQuestions = () => {
    return sections.reduce((total, sec) => total + sec.items.length, 0);
  };

  // ── Section & Question Actions ─────────────────────────────────────────
  const handleAddSection = () => {
    const nextChar = String.fromCharCode(65 + sections.length);
    const newSection = {
      id: `sec-${Date.now()}`,
      title: `Section ${nextChar}: Additional Questions`,
      instructions: 'Answer all questions in this online section.',
      defaultMarks: 5,
      items: []
    };
    setSections([...sections, newSection]);
    setActiveSectionId(newSection.id);
  };

  const handleDeleteSection = (secId) => {
    if (sections.length <= 1) {
      alert('Paper must have at least one section.');
      return;
    }
    if (!confirm('Are you sure you want to delete this section?')) return;
    setSections(sections.filter((s) => s.id !== secId));
    setActiveSectionId(sections[0].id);
  };

  const handleUpdateSection = (secId, field, val) => {
    setSections(
      sections.map((s) => (s.id === secId ? { ...s, [field]: val } : s))
    );
  };

  const handleAddQuestionToSection = (item, type, secId = activeSectionId) => {
    const targetSection = sections.find((s) => s.id === secId) || sections[0];
    if (!targetSection) return;

    const alreadyExists = sections.some((s) =>
      s.items.some((i) => i.id === (item._id || item.id))
    );
    if (alreadyExists) {
      alert(`"${item.title || item.question}" is already in this paper.`);
      return;
    }

    const newItem = {
      type,
      id: item._id || item.id,
      title: item.title || item.question,
      data: item,
      marks: targetSection.defaultMarks || (type === 'mcq' ? 2 : 10)
    };

    setSections(
      sections.map((s) =>
        s.id === targetSection.id ? { ...s, items: [...s.items, newItem] } : s
      )
    );
  };

  const handleRemoveItem = (secId, itemId) => {
    setSections(
      sections.map((s) =>
        s.id === secId ? { ...s, items: s.items.filter((i) => i.id !== itemId) } : s
      )
    );
  };

  const handleMoveUp = (secId, itemIndex) => {
    if (itemIndex <= 0) return;
    setSections(
      sections.map((s) => {
        if (s.id !== secId) return s;
        const newItems = [...s.items];
        const temp = newItems[itemIndex];
        newItems[itemIndex] = newItems[itemIndex - 1];
        newItems[itemIndex - 1] = temp;
        return { ...s, items: newItems };
      })
    );
  };

  const handleMoveDown = (secId, itemIndex) => {
    if (itemIndex >= sections.find((s) => s.id === secId).items.length - 1) return;
    setSections(
      sections.map((s) => {
        if (s.id !== secId) return s;
        const newItems = [...s.items];
        const temp = newItems[itemIndex];
        newItems[itemIndex] = newItems[itemIndex + 1];
        newItems[itemIndex + 1] = temp;
        return { ...s, items: newItems };
      })
    );
  };

  const handleItemMarksChange = (secId, itemId, newMarks) => {
    setSections(
      sections.map((s) => {
        if (s.id !== secId) return s;
        return {
          ...s,
          items: s.items.map((i) =>
            i.id === itemId ? { ...i, marks: Number(newMarks) || 0 } : i
          )
        };
      })
    );
  };

  // Filter Bank
  const filteredBankItems = () => {
    let list = [];
    if (bankTypeFilter === 'all' || bankTypeFilter === 'coding') {
      list = list.concat(codingBank.map((q) => ({ ...q, _itemType: 'coding' })));
    }
    if (bankTypeFilter === 'all' || bankTypeFilter === 'mcq') {
      list = list.concat(mcqBank.map((m) => ({ ...m, _itemType: 'mcq' })));
    }

    return list.filter((item) => {
      const qText = (item.title || item.question || '').toLowerCase();
      const topic = (item.topic || (item.tags ? item.tags.join(' ') : '')).toLowerCase();
      const matchesSearch = !searchBankQuery || qText.includes(searchBankQuery.toLowerCase()) || topic.includes(searchBankQuery.toLowerCase());
      const matchesDiff = bankDifficultyFilter === 'all' || item.difficulty === bankDifficultyFilter;
      return matchesSearch && matchesDiff;
    });
  };

  // ── Export to Text Format ─────────────────────────────────────────────
  const generateExportText = (isTeacherKey = false) => {
    let out = `========================================================================\n`;
    out += `ONLINE ASSESSMENT: ${examTitle.toUpperCase()}\n`;
    out += `COURSE: ${courseCode} - ${courseTitle}\n`;
    out += `DURATION: ${durationMinutes} Minutes | TOTAL MARKS: ${calculateTotalMarks()} Marks\n`;
    out += `PROCTORING MODE: ${proctoringLevel}\n`;
    out += `========================================================================\n\n`;

    if (!isTeacherKey) {
      out += `ONLINE INSTRUCTIONS:\n${generalInstructions}\n\n`;
    } else {
      out += `*** FACULTY CONFIDENTIAL MASTER ANSWER KEY & AUTO-GRADING SCHEME ***\n`;
      out += `Strictly confidential. Contains reference solutions & correct answers.\n\n`;
    }

    let globalQNum = 1;

    sections.forEach((sec) => {
      out += `------------------------------------------------------------------------\n`;
      out += `${sec.title.toUpperCase()}\n`;
      out += `Instructions: ${sec.instructions}\n`;
      out += `------------------------------------------------------------------------\n\n`;

      sec.items.forEach((item) => {
        if (item.type === 'mcq') {
          out += `Q${globalQNum}. [${item.marks} Marks] ${item.data.question}\n`;
          out += `  A) ${item.data.optionA}\n`;
          out += `  B) ${item.data.optionB}\n`;
          out += `  C) ${item.data.optionC}\n`;
          out += `  D) ${item.data.optionD}\n`;

          if (isTeacherKey) {
            out += `  >>> MASTER KEY: [${item.data.correctAnswer}]\n`;
            if (item.data.explanation) {
              out += `  >>> EXPLANATION: ${item.data.explanation}\n`;
            }
          }
          out += `\n`;
        } else {
          out += `Q${globalQNum}. [${item.marks} Marks] ${item.data.title} (${item.data.difficulty || 'Medium'} • ${item.data.language || 'Java'})\n`;
          out += `PROBLEM STATEMENT:\n${item.data.statement}\n\n`;
          if (item.data.constraints) {
            out += `CONSTRAINTS:\n${item.data.constraints}\n\n`;
          }
          if (item.data.starterCode) {
            out += `REQUIRED FUNCTION SIGNATURE / STARTER TEMPLATE:\n${item.data.starterCode}\n\n`;
          }

          if (isTeacherKey) {
            out += `>>> VERIFIED REFERENCE SOLUTION:\n${item.data.referenceSolution || 'N/A'}\n\n`;
            out += `>>> AUTOMATED GRADING CRITERIA: Correct logic (70%), Time/Space limits (20%), Code quality (10%)\n\n`;
          }
        }
        globalQNum += 1;
      });
    });

    return out;
  };

  const handleDownloadTxt = (isTeacherKey = false) => {
    const text = generateExportText(isTeacherKey);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `${courseCode}_${examTitle.replace(/\s+/g, '_')}_${isTeacherKey ? 'Answer_Key' : 'Online_Paper'}.txt`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalCalculated = calculateTotalMarks();
  const totalQuestions = calculateTotalQuestions();

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Top Header Toolbar ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 rounded-3xl shadow-xs print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-0.5 bg-orange-600 rounded-full" />
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
              Online Assessment Suite
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Online Paper Designer
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Design multi-section online tests, configure MCQs & coding problems, and export structured assessment content.
          </p>
        </div>

        {/* View Mode Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              onClick={() => setViewMode('designer')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'designer'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Paper Designer
            </button>
            <button
              onClick={() => setViewMode('preview_student')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'preview_student'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              Student Paper Preview
            </button>
            <button
              onClick={() => setViewMode('teacher_eval')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'teacher_eval'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              Teacher Master Key
            </button>
          </div>

          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          MODE 1: PAPER DESIGNER & SECTION BUILDER
      ══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'designer' && (
        <div className="space-y-6">
          {/* Top Metrics Row */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px] block">Course & Code</span>
                <span className="font-extrabold text-slate-900">{courseCode}: {courseTitle}</span>
              </div>
              <div className="border-l border-slate-200 pl-6">
                <span className="text-slate-400 font-bold uppercase text-[10px] block">Duration</span>
                <span className="font-extrabold text-slate-900">{durationMinutes} Minutes</span>
              </div>
              <div className="border-l border-slate-200 pl-6">
                <span className="text-slate-400 font-bold uppercase text-[10px] block">Sections</span>
                <span className="font-extrabold text-slate-900">{sections.length} Online Modules</span>
              </div>
              <div className="border-l border-slate-200 pl-6">
                <span className="text-slate-400 font-bold uppercase text-[10px] block">Total Questions</span>
                <span className="font-extrabold text-slate-900">{totalQuestions} Questions</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Marks</span>
                <span className={`text-base font-black ${totalCalculated === targetMarks ? 'text-emerald-600' : 'text-orange-600'}`}>
                  {totalCalculated} / {targetMarks} Marks
                </span>
              </div>
              <Badge variant={totalCalculated === targetMarks ? 'success' : 'warning'}>
                {totalCalculated === targetMarks ? 'Target Matched' : `${Math.abs(targetMarks - totalCalculated)} Marks Difference`}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 4 Cols: Online Test Settings & Question Bank */}
            <div className="lg:col-span-4 space-y-6">
              {/* Exam Settings Card */}
              <Card title="Online Assessment Settings" subtitle="Title, duration & instructions">
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Assessment Title</label>
                    <input
                      type="text"
                      value={examTitle}
                      onChange={(e) => setExamTitle(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold focus:outline-none focus:border-orange-500 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Course Code</label>
                      <input
                        type="text"
                        value={courseCode}
                        onChange={(e) => setCourseCode(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-mono font-bold focus:outline-none focus:border-orange-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Duration (Mins)</label>
                      <input
                        type="number"
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-mono font-bold focus:outline-none focus:border-orange-500 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Course Title</label>
                      <input
                        type="text"
                        value={courseTitle}
                        onChange={(e) => setCourseTitle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold focus:outline-none focus:border-orange-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Target Total Marks</label>
                      <input
                        type="number"
                        value={targetMarks}
                        onChange={(e) => setTargetMarks(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-mono font-bold focus:outline-none focus:border-orange-500 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Proctoring Mode</label>
                    <select
                      value={proctoringLevel}
                      onChange={(e) => setProctoringLevel(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-medium"
                    >
                      <option value="Strict (Webcam + Screen + Tab Detection)">Strict (Webcam + Screen + Fullscreen Lock)</option>
                      <option value="Moderate (Tab Detection + Copy-Paste Block)">Moderate (Tab Detection + Copy-Paste Block)</option>
                      <option value="Practice (Open Access)">Practice (Open Access)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Candidate Instructions</label>
                    <textarea
                      rows={3}
                      value={generalInstructions}
                      onChange={(e) => setGeneralInstructions(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-xs font-medium focus:outline-none focus:border-orange-500 leading-relaxed resize-none"
                    />
                  </div>
                </div>
              </Card>

              {/* Question Repository Picker Card */}
              <Card title="Question Bank Repository" subtitle="Select MCQs & Coding problems to add">
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search bank..."
                      value={searchBankQuery}
                      onChange={(e) => setSearchBankQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <select
                      value={bankTypeFilter}
                      onChange={(e) => setBankTypeFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-medium"
                    >
                      <option value="all">All Types</option>
                      <option value="coding">Coding Only</option>
                      <option value="mcq">MCQs Only</option>
                    </select>

                    <select
                      value={bankDifficultyFilter}
                      onChange={(e) => setBankDifficultyFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-medium"
                    >
                      <option value="all">All Difficulties</option>
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 pt-1">
                    <span>Insert into Section:</span>
                    <select
                      value={activeSectionId}
                      onChange={(e) => setActiveSectionId(e.target.value)}
                      className="bg-orange-50 border border-orange-200 text-orange-800 rounded-lg px-2 py-0.5 text-[11px] font-bold focus:outline-none"
                    >
                      {sections.map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.title.split(':')[0]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bank list */}
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {isLoadingBank ? (
                      <div className="py-8 text-center text-xs text-slate-400">Loading bank repository...</div>
                    ) : filteredBankItems().length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">No matching questions found in bank.</div>
                    ) : (
                      filteredBankItems().map((item) => {
                        const isAlreadyAdded = sections.some((s) =>
                          s.items.some((i) => i.id === (item._id || item.id))
                        );

                        return (
                          <div
                            key={item._id || item.id}
                            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                              isAlreadyAdded
                                ? 'bg-slate-50 border-slate-200 opacity-60'
                                : 'bg-white border-slate-200 hover:border-orange-300 shadow-2xs'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span
                                  className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${
                                    item._itemType === 'mcq'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-sky-100 text-sky-800'
                                  }`}
                                >
                                  {item._itemType === 'mcq' ? 'MCQ' : 'Code'}
                                </span>
                                {item.difficulty && (
                                  <span className="text-[10px] text-slate-500">
                                    • {item.difficulty}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-bold text-slate-900 truncate">
                                {item.title || item.question}
                              </h4>
                            </div>

                            <button
                              disabled={isAlreadyAdded}
                              onClick={() => handleAddQuestionToSection(item, item._itemType, activeSectionId)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                                isAlreadyAdded
                                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                  : 'bg-orange-600 hover:bg-orange-500 text-white shadow-2xs'
                              }`}
                            >
                              {isAlreadyAdded ? 'Added' : '+ Add'}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* Right 8 Cols: Structured Sections Canvas */}
            <div className="lg:col-span-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Paper Sections & Ordering</h3>
                  <p className="text-xs text-slate-500">Re-order items, set instructions, and allocate marks per question</p>
                </div>
                <Button size="sm" onClick={handleAddSection} variant="secondary">
                  <Plus className="h-3.5 w-3.5" /> Add Section
                </Button>
              </div>

              <div className="space-y-6">
                {sections.map((section, secIdx) => {
                  const sectionMarks = section.items.reduce(
                    (tot, item) => tot + (Number(item.marks) || 0),
                    0
                  );

                  return (
                    <div
                      key={section.id}
                      className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="flex-1 space-y-1">
                          <input
                            type="text"
                            value={section.title}
                            onChange={(e) => handleUpdateSection(section.id, 'title', e.target.value)}
                            className="font-extrabold text-base text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-orange-500 focus:outline-none w-full"
                          />
                          <input
                            type="text"
                            value={section.instructions}
                            onChange={(e) => handleUpdateSection(section.id, 'instructions', e.target.value)}
                            placeholder="Section instructions for candidates..."
                            className="text-xs text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-orange-500 focus:outline-none w-full"
                          />
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Section Total</span>
                            <span className="text-sm font-black text-slate-900">{sectionMarks} Marks ({section.items.length} Qs)</span>
                          </div>
                          <button
                            onClick={() => handleDeleteSection(section.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {section.items.length === 0 ? (
                        <div className="py-8 border-2 border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400">
                          No questions in this section yet. Click "+ Add" on the left bank.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {section.items.map((item, itemIdx) => (
                            <div
                              key={item.id}
                              className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3 hover:border-slate-300 transition-all"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                                  {itemIdx + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${
                                        item.type === 'mcq' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
                                      }`}
                                    >
                                      {item.type === 'mcq' ? 'MCQ' : 'Coding'}
                                    </span>
                                    <span className="text-xs font-bold text-slate-900 truncate">
                                      {item.title}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-bold text-slate-500">Marks:</span>
                                  <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={item.marks}
                                    onChange={(e) => handleItemMarksChange(section.id, item.id, e.target.value)}
                                    className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono font-bold text-center text-slate-900"
                                  />
                                </div>

                                <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                                  <button
                                    disabled={itemIdx === 0}
                                    onClick={() => handleMoveUp(section.id, itemIdx)}
                                    className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    disabled={itemIdx === section.items.length - 1}
                                    onClick={() => handleMoveDown(section.id, itemIdx)}
                                    className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                <button
                                  onClick={() => handleRemoveItem(section.id, item.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          MODE 2 & 3: ONLINE PAPER PREVIEW (STUDENT) & TEACHER MASTER KEY
      ══════════════════════════════════════════════════════════════════════ */}
      {(viewMode === 'preview_student' || viewMode === 'teacher_eval') && (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xs print:hidden">
            <div className="flex items-center gap-3">
              <Badge variant={viewMode === 'preview_student' ? 'orange' : 'success'}>
                {viewMode === 'preview_student'
                  ? 'Student Online Paper (Zero Secrets Leaked)'
                  : 'Teacher Master Answer Key & Evaluation Rubric'}
              </Badge>
              <span className="text-xs text-slate-500">
                {viewMode === 'preview_student'
                  ? 'Candidate view: Problem statements, constraints, and starter signatures only.'
                  : 'Faculty confidential view: Master MCQ keys, verified reference solutions, and automated grading rules.'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleDownloadTxt(viewMode === 'teacher_eval')}
              >
                <Download className="h-3.5 w-3.5" /> Download (.txt / Word)
              </Button>

              <Button size="sm" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> Print / Save PDF
              </Button>
            </div>
          </div>

          {/* Formatted Assessment Paper Canvas */}
          <div className="bg-white border border-slate-300 rounded-3xl p-6 sm:p-12 shadow-lg text-slate-900 max-w-5xl mx-auto print:border-none print:shadow-none print:p-0 print:m-0 space-y-6">
            {/* Online Test Header */}
            <div className="border-b-2 border-slate-900 pb-5 text-center space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-orange-600 block">
                Online Computer-Based Assessment
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {examTitle}
              </h1>
              <div className="text-xs sm:text-sm font-semibold text-slate-700 flex flex-wrap items-center justify-center gap-4 pt-1">
                <span>Course: <strong>{courseCode} - {courseTitle}</strong></span>
                <span>•</span>
                <span>Duration: <strong>{durationMinutes} Minutes</strong></span>
                <span>•</span>
                <span>Total Marks: <strong>{totalCalculated} Marks</strong></span>
              </div>

              {viewMode === 'teacher_eval' && (
                <div className="mt-2 py-1 px-3 bg-rose-100 text-rose-800 rounded-lg text-xs font-black uppercase tracking-wider inline-block">
                  *** CONFIDENTIAL - TEACHER MASTER ANSWER KEY & AUTO-GRADING SCHEME ***
                </div>
              )}
            </div>

            {/* General Instructions */}
            {viewMode === 'preview_student' && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
                <span className="font-bold uppercase tracking-wider text-[11px] text-slate-700 block">
                  Online Assessment Instructions:
                </span>
                <div className="text-slate-600 whitespace-pre-wrap leading-relaxed">
                  {generalInstructions}
                </div>
              </div>
            )}

            {/* Sections Content */}
            <div className="space-y-8 divide-y divide-slate-200">
              {sections.map((section, secIdx) => (
                <div key={section.id} className="pt-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">{section.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{section.instructions}</p>
                    </div>
                    <span className="text-xs font-bold font-mono text-slate-700">
                      [{section.items.reduce((s, i) => s + (Number(i.marks) || 0), 0)} Marks]
                    </span>
                  </div>

                  <div className="space-y-6">
                    {section.items.map((item, qIdx) => (
                      <div key={item.id} className="space-y-3 text-xs leading-relaxed">
                        <div className="flex items-start justify-between gap-4 font-bold text-slate-900">
                          <span className="text-sm">
                            Q{qIdx + 1}. {item.title}
                          </span>
                          <span className="text-slate-600 font-mono text-xs shrink-0">
                            [{item.marks} {item.marks === 1 ? 'Mark' : 'Marks'}]
                          </span>
                        </div>

                        {item.type === 'mcq' ? (
                          /* MCQ Question */
                          <div className="pl-4 space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-medium">
                              <div
                                className={`p-2.5 rounded-xl border ${
                                  viewMode === 'teacher_eval' && item.data.correctAnswer === 'A'
                                    ? 'bg-emerald-50 border-emerald-400 font-bold text-emerald-950'
                                    : 'bg-slate-50 border-slate-200 text-slate-800'
                                }`}
                              >
                                (A) {item.data.optionA}
                              </div>
                              <div
                                className={`p-2.5 rounded-xl border ${
                                  viewMode === 'teacher_eval' && item.data.correctAnswer === 'B'
                                    ? 'bg-emerald-50 border-emerald-400 font-bold text-emerald-950'
                                    : 'bg-slate-50 border-slate-200 text-slate-800'
                                }`}
                              >
                                (B) {item.data.optionB}
                              </div>
                              <div
                                className={`p-2.5 rounded-xl border ${
                                  viewMode === 'teacher_eval' && item.data.correctAnswer === 'C'
                                    ? 'bg-emerald-50 border-emerald-400 font-bold text-emerald-950'
                                    : 'bg-slate-50 border-slate-200 text-slate-800'
                                }`}
                              >
                                (C) {item.data.optionC}
                              </div>
                              <div
                                className={`p-2.5 rounded-xl border ${
                                  viewMode === 'teacher_eval' && item.data.correctAnswer === 'D'
                                    ? 'bg-emerald-50 border-emerald-400 font-bold text-emerald-950'
                                    : 'bg-slate-50 border-slate-200 text-slate-800'
                                }`}
                              >
                                (D) {item.data.optionD}
                              </div>
                            </div>

                            {viewMode === 'teacher_eval' && (
                              <div className="mt-2 p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-emerald-900 text-[11px]">
                                <span className="font-bold">Correct Master Key: [{item.data.correctAnswer}]</span>
                                {item.data.explanation && (
                                  <p className="mt-0.5 text-emerald-800 font-normal">
                                    <strong>Explanation:</strong> {item.data.explanation}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Coding Question */
                          <div className="pl-4 space-y-3">
                            <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                              {item.data.statement}
                            </div>

                            {item.data.constraints && (
                              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 font-mono">
                                <span className="font-sans font-bold block text-slate-800 mb-0.5">Constraints:</span>
                                {item.data.constraints}
                              </div>
                            )}

                            {item.data.starterCode && (
                              <div>
                                <span className="font-bold text-[11px] text-slate-700 block mb-1">
                                  Required Function Signature / Starter Template:
                                </span>
                                <pre className="p-3 rounded-xl bg-slate-100 text-slate-900 font-mono text-[11px] overflow-x-auto border border-slate-200">
                                  {item.data.starterCode}
                                </pre>
                              </div>
                            )}

                            {viewMode === 'teacher_eval' && (
                              <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-2xl text-purple-950 space-y-2">
                                <div className="flex items-center gap-1.5 font-bold text-xs text-purple-900">
                                  <Lock className="h-3.5 w-3.5" /> Confidential Teacher Reference Solution:
                                </div>
                                <pre className="p-3 rounded-xl bg-slate-900 text-purple-200 font-mono text-[11px] overflow-x-auto shadow-inner">
                                  {item.data.referenceSolution || '// No reference solution recorded'}
                                </pre>
                                <div className="text-[11px] text-purple-800">
                                  <strong>Automated Solution Evaluation:</strong> Solution validated against public + hidden grading test cases.
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-slate-900 mt-10 pt-4 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
              --- END OF ONLINE ASSESSMENT PAPER ---
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaperDesignerView;

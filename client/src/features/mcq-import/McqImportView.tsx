import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  Plus,
  Trash2,
  Edit2,
  Loader2,
  X
} from 'lucide-react';

export interface McqItem {
  _id?: string;
  id?: string;
  rowNumber?: number;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string; // 'A' | 'B' | 'C' | 'D'
  marks: number;
  topic: string;
  explanation?: string;
}

export const McqImportView: React.FC = () => {
  // Questions in the current batch / database
  const [questions, setQuestions] = useState<McqItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form input states
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('A');
  const [marks, setMarks] = useState(2);
  const [topic, setTopic] = useState('Computer Science');
  const [explanation, setExplanation] = useState('');

  // Notifications
  const [notice, setNotice] = useState<string | null>(null);

  // ── Fetch Saved Questions from MongoDB on Mount ─────────────────────────
  const fetchQuestions = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/mcq/saved');
      const items = res.data?.data?.items || [];
      setQuestions(items.map((q: any, idx: number) => ({ ...q, rowNumber: idx + 1 })));
    } catch (err) {
      console.error('Failed to load MCQs from MongoDB:', err);
      setQuestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  // ── Save or Update Question Directly to MongoDB ─────────────────────────
  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) {
      alert('Please enter a question statement.');
      return;
    }
    if (!optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) {
      alert('Please provide all 4 options (A, B, C, D).');
      return;
    }

    const itemPayload = {
      question: questionText.trim(),
      optionA: optionA.trim(),
      optionB: optionB.trim(),
      optionC: optionC.trim(),
      optionD: optionD.trim(),
      correctAnswer: correctAnswer.toUpperCase(),
      marks: Number(marks) || 1,
      topic: topic.trim() || 'General',
      explanation: explanation.trim()
    };

    setIsSubmitting(true);
    try {
      if (editingIndex !== null) {
        // Update existing in MongoDB
        const existing = questions[editingIndex];
        const questionId = existing?._id || existing?.id;

        if (questionId) {
          const res = await api.put(`/mcq/saved/${questionId}`, itemPayload);
          const updatedDoc = res.data?.data || { ...existing, ...itemPayload };
          setQuestions((prev) => {
            const next = [...prev];
            next[editingIndex] = { ...updatedDoc, rowNumber: editingIndex + 1 };
            return next;
          });
        } else {
          const res = await api.post('/mcq', itemPayload);
          const createdDoc = res.data?.data || itemPayload;
          setQuestions((prev) => {
            const next = [...prev];
            next[editingIndex] = { ...createdDoc, rowNumber: editingIndex + 1 };
            return next;
          });
        }
        setNotice(`Question #${editingIndex + 1} updated directly in database!`);
        setEditingIndex(null);
      } else {
        // Add new directly to MongoDB
        const res = await api.post('/mcq', itemPayload);
        const createdDoc = res.data?.data || itemPayload;
        setQuestions((prev) => [...prev, { ...createdDoc, rowNumber: prev.length + 1 }]);
        setNotice(`Question saved directly to database! Total questions: ${questions.length + 1}`);
      }

      // Reset fields for the next question
      setQuestionText('');
      setOptionA('');
      setOptionB('');
      setOptionC('');
      setOptionD('');
      setExplanation('');
    } catch (err: any) {
      alert(err?.customMessage || 'Failed to save question to database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Start Editing a Question ─────────────────────────────────────────────
  const handleStartEdit = (index: number) => {
    const q = questions[index];
    if (!q) return;
    setEditingIndex(index);
    setQuestionText(q.question);
    setOptionA(q.optionA);
    setOptionB(q.optionB);
    setOptionC(q.optionC);
    setOptionD(q.optionD);
    setCorrectAnswer(q.correctAnswer);
    setMarks(q.marks || 1);
    setTopic(q.topic || 'General');
    setExplanation(q.explanation || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setQuestionText('');
    setOptionA('');
    setOptionB('');
    setOptionC('');
    setOptionD('');
    setExplanation('');
  };

  // ── Delete a Question Directly from MongoDB ─────────────────────────────
  const handleDeleteQuestion = async (index: number) => {
    const q = questions[index];
    if (!q) return;

    if (!confirm(`Are you sure you want to delete Question #${index + 1}? This will remove it from the database.`)) {
      return;
    }

    try {
      const questionId = q._id || q.id;
      if (questionId) {
        await api.delete(`/mcq/saved/${questionId}`);
      }
      setQuestions((prev) =>
        prev.filter((_, idx) => idx !== index).map((item, idx) => ({ ...item, rowNumber: idx + 1 }))
      );
      if (editingIndex === index) {
        handleCancelEdit();
      }
      setNotice(`Question #${index + 1} deleted from database.`);
    } catch (err: any) {
      alert(err?.customMessage || 'Failed to delete question from database.');
    }
  };

  // ── Clear All from MongoDB ──────────────────────────────────────────────
  const handleClearAll = async () => {
    if (confirm('Are you sure you want to remove all questions from the database?')) {
      try {
        await api.delete('/mcq/saved');
        setQuestions([]);
        handleCancelEdit();
        setNotice('All questions cleared from database.');
      } catch (err: any) {
        alert(err?.customMessage || 'Failed to clear questions.');
      }
    }
  };

  // ── Upload Existing CSV and Save Directly to MongoDB ────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          alert('CSV file is empty or missing headers.');
          return;
        }

        const header = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());
        const qIdx = header.indexOf('question');
        const aIdx = header.indexOf('optionA');
        const bIdx = header.indexOf('optionB');
        const cIdx = header.indexOf('optionC');
        const dIdx = header.indexOf('optionD');
        const ansIdx = header.indexOf('correctAnswer');
        const marksIdx = header.indexOf('marks');
        const topicIdx = header.indexOf('topic');
        const expIdx = header.indexOf('explanation');

        const parsedRows: any[] = [];
        const csvRegex = /(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g;

        for (let i = 1; i < lines.length; i++) {
          const rowValues: string[] = [];
          let match;
          csvRegex.lastIndex = 0;
          while ((match = csvRegex.exec(lines[i])) !== null) {
            const val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2];
            rowValues.push(val ? val.trim() : '');
            if (match.index === csvRegex.lastIndex) csvRegex.lastIndex++;
          }

          if (rowValues.length >= 5) {
            parsedRows.push({
              question: rowValues[qIdx >= 0 ? qIdx : 0] || '',
              optionA: rowValues[aIdx >= 0 ? aIdx : 1] || '',
              optionB: rowValues[bIdx >= 0 ? bIdx : 2] || '',
              optionC: rowValues[cIdx >= 0 ? cIdx : 3] || '',
              optionD: rowValues[dIdx >= 0 ? dIdx : 4] || '',
              correctAnswer: (rowValues[ansIdx >= 0 ? ansIdx : 5] || 'A').toUpperCase(),
              marks: Number(rowValues[marksIdx >= 0 ? marksIdx : 6]) || 1,
              topic: rowValues[topicIdx >= 0 ? topicIdx : 7] || 'General',
              explanation: rowValues[expIdx >= 0 ? expIdx : 8] || ''
            });
          }
        }

        if (parsedRows.length === 0) {
          alert('No valid questions found in CSV.');
          return;
        }

        // Save directly to MongoDB
        const res = await api.post('/mcq/save', { rows: parsedRows });
        const saved = res.data?.data?.items || parsedRows;

        setQuestions((prev) => {
          const combined = [...prev, ...saved];
          return combined.map((q, idx) => ({ ...q, rowNumber: idx + 1 }));
        });
        setNotice(`Imported and saved ${saved.length} questions directly to database!`);
      } catch (err: any) {
        alert(err?.customMessage || 'Failed to parse and save uploaded CSV.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Download TestPad-Ready CSV ──────────────────────────────────────────
  const handleDownloadTestPadCSV = () => {
    if (questions.length === 0) {
      alert('Please add at least one question before downloading.');
      return;
    }

    const escapeCsv = (val: string | number | undefined) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    };

    const header = 'question,optionA,optionB,optionC,optionD,correctAnswer,marks,topic,explanation';
    const rows = questions.map((q) =>
      [
        escapeCsv(q.question),
        escapeCsv(q.optionA),
        escapeCsv(q.optionB),
        escapeCsv(q.optionC),
        escapeCsv(q.optionD),
        escapeCsv(q.correctAnswer),
        q.marks || 1,
        escapeCsv(q.topic),
        escapeCsv(q.explanation || '')
      ].join(',')
    );

    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'testpad_bulk_mcqs.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setNotice(`Downloaded ${questions.length} questions as 'testpad_bulk_mcqs.csv' ready for TestPad upload!`);
  };

  // Metrics
  const totalQuestions = questions.length;
  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
  const uniqueTopics = new Set(questions.map((q) => q.topic)).size;

  return (
    <div className="space-y-6 animate-fadeIn max-w-7xl mx-auto">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 rounded-3xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-0.5 bg-orange-600 rounded-full" />
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
              TestPad Bulk Assessment Exporter
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Manual MCQ Studio & CSV Generator
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Questions are automatically saved to your database. Edit or delete any question anytime, and download a TestPad-compatible CSV sheet in 1 click.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer transition-colors shadow-xs">
            <UploadCloud className="h-3.5 w-3.5 text-slate-500" /> Upload Existing CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>

          <Button
            size="sm"
            onClick={handleDownloadTestPadCSV}
            disabled={questions.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 shadow-md font-bold"
          >
            <Download className="h-3.5 w-3.5" /> Download TestPad CSV ({questions.length})
          </Button>
        </div>
      </div>

      {/* Alert Notice */}
      {notice && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between gap-2 text-xs font-semibold shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── TOP STATS ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Questions</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{totalQuestions}</div>
        </div>
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Assessment Marks</span>
          <div className="text-2xl font-extrabold text-orange-600 mt-1">{totalMarks}</div>
        </div>
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Distinct Topics Covered</span>
          <div className="text-2xl font-extrabold text-indigo-600 mt-1">{uniqueTopics}</div>
        </div>
      </div>

      {/* ── MANUAL QUESTION ENTRY FORM ─────────────────────────────────────── */}
      <form
        onSubmit={handleSaveQuestion}
        className="bg-white border border-slate-200/80 p-6 rounded-3xl shadow-xs space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {editingIndex !== null ? `Edit Question #${editingIndex + 1}` : 'Add New MCQ to Database'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Fill in the statement, options, marks, and answer key. It will be saved directly into MongoDB.
            </p>
          </div>
          {editingIndex !== null && (
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              Editing Mode Active
            </span>
          )}
        </div>

        {/* Question Statement */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Question Statement *</label>
          <textarea
            required
            rows={2}
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="e.g. Which data structure follows the LIFO (Last In First Out) principle?"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
          />
        </div>

        {/* Options 2x2 Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span>Option A *</span>
              {correctAnswer === 'A' && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded border border-emerald-200">
                  Correct Answer
                </span>
              )}
            </label>
            <input
              type="text"
              required
              value={optionA}
              onChange={(e) => setOptionA(e.target.value)}
              placeholder="e.g. Stack"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span>Option B *</span>
              {correctAnswer === 'B' && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded border border-emerald-200">
                  Correct Answer
                </span>
              )}
            </label>
            <input
              type="text"
              required
              value={optionB}
              onChange={(e) => setOptionB(e.target.value)}
              placeholder="e.g. Queue"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span>Option C *</span>
              {correctAnswer === 'C' && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded border border-emerald-200">
                  Correct Answer
                </span>
              )}
            </label>
            <input
              type="text"
              required
              value={optionC}
              onChange={(e) => setOptionC(e.target.value)}
              placeholder="e.g. Binary Tree"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span>Option D *</span>
              {correctAnswer === 'D' && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded border border-emerald-200">
                  Correct Answer
                </span>
              )}
            </label>
            <input
              type="text"
              required
              value={optionD}
              onChange={(e) => setOptionD(e.target.value)}
              placeholder="e.g. Array"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
            />
          </div>
        </div>

        {/* Answer Key, Marks, Topic */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Correct Answer Key *</label>
            <select
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-emerald-800 font-extrabold focus:outline-none focus:border-orange-500"
            >
              <option value="A">Option A</option>
              <option value="B">Option B</option>
              <option value="C">Option C</option>
              <option value="D">Option D</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Marks *</label>
            <input
              type="number"
              min={1}
              required
              value={marks}
              onChange={(e) => setMarks(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Topic / Subject</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Data Structures"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Explanation */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Explanation (Optional)</label>
          <input
            type="text"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Brief reason or logic for the correct answer..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-700 focus:outline-none focus:border-orange-500"
          />
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {editingIndex !== null && (
            <Button variant="secondary" size="sm" type="button" onClick={handleCancelEdit} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" size="sm" className="font-bold" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> {editingIndex !== null ? 'Save Changes' : 'Save'}
              </>
            )}
          </Button>
        </div>
      </form>

      {/* ── QUESTION LIST CARD ──────────────────────────────────────────────── */}
      <Card
        title={`Questions (${questions.length})`}
        subtitle="Review, edit, or delete questions stored in your MongoDB database, then export anytime as a TestPad CSV"
        action={
          <div className="flex items-center gap-2">
            {questions.length > 0 && (
              <Button variant="secondary" size="sm" onClick={handleClearAll} className="text-rose-600 hover:text-rose-700">
                Clear All
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleDownloadTestPadCSV}
              disabled={questions.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              <Download className="h-3.5 w-3.5" /> Download TestPad CSV
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-xs gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
            <span>Loading MCQs from MongoDB database...</span>
          </div>
        ) : questions.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-xs">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-slate-300 mb-2" />
            <p className="font-bold text-slate-700 text-sm">No questions in database yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Use the form above to add questions directly into MongoDB, or upload an existing CSV sheet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 pr-2 w-10">#</th>
                  <th className="pb-3 pr-4">Question & Topic</th>
                  <th className="pb-3 pr-3">Options (A, B, C, D)</th>
                  <th className="pb-3 pr-2 w-16 text-center">Correct</th>
                  <th className="pb-3 pr-2 w-14 text-center">Marks</th>
                  <th className="pb-3 pr-2 w-20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {questions.map((q, idx) => (
                  <tr key={q._id || q.id || idx} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 pr-2 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-3.5 pr-4 max-w-sm">
                      <div className="font-bold text-slate-900 leading-snug">{q.question}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                          {q.topic}
                        </span>
                        {q.explanation && (
                          <span className="text-[10px] text-slate-400 truncate max-w-xs" title={q.explanation}>
                            💡 {q.explanation}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 pr-3 text-[11px] font-mono text-slate-600 space-y-0.5">
                      <div className={q.correctAnswer === 'A' ? 'text-emerald-700 font-bold' : ''}>
                        <strong>A:</strong> {q.optionA}
                      </div>
                      <div className={q.correctAnswer === 'B' ? 'text-emerald-700 font-bold' : ''}>
                        <strong>B:</strong> {q.optionB}
                      </div>
                      <div className={q.correctAnswer === 'C' ? 'text-emerald-700 font-bold' : ''}>
                        <strong>C:</strong> {q.optionC}
                      </div>
                      <div className={q.correctAnswer === 'D' ? 'text-emerald-700 font-bold' : ''}>
                        <strong>D:</strong> {q.optionD}
                      </div>
                    </td>
                    <td className="py-3.5 pr-2 text-center">
                      <span className="px-2.5 py-1 rounded-md font-mono font-bold text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {q.correctAnswer}
                      </span>
                    </td>
                    <td className="py-3.5 pr-2 text-center font-bold text-slate-800">{q.marks}</td>
                    <td className="py-3.5 pr-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleStartEdit(idx)}
                          title="Edit question in database"
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(idx)}
                          title="Delete question from database"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default McqImportView;

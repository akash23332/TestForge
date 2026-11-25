import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../../../lib/api';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Check,
  X,
  FileCode2,
  FileText,
  ListFilter,
  CheckSquare,
  AlertCircle
} from 'lucide-react';
import CodeEditor from '../../../components/editor/CodeEditor';

const CODING_TEMPLATES = {
  javascript: `function solution(input) {
  // Write your code here
  return input;
}
`,
  python: `def solution(input):
    # Write your code here
    return input
`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Write your solution here
        sc.close();
    }
}
`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    // Write your solution here
    return 0;
}
`
};

export const StudentExamInterface = ({
  sessionData,
  onExamSubmitted,
  onExit
}) => {
  const { exam = {}, attempt = {}, questions = [], token = '' } = sessionData || {};

  // Active question index
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentQuestion = questions[currentIndex] || {};

  // Local student answers map:
  // [questionId]: { selectedOption, selectedOptions, descriptiveText, code, language, isMarkedForReview, isVisited, isAnswered }
  const [answers, setAnswers] = useState(() => {
    const initial = {};
    questions.forEach((q) => {
      const qId = q._id || q.id;
      initial[qId] = {
        selectedOption: '',
        selectedOptions: [],
        descriptiveText: '',
        code: q.starterCode || CODING_TEMPLATES[q.language || 'javascript'] || '',
        language: q.language || 'javascript',
        isMarkedForReview: false,
        isVisited: false,
        isAnswered: false
      };
    });
    // Mark first question as visited
    if (questions[0]) {
      const firstId = questions[0]._id || questions[0].id;
      initial[firstId].isVisited = true;
    }
    return initial;
  });

  // Track visited questions
  const markVisited = (idx) => {
    const q = questions[idx];
    if (!q) return;
    const qId = q._id || q.id;
    setAnswers((prev) => ({
      ...prev,
      [qId]: { ...(prev[qId] || {}), isVisited: true }
    }));
  };

  // ── SAVE STATUS STATE ──
  // 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState('saved');
  const autosaveTimeoutRef = useRef(null);

  // ── SERVER-DRIVEN COUNTDOWN TIMER ──
  const calculateRemaining = () => {
    if (!attempt?.expiresAt) {
      return (exam?.durationMinutes || 60) * 60;
    }
    const diff = Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  };

  const [remainingSeconds, setRemainingSeconds] = useState(calculateRemaining);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  // Countdown Interval
  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinalSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [attempt?.expiresAt]);

  const formatTimer = (total) => {
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const isUnderFiveMinutes = remainingSeconds > 0 && remainingSeconds <= 300;

  // ── CODE EXECUTION STATE (Sample Tests) ──
  const [isExecutingSample, setIsExecutingSample] = useState(false);
  const [sampleRunResult, setSampleRunResult] = useState(null);
  const [activeTabCode, setActiveTabCode] = useState('samples'); // 'samples' | 'output'

  // Current Question Helpers
  const qId = currentQuestion._id || currentQuestion.id;
  const currentAnswer = answers[qId] || {};
  const isMcqSingle = (currentQuestion.type === 'mcq' && (!currentQuestion.answerType || currentQuestion.answerType === 'single'));
  const isMultipleSelect = (currentQuestion.type === 'mcq' && (currentQuestion.answerType === 'multiple' || currentQuestion.multipleSelect));
  const isDescriptive = currentQuestion.type === 'subjective' || currentQuestion.type === 'descriptive';
  const isCoding = currentQuestion.type === 'coding' || !currentQuestion.type;

  // Live word count for descriptive questions
  const wordCount = useMemo(() => {
    const text = (currentAnswer.descriptiveText || '').trim();
    if (!text) return 0;
    return text.split(/\s+/).length;
  }, [currentAnswer.descriptiveText]);

  const wordLimit = currentQuestion.wordLimit || 150;
  const isOverWordLimit = wordCount > wordLimit;

  // ── DEBOUNCED AUTOSAVE ──
  const scheduleAutosave = useCallback((updatedAnswer) => {
    if (!attempt?._id || !qId) return;
    setSaveStatus('saving');

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      try {
        await api.post(`/attempts/${attempt._id}/save`, {
          questionId: qId,
          code: updatedAnswer.code,
          language: updatedAnswer.language,
          selectedOption: isMultipleSelect ? (updatedAnswer.selectedOptions || []).join(',') : updatedAnswer.selectedOption,
          subjectiveAnswer: updatedAnswer.descriptiveText,
          isMarkedForReview: updatedAnswer.isMarkedForReview
        });
        setSaveStatus('saved');
      } catch (err) {
        setSaveStatus('error');
      }
    }, 500);
  }, [attempt?._id, qId, isMultipleSelect]);

  // Answer change dispatchers
  const updateCurrentAnswer = (patch) => {
    setAnswers((prev) => {
      const existing = prev[qId] || {};
      const next = { ...existing, ...patch };

      // Determine answered flag
      let hasAnswer = false;
      if (isMcqSingle && next.selectedOption) hasAnswer = true;
      if (isMultipleSelect && next.selectedOptions && next.selectedOptions.length > 0) hasAnswer = true;
      if (isDescriptive && next.descriptiveText && next.descriptiveText.trim().length > 0) hasAnswer = true;
      if (isCoding && next.code && next.code.trim().length > 10) hasAnswer = true;

      next.isAnswered = hasAnswer;
      scheduleAutosave(next);
      return { ...prev, [qId]: next };
    });
  };

  // MCQ Handlers
  const handleSelectOption = (optKey) => {
    if (isMcqSingle) {
      updateCurrentAnswer({ selectedOption: optKey });
    } else if (isMultipleSelect) {
      const currentOpts = currentAnswer.selectedOptions || [];
      const nextOpts = currentOpts.includes(optKey)
        ? currentOpts.filter((k) => k !== optKey)
        : [...currentOpts, optKey];
      updateCurrentAnswer({ selectedOptions: nextOpts });
    }
  };

  // Clear answer
  const handleClearAnswer = () => {
    updateCurrentAnswer({
      selectedOption: '',
      selectedOptions: [],
      descriptiveText: '',
      code: currentQuestion.starterCode || CODING_TEMPLATES[currentAnswer.language || 'javascript'] || ''
    });
  };

  // Toggle Mark for review
  const handleToggleReview = () => {
    updateCurrentAnswer({
      isMarkedForReview: !currentAnswer.isMarkedForReview
    });
  };

  // Run Sample Tests against backend
  const handleRunSampleTests = async () => {
    if (!attempt?._id || !qId || isExecutingSample) return;
    setIsExecutingSample(true);
    setSampleRunResult(null);
    setActiveTabCode('output');

    try {
      const res = await api.post(`/attempts/${attempt._id}/run`, {
        questionId: qId,
        code: currentAnswer.code,
        language: currentAnswer.language
      });
      setSampleRunResult(res.data?.data || null);
    } catch (err) {
      setSampleRunResult({
        error: true,
        message: err.response?.data?.message || err.customMessage || 'Execution error.'
      });
    } finally {
      setIsExecutingSample(false);
    }
  };

  // Navigation handlers
  const handleNavigateQuestion = (index) => {
    if (index < 0 || index >= questions.length) return;
    setCurrentIndex(index);
    markVisited(index);
    setSampleRunResult(null);
  };

  // Submit confirmation calculations
  const totalAnswered = useMemo(() => {
    return Object.values(answers).filter((a) => a.isAnswered).length;
  }, [answers]);

  const totalMarked = useMemo(() => {
    return Object.values(answers).filter((a) => a.isMarkedForReview).length;
  }, [answers]);

  const totalUnanswered = questions.length - totalAnswered;

  // Final Exam Submission
  const handleFinalSubmit = async (auto = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = await api.post(`/attempts/${attempt._id}/finalize`, {
        autoSubmitted: auto
      });
      const data = res.data?.data || {};
      if (onExamSubmitted) {
        onExamSubmitted(data);
      }
    } catch (err) {
      alert(err.response?.data?.message || err.customMessage || 'Submission failed. Please check your network and try again.');
    } finally {
      setIsSubmitting(false);
      setSubmitModalOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F3F0] text-[#171819] font-sans overflow-hidden select-none">
      {/* ── TOP HEADER BAR (Dark #191A1D) ── */}
      <header className="h-16 px-4 sm:px-6 bg-[#191A1D] text-white flex items-center justify-between border-b border-white/10 shrink-0">
        {/* Left: Test title & question progress */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white/10 text-[#EDFF72]">
            {exam?.examCode || 'TF-EXAM'}
          </span>
          <div>
            <h1 className="text-xs sm:text-sm font-bold text-white leading-none truncate max-w-xs sm:max-w-md">
              {exam?.title || 'Examination Workspace'}
            </h1>
            <span className="text-[11px] text-[#8F938D] font-mono mt-0.5 block">
              Question {currentIndex + 1} of {questions.length}
            </span>
          </div>
        </div>

        {/* Center: Save Status */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-[#8F938D]">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-amber-300">
              <RotateCw className="size-3 animate-spin" />
              <span>Saving…</span>
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Check className="size-3" />
              <span>✓ Saved just now</span>
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-rose-400">
              <AlertCircle className="size-3" />
              <span>Autosave failed (retrying)</span>
            </span>
          )}
        </div>

        {/* Right: Countdown Timer Pill + Lime Submit Button */}
        <div className="flex items-center gap-3">
          {/* Mono Countdown Timer Pill */}
          <div
            className={`px-3.5 py-1.5 rounded-full border border-white/15 bg-[#26282E] flex items-center gap-2 text-xs font-mono font-bold ${
              isUnderFiveMinutes ? 'text-amber-300 animate-pulse border-amber-300/40' : 'text-[#EDFF72]'
            }`}
          >
            <Clock className="size-3.5" />
            <span>{formatTimer(remainingSeconds)}</span>
          </div>

          {/* Submit Test Button */}
          <button
            type="button"
            onClick={() => setSubmitModalOpen(true)}
            className="px-4 py-2 rounded-full bg-[#EDFF72] hover:bg-[#e2f560] text-[#191A1D] text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            Submit test
          </button>
        </div>
      </header>

      {/* ── WORKSPACE BODY: 2-COLUMN CARDS ── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
        {/* ── LEFT CARD: QUESTION & ANSWER AREA ── */}
        <div className="flex-1 rounded-[24px] border border-[#DDE1DA] bg-white flex flex-col overflow-hidden shadow-xs">
          {/* Question Header & Chips */}
          <div className="p-6 pb-4 border-b border-[#DDE1DA] shrink-0">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-[#191A1D] text-[#EDFF72] text-[11px] font-mono font-bold uppercase">
                  {isMcqSingle && 'MCQ Single Choice'}
                  {isMultipleSelect && 'Multiple Select'}
                  {isDescriptive && 'Descriptive'}
                  {isCoding && 'Coding Challenge'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#F2F3F0] text-[#777D78] text-[11px] font-mono font-bold">
                  {currentQuestion.marks || (isMcqSingle ? 2 : 10)} Marks
                </span>
              </div>
              {currentAnswer.isMarkedForReview && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-800 text-[11px] font-bold">
                  <Bookmark className="size-3 fill-current" />
                  <span>Marked for review</span>
                </span>
              )}
            </div>

            {/* Question Text (20px) */}
            <h2 className="text-[20px] font-semibold text-[#171819] leading-relaxed">
              {currentQuestion.title || currentQuestion.statement}
            </h2>
          </div>

          {/* Answer Area (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Detailed Statement if available */}
            {currentQuestion.statement && currentQuestion.statement !== currentQuestion.title && (
              <p className="text-sm text-[#777D78] whitespace-pre-wrap leading-relaxed">
                {currentQuestion.statement}
              </p>
            )}

            {/* 1. MCQ SINGLE CHOICE */}
            {isMcqSingle && (
              <div className="space-y-3" role="radiogroup" aria-label="Question options">
                {(currentQuestion.options || ['A', 'B', 'C', 'D']).map((opt, i) => {
                  const optKey = typeof opt === 'string' ? String.fromCharCode(65 + i) : (opt.key || String.fromCharCode(65 + i));
                  const optText = typeof opt === 'string' ? opt : (opt.text || opt.statement);
                  const isSelected = currentAnswer.selectedOption === optKey;

                  return (
                    <div
                      key={optKey}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onClick={() => handleSelectOption(optKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectOption(optKey);
                        }
                      }}
                      className={`flex items-center gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#171819] bg-[#EDFF72]/20 font-bold shadow-xs'
                          : 'border-[#DDE1DA] bg-white hover:bg-[#F2F3F0]'
                      }`}
                    >
                      <div
                        className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'border-[#171819] bg-[#171819]' : 'border-[#DDE1DA] bg-white'
                        }`}
                      >
                        {isSelected && <span className="size-2 rounded-full bg-[#EDFF72]" />}
                      </div>
                      <span className="font-mono text-xs font-bold text-[#777D78]">{optKey}.</span>
                      <span className="text-sm text-[#171819] flex-1">{optText}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. MULTIPLE SELECT */}
            {isMultipleSelect && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-[#777D78] italic">Select all that apply.</p>
                {(currentQuestion.options || ['A', 'B', 'C', 'D']).map((opt, i) => {
                  const optKey = typeof opt === 'string' ? String.fromCharCode(65 + i) : (opt.key || String.fromCharCode(65 + i));
                  const optText = typeof opt === 'string' ? opt : (opt.text || opt.statement);
                  const isChecked = (currentAnswer.selectedOptions || []).includes(optKey);

                  return (
                    <div
                      key={optKey}
                      role="checkbox"
                      aria-checked={isChecked}
                      tabIndex={0}
                      onClick={() => handleSelectOption(optKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectOption(optKey);
                        }
                      }}
                      className={`flex items-center gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                        isChecked
                          ? 'border-[#171819] bg-[#EDFF72]/20 font-bold shadow-xs'
                          : 'border-[#DDE1DA] bg-white hover:bg-[#F2F3F0]'
                      }`}
                    >
                      <div
                        className={`size-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isChecked ? 'border-[#171819] bg-[#171819]' : 'border-[#DDE1DA] bg-white'
                        }`}
                      >
                        {isChecked && <Check className="size-3 text-[#EDFF72] stroke-[3]" />}
                      </div>
                      <span className="font-mono text-xs font-bold text-[#777D78]">{optKey}.</span>
                      <span className="text-sm text-[#171819] flex-1">{optText}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 3. DESCRIPTIVE ANSWER */}
            {isDescriptive && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#171819]">Your Written Answer</span>
                  <span className={`font-mono ${isOverWordLimit ? 'text-rose-600 font-bold' : 'text-[#777D78]'}`}>
                    {wordCount} / {wordLimit} words {isOverWordLimit && '(over the limit)'}
                  </span>
                </div>
                <textarea
                  rows={8}
                  placeholder="Type your explanation or descriptive response here..."
                  value={currentAnswer.descriptiveText || ''}
                  onChange={(e) => updateCurrentAnswer({ descriptiveText: e.target.value })}
                  className={`w-full p-4 rounded-2xl border bg-[#F9FAF8] text-sm text-[#171819] placeholder:text-[#A0A59F] focus:outline-none focus:bg-white transition-colors ${
                    isOverWordLimit ? 'border-rose-400 focus:border-rose-600' : 'border-[#DDE1DA] focus:border-[#171819]'
                  }`}
                />
              </div>
            )}

            {/* 4. CODING CHALLENGE */}
            {isCoding && (
              <div className="space-y-4">
                {/* Language Select + Run Code Header */}
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#DDE1DA]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#777D78]">Language:</span>
                    <select
                      value={currentAnswer.language || 'javascript'}
                      onChange={(e) => {
                        const newLang = e.target.value;
                        const defaultCode = CODING_TEMPLATES[newLang] || '';
                        updateCurrentAnswer({ language: newLang, code: defaultCode });
                      }}
                      className="h-8 px-2.5 rounded-lg border border-[#DDE1DA] bg-white text-xs font-semibold text-[#171819] focus:outline-none cursor-pointer"
                    >
                      <option value="javascript">JavaScript (Node.js)</option>
                      <option value="python">Python 3</option>
                      <option value="java">Java (OpenJDK)</option>
                      <option value="cpp">C++ (g++)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunSampleTests}
                    disabled={isExecutingSample}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#191A1D] hover:bg-black text-[#EDFF72] text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isExecutingSample ? (
                      <>
                        <RotateCw className="size-3.5 animate-spin" />
                        <span>Running…</span>
                      </>
                    ) : (
                      <>
                        <Play className="size-3.5 fill-current" />
                        <span>Run code</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Dark Monospace Code Editor */}
                <div className="rounded-2xl border border-white/10 bg-[#0F1012] p-2 overflow-hidden shadow-inner min-h-[280px]">
                  <textarea
                    rows={12}
                    value={currentAnswer.code || ''}
                    onChange={(e) => updateCurrentAnswer({ code: e.target.value })}
                    spellCheck="false"
                    className="w-full h-full bg-transparent p-3 font-mono text-xs sm:text-sm text-[#D8FFB0] focus:outline-none resize-y leading-relaxed"
                  />
                </div>

                {/* Sample Test Cases & Execution Output Block */}
                <div className="rounded-2xl border border-[#DDE1DA] bg-[#F9FAF8] p-4 space-y-3">
                  <div className="flex items-center gap-2 border-b border-[#DDE1DA] pb-2">
                    <button
                      type="button"
                      onClick={() => setActiveTabCode('samples')}
                      className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${
                        activeTabCode === 'samples' ? 'bg-[#191A1D] text-[#EDFF72]' : 'text-[#777D78] hover:text-[#171819]'
                      }`}
                    >
                      Sample Test Cases
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTabCode('output')}
                      className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${
                        activeTabCode === 'output' ? 'bg-[#191A1D] text-[#EDFF72]' : 'text-[#777D78] hover:text-[#171819]'
                      }`}
                    >
                      Output Panel
                    </button>
                  </div>

                  {activeTabCode === 'samples' && (
                    <div className="text-xs space-y-2">
                      {(currentQuestion.examples || [
                        { input: '[1, 2, 3, 4]', output: '2' },
                        { input: '[2, 4, 6]', output: '3' }
                      ]).map((ex, i) => (
                        <div key={i} className="p-2.5 rounded-xl bg-white border border-[#DDE1DA] font-mono flex items-center justify-between text-xs">
                          <div>
                            <span className="text-[#777D78]">Input: </span>
                            <span className="text-[#171819] font-bold">{ex.input}</span>
                          </div>
                          <div>
                            <span className="text-[#777D78]">Expected: </span>
                            <span className="text-[#171819] font-bold">{ex.output}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTabCode === 'output' && (
                    <div className="text-xs font-mono">
                      {isExecutingSample ? (
                        <div className="p-4 text-center text-[#777D78] space-y-2">
                          <RotateCw className="size-4 animate-spin mx-auto text-[#171819]" />
                          <span>Executing against sample cases…</span>
                        </div>
                      ) : sampleRunResult ? (
                        <div className="p-3 rounded-xl bg-white border border-[#DDE1DA] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#171819]">Execution Verdict</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              sampleRunResult.passed ? 'bg-[#EDFF72] text-[#191A1D]' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {sampleRunResult.status || (sampleRunResult.passed ? 'Passed' : 'Failed')}
                            </span>
                          </div>
                          {sampleRunResult.output && (
                            <div className="p-2 rounded bg-[#0F1012] text-[#D8FFB0] text-[11px] whitespace-pre-wrap">
                              {sampleRunResult.output}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-[#777D78]">
                          Click "Run code" to test your implementation against sample cases.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Control Row at Bottom */}
          <div className="p-4 sm:p-5 border-t border-[#DDE1DA] bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Left Controls: Previous + Clear Answer */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => handleNavigateQuestion(currentIndex - 1)}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-full border border-[#DDE1DA] bg-white hover:bg-[#F2F3F0] text-xs font-semibold text-[#171819] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="size-4" />
                <span>Previous</span>
              </button>

              <button
                type="button"
                onClick={handleClearAnswer}
                className="px-3.5 py-2 rounded-full text-xs font-semibold text-[#777D78] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                Clear answer
              </button>
            </div>

            {/* Right Controls: Mark for review + Save answer + Next / Review & Submit */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleReview}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${
                  currentAnswer.isMarkedForReview
                    ? 'border-[#171819] bg-[#171819] text-[#EDFF72]'
                    : 'border-[#DDE1DA] bg-white hover:bg-[#F2F3F0] text-[#171819]'
                }`}
              >
                <Bookmark className="size-3.5" />
                <span>{currentAnswer.isMarkedForReview ? 'Unmark review' : 'Mark for review'}</span>
              </button>

              <button
                type="button"
                onClick={() => scheduleAutosave(currentAnswer)}
                className="px-4 py-2 rounded-full border border-[#DDE1DA] bg-white hover:bg-[#F2F3F0] text-xs font-semibold text-[#171819] transition-colors cursor-pointer"
              >
                Save answer
              </button>

              <button
                type="button"
                onClick={() => {
                  if (currentIndex === questions.length - 1) {
                    setSubmitModalOpen(true);
                  } else {
                    handleNavigateQuestion(currentIndex + 1);
                  }
                }}
                className="inline-flex items-center gap-1 px-5 py-2 rounded-full bg-[#191A1D] hover:bg-black text-[#EDFF72] text-xs font-bold transition-transform hover:scale-105 active:scale-95 cursor-pointer shadow-xs"
              >
                <span>{currentIndex === questions.length - 1 ? 'Review & submit' : 'Next'}</span>
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT CARD: QUESTION PALETTE (300px) ── */}
        <div className="w-full lg:w-[300px] rounded-[24px] border border-[#DDE1DA] bg-white p-5 flex flex-col justify-between shrink-0 shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA] mb-4">
              <h3 className="text-sm font-bold text-[#171819]">Question Palette</h3>
              <span className="font-mono text-xs text-[#777D78] font-bold">
                {totalAnswered}/{questions.length}
              </span>
            </div>

            {/* 5-Column Grid of Numbered Buttons */}
            <div className="grid grid-cols-5 gap-2.5 mb-6">
              {questions.map((q, idx) => {
                const qKey = q._id || q.id;
                const state = answers[qKey] || {};
                const isCurrent = currentIndex === idx;

                // State determination:
                // Not visited (white), not answered (surface-2 #E9ECE7), answered (dark with lime number),
                // marked (dashed dark border + ⚑ badge), answered and marked (dark + ⚑).
                let btnStyle = 'bg-white border-[#DDE1DA] text-[#777D78]'; // not visited default

                if (state.isVisited && !state.isAnswered && !state.isMarkedForReview) {
                  btnStyle = 'bg-[#E9ECE7] border-transparent text-[#171819]';
                }

                if (state.isAnswered && !state.isMarkedForReview) {
                  btnStyle = 'bg-[#191A1D] border-transparent text-[#EDFF72] font-bold';
                }

                if (!state.isAnswered && state.isMarkedForReview) {
                  btnStyle = 'bg-white border-2 border-dashed border-[#171819] text-[#171819] font-bold';
                }

                if (state.isAnswered && state.isMarkedForReview) {
                  btnStyle = 'bg-[#191A1D] border-transparent text-[#EDFF72] font-bold';
                }

                return (
                  <button
                    key={qKey}
                    type="button"
                    onClick={() => handleNavigateQuestion(idx)}
                    aria-label={`Go to question ${idx + 1}`}
                    className={`size-11 rounded-xl flex items-center justify-center font-mono text-xs transition-all relative cursor-pointer border ${btnStyle} ${
                      isCurrent ? 'ring-2 ring-[#EDFF72] ring-offset-2 scale-105' : ''
                    }`}
                  >
                    <span>{idx + 1}</span>
                    {state.isMarkedForReview && (
                      <span className="absolute -top-1 -right-1 text-[10px]">⚑</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Palette Legend */}
            <div className="pt-4 border-t border-[#DDE1DA] space-y-2 text-[11px] text-[#777D78]">
              <span className="block font-bold text-[#171819] uppercase tracking-wider text-[10px] mb-2">
                Legend
              </span>
              <div className="flex items-center gap-2">
                <span className="size-3.5 rounded bg-[#191A1D] text-[#EDFF72] flex items-center justify-center text-[9px] font-bold">✓</span>
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3.5 rounded bg-[#E9ECE7]" />
                <span>Not answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3.5 rounded border border-dashed border-[#171819] flex items-center justify-center text-[9px]">⚑</span>
                <span>Marked for review</span>
              </div>
            </div>
          </div>

          {/* Short Instructions List */}
          <div className="p-3.5 rounded-xl bg-[#F2F3F0] text-[11px] text-[#777D78] space-y-1 mt-4">
            <span className="block font-bold text-[#171819]">Notice</span>
            <p>Ensure you review all marked questions before submitting. Tab switching is recorded.</p>
          </div>
        </div>
      </div>

      {/* ── SUBMISSION CONFIRMATION MODAL ── */}
      {submitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-[24px] border border-[#DDE1DA] bg-white p-6 sm:p-7 shadow-2xl animate-in fade-in duration-200 space-y-5">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-2xl bg-[#191A1D] text-[#EDFF72] flex items-center justify-center font-bold">
                <ShieldCheck className="size-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#171819]">Submit Examination?</h3>
                <p className="text-xs text-[#777D78]">TestForge Examination Engine</p>
              </div>
            </div>

            {/* Submission Status Breakdown */}
            <div className="p-4 rounded-xl border border-[#DDE1DA] bg-[#F2F3F0] text-xs font-mono space-y-2">
              <div className="flex justify-between">
                <span className="text-[#777D78]">Answered:</span>
                <span className="font-bold text-[#171819]">{totalAnswered} of {questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777D78]">Unanswered:</span>
                <span className={`font-bold ${totalUnanswered > 0 ? 'text-amber-700' : 'text-[#171819]'}`}>
                  {totalUnanswered}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777D78]">Marked for review:</span>
                <span className="font-bold text-[#171819]">{totalMarked}</span>
              </div>
            </div>

            <p className="text-xs text-[#777D78]">
              You cannot change your answers after submitting. Once finalized, your submission is locked and recorded on the examination ledger.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSubmitModalOpen(false)}
                className="px-4 py-2 rounded-full border border-[#DDE1DA] bg-white hover:bg-[#F2F3F0] text-xs font-semibold text-[#171819] transition-colors cursor-pointer"
              >
                Keep working
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleFinalSubmit(false)}
                className="px-5 py-2 rounded-full bg-[#191A1D] hover:bg-black text-[#EDFF72] text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RotateCw className="size-3.5 animate-spin" />
                    <span>Submitting…</span>
                  </>
                ) : (
                  <span>Submit test</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentExamInterface;

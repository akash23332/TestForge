import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import {
  Play,
  Send,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RotateCcw,
  Maximize,
  Minimize,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileCode2,
  CheckSquare,
  Sparkles,
  X,
  GripVertical,
  GripHorizontal,
  Layers,
  HelpCircle
} from 'lucide-react';

const STANDARDIZED_TEMPLATES = {
  FUNCTION: {
    javascript: `function solution(a, b) {
  // Write your code here
}
`,
    python: `def solution(a, b):
    # Write your code here
    pass
`,
    java: `class Solution {
    public int solution(int a, int b) {
        // Write your code here
        return 0;
    }
}
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int solution(int a, int b) {
        // Write your code here
        return 0;
    }
};
`
  },
  STDIN: {
    javascript: `const fs = require('fs');

function main() {
  const input = fs.readFileSync(0, 'utf-8').trim();
  // Read input from stdin and print output to stdout
}

main();
`,
    python: `import sys

def main():
    # Read input from stdin and print output to stdout
    pass

if __name__ == '__main__':
    main()
`,
    java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Read input from stdin and print output to stdout
        sc.close();
    }
}
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // Read input from stdin and print output to stdout
    return 0;
}
`
  }
};

const resolveStarterCode = (question, lang) => {
  if (!question) return STANDARDIZED_TEMPLATES.STDIN[lang] || '';
  const mode = question.executionMode === 'FUNCTION' ? 'FUNCTION' : 'STDIN';
  if (question.starterCodes && question.starterCodes[lang]) {
    return question.starterCodes[lang];
  }
  if (question.starterCode && question.language === lang) {
    return question.starterCode;
  }
  return STANDARDIZED_TEMPLATES[mode]?.[lang] || STANDARDIZED_TEMPLATES.STDIN[lang] || '';
};

// Backward-compatible alias for existing references
const LANGUAGE_TEMPLATES = STANDARDIZED_TEMPLATES.STDIN;

export const StudentExamWorkspace = ({
  sessionData,
  onExamSubmitted,
  onExit
}) => {
  const { exam = {}, attempt = {}, questions = [], savedAnswers: initialAnswers = {} } = sessionData || {};

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState(initialAnswers);
  const currentQuestion = questions[currentIndex] || {};
  const isMcq = currentQuestion.type === 'mcq';

  // Coding states
  const [selectedLanguage, setSelectedLanguage] = useState(
    questions[0]?.language || 'javascript'
  );
  const [currentCode, setCurrentCode] = useState(
    initialAnswers[questions[0]?._id]?.code || resolveStarterCode(questions[0], questions[0]?.language || 'javascript')
  );

  // Custom Input State
  const [customInput, setCustomInput] = useState('');
  const [customResults, setCustomResults] = useState(null);
  const [isExecutingCustom, setIsExecutingCustom] = useState(false);

  // MCQ state
  const [selectedOption, setSelectedOption] = useState(
    initialAnswers[questions[0]?._id]?.selectedOption || ''
  );

  // Resizable Split Panes (Left / Right Column Width in percentage)
  const [leftWidthPercent, setLeftWidthPercent] = useState(35);
  const isResizingRef = useRef(false);

  // Resizable Test Drawer (Height in px)
  const [testDrawerHeight, setTestDrawerHeight] = useState(220);
  const isResizingDrawerRef = useRef(false);

  // Remaining time in seconds
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    if (!attempt.expiresAt) return (exam.durationMinutes || 60) * 60;
    const expiresAt = new Date(attempt.expiresAt).getTime();
    return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  });

  // Runner & Submission state
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
  const [executionStatusMessage, setExecutionStatusMessage] = useState('');
  const [activeTab, setActiveTab] = useState('samples'); // 'samples' | 'evaluation' | 'custom'
  const [sampleResults, setSampleResults] = useState(null);
  const [submissionResults, setSubmissionResults] = useState(null);
  const [isTestDrawerExpanded, setIsTestDrawerExpanded] = useState(true);

  // Proctoring & Autosave state
  const [saveStatus, setSaveStatus] = useState('synced'); // 'saving' | 'synced' | 'error'
  const [tabSwitches, setTabSwitches] = useState(attempt.tabSwitchCount || 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showProctoringPopover, setShowProctoringPopover] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const maxTabSwitches = exam.proctoringSettings?.maxTabSwitchesAllowed || 5;

  // ── Sync Code / Option on Question Switch ─────────────────────────────────
  useEffect(() => {
    if (!currentQuestion._id) return;
    const existing = answers[currentQuestion._id];

    if (currentQuestion.type === 'mcq') {
      setSelectedOption(existing?.selectedOption || '');
    } else {
      if (existing && existing.code !== undefined && existing.code !== '') {
        setCurrentCode(existing.code);
        setSelectedLanguage(existing.language || currentQuestion.language || 'javascript');
      } else {
        const lang = currentQuestion.language || 'javascript';
        const fallback = resolveStarterCode(currentQuestion, lang);
        setCurrentCode(fallback);
        setSelectedLanguage(lang);
      }
    }
    setSampleResults(null);
    setSubmissionResults(null);
    setCustomResults(null);
  }, [currentIndex, currentQuestion._id]);

  // ── Resizable Split-Pane Handler (Left/Right) ─────────────────────────────
  const handleSplitterMouseDown = (e) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent) => {
      if (!isResizingRef.current) return;
      const containerWidth = window.innerWidth;
      const newPercent = (moveEvent.clientX / containerWidth) * 100;
      if (newPercent >= 20 && newPercent <= 75) {
        setLeftWidthPercent(newPercent);
      }
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ── Resizable Test Results Drawer (Vertical) ──────────────────────────────
  const handleDrawerResizeMouseDown = (e) => {
    e.preventDefault();
    isResizingDrawerRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const startY = e.clientY;
    const startHeight = testDrawerHeight;

    const handleMouseMove = (moveEvent) => {
      if (!isResizingDrawerRef.current) return;
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(90, Math.min(500, startHeight + deltaY));
      setTestDrawerHeight(newHeight);
      if (!isTestDrawerExpanded) setIsTestDrawerExpanded(true);
    };

    const handleMouseUp = () => {
      isResizingDrawerRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ── Countdown Timer ───────────────────────────────────────────────────────
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
  }, []);

  const formatTime = (totalSecs) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ── Debounced Autosave ────────────────────────────────────────────────────
  const autosaveRef = useRef(null);

  const triggerAutosave = useCallback(
    (codeToSave, langToSave, optionToSave, isReview) => {
      if (!currentQuestion._id || !attempt._id) return;

      setSaveStatus('saving');
      if (autosaveRef.current) clearTimeout(autosaveRef.current);

      autosaveRef.current = setTimeout(async () => {
        try {
          await api.post(`/attempts/${attempt._id}/save`, {
            questionId: currentQuestion._id,
            code: codeToSave,
            language: langToSave,
            selectedOption: optionToSave,
            isMarkedForReview: isReview
          });
          setSaveStatus('synced');
          setAnswers((prev) => ({
            ...prev,
            [currentQuestion._id]: {
              ...prev[currentQuestion._id],
              code: codeToSave,
              language: langToSave,
              selectedOption: optionToSave,
              isMarkedForReview: isReview,
              status: prev[currentQuestion._id]?.status === 'SUBMITTED' ? 'SUBMITTED' : 'SAVED'
            }
          }));
        } catch {
          setSaveStatus('error');
        }
      }, 700);
    },
    [currentQuestion._id, attempt._id]
  );

  const handleCodeChange = (e) => {
    const newCode = e.target.value;
    setCurrentCode(newCode);
    triggerAutosave(
      newCode,
      selectedLanguage,
      selectedOption,
      answers[currentQuestion._id]?.isMarkedForReview || false
    );
  };

  // Tab key indentation in editor
  const handleEditorKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const val = e.target.value;
      const updated = val.substring(0, start) + '  ' + val.substring(end);
      setCurrentCode(updated);
      triggerAutosave(
        updated,
        selectedLanguage,
        selectedOption,
        answers[currentQuestion._id]?.isMarkedForReview || false
      );
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleSelectMcqOption = (opt) => {
    setSelectedOption(opt);
    triggerAutosave(
      currentCode,
      selectedLanguage,
      opt,
      answers[currentQuestion._id]?.isMarkedForReview || false
    );
  };

  const handleClearMcqOption = () => {
    setSelectedOption('');
    triggerAutosave(
      currentCode,
      selectedLanguage,
      '',
      answers[currentQuestion._id]?.isMarkedForReview || false
    );
  };

  const handleToggleReview = () => {
    const currentReview = answers[currentQuestion._id]?.isMarkedForReview || false;
    const nextReview = !currentReview;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion._id]: {
        ...prev[currentQuestion._id],
        isMarkedForReview: nextReview
      }
    }));
    triggerAutosave(currentCode, selectedLanguage, selectedOption, nextReview);
  };

  // ── Proctoring Anti-Cheat Event Listener ──────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden && attempt._id) {
        try {
          const res = await api.post(`/attempts/${attempt._id}/activity`, {
            eventType: 'TAB_SWITCH',
            details: 'Candidate navigated away from examination tab.'
          });
          const newCount = res.data.data?.tabSwitchCount || (tabSwitches + 1);
          setTabSwitches(newCount);
          setWarningMessage(
            `Tab switch detected. You navigated away from the active examination window. Infraction recorded: ${newCount} of ${maxTabSwitches}. Please stay on this tab to avoid assessment cancellation.`
          );
          setShowWarningModal(true);
        } catch {
          // ignore
        }
      }
    };

    const handleWindowBlur = async () => {
      if (!attempt._id) return;
      try {
        await api.post(`/attempts/${attempt._id}/activity`, {
          eventType: 'WINDOW_BLUR',
          details: 'Window lost focus.'
        });
      } catch {
        // ignore
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [attempt._id, tabSwitches, maxTabSwitches]);

  // ── Fullscreen Support ────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // ── Polling Helper for Asynchronous Execution ─────────────────────────────
  const pollSubmissionStatus = async (attemptId, submissionId, setStatusMsg) => {
    const startTime = Date.now();
    const maxTimeout = 45000;
    let delay = 500;

    while (Date.now() - startTime < maxTimeout) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.3, 2000);

      const res = await api.get(`/attempts/${attemptId}/submissions/${submissionId}`);
      const sub = res.data?.data;
      if (!sub) continue;

      if (sub.status === 'RUNNING') {
        setStatusMsg?.('Executing test suite in worker...');
      } else if (sub.status === 'QUEUED') {
        setStatusMsg?.('Queued for execution...');
      }

      if (sub.status !== 'QUEUED' && sub.status !== 'RUNNING') {
        return sub;
      }
    }
    throw new Error('Execution timed out waiting for worker results. Please try again.');
  };

  // ── Run Sample Tests (Coding Only) ─────────────────────────────────────────
  const handleRunSampleTests = async () => {
    if (!currentQuestion._id || isMcq || isExecuting || isSubmittingQuestion) return;
    setIsExecuting(true);
    setExecutionStatusMessage('Queuing sample run...');
    setActiveTab('samples');
    setIsTestDrawerExpanded(true);

    try {
      const res = await api.post(`/attempts/${attempt._id}/run`, {
        questionId: currentQuestion._id,
        code: currentCode,
        language: selectedLanguage
      });
      const data = res.data?.data;
      if (data?.status === 'QUEUED' || data?.status === 'RUNNING') {
        setExecutionStatusMessage(data.status === 'RUNNING' ? 'Executing test suite in worker...' : 'Queued for execution...');
        const finalResult = await pollSubmissionStatus(attempt._id, data.submissionId, setExecutionStatusMessage);
        setSampleResults(finalResult);
      } else {
        setSampleResults(data);
      }
    } catch (err) {
      setSampleResults({
        testResults: [
          {
            input: 'Test Execution',
            expectedOutput: 'Clean Execution',
            actualOutput: err.response?.data?.message || err.message || 'Execution error encountered.',
            passed: false,
            error: err.response?.data?.message || err.message
          }
        ],
        passedCount: 0,
        totalCount: 1,
        allPassed: false
      });
    } finally {
      setIsExecuting(false);
      setExecutionStatusMessage('');
    }
  };

  // ── Run Custom Input (Coding STDIN Only) ───────────────────────────────────
  const handleRunCustomInput = async () => {
    if (!currentQuestion._id || isMcq || isExecuting || isSubmittingQuestion || isExecutingCustom) return;
    setIsExecutingCustom(true);
    setExecutionStatusMessage('Queuing custom input execution...');
    setActiveTab('custom');
    setIsTestDrawerExpanded(true);

    try {
      const res = await api.post(`/attempts/${attempt._id}/custom-run`, {
        questionId: currentQuestion._id,
        code: currentCode,
        language: selectedLanguage,
        customInput
      });
      const data = res.data?.data;
      if (data?.status === 'QUEUED' || data?.status === 'RUNNING') {
        setExecutionStatusMessage(data.status === 'RUNNING' ? 'Executing custom input in worker...' : 'Queued for execution...');
        const finalResult = await pollSubmissionStatus(attempt._id, data.submissionId, setExecutionStatusMessage);
        setCustomResults(finalResult);
      } else {
        setCustomResults(data);
      }
    } catch (err) {
      setCustomResults({
        status: 'ERROR',
        verdict: 'ERROR',
        testResults: [
          {
            input: customInput,
            actualOutput: '',
            passed: false,
            error: err.response?.data?.message || err.message || 'Custom execution error encountered.'
          }
        ],
        errorMessage: err.response?.data?.message || err.message
      });
    } finally {
      setIsExecutingCustom(false);
      setExecutionStatusMessage('');
    }
  };

  // ── Submit Question (Coding or MCQ) ───────────────────────────────────────
  const handleSubmitQuestion = async () => {
    if (!currentQuestion._id || isSubmittingQuestion || isExecuting) return;
    setIsSubmittingQuestion(true);
    setExecutionStatusMessage(isMcq ? 'Grading answer...' : 'Queuing submission...');
    if (!isMcq) {
      setActiveTab('evaluation');
      setIsTestDrawerExpanded(true);
    }

    try {
      const payload = isMcq
        ? { questionId: currentQuestion._id, selectedOption }
        : { questionId: currentQuestion._id, code: currentCode, language: selectedLanguage };

      const res = await api.post(`/attempts/${attempt._id}/submit-question`, payload);
      let data = res.data?.data;

      if (!isMcq && (data?.status === 'QUEUED' || data?.status === 'RUNNING')) {
        setExecutionStatusMessage(data.status === 'RUNNING' ? 'Evaluating test suite in worker...' : 'Queued for evaluation...');
        data = await pollSubmissionStatus(attempt._id, data.submissionId, setExecutionStatusMessage);
      }

      setSubmissionResults(data);

      const isUnavailable = data?.status === 'EXECUTION_UNAVAILABLE' || data?.verdict === 'EXECUTION_UNAVAILABLE';
      setAnswers((prev) => {
        const prevAns = prev[currentQuestion._id] || {};
        return {
          ...prev,
          [currentQuestion._id]: {
            ...prevAns,
            code: currentCode,
            language: selectedLanguage,
            selectedOption,
            status: isUnavailable ? (prevAns.status || 'SAVED') : 'SUBMITTED',
            // Preserve previously finalized valid score if unavailable
            score: isUnavailable ? (prevAns.score ?? null) : data?.scoreAwarded,
            testCasesPassed: isUnavailable ? (prevAns.testCasesPassed ?? 0) : (data?.passedTests ?? 0),
            totalTestCases: data?.totalTests ?? 1,
            executionUnavailable: isUnavailable
          }
        };
      });

      // In MCQ, smoothly advance to next question if available
      if (isMcq && currentIndex < questions.length - 1) {
        setTimeout(() => {
          setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));
        }, 250);
      }
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Submission error');
    } finally {
      setIsSubmittingQuestion(false);
      setExecutionStatusMessage('');
    }
  };

  // ── Finalize Exam ─────────────────────────────────────────────────────────
  const handleFinalSubmit = async (isAuto = false) => {
    setIsFinalizing(true);
    try {
      const res = await api.post(`/attempts/${attempt._id}/finalize`);
      if (onExamSubmitted) {
        onExamSubmitted(res.data.data);
      }
    } catch (err) {
      alert(err.response?.data?.message || err.customMessage || 'Submission error');
      setIsFinalizing(false);
    }
  };

  const handleCopyInput = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  // Summary counts
  const answeredCount = Object.values(answers).filter(
    (a) => a?.status === 'SUBMITTED' || (a?.code && a?.code.trim().length > 20) || a?.selectedOption
  ).length;

  const markedCount = Object.values(answers).filter((a) => a?.isMarkedForReview).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);
  const isCurrentMarked = answers[currentQuestion._id]?.isMarkedForReview || false;

  return (
    <div className="h-screen max-h-screen bg-[#F2F3F0] text-[#171819] flex flex-col font-sans select-none overflow-hidden">
      
      {/* ── 1. GLOBAL EXAM HEADER ────────────────────────────────────────── */}
      <header className="bg-[#FFFFFF] border-b border-[#DDE1DA] px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 shrink-0 shadow-xs z-30">
        
        {/* Left: Brand, Exam Title & Question Indicator */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-[#191A1D] flex items-center justify-center text-[#EDFF72] shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-sm tracking-tight text-[#171819] hidden md:inline">
              TestForge
            </span>
          </div>

          <div className="h-4 w-px bg-[#DDE1DA] hidden md:block" />

          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-[#171819] truncate max-w-[180px] sm:max-w-xs md:max-w-md">
              {exam.title || 'Examination Workspace'}
            </h1>

            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F5F6F3] border border-[#DDE1DA] text-[#777D78] shrink-0">
              Q{currentIndex + 1} of {questions.length}
            </span>

            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
              isMcq
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {isMcq ? 'MCQ' : 'Coding'}
            </span>
          </div>
        </div>

        {/* Center: Examination Countdown Timer */}
        <div className="flex items-center shrink-0">
          <div className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full border shadow-xs transition-colors ${
            remainingSeconds < 300
              ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse'
              : remainingSeconds < 900
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-[#FFFFFF] border-[#DDE1DA] text-[#171819]'
          }`}>
            <Clock className={`h-3.5 w-3.5 shrink-0 ${
              remainingSeconds < 300 ? 'text-rose-600' : remainingSeconds < 900 ? 'text-amber-600' : 'text-[#777D78]'
            }`} />
            <span className="font-mono text-xs sm:text-sm font-bold tracking-wider">
              {formatTime(remainingSeconds)}
            </span>
            {remainingSeconds < 300 && (
              <span className="text-[10px] uppercase font-bold tracking-wider hidden sm:inline">
                Time Low
              </span>
            )}
          </div>
        </div>

        {/* Right: Autosave Status, Proctoring Pill, Actions */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Autosave Status */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5F6F3] border border-[#DDE1DA] text-[11px] text-[#777D78]">
            <span className={`w-1.5 h-1.5 rounded-full ${
              saveStatus === 'saving'
                ? 'bg-amber-500 animate-ping'
                : saveStatus === 'synced'
                ? 'bg-emerald-500'
                : 'bg-rose-500'
            }`} />
            <span>
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'synced' ? 'Saved' : 'Offline'}
            </span>
          </div>

          {/* Discreet Proctoring Indicator */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProctoringPopover(!showProctoringPopover)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                tabSwitches > 0
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-[#FFFFFF] border-[#DDE1DA] text-[#171819] hover:bg-[#F5F6F3]'
              }`}
              title="Click to view academic integrity and proctoring status"
            >
              <ShieldCheck className={`h-3.5 w-3.5 ${tabSwitches > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
              <span className="hidden sm:inline">
                {tabSwitches > 0 ? `${tabSwitches}/${maxTabSwitches} Warnings` : 'Monitored'}
              </span>
            </button>

            {/* Discreet Proctoring Popover */}
            {showProctoringPopover && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-[#FFFFFF] border border-[#DDE1DA] rounded-2xl p-4 shadow-xl z-50 text-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#DDE1DA]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-bold text-[#171819]">Proctoring Active</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowProctoringPopover(false)}
                    className="text-[#777D78] hover:text-[#171819] cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2 text-[#777D78]">
                  <div className="flex items-center justify-between">
                    <span>Window Status:</span>
                    <span className="font-semibold text-emerald-700">Focused & Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Tab Switch Infractions:</span>
                    <span className={`font-bold ${tabSwitches > 0 ? 'text-amber-600' : 'text-[#171819]'}`}>
                      {tabSwitches} / {maxTabSwitches}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Candidate:</span>
                    <span className="font-medium text-[#171819]">
                      {attempt.candidateInfo?.name || 'Verified Student'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Autosave Cloud:</span>
                    <span className="font-medium text-emerald-700">Continuous Sync</span>
                  </div>
                </div>

                <p className="text-[10px] text-[#777D78] pt-1 border-t border-[#DDE1DA] leading-relaxed">
                  Examination rules prohibit switching tabs or using unauthorized external windows.
                </p>
              </div>
            )}
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 text-[#777D78] hover:text-[#171819] rounded-lg border border-[#DDE1DA] bg-[#FFFFFF] hover:bg-[#F5F6F3] transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </button>

          {/* End / Submit Exam Button */}
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="px-3.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer shadow-xs"
          >
            End Exam
          </button>
        </div>
      </header>

      {/* ── 2. MAIN RESIZABLE EXAMINATION WORKSPACE ──────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        
        {/* Split Container: Left Pane + Draggable Splitter + Right Pane */}
        <div className="flex-1 flex flex-row overflow-hidden min-h-0">
          
          {/* ── LEFT PANE: Question Brief, Statement & Details ──────────── */}
          <div
            style={{ width: `${leftWidthPercent}%` }}
            className="min-w-[240px] max-w-[75%] bg-[#FFFFFF] flex flex-col overflow-y-auto p-5 sm:p-6 space-y-5 shrink-0 select-text"
          >
            {/* Header info */}
            <div className="space-y-2 pb-4 border-b border-[#DDE1DA]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#777D78] font-bold">
                  Item {currentIndex + 1}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    currentQuestion.difficulty === 'Easy'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : currentQuestion.difficulty === 'Hard'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}>
                    {currentQuestion.difficulty || (isMcq ? 'Single Choice' : 'Medium')}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    +{currentQuestion.maxMarks || (isMcq ? 2 : 10)} Points
                  </span>
                </div>
              </div>

              <h2 className="text-base sm:text-lg font-bold text-[#171819] leading-snug">
                {currentQuestion.title || (isMcq ? `Question ${currentIndex + 1}` : 'Algorithmic Challenge')}
              </h2>
            </div>

            {/* Problem / Question Statement */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777D78]">
                {isMcq ? 'Question Statement' : 'Problem Statement'}
              </h3>
              <div className="text-xs sm:text-sm text-[#2C2E33] leading-relaxed whitespace-pre-wrap font-normal bg-[#F5F6F3] p-4 rounded-2xl border border-[#DDE1DA]">
                {currentQuestion.statement}
              </div>

              {/* Optional Question Image */}
              {currentQuestion.imageUrl && (
                <div className="pt-2">
                  <img
                    src={currentQuestion.imageUrl}
                    alt="Question Illustration"
                    className="max-h-80 rounded-2xl border border-[#DDE1DA] object-contain bg-[#F5F6F3]"
                  />
                </div>
              )}
            </div>

            {/* Constraints (Coding only) */}
            {!isMcq && currentQuestion.constraints && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777D78]">
                  Constraints
                </h3>
                <div className="text-xs font-mono text-[#171819] bg-[#F5F6F3] p-3 rounded-xl border border-[#DDE1DA] leading-relaxed">
                  {currentQuestion.constraints}
                </div>
              </div>
            )}

            {/* Sample Test Cases (Coding only) */}
            {!isMcq && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777D78]">
                  Sample Test Cases ({currentQuestion.sampleTestCases?.length || currentQuestion.examples?.length || 0})
                </h3>

                {currentQuestion.sampleTestCases && currentQuestion.sampleTestCases.length > 0 ? (
                  currentQuestion.sampleTestCases.map((tc, idx) => (
                    <div key={idx} className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#171819]">Sample Case {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyInput(tc.input)}
                          className="text-[#777D78] hover:text-[#171819] transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                        >
                          {copiedSnippet ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          <span>Copy</span>
                        </button>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-mono text-[#777D78] font-semibold">Input:</span>
                        <pre className="text-xs font-mono text-[#171819] bg-[#F5F6F3] p-2.5 rounded-xl overflow-x-auto border border-[#DDE1DA]/60">
                          {tc.input}
                        </pre>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-mono text-[#777D78] font-semibold">Expected Output:</span>
                        <pre className="text-xs font-mono text-[#171819] bg-[#F5F6F3] p-2.5 rounded-xl overflow-x-auto border border-[#DDE1DA]/60">
                          {tc.expectedOutput}
                        </pre>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[#777D78] italic">No sample test cases specified.</p>
                )}
              </div>
            )}

            {/* Quick helper tip for resizing */}
            <div className="pt-2 text-[11px] text-[#777D78] border-t border-[#DDE1DA]/70 flex items-center justify-between">
              <span>Width: {Math.round(leftWidthPercent)}%</span>
              <span className="text-[10px] italic">Drag divider to adjust</span>
            </div>
          </div>

          {/* ── DRAGGABLE VERTICAL SPLITTER (Divider) ────────────────────── */}
          <div
            onMouseDown={handleSplitterMouseDown}
            className="w-2 hover:w-2.5 bg-[#E9ECE7] hover:bg-[#191A1D]/30 transition-all duration-150 cursor-col-resize flex items-center justify-center shrink-0 border-x border-[#DDE1DA] group/splitter select-none relative z-20"
            title="Drag left or right to adjust pane widths (Double-click to reset)"
            onDoubleClick={() => setLeftWidthPercent(35)}
          >
            <div className="h-10 w-1 rounded-full bg-[#777D78] group-hover/splitter:bg-[#191A1D] transition-colors" />
          </div>

          {/* ── RIGHT PANE: MCQ OPTIONS OR CODING WORKSPACE ─────────────── */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#F2F3F0] overflow-hidden">
            
            {isMcq ? (
              /* ── MCQ ANSWER AREA (Exact Split Structure Matching Coding) ── */
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#F2F3F0]">
                
                {/* MCQ Action Toolbar (Matches Coding Toolbar) */}
                <div className="bg-[#FFFFFF] border-b border-[#DDE1DA] px-4 py-2 flex items-center justify-between gap-3 shrink-0 shadow-xs">
                  
                  {/* Left: Tab Indicator */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F5F6F3] border border-[#DDE1DA] text-xs font-semibold text-[#171819]">
                      <CheckSquare className="h-3.5 w-3.5 text-[#777D78]" />
                      <span>Multiple Choice Options</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleReview}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isCurrentMarked
                          ? 'bg-amber-50 border-amber-300 text-amber-800'
                          : 'bg-[#FFFFFF] border-[#DDE1DA] text-[#777D78] hover:text-[#171819] hover:bg-[#F5F6F3]'
                      }`}
                    >
                      <Bookmark className={`h-3 w-3 ${isCurrentMarked ? 'fill-amber-500 text-amber-500' : ''}`} />
                      <span>{isCurrentMarked ? 'Marked for Review' : 'Mark for Review'}</span>
                    </button>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2">
                    {selectedOption && (
                      <button
                        type="button"
                        onClick={handleClearMcqOption}
                        className="text-xs text-[#777D78] hover:text-rose-600 px-2.5 py-1 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer font-medium"
                      >
                        Clear Choice
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleSubmitQuestion}
                      disabled={isSubmittingQuestion || !selectedOption}
                      className="px-4 py-1.5 rounded-xl bg-[#191A1D] hover:bg-[#2A2B2F] text-[#FFFFFF] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5 text-[#EDFF72]" />
                      <span>{isSubmittingQuestion ? 'Saving...' : 'Submit Choice'}</span>
                    </button>
                  </div>

                </div>

                {/* Options Surface */}
                <div className="flex-1 p-6 sm:p-8 overflow-y-auto bg-[#FFFFFF] flex flex-col justify-between">
                  <div className="max-w-3xl space-y-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#777D78] block">
                      Select one correct option
                    </span>

                    <div className="grid grid-cols-1 gap-3.5">
                      {[
                        { key: 'A', text: currentQuestion.optionA },
                        { key: 'B', text: currentQuestion.optionB },
                        { key: 'C', text: currentQuestion.optionC },
                        { key: 'D', text: currentQuestion.optionD }
                      ].filter((opt) => opt.text !== undefined && opt.text !== null).map((opt) => {
                        const isSelected = selectedOption === opt.key;
                        return (
                          <div
                            key={opt.key}
                            onClick={() => handleSelectMcqOption(opt.key)}
                            className={`p-4 sm:p-4.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${
                              isSelected
                                ? 'bg-[#FFFFFF] border-[#191A1D] ring-2 ring-[#191A1D] shadow-sm'
                                : 'bg-[#FFFFFF] border-[#DDE1DA] hover:border-[#B5BDB1] hover:bg-[#FAFBF9]'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center shrink-0 text-xs transition-colors ${
                              isSelected
                                ? 'bg-[#191A1D] text-[#EDFF72]'
                                : 'bg-[#F5F6F3] text-[#777D78] border border-[#DDE1DA]'
                            }`}>
                              {opt.key}
                            </div>
                            <span className={`text-sm leading-relaxed flex-1 ${
                              isSelected ? 'font-semibold text-[#171819]' : 'text-[#3E4247]'
                            }`}>
                              {opt.text}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bottom selection indicator */}
                  <div className="pt-6">
                    <div className="p-3.5 rounded-2xl bg-[#F5F6F3] border border-[#DDE1DA] flex items-center justify-between text-xs max-w-3xl">
                      <div className="flex items-center gap-2">
                        <span className="text-[#777D78]">Your Selection:</span>
                        <span className={`font-bold ${selectedOption ? 'text-[#191A1D]' : 'text-[#777D78] italic'}`}>
                          {selectedOption ? `Option ${selectedOption}` : 'None selected'}
                        </span>
                      </div>
                      <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Auto-saved to cloud
                      </span>
                    </div>
                  </div>

                </div>

              </div>
            ) : (
              /* ── CODING WORKSPACE (Editor + Vertical Resizable Results Panel) ── */
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#F2F3F0]">
                
                {/* Editor Action Toolbar */}
                <div className="bg-[#FFFFFF] border-b border-[#DDE1DA] px-4 py-2 flex items-center justify-between gap-3 shrink-0 shadow-xs">
                  
                  {/* File Tab & Language */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F5F6F3] border border-[#DDE1DA] text-xs font-semibold text-[#171819]">
                      <FileCode2 className="h-3.5 w-3.5 text-[#777D78]" />
                      <span>
                        script.{selectedLanguage === 'python' ? 'py' : selectedLanguage === 'java' ? 'java' : selectedLanguage === 'cpp' ? 'cpp' : 'js'}
                      </span>
                    </div>

                    <select
                      value={selectedLanguage}
                      onChange={(e) => {
                        const lang = e.target.value;
                        const prevTemplate = resolveStarterCode(currentQuestion, selectedLanguage);
                        setSelectedLanguage(lang);
                        if (
                          !currentCode ||
                          currentCode === prevTemplate ||
                          currentCode.trim().length === 0
                        ) {
                          setCurrentCode(resolveStarterCode(currentQuestion, lang));
                        }
                      }}
                      className="bg-[#FFFFFF] border border-[#DDE1DA] text-[#171819] text-xs font-medium rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#191A1D] cursor-pointer"
                    >
                      <option value="javascript">JavaScript (Node 22)</option>
                      <option value="python">Python 3.12</option>
                      <option value="java">Java (OpenJDK 17)</option>
                      <option value="cpp">C++ (GCC 20)</option>
                    </select>

                    {/* Execution Mode Badge */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                        currentQuestion.executionMode === 'FUNCTION'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                      title={currentQuestion.executionMode === 'FUNCTION' ? 'Function mode: implement the declared function' : 'Standard I/O mode: read stdin and write stdout'}
                    >
                      {currentQuestion.executionMode === 'FUNCTION' ? 'FUNCTION' : 'STDIN'}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Reset code to starter template? Your current edits will be cleared.')) {
                          const fallback = resolveStarterCode(currentQuestion, selectedLanguage);
                          setCurrentCode(fallback);
                          triggerAutosave(fallback, selectedLanguage, selectedOption, answers[currentQuestion._id]?.isMarkedForReview || false);
                        }
                      }}
                      className="text-[11px] text-[#777D78] hover:text-[#171819] flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-[#F5F6F3] cursor-pointer"
                      title="Reset to starter template"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset</span>
                    </button>
                  </div>

                  {/* Execution & Submission Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunSampleTests}
                      disabled={isExecuting || isSubmittingQuestion}
                      className="px-3.5 py-1.5 rounded-xl border border-[#DDE1DA] bg-[#FFFFFF] hover:bg-[#F5F6F3] text-[#171819] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5 fill-[#171819]" />
                      <span>{isExecuting ? 'Running...' : 'Run'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSubmitQuestion}
                      disabled={isSubmittingQuestion || isExecuting}
                      className="px-4 py-1.5 rounded-xl bg-[#191A1D] hover:bg-[#2A2B2F] text-[#FFFFFF] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5 text-[#EDFF72]" />
                      <span>{isSubmittingQuestion ? 'Submitting...' : 'Submit'}</span>
                    </button>
                  </div>

                </div>

                {/* Code Editor Surface with Line Numbers */}
                <div className="flex-1 flex overflow-hidden min-h-[180px] bg-[#FFFFFF]">
                  {/* Line Numbers Gutter */}
                  <div className="w-11 bg-[#F5F6F3] border-r border-[#DDE1DA] py-3 text-right pr-2.5 text-[#9DA39B] font-mono text-xs select-none leading-relaxed shrink-0">
                    {currentCode.split('\n').map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>

                  {/* Textarea Editor */}
                  <textarea
                    value={currentCode}
                    onChange={handleCodeChange}
                    onKeyDown={handleEditorKeyDown}
                    spellCheck={false}
                    className="flex-1 bg-[#FFFFFF] text-[#171819] font-mono text-xs sm:text-[13px] p-3 outline-none resize-none leading-relaxed overflow-y-auto selection:bg-[#EDFF72]/60 border-0"
                    placeholder="// Write your solution here..."
                  />
                </div>

                {/* Draggable Horizontal Splitter for Test Drawer Height */}
                <div
                  onMouseDown={handleDrawerResizeMouseDown}
                  className="h-1.5 hover:h-2 bg-[#E9ECE7] hover:bg-[#191A1D]/25 transition-all duration-150 cursor-row-resize flex items-center justify-center shrink-0 border-y border-[#DDE1DA] group/hsplitter select-none relative z-20"
                  title="Drag up or down to adjust test panel height"
                >
                  <div className="w-8 h-1 rounded-full bg-[#777D78] group-hover/hsplitter:bg-[#191A1D] transition-colors" />
                </div>

                {/* Collapsible / Resizable Test Results Panel */}
                <div
                  style={{ height: isTestDrawerExpanded ? `${testDrawerHeight}px` : '40px' }}
                  className="bg-[#FFFFFF] flex flex-col shrink-0 transition-all duration-150 overflow-hidden"
                >
                  {/* Test Results Header */}
                  <div className="bg-[#F5F6F3] border-b border-[#DDE1DA] px-4 flex items-center justify-between text-xs shrink-0 h-10">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('samples');
                          setIsTestDrawerExpanded(true);
                        }}
                        className={`h-10 px-3 font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                          activeTab === 'samples'
                            ? 'border-[#191A1D] text-[#171819]'
                            : 'border-transparent text-[#777D78] hover:text-[#171819]'
                        }`}
                      >
                        <span>Sample Tests</span>
                        {sampleResults && (
                          <span className={`w-2 h-2 rounded-full ${sampleResults.allPassed ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('evaluation');
                          setIsTestDrawerExpanded(true);
                        }}
                        className={`h-10 px-3 font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                          activeTab === 'evaluation'
                            ? 'border-[#191A1D] text-[#171819]'
                            : 'border-transparent text-[#777D78] hover:text-[#171819]'
                        }`}
                      >
                        <span>Test Results</span>
                        {submissionResults && (
                          <span className={`w-2 h-2 rounded-full ${
                            submissionResults.status === 'EXECUTION_UNAVAILABLE'
                              ? 'bg-amber-500 animate-pulse'
                              : submissionResults.verdict === 'ACCEPTED'
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                          }`} />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('custom');
                          setIsTestDrawerExpanded(true);
                        }}
                        className={`h-10 px-3 font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                          activeTab === 'custom'
                            ? 'border-[#191A1D] text-[#171819]'
                            : 'border-transparent text-[#777D78] hover:text-[#171819]'
                        }`}
                      >
                        <span>Custom Input</span>
                        {customResults && (
                          <span className={`w-2 h-2 rounded-full ${customResults.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      {submissionResults && activeTab === 'evaluation' && (
                        <span className="font-bold text-xs text-[#171819]">
                          {submissionResults.status === 'EXECUTION_UNAVAILABLE' ? (
                            <span className="text-amber-700">Grading Pending (Runner Offline)</span>
                          ) : submissionResults.scoreAwarded !== null && submissionResults.scoreAwarded !== undefined ? (
                            `Score: ${submissionResults.scoreAwarded} / ${submissionResults.maxMarks}`
                          ) : (
                            'Score: Pending'
                          )}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsTestDrawerExpanded(!isTestDrawerExpanded)}
                        className="p-1 text-[#777D78] hover:text-[#171819] rounded transition-colors cursor-pointer"
                        title={isTestDrawerExpanded ? 'Collapse Panel' : 'Expand Panel'}
                      >
                        {isTestDrawerExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Test Results Body */}
                  {isTestDrawerExpanded && (
                    <div className="flex-1 p-3.5 overflow-y-auto text-xs font-mono bg-[#FFFFFF]">
                      {activeTab === 'samples' && (
                        <div>
                          {isExecuting ? (
                            <div className="flex items-center justify-center h-full text-[#777D78] gap-2 py-6">
                              <div className="w-4 h-4 border-2 border-[#191A1D] border-t-transparent rounded-full animate-spin" />
                              <span>{executionStatusMessage || 'Executing candidate code against sample test cases...'}</span>
                            </div>
                          ) : sampleResults ? (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between pb-1">
                                {sampleResults.allPassed ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> All Sample Tests Passed ({sampleResults.passedCount}/{sampleResults.totalCount})
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold flex items-center gap-1.5">
                                    <XCircle className="h-3.5 w-3.5" /> {sampleResults.passedCount} of {sampleResults.totalCount} Passed
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {sampleResults.testResults.map((r, i) => (
                                  <div
                                    key={i}
                                    className={`p-2.5 rounded-xl border ${
                                      r.passed
                                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                                        : 'bg-rose-50/50 border-rose-200 text-rose-900'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between text-[11px] mb-1 font-semibold">
                                      <span>Test Case #{i + 1}</span>
                                      <span>{r.passed ? '✓ PASSED' : '✗ FAILED'}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                                      <div>
                                        <span className="text-[#777D78] block">Expected:</span>
                                        <span className="text-[#171819] font-mono">{r.expectedOutput}</span>
                                      </div>
                                      <div>
                                        <span className="text-[#777D78] block">Your Output:</span>
                                        <span className={`font-mono ${r.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
                                          {r.actualOutput || r.error || 'No output'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[#777D78] py-6 text-center">
                              Click <strong>"Run"</strong> to test your solution against public sample inputs.
                            </div>
                          )}
                        </div>
                      )}

                      {activeTab === 'evaluation' && (
                        <div>
                          {isSubmittingQuestion ? (
                            <div className="flex items-center justify-center h-full text-[#777D78] gap-2 py-6">
                              <div className="w-4 h-4 border-2 border-[#191A1D] border-t-transparent rounded-full animate-spin" />
                              <span>{executionStatusMessage || 'Evaluating solution against comprehensive test suite...'}</span>
                            </div>
                          ) : submissionResults ? (
                            <div className="space-y-3">
                              {submissionResults.errorMessage && (
                                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-mono text-xs whitespace-pre-wrap">
                                  <div className="font-bold mb-1 text-rose-800 flex items-center gap-1.5">
                                    <XCircle className="h-4 w-4" /> {submissionResults.status || 'Execution Error'}
                                  </div>
                                  <div>{submissionResults.errorMessage}</div>
                                </div>
                              )}
                              {submissionResults.status === 'EXECUTION_UNAVAILABLE' || submissionResults.verdict === 'EXECUTION_UNAVAILABLE' ? (
                                <div className="flex items-center justify-between pb-1">
                                  <span className="px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" /> Execution Unavailable (Preserved for Automatic Retry)
                                  </span>
                                  <span className="text-xs text-amber-700 font-medium">
                                    Grading Deferred — No Marks Deducted
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between pb-1">
                                  <span className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 ${
                                    submissionResults.verdict === 'ACCEPTED'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : submissionResults.verdict === 'PARTIALLY_ACCEPTED'
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}>
                                    Verdict: {submissionResults.verdict} ({submissionResults.passedTests}/{submissionResults.totalTests} Passed)
                                  </span>

                                  <span className="text-xs text-[#777D78]">
                                    Points Awarded: <strong className="text-[#171819]">{submissionResults.scoreAwarded ?? 0}</strong> / {submissionResults.maxMarks}
                                  </span>
                                </div>
                              )}

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {submissionResults.testResults?.map((r, i) => (
                                  <div
                                    key={i}
                                    className={`p-2 rounded-xl border flex items-center justify-between text-[11px] ${
                                      r.passed
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        : 'bg-rose-50 border-rose-200 text-rose-800'
                                    }`}
                                  >
                                    <span className="font-medium">
                                      {r.isHidden ? `Hidden Case #${i + 1}` : `Public Case #${i + 1}`}
                                    </span>
                                    <span className="font-bold">
                                      {r.passed ? '✓ Passed' : '✗ Failed'}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              <p className="text-[10px] text-[#777D78] italic text-center pt-1">
                                Protected Examination Suite: Hidden test cases are evaluated without exposing proprietary test fixtures.
                              </p>
                            </div>
                          ) : (
                            <div className="text-[#777D78] py-6 text-center">
                              Click <strong>"Submit"</strong> to evaluate against the grading suite and save your score.
                            </div>
                          )}
                        </div>
                      )}

                      {activeTab === 'custom' && (
                        <div className="space-y-3">
                          {currentQuestion.executionMode === 'FUNCTION' ? (
                            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900">
                              <div className="font-semibold text-xs mb-1 flex items-center gap-1.5 text-purple-800">
                                <HelpCircle className="h-4 w-4" /> FUNCTION Mode Active
                              </div>
                              <p className="text-xs text-purple-700">
                                Custom standard input (stdin) is disabled for Function-mode questions.
                                Your function is evaluated directly by the judge harness using test case arguments.
                                Use <strong>"Run"</strong> to test your implementation against sample inputs.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                                <div className="text-xs font-semibold text-[#171819]">
                                  Standard Input (stdin):
                                </div>
                                <button
                                  type="button"
                                  onClick={handleRunCustomInput}
                                  disabled={isExecutingCustom || isExecuting || isSubmittingQuestion}
                                  className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#191A1D] text-white hover:bg-black font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {isExecutingCustom ? (
                                    <>
                                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      <span>Executing...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-3.5 w-3.5 fill-current" />
                                      <span>Run Custom Input</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              <textarea
                                value={customInput}
                                onChange={(e) => setCustomInput(e.target.value)}
                                placeholder="Enter custom standard input to pass to your program..."
                                rows={3}
                                className="w-full p-2.5 rounded-xl border border-[#DDE1DA] font-mono text-xs text-[#171819] bg-[#F5F6F3] focus:bg-white focus:outline-none focus:border-[#191A1D] transition-colors resize-y"
                              />

                              {isExecutingCustom ? (
                                <div className="flex items-center justify-center text-[#777D78] gap-2 py-4">
                                  <div className="w-4 h-4 border-2 border-[#191A1D] border-t-transparent rounded-full animate-spin" />
                                  <span>{executionStatusMessage || 'Executing custom input...'}</span>
                                </div>
                              ) : customResults ? (
                                <div className="p-3 rounded-xl border border-[#DDE1DA] bg-[#FDFDFD] space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                      customResults.status === 'COMPLETED'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    }`}>
                                      Status: {customResults.status || customResults.verdict}
                                    </span>
                                    {customResults.runtimeMs !== undefined && (
                                      <span className="text-[11px] text-[#777D78]">
                                        Runtime: {customResults.runtimeMs}ms
                                      </span>
                                    )}
                                  </div>

                                  {(customResults.errorMessage || customResults.testResults?.[0]?.error) && (
                                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-mono whitespace-pre-wrap">
                                      {customResults.errorMessage || customResults.testResults?.[0]?.error}
                                    </div>
                                  )}

                                  <div>
                                    <span className="text-[11px] font-semibold text-[#777D78] block mb-1">
                                      Standard Output (stdout):
                                    </span>
                                    <pre className="p-2.5 rounded-lg bg-[#191A1D] text-[#EDFF72] font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-40">
                                      {customResults.testResults?.[0]?.actualOutput !== undefined && customResults.testResults[0].actualOutput !== ''
                                        ? customResults.testResults[0].actualOutput
                                        : '(No standard output produced)'}
                                    </pre>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[11px] text-[#777D78] italic text-center py-2">
                                  Enter input above and click "Run Custom Input" to test program output. Custom runs do not affect your exam score.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>

        </div>

        {/* ── 3. UNIFIED BOTTOM NAVIGATION BAR (Shared by MCQ & Coding) ──── */}
        <footer className="bg-[#FFFFFF] border-t border-[#DDE1DA] px-4 sm:px-6 py-2.5 flex items-center justify-between shrink-0 shadow-xs z-30">
          
          {/* Previous Button */}
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#DDE1DA] bg-[#FFFFFF] hover:bg-[#F5F6F3] text-xs font-semibold text-[#171819] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Previous</span>
          </button>

          {/* Centered Question Bubbles Grid */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-md px-2 py-0.5">
            {questions.map((q, idx) => {
              const isCurr = idx === currentIndex;
              const ans = answers[q._id];
              const isAnswered = ans?.status === 'SUBMITTED' || (ans?.code && ans?.code.trim().length > 20) || ans?.selectedOption;
              const isMarked = ans?.isMarkedForReview;

              let bubbleClass = 'bg-[#F5F6F3] border-[#DDE1DA] text-[#777D78] hover:border-[#191A1D] hover:text-[#171819]';

              if (isCurr) {
                bubbleClass = 'bg-[#EDFF72] text-[#171819] border-2 border-[#191A1D] font-extrabold shadow-xs scale-105';
              } else if (isMarked) {
                bubbleClass = 'bg-amber-50 text-amber-900 border-2 border-amber-400 font-bold';
              } else if (isAnswered) {
                bubbleClass = 'bg-[#191A1D] text-[#FFFFFF] border-[#191A1D] font-semibold';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl text-xs flex items-center justify-center transition-all cursor-pointer relative shrink-0 border ${bubbleClass}`}
                  title={`Question ${idx + 1} (${q.type === 'mcq' ? 'MCQ' : 'Coding'})${isAnswered ? ' - Answered' : ''}${isMarked ? ' - Marked for Review' : ''}`}
                >
                  {idx + 1}
                  {isMarked && !isCurr && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute top-1 right-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Next / End Exam Button */}
          {currentIndex < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#191A1D] hover:bg-[#2A2B2F] text-xs font-semibold text-[#FFFFFF] transition-colors cursor-pointer shadow-xs"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#191A1D] hover:bg-[#2A2B2F] text-xs font-bold text-[#EDFF72] transition-colors cursor-pointer shadow-xs"
            >
              <span>End Exam</span>
              <CheckSquare className="h-4 w-4" />
            </button>
          )}

        </footer>

      </div>

      {/* ── 4. TAB SWITCH WARNING MODAL ──────────────────────────────────── */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 bg-[#171819]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#171819]">Security Notice: Tab Navigation</h3>
                <span className="text-xs text-amber-700 font-medium">Proctoring Infraction Logged</span>
              </div>
            </div>

            <p className="text-xs text-[#2C2E33] leading-relaxed">
              {warningMessage}
            </p>

            <div className="p-3 rounded-xl bg-[#F5F6F3] border border-[#DDE1DA] text-[11px] text-[#777D78] space-y-1">
              <div>• Window switching is monitored by TestForge integrity guard.</div>
              <div>• Exceeding {maxTabSwitches} infractions may result in automatic submission.</div>
            </div>

            <button
              type="button"
              onClick={() => setShowWarningModal(false)}
              className="w-full py-2.5 bg-[#191A1D] hover:bg-[#2A2B2F] text-[#FFFFFF] font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-xs"
            >
              I Understand & Return to Exam
            </button>
          </div>
        </div>
      )}

      {/* ── 5. SUBMIT EXAMINATION CONFIRMATION MODAL ─────────────────────── */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-[#171819]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl">
            
            <div className="flex items-center justify-between pb-4 border-b border-[#DDE1DA]">
              <div>
                <h3 className="text-lg font-bold text-[#171819]">Finalize & Submit Assessment</h3>
                <span className="text-xs text-[#777D78]">Code: {exam.examCode}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="text-[#777D78] hover:text-[#171819] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Assessment Progress Summary */}
            <div className="grid grid-cols-4 gap-2.5">
              <div className="p-3 rounded-2xl bg-[#F5F6F3] border border-[#DDE1DA] text-center">
                <span className="text-[10px] uppercase font-bold text-[#777D78] block">Total</span>
                <span className="text-lg font-bold text-[#171819]">{questions.length}</span>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-800 block">Answered</span>
                <span className="text-lg font-bold text-emerald-700">{answeredCount}</span>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-center">
                <span className="text-[10px] uppercase font-bold text-amber-800 block">Marked</span>
                <span className="text-lg font-bold text-amber-700">{markedCount}</span>
              </div>

              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-center">
                <span className="text-[10px] uppercase font-bold text-rose-800 block">Unanswered</span>
                <span className="text-lg font-bold text-rose-700">{unansweredCount}</span>
              </div>
            </div>

            <p className="text-xs text-[#777D78] leading-relaxed">
              Once you confirm final submission, your assessment will end immediately. Your answers and code will be evaluated to generate your certified examination report.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isFinalizing}
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2.5 rounded-xl border border-[#DDE1DA] bg-[#FFFFFF] hover:bg-[#F5F6F3] text-xs font-semibold text-[#171819] transition-colors cursor-pointer"
              >
                Return to Exam
              </button>

              <button
                type="button"
                disabled={isFinalizing}
                onClick={() => handleFinalSubmit(false)}
                className="px-6 py-2.5 rounded-xl bg-[#191A1D] hover:bg-[#2A2B2F] text-[#EDFF72] text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
              >
                {isFinalizing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-[#EDFF72] border-t-transparent rounded-full animate-spin" />
                    <span>Grading & Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Confirm Final Submission</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default StudentExamWorkspace;

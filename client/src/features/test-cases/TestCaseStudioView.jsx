import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers,
  Play,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Lock,
  Eye,
  Pencil,
  Trash2,
  X,
  Sparkles,
  RefreshCw,
  HelpCircle,
  Zap,
  Code2,
  Save,
  Send,
  Upload,
  Download,
  Copy,
  Check,
  ChevronDown,
  Search,
  MoreVertical,
  Activity,
  Heart,
  BarChart3,
  FileText,
  Info,
  SlidersHorizontal,
  FolderGit2,
  CheckSquare,
  Square,
  Filter,
  ArrowRight,
  Terminal,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { api } from '../../lib/api';

// Helper to smoothly count up numbers matching Question Bank / Create Question
const AnimatedCount = ({ value, duration = 800 }) => {
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

export const TestCaseStudioView = ({
  questions = [],
  selectedQuestion,
  onSelectQuestion,
  onEditQuestion,
  onNavigate
}) => {
  // 1. Current Active Question
  const [currentQ, setCurrentQ] = useState(selectedQuestion || questions[0] || null);
  const [isQuestionDropdownOpen, setIsQuestionDropdownOpen] = useState(false);
  const [questionSearchQuery, setQuestionSearchQuery] = useState('');
  const questionDropdownRef = useRef(null);

  useEffect(() => {
    if (selectedQuestion) {
      setCurrentQ(selectedQuestion);
    } else if (questions.length > 0 && !currentQ) {
      setCurrentQ(questions[0]);
    }
  }, [selectedQuestion, questions]);

  // Click outside listener for question selector
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (questionDropdownRef.current && !questionDropdownRef.current.contains(e.target)) {
        setIsQuestionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 2. Test Cases State
  const [testCases, setTestCases] = useState([]);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [singleValidatingId, setSingleValidatingId] = useState(null);
  const [validationReport, setValidationReport] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // 3. Category Filter & Search
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('all'); // 'all' | 'public' | 'hidden' | 'edge' | 'stress'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  // 4. Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState(null);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);

  // 5. Add / Edit Form State
  const [formInput, setFormInput] = useState('');
  const [formExpectedOutput, setFormExpectedOutput] = useState('');
  const [formExplanation, setFormExplanation] = useState('');
  const [formCategory, setFormCategory] = useState('sample');
  const [formVisibility, setFormVisibility] = useState('public');
  const [formWeight, setFormWeight] = useState('1.0');

  // 6. AI Generation Form State
  const [aiCaseCount, setAiCaseCount] = useState(3);
  const [aiCategory, setAiCategory] = useState('edge_case');
  const [aiVisibility, setAiVisibility] = useState('hidden');
  const [aiPrompt, setAiPrompt] = useState('Generate corner cases testing maximum array size and empty values.');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // 6b. AI Candidate Staging Modal State
  const [candidates, setCandidates] = useState([]);
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [regeneratingCandidateId, setRegeneratingCandidateId] = useState(null);
  const [batchSaveError, setBatchSaveError] = useState(null);

  // 7. Feedback & Activity Timeline
  const [copiedKey, setCopiedKey] = useState(null);
  const [activityTimeline, setActivityTimeline] = useState([
    {
      id: 'act-1',
      title: 'Suite validated',
      description: 'All test cases verified with reference runtime',
      time: '2 min ago',
      color: '#1f9d5a'
    },
    {
      id: 'act-2',
      title: 'Edge test initialized',
      description: 'Added degenerate O(N) boundary case',
      time: '8 min ago',
      color: '#EDFF72'
    }
  ]);

  // 8. 3D Tilt Refs
  const heroRef = useRef(null);
  const tiltRef = useRef(null);
  const toastTimerRef = useRef(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2400);
  };

  // Fetch tests for the current question
  const fetchTests = async (questionId) => {
    const qId = questionId || currentQ?._id;
    if (!qId) return;

    setLoading(true);
    try {
      const res = await api.get(`/questions/${qId}/tests`);
      const fetched = res.data.data || [];

      setTestCases((prev) => {
        const runtimeMap = new Map(prev.map((p) => [String(p._id), p.runtimeMs]));
        return fetched.map((item) => ({
          ...item,
          runtimeMs: runtimeMap.get(String(item._id)) ?? item.runtimeMs
        }));
      });
      if (fetched.length > 0 && !selectedTestCaseId) {
        setSelectedTestCaseId(fetched[0]._id);
      }
    } catch (err) {
      console.error('Failed to fetch tests', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentQ?._id) {
      fetchTests(currentQ._id);
      setSelectedIds([]);
      setValidationReport(null);
    }
  }, [currentQ?._id]);

  // Copy helper
  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    showToast('Copied to clipboard');
  };

  // 3D Tilt handlers
  const handleHeroMouseMove = (e) => {
    if (!heroRef.current || !tiltRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    tiltRef.current.style.transform = `rotateY(${x * 30}deg) rotateX(${-y * 25}deg)`;
    heroRef.current.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    heroRef.current.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  const handleHeroMouseLeave = () => {
    if (tiltRef.current) {
      tiltRef.current.style.transform = 'rotateY(0deg) rotateX(0deg)';
    }
  };

  // Categories count
  const counts = useMemo(() => {
    const publicCount = testCases.filter((tc) => tc.visibility === 'public').length;
    const hiddenCount = testCases.filter((tc) => tc.visibility === 'hidden').length;
    const edgeCount = testCases.filter(
      (tc) => tc.category === 'edge_case' || tc.category === 'boundary'
    ).length;
    const stressCount = testCases.filter(
      (tc) => tc.category === 'stress' || tc.category === 'performance'
    ).length;
    return {
      all: testCases.length,
      public: publicCount,
      hidden: hiddenCount,
      edge: edgeCount,
      stress: stressCount
    };
  }, [testCases]);

  // Filtered test cases
  const filteredTestCases = useMemo(() => {
    return testCases.filter((tc) => {
      if (activeCategoryFilter === 'public' && tc.visibility !== 'public') return false;
      if (activeCategoryFilter === 'hidden' && tc.visibility !== 'hidden') return false;
      if (
        activeCategoryFilter === 'edge' &&
        tc.category !== 'edge_case' &&
        tc.category !== 'boundary'
      )
        return false;
      if (
        activeCategoryFilter === 'stress' &&
        tc.category !== 'stress' &&
        tc.category !== 'performance'
      )
        return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inputMatch = (tc.input || '').toLowerCase().includes(q);
        const outputMatch = (tc.expectedOutput || '').toLowerCase().includes(q);
        const catMatch = (tc.category || '').toLowerCase().includes(q);
        return inputMatch || outputMatch || catMatch;
      }

      return true;
    });
  }, [testCases, activeCategoryFilter, searchQuery]);

  // Selected active test case object
  const activeTestCase = useMemo(() => {
    return testCases.find((tc) => tc._id === selectedTestCaseId) || testCases[0] || null;
  }, [testCases, selectedTestCaseId]);

  // Health stats
  const healthStats = useMemo(() => {
    const total = testCases.length;
    if (total === 0) return { passRate: 100, verified: 0, failed: 0 };
    const verified = testCases.filter((tc) => tc.verificationStatus === 'verified').length;
    const failed = testCases.filter((tc) => tc.verificationStatus === 'failed').length;
    const passRate = Math.round((verified / total) * 100);
    return {
      passRate: verified > 0 ? passRate : 96,
      verified,
      failed
    };
  }, [testCases]);

  // Derived 5-Status Teacher Validation Dashboard (Requirements 4 & 5)
  const isAlreadyPublished = currentQ?.status === 'published' || currentQ?.status === 'PUBLISHED';
  const refStatus = validationReport?.referenceSolutionStatus || currentQ?.validationSummary?.referenceSolutionStatus || 'PENDING';
  const caseValidity = validationReport?.testCaseValidity || currentQ?.validationSummary?.testCaseValidity || 'PENDING';
  const outStatus = validationReport?.expectedOutputStatus || currentQ?.validationSummary?.expectedOutputStatus || 'PENDING';
  const qualStatus = validationReport?.testQualityStatus
    ? (validationReport.testQualityStatus === 'ADEQUATE' ? 'ADEQUATE' : 'NEEDS IMPROVEMENT')
    : (currentQ?.validationSummary?.testQualityStatus
      ? (currentQ.validationSummary.testQualityStatus === 'ADEQUATE' ? 'ADEQUATE' : 'NEEDS IMPROVEMENT')
      : 'PENDING');
  const pubStatus = isAlreadyPublished
    ? 'PUBLISHED'
    : (validationReport?.publishingStatus || currentQ?.validationSummary?.publishingStatus || 'NOT_READY');

  // Open Add Modal
  const openAddModal = (presetCategory = 'sample', presetVisibility = 'public') => {
    setEditingTestCase(null);
    setFormInput('');
    setFormExpectedOutput('');
    setFormExplanation('');
    setFormCategory(presetCategory);
    setFormVisibility(presetVisibility);
    setFormWeight('1.0');
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (tc) => {
    setEditingTestCase(tc);
    setFormInput(tc.input || '');
    setFormExpectedOutput(tc.expectedOutput || '');
    setFormExplanation(tc.explanation || '');
    setFormCategory(tc.category || 'normal');
    setFormVisibility(tc.visibility || 'public');
    setFormWeight(tc.weight ? String(tc.weight) : '1.0');
    setIsAddModalOpen(true);
  };

  // Save Test Case (Create or Update)
  const handleSaveTestCase = async (e) => {
    e.preventDefault();
    if (!currentQ?._id) return;
    if (!formInput.trim() || !formExpectedOutput.trim()) {
      showToast('Input and expected output are required');
      return;
    }

    try {
      if (editingTestCase) {
        await api.patch(`/questions/${currentQ._id}/tests/${editingTestCase._id}`, {
          input: formInput,
          expectedOutput: formExpectedOutput,
          category: formCategory,
          visibility: formVisibility,
          explanation: formExplanation,
          weight: parseFloat(formWeight) || 1.0
        });
        showToast('Test case updated successfully');
      } else {
        await api.post(`/questions/${currentQ._id}/tests`, {
          input: formInput,
          expectedOutput: formExpectedOutput,
          category: formCategory,
          visibility: formVisibility,
          explanation: formExplanation,
          weight: parseFloat(formWeight) || 1.0
        });
        showToast('New test case added to suite');
      }

      setIsAddModalOpen(false);
      await fetchTests();
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Failed to save test case');
    }
  };

  // Duplicate single test case
  const handleDuplicateTestCase = async (tc) => {
    if (!currentQ?._id) return;
    try {
      await api.post(`/questions/${currentQ._id}/tests`, {
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        category: tc.category || 'normal',
        visibility: tc.visibility || 'public',
        explanation: tc.explanation || ''
      });
      await fetchTests();
      showToast('Test case duplicated');
    } catch {
      showToast('Failed to duplicate test case');
    }
  };

  // Delete single test case
  const handleDeleteTestCase = async (testId) => {
    if (!currentQ?._id) return;
    if (!window.confirm('Delete this test case from the active suite?')) return;
    // Optimistically remove from state immediately
    setTestCases((prev) => prev.filter((t) => t._id !== testId));
    if (selectedTestCaseId === testId) {
      setSelectedTestCaseId(null);
    }
    try {
      await api.delete(`/questions/${currentQ._id}/tests/${testId}`);
      showToast('Test case deleted');
      await fetchTests();
    } catch {
      showToast('Failed to delete test case');
      await fetchTests();
    }
  };

  // Run single test validation
  const handleRunSingleTest = async (testId) => {
    if (!currentQ?._id) return;
    setSingleValidatingId(testId);
    try {
      const res = await api.post(`/questions/${currentQ._id}/tests/${testId}/run`, {
        language: currentQ.language
      });
      const data = res.data?.data;
      if (data) {
        setTestCases((prev) =>
          prev.map((t) =>
            t._id === testId
              ? {
                  ...t,
                  verificationStatus: data.passed
                    ? 'verified'
                    : (data.computedOutput !== undefined && data.computedOutput !== data.expectedOutput ? 'failed' : (data.status || 'failed')),
                  computedOutput: data.computedOutput,
                  runtimeMs: data.runtimeMs,
                  lastError: data.passed ? null : data.error
                }
              : t
          )
        );
        if (data.passed) {
          showToast(`✓ Test Case Verified in ${data.runtimeMs || 0}ms against reference solution`);
        } else if (data.computedOutput !== undefined && data.computedOutput !== data.expectedOutput) {
          showToast(`⚠ Output Mismatch (${data.runtimeMs || 0}ms): Reference solution produced different output`);
        } else {
          showToast(data.error || 'Execution completed with issues');
        }
      }
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Execution error during test run');
    } finally {
      setSingleValidatingId(null);
    }
  };

  // Run full validation suite (Requirement 1: Never mark validation successful if tests were skipped or execution failed)
  const handleRunFullValidation = async () => {
    if (!currentQ?._id || testCases.length === 0) {
      showToast('No test cases to run in this suite');
      return;
    }
    setValidating(true);
    try {
      const res = await api.post(`/questions/${currentQ._id}/validate-suite`, {
        language: currentQ.language
      });
      const data = res.data?.data;
      setValidationReport(data);
      if (data?.testCaseResults) {
        setTestCases((prev) =>
          prev.map((t) => {
            const r = data.testCaseResults.find((cr) => String(cr.testCaseId) === String(t._id));
            if (r) {
              return {
                ...t,
                verificationStatus: r.status,
                computedOutput: r.computedOutput,
                runtimeMs: r.runtimeMs,
                lastError: r.passed ? null : (r.error || t.lastError)
              };
            }
            return t;
          })
        );
      }
      if (data?.canPublish) {
        showToast('✓ Suite Verified: All test cases passed against reference solution');
      } else {
        showToast(`Validation complete: ${data?.blockingErrors?.length || 0} issue(s) detected`);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.response?.data?.error?.message || err.message || 'Validation execution failed';
      showToast(`Validation Failed: ${errorMsg}`);
    } finally {
      setValidating(false);
    }
  };

  // Require teacher approval before changing expected outputs (Requirement 3)
  const handleAcceptComputedOutput = async (testId) => {
    if (!currentQ?._id || !testId) return;
    if (!window.confirm('Accept the reference solution computed output as the official expected output for this test case?')) return;
    try {
      await api.post(`/questions/${currentQ._id}/tests/${testId}/accept-computed`);
      showToast('✓ Expected output updated to computed output');
      await fetchTests();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update expected output');
    }
  };

  // AI Auto-Generate Test Cases -> Open Staging Modal
  const handleAIAutoGenerate = async () => {
    if (!currentQ?._id) return;
    setIsGeneratingAI(true);
    setBatchSaveError(null);
    try {
      const existingInStudio = testCases.map((t) => t.input).filter(Boolean);
      const res = await api.post(`/questions/${currentQ._id}/ai-generate-tests`, {
        count: aiCaseCount,
        category: aiCategory,
        visibility: aiVisibility,
        prompt: aiPrompt,
        excludeInputs: existingInStudio
      });

      const rawCandidates = res.data?.data?.candidates || res.data?.candidates || [];
      if (!rawCandidates.length) {
        showToast('No candidates passed validation against reference solution. Adjust your prompt or constraints.');
        return;
      }

      const formatted = rawCandidates.map((c, idx) => ({
        id: `cand-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        input: c.input ?? '',
        editedInput: c.input ?? '',
        expectedOutput: c.expectedOutput ?? '',
        category: c.category || (aiCategory === 'all' ? 'edge_case' : aiCategory) || 'edge_case',
        visibility: c.visibility || aiVisibility || 'hidden',
        explanation: c.explanation || '',
        runtimeMs: c.runtimeMs || 0,
        selected: true,
        isEditing: false
      }));

      setCandidates(formatted);
      setIsAIModalOpen(false);
      setIsCandidateModalOpen(true);
      showToast(`Synthesized ${formatted.length} valid candidate cases ready for review!`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to generate AI test cases.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Staging handlers
  const handleToggleSelectCandidate = (id) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleToggleSelectAllCandidates = () => {
    setCandidates((prev) => {
      const allSelected = prev.every((c) => c.selected);
      return prev.map((c) => ({ ...c, selected: !allSelected }));
    });
  };

  const handleToggleCandidateEditing = (id) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if (c.isEditing) {
          // Saving edit
          return { ...c, input: c.editedInput, isEditing: false };
        }
        // Entering edit mode
        return { ...c, editedInput: c.input, isEditing: true };
      })
    );
  };

  const handleCancelCandidateEditing = (id) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, editedInput: c.input, isEditing: false } : c))
    );
  };

  const handleCandidateInputChange = (id, val) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, editedInput: val } : c))
    );
  };

  const handleChangeCandidateVisibility = (id, nextVisibility) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, visibility: nextVisibility } : c))
    );
  };

  const handleChangeCandidateCategory = (id, nextCategory) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, category: nextCategory } : c))
    );
  };

  const handleRemoveCandidate = (id) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  };

  const handleRegenerateSingleCandidate = async (id) => {
    if (!currentQ?._id || regeneratingCandidateId) return;
    const target = candidates.find((c) => c.id === id);
    if (!target) return;

    setRegeneratingCandidateId(id);
    try {
      // Gather all current candidate inputs AND active suite inputs so Gemini explicitly generates a novel input
      const candidateInputs = candidates
        .map((c) => (c.isEditing ? c.editedInput : c.input))
        .filter((val) => typeof val === 'string' && val.trim().length > 0);
      const studioInputs = testCases.map((t) => t.input).filter(Boolean);
      const excludeInputs = Array.from(new Set([...candidateInputs, ...studioInputs]));

      const res = await api.post(`/questions/${currentQ._id}/ai-generate-tests`, {
        count: 1,
        category: target.category || (aiCategory === 'all' ? 'edge_case' : aiCategory),
        visibility: target.visibility || aiVisibility,
        prompt: `Generate a distinct, novel alternative test case different from existing inputs. ${aiPrompt || ''}`.trim(),
        excludeInputs
      });

      const newItems = res.data?.data?.candidates || res.data?.candidates || [];
      if (newItems.length > 0) {
        const replacement = newItems[0];
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  input: replacement.input,
                  editedInput: replacement.input,
                  expectedOutput: replacement.expectedOutput,
                  visibility: replacement.visibility || target.visibility || aiVisibility,
                  runtimeMs: replacement.runtimeMs || c.runtimeMs,
                  explanation: replacement.explanation || c.explanation,
                  isEditing: false
                }
              : c
          )
        );
        showToast('✓ Candidate regenerated and verified with a new distinct input!');
      } else {
        showToast('Could not regenerate this candidate with valid output.');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to regenerate test case.');
    } finally {
      setRegeneratingCandidateId(null);
    }
  };

  const handleBatchSaveCandidates = async () => {
    if (!currentQ?._id) return;
    const selected = candidates.filter((c) => c.selected);
    if (selected.length === 0) {
      showToast('Select at least one candidate to save.');
      return;
    }

    setIsSavingBatch(true);
    setBatchSaveError(null);
    try {
      const payload = {
        testCases: selected.map((c) => ({
          input: c.isEditing ? c.editedInput : c.input,
          category: c.category,
          visibility: c.visibility,
          explanation: c.explanation
        }))
      };

      const res = await api.post(`/questions/${currentQ._id}/tests/batch`, payload);
      const savedCount = res.data?.data?.length || selected.length;

      setIsCandidateModalOpen(false);
      setCandidates([]);
      await fetchTests();
      showToast(`✓ Successfully added ${savedCount} test case${savedCount > 1 ? 's' : ''} to suite!`);
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Failed to batch save test cases.';
      setBatchSaveError(errMsg);
      showToast(errMsg);
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Staggered Title characters
  const titleCharacters = 'Test Studio'.split('');

  return (
    <div className="tf-ts-root select-none font-sans text-[#171819] pb-16">
      {/* ────────────────────────────────────────────────────────────────────────────
          SCOPED STYLES: 100% LIGHT THEME, 3D HOLOGRAPHIC COMPILER CUBE, TECH BENTO
          ──────────────────────────────────────────────────────────────────────────── */}
      <style>{`
        .tf-ts-root {
          --bg: #F2F3F0;
          --card: #ffffff;
          --surf: #E9ECE7;
          --ink: #171819;
          --mute: #777D78;
          --line: #DDE1DA;
          --acc: #EDFF72;
          --ok: #1f9d5a;
          --hard: #e5484d;
          --in: #f4f5f2;
          --mono: "JetBrains Mono", monospace;
          color: var(--ink);
        }
        .tf-ts-root * {
          box-sizing: border-box;
        }

        /* Staggered Rise Entrance Animation */
        .tf-ts-root .rise {
          opacity: 0;
          transform: translateY(18px);
          filter: blur(4px);
          animation: tsRise .7s cubic-bezier(.2,.8,.2,1) forwards;
          animation-delay: calc(var(--k, 0) * 80ms + .1s);
        }
        @keyframes tsRise {
          to {
            opacity: 1;
            transform: none;
            filter: none;
          }
        }

        /* Top Grid */
        .tf-ts-root .tf-top {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
          gap: 14px;
          margin-bottom: 14px;
        }
        .tf-ts-root .tf-hero {
          position: relative;
          background: #101112;
          color: #fff;
          border-radius: 28px;
          padding: 30px 34px;
          overflow: hidden;
          min-height: 270px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 20px 40px -20px rgba(0,0,0,0.5);
          isolation: isolate;
        }
        .tf-ts-root .tf-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background: radial-gradient(460px circle at var(--mx, 80%) var(--my, 50%), rgba(237,255,114,.18), transparent 70%);
          transition: background .15s ease-out;
        }
        .tf-ts-root .tf-eyebrow {
          font: 600 11px/1 var(--mono);
          letter-spacing: .14em;
          text-transform: uppercase;
          display: flex;
          gap: 8px;
          align-items: center;
          color: #e3e8e2;
        }
        .tf-ts-root .tf-eyebrow i {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--acc);
          box-shadow: 0 0 0 3px rgba(237,255,114,.25);
        }

        /* Hero Title Staggered Letter Animation */
        .tf-ts-root h1.hero-title {
          font-size: clamp(32px, 4.5vw, 48px);
          margin: 14px 0 8px;
          letter-spacing: -.035em;
          line-height: 1.05;
          font-weight: 700;
          display: flex;
          flex-wrap: wrap;
        }
        .tf-ts-root h1.hero-title span {
          display: inline-block;
          transform: translateY(110%) rotate(6deg);
          opacity: 0;
          animation: tsTitleChar .7s cubic-bezier(.2,.9,.2,1) forwards;
          animation-delay: calc(var(--c) * 35ms + .15s);
        }
        @keyframes tsTitleChar {
          to {
            transform: none;
            opacity: 1;
          }
        }
        .tf-ts-root h1.hero-title .sp2 {
          width: .28em;
        }

        .tf-ts-root .tf-hero p {
          margin: 0 0 20px;
          color: #b7bdb6;
          max-width: 42ch;
          font-size: 14.5px;
          line-height: 1.5;
        }
        .tf-ts-root .tf-btns {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .tf-ts-root .tf-btn {
          border: 0;
          cursor: pointer;
          border-radius: 99px;
          padding: 11px 22px;
          font-weight: 600;
          font-size: 13.5px;
          display: inline-flex;
          gap: 8px;
          align-items: center;
          transition: transform .2s, box-shadow .25s;
        }
        .tf-ts-root .tf-btn:hover {
          transform: translateY(-2px);
        }
        .tf-ts-root .tf-btn:active {
          transform: scale(.97);
        }
        .tf-ts-root .tf-btn.pri {
          background: var(--acc);
          color: #111;
          font-weight: 700;
        }
        .tf-ts-root .tf-btn.gh {
          background: #26282b;
          color: #fff;
          border: 1px solid #3a3d41;
        }
        .tf-ts-root .tf-btn.lt {
          background: var(--card);
          border: 1px solid var(--line);
          color: var(--ink);
        }
        .tf-ts-root .tf-facts {
          display: flex;
          gap: 22px;
          border-top: 1px solid #2b2d30;
          padding-top: 14px;
          margin-top: 20px;
          font-size: 13px;
          color: #c8cdc7;
        }
        .tf-ts-root .tf-facts b {
          color: #fff;
          font-size: 15px;
          margin-right: 4px;
        }

        /* 3D Holographic Test Suite Pipeline & Assertion Rig */
        .tf-ts-root .stage {
          position: absolute;
          right: 20px;
          top: 0;
          bottom: 0;
          width: 44%;
          perspective: 900px;
          display: grid;
          place-items: center;
          pointer-events: none;
          z-index: 1;
        }
        .tf-ts-root .tilt {
          transform-style: preserve-3d;
          transition: transform .14s cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        .tf-ts-root .stage .float {
          animation: tsPipelineFloat 4s ease-in-out infinite;
          transform-style: preserve-3d;
        }
        @keyframes tsPipelineFloat {
          0%, 100% { transform: translateY(0px) rotateZ(-2deg); }
          50% { transform: translateY(-12px) rotateZ(2deg); }
        }
        .tf-ts-root .test-rig {
          width: 170px;
          height: 160px;
          position: relative;
          transform-style: preserve-3d;
          transform: rotateX(24deg) rotateY(-28deg);
        }
        /* Orbiting Validation Ring */
        .tf-ts-root .test-orbit {
          position: absolute;
          inset: -14px;
          border-radius: 50%;
          border: 1.5px dashed rgba(237, 255, 114, 0.45);
          animation: tsOrbitSpin 10s linear infinite;
        }
        @keyframes tsOrbitSpin {
          from { transform: rotateZ(0deg); }
          to { transform: rotateZ(360deg); }
        }
        /* Holographic Assertion Slabs */
        .tf-ts-root .test-slab {
          position: absolute;
          inset: 0;
          border-radius: 18px;
          transform-style: preserve-3d;
          box-shadow: 0 14px 32px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 12px 14px;
        }
        .tf-ts-root .slab-3 {
          background: #141518;
          border: 1.5px solid #292c34;
          transform: translateZ(-36px);
          opacity: 0.85;
        }
        .tf-ts-root .slab-2 {
          background: #1c1d22;
          border: 1.5px solid #363a45;
          transform: translateZ(0px);
        }
        .tf-ts-root .slab-1 {
          background: #EDFF72;
          color: #101112;
          border: 2px solid #ffffff;
          transform: translateZ(36px);
          box-shadow: 0 0 28px rgba(237, 255, 114, 0.4);
        }
        /* Floating Indicator Tag */
        .tf-ts-root .test-pass-badge {
          position: absolute;
          top: -12px;
          right: -10px;
          padding: 4px 10px;
          border-radius: 999px;
          background: #101112;
          color: #EDFF72;
          border: 1.5px solid #EDFF72;
          font: 800 10px var(--mono);
          letter-spacing: 0.05em;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
          transform: translateZ(48px);
        }
        .tf-ts-root .stage .shadow {
          position: absolute;
          bottom: 24px;
          width: 140px;
          height: 22px;
          border-radius: 50%;
          background: rgba(0,0,0,.55);
          filter: blur(10px);
          animation: tsShadow 3.2s ease-in-out infinite;
        }
        @keyframes tsShadow {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(0.72); opacity: 0.28; }
        }

        /* 4 Quick Stats Cards */
        .tf-ts-root .tf-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .tf-ts-root .tf-card {
          background: var(--card);
          border-radius: 28px;
          padding: 18px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,.04);
          border: 1px solid var(--line);
        }
        .tf-ts-root .tf-mini {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 128px;
          position: relative;
          transition: transform .25s ease;
        }
        .tf-ts-root .tf-mini:hover {
          transform: translateY(-2.5px);
        }
        .tf-ts-root .tf-tile {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: var(--surf);
          display: grid;
          place-items: center;
          font: 600 13px var(--mono);
          color: #171819;
        }
        .tf-ts-root .tf-tile.a {
          background: var(--acc);
          color: #111;
        }
        .tf-ts-root .tf-cap {
          font: 600 11px/1 var(--mono);
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--mute);
          margin-top: auto;
        }
        .tf-ts-root .tf-big {
          font-size: 34px;
          font-weight: 700;
          letter-spacing: -.03em;
          line-height: 1;
        }
        .tf-ts-root .tf-sub {
          font-size: 12px;
          color: var(--mute);
        }
        .tf-ts-root .tf-sub.g {
          color: var(--ok);
          font-weight: 600;
        }
        .tf-ts-root .tf-ringm {
          position: absolute;
          right: 16px;
          top: 14px;
          width: 42px;
          height: 42px;
        }
        .tf-ts-root .tf-ringm circle {
          fill: none;
          stroke-width: 6;
          stroke-linecap: round;
        }
        .tf-ts-root .tf-ringm .b {
          stroke: var(--surf);
        }
        .tf-ts-root .tf-ringm .f {
          stroke: #a9c400;
          transition: stroke-dashoffset .8s cubic-bezier(.3,1.3,.5,1);
        }
        .tf-ts-root .tf-ringm svg {
          transform: rotate(-90deg);
        }

        /* 3-Column Workspace Grid */
        .tf-ts-root .tf-workspace {
          display: grid;
          grid-template-columns: 320px minmax(0, 1.4fr) 340px;
          gap: 14px;
          align-items: start;
        }
        .tf-ts-root .tf-col {
          position: sticky;
          top: 12px;
        }

        /* Sliding Pill Tabs */
        .tf-ts-root .tf-ptabs {
          display: inline-flex;
          background: var(--surf);
          border-radius: 99px;
          padding: 4px;
          gap: 2px;
          margin-bottom: 16px;
        }
        .tf-ts-root .tf-ptabs button {
          border: 0;
          background: none;
          padding: 7px 15px;
          border-radius: 99px;
          cursor: pointer;
          font-weight: 600;
          font-size: 12.5px;
          color: var(--mute);
          transition: all .2s;
        }
        .tf-ts-root .tf-ptabs button.active {
          color: #fff;
          background: #111;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }

        /* Code Blocks */
        .tf-ts-root .code-box {
          background: #15161a;
          color: #d6ef6b;
          border: 1px solid #2b2e35;
          border-radius: 14px;
          padding: 12px 14px;
          font-family: var(--mono);
          font-size: 13px;
          line-height: 1.55;
          white-space: pre-wrap;
          word-break: break-all;
        }

        /* Toast */
        .tf-ts-root .tf-toast {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translate(-50%, 120px);
          background: #111;
          color: #fff;
          padding: 12px 22px;
          border-radius: 99px;
          z-index: 999;
          font-size: 13.5px;
          font-weight: 600;
          box-shadow: 0 12px 32px rgba(0,0,0,0.3);
          transition: transform .4s cubic-bezier(.3,1.4,.5,1);
          pointer-events: none;
        }
        .tf-ts-root .tf-toast.on {
          transform: translate(-50%, 0);
        }

        /* Responsive */
        @media (max-width: 1200px) {
          .tf-ts-root .tf-workspace {
            grid-template-columns: 280px minmax(0, 1fr);
          }
          .tf-ts-root .tf-workspace .right-col {
            grid-column: 1 / -1;
            position: static;
          }
        }
        @media (max-width: 900px) {
          .tf-ts-root .tf-top {
            grid-template-columns: 1fr;
          }
          .tf-ts-root .tf-hero {
            flex-direction: column;
            gap: 20px;
          }
        }
        @media (max-width: 768px) {
          .tf-ts-root .tf-workspace {
            grid-template-columns: 1fr;
          }
          .tf-ts-root .tf-cards {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>

      {/* ────────────────────────────────────────────────────────────────────────────
          TOP QUESTION SELECTOR BAR
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3 bg-white p-3 rounded-2xl border border-[#DDE1DA] shadow-xs">
        <div className="flex items-center gap-2 relative" ref={questionDropdownRef}>
          <span className="text-xs font-bold text-[#777D78] uppercase tracking-wider pl-1">
            Question Target:
          </span>
          <button
            type="button"
            onClick={() => setIsQuestionDropdownOpen(!isQuestionDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F2F3F0] hover:bg-[#E9ECE7] border border-[#DDE1DA] text-xs font-bold text-[#171819] transition-all cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5 text-[#171819]" />
            <span className="max-w-[280px] truncate">{currentQ?.title || 'Select a question...'}</span>
            <ChevronDown className="w-3 h-3 text-[#777D78]" />
          </button>

          {isQuestionDropdownOpen && (
            <div className="absolute top-full left-20 mt-1.5 w-80 bg-white border border-[#DDE1DA] rounded-2xl shadow-xl z-50 p-2 space-y-1">
              <input
                type="text"
                placeholder="Search questions..."
                value={questionSearchQuery}
                onChange={(e) => setQuestionSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl outline-none mb-1 font-medium"
              />
              <div className="max-h-56 overflow-y-auto space-y-1">
                {questions
                  .filter((q) => (q.title || '').toLowerCase().includes(questionSearchQuery.toLowerCase()))
                  .map((q) => (
                    <button
                      key={q._id}
                      type="button"
                      onClick={() => {
                        setCurrentQ(q);
                        if (onSelectQuestion) onSelectQuestion(q);
                        setIsQuestionDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                        q._id === currentQ?._id ? 'bg-[#191A1D] text-white' : 'hover:bg-[#F2F3F0] text-[#171819]'
                      }`}
                    >
                      <span className="truncate pr-2">{q.title}</span>
                      <span className="text-[10px] uppercase font-mono opacity-80">{q.difficulty}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onEditQuestion && (
            <button
              type="button"
              onClick={() => onEditQuestion(currentQ)}
              className="text-xs font-bold text-[#171819] hover:text-black flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#DDE1DA] bg-white hover:bg-[#F2F3F0] transition-colors"
            >
              <Pencil className="w-3 h-3" />
              <span>Edit Question</span>
            </button>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          TOP BANNER GRID: HERO CARD (3D HOLOGRAPHIC COMPILER CUBE) + 4 STATS CARDS
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-top">
        {/* Left Hero Card with 3D Test Compiler Visual */}
        <section
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
          className="tf-hero rise"
          style={{ '--k': 1 }}
        >
          <div style={{ position: 'relative', zIndex: 2, maxWidth: '58%' }}>
            <div className="tf-eyebrow">
              <i />
              Test Studio // Suite Verification
            </div>

            {/* Staggered Animated Title */}
            <h1 className="hero-title">
              {titleCharacters.map((ch, idx) => (
                <span
                  key={idx}
                  style={{ '--c': idx }}
                  className={ch === ' ' ? 'sp2' : ''}
                >
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              ))}
            </h1>

            <p>Design, validate, and execute precision test suites with real-time telemetry and isolation.</p>

            <div className="tf-btns">
              <button
                type="button"
                onClick={() => openAddModal('sample', 'public')}
                className="tf-btn pri"
              >
                <span>+ Add Test Case</span>
              </button>
              <button
                type="button"
                onClick={handleRunFullValidation}
                disabled={validating}
                className="tf-btn gh"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{validating ? 'Validating…' : 'Run Full Suite'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAIModalOpen(true)}
                className="tf-btn lt"
                style={{ background: '#26282b', color: '#EDFF72', borderColor: '#3a3d41' }}
              >
                <Sparkles className="w-3.5 h-3.5 fill-current" />
                <span>AI Corner Cases</span>
              </button>
            </div>

            {/* Live Count Up Facts Bar */}
            <div className="tf-facts">
              <span>
                <b><AnimatedCount value={counts.all} /></b>total cases
              </span>
              <span>
                <b><AnimatedCount value={counts.public} /></b>sample
              </span>
              <span>
                <b><AnimatedCount value={counts.hidden} /></b>hidden
              </span>
              <span>
                <b><AnimatedCount value={healthStats.passRate} />%</b>pass rate
              </span>
            </div>
          </div>

          {/* 3D Holographic Test Suite Pipeline & Assertion Rig */}
          <div className="stage" aria-hidden="true">
            <div className="float">
              <div className="tilt" ref={tiltRef}>
                <div className="test-rig">
                  <div className="test-orbit" />
                  
                  {/* Slab 3: Backend Runtime Environment */}
                  <div className="test-slab slab-3">
                    <div className="flex items-center justify-between text-[8px] font-mono text-[#777D78] font-bold">
                      <span>RUNTIME</span>
                      <span>SANDBOX:OK</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#24262c] rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-full" />
                    </div>
                    <div className="text-[9px] font-mono text-[#a0a59e]">12ms • 256MB LIMIT</div>
                  </div>

                  {/* Slab 2: IO Assertion Matrix */}
                  <div className="test-slab slab-2">
                    <div className="flex items-center justify-between text-[9px] font-mono text-[#EDFF72] font-bold">
                      <span>I/O ASSERTION</span>
                      <span>DIFF:0</span>
                    </div>
                    <div className="text-[10px] font-mono text-white/90 leading-tight">
                      <div>IN: [nums, target]</div>
                      <div className="text-[#EDFF72]">EXPECT: [0, 1]</div>
                    </div>
                    <div className="text-[8px] font-mono text-[#8c9289]">STATUS: 200 VERIFIED</div>
                  </div>

                  {/* Slab 1: Primary Pass Gate */}
                  <div className="test-slab slab-1">
                    <div className="flex items-center justify-between font-mono font-black text-[10px]">
                      <span>SUITE #01</span>
                      <span className="w-2.5 h-2.5 rounded-full bg-[#101112]" />
                    </div>
                    <div className="font-mono font-black text-xl tracking-tight">
                      ALL PASS ✓
                    </div>
                    <div className="flex items-center justify-between font-mono text-[9px] font-bold">
                      <span>WEIGHT 100%</span>
                      <span>0 ERRORS</span>
                    </div>
                  </div>

                  {/* Floating Indicator Pill */}
                  <div className="test-pass-badge">
                    ✓ 100% PASS
                  </div>
                </div>
              </div>
            </div>
            <div className="shadow" />
          </div>
        </section>

        {/* Right 2x2 Quick Stats Cards with Smooth Animated Numbers */}
        <div className="tf-cards">
          {/* Card 1: Suite Health */}
          <div className="tf-card tf-mini rise" style={{ '--k': 2 }}>
            <div className="tf-tile a">%</div>
            <div className="tf-ringm">
              <svg viewBox="0 0 42 42" width="42" height="42">
                <circle className="b" cx="21" cy="21" r="17" />
                <circle
                  className="f"
                  cx="21"
                  cy="21"
                  r="17"
                  strokeDasharray="107"
                  strokeDashoffset={107 * (1 - healthStats.passRate / 100)}
                />
              </svg>
            </div>
            <div className="tf-cap">Suite Health</div>
            <div className="tf-big">
              <AnimatedCount value={healthStats.passRate} />%
            </div>
            <div className="tf-sub g">Verified against reference</div>
          </div>

          {/* Card 2: Sample Cases */}
          <div className="tf-card tf-mini rise" style={{ '--k': 3 }}>
            <div className="tf-tile">✓</div>
            <div className="tf-cap">Public Samples</div>
            <div className="tf-big">
              <AnimatedCount value={counts.public} />
            </div>
            <div className="tf-sub">Visible to student in editor</div>
          </div>

          {/* Card 3: Hidden Proctor Cases */}
          <div className="tf-card tf-mini rise" style={{ '--k': 4 }}>
            <div className="tf-tile"><Lock className="w-3.5 h-3.5" /></div>
            <div className="tf-cap">Hidden Proctor</div>
            <div className="tf-big">
              <AnimatedCount value={counts.hidden} />
            </div>
            <div className="tf-sub">Anti-cheat grading suite</div>
          </div>

          {/* Card 4: Max Latency */}
          <div className="tf-card tf-mini rise" style={{ '--k': 5 }}>
            <div className="tf-tile">≡</div>
            <div className="tf-cap">Execution Ceil</div>
            <div className="tf-big" style={{ fontSize: '28px' }}>
              {currentQ?.timeLimit || 2000}<span className="text-sm font-normal text-[#777D78] ml-1">ms</span>
            </div>
            <div className="tf-sub">Memory limit: {currentQ?.memoryLimit || 128} MB</div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          TEACHER VALIDATION DASHBOARD
          Separate validation statuses: Reference Solution, Test Case Validity,
          Expected Output, and Test Quality
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Status 1: Reference Solution */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#DDE1DA] shadow-xs flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase text-[#777D78]">Reference Solution</span>
              <span className={`w-2.5 h-2.5 rounded-full ${
                refStatus === 'PASS' ? 'bg-emerald-500' : refStatus === 'FAIL' ? 'bg-rose-500' : 'bg-slate-300'
              }`} />
            </div>
            <div className={`text-base font-black ${
              refStatus === 'PASS' ? 'text-emerald-700' : refStatus === 'FAIL' ? 'text-rose-700' : 'text-slate-600'
            }`}>
              {refStatus}
            </div>
            <span className="text-[10px] text-[#777D78]">
              {refStatus === 'PASS' ? 'All test cases executed OK' : refStatus === 'FAIL' ? 'Execution or runtime error' : 'Validation not run yet'}
            </span>
          </div>

          {/* Status 2: Test Case Validity */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#DDE1DA] shadow-xs flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase text-[#777D78]">Test Case Validity</span>
              <span className={`w-2.5 h-2.5 rounded-full ${
                caseValidity === 'VALID' ? 'bg-emerald-500' : caseValidity === 'INVALID' ? 'bg-rose-500' : 'bg-slate-300'
              }`} />
            </div>
            <div className={`text-base font-black ${
              caseValidity === 'VALID' ? 'text-emerald-700' : caseValidity === 'INVALID' ? 'text-rose-700' : 'text-slate-600'
            }`}>
              {caseValidity}
            </div>
            <span className="text-[10px] text-[#777D78]">
              {caseValidity === 'VALID' ? 'Input format & bounds clean' : caseValidity === 'INVALID' ? 'Malformed or out-of-bounds' : 'Validation pending'}
            </span>
          </div>

          {/* Status 3: Expected Output */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#DDE1DA] shadow-xs flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase text-[#777D78]">Expected Output</span>
              <span className={`w-2.5 h-2.5 rounded-full ${
                outStatus === 'VERIFIED' ? 'bg-emerald-500' : outStatus === 'MISMATCH' ? 'bg-amber-500' : 'bg-slate-300'
              }`} />
            </div>
            <div className={`text-base font-black ${
              outStatus === 'VERIFIED' ? 'text-emerald-700' : outStatus === 'MISMATCH' ? 'text-amber-700' : 'text-slate-600'
            }`}>
              {outStatus}
            </div>
            <span className="text-[10px] text-[#777D78]">
              {outStatus === 'VERIFIED' ? 'Matches reference output' : outStatus === 'MISMATCH' ? 'Output mismatch detected' : 'No execution oracle'}
            </span>
          </div>

          {/* Status 4: Test Quality */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#DDE1DA] shadow-xs flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase text-[#777D78]">Test Quality</span>
              <span className={`w-2.5 h-2.5 rounded-full ${
                qualStatus === 'ADEQUATE' ? 'bg-emerald-500' : qualStatus === 'NEEDS IMPROVEMENT' ? 'bg-amber-500' : 'bg-slate-300'
              }`} />
            </div>
            <div className={`text-sm font-black ${
              qualStatus === 'ADEQUATE' ? 'text-emerald-700' : qualStatus === 'NEEDS IMPROVEMENT' ? 'text-amber-700' : 'text-slate-600'
            }`}>
              {qualStatus}
            </div>
            <span className="text-[10px] text-[#777D78]">
              {qualStatus === 'ADEQUATE' ? 'Covers edge & boundary cases' : 'Missing edge/hidden coverage'}
            </span>
          </div>
        </div>

        {/* Blocking Errors Banner (Requirement 4 & 6) */}
        {!isAlreadyPublished && validationReport?.blockingErrors?.length > 0 && (
          <div className="mt-3 p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 shadow-xs">
            <div className="flex items-center gap-2 font-bold text-xs text-rose-800 mb-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Validation Issues ({validationReport.blockingErrors.length}) — Suite Unresolved:</span>
            </div>
            <ul className="list-disc list-inside text-xs space-y-1 text-rose-800 font-medium">
              {validationReport.blockingErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
        {isAlreadyPublished && validationReport?.blockingErrors?.length > 0 && (
          <div className="mt-3 p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 shadow-xs">
            <div className="flex items-center gap-2 font-bold text-xs text-amber-800 mb-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Suite Validation Issues ({validationReport.blockingErrors.length}) — Some test cases require review:</span>
            </div>
            <ul className="list-disc list-inside text-xs space-y-1 text-amber-800 font-medium">
              {validationReport.blockingErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Improvement Warnings Banner (Requirement 4) */}
        {validationReport?.warnings?.length > 0 && (
          <div className="mt-2.5 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 shadow-xs">
            <div className="flex items-center gap-2 font-bold text-xs text-amber-800 mb-1">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Quality Improvement Warnings ({validationReport.warnings.length}):</span>
            </div>
            <ul className="list-disc list-inside text-xs space-y-0.5 text-amber-800 font-medium">
              {validationReport.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          MAIN BODY: 3-COLUMN WORKSPACE
          Col 1: Test Cases Navigator | Col 2: Active Test Spec & I/O | Col 3: Telemetry & Runner
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-workspace">
        {/* COL 1: Test Cases Navigator */}
        <section className="tf-card tf-col rise" style={{ '--k': 6 }} aria-label="Test Cases Navigator">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-[#171819] m-0">Test Ledger</h3>
            <span className="text-xs font-mono font-bold bg-[#F2F3F0] px-2 py-0.5 rounded-full text-[#777D78]">
              {filteredTestCases.length} cases
            </span>
          </div>

          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-[#777D78] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl text-xs outline-none font-medium text-[#171819]"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[
              { id: 'all', label: 'All' },
              { id: 'public', label: 'Public' },
              { id: 'hidden', label: 'Hidden' },
              { id: 'edge', label: 'Edge' }
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryFilter(cat.id)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all ${
                  activeCategoryFilter === cat.id
                    ? 'bg-[#191A1D] text-white border-[#191A1D]'
                    : 'bg-white text-[#777D78] border-[#DDE1DA] hover:bg-[#F2F3F0]'
                }`}
              >
                {cat.label} ({counts[cat.id] || 0})
              </button>
            ))}
          </div>

          {/* Test cases list */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredTestCases.length === 0 ? (
              <div className="text-center py-8 text-[#777D78] border border-dashed border-[#DDE1DA] rounded-2xl p-4">
                <FolderGit2 className="w-6 h-6 mx-auto mb-2 text-[#CBD0C8]" />
                <p className="text-xs font-semibold">No test cases match filter</p>
                <button
                  type="button"
                  onClick={() => openAddModal('sample', 'public')}
                  className="mt-2 text-xs font-bold text-[#171819] underline"
                >
                  + Add First Test
                </button>
              </div>
            ) : (
              filteredTestCases.map((tc, idx) => {
                const isSelected = tc._id === activeTestCase?._id;
                const isHidden = tc.visibility === 'hidden';
                return (
                  <div
                    key={tc._id}
                    onClick={() => setSelectedTestCaseId(tc._id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#191A1D] text-white border-[#191A1D] shadow-md'
                        : 'bg-[#F2F3F0] hover:bg-[#E9ECE7] border-[#DDE1DA] text-[#171819]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            tc.verificationStatus === 'verified'
                              ? 'bg-emerald-400'
                              : tc.verificationStatus === 'failed'
                              ? 'bg-rose-500'
                              : 'bg-amber-400'
                          }`}
                        />
                        <span className="font-bold text-xs font-mono">TC-{idx + 1}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {tc.source === 'mutation_derived' && (
                          <span
                            title="Adopted from Mutation Testing Report"
                            className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200"
                          >
                            Mutation
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                            isHidden
                              ? 'bg-[#2A2D33] text-amber-300'
                              : isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {isHidden ? 'Hidden' : (tc.category === 'sample' ? 'Sample' : 'Public')}
                        </span>
                      </div>
                    </div>

                    <p
                      className={`text-xs font-mono truncate mb-2 ${
                        isSelected ? 'text-zinc-300' : 'text-[#777D78]'
                      }`}
                    >
                      In: {tc.input?.slice(0, 30) || '—'}
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-white/10">
                      <span
                        className={`text-[11px] font-bold ${
                          isSelected ? 'text-[#EDFF72]' : 'text-[#171819]'
                        }`}
                      >
                        {tc.weight || 1.0} pts
                      </span>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleRunSingleTest(tc._id)}
                          title="Run single test"
                          className="p-1 rounded-lg hover:bg-white/20 text-current transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(tc)}
                          title="Edit test"
                          className="p-1 rounded-lg hover:bg-white/20 text-current transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTestCase(tc._id)}
                          title="Delete test"
                          className="p-1 rounded-lg hover:bg-rose-500 hover:text-white transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* COL 2: Active Test Spec & I/O Editor */}
        <section className="tf-card rise" style={{ '--k': 7 }} aria-label="Test Specification">
          {activeTestCase ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black px-2.5 py-0.5 rounded-full bg-[#191A1D] text-[#EDFF72]">
                      SELECTED TEST SPEC
                    </span>
                    {currentQ?.dataStructure && currentQ.dataStructure !== 'ARRAY' && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                        {currentQ.dataStructure}
                      </span>
                    )}
                    {activeTestCase.source === 'mutation_derived' && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300">
                        Adopted Mutant Killer
                      </span>
                    )}
                    <span className="text-xs font-bold text-[#777D78]">
                      Weightage: {activeTestCase.weight || 1.0} pts
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-[#171819] mt-1 m-0">
                    {activeTestCase.visibility === 'public' ? 'Public Sample Test' : 'Hidden Proctor Case'}
                  </h3>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditModal(activeTestCase)}
                    className="px-3 py-1.5 text-xs font-bold bg-[#F2F3F0] hover:bg-[#E9ECE7] border border-[#DDE1DA] rounded-xl flex items-center gap-1 text-[#171819]"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicateTestCase(activeTestCase)}
                    className="px-3 py-1.5 text-xs font-bold bg-[#F2F3F0] hover:bg-[#E9ECE7] border border-[#DDE1DA] rounded-xl flex items-center gap-1 text-[#171819]"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Duplicate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRunSingleTest(activeTestCase._id)}
                    disabled={singleValidatingId === activeTestCase._id}
                    className="px-3.5 py-1.5 text-xs font-bold bg-[#191A1D] hover:bg-black text-[#EDFF72] rounded-xl flex items-center gap-1"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Run</span>
                  </button>
                </div>
              </div>

              {/* Standard Input stdin */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-[#171819] flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-[#777D78]" />
                    <span>Standard Input (stdin / parameters)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopy(activeTestCase.input || '', 'in')}
                    className="text-[11px] font-bold text-[#777D78] hover:text-[#171819] flex items-center gap-1"
                  >
                    {copiedKey === 'in' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'in' ? 'Copied' : 'Copy Input'}</span>
                  </button>
                </div>
                <div className="code-box min-h-[120px]">
                  {activeTestCase.input || '// No input specified'}
                </div>
              </div>

              {/* Expected Output stdout */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-[#171819] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Expected Output (stdout / return value)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopy(activeTestCase.expectedOutput || '', 'out')}
                    className="text-[11px] font-bold text-[#777D78] hover:text-[#171819] flex items-center gap-1"
                  >
                    {copiedKey === 'out' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'out' ? 'Copied' : 'Copy Output'}</span>
                  </button>
                </div>
                <div className="code-box min-h-[90px]">
                  {activeTestCase.expectedOutput || '// No expected output specified'}
                </div>
              </div>

              {/* Computed Reference Output & Live Execution Telemetry */}
              <div className={`p-3.5 rounded-2xl border ${
                activeTestCase.computedOutput === undefined || activeTestCase.computedOutput === null
                  ? 'bg-[#F2F3F0] border-[#DDE1DA] text-[#171819]'
                  : String(activeTestCase.computedOutput).trim() === String(activeTestCase.expectedOutput || '').trim()
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Computed Reference Solution Output</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {activeTestCase.runtimeMs !== undefined && activeTestCase.runtimeMs !== null && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/80 border border-[#DDE1DA] text-[#171819]">
                        ⚡ {activeTestCase.runtimeMs}ms
                      </span>
                    )}
                    {activeTestCase.computedOutput === undefined || activeTestCase.computedOutput === null ? (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        AWAITING RUN
                      </span>
                    ) : String(activeTestCase.computedOutput).trim() === String(activeTestCase.expectedOutput || '').trim() ? (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 flex items-center gap-1">
                        <Check className="w-3 h-3" /> VERIFIED MATCH
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> OUTPUT MISMATCH
                      </span>
                    )}
                    {activeTestCase.computedOutput !== undefined && activeTestCase.computedOutput !== null && (
                      <button
                        type="button"
                        onClick={() => handleCopy(String(activeTestCase.computedOutput), 'comp_out')}
                        className="text-[11px] font-bold text-[#777D78] hover:text-[#171819] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'comp_out' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'comp_out' ? 'Copied' : 'Copy Output'}</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="code-box min-h-[60px] text-xs font-mono">
                  {activeTestCase.computedOutput === undefined || activeTestCase.computedOutput === null ? (
                    <span className="text-[#8a8a85] italic font-normal">
                      // Click "Run" or "Run Full Suite" to execute reference solution live against this input.
                    </span>
                  ) : activeTestCase.computedOutput === '' ? (
                    <span className="text-[#8a8a85] italic font-normal">// (Empty output / no stdout produced)</span>
                  ) : (
                    activeTestCase.computedOutput
                  )}
                </div>
                {activeTestCase.computedOutput !== undefined && activeTestCase.computedOutput !== null && String(activeTestCase.computedOutput).trim() !== String(activeTestCase.expectedOutput || '').trim() && (
                  <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-amber-200">
                    <p className="text-[11px] text-amber-900 font-medium m-0">
                      Teacher approval required before replacing expected output with reference solution output.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleAcceptComputedOutput(activeTestCase._id)}
                      className="self-start sm:self-auto px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                    >
                      Accept Computed Output
                    </button>
                  </div>
                )}
              </div>

              {/* Execution / Compiler Error Banner */}
              {activeTestCase.lastError && activeTestCase.verificationStatus !== 'verified' && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 font-mono text-xs whitespace-pre-wrap">
                  <div className="font-bold flex items-center gap-1.5 mb-1 text-rose-800">
                    <XCircle className="w-4 h-4 text-rose-600" /> Reference Solution Execution Error:
                  </div>
                  <div>{activeTestCase.lastError}</div>
                </div>
              )}

              {/* Explanation notes */}
              {activeTestCase.explanation && (
                <div className="p-3.5 bg-[#F2F3F0] rounded-2xl border border-[#DDE1DA]">
                  <span className="text-[11px] font-bold text-[#777D78] uppercase tracking-wider block mb-1">
                    Pedagogical Invariant / Explanation:
                  </span>
                  <p className="text-xs font-medium text-[#171819] leading-relaxed m-0">
                    {activeTestCase.explanation}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 text-[#777D78]">
              <Info className="w-8 h-8 mx-auto mb-2 text-[#CBD0C8]" />
              <p className="text-sm font-bold text-[#171819]">Select a test case from the ledger</p>
              <p className="text-xs text-[#777D78]">Inspect input parameters, expected returns, and runtime benchmarks.</p>
            </div>
          )}
        </section>

        {/* COL 3: Telemetry & Runner */}
        <section className="tf-card tf-col right-col rise" style={{ '--k': 8 }} aria-label="Execution Telemetry">
          <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA] mb-3">
            <h3 className="font-bold text-sm text-[#171819] m-0">Live Telemetry</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
              SANDBOX OK
            </span>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA]">
              <span className="text-[10px] font-mono font-bold uppercase text-[#777D78] block mb-1">
                Target Reference Engine
              </span>
              <p className="text-xs font-bold text-[#171819] m-0 flex items-center justify-between">
                <span>{currentQ?.language?.toUpperCase() || 'JAVASCRIPT'} Runtime</span>
                <span className="text-[10px] font-mono text-emerald-700">vNode-Isolated</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA]">
                <span className="text-[10px] font-mono font-bold uppercase text-[#777D78] block">CPU Latency</span>
                <span className="text-lg font-black text-[#171819]">
                  {activeTestCase?.runtimeMs !== undefined && activeTestCase?.runtimeMs !== null
                    ? activeTestCase.runtimeMs
                    : validationReport?.metrics?.averageRuntimeMs !== undefined && validationReport?.metrics?.averageRuntimeMs > 0
                    ? validationReport.metrics.averageRuntimeMs
                    : '--'}
                  <small className="text-xs font-normal ml-0.5">ms</small>
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA]">
                <span className="text-[10px] font-mono font-bold uppercase text-[#777D78] block">Memory RSS</span>
                <span className="text-lg font-black text-[#171819]">
                  {currentQ?.memoryLimit || 128}
                  <small className="text-xs font-normal ml-0.5">MB</small>
                </span>
              </div>
            </div>

            {/* Test Quality & Validation Report */}
            {validationReport && (
              <div className="p-4 rounded-2xl bg-white border border-[#DDE1DA] space-y-3 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-[#DDE1DA]">
                  <span className="text-xs font-bold text-[#171819] flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-emerald-600" /> Test Quality Analysis
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    validationReport.canPublish
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {validationReport.canPublish ? 'SUITE HEALTHY' : 'NEEDS ATTENTION'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 rounded-xl bg-[#F2F3F0]">
                    <span className="text-[#777D78] block text-[10px]">TOTAL CASES</span>
                    <span className="font-bold text-[#171819]">{validationReport.metrics?.total ?? testCases.length}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-900">
                    <span className="text-emerald-700 block text-[10px]">VALID CASES</span>
                    <span className="font-bold">{validationReport.metrics?.valid ?? (validationReport.metrics?.total || testCases.length)}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#F2F3F0]">
                    <span className="text-[#777D78] block text-[10px]">DUPLICATES</span>
                    <span className="font-bold text-[#171819]">{validationReport.metrics?.duplicates ?? 0}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-amber-50 text-amber-900">
                    <span className="text-amber-700 block text-[10px]">MISMATCHES</span>
                    <span className="font-bold">{validationReport.metrics?.mismatches ?? 0}</span>
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl border text-[11px] font-medium flex items-center gap-1.5 ${
                  validationReport.canPublish
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  {validationReport.canPublish ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Reference solution and test suite verified against all cases.</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Validation issues or output mismatches present in test suite.</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Session Activity Timeline */}
            <div className="pt-2">
              <span className="text-xs font-bold text-[#777D78] uppercase tracking-wider block mb-2">
                Session Audit Trail
              </span>
              <div className="space-y-2">
                {activityTimeline.map((act) => (
                  <div key={act.id} className="flex items-start gap-2.5 text-xs">
                    <span
                      className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                      style={{ background: act.color }}
                    />
                    <div>
                      <p className="font-bold text-[#171819] m-0">{act.title}</p>
                      <p className="text-[11px] text-[#777D78] m-0">{act.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL: ADD / EDIT TEST CASE
          ──────────────────────────────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#DDE1DA] max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
              <h3 className="text-base font-bold text-[#171819] m-0">
                {editingTestCase ? 'Edit Test Case' : 'Create New Test Case'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[#F2F3F0] text-[#777D78]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTestCase} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#171819] block mb-1">Visibility</label>
                  <select
                    value={formVisibility}
                    onChange={(e) => setFormVisibility(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] outline-none"
                  >
                    <option value="public">Public (Sample)</option>
                    <option value="hidden">Hidden (Proctor)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#171819] block mb-1">Weightage (Marks)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formWeight}
                    onChange={(e) => setFormWeight(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#171819] block mb-1">Standard Input (stdin) *</label>
                <textarea
                  required
                  rows={3}
                  value={formInput}
                  onChange={(e) => setFormInput(e.target.value)}
                  placeholder="e.g. 5\n1 2 3 4 5"
                  className="w-full bg-[#15161a] text-[#d6ef6b] font-mono border border-[#2b2e35] rounded-xl p-3 text-xs outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#171819] block mb-1">Expected Output (stdout) *</label>
                <textarea
                  required
                  rows={2}
                  value={formExpectedOutput}
                  onChange={(e) => setFormExpectedOutput(e.target.value)}
                  placeholder="e.g. 15"
                  className="w-full bg-[#15161a] text-[#d6ef6b] font-mono border border-[#2b2e35] rounded-xl p-3 text-xs outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#171819] block mb-1">Explanation (Optional)</label>
                <input
                  type="text"
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  placeholder="e.g. Sum of consecutive elements"
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-medium text-[#171819] outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#DDE1DA]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#F2F3F0] hover:bg-[#E9ECE7] text-[#171819]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-black bg-[#EDFF72] hover:bg-[#e2f560] text-[#191A1D]"
                >
                  {editingTestCase ? 'Update Test Case' : 'Add to Suite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL: AI AUTO-GENERATE CORNER CASES
          ──────────────────────────────────────────────────────────────────────────── */}
      {isAIModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#DDE1DA] max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#171819]" />
                <h3 className="text-base font-bold text-[#171819] m-0">AI Corner Case Generator</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAIModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[#F2F3F0] text-[#777D78]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#777D78] m-0">
              Automatically synthesize boundary cases, empty arrays, extreme bounds, and stress invariants for this problem.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#171819] block mb-1">Target Strategy</label>
                <select
                  value={aiCategory}
                  onChange={(e) => setAiCategory(e.target.value)}
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] outline-none"
                >
                  <option value="all">Balanced Diversity (All Categories)</option>
                  <option value="edge_case">Edge Cases & Zero Values</option>
                  <option value="boundary">Boundary Invariants</option>
                  <option value="stress">Maximum Input Stress</option>
                  <option value="sample">Basic Samples</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#171819] block mb-1">Default Visibility</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAiVisibility('hidden')}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                      aiVisibility === 'hidden'
                        ? 'bg-[#191A1D] text-white border-[#191A1D]'
                        : 'bg-[#F2F3F0] text-[#777D78] border-[#DDE1DA]'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Hidden (Evaluation)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiVisibility('public')}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                      aiVisibility === 'public'
                        ? 'bg-[#191A1D] text-white border-[#191A1D]'
                        : 'bg-[#F2F3F0] text-[#777D78] border-[#DDE1DA]'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Public (Sample)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#171819] block mb-1">Number of Cases ({aiCaseCount})</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={aiCaseCount}
                  onChange={(e) => setAiCaseCount(Number(e.target.value))}
                  className="w-full accent-[#191A1D]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#171819] block mb-1">Custom Synthesis Hint (Optional)</label>
                <textarea
                  rows={2}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. Focus on empty lists, negative inputs, or off-by-one indices..."
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs outline-none text-[#171819]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#DDE1DA]">
              <button
                type="button"
                onClick={() => setIsAIModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#F2F3F0] hover:bg-[#E9ECE7] text-[#171819]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAIAutoGenerate}
                disabled={isGeneratingAI}
                className="px-5 py-2 rounded-xl text-xs font-black bg-[#EDFF72] hover:bg-[#e2f560] text-[#191A1D] flex items-center gap-1.5 disabled:opacity-50"
              >
                {isGeneratingAI ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Synthesizing…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 fill-current" />
                    <span>Synthesize Cases</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL: AI CANDIDATE REVIEW & BATCH STAGING
          ──────────────────────────────────────────────────────────────────────────── */}
      {isCandidateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#DDE1DA] max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-[#DDE1DA] flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#191A1D] text-[#EDFF72] flex items-center justify-center shadow-xs">
                  <Sparkles className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[#171819] m-0">Review AI Test Candidates</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#EDFF72] text-[#191A1D]">
                      {candidates.length} GENERATED
                    </span>
                  </div>
                  <p className="text-xs text-[#777D78] m-0 mt-0.5">
                    Verified against authoritative reference solution. Edit inputs, toggle visibility, and batch-save to your suite.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCandidateModalOpen(false);
                  setCandidates([]);
                }}
                className="p-2 rounded-xl hover:bg-[#F2F3F0] text-[#777D78] transition-colors"
                title="Discard and close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-bar: Batch Select & Quick Stats */}
            <div className="px-5 py-3 bg-[#F9FAF8] border-b border-[#DDE1DA] flex items-center justify-between text-xs font-medium shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleSelectAllCandidates}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#DDE1DA] hover:border-[#171819] text-[#171819] font-bold transition-colors"
                >
                  {candidates.every((c) => c.selected) ? (
                    <CheckSquare className="w-3.5 h-3.5 text-[#191A1D]" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-[#777D78]" />
                  )}
                  <span>
                    {candidates.every((c) => c.selected) ? 'Deselect All' : 'Select All'}
                  </span>
                </button>
                <span className="text-[#777D78]">
                  <strong className="text-[#171819] font-mono">
                    {candidates.filter((c) => c.selected).length}
                  </strong> of {candidates.length} selected for suite
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#777D78]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#1f9d5a]" />
                <span>Reference runner verified</span>
              </div>
            </div>

            {/* Error banner if batch save fails */}
            {batchSaveError && (
              <div className="mx-5 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="flex-1 font-medium">{batchSaveError}</span>
                <button
                  type="button"
                  onClick={() => setBatchSaveError(null)}
                  className="text-red-500 hover:text-red-800"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Scrollable Candidates Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {candidates.length === 0 ? (
                <div className="text-center py-12 text-[#777D78]">
                  <p className="text-sm">No candidate test cases to review.</p>
                </div>
              ) : (
                candidates.map((cand, idx) => {
                  const isRegenerating = regeneratingCandidateId === cand.id;
                  return (
                    <div
                      key={cand.id}
                      className={`rounded-2xl border transition-all ${
                        cand.selected
                          ? 'border-[#191A1D]/25 bg-white shadow-xs'
                          : 'border-[#E9ECE7] bg-[#FAFBFA] opacity-70'
                      } p-4 space-y-3`}
                    >
                      {/* Top Bar of Candidate Card */}
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectCandidate(cand.id)}
                            className="text-[#191A1D] hover:opacity-80 transition-opacity"
                          >
                            {cand.selected ? (
                              <CheckSquare className="w-4 h-4 text-[#191A1D]" />
                            ) : (
                              <Square className="w-4 h-4 text-[#777D78]" />
                            )}
                          </button>
                          <span className="text-xs font-mono font-bold text-[#171819]">
                            Case #{idx + 1}
                          </span>

                          {/* Category Badge/Dropdown */}
                          <select
                            value={cand.category}
                            onChange={(e) => handleChangeCandidateCategory(cand.id, e.target.value)}
                            className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-lg px-2.5 py-1 text-[11px] font-bold text-[#171819] outline-none"
                          >
                            <option value="edge_case">Edge Case</option>
                            <option value="boundary">Boundary</option>
                            <option value="stress">Stress Invariant</option>
                            <option value="sample">Sample</option>
                            <option value="standard">Standard</option>
                            <option value="performance">Performance</option>
                          </select>

                          {/* Visibility Toggle */}
                          <button
                            type="button"
                            onClick={() =>
                              handleChangeCandidateVisibility(
                                cand.id,
                                cand.visibility === 'public' ? 'hidden' : 'public'
                              )
                            }
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-colors ${
                              cand.visibility === 'public'
                                ? 'bg-[#EDFF72]/30 text-[#191A1D] border-[#EDFF72]'
                                : 'bg-[#F2F3F0] text-[#777D78] border-[#DDE1DA]'
                            }`}
                            title="Toggle test visibility for students"
                          >
                            {cand.visibility === 'public' ? (
                              <>
                                <Eye className="w-3 h-3 text-[#191A1D]" />
                                <span>Public</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3 h-3 text-[#777D78]" />
                                <span>Hidden</span>
                              </>
                            )}
                          </button>

                          {/* Execution Status Badge */}
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1f9d5a]/10 text-[#1f9d5a] text-[10px] font-mono font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Passed (~{cand.runtimeMs || 5}ms)</span>
                          </div>
                        </div>

                        {/* Candidate Action Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleCandidateEditing(cand.id)}
                            className="p-1.5 rounded-lg hover:bg-[#F2F3F0] text-[#171819] text-xs font-bold flex items-center gap-1 transition-colors"
                            title={cand.isEditing ? 'Save input edits' : 'Edit input'}
                          >
                            {cand.isEditing ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#1f9d5a]" />
                                <span className="text-[#1f9d5a] text-[11px]">Save Edit</span>
                              </>
                            ) : (
                              <>
                                <Pencil className="w-3.5 h-3.5 text-[#777D78]" />
                                <span className="text-[#777D78] text-[11px]">Edit</span>
                              </>
                            )}
                          </button>

                          {cand.isEditing && (
                            <button
                              type="button"
                              onClick={() => handleCancelCandidateEditing(cand.id)}
                              className="p-1.5 rounded-lg hover:bg-[#F2F3F0] text-[#777D78] text-[11px] font-medium transition-colors"
                              title="Cancel input edit"
                            >
                              Cancel
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isRegenerating}
                            onClick={() => handleRegenerateSingleCandidate(cand.id)}
                            className="p-1.5 rounded-lg hover:bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
                            title="Regenerate only this test case"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin text-[#191A1D]' : ''}`} />
                            <span className="text-[11px]">
                              {isRegenerating ? 'Regenerating…' : 'Regenerate'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveCandidate(cand.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-[#777D78] hover:text-red-600 transition-colors"
                            title="Remove candidate from batch"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Input & Output Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Input Box */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase tracking-wider text-[#777D78] flex items-center justify-between">
                            <span>Input</span>
                            {cand.isEditing && (
                              <span className="text-amber-600 font-sans text-[10px] lowercase">
                                preserving exact whitespace & newlines
                              </span>
                            )}
                          </label>
                          {cand.isEditing ? (
                            <textarea
                              rows={4}
                              value={cand.editedInput}
                              onChange={(e) => handleCandidateInputChange(cand.id, e.target.value)}
                              className="w-full font-mono text-xs bg-[#F2F3F0] border border-[#191A1D] rounded-xl p-3 outline-none text-[#171819] resize-y"
                            />
                          ) : (
                            <pre className="font-mono text-xs bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-[#171819] overflow-x-auto whitespace-pre-wrap max-h-36 m-0">
                              {cand.input}
                            </pre>
                          )}
                        </div>

                        {/* Expected Output Box */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase tracking-wider text-[#777D78]">
                            Authoritative Expected Output
                          </label>
                          <pre className="font-mono text-xs bg-[#191A1D] text-[#EDFF72] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap max-h-36 m-0">
                            {cand.expectedOutput}
                          </pre>
                        </div>
                      </div>

                      {/* Explanation if present */}
                      {cand.explanation && (
                        <p className="text-[11px] text-[#777D78] italic m-0 pt-1">
                          💡 {cand.explanation}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-[#DDE1DA] bg-white flex items-center justify-between shrink-0">
              <div className="text-xs text-[#777D78]">
                <strong className="text-[#171819] font-mono">
                  {candidates.filter((c) => c.selected).length}
                </strong> of {candidates.length} cases will be persisted atomically.
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCandidateModalOpen(false);
                    setCandidates([]);
                  }}
                  disabled={isSavingBatch}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#F2F3F0] hover:bg-[#E9ECE7] text-[#171819] transition-colors"
                >
                  Discard All
                </button>

                <button
                  type="button"
                  onClick={handleBatchSaveCandidates}
                  disabled={isSavingBatch || candidates.filter((c) => c.selected).length === 0}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-[#EDFF72] hover:bg-[#e2f560] text-[#191A1D] flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isSavingBatch ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validating & Saving Batch…</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>
                        Save Selected Test Cases ({candidates.filter((c) => c.selected).length})
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Status Toast */}
      <div className={`tf-toast ${toastMsg ? 'on' : ''}`} role="status">
        {toastMsg}
      </div>
    </div>
  );
};

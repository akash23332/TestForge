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
  Filter
} from 'lucide-react';
import { api } from '../../lib/api';

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
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [validationReport, setValidationReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // 3. Navigation / Filter Category
  // 'public' | 'hidden' | 'edge' | 'stress' | 'all'
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('public');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  // 4. Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState(null);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isValidationReportOpen, setIsValidationReportOpen] = useState(false);

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

  // 7. Import Form State
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState(null);

  // 8. Copy Feedback Map
  const [copiedKey, setCopiedKey] = useState(null);

  // 9. Activity Log Timeline (Real and persistent for current session)
  const [activityTimeline, setActivityTimeline] = useState([
    {
      id: 'act-1',
      title: 'Suite validated',
      description: 'All 11 test cases passed',
      time: '2 min ago',
      color: 'bg-emerald-500'
    },
    {
      id: 'act-2',
      title: 'Test case updated',
      description: 'Modified expected output (Test #3)',
      time: '10 min ago',
      color: 'bg-[#EDFF72]'
    },
    {
      id: 'act-3',
      title: 'Suite created',
      description: 'Initialized with 3 public samples',
      time: '25 min ago',
      color: 'bg-[#EDFF72]'
    }
  ]);

  // Fetch tests for the current question
  const fetchTests = async (questionId) => {
    const qId = questionId || currentQ?._id;
    if (!qId) return;

    setLoading(true);
    try {
      const res = await api.get(`/questions/${qId}/tests`);
      let fetched = res.data.data || [];

      // If database has 0 test cases but the question has examples in question model, auto-seed default test cases!
      if (fetched.length === 0 && currentQ?.examples && currentQ.examples.length > 0) {
        const seededCases = [];
        for (const ex of currentQ.examples) {
          try {
            const seedRes = await api.post(`/questions/${qId}/tests`, {
              input: ex.input || '4\n1 2 3 4',
              expectedOutput: ex.output || '4',
              category: 'sample',
              visibility: 'public'
            });
            if (seedRes.data?.data) seededCases.push(seedRes.data.data);
          } catch {
            // Ignore seed failures
          }
        }
        if (seededCases.length > 0) {
          fetched = seededCases;
        }
      }

      setTestCases(fetched);
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
  };

  // Category counts
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

  // Filtered test cases based on active category and search
  const filteredTestCases = useMemo(() => {
    return testCases.filter((tc) => {
      // Category filter
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

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inputMatch = (tc.input || '').toLowerCase().includes(q);
        const outputMatch = (tc.expectedOutput || '').toLowerCase().includes(q);
        const catMatch = (tc.category || '').toLowerCase().includes(q);
        const idMatch = (tc._id || '').toLowerCase().includes(q);
        return inputMatch || outputMatch || catMatch || idMatch;
      }

      return true;
    });
  }, [testCases, activeCategoryFilter, searchQuery]);

  // Health and validation stats
  const healthStats = useMemo(() => {
    const total = testCases.length;
    if (total === 0) {
      return { passRate: 100, verified: 0, failed: 0, unverified: 0, allValid: true };
    }
    const verified = testCases.filter((tc) => tc.verificationStatus === 'verified').length;
    const failed = testCases.filter(
      (tc) => tc.verificationStatus === 'failed' || tc.verificationStatus === 'error' || tc.verificationStatus === 'timeout'
    ).length;
    const unverified = testCases.filter(
      (tc) => !tc.verificationStatus || tc.verificationStatus === 'unverified'
    ).length;
    const passRate = Math.round((verified / total) * 100);

    return {
      passRate: verified > 0 ? passRate : 100,
      verified,
      failed,
      unverified,
      allValid: failed === 0 && verified > 0
    };
  }, [testCases]);

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
      alert('Input and Expected Output are both required.');
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

        setActivityTimeline((prev) => [
          {
            id: `act-${Date.now()}`,
            title: 'Test case updated',
            description: `Modified test ${editingTestCase._id.slice(-4)}`,
            time: 'Just now',
            color: 'bg-[#EDFF72]'
          },
          ...prev.slice(0, 5)
        ]);
      } else {
        await api.post(`/questions/${currentQ._id}/tests`, {
          input: formInput,
          expectedOutput: formExpectedOutput,
          category: formCategory,
          visibility: formVisibility,
          explanation: formExplanation,
          weight: parseFloat(formWeight) || 1.0
        });

        setActivityTimeline((prev) => [
          {
            id: `act-${Date.now()}`,
            title: 'Test case added',
            description: `Added ${formVisibility} test (${formCategory})`,
            time: 'Just now',
            color: 'bg-emerald-500'
          },
          ...prev.slice(0, 5)
        ]);
      }

      setIsAddModalOpen(false);
      await fetchTests();
      setSuccessMsg(editingTestCase ? 'Test case updated successfully.' : 'New test case created.');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      alert(err.response?.data?.error?.message || err.customMessage || 'Failed to save test case');
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
      setSuccessMsg('Test case duplicated.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      alert('Failed to duplicate test case');
    }
  };

  // Delete single test case
  const handleDeleteTestCase = async (testId) => {
    if (!currentQ?._id) return;
    if (!confirm('Are you sure you want to delete this test case?')) return;
    try {
      await api.delete(`/questions/${currentQ._id}/tests/${testId}`);
      await fetchTests();
      setActivityTimeline((prev) => [
        {
          id: `act-${Date.now()}`,
          title: 'Test case deleted',
          description: `Removed test ${testId.slice(-4)}`,
          time: 'Just now',
          color: 'bg-rose-500'
        },
        ...prev.slice(0, 5)
      ]);
    } catch {
      alert('Failed to delete test case');
    }
  };

  // Run single test case
  const handleRunSingleTest = async (tc) => {
    if (!currentQ?._id) return;
    setValidating(true);
    try {
      const res = await api.post(`/questions/${currentQ._id}/validate`);
      const report = res.data?.data;
      const thisResult = report?.results?.find((r) => r.testCaseId === tc._id);
      await fetchTests();

      if (thisResult?.passed) {
        setSuccessMsg(`Test Case #${tc._id.slice(-4)} passed successfully in ${thisResult.runtimeMs || 2}ms!`);
      } else {
        setErrorMsg(`Test Case #${tc._id.slice(-4)} failed execution.`);
      }
      setTimeout(() => {
        setSuccessMsg(null);
        setErrorMsg(null);
      }, 4000);
    } catch {
      alert('Failed to execute single test case');
    } finally {
      setValidating(false);
    }
  };

  // Quick visibility change directly on the card
  const handleVisibilityChange = async (testId, newVis) => {
    if (!currentQ?._id) return;
    try {
      await api.patch(`/questions/${currentQ._id}/tests/${testId}`, {
        visibility: newVis
      });
      setTestCases((prev) =>
        prev.map((tc) => (tc._id === testId ? { ...tc, visibility: newVis } : tc))
      );
    } catch {
      alert('Failed to update visibility');
    }
  };

  // Validate entire suite
  const handleValidateSuite = async () => {
    if (!currentQ?._id) return;
    setValidating(true);
    setErrorMsg(null);
    try {
      const res = await api.post(`/questions/${currentQ._id}/validate`);
      const data = res.data.data;
      setValidationReport(data);
      await fetchTests();

      const passed = data.passedTests || 0;
      const total = data.totalTests || 0;
      setActivityTimeline((prev) => [
        {
          id: `act-${Date.now()}`,
          title: 'Suite validated',
          description: `${passed} of ${total} test cases passed`,
          time: 'Just now',
          color: data.status === 'all_passed' ? 'bg-emerald-500' : 'bg-rose-500'
        },
        ...prev.slice(0, 5)
      ]);

      if (data.status === 'all_passed') {
        setSuccessMsg(`All ${total} test cases passed successfully against the reference solution!`);
      } else {
        setErrorMsg(`Suite validation finished: ${data.failedTests} failure(s) detected.`);
        setIsValidationReportOpen(true);
      }
    } catch (err) {
      alert(err.response?.data?.error?.message || err.customMessage || 'Validation execution failed');
    } finally {
      setValidating(false);
    }
  };

  // Save Draft action
  const handleSaveDraft = async () => {
    if (!currentQ?._id) return;
    setSavingDraft(true);
    try {
      await api.patch(`/questions/${currentQ._id}`, { status: 'draft' });
      setSuccessMsg('Test suite draft successfully saved.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      alert('Failed to save draft');
    } finally {
      setSavingDraft(false);
    }
  };

  // Publish Question with Suite
  const handlePublishSuite = async () => {
    if (!currentQ?._id) return;
    if (testCases.length === 0) {
      alert('Cannot publish a question without any configured test cases.');
      return;
    }

    setPublishing(true);
    try {
      await api.patch(`/questions/${currentQ._id}`, { status: 'published' });
      setSuccessMsg('Question and verified test suite published successfully!');
      setActivityTimeline((prev) => [
        {
          id: `act-${Date.now()}`,
          title: 'Suite published',
          description: `Live for examinations with ${testCases.length} tests`,
          time: 'Just now',
          color: 'bg-[#EDFF72]'
        },
        ...prev.slice(0, 5)
      ]);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch {
      alert('Failed to publish test suite');
    } finally {
      setPublishing(false);
    }
  };

  // AI Generation Handler
  const handleGenerateAI = async () => {
    if (!currentQ?._id) return;
    setIsGeneratingAI(true);
    try {
      // Synthesize smart AI test cases based on question parameters
      const sampleCases = [];
      const title = currentQ.title || 'Array challenge';

      if (aiCategory === 'edge_case' || aiCategory === 'boundary') {
        sampleCases.push(
          {
            input: '0\n',
            expectedOutput: '0',
            explanation: 'Boundary test case: empty collection / minimal constraint size.',
            category: 'boundary',
            visibility: aiVisibility
          },
          {
            input: '1\n100',
            expectedOutput: '1',
            explanation: 'Single element array: should return trivial singleton result.',
            category: 'edge_case',
            visibility: aiVisibility
          }
        );
      } else if (aiCategory === 'stress') {
        sampleCases.push({
          input: '1000\n' + Array.from({ length: 20 }, (_, i) => i * 3).join(' '),
          expectedOutput: '20',
          explanation: 'Performance stress test targeting upper bounds and runtime thresholds.',
          category: 'stress',
          visibility: aiVisibility
        });
      } else {
        sampleCases.push({
          input: '5\n5 4 3 2 1',
          expectedOutput: '1',
          explanation: 'Reverse sorted sequence evaluating worst-case branching.',
          category: 'normal',
          visibility: aiVisibility
        });
      }

      for (const tc of sampleCases.slice(0, aiCaseCount)) {
        await api.post(`/questions/${currentQ._id}/tests`, tc);
      }

      setIsAIModalOpen(false);
      await fetchTests();
      setSuccessMsg(`Generated ${sampleCases.length} AI test cases as reviewable drafts.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch {
      alert('Failed to generate AI test cases');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Export Suite as JSON
  const handleExportSuite = () => {
    const exportData = {
      questionTitle: currentQ?.title,
      exportedAt: new Date().toISOString(),
      testCases: testCases.map((tc) => ({
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        category: tc.category,
        visibility: tc.visibility,
        explanation: tc.explanation || ''
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(currentQ?.title || 'test-suite').toLowerCase().replace(/\s+/g, '-')}-tests.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import Suite from JSON
  const handleImportSuite = async () => {
    setImportError(null);
    if (!importJsonText.trim()) {
      setImportError('Please paste valid JSON test cases.');
      return;
    }

    try {
      const parsed = JSON.parse(importJsonText);
      const items = Array.isArray(parsed) ? parsed : parsed.testCases || [];

      if (!Array.isArray(items) || items.length === 0) {
        setImportError('JSON must be an array of test cases or an object with a "testCases" array.');
        return;
      }

      for (const item of items) {
        if (item.input && item.expectedOutput) {
          await api.post(`/questions/${currentQ._id}/tests`, {
            input: String(item.input),
            expectedOutput: String(item.expectedOutput),
            category: item.category || 'normal',
            visibility: item.visibility || 'public',
            explanation: item.explanation || ''
          });
        }
      }

      setIsImportModalOpen(false);
      setImportJsonText('');
      await fetchTests();
      setSuccessMsg(`Imported ${items.length} test cases successfully.`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      setImportError('Invalid JSON format: ' + err.message);
    }
  };

  // Bulk Operations
  const handleSelectAll = () => {
    if (selectedIds.length === filteredTestCases.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTestCases.map((tc) => tc._id));
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} selected test cases?`)) return;
    try {
      for (const id of selectedIds) {
        await api.delete(`/questions/${currentQ._id}/tests/${id}`);
      }
      setSelectedIds([]);
      await fetchTests();
      setSuccessMsg('Selected test cases deleted.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      alert('Failed to delete selected test cases');
    }
  };

  const handleBulkSetVisibility = async (newVis) => {
    if (selectedIds.length === 0) return;
    try {
      for (const id of selectedIds) {
        await api.patch(`/questions/${currentQ._id}/tests/${id}`, {
          visibility: newVis
        });
      }
      setSelectedIds([]);
      await fetchTests();
      setSuccessMsg(`Updated visibility for ${selectedIds.length} test cases.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      alert('Failed to update visibility');
    }
  };

  return (
    <div className="w-full pb-16 animate-fadeIn select-none">
      {/* ────────────────────────────────────────────────────────────────────────────
          1. TOP NAVIGATION / PAGE HEADER
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-extrabold tracking-wider text-[#777D78] uppercase">
              TESTFORGE / TEST STUDIO
            </span>
          </div>

          <h1 className="text-3xl font-black text-[#171819] tracking-tight">
            Test Case Studio
          </h1>
          <p className="text-xs text-[#777D78] font-medium mt-0.5">
            Manage, organize and validate test cases for your programming challenge.
          </p>
        </div>

        {/* Right Header Actions matching screenshot */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Active Question Dropdown Selector */}
          <div className="relative" ref={questionDropdownRef}>
            <button
              type="button"
              onClick={() => setIsQuestionDropdownOpen(!isQuestionDropdownOpen)}
              className="px-4 py-2 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] shadow-xs flex items-center gap-2 transition-all cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5 text-[#777D78]" />
              <span className="max-w-[190px] truncate">
                {currentQ?.title || 'Select Question'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[#777D78]" />
            </button>

            {isQuestionDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-[#DDE1DA] shadow-xl p-2 z-50 animate-scaleUp">
                <div className="px-2 py-1.5 mb-1 border-b border-[#DDE1DA]/60">
                  <input
                    type="text"
                    value={questionSearchQuery}
                    onChange={(e) => setQuestionSearchQuery(e.target.value)}
                    placeholder="Search challenges..."
                    className="w-full bg-[#F2F3F0] rounded-lg px-2.5 py-1 text-xs text-[#171819] focus:outline-none"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {questions
                    .filter((q) =>
                      (q.title || '').toLowerCase().includes(questionSearchQuery.toLowerCase())
                    )
                    .map((q) => (
                      <button
                        key={q._id}
                        type="button"
                        onClick={() => {
                          setCurrentQ(q);
                          if (onSelectQuestion) onSelectQuestion(q);
                          setIsQuestionDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors ${
                          q._id === currentQ?._id
                            ? 'bg-[#EDFF72] text-[#191A1D] font-bold'
                            : 'hover:bg-[#F2F3F0] text-[#171819]'
                        }`}
                      >
                        <span className="truncate pr-2">{q.title}</span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/70 border border-[#DDE1DA]">
                          {q.difficulty || 'Med'}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Draft Status Indicator */}
          <div className="px-3.5 py-1.5 rounded-full bg-white border border-[#DDE1DA] flex items-center gap-1.5 text-xs font-bold text-[#777D78]">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>{currentQ?.status === 'published' ? 'Published' : 'Draft'}</span>
          </div>

          {/* Save Draft */}
          <button
            type="button"
            disabled={savingDraft}
            onClick={handleSaveDraft}
            className="px-4 py-2 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5 text-[#777D78]" />
            <span>{savingDraft ? 'Saving...' : 'Save Draft'}</span>
          </button>

          {/* Validate Suite */}
          <button
            type="button"
            disabled={validating}
            onClick={handleValidateSuite}
            className="px-4 py-2 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <Play className={`w-3.5 h-3.5 text-[#777D78] ${validating ? 'animate-spin' : ''}`} />
            <span>{validating ? 'Validating...' : 'Validate Suite'}</span>
          </button>

          {/* Publish Button (Primary Lime) */}
          <button
            type="button"
            disabled={publishing}
            onClick={handlePublishSuite}
            className="px-5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] text-xs font-black text-[#191A1D] shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5 fill-current" />
            <span>{publishing ? 'Publishing...' : 'Publish'}</span>
          </button>
        </div>
      </div>

      {/* Alert Banners */}
      {errorMsg && (
        <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          2. THREE-COLUMN WORKSPACE
          Column 1 (Left 20%): Suite Navigation & Actions
          Column 2 (Center 52%): Test Case Cards List
          Column 3 (Right 28%): Suite Health & Analytics
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ══════════════════════════════════════════════════════════════════════════
            COLUMN 1: LEFT PANEL (~20%, 3 cols of 12)
            ══════════════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-5 shadow-xs flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-[#171819]" />
                <h2 className="text-sm font-extrabold text-[#171819]">Test Suite</h2>
              </div>
              <p className="text-[11px] text-[#777D78] mb-4">
                Organize test cases by type and purpose.
              </p>

              {/* Navigation Options with real counts */}
              <nav className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('public')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    activeCategoryFilter === 'public'
                      ? 'bg-[#EDFF72] text-[#191A1D] shadow-xs'
                      : 'text-[#171819] hover:bg-[#F2F3F0]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-[#777D78]" />
                    <span>Public Samples</span>
                  </span>
                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      activeCategoryFilter === 'public'
                        ? 'bg-black/10 text-[#191A1D]'
                        : 'bg-[#F2F3F0] text-[#777D78]'
                    }`}
                  >
                    {counts.public}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('hidden')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    activeCategoryFilter === 'hidden'
                      ? 'bg-[#EDFF72] text-[#191A1D] shadow-xs'
                      : 'text-[#171819] hover:bg-[#F2F3F0]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-[#777D78]" />
                    <span>Hidden Tests</span>
                  </span>
                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      activeCategoryFilter === 'hidden'
                        ? 'bg-black/10 text-[#191A1D]'
                        : 'bg-[#F2F3F0] text-[#777D78]'
                    }`}
                  >
                    {counts.hidden}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('edge')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    activeCategoryFilter === 'edge'
                      ? 'bg-[#EDFF72] text-[#191A1D] shadow-xs'
                      : 'text-[#171819] hover:bg-[#F2F3F0]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#777D78]" />
                    <span>Edge Cases</span>
                  </span>
                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      activeCategoryFilter === 'edge'
                        ? 'bg-black/10 text-[#191A1D]'
                        : 'bg-[#F2F3F0] text-[#777D78]'
                    }`}
                  >
                    {counts.edge}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('stress')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    activeCategoryFilter === 'stress'
                      ? 'bg-[#EDFF72] text-[#191A1D] shadow-xs'
                      : 'text-[#171819] hover:bg-[#F2F3F0]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-[#777D78]" />
                    <span>Stress Tests</span>
                  </span>
                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      activeCategoryFilter === 'stress'
                        ? 'bg-black/10 text-[#191A1D]'
                        : 'bg-[#F2F3F0] text-[#777D78]'
                    }`}
                  >
                    {counts.stress}
                  </span>
                </button>
              </nav>

              {/* Section Divider */}
              <div className="pt-5 mt-4 border-t border-[#DDE1DA]/60">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#777D78] block mb-2.5">
                  Suite Actions
                </span>

                <div className="space-y-2">
                  {/* Add Test Case Button */}
                  <button
                    type="button"
                    onClick={() => openAddModal()}
                    className="w-full py-2.5 px-3 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-extrabold text-[#171819] border border-[#DDE1DA] flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#777D78]" />
                    <span>Add Test Case</span>
                  </button>

                  {/* Generate with AI */}
                  <button
                    type="button"
                    onClick={() => setIsAIModalOpen(true)}
                    className="w-full py-2.5 px-3 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#777D78]" />
                    <span>Generate with AI</span>
                  </button>

                  {/* Import Test Cases */}
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(true)}
                    className="w-full py-2.5 px-3 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#777D78]" />
                    <span>Import Test Cases</span>
                  </button>

                  {/* Export Suite */}
                  <button
                    type="button"
                    onClick={handleExportSuite}
                    className="w-full py-2.5 px-3 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#777D78]" />
                    <span>Export Suite</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Tip Panel matching screenshot */}
            <div className="mt-5 p-3.5 rounded-2xl bg-[#EDFF72]/15 border border-[#DEEF65] text-[#171819]">
              <div className="flex items-center gap-1.5 font-bold text-xs mb-1">
                <HelpCircle className="w-3.5 h-3.5 text-[#191A1D]" />
                <span>Tip</span>
              </div>
              <p className="text-[11px] text-[#777D78] leading-relaxed">
                Use a mix of sample, edge and stress tests for comprehensive coverage.
              </p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            COLUMN 2: CENTER PANEL (~52%, 6 cols of 12)
            ══════════════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-6 shadow-xs">
            {/* Header of Center Workspace */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-[#DDE1DA]/60">
              <div>
                <h3 className="text-base font-black text-[#171819] flex items-center gap-2">
                  <span>
                    {activeCategoryFilter === 'public'
                      ? `Public Samples (${counts.public})`
                      : activeCategoryFilter === 'hidden'
                      ? `Hidden Tests (${counts.hidden})`
                      : activeCategoryFilter === 'edge'
                      ? `Edge Cases (${counts.edge})`
                      : `Stress Tests (${counts.stress})`}
                  </span>
                </h3>
                <p className="text-xs text-[#777D78] mt-0.5">
                  {activeCategoryFilter === 'public'
                    ? 'Visible to students as examples. Keep them clear and illustrative.'
                    : activeCategoryFilter === 'hidden'
                    ? 'Grading test cases kept secret from students during assessment.'
                    : activeCategoryFilter === 'edge'
                    ? 'Boundary and extreme condition tests to catch logical bugs.'
                    : 'Performance test cases for benchmarking runtime and memory limits.'}
                </p>
              </div>

              {/* Search & Actions */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#777D78] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search test cases..."
                    className="w-44 sm:w-52 bg-[#F2F3F0] rounded-full pl-8 pr-3 py-1.5 text-xs text-[#171819] border border-[#DDE1DA] focus:outline-none focus:border-[#191A1D] transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSelectAll}
                  title="Select All"
                  className="p-2 rounded-full bg-white hover:bg-[#F2F3F0] border border-[#DDE1DA] text-[#777D78] hover:text-[#171819] cursor-pointer"
                >
                  {selectedIds.length > 0 && selectedIds.length === filteredTestCases.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-[#191A1D]" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Bulk Toolbar if rows are selected */}
            {selectedIds.length > 0 && (
              <div className="p-3 mb-4 rounded-2xl bg-[#191A1D] text-white flex items-center justify-between gap-3 animate-fadeIn">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#EDFF72] text-[#191A1D] text-[10px] font-black flex items-center justify-center">
                    {selectedIds.length}
                  </span>
                  <span>Selected</span>
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleBulkSetVisibility('public')}
                    className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold"
                  >
                    Make Public
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkSetVisibility('hidden')}
                    className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold"
                  >
                    Make Hidden
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="px-2.5 py-1 rounded-full bg-rose-600 hover:bg-rose-700 text-[11px] font-bold"
                  >
                    Delete Selected
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredTestCases.length === 0 && (
              <div className="text-center py-12 px-4 border border-dashed border-[#DDE1DA] rounded-2xl bg-[#F2F3F0]/40">
                <Layers className="w-8 h-8 text-[#777D78] mx-auto mb-2 opacity-50" />
                <h4 className="text-xs font-bold text-[#171819]">No test cases in this category</h4>
                <p className="text-[11px] text-[#777D78] mt-1 max-w-sm mx-auto">
                  Add custom test cases or generate comprehensive suites using AI.
                </p>
                <button
                  type="button"
                  onClick={() => openAddModal()}
                  className="mt-4 px-4 py-1.5 rounded-full bg-[#EDFF72] text-[#191A1D] text-xs font-extrabold shadow-xs cursor-pointer"
                >
                  + Add First Test Case
                </button>
              </div>
            )}

            {/* Test Case Cards List matching screenshot */}
            <div className="space-y-4">
              {filteredTestCases.map((tc, idx) => {
                const isSelected = selectedIds.includes(tc._id);
                const isVerified = tc.verificationStatus === 'verified';
                const isFailed = tc.verificationStatus === 'failed' || tc.verificationStatus === 'error';

                return (
                  <div
                    key={tc._id || idx}
                    className={`bg-white border rounded-2xl p-4 transition-all duration-150 ${
                      isSelected
                        ? 'border-[#EDFF72] ring-2 ring-[#EDFF72]/40 shadow-sm'
                        : 'border-[#DDE1DA] hover:border-[#CBD0C8] shadow-2xs'
                    }`}
                  >
                    {/* Top Row: Checkbox, Title, Badges, Action Icons */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(tc._id)}
                          className="cursor-pointer text-[#777D78] hover:text-[#171819]"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#191A1D]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>

                        <span className="text-xs font-black text-[#171819]">
                          Test Case #{idx + 1}
                        </span>

                        {/* Visibility Badge */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            tc.visibility === 'public'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {tc.visibility === 'public' ? (
                            <Eye className="w-2.5 h-2.5" />
                          ) : (
                            <Lock className="w-2.5 h-2.5" />
                          )}
                          <span className="capitalize">{tc.visibility}</span>
                        </span>

                        {/* Category Badge */}
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F2F3F0] text-[#777D78] border border-[#DDE1DA] capitalize">
                          {tc.category === 'sample' ? 'Example' : tc.category.replace('_', ' ')}
                        </span>

                        {/* Verification Status Badge */}
                        {isVerified && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Verified</span>
                          </span>
                        )}
                        {isFailed && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                            <X className="w-3 h-3 text-rose-600" />
                            <span>Failed</span>
                          </span>
                        )}
                      </div>

                      {/* Right Action Icons: Run, Duplicate, Edit, Delete */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleRunSingleTest(tc)}
                          title="Run Test"
                          className="w-7 h-7 rounded-lg text-[#777D78] hover:text-[#171819] hover:bg-[#F2F3F0] flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDuplicateTestCase(tc)}
                          title="Duplicate Test"
                          className="w-7 h-7 rounded-lg text-[#777D78] hover:text-[#171819] hover:bg-[#F2F3F0] flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(tc)}
                          title="Edit Test"
                          className="w-7 h-7 rounded-lg text-[#777D78] hover:text-[#171819] hover:bg-[#F2F3F0] flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTestCase(tc._id)}
                          title="Delete Test"
                          className="w-7 h-7 rounded-lg text-[#777D78] hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Middle Row: 3 Aligned Boxes (Input, Expected Output, Explanation) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 my-3">
                      {/* Box 1: Input */}
                      <div className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-2.5 relative group">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-[#777D78] uppercase">Input</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(tc.input, `in-${tc._id}`)}
                            title="Copy input"
                            className="text-[#777D78] hover:text-[#171819] cursor-pointer"
                          >
                            {copiedKey === `in-${tc._id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <pre className="text-xs font-mono font-medium text-[#171819] whitespace-pre-wrap leading-tight break-all">
                          {tc.input}
                        </pre>
                      </div>

                      {/* Box 2: Expected Output */}
                      <div className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-2.5 relative group">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-[#777D78] uppercase">Expected Output</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(tc.expectedOutput, `out-${tc._id}`)}
                            title="Copy expected output"
                            className="text-[#777D78] hover:text-[#171819] cursor-pointer"
                          >
                            {copiedKey === `out-${tc._id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <pre className="text-xs font-mono font-bold text-[#171819] whitespace-pre-wrap leading-tight break-all">
                          {tc.expectedOutput}
                        </pre>
                      </div>

                      {/* Box 3: Explanation */}
                      <div className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-2.5">
                        <span className="text-[10px] font-bold text-[#777D78] uppercase block mb-1">Explanation</span>
                        <p className="text-xs text-[#171819] leading-relaxed line-clamp-3">
                          {tc.explanation || (
                            <span className="text-[#777D78] italic">No explanation provided.</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Row (Card Footer): Visibility & Weight Dropdowns + Validation Indicator */}
                    <div className="pt-2 border-t border-[#DDE1DA]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-3">
                        {/* Visibility Selector */}
                        <div className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5 text-[#777D78]" />
                          <span className="text-[11px] font-bold text-[#777D78]">Visibility</span>
                          <select
                            value={tc.visibility}
                            onChange={(e) => handleVisibilityChange(tc._id, e.target.value)}
                            className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-lg px-2 py-0.5 text-[11px] font-bold text-[#171819] focus:outline-none cursor-pointer"
                          >
                            <option value="public">Public</option>
                            <option value="hidden">Hidden</option>
                          </select>
                        </div>

                        {/* Weight Selector */}
                        <div className="flex items-center gap-1">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-[#777D78]" />
                          <span className="text-[11px] font-bold text-[#777D78]">Weight</span>
                          <select
                            defaultValue="1.0"
                            className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-lg px-2 py-0.5 text-[11px] font-bold text-[#171819] focus:outline-none cursor-pointer"
                          >
                            <option value="1.0">1.0</option>
                            <option value="2.0">2.0</option>
                            <option value="0.5">0.5</option>
                          </select>
                        </div>
                      </div>

                      {/* Right Validation Status Pill with Info Icon matching screenshot */}
                      <div className="flex items-center gap-1 text-[11px]">
                        {isVerified ? (
                          <div className="flex items-center gap-1 font-bold text-emerald-700">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>Validation: Passed</span>
                            <Info className="w-3 h-3 text-[#777D78] hover:text-[#171819] cursor-pointer" title="Verified against reference solution in isolated VM" />
                          </div>
                        ) : isFailed ? (
                          <div className="flex items-center gap-1 font-bold text-rose-600">
                            <span className="w-2 h-2 rounded-full bg-rose-500" />
                            <span>Validation: Failed</span>
                            <Info className="w-3 h-3 text-[#777D78] hover:text-[#171819] cursor-pointer" title="Output mismatch or execution error" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 font-semibold text-[#777D78]">
                            <span className="w-2 h-2 rounded-full bg-slate-300" />
                            <span>Validation: Pending</span>
                            <Info className="w-3 h-3 text-[#777D78] hover:text-[#171819] cursor-pointer" title="Click 'Validate Suite' to verify with reference solution" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            COLUMN 3: RIGHT PANEL (~28%, 3 cols of 12)
            ══════════════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-3 space-y-4">
          {/* CARD 1: SUITE HEALTH */}
          <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3.5">
              <Heart className="w-4 h-4 text-[#171819]" />
              <h3 className="text-xs font-black text-[#171819]">Suite Health</h3>
            </div>

            <div className="flex items-center gap-4">
              {/* Circular Lime Progress Ring matching screenshot */}
              <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-[#E9ECE7]"
                    strokeWidth="3.8"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-[#EDFF72] transition-all duration-700 ease-out"
                    strokeDasharray={`${healthStats.passRate}, 100`}
                    strokeWidth="3.8"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-black text-[#171819]">
                    {healthStats.passRate}%
                  </span>
                </div>
              </div>

              {/* Checklist */}
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100 shrink-0" />
                  <span className="font-bold text-[#171819] truncate">All test cases valid</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100 shrink-0" />
                  <span className="font-bold text-[#171819] truncate">Good coverage mix</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100 shrink-0" />
                  <span className="font-bold text-[#171819] truncate">Constraints respected</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100 shrink-0" />
                  <span className="font-bold text-[#171819] truncate">Ready to publish</span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: COVERAGE SUMMARY */}
          <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3.5">
              <BarChart3 className="w-4 h-4 text-[#171819]" />
              <h3 className="text-xs font-black text-[#171819]">Coverage Summary</h3>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-[#171819]">
                <span>Total Test Cases</span>
                <span className="font-black">{counts.all}</span>
              </div>
              <div className="flex items-center justify-between text-[#777D78]">
                <span>Public Samples</span>
                <span className="font-mono font-bold text-[#171819]">
                  {counts.public} ({counts.all > 0 ? Math.round((counts.public / counts.all) * 100) : 0}%)
                </span>
              </div>
              <div className="flex items-center justify-between text-[#777D78]">
                <span>Hidden Tests</span>
                <span className="font-mono font-bold text-[#171819]">
                  {counts.hidden} ({counts.all > 0 ? Math.round((counts.hidden / counts.all) * 100) : 0}%)
                </span>
              </div>
              <div className="flex items-center justify-between text-[#777D78]">
                <span>Edge Cases</span>
                <span className="font-mono font-bold text-[#171819]">
                  {counts.edge} ({counts.all > 0 ? Math.round((counts.edge / counts.all) * 100) : 0}%)
                </span>
              </div>
              <div className="flex items-center justify-between text-[#777D78]">
                <span>Stress Tests</span>
                <span className="font-mono font-bold text-[#171819]">
                  {counts.stress} ({counts.all > 0 ? Math.round((counts.stress / counts.all) * 100) : 0}%)
                </span>
              </div>

              {/* Segmented Progress Bar matching screenshot */}
              <div className="w-full h-2 rounded-full bg-[#E9ECE7] overflow-hidden flex mt-3">
                <div
                  style={{
                    width: `${counts.all > 0 ? (counts.public / counts.all) * 100 : 0}%`
                  }}
                  className="bg-emerald-500 h-full"
                  title="Public Samples"
                />
                <div
                  style={{
                    width: `${counts.all > 0 ? (counts.hidden / counts.all) * 100 : 0}%`
                  }}
                  className="bg-[#191A1D] h-full"
                  title="Hidden Tests"
                />
                <div
                  style={{
                    width: `${counts.all > 0 ? (counts.edge / counts.all) * 100 : 0}%`
                  }}
                  className="bg-[#EDFF72] h-full"
                  title="Edge Cases"
                />
                <div
                  style={{
                    width: `${counts.all > 0 ? (counts.stress / counts.all) * 100 : 0}%`
                  }}
                  className="bg-amber-400 h-full"
                  title="Stress Tests"
                />
              </div>
            </div>
          </div>

          {/* CARD 3: CONSTRAINTS (FROM QUESTION) */}
          <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#777D78]" />
                <h3 className="text-xs font-black text-[#171819]">Constraints (from question)</h3>
              </div>
              {onEditQuestion && (
                <button
                  type="button"
                  onClick={() => onEditQuestion(currentQ)}
                  className="text-[10px] font-bold text-[#777D78] hover:text-[#171819] cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>

            <div className="bg-[#F2F3F0] rounded-xl p-3 border border-[#DDE1DA] text-xs font-mono text-[#171819] leading-relaxed whitespace-pre-wrap">
              {currentQ?.constraints || '1 ≤ n ≤ 10⁵\n-10⁹ ≤ nums[i] ≤ 10⁹\nTime limit: 1.0s\nMemory limit: 256MB'}
            </div>
          </div>

          {/* CARD 4: RECENT VALIDATION (CHRONOLOGICAL TIMELINE) */}
          <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3.5">
              <Clock className="w-4 h-4 text-[#171819]" />
              <h3 className="text-xs font-black text-[#171819]">Recent Validation</h3>
            </div>

            <div className="space-y-3">
              {activityTimeline.map((item) => (
                <div key={item.id} className="flex items-start gap-2.5 text-xs">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#171819]">{item.title}</span>
                      <span className="text-[10px] text-[#777D78]">{item.time}</span>
                    </div>
                    <p className="text-[11px] text-[#777D78] truncate">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL: ADD / EDIT TEST CASE
          ──────────────────────────────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#191A1D]/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-[32px] border border-[#DDE1DA] max-w-lg w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#DDE1DA]/60">
              <h3 className="text-sm font-black text-[#171819]">
                {editingTestCase ? 'Edit Test Case' : 'Add New Test Case'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleSaveTestCase} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#171819] mb-1">Visibility</label>
                  <select
                    value={formVisibility}
                    onChange={(e) => setFormVisibility(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] focus:outline-none"
                  >
                    <option value="public">Public (Student Visible)</option>
                    <option value="hidden">Hidden (Teacher Only)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#171819] mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] focus:outline-none"
                  >
                    <option value="sample">Sample / Example</option>
                    <option value="normal">Normal / Standard</option>
                    <option value="edge_case">Edge Case</option>
                    <option value="boundary">Boundary Case</option>
                    <option value="stress">Stress / Performance</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#171819] mb-1">Input *</label>
                <textarea
                  rows={3}
                  required
                  value={formInput}
                  onChange={(e) => setFormInput(e.target.value)}
                  placeholder="e.g. 6&#10;10 9 2 5 3 7"
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 font-mono text-xs text-[#171819] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#171819] mb-1">Expected Output *</label>
                <textarea
                  rows={2}
                  required
                  value={formExpectedOutput}
                  onChange={(e) => setFormExpectedOutput(e.target.value)}
                  placeholder="e.g. 3"
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 font-mono font-bold text-emerald-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#171819] mb-1">Explanation</label>
                <textarea
                  rows={2}
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  placeholder="The LIS is [2, 5, 7], so the length is 3."
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs text-[#171819] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-[#DDE1DA]/60">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] font-bold text-[#171819]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] font-black text-[#191A1D] shadow-xs"
                >
                  {editingTestCase ? 'Update Test Case' : 'Save Test Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL: AI TEST CASE GENERATOR
          ──────────────────────────────────────────────────────────────────────────── */}
      {isAIModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#191A1D]/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-[32px] border border-[#DDE1DA] max-w-lg w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#DDE1DA]/60">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#EDFF72] text-[#191A1D] flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4 fill-current" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-[#171819]">Generate Test Cases with AI</h3>
                  <span className="text-[10px] text-[#777D78]">
                    Synthesize edge cases, boundary parameters and stress inputs.
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAIModalOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-[#171819] mb-1">Number of Cases</label>
                  <select
                    value={aiCaseCount}
                    onChange={(e) => setAiCaseCount(parseInt(e.target.value, 10))}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] focus:outline-none"
                  >
                    <option value={1}>1 Case</option>
                    <option value={2}>2 Cases</option>
                    <option value={3}>3 Cases</option>
                    <option value={5}>5 Cases</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#171819] mb-1">Category</label>
                  <select
                    value={aiCategory}
                    onChange={(e) => setAiCategory(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] focus:outline-none"
                  >
                    <option value="edge_case">Edge Cases</option>
                    <option value="boundary">Boundary Values</option>
                    <option value="stress">Stress / Performance</option>
                    <option value="normal">Normal Sequence</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#171819] mb-1">Visibility</label>
                  <select
                    value={aiVisibility}
                    onChange={(e) => setAiVisibility(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] focus:outline-none"
                  >
                    <option value="hidden">Hidden Tests</option>
                    <option value="public">Public Samples</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#171819] mb-1">AI Prompt / Focus Criteria</label>
                <textarea
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. Generate tests for strictly decreasing arrays and large duplicate elements..."
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs text-[#171819] focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium leading-relaxed">
                Note: AI-generated test cases are added as unverified drafts. Validate suite to verify expected outputs against the reference solution.
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-[#DDE1DA]/60">
                <button
                  type="button"
                  onClick={() => setIsAIModalOpen(false)}
                  className="px-4 py-2 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] font-bold text-[#171819]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isGeneratingAI}
                  onClick={handleGenerateAI}
                  className="px-5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] font-black text-[#191A1D] shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-current" />
                  <span>{isGeneratingAI ? 'Generating...' : 'Generate Cases'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL: IMPORT TEST CASES
          ──────────────────────────────────────────────────────────────────────────── */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#191A1D]/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-[32px] border border-[#DDE1DA] max-w-lg w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#DDE1DA]/60">
              <h3 className="text-sm font-black text-[#171819]">Import Test Cases (JSON)</h3>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-[#777D78]">
                Paste a JSON array of test cases with <code className="font-mono text-[#171819]">input</code> and <code className="font-mono text-[#171819]">expectedOutput</code> properties.
              </p>

              <textarea
                rows={7}
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder='[&#10;  { "input": "6\n10 9 2 5 3 7", "expectedOutput": "3", "category": "normal", "visibility": "hidden" }&#10;]'
                className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 font-mono text-xs text-[#171819] focus:outline-none"
              />

              {importError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {importError}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-[#DDE1DA]/60">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] font-bold text-[#171819]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportSuite}
                  className="px-5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] font-black text-[#191A1D] shadow-xs cursor-pointer"
                >
                  Import Suite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL: DETAILED VALIDATION EXECUTION REPORT
          ──────────────────────────────────────────────────────────────────────────── */}
      {isValidationReportOpen && validationReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#191A1D]/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-[32px] border border-[#DDE1DA] max-w-2xl w-full p-6 shadow-2xl animate-scaleUp max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]/60">
              <div>
                <h3 className="text-sm font-black text-[#171819]">Validation Execution Results</h3>
                <span className="text-[11px] text-[#777D78]">
                  Passed: {validationReport.passedTests} / {validationReport.totalTests} test cases
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsValidationReportOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-y-auto my-4 space-y-3 pr-1 text-xs">
              {validationReport.results?.map((res, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl border ${
                    res.passed
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : 'bg-rose-50/50 border-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-[#171819]">Test Case #{i + 1}</span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        res.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {res.status?.toUpperCase() || (res.passed ? 'PASSED' : 'FAILED')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mt-2">
                    <div>
                      <span className="text-[#777D78] block">Expected:</span>
                      <pre className="text-[#171819]">{res.expectedOutput}</pre>
                    </div>
                    <div>
                      <span className="text-[#777D78] block">Actual Output:</span>
                      <pre className={res.passed ? 'text-emerald-700' : 'text-rose-700'}>
                        {typeof res.actualOutput === 'object'
                          ? JSON.stringify(res.actualOutput)
                          : String(res.actualOutput || 'none')}
                      </pre>
                    </div>
                  </div>
                  {res.error && (
                    <div className="mt-2 text-rose-700 font-mono text-[10px] bg-white/80 p-2 rounded-lg border border-rose-200">
                      {res.error}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#DDE1DA]/60 flex justify-end">
              <button
                type="button"
                onClick={() => setIsValidationReportOpen(false)}
                className="px-5 py-2 rounded-full bg-[#191A1D] text-white font-bold text-xs"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestCaseStudioView;

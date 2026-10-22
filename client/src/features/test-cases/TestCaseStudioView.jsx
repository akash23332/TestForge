import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { SearchableQuestionSelect } from '../../components/SearchableQuestionSelect';
import { api } from '../../lib/api';
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
  Zap
} from 'lucide-react';

export const TestCaseStudioView = ({
  questions,
  selectedQuestion,
  onSelectQuestion,
  onEditQuestion,
  onNavigate
}) => {
  const currentQ = selectedQuestion || questions[0];
  const [testCases, setTestCases] = useState([]);
  const [validating, setValidating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // New Test Case Form State
  const [isAdding, setIsAdding] = useState(false);
  const [input, setInput] = useState('nums = [10, 20, 30], target = 50');
  const [expectedOutput, setExpectedOutput] = useState('[1, 2]');
  const [category, setCategory] = useState('normal');
  const [visibility, setVisibility] = useState('hidden');

  // Edit Test Case Form State
  const [editingTestId, setEditingTestId] = useState(null);
  const [editInput, setEditInput] = useState('');
  const [editExpectedOutput, setEditExpectedOutput] = useState('');
  const [editCategory, setEditCategory] = useState('normal');
  const [editVisibility, setEditVisibility] = useState('hidden');

  const fetchTests = async () => {
    if (!currentQ?._id) return;
    setLoading(true);
    try {
      const res = await api.get(`/questions/${currentQ._id}/tests`);
      setTestCases(res.data.data || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setValidationResult(null);
    setEditingTestId(null);
    fetchTests();
  }, [currentQ?._id]);

  const handleAddTest = async (e) => {
    e.preventDefault();
    if (!currentQ) return;
    try {
      await api.post(`/questions/${currentQ._id}/tests`, {
        input,
        expectedOutput,
        category,
        visibility
      });
      setIsAdding(false);
      setInput('nums = [10, 20, 30], target = 50');
      setExpectedOutput('[1, 2]');
      await fetchTests();
    } catch (err) {
      alert(err.customMessage || 'Failed to add test case');
    }
  };

  const startEdit = (tc) => {
    setEditingTestId(tc._id);
    setEditInput(tc.input);
    setEditExpectedOutput(tc.expectedOutput);
    setEditCategory(tc.category || 'normal');
    setEditVisibility(tc.visibility || 'hidden');
  };

  const handleSaveEdit = async (testId) => {
    if (!currentQ) return;
    try {
      await api.patch(`/questions/${currentQ._id}/tests/${testId}`, {
        input: editInput,
        expectedOutput: editExpectedOutput,
        category: editCategory,
        visibility: editVisibility
      });
      setEditingTestId(null);
      await fetchTests();
    } catch (err) {
      alert(err.customMessage || 'Failed to update test case');
    }
  };

  const handleDeleteTest = async (testId) => {
    if (!currentQ) return;
    if (!confirm('Are you sure you want to delete this test case?')) return;
    try {
      await api.delete(`/questions/${currentQ._id}/tests/${testId}`);
      await fetchTests();
    } catch (err) {
      alert(err.customMessage || 'Failed to delete test case');
    }
  };

  const handleValidate = async () => {
    if (!currentQ) return;
    setValidating(true);
    try {
      const res = await api.post(`/questions/${currentQ._id}/validate`);
      setValidationResult(res.data.data);
      await fetchTests();
    } catch (err) {
      alert(err.customMessage || 'Validation execution failed');
    } finally {
      setValidating(false);
    }
  };

  // Helper to load test presets
  const applyPreset = (presetInput, presetExpected, presetCat) => {
    setInput(presetInput);
    setExpectedOutput(presetExpected);
    setCategory(presetCat);
    setIsAdding(true);
  };

  // Stats calculation
  const verifiedCount = testCases.filter((tc) => tc.verificationStatus === 'verified').length;
  const failedCount = testCases.filter((tc) =>
    ['failed', 'error', 'timeout', 'invalid_test'].includes(tc.verificationStatus)
  ).length;
  const unverifiedCount = testCases.filter(
    (tc) => !tc.verificationStatus || tc.verificationStatus === 'unverified'
  ).length;

  if (!currentQ) {
    return (
      <div className="text-center py-16 bg-white border border-slate-200 rounded-3xl shadow-xs">
        <Layers className="mx-auto h-10 w-10 text-slate-300 mb-2" />
        <h3 className="text-slate-800 font-bold">No questions available</h3>
        <p className="text-xs text-slate-400 mt-1">Please create a question first to manage test cases.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header & Question Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 rounded-3xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-0.5 bg-orange-600 rounded-full" />
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
              Verification Engine
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Test Case Studio
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage public student samples and hidden grading tests with isolated reference execution proofs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SearchableQuestionSelect
            questions={questions}
            selectedQuestion={currentQ}
            onSelectQuestion={onSelectQuestion}
            className="w-64 sm:w-80"
          />

          {onEditQuestion && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onEditQuestion(currentQ)}
              title="Edit Question Statement, Starter Code, and Reference Solution"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit Question
            </Button>
          )}

          {onNavigate && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onNavigate('mutation')}
              title="Run Mutation Testing to check if your test suite catches student bugs"
              className="border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              <Zap className="h-3.5 w-3.5 text-purple-600 fill-current" /> Test Suite Strength
            </Button>
          )}

          <Button size="sm" onClick={handleValidate} isLoading={validating}>
            <Play className="h-3.5 w-3.5 fill-current" /> Run Validation
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Tests</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{testCases.length}</div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Verified</span>
          <div className="text-2xl font-extrabold text-emerald-600 mt-1">{verifiedCount}</div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Failed / Error</span>
          <div className="text-2xl font-extrabold text-rose-600 mt-1">{failedCount}</div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Unverified</span>
          <div className="text-2xl font-extrabold text-slate-600 mt-1">{unverifiedCount}</div>
        </div>
      </div>

      {/* Validation Banner after execution */}
      {validationResult && (
        <div
          className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs transition-all ${
            validationResult.status === 'all_passed'
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-rose-50 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-3.5">
            {validationResult.status === 'all_passed' ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="h-6 w-6 text-rose-600 shrink-0" />
            )}
            <div>
              <div
                className={`text-sm font-bold ${
                  validationResult.status === 'all_passed' ? 'text-emerald-950' : 'text-rose-950'
                }`}
              >
                {validationResult.status === 'all_passed'
                  ? `All ${validationResult.totalTests} Test Cases Verified Successfully`
                  : `Validation Discrepancies: ${validationResult.failedTests} of ${validationResult.totalTests} Tests Failed`}
              </div>
              <div
                className={`text-xs mt-0.5 ${
                  validationResult.status === 'all_passed' ? 'text-emerald-800' : 'text-rose-800'
                }`}
              >
                {validationResult.status === 'all_passed'
                  ? 'All expected outputs matched the reference solution execution. The test suite is verified.'
                  : 'The reference solution produced unexpected outputs or runtime errors. Review the failed test cases below.'}
              </div>
            </div>
          </div>

          <Badge variant={validationResult.status === 'all_passed' ? 'success' : 'error'}>
            {validationResult.status === 'all_passed'
              ? '100% Passed'
              : `${validationResult.passedTests}/${validationResult.totalTests} Passed`}
          </Badge>
        </div>
      )}

      {/* Test Cases List */}
      <Card
        title={`Configured Test Suite (${testCases.length})`}
        subtitle="Public sample cases are visible to students; hidden tests are strictly private teacher grading tests"
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setIsAdding(!isAdding)}>
              <Plus className="h-3.5 w-3.5" /> Add Test Case
            </Button>
          </div>
        }
      >
        {/* Add Test Case Form */}
        {isAdding && (
          <form
            onSubmit={handleAddTest}
            className="mb-6 p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 animate-fadeIn"
          >
            <div className="flex items-center justify-between">
              <div className="font-bold text-xs text-orange-600 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> New Test Case
              </div>
              {/* Presets */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
                <span className="font-medium text-[11px]">Quick Templates:</span>
                <button
                  type="button"
                  onClick={() => applyPreset('nums = [10, 20, 30], target = 50', '[1, 2]', 'normal')}
                  className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:border-orange-400 text-slate-700 text-[11px]"
                >
                  Test A (Valid 50)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('nums = [10, 20, 30], target = 1', '[1, 2]', 'edge_case')}
                  className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:border-rose-400 text-slate-700 text-[11px]"
                >
                  Test B (Buggy target 1)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('nums = [3, 3], target = 6', '[0, 1]', 'boundary')}
                  className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:border-emerald-400 text-slate-700 text-[11px]"
                >
                  Test C (Duplicates)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Input Arguments</label>
                <input
                  type="text"
                  required
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. nums = [10, 20, 30], target = 50"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-orange-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Supports named or positional arguments</span>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expected Output</label>
                <input
                  type="text"
                  required
                  value={expectedOutput}
                  onChange={(e) => setExpectedOutput(e.target.value)}
                  placeholder="e.g. [1, 2]"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono text-emerald-700 font-bold focus:outline-none focus:border-orange-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Exact return value from solution</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:border-orange-500"
                >
                  <option value="sample">Sample Test (Student visible example)</option>
                  <option value="normal">Standard / Normal Case</option>
                  <option value="edge_case">Edge Case</option>
                  <option value="boundary">Boundary Condition</option>
                  <option value="stress">Performance / Stress</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Visibility Scope</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:border-orange-500"
                >
                  <option value="public">Public (Student Visible Sample)</option>
                  <option value="hidden">Hidden (Teacher Only Grading Test)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button size="sm" variant="secondary" type="button" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit">
                Save Test Case
              </Button>
            </div>
          </form>
        )}

        {/* Test Cards */}
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading test cases...
          </div>
        ) : testCases.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No test cases found for this question. Click "Add Test Case" to begin.
          </div>
        ) : (
          <div className="space-y-3">
            {testCases.map((tc, idx) => {
              const isEditing = editingTestId === tc._id;
              // Find matching validation result if available
              const runInfo = validationResult?.results?.find(
                (r) => String(r.testCaseId) === String(tc._id)
              );

              // Render verification status badge
              const renderStatusBadge = () => {
                const status = tc.verificationStatus || 'unverified';
                if (status === 'verified') {
                  return (
                    <Badge variant="success">
                      <CheckCircle2 className="h-3 w-3" /> Verified
                    </Badge>
                  );
                }
                if (status === 'failed') {
                  return (
                    <Badge variant="error">
                      <XCircle className="h-3 w-3" /> Failed Mismatch
                    </Badge>
                  );
                }
                if (status === 'error') {
                  return (
                    <Badge variant="warning">
                      <AlertTriangle className="h-3 w-3" /> Runtime Error
                    </Badge>
                  );
                }
                if (status === 'timeout') {
                  return (
                    <Badge variant="error">
                      <Clock className="h-3 w-3" /> Timeout
                    </Badge>
                  );
                }
                if (status === 'invalid_test') {
                  return (
                    <Badge variant="error">
                      <HelpCircle className="h-3 w-3" /> Invalid Test
                    </Badge>
                  );
                }
                return <Badge variant="neutral">Unverified</Badge>;
              };

              return (
                <div
                  key={tc._id || idx}
                  className={`p-4 rounded-xl border transition-all ${
                    tc.verificationStatus === 'failed'
                      ? 'bg-rose-50/40 border-rose-200'
                      : tc.verificationStatus === 'verified'
                      ? 'bg-slate-50 border-slate-200/80 hover:border-slate-300'
                      : 'bg-slate-50 border-slate-200/80'
                  }`}
                >
                  {isEditing ? (
                    /* Inline Edit Mode */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-orange-600">Edit Test #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => setEditingTestId(null)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Input</label>
                          <input
                            type="text"
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Expected Output</label>
                          <input
                            type="text"
                            value={editExpectedOutput}
                            onChange={(e) => setEditExpectedOutput(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-700 font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Category</label>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700"
                          >
                            <option value="sample">Sample</option>
                            <option value="normal">Standard / Normal</option>
                            <option value="edge_case">Edge Case</option>
                            <option value="boundary">Boundary Condition</option>
                            <option value="stress">Stress / Performance</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Visibility</label>
                          <select
                            value={editVisibility}
                            onChange={(e) => setEditVisibility(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700"
                          >
                            <option value="public">Public Sample</option>
                            <option value="hidden">Hidden Grading</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <Button size="sm" variant="secondary" onClick={() => setEditingTestId(null)}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => handleSaveEdit(tc._id)}>
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Normal Display Mode */
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        {/* Left badges */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">Test #{idx + 1}</span>
                          <Badge variant={tc.visibility === 'public' ? 'info' : 'orange'}>
                            {tc.visibility === 'public' ? (
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" /> Public Sample
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Lock className="h-3 w-3" /> Hidden Grading
                              </span>
                            )}
                          </Badge>
                          <span className="text-[11px] font-semibold uppercase text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                            {tc.category}
                          </span>
                        </div>

                        {/* Right actions & status */}
                        <div className="flex items-center gap-2">
                          {renderStatusBadge()}
                          <button
                            onClick={() => startEdit(tc)}
                            title="Edit test case"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTest(tc._id)}
                            title="Delete test case"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Inputs & Outputs */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono bg-white p-3 rounded-lg border border-slate-200/70">
                        <div>
                          <span className="text-slate-400 select-none block text-[10px] uppercase font-sans font-bold">
                            Input
                          </span>
                          <span className="text-slate-800 font-semibold break-all">{tc.input}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 select-none block text-[10px] uppercase font-sans font-bold">
                            Expected Output
                          </span>
                          <span className="text-emerald-700 font-bold break-all">{tc.expectedOutput}</span>
                        </div>
                      </div>

                      {/* Execution Output if Run */}
                      {runInfo && (
                        <div
                          className={`p-3 rounded-lg border text-xs font-mono flex flex-col gap-1.5 ${
                            runInfo.passed
                              ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                              : 'bg-rose-50 border-rose-200 text-rose-950'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-sans font-bold">
                            <span>Execution Result: {runInfo.passed ? 'Matched' : 'Discrepancy'}</span>
                            <span className="text-slate-500 font-mono font-normal">{runInfo.runtimeMs}ms</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-4">
                            <div>
                              <span className="text-slate-500 font-sans text-[10px] uppercase font-bold mr-1.5">
                                Actual Output:
                              </span>
                              <span
                                className={`font-bold ${
                                  runInfo.passed ? 'text-emerald-700' : 'text-rose-700 font-bold underline'
                                }`}
                              >
                                {runInfo.actualOutput ?? 'null'}
                              </span>
                            </div>
                          </div>

                          {runInfo.error && (
                            <div className="mt-1 text-rose-700 text-[11px] font-sans bg-white/70 p-2 rounded border border-rose-200">
                              <span className="font-bold">Error Reason:</span> {runInfo.error}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default TestCaseStudioView;

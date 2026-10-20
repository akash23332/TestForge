import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { Save, ArrowLeft, AlertCircle, Edit3 } from 'lucide-react';

interface QuestionCreatorViewProps {
  onSuccess: () => void;
  onCancel: () => void;
  currentUser: any;
  initialQuestion?: any;
}

export const LANGUAGE_TEMPLATES: Record<string, { starterCode: string; referenceSolution: string }> = {
  javascript: {
    starterCode: `function solution(nums, target) {
  // Implement solution
}`,
    referenceSolution: `function solution(nums, target) {
  // Verified reference implementation
  return [1, 2];
}`
  },
  python: {
    starterCode: `def solution(nums, target):
    # Implement solution
    pass`,
    referenceSolution: `def solution(nums, target):
    # Verified reference implementation
    return [1, 2]`
  },
  java: {
    starterCode: `class Solution {
    public int[] solution(int[] nums, int target) {
        // Implement solution
        return new int[]{};
    }
}`,
    referenceSolution: `class Solution {
    public int[] solution(int[] nums, int target) {
        // Verified reference implementation
        return new int[]{1, 2};
    }
}`
  },
  cpp: {
    starterCode: `class Solution {
public:
    vector<int> solution(vector<int>& nums, int target) {
        // Implement solution
        return {};
    }
};`,
    referenceSolution: `class Solution {
public:
    vector<int> solution(vector<int>& nums, int target) {
        // Verified reference implementation
        return {1, 2};
    }
};`
  }
};

export const QuestionCreatorView: React.FC<QuestionCreatorViewProps> = ({
  onSuccess,
  onCancel,
  currentUser,
  initialQuestion
}) => {
  const isEditing = Boolean(initialQuestion && initialQuestion._id);

  const [title, setTitle] = useState(initialQuestion?.title || '');
  const [difficulty, setDifficulty] = useState(initialQuestion?.difficulty || 'Medium');
  const [language, setLanguage] = useState(initialQuestion?.language || 'javascript');
  const [tags, setTags] = useState(
    Array.isArray(initialQuestion?.tags) ? initialQuestion.tags.join(', ') : 'Algorithms, Array'
  );
  const [statement, setStatement] = useState(initialQuestion?.statement || '');
  const [constraints, setConstraints] = useState(
    initialQuestion?.constraints || '• 1 <= nums.length <= 10^5\n• Time limit: 1.0s'
  );
  const [sampleInput, setSampleInput] = useState(
    initialQuestion?.examples?.[0]?.input || '[1, 2, 3, 4], 5'
  );
  const [sampleOutput, setSampleOutput] = useState(
    initialQuestion?.examples?.[0]?.output || '[1, 2]'
  );
  const [starterCode, setStarterCode] = useState(
    initialQuestion?.starterCode || 'function solution(nums, target) {\n  // Implement solution\n}'
  );
  const [referenceSolution, setReferenceSolution] = useState(
    initialQuestion?.referenceSolution || 'function solution(nums, target) {\n  // Verified reference implementation\n  return [1, 2];\n}'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialQuestion) {
      setTitle(initialQuestion.title || '');
      setDifficulty(initialQuestion.difficulty || 'Medium');
      setLanguage(initialQuestion.language || 'javascript');
      setTags(Array.isArray(initialQuestion.tags) ? initialQuestion.tags.join(', ') : '');
      setStatement(initialQuestion.statement || '');
      setConstraints(initialQuestion.constraints || '');
      setSampleInput(initialQuestion.examples?.[0]?.input || '');
      setSampleOutput(initialQuestion.examples?.[0]?.output || '');
      setStarterCode(initialQuestion.starterCode || '');
      setReferenceSolution(initialQuestion.referenceSolution || '');
    }
  }, [initialQuestion?._id]);

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    const template = LANGUAGE_TEMPLATES[newLang];
    if (template) {
      setStarterCode(template.starterCode);
      setReferenceSolution(template.referenceSolution);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !statement) {
      setError('Title and problem statement are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        title,
        difficulty,
        language,
        tags: tags.split(',').map((t: string) => t.trim()).filter(Boolean),
        statement,
        constraints,
        examples: [
          {
            input: sampleInput,
            output: sampleOutput,
            explanation: 'Sample evaluation test case.'
          }
        ],
        starterCode,
        referenceSolution,
        status: 'published',
        ...(currentUser && { ownerId: currentUser.id || currentUser._id })
      };

      if (isEditing) {
        await api.patch(`/questions/${initialQuestion._id}`, payload);
      } else {
        await api.post('/questions', payload);
      }
      onSuccess();
    } catch (err: any) {
      const serverMsg = err.response?.data?.error?.message || err.customMessage || 'Failed to save question.';
      setError(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <button
          onClick={onCancel}
          className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1.5 font-bold cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Question Bank
        </button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} isLoading={loading}>
            <Save className="h-4 w-4" /> {isEditing ? 'Update Question' : 'Save & Publish'}
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-10 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-5 h-0.5 bg-orange-600 rounded-full" />
          <span className="text-xs font-bold uppercase tracking-wider text-orange-600">
            {isEditing ? 'Problem Editor' : 'Authoring Studio'}
          </span>
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          {isEditing && <Edit3 className="h-6 w-6 text-orange-600" />}
          {isEditing ? `Edit: ${initialQuestion.title}` : 'Create New Assessment Problem'}
        </h2>
        <p className="text-xs text-slate-500 mb-8 mt-1">
          {isEditing
            ? 'Update problem statement, constraints, starter code, or reference solution.'
            : 'Specify problem statement, constraints, public starter template, and private teacher reference solution.'}
        </p>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title & Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Question Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Merge K Sorted Lists"
                className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-medium transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-orange-500 font-semibold"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Language Target</label>
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-orange-500 font-semibold"
              >
                <option value="javascript">JavaScript (ES6)</option>
                <option value="python">Python 3</option>
                <option value="java">Java 17/21</option>
                <option value="cpp">C++ 20</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Tags (comma-separated)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Array, Two Pointers, Greedy"
                className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
          </div>

          {/* Statement */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Problem Statement *
            </label>
            <textarea
              rows={4}
              required
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Describe the problem, input format, output format, and algorithmic specifications..."
              className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-sans leading-relaxed transition-colors"
            />
          </div>

          {/* Constraints */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Constraints</label>
            <textarea
              rows={2}
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl p-4 text-xs font-mono text-slate-700 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          {/* Sample Input & Output */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Sample Input</label>
              <input
                type="text"
                value={sampleInput}
                onChange={(e) => setSampleInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Sample Expected Output</label>
              <input
                type="text"
                value={sampleOutput}
                onChange={(e) => setSampleOutput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono text-emerald-600 focus:outline-none focus:border-orange-500 font-bold"
              />
            </div>
          </div>

          {/* Code Editors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Starter Code (Student Visible)</label>
                <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                  Public
                </span>
              </div>
              <textarea
                rows={7}
                value={starterCode}
                onChange={(e) => setStarterCode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-sky-300 focus:outline-none focus:border-orange-500 shadow-inner"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Reference Solution (Private)</label>
                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                  Teacher Only
                </span>
              </div>
              <textarea
                rows={7}
                value={referenceSolution}
                onChange={(e) => setReferenceSolution(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-purple-300 focus:outline-none focus:border-orange-500 shadow-inner"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" isLoading={loading}>
              <Save className="h-4 w-4" /> {isEditing ? 'Save Changes' : 'Save Question'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuestionCreatorView;

import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  Search,
  PlusCircle,
  FileCode2,
  Trash2,
  Eye,
  Activity,
  Layers,
  Pencil
} from 'lucide-react';
import { api } from '../../lib/api';

export const QuestionBankView = ({
  questions = [],
  onRefresh,
  onNavigate,
  onSelectQuestion,
  onEditQuestion,
  initialSearch = ''
}) => {
  const [search, setSearch] = useState(initialSearch);
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [activeModalQuestion, setActiveModalQuestion] = useState(null);

  // Sync initialSearch if prop changes
  React.useEffect(() => {
    setSearch(initialSearch || '');
  }, [initialSearch]);

  const filtered = questions.filter((q) => {
    const qTitle = (q.title || '').toLowerCase();
    const qStatement = (q.statement || '').toLowerCase();
    const qLang = (q.language || '').toLowerCase();
    const qTags = Array.isArray(q.tags) ? q.tags.join(' ').toLowerCase() : '';

    const matchesSearch =
      !search ||
      qTitle.includes(search.toLowerCase()) ||
      qStatement.includes(search.toLowerCase()) ||
      qTags.includes(search.toLowerCase()) ||
      qLang.includes(search.toLowerCase());

    const matchesDifficulty = difficultyFilter ? q.difficulty === difficultyFilter : true;
    const matchesLanguage = languageFilter ? qLang === languageFilter.toLowerCase() : true;

    return matchesSearch && matchesDifficulty && matchesLanguage;
  });

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this question and its test cases?')) return;
    try {
      await api.delete(`/questions/${id}`);
      if (activeModalQuestion?._id === id) setActiveModalQuestion(null);
      onRefresh();
    } catch {
      alert('Failed to delete question. Make sure you are authenticated as the question owner.');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-0.5 bg-orange-600 rounded-full" />
            <span className="text-xs font-bold uppercase tracking-wider text-orange-600">Question Catalog</span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Assessment Question Bank</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Click any question to manage test cases, run mutation tests, or edit solutions.
          </p>
        </div>

        <Button onClick={() => onNavigate('create')} className="cursor-pointer shrink-0">
          <PlusCircle className="h-4 w-4" /> Create Question
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search questions by title, keyword, language, or algorithmic concept..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors shadow-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">All Languages</option>
            <option value="java">Java</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
          </select>

          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>
      </div>

      {/* Questions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
            <FileCode2 className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No matching questions found</h3>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria or create a new question.</p>
          </div>
        ) : (
          filtered.map((q) => (
            <Card
              key={q._id}
              onClick={() => setActiveModalQuestion(q)}
              className="flex flex-col justify-between hover:border-orange-300 hover:shadow-md transition-all group cursor-pointer border-slate-200/90 relative"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <Badge
                    variant={
                      q.difficulty === 'Easy'
                        ? 'success'
                        : q.difficulty === 'Medium'
                        ? 'warning'
                        : 'error'
                    }
                  >
                    {q.difficulty}
                  </Badge>
                  <span className="font-mono text-xs font-bold uppercase text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                    {q.language || 'javascript'}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 mb-1.5 group-hover:text-orange-600 transition-colors line-clamp-1">
                  {q.title}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-3 mb-4 leading-relaxed">
                  {q.statement}
                </p>

                {q.tags && q.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {q.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-semibold bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md border border-orange-100"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  <button
                    title="Add & Manage Test Cases"
                    onClick={() => {
                      onSelectQuestion(q);
                      onNavigate('tests');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-orange-50 hover:text-orange-600 text-slate-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Tests
                  </button>
                  <button
                    title="Run Mutation Tests"
                    onClick={() => {
                      onSelectQuestion(q);
                      onNavigate('mutation');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                  >
                    <Activity className="h-3.5 w-3.5" />
                    Mutate
                  </button>
                  <button
                    title="Edit Question"
                    onClick={() => onEditQuestion(q)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    title="Student vs Teacher Preview"
                    onClick={() => {
                      onSelectQuestion(q);
                      onNavigate('preview');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                </div>

                <button
                  title="Delete Question"
                  onClick={(e) => handleDelete(q._id, e)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Question Action Modal */}
      {activeModalQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge
                    variant={
                      activeModalQuestion.difficulty === 'Easy'
                        ? 'success'
                        : activeModalQuestion.difficulty === 'Medium'
                        ? 'warning'
                        : 'error'
                    }
                  >
                    {activeModalQuestion.difficulty}
                  </Badge>
                  <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {activeModalQuestion.language || 'javascript'}
                  </span>
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {activeModalQuestion.title}
                </h3>
              </div>
              <button
                onClick={() => setActiveModalQuestion(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Statement Snippet & Action Grid */}
            <div className="p-6 space-y-5">
              <p className="text-xs text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-200 line-clamp-3 leading-relaxed">
                {activeModalQuestion.statement}
              </p>

              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">
                  Choose Action for this Question:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Option 1: Test Studio */}
                  <button
                    onClick={() => {
                      onSelectQuestion(activeModalQuestion);
                      setActiveModalQuestion(null);
                      onNavigate('tests');
                    }}
                    className="p-4 rounded-2xl bg-white hover:bg-orange-50/60 border border-slate-200 hover:border-orange-300 text-left transition-all cursor-pointer group shadow-xs hover:shadow-sm"
                  >
                    <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                      <Layers className="h-5 w-5" />
                    </div>
                    <span className="block text-sm font-bold text-slate-900 group-hover:text-orange-600">
                      Test Case Studio
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Add, edit, and verify public & hidden tests with JVM proofs
                    </span>
                  </button>

                  {/* Option 2: Mutation Lab */}
                  <button
                    onClick={() => {
                      onSelectQuestion(activeModalQuestion);
                      setActiveModalQuestion(null);
                      onNavigate('mutation');
                    }}
                    className="p-4 rounded-2xl bg-white hover:bg-purple-50/60 border border-slate-200 hover:border-purple-300 text-left transition-all cursor-pointer group shadow-xs hover:shadow-sm"
                  >
                    <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                      <Activity className="h-5 w-5" />
                    </div>
                    <span className="block text-sm font-bold text-slate-900 group-hover:text-purple-600">
                      Mutation Testing Lab
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Inject deterministic bugs and calculate test suite score
                    </span>
                  </button>

                  {/* Option 3: Edit Question */}
                  <button
                    onClick={() => {
                      onEditQuestion(activeModalQuestion);
                      setActiveModalQuestion(null);
                    }}
                    className="p-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-left transition-all cursor-pointer group shadow-xs"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                      <Pencil className="h-5 w-5" />
                    </div>
                    <span className="block text-sm font-bold text-slate-900">
                      Edit Question Details
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Modify statement, starter code, and reference solution
                    </span>
                  </button>

                  {/* Option 4: Visibility Preview */}
                  <button
                    onClick={() => {
                      onSelectQuestion(activeModalQuestion);
                      setActiveModalQuestion(null);
                      onNavigate('preview');
                    }}
                    className="p-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-left transition-all cursor-pointer group shadow-xs"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                      <Eye className="h-5 w-5" />
                    </div>
                    <span className="block text-sm font-bold text-slate-900">
                      Student Preview
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Preview student examination vs faculty solution view
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionBankView;

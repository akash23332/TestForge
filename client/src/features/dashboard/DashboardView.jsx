import React, { useState } from 'react';
import heroBg from '../../assets/dashboard-hero.jpg';
import { Badge } from '../../components/ui/Badge';
import {
  FileCode2,
  CheckCircle2,
  Activity,
  UploadCloud,
  ChevronRight,
  ShieldCheck,
  BookOpen,
  Sparkles,
  ArrowRight,
  Search
} from 'lucide-react';

export const DashboardView = ({
  questions = [],
  onNavigate,
  onSelectQuestion
}) => {
  const [dashFilter, setDashFilter] = useState('');

  const displayQuestions = dashFilter.trim()
    ? questions.filter((q) => {
        const query = dashFilter.toLowerCase();
        const title = (q.title || '').toLowerCase();
        const stmt = (q.statement || '').toLowerCase();
        const lang = (q.language || '').toLowerCase();
        const tags = Array.isArray(q.tags) ? q.tags.join(' ').toLowerCase() : '';
        return title.includes(query) || stmt.includes(query) || lang.includes(query) || tags.includes(query);
      })
    : questions.slice(0, 4);
  return (
    <div className="w-full animate-fadeIn">
      {/* Full-Screen Width Hero Section with Glowing Waves Background */}
      <div className="relative w-full overflow-hidden bg-slate-950 text-white shadow-2xl border-b border-slate-800/80 min-h-[620px] sm:min-h-[720px] lg:min-h-[780px] flex flex-col justify-between">
        {/* High-res Golden Orange Wave Background with Dark Gradient Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src={heroBg}
            alt="Glowing waves hero background"
            className="w-full h-full object-cover object-right lg:object-center transform scale-105"
          />
          {/* Multi-layered gradient overlay for text legibility and rich contrast */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-950/40" />
        </div>

        {/* Main Hero Content - Aligned to max-w-[1780px] container */}
        <div className="relative z-10 w-full max-w-[1780px] mx-auto px-4 sm:px-8 lg:px-12 py-24 sm:py-32 lg:py-40 flex-1 flex flex-col justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs sm:text-sm font-bold uppercase tracking-wider mb-7 backdrop-blur-md w-fit">
            <Sparkles className="h-4 w-4 text-orange-400" />
            Empowering Faculty & Coding Educators
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.12] drop-shadow-md max-w-4xl">
            A Great Place for <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500">
              Assessment Engineering
            </span>
          </h1>

          <p className="mt-6 text-slate-200 text-base sm:text-lg lg:text-xl leading-relaxed max-w-3xl font-normal drop-shadow-sm">
            Choose from verified coding questions, execute deterministic mutation suites to catch weak test cases, and preview exact student visibility without secret leaks.
          </p>

          {/* Action buttons */}
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <button
              onClick={() => onNavigate('create')}
              className="px-8 py-4 rounded-2xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-extrabold text-sm sm:text-base shadow-xl shadow-orange-600/30 transition-all flex items-center gap-2 cursor-pointer transform hover:-translate-y-0.5"
            >
              Get Started <ChevronRight className="h-5 w-5" />
            </button>

            <button
              onClick={() => onNavigate('bank')}
              className="px-8 py-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-sm sm:text-base shadow-lg transition-all flex items-center gap-2 cursor-pointer transform hover:-translate-y-0.5"
            >
              View Questions <ChevronRight className="h-5 w-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Bottom Feature Strip */}
        <div className="relative z-10 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-md py-7 sm:py-8">
          <div className="max-w-[1780px] mx-auto px-4 sm:px-8 lg:px-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-orange-500/15 border border-orange-500/30 text-orange-400 flex items-center justify-center shrink-0">
                <FileCode2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">100+ Verified Patterns</h4>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-normal">
                  Reference solutions tested against comprehensive edge cases.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Zero Leak Visibility</h4>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-normal">
                  Private solutions and hidden tests stay strictly server-side.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Mutation Testing Engine</h4>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-normal">
                  Deterministic AST & regex bugs to validate grading test suites.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lower Dashboard Content Container */}
      <div className="max-w-[1780px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-12">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-0.5 bg-orange-600 rounded-full" />
            <span className="text-xs font-bold uppercase tracking-wider text-orange-600">
              About TestForge
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-1">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
                Prepare Assessments with Total Confidence
              </h2>
            </div>

            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-slate-600 leading-relaxed">
              <p>
                TestForge replaces manual, error-prone assessment prep with a systematic engineering workflow. Teachers can author problems, verify expected outputs against reference code, and export clean exams.
              </p>
              <p>
                Our built-in mutation lab tests your tests: by injecting synthetic arithmetic and relational defects, it measures the exact percentage of bugs your test suite would catch in real student submissions.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Statistics Counter Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mb-3">
              <FileCode2 className="h-5 w-5" />
            </div>
            <div className="text-3xl font-extrabold text-slate-900">{questions.length}</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Coding Questions in Bank</div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="text-3xl font-extrabold text-slate-900">100%</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Reference Pass Rate</div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
              <Activity className="h-5 w-5" />
            </div>
            <div className="text-3xl font-extrabold text-slate-900">75%</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Mutation Suite Quality</div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mb-3">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="text-3xl font-extrabold text-slate-900">0 Leaks</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Strict Server Split</div>
          </div>
        </div>

        {/* Main Split: Questions Catalog & Assessment Tools */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Questions Catalog */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Featured Assessment Questions</h3>
                <p className="text-xs text-slate-500">Filter or search across verified questions</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Quick search questions..."
                    value={dashFilter}
                    onChange={(e) => setDashFilter(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-orange-500 w-44 sm:w-56"
                  />
                  {dashFilter && (
                    <button
                      type="button"
                      onClick={() => setDashFilter('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                <button
                  onClick={() => onNavigate('bank')}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  Browse All ({questions.length}) <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {displayQuestions.length === 0 ? (
                <div className="col-span-2 py-10 text-center bg-white border border-slate-200 rounded-2xl p-6">
                  <p className="text-xs text-slate-400">No questions found matching "{dashFilter}"</p>
                  <button
                    onClick={() => setDashFilter('')}
                    className="text-xs font-bold text-orange-600 mt-2 hover:underline cursor-pointer"
                  >
                    Clear search filter
                  </button>
                </div>
              ) : (
                displayQuestions.map((q) => (
                  <div
                    key={q._id}
                    className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
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
                        <span className="text-[11px] font-mono font-semibold uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {q.language}
                        </span>
                      </div>

                      <h4 className="font-bold text-slate-900 text-sm mb-1.5">{q.title}</h4>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4">
                        {q.statement}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium">
                        {q.tags?.[0] ? `#${q.tags[0]}` : '#Algorithms'}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            onSelectQuestion(q);
                            onNavigate('tests');
                          }}
                          className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-orange-50 hover:text-orange-600 font-semibold text-slate-700 transition-colors cursor-pointer"
                        >
                          Tests
                        </button>
                        <button
                          onClick={() => {
                            onSelectQuestion(q);
                            onNavigate('mutation');
                          }}
                          className="text-xs px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 font-semibold text-white transition-colors cursor-pointer"
                        >
                          Mutate
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Quick Action Cards */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Faculty Quick Tools</h3>

            <div className="space-y-3">
              <div
                onClick={() => onNavigate('preview')}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs hover:border-orange-300 hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-orange-600 transition-colors">
                      Visibility Auditor
                    </h4>
                    <p className="text-xs text-slate-500">Student vs Teacher preview</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-orange-600 group-hover:translate-x-0.5 transition-all" />
              </div>

              <div
                onClick={() => onNavigate('mcq')}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs hover:border-orange-300 hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                    <UploadCloud className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-orange-600 transition-colors">
                      Bulk MCQ Import
                    </h4>
                    <p className="text-xs text-slate-500">CSV preview & row validation</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-orange-600 group-hover:translate-x-0.5 transition-all" />
              </div>

              <div
                onClick={() => onNavigate('paper')}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs hover:border-orange-300 hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-orange-600 transition-colors">
                      Smart Paper Designer
                    </h4>
                    <p className="text-xs text-slate-500">Assemble marks & duration</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-orange-600 group-hover:translate-x-0.5 transition-all" />
              </div>

              <div
                onClick={() => onNavigate('create')}
                className="bg-gradient-to-br from-orange-600 to-orange-700 text-white rounded-2xl p-5 shadow-md shadow-orange-600/20 cursor-pointer hover:opacity-95 transition-all"
              >
                <span className="text-xs uppercase font-bold tracking-wider text-orange-200">New Assessment</span>
                <h4 className="text-base font-bold mt-1">Author New Problem Statement</h4>
                <p className="text-xs text-orange-100 mt-1 leading-relaxed">
                  Add statement, constraints, starter code, and verified reference solutions.
                </p>
                <div className="mt-4 flex items-center gap-1 font-bold text-xs text-white">
                  Open Question Creator <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;

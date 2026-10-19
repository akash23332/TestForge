import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X, FileCode2 } from 'lucide-react';
import { Badge } from './ui/Badge';

interface SearchableQuestionSelectProps {
  questions: any[];
  selectedQuestion: any;
  onSelectQuestion: (question: any) => void;
  className?: string;
  placeholder?: string;
}

export const SearchableQuestionSelect: React.FC<SearchableQuestionSelectProps> = ({
  questions,
  selectedQuestion,
  onSelectQuestion,
  className = '',
  placeholder = 'Select a question...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [diffFilter, setDiffFilter] = useState<string>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearch('');
      setLangFilter('all');
      setDiffFilter('all');
    }
  }, [isOpen]);

  const filteredQuestions = questions.filter((q) => {
    const qTitle = (q.title || '').toLowerCase();
    const qStatement = (q.statement || '').toLowerCase();
    const qLang = (q.language || '').toLowerCase();
    const qTags = Array.isArray(q.tags) ? q.tags.join(' ').toLowerCase() : '';
    const qDiff = (q.difficulty || '').toLowerCase();

    const matchesSearch =
      !search ||
      qTitle.includes(search.toLowerCase()) ||
      qStatement.includes(search.toLowerCase()) ||
      qLang.includes(search.toLowerCase()) ||
      qTags.includes(search.toLowerCase());

    const matchesLang = langFilter === 'all' || qLang === langFilter;
    const matchesDiff = diffFilter === 'all' || qDiff === diffFilter.toLowerCase();

    return matchesSearch && matchesLang && matchesDiff;
  });

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-2xl px-4 py-2.5 text-xs text-slate-800 font-semibold shadow-xs transition-all cursor-pointer focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <FileCode2 className="h-4 w-4 text-orange-600 shrink-0" />
          {selectedQuestion ? (
            <div className="flex items-center gap-2 truncate">
              <span className="font-bold text-slate-900 truncate">{selectedQuestion.title}</span>
              <Badge
                variant={
                  selectedQuestion.difficulty === 'Easy'
                    ? 'success'
                    : selectedQuestion.difficulty === 'Medium'
                    ? 'warning'
                    : 'error'
                }
                className="text-[10px] px-2 py-0.5 shrink-0"
              >
                {selectedQuestion.difficulty}
              </Badge>
              <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 shrink-0">
                {selectedQuestion.language || 'javascript'}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-orange-600' : ''
          }`}
        />
      </button>

      {/* Searchable Dropdown Overlay */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-full min-w-[340px] sm:min-w-[440px] bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-fadeIn">
          {/* Search Box Header */}
          <div className="p-3 border-b border-slate-100 space-y-2.5 bg-slate-50/70">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search questions by title, language, or concept..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 shadow-xs"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Quick Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400 font-bold uppercase text-[9px] mr-1">Filter:</span>
              {['all', 'java', 'python', 'javascript'].map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLangFilter(lang)}
                  className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                    langFilter === lang
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200/80 border border-slate-200/60'
                  }`}
                >
                  {lang === 'all' ? 'All Languages' : lang.toUpperCase()}
                </button>
              ))}

              <div className="h-3 w-px bg-slate-300 mx-1" />

              {['all', 'easy', 'medium', 'hard'].map((diff) => (
                <button
                  key={diff}
                  type="button"
                  onClick={() => setDiffFilter(diff)}
                  className={`px-2 py-0.5 rounded-lg font-bold capitalize transition-all ${
                    diffFilter === diff
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200/80 border border-slate-200/60'
                  }`}
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>

          {/* Question List */}
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 p-1.5">
            {filteredQuestions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No questions found matching "{search}".
              </div>
            ) : (
              filteredQuestions.map((q) => {
                const isSelected = selectedQuestion?._id === q._id;
                return (
                  <div
                    key={q._id}
                    onClick={() => {
                      onSelectQuestion(q);
                      setIsOpen(false);
                    }}
                    className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-orange-50/80 border border-orange-200'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-900 truncate">{q.title}</span>
                        <Badge
                          variant={
                            q.difficulty === 'Easy'
                              ? 'success'
                              : q.difficulty === 'Medium'
                              ? 'warning'
                              : 'error'
                          }
                          className="text-[9px] px-1.5 py-0.2"
                        >
                          {q.difficulty}
                        </Badge>
                        <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {q.language || 'javascript'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1">
                        {q.statement || 'No description provided.'}
                      </p>
                    </div>

                    {isSelected && (
                      <div className="h-6 w-6 rounded-full bg-orange-600 text-white flex items-center justify-center shrink-0">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Info */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>
              Showing {filteredQuestions.length} of {questions.length} questions
            </span>
            <span className="text-slate-400 text-[10px]">Click any question to switch context</span>
          </div>
        </div>
      )}
    </div>
  );
};

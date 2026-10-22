import React, { useState, useEffect, useRef } from 'react';
import { api } from './lib/api';
import { AuthModal } from './features/auth/AuthModal';
import { AuthPage } from './features/auth/AuthPage';
import { DashboardView } from './features/dashboard/DashboardView';
import { QuestionBankView } from './features/questions/QuestionBankView';
import { QuestionCreatorView } from './features/questions/QuestionCreatorView';
import { TestCaseStudioView } from './features/test-cases/TestCaseStudioView';
import { MutationLabView } from './features/mutation-lab/MutationLabView';
import { McqImportView } from './features/mcq-import/McqImportView';
import { VisibilityPreviewView } from './features/visibility-preview/VisibilityPreviewView';
import { PaperDesignerView } from './features/exam-paper/PaperDesignerView';
import { ProfileSettingsModal } from './features/profile/ProfileSettingsModal';
import {
  Search,
  Moon,
  Menu,
  X,
  Settings,
  LogOut,
  Layers,
  Zap,
  ChevronDown
} from 'lucide-react';

export const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [health, setHealth] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    const saved = localStorage.getItem('testforge_theme');
    return saved ? saved === 'dark' : true; // Default dark theme active
  });

  // Sync dark mode class on root HTML element
  useEffect(() => {
    localStorage.setItem('testforge_theme', isDarkTheme ? 'dark' : 'light');
    if (isDarkTheme) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkTheme]);

  // Load user session from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('testforge_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch {
        // Ignore
      }
    } else {
      // Default demo teacher
      setCurrentUser({
        name: 'Dr. Sarah Mitchell',
        email: 'teacher@testforge.edu',
        role: 'Faculty'
      });
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('testforge_token');
    localStorage.removeItem('testforge_user');
    setCurrentUser(null);
    setSelectedQuestion(null);
    setQuestions([]);
    setEditingQuestion(null);
    setIsProfileOpen(false);
    setActiveTab('login');
  };

  const fetchQuestions = async () => {
    try {
      const res = await api.get('/questions?limit=50');
      const items = res.data.data || [];
      setQuestions(items);

      // Validate selectedQuestion: clear if deleted or not in list
      setSelectedQuestion((prev) => {
        if (!prev) return items.length > 0 ? items[0] : null;
        const exists = items.find((q) => q._id === prev._id);
        return exists || (items.length > 0 ? items[0] : null);
      });
    } catch {
      setQuestions([]);
      setSelectedQuestion(null);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await api.get('/health');
      setHealth(res.data);
    } catch {
      // Degraded
    }
  };

  useEffect(() => {
    fetchQuestions();
    fetchHealth();
  }, []);

  const navLinks = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'bank', label: 'Question Bank' },
    { id: 'create', label: 'Create Question' },
    { id: 'tests', label: 'Test Studio' },
    { id: 'mutation', label: 'Mutation Lab' },
    { id: 'mcq', label: 'Bulk MCQ' },
    { id: 'preview', label: 'Visibility' },
    { id: 'paper', label: 'Paper Designer' }
  ];

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const [isMoreNavOpen, setIsMoreNavOpen] = useState(false);
  const moreNavRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
      if (moreNavRef.current && !moreNavRef.current.contains(e.target)) {
        setIsMoreNavOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Dynamically compute optimal spacious width and alignment for search dropdown
  useEffect(() => {
    const updateDropdownPos = () => {
      if (searchRef.current) {
        const rect = searchRef.current.getBoundingClientRect();
        const margin = 16;
        // Roomy target width for full visibility of tags, title, statement, and action buttons
        const targetWidth = 620;
        const screenWidth = window.innerWidth;
        const availableWidth = screenWidth - margin * 2;
        const actualWidth = Math.min(targetWidth, availableWidth);

        // Check if expanding to the right from rect.left fits on screen
        if (rect.left + actualWidth <= screenWidth - margin) {
          setDropdownStyle({
            left: 0,
            width: `${actualWidth}px`,
          });
        } else {
          // Shift left to prevent overflowing the right edge
          const overflow = (rect.left + actualWidth) - (screenWidth - margin);
          setDropdownStyle({
            left: `${-overflow}px`,
            width: `${actualWidth}px`,
          });
        }
      }
    };

    if (isSearchOpen) {
      updateDropdownPos();
      window.addEventListener('resize', updateDropdownPos);
      window.addEventListener('scroll', updateDropdownPos, true);
      return () => {
        window.removeEventListener('resize', updateDropdownPos);
        window.removeEventListener('scroll', updateDropdownPos, true);
      };
    }
  }, [isSearchOpen, headerSearch]);

  const searchResults = headerSearch.trim()
    ? questions.filter((q) => {
        const query = headerSearch.toLowerCase();
        const title = (q.title || '').toLowerCase();
        const statement = (q.statement || '').toLowerCase();
        const lang = (q.language || '').toLowerCase();
        const tags = Array.isArray(q.tags) ? q.tags.join(' ').toLowerCase() : '';
        return (
          title.includes(query) ||
          statement.includes(query) ||
          lang.includes(query) ||
          tags.includes(query)
        );
      }).slice(0, 5)
    : [];

  const handleHeaderSearch = (e) => {
    if (e) e.preventDefault();
    setIsSearchOpen(false);
    setActiveTab('bank');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
      {/* Top Header Navigation - Wide screen style */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-[1780px] w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-4">
            {/* Logo */}
            <div
              className="flex items-center gap-2.5 cursor-pointer shrink-0"
              onClick={() => setActiveTab('dashboard')}
            >
              <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20 font-bold text-lg">
                TF
              </div>
              <div>
                <span className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-1">
                  Test<span className="text-orange-600">Forge</span>
                </span>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block -mt-1">
                  Assessment Platform
                </span>
              </div>
            </div>

            {/* Prominent Search Bar with Live Suggestions Dropdown */}
            <div
              ref={searchRef}
              className="flex items-center relative min-w-[280px] sm:min-w-[340px] md:min-w-[380px] lg:min-w-[440px] max-w-xl flex-1 mx-2 sm:mx-4 shrink-0 sm:shrink"
            >
              <form onSubmit={handleHeaderSearch} className="relative w-full flex items-center">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search questions by title, tags, or language..."
                  value={headerSearch}
                  onFocus={() => {
                    if (headerSearch.trim()) setIsSearchOpen(true);
                  }}
                  onChange={(e) => {
                    setHeaderSearch(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-100/90 focus:bg-white text-slate-800 placeholder-slate-400 text-sm rounded-2xl pl-12 pr-20 py-3 border border-slate-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all shadow-xs"
                />

                {headerSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderSearch('');
                      setIsSearchOpen(false);
                    }}
                    title="Clear search"
                    className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}

                <button
                  type="submit"
                  aria-label="Submit Search"
                  title="Search in Question Bank"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-orange-600 hover:bg-orange-500 text-white p-2 rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center"
                >
                  <Search className="h-4 w-4" />
                </button>
              </form>

              {/* Live Search Results Dropdown - Full-sized and roomy */}
              {isSearchOpen && headerSearch.trim().length > 0 && (
                <div
                  style={dropdownStyle}
                  className="absolute top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn"
                >
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-600 uppercase tracking-wider text-[11px]">
                        Search Results
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold text-[11px]">
                        {searchResults.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleHeaderSearch()}
                      className="font-bold text-orange-600 hover:text-orange-700 cursor-pointer text-xs flex items-center gap-1 group"
                    >
                      <span>View All in Bank</span>
                      <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                    </button>
                  </div>

                  {searchResults.length > 0 ? (
                    <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                      {searchResults.map((q) => (
                        <div
                          key={q._id}
                          onClick={() => {
                            setSelectedQuestion(q);
                            setIsSearchOpen(false);
                            setActiveTab('bank');
                          }}
                          className="p-3.5 sm:p-4 hover:bg-orange-50/50 transition-colors cursor-pointer flex items-center justify-between gap-3 sm:gap-4 group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  q.difficulty === 'Easy'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : q.difficulty === 'Medium'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {q.difficulty}
                              </span>
                              <span className="text-[10px] font-mono uppercase bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-semibold border border-slate-200/60">
                                {q.language}
                              </span>
                              {q.tags && (
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {Array.isArray(q.tags)
                                    ? q.tags.slice(0, 3).map((t) => `#${t}`).join(' ')
                                    : `#${q.tags}`}
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 group-hover:text-orange-600 transition-colors line-clamp-1">
                              {q.title}
                            </h4>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                              {q.statement}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 self-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedQuestion(q);
                                setIsSearchOpen(false);
                                setActiveTab('tests');
                              }}
                              className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-orange-100 hover:text-orange-700 text-slate-700 rounded-xl transition-all cursor-pointer border border-slate-200/80 active:scale-95 flex items-center gap-1"
                              title="Open in Test Studio"
                            >
                              <Layers className="h-3.5 w-3.5 text-slate-500" />
                              <span>Tests</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedQuestion(q);
                                setIsSearchOpen(false);
                                setActiveTab('mutation');
                              }}
                              className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl transition-all cursor-pointer shadow-xs shadow-orange-500/20 active:scale-95 flex items-center gap-1"
                              title="Open in Mutation Lab"
                            >
                              <Zap className="h-3.5 w-3.5 text-white" />
                              <span>Mutate</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400">
                      <Search className="h-8 w-8 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
                      <p className="text-sm font-semibold text-slate-700">No matching questions found</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Try searching by keywords, tags, or programming language
                      </p>
                    </div>
                  )}

                  <div className="p-3 bg-slate-50 border-t border-slate-100 text-center flex items-center justify-between px-4">
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                      Tip: Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono shadow-xs">Enter</kbd> to view all
                    </span>
                    <button
                      type="button"
                      onClick={() => handleHeaderSearch()}
                      className="text-xs font-bold text-orange-600 hover:text-orange-700 cursor-pointer flex items-center gap-1 group py-1 mx-auto sm:mx-0"
                    >
                      <span>Press Enter or Click to View All in Question Bank</span>
                      <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Pills */}
            {/* 2XL Screens (>= 1536px): Full pills */}
            <nav className="hidden 2xl:flex items-center gap-1">
              {navLinks.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === item.id
                      ? 'bg-orange-600 text-white shadow-xs shadow-orange-600/30'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {/* XL Screens (1280px - 1535px): 4 core pills + More dropdown */}
            <nav className="hidden xl:flex 2xl:hidden items-center gap-1">
              {navLinks.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-2.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === item.id
                      ? 'bg-orange-600 text-white shadow-xs shadow-orange-600/30'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}

              <div className="relative" ref={moreNavRef}>
                <button
                  type="button"
                  onClick={() => setIsMoreNavOpen(!isMoreNavOpen)}
                  className={`px-2.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                    navLinks.slice(4).some((l) => l.id === activeTab)
                      ? 'bg-orange-600 text-white shadow-xs shadow-orange-600/30'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span>
                    {navLinks.slice(4).find((l) => l.id === activeTab)?.label || 'More'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {isMoreNavOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 animate-fadeIn">
                    {navLinks.slice(4).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setIsMoreNavOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer ${
                          activeTab === item.id
                            ? 'bg-orange-50 text-orange-600 font-bold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </nav>

            {/* Right Tools & User Info */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Dark mode button */}
              <button
                onClick={() => setIsDarkTheme(!isDarkTheme)}
                title={isDarkTheme ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Moon className="h-4 w-4" />
              </button>

              {/* Settings direct icon button */}
              <button
                onClick={() => setIsProfileOpen(true)}
                title="Workspace Settings"
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Settings className="h-4 w-4" />
              </button>

              {/* User Avatar Button - Opens Profile & Settings Modal */}
              {currentUser ? (
                <button
                  onClick={() => setIsProfileOpen(true)}
                  title={`Profile & Settings (${currentUser?.name || 'Faculty'})`}
                  className="w-9 h-9 rounded-full bg-orange-100 hover:bg-orange-600 text-orange-600 hover:text-white border border-orange-300 shadow-xs transition-all flex items-center justify-center font-bold text-sm cursor-pointer active:scale-95 shrink-0"
                >
                  {currentUser?.name ? currentUser.name[0].toUpperCase() : 'A'}
                </button>
              ) : (
                <button
                  onClick={() => setActiveTab('login')}
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-sm shadow-orange-500/20 cursor-pointer shrink-0"
                >
                  Faculty Sign In
                </button>
              )}

              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="xl:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="xl:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1 shadow-lg">
            {navLinks.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg flex items-center justify-between ${
                  activeTab === item.id
                    ? 'bg-orange-50 text-orange-600 font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className={`flex-1 w-full ${activeTab === 'dashboard' ? '' : 'max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 py-8'}`}>
        {activeTab === 'dashboard' && (
          <DashboardView
            questions={questions}
            onNavigate={(tab) => setActiveTab(tab)}
            onSelectQuestion={(q) => setSelectedQuestion(q)}
          />
        )}

        {activeTab === 'bank' && (
          <QuestionBankView
            questions={questions}
            onRefresh={fetchQuestions}
            onNavigate={(tab) => {
              if (tab === 'create') setEditingQuestion(null);
              setActiveTab(tab);
            }}
            onSelectQuestion={(q) => setSelectedQuestion(q)}
            onEditQuestion={(q) => {
              setEditingQuestion(q);
              setSelectedQuestion(q);
              setActiveTab('create');
            }}
            initialSearch={headerSearch}
          />
        )}

        {activeTab === 'create' && (
          <QuestionCreatorView
            initialQuestion={editingQuestion}
            onSuccess={() => {
              setEditingQuestion(null);
              fetchQuestions();
              setActiveTab('bank');
            }}
            onCancel={() => {
              setEditingQuestion(null);
              setActiveTab('bank');
            }}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'tests' && (
          <TestCaseStudioView
            questions={questions}
            selectedQuestion={selectedQuestion}
            onSelectQuestion={(q) => setSelectedQuestion(q)}
            onEditQuestion={(q) => {
              setEditingQuestion(q);
              setSelectedQuestion(q);
              setActiveTab('create');
            }}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'mutation' && (
          <MutationLabView
            questions={questions}
            selectedQuestion={selectedQuestion}
            onSelectQuestion={(q) => setSelectedQuestion(q)}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'mcq' && <McqImportView />}

        {activeTab === 'preview' && (
          <VisibilityPreviewView
            questions={questions}
            selectedQuestion={selectedQuestion}
            onSelectQuestion={(q) => setSelectedQuestion(q)}
          />
        )}

        {activeTab === 'paper' && <PaperDesignerView questions={questions} />}

        {activeTab === 'login' && (
          <AuthPage
            onSuccess={(user) => {
              setCurrentUser(user);
              setSelectedQuestion(null);
              setEditingQuestion(null);
              setActiveTab('dashboard');
              fetchQuestions();
            }}
            onNavigateHome={() => setActiveTab('dashboard')}
          />
        )}
      </main>

      {/* Professional Clean Footer */}
      <footer className="bg-white border-t border-slate-200 mt-16 text-slate-600 text-xs">
        <div className="max-w-[1780px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold text-sm">
                  TF
                </div>
                <span className="text-lg font-bold text-slate-900">
                  Test<span className="text-orange-600">Forge</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Empowering academic faculty with verified assessment authoring, deterministic mutation suites, and strict student visibility safeguards.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-3 text-xs uppercase tracking-wider">Features</h4>
              <ul className="space-y-2 text-slate-500">
                <li><button onClick={() => setActiveTab('bank')} className="hover:text-orange-600">Question Bank</button></li>
                <li><button onClick={() => setActiveTab('tests')} className="hover:text-orange-600">Test Case Studio</button></li>
                <li><button onClick={() => setActiveTab('mutation')} className="hover:text-orange-600">Mutation Testing Lab</button></li>
                <li><button onClick={() => setActiveTab('preview')} className="hover:text-orange-600">Visibility Auditor</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-3 text-xs uppercase tracking-wider">Assessment Tools</h4>
              <ul className="space-y-2 text-slate-500">
                <li><button onClick={() => setActiveTab('mcq')} className="hover:text-orange-600">Bulk MCQ Import</button></li>
                <li><button onClick={() => setActiveTab('paper')} className="hover:text-orange-600">Smart Paper Designer</button></li>
                <li><a href="/api/v1/health" target="_blank" className="hover:text-orange-600">System Health API</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row items-center justify-between text-slate-400 gap-2">
            <span>© 2026 TestForge Inc. All rights reserved.</span>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => {
          setCurrentUser(user);
          setSelectedQuestion(null);
          setEditingQuestion(null);
          setActiveTab('dashboard');
          fetchQuestions();
        }}
        currentUser={currentUser}
      />

      {/* Profile & Settings Modal */}
      <ProfileSettingsModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        onLogout={handleLogout}
        health={health}
      />
    </div>
  );
};

export default App;

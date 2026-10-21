import React, { useState, useEffect } from 'react';
import { api } from './lib/api';
import { HealthResponse } from './types';
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
  Settings
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<any | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
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
      setSelectedQuestion((prev: any) => {
        if (!prev) return items.length > 0 ? items[0] : null;
        const exists = items.find((q: any) => q._id === prev._id);
        return exists || (items.length > 0 ? items[0] : null);
      });
    } catch {
      setQuestions([]);
      setSelectedQuestion(null);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await api.get<HealthResponse>('/health');
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

  const handleHeaderSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (headerSearch.trim()) {
      setActiveTab('bank');
    }
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

            {/* Prominent Large Search Bar & Dedicated Magnifying Icon Button */}
            <form
              onSubmit={handleHeaderSearch}
              className="hidden lg:flex items-center relative flex-1 max-w-xl xl:max-w-2xl mx-3"
            >
              <div className="relative w-full flex items-center">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search questions by title, tags, syllabus or language..."
                  value={headerSearch}
                  onChange={(e) => setHeaderSearch(e.target.value)}
                  className="w-full bg-slate-100 hover:bg-slate-100/90 focus:bg-white text-slate-800 placeholder-slate-400 text-sm rounded-2xl pl-12 pr-14 py-3 border border-slate-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all shadow-xs"
                />
                <button
                  type="submit"
                  aria-label="Submit Search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-orange-600 hover:bg-orange-500 text-white p-2 rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </form>

            {/* Navigation Pills */}
            <nav className="hidden xl:flex items-center gap-1">
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

              {/* Teacher Account Button - Opens Profile & Settings Modal */}
              {currentUser ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsProfileOpen(true)}
                    title="View Profile & Settings"
                    className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-white hover:bg-orange-50/70 border border-slate-200 shadow-xs transition-all text-xs font-semibold text-slate-700 cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors flex items-center justify-center font-bold text-xs border border-orange-200">
                      {currentUser?.name ? currentUser.name[0] : 'T'}
                    </div>
                    <span className="max-w-[120px] truncate hidden sm:inline">
                      {currentUser?.name}
                    </span>
                  </button>
                  <button
                    onClick={handleLogout}
                    title="Sign Out"
                    className="text-xs text-slate-500 hover:text-rose-600 font-bold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer border border-transparent hover:border-rose-100"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setActiveTab('login')}
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-sm shadow-orange-500/20 cursor-pointer"
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
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1 shadow-lg">
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

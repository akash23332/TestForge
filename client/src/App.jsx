import React, { useState, useEffect } from 'react';
import { api } from './lib/api';
import { AuthModal } from './features/auth/AuthModal';
import { AuthPage } from './features/auth/AuthPage';
import { DashboardView } from './features/dashboard/DashboardView';
import { QuestionBankView } from './features/questions/QuestionBankView';
import { QuestionCreatorView } from './features/questions/QuestionCreatorView';
import { TestCaseStudioView } from './features/test-cases/TestCaseStudioView';
import { MutationLabView } from './features/mutation-lab/MutationLabView';
import { McqImportView } from './features/mcq-import/McqImportView';
import { PaperDesignerView } from './features/exam-paper/PaperDesignerView';
import { ProfileSettingsModal } from './features/profile/ProfileSettingsModal';
import { StudentPortalContainer } from './features/student-portal/StudentPortalContainer';
import { StudentDashboardView } from './features/student-portal/StudentDashboardView';
import { TeacherExamsView } from './features/exam-management/TeacherExamsView';
import { BentoSidebar } from './features/dashboard/BentoSidebar';
import { BentoTopHeader } from './features/dashboard/BentoTopHeader';
import './features/dashboard/bento-theme.css';
import {
  Menu,
  X,
  Sparkles,
  LayoutDashboard,
  BookOpen,
  FilePlus,
  FlaskConical,
  TestTube,
  Files,
  FileText,
  ClipboardList,
  ChartNoAxesCombined,
  Settings,
  LogOut
} from 'lucide-react';

export const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [candidateExamCode, setCandidateExamCode] = useState('');
  const [health, setHealth] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('testforge_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Strict Light Mode enforcement: remove dark class and legacy theme keys
  useEffect(() => {
    localStorage.removeItem('testforge_theme');
    document.documentElement.classList.remove('dark');
  }, []);

  // Load user session from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('testforge_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setCurrentUser(parsed);
      } catch {
        setCurrentUser(null);
      }
    } else {
      setCurrentUser(null);
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

  // 8 Core Modules for mobile drawer
  const mobileNavLinks = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'bank', label: 'Question Bank', icon: BookOpen },
    { id: 'create', label: 'Create Question', icon: FilePlus },
    { id: 'tests', label: 'Test Studio', icon: FlaskConical },
    { id: 'mutation', label: 'Mutation Lab', icon: TestTube },
    { id: 'mcq', label: 'Bulk MCQ', icon: Files },
    { id: 'paper', label: 'Paper Designer', icon: FileText },
    { id: 'exams', label: 'Examinations', icon: ClipboardList }
  ];

  // Top horizontal module navigation pills matching the sidebar order
  const navigationPills = [
    { id: 'dashboard', label: 'Overview' },
    { id: 'bank', label: 'Question Bank' },
    { id: 'create', label: 'Create Question' },
    { id: 'tests', label: 'Test Studio' },
    { id: 'mutation', label: 'Mutation Lab' },
    { id: 'mcq', label: 'Bulk MCQ' },
    { id: 'paper', label: 'Paper Designer' },
    { id: 'exams', label: 'Examinations' },
  ];

  // 1. If activeTab is 'login' or no user logged in, render dedicated AuthPage
  if (activeTab === 'login' || !currentUser) {
    return (
      <div className="min-h-screen bg-[#F2F3F0]">
        <AuthPage
          onSuccess={(user) => {
            setCurrentUser(user);
            setSelectedQuestion(null);
            setEditingQuestion(null);
            if (user?.role === 'student' || user?.role === 'Student') {
              // Automatically renders StudentDashboardView
            } else {
              setActiveTab('dashboard');
              fetchQuestions();
            }
          }}
          onNavigateHome={() => {
            if (!currentUser) {
              setActiveTab('login');
            } else {
              setActiveTab('dashboard');
            }
          }}
        />
      </div>
    );
  }

  // 2. If authenticated as a Student, render dedicated Student Examination Portal
  if (currentUser && (currentUser.role === 'student' || currentUser.role === 'Student')) {
    return (
      <StudentDashboardView
        currentUser={currentUser}
        onSignOut={handleLogout}
      />
    );
  }

  return (
    <div className="tf-outer-frame selection:bg-[#EDFF72] selection:text-[#191A1D]">
      <div className="tf-inner-canvas">
        {/* Left Vertical Dark Charcoal Sidebar (Desktop / Tablet) */}
        <BentoSidebar
          activeTab={activeTab}
          onNavigate={(tab) => setActiveTab(tab)}
          currentUser={currentUser}
          onOpenProfile={() => setIsProfileOpen(true)}
          onLogout={handleLogout}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto max-h-[calc(100vh-28px)] p-4 sm:p-6 lg:p-7">
          {/* Mobile Top Header (Small Screens) */}
          <div className="md:hidden flex items-center justify-between pb-3 border-b border-[#DDE1DA] mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#191A1D] flex items-center justify-center text-[#EDFF72]">
                <Sparkles className="w-4 h-4 fill-current" />
              </div>
              <span className="font-extrabold text-sm text-[#171819]">TestForge</span>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-white border border-[#DDE1DA] text-[#171819]"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>

          {/* Mobile Navigation Drawer */}
          {mobileMenuOpen && (
            <div className="md:hidden bg-white border border-[#DDE1DA] rounded-2xl p-3 mb-4 shadow-lg space-y-1">
              {mobileNavLinks.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'analytics') setActiveTab('dashboard');
                      else setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                      isActive
                        ? 'bg-[#191A1D] text-[#EDFF72]'
                        : 'text-[#171819] hover:bg-[#F2F3F0]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <div className="pt-2 border-t border-[#DDE1DA] flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="flex-1 py-2 text-xs font-bold text-[#171819] bg-[#F2F3F0] rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex-1 py-2 text-xs font-bold text-rose-600 bg-rose-50 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}

          {/* Top Header Bar */}
          <BentoTopHeader
            activeTab={activeTab}
            onNavigate={(tab) => setActiveTab(tab)}
            currentUser={currentUser}
            questions={questions}
            onSelectQuestion={(q) => setSelectedQuestion(q)}
            onOpenProfile={() => setIsProfileOpen(true)}
          />

          {/* Global Module Navigation Pills (Visible on all pages) */}
          <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1 scrollbar-none select-none shrink-0">
            {navigationPills.map((pill) => {
              const isActive = activeTab === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => {
                    if (pill.id === 'create') setEditingQuestion(null);
                    setActiveTab(pill.id);
                  }}
                  className={`tf-pill-button text-xs font-semibold px-4 py-2 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#191A1D] text-white shadow-sm'
                      : 'bg-white text-[#171819] border border-[#DDE1DA] hover:bg-[#F8F9F7]'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Main Workspace Body */}
          <main className="flex-1 mt-3">
            {activeTab === 'dashboard' && (
              <DashboardView
                questions={questions}
                onNavigate={(tab) => setActiveTab(tab)}
                onSelectQuestion={(q) => setSelectedQuestion(q)}
                currentUser={currentUser}
                health={health}
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

            {activeTab === 'paper' && (
              <PaperDesignerView
                questions={questions}
                onNavigateToExams={() => setActiveTab('exams')}
              />
            )}

            {activeTab === 'exams' && (
              <TeacherExamsView
                questions={questions}
                onNavigateToPaperDesigner={() => setActiveTab('paper')}
                onNavigateToStudentPortal={(code) => {
                  setCandidateExamCode(code);
                  setActiveTab('student-portal');
                }}
              />
            )}

            {activeTab === 'student-portal' && (
              <StudentPortalContainer
                initialExamCode={candidateExamCode}
                onExitToTeacherPortal={() => setActiveTab('exams')}
              />
            )}

            {/* Custom 404 Fallback View */}
            {!['dashboard', 'bank', 'create', 'tests', 'mutation', 'mcq', 'paper', 'exams', 'student-portal'].includes(activeTab) && (
              <div className="flex-1 flex items-center justify-center p-8 animate-fadeIn">
                <div className="bg-white border border-[#DDE1DA] rounded-[32px] p-10 max-w-lg w-full text-center space-y-4 shadow-bento">
                  <div className="w-16 h-16 rounded-2xl bg-[#191A1D] text-[#EDFF72] flex items-center justify-center mx-auto text-2xl font-black">
                    404
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold text-[#171819] tracking-tight">
                      Workspace Module Not Found
                    </h2>
                    <p className="text-sm text-[#777D78] mt-1.5 leading-relaxed">
                      The requested module, paper draft, or examination session could not be located in your active workspace ledger.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('dashboard')}
                      className="tf-pill-button tf-pill-button-dark"
                    >
                      <span>Return to Dashboard</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

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

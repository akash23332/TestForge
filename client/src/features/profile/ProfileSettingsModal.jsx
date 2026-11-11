import React, { useState, useEffect } from 'react';
import {
  User,
  Settings,
  LogOut,
  X,
  Shield,
  ShieldCheck,
  Sun,
  Code,
  Monitor,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCircle2,
  Sliders,
  GraduationCap,
  Users,
  AlertTriangle,
  Lock,
  Key
} from 'lucide-react';

export const ProfileSettingsModal = ({
  isOpen,
  onClose,
  currentUser,
  onLogout,
  health
}) => {
  // Execution preferences
  const supportedLanguages = [
    { id: 'Java', label: 'Java', runtime: 'OpenJDK 17' },
    { id: 'JavaScript', label: 'JavaScript', runtime: 'Node.js LTS' },
    { id: 'Python', label: 'Python', runtime: 'Python 3.11' },
    { id: 'C++', label: 'C++', runtime: 'GCC / Clang' },
    { id: 'C', label: 'C', runtime: 'GCC' }
  ];

  const [selectedLang, setSelectedLang] = useState('Java');
  const [initialLang, setInitialLang] = useState('Java');
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'pending' | 'saving'
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  // Security expandable drawer
  const [isSecurityExpanded, setIsSecurityExpanded] = useState(false);

  // Logout confirmation modal state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Load saved preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('testforge_pref_lang');
    if (saved) {
      // Find matching language or capitalize
      const match = supportedLanguages.find(
        (l) => l.id.toLowerCase() === saved.toLowerCase()
      );
      if (match) {
        setSelectedLang(match.id);
        setInitialLang(match.id);
      } else {
        setSelectedLang(saved);
        setInitialLang(saved);
      }
    }
    setSaveStatus('saved');
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle changing language
  const handleSelectLanguage = (langId) => {
    setSelectedLang(langId);
    setIsLangDropdownOpen(false);
    if (langId !== initialLang) {
      setSaveStatus('pending');
    } else {
      setSaveStatus('saved');
    }
  };

  // Save preferences action
  const handleSavePreferences = () => {
    setSaveStatus('saving');
    setTimeout(() => {
      localStorage.setItem('testforge_pref_lang', selectedLang);
      setInitialLang(selectedLang);
      setSaveStatus('saved');
    }, 400);
  };

  // User details extraction
  const userName = currentUser?.name || 'AKASH SHARMA';
  const userEmail = currentUser?.email || 'akash3102.be24@chitkara.edu.in';
  const userRole = currentUser?.role || 'Teacher';
  const initial = userName.trim() ? userName.trim()[0].toUpperCase() : 'A';

  const handleConfirmLogout = () => {
    setIsLoggingOut(true);
    setTimeout(() => {
      setShowLogoutConfirm(false);
      onClose();
      if (onLogout) onLogout();
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn font-sans select-none">
      <div className="bg-white rounded-[24px] border border-[#DDE1DA] shadow-2xl w-full max-w-[720px] overflow-hidden flex flex-col max-h-[85vh] relative animate-scaleUp">
        {/* ── 1. MODAL HEADER ── */}
        <div className="p-5 sm:p-6 pb-4 border-b border-[#DDE1DA] flex items-center justify-between bg-white shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-[#171819]">TestForge</span>
              <span className="text-[#CBD0C8] font-bold">/</span>
              <h2 className="text-base sm:text-lg font-extrabold text-[#171819] tracking-tight">
                Faculty Control Center
              </h2>
            </div>
            <p className="text-xs text-[#777D78] mt-0.5">
              Manage your faculty profile, execution preferences, and account settings.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Active Session Indicator Pill */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EDFF72]/70 border border-[#D5E65C] text-[#191A1D] text-[11px] font-extrabold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              <span>Active session</span>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-[#777D78] hover:text-[#171819] hover:bg-[#F2F3F0] transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── 2. MODAL BODY (SCROLLABLE) ── */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* ── FACULTY PROFILE CARD ── */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#F8F9F7] border border-[#DDE1DA] flex items-center justify-between gap-4 transition-all">
            <div className="flex items-center gap-4 min-w-0">
              {/* Avatar: Rounded black box with lime initial */}
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#191A1D] flex items-center justify-center text-[#EDFF72] text-2xl sm:text-3xl font-black shrink-0 shadow-sm">
                {initial}
              </div>

              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-[#171819] tracking-tight truncate uppercase">
                  {userName}
                </h3>
                <a
                  href={`mailto:${userEmail}`}
                  className="text-xs text-[#777D78] hover:text-[#171819] hover:underline truncate mt-0.5 font-medium block"
                  title="Send email"
                >
                  {userEmail}
                </a>

                {/* Role Badges */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EDFF72] text-[#191A1D] font-bold text-[10px] border border-[#D5E65C]">
                    <GraduationCap className="w-3 h-3" />
                    <span>{userRole}</span>
                  </span>

                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#E9ECE7] text-[#171819] font-bold text-[10px] border border-[#DDE1DA]">
                    <Users className="w-3 h-3 text-[#777D78]" />
                    <span>Faculty access</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Verification Shield Indicator */}
            <div className="shrink-0">
              <div
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 shadow-2xs"
                title="Verified Faculty Account"
              >
                <Check className="w-5 h-5 stroke-[2.5]" />
              </div>
            </div>
          </div>

          {/* ── EXECUTION PREFERENCES SECTION ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#171819]">
              <Settings className="w-3.5 h-3.5 text-[#171819]" />
              <span>Execution Preferences</span>
            </div>

            <div className="bg-white border border-[#DDE1DA] rounded-2xl divide-y divide-[#DDE1DA] shadow-xs">
              {/* Row 1: Default Programming Language */}
              <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] flex items-center justify-center text-[#171819] shrink-0 mt-0.5 sm:mt-0 font-mono text-xs font-bold">
                    &lt;/&gt;
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-[#171819]">
                      Default Programming Language
                    </h4>
                    <p className="text-[11px] text-[#777D78]">
                      Used for new coding questions and execution
                    </p>
                  </div>
                </div>

                {/* Dropdown Selector */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                    className="flex items-center justify-between gap-3 min-w-[120px] px-3.5 py-1.5 rounded-xl bg-white border border-[#DDE1DA] hover:border-[#171819] text-xs font-bold text-[#171819] transition-colors cursor-pointer"
                  >
                    <span>{selectedLang}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-[#777D78]" />
                  </button>

                  {isLangDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-[#DDE1DA] rounded-2xl shadow-xl z-50 p-1.5 space-y-1 animate-fadeIn">
                      {supportedLanguages.map((lang) => (
                        <button
                          key={lang.id}
                          type="button"
                          onClick={() => handleSelectLanguage(lang.id)}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors ${
                            selectedLang === lang.id
                              ? 'bg-[#191A1D] text-[#EDFF72] font-bold'
                              : 'text-[#171819] hover:bg-[#F2F3F0]'
                          }`}
                        >
                          <span>{lang.label}</span>
                          <span className="text-[10px] text-[#777D78] font-mono">
                            {lang.runtime}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Session Status */}
              <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] flex items-center justify-center text-[#171819] shrink-0">
                    <Monitor className="w-4 h-4 text-[#777D78]" />
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-[#171819]">
                      Session Status
                    </h4>
                    <p className="text-[11px] text-[#777D78]">
                      Authenticated JWT session verified
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Active</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── APPEARANCE SECTION ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#171819]">
              <Sun className="w-3.5 h-3.5 text-[#171819]" />
              <span>Appearance</span>
            </div>

            <div className="bg-white border border-[#DDE1DA] rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] flex items-center justify-center text-[#171819] shrink-0">
                  <Monitor className="w-4 h-4 text-[#777D78]" />
                </span>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-[#171819]">
                    Interface Theme
                  </h4>
                  <p className="text-[11px] text-[#777D78]">
                    Choose your workspace appearance
                  </p>
                </div>
              </div>

              {/* Informational Permanent Light Mode Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EDFF72] text-[#191A1D] text-xs font-bold border border-[#D5E65C] shadow-2xs">
                <Sun className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Light mode</span>
              </div>
            </div>
          </div>

          {/* ── ACCOUNT SECURITY ROW ── */}
          <div className="bg-white border border-[#DDE1DA] rounded-2xl overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => setIsSecurityExpanded(!isSecurityExpanded)}
              className="w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left hover:bg-[#F8F9F7] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] flex items-center justify-center text-[#171819] shrink-0">
                  <ShieldCheck className="w-4 h-4 text-[#171819]" />
                </span>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-[#171819]">
                    Account Security
                  </h4>
                  <p className="text-[11px] text-[#777D78]">
                    Authentication protocol and credentials summary
                  </p>
                </div>
              </div>

              <ChevronRight
                className={`w-4 h-4 text-[#777D78] transition-transform duration-200 ${
                  isSecurityExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>

            {/* Expandable Security Details */}
            {isSecurityExpanded && (
              <div className="p-4 pt-1 bg-[#F8F9F7] border-t border-[#DDE1DA] space-y-2.5 text-xs animate-fadeIn">
                <div className="flex items-center justify-between text-[#777D78]">
                  <span>Faculty Account ID:</span>
                  <span className="font-mono text-[#171819] font-bold">
                    {currentUser?._id ? `${String(currentUser._id).slice(0, 10)}...` : 'FAC-ACT-8842'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[#777D78]">
                  <span>Authentication Protocol:</span>
                  <span className="text-[#171819] font-bold">JWT Bearer Token (Secure HTTP)</span>
                </div>
                <div className="flex items-center justify-between text-[#777D78]">
                  <span>Role Authorization:</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    Faculty Author & Dispatcher
                  </span>
                </div>
                <div className="flex items-center justify-between text-[#777D78]">
                  <span>Session Telemetry:</span>
                  <span className="text-[#171819] font-medium">Anti-cheat audits & rate limits active</span>
                </div>
              </div>
            )}
          </div>

          {/* ── SAVE PREFERENCES ACTION ROW ── */}
          <div className="bg-white border border-[#DDE1DA] rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] flex items-center justify-center text-[#171819] shrink-0">
                <Sliders className="w-4 h-4 text-[#171819]" />
              </span>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-[#171819]">
                  Save Preferences
                </h4>
                <p className="text-[11px] text-[#777D78]">
                  Persist execution defaults for future questions
                </p>
              </div>
            </div>

            <div>
              {saveStatus === 'pending' ? (
                <button
                  type="button"
                  onClick={handleSavePreferences}
                  className="px-4 py-1.5 rounded-xl bg-[#191A1D] hover:bg-[#282a2f] text-[#EDFF72] text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  Save Preferences
                </button>
              ) : saveStatus === 'saving' ? (
                <span className="px-3.5 py-1 rounded-xl bg-stone-100 text-[#777D78] text-xs font-bold inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full border border-stone-500 border-t-transparent animate-spin" />
                  Saving...
                </span>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Changes saved</span>
                </div>
              )}
            </div>
          </div>

          {/* ── LOGOUT SECTION ── */}
          <div className="p-4 sm:p-4.5 rounded-2xl bg-rose-50/80 border border-rose-200/80 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-rose-100/90 text-rose-600 flex items-center justify-center shrink-0">
                <LogOut className="w-4 h-4 stroke-[2.2]" />
              </span>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-extrabold text-[#171819]">
                  Sign out
                </h4>
                <p className="text-[11px] text-[#777D78] truncate">
                  End your current faculty session
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>

          {/* Academic Support Helpline & Copyright */}
          <div className="pt-2 px-1 flex flex-wrap items-center justify-between text-[11px] text-[#777D78] gap-2 border-t border-[#DDE1DA]/60">
            <span>© {new Date().getFullYear()} TestForge Academic Systems</span>
            <div className="flex items-center gap-3">
              <a
                href="tel:+18005553674"
                className="hover:text-[#171819] transition-colors font-semibold"
                title="Call Faculty Hotline"
              >
                Helpline: +1 (800) 555-3674
              </a>
              <span>•</span>
              <a
                href="mailto:support@testforge.edu"
                className="hover:text-[#171819] transition-colors font-semibold"
                title="Email Support"
              >
                support@testforge.edu
              </a>
            </div>
          </div>
        </div>

        {/* ── LOGOUT CONFIRMATION MODAL OVERLAY ── */}
        {showLogoutConfirm && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl border border-[#DDE1DA] p-6 max-w-sm w-full shadow-2xl space-y-4 animate-scaleUp text-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6 stroke-[2]" />
              </div>

              <div>
                <h3 className="text-base font-extrabold text-[#171819]">
                  Confirm Sign Out
                </h3>
                <p className="text-xs text-[#777D78] mt-1">
                  Are you sure you want to end your faculty session? You will need to sign in again to access the question bank and examinations.
                </p>
              </div>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2 px-3 rounded-xl bg-[#F2F3F0] hover:bg-[#E9ECE7] text-xs font-bold text-[#171819] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={handleConfirmLogout}
                  className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                >
                  {isLoggingOut ? 'Signing out...' : 'Sign Out'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileSettingsModal;

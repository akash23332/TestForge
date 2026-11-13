import React, { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  KeyRound,
  Calendar,
  History,
  BarChart3,
  BookOpen,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react';

export const STUDENT_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
  { id: 'my-tests', label: 'My Tests', path: '/student/tests', icon: FileText },
  { id: 'join-test', label: 'Join Test', path: '/student/join-test', icon: KeyRound },
  { id: 'upcoming-tests', label: 'Upcoming Tests', path: '/student/upcoming', icon: Calendar },
  { id: 'test-history', label: 'Test History', path: '/student/history', icon: History },
  { id: 'analytics', label: 'Analytics', path: '/student/analytics', icon: BarChart3 },
  { id: 'learning', label: 'My Learning', path: '/student/learning', icon: BookOpen },
  { id: 'settings', label: 'Settings', path: '/student/settings', icon: Settings },
];

export const StudentSidebar = ({
  activeTab = 'dashboard',
  onNavigate,
  onSignOut,
  currentUser,
  className = 'my-3.5 ml-3.5 relative',
}) => {
  const [tooltip, setTooltip] = useState({ text: '', top: 0, visible: false });

  // Main items in vertical stack
  const mainNavItems = [
    { id: 'dashboard', label: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
    { id: 'my-tests', label: 'My Tests', path: '/student/tests', icon: FileText },
    { id: 'join-test', label: 'Join Test', path: '/student/join-test', icon: KeyRound },
    { id: 'upcoming-tests', label: 'Upcoming Tests', path: '/student/upcoming', icon: Calendar },
    { id: 'test-history', label: 'Test History', path: '/student/history', icon: History },
    { id: 'analytics', label: 'Analytics', path: '/student/analytics', icon: BarChart3 },
    { id: 'learning', label: 'My Learning', path: '/student/learning', icon: BookOpen },
  ];

  // Bottom action buttons
  const bottomActions = [
    { id: 'settings', label: 'Settings', path: '/student/settings', icon: Settings },
    { id: 'logout', label: 'Sign Out', path: '', icon: LogOut },
  ];

  const showTooltip = (e, label) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      text: label,
      top: rect.top + rect.height / 2,
      visible: true,
    });
  };

  const hideTooltip = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  const handleItemClick = (id, path) => {
    hideTooltip();
    if (id === 'logout') {
      if (onSignOut) onSignOut();
    } else {
      if (onNavigate) onNavigate(id, path);
    }
  };

  const isItemActive = (itemId) => {
    if (itemId === 'dashboard') {
      return activeTab === 'dashboard' || activeTab === 'overview';
    }
    return itemId === activeTab;
  };

  return (
    <>
      {/* ── DESKTOP VERTICAL CAPSULE SIDEBAR (78px, matching Teacher BentoSidebar) ── */}
      <aside
        className={`hidden md:flex flex-col items-center w-[78px] shrink-0 h-[calc(100vh-36px)] max-h-[850px] bg-[#191A1D] rounded-[32px] py-4 px-3 shadow-2xl z-40 select-none ${className}`}
        aria-label="Student Navigation"
      >
        {/* 1. TOP LOGO SECTION */}
        <div className="flex flex-col items-center w-full">
          <button
            type="button"
            onClick={() => handleItemClick('dashboard', '/student/dashboard')}
            onMouseEnter={(e) => showTooltip(e, 'Student Dashboard')}
            onMouseLeave={hideTooltip}
            title="TestForge Student Portal"
            className="w-11 h-11 rounded-2xl bg-[#26282E] hover:bg-[#32353D] text-[#EDFF72] flex items-center justify-center transition-all duration-200 shadow-md cursor-pointer group"
          >
            <div className="w-6 h-6 rounded-full border-1.5 border-[#EDFF72] flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 fill-current transition-transform group-hover:scale-110" />
            </div>
          </button>

          {/* Subtle Divider under Logo */}
          <div className="w-8 h-px bg-white/10 my-3" />
        </div>

        {/* 2. MAIN NAVIGATION GROUP */}
        <nav className="flex flex-col items-center gap-2 w-full" aria-label="Student menu">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(item.id);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item.id, item.path)}
                onMouseEnter={(e) => showTooltip(e, item.label)}
                onMouseLeave={hideTooltip}
                aria-label={item.label}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
                  isActive
                    ? 'bg-[#EDFF72] text-[#191A1D] shadow-md font-bold'
                    : 'text-[#777D78] hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon
                  className="w-5 h-5 transition-transform group-hover:scale-110"
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {isActive && (
                  <span className="absolute -right-1 w-1 h-3.5 rounded-full bg-[#EDFF72]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* 3. FLEXIBLE EMPTY SPACE SEPARATOR */}
        <div className="flex-1 min-h-[32px] w-full" />

        {/* 4. BOTTOM UTILITY GROUP (Divider line + Settings & Logout) */}
        <div className="flex flex-col items-center gap-2 w-full pt-2">
          <div className="w-8 h-px bg-white/10 my-1" />

          {bottomActions.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(item.id);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item.id, item.path)}
                onMouseEnter={(e) => showTooltip(e, item.label)}
                onMouseLeave={hideTooltip}
                aria-label={item.label}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
                  isActive
                    ? 'bg-[#EDFF72] text-[#191A1D] shadow-md font-bold'
                    : 'text-[#777D78] hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                {isActive && (
                  <span className="absolute -right-1 w-1 h-3.5 rounded-full bg-[#EDFF72]" />
                )}
              </button>
            );
          })}
        </div>

        {/* FLOATING HOVER TOOLTIP */}
        {tooltip.visible && (
          <div
            className="fixed left-[98px] -translate-y-1/2 bg-[#191A1D] text-white text-xs font-semibold px-3 py-1.5 rounded-xl shadow-xl border border-white/10 whitespace-nowrap z-50 pointer-events-none animate-fadeIn flex items-center gap-1.5"
            style={{ top: `${tooltip.top}px` }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#EDFF72]" />
            <span>{tooltip.text}</span>
          </div>
        )}
      </aside>

      {/* ── MOBILE SCROLLING PILL TAB BAR (Under 860px) ── */}
      <div className="md:hidden w-full overflow-x-auto no-scrollbar py-2 px-1 flex items-center gap-2 sticky top-2 z-40 bg-[#E9ECE7]/95 backdrop-blur-md rounded-2xl shadow-xs">
        {STUDENT_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item.id);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item.id, item.path)}
              className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[#191A1D] text-[#EDFF72] shadow-sm font-bold'
                  : 'bg-white text-[#171819] hover:bg-white/80 border border-[#DDE1DA]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
};

export default StudentSidebar;

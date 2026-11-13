import React, { useState } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  FilePlus,
  FlaskConical,
  TestTube,
  Files,
  FileText,
  ClipboardList,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react';

export const BentoSidebar = ({
  activeTab = 'dashboard',
  onNavigate,
  currentUser,
  onOpenProfile,
  onLogout,
  className = 'my-3.5 ml-3.5 relative'
}) => {
  const [tooltip, setTooltip] = useState({ text: '', top: 0, visible: false });

  // Core Main Navigation Modules
  const mainNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'bank', label: 'Question Bank', icon: BookOpen },
    { id: 'create', label: 'Create Question', icon: FilePlus },
    { id: 'tests', label: 'Test Studio', icon: FlaskConical },
    { id: 'mutation', label: 'Mutation Lab', icon: TestTube },
    { id: 'mcq', label: 'Bulk MCQ', icon: Files },
    { id: 'paper', label: 'Paper Designer', icon: FileText },
    { id: 'exams', label: 'Examinations', icon: ClipboardList },
  ];

  // Bottom Utility Actions: Settings & Logout
  const bottomActions = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'logout', label: 'Logout', icon: LogOut },
  ];

  const showTooltip = (e, label) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      text: label,
      top: rect.top + rect.height / 2,
      visible: true
    });
  };

  const hideTooltip = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  const handleItemClick = (id) => {
    hideTooltip();
    if (id === 'logout') {
      if (onLogout) onLogout();
    } else if (id === 'settings') {
      if (onOpenProfile) onOpenProfile();
    } else {
      if (onNavigate) onNavigate(id);
    }
  };

  return (
    <aside
      className={`hidden md:flex flex-col items-center w-[78px] shrink-0 h-[calc(100vh-36px)] max-h-[850px] bg-[#191A1D] rounded-[32px] py-4 px-3 shadow-2xl z-40 select-none ${className}`}
      aria-label="TestForge Navigation"
    >
      {/* 1. TOP LOGO SECTION */}
      <div className="flex flex-col items-center w-full">
        <button
          type="button"
          onClick={() => handleItemClick('dashboard')}
          onMouseEnter={(e) => showTooltip(e, 'TestForge Dashboard')}
          onMouseLeave={hideTooltip}
          title="TestForge"
          className="w-11 h-11 rounded-2xl bg-[#26282E] hover:bg-[#32353D] text-[#EDFF72] flex items-center justify-center transition-all duration-200 shadow-md cursor-pointer group"
        >
          <div className="w-6 h-6 rounded-full border-1.5 border-[#EDFF72] flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 fill-current transition-transform group-hover:scale-110" />
          </div>
        </button>

        {/* Subtle Divider under Logo */}
        <div className="w-8 h-px bg-white/10 my-3" />
      </div>

      {/* 2. MAIN NAVIGATION GROUP (8-12px gap, placed together) */}
      <nav className="flex flex-col items-center gap-2 w-full">
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item.id)}
              onMouseEnter={(e) => showTooltip(e, item.label)}
              onMouseLeave={hideTooltip}
              aria-label={item.label}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
                isActive
                  ? 'bg-[#EDFF72] text-[#191A1D] shadow-md font-bold'
                  : 'text-[#777D78] hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon className="w-5 h-5 transition-transform group-hover:scale-110" strokeWidth={isActive ? 2.5 : 2} />
              {isActive && (
                <span className="absolute -right-1 w-1 h-3.5 rounded-full bg-[#EDFF72]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* 3. LARGE FLEXIBLE EMPTY SPACE SEPARATOR */}
      <div className="flex-1 min-h-[32px] w-full" />

      {/* 4. BOTTOM UTILITY GROUP (Divider line + Settings & Logout) */}
      <div className="flex flex-col items-center gap-2 w-full pt-2">
        {/* Divider before Settings and Logout */}
        <div className="w-8 h-px bg-white/10 my-1" />

        {/* Settings & Logout */}
        {bottomActions.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item.id)}
              onMouseEnter={(e) => showTooltip(e, item.label)}
              onMouseLeave={hideTooltip}
              aria-label={item.label}
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-[#777D78] hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer group"
            >
              <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
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
  );
};

export default BentoSidebar;

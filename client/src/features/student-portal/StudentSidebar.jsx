import React from 'react';
import {
  LayoutDashboard,
  FileText,
  KeyRound,
  Calendar,
  History,
  BarChart3,
  BookOpen,
  Bell,
  User,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react';

export const STUDENT_NAV_ITEMS = [
  { id: 'overview', label: 'Overview', path: '/student/overview', icon: LayoutDashboard },
  { id: 'my-tests', label: 'My Tests', path: '/student/tests', icon: FileText },
  { id: 'join-test', label: 'Join Test', path: '/student/join-test', icon: KeyRound },
  { id: 'upcoming-tests', label: 'Upcoming Tests', path: '/student/upcoming', icon: Calendar },
  { id: 'test-history', label: 'Test History', path: '/student/history', icon: History },
  { id: 'analytics', label: 'Performance Analytics', path: '/student/analytics', icon: BarChart3 },
  { id: 'learning', label: 'My Learning', path: '/student/learning', icon: BookOpen },
  { id: 'notifications', label: 'Notifications', path: '/student/notifications', icon: Bell },
  { id: 'profile', label: 'My Profile', path: '/student/profile', icon: User },
  { id: 'settings', label: 'Settings', path: '/student/settings', icon: Settings },
];

export const StudentSidebar = ({
  activeTab = 'overview',
  onNavigate,
  onSignOut,
  currentUser,
  unreadNotifications = 0,
  className = '',
}) => {
  const handleItemClick = (id, path) => {
    if (id === 'logout') {
      if (onSignOut) onSignOut();
    } else {
      if (onNavigate) onNavigate(id, path);
    }
  };

  const isItemActive = (itemId) => {
    if (itemId === 'overview' && activeTab === 'dashboard') return true;
    return itemId === activeTab;
  };

  return (
    <>
      {/* ── DESKTOP STICKY SIDEBAR (216px, sticky, dark rounded) ── */}
      <aside
        className={`hidden md:flex flex-col w-[216px] shrink-0 sticky top-4 h-[calc(100vh-32px)] max-h-[920px] bg-[#191A1D] rounded-[28px] p-3.5 shadow-2xl z-30 select-none border border-white/[0.08] justify-between ${className}`}
        aria-label="Student Navigation"
      >
        <div className="flex flex-col w-full space-y-3">
          {/* Top Logo / Brand Header */}
          <div className="flex items-center gap-3 px-3 py-2 border-b border-white/10 pb-3">
            <div className="w-9 h-9 rounded-xl bg-[#26282E] text-[#EDFF72] flex items-center justify-center font-mono font-bold text-xs shadow-md border border-[#EDFF72]/30">
              TF
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-white text-xs tracking-tight truncate">TestForge</span>
              <span className="text-[10px] text-[#8F938D] font-mono tracking-wider uppercase truncate">
                Student Portal
              </span>
            </div>
          </div>

          {/* Navigation Items List */}
          <nav className="flex flex-col space-y-1 w-full" aria-label="Student navigation menu">
            {STUDENT_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = isItemActive(item.id);
              const isNotifications = item.id === 'notifications';
              const showBadge = isNotifications && unreadNotifications > 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item.id, item.path)}
                  aria-label={item.label}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-[#EDFF72] text-[#111111] font-bold shadow-md'
                      : 'text-[#9A9D97] hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        isActive ? 'text-[#111111]' : 'text-[#8F938D]'
                      }`}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {/* Lime Unread Notifications Badge */}
                  {showBadge && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        isActive ? 'bg-[#111111] text-[#EDFF72]' : 'bg-[#EDFF72] text-[#111111]'
                      }`}
                    >
                      {unreadNotifications}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom User & Sign Out Footer */}
        <div className="pt-2 border-t border-white/10 flex flex-col space-y-1">
          <button
            type="button"
            onClick={() => handleItemClick('logout', '')}
            aria-label="Sign Out"
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold text-[#8F938D] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── MOBILE SCROLLING PILL TAB BAR (Under 860px) ── */}
      <div className="md:hidden w-full overflow-x-auto no-scrollbar py-2 px-1 flex items-center gap-2 sticky top-2 z-40 bg-[#E9ECE7]/95 backdrop-blur-md rounded-2xl shadow-xs">
        {STUDENT_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item.id);
          const isNotifications = item.id === 'notifications';
          const showBadge = isNotifications && unreadNotifications > 0;

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
              {showBadge && (
                <span className="w-2 h-2 rounded-full bg-[#EDFF72] animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
};

export default StudentSidebar;

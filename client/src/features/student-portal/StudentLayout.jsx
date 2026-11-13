import React, { useState, useEffect } from 'react';
import { StudentSidebar, STUDENT_NAV_ITEMS } from './StudentSidebar';
import {
  Menu,
  X,
  Bell,
  KeyRound,
  ShieldCheck,
  User,
  Settings,
  LogOut
} from 'lucide-react';
import '../dashboard/bento-theme.css';

export const StudentLayout = ({
  activeTab = 'dashboard',
  onNavigate,
  onSignOut,
  currentUser,
  children,
  unreadCount = 0,
  onOpenQuickJoin
}) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isPastHero, setIsPastHero] = useState(false);

  // Track scroll position to hide sidebar in hero section and fix it in screen when scrolled down
  useEffect(() => {
    if (activeTab !== 'dashboard') {
      setIsPastHero(true);
      return;
    }

    const handleScroll = () => {
      // Hero section is 100svh. When scrolled down past 40% of viewport height, reveal fixed sidebar.
      const scrollPos = window.scrollY || document.documentElement.scrollTop;
      const threshold = window.innerHeight * 0.4;
      setIsPastHero(scrollPos > threshold);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeTab]);

  const activeItem =
    STUDENT_NAV_ITEMS.find((item) => item.id === activeTab) ||
    (activeTab === 'profile'
      ? { id: 'profile', label: 'Profile / Settings' }
      : STUDENT_NAV_ITEMS[0]);

  const handleMobileNavigate = (id, path) => {
    setMobileDrawerOpen(false);
    onNavigate(id, path);
  };

  // ── FOR "DASHBOARD" TAB: Full-screen 3D Main Dashboard with Scroll-Revealed Fixed Sidebar ──
  if (activeTab === 'dashboard') {
    return (
      <div className="relative min-h-screen w-full bg-[#191A1D] selection:bg-[#EDFF72] selection:text-[#191A1D] overflow-x-hidden">
        {/* Left Floating Capsule Sidebar: FIXED IN SCREEN WHEN SCROLLED PAST HERO, HIDDEN ON HERO SECTION */}
        <div
          aria-hidden={!isPastHero}
          className={`fixed left-3.5 top-1/2 -translate-y-1/2 z-50 hidden md:flex items-center transition-all duration-300 ease-out select-none ${
            isPastHero
              ? 'opacity-100 translate-x-0 pointer-events-auto'
              : 'opacity-0 -translate-x-12 pointer-events-none'
          }`}
        >
          <StudentSidebar
            activeTab={activeTab}
            onNavigate={onNavigate}
            onSignOut={onSignOut}
            currentUser={currentUser}
            className="my-0 ml-0 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)]"
          />
        </div>

        {/* Mobile Hamburger Floating Button: Appears when scrolled past hero */}
        <div
          className={`md:hidden fixed top-4 left-4 z-50 transition-all duration-300 ease-out ${
            isPastHero
              ? 'opacity-100 translate-x-0 pointer-events-auto'
              : 'opacity-0 -translate-x-12 pointer-events-none'
          }`}
        >
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="p-2.5 rounded-2xl bg-[#191A1D] text-white border border-white/15 backdrop-blur-md shadow-2xl flex items-center justify-center cursor-pointer hover:bg-[#26282E] transition-colors"
            aria-label="Open Navigation"
          >
            <Menu className="size-5 text-[#EDFF72]" />
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="relative z-10 flex w-[280px] max-w-full flex-col bg-[#191A1D] text-white p-5 shadow-2xl rounded-r-3xl">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-xl bg-[#26282E] text-[#EDFF72] font-extrabold flex items-center justify-center font-mono text-sm border border-[#EDFF72]/40">
                    TF
                  </div>
                  <div>
                    <span className="block font-bold text-sm text-white">TestForge</span>
                    <span className="block font-mono text-[10px] text-[#EDFF72] uppercase tracking-wider">
                      Student Dashboard
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-[#777D78] hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto py-4 space-y-1">
                {STUDENT_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleMobileNavigate(item.id, item.path)}
                      className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-xs font-semibold transition-colors ${
                        isActive
                          ? 'bg-[#EDFF72] text-[#191A1D] font-bold shadow-md'
                          : 'text-[#777D78] hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="size-4.5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center gap-3 pb-3">
                  <div className="size-9 rounded-xl bg-white/10 flex items-center justify-center text-[#EDFF72] font-mono text-xs font-bold">
                    {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'S'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate">
                      {currentUser?.name || 'Student'}
                    </div>
                    <div className="text-[11px] text-[#777D78] truncate">
                      {currentUser?.email || 'student@testforge.edu'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full py-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-bold transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Dashboard Body (Edge-to-edge on hero section) */}
        <div className="w-full">
          {children}
        </div>
      </div>
    );
  }

  // ── FOR OTHER TABS (OVERVIEW, TESTS, JOIN, HISTORY, ANALYTICS, LEARNING): Whitish Bento Canvas ──
  return (
    <div className="tf-outer-frame selection:bg-[#EDFF72] selection:text-[#191A1D]">
      <div className="tf-inner-canvas">
        {/* ── Left Floating Dark Rounded Sidebar (Desktop/Tablet) ── */}
        <StudentSidebar
          activeTab={activeTab}
          onNavigate={onNavigate}
          onSignOut={onSignOut}
          currentUser={currentUser}
        />

        {/* ── Mobile Navigation Drawer Backdrop & Modal ── */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="relative z-10 flex w-[280px] max-w-full flex-col bg-[#191A1D] text-white p-5 shadow-2xl rounded-r-3xl">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-xl bg-[#26282E] text-[#EDFF72] font-extrabold flex items-center justify-center font-mono text-sm border border-[#EDFF72]/40">
                    TF
                  </div>
                  <div>
                    <span className="block font-bold text-sm text-white">TestForge</span>
                    <span className="block font-mono text-[10px] text-[#EDFF72] uppercase tracking-wider">
                      Student Dashboard
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-[#777D78] hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto py-4 space-y-1">
                {STUDENT_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleMobileNavigate(item.id, item.path)}
                      className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-xs font-semibold transition-colors ${
                        isActive
                          ? 'bg-[#EDFF72] text-[#191A1D] font-bold shadow-md'
                          : 'text-[#777D78] hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="size-4.5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center gap-3 pb-3">
                  <div className="size-9 rounded-xl bg-white/10 flex items-center justify-center text-[#EDFF72] font-mono text-xs font-bold">
                    {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'S'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate">
                      {currentUser?.name || 'Student'}
                    </div>
                    <div className="text-[11px] text-[#777D78] truncate">
                      {currentUser?.email || 'student@testforge.edu'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full py-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-bold transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Main Content Area on Whitish Canvas ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto max-h-[calc(100vh-28px)] p-4 sm:p-6 lg:p-7 bg-[#F2F3F0] text-[#171819]">
          {/* Top Header Bar matching Teacher's BentoTopHeader */}
          <header className="w-full flex items-center justify-between gap-4 pb-4 mb-2 select-none border-b border-[#DDE1DA]">
            {/* Left: Brand & Breadcrumb */}
            <div className="flex items-center gap-2.5">
              {/* Mobile hamburger menu */}
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden p-1.5 rounded-xl bg-white border border-[#DDE1DA] text-[#171819] hover:bg-[#E9ECE7] transition-colors"
                aria-label="Open Navigation"
              >
                <Menu className="size-4" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('dashboard', '/student/dashboard')}
                className="flex items-center gap-1.5 text-sm font-extrabold text-[#171819] hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span>TestForge</span>
                <span className="w-2 h-2 rounded-xs bg-[#EDFF72] -skew-x-12 inline-block" />
              </button>

              <span className="text-[#CBD0C8] font-bold">/</span>

              <span className="text-xs font-semibold text-[#777D78] px-2.5 py-1 rounded-full bg-white border border-[#DDE1DA]">
                {activeItem?.label || 'Overview'}
              </span>
            </div>

            {/* Right: Quick Join, Notification Bell, Candidate Profile */}
            <div className="flex items-center gap-2.5">
              {onOpenQuickJoin && (
                <button
                  type="button"
                  onClick={onOpenQuickJoin}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#EDFF72] hover:bg-[#e2f560] px-4 py-1.5 text-xs font-bold text-[#191A1D] shadow-xs transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <KeyRound className="size-3.5" />
                  <span>Quick Join</span>
                </button>
              )}

              {/* Notification Bell */}
              <button
                type="button"
                onClick={() => onNavigate('overview', '/student/overview')}
                className="relative flex size-8 items-center justify-center rounded-full bg-white border border-[#DDE1DA] text-[#171819] hover:bg-[#F8F9F7] transition-colors cursor-pointer"
                title="Notifications"
              >
                <Bell className="size-3.5 text-[#171819]" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[#EDFF72] ring-1 ring-[#191A1D]" />
                )}
              </button>

              {/* Candidate Profile Pill */}
              <button
                type="button"
                onClick={() => onNavigate('profile', '/student/profile')}
                className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#DDE1DA] hover:bg-[#F8F9F7] transition-colors cursor-pointer"
              >
                <div className="size-6 rounded-full bg-[#191A1D] text-[#EDFF72] flex items-center justify-center font-mono text-[10px] font-bold">
                  {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'S'}
                </div>
                <div className="text-left text-xs leading-none">
                  <span className="block font-semibold text-[#171819]">
                    {currentUser?.name ? currentUser.name.split(' ')[0] : 'Candidate'}
                  </span>
                </div>
              </button>
            </div>
          </header>

          {/* Child Views */}
          <div className="flex-1 w-full min-w-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentLayout;

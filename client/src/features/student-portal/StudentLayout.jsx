import React, { useState, useEffect } from 'react';
import { StudentSidebar, STUDENT_NAV_ITEMS } from './StudentSidebar';
import {
  Menu,
  X,
  Bell,
  Plus,
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
  pageTitle,
  pageSubtitle
}) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isPastHero, setIsPastHero] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  // Track scroll position to hide sidebar in hero section and fix it in screen when scrolled down
  useEffect(() => {
    if (activeTab !== 'dashboard') {
      setIsPastHero(true);
      return;
    }

    const handleScroll = () => {
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
      ? { id: 'profile', label: 'My Profile' }
      : STUDENT_NAV_ITEMS[0]);

  const handleMobileNavigate = (id, path) => {
    setMobileDrawerOpen(false);
    onNavigate(id, path);
  };

  const firstName = currentUser?.name ? currentUser.name.split(' ')[0] : 'Student';

  // Default title & subtitle mapping if not explicitly overridden by child page
  const getDefaultHeader = () => {
    switch (activeTab) {
      case 'overview':
        return {
          title: 'Student Overview',
          subtitle: `Welcome back, ${firstName}. Here is your academic progress.`
        };
      case 'join-test':
        return {
          title: 'Join Test',
          subtitle: 'Enter your examination access code to preview and start.'
        };
      case 'my-tests':
        return {
          title: 'My Tests',
          subtitle: 'View your upcoming, active and completed assessments.'
        };
      case 'test-history':
        return {
          title: 'Test History',
          subtitle: 'Review all your past examination attempts and verified scores.'
        };
      case 'analytics':
        return {
          title: 'Performance Analytics',
          subtitle: 'Detailed analysis of your accuracy, topic mastery and growth over time.'
        };
      case 'learning':
        return {
          title: 'My Learning',
          subtitle: 'Targeted topic practice derived from your evaluated results.'
        };
      case 'profile':
        return {
          title: 'My Profile',
          subtitle: 'Candidate credentials and personal examination identity.'
        };
      case 'settings':
        return {
          title: 'Account Settings',
          subtitle: 'Notification preferences and password security management.'
        };
      default:
        return {
          title: activeItem?.label || 'Student Portal',
          subtitle: `Welcome back, ${firstName}.`
        };
    }
  };

  const headerInfo = {
    title: pageTitle || getDefaultHeader().title,
    subtitle: pageSubtitle || getDefaultHeader().subtitle
  };

  // ── FOR "DASHBOARD" TAB: Full-screen 3D Main Dashboard with Scroll-Revealed Fixed Sidebar ──
  if (activeTab === 'dashboard') {
    return (
      <div className="relative min-h-screen w-full bg-[#191A1D] selection:bg-[#EDFF72] selection:text-[#191A1D] overflow-x-hidden">
        {/* Left Floating Capsule Sidebar: FIXED IN SCREEN WHEN SCROLLED PAST HERO, HIDDEN ON HERO SECTION */}
        <div
          aria-hidden={!isPastHero}
          className={`fixed left-3.5 top-3.5 z-50 hidden md:flex items-center transition-all duration-300 ease-out select-none ${
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
                  className="p-1.5 rounded-lg text-[#777D78] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
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
                      className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
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

  // ── FOR ALL OTHER TABS: Broad Editorial Whitish Canvas with Standard Header Card ──
  return (
    <div className="tf-outer-frame selection:bg-[#EDFF72] selection:text-[#191A1D] bg-[#E9ECE7] min-h-screen">
      <div className="tf-inner-canvas flex min-h-screen">
        {/* ── Left Floating Dark Capsule Sidebar (Desktop / Tablet) ── */}
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
                  className="p-1.5 rounded-lg text-[#777D78] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
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
                      className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
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

        {/* ── Main Content Area on Broad Whitish Canvas (Fills width next to sidebar) ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto max-h-screen p-4 sm:p-6 lg:p-7 bg-[#F2F3F0] text-[#171819]">
          {/* ── Standard Page Header Card ── */}
          <header className="w-full rounded-[24px] border border-[#DDE1DA] bg-white p-5 sm:p-6 lg:px-[26px] lg:py-[20px] shadow-xs mb-6 select-none flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Left: Title & Subtitle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden p-2 rounded-xl bg-[#F2F3F0] border border-[#DDE1DA] text-[#171819] hover:bg-[#E9ECE7] transition-colors cursor-pointer"
                aria-label="Open Navigation"
              >
                <Menu className="size-5" />
              </button>
              <div>
                <h1 className="text-[clamp(22px,2.4vw,30px)] font-[600] tracking-[-0.045em] text-[#171819] leading-tight">
                  {headerInfo.title}
                </h1>
                <p className="text-xs sm:text-sm text-[#777D78] mt-0.5">
                  {headerInfo.subtitle}
                </p>
              </div>
            </div>

            {/* Right: Bell Button + Dark "+ Join Test" Pill + Avatar Button */}
            <div className="flex items-center gap-3 self-end sm:self-center">
              {/* Notification Bell */}
              <button
                type="button"
                onClick={() => setShowNotificationsModal((v) => !v)}
                className="size-10 rounded-full bg-white border border-[#DDE1DA] hover:bg-[#F2F3F0] text-[#171819] flex items-center justify-center relative transition-colors cursor-pointer"
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell className="size-4.5 text-[#777D78]" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 size-2 rounded-full bg-[#EDFF72] ring-2 ring-white" />
                )}
              </button>

              {/* Dark "+ Join Test" Pill */}
              <button
                type="button"
                onClick={() => onNavigate('join-test', '/student/join-test')}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#191A1D] hover:bg-black text-[#EDFF72] px-4 py-2 text-xs font-bold shadow-xs transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Plus className="size-3.5 stroke-[2.5]" />
                <span>Join Test</span>
              </button>

              {/* Avatar Button -> Opens Profile */}
              <button
                type="button"
                onClick={() => onNavigate('profile', '/student/profile')}
                className="size-10 rounded-full bg-[#191A1D] text-[#EDFF72] font-mono text-xs font-bold border border-white/10 hover:ring-2 hover:ring-[#EDFF72] cursor-pointer flex items-center justify-center transition-all shadow-xs"
                title="My Profile"
                aria-label="My Profile"
              >
                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'S'}
              </button>
            </div>
          </header>

          {/* ── Main Page Body (Broad container, no max-w caps) ── */}
          <main className="flex-1 w-full min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default StudentLayout;

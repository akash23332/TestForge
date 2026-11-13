import React, { useEffect, useState, useRef } from 'react';
import { motion, useScroll, useSpring, AnimatePresence } from 'framer-motion';
import { BentoSidebar } from '../../features/dashboard/BentoSidebar';
import { ProductShowcase } from './ProductShowcase';
import { Marquee } from './Marquee';
import { FeatureBento } from './FeatureBento';
import { HowItWorks } from './HowItWorks';
import { Stats } from './Stats';
import { FinalCta } from './FinalCta';
import { SiteFooter } from './SiteFooter';
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
  Settings,
  LogOut,
} from 'lucide-react';

export interface LandingBelowHeroProps {
  onGetStarted?: () => void;
  onBookDemo?: () => void;
  onNavigate?: (tab: string) => void;
  currentUser?: any;
  onOpenProfile?: () => void;
  onLogout?: () => void;
  className?: string;
}

export const LandingBelowHero: React.FC<LandingBelowHeroProps> = ({
  onGetStarted,
  onBookDemo,
  onNavigate,
  currentUser,
  onOpenProfile,
  onLogout,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // 1. Scroll Progress Bar (3px lime bar fixed at top)
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  // 3. Fixed Side Panel visibility: hidden on hero section, permanently fixed when scrolled down
  const [showFixedSidebar, setShowFixedSidebar] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const heroHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
      // Disappear when in hero section (scrollY < 38% of hero height); appear & stay fixed when scrolled down
      const isPastHero = window.scrollY >= heroHeight * 0.38;
      setShowFixedSidebar(isPastHero);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const navLinks = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'bank', label: 'Question Bank', icon: BookOpen },
    { id: 'create', label: 'Create Question', icon: FilePlus },
    { id: 'tests', label: 'Test Studio', icon: FlaskConical },
    { id: 'mutation', label: 'Mutation Lab', icon: TestTube },
    { id: 'mcq', label: 'Bulk MCQ', icon: Files },
    { id: 'paper', label: 'Paper Designer', icon: FileText },
    { id: 'exams', label: 'Examinations', icon: ClipboardList },
  ];

  return (
    <>
      {/* ── 3px Fixed Top Scroll Progress Bar (Lime #e8ff5a) ── */}
      <motion.div
        style={{ scaleX }}
        className="fixed top-0 left-0 right-0 h-[3px] bg-[#e8ff5a] origin-left z-50 pointer-events-none shadow-[0_0_8px_#e8ff5a]"
        aria-hidden="true"
      />

      {/* ── FIXED SIDE PANEL (Disappears in Hero, stays FIXED on screen as you scroll down) ── */}
      <AnimatePresence>
        {showFixedSidebar && (
          <motion.div
            initial={{ opacity: 0, x: -80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -80, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
            className="hidden md:block fixed left-3.5 top-3.5 z-40 select-none"
          >
            <BentoSidebar
              activeTab="dashboard"
              onNavigate={(tab) => onNavigate && onNavigate(tab)}
              currentUser={currentUser}
              onOpenProfile={onOpenProfile}
              onLogout={onLogout}
              className="my-0 ml-0 shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SIBLING SECTION SLIDING UP OVER STICKY HERO ── */}
      <main
        id="landing-content"
        ref={containerRef}
        className={`relative z-20 mt-0 rounded-t-[36px] bg-[#f1f1ee] text-[#121212] shadow-[0_-30px_80px_rgba(0,0,0,0.5)] border-t border-[#d8d8d2]/80 overflow-x-clip w-full ${className}`}
      >
        <div className="w-full pl-4 md:pl-[106px] lg:pl-[116px] pr-4 sm:pr-8 lg:pr-12 xl:pr-16 py-4 sm:py-6">
          {/* Section 1: Product Showcase (with Dashboard Mock) */}
          <ProductShowcase />

          {/* Section 2: Marquee */}
          <Marquee />

          {/* Section 3: Feature Bento Grid */}
          <FeatureBento />

          {/* Section 4: How It Works (3 Numbered Steps) */}
          <HowItWorks />

          {/* Section 5: Stats Counters */}
          <Stats />

          {/* Section 6: Final CTA Banner */}
          <FinalCta onGetStarted={onGetStarted} onBookDemo={onBookDemo} />

          {/* Section 7: Site Footer */}
          <SiteFooter />
        </div>

        {/* ── MOBILE FLOATING MENU TRIGGER (Small Screens) ── */}
        <div className="md:hidden fixed bottom-6 left-6 z-50">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
            className="w-12 h-12 rounded-2xl bg-[#121212] text-[#e8ff5a] shadow-2xl flex items-center justify-center border border-white/20 active:scale-95 transition-transform"
            aria-label="Toggle Side Panel"
          >
            {mobileDrawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* ── MOBILE SIDE PANEL DRAWER ── */}
        {mobileDrawerOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex">
            <div className="w-72 bg-[#191A1D] h-full p-5 flex flex-col justify-between text-white shadow-2xl">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#26282E] text-[#EDFF72] flex items-center justify-center font-bold">
                      <Sparkles className="w-4 h-4 fill-current" />
                    </div>
                    <span className="font-extrabold text-sm tracking-tight">TestForge</span>
                  </div>
                  <button
                    onClick={() => setMobileDrawerOpen(false)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="space-y-1">
                  {navLinks.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.id === 'dashboard';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (onNavigate) onNavigate(item.id);
                          setMobileDrawerOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                          isActive
                            ? 'bg-[#EDFF72] text-[#191A1D]'
                            : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="pt-4 border-t border-white/10 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenProfile) onOpenProfile();
                    setMobileDrawerOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white"
                >
                  <Settings className="w-4 h-4" />
                  <span>Profile & Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onLogout) onLogout();
                    setMobileDrawerOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileDrawerOpen(false)} />
          </div>
        )}
      </main>
    </>
  );
};

export default LandingBelowHero;

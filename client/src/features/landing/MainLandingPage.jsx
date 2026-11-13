import React, { useState, useEffect } from 'react';
import { Navbar } from './Navbar';
import { HeroSection } from './HeroSection';
import { LandingBelowHero } from './LandingBelowHero';
import { KeyRound, X, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

export const MainLandingPage = ({
  onJoinTestWithCode,
  onNavigateStudentPortal,
  onNavigateTeacherLogin,
  onNavigateStudentLogin
}) => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [quickJoinOpen, setQuickJoinOpen] = useState(false);
  const [quickCode, setQuickCode] = useState('');
  const [quickError, setQuickError] = useState('');

  // Top Scroll Progress Bar
  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (totalScroll > 0) {
        setScrollProgress((window.scrollY / totalScroll) * 100);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleOpenJoin = () => {
    setQuickCode('');
    setQuickError('');
    setQuickJoinOpen(true);
  };

  const handleQuickJoinSubmit = (e) => {
    e.preventDefault();
    if (!quickCode.trim()) {
      setQuickError('Please enter a valid examination code (e.g. TF-DSA01)');
      return;
    }
    const clean = quickCode.trim().toUpperCase();
    setQuickJoinOpen(false);
    onJoinTestWithCode(clean);
  };

  const handleExplorePlatform = () => {
    const el = document.getElementById('about');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative min-h-screen bg-[#0B0C0E] font-sans text-[#171819] selection:bg-[#EDFF72] selection:text-[#111]">
      {/* Top Scroll Progress Line */}
      <div
        aria-hidden="true"
        style={{
          width: `${scrollProgress}%`,
          transition: 'width 0.1s linear'
        }}
        className="fixed top-0 left-0 h-[3px] bg-[#EDFF72] z-[100] shadow-[0_0_12px_rgba(237,255,114,0.8)]"
      />

      {/* Navigation Bar (Absolute, not fixed on scroll) */}
      <Navbar
        onJoinTest={handleOpenJoin}
        onNavigateStudentPortal={onNavigateStudentPortal}
        onNavigateTeacherLogin={onNavigateTeacherLogin}
      />

      {/* Hero Section */}
      <HeroSection
        onJoinTest={handleOpenJoin}
        onExplorePlatform={handleExplorePlatform}
        onNavigateTeacherLogin={onNavigateTeacherLogin}
        onNavigateStudentPortal={onNavigateStudentPortal}
      />

      {/* Sections Below Hero */}
      <LandingBelowHero
        onJoinTest={handleOpenJoin}
        onNavigateTeacherLogin={onNavigateTeacherLogin}
        onNavigateStudentPortal={onNavigateStudentPortal}
      />

      {/* Quick Join Test Modal Dialog */}
      {quickJoinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-[28px] border border-white/15 bg-[#191A1D] p-6 sm:p-8 text-white shadow-2xl">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setQuickJoinOpen(false)}
              className="absolute top-5 right-5 size-8 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>

            {/* Modal Content */}
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-xl bg-[#EDFF72] text-[#111] flex items-center justify-center font-bold">
                <KeyRound className="size-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Join Assessment</h3>
                <p className="text-xs text-[#A4A7A1]">Direct candidate session entry</p>
              </div>
            </div>

            <form onSubmit={handleQuickJoinSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-mono font-medium text-[#CFD1CC] mb-2 uppercase tracking-wider">
                  Assessment Access Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={quickCode}
                    onChange={(e) => {
                      setQuickCode(e.target.value.toUpperCase());
                      setQuickError('');
                    }}
                    placeholder="e.g. TF-DSA01"
                    maxLength={14}
                    autoFocus
                    className="w-full rounded-xl bg-white/[0.08] border border-white/20 px-4 py-3.5 font-mono text-lg font-bold tracking-widest text-[#EDFF72] placeholder:text-white/30 focus:border-[#EDFF72] focus:outline-none focus:ring-1 focus:ring-[#EDFF72] transition-all"
                  />
                </div>
                {quickError && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400 font-medium">
                    <AlertCircle className="size-3.5 shrink-0" />
                    <span>{quickError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1 text-[11px] text-[#A4A7A1]">
                <ShieldCheck className="size-3.5 text-[#EDFF72]" />
                <span>Zero-Leak Proctored Environment</span>
              </div>

              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setQuickJoinOpen(false)}
                  className="w-1/3 py-3 rounded-xl border border-white/15 bg-white/5 text-xs font-semibold text-[#CFD1CC] hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-[#EDFF72] text-xs font-extrabold text-[#111] shadow-[0_4px_18px_rgba(237,255,114,0.35)] hover:shadow-[0_6px_22px_rgba(237,255,114,0.45)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Verify &amp; Continue</span>
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

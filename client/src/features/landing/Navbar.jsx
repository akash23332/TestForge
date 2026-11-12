import React, { useState, useEffect } from 'react';
import { Sparkles, KeyRound, Menu, X, ArrowRight, GraduationCap, Shield } from 'lucide-react';

export const Navbar = ({
  onJoinTest,
  onNavigateStudentPortal,
  onNavigateTeacherLogin
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav
      id="nv"
      className={`fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 sm:px-8 lg:px-12 py-3.5 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#0B0C0E]/80 backdrop-blur-md border-b border-white/10 shadow-lg'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      {/* Brand Logo */}
      <a
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        className="flex items-center gap-2.5 font-bold text-white tracking-tight text-base select-none group"
      >
        <span className="flex size-8 items-center justify-center rounded-xl bg-[#EDFF72] text-[#111] font-extrabold text-xs shadow-[0_2px_10px_rgba(237,255,114,0.35)] transition-transform group-hover:scale-105">
          TF
        </span>
        <span className="text-lg">TestForge</span>
      </a>

      {/* Center Nav Links (Desktop) */}
      <div className="hidden lg:flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md">
        <button
          type="button"
          onClick={() => scrollToSection('about')}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#CFD1CC] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          About
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('features')}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#CFD1CC] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          Features
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('educators')}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#CFD1CC] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          Educators
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('students')}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#CFD1CC] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          Students
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('how')}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#CFD1CC] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          How It Works
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('faq')}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#CFD1CC] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          FAQ
        </button>
      </div>

      {/* Right Action CTAs */}
      <div className="hidden sm:flex items-center gap-2.5">
        <button
          type="button"
          onClick={onJoinTest}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-white/20 bg-white/[0.06] text-xs font-semibold text-white hover:bg-white/15 hover:border-white/30 transition-all cursor-pointer"
        >
          <KeyRound className="size-3.5 text-[#EDFF72]" />
          <span>Join a Test</span>
        </button>

        <button
          type="button"
          onClick={onNavigateStudentPortal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-transparent text-xs font-semibold text-[#CFD1CC] hover:text-white hover:bg-white/10 transition-all cursor-pointer"
        >
          <GraduationCap className="size-3.5" />
          <span>Student Portal</span>
        </button>

        <button
          type="button"
          onClick={onNavigateTeacherLogin}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#EDFF72] text-xs font-bold text-[#111] shadow-[0_4px_18px_rgba(237,255,114,0.35)] hover:shadow-[0_6px_22px_rgba(237,255,114,0.45)] hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <Shield className="size-3.5" />
          <span>Teacher Login</span>
        </button>
      </div>

      {/* Mobile Menu Button */}
      <div className="flex sm:hidden items-center gap-2">
        <button
          type="button"
          onClick={onJoinTest}
          className="px-2.5 py-1.5 rounded-full border border-[#EDFF72]/40 bg-[#EDFF72]/15 text-[11px] font-bold text-[#EDFF72]"
        >
          Join
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-xl bg-white/10 text-white border border-white/15"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile Dropdown Drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden absolute top-full inset-x-3 mt-2 rounded-2xl bg-[#141518] border border-white/15 p-4 shadow-2xl backdrop-blur-xl flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex flex-col gap-1 pb-3 border-b border-white/10 text-sm">
            <button
              type="button"
              onClick={() => scrollToSection('about')}
              className="px-3 py-2 text-left text-[#CFD1CC] hover:text-white rounded-lg hover:bg-white/5"
            >
              About
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('features')}
              className="px-3 py-2 text-left text-[#CFD1CC] hover:text-white rounded-lg hover:bg-white/5"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('educators')}
              className="px-3 py-2 text-left text-[#CFD1CC] hover:text-white rounded-lg hover:bg-white/5"
            >
              For Educators
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('students')}
              className="px-3 py-2 text-left text-[#CFD1CC] hover:text-white rounded-lg hover:bg-white/5"
            >
              For Students
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('faq')}
              className="px-3 py-2 text-left text-[#CFD1CC] hover:text-white rounded-lg hover:bg-white/5"
            >
              FAQ
            </button>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onJoinTest();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/20 bg-white/10 text-xs font-bold text-white"
            >
              <KeyRound className="size-4 text-[#EDFF72]" />
              <span>Join a Test</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateStudentPortal();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/15 bg-white/5 text-xs font-bold text-[#CFD1CC]"
            >
              <GraduationCap className="size-4 text-[#EDFF72]" />
              <span>Student Portal</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateTeacherLogin();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#EDFF72] text-xs font-extrabold text-[#111]"
            >
              <Shield className="size-4" />
              <span>Teacher Login</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

import React from 'react';
import { Shield, GraduationCap, KeyRound } from 'lucide-react';

export const Footer = ({
  onJoinTest,
  onNavigateStudentPortal,
  onNavigateTeacherLogin
}) => {
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="pt-12 pb-8 border-t border-[#DDE1DA] text-xs text-[#777D78]">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="size-7 rounded-lg bg-[#191A1D] text-[#EDFF72] flex items-center justify-center font-bold text-xs shadow-xs">
            TF
          </div>
          <span className="font-bold text-[#171819] text-sm">TestForge</span>
          <span className="text-[#A4A7A1]">|</span>
          <span className="font-mono text-[11px] text-[#777D78]">Create · Conduct · Evaluate</span>
        </div>

        {/* Section Links */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-[#171819]">
          <button
            type="button"
            onClick={() => scrollTo('about')}
            className="hover:text-black cursor-pointer"
          >
            About
          </button>
          <button
            type="button"
            onClick={() => scrollTo('features')}
            className="hover:text-black cursor-pointer"
          >
            Features
          </button>
          <button
            type="button"
            onClick={() => scrollTo('educators')}
            className="hover:text-black cursor-pointer"
          >
            Educators
          </button>
          <button
            type="button"
            onClick={() => scrollTo('students')}
            className="hover:text-black cursor-pointer"
          >
            Students
          </button>
          <button
            type="button"
            onClick={() => scrollTo('faq')}
            className="hover:text-black cursor-pointer"
          >
            FAQ
          </button>
        </div>

        {/* Direct Destination Links */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onJoinTest}
            className="text-[11px] font-bold text-[#171819] hover:underline cursor-pointer flex items-center gap-1"
          >
            <KeyRound className="size-3 text-emerald-600" />
            <span>Join a Test</span>
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={onNavigateStudentPortal}
            className="text-[11px] font-bold text-[#171819] hover:underline cursor-pointer flex items-center gap-1"
          >
            <GraduationCap className="size-3 text-emerald-600" />
            <span>Student Portal</span>
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={onNavigateTeacherLogin}
            className="text-[11px] font-bold text-[#171819] hover:underline cursor-pointer flex items-center gap-1"
          >
            <Shield className="size-3 text-emerald-600" />
            <span>Teacher Login</span>
          </button>
        </div>
      </div>

      <div className="mt-8 text-center text-[11px] text-[#A4A7A1]">
        © 2026 TestForge Assessment Platform. All rights reserved. Zero-Leak Psychometric Architecture.
      </div>
    </footer>
  );
};

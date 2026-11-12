import React from 'react';
import { KeyRound, Shield, GraduationCap, ArrowRight } from 'lucide-react';

export const FinalCTASection = ({
  onJoinTest,
  onNavigateTeacherLogin,
  onNavigateStudentPortal
}) => {
  return (
    <section id="cta" className="py-14 sm:py-20">
      <div className="relative rounded-[36px] sm:rounded-[44px] bg-[#0B0C0E] px-6 py-16 sm:py-24 text-center text-white overflow-hidden isolation-isolate shadow-2xl">
        {/* Glowing Lime Radial Ambient Center */}
        <div
          aria-hidden="true"
          style={{
            animation: 'ctaGlow 9s ease-in-out infinite alternate'
          }}
          className="pointer-events-none absolute inset-[-30%] rounded-full bg-[#EDFF72]/20 blur-[120px] z-[-1]"
        />

        <div className="max-w-2xl mx-auto space-y-4">
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.06]">
            Transform the Way You Assess.
          </h2>

          <p className="text-base sm:text-lg text-[#A4A7A1] max-w-xl mx-auto">
            Build smarter tests. Evaluate better. Make every assessment count with institutional precision.
          </p>

          <div className="pt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onJoinTest}
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full bg-[#EDFF72] text-sm sm:text-base font-bold text-[#111] shadow-[0_10px_34px_-8px_rgba(237,255,114,0.5)] hover:shadow-[0_18px_40px_-8px_rgba(237,255,114,0.65)] hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <KeyRound className="size-4" />
              <span>Join a Test</span>
            </button>

            <button
              type="button"
              onClick={onNavigateTeacherLogin}
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full border border-white/20 bg-white/10 text-sm sm:text-base font-semibold text-white hover:bg-white/20 hover:border-white/30 hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <Shield className="size-4 text-[#EDFF72]" />
              <span>Enter Teacher Workspace</span>
              <ArrowRight className="size-4" />
            </button>
          </div>

          <div className="pt-4">
            <button
              type="button"
              onClick={onNavigateStudentPortal}
              className="inline-flex items-center gap-1.5 text-xs text-[#A4A7A1] hover:text-[#EDFF72] transition-colors cursor-pointer underline underline-offset-4"
            >
              <GraduationCap className="size-3.5" />
              <span>Looking for registered student account? Open Student Portal →</span>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ctaGlow {
          0% { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(1.15); opacity: 1; }
        }
      `}</style>
    </section>
  );
};

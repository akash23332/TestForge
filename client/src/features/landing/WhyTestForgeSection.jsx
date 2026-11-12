import React from 'react';
import { Check } from 'lucide-react';

export const WhyTestForgeSection = () => {
  const points = [
    'All-in-one assessment management across multiple cohorts.',
    'AI-assisted question creation calibrated to Bloom’s taxonomy.',
    'Full coding assessment support with automated sandboxing.',
    'Instant automated evaluation against hidden edge cases.',
    'Centralized question bank with tagging, diffs, and reuse.',
    'Actionable student performance insights and mastery tracking.'
  ];

  return (
    <section className="py-12 sm:py-16">
      <div className="relative rounded-[36px] sm:rounded-[44px] bg-[#191A1D] p-8 sm:p-14 lg:p-18 text-white overflow-hidden isolation-isolate shadow-2xl">
        {/* Animated Radial Lime Glow in Background */}
        <div
          aria-hidden="true"
          style={{
            animation: 'radialDrift 14s ease-in-out infinite alternate'
          }}
          className="pointer-events-none absolute -right-28 -top-36 size-[480px] rounded-full bg-[#EDFF72]/20 blur-[100px] z-[-1]"
        />

        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold tracking-widest text-[#9A9E98] uppercase">
            <span className="w-5 h-[2px] bg-[#EDFF72]" />
            <span>Why Choose TestForge?</span>
          </div>

          <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-[1.08]">
            Built to make every assessment{' '}
            <span className="text-[#EDFF72]">count.</span>
          </h2>

          <p className="mt-3 text-base text-[#A4A7A1]">
            Engineering rigor meets academic integrity. Eliminate manual grading bottlenecks and provide real-time testing feedback.
          </p>
        </div>

        {/* 6 Advantages Grid */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {points.map((text, idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-white/[0.05] border border-white/10 hover:border-[#EDFF72]/40 hover:bg-[#EDFF72]/[0.08] transition-all flex items-start gap-3.5"
            >
              <div className="size-7 rounded-xl bg-[#EDFF72] text-[#111] flex items-center justify-center font-bold shrink-0 mt-0.5">
                <Check className="size-4 stroke-[3]" />
              </div>
              <p className="text-sm text-[#E2E4DE] leading-relaxed font-medium">
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes radialDrift {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(-40px, 60px) scale(1.15); }
        }
      `}</style>
    </section>
  );
};

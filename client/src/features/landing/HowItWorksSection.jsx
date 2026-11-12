import React from 'react';
import { PenTool, Share2, Laptop, Award } from 'lucide-react';

export const HowItWorksSection = () => {
  const steps = [
    {
      num: '01',
      title: 'Create',
      desc: 'Educators prepare assessments using AI generation, question banks, and custom coding test suites.',
      icon: PenTool
    },
    {
      num: '02',
      title: 'Share',
      desc: 'Students receive 6-character secure test codes or direct portal invitations to enter the session.',
      icon: Share2
    },
    {
      num: '03',
      title: 'Attempt',
      desc: 'Students complete assessments in a distraction-free, proctored environment with live code execution.',
      icon: Laptop
    },
    {
      num: '04',
      title: 'Evaluate',
      desc: 'TestForge evaluates code outputs against test cases automatically, records grades, and compiles metrics.',
      icon: Award
    }
  ];

  return (
    <section id="how" className="py-20 sm:py-28">
      <div className="max-w-2xl mb-14">
        <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold tracking-widest text-[#777D78] uppercase">
          <span className="w-5 h-[2px] bg-[#171819]" />
          <span>How It Works</span>
        </div>
        <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#171819] leading-[1.08]">
          From Test Creation to Results in{' '}
          <span className="relative inline-block px-1.5 py-0.5 rounded-lg bg-[#EDFF72] text-[#111]">
            Four Steps.
          </span>
        </h2>
        <p className="mt-3 text-base sm:text-lg text-[#666B66]">
          A clean, end-to-end examination pipeline designed for zero friction and maximum reliability.
        </p>
      </div>

      <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div
              key={idx}
              className="relative rounded-[26px] border border-[#DDE1DA] bg-white p-6 shadow-xs flex flex-col justify-between min-h-[220px]"
            >
              <div className="flex items-center justify-between">
                <span className="size-11 rounded-2xl bg-[#191A1D] text-[#EDFF72] font-mono text-sm font-bold flex items-center justify-center shadow-xs">
                  {step.num}
                </span>
                <div className="size-8 rounded-xl bg-[#F2F3F0] flex items-center justify-center text-[#777D78]">
                  <Icon className="size-4" />
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-xl font-bold tracking-tight text-[#171819]">
                  {step.title}
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-[#666B66] leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

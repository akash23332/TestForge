import React from 'react';
import { Layers, FileText, Code2, LineChart, Sparkles } from 'lucide-react';

export const AboutSection = () => {
  return (
    <section id="about" className="py-20 sm:py-28">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">
        {/* Left Column: Narrative */}
        <div className="lg:col-span-6 space-y-5">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold tracking-widest text-[#777D78] uppercase">
            <span className="w-5 h-[2px] bg-[#171819]" />
            <span>About TestForge</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#171819] leading-[1.08]">
            One Platform. Every{' '}
            <span className="relative inline-block px-1.5 py-0.5 rounded-lg bg-[#EDFF72] text-[#111] shadow-xs">
              Assessment
            </span>{' '}
            Need.
          </h2>

          <p className="text-base sm:text-lg text-[#666B66] leading-relaxed">
            TestForge is an intelligent assessment platform designed to simplify the complete examination lifecycle. From creating question papers and coding assessments to evaluating submissions and tracking student performance, TestForge brings everything together in one place.
          </p>

          <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="p-4 rounded-2xl bg-white border border-[#DDE1DA] shadow-xs">
              <div className="size-8 rounded-xl bg-[#EDFF72]/30 flex items-center justify-center text-[#171819] font-bold mb-2">
                <FileText className="size-4" />
              </div>
              <h4 className="text-sm font-bold text-[#171819]">Exam Lifecycle</h4>
              <p className="text-xs text-[#777D78] mt-1">
                Draft, configure, schedule, and grade assessments in unified workflows.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#DDE1DA] shadow-xs">
              <div className="size-8 rounded-xl bg-[#EDFF72]/30 flex items-center justify-center text-[#171819] font-bold mb-2">
                <Code2 className="size-4" />
              </div>
              <h4 className="text-sm font-bold text-[#171819]">Dual Modality</h4>
              <p className="text-xs text-[#777D78] mt-1">
                Seamless support for both algorithmic coding sandboxes and objective MCQs.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: 3-Layer 3D Stack */}
        <div className="lg:col-span-6 h-[340px] relative [perspective:1200px] flex items-center justify-center">
          <div className="relative w-full max-w-md h-[240px] [transform-style:preserve-3d]">
            {/* Card A: Question Paper (Base Layer) */}
            <div
              style={{
                transform: 'rotateX(55deg) rotateZ(-28deg) translateZ(0px)',
                animation: 'stackFloatA 6s ease-in-out infinite 0s'
              }}
              className="absolute inset-x-4 top-[5%] h-[130px] rounded-2xl border border-[#DDE1DA] bg-white p-5 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.25)] flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#171819]">Question Paper</span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#E9ECE7] text-[#171819]">
                  01 / DESIGN
                </span>
              </div>
              <div className="text-xs text-[#777D78]">
                Structured, reusable question bank ready to assemble and share.
              </div>
            </div>

            {/* Card B: Coding Assessment (Mid Layer - Lime Accent) */}
            <div
              style={{
                transform: 'rotateX(55deg) rotateZ(-28deg) translateZ(50px)',
                animation: 'stackFloatB 6s ease-in-out infinite -2s'
              }}
              className="absolute inset-x-4 top-[28%] h-[130px] rounded-2xl bg-[#EDFF72] p-5 shadow-[0_30px_50px_-20px_rgba(0,0,0,0.35)] flex flex-col justify-between text-[#111]"
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-[#111]">Coding Assessment</span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-[#111] font-bold">
                  02 / EVALUATE
                </span>
              </div>
              <div className="text-xs font-semibold text-[#111]/80">
                Hidden test cases, custom time limits, and automated code grading.
              </div>
            </div>

            {/* Card C: Student Performance (Top Layer - Dark) */}
            <div
              style={{
                transform: 'rotateX(55deg) rotateZ(-28deg) translateZ(100px)',
                animation: 'stackFloatC 6s ease-in-out infinite -4s'
              }}
              className="absolute inset-x-4 top-[52%] h-[130px] rounded-2xl border border-white/10 bg-[#191A1D] p-5 shadow-[0_40px_60px_-25px_rgba(0,0,0,0.5)] flex flex-col justify-between text-white"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">Student Performance</span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-[#EDFF72]">
                  03 / INSIGHTS
                </span>
              </div>
              <div className="text-xs text-[#A4A7A1]">
                Real-time scores, pass rates, and cohort growth in one unified report.
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes stackFloatA {
          0%, 100% { transform: rotateX(55deg) rotateZ(-28deg) translateZ(0px); }
          50% { transform: rotateX(55deg) rotateZ(-28deg) translateZ(18px); }
        }
        @keyframes stackFloatB {
          0%, 100% { transform: rotateX(55deg) rotateZ(-28deg) translateZ(50px); }
          50% { transform: rotateX(55deg) rotateZ(-28deg) translateZ(72px); }
        }
        @keyframes stackFloatC {
          0%, 100% { transform: rotateX(55deg) rotateZ(-28deg) translateZ(100px); }
          50% { transform: rotateX(55deg) rotateZ(-28deg) translateZ(126px); }
        }
      `}</style>
    </section>
  );
};

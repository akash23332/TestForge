import React, { useState, useRef } from 'react';
import { Check, ArrowRight, Shield, Calendar, Users, FileSpreadsheet } from 'lucide-react';

export const EducatorsSection = ({ onNavigateTeacherLogin }) => {
  const panelRef = useRef(null);
  const [panelTilt, setPanelTilt] = useState({});

  const handlePointerMove = (e) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setPanelTilt({
      transform: `perspective(1000px) rotateX(${(0.5 - y) * 9}deg) rotateY(${(x - 0.5) * 9}deg) translateY(-4px)`,
      transition: 'transform 0.1s ease-out'
    });
  };

  const handlePointerLeave = () => {
    setPanelTilt({
      transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)',
      transition: 'transform 0.3s ease-out'
    });
  };

  const benefits = [
    'Create and schedule assessments.',
    'Generate questions using AI.',
    'Add custom coding test cases.',
    'Evaluate submissions automatically.',
    'Monitor student performance.',
    'Review assessment results.'
  ];

  return (
    <section id="educators" className="py-20 sm:py-28">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        {/* Left Column: Information & CTA */}
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold tracking-widest text-[#777D78] uppercase">
            <span className="w-5 h-[2px] bg-[#171819]" />
            <span>For Educators</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#171819] leading-[1.08]">
            Everything You Need to Create Better{' '}
            <span className="relative inline-block px-1.5 py-0.5 rounded-lg bg-[#EDFF72] text-[#111]">
              Assessments.
            </span>
          </h2>

          <p className="text-base sm:text-lg text-[#666B66] leading-relaxed">
            From building question banks to evaluating coding submissions, TestForge gives educators tools to manage assessments efficiently.
          </p>

          {/* Benefits Bullet List */}
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            {benefits.map((text, idx) => (
              <li key={idx} className="flex items-center gap-2.5 text-sm text-[#171819] font-medium">
                <span className="size-5 rounded-full bg-[#EDFF72] text-[#111] flex items-center justify-center shrink-0 shadow-xs">
                  <Check className="size-3 stroke-[3]" />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <div className="pt-4">
            <button
              type="button"
              onClick={onNavigateTeacherLogin}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#191A1D] text-sm font-bold text-white shadow-lg hover:bg-[#111] hover:border-[#EDFF72]/50 hover:-translate-y-0.5 transition-all cursor-pointer group"
            >
              <span>Enter Teacher Workspace</span>
              <ArrowRight className="size-4 text-[#EDFF72] transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        {/* Right Column: 3D Teacher Workspace Preview Panel */}
        <div className="lg:col-span-6 [perspective:1200px]">
          <div
            ref={panelRef}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            style={panelTilt}
            className="rounded-[30px] border border-[#DDE1DA] bg-white p-6 sm:p-8 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#DDE1DA]">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-[#191A1D] text-[#EDFF72] flex items-center justify-center font-bold text-xs">
                  <Shield className="size-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#171819]">Assessments</h4>
                  <p className="text-[11px] font-mono text-[#777D78] uppercase">Teacher workspace</p>
                </div>
              </div>
              <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full bg-[#EDFF72]/20 text-[#171819]">
                Live Session
              </span>
            </div>

            {/* Assessment Rows */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E9ECE7]">
                <div>
                  <h5 className="text-sm font-bold text-[#171819]">Data Structures Midterm</h5>
                  <p className="text-xs text-[#777D78] mt-0.5">Scheduled · MCQ + Coding</p>
                </div>
                <span className="font-mono text-[11px] font-bold px-3 py-1 rounded-full bg-[#EDFF72] text-[#111]">
                  Published
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E9ECE7]">
                <div>
                  <h5 className="text-sm font-bold text-[#171819]">Python Fundamentals Quiz</h5>
                  <p className="text-xs text-[#777D78] mt-0.5">Draft · 15 questions</p>
                </div>
                <span className="font-mono text-[11px] font-medium px-3 py-1 rounded-full bg-[#E9ECE7] text-[#777D78]">
                  Draft
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E9ECE7]">
                <div>
                  <h5 className="text-sm font-bold text-[#171819]">Arrays Coding Challenge</h5>
                  <p className="text-xs text-[#777D78] mt-0.5">Custom test cases added</p>
                </div>
                <span className="font-mono text-[11px] font-bold px-3 py-1 rounded-full bg-[#EDFF72] text-[#111]">
                  Evaluating
                </span>
              </div>
            </div>

            {/* Bottom Meta */}
            <div className="mt-5 pt-4 border-t border-[#DDE1DA] flex items-center justify-between text-xs text-[#777D78]">
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5 text-[#171819]" />
                <span>142 Candidates Enrolled</span>
              </span>
              <span className="font-mono text-[11px] text-[#171819] font-semibold">
                Auto-Grading: Active
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

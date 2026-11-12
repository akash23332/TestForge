import React, { useState, useRef } from 'react';
import { KeyRound, GraduationCap, Check, ArrowRight, Terminal } from 'lucide-react';

export const StudentsSection = ({ onJoinTest, onNavigateStudentPortal }) => {
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

  const studentBenefits = [
    'Join tests using unique test codes.',
    'Attempt MCQs and coding challenges.',
    'Write and execute code in the online editor.',
    'View test results and score breakdown.',
    'Track previous attempts and performance.'
  ];

  return (
    <section id="students" className="py-20 sm:py-28">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        {/* Left Column (Order 2 on lg screens to flip orientation) */}
        <div className="lg:col-span-6 lg:order-2 space-y-6">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold tracking-widest text-[#777D78] uppercase">
            <span className="w-5 h-[2px] bg-[#171819]" />
            <span>For Students</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#171819] leading-[1.08]">
            Your Skills. Your Progress. Your{' '}
            <span className="relative inline-block px-1.5 py-0.5 rounded-lg bg-[#EDFF72] text-[#111]">
              Journey.
            </span>
          </h2>

          <p className="text-base sm:text-lg text-[#666B66] leading-relaxed">
            Take assessments, solve programming challenges and understand your performance through a unified student experience.
          </p>

          {/* Benefits */}
          <ul className="space-y-2.5 pt-1">
            {studentBenefits.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2.5 text-sm text-[#171819] font-medium">
                <span className="size-5 rounded-full bg-[#EDFF72] text-[#111] flex items-center justify-center shrink-0 shadow-xs">
                  <Check className="size-3 stroke-[3]" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* TWO MANDATORY SEPARATE CTA CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
            {/* Card A: Quick Test Access */}
            <div className="p-5 rounded-2xl bg-white border border-[#DDE1DA] shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="size-9 rounded-xl bg-[#EDFF72] text-[#111] flex items-center justify-center font-bold mb-3 shadow-xs">
                  <KeyRound className="size-4" />
                </div>
                <h4 className="font-bold text-sm text-[#171819]">Have a Test Code?</h4>
                <p className="text-xs text-[#777D78] mt-1.5 leading-relaxed">
                  Enter your test code and start your assessment. No account required when guest attempts are enabled.
                </p>
              </div>
              <button
                type="button"
                onClick={onJoinTest}
                className="mt-4 w-full py-2.5 px-4 rounded-xl bg-[#EDFF72] text-xs font-bold text-[#111] shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Join a Test</span>
                <ArrowRight className="size-3.5" />
              </button>
            </div>

            {/* Card B: Student Account */}
            <div className="p-5 rounded-2xl bg-white border border-[#DDE1DA] shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="size-9 rounded-xl bg-[#191A1D] text-[#EDFF72] flex items-center justify-center font-bold mb-3 shadow-xs">
                  <GraduationCap className="size-4" />
                </div>
                <h4 className="font-bold text-sm text-[#171819]">Want to Track Your Progress?</h4>
                <p className="text-xs text-[#777D78] mt-1.5 leading-relaxed">
                  Sign in or create an account to access your personal dashboard, test history and performance.
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateStudentPortal}
                className="mt-4 w-full py-2.5 px-4 rounded-xl bg-[#191A1D] text-xs font-bold text-white hover:bg-black transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Student Portal</span>
                <ArrowRight className="size-3.5 text-[#EDFF72]" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: 3D Dark Student Portal Preview Panel */}
        <div className="lg:col-span-6 lg:order-1 [perspective:1200px]">
          <div
            ref={panelRef}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            style={panelTilt}
            className="rounded-[30px] border border-white/10 bg-[#191A1D] p-6 sm:p-8 text-white shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-white/10 text-[#EDFF72] flex items-center justify-center font-bold text-xs">
                  <Terminal className="size-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Join a test</h4>
                  <p className="text-[11px] font-mono text-[#9A9E98] uppercase">Student portal</p>
                </div>
              </div>
              <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-[#EDFF72]">
                Interactive Sandbox
              </span>
            </div>

            {/* Test Code Mockup Display */}
            <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3 font-mono text-xl sm:text-2xl font-bold tracking-widest text-[#EDFF72]">
              <span>TF-4821</span>
              <span className="inline-block w-2.5 h-6 bg-[#EDFF72] animate-pulse" />
            </div>

            {/* Code Snippet Box */}
            <pre className="mt-4 rounded-2xl bg-[#0F1012] border border-white/10 p-4 font-mono text-xs text-[#D8FFB0] leading-relaxed overflow-x-auto">
              <code>
                <span className="text-[#EDFF72] font-semibold">function</span> isBalanced(s) &#123;<br />
                &nbsp;&nbsp;<span className="text-white/60">let</span> stack = [];<br />
                &nbsp;&nbsp;<span className="text-[#EDFF72] font-semibold">return</span> stack.length === 0;<br />
                &#125;
              </code>
            </pre>

            {/* Test Case Feedback Output */}
            <div className="mt-4 rounded-xl bg-emerald-950/40 border border-emerald-500/20 p-3 font-mono text-xs text-emerald-300 space-y-1">
              <div className="flex items-center gap-1.5">
                <Check className="size-3.5 text-[#EDFF72]" />
                <span>Sample test 1 passed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="size-3.5 text-[#EDFF72]" />
                <span>Sample test 2 passed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AsmrBackground } from '@/components/ui/asmr-background';
import {
  ArrowRight,
  Shield,
  KeyRound
} from 'lucide-react';

export const StudentLandingView = ({
  onEnterPortal,
  onJoinWithCode,
  onSignIn,
  onNavigateHome
}) => {
  const containerRef = useRef(null);
  const heroRef = useRef(null);

  // Mouse move 3D scene parallax
  const [sceneRotation, setSceneRotation] = useState({ x: 8, y: -20 });

  const handleMouseMove = (e) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    // Spec: rotateY = (x/width - .5) * -30 - 6 deg, rotateX = (y/height - .5) * -18 + 8 deg
    const rotY = (x / width - 0.5) * -30 - 6;
    const rotX = (y / height - 0.5) * -18 + 8;
    setSceneRotation({ x: rotX, y: rotY });
  };

  const handleMouseLeave = () => {
    setSceneRotation({ x: 8, y: -20 });
  };

  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
  }, []);

  return (
    <div ref={containerRef} className="relative h-[100svh] w-full overflow-hidden bg-[#191A1D] font-sans text-[#171819] selection:bg-[#EDFF72] selection:text-[#191A1D]">
      {/* ----------------------------------------------------------------------
        HERO SECTION (100svh, full-screen, dark #191A1D)
        Interactive ASMR particle canvas behind the 3D scene.
        ---------------------------------------------------------------------- */}
      <motion.section
        ref={heroRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative z-0 flex h-[100svh] w-full flex-col justify-between overflow-hidden bg-[#191A1D] px-[6vw] py-8 text-[#F2F3F0] select-none isolate"
      >
        {/* ASMR Shard Particle Background Canvas */}
        <AsmrBackground />

        {/* Soft lime radial glow behind 3D scene (subtle 0.07 opacity) */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-[5vw] top-[18%] h-[500px] w-[500px] rounded-full bg-[#EDFF72] opacity-[0.07] blur-[150px]"
        />

        {/* Top Navigation */}
        <header className="relative z-20 flex items-center justify-between">
          <div
            onClick={onNavigateHome}
            className="flex items-center gap-3 cursor-pointer select-none group"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#EDFF72] font-black text-[#191A1D] shadow-[0_4px_16px_rgba(237,255,114,0.35)] group-hover:scale-105 transition-transform">
              TF
            </div>
            <span className="text-xl font-bold tracking-tight text-white">TestForge</span>
          </div>

          <nav className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1.5 backdrop-blur-xl">
            {onNavigateHome && (
              <button
                onClick={onNavigateHome}
                className="rounded-full px-4 py-2 text-xs font-medium text-white/70 transition-colors hover:text-white"
              >
                ← Main Site
              </button>
            )}
            <button
              onClick={onEnterPortal}
              className="rounded-full px-4 py-2 text-xs font-medium text-white/70 transition-colors hover:text-white"
            >
              Student portal
            </button>
            <button
              onClick={onSignIn}
              className="rounded-full bg-[#EDFF72] px-5 py-2 text-xs font-semibold text-[#191A1D] shadow-sm transition-transform hover:scale-105 active:scale-95"
            >
              Sign in
            </button>
          </nav>
        </header>

        {/* Hero Two-Column Grid */}
        <div className="relative z-10 grid flex-1 grid-cols-1 items-center gap-12 lg:grid-cols-2">
          {/* Left Column: Headlines & Staggered CTAs */}
          <div className="max-w-[560px] space-y-6">
            {/* Pill Badge with pulsing dot */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="inline-flex items-center gap-2 rounded-full border border-[#EDFF72]/30 bg-[#EDFF72]/10 px-3.5 py-1 text-xs font-semibold text-[#EDFF72]"
            >
              <span className="size-2 rounded-full bg-[#EDFF72] animate-ping" />
              <span>Student portal</span>
            </motion.div>

            {/* H1 Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.23 }}
              className="text-[clamp(2.6rem,5vw,5.2rem)] font-semibold leading-[1.04] tracking-[-0.055em] text-white"
            >
              Take tests.<br />
              Track growth.<br />
              <span className="text-[#EDFF72]">Own your results.</span>
            </motion.h1>

            {/* Subtext */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.36 }}
              className="text-base text-white/70 sm:text-lg"
            >
              Join timed assessments, write and execute code with instant AI grading, and track comprehensive analytics in one unified workspace.
            </motion.p>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.49 }}
              className="flex flex-wrap items-center gap-4 pt-2"
            >
              <button
                onClick={onEnterPortal}
                className="inline-flex items-center gap-2.5 rounded-full bg-[#EDFF72] px-7 py-3.5 text-sm font-semibold text-[#191A1D] shadow-[0_4px_24px_rgba(237,255,114,0.3)] transition-all hover:scale-[1.03] active:scale-[0.98]"
              >
                <span>Enter student portal</span>
                <ArrowRight className="size-4" />
              </button>

              <button
                onClick={onJoinWithCode}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-medium text-white backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/30"
              >
                <span>Join a test →</span>
              </button>
            </motion.div>
          </div>

          {/* Right Column: Pure CSS 3D Scene with mouse parallax */}
          <div className="relative flex h-[460px] w-full items-center justify-center [perspective:1500px]">
            <div
              style={{
                transform: `rotateX(${sceneRotation.x}deg) rotateY(${sceneRotation.y}deg)`,
                transition: 'transform 0.2s cubic-bezier(0.2, 0.7, 0.2, 1)'
              }}
              className="relative h-[340px] w-[420px] [transform-style:preserve-3d]"
            >
              {/* Layer a: White card at Z 20 */}
              <div
                style={{
                  transform: 'translateZ(20px)',
                  animation: 'bobbing 6s ease-in-out infinite'
                }}
                className="absolute left-0 top-6 w-[290px] rounded-2xl border border-[#DDE1DA] bg-white p-5 text-[#171819] shadow-2xl"
              >
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#777D78]">
                  <span>Available now</span>
                  <span className="rounded-md bg-[#EDFF72] px-2 py-0.5 font-mono text-[10px] text-[#191A1D]">
                    LIVE
                  </span>
                </div>
                <h4 className="mt-2 text-base font-semibold tracking-tight text-[#171819]">
                  Data Structures Midterm
                </h4>
                <div className="mt-3 flex items-center gap-3 text-xs text-[#777D78]">
                  <span>Dr. Mitchell</span>
                  <span>•</span>
                  <span>90 mins</span>
                  <span>•</span>
                  <span>100 marks</span>
                </div>
              </div>

              {/* Layer b: Dark card at Z 90 */}
              <div
                style={{
                  transform: 'translateZ(90px)',
                  animation: 'bobbing 6s ease-in-out infinite 1.5s'
                }}
                className="absolute -right-2 top-2 w-[220px] rounded-2xl border border-white/10 bg-[#191A1D] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
              >
                <span className="text-xs font-medium text-white/60">Average score</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-4xl font-bold tracking-tight text-[#EDFF72]">
                    86%
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#EDFF72]">
                  <span>↑</span>
                  <span>+12% this month</span>
                </div>
              </div>

              {/* Layer c: Monospace code snippet at Z 150 */}
              <div
                style={{
                  transform: 'translateZ(150px)',
                  animation: 'bobbing 6s ease-in-out infinite 3s'
                }}
                className="absolute bottom-4 left-6 w-[310px] rounded-2xl border border-white/15 bg-[#121316]/95 p-4 font-mono text-xs text-white/90 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[10px] text-white/40">
                  <span>solution.js</span>
                  <span className="text-[#EDFF72]">All test cases passed (8/8)</span>
                </div>
                <pre className="mt-2 text-[11px] leading-relaxed text-white/80">
                  <code>
                    <span className="text-[#EDFF72]">function</span> maxSubArray(nums) &#123;<br />
                    &nbsp;&nbsp;<span className="text-white/50">let</span> cur = 0, ans = -Infinity;<br />
                    &nbsp;&nbsp;<span className="text-white/50">for</span> (<span className="text-white/50">let</span> x <span className="text-white/50">of</span> nums) &#123;<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;cur = Math.max(x, cur + x);<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;ans = Math.max(ans, cur);<br />
                    &nbsp;&nbsp;&#125;<br />
                    &nbsp;&nbsp;<span className="text-[#EDFF72]">return</span> ans;<br />
                    &#125;
                  </code>
                </pre>
              </div>

              {/* Layer d: Rotating 6-face CSS Cube (84px, floating at Z 120, rotating on 16s loop) */}
              <div
                style={{
                  transform: 'translateZ(120px)',
                  animation: 'bobbing 6s ease-in-out infinite 0.75s'
                }}
                className="absolute -right-4 bottom-14 size-[84px] [perspective:600px]"
              >
                <div
                  style={{
                    animation: 'cubeRotate 16s linear infinite',
                    transformStyle: 'preserve-3d'
                  }}
                  className="relative size-full"
                >
                  {/* Face 1: Front (T) */}
                  <div
                    style={{ transform: 'translateZ(42px)' }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl border border-[#191A1D]/20 bg-[#EDFF72] font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                  >
                    T
                  </div>
                  {/* Face 2: Back (F) */}
                  <div
                    style={{ transform: 'rotateY(180deg) translateZ(42px)' }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/20 bg-white font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                  >
                    F
                  </div>
                  {/* Face 3: Right (✓) */}
                  <div
                    style={{ transform: 'rotateY(90deg) translateZ(42px)' }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl border border-[#191A1D]/20 bg-[#EDFF72] font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                  >
                    ✓
                  </div>
                  {/* Face 4: Left (A+) */}
                  <div
                    style={{ transform: 'rotateY(-90deg) translateZ(42px)' }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/20 bg-white font-mono text-xl font-bold text-[#191A1D] shadow-md"
                  >
                    A+
                  </div>
                  {/* Face 5: Top (✦) */}
                  <div
                    style={{ transform: 'rotateX(90deg) translateZ(42px)' }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl border border-[#191A1D]/20 bg-[#EDFF72] font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                  >
                    ✦
                  </div>
                  {/* Face 6: Bottom (#) */}
                  <div
                    style={{ transform: 'rotateX(-90deg) translateZ(42px)' }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/20 bg-white font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                  >
                    #
                  </div>
                </div>
              </div>

              {/* Layer e: Soft lime elliptical shadow beneath scene */}
              <div
                aria-hidden
                style={{
                  transform: 'translateZ(-40px) rotateX(90deg)',
                  filter: 'blur(20px)'
                }}
                className="absolute -bottom-8 left-1/2 h-16 w-3/4 -translate-x-1/2 rounded-full bg-[#EDFF72]/20"
              />
            </div>
          </div>
        </div>
      </motion.section>

      {/* Global CSS keyframes for 3D bobbing and cube spin */}
      <style>{`
        @keyframes bobbing {
          0%, 100% {
            transform: translateY(0px) translateZ(var(--tz, 0px));
          }
          50% {
            transform: translateY(-16px) translateZ(var(--tz, 0px));
          }
        }
        @keyframes cubeRotate {
          0% {
            transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg);
          }
          100% {
            transform: rotateX(360deg) rotateY(720deg) rotateZ(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default StudentLandingView;

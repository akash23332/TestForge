import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AsmrBackground } from '@/components/ui/asmr-background';
import {
  ArrowRight,
  Shield,
  KeyRound,
  Check,
  ChevronRight
} from 'lucide-react';
import './student-landing.css';

const ROTATING_WORDS = ['results.', 'progress.', 'skills.', 'journey.'];

export const StudentLandingView = ({
  onEnterPortal,
  onJoinWithCode,
  onSignIn,
  onNavigateHome,
  currentUser = null,
  onSignOut = null,
  onNavigateTab = null
}) => {
  const containerRef = useRef(null);
  const heroRef = useRef(null);

  // Rotating headline word with accessibility pause control & reduced-motion support
  const [wordIndex, setWordIndex] = useState(0);
  const [isRotatingPaused, setIsRotatingPaused] = useState(false);

  useEffect(() => {
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReduced || isRotatingPaused) return;

    const timer = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [isRotatingPaused]);

  // Mouse move 3D scene parallax
  const [sceneRotation, setSceneRotation] = useState({ x: 8, y: -20 });

  const handleMouseMove = (e) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    const rotY = (x / width - 0.5) * -30 - 6;
    const rotX = (y / height - 0.5) * -18 + 8;
    setSceneRotation({ x: rotX, y: rotY });
  };

  const handleMouseLeave = () => {
    setSceneRotation({ x: 8, y: -20 });
  };

  // Reveal on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('on');
          }
        });
      },
      { threshold: 0.15 }
    );

    const elements = document.querySelectorAll('.tf-student-landing .rv');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="tf-student-landing relative min-h-screen w-full bg-[#191A1D] font-sans text-[#171819] selection:bg-[#EDFF72] selection:text-[#191A1D]"
    >
      {/* ══════════════════════════════════════════════════════════════════════
          STAGE A: HERO SECTION (100svh, full-screen, dark #191A1D)
          Preserved animated canvas + 3D cards & rotating cube
          ══════════════════════════════════════════════════════════════════════ */}
      <section
        ref={heroRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative z-0 flex h-[100svh] w-full flex-col justify-between overflow-hidden bg-[#191A1D] px-[6vw] py-8 text-[#F2F3F0] select-none isolate"
      >
        {/* Particle Background Canvas */}
        <AsmrBackground />

        {/* Soft lime radial glow behind 3D scene */}
        <div
          aria-hidden="true"
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
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById('features');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="rounded-full px-4 py-2 text-xs font-medium text-white/70 transition-colors hover:text-white cursor-pointer hidden md:inline-block"
            >
              Features
            </a>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('join-test', '/student/join-test')}
                className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer hidden sm:inline-block"
              >
                Join Test
              </button>
            )}
            {currentUser ? (
              <button
                type="button"
                onClick={onEnterPortal}
                className="rounded-full bg-[#EDFF72] px-4 py-1.5 text-xs font-extrabold text-[#191A1D] shadow-sm transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                Overview
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="rounded-full bg-[#EDFF72] px-5 py-2 text-xs font-semibold text-[#191A1D] shadow-sm transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                Sign in
              </button>
            )}
          </nav>
        </header>

        {/* Hero Two-Column Grid */}
        <div className="relative z-10 grid flex-1 grid-cols-1 items-center gap-12 lg:grid-cols-2">
          {/* Left Column: Headlines & Staggered CTAs */}
          <div className="max-w-[560px] space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#EDFF72]/30 bg-[#EDFF72]/10 px-3.5 py-1.5 text-xs font-medium text-[#EDFF72]">
              <span className="size-1.5 rounded-full bg-[#EDFF72] animate-pulse" />
              <span>Student portal</span>
            </div>

            <h1 className="text-[clamp(2.6rem,5vw,5.2rem)] font-semibold leading-[1.02] tracking-[-0.055em] text-white">
              Take tests.<br />
              Track growth.<br />
              Own{' '}
              <span
                role="button"
                tabIndex={0}
                aria-label="Pause rotating headline"
                onClick={() => setIsRotatingPaused((prev) => !prev)}
                onMouseEnter={() => setIsRotatingPaused(true)}
                onMouseLeave={() => setIsRotatingPaused(false)}
                title={isRotatingPaused ? "Click to resume rotation" : "Click or hover to pause rotation"}
                className="text-[#EDFF72] inline-block transition-all duration-300 cursor-pointer"
              >
                {ROTATING_WORDS[wordIndex]}
              </span>
            </h1>

            <p className="text-base text-white/70 sm:text-lg leading-relaxed">
              Join timed assessments with a test code, solve MCQs and coding challenges, and see exactly how your performance is progressing.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={onEnterPortal}
                className="inline-flex items-center gap-2.5 rounded-full bg-[#EDFF72] px-7 py-3.5 text-sm font-semibold text-[#191A1D] shadow-[0_4px_24px_rgba(237,255,114,0.3)] transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer"
              >
                <span>Enter student portal</span>
                <ArrowRight className="size-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('features');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-medium text-white backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/30 cursor-pointer"
              >
                <span>Explore features ↓</span>
              </button>
            </div>
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
                  <div
                    style={{ transform: 'translateZ(42px)' }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl border border-[#191A1D]/20 bg-[#EDFF72] font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                  >
                    T
                  </div>
                  <div
                    style={{ transform: 'rotateY(180deg) translateZ(42px)' }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/20 bg-white font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                  >
                    F
                  </div>
                  <div
                    style={{ transform: 'rotateY(90deg) translateZ(42px)' }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl border border-[#191A1D]/20 bg-[#EDFF72] font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                  >
                    ✓
                  </div>
                  <div
                    style={{ transform: 'rotateY(-90deg) translateZ(42px)' }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/20 bg-white font-mono text-xl font-bold text-[#191A1D] shadow-md"
                  >
                    A+
                  </div>
                  <div
                    style={{ transform: 'rotateX(90deg) translateZ(42px)' }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl border border-[#191A1D]/20 bg-[#EDFF72] font-mono text-2xl font-bold text-[#191A1D] shadow-md"
                  >
                    ✦
                  </div>
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
                aria-hidden="true"
                style={{
                  transform: 'translateZ(-40px) rotateX(90deg)',
                  filter: 'blur(20px)'
                }}
                className="absolute -bottom-8 left-1/2 h-16 w-3/4 -translate-x-1/2 rounded-full bg-[#EDFF72]/20"
              />
            </div>
          </div>
        </div>

        {/* Scroll Cue */}
        <div className="relative z-10 flex items-center justify-center pb-2 text-xs text-white/50">
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById('features');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1.5 transition-colors hover:text-white cursor-pointer"
          >
            <span>Scroll to explore</span>
            <span>↓</span>
          </a>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          STAGE D: PUBLIC STUDENT CONTENT (Below Hero, NO dashboard mockup!)
          The dashboard mockup is now moved into the authenticated dashboard.
          ══════════════════════════════════════════════════════════════════════ */}
      <main className="site-shell" id="show">
        <div className="w-shell">
          <div className="eb rv">The student workspace</div>
          <h2 className="stl-h2 rv">
            Your tests, results and progress in <u>one place</u>.
          </h2>
          <p className="stl-lead rv">
            Join tests, track your attempts and see where to improve, all from a single student dashboard.
          </p>
        </div>

        {/* Marquee Ticker (True Full Screen Width Edge-to-Edge) */}
        <div className="stl-mq rv" aria-hidden="true">
          <div className="stl-mq-inner">
            <span>✦</span>Join Test<span>✦</span>My Tests<span>✦</span>Upcoming Tests<span>✦</span>Test History<span>✦</span>Performance Analytics<span>✦</span>My Learning<span>✦</span>Join Test<span>✦</span>My Tests<span>✦</span>Upcoming Tests<span>✦</span>Test History<span>✦</span>Performance Analytics<span>✦</span>My Learning
          </div>
        </div>

        <div className="w-shell">
          {/* Features Section */}
          <section id="features" style={{ paddingTop: '100px' }}>
            <div className="eb rv">Features</div>
            <h2 className="stl-h2 rv">
              Built for how students <u>really</u> learn.
            </h2>
            <p className="stl-lead rv">
              Every part of the portal is one click away and works from your own results.
            </p>

            <div className="stl-grid">
              {/* Card 1: Join Test (Span 8) */}
              <article className="stl-card w8 rv">
                <div>
                  <span className="stl-tag">Join Test</span>
                  <h3>Start with just a test code</h3>
                  <p>Enter the code from your teacher, preview the test details and start when it opens.</p>
                </div>
                <div className="stl-qs">
                  <span>TF-4821</span>
                  <span>90 mins</span>
                  <span>100 marks</span>
                  <span>25 questions</span>
                  <span>Instructions</span>
                </div>
              </article>

              {/* Card 2: Exam Workspace (Lime) */}
              <article className="stl-card lime-card rv">
                <div>
                  <span className="stl-tag">Exam Workspace</span>
                  <h3>Focus on the questions</h3>
                  <p>Timer, question palette and autosave while you work.</p>
                </div>
                <div style={{ fontSize: '54px', fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 1 }}>
                  42<small style={{ fontSize: '14px', letterSpacing: 0, fontWeight: 500 }}> min left</small>
                </div>
              </article>

              {/* Card 3: Code Runner (Dark) */}
              <article className="stl-card dark-card rv">
                <div>
                  <span className="stl-tag">Code Runner</span>
                  <h3>Write, run, submit</h3>
                  <p>Java, C++, Python and JavaScript with sample test cases.</p>
                </div>
                <div className="stl-code">
                  count_even([1,2,3,4])<br />
                  <span className="ok">→ 2 · Accepted</span>
                </div>
              </article>

              {/* Card 4: Test History */}
              <article className="stl-card rv">
                <div>
                  <span className="stl-tag">Test History</span>
                  <h3>Every attempt, saved</h3>
                  <p>Review previous attempts and released results.</p>
                </div>
                <div className="stl-pp">
                  <s></s>
                  <s></s>
                  <s></s>
                  <s></s>
                </div>
              </article>

              {/* Card 5: My Learning */}
              <article className="stl-card rv">
                <div>
                  <span className="stl-tag">My Learning</span>
                  <h3>See your weak spots</h3>
                  <p>Strong and weak topics from your released results.</p>
                </div>
                <div className="flex items-end gap-2 h-[70px] mt-4">
                  <div className="flex-1 bg-[#EDFF72] rounded-t-md h-[88%]" />
                  <div className="flex-1 bg-[#EDFF72] rounded-t-md h-[92%]" />
                  <div className="flex-1 bg-[#EDFF72] rounded-t-md h-[58%]" />
                  <div className="flex-1 bg-[#EDFF72] rounded-t-md h-[61%]" />
                  <div className="flex-1 bg-[#EDFF72] rounded-t-md h-[80%]" />
                </div>
              </article>
            </div>
          </section>

          {/* How It Works Section */}
          <section id="how" style={{ paddingTop: '100px' }}>
            <div className="eb rv">How it works</div>
            <h2 className="stl-h2 rv">
              From joining to improving in <u>three</u> steps.
            </h2>

            <div className="stl-steps">
              <div className="stl-step rv">
                <b>1</b>
                <h3>Join with a code</h3>
                <p>Enter the test code from your teacher and preview the test details.</p>
              </div>

              <div className="stl-step rv">
                <b>2</b>
                <h3>Attempt the assessment</h3>
                <p>Answer MCQs, descriptive and coding questions with real-time autosave.</p>
              </div>

              <div className="stl-step rv">
                <b>3</b>
                <h3>Review and improve</h3>
                <p>See released results, analyze weak areas, and track your performance over time.</p>
              </div>
            </div>
          </section>

          {/* Stats Counters */}
          <div className="stl-stats">
            <div className="stl-stat rv">
              <b>4</b>
              <span>Programming languages: Java, C++, Python, JavaScript</span>
            </div>
            <div className="stl-stat rv">
              <b>3</b>
              <span>Question formats: MCQ, descriptive, and automated coding</span>
            </div>
            <div className="stl-stat rv">
              <b>1</b>
              <span>Access code is all you need to join an examination</span>
            </div>
          </div>

          {/* Final CTA Banner */}
          <section className="stl-cta rv" id="cta">
            <h2>Ready to take your next test?</h2>
            <div className="stl-btn-row">
              <button
                type="button"
                onClick={onEnterPortal}
                className="stl-btn stl-btn-lime"
              >
                <span>Enter Student Portal</span>
                <ArrowRight className="size-4" />
              </button>

              <button
                type="button"
                onClick={onJoinWithCode}
                className="stl-btn stl-btn-ghost"
              >
                <span>Join a test</span>
              </button>
            </div>
          </section>

          {/* Footer */}
          <footer className="stl-footer">
            <span>© 2026 TestForge</span>
            <span>Take tests · Track growth · Own your results</span>
          </footer>
        </div>
      </main>

      {/* 3D Animations */}
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

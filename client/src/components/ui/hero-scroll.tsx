import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  Variants,
} from 'framer-motion';
import { AsmrBackground } from './asmr-background';
import {
  Sparkles,
  ArrowDown,
  ChevronRight,
  BookOpen,
  TestTube,
  FlaskConical,
  FileText,
  BarChart2,
  ShieldCheck,
  CheckCircle2,
  Zap,
  Users,
  Code2,
} from 'lucide-react';

/* ─── Type Definitions ───────────────────────────────────────────────────────── */

export interface HeroScrollProps {
  headline?: React.ReactNode;
  subtext?: string;
  primaryCtaLabel?: string;
  onPrimaryCta?: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCta?: () => void;
  onExplore?: () => void;
  onNavigateModule?: (module: 'bank' | 'create' | 'tests' | 'mutation' | 'paper' | 'exams') => void;
  children?: React.ReactNode;
  className?: string;
}

interface ShardParticle {
  x: number;
  y: number;
  s: number;
  vx: number;
  vy: number;
  c: string;
  a: number;
  r: number;
  rs: number;
  g: number;
}

interface CursorState {
  x: number | null;
  y: number | null;
}

/* ─── Animation Variants ─────────────────────────────────────────────────────── */

const easeCurve = [0.2, 0.7, 0.2, 1] as const;

const createHeroStagger = (shouldReduce: boolean): Variants => ({
  hidden: {},
  visible: {
    transition: shouldReduce
      ? {}
      : {
          staggerChildren: 0.14,
          delayChildren: 0.1,
        },
  },
});

const createHeroItem = (shouldReduce: boolean): Variants => ({
  hidden: shouldReduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: easeCurve,
    },
  },
});

const createRevealContainer = (shouldReduce: boolean): Variants => ({
  hidden: {},
  visible: {
    transition: shouldReduce
      ? {}
      : {
          staggerChildren: 0.09,
        },
  },
});

const createRevealItem = (shouldReduce: boolean): Variants => ({
  hidden: shouldReduce ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: easeCurve,
    },
  },
});

/* ─── Main Component ─────────────────────────────────────────────────────────── */

const ROTATING_TEACHER_HERO_WORDS = ['mastery.', 'insights.', 'learning.', 'outcomes.', 'growth.'];

export const HeroScroll: React.FC<HeroScrollProps> = ({
  headline,
  subtext = 'Create exams, manage question banks and monitor student performance, all from one workspace.',
  primaryCtaLabel = 'Create Assessment',
  onPrimaryCta,
  secondaryCtaLabel = 'Explore ↓',
  onSecondaryCta,
  onExplore,
  onNavigateModule,
  children,
  className = '',
}) => {
  const shouldReduceMotion = Boolean(useReducedMotion());

  /* Rotating Teacher Headline word */
  const [teacherWordIdx, setTeacherWordIdx] = useState(0);
  const [isWordPaused, setIsWordPaused] = useState(false);

  /* Nav frosted glassmorphism on scroll */
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      setNavScrolled(scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (shouldReduceMotion || isWordPaused) return;
    const interval = setInterval(() => {
      setTeacherWordIdx((prev) => (prev + 1) % ROTATING_TEACHER_HERO_WORDS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [shouldReduceMotion, isWordPaused]);

  /* 3D Scene Parallax State */
  const [sceneRot, setSceneRot] = useState({ rx: 9, ry: -20 });
  const [cursorRingVisible, setCursorRingVisible] = useState(false);
  const [isHoveringInteractive, setIsHoveringInteractive] = useState(false);

  /* Scroll Progress Tracking for the sticky hero exit */
  const trackRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<CursorState>({ x: null, y: null });
  const cursorRingRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end start'],
  });

  /* Transformations: scale 1 → 0.92, opacity 1 → 0.3, borderRadius 0 → 36px */
  const heroScale = useTransform(scrollYProgress, [0, 0.85], [1, 0.92]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0.3]);
  const heroRadius = useTransform(scrollYProgress, [0, 0.85], [0, 36]);
  const scrollCueOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);

  /* Smooth scroll to sibling content */
  const handleScrollToContent = useCallback(() => {
    if (onExplore) {
      onExplore();
      return;
    }
    const target =
      document.getElementById('landing-content') ||
      document.getElementById('platform-overview');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }, [onExplore]);

  /* ── Interactive Particle Canvas (Shard Particles with Pointer Swirl) ───── */
  useEffect(() => {
    if (shouldReduceMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let isVisible = true;
    let width = 0;
    let height = 0;
    let particles: ShardParticle[] = [];
    const RAD = 120;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const initParticles = (w: number, h: number) => {
      const count = Math.min(800, Math.floor((w * h) / 2300));
      const arr: ShardParticle[] = [];

      for (let i = 0; i < count; i++) {
        arr.push({
          x: Math.random() * w,
          y: Math.random() * h,
          s: Math.random() * 1.5 + 0.6,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          c: Math.random() > 0.7 ? '240,245,255' : '120,122,128',
          a: Math.random() * 0.4 + 0.15,
          r: Math.random() * 6.283,
          rs: (Math.random() - 0.5) * 0.05,
          g: 0,
        });
      }
      particles = arr;
    };

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0B0C0E';
      ctx.fillRect(0, 0, width, height);

      initParticles(width, height);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(canvas);
    handleResize();

    /* Intersection observer to pause simulation loop when out of view */
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisible = entry ? entry.isIntersecting : false;
      },
      { threshold: 0.05 }
    );
    if (heroRef.current) {
      intersectionObserver.observe(heroRef.current);
    }

    /* Mouse move tracking on hero */
    const handleMouseMove = (e: MouseEvent) => {
      const heroEl = heroRef.current;
      if (!heroEl) return;
      const rect = heroEl.getBoundingClientRect();
      const isInside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (!isInside) {
        setCursorRingVisible(false);
        setIsHoveringInteractive(false);
        return;
      }

      cursorRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      const ry = ((e.clientX - rect.left) / rect.width - 0.5) * -28 - 6;
      const rx = ((e.clientY - rect.top) / rect.height - 0.5) * -16 + 8;
      setSceneRot({ rx, ry });

      if (cursorRingRef.current) {
        cursorRingRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
        setCursorRingVisible(true);
      }

      const target = e.target as HTMLElement | null;
      if (target) {
        const isInteractive = Boolean(target.closest('button, a, input, select, textarea, [role="button"], .clickable'));
        setIsHoveringInteractive(isInteractive);
      }
    };

    const handleMouseLeave = () => {
      cursorRef.current = { x: null, y: null };
      setSceneRot({ rx: 9, ry: -20 });
      setCursorRingVisible(false);
      setIsHoveringInteractive(false);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave);

    const render = () => {
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.fillStyle = 'rgba(11, 12, 14, 0.18)';
      ctx.fillRect(0, 0, width, height);

      const cursor = cursorRef.current;
      const count = particles.length;

      for (let i = 0; i < count; i++) {
        const p = particles[i];

        if (cursor.x !== null && cursor.y !== null) {
          const dx = cursor.x - p.x;
          const dy = cursor.y - p.y;
          const dist = Math.hypot(dx, dy);

          if (dist < RAD && dist > 0) {
            const f = (RAD - dist) / RAD;
            // Subtle magnetic pull and gentle swirl (reduced glow/clustering)
            p.vx += (dx / dist) * f * 0.03 + (dy / dist) * f * 0.2;
            p.vy += (dy / dist) * f * 0.03 - (dx / dist) * f * 0.2;
            p.g = f * 0.32;
          } else {
            p.g *= 0.92;
          }
        } else {
          p.g *= 0.92;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.vx += (Math.random() - 0.5) * 0.04;
        p.vy += (Math.random() - 0.5) * 0.04;
        p.r += p.rs + (Math.abs(p.vx) + Math.abs(p.vy)) * 0.05;

        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);

        const alpha = Math.min(p.a + p.g, 0.95);
        ctx.fillStyle =
          p.g > 0.25 ? `rgba(237, 255, 114, ${alpha})` : `rgba(${p.c}, ${alpha})`;

        if (p.g > 0.45) {
          ctx.shadowBlur = 3;
          ctx.shadowColor = `rgba(237, 255, 114, 0.35)`;
        } else {
          ctx.shadowBlur = 0;
        }

        const s = p.s;
        ctx.beginPath();
        ctx.moveTo(0, -s * 2.5);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s * 2.5);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [shouldReduceMotion]);

  const heroVariants = createHeroStagger(shouldReduceMotion);
  const itemVariants = createHeroItem(shouldReduceMotion);
  const revealContainerVariants = createRevealContainer(shouldReduceMotion);
  const revealItemVariants = createRevealItem(shouldReduceMotion);

  return (
    <div
      ref={trackRef}
      className={`relative w-full bg-[#121212] overflow-visible ${className}`}
      style={{
        /* Scroll track height: 180svh so the sticky hero stays in place while sibling slides up over it */
        minHeight: '180svh',
      }}
    >
      {/* ── TOP NAV (FIXED AT VIEWPORT TOP, FROSTED ON SCROLL, NEVER COVERS SIDEPANEL) ── */}
      <nav
        aria-label="Teacher Dashboard Navigation"
        className={`fixed top-0 left-0 md:left-[104px] right-0 z-40 flex items-center justify-between px-6 sm:px-10 lg:px-14 py-4 transition-all duration-300 ${
          navScrolled
            ? 'bg-[#0B0C0E]/75 backdrop-blur-md border-b border-white/[0.08] shadow-lg'
            : 'bg-transparent'
        }`}
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        {/* Logo (Pushed to the Left, cleanly clearing the 78px sidebar which ends at 92px) */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8ff5a] rounded-xl px-1 py-1"
        >
          <div className="w-8 h-8 rounded-xl bg-[#e8ff5a] text-[#121212] flex items-center justify-center font-black text-xs tracking-tight shadow-md shadow-[#e8ff5a]/20 group-hover:scale-105 transition-transform">
            TF
          </div>
          <span className="text-white font-bold text-base sm:text-lg tracking-tight">
            TestForge
          </span>
        </a>

        {/* Glass Pill Links with Fixed Content: Features, Overview, Create Assessment */}
        <div className="flex items-center gap-2 bg-white/[0.05] border border-white/[0.12] backdrop-blur-md rounded-full px-3.5 py-1.5 shadow-lg shadow-black/20">
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              handleScrollToContent();
            }}
            className="text-xs font-medium text-neutral-300 hover:text-white px-3.5 py-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8ff5a]"
          >
            Features
          </a>
          <button
            type="button"
            onClick={handleScrollToContent}
            className="text-xs font-medium text-neutral-300 hover:text-white px-3.5 py-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8ff5a] cursor-pointer"
          >
            Overview
          </button>
          <button
            type="button"
            onClick={onPrimaryCta || handleScrollToContent}
            className="text-xs font-semibold text-[#121212] bg-[#e8ff5a] hover:bg-[#d6ec4e] px-4 py-1.5 rounded-full transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8ff5a] cursor-pointer"
          >
            Create Assessment
          </button>
        </div>
      </nav>

      {/* ── STICKY HERO CONTAINER (100svh height, sticky top: 0, z-10) ───────── */}
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden z-10 flex flex-col justify-between cursor-default">
        <motion.div
          ref={heroRef}
          style={{
            scale: shouldReduceMotion ? 1 : heroScale,
            opacity: shouldReduceMotion ? 1 : heroOpacity,
            borderRadius: shouldReduceMotion ? 0 : heroRadius,
            background: '#191A1D',
          }}
          className="relative h-full w-full overflow-hidden flex flex-col justify-between select-none bg-[#191A1D]"
        >
          {/* Custom Glowing Lime Cursor Ring (matching Main Landing Page) */}
          <div
            ref={cursorRingRef}
            aria-hidden="true"
            className={`pointer-events-none fixed top-0 left-0 hidden rounded-full border-[1.5px] border-[#EDFF72] transition-[width,height,opacity] duration-150 ease-out z-[9999] lg:block ${
              cursorRingVisible ? 'opacity-100' : 'opacity-0'
            } ${
              isHoveringInteractive
                ? 'size-14 -ml-7 -mt-7 border-[#EDFF72] bg-[#EDFF72]/10 backdrop-blur-xs shadow-[0_0_16px_rgba(237,255,114,0.4)]'
                : 'size-[34px] -ml-[17px] -mt-[17px] shadow-[0_0_10px_rgba(237,255,114,0.35)]'
            }`}
            style={{ willChange: 'transform' }}
          />

          {/* Particle Background Canvas matching Student Dashboard Hero */}
          <AsmrBackground />

          {/* Top spacer maintaining vertical layout alignment under the fixed nav */}
          <div className="h-16 shrink-0" />

          {/* ── TWO-COLUMN HERO CONTENT: LEFT ALIGNED CONTENT + RIGHT 3D STAGE ── */}
          <div className="relative z-20 flex-1 w-full max-w-[1440px] mx-auto px-6 sm:px-12 lg:px-14 my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* Left Column: Bold, Bigger, Left-aligned Headline & CTAs */}
            <motion.div
              variants={heroVariants}
              initial="hidden"
              animate="visible"
              className="lg:col-span-7 xl:col-span-8 flex flex-col items-start text-left space-y-6"
            >
              {/* Main Headline (prominent & bold, stable 2-line layout, size tuned so rotating words never shift line breaks) */}
              <motion.h1
                variants={itemVariants}
                className="text-4xl sm:text-6xl lg:text-[3.85rem] font-bold tracking-tight leading-[1.08] text-left text-white"
              >
                {headline ? (
                  headline
                ) : (
                  <>
                    <span className="block">Author smarter tests.</span>
                    <span className="block whitespace-nowrap">
                      <span className="text-white/95">Unlock deeper </span>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Pause rotating headline"
                        onClick={() => setIsWordPaused((prev) => !prev)}
                        onMouseEnter={() => setIsWordPaused(true)}
                        onMouseLeave={() => setIsWordPaused(false)}
                        title={isWordPaused ? "Click to resume rotation" : "Click or hover to pause rotation"}
                        className="text-[#EDFF72] drop-shadow-[0_0_36px_rgba(237,255,114,0.35)] inline-block min-w-[5.5ch] transition-all duration-300 cursor-pointer"
                      >
                        {ROTATING_TEACHER_HERO_WORDS[teacherWordIdx]}
                      </span>
                    </span>
                  </>
                )}
              </motion.h1>

              {/* Subtext (left-aligned) */}
              <motion.p
                variants={itemVariants}
                className="text-base sm:text-lg text-[#A4A7A1] font-normal leading-relaxed text-left max-w-xl"
              >
                {subtext}
              </motion.p>

              {/* Action Buttons (left-aligned) */}
              <motion.div
                variants={itemVariants}
                className="flex flex-wrap items-center justify-start gap-4 pt-2"
              >
                <button
                  type="button"
                  onClick={onPrimaryCta}
                  className="px-7 py-3.5 rounded-full bg-[#EDFF72] hover:bg-[#d9ef4f] text-[#121212] font-bold text-sm sm:text-base tracking-tight shadow-[0_10px_34px_-8px_rgba(237,255,114,0.45)] hover:shadow-[0_18px_40px_-8px_rgba(237,255,114,0.55)] hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EDFF72]"
                >
                  {primaryCtaLabel}
                </button>

                <button
                  type="button"
                  onClick={onSecondaryCta || handleScrollToContent}
                  className="px-7 py-3.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.18] text-white font-semibold text-sm sm:text-base tracking-tight backdrop-blur-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>{secondaryCtaLabel}</span>
                </button>
              </motion.div>
            </motion.div>

            {/* Right Column: 3D Stage with Floating Cards & Rotating Cube (Slightly reduced size for optimal balance) */}
            <div className="lg:col-span-5 xl:col-span-4 h-[350px] sm:h-[420px] relative flex items-center justify-center [perspective:1500px]">
              <style>{`
                @keyframes teacherBobbing {
                  0%, 100% { transform: translateY(0px); }
                  50% { transform: translateY(-14px); }
                }
                @keyframes teacherCubeSpin {
                  from { transform: translateZ(135px) rotateX(20deg) rotateY(0deg); }
                  to { transform: translateZ(135px) rotateX(380deg) rotateY(360deg); }
                }
                .teacher-cube-face {
                  position: absolute;
                  inset: 0;
                  display: grid;
                  place-items: center;
                  font-weight: 700;
                  font-size: 22px;
                  border: 1px solid rgba(0, 0, 0, 0.2);
                  box-shadow: inset 0 0 16px rgba(0,0,0,0.18);
                }
              `}</style>
              <div
                style={{
                  transform: `rotateX(${sceneRot.rx}deg) rotateY(${sceneRot.ry}deg)`,
                  transition: 'transform 0.18s cubic-bezier(0.2, 0.7, 0.2, 1)',
                  transformStyle: 'preserve-3d',
                }}
                className="relative h-[340px] w-full max-w-[420px] scale-90 sm:scale-95 origin-center"
              >
                {/* Layer 1: AI Question Generator Card (Z = 35) */}
                <div
                  style={{
                    transform: 'translateZ(35px)',
                    animation: 'teacherBobbing 6s ease-in-out infinite',
                  }}
                  className="absolute left-0 top-2 w-[295px] rounded-2xl border border-white/10 bg-[#191A1D]/90 backdrop-blur-xl p-5 text-white shadow-2xl"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[#A4A7A1]">
                    <span>AI Question Generator</span>
                    <span className="rounded-full bg-[#EDFF72] px-2.5 py-0.5 font-bold text-[10px] text-[#111]">
                      READY
                    </span>
                  </div>
                  <div className="mt-2.5 text-base font-semibold text-white">
                    Topic: Arrays &amp; Vectors
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-md bg-white/[0.08] px-2.5 py-1 text-[11px] font-mono text-[#EDFF72]">
                      Medium
                    </span>
                    <span className="rounded-md bg-white/[0.08] px-2.5 py-1 text-[11px] font-mono text-white/70">
                      MCQ
                    </span>
                    <span className="rounded-md bg-white/[0.08] px-2.5 py-1 text-[11px] font-mono text-white/70">
                      Coding
                    </span>
                  </div>
                </div>

                {/* Layer 2: Evaluator Status Card (Z = 85) */}
                <div
                  style={{
                    transform: 'translateZ(85px)',
                    animation: 'teacherBobbing 6s ease-in-out infinite 1.5s',
                  }}
                  className="absolute -right-2 top-8 w-[230px] rounded-2xl border border-[#EDFF72]/30 bg-[#EDFF72] p-5 text-[#111] shadow-[0_20px_50px_rgba(237,255,114,0.25)]"
                >
                  <span className="text-[11px] font-mono uppercase tracking-wider font-semibold opacity-75">
                    Evaluator Status
                  </span>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="font-mono text-4xl font-extrabold tracking-tight">100%</span>
                    <span className="text-xs font-semibold">Automated</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1 text-xs font-medium opacity-90">
                    <span>✓ All test cases valid</span>
                  </div>
                </div>

                {/* Layer 3: solution.js Monospace Card (Z = 130) */}
                <div
                  style={{
                    transform: 'translateZ(130px)',
                    animation: 'teacherBobbing 6s ease-in-out infinite 3s',
                  }}
                  className="absolute bottom-2 left-3 w-[300px] rounded-2xl border border-white/10 bg-[#121316]/95 p-4 font-mono text-xs text-white/90 shadow-2xl backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[11px] text-white/40">
                    <span>solution.js</span>
                    <span className="text-[#EDFF72]">2/2 passed</span>
                  </div>
                  <pre className="mt-2 text-[11px] leading-relaxed text-white/80">
                    <code>
                      <span className="text-[#EDFF72]">const</span> evaluate = (test) =&gt; &#123;<br />
                      &nbsp;&nbsp;<span className="text-white/50">return</span> test.verifyAll();<br />
                      &#125;;
                    </code>
                  </pre>
                </div>

                {/* Layer 4: Rotating 3D Cube (Z = 145, 86px) */}
                <div
                  style={{
                    transform: 'translateZ(145px)',
                    animation: 'teacherBobbing 6s ease-in-out infinite 0.75s',
                  }}
                  className="absolute -right-2 bottom-6 size-[86px] [perspective:600px]"
                >
                  <div
                    style={{
                      width: '86px',
                      height: '86px',
                      position: 'relative',
                      transformStyle: 'preserve-3d',
                      animation: 'teacherCubeSpin 16s linear infinite',
                    }}
                  >
                    <div className="teacher-cube-face bg-[#EDFF72] text-[#111]" style={{ transform: 'translateZ(43px)' }}>TF</div>
                    <div className="teacher-cube-face bg-white text-[#111]" style={{ transform: 'rotateY(90deg) translateZ(43px)' }}>✓</div>
                    <div className="teacher-cube-face bg-[#EDFF72] text-[#111]" style={{ transform: 'rotateY(180deg) translateZ(43px)' }}>A+</div>
                    <div className="teacher-cube-face bg-white text-[#111]" style={{ transform: 'rotateY(-90deg) translateZ(43px)' }}>✦</div>
                    <div className="teacher-cube-face bg-[#EDFF72] text-[#111]" style={{ transform: 'rotateX(90deg) translateZ(43px)' }}>#</div>
                    <div className="teacher-cube-face bg-white text-[#111]" style={{ transform: 'rotateX(-90deg) translateZ(43px)' }}>⚡</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 5. BOTTOM CENTER: MOUSE WHEEL SCROLL CUE ─────────────────── */}
          <motion.div
            style={{
              opacity: shouldReduceMotion ? 1 : scrollCueOpacity,
              paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
            }}
            className="relative z-20 pb-6 flex flex-col items-center justify-center gap-2 pointer-events-none"
          >
            {/* Mouse wheel icon with animated lime dot */}
            <div
              aria-hidden="true"
              className="w-5 h-8 rounded-full border border-neutral-600 flex items-start justify-center p-1 bg-black/30 backdrop-blur-xs"
            >
              <motion.span
                animate={
                  shouldReduceMotion
                    ? {}
                    : {
                        y: [0, 9, 0],
                        opacity: [0.9, 0.2, 0.9],
                      }
                }
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="w-1.5 h-1.5 rounded-full bg-[#e8ff5a] shadow-[0_0_6px_#e8ff5a]"
              />
            </div>
            <span className="text-[10px] tracking-[0.2em] font-mono font-medium text-neutral-400 uppercase">
              Scroll to explore
            </span>
          </motion.div>
        </motion.div>
      </div>

      {/* ── SIBLING SECTION (Slides UP OVER the hero as user scrolls) ─────────── */}
      {children ? (
        children
      ) : (
        <section
          id="platform-overview"
          className="relative z-20 mt-0 rounded-t-[36px] bg-[#f1f1ee] text-[#121212] shadow-[0_-30px_80px_rgba(0,0,0,0.5)] border-t border-[#d8d8d2]/80 overflow-hidden"
        >
          <div className="max-w-7xl mx-auto space-y-20 pt-20 sm:pt-24 pb-28 px-4 sm:px-8 lg:px-12">
            {/* Section Header */}
            <motion.div
              variants={revealContainerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.15 }}
              className="max-w-3xl space-y-4"
            >
              <motion.div variants={revealItemVariants}>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#121212]/[0.06] border border-[#121212]/[0.1] text-xs font-mono font-semibold uppercase tracking-wider text-[#121212]">
                  <Sparkles className="h-3 w-3 text-[#121212]" />
                  Platform Architecture
                </span>
              </motion.div>

              <motion.h2
                variants={revealItemVariants}
                className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#121212] leading-[1.05]"
              >
                Everything you need to run an exam.
              </motion.h2>

              <motion.p
                variants={revealItemVariants}
                className="text-neutral-600 text-base sm:text-lg leading-relaxed font-normal"
              >
                A high-velocity platform built for educators, universities, and technical interviewers.
                Author verified questions, catch edge-case loopholes with automated mutation testing,
                and proctor candidate code in deterministic live sandboxes.
              </motion.p>
            </motion.div>

            {/* 12-col Bento Grid (Stacks below 860px) */}
            <motion.div
              variants={revealContainerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.15 }}
              className="grid grid-cols-12 gap-5"
            >
              {/* 1. Question Bank Card (Wide, 7-col) */}
              <motion.div
                variants={revealItemVariants}
                onClick={() => onNavigateModule?.('bank')}
                className="col-span-12 min-[860px]:col-span-7 bg-white rounded-[26px] p-7 sm:p-9 border border-[#121212]/[0.08] shadow-sm hover:shadow-md hover:border-[#121212]/20 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-2xl bg-[#121212]/[0.05] border border-[#121212]/[0.08] flex items-center justify-center text-[#121212] group-hover:scale-105 transition-transform">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-neutral-100 text-neutral-600 text-xs font-mono font-semibold">
                      // 01_BANK
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-[#121212] group-hover:text-black transition-colors flex items-center gap-2">
                      <span>Question Bank</span>
                      <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </h3>
                    <p className="text-sm text-neutral-500 mt-1 leading-relaxed">
                      Maintain tagged algorithmic challenges with reference solutions, complexity constraints,
                      and starter boilerplate across Java, Python, C++, and Node.js.
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-neutral-100 flex items-baseline justify-between">
                  <div>
                    <span className="text-4xl sm:text-5xl font-extrabold text-[#121212] tracking-tight">
                      1,000+
                    </span>
                    <span className="text-xs text-neutral-500 block mt-0.5 font-medium">
                      Verified Challenge Capacity
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-700 text-xs font-mono">
                      Java
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-700 text-xs font-mono">
                      Python
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-700 text-xs font-mono">
                      C++
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* 2. Test Studio Card (Lime card, 5-col) */}
              <motion.div
                variants={revealItemVariants}
                onClick={() => onNavigateModule?.('tests')}
                className="col-span-12 min-[860px]:col-span-5 bg-[#e8ff5a] rounded-[26px] p-7 sm:p-9 text-[#121212] shadow-sm hover:shadow-md hover:bg-[#e2fa51] transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-2xl bg-[#121212] text-[#e8ff5a] flex items-center justify-center group-hover:scale-105 transition-transform">
                      <TestTube className="h-5 w-5" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[#121212]/10 text-[#121212] text-xs font-mono font-bold">
                      // 02_STUDIO
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-[#121212] flex items-center gap-2">
                      <span>Test Studio</span>
                      <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </h3>
                    <p className="text-sm text-[#121212]/80 mt-1 leading-relaxed">
                      Author public and private grading suites with precision execution ceilings and memory bounds.
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-[#121212]/15 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-[#121212]" />
                    <span className="text-sm font-semibold">Strict Zero-Leak</span>
                  </div>
                  <span className="text-xs font-mono font-bold bg-[#121212] text-[#e8ff5a] px-3 py-1 rounded-full">
                    Isolated Runner
                  </span>
                </div>
              </motion.div>

              {/* 3. Mutation Lab Card (Dark Card, 5-col) */}
              <motion.div
                variants={revealItemVariants}
                onClick={() => onNavigateModule?.('mutation')}
                className="col-span-12 min-[860px]:col-span-5 bg-[#121212] text-white rounded-[26px] p-7 sm:p-9 border border-neutral-800 shadow-sm hover:shadow-md hover:border-[#e8ff5a]/40 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-2xl bg-[#e8ff5a] text-[#121212] flex items-center justify-center group-hover:scale-105 transition-transform">
                      <FlaskConical className="h-5 w-5" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-neutral-800 text-[#e8ff5a] text-xs font-mono font-bold">
                      // 03_MUTATION
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-[#e8ff5a] transition-colors flex items-center gap-2">
                      <span>Mutation Lab</span>
                      <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-[#e8ff5a]" />
                    </h3>
                    <p className="text-sm text-neutral-400 mt-1 leading-relaxed">
                      Inject deterministic AST mutations to verify whether your test suite catches subtle logic flaws.
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-neutral-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-3xl font-extrabold text-[#e8ff5a] tracking-tight">
                      98.4%
                    </span>
                    <span className="text-xs text-neutral-400 block mt-0.5 font-medium">
                      Mutant Kill Rate
                    </span>
                  </div>
                  <span className="text-xs font-mono text-neutral-300 bg-neutral-800 px-3 py-1 rounded-full">
                    AST Genetic Audit
                  </span>
                </div>
              </motion.div>

              {/* 4. Paper Designer Card (White Card, 4-col) */}
              <motion.div
                variants={revealItemVariants}
                onClick={() => onNavigateModule?.('paper')}
                className="col-span-12 min-[860px]:col-span-4 bg-white rounded-[26px] p-7 sm:p-9 border border-[#121212]/[0.08] shadow-sm hover:shadow-md hover:border-[#121212]/20 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-2xl bg-[#121212]/[0.05] border border-[#121212]/[0.08] flex items-center justify-center text-[#121212] group-hover:scale-105 transition-transform">
                      <FileText className="h-5 w-5" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-neutral-100 text-neutral-600 text-xs font-mono font-semibold">
                      // 04_DESIGNER
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-[#121212] group-hover:text-black transition-colors flex items-center gap-2">
                      <span>Paper Designer</span>
                      <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </h3>
                    <p className="text-sm text-neutral-500 mt-1 leading-relaxed">
                      Assemble multi-section examination papers with custom marks and MCQ & coding distribution.
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-neutral-100 flex items-center justify-between text-xs font-semibold text-neutral-700">
                  <span>Dynamic Sections</span>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.div>

              {/* 5. Student Analytics Card (White Card, 3-col) */}
              <motion.div
                variants={revealItemVariants}
                onClick={() => onNavigateModule?.('exams')}
                className="col-span-12 min-[860px]:col-span-3 bg-white rounded-[26px] p-7 sm:p-9 border border-[#121212]/[0.08] shadow-sm hover:shadow-md hover:border-[#121212]/20 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-2xl bg-[#121212]/[0.05] border border-[#121212]/[0.08] flex items-center justify-center text-[#121212] group-hover:scale-105 transition-transform">
                      <BarChart2 className="h-5 w-5" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-neutral-100 text-neutral-600 text-xs font-mono font-semibold">
                      // 05_ANALYTICS
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-[#121212] group-hover:text-black transition-colors flex items-center gap-2">
                      <span>Student Analytics</span>
                      <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </h3>
                    <p className="text-sm text-neutral-500 mt-1 leading-relaxed">
                      Live proctoring telemetry, tab-switch audit trails, and automatic grading distribution.
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-neutral-100 flex items-center justify-between">
                  <span className="text-xs font-mono text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    Live Telemetry
                  </span>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.div>
            </motion.div>

            {/* Stats Row */}
            <motion.div
              variants={revealContainerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.15 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6"
            >
              <motion.div
                variants={revealItemVariants}
                className="bg-white rounded-[26px] p-7 border border-[#121212]/[0.08] shadow-sm flex items-center gap-5"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#121212] text-[#e8ff5a] flex items-center justify-center font-bold text-xl shrink-0">
                  72
                </div>
                <div>
                  <h4 className="text-base font-bold text-[#121212]">AST Genetic Mutations</h4>
                  <p className="text-xs text-neutral-500 mt-0.5">Automated defect injection algorithms</p>
                </div>
              </motion.div>

              <motion.div
                variants={revealItemVariants}
                className="bg-white rounded-[26px] p-7 border border-[#121212]/[0.08] shadow-sm flex items-center gap-5"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#e8ff5a] text-[#121212] flex items-center justify-center font-bold text-xl shrink-0">
                  8
                </div>
                <div>
                  <h4 className="text-base font-bold text-[#121212]">Live Exam Dispatchers</h4>
                  <p className="text-xs text-neutral-500 mt-0.5">Concurrent synchronized assessment rooms</p>
                </div>
              </motion.div>

              <motion.div
                variants={revealItemVariants}
                className="bg-white rounded-[26px] p-7 border border-[#121212]/[0.08] shadow-sm flex items-center gap-5"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#121212] text-white flex items-center justify-center font-bold text-xl shrink-0">
                  <ShieldCheck className="h-6 w-6 text-[#e8ff5a]" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-[#121212]">100% Zero-Leak Verified</h4>
                  <p className="text-xs text-neutral-500 mt-0.5">Reference code & private suites shielded</p>
                </div>
              </motion.div>
            </motion.div>

            {/* Dark CTA Banner with Lime Button */}
            <motion.div
              variants={revealContainerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.15 }}
              className="bg-[#121212] text-white rounded-[26px] p-8 sm:p-12 lg:p-14 border border-neutral-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-8 relative overflow-hidden"
            >
              {/* Subtle Lime Radial Background Glow */}
              <div
                aria-hidden="true"
                className="absolute -right-24 -bottom-24 w-80 h-80 rounded-full bg-[#e8ff5a]/10 blur-3xl pointer-events-none"
              />

              <motion.div variants={revealItemVariants} className="max-w-xl space-y-3 relative z-10">
                <span className="text-xs font-mono uppercase tracking-wider text-[#e8ff5a] font-bold">
                  Start Engineering Assessments
                </span>
                <h3 className="text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                  Ready to forge your next assessment?
                </h3>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Join educators and engineering institutions delivering deterministic, anti-cheat code
                  evaluations with instant compilation and verified mutation coverage.
                </p>
              </motion.div>

              <motion.div variants={revealItemVariants} className="relative z-10 shrink-0">
                <button
                  type="button"
                  onClick={onPrimaryCta}
                  className="px-8 py-4 rounded-full bg-[#e8ff5a] hover:bg-[#d8ed4d] text-[#121212] font-bold text-sm sm:text-base tracking-tight shadow-[0_0_24px_rgba(232,255,90,0.3)] hover:shadow-[0_0_32px_rgba(232,255,90,0.45)] active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8ff5a]"
                >
                  Create Assessment Now
                </button>
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}
    </div>
  );
};

export default HeroScroll;

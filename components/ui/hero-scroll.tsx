import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  Variants,
} from 'framer-motion';
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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
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

  /* Scroll Progress Tracking for the sticky hero exit */
  const trackRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<CursorState>({ x: null, y: null });

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

  /* ── Interactive Particle Canvas ─────────────────────────────────────────── */
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
    let particles: Particle[] = [];

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const initParticles = (w: number, h: number) => {
      const density = Math.floor((w * h) / 7500);
      const count = Math.min(150, Math.max(50, density));
      const arr: Particle[] = [];

      for (let i = 0; i < count; i++) {
        arr.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          radius: Math.random() * 1.5 + 1.2,
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
      ctx.scale(dpr, dpr);

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
      const rect = canvas.getBoundingClientRect();
      cursorRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseLeave = () => {
      cursorRef.current = { x: null, y: null };
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave);

    /* Main Render Loop - Extended moving lines length */
    const maxLinkDistance = 290;
    const maxLinkDistanceSq = maxLinkDistance * maxLinkDistance;
    const repelRadius = 220;

    const render = () => {
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const cursor = cursorRef.current;
      const count = particles.length;

      // Update positions & repel from cursor
      for (let i = 0; i < count; i++) {
        const p = particles[i];

        if (cursor.x !== null && cursor.y !== null) {
          const dx = p.x - cursor.x;
          const dy = p.y - cursor.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < repelRadius * repelRadius && distSq > 0) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / repelRadius) * 2.2;
            p.x += (dx / dist) * force;
            p.y += (dy / dist) * force;
          }
        }

        p.x += p.vx;
        p.y += p.vy;

        // Bounce from boundaries
        if (p.x < 0) {
          p.x = 0;
          p.vx *= -1;
        } else if (p.x > width) {
          p.x = width;
          p.vx *= -1;
        }

        if (p.y < 0) {
          p.y = 0;
          p.vy *= -1;
        } else if (p.y > height) {
          p.y = height;
          p.vy *= -1;
        }
      }

      // Single O(n²) pass with distance check for link rendering
      for (let i = 0; i < count; i++) {
        const p1 = particles[i];

        for (let j = i + 1; j < count; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < maxLinkDistanceSq) {
            const dist = Math.sqrt(distSq);
            const alpha = Math.pow(1 - dist / maxLinkDistance, 1.15) * 0.45;

            // Check if link is near cursor to shift to white
            let isNearCursor = false;
            if (cursor.x !== null && cursor.y !== null) {
              const d1x = p1.x - cursor.x;
              const d1y = p1.y - cursor.y;
              const d2x = p2.x - cursor.x;
              const d2y = p2.y - cursor.y;
              if (
                d1x * d1x + d1y * d1y < repelRadius * repelRadius ||
                d2x * d2x + d2y * d2y < repelRadius * repelRadius
              ) {
                isNearCursor = true;
              }
            }

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = isNearCursor
              ? `rgba(255, 255, 255, ${Math.min(0.9, alpha * 2.4)})`
              : `rgba(232, 255, 90, ${alpha})`;
            ctx.lineWidth = isNearCursor ? 1.6 : 1.0;
            ctx.stroke();
          }
        }
      }

      // Draw particle dots
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232, 255, 90, 0.85)';
        ctx.fill();
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
      {/* ── STICKY HERO CONTAINER (100svh height, sticky top: 0, z-10) ───────── */}
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden z-10 flex flex-col justify-between">
        <motion.div
          ref={heroRef}
          style={{
            scale: shouldReduceMotion ? 1 : heroScale,
            opacity: shouldReduceMotion ? 1 : heroOpacity,
            borderRadius: shouldReduceMotion ? 0 : heroRadius,
            /* Radial lime glow behind headline centered at (50%, 45%) */
            background:
              'radial-gradient(circle at 50% 45%, rgba(232,255,90,0.14) 0%, rgba(18,18,18,0) 65%), #121212',
          }}
          className="relative h-full w-full overflow-hidden flex flex-col justify-between select-none"
        >
          {/* Canvas Particle Network Layer */}
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="absolute inset-0 w-full h-full pointer-events-none z-0"
          />

          {/* ── TOP NAV (ABSOLUTE) ────────────────────────────────────────── */}
          <nav
            aria-label="Hero navigation"
            className="relative z-20 w-full max-w-7xl mx-auto px-6 sm:px-10 pt-6 sm:pt-8 flex items-center justify-between"
            style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
          >
            {/* Logo */}
            <a
              href="#top"
              className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8ff5a] rounded-xl px-1 py-1"
            >
              <div className="w-9 h-9 rounded-xl bg-[#e8ff5a] text-[#121212] flex items-center justify-center font-black text-sm tracking-tight shadow-md shadow-[#e8ff5a]/20 group-hover:scale-105 transition-transform">
                TF
              </div>
              <span className="text-white font-bold text-lg sm:text-xl tracking-tight">
                TestForge
              </span>
            </a>

            {/* Glass Pill Links (hidden on mobile) */}
            <div className="hidden sm:flex items-center gap-2 bg-white/[0.05] border border-white/[0.12] backdrop-blur-md rounded-full px-3 py-1.5 shadow-lg shadow-black/20">
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
                onClick={onPrimaryCta || handleScrollToContent}
                className="text-xs font-semibold text-[#121212] bg-[#e8ff5a] hover:bg-[#d6ec4e] px-4 py-1.5 rounded-full transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8ff5a] cursor-pointer"
              >
                Get started
              </button>
            </div>
          </nav>

          {/* ── CENTER HERO CONTENT ──────────────────────────────────────── */}
          <div className="relative z-20 flex-1 flex flex-col items-center justify-center text-center px-4 sm:px-6 max-w-5xl mx-auto my-auto py-8">
            <motion.div
              variants={heroVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col items-center max-w-4xl"
            >
              {/* 1. Lime Pill Badge */}
              <motion.div variants={itemVariants} className="mb-6">
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#e8ff5a]/10 border border-[#e8ff5a]/30 text-[#e8ff5a] text-xs font-semibold tracking-wide backdrop-blur-md">
                  <span className="w-2 h-2 rounded-full bg-[#e8ff5a] animate-pulse shadow-[0_0_8px_#e8ff5a]" />
                  Assessment platform
                </span>
              </motion.div>

              {/* 2. Main Headline */}
              <motion.h1
                variants={itemVariants}
                className="text-[clamp(2.8rem,9vw,7.5rem)] font-semibold tracking-[-0.055em] leading-[0.98] sm:leading-[0.95] text-center"
              >
                {headline ? (
                  headline
                ) : (
                  <>
                    <span className="bg-gradient-to-b from-white via-neutral-100 to-neutral-400 bg-clip-text text-transparent">
                      Forge smarter{' '}
                    </span>
                    <span className="text-[#e8ff5a] drop-shadow-[0_0_24px_rgba(232,255,90,0.25)]">
                      assessments.
                    </span>
                  </>
                )}
              </motion.h1>

              {/* 3. Subtext */}
              <motion.p
                variants={itemVariants}
                className="mt-6 sm:mt-7 text-neutral-400 text-sm sm:text-base md:text-lg max-w-2xl font-normal leading-relaxed"
              >
                {subtext}
              </motion.p>

              {/* 4. Action Pill Buttons */}
              <motion.div
                variants={itemVariants}
                className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-4"
              >
                {/* Primary Button */}
                <button
                  type="button"
                  onClick={onPrimaryCta}
                  className="px-7 py-3.5 rounded-full bg-[#e8ff5a] hover:bg-[#d9ef4f] text-[#121212] font-semibold text-sm sm:text-base tracking-tight shadow-[0_0_20px_rgba(232,255,90,0.28)] hover:shadow-[0_0_28px_rgba(232,255,90,0.4)] active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8ff5a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
                >
                  {primaryCtaLabel}
                </button>

                {/* Ghost Explore Button */}
                <button
                  type="button"
                  onClick={onSecondaryCta || handleScrollToContent}
                  className="px-7 py-3.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.18] text-white font-medium text-sm sm:text-base tracking-tight backdrop-blur-md active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8ff5a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212] flex items-center gap-2"
                >
                  <span>{secondaryCtaLabel}</span>
                </button>
              </motion.div>
            </motion.div>
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

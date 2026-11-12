import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, KeyRound, Sparkles, Shield, GraduationCap, Check } from 'lucide-react';

export const HeroSection = ({
  onJoinTest,
  onExplorePlatform,
  onNavigateTeacherLogin,
  onNavigateStudentPortal
}) => {
  const heroRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);

  // Parallax rotation for 3D stage
  const [sceneRot, setSceneRot] = useState({ rx: 9, ry: -20 });

  // Interactive Particle Canvas (Plexus / Constellation Network + Pointer Repel)
  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = heroRef.current;
    if (!canvas || !hero) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0;
    let H = 0;
    let D = 1;
    let particles = [];
    let isVisible = true;
    let animId = null;
    const cursor = { x: null, y: null };

    const maxLinkDistance = 290;
    const maxLinkDistanceSq = maxLinkDistance * maxLinkDistance;
    const repelRadius = 220;

    const initParticles = (w, h) => {
      const density = Math.floor((w * h) / 7500);
      const count = Math.min(160, Math.max(50, density));
      const arr = [];

      for (let i = 0; i < count; i++) {
        arr.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          radius: Math.random() * 1.5 + 1.2
        });
      }
      particles = arr;
    };

    const resize = () => {
      D = Math.min(window.devicePixelRatio || 1, 2);
      W = hero.clientWidth;
      H = hero.clientHeight;
      canvas.width = Math.floor(W * D);
      canvas.height = Math.floor(H * D);
      ctx.setTransform(D, 0, 0, D, 0, 0);

      initParticles(W, H);
    };

    const render = () => {
      if (isVisible) {
        ctx.clearRect(0, 0, W, H);

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
          } else if (p.x > W) {
            p.x = W;
            p.vx *= -1;
          }

          if (p.y < 0) {
            p.y = 0;
            p.vy *= -1;
          } else if (p.y > H) {
            p.y = H;
            p.vy *= -1;
          }
        }

        // Single pass for link rendering
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
                : `rgba(237, 255, 114, ${alpha})`;
              ctx.lineWidth = isNearCursor ? 1.6 : 1.0;
              ctx.stroke();
            }
          }
        }

        // Draw particle nodes
        for (let i = 0; i < count; i++) {
          const p = particles[i];
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(237, 255, 114, 0.85)';
          ctx.fill();
        }
      }

      if (!reduce) {
        animId = requestAnimationFrame(render);
      }
    };

    const handlePointerMove = (e) => {
      const r = hero.getBoundingClientRect();
      cursor.x = e.clientX - r.left;
      cursor.y = e.clientY - r.top;

      const ry = ((e.clientX - r.left) / r.width - 0.5) * -28 - 6;
      const rx = ((e.clientY - r.top) / r.height - 0.5) * -16 + 8;
      setSceneRot({ rx, ry });
    };

    const handlePointerLeave = () => {
      cursor.x = null;
      cursor.y = null;
      setSceneRot({ rx: 9, ry: -20 });
    };

    resize();
    render();

    hero.addEventListener('pointermove', handlePointerMove, { passive: true });
    hero.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('resize', resize);

    const observer = new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting;
    });
    observer.observe(hero);

    const handleVisibility = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      hero.removeEventListener('pointermove', handlePointerMove);
      hero.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('resize', resize);
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <header
      id="top"
      ref={heroRef}
      className="relative min-h-[100svh] w-full overflow-hidden bg-[#0B0C0E] text-white flex items-center justify-center px-4 sm:px-8 lg:px-14 pt-24 pb-16 isolate select-none"
    >
      {/* Decorative Canvas Background */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[-2] h-full w-full block"
      />

      {/* Radial Lime Ambient Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[-1] opacity-70"
        style={{
          background:
            'radial-gradient(640px 420px at 78% 48%, rgba(237, 255, 114, 0.13), transparent 70%), radial-gradient(ellipse at 50% 120%, rgba(237, 255, 114, 0.1), transparent 60%)'
        }}
      />

      {/* Hero Content: Centered Layout */}
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center text-center space-y-6 z-10 py-12">
        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-[4.5rem] font-bold tracking-tight text-white leading-[1.06] max-w-4xl">
          Smarter assessments.{' '}
          <span className="text-white/95">Stronger learning.{' '}</span>
          <em className="not-italic text-[#EDFF72] drop-shadow-[0_0_36px_rgba(237,255,114,0.35)]">
            Better outcomes.
          </em>
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-lg text-[#A4A7A1] max-w-2xl leading-relaxed mx-auto">
         One workspace for creating, taking, and evaluating smarter assessments
        </p>

        {/* CTAs Row */}
        <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
          <button
            type="button"
            onClick={onJoinTest}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#EDFF72] text-sm font-bold text-[#111] shadow-[0_10px_34px_-8px_rgba(237,255,114,0.45)] hover:shadow-[0_18px_40px_-8px_rgba(237,255,114,0.55)] hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            <KeyRound className="size-4" />
            <span>Join a Test</span>
          </button>

          <button
            type="button"
            onClick={onExplorePlatform}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-white/20 bg-white/[0.06] text-sm font-semibold text-white hover:bg-white/15 hover:border-white/30 hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            <span>Explore Platform</span>
            <ArrowRight className="size-4" />
          </button>

          <button
            type="button"
            onClick={onNavigateTeacherLogin}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-white/10 bg-[#191A1D] text-sm font-semibold text-[#CFD1CC] hover:text-white hover:border-[#EDFF72]/40 hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            <Shield className="size-4 text-[#EDFF72]" />
            <span>Teacher Login</span>
          </button>
        </div>
      </div>

      {/* Subtle Scroll Cue */}
      <button
        type="button"
        onClick={onExplorePlatform}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.25em] text-[#6B6F69] uppercase hover:text-[#EDFF72] transition-colors cursor-pointer flex items-center gap-1.5"
      >
        <span>Scroll to explore</span>
        <span>↓</span>
      </button>
    </header>
  );
};

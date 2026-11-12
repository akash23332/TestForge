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

  // Interactive Particle Canvas (Shards + Pointer Swirl)
  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = heroRef.current;
    if (!canvas || !hero) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const RAD = 260;
    const m = { x: -1000, y: -1000 };
    let W = 0;
    let H = 0;
    let D = 1;
    let particles = [];
    let isVisible = true;
    let animId = null;

    class ShardParticle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * W;
        this.y = Math.random() * H;
        this.s = Math.random() * 1.5 + 0.6;
        this.vx = (Math.random() - 0.5) * 0.2;
        this.vy = (Math.random() - 0.5) * 0.2;
        this.c = Math.random() > 0.7 ? '240,245,255' : '120,122,128';
        this.a = Math.random() * 0.4 + 0.15;
        this.r = Math.random() * 6.283;
        this.rs = (Math.random() - 0.5) * 0.05;
        this.g = 0;
      }
      update() {
        const dx = m.x - this.x;
        const dy = m.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < RAD && dist > 0) {
          const f = (RAD - dist) / RAD;
          this.vx += (dx / dist) * f * 0.12 + (dy / dist) * f * 0.7;
          this.vy += (dy / dist) * f * 0.12 - (dx / dist) * f * 0.7;
          this.g = f * 0.7;
        } else {
          this.g *= 0.92;
        }

        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.vx += (Math.random() - 0.5) * 0.04;
        this.vy += (Math.random() - 0.5) * 0.04;
        this.r += this.rs + (Math.abs(this.vx) + Math.abs(this.vy)) * 0.05;

        if (this.x < -20) this.x = W + 20;
        if (this.x > W + 20) this.x = -20;
        if (this.y < -20) this.y = H + 20;
        if (this.y > H + 20) this.y = -20;
      }
      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.r);

        const alpha = Math.min(this.a + this.g, 0.95);
        ctx.fillStyle =
          this.g > 0.25 ? `rgba(237, 255, 114, ${alpha})` : `rgba(${this.c}, ${alpha})`;

        if (this.g > 0.4) {
          ctx.shadowBlur = 8 * this.g;
          ctx.shadowColor = `rgba(237, 255, 114, ${this.g})`;
        }

        const s = this.s;
        ctx.beginPath();
        ctx.moveTo(0, -s * 2.5);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s * 2.5);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    const resize = () => {
      D = Math.min(window.devicePixelRatio || 1, 2);
      W = hero.clientWidth;
      H = hero.clientHeight;
      canvas.width = Math.floor(W * D);
      canvas.height = Math.floor(H * D);
      ctx.setTransform(D, 0, 0, D, 0, 0);
      ctx.fillStyle = '#0B0C0E';
      ctx.fillRect(0, 0, W, H);

      const count = Math.min(800, Math.floor((W * H) / 2300));
      particles = Array.from({ length: count }, () => new ShardParticle());
    };

    const render = () => {
      if (isVisible) {
        ctx.fillStyle = 'rgba(11, 12, 14, 0.18)';
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < particles.length; i++) {
          particles[i].update();
          particles[i].draw();
        }
      }
      if (!reduce) {
        animId = requestAnimationFrame(render);
      }
    };

    const handlePointerMove = (e) => {
      const r = hero.getBoundingClientRect();
      m.x = e.clientX - r.left;
      m.y = e.clientY - r.top;

      const ry = ((e.clientX - r.left) / r.width - 0.5) * -28 - 6;
      const rx = ((e.clientY - r.top) / r.height - 0.5) * -16 + 8;
      setSceneRot({ rx, ry });
    };

    const handlePointerLeave = () => {
      m.x = -1000;
      m.y = -1000;
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

      {/* Hero Content Grid */}
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center z-10">
        {/* Left Column: Text & Primary Actions */}
        <div className="lg:col-span-7 flex flex-col items-start space-y-6">
          {/* Eyebrow Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EDFF72]/10 border border-[#EDFF72]/30 text-[#EDFF72] text-[11px] font-mono tracking-widest uppercase">
            <span className="size-2 rounded-full bg-[#EDFF72] animate-ping" />
            <span>Next-Gen Assessment Platform</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-[4.2rem] font-bold tracking-tight text-white leading-[1.04]">
            The Smarter Way to Create, Conduct &amp;{' '}
            <em className="not-italic text-[#EDFF72] drop-shadow-[0_0_40px_rgba(237,255,114,0.35)]">
              Evaluate Assessments.
            </em>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-[#A4A7A1] max-w-xl leading-relaxed">
            TestForge empowers educators to build intelligent assessments and helps students demonstrate their skills through interactive tests and coding challenges.
          </p>

          {/* CTAs Row */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onJoinTest}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#EDFF72] text-sm font-bold text-[#111] shadow-[0_10px_34px_-8px_rgba(237,255,114,0.45)] hover:shadow-[0_18px_40px_-8px_rgba(237,255,114,0.55)] hover:-translate-y-0.5 transition-all cursor-pointer"
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
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full border border-white/10 bg-[#191A1D] text-sm font-semibold text-[#CFD1CC] hover:text-white hover:border-[#EDFF72]/40 hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <Shield className="size-4 text-[#EDFF72]" />
              <span>Teacher Login</span>
            </button>
          </div>

          {/* Feature Highlights Tagline */}
          <div className="font-mono text-xs text-[#8F938D] tracking-wide pt-2">
            AI-powered question generation <span className="text-[#EDFF72]">·</span> Coding assessments <span className="text-[#EDFF72]">·</span> Automated evaluation
          </div>
        </div>

        {/* Right Column: 3D Stage with Floating Cards & Rotating Cube */}
        <div className="lg:col-span-5 h-[340px] sm:h-[440px] relative [perspective:1500px]">
          <div
            ref={sceneRef}
            style={{
              transform: `rotateX(${sceneRot.rx}deg) rotateY(${sceneRot.ry}deg)`,
              transformStyle: 'preserve-3d',
              transition: 'transform 0.15s ease-out'
            }}
            className="absolute inset-0 size-full"
          >
            {/* Card 1: AI Question Generator (Z: 20px) */}
            <div
              style={{
                transform: 'translateZ(20px)',
                animation: 'cardBobbing 6s ease-in-out infinite'
              }}
              className="absolute left-0 top-[8%] w-[68%] rounded-2xl bg-white p-4 sm:p-5 text-[#171819] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)]"
            >
              <div className="text-[11px] font-semibold text-[#777D78] uppercase tracking-wider">
                AI Question Generator
              </div>
              <div className="mt-1 font-bold text-sm tracking-tight text-[#171819]">
                Topic: Arrays &amp; Vectors
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EDFF72] text-[#111]">
                  Medium
                </span>
                <span className="font-mono text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#E9ECE7] text-[#171819]">
                  MCQ
                </span>
                <span className="font-mono text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#E9ECE7] text-[#171819]">
                  Coding
                </span>
              </div>
            </div>

            {/* Card 2: Coding Test Studio (Z: 90px) */}
            <div
              style={{
                transform: 'translateZ(90px)',
                animation: 'cardBobbing 6s ease-in-out infinite -2s'
              }}
              className="absolute right-0 top-0 w-[54%] rounded-2xl border border-white/15 bg-[#191A1D] p-4 sm:p-5 text-white shadow-[0_40px_70px_-20px_rgba(0,0,0,0.7)]"
            >
              <div className="text-[11px] font-medium text-[#9A9D97]">Coding Test Studio</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-[#EDFF72] tracking-tight">
                2/2 passed
              </div>
              <div className="mt-1 text-[11px] text-[#9A9D97] flex items-center gap-1">
                <Check className="size-3 text-[#EDFF72]" />
                <span>All test cases valid</span>
              </div>
            </div>

            {/* Card 3: solution.js snippet (Z: 150px) */}
            <div
              style={{
                transform: 'translateZ(150px)',
                animation: 'cardBobbing 6s ease-in-out infinite -4s'
              }}
              className="absolute left-[8%] bottom-[6%] w-[66%] rounded-2xl border border-white/10 bg-[#121316]/95 p-4 font-mono text-xs text-[#D8FFB0] shadow-2xl backdrop-blur-xl"
            >
              <div className="text-[10px] text-white/50 pb-1.5 border-b border-white/10 flex items-center justify-between">
                <span>solution.js</span>
                <span className="text-[#EDFF72]">✓ Verified AST</span>
              </div>
              <pre className="mt-2 text-[11px] leading-relaxed text-[#D8FFB0] overflow-hidden">
                <code>
                  <span className="text-[#EDFF72] font-semibold">function</span> solve(input) &#123;<br />
                  &nbsp;&nbsp;<span className="text-[#EDFF72]">return</span> input.length &gt; 0;<br />
                  &#125;
                </code>
              </pre>
            </div>

            {/* 3D Rotating 6-Face CSS Cube (Z: 120px) */}
            <div className="cube-wrapper absolute right-[2%] bottom-[6%] size-[80px] [transform-style:preserve-3d]">
              <div className="cube relative size-full [transform-style:preserve-3d]">
                <i className="face front">T</i>
                <i className="face back">F</i>
                <i className="face right">✓</i>
                <i className="face left">A+</i>
                <i className="face top">✦</i>
                <i className="face bottom">#</i>
              </div>
            </div>
          </div>
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

      {/* Keyframe Styles for Bobbing and Cube */}
      <style>{`
        @keyframes cardBobbing {
          0%, 100% { transform: translateZ(var(--tz, 30px)) translateY(0); }
          50% { transform: translateZ(var(--tz, 30px)) translateY(-14px); }
        }
        .cube-wrapper {
          animation: cubeWrapperSpin 18s linear infinite;
        }
        @keyframes cubeWrapperSpin {
          from {
            transform: translateZ(120px) rotateX(20deg) rotateY(0deg);
          }
          to {
            transform: translateZ(120px) rotateX(380deg) rotateY(360deg);
          }
        }
        .cube .face {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          font-family: Inter, sans-serif;
          font-weight: 800;
          font-size: 20px;
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.25);
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .cube .front {
          background: #EDFF72;
          color: #111;
          transform: translateZ(40px);
        }
        .cube .back {
          background: #FFFFFF;
          color: #111;
          transform: rotateY(180deg) translateZ(40px);
        }
        .cube .right {
          background: #EDFF72;
          color: #111;
          transform: rotateY(90deg) translateZ(40px);
        }
        .cube .left {
          background: #FFFFFF;
          color: #111;
          transform: rotateY(-90deg) translateZ(40px);
        }
        .cube .top {
          background: #EDFF72;
          color: #111;
          transform: rotateX(90deg) translateZ(40px);
        }
        .cube .bottom {
          background: #FFFFFF;
          color: #111;
          transform: rotateX(-90deg) translateZ(40px);
        }
      `}</style>
    </header>
  );
};

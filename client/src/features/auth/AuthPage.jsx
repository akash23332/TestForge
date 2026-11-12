import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  Shield,
  GraduationCap,
  Loader2
} from 'lucide-react';

export const AuthPage = ({ onSuccess, onNavigateLanding, initialRole = 'teacher' }) => {
  // Role: 'teacher' | 'student'
  const [role, setRole] = useState(initialRole);

  useEffect(() => {
    if (initialRole) {
      setRole(initialRole);
    }
  }, [initialRole]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Refs
  const cardRef = useRef(null);
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const dustCanvasRef = useRef(null);

  // Pointer tracking for grid spotlight & inside-card glare
  const handlePointerMove = useCallback((e) => {
    const x = e.clientX;
    const y = e.clientY;
    document.documentElement.style.setProperty('--sx', `${x}px`);
    document.documentElement.style.setProperty('--sy', `${y}px`);

    // Lime glare position INSIDE the card (card itself never moves!)
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const gx = x - rect.left;
      const gy = y - rect.top;
      cardRef.current.style.setProperty('--gx', `${gx}px`);
      cardRef.current.style.setProperty('--gy', `${gy}px`);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [handlePointerMove]);

  // Rising Lime Dust Particle Canvas (cap 170, area/9000, DPR capped at 2)
  useEffect(() => {
    const canvas = dustCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.scale(dpr, dpr);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const count = Math.min(170, Math.max(30, Math.floor((width * height) / 9000)));

    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 0.5 + Math.random() * 1.8,
      speedY: 0.2 + Math.random() * 0.45,
      speedX: (Math.random() - 0.5) * 0.2,
      baseAlpha: 0.18 + Math.random() * 0.45,
      twinkle: Math.random() * Math.PI * 2
    }));

    let animId;
    let isPaused = false;

    const render = () => {
      if (isPaused || prefersReducedMotion) return;
      ctx.clearRect(0, 0, width, height);

      const sx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sx')) || -9999;
      const sy = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sy')) || -9999;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y -= p.speedY;
        p.x += p.speedX;
        p.twinkle += 0.03;

        // Repel from cursor within 140px
        const dx = p.x - sx;
        const dy = p.y - sy;
        const dist = Math.hypot(dx, dy);
        if (dist < 140 && dist > 1) {
          const force = (1 - dist / 140) * 0.7;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }

        // Wrap around
        if (p.y < -10) p.y = height + 10;
        if (p.x < -10) p.x = width + 10;
        else if (p.x > width + 10) p.x = -10;

        const currentAlpha = Math.max(0.08, p.baseAlpha + Math.sin(p.twinkle) * 0.15);
        ctx.fillStyle = `rgba(237, 255, 114, ${currentAlpha})`;
        ctx.shadowColor = 'rgba(237, 255, 114, 0.6)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    if (prefersReducedMotion) {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx.fillStyle = `rgba(237, 255, 114, ${p.baseAlpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      animId = requestAnimationFrame(render);
    }

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.scale(dpr, dpr);
    };

    const handleVisibility = () => {
      isPaused = document.hidden;
      if (!isPaused && !prefersReducedMotion) {
        animId = requestAnimationFrame(render);
      }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Role Switching: Quick 90deg spin with copy swap at midpoint (350ms)
  const handleRoleSwitch = (newRole) => {
    if (newRole === role || isSubmitting) return;

    setErrorMessage('');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setRole(newRole);
      setEmail('');
      setPassword('');
      return;
    }

    setIsSpinning(true);
    setTimeout(() => {
      setRole(newRole);
      setEmail('');
      setPassword('');
    }, 350);

    setTimeout(() => {
      setIsSpinning(false);
    }, 700);
  };

  // Card Shake on error
  const triggerShake = (msg, focusField = 'email') => {
    setErrorMessage(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 450);
    if (focusField === 'email' && emailInputRef.current) {
      emailInputRef.current.focus();
    } else if (focusField === 'password' && passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  };

  // Submit Handler (REAL API auth + backend role verification)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      triggerShake('Please enter your email address.', 'email');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      triggerShake('Please enter a valid email address.', 'email');
      return;
    }
    if (!password) {
      triggerShake('Please enter your password.', 'password');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.post('/auth/login', {
        email: cleanEmail,
        password,
        role: role // Backend verifies that account role matches the active tab!
      });

      const payload = res.data?.data || res.data;
      const { token, user } = payload;

      if (token && user) {
        localStorage.setItem('testforge_token', token);
        localStorage.setItem('testforge_user', JSON.stringify(user));
        setIsSuccess(true);

        setTimeout(() => {
          if (onSuccess) onSuccess(user);
        }, 900);
      } else {
        triggerShake('Authentication failed. No session token returned.');
      }
    } catch (err) {
      const status = err.response?.status;
      const errorData = err.response?.data?.error || err.response?.data;
      const serverMessage = errorData?.message || err.customMessage;

      if (status === 403) {
        triggerShake(serverMessage || (role === 'teacher' ? 'This account is not registered as faculty.' : 'This account is not registered as a student.'));
      } else if (status === 401) {
        triggerShake('Invalid email or password.', 'password');
      } else if (status === 429) {
        triggerShake('Too many login attempts. Please wait a moment and try again.');
      } else if (!err.response) {
        triggerShake('Network error connecting to server. Please check your connection.');
      } else {
        triggerShake(serverMessage || 'Authentication failed. Please verify your credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Demo Credentials Quick-Fill (DEV only)
  const handleQuickDemoFill = () => {
    if (role === 'teacher') {
      setEmail(import.meta.env.VITE_DEMO_TEACHER_EMAIL || 'teacher@testforge.edu');
      setPassword('Teacher@123');
    } else {
      setEmail(import.meta.env.VITE_DEMO_STUDENT_EMAIL || 'student@testforge.edu');
      setPassword('Student@123');
    }
    setErrorMessage('');
  };

  // Role copy
  const isFaculty = role === 'teacher';
  const roleTitle = isFaculty ? 'Faculty Sign In' : 'Student Sign In';
  const roleSubtitle = isFaculty
    ? 'Access Teacher Dashboard & Question Bank'
    : 'Join tests, track results and keep learning';
  const roleEmailLabel = isFaculty ? 'Faculty Email' : 'Student Email';
  const roleButtonLabel = isFaculty ? 'Sign In as Faculty' : 'Sign In as Student';
  const roleNote = isFaculty
    ? 'Need an account? Contact your institution administrator.'
    : 'Need an account? Ask your institution administrator or teacher.';

  return (
    <div className="relative h-[100svh] w-full overflow-hidden bg-[#0a0b0c] font-sans text-[#F2F3F0] select-none">
      {/* ----------------------------------------------------------------------
        BACKGROUND LAYERS (All fixed, pointer-events: none, behind card)
        ---------------------------------------------------------------------- */}

      {/* 1. Aurora: 3 radial-gradient orbs with filter: blur(90px), opacity: .55, 18s alternate drift */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          style={{
            position: 'absolute',
            left: '-12vmax',
            top: '-18vmax',
            width: '46vmax',
            height: '46vmax',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(237,255,114,.45), transparent 70%)',
            filter: 'blur(90px)',
            opacity: 0.55,
            animation: 'auroraDrift1 18s ease-in-out infinite alternate'
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: '-14vmax',
            top: '10vh',
            width: '40vmax',
            height: '40vmax',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(80,220,140,.35), transparent 70%)',
            filter: 'blur(90px)',
            opacity: 0.55,
            animation: 'auroraDrift2 18s ease-in-out infinite alternate',
            animationDelay: '-6s'
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '30vw',
            bottom: '-22vmax',
            width: '36vmax',
            height: '36vmax',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(237,255,114,.3), transparent 70%)',
            filter: 'blur(90px)',
            opacity: 0.55,
            animation: 'auroraDrift3 18s ease-in-out infinite alternate',
            animationDelay: '-11s'
          }}
        />
      </div>

      {/* 2. Grid: 56px lines rgba(255,255,255,.04) with vignette mask scrolling slowly (30s linear) */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          style={{
            position: 'absolute',
            inset: '-56px',
            backgroundImage:
              'linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse at 50% 40%, black 30%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 40%, black 30%, transparent 80%)',
            animation: 'gridScroll 30s linear infinite'
          }}
        />
        {/* Second lime grid layer revealed only inside 360px circle at cursor */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(to right, rgba(237, 255, 114, 0.24) 1px, transparent 1px), linear-gradient(to bottom, rgba(237, 255, 114, 0.24) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(180px circle at var(--sx, -9999px) var(--sy, -9999px), black 0%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(180px circle at var(--sx, -9999px) var(--sy, -9999px), black 0%, transparent 100%)'
          }}
        />
      </div>

      {/* 3. Bottom flame: 3 blurred lime/green ellipses along bottom edge (filter blur(60px), 9s alternate) */}
      <div className="pointer-events-none fixed -bottom-16 inset-x-0 z-0 h-44 overflow-hidden" aria-hidden="true">
        <div
          style={{
            position: 'absolute',
            left: '10%',
            bottom: '-20px',
            width: '40%',
            height: '110px',
            borderRadius: '50%',
            background: 'rgba(237, 255, 114, 0.18)',
            filter: 'blur(60px)',
            animation: 'flame 9s ease-in-out infinite alternate'
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: '15%',
            bottom: '-20px',
            width: '45%',
            height: '120px',
            borderRadius: '50%',
            background: 'rgba(80, 220, 140, 0.15)',
            filter: 'blur(60px)',
            animation: 'flame 9s ease-in-out infinite alternate -3s'
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '35%',
            bottom: '-30px',
            width: '35%',
            height: '100px',
            borderRadius: '50%',
            background: 'rgba(237, 255, 114, 0.16)',
            filter: 'blur(60px)',
            animation: 'flame 9s ease-in-out infinite alternate -6s'
          }}
        />
      </div>

      {/* 4. Canvas of slowly rising lime dust particles */}
      <canvas
        ref={dustCanvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 block h-full w-full"
      />

      {/* ----------------------------------------------------------------------
        TOP BAR: TestForge Logo Left, Back to site Pill Right
        ---------------------------------------------------------------------- */}
      <header className="fixed top-0 inset-x-0 z-30 flex items-center justify-between px-6 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#EDFF72] font-black text-[#191A1D] shadow-[0_4px_14px_rgba(237,255,114,0.35)]">
            TF
          </div>
          <span className="text-lg font-bold tracking-tight text-white">TestForge</span>
        </div>

        {onNavigateLanding && (
          <button
            type="button"
            onClick={onNavigateLanding}
            className="hidden sm:inline-flex items-center gap-1.5 transition-all duration-200 cursor-pointer shadow-sm active:scale-95"
            style={{
              color: '#EDFF72',
              border: '1px solid rgba(237,255,114,.3)',
              backgroundColor: 'rgba(237,255,114,.08)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              fontSize: '12.5px',
              padding: '8px 14px',
              borderRadius: '999px'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateX(-2px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateX(0)')}
          >
            <span>← Back to site</span>
          </button>
        )}
      </header>

      {/* ----------------------------------------------------------------------
        CARD STAGE (<main.stage>)
        Fixed inset 0, z-index 2, perspective 1500px, padding 20px, display flex,
        overflow-y auto, overflow-x hidden
        ---------------------------------------------------------------------- */}
      <main
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2,
          perspective: '1500px',
          padding: '20px',
          display: 'flex',
          overflowY: 'auto',
          overflowX: 'hidden'
        }}
      >
        {/* <div.card> (Wrapper: relative, width min(470px,100%), margin auto, preserve-3d)
            NO overflow:hidden, NO filter, NO backdrop-filter here! */}
        <div
          ref={cardRef}
          style={{
            position: 'relative',
            width: 'min(470px, 100%)',
            margin: 'auto',
            transformStyle: 'preserve-3d',
            animation: 'cardEntrance 1s 0.1s cubic-bezier(.2,.8,.2,1) both'
          }}
          className={isShaking ? 'animate-card-shake' : ''}
        >
          {/* ==================================================================
              THREE FLOATING PROPS (z-index: 4, in front of the card, uncut!)
              translateZ offsets inside preserve-3d, hidden under 620px
              ================================================================== */}
          <div className="pointer-events-none hidden [@media(min-width:621px)]:block" aria-hidden="true">
            {/* Prop 1: Cube (left: -70px; top: 14%; 64x64px; translateZ 130px; 18s rotation; 6s bob) */}
            <div
              style={{
                position: 'absolute',
                left: '-70px',
                top: '14%',
                width: '64px',
                height: '64px',
                zIndex: 4,
                transform: 'translateZ(130px)',
                animation: 'propBob1 6s ease-in-out infinite'
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  transformStyle: 'preserve-3d',
                  animation: 'cubeSpin 18s linear infinite'
                }}
              >
                {/* Face Front (T) */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '12px',
                    border: '1px solid rgba(0,0,0,0.2)',
                    backgroundColor: '#EDFF72',
                    color: '#111',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    fontSize: '22px',
                    fontWeight: 700,
                    transform: 'translateZ(32px)'
                  }}
                >
                  T
                </div>
                {/* Face Back (F) */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '12px',
                    border: '1px solid rgba(0,0,0,0.2)',
                    backgroundColor: '#FFFFFF',
                    color: '#111',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    fontSize: '22px',
                    fontWeight: 700,
                    transform: 'rotateY(180deg) translateZ(32px)'
                  }}
                >
                  F
                </div>
                {/* Face Right (✓) */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '12px',
                    border: '1px solid rgba(0,0,0,0.2)',
                    backgroundColor: '#EDFF72',
                    color: '#111',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    fontSize: '22px',
                    fontWeight: 700,
                    transform: 'rotateY(90deg) translateZ(32px)'
                  }}
                >
                  ✓
                </div>
                {/* Face Left (A+) */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '12px',
                    border: '1px solid rgba(0,0,0,0.2)',
                    backgroundColor: '#FFFFFF',
                    color: '#111',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    fontSize: '20px',
                    fontWeight: 700,
                    transform: 'rotateY(-90deg) translateZ(32px)'
                  }}
                >
                  A+
                </div>
                {/* Face Top (✦) */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '12px',
                    border: '1px solid rgba(0,0,0,0.2)',
                    backgroundColor: '#EDFF72',
                    color: '#111',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    fontSize: '22px',
                    fontWeight: 700,
                    transform: 'rotateX(90deg) translateZ(32px)'
                  }}
                >
                  ✦
                </div>
                {/* Face Bottom (#) */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '12px',
                    border: '1px solid rgba(0,0,0,0.2)',
                    backgroundColor: '#FFFFFF',
                    color: '#111',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    fontSize: '22px',
                    fontWeight: 700,
                    transform: 'rotateX(-90deg) translateZ(32px)'
                  }}
                >
                  #
                </div>
              </div>
            </div>

            {/* Prop 2: White "Average score 86%" Chip (right: -60px; top: 26%; translateZ 110px; delay -2s) */}
            <div
              style={{
                position: 'absolute',
                right: '-60px',
                top: '26%',
                zIndex: 4,
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                padding: '12px 16px',
                color: '#111',
                boxShadow: '0 24px 40px -14px rgba(0,0,0,.6)',
                transform: 'translateZ(110px)',
                animation: 'propBob2 6s ease-in-out infinite -2s'
              }}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#777D78]">
                Average score
              </span>
              <div className="mt-0.5 font-mono text-[22px] font-bold tracking-tight text-[#111]">
                86%
              </div>
              <span className="block text-[11px] font-medium text-[#777D78] mt-0.5">
                ↑ 6% this month
              </span>
            </div>

            {/* Prop 3: Dark Code Card (left: -48px; bottom: 10%; translateZ 90px; delay -4s) */}
            <div
              style={{
                position: 'absolute',
                left: '-48px',
                bottom: '10%',
                zIndex: 4,
                backgroundColor: '#15161a',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: '14px',
                padding: '10px 14px',
                fontFamily: 'monospace',
                fontSize: '11px',
                lineHeight: 1.6,
                color: '#9a9e98',
                boxShadow: '0 20px 40px -10px rgba(0,0,0,0.7)',
                transform: 'translateZ(90px)',
                animation: 'propBob3 6s ease-in-out infinite -4s'
              }}
            >
              <div>
                <span style={{ color: '#EDFF72' }}>function</span> login() &#123;
              </div>
              <div className="pl-3">
                <span style={{ color: '#EDFF72' }}>return</span> welcome;
              </div>
              <div>&#125;</div>
            </div>
          </div>

          {/* ==================================================================
              FLIP WRAPPER (<div.flip>)
              Role-switch spin: 0.7s, 50% rotateY(90deg), preserve-3d
              ================================================================== */}
          <div
            style={{
              position: 'relative',
              transformStyle: 'preserve-3d',
              transform: isSpinning ? 'rotateY(90deg)' : 'rotateY(0deg)',
              transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {/* .glass: Absolute inset 0, radius 34px, linear-gradient(160deg, rgba(40,42,45,.78), rgba(22,23,25,.82)),
                backdrop-filter blur(22px) saturate(1.2), shadow 0 50px 90px -30px rgba(0,0,0,.85),
                border 1px solid rgba(255,255,255,.12), inset 0 1px 0 rgba(255,255,255,.12) */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '34px',
                background: 'linear-gradient(160deg, rgba(40,42,45,.78), rgba(22,23,25,.82))',
                backdropFilter: 'blur(22px) saturate(1.2)',
                WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 50px 90px -30px rgba(0, 0, 0, 0.85)',
                zIndex: 1
              }}
            />

            {/* .glare: Absolute inset 0, radius 34px, radial-gradient(380px circle at var(--gx) var(--gy), rgba(237,255,114,.14), transparent 60%),
                mix-blend-mode screen, pointer-events none (light only, card never moves) */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '34px',
                backgroundImage:
                  'radial-gradient(380px circle at var(--gx, 50%) var(--gy, 50%), rgba(237, 255, 114, 0.14), transparent 60%)',
                mixBlendMode: 'screen',
                pointerEvents: 'none',
                zIndex: 2
              }}
            />

            {/* .ring: Success pulse (1s) only */}
            {isSuccess && (
              <div
                style={{
                  position: 'absolute',
                  inset: '-4px',
                  borderRadius: '38px',
                  border: '2px solid #EDFF72',
                  pointerEvents: 'none',
                  zIndex: 3,
                  animation: 'successRingPulse 1s ease-out forwards'
                }}
              />
            )}

            {/* .in: Relative content container, padding 36px 36px 30px, z-index 3 */}
            <div
              style={{
                position: 'relative',
                padding: '36px 36px 30px',
                zIndex: 3
              }}
            >
              {/* Header Title & Subtitle */}
              <div className="text-center">
                <h1
                  style={{
                    fontSize: 'clamp(28px, 5vw, 36px)',
                    fontWeight: 600,
                    letterSpacing: '-0.045em',
                    margin: '0 0 6px',
                    color: '#F2F3F0'
                  }}
                >
                  {roleTitle}
                </h1>
                <p
                  style={{
                    fontSize: '13.5px',
                    color: '#9a9e98',
                    margin: '0 0 24px',
                    minHeight: '20px'
                  }}
                >
                  {roleSubtitle}
                </p>
              </div>

              {/* Role Switcher: Grid 2 cols, padding 5px, radius 999px, border 1px rgba(255,255,255,.18), bg rgba(0,0,0,.25) */}
              <div role="tablist" aria-label="Sign-in role selection" className="relative">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    padding: '5px',
                    borderRadius: '999px',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    position: 'relative'
                  }}
                >
                  {/* Sliding Lime Thumb: top/bottom/left 5px, width calc(50% - 5px), shadow 0 6px 20px rgba(237,255,114,.3) */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '5px',
                      bottom: '5px',
                      left: '5px',
                      width: 'calc(50% - 5px)',
                      borderRadius: '999px',
                      backgroundColor: '#EDFF72',
                      boxShadow: '0 6px 20px rgba(237, 255, 114, 0.3)',
                      transform: role === 'teacher' ? 'translateX(0%)' : 'translateX(100%)',
                      transition: 'transform 0.45s cubic-bezier(0.5, 1.4, 0.4, 1)',
                      pointerEvents: 'none'
                    }}
                  />

                  {/* Button: Teacher / Faculty */}
                  <button
                    type="button"
                    role="tab"
                    id="tab-teacher"
                    aria-selected={role === 'teacher'}
                    aria-controls="auth-panel"
                    disabled={isSubmitting}
                    onClick={() => handleRoleSwitch('teacher')}
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 8px',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: role === 'teacher' ? '#111' : '#9a9e98',
                      cursor: 'pointer',
                      border: 'none',
                      background: 'none',
                      borderRadius: '999px',
                      transition: 'color 0.2s'
                    }}
                  >
                    <Shield style={{ width: '16px', height: '16px' }} />
                    <span>Teacher / Faculty</span>
                  </button>

                  {/* Button: Student / Candidate */}
                  <button
                    type="button"
                    role="tab"
                    id="tab-student"
                    aria-selected={role === 'student'}
                    aria-controls="auth-panel"
                    disabled={isSubmitting}
                    onClick={() => handleRoleSwitch('student')}
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 8px',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: role === 'student' ? '#111' : '#9a9e98',
                      cursor: 'pointer',
                      border: 'none',
                      background: 'none',
                      borderRadius: '999px',
                      transition: 'color 0.2s'
                    }}
                  >
                    <GraduationCap style={{ width: '16px', height: '16px' }} />
                    <span>Student / Candidate</span>
                  </button>
                </div>
              </div>

              {/* Demo Credentials Row (Dev only) */}
              {import.meta.env.DEV && (
                <div
                  style={{
                    margin: '16px 0 4px',
                    padding: '11px 16px',
                    borderRadius: '16px',
                    backgroundColor: 'rgba(0, 0, 0, 0.28)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span style={{ color: '#9a9e98' }}>
                    Demo credentials ({isFaculty ? 'Faculty' : 'Student'}):
                  </span>
                  <button
                    type="button"
                    onClick={handleQuickDemoFill}
                    style={{
                      color: '#EDFF72',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      padding: 0
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                  >
                    Use {isFaculty ? 'teacher@testforge.edu' : 'student@testforge.edu'}
                  </button>
                </div>
              )}

              {/* Form */}
              <form
                id="auth-panel"
                role="tabpanel"
                aria-labelledby={`tab-${role}`}
                onSubmit={handleSubmit}
              >
                {/* Email Label & Input */}
                <label
                  htmlFor="login-email"
                  style={{
                    display: 'block',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#d9dcd6',
                    margin: '16px 0 7px'
                  }}
                >
                  {roleEmailLabel}
                </label>
                <div className="relative">
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '14px',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: '#9a9e98'
                    }}
                  >
                    <Mail style={{ width: '18px', height: '18px' }} />
                  </div>
                  <input
                    ref={emailInputRef}
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@school.edu"
                    disabled={isSubmitting || isSuccess}
                    style={{
                      width: '100%',
                      padding: '14px 44px',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '14px',
                      fontSize: '14.5px',
                      color: '#FFFFFF',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#EDFF72';
                      e.currentTarget.style.boxShadow =
                        '0 0 0 4px rgba(237,255,114,.14), 0 10px 30px -10px rgba(237,255,114,.25)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.14)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>

                {/* Password Label & Input */}
                <label
                  htmlFor="login-password"
                  style={{
                    display: 'block',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#d9dcd6',
                    margin: '16px 0 7px'
                  }}
                >
                  Password
                </label>
                <div className="relative">
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '14px',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: '#9a9e98'
                    }}
                  >
                    <Lock style={{ width: '18px', height: '18px' }} />
                  </div>
                  <input
                    ref={passwordInputRef}
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={isSubmitting || isSuccess}
                    style={{
                      width: '100%',
                      padding: '14px 44px',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '14px',
                      fontSize: '14.5px',
                      color: '#FFFFFF',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#EDFF72';
                      e.currentTarget.style.boxShadow =
                        '0 0 0 4px rgba(237,255,114,.14), 0 10px 30px -10px rgba(237,255,114,.25)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.14)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  {/* Eye button: 34px circle at right 8px */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      right: '8px',
                      transform: 'translateY(-50%)',
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#9a9e98',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#9a9e98')}
                  >
                    {showPassword ? (
                      <EyeOff style={{ width: '18px', height: '18px' }} />
                    ) : (
                      <Eye style={{ width: '18px', height: '18px' }} />
                    )}
                  </button>
                </div>

                {/* "Forgot password?" BELOW password field, right-aligned (12.5px, #9a9e98, margin-top 10px, lime on hover) */}
                <div style={{ textAlign: 'right', marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setToastMessage('Password reset requests are managed by your institution administrator.')}
                    style={{
                      fontSize: '12.5px',
                      color: '#9a9e98',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#EDFF72')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#9a9e98')}
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Error line: min-height 20px with margin-top 10px, aria-live="polite", ⚠ in #f0e6a8 (no red!) */}
                <div
                  aria-live="polite"
                  style={{
                    minHeight: '20px',
                    marginTop: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {errorMessage && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12.5px',
                        fontWeight: 500,
                        color: '#f0e6a8'
                      }}
                    >
                      <span>⚠</span>
                      <span>{errorMessage}</span>
                    </div>
                  )}
                </div>

                {/* Submit button: full width, margin-top 8px, padding 16px, 15px/600, radius 999px, bg #EDFF72, color #111,
                    shadow 0 12px 34px -8px rgba(237,255,114,.45), white shimmer sweep every 3.5s */}
                <button
                  type="submit"
                  disabled={isSubmitting || isSuccess}
                  className="auth-submit-btn"
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    padding: '16px',
                    fontSize: '15px',
                    fontWeight: 600,
                    borderRadius: '999px',
                    backgroundColor: isSuccess ? '#FFFFFF' : '#EDFF72',
                    color: '#111111',
                    boxShadow: '0 12px 34px -8px rgba(237, 255, 114, 0.45)',
                    border: 'none',
                    cursor: isSubmitting || isSuccess ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s'
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Signing in…</span>
                    </>
                  ) : isSuccess ? (
                    <span>✓ Welcome back, redirecting…</span>
                  ) : (
                    <span>{roleButtonLabel}</span>
                  )}
                </button>
              </form>

              {/* Note: margin 20px 0 0, 12.5px, #d9dcd6, centered (min-height 38px) */}
              <div
                style={{
                  margin: '20px 0 0',
                  minHeight: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center'
                }}
              >
                <p style={{ fontSize: '12.5px', color: '#d9dcd6', margin: 0, lineHeight: 1.4 }}>
                  {roleNote}
                </p>
              </div>

              {/* "or" divider: margin 18px 0, 12.5px, #9a9e98, 1px lines rgba(255,255,255,.12) */}
              <div
                style={{
                  position: 'relative',
                  margin: '18px 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <div style={{ width: '100%', borderTop: '1px solid rgba(255, 255, 255, 0.12)' }} />
                <span
                  style={{
                    position: 'absolute',
                    backgroundColor: '#1b1c1e',
                    padding: '0 10px',
                    fontSize: '12.5px',
                    color: '#9a9e98'
                  }}
                >
                  or
                </span>
              </div>

              {/* Google button: padding 14px, radius 999px, border 1px rgba(255,255,255,.2), bg rgba(255,255,255,.06),
                  14px/600, white G icon (disabled style because OAuth is not configured) */}
              <div className="relative group">
                <button
                  type="button"
                  disabled
                  title="Google OAuth is not configured on this environment"
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '999px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: 'not-allowed'
                  }}
                >
                  <svg style={{ width: '16px', height: '16px', fill: 'currentColor', opacity: 0.7 }} viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl border border-white/10 bg-[#0a0b0c] px-3 py-1.5 text-[11px] font-medium text-white shadow-xl opacity-0 transition-opacity duration-150 group-hover:opacity-100 z-50">
                  Google OAuth is not configured on this environment
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Ephemeral Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor: 'rgba(30, 31, 34, 0.95)',
            padding: '10px 16px',
            fontSize: '12.5px',
            fontWeight: 600,
            color: '#FFFFFF',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage('')}
            style={{
              marginLeft: '8px',
              color: 'rgba(255, 255, 255, 0.5)',
              background: 'none',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Global CSS Styles & Keyframes */}
      <style>{`
        /* Card Entrance Animation: 1s .1s cubic-bezier(.2,.8,.2,1) */
        @keyframes cardEntrance {
          from {
            opacity: 0;
            transform: translateY(40px) rotateX(24deg) scale(0.94);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotateX(0deg) scale(1);
          }
        }

        /* Success Ring Pulse (1s) */
        @keyframes successRingPulse {
          0% {
            opacity: 0;
            transform: scale(0.98);
          }
          50% {
            opacity: 1;
            transform: scale(1.02);
            box-shadow: 0 0 30px rgba(237, 255, 114, 0.6);
          }
          100% {
            opacity: 0;
            transform: scale(1.04);
          }
        }

        /* Shimmer sweep across Sign In button every 3.5s */
        .auth-submit-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
          animation: sweepShimmer 3.5s infinite;
        }
        @keyframes sweepShimmer {
          0% { transform: translateX(-100%); }
          35%, 100% { transform: translateX(100%); }
        }
        .auth-submit-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 40px -8px rgba(237, 255, 114, 0.55) !important;
        }

        /* Card Shake (0.45s) */
        @keyframes cardShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-card-shake {
          animation: cardShake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }

        /* 3 Props 6s Bobbing (14px loop) */
        @keyframes propBob1 {
          0%, 100% { transform: translateZ(130px) translateY(0); }
          50% { transform: translateZ(130px) translateY(-14px); }
        }
        @keyframes propBob2 {
          0%, 100% { transform: translateZ(110px) translateY(0); }
          50% { transform: translateZ(110px) translateY(-14px); }
        }
        @keyframes propBob3 {
          0%, 100% { transform: translateZ(90px) translateY(0); }
          50% { transform: translateZ(90px) translateY(-14px); }
        }

        /* Cube Spin: 18s linear infinite (rotateX 20deg to 380deg, rotateY 0 to 360deg) */
        @keyframes cubeSpin {
          0% { transform: rotateX(20deg) rotateY(0deg); }
          100% { transform: rotateX(380deg) rotateY(360deg); }
        }

        /* Background Aurora Orbs: 18s alternate drift (translate 6vmax, 4vmax, scale 1.2) */
        @keyframes auroraDrift1 {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(6vmax, 4vmax) scale(1.2); }
        }
        @keyframes auroraDrift2 {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(-5vmax, -4vmax) scale(1.2); }
        }
        @keyframes auroraDrift3 {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(4vmax, -3vmax) scale(1.2); }
        }

        /* Background Grid Scroll (30s linear) */
        @keyframes gridScroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(56px); }
        }

        /* Bottom Flame: 9s alternate */
        @keyframes flame {
          0% { transform: scaleY(1); opacity: 0.7; }
          100% { transform: scaleY(1.3) scaleX(1.1); opacity: 1; }
        }

        /* Accessibility: prefers-reduced-motion */
        @media (prefers-reduced-motion: reduce) {
          *, ::before, ::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>
    </div>
  );
};

export default AuthPage;

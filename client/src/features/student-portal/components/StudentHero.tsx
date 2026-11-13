import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { BackgroundPaths } from './BackgroundPaths';
import { Button } from '@/components/ui/button';
import { ArrowDown, ArrowRight, KeyRound } from 'lucide-react';

interface StudentHeroProps {
  onGoToDashboard?: () => void;
  onJoinTest?: () => void;
  isLoggedIn?: boolean;
}

const ROTATING_PHRASES = [
  'your results.',
  'your progress.',
  'your skills.',
  'your journey.',
];

// Spring letter animation
const springTransition = (wordIdx: number, letterIdx: number) => ({
  type: 'spring' as const,
  stiffness: 150,
  damping: 25,
  delay: wordIdx * 0.1 + letterIdx * 0.03,
});

export const StudentHero: React.FC<StudentHeroProps> = ({
  onGoToDashboard,
  onJoinTest,
  isLoggedIn = true,
}) => {
  const heroRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = Boolean(useReducedMotion());

  // Parallax rotation for 3D stage
  const [sceneRot, setSceneRot] = useState({ rx: 6, ry: -14 });
  const [isHoveringHero, setIsHoveringHero] = useState(false);

  // Rotating headline word
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isTabHidden, setIsTabHidden] = useState(false);

  useEffect(() => {
    const handleVisibility = () => {
      setIsTabHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    if (shouldReduceMotion || isTabHidden) return;
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % ROTATING_PHRASES.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [shouldReduceMotion, isTabHidden]);

  // Magnetic button pointers
  const magneticRef1 = useRef<HTMLButtonElement>(null);
  const magneticRef2 = useRef<HTMLButtonElement>(null);

  const handleMagnetic = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * 0.22;
    const y = (e.clientY - rect.top - rect.height / 2) * 0.3;
    btn.style.transform = `translate(${x}px, ${y}px)`;
  };

  const handleMagneticLeave = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = '';
  };

  // Pointer parallax over 3D scene
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return;
    const hero = heroRef.current;
    if (!hero) return;
    const rect = hero.getBoundingClientRect();
    const ry = ((e.clientX - rect.left) / rect.width - 0.5) * -26 - 6;
    const rx = ((e.clientY - rect.top) / rect.height - 0.5) * -14 + 8;
    setSceneRot({ rx, ry });
  };

  const handlePointerLeave = () => {
    setSceneRot({ rx: 6, ry: -14 });
  };

  // Animated letter headline lines
  const line1 = 'Take tests.';
  const line2 = 'Track growth.';
  const line3Prefix = 'Own ';

  return (
    <div
      ref={heroRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative sticky top-0 h-[100svh] w-full overflow-hidden bg-[#0B0C0E] text-white flex flex-col justify-between px-[clamp(20px,6vw,90px)] pt-20 pb-12 select-none isolate"
      style={{
        zIndex: 0,
      }}
    >
      {/* BackgroundPaths Canvas Layer */}
      <BackgroundPaths isVisible={true} />

      {/* Main Two-Column Hero Grid */}
      <div className="relative z-10 my-auto grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] items-center gap-6 lg:gap-10 w-full max-w-[1440px] mx-auto">
        {/* Left Column */}
        <div className="flex flex-col items-start text-left space-y-6">
          {/* Pill "Student portal" */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[rgba(237,255,114,0.1)] border border-[rgba(237,255,114,0.28)] text-[#EDFF72] text-xs font-medium tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EDFF72] animate-pulse" />
            <span>Student portal</span>
          </div>

          {/* Headline with Letter-by-Letter Spring Animations & Rotating Ending */}
          <h1
            aria-label="Take tests. Track growth. Own your results."
            className="text-[clamp(2.6rem,6vw,5.2rem)] font-semibold leading-[1.02] tracking-[-0.055em] text-white"
          >
            {/* Line 1 */}
            <span className="block whitespace-nowrap">
              {line1.split('').map((char, i) => (
                <motion.span
                  key={`l1-${i}`}
                  initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 80 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springTransition(0, i)}
                  className="inline-block"
                >
                  {char === ' ' ? '\u00A0' : char}
                </motion.span>
              ))}
            </span>

            {/* Line 2 */}
            <span className="block whitespace-nowrap">
              {line2.split('').map((char, i) => (
                <motion.span
                  key={`l2-${i}`}
                  initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 80 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springTransition(1, i)}
                  className="inline-block"
                >
                  {char === ' ' ? '\u00A0' : char}
                </motion.span>
              ))}
            </span>

            {/* Line 3: Own + Rotating Lime Phrase */}
            <span className="block whitespace-nowrap">
              {line3Prefix.split('').map((char, i) => (
                <motion.span
                  key={`l3-${i}`}
                  initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 80 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springTransition(2, i)}
                  className="inline-block"
                >
                  {char === ' ' ? '\u00A0' : char}
                </motion.span>
              ))}

              {/* Rotating Word Container */}
              <span className="inline-block relative min-w-[7.5ch] text-left">
                <AnimatePresence mode="wait">
                  <motion.em
                    key={phraseIndex}
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="not-italic text-[#EDFF72] drop-shadow-[0_0_50px_rgba(237,255,114,0.35)] inline-block"
                  >
                    {shouldReduceMotion ? ROTATING_PHRASES[0] : ROTATING_PHRASES[phraseIndex]}
                  </motion.em>
                </AnimatePresence>
              </span>
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-[#A4A7A1] max-w-[33rem] text-[clamp(15px,1.4vw,17px)] leading-[1.65]">
            Join tests with a code, solve MCQs and coding challenges, and see exactly how your performance is progressing.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3.5 pt-1">
            <Button
              ref={magneticRef1}
              onPointerMove={handleMagnetic}
              onPointerLeave={handleMagneticLeave}
              onClick={onGoToDashboard}
              variant="lime"
              className="gap-2 px-7 py-3.5 text-sm font-semibold tracking-tight shadow-[0_10px_34px_-8px_rgba(237,255,114,0.45)] hover:shadow-[0_18px_40px_-8px_rgba(237,255,114,0.55)]"
            >
              <span>{isLoggedIn ? 'Go to dashboard ↓' : 'Enter Student Portal →'}</span>
            </Button>

            <Button
              ref={magneticRef2}
              onPointerMove={handleMagnetic}
              onPointerLeave={handleMagneticLeave}
              onClick={onJoinTest}
              variant="ghost"
              className="gap-2 px-6 py-3.5 text-sm font-semibold text-white hover:text-white"
            >
              <span>Join a test ↓</span>
            </Button>
          </div>

          {/* Monospace Tag line */}
          <div className="pt-2 font-mono text-[12px] text-[#8F938D]">
            <span>Join with a test code</span>{' '}
            <b className="text-[#EDFF72] font-semibold">·</b>{' '}
            <span>MCQs &amp; coding</span>{' '}
            <b className="text-[#EDFF72] font-semibold">·</b>{' '}
            <span>Results &amp; progress</span>
          </div>
        </div>

        {/* Right Column: 3D Scene */}
        <div className="relative h-[min(520px,64vh)] max-h-[520px] w-full [perspective:1500px] flex items-center justify-center">
          <style>{`
            @keyframes isoBobbing {
              50% { transform: translateZ(calc(var(--k)*58px + 20px)); }
            }
            @keyframes billboardFloat {
              50% { transform: translateZ(var(--z)) translateY(-14px); }
            }
            @keyframes cubeRotate {
              from { transform: translateZ(110px) rotateX(20deg) rotateY(0deg); }
              to { transform: translateZ(110px) rotateX(380deg) rotateY(360deg); }
            }
            @keyframes orbitSpin {
              to { transform: rotateX(72deg) rotateZ(360deg); }
            }
          `}</style>

          <div
            style={{
              transform: `rotateX(${sceneRot.rx}deg) rotateY(${sceneRot.ry}deg)`,
              transition: 'transform 0.2s cubic-bezier(0.2, 0.7, 0.2, 1)',
              transformStyle: 'preserve-3d',
            }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            {/* 440px Dashed Orbit Ring with Glowing Lime Dot */}
            <div
              style={{
                width: 440,
                height: 440,
                transform: 'rotateX(72deg)',
                animation: shouldReduceMotion ? 'none' : 'orbitSpin 22s linear infinite',
                transformStyle: 'preserve-3d',
              }}
              className="absolute rounded-full border border-dashed border-[rgba(237,255,114,0.3)]"
              aria-hidden="true"
            >
              <i
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: -6,
                  marginLeft: -6,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#EDFF72',
                  boxShadow: '0 0 18px #EDFF72',
                }}
              />
            </div>

            {/* Isometric 3-Layer Stack (290x190px, rotateX(58deg) rotateZ(-32deg)) */}
            <div
              style={{
                width: 290,
                height: 190,
                transform: 'rotateX(58deg) rotateZ(-32deg)',
                transformStyle: 'preserve-3d',
              }}
              className="absolute"
              aria-hidden="true"
            >
              {/* Layer 0: Lime "Results" */}
              <div
                style={{
                  transform: 'translateZ(0px)',
                  animation: shouldReduceMotion ? 'none' : 'isoBobbing 6s ease-in-out infinite',
                  animationDelay: '0s',
                  background: 'rgba(237,255,114,0.92)',
                  color: '#2b3100',
                  border: 'none',
                  boxShadow: '0 30px 40px -10px rgba(0,0,0,0.65)',
                }}
                className="absolute inset-0 rounded-[18px] p-3.5 font-mono text-[9.5px] uppercase tracking-[0.08em] font-medium"
              >
                <span>Results</span>
                <i className="block h-2 rounded-[4px] bg-[rgba(0,0,0,0.16)] mt-2.5" />
                <i className="block h-2 rounded-[4px] bg-[rgba(0,0,0,0.16)] mt-2 w-[70%]" />
                <i className="block h-2 rounded-[4px] bg-[#111] mt-2 w-[46%]" />
              </div>

              {/* Layer 1: Dark "solution.js" */}
              <div
                style={{
                  transform: 'translateZ(58px)',
                  animation: shouldReduceMotion ? 'none' : 'isoBobbing 6s ease-in-out infinite',
                  animationDelay: '-1.4s',
                  background: 'rgba(22,24,28,0.9)',
                  color: '#8f938d',
                  border: '1px solid rgba(255,255,255,0.18)',
                  boxShadow: '0 30px 40px -10px rgba(0,0,0,0.65)',
                }}
                className="absolute inset-0 rounded-[18px] p-3.5 font-mono text-[9.5px] uppercase tracking-[0.08em] font-medium"
              >
                <span>solution.js</span>
                <i className="block h-2 rounded-[4px] bg-[rgba(255,255,255,0.1)] mt-2.5" />
                <i className="block h-2 rounded-[4px] bg-[rgba(255,255,255,0.1)] mt-2 w-[80%]" />
                <i className="block h-2 rounded-[4px] bg-[#EDFF72] mt-2 w-[46%]" />
                <i className="block h-2 rounded-[4px] bg-[rgba(255,255,255,0.1)] mt-2 w-[60%]" />
              </div>

              {/* Layer 2: White "Question 4 · MCQ" */}
              <div
                style={{
                  transform: 'translateZ(116px)',
                  animation: shouldReduceMotion ? 'none' : 'isoBobbing 6s ease-in-out infinite',
                  animationDelay: '-2.8s',
                  background: '#FFFFFF',
                  color: '#555555',
                  border: '1px solid rgba(255,255,255,0.18)',
                  boxShadow: '0 30px 40px -10px rgba(0,0,0,0.65)',
                }}
                className="absolute inset-0 rounded-[18px] p-3.5 font-mono text-[9.5px] uppercase tracking-[0.08em] font-medium"
              >
                <span>Question 4 · MCQ</span>
                <i className="block h-2 rounded-[4px] bg-[#E9ECE7] mt-2.5" />
                <i className="block h-2 rounded-[4px] bg-[#E9ECE7] mt-2 w-[75%]" />
                <i className="block h-2 rounded-[4px] bg-[#EDFF72] mt-2 w-[46%] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" />
              </div>
            </div>

            {/* Billboard Card 1: Top Right Dark "Average score 86%" (translateZ 130px) */}
            <div
              style={{
                transform: 'translateZ(130px)',
                animation: shouldReduceMotion ? 'none' : 'billboardFloat 6s ease-in-out infinite',
                animationDelay: '0s',
                right: '2%',
                top: '6%',
                width: '46%',
              }}
              className="absolute rounded-[18px] bg-[#191A1D] border border-white/15 p-3.5 text-white shadow-[0_30px_50px_-16px_rgba(0,0,0,0.7)]"
            >
              <small className="block text-[11px] text-[#9A9D97]">Average score</small>
              <div className="font-mono text-3xl font-semibold tracking-tight text-[#EDFF72]">86%</div>
              <small className="block text-[10px] text-[#9A9D97] mt-0.5">Sample result</small>
            </div>

            {/* Billboard Card 2: Left Middle White "Data Structures Midterm" (translateZ 150px) */}
            <div
              style={{
                transform: 'translateZ(150px)',
                animation: shouldReduceMotion ? 'none' : 'billboardFloat 6s ease-in-out infinite',
                animationDelay: '-3s',
                left: '2%',
                top: '14%',
                width: '46%',
              }}
              className="absolute rounded-[18px] bg-white p-3.5 text-[#171819] shadow-[0_30px_50px_-16px_rgba(0,0,0,0.7)]"
            >
              <small className="block text-[11px] text-[#777D78]">Available now</small>
              <b className="block text-xs sm:text-sm font-semibold tracking-tight text-[#171819] mt-0.5">
                Data Structures Midterm
              </b>
              <small className="block font-mono text-[10px] text-[#777D78] mt-1">TF-4821 · 90 mins</small>
            </div>

            {/* Billboard Card 3: Bottom Right Dark "Code runner ✓ Accepted · 3 / 3" (translateZ 170px) */}
            <div
              style={{
                transform: 'translateZ(170px)',
                animation: shouldReduceMotion ? 'none' : 'billboardFloat 6s ease-in-out infinite',
                animationDelay: '-1.5s',
                right: '8%',
                bottom: '10%',
                width: '44%',
              }}
              className="absolute rounded-[18px] bg-[#191A1D] border border-white/15 p-3.5 text-white shadow-[0_30px_50px_-16px_rgba(0,0,0,0.7)]"
            >
              <small className="block font-mono text-[10px] text-[#9A9D97]">Code runner</small>
              <b className="block text-xs font-bold text-[#EDFF72] mt-0.5">✓ Accepted · 3 / 3</b>
            </div>

            {/* 70px Rotating Cube (translateZ 110px, 16s linear) */}
            <div
              style={{
                width: 70,
                height: 70,
                left: '6%',
                bottom: '12%',
                transformStyle: 'preserve-3d',
                animation: shouldReduceMotion ? 'none' : 'cubeRotate 16s linear infinite',
              }}
              className="absolute"
              aria-hidden="true"
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: 'translateZ(35px)',
                  background: '#EDFF72',
                  color: '#111',
                  border: '1px solid rgba(0,0,0,0.2)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                T
              </div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: 'rotateY(90deg) translateZ(35px)',
                  background: '#FFFFFF',
                  color: '#111',
                  border: '1px solid rgba(0,0,0,0.2)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                F
              </div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: 'rotateY(180deg) translateZ(35px)',
                  background: '#EDFF72',
                  color: '#111',
                  border: '1px solid rgba(0,0,0,0.2)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                ✓
              </div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: 'rotateY(-90deg) translateZ(35px)',
                  background: '#FFFFFF',
                  color: '#111',
                  border: '1px solid rgba(0,0,0,0.2)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                A+
              </div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: 'rotateX(90deg) translateZ(35px)',
                  background: '#EDFF72',
                  color: '#111',
                  border: '1px solid rgba(0,0,0,0.2)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                ✦
              </div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: 'rotateX(-90deg) translateZ(35px)',
                  background: '#FFFFFF',
                  color: '#111',
                  border: '1px solid rgba(0,0,0,0.2)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                #
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Center Scroll Cue */}
      <div className="relative z-10 mx-auto text-center font-mono text-[10px] tracking-[0.24em] uppercase text-[#6B6F69] animate-bounce">
        SCROLL DOWN TO ENTER DASHBOARD ↓
      </div>
    </div>
  );
};

export default StudentHero;

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { LANDING_COPY } from './constants';

// Magnetic Button Wrapper
interface MagneticButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const MagneticButton: React.FC<MagneticButtonProps> = ({
  children,
  className = '',
  onClick,
}) => {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isFine, setIsFine] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsFine(window.matchMedia('(pointer: fine)').matches);
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!isFine || !btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      // 25% on X, 35% on Y
      setPos({ x: dx * 0.25, y: dy * 0.35 });
    },
    [isFine]
  );

  const handleMouseLeave = useCallback(() => {
    setPos({ x: 0, y: 0 });
  }, []);

  return (
    <motion.button
      ref={btnRef}
      type="button"
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: 'spring', stiffness: 250, damping: 20 }}
      className={`btn ${className}`}
    >
      {children}
    </motion.button>
  );
};

export const FinalCta: React.FC<{
  onGetStarted?: () => void;
  onBookDemo?: () => void;
}> = ({ onGetStarted, onBookDemo }) => {
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(bannerRef, { once: true, amount: 0.3 });

  const [prefersReduced, setPrefersReduced] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPrefersReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
  }, []);

  return (
    <section aria-labelledby="cta-title" className="w-full py-16 sm:py-24">
      <div
        ref={bannerRef}
        className="relative w-full rounded-[36px] sm:rounded-[40px] bg-[#121212] px-6 py-16 sm:px-12 sm:py-24 text-center overflow-hidden shadow-2xl border border-white/10"
      >
        {/* Slowly Drifting Lime Radial Glow (7s alternate loop) */}
        <motion.div
          animate={
            prefersReduced
              ? {}
              : {
                  x: [-60, 60, -60],
                  y: [-30, 40, -30],
                  scale: [1, 1.15, 1],
                }
          }
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="pointer-events-none absolute -inset-20 bg-[radial-gradient(ellipse_at_center,rgba(232,255,90,0.18)_0%,transparent_60%)] blur-2xl z-0"
          aria-hidden="true"
        />

        <div className="relative z-10 max-w-3xl mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.15] text-[#e8ff5a] text-xs font-mono font-bold tracking-wider uppercase backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              Academic Assessment Standard
            </span>
          </motion.div>

          <motion.h2
            id="cta-title"
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.045em] text-white leading-tight"
          >
            {LANDING_COPY.cta.h2}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-sm sm:text-base md:text-lg text-neutral-400 font-normal leading-relaxed max-w-xl mx-auto"
          >
            {LANDING_COPY.cta.subtext}
          </motion.p>

          {/* Magnetic CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="pt-4 flex flex-wrap items-center justify-center gap-4"
          >
            <MagneticButton
              onClick={onGetStarted}
              className="px-8 py-4 rounded-full bg-[#e8ff5a] hover:bg-[#d6ec4e] text-[#121212] font-semibold text-sm sm:text-base tracking-tight shadow-[0_0_24px_rgba(232,255,90,0.3)] hover:shadow-[0_0_32px_rgba(232,255,90,0.45)] cursor-pointer flex items-center gap-2 transition-colors"
            >
              <span>{LANDING_COPY.cta.primaryButton}</span>
              <ArrowRight className="w-4 h-4" />
            </MagneticButton>

            <MagneticButton
              onClick={onBookDemo}
              className="px-8 py-4 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.2] text-white font-medium text-sm sm:text-base tracking-tight backdrop-blur-md cursor-pointer transition-colors"
            >
              <span>{LANDING_COPY.cta.secondaryButton}</span>
            </MagneticButton>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default FinalCta;

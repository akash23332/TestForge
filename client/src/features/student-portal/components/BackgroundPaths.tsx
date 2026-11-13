import React, { useMemo, useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface FloatingPathProps {
  position: 1 | -1;
  strokeColor: string;
  isPaused: boolean;
  reducedMotion: boolean;
}

interface PathData {
  id: number;
  d: string;
  width: number;
  opacity: number;
  duration: number;
  delay: number;
}

const FloatingPathLayer: React.FC<FloatingPathProps> = ({
  position,
  strokeColor,
  isPaused,
  reducedMotion,
}) => {
  // Compute random durations and delays ONCE with useMemo
  const paths = useMemo<PathData[]>(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const a = 380 - i * 5 * position;
      const b = 189 + i * 6;
      const d = `M-${a} -${b}C-${a} -${b} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`;
      const width = Number((0.5 + i * 0.03).toFixed(2));
      const opacity = Number(Math.min(0.07 + i * 0.013, 0.42).toFixed(2));
      const duration = Number((20 + ((i * 17) % 10)).toFixed(1)); // deterministic pseudo-random 20-30s
      const delay = Number((-((i * 13) % 20)).toFixed(1)); // deterministic stagger

      return { id: i, d, width, opacity, duration, delay };
    });
  }, [position]);

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 696 316"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {paths.map((p) => {
        if (reducedMotion) {
          return (
            <path
              key={p.id}
              d={p.d}
              stroke={strokeColor}
              strokeWidth={p.width}
              strokeOpacity={0.1}
              fill="none"
            />
          );
        }

        return (
          <motion.path
            key={p.id}
            d={p.d}
            stroke={strokeColor}
            strokeWidth={p.width}
            strokeOpacity={p.opacity}
            fill="none"
            strokeDasharray="0.3 1"
            initial={{ pathOffset: 0 }}
            animate={
              isPaused
                ? { pathOffset: 0 }
                : { pathOffset: -1.3 }
            }
            transition={{
              duration: p.duration,
              repeat: Infinity,
              ease: "linear",
              delay: p.delay,
            }}
          />
        );
      })}
    </svg>
  );
};

export const BackgroundPaths: React.FC<{ isVisible?: boolean }> = ({ isVisible = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(media.matches);
      const listener = () => setReducedMotion(media.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isPaused = !isVisible || !inView || reducedMotion;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* Floating Paths Layer 1: Position 1, White Strokes */}
      <FloatingPathLayer
        position={1}
        strokeColor="#FFFFFF"
        isPaused={isPaused}
        reducedMotion={reducedMotion}
      />

      {/* Floating Paths Layer 2: Position -1, Electric Lime (#EDFF72) Strokes */}
      <FloatingPathLayer
        position={-1}
        strokeColor="#EDFF72"
        isPaused={isPaused}
        reducedMotion={reducedMotion}
      />

      {/* Vignette Layer */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background:
            'radial-gradient(ellipse at 28% 50%, rgba(11,12,14,.86) 0, rgba(11,12,14,.3) 55%, transparent 75%), radial-gradient(600px 420px at 78% 50%, rgba(237,255,114,.1), transparent 70%)',
        }}
      />
    </div>
  );
};

export default BackgroundPaths;

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LANDING_COPY } from './constants';

export const Marquee: React.FC = () => {
  const [prefersReduced, setPrefersReduced] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPrefersReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
  }, []);

  const items = LANDING_COPY.marquee;

  return (
    <div className="relative w-full py-8 sm:py-12 overflow-hidden pointer-events-auto select-none">
      {/* Tilted Dark Strip Container (-1.2deg) - Broad in height & full-bleed screen width across 100% screen */}
      <div
        style={{ transform: 'rotate(-1.2deg)' }}
        className="w-[240vw] -ml-[70vw] bg-[#121212] py-9 sm:py-10 md:py-11 border-y-2 border-white/10 shadow-2xl overflow-hidden"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <motion.div
          animate={
            prefersReduced
              ? {}
              : isPaused
              ? { x: 0 }
              : {
                  x: ['0%', '-50%'],
                }
          }
          transition={{
            duration: 28,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="flex items-center gap-12 whitespace-nowrap will-change-transform cursor-pointer"
        >
          {/* Render 4 times for seamless continuous loop */}
          {[...items, ...items, ...items, ...items].map((moduleName, idx) => (
            <div key={idx} className="flex items-center gap-12">
              <span className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-wider text-white uppercase font-mono">
                {moduleName}
              </span>
              <span className="text-[#e8ff5a] text-2xl sm:text-3xl font-black drop-shadow-[0_0_12px_rgba(232,255,90,0.6)]" aria-hidden="true">
                ✦
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default Marquee;

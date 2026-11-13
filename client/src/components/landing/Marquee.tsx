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
    <div className="relative w-screen -ml-4 md:-ml-[106px] lg:-ml-[116px] py-12 sm:py-16 overflow-hidden">
      {/* Tilted Dark Strip Container (-1.2deg) - Broad in height & full-bleed screen width */}
      <div
        style={{ transform: 'rotate(-1.2deg)' }}
        className="w-[125vw] -ml-[12.5vw] bg-[#121212] py-6 sm:py-7 border-y-2 border-white/10 shadow-2xl overflow-hidden"
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
          className="flex items-center gap-10 whitespace-nowrap will-change-transform cursor-pointer"
        >
          {/* Render twice for seamless loop */}
          {[...items, ...items, ...items, ...items].map((moduleName, idx) => (
            <div key={idx} className="flex items-center gap-10">
              <span className="text-base sm:text-lg md:text-xl font-extrabold tracking-wide text-white uppercase font-mono">
                {moduleName}
              </span>
              <span className="text-[#e8ff5a] text-xl font-black drop-shadow-[0_0_12px_rgba(232,255,90,0.6)]" aria-hidden="true">
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

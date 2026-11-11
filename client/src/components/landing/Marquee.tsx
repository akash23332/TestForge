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
    <div className="relative w-full py-12 sm:py-16 overflow-hidden">
      {/* Tilted Dark Strip Container (-1.2deg) */}
      <div
        style={{ transform: 'rotate(-1.2deg)' }}
        className="w-[105%] -ml-[2.5%] bg-[#121212] py-4 sm:py-5 border-y border-white/10 shadow-xl overflow-hidden"
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
          className="flex items-center gap-8 whitespace-nowrap will-change-transform cursor-pointer"
        >
          {/* Render twice for seamless loop */}
          {[...items, ...items, ...items, ...items].map((moduleName, idx) => (
            <div key={idx} className="flex items-center gap-8">
              <span className="text-sm sm:text-base md:text-lg font-bold tracking-tight text-white uppercase font-mono">
                {moduleName}
              </span>
              <span className="text-[#e8ff5a] text-lg font-black" aria-hidden="true">
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

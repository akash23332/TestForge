import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { LANDING_COPY, StatItem } from './constants';
import { useCountUp } from './hooks/useCountUp';

const StatCard: React.FC<{ item: StatItem; index: number; isInView: boolean }> = ({
  item,
  index,
  isInView,
}) => {
  const animatedValue = useCountUp(item.value, isInView, { duration: 1600 });

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.8,
        delay: index * 0.1,
        ease: [0.2, 0.7, 0.2, 1],
      }}
      className="bg-white rounded-[28px] p-7 sm:p-8 border border-[#e4e4de] shadow-xs flex flex-col justify-between"
    >
      <div>
        <div className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-[-0.05em] text-[#121212] flex items-baseline">
          <span>{animatedValue}</span>
          <span className="text-[#e8ff5a] drop-shadow-[0_0_12px_rgba(232,255,90,0.5)]">
            {item.suffix}
          </span>
        </div>

        <h3 className="text-base sm:text-lg font-bold tracking-tight text-[#121212] mt-3">
          {item.label}
        </h3>

        <p className="text-xs sm:text-sm text-[#8a8a85] mt-1 leading-relaxed">
          {item.description}
        </p>
      </div>
    </motion.div>
  );
};

export const Stats: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.2 });

  return (
    <section aria-labelledby="stats-title" className="w-full py-16 sm:py-20">
      <h2 id="stats-title" className="sr-only">
        Platform Statistics
      </h2>
      <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {LANDING_COPY.stats.map((item, idx) => (
          <StatCard key={item.label} item={item} index={idx} isInView={isInView} />
        ))}
      </div>
    </section>
  );
};

export default Stats;

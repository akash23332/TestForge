import React from 'react';
import { motion, useInView } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';
import { LANDING_COPY } from './constants';

export const HowItWorks: React.FC = () => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.15 });

  const steps = LANDING_COPY.howItWorks.steps;

  return (
    <section aria-labelledby="how-it-works-title" className="w-full py-16 sm:py-24">
      {/* Eyebrow and Header */}
      <div className="max-w-4xl mb-12 sm:mb-16">
        <div className="mb-4">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#121212]/[0.06] border border-[#121212]/[0.1] text-xs font-mono font-semibold uppercase tracking-wider text-[#121212]">
            <Sparkles className="h-3 w-3 text-[#121212]" />
            {LANDING_COPY.howItWorks.eyebrow}
          </span>
        </div>

        <h2
          id="how-it-works-title"
          className="text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.045em] text-[#121212] leading-[1.05]"
        >
          {LANDING_COPY.howItWorks.h2}
        </h2>
      </div>

      {/* 3 Numbered Step Cards Staggered In */}
      <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {steps.map((step, idx) => (
          <motion.div
            key={step.number}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
            transition={{
              duration: 0.8,
              delay: idx * 0.09, // 90ms stagger
              ease: [0.2, 0.7, 0.2, 1],
            }}
            className="relative bg-white rounded-[28px] p-7 sm:p-8 border border-[#e4e4de] shadow-xs flex flex-col justify-between group hover:border-[#121212]/30 transition-all duration-300"
          >
            <div>
              {/* Dark Circular Number Badge */}
              <div className="w-12 h-12 rounded-full bg-[#121212] text-white flex items-center justify-center font-mono font-bold text-sm mb-6 group-hover:bg-[#e8ff5a] group-hover:text-[#121212] transition-colors duration-300">
                {step.number}
              </div>

              <h3 className="text-xl font-bold tracking-tight text-[#121212] mb-2.5">
                {step.title}
              </h3>

              <p className="text-sm text-[#8a8a85] leading-relaxed">
                {step.description}
              </p>
            </div>

            <div className="pt-6 mt-6 border-t border-neutral-100 flex items-center gap-2 text-xs font-semibold text-[#121212]">
              <span>Step {idx + 1} of 3</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#8a8a85] group-hover:translate-x-1 transition-transform" />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default HowItWorks;

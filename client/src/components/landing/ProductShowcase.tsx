import React from 'react';
import { motion, useInView } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { LANDING_COPY } from './constants';
import { DashboardMock } from './DashboardMock';

export const ProductShowcase: React.FC = () => {
  const textRef = React.useRef<HTMLDivElement | null>(null);
  const isInView = useInView(textRef, { once: true, amount: 0.3 });

  return (
    <section aria-labelledby="product-showcase-title" className="w-full pt-10 sm:pt-14 pb-16">
      {/* Header Info */}
      <div ref={textRef} className="max-w-4xl mb-12 sm:mb-16">
        {/* Eyebrow Pill */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
          className="mb-4"
        >
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#121212]/[0.06] border border-[#121212]/[0.1] text-xs font-mono font-semibold uppercase tracking-wider text-[#121212]">
            <Sparkles className="h-3 w-3 text-[#121212]" />
            {LANDING_COPY.productShowcase.eyebrow}
          </span>
        </motion.div>

        {/* H2 with Sweeping Lime Marker */}
        <motion.h2
          id="product-showcase-title"
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.2, 0.7, 0.2, 1] }}
          className="text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.045em] text-[#121212] leading-[1.05]"
        >
          {LANDING_COPY.productShowcase.h2Prefix}
          <span className="relative inline-block px-1">
            <motion.span
              initial={{ scaleX: 0 }}
              animate={isInView ? { scaleX: 1 } : {}}
              transition={{ duration: 0.75, delay: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
              style={{ originX: 0 }}
              className="absolute inset-x-0 bottom-1 sm:bottom-2 h-3.5 sm:h-5 bg-[#e8ff5a] -z-0 rounded-sm"
              aria-hidden="true"
            />
            <span className="relative z-10">{LANDING_COPY.productShowcase.h2Highlight}</span>
          </span>
          {LANDING_COPY.productShowcase.h2Suffix}
        </motion.h2>

        {/* Lead Paragraph */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
          className="mt-5 text-[#8a8a85] text-base sm:text-lg leading-relaxed max-w-2xl font-normal"
        >
          {LANDING_COPY.productShowcase.lead}
        </motion.p>
      </div>

      {/* Dashboard Mock */}
      <DashboardMock />
    </section>
  );
};

export default ProductShowcase;

import React from 'react';
import { motion, useInView } from 'framer-motion';
import {
  BookOpen,
  FlaskConical,
  TestTube,
  FileText,
  BarChart2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Code2,
  Sliders,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { LANDING_COPY } from './constants';
import { useSpotlight } from './hooks/useSpotlight';

// Individual Bento Card with 3D Tilt + Lime Spotlight
interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  theme?: 'white' | 'lime' | 'dark';
}

const BentoCard: React.FC<BentoCardProps> = ({
  children,
  className = '',
  theme = 'white',
}) => {
  const { cardRef, cardStyle, isHovered, handlePointerMove, handlePointerLeave } = useSpotlight({
    maxTilt: 8,
    perspective: 900,
    lift: 6,
  });

  const themeClasses = {
    white: 'bg-white text-[#121212] border border-[#e4e4de]',
    lime: 'bg-[#e8ff5a] text-[#121212] border border-[#d6ec4e]',
    dark: 'bg-[#121212] text-white border border-white/10',
  }[theme];

  return (
    <div
      ref={cardRef}
      style={cardStyle}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`relative rounded-[28px] p-6 sm:p-8 overflow-hidden transition-shadow duration-300 ${
        isHovered ? 'shadow-[0_20px_50px_rgba(0,0,0,0.12)]' : 'shadow-xs'
      } ${themeClasses} ${className}`}
    >
      <div className="relative z-10 flex flex-col justify-between h-full">{children}</div>
    </div>
  );
};

export const FeatureBento: React.FC = () => {
  const sectionRef = React.useRef<HTMLDivElement | null>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.15 });

  return (
    <section aria-labelledby="features-title" className="w-full py-16 sm:py-24">
      {/* Header */}
      <div ref={sectionRef} className="max-w-4xl mb-12 sm:mb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-4"
        >
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#121212]/[0.06] border border-[#121212]/[0.1] text-xs font-mono font-semibold uppercase tracking-wider text-[#121212]">
            <Sparkles className="h-3 w-3 text-[#121212]" />
            {LANDING_COPY.features.eyebrow}
          </span>
        </motion.div>

        <motion.h2
          id="features-title"
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.045em] text-[#121212] leading-[1.05]"
        >
          {LANDING_COPY.features.h2Prefix}
          <span className="relative inline-block px-1">
            <motion.span
              initial={{ scaleX: 0 }}
              animate={isInView ? { scaleX: 1 } : {}}
              transition={{ duration: 0.75, delay: 0.35 }}
              style={{ originX: 0 }}
              className="absolute inset-x-0 bottom-1 sm:bottom-2 h-3.5 sm:h-5 bg-[#e8ff5a] -z-0 rounded-sm"
              aria-hidden="true"
            />
            <span className="relative z-10">{LANDING_COPY.features.h2Highlight}</span>
          </span>
          {LANDING_COPY.features.h2Suffix}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-5 text-[#8a8a85] text-base sm:text-lg leading-relaxed max-w-2xl font-normal"
        >
          {LANDING_COPY.features.lead}
        </motion.p>
      </div>

      {/* 12-Column Bento Grid (Collapses on <900px) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* 1. Question Bank (8 cols, White) */}
        <BentoCard theme="white" className="lg:col-span-8 min-h-[320px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="w-10 h-10 rounded-2xl bg-[#121212] text-[#e8ff5a] flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </span>
              <span className="text-xs font-mono font-bold bg-[#f1f1ee] px-3 py-1 rounded-full text-[#121212]">
                Zero-Leak Bank
              </span>
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-[#121212]">
              Centralized Question Bank
            </h3>
            <p className="text-sm text-[#8a8a85] mt-1 max-w-lg">
              Manage algorithmic problems with verified reference solutions. Hidden boundary tests
              are stripped automatically before serving student candidates.
            </p>
          </div>

          {/* Tag Chips */}
          <div className="mt-8 pt-6 border-t border-neutral-100">
            <span className="text-[11px] font-mono text-[#8a8a85] uppercase tracking-wider block mb-2.5">
              Topic taxonomy & metadata
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                'Binary Search',
                'Dynamic Programming',
                'Trees & Graphs',
                'Hash Map',
                'Bit Manipulation',
                'Sliding Window',
              ].map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-medium px-3 py-1 rounded-full bg-[#f1f1ee] text-[#121212] hover:bg-[#e8ff5a] transition-colors cursor-pointer"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </BentoCard>

        {/* 2. Test Studio (4 cols, Lime) */}
        <BentoCard theme="lime" className="lg:col-span-4 min-h-[320px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="w-10 h-10 rounded-2xl bg-[#121212] text-[#e8ff5a] flex items-center justify-center">
                <FlaskConical className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold bg-white text-[#121212] px-3 py-1 rounded-full">
                Test Studio
              </span>
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-[#121212]">
              8 Live Slots
            </h3>
            <p className="text-sm text-[#121212]/80 mt-1">
              Verify solution coverage with sample, boundary, and edge-case suites in one click.
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-[#121212]/15">
            <div className="grid grid-cols-4 gap-2">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded-xl bg-[#121212] text-[#e8ff5a] flex items-center justify-center text-xs font-mono font-bold"
                >
                  #{i + 1}
                </div>
              ))}
            </div>
          </div>
        </BentoCard>

        {/* 3. Mutation Lab (6 cols, Dark) */}
        <BentoCard theme="dark" className="lg:col-span-6 min-h-[320px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="w-10 h-10 rounded-2xl bg-[#262626] text-[#e8ff5a] flex items-center justify-center">
                <TestTube className="w-5 h-5" />
              </span>
              <span className="text-xs font-mono font-bold bg-[#e8ff5a] text-[#121212] px-3 py-1 rounded-full">
                AST Defects
              </span>
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-white">
              Deterministic Mutation Lab
            </h3>
            <p className="text-sm text-neutral-400 mt-1">
              Inject synthetic arithmetic and logical mutants into your code to test if student tests catch them.
            </p>
          </div>

          {/* Code Snippet with Highlighted Bug Line */}
          <div className="mt-6 p-4 rounded-2xl bg-[#1a1a1a] border border-white/10 font-mono text-xs text-neutral-300">
            <div className="text-neutral-500">// Mutator: BinaryOpReplacement</div>
            <div>const mid = Math.floor((left + right) / 2);</div>
            <div className="bg-rose-500/20 text-rose-300 px-2 py-1 rounded-md my-1 border-l-2 border-rose-500 flex items-center justify-between">
              <span>- if (nums[mid] &lt;= target) left = mid - 1;</span>
              <span className="text-[10px] text-rose-400 font-bold uppercase">Mutant Alive</span>
            </div>
            <div className="text-emerald-400">+ if (nums[mid] === target) return mid;</div>
          </div>
        </BentoCard>

        {/* 4. Paper Designer (3 cols, White) */}
        <BentoCard theme="white" className="lg:col-span-3 min-h-[320px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="w-10 h-10 rounded-2xl bg-[#121212] text-[#e8ff5a] flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </span>
              <span className="text-xs font-mono font-bold bg-[#f1f1ee] px-2.5 py-0.5 rounded-full text-[#121212]">
                Designer
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-[#121212]">
              Paper Designer
            </h3>
            <p className="text-xs text-[#8a8a85] mt-1">
              Bundle coding and MCQs with weighted sections.
            </p>
          </div>

          {/* Skeleton Paper Lines */}
          <div className="mt-6 p-3.5 rounded-2xl bg-[#f7f7f4] border border-[#e4e4de] space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#121212]">
              <span>Midterm Assessment</span>
              <span className="text-[#8a8a85]">90 min</span>
            </div>
            <div className="h-2 w-3/4 bg-[#e2e2dc] rounded-full" />
            <div className="h-2 w-1/2 bg-[#e2e2dc] rounded-full" />
            <div className="pt-2 border-t border-[#e2e2dc] flex justify-between text-[10px] font-mono text-[#666]">
              <span>Section A (MCQs): 40 pts</span>
              <span>Section B: 60 pts</span>
            </div>
          </div>
        </BentoCard>

        {/* 5. Student Analytics (3 cols, White) */}
        <BentoCard theme="white" className="lg:col-span-3 min-h-[320px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="w-10 h-10 rounded-2xl bg-[#121212] text-[#e8ff5a] flex items-center justify-center">
                <BarChart2 className="w-5 h-5" />
              </span>
              <span className="text-xs font-mono font-bold bg-[#f1f1ee] px-2.5 py-0.5 rounded-full text-[#121212]">
                Analytics
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-[#121212]">
              Student Analytics
            </h3>
            <p className="text-xs text-[#8a8a85] mt-1">
              Real-time cohort distribution and test case accuracy.
            </p>
          </div>

          {/* Mini Bar Chart */}
          <div className="mt-6 p-3.5 rounded-2xl bg-[#f7f7f4] border border-[#e4e4de]">
            <div className="text-[10px] font-mono text-emerald-600 font-bold mb-2">
              Cohort Avg: 84.4%
            </div>
            <div className="h-16 flex items-end justify-between gap-1.5 px-1">
              {[40, 65, 80, 95, 75, 55].map((val, idx) => (
                <div
                  key={idx}
                  style={{ height: `${val}%` }}
                  className={`flex-1 rounded-t-sm ${
                    idx === 3 ? 'bg-[#121212]' : 'bg-[#e8ff5a]'
                  }`}
                />
              ))}
            </div>
          </div>
        </BentoCard>
      </div>
    </section>
  );
};

export default FeatureBento;

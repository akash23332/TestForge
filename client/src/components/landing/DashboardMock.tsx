import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
  AnimatePresence,
} from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  FlaskConical,
  TestTube,
  FileText,
  ClipboardList,
  Sparkles,
  ArrowUpRight,
  Plus,
  Play,
  CheckCircle2,
  Activity,
  Layers,
  FilePlus,
  ChevronRight,
} from 'lucide-react';
import { LANDING_COPY } from './constants';
import { useCountUp } from './hooks/useCountUp';

export const DashboardMock: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.2 });

  // Check reduced motion
  const [prefersReduced, setPrefersReduced] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPrefersReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
  }, []);

  // 1. Scroll-driven 3D tilt flattening
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'center center'],
  });

  const rawRotateX = useTransform(scrollYProgress, [0, 1], [16, 0]);
  const rawScale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
  const rawY = useTransform(scrollYProgress, [0, 1], [30, 0]);

  const smoothRotateX = useSpring(rawRotateX, { stiffness: 120, damping: 28 });
  const smoothScale = useSpring(rawScale, { stiffness: 120, damping: 28 });
  const smoothY = useSpring(rawY, { stiffness: 120, damping: 28 });

  // 2. Base Count-up values
  const baseQuestionCount = useCountUp(148, isInView, { duration: 1400 });
  const baseExamCount = useCountUp(12, isInView, { duration: 1200 });
  const baseMutationScore = useCountUp(94, isInView, { duration: 1500 });

  // 3. Live incrementing question count after reveal
  const [liveBonusQuestions, setLiveBonusQuestions] = useState(0);
  const [isPopping, setIsPopping] = useState(false);

  // 4. Live chart heights (7 days)
  const initialChartHeights = [38, 62, 45, 85, 70, 92, 78];
  const [chartBars, setChartBars] = useState<number[]>(initialChartHeights);

  // 5. Floating notification card cycling state
  const [notifRightIndex, setNotifRightIndex] = useState(0);

  // Live intervals management (pause on document hidden or offscreen)
  useEffect(() => {
    if (prefersReduced || !isInView) return;

    let questionTimer: NodeJS.Timeout;
    let chartTimer: NodeJS.Timeout;
    let notifTimer: NodeJS.Timeout;

    const startIntervals = () => {
      // Increment questions by 1-3 every 2.6s
      questionTimer = setInterval(() => {
        if (document.hidden) return;
        setLiveBonusQuestions((prev) => prev + Math.floor(Math.random() * 3) + 1);
        setIsPopping(true);
        setTimeout(() => setIsPopping(false), 300);
      }, 2600);

      // Re-randomize chart bars every 2.2s
      chartTimer = setInterval(() => {
        if (document.hidden) return;
        setChartBars((prev) =>
          prev.map((h) => {
            const delta = (Math.random() - 0.5) * 28;
            return Math.min(96, Math.max(22, Math.round(h + delta)));
          })
        );
      }, 2200);

      // Cycle floating notification card every 3.2s
      notifTimer = setInterval(() => {
        if (document.hidden) return;
        setNotifRightIndex((prev) => (prev + 1) % LANDING_COPY.mock.floatingRight.length);
      }, 3200);
    };

    startIntervals();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(questionTimer);
        clearInterval(chartTimer);
        clearInterval(notifTimer);
      } else {
        startIntervals();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(questionTimer);
      clearInterval(chartTimer);
      clearInterval(notifTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isInView, prefersReduced]);

  const totalQuestionsDisplay = baseQuestionCount + liveBonusQuestions;

  return (
    <div
      ref={containerRef}
      className="relative w-full py-6 select-none"
      style={{ perspective: 1200 }}
    >

      {/* ── FLOATING CARD 2 (RIGHT) ── */}
      <motion.div
        animate={
          prefersReduced
            ? {}
            : {
                y: [0, 14, 0],
              }
        }
        transition={{
          duration: 5.4,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.5,
        }}
        className="hidden lg:flex absolute -right-6 bottom-20 z-30 items-center gap-3 bg-[#121212]/90 text-white backdrop-blur-md border border-white/15 px-4 py-3 rounded-2xl shadow-2xl"
      >
        <div className="w-8 h-8 rounded-xl bg-[#e8ff5a] text-[#121212] flex items-center justify-center font-bold">
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono tracking-widest text-neutral-400 block">
            Verification
          </span>
          <div className="h-5 overflow-hidden relative">
            <AnimatePresence mode="wait">
              <motion.span
                key={notifRightIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="text-xs font-semibold text-[#e8ff5a] block truncate"
              >
                {LANDING_COPY.mock.floatingRight[notifRightIndex]}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* ── MAIN BROWSER-STYLE DASHBOARD FRAME (#e6e6e2) ── */}
      <motion.div
        style={
          prefersReduced
            ? {}
            : {
                rotateX: smoothRotateX,
                scale: smoothScale,
                y: smoothY,
              }
        }
        className="relative w-full rounded-[32px] sm:rounded-[36px] bg-[#e6e6e2] p-2.5 sm:p-4 border border-[#d8d8d2] shadow-[0_24px_70px_rgba(0,0,0,0.18)]"
      >
        {/* Browser Top Chrome Pills / Dots */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#d8d8d2]/70 mb-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-[#dcdcd6] px-4 py-1 rounded-full text-[11px] font-mono text-[#555] border border-[#d0d0c8]">
            <span>testforge.faculty/app/workspace</span>
          </div>
          <div className="w-8" />
        </div>

        {/* Dashboard Shell Inner: Main Content */}
        <div className="w-full min-h-[580px] flex">
          {/* ── DASHBOARD MAIN CONTENT CANVAS ── */}
          <div className="flex-1 w-full bg-[#f7f7f4] rounded-[26px] p-4 sm:p-6 lg:p-7 border border-[#dfdfd8] flex flex-col justify-between overflow-hidden">
            {/* 1. Header Tabs Row */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-3 border-b border-[#e2e2da] scrollbar-none">
              {LANDING_COPY.mock.tabs.map((tab, idx) => (
                <span
                  key={tab}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    idx === 0
                      ? 'bg-[#121212] text-white shadow-xs'
                      : 'text-[#666] hover:bg-[#e8e8e2] hover:text-[#121212]'
                  }`}
                >
                  {tab}
                </span>
              ))}
            </div>

            {/* 2. Workspace Title & CTA */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 mb-5">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-[#121212] flex items-center gap-2">
                  <span>{LANDING_COPY.mock.title}</span>
                </h3>
                <p className="text-xs text-[#777] mt-0.5">
                  Spring semester assessment pool · Active deterministic grading
                </p>
              </div>

              <button
                type="button"
                className="self-start sm:self-auto px-4 py-2 rounded-full bg-[#121212] hover:bg-[#252525] text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-transform active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 text-[#e8ff5a]" />
                <span>{LANDING_COPY.mock.createCta}</span>
              </button>
            </div>

            {/* 3. Three Stat Cards (White, Lime, Dark) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 mb-5">
              {/* Card 1: Question Bank (White Card with 8 Slot Bars) */}
              <div className="bg-white rounded-[22px] p-4 sm:p-5 border border-[#e4e4de] shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-[#666]">
                  <span className="flex items-center gap-1.5 text-[#121212]">
                    <BookOpen className="w-3.5 h-3.5 text-[#121212]" />
                    Question Bank
                  </span>
                  <span className="font-mono text-[11px] text-emerald-600 font-bold">● Active</span>
                </div>

                <div className="my-3">
                  <motion.div
                    animate={isPopping ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#121212]"
                  >
                    {totalQuestionsDisplay}
                  </motion.div>
                  <span className="text-[11px] text-[#777] font-medium block mt-0.5">
                    Verified algorithmic challenges
                  </span>
                </div>

                {/* 8 Slot Bars Staggered Fill */}
                <div className="grid grid-cols-8 gap-1 pt-2 border-t border-neutral-100">
                  {[...Array(8)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={prefersReduced ? {} : { scaleY: 0 }}
                      animate={isInView ? { scaleY: 1 } : {}}
                      transition={{
                        duration: 0.4,
                        delay: 0.15 + i * 0.12, // 120ms stagger
                        ease: 'easeOut',
                      }}
                      style={{ originY: 1 }}
                      className={`h-4 rounded-md ${
                        i < 6 ? 'bg-[#121212]' : 'bg-[#e2e2dc]'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Card 2: Examinations (Lime Card #e8ff5a) */}
              <div className="bg-[#e8ff5a] rounded-[22px] p-4 sm:p-5 border border-[#d6ec4e] shadow-xs flex flex-col justify-between text-[#121212]">
                <div className="flex items-center justify-between text-xs font-bold text-[#121212]">
                  <span className="flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-[#121212]" />
                    Examinations
                  </span>
                  <span className="text-[10px] bg-white px-2 py-0.5 rounded-full font-bold">
                    Scheduled
                  </span>
                </div>

                <div className="my-3">
                  <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#121212]">
                    {baseExamCount}
                  </div>
                  <span className="text-[11px] font-semibold text-[#121212]/80 block mt-0.5">
                    Live proctored sessions
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-semibold pt-2 border-t border-[#121212]/15">
                  <span className="text-[11px]">Average Score</span>
                  <span className="font-mono font-bold">84.2%</span>
                </div>
              </div>

              {/* Card 3: Mutation Lab (Dark Card #121212 with rotating orbit ring) */}
              <div className="bg-[#121212] rounded-[22px] p-4 sm:p-5 border border-white/10 shadow-xs flex flex-col justify-between text-white relative overflow-hidden">
                <div className="flex items-center justify-between text-xs font-semibold text-neutral-300 relative z-10">
                  <span className="flex items-center gap-1.5 text-white">
                    <TestTube className="w-3.5 h-3.5 text-[#e8ff5a]" />
                    Mutation Lab
                  </span>
                  <span className="text-[10px] text-[#e8ff5a] font-mono">AST Engine</span>
                </div>

                <div className="my-3 relative z-10">
                  <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-baseline gap-1">
                    <span>{baseMutationScore}</span>
                    <span className="text-lg text-[#e8ff5a] font-bold">%</span>
                  </div>
                  <span className="text-[11px] text-neutral-400 font-medium block mt-0.5">
                    Mutant kill rate score
                  </span>
                </div>

                {/* Rotating Orbit Ring in background */}
                <motion.div
                  animate={
                    prefersReduced
                      ? {}
                      : {
                          rotate: 360,
                        }
                  }
                  transition={{
                    duration: 16,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full border border-dashed border-[#e8ff5a]/30 pointer-events-none"
                >
                  <span className="absolute top-1 left-3 w-2.5 h-2.5 rounded-full bg-[#e8ff5a] shadow-[0_0_8px_#e8ff5a]" />
                </motion.div>

                <div className="flex items-center justify-between text-xs text-neutral-400 pt-2 border-t border-white/10 relative z-10">
                  <span>Loophole catch</span>
                  <span className="text-[#e8ff5a] font-bold">48/51 mutants</span>
                </div>
              </div>
            </div>

            {/* 4. Bottom Grid: Quick Actions + Activity Bar Chart */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 sm:gap-4">
              {/* Quick Actions List (5 cols) */}
              <div className="md:col-span-5 bg-white rounded-[20px] p-4 border border-[#e4e4de]">
                <span className="text-xs font-bold text-[#121212] block mb-2.5">
                  Quick Actions
                </span>
                <div className="space-y-1.5">
                  {[
                    { label: 'Create Coding Problem', icon: FilePlus },
                    { label: 'Import Bulk MCQs (.csv)', icon: Layers },
                    { label: 'Design Examination Paper', icon: FileText },
                  ].map((action, i) => {
                    const Icon = action.icon;
                    return (
                      <div
                        key={action.label}
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-[#f5f5f1] transition-colors cursor-pointer text-xs font-semibold text-[#222]"
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-[#666]" />
                          <span>{action.label}</span>
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#999]" />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Activity Bar Chart (7 cols, re-randomizing smoothly) */}
              <div className="md:col-span-7 bg-white rounded-[20px] p-4 border border-[#e4e4de] flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#121212] flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-neutral-700" />
                    7-Day Student Submissions
                  </span>
                  <span className="text-[10px] font-mono text-emerald-600 font-bold">
                    +18% this week
                  </span>
                </div>

                <div className="h-24 flex items-end justify-between gap-2 pt-2 px-1">
                  {chartBars.map((height, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <motion.div
                        initial={prefersReduced ? { height: `${height}%` } : { height: '0%' }}
                        animate={isInView ? { height: `${height}%` } : {}}
                        transition={{
                          duration: 0.7,
                          delay: prefersReduced ? 0 : 0.2 + i * 0.07, // 70ms stagger
                          ease: [0.2, 0.7, 0.2, 1],
                        }}
                        className={`w-full rounded-t-md transition-colors ${
                          i === 5 ? 'bg-[#121212]' : 'bg-[#e8ff5a]'
                        }`}
                      />
                      <span className="text-[9px] text-neutral-400 font-mono">
                        {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DashboardMock;

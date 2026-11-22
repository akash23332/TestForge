import React, { useState, useEffect, useRef, useCallback } from 'react';
import './landing-below.css';
import {
  Sparkles,
  BookOpen,
  FlaskConical,
  TestTube,
  FileText,
  BarChart3,
  Check,
  Play,
  RotateCw,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle
} from 'lucide-react';

const MANIFESTO_WORDS = [
  'TestForge', 'brings', 'the', 'whole', 'exam', 'lifecycle', 'together.',
  'Create', 'the', 'questions,', 'conduct', 'the', 'test,',
  'evaluate', 'every', 'submission,', 'all', 'in', 'one', 'place.'
];

const TOUR_ITEMS = [
  {
    num: '01',
    title: 'AI Question Generator',
    desc: 'Generate questions from selected topics, difficulty levels and question types using AI.',
    icon: Sparkles
  },
  {
    num: '02',
    title: 'Smart Question Bank',
    desc: 'Organize, categorize and reuse questions in different assessments.',
    icon: BookOpen
  },
  {
    num: '03',
    title: 'Coding Test Studio',
    desc: 'Create programming challenges with test cases, time limits and automated evaluation.',
    icon: FlaskConical
  },
  {
    num: '04',
    title: 'Mutation Lab',
    desc: 'Evaluate the effectiveness of test cases through mutation testing.',
    icon: TestTube
  },
  {
    num: '05',
    title: 'Paper Designer',
    desc: 'Design structured examination papers using selected questions and marking schemes.',
    icon: FileText
  },
  {
    num: '06',
    title: 'Performance Analytics',
    desc: 'Understand student scores, assessment performance and progress through analytics.',
    icon: BarChart3
  }
];

const CODE_LANGUAGES = ['Java', 'C++', 'Python', 'JavaScript'];

const CODE_SNIPPETS = {
  Java: [
    { num: 1, text: 'public class Solution {' },
    { num: 2, text: '    public static int countEven(int[] nums) {' },
    { num: 3, text: '        int count = 0;' },
    { num: 4, text: '        for (int n : nums) {' },
    { num: 5, text: '            if (n % 2 == 0) count++;' },
    { num: 6, text: '        }' },
    { num: 7, text: '        return count;' },
    { num: 8, text: '    }' },
    { num: 9, text: '}' }
  ],
  'C++': [
    { num: 1, text: '#include <vector>' },
    { num: 2, text: 'int countEven(const std::vector<int>& nums) {' },
    { num: 3, text: '    int count = 0;' },
    { num: 4, text: '    for (int n : nums) {' },
    { num: 5, text: '        if (n % 2 == 0) count++;' },
    { num: 6, text: '    }' },
    { num: 7, text: '    return count;' },
    { num: 8, text: '}' }
  ],
  Python: [
    { num: 1, text: 'def count_even(nums: list[int]) -> int:' },
    { num: 2, text: '    # Count numbers divisible by 2' },
    { num: 3, text: '    return sum(1 for n in nums if n % 2 == 0)' }
  ],
  JavaScript: [
    { num: 1, text: 'function countEven(nums) {' },
    { num: 2, text: '  // Count numbers divisible by 2' },
    { num: 3, text: '  return nums.filter(n => n % 2 === 0).length;' },
    { num: 4, text: '}' }
  ]
};

const MUTATION_OPERATORS = ['==', '!=', '>', '=='];

const FAQ_ITEMS = [
  {
    q: 'What is TestForge?',
    a: 'An assessment platform for creating, conducting and evaluating tests.'
  },
  {
    q: 'Who can use TestForge?',
    a: 'Teachers, students and authorized administrators.'
  },
  {
    q: 'Can students attempt coding questions?',
    a: 'Yes, through the integrated coding assessment environment.'
  },
  {
    q: 'How can students join a test?',
    a: 'Through a test code, subject to the teacher’s test settings.'
  },
  {
    q: 'Can teachers generate questions using AI?',
    a: 'Yes, through the AI Question Generator.'
  }
];

export const LandingBelowHero = ({
  onJoinTest,
  onNavigateTeacherLogin,
  onNavigateStudentPortal
}) => {
  // ── 1. Scroll-driven Manifesto Word Lighting ──
  const manifestoRef = useRef(null);
  const [manifestoLitCount, setManifestoLitCount] = useState(0);

  // ── 2. Pinned Tour State ──
  const tourWrapperRef = useRef(null);
  const [tourProgress, setTourProgress] = useState(0);
  const [activeTourIndex, setActiveTourIndex] = useState(0);

  // ── Mutation Lab Scene State ──
  const [mutationStep, setMutationStep] = useState(0);
  const [mutationGlitch, setMutationGlitch] = useState(false);

  // ── 3. Two-Sided Switch State ──
  const [activeRole, setActiveRole] = useState('educators'); // 'educators' | 'students'
  const [isSpinning, setIsSpinning] = useState(false);
  const [renderedRole, setRenderedRole] = useState('educators');

  // ── 4. Code Runner State ──
  const [activeLang, setActiveLang] = useState('Java');
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [runIteration, setRunIteration] = useState(0);
  const [codeTestResults, setCodeTestResults] = useState(null);
  const [burstParticles, setBurstParticles] = useState([]);
  const ideRef = useRef(null);

  // ── 5. Analytics State ──
  const [analyticsCountProgress, setAnalyticsCountProgress] = useState(false);

  // ── 7. FAQ State ──
  const [openFaqIndex, setOpenFaqIndex] = useState(null);

  // ── Shared rAF-throttled Scroll Handler ──
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const vh = window.innerHeight || 800;

        // 1. Manifesto Word Progress
        if (manifestoRef.current) {
          const rect = manifestoRef.current.getBoundingClientRect();
          const progress = Math.min(
            Math.max((vh * 0.88 - rect.top) / (vh * 0.5 + rect.height * 0.6), 0),
            1
          );
          const lit = Math.round(progress * MANIFESTO_WORDS.length);
          setManifestoLitCount(lit);
        }

        // 2. Pinned Product Tour Progress
        if (tourWrapperRef.current) {
          const rect = tourWrapperRef.current.getBoundingClientRect();
          const totalDistance = rect.height - vh;
          if (totalDistance > 0) {
            const p = Math.min(Math.max(-rect.top / totalDistance, 0), 0.999);
            setTourProgress(p);
            setActiveTourIndex(Math.floor(p * 6));
          }
        }

        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Mutation Lab 2.2s Cycler with Glitch ──
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = setInterval(() => {
      setMutationGlitch(true);
      setTimeout(() => {
        setMutationStep((prev) => (prev + 1) % MUTATION_OPERATORS.length);
        setMutationGlitch(false);
      }, 180);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  // ── Two-Sided Switch Animation Handler ──
  const handleRoleToggle = (targetRole) => {
    if (targetRole === activeRole || isSpinning) return;
    setActiveRole(targetRole);
    setIsSpinning(true);
    // Swap content at midpoint of spin (350ms of 700ms)
    setTimeout(() => {
      setRenderedRole(targetRole);
    }, 350);
    setTimeout(() => {
      setIsSpinning(false);
    }, 700);
  };

  // ── Code Runner Run Action Handler ──
  const handleRunCode = () => {
    if (isRunningCode) return;
    setIsRunningCode(true);
    setCodeTestResults(null);
    setBurstParticles([]);

    setTimeout(() => {
      setIsRunningCode(false);
      const isSecondRun = runIteration % 2 === 1;

      if (!isSecondRun) {
        // First run: All 3 Accepted
        setCodeTestResults({
          status: 'Accepted · 3 / 3 passed',
          allPassed: true,
          cases: [
            { id: 1, name: 'Sample Case 1', in: '[1, 2, 3, 4]', expected: '2', actual: '2', passed: true },
            { id: 2, name: 'Sample Case 2', in: '[2, 4, 6, 8]', expected: '4', actual: '4', passed: true },
            { id: 3, name: 'Sample Case 3', in: '[1, 3, 5, 7]', expected: '0', actual: '0', passed: true }
          ]
        });

        // 18-particle lime burst
        const particles = Array.from({ length: 18 }).map((_, i) => ({
          id: i,
          angle: (i / 18) * Math.PI * 2,
          distance: 28 + Math.random() * 32
        }));
        setBurstParticles(particles);
      } else {
        // Second run: Case 3 Wrong Answer
        setCodeTestResults({
          status: 'Wrong Answer · 2 / 3 passed',
          allPassed: false,
          cases: [
            { id: 1, name: 'Sample Case 1', in: '[1, 2, 3, 4]', expected: '2', actual: '2', passed: true },
            { id: 2, name: 'Sample Case 2', in: '[2, 4, 6, 8]', expected: '4', actual: '4', passed: true },
            { id: 3, name: 'Sample Case 3', in: '[1, 3, 5, 7]', expected: '0', actual: '1', passed: false }
          ]
        });
      }

      setRunIteration((prev) => prev + 1);
    }, 1000);
  };

  // ── Code Runner Language Tab Switch ──
  const handleSelectLanguage = (lang) => {
    if (lang === activeLang) return;
    setActiveLang(lang);
    setCodeTestResults(null);
    setBurstParticles([]);
  };

  // ── IDE Pointer Tilt Handler (max 5deg) ──
  const handleIdePointerMove = (e) => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!ideRef.current) return;
    const rect = ideRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    ideRef.current.style.transform = `perspective(1000px) rotateX(${-y * 5}deg) rotateY(${x * 5}deg)`;
  };

  const handleIdePointerLeave = () => {
    if (ideRef.current) ideRef.current.style.transform = 'none';
  };

  // ── IntersectionObserver for Scroll Reveals ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('on');
            if (e.target.id === 'tf-analytics-section') {
              setAnalyticsCountProgress(true);
            }
          }
        });
      },
      { threshold: 0.15 }
    );

    const elements = document.querySelectorAll('.tf-editorial-landing .tf-reveal');
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // ── Smooth Scroll Helper for Tour Items ──
  const handleTourItemClick = (index) => {
    if (!tourWrapperRef.current) return;
    const rect = tourWrapperRef.current.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    const targetScrollY =
      window.scrollY + rect.top + (index / 6) * (rect.height - vh) + 10;
    window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
  };

  return (
    <div className="tf-editorial-landing">
      {/* ═══════════════════════════════════════════════════════════════════════════
          1. MANIFESTO SECTION
          ═══════════════════════════════════════════════════════════════════════════ */}
      <section className="tf-sec" ref={manifestoRef} id="about">
        <div className="tf-wrap">
          <div className="tf-eb">About TestForge</div>
          <div className="tf-manifesto-text" aria-label="About TestForge Manifesto">
            {MANIFESTO_WORDS.map((word, i) => {
              const isLit = i < manifestoLitCount;
              const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
              const isHighlightWord = ['create', 'conduct', 'evaluate'].includes(cleanWord);

              return (
                <span
                  key={i}
                  className={`tf-manifesto-word ${isLit ? 'lit' : ''} ${
                    isHighlightWord ? 'highlight' : ''
                  }`}
                >
                  {word}{' '}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <hr className="tf-hl" />

      {/* ═══════════════════════════════════════════════════════════════════════════
          2. PINNED PRODUCT TOUR (440vh Sticky Stage)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="tf-tour-wrapper" ref={tourWrapperRef} id="features">
        <div className="tf-tour-sticky">
          <div className="tf-wrap">
            <div className="tf-tour-grid">
              {/* Left Column: Heading, List & Progress Bar */}
              <div>
                <div className="tf-eb">What can you do with TestForge?</div>
                <h2 className="tf-title on">
                  Six tools. One <u>flow</u>.
                </h2>

                <div className="tf-tour-list" role="tablist" aria-label="TestForge Tools">
                  {TOUR_ITEMS.map((item, idx) => {
                    const isActive = activeTourIndex === idx;
                    return (
                      <div
                        key={item.num}
                        className={`tf-tour-item ${isActive ? 'active' : ''}`}
                        onClick={() => handleTourItemClick(idx)}
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleTourItemClick(idx);
                          }
                        }}
                      >
                        <div className="tf-tour-item-header">
                          <span className="tf-tour-num">{item.num}</span>
                          <span className="tf-tour-title">{item.title}</span>
                        </div>
                        <div className="tf-tour-desc">{item.desc}</div>
                      </div>
                    );
                  })}
                </div>

                {/* 2px Scroll Progress Bar Under List */}
                <div className="tf-tour-progress-track">
                  <div
                    className="tf-tour-progress-fill"
                    style={{ transform: `scaleX(${tourProgress})` }}
                  />
                </div>
              </div>

              {/* Right Column: 3D Stage (6 Stacked Scenes) */}
              <div className="tf-tour-stage" aria-hidden="true">
                {/* Scene 1: AI Question Generator */}
                <div className={`tf-tour-scene ${activeTourIndex === 0 ? 'active' : ''}`}>
                  <div className="s1-container tf-float-card">
                    <div className="s1-meta-stack">
                      <div className="s1-meta-card">
                        <div className="s1-meta-label">Topic</div>
                        <div className="s1-meta-val">Arrays</div>
                      </div>
                      <div className="s1-meta-card">
                        <div className="s1-meta-label">Difficulty</div>
                        <div className="s1-meta-val">Medium</div>
                      </div>
                      <div className="s1-meta-card">
                        <div className="s1-meta-label">Question type</div>
                        <div className="s1-meta-val">MCQ</div>
                      </div>
                    </div>

                    <div className="s1-main-card">
                      <div className="s1-chip">✦ Generate</div>
                      <div className="text-[10px] font-mono text-[#777D78] uppercase mb-1">
                        GENERATED QUESTION · SAMPLE
                      </div>
                      <div className="s1-question">
                        Which approach finds the second largest element of an array in a single pass?
                      </div>
                      <div className="s1-options">
                        <div className="s1-option">Track max and second max in one loop</div>
                        <div className="s1-option correct">✓ Single pass tracking with two pointers</div>
                        <div className="s1-option">Sort the array with quicksort</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scene 2: Question Bank (Fanned Sheets) */}
                <div className={`tf-tour-scene ${activeTourIndex === 1 ? 'active' : ''}`}>
                  <div className="s2-fan tf-float-card">
                    {[
                      { id: 'Q-001', title: 'Binary Tree Level Order', lime: true },
                      { id: 'Q-002', title: 'Merge Intervals', lime: false },
                      { id: 'Q-003', title: 'LRU Cache Design', lime: false },
                      { id: 'Q-004', title: 'Valid Parentheses', lime: false }
                    ].map((sheet, i) => (
                      <div
                        key={sheet.id}
                        className={`s2-sheet ${sheet.lime ? 'lime' : ''}`}
                        style={{
                          transform: `translateX(${(i - 1.5) * 120}px) rotateZ(${(i - 1.5) * 7}deg) translateZ(${i * 30}px)`
                        }}
                      >
                        <div>
                          <div className="text-[11px] font-mono font-bold">{sheet.id}</div>
                          <div className="text-sm font-bold text-[#171819] mt-2">{sheet.title}</div>
                        </div>
                        <div className="text-[10px] font-mono opacity-60">Verified Reference Solution</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scene 3: Test Studio (Sliding Rows) */}
                <div className={`tf-tour-scene ${activeTourIndex === 2 ? 'active' : ''}`}>
                  <div className="s3-card tf-float-card">
                    <div className="text-[11px] font-mono uppercase text-[#EDFF72] mb-3">
                      TEST SPECIFICATION SUITE
                    </div>
                    <div className="s3-rows">
                      <div className="s3-row">
                        <span>Question 1 · MCQ</span>
                        <span className="font-mono text-[#EDFF72]">5 pts</span>
                      </div>
                      <div className="s3-row">
                        <span>Question 2 · Coding</span>
                        <span className="font-mono text-[#EDFF72]">10 pts</span>
                      </div>
                      <div className="s3-row">
                        <span>Time limit · test cases</span>
                        <span className="font-mono">60 min</span>
                      </div>
                      <div className="s3-row">
                        <span>Evaluate automatically</span>
                        <span className="font-mono text-emerald-400">On</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scene 4: Mutation Lab (Operator Glitch Cycler) */}
                <div className={`tf-tour-scene ${activeTourIndex === 3 ? 'active' : ''}`}>
                  <div className="s4-card tf-float-card">
                    <div className="text-[11px] font-mono uppercase text-[#A4A7A1] mb-2">
                      MUTANT GENERATION · SAMPLE
                    </div>
                    <div className="font-mono text-sm leading-relaxed text-[#DDE1DA]">
                      <code>
                        if (n % 2{' '}
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded font-bold transition-all ${
                            mutationGlitch ? 'bg-rose-500 text-white scale-110' : 'bg-[#EDFF72] text-[#111]'
                          }`}
                        >
                          {MUTATION_OPERATORS[mutationStep]}
                        </span>{' '}
                        0) &#123; count++; &#125;
                      </code>
                    </div>
                    <div
                      className={`s4-chip ${
                        MUTATION_OPERATORS[mutationStep] === '>' ? 'survived' : ''
                      }`}
                    >
                      {MUTATION_OPERATORS[mutationStep] === '>'
                        ? 'Mutant result: survived (Needs edge test)'
                        : 'Mutant result: caught by test suite'}
                    </div>
                  </div>
                </div>

                {/* Scene 5: Paper Designer (Layered Sheets in Perspective) */}
                <div className={`tf-tour-scene ${activeTourIndex === 4 ? 'active' : ''}`}>
                  <div className="s5-perspective tf-float-card">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="s5-sheet">
                        <div className="text-xs font-mono font-bold text-[#171819] mb-2">
                          SECTION 0{n} · CODING & MCQS
                        </div>
                        <div className="space-y-2 mt-4">
                          <div className="h-2 bg-[#E9ECE7] rounded w-full" />
                          <div className="h-2 bg-[#E9ECE7] rounded w-4/5" />
                          <div className="h-2 bg-[#E9ECE7] rounded w-3/5" />
                        </div>
                        <div className="mt-8 pt-4 border-t border-[#DDE1DA] flex items-center justify-between text-[11px] font-mono">
                          <span>Weights</span>
                          <span className="px-2 py-0.5 rounded bg-[#EDFF72] font-bold text-[#111]">
                            100 Marks
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scene 6: Performance Analytics (Isometric Bars) */}
                <div className={`tf-tour-scene ${activeTourIndex === 5 ? 'active' : ''}`}>
                  <div className="s6-container tf-float-card">
                    <div className="s6-bars">
                      {[65, 88, 45, 92, 78, 100].map((h, i) => (
                        <div key={i} className="s6-bar-col">
                          <div
                            className="s6-bar-face-front"
                            style={{
                              height: `${h}%`,
                              backgroundColor: i % 2 === 0 ? '#EDFF72' : '#f4ffa6'
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="s6-avg-card">Average score · sample 86%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <hr className="tf-hl" />

      {/* ═══════════════════════════════════════════════════════════════════════════
          3. TWO-SIDED SWITCH SECTION
          ═══════════════════════════════════════════════════════════════════════════ */}
      <section className="tf-sec tf-reveal" id="two-sided">
        <div className="tf-wrap">
          <div className="tf-eb">Two-sided experience</div>

          {/* Pill Toggle with Sliding Lime Thumb */}
          <div
            className="tf-switch-pills"
            role="tablist"
            aria-label="Experience Selector"
          >
            <div
              className="tf-switch-thumb"
              style={{
                width: '140px',
                transform: activeRole === 'educators' ? 'translateX(0)' : 'translateX(140px)'
              }}
            />
            <button
              type="button"
              role="tab"
              aria-selected={activeRole === 'educators'}
              onClick={() => handleRoleToggle('educators')}
              className={`tf-switch-pill-btn ${activeRole === 'educators' ? 'active' : ''}`}
              style={{ width: '140px' }}
            >
              For Educators
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeRole === 'students'}
              onClick={() => handleRoleToggle('students')}
              className={`tf-switch-pill-btn ${activeRole === 'students' ? 'active' : ''}`}
              style={{ width: '140px' }}
            >
              For Students
            </button>
          </div>

          {/* Two-Column Grid with 90-degree Spin */}
          <div className="tf-two-sided-grid">
            {/* Left Content Pane (Spins on switch) */}
            <div className={`tf-spin-pane ${isSpinning ? 'spinning' : ''}`}>
              {renderedRole === 'educators' ? (
                <div>
                  <h2>Everything You Need to Create Better Assessments.</h2>
                  <p className="tf-lead">
                    From building question banks to evaluating coding submissions, TestForge gives educators tools to manage assessments efficiently.
                  </p>
                  <div className="mb-8">
                    {[
                      'Create and manage assessments',
                      'Build question banks',
                      'Configure test cases',
                      'Evaluate submissions',
                      'Monitor student performance'
                    ].map((item, i) => (
                      <div key={i} className="tf-side-item">
                        <span className="tf-side-item-num">0{i + 1}</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={onNavigateTeacherLogin}
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#171819] text-white font-bold text-xs hover:bg-black transition-all cursor-pointer shadow-md"
                  >
                    <span>Enter Teacher Workspace</span>
                    <ArrowRight className="size-4 text-[#EDFF72]" />
                  </button>
                </div>
              ) : (
                <div>
                  <h2>Your Skills. Your Progress. Your Journey.</h2>
                  <p className="tf-lead">
                    Take assessments, solve programming challenges and understand your performance through a unified student experience.
                  </p>
                  <div className="mb-8">
                    {[
                      'Join tests',
                      'Solve programming challenges',
                      'Run and submit code',
                      'Track performance',
                      'Review results'
                    ].map((item, i) => (
                      <div key={i} className="tf-side-item">
                        <span className="tf-side-item-num">0{i + 1}</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={onNavigateStudentPortal}
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#EDFF72] text-[#111] font-bold text-xs hover:bg-[#e2f560] transition-all cursor-pointer shadow-md"
                  >
                    <span>Explore Student Portal</span>
                    <ArrowRight className="size-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Right 3D Visual Preview */}
            <div className="flex justify-center">
              {renderedRole === 'educators' ? (
                <div className="relative w-full max-w-md bg-white border border-[#DDE1DA] rounded-[28px] p-7 shadow-2xl">
                  <div className="text-[10px] font-mono text-[#777D78] uppercase mb-1">
                    ASSESSMENTS · TEACHER WORKSPACE
                  </div>
                  <div className="text-lg font-bold text-[#171819] mb-4">Fall Midterm Evaluations</div>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#F2F3F0] text-xs">
                      <span className="font-medium">Data Structures Midterm</span>
                      <span className="font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full font-bold text-[10px]">
                        Published
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#F2F3F0] text-xs">
                      <span className="font-medium">Python Fundamentals Quiz</span>
                      <span className="font-mono text-neutral-700 bg-neutral-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
                        Draft
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#F2F3F0] text-xs">
                      <span className="font-medium">Arrays Coding Challenge</span>
                      <span className="font-mono text-[#111] bg-[#EDFF72] px-2 py-0.5 rounded-full font-bold text-[10px]">
                        Evaluating
                      </span>
                    </div>
                  </div>
                  <div className="mt-6 p-3 rounded-xl bg-[#191A1D] text-white flex items-center justify-between text-xs font-mono">
                    <span className="text-[#A4A7A1]">Class average</span>
                    <span className="text-[#EDFF72] font-bold">sample 86%</span>
                  </div>
                </div>
              ) : (
                <div className="relative w-full max-w-md bg-[#191A1D] border border-white/10 rounded-[28px] p-7 text-white shadow-2xl">
                  <div className="text-[10px] font-mono text-[#A4A7A1] uppercase mb-1">
                    JOIN A TEST · STUDENT PORTAL
                  </div>
                  <div className="text-2xl font-mono font-bold text-[#EDFF72] tracking-wider my-3">
                    TF-4821
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 text-xs">
                      <span>Test Case 1</span>
                      <span className="font-mono text-[#EDFF72]">Accepted</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 text-xs">
                      <span>Test Case 2</span>
                      <span className="font-mono text-[#EDFF72]">Accepted</span>
                    </div>
                  </div>
                  <div className="mt-6 p-3 rounded-xl bg-[#EDFF72] text-[#111] flex items-center justify-between text-xs font-mono font-bold">
                    <span>Your score</span>
                    <span>sample 46 / 50</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          4. CODE RUNNER (Full-Bleed Dark Band)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <section className="tf-coderunner-band" id="code-runner">
        <div className="tf-wrap">
          <div className="tf-eb">Code Runner</div>
          <h2>
            Write it. Run it. See the <u>verdict</u>.
          </h2>
          <p className="tf-lead" style={{ color: '#A4A7A1' }}>
            Java, C++, Python and JavaScript, tested against sample cases in one workspace.
          </p>

          {/* Interactive IDE Window */}
          <div
            className="tf-ide-window"
            ref={ideRef}
            onPointerMove={handleIdePointerMove}
            onPointerLeave={handleIdePointerLeave}
          >
            {/* Title Bar */}
            <div className="tf-ide-titlebar">
              <div className="tf-ide-dots">
                <span className="tf-ide-dot" />
                <span className="tf-ide-dot" />
                <span className="tf-ide-dot" />
              </div>

              {/* Language Selector Tabs */}
              <div className="tf-ide-tabs" role="tablist" aria-label="Editor Languages">
                {CODE_LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    role="tab"
                    aria-selected={activeLang === lang}
                    onClick={() => handleSelectLanguage(lang)}
                    className={`tf-ide-tab ${activeLang === lang ? 'active' : ''}`}
                  >
                    {lang}
                  </button>
                ))}
              </div>

              {/* Run Code Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={handleRunCode}
                  disabled={isRunningCode}
                  className="tf-ide-run-btn"
                  aria-label="Run Code"
                >
                  {isRunningCode ? (
                    <>
                      <RotateCw className="size-3.5 animate-spin" />
                      <span>Running…</span>
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5 fill-current" />
                      <span>Run</span>
                    </>
                  )}
                </button>

                {/* 18-Particle Lime Burst Animation */}
                {burstParticles.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    {burstParticles.map((p) => {
                      const tx = Math.cos(p.angle) * p.distance;
                      const ty = Math.sin(p.angle) * p.distance;
                      return (
                        <span
                          key={p.id}
                          className="absolute size-1.5 rounded-full bg-[#EDFF72] animate-ping"
                          style={{
                            transform: `translate(${tx}px, ${ty}px)`
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* IDE Two-Column Body */}
            <div className="tf-ide-body">
              {/* Left Pane: Code Editor with Line Slide-in */}
              <div className="tf-ide-code-pane">
                {CODE_SNIPPETS[activeLang].map((line, idx) => (
                  <div
                    key={`${activeLang}-${line.num}`}
                    className="tf-ide-line"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <span className="tf-ide-line-num">{line.num}</span>
                    <span className="text-[#CFD1CC]">
                      {line.text.includes('public') || line.text.includes('def') || line.text.includes('function') ? (
                        <span className="syntax-kw">{line.text}</span>
                      ) : line.text.includes('//') || line.text.includes('#') ? (
                        <span className="syntax-cm">{line.text}</span>
                      ) : (
                        line.text
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Right Pane: Test Inputs & Expected Outputs */}
              <div className="tf-ide-out-pane">
                <div>
                  <div className="text-[11px] font-mono text-[#777D78] uppercase mb-1">
                    SAMPLE INPUT & VERDICT
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 space-y-2 mb-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#777D78]">Input:</span>
                      <span className="font-mono text-[#EDFF72]">[1, 2, 3, 4]</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#777D78]">Expected:</span>
                      <span className="font-mono text-white">2</span>
                    </div>
                  </div>

                  {/* Test Cases Output List */}
                  <div className="space-y-2">
                    {(codeTestResults?.cases || [
                      { id: 1, name: 'Sample Case 1', passed: null },
                      { id: 2, name: 'Sample Case 2', passed: null },
                      { id: 3, name: 'Sample Case 3', passed: null }
                    ]).map((tc) => (
                      <div
                        key={tc.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] border border-white/5 text-xs font-mono"
                      >
                        <span className="text-[#CFD1CC]">{tc.name}</span>
                        {tc.passed === true ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#EDFF72] text-[#111] font-bold">
                            <CheckCircle2 className="size-3" />
                            <span>Accepted</span>
                          </span>
                        ) : tc.passed === false ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-white text-white font-bold">
                            <XCircle className="size-3" />
                            <span>Wrong Answer</span>
                          </span>
                        ) : (
                          <span className="text-[#777D78] text-[11px]">Ready</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-[11px] text-[#777D78] italic mt-4">
                  Interactive preview with simulated output.
                </div>
              </div>
            </div>

            {/* Status Bar */}
            <div className="tf-ide-statusbar" aria-live="polite">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${
                    codeTestResults?.allPassed ? 'bg-[#EDFF72] shadow-[0_0_8px_#EDFF72]' : 'bg-[#777D78]'
                  }`}
                />
                <span>{codeTestResults?.status || 'Ready to run'}</span>
              </div>
              <div>Execution Mode: Isolated VM</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          5. ANALYTICS SECTION (Cardless SVG Stroke Drawing)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <section className="tf-sec tf-reveal" id="tf-analytics-section">
        <div className="tf-wrap">
          <div className="tf-eb">Analytics and performance</div>
          <h2>
            See progress as a <u>line</u>, not a spreadsheet.
          </h2>
          <p className="tf-lead">
            Understand cohorts, detect difficult questions, and track mastery trends across assessments.
          </p>

          {/* Full-width Animated SVG Line Chart */}
          <div className="tf-chart-wrapper">
            <svg
              className="tf-svg-chart"
              viewBox="0 0 1200 300"
              preserveAspectRatio="none"
              aria-label="Student Performance Progression Chart"
            >
              <defs>
                <linearGradient id="tfLimeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EDFF72" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#EDFF72" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Lighter comparison line */}
              <path
                d="M 0,220 C 200,240 400,190 600,170 C 800,150 1000,160 1200,120"
                fill="none"
                stroke="#c9cdc6"
                strokeWidth="2"
                strokeDasharray="6 6"
              />

              {/* Lime gradient area */}
              <path
                className="tf-chart-gradient-area"
                d="M 0,260 C 200,210 400,140 600,90 C 800,60 1000,80 1200,30 L 1200,300 L 0,300 Z"
                fill="url(#tfLimeGrad)"
              />

              {/* Dark main curve drawing itself over 2.4s */}
              <path
                className="tf-chart-path-main"
                d="M 0,260 C 200,210 400,140 600,90 C 800,60 1000,80 1200,30"
                fill="none"
                stroke="#171819"
                strokeWidth="4"
              />
            </svg>

            {/* Three floating dark pin labels over chart */}
            <div className="flex flex-wrap gap-4 mt-6">
              <span className="px-3.5 py-1.5 rounded-full bg-[#191A1D] text-white text-xs font-mono">
                Accuracy 86%
              </span>
              <span className="px-3.5 py-1.5 rounded-full bg-[#191A1D] text-white text-xs font-mono">
                Completion rate 92%
              </span>
              <span className="px-3.5 py-1.5 rounded-full bg-[#191A1D] text-[#EDFF72] text-xs font-mono">
                Class average ↑ 6%
              </span>
            </div>
          </div>

          <hr className="tf-hl" />

          {/* Three Large Stat Counters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-10">
            <div>
              <div className="tf-stat-counter">6</div>
              <div className="text-sm font-medium text-[#777D78]">Assessments tracked</div>
            </div>
            <div>
              <div className="tf-stat-counter">86%</div>
              <div className="text-sm font-medium text-[#777D78]">Average accuracy</div>
            </div>
            <div>
              <div className="tf-stat-counter">92%</div>
              <div className="text-sm font-medium text-[#777D78]">Completion rate</div>
            </div>
          </div>

          <div className="text-xs text-[#777D78] italic mt-6">Sample data for illustration.</div>
        </div>
      </section>

      <hr className="tf-hl" />

      {/* ═══════════════════════════════════════════════════════════════════════════
          6. HOW IT WORKS + WHY CHOOSE
          ═══════════════════════════════════════════════════════════════════════════ */}
      <section className="tf-sec tf-reveal" id="how-it-works">
        <div className="tf-wrap">
          <div className="tf-eb">How it works</div>
          <h2>
            From Test Creation to Results in <u>Four Steps</u>.
          </h2>

          {/* 4 Steps with Left-to-Right Drawing Hairline */}
          <div className="tf-steps-grid pt-6 mb-16">
            <div className="tf-steps-draw-line">
              <div className="tf-steps-draw-overlay" />
            </div>

            <div>
              <div className="tf-step-num">01</div>
              <div className="text-lg font-bold text-[#171819] mb-1">Create</div>
              <p className="text-sm text-[#777D78]">Educators prepare assessments.</p>
            </div>

            <div>
              <div className="tf-step-num">02</div>
              <div className="text-lg font-bold text-[#171819] mb-1">Share</div>
              <p className="text-sm text-[#777D78]">Students receive test codes.</p>
            </div>

            <div>
              <div className="tf-step-num">03</div>
              <div className="text-lg font-bold text-[#171819] mb-1">Attempt</div>
              <p className="text-sm text-[#777D78]">Students complete assessments.</p>
            </div>

            <div>
              <div className="tf-step-num">04</div>
              <div className="text-lg font-bold text-[#171819] mb-1">Evaluate</div>
              <p className="text-sm text-[#777D78]">TestForge evaluates and records results.</p>
            </div>
          </div>

          {/* Why choose TestForge */}
          <div className="pt-6">
            <div className="tf-eb">Why choose TestForge?</div>
            <div className="tf-why-grid">
              {[
                'All-in-one assessment management.',
                'AI-assisted question creation.',
                'Coding assessment support.',
                'Automated test evaluation.',
                'Organized question management.',
                'Student performance insights.'
              ].map((reason, i) => (
                <div key={i} className="tf-why-row">
                  <div className="size-5 rounded-full bg-[#EDFF72] text-[#111] flex items-center justify-center shrink-0">
                    <Check className="size-3 stroke-[3]" />
                  </div>
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <hr className="tf-hl" />

      {/* ═══════════════════════════════════════════════════════════════════════════
          7. FAQ (Hairline Accordion)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <section className="tf-sec tf-reveal" id="faq">
        <div className="tf-wrap">
          <div className="tf-eb">Frequently asked questions</div>
          <h2>
            Got questions? <u>Answers</u> below.
          </h2>

          <div className="max-w-[1100px] mt-8" role="region" aria-label="Frequently Asked Questions">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={idx} className={`tf-faq-item ${isOpen ? 'open' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="tf-faq-btn"
                    aria-expanded={isOpen}
                  >
                    <span>{item.q}</span>
                    <span className="tf-faq-icon">+</span>
                  </button>
                  <div className="tf-faq-content">
                    <p>{item.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <hr className="tf-hl" />

      {/* ═══════════════════════════════════════════════════════════════════════════
          8. FINAL CTA (Cardless Giant Typography + 3D Cube)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <section className="tf-sec tf-reveal" id="cta">
        <div className="tf-wrap">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-10">
            <div>
              <h2 className="tf-cta-giant-h2">
                Transform the Way You <u>Assess</u>.
              </h2>
            </div>

            {/* Rotating 120px Lime 3D Cube */}
            <div className="shrink-0 p-4" aria-hidden="true">
              <div className="tf-cube-120">
                <i>T</i>
                <i>F</i>
                <i>✓</i>
                <i>A+</i>
                <i>✦</i>
                <i>#</i>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pt-6 border-t border-[#DDE1DA]">
            <p className="text-base text-[#777D78] max-w-xl">
              Build smarter tests. Evaluate better. Make every assessment count.
            </p>
            <button
              type="button"
              onClick={onNavigateTeacherLogin}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#EDFF72] text-[#111] font-bold text-sm hover:bg-[#e2f560] transition-all cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              <span>Get Started with TestForge</span>
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          9. WORDMARK & FOOTER
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="tf-wrap">
        <div className="tf-wordmark" aria-hidden="true">
          TestForge
        </div>

        <footer>
          <span>© 2026 TestForge</span>
          <span>Create · Conduct · Evaluate</span>
        </footer>
      </div>
    </div>
  );
};

export default LandingBelowHero;

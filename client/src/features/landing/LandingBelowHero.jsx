import React, { useState, useEffect, useRef, useCallback } from 'react';
import './landing-below.css';

const CODE_SAMPLES = {
  Java: `public static int countEven(int[] a) {
    int c = 0;
    for (int n : a) {
        if (n % 2 == 0) c++;
    }
    return c;
}`,
  'C++': `int countEven(vector<int>& a) {
    int c = 0;
    for (int n : a)
        if (n % 2 == 0) c++;
    return c;
}`,
  Python: `def count_even(a):
    # count numbers divisible by 2
    return sum(1 for n in a if n % 2 == 0)`,
  JavaScript: `function countEven(a) {
  // count numbers divisible by 2
  return a.filter(n => n % 2 === 0).length;
}`
};

const MUTATION_STATES = [
  { op: '==', verdict: 'caught', isWrong: false },
  { op: '!=', verdict: 'caught', isWrong: false },
  { op: '>', verdict: 'survived', isWrong: true },
  { op: '==', verdict: 'caught', isWrong: false }
];

const TEACHER_WORKFLOW = [
  { title: 'Create questions', chip: 'Question Bank' },
  { title: 'Design an assessment', chip: 'Test Studio' },
  { title: 'Configure evaluation', chip: 'Test cases' },
  { title: 'Share test code', chip: 'TF-4821' },
  { title: 'Review results', chip: 'Analytics' }
];

const STUDENT_WORKFLOW = [
  { title: 'Join an assessment', chip: 'Enter code' },
  { title: 'Read questions', chip: 'Question view' },
  { title: 'Solve challenges', chip: 'Code editor' },
  { title: 'Submit answers', chip: 'Run and submit' },
  { title: 'Review performance', chip: 'Results' }
];

const RAIL_SECTIONS = [
  { id: 'experience', label: 'Product' },
  { id: 'sides', label: 'Two-sided' },
  { id: 'features', label: 'Features' },
  { id: 'how', label: 'How it works' },
  { id: 'code', label: 'Code Runner' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'cta', label: 'Get started' }
];

const HEAT_MAP_OPACITIES = [
  0.95, 0.9, 0.85, 0.92, 0.7, 0.88, 0.95, 0.8,
  0.75, 0.6, 0.9, 0.85, 0.4, 0.8, 0.92, 0.7,
  0.88, 0.55, 0.78, 0.9, 0.82, 0.35, 0.7, 0.86,
  0.94, 0.8, 0.65, 0.9, 0.72, 0.5, 0.84, 0.9
];

export const LandingBelowHero = ({
  onJoinTest,
  onNavigateTeacherLogin,
  onNavigateStudentPortal
}) => {
  const containerRef = useRef(null);
  const [activeLang, setActiveLang] = useState('Java');
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [testResults, setTestResults] = useState([
    { status: 'pending', label: 'Test case 1', verdict: 'pending', isWrong: false },
    { status: 'pending', label: 'Test case 2', verdict: 'pending', isWrong: false },
    { status: 'pending', label: 'Test case 3', verdict: 'pending', isWrong: false }
  ]);
  const [ideStatus, setIdeStatus] = useState({ text: 'Ready', type: 'ready' });

  // Mutation Lab cycle state
  const [mutationIndex, setMutationIndex] = useState(0);
  const [mutationGlitch, setMutationGlitch] = useState(false);

  // Section rail state
  const [railVisible, setRailVisible] = useState(false);
  const [activeRailIndex, setActiveRailIndex] = useState(0);

  // Workflow progress values
  const [teacherProgress, setTeacherProgress] = useState(0);
  const [studentProgress, setStudentProgress] = useState(0);

  // Workspace 3D scroll explosion
  const [workspaceExplode, setWorkspaceExplode] = useState(0);

  // Check reduced motion preference
  const isReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFinePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

  // 1. Mutation Lab Loop
  useEffect(() => {
    if (isReducedMotion) return;
    const interval = setInterval(() => {
      setMutationGlitch(true);
      setTimeout(() => {
        setMutationIndex((prev) => (prev + 1) % MUTATION_STATES.length);
        setMutationGlitch(false);
      }, 150);
    }, 2200);
    return () => clearInterval(interval);
  }, [isReducedMotion]);

  // 2. Scroll and Intersection Observer for Reveals and Interactive Metrics
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // Word by word and element reveals via IntersectionObserver
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('on');
          }
        });
      },
      { threshold: 0.14 }
    );

    const revealElements = root.querySelectorAll('.rv, .tf-h2, .bars-3d-wrap, .heat-grid, #anr');
    revealElements.forEach((el) => observer.observe(el));

    // Shared rAF-throttled scroll handler
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          const innerH = window.innerHeight;

          // Rail visibility and active dot
          setRailVisible(scrollY > innerH * 0.7);
          let currentActive = 0;
          RAIL_SECTIONS.forEach((sec, idx) => {
            const el = document.getElementById(sec.id);
            if (el && el.getBoundingClientRect().top < innerH * 0.5) {
              currentActive = idx;
            }
          });
          setActiveRailIndex(currentActive);

          // Workspace 3D explosion calculation
          const wsEl = document.getElementById('ws');
          if (wsEl) {
            const r = wsEl.getBoundingClientRect();
            const rawE = Math.min(Math.max((innerH - r.top) / (innerH * 0.8), 0), 1);
            const easedE = isReducedMotion ? 1 : 1 - Math.pow(1 - rawE, 3);
            setWorkspaceExplode(easedE);
          }

          // Workflow lanes progress
          const teacherLane = document.getElementById('teacher-lane');
          if (teacherLane) {
            const r = teacherLane.getBoundingClientRect();
            const p = isReducedMotion ? 1 : Math.min(Math.max((innerH * 0.85 - r.top) / (innerH * 0.45), 0), 1);
            setTeacherProgress(p);
          }

          const studentLane = document.getElementById('student-lane');
          if (studentLane) {
            const r = studentLane.getBoundingClientRect();
            const p = isReducedMotion ? 1 : Math.min(Math.max((innerH * 0.85 - r.top) / (innerH * 0.45), 0), 1);
            setStudentProgress(p);
          }

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [isReducedMotion]);

  // 4. Particle Burst Effect for Code Runner Run
  const triggerBurst = (el) => {
    if (!el || isReducedMotion) return;
    const rect = el.getBoundingClientRect();
    const count = 18;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.style.cssText = `
        position: fixed;
        left: ${rect.left + rect.width / 2}px;
        top: ${rect.top + rect.height / 2}px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #EDFF72;
        pointer-events: none;
        z-index: 300;
      `;
      document.body.appendChild(p);
      const angle = (Math.PI * 2 * i) / count;
      const dist = 55 + Math.random() * 55;
      const anim = p.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0)`, opacity: 0 }
        ],
        { duration: 750, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
      );
      anim.onfinish = () => p.remove();
    }
  };

  // 5. Code Runner Execution Simulator
  const handleRunCode = (e) => {
    if (isRunningCode) return;
    setIsRunningCode(true);
    setIdeStatus({ text: 'Running…', type: 'running' });

    const btn = e.currentTarget;

    setTimeout(() => {
      const newRuns = runCount + 1;
      setRunCount(newRuns);
      const hasFailure = newRuns % 2 === 0;

      if (!hasFailure) {
        setTestResults([
          { status: 'ok', label: 'Test case 1', verdict: 'Accepted', isWrong: false },
          { status: 'ok', label: 'Test case 2', verdict: 'Accepted', isWrong: false },
          { status: 'ok', label: 'Test case 3', verdict: 'Accepted', isWrong: false }
        ]);
        setIdeStatus({ text: 'Accepted · 3 / 3 passed', type: 'ok' });
        triggerBurst(btn);
      } else {
        setTestResults([
          { status: 'ok', label: 'Test case 1', verdict: 'Accepted', isWrong: false },
          { status: 'ok', label: 'Test case 2', verdict: 'Accepted', isWrong: false },
          { status: 'wa', label: 'Test case 3', verdict: 'Wrong Answer', isWrong: true }
        ]);
        setIdeStatus({ text: 'Wrong Answer · 2 / 3 passed', type: 'wa' });
      }
      setIsRunningCode(false);
    }, isReducedMotion ? 50 : 1000);
  };

  const handleSelectLang = (lang) => {
    if (isRunningCode) return;
    setActiveLang(lang);
    setTestResults([
      { status: 'pending', label: 'Test case 1', verdict: 'pending', isWrong: false },
      { status: 'pending', label: 'Test case 2', verdict: 'pending', isWrong: false },
      { status: 'pending', label: 'Test case 3', verdict: 'pending', isWrong: false }
    ]);
    setIdeStatus({ text: 'Ready', type: 'ready' });
  };

  // Helper to parse line syntax highlight classes
  const formatCodeLine = (line) => {
    const escaped = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.replace(
      /(\/\/.*|#.*)|\b(public|static|int|for|if|return|def|function|vector|sum|in)\b|\b(\d+)\b/g,
      (match, comment, keyword, number) => {
        if (comment) return `<span class="tc">${comment}</span>`;
        if (keyword) return `<span class="tk">${keyword}</span>`;
        if (number) return `<span class="tn">${number}</span>`;
        return match;
      }
    );
  };

  // 3D Tile Tilt Handler
  const handleTileMouseMove = (e) => {
    if (!isFinePointer || isReducedMotion) return;
    const tile = e.currentTarget;
    const rect = tile.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    tile.style.setProperty('--mx', `${x * 100}%`);
    tile.style.setProperty('--my', `${y * 100}%`);
    tile.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 9}deg) rotateY(${(x - 0.5) * 9}deg) translateY(-4px)`;
  };

  const handleTileMouseLeave = (e) => {
    const tile = e.currentTarget;
    tile.style.transform = '';
  };

  // Magnetic button hover
  const handleButtonMouseMove = (e) => {
    if (!isFinePointer || isReducedMotion) return;
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const transX = (e.clientX - rect.left - rect.width / 2) * 0.22;
    const transY = (e.clientY - rect.top - rect.height / 2) * 0.3;
    btn.style.transform = `translate(${transX}px, ${transY}px)`;
  };

  const handleButtonMouseLeave = (e) => {
    e.currentTarget.style.transform = '';
  };

  return (
    <>
      {/* ── SECTION RAIL (Desktop Fixed Right Navigation) ───────────────────── */}
      <nav
        aria-label="Section rail"
        className={`tf-landing-below-rail ${railVisible ? 'active' : ''}`}
      >
        {RAIL_SECTIONS.map((sec, idx) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            data-l={sec.label}
            aria-label={sec.label}
            className={activeRailIndex === idx ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              const target = document.getElementById(sec.id);
              if (target) target.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        ))}
      </nav>

      {/* ── MAIN SITE SHELL WRAPPER ────────────────────────────────────────── */}
      <main
        id="landing-below"
        ref={containerRef}
        className="tf-landing-below site-shell"
      >
        <div className="w-shell">

          {/* ══════════════════════════════════════════════════════════════════
              A: PRODUCT EXPERIENCE
              ══════════════════════════════════════════════════════════════════ */}
          <div id="about" className="sr-only" aria-hidden="true" />
          <section id="experience" className="section-gap">
            <div className="dk-panel">
              <div className="tf-eyebrow rv">Product Experience</div>
              <h2 className="tf-h2 rv" style={{ '--d': 1 }}>
                One workspace. Every <u>assessment</u> tool.
              </h2>
              <p className="lead-desc rv" style={{ '--d': 2, marginBottom: 0 }}>
                Question editor, test creation, code editor, submissions and analytics, designed to work together.
              </p>

              {/* 3D Exploded Workspace Stage */}
              <div id="ws" className="ws-stage rv" style={{ '--d': 2 }}>
                <div
                  className="ws-inner"
                  style={{ '--e': workspaceExplode }}
                  onMouseMove={(e) => {
                    if (!isFinePointer || isReducedMotion) return;
                    const stage = e.currentTarget.parentElement;
                    if (!stage) return;
                    const r = stage.getBoundingClientRect();
                    const rotY = ((e.clientX - r.left) / r.width - 0.5) * -26;
                    const rotX = ((e.clientY - r.top) / r.height - 0.5) * -14 + 8;
                    e.currentTarget.style.setProperty('--wy', `${rotY}deg`);
                    e.currentTarget.style.setProperty('--wx', `${rotX}deg`);
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.removeProperty('--wy');
                    e.currentTarget.style.removeProperty('--wx');
                  }}
                >
                  {/* Panel 1: Question Editor */}
                  <div className="ws-panel p1">
                    <div className="panel-header">
                      <span>Question Editor</span>
                      <span className="text-[#EDFF72]">Easy</span>
                    </div>
                    <div className="q-row">
                      <b className="text-white">Count Even Numbers</b>
                    </div>
                    <div className="skel-line" style={{ width: '92%' }} />
                    <div className="skel-line" style={{ width: '70%' }} />
                    <div className="ws-chips">
                      <span>Array</span>
                      <span>Algorithms</span>
                      <span>Java</span>
                    </div>
                  </div>

                  {/* Panel 2: Test Studio */}
                  <div className="ws-panel p2">
                    <div className="panel-header">
                      <span>Test Studio</span>
                      <span className="text-[#EDFF72]">Draft</span>
                    </div>
                    <div className="q-row">
                      <span>Count Even Numbers</span>
                      <em>5 marks</em>
                    </div>
                    <div className="q-row">
                      <span>Valid Parentheses</span>
                      <em>10 marks</em>
                    </div>
                    <div className="q-row">
                      <span>Second Largest Element</span>
                      <em>10 marks</em>
                    </div>
                    <div className="q-row q-add">＋ Add question</div>
                  </div>

                  {/* Panel 3: main.py */}
                  <div className="ws-panel p3">
                    <div className="panel-header">
                      <span>main.py</span>
                      <span className="text-[#EDFF72]">Python</span>
                    </div>
                    <pre className="ws-pre">
                      <span className="tk">def</span> count_even(a):<br />
                      &nbsp;&nbsp;&nbsp;&nbsp;<span className="tk">return</span> sum(<span className="tn">1</span> <span className="tk">for</span> n <span className="tk">in</span> a<br />
                      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="tk">if</span> n % <span className="tn">2</span> == <span className="tn">0</span>)
                    </pre>
                    <div style={{ marginTop: '12px' }}>
                      <span className="verdict-pill">Accepted</span>
                    </div>
                  </div>

                  {/* Panel 4: Submission */}
                  <div className="ws-panel p4">
                    <div className="panel-header">
                      <span>Submission</span>
                      <span className="text-[#EDFF72]">Evaluated</span>
                    </div>
                    <div className="score-big">
                      42<small> / 50</small>
                    </div>
                    <div className="q-row" style={{ marginTop: '10px' }}>
                      <span>Test case 1</span>
                      <em>Accepted</em>
                    </div>
                    <div className="q-row">
                      <span>Test case 2</span>
                      <em>Accepted</em>
                    </div>
                  </div>

                  {/* Panel 5: Performance */}
                  <div className="ws-panel p5">
                    <div className="panel-header">
                      <span>Performance</span>
                      <span className="text-[#EDFF72]">Sample</span>
                    </div>
                    <svg viewBox="0 0 260 90" width="100%" aria-hidden="true">
                      <path
                        d="M5 78 L55 62 L105 66 L155 40 L205 28 L255 12"
                        fill="none"
                        stroke="#EDFF72"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <g fill="#EDFF72">
                        <circle cx="55" cy="62" r="3.5" />
                        <circle cx="105" cy="66" r="3.5" />
                        <circle cx="155" cy="40" r="3.5" />
                        <circle cx="205" cy="28" r="3.5" />
                        <circle cx="255" cy="12" r="3.5" />
                      </g>
                    </svg>
                  </div>
                </div>

                {/* Animated Ghost Pointer Arrow */}
                <svg className="cursor-ghost" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 3l16 7-7 2-2 7z" fill="#fff" stroke="#111" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>

              <div className="caption-text">Visual preview with representative sample data.</div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════════
              B: TWO-SIDED EXPERIENCE
              ══════════════════════════════════════════════════════════════════ */}
          <section id="sides" className="section-gap">
            <div className="tf-eyebrow rv">Two-Sided Experience</div>
            <h2 className="tf-h2 rv" style={{ '--d': 1 }}>
              One platform. Two <u>perspectives.</u>
            </h2>

            <div className="two-sided-box rv" style={{ '--d': 2 }}>
              {/* Left: Educators Side */}
              <div className="half-side educators" id="educators">
                <span className="side-tag">For Educators</span>
                <h3>Create. Configure. Evaluate.</h3>
                <ol>
                  <li>Create and manage assessments</li>
                  <li>Build question banks</li>
                  <li>Configure test cases</li>
                  <li>Evaluate submissions</li>
                  <li>Monitor student performance</li>
                </ol>
                <button
                  type="button"
                  onClick={onNavigateTeacherLogin}
                  onMouseMove={handleButtonMouseMove}
                  onMouseLeave={handleButtonMouseLeave}
                  className="btn-pill btn-dark"
                >
                  <span>Enter Teacher Workspace →</span>
                </button>
                <div className="floating-side-card">
                  <b>Data Structures Midterm</b>
                  <span>Scheduled · MCQ + Coding</span>
                  <div style={{ marginTop: '8px' }}>
                    <span className="verdict-pill">Published</span>
                  </div>
                </div>
              </div>

              {/* Center Rotating TF Hub */}
              <div className="center-hub" aria-hidden="true">
                <i>TF</i>
              </div>

              {/* Right: Students Side */}
              <div className="half-side students" id="students">
                <span className="side-tag">For Students</span>
                <h3>Join. Solve. Improve.</h3>
                <ol>
                  <li>Join tests</li>
                  <li>Solve programming challenges</li>
                  <li>Run and submit code</li>
                  <li>Track performance</li>
                  <li>Review results</li>
                </ol>
                <button
                  type="button"
                  onClick={onNavigateStudentPortal}
                  onMouseMove={handleButtonMouseMove}
                  onMouseLeave={handleButtonMouseLeave}
                  className="btn-pill btn-lime"
                >
                  <span>Explore Student Portal →</span>
                </button>
                <div className="floating-side-card">
                  <b style={{ fontFamily: 'var(--mono)' }}>TF-4821</b>
                  <span>Sample test 1 passed<br />Sample test 2 passed</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            TICKER STRIP (Infinite Seamless Marquee - True Full Screen Width)
            ══════════════════════════════════════════════════════════════════ */}
        <div className="ticker-wrapper" aria-hidden="true">
          <div className="ticker-inner">
            <span>Question Bank</span><i>✦</i>
            <span>Test Studio</span><i>✦</i>
            <span>Mutation Lab</span><i>✦</i>
            <span>Bulk MCQ</span><i>✦</i>
            <span>Paper Designer</span><i>✦</i>
            <span>Examinations</span><i>✦</i>
            <span>Code Runner</span><i>✦</i>
            <span>Student Analytics</span><i>✦</i>
            <span>Java</span><i>✦</i>
            <span>C++</span><i>✦</i>
            <span>Python</span><i>✦</i>
            <span>JavaScript</span><i>✦</i>
            {/* Duplicated for seamless loop */}
            <span>Question Bank</span><i>✦</i>
            <span>Test Studio</span><i>✦</i>
            <span>Mutation Lab</span><i>✦</i>
            <span>Bulk MCQ</span><i>✦</i>
            <span>Paper Designer</span><i>✦</i>
            <span>Examinations</span><i>✦</i>
            <span>Code Runner</span><i>✦</i>
            <span>Student Analytics</span><i>✦</i>
            <span>Java</span><i>✦</i>
            <span>C++</span><i>✦</i>
            <span>Python</span><i>✦</i>
            <span>JavaScript</span><i>✦</i>
          </div>
        </div>

        <div className="w-shell">
          {/* ══════════════════════════════════════════════════════════════════
              C: FEATURE UNIVERSE
              ══════════════════════════════════════════════════════════════════ */}
          <section id="features" className="section-gap">
            <div className="tf-eyebrow rv">Feature Universe</div>
            <h2 className="tf-h2 rv" style={{ '--d': 1 }}>
              Six tools, each built for <u>its job.</u>
            </h2>

            <div className="features-grid">
              {/* Tile 01: Question Bank (Span 5, White) */}
              <article
                className="fx-tile fx-c1 rv"
                onMouseMove={handleTileMouseMove}
                onMouseLeave={handleTileMouseLeave}
              >
                <div className="tile-vis fanning-sheets">
                  <div className="sheet-layer" style={{ '--i': 3 }}>
                    Q-001<i /><i style={{ width: '70%' }} />
                  </div>
                  <div className="sheet-layer" style={{ '--i': 2 }}>
                    Q-002<i /><i style={{ width: '80%' }} />
                  </div>
                  <div className="sheet-layer" style={{ '--i': 1 }}>
                    Q-003<i /><i style={{ width: '60%' }} />
                  </div>
                  <div className="sheet-layer" style={{ '--i': 0 }}>
                    Q-004<i /><i style={{ width: '75%' }} />
                  </div>
                </div>
                <div>
                  <span className="tile-num">01</span>
                  <h3>Question Bank</h3>
                  <p>Organize, categorize and reuse questions in different assessments.</p>
                </div>
              </article>

              {/* Tile 02: Test Studio (Span 7, Dark) */}
              <article
                className="fx-tile fx-c2 rv"
                style={{ '--d': 1 }}
                onMouseMove={handleTileMouseMove}
                onMouseLeave={handleTileMouseLeave}
              >
                <div className="tile-vis sliding-rows">
                  <div className="s-row" style={{ '--i': 0 }}>
                    <s /><span>Question 1 · MCQ</span><em>5</em>
                  </div>
                  <div className="s-row highlighted" style={{ '--i': 1 }}>
                    <s /><span>Question 2 · Coding</span><em>10</em>
                  </div>
                  <div className="s-row" style={{ '--i': 2 }}>
                    <s /><span>Time limit · test cases</span><em>60 min</em>
                  </div>
                  <div className="s-row" style={{ '--i': 3 }}>
                    <s /><span>Publish with test code</span><em>TF-4821</em>
                  </div>
                </div>
                <div>
                  <span className="tile-num" style={{ color: '#fff' }}>02</span>
                  <h3>Test Studio</h3>
                  <p>Create programming challenges with test cases, time limits and automated evaluation.</p>
                </div>
              </article>

              {/* Tile 03: Mutation Lab (Span 4, Dark-2) */}
              <article
                className="fx-tile fx-c3 rv"
                onMouseMove={handleTileMouseMove}
                onMouseLeave={handleTileMouseLeave}
              >
                <div className="tile-vis">
                  <div className="mutation-code">
                    if (n % 2{' '}
                    <span className={`mutation-op ${mutationGlitch ? 'glitching' : ''}`}>
                      {MUTATION_STATES[mutationIndex].op}
                    </span>{' '}
                    0) &#123;<br />
                    &nbsp;&nbsp;count++;<br />
                    &#125;
                  </div>
                  <div className="mutation-verdict">
                    <span className={`verdict-pill ${MUTATION_STATES[mutationIndex].isWrong ? 'outline-wrong' : ''}`}>
                      {MUTATION_STATES[mutationIndex].verdict}
                    </span>
                    <span>mutant test result</span>
                  </div>
                </div>
                <div>
                  <span className="tile-num" style={{ color: '#fff' }}>03</span>
                  <h3>Mutation Lab</h3>
                  <p>Evaluate the effectiveness of test cases through mutation testing.</p>
                </div>
              </article>

              {/* Tile 04: Paper Designer (Span 4, White) */}
              <article
                className="fx-tile fx-c4 rv"
                style={{ '--d': 1 }}
                onMouseMove={handleTileMouseMove}
                onMouseLeave={handleTileMouseLeave}
              >
                <div className="tile-vis paper-stack">
                  <div className="paper-layer" style={{ '--i': 0 }}>
                    <i /><i style={{ width: '80%' }} /><i className="marks" />
                  </div>
                  <div className="paper-layer" style={{ '--i': 1 }}>
                    <i /><i style={{ width: '70%' }} /><i className="marks" />
                  </div>
                  <div className="paper-layer" style={{ '--i': 2 }}>
                    <i /><i style={{ width: '90%' }} /><i /><i className="marks" />
                  </div>
                </div>
                <div>
                  <span className="tile-num">04</span>
                  <h3>Paper Designer</h3>
                  <p>Design structured examination papers using selected questions and marking schemes.</p>
                </div>
              </article>

              {/* Tile 05: Code Runner (Span 4, Lime) */}
              <article
                className="fx-tile fx-c5 rv"
                style={{ '--d': 2 }}
                onMouseMove={handleTileMouseMove}
                onMouseLeave={handleTileMouseLeave}
              >
                <div className="tile-vis">
                  <div className="mini-code-box">
                    <span className="tc">// Java · Python · C++ · JavaScript</span><br />
                    count_even([1,2,3,4])
                    <span className="caret-blink" />
                    <span className="out-lime">→ 2 · Accepted</span>
                  </div>
                </div>
                <div>
                  <span className="tile-num">05</span>
                  <h3>Code Runner</h3>
                  <p>Write and run code in Java, C++, Python and JavaScript against sample test cases.</p>
                </div>
              </article>

              {/* Tile 06: Student Analytics (Span 12, White) */}
              <article
                className="fx-tile fx-c6 rv"
                onMouseMove={handleTileMouseMove}
                onMouseLeave={handleTileMouseLeave}
              >
                <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 w-full">
                  <div>
                    <span className="tile-num">06</span>
                    <h3>Student Analytics</h3>
                    <p>Understand student scores, assessment performance and progress through analytics.</p>
                  </div>
                  <div className="bars-3d-wrap" style={{ margin: 0, flex: 1, minWidth: '260px', maxWidth: '520px', height: '150px' }}>
                    <div className="iso-bar" style={{ '--h': '50px', '--k': 0 }} />
                    <div className="iso-bar" style={{ '--h': '70px', '--k': 1 }} />
                    <div className="iso-bar" style={{ '--h': '62px', '--k': 2 }} />
                    <div className="iso-bar" style={{ '--h': '95px', '--k': 3 }} />
                    <div className="iso-bar" style={{ '--h': '110px', '--k': 4 }} />
                    <div className="iso-bar" style={{ '--h': '130px', '--k': 5 }} />
                  </div>
                </div>
              </article>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════════
              D: HOW TESTFORGE WORKS
              ══════════════════════════════════════════════════════════════════ */}
          <section id="how" className="section-gap">
            <div className="tf-eyebrow rv">How TestForge Works</div>
            <h2 className="tf-h2 rv" style={{ '--d': 1 }}>
              From first question to <u>final result.</u>
            </h2>

            <div style={{ marginTop: '44px' }}>
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#777D78] mb-2">
                Teacher workflow
              </p>
              <div
                id="teacher-lane"
                className="workflow-lane"
                style={{ '--p': teacherProgress }}
              >
                {TEACHER_WORKFLOW.map((step, idx) => {
                  const isOn = teacherProgress >= idx / (TEACHER_WORKFLOW.length - 1) - 0.02;
                  return (
                    <div key={idx} className={`lane-node ${isOn ? 'on' : ''}`}>
                      <b>{idx + 1}</b>
                      <h4>{step.title}</h4>
                      <span>{step.chip}</span>
                    </div>
                  );
                })}
              </div>

              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#777D78] mb-2">
                Student workflow
              </p>
              <div
                id="student-lane"
                className="workflow-lane"
                style={{ '--p': studentProgress, marginBottom: 0 }}
              >
                {STUDENT_WORKFLOW.map((step, idx) => {
                  const isOn = studentProgress >= idx / (STUDENT_WORKFLOW.length - 1) - 0.02;
                  return (
                    <div key={idx} className={`lane-node ${isOn ? 'on' : ''}`}>
                      <b>{idx + 1}</b>
                      <h4>{step.title}</h4>
                      <span>{step.chip}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════════
              E: CODE RUNNER (Interactive Preview)
              ══════════════════════════════════════════════════════════════════ */}
          <section id="code" className="section-gap">
            <div className="dk-panel">
              <div className="tf-eyebrow rv">Code Runner</div>
              <h2 className="tf-h2 rv" style={{ '--d': 1 }}>
                Write it. Run it. See the <u>verdict.</u>
              </h2>
              <p className="lead-desc rv" style={{ '--d': 2, marginBottom: 0 }}>
                Java, C++, Python and JavaScript, tested against sample cases in one workspace.
              </p>

              {/* IDE Window */}
              <div
                className="ide-window rv"
                style={{ '--d': 2 }}
                onMouseMove={(e) => {
                  if (!isFinePointer || isReducedMotion) return;
                  const ide = e.currentTarget;
                  const rect = ide.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width;
                  const y = (e.clientY - rect.top) / rect.height;
                  ide.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 5}deg) rotateY(${(x - 0.5) * 5}deg)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = '';
                }}
              >
                {/* Title Bar & Tabs */}
                <div className="ide-topbar">
                  <div className="ide-dots">
                    <s /><s /><s />
                  </div>
                  <div className="lang-tabs">
                    {['Java', 'C++', 'Python', 'JavaScript'].map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => handleSelectLang(lang)}
                        className={`lang-tab ${activeLang === lang ? 'on' : ''}`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={isRunningCode}
                    onClick={handleRunCode}
                    className="run-button"
                  >
                    {isRunningCode ? (
                      <>
                        <span className="spinner-dot" />
                        <span>Running</span>
                      </>
                    ) : (
                      <span>▶ Run</span>
                    )}
                  </button>
                </div>

                {/* Editor Body */}
                <div className="ide-body">
                  {/* Left Column: Code Lines */}
                  <div className="code-editor-lines">
                    {CODE_SAMPLES[activeLang].split('\n').map((line, idx) => (
                      <div
                        key={`${activeLang}-${idx}`}
                        className="code-line-item"
                        data-n={idx + 1}
                        style={{ '--i': idx }}
                        dangerouslySetInnerHTML={{ __html: formatCodeLine(line) }}
                      />
                    ))}
                  </div>

                  {/* Right Column: IO & Sample Test Cases */}
                  <div className="ide-io-panel">
                    <div>
                      <small className="io-label">Input</small>
                      <div className="io-box">[1, 2, 3, 4]</div>
                    </div>
                    <div>
                      <small className="io-label">Expected output</small>
                      <div className="io-box">2</div>
                    </div>
                    <div>
                      <small className="io-label">Sample test cases</small>
                      <div>
                        {testResults.map((tc, idx) => (
                          <div
                            key={idx}
                            className="case-row"
                            style={{ animationDelay: `${idx * 0.15}s` }}
                          >
                            <span>{tc.label}</span>
                            {tc.verdict === 'pending' ? (
                              <span className="tc">pending</span>
                            ) : (
                              <span className={`verdict-pill ${tc.isWrong ? 'outline-wrong' : ''}`}>
                                {tc.verdict}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Bar */}
                <div className={`ide-statusbar ${ideStatus.type}`}>
                  <i className="status-dot" />
                  <span>{ideStatus.text}</span>
                </div>
              </div>

              <div className="caption-text" style={{ marginTop: '14px' }}>
                Interactive preview with simulated output.
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════════
              F: ANALYTICS AND PERFORMANCE
              ══════════════════════════════════════════════════════════════════ */}
          <section id="analytics" className="section-gap">
            <div
              id="anr"
              className="dk-panel"
              onMouseMove={(e) => {
                if (!isFinePointer || isReducedMotion) return;
                const panel = e.currentTarget;
                const r = panel.getBoundingClientRect();
                const px = ((e.clientX - r.left) / r.width - 0.5) * 2;
                const py = ((e.clientY - r.top) / r.height - 0.5) * 2;
                panel.style.setProperty('--px', px);
                panel.style.setProperty('--py', py);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.removeProperty('--px');
                e.currentTarget.style.removeProperty('--py');
              }}
            >
              <div className="tf-eyebrow rv">Analytics and Performance</div>
              <h2 className="tf-h2 rv" style={{ '--d': 1 }}>
                See how every student and every question <u>performs.</u>
              </h2>

              <div className="analytics-grid">
                {/* a1: Assessment performance */}
                <div className="analytics-card an-a1">
                  <h4>Assessment performance</h4>
                  <small>Average score per assessment</small>
                  <div className="bars-3d-wrap" style={{ height: '210px', gap: '30px', borderColor: 'rgba(255,255,255,0.12)' }}>
                    <div className="iso-bar" style={{ '--h': '90px', '--k': 0 }}><small className="absolute -bottom-6 left-0 font-mono text-[10px] text-[#8f938d]">A1</small></div>
                    <div className="iso-bar" style={{ '--h': '108px', '--k': 1 }}><small className="absolute -bottom-6 left-0 font-mono text-[10px] text-[#8f938d]">A2</small></div>
                    <div className="iso-bar" style={{ '--h': '100px', '--k': 2 }}><small className="absolute -bottom-6 left-0 font-mono text-[10px] text-[#8f938d]">A3</small></div>
                    <div className="iso-bar" style={{ '--h': '128px', '--k': 3 }}><small className="absolute -bottom-6 left-0 font-mono text-[10px] text-[#8f938d]">A4</small></div>
                    <div className="iso-bar" style={{ '--h': '142px', '--k': 4 }}><small className="absolute -bottom-6 left-0 font-mono text-[10px] text-[#8f938d]">A5</small></div>
                    <div className="iso-bar" style={{ '--h': '158px', '--k': 5 }}><small className="absolute -bottom-6 left-0 font-mono text-[10px] text-[#8f938d]">A6</small></div>
                  </div>
                </div>

                {/* a2: Student progress */}
                <div className="analytics-card an-a2">
                  <h4>Student progress</h4>
                  <small>Score over time</small>
                  <svg viewBox="0 0 300 150" width="100%" style={{ marginTop: '12px' }} aria-hidden="true">
                    <path
                      className="svg-area-fill"
                      d="M10 120 L60 100 L110 108 L160 70 L210 52 L290 22 L290 140 L10 140Z"
                    />
                    <path
                      className="svg-progress-line"
                      pathLength="1"
                      d="M10 120 L60 100 L110 108 L160 70 L210 52 L290 22"
                    />
                  </svg>
                </div>

                {/* a3: Accuracy */}
                <div className="analytics-card an-a3">
                  <h4>Accuracy</h4>
                  <small>Across submissions</small>
                  <svg viewBox="0 0 120 120" width="100%" style={{ maxWidth: '140px', display: 'block', margin: '14px auto 0' }} aria-hidden="true">
                    <circle
                      cx="60"
                      cy="60"
                      r="46"
                      fill="none"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="9"
                    />
                    <circle
                      className="accuracy-ring"
                      pathLength="100"
                      cx="60"
                      cy="60"
                      r="46"
                      fill="none"
                      stroke="#EDFF72"
                      strokeWidth="9"
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                    />
                    <text
                      x="60"
                      y="68"
                      textAnchor="middle"
                      fill="#fff"
                      style={{ font: '600 24px var(--mono)' }}
                    >
                      86%
                    </text>
                  </svg>
                </div>

                {/* a4: Question-level performance */}
                <div className="analytics-card an-a4">
                  <h4>Question-level performance</h4>
                  <small>Brighter means more students answered correctly</small>
                  <div className="heat-grid">
                    {HEAT_MAP_OPACITIES.map((o, idx) => (
                      <i key={idx} style={{ '--o': o, '--k': idx }} />
                    ))}
                  </div>
                </div>

                {/* a5: Completion and results */}
                <div className="analytics-card an-a5">
                  <h4>Completion and results</h4>
                  <small>Sample distribution</small>
                  <div style={{ marginTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '5px', color: '#cfd1cc' }}>
                      <span>Completion rate</span>
                      <span>92%</span>
                    </div>
                    <i className="completion-bar-track">
                      <b className="completion-bar-fill" style={{ '--w': '92%' }} />
                    </i>
                  </div>
                  <div className="split-results-bar">
                    <b style={{ '--w': '78%', background: '#EDFF72' }} />
                    <b style={{ '--w': '22%', background: 'rgba(255,255,255,0.35)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: '10.5px', color: '#a4a7a1' }}>
                    <span>Accepted 78%</span>
                    <span>Wrong Answer 22%</span>
                  </div>
                </div>
              </div>

              <div className="caption-text" style={{ marginTop: '18px' }}>
                Sample data for illustration.
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════════
              G: FINAL CTA
              ══════════════════════════════════════════════════════════════════ */}
          <section id="cta" className="section-gap">
            <div
              className="dk-panel text-center"
              style={{
                paddingTop: 'clamp(56px, 9vw, 120px)',
                paddingBottom: 'clamp(48px, 7vw, 90px)'
              }}
              onMouseMove={(e) => {
                if (!isFinePointer || isReducedMotion) return;
                const panel = e.currentTarget;
                const r = panel.getBoundingClientRect();
                const rotY = ((e.clientX - r.left) / r.width - 0.5) * 40;
                const rotX = -10 + ((e.clientY - r.top) / r.height - 0.5) * -20;
                const scene = document.getElementById('cta-3d-scene');
                if (scene) {
                  scene.style.setProperty('--wy', `${rotY}deg`);
                  scene.style.setProperty('--wx', `${rotX}deg`);
                }
              }}
              onMouseLeave={() => {
                const scene = document.getElementById('cta-3d-scene');
                if (scene) {
                  scene.style.removeProperty('--wy');
                  scene.style.removeProperty('--wx');
                }
              }}
            >
              {/* 3D TestForge Identity: rotating cube + orbit rings */}
              <div className="identity-stage">
                <div id="cta-3d-scene" className="identity-scene">
                  <div className="orbit-ring" style={{ '--s': '300px', '--t': '20s' }}>
                    <i>✓</i>
                  </div>
                  <div className="orbit-ring" style={{ '--s': '220px', '--t': '14s', marginTop: '-110px' }}>
                    <i>&lt;/&gt;</i>
                  </div>
                  <div className="cta-cube">
                    <i>T</i>
                    <i>F</i>
                    <i>✓</i>
                    <i>A+</i>
                    <i>✦</i>
                    <i>#</i>
                  </div>
                </div>
              </div>

              <h2 className="tf-h2 rv text-center mx-auto" style={{ maxWidth: '16ch', margin: '30px auto 16px', color: '#fff' }}>
                Build. Challenge. Discover What’s Possible.
              </h2>
              <p className="lead-desc rv text-center mx-auto" style={{ '--d': 1, maxWidth: '32rem', margin: '0 auto 32px' }}>
                One platform connecting smarter assessments with better learning experiences.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3.5 rv" style={{ '--d': 2 }}>
                <a
                  href="#features"
                  onMouseMove={handleButtonMouseMove}
                  onMouseLeave={handleButtonMouseLeave}
                  onClick={(e) => {
                    e.preventDefault();
                    const feat = document.getElementById('features');
                    if (feat) feat.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="btn-pill btn-ghost"
                >
                  <span>Explore TestForge</span>
                </a>
                <button
                  type="button"
                  onClick={onNavigateTeacherLogin || onJoinTest}
                  onMouseMove={handleButtonMouseMove}
                  onMouseLeave={handleButtonMouseLeave}
                  className="btn-pill btn-lime"
                  style={{ padding: '16px 32px' }}
                >
                  <span>Get Started</span>
                </button>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════════
              GIANT WATERMARK & FOOTER
              ══════════════════════════════════════════════════════════════════ */}
          <div className="wordmark-hero" aria-hidden="true">
            TestForge
          </div>

          <footer className="tf-site-footer">
            <span>© 2026 TestForge</span>
            <span>Create · Conduct · Evaluate</span>
          </footer>

        </div>
      </main>
    </>
  );
};

export default LandingBelowHero;

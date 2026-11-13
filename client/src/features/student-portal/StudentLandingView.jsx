import React, { useState, useRef, useEffect, useMemo } from 'react';
import './student-landing.css';

// 30 paths per layer matching exact mathematical formula from HTML
function generatePaths(pos) {
  const result = [];
  for (let i = 0; i < 30; i++) {
    const a = 380 - i * 5 * pos;
    const b = 189 + i * 6;
    const d = `M-${a} -${b}C-${a} -${b} -${312 - i * 5 * pos} ${216 - i * 6} ${152 - i * 5 * pos} ${343 - i * 6}C${616 - i * 5 * pos} ${470 - i * 6} ${684 - i * 5 * pos} ${875 - i * 6} ${684 - i * 5 * pos} ${875 - i * 6}`;
    const strokeWidth = (0.5 + i * 0.03).toFixed(2);
    const strokeOpacity = Math.min(0.07 + i * 0.013, 0.42).toFixed(2);
    const duration = (20 + (i % 7) * 1.5).toFixed(1);
    const delay = (-(i % 5) * 4).toFixed(1);
    result.push({ d, strokeWidth, strokeOpacity, duration, delay });
  }
  return result;
}

const ROTATING_WORDS = ['results.', 'progress.', 'skills.', 'journey.'];

const SAMPLE_TESTS = {
  'TF-4821': {
    t: 'Data Structures Midterm',
    tr: 'Dr. Sarah Mitchell',
    d: '90 mins',
    m: 100,
    q: 25,
    av: 'Available now',
    ok: true,
    i: 'Answer all questions. Autosave is on.'
  },
  'TF-2210': {
    t: 'Python Fundamentals Quiz',
    tr: 'Prof. Ravi Menon',
    d: '30 mins',
    m: 30,
    q: 15,
    av: 'Opens Fri, 14 Nov · 10:00',
    ok: false,
    i: 'Read each question carefully before answering.'
  }
};

const SAMPLE_ERRORS = {
  'TF-1000': 'This test has expired and can no longer be started.',
  'TF-0000': 'This test is not published yet.',
  'TF-9999': 'You are not assigned to this test. Ask your teacher to add you.'
};

export const StudentLandingView = ({
  onEnterPortal,
  onJoinWithCode,
  onSignIn,
  onNavigateHome,
  currentUser = null,
  onSignOut = null,
  onNavigateTab = null
}) => {
  const containerRef = useRef(null);
  const heroRef = useRef(null);
  const scRef = useRef(null);
  const stageRef = useRef(null);
  const mockRef = useRef(null);
  const cursorRingRef = useRef(null);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [isHoveringInteractive, setIsHoveringInteractive] = useState(false);

  // 1. Dual Layer generative paths precalculated once
  const p1Paths = useMemo(() => generatePaths(1), []);
  const p2Paths = useMemo(() => generatePaths(-1), []);

  // 2. Rotating Word state
  const [wi, setWi] = useState(0);
  const [rotVisible, setRotVisible] = useState(true);

  // 3. Hero 3D mouse parallax & custom lime ring
  const handleHeroPointerMove = (e) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (cursorRingRef.current) {
      cursorRingRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      setCursorVisible(true);
    }
    const target = e.target;
    const isInteractive = Boolean(
      target && (target.closest('button, a, input, [role="button"]') || target.classList?.contains('clickable'))
    );
    setIsHoveringInteractive(isInteractive);

    if (!heroRef.current || !scRef.current) return;
    const r = heroRef.current.getBoundingClientRect();
    const ry = ((e.clientX / r.width - 0.5) * -26 - 6).toFixed(2);
    const rx = ((e.clientY / r.height - 0.5) * -14 + 8).toFixed(2);
    scRef.current.style.setProperty('--ry', `${ry}deg`);
    scRef.current.style.setProperty('--rx', `${rx}deg`);
  };

  const handleHeroPointerLeave = () => {
    setCursorVisible(false);
    setIsHoveringInteractive(false);
  };

  // 4. Scroll listener for progress bar, nav blur, mock flattening, cue opacity
  const [scrollProgress, setScrollProgress] = useState(0);
  const [navScrolled, setNavScrolled] = useState(false);
  const [heroScale, setHeroScale] = useState(1);
  const [heroOpacity, setHeroOpacity] = useState(1);
  const [cueOpacity, setCueOpacity] = useState(1);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      const innerH = window.innerHeight || 800;
      const p = Math.min(Math.max(y / innerH, 0), 1);

      setHeroScale(1 - p * 0.06);
      setHeroOpacity(1 - p * 0.65);
      setCueOpacity(Math.max(0, 1 - p * 4));
      setNavScrolled(y > 40);

      const totalScroll = document.documentElement.scrollHeight - innerH;
      if (totalScroll > 0) {
        setScrollProgress(Math.min(y / totalScroll, 1));
      }

      // Mock flattening
      if (mockRef.current && stageRef.current) {
        const r = stageRef.current.getBoundingClientRect();
        const q = Math.min(Math.max(1 - (r.top - innerH * 0.1) / (innerH * 0.7), 0), 1);
        mockRef.current.style.transform = `rotateX(${16 * (1 - q)}deg) translateY(${30 * (1 - q)}px) scale(${0.94 + 0.06 * q})`;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 5. Rotating word timer
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => {
      setRotVisible(false);
      setTimeout(() => {
        setWi((prev) => (prev + 1) % ROTATING_WORDS.length);
        setRotVisible(true);
      }, 350);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  // 6. Live Mock Data: Questions counter up & live increment
  const [questionsCount, setQuestionsCount] = useState(248);
  const [isPopping, setIsPopping] = useState(false);
  const [avgScore, setAvgScore] = useState(86);
  const [chartBars, setChartBars] = useState([35, 55, 40, 78, 62, 90, 70, 100]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Live question count increment
    const qInterval = setInterval(() => {
      setQuestionsCount((prev) => prev + Math.ceil(Math.random() * 3));
      setIsPopping(true);
      setTimeout(() => setIsPopping(false), 300);
    }, 2600);

    // Live chart re-randomize
    const cInterval = setInterval(() => {
      setChartBars((prev) =>
        prev.map(() => Math.floor(25 + Math.random() * 75))
      );
    }, 2200);

    return () => {
      clearInterval(qInterval);
      clearInterval(cInterval);
    };
  }, []);

  // 7. Floating chips cycling
  const [chipIdx, setChipIdx] = useState(0);
  const m1 = ['Test joined', 'Answer saved', 'Test submitted', 'Result released'];
  const m2 = ['Score: 46 / 50', 'Code accepted', 'Streak: 5 days', 'New test assigned'];

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = setInterval(() => {
      setChipIdx((prev) => prev + 1);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  // 8. Countdown Timer (starts at 42:10)
  const [timeLeft, setTimeLeft] = useState(2530);
  useEffect(() => {
    const tInterval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 2530));
    }, 1000);
    return () => clearInterval(tInterval);
  }, []);

  const formatTimer = (secs) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  // 9. Interactive Join Test preview state
  const [joinCode, setJoinCode] = useState('TF-4821');
  const [previewData, setPreviewData] = useState(SAMPLE_TESTS['TF-4821']);
  const [previewError, setPreviewError] = useState('');

  const handlePreviewCode = (codeToTest) => {
    const k = (codeToTest !== undefined ? codeToTest : joinCode).trim().toUpperCase();
    if (!k) {
      setPreviewError('Enter a test code first.');
      setPreviewData(null);
      return;
    }
    if (SAMPLE_ERRORS[k]) {
      setPreviewError(SAMPLE_ERRORS[k]);
      setPreviewData(null);
      return;
    }
    if (SAMPLE_TESTS[k]) {
      setPreviewData(SAMPLE_TESTS[k]);
      setPreviewError('');
      return;
    }
    // Generic / custom valid test format
    setPreviewData({
      t: `Assessment ${k}`,
      tr: 'Instructor Evaluation',
      d: '60 mins',
      m: 100,
      q: 20,
      av: 'Available now',
      ok: true,
      i: 'Deterministic evaluation mode enabled. All edge cases checked.'
    });
    setPreviewError('');
  };

  // 10. IntersectionObserver for reveal animation
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('on');
          }
        });
      },
      { threshold: 0.15 }
    );
    const elements = document.querySelectorAll('.tf-student-portal-page .rv');
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // 11. 3D Card tilt and spotlight
  const handleCardTilt = (e) => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = e.currentTarget;
    const b = el.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width;
    const y = (e.clientY - b.top) / b.height;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 9}deg) rotateY(${(x - 0.5) * 9}deg) translateY(-4px)`;
  };

  const handleCardLeave = (e) => {
    e.currentTarget.style.transform = '';
  };

  // 12. Final CTA mouse parallax
  const handleCtaMove = (e) => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ct = e.currentTarget;
    const r = ct.getBoundingClientRect();
    const sc3 = document.getElementById('sc3');
    if (sc3) {
      sc3.style.setProperty('--wy', `${((e.clientX - r.left) / r.width - 0.5) * 40}deg`);
    }
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div ref={containerRef} className="tf-student-portal-page">
      {/* 3px Lime Top Progress Bar */}
      <div className="pg" style={{ transform: `scaleX(${scrollProgress})` }} />

      {/* ═══════════════════════════════════════════════════════════════════════════
          HERO SECTION (Sticky 100svh, Two Columns)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="hw" id="top">
        <header
          ref={heroRef}
          onPointerMove={handleHeroPointerMove}
          onPointerLeave={handleHeroPointerLeave}
          className="hero"
          id="hero"
          style={{
            transform: `scale(${heroScale})`,
            opacity: heroOpacity
          }}
        >
          {/* Top Header Fixed on Hero (Does not follow down into dashboard) */}
          <div className="hero-top-bar">
            <a
              className="logo"
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <i>TF</i>
              <span>TestForge</span>
            </a>
            <div className="nl">
              <button type="button" onClick={() => scrollToSection('join')}>
                Join Test
              </button>
              <button type="button" onClick={() => scrollToSection('features')}>
                Features
              </button>
              <button
                type="button"
                className="g"
                onClick={() => {
                  if (onNavigateTab) onNavigateTab('overview', '/student/overview');
                  else scrollToSection('show');
                }}
              >
                Student portal
              </button>
            </div>
          </div>
          {/* Custom Glowing Lime Cursor Ring (matching Main Landing Page) */}
          <div
            ref={cursorRingRef}
            aria-hidden="true"
            className={`pointer-events-none fixed top-0 left-0 hidden rounded-full border-[1.5px] border-[#EDFF72] transition-[width,height,opacity] duration-150 ease-out z-[9999] lg:block ${
              cursorVisible ? 'opacity-100' : 'opacity-0'
            } ${
              isHoveringInteractive
                ? 'size-14 -ml-7 -mt-7 border-[#EDFF72] bg-[#EDFF72]/10 backdrop-blur-xs shadow-[0_0_16px_rgba(237,255,114,0.4)]'
                : 'size-[34px] -ml-[17px] -mt-[17px] shadow-[0_0_10px_rgba(237,255,114,0.35)]'
            }`}
            style={{ willChange: 'transform' }}
          />
          {/* Dual Layer Generative SVG Paths */}
          <div className="fp" aria-hidden="true">
            <svg id="p1" viewBox="0 0 696 316" preserveAspectRatio="xMidYMid slice">
              {p1Paths.map((p, idx) => (
                <path
                  key={`p1-${idx}`}
                  d={p.d}
                  pathLength="1"
                  strokeWidth={p.strokeWidth}
                  strokeOpacity={p.strokeOpacity}
                  style={{
                    animationDuration: `${p.duration}s`,
                    animationDelay: `${p.delay}s`
                  }}
                />
              ))}
            </svg>
            <svg id="p2" viewBox="0 0 696 316" preserveAspectRatio="xMidYMid slice">
              {p2Paths.map((p, idx) => (
                <path
                  key={`p2-${idx}`}
                  d={p.d}
                  pathLength="1"
                  strokeWidth={p.strokeWidth}
                  strokeOpacity={p.strokeOpacity}
                  style={{
                    animationDuration: `${p.duration}s`,
                    animationDelay: `${p.delay}s`
                  }}
                />
              ))}
            </svg>
          </div>

          {/* Vignette Gradients */}
          <div className="vg" />

          {/* Left Column: Headlines & Actions */}
          <div>
            <div className="pill in" style={{ '--i': 0 }}>
              <s />
              <span>Student portal</span>
            </div>

            <h1 aria-label="Take tests. Track growth. Own your results.">
              <span className="wd">Take tests.</span>
              <br />
              <span className="wd">Track growth.</span>
              <br />
              <span className="wd">Own your </span>
              <em
                id="rot"
                style={{
                  opacity: rotVisible ? 1 : 0,
                  transform: rotVisible ? 'none' : 'translateY(16px)'
                }}
              >
                {ROTATING_WORDS[wi]}
              </em>
            </h1>

            <p className="hp in" style={{ '--i': 3 }}>
              Join tests with a code, solve MCQs and coding challenges, and see exactly how your performance is progressing.
            </p>

            <div className="row in" style={{ '--i': 4 }}>
              <button
                type="button"
                className="btn bl"
                onClick={() => {
                  if (onEnterPortal) onEnterPortal();
                  scrollToSection('show');
                }}
              >
                Enter Student Portal →
              </button>
              <button
                type="button"
                className="btn bg-ghost"
                onClick={() => scrollToSection('join')}
              >
                Join a test ↓
              </button>
            </div>

            <div className="tag in" style={{ '--i': 5 }}>
              Join with a test code <b>·</b> MCQs &amp; coding <b>·</b> Results &amp; progress
            </div>
          </div>

          {/* Right Column: 3D Stage with Interactive Parallax */}
          <div className="stage in" style={{ '--i': 2 }}>
            <div ref={scRef} className="scene" id="sc">
              {/* 440px Dashed Orbit Ring */}
              <div className="rg3" aria-hidden="true">
                <i />
              </div>

              {/* 3-Layer Isometric Stack */}
              <div className="iso" aria-hidden="true">
                <div className="ly l0" style={{ '--k': 0 }}>
                  Results
                  <i />
                  <i style={{ width: '70%' }} />
                  <i className="a" />
                </div>
                <div className="ly" style={{ '--k': 1 }}>
                  solution.js
                  <i />
                  <i style={{ width: '80%' }} />
                  <i className="a" />
                  <i style={{ width: '60%' }} />
                </div>
                <div className="ly l2" style={{ '--k': 2 }}>
                  Question 4 · MCQ
                  <i />
                  <i style={{ width: '75%' }} />
                  <i className="a" />
                </div>
              </div>

              {/* Floating Billboard Cards */}
              <div className="fl d" style={{ '--z': '130px', right: 0, top: '4%', width: '44%' }}>
                <small>Average score</small>
                <div className="big">{avgScore}%</div>
                <small>Sample result</small>
              </div>

              <div className="fl" style={{ '--z': '150px', '--dl': '-3s', left: 0, top: '10%', width: '44%' }}>
                <small>Available now</small>
                <b>Data Structures Midterm</b>
                <small style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>TF-4821 · 90 mins</small>
              </div>

              <div className="fl d" style={{ '--z': '170px', '--dl': '-1.5s', right: '6%', bottom: '6%' }}>
                <small style={{ fontFamily: 'var(--mono)' }}>Code runner</small>
                <b style={{ color: 'var(--lime)' }}>✓ Accepted · 3 / 3</b>
              </div>

              {/* 70px Rotating 3D Cube */}
              <div className="cube">
                <i>T</i>
                <i>F</i>
                <i>✓</i>
                <i>A+</i>
                <i>✦</i>
                <i>#</i>
              </div>
            </div>
          </div>

          <div className="cue" style={{ opacity: cueOpacity }}>
            Scroll to explore ↓
          </div>
        </header>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          SITE SHELL (Sliding up over hero, radius 40px)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <main className="site" id="show">
        <div className="w">
          {/* Section 1: The Student Workspace Showcase */}
          <div className="eb rv">The student workspace</div>
          <h2 className="rv" style={{ '--d': 1 }}>
            Your tests, results and progress in <u>one place</u>.
          </h2>
          <p className="ld rv" style={{ '--d': 2 }}>
            Join tests, track your attempts and see where to improve, all from a single student dashboard.
          </p>

          <div ref={stageRef} className="stg rv" id="stage">
            <div ref={mockRef} className="mock" id="mock">
              {/* Mock Sidebar */}
              <div className="sb">
                <b className="a" title="Overview">▦</b>
                <b title="My Tests">▤</b>
                <b title="Join Test">⌗</b>
                <b title="Upcoming">◷</b>
                <b title="History">☰</b>
                <b title="Analytics">◔</b>
              </div>

              {/* Mock Content */}
              <div className="mc">
                <div className="tabs">
                  <span onClick={() => onNavigateTab && onNavigateTab('overview', '/student/overview')}>
                    Overview
                  </span>
                  <span onClick={() => onNavigateTab && onNavigateTab('my-tests', '/student/tests')}>
                    My Tests
                  </span>
                  <span onClick={() => onNavigateTab && onNavigateTab('join-test', '/student/join-test')}>
                    Join Test
                  </span>
                  <span onClick={() => onNavigateTab && onNavigateTab('upcoming-tests', '/student/upcoming')}>
                    Upcoming
                  </span>
                  <span onClick={() => onNavigateTab && onNavigateTab('test-history', '/student/history')}>
                    Test History
                  </span>
                  <span onClick={() => onNavigateTab && onNavigateTab('analytics', '/student/analytics')}>
                    Analytics
                  </span>
                </div>

                <div className="mt">
                  <h3>
                    Student <i>✦</i> Overview
                  </h3>
                  <button
                    type="button"
                    onClick={() => scrollToSection('join')}
                    className="mb"
                  >
                    + Quick Join
                  </button>
                </div>

                <div className="mg">
                  {/* Card 1: Questions Solved */}
                  <div className="mk">
                    <span>Questions solved</span>
                    <div
                      className="n"
                      id="qn"
                      style={{
                        transform: isPopping ? 'scale(1.15)' : 'none',
                        transition: 'transform 0.3s ease'
                      }}
                    >
                      {questionsCount}
                    </div>
                    <div className="sl">
                      <s className="f" style={{ '--k': 0 }} />
                      <s className="f" style={{ '--k': 1 }} />
                      <s className="f" style={{ '--k': 2 }} />
                      <s className="f" style={{ '--k': 3 }} />
                      <s />
                      <s />
                      <s />
                      <s />
                    </div>
                  </div>

                  {/* Card 2: Average Score (Lime) */}
                  <div className="mk l">
                    <span>Average score</span>
                    <div className="n">{avgScore}%</div>
                    <span>across released results</span>
                  </div>

                  {/* Card 3: Learning Streak (Dark) */}
                  <div className="mk d">
                    <span>Learning streak</span>
                    <div className="orb" />
                    <span>5 days active</span>
                  </div>

                  {/* Quick Actions */}
                  <div className="qa">
                    <b style={{ fontSize: '11px' }}>Quick actions</b>
                    <div onClick={() => scrollToSection('join')}>⌗ Join Test</div>
                    <div onClick={() => onNavigateTab && onNavigateTab('test-history', '/student/history')}>
                      ☰ Test History
                    </div>
                    <div onClick={() => onNavigateTab && onNavigateTab('learning', '/student/learning')}>
                      ◔ My Learning
                    </div>
                  </div>

                  {/* Score Progression Chart */}
                  <div className="chart">
                    <b>Score progression</b> <span style={{ opacity: 0.5 }}>· recent tests</span>
                    <div className="bars">
                      {chartBars.map((height, i) => (
                        <i
                          key={i}
                          style={{
                            '--h': `${height}%`,
                            '--k': i,
                            height: `${height}%`
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Chips */}
            <div className="fc" style={{ top: '12%', left: '-10px' }}>
              <em>✓</em>
              <span id="f1">{m1[chipIdx % m1.length]}</span>
            </div>
            <div className="fc d" style={{ bottom: '18%', right: '-6px', animationDelay: '-2s' }}>
              <em>+</em>
              <span id="f2">{m2[chipIdx % m2.length]}</span>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════════
            Section 2: Electric Lime Marquee Ticker (Rotated -1.4deg)
            ═══════════════════════════════════════════════════════════════════════════ */}
        <div className="mq" aria-hidden="true">
          <div>
            <span>✦</span>Join Test<span>✦</span>My Tests<span>✦</span>Upcoming Tests<span>✦</span>Test History<span>✦</span>Performance Analytics<span>✦</span>My Learning<span>✦</span>Join Test<span>✦</span>My Tests<span>✦</span>Upcoming Tests<span>✦</span>Test History<span>✦</span>Performance Analytics<span>✦</span>My Learning
          </div>
        </div>

        <div className="w">
          {/* ═══════════════════════════════════════════════════════════════════════════
              Section 3: Join Test Interactive Section
              ═══════════════════════════════════════════════════════════════════════════ */}
          <section id="join" style={{ marginTop: 'clamp(70px, 9vw, 120px)' }}>
            <div className="dk">
              <div className="eb rv">Join Test</div>
              <h2 className="rv" style={{ '--d': 1 }}>
                Enter a code. <u>Start</u> in seconds.
              </h2>
              <p className="ld rv" style={{ '--d': 2, marginBottom: 0 }}>
                Your teacher shares a test code. Enter it, preview the test, and start when it opens.
              </p>

              <div className="jn rv" style={{ '--d': 2 }}>
                <div>
                  <div className="jf">
                    <input
                      id="jcode"
                      maxLength={7}
                      value={joinCode}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setJoinCode(val);
                        handlePreviewCode(val);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handlePreviewCode();
                      }}
                      aria-label="Test code"
                      autoComplete="off"
                    />
                    <button
                      className="btn bl"
                      id="jgo"
                      type="button"
                      onClick={() => handlePreviewCode()}
                    >
                      Preview test
                    </button>
                  </div>
                  <div className="hints">
                    Try <b onClick={() => { setJoinCode('TF-4821'); handlePreviewCode('TF-4821'); }} className="cursor-pointer underline">TF-4821</b> available ·{' '}
                    <b onClick={() => { setJoinCode('TF-2210'); handlePreviewCode('TF-2210'); }} className="cursor-pointer underline">TF-2210</b> not open yet ·{' '}
                    <b onClick={() => { setJoinCode('TF-1000'); handlePreviewCode('TF-1000'); }} className="cursor-pointer underline">TF-1000</b> expired<br />
                    <b onClick={() => { setJoinCode('TF-0000'); handlePreviewCode('TF-0000'); }} className="cursor-pointer underline">TF-0000</b> unpublished ·{' '}
                    <b onClick={() => { setJoinCode('TF-9999'); handlePreviewCode('TF-9999'); }} className="cursor-pointer underline">TF-9999</b> not assigned to you
                  </div>
                </div>

                {/* Preview Box */}
                <div className="jc2" id="jprev">
                  <small style={{ font: '500 10px var(--mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    Preview
                  </small>
                  {previewError ? (
                    <div className="msg">
                      <b>⚠</b>
                      <span>{previewError}</span>
                    </div>
                  ) : previewData ? (
                    <>
                      <h3>{previewData.t}</h3>
                      <small>{previewData.tr}</small>
                      <div className="kv">
                        <div>
                          <small>Duration</small>
                          {previewData.d}
                        </div>
                        <div>
                          <small>Total marks</small>
                          {previewData.m}
                        </div>
                        <div>
                          <small>Questions</small>
                          {previewData.q}
                        </div>
                        <div>
                          <small>Availability</small>
                          {previewData.av}
                        </div>
                      </div>
                      <small style={{ display: 'block', lineHeight: 1.6, marginBottom: '16px' }}>
                        {previewData.i}
                      </small>
                      {previewData.ok ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (onJoinWithCode) onJoinWithCode(joinCode);
                          }}
                          className="btn bl sm"
                        >
                          Start test →
                        </button>
                      ) : (
                        <div className="msg">
                          This test is not open yet. You can start it when it becomes available.
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </div>

              <div className="cap">Interactive preview with sample tests.</div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════════════════
              Section 4: Features Bento Grid (5 Cards)
              ═══════════════════════════════════════════════════════════════════════════ */}
          <section id="features">
            <div className="eb rv">Features</div>
            <h2 className="rv" style={{ '--d': 1 }}>
              Built for how students <u>really</u> learn.
            </h2>
            <p className="ld rv" style={{ '--d': 2 }}>
              Every part of the portal is one click away and works from your own results.
            </p>

            <div className="bgd">
              {/* Card 1: Join Test (w8) */}
              <article
                className="cd w8 rv"
                onPointerMove={handleCardTilt}
                onPointerLeave={handleCardLeave}
              >
                <div>
                  <span className="tg">Join Test</span>
                  <h3>Start with just a test code</h3>
                  <p>Enter the code from your teacher, preview the test details and start when it opens.</p>
                </div>
                <div className="qs">
                  <span>TF-4821</span>
                  <span>90 mins</span>
                  <span>100 marks</span>
                  <span>25 questions</span>
                  <span>Instructions</span>
                </div>
              </article>

              {/* Card 2: Exam Workspace (Lime) */}
              <article
                className="cd l rv"
                style={{ '--d': 1 }}
                onPointerMove={handleCardTilt}
                onPointerLeave={handleCardLeave}
              >
                <div>
                  <span className="tg">Exam Workspace</span>
                  <h3>Focus on the questions</h3>
                  <p>Timer, question palette and autosave while you work.</p>
                </div>
                <div className="tm" id="tmr">
                  {formatTimer(timeLeft)}
                  <small> left</small>
                </div>
              </article>

              {/* Card 3: Code Runner (Dark) */}
              <article
                className="cd d rv"
                onPointerMove={handleCardTilt}
                onPointerLeave={handleCardLeave}
              >
                <div>
                  <span className="tg">Code Runner</span>
                  <h3>Write, run, submit</h3>
                  <p>Java, C++, Python and JavaScript with sample test cases.</p>
                </div>
                <div className="code">
                  count_even([1, 2, 3, 4])<span className="cu" />
                  <br />
                  <span className="ok">→ 2 · Accepted</span>
                </div>
              </article>

              {/* Card 4: Test History */}
              <article
                className="cd rv"
                style={{ '--d': 1 }}
                onPointerMove={handleCardTilt}
                onPointerLeave={handleCardLeave}
              >
                <div>
                  <span className="tg">Test History</span>
                  <h3>Every attempt, saved</h3>
                  <p>Review previous attempts and released results.</p>
                </div>
                <div className="pp">
                  <s />
                  <s />
                  <s />
                  <s />
                </div>
              </article>

              {/* Card 5: My Learning */}
              <article
                className="cd rv"
                style={{ '--d': 2 }}
                onPointerMove={handleCardTilt}
                onPointerLeave={handleCardLeave}
              >
                <div>
                  <span className="tg">My Learning</span>
                  <h3>See your weak spots</h3>
                  <p>Strong and weak topics from your released results.</p>
                </div>
                <div className="bars" style={{ height: '70px', margin: 0 }}>
                  <i style={{ '--h': '88%', '--k': 0, height: '88%' }} />
                  <i style={{ '--h': '92%', '--k': 1, height: '92%' }} />
                  <i style={{ '--h': '58%', '--k': 2, height: '58%' }} />
                  <i style={{ '--h': '61%', '--k': 3, height: '61%' }} />
                  <i style={{ '--h': '80%', '--k': 4, height: '80%' }} />
                </div>
              </article>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════════════════
              Section 5: Stats Section (3 Cards)
              ═══════════════════════════════════════════════════════════════════════════ */}
          <section id="stats">
            <div className="st" style={{ marginTop: 0 }}>
              <div className="sn rv">
                <b>4</b>
                <span>Programming languages</span>
              </div>
              <div className="sn rv" style={{ '--d': 1 }}>
                <b>3</b>
                <span>Question types: MCQ, descriptive, coding</span>
              </div>
              <div className="sn rv" style={{ '--d': 2 }}>
                <b>1</b>
                <span>Test code is all you need to join</span>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════════════════
              Section 6: Final CTA Section (Dark 3D Cube + 2 Orbit Rings)
              ═══════════════════════════════════════════════════════════════════════════ */}
          <section
            className="cta dk rv"
            id="cta"
            onPointerMove={handleCtaMove}
            style={{ marginBottom: 0 }}
          >
            <div className="id3">
              <div className="sc3" id="sc3">
                <div className="ob" style={{ '--s': '300px', '--t': '20s' }}>
                  <i>✓</i>
                </div>
                <div className="ob" style={{ '--s': '220px', '--t': '14s' }}>
                  <i>&lt;/&gt;</i>
                </div>
                <div className="cb">
                  <i>T</i>
                  <i>F</i>
                  <i>✓</i>
                  <i>A+</i>
                  <i>✦</i>
                  <i>#</i>
                </div>
              </div>
            </div>

            <h2>Your Skills. Your Progress. Your Journey.</h2>
            <p>
              Take assessments, solve programming challenges and understand your performance through a unified student experience.
            </p>

            <div className="row">
              <button
                type="button"
                className="btn bg-ghost"
                onClick={() => scrollToSection('join')}
              >
                Join a test
              </button>
              <button
                type="button"
                className="btn bl"
                onClick={() => {
                  if (onEnterPortal) onEnterPortal();
                  scrollToSection('show');
                }}
                style={{ padding: '16px 32px' }}
              >
                Enter Student Portal →
              </button>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════════════════
              Section 7: Animated Wordmark
              ═══════════════════════════════════════════════════════════════════════════ */}
          <div className="wm" aria-hidden="true">
            TestForge
          </div>

          {/* ═══════════════════════════════════════════════════════════════════════════
              Section 8: Site Footer
              ═══════════════════════════════════════════════════════════════════════════ */}
          <footer>
            <span>© 2026 TestForge</span>
            <span>Take tests · Track growth · Own your results</span>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default StudentLandingView;

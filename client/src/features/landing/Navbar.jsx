import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GraduationCap, Shield, KeyRound } from 'lucide-react';

const SECTION_IDS = {
  top: "top",
  about: "about",
  tour: "features",
  sides: "two-sided",
  code: "code-runner",
  analytics: "tf-analytics-section",
  how: "how-it-works",
  faq: "faq",
  cta: "cta"
};

const NAV_ITEMS = [
  { key: 'about', label: 'About', href: '#about', targetId: SECTION_IDS.about },
  { key: 'features', label: 'Features', href: '#features', targetId: SECTION_IDS.tour },
  { key: 'educators', label: 'Educators', href: '#two-sided', targetId: SECTION_IDS.sides, role: 't' },
  { key: 'students', label: 'Students', href: '#two-sided', targetId: SECTION_IDS.sides, role: 's' },
  { key: 'how', label: 'How It Works', href: '#how-it-works', targetId: SECTION_IDS.how },
  { key: 'faq', label: 'FAQ', href: '#faq', targetId: SECTION_IDS.faq },
];

export const Navbar = ({
  onJoinTest,
  onNavigateStudentPortal,
  onNavigateTeacherLogin
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeKey, setActiveKey] = useState(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });

  const headerRef = useRef(null);
  const navLinksRef = useRef({});
  const lastScrollY = useRef(0);
  const rAFId = useRef(null);

  // Check user auth state from localStorage for dynamic labels
  const [authInfo, setAuthInfo] = useState({ isStudent: false, isTeacher: false });

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('testforge_user');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u?.role?.toLowerCase() === 'student') {
          setAuthInfo({ isStudent: true, isTeacher: false });
        } else if (u) {
          setAuthInfo({ isStudent: false, isTeacher: true });
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Update sliding indicator position
  const updateIndicator = useCallback((key) => {
    if (!key || !navLinksRef.current[key]) {
      setIndicatorStyle(prev => ({ ...prev, opacity: 0 }));
      return;
    }
    const el = navLinksRef.current[key];
    setIndicatorStyle({
      left: el.offsetLeft,
      width: el.offsetWidth,
      opacity: 1
    });
  }, []);

  // Scroll spy implementation
  const updateScrollSpy = useCallback(() => {
    const headerHeight = headerRef.current ? headerRef.current.offsetHeight : 70;
    const threshold = headerHeight + window.innerHeight * 0.3;

    // Ordered list of sections to inspect
    const spySections = [
      { id: SECTION_IDS.about, key: 'about' },
      { id: SECTION_IDS.tour, key: 'features' },
      { id: SECTION_IDS.sides, key: 'sides' },
      { id: SECTION_IDS.code, key: 'features' },
      { id: SECTION_IDS.analytics, key: 'features' },
      { id: SECTION_IDS.how, key: 'how' },
      { id: SECTION_IDS.faq, key: 'faq' },
      { id: SECTION_IDS.cta, key: 'cta' }
    ];

    let lastPassedSection = null;

    for (const sec of spySections) {
      const el = document.getElementById(sec.id);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= threshold) {
          lastPassedSection = sec;
        }
      }
    }

    if (!lastPassedSection || lastPassedSection.key === 'cta') {
      setActiveKey(null);
      updateIndicator(null);
      return;
    }

    if (lastPassedSection.key === 'sides') {
      const sw = document.getElementById('sw');
      const currentRole = sw ? sw.getAttribute('data-r') : 't';
      const resolvedKey = currentRole === 's' ? 'students' : 'educators';
      setActiveKey(resolvedKey);
      updateIndicator(resolvedKey);
    } else {
      setActiveKey(lastPassedSection.key);
      updateIndicator(lastPassedSection.key);
    }
  }, [updateIndicator]);

  // Scroll listener (active state, background blur, and header show/hide)
  useEffect(() => {
    const handleScroll = () => {
      if (rAFId.current) return;

      rAFId.current = window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        const delta = currentScrollY - lastScrollY.current;

        // Scrolled past 40px triggers compact background
        setIsScrolled(currentScrollY > 40);

        // Header hide/show logic past 500px:
        // Downward scroll > 8px -> hide (translateY(-100%))
        // Upward scroll > 6px or scroll <= 500px -> show (translateY(0))
        // Never hide if mobile menu open or focus is inside header
        const isFocusInside = headerRef.current ? headerRef.current.contains(document.activeElement) : false;

        if (mobileMenuOpen || isFocusInside || currentScrollY <= 500) {
          setIsHidden(false);
        } else if (delta > 8 && currentScrollY > 500) {
          setIsHidden(true);
        } else if (delta < -6) {
          setIsHidden(false);
        }

        lastScrollY.current = currentScrollY;
        updateScrollSpy();
        rAFId.current = null;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateScrollSpy);

    if (document.fonts?.ready) {
      document.fonts.ready.then(updateScrollSpy);
    }

    // Listener for clicks on role switcher #sw to re-run scroll spy after 60ms
    const handleRoleSwitchClick = (e) => {
      const sw = document.getElementById('sw');
      if (sw && sw.contains(e.target)) {
        setTimeout(updateScrollSpy, 60);
      }
    };
    document.addEventListener('click', handleRoleSwitchClick);

    // Initial run
    updateScrollSpy();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateScrollSpy);
      document.removeEventListener('click', handleRoleSwitchClick);
      if (rAFId.current) window.cancelAnimationFrame(rAFId.current);
    };
  }, [updateScrollSpy, mobileMenuOpen]);

  // Lock scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          setMobileMenuOpen(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [mobileMenuOpen]);

  // Navigation scroll calculation
  const navigateToSection = (targetId, role = null) => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // If educators or students role requested, trigger role switch first if different
    if (role) {
      const sw = document.getElementById('sw');
      const currentRole = sw ? sw.getAttribute('data-r') : null;
      if (currentRole && currentRole !== role) {
        const targetBtn = document.querySelector(`#sw button[data-r="${role}"]`);
        if (targetBtn) {
          targetBtn.click();
        }
      }
    }

    if (targetId === SECTION_IDS.top) {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion ? 'auto' : 'smooth'
      });
      return;
    }

    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    const headerHeight = headerRef.current ? headerRef.current.offsetHeight : 70;
    const y = targetEl.getBoundingClientRect().top + window.scrollY - headerHeight - 8;

    window.scrollTo({
      top: Math.max(0, y),
      behavior: prefersReducedMotion ? 'auto' : 'smooth'
    });
  };

  const handleLinkClick = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    navigateToSection(item.targetId, item.role);
  };

  const handleMobileLinkClick = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setMobileMenuOpen(false);
    setTimeout(() => {
      navigateToSection(item.targetId, item.role);
    }, 350);
  };

  const handleLogoClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (mobileMenuOpen) setMobileMenuOpen(false);
    navigateToSection(SECTION_IDS.top);
  };

  return (
    <>
      <header
        ref={headerRef}
        role="banner"
        id="tf-main-header"
        className={`tf-header ${isScrolled ? 'scrolled' : ''} ${isHidden ? 'hidden-header' : ''}`}
      >
        {/* Left: Logo */}
        <a
          href="#top"
          onClick={handleLogoClick}
          className="tf-logo-link"
          aria-label="TestForge Home"
        >
          <span className="tf-logo-badge">TF</span>
          <span className="tf-logo-text">TestForge</span>
        </a>

        {/* Center: Pill Nav (Hidden below 980px) */}
        <nav className="tf-center-nav" aria-label="Primary">
          {/* Sliding Lime Thumb Indicator */}
          <div
            className="tf-nav-indicator"
            style={{
              transform: `translateX(${indicatorStyle.left}px)`,
              width: `${indicatorStyle.width}px`,
              opacity: indicatorStyle.opacity
            }}
          />
          {NAV_ITEMS.map((item) => {
            const isActive = activeKey === item.key;
            return (
              <a
                key={item.key}
                ref={(el) => (navLinksRef.current[item.key] = el)}
                href={item.href}
                onClick={(e) => handleLinkClick(e, item)}
                aria-current={isActive ? 'true' : undefined}
                className={`tf-nav-link ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="tf-right-actions">
          <button
            type="button"
            onClick={onNavigateStudentPortal}
            className="tf-portal-link tf-hide-1200"
          >
            <GraduationCap className="tf-icon" />
            <span>{authInfo.isStudent ? 'Go to dashboard' : 'Student Portal'}</span>
          </button>

          <button
            type="button"
            onClick={onNavigateTeacherLogin}
            className="tf-portal-link tf-hide-1200"
          >
            <Shield className="tf-icon" />
            <span>{authInfo.isTeacher ? 'Go to dashboard' : 'Teacher Portal'}</span>
          </button>

          <button
            type="button"
            onClick={onJoinTest}
            className="tf-join-btn"
          >
            <KeyRound className="tf-icon text-[#111]" />
            <span>Join a Test</span>
          </button>

          {/* Hamburger (under 980px) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`tf-hamburger ${mobileMenuOpen ? 'open' : ''}`}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            <span className="tf-hamburger-line line-1" />
            <span className="tf-hamburger-line line-2" />
          </button>
        </div>
      </header>

      {/* Full-Screen Mobile Menu Overlay */}
      <div
        id="tf-mobile-drawer"
        className={`tf-mobile-overlay ${mobileMenuOpen ? 'open' : ''}`}
        aria-hidden={!mobileMenuOpen}
      >
        <div className="tf-mobile-inner">
          <div className="tf-mobile-links">
            {NAV_ITEMS.map((item, idx) => {
              const isActive = activeKey === item.key;
              return (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={(e) => handleMobileLinkClick(e, item)}
                  aria-current={isActive ? 'true' : undefined}
                  style={{ animationDelay: `${idx * 55}ms` }}
                  className={`tf-mobile-link ${isActive ? 'active' : ''}`}
                >
                  <span>{item.label}</span>
                </a>
              );
            })}
          </div>

          <div className="tf-mobile-bottom-actions">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateStudentPortal();
              }}
              className="tf-mobile-portal-btn"
            >
              <GraduationCap className="size-5 text-[#EDFF72]" />
              <span>{authInfo.isStudent ? 'Go to student dashboard' : 'Student Portal'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateTeacherLogin();
              }}
              className="tf-mobile-portal-btn"
            >
              <Shield className="size-5 text-[#EDFF72]" />
              <span>{authInfo.isTeacher ? 'Go to teacher dashboard' : 'Teacher Portal'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onJoinTest();
              }}
              className="tf-mobile-join-btn"
            >
              <KeyRound className="size-5 text-[#111]" />
              <span>Join a Test</span>
            </button>
          </div>
        </div>
      </div>

      {/* Scoped CSS to ensure 100% precision with zero global pollution */}
      <style>{`
        .tf-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 80;
          padding: 16px clamp(16px, 3.4vw, 64px);
          padding-top: calc(16px + env(safe-area-inset-top, 0px));
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          background: transparent;
          border-bottom: 1px solid transparent;
          transition: background-color 0.3s ease, backdrop-filter 0.3s ease, border-color 0.3s ease, padding 0.3s ease, transform 0.45s cubic-bezier(0.2, 0.7, 0.2, 1);
        }

        .tf-header.scrolled {
          background: rgba(11, 12, 14, 0.78);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: calc(10px + env(safe-area-inset-top, 0px));
          padding-bottom: 10px;
        }

        .tf-header.hidden-header {
          transform: translateY(-100%);
        }

        /* Focus styles across all links and buttons */
        .tf-header a:focus-visible,
        .tf-header button:focus-visible,
        .tf-mobile-overlay a:focus-visible,
        .tf-mobile-overlay button:focus-visible {
          outline: 2px solid #EDFF72;
          outline-offset: 3px;
        }

        /* Logo */
        .tf-logo-link {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          user-select: none;
        }

        .tf-logo-badge {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background-color: #EDFF72;
          color: #111;
          font-weight: 800;
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          letter-spacing: -0.02em;
          box-shadow: 0 2px 10px rgba(237, 255, 114, 0.35);
        }

        .tf-logo-text {
          color: #ffffff;
          font-weight: 600;
          font-size: 18px;
          letter-spacing: -0.02em;
        }

        /* Center Pill Nav */
        .tf-center-nav {
          position: relative;
          display: flex;
          align-items: center;
          padding: 5px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .tf-nav-indicator {
          position: absolute;
          top: 5px;
          bottom: 5px;
          left: 0;
          background: #EDFF72;
          border-radius: 999px;
          box-shadow: 0 6px 20px rgba(237, 255, 114, 0.3);
          pointer-events: none;
          z-index: 1;
          transition: transform 0.45s cubic-bezier(0.5, 1.3, 0.4, 1), width 0.45s cubic-bezier(0.5, 1.3, 0.4, 1), opacity 0.3s ease;
        }

        .tf-nav-link {
          position: relative;
          z-index: 2;
          font-size: 13px;
          padding: 8px 15px;
          border-radius: 999px;
          color: #cfd1cc;
          text-decoration: none;
          white-space: nowrap;
          font-weight: 500;
          transition: color 0.25s ease;
        }

        .tf-nav-link:hover {
          color: #ffffff;
        }

        .tf-nav-link.active {
          color: #111111;
          font-weight: 600;
        }

        /* Right Actions */
        .tf-right-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tf-portal-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #cfd1cc;
          background: transparent;
          border: 1px solid transparent;
          padding: 9px 14px;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s ease, color 0.2s ease;
        }

        .tf-portal-link:hover {
          background-color: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }

        .tf-join-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          background-color: #EDFF72;
          color: #111111;
          font-weight: 600;
          padding: 10px 18px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          box-shadow: 0 10px 34px -8px rgba(237, 255, 114, 0.45);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .tf-join-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 38px -6px rgba(237, 255, 114, 0.55);
        }

        .tf-icon {
          width: 14px;
          height: 14px;
        }

        /* Hamburger button */
        .tf-hamburger {
          display: none;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.18);
          cursor: pointer;
          position: relative;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 5px;
          padding: 0;
          z-index: 95;
        }

        .tf-hamburger-line {
          display: block;
          width: 18px;
          height: 1.5px;
          background-color: #ffffff;
          border-radius: 2px;
          transition: transform 0.3s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.3s ease;
        }

        .tf-hamburger.open .line-1 {
          transform: translateY(3.25px) rotate(45deg);
        }

        .tf-hamburger.open .line-2 {
          transform: translateY(-3.25px) rotate(-45deg);
        }

        /* Responsive Breakpoints:
           Under 1200px: hide the two text portal links
           Under 980px: hide center nav, show hamburger */
        @media (max-width: 1199px) {
          .tf-hide-1200 {
            display: none !important;
          }
        }

        @media (max-width: 979px) {
          .tf-center-nav {
            display: none !important;
          }
          .tf-hamburger {
            display: flex !important;
          }
        }

        /* Mobile Full-Screen Overlay */
        .tf-mobile-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 75;
          background: rgba(11, 12, 14, 0.97);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          transform: translateY(-100%);
          transition: transform 0.55s cubic-bezier(0.2, 0.7, 0.2, 1);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          pointer-events: none;
        }

        .tf-mobile-overlay.open {
          transform: translateY(0);
          pointer-events: auto;
        }

        .tf-mobile-inner {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 100vh;
          padding: calc(85px + env(safe-area-inset-top, 0px)) clamp(20px, 5vw, 40px) 40px;
        }

        .tf-mobile-links {
          display: flex;
          flex-direction: column;
        }

        .tf-mobile-link {
          font-size: clamp(30px, 8vw, 46px);
          font-weight: 600;
          letter-spacing: -0.045em;
          color: #cfd1cc;
          text-decoration: none;
          padding: 14px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          opacity: 0;
          transform: translateY(16px);
          transition: color 0.2s ease;
        }

        .tf-mobile-overlay.open .tf-mobile-link {
          animation: tfFadeRise 0.45s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        }

        @keyframes tfFadeRise {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .tf-mobile-link:hover,
        .tf-mobile-link.active {
          color: #EDFF72;
        }

        .tf-mobile-bottom-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 36px;
        }

        .tf-mobile-portal-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
        }

        .tf-mobile-join-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px 20px;
          border-radius: 14px;
          border: none;
          background: #EDFF72;
          color: #111111;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 10px 30px rgba(237, 255, 114, 0.35);
        }

        /* Reduced Motion */
        @media (prefers-reduced-motion: reduce) {
          .tf-header,
          .tf-nav-indicator,
          .tf-mobile-overlay,
          .tf-mobile-link,
          .tf-hamburger-line {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
};

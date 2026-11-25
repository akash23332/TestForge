import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../lib/api';
import { ArrowLeft, ArrowRight, AlertCircle, Lock } from 'lucide-react';

export const StudentJoinView = ({ onJoined, onBack, initialExamCode = '', currentUser = null }) => {
  // Parse initial exam code (e.g. "TF-DA88BA" or "DA88BA") into 6 alphanumeric cells
  const parseInitialCells = (code) => {
    const raw = (code || '').toUpperCase().replace(/^TF[-–]?/, '').replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const cells = ['', '', '', '', '', ''];
    for (let i = 0; i < raw.length; i++) {
      cells[i] = raw[i];
    }
    return cells;
  };

  const [codeCells, setCodeCells] = useState(() => parseInitialCells(initialExamCode));
  const [candidateName, setCandidateName] = useState(currentUser?.name || '');
  const [candidateEmail, setCandidateEmail] = useState(currentUser?.email || '');
  const [rollNumber, setRollNumber] = useState(currentUser?.rollNumber || currentUser?.studentId || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const cellRefs = useRef([]);

  // Auto focus first empty cell on mount
  useEffect(() => {
    const firstEmptyIndex = codeCells.findIndex((c) => !c);
    const targetIdx = firstEmptyIndex === -1 ? 0 : firstEmptyIndex;
    if (cellRefs.current[targetIdx]) {
      cellRefs.current[targetIdx].focus();
    }
  }, []);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 450);
  };

  const handleCellChange = (index, value) => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!upper) {
      const next = [...codeCells];
      next[index] = '';
      setCodeCells(next);
      return;
    }

    const char = upper.slice(-1);
    const next = [...codeCells];
    next[index] = char;
    setCodeCells(next);
    setErrorMessage('');

    // Auto advance
    if (index < 5 && cellRefs.current[index + 1]) {
      cellRefs.current[index + 1].focus();
      cellRefs.current[index + 1].select();
    }
  };

  const handleCellKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!codeCells[index] && index > 0 && cellRefs.current[index - 1]) {
        e.preventDefault();
        const next = [...codeCells];
        next[index - 1] = '';
        setCodeCells(next);
        cellRefs.current[index - 1].focus();
      } else if (codeCells[index]) {
        // clear current cell
        const next = [...codeCells];
        next[index] = '';
        setCodeCells(next);
      }
    } else if (e.key === 'ArrowLeft' && index > 0 && cellRefs.current[index - 1]) {
      e.preventDefault();
      cellRefs.current[index - 1].focus();
      cellRefs.current[index - 1].select();
    } else if (e.key === 'ArrowRight' && index < 5 && cellRefs.current[index + 1]) {
      e.preventDefault();
      cellRefs.current[index + 1].focus();
      cellRefs.current[index + 1].select();
    }
  };

  const handleCellPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text') || '';
    const clean = pasted.toUpperCase().replace(/^TF[-–]?/, '').replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!clean) return;

    const next = [...codeCells];
    for (let i = 0; i < 6; i++) {
      next[i] = clean[i] || '';
    }
    setCodeCells(next);
    setErrorMessage('');

    const targetFocus = Math.min(clean.length, 5);
    if (cellRefs.current[targetFocus]) {
      cellRefs.current[targetFocus].focus();
      cellRefs.current[targetFocus].select();
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = currentUser?.role?.toLowerCase() === 'student' ? '/student/dashboard' : '/';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const rawCode = codeCells.join('').trim().toUpperCase();
    if (rawCode.length < 6) {
      setErrorMessage('Please enter all 6 characters of your examination access code.');
      triggerShake();
      const firstEmpty = codeCells.findIndex((c) => !c);
      if (firstEmpty !== -1 && cellRefs.current[firstEmpty]) {
        cellRefs.current[firstEmpty].focus();
      }
      return;
    }

    if (!candidateName.trim()) {
      setErrorMessage('Please enter your candidate full name.');
      return;
    }

    if (!candidateEmail.trim() || !candidateEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    const fullExamCode = `TF-${rawCode}`;
    setIsLoading(true);

    try {
      const res = await api.post('/attempts/join', {
        examCode: fullExamCode,
        candidateInfo: {
          name: candidateName.trim(),
          email: candidateEmail.trim().toLowerCase(),
          rollNumber: rollNumber.trim()
        }
      });

      const data = res.data.data;
      onJoined(data);
    } catch (err) {
      triggerShake();
      const status = err.response?.data?.data?.status || err.response?.data?.error?.code;
      const serverMsg = err.response?.data?.message || err.response?.data?.error?.message || err.customMessage;

      if (status === 'INVALID_CODE' || err.response?.status === 404 || /not found|invalid/i.test(serverMsg)) {
        setErrorMessage('Invalid code. Check it with your instructor and try again.');
      } else if (status === 'EXPIRED' || /expired|concluded/i.test(serverMsg)) {
        setErrorMessage('This test has expired and can no longer be started.');
      } else if (status === 'ALREADY_ATTEMPTED' || /already attempted|already submitted/i.test(serverMsg)) {
        setErrorMessage('You have already attempted this test. Each test can be attempted once.');
      } else if (status === 'NOT_OPEN_YET' || /not open/i.test(serverMsg)) {
        setErrorMessage(serverMsg || 'This test is not open yet.');
      } else if (status === 'UNPUBLISHED' || /unpublished|inactive|not active/i.test(serverMsg)) {
        setErrorMessage('This test is unpublished or inactive. Check with your instructor.');
      } else {
        setErrorMessage(serverMsg || 'Failed to verify examination code. Please verify credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#F2F3F0] text-[#171819] font-sans flex flex-col lg:grid lg:grid-cols-[minmax(380px,44%)_1fr]">
      {/* ── LEFT FOCAL PANEL (Dark) ────────────────────────────────────────── */}
      <aside className="relative bg-[#191A1D] text-white p-[clamp(28px,4vw,56px)] flex flex-col justify-between overflow-hidden shrink-0">
        {/* Soft Lime Radial Glow & Giant Outlined '01' */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-16 w-[420px] h-[420px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(237,255,114,0.16) 0%, rgba(25,26,29,0) 70%)'
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-4 right-8 select-none font-bold text-[clamp(90px,12vw,170px)] leading-none text-transparent"
          style={{
            WebkitTextStroke: '1.5px rgba(255,255,255,0.14)',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}
        >
          01
        </div>

        {/* Top: Brand Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#EDFF72] flex items-center justify-center font-bold text-[#191A1D] text-sm shadow-xs">
            TF
          </div>
          <span className="font-bold text-base tracking-tight text-white">TestForge</span>
        </div>

        {/* Center: Main Eyebrow & Headline */}
        <div className="relative z-10 my-12 lg:my-0 space-y-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#EDFF72]">
            Examination portal
          </div>
          <h1 className="text-[clamp(44px,5.8vw,88px)] font-semibold tracking-[-0.06em] leading-[0.95] text-white">
            Candidate <br />
            <span className="text-[#EDFF72]">Gateway.</span>
          </h1>
          <p className="text-[#A4A7A1] text-sm leading-relaxed max-w-[30rem] pt-1">
            Enter the access code from your instructor to unlock the verified coding sandbox. Every session is audited in real time.
          </p>
        </div>

        {/* Bottom: Numbered List with Hairline Dividers (NOT Cards) */}
        <div className="relative z-10 border-t border-white/10 pt-4 space-y-4">
          <div className="flex items-start gap-3.5">
            <span className="font-mono text-xs font-semibold text-[#EDFF72] mt-0.5">01</span>
            <div>
              <div className="text-[15px] font-semibold text-white tracking-tight">Zero-leak guard</div>
              <div className="text-[13.5px] text-[#9A9D97] leading-snug mt-0.5">
                Private test cases and reference logic stay on the secure backend.
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-4 flex items-start gap-3.5">
            <span className="font-mono text-xs font-semibold text-[#EDFF72] mt-0.5">02</span>
            <div>
              <div className="text-[15px] font-semibold text-white tracking-tight">Server-synchronized timer</div>
              <div className="text-[13.5px] text-[#9A9D97] leading-snug mt-0.5">
                Your time is tracked on server clocks, so every candidate gets the same fair duration.
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-4 flex items-start gap-3.5">
            <span className="font-mono text-xs font-semibold text-[#EDFF72] mt-0.5">03</span>
            <div>
              <div className="text-[15px] font-semibold text-white tracking-tight">Multi-language sandbox</div>
              <div className="text-[13.5px] text-[#9A9D97] leading-snug mt-0.5">
                Compile and run JavaScript, Python, Java and C++ in the editor.
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── RIGHT ACTION AREA ──────────────────────────────────────────────── */}
      <main className="flex-1 p-[clamp(24px,3.4vw,48px)] flex flex-col justify-between overflow-y-auto">
        {/* Top Bar */}
        <header className="flex items-center justify-between pb-6">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 text-xs font-bold text-[#171819] hover:text-[#777D78] transition-colors cursor-pointer group"
          >
            <ArrowLeft className="h-4 w-4 text-[#777D78] group-hover:text-[#171819] transition-colors" />
            <span>Back to dashboard</span>
          </button>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#777D78]">
            Step 1 of 2 · Access verification
          </span>
        </header>

        {/* Form Container (Vertically centered, max 560px) */}
        <div className="w-full max-w-[560px] mx-auto my-auto py-8">
          <div className="space-y-2 mb-8">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#777D78]">
              Join examination
            </div>
            <h2 className="text-[clamp(30px,3.4vw,44px)] font-semibold tracking-[-0.05em] text-[#171819] leading-tight">
              Enter your access code.
            </h2>
            <p className="text-sm text-[#777D78] leading-relaxed">
              The code was shared by your instructor or institution. It looks like TF-A1B2C3.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-7">
            {/* SEGMENTED ACCESS CODE INPUT */}
            <div>
              <label className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#777D78] block mb-2.5">
                Examination Access Code
              </label>

              <div
                role="group"
                aria-label="Examination access code"
                className={`flex items-center gap-2 sm:gap-2.5 transition-transform duration-200 ${
                  isShaking ? 'animate-[shake_0.45s_ease-in-out]' : ''
                }`}
                style={{
                  animation: isShaking ? 'cellShake 0.45s ease-in-out' : 'none'
                }}
              >
                {/* Fixed TF- Prefix */}
                <div
                  aria-hidden="true"
                  className="font-mono text-[22px] sm:text-[24px] font-semibold text-[#777D78] select-none pr-1 tracking-tight"
                >
                  TF–
                </div>

                {/* 6 Alphanumeric Cells */}
                {codeCells.map((char, idx) => {
                  const isFilled = Boolean(char);
                  return (
                    <input
                      key={idx}
                      ref={(el) => (cellRefs.current[idx] = el)}
                      type="text"
                      maxLength={1}
                      value={char}
                      aria-label={`Character ${idx + 1}`}
                      onChange={(e) => handleCellChange(idx, e.target.value)}
                      onKeyDown={(e) => handleCellKeyDown(idx, e)}
                      onPaste={handleCellPaste}
                      onFocus={(e) => e.target.select()}
                      className={`flex-1 max-w-[58px] aspect-[0.82] text-center font-mono text-[24px] sm:text-[26px] font-semibold uppercase bg-white rounded-[14px] outline-none transition-all duration-200 shadow-2xs ${
                        isFilled ? 'border-[#191A1D] border-[1.5px]' : 'border-[#DDE1DA] border-[1.5px]'
                      } focus:border-[#191A1D] focus:ring-4 focus:ring-[#EDFF72]/85 focus:-translate-y-0.5`}
                    />
                  );
                })}
              </div>

              {/* Status Line */}
              <div
                aria-live="polite"
                className="min-h-[22px] mt-2.5 text-xs text-[#171819] flex items-center gap-2 font-medium"
              >
                {isLoading ? (
                  <span className="text-[#777D78] flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-[#191A1D] border-t-transparent rounded-full animate-spin inline-block" />
                    Checking the code with the server…
                  </span>
                ) : errorMessage ? (
                  <span className="text-[#191A1D] flex items-center gap-1.5 font-semibold">
                    <AlertCircle className="h-4 w-4 text-[#191A1D] shrink-0" />
                    {errorMessage}
                  </span>
                ) : null}
              </div>
            </div>

            {/* UNDERLINE CREDENTIAL INPUTS (No boxes) */}
            <div className="space-y-5 pt-1">
              {/* Candidate Full Name */}
              <div>
                <label
                  htmlFor="candidate-name"
                  className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#777D78] block"
                >
                  Candidate full name *
                </label>
                <input
                  id="candidate-name"
                  type="text"
                  required
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  className="w-full bg-transparent border-b-[1.5px] border-[#DDE1DA] focus:border-[#191A1D] py-2 text-[17px] text-[#171819] placeholder:text-[#A4A7A1] outline-none transition-colors"
                />
              </div>

              {/* Email Address */}
              <div>
                <label
                  htmlFor="candidate-email"
                  className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#777D78] block"
                >
                  Email address *
                </label>
                <input
                  id="candidate-email"
                  type="email"
                  required
                  value={candidateEmail}
                  onChange={(e) => setCandidateEmail(e.target.value)}
                  placeholder="e.g. alex.rivera@university.edu"
                  className="w-full bg-transparent border-b-[1.5px] border-[#DDE1DA] focus:border-[#191A1D] py-2 text-[17px] text-[#171819] placeholder:text-[#A4A7A1] outline-none transition-colors"
                />
              </div>

              {/* Roll / Student ID */}
              <div>
                <label
                  htmlFor="candidate-roll"
                  className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#777D78] block"
                >
                  Student / roll number <span className="normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  id="candidate-roll"
                  type="text"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  placeholder="e.g. CS2026-042"
                  className="w-full bg-transparent border-b-[1.5px] border-[#DDE1DA] focus:border-[#191A1D] py-2 text-[17px] text-[#171819] placeholder:text-[#A4A7A1] outline-none transition-colors"
                />
              </div>
            </div>

            {/* BUTTONS (Pills) */}
            <div className="pt-3 space-y-3">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#191A1D] hover:bg-[#2A2B2F] active:scale-[0.99] text-white font-medium py-3.5 px-6 rounded-full transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed text-sm"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verifying code</span>
                  </>
                ) : (
                  <>
                    <span>Continue to exam brief</span>
                    <ArrowRight className="h-4 w-4 text-[#EDFF72]" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleBack}
                className="w-full bg-transparent hover:bg-[#E9ECE7] active:scale-[0.99] border border-[#DDE1DA] hover:border-[#191A1D] text-[#171819] font-medium py-3 px-6 rounded-full transition-all duration-200 flex items-center justify-center text-sm cursor-pointer"
              >
                Cancel and return
              </button>
            </div>

            {/* Footer Assurance */}
            <div className="pt-2 text-center">
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#777D78] flex items-center justify-center gap-1.5">
                <Lock className="h-3 w-3 text-[#777D78]" />
                Encrypted TLS session · isolated candidate state
              </span>
            </div>
          </form>
        </div>

        {/* Bottom spacing helper */}
        <div className="h-4" />
      </main>

      {/* Scoped CSS Keyframes for Shake */}
      <style>{`
        @keyframes cellShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
};

export default StudentJoinView;

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Search,
  Plus,
  Filter,
  Download,
  Upload,
  MoreVertical,
  Mail,
  GraduationCap,
  Award,
  ShieldAlert,
  CheckCircle2,
  ChevronDown,
  X,
  ArrowRight,
  Sparkles,
  BookOpen,
  Calendar,
  Layers,
  FileText
} from 'lucide-react';
import { api } from '../../lib/api';

// Smooth number counter transition
const AnimatedCount = ({ value, duration = 900 }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame;
    const start = performance.now();
    const numVal = Number(value) || 0;
    const step = (now) => {
      const elapsed = now - start;
      const k = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(Math.round(numVal * eased));
      if (k < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{display}</>;
};

// Initial student roster data
const DEFAULT_STUDENTS = [
  {
    id: 'std-1',
    name: 'Aarav Sharma',
    email: 'aarav.sharma@institution.edu',
    cohort: 'CS-2026 A',
    rollNo: '22BCS014',
    examsAttempted: 8,
    avgScore: 92,
    integrityRate: 100,
    status: 'ACTIVE',
    lastActive: '12 mins ago'
  },
  {
    id: 'std-2',
    name: 'Diya Patel',
    email: 'diya.patel@institution.edu',
    cohort: 'CS-2026 A',
    rollNo: '22BCS028',
    examsAttempted: 7,
    avgScore: 88,
    integrityRate: 98,
    status: 'ACTIVE',
    lastActive: '1 hour ago'
  },
  {
    id: 'std-3',
    name: 'Rohan Verma',
    email: 'rohan.verma@institution.edu',
    cohort: 'CS-2026 B',
    rollNo: '22BCS042',
    examsAttempted: 6,
    avgScore: 76,
    integrityRate: 95,
    status: 'ACTIVE',
    lastActive: '3 hours ago'
  },
  {
    id: 'std-4',
    name: 'Ananya Iyer',
    email: 'ananya.iyer@institution.edu',
    cohort: 'DSA-Advanced',
    rollNo: '22BCS089',
    examsAttempted: 9,
    avgScore: 96,
    integrityRate: 100,
    status: 'ACTIVE',
    lastActive: 'Just now'
  },
  {
    id: 'std-5',
    name: 'Kabir Mehta',
    email: 'kabir.mehta@institution.edu',
    cohort: 'CS-2026 B',
    rollNo: '22BCS103',
    examsAttempted: 5,
    avgScore: 68,
    integrityRate: 88,
    status: 'FLAGGED',
    lastActive: 'Yesterday'
  },
  {
    id: 'std-6',
    name: 'Sneha Kulkarni',
    email: 'sneha.k@institution.edu',
    cohort: 'DSA-Advanced',
    rollNo: '22BCS117',
    examsAttempted: 8,
    avgScore: 84,
    integrityRate: 99,
    status: 'ACTIVE',
    lastActive: '2 days ago'
  }
];

export const StudentsView = ({ onNavigateToExams, currentUser }) => {
  const isDummyAccount = useMemo(() => {
    if (!currentUser) return false;
    const email = (currentUser.email || '').toLowerCase();
    return email === 'teacher@testforge.edu' || email === 'student@testforge.edu';
  }, [currentUser]);

  const isAuthenticatedUser = Boolean(currentUser && !isDummyAccount);

  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [cohortFilter, setCohortFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentCohort, setNewStudentCohort] = useState('CS-2026 A');
  const [newStudentRoll, setNewStudentRoll] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const heroRef = useRef(null);
  const tiltRef = useRef(null);

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/auth/students');
      const items = res.data?.data || [];
      if (isAuthenticatedUser) {
        setStudents(items);
      } else {
        setStudents(items.length > 0 ? items : DEFAULT_STUDENTS);
      }
    } catch {
      if (isAuthenticatedUser) {
        setStudents([]);
      } else {
        setStudents(DEFAULT_STUDENTS);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [isAuthenticatedUser]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const name = s.name || '';
      const email = s.email || '';
      const roll = s.rollNo || s.rollNumber || '';
      const matchSearch =
        searchQuery === '' ||
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        roll.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCohort = cohortFilter === 'ALL' || s.cohort === cohortFilter;
      const matchStatus = statusFilter === 'ALL' || s.status === statusFilter;
      return matchSearch && matchCohort && matchStatus;
    });
  }, [students, searchQuery, cohortFilter, statusFilter]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = students.length;
    const avgCohort = Math.round(students.reduce((acc, s) => acc + (s.avgScore || 0), 0) / (total || 1));
    const highPerformers = students.filter((s) => (s.avgScore || 0) >= 85).length;
    const integrityScore = Math.round(students.reduce((acc, s) => acc + (s.integrityRate || 100), 0) / (total || 1));
    return { total, avgCohort, highPerformers, integrityScore };
  }, [students]);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentEmail.trim()) return;

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await api.post('/auth/students', {
        name: newStudentName.trim(),
        email: newStudentEmail.trim().toLowerCase(),
        cohort: newStudentCohort,
        rollNo: newStudentRoll.trim() || `TF-${Math.floor(1000 + Math.random() * 9000)}`
      });
      await fetchStudents();
      setIsAddStudentOpen(false);
      setNewStudentName('');
      setNewStudentEmail('');
      setNewStudentRoll('');
    } catch (err) {
      setErrorMessage(err?.customMessage || 'Failed to enroll student');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cursor Gyro Tilt Handlers
  const handleHeroMouseMove = (e) => {
    if (!heroRef.current || !tiltRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    tiltRef.current.style.transform = `rotateX(${-y * 18}deg) rotateY(${x * 24}deg)`;
  };

  const handleHeroMouseLeave = () => {
    if (!tiltRef.current) return;
    tiltRef.current.style.transform = 'rotateX(0deg) rotateY(0deg)';
  };

  return (
    <div className="tf-students-root select-none font-sans text-[#171819] pb-16">
      {/* ────────────────────────────────────────────────────────────────────────────
          SCOPED STYLES: 100% LIGHT THEME, 3D TELEMETRY PRISM, QUESTION BANK MOTIONS
          ──────────────────────────────────────────────────────────────────────────── */}
      <style>{`
        .tf-students-root {
          --canvas: #F2F3F0;
          --card: #FFFFFF;
          --line: #DDE1DA;
          --ink: #171819;
          --mute: #777D78;
          --acc: #EDFF72;
          --dark: #101112;
        }

        /* Top 2-Column Banner Grid */
        .tf-students-root .tf-top {
          display: grid;
          grid-template-columns: 1.55fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        @media (max-width: 1024px) {
          .tf-students-root .tf-top {
            grid-template-columns: 1fr;
          }
        }

        /* Bento Cards */
        .tf-students-root .tf-card {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 28px;
          position: relative;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }

        /* Hero Bento Card */
        .tf-students-root .tf-hero {
          background: #101112;
          color: #ffffff;
          padding: 32px 36px;
          border-radius: 32px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 290px;
          position: relative;
          overflow: hidden;
          border: 1px solid #232528;
        }

        /* Staggered Title Animations */
        .tf-students-root .hero-title {
          font-size: clamp(32px, 3.4vw, 46px);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.05;
          margin: 6px 0 10px;
          display: flex;
          flex-wrap: wrap;
        }
        .tf-students-root .tfTitleChar {
          display: inline-block;
          animation: tfCharIn 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
          animation-delay: calc(var(--ci) * 0.025s);
        }
        @keyframes tfCharIn {
          from {
            opacity: 0;
            transform: translateY(14px) rotate(4deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
        }

        /* 3D Prism Stage - Aligned like Create Question */
        .tf-students-root .stage {
          position: absolute;
          right: 12px;
          top: 0;
          bottom: 0;
          width: 46%;
          perspective: 850px;
          display: grid;
          place-items: center;
          pointer-events: none;
          z-index: 1;
        }
        .tf-students-root .stage .float {
          animation: tfPrismFloat 3.2s ease-in-out infinite;
          transform-style: preserve-3d;
        }
        @keyframes tfPrismFloat {
          0%, 100% {
            transform: translateY(0px) rotateZ(0deg);
          }
          50% {
            transform: translateY(-16px) rotateZ(2deg);
          }
        }
        .tf-students-root .tilt {
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform .12s ease-out;
          display: grid;
          place-items: center;
        }
        .tf-students-root .prism-gem {
          width: 155px;
          height: 155px;
          position: relative;
          transform-style: preserve-3d;
          transform: rotateX(25deg) rotateY(-25deg);
        }
        .tf-students-root .prism-face {
          position: absolute;
          inset: 0;
          border-radius: 28px;
          border: 2px solid rgba(237, 255, 114, 0.7);
          background: rgba(23, 24, 28, 0.9);
          box-shadow: 0 0 28px rgba(237, 255, 114, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tf-students-root .prism-ring {
          position: absolute;
          inset: -14px;
          border-radius: 50%;
          border: 2px dashed rgba(255, 255, 255, 0.35);
          animation: tfSpinPrism 16s linear infinite;
        }
        .tf-students-root .stage .shadow {
          position: absolute;
          bottom: 24px;
          width: 140px;
          height: 22px;
          border-radius: 50%;
          background: rgba(0,0,0,.55);
          filter: blur(10px);
          animation: tfShadow 3.2s ease-in-out infinite;
        }
        @keyframes tfShadow {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(0.72); opacity: 0.28; }
        }
        @keyframes tfSpinPrism {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* 2x2 Telemetry Cards */
        .tf-students-root .tf-quad {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .tf-students-root .tf-mini {
          padding: 22px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 136px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .tf-students-root .tf-mini:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.04);
        }
        .tf-students-root .tf-tile {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          background: #F2F3F0;
          border: 1px solid var(--line);
          display: grid;
          place-items: center;
          font-size: 14px;
          font-weight: 800;
          color: var(--ink);
          margin-bottom: 8px;
        }
        .tf-students-root .tf-cap {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .tf-students-root .tf-big {
          font-size: 32px;
          font-weight: 900;
          letter-spacing: -0.03em;
          color: var(--ink);
          line-height: 1;
        }
        .tf-students-root .tf-sub {
          font-size: 11px;
          font-weight: 600;
          color: var(--mute);
          margin-top: 4px;
        }

        /* Rise Entrance Animations */
        .tf-students-root .rise {
          animation: tfRise 0.45s ease backwards;
          animation-delay: calc(var(--k, 0) * 0.06s);
        }
        @keyframes tfRise {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* ────────────────────────────────────────────────────────────────────────────
          TOP 2-COLUMN BANNER GRID: HERO CARD + 4 STATS CARDS
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-top">
        {/* Left Hero Card with 3D Telemetry Prism */}
        <section
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
          className="tf-hero rise"
          style={{ '--k': 1 }}
        >
          <div className="max-w-[520px] relative z-10">
            {/* Pill Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1c1d22] border border-[#2d3036] text-[11px] font-mono font-bold tracking-wider text-[#d5dbd2] uppercase mb-2">
              <span className="w-2 h-2 rounded-full bg-[#EDFF72] shadow-[0_0_8px_#EDFF72]" />
              ACADEMIC ROSTER & COHORT DIRECTORY
            </div>

            {/* Animated Staggered Character Title */}
            <h1 className="hero-title" aria-label="Student Directory">
              {'Student Directory'.split('').map((ch, i) => (
                <span key={i} className="tfTitleChar" style={{ '--ci': i }}>
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              ))}
            </h1>

            <p className="text-xs text-[#a0a59e] max-w-[440px] leading-relaxed mb-6">
              Track student enrollment records, inspect individual performance transcripts, monitor proctor integrity scores, and organize academic cohorts.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => setIsAddStudentOpen(true)}
                className="px-5 py-2.5 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-xs font-black text-[#101112] shadow-sm transition-transform active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Enrol Student</span>
              </button>

              <button
                type="button"
                onClick={onNavigateToExams}
                className="px-4 py-2.5 rounded-full bg-[#1c1d22] hover:bg-[#252830] text-xs font-bold text-white border border-[#30333d] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#a0a59e]" />
                <span>View Active Exams</span>
              </button>
            </div>
          </div>

          {/* Footer Telemetry Strip */}
          <div className="pt-4 border-t border-[#23252a] flex items-center gap-5 text-xs text-[#8c9289] font-mono relative z-10 flex-wrap">
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={metrics.total} /></b> enrolled
            </span>
            <span>
              <b className="text-[#EDFF72] font-sans text-sm"><AnimatedCount value={metrics.avgCohort} />%</b> mean grade
            </span>
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={metrics.highPerformers} /></b> top performers
            </span>
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={metrics.integrityScore} />%</b> proctor pass
            </span>
          </div>

          {/* 3D Telemetry Prism Stage with Gyro Tilt */}
          <div className="stage" aria-hidden="true">
            <div className="float">
              <div className="tilt" ref={tiltRef}>
                <div className="prism-gem">
                  <div className="prism-ring" />
                  <div className="prism-face">
                    <GraduationCap className="w-10 h-10 text-[#EDFF72]" />
                  </div>
                </div>
              </div>
            </div>
            <div className="shadow" />
          </div>
        </section>

        {/* Right 2x2 Telemetry Cards Grid */}
        <div className="tf-quad">
          {/* Card 1: Total Enrolled */}
          <div className="tf-card tf-mini rise" style={{ '--k': 2 }}>
            <div className="tf-tile">
              <Users className="w-4 h-4 text-[#171819]" />
            </div>
            <div className="tf-cap">Enrolled Candidates</div>
            <div className="tf-big">
              <AnimatedCount value={metrics.total} />
            </div>
            <div className="tf-sub">Across 3 active cohorts</div>
          </div>

          {/* Card 2: Mean Cohort Score */}
          <div className="tf-card tf-mini rise" style={{ '--k': 3 }}>
            <div className="tf-tile">
              <Award className="w-4 h-4 text-[#171819]" />
            </div>
            <div className="tf-cap">Mean Cohort Score</div>
            <div className="tf-big">
              <AnimatedCount value={metrics.avgCohort} />%
            </div>
            <div className="tf-sub">Target benchmark 75%</div>
          </div>

          {/* Card 3: Top Tier Performers */}
          <div className="tf-card tf-mini rise" style={{ '--k': 4 }}>
            <div className="flex items-center justify-between">
              <div className="tf-tile">
                <Sparkles className="w-4 h-4 text-[#171819]" />
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Grade A+
              </span>
            </div>
            <div className="tf-cap">Honor Roll</div>
            <div className="tf-big">
              <AnimatedCount value={metrics.highPerformers} />
            </div>
            <div className="tf-sub">&gt;85% composite score</div>
          </div>

          {/* Card 4: Integrity Engine */}
          <div className="tf-card tf-mini rise" style={{ '--k': 5 }}>
            <div className="flex items-center justify-between">
              <div className="tf-tile">
                <ShieldAlert className="w-4 h-4 text-[#171819]" />
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" />
            </div>
            <div className="tf-cap">Proctor Compliance</div>
            <div className="tf-big">
              <AnimatedCount value={metrics.integrityScore} />%
            </div>
            <div className="tf-sub">Zero critical breaches</div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          SEARCH & COHORT FILTER TOOLBAR
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-4 mb-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-black text-[#171819] tracking-tight">
            Enrolled Candidates
          </h2>
          <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#F2F3F0] text-[#777D78] border border-[#DDE1DA]">
            {filteredStudents.length} candidates
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Search Box */}
          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-[#777D78] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, roll number, email..."
              className="w-full bg-[#F2F3F0] border border-[#DDE1DA] focus:border-[#101112] rounded-full pl-9 pr-8 py-2 text-xs font-semibold text-[#171819] outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777D78] hover:text-[#171819]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Cohort Dropdown */}
          <select
            value={cohortFilter}
            onChange={(e) => setCohortFilter(e.target.value)}
            className="bg-[#F2F3F0] border border-[#DDE1DA] text-[#171819] text-xs font-bold rounded-xl px-3 py-2 outline-none cursor-pointer hover:border-[#101112] transition-colors"
          >
            <option value="ALL">All Cohorts</option>
            <option value="CS-2026 A">CS-2026 A</option>
            <option value="CS-2026 B">CS-2026 B</option>
            <option value="DSA-Advanced">DSA-Advanced</option>
          </select>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#F2F3F0] border border-[#DDE1DA] text-[#171819] text-xs font-bold rounded-xl px-3 py-2 outline-none cursor-pointer hover:border-[#101112] transition-colors"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="FLAGGED">Flagged</option>
          </select>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          STUDENT ROSTER TABLE
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F2F3F0] text-[#777D78] uppercase font-mono text-[10px] border-b border-[#DDE1DA]">
              <tr>
                <th className="py-3.5 px-4 font-bold">Candidate</th>
                <th className="py-3.5 px-4 font-bold">Cohort</th>
                <th className="py-3.5 px-4 font-bold">Roll Number</th>
                <th className="py-3.5 px-4 font-bold">Tests Taken</th>
                <th className="py-3.5 px-4 font-bold">Avg Score</th>
                <th className="py-3.5 px-4 font-bold">Integrity</th>
                <th className="py-3.5 px-4 font-bold">Status</th>
                <th className="py-3.5 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE1DA] bg-white">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-[#777D78]">
                    <div className="w-10 h-10 rounded-2xl bg-[#F2F3F0] flex items-center justify-center mx-auto mb-2 text-[#171819]">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-bold text-[#171819]">
                      {students.length === 0 ? 'No students enrolled in database' : 'No students match this filter'}
                    </div>
                    <div className="text-[11px] text-[#777D78] mt-1 max-w-xs mx-auto">
                      {students.length === 0
                        ? 'Enrol candidates using "+ Add Student" above to begin tracking live exam submissions and scores.'
                        : 'Try adjusting your search query, cohort, or status filter.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((std) => (
                  <tr key={std.id || std._id} className="hover:bg-[#F2F3F0]/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#101112] text-[#EDFF72] font-black text-xs flex items-center justify-center shrink-0">
                          {(std.name || std.email || 'S').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-[#171819] block">{std.name}</span>
                          <span className="text-[11px] text-[#777D78] font-mono">{std.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[#171819]">
                      {std.cohort || 'CS-2026'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-[#777D78]">
                      {std.rollNo || std.rollNumber || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-[#171819]">
                      {std.testsCount ?? std.examsAttempted ?? 0} exams
                    </td>
                    <td className="py-3.5 px-4 font-mono font-black text-[#171819]">
                      {std.avgScore || 0}%
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {std.integrityRate ?? 100}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                          std.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {std.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedStudent(std)}
                        className="px-3 py-1.5 rounded-full bg-[#F2F3F0] hover:bg-[#101112] hover:text-white text-xs font-bold text-[#171819] transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                      >
                        <span>Report</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL: ADD CANDIDATE
          ──────────────────────────────────────────────────────────────────────────── */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 bg-[#101112]/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-[#DDE1DA] rounded-[32px] p-7 max-w-md w-full space-y-5 shadow-2xl relative animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
              <div>
                <h3 className="text-base font-black text-[#171819]">Enrol New Candidate</h3>
                <p className="text-xs text-[#777D78]">Add student to active assessment roster</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddStudentOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStudent} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[#171819] uppercase mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="e.g. Diya Patel"
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#171819] uppercase mb-1">
                  Institutional Email *
                </label>
                <input
                  type="email"
                  required
                  value={newStudentEmail}
                  onChange={(e) => setNewStudentEmail(e.target.value)}
                  placeholder="e.g. diya.patel@institution.edu"
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-semibold text-[#171819] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#171819] uppercase mb-1">Cohort</label>
                  <select
                    value={newStudentCohort}
                    onChange={(e) => setNewStudentCohort(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] outline-none"
                  >
                    <option value="CS-2026 A">CS-2026 A</option>
                    <option value="CS-2026 B">CS-2026 B</option>
                    <option value="DSA-Advanced">DSA-Advanced</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#171819] uppercase mb-1">Roll Number</label>
                  <input
                    type="text"
                    value={newStudentRoll}
                    onChange={(e) => setNewStudentRoll(e.target.value)}
                    placeholder="e.g. 22BCS028"
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] outline-none"
                  />
                </div>
              </div>

              {errorMessage && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {errorMessage}
                </div>
              )}

              <div className="pt-3 border-t border-[#DDE1DA] flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsAddStudentOpen(false)}
                  className="px-4 py-2 rounded-full text-xs font-bold text-[#777D78] hover:text-[#171819]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-[#101112] text-xs font-black shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Enrolling…' : 'Enrol Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODAL: STUDENT REPORT TRANSCRIPT
          ──────────────────────────────────────────────────────────────────────────── */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 bg-[#101112]/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-[#DDE1DA] rounded-[32px] p-7 max-w-lg w-full space-y-5 shadow-2xl relative animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE1DA]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#101112] text-[#EDFF72] font-black text-sm flex items-center justify-center">
                  {selectedStudent.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-black text-[#171819]">{selectedStudent.name}</h3>
                  <span className="text-xs text-[#777D78] font-mono">{selectedStudent.rollNo} • {selectedStudent.cohort}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="w-7 h-7 rounded-full bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="p-3 rounded-2xl bg-[#F2F3F0]">
                <span className="text-[10px] text-[#777D78] font-bold block uppercase">Tests Taken</span>
                <span className="text-lg font-black text-[#171819]">{selectedStudent.examsAttempted}</span>
              </div>
              <div className="p-3 rounded-2xl bg-[#F2F3F0]">
                <span className="text-[10px] text-[#777D78] font-bold block uppercase">Average</span>
                <span className="text-lg font-black text-[#171819]">{selectedStudent.avgScore}%</span>
              </div>
              <div className="p-3 rounded-2xl bg-[#F2F3F0]">
                <span className="text-[10px] text-[#777D78] font-bold block uppercase">Integrity</span>
                <span className="text-lg font-black text-emerald-700">{selectedStudent.integrityRate}%</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] space-y-2 text-xs">
              <span className="font-bold text-[#171819] block">Recent Examination Activity:</span>
              <div className="space-y-1.5 text-[11px] text-[#777D78]">
                <div className="flex justify-between">
                  <span>Data Structures Midterm</span>
                  <span className="font-bold text-[#171819]">94% (Pass)</span>
                </div>
                <div className="flex justify-between">
                  <span>Algorithms Quiz 2</span>
                  <span className="font-bold text-[#171819]">88% (Pass)</span>
                </div>
                <div className="flex justify-between">
                  <span>Database Systems Diagnostic</span>
                  <span className="font-bold text-[#171819]">91% (Pass)</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#DDE1DA] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="px-5 py-2 bg-[#101112] hover:bg-black text-white text-xs font-bold rounded-full cursor-pointer"
              >
                Close Transcript
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentsView;

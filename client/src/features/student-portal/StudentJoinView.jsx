import React, { useState } from 'react';
import { api } from '../../lib/api';
import {
  ShieldCheck,
  KeyRound,
  User,
  Mail,
  GraduationCap,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  Lock,
  Clock,
  Terminal,
  CheckCircle2
} from 'lucide-react';

export const StudentJoinView = ({ onJoined, onBack, initialExamCode = '', currentUser = null }) => {
  const [examCode, setExamCode] = useState(initialExamCode);
  const [candidateName, setCandidateName] = useState(currentUser?.name || '');
  const [candidateEmail, setCandidateEmail] = useState(currentUser?.email || '');
  const [rollNumber, setRollNumber] = useState(currentUser?.rollNumber || currentUser?.studentId || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

    if (!examCode.trim()) {
      setErrorMessage('Please enter your 6-digit Examination Access Code.');
      return;
    }
    if (!candidateName.trim()) {
      setErrorMessage('Please enter your full legal name for the score transcript.');
      return;
    }
    if (!candidateEmail.trim() || !candidateEmail.includes('@')) {
      setErrorMessage('Please enter a valid academic or personal email address.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await api.post('/attempts/join', {
        examCode: examCode.trim().toUpperCase(),
        candidateInfo: {
          name: candidateName.trim(),
          email: candidateEmail.trim().toLowerCase(),
          rollNumber: rollNumber.trim()
        }
      });

      const data = res.data.data;
      // Pass data to parent to transition to instructions or workspace
      onJoined(data);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.customMessage ||
        'Failed to access examination. Please verify your code.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#F2F3F0]">
      {/* Top Navigation Row */}
      <div className="w-full max-w-4xl mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#DDE1DA] hover:bg-[#F5F6F3] hover:border-[#171819] active:scale-95 text-xs font-bold text-[#171819] transition-all cursor-pointer shadow-xs group"
        >
          <ArrowLeft className="h-4 w-4 text-[#777D78] group-hover:text-[#171819] transition-colors" />
          <span>Back to Dashboard</span>
        </button>

        <div className="text-[11px] font-semibold text-[#777D78] hidden sm:block">
          Assessment Access Verification
        </div>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Information Panel */}
        <div className="lg:col-span-5 space-y-6 text-[#171819]">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#DDE1DA] text-[#171819] text-xs font-semibold tracking-wide shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>EXAMINATION PORTAL</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#171819] tracking-tight leading-tight">
              TestForge <br />
              <span className="text-[#777D78]">Candidate Gateway</span>
            </h1>
            <p className="text-sm text-[#777D78] leading-relaxed">
              Enter your designated assessment credentials to unlock the verified coding sandbox. All test environments are real-time audited with Zero-Leak integrity.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border border-[#DDE1DA] shadow-xs">
              <div className="p-2 rounded-xl bg-[#F5F6F3] text-emerald-700 shrink-0 mt-0.5 border border-[#DDE1DA]">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#171819]">Zero-Leak Guard</h4>
                <p className="text-[11px] text-[#777D78] mt-0.5">
                  Private test cases and reference logic are isolated on the secure backend.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border border-[#DDE1DA] shadow-xs">
              <div className="p-2 rounded-xl bg-[#F5F6F3] text-amber-700 shrink-0 mt-0.5 border border-[#DDE1DA]">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#171819]">Server-Synchronized Timer</h4>
                <p className="text-[11px] text-[#777D78] mt-0.5">
                  Assessment duration is tracked by atomic server clocks, preserving test fairness.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border border-[#DDE1DA] shadow-xs">
              <div className="p-2 rounded-xl bg-[#F5F6F3] text-[#171819] shrink-0 mt-0.5 border border-[#DDE1DA]">
                <Terminal className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#171819]">Multi-Language Sandbox</h4>
                <p className="text-[11px] text-[#777D78] mt-0.5">
                  Full compile & execute support for JavaScript, Python, Java, and C++.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Card */}
        <div className="lg:col-span-7">
          <div className="bg-white border border-[#DDE1DA] rounded-3xl p-6 sm:p-8 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between pb-5 border-b border-[#DDE1DA] mb-6">
              <div>
                <h2 className="text-xl font-bold text-[#171819]">Join Examination</h2>
                <p className="text-xs text-[#777D78] mt-0.5">
                  Enter access code provided by your instructor or institution
                </p>
              </div>
              <div className="p-2.5 rounded-2xl bg-[#191A1D] text-[#EDFF72]">
                <KeyRound className="h-5 w-5" />
              </div>
            </div>

            {errorMessage && (
              <div className="mb-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-700 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <div className="flex-1">
                  <span className="font-bold">Access Denied:</span> {errorMessage}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Exam Code Input */}
              <div>
                <label className="block text-xs font-bold text-[#171819] uppercase tracking-wider mb-1.5">
                  Examination Access Code <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#777D78]">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={examCode}
                    onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                    placeholder="e.g. TF-A8F29C"
                    className="w-full bg-[#F5F6F3] border border-[#DDE1DA] focus:border-[#191A1D] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#171819] font-mono uppercase tracking-widest placeholder:text-[#777D78] outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Candidate Full Name */}
              <div>
                <label className="block text-xs font-bold text-[#171819] uppercase tracking-wider mb-1.5">
                  Candidate Full Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#777D78]">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full bg-[#F5F6F3] border border-[#DDE1DA] focus:border-[#191A1D] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#171819] placeholder:text-[#777D78] outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-bold text-[#171819] uppercase tracking-wider mb-1.5">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#777D78]">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="e.g. alex.morgan@university.edu"
                    className="w-full bg-[#F5F6F3] border border-[#DDE1DA] focus:border-[#191A1D] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#171819] placeholder:text-[#777D78] outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Roll / Student ID */}
              <div>
                <label className="block text-xs font-bold text-[#171819] uppercase tracking-wider mb-1.5">
                  Student / Roll Number <span className="text-[#777D78] font-normal lowercase">(optional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#777D78]">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    placeholder="e.g. CS2026-042"
                    className="w-full bg-[#F5F6F3] border border-[#DDE1DA] focus:border-[#191A1D] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#171819] placeholder:text-[#777D78] outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#191A1D] hover:bg-[#2A2B2F] active:scale-[0.99] text-white font-bold py-3 px-6 rounded-xl transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Verifying Examination Code...</span>
                    </>
                  ) : (
                    <>
                      <span>Proceed to Exam Brief</span>
                      <ArrowRight className="h-4 w-4 text-[#EDFF72]" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full py-2.5 px-4 rounded-xl border border-[#DDE1DA] hover:bg-[#F5F6F3] text-xs font-bold text-[#777D78] hover:text-[#171819] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Cancel & Return</span>
                </button>
              </div>

              <div className="pt-2 text-center">
                <span className="text-[11px] text-[#777D78] flex items-center justify-center gap-1.5">
                  <Lock className="h-3 w-3 text-[#777D78]" />
                  Encrypted TLS Session • Isolated Candidate State
                </span>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentJoinView;

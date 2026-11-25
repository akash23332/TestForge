import React, { useState } from 'react';
import { api } from '../../../lib/api';
import {
  KeyRound,
  ShieldCheck,
  Clock,
  Award,
  HelpCircle,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Lock,
  RotateCw
} from 'lucide-react';

export const StudentJoinPage = ({
  currentUser,
  initialCode = '',
  onStartExam,
  onViewResult
}) => {
  const [code, setCode] = useState(initialCode);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [errorNotice, setErrorNotice] = useState('');

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    setErrorNotice('');

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setErrorNotice('Please enter a 6- or 7-character access code (e.g. TF-0000).');
      return;
    }

    setIsVerifying(true);
    setVerifyResult(null);

    try {
      const res = await api.post('/attempts/verify-code', {
        examCode: cleanCode,
        candidateEmail: currentUser?.email
      });

      const data = res.data?.data;
      setVerifyResult(data);
    } catch (err) {
      setErrorNotice(
        err.response?.data?.message ||
        err.customMessage ||
        'Unable to verify examination code. Please check your network and try again.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleVerify(e);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* ── LEFT CARD: TEST CODE INPUT ── */}
      <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#191A1D] text-[#EDFF72] text-[11px] font-mono font-bold uppercase mb-2">
            <KeyRound className="size-3" />
            <span>Direct Access</span>
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-[#171819] tracking-tight">
            Enter Examination Code
          </h2>
          <p className="text-xs text-[#777D78] mt-1">
            Provided by your teacher or institutional department. Enter the code to preview and start.
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label htmlFor="test-code-input" className="block text-xs font-semibold text-[#171819] mb-1.5">
              Access Code
            </label>
            <input
              id="test-code-input"
              type="text"
              maxLength={7}
              placeholder="TF-0000"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              spellCheck="false"
              className="w-full h-14 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0] px-4 font-mono text-2xl font-bold uppercase tracking-[0.14em] text-[#171819] placeholder:text-[#A0A59F] focus:border-[#171819] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#EDFF72] transition-all"
            />
          </div>

          {errorNotice && (
            <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0 text-amber-700" />
              <span>{errorNotice}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isVerifying || !code.trim()}
            className="w-full h-12 rounded-full bg-[#191A1D] hover:bg-black text-[#EDFF72] text-xs font-bold transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {isVerifying ? (
              <>
                <RotateCw className="size-4 animate-spin text-[#EDFF72]" />
                <span>Verifying code…</span>
              </>
            ) : (
              <span>Verify code</span>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-[#DDE1DA] text-xs text-[#777D78] space-y-2">
          <div className="flex items-start gap-2">
            <ShieldCheck className="size-4 text-[#171819] shrink-0 mt-0.5" />
            <span>Codes are single-use per candidate. Once submitted, answers cannot be modified.</span>
          </div>
          <div className="flex items-start gap-2">
            <Lock className="size-4 text-[#171819] shrink-0 mt-0.5" />
            <span>Your candidate identity ({currentUser?.name || 'Student'}) is automatically linked.</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT CARD: TEST PREVIEW ── */}
      <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-6 sm:p-8 shadow-xs min-h-[360px] flex flex-col justify-between">
        <div>
          <div className="pb-4 border-b border-[#DDE1DA] mb-6 flex items-center justify-between">
            <h3 className="text-base font-bold text-[#171819]">Test Preview</h3>
            {verifyResult?.status && (
              <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                verifyResult.status === 'ELIGIBLE' || verifyResult.status === 'IN_PROGRESS'
                  ? 'bg-[#EDFF72] text-[#191A1D]'
                  : verifyResult.status === 'ALREADY_ATTEMPTED'
                  ? 'bg-[#191A1D] text-white'
                  : 'bg-[#F2F3F0] text-[#777D78]'
              }`}>
                {verifyResult.status.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          {/* 1. Shimmer Skeleton State While Verifying */}
          {isVerifying && (
            <div className="space-y-4 py-6 animate-pulse" aria-busy="true">
              <div className="h-6 w-3/4 bg-[#E9ECE7] rounded-md" />
              <div className="h-4 w-1/2 bg-[#E9ECE7] rounded-md" />
              <div className="grid grid-cols-2 gap-3 pt-4">
                <div className="h-16 bg-[#E9ECE7] rounded-xl" />
                <div className="h-16 bg-[#E9ECE7] rounded-xl" />
              </div>
              <div className="h-20 bg-[#E9ECE7] rounded-xl pt-2" />
            </div>
          )}

          {/* 2. Idle Empty State */}
          {!isVerifying && !verifyResult && (
            <div className="py-16 text-center space-y-3">
              <div className="size-12 rounded-2xl bg-[#F2F3F0] text-[#777D78] mx-auto flex items-center justify-center">
                <KeyRound className="size-6" />
              </div>
              <h4 className="text-sm font-bold text-[#171819]">Awaiting Code Verification</h4>
              <p className="text-xs text-[#777D78] max-w-xs mx-auto">
                Enter your test access code on the left and click "Verify code" to inspect test parameters and eligibility.
              </p>
            </div>
          )}

          {/* 3. Server Response States */}
          {!isVerifying && verifyResult && (
            <div className="space-y-6">
              {/* SUCCESS / ELIGIBLE STATE */}
              {(verifyResult.status === 'ELIGIBLE' || verifyResult.status === 'IN_PROGRESS') && verifyResult.preview && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-lg font-bold text-[#171819] leading-snug">
                      {verifyResult.preview.title}
                    </h4>
                    <p className="text-xs text-[#777D78] mt-0.5">
                      {verifyResult.preview.teacher} · {verifyResult.preview.subject}
                    </p>
                  </div>

                  {/* 4 Info Tiles: Duration, Total marks, Questions, Deadline */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl border border-[#DDE1DA] bg-[#F2F3F0]">
                      <span className="block text-[10px] uppercase font-bold text-[#777D78]">Duration</span>
                      <span className="block font-mono text-sm font-bold text-[#171819] mt-0.5">
                        {verifyResult.preview.duration}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border border-[#DDE1DA] bg-[#F2F3F0]">
                      <span className="block text-[10px] uppercase font-bold text-[#777D78]">Total Marks</span>
                      <span className="block font-mono text-sm font-bold text-[#171819] mt-0.5">
                        {verifyResult.preview.totalMarks}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border border-[#DDE1DA] bg-[#F2F3F0]">
                      <span className="block text-[10px] uppercase font-bold text-[#777D78]">Questions</span>
                      <span className="block font-mono text-sm font-bold text-[#171819] mt-0.5">
                        {verifyResult.preview.questions}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border border-[#DDE1DA] bg-[#F2F3F0]">
                      <span className="block text-[10px] uppercase font-bold text-[#777D78]">Deadline</span>
                      <span className="block font-mono text-[11px] font-bold text-[#171819] mt-0.5 truncate" title={verifyResult.preview.deadline}>
                        {verifyResult.preview.deadline}
                      </span>
                    </div>
                  </div>

                  {/* Instructions List */}
                  <div className="p-4 rounded-xl border border-[#DDE1DA] bg-[#F9FAF8] space-y-1.5">
                    <span className="block text-xs font-bold text-[#171819] mb-1">Examination Instructions:</span>
                    <ul className="text-xs text-[#777D78] space-y-1 list-disc list-inside">
                      <li>The examination timer cannot be paused once started.</li>
                      <li>Answers autosave continuously and can be saved manually.</li>
                      <li>Questions can be marked for review from the palette.</li>
                      <li>The test auto-submits automatically when time ends.</li>
                    </ul>
                  </div>

                  {/* Eligibility Message on Lime Background */}
                  <div className="p-3.5 rounded-xl bg-[#EDFF72] text-[#171819] text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>{verifyResult.message || 'You are eligible to take this test.'}</span>
                  </div>

                  {/* Action Button */}
                  <button
                    type="button"
                    onClick={() => onStartExam(code.trim().toUpperCase())}
                    className="w-full h-12 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-[#191A1D] text-xs font-bold flex items-center justify-center gap-2 transition-transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-md"
                  >
                    <span>{verifyResult.isResuming ? 'Resume in-progress test →' : 'Start test →'}</span>
                  </button>
                </div>
              )}

              {/* INVALID CODE STATE */}
              {verifyResult.status === 'INVALID_CODE' && (
                <div className="p-6 rounded-2xl border border-rose-200 bg-rose-50/50 text-center space-y-3">
                  <div className="size-10 rounded-full bg-rose-100 text-rose-700 mx-auto flex items-center justify-center">
                    <AlertCircle className="size-5" />
                  </div>
                  <h4 className="text-sm font-bold text-rose-900">Invalid Code</h4>
                  <p className="text-xs text-rose-800 max-w-sm mx-auto">
                    {verifyResult.message || 'Invalid code. Check the code with your teacher and try again.'}
                  </p>
                </div>
              )}

              {/* EXPIRED STATE */}
              {verifyResult.status === 'EXPIRED' && (
                <div className="p-6 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0] text-center space-y-3">
                  <div className="size-10 rounded-full bg-[#E9ECE7] text-[#777D78] mx-auto flex items-center justify-center">
                    <Clock className="size-5" />
                  </div>
                  <h4 className="text-sm font-bold text-[#171819]">Examination Concluded</h4>
                  <p className="text-xs text-[#777D78] max-w-sm mx-auto">
                    {verifyResult.message || 'This test has expired and can no longer be started.'}
                  </p>
                </div>
              )}

              {/* ALREADY ATTEMPTED STATE */}
              {verifyResult.status === 'ALREADY_ATTEMPTED' && (
                <div className="p-6 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0] text-center space-y-4">
                  <div className="size-10 rounded-full bg-[#191A1D] text-[#EDFF72] mx-auto flex items-center justify-center">
                    <CheckCircle2 className="size-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#171819]">Already Attempted</h4>
                    <p className="text-xs text-[#777D78] max-w-sm mx-auto mt-1">
                      {verifyResult.message || 'You have already attempted this test. Each test can be attempted once.'}
                    </p>
                  </div>
                  {verifyResult.attemptId && onViewResult && (
                    <button
                      type="button"
                      onClick={() => onViewResult(verifyResult.attemptId)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#191A1D] text-[#EDFF72] text-xs font-bold hover:bg-black transition-colors cursor-pointer"
                    >
                      <span>View your result</span>
                      <ArrowRight className="size-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* NOT OPEN YET STATE */}
              {verifyResult.status === 'NOT_OPEN_YET' && (
                <div className="p-6 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0] text-center space-y-4">
                  <div className="size-10 rounded-full bg-[#E9ECE7] text-[#777D78] mx-auto flex items-center justify-center">
                    <Calendar className="size-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#171819]">Not Open Yet</h4>
                    <p className="text-xs text-[#777D78] max-w-sm mx-auto mt-1">
                      {verifyResult.message || 'This test is not open yet...'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="w-full h-11 rounded-full bg-[#E9ECE7] text-[#777D78] text-xs font-bold opacity-60 cursor-not-allowed"
                  >
                    Opens Soon
                  </button>
                </div>
              )}

              {/* UNPUBLISHED / NOT ASSIGNED STATE */}
              {(verifyResult.status === 'UNPUBLISHED' || verifyResult.status === 'NOT_ASSIGNED') && (
                <div className="p-6 rounded-2xl border border-[#DDE1DA] bg-[#F2F3F0] text-center space-y-3">
                  <div className="size-10 rounded-full bg-[#E9ECE7] text-[#777D78] mx-auto flex items-center justify-center">
                    <AlertCircle className="size-5" />
                  </div>
                  <h4 className="text-sm font-bold text-[#171819]">Access Unavailable</h4>
                  <p className="text-xs text-[#777D78] max-w-sm mx-auto">
                    {verifyResult.message || 'This test is not currently accessible to your account.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-[#DDE1DA] text-[11px] text-[#777D78] text-center">
          TestForge Examination Security Engine · Zero-Leak Student Sandbox
        </div>
      </div>
    </div>
  );
};

export default StudentJoinPage;

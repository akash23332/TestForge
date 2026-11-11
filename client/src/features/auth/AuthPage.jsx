import React, { useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import {
  Lock,
  Mail,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  FileCode2,
  Sparkles,
  School,
  Check,
  Laptop,
  Layers,
  Cpu,
  ArrowLeft,
  GraduationCap
} from 'lucide-react';

export const AuthPage = ({
  onSuccess,
  onNavigateHome,
  initialMode = 'login'
}) => {
  const [isRegister, setIsRegister] = useState(initialMode === 'register');
  const [role, setRole] = useState('teacher'); // 'teacher' | 'student'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [rollNumber, setRollNumber] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister
        ? { name, email, password, role }
        : { email, password };
      const res = await api.post(endpoint, payload);

      const { user, token } = res.data.data;
      localStorage.setItem('testforge_token', token);
      localStorage.setItem('testforge_user', JSON.stringify(user));
      onSuccess(user);
    } catch (err) {
      setError(err?.customMessage || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillTeacherDemo = () => {
    setIsRegister(false);
    setRole('teacher');
    setEmail('teacher@testforge.edu');
    setPassword('Teacher@123');
    setError(null);
  };

  const fillStudentDemo = () => {
    setIsRegister(false);
    setRole('student');
    setEmail('student@testforge.edu');
    setPassword('Student@123');
    setError(null);
  };

  return (
    <div className="min-h-[92vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 animate-fadeIn">
      {/* Outer Card: Large, Modern & High-End (like Vercel / LeetCode / Supabase) */}
      <div className="max-w-6xl w-full bg-white border border-slate-200/90 rounded-3xl sm:rounded-[36px] shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[720px]">
        {/* Left 5 Cols: High-Impact Dark Branding & Tech Showcase */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 p-8 sm:p-12 lg:p-14 text-white flex flex-col justify-between relative overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800">
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute -right-20 -bottom-20 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -top-20 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-8">
            {/* Logo & University Tag (Clickable to Home/Dashboard) */}
            <div
              onClick={onNavigateHome}
              className="flex items-center gap-3 cursor-pointer group select-none"
              title="Return to TestForge Dashboard"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-orange-600/30 group-hover:scale-105 transition-transform">
                TF
              </div>
              <div>
                <span className="text-2xl font-black tracking-tight text-white flex items-center gap-1 group-hover:text-orange-300 transition-colors">
                  Test<span className="text-orange-500">Forge</span>
                </span>
                <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-widest">
                  Academic Assessment Platform
                </span>
              </div>
            </div>

            {/* Core Value Proposition */}
            <div className="space-y-3 pt-2">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                {role === 'teacher' ? (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Faculty Enterprise Portal
                  </>
                ) : (
                  <>
                    <GraduationCap className="h-3.5 w-3.5 text-indigo-400" />
                    Student Examination Portal
                  </>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
                {role === 'teacher'
                  ? 'Empowering Computer Science Educators.'
                  : 'Real-Time Proctored Coding Assessments.'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
                {role === 'teacher'
                  ? 'Author verified coding problems, execute deterministic mutation suites to find test loopholes, and design multi-section online exams with zero student leaks.'
                  : 'Attempt live programming exams in an isolated zero-leak sandbox with instant test feedback, anti-cheat monitoring, and official transcripts.'}
              </p>
            </div>

            {/* Feature Highlights Grid */}
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
                <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 shrink-0">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">
                    {role === 'teacher' ? 'Automated Reference Validation' : 'Live Multi-Language Code Sandbox'}
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5 leading-normal">
                    {role === 'teacher'
                      ? 'Runs your master code in an isolated sandbox against edge cases and duplicate parameters.'
                      : 'Write, debug, and run code in Java, Python, C++, and Node.js with instant compiler feedback.'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 shrink-0">
                  <FileCode2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">
                    {role === 'teacher' ? 'Deterministic Mutation Testing' : 'Automatic Test Case Grading'}
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5 leading-normal">
                    {role === 'teacher'
                      ? 'Injects synthetic AST defects into your code to verify if your grading tests catch student bugs.'
                      : 'Evaluates correctness, edge cases, and runtime efficiency automatically upon submission.'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Zero-Leak Security Boundary</h4>
                  <p className="text-xs text-slate-300 mt-0.5 leading-normal">
                    {role === 'teacher'
                      ? 'Reference solutions and hidden grading test cases are strictly omitted from student-facing payloads.'
                      : 'Proctoring monitoring ensures tab-switch compliance, fair scoring, and certified transcripts.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Left Footer Info */}
          <div className="relative z-10 pt-8 mt-8 border-t border-slate-800/80 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              All Systems Operational
            </span>
            <span>Encrypted 256-bit JWT Session</span>
          </div>
        </div>

        {/* Right 7 Cols: Spacious, Natural & Clean Form */}
        <div className="lg:col-span-7 p-8 sm:p-12 lg:p-16 flex flex-col justify-between bg-white">
          <div className="max-w-lg mx-auto w-full space-y-6">
            {/* Top Bar with Navigation */}
            <div className="flex items-center justify-between">
              {/* Segmented Sign In / Register Switcher */}
              <div className="flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(false);
                    setError(null);
                  }}
                  className={`px-5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    !isRegister
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(true);
                    setError(null);
                  }}
                  className={`px-5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    isRegister
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {onNavigateHome && (
                <button
                  type="button"
                  onClick={onNavigateHome}
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
                </button>
              )}
            </div>

            {/* Account Role Selector (Available for BOTH Sign In & Registration) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Select Portal Access:
              </label>
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setRole('teacher');
                    setError(null);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    role === 'teacher'
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Teacher / Faculty</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRole('student');
                    setError(null);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    role === 'student'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span>Student / Candidate</span>
                </button>
              </div>
            </div>

            {/* Header Title */}
            <div>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {isRegister
                  ? role === 'teacher'
                    ? 'Register Faculty Account'
                    : 'Register Student Account'
                  : role === 'teacher'
                    ? 'Welcome Back, Faculty'
                    : 'Welcome Back, Student'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
                {isRegister
                  ? role === 'teacher'
                    ? 'Join your university assessment team to author coding questions and build test suites.'
                    : 'Create your student account to take proctored coding assessments and track results.'
                  : role === 'teacher'
                    ? 'Enter your institutional email and password to access your questions and exam drafts.'
                    : 'Enter your student credentials to join live assessments and review certified transcripts.'}
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3 font-semibold shadow-2xs">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {role === 'teacher' ? 'Full Academic Name *' : 'Student Full Name *'}
                    </label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={role === 'teacher' ? 'Dr. Sarah Mitchell / Prof. Sharma' : 'Alex Rivera'}
                        className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 font-medium transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  {role === 'teacher' ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Academic Department *
                      </label>
                      <div className="relative">
                        <School className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <select
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 font-semibold transition-all shadow-2xs"
                        >
                          <option value="Computer Science & Engineering">Computer Science & Engineering</option>
                          <option value="Information Technology">Information Technology</option>
                          <option value="Data Science & Artificial Intelligence">Data Science & Artificial Intelligence</option>
                          <option value="Software Engineering">Software Engineering</option>
                          <option value="Electrical & Electronics Engineering">Electrical & Electronics Engineering</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Roll Number / Student ID (Optional)
                      </label>
                      <div className="relative">
                        <School className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={rollNumber}
                          onChange={(e) => setRollNumber(e.target.value)}
                          placeholder="CS-2026-042"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 font-semibold transition-all shadow-2xs"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@testforge.edu"
                    className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 font-medium transition-all shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">Password *</label>
                  {!isRegister && (
                    <button
                      type="button"
                      onClick={() => alert('Password reset link will be dispatched to your email address.')}
                      className="text-xs font-bold text-orange-600 hover:text-orange-700 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-2xl pl-11 pr-11 py-3 text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 font-medium transition-all shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 font-semibold select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded-md text-orange-600 border-slate-300 focus:ring-orange-500"
                  />
                  <span>Keep me signed in for 30 days</span>
                </label>
              </div>

              {/* Large Prominent Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className={`w-full mt-3 py-3.5 px-6 rounded-2xl text-white font-extrabold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 ${
                  role === 'teacher'
                    ? 'bg-gradient-to-r from-orange-600 via-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-orange-600/30'
                    : 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-600/30'
                }`}
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>
                      {isRegister
                        ? role === 'teacher'
                          ? 'Create Faculty Account'
                          : 'Create Student Account'
                        : role === 'teacher'
                          ? 'Sign In as Faculty'
                          : 'Sign In as Student'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Credentials Boxes (Faculty vs Student) */}
            <div className="pt-6 border-t border-slate-100 space-y-3">
              <span className="text-[11px] uppercase font-extrabold text-slate-400 block tracking-wider">
                Instant Demo Portals
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Faculty Card */}
                <div
                  onClick={fillTeacherDemo}
                  className="p-3.5 rounded-2xl bg-orange-50 hover:bg-orange-100/80 border border-orange-200 transition-all cursor-pointer text-left group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-orange-900">Faculty Demo</span>
                    <Sparkles className="h-3.5 w-3.5 text-orange-600" />
                  </div>
                  <a
                    href="mailto:teacher@testforge.edu"
                    onClick={(e) => {
                      e.stopPropagation();
                      fillTeacherDemo();
                    }}
                    className="text-[11px] text-orange-800 font-mono block hover:underline"
                    title="Click to sign in with teacher email"
                  >
                    teacher@testforge.edu
                  </a>
                  <span className="text-[10px] text-orange-700 font-mono">
                    Pass: Teacher@123
                  </span>
                </div>

                {/* Student Card */}
                <div
                  onClick={fillStudentDemo}
                  className="p-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200 transition-all cursor-pointer text-left group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-amber-900">Student Demo</span>
                    <GraduationCap className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <a
                    href="mailto:student@testforge.edu"
                    onClick={(e) => {
                      e.stopPropagation();
                      fillStudentDemo();
                    }}
                    className="text-[11px] text-amber-800 font-mono block hover:underline"
                    title="Click to sign in with student email"
                  >
                    student@testforge.edu
                  </a>
                  <span className="text-[10px] text-amber-700 font-mono">
                    Pass: Student@123
                  </span>
                </div>
              </div>
            </div>

            {/* Platform Footer Info with Clickable Phone, Email & Dynamic Copyright */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
              <span>© {new Date().getFullYear()} TestForge Academic Systems. All rights reserved.</span>
              <div className="flex items-center gap-3">
                <a
                  href="tel:+18005553674"
                  className="hover:text-slate-900 transition-colors font-medium flex items-center gap-1"
                  title="Call Academic Support Hotline"
                >
                  <span>Tel:</span>
                  <span className="font-semibold">+1 (800) 555-3674</span>
                </a>
                <span>•</span>
                <a
                  href="mailto:support@testforge.edu"
                  className="hover:text-slate-900 transition-colors font-medium flex items-center gap-1"
                  title="Email Academic Support"
                >
                  <span>Email:</span>
                  <span className="font-semibold">support@testforge.edu</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;

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
  School
} from 'lucide-react';

interface AuthPageProps {
  onSuccess: (user: any) => void;
  onNavigateHome: () => void;
  initialMode?: 'login' | 'register';
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onSuccess,
  onNavigateHome,
  initialMode = 'login'
}) => {
  const [isRegister, setIsRegister] = useState(initialMode === 'register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister ? { name, email, password } : { email, password };
      const res = await api.post(endpoint, payload);

      const { user, token } = res.data.data;
      localStorage.setItem('testforge_token', token);
      localStorage.setItem('testforge_user', JSON.stringify(user));
      onSuccess(user);
    } catch (err: any) {
      setError(err.customMessage || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = () => {
    setIsRegister(false);
    setEmail('teacher@testforge.edu');
    setPassword('Teacher@123');
    setError(null);
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-10 px-4 sm:px-6 lg:px-8 animate-fadeIn">
      <div className="max-w-4xl w-full bg-white border border-slate-200/80 rounded-3xl shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* Left Column: Branding & Features (matching screenshot style) */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950 p-8 sm:p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-orange-600/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-orange-600/30">
                TF
              </div>
              <div>
                <span className="text-xl font-extrabold tracking-tight text-white">
                  Test<span className="text-orange-500">Forge</span>
                </span>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider -mt-1">
                  Faculty Assessment Portal
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />
                Lab Evaluation 1 Architecture
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
                Welcome to TestForge Faculty Portal
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Join instructors authoring high-confidence coding problems, running automated reference validations, and inspecting deterministic mutation quality.
              </p>
            </div>

            {/* Benefit bullets */}
            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3 text-xs text-slate-200">
                <div className="p-1 rounded bg-orange-500/20 text-orange-400 mt-0.5">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <span className="font-bold text-white">Signed JWT & RBAC: </span>
                  Secure owner-scoped question CRUD and token expiration.
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-slate-200">
                <div className="p-1 rounded bg-emerald-500/20 text-emerald-400 mt-0.5">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <span className="font-bold text-white">Zero Leak Boundary: </span>
                  Private solutions and hidden tests never reach student browsers.
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-slate-200">
                <div className="p-1 rounded bg-purple-500/20 text-purple-400 mt-0.5">
                  <FileCode2 className="h-4 w-4" />
                </div>
                <div>
                  <span className="font-bold text-white">Mutation Testing Engine: </span>
                  Detect weak test cases with injected bug survivors.
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-8 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>© 2026 TestForge Inc.</span>
            <span>ST1 MERN Syllabus</span>
          </div>
        </div>

        {/* Right Column: Form */}
        <div className="p-8 sm:p-12 flex flex-col justify-between">
          <div>
            {/* Top Toggle Switch */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(false);
                    setError(null);
                  }}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    !isRegister
                      ? 'bg-white text-slate-900 shadow-sm'
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
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    isRegister
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Register
                </button>
              </div>

              <button
                type="button"
                onClick={onNavigateHome}
                className="text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                Back to Home
              </button>
            </div>

            {/* Heading */}
            <div className="mb-6">
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {isRegister ? 'Create Faculty Account' : 'Faculty Sign In'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {isRegister
                  ? 'Enter your academic credentials to start creating coding assessments.'
                  : 'Enter your email and password to access your questions and exam drafts.'}
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
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
                      Full Name *
                    </label>
                    <div className="relative">
                      <UserIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Dr. Sarah Mitchell"
                        className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-medium transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Department
                    </label>
                    <div className="relative">
                      <School className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-orange-500 font-semibold"
                      >
                        <option value="Computer Science">Computer Science & Engineering</option>
                        <option value="Information Technology">Information Technology</option>
                        <option value="Data Science">Data Science & AI</option>
                        <option value="Software Engineering">Software Engineering</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Institutional Email *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teacher@testforge.edu"
                    className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-medium transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-medium transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" isLoading={loading} className="w-full mt-2 cursor-pointer shadow-md shadow-orange-500/20">
                {isRegister ? 'Register & Enter Workspace' : 'Sign In to Workspace'} <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </div>

          {/* Quick Demo Helper */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center space-y-3">
            <button
              type="button"
              onClick={fillDemoAccount}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100/80 border border-orange-200 px-4 py-2 rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" /> 1-Click Fill Demo Faculty Account
            </button>
            <p className="text-[11px] text-slate-400">
              Demo credentials: <span className="font-mono text-slate-600">teacher@testforge.edu</span> / <span className="font-mono text-slate-600">Teacher@123</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;

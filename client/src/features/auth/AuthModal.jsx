import React, { useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { X, Lock, Mail, User as UserIcon, CheckCircle2, GraduationCap, Sparkles } from 'lucide-react';

export const AuthModal = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser
}) => {
  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState('teacher'); // 'teacher' | 'student'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('teacher@testforge.edu');
  const [password, setPassword] = useState('Teacher@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isRegister && role === 'teacher') {
        setError('Faculty accounts must be provisioned by an institutional administrator. Please sign in or contact your department admin.');
        setLoading(false);
        return;
      }

      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister
        ? { name: name.trim(), email: email.trim().toLowerCase(), password, role: 'student' }
        : { email: email.trim().toLowerCase(), password };
      const res = await api.post(endpoint, payload);
      
      const { user, token } = res.data.data;
      localStorage.setItem('testforge_token', token);
      localStorage.setItem('testforge_user', JSON.stringify(user));
      onSuccess(user);
      onClose();
    } catch (err) {
      setError(err?.customMessage || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setError(null);
    if (!isRegister) {
      if (newRole === 'student') {
        setEmail('student@testforge.edu');
        setPassword('Student@123');
      } else {
        setEmail('teacher@testforge.edu');
        setPassword('Teacher@123');
      }
    }
  };

  const fillTeacher = () => {
    setIsRegister(false);
    setRole('teacher');
    setEmail('teacher@testforge.edu');
    setPassword('Teacher@123');
    setError(null);
  };

  const fillStudent = () => {
    setIsRegister(false);
    setRole('student');
    setEmail('student@testforge.edu');
    setPassword('Student@123');
    setError(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('testforge_token');
    localStorage.removeItem('testforge_user');
    onSuccess(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-7 sm:p-8 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 cursor-pointer p-1"
        >
          <X className="h-5 w-5" />
        </button>

        {currentUser ? (
          <div className="space-y-5 text-center py-4">
            <div className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center border ${
              currentUser.role === 'student'
                ? 'bg-amber-100 text-amber-700 border-amber-200'
                : 'bg-orange-100 text-orange-600 border-orange-200'
            }`}>
              {currentUser.role === 'student' ? (
                <GraduationCap className="h-7 w-7" />
              ) : (
                <CheckCircle2 className="h-7 w-7" />
              )}
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-900">
                {currentUser.role === 'student' ? 'Student Candidate' : 'Faculty Member'}
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">{currentUser.name} ({currentUser.email})</p>
              <span className={`inline-block mt-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                currentUser.role === 'student'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-orange-100 text-orange-800 border border-orange-200'
              }`}>
                Role: {currentUser.role}
              </span>
            </div>
            <div className="pt-3 flex justify-center gap-3">
              <Button variant="danger" size="sm" onClick={handleLogout}>
                Sign Out
              </Button>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-0.5 bg-orange-600 rounded-full" />
                <span className="text-xs font-bold uppercase tracking-wider text-orange-600">Access Portal</span>
              </div>
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {isRegister ? 'Create Unique Account' : 'Sign In to Portal'}
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {isRegister
                  ? 'Choose your role and register to access the platform'
                  : 'Sign in to access your Teacher workspace or Student exam portal'}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Account Role Selector (Available for BOTH Sign In & Register) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Access Portal as:
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleRoleChange('teacher')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      role === 'teacher' ? 'bg-orange-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="h-3 w-3" /> Teacher / Faculty
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRoleChange('student')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      role === 'student' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <GraduationCap className="h-3 w-3" /> Student / Candidate
                  </button>
                </div>
              </div>

              {isRegister && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {role === 'teacher' ? 'Full Academic Name' : 'Candidate Full Name'}
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={role === 'teacher' ? 'Dr. Sarah Mitchell' : 'Alex Rivera'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-orange-500 font-medium"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@testforge.edu"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-orange-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-orange-500 font-medium"
                  />
                </div>
              </div>

              <Button type="submit" variant="primary" className="w-full py-2.5 mt-2" isLoading={loading}>
                {isRegister
                  ? role === 'teacher'
                    ? 'Register Faculty Account'
                    : 'Register Student Account'
                  : role === 'teacher'
                    ? 'Sign In as Faculty'
                    : 'Sign In as Student'}
              </Button>
            </form>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError(null);
                }}
                className="font-bold text-orange-600 hover:text-orange-700 cursor-pointer"
              >
                {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Register"}
              </button>
            </div>

            {/* Quick Demo Fill Buttons */}
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Quick Demo Sign-In
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={fillTeacher}
                  className="py-1.5 px-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-800 text-[11px] font-bold border border-orange-200 cursor-pointer flex items-center justify-center gap-1"
                >
                  <Sparkles className="h-3 w-3 text-orange-600" /> Faculty Demo
                </button>
                <button
                  type="button"
                  onClick={fillStudent}
                  className="py-1.5 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold border border-amber-200 cursor-pointer flex items-center justify-center gap-1"
                >
                  <GraduationCap className="h-3 w-3 text-amber-600" /> Student Demo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;

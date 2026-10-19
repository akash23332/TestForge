import React, { useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { X, Lock, Mail, User as UserIcon, CheckCircle2 } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: any) => void;
  currentUser: any;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser
}) => {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('Dr. Sarah Mitchell');
  const [email, setEmail] = useState('teacher@testforge.edu');
  const [password, setPassword] = useState('Teacher@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

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
      onClose();
    } catch (err: any) {
      setError(err.customMessage || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('testforge_token');
    localStorage.removeItem('testforge_user');
    onSuccess(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-8 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 cursor-pointer p-1"
        >
          <X className="h-5 w-5" />
        </button>

        {currentUser ? (
          <div className="space-y-5 text-center py-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center border border-orange-200">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-900">Authenticated Faculty</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">{currentUser.name} ({currentUser.email})</p>
              <span className="inline-block mt-3 px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 capitalize">
                Role: {currentUser.role || 'Teacher'}
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
                <span className="text-xs font-bold uppercase tracking-wider text-orange-600">Faculty Access</span>
              </div>
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {isRegister ? 'Register Faculty Account' : 'Faculty Sign In'}
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {isRegister
                  ? 'Create an institutional account to manage questions, tests, and exam papers'
                  : 'Enter credentials or use the prefilled demo faculty account'}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 font-medium"
                      placeholder="Dr. Sarah Mitchell"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Institutional Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 font-medium"
                    placeholder="teacher@testforge.edu"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 font-medium"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <Button type="submit" isLoading={loading} className="w-full mt-2">
                {isRegister ? 'Create Faculty Account' : 'Sign In as Faculty'}
              </Button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="text-xs text-orange-600 hover:text-orange-700 font-bold cursor-pointer"
              >
                {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;

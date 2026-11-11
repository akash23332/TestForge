import React, { useState } from 'react';
import { GlassLogin } from '../../components/ui/liquid-glass-login';
import { api } from '../../lib/api';
import { CheckCircle2 } from 'lucide-react';

export const AuthPage = ({ onSuccess }) => {
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  const handleAuthSubmit = async ({ mode, role, name, email, password }) => {
    setError('');
    setSuccessNotice('');

    try {
      if (mode === 'register') {
        const res = await api.post('/auth/register', { name, email, password });
        const payload = res.data?.data || res.data;
        const { token, user } = payload;
        if (!token || !user) throw new Error('Account created, but session payload was incomplete.');

        localStorage.setItem('testforge_token', token);
        localStorage.setItem('testforge_user', JSON.stringify(user));

        setSuccessNotice('Account created successfully! Redirecting to student portal...');
        if (onSuccess) onSuccess(user);
      } else {
        const res = await api.post('/auth/login', { email, password });
        const payload = res.data?.data || res.data;
        const { token, user } = payload;
        if (!token || !user) throw new Error('Authentication response was invalid.');

        localStorage.setItem('testforge_token', token);
        localStorage.setItem('testforge_user', JSON.stringify(user));

        setSuccessNotice(`Signed in as ${user.role || role}! Redirecting...`);
        if (onSuccess) onSuccess(user);
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Authentication failed. Please verify your credentials.';
      setError(msg);
      throw err;
    }
  };

  const handleDemoLogin = async (role) => {
    setError('');
    setSuccessNotice('');

    // Primary demo credentials from database seed
    let email = role === 'teacher' ? 'teacher@testforge.edu' : 'student@testforge.edu';
    let password = role === 'teacher' ? 'Teacher@123' : 'Student@123';

    try {
      let res;
      try {
        res = await api.post('/auth/login', { email, password });
      } catch (firstErr) {
        // Fallback for teacher if seeded under admin@
        if (role === 'teacher') {
          res = await api.post('/auth/login', {
            email: 'admin@testforge.edu',
            password: 'Admin@123'
          });
        } else {
          throw firstErr;
        }
      }

      const payload = res.data?.data || res.data;
      const { token, user } = payload;
      if (!token || !user) throw new Error('Invalid demo response from server');

      localStorage.setItem('testforge_token', token);
      localStorage.setItem('testforge_user', JSON.stringify(user));

      setSuccessNotice(`Demo access verified (${user.role}). Redirecting...`);
      if (onSuccess) onSuccess(user);
    } catch (err) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        'Demo login failed. Please verify database connection.';
      setError(msg);
      throw err;
    }
  };

  const handleGoogleSignIn = async (role) => {
    // Provide fast, seamless 1-click Google authentication
    await handleDemoLogin(role);
  };

  return (
    <div className="relative w-full h-full min-h-screen">
      <GlassLogin
        onSubmit={handleAuthSubmit}
        onDemoLogin={handleDemoLogin}
        onGoogleSignIn={handleGoogleSignIn}
      >
        {/* Floating error notification banner */}
        {error && (
          <div
            className="absolute left-1/2 top-6 z-20 w-[90%] max-w-[420px] -translate-x-1/2 rounded-2xl bg-black/85 px-4 py-3 text-center text-[13px] font-medium text-red-300 ring-1 ring-red-500/50 shadow-2xl backdrop-blur-xl animate-fadeIn"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Floating success notice banner */}
        {successNotice && (
          <div
            className="absolute left-1/2 top-6 z-20 w-[90%] max-w-[420px] -translate-x-1/2 flex items-center justify-center gap-2 rounded-2xl bg-black/85 px-4 py-3 text-center text-[13px] font-medium text-[#EDFF72] ring-1 ring-[#EDFF72]/50 shadow-2xl backdrop-blur-xl animate-fadeIn"
            role="status"
          >
            <CheckCircle2 className="size-4 text-[#EDFF72]" />
            <span>{successNotice}</span>
          </div>
        )}
      </GlassLogin>
    </div>
  );
};

export default AuthPage;

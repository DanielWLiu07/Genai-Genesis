'use client';

import { FormEvent, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/PageTransition';
import { setLocalAuth } from '@/lib/local-auth';

type AuthMode = 'login' | 'signup';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      setLocalAuth(email.trim());
      router.replace('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center px-6 py-12 relative"
      style={{ backgroundImage: 'url(/bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <Link
        href="/"
        className="fixed top-6 left-6 z-20 text-[#555] hover:text-[#111] flex items-center gap-2 text-sm transition-colors bg-white/70 backdrop-blur-sm px-3 py-2 border border-[#ddd]"
      >
        <ArrowLeft size={14} /> Back
      </Link>

      <div className="w-full max-w-md bg-white/92 backdrop-blur-md border-4 border-[#111] shadow-[8px_8px_0px_rgba(0,0,0,0.85)]">
        <div className="manga-speedlines p-8 pb-6 border-b-4 border-[#111]">
          <h1 className="manga-title text-4xl text-[#111] leading-none">
            {mode === 'login' ? 'Log In' : 'Sign Up'}
          </h1>
          <p className="text-[#555] mt-3 text-sm leading-relaxed">
            Continue to your project dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div>
            <label className="manga-accent-bar text-xs mb-3 block tracking-widest uppercase">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="manga-input w-full text-sm"
              required
            />
          </div>

          <div>
            <label className="manga-accent-bar text-xs mb-3 block tracking-widest uppercase">Password</label>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="manga-input w-full text-sm"
              required
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="manga-accent-bar text-xs mb-3 block tracking-widest uppercase">Confirm Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="manga-input w-full text-sm"
                required
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="manga-btn w-full bg-[#111] text-white py-3 px-6 text-base"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError(null);
            }}
            className="w-full text-sm text-[#555] hover:text-[#111] underline underline-offset-4"
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </button>
        </form>
      </div>
    </main>
  );
}

'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/PageTransition';
import { setLocalAuth } from '@/lib/local-auth';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Image from 'next/image';

type AuthMode = 'login' | 'signup';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (authError) { setError(authError.message); return; }
        if (data.session) {
          setLocalAuth(email.trim());
          router.replace('/dashboard');
        } else {
          setSuccess('Check your email to confirm your account, then log in.');
          setMode('login');
        }
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) { setError(authError.message); return; }
        if (data.session) {
          setLocalAuth(email.trim());
          router.replace('/dashboard');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex" style={{ background: '#fff' }}>

      {/* ── LEFT PANEL — manga artwork ─────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between relative overflow-hidden w-[52%] shrink-0 border-r-4 border-[#111]"
        style={{ background: '#0a0a0a' }}
      >
        {/* Subtle halftone grid */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        {/* Speed-lines radiating from center */}
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'repeating-conic-gradient(#fff 0deg, transparent 0.3deg, transparent 10deg)',
          }}
        />

        {/* Floating decorative flora — top left */}
        <Image src="/stylized_imgs/flower3.png" alt="" width={220} height={220} aria-hidden
          className="absolute -top-4 -left-6 opacity-30 pointer-events-none select-none"
          style={{ filter: 'brightness(0.7) saturate(0)', transform: 'rotate(-15deg) scaleX(-1)' }}
        />
        <Image src="/stylized_imgs/leaf6.png" alt="" width={140} height={140} aria-hidden
          className="absolute top-8 left-36 opacity-25 pointer-events-none select-none"
          style={{ filter: 'brightness(0.6) saturate(0)', transform: 'rotate(20deg)' }}
        />

        {/* Floating decorative flora — top right */}
        <Image src="/stylized_imgs/flowers.png" alt="" width={180} height={180} aria-hidden
          className="absolute -top-2 right-0 opacity-25 pointer-events-none select-none"
          style={{ filter: 'brightness(0.7) saturate(0)', transform: 'rotate(12deg)' }}
        />
        <Image src="/stylized_imgs/leaf7.png" alt="" width={130} height={130} aria-hidden
          className="absolute top-24 right-10 opacity-20 pointer-events-none select-none"
          style={{ filter: 'brightness(0.6) saturate(0)', transform: 'rotate(-18deg) scaleX(-1)' }}
        />

        {/* Central ONI mask */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="relative">
            {/* Glow ring behind oni */}
            <div
              className="absolute inset-0 rounded-full opacity-20"
              style={{
                background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)',
                transform: 'scale(1.6)',
              }}
            />
            <Image
              src="/stylized_imgs/oni.png"
              alt="MangaMate"
              width={340}
              height={340}
              className="relative z-10 select-none"
              style={{ filter: 'brightness(0.85) contrast(1.1)' }}
              priority
            />
          </div>
        </div>

        {/* Bottom flora */}
        <Image src="/stylized_imgs/stone2.png" alt="" width={160} height={160} aria-hidden
          className="absolute bottom-28 left-4 opacity-25 pointer-events-none select-none"
          style={{ filter: 'brightness(0.6) saturate(0)', transform: 'rotate(8deg)' }}
        />
        <Image src="/stylized_imgs/flower4.png" alt="" width={150} height={150} aria-hidden
          className="absolute -bottom-4 right-6 opacity-30 pointer-events-none select-none"
          style={{ filter: 'brightness(0.7) saturate(0)', transform: 'rotate(-10deg)' }}
        />
        <Image src="/stylized_imgs/pine.png" alt="" width={130} height={130} aria-hidden
          className="absolute bottom-0 left-1/3 opacity-20 pointer-events-none select-none"
          style={{ filter: 'brightness(0.6) saturate(0)' }}
        />

        {/* Branding text */}
        <div className="relative z-10 p-10 pb-12 border-t-2 border-white/10">
          <p
            className="text-white text-3xl font-black tracking-[0.15em] leading-none mb-2"
            style={{ fontFamily: 'var(--font-manga)' }}
          >
            MANGAMATE
          </p>
          <p className="text-white/40 text-sm tracking-wider">
            Turn your story into a cinematic trailer.
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-14 relative"
        style={{ backgroundImage: 'url(/bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <Link
          href="/"
          className="absolute top-6 left-6 text-[#555] hover:text-[#111] flex items-center gap-2 text-xs transition-colors bg-white/80 backdrop-blur-sm px-3 py-2 border-2 border-[#ccc]"
        >
          <ArrowLeft size={13} /> Back
        </Link>

        {/* Mobile logo */}
        <div className="lg:hidden mb-8 text-center">
          <p className="text-3xl font-black tracking-[0.15em]" style={{ fontFamily: 'var(--font-manga)' }}>
            MANGAMATE
          </p>
        </div>

        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="bg-white/95 backdrop-blur-md border-4 border-[#111] shadow-[6px_6px_0px_rgba(0,0,0,0.85)]">

            {/* Card header */}
            <div className="manga-speedlines px-8 pt-8 pb-6 border-b-4 border-[#111]">
              <h1
                className="manga-title text-4xl text-[#111] leading-none"
              >
                {mode === 'login' ? 'Log In' : 'Sign Up'}
              </h1>
              <p className="text-[#666] mt-2 text-sm">
                {mode === 'login' ? 'Welcome back.' : 'Create your account.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
              <div>
                <label className="manga-accent-bar text-[0.65rem] mb-2 block tracking-widest uppercase text-[#555]">
                  Email
                </label>
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
                <label className="manga-accent-bar text-[0.65rem] mb-2 block tracking-widest uppercase text-[#555]">
                  Password
                </label>
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
                  <label className="manga-accent-bar text-[0.65rem] mb-2 block tracking-widest uppercase text-[#555]">
                    Confirm Password
                  </label>
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

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>
              )}
              {success && (
                <p className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2">{success}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="manga-btn w-full bg-[#111] text-white py-3 px-6 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#e0e0e0]" />
                <span className="text-[0.65rem] text-[#aaa] tracking-wider">OR</span>
                <div className="flex-1 h-px bg-[#e0e0e0]" />
              </div>

              <button
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setSuccess(null); }}
                className="w-full text-xs text-[#666] hover:text-[#111] transition-colors border-2 border-[#ddd] hover:border-[#111] py-2.5 px-4"
              >
                {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
              </button>
            </form>
          </div>

          <p className="text-center text-[0.6rem] text-[#aaa] mt-5 tracking-wider">
            By continuing you agree to our terms of service.
          </p>
        </div>
      </div>
    </main>
  );
}

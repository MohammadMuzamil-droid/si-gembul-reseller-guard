/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { auth, AppUser } from '../../lib/firebase';
import { SiGembulMascot } from '../mascot/SiGembulMascot';
import { ShieldCheck, Mail, Lock, UserCheck, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';

interface AuthOverlayProps {
  onLoginSuccess: (user: AppUser) => void;
}

export const AuthOverlay: React.FC<AuthOverlayProps> = ({ onLoginSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Email / Password Auth handler
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      if (isSignUp) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        onLoginSuccess({
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName || email.split('@')[0],
        });
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        onLoginSuccess({
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName || email.split('@')[0],
        });
      }
    } catch (err: any) {
      console.error('Firebase Auth error:', err);
      if (err.code === 'auth/operation-not-allowed') {
        setErrorMsg('Firebase Authentication Provider (Email/Password) is currently disabled in your Firebase Project Console. Please enable Email/Password under Authentication > Sign-in method in the Firebase Console.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setErrorMsg('Invalid email or password. Please verify your credentials.');
      } else if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('This email is already registered. Please sign in instead.');
      } else {
        setErrorMsg(err.message || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Google Sign-In Popup
  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      onLoginSuccess({
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: cred.user.displayName,
      });
    } catch (err: any) {
      console.warn('Google Popup sign-in error or cancelled:', err);
      if (err.code === 'auth/operation-not-allowed') {
        setErrorMsg('Google Sign-In provider is currently disabled in your Firebase Project Console. Please enable Google under Authentication > Sign-in method in the Firebase Console.');
      } else {
        setErrorMsg('Google Sign-in was interrupted or blocked. Error: ' + (err.message || ''));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Demo shortcut selects a non-sensitive email; the presenter enters the password manually.
  const handleDemoSelection = (accountKey: 'demo-reseller-1' | 'demo-reseller-2') => {
    setErrorMsg('');
    setIsSignUp(false);
    setEmail(accountKey === 'demo-reseller-1'
      ? 'barista.budi@kopinusantara.demo' 
      : 'berkah.store@resellerhub.demo');
    setPassword('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header with Mascot */}
        <div className="bg-slate-900 text-white p-6 text-center relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl" />
          <div className="relative z-10 flex flex-col items-center">
            <SiGembulMascot pose="guard" size="lg" className="mb-2" />
            <h1 className="text-2xl font-bold font-['Outfit',sans-serif] tracking-tight">
              Si Gembul Reseller Guard
            </h1>
            <p className="text-slate-300 text-sm mt-1">
              AI Operations & Financial Control Agent
            </p>
          </div>
        </div>

        {/* Form Container */}
        <div className="p-6">
          <div className="mb-5 text-center">
            <h2 className="text-lg font-bold text-slate-900">
              {isSignUp ? 'Create your workspace' : 'Sign in to your workspace'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Run your reseller work with confidence and strict data isolation
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Email / Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="reseller@example.com"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-semibold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isSignUp ? 'Create Workspace' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle Sign In / Sign Up */}
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs text-slate-600 hover:text-slate-900 underline font-medium cursor-pointer"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
            </button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Demo Account Shortcut
            </span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <p className="mb-2 text-center text-[11px] text-slate-500">
            Select a demo email, then enter its password manually.
          </p>

          {/* Synthetic demo account email shortcuts */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleDemoSelection('demo-reseller-1')}
              className="w-full p-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-left transition-colors flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xl">☕</span>
                <div>
                  <div className="text-xs font-bold text-emerald-900 group-hover:text-emerald-950">
                    Demo Reseller 1: Kopi Nusantara
                  </div>
                  <div className="text-[11px] text-emerald-700">
                    Preloaded coffee catalog & active orders
                  </div>
                </div>
              </div>
              <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => handleDemoSelection('demo-reseller-2')}
              className="w-full p-2.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg text-left transition-colors flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🛍️</span>
                <div>
                  <div className="text-xs font-bold text-sky-900 group-hover:text-sky-950">
                    Demo Reseller 2: Toko Berkah
                  </div>
                  <div className="text-[11px] text-sky-700">
                    Clean isolated tenant (zero cross-user leakage test)
                  </div>
                </div>
              </div>
              <UserCheck className="w-4 h-4 text-sky-600 shrink-0" />
            </button>
          </div>

          {/* Google Sign In option */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full mt-3 py-2 px-3 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Sign in with Google</span>
          </button>
        </div>

        {/* Security badge footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-center gap-2 text-[11px] text-slate-500 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Strict Firestore Per-User Isolation & Secret Security</span>
        </div>
      </div>
    </div>
  );
};

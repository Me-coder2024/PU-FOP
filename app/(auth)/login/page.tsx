'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { getRoleDashboardPath } from '@/lib/utils/roleCheck';
import { Loader2, Info, ArrowRight, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const { user, loading: authLoading, error: authError, signInWithGoogle } = useAuth();
  const { role, loading: roleLoading, error: roleError } = useRole();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Check for URL error params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'service_unavailable') {
      setError('The sign-in service is temporarily unavailable. Reload to try again.');
    }
    if (params.get('error') === 'auth_failed') {
      setError('Authentication failed. Please try again with your university email.');
    }
  }, []);

  // Show auth errors from the hook
  useEffect(() => {
    if (authError) {
      setError(authError);
      setLoginLoading(false);
    }
  }, [authError]);

  // Auto-redirect if already logged in
  useEffect(() => {
    if (!error && !authError && !roleError && !authLoading && !roleLoading && user && role) {
      const redirectPath = getRoleDashboardPath(role);
      router.push(redirectPath);
    }
  }, [user, role, authLoading, roleLoading, router, error, authError, roleError]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoginLoading(true);
    try {
      await signInWithGoogle();
      // Role loading is shown separately while the dashboard redirect resolves.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-in failed.';
      setError(message);
      setLoginLoading(false);
    } finally {
      setLoginLoading(false);
    }
  };

  // Don't show spinner if there's an error — show the button instead so user can retry
  const displayedError = error || authError || roleError;
  const isLoading = !displayedError && (loginLoading || authLoading || (!!user && roleLoading));

  return (
    <div className="min-h-screen h-screen flex font-sans overflow-hidden bg-white">
      {/* ======= LEFT: Campus Image Panel ======= */}
      <div className="hidden lg:flex lg:w-[58%] xl:w-[62%] relative overflow-hidden flex-shrink-0">
        <img
          src="/images/login-bg-pu.png"
          alt="Parul University"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Overlay with branding */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1E3A8A]/80 via-[#1E3A8A]/30 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12">
          <h2 className="text-4xl font-black text-white mb-3 tracking-tight">
            Faculty of Pharmacy
          </h2>
          <p className="text-white/70 text-sm font-medium max-w-md leading-relaxed">
            Streamlined dissertation title submission, review, and approval — from proposal to publication.
          </p>
        </div>
      </div>

      {/* ======= RIGHT: Login Panel ======= */}
      <div className="w-full lg:w-[42%] xl:w-[38%] h-screen flex flex-col items-center justify-between relative bg-white overflow-y-auto flex-shrink-0">
        <div className="w-full max-w-sm relative z-10 flex-1 flex flex-col justify-center px-6 sm:px-8 lg:px-10 py-8">
          {/* Logo & Header */}
          <div className="text-center lg:text-left flex flex-col items-center lg:items-start mb-10">
            <img
              src="/images/pu_logo.png"
              alt="Parul University"
              className="h-16 object-contain mb-5"
            />
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Welcome Back</h2>
            <p className="text-slate-500 text-sm mt-1.5 font-medium leading-relaxed">
              Sign in with your institutional Google account to continue.
            </p>
          </div>

          {/* Steps indicator */}
          <div className="flex items-center justify-between bg-[#1E3A8A]/5 border border-[#1E3A8A]/10 rounded-2xl p-4 mb-8">
            <div className="flex flex-col items-center flex-1">
              <div className="w-9 h-9 rounded-full bg-[#1E3A8A] text-white flex items-center justify-center font-bold text-xs shadow-sm mb-1.5">
                1
              </div>
              <span className="text-[10px] font-black text-[#1E3A8A] tracking-tight">Click below</span>
            </div>
            <div className="flex-shrink-0 w-8 h-[2px] bg-[#1E3A8A]/20 rounded-full mb-4" />
            <div className="flex flex-col items-center flex-1">
              <div className="w-9 h-9 rounded-full border-2 border-[#1E3A8A]/20 bg-white text-[#1E3A8A]/40 flex items-center justify-center font-bold text-xs mb-1.5">
                2
              </div>
              <span className="text-[10px] font-medium text-[#1E3A8A]/50 tracking-tight">Select account</span>
            </div>
            <div className="flex-shrink-0 w-8 h-[2px] bg-[#1E3A8A]/10 rounded-full mb-4" />
            <div className="flex flex-col items-center flex-1">
              <div className="w-9 h-9 rounded-full border-2 border-[#1E3A8A]/20 bg-white text-[#1E3A8A]/40 flex items-center justify-center font-bold text-xs mb-1.5">
                3
              </div>
              <span className="text-[10px] font-medium text-[#1E3A8A]/50 tracking-tight">You&apos;re in</span>
            </div>
          </div>

          {/* Google Sign-in / Error / Loader */}
          <div className="space-y-4">
            {displayedError && (
              <div className="p-3.5 bg-red-50 text-red-700 rounded-xl text-xs font-bold border border-red-100 flex items-start animate-pulse">
                <Info className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5 text-red-500" />
                <div><span>{displayedError}</span><button type="button" className="mt-2 block underline" onClick={()=>window.location.assign('/login')}>Reload and retry</button></div>
              </div>
            )}

            {isLoading ? (
              <div className="w-full flex flex-col items-center justify-center py-8 bg-[#1E3A8A]/5 rounded-2xl border border-[#1E3A8A]/10">
                <Loader2 className="w-7 h-7 text-[#1E3A8A] animate-spin mb-3" />
                <span className="text-xs font-bold text-[#1E3A8A]">Signing you in...</span>
                <span className="text-[10px] font-medium text-[#1E3A8A]/50 mt-1">Please wait</span>
              </div>
            ) : (
              <button
                id="google-signin-button"
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center py-3.5 px-5 bg-white border-2 border-slate-200 rounded-xl hover:bg-slate-50 hover:border-[#1E3A8A]/30 hover:shadow-lg hover:shadow-[#1E3A8A]/10 active:scale-[0.98] transition-all duration-200 group text-sm font-bold text-slate-700"
              >
                <svg className="w-5 h-5 mr-3 flex-shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>Continue with Google</span>
                <ArrowRight className="w-4 h-4 ml-2 text-slate-400 group-hover:text-[#1E3A8A] group-hover:translate-x-0.5 transition-all" />
              </button>
            )}

            {/* Info cards */}
            <div className="space-y-3">
              <div className="bg-[#1E3A8A]/5 border border-[#1E3A8A]/10 rounded-xl p-4 text-center">
                <p className="text-[#1E3A8A] font-semibold text-xs leading-relaxed">
                  Use your <span className="font-black">@paruluniversity.ac.in</span> email to access the portal.
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-amber-700 font-medium text-[10px] leading-relaxed">
                  Only university Google accounts are authorized. Other domains will be denied access.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="w-full text-center relative z-10 px-6 py-5 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">
            Need help?{' '}
            <a href="mailto:support@paruluniversity.ac.in" className="text-[#1E3A8A] hover:text-[#1E3A8A]/80 hover:underline transition-colors">
              Contact Support
            </a>
          </p>
          <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
            © {new Date().getFullYear()} Parul University — Faculty of Pharmacy
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { auth } from '@/lib/firebase/config';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { createClient } from '@/lib/supabase/client';

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || 'paruluniversity.ac.in';

export interface UnifiedUser {
  id: string; // The Supabase auth user.id (UUID)
  email: string;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthState {
  user: UnifiedUser | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email;
        if (!email) {
          await firebaseSignOut(auth);
          setState({ user: null, loading: false, error: 'No email associated with account.' });
          return;
        }



        try {
          // 1. Get Firebase ID token
          const idToken = await firebaseUser.getIdToken();

          // 2. Call sync API with exponential backoff for transient 404s (Turbopack/HMR route resolution)
          let syncRes: Response | null = null;
          const maxRetries = 4;
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              syncRes = await fetch('/api/auth/sync', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-cache, no-store',
                  'Pragma': 'no-cache',
                },
                body: JSON.stringify({ idToken }),
                cache: 'no-store',
              });
            } catch (fetchErr) {
              // Network error (e.g., dev server restarting) — retry
              if (attempt < maxRetries) {
                const backoff = Math.min(500 * Math.pow(2, attempt), 4000);
                console.warn(`Auth sync network error (attempt ${attempt + 1}), retrying in ${backoff}ms...`);
                await new Promise(r => setTimeout(r, backoff));
                continue;
              }
              throw new Error('Network error during authentication. Please check your connection and refresh.');
            }

            const contentType = syncRes.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              break; // Got a valid JSON response
            }

            // Non-JSON (likely 404 HTML from dev server) — retry with exponential backoff
            if (attempt < maxRetries) {
              const backoff = Math.min(500 * Math.pow(2, attempt), 4000);
              console.warn(`Auth sync attempt ${attempt + 1} returned non-JSON (${syncRes.status}), retrying in ${backoff}ms...`);
              await new Promise(r => setTimeout(r, backoff));
              // Refresh the token before retrying
              await firebaseUser.getIdToken(true);
            } else {
              console.error('Auth sync returned non-JSON after all retries:', syncRes.status);
              // Instead of signing out (login loop), set a recoverable error
              setState({
                user: null,
                loading: false,
                error: syncRes.status === 404
                  ? 'Auth service is loading. Please refresh the page.'
                  : `Authentication service error (HTTP ${syncRes.status}). Please refresh the page.`,
              });
              return; // Don't sign out — let user retry by refreshing
            }
          }

          if (!syncRes!.ok) {
            const errData = await syncRes!.json();
            throw new Error(errData.error || 'Failed to sync with database.');
          }

          const { email: syncEmail, securePassword } = await syncRes!.json();

          // 3. Sign in to Supabase Auth on the client — always sign in to ensure fresh cookies
          const supabase = createClient();
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: syncEmail,
            password: securePassword,
          });
          if (signInError) throw signInError;
          const supabaseUser = signInData.user;


          // 4. Done — set the unified user
          setState({
            user: {
              id: supabaseUser!.id,
              email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
            },
            loading: false,
            error: null,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Authentication failed.';
          console.error('Auth sync error:', message);
          await firebaseSignOut(auth);
          setState({ user: null, loading: false, error: message });
        }
      } else {
        // Signed out
        const supabase = createClient();
        await supabase.auth.signOut();
        setState({ user: null, loading: false, error: null });
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle the rest
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      await firebaseSignOut(auth);
      const supabase = createClient();
      await supabase.auth.signOut();
      setState({ user: null, loading: false, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-out failed.';
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, []);

  return {
    user: state.user,
    session: state.user ? { user: state.user } : null,
    loading: state.loading,
    error: state.error,
    signInWithGoogle,
    signOut,
  };
}

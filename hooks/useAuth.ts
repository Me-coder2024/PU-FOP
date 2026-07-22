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
import { clearRoleCache } from './useRole';

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
    let cancelled = false;

    // Fast path: check for existing Supabase session before waiting for Firebase
    const checkExistingSession = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && !cancelled) {
          // We have a valid Supabase session — use it directly without Firebase round-trip
          setState({
            user: {
              id: session.user.id,
              email: session.user.email || '',
              displayName: session.user.user_metadata?.full_name || null,
              photoURL: session.user.user_metadata?.avatar_url || null,
            },
            loading: false,
            error: null,
          });
          return true; // Signal that we handled auth
        }
      } catch {
        // Session check failed — fall through to Firebase flow
      }
      return false;
    };

    // Try fast path first
    checkExistingSession().then((handled) => {
      if (handled || cancelled) return;

      // Slow path: Firebase auth state listener
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (cancelled) return;

        if (firebaseUser) {
          const email = firebaseUser.email;
          if (!email) {
            await firebaseSignOut(auth);
            if (!cancelled) setState({ user: null, loading: false, error: 'No email associated with account.' });
            return;
          }

          try {
            // 1. Get Firebase ID token
            const idToken = await firebaseUser.getIdToken();

            // 2. Call sync API with reduced retries for faster failure
            let syncRes: Response | null = null;
            const maxRetries = 2;
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
                if (attempt < maxRetries) {
                  const backoff = Math.min(200 * Math.pow(2, attempt), 2000);
                  console.warn(`Auth sync network error (attempt ${attempt + 1}), retrying in ${backoff}ms...`);
                  await new Promise(r => setTimeout(r, backoff));
                  continue;
                }
                throw new Error('Network error during authentication. Please check your connection and refresh.');
              }

              const contentType = syncRes.headers.get('content-type') || '';
              if (contentType.includes('application/json')) {
                break;
              }

              if (attempt < maxRetries) {
                const backoff = Math.min(200 * Math.pow(2, attempt), 2000);
                console.warn(`Auth sync attempt ${attempt + 1} returned non-JSON (${syncRes.status}), retrying in ${backoff}ms...`);
                await new Promise(r => setTimeout(r, backoff));
                await firebaseUser.getIdToken(true);
              } else {
                console.error('Auth sync returned non-JSON after all retries:', syncRes.status);
                if (!cancelled) {
                  setState({
                    user: null,
                    loading: false,
                    error: syncRes.status === 404
                      ? 'Auth service is loading. Please refresh the page.'
                      : `Authentication service error (HTTP ${syncRes.status}). Please refresh the page.`,
                  });
                }
                return;
              }
            }

            if (!syncRes!.ok) {
              const errData = await syncRes!.json();
              throw new Error(errData.error || 'Failed to sync with database.');
            }

            const { email: syncEmail, securePassword } = await syncRes!.json();

            // 3. Sign in to Supabase Auth on the client
            const supabase = createClient();
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: syncEmail,
              password: securePassword,
            });
            if (signInError) throw signInError;
            const supabaseUser = signInData.user;

            // 4. Done — set the unified user
            if (!cancelled) {
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
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Authentication failed.';
            console.error('Auth sync error:', message);
            await firebaseSignOut(auth);
            if (!cancelled) setState({ user: null, loading: false, error: message });
          }
        } else {
          // Signed out
          const supabase = createClient();
          await supabase.auth.signOut();
          if (!cancelled) setState({ user: null, loading: false, error: null });
        }
      });

      // Store unsubscribe for cleanup
      cleanupRef.current = unsubscribe;
    });

    const cleanupRef = { current: () => {} };
    return () => {
      cancelled = true;
      cleanupRef.current();
    };
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
      clearRoleCache();
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

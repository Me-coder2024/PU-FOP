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

          // 2. Call sync API to verify token & create/find Supabase Auth user
          const syncRes = await fetch('/api/auth/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });

          // Guard against non-JSON responses (e.g. HTML 404 pages, middleware redirects)
          const contentType = syncRes.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const text = await syncRes.text();
            console.error('Auth sync returned non-JSON response:', syncRes.status, text.substring(0, 200));
            throw new Error(
              syncRes.status === 404
                ? 'Auth sync endpoint not found. Please refresh the page.'
                : `Authentication service error (HTTP ${syncRes.status}). Please try again.`
            );
          }

          if (!syncRes.ok) {
            const errData = await syncRes.json();
            throw new Error(errData.error || 'Failed to sync with database.');
          }

          const { email: syncEmail, securePassword } = await syncRes.json();

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

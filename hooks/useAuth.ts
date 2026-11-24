'use client';

import { createContext, createElement, useContext, type ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '@/lib/firebase/config';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { createClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/utils/with-timeout';
import { clearRoleCache } from './useRole';

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

// ── Core sync logic (shared between signInWithGoogle and onAuthStateChanged) ──

async function syncFirebaseUser(
  firebaseUser: FirebaseUser
): Promise<UnifiedUser> {
  const email = firebaseUser.email;
  if (!email) throw new Error('No email associated with account.');

  // 1. Get Firebase ID token
  const idToken = await withTimeout(firebaseUser.getIdToken(), 15000, 'Google authentication timed out. Please retry.');

  // 2. Call sync API (single attempt — fast fail)
  const syncRes = await fetch('/api/auth/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store',
    },
    body: JSON.stringify({ idToken, emailHint: email }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });

  if (!syncRes.ok) {
    const contentType = syncRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const errData = await syncRes.json();
      throw new Error(errData.error || 'Failed to sync with database.');
    }
    throw new Error(`Authentication service error (HTTP ${syncRes.status}). Please refresh.`);
  }

  const { email: syncEmail, securePassword } = await syncRes.json();

  // 3. Sign in to Supabase Auth on the client
  const supabase = createClient();
  const { data: signInData, error: signInError } = await withTimeout(supabase.auth.signInWithPassword({
    email: syncEmail,
    password: securePassword,
  }), 15000, 'Sign-in timed out. Please reload and retry.');
  if (signInError) throw signInError;
  const supabaseUser = signInData.user;

  return {
    id: supabaseUser!.id,
    email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
  };
}

// Multiple mounted hooks must share the same login exchange.
const pendingSync = new Map<string, Promise<UnifiedUser>>();
function performSync(firebaseUser: FirebaseUser): Promise<UnifiedUser> {
  const existing = pendingSync.get(firebaseUser.uid);
  if (existing) return existing;
  const request = syncFirebaseUser(firebaseUser).finally(() => pendingSync.delete(firebaseUser.uid));
  pendingSync.set(firebaseUser.uid, request);
  return request;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useAuthState() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  // Flag to prevent onAuthStateChanged from duplicating work that
  // signInWithGoogle already did directly.
  const syncInProgress = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const cleanupRef = { current: () => {} };
    const startupTimer = setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        cleanupRef.current();
        setState({user:null,loading:false,error:'Session check timed out. Please reload and retry.'});
      }
    }, 30000);
    // Keep every hook instance in sync. Do not await SDK calls in this callback.
    const {data:{subscription}} = createClient().auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        clearTimeout(startupTimer);
        clearRoleCache();
        setState({user:null,loading:false,error:null});
      } else if (event === 'SIGNED_IN' && session?.user) {
        clearTimeout(startupTimer);
        const u = session.user;
        setState(previous => previous.user?.id === u.id && previous.user?.email === u.email
          ? {...previous,loading:false,error:null}
          : {user:{id:u.id,email:u.email || '',displayName:u.user_metadata?.full_name || null,photoURL:u.user_metadata?.avatar_url || null},loading:false,error:null});
      }
    });

    // Fast path: check for existing Supabase session before waiting for Firebase
    const checkExistingSession = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 15000, 'Session check timed out.');
        if (session?.user && !cancelled) {
          clearTimeout(startupTimer);
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
          return true;
        }
      } catch {
        // Fall through to Firebase flow
      }
      return false;
    };

    checkExistingSession().then((handled) => {
      if (handled || cancelled) return;

      // Slow path: Firebase auth state listener (handles page reload when
      // Firebase has a persisted session but Supabase session expired)
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (cancelled) return;

        // Skip if signInWithGoogle is already handling sync
        if (syncInProgress.current) return;

        if (firebaseUser) {
          try {
            const user = await performSync(firebaseUser);
            clearTimeout(startupTimer);
            if (!cancelled) setState({ user, loading: false, error: null });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Authentication failed.';
            clearTimeout(startupTimer);
            console.error('Auth sync error (onAuthStateChanged):', message);
            if (!cancelled) setState({ user: null, loading: false, error: message });
          }
        } else {
          clearTimeout(startupTimer);
          // Signed out
          if (!cancelled) setState({ user: null, loading: false, error: null });
        }
      });

      cleanupRef.current = unsubscribe;
    });

    return () => {
      cancelled = true;
      clearTimeout(startupTimer);
      subscription.unsubscribe();
      cleanupRef.current();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    // Set flag so onAuthStateChanged doesn't do duplicate work
    syncInProgress.current = true;

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      // signInWithPopup returns the FirebaseUser immediately —
      // no need to wait for onAuthStateChanged to fire (saves 500ms-2s)
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;

      // Perform sync directly (token + API + Supabase signIn)
      const user = await performSync(firebaseUser);

      setState({ user, loading: false, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      setState((prev) => ({ ...prev, loading: false, error: message }));
    } finally {
      syncInProgress.current = false;
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


const AuthContext = createContext<ReturnType<typeof useAuthState>|null>(null);
export function AuthProvider({children}:{children:ReactNode}) {
  const value=useAuthState();
  return createElement(AuthContext.Provider,{value},children);
}
export function useAuth() {
  const value=useContext(AuthContext);
  if(!value)throw new Error('useAuth requires AuthProvider');
  return value;
}

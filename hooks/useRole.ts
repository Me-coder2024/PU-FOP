'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { createClient } from '@/lib/supabase/client';
import type { AppRole, ProfileRow } from '@/lib/supabase/types';

const CACHE_KEY = 'pu-fop-role-cache';

interface RoleState {
  role: AppRole | null;
  profile: ProfileRow | null;
  loading: boolean;
}

function getCachedRole(): RoleState | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Basic validation
      if (parsed.role && parsed.profile?.id) {
        return { role: parsed.role, profile: parsed.profile, loading: false };
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function setCachedRole(role: AppRole, profile: ProfileRow) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ role, profile }));
  } catch {
    // Ignore storage errors
  }
}

export function clearRoleCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore
  }
}

export function useRole() {
  const { user, loading: authLoading } = useAuth();

  // Initialize from cache for instant render on navigation
  const cached = typeof window !== 'undefined' ? getCachedRole() : null;
  const [state, setState] = useState<RoleState>({
    role: cached?.role ?? null,
    profile: cached?.profile ?? null,
    loading: cached ? false : true,
  });

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      clearRoleCache();
      setState({ role: null, profile: null, loading: false });
      return;
    }

    // If cached user ID matches, skip fetch on first render
    if (cached?.profile?.id === user.id && state.role) {
      // Still refresh in background to catch any profile changes
    }

    let cancelled = false;
    const supabase = createClient();

    async function fetchProfile() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user!.id)
          .single();

        if (!cancelled) {
          if (error || !data) {
            // Profile doesn't exist yet — user needs onboarding
            clearRoleCache();
            setState({ role: null, profile: null, loading: false });
          } else {
            const role = data.role as AppRole;
            const profile = data as ProfileRow;
            setCachedRole(role, profile);
            setState({ role, profile, loading: false });
          }
        }
      } catch {
        if (!cancelled) {
          clearRoleCache();
          setState({ role: null, profile: null, loading: false });
        }
      }
    }

    fetchProfile();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  return {
    role: state.role,
    profile: state.profile,
    loading: state.loading || authLoading,
  };
}


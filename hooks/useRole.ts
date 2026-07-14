'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { createClient } from '@/lib/supabase/client';
import type { AppRole, ProfileRow } from '@/lib/supabase/types';

interface RoleState {
  role: AppRole | null;
  profile: ProfileRow | null;
  loading: boolean;
}

export function useRole() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<RoleState>({
    role: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setState({ role: null, profile: null, loading: false });
      return;
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
            setState({ role: null, profile: null, loading: false });
          } else {
            setState({
              role: data.role as AppRole,
              profile: data as ProfileRow,
              loading: false,
            });
          }
        }
      } catch {
        if (!cancelled) {
          setState({ role: null, profile: null, loading: false });
        }
      }
    }

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return {
    role: state.role,
    profile: state.profile,
    loading: state.loading || authLoading,
  };
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { createClient } from '@/lib/supabase/client';
import type { AppRole, ProfileRow } from '@/lib/supabase/types';
import { getRoleDashboardPath } from '@/lib/utils/roleCheck';

const CACHE_KEY = 'pu-fop-role-cache';
const ACTIVE_ROLE_KEY = 'pu-fop-active-role';

interface RoleState {
  role: AppRole | null;
  availableRoles: AppRole[];
  profile: ProfileRow | null;
  loading: boolean;
}

function setStoredActiveRole(role: AppRole) {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ACTIVE_ROLE_KEY, role);
    }
  } catch {
    // Ignore
  }
}

export function clearRoleCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(ACTIVE_ROLE_KEY);
  } catch {
    // Ignore
  }
}

export function useRole() {
  const { user, loading: authLoading, error: authError } = useAuth();

  const [state, setState] = useState<RoleState>({role:null,availableRoles:[],profile:null,loading:true});
  const [error,setError] = useState<string|null>(null);
  const [switching,setSwitching] = useState(false);
  const switchingRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      clearRoleCache();
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const supabase = createClient();

    async function fetchProfileAndRoles() {
      try {
        const userEmail = user!.email?.toLowerCase() || '';

        // 1. Fetch user profile and all granted roles in parallel
        const [profileRes, grantsRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user!.id).abortSignal(controller.signal).single(),
          supabase.from('role_grants').select('role, institute_id, department_id').ilike('email', userEmail).abortSignal(controller.signal),
        ]);

        if (cancelled) return;

        if (grantsRes.error) throw grantsRes.error;
        if (profileRes.error) throw profileRes.error;
        if (!profileRes.data) throw new Error('Profile unavailable.');

        const profile = profileRes.data as ProfileRow;
        const profileRole = profile.role as AppRole;
        const grantedRoles = (grantsRes.data || []).map((g) => g.role as AppRole);

        // Deduplicate all available roles
        let availableRoles: AppRole[];
        const hasStaffGrants = grantedRoles.some((r) => r !== 'student');

        if (hasStaffGrants) {
          // User has explicit faculty/staff grants (e.g. guide, hod, pg_director, dean)
          // Filter out 'student' so faculty members are not treated as students
          const roleSet = new Set<AppRole>(grantedRoles.filter((r) => r !== 'student'));
          if (userEmail === 'me.coder.in@gmail.com') {
            roleSet.add('super_admin');
          }
          availableRoles = Array.from(roleSet);
        } else {
          // No staff grants — use profileRole or grantedRoles
          const roleSet = new Set<AppRole>([profileRole, ...grantedRoles]);
          if (userEmail === 'me.coder.in@gmail.com') {
            roleSet.add('super_admin');
          }
          availableRoles = Array.from(roleSet);
        }

        // Determine active role: prefer the confirmed database role if valid, else first available role
        const storedRole = profileRole;
        const activeRole = (storedRole && availableRoles.includes(storedRole))
          ? storedRole
          : availableRoles[0];

        // If profile.role in DB was 'student' but user has staff grants, sync DB profile.role to activeRole
        if (profileRole === 'student' && activeRole !== 'student') {
          const matchedGrant = (grantsRes.data || []).find((g) => g.role === activeRole);
          const updatePayload: Partial<ProfileRow> = { role: activeRole };
          if (matchedGrant?.institute_id && !profile.institute_id) {
            updatePayload.institute_id = matchedGrant.institute_id;
          }
          if (matchedGrant?.department_id && !profile.department_id) {
            updatePayload.department_id = matchedGrant.department_id;
          }

          const saved = await supabase.from('profiles').update(updatePayload).eq('id', profile.id).select('id').abortSignal(controller.signal).single();
          if (saved.error) throw saved.error;
          profile.role = activeRole;
          if (updatePayload.institute_id) profile.institute_id = updatePayload.institute_id;
          if (updatePayload.department_id) profile.department_id = updatePayload.department_id;
        }

        if (cancelled) return;
        setError(null);
        setState({
          role: activeRole,
          availableRoles,
          profile,
          loading: false,
        });
      } catch (err) {
        console.error('Error fetching user roles:', err);
        if (!cancelled) {
          clearRoleCache();
          setState({ role: null, availableRoles: [], profile: null, loading: false });
          setError('Unable to load your dashboard access. Please retry.');
        }
      } finally { clearTimeout(timeout); }
    }

    fetchProfileAndRoles();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [user, authLoading]);

  // Role switching function
  const switchRole = useCallback(async (newRole: AppRole) => {
    if (!state.profile || !state.availableRoles.includes(newRole)) {
      console.warn(`Role "${newRole}" is not assigned to current user.`);
      return;
    }

    if (switchingRef.current) return;
    switchingRef.current=true;
    setSwitching(true);
    setError(null);
    try {
      const { data, error } = await createClient().from('profiles')
        .update({role:newRole}).eq('id',state.profile.id)
        .select('id, role').abortSignal(AbortSignal.timeout(15000)).single();
      if (error || data?.role !== newRole) throw error || new Error('Role was not saved.');
      clearRoleCache();
      setStoredActiveRole(newRole);
      // A full navigation discards data belonging to the previous role.
      window.location.assign(getRoleDashboardPath(newRole));
    } catch {
      setError('Could not switch roles. Your current dashboard is unchanged. Please retry.');
      setSwitching(false);
      switchingRef.current=false;
    }
  }, [state.profile, state.availableRoles]);

  return {
    role: state.profile?.id === user?.id ? state.role : null,
    availableRoles: state.availableRoles,
    profile: state.profile?.id === user?.id ? state.profile : null,
    loading: authLoading || (!!user && (state.loading || (state.profile?.id !== user.id && !error))),
    switchRole,
    error: error || authError,
    switching,
  };
}

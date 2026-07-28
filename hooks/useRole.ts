'use client';

import { useState, useEffect, useCallback } from 'react';
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

function getStoredActiveRole(): AppRole | null {
  try {
    if (typeof window !== 'undefined') {
      const active = sessionStorage.getItem(ACTIVE_ROLE_KEY);
      if (active) return active as AppRole;
    }
  } catch {
    // Ignore
  }
  return null;
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

function getCachedRole(): RoleState | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.role && parsed.profile?.id) {
        return {
          role: parsed.role,
          availableRoles: parsed.availableRoles || [parsed.role],
          profile: parsed.profile,
          loading: false,
        };
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function setCachedRole(role: AppRole, availableRoles: AppRole[], profile: ProfileRow) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ role, availableRoles, profile }));
  } catch {
    // Ignore storage errors
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
  const { user, loading: authLoading } = useAuth();

  const cached = typeof window !== 'undefined' ? getCachedRole() : null;
  const [state, setState] = useState<RoleState>({
    role: cached?.role ?? null,
    availableRoles: cached?.availableRoles ?? [],
    profile: cached?.profile ?? null,
    loading: cached ? false : true,
  });

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      clearRoleCache();
      setState({ role: null, availableRoles: [], profile: null, loading: false });
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    async function fetchProfileAndRoles() {
      try {
        const userEmail = user!.email?.toLowerCase() || '';

        // 1. Fetch user profile and all granted roles in parallel
        const [profileRes, grantsRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user!.id).single(),
          supabase.from('role_grants').select('role, institute_id, department_id').eq('email', userEmail),
        ]);

        if (cancelled) return;

        if (profileRes.error || !profileRes.data) {
          clearRoleCache();
          setState({ role: null, availableRoles: [], profile: null, loading: false });
          return;
        }

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

        // Determine active role: prefer stored choice if valid, else first available role
        const storedRole = getStoredActiveRole();
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

          supabase.from('profiles').update(updatePayload).eq('id', profile.id).then();
          profile.role = activeRole;
          if (updatePayload.institute_id) profile.institute_id = updatePayload.institute_id;
          if (updatePayload.department_id) profile.department_id = updatePayload.department_id;
        }

        setCachedRole(activeRole, availableRoles, profile);
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
        }
      }
    }

    fetchProfileAndRoles();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  // Role switching function
  const switchRole = useCallback(async (newRole: AppRole) => {
    if (!state.profile || !state.availableRoles.includes(newRole)) {
      console.warn(`Role "${newRole}" is not assigned to current user.`);
      return;
    }

    // 1. Update session storage and local state
    setStoredActiveRole(newRole);
    setCachedRole(newRole, state.availableRoles, state.profile);

    setState((prev) => ({
      ...prev,
      role: newRole,
    }));

    // 2. Persist active role in profiles table
    try {
      const supabase = createClient();
      await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', state.profile.id);
    } catch (err) {
      console.error('Failed to persist active role in profile:', err);
    }

    // 3. Navigate to target dashboard for selected role
    const targetPath = getRoleDashboardPath(newRole);
    window.location.href = targetPath;
  }, [state.profile, state.availableRoles]);

  return {
    role: state.role,
    availableRoles: state.availableRoles,
    profile: state.profile,
    loading: state.loading || authLoading,
    switchRole,
  };
}

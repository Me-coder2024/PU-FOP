import { createClient } from '@/lib/supabase/client';
import type { AppRole } from '@/lib/supabase/types';

export async function getUserRole(userId: string): Promise<AppRole | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data.role as AppRole;
}

export async function getUserProfile(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

export function canAccessRoute(role: AppRole, pathname: string): boolean {
  if (role === 'super_admin') return true;

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/student')) {
    return role === 'student';
  }
  if (pathname.startsWith('/guide')) {
    return role === 'guide';
  }
  if (pathname.startsWith('/hod')) {
    return role === 'hod';
  }
  if (pathname.startsWith('/pg-director')) {
    return role === 'pg_director';
  }
  if (pathname.startsWith('/dean')) {
    return role === 'dean';
  }
  if (pathname.startsWith('/super-admin')) {
    return false; // Only super_admin handled above
  }
  if (pathname.startsWith('/research')) {
    return role === 'dean' || role === 'pg_director';
  }

  return true; // Public routes
}

export function getRoleDashboardPath(role: AppRole): string {
  switch (role) {
    case 'student':
      return '/dashboard';
    case 'guide':
      return '/guide';
    case 'hod':
      return '/hod';
    case 'pg_director':
      return '/pg-director';
    case 'dean':
      return '/dean';
    case 'super_admin':
      return '/super-admin';
    default:
      return '/dashboard';
  }
}

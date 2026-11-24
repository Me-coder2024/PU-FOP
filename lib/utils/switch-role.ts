import type { AppRole } from '@/lib/supabase/types';
export async function saveActiveRole(role: AppRole, signal?: AbortSignal): Promise<{role:AppRole;institute_id:string|null;department_id:string|null}> {
  const response = await fetch('/api/auth/switch-role', {
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({role}),cache:'no-store',
    signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(40000)]) : AbortSignal.timeout(40000),
  });
  const data = await response.json();
  if(!response.ok) throw new Error(data.error || 'Unable to switch roles. Please retry.');
  if(data.role !== role) throw new Error('The selected role was not confirmed. Reload and retry.');
  return data;
}

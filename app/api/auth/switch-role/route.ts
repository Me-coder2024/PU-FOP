import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/supabase/types';

const roles: AppRole[] = ['student','guide','hod','pg_director','dean','super_admin'];
const reply = (body: unknown, status = 200) => Response.json(body, {status,headers:{'Cache-Control':'private, no-store'}});

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) {
      return reply({error:'Invalid request origin.'},403);
    }
    const session = await createServerClient();
    const {data:{user},error:authError} = await session.auth.getUser();
    if(authError || !user?.email) return reply({error:'Your session expired. Sign in again to switch roles.'},401);
    const body = await request.json();
    if (!roles.includes(body?.role)) return reply({error:'Choose a valid role.'},400);
    const role = body.role as AppRole;
    const admin = createServiceClient();
    const email = user.email.trim().toLowerCase();
    // Escape LIKE wildcards so an email can only match its own grant rows.
    const emailPattern = email.replace(/[\\%_]/g, '\\$&');
    const [{data:profile,error:profileError},{data:grants,error:grantError}] = await Promise.all([
      admin.from('profiles').select('id, role, institute_id, department_id').eq('id',user.id).abortSignal(AbortSignal.timeout(15000)).single(),
      admin.from('role_grants').select('role, institute_id, department_id').ilike('email',emailPattern).abortSignal(AbortSignal.timeout(15000)),
    ]);
    if(profileError || grantError || !profile) return reply({error:'Unable to verify assigned roles. Please retry.'},503);
    const grant = grants?.find(g=>g.role === role);
    // Match the existing server-side bootstrap administrator rule used at login.
    const bootstrapAdmin = email === 'me.coder.in@gmail.com' && role === 'super_admin';
    if(role !== profile.role && !grant && !bootstrapAdmin) return reply({error:'This role is not assigned to your account. Reload to refresh your roles.'},403);
    if(role === profile.role) return reply(profile);
    const update = {
      role,
      institute_id: grant ? grant.institute_id : profile.institute_id,
      department_id: grant ? grant.department_id : profile.department_id,
    };
    const {data,error} = await admin.from('profiles').update(update).eq('id',user.id)
      .select('id, role, institute_id, department_id').abortSignal(AbortSignal.timeout(15000)).single();
    if(error || data?.role !== role) {
      console.error('Role switch update failed', {code:error?.code});
      return reply({error:'Unable to save the selected role. Please retry.'},503);
    }
    return reply(data);
  } catch {
    return reply({error:'Could not confirm the role switch. Reload to check your active role, then retry.'},503);
  }
}

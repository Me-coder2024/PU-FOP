import { requireRole } from '@/lib/utils/require-role';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/** Reading the directory must never provision accounts or change active roles. */
export async function GET(req: Request) {
  try {
    const access = await requireRole(req);
    if (access.response) return access.response;
    const instituteId = new URL(req.url).searchParams.get('institute_id');
    const departmentId = new URL(req.url).searchParams.get('department_id');
    const admin = createServiceClient();
    let grantsQuery = admin.from('role_grants').select('email').eq('role', 'guide');
    let profilesQuery = admin.from('profiles').select('id, full_name, email').eq('role', 'guide');
    if (instituteId) {
      grantsQuery = grantsQuery.eq('institute_id', instituteId);
      profilesQuery = profilesQuery.eq('institute_id', instituteId);
    }
    if (departmentId) {
      grantsQuery = grantsQuery.eq('department_id',departmentId);
      profilesQuery = profilesQuery.eq('department_id',departmentId);
    }
    const [grants, profiles] = await Promise.all([grantsQuery, profilesQuery.order('full_name')]);
    if (grants.error || profiles.error) throw new Error('Unable to load guides. Please retry.');
    const emails = (grants.data || []).map(grant => grant.email.toLowerCase());
    const granted = emails.length
      ? await admin.from('profiles').select('id, full_name, email').in('email', emails)
      : {data: [], error: null};
    if (granted.error) throw new Error('Unable to load guides. Please retry.');
    const guides = [...new Map([...(profiles.data || []), ...(granted.data || [])].map(p => [p.id, p])).values()];
    guides.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    return NextResponse.json({guides}, {headers: {'Cache-Control': 'private, no-store'}});
  } catch (err) {
    return NextResponse.json({error: err instanceof Error ? err.message : 'Unable to load guides.'}, {status: 503});
  }
}

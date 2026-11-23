import { after } from 'next/server';
import { deliverWorkflowMail } from '@/lib/progress/mail';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { resolveDepartment, isPilotDepartment } from '@/lib/config/departments';
import { isLegacyFormDepartment } from '@/lib/config/scoring-criteria';
import { validateDepartmentFields } from '@/lib/config/department-schemas';
import { POST as validateTitle } from '@/app/api/validate-title/route';

export async function POST(request: Request) {
  try {
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in again.' }, { status: 401 });
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
    const body = await request.json();
    const admin = createServiceClient();
    const { data: profile } = await admin.from('profiles').select('*').eq('id',user.id).single();
    if (!profile) return Response.json({ error: 'Profile required.' }, { status: 403 });
    let details: Record<string, unknown> = {};
    if (body.action === 'student_submit') {
      const { data: department } = await admin.from('departments').select('name').eq('id',profile.department_id || '').single();
      const key = resolveDepartment(department?.name);
      if (!key) return Response.json({ error: 'Department is not enabled.' }, { status: 403 });
      if (isPilotDepartment(key) && !(process.env.APP_ENV === 'staging' && process.env.NEXT_PUBLIC_APP_ENV === 'staging' && process.env.NEXT_PUBLIC_ENABLE_PILOT_DEPARTMENTS === 'true')) return Response.json({ error: 'Official rubric pending. This department is enabled only in staging.' }, { status: 403 });
      if (typeof body.title !== 'string' || typeof body.description !== 'string' || !body.criteria_details || typeof body.criteria_details !== 'object' || Array.isArray(body.criteria_details)) return Response.json({ error: 'Invalid submission fields.' }, { status: 400 });
      details = { ...body.criteria_details, title: body.title, novelty: body.description };
      if (!isLegacyFormDepartment(key)) {
        details = { ...details, schema_version: 2, department: department!.name };
        const errors = validateDepartmentFields(key,details);
        if (errors.length) return Response.json({ error: errors.join(' ') }, { status: 400 });
      } else {
        delete details.schema_version;
        for (const field of ['drugName','dosageForm','primarySubject','coreDomain']) if (!String(details[field] || '').trim()) return Response.json({ error: `${field} is required.` }, { status: 400 });
      }
      if (isLegacyFormDepartment(key) || key === 'QUALITY ASSURANCE') {
        const validation = await validateTitle(new Request(new URL('/api/validate-title',request.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...details, title: body.title, novelty: body.description, department: department!.name, excludeSubmissionId: body.submissionId }) }));
        const result = await validation.json();
        if (!validation.ok || !result.canSubmit) return Response.json({ error: 'Title validation did not pass. Review the validation results before submitting.' }, { status: 400 });
      }
    }
    if (body.remarks != null && (typeof body.remarks !== 'string' || body.remarks.length > 4000)) return Response.json({ error: 'Invalid remarks.' }, { status: 400 });
    const { data, error } = await admin.rpc('title_action', {
      p_actor: user.id, p_action: body.action, p_submission: body.submissionId,
      p_title: body.title, p_description: body.description, p_details: details,
      p_remarks: body.remarks, p_unlocked: body.unlocked,
    });
    if (error) return Response.json({ error: error.message }, { status: 409 });
    after(() => deliverWorkflowMail(user.id,data));
    return Response.json({ success: true, submissionId: data });
  } catch { return Response.json({ error: 'Unable to save title. Reload and retry.' }, { status: 400 }); }
}

import { after } from 'next/server';
import { deliverWorkflowMail } from '@/lib/progress/mail';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { verifyPptx } from '@/lib/progress/pptx';

export const runtime = 'nodejs';
const BUCKET = 'research-presentations';
const MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(body: unknown, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }); }

export async function GET() {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return reply({ error: 'Sign in to see progress.' }, 401);
  const { data, error } = await session.rpc('research_snapshot', {});
  if (error) return reply({ error: 'Research tracking is unavailable. Check that the staging migration has been applied.' }, 503);
  const staging = process.env.APP_ENV === 'staging';
  const { data: profile } = await session.from('profiles').select('role').eq('id',user.id).single();
  return reply({ canManage: ['pg_director','super_admin'].includes(profile?.role || ''), records: (data || []).map(record => ({ ...record, definitions: record.definitions.filter(d => !d.test_only || staging) })) });
}

export async function POST(request: Request) {
  try {
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return reply({ error: 'Sign in again.' }, 401);
    // Cookie-authenticated mutation: reject cross-origin browser requests.
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Invalid origin.' }, 403);
    const body = await request.json();
    const { action, submissionId, definitionId, fileId } = body;
    if (!uuid.test(submissionId || '') || !uuid.test(definitionId || '') || (fileId && !uuid.test(fileId))) return reply({ error: 'Invalid record ID.' }, 400);
    const admin = createServiceClient();
    const { data: allowed, error: scopeError } = await admin.rpc('research_scope', { p_actor: user.id, p_submission: submissionId });
    if (scopeError || !allowed) return reply({ error: 'Record not available.' }, 403);
    const { data: definition } = await admin.from('research_milestone_definitions').select('*').eq('id', definitionId).single();
    if (!definition || !definition.enabled || (definition.test_only && process.env.APP_ENV !== 'staging')) return reply({ error: 'Milestone unavailable.' }, 403);
    if(definition.response_kind==='pptx'&&['reserve','confirm','submit'].includes(action)){
      const {data:title,error:titleError}=await admin.from('submissions').select('status').eq('id',submissionId).single();
      if(titleError||title?.status!=='finalized')return reply({error:'PPT submission opens only after your title is finalized.'},409);
    }
    const args = { p_actor: user.id, p_submission: submissionId, p_definition: definitionId, p_action: action as string, p_staging: process.env.APP_ENV === 'staging' };
    if (definition.target_submission_id && definition.target_submission_id !== submissionId) return reply({ error: 'Request not assigned to this title.' }, 403);
    if (definition.response_kind === 'text') {
      if (!['save','submit','accepted','revision_requested'].includes(action)) return reply({ error: 'Invalid update action.' },400);
      if (body.answers != null && (typeof body.answers !== 'object' || Array.isArray(body.answers) || JSON.stringify(body.answers).length > 110000)) return reply({ error: 'Invalid answers.' },400);
      if (body.remarks != null && (typeof body.remarks !== 'string' || body.remarks.length > 4000)) return reply({ error: 'Remarks must be at most 4,000 characters.' },400);
      const { data: updateId, error } = await admin.rpc('research_update_action', { ...args, p_answers: body.answers, p_update: body.updateId, p_remarks: body.remarks });
      if (error) return reply({ error: error.message },409);
      if (action !== 'save') after(() => deliverWorkflowMail(user.id,submissionId));
      return reply({ success:true, updateId });
    }
    if (action === 'reserve') {
      if (typeof body.filename !== 'string' || !Number.isInteger(body.size) || /[/\\\x00-\x1f]/.test(body.filename)) return reply({ error: 'Invalid filename or size.' }, 400);
      const { data: file, error } = await admin.rpc('research_action', { ...args, p_filename: body.filename, p_size: body.size });
      if (error) return reply({ error: error.message }, 409);
      const { data: upload, error: uploadError } = await admin.storage.from(BUCKET).createSignedUploadUrl(file.object_path, { upsert: false });
      if (uploadError) return reply({ error: 'Unable to prepare upload. Try again; no submission was recorded.' }, 503);
      return reply({ fileId: file.id, path: file.object_path, token: upload.token, mime: MIME });
    }
    const { data: file } = await admin.from('research_files').select('*').eq('id', fileId || '').single();
    if (!file) return reply({ error: 'File not available.' }, 404);
    const { data: milestone } = await admin.from('research_milestones').select('*').eq('id', file.milestone_id).eq('submission_id', submissionId).eq('definition_id', definitionId).single();
    if (!milestone) return reply({ error: 'File not available.' }, 404);
    if (action === 'download') {
      if (!file.sealed_path || file.state === 'uploading') return reply({ error: 'Upload is not verified.' }, 409);
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(file.sealed_path, 60, { download: file.filename });
      if (error) return reply({ error: 'Download unavailable. Retry to get a new link.' }, 503);
      return reply({ url: data.signedUrl });
    }
    if (action === 'confirm') {
      if (file.uploaded_by !== user.id) return reply({ error: 'Student ownership required.' }, 403);
      if (file.state !== 'uploading') return reply({ success: true });
      // Copy first: upload tokens can remain valid after verification. Never verify a
      // mutable draft and then submit that path. Only this server can write verified/.
      const sealedPath = `verified/${file.id}.pptx`;
      const { error: copyError } = await admin.storage.from(BUCKET).copy(file.object_path, sealedPath);
      if (copyError && !/already exists|duplicate|resource exists/i.test(copyError.message)) return reply({ error: 'Upload is incomplete. Upload the file again.' }, 409);
      const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(sealedPath);
      if (downloadError || !blob || blob.size !== file.size_bytes || blob.size > definition.max_bytes) return reply({ error: 'Uploaded file size does not match. Upload it again.' }, 400);
      verifyPptx(Buffer.from(await blob.arrayBuffer()));
      const { error } = await admin.rpc('research_action', { ...args, p_file: file.id, p_sealed_path: sealedPath });
      if (error) return reply({ error: error.message }, 409);
      return reply({ success: true });
    }
    if (!['submit','accepted','revision_requested'].includes(action)) return reply({ error: 'Unknown action.' }, 400);
    if (body.remarks != null && (typeof body.remarks !== 'string' || body.remarks.length > 4000)) return reply({ error: 'Remarks must be at most 4,000 characters.' }, 400);
    const { error } = await admin.rpc('research_action', { ...args, p_file: file.id, p_remarks: body.remarks || '' });
    if (error) return reply({ error: error.message }, 409);
    after(() => deliverWorkflowMail(user.id,submissionId));
    return reply({ success: true });
  } catch (error) {
    console.error('Research action failed:', error instanceof Error ? error.message : 'Unknown error');
    return reply({ error: error instanceof Error && error.message.startsWith('Invalid PowerPoint') ? error.message : 'Unable to complete the action. Reload and retry; earlier submitted versions are preserved.' }, 400);
  }
}

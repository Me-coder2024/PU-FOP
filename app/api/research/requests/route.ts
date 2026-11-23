import { after } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { deliverWorkflowMail } from '@/lib/progress/mail';

export async function POST(request: Request) {
  try {
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in again.' },{status:401});
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error:'Invalid origin.' },{status:403});
    const body = await request.json();
    const admin = createServiceClient();
    const deadline = typeof body.deadline === 'string' ? new Date(body.deadline) : null;
    if (!deadline || !Number.isFinite(deadline.getTime())) return Response.json({ error:'Choose a valid deadline.' },{status:400});
    if (body.action === 'extend') {
      if (typeof body.remarks !== 'string') return Response.json({ error:'Give a reason for extending the deadline.' },{status:400});
      const { error } = await admin.rpc('extend_research_deadline', { p_actor:user.id,p_definition:body.definitionId,p_deadline:deadline.toISOString(),p_remarks:body.remarks });
      if (error) return Response.json({ error:error.message },{status:409});
      const { data: definition } = await admin.from('research_milestone_definitions').select('target_submission_id').eq('id',body.definitionId).single();
      if (definition?.target_submission_id) after(() => deliverWorkflowMail(user.id,definition.target_submission_id!));
      return Response.json({ success:true });
    }
    if (body.action !== 'publish' || typeof body.name !== 'string' || typeof body.instructions !== 'string' || !Array.isArray(body.questions) || body.questions.length>10 || !body.questions.every((q:unknown) => typeof q === 'string' && q.length<=500)) return Response.json({ error:'Check the request name, instructions and questions.' },{status:400});
    const { data, error } = await admin.rpc('publish_research_request', {
      p_actor:user.id,p_submission:body.submissionId,p_key:body.requestKey,p_name:body.name,
      p_instructions:body.instructions,p_questions:body.questions,p_deadline:deadline.toISOString(),p_kind:body.kind,
      p_staging:process.env.APP_ENV==='staging',
    });
    if (error) return Response.json({ error:error.message },{status:409});
    after(() => deliverWorkflowMail(user.id,body.submissionId));
    return Response.json({ success:true,definitionId:data });
  } catch { return Response.json({ error:'Unable to save request. Reload and retry.' },{status:400}); }
}

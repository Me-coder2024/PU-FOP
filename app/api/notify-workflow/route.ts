import { after } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { deliverWorkflowMail } from '@/lib/progress/mail';
/** Compatibility retry endpoint. Sends only persisted, unclaimed mail intents. */
export async function POST(request: Request) {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ error: 'Sign in again.' }, { status: 401 });
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  try {
    const { submissionId } = await request.json();
    const { data: allowed } = await createServiceClient().rpc('research_scope', { p_actor:user.id, p_submission:submissionId });
    if (!allowed) return Response.json({ error:'Record unavailable.' }, { status:403 });
    after(() => deliverWorkflowMail(user.id,submissionId));
    return Response.json({ success:true });
  } catch { return Response.json({ error:'Invalid request.' }, { status:400 }); }
}

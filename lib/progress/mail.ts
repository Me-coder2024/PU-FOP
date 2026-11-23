import 'server-only';
import { createServiceClient } from '@/lib/supabase/server';
import { sendNotificationEmail } from '@/lib/utils/email';
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]!);
}
/** Claim once before delivery. Never blindly retry uncertain SMTP deliveries. */
export async function deliverWorkflowMail(actorId: string, submissionId: string) {
  const admin = createServiceClient();
  const { data: messages, error } = await admin.from('workflow_mail_outbox').select('*').eq('actor_id',actorId).eq('submission_id',submissionId).eq('state','pending').order('created_at').limit(50);
  if (error) { console.error('Workflow email outbox unavailable'); return; }
  for (const message of messages || []) {
    const { data: claimed, error: claimError } = await admin.from('workflow_mail_outbox').update({ state:'sending', attempted_at: new Date().toISOString() }).eq('id',message.id).eq('state','pending').select('id').maybeSingle();
    if (claimError || !claimed) continue;
    const { data: recipient } = await admin.from('profiles').select('email').eq('id',message.recipient_id).single();
    try {
      const result = recipient?.email ? await sendNotificationEmail(recipient.email,message.subject,`<p>${escapeHtml(message.message).replaceAll('\n','<br />')}</p>`,undefined,`workflow-${message.id}`) : { sent:false };
      await admin.from('workflow_mail_outbox').update({ state: result.sent ? 'sent' : 'failed', sent_at: result.sent ? new Date().toISOString() : null }).eq('id',message.id);
    } catch {
      await admin.from('workflow_mail_outbox').update({ state:'failed' }).eq('id',message.id);
    }
  }
}

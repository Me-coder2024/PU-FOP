import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Secure server-side API for dean title management actions.
 * Replaces direct client-side supabase.from('submissions').update() calls.
 * Actions: edit_title, toggle_edit_unlock, send_back
 */

export async function POST(req: Request) {
  try {
    const supabase = createServiceClient();
    const body = await req.json();
    const { action, submissionId, userId } = body;

    if (!submissionId || !userId) {
      return NextResponse.json({ error: 'Submission ID and User ID are required' }, { status: 400 });
    }

    // Verify caller is dean/super_admin
    const { data: callerProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single();

    if (profileErr || !callerProfile || !['dean', 'super_admin'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden: Dean or Super Admin access required' }, { status: 403 });
    }

    // Fetch the submission
    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('id, title, student_id, status, edit_unlocked')
      .eq('id', submissionId)
      .single();

    if (subErr || !sub) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    if (action === 'edit_title') {
      const { newTitle } = body;
      if (!newTitle?.trim()) {
        return NextResponse.json({ error: 'New title is required' }, { status: 400 });
      }

      const { error } = await supabase
        .from('submissions')
        .update({ title: newTitle.trim() })
        .eq('id', submissionId);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: callerProfile.id,
        action: 'edit_title',
        table_name: 'submissions',
        record_id: submissionId,
        old_data: { title: sub.title },
        new_data: { title: newTitle.trim() },
      });

      return NextResponse.json({ success: true, message: 'Title saved successfully.' });
    }

    if (action === 'toggle_edit_unlock') {
      const newValue = !sub.edit_unlocked;

      const { error } = await supabase
        .from('submissions')
        .update({ edit_unlocked: newValue })
        .eq('id', submissionId);
      if (error) throw error;

      // Notify student
      await supabase.from('notifications').insert({
        user_id: sub.student_id,
        title: newValue ? 'Edit Access Granted' : 'Edit Access Revoked',
        message: newValue
          ? `The Dean has unlocked your title "${sub.title}" for editing.`
          : `Edit access for your title "${sub.title}" has been revoked.`,
        type: newValue ? 'success' : 'warning',
        link: '/dashboard/submit',
      });

      return NextResponse.json({
        success: true,
        message: newValue ? 'Edit access granted.' : 'Edit access revoked.',
      });
    }

    if (action === 'send_back') {
      const { remarks } = body;
      if (!remarks?.trim()) {
        return NextResponse.json({ error: 'Remarks are required' }, { status: 400 });
      }

      const { error } = await supabase
        .from('submissions')
        .update({ status: 'revision_requested', edit_unlocked: true })
        .eq('id', submissionId);
      if (error) throw error;

      // Notify student
      await supabase.from('notifications').insert({
        user_id: sub.student_id,
        title: 'Revisions Requested by Dean',
        message: `The Dean has requested changes to your title "${sub.title}". Remarks: ${remarks}`,
        type: 'warning',
        link: '/dashboard/submit',
      });

      // Trigger email workflow
      try {
        const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        await fetch(`${origin}/api/notify-workflow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'dean_revision', submissionId, remarks: remarks.trim() }),
        });
      } catch (e) {
        console.error('Error triggering notify-workflow:', e);
      }

      return NextResponse.json({ success: true, message: 'Title sent back for revisions.' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to process title action';
    console.error('Error in dean/titles API:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

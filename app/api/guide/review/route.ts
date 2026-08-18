import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import type { SubmissionStatus, NotificationType } from '@/lib/supabase/types';

/**
 * Secure server-side API for guide review actions.
 * Replaces direct client-side supabase.from('submissions').update() calls.
 * Actions: accept, reject, revision
 */

export async function POST(req: Request) {
  try {
    const supabase = createServiceClient();
    const body = await req.json();
    const { action, submissionId, userId, remarks, rejectionReason } = body;

    if (!submissionId || !userId || !action) {
      return NextResponse.json({ error: 'Submission ID, User ID, and action are required' }, { status: 400 });
    }

    // Verify caller is a guide or super_admin
    const { data: callerProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role, email')
      .eq('id', userId)
      .single();

    if (profileErr || !callerProfile || !['guide', 'super_admin'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden: Guide access required' }, { status: 403 });
    }

    // Fetch submission and verify this guide is assigned
    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .select('id, title, student_id, guide_id, status')
      .eq('id', submissionId)
      .single();

    if (subErr || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Verify guide assignment (super_admin can bypass)
    if (callerProfile.role !== 'super_admin' && submission.guide_id !== callerProfile.id) {
      // Check by email match (pre-provisioned guides may have different UUIDs)
      const { data: siblingProfiles } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', callerProfile.email || '');

      const myIds = new Set((siblingProfiles || []).map(p => p.id));
      myIds.add(callerProfile.id);

      if (!myIds.has(submission.guide_id!)) {
        return NextResponse.json({ error: 'Forbidden: You are not assigned to this submission' }, { status: 403 });
      }
    }

    let newStatus: SubmissionStatus;
    let notifTitle: string;
    let notifMessage: string;
    let notifType: NotificationType = 'info';

    if (action === 'accept') {
      newStatus = 'guide_accepted';
      notifTitle = 'Title Accepted by Guide';
      notifMessage = `Your dissertation title "${submission.title}" has been accepted by your guide and forwarded to the HOD for review.`;
      notifType = 'success';
    } else if (action === 'reject') {
      if (!rejectionReason?.trim()) {
        return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 });
      }
      newStatus = 'guide_rejected';
      notifTitle = 'Title Rejected by Guide';
      notifMessage = `Your dissertation title "${submission.title}" has been rejected. Reason: ${rejectionReason}`;
      notifType = 'error';
    } else if (action === 'revision') {
      if (!remarks?.trim()) {
        return NextResponse.json({ error: 'Revision remarks are required' }, { status: 400 });
      }
      newStatus = 'revision_requested';
      notifTitle = 'Revision Requested by Guide';
      notifMessage = `Your guide has requested revisions for your dissertation title "${submission.title}". Feedback: ${remarks}`;
      notifType = 'warning';
    } else {
      return NextResponse.json({ error: 'Invalid action. Must be accept, reject, or revision.' }, { status: 400 });
    }

    // Update submission
    const { error: updateError } = await supabase
      .from('submissions')
      .update({
        status: newStatus,
        guide_remarks: remarks?.trim() || (action === 'reject' ? rejectionReason : null),
        guide_reviewed_at: new Date().toISOString(),
      })
      .eq('id', submissionId);

    if (updateError) throw updateError;

    // Send notification to student
    await supabase.from('notifications').insert({
      user_id: submission.student_id,
      title: notifTitle,
      message: notifMessage,
      type: notifType,
      link: '/dashboard',
    });

    // Trigger email workflow
    try {
      const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      await fetch(`${origin}/api/notify-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: `guide_${action}`,
          submissionId,
          remarks: remarks?.trim() || rejectionReason?.trim() || '',
        }),
      });
    } catch (e) {
      console.error('Error triggering notify-workflow:', e);
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      user_id: callerProfile.id,
      action: `guide_${action}_submission`,
      table_name: 'submissions',
      record_id: submissionId,
      new_data: { status: newStatus, remarks: remarks || rejectionReason },
    });

    return NextResponse.json({
      success: true,
      message: action === 'accept'
        ? 'Title accepted and sent to HOD!'
        : action === 'reject'
        ? 'Submission rejected.'
        : 'Revision feedback sent to student.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to process guide review';
    console.error('Error in guide/review API:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

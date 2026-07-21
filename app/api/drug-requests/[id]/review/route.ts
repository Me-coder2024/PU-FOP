import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sendNotificationEmail } from '@/lib/utils/email';
import type { DrugRequestRow, DrugRequestStatus } from '@/lib/supabase/types';

// POST - Dean or PG Director approves/rejects a drug request
// Both must approve before drug is added to database
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();
    const body = await request.json();

    const { userId, action, note } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action are required' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
    }

    // Get reviewer profile
    const { data: reviewer } = await supabase
      .from('profiles')
      .select('id, role, full_name, email')
      .eq('id', userId)
      .single();

    if (!reviewer || !['dean', 'pg_director', 'super_admin'].includes(reviewer.role)) {
      return NextResponse.json({ error: 'Only Dean, PG Director, or Super Admin can review requests' }, { status: 403 });
    }

    // Get the drug request
    const { data: drugRequest } = await supabase
      .from('drug_requests')
      .select(`
        *,
        requester:profiles!drug_requests_requested_by_fkey(full_name, email)
      `)
      .eq('id', id)
      .single();

    if (!drugRequest) {
      return NextResponse.json({ error: 'Drug request not found' }, { status: 404 });
    }

    if (drugRequest.status === 'approved' || drugRequest.status === 'rejected') {
      return NextResponse.json({ error: 'This request has already been finalized' }, { status: 400 });
    }

    const reviewerRole = reviewer.role === 'super_admin' ? 'dean' : reviewer.role; // super_admin acts as dean
    const now = new Date().toISOString();

    // === REJECTION ===
    if (action === 'reject') {
      const { error: updateError } = await supabase
        .from('drug_requests')
        .update({
          status: 'rejected',
          rejected_by: userId,
          rejection_reason: note || 'Request rejected.',
          rejected_at: now,
          // Also record which role reviewed
          ...(reviewerRole === 'dean'
            ? { dean_reviewed_by: userId, dean_review_note: note || 'Rejected', dean_reviewed_at: now }
            : { pg_reviewed_by: userId, pg_review_note: note || 'Rejected', pg_reviewed_at: now }),
        })
        .eq('id', id);

      if (updateError) {
        console.error('Drug request rejection error:', updateError);
        return NextResponse.json({ error: 'Failed to reject request' }, { status: 500 });
      }

      // Notify student
      const studentEmail = (drugRequest.requester as any)?.email;
      const studentName = (drugRequest.requester as any)?.full_name;

      await supabase.from('notifications').insert({
        user_id: drugRequest.requested_by,
        title: 'Drug Request Rejected',
        message: `Your request to add "${drugRequest.drug_name}" has been rejected by ${reviewer.full_name || reviewer.role}. Reason: ${note || 'No reason provided.'}`,
        type: 'error',
        link: '/dashboard/drug-requests',
      });

      if (studentEmail) {
        await sendNotificationEmail(
          studentEmail,
          'Drug Request Rejected',
          `
            <p>Hi ${studentName || 'Student'},</p>
            <p>Your request to add <strong>"${drugRequest.drug_name}"</strong> to the drug database has been <span style="color:#ef4444; font-weight:700;">rejected</span>.</p>
            ${note ? `<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; margin:16px 0;"><p style="margin:0; color:#991b1b; font-size:13px;"><strong>Reason:</strong> ${note}</p></div>` : ''}
            <p>You may submit a new request with corrections.</p>
          `
        );
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'reject_drug_request',
        table_name: 'drug_requests',
        record_id: id,
        new_data: { status: 'rejected', note },
      });

      return NextResponse.json({ status: 'rejected' });
    }

    // === APPROVAL ===
    // Determine new status based on dual-approval logic
    let newStatus: DrugRequestStatus;
    const updateData: Partial<DrugRequestRow> = {};

    if (reviewerRole === 'dean') {
      // Check if this dean already reviewed
      if (drugRequest.dean_reviewed_by) {
        return NextResponse.json({ error: 'Dean has already reviewed this request' }, { status: 400 });
      }

      updateData.dean_reviewed_by = userId;
      updateData.dean_review_note = note || 'Approved';
      updateData.dean_reviewed_at = now;

      // If PG Director already approved, both have now approved
      if (drugRequest.pg_reviewed_by && drugRequest.status === 'pg_approved') {
        newStatus = 'approved';
      } else {
        newStatus = 'dean_approved';
      }
    } else {
      // PG Director
      if (drugRequest.pg_reviewed_by) {
        return NextResponse.json({ error: 'PG Director has already reviewed this request' }, { status: 400 });
      }

      updateData.pg_reviewed_by = userId;
      updateData.pg_review_note = note || 'Approved';
      updateData.pg_reviewed_at = now;

      // If Dean already approved, both have now approved
      if (drugRequest.dean_reviewed_by && drugRequest.status === 'dean_approved') {
        newStatus = 'approved';
      } else {
        newStatus = 'pg_approved';
      }
    }

    updateData.status = newStatus;

    const { error: updateError } = await supabase
      .from('drug_requests')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Drug request approval error:', updateError);
      return NextResponse.json({ error: 'Failed to approve request' }, { status: 500 });
    }

    // If fully approved (both Dean + PG Director), add drug to database
    if (newStatus === 'approved') {
      const dosageForms = drugRequest.dosage_form
        ? [drugRequest.dosage_form]
        : null;

      const { error: drugInsertError } = await supabase.from('drugs').insert({
        name: drugRequest.drug_name,
        category: drugRequest.category || null,
        dosage_forms: dosageForms,
        therapeutic: drugRequest.therapeutic || null,
      });

      if (drugInsertError) {
        console.error('Drug insert error (may already exist):', drugInsertError);
        // Don't fail the approval — drug may already exist
      }

      // Notify student of full approval
      const studentEmail = (drugRequest.requester as any)?.email;
      const studentName = (drugRequest.requester as any)?.full_name;

      await supabase.from('notifications').insert({
        user_id: drugRequest.requested_by,
        title: 'Drug Request Approved! 🎉',
        message: `Your request to add "${drugRequest.drug_name}" has been approved by both Dean and PG Director. It is now available in the drug dropdown.`,
        type: 'success',
        link: '/dashboard/drug-requests',
      });

      if (studentEmail) {
        await sendNotificationEmail(
          studentEmail,
          'Drug Request Fully Approved',
          `
            <p>Hi ${studentName || 'Student'},</p>
            <p>Great news! Your request to add <strong>"${drugRequest.drug_name}"</strong> has been <span style="color:#059669; font-weight:700;">approved by both Dean and PG Director</span>.</p>
            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:12px; margin:16px 0;">
              <p style="margin:0; color:#065f46; font-size:13px;">✅ <strong>${drugRequest.drug_name}</strong> is now available in the drug dropdown when submitting your dissertation title.</p>
            </div>
          `
        );
      }
    } else {
      // Partial approval — notify student and the other reviewer
      const studentEmail = (drugRequest.requester as any)?.email;
      const studentName = (drugRequest.requester as any)?.full_name;
      const approverLabel = reviewerRole === 'dean' ? 'Dean' : 'PG Director';
      const pendingLabel = reviewerRole === 'dean' ? 'PG Director' : 'Dean';

      // Notify student of partial approval
      await supabase.from('notifications').insert({
        user_id: drugRequest.requested_by,
        title: `Drug Request: ${approverLabel} Approved`,
        message: `Your request for "${drugRequest.drug_name}" has been approved by the ${approverLabel}. Waiting for ${pendingLabel} approval.`,
        type: 'info',
        link: '/dashboard/drug-requests',
      });

      if (studentEmail) {
        await sendNotificationEmail(
          studentEmail,
          `Drug Request: ${approverLabel} Approved`,
          `
            <p>Hi ${studentName || 'Student'},</p>
            <p>Your request to add <strong>"${drugRequest.drug_name}"</strong> has been approved by the <strong>${approverLabel}</strong>.</p>
            <p>It is now pending approval from the <strong>${pendingLabel}</strong> before it will be added to the database.</p>
          `
        );
      }

      // Notify the other reviewer that their review is needed
      const otherRole = reviewerRole === 'dean' ? 'pg_director' : 'dean';
      const { data: otherReviewers } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('role', otherRole);

      if (otherReviewers) {
        for (const other of otherReviewers) {
          await supabase.from('notifications').insert({
            user_id: other.id,
            title: 'Drug Request Needs Your Approval',
            message: `The ${approverLabel} has approved a drug request for "${drugRequest.drug_name}". Your approval is also required.`,
            type: 'warning',
            link: otherRole === 'dean' ? '/dean/drug-requests' : '/pg-director/drug-requests',
          });

          if (other.email) {
            await sendNotificationEmail(
              other.email,
              'Drug Request Awaiting Your Approval',
              `
                <p>The ${approverLabel} has approved a drug request for <strong>"${drugRequest.drug_name}"</strong>.</p>
                <p>Your approval is also required before the drug can be added to the database.</p>
                <p>Please log in to your dashboard to review this request.</p>
              `
            );
          }
        }
      }
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: `approve_drug_request_${reviewerRole}`,
      table_name: 'drug_requests',
      record_id: id,
      new_data: { status: newStatus, note },
    });

    return NextResponse.json({ status: newStatus });
  } catch (err) {
    console.error('Drug request review error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

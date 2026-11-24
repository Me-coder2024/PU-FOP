import { requireRole } from '@/lib/utils/require-role';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sendNotificationEmail } from '@/lib/utils/email';
import type { DrugRequestRow, DrugRequestStatus } from '@/lib/supabase/types';

// POST - Dean or PG Director approves/rejects a drug request
// Single-approval: Either Dean OR PG Director can approve (no dual-approval needed)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access=await requireRole(request,['dean','pg_director','super_admin']);
    if(access.response)return access.response;
    const { id } = await params;
    const supabase = createServiceClient();
    const body = await request.json();

    const { action, note } = body;
    const userId=access.user.id;

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
    const isDosageFormRequest = drugRequest.category === 'DOSAGE_FORM_REQUEST';
    const requestLabel = isDosageFormRequest ? 'dosage form' : 'drug';

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
        title: `${isDosageFormRequest ? 'Dosage Form' : 'Drug'} Request Rejected`,
        message: `Your request to add "${drugRequest.drug_name}" has been rejected by ${reviewer.full_name || reviewer.role}. Reason: ${note || 'No reason provided.'}`,
        type: 'error',
        link: '/dashboard/drug-requests',
      });

      if (studentEmail) {
        await sendNotificationEmail(
          studentEmail,
          `${isDosageFormRequest ? 'Dosage Form' : 'Drug'} Request Rejected`,
          `
            <p>Hi ${studentName || 'Student'},</p>
            <p>Your request to add <strong>"${drugRequest.drug_name}"</strong> as a new ${requestLabel} has been <span style="color:#ef4444; font-weight:700;">rejected</span>.</p>
            ${note ? `<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; margin:16px 0;"><p style="margin:0; color:#991b1b; font-size:13px;"><strong>Reason:</strong> ${note}</p></div>` : ''}
            <p>You may submit a new request with corrections.</p>
          `
        );
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: `reject_${isDosageFormRequest ? 'dosage_form' : 'drug'}_request`,
        table_name: 'drug_requests',
        record_id: id,
        new_data: { status: 'rejected', note },
      });

      return NextResponse.json({ status: 'rejected' });
    }

    // === APPROVAL (single-approval: immediately approved) ===
    const updateData: Partial<DrugRequestRow> = {
      status: 'approved',
    };

    if (reviewerRole === 'dean') {
      // Check if this dean already reviewed
      if (drugRequest.dean_reviewed_by) {
        return NextResponse.json({ error: 'Dean has already reviewed this request' }, { status: 400 });
      }
      updateData.dean_reviewed_by = userId;
      updateData.dean_review_note = note || 'Approved';
      updateData.dean_reviewed_at = now;
    } else {
      // PG Director
      if (drugRequest.pg_reviewed_by) {
        return NextResponse.json({ error: 'PG Director has already reviewed this request' }, { status: 400 });
      }
      updateData.pg_reviewed_by = userId;
      updateData.pg_review_note = note || 'Approved';
      updateData.pg_reviewed_at = now;
    }

    const { error: updateError } = await supabase
      .from('drug_requests')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Drug request approval error:', updateError);
      return NextResponse.json({ error: 'Failed to approve request' }, { status: 500 });
    }

    // Add drug/dosage form to database immediately
    if (isDosageFormRequest) {
      // For dosage form requests, we don't insert into drugs table.
      // The dosage form name (stored in drug_name) will be picked up
      // by the DEFAULT_DOSAGE_FORMS or through future API enhancement.
      // For now, log it - the form is approved and visible.
      console.log(`Dosage form request approved: "${drugRequest.drug_name}"`);
    } else {
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
    }

    // Notify student of approval
    const studentEmail = (drugRequest.requester as any)?.email;
    const studentName = (drugRequest.requester as any)?.full_name;
    const approverLabel = reviewerRole === 'dean' ? 'Dean' : 'PG Director';

    await supabase.from('notifications').insert({
      user_id: drugRequest.requested_by,
      title: `${isDosageFormRequest ? 'Dosage Form' : 'Drug'} Request Approved! 🎉`,
      message: `Your request to add "${drugRequest.drug_name}" has been approved by the ${approverLabel}. It is now available in the dropdown.`,
      type: 'success',
      link: '/dashboard/drug-requests',
    });

    if (studentEmail) {
      await sendNotificationEmail(
        studentEmail,
        `${isDosageFormRequest ? 'Dosage Form' : 'Drug'} Request Approved`,
        `
          <p>Hi ${studentName || 'Student'},</p>
          <p>Great news! Your request to add <strong>"${drugRequest.drug_name}"</strong> as a new ${requestLabel} has been <span style="color:#059669; font-weight:700;">approved by the ${approverLabel}</span>.</p>
          <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:12px; margin:16px 0;">
            <p style="margin:0; color:#065f46; font-size:13px;">✅ <strong>${drugRequest.drug_name}</strong> is now available in the ${isDosageFormRequest ? 'dosage form' : 'drug'} dropdown when submitting your dissertation title.</p>
          </div>
        `
      );
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: `approve_${isDosageFormRequest ? 'dosage_form' : 'drug'}_request_${reviewerRole}`,
      table_name: 'drug_requests',
      record_id: id,
      new_data: { status: 'approved', note },
    });

    return NextResponse.json({ status: 'approved' });
  } catch (err) {
    console.error('Drug request review error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

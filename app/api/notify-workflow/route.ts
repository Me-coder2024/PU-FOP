import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendNotificationEmail, sendPgDirectorNotification } from '@/lib/utils/email';

export async function POST(req: Request) {
  try {
    const { type, submissionId, remarks } = await req.json();

    if (!submissionId || !type) {
      return NextResponse.json({ error: 'submissionId and type are required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Fetch submission with student & guide profiles
    const { data: sub } = await supabase
      .from('submissions')
      .select(`
        *,
        student:profiles!submissions_student_id_fkey(id, full_name, email, university_id, guide_id),
        guide:profiles!submissions_guide_id_fkey(id, full_name, email)
      `)
      .eq('id', submissionId)
      .single();

    if (!sub || !sub.student?.email) {
      return NextResponse.json({ error: 'Submission or student email not found' }, { status: 404 });
    }

    const studentEmail = sub.student.email;
    const studentName = sub.student.full_name || 'Student';
    const title = sub.title;
    const guideEmail = sub.guide?.email;
    const guideName = sub.guide?.full_name || 'Guide';

    switch (type) {
      case 'student_submit': {
        // 1. Email to Student
        await sendNotificationEmail(
          studentEmail,
          'Dissertation Title Submitted Successfully',
          `<p>Dear ${studentName},</p>
           <p>Your dissertation title has been successfully submitted to your guide for review:</p>
           <p style="background:#f1f5f9; padding:12px; border-radius:8px; font-weight:bold; color:#1e293b;">"${title}"</p>
           <p>Current Status: <strong>Submitted (Pending Guide Review)</strong></p>`
        );

        // 2. Email to Guide
        if (guideEmail) {
          await sendNotificationEmail(
            guideEmail,
            'New Student Title Submission Awaiting Review',
            `<p>Dear ${guideName},</p>
             <p>Student <strong>${studentName}</strong> (${sub.student.university_id || 'Student'}) has submitted a new dissertation title for your review:</p>
             <p style="background:#f1f5f9; padding:12px; border-radius:8px; font-weight:bold; color:#1e293b;">"${title}"</p>
             <p>Please log in to your Guide portal to review and accept or request revisions.</p>`
          );
        }
        break;
      }

      case 'guide_accept': {
        // 1. Email to Student
        await sendNotificationEmail(
          studentEmail,
          'Title Accepted by Guide — Forwarded to HOD',
          `<p>Dear ${studentName},</p>
           <p>Great news! Your guide <strong>${guideName}</strong> has accepted your dissertation title:</p>
           <p style="background:#f1f5f9; padding:12px; border-radius:8px; font-weight:bold; color:#1e293b;">"${title}"</p>
           <p>Your title has now been forwarded to the HOD for review.</p>`
        );

        // 2. Email to HODs
        const { data: hods } = await supabase.from('profiles').select('email').eq('role', 'hod');
        if (hods) {
          for (const h of hods) {
            if (h.email) {
              await sendNotificationEmail(
                h.email,
                'New Title Awaiting HOD Review',
                `<p>A dissertation title has been accepted by Guide <strong>${guideName}</strong> for student <strong>${studentName}</strong> and is awaiting your review:</p>
                 <p style="background:#f1f5f9; padding:12px; border-radius:8px; font-weight:bold; color:#1e293b;">"${title}"</p>`
              );
            }
          }
        }
        break;
      }

      case 'guide_revision':
      case 'guide_reject': {
        const isReject = type === 'guide_reject';
        await sendNotificationEmail(
          studentEmail,
          isReject ? 'Title Rejected by Guide' : 'Revision Requested by Guide',
          `<p>Dear ${studentName},</p>
           <p>Your guide <strong>${guideName}</strong> has ${isReject ? 'rejected' : 'requested revisions for'} your title submission:</p>
           <p style="background:#f1f5f9; padding:12px; border-radius:8px; color:#1e293b;">"${title}"</p>
           <p><strong>Feedback / Remarks:</strong> ${remarks || 'No remarks provided.'}</p>`
        );
        break;
      }

      case 'hod_accept': {
        // 1. Email to Student
        await sendNotificationEmail(
          studentEmail,
          'Title Approved by HOD — Pending Final Approval',
          `<p>Dear ${studentName},</p>
           <p>Your dissertation title <strong>"${title}"</strong> has been approved by the HOD and forwarded to the PG Director & Dean for finalization.</p>`
        );

        // 2. Email to PG Director & Dean
        await sendPgDirectorNotification(
          'New Title Awaiting Final Review',
          `<p>The HOD has approved a dissertation title for student <strong>${studentName}</strong>:</p>
           <p style="background:#f1f5f9; padding:12px; border-radius:8px; font-weight:bold; color:#1e293b;">"${title}"</p>
           <p>Please log in to review and finalize.</p>`
        );
        break;
      }

      case 'hod_revision': {
        await sendNotificationEmail(
          studentEmail,
          'Revision Requested by HOD',
          `<p>Dear ${studentName},</p>
           <p>The HOD has requested changes to your title <strong>"${title}"</strong>.</p>
           <p><strong>Remarks:</strong> ${remarks || 'Please make necessary revisions.'}</p>`
        );
        break;
      }

      case 'dean_finalize': {
        // 1. Email to Student
        await sendNotificationEmail(
          studentEmail,
          'Dissertation Title Finalized & Approved!',
          `<p>Dear ${studentName},</p>
           <p>Congratulations! Your dissertation title has been officially finalized and approved by the Dean & PG Director:</p>
           <p style="background:#ecfdf5; padding:14px; border-radius:10px; font-weight:bold; color:#065f46;">"${title}"</p>`
        );

        // 2. Email to Guide
        if (guideEmail) {
          await sendNotificationEmail(
            guideEmail,
            'Student Dissertation Title Finalized',
            `<p>Dear ${guideName},</p>
             <p>The dissertation title for your student <strong>${studentName}</strong> has been officially finalized:</p>
             <p style="background:#ecfdf5; padding:12px; border-radius:8px; font-weight:bold; color:#065f46;">"${title}"</p>`
          );
        }
        break;
      }

      case 'dean_revision': {
        await sendNotificationEmail(
          studentEmail,
          'Revision Requested by Dean',
          `<p>Dear ${studentName},</p>
           <p>The Dean has requested revisions for your title <strong>"${title}"</strong>.</p>
           <p><strong>Remarks:</strong> ${remarks || 'Please log in to edit your title.'}</p>`
        );
        break;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Notification failed';
    console.error('Error in notify-workflow:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sendNotificationEmail } from '@/lib/utils/email';
import type { DrugRequestStatus } from '@/lib/supabase/types';

// GET - Fetch drug requests (filtered by role)
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const role = searchParams.get('role');
    const status = searchParams.get('status');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    let query = supabase
      .from('drug_requests')
      .select(`
        *,
        requester:profiles!drug_requests_requested_by_fkey(full_name, email, university_id)
      `)
      .order('created_at', { ascending: false });

    // Students only see their own requests
    if (role === 'student') {
      query = query.eq('requested_by', userId);
    }

    // Optional status filter
    if (status && status !== 'all') {
      query = query.eq('status', status as DrugRequestStatus);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Drug requests query error:', error);
      return NextResponse.json({ error: 'Failed to fetch drug requests' }, { status: 500 });
    }

    return NextResponse.json({ requests: data || [] });
  } catch (err) {
    console.error('Drug requests API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new drug request (students only)
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const body = await request.json();

    const { userId, drugName, dosageForm, category, therapeutic, reason, requestType } = body;
    const isDosageFormRequest = requestType === 'dosage_form';

    if (!userId || !drugName?.trim()) {
      return NextResponse.json({ error: isDosageFormRequest ? 'userId and dosage form name are required' : 'userId and drugName are required' }, { status: 400 });
    }

    // Verify user is a student
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, full_name, email')
      .eq('id', userId)
      .single();

    if (!profile || profile.role !== 'student') {
      return NextResponse.json({ error: isDosageFormRequest ? 'Only students can submit dosage form requests' : 'Only students can submit drug requests' }, { status: 403 });
    }

    // Check for duplicate pending request
    const { data: existing } = await supabase
      .from('drug_requests')
      .select('id')
      .eq('requested_by', userId)
      .ilike('drug_name', drugName.trim())
      .in('status', ['pending', 'dean_approved', 'pg_approved'])
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: isDosageFormRequest ? 'You already have a pending request for this dosage form.' : 'You already have a pending request for this drug.' }, { status: 409 });
    }

    // Check if drug/dosage form already exists in database
    if (!isDosageFormRequest) {
      const { data: existingDrug } = await supabase
        .from('drugs')
        .select('id')
        .ilike('name', drugName.trim())
        .maybeSingle();

      if (existingDrug) {
        return NextResponse.json({ error: 'This drug already exists in the database.' }, { status: 409 });
      }
    }

    // Insert the request
    const { data: newRequest, error: insertError } = await supabase
      .from('drug_requests')
      .insert({
        requested_by: userId,
        drug_name: drugName.trim(),
        dosage_form: isDosageFormRequest ? null : (dosageForm?.trim() || null),
        category: isDosageFormRequest ? 'DOSAGE_FORM_REQUEST' : (category?.trim() || null),
        therapeutic: isDosageFormRequest ? null : (therapeutic?.trim() || null),
        reason: reason?.trim() || null,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Drug request insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create drug request' }, { status: 500 });
    }

    // Notify all Deans and PG Directors via in-app notification + email
    const { data: reviewers } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('role', ['dean', 'pg_director']);

    if (reviewers) {
      const requestLabel = isDosageFormRequest ? 'Dosage Form' : 'Drug';
      const notifications = reviewers.map((r) => ({
        user_id: r.id,
        title: `New ${requestLabel} Request`,
        message: `Student ${profile.full_name || profile.email} has requested to add "${drugName.trim()}" as a new ${requestLabel.toLowerCase()}.`,
        type: 'info' as const,
        link: r.id ? '/dean/drug-requests' : '/pg-director/drug-requests',
      }));

      // Fix link based on role
      for (const reviewer of reviewers) {
        const { data: reviewerProfile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', reviewer.id)
          .single();

        await supabase.from('notifications').insert({
          user_id: reviewer.id,
          title: `New ${requestLabel} Request`,
          message: `Student ${profile.full_name || profile.email} has requested to add "${drugName.trim()}" as a new ${requestLabel.toLowerCase()}.`,
          type: 'info',
          link: reviewerProfile?.role === 'dean' ? '/dean/drug-requests' : '/pg-director/drug-requests',
        });

        // Send email notification
        if (reviewer.email) {
          await sendNotificationEmail(
            reviewer.email,
            `New ${requestLabel} Request Submitted`,
            `
              <p>A student has submitted a new ${requestLabel.toLowerCase()} request that requires your review.</p>
              <table style="width:100%; border-collapse:collapse; margin:16px 0;">
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:8px 0; color:#94a3b8; font-size:12px; width:120px;">Student</td>
                  <td style="padding:8px 0; color:#1e293b; font-weight:600;">${profile.full_name || profile.email}</td>
                </tr>
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:8px 0; color:#94a3b8; font-size:12px;">${isDosageFormRequest ? 'Dosage Form' : 'Drug Name'}</td>
                  <td style="padding:8px 0; color:#1e293b; font-weight:600;">${drugName.trim()}</td>
                </tr>
                ${!isDosageFormRequest && dosageForm ? `
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:8px 0; color:#94a3b8; font-size:12px;">Dosage Form</td>
                  <td style="padding:8px 0; color:#1e293b; font-weight:600;">${dosageForm.trim()}</td>
                </tr>` : ''}
                ${reason ? `
                <tr>
                  <td style="padding:8px 0; color:#94a3b8; font-size:12px;">Reason</td>
                  <td style="padding:8px 0; color:#1e293b;">${reason.trim()}</td>
                </tr>` : ''}
              </table>
              <p style="margin-top:16px;">Please log in to your dashboard to review this request.</p>
            `
          );
        }
      }
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: isDosageFormRequest ? 'create_dosage_form_request' : 'create_drug_request',
      table_name: 'drug_requests',
      record_id: newRequest.id,
      new_data: { drug_name: drugName.trim(), request_type: isDosageFormRequest ? 'dosage_form' : 'drug', dosage_form: dosageForm?.trim() },
    });

    return NextResponse.json({ request: newRequest });
  } catch (err) {
    console.error('Drug request POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

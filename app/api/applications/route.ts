import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const userId = searchParams.get('userId');
    const deptId = searchParams.get('deptId');
    const instId = searchParams.get('instId');

    let query = supabase.from('topics').select(`
      id,
      title,
      department_id,
      student:users!topics_student_id_fkey(name, enrollment_no, guide_id, institute_id),
      approvals(guide_status, hoi_status, pg_director_status, dean_status, remarks)
    `).not('student_id', 'is', null);

    if (role === 'GUIDE' && userId) {
      query = query.eq('student.guide_id', userId);
    } else if (role === 'HOI' && instId) {
      query = query.eq('student.institute_id', instId);
    } else if (role === 'PG_DIRECTOR' && deptId) {
      query = query.eq('student.department_id', deptId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || 'Server error fetching applications.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { topicId, actorRole, newStatus, remarks } = await req.json();

    if (!topicId || !actorRole || !newStatus) {
      return NextResponse.json({ message: 'Topic ID, role, and status parameters are required.' }, { status: 400 });
    }

    // 1. Fetch approvals entry matching the topic
    const { data: approval, error: findError } = await supabase
      .from('approvals')
      .select('id')
      .eq('topic_id', topicId)
      .maybeSingle();

    if (findError || !approval) {
      return NextResponse.json({ message: 'Approvals checklist entry not found.' }, { status: 404 });
    }

    // 2. Map role to specific approval status column
    const updatePayload: Record<string, any> = { remarks };
    if (actorRole === 'GUIDE') updatePayload.guide_status = newStatus;
    else if (actorRole === 'HOI') updatePayload.hoi_status = newStatus;
    else if (actorRole === 'PG_DIRECTOR') updatePayload.pg_director_status = newStatus;
    else if (actorRole === 'DEAN') updatePayload.dean_status = newStatus;
    else {
      return NextResponse.json({ message: 'Invalid evaluator role specified.' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('approvals')
      .update(updatePayload)
      .eq('id', approval.id);

    if (updateError) throw updateError;

    // 3. Update corresponding progress stage status
    if (newStatus === 'APPROVED') {
      const { error: progressError } = await supabase
        .from('progress')
        .update({ status: 'APPROVED' })
        .eq('topic_id', topicId)
        .eq('stage', 'ITD');
      if (progressError) throw progressError;
    }

    return NextResponse.json({ message: 'Evaluation status updated successfully.' });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || 'Server error updating status.' }, { status: 500 });
  }
}

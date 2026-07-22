import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(req: Request) {
  try {
    const { action, name, email, role, departmentId, enrollmentNo } = await req.json();

    if (action === 'create_user') {
      if (!name || !email || !role) {
        return NextResponse.json({ message: 'Name, email, and role are required parameters.' }, { status: 400 });
      }

      // Generate a temporary mock firebase_uid (updated when user first signs in)
      const mockUid = `temp_${Math.random().toString(36).substring(2, 10)}`;

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          name,
          email,
          role,
          firebase_uid: mockUid,
          status: 'ACTIVE',
          department_id: departmentId || null,
          enrollment_no: enrollmentNo || null,
          institute_id: 'PU-FOP', // Default institute mapping
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return NextResponse.json({
        message: 'Account registered in system roster.',
        data: newUser,
      });
    }

    if (action === 'clear_students') {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const supabaseAdmin = createServiceClient();

      // 1. Get all student IDs
      const { data: studentProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'student');

      const studentIds = (studentProfiles || []).map(p => p.id);

      if (studentIds.length > 0) {
        // Delete submissions, notifications, drug_requests, feedback
        await supabaseAdmin.from('submissions').delete().in('student_id', studentIds);
        await supabaseAdmin.from('notifications').delete().in('user_id', studentIds);
        await supabaseAdmin.from('drug_requests').delete().in('requested_by', studentIds);
        await supabaseAdmin.from('feedback').delete().in('user_id', studentIds);
        await supabaseAdmin.from('profiles').delete().in('id', studentIds);
      }

      return NextResponse.json({
        message: `Successfully cleared ${studentIds.length} student profile(s) and their submission records.`,
      });
    }

    return NextResponse.json({ message: 'Invalid administration action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || 'Server error during administration process.' }, { status: 500 });
  }
}

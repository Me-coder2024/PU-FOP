import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Secure server-side API for role grant management.
 * Replaces direct client-side supabase.from('role_grants').insert/delete calls.
 * Uses service_role key — no Supabase credentials exposed to browser.
 */

export async function POST(req: Request) {
  try {
    const supabase = createServiceClient();
    const body = await req.json();
    const { action } = body;

    // Verify caller is authenticated and has dean/super_admin role
    const authHeader = req.headers.get('x-user-id');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: callerProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', authHeader)
      .single();

    if (profileErr || !callerProfile || !['dean', 'super_admin'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden: Dean or Super Admin access required' }, { status: 403 });
    }

    if (action === 'create') {
      const { email, role, institute_id, department_id, can_edit } = body;

      if (!email || !role) {
        return NextResponse.json({ error: 'Email and role are required' }, { status: 400 });
      }

      const trimmedEmail = email.trim().toLowerCase();

      // Check for existing grant
      const { data: existingGrant } = await supabase
        .from('role_grants')
        .select('id')
        .eq('email', trimmedEmail)
        .eq('role', role)
        .maybeSingle();

      if (existingGrant) {
        return NextResponse.json({ error: `Role "${role}" is already granted to ${trimmedEmail}.` }, { status: 409 });
      }

      // Create the grant
      const { error: grantErr } = await supabase.from('role_grants').insert({
        email: trimmedEmail,
        role,
        institute_id: institute_id || null,
        department_id: department_id || null,
        can_edit: can_edit || false,
        granted_by: callerProfile.id,
      });

      if (grantErr) throw grantErr;

      // Update existing profile if user already registered
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', trimmedEmail)
        .maybeSingle();

      if (existingUser) {
        await supabase
          .from('profiles')
          .update({
            role,
            institute_id: institute_id || null,
            department_id: department_id || null,
          })
          .eq('id', existingUser.id);
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: callerProfile.id,
        action: 'dean_create_role_grant',
        table_name: 'role_grants',
        new_data: { email: trimmedEmail, role, institute_id, department_id },
      });

      return NextResponse.json({ success: true, message: 'Role pre-provisioned successfully.' });
    }

    if (action === 'revoke') {
      const { grantId, grantEmail } = body;

      if (!grantId) {
        return NextResponse.json({ error: 'Grant ID is required' }, { status: 400 });
      }

      // Delete the grant
      const { error: deleteErr } = await supabase.from('role_grants').delete().eq('id', grantId);
      if (deleteErr) throw deleteErr;

      // Reset profile role if user exists
      if (grantEmail) {
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', grantEmail)
          .maybeSingle();

        if (existingUser) {
          // Find remaining grants
          const { data: remainingGrants } = await supabase
            .from('role_grants')
            .select('role, institute_id, department_id')
            .eq('email', grantEmail);

          const nextRole = remainingGrants && remainingGrants.length > 0 ? remainingGrants[0].role : 'student';
          const nextInstId = remainingGrants && remainingGrants.length > 0 ? remainingGrants[0].institute_id : null;
          const nextDeptId = remainingGrants && remainingGrants.length > 0 ? remainingGrants[0].department_id : null;

          await supabase
            .from('profiles')
            .update({ role: nextRole, institute_id: nextInstId, department_id: nextDeptId })
            .eq('id', existingUser.id);
        }
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: callerProfile.id,
        action: 'dean_delete_role_grant',
        table_name: 'role_grants',
        record_id: grantId,
        old_data: { email: grantEmail },
      });

      return NextResponse.json({ success: true, message: 'Role access revoked successfully.' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to manage role grant';
    console.error('Error in role-grants API:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

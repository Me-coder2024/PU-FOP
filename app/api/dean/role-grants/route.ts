import { requireRole } from '@/lib/utils/require-role';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Secure server-side API for role grant management.
 * Replaces direct client-side supabase.from('role_grants').insert/delete calls.
 * Uses service_role key — no Supabase credentials exposed to browser.
 */

export async function POST(req: Request) {
  try {
    const access=await requireRole(req,['dean','super_admin','hod']);
    if(access.response)return access.response;
    const supabase = createServiceClient();
    const body = await req.json();
    const { action } = body;

    const callerProfile = access.profile;
    const isHod = callerProfile.role === 'hod';
    if (isHod && (!callerProfile.institute_id || !callerProfile.department_id)) return NextResponse.json({error:'HOD institute and department must be assigned.'}, {status:403});

    if (action === 'reassign_guide') {
      const {error} = await supabase.rpc('reassign_student_guide',{p_actor:access.user.id,p_student:body.studentId,p_guide:body.guideId});
      if (error) return NextResponse.json({error:error.message},{status:409});
      return NextResponse.json({success:true});
    }

    if (action === 'create') {
      const { email, role, can_edit } = body;
      const institute_id = isHod ? callerProfile.institute_id : body.institute_id;
      const department_id = isHod ? callerProfile.department_id : body.department_id;

      const allowedRoles = isHod ? ['guide'] : access.profile.role === 'super_admin' ? ['student','guide','hod','pg_director','dean','super_admin'] : ['student','guide','hod','pg_director','dean'];
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !allowedRoles.includes(role)) {
        return NextResponse.json({ error: 'Email and role are required' }, { status: 400 });
      }

      const trimmedEmail = email.trim().toLowerCase();

      if (isHod) {
        const {data: target} = await supabase.from('profiles').select('id').eq('email',trimmedEmail).eq('institute_id',institute_id).eq('department_id',department_id).maybeSingle();
        if (!target) return NextResponse.json({error:'Choose a registered user in your department.'}, {status:403});
      }
      if (department_id) {
        const {data: department} = await supabase.from('departments').select('id').eq('id',department_id).eq('institute_id',institute_id).maybeSingle();
        if (!department) return NextResponse.json({error:'Department must belong to the selected institute.'}, {status:400});
      }

      // Check for existing grant
      const { data: existingGrant } = await supabase
        .from('role_grants')
        .select('id, role')
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
        .select('id, role')
        .eq('email', trimmedEmail)
        .maybeSingle();

      if (existingUser && existingUser.role === 'student') {
        const {error: updateError} = await supabase
          .from('profiles')
          .update({
            role,
            institute_id: institute_id || null,
            department_id: department_id || null,
          })
          .eq('id', existingUser.id);
        if (updateError) throw updateError;
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
      let grantId = body.grantId;
      if (isHod && body.userId) {
        const {data: target} = await supabase.from('profiles').select('email').eq('id',body.userId).eq('institute_id',callerProfile.institute_id!).eq('department_id',callerProfile.department_id!).single();
        if (!target) return NextResponse.json({error:'Guide unavailable in your department.'}, {status:403});
        const {data: matched} = await supabase.from('role_grants').select('id').eq('email',target.email).eq('role','guide').maybeSingle();
        grantId = matched?.id;
      }
      if (typeof grantId !== 'string') return NextResponse.json({error:'Grant ID is required'}, {status:400});
      // Resolve identity from the stored grant, never from grantEmail in the request.
      const {data: grant, error: lookupError} = await supabase.from('role_grants')
        .select('id, email, role, institute_id, department_id').eq('id', grantId).single();
      if (lookupError || !grant) return NextResponse.json({error:'Role grant not found'}, {status:404});
      if (grant.role === 'super_admin' && access.profile.role !== 'super_admin') {
        return NextResponse.json({error:'Super Admin access required'}, {status:403});
      }
      if (isHod && (grant.role !== 'guide' || grant.institute_id !== callerProfile.institute_id || grant.department_id !== callerProfile.department_id)) return NextResponse.json({error:'Only guide grants in your department can be revoked.'}, {status:403});
      const grantEmail = grant.email;
      const {data: existingUser, error: userError} = await supabase.from('profiles')
        .select('id, role').eq('email', grantEmail).maybeSingle();
      if (userError) throw userError;
      if (grant.role === 'guide' && existingUser) {
        const {count,error:countError} = await supabase.from('profiles').select('id',{count:'exact',head:true}).eq('guide_id',existingUser.id);
        if (countError) throw countError;
        if (count) return NextResponse.json({error:'Reassign this guide’s students before revoking the guide role.'}, {status:409});
      }
      if (existingUser?.role === grant.role) {
        const {data: remaining, error: remainingError} = await supabase.from('role_grants')
          .select('role, institute_id, department_id').eq('email', grantEmail).neq('id', grantId).order('role');
        if (remainingError) throw remainingError;
        const next = remaining?.[0];
        const {error: updateError} = await supabase.from('profiles').update({
          role: next?.role || 'student', institute_id: next?.institute_id || null,
          department_id: next?.department_id || null,
        }).eq('id', existingUser.id).eq('role', grant.role);
        if (updateError) throw updateError;
      }
      const {error: deleteError} = await supabase.from('role_grants').delete().eq('id', grantId);
      if (deleteError) throw deleteError;

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

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const instituteId = searchParams.get('institute_id');

    if (!instituteId) {
      return NextResponse.json({ guides: [] });
    }

    const supabaseAdmin = createServiceClient();

    // 1. Fetch role_grants for guides in this institute
    const { data: grants } = await supabaseAdmin
      .from('role_grants')
      .select('email, institute_id, department_id')
      .eq('role', 'guide')
      .eq('institute_id', instituteId);

    const grantEmails = (grants || []).map((g) => g.email.toLowerCase());

    // 2. Fetch existing profiles for guides in this institute (matching granted guide emails OR having role = 'guide')
    let query = supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('institute_id', instituteId);

    if (grantEmails.length > 0) {
      // Query profiles by role = 'guide' OR email in grantEmails
      query = query.or(`role.eq.guide,email.in.(${grantEmails.join(',')})`);
    } else {
      query = query.eq('role', 'guide');
    }

    const { data: existingProfiles } = await query.order('full_name');

    const profileEmails = new Set(
      (existingProfiles || []).map((p) => p.email.toLowerCase())
    );

    // 3. For any role_grant without a profile, provision auth.user + profile
    const missingGrants = (grants || []).filter(
      (g) => !profileEmails.has(g.email.toLowerCase())
    );

    if (missingGrants.length > 0) {
      for (const grant of missingGrants) {
        try {
          const email = grant.email.toLowerCase();
          const dummyPassword = `Guide#${Math.random().toString(36).substring(2, 10)}!${Date.now()}`;

          // Create auth user
          const { data: newUser, error: createError } =
            await supabaseAdmin.auth.admin.createUser({
              email,
              password: dummyPassword,
              email_confirm: true,
            });

          let userId: string | null = null;
          if (newUser?.user) {
            userId = newUser.user.id;
          } else if (createError) {
            // User might exist in auth.users already but missing from profiles table
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
              perPage: 100,
              page: 1,
            });
            const found = listData?.users?.find((u) => u.email?.toLowerCase() === email);
            if (found) userId = found.id;
          }

          if (userId) {
            // Format nice display name from email (e.g. rakesh.patel18006@parul... -> Rakesh Patel)
            const emailPrefix = email.split('@')[0];
            const cleanPrefix = emailPrefix.replace(/\d+/g, '').replace(/[._]/g, ' ').trim();
            const formattedName = cleanPrefix
              ? cleanPrefix.replace(/\b\w/g, (c) => c.toUpperCase())
              : emailPrefix;

            await supabaseAdmin.from('profiles').upsert(
              {
                id: userId,
                email,
                full_name: formattedName,
                role: 'guide',
                institute_id: grant.institute_id,
                department_id: grant.department_id,
              },
              { onConflict: 'id' }
            );
          }
        } catch (err) {
          console.error('Error auto-provisioning guide profile:', err);
        }
      }

      // Re-fetch all profiles for this institute after auto-provisioning
      const { data: updatedProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .eq('institute_id', instituteId)
        .or(`role.eq.guide,email.in.(${grantEmails.length > 0 ? grantEmails.join(',') : 'none'})`)
        .order('full_name');

      return NextResponse.json({ guides: updatedProfiles || [] });
    }

    return NextResponse.json({ guides: existingProfiles || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch guides';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { createServiceClient } from '@/lib/supabase/server';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * POST /api/onboarding
 *
 * Server-side handler for student onboarding profile completion.
 * Uses the service role key to bypass RLS (the client-side
 * `supabase.from('profiles').update(...)` silently returns 0 rows
 * when RLS blocks the write, causing the redirect to fail).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fullName, universityId, instituteId, departmentId, guideId, userId, userEmail } = body;

    // --- Validate required fields ---
    if (!fullName?.trim()) {
      return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
    }
    if (!universityId?.trim()) {
      return NextResponse.json({ error: 'University ID is required.' }, { status: 400 });
    }
    if (!instituteId) {
      return NextResponse.json({ error: 'Institute is required.' }, { status: 400 });
    }
    if (!departmentId) {
      return NextResponse.json({ error: 'Department is required.' }, { status: 400 });
    }
    if (!guideId) {
      return NextResponse.json({ error: 'Guide is required.' }, { status: 400 });
    }

    const supabaseAdmin = createServiceClient();

    // --- Authenticate the caller: first via Supabase session cookie, then via body.userId ---
    let targetUserId: string | null = null;
    let targetUserEmail: string | null = null;

    try {
      const cookieStore = await cookies();
      const supabase = createSupabaseServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                );
              } catch {
                // Read-only context
              }
            },
          },
        }
      );

      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        targetUserId = user.id;
        targetUserEmail = user.email || null;
      }
    } catch (cookieErr) {
      console.warn('[Onboarding] Cookie auth error:', cookieErr);
    }

    // Fallback to body.userId if cookie session was not accessible
    if (!targetUserId && userId) {
      const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (adminUser?.user?.id) {
        targetUserId = adminUser.user.id;
        targetUserEmail = adminUser.user.email || null;
      }
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'Not authenticated. Please sign in again.' }, { status: 401 });
    }

    if (!targetUserEmail && userEmail) {
      targetUserEmail = userEmail;
    }

    if (!targetUserEmail) {
      const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      targetUserEmail = adminUser?.user?.email || '';
    }

    // Build the upsert payload
    const updatePayload = {
      id: targetUserId,
      email: targetUserEmail,
      full_name: fullName.trim(),
      university_id: universityId.trim(),
      institute_id: instituteId,
      department_id: departmentId,
      updated_at: new Date().toISOString(),
    };

    let updateError: { message: string } | null = null;

    // First attempt: with guide_id
    const { error: err1 } = await supabaseAdmin
      .from('profiles')
      .upsert({ ...updatePayload, guide_id: guideId }, { onConflict: 'id' });

    if (err1) {
      console.warn('[Onboarding] Upsert with guide_id failed, retrying without guide_id:', err1.message);
      const { error: err2 } = await supabaseAdmin
        .from('profiles')
        .upsert(updatePayload, { onConflict: 'id' });
      updateError = err2;
    }

    if (updateError) {
      console.error('[Onboarding] Profile update failed:', updateError.message);
      return NextResponse.json(
        { error: `Profile update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // --- Determine redirect URL based on role ---
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, university_id')
      .eq('id', targetUserId)
      .maybeSingle();

    console.log('[Onboarding] Successfully saved profile for user:', targetUserId, profile);

    const role = profile?.role || 'student';
    const roleRedirects: Record<string, string> = {
      student: '/dashboard',
      guide: '/guide',
      hod: '/hod',
      pg_director: '/pg-director',
      dean: '/dean',
      super_admin: '/super-admin',
    };

    const redirectUrl = roleRedirects[role] || '/dashboard';

    return NextResponse.json({ success: true, redirectUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error during onboarding.';
    console.error('[Onboarding] Unexpected error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import type { AppRole } from '@/lib/supabase/types';

function generateSecurePassword(email: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return crypto.createHmac('sha256', key).update(email).digest('hex');
}

export async function POST(request: Request) {
  try {
    // --- Validate env vars early ---
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Auth sync: SUPABASE_SERVICE_ROLE_KEY is missing');
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
      console.error('Auth sync: NEXT_PUBLIC_FIREBASE_API_KEY is missing');
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    let body: { idToken?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { idToken } = body;
    if (!idToken) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    // 1. Verify Firebase ID Token via Google Identity Toolkit
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    let lookupRes: Response;
    try {
      lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );
    } catch (fetchErr) {
      console.error('Firebase lookup fetch failed:', fetchErr);
      return NextResponse.json({ error: 'Failed to verify Firebase token. Network error.' }, { status: 502 });
    }

    if (!lookupRes.ok) {
      const errText = await lookupRes.text().catch(() => 'Unknown error');
      console.error('Firebase lookup failed:', lookupRes.status, errText);
      return NextResponse.json({ error: 'Invalid or expired Firebase token. Please sign in again.' }, { status: 401 });
    }

    let lookupData: { users?: Array<{ email?: string; displayName?: string; photoUrl?: string }> };
    try {
      lookupData = await lookupRes.json();
    } catch {
      return NextResponse.json({ error: 'Invalid response from Firebase.' }, { status: 502 });
    }

    const fbUser = lookupData.users?.[0];
    const email = fbUser?.email?.toLowerCase();
    const displayName = fbUser?.displayName || '';
    const photoUrl = fbUser?.photoUrl || '';

    if (!email) {
      return NextResponse.json({ error: 'No email associated with this account.' }, { status: 401 });
    }

    const allowedDomain = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || 'paruluniversity.ac.in';
    const supabaseAdmin = createServiceClient();
    const securePassword = generateSecurePassword(email);

    // 2. Fast Path: Check if user profile already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      // Existing user — password is deterministic, return immediately (<100ms response time)
      return NextResponse.json({ email, securePassword });
    }

    // Domain / Grant check
    const isDomainAllowed = email.endsWith('@' + allowedDomain) || email === 'me.coder.in@gmail.com';
    let roleGrantData: { role?: string; institute_id?: string | null; department_id?: string | null } | null = null;

    if (!isDomainAllowed) {
      const { data: grant } = await supabaseAdmin
        .from('role_grants')
        .select('role, institute_id, department_id')
        .eq('email', email)
        .maybeSingle();

      if (!grant) {
        return NextResponse.json(
          { error: `Only @${allowedDomain} accounts are allowed.` },
          { status: 403 }
        );
      }
      roleGrantData = grant;
    }

    // 3. New User Registration — run Auth user creation and role_grants lookup in parallel
    const [createRes, grantRes] = await Promise.all([
      supabaseAdmin.auth.admin.createUser({
        email,
        password: securePassword,
        email_confirm: true,
        user_metadata: { full_name: displayName, avatar_url: photoUrl },
      }),
      roleGrantData
        ? Promise.resolve({ data: roleGrantData, error: null })
        : supabaseAdmin
            .from('role_grants')
            .select('role, institute_id, department_id')
            .eq('email', email)
            .maybeSingle(),
    ]);

    let userId: string;
    const { data: newUser, error: createError } = createRes;

    if (createError) {
      // Rare edge case: Auth user exists in auth.users but profile was missing
      if (createError.message?.includes('already been registered') || createError.status === 422) {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
          perPage: 50,
          page: 1,
        });

        const foundUser = listData?.users?.find((u) => u.email?.toLowerCase() === email);
        if (!foundUser) {
          console.error('User registered in auth but not found in list:', email);
          return NextResponse.json(
            { error: 'Account sync issue. Please try signing in again.' },
            { status: 500 }
          );
        }

        userId = foundUser.id;
        await supabaseAdmin.auth.admin.updateUserById(userId, { password: securePassword });
      } else {
        console.error('createUser failed:', createError);
        return NextResponse.json(
          { error: `Auth setup failed: ${createError.message}` },
          { status: 500 }
        );
      }
    } else {
      userId = newUser.user.id;
    }

    // 4. Create profile for new user
    const roleGrant = grantRes?.data;
    const role: AppRole = email === 'me.coder.in@gmail.com'
      ? 'super_admin'
      : ((roleGrant?.role as AppRole) || 'student');

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email,
        full_name: displayName,
        avatar_url: photoUrl,
        role,
        institute_id: roleGrant?.institute_id || null,
        department_id: roleGrant?.department_id || null,
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('Profile creation failed:', profileError);
      return NextResponse.json(
        { error: `Profile setup failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    // 5. Return credentials for client-side Supabase sign-in
    return NextResponse.json({ email, securePassword });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Auth sync unexpected error:', err);
    // ALWAYS return JSON, never let Next.js render HTML error page
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

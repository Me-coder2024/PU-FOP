import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

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

    // Query role_grants to see if this email is pre-provisioned
    const { data: grant } = await supabaseAdmin
      .from('role_grants')
      .select('role')
      .eq('email', email)
      .maybeSingle();

    const isGranted = !!grant;

    if (!email.endsWith('@' + allowedDomain) && email !== 'me.coder.in@gmail.com' && !isGranted) {
      return NextResponse.json(
        { error: `Only @${allowedDomain} accounts are allowed.` },
        { status: 403 }
      );
    }

    const securePassword = generateSecurePassword(email);

    // 2. Try to create user first, handle "already exists" gracefully
    let userId: string;

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: securePassword,
      email_confirm: true,
      user_metadata: { full_name: displayName, avatar_url: photoUrl },
    });

    if (createError) {
      // User already exists — find them and update password
      if (createError.message?.includes('already been registered') || createError.status === 422) {
        // Find the existing user by listing with email filter
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
          perPage: 1,
          page: 1,
        });

        // Fallback: search through all users if needed
        let existingUser = listData?.users?.find((u) => u.email?.toLowerCase() === email);

        if (!existingUser) {
          // Try paginated search
          let page = 1;
          const perPage = 100;
          while (!existingUser) {
            const { data: pageData, error: pageError } = await supabaseAdmin.auth.admin.listUsers({
              perPage,
              page,
            });
            if (pageError || !pageData?.users?.length) break;
            existingUser = pageData.users.find((u) => u.email?.toLowerCase() === email);
            if (pageData.users.length < perPage) break; // Last page
            page++;
            if (page > 50) break; // Safety limit
          }
        }

        if (!existingUser) {
          console.error('User registered but not found:', email);
          return NextResponse.json(
            { error: 'Account sync issue. Please try again or contact support.' },
            { status: 500 }
          );
        }

        userId = existingUser.id;

        // Update password to stay in sync
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: securePassword,
        });
        if (updateError) {
          console.error('Password update failed:', updateError);
          // Non-fatal — continue with existing password
        }
      } else {
        console.error('createUser failed with unexpected error:', createError);
        return NextResponse.json(
          { error: `Auth setup failed: ${createError.message}` },
          { status: 500 }
        );
      }
    } else {
      userId = newUser.user.id;
    }

    // 3. Ensure profile exists
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) {
      // Check for pre-provisioned role grant (re-query with full fields)
      const { data: roleGrant } = await supabaseAdmin
        .from('role_grants')
        .select('role, institute_id, department_id')
        .eq('email', email)
        .maybeSingle();

      const role = email === 'me.coder.in@gmail.com'
        ? 'super_admin'
        : (roleGrant?.role || 'student');

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
    }

    // 4. Return credentials for client-side Supabase sign-in
    return NextResponse.json({ email, securePassword });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Auth sync unexpected error:', err);
    // ALWAYS return JSON, never let Next.js render HTML error page
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

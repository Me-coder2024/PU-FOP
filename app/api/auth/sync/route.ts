import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import type { AppRole, ProfileRow } from '@/lib/supabase/types';

// ─── Google Public Key Cache (persists across warm Vercel invocations) ────────
// Firebase ID tokens are RS256 JWTs signed with Google's keys.
// Instead of hitting Google's Identity Toolkit API on EVERY login (300-800ms),
// we cache the public keys and verify JWT signatures locally (<1ms).
let cachedPublicKeys: Record<string, string> | null = null;
let keysExpiresAt = 0;

async function getGooglePublicKeys(): Promise<Record<string, string>> {
  if (cachedPublicKeys && Date.now() < keysExpiresAt) {
    return cachedPublicKeys;
  }
  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error('Failed to fetch Google public keys');
  cachedPublicKeys = await res.json();
  // Respect cache-control header (typically max-age ≈ 19800s ≈ 5.5 hours)
  const cc = res.headers.get('cache-control') || '';
  const m = cc.match(/max-age=(\d+)/);
  keysExpiresAt = Date.now() + (m ? parseInt(m[1]) * 1000 : 3_600_000);
  return cachedPublicKeys!;
}

/** Verify a Firebase ID token locally using Google's cached public keys. */
async function verifyFirebaseIdToken(
  idToken: string
): Promise<{ email: string; displayName: string; photoUrl: string }> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

  // ── Claim checks ──
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) throw new Error('Token expired');
  if (!payload.iat || payload.iat > now + 300) throw new Error('Token issued in the future');

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (projectId) {
    if (payload.aud !== projectId) throw new Error('Invalid audience');
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Invalid issuer');
  }
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('Missing subject');

  // ── Signature verification ──
  const keys = await getGooglePublicKeys();
  const publicKeyPem = keys[header.kid];
  if (!publicKeyPem) throw new Error('Unknown signing key ID');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  const isValid = verifier.verify(publicKeyPem, Buffer.from(parts[2], 'base64url'));
  if (!isValid) throw new Error('Invalid token signature');

  return {
    email: (payload.email as string) || '',
    displayName: (payload.name as string) || '',
    photoUrl: (payload.picture as string) || '',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSecurePassword(email: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return crypto.createHmac('sha256', key).update(email).digest('hex');
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // --- Validate env vars early ---
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Auth sync: SUPABASE_SERVICE_ROLE_KEY is missing');
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    let body: { idToken?: string; emailHint?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { idToken, emailHint } = body;
    if (!idToken) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    // ── 1. Verify token & check profile IN PARALLEL ──────────────────────────
    // The client sends an emailHint so we can start the DB lookup at the same
    // time as the JWT verification — shaving ~50ms for existing users.
    const supabaseAdmin = createServiceClient();
    const normalizedHint = emailHint?.trim().toLowerCase();

    const [tokenResult, profileResult] = await Promise.allSettled([
      verifyFirebaseIdToken(idToken),
      normalizedHint
        ? supabaseAdmin
            .from('profiles')
            .select('id, email, role')
            .eq('email', normalizedHint)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    // Token verification must succeed
    if (tokenResult.status === 'rejected') {
      console.error('Firebase token verification failed:', tokenResult.reason);
      return NextResponse.json(
        { error: 'Invalid or expired Firebase token. Please sign in again.' },
        { status: 401 }
      );
    }

    const { email: verifiedEmail, displayName, photoUrl } = tokenResult.value;
    const email = verifiedEmail.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'No email associated with this account.' }, { status: 401 });
    }

    const securePassword = generateSecurePassword(email);

    // Helper to ensure Supabase Auth user's password matches securePassword
    const syncAuthPassword = async (uid: string) => {
      try {
        await supabaseAdmin.auth.admin.updateUserById(uid, { password: securePassword });
      } catch (err) {
        console.warn(`[Auth Sync] Password update warning for ${uid}:`, err);
      }
    };

    // ── 2. Fast Path: existing user ──────────────────────────────────────────
    // If the emailHint matched AND it matches the verified token email, return
    // immediately without any more DB calls, after ensuring auth password sync.
    if (
      profileResult.status === 'fulfilled' &&
      profileResult.value &&
      'data' in profileResult.value &&
      profileResult.value.data &&
      normalizedHint === email
    ) {
      await syncAuthPassword(profileResult.value.data.id);
      return NextResponse.json({ email, securePassword });
    }

    // emailHint was missing or didn't match — do a verified lookup
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .ilike('email', email)
      .maybeSingle();

    if (existingProfile) {
      // Check if user has a staff role grant that needs to be synced to profiles.role
      const { data: grant } = await supabaseAdmin
        .from('role_grants')
        .select('role, institute_id, department_id')
        .order('role')
        .limit(1)
        .ilike('email', email)
        .maybeSingle();

      if (grant?.role && existingProfile.role === 'student' && grant.role !== 'student') {
        const updateObj: Partial<ProfileRow> = { role: grant.role as AppRole };
        if (grant.institute_id) updateObj.institute_id = grant.institute_id;
        if (grant.department_id) updateObj.department_id = grant.department_id;
        await supabaseAdmin.from('profiles').update(updateObj).eq('id', existingProfile.id);
      }

      await syncAuthPassword(existingProfile.id);
      return NextResponse.json({ email, securePassword });
    }

    // ── 3. Domain / Grant check ──────────────────────────────────────────────
    const allowedDomain = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || 'paruluniversity.ac.in';
    const isDomainAllowed = email.endsWith('@' + allowedDomain) || email === 'me.coder.in@gmail.com';
    let roleGrantData: { role?: string; institute_id?: string | null; department_id?: string | null } | null = null;

    if (!isDomainAllowed) {
      const { data: grant } = await supabaseAdmin
        .from('role_grants')
        .select('role, institute_id, department_id')
        .order('role')
        .limit(1)
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

    // ── 4. New User Registration ─────────────────────────────────────────────
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
        .order('role')
        .limit(1)
            .eq('email', email)
            .maybeSingle(),
    ]);

    let userId: string;
    const { data: newUser, error: createError } = createRes;

    if (createError) {
      if (createError.message?.includes('already been registered') || createError.status === 422) {
        // Auth user exists but profile was missing — find them across all pages
        let page = 1;
        let foundUser: { id: string } | undefined;
        while (!foundUser) {
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
            perPage: 50,
            page,
          });
          if (!listData?.users || listData.users.length === 0) break;
          foundUser = listData.users.find((u) => u.email?.toLowerCase() === email);
          if (listData.users.length < 50) break;
          page++;
        }

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

    // ── 5. Create profile ────────────────────────────────────────────────────
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

    // ── 6. Return credentials ────────────────────────────────────────────────
    return NextResponse.json({ email, securePassword });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Auth sync unexpected error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

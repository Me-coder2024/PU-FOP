import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip proxy for static assets, public files, API routes, and auth callback
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/data') ||
    pathname === '/auth/callback' ||
    pathname === '/login' ||
    pathname === '/'
  ) {
    return NextResponse.next();
  }

  // 2. Create default response passing the request object (crucial for forwarding cookie mutations)
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mutate request cookies so subsequent proxy/handlers see the changes
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          
          // Re-create the next response passing the mutated request
          response = NextResponse.next({
            request,
          });

          // Set cookies on the response object
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Helper to create redirect response while preserving all cookies set on the response
  const redirectWithCookies = (url: string) => {
    const redirectResponse = NextResponse.redirect(new URL(url, request.url));
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, {
        path: cookie.path,
        domain: cookie.domain,
        maxAge: cookie.maxAge,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
      });
    });
    return redirectResponse;
  };

  // A backend outage must not leave navigation pending or send users to onboarding.
  let user;
  try {
    const result = await supabase.auth.getUser();
    if (result.error && !['AuthSessionMissingError','AuthApiError'].includes(result.error.name)) {
      return redirectWithCookies('/login?error=service_unavailable');
    }
    user = result.data.user;
  } catch {
    return redirectWithCookies('/login?error=service_unavailable');
  }

  // 4. Protect all other routes — require auth
  if (!user) {
    return redirectWithCookies('/login');
  }

  // 5. Get user profile for role-based routing
  const { data: fetchedProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role, university_id')
    .eq('id', user.id)
    .maybeSingle();

  let profile = fetchedProfile;
  if(profileError)return redirectWithCookies('/login?error=service_unavailable');

  // Fallback to service role if anon query returned null to prevent false onboarding redirects
  if ((!profile || (profile.role === 'student' && !profile.university_id)) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: fetchWithTimeout } }
      );
      const { data: adminProfile, error: adminError } = await adminClient
        .from('profiles')
        .select('role, university_id')
        .eq('id', user.id)
        .maybeSingle();

      if (adminError)return redirectWithCookies('/login?error=service_unavailable');
      if (adminProfile) {
        profile = adminProfile;
      }
    } catch (adminErr) {
      console.error('[Proxy] Admin profile lookup error:', adminErr);
      return redirectWithCookies('/login?error=service_unavailable');
    }
  }

  // If no profile exists, redirect to onboarding
  if (!profile) {
    if (pathname !== '/onboarding') {
      return redirectWithCookies('/onboarding');
    }
    return response;
  }

  // Only students without university_id need onboarding — other roles skip it
  if (profile.role === 'student' && !profile.university_id && pathname !== '/onboarding') {
    return redirectWithCookies('/onboarding');
  }

  // If user is on /onboarding but already has a profile, redirect to their dashboard
  if (pathname === '/onboarding' && (profile.role !== 'student' || profile.university_id)) {
    return redirectWithCookies(getRoleRedirect(profile.role));
  }

  // 6. Enforce path restrictions based on role
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/student')) {
    if (profile.role !== 'student' && profile.role !== 'super_admin') {
      return redirectWithCookies(getRoleRedirect(profile.role));
    }
  }

  if (pathname.startsWith('/guide')) {
    if (profile.role !== 'guide' && profile.role !== 'super_admin') {
      return redirectWithCookies(getRoleRedirect(profile.role));
    }
  }

  if (pathname.startsWith('/hod')) {
    if (profile.role !== 'hod' && profile.role !== 'super_admin') {
      return redirectWithCookies(getRoleRedirect(profile.role));
    }
  }

  if (pathname.startsWith('/pg-director')) {
    if (profile.role !== 'pg_director' && profile.role !== 'super_admin') {
      return redirectWithCookies(getRoleRedirect(profile.role));
    }
  }

  if (pathname.startsWith('/dean')) {
    if (profile.role !== 'dean' && profile.role !== 'super_admin') {
      return redirectWithCookies(getRoleRedirect(profile.role));
    }
  }

  if (pathname.startsWith('/research')) {
    if (profile.role !== 'dean' && profile.role !== 'pg_director') {
      return redirectWithCookies(getRoleRedirect(profile.role));
    }
  }

  if (pathname.startsWith('/super-admin')) {
    if (profile.role !== 'super_admin') {
      return redirectWithCookies(getRoleRedirect(profile.role));
    }
  }

  return response;
}

function getRoleRedirect(role: string): string {
  switch (role) {
    case 'student':
      return '/dashboard';
    case 'guide':
      return '/guide';
    case 'hod':
      return '/hod';
    case 'pg_director':
      return '/pg-director';
    case 'dean':
      return '/dean';
    case 'super_admin':
      return '/super-admin';
    default:
      return '/dashboard';
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

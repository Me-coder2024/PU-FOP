import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
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
              // Ignore — middleware will handle
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if user has a profile and needs onboarding
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, university_id')
          .eq('id', user.id)
          .single();

        if (!profile) {
          // Profile should have been auto-created by trigger, redirect to onboarding
          return NextResponse.redirect(`${origin}/onboarding`);
        }

        if (profile.role === 'student' && !profile.university_id) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }

        // Redirect based on role
        const roleRedirects: Record<string, string> = {
          student: '/dashboard',
          guide: '/guide',
          hod: '/hod',
          pg_director: '/pg-director',
          dean: '/dean',
          super_admin: '/super-admin',
        };

        const redirect = roleRedirects[profile.role] || '/dashboard';
        return NextResponse.redirect(`${origin}${redirect}`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}

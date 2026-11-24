import 'server-only';
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Creates a Supabase client for use in Server Components, Server Actions, and Route Handlers.
 * Reads/writes cookies for session management.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {fetch:fetchWithTimeout},
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
            // This can happen in Server Components where cookies are read-only.
            // It's safe to ignore — the middleware will handle refreshing.
          }
        },
      },
    }
  );
}

/**
 * Creates a Supabase client with the service role key.
 * Bypasses RLS — use only in server-side code for admin operations.
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {fetch:fetchWithTimeout},
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Creates an untyped Supabase service client for legacy v1 tables
 * (users, topics, approvals, similarities, progress, repository, scoring_results).
 * These tables are not in the Database type definition.
 * Bypasses RLS — use only in server-side code.
 */
export function createLegacyServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {fetch:fetchWithTimeout},
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}


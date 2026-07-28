-- =============================================
-- Migration: Multi-Role Support in Role Grants
-- Allows multiple roles to be granted to a single email address
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Drop old single-email unique constraint if present
ALTER TABLE public.role_grants DROP CONSTRAINT IF EXISTS role_grants_unique_email;
ALTER TABLE public.role_grants DROP CONSTRAINT IF EXISTS role_grants_email_key;

-- 2. Add composite unique constraint for (email, role)
ALTER TABLE public.role_grants DROP CONSTRAINT IF EXISTS role_grants_email_role_key;
ALTER TABLE public.role_grants ADD CONSTRAINT role_grants_email_role_key UNIQUE (email, role);

-- 3. Create index for fast lookup by email
CREATE INDEX IF NOT EXISTS idx_role_grants_email_lookup ON public.role_grants (email);

SELECT 'Multi-role migration complete!' AS status;

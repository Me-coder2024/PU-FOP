-- =============================================
-- Migration: Dean Role Grants Access
-- Gives Dean the same role management powers as Super Admin
-- Run this in Supabase SQL Editor
-- =============================================

-- Dean can manage role grants (same as super_admin)
DROP POLICY IF EXISTS "Dean can manage role grants" ON public.role_grants;
CREATE POLICY "Dean can manage role grants"
    ON public.role_grants FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'dean')
    );

-- Dean can update any profile (for role assignment sync)
DROP POLICY IF EXISTS "Dean can update any profile" ON public.profiles;
CREATE POLICY "Dean can update any profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'dean')
    );

-- Dean can insert profiles (for edge cases)
DROP POLICY IF EXISTS "Dean can insert profiles" ON public.profiles;
CREATE POLICY "Dean can insert profiles"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'dean')
    );

-- Done!
SELECT 'Dean Role Grants migration complete!' AS status;

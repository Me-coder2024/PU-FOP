-- =============================================
-- Fix handle_new_user Trigger for PU-FOP
-- Run this in your Supabase SQL Editor
-- This prevents "duplicate key violates unique constraint profiles_email_key" errors
-- when linking pre-seeded profiles to new Auth accounts.
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    _role app_role := 'student';
    _institute_id UUID;
    _department_id UUID;
BEGIN
    -- Auto-detect super admin by email
    IF NEW.email = 'me.coder.in@gmail.com' THEN
        _role := 'super_admin';
    ELSE
        -- Check if a role_grant was pre-provisioned for this email
        SELECT rg.role, rg.institute_id, rg.department_id
        INTO _role, _institute_id, _department_id
        FROM public.role_grants rg
        WHERE rg.email = NEW.email
        LIMIT 1;

        -- If no role_grant found, default to student
        IF _role IS NULL THEN
            _role := 'student';
        END IF;
    END IF;

    -- Check if a profile with the same email already exists
    IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email) THEN
        -- Safely update existing profile ID to match the new Auth user ID
        UPDATE public.profiles
        SET id = NEW.id,
            full_name = COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NULLIF(NEW.raw_user_meta_data->>'name', ''), full_name),
            avatar_url = COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''), avatar_url)
        WHERE email = NEW.email;
    ELSE
        -- Create a brand new profile
        INSERT INTO public.profiles (id, email, full_name, role, institute_id, department_id, avatar_url)
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
            _role,
            _institute_id,
            _department_id,
            COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'handle_new_user trigger successfully fixed!' AS status;

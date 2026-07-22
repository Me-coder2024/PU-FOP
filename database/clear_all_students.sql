-- =============================================================================
-- Migration: Clear All Student Data & Profiles from Database
-- Run this in your Supabase SQL Editor to wipe student test data for a clean slate
-- =============================================================================

-- Step 1: Delete all submissions created by students
DELETE FROM public.submissions
WHERE student_id IN (
    SELECT id FROM public.profiles WHERE role = 'student'
);

-- Step 2: Delete all notifications associated with student users
DELETE FROM public.notifications
WHERE user_id IN (
    SELECT id FROM public.profiles WHERE role = 'student'
);

-- Step 3: Delete all drug requests submitted by students
DELETE FROM public.drug_requests
WHERE requested_by IN (
    SELECT id FROM public.profiles WHERE role = 'student'
);

-- Step 4: Delete all feedback submitted by students
DELETE FROM public.feedback
WHERE user_id IN (
    SELECT id FROM public.profiles WHERE role = 'student'
);

-- Step 5: Delete student records from public.profiles
DELETE FROM public.profiles
WHERE role = 'student';

-- Step 6: (Optional) Wipe corresponding student auth records from Supabase Auth
-- Note: Requires superuser permissions in Supabase SQL Editor
DELETE FROM auth.users
WHERE email NOT IN (
    SELECT email FROM public.profiles
);

SELECT 'All student profiles and associated submission data successfully cleared!' AS status;

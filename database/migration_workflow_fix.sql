-- =============================================
-- PU-FOP Workflow RLS Policy Migration
-- Run this in Supabase SQL Editor
-- Fixes: HOD guide assignment, student resubmission,
--        PG Director/Dean status transitions
-- =============================================

-- ======================================
-- 1. Student UPDATE policy (NEW)
-- Students can update their own submission when:
--   - status is 'revision_requested' (guide sent it back)
--   - OR edit_unlocked is true (HOD/PG/Dean unlocked it)
-- ======================================
DROP POLICY IF EXISTS "Students can update own revision submissions" ON public.submissions;

CREATE POLICY "Students can update own revision submissions"
    ON public.submissions FOR UPDATE
    TO authenticated
    USING (
        student_id = auth.uid()
        AND (status = 'revision_requested' OR edit_unlocked = true)
    )
    WITH CHECK (
        student_id = auth.uid()
    );


-- ======================================
-- 2. HOD UPDATE policy (REPLACE)
-- Old policy only allowed 'guide_accepted' — now allows
-- 'submitted' (for guide assignment) AND 'guide_accepted' (for forwarding)
-- Scoped to HOD's own institute via student profile join
-- ======================================
DROP POLICY IF EXISTS "HOD can update guide_accepted submissions" ON public.submissions;
DROP POLICY IF EXISTS "HOD can update institute submissions" ON public.submissions;

CREATE POLICY "HOD can update institute submissions"
    ON public.submissions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles student_p
            JOIN public.profiles hod_p ON hod_p.institute_id = student_p.institute_id
            WHERE student_p.id = submissions.student_id
            AND hod_p.id = auth.uid()
            AND hod_p.role = 'hod'
        )
        AND status IN ('submitted', 'guide_accepted')
    )
    WITH CHECK (true);


-- ======================================
-- 3. PG Director / Dean UPDATE policy (REPLACE)
-- Added WITH CHECK (true) to allow status transitions
-- (e.g. hod_accepted → finalized, hod_accepted → revision_requested)
-- ======================================
DROP POLICY IF EXISTS "PG Director and Dean can update finalized titles" ON public.submissions;

CREATE POLICY "PG Director and Dean can update finalized titles"
    ON public.submissions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('pg_director', 'dean')
        )
        AND status IN ('hod_accepted', 'finalized')
    )
    WITH CHECK (true);


-- ======================================
-- Verify: List all policies on submissions table
-- ======================================
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'submissions'
ORDER BY policyname;

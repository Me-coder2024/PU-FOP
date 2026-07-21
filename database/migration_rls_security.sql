-- =============================================
-- PU-FOP Complete Database RLS Configuration
-- Run this in Supabase SQL Editor
-- This script enables RLS on all 12 tables and
-- configures safe, non-recursive policies for the entire app.
-- =============================================

-- =============================================
-- 1. Enable RLS on All Tables
-- =============================================
ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_window ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drug_requests ENABLE ROW LEVEL SECURITY;


-- =============================================
-- 2. Drop All Existing Policies (To Prevent Errors)
-- =============================================

-- Profiles
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admin can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Dean can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Dean can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Dean and Super Admin can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Dean and Super Admin can insert profiles" ON public.profiles;

-- Submissions
DROP POLICY IF EXISTS "Students can insert submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students can view own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students can update own revision submissions" ON public.submissions;
DROP POLICY IF EXISTS "Guides can view assigned submissions" ON public.submissions;
DROP POLICY IF EXISTS "HOD can view institute submissions" ON public.submissions;
DROP POLICY IF EXISTS "Guides can update assigned submissions" ON public.submissions;
DROP POLICY IF EXISTS "HOD can update institute submissions" ON public.submissions;
DROP POLICY IF EXISTS "PG Director and Dean can update finalized titles" ON public.submissions;
DROP POLICY IF EXISTS "PG Director and Dean can update submissions" ON public.submissions;
DROP POLICY IF EXISTS "Super admin full access to submissions" ON public.submissions;
DROP POLICY IF EXISTS "Submissions readable by owners guides and staff" ON public.submissions;

-- Notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;

-- Announcements
DROP POLICY IF EXISTS "Announcements are viewable by authenticated" ON public.announcements;
DROP POLICY IF EXISTS "Announcements are viewable by authenticated users" ON public.announcements;
DROP POLICY IF EXISTS "Dean and Super Admin can create announcements" ON public.announcements;

-- Role Grants
DROP POLICY IF EXISTS "Super admin can manage role grants" ON public.role_grants;
DROP POLICY IF EXISTS "Service role can read role grants" ON public.role_grants;
DROP POLICY IF EXISTS "Dean can manage role grants" ON public.role_grants;
DROP POLICY IF EXISTS "Role grants readable by authenticated users" ON public.role_grants;
DROP POLICY IF EXISTS "Dean and Super Admin can manage role grants" ON public.role_grants;

-- Submission Window
DROP POLICY IF EXISTS "Submission window readable by all" ON public.submission_window;
DROP POLICY IF EXISTS "Dean and Super Admin can manage submission window" ON public.submission_window;

-- Audit Logs
DROP POLICY IF EXISTS "Super admin can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Super admin and Dean can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;

-- Feedback
DROP POLICY IF EXISTS "Users can view own feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users can insert feedback" ON public.feedback;
DROP POLICY IF EXISTS "Super admin can manage all feedback" ON public.feedback;
DROP POLICY IF EXISTS "Super admin and Dean can manage all feedback" ON public.feedback;

-- Institutes
DROP POLICY IF EXISTS "Institutes readable by all" ON public.institutes;
DROP POLICY IF EXISTS "Institutes are viewable by authenticated users" ON public.institutes;
DROP POLICY IF EXISTS "Super admin can manage institutes" ON public.institutes;

-- Departments
DROP POLICY IF EXISTS "Departments readable by all" ON public.departments;
DROP POLICY IF EXISTS "Departments are viewable by authenticated users" ON public.departments;
DROP POLICY IF EXISTS "Super admin can manage departments" ON public.departments;

-- Drugs
DROP POLICY IF EXISTS "Drugs readable by all" ON public.drugs;
DROP POLICY IF EXISTS "Super admin can manage drugs" ON public.drugs;

-- Drug Requests
DROP POLICY IF EXISTS "Students can view own drug requests" ON public.drug_requests;
DROP POLICY IF EXISTS "Students can create drug requests" ON public.drug_requests;
DROP POLICY IF EXISTS "Dean can view all drug requests" ON public.drug_requests;
DROP POLICY IF EXISTS "Dean can update drug requests" ON public.drug_requests;
DROP POLICY IF EXISTS "PG Director can view all drug requests" ON public.drug_requests;
DROP POLICY IF EXISTS "PG Director can update drug requests" ON public.drug_requests;
DROP POLICY IF EXISTS "Super admin full access to drug requests" ON public.drug_requests;


-- =============================================
-- 3. Create Clean & Robust RLS Policies
-- =============================================

-- --- INSTITUTES ---
CREATE POLICY "Institutes are viewable by authenticated users" 
    ON public.institutes FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Super admin can manage institutes" 
    ON public.institutes FOR ALL 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- --- DEPARTMENTS ---
CREATE POLICY "Departments are viewable by authenticated users" 
    ON public.departments FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Super admin can manage departments" 
    ON public.departments FOR ALL 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- --- PROFILES ---
CREATE POLICY "Profiles are viewable by authenticated users" 
    ON public.profiles FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE 
    TO authenticated 
    USING (auth.uid() = id) 
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Dean and Super Admin can update any profile" 
    ON public.profiles FOR UPDATE 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('dean', 'super_admin'))
    );

CREATE POLICY "Dean and Super Admin can insert profiles" 
    ON public.profiles FOR INSERT 
    TO authenticated 
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('dean', 'super_admin'))
    );

CREATE POLICY "Service role can insert profiles" 
    ON public.profiles FOR INSERT 
    TO service_role 
    WITH CHECK (true);

-- --- ROLE GRANTS ---
CREATE POLICY "Role grants readable by authenticated users" 
    ON public.role_grants FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Dean and Super Admin can manage role grants" 
    ON public.role_grants FOR ALL 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('dean', 'super_admin'))
    );

CREATE POLICY "Service role can read role grants" 
    ON public.role_grants FOR SELECT 
    TO service_role 
    USING (true);

-- --- SUBMISSION WINDOW ---
CREATE POLICY "Submission window readable by all" 
    ON public.submission_window FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Dean and Super Admin can manage submission window" 
    ON public.submission_window FOR ALL 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('dean', 'super_admin'))
    );

-- --- SUBMISSIONS ---
CREATE POLICY "Submissions readable by owners guides and staff" 
    ON public.submissions FOR SELECT 
    TO authenticated 
    USING (
        student_id = auth.uid()
        OR guide_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('pg_director', 'dean', 'super_admin')
                OR (p.role = 'hod' AND p.institute_id = (
                    SELECT institute_id FROM public.profiles s_p WHERE s_p.id = submissions.student_id
                ))
            )
        )
    );

CREATE POLICY "Students can insert submissions" 
    ON public.submissions FOR INSERT 
    TO authenticated 
    WITH CHECK (
        auth.uid() = student_id
        AND public.is_submission_open(
            (SELECT institute_id FROM public.profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Students can update own revision submissions" 
    ON public.submissions FOR UPDATE 
    TO authenticated 
    USING (
        student_id = auth.uid()
        AND (status = 'revision_requested' OR edit_unlocked = true)
    ) 
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Guides can update assigned submissions" 
    ON public.submissions FOR UPDATE 
    TO authenticated 
    USING (
        guide_id = auth.uid()
    ) 
    WITH CHECK (guide_id = auth.uid());

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

CREATE POLICY "PG Director and Dean can update submissions" 
    ON public.submissions FOR UPDATE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('pg_director', 'dean')
        )
    ) 
    WITH CHECK (true);

CREATE POLICY "Super admin full access to submissions" 
    ON public.submissions FOR ALL 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- --- NOTIFICATIONS ---
CREATE POLICY "Users can view own notifications" 
    ON public.notifications FOR SELECT 
    TO authenticated 
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" 
    ON public.notifications FOR UPDATE 
    TO authenticated 
    USING (user_id = auth.uid()) 
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authenticated can insert notifications" 
    ON public.notifications FOR INSERT 
    TO authenticated 
    WITH CHECK (true);

-- --- ANNOUNCEMENTS ---
CREATE POLICY "Announcements are viewable by authenticated users" 
    ON public.announcements FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Dean and Super Admin can create announcements" 
    ON public.announcements FOR INSERT 
    TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('dean', 'super_admin')
        )
    );

CREATE POLICY "Dean and Super Admin can delete announcements" 
    ON public.announcements FOR DELETE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('dean', 'super_admin')
        )
    );

-- --- AUDIT LOGS ---
CREATE POLICY "Super admin and Dean can view audit logs" 
    ON public.audit_logs FOR SELECT 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dean'))
    );

CREATE POLICY "Authenticated can insert audit logs" 
    ON public.audit_logs FOR INSERT 
    TO authenticated 
    WITH CHECK (true);

-- --- FEEDBACK ---
CREATE POLICY "Users can view own feedback" 
    ON public.feedback FOR SELECT 
    TO authenticated 
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dean'))
    );

CREATE POLICY "Users can insert feedback" 
    ON public.feedback FOR INSERT 
    TO authenticated 
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admin and Dean can manage all feedback" 
    ON public.feedback FOR ALL 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dean'))
    );

-- --- DRUGS ---
CREATE POLICY "Drugs readable by all" 
    ON public.drugs FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Super admin can manage drugs" 
    ON public.drugs FOR ALL 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- --- DRUG REQUESTS ---
CREATE POLICY "Students can view own drug requests" 
    ON public.drug_requests FOR SELECT 
    TO authenticated 
    USING (requested_by = auth.uid());

CREATE POLICY "Students can create drug requests" 
    ON public.drug_requests FOR INSERT 
    TO authenticated 
    WITH CHECK (
        requested_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'student'
        )
    );

CREATE POLICY "Dean and PG Director can view all drug requests" 
    ON public.drug_requests FOR SELECT 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('dean', 'pg_director'))
    );

CREATE POLICY "Dean and PG Director can update drug requests" 
    ON public.drug_requests FOR UPDATE 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('dean', 'pg_director'))
    ) 
    WITH CHECK (true);

CREATE POLICY "Super admin full access to drug requests" 
    ON public.drug_requests FOR ALL 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    );


-- =============================================
-- Done!
-- =============================================
SELECT 'PU-FOP Database RLS Configuration Complete!' AS status;

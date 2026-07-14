-- =============================================
-- PU-FOP Supabase Schema v2
-- Aligned with Master Build Prompt Specification
-- Run this in Supabase SQL Editor on a fresh project
-- =============================================

-- =============
-- 1. Custom Enums
-- =============

DO $$
BEGIN
    -- Submission status enum matching the approval chain
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'submission_status') THEN
        CREATE TYPE submission_status AS ENUM (
            'submitted',
            'revision_requested',
            'guide_accepted',
            'guide_rejected',
            'hod_accepted',
            'hod_rejected',
            'finalized'
        );
    END IF;

    -- User role enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE app_role AS ENUM (
            'student',
            'guide',
            'hod',
            'pg_director',
            'dean',
            'super_admin'
        );
    END IF;

    -- Notification type
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE notification_type AS ENUM ('info', 'success', 'warning', 'error');
    END IF;

    -- Feedback status
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_status') THEN
        CREATE TYPE feedback_status AS ENUM ('open', 'in_progress', 'resolved');
    END IF;
END$$;


-- =============
-- 2. Core Tables
-- =============

-- Institutes
CREATE TABLE IF NOT EXISTS public.institutes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Departments
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    institute_id UUID REFERENCES public.institutes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Profiles (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    university_id TEXT,  -- enrollment number or staff ID
    role app_role NOT NULL DEFAULT 'student',
    institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT profiles_email_domain CHECK (
        email LIKE '%@paruluniversity.ac.in'
        OR email = 'me.coder.in@gmail.com'  -- Super Admin exception
    )
);

-- Role Grants (provisioned by Super Admin)
CREATE TABLE IF NOT EXISTS public.role_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    role app_role NOT NULL,
    institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    can_edit BOOLEAN DEFAULT false,
    granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT role_grants_unique_email UNIQUE (email)
);

-- Submission Window (Dean controls)
CREATE TABLE IF NOT EXISTS public.submission_window (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id UUID REFERENCES public.institutes(id) ON DELETE CASCADE,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Submissions (the core title submission table)
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    criteria_details JSONB DEFAULT '{}'::jsonb,
    status submission_status NOT NULL DEFAULT 'submitted',
    guide_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    guide_remarks TEXT,
    guide_reviewed_at TIMESTAMPTZ,
    hod_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    hod_remarks TEXT,
    hod_reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    edit_unlocked BOOLEAN DEFAULT false,  -- PG Director/Dean can unlock for student edits
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- One active title per student — partial unique index
-- A student can only have one submission that is NOT rejected
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_submission_per_student
    ON public.submissions(student_id)
    WHERE status NOT IN ('guide_rejected', 'hod_rejected');

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type notification_type DEFAULT 'info',
    read BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Announcements (Dean sends)
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_role app_role,  -- NULL = all roles
    target_institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Feedback / Technical Issues
CREATE TABLE IF NOT EXISTS public.feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status feedback_status DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Drug reference database (preserved from v1)
CREATE TABLE IF NOT EXISTS public.drugs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    dosage_forms TEXT[],
    therapeutic TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);


-- =============
-- 3. Indexes
-- =============

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_institute ON public.profiles(institute_id);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON public.profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_guide ON public.submissions(guide_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_title_fts ON public.submissions USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON public.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_role_grants_email ON public.role_grants(email);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.feedback(status);


-- =============
-- 4. Trigger Functions
-- =============

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_submissions_updated ON public.submissions;
CREATE TRIGGER on_submissions_updated
    BEFORE UPDATE ON public.submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- =============
-- 5. handle_new_user — auto-create profile on Supabase Auth signup
-- =============

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

    INSERT INTO public.profiles (id, email, full_name, role, institute_id, department_id, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        _role,
        _institute_id,
        _department_id,
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
        avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), public.profiles.avatar_url);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();


-- =============
-- 6. Guide Load View — counts active assignments per guide
-- =============

CREATE OR REPLACE VIEW public.guide_load AS
SELECT
    p.id AS guide_id,
    p.full_name AS guide_name,
    p.institute_id,
    COUNT(s.id) AS active_count
FROM public.profiles p
LEFT JOIN public.submissions s
    ON s.guide_id = p.id
    AND s.status NOT IN ('guide_rejected', 'hod_rejected')
WHERE p.role = 'guide'
GROUP BY p.id, p.full_name, p.institute_id;


-- =============
-- 7. assign_guide(submission_id) — Round-robin least-loaded guide assignment
-- =============

CREATE OR REPLACE FUNCTION public.assign_guide(p_submission_id UUID)
RETURNS UUID AS $$
DECLARE
    _student_institute_id UUID;
    _guide_id UUID;
BEGIN
    -- Get the student's institute
    SELECT p.institute_id INTO _student_institute_id
    FROM public.submissions s
    JOIN public.profiles p ON p.id = s.student_id
    WHERE s.id = p_submission_id;

    IF _student_institute_id IS NULL THEN
        RAISE EXCEPTION 'Submission or student institute not found';
    END IF;

    -- Pick the guide with the fewest active assignments in the same institute
    SELECT gl.guide_id INTO _guide_id
    FROM public.guide_load gl
    WHERE gl.institute_id = _student_institute_id
    ORDER BY gl.active_count ASC, random()  -- random() breaks ties
    LIMIT 1;

    IF _guide_id IS NULL THEN
        RAISE EXCEPTION 'No guides available in this institute';
    END IF;

    -- Assign the guide
    UPDATE public.submissions
    SET guide_id = _guide_id
    WHERE id = p_submission_id;

    -- Notify the guide
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
        _guide_id,
        'New Title Assigned',
        'A new dissertation title has been assigned to you for review.',
        'info',
        '/guide'
    );

    RETURN _guide_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============
-- 8. is_submission_open(institute_id) — Check if submission window is active
-- =============

CREATE OR REPLACE FUNCTION public.is_submission_open(p_institute_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
    _is_open BOOLEAN := false;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.submission_window sw
        WHERE (p_institute_id IS NULL OR sw.institute_id = p_institute_id)
        AND now() BETWEEN sw.start_date AND sw.end_date
    ) INTO _is_open;

    RETURN _is_open;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============
-- 9. Helper: Get submission window details
-- =============

CREATE OR REPLACE FUNCTION public.get_submission_window(p_institute_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    institute_id UUID,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    days_remaining INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sw.id,
        sw.institute_id,
        sw.start_date,
        sw.end_date,
        GREATEST(0, EXTRACT(DAY FROM sw.end_date - now())::INTEGER) AS days_remaining
    FROM public.submission_window sw
    WHERE (p_institute_id IS NULL OR sw.institute_id = p_institute_id)
    AND now() <= sw.end_date
    ORDER BY sw.end_date DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============
-- 10. Audit log helper function
-- =============

CREATE OR REPLACE FUNCTION public.log_audit(
    p_user_id UUID,
    p_action TEXT,
    p_table_name TEXT DEFAULT NULL,
    p_record_id UUID DEFAULT NULL,
    p_old_data JSONB DEFAULT NULL,
    p_new_data JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (p_user_id, p_action, p_table_name, p_record_id, p_old_data, p_new_data);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============
-- 11. Row Level Security Policies
-- =============

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_window ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drugs ENABLE ROW LEVEL SECURITY;

-- --- PROFILES ---
-- Everyone can read profiles (needed for guide names, student info, etc.)
CREATE POLICY "Profiles are viewable by authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Service role inserts (via trigger)
CREATE POLICY "Service role can insert profiles"
    ON public.profiles FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Super admin can update any profile
CREATE POLICY "Super admin can update any profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- --- SUBMISSIONS ---
-- Students can insert their own submissions (if window is open)
CREATE POLICY "Students can insert submissions"
    ON public.submissions FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = student_id
        AND public.is_submission_open(
            (SELECT institute_id FROM public.profiles WHERE id = auth.uid())
        )
    );

-- Students can view their own submissions
CREATE POLICY "Students can view own submissions"
    ON public.submissions FOR SELECT
    TO authenticated
    USING (
        student_id = auth.uid()
    );

-- Guides can view submissions assigned to them
CREATE POLICY "Guides can view assigned submissions"
    ON public.submissions FOR SELECT
    TO authenticated
    USING (
        guide_id = auth.uid()
    );

-- HOD can view submissions in their institute
CREATE POLICY "HOD can view institute submissions"
    ON public.submissions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('hod', 'pg_director', 'dean', 'super_admin')
        )
    );

-- Guides can update submissions assigned to them (accept/reject)
CREATE POLICY "Guides can update assigned submissions"
    ON public.submissions FOR UPDATE
    TO authenticated
    USING (guide_id = auth.uid())
    WITH CHECK (guide_id = auth.uid());

-- HOD can update guide_accepted submissions in their institute
CREATE POLICY "HOD can update guide_accepted submissions"
    ON public.submissions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'hod'
        )
        AND status = 'guide_accepted'
    );

-- PG Director and Dean can update title text only on finalized submissions
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
    );

-- Super admin can do anything with submissions
CREATE POLICY "Super admin full access to submissions"
    ON public.submissions FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- --- NOTIFICATIONS ---
-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Service role and authenticated can insert notifications
CREATE POLICY "Authenticated can insert notifications"
    ON public.notifications FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- --- ANNOUNCEMENTS ---
-- Everyone can read announcements
CREATE POLICY "Announcements are viewable by authenticated"
    ON public.announcements FOR SELECT
    TO authenticated
    USING (true);

-- Dean and Super Admin can create announcements
CREATE POLICY "Dean and Super Admin can create announcements"
    ON public.announcements FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('dean', 'super_admin')
        )
    );

-- --- ROLE GRANTS ---
-- Super Admin can manage role grants
CREATE POLICY "Super admin can manage role grants"
    ON public.role_grants FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- Service role full access (for handle_new_user trigger)
CREATE POLICY "Service role can read role grants"
    ON public.role_grants FOR SELECT
    TO service_role
    USING (true);

-- --- SUBMISSION WINDOW ---
-- Everyone can read submission window
CREATE POLICY "Submission window readable by all"
    ON public.submission_window FOR SELECT
    TO authenticated
    USING (true);

-- Dean and Super Admin can manage submission window
CREATE POLICY "Dean and Super Admin can manage submission window"
    ON public.submission_window FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('dean', 'super_admin')
        )
    );

-- --- AUDIT LOGS ---
-- Super Admin can view audit logs
CREATE POLICY "Super admin can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- Authenticated can insert audit logs
CREATE POLICY "Authenticated can insert audit logs"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- --- FEEDBACK ---
-- Users can insert feedback
CREATE POLICY "Users can insert feedback"
    ON public.feedback FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
    ON public.feedback FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Super Admin can view and manage all feedback
CREATE POLICY "Super admin can manage all feedback"
    ON public.feedback FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- --- INSTITUTES ---
CREATE POLICY "Institutes readable by all"
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
CREATE POLICY "Departments readable by all"
    ON public.departments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Super admin can manage departments"
    ON public.departments FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
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


-- =============
-- 12. Enable Realtime on key tables
-- =============

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;


-- =============
-- 13. Seed Data
-- =============

-- Institute
INSERT INTO public.institutes (id, name)
VALUES ('7b1897c9-ea9a-4c22-9b2f-76ee607318e8', 'Faculty of Pharmacy')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Departments
INSERT INTO public.departments (id, name, institute_id)
VALUES
  ('c535492f-b4df-4ec8-a53c-f4b679415c1e', 'Pharmaceutics', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8'),
  ('d525492f-b4df-4ec8-a53c-f4b679415c2f', 'Pharmacology', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8'),
  ('e535492f-b4df-4ec8-a53c-f4b679415c3e', 'Pharmaceutical Chemistry', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8'),
  ('f545492f-b4df-4ec8-a53c-f4b679415c4f', 'Pharmacognosy', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8'),
  ('a555492f-b4df-4ec8-a53c-f4b679415c5e', 'Quality Assurance', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8'),
  ('b565492f-b4df-4ec8-a53c-f4b679415c6f', 'Pharmaceutical Analysis', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8'),
  ('c575492f-b4df-4ec8-a53c-f4b679415c7e', 'Pharmacy Practice', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8'),
  ('d585492f-b4df-4ec8-a53c-f4b679415c8f', 'Regulatory Affairs', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, institute_id = EXCLUDED.institute_id;

-- Initial submission window (open for 6 months from now)
INSERT INTO public.submission_window (institute_id, start_date, end_date)
VALUES (
    '7b1897c9-ea9a-4c22-9b2f-76ee607318e8',
    now(),
    now() + INTERVAL '6 months'
);


-- Done!
SELECT 'PU-FOP Schema v2 setup complete!' AS status;

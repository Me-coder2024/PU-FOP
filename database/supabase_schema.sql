-- =============================================
-- PU-FOP Supabase Schema — Restructured SQL File
-- Run this in Supabase SQL Editor for full setup
-- =============================================

-- 1. Create custom types/enums
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role') THEN
        CREATE TYPE role AS ENUM ('STUDENT', 'GUIDE', 'HOI', 'PG_DIRECTOR', 'DEAN', 'ADMIN', 'SUPERADMIN');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'progress_stage') THEN
        CREATE TYPE progress_stage AS ENUM ('ITD', 'MTD1', 'MTD', 'FINAL');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
        CREATE TYPE approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISION');
    END IF;
END$$;

-- 2. Create tables

-- Institutes table
CREATE TABLE IF NOT EXISTS public.institutes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Departments table
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid TEXT UNIQUE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role role NOT NULL DEFAULT 'STUDENT',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    enrollment_no TEXT UNIQUE,
    guide_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Topics table — stores dissertation submissions with all fields (student_id is nullable for historical data)
CREATE TABLE IF NOT EXISTS public.topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.users(id) ON DELETE CASCADE, -- Made nullable
    title TEXT NOT NULL,
    drug_name TEXT NOT NULL DEFAULT '',
    dosage_form TEXT NOT NULL DEFAULT '',
    route_of_admin TEXT NOT NULL DEFAULT '',
    excipients TEXT NOT NULL DEFAULT '',
    method_preparation TEXT NOT NULL DEFAULT '',
    novelty TEXT NOT NULL DEFAULT '',
    keywords TEXT NOT NULL DEFAULT '',
    form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    department_name TEXT DEFAULT '',
    score INTEGER DEFAULT 0,
    score_breakdown JSONB DEFAULT '{}'::jsonb,
    submission_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_locked BOOLEAN NOT NULL DEFAULT false
);

-- Ensure new columns exist on topics table even if table already existed
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS department_name TEXT DEFAULT '';
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT '{}'::jsonb;

-- Approvals table — tracks multi-level approval workflow
CREATE TABLE IF NOT EXISTS public.approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL UNIQUE REFERENCES public.topics(id) ON DELETE CASCADE,
    guide_status approval_status NOT NULL DEFAULT 'PENDING',
    guide_remarks TEXT DEFAULT '',
    guide_date TIMESTAMP WITH TIME ZONE,
    hoi_status approval_status NOT NULL DEFAULT 'PENDING',
    hoi_remarks TEXT DEFAULT '',
    hoi_date TIMESTAMP WITH TIME ZONE,
    pg_director_status approval_status NOT NULL DEFAULT 'PENDING',
    pg_director_remarks TEXT DEFAULT '',
    pg_director_date TIMESTAMP WITH TIME ZONE,
    dean_status approval_status NOT NULL DEFAULT 'PENDING',
    dean_remarks TEXT DEFAULT '',
    dean_date TIMESTAMP WITH TIME ZONE,
    remarks TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Similarities table — stores topic-to-topic similarity scores
CREATE TABLE IF NOT EXISTS public.similarities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    similar_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    similarity_percentage NUMERIC(5,2) NOT NULL,
    CONSTRAINT unique_topic_similarity UNIQUE (topic_id, similar_topic_id)
);

-- Progress table — tracks dissertation milestone stages
CREATE TABLE IF NOT EXISTS public.progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    stage progress_stage NOT NULL DEFAULT 'ITD',
    submission_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUBMITTED',
    remarks TEXT DEFAULT '',
    file_url TEXT DEFAULT '',
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Repository table — stores final approved dissertations
CREATE TABLE IF NOT EXISTS public.repository (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL UNIQUE REFERENCES public.topics(id) ON DELETE CASCADE,
    year TEXT NOT NULL,
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    pdf_file TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Scoring results table — persists AI scoring for each topic
CREATE TABLE IF NOT EXISTS public.scoring_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    total_score INTEGER NOT NULL DEFAULT 0,
    title_uniqueness INTEGER NOT NULL DEFAULT 0,
    novelty_uniqueness INTEGER NOT NULL DEFAULT 0,
    drug_name_score INTEGER NOT NULL DEFAULT 0,
    dosage_form_score INTEGER NOT NULL DEFAULT 0,
    keywords_score INTEGER NOT NULL DEFAULT 0,
    excipients_score INTEGER NOT NULL DEFAULT 0,
    max_title_similarity NUMERIC(5,2) DEFAULT 0,
    max_novelty_similarity NUMERIC(5,2) DEFAULT 0,
    drug_match_count INTEGER DEFAULT 0,
    dosage_form_status TEXT DEFAULT 'unique',
    keyword_overlap_count INTEGER DEFAULT 0,
    excipient_status TEXT DEFAULT 'unique',
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_topic_scoring UNIQUE (topic_id)
);

-- New Drugs table
CREATE TABLE IF NOT EXISTS public.drugs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    dosage_forms TEXT[],
    therapeutic TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Disable RLS for development (enable in production)
ALTER TABLE public.institutes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.similarities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.drugs DISABLE ROW LEVEL SECURITY;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON public.users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_department ON public.users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_guide ON public.users(guide_id);
CREATE INDEX IF NOT EXISTS idx_topics_student ON public.topics(student_id);
CREATE INDEX IF NOT EXISTS idx_topics_title ON public.topics USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_topics_drug ON public.topics(drug_name);
CREATE INDEX IF NOT EXISTS idx_topics_submission_date ON public.topics(submission_date);
CREATE INDEX IF NOT EXISTS idx_approvals_topic ON public.approvals(topic_id);
CREATE INDEX IF NOT EXISTS idx_progress_topic ON public.progress(topic_id);
CREATE INDEX IF NOT EXISTS idx_similarities_topic ON public.similarities(topic_id);
CREATE INDEX IF NOT EXISTS idx_scoring_topic ON public.scoring_results(topic_id);

-- 5. Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS trigger_handle_updated_at ON public.users;
CREATE TRIGGER trigger_handle_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_approvals_updated_at ON public.approvals;
CREATE TRIGGER trigger_approvals_updated_at
    BEFORE UPDATE ON public.approvals
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 6. Auto-create approval record when a topic is inserted
CREATE OR REPLACE FUNCTION public.auto_create_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create if student_id is not null (for active students)
    IF NEW.student_id IS NOT NULL THEN
        INSERT INTO public.approvals (topic_id, guide_status, hoi_status, pg_director_status, dean_status)
        VALUES (NEW.id, 'PENDING', 'PENDING', 'PENDING', 'PENDING')
        ON CONFLICT (topic_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_create_approval ON public.topics;
CREATE TRIGGER trigger_auto_create_approval
    AFTER INSERT ON public.topics
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_create_approval();

-- 7. Auto-create progress record when a topic is inserted
CREATE OR REPLACE FUNCTION public.auto_create_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create if student_id is not null (for active students)
    IF NEW.student_id IS NOT NULL THEN
        INSERT INTO public.progress (topic_id, stage, status)
        VALUES (NEW.id, 'ITD', 'SUBMITTED');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_create_progress ON public.topics;
CREATE TRIGGER trigger_auto_create_progress
    AFTER INSERT ON public.topics
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_create_progress();

-- =============================================
-- 8. SEED DATA — Initial records for the system
-- =============================================

-- Institute
INSERT INTO public.institutes (id, name)
VALUES ('7b1897c9-ea9a-4c22-9b2f-76ee607318e8', 'Faculty of Pharmacy')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Departments (all 7 pharmaceutical departments)
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

-- Users — Superadmin
INSERT INTO public.users (id, name, email, role, status, institute_id)
VALUES ('a1c1d1e1-f1a1-2b2b-3c3c-4d4d4d4d4d4d', 'Admin User', 'admin@paruluniversity.ac.in', 'SUPERADMIN', 'ACTIVE', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8')
ON CONFLICT (email) DO UPDATE SET role = 'SUPERADMIN', name = EXCLUDED.name, institute_id = EXCLUDED.institute_id;

-- Guide
INSERT INTO public.users (id, name, email, role, status, institute_id, department_id)
VALUES ('b2c2d2e2-f2a2-3b3b-4c4c-5d5d5d5d5d5d', 'Dr. Ahmad', 'guide@paruluniversity.ac.in', 'GUIDE', 'ACTIVE', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8', 'c535492f-b4df-4ec8-a53c-f4b679415c1e')
ON CONFLICT (email) DO UPDATE SET role = 'GUIDE', name = EXCLUDED.name, institute_id = EXCLUDED.institute_id, department_id = EXCLUDED.department_id;

-- HOI
INSERT INTO public.users (id, name, email, role, status, institute_id, department_id)
VALUES ('f3c3d3e3-f3a3-4b4b-5c5c-6d6d6d6d6d6d', 'Dr. Alice HOI', 'hoi@paruluniversity.ac.in', 'HOI', 'ACTIVE', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8', 'c535492f-b4df-4ec8-a53c-f4b679415c1e')
ON CONFLICT (email) DO UPDATE SET role = 'HOI', name = EXCLUDED.name, institute_id = EXCLUDED.institute_id, department_id = EXCLUDED.department_id;

-- PG Director
INSERT INTO public.users (id, name, email, role, status, institute_id)
VALUES ('d4c4d4e4-f4a4-5b5b-6c6c-7d7d7d7d7d7d', 'Dr. Sarah PG', 'pg@paruluniversity.ac.in', 'PG_DIRECTOR', 'ACTIVE', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8')
ON CONFLICT (email) DO UPDATE SET role = 'PG_DIRECTOR', name = EXCLUDED.name, institute_id = EXCLUDED.institute_id;

-- Dean
INSERT INTO public.users (id, name, email, role, status, institute_id)
VALUES ('d5c5d5e5-f5a5-6b6b-7c7c-8d8d8d8d8d8d', 'Dr. John Dean', 'dean@paruluniversity.ac.in', 'DEAN', 'ACTIVE', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8')
ON CONFLICT (email) DO UPDATE SET role = 'DEAN', name = EXCLUDED.name, institute_id = EXCLUDED.institute_id;

-- Student 1
INSERT INTO public.users (id, name, email, role, status, institute_id, department_id, enrollment_no, guide_id)
VALUES ('e6c6d6e6-f6a6-7b7b-8c8c-9d9d9d9d9d9d', 'Nishant Student', '2403051050311@paruluniversity.ac.in', 'STUDENT', 'ACTIVE', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8', 'c535492f-b4df-4ec8-a53c-f4b679415c1e', '2403051050311', 'b2c2d2e2-f2a2-3b3b-4c4c-5d5d5d5d5d5d')
ON CONFLICT (email) DO UPDATE SET role = 'STUDENT', name = EXCLUDED.name, institute_id = EXCLUDED.institute_id, department_id = EXCLUDED.department_id, enrollment_no = EXCLUDED.enrollment_no, guide_id = EXCLUDED.guide_id;

-- Student 2
INSERT INTO public.users (id, name, email, role, status, institute_id, department_id, enrollment_no, guide_id)
VALUES ('e7c7d7e7-f7a7-8b8b-9c9c-0d0d0d0d0d0d', 'Amit Srivastava', '2303051240028@paruluniversity.ac.in', 'STUDENT', 'ACTIVE', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8', 'c535492f-b4df-4ec8-a53c-f4b679415c1e', '2303051240028', 'b2c2d2e2-f2a2-3b3b-4c4c-5d5d5d5d5d5d')
ON CONFLICT (email) DO UPDATE SET role = 'STUDENT', name = EXCLUDED.name, institute_id = EXCLUDED.institute_id, department_id = EXCLUDED.department_id, enrollment_no = EXCLUDED.enrollment_no, guide_id = EXCLUDED.guide_id;

-- =============================================
-- 9. Sample Topics for testing similarity & scoring
-- =============================================

INSERT INTO public.topics (id, student_id, title, drug_name, dosage_form, route_of_admin, excipients, method_preparation, novelty, keywords, form_data, is_locked)
VALUES 
  ('a1000001-0001-0001-0001-000000000001', 'e7c7d7e7-f7a7-8b8b-9c9c-0d0d0d0d0d0d', 
   'Formulation and Evaluation of Sustained Release Tablets of Metformin HCl', 
   'Metformin HCl', 'Tablet', 'Oral', 'HPMC, MCC, Magnesium Stearate',
   'Direct compression method with varying polymer ratios',
   'Novel application of HPMC K4M in sustained release matrix for improved bioavailability',
   'sustained release, metformin, HPMC, bioavailability',
   '{"drugName": "Metformin HCl", "dosageForm": "Tablet", "route": "Oral", "excipient": "HPMC, MCC, Magnesium Stearate", "novelty": "Novel application of HPMC K4M in sustained release matrix for improved bioavailability", "keywords": "sustained release, metformin, HPMC, bioavailability"}'::jsonb,
   true
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 10. Helper Views for dynamic data flow
-- =============================================

-- View: Topics with student + department info
CREATE OR REPLACE VIEW public.topics_with_details AS
SELECT 
    t.*,
    u.name AS student_name,
    u.email AS student_email,
    u.enrollment_no,
    d.name AS department_name_resolved,
    i.name AS institute_name,
    a.guide_status,
    a.hoi_status,
    a.pg_director_status,
    a.dean_status,
    g.name AS guide_name
FROM public.topics t
LEFT JOIN public.users u ON t.student_id = u.id
LEFT JOIN public.departments d ON u.department_id = d.id
LEFT JOIN public.institutes i ON u.institute_id = i.id
LEFT JOIN public.approvals a ON a.topic_id = t.id
LEFT JOIN public.users g ON u.guide_id = g.id;

-- View: Student submission progress overview
CREATE OR REPLACE VIEW public.student_progress_overview AS
SELECT
    u.id AS student_id,
    u.name AS student_name,
    u.email,
    u.enrollment_no,
    d.name AS department,
    t.id AS topic_id,
    t.title,
    t.submission_date,
    t.score,
    a.guide_status,
    a.hoi_status,
    a.pg_director_status,
    a.dean_status,
    p.stage AS current_stage,
    p.status AS stage_status
FROM public.users u
LEFT JOIN public.topics t ON t.student_id = u.id
LEFT JOIN public.approvals a ON a.topic_id = t.id
LEFT JOIN public.progress p ON p.topic_id = t.id
LEFT JOIN public.departments d ON u.department_id = d.id
WHERE u.role = 'STUDENT';

-- Done!
SELECT 'PU-FOP Supabase schema setup complete!' AS status;

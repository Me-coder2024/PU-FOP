-- 1. Create custom types/enums if they don't exist
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
CREATE TABLE IF NOT EXISTS public.institutes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL
);

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

-- Ensure new columns exist on topics table if table was created previously
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS department_name TEXT DEFAULT '';
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL UNIQUE REFERENCES public.topics(id) ON DELETE CASCADE,
    guide_status approval_status NOT NULL DEFAULT 'PENDING',
    hoi_status approval_status NOT NULL DEFAULT 'PENDING',
    pg_director_status approval_status NOT NULL DEFAULT 'PENDING',
    dean_status approval_status NOT NULL DEFAULT 'PENDING',
    remarks TEXT
);

CREATE TABLE IF NOT EXISTS public.similarities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    similar_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    similarity_percentage NUMERIC(5,2) NOT NULL,
    CONSTRAINT unique_topic_similarity UNIQUE (topic_id, similar_topic_id)
);

CREATE TABLE IF NOT EXISTS public.progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    stage progress_stage NOT NULL DEFAULT 'ITD',
    submission_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUBMITTED'
);

CREATE TABLE IF NOT EXISTS public.repository (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL UNIQUE REFERENCES public.topics(id) ON DELETE CASCADE,
    year TEXT NOT NULL,
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    pdf_file TEXT NOT NULL
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

-- 3. Enable RLS (Row Level Security) on all tables
-- Policies are defined in migration_fix_legacy_rls.sql and migration_rls_security.sql
ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.similarities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drugs ENABLE ROW LEVEL SECURITY;

-- Scoring results table
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
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_topic_scoring UNIQUE (topic_id)
);

ALTER TABLE public.scoring_results ENABLE ROW LEVEL SECURITY;

-- 4. Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger on users table
DROP TRIGGER IF EXISTS trigger_handle_updated_at ON public.users;
CREATE TRIGGER trigger_handle_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 6. Seed initial data
-- Insert Institute
INSERT INTO public.institutes (id, name)
VALUES ('7b1897c9-ea9a-4c22-9b2f-76ee607318e8', 'Faculty of Pharmacy')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Insert Departments
INSERT INTO public.departments (id, name, institute_id)
VALUES 
('c535492f-b4df-4ec8-a53c-f4b679415c1e', 'Pharmaceutics', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8'),
('d525492f-b4df-4ec8-a53c-f4b679415c2f', 'Pharmacology', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, institute_id = EXCLUDED.institute_id;

-- Insert Initial Users (Admins, Guides, Students)
-- Superadmin
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

-- Student 1 (from your login attempts)
INSERT INTO public.users (id, name, email, role, status, institute_id, department_id, enrollment_no, guide_id)
VALUES ('e6c6d6e6-f6a6-7b7b-8c8c-9d9d9d9d9d9d', 'Nishant Student', '2403051050311@paruluniversity.ac.in', 'STUDENT', 'ACTIVE', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8', 'c535492f-b4df-4ec8-a53c-f4b679415c1e', '2403051050311', 'b2c2d2e2-f2a2-3b3b-4c4c-5d5d5d5d5d5d')
ON CONFLICT (email) DO UPDATE SET role = 'STUDENT', name = EXCLUDED.name, institute_id = EXCLUDED.institute_id, department_id = EXCLUDED.department_id, enrollment_no = EXCLUDED.enrollment_no, guide_id = EXCLUDED.guide_id;

-- Student 2 (from Prisma seed)
INSERT INTO public.users (id, name, email, role, status, institute_id, department_id, enrollment_no, guide_id)
VALUES ('e7c7d7e7-f7a7-8b8b-9c9c-0d0d0d0d0d0d', 'Amit Srivastava', '2303051240028@paruluniversity.ac.in', 'STUDENT', 'ACTIVE', '7b1897c9-ea9a-4c22-9b2f-76ee607318e8', 'c535492f-b4df-4ec8-a53c-f4b679415c1e', '2303051240028', 'b2c2d2e2-f2a2-3b3b-4c4c-5d5d5d5d5d5d')
ON CONFLICT (email) DO UPDATE SET role = 'STUDENT', name = EXCLUDED.name, institute_id = EXCLUDED.institute_id, department_id = EXCLUDED.department_id, enrollment_no = EXCLUDED.enrollment_no, guide_id = EXCLUDED.guide_id;

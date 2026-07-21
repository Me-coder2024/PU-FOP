-- =============================================
-- Migration: Drug Requests System
-- Dual-approval workflow: Both Dean AND PG Director must approve
-- Run this in Supabase SQL Editor
-- =============================================

-- Drug Requests table
CREATE TABLE IF NOT EXISTS public.drug_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    drug_name TEXT NOT NULL,
    dosage_form TEXT,
    category TEXT,
    therapeutic TEXT,
    reason TEXT,
    -- Status: pending → dean_approved / pg_approved → approved / rejected
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'dean_approved', 'pg_approved', 'approved', 'rejected')
    ),
    -- Track who approved from each role
    dean_reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    dean_review_note TEXT,
    dean_reviewed_at TIMESTAMPTZ,
    pg_reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    pg_review_note TEXT,
    pg_reviewed_at TIMESTAMPTZ,
    -- If rejected, who rejected and why
    rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    rejected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drug_requests_status ON public.drug_requests(status);
CREATE INDEX IF NOT EXISTS idx_drug_requests_requested_by ON public.drug_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_drug_requests_created ON public.drug_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.drug_requests ENABLE ROW LEVEL SECURITY;

-- Students can view their own requests
DROP POLICY IF EXISTS "Students can view own drug requests" ON public.drug_requests;
CREATE POLICY "Students can view own drug requests"
    ON public.drug_requests FOR SELECT
    TO authenticated
    USING (requested_by = auth.uid());

-- Students can insert their own requests
DROP POLICY IF EXISTS "Students can create drug requests" ON public.drug_requests;
CREATE POLICY "Students can create drug requests"
    ON public.drug_requests FOR INSERT
    TO authenticated
    WITH CHECK (
        requested_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'student'
        )
    );

-- Dean can view all drug requests
DROP POLICY IF EXISTS "Dean can view all drug requests" ON public.drug_requests;
CREATE POLICY "Dean can view all drug requests"
    ON public.drug_requests FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'dean')
    );

-- Dean can update drug requests (approve/reject)
DROP POLICY IF EXISTS "Dean can update drug requests" ON public.drug_requests;
CREATE POLICY "Dean can update drug requests"
    ON public.drug_requests FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'dean')
    )
    WITH CHECK (true);

-- PG Director can view all drug requests
DROP POLICY IF EXISTS "PG Director can view all drug requests" ON public.drug_requests;
CREATE POLICY "PG Director can view all drug requests"
    ON public.drug_requests FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pg_director')
    );

-- PG Director can update drug requests (approve/reject)
DROP POLICY IF EXISTS "PG Director can update drug requests" ON public.drug_requests;
CREATE POLICY "PG Director can update drug requests"
    ON public.drug_requests FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pg_director')
    )
    WITH CHECK (true);

-- Super Admin full access
DROP POLICY IF EXISTS "Super admin full access to drug requests" ON public.drug_requests;
CREATE POLICY "Super admin full access to drug requests"
    ON public.drug_requests FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- Enable realtime (safely check publication first)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'drug_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.drug_requests;
    END IF;
END $$;

-- Done!
SELECT 'Drug Requests migration complete!' AS status;

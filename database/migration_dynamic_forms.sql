-- =============================================================================
-- Migration: Dynamic Forms Support
-- Additive only — NO destructive changes to existing columns/tables/policies.
-- =============================================================================

-- 1. Add schema_version to submissions (nullable, defaults to null for legacy)
-- Legacy submissions (before dynamic forms) will have schema_version = NULL.
-- New submissions created via the dynamic form will have schema_version = 2.
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT NULL;

-- 2. Add department_id to submissions for direct department lookup
-- Nullable so existing rows are not affected. New submissions will populate this
-- from the student's profile.department_id at submission time.
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS department_id UUID
    REFERENCES public.departments(id) ON DELETE SET NULL;

-- 3. Index for department-based queries (e.g., HOD filtering by department)
CREATE INDEX IF NOT EXISTS idx_submissions_department_id
  ON public.submissions(department_id);

-- 4. Index for schema_version (useful for filtering legacy vs new submissions)
CREATE INDEX IF NOT EXISTS idx_submissions_schema_version
  ON public.submissions(schema_version);

-- =============================================================================
-- NOTES:
-- - No existing RLS policies are modified.
-- - No existing columns are renamed or dropped.
-- - Legacy submissions with schema_version = NULL continue to work unchanged.
-- - The application treats schema_version = NULL as "legacy form" (Pharmaceutics).
-- =============================================================================

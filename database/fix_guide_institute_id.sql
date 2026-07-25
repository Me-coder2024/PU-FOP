-- ===================================================
-- Fix: Set institute_id for ALL guides missing it
-- Copy-paste this ENTIRE block into Supabase SQL Editor and click RUN
-- ===================================================

-- Step 1: Assign all guides (who have no institute) to "Parul Institute of Pharmacy"
UPDATE public.profiles
SET institute_id = (
  SELECT id FROM public.institutes
  WHERE name ILIKE '%Parul Institute of Pharmacy%'
  LIMIT 1
)
WHERE role = 'guide' AND institute_id IS NULL;

-- Step 2: Verify — this shows all guides with their institute
SELECT p.full_name, p.email, i.name AS institute
FROM public.profiles p
LEFT JOIN public.institutes i ON p.institute_id = i.id
WHERE p.role = 'guide'
ORDER BY p.full_name;

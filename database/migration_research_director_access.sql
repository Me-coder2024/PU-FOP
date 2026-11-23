-- Explicit faculty-wide research management. Null institute alone grants nothing.
-- Apply after migration_student_research_tracking.sql. Does not change title permissions.
BEGIN;
CREATE TABLE public.student_research_director_access (
 profile_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 granted_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL
);
ALTER TABLE public.student_research_director_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_research_director_access FROM public,anon,authenticated;
GRANT ALL ON public.student_research_director_access TO service_role;
CREATE FUNCTION public.has_faculty_research_access(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM student_research_director_access g JOIN profiles p ON p.id=g.profile_id WHERE p.id=p_actor AND p.role='pg_director')
$$;
REVOKE ALL ON FUNCTION public.has_faculty_research_access(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_faculty_research_access(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.student_research_scope(p_actor uuid,p_student uuid,p_manage boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles a JOIN profiles s ON s.id=p_student AND s.role='student'
 WHERE a.id=p_actor AND (a.role='super_admin' OR has_faculty_research_access(a.id) OR
 (NOT p_manage AND a.id=s.id) OR
 (a.institute_id=s.institute_id AND (a.role='pg_director' OR
 (NOT p_manage AND (a.role='dean' OR (a.role='hod' AND a.department_id=s.department_id)
 OR (a.role='guide' AND s.guide_id=a.id AND a.department_id=s.department_id)))))))
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;

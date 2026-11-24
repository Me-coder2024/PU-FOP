-- Apply after the existing research migrations. Safe to reapply.
-- PG Director and Dean roles themselves grant faculty-wide visibility.
-- Dean remains read-only for assignment creation; guide/HOD scopes stay unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.has_faculty_research_access(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role IN ('pg_director','dean','super_admin'))
$$;
REVOKE ALL ON FUNCTION public.has_faculty_research_access(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_faculty_research_access(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.student_research_scope(p_actor uuid,p_student uuid,p_manage boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles a JOIN profiles s ON s.id=p_student AND s.role='student'
 WHERE a.id=p_actor AND (
   a.role IN ('super_admin','pg_director') OR
   (NOT p_manage AND (a.role='dean' OR a.id=s.id OR
     (a.institute_id=s.institute_id AND (
       (a.role='hod' AND a.department_id=s.department_id) OR
       (a.role='guide' AND s.guide_id=a.id AND a.department_id=s.department_id)
     ))
   ))
 ))
$$;
REVOKE ALL ON FUNCTION public.student_research_scope(uuid,uuid,boolean) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.student_research_scope(uuid,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.student_research_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
 'role',(SELECT role::text FROM profiles WHERE id=auth.uid()),
 'students',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'universityId',p.university_id) ORDER BY p.full_name),'[]') FROM profiles p WHERE p.role='student' AND ((SELECT role FROM profiles WHERE id=auth.uid()) IN ('pg_director','dean','super_admin') AND student_research_scope(auth.uid(),p.id,false))),
 'records',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'assignment',to_jsonb(a),'request',to_jsonb(r)-'audience','studentName',p.full_name,'universityId',p.university_id,
  'isOwner',a.student_id=auth.uid(),
  'responses',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY version DESC),'[]') FROM student_research_responses u WHERE u.assignment_id=a.id AND (u.submitted_at IS NOT NULL OR a.student_id=auth.uid())),
  'history',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY created_at),'[]') FROM student_research_history e WHERE e.assignment_id=a.id)
 ) ORDER BY r.created_at DESC),'[]') FROM student_research_assignments a JOIN student_research_requests r ON r.id=a.request_id JOIN profiles p ON p.id=a.student_id WHERE student_research_scope(auth.uid(),a.student_id))
 )
$$;

create or replace function public.research_scope(p_actor uuid, p_submission uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path = public as $$
 select exists(select 1 from submissions s join profiles student on student.id=s.student_id
 join profiles actor on actor.id=p_actor where s.id=p_submission and (
  (p_roles is null and actor.id=s.student_id) or
  ((p_roles is null or actor.role::text=any(p_roles)) and (
    actor.role in ('super_admin','pg_director','dean') or
    (actor.institute_id=student.institute_id and (
      (actor.role='guide' and s.guide_id=actor.id and actor.department_id=student.department_id) or
      (actor.role='hod' and actor.department_id=student.department_id)
    ))
  ))
 ));
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;

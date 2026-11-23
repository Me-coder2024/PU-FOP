-- Independent of title approval and the title-workflow migrations. Apply once.
BEGIN;
CREATE TABLE public.student_research_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_key uuid UNIQUE NOT NULL,
 created_by uuid NOT NULL REFERENCES public.profiles(id), name text NOT NULL,
 stage text NOT NULL, instructions text NOT NULL DEFAULT '', questions jsonb NOT NULL,
 deadline timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 audience uuid[] NOT NULL
);
CREATE TABLE public.student_research_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES public.student_research_requests(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','submitted','revision_requested','accepted')),
 UNIQUE(request_id,student_id)
);
CREATE TABLE public.student_research_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL REFERENCES public.student_research_assignments(id),
 version integer NOT NULL, answers jsonb NOT NULL, submitted_at timestamptz,
 deadline_at_submission timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(assignment_id,version)
);
CREATE UNIQUE INDEX student_research_one_draft ON public.student_research_responses(assignment_id) WHERE submitted_at IS NULL;
CREATE TABLE public.student_research_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL REFERENCES public.student_research_assignments(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id), action text NOT NULL,
 response_id uuid REFERENCES public.student_research_responses(id), remarks text,
 old_deadline timestamptz, new_deadline timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.student_research_assignments(student_id);
CREATE INDEX ON public.student_research_history(assignment_id,created_at);
CREATE FUNCTION public.student_research_scope(p_actor uuid,p_student uuid,p_manage boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles a JOIN profiles s ON s.id=p_student AND s.role='student'
 WHERE a.id=p_actor AND (a.role='super_admin' OR
 (NOT p_manage AND a.id=s.id) OR
 (a.institute_id=s.institute_id AND (a.role='pg_director' OR
 (NOT p_manage AND (a.role='dean' OR (a.role='hod' AND a.department_id=s.department_id)
 OR (a.role='guide' AND s.guide_id=a.id AND a.department_id=s.department_id)))))))
$$;
ALTER TABLE public.student_research_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_research_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_research_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_research_history ENABLE ROW LEVEL SECURITY;
-- All reads use a scoped snapshot; mutations are server-only transactions.
REVOKE ALL ON public.student_research_requests,public.student_research_assignments,public.student_research_responses,public.student_research_history FROM anon,authenticated;
GRANT ALL ON public.student_research_requests,public.student_research_assignments,public.student_research_responses,public.student_research_history TO service_role;
CREATE FUNCTION public.publish_student_research(p_actor uuid,p_key uuid,p_students uuid[],p_name text,p_stage text,p_instructions text,p_questions jsonb,p_deadline timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r student_research_requests; targets uuid[]; student uuid; assignment uuid;
BEGIN
 -- Actor lock serializes retries and bulk publications for the same director.
 PERFORM 1 FROM profiles WHERE id=p_actor AND role IN ('pg_director','super_admin') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PG Director required'; END IF;
 SELECT array_agg(DISTINCT id ORDER BY id) INTO targets FROM unnest(p_students) id;
 IF coalesce(cardinality(targets),0)=0 OR cardinality(targets)>1000 OR EXISTS(SELECT 1 FROM unnest(targets) id WHERE id IS NULL OR NOT student_research_scope(p_actor,id,true)) THEN RAISE EXCEPTION 'Select between 1 and 1000 students within your institute'; END IF;
 SELECT * INTO r FROM student_research_requests WHERE request_key=p_key;
 IF r.id IS NOT NULL THEN
  IF r.created_by=p_actor AND r.audience=targets AND r.name=trim(p_name) AND r.stage=p_stage AND r.instructions=coalesce(p_instructions,'') AND r.questions=p_questions AND r.deadline=p_deadline THEN RETURN r.id; END IF;
  RAISE EXCEPTION 'Request key already used for different content';
 END IF;
 IF p_key IS NULL OR nullif(trim(p_name),'') IS NULL OR length(p_name)>160 OR length(p_instructions)>4000 OR p_deadline IS NULL OR p_deadline<=now() OR p_stage IS NULL OR p_stage NOT IN ('planning','literature','methodology','data_collection','analysis','writing','other') THEN RAISE EXCEPTION 'Choose a request name, research stage and future deadline'; END IF;
 IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Questions must be an array'; END IF;
 IF jsonb_array_length(p_questions) NOT BETWEEN 1 AND 10 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_questions) q WHERE jsonb_typeof(q)<>'string' OR nullif(trim(q#>>'{}'),'') IS NULL OR length(q#>>'{}')>500) THEN RAISE EXCEPTION 'Provide 1 to 10 nonempty questions of at most 500 characters'; END IF;
 INSERT INTO student_research_requests(request_key,created_by,name,stage,instructions,questions,deadline,audience)
 VALUES(p_key,p_actor,trim(p_name),p_stage,coalesce(p_instructions,''),p_questions,p_deadline,targets) RETURNING * INTO r;
 FOREACH student IN ARRAY targets LOOP
  INSERT INTO student_research_assignments(request_id,student_id) VALUES(r.id,student) RETURNING id INTO assignment;
  INSERT INTO student_research_history(assignment_id,actor_id,action,new_deadline) VALUES(assignment,p_actor,'assigned',p_deadline);
  INSERT INTO notifications(user_id,title,message,type,link) VALUES(student,'Research progress requested',r.name||' — respond by '||p_deadline::text,'info','/dashboard/track');
 END LOOP;
 RETURN r.id;
END;
$$;
CREATE FUNCTION public.student_research_action(p_actor uuid,p_assignment uuid,p_action text,p_answers jsonb DEFAULT NULL,p_response uuid DEFAULT NULL,p_remarks text DEFAULT NULL,p_deadline timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a student_research_assignments; r student_research_requests; u student_research_responses; role_name text;
BEGIN
 -- Lock shared request first: extensions and student submissions have consistent ordering.
 SELECT r0.* INTO r FROM student_research_requests r0 JOIN student_research_assignments a0 ON a0.request_id=r0.id WHERE a0.id=p_assignment FOR UPDATE OF r0;
 SELECT * INTO a FROM student_research_assignments WHERE id=p_assignment FOR UPDATE;
 IF a.id IS NULL OR NOT student_research_scope(p_actor,a.student_id) THEN RAISE EXCEPTION 'Request unavailable'; END IF;
 SELECT role::text INTO role_name FROM profiles WHERE id=p_actor;
 IF length(p_remarks)>4000 THEN RAISE EXCEPTION 'Remarks are too long'; END IF;
 IF p_action='extend' THEN
  IF NOT student_research_scope(p_actor,a.student_id,true) THEN RAISE EXCEPTION 'PG Director required'; END IF;
  IF p_deadline=r.deadline THEN RETURN r.id; END IF;
  IF p_deadline IS NULL OR p_deadline<=now() OR p_deadline<=r.deadline OR nullif(trim(p_remarks),'') IS NULL THEN RAISE EXCEPTION 'Choose a later future deadline and explain why'; END IF;
  -- A bulk request has one deadline: recheck all recipients before changing it.
  IF EXISTS(SELECT 1 FROM student_research_assignments x WHERE x.request_id=r.id AND NOT student_research_scope(p_actor,x.student_id,true)) THEN RAISE EXCEPTION 'Not authorized for every recipient'; END IF;
  UPDATE student_research_requests SET deadline=p_deadline WHERE id=r.id;
  INSERT INTO student_research_history(assignment_id,actor_id,action,remarks,old_deadline,new_deadline)
  SELECT id,p_actor,'deadline_extended',p_remarks,r.deadline,p_deadline FROM student_research_assignments WHERE request_id=r.id;
  INSERT INTO notifications(user_id,title,message,type,link) SELECT student_id,'Research deadline extended',r.name||' — '||p_deadline::text,'info','/dashboard/track' FROM student_research_assignments WHERE request_id=r.id;
  RETURN r.id;
 END IF;
 IF p_action IN ('save','submit') THEN
  IF p_actor<>a.student_id THEN RAISE EXCEPTION 'Student ownership required'; END IF;
  IF p_action='submit' THEN
   SELECT * INTO u FROM student_research_responses WHERE id=p_response AND assignment_id=a.id;
   IF u.submitted_at IS NOT NULL THEN RETURN u.id; END IF;
  END IF;
  IF now()>r.deadline THEN RAISE EXCEPTION 'Deadline passed. Ask the PG Director for an extension'; END IF;
  IF a.state NOT IN ('pending','revision_requested') THEN RAISE EXCEPTION 'Wait for a revision request before changing your submission'; END IF;
  IF p_action='save' THEN
   IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Answers must be an object'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each(p_answers) x WHERE x.key !~ '^[0-9]$' OR jsonb_typeof(x.value)<>'string' OR length(x.value#>>'{}')>10000) THEN RAISE EXCEPTION 'Invalid answer'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_answers) k WHERE k::integer>=jsonb_array_length(r.questions)) THEN RAISE EXCEPTION 'Unknown question'; END IF;
   SELECT * INTO u FROM student_research_responses WHERE assignment_id=a.id AND submitted_at IS NULL;
   IF u.id IS NULL THEN
    INSERT INTO student_research_responses(assignment_id,version,answers) VALUES(a.id,(SELECT coalesce(max(version),0)+1 FROM student_research_responses WHERE assignment_id=a.id),p_answers) RETURNING * INTO u;
   ELSE UPDATE student_research_responses SET answers=p_answers,updated_at=now() WHERE id=u.id RETURNING * INTO u; END IF;
   RETURN u.id;
  END IF;
  IF u.id IS NULL THEN RAISE EXCEPTION 'Save your draft first'; END IF;
  IF EXISTS(SELECT 1 FROM generate_series(0,jsonb_array_length(r.questions)-1) i WHERE nullif(trim(u.answers->>i::text),'') IS NULL) THEN RAISE EXCEPTION 'Answer every question'; END IF;
  UPDATE student_research_responses SET submitted_at=now(),deadline_at_submission=r.deadline,updated_at=now() WHERE id=u.id;
  UPDATE student_research_assignments SET state='submitted' WHERE id=a.id;
 ELSIF p_action IN ('accepted','revision_requested') THEN
  IF role_name NOT IN ('pg_director','super_admin','guide') OR p_actor=a.student_id THEN RAISE EXCEPTION 'Assigned guide or PG Director required'; END IF;
  SELECT * INTO u FROM student_research_responses WHERE id=p_response AND assignment_id=a.id AND submitted_at IS NOT NULL;
  IF u.id IS NULL THEN RAISE EXCEPTION 'Submitted response required'; END IF;
  IF a.state=p_action AND EXISTS(SELECT 1 FROM student_research_history WHERE response_id=u.id AND action=p_action) THEN RETURN u.id; END IF;
  IF a.state<>'submitted' OR u.id IS DISTINCT FROM (SELECT id FROM student_research_responses WHERE assignment_id=a.id AND submitted_at IS NOT NULL ORDER BY version DESC LIMIT 1) THEN RAISE EXCEPTION 'Review the latest submission'; END IF;
  IF p_action='revision_requested' AND nullif(trim(p_remarks),'') IS NULL THEN RAISE EXCEPTION 'Explain the revision required'; END IF;
  UPDATE student_research_assignments SET state=p_action WHERE id=a.id;
 ELSE RAISE EXCEPTION 'Invalid action'; END IF;
 INSERT INTO student_research_history(assignment_id,actor_id,action,response_id,remarks) VALUES(a.id,p_actor,p_action,u.id,p_remarks);
 IF p_action='submit' THEN
  INSERT INTO notifications(user_id,title,message,type,link)
  SELECT id,'Research update submitted',r.name,'info','/research' FROM profiles WHERE role IN ('pg_director','guide','super_admin') AND student_research_scope(id,a.student_id);
 ELSE
  INSERT INTO notifications(user_id,title,message,type,link) VALUES(a.student_id,'Research update reviewed',replace(p_action,'_',' ')||': '||coalesce(p_remarks,r.name),'info','/dashboard/track');
 END IF;
 RETURN u.id;
END;
$$;
CREATE FUNCTION public.student_research_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
 'role',(SELECT role::text FROM profiles WHERE id=auth.uid()),
 'students',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'universityId',p.university_id) ORDER BY p.full_name),'[]') FROM profiles p WHERE p.role='student' AND student_research_scope(auth.uid(),p.id,true)),
 'records',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'assignment',to_jsonb(a),'request',to_jsonb(r)-'audience','studentName',p.full_name,'universityId',p.university_id,
  'isOwner',a.student_id=auth.uid(),
  'responses',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY version DESC),'[]') FROM student_research_responses u WHERE u.assignment_id=a.id AND (u.submitted_at IS NOT NULL OR a.student_id=auth.uid())),
  'history',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY created_at),'[]') FROM student_research_history e WHERE e.assignment_id=a.id)
 ) ORDER BY r.created_at DESC),'[]') FROM student_research_assignments a JOIN student_research_requests r ON r.id=a.request_id JOIN profiles p ON p.id=a.student_id WHERE student_research_scope(auth.uid(),a.student_id))
 )
$$;
REVOKE ALL ON FUNCTION public.student_research_scope(uuid,uuid,boolean),public.publish_student_research(uuid,uuid,uuid[],text,text,text,jsonb,timestamptz),public.student_research_action(uuid,uuid,text,jsonb,uuid,text,timestamptz),public.student_research_snapshot() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.student_research_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_research_scope(uuid,uuid,boolean),public.publish_student_research(uuid,uuid,uuid[],text,text,text,jsonb,timestamptz),public.student_research_action(uuid,uuid,text,jsonb,uuid,text,timestamptz) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

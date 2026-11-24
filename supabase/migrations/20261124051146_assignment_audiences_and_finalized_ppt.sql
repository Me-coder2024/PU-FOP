-- After faculty_wide_research_access. Existing student assignment records are preserved.
BEGIN;
-- Role grants are changed through the authenticated server route, never directly by a browser.
REVOKE INSERT, UPDATE, DELETE ON public.role_grants FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_grants TO service_role;
ALTER TABLE student_research_requests ADD COLUMN IF NOT EXISTS audience_kind text;
CREATE OR REPLACE FUNCTION public.assignment_scope(p_actor uuid,p_recipient uuid,p_manage boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles a JOIN profiles r ON r.id=p_recipient WHERE a.id=p_actor AND (
 a.role IN ('pg_director','super_admin') OR
 (NOT p_manage AND (a.id=r.id OR a.role='dean' OR
 (r.role='student' AND student_research_scope(a.id,r.id,false))))))
$$;
REVOKE ALL ON FUNCTION public.assignment_scope(uuid,uuid,boolean) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assignment_scope(uuid,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.assignment_recipients(p_actor uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'universityId',p.university_id,
 'roles',(SELECT jsonb_agg(DISTINCT role) FROM (
 SELECT p.role::text role UNION SELECT g.role::text FROM role_grants g WHERE lower(g.email)=lower(p.email)
 ) assigned)) ORDER BY p.full_name,p.id),'[]') FROM profiles p
 WHERE EXISTS(SELECT 1 FROM profiles a WHERE a.id=p_actor AND a.role IN ('pg_director','dean','super_admin'))
$$;
REVOKE ALL ON FUNCTION public.assignment_recipients(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assignment_recipients(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.publish_student_research(p_actor uuid,p_key uuid,p_students uuid[],p_name text,p_stage text,p_instructions text,p_questions jsonb,p_deadline timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r student_research_requests; targets uuid[]; student uuid; assignment uuid;
BEGIN
 -- Actor lock serializes retries and bulk publications for the same director.
 PERFORM 1 FROM profiles WHERE id=p_actor AND role IN ('pg_director','super_admin') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PG Director required'; END IF;
 SELECT array_agg(DISTINCT id ORDER BY id) INTO targets FROM unnest(p_students) id;
 IF coalesce(cardinality(targets),0)=0 OR cardinality(targets)>1000 OR EXISTS(SELECT 1 FROM unnest(targets) id WHERE id IS NULL OR NOT assignment_scope(p_actor,id,true)) THEN RAISE EXCEPTION 'Select between 1 and 1000 recipients across all institutes'; END IF;
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
  INSERT INTO notifications(user_id,title,message,type,link) VALUES(student,'Research progress requested',r.name||' — respond by '||p_deadline::text,'info','/assignments');
 END LOOP;
 RETURN r.id;
END;
$$;
CREATE OR REPLACE FUNCTION public.student_research_action(p_actor uuid,p_assignment uuid,p_action text,p_answers jsonb DEFAULT NULL,p_response uuid DEFAULT NULL,p_remarks text DEFAULT NULL,p_deadline timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a student_research_assignments; r student_research_requests; u student_research_responses; role_name text;
BEGIN
 -- Lock shared request first: extensions and student submissions have consistent ordering.
 SELECT r0.* INTO r FROM student_research_requests r0 JOIN student_research_assignments a0 ON a0.request_id=r0.id WHERE a0.id=p_assignment FOR UPDATE OF r0;
 SELECT * INTO a FROM student_research_assignments WHERE id=p_assignment FOR UPDATE;
 IF a.id IS NULL OR NOT assignment_scope(p_actor,a.student_id) THEN RAISE EXCEPTION 'Request unavailable'; END IF;
 SELECT role::text INTO role_name FROM profiles WHERE id=p_actor;
 IF length(p_remarks)>4000 THEN RAISE EXCEPTION 'Remarks are too long'; END IF;
 IF p_action='extend' THEN
  IF NOT assignment_scope(p_actor,a.student_id,true) THEN RAISE EXCEPTION 'PG Director required'; END IF;
  IF p_deadline=r.deadline THEN RETURN r.id; END IF;
  IF p_deadline IS NULL OR p_deadline<=now() OR p_deadline<=r.deadline OR nullif(trim(p_remarks),'') IS NULL THEN RAISE EXCEPTION 'Choose a later future deadline and explain why'; END IF;
  -- A bulk request has one deadline: recheck all recipients before changing it.
  IF EXISTS(SELECT 1 FROM student_research_assignments x WHERE x.request_id=r.id AND NOT assignment_scope(p_actor,x.student_id,true)) THEN RAISE EXCEPTION 'Not authorized for every recipient'; END IF;
  UPDATE student_research_requests SET deadline=p_deadline WHERE id=r.id;
  INSERT INTO student_research_history(assignment_id,actor_id,action,remarks,old_deadline,new_deadline)
  SELECT id,p_actor,'deadline_extended',p_remarks,r.deadline,p_deadline FROM student_research_assignments WHERE request_id=r.id;
  INSERT INTO notifications(user_id,title,message,type,link) SELECT student_id,'Research deadline extended',r.name||' — '||p_deadline::text,'info','/assignments' FROM student_research_assignments WHERE request_id=r.id;
  RETURN r.id;
 END IF;
 IF p_action IN ('save','submit') THEN
  IF p_actor<>a.student_id THEN RAISE EXCEPTION 'Recipient ownership required'; END IF;
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
  SELECT id,'Research update submitted',r.name,'info','/assignments' FROM profiles WHERE role IN ('pg_director','guide','super_admin') AND assignment_scope(id,a.student_id);
 ELSE
  INSERT INTO notifications(user_id,title,message,type,link) VALUES(a.student_id,'Research update reviewed',replace(p_action,'_',' ')||': '||coalesce(p_remarks,r.name),'info','/assignments');
 END IF;
 RETURN u.id;
END;
$$;

-- Audience membership is resolved once on the server. Retries retain the original recipients.
CREATE OR REPLACE FUNCTION public.publish_assignment(p_actor uuid,p_key uuid,p_audience text,p_selected uuid[],p_name text,p_instructions text,p_questions jsonb,p_deadline timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE targets uuid[]; existing student_research_requests; published uuid;
BEGIN
 PERFORM 1 FROM profiles WHERE id=p_actor AND role IN ('pg_director','super_admin') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PG Director required'; END IF;
 IF p_audience NOT IN ('students','guides','hods','everyone','selected') OR p_audience IS NULL THEN RAISE EXCEPTION 'Choose recipients'; END IF;
 SELECT * INTO existing FROM student_research_requests WHERE request_key=p_key;
 IF existing.id IS NOT NULL THEN
  IF existing.created_by<>p_actor THEN RAISE EXCEPTION 'Request key already used'; END IF;
  IF existing.audience_kind IS DISTINCT FROM p_audience THEN RAISE EXCEPTION 'Request key already used for a different audience'; END IF;
  IF p_audience='selected' AND existing.audience IS DISTINCT FROM (SELECT array_agg(DISTINCT id ORDER BY id) FROM unnest(p_selected) id) THEN RAISE EXCEPTION 'Request key already used for different students'; END IF;
  targets:=existing.audience;
 ELSIF p_audience='selected' THEN
  SELECT array_agg(DISTINCT id ORDER BY id) INTO targets FROM unnest(p_selected) id;
  IF EXISTS(SELECT 1 FROM unnest(targets) AS chosen(recipient_id) WHERE NOT EXISTS(SELECT 1 FROM profiles p WHERE p.id=chosen.recipient_id AND (p.role='student' OR EXISTS(SELECT 1 FROM role_grants g WHERE lower(g.email)=lower(p.email) AND g.role='student')))) THEN RAISE EXCEPTION 'Select registered students'; END IF;
 ELSE
  SELECT array_agg(p.id ORDER BY p.id) INTO targets FROM profiles p WHERE
  p_audience='everyone' OR
  p.role::text=CASE p_audience WHEN 'students' THEN 'student' WHEN 'guides' THEN 'guide' WHEN 'hods' THEN 'hod' END OR
  EXISTS(SELECT 1 FROM role_grants g WHERE lower(g.email)=lower(p.email) AND g.role::text=CASE p_audience WHEN 'students' THEN 'student' WHEN 'guides' THEN 'guide' WHEN 'hods' THEN 'hod' END);
 END IF;
 published:=publish_student_research(p_actor,p_key,targets,p_name,'other',p_instructions,p_questions,p_deadline);
 UPDATE student_research_requests SET audience_kind=p_audience WHERE id=published;
 RETURN published;
END $$;
REVOKE ALL ON FUNCTION public.publish_assignment(uuid,uuid,text,uuid[],text,text,jsonb,timestamptz) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_assignment(uuid,uuid,text,uuid[],text,text,jsonb,timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.student_research_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
 'role',(SELECT role::text FROM profiles WHERE id=auth.uid()),
 'recipients',assignment_recipients(auth.uid()),
 'students',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'universityId',p.university_id) ORDER BY p.full_name),'[]') FROM profiles p WHERE p.role='student' AND assignment_scope(auth.uid(),p.id,false) AND (SELECT role FROM profiles WHERE id=auth.uid()) IN ('pg_director','dean','super_admin')),
 'records',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'assignment',to_jsonb(a),'request',to_jsonb(r)-'audience','studentName',p.full_name,'universityId',p.university_id,
  'isOwner',a.student_id=auth.uid(),
  'responses',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY version DESC),'[]') FROM student_research_responses u WHERE u.assignment_id=a.id AND (u.submitted_at IS NOT NULL OR a.student_id=auth.uid())),
  'history',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY created_at),'[]') FROM student_research_history e WHERE e.assignment_id=a.id)
 ) ORDER BY r.created_at DESC),'[]') FROM student_research_assignments a JOIN student_research_requests r ON r.id=a.request_id JOIN profiles p ON p.id=a.student_id WHERE assignment_scope(auth.uid(),a.student_id))
 )
$$;
CREATE OR REPLACE FUNCTION public.require_finalized_ppt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM research_milestones m JOIN submissions s ON s.id=m.submission_id
 WHERE m.id=NEW.milestone_id AND s.status<>'finalized') THEN
 RAISE EXCEPTION 'PPT submission is available only after your title is finalized';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.require_finalized_ppt() FROM public,anon,authenticated;
DROP TRIGGER IF EXISTS require_finalized_ppt ON public.research_files;
CREATE TRIGGER require_finalized_ppt BEFORE INSERT OR UPDATE ON public.research_files FOR EACH ROW EXECUTE FUNCTION public.require_finalized_ppt();
INSERT INTO research_milestone_definitions(id,name,instructions,response_kind,questions,position,require_finalized_title,reviewer_roles,allow_revision,allow_late,enabled,test_only,max_bytes)
VALUES('83198cf0-ec3a-4cfe-84ad-e5c9214ff8bd','Finalized title presentation','Upload your presentation as a .pptx file.','pptx','[]',0,true,ARRAY['pg_director','dean'],true,true,true,false,26214400)
ON CONFLICT(id) DO NOTHING;

-- A guide assignment survives switching between legitimately granted staff roles.
CREATE OR REPLACE FUNCTION public.is_assigned_guide(p_guide uuid,p_institute uuid,p_department uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles g WHERE g.id=p_guide AND (
 (g.role='guide' AND g.institute_id=p_institute AND g.department_id=p_department) OR
 EXISTS(SELECT 1 FROM role_grants r WHERE lower(r.email)=lower(g.email) AND r.role='guide'
 AND r.institute_id=p_institute AND r.department_id=p_department)))
$$;
REVOKE ALL ON FUNCTION public.is_assigned_guide(uuid,uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_guide(uuid,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.reassign_student_guide(p_actor uuid,p_student uuid,p_guide uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor profiles; student profiles;
BEGIN
 SELECT * INTO actor FROM profiles WHERE id=p_actor FOR UPDATE;
 SELECT * INTO student FROM profiles WHERE id=p_student FOR UPDATE;
 IF student.role IS DISTINCT FROM 'student' OR actor.id IS NULL OR NOT (
 actor.role IN ('dean','super_admin') OR (actor.role='hod' AND actor.institute_id=student.institute_id AND actor.department_id=student.department_id)) THEN RAISE EXCEPTION 'Student is outside your assignment scope'; END IF;
 IF NOT is_assigned_guide(p_guide,student.institute_id,student.department_id) THEN RAISE EXCEPTION 'Choose a guide assigned to this department'; END IF;
 UPDATE profiles SET guide_id=p_guide WHERE id=p_student;
 UPDATE submissions SET guide_id=p_guide WHERE student_id=p_student AND status NOT IN ('guide_rejected','hod_rejected');
 INSERT INTO notifications(user_id,title,message,type,link) VALUES(p_student,'Guide updated','Your department updated your assigned guide.','info','/dashboard');
END $$;
REVOKE ALL ON FUNCTION public.reassign_student_guide(uuid,uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_student_guide(uuid,uuid,uuid) TO service_role;

create or replace function public.title_action(p_actor uuid,p_action text,p_submission uuid default null,p_title text default null,
 p_description text default null,p_details jsonb default null,p_remarks text default null,p_unlocked boolean default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor profiles; s submissions; target submission_status; dept text;
begin
 select * into actor from profiles where id=p_actor for update;
 if actor.id is null then raise exception 'Not authorized'; end if;
 if p_submission is not null then
  select * into s from submissions where id=p_submission for update;
  if s.id is null or not research_scope(p_actor,s.id) then raise exception 'Not authorized'; end if;
 end if;
 if p_action='student_submit' then
  if actor.role<>'student' or (s.id is not null and s.student_id<>actor.id) then raise exception 'Student ownership required'; end if;
  if s.id is not null and s.status<>'revision_requested' and not s.edit_unlocked then raise exception 'Editing is locked'; end if;
  if s.id is null and not is_submission_open(actor.institute_id) then raise exception 'Submission window is closed'; end if;
  if actor.department_id is null or actor.institute_id is null or actor.guide_id is null then raise exception 'Complete department and guide assignment first'; end if;
  if not is_assigned_guide(actor.guide_id,actor.institute_id,actor.department_id) then raise exception 'Assigned guide is out of scope'; end if;
  if length(trim(p_title))<11 or length(trim(p_description))<11 then raise exception 'Title and novelty must contain at least 11 characters'; end if;
  if exists(select 1 from submissions where id is distinct from s.id and status not in ('guide_rejected','hod_rejected') and lower(trim(title))=lower(trim(p_title))) then raise exception 'This title already exists'; end if;
  select name into dept from departments where id=actor.department_id;
  if p_details->>'schema_version'='2' then p_details:=p_details||jsonb_build_object('department',dept); end if;
  if s.id is null then
   insert into submissions(student_id,guide_id,title,description,criteria_details,status,department_id,schema_version)
   values(actor.id,actor.guide_id,trim(p_title),trim(p_description),p_details,'submitted',actor.department_id,case when p_details->>'schema_version'='2' then 2 else null end) returning * into s;
  else
   update submissions set title=trim(p_title),description=trim(p_description),criteria_details=p_details,status='submitted',edit_unlocked=false,
   department_id=actor.department_id,schema_version=case when p_details->>'schema_version'='2' then 2 else null end,
   guide_remarks=null,guide_reviewed_at=null,hod_remarks=null,hod_reviewed_at=null,rejection_reason=null,finalized_at=null
   where id=s.id returning * into s;
  end if;
 else
  if s.id is null then raise exception 'Submission required'; end if;
  if p_action in ('guide_accept','guide_reject','guide_revision') then
   if not research_scope(p_actor,s.id,array['guide','super_admin']) then raise exception 'Assigned guide required'; end if;
   target:=case p_action when 'guide_accept' then 'guide_accepted' when 'guide_reject' then 'guide_rejected' else 'revision_requested' end;
   if s.status=target then return s.id; end if;
   if s.status<>'submitted' then raise exception 'Title is not awaiting guide review'; end if;
   if p_action<>'guide_accept' and nullif(trim(p_remarks),'') is null then raise exception 'Remarks required'; end if;
   update submissions set status=target,guide_remarks=p_remarks,guide_reviewed_at=now(),rejection_reason=case when target='guide_rejected' then p_remarks else null end where id=s.id;
  elsif p_action in ('hod_accept','hod_revision','hod_reject') then
   if not research_scope(p_actor,s.id,array['hod','super_admin']) then raise exception 'In-scope HOD required'; end if;
   target:=case p_action when 'hod_accept' then 'hod_accepted' when 'hod_reject' then 'hod_rejected' else 'revision_requested' end;
   if s.status=target then return s.id; end if;
   if s.status<>'guide_accepted' then raise exception 'Title is not awaiting HOD review'; end if;
   if p_action<>'hod_accept' and nullif(trim(p_remarks),'') is null then raise exception 'Remarks required'; end if;
   update submissions set status=target,hod_id=actor.id,hod_remarks=p_remarks,hod_reviewed_at=now(),rejection_reason=case when target='hod_rejected' then p_remarks else null end where id=s.id;
  elsif p_action in ('finalize','final_revision','set_unlock','edit_title') then
   if not research_scope(p_actor,s.id,array['pg_director','dean','super_admin']) then raise exception 'In-scope final reviewer required'; end if;
   if p_action='finalize' then
    if s.status='finalized' then return s.id; end if;
    if s.status<>'hod_accepted' then raise exception 'HOD acceptance required'; end if;
    update submissions set status='finalized',edit_unlocked=false,finalized_at=now() where id=s.id;
   elsif p_action='final_revision' then
    if s.status='revision_requested' then return s.id; end if;
    if s.status<>'hod_accepted' or nullif(trim(p_remarks),'') is null then raise exception 'Awaiting final review and remarks required'; end if;
    update submissions set status='revision_requested',edit_unlocked=true where id=s.id;
   elsif p_action='set_unlock' then
    if p_unlocked is null then raise exception 'Explicit unlock value required'; end if;
    if s.edit_unlocked=p_unlocked then return s.id; end if;
    update submissions set edit_unlocked=p_unlocked where id=s.id;
   else
    if actor.role not in ('dean','super_admin') then raise exception 'Dean-only action'; end if;
    if nullif(trim(p_title),'') is null then raise exception 'Title required'; end if;
    if s.title=trim(p_title) then return s.id; end if;
    update submissions set title=trim(p_title) where id=s.id;
   end if;
  else raise exception 'Invalid title action'; end if;
 end if;
 insert into title_review_events(submission_id,actor_id,action,remarks) values(s.id,p_actor,p_action,left(p_remarks,4000));
 insert into notifications(user_id,title,message,type,link) values(s.student_id,'Title workflow updated',replace(p_action,'_',' ')||coalesce(': '||p_remarks,''),'info','/dashboard/submit');
 if p_action='student_submit' then
  insert into notifications(user_id,title,message,type,link) values(s.guide_id,'Title ready for review',s.title,'info','/guide');
 elsif p_action in ('guide_accept','hod_accept') then
  insert into notifications(user_id,title,message,type,link)
  select p.id,'Title ready for review',s.title,'info',case when p.role='hod' then '/hod' when p.role='pg_director' then '/pg-director' else '/dean/titles' end
  from profiles p where research_scope(p.id,s.id,case when p_action='guide_accept' then array['hod'] else array['pg_director','dean'] end);
 end if;
 return s.id;
end;
$$;
revoke all on function public.title_action(uuid,text,uuid,text,text,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.title_action(uuid,text,uuid,text,text,jsonb,text,boolean) to service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

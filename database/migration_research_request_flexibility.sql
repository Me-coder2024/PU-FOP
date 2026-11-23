-- Requests, questions and assignments may be sent at any time, including before
-- the dissertation title is finalized. Only the authoritative title submission
-- form stays gated, so title approvals keep a single truthful source.
-- Apply after the research tracking migrations. Idempotent; run once.
BEGIN;

ALTER TABLE public.research_milestone_definitions ALTER COLUMN require_finalized_title SET DEFAULT false;
UPDATE public.research_milestone_definitions SET require_finalized_title=false WHERE require_finalized_title;

-- Student work on title-linked file milestones.
CREATE OR REPLACE FUNCTION public.research_action(p_actor uuid, p_submission uuid, p_definition uuid, p_action text,
 p_file uuid DEFAULT NULL, p_filename text DEFAULT NULL, p_size integer DEFAULT NULL,
 p_remarks text DEFAULT NULL, p_sealed_path text DEFAULT NULL, p_staging boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s submissions; student profiles; d research_milestone_definitions; m research_milestones; f research_files; result_id uuid;
BEGIN
 SELECT * INTO s FROM submissions WHERE id=p_submission FOR UPDATE;
 IF s.id IS NULL OR NOT public.research_scope(p_actor,s.id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO student FROM profiles WHERE id=s.student_id;
 SELECT * INTO d FROM research_milestone_definitions WHERE id=p_definition;
 IF d.id IS NULL OR NOT d.enabled OR (d.test_only AND NOT p_staging) OR
 (d.institute_id IS NOT NULL AND d.institute_id IS DISTINCT FROM student.institute_id) OR
 (d.department_id IS NOT NULL AND d.department_id IS DISTINCT FROM student.department_id) THEN RAISE EXCEPTION 'Milestone unavailable'; END IF;
 INSERT INTO research_milestones(submission_id,definition_id) VALUES(s.id,d.id) ON CONFLICT DO NOTHING;
 SELECT * INTO m FROM research_milestones WHERE submission_id=s.id AND definition_id=d.id FOR UPDATE;
 IF p_action IN ('reserve','confirm','submit') THEN
   IF p_actor<>s.student_id THEN RAISE EXCEPTION 'Student ownership required'; END IF;
   IF s.status IN ('guide_rejected','hod_rejected') THEN RAISE EXCEPTION 'Title was rejected'; END IF;
   IF d.deadline IS NOT NULL AND now()>d.deadline AND NOT d.allow_late THEN RAISE EXCEPTION 'Milestone deadline has passed'; END IF;
   IF d.unlock_after IS NOT NULL AND NOT EXISTS(SELECT 1 FROM research_milestones WHERE submission_id=s.id AND definition_id=d.unlock_after AND state='accepted') THEN RAISE EXCEPTION 'Previous milestone must be accepted'; END IF;
 END IF;
 IF p_action='reserve' THEN
   IF m.state NOT IN ('pending','revision_requested') OR (m.state='revision_requested' AND NOT d.allow_revision) THEN RAISE EXCEPTION 'New versions are locked'; END IF;
   IF p_filename IS NULL OR length(p_filename)>180 OR p_filename !~* '\.pptx$' OR p_size IS NULL OR p_size<1 OR p_size>d.max_bytes THEN RAISE EXCEPTION 'Invalid filename or size'; END IF;
   result_id:=gen_random_uuid();
   INSERT INTO research_files(id,milestone_id,uploaded_by,filename,size_bytes,object_path)
   VALUES(result_id,m.id,p_actor,p_filename,p_size,p_actor::text||'/'||m.id::text||'/'||result_id::text||'.pptx') RETURNING * INTO f;
   RETURN to_jsonb(f);
 END IF;
 SELECT * INTO f FROM research_files WHERE id=p_file AND milestone_id=m.id FOR UPDATE;
 IF f.id IS NULL THEN RAISE EXCEPTION 'File not found'; END IF;
 IF p_action='confirm' THEN
   IF f.state IN ('draft','submitted') THEN RETURN to_jsonb(f); END IF;
   IF m.state NOT IN ('pending','revision_requested') THEN RAISE EXCEPTION 'Draft is locked'; END IF;
   IF p_sealed_path IS NULL OR p_sealed_path<>('verified/'||f.id::text||'.pptx') THEN RAISE EXCEPTION 'Verified file required'; END IF;
   UPDATE research_files SET state='draft',sealed_path=p_sealed_path WHERE id=f.id RETURNING * INTO f;
 ELSIF p_action='submit' THEN
   IF f.state='submitted' THEN RETURN to_jsonb(f); END IF;
   IF f.state<>'draft' OR f.sealed_path IS NULL THEN RAISE EXCEPTION 'Upload must be verified first'; END IF;
   IF m.state NOT IN ('pending','revision_requested') OR (m.state='revision_requested' AND NOT d.allow_revision) THEN RAISE EXCEPTION 'Submission is locked'; END IF;
   -- Only drafts uploaded after the most recent review may be used for a revision.
   IF m.state='revision_requested' AND f.created_at <= (SELECT max(created_at) FROM research_events WHERE milestone_id=m.id AND action='revision_requested') THEN RAISE EXCEPTION 'Upload a new revision'; END IF;
   UPDATE research_files SET state='submitted',submitted_at=now() WHERE id=f.id RETURNING * INTO f;
   UPDATE research_milestones SET state='submitted' WHERE id=m.id;
 ELSIF p_action IN ('accepted','revision_requested') THEN
   IF NOT public.research_scope(p_actor,s.id,d.reviewer_roles) THEN RAISE EXCEPTION 'Reviewer permission required'; END IF;
   IF f.state<>'submitted' THEN RAISE EXCEPTION 'Submitted file required'; END IF;
   IF m.state<>'submitted' OR (p_action='revision_requested' AND NOT d.allow_revision) THEN RAISE EXCEPTION 'Review the current submission'; END IF;
   UPDATE research_milestones SET state=p_action WHERE id=m.id;
 ELSE RAISE EXCEPTION 'Invalid action'; END IF;
 RETURN to_jsonb(f);
END;
$$;

-- Written questions and responses, before or after title approval.
CREATE OR REPLACE FUNCTION public.research_update_action(p_actor uuid, p_submission uuid, p_definition uuid, p_action text,
 p_answers jsonb DEFAULT NULL, p_update uuid DEFAULT NULL, p_remarks text DEFAULT NULL, p_staging boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s submissions; d research_milestone_definitions; m research_milestones; u research_updates;
BEGIN
 SELECT * INTO s FROM submissions WHERE id=p_submission FOR UPDATE;
 IF s.id IS NULL OR NOT research_scope(p_actor,s.id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO d FROM research_milestone_definitions WHERE id=p_definition;
 IF d.id IS NULL OR NOT d.enabled OR d.response_kind<>'text' OR d.target_submission_id IS DISTINCT FROM s.id OR (d.test_only AND NOT p_staging) THEN RAISE EXCEPTION 'Request unavailable'; END IF;
 SELECT * INTO m FROM research_milestones WHERE submission_id=s.id AND definition_id=d.id FOR UPDATE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Request not assigned'; END IF;
 IF p_action IN ('save','submit') THEN
  IF p_actor<>s.student_id THEN RAISE EXCEPTION 'Student ownership required'; END IF;
  IF p_action='submit' THEN
   SELECT * INTO u FROM research_updates WHERE id=p_update AND milestone_id=m.id;
   IF u.state='submitted' THEN RETURN u.id; END IF;
  END IF;
  IF d.deadline<now() AND NOT d.allow_late THEN RAISE EXCEPTION 'Deadline has passed. Ask the PG Director for an extension'; END IF;
  IF m.state NOT IN ('pending','revision_requested') OR (m.state='revision_requested' AND NOT d.allow_revision) THEN RAISE EXCEPTION 'Updates are locked until a revision is requested'; END IF;
  IF p_action='save' THEN
   IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Answers must be an object'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each(p_answers) a WHERE a.key !~ '^[0-9]+$' OR length(a.key)>2 OR jsonb_typeof(a.value)<>'string' OR length(a.value#>>'{}')>10000) THEN RAISE EXCEPTION 'Invalid answer'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_answers) k WHERE k::integer>=jsonb_array_length(d.questions)) THEN RAISE EXCEPTION 'Unknown question'; END IF;
   SELECT * INTO u FROM research_updates WHERE milestone_id=m.id AND state='draft';
   IF u.id IS NULL THEN
    INSERT INTO research_updates(milestone_id,student_id,version,answers)
    VALUES(m.id,p_actor,(SELECT coalesce(max(version),0)+1 FROM research_updates WHERE milestone_id=m.id),p_answers) RETURNING * INTO u;
   ELSE UPDATE research_updates SET answers=p_answers,updated_at=now() WHERE id=u.id RETURNING * INTO u; END IF;
   RETURN u.id;
  END IF;
  IF u.id IS NULL OR u.state<>'draft' THEN RAISE EXCEPTION 'Save your draft before submitting'; END IF;
  IF EXISTS(SELECT 1 FROM generate_series(0,jsonb_array_length(d.questions)-1) i WHERE nullif(trim(u.answers->>i::text),'') IS NULL) THEN RAISE EXCEPTION 'Answer every question before submitting'; END IF;
  UPDATE research_updates SET state='submitted',submitted_at=now(),deadline_at_submission=d.deadline,updated_at=now() WHERE id=u.id;
  UPDATE research_milestones SET state='submitted' WHERE id=m.id;
 ELSIF p_action IN ('accepted','revision_requested') THEN
  IF NOT research_scope(p_actor,s.id,d.reviewer_roles) THEN RAISE EXCEPTION 'Configured reviewer required'; END IF;
  SELECT * INTO u FROM research_updates WHERE id=p_update AND milestone_id=m.id AND state='submitted';
  IF u.id IS NULL THEN RAISE EXCEPTION 'Submitted update required'; END IF;
  IF m.state=p_action AND EXISTS(SELECT 1 FROM research_events WHERE update_id=u.id AND action=p_action) THEN RETURN u.id; END IF;
  IF m.state<>'submitted' OR u.id IS DISTINCT FROM (SELECT id FROM research_updates WHERE milestone_id=m.id AND state='submitted' ORDER BY version DESC LIMIT 1) THEN RAISE EXCEPTION 'Review the current submitted version'; END IF;
  IF p_action='revision_requested' AND (NOT d.allow_revision OR nullif(trim(p_remarks),'') IS NULL) THEN RAISE EXCEPTION 'Revision requires remarks and permission'; END IF;
  IF length(p_remarks)>4000 THEN RAISE EXCEPTION 'Remarks are too long'; END IF;
  UPDATE research_milestones SET state=p_action WHERE id=m.id;
 ELSE RAISE EXCEPTION 'Invalid action'; END IF;
 INSERT INTO research_events(milestone_id,update_id,actor_id,action,remarks) VALUES(m.id,u.id,p_actor,p_action,p_remarks);
 IF p_action='submit' THEN
  INSERT INTO notifications(user_id,title,message,type,link) SELECT p.id,'Research update submitted',d.name,'info','/research' FROM profiles p WHERE research_scope(p.id,s.id,d.reviewer_roles);
 ELSE
  INSERT INTO notifications(user_id,title,message,type,link) VALUES(s.student_id,'Research update reviewed',replace(p_action,'_',' ')||': '||coalesce(p_remarks,d.name),'info','/dashboard/track');
 END IF;
 RETURN u.id;
END;
$$;

-- PG Director may send a request on any registered student's title, at any review stage.
CREATE OR REPLACE FUNCTION public.publish_research_request(p_actor uuid,p_submission uuid,p_key uuid,p_name text,p_instructions text,
 p_questions jsonb,p_deadline timestamptz,p_kind text DEFAULT 'text',p_staging boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s submissions; student profiles; d research_milestone_definitions; event_id uuid;
BEGIN
 SELECT * INTO s FROM submissions WHERE id=p_submission FOR UPDATE;
 IF s.id IS NULL OR NOT research_scope(p_actor,s.id,array['pg_director','super_admin']) THEN RAISE EXCEPTION 'In-scope PG Director required'; END IF;
 SELECT * INTO d FROM research_milestone_definitions WHERE request_key=p_key;
 IF d.id IS NOT NULL THEN
  IF d.created_by=p_actor AND d.target_submission_id=s.id AND d.name=trim(p_name) AND d.instructions=coalesce(p_instructions,'') AND d.questions=p_questions AND d.deadline=p_deadline AND d.response_kind=p_kind THEN RETURN d.id; END IF;
  RAISE EXCEPTION 'Request key was already used for different content';
 END IF;
 IF p_key IS NULL OR nullif(trim(p_name),'') IS NULL OR length(p_name)>160 OR length(p_instructions)>4000 OR p_deadline IS NULL OR p_deadline<=now() OR p_kind NOT IN ('text','pptx') THEN RAISE EXCEPTION 'A name, future deadline and valid response format are required'; END IF;
 IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Questions must be an array'; END IF;
 IF p_kind='text' AND (jsonb_array_length(p_questions)<1 OR jsonb_array_length(p_questions)>10) THEN RAISE EXCEPTION 'Provide between 1 and 10 questions'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_questions) q WHERE jsonb_typeof(q)<>'string' OR length(trim(q#>>'{}'))=0 OR length(q#>>'{}')>500) THEN RAISE EXCEPTION 'Questions must be nonempty text of at most 500 characters'; END IF;
 SELECT * INTO student FROM profiles WHERE id=s.student_id;
 INSERT INTO research_milestone_definitions(name,institute_id,department_id,target_submission_id,instructions,questions,response_kind,deadline,reviewer_roles,enabled,test_only,require_finalized_title,created_by,request_key)
 VALUES(trim(p_name),student.institute_id,student.department_id,s.id,coalesce(p_instructions,''),p_questions,p_kind,p_deadline,array['pg_director','super_admin'],true,p_staging,false,p_actor,p_key) RETURNING * INTO d;
 INSERT INTO research_milestones(submission_id,definition_id) VALUES(s.id,d.id);
 INSERT INTO research_request_events(definition_id,actor_id,action,new_deadline) VALUES(d.id,p_actor,'published',d.deadline) RETURNING id INTO event_id;
 INSERT INTO notifications(user_id,title,message,type,link) VALUES(s.student_id,'Research update requested',d.name||' — respond by '||d.deadline::text,'info','/dashboard/track');
 INSERT INTO workflow_mail_outbox(event_id,actor_id,submission_id,recipient_id,subject,message)
 VALUES(event_id,p_actor,s.id,s.student_id,'Research update requested',d.name||E'\n'||d.instructions||E'\nDeadline: '||d.deadline::text);
 RETURN d.id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_research_request(uuid,uuid,uuid,text,text,jsonb,timestamptz,text,boolean),public.research_update_action(uuid,uuid,uuid,text,jsonb,uuid,text,boolean),public.research_action(uuid,uuid,uuid,text,uuid,text,integer,text,text,boolean) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_research_request(uuid,uuid,uuid,text,text,jsonb,timestamptz,text,boolean),public.research_update_action(uuid,uuid,uuid,text,jsonb,uuid,text,boolean),public.research_action(uuid,uuid,uuid,text,uuid,text,integer,text,text,boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
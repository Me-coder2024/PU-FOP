-- RPMS project model. Apply after all research migrations; test in staging first.
BEGIN;
CREATE TABLE public.research_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES profiles(id),
 cycle text NOT NULL DEFAULT 'initial', batch text NOT NULL DEFAULT '', semester text NOT NULL DEFAULT '',
 interest text NOT NULL DEFAULT '', self_reported_progress numeric CHECK(self_reported_progress BETWEEN 0 AND 100), self_initiated boolean, initiation_date date, expected_completion date,
 workflow_id uuid, on_hold boolean NOT NULL DEFAULT false, hold_reason text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(student_id,cycle)
);
CREATE TABLE public.research_workflow_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, version integer NOT NULL,
 created_by uuid NOT NULL REFERENCES profiles(id), definition jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(created_by,name,version)
);
ALTER TABLE research_projects ADD FOREIGN KEY(workflow_id) REFERENCES research_workflow_versions(id);
CREATE TABLE public.research_project_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES research_projects(id),
 workflow_id uuid NOT NULL REFERENCES research_workflow_versions(id), key text NOT NULL, name text NOT NULL, kind text NOT NULL,
 config jsonb NOT NULL, state text NOT NULL DEFAULT 'not_started' CHECK(state IN ('not_started','in_progress','submitted','under_review','changes_required','approved')),
 starts_at timestamptz NOT NULL, deadline timestamptz NOT NULL, submitted_at timestamptz, approved_at timestamptz,
 blocked boolean NOT NULL DEFAULT false, blocker text, active boolean NOT NULL DEFAULT true,
 occurrence integer NOT NULL DEFAULT 0, UNIQUE(project_id,workflow_id,key,occurrence)
);
CREATE TABLE public.research_task_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid NOT NULL REFERENCES research_project_tasks(id),version integer NOT NULL,
 answers jsonb NOT NULL DEFAULT '{}',submitted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(task_id,version)
);
CREATE UNIQUE INDEX research_task_one_draft ON research_task_responses(task_id) WHERE submitted_at IS NULL;
CREATE TABLE public.research_assessment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid NOT NULL REFERENCES research_project_tasks(id),number integer NOT NULL,
 questions jsonb NOT NULL,answers jsonb NOT NULL DEFAULT '{}',started_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 submitted_at timestamptz,score numeric,passed boolean,UNIQUE(task_id,number)
);
CREATE TABLE public.research_project_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid NOT NULL REFERENCES research_project_tasks(id),uploaded_by uuid NOT NULL REFERENCES profiles(id),
 filename text NOT NULL,size integer NOT NULL CHECK(size>0),path text NOT NULL UNIQUE,sealed_path text UNIQUE,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','verified','submitted')),
 created_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz
);
CREATE TABLE public.research_activity_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES research_projects(id),task_id uuid REFERENCES research_project_tasks(id),
 actor_id uuid REFERENCES profiles(id),action text NOT NULL,details jsonb NOT NULL DEFAULT '{}',internal boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.research_job_events (
 key text PRIMARY KEY, project_id uuid NOT NULL REFERENCES research_projects(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.research_question_bank (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_by uuid NOT NULL REFERENCES profiles(id),name text NOT NULL,category text NOT NULL,difficulty text NOT NULL,questions jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.research_reference_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES profiles(id),filename text NOT NULL,size integer NOT NULL CHECK(size BETWEEN 1 AND 26214400),
 path text NOT NULL UNIQUE,sealed_path text UNIQUE,state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','verified')),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.research_action_keys (
 actor_id uuid NOT NULL REFERENCES profiles(id),key uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,key)
);
CREATE INDEX ON research_project_tasks(project_id,active);
CREATE INDEX ON research_activity_logs(project_id,created_at);
CREATE INDEX ON research_task_responses(task_id);
CREATE INDEX ON research_assessment_attempts(task_id);
CREATE INDEX ON research_project_files(task_id);
ALTER TABLE submissions ADD COLUMN research_project_id uuid REFERENCES research_projects(id);
ALTER TABLE student_research_assignments ADD COLUMN research_project_id uuid REFERENCES research_projects(id);
CREATE FUNCTION public.rpms_enroll() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project uuid;
BEGIN
 IF NEW.role='student' THEN
  INSERT INTO research_projects(student_id) VALUES(NEW.id) ON CONFLICT(student_id,cycle) DO NOTHING RETURNING id INTO project;
  IF project IS NOT NULL THEN INSERT INTO research_activity_logs(project_id,action,details) VALUES(project,'project_created',jsonb_build_object('source','student_profile')); END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER rpms_student_onboard AFTER INSERT OR UPDATE OF role ON profiles FOR EACH ROW EXECUTE FUNCTION rpms_enroll();
INSERT INTO research_projects(student_id) SELECT id FROM profiles WHERE role='student' ON CONFLICT DO NOTHING;
INSERT INTO research_activity_logs(project_id,action,details) SELECT id,'legacy_project_linked','{"note":"Existing student linked; no historical progress credited"}' FROM research_projects;
UPDATE submissions s SET research_project_id=p.id FROM research_projects p WHERE p.student_id=s.student_id AND p.cycle='initial';
UPDATE student_research_assignments a SET research_project_id=p.id FROM research_projects p WHERE p.student_id=a.student_id AND p.cycle='initial';
CREATE FUNCTION public.rpms_link_project() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 SELECT id INTO NEW.research_project_id FROM research_projects WHERE student_id=NEW.student_id ORDER BY created_at DESC LIMIT 1;
 RETURN NEW;
END $$;
CREATE TRIGGER rpms_link_title BEFORE INSERT ON submissions FOR EACH ROW EXECUTE FUNCTION rpms_link_project();
CREATE TRIGGER rpms_link_request BEFORE INSERT ON student_research_assignments FOR EACH ROW EXECUTE FUNCTION rpms_link_project();
CREATE FUNCTION public.rpms_safe_config(c jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT (c-'questions')||jsonb_build_object('questions',coalesce((SELECT jsonb_agg(q-'correct'-'marks'-'penalty'-'explanation') FROM jsonb_array_elements(coalesce(c->'questions','[]')) q),'[]'))
$$;
CREATE FUNCTION public.rpms_scope(actor uuid,project uuid,manage boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT student_research_scope(actor,student_id,manage) FROM research_projects WHERE id=project),false)
$$;
CREATE FUNCTION public.rpms_unlocked(task uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(t.config->'dependencies') dep
 WHERE NOT EXISTS(SELECT 1 FROM research_project_tasks d WHERE d.project_id=t.project_id AND d.active AND d.key=dep AND d.state='approved'))
 FROM research_project_tasks t WHERE id=task),false)
$$;
CREATE FUNCTION public.rpms_reviewer(actor uuid,task uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM research_project_tasks t JOIN research_projects p ON p.id=t.project_id JOIN profiles a ON a.id=actor
 WHERE t.id=task AND a.id<>p.student_id AND rpms_scope(actor,p.id) AND (a.role::text=t.config->>'reviewer' OR a.role='super_admin'))
$$;
-- A title's authoritative status is retained; gating applies only to new titles.
-- Existing submitted titles may continue their academic review without retroactive locks.
CREATE FUNCTION public.rpms_title_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM research_project_tasks t JOIN research_projects p ON p.id=t.project_id WHERE p.student_id=NEW.student_id AND t.active AND t.kind='title' AND (NOT rpms_unlocked(t.id) OR p.on_hold)) THEN RAISE EXCEPTION 'Complete the configured research prerequisites before submitting a new title'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rpms_title_prerequisites BEFORE INSERT ON submissions FOR EACH ROW EXECUTE FUNCTION rpms_title_guard();
CREATE FUNCTION public.rpms_sync_title() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t research_project_tasks;
BEGIN
 IF NEW.status='finalized' THEN
  FOR t IN SELECT * FROM research_project_tasks WHERE project_id=NEW.research_project_id AND active AND kind='title' AND state<>'approved' LOOP
   UPDATE research_project_tasks SET state='approved',approved_at=coalesce(NEW.finalized_at,now()) WHERE id=t.id;
   INSERT INTO research_activity_logs(project_id,task_id,action,details) VALUES(t.project_id,t.id,'title_finalized',jsonb_build_object('submission',NEW.id));
  END LOOP;
 ELSIF TG_OP='UPDATE' AND OLD.status='finalized' THEN
  UPDATE research_project_tasks SET state='changes_required',approved_at=null WHERE project_id=NEW.research_project_id AND active AND kind='title';
  INSERT INTO research_activity_logs(project_id,action,details) VALUES(NEW.research_project_id,'title_approval_reopened',jsonb_build_object('submission',NEW.id,'status',NEW.status));
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER rpms_title_sync AFTER INSERT OR UPDATE OF status ON submissions FOR EACH ROW EXECUTE FUNCTION rpms_sync_title();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['research_projects','research_workflow_versions','research_project_tasks','research_task_responses','research_assessment_attempts','research_project_files','research_activity_logs','research_job_events','research_action_keys','research_question_bank','research_reference_files'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM public,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
 END LOOP;
END $$;
CREATE FUNCTION public.rpms_private(actor uuid,task uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN rpms_scope(actor,t.project_id) THEN jsonb_build_object('task',to_jsonb(t),'attempt',(SELECT to_jsonb(a) FROM research_assessment_attempts a WHERE task_id=t.id ORDER BY number DESC LIMIT 1),'responses',(SELECT coalesce(jsonb_agg(to_jsonb(u)),'[]') FROM research_task_responses u WHERE task_id=t.id),'files',(SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') FROM research_project_files f WHERE task_id=t.id)) ELSE NULL END FROM research_project_tasks t WHERE id=task
$$;
CREATE FUNCTION public.rpms_reference(actor uuid,action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f research_reference_files;
BEGIN
 IF action='reserve' THEN
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor AND role IN ('pg_director','super_admin')) THEN RAISE EXCEPTION 'PG Director required'; END IF;
  IF (SELECT count(*) FROM research_reference_files WHERE owner_id=actor AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'Reference upload rate limit'; END IF;
  INSERT INTO research_reference_files(owner_id,filename,size,path) VALUES(actor,p->>'filename',(p->>'size')::int,'references/'||actor||'/'||gen_random_uuid()) RETURNING * INTO f;
 ELSE
  SELECT * INTO f FROM research_reference_files WHERE id=(p->>'referenceId')::uuid FOR UPDATE;
  IF f.id IS NULL OR NOT (f.owner_id=actor OR (action='get' AND f.state='verified' AND EXISTS(SELECT 1 FROM research_project_tasks WHERE config->>'referenceId'=f.id::text AND rpms_scope(actor,project_id)))) THEN RAISE EXCEPTION 'Reference unavailable'; END IF;
  IF action='confirm' THEN
   IF f.owner_id<>actor OR f.state<>'reserved' OR nullif(p->>'sealedPath','') IS NULL THEN RAISE EXCEPTION 'Reference verification required'; END IF;
   UPDATE research_reference_files SET sealed_path=p->>'sealedPath',state='verified' WHERE id=f.id RETURNING * INTO f;
  ELSIF action<>'get' THEN RAISE EXCEPTION 'Invalid reference action'; END IF;
 END IF;
 RETURN to_jsonb(f);
END $$;
CREATE FUNCTION public.rpms_grade(questions jsonb,answers jsonb) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE q jsonb; selected jsonb; expected jsonb; earned numeric=0; total numeric=0;
BEGIN
 FOR q IN SELECT value FROM jsonb_array_elements(questions) LOOP
  total=total+(q->>'marks')::numeric;
  IF jsonb_typeof(answers->(q->>'id'))='array' THEN selected=answers->(q->>'id');
  ELSIF coalesce(answers->>(q->>'id'),'')<>'' THEN selected=jsonb_build_array(answers->>(q->>'id'));
  ELSE selected='[]'; END IF;
  IF jsonb_array_length(selected)=0 THEN CONTINUE; END IF;
  SELECT jsonb_agg(value ORDER BY value) INTO selected FROM jsonb_array_elements(selected);
  SELECT jsonb_agg(value ORDER BY value) INTO expected FROM jsonb_array_elements(q->'correct');
  IF selected=expected THEN earned=earned+(q->>'marks')::numeric; ELSE earned=earned-coalesce((q->>'penalty')::numeric,0); END IF;
 END LOOP;
 RETURN CASE WHEN total>0 THEN round(100*greatest(0,earned)/total,2) ELSE 0 END;
END $$;
CREATE FUNCTION public.rpms_replay(actor uuid,action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE previous research_action_keys;
BEGIN
 SELECT * INTO previous FROM research_action_keys WHERE actor_id=actor AND key=(p->>'requestKey')::uuid;
 IF previous.key IS NULL THEN RETURN null; END IF;
 IF previous.payload->>'action'=action AND ((previous.payload->'p')-'score'-'sealedPath')=(p-'score'-'sealedPath') THEN RETURN previous.result; END IF;
 RAISE EXCEPTION 'Request key already used for different content';
END $$;
CREATE FUNCTION public.rpms_action(actor uuid,action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a profiles; proj research_projects; t research_project_tasks; w research_workflow_versions; item jsonb; student uuid;
 u research_task_responses; attempt research_assessment_attempts; file research_project_files; result jsonb; previous research_action_keys;
 original_payload jsonb=p; target uuid; num integer; event_name text; details jsonb; k uuid; other research_project_tasks;
BEGIN
 SELECT * INTO a FROM profiles WHERE id=actor FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Profile required'; END IF;
 k=(p->>'requestKey')::uuid;
 IF k IS NULL THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
 SELECT * INTO previous FROM research_action_keys WHERE actor_id=actor AND key=k;
 IF previous.key IS NOT NULL THEN
  IF previous.payload->>'action'=action AND ((previous.payload->'p')-'score'-'sealedPath')=(p-'score'-'sealedPath') THEN RETURN previous.result; END IF;
  RAISE EXCEPTION 'Request key already used';
 END IF;
 IF (SELECT count(*) FROM research_action_keys WHERE actor_id=actor AND created_at>now()-interval '1 minute')>=120 THEN RAISE EXCEPTION 'Too many actions. Wait a minute'; END IF;
 IF action='bank_publish' THEN
  IF a.role NOT IN ('pg_director','super_admin') THEN RAISE EXCEPTION 'PG Director required'; END IF;
  INSERT INTO research_question_bank(created_by,name,category,difficulty,questions) VALUES(actor,p->>'name',p->>'category',p->>'difficulty',p->'questions') RETURNING id INTO target;
  result=jsonb_build_object('id',target);
 ELSIF action='publish' THEN
  IF a.role NOT IN ('pg_director','super_admin') THEN RAISE EXCEPTION 'PG Director required'; END IF;
  -- HTTP layer validates full schema/acyclic graph before this service-only call.
  IF jsonb_typeof(p->'definition'->'tasks') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'definition'->'tasks') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Workflow activities required'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'definition'->'tasks') ref_item WHERE ref_item ? 'referenceId' AND NOT EXISTS(SELECT 1 FROM research_reference_files WHERE id=(ref_item->>'referenceId')::uuid AND owner_id=actor AND state='verified')) THEN RAISE EXCEPTION 'Use your verified reference templates'; END IF;
  INSERT INTO research_workflow_versions(name,version,created_by,definition)
  VALUES(p->>'name',(SELECT coalesce(max(version),0)+1 FROM research_workflow_versions WHERE created_by=actor AND name=p->>'name'),actor,p->'definition') RETURNING * INTO w;
  result=jsonb_build_object('id',w.id);
 ELSIF action='announce' THEN
  IF a.role NOT IN ('pg_director','super_admin') OR nullif(trim(p->>'reason'),'') IS NULL OR jsonb_array_length(p->'students') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Manager, recipients and announcement required'; END IF;
  FOR student IN SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(p->'students') LOOP
   IF NOT student_research_scope(actor,student,true) THEN RAISE EXCEPTION 'Student outside your scope'; END IF;
   SELECT * INTO proj FROM research_projects WHERE student_id=student AND cycle='initial';
   INSERT INTO notifications(user_id,title,message,type,link) VALUES(student,'PG Director research announcement',p->>'reason','info','/dashboard/track');
   INSERT INTO research_activity_logs(project_id,actor_id,action,details) VALUES(proj.id,actor,'announcement',jsonb_build_object('reason',p->>'reason'));
  END LOOP;
  result=jsonb_build_object('sent',jsonb_array_length(p->'students'));
 ELSIF action='assign' THEN
  SELECT * INTO w FROM research_workflow_versions WHERE id=(p->>'workflowId')::uuid;
  IF w.id IS NULL OR (w.created_by<>actor AND a.role<>'super_admin') THEN RAISE EXCEPTION 'Choose your own published workflow'; END IF;
  IF jsonb_array_length(p->'students') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Choose 1–1000 students'; END IF;
  FOR student IN SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(p->'students') LOOP
   IF NOT student_research_scope(actor,student,true) THEN RAISE EXCEPTION 'Student outside your scope'; END IF;
   SELECT * INTO proj FROM research_projects WHERE student_id=student AND cycle='initial' FOR UPDATE;
   IF proj.id IS NULL THEN RAISE EXCEPTION 'Student research project missing'; END IF;
   IF proj.workflow_id=w.id THEN CONTINUE; END IF;
   IF proj.workflow_id IS NOT NULL AND nullif(trim(p->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Workflow migration requires a reason; old records will be archived, not overwritten'; END IF;
   UPDATE research_project_tasks SET active=false WHERE project_id=proj.id AND active;
   UPDATE research_projects SET workflow_id=w.id WHERE id=proj.id;
   FOR item IN SELECT value FROM jsonb_array_elements(w.definition->'tasks') LOOP
    INSERT INTO research_project_tasks(project_id,workflow_id,key,name,kind,config,starts_at,deadline)
    VALUES(proj.id,w.id,item->>'key',item->>'name',item->>'kind',item,now()+make_interval(days=>coalesce((item->>'startDay')::int,0)),now()+make_interval(days=>(item->>'dueDay')::int)) RETURNING * INTO t;
    -- Only authoritative finalized title evidence can give credit, never pre-title stages.
    IF t.kind='title' AND EXISTS(SELECT 1 FROM submissions WHERE research_project_id=proj.id AND status='finalized') THEN
     UPDATE research_project_tasks SET state='approved',approved_at=(SELECT max(finalized_at) FROM submissions WHERE research_project_id=proj.id AND status='finalized') WHERE id=t.id;
    END IF;
   END LOOP;
   INSERT INTO research_activity_logs(project_id,actor_id,action,details) VALUES(proj.id,actor,'workflow_assigned',jsonb_build_object('from',proj.workflow_id,'to',w.id,'reason',p->>'reason'));
   INSERT INTO notifications(user_id,title,message,type,link) VALUES(student,'Research workflow assigned',w.name,'info','/dashboard/track');
  END LOOP;
  result=jsonb_build_object('id',w.id);
 ELSE
  IF p ? 'taskId' THEN
   SELECT * INTO t FROM research_project_tasks WHERE id=(p->>'taskId')::uuid;
   SELECT * INTO proj FROM research_projects WHERE id=t.project_id FOR UPDATE;
   SELECT * INTO t FROM research_project_tasks WHERE id=t.id FOR UPDATE;
  ELSE SELECT * INTO proj FROM research_projects WHERE id=(p->>'projectId')::uuid FOR UPDATE; END IF;
  IF proj.id IS NULL OR NOT rpms_scope(actor,proj.id) THEN RAISE EXCEPTION 'Research project unavailable'; END IF;
  IF p ? 'taskId' AND (t.id IS NULL OR NOT t.active) THEN RAISE EXCEPTION 'Activity is archived or unavailable'; END IF;
  details=jsonb_build_object('reason',p->>'reason');event_name=action;
  IF action='add_task' THEN
   IF NOT rpms_scope(actor,proj.id,true) OR proj.workflow_id IS NULL THEN RAISE EXCEPTION 'Manager and assigned workflow required'; END IF;
   SELECT * INTO w FROM research_workflow_versions WHERE id=(p->>'workflowId')::uuid;
   IF w.id IS NULL OR (w.created_by<>actor AND a.role<>'super_admin') THEN RAISE EXCEPTION 'Use your own published activity template'; END IF;
   SELECT value INTO item FROM jsonb_array_elements(w.definition->'tasks') WHERE value->>'key'=p->>'activityKey';
   IF item IS NULL OR item->>'kind' IN ('title','final_review') THEN RAISE EXCEPTION 'Choose a non-title, non-final activity'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'dependencies') dep WHERE NOT EXISTS(SELECT 1 FROM research_project_tasks WHERE project_id=proj.id AND active AND key=dep)) THEN RAISE EXCEPTION 'Activity prerequisites do not exist in this project'; END IF;
   item=jsonb_set(item,'{key}',to_jsonb('followup_'||replace(gen_random_uuid()::text,'-','')));
   INSERT INTO research_project_tasks(project_id,workflow_id,key,name,kind,config,starts_at,deadline)
   VALUES(proj.id,proj.workflow_id,item->>'key',item->>'name',item->>'kind',item,now()+make_interval(days=>(item->>'startDay')::int),now()+make_interval(days=>(item->>'dueDay')::int)) RETURNING * INTO t;
   INSERT INTO notifications(user_id,title,message,type,link) VALUES(proj.student_id,'Research follow-up assigned',t.name,'info','/dashboard/track');
   details=jsonb_build_object('sourceWorkflow',w.id,'activityKey',p->>'activityKey');
  ELSIF action='self_report' THEN
   IF actor<>proj.student_id OR (p->>'percent')::numeric NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Owner and valid self-assessment required'; END IF;
   UPDATE research_projects SET self_reported_progress=(p->>'percent')::numeric,self_initiated=(p->>'initiated')::boolean WHERE id=proj.id;
   details=jsonb_build_object('previous',proj.self_reported_progress,'percent',p->'percent','initiated',p->'initiated');
  ELSIF action='metadata' THEN
   IF NOT rpms_scope(actor,proj.id,true) THEN RAISE EXCEPTION 'PG Director required'; END IF;
   UPDATE research_projects SET batch=coalesce(p->>'batch',''),semester=coalesce(p->>'semester',''),interest=coalesce(p->>'interest',''),initiation_date=nullif(p->>'initiationDate','')::date,expected_completion=nullif(p->>'expectedCompletion','')::date WHERE id=proj.id;
   details=jsonb_build_object('previous',to_jsonb(proj),'new',p-'requestKey');
  ELSIF action='hold' THEN
   IF NOT rpms_scope(actor,proj.id,true) OR nullif(trim(p->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'PG Director and reason required'; END IF;
   UPDATE research_projects SET on_hold=(p->>'onHold')::boolean,hold_reason=p->>'reason' WHERE id=proj.id;
   details=details||jsonb_build_object('onHold',(p->>'onHold')::boolean);
  ELSIF action IN ('comment','escalate','meeting') THEN
   IF nullif(trim(p->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Enter a note'; END IF;
   IF coalesce((p->>'internal')::boolean,false) AND a.role='student' THEN RAISE EXCEPTION 'Students cannot create internal notes'; END IF;
   IF action='escalate' THEN
    IF NOT rpms_scope(actor,proj.id,true) THEN RAISE EXCEPTION 'PG Director required'; END IF;
    INSERT INTO notifications(user_id,title,message,type,link) SELECT x.id,'Research concern escalated',p->>'reason','warning','/research' FROM profiles x WHERE x.role='dean' AND student_research_scope(x.id,proj.student_id);
   END IF;
  ELSIF action='extend' THEN
   IF NOT rpms_scope(actor,proj.id,true) OR nullif(trim(p->>'reason'),'') IS NULL OR (p->>'deadline')::timestamptz<=greatest(now(),t.deadline) THEN RAISE EXCEPTION 'Choose a later deadline and explain why'; END IF;
   UPDATE research_project_tasks SET deadline=(p->>'deadline')::timestamptz WHERE id=t.id;
   details=details||jsonb_build_object('old',t.deadline,'new',p->>'deadline');
  ELSIF action='block' THEN
   IF actor<>proj.student_id AND NOT rpms_scope(actor,proj.id,true) THEN RAISE EXCEPTION 'Owner or manager required'; END IF;
   IF (p->>'blocked')::boolean AND nullif(trim(p->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Explain the blocker'; END IF;
   UPDATE research_project_tasks SET blocked=(p->>'blocked')::boolean,blocker=p->>'reason' WHERE id=t.id;
   details=details||jsonb_build_object('blocked',(p->>'blocked')::boolean);
  ELSIF action IN ('review','reopen') THEN
   IF NOT rpms_reviewer(actor,t.id) THEN RAISE EXCEPTION 'Configured academic reviewer required'; END IF;
   IF t.kind='title' OR t.kind='assessment' THEN RAISE EXCEPTION 'This activity derives approval from its authoritative workflow'; END IF;
   IF nullif(trim(p->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Review remarks required'; END IF;
   IF action='reopen' THEN
    IF t.state<>'approved' THEN RAISE EXCEPTION 'Only approved activities can be reopened'; END IF;
    UPDATE research_project_tasks SET state='changes_required',approved_at=null WHERE id=t.id;
   ELSE
    IF t.state NOT IN ('submitted','under_review') OR (p->>'expectedSubmittedAt')::timestamptz IS DISTINCT FROM t.submitted_at THEN RAISE EXCEPTION 'Review the current submitted version'; END IF;
    IF p->>'state' NOT IN ('under_review','changes_required','approved') THEN RAISE EXCEPTION 'Invalid review'; END IF;
    IF p->>'state'='approved' AND t.config ? 'criteria' THEN
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(t.config->'criteria') c WHERE jsonb_typeof(p->'scores'->(c->>'label')) IS DISTINCT FROM 'number') THEN RAISE EXCEPTION 'Complete every evaluation criterion'; END IF;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(t.config->'criteria') c WHERE (p->'scores'->>(c->>'label'))::numeric NOT BETWEEN 0 AND (c->>'max')::numeric) THEN RAISE EXCEPTION 'Evaluation score outside configured range'; END IF;
    END IF;
    IF p->>'state'='approved' AND (NOT rpms_unlocked(t.id) OR proj.on_hold OR t.blocked) THEN RAISE EXCEPTION 'Resolve prerequisites, hold and blockers first'; END IF;
    IF t.kind='final_review' AND p->>'state'='approved' AND EXISTS(SELECT 1 FROM research_project_tasks WHERE project_id=proj.id AND active AND id<>t.id AND coalesce((config->>'mandatory')::boolean,false) AND state<>'approved') THEN RAISE EXCEPTION 'All mandatory requirements must be approved first'; END IF;
    UPDATE research_project_tasks SET state=p->>'state',approved_at=CASE WHEN p->>'state'='approved' THEN now() ELSE null END WHERE id=t.id;
   END IF;
   details=details||jsonb_build_object('scores',p->'scores','previous',t.state,'state',CASE WHEN action='reopen' THEN 'changes_required' ELSE p->>'state' END);
   INSERT INTO notifications(user_id,title,message,type,link) VALUES(proj.student_id,'Research activity reviewed',t.name||': '||(p->>'reason'),'info','/dashboard/track');
  ELSE
   IF actor<>proj.student_id THEN RAISE EXCEPTION 'Student ownership required'; END IF;
   IF proj.on_hold OR NOT rpms_unlocked(t.id) OR now()<t.starts_at THEN RAISE EXCEPTION 'Activity locked: check prerequisites, start date or project hold'; END IF;
   IF t.kind='title' THEN RAISE EXCEPTION 'Use the existing title submission form'; END IF;
   IF action NOT IN ('attempt_save','attempt_submit') AND now()>t.deadline THEN RAISE EXCEPTION 'Deadline passed; ask the PG Director for an extension'; END IF;
   IF t.state NOT IN ('not_started','in_progress','changes_required') THEN RAISE EXCEPTION 'Work is locked pending review or revision'; END IF;
   IF action='start' THEN UPDATE research_project_tasks SET state='in_progress' WHERE id=t.id;
   ELSIF action='attempt_start' THEN
    IF t.kind<>'assessment' THEN RAISE EXCEPTION 'Assessment required'; END IF;
    SELECT * INTO attempt FROM research_assessment_attempts WHERE task_id=t.id AND submitted_at IS NULL ORDER BY number DESC LIMIT 1;
    IF attempt.id IS NOT NULL AND attempt.expires_at>now() THEN result=jsonb_build_object('id',attempt.id);
    ELSE
     IF attempt.id IS NOT NULL THEN UPDATE research_assessment_attempts SET submitted_at=expires_at,score=0,passed=false WHERE id=attempt.id; END IF;
     SELECT coalesce(max(number),0)+1 INTO num FROM research_assessment_attempts WHERE task_id=t.id;
     IF num>(t.config->>'attempts')::int THEN RAISE EXCEPTION 'Attempt limit reached'; END IF;
     INSERT INTO research_assessment_attempts(task_id,number,questions,expires_at)
     VALUES(t.id,num,(SELECT jsonb_agg(q||jsonb_build_object('options',(SELECT jsonb_agg(opt ORDER BY random()) FROM jsonb_array_elements(q->'options') opt)) ORDER BY random()) FROM (SELECT value AS q FROM jsonb_array_elements(t.config->'questions') ORDER BY random() LIMIT coalesce((t.config->>'questionCount')::int,jsonb_array_length(t.config->'questions'))) pool),least(t.deadline,now()+make_interval(mins=>(t.config->>'durationMinutes')::int))) RETURNING * INTO attempt;
     result=jsonb_build_object('id',attempt.id);
    END IF;
    UPDATE research_project_tasks SET state='in_progress' WHERE id=t.id;
   ELSIF action IN ('attempt_save','attempt_submit') THEN
    SELECT * INTO attempt FROM research_assessment_attempts WHERE id=(p->>'attemptId')::uuid AND task_id=t.id FOR UPDATE;
    IF attempt.id IS NULL OR attempt.submitted_at IS NOT NULL OR attempt.expires_at<now() OR t.deadline<now() THEN RAISE EXCEPTION 'Attempt expired or already submitted'; END IF;
    UPDATE research_assessment_attempts SET answers=p->'answers' WHERE id=attempt.id;
    IF action='attempt_submit' THEN
     p=jsonb_set(p,'{score}',to_jsonb(rpms_grade(attempt.questions,p->'answers')));
     UPDATE research_assessment_attempts SET score=(p->>'score')::numeric,passed=(p->>'score')::numeric>=(t.config->>'passPercent')::numeric,submitted_at=now() WHERE id=attempt.id;
     IF (p->>'score')::numeric>=(t.config->>'passPercent')::numeric THEN UPDATE research_project_tasks SET state='approved',approved_at=now() WHERE id=t.id; END IF;
    END IF;
    details=jsonb_build_object('attempt',attempt.id);result=jsonb_build_object('id',attempt.id);
   ELSIF action='reserve' THEN
    IF (t.kind NOT IN ('document','pptx') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t.config->'questions') q WHERE q->>'type'='file')) OR (p->>'size')::int<1 OR (p->>'size')::int>(t.config->>'maxBytes')::int THEN RAISE EXCEPTION 'Invalid file size or activity'; END IF;
    target=gen_random_uuid();
    INSERT INTO research_project_files(id,task_id,uploaded_by,filename,size,path) VALUES(target,t.id,actor,p->>'filename',(p->>'size')::int,'rpms/'||proj.id||'/'||t.id||'/'||target) RETURNING * INTO file;
    result=jsonb_build_object('id',file.id,'path',file.path);
   ELSIF action='confirm' THEN
    SELECT * INTO file FROM research_project_files WHERE id=(p->>'fileId')::uuid AND task_id=t.id AND uploaded_by=actor FOR UPDATE;
    IF file.id IS NULL OR file.state<>'reserved' OR nullif(p->>'sealedPath','') IS NULL THEN RAISE EXCEPTION 'File verification required'; END IF;
    UPDATE research_project_files SET state='verified',sealed_path=p->>'sealedPath' WHERE id=file.id;
   ELSIF action IN ('save','submit') THEN
    IF t.kind='assessment' THEN RAISE EXCEPTION 'Use an assessment attempt'; END IF;
    IF action='save' THEN
     SELECT * INTO u FROM research_task_responses WHERE task_id=t.id AND submitted_at IS NULL;
     IF u.id IS NULL THEN INSERT INTO research_task_responses(task_id,version,answers) VALUES(t.id,(SELECT coalesce(max(version),0)+1 FROM research_task_responses WHERE task_id=t.id),p->'answers') RETURNING * INTO u;
     ELSE UPDATE research_task_responses SET answers=p->'answers' WHERE id=u.id RETURNING * INTO u; END IF;
     UPDATE research_project_tasks SET state='in_progress' WHERE id=t.id;
    ELSE
     SELECT * INTO u FROM research_task_responses WHERE id=(p->>'responseId')::uuid AND task_id=t.id AND submitted_at IS NULL FOR UPDATE;
     IF u.id IS NULL THEN RAISE EXCEPTION 'Save a draft first'; END IF;
     IF t.kind IN ('document','pptx') THEN
      SELECT * INTO file FROM research_project_files WHERE id=(p->>'fileId')::uuid AND task_id=t.id AND state='verified' FOR UPDATE;
      IF file.id IS NULL THEN RAISE EXCEPTION 'Choose a verified file'; END IF;
      UPDATE research_project_files SET state='submitted',submitted_at=now() WHERE id=file.id;
     END IF;
     FOR item IN SELECT value FROM jsonb_array_elements(t.config->'questions') WHERE value->>'type'='file' LOOP
      IF nullif(u.answers->>(item->>'id'),'') IS NOT NULL THEN
       SELECT * INTO file FROM research_project_files WHERE id=(u.answers->>(item->>'id'))::uuid AND task_id=t.id AND state IN ('verified','submitted') FOR UPDATE;
       IF file.id IS NULL THEN RAISE EXCEPTION 'File question requires verified evidence from this activity'; END IF;
       UPDATE research_project_files SET state='submitted',submitted_at=coalesce(submitted_at,now()) WHERE id=file.id;
      END IF;
     END LOOP;
     UPDATE research_task_responses SET submitted_at=now() WHERE id=u.id;
     UPDATE research_project_tasks SET state='submitted',submitted_at=now() WHERE id=t.id;
     INSERT INTO notifications(user_id,title,message,type,link) SELECT id,'Research activity submitted',t.name,'info','/research' FROM profiles WHERE rpms_reviewer(id,t.id);
    END IF;
    result=jsonb_build_object('id',u.id);
   ELSE RAISE EXCEPTION 'Unsupported action'; END IF;
  END IF;
  IF action NOT IN ('save','attempt_save') THEN INSERT INTO research_activity_logs(project_id,task_id,actor_id,action,details,internal) VALUES(proj.id,t.id,actor,event_name,coalesce(details,'{}'),coalesce((p->>'internal')::boolean,false) AND a.role<>'student' AND action IN ('comment','meeting','escalate')); END IF;
 END IF;
 result=coalesce(result,jsonb_build_object('id',coalesce(t.id,proj.id)));
 INSERT INTO research_action_keys(actor_id,key,payload,result) VALUES(actor,k,jsonb_build_object('action',action,'p',original_payload),result);
 RETURN result;
END $$;
CREATE FUNCTION public.rpms_verified(task uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t research_project_tasks; dep text; depid uuid;
BEGIN
 SELECT * INTO t FROM research_project_tasks WHERE id=task;
 IF t.id IS NULL OR t.state<>'approved' OR NOT t.active THEN RETURN false; END IF;
 FOR dep IN SELECT value FROM jsonb_array_elements_text(t.config->'dependencies') LOOP
  SELECT id INTO depid FROM research_project_tasks WHERE project_id=t.project_id AND active AND key=dep ORDER BY occurrence LIMIT 1;
  IF depid IS NULL OR NOT rpms_verified(depid) THEN RETURN false; END IF;
 END LOOP;RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.rpms_unlocked(task uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(t.config->'dependencies') dep
 WHERE NOT EXISTS(SELECT 1 FROM research_project_tasks d WHERE d.project_id=t.project_id AND d.active AND d.key=dep AND rpms_verified(d.id)))
 FROM research_project_tasks t WHERE id=task),false)
$$;
CREATE FUNCTION public.rpms_project_summary(project uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p research_projects; cfg jsonb; total numeric; earned numeric; planned numeric; submitted numeric; complete boolean; delayed boolean; risk boolean; started boolean; health text; reasons jsonb='[]';
BEGIN
 SELECT * INTO p FROM research_projects WHERE id=project;
 SELECT definition INTO cfg FROM research_workflow_versions WHERE id=p.workflow_id;
 SELECT sum((config->>'weight')::numeric),sum(CASE WHEN rpms_verified(id) THEN (config->>'weight')::numeric ELSE 0 END),coalesce(bool_or(state<>'not_started' AND kind<>'title'),false)
 INTO total,earned,started FROM research_project_tasks WHERE project_id=p.id AND active;
 SELECT coalesce(sum(CASE WHEN deadline<=now() THEN (config->>'weight')::numeric ELSE 0 END),0),coalesce(sum(CASE WHEN state IN ('submitted','under_review','approved') THEN (config->>'weight')::numeric ELSE 0 END),0) INTO planned,submitted FROM research_project_tasks WHERE project_id=p.id AND active;
 complete=p.workflow_id IS NOT NULL AND EXISTS(SELECT 1 FROM research_project_tasks WHERE project_id=p.id AND active AND kind='final_review' AND rpms_verified(id)) AND NOT EXISTS(SELECT 1 FROM research_project_tasks WHERE project_id=p.id AND active AND (config->>'mandatory')::boolean AND NOT rpms_verified(id));
 SELECT EXISTS(SELECT 1 FROM research_project_tasks WHERE project_id=p.id AND active AND state IN ('not_started','in_progress','changes_required') AND deadline<now() AND rpms_unlocked(id)) INTO delayed;
 SELECT EXISTS(SELECT 1 FROM research_project_tasks WHERE project_id=p.id AND active AND (blocked OR (state IN ('submitted','under_review') AND submitted_at<now()-make_interval(days=>coalesce((cfg->>'reviewDays')::int,7))) OR (state IN ('not_started','in_progress','changes_required') AND deadline<now()+make_interval(days=>coalesce((cfg->>'warningDays')::int,3))))) INTO risk;
 IF EXISTS(SELECT 1 FROM research_project_tasks WHERE project_id=p.id AND active AND state IN ('not_started','in_progress','changes_required') AND deadline<now() AND NOT rpms_unlocked(id)) THEN reasons=reasons||'"A deadline is overdue while prerequisites are unresolved"'::jsonb; END IF;
 IF delayed THEN reasons=reasons||'"Student work is overdue"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM research_project_tasks WHERE project_id=p.id AND active AND blocked) THEN reasons=reasons||'"An unresolved blocker needs attention"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM research_project_tasks WHERE project_id=p.id AND active AND state IN ('submitted','under_review') AND submitted_at<now()-make_interval(days=>coalesce((cfg->>'reviewDays')::int,7))) THEN reasons=reasons||'"Faculty review is overdue"'::jsonb; END IF;
 IF p.on_hold THEN health='on_hold';reasons=reasons||jsonb_build_array(p.hold_reason);
 ELSIF complete THEN health='completed'; ELSIF delayed THEN health='delayed'; ELSIF risk THEN health='at_risk'; ELSIF NOT started THEN health='not_initiated'; ELSE health='on_track'; END IF;
 RETURN jsonb_build_object('planned_progress',CASE WHEN total>0 THEN round(100*planned/total,2) ELSE null END,'submitted_progress',CASE WHEN total>0 THEN round(100*submitted/total,2) ELSE null END,'progress',CASE WHEN total>0 THEN round(100*earned/total,2) ELSE null END,'health',health,'health_reasons',reasons,'completed',coalesce(complete,false));
END $$;
CREATE FUNCTION public.rpms_snapshot(actor uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
 'role',(SELECT role::text FROM profiles WHERE id=actor),
 'canManage',coalesce((SELECT role IN ('pg_director','super_admin') FROM profiles WHERE id=actor),false),
 'projects',(SELECT coalesce(jsonb_agg(to_jsonb(p)||rpms_project_summary(p.id)||jsonb_build_object('name',s.full_name,'enrollment',s.university_id,'institute',i.name,'department',d.name,'guide',g.full_name) ORDER BY s.full_name),'[]') FROM research_projects p JOIN profiles s ON s.id=p.student_id LEFT JOIN institutes i ON i.id=s.institute_id LEFT JOIN departments d ON d.id=s.department_id LEFT JOIN profiles g ON g.id=s.guide_id WHERE rpms_scope(actor,p.id)),
 'banks',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY created_at DESC),'[]') FROM research_question_bank b WHERE created_by=actor OR EXISTS(SELECT 1 FROM profiles WHERE id=actor AND role='super_admin')),
 'workflows',(SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.created_at DESC),'[]') FROM research_workflow_versions w WHERE w.created_by=actor OR EXISTS(SELECT 1 FROM profiles WHERE id=actor AND role='super_admin')),
 'tasks',(SELECT coalesce(jsonb_agg((to_jsonb(t)-'config')||jsonb_build_object(
 'config',CASE WHEN t.kind='assessment' THEN jsonb_set(rpms_safe_config(t.config),'{questions}','[]') ELSE rpms_safe_config(t.config) END,'dependencies',t.config->'dependencies',
 'locked',NOT rpms_unlocked(t.id) OR p.on_hold OR t.starts_at>now(),
 'lock_reason',CASE WHEN p.on_hold THEN 'Project is on hold' WHEN t.starts_at>now() THEN 'Activity has not opened yet' WHEN NOT rpms_unlocked(t.id) THEN 'Waiting for verified prerequisites' ELSE null END,
 'responses',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY version DESC),'[]') FROM research_task_responses u WHERE task_id=t.id AND (submitted_at IS NOT NULL OR p.student_id=actor)),
 'files',(SELECT coalesce(jsonb_agg(to_jsonb(f)-'path'-'sealed_path' ORDER BY created_at DESC),'[]') FROM research_project_files f WHERE task_id=t.id AND (state='submitted' OR p.student_id=actor)),
 'attempts',(SELECT coalesce(jsonb_agg((to_jsonb(a)-'questions'-'score'-'passed'-'answers')||jsonb_build_object(
 'questions',CASE WHEN p.student_id=actor THEN rpms_safe_config(jsonb_build_object('questions',a.questions))->'questions' ELSE '[]'::jsonb END,
 'answers',CASE WHEN a.submitted_at IS NOT NULL OR p.student_id=actor THEN a.answers ELSE '{}'::jsonb END,
 'score',CASE WHEN p.student_id<>actor OR (a.submitted_at IS NOT NULL AND (t.config->>'release'='immediate' OR (t.config->>'release'='after_close' AND now()>t.deadline))) THEN a.score ELSE null END,
 'passed',CASE WHEN p.student_id<>actor OR (a.submitted_at IS NOT NULL AND (t.config->>'release'='immediate' OR (t.config->>'release'='after_close' AND now()>t.deadline))) THEN a.passed ELSE null END,
 'feedback',CASE WHEN a.submitted_at IS NOT NULL AND (t.config->>'release'='immediate' OR (t.config->>'release'='after_close' AND now()>t.deadline)) THEN a.questions ELSE '[]'::jsonb END
 ) ORDER BY number DESC),'[]') FROM research_assessment_attempts a WHERE task_id=t.id AND (a.submitted_at IS NOT NULL OR p.student_id=actor))
 ) ORDER BY t.starts_at),'[]') FROM research_project_tasks t JOIN research_projects p ON p.id=t.project_id WHERE rpms_scope(actor,p.id)),
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('actor_name',a.full_name) ORDER BY e.created_at DESC),'[]') FROM research_activity_logs e LEFT JOIN profiles a ON a.id=e.actor_id WHERE rpms_scope(actor,e.project_id) AND (NOT e.internal OR EXISTS(SELECT 1 FROM profiles WHERE id=actor AND role<>'student'))),
 'legacy',jsonb_build_object(
 'titles',(SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('history',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at),'[]') FROM title_review_events e WHERE e.submission_id=s.id))),'[]') FROM submissions s WHERE rpms_scope(actor,s.research_project_id)),
 'requests',(SELECT coalesce(jsonb_agg(jsonb_build_object('project_id',a.research_project_id,'assignment',to_jsonb(a),'request',to_jsonb(r)-'audience','history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.created_at),'[]') FROM student_research_history h WHERE h.assignment_id=a.id),'responses',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY version DESC),'[]') FROM student_research_responses u WHERE assignment_id=a.id AND (submitted_at IS NOT NULL OR a.student_id=actor)))),'[]') FROM student_research_assignments a JOIN student_research_requests r ON r.id=a.request_id WHERE rpms_scope(actor,a.research_project_id)),
 'presentations',(SELECT coalesce(jsonb_agg(jsonb_build_object('project_id',s.research_project_id,'milestone',to_jsonb(m),'definition',to_jsonb(d),'files',(SELECT coalesce(jsonb_agg(to_jsonb(f)-'object_path'-'sealed_path'),'[]') FROM research_files f WHERE milestone_id=m.id AND (state='submitted' OR s.student_id=actor)))),'[]') FROM research_milestones m JOIN submissions s ON s.id=m.submission_id JOIN research_milestone_definitions d ON d.id=m.definition_id WHERE rpms_scope(actor,s.research_project_id))
 ))
$$;
CREATE FUNCTION public.rpms_jobs() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t research_project_tasks; p research_projects; cfg jsonb; num integer; job text; added integer; count_done integer=0; occurrence_due timestamptz;
BEGIN
 IF NOT pg_try_advisory_xact_lock(724119) THEN RETURN 0; END IF;
 -- Explicit deadlines close unfinished attempts; no expired work earns progress.
 UPDATE research_assessment_attempts SET submitted_at=expires_at,score=0,passed=false WHERE submitted_at IS NULL AND expires_at<now();
 FOR t IN SELECT * FROM research_project_tasks WHERE active LOOP
  SELECT * INTO p FROM research_projects WHERE id=t.project_id;
  IF p.on_hold THEN CONTINUE; END IF;
  SELECT definition INTO cfg FROM research_workflow_versions WHERE id=t.workflow_id;
  IF t.occurrence=0 AND t.config ? 'repeatDays' THEN
   FOR num IN 1..least(51,coalesce((t.config->>'maxOccurrences')::int,1)-1) LOOP
    occurrence_due=t.starts_at+make_interval(days=>num*(t.config->>'repeatDays')::int);
    IF occurrence_due>now() THEN EXIT; END IF;
    INSERT INTO research_project_tasks(project_id,workflow_id,key,name,kind,config,starts_at,deadline,occurrence)
    VALUES(t.project_id,t.workflow_id,t.key,t.name||' · check-in '||(num+1),t.kind,t.config,occurrence_due,t.deadline+make_interval(days=>num*(t.config->>'repeatDays')::int),num) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS added=ROW_COUNT;
    IF added=1 THEN
     INSERT INTO notifications(user_id,title,message,type,link) VALUES(p.student_id,'Research check-in due',t.name,'info','/dashboard/track');
     INSERT INTO research_activity_logs(project_id,action,details) VALUES(p.id,'check_in_created',jsonb_build_object('activity',t.key,'occurrence',num));
     count_done=count_done+1;
    END IF;
   END LOOP;
  END IF;
  job=null;
  IF t.state IN ('not_started','in_progress','changes_required') AND rpms_unlocked(t.id) THEN
   IF t.deadline<now()-make_interval(days=>(cfg->>'escalateDays')::int) THEN job='escalation';
   ELSIF t.deadline<now() THEN job='overdue';
   ELSIF t.deadline<now()+make_interval(days=>(cfg->>'warningDays')::int) THEN job='upcoming'; END IF;
  ELSIF t.state IN ('submitted','under_review') AND t.submitted_at<now()-make_interval(days=>(cfg->>'reviewDays')::int) THEN job='review_delay'; END IF;
  IF job IS NOT NULL THEN
   INSERT INTO research_job_events(key,project_id) VALUES(t.id||':'||job||':'||t.deadline::text,p.id) ON CONFLICT DO NOTHING;
   GET DIAGNOSTICS added=ROW_COUNT;
   IF added=1 THEN
    INSERT INTO notifications(user_id,title,message,type,link)
    SELECT x.id,'Research: '||replace(job,'_',' '),t.name,'info',CASE WHEN x.role='student' THEN '/dashboard/track' ELSE '/research' END FROM profiles x
    WHERE rpms_scope(x.id,p.id) AND x.role::text IN (SELECT jsonb_array_elements_text(coalesce(cfg->'notifications'->job,
     CASE job WHEN 'upcoming' THEN '["student"]'::jsonb WHEN 'overdue' THEN '["student","guide","pg_director"]'::jsonb WHEN 'review_delay' THEN jsonb_build_array(t.config->>'reviewer') ELSE '["pg_director","dean"]'::jsonb END)));
    INSERT INTO research_activity_logs(project_id,task_id,action,details,internal) VALUES(p.id,t.id,'scheduled_'||job,jsonb_build_object('deadline',t.deadline),job IN ('review_delay','escalation'));
    count_done=count_done+1;
   END IF;
  END IF;
 END LOOP;
 RETURN count_done;
END $$;
-- Private bucket for general project evidence. Legacy PPT storage remains intact.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('research-evidence','research-evidence',false,26214400,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation']) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='research-evidence' AND public) THEN RAISE EXCEPTION 'research-evidence must be private'; END IF; END $$;
CREATE POLICY rpms_storage_read ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(bucket_id<>'research-evidence');
CREATE POLICY rpms_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(bucket_id<>'research-evidence');
CREATE POLICY rpms_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id<>'research-evidence') WITH CHECK(bucket_id<>'research-evidence');
CREATE POLICY rpms_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id<>'research-evidence');
REVOKE ALL ON FUNCTION rpms_replay(uuid,text,jsonb),rpms_reference(uuid,text,jsonb),rpms_grade(jsonb,jsonb),rpms_scope(uuid,uuid,boolean),rpms_unlocked(uuid),rpms_verified(uuid),rpms_reviewer(uuid,uuid),rpms_private(uuid,uuid),rpms_action(uuid,text,jsonb),rpms_snapshot(uuid),rpms_jobs(),rpms_project_summary(uuid),rpms_safe_config(jsonb),rpms_enroll(),rpms_link_project(),rpms_title_guard(),rpms_sync_title() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION rpms_replay(uuid,text,jsonb),rpms_reference(uuid,text,jsonb),rpms_private(uuid,uuid),rpms_action(uuid,text,jsonb),rpms_snapshot(uuid),rpms_jobs() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

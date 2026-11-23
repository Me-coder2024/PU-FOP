-- Apply after migration_workflow_mail_outbox.sql. No remote changes are automatic.
begin;
alter table public.research_milestone_definitions
 add column target_submission_id uuid references public.submissions(id),
 add column instructions text not null default '',
 add column questions jsonb not null default '[]'::jsonb,
 add column response_kind text not null default 'pptx' check(response_kind in ('text','pptx')),
 add column created_by uuid references public.profiles(id),
 add column created_at timestamptz not null default now(),
 add column request_key uuid unique;
create table public.research_updates (
 id uuid primary key default gen_random_uuid(), milestone_id uuid not null references public.research_milestones(id),
 student_id uuid not null references public.profiles(id), version integer not null,
 answers jsonb not null default '{}'::jsonb, state text not null default 'draft' check(state in ('draft','submitted')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 submitted_at timestamptz, deadline_at_submission timestamptz,
 unique(milestone_id,version)
);
create unique index one_research_draft on public.research_updates(milestone_id) where state='draft';
alter table public.research_events add column update_id uuid references public.research_updates(id);
create table public.research_request_events (
 id uuid primary key default gen_random_uuid(), definition_id uuid not null references public.research_milestone_definitions(id),
 actor_id uuid not null references public.profiles(id), action text not null,
 old_deadline timestamptz, new_deadline timestamptz, remarks text, created_at timestamptz not null default now()
);
alter table public.research_updates enable row level security;
alter table public.research_request_events enable row level security;
create policy research_updates_read on public.research_updates for select to authenticated using (
 exists(select 1 from research_milestones m where m.id=milestone_id and research_scope(auth.uid(),m.submission_id))
 and (state='submitted' or student_id=auth.uid())
);
create policy research_request_events_read on public.research_request_events for select to authenticated using (
 exists(select 1 from research_milestone_definitions d where d.id=definition_id and research_scope(auth.uid(),d.target_submission_id))
);
-- Do not disclose one student's questions through the generic definition table.
create policy targeted_definitions_read on public.research_milestone_definitions as restrictive for select to authenticated using (
 target_submission_id is null or research_scope(auth.uid(),target_submission_id)
);
revoke all on public.research_updates,public.research_request_events from anon,authenticated;
grant select on public.research_updates,public.research_request_events to authenticated;
grant all on public.research_updates,public.research_request_events to service_role;

create function public.publish_research_request(p_actor uuid,p_submission uuid,p_key uuid,p_name text,p_instructions text,
 p_questions jsonb,p_deadline timestamptz,p_kind text default 'text',p_staging boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare s submissions; student profiles; d research_milestone_definitions; event_id uuid;
begin
 select * into s from submissions where id=p_submission for update;
 if s.id is null or not research_scope(p_actor,s.id,array['pg_director','super_admin']) then raise exception 'In-scope PG Director required'; end if;
 select * into d from research_milestone_definitions where request_key=p_key;
 if d.id is not null then
  if d.created_by=p_actor and d.target_submission_id=s.id and d.name=trim(p_name) and d.instructions=coalesce(p_instructions,'') and d.questions=p_questions and d.deadline=p_deadline and d.response_kind=p_kind then return d.id; end if;
  raise exception 'Request key was already used for different content';
 end if;
  if p_key is null or nullif(trim(p_name),'') is null or length(p_name)>160 or length(p_instructions)>4000 or p_deadline is null or p_deadline<=now() or p_kind not in ('text','pptx') then raise exception 'A name, future deadline and valid response format are required'; end if;
 if jsonb_typeof(p_questions) is distinct from 'array' then raise exception 'Questions must be an array'; end if;
 if p_kind='text' and (jsonb_array_length(p_questions)<1 or jsonb_array_length(p_questions)>10) then raise exception 'Provide between 1 and 10 questions'; end if;
 if exists(select 1 from jsonb_array_elements(p_questions) q where jsonb_typeof(q)<>'string' or length(trim(q#>>'{}'))=0 or length(q#>>'{}')>500) then raise exception 'Questions must be nonempty text of at most 500 characters'; end if;
 select * into student from profiles where id=s.student_id;
 insert into research_milestone_definitions(name,institute_id,department_id,target_submission_id,instructions,questions,response_kind,deadline,reviewer_roles,enabled,test_only,created_by,request_key)
 values(trim(p_name),student.institute_id,student.department_id,s.id,coalesce(p_instructions,''),p_questions,p_kind,p_deadline,array['pg_director','super_admin'],true,p_staging,p_actor,p_key) returning * into d;
 insert into research_milestones(submission_id,definition_id) values(s.id,d.id);
 insert into research_request_events(definition_id,actor_id,action,new_deadline) values(d.id,p_actor,'published',d.deadline) returning id into event_id;
 insert into notifications(user_id,title,message,type,link) values(s.student_id,'Research update requested',d.name||' — respond by '||d.deadline::text,'info','/dashboard/track');
 insert into workflow_mail_outbox(event_id,actor_id,submission_id,recipient_id,subject,message)
 values(event_id,p_actor,s.id,s.student_id,'Research update requested',d.name||E'\n'||d.instructions||E'\nDeadline: '||d.deadline::text);
 return d.id;
end;
$$;

create function public.extend_research_deadline(p_actor uuid,p_definition uuid,p_deadline timestamptz,p_remarks text)
returns void language plpgsql security definer set search_path=public as $$
declare d research_milestone_definitions; s submissions; event_id uuid;
begin
 select * into d from research_milestone_definitions where id=p_definition for update;
 if d.target_submission_id is null or not research_scope(p_actor,d.target_submission_id,array['pg_director','super_admin']) then raise exception 'In-scope PG Director required'; end if;
 if d.deadline=p_deadline then return; end if;
 if p_deadline is null or p_deadline<=now() or p_deadline<=d.deadline or nullif(trim(p_remarks),'') is null or length(p_remarks)>4000 then raise exception 'Choose a later future deadline and give a reason'; end if;
 select * into s from submissions where id=d.target_submission_id;
 update research_milestone_definitions set deadline=p_deadline where id=d.id;
 insert into research_request_events(definition_id,actor_id,action,old_deadline,new_deadline,remarks)
 values(d.id,p_actor,'deadline_extended',d.deadline,p_deadline,p_remarks) returning id into event_id;
 insert into notifications(user_id,title,message,type,link) values(s.student_id,'Research deadline extended',d.name||' — new deadline: '||p_deadline::text||'. '||p_remarks,'info','/dashboard/track');
 insert into workflow_mail_outbox(event_id,actor_id,submission_id,recipient_id,subject,message)
 values(event_id,p_actor,s.id,s.student_id,'Research deadline extended',d.name||' — '||p_deadline::text||'. '||p_remarks);
end;
$$;

create function public.research_update_action(p_actor uuid,p_submission uuid,p_definition uuid,p_action text,
 p_answers jsonb default null,p_update uuid default null,p_remarks text default null,p_staging boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare s submissions; d research_milestone_definitions; m research_milestones; u research_updates;
begin
 select * into s from submissions where id=p_submission for update;
 if s.id is null or not research_scope(p_actor,s.id) then raise exception 'Not authorized'; end if;
 select * into d from research_milestone_definitions where id=p_definition;
 if d.id is null or not d.enabled or d.response_kind<>'text' or d.target_submission_id is distinct from s.id or (d.test_only and not p_staging) then raise exception 'Request unavailable'; end if;
 select * into m from research_milestones where submission_id=s.id and definition_id=d.id for update;
 if m.id is null then raise exception 'Request not assigned'; end if;
 if p_action in ('save','submit') then
  if p_actor<>s.student_id then raise exception 'Student ownership required'; end if;
  if p_action='submit' then
   select * into u from research_updates where id=p_update and milestone_id=m.id;
   if u.state='submitted' then return u.id; end if;
  end if;
    if d.deadline<now() and not d.allow_late then raise exception 'Deadline has passed. Ask the PG Director for an extension'; end if;
  if m.state not in ('pending','revision_requested') or (m.state='revision_requested' and not d.allow_revision) then raise exception 'Updates are locked until a revision is requested'; end if;
  if p_action='save' then
   if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'Answers must be an object'; end if;
   if exists(select 1 from jsonb_each(p_answers) a where a.key !~ '^[0-9]+$' or length(a.key)>2 or jsonb_typeof(a.value)<>'string' or length(a.value#>>'{}')>10000) then raise exception 'Invalid answer'; end if;
   if exists(select 1 from jsonb_object_keys(p_answers) k where k::integer>=jsonb_array_length(d.questions)) then raise exception 'Unknown question'; end if;
   select * into u from research_updates where milestone_id=m.id and state='draft';
   if u.id is null then
    insert into research_updates(milestone_id,student_id,version,answers)
    values(m.id,p_actor,(select coalesce(max(version),0)+1 from research_updates where milestone_id=m.id),p_answers) returning * into u;
   else update research_updates set answers=p_answers,updated_at=now() where id=u.id returning * into u; end if;
   return u.id;
  end if;
  if u.id is null or u.state<>'draft' then raise exception 'Save your draft before submitting'; end if;
  if exists(select 1 from generate_series(0,jsonb_array_length(d.questions)-1) i where nullif(trim(u.answers->>i::text),'') is null) then raise exception 'Answer every question before submitting'; end if;
  update research_updates set state='submitted',submitted_at=now(),deadline_at_submission=d.deadline,updated_at=now() where id=u.id;
  update research_milestones set state='submitted' where id=m.id;
 elsif p_action in ('accepted','revision_requested') then
  if not research_scope(p_actor,s.id,d.reviewer_roles) then raise exception 'Configured reviewer required'; end if;
  select * into u from research_updates where id=p_update and milestone_id=m.id and state='submitted';
  if u.id is null then raise exception 'Submitted update required'; end if;
  if m.state=p_action and exists(select 1 from research_events where update_id=u.id and action=p_action) then return u.id; end if;
  if m.state<>'submitted' or u.id is distinct from (select id from research_updates where milestone_id=m.id and state='submitted' order by version desc limit 1) then raise exception 'Review the current submitted version'; end if;
  if p_action='revision_requested' and (not d.allow_revision or nullif(trim(p_remarks),'') is null) then raise exception 'Revision requires remarks and permission'; end if;
  if length(p_remarks)>4000 then raise exception 'Remarks are too long'; end if;
  update research_milestones set state=p_action where id=m.id;
 else raise exception 'Invalid action'; end if;
 insert into research_events(milestone_id,update_id,actor_id,action,remarks) values(m.id,u.id,p_actor,p_action,p_remarks);
 if p_action='submit' then
  insert into notifications(user_id,title,message,type,link) select p.id,'Research update submitted',d.name,'info','/research' from profiles p where research_scope(p.id,s.id,d.reviewer_roles);
 else
  insert into notifications(user_id,title,message,type,link) values(s.student_id,'Research update reviewed',replace(p_action,'_',' ')||': '||coalesce(p_remarks,d.name),'info','/dashboard/track');
 end if;
 return u.id;
end;
$$;

-- The original PPT transaction is kept, but now also checks response format/target.
alter function public.research_action(uuid,uuid,uuid,text,uuid,text,integer,text,text,boolean) rename to research_file_action;
revoke all on function public.research_file_action(uuid,uuid,uuid,text,uuid,text,integer,text,text,boolean) from service_role;
create function public.research_action(p_actor uuid,p_submission uuid,p_definition uuid,p_action text,
 p_file uuid default null,p_filename text default null,p_size integer default null,p_remarks text default null,p_sealed_path text default null,p_staging boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from research_milestone_definitions where id=p_definition and response_kind='pptx' and (target_submission_id is null or target_submission_id=p_submission)) then raise exception 'Presentation request unavailable'; end if;
 return research_file_action(p_actor,p_submission,p_definition,p_action,p_file,p_filename,p_size,p_remarks,p_sealed_path,p_staging);
end;
$$;
revoke all on function public.publish_research_request(uuid,uuid,uuid,text,text,jsonb,timestamptz,text,boolean),public.extend_research_deadline(uuid,uuid,timestamptz,text),public.research_update_action(uuid,uuid,uuid,text,jsonb,uuid,text,boolean),public.research_action(uuid,uuid,uuid,text,uuid,text,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.publish_research_request(uuid,uuid,uuid,text,text,jsonb,timestamptz,text,boolean),public.extend_research_deadline(uuid,uuid,timestamptz,text),public.research_update_action(uuid,uuid,uuid,text,jsonb,uuid,text,boolean),public.research_action(uuid,uuid,uuid,text,uuid,text,integer,text,text,boolean) to service_role;

create or replace function public.research_snapshot() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'submission',to_jsonb(s),
 'studentName',student.full_name, 'universityId',student.university_id,
 'definitions',(select coalesce(jsonb_agg(to_jsonb(d) order by d.position),'[]') from research_milestone_definitions d where d.enabled and (d.target_submission_id is null or d.target_submission_id=s.id) and (d.institute_id is null or d.institute_id=student.institute_id) and (d.department_id is null or d.department_id=student.department_id)),
 'milestones',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from research_milestones m where m.submission_id=s.id),
 'files',(select coalesce(jsonb_agg(to_jsonb(f)-'object_path'-'sealed_path' order by f.created_at desc),'[]') from research_files f join research_milestones m on m.id=f.milestone_id where m.submission_id=s.id),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]') from research_events e join research_milestones m on m.id=e.milestone_id where m.submission_id=s.id),
 'updates',(select coalesce(jsonb_agg(to_jsonb(u) order by u.version desc),'[]') from research_updates u join research_milestones m on m.id=u.milestone_id where m.submission_id=s.id and (u.state='submitted' or s.student_id=auth.uid())),
 'requestEvents',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]') from research_request_events e join research_milestone_definitions d on d.id=e.definition_id where d.target_submission_id=s.id),
 'isOwner',s.student_id=auth.uid(),
 'reviewerRole',(select role::text from profiles where id=auth.uid())
 ) order by s.created_at desc),'[]') from submissions s join profiles student on student.id=s.student_id
 where public.research_scope(auth.uid(),s.id);
$$;
revoke all on function public.research_snapshot() from public,anon;
grant execute on function public.research_snapshot() to authenticated;

commit;

-- PU-FOP research tracking: fresh installation bundle. Run ONCE.
-- If earlier research migrations are installed, run ONLY missing migrations.
-- Requires dynamic-form columns; coordinate with the matching app release.
-- Changes title/profile write policies: older deployed code may stop writing.
-- All migrations below share one transaction.
BEGIN;

-- SOURCE: migration_research_progress.sql
-- Apply after migration_dynamic_forms.sql in STAGING first. Additive; no backfill of history.
create table public.research_milestone_definitions (
 id uuid primary key default gen_random_uuid(), name text not null,
 institute_id uuid references public.institutes(id), department_id uuid references public.departments(id),
 position integer not null default 0, deadline timestamptz,
 unlock_after uuid references public.research_milestone_definitions(id),
 require_finalized_title boolean not null default false,
 reviewer_roles text[] not null default array['guide'],
 allow_revision boolean not null default true, allow_late boolean not null default false,
 enabled boolean not null default false, test_only boolean not null default true,
 max_bytes integer not null default 26214400 check (max_bytes between 1 and 52428800),
 check (reviewer_roles <@ array['guide','hod','pg_director','dean','super_admin']::text[]),
 check (unlock_after is distinct from id)
);
create table public.research_milestones (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.submissions(id),
 definition_id uuid not null references public.research_milestone_definitions(id),
 state text not null default 'pending' check (state in ('pending','submitted','revision_requested','accepted')),
 unique(submission_id, definition_id)
);
create table public.research_files (
 id uuid primary key default gen_random_uuid(), milestone_id uuid not null references public.research_milestones(id),
 uploaded_by uuid not null references public.profiles(id), filename text not null,
 size_bytes integer not null check(size_bytes > 0), object_path text not null unique,
 sealed_path text unique, state text not null default 'uploading' check (state in ('uploading','draft','submitted')),
 created_at timestamptz not null default now(), submitted_at timestamptz
);
create table public.research_events (
 id uuid primary key default gen_random_uuid(), milestone_id uuid not null references public.research_milestones(id),
 file_id uuid references public.research_files(id), actor_id uuid not null references public.profiles(id),
 action text not null, remarks text, created_at timestamptz not null default now()
);
create index on public.research_events(milestone_id, created_at);
create index on public.research_files(milestone_id, created_at);
create index on public.research_milestones(submission_id);

-- Strict profile-derived scope. Null institute/department never means global staff access.
-- Explicit primary roles are used; email grants do not implicitly broaden research permissions.
create function public.research_scope(p_actor uuid, p_submission uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path = public as $$
 select exists(select 1 from submissions s join profiles student on student.id=s.student_id
 join profiles actor on actor.id=p_actor where s.id=p_submission and (
  (p_roles is null and actor.id=s.student_id) or
  ((p_roles is null or actor.role::text=any(p_roles)) and (
    actor.role='super_admin' or
    (actor.institute_id=student.institute_id and (
      (actor.role='guide' and s.guide_id=actor.id and actor.department_id=student.department_id) or
      (actor.role='hod' and actor.department_id=student.department_id) or
      actor.role in ('pg_director','dean')
    ))
  ))
 ));
$$;
revoke all on function public.research_scope(uuid,uuid,text[]) from public, anon;
grant execute on function public.research_scope(uuid,uuid,text[]) to authenticated, service_role;
alter table public.research_milestone_definitions enable row level security;
alter table public.research_milestones enable row level security;
alter table public.research_files enable row level security;
alter table public.research_events enable row level security;
create policy research_definitions_read on public.research_milestone_definitions for select to authenticated using (enabled);
create policy research_milestones_read on public.research_milestones for select to authenticated using (public.research_scope(auth.uid(),submission_id));
create policy research_files_read on public.research_files for select to authenticated using (exists(select 1 from research_milestones m where m.id=milestone_id and public.research_scope(auth.uid(),m.submission_id)));
create policy research_events_read on public.research_events for select to authenticated using (exists(select 1 from research_milestones m where m.id=milestone_id and public.research_scope(auth.uid(),m.submission_id)));
-- All writes go through the server-only transaction below. No browser table write grants.
revoke insert, update, delete on public.research_milestone_definitions,public.research_milestones,public.research_files,public.research_events from anon, authenticated;
grant select on public.research_milestone_definitions,public.research_milestones,public.research_files,public.research_events to authenticated;
grant all on public.research_milestone_definitions,public.research_milestones,public.research_files,public.research_events to service_role;

create function public.research_snapshot() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'submission',to_jsonb(s),
 'definitions',(select coalesce(jsonb_agg(to_jsonb(d) order by d.position),'[]') from research_milestone_definitions d where d.enabled and (d.institute_id is null or d.institute_id=student.institute_id) and (d.department_id is null or d.department_id=student.department_id)),
 'milestones',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from research_milestones m where m.submission_id=s.id),
 'files',(select coalesce(jsonb_agg(to_jsonb(f)-'object_path'-'sealed_path' order by f.created_at desc),'[]') from research_files f join research_milestones m on m.id=f.milestone_id where m.submission_id=s.id),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]') from research_events e join research_milestones m on m.id=e.milestone_id where m.submission_id=s.id),
 'isOwner',s.student_id=auth.uid(),
 'reviewerRole',(select role::text from profiles where id=auth.uid())
 ) order by s.created_at desc),'[]') from submissions s join profiles student on student.id=s.student_id
 where public.research_scope(auth.uid(),s.id);
$$;
revoke all on function public.research_snapshot() from public,anon;
grant execute on function public.research_snapshot() to authenticated;

-- p_actor is obtained from getUser() by our server, never from request JSON.
-- Row locks serialize competing submissions/reviews; events + notifications commit atomically.
create function public.research_action(p_actor uuid, p_submission uuid, p_definition uuid, p_action text,
 p_file uuid default null, p_filename text default null, p_size integer default null,
 p_remarks text default null, p_sealed_path text default null, p_staging boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s submissions; student profiles; d research_milestone_definitions; m research_milestones; f research_files; result_id uuid;
begin
 select * into s from submissions where id=p_submission for update;
 if s.id is null or not public.research_scope(p_actor,s.id) then raise exception 'Not authorized'; end if;
 select * into student from profiles where id=s.student_id;
 select * into d from research_milestone_definitions where id=p_definition;
 if d.id is null or not d.enabled or (d.test_only and not p_staging) or
 (d.institute_id is not null and d.institute_id is distinct from student.institute_id) or
 (d.department_id is not null and d.department_id is distinct from student.department_id) then raise exception 'Milestone unavailable'; end if;
 insert into research_milestones(submission_id,definition_id) values(s.id,d.id) on conflict do nothing;
 select * into m from research_milestones where submission_id=s.id and definition_id=d.id for update;
 if p_action in ('reserve','confirm','submit') then
   if p_actor<>s.student_id then raise exception 'Student ownership required'; end if;
      if s.status in ('guide_rejected','hod_rejected') then raise exception 'Title was rejected'; end if;
   if d.deadline is not null and now()>d.deadline and not d.allow_late then raise exception 'Milestone deadline has passed'; end if;
   if d.unlock_after is not null and not exists(select 1 from research_milestones where submission_id=s.id and definition_id=d.unlock_after and state='accepted') then raise exception 'Previous milestone must be accepted'; end if;
 end if;
 if p_action='reserve' then
   if m.state not in ('pending','revision_requested') or (m.state='revision_requested' and not d.allow_revision) then raise exception 'New versions are locked'; end if;
   if p_filename is null or length(p_filename)>180 or p_filename !~* '\.pptx$' or p_size is null or p_size<1 or p_size>d.max_bytes then raise exception 'Invalid filename or size'; end if;
   result_id:=gen_random_uuid();
   insert into research_files(id,milestone_id,uploaded_by,filename,size_bytes,object_path)
   values(result_id,m.id,p_actor,p_filename,p_size,p_actor::text||'/'||m.id::text||'/'||result_id::text||'.pptx') returning * into f;
   return to_jsonb(f);
 end if;
 select * into f from research_files where id=p_file and milestone_id=m.id for update;
 if f.id is null then raise exception 'File not found'; end if;
 if p_action='confirm' then
   if f.state in ('draft','submitted') then return to_jsonb(f); end if;
   if m.state not in ('pending','revision_requested') then raise exception 'Draft is locked'; end if;
   if p_sealed_path is null or p_sealed_path<>('verified/'||f.id::text||'.pptx') then raise exception 'Verified file required'; end if;
   update research_files set state='draft',sealed_path=p_sealed_path where id=f.id returning * into f;
 elsif p_action='submit' then
   if f.state='submitted' then return to_jsonb(f); end if;
   if f.state<>'draft' or f.sealed_path is null then raise exception 'Upload must be verified first'; end if;
   if m.state not in ('pending','revision_requested') or (m.state='revision_requested' and not d.allow_revision) then raise exception 'Submission is locked'; end if;
   -- Only drafts uploaded after the most recent review may be used for a revision.
   if m.state='revision_requested' and f.created_at <= (select max(created_at) from research_events where milestone_id=m.id and action='revision_requested') then raise exception 'Upload a new revision'; end if;
   update research_files set state='submitted',submitted_at=now() where id=f.id returning * into f;
   update research_milestones set state='submitted' where id=m.id;
 elsif p_action in ('accepted','revision_requested') then
   if not public.research_scope(p_actor,s.id,d.reviewer_roles) then raise exception 'Reviewer permission required'; end if;
   if m.state=p_action and exists(select 1 from research_events where milestone_id=m.id and file_id=f.id and action=p_action) then return to_jsonb(f); end if;
   if m.state<>'submitted' or f.state<>'submitted' or f.id is distinct from (select id from research_files where milestone_id=m.id and state='submitted' order by submitted_at desc limit 1) then raise exception 'Review the current submitted version'; end if;
   if p_action='revision_requested' and (not d.allow_revision or nullif(trim(p_remarks),'') is null) then raise exception 'Revision requires permission and remarks'; end if;
   update research_milestones set state=p_action where id=m.id;
 else raise exception 'Invalid action'; end if;
 insert into research_events(milestone_id,file_id,actor_id,action,remarks) values(m.id,f.id,p_actor,p_action,left(p_remarks,4000));
 if p_action in ('accepted','revision_requested') then
   insert into notifications(user_id,title,message,type,link) values(s.student_id,d.name,p_action||coalesce(': '||p_remarks,''),'info','/dashboard/track');
 elsif p_action='submit' then
   insert into notifications(user_id,title,message,type,link)
   select p.id,d.name,'A PowerPoint version is ready for review.','info','/research'
   from profiles p where public.research_scope(p.id,s.id,d.reviewer_roles);
 end if;
 return to_jsonb(f);
end;
$$;
revoke all on function public.research_action(uuid,uuid,uuid,text,uuid,text,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.research_action(uuid,uuid,uuid,text,uuid,text,integer,text,text,boolean) to service_role;

-- Private Supabase Storage (S3-backed). Browser has no generic object read/write policy.
-- Signed draft uploads are scoped to a unique object. Verified copies never get upload tokens.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('research-presentations','research-presentations',false,52428800,array['application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict(id) do nothing;
do $$ begin
 if exists(select 1 from storage.buckets where id='research-presentations' and public) then
  raise exception 'research-presentations already exists as a public bucket. Make it private before applying this migration.';
 end if;
end $$;
-- Restrictive guards override any broad permissive object policies in an existing project.
-- Service-created signed capabilities still work; ordinary anon/authenticated access cannot.
create policy research_storage_private_read on storage.objects as restrictive for select to anon,authenticated using (bucket_id <> 'research-presentations');
create policy research_storage_private_insert on storage.objects as restrictive for insert to anon,authenticated with check (bucket_id <> 'research-presentations');
create policy research_storage_private_update on storage.objects as restrictive for update to anon,authenticated using (bucket_id <> 'research-presentations') with check (bucket_id <> 'research-presentations');
create policy research_storage_private_delete on storage.objects as restrictive for delete to anon,authenticated using (bucket_id <> 'research-presentations');
-- No sample definition is enabled automatically.
insert into research_milestone_definitions(name,position,test_only,enabled)
values('TEST — Research presentation',1,true,false);

-- SOURCE: migration_title_workflow.sql
-- Apply after migration_research_progress.sql. Session-derived server writes only.
alter table public.submissions add column if not exists finalized_at timestamptz;
create table public.title_review_events (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.submissions(id),
 actor_id uuid not null references public.profiles(id), action text not null, remarks text,
 created_at timestamptz not null default now()
);
alter table public.title_review_events enable row level security;
create policy title_events_read on public.title_review_events for select to authenticated using (research_scope(auth.uid(),submission_id));
revoke insert,update,delete on public.title_review_events from authenticated,anon;
grant select on public.title_review_events to authenticated;
grant all on public.title_review_events to service_role;
create policy submissions_scoped_read on public.submissions as restrictive for select to authenticated using (research_scope(auth.uid(),id));
-- Profile identity/scope cannot be changed through an ordinary browser update.
create function public.protect_profile_scope() returns trigger language plpgsql set search_path=public as $$
begin
 if current_user='authenticated' and (new.role is distinct from old.role or new.id is distinct from old.id or new.email is distinct from old.email or new.institute_id is distinct from old.institute_id or new.department_id is distinct from old.department_id or new.guide_id is distinct from old.guide_id) then
  raise exception 'Profile role and assignment require an authorized server workflow';
 end if;
 return new;
end;
$$;
create trigger protect_profile_scope before update on public.profiles for each row execute function public.protect_profile_scope();
-- Restrictive policies preserve existing read policies while requiring server-validated writes.
create policy submissions_server_insert on public.submissions as restrictive for insert to authenticated with check(false);
create policy submissions_server_update on public.submissions as restrictive for update to authenticated using(false) with check(false);
create policy submissions_server_delete on public.submissions as restrictive for delete to authenticated using(false);

create function public.title_action(p_actor uuid,p_action text,p_submission uuid default null,p_title text default null,
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
  if not exists(select 1 from profiles g where g.id=actor.guide_id and g.role='guide' and g.institute_id=actor.institute_id and g.department_id=actor.department_id) then raise exception 'Assigned guide is out of scope'; end if;
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
 insert into notifications(user_id,title,message,type,link) values(s.student_id,'Title workflow updated',replace(p_action,'_',' ')||coalesce(': '||p_remarks,''),'info','/dashboard/track');
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

-- SOURCE: migration_workflow_mail_outbox.sql
-- Apply after title workflow. Durable mail intent; no email is sent by this SQL.
create table public.workflow_mail_outbox (
 id uuid primary key default gen_random_uuid(), event_id uuid not null, actor_id uuid not null references public.profiles(id),
 submission_id uuid not null references public.submissions(id), recipient_id uuid not null references public.profiles(id),
 subject text not null, message text not null, state text not null default 'pending' check(state in ('pending','sending','sent','failed')),
 created_at timestamptz not null default now(), attempted_at timestamptz, sent_at timestamptz,
 unique(event_id,recipient_id)
);
alter table public.workflow_mail_outbox enable row level security;
revoke all on public.workflow_mail_outbox from anon,authenticated;
grant all on public.workflow_mail_outbox to service_role;
create function public.queue_title_mail() returns trigger language plpgsql security definer set search_path=public as $$
declare s submissions; roles text[];
begin
 select * into s from submissions where id=new.submission_id;
 roles:=case new.action when 'student_submit' then array['guide'] when 'guide_accept' then array['hod'] when 'hod_accept' then array['pg_director','dean'] when 'finalize' then array['guide'] else array[]::text[] end;
 insert into workflow_mail_outbox(event_id,actor_id,submission_id,recipient_id,subject,message)
 select new.id,new.actor_id,s.id,p.id,'Dissertation title update',replace(new.action,'_',' ')||': '||s.title||coalesce(E'\nRemarks: '||new.remarks,'')
 from profiles p where p.id=s.student_id or research_scope(p.id,s.id,roles);
 return new;
end;
$$;
create trigger queue_title_mail after insert on public.title_review_events for each row execute function public.queue_title_mail();
create function public.queue_research_mail() returns trigger language plpgsql security definer set search_path=public as $$
declare m research_milestones; s submissions; d research_milestone_definitions;
begin
 if new.action not in ('submit','accepted','revision_requested') then return new; end if;
 select * into m from research_milestones where id=new.milestone_id;
 select * into s from submissions where id=m.submission_id;
 select * into d from research_milestone_definitions where id=m.definition_id;
 insert into workflow_mail_outbox(event_id,actor_id,submission_id,recipient_id,subject,message)
 select new.id,new.actor_id,s.id,p.id,'Research milestone update',d.name||': '||replace(new.action,'_',' ')||coalesce(E'\nRemarks: '||new.remarks,'')
 from profiles p where p.id=s.student_id or (new.action='submit' and research_scope(p.id,s.id,d.reviewer_roles));
 return new;
end;
$$;
create trigger queue_research_mail after insert on public.research_events for each row execute function public.queue_research_mail();

-- SOURCE: migration_pg_research_requests.sql
-- Apply after migration_workflow_mail_outbox.sql. No remote changes are automatic.
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


-- SOURCE: migration_student_research_tracking.sql
-- Independent of title approval and the title-workflow migrations. Apply once.
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

-- SOURCE: migration_research_director_access.sql
-- Explicit faculty-wide research management. Null institute alone grants nothing.
-- Apply after migration_student_research_tracking.sql. Does not change title permissions.
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

-- SOURCE: migration_rpms.sql
-- RPMS project model. Apply after all research migrations; test in staging first.
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

NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT to_regprocedure('public.research_snapshot()') AS title_tracker, to_regprocedure('public.student_research_snapshot()') AS student_tracker;
SELECT id, public FROM storage.buckets WHERE id = 'research-presentations';

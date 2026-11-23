-- Apply after migration_dynamic_forms.sql in STAGING first. Additive; no backfill of history.
begin;
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
commit;

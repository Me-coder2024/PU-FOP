-- Apply after migration_research_progress.sql. Session-derived server writes only.
begin;
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
commit;

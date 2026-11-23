-- Apply after title workflow. Durable mail intent; no email is sent by this SQL.
begin;
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
commit;

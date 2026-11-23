-- Operational rollback for the NEW RPMS integration, not deletion of research data.
-- Use only with explicit release approval and restore the previous application build.
-- Stop the RPMS scheduler before running. Preserve all new evidence and audit tables.
BEGIN;
DROP TRIGGER IF EXISTS rpms_title_prerequisites ON public.submissions;
DROP TRIGGER IF EXISTS rpms_title_sync ON public.submissions;
DROP TRIGGER IF EXISTS rpms_link_title ON public.submissions;
DROP TRIGGER IF EXISTS rpms_link_request ON public.student_research_assignments;
DROP TRIGGER IF EXISTS rpms_student_onboard ON public.profiles;
REVOKE EXECUTE ON FUNCTION public.rpms_action(uuid,text,jsonb),public.rpms_jobs() FROM service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Retained tables and private storage must not be dropped. Re-enabling requires a
-- reviewed forward migration recreating triggers/grants, not rerunning the initial SQL.

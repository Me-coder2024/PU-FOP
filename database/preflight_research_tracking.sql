-- Read-only diagnosis. Run in the intended Supabase project's SQL editor.
-- This does not establish whether the project is staging or production.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name, current_user AS database_role;
SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
FROM unnest(ARRAY['institutes','departments','profiles','submissions','notifications',
 'research_milestone_definitions','research_milestones','research_files','research_events',
 'research_updates','research_request_events','workflow_mail_outbox']) AS name;
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('profiles','submissions')
ORDER BY table_name, ordinal_position;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.proname='is_submission_open' OR p.proname LIKE 'research_%')
ORDER BY p.proname;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname='public' AND tablename IN ('profiles','submissions'))
 OR (schemaname='storage' AND tablename='objects')
ORDER BY schemaname, tablename, policyname;
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id='research-presentations';
COMMIT;

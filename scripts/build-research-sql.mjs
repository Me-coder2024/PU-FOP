import { readFileSync, writeFileSync } from 'node:fs';
const migrations = [
 'migration_research_progress.sql',
 'migration_title_workflow.sql',
 'migration_workflow_mail_outbox.sql',
 'migration_pg_research_requests.sql',
 'migration_student_research_tracking.sql',
 'migration_research_director_access.sql',
 'migration_rpms.sql',
 '../supabase/migrations/20261124043858_faculty_wide_research_access.sql',
 '../supabase/migrations/20261124051146_assignment_audiences_and_finalized_ppt.sql',
];
const output = [
 '-- PU-FOP research tracking: fresh installation bundle. Run ONCE.\n',
 '-- If earlier research migrations are installed, run ONLY missing migrations.\n',
 '-- Requires dynamic-form columns; coordinate with the matching app release.\n',
 '-- Changes title/profile write policies: older deployed code may stop writing.\n',
 '-- All migrations below share one transaction.\nBEGIN;\n',
];
for (const name of migrations) {
 const lines = readFileSync(new URL(`../database/${name}`, import.meta.url), 'utf8').split('\n');
 for (const marker of ['begin;', 'commit;']) {
  if (lines.filter(line => line.trim().toLowerCase() === marker).length !== 1) throw new Error(`Unexpected transaction boundaries: ${name}`);
 }
 output.push(`\n-- SOURCE: ${name}\n`, lines.filter(line => !['begin;', 'commit;'].includes(line.trim().toLowerCase())).join('\n'));
}
output.push("\nNOTIFY pgrst, 'reload schema';\nCOMMIT;\nSELECT to_regprocedure('public.research_snapshot()') AS title_tracker, to_regprocedure('public.student_research_snapshot()') AS student_tracker;\nSELECT id, public FROM storage.buckets WHERE id = 'research-presentations';\n");
writeFileSync(new URL('../database/apply_research_tracking.sql', import.meta.url), output.join(''));
console.log('Updated the SQL bundle from its source migrations. No database connection was made.');

# Unified research workspace implementation

Implementation date: 21 November 2026. This describes the local implementation, not a production deployment or a university-approved academic workflow.

## What is now connected

`research_projects` is the title-independent parent. Eligible student profiles receive one idempotent `initial`-cycle project on creation or promotion to student role. Existing student profiles are backfilled with an audited project link. Existing titles and earlier written assignments receive project foreign keys; earlier presentation evidence is linked through its existing title. No historical research initiation or prerequisite completion is invented.

The PG Director sees the student project directory before a title exists. A published workflow assigns versioned activities to selected students, including institute/department/batch/guide-filtered groups. New workflow versions do not silently edit existing projects: assignment to an existing project requires a migration reason, archives prior activities, and preserves their responses, attempts, files and audit records. Reassigning the already assigned version is a no-op. New follow-up activities can be copied from a published template without replacing the workflow.

Implemented activities are questionnaires, assessments, PDF evidence, PPTX evidence, existing title approval, general tasks/checklists, meetings and final reviews. Subtasks have parent references; explicit prerequisites determine unlocking. Workflow validation rejects duplicate keys, missing dependencies and cycles. The twelve-stage pharmacy starter is illustrative and editable, not an official rubric.

## Module coverage

| Specification area | Current implementation |
|---|---|
| Project creation | Onboarding trigger, audited existing-student backfill, unique student/cycle, project metadata, independent title linkage. |
| Academic hierarchy | Student ownership; assigned-guide scope; departmental HOD and institutional Dean scope; explicit faculty-wide PG grant; configured reviewer role for approvals. |
| Workflow builder | Editable activity types, instructions, weights, start/deadline offsets, reviewer, priority, mandatory/optional, prerequisites, parent/subtasks, duplication/reordering, preview, saved immutable versions, audited assignment/migration. |
| Questionnaires | Short/long text, yes/no, single/multi-choice, dropdown, number/date, reference URL, rating, checklist, private PDF/PPTX evidence, conditional questions and required rules. |
| Assessments | Private reusable banks with category/difficulty; selected question count, shuffled questions/options, immutable attempts, duration, attempt limit, pass mark, negative marking, server grading, delayed/never answer release. |
| Task management | Not started/in progress/submitted/under review/changes required/approved, independent blockers, follow-ups, reviewer feedback, private drafts and immutable submissions. |
| Title integration | Authoritative v2 title workflow remains; new-title prerequisites are enforced at insertion; final approval synchronizes; existing pending/approved titles retain their academic rights. |
| Files/PPT | Pre-title/project-level PDFs and PPTX, private reference templates, signed direct uploads, immutable verified copies, size/content checks, separate submission/review and version history, optional evaluation criteria. |
| Periodic reporting | Optional unweighted recurring questionnaires/meetings, configurable interval/occurrence cap, idempotent scheduled generation, preserved submissions and feedback per occurrence. |
| Student workspace | One project workspace with tasks, title history, earlier requests/evidence, questions, attempts, reviews, deadlines, blockers, discussions and activity history. |
| PG command center | Project directory, filters, search, pagination, sort, real KPIs, department analytics, student drill-down, bulk workflow assignment and announcements. |
| Progress engine | Server-derived verified, planned and submitted percentages; separate student self-assessment; no progress manufactured for absent configuration. |
| Health | Not initiated/on track/at risk/delayed/on hold/completed; overdue student work, blockers, prerequisite delays and faculty-review delays distinguished. |
| Notifications/escalation | Transactional in-app events, configurable reminder recipients and thresholds, idempotent job receipts, manual Dean escalation, daily scheduled worker. |
| History | Project actors/timestamps, configuration migrations, deadline changes, internal faculty notes, meetings, version histories, authoritative title events. |
| Reports | Scoped project/activity/history/assessment/title/deliverable/guide CSV exports; department/date/institute/batch/guide/health filters; formula-injection protection; printable branded reports with browser Save as PDF. |
| Data architecture | Additive project model; restricted tables; server-only state transitions; immutable workflow versions and submission snapshots. |
| Security | Session-derived identity, institutional scope, configured reviewer checks, no self-approval, protected answer keys, private file policies, action idempotency and mutation rate limit. |
| UX/views | Table, Kanban, deadline calendar/agenda, timeline and Gantt; responsive layout, empty/error/success states, prerequisite explanations and archived evidence views. |
| Engineering handoff | Migration, rollback, environment/scheduler setup, deterministic integration tests, component tests and isolated browser checks. |

## Important behavior definitions

- Verified progress is `100 × sum(weight of effectively approved activities) / sum(active positive activity weights)`. Optional activities contribute only when configured with positive weight; set weight to zero to exclude them. Unconfigured/zero-weight projects show **Not configured**, not false completion.
- Effective approval requires approved prerequisite chains. Reopening a prerequisite removes downstream effective credit until it is verified again; original approval records remain in the audit history. Title state always comes from the authoritative title record.
- Project completion additionally requires all mandatory activities and an authorized final-review approval. A title approval alone never completes the project. Student self-assessments do not influence verified progress.
- Planned progress uses configured positive weights whose deadlines have arrived; submitted progress uses submitted/under-review/approved work. These are displayed separately from verified progress.
- A legacy approved title can retain its title evidence, but it does not imply completed pre-title activities or a research initiation date. Unknown historical dates remain null.
- Conditional rules compare an earlier answer with an author-configured value. Question IDs and response snapshots remain attached to their workflow version.
- Multi-select assessment scoring is **exact-set match**. All and only correct options earn marks; a wrong selection applies the configured penalty; unanswered earns zero; total score is clamped at zero. An unsubmitted expired attempt scores zero. This timeout rule is displayed to students.
- Assessment definitions and answer keys stay in service-only tables. Students receive only their shuffled attempt questions and permitted results/feedback; the entire unused question pool is not sent in task configuration.
- Reviewer permissions follow the published role plus the student's actual scope. Choosing `guide` resolves to the student's assigned guide; the PG Director does not silently override a guide/Dean checkpoint unless the workflow explicitly assigns that role.
- Recurring check-ins are optional and unweighted by design; their evidence can inform configured mandatory reviews without a growing denominator. Every occurrence has a unique project/workflow/key/occurrence identity.
- Health precedence is hold → completed → actionable overdue student work → risk → not initiated → on track. Faculty review delays and locked-prerequisite delays have separate reasons; locked activities do not generate student-overdue reminders.
- Announcements and reminders use the existing in-app notification system. This RPMS worker does not automatically send email; the earlier title-workflow mail outbox is unchanged.

## Files and data model

- `database/migration_rpms.sql`: project/schema/linkage triggers, workflow/task engine, grading, health/progress, scoped snapshots, scheduler and private storage guards.
- `database/rollback_rpms_runtime.sql`: operational trigger/worker rollback that retains evidence and audit tables.
- `lib/rpms/model.ts`: typed configuration, validation, conditions, scoring parity and CSV escaping.
- `lib/rpms/template.ts`: explicitly illustrative editable starter workflow.
- `app/api/rpms/route.ts`: authenticated requests, validated publishing, private uploads/downloads and assessment submission.
- `app/api/rpms/jobs/route.ts`: secret-protected scheduled worker.
- `app/api/rpms/export/route.ts`: permission-scoped export endpoints.
- `components/rpms/`: project directory/workspace, workflow builder, question banks, typed answers, evidence and review UI.
- `/research` and `/dashboard/track`: shared unified workspace in existing portal shells.

New tables: `research_projects`, `research_workflow_versions`, `research_project_tasks`, `research_task_responses`, `research_assessment_attempts`, `research_project_files`, `research_reference_files`, `research_question_bank`, `research_activity_logs`, `research_job_events`, `research_action_keys`.

The `initial` research cycle is the current eligibility policy. Separate future-cycle creation/eligibility policies need institution confirmation; the unique student/cycle model permits a controlled future extension. Automatic destructive cleanup or retention expiry is not enabled.

## Permissions

| Role | Read scope | Operational actions |
|---|---|---|
| Student | Own projects and released evidence/results | Draft/submit, attempt assessments, report blockers/self-assessment, participate in discussions. |
| Guide | Assigned students in the same institutional/department scope | Review guide-assigned activities, feedback and meeting notes. |
| HOD | Authorized department | Read oversight and review HOD-assigned activities. |
| PG Director | Assigned institute or explicit faculty-wide research grant | Publish workflows/banks; assign/migrate; follow-ups; deadlines; holds; announcements; escalation; review PG-assigned activities. |
| Dean | Authorized institute | Executive oversight; internal remarks; review/final approval where configured. |
| Super admin | Explicit global administrative scope | Administrative research access; existing academic role policies remain separate. |

New tables expose no direct browser writes or assessment-table reads. Service-only functions receive actor identity solely from the authenticated server route. All downloads are permission checked before issuing a short-lived URL. Browser users cannot self-grant management rights.

## Staging installation and backfill

1. Use an authorized staging database and backup. Review v2 profile/guide fields, existing research migration history and storage policies. Do not run every SQL file in the repository.
2. Existing installations with all preceding research migrations, including `migration_research_director_access.sql`, apply **only `migration_rpms.sql` once**. It is a transactional one-time migration, not a rerunnable seed.
3. For a fresh research installation, `scripts/build-research-sql.mjs` generates `database/apply_research_tracking.sql` in dependency order, including RPMS. Dynamic-form columns must exist first. Do not run this bundle against an already or partially migrated installation.
4. The migration creates one initial project for every existing `profiles.role='student'` record, links existing titles and earlier written assignments, and records the backfill without granting fictional milestone credit.
5. Deploy the matching application to staging, then use synthetic role accounts to validate authentication, project creation, workflow publishing, conditions, grading, evidence uploads, revisions, scheduler and exports.
6. Only after this staging validation and explicit production-release authorization should the migration and matching app be released to production. The new-title prerequisite trigger must not be installed without coordinating the application release.

No RPMS production migration or deployment was performed during local implementation. The earlier explicitly authorized faculty-wide access grant remains separate.

## Environment and storage

Keep existing Supabase URL/anon/service-role and Firebase configuration. Never put the service role in a public variable.

- `CRON_SECRET`: required for Vercel's scheduler Authorization bearer header.
- `RPMS_JOB_SECRET`: optional alternative for a trusted external scheduler. If set, it takes precedence; configure its bearer value consistently.
- `research-evidence`: private Supabase Storage bucket for project PDF/PPTX evidence and reference templates, 25 MB maximum.
- `research-presentations`: existing private legacy PPT bucket retained.

`vercel.json` schedules `/api/rpms/jobs` daily at 00:00 UTC. An authorized external scheduler can call the same endpoint more frequently; confirm hosting plan limits before changing the schedule. Timing and deadline submission checks are enforced immediately on the server, independent of scheduler frequency. Test the worker twice and confirm no duplicate occurrence/reminder records.

File inspection checks PPTX ZIP/content structure and PDF header/end marker plus size. It is not antivirus/content-disarm scanning. Legacy `.ppt`, DOCX and institutional retention/malware policy are not silently enabled.

## PG Director workflow

1. Open **Research → Workflow builder**. Start blank or load the illustrative twelve-stage template.
2. Configure academic stages, weights, mandatory work, reviewer roles, deadlines and prerequisites. Add conditional questions, reusable question banks, private reference templates and optional rubric criteria.
3. Preview and publish an immutable version. Return to **Projects**, filter the student population, select students and assign the version. Existing project migrations require a reason and preserve archived evidence.
4. Open a student's project to review progress, submissions, assessment results, blockers, conversations and history. Add follow-up activities from a published template when needed.
5. Review only the checkpoints assigned to your role. Use recorded deadline extensions, holds and escalation for exceptional circumstances.
6. Use **Analytics** and **Reports** for authorized aggregate views and exports. CSV opens in spreadsheet applications; **Print / Save PDF** uses the browser's PDF destination.

## Rollback and limits

Stop the scheduled worker and coordinate restoration of the prior application. With explicit approval, `rollback_rpms_runtime.sql` removes RPMS linkage/gating triggers and revokes new action/job execution. It retains new tables, responses, files and activity history. Re-enabling after rollback requires a reviewed forward migration, not rerunning the one-time initial migration.

The new UI uses binary verified milestone completion; fractional academic credit and drag-and-drop scheduling are not implied. The calendar is a deadline agenda, and PDF output uses browser printing. Existing working title/similarity limitations and unapproved Pharmacognosy/Pharmacy Practice production rubrics remain subject to the prior release notes. No official rules or scoring rubrics have been invented.

## Verification record

Verified locally on November 21, 2026:

- Automated unit, component and database integration tests: **29 passed, 0 failed**.
- Chromium browser checks: **3 passed**, covering director pre-title roster/workflow assignment, student conditional answers/draft/submission, and mobile views. Desktop and mobile screenshots were visually reviewed.
- Production build and standalone TypeScript check: **passed**.
- Targeted lint for the new RPMS implementation: **passed**. Repository-wide lint remains at the inherited **59 errors and 32 warnings**; no new RPMS diagnostics appeared.
- Tracked-file whitespace checks passed excluding the two unrelated user-modified public drug/title JSON datasets, which were preserved.

Browser tests use the real React workspace against intercepted synthetic API data; database integration tests execute actual migrations in isolated PostgreSQL/PGlite. Neither substitutes for a live authenticated staging test of Firebase/Supabase Storage and the deployed scheduler. Live uploads, cron delivery and the matching production release remain unverified. No new RPMS production migration or application deployment was performed.

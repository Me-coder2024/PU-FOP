# Department forms, research progress and private PowerPoint submissions

Storage is **Supabase Storage**, using the existing Supabase project and a private `research-presentations` bucket. No AWS account, AWS SDK, S3 access key, or external bucket is required. Files upload directly with a Supabase signed upload capability; the application server verifies a private copy before it can be submitted.

## What changed

- One exact department resolver serves form selection, reviewer rendering and scoring. QA and PA still share the existing QA schema. Existing legacy form definitions remain. Pharmacognosy and Pharmacy Practice reuse their existing fields without inventing academic requirements or scoring. Unknown departments do not inherit Pharmaceutics scoring.
- Pilot department activation requires staging flags on both server and client. New v2 writes populate top-level `department_id`/`schema_version` and retain the same information in `criteria_details`. Readers retain compatibility with older JSON-only metadata.
- Title writes and guide/HOD/final review use authenticated server transactions, explicit role/institute/department/guide scope, canonical statuses, recorded events and transactional notifications. The active-title unique index remains unchanged, including finalized titles. Resubmission preserves form data and clears the current round's review dates; prior new-system reviews remain in the event log. No history is fabricated for old records.
- `/dashboard/track` displays the latest title, next action, recorded dates and remarks, then independent research milestones. `/research` is the scoped reviewer queue, linked from staff navigation. The PG Director has a separate read-only `/pg-director/titles` browser; Dean-only title editing is not granted to that role.
- The PG Director can now publish a written-question or PPTX request from the portal for a selected finalized student title, set a deadline, review responses, and extend a deadline with a recorded reason. Questions and target stay fixed after publication. Student drafts are private; every submitted response version and review is retained. Advanced configuration still controls prerequisites, reviewer roles, revision/late rules and size. The supplied SQL fixture remains disabled and explicitly a test.
- Uploading, verified draft, explicit submission and review are separate states. Submitted files and remarks survive revisions. A per-submission database lock serializes competing actions; repeated submissions/reviews do not create repeated events, notifications or mail intents.
- Random Similarity/Repository scores are replaced by an explicit unavailable state.
- The hard-coded mail credential fallback was removed as an isolated cleanup in `lib/utils/email.ts`. Required variable names are in `.env.example`; no values were copied. The owner should revoke/rotate the previously committed key if it was valid.

## Staging apply order

No remote migration, storage creation, real account operation or deployment was performed during implementation.

1. Confirm the project is **staging** and inspect its existing schema/migration history. This repository has loose SQL scripts; do not run every database file. Back up staging and review existing custom policies/triggers. The expected baseline is the v2 `profiles`, `submissions`, `departments`, `notifications` and `is_submission_open` function, including profile guide assignment.
2. Apply `database/migration_dynamic_forms.sql` if its columns are not already present.
3. Apply `database/migration_research_progress.sql` once.
4. Apply `database/migration_title_workflow.sql` once.
5. Apply `database/migration_workflow_mail_outbox.sql` once.
6. Apply `database/migration_pg_research_requests.sql` once.
7. Release the matching application code together with these migrations. The new restrictive submission write policies intentionally require authenticated server workflows; older deployed browser-write code is incompatible. Do not mix old application code with the new policies.

The new migrations do not delete rows, reset data, replace the active-title index or backfill fictional reviews. They are transactional, one-time migrations, not rerunnable seed scripts. The title migration adds restrictive scoped reads, blocks browser submission writes, and protects profile role/assignment columns from direct browser updates. Server onboarding now derives identity from the session, validates guide scope, and cannot reassign already-onboarded students.

The research migration creates the private bucket with a 50 MiB infrastructure ceiling; each milestone defaults to **25 MiB**. It rejects a conflicting existing public bucket. Restrictive object policies prevent broad pre-existing permissive policies from exposing or modifying this bucket. Browser users have no ordinary object read/write access. Signed upload/download capabilities are created only after server authorization.

## Environment and milestone configuration

Use the existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and server-only `SUPABASE_SERVICE_ROLE_KEY`. Set staging only:

```dotenv
APP_ENV=staging
NEXT_PUBLIC_APP_ENV=staging
NEXT_PUBLIC_ENABLE_PILOT_DEPARTMENTS=true
```

Rebuild after changing `NEXT_PUBLIC_*` values. In production keep both environment labels `production` and the pilot flag `false`. The new departments have no approved rubric and must remain inactive in production until reviewed and deliberately implemented.

Configure the disabled test definition in the staging SQL editor, using actual staging institute/department UUIDs. For example:

```sql
update public.research_milestone_definitions
set enabled = true,
    institute_id = '<staging-institute-uuid>',
    department_id = '<staging-department-uuid>',
    reviewer_roles = array['guide'],
    max_bytes = 26214400
where name = 'TEST — Research presentation' and test_only = true;
```

For a test spanning both departments, leave `department_id` null and set `institute_id` explicitly. `deadline` is a timestamptz; use an explicit offset when entering a local deadline. `unlock_after` references another definition that must be accepted for the same title. Avoid cycles in prerequisite configuration. `require_finalized_title` defaults true, `allow_revision` true, and `allow_late` false. Only configured roles may review, and role membership never bypasses record scope. `super_admin` must also be explicitly included in a milestone's reviewer roles to act as a reviewer.

Primary database profile roles and assignments are authoritative for this release. Email role grants or a client-side active-role selection do not broaden research access. Validate the university's desired multi-role scope model before extending it.

## File behavior and operations

Only `.pptx` is accepted. The bucket MIME is `application/vnd.openxmlformats-officedocument.presentationml.presentation`. A signed draft upload uses a fresh UUID path and cannot overwrite prior versions. The server copies the object to a server-only `verified/` path, checks its declared/actual size and bounded ZIP/core presentation XML structure, and rejects encrypted ZIPs, unsafe paths, macro/ActiveX/embedded-object entries and external entity declarations. This is structural validation, not antivirus scanning or proof that every slide renders correctly. Presentations containing embedded OLE objects are intentionally rejected by this staging validator.

Copy-before-validation prevents a still-valid upload token from changing the bytes of a verified/submitted presentation. Download links expire after 60 seconds and are available only through a fresh authorized request. Draft tokens are generated by Supabase's signed-upload API (its service-defined validity is typically two hours). A failed/expired upload may leave an `uploading` row or unreferenced object; it never becomes submitted. Upload again to obtain a fresh capability. Older submitted versions are never removed by replacement.

No automatic cleanup task is installed. After a university retention policy is agreed, add an audited cleanup process for abandoned uploading rows and orphan draft/copy objects. Never delete a `sealed_path` referenced by any submitted version. Large files are uploaded directly to Storage; server verification downloads at most the configured bucket ceiling and runs in the Node runtime. Test request memory/time limits on the actual staging host with a near-limit presentation.

## Notifications and email

In-app notifications and audit events commit in the action transaction. Mail intents are also transactional, unique per event/recipient, and are delivered after the HTTP response using Next.js `after`. The legacy `/api/notify-workflow` endpoint now accepts only an authenticated retry for persisted pending intents; it cannot manufacture arbitrary workflow emails.

Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for Resend, or `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, and `RESEND_FROM_EMAIL` for SMTP. `PG_DIRECTOR_EMAIL` is the reply-to setting. The old `SMTP_FROM_EMAIL` name is not read by the mail sender. Use safe staging recipients.

The mail worker claims each outbox row atomically before sending. Resend receives a stable idempotency key. A failed/uncertain Resend attempt is not followed by an SMTP send, which could duplicate a delivered email. SMTP attempts are not retried automatically. Inspect `workflow_mail_outbox` for pending/failed/stuck-sending rows; reconcile the provider log before manually resetting a failed/uncertain delivery. Pending records can be retried by their authenticated actor through `/api/notify-workflow`. No scheduled email worker was deployed. A process termination can leave mail pending or sending, but cannot roll back the successful academic action or remove its in-app notification.

## Verification performed

- Baseline: TypeScript passed; lint had **61 errors, 33 warnings**.
- Focused tests: `node --test tests/release.test.cjs` covers aliases, pilot gating, required/conditional fields, canonical status guidance and PPTX structural checks.
- `npm test` runs the actual new migrations in an isolated in-memory PostgreSQL engine with synthetic baseline tables, plus focused logic and server-rendered UI tests. PGlite is now a locked development dependency; the database tests run by default and never connect to Supabase.
- The integration test covers one student from each new department; assigned/unassigned guides; in/out-of-department HODs; PG Director, Dean and out-of-institute staff; title revision/resubmission/finalization; active-title uniqueness; milestone configuration/deadlines; draft verification state; version retention; repeated clicks; wrong-version review; event/notification/mail deduplication; actual authenticated RLS; profile escalation prevention; and private-bucket policy restrictions despite a broad permissive storage policy.
- Final `npx tsc --noEmit` and `npm run build` passed. The combined focused/integration run passed all 14 tests with none skipped. `npm run lint` still reports 59 errors and 32 warnings (inherited findings; no new lint diagnostics remain). The copied dependencies needed the exact locked macOS SWC binary, and the build needed network access for its existing Google Fonts import. No real Supabase Auth sign-in, Storage transfer, email delivery or deployed browser workflow was tested. The isolated schema is intentionally minimal; staging must verify the existing project's grants, triggers and policies together.

## Required live staging acceptance

Use synthetic authenticated accounts for the same role matrix. Open both new forms; enter each field and test visible/hidden conditional fields in existing departments; submit, request revision, reload, resubmit and finalize. Verify all four reviewer views render the original department data. Check that a second active/finalized title cannot be created.

Enable the scoped test milestone. Upload a real PowerPoint, confirm filename/draft state, reload, replace the draft and explicitly submit. Verify assigned review, revision permission, a second submitted version, retained first-version download and audit remarks. Try a renamed non-PPTX, malformed ZIP, oversized file, interrupted transfer, expired download and duplicate clicks. Try direct object URLs, the anon Storage client, a second student's file ID, unassigned guides, wrong-department HODs and out-of-institute staff. Every unauthorized operation must fail. Verify the signed-upload gateway still works with the restrictive policies on your Supabase Storage version.

## Decisions still needed and proposed backlog

Confirm the official Pharmacognosy/Pharmacy Practice required fields and scoring rubrics; production activation; research milestone names/order; deadlines, prerequisites and reviewers; revision and late rules; `.ppt` support; any size-limit change; embedded-object/malware handling; retention; multi-role grants; and final email delivery/retry operations.

Proposed separate work: audit remaining legacy/admin, role-grant, guide-provisioning and drug endpoints; validate all current profile provisioning paths; implement an authoritative similarity dataset/algorithm; add bulk/cohort publishing, advanced milestone configuration, a mail-operations UI and an orphan-file retention job. These are not silently included as portal features or represented as completed security audits.

## Laptop verification — 21 November 2026

Node 24.22.3/npm 11.19.1 are permanently installed; a clean `npm ci`, typecheck, build, and all 14 tests passed. The new workflow modules have no lint diagnostics; repository lint remains at 59 inherited errors and 32 warnings. The copied development cache was moved to `/tmp/pu-fop-next-dev-before-laptop-20261121` and regenerated because its old nodemailer directory could not be used as a macOS symlink.

The development server returned HTTP 200 for `/login` and HTTP 401 for unsigned research reads and request publication. The in-app browser could not complete its final visual check after the server restart, so these HTTP checks and server-rendered UI tests are not represented as a successful interactive sign-in test.

Read-only checks of the configured Supabase project confirmed existing `profiles`/`submissions` availability. The new research definition/update/request-history/outbox tables return PGRST205 (not installed); the private PPT bucket is missing or inaccessible. No cloud writes were performed. Resend and SMTP configuration are absent in this laptop's environment, so email delivery remains unverified/unconfigured.

The clean install also reported 23 dependency advisories (10 moderate, 12 high, 1 critical). No forced dependency upgrades were applied as part of laptop setup; review the advisory paths before deployment. See [LOCAL_SETUP.md](LOCAL_SETUP.md) for the local commands and PG Director/student usage flow.

## Student tracking before title submission

`database/migration_student_research_tracking.sql` adds an independent student-level question tracker. It requires the existing v2 profiles (including guide assignment) and notifications tables; it does not require any research/title migrations and does not change title-write policies. Run it once with the matching application release. If the earlier four research migrations have already been applied, run only this new file. For a fresh research installation, `database/apply_research_tracking.sql` includes all five in one transaction; regenerate it with `node scripts/build-research-sql.mjs`. Do not rerun the fresh-install bundle on a partially migrated database.

The PG Director can target one student or all currently registered, in-scope students (up to 1,000 per publication), regardless of whether they have proposed or finalized a title. A bulk publication fixes its recipient list at publication time; it does not silently enroll future students. Students must have an institute assigned on their profile before an institute PG Director can select them. Null institute does not grant cross-institute access. No placeholder titles are created.

The student sees questions directly on `/dashboard/track`, even with no title. Private drafts, explicit submission, immutable response versions, review, revision and deadline history are maintained independently of title approval. The assigned guide and PG Director can review; scoped HOD/Dean access is read-only. Only the PG Director/super-admin can publish or extend deadlines. A bulk request shares one deadline: extensions notify and audit every recipient. The student tracker uses in-app notifications; email delivery is not implemented for these new requests. Existing title-linked PPT uploads remain in the separate section and use private Supabase Storage.

Editable pharmacy prompt suggestions cover planning, literature, protocol/methods, experimental work/data collection, analysis, and writing. They do not claim to be an official rubric, automate ethics approval, or fabricate percentage completion. Counts show pending, overdue, submitted, revision requested, and accepted assignments. Submitted/accepted work is never counted as overdue solely because the deadline passed.

Verification: the isolated database suite covers no-title students, bulk idempotency, cross-institute and unassigned-profile rejection, private drafts, guide review, immutable revisions, deadline enforcement/extensions, and authenticated-role access restrictions. Production application remains a separate release step; no remote changes are made by generating SQL.

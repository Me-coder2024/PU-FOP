# Run PU-FOP on this Mac

The required local runtime is Node.js 24 LTS with npm 11. React, Next.js, TypeScript, Tailwind, Supabase/Firebase SDKs, email clients and the isolated PostgreSQL test engine are installed through this project's `package.json` and lockfile. Git and Apple's Command Line Tools are already installed. You do not need a separate global Next.js install, Homebrew, a local PostgreSQL server, or Docker to run against your configured hosted Supabase/Firebase services.

## Installed tools

Node.js 24.22.3 and npm 11.19.1 were installed from the official macOS ARM64 archive after SHA-256 verification, under `~/.local/share/nodejs/node-v24.22.3-darwin-arm64`. Commands are linked from `~/.local/bin`. Both `.zprofile` and `.zshrc` add that directory to PATH; existing configuration was backed up before editing. `.nvmrc`, `.node-version` and package engines record the project runtime.

Open a **new Terminal window**, or run `source ~/.zshrc` in an existing one:

```sh
cd /Users/krishkumargupta/Desktop/PU-FOP
node --version
npm --version
npm ci
npm run doctor
npm run dev
```

Open http://localhost:3000. Keep that terminal running. Stop with Control-C. If port 3000 is occupied, use `npm run dev -- --port 3001` and open http://localhost:3001.

The existing `.env.local` is kept private and was not replaced. `npm run doctor` prints only configuration names/status, never credential values. `npm run doctor -- --online` additionally makes read-only Supabase schema and private-bucket checks; it never migrates, uploads, emails or edits data. Missing research tables mean the staging migrations still need applying, not that Node or Next.js is incorrectly installed.

## Hosted services

The app needs the Supabase and Firebase variables listed in `.env.example`. Keep the service-role key server-only. Firebase Google sign-in must allow `localhost` in the project's authorized domains. Existing database/auth accounts and data remain in their cloud projects; installing this laptop does not copy or reset them.

`GROQ_API_KEY` enables the existing AI title checks. Configure Resend or SMTP to deliver notification emails. In-app notifications and durable mail intents remain separate from email-provider delivery. Unconfigured email is not evidence that the academic action failed.

Do not label a production backend as staging just to unlock pilot forms. For an authorized staging project use `APP_ENV=staging`, `NEXT_PUBLIC_APP_ENV=staging`, and `NEXT_PUBLIC_ENABLE_PILOT_DEPARTMENTS=true`, then restart/rebuild. New PG Director research requests are clearly marked test-only when created in staging.

## Research workflow

1. The student selects/submits a dissertation title and completes the existing validation and Guide → HOD → final approval process.
2. After finalization, the PG Director opens **Research Progress**, expands **Request a research update**, and selects that student's finalized title.
3. The PG Director writes a request name/instructions, chooses written answers or a PPTX, sets a deadline, and publishes. The student receives a notification.
4. On **Progress Tracker**, the student answers the questions, explicitly saves a private draft, and submits before the deadline. PPTX requests use the separate draft-upload and submit flow.
5. The PG Director filters the queue by student/title or pending/overdue/reviewed state, reads submitted versions and feedback, and accepts or requests revision.
6. If more time is needed, the PG Director extends the deadline with a recorded reason. Earlier submissions, the deadline that applied when they were submitted, and review comments remain in history.

A request's questions/target are fixed after publication so earlier answers keep their meaning. Publish another request for the next research check-in. This release supports one selected title per published request; bulk/cohort publishing can be added separately. No percentage of research completion is invented from the number of updates.

Apply `database/migration_pg_research_requests.sql` **after** the migrations in [RELEASE_STAGING.md](RELEASE_STAGING.md). It adds PG authoring, written responses and request/deadline history. No remote migrations are automatically applied by installing or starting the project.

## Local checks

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

`npm test` includes isolated PostgreSQL migration/authorization tests with synthetic accounts and server-rendered workflow UI tests. It never contacts your real Supabase database or sends email. `npm run build` currently needs internet access for the existing Google Fonts import. Use `npm start` only after a successful build.

The inherited repository-wide lint errors are tracked separately from new code. Live sign-in, real Storage transfers and provider email delivery need the configured staging services and authorized test accounts; offline tests cannot establish those outcomes.

## Verified setup outcome — 21 November 2026

The clean dependency install, typecheck, production build, and 14 tests passed. Fresh interactive zsh finds Node/npm without a temporary PATH workaround. The local `/login` page returns HTTP 200, and unauthenticated research APIs return HTTP 401. A stale copied `.next/dev` cache was moved aside and regenerated to fix a platform-specific symlink error.

The configured Supabase project's original title tables are reachable. New research tables and the private bucket still need staging setup; no remote migration was run. Resend/SMTP is not configured. Repository-wide lint remains at 59 errors/32 warnings, all inherited; new workflow files lint cleanly. The install reported 23 dependency advisories, which need a separate dependency review before deployment.

### Research tracking starts before a title

Apply `database/migration_student_research_tracking.sql` once to enable the new student tracker. It is independent of the older title-linked research migrations. The PG Director opens `/research`, chooses **Send progress questions to students**, selects one student or all currently registered institute students, edits the pharmacy-stage prompts, and sets a deadline. Students answer on `/dashboard/track` even without a title; they save a private draft and explicitly submit. Assigned guides and the PG Director review submitted versions and can request revisions. PG Directors can extend deadlines with reasons. Each student retains their own history. New students must have an institute on their profile to appear in that institute’s recipient list.

Student-tracker verification: 17 tests passed, including isolated SQL workflows and rendered component checks; TypeScript, targeted lint, and production build passed. These checks do not represent a live authenticated production test.

### PG Director roster

The research page now opens on a registered-student roster, independently of request history. Each row shows accepted/assigned update counts, overdue and awaiting-review counts, latest submitted update, next deadline, and actions to send questions or view that student's history. The roster's search includes students with no requests. Title-linked presentations are in a collapsed secondary section.

If the PG Director has no institute on their profile, the page shows an account-assignment warning. An authorized administrator must assign the correct institute; null institute does not grant access to every institute. No account mappings are changed by this UI update, and no new SQL migration is required for the roster redesign when the student-tracker migration is already installed.

### Unified RPMS workspace

See [RPMS_IMPLEMENTATION.md](RPMS_IMPLEMENTATION.md) for the new project-based workflow, migration order, scheduler, storage, permissions and rollback. Run `npm test`, `npm run typecheck`, and `npm run test:ui` for local verification. The isolated browser suite starts its own synthetic API harness and never writes to Supabase. Run `npx playwright install chromium` once on a new laptop.

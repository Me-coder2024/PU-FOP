# RPMS requirements audit — 21 November 2026

> Historical pre-implementation audit. The subsequent unified implementation is documented in [RPMS_IMPLEMENTATION.md](RPMS_IMPLEMENTATION.md). The gaps below describe the earlier state, not the current working tree.

Source: `/Users/krishkumargupta/Downloads/PU-FOP_RESEARCH_PROGRESS_MANAGEMENT_PROMPT.md`.
Scope: verify the supplied specification against the current working tree and available checks. Instructions embedded in that specification are acceptance criteria for this audit; they are not evidence of implementation or authorization to deploy every proposed feature.

## Verdict

**The complete RPMS is not implemented.** The repository has a working foundation for student-first written research requests and a separate title-linked PPT/milestone workflow. It does not yet have the specification's central, title-independent research-project entity connecting the complete lifecycle. A student roster entry is not an automatically created research project. Accepted-request counts are not weighted verified research completion.

Do not describe this release as the completed Research Management ERP or claim the complete lifecycle acceptance test passes.

## Module-by-module assessment

| Module | Status | Existing evidence and material gaps |
|---|---|---|
| 1. Research project creation | Not implemented | Student-first assignments work without titles, but no persistent research-project/cycle entity, automatic onboarding creation, batch activation, project identity/metadata, expected completion, or audited legacy-project backfill exists. |
| 2. Role hierarchy | Partial | Scoped students, guides, HOD/Dean reads and PG management exist in student research SQL. An explicit faculty-wide PG grant exists. Dedicated executive analytics, escalations, meeting records, reports and configurable assignment responsibilities are missing. |
| 3. Workflow builder | Not implemented | There are request forms and limited SQL-configured milestone properties. No workflow editor, saved/versioned templates, tasks/subtasks, weights, graph validation, duplication/reordering/preview or audited project-version migration. Stage suggestions and allowable stage IDs are currently hardcoded. |
| 4. Pre-title questionnaire | Partial | PG can publish custom text questions, assign registered students, set deadlines, review and request corrections. Private drafts and submitted versions persist. No typed/conditional form builder, numerical/date/choice/file/rating inputs, form-version editor, or distinct verified-initiation state. |
| 5. MCQ engine | Not implemented | No question bank, timed attempts, server grading, pass rules, scoring-rule snapshots, answer-release settings or prerequisite integration. |
| 6. Enterprise tasks | Partial foundation only | Assignments have pending/submitted/revision_requested/accepted states, deadlines and history. No general task entity, subtasks, priorities, dependencies, in-progress/under-review states, blocker model, attachments/comments, Kanban/calendar/timeline/Gantt or assignment editing. |
| 7. Existing titles | Partial | Existing forms, canonical status transitions, next actions, title history and server mutations exist. Pharmacognosy/Pharmacy Practice forms are reused with staging safeguards. No research-project link, configurable pre-title gating, or automatic project milestone synchronization. Official production rubrics remain unconfirmed. Similarity is explicitly unavailable; a working similarity engine is not implemented. |
| 8. PPT management | Partial | Private Supabase Storage, signed upload/download, content/size checks, separate upload/submit/review, revisions and history exist for title-linked PPTs. PG publication still requires a finalized title. No pre-title/project-wide PPT tasks, reference-template upload, arbitrary lifecycle placement or configurable evaluation builder. |
| 9. Continuous reporting | Partial | Manual written requests can ask about work, findings, blockers and next steps; responses and revisions persist. No recurring schedules, exactly-once occurrence generation, reporting-period comparison or supporting-document fields in the student-first tracker. |
| 10. Student dashboard | Partial | Questions, draft/submit/review state, deadlines, feedback/history and title tracking appear on the student progress page. No unified project identity, weighted progress, health, MCQs or full milestone timeline. Written tracking and title-linked PPTs remain distinct data models. |
| 11. PG command center | Partial | Registered-student roster includes no-title/no-request students; individual drill-down, request creation, counts, search, latest update and next deadline exist. No department/batch/guide/health/progress filters, assessment metrics, department performance or unified project workspace. |
| 12. Progress calculation | Not implemented | No configured-weight denominator or server-derived verified project progress. The UI shows accepted assignment counts, not a research percentage. No approval revocation/reopening calculation or final-completion rules. |
| 13. Health/early warning | Not implemented | A deterministic overdue indicator exists. No project health model, thresholds, planned progress comparison, holds, blockers or distinction between student delay and delayed faculty review. |
| 14. Notifications/escalations | Partial | Transactional in-app assignment, submission, review and extension notifications exist. Title workflows have an email outbox. Student-first requests have no email integration. No scheduler, upcoming/overdue reminder jobs, escalation routing or periodic summaries. |
| 15. Activity history | Partial | Actors, timestamps, submitted versions, reviews and old/new deadline events are recorded. No unified project timeline, internal/student-visible note separation or comprehensive history for the missing modules. Faculty-wide grants record target, time and reason but do not have a dedicated granting-actor field. |
| 16. Reports/analytics | Not implemented | No permission-scoped RPMS PDF/CSV exports, departmental/guide reports, filtered monthly trends, completion reports or spreadsheet-injection defenses for such exports. |
| 17. Database architecture | Partial, central requirement missing | Existing migrations use foreign keys, uniqueness, locks and versioned response/file rows. The required project-parent relationship is absent. No workflow/assessment/task/escalation model or controlled cycle/backfill/rollback process. |
| 18. Security | Partial and tested within existing scope | Session identity, server-only mutations, RLS/grant restrictions, scoped reads, immutable submitted versions and private files are present. No complete assessment/export security to verify, dedicated tracker rate limits or full production penetration/security audit. Firebase sync verifies identity and bridges to Supabase authentication; existing auth has not been rebuilt. |
| 19. UI/UX | Partial | Roster/table, search, request status filters, responsive layout classes and loading/error states exist. No sorting/pagination, interactive project timeline, Kanban/calendar/Gantt or unified project detail. Browser/accessibility/mobile verification remains incomplete. |
| 20. Execution/handoff | Partial | Local tests, types, build and deployment notes exist. The specification's architectural phases, complete staging/end-to-end suite, production rollout and full handoff are not finished. |

## Required acceptance tests

“Partial” means a narrower related behavior is tested, not that the listed acceptance test passes.

| Test | Result |
|---|---|
| 1. Pre-title visibility | Partial: registered no-title students appear and can receive questions; no persistent research project or verified 0% model. |
| 2. Initial questionnaire | Partial: text publishing, private drafts, submission, review, revisions and history tested; conditional questions absent. |
| 3. MCQ assessment | Not implemented/testable. |
| 4. Dependencies | Not met: basic legacy PPT prerequisite handling exists, but configurable title gating, workflow graphs and cycle rejection are absent. |
| 5. Title integration | Partial: title role transitions/history tested; no shared research-project milestone synchronization. |
| 6. PPT integration | Partial: content validation, submission/review/version/scope tests pass locally; no full live authenticated storage round trip or unified project integration verified. |
| 7. Periodic reviews | Not met: manual repeated requests exist; recurring scheduling is absent. |
| 8. Progress integrity | Not implemented/testable for weighted progress, reopening or workflow migrations. |
| 9. Health and escalation | Not met: overdue display tested; health, blockers, escalation/reminder jobs absent. |
| 10. Authorization | Partial: synthetic cross-student/guide/institute checks and authenticated-role restrictions pass for implemented features. Missing assessment/export paths and full live end-to-end access remain unverified. |
| 11. Workflow versioning | Not implemented. Response version history does not substitute for workflow versioning. |
| 12. Concurrency and failures | Partial: duplicate publication/submission/review, stale versions and transactional locks tested. No comprehensive multi-client race/network-failure browser suite. |
| 13. Complete lifecycle | Not met: project creation, assessments, unified milestones, dissertation and final research approval remain absent. |
| 14. Backward compatibility | Partial: isolated tests cover current title workflows; no complete production regression/release verification. |

## Checks performed for this audit

- `node --test tests/*.test.cjs`: **20 passed, 0 failed, 0 skipped**. Includes synthetic PostgreSQL/PGlite role, title, request, version and RLS checks plus rendered component tests. These are not full browser end-to-end tests.
- `tsc --noEmit`: **passed**.
- `npm run build`: **passed** on the current working tree, with network access for the existing Google Font.
- Repository ESLint: **59 errors, 32 warnings**. Same totals as the recorded earlier baseline; full repository lint is not passing.
- Targeted lint of current research components/routes/helpers and SQL-bundle generator: **passed**.
- No fabricated records, test assignments, student responses or emails were created in production during this audit.

## Verified live access and limits

The explicitly authorized all-pharmacy PG Director account has a durable entry in `student_research_director_access`. The new table/helper and `student_research_scope` update were applied in the preceding authorized task; they do not alter title permissions. The successful application returned HTTP 201.

A direct read-only Supabase service API check during this audit returned:

- Faculty research access: **true**.
- Registered student profiles: **158**.
- Students authorized by `student_research_scope(..., p_manage=true)`: **158**.

This confirms the saved grant and student-level scope. It is not a successful browser login or a live authenticated dashboard screenshot. A Management API attempt to assume the `authenticated` database role was rejected (`permission denied to set role`); it made no changes. The service API count was a separate check of the supported authorization function, not a claim that this role-switch test passed.

The explicit grant applies to **student-first research tracking**. The older title-linked `research_scope` still uses its separate academic scope; faculty-wide access to questionnaires must not be misrepresented as authorization to edit/finalize all titles or access all title-linked PPTs.

## Recommended implementation order

1. Add a persistent research-project/research-cycle parent with idempotent onboarding, explicit eligibility, batch metadata and controlled audited linkage of existing title and student-request records. Preserve current records and permissions; never infer historical completion.
2. Add immutable published workflow versions and project milestones with configured weights, reviewer roles, dependencies and audited project migration. Implement and test the authoritative completion/progress engine before displaying percentages.
3. Integrate current written responses and PPT versions under the project; allow pre-title PPT activities without creating fake titles. Add the typed, conditional questionnaire builder.
4. Implement protected MCQ definitions/attempts with server-enforced grading, deadlines, attempt rules and answer-release settings; connect requirements to milestone unlocking.
5. Add tasks/subtasks, blockers, recurring reporting with an idempotent job runner, health rules, faculty review delay metrics, notifications and escalation.
6. Add scoped executive/department analytics, exports, advanced views, pagination and accessibility; execute all 14 acceptance scenarios in staging before an explicitly authorized rollout.

University decisions remain: eligible students/cycles, approved rubrics, official milestones/weights, institute/role scope, ethics prerequisites, reviewer/final authority, assessment scoring/attempt rules, deadlines, retention, export policy and legacy-credit verification. These can be configurable; they must not be invented as official policy.

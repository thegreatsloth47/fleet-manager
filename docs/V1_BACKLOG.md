# FleetFalcon V1 implementation backlog

## Execution checkpoint

- Audit date: 2026-11-24. Baseline: `e02a882`, branch `f/setup-environment`.
- Phase 1 complete: blueprint sections 1–22 and Appendix A reviewed against the
  repository's routes, domain services, migrations, test coverage and
  [hosted automation contract](../e2e/AUTOMATION.md).
- Current task: F02, mobile online management journey. F01 implemented; hosted verification pending.
- Next task: shared hosted verification of F01/F02, then D01 approval before F03.
- Authority: the owner's autonomous-development request authorizes clearly
  specified safe work. It does **not** approve new migrations, permission changes,
  production deployment, paid services or a repository restructuring.
- F01 and F02 are ready under that authority. All later features have explicit
  approval gates below. No approval is implied by their order in this document.
- Baseline checks run this session: 377 application tests across 31 files and
  12 repair tests passed. Historical hosted evidence is in AUTOMATION.md;
  it is not a fresh validation of future changes.

## How to continue without reconstructing the conversation

1. Read this checkpoint, AGENTS.md, the blueprint and AUTOMATION.md. Inspect Git
   status and the ignored automation state before changing or repeating work.
2. Select the first ready feature whose dependencies and approval gates are met.
   Update this file to in progress before implementation. Complete the user
   journey, including backend, permissions and data changes where applicable;
   do not expose a stub to make a feature appear complete.
3. Record decisions and evidence here. Each feature needs local formatting,
   lint, type checking, unit/regression tests and build. Changes to persistence,
   permissions or real browser behavior require the appropriate database and
   hosted browser tests. Migrations require owner approval before implementation
   or application; local/CI approval never authorizes production application.
4. Commit on the development branch. Hosted verification uses the existing
   runner with the explicitly confirmed isolated project and a clean checkout.
   Preserve finished evidence before starting a new execution. Never reset a
   stopped repair's budgets; maximum three attempts and eight hosted runs remain.
   Two adjacent presentation features may share a full hosted regression run,
   but neither is marked verified until that run and same-commit CI pass.
5. Continue with the next ready feature. Stop at an unresolved failure or a
   required approval. Record the exact next action, commit/run references and
   remaining limitations. Do not merge or deploy. This is a resumable work record,
   not an unattended scheduler or permission to run outside an active session.

## Audit: implemented scope versus the complete V1

“Complete” below means the named existing slice, not production readiness or
completion of an entire broader module. “Missing” means no implementation was
found in the inspected repository; external provider/account setup is not inferred.

| Requirement / blueprint | State at audit | Evidence and remaining gap |
| --- | --- | --- |
| Single responsive product, modular backend (§2–3,12,16) | Partial | Next.js App Router, `src/modules`, typed Supabase adapters and REST handlers exist. Preserve this root app; do not introduce the recommended monorepo. Only 15 lines of global CSS; no mobile browser coverage or native shell. |
| Public discovery and signup entry (§2,18.1) | Partial | `src/app/page.tsx` is a heading and links, with one smoke test. No product explanation, search description, comparison/lead-capture journey or approved contact details. F01 covers the introduction and account handoff, not the full acquisition program. |
| Email/password identity and account (§13,18.2) | Complete existing slice | `modules/auth`, `app/auth`, `app/account`, proxy and Supabase SSR; confirmation, sign-in/out, cookies and unsafe confirmation types have unit/browser tests. Password recovery, invitations, account closure and operational email delivery remain incomplete. |
| Organization creation and isolation (§6,13,18.2) | Complete existing slice | Atomic `create_organization`, stable slugs, active-membership reads, server scoping, RLS and composite ownership constraints. `tenant_isolation`, `organization_creation`, API tests and `access.spec.ts` cover foreign tenants and revocation. No organization settings, timezone editor or lifecycle UI. |
| Membership management and operators (§6.2,8,13) | Partial / missing | Owner/admin/read-only/driver roles exist; there is no invite/member administration or operator/assignment model. Drivers intentionally cannot access current asset management. Enabling driver access is a security change, not a UI fix. |
| Vehicle create/edit/archive (§6,18.2) | Complete vehicle slice | `modules/assets`, vehicle routes, atomic RPCs; optional fields, normalized VIN uniqueness, historical VIN reservation and archive read-only behavior tested at domain/API/SQL/browser layers. Equipment and trailers are not implemented asset types. |
| Meter integrity (§6.1,6.4,18.3) | Complete odometer slice; broader module partial | Miles/kilometers, baseline, exact tenths, backdating, corrections, void/restoration and multiple physical replacements preserve logical mileage. `meters.test.sql`, meter unit/service/UI tests and `mileage.spec.ts`. No engine hours or multi-meter UI. |
| Maintenance schedules and due state (§9,18.3–4) | Complete online slice | Distance/calendar/combined rules, organization-local date, deterministic urgency, templates, explicit propagation, protected customization, pauses and archive exclusions. Maintenance domain/SQL/browser tests cover thresholds, leap dates and conflicts. No reminders or organization feature gating. |
| Completed service and recalculation (§9,18.10) | Complete online slice | `modules/service-history`, records/revisions/schedule effects; selected schedules advance atomically, revisions/void preserve evidence, conflicting backdated effects are rejected. Unit/API/SQL/browser coverage. Optional creation of a meter reading from service is not provided. |
| Needs-attention dashboard (§8,18.4) | Partial | Maintenance urgency and setup warnings exist, using authorized services. No issues, assigned-driver home, or module-based navigation. Empty/error and read-only behavior have tests. |
| Expenses and vendors (§6–7,14–15) | Partial | Service cost in integer cents and explicit USD currency, provider free text. No separate expenses, vendor records, receipts or operational reports/exports. |
| Feature configuration (§7) | Missing | No feature_config table, settings flow, module dependency contract, disabled-route/job checks or entitlements separation. Template enabled/paused flags are not organization feature configuration. |
| Issues and problem resolution (§7–8,18.4,18.6) | Missing | No issue schema, commands, UI, resolution history or notification hooks. |
| Private documents and attachments (§4.6,10,13,18.6) | Missing | No storage policies, upload/finalization flow, document links, retention policy, compression or recovery tests. |
| Temporary-offline field submissions (§4,8,18.7) | Partial foundation only | Mileage/service commands use idempotency IDs and SQL replay checks. Form retry IDs live only in React refs: there is no durable outbox, restart recovery, attachment queue, backoff, local schema migration or session-expiry recovery. Current save messages must not imply offline durability. |
| Driver quick actions (§8,18.6) | Missing | No assigned-asset dashboard or authorized driver write flow. Depends on operator/assignment permissions and durable capture. |
| Packaged mobile apps (§2–4,18.5) | Missing | No native project, secure token storage, SQLite adapter, camera integration, deep links or device release validation. Responsive web alone does not complete this requirement. |
| QR entry (§5,13,18.8) | Missing | No opaque token issuance/revocation, low-privilege public intake, rate limiting or native/web link routing. |
| Notifications and background jobs (§11,18.11) | Missing | Auth confirmation is not maintenance notification delivery. No event outbox, scheduler/worker, recipient preferences, device tokens, retry/dead-letter state or operational alerts. |
| AI extraction and confirmation (§10,18.9) | Missing | No provider adapter, ingestion jobs, proposals/confidence, provenance or confirmation commands. Existing ChatGPT-authenticated development tooling is not a product AI backend. |
| Audit/provenance (§15) | Partial | Meter, maintenance and service revisions preserve actors/effects; no cross-module activity timeline or general submission provenance. |
| Tenant export/deletion/retention (§15.1) | Missing | Archiving vehicles preserves history but is not tenant lifecycle management. No approved retention/deletion policy, document export or backup-expiry procedure. |
| Onboarding, accessibility, recovery and support (§18.12) | Partial | Semantic forms and explicit statuses exist; minimal visual layout, no shared loading/error boundaries or support escalation route. F02 improves current online workflows only. |
| Reliability and development automation (§16–17) | Partial, strong existing checks | Strict TS, lint, Vitest, seven SQL test files, hosted browser suite and bounded repair runner exist. No enforced module-import boundary rules, native/network-loss coverage, operational monitoring, backup restore drill or privacy-approved analytics. Optional delivered-email E2E is skipped. |
| Launch and billing (§7,15,18,21) | Missing | No release checklist evidence, approved support/legal content, billing contract or entitlements integration. No production readiness inferred from CI. |

### Blueprint §18 acceptance summary

Existing online implementations cover **2, 3 and 10** for the owner/admin vehicle
scope. Items **1, 4, 5, 6, 7 and 12** are partial (including existing foundations);
**8, 9 and 11** are missing. Item 5 still requires actual iOS/Android packaging.
Item 6 is not satisfied by admin mileage entry: driver permissions, problems and
photos are absent. No aggregate percentage is assigned to unequal requirements.

## Dependency-ordered feature backlog

Rows are user-visible outcomes, not isolated coding tickets. The existing online
core described above is an implicit dependency. Approval IDs are defined below.

| ID | End-to-end outcome / definition of done | Dependencies | Gate / status |
| --- | --- | --- | --- |
| F01 | Visitor understands current FleetFalcon capabilities, follows a clear signup/sign-in action and reaches the existing account flow. Responsive public page, truthful copy, descriptive metadata, keyboard navigation and browser tests. No new lead database or unshipped promises. | Existing auth flow | Implemented; local checks passed; hosted pending |
| F02 | Owner/admin completes organization → vehicle → mileage → service → dashboard on a narrow screen, with readable forms/history, usable controls and visible keyboard focus; read-only users retain their existing view. Reuse existing authorized backend and SQL; add a real mobile journey and responsive checks. | F01; existing core | In progress; no role/schema changes |
| F03 | Owner configures enabled capabilities; disabled modules disappear from workflows/navigation and reject module-specific commands/jobs while retaining historical data under the approved access policy. | Existing core | Blocked D01; migration + security |
| F04 | Owner invites a coworker, assigns an organization role, links a historical operator and vehicle assignment, and can revoke access without deleting history. | F03 | Blocked D02; schema + security |
| F05 | Manager configures organization name/timezone and a member recovers account access safely; local-date scheduling remains correct and protected. | F04 | Blocked D02/D03; schema + auth |
| F06 | Driver reports a problem on an assigned asset; manager triages/resolves it and sees open issues in Needs attention with full history. | F03,F04 | Blocked D04; schema + permissions |
| F07 | Authorized user attaches a receipt/photo to an asset or service, sees upload/failure state, and retrieves the preserved private original. | F03,F04 | Blocked D05; storage/schema/security |
| F08 | Driver captures mileage/problem/photo during temporary loss of connectivity, closes/reopens the app, then syncs exactly once or sees a recoverable rejection. | F04,F06,F07 | Blocked D06; durable storage/command/security contract |
| F09 | Operator opens assigned vehicles and completes a few authorized quick actions with visible sync state, including users who also manage the fleet. | F04,F08 | Blocked D02/D06; security and interaction contract |
| F10 | Same workflows install on iOS/Android with secure sessions, durable queue, camera and lifecycle recovery tested on devices. | F08,F09 | Blocked D07; native architecture/distribution |
| F11 | Scanning a revocable asset QR opens the appropriate app or low-privilege web submission and safely reconciles offline input. | F08,F10 | Blocked D08; security/schema/rate limits |
| F12 | Configured recipients receive maintenance/issue email or push once; preferences, disabled features, revocation, retry and dead letters are respected. | F03,F04,F06,F10 | Blocked D09; jobs/providers/schema |
| F13 | User reviews extracted receipt fields with original source and provenance, corrects them, and confirms through normal validated service/expense commands. | F07,F12 (job infrastructure) | Blocked D10; AI provider/cost/schema |
| F14 | Manager records and reviews categorized service expenses/vendors and exports approved operational records without exposing another tenant. | F07,F13 | Blocked D11; schema/export permissions |
| F15 | Manager maintains approved non-vehicle assets or engine-hour meters with the same auditable maintenance/service cycle. | F03; existing meters/service | Blocked D12; domain/schema decisions |
| F16 | Owner exports tenant data/documents and requests account closure with an explicit retention, audit and backup lifecycle. | F04,F07,F14 | Blocked D11; destructive/security/policy |
| F17 | Customer can obtain help and recover from failures; operators can observe failed jobs, restore backups and validate the full release on devices. | F01–F16 | Blocked D13; operational ownership/provider/privacy decisions |
| F18 | Before paid launch, approved billing updates entitlements without hard-coded pricing tiers in domain logic. | F03,F16,F17 | Blocked D14; product/pricing/provider approval |

## Owner decisions required (none approved by this audit)

These are proposed boundaries for review, not migrations or permission to apply them.
Approve a feature's concrete contract and migration plan before its implementation.
All proposed data remains organization-scoped with explicit server checks and RLS.

- **D01 — capability settings (first dependency).** Proposed stable keys for assets,
  meters, maintenance, service, issues, documents, field entry and notifications;
  assets/identity remain required, dependent modules cannot outlive prerequisites.
  Add organization capability settings with owner/admin writes and versioned
  changes. Decide whether disabling blocks historical reads or only new workflows;
  recommendation: preserve an explicit history view while suppressing active
  workflows. Approve exact dependencies, default/backfill behavior and migration.
- **D02 — people and driver access.** Keep auth users, memberships and operators
  separate; link operators optionally to users and assign assets explicitly.
  Recommend owner-controlled invitations and no self-service role escalation;
  decide admin invite/role powers, last-owner protection, revocation semantics,
  and driver read/append scope. Current denial must remain until approved.
- **D03 — organization/account recovery.** Approve timezone-edit effects on due
  dates, mutable settings, confirmation/reset flows and email-delivery ownership.
  Do not reuse the existing signup-only token handler for recovery implicitly.
- **D04 — issues.** Approve statuses (proposed open/in progress/resolved), severity,
  reporter/assignee permissions, reopen/resolve history and command idempotency.
- **D05 — private documents.** Approve object-storage bucket/policies, allowed
  formats, upload/finalize protocol, malware handling, source retention and
  signed-link lifetime. No public bucket or browser admin key.
- **D06 — offline contract.** Approve IndexedDB for web and SQLite for native,
  versioned outbox commands, payload/attachment size and queue limits, retention,
  compression, retry/backoff and recovery on revocation/sign-out. Choose explicit
  numeric limits before code; never silently discard queued work.
- **D07 — native packaging.** Approve a thin wrapper (blueprint suggests Capacitor),
  build/distribution identities, secure storage and device test ownership. Preserve
  shared Next.js UI; do not restructure into a monorepo or incur store/service fees
  without separate approval.
- **D08 — QR security.** Approve token scope/lifetime/revocation, public intake
  authorization and rate-limit/abuse storage. QR must not grant fleet read access.
- **D09 — jobs and notifications.** Approve an idempotent Postgres-backed job/event
  contract and executor within existing hosting, email/push providers, quotas,
  recipient defaults and secret ownership. No paid service or scheduler is assumed.
- **D10 — AI.** Select an approved no-new-paid-service inference option or explicitly
  defer shipping AI. Define supported documents, confidence/review rules and source
  handling. ChatGPT subscription repair access does not authorize product API use.
- **D11 — financial/lifecycle data.** Approve expense/vendor fields, currency scope,
  export permissions/formats and deletion/retention policy, including backups and
  audit history. No destructive lifecycle automation before that decision.
- **D12 — additional assets/meters.** Confirm V1 exposure of equipment/trailers and
  engine hours, units, multiple-meter targeting and migration/backfill behavior.
  Component management itself remains outside V1.
- **D13 — launch operations.** Supply support destination/owner, privacy/legal text,
  observability and backup/restore responsibility, and permitted analytics. Plan
  production release separately; successful tests never authorize deployment.
- **D14 — paid launch.** Confirm pricing/entitlements and billing-provider policy
  only when ready. Do not encode plan names in feature domains.

## Explicitly outside this implementation program

Blueprint §19 defers GPS/telematics, routing/dispatch, ELD/HOS, full work orders,
inventory, fuel, accounting integrations, OEM feeds, advanced inspections/analytics,
custom role builders/SSO, hierarchy, public APIs, duplicate native product UIs,
generic offline editing, indefinite offline operation, component management and
SMS. Do not invent those as extra autonomous work. Billing remains a pre-paid-launch
approval gate, not permission to add paid dependencies now.

## Validation and progress log

- 2026-11-24: audited clean `e02a882`; 377 unit/application and 12 repair tests
  passed. Existing CI has separate validation and database tenant-isolation jobs.
  Existing hosted suite has desktop browser coverage and an optional skipped
  delivered-email test; mobile viewport coverage will be added in F02.
- Prior bounded repair execution is `done` at `bfc829e` with 2/3 attempts and 5/8
  runs consumed. Preserve/archive it intact before new feature verification.
- F01/F02 implementation and fresh hosted results: pending. Update this checkpoint
  and feature statuses before ending or interrupting the session.

- F01: implemented public introduction, shipped-capability copy, metadata and account handoff. 378 application tests, formatting, lint, type checking and build passed. Added responsive public browser test; full hosted verification pending F02.

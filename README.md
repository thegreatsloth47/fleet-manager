# Fleet Manager

Minimal Next.js application scaffold using TypeScript, App Router, `src/`,
ESLint, and the `@/*` import alias. The home page links to authentication and
organizations. Supabase provides authentication, organization access, and
organization-scoped vehicle management.

## Development

### Normal local setup

Install Node.js 24 as the host's default Node version. On macOS or Windows,
`node` and `npm` should work directly in a normal terminal. No version manager,
shell hook, custom PATH, or temporary runtime is required.

```sh
node --version
npm --version
npm ci
npm run dev
```

`node --version` should report `v24.x`. Open http://localhost:3000.
Configure Supabase as described below before using authentication or organizations.

`package.json` retains `>=24 <25` to declare the supported runtime major.
`.nvmrc` remains a plain version file read by GitHub Actions to pin CI to
24.21.0; its filename does not require installing or using nvm. Local development
accepts Node 24 patches within the declared engine range.

### Optional shared environment: devcontainer

The existing Linux devcontainer remains available for a reproducible environment
across macOS and Windows. Its Node.js 24.21.0 image is pinned by digest and
`npm ci` uses the lockfile. It is optional, not a workaround for an older host Node.

1. Install and start Docker Desktop (Linux containers on Windows).
2. Install VS Code and its **Dev Containers** extension.
3. Open this repository and run **Dev Containers: Reopen in Container**.
4. After the automatic `npm ci`, run `npm run dev` in the container terminal.
   Port 3000 is forwarded to the host.

Docker must remain running. Rebuild the container after configuration changes.
Avoid sharing installed dependencies between native and container sessions:
their native binaries differ. Use separate clones, or run `npm ci` and remove
the generated `.next/` directory when switching environments.

### Validation and formatting

From the repository root, run the same checks as CI:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm run format` to apply formatting and `npm run test:watch` while writing
tests. After a successful build, use `npm start` to serve the production app at
http://localhost:3000. Stop an existing development server first if it uses
the same port.

`typecheck` generates Next.js route types before checking strict TypeScript, so
it also works before the first build.
The home page, unit tests, and production build require no environment variables.
The `/auth`, `/organizations`, and `/api/organizations` routes require the
Supabase setup below.

GitHub Actions runs the validation sequence on every push and pull request using
an Ubuntu runner and the Node version in `.nvmrc`. It caches npm downloads;
dependencies are always installed with `npm ci`. It does not deploy the app.
Keep `.nvmrc` and the container image's Node version aligned when upgrading;
update the image digest at the same time.

### Development tools

- **Prettier** formats source, configuration, and README files. It respects
  `.gitignore`; `.prettierignore` additionally preserves repository instructions,
  reference docs, and the npm-generated lockfile. ESLint remains responsible for
  code-quality rules; no formatter plugin is needed.
- **Vitest** runs TypeScript unit tests in Node with the `@/*` alias. The one
  smoke test renders the existing synchronous home page using React's existing
  server renderer and checks its heading. It needs no browser or DOM emulator.
  Organization page tests await the server function with mocked authorization
  before rendering its result; these do not replace browser tests of the full flow.
- **GitHub Actions** runs the automated checks using the official checkout and
  setup-node actions. **Docker Desktop** and **VS Code Dev Containers** provide
  the shared local environment; neither is an application dependency. See the
  [Dev Containers setup guide](https://code.visualstudio.com/docs/devcontainers/containers).

Supabase dependencies and database testing are documented below.

ESLint 9 is pinned because the React, accessibility, and import plugins used by
the current Next.js preset declare support through ESLint 9. npm marks this
ESLint release as unsupported; review an upgrade when those plugins support the
next major version.

## Scaffold files and folders

| Path                              | Purpose                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `.gitignore`                      | Excludes dependencies, build output, generated types, local environment files, and machine logs.                     |
| `.gitattributes`                  | Keeps text checkouts on LF line endings across platforms while preserving binary files.                              |
| `.nvmrc`                          | Pins Node.js 24.21.0 for reproducible CI, within the runtime range in `package.json`.                                |
| `.prettierrc.json`                | Uses Prettier defaults with explicit LF line endings.                                                                |
| `.prettierignore`                 | Excludes reference documents, agent instructions, and the generated lockfile from formatting.                        |
| `.devcontainer/devcontainer.json` | Defines the pinned Linux/Node development environment, non-root editor user, automatic install, and port forwarding. |
| `.github/workflows/ci.yml`        | Defines the GitHub Actions install, formatting, lint, typecheck, test, and production-build job.                     |
| `vitest.config.mts`               | Configures Node-based tests under `src/` and resolves the `@/*` alias without an extra plugin.                       |
| `package.json`                    | Declares runtime and development dependencies, plus development, formatting, testing, and validation commands.       |
| `package-lock.json`               | Locks npm dependency versions for reproducible installs with `npm ci`.                                               |
| `tsconfig.json`                   | Enables strict TypeScript and Next.js types; maps `@/*` to `src/*`.                                                  |
| `eslint.config.mjs`               | Enables Next.js Core Web Vitals and TypeScript lint rules while excluding generated files.                           |
| `src/`                            | Contains application source code.                                                                                    |
| `src/app/`                        | Contains App Router routes, the root layout, and global styles.                                                      |
| `src/app/layout.tsx`              | Provides the required HTML/body layout, document language, page title, and global stylesheet import.                 |
| `src/app/page.tsx`                | Provides a minimal `/` route to verify that the application renders.                                                 |
| `src/app/page.test.ts`            | Verifies the test runner can import and render the existing home page.                                               |
| `src/app/globals.css`             | Adds basic sizing, spacing, and system typography without a styling dependency.                                      |

This existing README now documents setup and the scaffold. `AGENTS.md` and the
architecture blueprint in `docs/` remain unchanged.

npm creates `node_modules/` for installed dependencies. Next.js creates `.next/`
for build output and route types, and `next-env.d.ts` for framework type
references. TypeScript creates `tsconfig.tsbuildinfo` for incremental checks.
These generated files and folders are ignored by Git and should not be edited.

## Architecture scope

The [architecture blueprint](docs/small_fleet_platform_architecture_blueprint_v2_2.docx)
recommends a monorepo in section 3 and includes it in the recommended build
sequence in section 21. This is a recommendation, not a settled repository
structure. The current direction is one Next.js application at the repository
root. Future repository restructuring requires concrete justification and
explicit authorization.

App Router files contain presentation only. Future domain rules, tenant
authorization, and infrastructure follow the blueprint's boundaries rather
than being placed in React components. The backend includes authentication, organizations, memberships, and the initial
Asset/Vehicle domain. Offline sync and other feature
modules remain outside scope.

The smoke test only verifies the test setup and existing page rendering.
Tenant-isolation tests are described below. Add further domain and workflow
tests with the relevant features.

## Supabase backend

The integration follows blueprint sections 12–14 and 16: managed identity,
server-side tenant checks, and database RLS. Application tables include `organizations`, `memberships`, `assets`, and
`vehicle_profiles`. Memberships reference `auth.users.id`
directly; there is no separate users/profile table or custom identity system.
The cookie setup follows the [Supabase Next.js SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs).

### Local setup

Use a native terminal with Node 24 and Docker Desktop running:

```sh
npm ci
npm run db:start
npx supabase status
```

Starting Supabase applies the version-controlled migrations. Copy `.env.example`
to `.env.local`, then set the URL and **publishable** key from the status output.
Use an `sb_publishable_...` key; legacy JWT anon keys are not accepted. Never use
a secret or service-role key in these browser-visible variables. Restart Next.js
after changing environment values; production public values are set at build time.

The existing devcontainer does not expose the host Docker socket. Run the
Supabase CLI on the host, or use a separate hosted development project from the
container. For a host-local Supabase instance accessed by a container app, ensure
the configured URL is reachable by both the browser and Next.js server.

Local email/password signup and email confirmation are enabled. Visit `/auth`
to sign up. Open the local email inbox URL reported by `supabase status` to find
the confirmation email, then follow its link. The versioned confirmation template
points at `/auth/confirm`, which verifies the token and establishes session cookies.
Restart local Supabase after changing `config.toml` or its email template.

### Hosted project setup

1. Create a dedicated development Supabase project. Keep production separate.
2. Apply the committed migration with the CLI (review the linked project first):

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

3. Set `.env.local` to the project URL and publishable key from the project's
   Connect dialog. Configure the same values in your deployment environment.
4. In Auth settings, enable the email provider and **Allow new users to sign up**.
   Keep **Confirm email** enabled. Local `config.toml` does not update hosted settings.
5. Set the Auth **Site URL** to the exact application origin (for example
   `http://localhost:3000` in development, your HTTPS origin in production).
6. Set the **Confirm signup** email template to the contents of
   `supabase/templates/confirmation.html`. Its link is:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
     >Confirm email</a
   >
   ```

   Configure SMTP delivery for real users. The confirmation handler accepts only
   email verification tokens and redirects to a fixed `/organizations` destination.

No service-role credential or manual membership provisioning is needed. An account
starts with no organization memberships. Organization creation grants its creator
an active Owner membership. To revoke access administratively, set membership
`status` to `revoked`; subsequent server queries check the current database
membership, even with an existing Auth token. Organization and Auth user deletion
remain restricted while memberships reference them.

### Validate the complete flow

1. Run `npm run dev` and visit http://localhost:3000/auth.
2. Enter an email/password and select **Sign up**. Confirm the email using the
   delivered link. If confirmation is disabled in a development project, signup
   immediately opens the organization page instead.
3. Sign in at `/auth` when needed. `/organizations` renders only memberships
   authorized by the server. A new user initially sees an empty list.
4. Submit an organization name. The organization appears in the list and its
   creator receives the Owner role. Timezone initially defaults to UTC.
5. Sign out through **Account and sign out**. Visiting `/organizations` redirects
   to `/auth`, and `GET /api/organizations` returns 401.
6. Sign up a second user: they cannot see the first user's organizations.
   Revoking a membership removes access on the next server request or refresh;
   an already rendered page is not a live revocation notification.

`GET /api/organizations?organization_id=UUID` still supports scoped access checks:
foreign or missing IDs return 404 and malformed IDs return 400. Organization
creation uses same-origin `POST /api/organizations` with JSON `{ "name": "..." }`.
It rejects missing/foreign origins, invalid input, and client-supplied ownership
fields. These app endpoints use session cookies, not a mobile bearer-token API.

Auth server actions validate credentials and delegate to Supabase Auth. Protected
queries and creation commands use `auth.getUser()` to verify the session.
Responses are private and non-cacheable. The proxy refreshes cookies on `/auth`,
`/organizations`, and `/api/organizations`; extend its matcher for future routes.

### Schema and access policy

`supabase/migrations/20260916000000_organizations_and_memberships.sql` creates:

- `organizations`: UUID ID, nonblank bounded name, `active`/`archived` status,
  timezone (defaults to UTC), creation timestamp.
- `memberships`: composite primary key `(organization_id, user_id)`, foreign
  keys to organizations and Supabase Auth users, role, `active`/`revoked` status,
  creation timestamp, and an index for active membership lookups by user.

Roles are `owner`, `admin`, `driver`, and `read_only`, corresponding to the
blueprint's initial role families. Membership management remains deferred; vehicle access follows the role policy
documented below. Archived
organizations remain readable to their active members, preserving historical
access. Timezone is stored as nonblank text; scheduling and IANA timezone
validation are deferred until timezone-dependent behavior exists.

Both tables enable RLS. `memberships_select_own_active` exposes only the caller's
own active memberships. `organizations_select_member` requires an active
membership in that organization. Anonymous callers have no table privileges.
Authenticated callers have SELECT only, with no INSERT/UPDATE/DELETE policies;
direct writes cannot create organizations, join other tenants, or promote users.
The read policy lookup does not recurse.

`20260917000000_create_organization.sql` adds the single atomic creation function.
It accepts only a name, obtains the owner from `auth.uid()`, validates the name,
and inserts both records in the same transaction. A failed membership insert
rolls back the organization too. This narrow `SECURITY DEFINER` function is needed
to bootstrap an organization before a membership exists, without granting general
INSERT access. It has an empty search path, fully qualified object references,
and EXECUTE granted only to `authenticated`, with an internal null-identity guard.
Existing RLS policies and table grants are unchanged. No new tables are added.
Postgres administrators and Supabase's service role bypass RLS by design and
must never be used for tenant requests.

### Tests and migration workflow

```sh
npm test
npm run typecheck
npm run lint
npm run db:start
npm run test:db
```

The pgTAP suite at `supabase/tests/tenant_isolation.test.sql` runs against the
actual local Supabase database. It provisions two organizations and five Auth
identities in a transaction, switches to the real `authenticated`/`anon` roles,
and sets JWT claims. Its 31 assertions cover cross-tenant reads in both
directions, direct foreign UUID lookups, own-membership visibility, spoofed
organization metadata, multiple memberships, outsiders, revoked memberships,
immediate revocation with unchanged claims, anonymous access, unauthorized
writes and self-promotion. It also temporarily grants write privileges to prove
RLS independently blocks writes. All fixtures and grant changes roll back.
These are database authorization tests, not SDK mocks.

`supabase/tests/organization_creation.test.sql` adds 19 assertions for anonymous
and missing identities, input constraints, owner identity/role/status, atomic
rollback, isolation between newly created organizations, and owner revocation.

Vitest additionally checks environment validation, verified user checks,
application membership scoping, invalid/foreign organization IDs, error handling,
private response caching, refreshed-cookie propagation, signup/sign-in/sign-out,
confirmation token handling, creation auth boundaries, rejected ownership inputs,
and cross-origin mutation protection. These unit tests do
not replace the database suite. GitHub Actions runs a separate Docker-backed
Supabase job, applies migrations, and runs pgTAP.

For future changes, create a migration with `npx supabase migration new NAME`.
Use `npm run db:reset` only on disposable **local** data: it erases local records
and reapplies migrations. `npm run db:types` prints generated TypeScript types;
after a successful generation, replace `src/lib/supabase/database.types.ts` with
the output. The checked-in types mirror the committed migrations. Review migrations
and run the database suite before `supabase db push` against a hosted project.

### Application files and dependencies

- `src/lib/supabase/`: public environment validation, typed browser client,
  server-only cookie client, schema types, and environment tests.
- `src/proxy.ts`: Auth cookie refresh and cache prevention, with a regression test.
- `src/modules/organizations/queries.ts`: verified identity, current membership
  lookup, and scoped organization reads, with unit tests.
- `src/modules/organizations/commands.ts`: authenticated organization creation.
- `src/app/api/organizations/route.ts`: organization reads/creation, input and
  origin validation, with route tests.
- `src/modules/auth/actions.ts`: signup, sign-in, and sign-out server actions.
- `src/app/auth/`: minimal auth form and email confirmation handler.
- `src/app/organizations/`: protected list and organization creation form.
- `.env.example`, `supabase/config.toml`, migration, and database test suite:
  environment template and reproducible database setup.

Runtime dependencies: `@supabase/supabase-js` (typed Auth/Data API SDK),
`@supabase/ssr` (cookie-based Next.js sessions), and `server-only` (prevents server
adapters from being imported into browser code). Development dependency:
`supabase` (pinned CLI for local services, migrations, types, and pgTAP).

## Initial Asset and Vehicle domain

The approved domain decisions are implemented in
`supabase/migrations/20260922000000_assets_and_vehicles.sql`:

- `assets` owns organization scope, display name/number, operational status,
  make/model/year, description, timestamps, and `archived_at`.
- `vehicle_profiles` owns VIN, license plate, and jurisdiction. A composite
  foreign key enforces the same organization and vehicle subtype as its asset.
  Future equipment can add a subtype and profile in a later migration; no
  equipment workflows or tables are implemented now.
- Only display name/number is required. Names are trimmed and use exact,
  case-sensitive uniqueness within an organization while non-archived. Archived
  names may be reused. VINs are trimmed and uppercased, with organization-level
  uniqueness including archived records; multiple null VINs are allowed. There
  is no VIN format/check-digit requirement or globally unique plate constraint.
- Status is `active` or `out_of_service`. Archiving preserves both records and
  operational status. Archived vehicles remain readable but cannot be edited or
  restored. Repeating an archive is safe and preserves the first archive time.
- Owner/admin members may create, read, edit, and archive. Read-only members may
  read, including archives. Drivers, revoked members, outsiders, and anonymous
  callers have no vehicle-management access. Existing organization membership
  visibility and creation behavior are unchanged.

`src/modules/assets/` owns validation, authorization, commands and queries;
React components handle presentation and interaction. Reads verify the Auth user
and current membership before querying with explicit organization scope. RLS
independently restricts both tables. Authenticated users receive SELECT only;
there are no direct-write RLS policies. Narrow `SECURITY DEFINER` functions
revalidate current owner/admin membership, use an empty search path and explicit
tenant predicates, and commit asset/profile writes atomically. Edits and archive
serialize on the asset row so an archived vehicle cannot be edited. No service
role credential is used for application requests.

Open **Organizations → Vehicles** to list current vehicles, add one, open its
identification details, edit it, or archive it. **View archived vehicles** opens
historical records. The pages and API live under existing session-refresh paths:

- `GET/POST /api/organizations/:organizationId/vehicles` lists/creates vehicles.
  `?archived=true` selects the archived list.
- `GET/PUT /api/organizations/:organizationId/vehicles/:assetId` reads/replaces
  vehicle details. PUT accepts the complete editable form; omitted optional
  fields are cleared.
- `POST /api/organizations/:organizationId/vehicles/:assetId/archive` archives
  with an empty JSON object `{}`.

Mutations require same-origin JSON requests and use existing session cookies.
Responses are private and non-cacheable. Admin workflows are online-first;
network failures remain visible and prompt checking the list before resubmission.
The Asset/Vehicle workflow remains focused on identity and status; the mileage
workflow is documented below. Maintenance, issues, expenses, and driver
assignments remain outside scope.

### Apply and verify

No new Auth settings, environment variables, service keys, or manual table/RLS
configuration are required. Apply the migration through the CLI to the intended
Supabase project after reviewing and testing it; do not manually edit its schema.
For an already-running local Supabase instance, apply pending migrations with
`npx supabase migration up --local`. For a fresh local instance, use
`npm run db:start`. With Docker/Supabase running, run `npm run test:db`.
For a hosted project, verify its project reference, then run `npx supabase db push`.
Hosted migrations have not been applied by this implementation task.

`supabase/tests/vehicles.test.sql` exercises actual database roles/RLS, both
asset and profile visibility, cross-tenant writes, all membership roles,
revocation with unchanged JWT claims, atomic rollback, uniqueness, archive
immutability, tenant foreign keys, and direct-write denial even after temporarily
granting table writes. Fixtures roll back. The existing Docker-backed CI job
runs this suite automatically. Vitest covers input validation, application
membership checks, scoped queries/commands, HTTP origin checks and errors, and
server-rendered management/read-only/archive/empty states.

Manual review: after applying the migration, sign in as an owner and create,
view, edit, and archive a vehicle; check the archived list, name reuse, duplicate
VIN rejection, and optional-field clearing. Repeat view/write attempts with
read-only, driver, and other-organization accounts. The automated rendering
tests do not exercise browser form submission against a live Supabase instance.

## Vehicle mileage and odometers

Open a vehicle, then **Mileage and odometer history**. Owners/admins can initialize
mileage, add readings, correct entries, void ordinary readings, and record a
physical replacement/reset. Read-only members can review history. Drivers have
no mileage access. Archived vehicles retain history without mutation controls.

The approved initial meter contract is:

- Choose miles (default) or kilometers at initialization; the unit is immutable.
  Physical and accumulated values support exact tenths, from 0 to 999999999.9.
- Initial accumulated usage defaults to the physical reading. A higher known
  value requires an explanation and is explicitly a declared baseline.
- Original entries and every revision remain immutable to application users.
  Corrections append complete replacement values with actor, recorded time,
  reason, and predecessor revision. Observation time and unit remain fixed.
  Voids apply only to ordinary readings; an explicit correction can restore one.
- Replacement events delimit physical-meter periods within the same logical
  asset meter. At replacement, accumulated usage increases by **old final minus
  preceding physical reading**. The new starting reading contributes zero.
  Later readings add their difference from that new physical baseline.
- Backdated ordinary readings must fit their chronological neighbors, including
  replacement boundaries. Future times, duplicate observation times (including
  voided entries), and readings before initialization are rejected. New
  replacements must follow all existing observation times. Corrections to old
  replacement values are supported and revalidate all affected periods.

`src/modules/meters/` owns the application commands, validation, and queries.
`meters` belongs to an Asset; `meter_entries` stores original baseline, reading,
and replacement events; `meter_revisions` stores appended corrections/voids.
Physical periods are represented by replacement boundaries, without creating a
new logical meter. Meter type, unit, and source are explicit; this increment
accepts only vehicle odometers and manual admin entry. Engine-hours and OBD can
extend these contracts without changing the physical/logical usage distinction.

`meter_history` calculates effective accumulated usage using PostgreSQL exact
numeric arithmetic. The same calculation validates writes transactionally, so
invalid corrections roll back completely. It runs with invoker permissions and
RLS for reads. `record_meter_command` checks current owner/admin membership,
locks the asset against concurrent mileage/archive commands, and revalidates the
whole effective history. Authenticated users have SELECT-only table privileges
and no direct-write RLS policies. Tenant foreign keys reinforce isolation.
No history is silently rewritten, and no separate accumulated-value cache can
drift from the effective evidence.

`GET/POST /api/organizations/:organizationId/vehicles/:assetId/mileage` uses
existing session cookies, same-origin JSON mutation checks, and private/no-store
responses. POST accepts an explicit action and UUID command ID; identical retries
return the prior result without applying usage again. Reusing that ID with a
different payload is rejected. Corrections require the expected revision ID to
reject stale edits. The UI retains the command ID for an unchanged form retry;
this is online retry protection, not an offline queue. Decimal values cross the
API as strings to preserve exact tenths.

### Mileage migration and verification

Review `supabase/migrations/20260923000000_vehicle_meters.sql` before applying it.
No hosted Supabase changes were made. Docker is not required on developer
machines: the existing GitHub Actions database job starts its own Supabase and
automatically runs `supabase/tests/meters.test.sql` alongside the existing suites.
The migration and pgTAP tests require that CI validation before hosted use.
Database types were mirrored manually; local type generation was not run.

Application validation includes `npm test`, `npm run typecheck`, `npm run lint`,
`npm run format:check`, and `npm run build`. Unit, service, HTTP, and rendering
tests do not substitute for real database or authenticated browser verification.

After CI passes and you apply the migration to hosted development:

1. Sign in as an owner/admin, open an existing vehicle, and follow **Mileage and
   odometer history**. Initialize at 100 miles, then add a later reading of 150.
   Confirm both physical and accumulated values show 150.
2. Replace the odometer at a later time: old final 200, new starting 10, with a
   reason. Confirm physical 10 and accumulated 200. Add a later reading of 30;
   confirm accumulated 220. A second replacement with old final 50 and new
   starting 1000 should show accumulated 240, then a reading of 1010 gives 250.
3. Correct the first replacement's old final from 200 to 210. Confirm current
   accumulated usage becomes 260. Expand the audit history and verify the
   original replacement and correction remain visible with actors and reasons.
4. Void the latest ordinary reading with a reason; confirm current values revert
   to the last effective observation. Correct and restore it, then inspect both
   revisions. Try an inconsistent correction and confirm the save is rejected.
5. Add a backdated reading between existing readings in the same physical
   period. Try a value outside its neighbors, a duplicate time, a future time,
   and a historical replacement; each invalid submission should be rejected.
6. Use another vehicle to initialize kilometers and a higher known accumulated
   baseline with a reason. Confirm the chosen unit persists and cannot be edited.
7. Repeat access checks as read-only, driver, and another organization's member.
   Confirm read-only has no write controls, drivers/outsiders cannot load the
   mileage page/API, and archived vehicles retain history but reject writes.

Authenticated browser verification and real database execution remain unrun in
the Docker-free local environment; neither hosted migration nor deployment is
part of this implementation.

## Browser regression suite (Playwright)

`npm run test:e2e` runs the real Next.js application against a **dedicated,
empty hosted Supabase E2E project**, with real Auth users and browser sessions.
No authorization responses are mocked. The current Playwright release is pinned
in `package-lock.json`; no downgrade is required for the 2017 MacBook Pro.
Run browsers on a supported PC/Mac or on the Ubuntu GitHub Actions runner.
The 2017 Mac can still run unit checks and `npm run test:e2e -- --list`.

The existing project `kgmxzjnqowsishsiyjug` is FleetFalcon's development project,
regardless of Supabase's default `main (production)` branch label. It contains
existing development data and is **blocked in the E2E target validator**. A
separate customer-facing production project does not currently exist; add any
future production refs to `E2E_PROTECTED_PROJECT_REFS` before running the suite.
There is no fallback to `.env.local` or to development project credentials.

### One-time hosted setup (performed by the project owner)

1. Create a separate hosted Supabase project, for example `fleetfalcon-e2e`,
   with no customer or existing development data. Record its distinct project
   ref and URL. Do not reuse the existing project's admin key.
2. Run the existing migration/pgTAP CI checks first. Review and apply **all
   committed migrations**, including the meter migration,
   to this new project. Use a separate checkout for `supabase link --project-ref`
   and `supabase db push` so the development checkout's link stays intact. These
   hosted CLI operations need no local Docker. The browser runner never applies
   migrations, resets a database, or changes Auth/project settings.
3. Enable email/password authentication and email confirmation. Use the standard
   Auth flow without CAPTCHA in this isolated test project. Accounts are created
   via Auth Admin; confirmation tests use generated Auth links with the real
   `/auth/confirm` handler. No SMTP/mailbox is needed for these tests.
4. In GitHub, create the **`fleetfalcon-e2e` environment**. Restrict it to the
   repository's default branch and configure required reviewers where supported
   by your GitHub plan. Protect that branch and review changes to workflows and
   fixture code before approving runs. Do not expose these credentials to
   untrusted PRs, forks, or `pull_request_target` workflows.
5. Configure the following **environment variables** and **environment secrets**:

| Kind     | Name                           | Value                                                               |
| -------- | ------------------------------ | ------------------------------------------------------------------- |
| Variable | `E2E_TARGET_ENVIRONMENT`       | `isolated-e2e`                                                      |
| Variable | `E2E_SUPABASE_PROJECT_REF`     | New dedicated E2E project ref                                       |
| Variable | `E2E_SUPABASE_URL`             | Exactly `https://<E2E ref>.supabase.co`                             |
| Variable | `E2E_PROTECTED_PROJECT_REFS`   | `kgmxzjnqowsishsiyjug`, plus comma-separated future production refs |
| Secret   | `E2E_SUPABASE_PUBLISHABLE_KEY` | Dedicated E2E project's publishable key                             |
| Secret   | `E2E_SUPABASE_ADMIN_KEY`       | Dedicated E2E project's secret key or legacy service-role key       |

Environment protections are configured in GitHub, not created by the workflow.
If your repository/plan cannot provide the required protections, resolve that
before storing the privileged secret and enabling hosted runs. See
[GitHub environment protections](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

### GitHub Actions execution

After the configuration and migrations are reviewed, merge the suite onto the
trusted default branch. Open **Actions → Hosted E2E → Run workflow**, select that
branch, type the dedicated project ref, and confirm fixture creation/deletion.
The workflow refuses a mismatched ref and uses a fresh Ubuntu runner. It installs
Chromium and its Linux libraries directly; it does not install or run Docker.
The existing pgTAP database CI job is unchanged and remains a separate check.

Before fixture creation, a preflight verifies the approved URL/ref, checks admin
access against that exact project's Auth endpoint without listing users, and
checks that all required tables exist without retrieving business records.
Missing migrations fail the run; the workflow never silently skips meter tests.
Admin credentials are injected only into preflight, test, and cleanup steps,
not dependency installation. Next.js and Chromium receive a separately
allowlisted environment containing no fixture-admin credential.

Runs are serialized (`cancel-in-progress: false`) to reduce rate-limit pressure
and allow teardown to finish. The workflow is manual-only, not a push/PR trigger.
Reports, failure screenshots, Next.js logs, and recovery manifests are uploaded
with seven-day retention, even after a test failure. Traces/video are disabled to
avoid retaining credential-bearing network traffic. Artifacts still contain
synthetic test data and may contain short-lived test confirmation links; treat
them as private debugging evidence.

### Local execution on a compatible PC or Mac

Use Node 24 and a supported Playwright host. Stop `npm run dev` in this checkout
first: the E2E runner owns port 3210 and the checkout's Next.js development build.
It refuses to reuse an existing server.

```sh
npm ci
npx playwright install chromium
```

Copy `.env.e2e.example` to **`.env.e2e.local`** and fill it with the dedicated E2E
project values above. The file is ignored by Git. Never place the admin key in
`.env.local`, a `NEXT_PUBLIC_*` variable, an application module, or a test report.
Then run:

```sh
npm run test:e2e -- --preflight
npm run test:e2e
```

`npm run test:e2e -- --list` discovers tests without credentials, a browser,
server startup, or hosted requests. Normal execution launches its own local
Next.js server and runs Chromium with one worker and no automatic retries.
The server and browser both use `http://localhost:3210`. Keep this hostname:
Next.js normalizes loopback IP request URLs to `localhost`, so using
`127.0.0.1` in the browser causes same-origin mutation checks to fail and
confirmation redirects to leave the hostname holding the session cookies.
`npm test` also includes unit tests of target blocking, process-environment
sanitization, and recovery-manifest validation.

### Fixture scope, teardown, and interrupted runs

Each test gets fresh accounts, organizations, and uniquely named vehicles under
an `ff-e2e-<run UUID>-<fixture UUID>` namespace. Test passwords remain in memory.
The Node-only admin client is restricted to account provisioning, confirmation
link generation, membership setup/revocation, identity checks, and cleanup.
Organizations and vehicles are created through browser forms; meter workflows
also use forms. Forbidden API requests and idempotent replays use the browser's
ordinary user cookies, never the admin credential.

Each fixture journals intended Auth UUIDs and organization names/owners before
creation, then records confirmed organization IDs. The ignored
`.e2e-runs/<run UUID>/` folder contains recovery manifests without passwords or
admin keys. Cleanup verifies project identity, Auth metadata, exact organization
identity, ownership, membership scope, vehicle names, and meter audit actors.
Any unexpected identity/data stops cleanup for manual review.

Before deleting, cleanup persists an exact-ID inventory. It deletes only those
IDs with tenant predicates, in foreign-key order: revisions, entries, meters,
profiles, assets, memberships, organizations, then the exact Auth users. It does
not scan/delete arbitrary organizations or reset the hosted database. Teardown
runs after both success and failure. An `always()` CI step retries incomplete
cleanup; its separate report does not overwrite the original failure report.

A killed process, runner loss, or Supabase outage can still prevent teardown.
Retain/download the run artifact and restore its contents to
`.e2e-runs/<original run UUID>/` in a trusted checkout. Review the manifests and
configure the **same isolated project**, then recover only that run:

```sh
# macOS/Linux
E2E_RUN_ID=<original-run-uuid> npm run test:e2e -- --cleanup
```

```powershell
# Windows PowerShell
$env:E2E_RUN_ID = "<original-run-uuid>"
npm run test:e2e -- --cleanup
Remove-Item Env:E2E_RUN_ID
```

Repeated cleanup is safe; missing rows from a partially completed teardown are
accepted, while new/unrecognized IDs stop recovery. Do not delete manifests until
cleanup is confirmed. If the runner dies before artifacts upload, use manual
project-admin review of the test account metadata and names; there is deliberately
no broad automatic stale-fixture deletion command.

### Coverage and remaining verification

The browser suite contains seven automated workflow tests plus one explicitly
skipped delivered-email test:

- Real login/logout, invalid credentials, protected pages/APIs, generated-link
  email confirmation, fixed redirects, and rejection of reused/invalid links.
- Organization creation, owner access, all membership roles, live-session
  revocation, outsiders, and cross-organization IDs and role differences.
- Vehicle creation/editing, optional-field clearing, normalized VIN/name
  uniqueness, cross-tenant reuse, archiving, archived name reuse/VIN reservation.
- Miles/kilometers, declared baselines, exact tenths, backdating and rejection
  cases, corrections, void/restoration audit evidence, repeated physical
  replacements, accumulated-usage continuity, idempotent replay, and archives.

**Not yet verified against hosted Supabase:** the new browser suite, its hosted
preflight, and fixture cleanup. The dedicated project/environment still needs
owner setup and a first approved Actions run. Test discovery and static/unit
checks do not establish that hosted workflows pass. The complete signup →
delivered email → browser confirmation flow stays explicitly skipped until a
controlled test mailbox is configured. No product behavior was changed for E2E.

## Maintenance templates, vehicle schedules, and dashboard

The maintenance increment adds organization templates and separate asset-owned
assignments. Owners/admins manage them; read-only members can view them. Drivers,
revoked members, outsiders, and anonymous callers retain their existing restricted
access. The dashboard is linked from Organizations and Vehicles.

### Approved maintenance semantics

- A template/schedule uses distance, calendar time, or both. Distance uses the
  initialized odometer's existing `mi` or `km` unit without conversion. Calendar
  intervals are whole days, weeks, months, or years; calendar-only schedules do
  not require a meter.
- An assignment requires explicit next-due accumulated usage and/or a next-due
  calendar date for its configured dimensions. Past targets are allowed. Creating
  a schedule does not assert that service occurred.
- Upcoming and due windows are independently configurable integer percentages,
  defaulting to 10% and 5%, with `0 <= due <= upcoming <= 100`. Outside upcoming
  is **Not due**; within upcoming but outside due is **Upcoming**; within due
  through the target is **Due**; any usage/date past the target is **Overdue**.
  Combined schedules expose the more urgent dimension.
- Distance calculations use exact integer tenths and the meter domain's logical
  accumulated usage, including corrections, voids, and odometer replacements.
  Meter changes recompute status without moving schedule targets.
- Calendar status uses the organization's local date. Month/year arithmetic
  clamps to the last valid day of the destination month. Calendar window lengths
  are calculated from the number of days between the next-due date and that date
  shifted backward by the calendar interval; percentage windows round upward to
  whole days. UTC date arithmetic avoids DST changing calendar-day distances.
  Status is evaluated on reads; there are no scheduled jobs in this increment.
- Assignment settings are copied from the template. Later template edits apply
  only to future assignments; existing assignments have explicit edit controls.
  A vehicle has at most one assignment of a given template. Optimistic versions
  reject stale template/schedule edits rather than overwriting newer changes.
- Pausing a schedule retains its targets and suppresses its alerts. Disabling a
  template suppresses all linked alerts and prevents new assignments. Re-enabling
  or resuming evaluates the retained targets against current usage/date.
- Archived vehicles retain readable schedules but reject schedule changes and
  never contribute active alerts or setup warnings. Non-archived out-of-service
  vehicles still contribute maintenance alerts.
- The dashboard orders Overdue, Due, then Upcoming items, with stable vehicle/name
  ordering within each group. It shows targets, remaining/overdue distance/days,
  and the last mileage observation date. Vehicles lacking mileage or any assigned
  schedules appear separately under Finish setup; paused/disabled schedules do
  not masquerade as missing setup.

`src/modules/maintenance` owns validation, deterministic status calculation, and
application queries/commands. UI components render those results. Existing asset
access checks are reused because maintenance has exactly the same role boundary;
the database command independently validates active membership. RLS reinforces
all reads, composite foreign keys enforce tenant ownership, and a trigger checks
that a schedule's meter belongs to its asset and uses the same unit. Ordinary
clients have no direct table mutation grants or write policies.

Stable assignment IDs are the future service-history integration point. A future
qualifying service can reference the assignment and atomically advance distance to
`accumulated usage at service + distance interval`, calendar time to
`service date + calendar interval`, or both. This increment does not create service
records, completion actions, documents, notifications, offline queues, or jobs.

### Maintenance migration and verification

Review `supabase/migrations/20260924000000_maintenance.sql`. It creates
`maintenance_templates`, `maintenance_assignments`, their constraints/RLS, the
`save_maintenance` command, and an invoker-security `maintenance_usage` read that
reuses `meter_history`. Existing vehicles receive no automatic schedules or
inferred maintenance targets. No existing meter/vehicle data is rewritten.

1. Run the existing CI validation and database jobs on the feature branch. The
   database job starts local Supabase, applies all migrations, and automatically
   runs `supabase/tests/maintenance.test.sql` alongside existing pgTAP tests.
2. With an already-running **local** Supabase instance, apply the migration using
   `npx supabase migration up --local`, then run `npm run test:db`. Review generated
   types using `npm run db:types` against the checked-in schema types.
3. Before any hosted use, a human must review and apply the migration to the
   intended environment. This implementation does not modify hosted Supabase.
4. After the dedicated E2E project's schema is updated through that separate
   process, run the existing **Hosted E2E** workflow against the feature branch,
   with its existing project-ref confirmation and fixture-cleanup authorization.
   The workflow remains manually dispatched and runs the selected branch; it
   never applies migrations. Preflight now requires both maintenance tables.
   Exact-ID fixture inventory/cleanup includes schedules before templates/meters
   and remains compatible with recovery manifests from before this increment.
5. Manually verify a miles or kilometers schedule near each window boundary, a
   calendar-only schedule without mileage, and a combined schedule with different
   urgency in each dimension. Verify organization-date/month-end behavior; edit
   targets and windows; replace/correct a meter; pause/resume; disable/enable the
   template; and archive the vehicle. Confirm dashboard priorities, retained
   targets, and owner/admin versus read-only/driver behavior.

The added Playwright workflows exercise distance status transitions through a
physical replacement and correction, template snapshot independence, pause and
resume, disable and enable, archival, calendar-only setup, combined-threshold
priority, kilometer/unit validation, and real-session role/tenant/revocation
boundaries. They use the existing runner, fixtures, and hosted safety checks.

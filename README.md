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
No meters, maintenance, issues, expenses, or driver assignments are added.

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

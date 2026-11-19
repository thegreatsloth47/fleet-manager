# Hosted E2E repair automation

The local [runner](./repair.mjs) orchestrates the existing
[Hosted E2E workflow](../.github/workflows/e2e.yml). It uses the existing GitHub
runners and dedicated Supabase environment. It adds no hosting service, API key,
package dependency, scheduler, or merge operation. Codex runs locally using a
ChatGPT login; subscription usage limits and existing Actions quotas still apply.

## Execution

Use Node 24, working Git, authenticated GitHub CLI, and Codex CLI authenticated
through `codex login` with ChatGPT. The runner rejects API-key authentication and
removes API keys and database credentials from child-process environments.
GitHub authentication must be stored through `gh auth login`, with repository
push, Actions read/write, and environment variable/secret-name read access.
Secret values are never fetched. Git push must also be authenticated.

Preflight can inspect credentials and environment metadata before committing.
For execution, commit the implementation and automation changes on the intended
development branch, then invoke:

```sh
npm run e2e:repair -- --branch f/setup-environment --project-ref <isolated-e2e-ref> --check
npm run e2e:repair -- --branch f/setup-environment --project-ref <isolated-e2e-ref>
```

The project ref must match GitHub's `fleetfalcon-e2e` environment. The explicit
invocation authorizes suite-owned fixture creation/cleanup in that isolated
project. The existing target validator blocks the known development project and
all configured protected project refs. Keep future production refs in that list.
The workflow's preflight verifies actual credentials, project identity and
required tables before browser fixture writes; metadata checks alone cannot
verify a live Supabase environment. Environment reviewers and branch restrictions
remain in force. The workflow must already be registered on the default branch;
the dispatched development ref must contain the correlation-input change.

The runner:

1. Requires a clean checkout on the explicitly selected non-default branch.
2. Checks CLI authentication, environment variables and required secret names.
3. Runs formatting, lint, type checking, unit tests, automation tests and build.
4. Pushes without force and dispatches Hosted E2E with a unique correlation ID.
5. Polls the exact run and verifies its commit SHA and executed browser step.
6. Retrieves failed job logs and available E2E artifacts into private local storage.
7. Stops on infrastructure, cleanup or unknown failures. An assertion failure
   receives one unchanged retry. A passing retry is reported as intermittent,
   not proof of a fix. Different assertion locations also require review.
8. Gives repeated assertion locations and matcher names to Codex in a separate
   local clone. The clone has no origin, ignored environment files or raw artifacts.
   Arbitrary log text, expected/received values and confirmation URLs never enter
   the prompt. Codex can inspect the referenced test source for context.
9. Rejects changes outside application source, changes to existing tests, known
   security paths, access-control-related diff lines, and file-mode/link changes.
   Runs local validation in the clone before applying, committing and pushing.
10. Allows at most three Codex attempts, including locally invalid repairs, and
    at most eight E2E runs. Local validation failures consume attempts. Protected
    changes or interrupted repairs stop for human review.
11. Requires the existing CI workflow, including database tenant-isolation tests,
    to pass for the same commit before declaring completion.

The security diff filter is deliberately conservative and cannot prove semantic
correctness. Human code review remains necessary before any merge. Recurring
infrastructure failures are not disguised as application defects; repeated
assertions are only application-defect candidates, not certain diagnoses.

## Resume and evidence

State and reports are under the ignored `.e2e-runs/automation/` directory:
`state.json`, `report.txt`, per-run logs/artifacts, and retained repair clones.
The state file is atomically replaced after each transition. The report includes
commit, run links, classification, repair count and outcome. Treat all evidence
as private: downloaded artifacts may contain synthetic account data or temporary
confirmation links. Log redaction is defense in depth, not a guarantee that
arbitrary artifact contents are safe to publish. Never upload this directory to
an agent prompt or commit it.

```sh
npm run e2e:repair -- --branch f/setup-environment --project-ref <isolated-e2e-ref> --resume
```

Resume requires the same repository, branch, project and commit. Monitoring has a
45-minute timeout; resume continues polling the original run. Dispatch intent is
saved before sending it: if interrupted in the send window, resume searches for
the original correlation ID and never blindly dispatches again. If no run exists,
a human must reconcile GitHub's run history before archiving that execution.

Artifact downloads use a staging directory and atomic rename. Resume discards an
incomplete staging directory and preserves a completed download. Diagnostic
ordering is normalized before comparing unchanged failures.

A directory lock prevents concurrent local runners. After a hard crash, verify
that no runner/Codex child is alive before removing only the stale `lock`
directory. Interrupted repairs or commits require review of the retained clone,
working tree and state; they are not automatically replayed. Archive a completed
or deliberately abandoned execution directory before starting a new execution.
Do not reset budgets to bypass a failed execution's three-attempt limit.

## Verification status — 2026-11-19 CLI validation

The CLI session can access Node v24.21.0, npm 11.19.0, Git, GitHub CLI
2.105.0 and Codex CLI 0.170.0. Codex reports ChatGPT authentication.
GitHub keyring authentication and Git push authentication (dry run) pass with
network sandbox escalation. No credentials were copied or changed.

- All 377 application tests and 10 automation regression tests pass.
- Formatting, lint, type checking, build and Git whitespace checks pass.
- Automation preflight passes against the configured isolated project
  `wbiefcpcamynmduexvjk`, with both required secret names present.
- Repository push permission and installed Codex execution flags pass preflight.
- Hosted E2E is registered and active. The development branch is unprotected
  and has no applicable repository rules. The environment retains its custom
  deployment branch policy, currently with no entries; no protections changed.
- Fixed the repository metadata API URL: a trailing slash returned HTTP 404
  and prevented preflight. Added a regression test for endpoint construction.
- Existing regression coverage verifies classification, retry/repair limits,
  artifact download recovery, redaction and protected repair paths.

Hosted dispatch, live identity/migration verification, browser execution and
same-commit CI validation are pending the execution recorded below. A real
Codex application repair is only appropriate if repeated hosted assertions occur;
passing runs do not demonstrate that path. No merge is authorized or performed.

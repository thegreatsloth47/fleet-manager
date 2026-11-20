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
Codex child stdout/stderr are redacted and retained as private `repair-N.log`
files, including on failure. These logs never enter later repair prompts.
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

Node v24.21.0, npm 11.19.0, Git, GitHub CLI 2.105.0 and Codex CLI 0.170.0
are accessible. Codex reports ChatGPT authentication. GitHub keyring login,
repository push, Actions dispatch and environment metadata access work with
network sandbox escalation. No credentials were copied, fetched from GitHub,
or changed. The protected development project was never used for fixtures.

### Completed checks

- All 377 application tests and 12 automation tests pass, as do formatting,
  lint, type checking, production build and Git whitespace checking.
- Fixed the trailing slash in the repository metadata API endpoint that caused
  HTTP 404, with regression coverage.
- The restored isolated project `wbiefcpcamynmduexvjk` resolves and its public
  Auth endpoint responds HTTP 401 without credentials, as expected.
- Metadata preflight confirms the same isolated project and required secret
  names. Hosted preflight verifies actual admin access and required schema.
- [Baseline Hosted E2E 44586916099](https://github.com/thegreatsloth47/fleet-manager/actions/runs/44586916099)
  passed preflight, browser regressions and cleanup at commit `95c9c14`.
  [Same-commit CI 44586913728](https://github.com/thegreatsloth47/fleet-manager/actions/runs/44586913728)
  passed, including database tenant isolation.
- The baseline's 13 fixture-bearing manifests all report completed cleanup.
- Existing target validation, environment restrictions, security path/diff
  checks, unchanged retry, repair/run budgets and no-merge behavior remain.

### Controlled repair and interruption exercise

A reversible presentation defect was committed on the development branch:
the vehicle edit textarea omits its saved description. Tests and security
controls were unchanged. A formatting rejection stopped the first local
validation before push or dispatch; that empty execution is archived intact.

[Hosted run 44589667486](https://github.com/thegreatsloth47/fleet-manager/actions/runs/44589667486)
failed only the intended description reload assertion: 12 browser tests passed,
one failed, and the optional delivered-email test was skipped. Every one of its
13 fixture-bearing manifests reports cleanup completed. The runner retrieved
the failed log and private artifacts and classified the assertion correctly.

During that run, the local monitor was deliberately terminated after saving
its exact run ID and correlation. Resume refused the stale lock without
changing state. After verifying no runner or repair child was active, only the
stale lock was removed. Resume collected the original run, then dispatched one
unchanged retry:
[44592020794](https://github.com/thegreatsloth47/fleet-manager/actions/runs/44592020794).
The retry reproduced the same assertion (12 passed, one failed, one skipped),
and the runner entered Codex repair attempt 1. No duplicate of the interrupted
run was dispatched.

Codex exited with status 1 without changing the retained clone. The clone has
no remote, is clean, and matches source commit `493bf69`. No patch was applied.
A no-edit launch with identical Codex configuration subsequently succeeded;
this does not demonstrate that a full repair can complete. The original exit
reason is unknown because child output was discarded.

Two automation defects found in the exercise were fixed in `250eb7d`:

- Retain redacted Codex stdout/stderr in private `repair-N.log` files even on
  failure, without echoing that output in reports or later prompts. Regression
  coverage checks redaction and owner-only file permissions.
- Include `toHaveValue` in allowlisted matcher diagnostics without including
  expected/received values. Both real failures still normalize identically.

[CI 44651686891](https://github.com/thegreatsloth47/fleet-manager/actions/runs/44651686891)
passed for these fixes at `250eb7d`.

### Remaining review and limitations

The execution remains in `repairing`, with **one of three repair attempts
consumed and two of eight hosted runs recorded**. Neither budget was reset.
Its state still references `493bf69`; the development branch subsequently
received the reviewed automation fixes. The temporary application defect
remains present pending continuation or restoration. Approval was requested
for an explicit reviewed reconciliation and fresh validation with budgets and
history retained; automatic replay of `repairing` remains prohibited.

A successful automated application patch, local repair validation, application
of the patch, and passing hosted retest are **not yet verified**. Actual
interruption during dispatch, patch application or commit has not been
exercised; those phases retain their fail-closed recovery rules. Partial
artifact recovery and retry/repair limits have regression coverage. The
optional delivered-email browser test was not enabled.

The original unavailable-project execution
[44579422081](https://github.com/thegreatsloth47/fleet-manager/actions/runs/44579422081)
is preserved under `.e2e-runs/automation-infrastructure-44579422081/`.
Baseline evidence is under `.e2e-runs/automation-baseline-44586916099/`.
Current controlled-run evidence and the untouched first repair clone remain
under `.e2e-runs/automation/`. All are private and ignored by Git.
No merge, paid dependency, production access or production data change occurred.

# AGENTS.md

## Purpose

This repository contains a multi-tenant fleet and asset maintenance platform for small businesses.

The product should feel simple to users while being architected for long-term growth.

## Core Rules

- Do exactly what the task asks.
- Do not create extra folders, files, abstractions, dependencies, or architecture unless required.
- If a task appears to require broader structural changes, ask before making them.
- Keep diffs as small and focused as possible.
- Do not modify unrelated code.
- Prefer readable, explicit code over clever or highly abstract code.
- Assume a human developer will need to understand and maintain this code later.

## Architecture

- Follow the architecture blueprint in `/docs`.
- Preserve clear domain boundaries.
- Business logic must not live inside React components.
- UI components should focus on presentation and interaction.
- Keep infrastructure concerns separate from domain logic.
- Avoid premature microservices. Prefer a modular monolith unless explicitly directed otherwise.
- Do not introduce new architectural patterns without justification.

## Multi-Tenancy

- Tenant isolation is mandatory.
- Every tenant-owned record must be scoped to an organization.
- Never trust organization IDs supplied by the client without validating access.
- Authorization must be enforced server-side.
- Tests must verify that one organization cannot access another organization’s data.

## Code Quality

- Use descriptive names.
- Keep functions and modules focused.
- Avoid large generic utility files.
- Avoid unnecessary wrapper functions and abstraction layers.
- Comments should explain why something exists, not restate what the code does.
- Prefer simple control flow.
- Follow existing project conventions before introducing new ones.
- Do not generate placeholder implementations unless explicitly requested.

## TypeScript

- Use strict typing.
- Avoid `any` unless there is a documented reason.
- Prefer explicit domain types over loose objects.
- Validate external input at system boundaries.
- Do not bypass type errors with unsafe casting merely to make the build pass.

## Database

- Database constraints should protect important invariants where practical.
- Use migrations for schema changes.
- Do not edit production schema manually.
- Preserve historical records unless deletion is explicitly required.
- Prefer soft deletion/archive patterns where defined by the architecture.

## Testing

- New domain behavior should include tests.
- Bug fixes should include a regression test where practical.
- Tenant isolation requires explicit tests.
- Do not weaken or remove tests simply to make a change pass.
- Run relevant tests, linting, and type checks before considering a task complete.

## Offline / Sync

- V1 offline support is for temporary connectivity loss, not indefinite offline operation.
- Field submissions should be safely queued and retried.
- Avoid duplicate server records when retries occur.
- Respect the idempotency strategy defined in the architecture.
- Do not silently discard failed submissions.

## AI / Document Processing

- AI output is never authoritative by itself.
- AI may propose structured data from documents or images.
- Important data must pass normal validation before becoming a business record.
- Preserve original uploaded source files when required by the architecture.
- Keep provider-specific AI code behind a replaceable service boundary.

## Feature Configuration

- Features may be enabled or disabled by organization configuration.
- Disabled features should not contribute active workflows, navigation, jobs, or notifications.
- Do not hard-code product pricing tiers into domain logic.
- Do not expose unfinished functionality unless explicitly marked as an intentional "Coming Soon" product element.

## Before Making Changes

1. Read the relevant task.
2. Read the relevant architecture/documentation.
3. Inspect existing code and conventions.
4. Identify the smallest required change.
5. Ask before introducing broader structural changes.

## Before Completing a Task

- Confirm the requested behavior works.
- Run relevant tests.
- Run type checking.
- Run linting.
- Review the diff for unrelated changes.
- Summarize:
  - what changed
  - important implementation decisions
  - tests run
  - anything that still needs human review
---
name: implementation
description: Implement an authorized repository change incrementally while preserving existing behavior, user edits, project conventions, and acceptance criteria. Use after direct implementation authority or plan approval; do not use for diagnosis-only, review-only, or unapproved architecture work.
---

# Implementation

## Outcome

Deliver the authorized behavior with the smallest cohesive repository change and fresh evidence proportional to risk.

## Required inputs

- Approved task outcome, exclusions, and done criteria.
- Active instructions and context selected by `$context-discovery`.
- Reference source, tests, prerequisite contracts, and exact validation.

## Critical rules

1. Inspect `git status` and preserve all unrelated modifications and untracked files.
2. Read supplied context and the nearest implementation and tests before editing.
3. Reuse established naming, architecture, error handling, configuration, and test patterns.
4. Make one cohesive increment at a time and validate its narrow behavior immediately.
5. Continue through ordinary in-scope fixes without repeated confirmation; stop only when authority or direction materially changes.
6. Do not weaken tests, suppress failures, add retries, or broaden scope merely to obtain green output.
7. Do not add production dependencies, perform destructive git operations, publish externally, or change permissions without matching authority.
8. Inspect the final diff and run `$verification-before-completion` before reporting success.

## Workflow

1. Confirm task outcome, boundaries, context, and done criteria.
2. Inspect worktree state, callers, data flow, boundaries, reference patterns, and tests.
3. Resolve version-sensitive external gaps with `$external-research` when local evidence is insufficient.
4. Implement the smallest complete increment.
5. Add or update focused tests with `$test-generation` when behavior changes or coverage is missing.
6. Run narrow validation, diagnose failures, and fix those inside the approved scope.
7. Repeat until every done criterion has implementation and evidence.
8. Inspect the final diff for accidental churn, placeholders, debug output, dead code, compatibility, and user-owned changes.
9. Run fresh final verification and report the evidence contract.

Read [the execution policy](references/execution-policy.md) when the worktree is dirty, dependencies are involved, generated state can overlap, or delegation is considered.

## Failure handling

- Missing contract or architecture: return `NEEDS_CONTEXT` before guessing.
- Conflicting user edits: preserve them or stop with the exact overlap.
- Environment blocker: distinguish it from an implementation failure and document substitute evidence.
- New high-impact action: request authority only for that new decision.

## Output contract

Return one status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`, followed by:

- `Changed` behavior and files.
- `Criteria` mapped to implementation evidence.
- `Validated` exact commands and outcomes.
- `Not validated` material gaps.
- `Residual risk` and assumptions.

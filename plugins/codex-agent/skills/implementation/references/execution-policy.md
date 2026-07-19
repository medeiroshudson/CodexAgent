# Execution Policy

## Preserve user work

- Treat pre-existing modifications and untracked files as user-owned.
- Inspect status and relevant diffs before editing.
- Never reset, discard, overwrite, stage, or reformat unrelated changes.
- Stop when an in-scope file contains conflicting edits that cannot be preserved safely.
- Serialize overlapping writes and generated state.

## Scope control

- Map each changed file to an acceptance criterion or required validation surface.
- Prefer a small adjacent change over a broad refactor when it completes the behavior safely.
- Report newly discovered work that is valuable but outside approved scope; do not smuggle it into the diff.
- Remove temporary artifacts, debug output, placeholders, and dead code before completion.

## Dependencies and external contracts

- Reuse the repository package manager and lockfile.
- Inspect existing dependencies before proposing a new one.
- Verify version-sensitive behavior from local source or authoritative documentation.
- Request authority when a new production dependency changes operations, security, ownership, or deployment.

## Validation loop

1. Make one cohesive increment.
2. Run the narrowest useful check.
3. Diagnose failures from evidence.
4. Fix failures inside approved scope without weakening tests.
5. Inspect the final integrated diff.
6. Run repository-required aggregate checks.

## Delegation

- Delegate concrete bounded work with complete context and acceptance criteria.
- Parallelize exploration, documentation lookup, test analysis, and independent review.
- Serialize overlapping writes.
- Use isolated worktrees only when the workflow and user authority support them.

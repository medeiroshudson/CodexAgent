# Execution Policy

## Preserve user work

- Treat pre-existing modifications and untracked files as user-owned.
- Never reset, discard, overwrite, or stage unrelated changes.
- Stop when an in-scope file contains conflicting user edits that cannot be preserved safely.

## Dependencies

- Reuse the repository package manager and lockfile.
- Inspect existing dependencies before adding one.
- Request authority when a new production dependency materially changes operations or risk.

## Parallel work

- Parallelize exploration, documentation lookup, test analysis, and independent reviews.
- Serialize overlapping writes.
- Use isolated worktrees for parallel changes that may touch shared files.


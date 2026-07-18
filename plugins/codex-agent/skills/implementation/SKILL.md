---
name: implementation
description: Execute an approved repository change incrementally while preserving existing behavior, user edits, and project conventions. Use when the user has authorized implementation or approved a plan; do not use for read-only diagnosis or review-only requests.
---

# Implementation

1. Load applicable instructions and the context selected by `$context-discovery`.
2. Inspect git status and preserve unrelated user changes.
3. Reuse established code, configuration, and test patterns.
4. Make the smallest cohesive change for the current task.
5. Validate the narrow behavior immediately; fix failures before expanding scope.
6. Continue through the approved task graph without repeated confirmation unless authority changes or a real blocker appears.
7. Use specialized subagents only for concrete, bounded work. Keep read-heavy work parallel and coordinate writes conservatively.
8. Run `$verification-before-completion` before reporting success.

Read [references/execution-policy.md](references/execution-policy.md) when the worktree is dirty, dependencies are needed, or parallel edits are considered.


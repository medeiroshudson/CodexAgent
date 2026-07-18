---
name: task-breakdown
description: Convert an approved, multi-component implementation into atomic tasks with dependencies, ownership, validation, and safe concurrency. Use for changes spanning several files or systems; do not use for a straightforward one-to-three-file edit.
---

# Task Breakdown

1. Confirm the outcome, constraints, selected context, and exit criteria.
2. Split work by independently verifiable behavior, not by arbitrary file count.
3. For each task, define scope, inputs, expected outputs, likely files, dependencies, agent role, and verification.
4. Keep tasks small enough for one focused agent turn.
5. Mark tasks parallel only when they have no dependency and cannot edit overlapping files or shared generated state.
6. Order batches by dependency satisfaction.
7. Publish the plan with `update_plan` when available. Keep exactly one local coordination step in progress.
8. Send approved tasks to `$implementation` with the context paths and full acceptance criteria.

Read [references/task-contract.md](references/task-contract.md) for the canonical task shape.


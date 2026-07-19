---
name: task-breakdown
description: Convert an approved multi-component repository change into atomic tasks with contracts, dependencies, safe concurrency, handoffs, validation, and done criteria. Use when several behaviors or systems must be coordinated; do not use for a straightforward one-to-three-file edit.
---

# Task Breakdown

## Outcome

Create a dependency-ordered task graph whose nodes can be executed and verified independently without losing approved scope, context, or integration contracts.

## Required inputs

- Approved outcome, exclusions, assumptions, and exit criteria.
- Active instructions and selected context paths.
- Architecture and external-contract decisions.
- Reference source, tests, commands, and worktree constraints.

## Critical rules

1. Split by observable behavior or contract boundary, not arbitrary file count.
2. Give every task a complete handoff packet and measurable completion criteria.
3. Define interfaces or data contracts before parallel consumers.
4. Mark tasks parallel-safe only after checking dependencies, files, generated state, migrations, lockfiles, and mutable external resources.
5. Never assign overlapping writes concurrently.
6. Map every exit criterion to at least one task and validation step.
7. Keep integration and final verification explicit.
8. Preserve approved exclusions and surface unresolved decisions instead of embedding guesses.

## Workflow

1. Confirm outcome, scope, context, constraints, and exit criteria.
2. Map components, contracts, state transitions, risks, and integration points.
3. Split work into independently verifiable outcomes.
4. Define inputs, outputs, likely files, dependencies, preferred role, validation, and done criteria for each task.
5. Analyze overlap and label only defensible parallel batches.
6. Order tasks by dependency satisfaction and identify the critical path.
7. Add integration and verification tasks where separate evidence is required.
8. Publish the plan with `update_plan` when available and keep exactly one local coordination step in progress.
9. Send approved tasks to `$implementation` or the matching specialist with all context paths and acceptance criteria.

Read [the task contract](references/task-contract.md) for the canonical packet, overlap analysis, and graph audit.

## Output contract

Return:

- outcome, exclusions, assumptions, and exit criteria;
- dependency-ordered canonical task packets;
- parallel batches with overlap rationale;
- critical path;
- integration points, risks, and unresolved questions.

Do not create task files unless the user requests durable planning or cross-session handoff.

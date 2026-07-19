---
name: agent-orchestration
description: Orchestrate complex repository changes from context discovery through planning, bounded implementation, review, and verification. Use for multi-component features, fixes, refactors, and migrations that need coordinated skills or agents; do not use for a standalone review, research question, or trivial edit.
---

# Agent Orchestration

## Outcome

Coordinate a repository change as one traceable delivery flow while keeping each specialist focused, context handoffs minimal, write concurrency conservative, and user authority intact.

## Required inputs

- User outcome and current authority.
- Repository root and applicable `AGENTS.md` chain.
- Known scope boundaries and completion criteria.
- Worktree state and material external dependencies.

## Critical rules

1. Use `$context-discovery` before architecture or implementation decisions.
2. Treat an explicit implementation request or approved plan as authority for ordinary in-scope work; do not request the same approval again.
3. Use `$plan-and-approve` only when material scope or architecture is still unapproved.
4. Use `$task-breakdown` for genuinely multi-component work; keep small changes direct.
5. Delegate only concrete bounded tasks with complete handoff packets. Parallelize read-heavy work; serialize overlapping writes and shared generated state.
6. Preserve user changes, current contracts, and explicit exclusions throughout the flow.
7. Run `$verification-before-completion` before reporting success. Use `$code-review` when risk or scope justifies an independent review pass.
8. Do not persist plans, session files, or learned context unless the user requests a durable artifact or separately approves `$context-curation`.

## Routing decisions

- **Read-only request:** route directly to discovery, research, planning, or review and return without implementation stages.
- **Small authorized change:** discover context, execute with `$implementation`, add focused tests when needed, then verify.
- **Complex unapproved change:** discover, analyze architecture when boundaries or contracts change, then use `$plan-and-approve`.
- **Complex approved change:** discover, use `$task-breakdown`, execute dependency-ordered tasks, integrate, review, and verify.
- **External contract uncertainty:** use `$external-research` before implementation that depends on it.

## Workflow

1. **Classify** — restate outcome, authority, scope, risk, and completion criteria.
2. **Discover** — run `$context-discovery`; record active instructions, selected context, references, commands, and unknowns.
3. **Resolve design** — use the `architecture_analyst` role when component boundaries, public contracts, persistent data, permissions, or rollout strategy materially change.
4. **Align authority** — plan only when needed; stop for user direction only when a new high-impact decision remains.
5. **Decompose** — produce dependency-aware task packets for multi-component work and publish the active coordination plan.
6. **Execute** — send each task to `$implementation` or a matching specialist with the handoff contract below. Keep exactly one local coordination step in progress.
7. **Integrate** — inspect combined state, resolve in-scope integration failures, and confirm task outputs satisfy shared contracts.
8. **Review and verify** — apply focused review and run fresh proportional validation.
9. **Report** — map delivered behavior to criteria, evidence, gaps, and residual risk.

## Handoff contract

Every delegated task receives:

- outcome and excluded behavior;
- authority and file/state boundaries;
- active instruction and selected context paths;
- reference files and prerequisite outputs;
- acceptance criteria and exact validation;
- expected return status and evidence.

Read [the orchestration contract](references/orchestration-contract.md) for classification, handoff, and integration checks.

## Failure handling

- Missing architecture or contract evidence: return to discovery or architecture analysis.
- New destructive, external, permission-changing, or product-direction decision: stop and request authority.
- In-scope test or build failure: diagnose and fix within the approved task; do not create a new approval loop.
- Overlapping user edits: preserve them or stop with the exact conflict.
- Environment blocker: document the missing capability and substitute evidence, if any.

## Output contract

Report:

- `Outcome` and final status.
- `Tasks` with completed, blocked, or omitted state.
- `Changed` behavior and files.
- `Validated` commands and outcomes.
- `Not validated` material gaps.
- `Residual risk` and any decision still required.

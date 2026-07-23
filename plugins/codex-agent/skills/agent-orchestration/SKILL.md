---
name: agent-orchestration
description: Orchestrate complex repository changes from context discovery through planning, bounded implementation, review, and verification, with optional explicitly requested resumable Markdown handoffs. Use for multi-component features, fixes, refactors, and migrations; do not use for standalone review, research, or trivial edits.
---

# Agent Orchestration

## Outcome

Coordinate a repository change as one traceable delivery flow while keeping specialists focused, context handoffs minimal, shared writes serialized, optional resumability explicit, and user authority intact.

## Required inputs

- User outcome, exclusions, current authority, and completion criteria.
- Repository root, applicable `AGENTS.md` chain, and worktree state.
- Selected canonical context and material external contracts.
- Session mode: `ephemeral` unless the user explicitly requests a resumable execution in natural language.

## Critical rules

1. Run `$context-discovery` before architecture or implementation decisions.
2. Treat an explicit implementation request or approved plan as authority for ordinary in-scope work; do not request the same approval again.
3. Use `$plan-and-approve` only when material scope or architecture remains unapproved, and `$task-breakdown` only for genuinely coordinated work.
4. Keep sessions ephemeral by default. File count, duration, complexity, delegation, or model judgment never activates resumability.
5. Activate a resumable session only when the user explicitly asks to preserve, resume, or share this execution's state. The opt-in is scoped to that orchestration and is not a global setting.
6. Do not expose session commands, slash commands, CLI flags, or automatic hooks. Interpret opt-in and resume intent from natural language.
7. The orchestrator is the sole session writer. Subagents receive bounded paths and return structured deltas; they never edit `manifest.json`, `handoff.md`, or candidate files.
8. Store paths, small metadata, verified decisions, progress, and hashes, not transcripts, full prompts, raw logs, secrets, personal data, or large embedded outputs.
9. Delegate concrete tasks with minimal handoffs. Parallelize independent read work; serialize overlapping files, generated state, migrations, locks, and external mutation.
10. On resume, verify repository identity, branch, HEAD, worktree drift, manifest revision, handoff hash, and every referenced path before trusting session claims.
11. Run `$verification-before-completion` before success. Optional `$context-harvest` happens after or separately from the primary completion report and never implies durable promotion.
12. Preserve user changes, current contracts, explicit exclusions, and canonical context-selection boundaries throughout the flow.

## Routing decisions

- **Read-only request:** route directly to discovery, research, planning, or review without implementation stages.
- **Small authorized change:** discover, implement, add focused tests when needed, and verify.
- **Complex unapproved change:** discover, resolve architecture boundaries, and use `$plan-and-approve`.
- **Complex approved change:** discover, decompose, execute dependency-ordered tasks, integrate, review, and verify.
- **External contract uncertainty:** use `$external-research` before implementation that depends on it.
- **Explicit resumability:** use [the session contract](references/session-contract.md) in addition to the applicable route; do not change the route merely because a session exists.

## Workflow

1. **Classify** — restate outcome, authority, scope, risks, completion criteria, and ephemeral/resumable mode.
2. **Discover** — run `$context-discovery`; record active instructions, selected context, references, commands, trust boundaries, and unknowns.
3. **Resume or initialize** — only for explicit opt-in, validate an existing session or ask the internal session writer to create `manifest.json` and `handoff.md` per [the session contract](references/session-contract.md).
4. **Resolve design** — use `architecture_analyst` when public contracts, persistent data, permissions, ownership, or rollout materially change.
5. **Align authority** — plan only when needed; stop only for a new high-impact decision outside current authority.
6. **Decompose** — produce dependency-aware task packets and a coordination plan for multi-component work.
7. **Delegate** — pass each worker only outcome, exclusions, authority, selected paths, prerequisite outputs, acceptance criteria, and validation. Do not pass the whole session or transcript.
8. **Reconcile** — inspect each result, verify claimed artifacts, and ask the sole session writer to apply a revision-checked delta when resumable.
9. **Integrate** — inspect combined state, resolve in-scope failures, and confirm prerequisite contracts match consumers.
10. **Review and verify** — apply focused review and run fresh proportional validation from the integrated state.
11. **Report** — deliver completion evidence independently of session maintenance. If opted in, reconcile final status and next action.
12. **Offer harvest** — only when non-obvious durable knowledge is plausible and future rediscovery cost is material. Run `$context-harvest` only for an explicit selected handoff; never auto-promote or auto-clean.

## Handoff contract

Every delegated task receives:

- outcome, excluded behavior, authority, and file/state boundaries;
- active instruction and explicitly selected context paths;
- reference files and prerequisite output paths;
- acceptance criteria and exact validation;
- known risks, user-owned files, and unresolved constraints;
- expected return status, changed artifacts, decisions, evidence, and candidate learnings.

Read [the orchestration contract](references/orchestration-contract.md) for classification, minimal handoffs, concurrency, and integration checks. Read [the session contract](references/session-contract.md) before creating, updating, resuming, or completing resumable state.

## Failure handling

- Missing architecture or contract evidence: return to discovery or architecture analysis.
- New destructive, external, permission-changing, or product-direction decision: request only the new authority.
- In-scope test or build failure: diagnose and fix within the approved task without a repeated approval loop.
- Overlapping user edits: preserve them or stop with the exact conflict.
- Stale or corrupt session: keep repository work read-only until the session is reconciled; never overwrite by guesswork.
- Unavailable session writer: continue ephemerally only if that still satisfies the user's request; otherwise report the resumability blocker.

## Output contract

Report:

- `Outcome` and final task status.
- `Tasks` with completed, blocked, or omitted state.
- `Changed` behavior and files.
- `Validated` commands and outcomes.
- `Not validated` material gaps.
- `Session` — `ephemeral`, or ID/path/revision/status for explicit resumability without exposing sensitive content.
- `Harvest` — not offered, declined, candidate-only, or routed to separate curation.
- `Residual risk` and any decision still required.

---
name: agent-orchestration
description: Coordinate Codex subagents for substantial repository work with independent workstreams, from context discovery through bounded execution and verification. Use for multi-component changes, parallel exploration or diagnosis, and multi-angle PR or release review; do not use for trivial, tightly sequential, or single-specialty work where delegation adds no value.
---

# Agent Orchestration

## Outcome

Coordinate one traceable delivery flow while the root agent owns requirements, user communication, approvals, synthesis, and the final claim; subagents own bounded outcomes and return compact evidence. Keep context handoffs minimal, shared writes serialized, optional resumability explicit, and user authority intact.

## Required inputs

- User outcome, exclusions, current authority, and completion criteria.
- Repository root, applicable `AGENTS.md` chain, and worktree state.
- Selected canonical context and material external contracts.
- Candidate workstreams, their dependencies, write ownership, and validation surfaces.
- Runtime-advertised model and reasoning capabilities when an explicit spawn override is being considered.
- Session mode: `ephemeral` unless the user explicitly requests a resumable execution in natural language.

## Critical rules

1. Run `$context-discovery` before architecture or implementation decisions.
2. Delegate only when independent work, background latency, or an independent risk check materially improves the result. This skill authorizes in-scope delegation when it applies; it does not authorize unrelated actions or forced fan-out.
3. Keep the root agent responsible for decomposition, user updates, approval boundaries, integration, disagreement resolution, and the final claim. Delegate outcomes, not vague assistance or final accountability.
4. Prefer read-only subagents for exploration, research, triage, and review. Give write-capable workers exclusive file or component ownership; serialize overlapping files, generated state, migrations, locks, and mutable external state.
5. Use the fewest agents that make independent progress. Account for the extra token and coordination cost, respect the current slot limit, and keep useful root work moving while agents run when possible.
6. Optimize model and reasoning per assignment using the quality-first defaults in [the model-routing contract](references/model-routing.md). Choose by clarity, ambiguity, coupling, consequence, verification cost, and expected rework; use only runtime-advertised configurations and fall back to parent inheritance when an override is unavailable or not worthwhile.
7. Treat an explicit implementation request or approved plan as authority for ordinary in-scope work; do not request the same approval again. Use `$plan-and-approve` only when material scope or architecture remains unapproved, and `$task-breakdown` only for genuinely coordinated work.
8. Keep sessions ephemeral by default. File count, duration, complexity, delegation, or model judgment never activates resumability. Activate it only when the user explicitly asks to preserve, resume, or share this execution's state.
9. Do not expose session commands, slash commands, CLI flags, or automatic hooks. The orchestrator is the sole session writer; subagents return structured deltas and never edit `manifest.json`, `handoff.md`, or candidate files.
10. Give every subagent one bounded assignment with objective, scope, ownership, authority, dependencies, required validation, and return format. Pass only the instructions, selected context, paths, prerequisite outputs, and `specRefs` needed for that assignment.
11. Wait for every result required by the coordination plan. Inspect claimed artifacts and authoritative state, follow up with an existing subagent when its context is valuable, and stop or redirect work that overlaps ownership, diverges from constraints, or expands scope.
12. On resume, verify repository identity, branch, HEAD, worktree drift, manifest revision, handoff hash, and every referenced path before trusting session claims.
13. Run `$verification-before-completion` against the integrated state before success. A subagent summary never substitutes for final inspection or fresh evidence.
14. Preserve user changes, current contracts, explicit exclusions, canonical context-selection boundaries, and external-action approvals throughout the flow. Optional `$context-harvest` remains separate from primary completion and never implies durable promotion.

## Routing decisions

- **Single focused request:** route directly to the matching discovery, research, planning, review, implementation, or verification skill without orchestration.
- **Parallel read work:** delegate independent exploration, documentation research, triage, test analysis, or review angles, then synthesize their evidence.
- **Small authorized change:** discover, implement, add focused tests when needed, and verify.
- **Complex unapproved change:** discover, resolve architecture boundaries, and use `$plan-and-approve`.
- **Complex approved change:** discover, decompose, execute dependency-ordered tasks, integrate, review, and verify.
- **Concurrent writes:** parallelize only with exclusive ownership and independent validation; otherwise serialize.
- **Long-running bounded work:** delegate an already-defined test, monitor, or evidence-gathering operation when it would otherwise block root communication.
- **Model optimization:** when available, default bounded leaves to Luna `xhigh`, difficult or quality-critical leaves to Luna `max`, collaborative workstreams to Terra `max`, and senior judgment to Sol `high` or `max`. Use lower Luna efforts only as explicit latency optimizations for mechanical work.
- **External contract uncertainty:** use `$external-research` before implementation that depends on it.
- **Explicit resumability:** use [the session contract](references/session-contract.md) in addition to the applicable route; do not change the route merely because a session exists.

## Workflow

1. **Classify** — restate outcome, authority, scope, risks, completion criteria, and ephemeral/resumable mode.
2. **Discover** — run `$context-discovery`; record active instructions, selected context, references, commands, trust boundaries, and unknowns.
3. **Gate delegation** — identify independent work, dependencies, ownership, slot use, and expected benefit. Stay single-agent when the next step is tightly sequential, write surfaces overlap, or coordination cost outweighs the gain.
4. **Resume or initialize** — only for explicit opt-in, validate an existing session or ask the internal session writer to create `manifest.json` and `handoff.md` per [the session contract](references/session-contract.md).
5. **Resolve design** — use `architecture_analyst` when public contracts, persistent data, permissions, ownership, or rollout materially change.
6. **Align authority** — plan only when needed; stop only for a new high-impact decision outside current authority.
7. **Decompose** — produce dependency-aware task packets, exclusive ownership, expected return contracts, and a coordination plan for genuinely separable work.
8. **Select execution profiles** — for each task, apply [the model-routing contract](references/model-routing.md), record the requested model and effort or parent-inheritance fallback, and confirm that the choice is supported by the runtime.
9. **Delegate** — spawn only the planned independent work. Keep the complete specification contract with the orchestrator/integrator/verifier and send each worker the bounded handoff defined below. Prefer a self-contained prompt over copying the full conversation or session.
10. **Coordinate** — keep the user informed, monitor material blockers, wait for all required results, and use follow-up or redirection without duplicating ownership. Do not dump raw agent activity into the main thread.
11. **Reconcile** — inspect each result, verify claimed artifacts, resolve conflicting evidence, and ask the sole session writer to apply a revision-checked delta when resumable.
12. **Integrate** — inspect combined state, resolve in-scope failures, and confirm prerequisite contracts match consumers.
13. **Review and verify** — apply focused review and run fresh proportional validation from the integrated state.
14. **Report** — return one integrated answer, not parallel reports. Deliver completion evidence independently of session maintenance; if opted in, reconcile final status and next action.
15. **Offer harvest** — only when non-obvious durable knowledge is plausible and future rediscovery cost is material. Run `$context-harvest` only for an explicit selected handoff; never auto-promote or auto-clean.

## Handoff contract

Every delegated task receives:

- one concrete objective, why it matters, excluded behavior, and done criteria;
- read-only or mutation authority plus exclusive file, component, system, or state boundaries;
- active instruction and explicitly selected context paths;
- reference files and prerequisite output paths;
- acceptance criteria and exact validation;
- relevant `specRefs`; the complete specification contract goes only to integration and final verification;
- dependencies, known risks, user-owned files, and unresolved constraints;
- leaf status by default; authorize nested coordination only for an independently owned workstream when slots and scope justify it;
- requested model and reasoning effort, or an explicit parent-inheritance fallback, without claiming unreported runtime identity;
- expected return status, changed artifacts, decisions, evidence, blockers, residual risk, and candidate learnings.

Read [the orchestration contract](references/orchestration-contract.md) before spawning subagents for delegation gates, assignment contracts, concurrency, runtime coordination, and integration checks. Read [the model-routing contract](references/model-routing.md) before selecting explicit model or reasoning overrides. Read [the session contract](references/session-contract.md) before creating, updating, resuming, or completing resumable state.

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

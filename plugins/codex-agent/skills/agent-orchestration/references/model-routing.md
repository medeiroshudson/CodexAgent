# Subagent Model Routing

## Goal

Minimize total coordination cost, including weak-result rework, while prioritizing reliable first-pass quality. Choose by clarity, ambiguity, coupling, consequence, verification cost, and expected rework rather than task size alone.

## Precedence and availability

1. Preserve an explicit user choice, managed runtime policy, or installed custom-agent profile. Do not fight a pinned model or reasoning effort.
2. Inspect the models and reasoning levels advertised by the current runtime before requesting an override. Never assume that a documented model is enabled for the current account, host, backend, or surface.
3. When no higher-priority pin exists, select a supported profile from the table below only when it is materially better than parent inheritance.
4. If the preferred override is unavailable or rejected before work starts, retry at most once with parent inheritance and disclose the fallback. Do not silently substitute another model family.

Custom-agent files may override a spawn request. Treat the requested configuration as intent and the runtime-reported configuration as fact. Do not restart successful work merely to chase an unverified identity.

## Selection matrix

| Profile | Preferred model when advertised | Starting effort | Use when | Avoid when |
|---|---|---|---|---|
| Bounded leaf | `gpt-5.6-luna` | `xhigh` | The assignment has one bounded outcome: evidence collection, repository or documentation research, workflow execution, scoped implementation, review, browser verification, or reconciliation. Use `max` when quality matters more than latency or a weak result would create expensive rework. | The worker must coordinate other agents, resolve central ambiguity, or make the final high-consequence judgment. |
| Collaborative workstream | `gpt-5.6-terra` | `max` | The task benefits from a stronger coding peer, further decomposition, or ownership of a substantial independent workstream. | A Luna `xhigh` or `max` leaf can complete the same bounded work, or the task owns the central high-risk decision. |
| Senior judgment | `gpt-5.6-sol` | `high` | The assignment is ambiguous, difficult, high-value, or high-consequence: architecture, security, competing incident hypotheses, migration or release risk, adversarial review, or final polish. Use `max` for the hardest quality-first work. | Routine scouting, deterministic workflows, or ordinary isolated coding. |

Luna is always a leaf and must not delegate. Terra and Sol remain leaves unless the root explicitly grants coordination ownership for an independent workstream with non-overlapping children and available slots.

## Reasoning calibration

Use the quality-first defaults above. Lower effort is an explicit optimization, not the ordinary Luna baseline:

- `low` or `medium` only for completely mechanical, deterministic work with cheap verification when latency materially matters;
- `xhigh` as the default for Luna leaves so exploration, review, implementation, and reconciliation return useful evidence on the first pass;
- `max` for difficult or quality-critical Luna leaves and as the default for Terra workstream owners;
- `high` as the default for Sol senior judgment, raising to `max` for the hardest consequence-heavy analysis;
- `ultra` only when the user or runtime explicitly requests it and nested delegation is intended; never use it for an ordinary leaf.

Do not reduce effort merely because a task is called a leaf: scope and reasoning difficulty are separate. Prefer a stronger first pass when a weak result would send work back to the root or require another agent. Do not default every worker to Sol or grant coordination ownership based on model alone.

## Spawn contract

- Prefer a self-contained prompt and the smallest history fork. When the collaboration tool supports `fork_turns`, use `"none"` for explicit model or reasoning overrides unless the task genuinely requires inherited conversation history.
- Record the exact requested model slug and reasoning effort in the assignment packet.
- Immediately before spawning, disclose the requested configuration, role, ownership, and leaf or coordinator status. If inheriting, say so instead of guessing the parent's settings.
- If the runtime reports a different effective configuration, disclose the correction and decide whether it materially changes confidence or validation.
- Preserve the same sandbox, approval, mutation, and external-action boundaries regardless of model choice.

## Examples

- Repository inventory, documentation research, or exact path citations: Luna `xhigh`.
- Completely mechanical extraction or deterministic formatting with cheap checks: Luna `medium` or `low` as an explicit latency optimization.
- Focused implementation, substantive review, or adaptive browser verification: Luna `max`.
- Substantial independently owned implementation or reconciliation across several components: Terra `max`.
- Architecture challenge, security review, or release-risk decision: Sol `high`; use `max` only when the consequence warrants it.

These are starting points, not availability guarantees or permanent role definitions. This repository intentionally prioritizes quality-first orchestration defaults over the generic lowest-effort baseline; runtime availability, explicit user choices, permission boundaries, and inheritance fallback still take precedence.

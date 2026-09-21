---
name: plan-and-approve
description: Plan a feature, refactor, migration, or other material repository change before mutation when scope or architecture is not yet approved. Use to align outcomes, boundaries, alternatives, risks, rollout, and validation; do not use for read-only analysis, trivial edits, or execution of an already approved plan.
---

# Plan and Approve

## Outcome

Produce the smallest evidence-backed approach that resolves material design choices and gives the user a clear approval boundary before repository mutation.

## Required inputs

- Desired outcome and current authority.
- Active instructions and context selected by `$context-discovery`.
- Current architecture, reference implementation, tests, and commands.
- Known constraints, compatibility requirements, and external dependencies.

## Critical rules

1. Classify the change against [the materiality test](references/approval-policy.md) before proposing structure, and state the classification, the matched surface, and the authority the decision would grant.
2. Restate the outcome, included scope, exclusions, and done criteria before proposing structure.
3. Separate observed repository facts from assumptions and proposals.
4. Prefer the nearest existing architecture and the smallest viable change.
5. Present alternatives only when they represent real tradeoffs or require a user decision.
6. Identify compatibility, migration, rollback, security, operational, and validation consequences.
7. Isolate destructive, external, permission-changing, dependency-owning, or product-direction decisions.
8. Do not request approval for bounded work the user already asked for, or for a plan already approved. A request that matches the materiality test still needs a presented plan and explicit approval before the first write; the instruction itself is not the approval.
9. Do not create plan files unless the user requests a durable artifact.

## Workflow

1. Run `$context-discovery` and resolve material unknowns.
2. Map affected components, callers, state, contracts, tests, and operations.
3. Use `architecture_analyst` when boundaries, public contracts, persistent data, permissions, or rollout materially change.
4. State assumptions that change the implementation and how they can be verified.
5. Propose the recommended approach with important files and sequencing.
6. Compare credible alternatives and explain why the recommendation fits this repository.
7. Define acceptance criteria, proportional validation, rollout, rollback, and residual risk.
8. Assemble the in-memory [specification contract](references/spec-contract.md) with stable IDs and acceptance oracles.
9. State the exact decision being requested and what implementation authority it grants.

## Approval decisions

Use [the approval policy](references/approval-policy.md) to distinguish existing authority from decisions that require a new approval. The materiality test decides that boundary, and an explicit instruction covers bounded work only. Ordinary in-scope edits and corrections do not need repeated confirmation after approval.

## Output contract

Return:

- `Outcome and boundaries`.
- `Repository evidence` with relevant paths.
- `Recommended approach` and sequencing.
- `Alternatives and tradeoffs`, when material.
- `Acceptance and validation`.
- `Migration, rollback, and risk`.
- `Specification contract` with non-goals, invariants, security boundaries, failure modes, compatibility, and acceptance oracles.
- `Materiality` — the classification, the surface or rule it matched, and the authority the decision grants.
- `Decision required` or `Already authorized`.

After approval, use `$task-breakdown` for multi-component work or `$implementation` for a small cohesive change.

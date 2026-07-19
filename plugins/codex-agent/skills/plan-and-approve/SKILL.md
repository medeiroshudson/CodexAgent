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

1. Restate the outcome, included scope, exclusions, and done criteria before proposing structure.
2. Separate observed repository facts from assumptions and proposals.
3. Prefer the nearest existing architecture and the smallest viable change.
4. Present alternatives only when they represent real tradeoffs or require a user decision.
5. Identify compatibility, migration, rollback, security, operational, and validation consequences.
6. Isolate destructive, external, permission-changing, dependency-owning, or product-direction decisions.
7. Do not request approval when the user already asked to implement or approved a concrete plan.
8. Do not create plan files unless the user requests a durable artifact.

## Workflow

1. Run `$context-discovery` and resolve material unknowns.
2. Map affected components, callers, state, contracts, tests, and operations.
3. Use `architecture_analyst` when boundaries, public contracts, persistent data, permissions, or rollout materially change.
4. State assumptions that change the implementation and how they can be verified.
5. Propose the recommended approach with important files and sequencing.
6. Compare credible alternatives and explain why the recommendation fits this repository.
7. Define acceptance criteria, proportional validation, rollout, rollback, and residual risk.
8. State the exact decision being requested and what implementation authority it grants.

## Approval decisions

Use [the approval policy](references/approval-policy.md) to distinguish existing authority from decisions that require a new approval. Ordinary in-scope edits and corrections do not need repeated confirmation after approval.

## Output contract

Return:

- `Outcome and boundaries`.
- `Repository evidence` with relevant paths.
- `Recommended approach` and sequencing.
- `Alternatives and tradeoffs`, when material.
- `Acceptance and validation`.
- `Migration, rollback, and risk`.
- `Decision required` or `Already authorized`.

After approval, use `$task-breakdown` for multi-component work or `$implementation` for a small cohesive change.

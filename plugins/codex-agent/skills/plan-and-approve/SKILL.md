---
name: plan-and-approve
description: Align an implementation approach before repository mutations. Use for new features, refactors, migrations, or multi-file changes when the user has not already approved a concrete plan; skip for read-only analysis, trivial edits, or execution of an already approved plan.
---

# Plan and Approve

1. Restate the outcome in one or two sentences.
2. Inspect applicable `AGENTS.md`, nearby code, and relevant project context before proposing architecture.
3. State assumptions only when they affect implementation.
4. Propose the smallest approach that satisfies the request, including important files, validation, and external dependencies.
5. Identify destructive, externally visible, permission-changing, or otherwise high-impact actions separately.
6. Request approval only when no concrete plan has already been approved.
7. After approval, hand complex work to `$task-breakdown`; execute small work directly with `$implementation`.

Do not use planning as a repeated pause. A direct implementation request or approval of a prior plan authorizes ordinary in-scope file edits and verification.

Read [references/approval-policy.md](references/approval-policy.md) when deciding whether new approval is required.


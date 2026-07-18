---
name: verification-before-completion
description: Validate an implementation before claiming it is complete by running proportional tests, static checks, builds, and behavioral verification. Use at the end of code or configuration changes and before commit, handoff, or release claims.
---

# Verification Before Completion

1. Restate the acceptance criteria as observable checks.
2. Inspect the final diff and ensure only intended files changed.
3. Run the narrowest relevant tests, then repository-required aggregate checks.
4. Run applicable formatting, lint, typecheck, schema, build, and packaging validation.
5. Exercise runtime or rendered behavior when static checks cannot prove it.
6. Confirm generated files, manifests, paths, links, and installation instructions.
7. Review failures and warnings; do not relabel them as success.
8. Apply `$context-curation` criteria to knowledge discovered during the task. If a high-value durable candidate exists, report completion normally and present one optional context proposal; never persist it without explicit approval.
9. Report evidence with exact commands and outcomes, plus material untested risk.

Use fresh command output. Do not rely on a prior agent's summary as proof.

Read [references/evidence-contract.md](references/evidence-contract.md) for the completion report shape.

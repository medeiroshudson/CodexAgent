---
name: code-review
description: Review a branch, diff, pull request, or implementation for correctness, security, data loss, concurrency, compatibility, maintainability, and missing tests. Use for review or audit requests; remain read-only unless the user separately asks to address confirmed findings.
---

# Code Review

## Outcome

Return only credible, actionable engineering findings, ordered by realistic severity and grounded in the complete relevant change.

## Required inputs

- Comparison base and changed state.
- Intended behavior, requirements, and explicit exclusions.
- Applicable review, security, architecture, and testing instructions.

## Critical rules

1. Remain read-only. A request to review is not authority to implement fixes.
2. Inspect the complete relevant diff and trace changed behavior through callers, boundaries, state, configuration, and tests.
3. Prioritize correctness, authorization, data loss, concurrency, compatibility, and missing regression coverage.
4. Attempt to falsify each suspected issue by checking guards, callers, tests, and assumptions.
5. Report style only when it creates a concrete correctness or maintenance risk.
6. Match severity to reachability and impact; do not inflate findings.
7. Give tight file and line references, triggering conditions, impact, evidence, and the smallest credible remediation.
8. If no actionable finding exists, say so and list material residual risk.

## Review workflow

1. Establish base, scope, intent, and changed contracts.
2. Read applicable instructions and the full diff.
3. Trace data validation, state transitions, errors, cleanup, retries, idempotency, and partial failure.
4. Inspect security, secrets, authentication, authorization, injection, and unsafe output boundaries.
5. Inspect compatibility, migrations, configuration, concurrency, resource bounds, and changed hot paths.
6. Evaluate tests for changed behavior and relevant failures.
7. Validate candidate findings with code evidence or a targeted read-only reproduction.
8. Deduplicate root causes and order confirmed findings by severity.

Read [the review checklist](references/review-checklist.md) for the systematic passes and finding threshold.

## Severity

- `P0`: immediate catastrophic impact.
- `P1`: high-impact likely defect.
- `P2`: material but bounded defect.
- `P3`: lower-impact actionable risk.

Do not assign a priority to optional cleanup.

## Output contract

Return findings first. Each finding includes priority, title, tight location, trigger, impact, evidence, and remediation. Then report:

- `Residual risk`.
- `Validation performed`.
- `Unexercised areas`.

If there are no findings, lead with `No actionable findings`.

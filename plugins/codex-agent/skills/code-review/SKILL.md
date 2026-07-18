---
name: code-review
description: Review a branch, diff, pull request, or implementation for correctness, security, regressions, missing tests, and maintainability. Use for review or audit requests; remain read-only unless the user separately asks to address findings.
---

# Code Review

1. Establish the comparison base and intended behavior.
2. Read applicable instructions and inspect the complete relevant diff.
3. Trace changed behavior through callers, boundaries, and tests.
4. Prioritize correctness, security, data loss, concurrency, compatibility, and missing coverage.
5. Validate suspected issues with code evidence or a targeted reproduction when practical.
6. Report actionable findings first, ordered by severity, with tight file and line references.
7. Separate blocking findings from residual risk and non-blocking observations.
8. If no actionable finding exists, say so and list the material areas not exercised.

Do not report style preferences as defects unless they create a concrete maintenance or correctness risk.

Read [references/review-checklist.md](references/review-checklist.md) for a systematic pass.


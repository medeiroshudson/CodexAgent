---
name: verification-before-completion
description: Verify an implementation before completion by mapping acceptance criteria to fresh tests, static checks, builds, generated artifacts, packaging, and runtime evidence. Use at the end of code or configuration changes and before commit, handoff, or release claims.
---

# Verification Before Completion

## Outcome

Determine whether the final integrated workspace satisfies every acceptance criterion and repository-required check, with fresh evidence and visible residual risk.

## Required inputs

- Acceptance and done criteria.
- Claimed changed behavior and files.
- Applicable instructions, validation commands, and environment constraints.

## Critical rules

1. Inspect `git status` and the final diff before running checks.
2. Convert each criterion into an observable verification method.
3. Run the narrowest relevant checks first, then repository-required aggregate validation.
4. Run applicable format, lint, typecheck, schema, build, packaging, generated-artifact, path, and link checks.
5. Exercise runtime or rendered behavior when static checks cannot prove the criterion.
6. Use fresh command output; do not rely on summaries from prior agents.
7. Do not relabel failed, skipped, timed-out, flaky, or unavailable checks as success.
8. Distinguish implementation failure, environment blocker, substitute evidence, and untested risk.
9. Apply `$context-curation` criteria after reporting the primary task; never persist learned context without explicit approval.

## Workflow

1. Build a criterion-to-evidence matrix.
2. Inspect intended and unintended changes in the final workspace.
3. Run focused behavior or regression tests.
4. Run required repository-level validation.
5. Validate builds, schemas, packages, generated content, installation, and runtime behavior as applicable.
6. Review warnings, skipped paths, platform limits, and environment coupling.
7. Classify the result and report exact evidence.

Use [the evidence contract](references/evidence-contract.md) for result classification and report shape.

## Result classification

- `VERIFIED`: every criterion and required check passed.
- `VERIFIED_WITH_GAPS`: strong evidence exists, but a material environment-dependent path was not exercised.
- `IMPLEMENTATION_FAILED`: a check proves a defect or unmet criterion.
- `ENVIRONMENT_BLOCKED`: required evidence cannot be obtained and no safe substitute proves the criterion.

## Output contract

Report:

- `Changed` behavior.
- `Criteria` mapped to evidence and result.
- `Validated` exact commands and outcomes.
- `Not validated` material gaps.
- `Residual risk`.
- `Durable context` only when a qualifying optional proposal exists.

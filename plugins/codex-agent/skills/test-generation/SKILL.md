---
name: test-generation
description: Add or improve focused automated tests for changed behavior, regressions, public contracts, boundaries, and failure modes. Use when implementation changes behavior or meaningful coverage is absent; do not generate redundant tests solely to increase a coverage percentage.
---

# Test Generation

## Outcome

Create the smallest deterministic test set that proves the assigned behavior and protects its material regression risks at the correct boundary.

## Required inputs

- Observable behavior or defect.
- Acceptance criteria and production surface in scope.
- Applicable testing instructions, commands, fixtures, and nearest examples.
- Known environment or external-system constraints.

## Critical rules

1. Inspect existing tests, fixtures, setup, and commands before selecting a test style.
2. Reproduce a defect before the fix when practical and keep the regression case.
3. Choose unit, contract, integration, or broader testing based on the boundary crossed.
4. Prefer public behavior over private implementation details.
5. Control time, randomness, locale, network, filesystem, and process state where they affect determinism.
6. Mock only external boundaries, not the logic under test.
7. Cover the expected path and material boundaries or failures; do not impose ritual case counts or structures.
8. Never weaken assertions, skip tests, or add retries to hide failures.

## Workflow

1. Restate the behavior, risks, and evidence required.
2. Inspect the nearest test patterns and select the narrowest correct level.
3. Build a compact matrix of expected path, important boundaries, and relevant failures.
4. Establish the failing or missing-behavior baseline when practical.
5. Implement tests and minimal secret-free fixtures using local conventions.
6. Run the new test first; diagnose without changing the intended contract.
7. Run the relevant suite and check for nondeterminism or environment coupling.
8. Report risks covered, commands, outcomes, and material gaps.

Use [the test strategy](references/test-strategy.md) for level selection, doubles, determinism, and stopping criteria.

## Failure handling

- Production defect outside test scope: report `PRODUCTION_CHANGE_REQUIRED` with reproduction evidence.
- Missing service, binary, or permission: report `ENVIRONMENT_BLOCKED` and safe substitute evidence, if any.
- Material boundary not exercised: report `DONE_WITH_GAPS`; never present it as fully validated.

## Output contract

Return:

- `Risks covered`.
- `Tests and fixtures changed`.
- `Commands and results`.
- `Failures discovered`.
- `Material gaps`.

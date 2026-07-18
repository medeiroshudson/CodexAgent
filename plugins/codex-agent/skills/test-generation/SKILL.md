---
name: test-generation
description: Add or improve focused automated tests for new behavior, bug fixes, edge cases, and public contracts. Use when implementation changes behavior or coverage is missing; do not generate redundant tests solely to increase a coverage percentage.
---

# Test Generation

1. Identify the observable behavior and the regression risk.
2. Inspect the nearest existing tests, fixtures, and test commands.
3. For a defect, reproduce the failure before changing production code when practical.
4. Add the smallest test set covering the expected path, important boundary, and relevant failure mode.
5. Prefer public behavior over private implementation details.
6. Keep fixtures minimal, deterministic, and free of secrets.
7. Run the new test first, then the relevant suite.
8. Report commands, outcomes, and meaningful gaps.

Read [references/test-strategy.md](references/test-strategy.md) when selecting test level or handling flaky and external behavior.


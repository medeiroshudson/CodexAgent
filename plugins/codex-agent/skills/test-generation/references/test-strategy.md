# Test Strategy

- Use unit tests for isolated logic and contract tests for boundaries.
- Use integration tests when behavior depends on storage, processes, frameworks, or tool wiring.
- Use end-to-end tests only for critical cross-component user flows.
- Mock only the external boundary, not the logic being tested.
- Control time, randomness, locale, and network access explicitly.
- Do not weaken assertions, skip tests, or add retries to hide a failure.
- If an external system cannot be exercised, document the substitute evidence and remaining risk.


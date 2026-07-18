# Review Checklist

- Requirements and backwards compatibility.
- Input validation, authorization, secret handling, and unsafe output.
- Error propagation, cleanup, retries, idempotency, and partial failure.
- State transitions, races, ordering, timeouts, and cancellation.
- Data migrations, precision, serialization, and destructive operations.
- Tests for changed behavior and failure modes.
- Performance on changed hot paths.
- Accessibility and rendered behavior for user interfaces.
- Documentation or configuration that must change with the code.

A finding must explain impact, evidence, and the smallest credible remediation.


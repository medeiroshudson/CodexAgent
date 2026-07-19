# Review Checklist

## Intent and reachability

- Comparison base, requirements, exclusions, and backwards compatibility.
- Callers, entrypoints, configuration, feature flags, and runtime reachability.

## Data, state, and failure

- Input validation, precision, serialization, migrations, and destructive operations.
- Transactions, state transitions, races, ordering, timeouts, cancellation, retries, idempotency, and partial failure.
- Error propagation, cleanup, recovery, and observability.

## Security and trust

- Authentication, authorization, tenancy, secrets, dependencies, injection, unsafe output, and sensitive logging.
- New network, filesystem, subprocess, credential, or permission boundaries.

## Compatibility and operations

- Public APIs, stored data, configuration, generated artifacts, packaging, deployment, and rollback.
- Performance and resource bounds on changed hot paths.
- Accessibility and rendered behavior for user interfaces.

## Tests and documentation

- Tests for changed behavior, boundaries, and meaningful failures.
- Missing docs, schemas, or operational instructions required by the change.

## Finding threshold

A finding must include location, trigger, impact, evidence, realistic severity, and the smallest credible remediation. Attempt to falsify it first. Keep unverified suspicions in residual risk rather than confirmed findings.

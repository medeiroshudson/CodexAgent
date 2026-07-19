# Test Strategy

## Select the boundary

- Unit: isolated logic with stable public inputs and outputs.
- Contract: schemas, adapters, serialization, generated clients, or API boundaries.
- Integration: storage, processes, framework wiring, package composition, or generated artifacts.
- Broader workflow: only when a critical cross-component behavior cannot be proven at a narrower level.

Choose the lowest level that observes the real regression boundary. Do not use broad tests to compensate for unclear behavior.

## Build the risk matrix

Cover only cases that can reveal a materially different failure:

- expected behavior;
- input or state boundaries;
- important rejection or failure behavior;
- cleanup, retry, idempotency, ordering, or cancellation when relevant;
- compatibility or migration behavior when changed.

Positive/negative pairs and Arrange-Act-Assert are useful conventions, not universal requirements.

## Determinism

- Control time, randomness, locale, network, filesystem paths, and process state.
- Mock external boundaries, not the behavior under test.
- Use minimal, secret-free fixtures.
- Avoid retries, sleeps, and broad snapshots that hide nondeterminism.

## Stopping criteria

Stop adding tests when the assigned behavior and material risks are covered at the correct level and additional cases repeat the same contract. Document environment-dependent gaps and substitute evidence.

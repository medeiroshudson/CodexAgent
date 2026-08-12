# Specification contract v1

Material planned or coordinated changes use one in-memory specification contract. It is returned with the approved plan and passed through handoffs; it is not written to a plan file unless the user explicitly requests an artifact.

## Required sections

- `outcome`: the observable user or system result.
- `scope`: included behavior and affected boundaries.
- `nonGoals`: stable `NG-*` identifiers for explicitly excluded behavior.
- `invariants`: stable `INV-*` identifiers for behavior that must remain true.
- `securityBoundaries`: stable `SEC-*` identifiers for trust, authority, credentials, privacy, destructive actions, and external mutation constraints.
- `failureModes`: stable `FAIL-*` identifiers, each with trigger, safe expected behavior, and recovery or rollback.
- `compatibility`: callers, formats, persistent state, platforms, and migrations that must remain supported.
- `acceptanceOracles`: stable `AO-*` identifiers, each naming the behavior or contract IDs it proves, the expected observation, and the validation surface.

If a section genuinely does not apply, record `none identified` plus a short justification. Omission is not equivalent to absence.

## Compatibility aliases

Existing plans remain valid inputs. Normalize `exclusions` to `nonGoals`; constraints to the applicable invariant or security boundary; and `done criteria` or `acceptance criteria` to `acceptanceOracles`. Preserve the original meaning and assign IDs only when the change is material enough to use this contract.

## Propagation

Keep the complete contract once at the plan/orchestration level. Task packets carry only `specRefs`, the IDs relevant to that task. Workers must preserve referenced non-goals, invariants, and security boundaries and implement referenced failure behavior. Integrators and final verifiers receive the complete contract so they can audit coverage and drift.

Do not hash free-form specification text. Drift enforcement requires a future versioned machine-readable schema and canonical normalizer; a text hash without those contracts is ritual rather than evidence.

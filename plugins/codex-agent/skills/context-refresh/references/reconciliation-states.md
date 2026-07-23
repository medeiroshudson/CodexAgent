# Reconciliation states

Resolve these states before refresh:

| State | Refresh behavior |
|---|---|
| Valid canonical catalog only | Continue with refresh. |
| No catalog | Return `NOT_INITIALIZED`; use `$context-init`. |
| Legacy catalog only | Treat as read-only migration input; use `$context-init`. |
| Canonical and legacy byte-equivalent | Stop for migration finalization; do not refresh across both roots. |
| Canonical and legacy divergent | Return `CONFLICT`; make no writes. |
| Invalid catalog, escaping path, or symlink | Return `BLOCKED`; fail closed. |

Canonical means `.codex-agent/context/index.json`. The legacy `.agents/context` tree is never a refresh destination.

## File decisions

- `create`: a managed surface is required and no conflicting owner exists.
- `update`: verified evidence changes only the matching managed region.
- `preserve`: content is manual, curated, unchanged, or insufficiently evidenced for replacement.
- `remove`: affirmative evidence and the reviewed managed contract require removal.
- `migrate`: a supported managed representation changes shape without changing ownership.
- `conflict`: ownership, markers, evidence, paths, or preconditions cannot be reconciled safely.

Any conflict blocks the complete transaction. A force option may replace only an exact reviewed managed-file conflict; it never resolves divergent context roots or chooses between competing durable facts.

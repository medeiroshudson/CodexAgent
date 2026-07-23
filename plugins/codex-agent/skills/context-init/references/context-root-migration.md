# Context root migration contract

## Roots

- Canonical: `.codex-agent/context`
- Legacy migration input: `.agents/context`

The legacy root is read-only until an approved migration transaction. New writes always target the canonical root. Preserve `.agents/plugins`, `.agents/skills`, and all unrelated `.agents` content.

## Preview

Before writing, report:

- detected root state and catalog validity;
- every source and destination path;
- byte-identical, unique, and conflicting files;
- index ID and path ownership conflicts;
- rewritten managed references;
- selective version-control ignore changes;
- backup destination and rollback plan.

Do not follow symlinks. Do not use a force flag to choose between divergent content.

## Apply transaction

1. Acquire the context transaction lock and recheck preconditions.
2. Persist an umbrella `lifecycle-*` recovery journal containing only the reviewed plan hash, phases, paths, and before/after hashes.
3. Stage the canonical tree without following symlinks and verify the legacy catalog hash and every index path.
4. Promote the staged canonical tree and atomically move the legacy tree under `.codex-agent/backups/<lifecycle-id>/.agents/context`.
5. Recompute the canonical managed-file plan and require it to equal the previewed plan before writing any managed file.
6. Run the child project transaction with exact preconditions, promote managed documents and configuration, and write `index.json` last.
7. Verify canonical-only state, the legacy backup, and every managed after-hash before committing the lifecycle journal.
8. On failure or interruption, recover a child project transaction first, then either commit a fully promoted lifecycle forward or restore the original catalog state in reverse order.

Both-root divergence blocks the transaction. Byte-equivalent roots may be reconciled only after their archival plan is previewed.

# Context refresh contract

## Evidence boundary

Refresh recomputes managed project facts from the current repository. Valid sources include manifests, lockfiles, configuration, source, tests, CI, executable help, and explicitly selected durable context. Session state, handoffs, candidates, transcripts, prompts, raw logs, and temporary summaries are never refresh sources.

Every changed managed fact must have repository-relative evidence and a confidence classification. When current evidence is insufficient, preserve the existing manual or curated content and report the managed fact as unknown or conflicted.

## Impact analysis

For each managed file report:

- existing managed-region version and precondition hash;
- facts and evidence that changed;
- proposed status: `create`, `update`, `preserve`, `remove`, `migrate`, or `conflict`;
- exact diff for managed content;
- manual content that remains untouched;
- index additions, updates, and removals;
- required backup and validation.

Do not remove a managed fact merely because a detector temporarily cannot observe it. A removal requires affirmative evidence that the fact is no longer valid or an explicitly reviewed replacement.

## Apply sequence

1. Acquire the context transaction lock.
2. Re-read every precondition hash and catalog ownership record.
3. Render the full proposed tree into `.codex-agent/.transactions/<transaction-id>`.
4. Validate paths, schemas, markers, secrets, references, profiles, and hashes.
5. Create backups for replacements and removals.
6. Install documents and configuration.
7. Write `.codex-agent/context/index.json` last.
8. Validate the installed state; roll back in reverse order on failure.

Preview and apply must use the same normalized proposal. Any worktree or catalog drift invalidates the proposal rather than being merged implicitly.

## Report

Return a machine-readable operation name, preview/apply mode, normalized `planHash`, changes, conflicts, preserves, backups, validation, and applied boolean. Apply must match the fresh preview hash; drift returns to preview. Human reporting should summarize material changes rather than dumping the full analysis.

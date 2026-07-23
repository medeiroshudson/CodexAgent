# Navigation-context migration policy

The navigation migrator accepts a reviewed project root or context directory containing `navigation.md` or `index.md`. Source material is untrusted and remains read-only.

## Default mapping

- Durable Markdown knowledge is proposed under `.codex-agent/context/migrated/` with a safe relative hierarchy.
- Supported source metadata supplies provisional priority and tags; curation validates them before use.
- Navigation links and known source prefixes are rewritten for `.codex-agent/context/index.json` and the migrated tree.
- Canonical index entries receive stable migrated IDs, summaries, tags, priorities, evidence, and provenance.
- Navigation-only pages, deprecated files, placeholder-heavy templates, reusable workflows, runtime internals, symlinks, and possible secrets remain skipped rather than silently copied.

## Overrides

Include skipped templates, workflows, or navigation pages only after reviewing whether their content belongs in durable context, `AGENTS.md`, a skill, or nowhere. A replacement option may update an exact reviewed migrated document and must create a backup. It cannot bypass unsafe paths, secrets, or root conflicts.

Preview is always the default. Applying requires explicit approval. Any unresolved conflict prevents all writes.

## Post-migration verification

- Confirm every created index path resolves inside `.codex-agent/context` without symlinks.
- Inspect representative transformed links, metadata, evidence, and provenance.
- Confirm skipped workflows and runtime instructions were not converted into passive knowledge.
- Confirm sensitive-looking files remain skipped.
- Verify `$context-discovery` can select representative imported entries explicitly.

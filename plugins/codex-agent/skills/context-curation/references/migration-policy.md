# Navigation-context migration policy

The migrator accepts either a project root or a context directory. Discovery checks a project-relative context root declared in `.oac.json`, then `.claude/context`, `context`, `.opencode/context`, and finally the supplied directory itself. A valid root contains `navigation.md` or `index.md`.

## Default mapping

- Markdown knowledge is written under `.agents/context/migrated/` with its relative hierarchy preserved.
- The source HTML metadata comment supplies priority and tags.
- Navigation links and known source context prefixes are rewritten for `.agents/context/index.json` and the migrated tree.
- Native index entries receive stable `migrated-*` IDs, summaries, tags, and priorities.
- Navigation pages, deprecated files, placeholder-heavy templates, reusable workflows, runtime internals, and possible secrets are reported under `skipped` rather than silently copied.

## Overrides

- `--include-templates` includes placeholder-heavy files for manual completion.
- `--include-workflows` includes procedures and runtime-oriented files that normally belong in skills.
- `--include-navigation` includes navigation pages even though `index.json` is the native catalog.
- `--force` permits replacement of a conflicting migrated document after review and creates backups. Valid migration markers preserve manual Markdown outside the managed region; an unmarked conflicting file requires full replacement from its backup-protected state.

Preview is always the default for this migration format. Applying requires `--apply`. Any unresolved conflict prevents all writes.

## Post-migration verification

- Confirm every created index path resolves inside `.agents/context/`.
- Inspect representative transformed links and metadata.
- Confirm skipped workflows and runtime instructions were not converted into passive knowledge.
- Confirm symlinks and sensitive-looking files remain skipped.
- Run doctor and verify `$context-discovery` can select representative imported entries.

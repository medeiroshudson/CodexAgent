# Managed files

The initializer can create or refresh:

- `AGENTS.md`
- `.agents/context/index.json`
- `.agents/context/architecture/system.md`
- `.agents/context/standards/code-quality.md`
- `.agents/context/standards/testing.md`
- `.agents/context/standards/security.md`
- `.agents/context/project-intelligence/project.md`
- `.codex/config.toml`
- `.codex/agents/*.toml`
- `.codex-agent/analysis.json`

Markdown uses HTML managed markers; TOML uses comment markers. Refresh replaces only the matching managed region. Manual Markdown outside the region is retained. Custom context index entries are retained.

Entries created by `$context-curation` use non-managed IDs and category directories, so project refresh preserves them.

Agent TOML files are generated from canonical Markdown under `plugins/codex-agent/agents/`. The checked-in project templates and embedded CLI module are generated artifacts and must remain byte-synchronized with those sources. Run `npm run agents:sync` after editing an agent prompt and `npm run agents:check` during verification.

Existing TOML without matching markers is a conflict because merging duplicate TOML keys could silently change behavior. `--force` replaces that file only after writing a backup. Malformed or one-sided managed markers are also conflicts.

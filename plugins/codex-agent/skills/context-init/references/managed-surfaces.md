# Managed surfaces

Context initialization may create these repository surfaces:

- `AGENTS.md` managed guidance;
- `.gitignore` managed rules that keep canonical context versionable and runtime state ignored;
- `.codex-agent/context/index.json`;
- `.codex-agent/context/architecture/system.md`;
- `.codex-agent/context/standards/code-quality.md`;
- `.codex-agent/context/standards/testing.md`;
- `.codex-agent/context/standards/security.md`;
- `.codex-agent/context/project-intelligence/project.md`;
- `.codex/config.toml`;
- `.codex/agents/*.toml`;
- `.codex-agent/analysis.json`.

The exact preview is authoritative; this list describes the supported categories, not permission to create every file.

## Ownership

- Markdown and TOML use explicit managed markers. Replace only a matching managed region.
- Preserve manual Markdown outside managed markers and custom context index entries.
- Entries created by `$context-curation` use non-managed identifiers and remain untouched by initialization and refresh.
- Unmarked TOML, malformed markers, duplicate keys, and incompatible managed-region versions are conflicts.
- Replacements require exact review and a backup.
- Context documents and their index entries are one consistency boundary.

## Excluded state

Initialization never manages `.codex-agent/sessions`, `.codex-agent/backups`, `.codex-agent/.locks`, `.codex-agent/.transactions`, candidate Markdown, transcripts, or task plans. Runtime state remains ignored by version control; `.codex-agent/context` remains versionable.

## Generated profiles

Canonical agent prompts live under `plugins/codex-agent/agents/`. The generated ESM profile module and project TOML templates must remain byte-synchronized with those prompts. Run `npm run agents:sync` after canonical prompt changes and `npm run agents:check` during verification.

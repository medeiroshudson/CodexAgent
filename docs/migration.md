# Migration Guide

## Map by responsibility

- Persistent global behavior becomes `AGENTS.md` guidance.
- Reusable procedures become focused skills.
- Specialist prompts become narrow plugin agents or project TOML agents.
- Long knowledge files become indexed `.agents/context/` entries or skill references.
- User shortcuts become thin commands.
- Deterministic lifecycle enforcement becomes trusted hooks.
- External data and actions use MCP or connected apps rather than prompt-only simulations.

## Avoid direct translation

Do not copy a source framework's directory names, tool names, model identifiers, installer assumptions, or permission semantics. Confirm each behavior against the current Codex surface.

Start with critical quality, security, testing, architecture, and project-intelligence context. Add more entries only when real tasks demonstrate a recurring need.

## Navigation-based context trees

Use the dedicated migrator for a context tree organized by `navigation.md`, source metadata comments, and an optional project-relative root configuration:

```bash
codex-agent migrate navigation --from /path/to/project --json
codex-agent migrate navigation --from /path/to/project --apply --json
```

The default preview maps compatible Markdown into `.agents/context/migrated/`, converts priority and summary metadata, rewrites known context paths, and produces native index entries. It reports navigation pages, templates, deprecated files, runtime procedures, workflows, and sensitive-looking content as skipped. These classes require explicit include flags or manual conversion to the correct native surface.

Existing destination conflicts block the entire apply. After review, `--force` updates valid migration-managed regions while preserving surrounding Markdown. An unmarked conflicting file is backed up before full replacement.

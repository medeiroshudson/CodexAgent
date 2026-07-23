# Migration Guide

## Map by responsibility

- Persistent always-on behavior becomes `AGENTS.md` guidance.
- Reusable Codex procedures become focused skills.
- Specialist prompts become narrow plugin agents or project TOML agents.
- Long-lived project knowledge becomes indexed `.codex-agent/context/` entries or direct skill references.
- Deterministic validation and writes belong in scripts; hooks remain optional reminders.
- External data and actions use MCP or connected apps rather than prompt-only simulations.

Do not translate another runtime's slash commands, model identifiers, installer assumptions, shared mutable agent files, or permission semantics directly. Confirm each behavior against the current Codex surface. The plugin intentionally distributes skills rather than command-prompt Markdown.

## Move the legacy context root

`codex-agent context init` detects a legacy `.agents/context/` catalog and includes its migration in the preview. Applying the initialization:

1. validates both roots, index entries, containment, and symlinks;
2. blocks invalid or divergent catalogs;
3. acquires the global context lock;
4. writes an umbrella lifecycle recovery journal and copies the legacy tree into a child transaction;
5. verifies the source hash, promotes `.codex-agent/context/`, and moves `.agents/context/` atomically into the journal's deterministic backup path;
6. requires the post-migration managed-file plan to match the reviewed `planHash`, then writes managed files through a recoverable project transaction with the context index last;
7. verifies canonical-only state and all after-hashes before committing, or restores the original catalog after an error or interrupted partial promotion;
8. preserves every other `.agents/` sibling throughout recovery.

The marketplace descriptor and any `.agents/skills/` directory are preserved. Writers never choose a side with `--force` when two catalogs diverge.

## Navigation-based context trees

Use the dedicated migrator for a context tree organized by `navigation.md`, source metadata comments, and an optional project-relative root configuration:

```bash
codex-agent migrate navigation --from /path/to/project --json
codex-agent migrate navigation --from /path/to/project --apply --json
```

The default preview maps compatible Markdown into `.codex-agent/context/migrated/`, converts priority and summary metadata, rewrites known context paths, and produces native index entries. It reports navigation pages, templates, deprecated files, runtime procedures, workflows, symlinks, and sensitive-looking content as skipped. These classes require explicit include flags or manual conversion to the correct native surface.

Existing destination conflicts block the entire apply. After review, `--force` updates valid migration-managed regions while preserving surrounding Markdown. An unmarked conflicting file is backed up before full replacement. Every apply uses the same global lock and document-before-index transaction contract as normal context curation.

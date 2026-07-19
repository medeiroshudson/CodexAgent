# Architecture

## Ownership

| Surface | Responsibility |
|---|---|
| `AGENTS.md` | Durable repository instructions and verification commands |
| `.agents/context/` | Optional indexed project knowledge selected per task |
| `plugins/codex-agent/skills/` | Reusable workflows and progressive disclosure |
| `plugins/codex-agent/agents/` | Portable narrow role instructions |
| `.codex/agents/` templates | Project-specific sandbox and subagent configuration |
| `commands/` | Thin user entrypoints |
| `hooks/` | Trusted deterministic lifecycle reminders |
| `project-init` skill | Discovery orchestration, evidence review, preview, and approval gate |
| `project-init/scripts/project-init.mjs` | Deterministic analysis, validation, rendering, merge, backup, and apply |
| `context-curation` skill | Durable-knowledge classification, deduplication, preview, and explicit approval |
| `context-curation/scripts/context-save.mjs` | Deterministic context validation, storage, backup, and index coordination |
| `context-curation/scripts/navigation-migrate.mjs` | Navigation-tree discovery, compatibility filtering, transformation, and indexed migration |
| `packages/codex-agent-cli/` | Thin CLI for initialization, diagnosis, migration, context storage, and indexing |
| `evals/` | Routing contracts and behavioral benchmark inputs |

## Execution flow

1. Read active repository guidance.
2. Select task-specific context.
3. Plan only when scope has not already been approved.
4. Break complex work into dependency-aware tasks.
5. Delegate bounded work with conservative write concurrency.
6. Implement incrementally and validate narrowly.
7. Review requirements and engineering risk.
8. Report fresh completion evidence and residual risk.

## Mutable state

Installed plugin files are treated as immutable. Project configuration belongs in the project, and optional plugin runtime state belongs under `PLUGIN_DATA`. The CLI stores overwrite backups under `.codex-agent/backups/` in the target project.

## Project initialization

Initialization is optional and uses a two-layer pipeline:

```text
$project-init
  -> $context-discovery (read-only repository evidence)
  -> project analysis (detected, inferred, unknown)
  -> deterministic validation and rendering
  -> preview and diff
  -> explicit apply or refresh
```

The intermediate `.codex-agent/analysis.json` records evidence and confidence. Generated Markdown and TOML use managed markers so refresh can preserve manual content. Existing unmarked TOML is treated as a conflict; forced replacement creates a backup first.

## Durable context curation

Context persistence uses a separate approval boundary:

```text
task completion
  -> durability and sensitivity assessment
  -> duplicate search through context-discovery
  -> exact destination and Markdown preview
  -> explicit user approval
  -> coordinated context document and index write
```

The `Stop` hook only reminds the active agent to assess candidates. It never writes files. Curated entries live under category directories and remain optional; `context-discovery` must select them explicitly. Context updates preserve manual Markdown outside managed markers and create backups before replacement.

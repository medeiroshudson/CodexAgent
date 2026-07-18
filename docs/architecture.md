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
| `packages/codex-agent-cli/` | Safe bootstrap, diagnosis, and context indexing |
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


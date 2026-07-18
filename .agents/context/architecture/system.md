# System Boundaries

- `AGENTS.md` contains durable repository guidance applied before work begins.
- `skills/` contains reusable, triggerable workflows and loads detailed references on demand.
- `agents/` contains narrow role instructions for delegated work.
- `.codex/agents/*.toml` configures local subagent models, sandboxing, and MCP access when a project opts in.
- `commands/` provides short, user-invocable entrypoints into skills.
- `hooks/` runs deterministic lifecycle checks after user trust review.
- `.agents/context/` stores optional team knowledge. The context-discovery workflow must select files explicitly.
- `PLUGIN_DATA` stores mutable plugin state; installed plugin files remain immutable.


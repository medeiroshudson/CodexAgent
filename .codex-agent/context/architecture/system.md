# System Boundaries

- `AGENTS.md` contains durable repository guidance applied before work begins.
- `skills/` contains reusable, triggerable workflows and loads detailed references on demand.
- `agents/` contains narrow role instructions for delegated work.
- `.codex/agents/*.toml` configures local subagent roles, sandboxing, and MCP access when a project opts in.
- `hooks/` runs optional deterministic lifecycle reminders after user trust review.
- `.codex-agent/context/` stores versioned optional team knowledge. `$context-discovery` must select entries explicitly.
- `.codex-agent/sessions/` stores ignored resumable handoffs only after explicit task-level opt-in.
- `.agents/plugins/marketplace.json` remains the repository marketplace descriptor.
- Skills own procedures; scripts own deterministic validation and writes. The plugin does not distribute slash-command prompts.

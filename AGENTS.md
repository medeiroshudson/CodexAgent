# Codex Agent Repository Guidance

## Scope

Build and maintain the `codex-agent` plugin with native Codex conventions. Keep plugin behavior portable across the Codex app, CLI, and IDE extension.

## Working agreements

- Treat `.codex-agent/context/index.json` as the canonical catalog for optional repository context. Select entries explicitly; never assume files under `.codex-agent/context/` are loaded automatically.
- Keep durable repository rules in `AGENTS.md`; keep reusable workflows in skills; keep deterministic enforcement in hooks or scripts.
- Plugin slash commands are not a supported contract. Keep CLI handlers thin and let the corresponding skill own each workflow.
- Keep every skill focused on one job and use progressive disclosure through direct `references/` links.
- Prefer read-only agents for discovery, research, and review. Grant workspace write access only to implementation or test-authoring roles.
- Do not make any model mandatory for plugin operation. `$agent-orchestration` may request a runtime-advertised model and reasoning effort through its capability-based routing contract; respect user or project-profile pins and fall back to parent inheritance when an override is unavailable or unjustified.
- Keep session state ephemeral unless the user explicitly opts in to resumability. The orchestrator is the sole session writer, and durable context promotion always requires separate curation approval.
- Classify materiality before the first write: a change is material when it adds, removes, or renames a distributed or architectural surface (skill, agent prompt, hook, CLI command, schema, manifest field, template, generated artifact, eval contract), changes a rule that applies to more than one skill, agent, or consumer project, changes a public contract or state ownership, or is difficult to reverse. An explicit request authorizes bounded work; it never substitutes for an approved design. Present the plan and get approval through `$plan-and-approve` before mutating a material surface.
- Do not claim completion without running proportional validation and reporting the evidence.
- Write user-facing summaries as direct prose: lead with the outcome, keep evidence exact, and remove staged openers, inflated significance, decorative formatting, emoji, and chatbot residue. Use `$humanizer` for the final answer and for text the user will keep.

## Verification

Run these commands after relevant changes:

```bash
npm test
npm run validate
```

For plugin ingestion changes, also run the plugin validator documented in `CONTRIBUTING.md`.

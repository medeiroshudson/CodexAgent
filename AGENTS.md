# Codex Agent Repository Guidance

## Scope

Build and maintain the `codex-agent` plugin with native Codex conventions. Keep plugin behavior portable across the Codex app, CLI, and IDE extension.

## Working agreements

- Treat `.codex-agent/context/index.json` as the canonical catalog for optional repository context. Select entries explicitly; never assume files under `.codex-agent/context/` are loaded automatically.
- Keep durable repository rules in `AGENTS.md`; keep reusable workflows in skills; keep deterministic enforcement in hooks or scripts.
- Plugin slash commands are not a supported contract. Keep CLI handlers thin and let the corresponding skill own each workflow.
- Keep every skill focused on one job and use progressive disclosure through direct `references/` links.
- Prefer read-only agents for discovery, research, and review. Grant workspace write access only to implementation or test-authoring roles.
- Do not hard-code a model in the plugin. Let the parent session choose unless a consumer explicitly installs a project agent profile.
- Keep session state ephemeral unless the user explicitly opts in to resumability. The orchestrator is the sole session writer, and durable context promotion always requires separate curation approval.
- Do not claim completion without running proportional validation and reporting the evidence.

## Verification

Run these commands after relevant changes:

```bash
npm test
npm run validate
```

For plugin ingestion changes, also run the plugin validator documented in `CONTRIBUTING.md`.

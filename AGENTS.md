# Codex Agent Repository Guidance

## Scope

Build and maintain the `codex-agent` plugin with native Codex conventions. Keep plugin behavior portable across the Codex app, CLI, and IDE extension.

## Working agreements

- Treat `.agents/context/index.json` as the catalog for optional repository context. Do not assume files under `.agents/context/` are loaded automatically.
- Keep durable repository rules in `AGENTS.md`; keep reusable workflows in skills; keep deterministic enforcement in hooks or scripts.
- Keep commands thin. Commands may select a workflow, but the corresponding skill owns the procedure.
- Keep every skill focused on one job and use progressive disclosure through direct `references/` links.
- Prefer read-only agents for discovery, research, and review. Grant workspace write access only to implementation or test-authoring roles.
- Do not hard-code a model in the plugin. Let the parent session choose unless a consumer explicitly installs a project agent profile.
- Do not claim completion without running proportional validation and reporting the evidence.

## Verification

Run these commands after relevant changes:

```bash
npm test
npm run validate
```

For plugin ingestion changes, also run the plugin validator documented in `CONTRIBUTING.md`.


---
name: project-init
description: Analyze an existing repository and safely bootstrap or refresh Codex project guidance, optional context, and agent profiles from evidence. Use when initializing codex-agent for a project, replacing generic templates with repository-specific facts, or updating managed guidance after the project stack or commands change.
---

# Project Init

Create an evidence-backed Codex setup for the current repository. Initialization is an optional optimization: the other plugin skills remain usable without generated project files.

## Workflow

1. Use `$context-discovery` to read applicable `AGENTS.md` files, inspect the context catalog, and identify repository architecture, commands, tests, CI, security boundaries, and nearby conventions. Keep this stage read-only.
2. Run `node scripts/project-init.mjs --root <repository>` from this skill directory, or the installed `codex-agent init --root <repository>` CLI. The default is preview-only and must not write files.
3. Review `.analysis`, `.changes`, evidence, confidence, unknowns, and conflicts in the JSON result. Never convert a guess into a detected fact. A convention needs evidence from multiple files.
4. If model-assisted discovery found additional facts, copy the preview analysis to a JSON file, add only evidence-backed values that satisfy [the analysis contract](references/analysis-contract.md), then preview with `--analysis <file>`.
5. Present the material changes and unresolved uncertainty to the user. Obtain explicit approval before applying unless the user already authorized implementation in the current task.
6. Apply with `--apply`. Use `--refresh` for an existing generated setup. Both update only managed sections and write `.codex-agent/analysis.json`.
7. If a TOML file or managed marker conflicts, stop and review it. Use `--force` only with explicit approval; the script backs up replaced conflicts under `.codex-agent/backups/`.
8. Run `codex-agent doctor --root <repository>` and the repository's detected validation commands. Report exact evidence and any remaining unknowns.

## Safety rules

- Do not claim that `.agents/context/` is loaded automatically. Select its entries explicitly through `.agents/context/index.json`.
- Preserve manual content outside `codex-agent:managed` markers.
- Do not create placeholder facts or generic commands. Unknown fields stay `unknown` and are omitted from fact sections.
- Do not hard-code a model in generated agent profiles.
- Do not apply a preview just because discovery succeeded; approval and discovery are separate gates.

## Resources

- `scripts/project-init.mjs` performs deterministic scanning, validation, rendering, preview, merge, backup, and apply.
- [Analysis contract](references/analysis-contract.md) documents the intermediate JSON and evidence rules.
- [Managed files](references/managed-files.md) documents ownership and refresh behavior.

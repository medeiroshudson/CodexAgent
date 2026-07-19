---
name: project-init
description: Analyze an existing repository and preview or refresh evidence-backed Codex guidance, indexed context, and native agent profiles. Use when initializing codex-agent, replacing generic setup, or updating managed guidance after stack, commands, architecture, or validation changes.
---

# Project Init

## Outcome

Create or refresh a repository-specific Codex setup whose facts are evidence-backed, whose writes are previewed and managed, and whose generated agent profiles match the plugin's canonical prompts.

Initialization is optional. Bundled skills remain usable without generated project files.

## Critical rules

1. Keep discovery read-only until the preview is reviewed.
2. Use `$context-discovery` to inspect active instructions, context catalog, architecture, commands, tests, CI, security boundaries, and conventions.
3. Classify every fact as `detected`, `inferred`, or `unknown`; never render guesses or placeholders as project guidance.
4. Require repository-relative evidence for every detected or inferred fact. Global conventions need repeated evidence.
5. Preserve manual Markdown outside managed markers and custom context index entries.
6. Treat unmarked TOML, malformed markers, and incompatible managed regions as conflicts.
7. Do not hard-code a model in generated profiles; inherit the parent session unless a consumer configures one.
8. Preview does not imply apply authority. Use `--force` only after explicit conflict review; replacements create backups.
9. Verify that generated agent TOML files match canonical plugin profiles and remain usable from the self-contained `npx` CLI bundle.

## Workflow

1. Run `$context-discovery` and identify repository facts, unknowns, conflicts, and evidence paths.
2. From the target repository, run `npx --yes @codex-agent/cli@latest init`. Preview is the default and must not write.
3. Review `.analysis`, `.changes`, confidence, evidence, unknowns, and conflicts in the JSON result.
4. When model-assisted discovery establishes additional facts, copy the preview analysis to a JSON file and add only values satisfying [the analysis contract](references/analysis-contract.md). Preview again with `--analysis <file>`.
5. Present material changes and unresolved uncertainty. Apply only when the user has authorized initialization or approves the preview.
6. Run with `--apply`. Use `--refresh` for an existing generated setup. Both update managed regions and `.codex-agent/analysis.json`.
7. Stop on TOML or marker conflicts. Use `--force` only after the exact replacement is reviewed and approved.
8. Run `npx --yes @codex-agent/cli@latest doctor` plus detected repository validation commands.
9. Confirm all context index paths resolve and every expected native agent profile was generated from the canonical prompt set.

## Evidence decisions

- `detected`: a manifest, lockfile, config, source, or directory directly establishes the fact.
- `inferred`: multiple observations support a fact the repository does not declare directly.
- `unknown`: evidence is insufficient; omit the fact.

## Managed surfaces

Read [managed files](references/managed-files.md) before refresh or forced replacement. The deterministic initializer owns scanning, validation, rendering, managed merges, backups, preview, and apply.

## Failure handling

- Published CLI unavailable: report the distribution blocker; do not silently claim the public path worked.
- Missing evidence: keep the field unknown.
- Conflicting unmarked TOML: preview and stop unless replacement is explicitly authorized.
- Unsupported repository environment: report exact missing commands or permissions and retain the preview.

## Output contract

Report:

- detected, inferred, and unknown project facts;
- files to create, update, preserve, or conflict;
- exact evidence and confidence for material guidance;
- whether writes were previewed or applied;
- doctor and repository validation results;
- remaining uncertainty and backups created.

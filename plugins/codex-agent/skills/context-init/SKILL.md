---
name: context-init
description: Create the first evidence-backed Codex project context and managed guidance with preview-first writes. Use for an uninitialized repository or an approved migration from the legacy read-only context root; do not use to refresh an existing canonical catalog.
---

# Context Init

## Outcome

Create the repository's first canonical `.codex-agent/context` catalog and managed Codex guidance from verified repository evidence while preserving user authority, manual content, and native agent contracts.

Initialization is optional. Bundled skills remain usable without generated project files.

## Required inputs

- Repository root and current working directory.
- Current authority: preview only or an explicitly approved apply.
- Repository instructions, source evidence, commands, tests, and material unknowns.
- The context-root state from [the first-context contract](references/first-context-contract.md).

## Critical rules

1. Run `$context-discovery` before proposing project facts or files.
2. Use `context init` only when canonical context has not been initialized. Route an existing canonical catalog to `$context-refresh`.
3. Treat `.codex-agent/context` as canonical. Treat `.agents/context` only as read-only migration input and never create a second source of truth.
4. Classify every fact as `detected`, `inferred`, or `unknown`; omit unsupported facts instead of rendering guesses or placeholders.
5. Keep preview read-only. Present the complete human-readable approval plan in the user response before requesting approval. The `planHash` is an integrity identifier for the displayed plan, never a substitute for explaining it and never something the user must copy or repeat.
6. Never ingest sessions, handoffs, candidates, transcripts, prompts, or temporary task state during initialization.
7. Preserve manual Markdown outside managed markers, custom indexed entries, unrelated configuration, and user-owned worktree changes.
8. Never claim that context files load automatically. Agents select entries explicitly through `.codex-agent/context/index.json`.
9. Do not hard-code a model or rewrite canonical agent role contracts.
10. Analyze through ecosystem-neutral units, toolchains, technologies, and path ownership. Never reduce a polyglot repository to one package manager or assign a path role from its directory name when a solution or workspace declares otherwise.
11. Surface scan exclusions, limits, and truncation. A truncated inventory lowers confidence and must never be presented as complete discovery.

## Workflow

1. **Discover** — run `$context-discovery`; record active instructions, source patterns, tests, commands, security boundaries, and unknowns.
2. **Resolve state** — apply [the first-context contract](references/first-context-contract.md). Stop on divergent roots, invalid catalogs, symlinks, or unsupported paths.
3. **Analyze** — build evidence-backed signals satisfying [the analysis contract](references/analysis-contract.md). Ask only questions whose answers materially change durable guidance.
4. **Preview** — from the target repository, run `npx --yes @codex-agent/cli@latest context init`. When repository ownership requires `.codex/config.toml` or `.gitignore` to remain untouched, repeat `--exclude-managed <path>` for those supported optional surfaces. Review the structured `approvalPlan`, analysis, exclusions, changes, preservation decisions, migration actions, unknowns, and conflicts.
5. **Refine** — when model-assisted analysis establishes additional facts, supply a validated analysis file and preview again. Never write during refinement.
6. **Present** — answer with the plan's outcome, detected project/stack summary, every material file action, preserved content and exclusions, conflicts, safeguards, and integrity ID. Ask the user to approve the displayed plan or request changes. Never respond with only a hash, never ask the user to echo it, and never make CLI syntax the approval interface.
7. **Apply** — after the user approves the displayed plan in natural language, internally reuse its exact integrity ID with the identical exclusions. Drift or changed exclusions invalidates the plan and requires presenting a new complete preview. Use replacement authority only for the exact reviewed conflict.
8. **Verify** — confirm the canonical index resolves, managed and manual regions are intact, generated profiles match canonical prompts, and repository-specific checks pass.

Read [the context-root migration contract](references/context-root-migration.md) whenever the legacy root exists.

## Failure handling

- Existing canonical context: stop and route to `$context-refresh`.
- Divergent canonical and legacy roots: report the conflicting paths and make no writes.
- Missing evidence: keep the signal unknown.
- Invalid index, escaping path, symlink, malformed marker, or unmarked TOML collision: fail closed and report the exact conflict.
- Public CLI unavailable: report the distribution blocker; do not substitute an unreviewed write path or claim initialization succeeded.

## Output contract

Return:

- `Status` — `PREVIEW_READY`, `APPLIED`, `ALREADY_INITIALIZED`, `MIGRATION_CONFLICT`, or `BLOCKED`.
- `Analysis` — detected, inferred, and unknown facts with evidence.
- `Changes` — create, migrate, preserve, conflict, and backup decisions.
- `Plan` — a self-contained human-readable outcome, evidence summary, file actions, preserves, conflicts, safeguards, and residual risk.
- `Authority` — whether the displayed plan awaits approval or was approved in natural language, plus its integrity ID for traceability.
- `Validated` — exact checks and outcomes.
- `Remaining` — unresolved conflicts, unknowns, and residual risk.

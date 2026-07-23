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
5. Keep preview read-only. Only `--apply` together with the exact preview `planHash` authorizes the deterministic writer after the changes and conflicts have been reviewed.
6. Never ingest sessions, handoffs, candidates, transcripts, prompts, or temporary task state during initialization.
7. Preserve manual Markdown outside managed markers, custom indexed entries, unrelated configuration, and user-owned worktree changes.
8. Never claim that context files load automatically. Agents select entries explicitly through `.codex-agent/context/index.json`.
9. Do not hard-code a model or rewrite canonical agent role contracts.

## Workflow

1. **Discover** — run `$context-discovery`; record active instructions, source patterns, tests, commands, security boundaries, and unknowns.
2. **Resolve state** — apply [the first-context contract](references/first-context-contract.md). Stop on divergent roots, invalid catalogs, symlinks, or unsupported paths.
3. **Analyze** — build evidence-backed signals satisfying [the analysis contract](references/analysis-contract.md). Ask only questions whose answers materially change durable guidance.
4. **Preview** — from the target repository, run `npx --yes @codex-agent/cli@latest context init`. Review analysis, changes, preservation decisions, migration actions, unknowns, and conflicts.
5. **Refine** — when model-assisted analysis establishes additional facts, supply a validated analysis file and preview again. Never write during refinement.
6. **Present** — show the complete managed-file plan from [managed surfaces](references/managed-surfaces.md), including backups and any legacy-root relocation.
7. **Apply** — only after explicit approval, run the same operation with `--apply --plan-hash <reviewed-plan-hash>`. Drift invalidates the hash and requires a new preview. Use replacement authority only for the exact reviewed conflict.
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
- `Authority` — preview `planHash` or the exact matched hash and approval used for apply.
- `Validated` — exact checks and outcomes.
- `Remaining` — unresolved conflicts, unknowns, and residual risk.

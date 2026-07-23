---
name: context-refresh
description: Reconcile an initialized canonical Codex project context with current repository evidence using preview-first managed updates. Use after stack, architecture, commands, tests, or managed guidance change; do not use for first setup, legacy-only migration, or session harvesting.
---

# Context Refresh

## Outcome

Refresh an existing canonical `.codex-agent/context` catalog and managed project guidance from current repository evidence without replacing manual content, curated knowledge, or native agent contracts.

## Required inputs

- Repository root and initialized canonical catalog.
- Current authority: preview only or an explicitly approved apply.
- Changed repository evidence or a request to reconcile all managed facts.
- Existing managed surfaces and material user-owned worktree changes.

## Critical rules

1. Run `$context-discovery` before deciding that a managed fact changed.
2. Require a valid canonical `.codex-agent/context/index.json`. Route an absent or legacy-only catalog to `$context-init`.
3. Reanalyze repository source, manifests, configuration, tests, and executable help. Never use sessions, handoffs, candidates, transcripts, or raw task output as refresh input.
4. Keep preview read-only. Only `--apply` together with the exact preview `planHash` authorizes the deterministic writer after the diff and conflicts are reviewed.
5. Preserve manual Markdown, custom indexed entries, curated knowledge, unrelated configuration, and canonical agent role contracts.
6. Classify changes as `create`, `update`, `preserve`, `remove`, `migrate`, or `conflict`; never hide a destructive or incompatible decision inside an update.
7. Treat managed documents and `.codex-agent/context/index.json` as one transaction and write the index last.
8. Fail closed on invalid paths, symlinks, stale preconditions, malformed markers, unmarked TOML, and concurrent modification.
9. Never claim that context files load automatically; selection remains explicit.

## Workflow

1. **Check state** — apply [the reconciliation states](references/reconciliation-states.md). Stop unless the canonical catalog is valid and initialized.
2. **Discover** — run `$context-discovery`; inspect current instructions, catalog entries, representative implementation, tests, commands, and changed evidence.
3. **Analyze impact** — determine affected managed facts and files, leaving unsupported facts unknown. Use [the refresh contract](references/refresh-contract.md).
4. **Preview** — from the target repository, run `npx --yes @codex-agent/cli@latest context refresh`. Review analysis, per-file diffs, preserves, removals, conflicts, and planned backups.
5. **Refine** — validate any model-assisted analysis against repository-relative evidence and preview again. Do not mutate state during refinement.
6. **Approve** — present one complete change set. Require explicit authority for `--apply` and separate exact review for any replacement.
7. **Apply** — run the same operation with `--apply --plan-hash <reviewed-plan-hash>`; reject drift, recheck hashes, and install the staged transaction atomically.
8. **Validate** — verify catalog containment, managed-marker integrity, manual preservation, synchronized agent profiles, and repository-specific checks.
9. **Report** — distinguish applied updates, preserved content, conflicts, backups, unknowns, and validation gaps.

## Failure handling

- Missing canonical catalog: return `NOT_INITIALIZED` and route to `$context-init`.
- Legacy root present: return the applicable migration state; do not write it or refresh across roots.
- Concurrent or post-preview change: invalidate the preview and require a fresh one.
- Conflicting evidence: keep the old fact preserved or mark it conflicted; never silently choose one source.
- Public CLI unavailable: report the blocker without claiming that refresh ran.

## Output contract

Return:

- `Status` — `PREVIEW_READY`, `APPLIED`, `NOT_INITIALIZED`, `CONFLICT`, or `BLOCKED`.
- `Impact` — affected managed facts, evidence, and confidence.
- `Changes` — create, update, preserve, remove, migrate, conflict, and backup decisions.
- `Authority` — preview `planHash` or the exact matched hash and reviewed change set used for apply.
- `Validated` — exact checks and outcomes.
- `Remaining` — stale facts, unknowns, conflicts, and residual risk.

---
name: context-lint
description: Audit canonical repository context for stale provenance, review dates, lifecycle conflicts, duplicates, orphans, and insufficient evidence without writing or using the network. Use when context health must be checked; do not use to curate, repair, or persist context.
---

# Context Lint

## Outcome

Return a deterministic, read-only health report for the explicitly indexed repository context catalog.

## Required inputs

- Repository root.
- Whether warnings should fail the check (`strict`).
- A fixed current date when reproducibility matters.

## Critical rules

1. Never edit context, evidence, lifecycle state, or repository files.
2. Never fetch external evidence; validate only its recorded metadata and HTTPS locator.
3. Treat hashes as integrity signals, not proof that a source is authoritative.
4. Report stale, conflicting, duplicate, orphaned, and insufficiently evidenced context separately.
5. Do not infer semantic contradictions from lexical overlap; route those to read-only review.
6. Keep lifecycle state from the index distinct from health derived at lint time.

## Workflow

1. Run `node scripts/context-lint.mjs --root <repo>` from this skill directory; add `--strict` only when warnings are intended to fail the check.
2. Inspect catalog/schema failures before entry findings.
3. Review error findings before warnings, then entry health and reasons.
4. For a requested repair, hand the findings to `$context-curation`; this skill never applies changes.

Read [the health contract](references/health-contract.md) for status precedence and finding semantics.

## Output contract

Return:

- `Catalog` — state, checked time, and counts.
- `Entry health` — id, path, lifecycle, derived health, and reasons.
- `Findings` — severity, stable code, affected entry/path, and message.
- `Next action` — curation, evidence refresh, or no action.

State clearly whether strict mode was used. Do not claim an external source is current merely because its URL is valid.

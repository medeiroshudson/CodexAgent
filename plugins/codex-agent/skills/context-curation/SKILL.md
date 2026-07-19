---
name: context-curation
description: Evaluate, deduplicate, preview, save, update, or migrate durable project knowledge in the indexed .agents/context catalog with explicit approval. Use for stable architectural decisions, constraints, operations, domain rules, recurring pitfalls, or reviewed navigation-context imports; discard transient or sensitive task state.
---

# Context Curation

## Outcome

Preserve only durable, safe, evidence-backed knowledge in the correct Codex surface while keeping repository context optional, indexed, deduplicated, and explicitly approved.

Conversation history never becomes repository context automatically.

## Critical rules

1. Classify the candidate as `decision`, `constraint`, `operation`, `domain`, `pitfall`, `AGENTS.md rule`, `skill workflow`, or discard.
2. Save only knowledge that is reusable, non-obvious, stable, evidence-backed, safe, and costly to rediscover.
3. Use `$context-discovery` to find duplicates and conflicts before proposing a new entry.
4. Verify every repository-relative evidence path and reject secrets, personal data, transient output, unconfirmed hypotheses, and low-confidence claims.
5. Route always-on rules to `AGENTS.md`, executable invariants to code or tests, and reusable agent procedures to skills.
6. Show the exact destination, summary, evidence, metadata, and rendered Markdown before a write unless the user's direct request already makes that exact content and destination clear.
7. A primary-task implementation approval is not approval to persist learned context.
8. Update the context document and `.agents/context/index.json` together; preserve manual content and back up replacements.
9. Never claim `.agents/context/` loads automatically. `$context-discovery` must select entries explicitly.

## Candidate workflow

1. Read [the durability policy](references/durability-policy.md) and classify the candidate.
2. Run `$context-discovery` with the proposed title, scope, summary, and tags.
3. Compare semantics, not only filenames, and resolve duplicate or conflicting knowledge.
4. Verify evidence, confidence, sensitivity, stability, and a useful `reviewWhen` trigger for version-sensitive facts.
5. Build a proposal satisfying [the proposal contract](references/proposal-contract.md).
6. Complete and report the primary task independently, then present at most one grouped optional proposal.
7. After approval, write the proposal JSON to a temporary file and run `node scripts/context-save.mjs --root <repository> --proposal <file> --apply` from this skill directory. Add `--update` for an approved replacement.
8. Confirm the Markdown and index changed together, then run `npx --yes @codex-agent/cli@latest doctor` when available.

## Approval boundary

- Direct requests such as “remember this confirmed decision in project context” grant authority once exact content and destination are clear.
- A preview, discovery result, code-edit approval, or silence does not grant persistence authority.
- Rejection or silence leaves no repository state.
- `--update` and `--force` require the specific conflict or replacement to be reviewed.

## Storage decisions

- Store curated knowledge under `decisions/`, `constraints/`, `operations/`, `domain/`, or `pitfalls/`.
- Keep managed facts inside `codex-agent:context` markers and preserve surrounding manual Markdown.
- Include review triggers when a dependency, schema, platform, or operational owner can make the fact stale.
- Discard facts cheaply derived from manifests, source, or tests unless their interpretation is non-obvious and durable.

## Navigation-context migration

1. Read [the migration policy](references/migration-policy.md).
2. Preview with `node scripts/navigation-migrate.mjs --from <project-or-context-path> --root <repository>` from this skill directory, or `npx --yes @codex-agent/cli@latest migrate navigation --from <path> --json` from the target repository.
3. Review `changes`, `skipped`, `conflicts`, transformed references, provenance, and the index diff. Workflows, runtime instructions, templates, navigation pages, symlinks, and sensitive-looking content are skipped by default.
4. Apply only after review with `--apply`. Use include flags only for explicitly reviewed categories and `--force` only for approved conflicts.
5. Verify transformed Markdown, backups, native index entries, doctor output, and representative `$context-discovery` selection.

## Output contract

Return one disposition: `SAVE_AFTER_APPROVAL`, `UPDATE_AFTER_APPROVAL`, `ROUTE_TO_AGENTS`, `ROUTE_TO_SKILL`, or `DISCARD`, followed by rationale, destination, evidence, preview, conflicts, and next command when applicable.

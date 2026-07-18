---
name: context-curation
description: Evaluate, preview, and save durable project knowledge into the indexed .agents/context catalog with explicit user approval. Use when a task reveals a reusable architectural decision, constraint, operational procedure, domain concept, or recurring pitfall; when the user asks Codex to remember project knowledge; or when existing context needs an approved update.
---

# Context Curation

Preserve only durable, evidence-backed project knowledge. Never treat conversation history as repository context automatically.

## Workflow

1. Read [the durability policy](references/durability-policy.md) and classify the candidate as `decision`, `constraint`, `operation`, `domain`, `pitfall`, `AGENTS.md rule`, or discard.
2. Use `$context-discovery` with the candidate title and tags. Do not propose a duplicate or information that is already cheap to derive from code, tests, or manifests.
3. Verify every repository-relative evidence path. Reject secrets, personal data, temporary task state, unconfirmed hypotheses, and low-confidence claims.
4. Build a proposal that satisfies [the proposal contract](references/proposal-contract.md). For `.agents/context/`, show the exact title, category, destination, summary, evidence, and rendered Markdown preview.
5. Report the completed task independently from this optional proposal. Ask for explicit approval to save or update the context. Do not write a proposal file into the repository before approval.
6. After approval, place the proposal JSON in a temporary file and run `node scripts/context-save.mjs --root <repository> --proposal <file> --apply` from this skill directory. For an approved replacement, add `--update`.
7. Confirm that the Markdown file and `.agents/context/index.json` changed together, then run `codex-agent doctor --root <repository>` when available.

If the candidate is a rule that must apply to every task, propose an `AGENTS.md` edit instead. The context-save script intentionally writes only optional indexed context.

## Approval boundary

- A preview, discovery result, prior implementation approval, or general permission to edit code is not approval to persist learned context.
- A direct request such as “remember this in the project context” is sufficient approval once the exact destination and content are clear.
- Group related candidates into one concise request and present at most one context-curation prompt per task.
- Rejection or silence leaves no repository state.

## Storage rules

- Store curated documents under `decisions/`, `constraints/`, `operations/`, `domain/`, or `pitfalls/`.
- Keep facts and guidance inside `codex-agent:context` managed markers. Preserve manual Markdown outside them.
- Use `--update` only when the user approved replacing an existing managed entry. Updates create a backup.
- Rebuild metadata deterministically; never claim that `.agents/context/` loads automatically.

The deterministic writer is `scripts/context-save.mjs`.

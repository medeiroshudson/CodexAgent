# Durability policy

## Save

Save knowledge when it is reusable across future tasks, non-obvious, stable, evidence-backed, and safe to keep in the repository. Suitable categories are:

- `decision`: an accepted architectural or product decision and its rationale;
- `constraint`: an invariant, compatibility boundary, or security requirement;
- `operation`: a recurring setup, release, recovery, or diagnostic procedure;
- `domain`: vocabulary, business rules, or data semantics not obvious from code;
- `pitfall`: a confirmed recurring failure mode and its prevention.

## Route elsewhere

- Put instructions that must always apply in `AGENTS.md` after separate approval.
- Put executable invariants in code or tests when those are the authoritative expression.
- Put reusable procedures for Codex itself in a skill.
- Keep temporary state in the current task only.

## Discard

Do not save unverified hypotheses, one-off implementation details, test output, transient incidents, readily discoverable manifest facts, secrets, credentials, personal data, or version-sensitive external behavior without a version and review trigger.

Require at least medium confidence and one valid repository evidence path. A user-approved decision may use the applicable `AGENTS.md`, decision record, issue document, or implementation evidence.

## Prompt threshold

Prompt only when future rediscovery cost is material. Present at most one grouped proposal after completing the primary task. Do not delay or weaken the completion report when the user declines.

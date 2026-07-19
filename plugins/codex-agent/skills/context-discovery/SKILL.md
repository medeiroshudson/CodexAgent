---
name: context-discovery
description: Discover repository instructions, indexed context, architecture, source patterns, tests, commands, and constraints before repository work. Use for implementation, debugging, planning, or review in an unfamiliar area; do not use for generic questions without repository context.
---

# Context Discovery

## Outcome

Return the smallest verified context packet that lets the next workflow make repository-specific decisions without broad scanning or unsupported assumptions.

## Required inputs

- Repository root and working directory.
- Task outcome, target area, and concrete unknowns.
- Any supplied paths, errors, or comparison base.

## Critical rules

1. Read the applicable `AGENTS.override.md` or `AGENTS.md` chain before interpreting repository evidence.
2. Treat `.agents/context/index.json` as an explicit catalog; files under `.agents/context/` are not automatically loaded.
3. Verify every selected context and reference path exists and remains inside its allowed root.
4. Prefer focused search, nearby source, tests, and manifests over broad ingestion.
5. Distinguish declared rules, observed patterns, inference, and unknowns.
6. Surface conflicts and missing evidence rather than silently choosing a convenient answer.

## Workflow

1. Resolve the repository root, working directory, and task boundaries.
2. Read active instruction files in precedence order.
3. Search source, tests, configuration, and dependency metadata with focused request terms.
4. If `.agents/context/index.json` exists, run `node scripts/select-context.mjs --root <repo> --query "<task>"` from this skill directory.
5. Read every selected critical entry, then relevant high-priority entries. Read medium entries only to answer a concrete unresolved question.
6. Inspect one or two representative implementations and their nearest tests.
7. Record verified commands, versions, trust boundaries, and external contracts only when they affect the task.
8. Stop when instructions, reference patterns, validation, and material unknowns are established.

## Selection decisions

- Default to at most five high-signal context or reference files.
- Include more only when separate subsystems impose distinct constraints.
- Route version-sensitive external gaps to `$external-research`.
- If the index is missing or invalid, continue with instructions, source, tests, and manifests while reporting the defect.

Read [the discovery protocol](references/discovery-protocol.md) for precedence, index failures, and the canonical output packet.

## Output contract

Return:

- `Active instructions` — ordered paths and scope.
- `Selected context` — path, priority, and relevance.
- `Reference implementation` — source and tests with the pattern to reuse.
- `Commands and versions` — verified task-relevant facts.
- `Conflicts and unknowns` — gaps and recommended next action.

Do not paste entire files unless the user asks.

# Discovery Protocol

## Precedence

1. System, developer, and explicit user instructions.
2. Applicable `AGENTS.override.md` or `AGENTS.md`, with deeper files taking precedence in their subtree.
3. Project context selected from `.agents/context/index.json`.
4. Existing implementation and tests as evidence of current behavior.
5. External documentation for version-specific behavior.

## Index failures

- If the index is missing, continue with `AGENTS.md`, code, tests, and manifests.
- If an entry points outside `.agents/context/`, reject it.
- If an entry is missing, report it and continue with valid entries.
- If two entries conflict, prefer the more specific project rule and surface the conflict.

## Output contract

Return paths, short relevance reasons, and any conflict. Do not paste entire context files unless the user asks.


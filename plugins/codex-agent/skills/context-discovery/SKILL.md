---
name: context-discovery
description: Discover repository rules, architecture, security constraints, tests, and nearby implementation patterns before changing code. Use for implementation, debugging, review, or planning in an unfamiliar area; do not use for generic questions without repository context.
---

# Context Discovery

1. Resolve the repository root and working directory.
2. Read the applicable `AGENTS.md` instruction chain from root to the target directory.
3. Search nearby source, tests, configuration, and dependency manifests using focused terms from the request.
4. If `.agents/context/index.json` exists, run `node scripts/select-context.mjs --root <repo> --query "<task>"` from this skill directory.
5. Read every selected critical entry, then relevant high-priority entries. Read medium entries only when they answer a concrete question.
6. Return:
   - active instructions;
   - selected context paths and why each matters;
   - reference implementation and test files;
   - unresolved questions or conflicts.

Keep discovery bounded. Prefer five high-signal files over broad context ingestion. Never claim that `.agents/context/` loads automatically.

Read [references/discovery-protocol.md](references/discovery-protocol.md) when instruction layers conflict or the index is invalid.


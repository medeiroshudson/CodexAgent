# Discovery Protocol

## Precedence

1. System, developer, and explicit user instructions.
2. Applicable `AGENTS.override.md` or `AGENTS.md`, with deeper files taking precedence in their subtree.
3. Project context explicitly selected from `.agents/context/index.json`.
4. Existing implementation and tests as evidence of current behavior.
5. Local manifests, lockfiles, types, generated clients, and executable help.
6. External documentation for version-specific gaps.

Do not treat an observed implementation pattern as a declared rule. State whether evidence is declared, observed repeatedly, inferred, or unknown.

## Search loop

1. Convert the request into concrete terms: behavior, component, boundary, error, command, and dependency names.
2. Use targeted file and text search to identify candidate instructions, source, tests, and manifests.
3. Read the nearest representative source and test pair.
4. Select indexed context by task terms and priority.
5. Verify whether remaining unknowns change architecture, implementation, or validation.
6. Stop when further reading would be redundant.

Default to five high-signal context or reference files. A larger packet needs a reason tied to distinct subsystems or constraints.

## Index failures

- Missing index: continue with instructions, code, tests, and manifests.
- Invalid JSON or schema: report the defect and use only independently verified repository evidence.
- Escaping path: reject the entry.
- Missing target: report and skip it.
- Conflicting entries: prefer the more specific applicable rule and surface the conflict.
- Duplicate semantics: return the most specific or authoritative entry, not both.

## Output packet

- Active instructions in precedence order.
- Selected context with priority and decision relevance.
- Reference implementation and nearest tests.
- Verified commands, versions, and trust boundaries.
- Conflicts, unknowns, and the next workflow needed.

Never paste entire context files by default.

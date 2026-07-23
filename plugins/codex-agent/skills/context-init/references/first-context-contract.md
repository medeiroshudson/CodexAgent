# First context contract

## State matrix

Resolve context roots before analyzing or rendering files:

| State | Initialization behavior |
|---|---|
| Neither root exists | Preview a new canonical `.codex-agent/context` catalog. |
| Canonical only | Return `ALREADY_INITIALIZED` and route to `$context-refresh`. |
| Legacy only | Read it only as migration input; preview relocation and canonical initialization together. |
| Both byte-equivalent | Use canonical as the source of truth and preview archival of the legacy tree. |
| Both divergent | Return `MIGRATION_CONFLICT`; do not merge or write. |
| Invalid, escaping, or symlinked root | Fail closed and report the invalid path. |

The state check includes the catalog, every indexed path, managed-marker integrity, containment, file type, and symlink boundaries. Do not decide equivalence from filenames alone.

## Initialization boundary

Initialization creates the first canonical managed surfaces. It does not:

- refresh an existing canonical setup;
- import session or candidate content;
- promote durable knowledge;
- overwrite unmarked configuration;
- infer missing product or architecture decisions;
- remove `.agents/plugins`, `.agents/skills`, or unrelated legacy content.

When the canonical catalog exists but is empty or partially initialized, report the exact state. Do not silently reinterpret a damaged setup as a fresh repository.

## Questions

Ask only about material unknowns that repository evidence cannot resolve, such as an authoritative build command, a deliberate architecture boundary, or a required compatibility constraint. Do not run a fixed onboarding interview and do not make user-supplied answers override contradictory repository evidence silently.

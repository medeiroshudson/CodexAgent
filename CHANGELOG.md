# Changelog

## Unreleased

- Replaced `project-init` and the legacy `init --refresh` surface with explicit `$context-init`, `$context-refresh`, `context init`, and `context refresh` workflows.
- Moved versioned project knowledge from `.agents/context/` to `.codex-agent/context/` with canonical-first resolution, conflict blocking, safe migration, locks, backups, transactions, and rollback.
- Bound apply to the exact reviewed deterministic analysis and post-migration file plan, with an umbrella lifecycle journal that recovers interrupted catalog and managed-file phases together.
- Added opt-in resumable-session handoffs under ignored `.codex-agent/sessions/`, with sole-writer revisions, path and hash verification, and no public session CLI.
- Added `$context-harvest`, the read-only `context_harvester` role, and Markdown context candidates separated from approval-gated durable promotion.
- Removed deprecated plugin command-prompt files and kept skills as the portable interactive surface.
- Added the `agent-orchestration` skill for context-aware coordination from classification through integrated verification.
- Reworked every bundled agent and skill prompt with explicit authority, decision, failure, quality, handoff, and output contracts.
- Added architecture analyst, build verifier, and context harvester roles, bringing the canonical project profile set to nine agents.
- Added deterministic agent-prompt synchronization for project TOML templates and the self-contained CLI bundle.
- Expanded evaluation to 53 positive, negative, and overlap routing fixtures plus 22 focused skill and agent behavior contracts.
- Added a navigation-context migrator with root discovery, metadata conversion, filtering, preview, backups, and native index generation.
- Added the `context-curation` skill and approval-gated `context save` workflow.
- Added evidence validation, duplicate detection, secret screening, managed updates, backups, and coordinated context/index writes.
- Replaced generic template copying with evidence-backed repository analysis, preview, managed refresh, and conflict backups.

## 0.1.0 - 2026-07-18

- Add the initial `codex-agent` plugin and repository marketplace.
- Add eight development workflow skills and six focused agent roles.
- Add context indexing, project templates, lifecycle hooks, CLI diagnostics, schemas, tests, and evaluation fixtures.

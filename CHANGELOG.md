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
- Made materiality a falsifiable gate: the approval policy now defines when a change to a distributed surface, a cross-cutting rule, or a public contract requires a presented plan and explicit approval before the first write, even when the request arrives as an instruction.
- Carried the gate into always-on surfaces: repository and generated project guidance, the session-start and completion hooks, the orchestration rule, the implementation trigger, and new `Materiality` and `Authority` report fields.
- Added routing and behavior fixtures for the material plugin-surface change, materiality classification, and authority reporting.
- Added the `$humanizer` skill, which leads with the outcome, keeps every fact and evidence value, and removes staged openers, inflated significance, forced triads, dash pileups, decorative formatting, and chatbot residue.
- Applied the direct-answer policy to every canonical agent prompt, the orchestration contract and final report, the repository and generated project guidance, and the session and completion hooks, and changed orchestration to return one written answer instead of forwarded agent reports.
- Extended evaluation to 64 routing fixtures and 24 skill and agent behavior contracts.
- Replaced generic template copying with evidence-backed repository analysis, preview, managed refresh, and conflict backups.

## 0.1.0 - 2026-07-18

- Add the initial `codex-agent` plugin and repository marketplace.
- Add eight development workflow skills and six focused agent roles.
- Add context indexing, project templates, lifecycle hooks, CLI diagnostics, schemas, tests, and evaluation fixtures.

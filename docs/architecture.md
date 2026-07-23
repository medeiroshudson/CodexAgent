# Architecture

## Ownership

| Surface | Responsibility |
|---|---|
| `AGENTS.md` | Durable always-on repository instructions and verification commands |
| `.codex-agent/context/` | Versioned optional project knowledge selected explicitly per task |
| `.codex-agent/sessions/` | Ignored resumable handoffs and temporary candidates after explicit opt-in |
| `.agents/plugins/marketplace.json` | Repository marketplace declaration; it is not moved with context |
| `plugins/codex-agent/skills/` | Reusable workflows with progressive disclosure |
| `agent-orchestration` skill | Classification, opt-in session ownership, minimal handoffs, integration, and evidence |
| `context-init` / `context-refresh` | First setup and reconciliation workflows with separate state gates |
| `context-harvest` / `context-curation` | Temporary extraction and separately approved durable promotion |
| `plugins/codex-agent/agents/` | Canonical narrow role instructions and native profile metadata |
| `plugins/codex-agent/generated/agent-profiles.mjs` | Generated prompt definitions embedded in the self-contained CLI bundle |
| `.codex/agents/` templates | Generated project-specific sandbox and subagent configuration |
| `scripts/sync-agent-profiles.mjs` | Canonical-agent parser, module renderer, and TOML synchronizer |
| `plugins/codex-agent/scripts/lib/` | Safe paths, catalog resolution, locks, transactions, hashes, and migration |
| `plugins/codex-agent/scripts/session-store.mjs` | Internal sole-writer resumable-session state with manifest revisions |
| `plugins/codex-agent/scripts/context-candidate.mjs` | Temporary candidate Markdown parser, validator, and proposal adapter |
| `context-curation/scripts/context-save.mjs` | Deterministic context validation, storage, backup, and index coordination |
| `context-curation/scripts/navigation-migrate.mjs` | Navigation-tree filtering, transformation, and indexed migration |
| `packages/codex-agent-cli/` | Thin deterministic CLI for context lifecycle, diagnosis, migration, storage, and indexing |
| `evals/` | Routing and behavioral contracts; no E2E or A/B prompt comparison |

The plugin does not distribute `commands/*.md`. Skills are the portable interactive surface across the Codex app, CLI, and IDE extension.

## Execution flow

1. Classify the request, authority, persistence intent, and completion criteria.
2. Read active repository guidance and select task-specific indexed context.
3. Analyze architecture only when boundaries or contracts materially change.
4. Plan only when scope has not already been approved.
5. Break complex work into dependency-aware packets and delegate minimal context.
6. Implement incrementally with serialized overlapping writes.
7. When explicitly resumable, update the Markdown handoff through the parent orchestrator only.
8. Integrate, review engineering risk, verify the final workspace, and report fresh evidence.
9. Optionally harvest durable candidates after the primary outcome; promotion remains a separate approval boundary.

## Context root contract

The shared resolver classifies the repository as `none`, `legacy-only`, `canonical-only`, `both-identical`, `both-divergent`, or `invalid`.

- Reads prefer `.codex-agent/context` and use `.agents/context` only as a warned, read-only legacy fallback.
- Divergent or invalid catalogs block reads and writes.
- Ordinary writers accept only `none` or `canonical-only`.
- Migration previews before writing, rejects symlinks, stages under `.codex-agent/.transactions/`, verifies hashes, backs up the legacy tree, promotes atomically, and removes only `.agents/context`.
- `.agents/plugins/marketplace.json` and `.agents/skills/` remain intact.

Context and managed-project changes acquire a global lock, stage all files, persist hash-verified recovery manifests, and promote the index last. Legacy initialization also keeps an umbrella lifecycle journal across catalog migration and managed writes. Ordinary failures restore prior files. After interruption, a new writer reclaims a lock only when its owner is provably local and dead, recovers the child transaction first, then commits a fully promoted lifecycle forward or restores the original catalog state. Backups, locks, transactions, analysis, and sessions are ignored; `.codex-agent/context/` remains versionable.

## Project context lifecycle

Initialization is optional and uses two explicit workflows:

```text
$context-init
  -> resolve and, when needed, preview the legacy-root migration
  -> $context-discovery
  -> project analysis (detected, inferred, unknown)
  -> deterministic validation and rendering
  -> preview and diff
  -> --apply

$context-refresh
  -> require an initialized canonical catalog
  -> re-run discovery and analysis
  -> reconcile managed surfaces
  -> preview, backup, transaction, validation
  -> --apply
```

The intermediate `.codex-agent/analysis.json` records evidence and confidence but is an ignored, rebuildable cache rather than lifecycle authority. A valid canonical catalog establishes initialized state across clean clones. Markdown and TOML use managed markers so refresh preserves manual content. Existing unmarked TOML is a conflict; explicitly forced replacement creates a backup. Agent Markdown remains the single prompt source, and synchronization generates both project TOML and the module embedded in the public `npx` package.

## Resumable-session state

Session persistence is internal to `$agent-orchestration`; there is no slash command, CLI subcommand, `--session`, or `--resume` option.

```text
.codex-agent/sessions/<id>/
├── manifest.json
├── handoff.md
└── candidates/<id>.md
```

The manifest holds identity, revision, status, Git snapshot, paths, and hashes. Narrative state remains in a bounded `handoff.md`: objective, scope, phase, verified decisions, selected context, artifacts, validation, blockers, next action, and exit criteria. Compare-and-swap revisions reject stale writes; a per-session lock prevents concurrent writers, and a journal rolls interrupted multi-file updates back before the next write. Resumption verifies the branch, HEAD, worktree content fingerprint, selected-context hashes, artifact hashes, and candidate hashes before work continues.

Sessions are ephemeral unless the user explicitly requests resumability. The store rejects secrets and symlink escapes and never records transcripts, full prompts, or raw logs. Hooks may remind an agent about the contract but never create, resume, mutate, harvest, or promote state.

## Durable context promotion

Context persistence uses two separate gates:

```text
explicitly selected session handoff
  -> $context-harvest
  -> read-only context_harvester
  -> temporary candidate Markdown
  -> candidate selection
  -> $context-curation
  -> evidence, sensitivity, duplicate, and conflict checks
  -> exact destination and Markdown preview
  -> explicit approval
  -> locked transactional document + index write
```

Harvest does not scan arbitrary workspace Markdown, clean sessions, or write the durable catalog. Curated entries remain optional and are loaded only when `$context-discovery` selects them.

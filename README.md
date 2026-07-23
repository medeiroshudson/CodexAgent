# Codex Agent

`codex-agent` is a native Codex plugin for context-aware software development. It packages coordinated and focused workflows for agent orchestration, planning, repository context discovery and curation, task decomposition, implementation, testing, external research, code review, and completion verification.

The plugin uses Codex-native boundaries:

- `AGENTS.md` for durable repository guidance.
- Skills for reusable workflows with progressive disclosure.
- Focused agents for bounded delegated work.
- `.codex/agents/*.toml` templates for project-specific sandbox and role configuration.
- Hooks for optional deterministic lifecycle reminders.
- `.codex-agent/context/` for versioned, explicitly selected team knowledge.
- `.codex-agent/sessions/` for ignored resumable handoffs created only after explicit opt-in.
- A repository marketplace for installation and distribution.

## Install

Add the GitHub repository as a marketplace source, then install the plugin:

```bash
codex plugin marketplace add medeiroshudson/CodexAgent
codex plugin add codex-agent@codex-agent-marketplace
```

Without `--ref`, Codex resolves the repository's default branch, currently
`main`.

Refresh the repository snapshot after new commits reach `main`:

```bash
codex plugin marketplace upgrade codex-agent-marketplace
codex plugin add codex-agent@codex-agent-marketplace
```

For local development, replace the GitHub source with the absolute path to this
repository.

Verify discovery:

```bash
codex plugin list --available --json
```

Start a new Codex task after installation so the plugin surfaces are loaded cleanly.

## Initialize project context

In a new Codex task opened at the target repository, ask Codex to “use `$context-init` to initialize context for this repository.” The skill performs read-only context discovery, presents the evidence-backed preview, and applies only with matching authority.

For direct CLI use, open a terminal in the target repository and run the published package with `npx`. Analyze the repository and preview the proposed files first (this never writes):

```bash
npx --yes @codex-agent/cli@latest context init --json
```

After reviewing the evidence, confidence, unknowns, and diff, apply the generated setup:

```bash
npx --yes @codex-agent/cli@latest context init --apply --plan-hash <reviewed-plan-hash>
```

The initializer discovers the actual package manager, repository commands, languages, frameworks, modules, entrypoints, test setup, CI/CD, security-sensitive paths, and repeated conventions. Every fact in `.codex-agent/analysis.json` carries repository evidence, confidence, and a `detected`, `inferred`, or `unknown` status. Unknown facts are not rendered as placeholders. This ignored analysis file is a rebuildable cache; the valid canonical catalog is the durable initialization signal, so a clean clone can run `context refresh` without the cache.

Manual Markdown outside `codex-agent:managed` markers and custom context-index entries are preserved. Existing TOML without managed markers is reported as a conflict because blind merging could create duplicate keys. Review such files before using `--force`; forced replacements are backed up under `.codex-agent/backups/`.

Refresh an existing managed setup after commands or architecture change:

```bash
npx --yes @codex-agent/cli@latest context refresh --json
npx --yes @codex-agent/cli@latest context refresh --apply --plan-hash <reviewed-plan-hash>
```

Initialization is optional. Installing the plugin makes its skills available in a new Codex task even when the project has not been initialized. The generated files improve automatic repository guidance and add project agent profiles; they are not a prerequisite for skill routing.

The generated project structure includes:

```text
AGENTS.md
.codex-agent/context/
.codex/config.toml
.codex/agents/
```

`$context-init` owns the first setup. `$context-refresh` reconciles an already initialized setup after repository facts change. Both run `$context-discovery` before the deterministic analyzer; scripts remain responsible for validation, rendering, managed merge, backups, transaction, preview, and apply.

Apply requires the exact `planHash` from a fresh preview. When initialization migrates `.agents/context`, one umbrella lifecycle journal spans the catalog move and managed-file transaction so a dead local writer can be recovered without accepting a different plan or leaving a half-initialized canonical catalog.

## Workflows

Invoke skills explicitly with `$` or use natural requests that match their descriptions:

- `$agent-orchestration`
- `$plan-and-approve`
- `$context-discovery`
- `$task-breakdown`
- `$implementation`
- `$test-generation`
- `$code-review`
- `$external-research`
- `$verification-before-completion`
- `$context-init`
- `$context-refresh`
- `$context-harvest`
- `$context-curation`

The plugin does not distribute slash-command prompt files. Invoke skills explicitly or describe the intended workflow in natural language. The npm CLI is only the deterministic terminal surface.

## Context model

Files under `.codex-agent/context/` are not automatically injected into every task. The context index describes optional knowledge, and `$context-discovery` selects only the files relevant to the current request. Readers may identify a legacy `.agents/context/` catalog for migration, but writers use only the canonical root and block divergent catalogs.

When a completed task reveals a non-obvious and reusable decision, constraint, operation, domain concept, or recurring pitfall, `$context-curation` may offer one optional proposal. It reports the task outcome independently and never saves learned context without explicit approval.

Curated knowledge is stored separately from initializer-managed files:

```text
.codex-agent/context/
├── decisions/
├── constraints/
├── operations/
├── domain/
└── pitfalls/
```

For terminal or automation use, provide a proposal JSON and preview it first:

```bash
npx --yes @codex-agent/cli@latest context save --proposal context-proposal.json --json
```

After reviewing the destination, evidence, Markdown diff, and conflicts, apply it explicitly:

```bash
npx --yes @codex-agent/cli@latest context save --proposal context-proposal.json --apply --json
```

Updating an existing entry additionally requires `--update` and creates backups under `.codex-agent/backups/`. Rejected proposals leave no repository state. Rules that must apply to every task belong in `AGENTS.md`, not optional context.

Rebuild the index after adding context:

```bash
npx --yes @codex-agent/cli@latest context index
```

Import Markdown context from another local knowledge directory without translating its runtime-specific agents or commands:

```bash
npx --yes @codex-agent/cli@latest migrate \
  --from /path/to/legacy-context \
  --dry-run
```

Remove `--dry-run` after reviewing the paths. Existing conflicts are preserved unless `--force` is supplied, in which case backups are created first.

### Migrate navigation-based context

The bundled navigation migrator accepts either an older project root or its context directory, recognizes `.oac.json`, `.claude/context`, `context`, and `.opencode/context`, converts compatible source metadata into native index entries, and previews without writing.

When the matching CLI release is installed, the equivalent terminal command is:

```bash
npx --yes @codex-agent/cli@latest migrate navigation \
  --from /path/to/old-project \
  --json
```

Review `changes`, `skipped`, `conflicts`, manifest provenance, and the index diff. Navigation pages, deprecated documents, placeholder-heavy templates, source-runtime procedures, and possible secrets are skipped by default. Apply after review:

```bash
npx --yes @codex-agent/cli@latest migrate navigation \
  --from /path/to/old-project \
  --apply \
  --json
```

Migrated documents are isolated under `.codex-agent/context/migrated/`; existing native context remains intact. Use `--include-templates`, `--include-workflows`, or `--include-navigation` only when those skipped classes were reviewed. Conflicting replacements require `--force` and create backups.

## Resumable sessions

Tasks are ephemeral by default. Explicit natural-language intent such as “keep this task resumable” allows `$agent-orchestration` to create `.codex-agent/sessions/<id>/manifest.json` and `handoff.md`. Complexity, delegation, or a long task never activates persistence by itself.

The parent orchestrator is the sole session writer. It stores a compact objective, scope, phase, verified decisions, selected context paths, artifact hashes, validation, blockers, and next action. It never stores transcripts, full prompts, raw logs, or secrets. Subagents receive bounded handoffs and return deltas through Codex coordination rather than editing the session.

After meaningful work, `$context-harvest` can extract temporary Markdown candidates from an explicitly selected session. The read-only `context_harvester` filters transient state and checks evidence; `$context-curation` still performs deduplication, exact preview, approval, and the transactional write. Harvest never promotes or deletes automatically, and no session command or CLI option exists.

## Agents and concurrency

The plugin provides nine focused roles: context scout, context harvester, documentation researcher, architecture analyst, task planner, implementer, test engineer, code reviewer, and build verifier.

Canonical agent instructions live once under `plugins/codex-agent/agents/`. `npm run agents:sync` deterministically generates the embedded CLI module and project TOML templates; `npm run agents:check` prevents prompt drift. The self-contained CLI bundle embeds those definitions, so project initialization through `npx` does not depend on the source workspace.

Project templates default to four concurrent threads and a maximum depth of one. Read-heavy work can run in parallel; overlapping writes should remain serialized or use isolated worktrees.

Models are intentionally not fixed. Project agents inherit the parent Codex model unless the project explicitly configures an override.

## Hooks

The plugin bundles `SessionStart`, `PostToolUse`, and `Stop` reminders. Codex requires users to review and trust non-managed plugin hooks before they run. Inspect them with `/hooks`.

Hooks reinforce workflow discipline but are not a security boundary. They never create or resume sessions, harvest candidates, or promote context. Use Codex sandbox, permission mode, and approval policy for actual access control.

## Diagnose and validate

```bash
npx --yes @codex-agent/cli@latest doctor --json
npx --yes @codex-agent/cli@latest eval --json
npm test
npm run agents:check
npm run validate
npm run eval
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for plugin and skill validation commands
and [docs/releasing-cli.md](docs/releasing-cli.md) for the npm release process.

## Architecture

See [docs/architecture.md](docs/architecture.md) for component ownership and [docs/migration.md](docs/migration.md) for adapting an existing agent workflow without importing unsupported runtime assumptions.

## Inspiration and attribution

This project was designed with [OpenAgentsControl](https://github.com/darrenhinde/OpenAgentsControl) as its base architectural reference, particularly its context-aware workflows, specialized roles, planning gates, and validation stages. The implementation in this repository is original and targets Codex-native plugin, skill, agent, hook, configuration, and marketplace surfaces.

## License

MIT. See [LICENSE](LICENSE).

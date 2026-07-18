# Codex Agent

`codex-agent` is a native Codex plugin for context-aware software development. It packages focused workflows for planning, repository context discovery, task decomposition, implementation, testing, external research, code review, and completion verification.

The plugin uses Codex-native boundaries:

- `AGENTS.md` for durable repository guidance.
- Skills for reusable workflows with progressive disclosure.
- Focused agents for bounded delegated work.
- `.codex/agents/*.toml` templates for project-specific sandbox and role configuration.
- Hooks for optional deterministic lifecycle reminders.
- `.agents/context/` for explicitly selected team knowledge.
- A repository marketplace for installation and distribution.

## Install

Add this repository as a marketplace source, then install the plugin:

```bash
codex plugin marketplace add /absolute/path/to/codex-agent
codex plugin add codex-agent@codex-agent-marketplace
```

Verify discovery:

```bash
codex plugin list --available --json
```

Start a new Codex task after installation so the plugin surfaces are loaded cleanly.

## Initialize a project

In a new Codex task opened at the target repository, run `/init` or ask Codex to “use `$project-init` to initialize this repository.” The skill performs read-only context discovery, presents the evidence-backed preview, and requests approval before applying it.

For direct CLI use from this source checkout, analyze the repository and preview the proposed files first (this never writes):

```bash
node packages/codex-agent-cli/bin/codex-agent.mjs init --root /path/to/project --json
```

After reviewing the evidence, confidence, unknowns, and diff, apply the generated setup:

```bash
node packages/codex-agent-cli/bin/codex-agent.mjs init --root /path/to/project --apply
```

The initializer discovers the actual package manager, repository commands, languages, frameworks, modules, entrypoints, test setup, CI/CD, security-sensitive paths, and repeated conventions. Every fact in `.codex-agent/analysis.json` carries repository evidence, confidence, and a `detected`, `inferred`, or `unknown` status. Unknown facts are not rendered as placeholders.

Manual Markdown outside `codex-agent:managed` markers and custom context-index entries are preserved. Existing TOML without managed markers is reported as a conflict because blind merging could create duplicate keys. Review such files before using `--force`; forced replacements are backed up under `.codex-agent/backups/`.

Refresh an existing managed setup after commands or architecture change:

```bash
node packages/codex-agent-cli/bin/codex-agent.mjs init --root /path/to/project --refresh
```

Initialization is optional. Installing the plugin makes its skills available in a new Codex task even when the project has not been initialized. The generated files improve automatic repository guidance and add project agent profiles; they are not a prerequisite for skill routing.

The generated project structure includes:

```text
AGENTS.md
.agents/context/
.codex/config.toml
.codex/agents/
```

The `$project-init` workflow runs `$context-discovery` before the deterministic analyzer so Codex can review existing guidance and supplement the intermediate analysis with evidence-backed facts. The script remains responsible for validation, rendering, merge, backups, preview, and apply.

## Workflows

Invoke skills explicitly with `$` or use natural requests that match their descriptions:

- `$plan-and-approve`
- `$context-discovery`
- `$task-breakdown`
- `$implementation`
- `$test-generation`
- `$code-review`
- `$external-research`
- `$verification-before-completion`
- `$project-init`

Commands provide short entrypoints: `/init`, `/plan`, `/context`, `/review`, `/test`, and `/doctor`.

## Context model

Files under `.agents/context/` are not automatically injected into every task. The context index describes optional knowledge, and `$context-discovery` selects only the files relevant to the current request.

Rebuild the index after adding context:

```bash
node packages/codex-agent-cli/bin/codex-agent.mjs context index --root /path/to/project
```

Import Markdown context from another local knowledge directory without translating its runtime-specific agents or commands:

```bash
node packages/codex-agent-cli/bin/codex-agent.mjs migrate \
  --from /path/to/legacy-context \
  --root /path/to/project \
  --dry-run
```

Remove `--dry-run` after reviewing the paths. Existing conflicts are preserved unless `--force` is supplied, in which case backups are created first.

## Agents and concurrency

The plugin provides six focused roles: context scout, task planner, implementer, test engineer, code reviewer, and documentation researcher.

Project templates default to four concurrent threads and a maximum depth of one. Read-heavy work can run in parallel; overlapping writes should remain serialized or use isolated worktrees.

Models are intentionally not fixed. Project agents inherit the parent Codex model unless the project explicitly configures an override.

## Hooks

The plugin bundles `SessionStart`, `PostToolUse`, and `Stop` reminders. Codex requires users to review and trust non-managed plugin hooks before they run. Inspect them with `/hooks`.

Hooks reinforce workflow discipline but are not a security boundary. Use Codex sandbox, permission mode, and approval policy for actual access control.

## Diagnose and validate

```bash
node packages/codex-agent-cli/bin/codex-agent.mjs doctor --root . --json
node packages/codex-agent-cli/bin/codex-agent.mjs eval --root . --json
npm test
npm run validate
npm run eval
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for plugin and skill validation commands.

## Architecture

See [docs/architecture.md](docs/architecture.md) for component ownership and [docs/migration.md](docs/migration.md) for adapting an existing agent workflow without importing unsupported runtime assumptions.

## Inspiration and attribution

This project was designed with [OpenAgentsControl](https://github.com/darrenhinde/OpenAgentsControl) as its base architectural reference, particularly its context-aware workflows, specialized roles, planning gates, and validation stages. The implementation in this repository is original and targets Codex-native plugin, skill, agent, hook, configuration, and marketplace surfaces.

## License

MIT. See [LICENSE](LICENSE).

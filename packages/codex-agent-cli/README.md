# @codex-agent/cli

Command-line diagnostics and project bootstrap helpers for the [codex-agent](https://github.com/medeiroshudson/CodexAgent) plugin.

Run the latest published version without a global installation:

```bash
npx --yes @codex-agent/cli@latest context init --json
npx --yes @codex-agent/cli@latest context refresh --json
npx --yes @codex-agent/cli@latest doctor --json
npx --yes @codex-agent/cli@latest context save --proposal context-proposal.json --json
npx --yes @codex-agent/cli@latest context lint --json
npx --yes @codex-agent/cli@latest migrate navigation --from /path/to/project --json
npx --yes @codex-agent/cli@latest eval --json
```

Run these commands from the target repository. Use `npx @codex-agent/cli@latest help` to list every command. Context initialization and refresh show a human-readable approval plan by default, including repository evidence, file actions, preserved surfaces, conflicts, and safeguards. The plan's integrity ID protects against drift; when working through Codex, approve the displayed plan in natural language and Codex retains the ID internally. Direct automation can still pass `--apply --plan-hash <reviewed-plan-hash>`. Context saving uses `--apply`, and existing curated-context updates also require `--update`.

Project analysis uses one ecosystem-neutral pipeline: inventory, declared solution/workspace membership, detector registry, ownership and path roles, fact aggregation, and rendering. Its v2 result reports plural `toolchains`, `technologies`, and `units`; no package manager or language is treated as the repository-wide default. Declared units override ignore and transient-name heuristics, while the `scan` signal makes exclusions and truncation explicit.

When repository ownership requires an optional managed surface to remain untouched, repeat `--exclude-managed` in both preview and apply. The supported paths are `.codex/config.toml` and `.gitignore`; exclusions are validated and included in the `planHash`.

```bash
npx --yes @codex-agent/cli@latest context init \
  --exclude-managed .codex/config.toml \
  --exclude-managed .gitignore \
  --json
```

`migrate navigation` discovers navigation-based Markdown context trees, skips incompatible runtime material by default, and writes native indexed context only with `--apply`.

`context lint` is read-only and checks catalog lifecycle, provenance hashes, review dates, duplicates, and orphan documents; `--strict` makes warnings fail. `eval` validates focused positive, negative, and overlap skill-routing fixtures plus required and forbidden behavior contracts for every bundled skill and canonical agent. The source workspace additionally provides opt-in model execution through `npm run eval:model`; it is not part of the published CLI or offline gate.

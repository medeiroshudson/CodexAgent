# @codex-agent/cli

Command-line diagnostics and project bootstrap helpers for the [codex-agent](https://github.com/medeiroshudson/CodexAgent) plugin.

Run the latest published version without a global installation:

```bash
npx --yes @codex-agent/cli@latest init --json
npx --yes @codex-agent/cli@latest doctor --json
npx --yes @codex-agent/cli@latest context save --proposal context-proposal.json --json
npx --yes @codex-agent/cli@latest migrate navigation --from /path/to/project --json
```

Run these commands from the target repository. Use `npx @codex-agent/cli@latest help` to list every command. Initialization and context saving preview changes by default; pass `--apply` only after reviewing the result. Existing context updates also require `--update`.

`migrate navigation` discovers navigation-based Markdown context trees, skips incompatible runtime material by default, and writes native indexed context only with `--apply`.

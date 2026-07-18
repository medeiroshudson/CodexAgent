# @codex-agent/cli

Command-line diagnostics and project bootstrap helpers for the [codex-agent](https://github.com/medeiroshudson/CodexAgent) plugin.

Run the latest published version without a global installation:

```bash
npx --yes @codex-agent/cli@latest init --json
npx --yes @codex-agent/cli@latest doctor --json
```

Run these commands from the target repository. Use `npx @codex-agent/cli@latest help` to list every command. Initialization previews changes by default; pass `--apply` only after reviewing the result.

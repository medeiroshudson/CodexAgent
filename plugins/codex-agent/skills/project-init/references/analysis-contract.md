# Project analysis contract

The initializer creates an intermediate `.codex-agent/analysis.json`. Every project fact is a signal with this shape:

```json
{
  "value": "pnpm",
  "evidence": ["pnpm-lock.yaml", "package.json#packageManager"],
  "confidence": "high",
  "status": "detected"
}
```

Allowed statuses are `detected`, `inferred`, and `unknown`. Allowed confidence values are `high`, `medium`, `low`, and `unknown`.

- `detected` means a manifest, lockfile, configuration, directory, or source file directly establishes the value.
- `inferred` means several observations support the value but the repository does not declare it directly.
- `unknown` means evidence is insufficient. Renderers omit the fact instead of inserting a placeholder.
- Every detected or inferred signal requires one or more repository-relative evidence references.
- A global convention requires repeated evidence. One filename does not establish a naming convention.
- Supplied analysis must target the same repository root. Evidence paths are checked against the working tree before rendering; missing, absolute, or escaping paths are rejected.

The JSON Schema is distributed in the source repository as `schemas/project-analysis.schema.json`. The deterministic validator also runs before preview or apply, including when `--analysis` supplies model-assisted results.

## Agent profiles

Native `.codex/agents/*.toml` profiles are generated from the plugin's canonical Markdown prompts. Project analysis may determine whether project profiles are useful, but it must not rewrite their role contract, hard-code a model, or create divergent prompt copies. The public CLI bundle embeds the generated definitions so `npx --yes @codex-agent/cli@latest init` works outside the source workspace.

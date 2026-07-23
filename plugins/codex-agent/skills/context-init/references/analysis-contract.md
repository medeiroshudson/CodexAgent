# Project analysis contract

The context initializer records its intermediate analysis in `.codex-agent/analysis.json`. Every project fact is a signal:

```json
{
  "value": "npm",
  "evidence": ["package-lock.json", "package.json#scripts.test"],
  "confidence": "high",
  "status": "detected"
}
```

Allowed statuses are `detected`, `inferred`, and `unknown`. Allowed confidence values are `high`, `medium`, `low`, and `unknown`.

- `detected` means a manifest, lockfile, configuration, directory, source file, or executable help directly establishes the value.
- `inferred` means multiple independent observations support the value but the repository does not declare it directly.
- `unknown` means evidence is insufficient. Renderers omit the fact instead of inserting a placeholder.
- Every detected or inferred signal requires repository-relative evidence.
- A global convention requires repeated evidence; one filename or example does not establish a repository-wide rule.
- Evidence must resolve inside the repository and exist at validation and apply time. Reject absolute, missing, escaping, or symlink-mediated paths.
- Session handoffs, candidates, transcripts, prompts, raw logs, and generated summaries are not initialization evidence.

Model-assisted analysis may supplement deterministic discovery, but it must satisfy the same schema, root binding, evidence, and confidence checks. It cannot override a detected fact without exposing the conflict.

## Agent profiles

Native `.codex/agents/*.toml` profiles are generated from canonical Markdown under `plugins/codex-agent/agents/`. Analysis may determine whether project profiles are useful, but it must not rewrite their role contract, hard-code a model, or create divergent prompt copies. The packaged CLI embeds the synchronized definitions used by `context init`.

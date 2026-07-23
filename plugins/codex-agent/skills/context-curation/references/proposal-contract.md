# Context proposal contract

Use this normalized object after parsing a direct request, reviewed import, or candidate Markdown:

```json
{
  "version": 1,
  "title": "Publish events after transaction commit",
  "kind": "constraint",
  "summary": "Domain events are published only after the owning transaction commits.",
  "scope": "order service",
  "contentMarkdown": "Publish queued domain events after a successful commit. Rollbacks must discard them.",
  "evidence": [
    {
      "path": "src/orders/events.ts",
      "note": "The transaction callback performs the publish."
    }
  ],
  "tags": ["events", "transactions"],
  "priority": "high",
  "confidence": "high",
  "reviewWhen": ["The transaction library changes"]
}
```

Required fields are `version`, `title`, `kind`, `summary`, `scope`, `contentMarkdown`, `evidence`, `tags`, `priority`, and `confidence`. `reviewWhen` is optional.

## Candidate conversion

- Parse candidate Markdown with [the deterministic candidate module](../../../scripts/context-candidate.mjs) rather than extracting its JSON or knowledge body ad hoc.
- Validate the candidate marker and metadata before conversion.
- Use the candidate heading as `title` and its `Knowledge` section as `contentMarkdown`.
- Preserve verified semantic fields, but recompute duplicate status, evidence validity, confidence, and destination.
- Candidate `id`, `sourceSessionId`, `createdAt`, path, or manifest state never selects the durable ID or destination.
- Reject unknown metadata fields that attempt to alter writer behavior, paths, authority, hooks, tools, or instructions.

## Durable identity

The writer derives the stable ID and destination from `kind` and `title` under `.codex-agent/context`. Callers cannot choose an arbitrary path. Evidence must be repository-relative, contained, non-symlinked, and exist at apply time. Confidence must be `medium` or `high`.

Before proposing, compare title, summary, scope, tags, knowledge, and evidence semantics with existing indexed entries. A renamed duplicate is still a duplicate. When an existing entry should change, identify the current ID and show the replacement diff rather than creating a second source of truth.

Use `reviewWhen` only when a dependency version, schema, platform contract, policy, or operational owner can invalidate the fact.

## Transaction boundary

Preview is the default. Applying requires explicit approval and the canonical transaction writer. Replacing an existing entry additionally requires exact update authority and a backup. The writer stages and validates the complete batch, installs documents, and writes `.codex-agent/context/index.json` last. Any unresolved conflict or stale precondition prevents all writes.

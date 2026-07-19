# Context proposal contract

Use a JSON object with this shape:

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

The writer derives the ID and destination from `kind` and `title`; callers cannot select an arbitrary path. Evidence must be repository-relative and exist at apply time. Confidence must be `medium` or `high`.

Before proposing, compare title, summary, scope, tags, and content semantics with existing indexed entries. A renamed duplicate is still a duplicate. When an existing entry should change, identify the current ID and present the replacement diff rather than creating a new entry.

Use `reviewWhen` for facts whose validity depends on a version, schema, integration, policy, or operational owner. Do not use it as a generic reminder.

Preview is the default. Applying requires `--apply`. Replacing an existing entry additionally requires `--update`, creates a backup, and preserves manual Markdown outside the managed region.

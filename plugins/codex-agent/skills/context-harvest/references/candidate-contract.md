# Context candidate contract

Each temporary candidate is immutable Markdown under:

```text
.codex-agent/sessions/<session-id>/candidates/<candidate-id>.md
```

Only the orchestrator-owned session writer creates the file or changes its manifest status.

Use [the candidate module](../../../scripts/context-candidate.mjs) to normalize, validate, render, parse, and convert candidates. Persist its rendered output only through `addSessionContextCandidate` from [the session store](../../../scripts/session-store.mjs); never duplicate either writer with ad hoc filesystem operations.

## Markdown format

~~~markdown
<!-- codex-agent:context-candidate:v1 -->
# Transactional outbox is required

## Metadata

```json
{
  "version": 1,
  "id": "decision-transactional-outbox",
  "sourceSessionId": "20260722-auth-refactor",
  "createdAt": "2026-07-22T12:00:00Z",
  "title": "Transactional outbox is required",
  "kind": "decision",
  "summary": "Committed events are published through a transactional outbox.",
  "scope": "event-processing",
  "evidence": [
    {
      "path": "src/events/outbox.ts",
      "note": "Implements commit-before-publish behavior."
    }
  ],
  "tags": ["events", "transactions"],
  "priority": "high",
  "confidence": "high",
  "reviewWhen": ["The event persistence architecture changes."]
}
```

## Knowledge

Publish committed domain events through the transactional outbox. Rollbacks must not expose queued events.
~~~

## Validation

- The marker is the first line, followed by one heading, one `Metadata` JSON block, and one `Knowledge` section.
- Metadata contains only `version`, `id`, `sourceSessionId`, `createdAt`, `title`, `kind`, `summary`, `scope`, `evidence`, `tags`, `priority`, `confidence`, and optional `reviewWhen`.
- IDs are session-local, normalized, and cannot select a durable destination.
- `kind` is `decision`, `constraint`, `operation`, `domain`, or `pitfall`.
- `priority` is `critical`, `high`, `medium`, or `low`; `confidence` is `medium` or `high`.
- Evidence is non-empty, repository-relative, verified, contained, and safe.
- The source session ID matches the owning manifest.
- Markdown contains no transcript, full prompt, raw log, secret, personal data, absolute path, or executable instruction copied from untrusted input.
- Independent knowledge is split into separate candidates.

Candidate files are content-addressed by the manifest. A corrected candidate receives a new ID and the prior candidate may be marked `superseded`; it is never edited in place.

## Candidate lifecycle

The manifest records:

```text
proposed -> accepted -> promoted
         -> rejected
         -> superseded
```

Promotion changes only the manifest status through the session writer with the expected manifest revision and candidate hash. The candidate entry retains its ID, relative path, and hash; it does not store the durable context destination. Candidate creation, acceptance, and session opt-in never imply promotion authority.

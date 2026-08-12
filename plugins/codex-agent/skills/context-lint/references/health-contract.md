# Context health contract

The index persists lifecycle (`active`, `conflicted`, or `superseded`) plus dates, relationships, and provenance. Lint derives current health without mutating that source.

Health precedence is `conflict`, `orphan`, `duplicate`, `insufficient-evidence`, `review-due`, then `healthy`. A changed repository-evidence digest is a conflict because the indexed claim has not been reverified. Missing, derived-only, escaping, symlinked, or non-file evidence is insufficient. A due `reviewAfter` date is advisory unless strict mode promotes warnings to a failing result.

Catalog v1 remains readable, but its entries are reported with insufficient machine-verifiable evidence. Writers promote reviewed catalogs to v2 transactionally. External URLs are never fetched by lint, which avoids SSRF, prompt injection, ambient credentials, and nondeterministic network state.

Exact duplicate summaries or document content are review signals. Explicit supersession prevents intentional replacements from being treated as duplicates. Semantic contradiction detection requires separate read-only review and must not be represented as a deterministic lint result.

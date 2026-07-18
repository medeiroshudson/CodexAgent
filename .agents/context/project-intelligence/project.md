# Project Intelligence

## Stack

- Runtime: Node.js 20 or newer.
- Packaging: native Codex plugin and repository marketplace.
- Tests: Node.js built-in test runner.

## Decisions

- The product and plugin identifier is `codex-agent`.
- Shared optional context lives under `.agents/context/`.
- Marketplace installation is the default distribution path.
- The CLI is supplemental and must not replace native plugin installation.
- Model selection inherits from the parent Codex session by default.


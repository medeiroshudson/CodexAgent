# Project Intelligence

## Stack

- Runtime: Node.js 20 or newer.
- Packaging: native Codex plugin and repository marketplace.
- Tests: Node.js built-in test runner.

## Decisions

- The product and plugin identifier is `codex-agent`.
- Versioned optional context lives under `.codex-agent/context/` and is selected explicitly.
- Ephemeral task execution is the default; resumable state requires explicit opt-in and remains ignored under `.codex-agent/sessions/`.
- Marketplace installation is the default plugin distribution path.
- The CLI is supplemental and must not replace native plugin installation.
- Model selection inherits from the parent Codex session by default.


# Project Guidance

## Build and test

- Replace this section with the repository's actual setup, build, lint, typecheck, and test commands.

## Engineering conventions

- Inspect nearby code and tests before introducing new patterns.
- Keep changes scoped and preserve backwards compatibility unless a breaking change is approved.
- Select optional knowledge from `.codex-agent/context/index.json` explicitly; the directory is not loaded automatically.
- Keep task state ephemeral unless the user explicitly requests a resumable session; session state never becomes durable context automatically.
- Report fresh verification evidence before declaring completion.

## Safety

- Preserve unrelated user changes.
- Do not expose secrets or perform destructive or external actions without explicit authority.
- Require a separate preview and approval before promoting learned knowledge into canonical context.

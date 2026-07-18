# Project Guidance

## Build and test

- Replace this section with the repository's actual setup, build, lint, typecheck, and test commands.

## Engineering conventions

- Inspect nearby code and tests before introducing new patterns.
- Keep changes scoped and preserve backwards compatibility unless a breaking change is approved.
- Select optional knowledge from `.agents/context/index.json` explicitly; the directory is not loaded automatically.
- Report fresh verification evidence before declaring completion.

## Safety

- Preserve unrelated user changes.
- Do not expose secrets or perform destructive or external actions without explicit authority.


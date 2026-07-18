# Releasing the CLI

Every commit pushed to `main` is published to npm by `.github/workflows/publish-cli.yml`. There are no Git release tags, manual release actions, bootstrap workflows, or OIDC configuration.

## Version model

`packages/codex-agent-cli/package.json` stores a stable base version such as `0.1.0`. The workflow derives an immutable npm version from that base, the GitHub run number, and the source commit:

```text
0.1.0-main.142.sha24f6eb2
```

The generated version exists only in the runner and is never committed back to the repository. Each publish updates the npm `latest` dist-tag, so consumers continue to run:

```bash
npx --yes @codex-agent/cli@latest help
```

Change the base version in `packages/codex-agent-cli/package.json` only when starting a new release line, for example from `0.1.0` to `0.2.0`.

## One-time configuration

1. Create a granular npm token that can create and publish public packages in the `@codex-agent` scope. The npm account must own that scope or belong to the organization with publish permission.
2. Open **GitHub → Settings → Environments → npm → Environment secrets**.
3. Add the token as `NPM_TOKEN`.
4. Protect `main` so only reviewed changes can trigger public releases.

The workflow exposes the token only to `npm whoami` and `npm publish`. Keep the token narrowly scoped, set an expiration, and rotate it before expiration.

## Release flow

Merge or push a commit to `main`. The workflow then:

1. Installs locked dependencies.
2. Derives the commit version.
3. Builds and tests the CLI.
4. Validates the workspace.
5. Publishes the generated version with the `latest` dist-tag.

Published npm versions are immutable. Re-running a workflow that already completed its publish step will fail because that derived version already exists.

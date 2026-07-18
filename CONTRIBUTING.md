# Contributing

## Development

Use Node.js 20 or newer. Keep changes scoped, preserve native Codex conventions, and update tests and documentation with behavior changes.

Run:

```bash
npm ci
npm test
npm run validate
npm run eval
```

Validate every skill:

```bash
for skill in plugins/codex-agent/skills/*; do
  python3 /path/to/skill-creator/scripts/quick_validate.py "$skill"
done
```

Validate the plugin:

```bash
python3 /path/to/plugin-creator/scripts/validate_plugin.py plugins/codex-agent
```

For local iteration, update the plugin cachebuster through the plugin-creator helper and reinstall from `codex-agent-marketplace`. Start a new Codex task after reinstalling.

## Plugin deployments

The plugin marketplace is deployed from `.github/workflows/publish-plugin.yml`
after every push to `main`. The workflow validates the exact source commit and
then advances the `marketplace` branch consumed by Codex. No release tag is
required.

See [docs/deploying-plugin.md](docs/deploying-plugin.md) for validation,
deployment, installation, and rollback instructions.

## CLI releases

The CLI is published from `.github/workflows/publish-cli.yml` when a `cli-v*` tag is pushed. The tag must exactly match the version in `packages/codex-agent-cli/package.json`. Publishing uses npm Trusted Publishing with OIDC and does not require a repository secret.

See [docs/releasing-cli.md](docs/releasing-cli.md) for initial npm setup and the release checklist.

## Design rules

- Keep skill frontmatter limited to `name` and `description`.
- Keep commands thin and put workflows in skills.
- Put detailed skill material one level below `references/`.
- Do not add a custom installer for behavior already provided by the Codex marketplace.
- Keep hooks optional, fast, cross-platform, and non-destructive.
- Add routing fixtures for new skills and deterministic tests for new scripts.

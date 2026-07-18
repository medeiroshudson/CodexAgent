# Contributing

## Development

Use Node.js 20 or newer. Keep changes scoped, preserve native Codex conventions, and update tests and documentation with behavior changes.

Run:

```bash
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

## Design rules

- Keep skill frontmatter limited to `name` and `description`.
- Keep commands thin and put workflows in skills.
- Put detailed skill material one level below `references/`.
- Do not add a custom installer for behavior already provided by the Codex marketplace.
- Keep hooks optional, fast, cross-platform, and non-destructive.
- Add routing fixtures for new skills and deterministic tests for new scripts.


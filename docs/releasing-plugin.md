# Releasing the Codex plugin

The repository is the distributable Codex marketplace. Consumers configure the
Git repository as a marketplace source, and Codex resolves
`.agents/plugins/marketplace.json` plus the local plugin source it references.
The `Publish Plugin Marketplace` GitHub Action validates an immutable release
tag and creates a GitHub Release with a marketplace archive and SHA-256
checksum.

Publishing a repository marketplace is separate from publishing in the public
Plugins Directory. Public directory submissions require review and publication
through the [OpenAI plugin submission portal](https://platform.openai.com/plugins).

## Release contract

- The tag is `plugin-v<version>`.
- `<version>` must exactly match `version` in
  `plugins/codex-agent/.codex-plugin/plugin.json`.
- The complete SemVer value is used, including the `+codex.<cachebuster>` suffix.
- Existing GitHub Releases are left unchanged, so rerunning the workflow is
  idempotent.
- The release job writes only GitHub repository contents and does not use npm or
  long-lived credentials.

For example, plugin version `0.1.0+codex.20260718182211` must use this tag:

```text
plugin-v0.1.0+codex.20260718182211
```

## Publish a version

1. Finish and validate the plugin changes.

2. Update the cachebuster with the installed `plugin-creator` helper:

   ```bash
   python3 /path/to/plugin-creator/scripts/update_plugin_cachebuster.py \
     plugins/codex-agent
   ```

3. Run the repository and ingestion checks:

   ```bash
   npm ci
   npm test
   npm run validate
   python3 /path/to/plugin-creator/scripts/validate_plugin.py \
     plugins/codex-agent
   ```

4. Commit and push the plugin version change.

5. Create and push the matching release tag:

   ```bash
   VERSION=$(node -p "require('./plugins/codex-agent/.codex-plugin/plugin.json').version")
   PLUGIN_TAG="plugin-v$VERSION"
   PLUGIN_RELEASE_TAG="$PLUGIN_TAG" node scripts/check-plugin-release.mjs
   git tag "$PLUGIN_TAG"
   git push origin "$PLUGIN_TAG"
   ```

The tag starts `.github/workflows/publish-plugin.yml`. Its read-only job installs
dependencies, verifies the tag, runs the complete test suite, and validates the
workspace. Only after those checks pass does a separate `codex-marketplace`
environment job receive `contents: write` permission and create the GitHub
Release.

The release contains:

- the repository marketplace catalog;
- the complete `codex-agent` plugin directory;
- installation documentation and license;
- a SHA-256 checksum for the compressed archive.

The `codex-marketplace` GitHub environment may be configured with required
reviewers when a manual approval gate is desired.

## Run an existing tag manually

Open **GitHub → Actions → Publish Plugin Marketplace → Run workflow** and enter
an existing tag such as `plugin-v0.1.0+codex.20260718182211`. The workflow checks
out that exact tag and rejects it if it does not match the manifest version.

If the matching GitHub Release already exists, the workflow succeeds without
replacing its assets or release notes.

## Install and update

Track `main` to receive new marketplace snapshots through the normal upgrade
command:

```bash
codex plugin marketplace add medeiroshudson/CodexAgent --ref main
codex plugin add codex-agent@codex-agent-marketplace
codex plugin marketplace upgrade codex-agent-marketplace
codex plugin add codex-agent@codex-agent-marketplace
```

To reproduce one immutable version, configure its release tag instead:

```bash
codex plugin marketplace add \
  medeiroshudson/CodexAgent \
  --ref plugin-v0.1.0+codex.20260718182211
codex plugin add codex-agent@codex-agent-marketplace
```

Start a new Codex task after installation or reinstallation so the updated
plugin surfaces are loaded cleanly.

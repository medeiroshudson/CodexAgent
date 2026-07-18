# Releasing the CLI

The `@codex-agent/cli` package is published by `.github/workflows/publish-cli.yml`. The workflow runs for pushes to `main`, tags named `cli-v<version>`, and manual dispatches. It builds and tests the package on Node.js 24, validates the workspace, and publishes to npm with a short-lived OIDC credential.

Before entering the protected `npm` environment, the workflow checks whether the current package version already exists. Existing versions are skipped successfully, so ordinary commits to `main` do not attempt to republish the same immutable npm version.

## One-time npm setup

If `@codex-agent/cli` has never been published, create the package with one manual release before configuring its trusted publisher:

```bash
npm ci
npm run build --workspace @codex-agent/cli
npm test
npm run validate
npm login
npm publish --workspace @codex-agent/cli --access public
```

Then open the package settings on npmjs.com and add a GitHub Actions trusted publisher with these exact values:

- Organization or user: `medeiroshudson`
- Repository: `CodexAgent`
- Workflow filename: `publish-cli.yml`
- Environment name: `npm`
- Allowed action: `npm publish`

The workflow requires `id-token: write` and uses a GitHub-hosted runner. Do not add an `NPM_TOKEN` secret. The `repository.url` field in the package manifest must continue to match `https://github.com/medeiroshudson/CodexAgent.git`.

## Publish a version

1. Update the CLI version and lockfile:

   ```bash
   npm version patch --workspace @codex-agent/cli --no-git-tag-version
   ```

2. Run the same checks used by the release workflow:

   ```bash
   npm run build --workspace @codex-agent/cli
   npm test
   npm run validate
   npm pack --workspace @codex-agent/cli --dry-run
   ```

3. Commit and push the version change to `main`. This automatically publishes the version if it does not exist on npm. A matching tag can be created for release history. For version `0.1.1`:

   ```bash
   git tag cli-v0.1.1
   git push origin main
   git push origin cli-v0.1.1
   ```

The workflow rejects a tag that does not exactly match the package version. The `npm` GitHub environment can optionally require reviewers to add a manual approval gate before publishing.

## Run manually

Open **GitHub → Actions → Publish CLI → Run workflow**, enter an existing tag such as `cli-v0.1.1`, and start the run. The workflow checks out that tag and confirms it matches the package version before publishing.

The equivalent GitHub CLI command is:

```bash
gh workflow run publish-cli.yml --ref main -f tag=cli-v0.1.1
```

Manual and tag-triggered runs also skip the publish job when that immutable npm version already exists.

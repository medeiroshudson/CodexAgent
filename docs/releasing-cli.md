# Releasing the CLI

The `@codex-agent/cli` package is published by `.github/workflows/publish-cli.yml`. The workflow runs for pushes to `main`, tags named `cli-v<version>`, and manual dispatches. It builds and tests the package on Node.js 24, validates the workspace, and publishes to npm with a short-lived OIDC credential.

Before entering the protected `npm` environment, the workflow checks whether the current package version already exists. Existing versions are skipped successfully, so ordinary commits to `main` do not attempt to republish the same immutable npm version.

## One-time npm setup

If `@codex-agent/cli` has never been published, bootstrap it once with `.github/workflows/bootstrap-cli.yml` before configuring its trusted publisher.

1. Create a granular npm access token with permission to publish packages in the `@codex-agent` scope. The token must satisfy the scope's 2FA policy for non-interactive publishing.
2. Open **GitHub → Settings → Environments → npm → Environment secrets**.
3. Add the token as a secret named `NPM_TOKEN`.
4. Open **GitHub → Actions → Bootstrap CLI package → Run workflow**.
5. Select the ref containing the release and enter the exact confirmation requested by the workflow, such as `@codex-agent/cli@0.1.0`.

The bootstrap workflow validates the confirmation, authenticates with `npm whoami`, builds and tests the package, and publishes with `NODE_AUTH_TOKEN`. It has only `contents: read` GitHub permission and cannot request an OIDC token.

The authenticated npm account must own the `@codex-agent` scope or be a member of that npm organization with publish permission. If that scope is not under your control, create the npm organization first or rename the package to a scope you own, such as `@medeiroshudson/codex-agent-cli`.

OIDC cannot bootstrap a package that does not exist yet. Until the token-based bootstrap succeeds, automated runs stop before the protected publish job with an explicit setup error.

Then open the package settings on npmjs.com and add a GitHub Actions trusted publisher with these exact values:

- Organization or user: `medeiroshudson`
- Repository: `CodexAgent`
- Workflow filename: `publish-cli.yml`
- Environment name: `npm`
- Allowed action: `npm publish`

The permanent workflow requires `id-token: write` and uses a GitHub-hosted runner. It never reads `NPM_TOKEN`; the token is isolated to the manual bootstrap workflow. The `repository.url` field in the package manifest must continue to match `https://github.com/medeiroshudson/CodexAgent.git`.

After the first publish, configure Trusted Publishing, revoke the npm token, and delete the `NPM_TOKEN` environment secret. Future releases use only OIDC.

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

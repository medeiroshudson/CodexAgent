# Deploying the Codex plugin

This repository distributes the plugin as a Git-backed Codex marketplace. The
`main` branch is the development source, and the `marketplace` branch is the
validated deployment consumed by Codex.

Every push to `main` starts `.github/workflows/publish-plugin.yml`. The workflow
runs the complete test suite and workspace validation against that exact commit.
Only after those checks pass does a separate job with `contents: write`
permission advance the `marketplace` branch to the verified commit.

Publishing this repository marketplace is separate from publishing in the
public Plugins Directory. Public directory submissions require review and
publication through the
[OpenAI plugin submission portal](https://platform.openai.com/plugins).

## Deployment contract

- A commit pushed to `main` automatically starts a deployment.
- Failed verification leaves the `marketplace` branch unchanged.
- The deploy job publishes the exact commit verified by the preceding job.
- Deployments are serialized so concurrent pushes cannot intentionally cancel a
  verification or deployment already in progress.
- The deploy job advances the branch without force-pushing. A non-fast-forward
  update fails instead of replacing newer marketplace history.
- The workflow uses the short-lived GitHub token and no npm or long-lived
  credentials.

## Deploy a change

1. Finish the plugin changes.

2. When the plugin contents changed, update the cachebuster with the installed
   `plugin-creator` helper:

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

4. Commit and push the change to `main`:

   ```bash
   git push origin main
   ```

The `Deploy Plugin Marketplace` workflow then validates the commit and advances
the `marketplace` branch. The `codex-marketplace` GitHub environment can be
configured with required reviewers when a manual approval gate is desired.

## Retry the latest main commit

Open **GitHub → Actions → Deploy Plugin Marketplace → Run workflow**. A manual
run always checks out and deploys the latest `main` commit; it does not accept a
tag or arbitrary ref.

## Install and update

Configure the validated deployment branch as the marketplace source:

```bash
codex plugin marketplace add medeiroshudson/CodexAgent --ref marketplace
codex plugin add codex-agent@codex-agent-marketplace
```

Refresh the deployed snapshot and reinstall the plugin after a successful
deployment:

```bash
codex plugin marketplace upgrade codex-agent-marketplace
codex plugin add codex-agent@codex-agent-marketplace
```

Start a new Codex task after installation or reinstallation so the updated
plugin surfaces are loaded cleanly.

## Roll back

Revert the problematic commit on `main` and push the revert. The normal workflow
validates the resulting state and advances `marketplace` to the new revert
commit while preserving branch history.

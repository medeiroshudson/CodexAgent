# Evaluations

`skill-routing.json` defines the minimum positive activation scenarios for every bundled skill. `run-evals.mjs` validates the fixture contract locally and deterministically.

For behavioral evaluation, install the official `plugin-eval` plugin and benchmark `plugins/codex-agent`. Keep generated `.plugin-eval/` runs out of source control unless a release intentionally publishes a baseline.


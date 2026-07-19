# Evaluations

`skill-routing.json` defines positive, negative, and overlap activation scenarios for every bundled skill. `behavior-contracts.json` defines focused required and forbidden behaviors for every skill and canonical agent. `run-evals.mjs` validates both fixture contracts locally and deterministically.

For model-based behavioral execution, use the official `plugin-eval` plugin against the focused contracts. The evaluation plan intentionally excludes end-to-end workflow tests and comparisons between old and new prompts. Keep generated `.plugin-eval/` runs out of source control unless a release intentionally publishes a result set.

# Evaluations

`skill-routing.json` defines positive, negative, and overlap activation scenarios for every bundled skill. `behavior-contracts.json` defines focused required and forbidden behaviors for every skill and canonical agent. `run-evals.mjs` validates both fixture contracts locally and deterministically.

`npm run eval:model -- --runner /absolute/path/to/runner` executes the same fixtures through an externally configured model runner. The runner receives one JSON request over stdin and must report observed model/reasoning provenance, routing traces, token/latency usage, and one structured judgment per behavioral rubric. No model, provider, or credential is hard-coded by the repository.

Use `--repetitions 3 --write-baseline evals/baselines/current.json` only after reviewing a run. Compare a candidate with `--compare evals/baselines/current.json`; comparison rejects different fixture digests, runtimes, protocols, repetitions, or case sets. Baselines contain summaries rather than prompts or raw responses. Keep raw runner output under ignored `.plugin-eval/` state and never place credentials in arguments or results.

This adapter measures real routing only when the runner exposes observed activation traces. A runner that infers activation from answer text is a model-judged simulation and must not be reported as plugin E2E evidence. Model evals remain opt-in and do not run inside the deterministic `npm test` or `npm run validate` gates.

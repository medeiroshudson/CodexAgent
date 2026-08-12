# Evidence Contract

## Criterion matrix

For every `AO-*` acceptance oracle (or legacy acceptance criterion), record:

- observable check;
- command, inspection, or interaction;
- fresh outcome;
- confidence and remaining gap.

Also record the referenced `INV-*`, `SEC-*`, and `FAIL-*` contracts the evidence exercises. Inspect the diff for work prohibited by `NG-*`. An oracle passes only when its expected observation is present at the declared validation surface.

## Result classification

- `VERIFIED`: all criteria and required checks passed.
- `VERIFIED_WITH_GAPS`: strong evidence exists, but a material environment-dependent path was not exercised.
- `IMPLEMENTATION_FAILED`: a check demonstrates a defect or unmet criterion.
- `ENVIRONMENT_BLOCKED`: required evidence is unavailable and no safe substitute proves the criterion.

## Completion report

- `Changed`: concise delivered behavior.
- `Criteria`: criterion-to-evidence mapping.
- `Validated`: exact commands or interactions and outcomes.
- `Not validated`: material platforms, states, integrations, or flows not exercised.
- `Residual risk`: known limitations or assumptions.
- `Durable context`: omit unless a qualifying evidence-backed proposal exists; request separate approval before writing it.

Do not say a check passed when it did not run, timed out, was skipped, produced unexplained warnings, or failed. A successful build alone does not prove runtime behavior.

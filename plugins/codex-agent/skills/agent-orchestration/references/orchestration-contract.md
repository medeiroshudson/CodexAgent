# Orchestration Contract

## Classification

- Direct: one cohesive behavior, limited surface, no new architecture decision.
- Coordinated: multiple independently verifiable behaviors or contracts with dependencies.
- Read-only: discovery, research, planning, review, or reporting without repository mutation.

Do not classify by file count alone. Consider contracts, state, trust boundaries, generated artifacts, and validation surfaces.

## Minimal handoff

Pass decisions and paths, not transcript history. Include:

- outcome, exclusions, authority, and done criteria;
- instruction and context paths the worker must read;
- reference files and prerequisite outputs;
- expected changed surface and validation;
- known risks, user-owned files, and unresolved constraints.

Do not pass the whole session handoff to every worker. Select the smallest relevant context and prerequisite output paths. Workers return structured deltas to the orchestrator; they do not mutate shared session state.

## Concurrency gate

Parallel work requires all of the following:

- no dependency between tasks;
- no overlapping files or generated outputs;
- no shared migration, lockfile, schema, or mutable external state;
- no shared session or candidate writer;
- independent validation commands;
- a defined integration owner.

## Integration gate

Before final verification, confirm:

- prerequisite contracts match their consumers;
- every acceptance criterion maps to delivered behavior;
- combined changes preserve unrelated user work;
- no task summary substitutes for inspecting final repository state;
- required tests and packaging checks run from the integrated state.

## Session boundary

Resumability is independent of complexity and orchestration route. It is disabled unless explicitly requested in natural language. The orchestrator remains the sole writer, applies compare-and-swap revisions, and verifies repository drift before resume. Session opt-in does not authorize `$context-harvest` or `$context-curation` durable writes.

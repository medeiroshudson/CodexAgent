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

## Concurrency gate

Parallel work requires all of the following:

- no dependency between tasks;
- no overlapping files or generated outputs;
- no shared migration, lockfile, schema, or mutable external state;
- independent validation commands;
- a defined integration owner.

## Integration gate

Before final verification, confirm:

- prerequisite contracts match their consumers;
- every acceptance criterion maps to delivered behavior;
- combined changes preserve unrelated user work;
- no task summary substitutes for inspecting final repository state;
- required tests and packaging checks run from the integrated state.

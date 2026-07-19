# Task Contract

Each task contains:

- `id`: stable short identifier.
- `outcome`: one observable result.
- `scope`: included and excluded behavior.
- `context`: applicable instruction, standard, architecture, and reference paths.
- `inputs`: prerequisite decisions, contracts, and outputs.
- `outputs`: changed behavior, files, schemas, or artifacts the next task can consume.
- `dependsOn`: task identifiers that must finish first.
- `parallelSafe`: boolean plus overlap rationale.
- `agent`: preferred narrow role.
- `validation`: exact proportional checks.
- `doneWhen`: measurable completion criteria.

## Overlap analysis

`parallelSafe` is true only when tasks have:

- no dependency relationship;
- no shared source, test, lockfile, schema, generated output, or migration state;
- no shared mutable external resource;
- independently executable validation;
- a clear integration owner.

No dependency does not automatically mean parallel-safe.

## Graph audit

Before publishing the task graph, verify:

- every acceptance criterion maps to a task and check;
- every consumer depends on the task defining its contract;
- the graph is acyclic;
- the critical path is visible;
- integration and final verification are explicit;
- no task hides a material product or architecture decision;
- tasks remain small enough for one focused agent turn.

Do not create task artifacts unless the user requests durable planning or the workflow genuinely requires cross-session handoff.

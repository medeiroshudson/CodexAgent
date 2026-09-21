# Orchestration Contract

## Classification

- Direct: one cohesive behavior, limited surface, no new architecture decision.
- Coordinated: multiple independently verifiable behaviors or contracts with dependencies.
- Read-only: discovery, research, planning, review, or reporting without repository mutation.

Do not classify by file count alone. Consider contracts, state, trust boundaries, generated artifacts, and validation surfaces.

## Delegation gate

Delegate when at least one of these conditions holds:

- two or more workstreams can proceed independently;
- a bounded read-heavy investigation can gather evidence while the root advances the main path;
- an already-defined slow test, monitor, or evidence pull would otherwise block root communication;
- an independent review would materially reduce correctness, security, migration, release, or production risk.

Stay single-agent when the task is small, the next step depends on the immediately previous result, agents would compete for the same mutable surface, or delegation overhead is comparable to direct execution. Use the fewest agents that produce meaningful parallel progress.

The root remains the integration owner and retains user communication, approvals, material decisions, and the final claim. Subagents are leaves unless the root explicitly assigns an independently scoped coordination workstream with non-overlapping children and sufficient slots.

## Assignment contract

Pass decisions and paths, not transcript history. Prefer a self-contained assignment with no history fork when the required context can be stated safely and compactly. Include:

- one objective and why it matters;
- scope, exclusions, read-only or mutation authority, and done criteria;
- exclusive file, component, system, or state ownership;
- instruction and context paths the worker must read;
- reference files and prerequisite outputs;
- dependencies, expected changed surface, and exact validation;
- known risks, user-owned files, and unresolved constraints;
- leaf or explicitly authorized coordinator status;
- required return: status, changed artifacts, decisions, evidence, blockers, residual risk, and candidate learnings.

Do not pass the whole session handoff to every worker. Select the smallest relevant context and prerequisite output paths. Workers return structured deltas to the orchestrator; they do not mutate shared session state.

## Model, permissions, and identity

- Apply [the model-routing contract](model-routing.md) when an explicit spawn override can improve quality, latency, or usage; otherwise inherit the parent model and reasoning effort.
- Respect explicit user configuration and installed project agent profiles when they select a model, effort, sandbox, tools, or skills. Capability-based routing is advisory and never makes one model mandatory for plugin operation.
- Treat requested model or effort as requested configuration, not verified runtime identity, unless the runtime reports the actual values. Report any fallback or runtime correction.
- Subagents inherit the parent turn's live permission and sandbox boundaries. A custom profile may narrow a worker, such as making exploration read-only, but delegation never expands authority.
- Keep approval decisions for destructive, external, production, financial, publishing, merge, deployment, and messaging actions with the root and user unless authority was explicit.

## Concurrency gate

Parallel work requires all of the following:

- no dependency between tasks;
- no overlapping files or generated outputs;
- no shared migration, lockfile, schema, or mutable external state;
- no shared session or candidate writer;
- independent validation commands;
- a defined integration owner.

Read-heavy exploration, research, triage, test analysis, and review are the preferred first uses of parallelism. For writes, assign exclusive ownership by file or component and serialize any shared consumer, generated artifact, migration, schema, lockfile, session, or external mutation.

## Runtime coordination

- Immediately before each spawn, give the user one compact update naming the task, requested model and reasoning effort or parent inheritance, role, read-only or write ownership, and leaf or coordinator status. Label model settings as requested configuration and never guess unreported runtime identity.
- Spawn only the independent work named in the coordination plan and respect the current slot limit.
- Keep at least one useful root path moving while agents run when possible.
- Wait for every result required by the plan before synthesis. Do not wait for unrelated optional work to make a valid completion claim.
- Follow up with an existing subagent when the next bounded question depends on its context; start a new one when independence is more valuable.
- Redirect or stop work when ownership overlaps, assumptions diverge, constraints are ignored, or scope expands.
- Treat subagent results as evidence. Inspect changed files, commands, logs, and authoritative live surfaces before relying on them.
- Reconcile disagreements explicitly and explain which evidence controls. Return one integrated result instead of concatenating agent reports.
- Write that result in the user's language as direct prose: outcome first, evidence exact, and no staged opener, inflated significance, decorative formatting, emoji, or closing offer. Apply `$humanizer` before sending.
- Subagent returns are evidence for the root, not user-facing text: keep them compact, and never forward raw narration when the root can state the result once.

## Integration gate

Before final verification, confirm:

- prerequisite contracts match their consumers;
- every acceptance criterion maps to delivered behavior;
- combined changes preserve unrelated user work;
- no task summary substitutes for inspecting final repository state;
- required tests and packaging checks run from the integrated state.

## Session boundary

Resumability is independent of complexity and orchestration route. It is disabled unless explicitly requested in natural language. The orchestrator remains the sole writer, applies compare-and-swap revisions, and verifies repository drift before resume. Session opt-in does not authorize `$context-harvest` or `$context-curation` durable writes.

## Reference basis

- [OpenAI Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) defines the native trigger, model precedence, inheritance, permission, parallelism, and coordination behavior.
- [OpenAI Codex models](https://learn.chatgpt.com/docs/models#choosing-sol-terra-and-luna) defines the current Sol, Terra, Luna, and reasoning-effort guidance.

This contract adapts those patterns to the plugin's stricter rules: no mandatory model dependency, runtime-advertised capability routing with inheritance fallback, explicit canonical-context selection, serialized shared writes, ephemeral sessions by default, and fresh integrated verification.

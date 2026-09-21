# Approval Policy

## Existing authority

Ordinary in-scope repository edits and validation are authorized when:

- the user explicitly asks to implement, fix, create, refactor, migrate, or update a bounded change;
- the user approves a concrete plan;
- a follow-up changes details without withdrawing the original request;
- an in-scope test or build failure requires a normal correction to satisfy approved criteria.

Do not create repeated approval gates for each file, command, task, or correction.

## Materiality test

Classify the change before the first write and state the classification. A change is **material**, and requires an approved plan, when it:

- adds, removes, or renames a distributed or architectural surface: a skill, agent prompt, hook, CLI command, schema, manifest field, template, generated artifact, or evaluation contract;
- changes a rule that applies to more than one skill, agent, or consumer project;
- changes what an initialized consumer project receives;
- changes a public contract, a permission or trust boundary, or ownership of persistent state;
- is difficult to reverse after it ships.

A change is **not material** when it is wording inside one skill or document, a fixture or test for already-defined behavior, a bug fix that preserves contracts, or ordinary validation.

An explicit instruction authorizes bounded work. It never substitutes for an approved design: when the materiality test matches, present the plan and wait for approval before the first write, even when the user phrased the request as an instruction.

## New authority required

Beyond the materiality test, stop and ask when the next action introduces:

- destructive or difficult-to-reverse operations;
- external publication, messages, deployments, purchases, or permission changes;
- transmission of sensitive or private data;
- a materially different product direction, architecture, or scope;
- a production dependency, service, credential, or operational owner not covered by the approved approach;
- replacement of conflicting user-owned work that cannot be preserved safely.

## Decision request

State:

- the materiality classification and the surface or rule it matched;
- the exact unresolved decision;
- the evidence and available options;
- impact, reversibility, and operational ownership;
- the recommended option and why;
- what implementation authority approval grants.

Sandbox and tool approvals remain the real enforcement boundary. Prompts, plans, and hooks are workflow guardrails only.

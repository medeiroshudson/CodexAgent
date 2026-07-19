# Approval Policy

## Existing authority

Ordinary in-scope repository edits and validation are authorized when:

- the user explicitly asks to implement, fix, create, refactor, migrate, or update;
- the user approves a concrete plan;
- a follow-up changes details without withdrawing the original request;
- an in-scope test or build failure requires a normal correction to satisfy approved criteria.

Do not create repeated approval gates for each file, command, task, or correction.

## New authority required

Stop and ask only when the next action introduces:

- destructive or difficult-to-reverse operations;
- external publication, messages, deployments, purchases, or permission changes;
- transmission of sensitive or private data;
- a materially different product direction, architecture, or scope;
- a production dependency, service, credential, or operational owner not covered by the approved approach;
- replacement of conflicting user-owned work that cannot be preserved safely.

## Decision request

State:

- the exact unresolved decision;
- the evidence and available options;
- impact, reversibility, and operational ownership;
- the recommended option and why;
- what implementation authority approval grants.

Sandbox and tool approvals remain the real enforcement boundary. Prompts, plans, and hooks are workflow guardrails only.

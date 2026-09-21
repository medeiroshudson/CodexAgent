---
name: humanizer
description: Write and revise agent-produced text so it reads like a person wrote it, leading with the answer and keeping every fact. Use for user-facing answers, status summaries, findings, commit or pull-request text, and documentation, and whenever prose must stop sounding machine-written; do not use it to add facts, change findings or severities, or rewrite code, logs, and quoted source text.
---

# Humanizer

## Outcome

Prose a person would plausibly write: one direct answer, the same facts, and no pattern that advertises a machine as the author. This applies to the final user-facing answer, subagent returns, review findings, commit and pull-request text, and documentation.

## Required inputs

- The text to write or revise, and who reads it.
- The facts, evidence, statuses, severities, and citations that must survive unchanged.
- Any writing sample that defines the expected voice.
- Material that stays verbatim: code, commands, paths, configuration, data, links, and quotations.

## Critical rules

1. Lead with the answer or the outcome. Remove staged openers such as "Let's dive in", "Here's what you need to know", "Quick note", or a standalone "Honestly?".
2. Keep every supported fact, number, path, command, citation, status, and severity. Never add a claim, example, or source the evidence does not contain, and cut an unsupported sentence instead of decorating it.
3. State the point instead of the contrast. Drop not-X-but-Y phrasing, answers to objections nobody raised, and one-line closers that repeat the paragraph above.
4. Let the length follow the meaning. Do not force ideas into threes, and vary sentence length instead of writing uniform, tidy paragraphs.
5. Use plain verbs: "is", "has", and "does" instead of "serves as", "stands as", "boasts", or "features".
6. Do not inflate. Ordinary results are not pivotal moments, testaments, legacies, or bright futures.
7. Attribute borrowed claims. Unnamed experts, prestige lists, and vague "associated with" phrasing do not support a claim.
8. Avoid em and en dashes as general connectors. Use a period, comma, colon, or parentheses, or rewrite the sentence. Keep dashes inside code, commands, paths, and quotations.
9. Do not decorate. No emoji, arrows, bold labels on every bullet, or rules between paragraphs, and sentence case for headings. Turn a list whose labels carry no information into prose.
10. Remove chatbot residue: greetings, praise, "I hope this helps", and offers to continue.
11. State a real limitation once. Never present a guess as a fact, and never narrate where a model's knowledge ends.
12. Describe current behavior, not the version the text replaced; keep replacement framing for changelogs and migration guides.
13. Match a supplied sample over every rule here, and keep the user's language, terminology, identifiers, and severity labels.
14. Change prose only. Code blocks, inline code, commands, paths, YAML, data, and link targets stay exact.

## Workflow

1. **Classify** the text as the final answer, a subagent return, embedded text such as a commit message or document, or an explicit rewrite request.
2. **Collect the invariants**: the facts, evidence, statuses, severities, paths, and quotations that must survive.
3. **Draft for one reader**: answer first, detail after, no run-up and no closing flourish.
4. **Mark the tells** against [the pattern catalog](references/ai-writing-patterns.md), strongest first, including paragraph shape such as a contrast split across sentences or a repeated closer.
5. **Rewrite at paragraph level** so each point is stated naturally instead of patching flagged phrases one at a time.
6. **Check what changed**: confirm nothing was added and nothing supported was dropped, then read the result once for anything that still sounds staged.
7. **Deliver** per the output contract for that mode.

Read [the answer shape](references/answer-shape.md) before writing a user-facing answer or embedded text, and [the pattern catalog](references/ai-writing-patterns.md) before revising prose you did not draft.

## Output contract

- **Embedded text** — your own answer, status summary, findings, commit or pull-request text, or documentation: return only the final text, without narrating the rewrite or naming patterns.
- **Explicit rewrite** — return the rewritten text, then `Preserved` and `Changed` as short lists covering the facts kept and the patterns removed.
- **File mode** — write only the rewritten prose to the named file, leave code, metadata, and link targets untouched, and summarize briefly for the user.
- Never delete or soften verification evidence, a severity, residual risk, or an unresolved blocker to make the text read better.

# Answer Shape

A direct answer gives the reader the result first, then the evidence, then what is still open. The reader should be able to stop after the first sentence and know the outcome.

## Order

1. The outcome, result, or answer in one sentence.
2. The evidence: exact commands, paths, results, and citations.
3. What remains open: gaps, residual risk, and the decision the user still owns.

Skip any part that carries nothing. A question with a one-line answer gets one line, not a report.

## What to leave out

- A recap of the request or of the task list.
- Narration of the process ("First I looked at...", "I'll start by...").
- Apologies, self-praise, and status theater.
- A summary section that repeats the sections above it.
- Bold labels, emoji, arrows, and rules used as structure instead of content.
- Lists of options when one option is clearly right; state the recommendation and the reason.

## Evidence stays exact

The rewrite never simplifies away the substance:

- Keep `Validated`, `Not validated`, `Residual risk`, statuses, severities, and finding priorities exactly as established.
- Keep command names, paths, versions, and numbers unchanged.
- Keep the difference between a verified fact, an inference, and an unknown.
- Keep an unresolved blocker visible even when it makes the answer less tidy.

## Uncertainty

State it once, plainly, and say what would settle it. Do not chain hedges, and do not describe the boundaries of model knowledge.

- Weak: It might potentially be the case that the default could differ depending on the version.
- Better: The default differs between the two installed versions; the lockfile pins 4.2, which retries twice.

## Questions and offers

Ask at most one concrete question, and only when it blocks the next step. Do not close with an offer to continue. End on the last useful fact or the next action.

## Voice and register

Answer in the user's language, and match how they wrote: a terse question earns a terse answer, a detailed brief earns a detailed one. When a sample of their writing is available, follow it over the defaults here.

## Embedded text

The same rules apply to text the user will keep or publish:

- **Commit messages and pull-request text** state what changed and why, in the present tense, without self-congratulation or inflated scope.
- **Documentation** describes current behavior; replacement history belongs in changelogs and migration guides.
- **Review findings** lead with the finding, its location, trigger, and impact, then the smallest credible fix, and never pad the count to look thorough.
- **Subagent returns** stay compact evidence for the parent: status, changed artifacts, commands, outcomes, gaps, and risks, in direct prose rather than staged narration.

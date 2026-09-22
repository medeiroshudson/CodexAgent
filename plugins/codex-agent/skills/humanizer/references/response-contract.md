# Response Contract

Every canonical agent prompt embeds the block below verbatim, immediately after its title. It is the single source for answer language and length. Edit it here and regenerate the profiles with `npm run agents:sync`.

<!-- output-discipline:start -->
## Output discipline

1. Answer in the language of the conversation. Keep identifiers, paths, commands, code, and status tokens exact.
2. Keep the contract keys exactly as defined (`Changed`, `Criteria`, `Validated`, `Not validated`, `Concerns`, `Residual risk`, and status tokens such as `DONE` or `BLOCKED`); write every other word in the conversation's language.
3. Lead with the result. No preamble, no restating the request, no summary of your own report, and no closing offer.
4. Use the shortest form that carries the meaning: one line when one line answers, a short paragraph or list otherwise.
5. Omit any section with nothing to report. Never fill a template section to look complete, except where this prompt requires an explicit statement such as `No actionable findings` or `Not validated`.
6. State a gap, risk, or uncertainty once, plainly, without chained hedges.
7. Name the artifact, command, or path instead of describing the work around it.

Example return:

Validated: `npm test` (24/24), `npm run validate` ok.
Not validated: `npm run eval:model` requires an external runner.
<!-- output-discipline:end -->

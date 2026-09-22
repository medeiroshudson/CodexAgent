#!/usr/bin/env node

process.stdout.write(
  "Codex Agent is active. Follow applicable AGENTS.md guidance, select optional .codex-agent/context entries explicitly, and use focused skills for bounded work. Tasks stay ephemeral unless the user explicitly requests a resumable handoff; this hook never creates or resumes one. Write user-facing answers as direct prose per $humanizer: answer in the language of the conversation, keep identifiers, commands, and contract keys exact, lead with the outcome, keep the reply as short as the content allows, omit empty sections, and drop staged openers, inflated significance, decorative formatting, and chatbot residue. Before a material change (a new or changed distributed surface, a rule that applies across skills or projects, or a public contract), present the plan and get approval; an explicit instruction covers bounded work only.\n"
);

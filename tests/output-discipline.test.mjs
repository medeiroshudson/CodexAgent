import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadAgentDefinitions, loadOutputDiscipline } from "../scripts/sync-agent-profiles.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("the response contract carries the language and brevity clauses", () => {
  const discipline = loadOutputDiscipline(root);
  assert.ok(discipline.startsWith("## Output discipline"));
  for (const clause of [
    "in the language of the conversation",
    "the contract keys exactly as defined",
    "shortest form that carries the meaning",
    "Omit any section with nothing to report",
    "No preamble"
  ]) {
    assert.ok(discipline.includes(clause), `response contract missing clause: ${clause}`);
  }
});

test("every canonical agent embeds the response contract verbatim after its title", () => {
  const discipline = loadOutputDiscipline(root);
  for (const definition of loadAgentDefinitions(root)) {
    const instructions = definition.developerInstructions;
    assert.ok(instructions.includes(discipline), `${definition.name} does not embed the response contract verbatim`);
    assert.ok(instructions.indexOf(discipline) < instructions.indexOf("## Mission"), `${definition.name} embeds the response contract after the mission`);
  }
});

test("lifecycle hooks repeat the language and brevity clauses", () => {
  for (const hook of ["plugins/codex-agent/scripts/session-start.mjs", "plugins/codex-agent/scripts/stop-check.mjs"]) {
    const executed = spawnSync(process.execPath, [path.join(root, hook)], { encoding: "utf8" });
    assert.equal(executed.status, 0, `${hook} exited ${executed.status}`);
    assert.ok(executed.stdout.includes("language of the conversation"), `${hook} omits the language clause`);
    assert.ok(executed.stdout.includes("omit empty sections"), `${hook} omits the brevity clause`);
  }
});

test("the humanizer skill points at the response contract", () => {
  assert.match(read("plugins/codex-agent/skills/humanizer/SKILL.md"), /references\/response-contract\.md/);
});

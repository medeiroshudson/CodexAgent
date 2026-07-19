import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { agentProfiles } from "../plugins/codex-agent/generated/agent-profiles.mjs";
import { analyzeProject, renderProjectFiles } from "../packages/codex-agent-cli/src/core.mjs";
import {
  loadAgentDefinitions,
  renderAgentProfilesModule,
  renderAgentToml,
  syncAgentProfiles
} from "../scripts/sync-agent-profiles.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("canonical agent prompts match the bundled module and project templates", () => {
  const definitions = loadAgentDefinitions(root);
  const generated = fs.readFileSync(path.join(root, "plugins", "codex-agent", "generated", "agent-profiles.mjs"), "utf8");

  assert.deepEqual(agentProfiles, definitions);
  assert.equal(generated, renderAgentProfilesModule(definitions));
  for (const definition of definitions) {
    const template = fs.readFileSync(path.join(root, "templates", "project", ".codex", "agents", definition.file), "utf8");
    assert.equal(template, renderAgentToml(definition));
  }
  assert.deepEqual(syncAgentProfiles({ root }).mismatches, []);

  const renderedProject = renderProjectFiles(analyzeProject({ root }));
  for (const definition of definitions) {
    assert.equal(renderedProject.get(`.codex/agents/${definition.file}`).body, renderAgentToml(definition).trim());
  }
});

test("canonical agent prompts declare native scope and substantial instructions", () => {
  const definitions = loadAgentDefinitions(root);
  assert.ok(definitions.length >= 6);
  assert.equal(new Set(definitions.map((item) => item.name)).size, definitions.length);
  for (const definition of definitions) {
    assert.ok(definition.description.length >= 40);
    assert.ok(["read-only", "workspace-write"].includes(definition.sandboxMode));
    for (const heading of ["Mission", "Operating contract", "Critical rules", "Workflow", "Return contract", "Avoid"]) {
      assert.match(definition.developerInstructions, new RegExp(`^## ${heading}$`, "m"), `${definition.name} is missing ${heading}`);
    }
  }
});

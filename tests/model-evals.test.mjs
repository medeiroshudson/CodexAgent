import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compareModelEval, loadModelCases, runModelEvals } from "../evals/model/run-model-evals.mjs";

const temporaryRoot = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-agent-model-evals-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "evals"), { recursive: true });
  fs.mkdirSync(path.join(root, "plugins", "codex-agent"), { recursive: true });
  fs.writeFileSync(path.join(root, "evals", "skill-routing.json"), JSON.stringify({
    version: 2,
    cases: [{ id: "route", kind: "positive", prompt: "Route this", expectedSkill: "implementation" }]
  }));
  fs.writeFileSync(path.join(root, "evals", "behavior-contracts.json"), JSON.stringify({
    version: 1,
    cases: [{
      id: "behavior", subjectType: "skill", subject: "implementation", prompt: "Implement",
      requiredBehaviors: ["Preserve scope"], forbiddenBehaviors: ["Reset worktree"]
    }]
  }));
  return root;
};

test("model eval adapter sends structured requests over stdin and records sanitized results", (t) => {
  const root = temporaryRoot(t);
  const runner = path.join(root, "runner.mjs");
  fs.writeFileSync(runner, `#!/usr/bin/env node
let input = "";
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const common = { schemaVersion: 1, runtime: { provider: "fake", model: "fake-model", reasoningEffort: "test", graderModel: "fake-grader" }, usage: { inputTokens: 1, outputTokens: 1, cost: 0, latencyMs: 1 } };
const result = request.suite === "routing"
  ? { ...common, trace: { primarySkill: "implementation", activatedSkills: ["implementation"], disposition: null } }
  : { ...common, judgments: request.rubrics.map((rubric) => ({ id: rubric.id, pass: true, score: 1, reason: "fixture" })) };
process.stdout.write(JSON.stringify(result));
`);
  fs.chmodSync(runner, 0o755);
  const loaded = loadModelCases(root);
  assert.deepEqual(loaded.cases.map((item) => item.caseId), ["route", "behavior"]);
  const result = runModelEvals({ root, runner, repetitions: 2 });
  assert.deepEqual(result.summary, { total: 4, passed: 4, passRate: 1, routingPassRate: 1, behaviorPassRate: 1 });
  assert.equal(result.byCase.every((item) => item.runs === 2 && item.score === 1), true);
  assert.equal(JSON.stringify(result).includes("Preserve scope"), false);
});

test("model eval comparison rejects stale environments and reports paired regressions", (t) => {
  const root = temporaryRoot(t);
  const base = {
    fixtureDigest: "sha256:fixture", runnerProtocolVersion: 1, repetitions: 1, runtimeDigest: "sha256:runtime",
    summary: { passRate: 1 }, byCase: [{ id: "one", score: 1 }]
  };
  const candidate = { ...base, summary: { passRate: 0 }, byCase: [{ id: "one", score: 0 }] };
  assert.deepEqual(compareModelEval(candidate, base), {
    wins: 0, losses: 1, ties: 0, passRateDelta: -1,
    regressions: [{ id: "one", delta: -1, outcome: "loss" }]
  });
  assert.throws(() => compareModelEval({ ...candidate, repetitions: 2 }, base), /repetitions differs/);
});

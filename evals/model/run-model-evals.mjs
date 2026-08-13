#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
};
const digest = (value) => `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
const option = (args, name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const secretLike = (value) => /(?:sk-[a-z0-9_-]{20,}|bearer\s+[a-z0-9._-]{20,}|api[_-]?key\s*[:=])/i.test(JSON.stringify(value));

export const loadModelCases = (root = moduleRoot) => {
  const routing = readJson(path.join(root, "evals", "skill-routing.json"));
  const behavior = readJson(path.join(root, "evals", "behavior-contracts.json"));
  return {
    fixtures: { routing, behavior },
    cases: [
      ...routing.cases.map((item) => ({
        schemaVersion: 1, suite: "routing", caseId: item.id, mode: "auto-route", prompt: item.prompt,
        expected: {
          kind: item.kind, primarySkill: item.expectedSkill ?? null, skills: item.expectedSkills ?? [],
          excludedSkills: item.excludedSkills ?? [], disposition: item.expectedDisposition ?? null
        }
      })),
      ...behavior.cases.map((item) => ({
        schemaVersion: 1, suite: "behavior", caseId: item.id,
        mode: item.subjectType, subjectType: item.subjectType, subject: item.subject, prompt: item.prompt,
        rubrics: [
          ...item.requiredBehaviors.map((rubric, index) => ({ id: `required-${index + 1}`, kind: "required", rubric })),
          ...item.forbiddenBehaviors.map((rubric, index) => ({ id: `forbidden-${index + 1}`, kind: "forbidden", rubric }))
        ]
      }))
    ]
  };
};

const validateRunnerResult = (value, request) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${request.caseId}: runner output must be an object`);
  if (value.schemaVersion !== 1) throw new Error(`${request.caseId}: runner schemaVersion must be 1`);
  if (!value.runtime || typeof value.runtime.model !== "string" || !value.runtime.model) throw new Error(`${request.caseId}: runner must report observed runtime.model`);
  if (request.suite === "routing") {
    if (!value.trace || !Array.isArray(value.trace.activatedSkills)) throw new Error(`${request.caseId}: routing runner must report trace.activatedSkills`);
  } else if (!Array.isArray(value.judgments) || value.judgments.length !== request.rubrics.length) {
    throw new Error(`${request.caseId}: behavior runner must return one judgment per rubric`);
  }
  if (secretLike(value.runtime) || secretLike(value.usage)) throw new Error(`${request.caseId}: result metadata appears to contain a secret`);
  return value;
};

const runtimeMetadata = (runtime) => ({
  provider: runtime.provider ?? null,
  model: runtime.model,
  reasoningEffort: runtime.reasoningEffort ?? null,
  graderProvider: runtime.graderProvider ?? null,
  graderModel: runtime.graderModel ?? null
});

export const evaluateModelCase = (request, result) => {
  if (request.suite === "routing") {
    const activated = new Set(result.trace.activatedSkills);
    const checks = [];
    if (request.expected.kind === "positive") checks.push(result.trace.primarySkill === request.expected.primarySkill);
    if (request.expected.kind === "negative") checks.push(request.expected.excludedSkills.every((skill) => !activated.has(skill)));
    if (request.expected.kind === "overlap") {
      checks.push(result.trace.primarySkill === request.expected.primarySkill);
      checks.push(request.expected.skills.every((skill) => activated.has(skill)));
    }
    if (request.expected.disposition) checks.push(result.trace.disposition === request.expected.disposition);
    return { pass: checks.every(Boolean), score: checks.filter(Boolean).length / Math.max(1, checks.length), measurement: "trace-observed" };
  }
  const judgments = new Map(result.judgments.map((judgment) => [judgment.id, judgment]));
  const checks = request.rubrics.map((rubric) => {
    const judgment = judgments.get(rubric.id);
    return Boolean(judgment?.pass) && Number.isFinite(judgment?.score) && judgment.score >= 0 && judgment.score <= 1;
  });
  return { pass: checks.every(Boolean), score: result.judgments.reduce((sum, item) => sum + item.score, 0) / Math.max(1, result.judgments.length), measurement: "model-judged" };
};

export const runModelEvals = ({ root = moduleRoot, runner, variant = "candidate", repetitions = 1, timeoutMs = 120000 }) => {
  if (!runner) throw new Error("Model eval runner is required via --runner or CODEX_AGENT_EVAL_RUNNER");
  const absoluteRunner = path.resolve(runner);
  if (!fs.existsSync(absoluteRunner)) throw new Error(`Model eval runner not found: ${absoluteRunner}`);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20) throw new Error("repetitions must be an integer from 1 to 20");
  const loaded = loadModelCases(root);
  const results = [];
  const nodeRunner = process.platform === "win32" && /\.(?:cjs|mjs|js)$/i.test(absoluteRunner);
  const runnerCommand = nodeRunner ? process.execPath : absoluteRunner;
  const runnerArgs = nodeRunner ? [absoluteRunner] : [];
  for (const request of loaded.cases) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const input = { ...request, pluginRoot: path.join(root, "plugins", "codex-agent"), variant, repetition };
      const executed = spawnSync(runnerCommand, runnerArgs, {
        input: `${JSON.stringify(input)}\n`, encoding: "utf8", shell: false, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024,
        env: process.env
      });
      if (executed.error) throw new Error(`${request.caseId}: runner failed: ${executed.error.message}`);
      if (executed.status !== 0) throw new Error(`${request.caseId}: runner exited ${executed.status}: ${executed.stderr.trim()}`);
      let parsed;
      try { parsed = JSON.parse(executed.stdout); } catch { throw new Error(`${request.caseId}: runner returned invalid JSON`); }
      const observed = validateRunnerResult(parsed, request);
      const evaluation = evaluateModelCase(request, observed);
      results.push({
        caseId: request.caseId, suite: request.suite, repetition, ...evaluation,
        runtime: runtimeMetadata(observed.runtime),
        usage: {
          inputTokens: observed.usage?.inputTokens ?? null,
          outputTokens: observed.usage?.outputTokens ?? null,
          cost: observed.usage?.cost ?? null,
          latencyMs: observed.usage?.latencyMs ?? null
        }
      });
    }
  }
  const runtimeDigest = digest(results.map((item) => item.runtime));
  const byCase = loaded.cases.map((item) => {
    const runs = results.filter((result) => result.caseId === item.caseId);
    return { id: item.caseId, suite: item.suite, passes: runs.filter((run) => run.pass).length, runs: runs.length, score: runs.reduce((sum, run) => sum + run.score, 0) / runs.length };
  });
  const passed = results.filter((item) => item.pass).length;
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    fixtureDigest: digest(loaded.fixtures),
    runnerProtocolVersion: 1,
    runtimeDigest,
    runtime: results[0]?.runtime ?? null,
    variant,
    repetitions,
    summary: {
      total: results.length, passed, passRate: passed / Math.max(1, results.length),
      routingPassRate: results.filter((item) => item.suite === "routing" && item.pass).length / Math.max(1, results.filter((item) => item.suite === "routing").length),
      behaviorPassRate: results.filter((item) => item.suite === "behavior" && item.pass).length / Math.max(1, results.filter((item) => item.suite === "behavior").length)
    },
    byCase
  };
};

export const compareModelEval = (candidate, baseline) => {
  for (const field of ["fixtureDigest", "runnerProtocolVersion", "repetitions", "runtimeDigest"]) {
    if (candidate[field] !== baseline[field]) throw new Error(`Model eval results are not comparable: ${field} differs`);
  }
  const baselineCases = new Map(baseline.byCase.map((item) => [item.id, item]));
  if (baselineCases.size !== candidate.byCase.length || candidate.byCase.some((item) => !baselineCases.has(item.id))) throw new Error("Model eval results are not comparable: case sets differ");
  const cases = candidate.byCase.map((item) => {
    const prior = baselineCases.get(item.id);
    const delta = item.score - prior.score;
    return { id: item.id, delta, outcome: delta > 0 ? "win" : delta < 0 ? "loss" : "tie" };
  });
  return {
    wins: cases.filter((item) => item.outcome === "win").length,
    losses: cases.filter((item) => item.outcome === "loss").length,
    ties: cases.filter((item) => item.outcome === "tie").length,
    passRateDelta: candidate.summary.passRate - baseline.summary.passRate,
    regressions: cases.filter((item) => item.outcome === "loss")
  };
};

export const main = (args = process.argv.slice(2)) => {
  const root = path.resolve(option(args, "--root", moduleRoot));
  const runner = option(args, "--runner", process.env.CODEX_AGENT_EVAL_RUNNER);
  const repetitions = Number.parseInt(option(args, "--repetitions", "1"), 10);
  const result = runModelEvals({ root, runner, repetitions, variant: option(args, "--variant", "candidate") });
  const baselinePath = option(args, "--compare");
  const comparison = baselinePath ? compareModelEval(result, readJson(path.resolve(baselinePath))) : null;
  const writeBaseline = option(args, "--write-baseline");
  if (writeBaseline) {
    const target = path.resolve(writeBaseline);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify({ result, ...(comparison ? { comparison } : {}) }, null, 2)}\n`);
  if (result.summary.passed !== result.summary.total || comparison?.losses) process.exitCode = 1;
};

if (process.argv[1] && path.basename(process.argv[1]) === "run-model-evals.mjs") {
  try { main(); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBehaviorContracts, evaluateRouting } from "../packages/codex-agent-cli/src/core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routing = evaluateRouting({ root });
const behavior = evaluateBehaviorContracts({ root });
const failures = [...routing.failures, ...behavior.failures];

if (failures.length) {
  for (const failure of failures) process.stderr.write(`error: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Validated ${routing.scenarios} routing scenarios across ${routing.skills} skills (${routing.byKind.positive} positive, ${routing.byKind.negative} negative, ${routing.byKind.overlap} overlap).\n`);
  process.stdout.write(`Validated ${behavior.scenarios} focused behavior contracts across ${behavior.skills} skills and ${behavior.agents} agents.\n`);
  process.stdout.write("Use the official plugin-eval flow to execute focused model-based behavior checks; this suite intentionally excludes E2E and A/B evaluation.\n");
}

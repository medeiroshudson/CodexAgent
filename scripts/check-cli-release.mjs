import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "packages", "codex-agent-cli", "package.json");

export const expectedReleaseTag = (manifest) => `cli-v${manifest.version}`;

export const validateReleaseTag = (tag, manifest) => {
  if (!tag) return { ok: false, error: "CLI_RELEASE_TAG is required." };
  const expected = expectedReleaseTag(manifest);
  if (tag !== expected) {
    return { ok: false, error: `Release tag ${tag} does not match package version; expected ${expected}.` };
  }
  return { ok: true, expected };
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const result = validateReleaseTag(process.env.CLI_RELEASE_TAG, manifest);
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Release tag ${result.expected} matches @codex-agent/cli ${manifest.version}.\n`);
  }
}

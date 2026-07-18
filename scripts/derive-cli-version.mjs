import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "packages", "codex-agent-cli", "package.json");

export const deriveCliVersion = ({ baseVersion, runNumber, sha }) => {
  if (!/^\d+\.\d+\.\d+$/.test(baseVersion)) {
    throw new Error(`CLI base version must be stable SemVer, received: ${baseVersion}`);
  }
  if (!/^[1-9]\d*$/.test(String(runNumber))) {
    throw new Error(`GITHUB_RUN_NUMBER must be a positive integer, received: ${runNumber}`);
  }
  if (!/^[0-9a-f]{7,64}$/i.test(sha)) {
    throw new Error("GITHUB_SHA must contain at least seven hexadecimal characters.");
  }
  return `${baseVersion}-main.${runNumber}.sha${sha.slice(0, 7).toLowerCase()}`;
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    process.stdout.write(`${deriveCliVersion({
      baseVersion: manifest.version,
      runNumber: process.env.GITHUB_RUN_NUMBER,
      sha: process.env.GITHUB_SHA ?? ""
    })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

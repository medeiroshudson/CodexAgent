import assert from "node:assert/strict";
import test from "node:test";
import { deriveCliVersion } from "../scripts/derive-cli-version.mjs";

test("deriveCliVersion identifies the main run and source commit", () => {
  assert.equal(deriveCliVersion({
    baseVersion: "0.1.0",
    runNumber: "142",
    sha: "24F6EB2A1234567890ABCDEF1234567890ABCDEF"
  }), "0.1.0-main.142.sha24f6eb2");
});

test("deriveCliVersion rejects unstable bases and invalid GitHub metadata", () => {
  assert.throws(() => deriveCliVersion({
    baseVersion: "0.1.0-beta.1",
    runNumber: "142",
    sha: "24f6eb2a"
  }), /stable SemVer/);
  assert.throws(() => deriveCliVersion({
    baseVersion: "0.1.0",
    runNumber: "0",
    sha: "24f6eb2a"
  }), /positive integer/);
  assert.throws(() => deriveCliVersion({
    baseVersion: "0.1.0",
    runNumber: "142",
    sha: "not-a-sha"
  }), /hexadecimal/);
});

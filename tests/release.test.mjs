import assert from "node:assert/strict";
import test from "node:test";
import { expectedReleaseTag, validateReleaseTag } from "../scripts/check-cli-release.mjs";

const manifest = { version: "1.2.3" };

test("expectedReleaseTag prefixes the CLI version", () => {
  assert.equal(expectedReleaseTag(manifest), "cli-v1.2.3");
});

test("validateReleaseTag accepts only the package version tag", () => {
  assert.deepEqual(validateReleaseTag("cli-v1.2.3", manifest), {
    ok: true,
    expected: "cli-v1.2.3"
  });
  assert.match(validateReleaseTag("v1.2.3", manifest).error, /expected cli-v1\.2\.3/);
  assert.equal(validateReleaseTag("", manifest).ok, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedPluginReleaseTag,
  validatePluginReleaseTag
} from "../scripts/check-plugin-release.mjs";

const manifest = { version: "1.2.3+codex.20260718182211" };

test("expectedPluginReleaseTag prefixes the complete plugin version", () => {
  assert.equal(expectedPluginReleaseTag(manifest), "plugin-v1.2.3+codex.20260718182211");
});

test("validatePluginReleaseTag accepts only the manifest version tag", () => {
  assert.deepEqual(validatePluginReleaseTag("plugin-v1.2.3+codex.20260718182211", manifest), {
    ok: true,
    expected: "plugin-v1.2.3+codex.20260718182211"
  });
  assert.match(
    validatePluginReleaseTag("plugin-v1.2.3", manifest).error,
    /expected plugin-v1\.2\.3\+codex\.20260718182211/
  );
  assert.equal(validatePluginReleaseTag("", manifest).ok, false);
});

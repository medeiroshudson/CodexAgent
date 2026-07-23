import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  contextCandidateToProposal,
  parseContextCandidate,
  renderContextCandidate
} from "../plugins/codex-agent/scripts/context-candidate.mjs";
import {
  addSessionContextCandidate,
  createResumableSession,
  readResumableSession,
  SESSION_HANDOFF_LIMITS,
  setSessionCandidateStatus,
  updateResumableSession,
  validateSessionManifest,
  verifyResumableSession
} from "../plugins/codex-agent/scripts/session-store.mjs";
import { sha256 } from "../plugins/codex-agent/scripts/lib/safe-files.mjs";

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-agent-session-"));
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ name: "session-fixture" }, null, 2)}\n`);
  fs.mkdirSync(path.join(root, ".codex-agent", "context", "architecture"), { recursive: true });
  fs.writeFileSync(path.join(root, ".codex-agent", "context", "architecture", "system.md"), "# System\n\nThe package manifest is authoritative.\n");
  return root;
};

const sessionState = () => ({
  objective: "Implement durable context safely.",
  scope: ["Context storage", "No public session CLI"],
  phase: "implementation",
  decisions: ["Use one session writer."],
  selectedContext: [".codex-agent/context/architecture/system.md"],
  artifacts: ["package.json"],
  validation: ["Focused unit tests pending."],
  blockers: [],
  nextAction: "Implement the candidate writer.",
  exitCriteria: ["All focused tests pass."]
});

const candidate = () => ({
  title: "Keep session writes single-owner",
  kind: "constraint",
  summary: "Only the parent orchestrator writes resumable session state.",
  scope: "agent orchestration",
  knowledge: "Keep resumable session updates under one orchestrator writer and use manifest revisions to reject stale updates.",
  evidence: [{ path: "package.json", note: "The fixture is repository-owned evidence for the candidate contract." }],
  tags: ["sessions", "orchestration"],
  priority: "high",
  confidence: "high",
  reviewWhen: ["The subagent coordination runtime changes"]
});

test("resumable session persists only a bounded Markdown handoff and lightweight manifest", () => {
  const root = fixture();
  const result = createResumableSession({ root, id: "session-20260722-alpha", ...sessionState() });
  const stored = readResumableSession({ root, id: result.manifest.id });
  const handoffPath = path.join(root, result.directory, "handoff.md");
  const handoff = fs.readFileSync(handoffPath, "utf8");

  assert.equal(stored.manifest.revision, 1);
  assert.equal(validateSessionManifest(stored.manifest).ok, true);
  assert.equal(stored.manifest.resumable, true);
  assert.equal(stored.handoff.objective, sessionState().objective);
  assert.match(handoff, /codex-agent:session-handoff:v1/);
  assert.match(handoff, /## Verified decisions/);
  assert.doesNotMatch(handoff, /transcript|full prompt|raw log/i);
  assert.deepEqual(stored.manifest.selectedContext.map((item) => item.path), sessionState().selectedContext);
  assert.match(stored.manifest.handoff.sha256, /^[0-9a-f]{64}$/);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", `session-${stored.manifest.id}.lock`)), false);
});

test("session handoffs enforce compact field, list, and total byte limits", () => {
  const root = fixture();
  const boundary = createResumableSession({
    root,
    id: "session-20260722-limits",
    ...sessionState(),
    objective: "x".repeat(SESSION_HANDOFF_LIMITS.objective),
    decisions: Array.from({ length: SESSION_HANDOFF_LIMITS.decisionItems }, (_, index) => `Decision ${index}`)
  });
  assert.equal(readResumableSession({ root, id: boundary.manifest.id }).handoff.objective.length, SESSION_HANDOFF_LIMITS.objective);

  assert.throws(() => createResumableSession({
    root: fixture(),
    id: "session-20260722-too-long",
    ...sessionState(),
    objective: "x".repeat(SESSION_HANDOFF_LIMITS.objective + 1)
  }), /objective exceeds/);
  assert.throws(() => createResumableSession({
    root: fixture(),
    id: "session-20260722-too-many",
    ...sessionState(),
    decisions: Array.from({ length: SESSION_HANDOFF_LIMITS.decisionItems + 1 }, (_, index) => `Decision ${index}`)
  }), /decisions exceeds/);
  assert.throws(() => createResumableSession({
    root: fixture(),
    id: "session-20260722-too-large",
    ...sessionState(),
    artifacts: Array.from({ length: SESSION_HANDOFF_LIMITS.artifactItems }, (_, index) => `${index}-${"x".repeat(490)}`)
  }), /handoff exceeds .* UTF-8 bytes/);
});

test("session updates use compare-and-swap revisions and preserve the prior state on rejection", () => {
  const root = fixture();
  createResumableSession({ root, id: "session-20260722-bravo", ...sessionState() });
  const updated = updateResumableSession({
    root,
    id: "session-20260722-bravo",
    expectedRevision: 1,
    patch: { phase: "verification", validation: ["Unit tests passed."], nextAction: "Run aggregate validation." }
  });

  assert.equal(updated.manifest.revision, 2);
  assert.equal(updated.handoff.phase, "verification");
  assert.throws(() => updateResumableSession({
    root,
    id: "session-20260722-bravo",
    expectedRevision: 1,
    patch: { phase: "stale write" }
  }), /revision mismatch/);
  assert.equal(readResumableSession({ root, id: "session-20260722-bravo" }).handoff.phase, "verification");
});

test("a stale local lock recovers a prepared session transaction before the next write", () => {
  const root = fixture();
  const id = "session-20260722-recovery";
  createResumableSession({ root, id, ...sessionState() });
  const sessionRoot = path.join(root, ".codex-agent", "sessions", id);
  const handoffPath = path.join(sessionRoot, "handoff.md");
  const manifestPath = path.join(sessionRoot, "manifest.json");
  const oldHandoff = fs.readFileSync(handoffPath);
  const oldManifest = fs.readFileSync(manifestPath);
  const transactionRoot = path.join(root, ".codex-agent", ".transactions", `session-${id}`);
  fs.mkdirSync(path.join(transactionRoot, "staged"), { recursive: true });
  fs.mkdirSync(path.join(transactionRoot, "rollback"), { recursive: true });
  fs.writeFileSync(path.join(transactionRoot, "rollback", "000.old"), oldHandoff);
  fs.writeFileSync(path.join(transactionRoot, "rollback", "001.old"), oldManifest);

  const partialHandoff = "partial handoff from interrupted promotion\n";
  const orphanCandidate = "orphan candidate from interrupted promotion\n";
  const orphanPath = path.join(sessionRoot, "candidates", "orphan-candidate.md");
  fs.mkdirSync(path.dirname(orphanPath), { recursive: true });
  fs.writeFileSync(handoffPath, partialHandoff);
  fs.writeFileSync(orphanPath, orphanCandidate);
  fs.writeFileSync(path.join(transactionRoot, "journal.json"), `${JSON.stringify({
    version: 1,
    sessionId: id,
    status: "prepared",
    files: [
      {
        path: `.codex-agent/sessions/${id}/handoff.md`,
        staged: "staged/000.new",
        backup: "rollback/000.old",
        existed: true,
        newSha256: sha256(partialHandoff),
        oldSha256: sha256(oldHandoff)
      },
      {
        path: `.codex-agent/sessions/${id}/manifest.json`,
        staged: "staged/001.new",
        backup: "rollback/001.old",
        existed: true,
        newSha256: sha256(oldManifest),
        oldSha256: sha256(oldManifest)
      },
      {
        path: `.codex-agent/sessions/${id}/candidates/orphan-candidate.md`,
        staged: "staged/002.new",
        backup: null,
        existed: false,
        newSha256: sha256(orphanCandidate),
        oldSha256: null
      }
    ]
  }, null, 2)}\n`);
  const locks = path.join(root, ".codex-agent", ".locks");
  fs.mkdirSync(locks, { recursive: true });
  fs.writeFileSync(path.join(locks, `session-${id}.lock`), `${JSON.stringify({
    pid: 2147483647,
    hostname: os.hostname(),
    createdAt: "2026-07-22T00:00:00.000Z",
    nonce: "stale"
  })}\n`);

  assert.throws(() => readResumableSession({ root, id }), /handoff hash/);
  const updated = updateResumableSession({
    root,
    id,
    expectedRevision: 1,
    patch: { phase: "verification" }
  });

  assert.equal(updated.manifest.revision, 2);
  assert.equal(updated.handoff.phase, "verification");
  assert.equal(fs.existsSync(orphanPath), false);
  assert.equal(fs.existsSync(transactionRoot), false);
  assert.equal(fs.existsSync(path.join(locks, `session-${id}.lock`)), false);
});

test("handoff scalar fields cannot inject Markdown sections", () => {
  const root = fixture();
  const created = createResumableSession({
    root,
    id: "session-20260722-sections",
    ...sessionState(),
    objective: "Preserve the real objective.\n\n## Blockers\nInjected blocker.",
    nextAction: "## Validation\nPretend validation passed."
  });
  const content = fs.readFileSync(path.join(root, created.directory, "handoff.md"), "utf8");
  const stored = readResumableSession({ root, id: "session-20260722-sections" });

  assert.equal((content.match(/^## Blockers$/gm) ?? []).length, 1);
  assert.equal((content.match(/^## Validation$/gm) ?? []).length, 1);
  assert.match(stored.handoff.objective, /Preserve the real objective\. +## Blockers +Injected blocker\./);
  assert.equal(stored.handoff.nextAction, "Validation Pretend validation passed.");
});

test("candidate Markdown round-trips into the existing curation proposal contract", () => {
  const root = fixture();
  const markdown = renderContextCandidate(candidate(), {
    root,
    sourceSessionId: "session-20260722-charlie",
    now: new Date("2026-07-22T12:00:00.000Z")
  });
  const parsed = parseContextCandidate(markdown, { root });
  const proposal = contextCandidateToProposal(parsed);

  assert.match(markdown, /^<!-- codex-agent:context-candidate:v1 -->/);
  assert.equal(parsed.metadata.sourceSessionId, "session-20260722-charlie");
  assert.equal(proposal.contentMarkdown, candidate().knowledge);
  assert.equal(proposal.kind, "constraint");
  assert.equal(Object.hasOwn(proposal, "sourceSessionId"), false);
  assert.throws(() => parseContextCandidate(markdown.replace("# Keep session writes single-owner", "# Different title"), { root }), /heading does not match/);
});

test("Unicode candidate titles receive distinct deterministic schema-safe IDs", () => {
  const root = fixture();
  const render = (title) => parseContextCandidate(renderContextCandidate({ ...candidate(), title }, {
    root,
    sourceSessionId: "session-20260722-unicode",
    now: new Date("2026-07-22T12:00:00.000Z")
  }), { root }).metadata.id;

  const first = render("会话写入所有权规则");
  const repeated = render("会话写入所有权规则");
  const second = render("上下文晋升审批规则");
  assert.equal(first, repeated);
  assert.notEqual(first, second);
  assert.match(first, /^constraint-u-[a-f0-9]{16}$/);
});

test("orchestrator-owned candidate writes update the session manifest without promoting context", () => {
  const root = fixture();
  createResumableSession({ root, id: "session-20260722-delta", ...sessionState() });
  const added = addSessionContextCandidate({
    root,
    id: "session-20260722-delta",
    expectedRevision: 1,
    candidate: candidate()
  });
  const afterAdd = readResumableSession({ root, id: "session-20260722-delta", includeCandidates: true });

  assert.equal(added.manifest.revision, 2);
  assert.equal(afterAdd.candidates.length, 1);
  assert.equal(afterAdd.manifest.candidates[0].status, "proposed");
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", "context", "constraints", `${afterAdd.manifest.candidates[0].id}.md`)), false);

  assert.throws(() => setSessionCandidateStatus({
    root,
    id: "session-20260722-delta",
    candidateId: afterAdd.manifest.candidates[0].id,
    status: "promoted",
    expectedRevision: 2,
    expectedCandidateHash: afterAdd.manifest.candidates[0].sha256
  }), /Invalid candidate status transition/);

  const accepted = setSessionCandidateStatus({
    root,
    id: "session-20260722-delta",
    candidateId: afterAdd.manifest.candidates[0].id,
    status: "accepted",
    expectedRevision: 2,
    expectedCandidateHash: afterAdd.manifest.candidates[0].sha256
  });
  assert.equal(accepted.manifest.revision, 3);
  assert.equal(accepted.manifest.candidates[0].status, "accepted");
});

test("session persistence rejects credentials and symbolic-link escapes", () => {
  const root = fixture();
  assert.throws(() => createResumableSession({
    root,
    id: "session-20260722-echo",
    ...sessionState(),
    decisions: ["Temporary token sk-abcdefghijklmnopqrstuvwxyz1234567890"]
  }), /secret or credential/);

  const linkedRoot = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "codex-agent-session-outside-"));
  fs.mkdirSync(path.join(linkedRoot, ".codex-agent"), { recursive: true });
  fs.symlinkSync(outside, path.join(linkedRoot, ".codex-agent", "sessions"), "dir");
  assert.throws(() => createResumableSession({
    root: linkedRoot,
    id: "session-20260722-foxtrot",
    ...sessionState()
  }), /symbolic link/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("resume verification reports changed artifacts and selected context", () => {
  const root = fixture();
  createResumableSession({ root, id: "session-20260722-golf", ...sessionState() });
  assert.equal(verifyResumableSession({ root, id: "session-20260722-golf" }).ok, true);

  fs.appendFileSync(path.join(root, "package.json"), "\n");
  fs.appendFileSync(path.join(root, ".codex-agent", "context", "architecture", "system.md"), "Changed.\n");
  const verification = verifyResumableSession({ root, id: "session-20260722-golf" });

  assert.equal(verification.ok, false);
  assert.ok(verification.mismatches.some((item) => item.kind === "artifact" && item.reason === "hash-changed"));
  assert.ok(verification.mismatches.some((item) => item.kind === "selected-context" && item.reason === "hash-changed"));
});

test("session runtime files do not create false Git worktree drift before context initialization", () => {
  const root = fixture();
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(git("init").status, 0);
  assert.equal(git("config", "user.email", "fixture@example.com").status, 0);
  assert.equal(git("config", "user.name", "Fixture").status, 0);
  assert.equal(git("add", ".").status, 0);
  assert.equal(git("commit", "-m", "fixture").status, 0);

  createResumableSession({ root, id: "session-20260722-hotel", ...sessionState() });
  const verification = verifyResumableSession({ root, id: "session-20260722-hotel" });
  assert.equal(verification.ok, true);
  assert.equal(verification.mismatches.some((item) => item.kind === "git" && item.field === "worktreeHash"), false);
});

test("worktree verification detects changed untracked content when porcelain status is unchanged", () => {
  const root = fixture();
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(git("init").status, 0);
  assert.equal(git("config", "user.email", "fixture@example.com").status, 0);
  assert.equal(git("config", "user.name", "Fixture").status, 0);
  assert.equal(git("add", ".").status, 0);
  assert.equal(git("commit", "-m", "fixture").status, 0);

  const untracked = path.join(root, "working-note.md");
  fs.writeFileSync(untracked, "content A\n");
  createResumableSession({ root, id: "session-20260722-india", ...sessionState() });
  const before = git("status", "--porcelain=v1").stdout;

  fs.writeFileSync(untracked, "content B\n");
  const after = git("status", "--porcelain=v1").stdout;
  const verification = verifyResumableSession({ root, id: "session-20260722-india" });

  assert.equal(after, before);
  assert.equal(verification.ok, false);
  assert.ok(verification.mismatches.some((item) => item.kind === "git" && item.field === "worktreeHash"));
});

test("candidate transitions reject tampered and missing candidate files", () => {
  const tamperedRoot = fixture();
  createResumableSession({ root: tamperedRoot, id: "session-20260722-juliet", ...sessionState() });
  const tampered = addSessionContextCandidate({
    root: tamperedRoot,
    id: "session-20260722-juliet",
    expectedRevision: 1,
    candidate: candidate()
  });
  fs.appendFileSync(path.join(tamperedRoot, ".codex-agent", "sessions", "session-20260722-juliet", tampered.candidate.path), "tampered\n");
  assert.throws(() => setSessionCandidateStatus({
    root: tamperedRoot,
    id: "session-20260722-juliet",
    candidateId: tampered.candidate.id,
    status: "accepted",
    expectedRevision: 2,
    expectedCandidateHash: tampered.candidate.sha256
  }), /Candidate hash mismatch/);
  assert.equal(readResumableSession({ root: tamperedRoot, id: "session-20260722-juliet" }).manifest.revision, 2);

  const missingRoot = fixture();
  createResumableSession({ root: missingRoot, id: "session-20260722-kilo", ...sessionState() });
  const missing = addSessionContextCandidate({
    root: missingRoot,
    id: "session-20260722-kilo",
    expectedRevision: 1,
    candidate: candidate()
  });
  fs.unlinkSync(path.join(missingRoot, ".codex-agent", "sessions", "session-20260722-kilo", missing.candidate.path));
  assert.throws(() => setSessionCandidateStatus({
    root: missingRoot,
    id: "session-20260722-kilo",
    candidateId: missing.candidate.id,
    status: "accepted",
    expectedRevision: 2,
    expectedCandidateHash: missing.candidate.sha256
  }), /Session candidate is missing/);
  assert.equal(readResumableSession({ root: missingRoot, id: "session-20260722-kilo" }).manifest.revision, 2);
});

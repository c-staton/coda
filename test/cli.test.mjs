import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

function runCoda(args, { input, home } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    input: input ?? "",
    encoding: "utf8",
    env: {
      ...process.env,
      CODA_HOME: home,
      CODA_ENGINE: "print", // deterministic, no audio device needed
    },
  });
}

function freshHome() {
  return mkdtempSync(join(tmpdir(), "coda-test-"));
}

test("status defaults to listening on", () => {
  const home = freshHome();
  const r = runCoda(["status"], { home });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /listening on/);
  assert.match(r.stdout, /engine print/);
});

test("off then on toggles listening flag", () => {
  const home = freshHome();
  assert.match(runCoda(["off"], { home }).stdout, /listening off/);
  assert.match(runCoda(["on"], { home }).stdout, /listening on/);
  assert.match(runCoda(["toggle"], { home }).stdout, /listening off/);
});

test("hook never auto-speaks Cursor replies", () => {
  const home = freshHome();
  const payload = JSON.stringify({
    text: "All finished. The build is green.",
    conversation_id: "abc",
  });
  const r = runCoda(["hook"], { home, input: payload });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("hook while muted speaks nothing", () => {
  const home = freshHome();
  runCoda(["off"], { home });
  const payload = JSON.stringify({ text: "You should not hear this." });
  const r = runCoda(["hook"], { home, input: payload });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("hook with missing text exits cleanly and says nothing", () => {
  const home = freshHome();
  const r = runCoda(["hook"], { home, input: JSON.stringify({ conversation_id: "x" }) });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("hook with malformed JSON exits 0 without breaking", () => {
  const home = freshHome();
  const r = runCoda(["hook"], { home, input: "not json {" });
  assert.equal(r.status, 0);
});

test("replay speaks the last digest", () => {
  const home = freshHome();
  runCoda(["speak", "Remember this line."], { home });
  const r = runCoda(["replay"], { home });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Remember this line\./);
});

test("hook skips a reply that is only code", () => {
  const home = freshHome();
  const payload = JSON.stringify({ text: "```js\nconst x = 1;\n```" });
  const r = runCoda(["hook"], { home, input: payload });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("unknown command exits non-zero with usage", () => {
  const home = freshHome();
  const r = runCoda(["frobnicate"], { home });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage:/);
});

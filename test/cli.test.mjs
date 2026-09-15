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
      CODA_ENGINE: "print",
    },
  });
}

function freshHome() {
  return mkdtempSync(join(tmpdir(), "coda-test-"));
}

test("status shows engine and voice", () => {
  const home = freshHome();
  const r = runCoda(["status"], { home });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /engine print/);
  assert.match(r.stdout, /voice eve/);
  assert.doesNotMatch(r.stdout, /listening/);
});

test("old hook command stays quiet", () => {
  const home = freshHome();
  const payload = JSON.stringify({
    text: "All finished. The build is green.",
    conversation_id: "abc",
  });
  const r = runCoda(["hook"], { home, input: payload });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("replay speaks the last digest", () => {
  const home = freshHome();
  runCoda(["speak", "Remember this line."], { home });
  const r = runCoda(["replay"], { home });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Remember this line\./);
});

test("speak refuses a string that looks like a key", () => {
  const home = freshHome();
  const r = runCoda(["speak", "sk-or-testkeynotreal123"], { home });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /looks like a key/);
  assert.doesNotMatch(r.stdout, /sk-or-testkeynotreal123/);
});

test("unknown command exits non-zero with usage", () => {
  const home = freshHome();
  const r = runCoda(["frobnicate"], { home });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage:/);
  assert.doesNotMatch(r.stderr, /hook/);
});

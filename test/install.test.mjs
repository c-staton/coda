import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

function run(args, { home, hooksFile } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CODA_HOME: home,
      CODA_HOOKS_FILE: hooksFile,
      CODA_ENGINE: "print",
      CODA_SKIP_APP: "1",
    },
  });
}

function ctx() {
  const dir = mkdtempSync(join(tmpdir(), "coda-install-"));
  return { home: dir, hooksFile: join(dir, "hooks.json") };
}

test("install writes paths.json and does not touch Cursor hooks", () => {
  const c = ctx();
  const r = run(["install"], c);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /installed/);
  const pathsFile = join(c.home, "paths.json");
  assert.ok(existsSync(pathsFile));
  const rec = JSON.parse(readFileSync(pathsFile, "utf8"));
  assert.equal(rec.node, process.execPath);
  assert.match(rec.cli, /cli\.mjs$/);
  assert.ok(rec.repo);
  assert.equal(rec.app, join(c.home, "Coda.app"));
  assert.equal(rec.bin, join(c.home, "Coda.app", "Contents", "MacOS", "Coda"));
  assert.equal(existsSync(c.hooksFile), false);
});

test("install is idempotent", () => {
  const c = ctx();
  run(["install"], c);
  const r2 = run(["install"], c);
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(r2.stdout, /already set up|installed/);
});

test("install never writes a Cursor hook, even with --cursor", () => {
  const c = ctx();
  const r = run(["install", "--cursor"], c);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(c.hooksFile), false);
});

test("uninstall still removes an old Coda hook and keeps others", () => {
  const c = ctx();
  writeFileSync(
    c.hooksFile,
    JSON.stringify({
      version: 1,
      hooks: {
        afterAgentResponse: [
          { command: "node /other/tool.js" },
          { command: "node /tmp/after-agent-response.mjs" },
        ],
      },
    })
  );
  const r = run(["uninstall"], c);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /uninstalled/);
  const cfg = JSON.parse(readFileSync(c.hooksFile, "utf8"));
  const cmds = cfg.hooks.afterAgentResponse.map((e) => e.command);
  assert.deepEqual(cmds, ["node /other/tool.js"]);
});

test("uninstall on a clean machine reports nothing to remove", () => {
  const c = ctx();
  const r = run(["uninstall"], c);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /nothing to remove/);
});

test("install on a non-Mac machine says Coda is a Mac app", () => {
  if (process.platform === "darwin") return;
  const c = ctx();
  const r = spawnSync(process.execPath, [CLI, "install"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CODA_HOME: c.home,
      CODA_HOOKS_FILE: c.hooksFile,
      CODA_ENGINE: "print",
    },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Coda is a Mac app/);
});

test("install leaves a malformed hooks.json alone", () => {
  const c = ctx();
  writeFileSync(c.hooksFile, "{ not valid json");
  const r = run(["install"], c);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(c.hooksFile, "utf8"), "{ not valid json");
});

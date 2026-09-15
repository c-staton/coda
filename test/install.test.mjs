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
  assert.equal(existsSync(c.hooksFile), false);
});

test("install is idempotent", () => {
  const c = ctx();
  run(["install"], c);
  const r2 = run(["install"], c);
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(r2.stdout, /already set up|installed/);
});

test("install --cursor wires the hook without duplicating it", () => {
  const c = ctx();
  const r = run(["install", "--cursor"], c);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(c.hooksFile));
  const cfg = JSON.parse(readFileSync(c.hooksFile, "utf8"));
  const cmds = cfg.hooks.afterAgentResponse.map((e) => e.command);
  assert.equal(cmds.length, 1);
  assert.match(cmds[0], /after-agent-response\.mjs/);
  run(["install", "--cursor"], c);
  const again = JSON.parse(readFileSync(c.hooksFile, "utf8"));
  assert.equal(again.hooks.afterAgentResponse.length, 1);
});

test("install --cursor preserves existing unrelated hooks", () => {
  const c = ctx();
  writeFileSync(
    c.hooksFile,
    JSON.stringify({
      version: 1,
      hooks: {
        afterAgentResponse: [{ command: "node /other/tool.js" }],
        beforeSubmitPrompt: [{ command: "echo hi" }],
      },
    })
  );
  run(["install", "--cursor"], c);
  const cfg = JSON.parse(readFileSync(c.hooksFile, "utf8"));
  const cmds = cfg.hooks.afterAgentResponse.map((e) => e.command);
  assert.ok(cmds.includes("node /other/tool.js"));
  assert.ok(cmds.some((x) => /after-agent-response\.mjs/.test(x)));
  assert.equal(cfg.hooks.beforeSubmitPrompt[0].command, "echo hi");
});

test("uninstall removes only the coda hook and keeps others", () => {
  const c = ctx();
  writeFileSync(
    c.hooksFile,
    JSON.stringify({
      version: 1,
      hooks: { afterAgentResponse: [{ command: "node /other/tool.js" }] },
    })
  );
  run(["install", "--cursor"], c);
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

test("install --cursor refuses to clobber a malformed hooks.json", () => {
  const c = ctx();
  writeFileSync(c.hooksFile, "{ not valid json");
  const r = run(["install", "--cursor"], c);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not valid JSON/);
});

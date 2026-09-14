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
    },
  });
}

function ctx() {
  const dir = mkdtempSync(join(tmpdir(), "coda-install-"));
  return { home: dir, hooksFile: join(dir, "hooks.json") };
}

test("install creates a hooks.json wired to the coda hook and turns listening on", () => {
  const c = ctx();
  const r = run(["install"], c);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /installed/);
  assert.ok(existsSync(c.hooksFile));
  const cfg = JSON.parse(readFileSync(c.hooksFile, "utf8"));
  const cmds = cfg.hooks.afterAgentResponse.map((e) => e.command);
  assert.equal(cmds.length, 1);
  assert.match(cmds[0], /after-agent-response\.mjs/);
  // listening flag persisted on
  assert.match(run(["status"], c).stdout, /listening on/);
});

test("install is idempotent (no duplicate hook entries)", () => {
  const c = ctx();
  run(["install"], c);
  const r2 = run(["install"], c);
  assert.match(r2.stdout, /already installed/);
  const cfg = JSON.parse(readFileSync(c.hooksFile, "utf8"));
  assert.equal(cfg.hooks.afterAgentResponse.length, 1);
});

test("install preserves existing unrelated hooks", () => {
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
  run(["install"], c);
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
  run(["install"], c);
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

test("install refuses to clobber a malformed hooks.json", () => {
  const c = ctx();
  writeFileSync(c.hooksFile, "{ not valid json");
  const r = run(["install"], c);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not valid JSON/);
});

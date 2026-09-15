import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

function run(args, home) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, CODA_HOME: home, CODA_ENGINE: "print" },
  });
}

test("pause with nothing playing reports that clearly", () => {
  const home = mkdtempSync(join(tmpdir(), "coda-play-"));
  const r = run(["pause"], home);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /nothing playing/);
});

test("stop is always safe", () => {
  const home = mkdtempSync(join(tmpdir(), "coda-play-"));
  const r = run(["stop"], home);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /stopped/);
});

test("speaking records history you can pick later", () => {
  const home = mkdtempSync(join(tmpdir(), "coda-play-"));
  run(["speak", "First spoken line."], home);
  run(["speak", "Second spoken line."], home);
  const raw = spawnSync(process.execPath, ["-e", "console.log(JSON.stringify(require(process.env.CODA_HOME+'/state.json').history))"], {
    encoding: "utf8",
    env: { ...process.env, CODA_HOME: home },
  });
  const history = JSON.parse(raw.stdout);
  assert.equal(history[0].text, "Second spoken line.");
  assert.equal(history[1].text, "First spoken line.");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ttsUrl = new URL("../src/tts.mjs", import.meta.url).href;

function run(home, body) {
  const script = `import { clipId, clipFile, findCachedClip, clearClipCache } from ${JSON.stringify(ttsUrl)};
${body}`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, CODA_HOME: home, CODA_ENGINE: "print" },
  });
}

test("clipId stays the same for the same text and voice", () => {
  const home = mkdtempSync(join(tmpdir(), "coda-clip-"));
  const r = run(
    home,
    `
    const cfg = { model: "x-ai/grok-voice-tts-1.0", voice: "ara", speed: 1 };
    const a = clipId("Hello there.", cfg);
    const b = clipId("Hello there.", cfg);
    const c = clipId("Something else.", cfg);
    if (a !== b) process.exit(2);
    if (a === c) process.exit(3);
    console.log("ok");
    `
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("findCachedClip reads a finished clip and misses a missing one", () => {
  const home = mkdtempSync(join(tmpdir(), "coda-clip-"));
  mkdirSync(join(home, "clips"), { recursive: true });
  const r = run(
    home,
    `
    const cfg = { model: "x-ai/grok-voice-tts-1.0", voice: "ara", speed: 1 };
    const dest = clipFile("Ready clip.", cfg, "mp3");
    if (findCachedClip("Ready clip.", cfg)) process.exit(2);
    const fs = await import("node:fs");
    fs.writeFileSync(dest, Buffer.alloc(64, 1));
    if (findCachedClip("Ready clip.", cfg) !== dest) process.exit(3);
    if (findCachedClip("Other clip.", cfg)) process.exit(4);
    clearClipCache();
    if (findCachedClip("Ready clip.", cfg)) process.exit(5);
    `
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

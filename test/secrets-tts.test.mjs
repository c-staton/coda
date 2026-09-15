import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { grokRequestBody, openrouterRequestBody } from "../src/tts.mjs";

const CLI = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

test("Grok TTS payload matches the official API (text + voice_id + language)", () => {
  assert.deepEqual(grokRequestBody("Hello there.", { voice: "eve", language: "auto" }), {
    text: "Hello there.",
    voice_id: "eve",
    language: "auto",
  });
});

test("engine grok refuses without a key", () => {
  const home = mkdtempSync(join(tmpdir(), "coda-key-"));
  const r = spawnSync(process.execPath, [CLI, "engine", "grok"], {
    encoding: "utf8",
    env: { ...process.env, CODA_HOME: home, CODA_ENGINE: undefined },
  });
  delete r.env;
  assert.equal(r.status, 1);
  assert.match(r.stderr, /xAI API key/i);
});

test("OpenRouter payload uses Grok Eve by default", () => {
  assert.deepEqual(openrouterRequestBody("Hello there.", {}), {
    model: "x-ai/grok-voice-tts-1.0",
    input: "Hello there.",
    voice: "eve",
    response_format: "mp3",
    speed: 1,
  });
});

test("coda key openrouter saves the key and switches to Grok Eve", () => {
  const home = mkdtempSync(join(tmpdir(), "coda-key-"));
  const env = { ...process.env, CODA_HOME: home };
  delete env.OPENROUTER_API_KEY;
  delete env.CODA_ENGINE;
  const r = spawnSync(process.execPath, [CLI, "key", "openrouter", "or-test-key-not-real"], {
    encoding: "utf8",
    env,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /OpenRouter/);
  const status = spawnSync(process.execPath, [CLI, "status"], { encoding: "utf8", env });
  assert.match(status.stdout, /engine openrouter/);
  assert.match(status.stdout, /voice eve/);
});

test("coda key xai saves the key and switches engine to grok", () => {
  const home = mkdtempSync(join(tmpdir(), "coda-key-"));
  const env = { ...process.env, CODA_HOME: home };
  delete env.XAI_API_KEY;
  delete env.CODA_ENGINE;
  const r = spawnSync(process.execPath, [CLI, "key", "xai", "test-key-not-real"], {
    encoding: "utf8",
    env,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Grok/);
  const status = spawnSync(process.execPath, [CLI, "status"], { encoding: "utf8", env });
  assert.match(status.stdout, /engine grok/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
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

test("OpenRouter payload uses the picked model and voice", () => {
  assert.deepEqual(
    openrouterRequestBody("Hi.", {
      model: "google/gemini-3.1-flash-tts-preview",
      voice: "Kore",
    }),
    {
      model: "google/gemini-3.1-flash-tts-preview",
      input: "Hi.",
      voice: "Kore",
      response_format: "pcm",
      speed: 1,
    }
  );
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

test("settings key save never echoes the key", async () => {
  const home = mkdtempSync(join(tmpdir(), "coda-ui-key-"));
  const port = 20000 + (process.pid % 20000);
  const env = { ...process.env, CODA_HOME: home, CODA_UI_PORT: String(port), CODA_ENGINE: "print" };
  delete env.OPENROUTER_API_KEY;
  const child = spawn(process.execPath, [CLI, "ui", "--no-open"], { env, stdio: "ignore" });
  const secret = "sk-or-test-not-a-real-key-xyz";
  try {
    let ready = false;
    for (let i = 0; i < 200; i++) {
      try {
        const ping = await fetch(`http://127.0.0.1:${port}/api/state`);
        if (ping.ok) {
          ready = true;
          break;
        }
      } catch {
        // wait
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(ready, true, "settings server did not start");
    const before = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
    assert.equal(before.hasOpenRouterKey, false);
    assert.deepEqual(before.voiceGroups, []);
    const blocked = await fetch(`http://127.0.0.1:${port}/api/voice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "x-ai/grok-voice-tts-1.0::eve" }),
    });
    assert.equal(blocked.status, 400);
    const saved = await fetch(`http://127.0.0.1:${port}/api/key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: secret }),
    });
    const body = await saved.json();
    assert.equal(saved.status, 200, JSON.stringify(body));
    assert.equal(body.hasOpenRouterKey, true);
    assert.ok(Array.isArray(body.voiceGroups) && body.voiceGroups.length > 1);
    assert.ok(body.voiceGroups.some((g) => g.model === "x-ai/grok-voice-tts-1.0"));
    assert.ok(body.voiceGroups.some((g) => String(g.model || "").includes("/")));
    assert.ok(!JSON.stringify(body).includes(secret));
    const other = body.voiceGroups.find(
      (g) => g.model !== "x-ai/grok-voice-tts-1.0" && g.voices && g.voices[0]
    );
    assert.ok(other, "expected voices from more than the Grok model");
    const choice = other.voices[0];
    const picked = await fetch(`http://127.0.0.1:${port}/api/voice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: choice.id }),
    });
    const afterVoice = await picked.json();
    assert.equal(picked.status, 200, JSON.stringify(afterVoice));
    assert.equal(afterVoice.model, other.model);
    assert.equal(afterVoice.voice, choice.voice);
    const secretsFile = join(home, "secrets.json");
    assert.ok(existsSync(secretsFile));
    assert.match(readFileSync(secretsFile, "utf8"), /OPENROUTER_API_KEY/);
  } finally {
    child.kill();
  }
});

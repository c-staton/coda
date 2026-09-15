import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MODEL,
  allowedModel,
  fallbackVoiceGroups,
  companyLabel,
  formatVoiceChoice,
  parseVoiceKey,
  voiceKey,
} from "../src/voices.mjs";

test("voiceKey and parseVoiceKey keep model and voice together", () => {
  const id = voiceKey("google/gemini-3.1-flash-tts-preview", "Kore");
  assert.equal(id, "google/gemini-3.1-flash-tts-preview::Kore");
  assert.deepEqual(parseVoiceKey(id), {
    model: "google/gemini-3.1-flash-tts-preview",
    voice: "Kore",
  });
});

test("a bare Grok voice still maps to the Grok model", () => {
  assert.deepEqual(parseVoiceKey("eve"), { model: DEFAULT_MODEL, voice: "eve" });
});

test("fallback catalog includes Grok and Gemini", () => {
  const groups = fallbackVoiceGroups();
  const models = groups.map((g) => g.model);
  assert.deepEqual(models, [
    "x-ai/grok-voice-tts-1.0",
    "google/gemini-3.1-flash-tts-preview",
  ]);
  assert.deepEqual(
    groups.find((g) => g.model.startsWith("google/gemini")).voices.map((v) => v.voice),
    ["Kore", "Puck", "Charon", "Zephyr", "Aoede", "Fenrir"]
  );
  assert.deepEqual(groups.map((g) => g.company), ["xai", "google"]);
  assert.equal(companyLabel("x-ai/grok-voice-tts-1.0"), "xai");
  assert.equal(companyLabel("google/gemini-3.1-flash-tts-preview"), "google");
  assert.equal(formatVoiceChoice("x-ai/grok-voice-tts-1.0", "eve"), "eve · xai");
});

test("only Grok and Gemini TTS models are allowed", () => {
  assert.equal(allowedModel("x-ai/grok-voice-tts-1.0"), true);
  assert.equal(allowedModel("google/gemini-3.1-flash-tts-preview"), true);
  assert.equal(allowedModel("openai/gpt-4o-mini-tts-2025-12-15"), false);
  assert.equal(allowedModel("hexgrad/kokoro-82m"), false);
  assert.equal(allowedModel("minimax/speech-2.8-hd"), false);
  assert.equal(allowedModel("deepgram/aura-2"), false);
  assert.equal(allowedModel("sesame/csm-1b"), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeSecret, forSpeech } from "../src/secret-text.mjs";

test("looksLikeSecret catches OpenRouter and OpenAI keys", () => {
  assert.equal(looksLikeSecret("sk-or-v1-abcdefghijklmnopqrstuvwxyz"), true);
  assert.equal(looksLikeSecret("sk-abcdefghijklmnopqrstuvwxyz"), true);
  assert.equal(looksLikeSecret("Highlight this paragraph please."), false);
  assert.equal(looksLikeSecret("ask-me-later"), false);
});

test("forSpeech says code for a UUID and keeps the sentence", () => {
  assert.equal(
    forSpeech("User 550e8400-e29b-41d4-a716-446655440000 signed in."),
    "User code signed in."
  );
});

test("forSpeech says number for a long digit run", () => {
  assert.equal(
    forSpeech("Order 123456789012345 shipped today."),
    "Order number shipped today."
  );
});

test("forSpeech says code for a key instead of skipping the sentence", () => {
  assert.equal(
    forSpeech("Paste sk-or-testkeynotreal123 here."),
    "Paste code here."
  );
});

test("forSpeech leaves normal words alone", () => {
  assert.equal(forSpeech("Highlight this paragraph please."), "Highlight this paragraph please.");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeSecret } from "../src/secret-text.mjs";

test("looksLikeSecret catches OpenRouter and OpenAI keys", () => {
  assert.equal(looksLikeSecret("sk-or-v1-abcdefghijklmnopqrstuvwxyz"), true);
  assert.equal(looksLikeSecret("sk-abcdefghijklmnopqrstuvwxyz"), true);
  assert.equal(looksLikeSecret("Highlight this paragraph please."), false);
  assert.equal(looksLikeSecret("ask-me-later"), false);
});

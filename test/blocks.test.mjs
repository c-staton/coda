import { test } from "node:test";
import assert from "node:assert/strict";
import { splitBlocks } from "../src/digest.mjs";

test("splitBlocks turns paragraphs into playable pieces", () => {
  const text = [
    "First paragraph about the login change.",
    "",
    "Second paragraph about the tests.",
    "",
    "Third paragraph about what to do next.",
  ].join("\n");
  const blocks = splitBlocks(text);
  assert.equal(blocks.length, 3);
  assert.match(blocks[0], /login change/);
  assert.match(blocks[2], /what to do next/);
});

test("splitBlocks skips fenced code", () => {
  const text = "Intro line here.\n\n```js\nsecret();\n```\n\nOutro line here.";
  const blocks = splitBlocks(text);
  assert.ok(blocks.every((b) => !/secret/.test(b)));
  assert.ok(blocks.some((b) => /Intro/.test(b)));
  assert.ok(blocks.some((b) => /Outro/.test(b)));
});

test("splitBlocks breaks a long paragraph on sentences", () => {
  const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is part of a long explanation.`).join(" ");
  const blocks = splitBlocks(long, { maxBlockChars: 120 });
  assert.ok(blocks.length > 1);
  assert.ok(blocks.every((b) => b.length <= 200));
});

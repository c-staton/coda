import { test } from "node:test";
import assert from "node:assert/strict";
import { digest, extractCodaTag } from "../src/digest.mjs";

test("empty / non-string input is skipped", () => {
  assert.equal(digest(""), null);
  assert.equal(digest("   \n  "), null);
  assert.equal(digest(null), null);
  assert.equal(digest(undefined), null);
});

test("short prose is spoken verbatim", () => {
  const out = digest("All done. Tests pass.");
  assert.equal(out, "All done. Tests pass.");
});

test("<coda> tag wins over everything else", () => {
  const text = [
    "Here is a huge wall of text.",
    "```js\nconst x = 1;\n```",
    "<coda>Added the endpoint. Run the tests before deploying.</coda>",
  ].join("\n");
  assert.equal(
    digest(text),
    "Added the endpoint. Run the tests before deploying."
  );
});

test("last <coda> tag wins when multiple exist", () => {
  const text = "<coda>First.</coda> middle <coda>Second wins.</coda>";
  assert.equal(digest(text), "Second wins.");
});

test("<!-- coda: --> comment form is supported", () => {
  assert.equal(digest("stuff <!-- coda: Spoken via comment. -->"), "Spoken via comment.");
});

test("fenced code is omitted from the digest", () => {
  const text = "Summary line.\n```js\nsecret_code_should_not_be_spoken();\n```";
  const out = digest(text);
  assert.ok(!/secret_code_should_not_be_spoken/.test(out), out);
  assert.match(out, /Summary line/);
});

test("a reply that is only code is skipped", () => {
  const text = "```js\nconst a = 1;\nconst b = 2;\n```";
  assert.equal(digest(text), null);
});

test("markdown tables are stripped", () => {
  const text = "Results below.\n\n| a | b |\n| - | - |\n| 1 | 2 |";
  const out = digest(text);
  assert.ok(!out.includes("|"), out);
  assert.match(out, /Results below/);
});

test("images and links are cleaned; link label kept", () => {
  const text = "See ![diagram](x.png) the [docs](https://e.com) for more.";
  const out = digest(text);
  assert.ok(!out.includes("x.png"));
  assert.ok(!out.includes("https://e.com"));
  assert.match(out, /docs/);
});

test("speech tags dropped but numeric citations kept", () => {
  const text = "This works [laugh] according to the paper [1].";
  const out = digest(text);
  assert.ok(!/laugh/.test(out), out);
  assert.match(out, /\[1\]/);
});

test("long reply collapses to its closing sentences", () => {
  const filler = Array.from({ length: 60 }, (_, i) => `Sentence number ${i}.`).join(" ");
  const text = `${filler} The final wrap-up sentence is here.`;
  const out = digest(text, { maxChars: 120 });
  assert.ok(out.length <= 120, `len=${out.length}`);
  assert.match(out, /final wrap-up sentence/);
  assert.ok(!/Sentence number 0\./.test(out));
});

test("extractCodaTag returns null when no tag present", () => {
  assert.equal(extractCodaTag("just prose here"), null);
});

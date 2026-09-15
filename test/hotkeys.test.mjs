import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HOTKEYS, formatHotkey, formatHotkeys, normalizeHotkeys } from "../src/hotkeys.mjs";
import { decidePlayAction, sameUtterance } from "../src/player.mjs";

test("default shortcut is Control-Option-X", () => {
  assert.equal(formatHotkeys(DEFAULT_HOTKEYS).play, "Control-Option-X");
});

test("normalizeHotkeys fills the default when empty or old shape", () => {
  assert.equal(formatHotkeys({}).play, "Control-Option-X");
  assert.equal(formatHotkeys([]).play, "Control-Option-X");
});

test("normalizeHotkeys accepts ctrl/alt aliases", () => {
  const next = normalizeHotkeys({
    play: { key: "X", mods: ["ctrl", "alt"] },
  });
  assert.equal(formatHotkey(next.play), "Control-Option-X");
});

test("formatHotkey is empty for a bare letter", () => {
  assert.equal(formatHotkey({ key: "x", mods: [] }), "");
});

test("sameUtterance ignores wrapping space", () => {
  assert.equal(sameUtterance("Hello world", "  Hello   world "), true);
  assert.equal(sameUtterance("Hello world", "Hello there"), false);
  assert.equal(sameUtterance("", "Hello"), false);
});

test("decidePlayAction pauses the same clip and replaces a new one", () => {
  assert.equal(decidePlayAction({ incoming: "", current: "Hi", playing: true, paused: false }), "pause");
  assert.equal(decidePlayAction({ incoming: "Hi", current: "Hi", playing: true, paused: false }), "pause");
  assert.equal(decidePlayAction({ incoming: "Hi", current: "Hi", playing: false, paused: true }), "resume");
  assert.equal(decidePlayAction({ incoming: "New", current: "Hi", playing: true, paused: false }), "play");
  assert.equal(decidePlayAction({ incoming: "New", current: "Hi", playing: false, paused: true }), "play");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HOTKEYS,
  formatHotkey,
  formatHotkeys,
  normalizeHotkeys,
  hotkeyLabelsClash,
} from "../src/hotkeys.mjs";
import { decidePlayAction, sameUtterance } from "../src/player.mjs";

test("default shortcuts are queue Down, play Left, skip Right", () => {
  assert.equal(formatHotkeys(DEFAULT_HOTKEYS).queue, "Control-Option-Down");
  assert.equal(formatHotkeys(DEFAULT_HOTKEYS).play, "Control-Option-Left");
  assert.equal(formatHotkeys(DEFAULT_HOTKEYS).skip, "Control-Option-Right");
});

test("normalizeHotkeys fills the default when empty or old shape", () => {
  assert.equal(formatHotkeys({}).queue, "Control-Option-Down");
  assert.equal(formatHotkeys({}).play, "Control-Option-Left");
  assert.equal(formatHotkeys({}).skip, "Control-Option-Right");
  assert.equal(formatHotkeys([]).queue, "Control-Option-Down");
  assert.equal(formatHotkeys([]).skip, "Control-Option-Right");
});

test("normalizeHotkeys moves the old X/P defaults onto the arrows", () => {
  const next = normalizeHotkeys({
    play: { key: "x", mods: ["control", "option"] },
    pause: { key: "p", mods: ["control", "option"] },
  });
  assert.equal(formatHotkey(next.queue), "Control-Option-Down");
  assert.equal(formatHotkey(next.play), "Control-Option-Left");
  assert.equal(formatHotkey(next.skip), "Control-Option-Right");
});

test("normalizeHotkeys swaps the previous Left/Down defaults", () => {
  const next = normalizeHotkeys({
    queue: { key: "left", mods: ["control", "option"] },
    play: { key: "down", mods: ["control", "option"] },
    skip: { key: "right", mods: ["control", "option"] },
  });
  assert.equal(formatHotkey(next.queue), "Control-Option-Down");
  assert.equal(formatHotkey(next.play), "Control-Option-Left");
});

test("normalizeHotkeys keeps a custom shortcut", () => {
  const next = normalizeHotkeys({
    play: { key: "j", mods: ["control", "option"] },
    skip: { key: "ArrowRight", mods: ["control", "option"] },
  });
  assert.equal(formatHotkey(next.play), "Control-Option-J");
  assert.equal(formatHotkey(next.queue), "Control-Option-Down");
  assert.equal(formatHotkey(next.skip), "Control-Option-Right");
});

test("normalizeHotkeys accepts ctrl/alt aliases and arrow names", () => {
  const next = normalizeHotkeys({
    play: { key: "Down", mods: ["ctrl", "alt"] },
    skip: { key: "ArrowRight", mods: ["control", "option"] },
  });
  assert.equal(formatHotkey(next.play), "Control-Option-Down");
  assert.equal(formatHotkey(next.skip), "Control-Option-Right");
});

test("formatHotkey is empty for a bare letter", () => {
  assert.equal(formatHotkey({ key: "x", mods: [] }), "");
});

test("hotkeyLabelsClash catches two actions on the same keys", () => {
  assert.equal(hotkeyLabelsClash({ queue: "Control-Option-Left", play: "Control-Option-Down", skip: "Control-Option-Right" }), false);
  assert.equal(hotkeyLabelsClash({ queue: "Control-Option-Left", play: "Control-Option-Left", skip: "Control-Option-Right" }), true);
});

test("sameUtterance ignores wrapping space", () => {
  assert.equal(sameUtterance("Hello world", "  Hello   world "), true);
  assert.equal(sameUtterance("Hello world", "Hello there"), false);
  assert.equal(sameUtterance("", "Hello"), false);
  assert.equal(sameUtterance("Hello world from Coda", "Hello world from Coda today"), true);
});

test("decidePlayAction queues when something is already going", () => {
  assert.equal(decidePlayAction({ incoming: "Hi", playing: true, paused: false }), "queue");
  assert.equal(decidePlayAction({ incoming: "Hi", playing: false, paused: true }), "queue");
  assert.equal(decidePlayAction({ incoming: "Hi", playing: false, paused: false, loading: true }), "queue");
  assert.equal(decidePlayAction({ incoming: "Hi", running: true }), "queue");
  assert.equal(decidePlayAction({ incoming: "New", playing: false, paused: false }), "play");
  assert.equal(decidePlayAction({ incoming: "", playing: true, paused: false }), "none");
});

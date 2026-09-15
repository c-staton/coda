// Shortcuts. Stored in ~/.coda/config.json.

export const HOTKEY_ACTIONS = ["queue", "play", "skip"];

export const DEFAULT_HOTKEYS = {
  queue: { key: "down", mods: ["control", "option"] },
  play: { key: "left", mods: ["control", "option"] },
  skip: { key: "right", mods: ["control", "option"] },
};

// Old letter defaults. Treat these as unset so we can move everyone onto the arrows.
const LEGACY_DEFAULT_HOTKEYS = {
  play: { key: "x", mods: ["control", "option"] },
  pause: { key: "p", mods: ["control", "option"] },
  skip: { key: "right", mods: ["control", "option"] },
};

const PREVIOUS_ARROW_HOTKEYS = {
  queue: { key: "left", mods: ["control", "option"] },
  play: { key: "down", mods: ["control", "option"] },
  skip: { key: "right", mods: ["control", "option"] },
};

const MOD_ORDER = ["control", "option", "shift", "command"];
const MOD_LABEL = {
  control: "Control",
  option: "Option",
  shift: "Shift",
  command: "Command",
};

const SPECIAL_KEYS = {
  right: "right",
  left: "left",
  up: "up",
  down: "down",
  arrowright: "right",
  arrowleft: "left",
  arrowup: "up",
  arrowdown: "down",
  "arrow-right": "right",
  "arrow-left": "left",
  "arrow-up": "up",
  "arrow-down": "down",
};

const KEY_LABEL = {
  right: "Right",
  left: "Left",
  up: "Up",
  down: "Down",
};

function cleanMods(mods) {
  const set = new Set();
  for (const raw of Array.isArray(mods) ? mods : []) {
    const m = String(raw || "").toLowerCase();
    if (m === "ctrl" || m === "control") set.add("control");
    else if (m === "alt" || m === "option") set.add("option");
    else if (m === "shift") set.add("shift");
    else if (m === "cmd" || m === "meta" || m === "command") set.add("command");
  }
  return MOD_ORDER.filter((m) => set.has(m));
}

function cleanKey(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (SPECIAL_KEYS[key]) return SPECIAL_KEYS[key];
  if (/^[a-z0-9]$/.test(key)) return key;
  return "";
}

export function normalizeHotkey(raw) {
  if (!raw || typeof raw !== "object") return null;
  const key = cleanKey(raw.key);
  if (!key) return null;
  const mods = cleanMods(raw.mods);
  if (!mods.length) return null;
  return { key, mods };
}

function copyHotkey(hk) {
  return { key: hk.key, mods: [...hk.mods] };
}

export function sameHotkey(a, b) {
  const left = normalizeHotkey(a);
  const right = normalizeHotkey(b);
  if (!left || !right) return false;
  return left.key === right.key && left.mods.join("+") === right.mods.join("+");
}

function isLegacyLetterHotkeys(src) {
  const play = normalizeHotkey(src.play);
  const pause = normalizeHotkey(src.pause);
  if (!play && !pause) return false;
  if (play && !sameHotkey(play, LEGACY_DEFAULT_HOTKEYS.play)) return false;
  if (pause && !sameHotkey(pause, LEGACY_DEFAULT_HOTKEYS.pause)) return false;
  return true;
}

function isPreviousArrowHotkeys(src) {
  const queue = normalizeHotkey(src.queue) || normalizeHotkey(src.pause);
  const play = normalizeHotkey(src.play);
  const skip = normalizeHotkey(src.skip);
  if (!queue || !play) return false;
  if (!sameHotkey(queue, PREVIOUS_ARROW_HOTKEYS.queue)) return false;
  if (!sameHotkey(play, PREVIOUS_ARROW_HOTKEYS.play)) return false;
  if (skip && !sameHotkey(skip, PREVIOUS_ARROW_HOTKEYS.skip)) return false;
  return true;
}

export function normalizeHotkeys(raw) {
  const src = raw && !Array.isArray(raw) && typeof raw === "object" ? raw : {};
  if (isLegacyLetterHotkeys(src) || isPreviousArrowHotkeys(src)) {
    return {
      queue: copyHotkey(DEFAULT_HOTKEYS.queue),
      play: copyHotkey(DEFAULT_HOTKEYS.play),
      skip: copyHotkey(DEFAULT_HOTKEYS.skip),
    };
  }
  return {
    queue: normalizeHotkey(src.queue) || normalizeHotkey(src.pause) || copyHotkey(DEFAULT_HOTKEYS.queue),
    play: normalizeHotkey(src.play) || copyHotkey(DEFAULT_HOTKEYS.play),
    skip: normalizeHotkey(src.skip) || copyHotkey(DEFAULT_HOTKEYS.skip),
  };
}

export function formatHotkey(hk) {
  const n = normalizeHotkey(hk);
  if (!n) return "";
  const key = KEY_LABEL[n.key] || n.key.toUpperCase();
  return `${n.mods.map((m) => MOD_LABEL[m]).join("-")}-${key}`;
}

export function formatHotkeys(raw) {
  const n = normalizeHotkeys(raw);
  return { queue: formatHotkey(n.queue), play: formatHotkey(n.play), skip: formatHotkey(n.skip) };
}

export function hotkeyLabelsClash(labels) {
  const vals = Object.values(labels || {}).filter(Boolean);
  return new Set(vals).size !== vals.length;
}

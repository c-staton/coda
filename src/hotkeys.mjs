// One shortcut. Stored in ~/.coda/config.json.

export const HOTKEY_ACTIONS = ["play"];

export const DEFAULT_HOTKEYS = {
  play: { key: "x", mods: ["control", "option"] },
};

const MOD_ORDER = ["control", "option", "shift", "command"];
const MOD_LABEL = {
  control: "Control",
  option: "Option",
  shift: "Shift",
  command: "Command",
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

export function normalizeHotkey(raw) {
  if (!raw || typeof raw !== "object") return null;
  const key = String(raw.key || "").trim().toLowerCase();
  if (!/^[a-z0-9]$/.test(key)) return null;
  const mods = cleanMods(raw.mods);
  if (!mods.length) return null;
  return { key, mods };
}

function copyHotkey(hk) {
  return { key: hk.key, mods: [...hk.mods] };
}

export function normalizeHotkeys(raw) {
  const src = raw && !Array.isArray(raw) && typeof raw === "object" ? raw : {};
  return {
    play: normalizeHotkey(src.play) || copyHotkey(DEFAULT_HOTKEYS.play),
  };
}

export function formatHotkey(hk) {
  const n = normalizeHotkey(hk);
  if (!n) return "";
  return `${n.mods.map((m) => MOD_LABEL[m]).join("-")}-${n.key.toUpperCase()}`;
}

export function formatHotkeys(raw) {
  const n = normalizeHotkeys(raw);
  return { play: formatHotkey(n.play) };
}

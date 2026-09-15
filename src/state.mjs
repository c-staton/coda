// Persistent state + config in ~/.coda. Dependency-free.
import { homedir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { DEFAULT_HOTKEYS, normalizeHotkeys } from "./hotkeys.mjs";

const CODA_DIR = process.env.CODA_HOME || join(homedir(), ".coda");
const STATE_PATH = join(CODA_DIR, "state.json");
const CONFIG_PATH = join(CODA_DIR, "config.json");

const DEFAULT_STATE = {
  listening: true,
  lastDigest: "",
  lastSpokenAt: null,
  lastAudioPath: null,
  playerPid: null,
  paused: false,
  history: [],
  lastText: "",
  blocks: [],
  blockIndex: 0,
  follow: false,
};

const DEFAULT_CONFIG = {
  engine: "auto", // auto | apple | espeak | grok | openai | openrouter | print
  voice: "eve",
  model: "x-ai/grok-voice-tts-1.0",
  language: "auto",
  speed: 1.0,
  maxChars: 800,
  hotkeys: DEFAULT_HOTKEYS,
};

function ensureDir() {
  if (!existsSync(CODA_DIR)) mkdirSync(CODA_DIR, { recursive: true });
}

function readJson(path, fallback) {
  try {
    if (!existsSync(path)) return { ...fallback };
    const raw = readFileSync(path, "utf8");
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return { ...fallback };
  }
}

function writeJson(path, data) {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function getState() {
  return readJson(STATE_PATH, DEFAULT_STATE);
}

export function setState(patch) {
  const next = { ...getState(), ...patch };
  writeJson(STATE_PATH, next);
  return next;
}

export function getConfig() {
  const fromFile = readJson(CONFIG_PATH, DEFAULT_CONFIG);
  // env overrides file for a couple of common knobs
  if (process.env.CODA_ENGINE) fromFile.engine = process.env.CODA_ENGINE;
  if (process.env.CODA_VOICE) fromFile.voice = process.env.CODA_VOICE;
  fromFile.hotkeys = normalizeHotkeys(fromFile.hotkeys);
  return fromFile;
}

export function setConfig(patch) {
  const next = { ...getConfig(), ...patch };
  if (patch && Object.prototype.hasOwnProperty.call(patch, "hotkeys")) {
    next.hotkeys = normalizeHotkeys(patch.hotkeys);
  } else {
    next.hotkeys = normalizeHotkeys(next.hotkeys);
  }
  writeJson(CONFIG_PATH, next);
  return next;
}

export function rememberReply(text, blocks) {
  return setState({
    lastText: String(text || ""),
    blocks: Array.isArray(blocks) ? blocks : [],
    blockIndex: 0,
  });
}

export function rememberSpoken(text) {
  const spoken = String(text || "").trim();
  if (!spoken) return getState();
  const s = getState();
  const history = Array.isArray(s.history) ? s.history.slice() : [];
  if (!history[0] || history[0].text !== spoken) {
    history.unshift({ text: spoken, at: new Date().toISOString() });
  }
  return setState({
    lastDigest: spoken,
    lastSpokenAt: new Date().toISOString(),
    history: history.slice(0, 12),
  });
}

export const paths = {
  CODA_DIR,
  STATE_PATH,
  CONFIG_PATH,
  PLAYBACK_PATH: join(CODA_DIR, "playback.json"),
  GRAB_CMD_PATH: join(CODA_DIR, "grab-cmd.json"),
  LAST_GRAB_PATH: join(CODA_DIR, "last-grab.json"),
};

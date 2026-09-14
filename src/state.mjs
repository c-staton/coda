// Persistent state + config in ~/.coda. Dependency-free.
import { homedir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";

const CODA_DIR = process.env.CODA_HOME || join(homedir(), ".coda");
const STATE_PATH = join(CODA_DIR, "state.json");
const CONFIG_PATH = join(CODA_DIR, "config.json");

const DEFAULT_STATE = {
  listening: true,
  lastDigest: "",
  lastSpokenAt: null,
  playerPid: null,
};

const DEFAULT_CONFIG = {
  engine: "auto", // auto | apple | espeak | grok | openai | print
  voice: "eve",
  language: "auto",
  speed: 1.0,
  maxChars: 800,
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
  return fromFile;
}

export function setConfig(patch) {
  const next = { ...getConfig(), ...patch };
  writeJson(CONFIG_PATH, next);
  return next;
}

export const paths = { CODA_DIR, STATE_PATH, CONFIG_PATH };

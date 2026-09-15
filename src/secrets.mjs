// Local secrets for TTS keys. Lives in ~/.coda/secrets.json (mode 600).
// Never commit this file.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./state.mjs";

const SECRETS_PATH = join(paths.CODA_DIR, "secrets.json");

const KEY_NAMES = {
  xai: "XAI_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

function readSecrets() {
  try {
    if (!existsSync(SECRETS_PATH)) return {};
    return JSON.parse(readFileSync(SECRETS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeSecrets(data) {
  mkdirSync(paths.CODA_DIR, { recursive: true });
  writeFileSync(SECRETS_PATH, JSON.stringify(data, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    chmodSync(SECRETS_PATH, 0o600);
  } catch {
    // ignore on filesystems that don't support chmod
  }
}

export function getApiKey(kind) {
  const name = KEY_NAMES[kind];
  if (!name) return "";
  const fromEnv = process.env[name];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const fromFile = readSecrets()[name];
  return typeof fromFile === "string" ? fromFile.trim() : "";
}

export function setApiKey(kind, value) {
  const name = KEY_NAMES[kind];
  if (!name) throw new Error(`unknown key kind "${kind}" (use openrouter, xai, or openai)`);
  const trimmed = String(value || "").trim();
  if (!trimmed) throw new Error("key cannot be empty");
  const next = { ...readSecrets(), [name]: trimmed };
  writeSecrets(next);
  return { name, path: SECRETS_PATH };
}

export function hasApiKey(kind) {
  return Boolean(getApiKey(kind));
}

export function clearApiKey(kind) {
  const name = KEY_NAMES[kind];
  if (!name) throw new Error(`unknown key kind "${kind}"`);
  const next = { ...readSecrets() };
  delete next[name];
  writeSecrets(next);
  return { name, path: SECRETS_PATH };
}

export const secretPaths = { SECRETS_PATH, KEY_NAMES };

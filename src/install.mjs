// One-command install/uninstall of the Coda user-level Cursor hook.
//
// Wires ~/.cursor/hooks.json so Coda speaks after every finished assistant
// reply, in every project, without installing the plugin per repo. Idempotent
// and non-destructive: it merges into any existing hooks and never drops other
// entries.
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

// Absolute path to the hook entrypoint Cursor will run.
export function hookScriptPath() {
  return resolve(join(here, "..", "scripts", "after-agent-response.mjs"));
}

function cursorDir() {
  return process.env.CODA_CURSOR_DIR || join(homedir(), ".cursor");
}

export function hooksFilePath() {
  return process.env.CODA_HOOKS_FILE || join(cursorDir(), "hooks.json");
}

function hookCommand() {
  return `node "${hookScriptPath()}"`;
}

function readHooks(path) {
  if (!existsSync(path)) return { version: 1, hooks: {} };
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return { version: 1, hooks: {} };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Never clobber a config we can't understand.
    throw new Error(
      `Your ${path} is not valid JSON. Fix or remove it, then run install again.`
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Your ${path} is not a JSON object. Fix it, then retry.`);
  }
  parsed.version = parsed.version || 1;
  parsed.hooks = parsed.hooks || {};
  return parsed;
}

function writeHooks(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function isCodaEntry(entry) {
  return (
    entry &&
    typeof entry.command === "string" &&
    entry.command.includes("after-agent-response.mjs")
  );
}

export function installHook() {
  const path = hooksFilePath();
  const config = readHooks(path);
  const list = Array.isArray(config.hooks.afterAgentResponse)
    ? config.hooks.afterAgentResponse
    : [];

  const already = list.some(isCodaEntry);
  if (!already) list.push({ command: hookCommand() });
  config.hooks.afterAgentResponse = list;

  writeHooks(path, config);
  return { path, command: hookCommand(), alreadyInstalled: already };
}

export function uninstallHook() {
  const path = hooksFilePath();
  if (!existsSync(path)) return { path, removed: 0, existed: false };

  const config = readHooks(path);
  const list = Array.isArray(config.hooks.afterAgentResponse)
    ? config.hooks.afterAgentResponse
    : [];
  const kept = list.filter((e) => !isCodaEntry(e));
  const removed = list.length - kept.length;

  if (kept.length) config.hooks.afterAgentResponse = kept;
  else delete config.hooks.afterAgentResponse;

  writeHooks(path, config);
  return { path, removed, existed: true };
}

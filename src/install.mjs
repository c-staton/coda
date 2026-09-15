// Install Coda on this machine: remember where the repo lives, build the
// Mac menu app, and optionally wire the (quiet) Cursor hook.
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  copyFileSync,
} from "node:fs";
import { paths } from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export function repoRoot() {
  return resolve(join(here, ".."));
}

export function hookScriptPath() {
  return resolve(join(here, "..", "scripts", "after-agent-response.mjs"));
}

export function cliPath() {
  return resolve(join(here, "cli.mjs"));
}

export function swiftSourcePath() {
  return resolve(join(here, "..", "apps", "macos", "CodaBar.swift"));
}

export function menuIconPath() {
  return resolve(join(here, "..", "apps", "macos", "MenuIcon.png"));
}

export function codaBarBinPath() {
  return join(paths.CODA_DIR, "bin", "CodaBar");
}

export function installPathsFile() {
  return join(paths.CODA_DIR, "paths.json");
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

export function writeInstallPaths() {
  mkdirSync(paths.CODA_DIR, { recursive: true });
  const rec = {
    node: process.execPath,
    cli: cliPath(),
    repo: repoRoot(),
  };
  writeFileSync(installPathsFile(), JSON.stringify(rec, null, 2) + "\n", "utf8");
  return rec;
}

function which(cmd) {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim() : "";
}

export function installMacApp() {
  if (process.platform !== "darwin") {
    return { skipped: true, reason: "Coda is a Mac app." };
  }
  if (process.env.CODA_SKIP_APP === "1") {
    return { skipped: true, reason: "skipped" };
  }
  const src = swiftSourcePath();
  if (!existsSync(src)) {
    return { ok: false, reason: `missing ${src}` };
  }
  const swiftc = which("swiftc");
  if (!swiftc) {
    return {
      ok: false,
      reason:
        "Need Apple’s command line tools to build the menu app.\n  Run: xcode-select --install",
    };
  }
  const bin = codaBarBinPath();
  mkdirSync(dirname(bin), { recursive: true });
  const already = existsSync(bin);
  const r = spawnSync(
    swiftc,
    [
      "-O",
      "-o",
      bin,
      src,
      "-framework",
      "AppKit",
      "-framework",
      "ApplicationServices",
      "-framework",
      "Carbon",
      "-framework",
      "AVFoundation",
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    return {
      ok: false,
      reason: (r.stderr || r.stdout || "could not build the menu app").trim(),
    };
  }
  try {
    chmodSync(bin, 0o755);
  } catch {
    // ignore
  }
  const icon = menuIconPath();
  if (existsSync(icon)) {
    try {
      copyFileSync(icon, join(dirname(bin), "MenuIcon.png"));
    } catch {
      // icon is optional; the menu still works
    }
  }
  spawnSync("pkill", ["-f", bin], { stdio: "ignore" });
  spawnSync("open", [bin], { stdio: "ignore" });
  addLoginItem(bin);
  return { ok: true, bin, already };
}

function addLoginItem(appPath) {
  if (process.platform !== "darwin") return;
  spawnSync(
    "osascript",
    [
      "-e",
      `tell application "System Events"
        if (count of (every login item whose path is "${appPath}")) is 0 then
          make login item at end with properties {path:"${appPath}", hidden:true}
        end if
      end tell`,
    ],
    { stdio: "ignore" }
  );
}

function removeLoginItem(appPath) {
  if (process.platform !== "darwin") return;
  spawnSync(
    "osascript",
    [
      "-e",
      `tell application "System Events" to delete (every login item whose path is "${appPath}")`,
    ],
    { stdio: "ignore" }
  );
}

export function uninstallMacApp() {
  const bin = codaBarBinPath();
  const existed = existsSync(bin);
  if (existed) {
    spawnSync("pkill", ["-f", bin], { stdio: "ignore" });
    removeLoginItem(bin);
  }
  return { existed, bin };
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

export function installAll({ cursor = false } = {}) {
  const written = writeInstallPaths();
  const app = installMacApp();
  const hook = cursor ? installHook() : null;
  return { paths: written, app, hook };
}

export function uninstallAll() {
  const hook = uninstallHook();
  const app = uninstallMacApp();
  return { hook, app };
}

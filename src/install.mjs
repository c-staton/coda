// Install Coda on this machine: remember where the repo lives and build Coda.app.
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
  rmSync,
} from "node:fs";
import { paths } from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export function repoRoot() {
  return resolve(join(here, ".."));
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

export function markPath() {
  return resolve(join(here, "..", "apps", "macos", "Mark.png"));
}

export function infoPlistPath() {
  return resolve(join(here, "..", "apps", "macos", "Info.plist"));
}

export function legacyCodaBarBinPath() {
  return join(paths.CODA_DIR, "bin", "CodaBar");
}

// Real installs go in ~/Applications so Accessibility shows Coda, not Terminal.
// Tests set CODA_HOME and stay inside that folder.
export function codaAppPath() {
  if (process.env.CODA_APP) return process.env.CODA_APP;
  if (process.env.CODA_HOME) return join(process.env.CODA_HOME, "Coda.app");
  return join(homedir(), "Applications", "Coda.app");
}

export function codaBarBinPath() {
  return join(codaAppPath(), "Contents", "MacOS", "Coda");
}

export function installedCodaBin() {
  if (process.env.CODA_CAPTURE_BIN) return process.env.CODA_CAPTURE_BIN;
  const bundled = codaBarBinPath();
  if (existsSync(bundled)) return bundled;
  return legacyCodaBarBinPath();
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
    app: codaAppPath(),
    bin: codaBarBinPath(),
  };
  writeFileSync(installPathsFile(), JSON.stringify(rec, null, 2) + "\n", "utf8");
  return rec;
}

function which(cmd) {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim() : "";
}

function runCapture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) return "";
  return (r.stdout || "").trim();
}

export function nodeArchToMacArch(arch) {
  if (arch === "arm64") return "arm64";
  if (arch === "x64" || arch === "x86_64") return "x86_64";
  return "";
}

export function hostMacArch() {
  return nodeArchToMacArch(runCapture("uname", ["-m"])) || nodeArchToMacArch(process.arch);
}

export function compareMacVersions(a, b) {
  const ap = String(a || "0")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const bp = String(b || "0")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const av = ap[i] || 0;
    const bv = bp[i] || 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

export function macDeploymentVersion(hostVersion, sdkVersion) {
  if (hostVersion && sdkVersion) {
    return compareMacVersions(hostVersion, sdkVersion) <= 0 ? hostVersion : sdkVersion;
  }
  return hostVersion || sdkVersion || "";
}

export function swiftTargetTriple(arch, version) {
  return `${arch}-apple-macosx${version}`;
}

export function duplicateSwiftBridgingMap(swiftIncludeDir) {
  if (!swiftIncludeDir) return "";
  const oldMap = join(swiftIncludeDir, "module.modulemap");
  const newMap = join(swiftIncludeDir, "bridging.modulemap");
  if (!existsSync(oldMap) || !existsSync(newMap)) return "";
  const oldTxt = readFileSync(oldMap, "utf8");
  const newTxt = readFileSync(newMap, "utf8");
  if (oldTxt.includes("module SwiftBridging") && newTxt.includes("module SwiftBridging")) {
    return oldMap;
  }
  return "";
}

export function writeSwiftBridgingOverlay(staleMapPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const emptyPath = join(destDir, "empty.modulemap");
  const overlayPath = join(destDir, "swift-bridging.vfsoverlay.json");
  writeFileSync(emptyPath, "", "utf8");
  writeFileSync(
    overlayPath,
    JSON.stringify({
      version: 0,
      "case-sensitive": false,
      roots: [
        {
          type: "directory",
          name: dirname(staleMapPath),
          contents: [
            {
              type: "file",
              name: "module.modulemap",
              "external-contents": emptyPath,
            },
          ],
        },
      ],
    }) + "\n",
    "utf8"
  );
  return overlayPath;
}

export function swiftcBuildArgs({ src, out, sdkPath, triple, overlayPath }) {
  const args = ["-O"];
  if (sdkPath) args.push("-sdk", sdkPath);
  if (triple) args.push("-target", triple);
  if (overlayPath) {
    args.push("-vfsoverlay", overlayPath, "-Xcc", "-ivfsoverlay", "-Xcc", overlayPath);
  }
  args.push(
    "-o",
    out,
    src,
    "-framework",
    "AppKit",
    "-framework",
    "ApplicationServices",
    "-framework",
    "Carbon",
    "-framework",
    "AVFoundation"
  );
  return args;
}

function findSwiftc() {
  return runCapture("xcrun", ["--sdk", "macosx", "--find", "swiftc"]) || which("swiftc");
}

function findMacSdkPath() {
  return runCapture("xcrun", ["--sdk", "macosx", "--show-sdk-path"]);
}

function findMacSdkVersion() {
  return runCapture("xcrun", ["--sdk", "macosx", "--show-sdk-version"]);
}

function hostMacVersion() {
  return runCapture("sw_vers", ["-productVersion"]);
}

function swiftIncludeDir(swiftcPath) {
  return resolve(join(dirname(swiftcPath), "..", "include", "swift"));
}

function summarizeSwiftcError(stderr) {
  const text = (stderr || "").trim();
  if (!text) return "could not build the menu app";
  const errors = text.split("\n").filter((l) => l.includes("error:"));
  const excerpt = (errors.length ? errors : text.split("\n")).slice(0, 12).join("\n");
  if (text.includes("redefinition of module 'SwiftBridging'")) {
    return (
      excerpt +
      "\n\nApple’s command line tools left two SwiftBridging files. Reinstall them:\n" +
      "  sudo rm -rf /Library/Developer/CommandLineTools\n" +
      "  xcode-select --install"
    );
  }
  if (/this SDK is not supported by the compiler/i.test(text)) {
    return (
      excerpt +
      "\n\nThe Mac SDK and Swift compiler do not match. Reinstall the command line tools:\n" +
      "  sudo rm -rf /Library/Developer/CommandLineTools\n" +
      "  xcode-select --install"
    );
  }
  return excerpt;
}

export function writeCodaAppBundle({ dest, executable }) {
  const macos = join(dest, "Contents", "MacOS");
  const resources = join(dest, "Contents", "Resources");
  mkdirSync(macos, { recursive: true });
  mkdirSync(resources, { recursive: true });
  copyFileSync(infoPlistPath(), join(dest, "Contents", "Info.plist"));
  const bin = join(macos, "Coda");
  copyFileSync(executable, bin);
  chmodSync(bin, 0o755);
  const menu = menuIconPath();
  if (existsSync(menu)) copyFileSync(menu, join(resources, "MenuIcon.png"));
  writeAppIcon(resources);
  return { app: dest, bin };
}

function writeAppIcon(resourcesDir) {
  const src = markPath();
  if (!existsSync(src)) return;
  copyFileSync(src, join(resourcesDir, "AppIcon.png"));
  if (process.platform !== "darwin") return;
  const iconset = join(resourcesDir, "AppIcon.iconset");
  mkdirSync(iconset, { recursive: true });
  const sizes = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [px, name] of sizes) {
    spawnSync("sips", ["-z", String(px), String(px), src, "--out", join(iconset, name)], {
      stdio: "ignore",
    });
  }
  spawnSync("iconutil", ["-c", "icns", iconset, "-o", join(resourcesDir, "AppIcon.icns")], {
    stdio: "ignore",
  });
  rmSync(iconset, { recursive: true, force: true });
}

function stopCodaProcesses() {
  for (const bin of [codaBarBinPath(), legacyCodaBarBinPath()]) {
    spawnSync("pkill", ["-f", bin], { stdio: "ignore" });
  }
  spawnSync("pkill", ["-f", "cli.mjs ui"], { stdio: "ignore" });
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
  const swiftc = findSwiftc();
  if (!swiftc) {
    return {
      ok: false,
      reason:
        "Need Apple’s command line tools to build the menu app.\n  Run: xcode-select --install",
    };
  }
  const arch = hostMacArch();
  if (!arch) {
    return {
      ok: false,
      reason: `This Mac’s CPU (${process.arch}) is not supported. Coda builds for Intel (x86_64) and Apple silicon (arm64).`,
    };
  }
  const sdkPath = findMacSdkPath();
  if (!sdkPath) {
    return {
      ok: false,
      reason:
        "Need Apple’s command line tools to build the menu app.\n  Run: xcode-select --install",
    };
  }
  const deployment = macDeploymentVersion(hostMacVersion(), findMacSdkVersion());
  const triple = deployment ? swiftTargetTriple(arch, deployment) : "";
  const buildDir = join(paths.CODA_DIR, "build");
  mkdirSync(buildDir, { recursive: true });
  const stale = duplicateSwiftBridgingMap(swiftIncludeDir(swiftc));
  const overlayPath = stale ? writeSwiftBridgingOverlay(stale, buildDir) : "";
  const app = codaAppPath();
  const already = existsSync(app);
  const stage = join(buildDir, "Coda");
  const r = spawnSync(swiftc, swiftcBuildArgs({ src, out: stage, sdkPath, triple, overlayPath }), {
    encoding: "utf8",
    env: { ...process.env, SDKROOT: sdkPath },
  });
  if (r.status !== 0) {
    return {
      ok: false,
      reason: summarizeSwiftcError(r.stderr || r.stdout),
    };
  }
  stopCodaProcesses();
  if (existsSync(app)) rmSync(app, { recursive: true, force: true });
  mkdirSync(dirname(app), { recursive: true });
  const written = writeCodaAppBundle({ dest: app, executable: stage });
  spawnSync("xattr", ["-cr", app], { stdio: "ignore" });
  spawnSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "ignore" });
  const legacy = legacyCodaBarBinPath();
  if (existsSync(legacy)) {
    removeLoginItem(legacy);
    rmSync(legacy, { force: true });
  }
  spawnSync("open", [app], { stdio: "ignore" });
  addLoginItem(app);
  return { ok: true, app: written.app, bin: written.bin, already };
}

function quoteApple(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function addLoginItem(appPath) {
  if (process.platform !== "darwin") return;
  const path = quoteApple(appPath);
  spawnSync(
    "osascript",
    [
      "-e",
      `tell application "System Events"
        if (count of (every login item whose path is "${path}")) is 0 then
          make login item at end with properties {path:"${path}", hidden:true}
        end if
      end tell`,
    ],
    { stdio: "ignore" }
  );
}

function removeLoginItem(appPath) {
  if (process.platform !== "darwin") return;
  const path = quoteApple(appPath);
  spawnSync(
    "osascript",
    [
      "-e",
      `tell application "System Events" to delete (every login item whose path is "${path}")`,
    ],
    { stdio: "ignore" }
  );
}

export function uninstallMacApp() {
  const app = codaAppPath();
  const bin = codaBarBinPath();
  const legacy = legacyCodaBarBinPath();
  const existed = existsSync(app) || existsSync(legacy);
  stopCodaProcesses();
  if (existsSync(app)) {
    removeLoginItem(app);
    rmSync(app, { recursive: true, force: true });
  }
  if (existsSync(legacy)) {
    removeLoginItem(legacy);
    rmSync(legacy, { force: true });
  }
  return { existed, app, bin };
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

export function installAll() {
  const written = writeInstallPaths();
  const app = installMacApp();
  return { paths: written, app };
}

export function uninstallAll() {
  const hook = uninstallHook();
  const app = uninstallMacApp();
  return { hook, app };
}

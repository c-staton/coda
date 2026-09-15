// Ask the running Coda app to read the current highlight.
// Do not spawn Coda from Node. That makes macOS ask for Node’s Accessibility.
import { writeFileSync, readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { installedCodaBin } from "./install.mjs";
import { paths } from "./state.mjs";

export function captureBin() {
  return installedCodaBin();
}

function emptyGrab(note) {
  return { ok: false, method: "", text: "", app: "", note };
}

function readGrab() {
  try {
    return JSON.parse(readFileSync(paths.LAST_GRAB_PATH, "utf8"));
  } catch {
    return null;
  }
}

function grabMtime() {
  try {
    return statSync(paths.LAST_GRAB_PATH).mtimeMs;
  } catch {
    return 0;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function grabScreen() {
  if (!existsSync(captureBin())) {
    return emptyGrab("Coda menu app is not installed");
  }
  mkdirSync(paths.CODA_DIR, { recursive: true });
  const before = grabMtime();
  const id = Date.now() / 1000;
  writeFileSync(paths.GRAB_CMD_PATH, JSON.stringify({ id }) + "\n", "utf8");
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if (grabMtime() > before) {
      const parsed = readGrab();
      if (parsed) {
        return {
          ok: Boolean(parsed.ok && parsed.text),
          method: parsed.method || "",
          text: parsed.text || "",
          app: parsed.app || "",
          note: parsed.note || "",
        };
      }
    }
    sleep(40);
  }
  return emptyGrab("Coda did not read the highlight. Is the menu app running?");
}

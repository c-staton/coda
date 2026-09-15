// Talk to the Mac grabber (any app: highlight, copy, or words under the mouse).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { installedCodaBin } from "./install.mjs";

export function captureBin() {
  return installedCodaBin();
}

export function grabScreen(mode = "auto") {
  const bin = captureBin();
  if (!existsSync(bin)) {
    return {
      ok: false,
      method: "",
      text: "",
      app: "",
      note: "Coda menu app is not installed",
    };
  }
  const r = spawnSync(bin, ["--grab", "selection"], {
    encoding: "utf8",
    timeout: 10000,
  });
  try {
    const parsed = JSON.parse((r.stdout || "").trim().split("\n").filter(Boolean).pop() || "{}");
    return {
      ok: Boolean(parsed.ok && parsed.text),
      method: parsed.method || "",
      text: parsed.text || "",
      app: parsed.app || "",
      note: parsed.note || r.stderr || "",
    };
  } catch {
    return {
      ok: false,
      method: "",
      text: "",
      app: "",
      note: (r.stderr || r.stdout || "grab failed").slice(0, 240),
    };
  }
}

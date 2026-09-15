// Sequential block playback for the settings window.
// Click a block to play just that one, or "from here" to keep going.
import { speak, playbackStatus, stopCurrent, pauseCurrent, resumeCurrent } from "./tts.mjs";
import { getState, setState, getConfig, rememberSpoken, rememberReply, paths } from "./state.mjs";
import { splitBlocks } from "./digest.mjs";
import { grabScreen } from "./grab.mjs";
import { looksLikeSecret } from "./secret-text.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let cancelled = false;
let running = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntilUtteranceOver() {
  // Give afplay a moment to spawn and record a pid.
  await sleep(250);
  for (;;) {
    if (cancelled) return;
    const p = playbackStatus();
    if (p.paused) {
      await sleep(200);
      continue;
    }
    if (!p.playing) return;
    await sleep(200);
  }
}

export function cancelFollow() {
  cancelled = true;
  setState({ follow: false });
}

export async function playBlocks(startIndex, { follow = false } = {}) {
  const blocks = getState().blocks || [];
  const i = Number(startIndex);
  if (!blocks[i]) return { ok: false, reason: "no such block" };

  cancelled = true;
  stopCurrent();
  await sleep(50);
  cancelled = false;
  setState({ blockIndex: i, follow: Boolean(follow) });

  if (running) {
    // The previous loop will see cancelled and exit; start a new one.
  }
  running = true;
  try {
    const end = follow ? blocks.length : i + 1;
    for (let n = i; n < end; n++) {
      if (cancelled) break;
      const latest = getState().blocks || [];
      const text = latest[n];
      if (!text) break;
      setState({ blockIndex: n });
      await speak(text, getConfig(), { wait: false });
      rememberSpoken(text);
      await waitUntilUtteranceOver();
    }
  } finally {
    running = false;
    if (!cancelled) setState({ follow: false });
  }
  return { ok: true };
}

export async function playRaw(text) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, reason: "nothing to read" };
  if (looksLikeSecret(raw)) return { ok: false, reason: "that looks like a key. Coda will not read it." };
  cancelled = true;
  stopCurrent();
  cancelled = false;
  const blocks = splitBlocks(raw);
  if (blocks.length > 1) {
    rememberReply(raw, blocks);
    playBlocks(0, { follow: true }).catch(() => {});
    return { ok: true, text: raw, queued: true };
  }
  await speak(raw, getConfig(), { wait: false });
  rememberSpoken(raw);
  return { ok: true, text: raw };
}

export function sameUtterance(a, b) {
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  return left === right;
}

export function decidePlayAction({ incoming, current, playing, paused }) {
  if (incoming && !sameUtterance(incoming, current)) return "play";
  if (playing) return "pause";
  if (paused) return "resume";
  if (incoming) return "play";
  return "none";
}

function peekRemembered() {
  try {
    const rec = JSON.parse(readFileSync(join(paths.CODA_DIR, "last-highlight.json"), "utf8"));
    if (Date.now() / 1000 - Number(rec.at || 0) > 300) return "";
    return String(rec.text || "").trim();
  } catch {
    return "";
  }
}

export async function playOrToggle() {
  const st = playbackStatus();
  const current = String(getState().lastDigest || "").trim();
  const grabbed = grabScreen("selection");
  const incoming = String(grabbed.text || "").trim() || peekRemembered();
  const action = decidePlayAction({ incoming, current, ...st });
  if (action === "play") return { ...grabbed, ...(await playRaw(incoming)), action };
  if (action === "pause") return { ok: true, action, ...pauseCurrent() };
  if (action === "resume") return { ok: true, action, ...resumeCurrent() };
  return { ok: false, action: "none", note: grabbed.note || "nothing to play" };
}

export async function playGrab() {
  return playOrToggle();
}

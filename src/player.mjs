// Sequential block playback, plus a highlight queue.
import {
  synthesize,
  playPrepared,
  findCachedClip,
  clearClipCache,
  playbackStatus,
  stopCurrent,
  pauseCurrent,
  resumeCurrent,
} from "./tts.mjs";
import { getState, setState, getConfig, rememberSpoken, rememberReply } from "./state.mjs";
import { splitBlocks } from "./digest.mjs";
import { grabScreen } from "./grab.mjs";
import { forSpeech } from "./secret-text.mjs";
import {
  enqueue,
  dequeue,
  clearQueue,
  listQueue,
  queueCount,
  markSkip,
  markStop,
  setQueueRunning,
  isQueueRunning,
  shouldAbortItem,
  shouldStopRunner,
} from "./queue.mjs";

let cancelled = false;
let running = false;
let prefetchActive = 0;
const PREFETCH_MAX = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function prefetchQueue(items = listQueue(), config = getConfig()) {
  for (const it of items || []) {
    const text = typeof it === "string" ? it : it && it.text;
    if (!text) continue;
    if (findCachedClip(text, config)) continue;
    if (prefetchActive >= PREFETCH_MAX) break;
    prefetchActive += 1;
    synthesize(text, config, { showLoading: false })
      .catch(() => {})
      .finally(() => {
        prefetchActive = Math.max(0, prefetchActive - 1);
      });
  }
}

async function waitUntilUtteranceOver(startedAt) {
  prefetchQueue();
  await sleep(250);
  for (;;) {
    prefetchQueue();
    if (cancelled || shouldAbortItem(startedAt)) return;
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

export function isOccupied() {
  const p = playbackStatus();
  return Boolean(p.playing || p.paused || p.loading || isQueueRunning() || running);
}

export function decidePlayAction({ incoming, playing, paused, loading, running: busy }) {
  if (!incoming) return "none";
  if (playing || paused || loading || busy) return "queue";
  return "play";
}

export async function playBlocks(startIndex, { follow = false, startedAt = Date.now() } = {}) {
  const blocks = getState().blocks || [];
  const i = Number(startIndex);
  if (!blocks[i]) return { ok: false, reason: "no such block" };

  cancelled = true;
  stopCurrent();
  await sleep(50);
  cancelled = false;
  setState({ blockIndex: i, follow: Boolean(follow) });

  running = true;
  try {
    const end = follow ? blocks.length : i + 1;
    for (let n = i; n < end; n++) {
      if (cancelled || shouldAbortItem(startedAt)) break;
      const latest = getState().blocks || [];
      const text = latest[n];
      if (!text) break;
      setState({ blockIndex: n });
      prefetchQueue(latest.slice(n + 1, end).map((t) => ({ text: t })));
      try {
        const prepared = await synthesize(text, getConfig(), { showLoading: true });
        if (shouldAbortItem(startedAt)) break;
        if (prepared.print) {
          rememberSpoken(text);
          continue;
        }
        if (!prepared.audioPath) throw new Error("no audio");
        const played = playPrepared(prepared.audioPath, { startedAt });
        if (played.aborted) break;
      } catch {
        return { ok: false, reason: "Voice request failed." };
      }
      rememberSpoken(text);
      await waitUntilUtteranceOver(startedAt);
    }
  } finally {
    running = false;
    if (!cancelled && !shouldAbortItem(startedAt)) setState({ follow: false });
  }
  return { ok: true };
}

async function speakItem(text, startedAt) {
  cancelled = false;
  const spoken = forSpeech(String(text || "").trim());
  if (!spoken) return { ok: false, reason: "nothing to read" };
  if (shouldAbortItem(startedAt)) return { ok: true, aborted: true };
  const blocks = splitBlocks(spoken);
  if (blocks.length > 1) {
    rememberReply(spoken, blocks);
    await playBlocks(0, { follow: true, startedAt });
    return { ok: true, text: spoken };
  }
  prefetchQueue();
  const tick = setInterval(() => prefetchQueue(), 200);
  try {
    const prepared = await synthesize(spoken, getConfig(), { showLoading: true });
    if (shouldAbortItem(startedAt)) return { ok: true, aborted: true };
    if (prepared.print) {
      rememberSpoken(spoken);
      return { ok: true, text: spoken };
    }
    if (!prepared.audioPath) throw new Error("no audio");
    const played = playPrepared(prepared.audioPath, { startedAt });
    if (played.aborted) return { ok: true, aborted: true };
  } catch (e) {
    const msg = String(e && e.message ? e.message : "");
    if (/does not exist/i.test(msg)) return { ok: false, reason: "That voice isn’t available." };
    return { ok: false, reason: "Voice request failed." };
  } finally {
    clearInterval(tick);
  }
  rememberSpoken(spoken);
  prefetchQueue();
  await waitUntilUtteranceOver(startedAt);
  return { ok: true, text: spoken };
}

async function playNow(text) {
  const runStarted = Date.now();
  setQueueRunning(true);
  prefetchQueue();
  try {
    const first = await speakItem(text, runStarted);
    if (!first.ok) return first;
    while (!shouldStopRunner(runStarted)) {
      prefetchQueue();
      const next = dequeue();
      if (!next) break;
      prefetchQueue();
      await speakItem(next.text, Date.now());
    }
    return { ok: true, text, action: "play" };
  } finally {
    setQueueRunning(false);
  }
}

export async function playRaw(text) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, reason: "nothing to read" };
  const spoken = forSpeech(raw);
  if (!spoken) return { ok: false, reason: "nothing to read" };
  if (isOccupied()) {
    const q = enqueue({ text: spoken });
    if (!q.ok) return q;
    prefetchQueue();
    return { ok: true, text: spoken, action: "queued", queued: true, queueCount: q.count };
  }
  return playNow(spoken);
}

export function sameUtterance(a, b) {
  const norm = (s) => forSpeech(String(s || "").replace(/\s+/g, " ").trim()).toLowerCase();
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  return shorter.length >= 8 && longer.includes(shorter);
}

export async function playOrToggle(provided) {
  const grabbed =
    provided && typeof provided === "object"
      ? {
          ok: Boolean(provided.text),
          method: provided.method || "highlight",
          text: String(provided.text || ""),
          app: provided.app || "",
          note: provided.note || "",
        }
      : grabScreen();
  const incoming = forSpeech(String(grabbed.text || "").trim());
  const status = playbackStatus();
  const action = decidePlayAction({
    incoming,
    playing: status.playing,
    paused: status.paused,
    loading: status.loading,
    running: isOccupied(),
  });
  if (action === "none") return { ok: false, action: "none", note: grabbed.note || "nothing to play" };
  if (action === "queue") {
    const q = enqueue({ text: incoming, app: grabbed.app });
    if (!q.ok) return { ...grabbed, ...q, action: "none" };
    prefetchQueue();
    return { ...grabbed, ok: true, text: incoming, action: "queued", queueCount: q.count };
  }
  return { ...grabbed, ...(await playNow(incoming)), action: "play" };
}

export async function playGrab() {
  return playOrToggle();
}

export function togglePlayback() {
  const st = playbackStatus();
  if (st.playing) return { ...pauseCurrent(), action: "pause" };
  if (st.paused) return { ...resumeCurrent(), action: "resume" };
  if (!isQueueRunning() && !running) {
    const next = dequeue();
    if (next) {
      playNow(next.text).catch(() => {});
      return { ok: true, action: "play", queueCount: queueCount() };
    }
  }
  return { ok: false, reason: "nothing playing", action: "none" };
}

export function skipCurrent() {
  markSkip();
  cancelFollow();
  stopCurrent();
  if (!isQueueRunning() && !running) {
    const next = dequeue();
    if (next) playNow(next.text).catch(() => {});
  }
  return { ok: true, action: "skip", queueCount: queueCount() };
}

export function stopAll() {
  markStop();
  cancelFollow();
  stopCurrent();
  clearQueue();
  clearClipCache();
  return { ok: true, action: "stop" };
}

export { listQueue, queueCount };

// Highlight queue. Play adds to this when something is already speaking.
import { mkdirSync, writeFileSync } from "node:fs";
import { getState, setState, paths } from "./state.mjs";

export const MAX_QUEUE = 20;

function previewOf(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function itemsFromState(s = getState()) {
  return Array.isArray(s.speakQueue) ? s.speakQueue.filter((it) => it && it.text) : [];
}

export function writeQueueBadge(list = itemsFromState()) {
  mkdirSync(paths.CODA_DIR, { recursive: true });
  writeFileSync(
    paths.QUEUE_PATH,
    JSON.stringify({
      count: list.length,
      items: list.map((it) => ({ preview: it.preview || previewOf(it.text) })),
    }) + "\n",
    "utf8"
  );
}

export function listQueue() {
  return itemsFromState();
}

export function queueCount() {
  return itemsFromState().length;
}

export function enqueue(item) {
  const text = String(item?.text || "").trim();
  if (!text) return { ok: false, reason: "nothing to queue" };
  const current = itemsFromState();
  if (current.length >= MAX_QUEUE) return { ok: false, reason: "queue is full" };
  const next = current.concat({
    text,
    app: String(item.app || ""),
    preview: previewOf(text),
  });
  setState({ speakQueue: next });
  writeQueueBadge(next);
  return { ok: true, items: next, count: next.length };
}

export function dequeue() {
  const current = itemsFromState();
  if (!current.length) return null;
  const [first, ...rest] = current;
  setState({ speakQueue: rest });
  writeQueueBadge(rest);
  return first;
}

export function clearQueue() {
  setState({ speakQueue: [] });
  writeQueueBadge([]);
}

export function setQueueRunning(on) {
  setState({ queueRunning: Boolean(on) });
}

export function isQueueRunning() {
  return Boolean(getState().queueRunning);
}

export function markSkip() {
  setState({ queueSkipAt: Date.now() });
}

export function markStop() {
  setState({ speakQueue: [], queueStopAt: Date.now(), queueSkipAt: Date.now(), queueRunning: false });
  writeQueueBadge([]);
}

export function shouldAbortItem(startedAt) {
  const s = getState();
  const t = Number(startedAt) || 0;
  return Number(s.queueSkipAt || 0) > t || Number(s.queueStopAt || 0) > t;
}

export function shouldStopRunner(startedAt) {
  return Number(getState().queueStopAt || 0) > (Number(startedAt) || 0);
}

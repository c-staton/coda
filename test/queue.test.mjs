import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const queueUrl = new URL("../src/queue.mjs", import.meta.url).href;

function runQueue(home, body) {
  const script = `import { enqueue, dequeue, listQueue, clearQueue, queueCount, MAX_QUEUE } from ${JSON.stringify(queueUrl)};
${body}`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, CODA_HOME: home },
  });
}

test("enqueue appends and dequeue is oldest first", () => {
  const home = mkdtempSync(join(tmpdir(), "coda-queue-"));
  const r = runQueue(
    home,
    `
    const a = enqueue({ text: "First clip", app: "Cursor" });
    const b = enqueue({ text: "Second clip" });
    if (!a.ok || a.count !== 1) { console.error("first", a); process.exit(2); }
    if (!b.ok || b.count !== 2) { console.error("second", b); process.exit(3); }
    const first = dequeue();
    if (first.text !== "First clip") { console.error(first); process.exit(4); }
    if (queueCount() !== 1) process.exit(5);
    if (listQueue()[0].text !== "Second clip") process.exit(6);
    clearQueue();
    if (queueCount() !== 0) process.exit(7);
    `
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const badge = JSON.parse(readFileSync(join(home, "queue.json"), "utf8"));
  assert.equal(badge.count, 0);
});

test("queue refuses an empty item and caps at MAX_QUEUE", () => {
  const home = mkdtempSync(join(tmpdir(), "coda-queue-"));
  const r = runQueue(
    home,
    `
    const empty = enqueue({ text: "   " });
    if (empty.ok) process.exit(2);
    for (let i = 0; i < MAX_QUEUE; i++) {
      const q = enqueue({ text: "clip " + i });
      if (!q.ok) process.exit(3);
    }
    const full = enqueue({ text: "one more" });
    if (full.ok || full.reason !== "queue is full") process.exit(4);
    `
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

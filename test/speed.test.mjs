import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSpeed, normalizeSpeed, SPEED_OPTIONS } from "../src/speed.mjs";

test("normalizeSpeed snaps to the allowed rates", () => {
  assert.equal(normalizeSpeed(1), 1);
  assert.equal(normalizeSpeed("1.25"), 1.25);
  assert.equal(normalizeSpeed(1.3), 1.25);
  assert.equal(normalizeSpeed(9), 2);
  assert.equal(normalizeSpeed("nope"), 1);
});

test("formatSpeed uses a multiply sign", () => {
  assert.equal(formatSpeed(1), "1×");
  assert.equal(formatSpeed(1.5), "1.5×");
  assert.deepEqual(SPEED_OPTIONS, [0.75, 1, 1.25, 1.5, 1.75, 2]);
});

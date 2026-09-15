import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeCodaAppBundle,
  codaAppPath,
  codaBarBinPath,
  installedCodaBin,
} from "../src/install.mjs";

test("Coda.app Info.plist is named Coda", () => {
  const dir = mkdtempSync(join(tmpdir(), "coda-app-"));
  const exe = join(dir, "fake-bin");
  writeFileSync(exe, "#!/bin/sh\n");
  chmodSync(exe, 0o755);
  const dest = join(dir, "Coda.app");
  const written = writeCodaAppBundle({ dest, executable: exe });
  assert.equal(written.app, dest);
  assert.equal(written.bin, join(dest, "Contents", "MacOS", "Coda"));
  assert.ok(existsSync(written.bin));
  const plist = readFileSync(join(dest, "Contents", "Info.plist"), "utf8");
  assert.match(plist, /<string>Coda<\/string>/);
  assert.match(plist, /<string>com\.cstaton\.coda<\/string>/);
  assert.match(plist, /<key>LSUIElement<\/key>/);
  assert.ok(existsSync(join(dest, "Contents", "Resources", "MenuIcon.png")));
  assert.ok(existsSync(join(dest, "Contents", "Resources", "AppIcon.png")));
});

test("installedCodaBin prefers the Coda.app binary", () => {
  const dir = mkdtempSync(join(tmpdir(), "coda-bin-"));
  const exe = join(dir, "fake-bin");
  writeFileSync(exe, "#!/bin/sh\n");
  chmodSync(exe, 0o755);
  const dest = join(dir, "Coda.app");
  writeCodaAppBundle({ dest, executable: exe });
  const prevApp = process.env.CODA_APP;
  const prevCap = process.env.CODA_CAPTURE_BIN;
  delete process.env.CODA_CAPTURE_BIN;
  process.env.CODA_APP = dest;
  try {
    assert.equal(codaAppPath(), dest);
    assert.equal(codaBarBinPath(), join(dest, "Contents", "MacOS", "Coda"));
    assert.equal(installedCodaBin(), join(dest, "Contents", "MacOS", "Coda"));
  } finally {
    if (prevApp === undefined) delete process.env.CODA_APP;
    else process.env.CODA_APP = prevApp;
    if (prevCap !== undefined) process.env.CODA_CAPTURE_BIN = prevCap;
  }
});

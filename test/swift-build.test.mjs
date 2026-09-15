import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nodeArchToMacArch,
  macDeploymentVersion,
  swiftTargetTriple,
  duplicateSwiftBridgingMap,
  writeSwiftBridgingOverlay,
  swiftcBuildArgs,
} from "../src/install.mjs";

test("maps Node and uname arches to the Mac CPU swiftc should target", () => {
  assert.equal(nodeArchToMacArch("arm64"), "arm64");
  assert.equal(nodeArchToMacArch("x64"), "x86_64");
  assert.equal(nodeArchToMacArch("x86_64"), "x86_64");
  assert.equal(nodeArchToMacArch("ia32"), "");
});

test("deployment target is the older of this Mac and the SDK", () => {
  assert.equal(macDeploymentVersion("14.5", "15.2"), "14.5");
  assert.equal(macDeploymentVersion("15.3", "15.2"), "15.2");
  assert.equal(macDeploymentVersion("14.5.1", "14.5"), "14.5");
  assert.equal(macDeploymentVersion("14.5", ""), "14.5");
  assert.equal(macDeploymentVersion("", "15.2"), "15.2");
});

test("swift target triples are host-arch specific", () => {
  assert.equal(swiftTargetTriple("arm64", "14.5"), "arm64-apple-macosx14.5");
  assert.equal(swiftTargetTriple("x86_64", "14.5"), "x86_64-apple-macosx14.5");
});

test("duplicate SwiftBridging maps are the leftover CLT pair", () => {
  const dir = mkdtempSync(join(tmpdir(), "coda-swift-maps-"));
  writeFileSync(join(dir, "module.modulemap"), "module SwiftBridging { header \"bridging\" }\n");
  writeFileSync(join(dir, "bridging.modulemap"), "module SwiftBridging { header \"bridging\" }\n");
  assert.equal(duplicateSwiftBridgingMap(dir), join(dir, "module.modulemap"));

  const onlyNew = mkdtempSync(join(tmpdir(), "coda-swift-new-"));
  writeFileSync(join(onlyNew, "bridging.modulemap"), "module SwiftBridging { header \"bridging\" }\n");
  assert.equal(duplicateSwiftBridgingMap(onlyNew), "");

  const empty = mkdtempSync(join(tmpdir(), "coda-swift-empty-"));
  assert.equal(duplicateSwiftBridgingMap(empty), "");
});

test("overlay blanks the stale module.modulemap", () => {
  const root = mkdtempSync(join(tmpdir(), "coda-overlay-"));
  const includeDir = join(root, "include", "swift");
  mkdirSync(includeDir, { recursive: true });
  const stale = join(includeDir, "module.modulemap");
  writeFileSync(stale, "module SwiftBridging {}\n");
  const dest = join(root, "build");
  const overlayPath = writeSwiftBridgingOverlay(stale, dest);
  assert.ok(existsSync(overlayPath));
  const overlay = JSON.parse(readFileSync(overlayPath, "utf8"));
  assert.equal(overlay.roots[0].name, includeDir);
  assert.equal(overlay.roots[0].contents[0].name, "module.modulemap");
  assert.equal(overlay.roots[0].contents[0]["external-contents"], join(dest, "empty.modulemap"));
  assert.equal(readFileSync(join(dest, "empty.modulemap"), "utf8"), "");
});

test("swiftc args pin SDK, CPU target, and the CLT overlay", () => {
  const overlay = "/tmp/overlay.json";
  const args = swiftcBuildArgs({
    src: "/repo/apps/macos/CodaBar.swift",
    out: "/tmp/Coda",
    sdkPath: "/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk",
    triple: "x86_64-apple-macosx14.5",
    overlayPath: overlay,
  });
  assert.deepEqual(args.slice(0, 10), [
    "-O",
    "-sdk",
    "/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk",
    "-target",
    "x86_64-apple-macosx14.5",
    "-vfsoverlay",
    overlay,
    "-Xcc",
    "-ivfsoverlay",
    "-Xcc",
  ]);
  assert.equal(args[10], overlay);
  assert.ok(args.includes("-framework"));
  assert.ok(!swiftcBuildArgs({ src: "a.swift", out: "out" }).includes("-vfsoverlay"));
  assert.ok(
    swiftcBuildArgs({
      src: "a.swift",
      out: "out",
      triple: "arm64-apple-macosx14.5",
    }).includes("arm64-apple-macosx14.5")
  );
});

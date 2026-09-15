#!/usr/bin/env node
// Optional Cursor afterAgentResponse entrypoint.
// Cursor pipes { "text": "<final assistant reply>", ... } on stdin.
// `coda hook` exits quietly (Coda does not auto-speak Cursor replies).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "src", "cli.mjs");

const child = spawn(process.execPath, [cli, "hook"], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code || 0));
child.on("error", () => process.exit(0));

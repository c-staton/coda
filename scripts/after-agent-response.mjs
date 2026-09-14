#!/usr/bin/env node
// Cursor afterAgentResponse hook entrypoint.
// Cursor pipes { "text": "<final assistant reply>", ... } on stdin.
// We hand that straight to `coda hook`, which digests + speaks if listening.
//
// Relative path keeps GitHub plugin install working; a user-level
// ~/.cursor/hooks.json can point at this file with an absolute path instead.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "src", "cli.mjs");

const child = spawn(process.execPath, [cli, "hook"], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code || 0));
child.on("error", () => process.exit(0)); // never break the agent loop

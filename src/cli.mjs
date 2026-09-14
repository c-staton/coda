#!/usr/bin/env node
// coda CLI: on | off | toggle | status | speak [text] | replay | hook
import { digest } from "./digest.mjs";
import { speak, resolveEngine } from "./tts.mjs";
import { getState, setState, getConfig } from "./state.mjs";
import { installHook, uninstallHook, hooksFilePath } from "./install.mjs";

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    // Guard against a hook invoked with no piped input.
    setTimeout(() => resolve(data), 250).unref?.();
  });
}

function printStatus() {
  const s = getState();
  const c = getConfig();
  const flag = s.listening ? "on" : "off";
  process.stdout.write(
    `coda: listening ${flag} | engine ${resolveEngine(c)} | voice ${c.voice}\n`
  );
  if (s.lastSpokenAt) {
    process.stdout.write(
      `last spoken ${s.lastSpokenAt}: "${(s.lastDigest || "").slice(0, 80)}"\n`
    );
  }
}

async function speakText(text) {
  const c = getConfig();
  const spoken = digest(text, { maxChars: c.maxChars });
  if (!spoken) return { skipped: true };
  const result = await speak(spoken, c);
  setState({ lastDigest: spoken, lastSpokenAt: new Date().toISOString() });
  return { ...result, spoken };
}

async function runHook() {
  const state = getState();
  if (!state.listening) {
    // Muted: write nothing, play nothing, succeed.
    return 0;
  }
  const raw = await readStdin();
  if (!raw.trim()) return 0;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return 0; // malformed hook input: fail quietly, never break the agent loop
  }
  const text = typeof payload.text === "string" ? payload.text : "";
  if (!text.trim()) return 0;
  await speakText(text);
  return 0;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "on":
      setState({ listening: true });
      printStatus();
      return 0;
    case "off":
      setState({ listening: false });
      printStatus();
      return 0;
    case "toggle": {
      const s = getState();
      setState({ listening: !s.listening });
      printStatus();
      return 0;
    }
    case "status":
    case undefined:
      printStatus();
      return 0;
    case "speak": {
      const text = rest.join(" ") || (await readStdin());
      const r = await speakText(text);
      if (r.skipped) process.stdout.write("coda: nothing worth speaking (skipped)\n");
      else if (r.audioPath) process.stdout.write(`coda: audio -> ${r.audioPath}\n`);
      return 0;
    }
    case "replay": {
      const s = getState();
      if (!s.lastDigest) {
        process.stdout.write("coda: nothing to replay yet\n");
        return 0;
      }
      const c = getConfig();
      const r = await speak(s.lastDigest, c);
      if (r.audioPath) process.stdout.write(`coda: audio -> ${r.audioPath}\n`);
      return 0;
    }
    case "install": {
      let r;
      try {
        r = installHook();
      } catch (e) {
        process.stderr.write(`coda: ${e.message}\n`);
        return 1;
      }
      setState({ listening: true });
      const engine = resolveEngine(getConfig());
      process.stdout.write(
        (r.alreadyInstalled
          ? "coda: already installed - refreshed and listening is ON.\n"
          : "coda: installed! Coda will now speak Cursor replies.\n") +
          `  hook file: ${r.path}\n` +
          `  voice engine: ${engine}${
            engine === "print" ? " (no TTS engine found - see README)" : ""
          }\n\n` +
          "Next: fully restart Cursor, then send any message. When the reply\n" +
          "finishes, you'll hear a short spoken summary.\n" +
          "Controls: `coda off` to mute, `coda on` to unmute, `coda status` to check.\n" +
          "Remove it anytime with `coda uninstall`.\n"
      );
      return 0;
    }
    case "uninstall": {
      let r;
      try {
        r = uninstallHook();
      } catch (e) {
        process.stderr.write(`coda: ${e.message}\n`);
        return 1;
      }
      if (!r.existed || r.removed === 0) {
        process.stdout.write(
          `coda: nothing to remove (no Coda hook in ${hooksFilePath()}).\n`
        );
      } else {
        process.stdout.write(
          "coda: uninstalled. Restart Cursor to stop the spoken summaries.\n" +
            `  updated: ${r.path}\n`
        );
      }
      return 0;
    }
    case "hook":
      return runHook();
    default:
      process.stderr.write(
        `coda: unknown command "${cmd}"\n` +
          "usage: coda install|uninstall|on|off|toggle|status|speak [text]|replay|hook\n"
      );
      return 1;
  }
}

main().then((code) => process.exit(code || 0));

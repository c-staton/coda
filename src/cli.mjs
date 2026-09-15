#!/usr/bin/env node
// coda CLI: on | off | toggle | status | speak [text] | replay | hook
import { digest, splitBlocks } from "./digest.mjs";
import { speak, resolveEngine, pauseCurrent, resumeCurrent, stopCurrent, togglePause } from "./tts.mjs";
import { getState, setState, getConfig, setConfig, rememberSpoken, rememberReply } from "./state.mjs";
import { cancelFollow, playRaw, playGrab } from "./player.mjs";
import { startUiServer } from "./ui-server.mjs";
import { installAll, uninstallAll } from "./install.mjs";
import { setApiKey, hasApiKey } from "./secrets.mjs";

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
  const engine = resolveEngine(c);
  const extra = engine === "openrouter" ? ` | model ${c.model}` : "";
  process.stdout.write(
    `coda: listening ${flag} | engine ${engine} | voice ${c.voice}${extra}\n`
  );
  if (s.lastSpokenAt) {
    process.stdout.write(
      `last spoken ${s.lastSpokenAt}: "${(s.lastDigest || "").slice(0, 80)}"\n`
    );
  }
}

async function speakText(text, { wait = false } = {}) {
  const c = getConfig();
  const spoken = digest(text, { maxChars: c.maxChars });
  if (!spoken) return { skipped: true };
  const result = await speak(spoken, c, { wait });
  rememberSpoken(spoken);
  return { ...result, spoken };
}

const ENGINES = ["auto", "apple", "espeak", "grok", "openai", "openrouter", "print"];
const GROK_VOICES = ["eve", "ara", "rex", "leo", "sal"];
const KEY_KINDS = { xai: "xai", openai: "openai", openrouter: "openrouter", or: "openrouter" };

async function runHook() {
  const raw = await readStdin();
  if (!raw.trim()) return 0;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return 0; // malformed hook input: fail quietly, never break the agent loop
  }
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
      try {
        const r = await speakText(text, { wait: true });
        if (r.skipped) process.stdout.write("coda: nothing worth speaking (skipped)\n");
        else if (r.audioPath) process.stdout.write(`coda: audio -> ${r.audioPath}\n`);
        return 0;
      } catch (e) {
        process.stderr.write(`coda: ${e.message}\n`);
        return 1;
      }
    }
    case "pause": {
      const r = pauseCurrent();
      process.stdout.write(r.ok ? "coda: paused\n" : `coda: ${r.reason}\n`);
      return r.ok ? 0 : 1;
    }
    case "resume": {
      const r = resumeCurrent();
      process.stdout.write(r.ok ? "coda: resumed\n" : `coda: ${r.reason}\n`);
      return r.ok ? 0 : 1;
    }
    case "toggle-pause": {
      const r = togglePause();
      process.stdout.write(r.ok ? `coda: ${r.action === "resume" ? "resumed" : "paused"}\n` : `coda: ${r.reason}\n`);
      return r.ok ? 0 : 1;
    }
    case "stop":
      cancelFollow();
      stopCurrent();
      process.stdout.write("coda: stopped\n");
      return 0;
    case "read": {
      const text = rest.join(" ") || (await readStdin());
      const r = await playRaw(text);
      if (!r.ok) {
        process.stderr.write(`coda: ${r.reason || r.note || "could not read"}\n`);
        return 1;
      }
      process.stdout.write(`coda: reading ${r.method ? "via " + r.method + " " : ""}${(r.text || text).slice(0, 60)}\n`);
      return 0;
    }
    case "grab": {
      const mode = rest[0] || "auto";
      const r = await playGrab(mode);
      if (!r.ok) {
        process.stderr.write(`coda: ${r.note || r.reason || "could not grab text"}\n`);
        return 1;
      }
      process.stdout.write(`coda: ${r.method} from ${r.app || "app"}: "${(r.text || "").slice(0, 70)}"\n`);
      return 0;
    }
    case "ui": {
      const openBrowser = !rest.includes("--no-open");
      const { url } = await startUiServer({ openBrowser });
      process.stdout.write(`coda: settings at ${url}\n`);
      // keep the process alive
      return new Promise(() => {});
    }
    case "replay": {
      const s = getState();
      if (!s.lastDigest) {
        process.stdout.write("coda: nothing to replay yet\n");
        return 0;
      }
      const c = getConfig();
      const r = await speak(s.lastDigest, c, { wait: true });
      rememberSpoken(s.lastDigest);
      if (r.audioPath) process.stdout.write(`coda: audio -> ${r.audioPath}\n`);
      return 0;
    }
    case "engine": {
      const name = (rest[0] || "").toLowerCase();
      if (!name) {
        process.stdout.write(`coda: engine ${resolveEngine(getConfig())} (set: ${getConfig().engine})\n`);
        return 0;
      }
      if (!ENGINES.includes(name)) {
        process.stderr.write(`coda: unknown engine "${name}"\nuse: ${ENGINES.join(" | ")}\n`);
        return 1;
      }
      if (name === "openrouter" && !hasApiKey("openrouter")) {
        process.stderr.write(
          "coda: OpenRouter voice needs an OpenRouter API key.\n" +
            "  Get one at https://openrouter.ai/keys then: coda key openrouter YOUR_KEY\n"
        );
        return 1;
      }
      if (name === "grok" && !hasApiKey("xai")) {
        process.stderr.write(
          "coda: Grok voice needs an xAI API key.\n" +
            "  1. Create one at https://console.x.ai\n" +
            "  2. Run: coda key xai\n"
        );
        return 1;
      }
      if (name === "openai" && !hasApiKey("openai")) {
        process.stderr.write(
          "coda: OpenAI voice needs an OpenAI API key.\n" +
            "  Run: coda key openai\n"
        );
        return 1;
      }
      if (name === "openrouter") {
        setConfig({
          engine: "openrouter",
          model: getConfig().model || "x-ai/grok-voice-tts-1.0",
          voice: getConfig().voice || "eve",
        });
      } else if (name === "grok") setConfig({ engine: "grok", voice: getConfig().voice || "eve" });
      else if (name === "openai") setConfig({ engine: "openai", voice: getConfig().voice === "eve" ? "coral" : getConfig().voice });
      else setConfig({ engine: name });
      printStatus();
      return 0;
    }
    case "voice": {
      const name = (rest[0] || "").toLowerCase();
      if (!name) {
        process.stdout.write(`coda: voice ${getConfig().voice}\n`);
        return 0;
      }
      setConfig({ voice: name });
      process.stdout.write(`coda: voice ${name}\n`);
      const engine = resolveEngine(getConfig());
      if ((engine === "grok" || engine === "openrouter") && !GROK_VOICES.includes(name)) {
        process.stdout.write(`  tip: Grok voices are ${GROK_VOICES.join(", ")}\n`);
      }
      return 0;
    }
    case "key": {
      const kind = KEY_KINDS[(rest[0] || "").toLowerCase()];
      if (!kind) {
        process.stderr.write("usage: coda key openrouter [KEY]   (also: xai, openai)\n");
        return 1;
      }
      let value = rest.slice(1).join(" ").trim();
      if (!value) value = (await readStdin()).trim();
      if (!value) {
        process.stderr.write(
          `coda: paste your key after the command:\n` +
            `  coda key ${kind} YOUR_KEY_HERE\n`
        );
        return 1;
      }
      const r = setApiKey(kind, value);
      let label = "OpenAI";
      if (kind === "openrouter") {
        setConfig({ engine: "openrouter", model: "x-ai/grok-voice-tts-1.0", voice: "eve" });
        label = "OpenRouter → Grok Eve";
      } else if (kind === "xai") {
        setConfig({ engine: "grok", voice: getConfig().voice || "eve" });
        label = "Grok (eve)";
      } else {
        setConfig({ engine: "openai" });
      }
      process.stdout.write(
        `coda: saved ${r.name} and switched to ${label}.\n` +
          `  kept only on this Mac at ${r.path}. not in git.\n`
      );
      return 0;
    }
    case "install": {
      let r;
      try {
        r = installAll({ cursor: rest.includes("--cursor") });
      } catch (e) {
        process.stderr.write(`coda: ${e.message}\n`);
        return 1;
      }
      if (r.app && r.app.ok === false) {
        process.stderr.write(`coda: ${r.app.reason}\n`);
        return 1;
      }
      const engine = resolveEngine(getConfig());
      const already = Boolean(r.app?.already || r.hook?.alreadyInstalled);
      process.stdout.write(
        (already ? "coda: already set up. refreshed.\n" : "coda: installed.\n") +
          `  voice: ${engine}${engine === "print" ? " (no speaker found. see the README)" : ""}\n`
      );
      if (r.app?.ok) {
        process.stdout.write(
          `  app: ${r.app.app}\n\n` +
            "Highlight text in any app, then press Control-Option-X.\n" +
            "When macOS asks, turn on Coda under Privacy & Security → Accessibility.\n" +
            "Open Coda from the menu and paste your OpenRouter key for a better voice.\n" +
            "Remove it anytime with coda uninstall.\n"
        );
      } else if (r.app?.skipped && process.platform !== "darwin") {
        process.stdout.write(
          "\nCoda is a Mac app. It does not run on this computer.\n"
        );
      }
      if (r.hook) {
        process.stdout.write(`  Cursor hook: ${r.hook.path}\n`);
      }
      return 0;
    }
    case "uninstall": {
      let r;
      try {
        r = uninstallAll();
      } catch (e) {
        process.stderr.write(`coda: ${e.message}\n`);
        return 1;
      }
      const removedHook = r.hook?.removed > 0;
      const removedApp = Boolean(r.app?.existed);
      if (!removedHook && !removedApp) {
        process.stdout.write("coda: nothing to remove.\n");
      } else {
        process.stdout.write("coda: uninstalled.\n");
        if (removedApp) process.stdout.write(`  menu app: ${r.app.bin}\n`);
        if (removedHook) process.stdout.write(`  hook: ${r.hook.path}\n`);
      }
      return 0;
    }
    case "hook":
      return runHook();
    default:
      process.stderr.write(
        `coda: unknown command "${cmd}"\n` +
          "usage: coda install|uninstall|on|off|toggle|status|engine|voice|key|speak|pause|resume|stop|ui|replay|hook\n"
      );
      return 1;
  }
}

main().then((code) => process.exit(code || 0));

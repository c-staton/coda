// Tiny local settings server. No npm deps. Binds localhost only.
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { digest } from "./digest.mjs";
import { speak, resolveEngine, pauseCurrent, resumeCurrent, stopCurrent, playbackStatus, togglePause } from "./tts.mjs";
import { getState, getConfig, setConfig, rememberSpoken, paths } from "./state.mjs";
import { playGrab, cancelFollow } from "./player.mjs";
import { formatHotkeys, normalizeHotkeys, DEFAULT_HOTKEYS, HOTKEY_ACTIONS } from "./hotkeys.mjs";
import { setApiKey, clearApiKey, hasApiKey } from "./secrets.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(here, "ui.html");
const ICON_PATH = join(here, "..", "apps", "macos", "MenuIcon.png");
const PORT = Number(process.env.CODA_UI_PORT || 8787);
const HOST = "127.0.0.1";

const VOICES = [
  { id: "eve", label: "Eve", hint: "Upbeat, default" },
  { id: "ara", label: "Ara", hint: "Warm, friendly" },
  { id: "rex", label: "Rex", hint: "Clear, confident" },
  { id: "leo", label: "Leo", hint: "Strong, instructional" },
  { id: "sal", label: "Sal", hint: "Smooth, balanced" },
];

function snapshot() {
  const state = getState();
  const config = getConfig();
  const play = playbackStatus();
  return {
    ...play,
    voice: config.voice,
    engine: resolveEngine(config),
    model: config.model,
    lastDigest: state.lastDigest || "",
    lastSpokenAt: state.lastSpokenAt,
    voices: VOICES,
    hotkeys: config.hotkeys,
    hotkeyLabels: formatHotkeys(config.hotkeys),
    hasOpenRouterKey: hasApiKey("openrouter"),
  };
}

function isLocalHost(req) {
  const host = String(req.headers.host || "").toLowerCase();
  return (
    host === `${HOST}:${PORT}` ||
    host === HOST ||
    host === "localhost" ||
    host === `localhost:${PORT}`
  );
}

function publicError(err) {
  const msg = String(err && err.message ? err.message : "error");
  if (/bearer|sk-|api[_-]?key/i.test(msg)) return "voice request failed";
  return msg;
}

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    let tooBig = false;
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 32 * 1024) {
        tooBig = true;
        req.destroy();
        resolve({ __tooLarge: true });
      }
    });
    req.on("end", () => {
      if (tooBig) return;
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

async function playText(text) {
  const spoken = digest(text, { maxChars: getConfig().maxChars }) || String(text || "").trim();
  if (!spoken) return { skipped: true };
  const result = await speak(spoken, getConfig(), { wait: false });
  rememberSpoken(spoken);
  return { ...result, spoken };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/state") {
    return json(res, 200, snapshot());
  }

  if (req.method !== "POST") return json(res, 404, { error: "not found" });
  const body = await readBody(req);
  if (body.__tooLarge) return json(res, 413, { error: "too large" });

  if (url.pathname === "/api/voice") {
    const voice = String(body.voice || "").toLowerCase();
    if (!VOICES.some((v) => v.id === voice)) return json(res, 400, { error: "unknown voice" });
    setConfig({ voice });
    return json(res, 200, snapshot());
  }
  if (url.pathname === "/api/key") {
    if (body.clear) {
      clearApiKey("openrouter");
      return json(res, 200, snapshot());
    }
    const key = String(body.key || "").trim();
    if (key.length < 8) return json(res, 400, { error: "paste your OpenRouter key" });
    setApiKey("openrouter", key);
    setConfig({
      engine: "openrouter",
      model: getConfig().model || "x-ai/grok-voice-tts-1.0",
      voice: getConfig().voice || "eve",
    });
    const out = snapshot();
    if (JSON.stringify(out).includes(key)) {
      return json(res, 500, { error: "key leaked" });
    }
    return json(res, 200, out);
  }
  if (url.pathname === "/api/hotkeys") {
    if (body.reset) {
      setConfig({ hotkeys: DEFAULT_HOTKEYS });
      return json(res, 200, snapshot());
    }
    const current = getConfig().hotkeys;
    if (body.action && body.hotkey) {
      if (!HOTKEY_ACTIONS.includes(body.action)) return json(res, 400, { error: "unknown shortcut" });
      setConfig({ hotkeys: { ...current, [body.action]: body.hotkey } });
      return json(res, 200, snapshot());
    }
    setConfig({ hotkeys: normalizeHotkeys(body.hotkeys) });
    return json(res, 200, snapshot());
  }
  if (url.pathname === "/api/toggle-pause") {
    togglePause();
    return json(res, 200, snapshot());
  }
  if (url.pathname === "/api/pause") {
    pauseCurrent();
    return json(res, 200, snapshot());
  }
  if (url.pathname === "/api/resume") {
    const r = resumeCurrent();
    if (!r.ok) {
      const s = getState();
      if (s.lastDigest) await playText(s.lastDigest);
    }
    return json(res, 200, snapshot());
  }
  if (url.pathname === "/api/stop") {
    cancelFollow();
    stopCurrent();
    return json(res, 200, snapshot());
  }
  if (url.pathname === "/api/grab") {
    const mode = String(body.mode || "auto");
    const r = await playGrab(mode);
    return json(res, r.ok ? 200 : 400, { ...snapshot(), grab: r });
  }
  if (url.pathname === "/api/replay") {
    const s = getState();
    if (!s.lastDigest) return json(res, 200, { ...snapshot(), skipped: true });
    await playText(s.lastDigest);
    return json(res, 200, snapshot());
  }
  if (url.pathname === "/api/play") {
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return json(res, 400, { error: "nothing to play" });
    await playText(text);
    return json(res, 200, snapshot());
  }

  return json(res, 404, { error: "not found" });
}

export function startUiServer({ openBrowser = true } = {}) {
  const server = createServer(async (req, res) => {
    if (!isLocalHost(req)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const html = readFileSync(HTML_PATH, "utf8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(html);
      }
      if (url.pathname === "/icon.png" && existsSync(ICON_PATH)) {
        const icon = readFileSync(ICON_PATH);
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
        return res.end(icon);
      }
      res.writeHead(404);
      res.end("not found");
    } catch (e) {
      json(res, 500, { error: publicError(e) });
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        const url = `http://${HOST}:${PORT}`;
        if (openBrowser) openSettings(url);
        resolve({ server: null, url, port: PORT, alreadyRunning: true });
        return;
      }
      reject(err);
    });
    server.listen(PORT, HOST, () => {
      const url = `http://${HOST}:${PORT}`;
      mkdirSync(paths.CODA_DIR, { recursive: true });
      writeFileSync(join(paths.CODA_DIR, "ui.port"), String(PORT) + "\n");
      if (openBrowser) openSettings(url);
      resolve({ server, url, port: PORT });
    });
  });
}

export function openSettings(url = `http://${HOST}:${PORT}`) {
  const chrome = "/Applications/Google Chrome.app";
  if (existsSync(chrome)) {
    spawn("open", ["-na", "Google Chrome", "--args", `--app=${url}`], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const noOpen = process.argv.includes("--no-open");
  startUiServer({ openBrowser: !noOpen }).then(({ url }) => {
    process.stdout.write(`coda: settings at ${url}\n`);
  });
}

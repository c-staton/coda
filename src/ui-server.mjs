// Tiny local settings server. No npm deps. Binds localhost only.
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { digest } from "./digest.mjs";
import { speak, resolveEngine, pauseCurrent, resumeCurrent, playbackStatus, liveVoiceConfig } from "./tts.mjs";
import { getState, getConfig, setConfig, rememberSpoken, paths } from "./state.mjs";
import { playGrab, skipCurrent, stopAll, listQueue, queueCount, togglePlayback } from "./player.mjs";
import { writeQueueBadge } from "./queue.mjs";
import { formatHotkeys, normalizeHotkeys, DEFAULT_HOTKEYS, HOTKEY_ACTIONS, hotkeyLabelsClash } from "./hotkeys.mjs";
import { normalizeSpeed, speedChoices } from "./speed.mjs";
import { setApiKey, clearApiKey, hasApiKey } from "./secrets.mjs";
import {
  DEFAULT_MODEL,
  DEFAULT_VOICE,
  formatVoiceChoice,
  loadVoiceGroups,
  parseVoiceKey,
  voiceKey,
  writeVoiceCatalog,
} from "./voices.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(here, "ui.html");
const ICON_PATH = join(here, "..", "apps", "macos", "MenuIcon.png");
const PORT = Number(process.env.CODA_UI_PORT || 8787);
const HOST = "127.0.0.1";

async function snapshot() {
  const state = getState();
  let config = getConfig();
  const live = liveVoiceConfig(config);
  if (live.model !== config.model || live.voice !== config.voice) {
    setConfig({ model: live.model, voice: live.voice });
    config = getConfig();
  }
  const play = playbackStatus();
  const hasOpenRouterKey = hasApiKey("openrouter");
  const voiceGroups = hasOpenRouterKey ? await loadVoiceGroups() : [];
  if (hasOpenRouterKey) writeVoiceCatalog(voiceGroups);
  return {
    ...play,
    voice: config.voice,
    model: config.model,
    voiceId: voiceKey(config.model || DEFAULT_MODEL, config.voice || DEFAULT_VOICE),
    voiceLabel: formatVoiceChoice(config.model || DEFAULT_MODEL, config.voice || DEFAULT_VOICE),
    speed: config.speed,
    speeds: speedChoices(),
    engine: resolveEngine(config),
    lastDigest: state.lastDigest || "",
    lastSpokenAt: state.lastSpokenAt,
    voiceGroups,
    hotkeys: config.hotkeys,
    hotkeyLabels: formatHotkeys(config.hotkeys),
    queueCount: queueCount(),
    queue: listQueue().map((it) => ({ preview: it.preview || it.text })),
    hasOpenRouterKey,
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
    return json(res, 200, await snapshot());
  }

  if (req.method !== "POST") return json(res, 404, { error: "not found" });
  const body = await readBody(req);
  if (body.__tooLarge) return json(res, 413, { error: "too large" });

  if (url.pathname === "/api/voice") {
    if (!hasApiKey("openrouter")) return json(res, 400, { error: "add an OpenRouter key first" });
    const parsed = parseVoiceKey(body.id || body.voice);
    const groups = await loadVoiceGroups();
    const id = voiceKey(parsed.model, parsed.voice);
    const found = groups.some((g) => g.voices.some((v) => v.id === id));
    if (!found) return json(res, 400, { error: "unknown voice" });
    setConfig({ engine: "openrouter", model: parsed.model, voice: parsed.voice });
    return json(res, 200, await snapshot());
  }
  if (url.pathname === "/api/speed") {
    const speed = normalizeSpeed(body.speed);
    setConfig({ speed });
    return json(res, 200, await snapshot());
  }
  if (url.pathname === "/api/key") {
    if (body.clear) {
      clearApiKey("openrouter");
      return json(res, 200, await snapshot());
    }
    const key = String(body.key || "").trim();
    if (key.length < 8) return json(res, 400, { error: "paste your OpenRouter key" });
    setApiKey("openrouter", key);
    setConfig({
      engine: "openrouter",
      model: getConfig().model || "x-ai/grok-voice-tts-1.0",
      voice: getConfig().voice || "eve",
    });
    const out = await snapshot();
    if (JSON.stringify(out).includes(key)) {
      return json(res, 500, { error: "key leaked" });
    }
    return json(res, 200, out);
  }
  if (url.pathname === "/api/hotkeys") {
    if (body.reset) {
      setConfig({ hotkeys: DEFAULT_HOTKEYS });
      return json(res, 200, await snapshot());
    }
    const current = normalizeHotkeys(getConfig().hotkeys);
    if (body.action && body.hotkey) {
      if (!HOTKEY_ACTIONS.includes(body.action)) return json(res, 400, { error: "unknown shortcut" });
      const next = { ...current, [body.action]: body.hotkey };
      const labels = formatHotkeys(next);
      if (hotkeyLabelsClash(labels)) {
        return json(res, 400, { error: "Each shortcut has to be different." });
      }
      setConfig({ hotkeys: next });
      return json(res, 200, await snapshot());
    }
    setConfig({ hotkeys: normalizeHotkeys(body.hotkeys) });
    return json(res, 200, await snapshot());
  }
  if (url.pathname === "/api/toggle-pause") {
    togglePlayback();
    return json(res, 200, await snapshot());
  }
  if (url.pathname === "/api/pause") {
    pauseCurrent();
    return json(res, 200, await snapshot());
  }
  if (url.pathname === "/api/resume") {
    const r = resumeCurrent();
    if (!r.ok) {
      const s = getState();
      if (s.lastDigest) await playText(s.lastDigest);
    }
    return json(res, 200, await snapshot());
  }
  if (url.pathname === "/api/skip") {
    skipCurrent();
    return json(res, 200, await snapshot());
  }
  if (url.pathname === "/api/stop") {
    stopAll();
    return json(res, 200, await snapshot());
  }
  if (url.pathname === "/api/grab") {
    const mode = String(body.mode || "auto");
    const r = await playGrab(mode);
    return json(res, r.ok ? 200 : 400, { ...await snapshot(), grab: r });
  }
  if (url.pathname === "/api/replay") {
    const s = getState();
    if (!s.lastDigest) return json(res, 200, { ...await snapshot(), skipped: true });
    await playText(s.lastDigest);
    return json(res, 200, await snapshot());
  }
  if (url.pathname === "/api/play") {
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return json(res, 400, { error: "nothing to play" });
    await playText(text);
    return json(res, 200, await snapshot());
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
      writeQueueBadge();
      if (hasApiKey("openrouter")) {
        loadVoiceGroups().then(writeVoiceCatalog).catch(() => {});
      }
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

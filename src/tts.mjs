// TTS engine abstraction. Cursor-agnostic and dependency-free.
//
// Engines:
//   apple  -> macOS `say`
//   espeak -> Linux `espeak-ng` (generates a WAV; plays if an audio player exists)
//   grok       -> xAI Grok TTS (POST https://api.x.ai/v1/tts, needs XAI_API_KEY)
//   openai     -> OpenAI Speech (POST /v1/audio/speech, needs OPENAI_API_KEY)
//   openrouter -> OpenRouter speech (POST /api/v1/audio/speech). Default model
//                 is Grok Eve via x-ai/grok-voice-tts-1.0.
//   print  -> zero-dependency fallback: writes the digest to stdout
//
// "One utterance at a time": starting a new play stops the tracked player PID.
// We never `killall` a player, so unrelated audio is left alone.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { paths, getState, setState } from "./state.mjs";
import { getApiKey } from "./secrets.mjs";
import { installedCodaBin } from "./install.mjs";

function has(cmd) {
  const r = spawnSync("which", [cmd], { stdio: "ignore" });
  return r.status === 0;
}

export function resolveEngine(config) {
  if (config.engine && config.engine !== "auto") return config.engine;
  // Prefer a real AI voice whenever a key is available (file or env).
  if (getApiKey("openrouter")) return "openrouter";
  if (getApiKey("xai")) return "grok";
  if (getApiKey("openai")) return "openai";
  if (has("say")) return "apple"; // macOS fallback
  if (has("espeak-ng") || has("espeak")) return "espeak"; // Linux fallback
  return "print"; // always works, never blocks a hook
}

function firstPlayer() {
  for (const p of ["afplay", "aplay", "paplay", "ffplay"]) {
    if (has(p)) return p;
  }
  return null;
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function codaBin() {
  return installedCodaBin();
}

function readPlayback() {
  try {
    return JSON.parse(readFileSync(paths.PLAYBACK_PATH, "utf8"));
  } catch {
    return null;
  }
}

function useCodaBarPlayer() {
  return paths.CODA_DIR === join(homedir(), ".coda") && existsSync(codaBin());
}

function codaCtl(action, file) {
  const bin = codaBin();
  if (!useCodaBarPlayer()) return false;
  const args = ["--ctl", action];
  if (file) args.push("--file", file);
  const r = spawnSync(bin, args, { stdio: "ignore", timeout: 3000 });
  return r.status === 0;
}

function stopAfplay() {
  const { playerPid } = getState();
  if (playerPid) {
    try {
      process.kill(playerPid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  setState({ playerPid: null });
}

function stopCurrent() {
  codaCtl("stop");
  stopAfplay();
  setState({ playerPid: null, paused: false });
}

export function pauseCurrent() {
  if (codaCtl("pause")) {
    const p = readPlayback();
    if (p?.paused) {
      setState({ paused: true });
      return { ok: true };
    }
  }
  return { ok: false, reason: "nothing playing" };
}

export function togglePause() {
  const st = playbackStatus();
  if (st.playing) return { ...pauseCurrent(), action: "pause" };
  if (st.paused) return { ...resumeCurrent(), action: "resume" };
  return { ok: false, reason: "nothing playing", action: "none" };
}

export function resumeCurrent() {
  if (codaCtl("resume")) {
    const p = readPlayback();
    if (p?.playing) {
      setState({ paused: false });
      return { ok: true };
    }
  }
  return { ok: false, reason: "nothing to resume" };
}

export function playbackStatus() {
  const c = readPlayback();
  const loading = Boolean(c?.loading);
  if (c && (c.playing || c.paused || loading)) {
    return { playing: Boolean(c.playing), paused: Boolean(c.paused), loading };
  }
  const s = getState();
  const alive = pidAlive(s.playerPid);
  if (!alive && (s.playerPid || s.paused)) {
    setState({ playerPid: null, paused: false });
    return { playing: false, paused: false, loading: false };
  }
  return { playing: alive && !s.paused, paused: Boolean(alive && s.paused), loading: false };
}

function playFile(path, { wait = false } = {}) {
  stopCurrent();
  // If the menu app is installed, it is the only player. Falling through to
  // afplay here was starting a second copy of the same clip, especially on
  // the first play, before AVAudioPlayer had written playback.json.
  if (!wait && useCodaBarPlayer()) {
    const ok = codaCtl("play", path);
    if (ok) {
      setState({ playerPid: null, paused: false, lastAudioPath: path });
      return { played: true, player: "coda" };
    }
  }
  const player = firstPlayer();
  if (!player) return { played: false, player: null };
  const args = player === "ffplay" ? ["-nodisp", "-autoexit", path] : [path];
  if (wait) {
    spawnSync(player, args, { stdio: "ignore" });
    return { played: true, player };
  }
  const child = spawn(player, args, { detached: true, stdio: "ignore" });
  child.unref();
  setState({ playerPid: child.pid, paused: false, lastAudioPath: path });
  return { played: true, player, pid: child.pid };
}

function outPath(ext) {
  return join(paths.CODA_DIR, `last-utterance.${ext}`);
}

function synthEspeak(text, config) {
  const bin = has("espeak-ng") ? "espeak-ng" : "espeak";
  const wav = outPath("wav");
  // words-per-minute from speed (175 wpm is espeak default)
  const wpm = Math.max(80, Math.round(175 * (config.speed || 1)));
  const args = ["-w", wav, "-s", String(wpm), text];
  const r = spawnSync(bin, args, { stdio: "ignore" });
  if (r.status !== 0) throw new Error(`${bin} failed to synthesize`);
  return wav;
}

function synthApple(text, config) {
  const aiff = outPath("aiff");
  const wpm = Math.max(80, Math.round(175 * (config.speed || 1)));
  const r = spawnSync("say", ["-r", String(wpm), "-o", aiff, text], {
    stdio: "ignore",
  });
  if (r.status !== 0) throw new Error("say failed to synthesize");
  return aiff;
}

async function synthHttp(url, headers, body, ext) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`TTS request failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const path = outPath(ext);
  writeFileSync(path, buf);
  return path;
}

export function grokRequestBody(text, config) {
  const body = {
    text,
    voice_id: config.voice || "eve",
    language: config.language || "auto",
  };
  if (config.speed && config.speed !== 1) body.speed = config.speed;
  return body;
}

function synthGrok(text, config) {
  const key = getApiKey("xai");
  if (!key) throw new Error("XAI_API_KEY is not set (run: coda key xai)");
  return synthHttp(
    "https://api.x.ai/v1/tts",
    { authorization: `Bearer ${key}` },
    grokRequestBody(text, config),
    "mp3"
  );
}

export function openrouterRequestBody(text, config) {
  return {
    model: config.model || "x-ai/grok-voice-tts-1.0",
    input: text,
    voice: config.voice || "eve",
    response_format: "mp3",
    speed: config.speed || 1.0,
  };
}

function synthOpenrouter(text, config) {
  const key = getApiKey("openrouter");
  if (!key) throw new Error("OPENROUTER_API_KEY is not set (run: coda key openrouter)");
  return synthHttp(
    "https://openrouter.ai/api/v1/audio/speech",
    {
      authorization: `Bearer ${key}`,
      "http-referer": "https://github.com/c-staton/coda",
      "x-title": "Coda",
    },
    openrouterRequestBody(text, config),
    "mp3"
  );
}

function synthOpenai(text, config) {
  const key = getApiKey("openai");
  if (!key) throw new Error("OPENAI_API_KEY is not set (run: coda key openai)");
  return synthHttp(
    "https://api.openai.com/v1/audio/speech",
    { authorization: `Bearer ${key}` },
    {
      model: "gpt-4o-mini-tts",
      voice: config.voice || "coral",
      input: text,
      speed: config.speed || 1.0,
    },
    "mp3"
  );
}

/**
 * Speak (or synthesize) the given text.
 * options.dryRun: resolve engine + report, but do not synthesize or play.
 * Returns { engine, played, audioPath }.
 */
export async function speak(text, config, options = {}) {
  const engine = resolveEngine(config);

  if (!text || !text.trim()) return { engine, played: false, audioPath: null };
  if (options.dryRun) return { engine, played: false, audioPath: null, dryRun: true };

  if (engine === "print") {
    process.stdout.write(`\u{1F50A} ${text}\n`);
    return { engine, played: false, audioPath: null };
  }

  codaCtl("loading");
  let audioPath;
  try {
    if (engine === "espeak") audioPath = synthEspeak(text, config);
    else if (engine === "apple") audioPath = synthApple(text, config);
    else if (engine === "grok") audioPath = await synthGrok(text, config);
    else if (engine === "openai") audioPath = await synthOpenai(text, config);
    else if (engine === "openrouter") audioPath = await synthOpenrouter(text, config);
    else throw new Error(`Unknown engine: ${engine}`);
  } catch (err) {
    codaCtl("stop");
    throw err;
  }

  const { played, player } = playFile(audioPath, { wait: Boolean(options.wait) });
  return { engine, played, player, audioPath };
}

export { stopCurrent };

// TTS engines. No npm deps.
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
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { paths, getState, setState } from "./state.mjs";
import { getApiKey } from "./secrets.mjs";
import { installedCodaBin } from "./install.mjs";
import { forSpeech } from "./secret-text.mjs";
import { allowedModel, DEFAULT_MODEL } from "./voices.mjs";

export function liveVoiceConfig(config) {
  if (allowedModel(config.model)) return config;
  return { ...config, model: DEFAULT_MODEL, voice: "ara" };
}

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
  return "print";
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
    setState({ paused: true });
    return { ok: true };
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
    setState({ paused: false });
    return { ok: true };
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

function clipsDir() {
  const dir = join(paths.CODA_DIR, "clips");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function clipId(text, config) {
  const c = liveVoiceConfig(config || {});
  return createHash("sha1")
    .update(`${c.model || ""}|${c.voice || ""}|${c.speed || 1}|${forSpeech(text)}`)
    .digest("hex")
    .slice(0, 20);
}

export function clipFile(text, config, ext) {
  return join(clipsDir(), `${clipId(text, config)}.${ext}`);
}

export function findCachedClip(text, config) {
  for (const ext of ["mp3", "wav", "aiff"]) {
    const p = clipFile(text, config, ext);
    try {
      if (existsSync(p) && statSync(p).size > 32) return p;
    } catch {
      // missing
    }
  }
  return null;
}

function writeAtomic(path, buf) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, path);
}

function pruneClips(keepPath) {
  const dir = clipsDir();
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => !f.endsWith(".tmp"));
  } catch {
    return;
  }
  if (files.length <= 24) return;
  const rows = files
    .map((f) => {
      const p = join(dir, f);
      let mtime = 0;
      try {
        mtime = statSync(p).mtimeMs;
      } catch {
        mtime = 0;
      }
      return { p, mtime };
    })
    .sort((a, b) => a.mtime - b.mtime);
  for (const row of rows.slice(0, rows.length - 24)) {
    if (row.p === keepPath) continue;
    try {
      unlinkSync(row.p);
    } catch {
      // busy
    }
  }
}

export function clearClipCache() {
  const dir = join(paths.CODA_DIR, "clips");
  let files = [];
  try {
    files = readdirSync(dir);
  } catch {
    return;
  }
  for (const f of files) {
    try {
      unlinkSync(join(dir, f));
    } catch {
      // busy
    }
  }
}

function synthEspeak(text, config) {
  const bin = has("espeak-ng") ? "espeak-ng" : "espeak";
  const wav = clipFile(text, config, "wav");
  const wpm = Math.max(80, Math.round(175 * (config.speed || 1)));
  const args = ["-w", wav, "-s", String(wpm), text];
  const r = spawnSync(bin, args, { stdio: "ignore" });
  if (r.status !== 0) throw new Error(`${bin} failed to synthesize`);
  return wav;
}

function synthApple(text, config) {
  const aiff = clipFile(text, config, "aiff");
  const wpm = Math.max(80, Math.round(175 * (config.speed || 1)));
  const r = spawnSync("say", ["-r", String(wpm), "-o", aiff, text], {
    stdio: "ignore",
  });
  if (r.status !== 0) throw new Error("say failed to synthesize");
  return aiff;
}

function pcmToWav(pcm, sampleRate = 24000) {
  if (pcm.length >= 12 && pcm.subarray(0, 4).toString("ascii") === "RIFF") return pcm;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

export function speechFormat(model) {
  if (String(model || "").startsWith("google/gemini")) return "pcm";
  return "mp3";
}

async function synthHttp(url, headers, body, ext, destPath) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`TTS request failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  let buf = Buffer.from(await res.arrayBuffer());
  let outExt = ext;
  if (ext === "pcm") {
    buf = pcmToWav(buf);
    outExt = "wav";
  }
  const dest = destPath || clipFile(body?.input || "clip", {}, outExt);
  writeAtomic(dest, buf);
  return dest;
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
    "mp3",
    clipFile(text, config, "mp3")
  );
}

export function openrouterRequestBody(text, config) {
  const model = config.model || "x-ai/grok-voice-tts-1.0";
  return {
    model,
    input: text,
    voice: config.voice || "eve",
    response_format: speechFormat(model),
    speed: config.speed || 1.0,
  };
}

function synthOpenrouter(text, config) {
  const key = getApiKey("openrouter");
  if (!key) throw new Error("OPENROUTER_API_KEY is not set (run: coda key openrouter)");
  const body = openrouterRequestBody(text, config);
  const ext = body.response_format === "pcm" ? "wav" : body.response_format;
  return synthHttp(
    "https://openrouter.ai/api/v1/audio/speech",
    {
      authorization: `Bearer ${key}`,
      "http-referer": "https://github.com/c-staton/coda",
      "x-title": "Coda",
    },
    body,
    body.response_format,
    clipFile(text, config, ext)
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
    "mp3",
    clipFile(text, config, "mp3")
  );
}

const synthJobs = new Map();

export function synthesize(text, config, options = {}) {
  config = liveVoiceConfig(config);
  const engine = resolveEngine(config);
  const spoken = forSpeech(text);
  if (!spoken) return Promise.resolve({ engine, audioPath: null });
  if (engine === "print") return Promise.resolve({ engine, audioPath: null, print: spoken });
  const id = clipId(spoken, config);
  const existing = synthJobs.get(id);
  if (existing) return existing;
  const job = synthesizeNow(spoken, config, engine, options).finally(() => synthJobs.delete(id));
  synthJobs.set(id, job);
  return job;
}

async function synthesizeNow(spoken, config, engine, options) {
  const cached = findCachedClip(spoken, config);
  if (cached) return { engine, audioPath: cached, cached: true };
  if (options.showLoading) codaCtl("loading");
  let audioPath;
  try {
    if (engine === "espeak") audioPath = synthEspeak(spoken, config);
    else if (engine === "apple") audioPath = synthApple(spoken, config);
    else if (engine === "grok") audioPath = await synthGrok(spoken, config);
    else if (engine === "openai") audioPath = await synthOpenai(spoken, config);
    else if (engine === "openrouter") audioPath = await synthOpenrouter(spoken, config);
    else throw new Error(`Unknown engine: ${engine}`);
  } catch (err) {
    if (options.showLoading) codaCtl("stop");
    throw err;
  }
  pruneClips(audioPath);
  return { engine, audioPath };
}

export function playPrepared(audioPath, options = {}) {
  const startedAt = Number(options.startedAt) || 0;
  if (startedAt) {
    const s = getState();
    if (Number(s.queueSkipAt || 0) > startedAt || Number(s.queueStopAt || 0) > startedAt) {
      codaCtl("stop");
      return { played: false, aborted: true, audioPath };
    }
  }
  if (!audioPath) return { played: false, audioPath: null };
  const { played, player } = playFile(audioPath, { wait: Boolean(options.wait) });
  return { played, player, audioPath };
}

export async function speak(text, config, options = {}) {
  config = liveVoiceConfig(config);
  const engine = resolveEngine(config);
  const spoken = forSpeech(text);

  if (!spoken) return { engine, played: false, audioPath: null };
  if (options.dryRun) return { engine, played: false, audioPath: null, dryRun: true };

  if (engine === "print") {
    process.stdout.write(`${spoken}\n`);
    return { engine, played: false, audioPath: null };
  }

  const prepared = await synthesize(spoken, config, { showLoading: options.showLoading !== false });
  if (!prepared.audioPath) return { engine, played: false, audioPath: null };
  const out = playPrepared(prepared.audioPath, options);
  return { engine, ...out };
}

export { stopCurrent };

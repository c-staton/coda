// TTS engine abstraction. Cursor-agnostic and dependency-free.
//
// Engines:
//   apple  -> macOS `say`
//   espeak -> Linux `espeak-ng` (generates a WAV; plays if an audio player exists)
//   grok   -> xAI Grok TTS (POST https://api.x.ai/v1/tts, needs XAI_API_KEY)
//   openai -> OpenAI Speech (POST /v1/audio/speech, needs OPENAI_API_KEY)
//   print  -> zero-dependency fallback: writes the digest to stdout
//
// "One utterance at a time": starting a new play stops the tracked player PID.
// We never `killall` a player, so unrelated audio is left alone.

import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths, getState, setState } from "./state.mjs";

function has(cmd) {
  const r = spawnSync("which", [cmd], { stdio: "ignore" });
  return r.status === 0;
}

export function resolveEngine(config) {
  if (config.engine && config.engine !== "auto") return config.engine;
  if (has("say")) return "apple"; // macOS
  if (has("espeak-ng") || has("espeak")) return "espeak"; // Linux
  return "print"; // always works, never blocks a hook
}

function firstPlayer() {
  for (const p of ["afplay", "aplay", "paplay", "ffplay"]) {
    if (has(p)) return p;
  }
  return null;
}

function stopCurrent() {
  const { playerPid } = getState();
  if (!playerPid) return;
  try {
    process.kill(playerPid, "SIGTERM");
  } catch {
    // already gone
  }
  setState({ playerPid: null });
}

function playFile(path) {
  const player = firstPlayer();
  if (!player) return { played: false, player: null };
  stopCurrent();
  const args = player === "ffplay" ? ["-nodisp", "-autoexit", path] : [path];
  const child = spawn(player, args, { detached: true, stdio: "ignore" });
  child.unref();
  setState({ playerPid: child.pid });
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

function synthGrok(text, config) {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("XAI_API_KEY is not set (required for engine 'grok')");
  return synthHttp(
    "https://api.x.ai/v1/tts",
    { authorization: `Bearer ${key}` },
    {
      model: "grok-tts",
      voice: config.voice || "eve",
      language: config.language || "auto",
      input: text,
    },
    "mp3"
  );
}

function synthOpenai(text, config) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set (required for engine 'openai')");
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

  let audioPath;
  if (engine === "espeak") audioPath = synthEspeak(text, config);
  else if (engine === "apple") audioPath = synthApple(text, config);
  else if (engine === "grok") audioPath = await synthGrok(text, config);
  else if (engine === "openai") audioPath = await synthOpenai(text, config);
  else throw new Error(`Unknown engine: ${engine}`);

  const { played, player } = playFile(audioPath);
  return { engine, played, player, audioPath };
}

export { stopCurrent };

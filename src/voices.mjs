// OpenRouter TTS voices. One pick sets both model and voice.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { paths } from "./state.mjs";

export const DEFAULT_VOICE = "eve";
export const DEFAULT_MODEL = "x-ai/grok-voice-tts-1.0";

const CACHE_MS = 60 * 60 * 1000;
let cache = { at: 0, groups: null };

const FALLBACK = [
  { model: "x-ai/grok-voice-tts-1.0", voices: ["eve", "ara", "rex", "leo", "sal"] },
  {
    model: "google/gemini-3.1-flash-tts-preview",
    voices: ["Kore", "Puck", "Charon", "Zephyr", "Aoede", "Fenrir"],
  },
];

export function allowedModel(id) {
  const model = String(id || "");
  if (model.startsWith("x-ai/grok-voice")) return true;
  if (model.startsWith("google/gemini") && model.includes("tts")) return true;
  return false;
}

function modelRank(id) {
  if (String(id).startsWith("x-ai/grok-voice")) return 0;
  if (String(id).startsWith("google/gemini")) return 1;
  return 99;
}

function sameFamily(a, b) {
  const families = ["x-ai/grok-voice", "openai/", "google/gemini"];
  return families.some((p) => a.startsWith(p) && b.startsWith(p));
}

function withFallback(groups) {
  const extra = fallbackVoiceGroups().filter(
    (g) => !groups.some((x) => x.model === g.model || sameFamily(x.model, g.model))
  );
  return [...groups, ...extra].sort(
    (a, b) => modelRank(a.model) - modelRank(b.model) || a.model.localeCompare(b.model)
  );
}

const GEMINI_VOICES = ["Kore", "Puck", "Charon", "Zephyr", "Aoede", "Fenrir"];

function pickVoices(model, voices) {
  if (!String(model).startsWith("google/gemini")) return voices;
  const allow = new Set(GEMINI_VOICES.map((v) => v.toLowerCase()));
  const picked = voices.filter((v) => allow.has(String(v).toLowerCase()));
  return picked.length ? picked : GEMINI_VOICES;
}

export function voiceKey(model, voice) {
  return `${model}::${voice}`;
}

export function parseVoiceKey(raw) {
  const id = String(raw || "").trim();
  const i = id.indexOf("::");
  if (i <= 0) {
    return { model: DEFAULT_MODEL, voice: id || DEFAULT_VOICE };
  }
  return { model: id.slice(0, i), voice: id.slice(i + 2) };
}

export function companyLabel(model) {
  const id = String(model || "");
  if (id.startsWith("x-ai/")) return "xai";
  if (id.startsWith("openai/")) return "openai";
  if (id.startsWith("google/")) return "google";
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : id;
}

export function formatVoiceChoice(model, voice) {
  return `${voice} · ${companyLabel(model)}`;
}

function packGroups(rows) {
  return rows
    .filter((row) => allowedModel(row.model) && Array.isArray(row.voices) && row.voices.length)
    .sort((a, b) => modelRank(a.model) - modelRank(b.model) || a.model.localeCompare(b.model))
    .map((row) => ({
      model: row.model,
      company: companyLabel(row.model),
      voices: pickVoices(row.model, row.voices)
        .filter((v) => v && v !== "none")
        .map((voice) => ({
          id: voiceKey(row.model, voice),
          voice,
          model: row.model,
          label: voice,
        })),
    }))
    .filter((g) => g.voices.length);
}

export function fallbackVoiceGroups() {
  return packGroups(FALLBACK);
}

function groupsFromCatalog(models) {
  const rows = [];
  for (const m of Array.isArray(models) ? models : []) {
    const id = String(m?.id || "");
    const voices = m?.supported_voices;
    if (!id || !Array.isArray(voices) || !voices.length) continue;
    rows.push({ model: id, voices });
  }
  return packGroups(rows);
}

export async function loadVoiceGroups() {
  if (cache.groups && Date.now() - cache.at < CACHE_MS) return cache.groups;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models?output_modalities=speech", {
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("catalog");
    const body = await res.json();
    const groups = withFallback(groupsFromCatalog(body.data));
    if (!groups.length) throw new Error("empty");
    cache = { at: Date.now(), groups };
    return groups;
  } catch {
    cache = { at: Date.now(), groups: fallbackVoiceGroups() };
    return cache.groups;
  } finally {
    clearTimeout(timer);
  }
}

export function flattenVoices(groups) {
  return groups.flatMap((g) => g.voices);
}

export function knownVoice(groups, model, voice) {
  const id = voiceKey(model, voice);
  return flattenVoices(groups).some((v) => v.id === id);
}

export function writeVoiceCatalog(groups) {
  mkdirSync(dirname(paths.VOICES_PATH), { recursive: true });
  writeFileSync(paths.VOICES_PATH, JSON.stringify({ groups }) + "\n", "utf8");
}

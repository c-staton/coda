// Turn long or messy text into a short spoken line.

const DEFAULTS = {
  maxChars: 800,
  minChars: 3,
  tailSentences: 4,
};

// Documented Grok speech tags that may appear as literal model output. We drop
// the ones that would be read as words but were never meant to be spoken.
const SPEECH_TAG_WORDS = new Set([
  "laugh",
  "laughs",
  "sigh",
  "sighs",
  "whisper",
  "whispers",
  "shout",
  "shouts",
  "cough",
  "clears throat",
  "pause",
  "excited",
  "sarcastic",
  "angry",
  "sad",
  "happy",
]);

export function extractCodaTag(text) {
  if (typeof text !== "string") return null;
  let last = null;

  const tagRe = /<coda>([\s\S]*?)<\/coda>/gi;
  let m;
  while ((m = tagRe.exec(text)) !== null) last = m[1];

  const commentRe = /<!--\s*coda:\s*([\s\S]*?)-->/gi;
  while ((m = commentRe.exec(text)) !== null) last = m[1];

  if (last == null) return null;
  const cleaned = stripInlineNoise(last).trim();
  return cleaned.length ? cleaned : null;
}

/** Remove fenced code blocks entirely (we never speak code). */
function stripFencedCode(text) {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/~~~[\s\S]*?~~~/g, " ");
}

/** Remove markdown table rows (lines that look like | a | b |). */
function stripTables(text) {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t.startsWith("|")) return true;
      return false;
    })
    .join("\n");
}

/** Strip images, html tags, and speech tags; keep numeric [1] citations. */
function stripInlineNoise(text) {
  let out = text;

  // Images: ![alt](url) -> drop entirely.
  out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");

  // Links: [label](url) -> label.
  out = out.replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1");

  // HTML / angle-bracket tags (incl. <whisper> style speech tags).
  out = out.replace(/<[^>]+>/g, " ");

  // Bracketed speech tags like [laugh], [clears throat]; keep [1] citations.
  out = out.replace(/\[([^\]]+)\]/g, (full, inner) => {
    const key = inner.trim().toLowerCase();
    if (/^\d+$/.test(key)) return full; // citation -> keep
    if (SPEECH_TAG_WORDS.has(key)) return " ";
    return full;
  });

  // Inline code backticks -> keep the words, drop the ticks.
  out = out.replace(/`([^`]*)`/g, "$1");

  // Emphasis markers.
  out = out.replace(/(\*\*|\*|__|_|~~)/g, "");

  return out;
}

/** Strip block-level markdown scaffolding to leave prose. */
function stripBlockMarkdown(text) {
  return text
    .split("\n")
    .map((line) => {
      let t = line;
      t = t.replace(/^\s{0,3}#{1,6}\s+/, ""); // headings
      t = t.replace(/^\s{0,3}>\s?/, ""); // blockquotes
      t = t.replace(/^\s*[-*+]\s+/, ""); // bullet list
      t = t.replace(/^\s*\d+[.)]\s+/, ""); // ordered list
      t = t.replace(/^\s*[-*_]{3,}\s*$/, ""); // horizontal rules
      return t;
    })
    .join("\n");
}

/** Split prose into sentences (rough but dependency-free). */
export function splitSentences(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?|\S[^.!?]*$/g);
  return (parts || [normalized]).map((s) => s.trim()).filter(Boolean);
}

function collapseWhitespace(text) {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Build a spoken digest from a finished assistant reply.
 * Returns a trimmed string to speak, or null if there is nothing worth speaking.
 */
export function digest(text, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (typeof text !== "string" || !text.trim()) return null;

  // 1. Explicit author wrap-up wins.
  const tagged = extractCodaTag(text);
  if (tagged) return clampToBatchLimit(tagged);

  // 2. Reduce markdown to plain prose.
  let prose = text;
  prose = stripFencedCode(prose);
  prose = stripTables(prose);
  prose = stripBlockMarkdown(prose);
  prose = stripInlineNoise(prose);
  prose = collapseWhitespace(prose);

  // 3. Nothing meaningful left (was mostly code / tables / trivial).
  if (!prose || prose.length < opts.minChars) return null;
  if (!/[a-zA-Z0-9]/.test(prose)) return null;

  // 4. Short enough: speak all of it.
  if (prose.length <= opts.maxChars) return clampToBatchLimit(prose);

  // 5. Long reply: speak the closing wrap-up (last few sentences).
  const sentences = splitSentences(prose);
  const tail = [];
  for (let i = sentences.length - 1; i >= 0; i--) {
    const candidate = [sentences[i], ...tail];
    if (candidate.join(" ").length > opts.maxChars && tail.length > 0) break;
    tail.unshift(sentences[i]);
    if (tail.length >= opts.tailSentences) break;
  }
  const wrapUp = tail.join(" ").trim();
  return clampToBatchLimit(wrapUp || prose.slice(-opts.maxChars).trim());
}

// TTS batch endpoints cap input length (xAI Grok TTS ~15k chars). Keep us safe.
const BATCH_LIMIT = 15000;
function clampToBatchLimit(text) {
  if (text.length <= BATCH_LIMIT) return text;
  return text.slice(0, BATCH_LIMIT);
}

/**
 * Split a finished reply into Speechify-style playable blocks.
 * Code/tables are dropped; long paragraphs are broken on sentence boundaries.
 */
export function splitBlocks(text, options = {}) {
  const maxBlockChars = options.maxBlockChars || 360;
  if (typeof text !== "string" || !text.trim()) return [];

  let prose = stripFencedCode(text);
  prose = stripTables(prose);
  prose = stripBlockMarkdown(prose);
  prose = stripInlineNoise(prose);

  const paras = prose
    .split(/\n\s*\n/)
    .map((p) => collapseWhitespace(p))
    .filter((p) => p.length >= 3 && /[a-zA-Z0-9]/.test(p));

  const blocks = [];
  for (const para of paras) {
    if (para.length <= maxBlockChars) {
      blocks.push(para);
      continue;
    }
    const sentences = splitSentences(para);
    let buf = "";
    for (const sentence of sentences) {
      const next = buf ? `${buf} ${sentence}` : sentence;
      if (buf && next.length > maxBlockChars) {
        blocks.push(buf);
        buf = sentence;
      } else {
        buf = next;
      }
    }
    if (buf) blocks.push(buf);
  }
  return blocks;
}

export default digest;

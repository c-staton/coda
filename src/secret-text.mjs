// Do not read keys, UUIDs, long numbers, or other tokens past a normal word.
// Swap them for a short spoken word so the sentence still holds together.

const MAX_WORD = 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeSecret(text) {
  const t = String(text || "").trim();
  return /^(sk-[A-Za-z0-9_-]{8,}|sk-or-[A-Za-z0-9_-]{8,}|sk-xai-[A-Za-z0-9_-]{8,})/.test(t);
}

function splitToken(token) {
  const lead = (token.match(/^[^A-Za-z0-9]*/) || [""])[0];
  const tail = (token.match(/[^A-Za-z0-9]*$/) || [""])[0];
  const core = token.slice(lead.length, token.length - tail.length);
  return { lead, core, tail };
}

export function isUnreadableToken(token) {
  const { core } = splitToken(String(token || ""));
  if (!core) return false;
  if (looksLikeSecret(core)) return true;
  if (UUID.test(core)) return true;
  const digits = core.replace(/[,_]/g, "");
  if (/^\d+$/.test(digits) && digits.length >= 13) return true;
  if (/^[0-9a-f]+$/i.test(core) && core.length >= 20) return true;
  return core.length > MAX_WORD;
}

function spokenWord(core) {
  const digits = core.replace(/[,_]/g, "");
  if (/^\d+$/.test(digits) && digits.length >= 13) return "number";
  return "code";
}

export function forSpeech(text) {
  const raw = String(text || "");
  if (!raw.trim()) return "";
  return raw
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part) || !isUnreadableToken(part)) return part;
      const { lead, core, tail } = splitToken(part);
      return `${lead}${spokenWord(core)}${tail}`;
    })
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

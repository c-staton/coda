// Do not read or remember strings that look like API keys.
export function looksLikeSecret(text) {
  const t = String(text || "").trim();
  return /^(sk-[A-Za-z0-9_-]{8,}|sk-or-[A-Za-z0-9_-]{8,}|sk-xai-[A-Za-z0-9_-]{8,})/.test(t);
}

export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export function normalizeSpeed(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  let best = 1;
  let dist = Infinity;
  for (const s of SPEED_OPTIONS) {
    const d = Math.abs(s - n);
    if (d < dist) {
      best = s;
      dist = d;
    }
  }
  return best;
}

export function formatSpeed(raw) {
  const n = normalizeSpeed(raw);
  return n === 1 ? "1×" : `${n}×`;
}

export function speedChoices() {
  return SPEED_OPTIONS.map((id) => ({ id, label: formatSpeed(id) }));
}

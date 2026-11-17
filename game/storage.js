// storage.js: async key/value API so callers never care where data lives.
// Phase 3: localStorage. Phase 4 adds Telegram CloudStorage behind the same functions.
const PREFIX = 'sketchskate.';

function lsGet(k) {
  try { return localStorage.getItem(PREFIX + k); } catch { return null; } // private mode, disabled storage
}

function lsSet(k, v) {
  try { localStorage.setItem(PREFIX + k, v); } catch { /* quota or disabled: ignore */ }
}

export async function getBest() {
  const n = parseInt(lsGet('best') || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Only ever raises the stored best. */
export async function setBest(n) {
  const v = Math.floor(n);
  if (v > (await getBest())) lsSet('best', String(v));
}

export async function getFlag(name) {
  return lsGet('flag.' + name) === '1';
}

export async function setFlag(name, on = true) {
  lsSet('flag.' + name, on ? '1' : '0');
}

export async function getSetting(name, fallback) {
  const v = lsGet('set.' + name);
  if (v === null) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

export async function setSetting(name, value) {
  lsSet('set.' + name, JSON.stringify(value));
}

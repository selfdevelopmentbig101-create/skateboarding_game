// storage.js: async key/value API so callers never care where data lives.
// Best score: localStorage everywhere, plus Telegram CloudStorage inside Telegram (Phase 4).
// The two are merged with max(), so a lost or slow store can never lower the best score.
// Flags and settings stay on localStorage only.
import * as tg from './tg.js';

const PREFIX = 'sketchskate.';
const CLOUD_BEST = 'best'; // CloudStorage key (A-Z a-z 0-9 _ - only)

function lsGet(k) {
  try { return localStorage.getItem(PREFIX + k); } catch { return null; } // private mode, disabled storage
}

function lsSet(k, v) {
  try { localStorage.setItem(PREFIX + k, v); } catch { /* quota or disabled: ignore */ }
}

function toScore(s) {
  const n = parseInt(s || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const localBest = () => toScore(lsGet('best'));

/**
 * Highest known best. Inside Telegram this also reads CloudStorage (it gives up after
 * TG_STORAGE_TIMEOUT ms) and brings whichever store is behind up to date.
 */
export async function getBest() {
  const local = localBest();
  const raw = await tg.cloudGet(CLOUD_BEST); // null = unavailable / timed out, '' = never saved
  if (raw === null) return local;
  const cloud = toScore(raw);
  if (cloud > local) lsSet('best', String(cloud));
  else if (local > cloud) await tg.cloudSet(CLOUD_BEST, String(local));
  return Math.max(local, cloud);
}

/** Only ever raises the stored best, in both stores. */
export async function setBest(n) {
  const v = Math.floor(n);
  if (!(v > 0)) return;
  if (v > localBest()) lsSet('best', String(v));
  const raw = await tg.cloudGet(CLOUD_BEST);
  if (v > toScore(raw)) await tg.cloudSet(CLOUD_BEST, String(v));
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

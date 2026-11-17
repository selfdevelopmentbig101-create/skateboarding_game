// tg.js: every Telegram Mini App call goes through here. Each helper is guarded: it does nothing
// (or returns a harmless default) outside Telegram, on old clients and when a call throws, so the
// game stays fully playable in a normal browser. Telegram data is display-only (initDataUnsafe).
import * as C from './config.js';

const wa = () => (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null;
const call = (fn) => { try { fn(); return true; } catch { return false; } };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** True only inside a real Telegram client (or the ?tgmock=1 mock). The telegram-web-app.js
 *  script also defines Telegram.WebApp in a plain browser, but with empty initData. */
export function inTelegram() {
  const w = wa();
  return !!(w && (w.initData || (w.platform && w.platform !== 'unknown')));
}

/** Bot API version check; false outside Telegram or when the check itself is missing. */
export function atLeast(v) {
  const w = wa();
  try { return !!(inTelegram() && w.isVersionAtLeast && w.isVersionAtLeast(v)); } catch { return false; }
}

/** Short description for the ?debug=1 overlay. */
export function status() {
  const w = wa();
  if (!inTelegram()) return 'off';
  return `v${w.version} ${w.platform}${w.isFullscreen ? ' fullscreen' : ''}`;
}

let handlers = {};
let started = false;
const fire = (name) => { try { if (handlers[name]) handlers[name](); } catch { /* never break the game */ } };

/**
 * Call once at load. h = { onLayout, onDeactivated }:
 *  onLayout()       size, safe area, fullscreen or theme changed: the game should re-layout
 *  onDeactivated()  Mini App went to the background (Bot API 8.0+): the game should pause
 * Returns true when running inside Telegram.
 */
export function init(h) {
  handlers = h || {};
  if (started || !inTelegram()) return false;
  started = true;
  const w = wa();
  call(() => w.ready());
  call(() => w.expand());
  // Swiping down would minimise the app mid-run (7.7+).
  if (atLeast('7.7')) call(() => w.disableVerticalSwipes());
  // lockOrientation() locks the CURRENT orientation, so only call it when we are in portrait.
  if (atLeast('8.0') && typeof window !== 'undefined' && window.innerHeight >= window.innerWidth) {
    call(() => w.lockOrientation());
  }
  applyTheme();
  applyColors();
  const on = (ev, fn) => call(() => w.onEvent(ev, fn));
  on('themeChanged', () => { applyTheme(); applyColors(); fire('onLayout'); });
  for (const ev of ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged']) {
    on(ev, () => fire('onLayout'));
  }
  on('deactivated', () => fire('onDeactivated')); // only emitted by 8.0+ clients
  return true;
}

// ---------- Theme ----------
/** Maps themeParams onto CSS variables for the UI outside the canvas ("paper" stays white). */
export function applyTheme() {
  const w = wa();
  if (!inTelegram() || typeof document === 'undefined') return;
  const p = w.themeParams || {};
  const root = document.documentElement.style;
  // Only accept #rgb / #rrggbb(aa) so nothing odd can reach the stylesheet.
  const set = (name, v) => { if (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)) root.setProperty(name, v); };
  set('--outer-bg', p.bg_color);
  set('--outer-text', p.text_color);
  set('--tg-button', p.button_color);
  set('--tg-button-text', p.button_text_color);
  set('--tg-hint', p.hint_color);
  set('--tg-secondary-bg', p.secondary_bg_color);
}

/** Header, background and bottom bar colours of the Telegram chrome around the app. */
function applyColors() {
  const w = wa();
  if (!atLeast('6.1')) return;
  const hex = atLeast('6.9'); // hex colours need 6.9, older clients only know theme keys
  const bg = (w.themeParams && w.themeParams.bg_color) || C.PAPER;
  call(() => w.setHeaderColor(hex ? C.PAPER : 'bg_color')); // header matches the paper canvas
  call(() => w.setBackgroundColor(hex ? bg : 'bg_color'));  // outside the canvas follows the theme
  if (atLeast('7.10')) call(() => w.setBottomBarColor(bg));
}

// ---------- Layout ----------
const cssVarPx = (name) => {
  try { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0; } catch { return 0; }
};

/**
 * Merges the device insets from env(safe-area-inset-*) (env = {top,right,bottom,left}, CSS px)
 * with Telegram's: max(env, safeAreaInset) + contentSafeAreaInset (the Telegram header buttons).
 */
export function mergeInsets(env) {
  const out = { top: env.top, right: env.right, bottom: env.bottom, left: env.left };
  const w = wa();
  if (!atLeast('8.0')) return out;
  const s = w.safeAreaInset, c = w.contentSafeAreaInset;
  for (const k of ['top', 'right', 'bottom', 'left']) {
    // Prefer the JS objects; fall back to the --tg-*-inset-* CSS variables Telegram also sets.
    const safe = s ? num(s[k]) : cssVarPx(`--tg-safe-area-inset-${k}`);
    const content = c ? num(c[k]) : cssVarPx(`--tg-content-safe-area-inset-${k}`);
    out[k] = Math.max(env[k], safe) + content;
  }
  return out;
}

/** Height of the visible area in CSS px: viewportStableHeight in Telegram, else the fallback. */
export function viewHeight(fallback) {
  const w = wa();
  if (inTelegram() && num(w.viewportStableHeight) > 0) return Math.min(fallback, w.viewportStableHeight);
  return fallback;
}

let fsTried = false;
/** Ask for fullscreen once, from the first tap. Mobile clients only; failures are ignored. */
export function tryFullscreen() {
  if (fsTried || !C.TG_FULLSCREEN || !atLeast('8.0')) return;
  fsTried = true;
  const w = wa();
  if (w.isFullscreen || !/^(android|android_x|ios)$/.test(String(w.platform))) return;
  call(() => w.requestFullscreen());
}

// ---------- Feedback ----------
/** style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' */
export function impact(style) {
  if (atLeast('6.1')) call(() => wa().HapticFeedback.impactOccurred(style));
}

/** type: 'success' | 'warning' | 'error' */
export function notify(type) {
  if (atLeast('6.1')) call(() => wa().HapticFeedback.notificationOccurred(type));
}

let closing = false;
/** "Are you sure you want to close?" prompt while a run is in progress. */
export function setClosingConfirmation(on) {
  if (on === closing) return;
  closing = on;
  if (inTelegram()) call(() => (on ? wa().enableClosingConfirmation() : wa().disableClosingConfirmation()));
}

// ---------- MainButton ("Play again") ----------
let mbCb = null;
export function showMainButton(text, cb) {
  if (!C.TG_USE_MAIN_BUTTON || !inTelegram() || !wa().MainButton) return false;
  if (mbCb === cb) return true;
  hideMainButton();
  const mb = wa().MainButton;
  const ok = call(() => { mb.setText(text); mb.onClick(cb); mb.show(); });
  if (ok) mbCb = cb;
  return ok;
}

export function hideMainButton() {
  if (!mbCb) return;
  const mb = wa() && wa().MainButton, cb = mbCb;
  mbCb = null;
  if (mb) call(() => { mb.offClick(cb); mb.hide(); });
}

// ---------- User, sharing ----------
/** First name for the game-over screen (display only, never trusted). */
export function userName() {
  const w = wa();
  const u = w && w.initDataUnsafe && w.initDataUnsafe.user;
  const n = u && typeof u.first_name === 'string' ? u.first_name.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  return n ? Array.from(n).slice(0, C.NAME_MAX).join('') : 'Skater';
}

/** The Mini App link to share; until the bot placeholders are filled in, the page URL is used. */
export function miniAppLink() {
  if (!C.MINI_APP_LINK.includes('<')) return C.MINI_APP_LINK;
  return typeof location !== 'undefined' ? location.origin + location.pathname : '';
}

/** Opens Telegram's share sheet. Returns false outside Telegram so the caller can fall back. */
export function share(text, url) {
  if (!inTelegram() || !wa().openTelegramLink) return false;
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  return call(() => wa().openTelegramLink(link));
}

// ---------- CloudStorage (callback API wrapped in Promises, with a timeout) ----------
const cloudOk = () => atLeast('6.9') && !!wa().CloudStorage;

function cloud(run, failValue) {
  return new Promise((resolve) => {
    if (!cloudOk()) { resolve(failValue); return; }
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => finish(failValue), C.TG_STORAGE_TIMEOUT);
    try { run(finish); } catch { finish(failValue); }
  });
}

/** Resolves the stored string ('' if the key was never saved) or null on error / timeout. */
export function cloudGet(key) {
  return cloud((done) => wa().CloudStorage.getItem(key, (err, v) => done(err || typeof v !== 'string' ? null : v)), null);
}

/** Resolves true when the value was stored. */
export function cloudSet(key, value) {
  return cloud((done) => wa().CloudStorage.setItem(key, String(value), (err, ok) => done(!err && !!ok)), false);
}

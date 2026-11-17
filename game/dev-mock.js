// dev-mock.js: DEV ONLY. A small fake of window.Telegram.WebApp so every Telegram code path in
// tg.js can be exercised in a plain browser. main.js imports this file only when the page URL
// has ?tgmock=1; in normal use it is never loaded.
//
// Options (all optional URL params): tgver=7.0 (pretend to be an older client), tgplatform=ios,
// tgname=Ada, tgtheme=dark, tgslow=1 (CloudStorage replies after 5 s, to test the timeout).
// In the console: __tgmock.log (every call), __tgmock.dark(), __tgmock.light(),
// __tgmock.deactivate(), __tgmock.activate(), __tgmock.emit('viewportChanged').
const q = new URLSearchParams(window.location.search);
const VERSION = q.get('tgver') || '8.0';
const SLOW = q.get('tgslow') === '1';

const LIGHT = {
  bg_color: '#ffffff', text_color: '#000000', hint_color: '#999999', link_color: '#2481cc',
  button_color: '#2481cc', button_text_color: '#ffffff', secondary_bg_color: '#f0f0f0',
};
const DARK = {
  bg_color: '#212121', text_color: '#ffffff', hint_color: '#aaaaaa', link_color: '#8774e1',
  button_color: '#8774e1', button_text_color: '#ffffff', secondary_bg_color: '#181818',
};

const log = [];
const note = (...a) => { log.push(a); console.info('[tgmock]', ...a); };

/** Compares dotted versions: true when a >= b. */
function atLeast(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0;
  }
  return true;
}

/** A method that exists, but throws on clients older than `since` (like the real WebApp). */
const since = (v, name, fn) => (...args) => {
  if (!atLeast(VERSION, v)) throw new Error(`WebAppMethodUnsupported: ${name} needs ${v}, mock is ${VERSION}`);
  note(name, ...args);
  return fn ? fn(...args) : undefined;
};

const listeners = {};
const emit = (ev, data) => (listeners[ev] || []).slice().forEach((fn) => fn(data));

// ---- CloudStorage, backed by localStorage ----
const CLOUD_PREFIX = 'tgmock.cloud.';
const KEY_OK = /^[A-Za-z0-9_-]{1,128}$/;
const later = (fn) => setTimeout(fn, SLOW ? 5000 : 20);
const CloudStorage = {
  getItem: since('6.9', 'CloudStorage.getItem', (key, cb) => later(() => {
    if (!KEY_OK.test(key)) { cb('KEY_INVALID'); return; }
    cb(null, localStorage.getItem(CLOUD_PREFIX + key) || '');
  })),
  setItem: since('6.9', 'CloudStorage.setItem', (key, value, cb) => later(() => {
    if (!KEY_OK.test(key) || String(value).length > 4096) { cb && cb('VALUE_INVALID'); return; }
    localStorage.setItem(CLOUD_PREFIX + key, String(value));
    cb && cb(null, true);
  })),
  removeItem: since('6.9', 'CloudStorage.removeItem', (key, cb) => later(() => {
    localStorage.removeItem(CLOUD_PREFIX + key);
    cb && cb(null, true);
  })),
};

// ---- MainButton: a plain DOM bar at the bottom so it can be seen and clicked ----
let mbBar = null;
const mbClicks = [];
function mbEl() {
  if (!mbBar && typeof document !== 'undefined' && document.body && document.createElement) {
    mbBar = document.createElement('div');
    mbBar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:48px;display:none;align-items:center;' +
      'justify-content:center;font:700 16px system-ui,sans-serif;z-index:50;cursor:pointer;';
    mbBar.addEventListener('click', () => mbClicks.slice().forEach((fn) => fn()));
    document.body.appendChild(mbBar);
  }
  return mbBar;
}
function paintMb() {
  const el = mbEl();
  if (!el) return;
  el.style.background = WebApp.themeParams.button_color;
  el.style.color = WebApp.themeParams.button_text_color;
  el.textContent = MainButton.text;
  el.style.display = MainButton.isVisible ? 'flex' : 'none';
}
const MainButton = {
  text: 'CONTINUE', isVisible: false,
  setText(t) { note('MainButton.setText', t); this.text = t; paintMb(); return this; },
  show() { note('MainButton.show'); this.isVisible = true; paintMb(); return this; },
  hide() { note('MainButton.hide'); this.isVisible = false; paintMb(); return this; },
  onClick(fn) { mbClicks.push(fn); return this; },
  offClick(fn) { const i = mbClicks.indexOf(fn); if (i >= 0) mbClicks.splice(i, 1); return this; },
};

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };
const WebApp = {
  version: VERSION,
  platform: q.get('tgplatform') || 'android',
  colorScheme: q.get('tgtheme') === 'dark' ? 'dark' : 'light',
  themeParams: Object.assign({}, q.get('tgtheme') === 'dark' ? DARK : LIGHT),
  initData: 'mock_init_data=1', // never valid on a server; display-only here
  initDataUnsafe: { user: { id: 1, first_name: q.get('tgname') || 'Mocky' }, auth_date: 0, hash: 'mock' },
  isExpanded: false, isFullscreen: false, isActive: true,
  safeAreaInset: Object.assign({}, ZERO), contentSafeAreaInset: Object.assign({}, ZERO),
  get viewportHeight() { return window.innerHeight; },
  get viewportStableHeight() { return window.innerHeight; },
  isVersionAtLeast: (v) => atLeast(VERSION, v),
  onEvent(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
  offEvent(ev, fn) { const l = listeners[ev] || [], i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
  ready: since('6.0', 'ready'),
  expand: since('6.0', 'expand', () => { WebApp.isExpanded = true; }),
  disableVerticalSwipes: since('7.7', 'disableVerticalSwipes'),
  enableVerticalSwipes: since('7.7', 'enableVerticalSwipes'),
  lockOrientation: since('8.0', 'lockOrientation'),
  unlockOrientation: since('8.0', 'unlockOrientation'),
  enableClosingConfirmation: since('6.2', 'enableClosingConfirmation'),
  disableClosingConfirmation: since('6.2', 'disableClosingConfirmation'),
  setHeaderColor: since('6.1', 'setHeaderColor'),
  setBackgroundColor: since('6.1', 'setBackgroundColor'),
  setBottomBarColor: since('7.10', 'setBottomBarColor'),
  requestFullscreen: since('8.0', 'requestFullscreen', () => {
    WebApp.isFullscreen = true;
    // Typical phone: status bar + Telegram's own close/menu buttons overlay the top.
    WebApp.safeAreaInset = { top: 24, right: 0, bottom: 16, left: 0 };
    WebApp.contentSafeAreaInset = { top: 44, right: 0, bottom: 0, left: 0 };
    setTimeout(() => { emit('fullscreenChanged'); emit('safeAreaChanged'); emit('contentSafeAreaChanged'); }, 30);
  }),
  exitFullscreen: since('8.0', 'exitFullscreen', () => {
    WebApp.isFullscreen = false;
    WebApp.safeAreaInset = Object.assign({}, ZERO);
    WebApp.contentSafeAreaInset = Object.assign({}, ZERO);
    setTimeout(() => { emit('fullscreenChanged'); emit('safeAreaChanged'); emit('contentSafeAreaChanged'); }, 30);
  }),
  openTelegramLink: since('6.0', 'openTelegramLink'),
  HapticFeedback: {
    impactOccurred: since('6.1', 'Haptic.impact'),
    notificationOccurred: since('6.1', 'Haptic.notification'),
    selectionChanged: since('6.1', 'Haptic.selection'),
  },
  MainButton, CloudStorage,
};
if (!atLeast(VERSION, '8.0')) { delete WebApp.safeAreaInset; delete WebApp.contentSafeAreaInset; }

function setTheme(name) {
  WebApp.colorScheme = name;
  WebApp.themeParams = Object.assign({}, name === 'dark' ? DARK : LIGHT);
  paintMb();
  emit('themeChanged');
}

// Install over the real script's object (or create one if that script did not load).
const T = window.Telegram || (window.Telegram = {});
try { T.WebApp = WebApp; } catch { /* read-only: fall through */ }
if (T.WebApp !== WebApp) {
  try { Object.defineProperty(T, 'WebApp', { value: WebApp, configurable: true }); } catch { /* ignore */ }
}
if (T.WebApp !== WebApp) console.warn('[tgmock] could not install the mock over Telegram.WebApp');

window.__tgmock = {
  log, emit,
  dark: () => setTheme('dark'), light: () => setTheme('light'),
  deactivate: () => { WebApp.isActive = false; emit('deactivated'); },
  activate: () => { WebApp.isActive = true; emit('activated'); },
};
note('installed', `v${VERSION}`, WebApp.platform);

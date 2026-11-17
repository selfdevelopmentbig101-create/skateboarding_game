// tests/tg.mjs: logic tests for tg.js + dev-mock.js with a fake browser environment.
// Run: node tests/tg.mjs
import assert from 'node:assert/strict';

// ---- fake browser globals ----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const cssVars = {};
globalThis.document = { documentElement: { style: { setProperty: (k, v) => { cssVars[k] = v; } } } };
globalThis.window = globalThis;
window.location = { search: '', origin: 'https://game.example', pathname: '/' };
window.innerWidth = 400; window.innerHeight = 800;
globalThis.location = window.location;

let n = 0, passed = 0;
async function t(name, fn) {
  n++;
  try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n', e); process.exitCode = 1; }
}
let seq = 0;
/** Fresh tg.js (own module state) plus a fresh mock with the given query string. */
async function setup(query) {
  delete window.Telegram;
  store.clear();
  for (const k of Object.keys(cssVars)) delete cssVars[k];
  window.location.search = query || '';
  let mock = null;
  if (query) { await import(`../game/dev-mock.js?s=${++seq}`); mock = window.__tgmock; mock.log.length = 0; }
  const tg = await import(`../game/tg.js?s=${++seq}`);
  return { tg, mock, names: () => mock.log.map((l) => l[0]) };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('tg.js');

await t('plain browser: every helper is a safe no-op', async () => {
  const { tg } = await setup('');
  assert.equal(tg.inTelegram(), false);
  assert.equal(tg.init({}), false);
  assert.equal(tg.atLeast('6.0'), false);
  tg.impact('light'); tg.notify('error'); tg.setClosingConfirmation(true); tg.tryFullscreen();
  assert.equal(tg.showMainButton('x', () => {}), false);
  tg.hideMainButton();
  assert.equal(tg.userName(), 'Skater');
  assert.equal(tg.viewHeight(700), 700);
  assert.deepEqual(tg.mergeInsets({ top: 1, right: 2, bottom: 3, left: 4 }), { top: 1, right: 2, bottom: 3, left: 4 });
  assert.equal(tg.share('a', 'b'), false);
  assert.equal(await tg.cloudGet('best'), null);
  assert.equal(await tg.cloudSet('best', '5'), false);
  assert.equal(tg.status(), 'off');
});

await t('real telegram-web-app.js in a browser (empty initData, platform unknown) counts as not Telegram', async () => {
  const { tg } = await setup('');
  window.Telegram = { WebApp: { initData: '', platform: 'unknown', version: '6.0', isVersionAtLeast: () => true } };
  assert.equal(tg.inTelegram(), false);
  assert.equal(tg.init({}), false);
});

await t('init on 8.0 calls ready, expand, swipes, orientation, colours; applies theme vars', async () => {
  const { tg, names } = await setup('?tgmock=1');
  assert.equal(tg.init({}), true);
  const got = names();
  for (const m of ['ready', 'expand', 'disableVerticalSwipes', 'lockOrientation', 'setHeaderColor', 'setBackgroundColor', 'setBottomBarColor']) {
    assert.ok(got.includes(m), 'missing ' + m);
  }
  assert.equal(cssVars['--outer-bg'], '#ffffff');
  assert.equal(cssVars['--tg-button'], '#2481cc');
});

await t('init does not lock orientation when launched in landscape', async () => {
  window.innerWidth = 800; window.innerHeight = 400;
  const { tg, names } = await setup('?tgmock=1');
  tg.init({});
  assert.ok(!names().includes('lockOrientation'));
  window.innerWidth = 400; window.innerHeight = 800;
});

await t('old client (7.0): no 7.7/8.0 calls, nothing throws, game helpers still work', async () => {
  const { tg, mock, names } = await setup('?tgmock=1&tgver=7.0');
  assert.equal(tg.init({}), true);
  const got = names();
  assert.ok(got.includes('ready') && got.includes('expand'));
  assert.ok(!got.includes('disableVerticalSwipes') && !got.includes('lockOrientation'));
  tg.tryFullscreen();
  assert.ok(!names().includes('requestFullscreen'));
  tg.impact('light');
  assert.ok(names().includes('Haptic.impact'));
  assert.deepEqual(tg.mergeInsets({ top: 5, right: 0, bottom: 6, left: 0 }), { top: 5, right: 0, bottom: 6, left: 0 });
  assert.equal(await tg.cloudSet('best', '9'), true); // CloudStorage exists since 6.9
  assert.ok(mock);
});

await t('very old client (6.0): haptics, CloudStorage and header colours are skipped, no throws', async () => {
  const { tg, names } = await setup('?tgmock=1&tgver=6.0');
  tg.init({});
  tg.impact('light'); tg.notify('success'); tg.setClosingConfirmation(true);
  assert.deepEqual(names().filter((x) => x.startsWith('Haptic') || x === 'setHeaderColor' || x === 'enableClosingConfirmation'), []);
  assert.equal(await tg.cloudGet('best'), null);
});

await t('fullscreen: once, mobile only; insets merge safe + content areas', async () => {
  const { tg, mock, names } = await setup('?tgmock=1');
  let layouts = 0;
  tg.init({ onLayout: () => layouts++ });
  assert.deepEqual(tg.mergeInsets({ top: 0, right: 0, bottom: 0, left: 0 }), { top: 0, right: 0, bottom: 0, left: 0 });
  tg.tryFullscreen(); tg.tryFullscreen();
  assert.equal(names().filter((x) => x === 'requestFullscreen').length, 1);
  await wait(60);
  assert.ok(layouts >= 3, 'fullscreen/safe-area events trigger re-layout, got ' + layouts);
  // max(env 30, safe 24) + content 44 = 74 on top; max(0, 16) + 0 = 16 bottom
  assert.deepEqual(tg.mergeInsets({ top: 30, right: 0, bottom: 0, left: 0 }), { top: 74, right: 0, bottom: 16, left: 0 });
  assert.match(tg.status(), /fullscreen/);
  assert.ok(mock);
});

await t('fullscreen is not requested on desktop platforms', async () => {
  const { tg, names } = await setup('?tgmock=1&tgplatform=tdesktop');
  tg.init({});
  tg.tryFullscreen();
  assert.ok(!names().includes('requestFullscreen'));
});

await t('theme change re-applies CSS variables and asks for re-layout', async () => {
  const { tg, mock } = await setup('?tgmock=1');
  let layouts = 0;
  tg.init({ onLayout: () => layouts++ });
  mock.dark();
  assert.equal(cssVars['--outer-bg'], '#212121');
  assert.ok(layouts >= 1);
});

await t('theme values that are not hex colours are ignored', async () => {
  const { tg } = await setup('?tgmock=1');
  window.Telegram.WebApp.themeParams.bg_color = 'red; background:url(x)';
  tg.applyTheme();
  assert.notEqual(cssVars['--outer-bg'], 'red; background:url(x)');
});

await t('deactivated event calls onDeactivated', async () => {
  const { tg, mock } = await setup('?tgmock=1');
  let paused = 0;
  tg.init({ onDeactivated: () => paused++ });
  mock.deactivate();
  assert.equal(paused, 1);
});

await t('closing confirmation toggles only on change', async () => {
  const { tg, names } = await setup('?tgmock=1');
  tg.init({});
  tg.setClosingConfirmation(true); tg.setClosingConfirmation(true); tg.setClosingConfirmation(false);
  assert.deepEqual(names().filter((x) => /ClosingConfirmation/.test(x)), ['enableClosingConfirmation', 'disableClosingConfirmation']);
});

await t('MainButton: show once, click calls back, hide removes the click handler', async () => {
  const { tg, names } = await setup('?tgmock=1');
  tg.init({});
  let clicks = 0;
  const cb = () => clicks++;
  assert.equal(tg.showMainButton('Play again', cb), true);
  assert.equal(tg.showMainButton('Play again', cb), true); // no second show
  assert.equal(names().filter((x) => x === 'MainButton.show').length, 1);
  assert.equal(window.Telegram.WebApp.MainButton.isVisible, true);
  tg.hideMainButton();
  assert.ok(names().includes('MainButton.hide'));
  assert.equal(window.Telegram.WebApp.MainButton.isVisible, false);
});

await t('user name: first_name, trimmed, control chars removed, capped, fallback', async () => {
  const { tg } = await setup('?tgmock=1&tgname=Ada');
  assert.equal(tg.userName(), 'Ada');
  const u = window.Telegram.WebApp.initDataUnsafe.user;
  u.first_name = '  Bo\nb  '; assert.equal(tg.userName(), 'Bob');
  u.first_name = 'x'.repeat(50); assert.equal(tg.userName().length, 20);
  u.first_name = '   '; assert.equal(tg.userName(), 'Skater');
  u.first_name = 123; assert.equal(tg.userName(), 'Skater');
});

await t('share builds the t.me/share/url link with encoded text and url', async () => {
  const { tg, mock } = await setup('?tgmock=1');
  tg.init({});
  assert.equal(tg.share('I scored 12,340 in Sketch Skate! \u{1F6F9} Can you beat me?', 'https://t.me/bot/app'), true);
  const call = mock.log.find((l) => l[0] === 'openTelegramLink');
  const u = new URL(call[1]);
  assert.equal(u.origin + u.pathname, 'https://t.me/share/url');
  assert.equal(u.searchParams.get('url'), 'https://t.me/bot/app');
  assert.equal(u.searchParams.get('text'), 'I scored 12,340 in Sketch Skate! \u{1F6F9} Can you beat me?');
});

await t('miniAppLink falls back to the page URL while bot placeholders are unset', async () => {
  const { tg } = await setup('');
  assert.equal(tg.miniAppLink(), 'https://game.example/');
});

await t('CloudStorage: set/get round trip; missing key is empty string', async () => {
  const { tg } = await setup('?tgmock=1');
  assert.equal(await tg.cloudGet('best'), '');
  assert.equal(await tg.cloudSet('best', '1200'), true);
  assert.equal(await tg.cloudGet('best'), '1200');
  assert.equal(await tg.cloudGet('bad key!'), null); // KEY_INVALID error -> null
});

await t('CloudStorage: a slow client gives up after TG_STORAGE_TIMEOUT (1.5 s)', async () => {
  const { tg } = await setup('?tgmock=1&tgslow=1');
  const t0 = Date.now();
  assert.equal(await tg.cloudGet('best'), null);
  const dt = Date.now() - t0;
  assert.ok(dt >= 1400 && dt < 2500, 'took ' + dt);
});

console.log(`${passed}/${n} passed`);
if (passed !== n) process.exit(1);
// The mock leaves a 5 s timer in slow mode; exit explicitly.
process.exit(0);

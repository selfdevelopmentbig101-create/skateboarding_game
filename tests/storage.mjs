// tests/storage.mjs: best score = max(localStorage, CloudStorage); never blocks long.
// Run: node tests/storage.mjs
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = globalThis;
window.location = { search: '', origin: 'https://game.example', pathname: '/' };
window.innerWidth = 400; window.innerHeight = 800;
globalThis.location = window.location;
globalThis.document = { documentElement: { style: { setProperty() {} } } };

let n = 0, passed = 0;
async function t(name, fn) {
  n++;
  try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n', e); process.exitCode = 1; }
}
let seq = 0;
async function env(query) {
  delete window.Telegram;
  store.clear();
  window.location.search = query || '';
  if (query) await import(`../game/dev-mock.js?s=${++seq}`);
  return await import('../game/storage.js');
}
const L = (k) => store.get('sketchskate.' + k);
const CLOUD = () => store.get('tgmock.cloud.best');

console.log('storage.js');

await t('plain browser: localStorage only, best only ever rises', async () => {
  const s = await env('');
  assert.equal(await s.getBest(), 0);
  await s.setBest(500);
  await s.setBest(300);
  assert.equal(await s.getBest(), 500);
  assert.equal(L('best'), '500');
  assert.equal(CLOUD(), undefined);
});

await t('Telegram: setBest writes both stores', async () => {
  const s = await env('?tgmock=1');
  await s.setBest(800);
  assert.equal(L('best'), '800');
  assert.equal(CLOUD(), '800');
});

await t('Telegram: cloud higher than local -> max wins and local is updated', async () => {
  const s = await env('?tgmock=1');
  store.set('tgmock.cloud.best', '9000');
  store.set('sketchskate.best', '400');
  assert.equal(await s.getBest(), 9000);
  assert.equal(L('best'), '9000');
});

await t('Telegram: local higher than cloud -> max wins and cloud is updated', async () => {
  const s = await env('?tgmock=1');
  store.set('sketchskate.best', '700');
  store.set('tgmock.cloud.best', '100');
  assert.equal(await s.getBest(), 700);
  assert.equal(CLOUD(), '700');
});

await t('Telegram: a lower score never overwrites a higher cloud best', async () => {
  const s = await env('?tgmock=1');
  store.set('tgmock.cloud.best', '5000');
  await s.setBest(60);
  assert.equal(CLOUD(), '5000');
});

await t('Telegram: slow CloudStorage falls back to local within ~1.5 s', async () => {
  const s = await env('?tgmock=1&tgslow=1');
  store.set('sketchskate.best', '321');
  const t0 = Date.now();
  assert.equal(await s.getBest(), 321);
  assert.ok(Date.now() - t0 < 2500);
});

await t('flags and settings round trip on localStorage', async () => {
  const s = await env('');
  assert.equal(await s.getFlag('tutorialDone'), false);
  await s.setFlag('tutorialDone', true);
  assert.equal(await s.getFlag('tutorialDone'), true);
  assert.equal(await s.getSetting('trickButtons', true), true);
  await s.setSetting('trickButtons', false);
  assert.equal(await s.getSetting('trickButtons', true), false);
});

console.log(`${passed}/${n} passed`);
process.exit(passed === n ? 0 : 1);

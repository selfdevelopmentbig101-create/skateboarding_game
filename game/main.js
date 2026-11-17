// main.js: layout, fixed-timestep loop, game flow (menu, tutorial, play, pause, settings, crash,
// game over), input routing, scoring hookup, ?debug=1 overlay and dev autoplay (?autoplay=1).
import * as C from './config.js';
import { setBoil, initInk, drawGround, drawShadow } from './draw.js';
import { Skater, DECK_ABOVE_GROUND } from './skater.js';
import {
  createBody, resetBody, jump, stepBody, stepCrash,
  R_LANDED, R_CRASHED, R_LEFT, S_RAIL, NO_SUPPORT, CRASH_FACE, CRASH_TRICK,
} from './physics.js';
import { World, TYPE_NAMES } from './world.js';
import { createInput, lockGestures } from './input.js';
import { Scoring, T_FLIP, T_SPIN, T_GRAB } from './scoring.js';
import { UI } from './ui.js';
import * as storage from './storage.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const AUTOPLAY = params.get('autoplay') === '1';
const FIXED_SEED = params.has('seed') ? Number(params.get('seed')) | 0 : 0;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const hintEl = document.getElementById('rotate-hint');
document.title = C.GAME_NAME;

// Probe element that resolves env(safe-area-inset-*) to pixels.
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
  'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(probe);

const view = {
  cssW: 0, cssH: 0, left: 0, dpr: 1, scale: 1,
  viewW: C.MIN_VIEW_W, viewTop: 0, offsetY: 0,
  coarse: false, titleFont: '', bodyFont: '', smallFont: '', titleSize: 40,
};
let needsLayout = true;
let blocked = false; // rotate hint visible: simulation frozen

const newSeed = () => FIXED_SEED || ((Math.random() * 0x7fffffff) | 0);
const body = createBody();
const skater = new Skater();
const world = new World(newSeed());
const ui = new UI();
const scoring = new Scoring((text) => ui.popup(text));

// mode: 'menu' | 'tutorial' | 'playing' | 'paused' | 'settings' | 'crashed' | 'gameover'
let mode = 'menu';
let settingsReturn = 'menu';
let best = 0;
let trickButtons = true;   // setting, saved
let tutorialDone = false;  // flag, saved
let tutorialStep = 0;
let newBest = false;
let jumpHeld = false;      // the press that started the current jump is still held
let bufferT = 0;           // remaining jump-buffer time
let grabSrc = '';          // what holds the grab: 'game' (swipe), 'ui' (button) or 'key'
let crashT = 0, overT = 0, overButtons = false;
let clearedCount = 0;      // debug only

// Shared HUD state handed to ui.draw (reused, no per-frame allocation).
const hud = { score: 0, best: 0, combo: 1, comboLeft: 0, name: 'Skater', newBest: false, step: 0, coarse: false };
const landedEvt = { impact: 0, surface: 0 };
const crashedEvt = { reason: 0, distance: 0 };

world.on('obstacleCleared', (e) => { clearedCount++; scoring.obstacleCleared(e, body.onGround); });
world.on('grindTick', (e) => scoring.grindTick(e.dist));

// Phase 4: tg.js returns Telegram's first_name here.
function getUserName() { return 'Skater'; }

// Saved data. The game never waits for it; values apply when they arrive.
storage.getBest().then((v) => { best = Math.max(best, v); });
storage.getFlag('tutorialDone').then((v) => { tutorialDone = tutorialDone || v; });
storage.getSetting('trickButtons', true).then((v) => { trickButtons = !!v; refreshButtons(); });

// Dev-only ideal-timing player; never loaded unless ?autoplay=1.
let planner = null;
if (AUTOPLAY) import('./autoplay.js').then((m) => { planner = new m.Planner(); });

// ---------- Layout ----------
/** Device safe-area insets in CSS px. Phase 4: tg.js merges Telegram's insets in here. */
function readInsets() {
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0,
  };
}

function layout() {
  needsLayout = false;
  const w = window.innerWidth, h = window.innerHeight; // Phase 4: viewportStableHeight in Telegram
  view.coarse = window.matchMedia('(pointer: coarse)').matches;
  blocked = view.coarse && w > h * 1.05; // touch device in landscape
  hintEl.classList.toggle('show', blocked);

  const cssH = h;
  const cssW = Math.min(w, Math.round(h * C.MAX_ASPECT)); // letterbox wide windows
  const dpr = Math.min(window.devicePixelRatio || 1, C.DPR_CAP);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  // Fit WORLD_HEIGHT, but never show less than MIN_VIEW_W; the extra height becomes sky.
  const scale = Math.min(cssH / C.WORLD_HEIGHT, cssW / C.MIN_VIEW_W);
  view.cssW = cssW; view.cssH = cssH; view.dpr = dpr; view.scale = scale;
  view.left = (w - cssW) / 2; // canvas is centered by the body flexbox
  view.viewW = cssW / scale;
  view.offsetY = cssH - C.WORLD_HEIGHT * scale; // world anchored to the bottom
  view.viewTop = -view.offsetY / scale;

  const t = Math.round(Math.min(52, view.viewW * 0.12));
  view.titleSize = t;
  view.titleFont = `bold ${t}px ${C.FONT_STACK}`;
  view.bodyFont = `bold ${Math.round(t * 0.55)}px ${C.FONT_STACK}`;
  view.smallFont = `${Math.round(t * 0.42)}px ${C.FONT_STACK}`;
  initInk(ctx); // resizing the canvas resets context state

  // Insets only matter where the canvas touches the screen edge (letterboxing moves it in).
  const ins = readInsets();
  ui.layout(view, {
    l: Math.max(0, ins.left - view.left) / scale,
    r: Math.max(0, ins.right - (w - view.left - cssW)) / scale,
    t: ins.top / scale,
    b: ins.bottom / scale,
  });
  hud.coarse = view.coarse;
}

const requestLayout = () => { needsLayout = true; };
window.addEventListener('resize', requestLayout);
window.addEventListener('orientationchange', () => {
  requestLayout();
  setTimeout(requestLayout, 250); // iOS reports the new size late
});
if (window.visualViewport) window.visualViewport.addEventListener('resize', requestLayout);

// ---------- Game flow ----------
function setMode(m) {
  mode = m;
  refreshButtons();
}

function refreshButtons() {
  const screen = mode === 'gameover' && !overButtons ? 'crashed' : mode;
  ui.show(screen, { trickButtons, leaderboard: C.LEADERBOARD_URL !== '' });
}

function startRun() {
  world.reset(newSeed());
  resetBody(body);
  skater.reset();
  skater.startRolling();
  scoring.reset();
  jumpHeld = false;
  bufferT = 0;
  grabSrc = '';
  clearedCount = 0;
  setMode('playing');
}

function beginFromMenu() {
  if (tutorialDone || planner) { startRun(); return; }
  tutorialStep = 0;
  setMode('tutorial');
}

function nextTutorial() {
  if (++tutorialStep >= 3) finishTutorial();
}

function finishTutorial() {
  tutorialDone = true;
  storage.setFlag('tutorialDone', true);
  startRun();
}

function pauseGame() {
  if (mode !== 'playing') return;
  jumpHeld = false;
  releaseGrab(grabSrc);
  setMode('paused');
}

function resume() {
  if (mode === 'paused') setMode('playing');
}

function openSettings() {
  settingsReturn = mode;
  setMode('settings');
}

function doJump() {
  if (!jump(body)) return false;
  scoring.takeoff();
  skater.jump();
  jumpHeld = input.isHeld();
  bufferT = 0;
  return true;
}

/** Tricks only start in the air; from a trick button or key on the ground we ollie first. */
function startTrick(type, src, allowOllie) {
  if (mode !== 'playing') return;
  if (body.onGround && !(allowOllie && doJump())) return;
  if (scoring.tryStart(type, !body.onGround) && type === T_GRAB) grabSrc = src;
}

function releaseGrab(src) {
  if (!grabSrc || grabSrc !== src) return;
  grabSrc = '';
  scoring.releaseGrab();
}

function onLanded() {
  if (body.surface === S_RAIL) skater.grind(); else skater.land(body.impact);
  world.dust(body.x, body.y);
  landedEvt.impact = body.impact;
  landedEvt.surface = body.surface;
  world.emit('landed', landedEvt);
  if (bufferT > 0) doJump();
}

function crash() {
  setMode('crashed');
  crashT = 0;
  jumpHeld = false;
  bufferT = 0;
  grabSrc = '';
  scoring.crashed();
  skater.setTrick(0, 0);
  const face = body.crash === CRASH_FACE;
  skater.crash(face ? -0.2 * body.speed : 0.6 * body.speed);
  body.speed *= face ? -0.25 : 0.3; // bounce off walls, keep sliding into gaps
  world.burst(body.x + C.NOSE, body.y + 30);
  crashedEvt.reason = body.crash;
  crashedEvt.distance = body.x;
  world.emit('crashed', crashedEvt);
}

function toGameOver() {
  const final = scoring.scoreInt();
  newBest = final > best && final > 0;
  if (newBest) { best = final; storage.setBest(final); }
  overT = 0;
  overButtons = false;
  setMode('gameover');
}

async function shareScore() {
  // Phase 4: inside Telegram this opens Telegram's share sheet with the Mini App link instead.
  const text = `I scored ${scoring.scoreInt().toLocaleString('en-US')} in ${C.GAME_NAME}! \u{1F6F9} Can you beat me?`;
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) { await navigator.share({ title: C.GAME_NAME, text, url }); return; }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // user closed the share sheet
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    ui.toast('Copied to clipboard!');
  } catch {
    ui.toast('Sharing is not available here');
  }
}

// ---------- Input routing ----------
function onPress(cx, cy, gameBusy) {
  if (blocked) return '';
  const x = (cx - view.left) / view.scale, y = cy / view.scale + view.viewTop;
  const id = ui.hit(x, y);
  if (id) { pressButton(id); return 'ui'; }
  return gameBusy ? '' : 'game';
}

/** A gameplay touch went down (already tracked as held, so the jump can read isHeld()). */
function onGameDown() {
  switch (mode) {
    case 'menu': beginFromMenu(); break;
    case 'tutorial': nextTutorial(); break;
    case 'playing':
      if (body.onGround) doJump();
      else bufferT = C.JUMP_BUFFER; // pressed slightly early: jump on touchdown
      break;
    // paused / settings / gameover: buttons only, so a stray tap does nothing
  }
}

function onSwipe(dir) {
  if (mode !== 'playing') return;
  bufferT = 0; // a swipe in the air is a trick, not an early jump
  startTrick(dir === 'up' ? T_FLIP : dir === 'down' ? T_GRAB : T_SPIN, 'game', false);
}

function onRelease(kind) {
  if (kind === 'game') jumpHeld = false; // ends the hold-to-extend boost
  else ui.pressed = null;
  releaseGrab(kind);
}

function pressButton(id) {
  ui.pressed = id;
  switch (id) {
    case 'pause': pauseGame(); break;
    case 'resume': resume(); break;
    case 'settings': case 'pauseSettings': openSettings(); break;
    case 'toggleButtons':
      trickButtons = !trickButtons;
      storage.setSetting('trickButtons', trickButtons);
      refreshButtons();
      break;
    case 'closeSettings': setMode(settingsReturn); break;
    case 'flip': startTrick(T_FLIP, 'ui', true); break;
    case 'spin': startTrick(T_SPIN, 'ui', true); break;
    case 'grab': startTrick(T_GRAB, 'ui', true); break;
    case 'again': startRun(); break;
    case 'share': shareScore(); break;
    case 'leaderboard': ui.toast('Leaderboard arrives in Phase 6'); break; // Phase 6 (OPTIONAL)
    case 'skip': finishTutorial(); break;
  }
}

/** Keyboard is for desktop testing: Space = ollie, arrows = tricks, Esc/P = pause, Enter = confirm. */
function onKey(code, down) {
  if (blocked) return;
  if (!down) {
    if (code === 'Space') jumpHeld = false;
    if (code === 'ArrowDown') releaseGrab('key');
    return;
  }
  switch (code) {
    case 'Space': case 'Enter':
      if (mode === 'paused') resume();
      else if (mode === 'settings') setMode(settingsReturn);
      else if (mode === 'gameover') { if (overButtons) startRun(); }
      else if (code === 'Space') onGameDown();
      else if (mode === 'menu' || mode === 'tutorial') onGameDown();
      break;
    case 'ArrowUp': startTrick(T_FLIP, 'key', true); break;
    case 'ArrowLeft': case 'ArrowRight': startTrick(T_SPIN, 'key', true); break;
    case 'ArrowDown': startTrick(T_GRAB, 'key', true); break;
    case 'Escape': case 'KeyP':
      if (mode === 'playing') pauseGame(); else if (mode === 'paused') resume();
      break;
  }
}

lockGestures();
const input = createInput(window, { onPress, onGameDown, onSwipe, onRelease, onKey }, () => view.scale);

// Auto-pause when the app goes to the background. Phase 4 also pauses on Telegram 'deactivated'.
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ---------- Simulation ----------
function stepPlaying(dt) {
  world.update(dt, body);
  body.speed = world.speedAt(world.time);
  if (planner) {
    const a = planner.decide(body, world, dt);
    if (a && doJump() && a === 2) jumpHeld = true;
  }
  if (bufferT > 0) bufferT -= dt;
  const r = stepBody(body, dt, world, jumpHeld);
  if (r === R_CRASHED) { crash(); return; }
  if (r === R_LANDED) {
    if (scoring.isMidTrick()) { body.crash = CRASH_TRICK; crash(); return; } // landed mid-trick
    scoring.landed(Math.abs(skater.boardAngle) < C.LAND_ANGLE_TOL);
    onLanded();
  } else if (r === R_LEFT) {
    scoring.takeoff();
    skater.fall();
  }
  scoring.update(dt, body);
  skater.setTrick(scoring.trick, scoring.trickPhase());
  skater.setGroundAngle(body.onGround ? -Math.atan2(body.groundVy, body.speed) : 0);
  skater.update(dt, body.speed);
}

function step(dt) {
  world.updateParticles(dt);
  ui.update(dt);
  switch (mode) {
    case 'playing': stepPlaying(dt); break;
    case 'crashed':
      stepCrash(body, dt, world);
      skater.update(dt, 0);
      if ((crashT += dt) >= C.CRASH_TIME) toGameOver();
      break;
    default:
      body.px = body.x; body.py = body.y;
      skater.update(dt, 0);
      if (mode === 'gameover') {
        overT += dt;
        if (!overButtons && overT > 0.3) { overButtons = true; refreshButtons(); } // ignore panic taps
        if (planner && overT > 1) startRun(); // autoplay loops forever
      } else if (mode === 'menu' && planner) {
        startRun();
      }
  }
}

// ---------- Rendering ----------
function render(alpha) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const k = view.scale * view.dpr;
  ctx.setTransform(k, 0, 0, k, 0, view.offsetY * view.dpr);

  // Interpolate between the last two physics states for smooth motion at any refresh rate.
  const bx = body.px + (body.x - body.px) * alpha;
  const by = body.py + (body.y - body.py) * alpha;
  const camX = bx - view.viewW * C.SKATER_X_FRAC;
  const sx = bx - camX;

  world.drawBackground(ctx, camX, view.viewW);
  drawGround(ctx, camX, view.viewW, world);
  world.draw(ctx, camX, view.viewW);
  const surf = world.support(bx, by);
  if (surf !== NO_SUPPORT && by - surf > 0.5) drawShadow(ctx, sx, by - surf, C.GROUND_Y - surf);
  skater.draw(ctx, sx, C.GROUND_Y - DECK_ABOVE_GROUND - by);
  world.drawParticles(ctx, camX);

  hud.score = scoring.scoreInt();
  hud.best = best;
  hud.combo = scoring.combo;
  hud.comboLeft = scoring.comboLeft();
  hud.name = getUserName();
  hud.newBest = newBest;
  hud.step = tutorialStep;
  ui.draw(ctx, mode, hud);
  if (DEBUG) drawDebug();
}

let fps = 0, fpsFrames = 0, fpsTime = 0;
function drawDebug() {
  const o = world.nextObstacle(body.x);
  const next = o ? `${TYPE_NAMES[o.type]} in ${Math.max(0, Math.round(o.x0 - body.x))}px` : '-';
  ctx.fillStyle = C.INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '12px monospace';
  const y = C.GROUND_Y + 22; // below the ground line, clear of the HUD
  ctx.fillText(`fps ${fps}  ${mode}  ${skater.state}${planner ? '  AUTOPLAY' : ''}`, 8, y);
  ctx.fillText(`speed ${Math.round(body.speed)}  dist ${Math.floor(body.x / 50)}m  t ${world.time.toFixed(1)}s`, 8, y + 15);
  ctx.fillText(`difficulty ${world.difficulty(world.time).toFixed(2)}  stage ${world.stageAt(world.time)}  cleared ${clearedCount}`, 8, y + 30);
  ctx.fillText(`next ${next}  pending ${scoring.pending}`, 8, y + 45);
}

// ---------- Loop ----------
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (needsLayout) layout();

  let dt = (now - last) / 1000;
  last = now;
  if (dt < 0) dt = 0;
  if (dt > C.MAX_FRAME_DT) dt = C.MAX_FRAME_DT;

  setBoil(now / 1000);

  const frozen = blocked || mode === 'paused' || mode === 'settings';
  if (!frozen) {
    acc += dt;
    let steps = 0;
    while (acc >= C.FIXED_DT && steps < C.MAX_STEPS_PER_FRAME) {
      step(C.FIXED_DT);
      acc -= C.FIXED_DT;
      steps++;
    }
    if (acc >= C.FIXED_DT) acc = 0; // device too slow: drop time rather than spiral
  }

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }

  render(frozen ? 1 : acc / C.FIXED_DT);
}

refreshButtons();
requestAnimationFrame(frame);

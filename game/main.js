// main.js: layout, fixed-timestep loop, run state, start screen (moves to ui.js in Phase 3).
import * as C from './config.js';
import { setBoil, boilNoise, initInk, setInk, sketchLine, drawGround, drawShadow } from './draw.js';
import { Skater, DECK_ABOVE_GROUND } from './skater.js';
import { createBody, resetBody, jump, stepBody } from './physics.js';
import { createInput, lockGestures } from './input.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const hintEl = document.getElementById('rotate-hint');
document.title = C.GAME_NAME;

const view = {
  cssW: 0, cssH: 0, dpr: 1, scale: 1,
  viewW: C.MIN_VIEW_W, viewTop: 0, offsetY: 0,
  coarse: false, titleFont: '', bodyFont: '', smallFont: '', titleSize: 40,
};
let needsLayout = true;
let blocked = false; // rotate hint visible: simulation frozen

const body = createBody();
const skater = new Skater();
let mode = 'menu'; // 'menu' | 'playing'  (Phase 2 adds 'crashed', Phase 3 'gameover'/'paused')
const best = 0;    // Phase 3: loaded from storage.js
let jumpHeld = false; // the press that started the current jump is still held
let bufferT = 0;      // remaining jump-buffer time

// ---------- Layout ----------
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
  view.viewW = cssW / scale;
  view.offsetY = cssH - C.WORLD_HEIGHT * scale; // world anchored to the bottom
  view.viewTop = -view.offsetY / scale;

  const t = Math.round(Math.min(52, view.viewW * 0.12));
  view.titleSize = t;
  view.titleFont = `bold ${t}px ${C.FONT_STACK}`;
  view.bodyFont = `bold ${Math.round(t * 0.55)}px ${C.FONT_STACK}`;
  view.smallFont = `${Math.round(t * 0.42)}px ${C.FONT_STACK}`;
  initInk(ctx); // resizing the canvas resets context state
}

const requestLayout = () => { needsLayout = true; };
window.addEventListener('resize', requestLayout);
window.addEventListener('orientationchange', () => {
  requestLayout();
  setTimeout(requestLayout, 250); // iOS reports the new size late
});
if (window.visualViewport) window.visualViewport.addEventListener('resize', requestLayout);

// ---------- Run control ----------
function startRun() {
  resetBody(body);
  skater.reset();
  skater.startRolling();
  jumpHeld = false;
  bufferT = 0;
  mode = 'playing';
}

function doJump() {
  if (jump(body)) {
    skater.jump();
    jumpHeld = input.isHeld();
    bufferT = 0;
  }
}

function onPress() {
  if (blocked) return;
  if (mode === 'menu') { startRun(); return; } // the starting tap does not jump
  if (body.onGround) doJump();
  else bufferT = C.JUMP_BUFFER; // pressed slightly early: jump on touchdown
}

function onRelease() {
  jumpHeld = false; // ends the hold-to-extend boost
}

lockGestures();
const input = createInput(window, { onPress, onRelease });

// ---------- Simulation ----------
function step(dt) {
  if (mode === 'playing') {
    if (bufferT > 0) bufferT -= dt;
    const impact = stepBody(body, dt, 0, jumpHeld); // Phase 2: terrain height instead of 0
    if (impact > 0) {
      skater.land(impact);
      if (bufferT > 0) doJump();
    }
    skater.update(dt, body.speed);
  } else {
    body.px = body.x; body.py = body.y;
    skater.update(dt, 0);
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

  drawGround(ctx, camX, view.viewW);
  if (by > 0.5) drawShadow(ctx, sx, by);
  skater.draw(ctx, sx, C.GROUND_Y - DECK_ABOVE_GROUND - by);

  if (mode === 'menu') drawStartScreen();
  if (DEBUG) drawDebug();
}

function drawStartScreen() {
  const cx = view.viewW / 2;
  ctx.fillStyle = C.INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.save();
  ctx.translate(cx, 150);
  ctx.rotate(-0.035 + boilNoise(5) * 0.006); // slight hand-drawn tilt that boils
  ctx.font = view.titleFont;
  ctx.fillText(C.GAME_NAME, 0, 0, view.viewW * 0.9);
  ctx.restore();

  const uw = Math.min(view.viewW * 0.4, view.titleSize * 3);
  setInk(ctx, C.STROKE, C.INK);
  ctx.beginPath();
  sketchLine(ctx, cx - uw, 150 + view.titleSize * 0.7, cx + uw, 147 + view.titleSize * 0.7, 901);
  ctx.stroke();

  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 300);
  ctx.font = view.bodyFont;
  ctx.fillText(view.coarse ? 'Tap to start' : 'Click or press Space', cx, 260);
  ctx.globalAlpha = 1;

  ctx.fillStyle = C.GREY_INK;
  ctx.font = view.smallFont;
  ctx.fillText(`Best: ${best}`, cx, 305);
}

let fps = 0, fpsFrames = 0, fpsTime = 0;
function drawDebug() {
  ctx.fillStyle = C.INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '12px monospace';
  ctx.fillText(`fps ${fps}  x ${body.x | 0}  y ${body.y | 0}  ${skater.state}`, 8, view.viewTop + 8);
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

  if (!blocked) {
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

  render(blocked ? 1 : acc / C.FIXED_DT);
}

requestAnimationFrame(frame);
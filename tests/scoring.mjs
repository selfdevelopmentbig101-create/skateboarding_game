// tests/scoring.mjs: unit tests for trick timing, banking and combos. `node tests/scoring.mjs`
import assert from 'node:assert/strict';
import * as C from '../game/config.js';
import { Scoring, T_FLIP, T_SPIN, T_GRAB } from '../game/scoring.js';
import { S_GROUND, S_BOX } from '../game/physics.js';
import { STAIRS, BOX } from '../game/world.js';

const dt = C.FIXED_DT;
const body = { x: 0, px: 0, onGround: false, surface: S_GROUND };
const popups = [];
const s = new Scoring((t) => popups.push(t));
function run(seconds, onGround = false, surface = S_GROUND) {
  body.onGround = onGround; body.surface = surface;
  for (let t = 0; t < seconds; t += dt) { body.px = body.x; s.update(dt, body); }
}
let n = 0;
function test(name, fn) { s.reset(); popups.length = 0; fn(); n++; console.log('ok', name); }

test('tricks only start in the air, one at a time', () => {
  assert.equal(s.tryStart(T_FLIP, false), false);
  assert.equal(s.tryStart(T_FLIP, true), true);
  assert.equal(s.tryStart(T_SPIN, true), false);
  assert.equal(s.isMidTrick(), true);
});

test('kickflip completes, banks on clean landing, combo grows', () => {
  s.tryStart(T_FLIP, true);
  run(C.FLIP_TIME + 0.02);
  assert.equal(s.isMidTrick(), false);
  assert.equal(s.pending, C.FLIP_POINTS);
  s.landed(true);
  run(C.BANK_DELAY + 0.05, true);
  assert.equal(s.scoreInt(), C.FLIP_POINTS);
  assert.equal(s.combo, 2);
  assert.equal(popups[0], '+100 KICKFLIP');
  s.takeoff();
  s.tryStart(T_SPIN, true);
  run(C.SPIN_TIME + 0.02);
  s.landed(true);
  run(C.BANK_DELAY + 0.05, true);
  assert.equal(s.scoreInt(), C.FLIP_POINTS + C.SPIN_POINTS * 2);
  assert.equal(popups[1], '+150 360 SPIN x2');
});

test('combo resets after ~1 s on flat ground, not on a box top', () => {
  s.combo = 4;
  run(C.COMBO_GROUND_TIME + 0.5, true, S_BOX);
  assert.equal(s.combo, 4);
  run(C.COMBO_GROUND_TIME + 0.05, true, S_GROUND);
  assert.equal(s.combo, 1);
});

test('combo is capped', () => {
  for (let i = 0; i < 15; i++) { s.addPending(10, 'X'); s.bank(); }
  assert.equal(s.combo, C.COMBO_CAP);
});

test('grab: 50 + 25 per 0.25 s, mid-trick until fully released', () => {
  s.tryStart(T_GRAB, true);
  run(0.6);
  assert.equal(s.isMidTrick(), true);
  s.releaseGrab();
  assert.equal(s.pending, C.GRAB_POINTS + 2 * C.GRAB_BONUS);
  assert.equal(s.isMidTrick(), true); // still letting go: landing now would crash
  run(C.GRAB_RELEASE_TIME + 0.02);
  assert.equal(s.isMidTrick(), false);
});

test('sketchy landing loses pending points and the combo', () => {
  s.combo = 3;
  s.addPending(150, 'SPIN');
  s.landed(false);
  assert.equal(s.pending, 0);
  assert.equal(s.combo, 1);
  assert.equal(popups[0], 'SKETCHY');
});

test('stair set bonus only when the steps were not touched; ollie over a box', () => {
  const o = { steps: 4 };
  s.obstacleCleared({ type: STAIRS, touched: true, touchedSteps: false, obstacle: o }, false);
  assert.equal(s.pending, C.STAIR_SET_POINTS + 4 * C.STAIR_STEP_POINTS);
  s.pending = 0;
  s.obstacleCleared({ type: STAIRS, touched: true, touchedSteps: true, obstacle: o }, false);
  assert.equal(s.pending, 0);
  s.obstacleCleared({ type: BOX, touched: false, touchedSteps: false, obstacle: o }, false);
  assert.equal(s.pending, C.OLLIE_POINTS);
});

test('cleared after the landing window banks immediately', () => {
  s.obstacleCleared({ type: BOX, touched: false, touchedSteps: false, obstacle: {} }, true);
  assert.equal(s.scoreInt(), C.OLLIE_POINTS);
});

test('grind points bank on the landing after leaving the rail', () => {
  for (let i = 0; i < 30; i++) s.grindTick(10);
  s.takeoff();
  assert.equal(s.pending, Math.round(300 * C.GRIND_POINTS_PER_PX));
});

test('distance gives a small steady score', () => {
  body.x = 0;
  body.onGround = true;
  for (let i = 0; i < 100; i++) { body.px = body.x; body.x += 5; s.update(dt, body); }
  assert.equal(s.scoreInt(), Math.floor(500 * C.DIST_POINTS_PER_PX));
});

test('crash clears everything pending', () => {
  s.tryStart(T_FLIP, true);
  s.addPending(100, 'X');
  s.combo = 5;
  s.crashed();
  assert.equal(s.pending + (s.isMidTrick() ? 1 : 0), 0);
  assert.equal(s.combo, 1);
});

console.log(`PASSED: ${n} scoring tests`);

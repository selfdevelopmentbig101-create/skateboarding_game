// physics.js: skater body integration. y = height above ground (up = +), x = world distance.
// Pure logic, no DOM: also used by autoplay.js and tests/fairness.mjs.
import {
  BASE_SPEED, GRAVITY, JUMP_VELOCITY, JUMP_HOLD_MAX, JUMP_HOLD_GRAVITY,
  NOSE, SNAP_UP, SNAP_DOWN, LAND_TOL, GAP_DEATH, KICKER_VY, CRASH_FRICTION,
} from './config.js';

// Surface types reported by world.support() (world.surfaceType).
export const S_GROUND = 0, S_BOX = 1, S_RAIL = 2, S_STAIRS = 3, S_KICKER = 4;
export const NO_SUPPORT = -1e9;
// stepBody() results.
export const R_NONE = 0, R_LANDED = 1, R_CRASHED = 2, R_LEFT = 3;
// Crash reasons (body.crash).
export const CRASH_FACE = 1, CRASH_GAP = 2, CRASH_TRICK = 3; // TRICK: set by main.js

export function createBody() {
  return {
    x: 0, y: 0, px: 0, py: 0, vy: 0, speed: BASE_SPEED, onGround: true, boostTime: 0,
    groundVy: 0, surface: S_GROUND, impact: 0, crash: 0,
  };
}

export function resetBody(b) {
  b.x = b.y = b.px = b.py = b.vy = 0;
  b.speed = BASE_SPEED;
  b.onGround = true;
  b.boostTime = 0;
  b.groundVy = 0;
  b.surface = S_GROUND;
  b.impact = 0;
  b.crash = 0;
}

/** Ollie (also pops off rails). Upward slope speed (kicker) is added. Returns false if airborne. */
export function jump(b) {
  if (!b.onGround) return false;
  b.vy = JUMP_VELOCITY + Math.max(0, b.groundVy);
  b.onGround = false;
  b.boostTime = 0;
  return true;
}

/** Time until a jump with initial speed v0 comes back down to height dh (relative). -1 if never. */
export function airTime(v0, dh) {
  const disc = v0 * v0 - 2 * GRAVITY * dh;
  if (disc < 0) return -1;
  return (v0 + Math.sqrt(disc)) / GRAVITY;
}

/**
 * One fixed step (semi-implicit Euler) against the world.
 * world must provide support(x, y) -> height | NO_SUPPORT (sets world.surfaceType)
 * and faceHit(prevNoseX, noseX, y) -> 0 | crash reason.
 * `holding` = jump input still held: lower gravity while rising, at most JUMP_HOLD_MAX s.
 */
export function stepBody(b, dt, world, holding) {
  b.px = b.x;
  b.py = b.y;
  const prevNose = b.x + NOSE;
  b.x += b.speed * dt;
  let result = R_NONE;

  if (b.onGround) {
    const s = world.support(b.x, b.y + SNAP_UP);
    if (s === NO_SUPPORT || s < b.y - SNAP_DOWN) {
      // Rolled off an edge; leaving a kicker lip launches.
      b.onGround = false;
      b.vy = b.surface === S_KICKER ? KICKER_VY : 0;
      b.boostTime = JUMP_HOLD_MAX; // hold boost only applies to real jumps
      result = R_LEFT;
    } else if (s > b.y + SNAP_UP) {
      b.crash = CRASH_FACE; // safety net: never snap up a wall
      return R_CRASHED;
    } else {
      b.groundVy = (s - b.y) / dt;
      b.y = s;
      b.surface = world.surfaceType;
    }
  }

  if (!b.onGround) {
    let g = GRAVITY;
    if (holding && b.vy > 0 && b.boostTime < JUMP_HOLD_MAX) {
      g *= JUMP_HOLD_GRAVITY;
      b.boostTime += dt;
    }
    b.vy -= g * dt;
    b.y += b.vy * dt;
    if (b.vy <= 0) {
      const s = world.support(b.x, b.py);
      if (s !== NO_SUPPORT && b.y <= s && b.py >= s - LAND_TOL) {
        b.impact = -b.vy;
        b.y = s;
        b.vy = 0;
        b.onGround = true;
        b.groundVy = 0;
        b.surface = world.surfaceType;
        result = R_LANDED;
      }
    }
  }

  const hit = world.faceHit(prevNose, b.x + NOSE, b.y);
  if (hit) { b.crash = hit; return R_CRASHED; }
  if (b.y < GAP_DEATH) { b.crash = CRASH_GAP; return R_CRASHED; }
  return result;
}

/** After a crash: slide to a stop (speed may be negative after bouncing off a wall), fall into gaps. */
export function stepCrash(b, dt, world) {
  b.px = b.x;
  b.py = b.y;
  const f = CRASH_FRICTION * dt;
  b.speed = b.speed > 0 ? Math.max(0, b.speed - f) : Math.min(0, b.speed + f);
  b.x += b.speed * dt;
  if (b.onGround) {
    const s = world.support(b.x, b.y + SNAP_UP);
    if (s === NO_SUPPORT || s < b.y - SNAP_DOWN) b.onGround = false;
    else { b.y = Math.min(s, b.y + SNAP_UP); return; }
  }
  b.vy -= GRAVITY * dt;
  b.y += b.vy * dt;
  if (b.y < -400) { b.y = -400; b.vy = 0; b.speed = 0; return; }
  if (b.vy <= 0) {
    const s = world.support(b.x, b.py);
    if (s !== NO_SUPPORT && b.y <= s && b.py >= s - LAND_TOL * 2) {
      b.y = s;
      b.vy = 0;
      b.onGround = true;
    }
  }
}

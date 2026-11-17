// autoplay.js: DEV ONLY. An ideal-timing player used by ?autoplay=1 (loaded on demand by
// main.js) and by tests/fairness.mjs. It simulates ahead with the real physics and world.
import { stepBody, jump, R_CRASHED } from './physics.js';

const HORIZON = 90; // frames to look ahead for a crash if we do nothing
const POST = 30;    // frames we want to survive after landing (no further input)
const MARGIN = 3;   // prefer jumping this many frames before the last possible moment

export class Planner {
  constructor() {
    this.a = {}; // scratch bodies (no per-frame allocation)
    this.b = {};
  }

  reset() {}

  /**
   * Call once per fixed step before stepBody. Returns 0 = nothing, 1 = tap jump, 2 = held jump.
   * Re-plans every frame from the exact current state, so speed changes never drift the plan.
   */
  decide(body, world, dt) {
    if (!body.onGround) return 0;
    const k = this.crashIn(body, world, dt);
    if (k < 0) return 0;
    // Find the latest jump frame (0..k) with the best post-landing survival, tap before hold.
    let bestJ = -1, bestHold = false, bestScore = -1;
    search:
    for (let j = k; j >= 0; j--) {
      for (let h = 0; h < 2; h++) {
        const s = this.tryJump(body, world, dt, j, h === 1);
        if (s > bestScore) { bestScore = s; bestJ = j; bestHold = h === 1; }
        if (bestScore >= POST) break search;
      }
    }
    if (bestJ < 0) return 0; // nothing works: unfair spot (the test reports it)
    // Keep a few frames of margin when an earlier frame is just as good.
    if (bestJ >= MARGIN && this.tryJump(body, world, dt, bestJ - MARGIN, bestHold) >= bestScore) bestJ -= MARGIN;
    if (bestJ > 0) return 0; // not yet: re-plan next frame
    return bestHold ? 2 : 1;
  }

  crashIn(body, world, dt) {
    const s = Object.assign(this.a, body);
    for (let i = 0; i < HORIZON; i++) if (stepBody(s, dt, world, false) === R_CRASHED) return i;
    return -1;
  }

  /** Score of: wait j frames, jump, fly. -1 = crash before landing, else frames survived after. */
  tryJump(body, world, dt, j, hold) {
    const s = Object.assign(this.b, body);
    for (let i = 0; i < j; i++) {
      if (stepBody(s, dt, world, false) === R_CRASHED || !s.onGround) return -1;
    }
    if (!jump(s)) return -1;
    let landed = false, post = 0;
    for (let i = 0; i < 240; i++) {
      const r = stepBody(s, dt, world, hold);
      if (r === R_CRASHED) return landed ? post : -1;
      if (!landed) landed = s.onGround;
      else if (++post >= POST) return POST;
    }
    return landed ? post : -1;
  }
}

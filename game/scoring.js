// scoring.js: trick timing, points and the combo multiplier. Pure logic (no DOM), driven by
// main.js (takeoff / landing / crash) and World events (obstacleCleared, grindTick).
import * as C from './config.js';
import { S_GROUND } from './physics.js';
import { GAP, BOX, RAIL, STAIRS } from './world.js';

export const T_NONE = 0, T_FLIP = 1, T_SPIN = 2, T_GRAB = 3; // same ids as skater.js
const NAMES = ['', 'KICKFLIP', '360 SPIN', 'GRAB'];

export class Scoring {
  constructor(onPopup) {
    this.onPopup = onPopup || (() => {});
    this.reset();
  }

  reset() {
    this.score = 0;
    this.distAcc = 0;
    this.combo = 1;       // multiplier applied to the next bank
    this.flatT = 0;       // time on flat ground (combo resets after COMBO_GROUND_TIME)
    this.pending = 0;     // trick/obstacle points waiting for a clean landing
    this.label = '';
    this.labelCount = 0;
    this.bankT = 0;       // > 0: a clean landing will bank when this runs out
    this.trick = T_NONE;
    this.trickT = 0;
    this.trickDur = 0;
    this.grabHeld = false;
    this.releaseT = 0;
    this.grindPts = 0;
  }

  scoreInt() { return Math.floor(this.score); }

  /** Any trick animation still running (including letting go of a grab). Landing now = crash. */
  isMidTrick() { return this.trick !== T_NONE; }

  /** 0..1 progress for the skater animation. */
  trickPhase() {
    if (this.trick === T_FLIP || this.trick === T_SPIN) return Math.min(1, this.trickT / this.trickDur);
    if (this.trick === T_GRAB) {
      return this.grabHeld ? Math.min(1, this.trickT / 0.1) : Math.max(0, this.releaseT / C.GRAB_RELEASE_TIME);
    }
    return 0;
  }

  /** Fraction of combo time left on flat ground (for the HUD bar). */
  comboLeft() {
    return this.combo > 1 ? Math.max(0, 1 - this.flatT / C.COMBO_GROUND_TIME) : 0;
  }

  /** Start a trick. Only in the air and one at a time (they can be chained). */
  tryStart(type, airborne) {
    if (!airborne || this.trick !== T_NONE) return false;
    this.trick = type;
    this.trickT = 0;
    this.trickDur = type === T_FLIP ? C.FLIP_TIME : type === T_SPIN ? C.SPIN_TIME : 0;
    this.grabHeld = type === T_GRAB;
    return true;
  }

  releaseGrab() {
    if (this.trick !== T_GRAB || !this.grabHeld) return;
    this.grabHeld = false;
    this.releaseT = C.GRAB_RELEASE_TIME;
    this.addPending(C.GRAB_POINTS + C.GRAB_BONUS * Math.floor(this.trickT / C.GRAB_BONUS_EVERY), NAMES[T_GRAB]);
  }

  update(dt, body) {
    // Small steady score for distance.
    this.distAcc += (body.x - body.px) * C.DIST_POINTS_PER_PX;
    if (this.distAcc >= 1 - 1e-9) { // epsilon: 0.1 * 10 is 0.999... in floating point
      const n = Math.floor(this.distAcc + 1e-9);
      this.score += n;
      this.distAcc -= n;
    }

    if (this.trick === T_FLIP || this.trick === T_SPIN) {
      this.trickT += dt;
      if (this.trickT >= this.trickDur) {
        this.addPending(this.trick === T_FLIP ? C.FLIP_POINTS : C.SPIN_POINTS, NAMES[this.trick]);
        this.trick = T_NONE;
      }
    } else if (this.trick === T_GRAB) {
      if (this.grabHeld) this.trickT += dt;
      else if ((this.releaseT -= dt) <= 0) this.trick = T_NONE;
    }

    if (this.bankT > 0 && (this.bankT -= dt) <= 0) this.bank();

    if (body.onGround && body.surface === S_GROUND) {
      this.flatT += dt;
      if (this.flatT > C.COMBO_GROUND_TIME && this.bankT <= 0) this.combo = 1;
    } else {
      this.flatT = 0;
    }
  }

  /** Leaving the ground (jump, rolling off, kicker). Banks a pending landing, ends a grind. */
  takeoff() {
    if (this.bankT > 0) { this.bankT = 0; this.bank(); }
    if (this.grindPts > 0) {
      this.addPending(Math.max(1, Math.round(this.grindPts)), '50-50');
      this.grindPts = 0;
    }
  }

  /** Called on touchdown when no trick is running. Unclean (tilted) landings lose the points. */
  landed(clean) {
    if (!clean) {
      if (this.pending > 0) this.onPopup('SKETCHY');
      this.pending = 0;
      this.label = '';
      this.labelCount = 0;
      this.combo = 1;
      return;
    }
    if (this.pending > 0) this.bankT = C.BANK_DELAY;
  }

  obstacleCleared(e, onGround) {
    let pts = 0, name = '';
    if (e.type === STAIRS) {
      if (!e.touchedSteps) { pts = C.STAIR_SET_POINTS + C.STAIR_STEP_POINTS * e.obstacle.steps; name = 'STAIR SET'; }
    } else if ((e.type === GAP || e.type === BOX || e.type === RAIL) && !e.touched) {
      pts = C.OLLIE_POINTS; name = 'OLLIE';
    }
    if (!pts) return;
    this.addPending(pts, name);
    if (onGround && this.bankT <= 0) this.bank(); // cleared after the landing window: bank now
  }

  grindTick(dist) {
    this.grindPts += dist * C.GRIND_POINTS_PER_PX;
  }

  crashed() {
    this.pending = 0;
    this.label = '';
    this.labelCount = 0;
    this.bankT = 0;
    this.combo = 1;
    this.trick = T_NONE;
    this.grabHeld = false;
    this.grindPts = 0;
  }

  addPending(pts, name) {
    this.pending += pts;
    if (this.labelCount < 3) this.label = this.label ? this.label + ' + ' + name : name;
    else if (this.labelCount === 3) this.label += ' +...';
    this.labelCount++;
  }

  bank() {
    if (this.pending <= 0) return;
    const mult = this.combo;
    this.score += this.pending * mult;
    this.onPopup(`+${this.pending} ${this.label}${mult > 1 ? ' x' + mult : ''}`);
    this.combo = Math.min(C.COMBO_CAP, this.combo + 1);
    this.pending = 0;
    this.label = '';
    this.labelCount = 0;
  }
}

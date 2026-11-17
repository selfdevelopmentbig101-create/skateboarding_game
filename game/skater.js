// skater.js: stick-figure skater with a keyframe pose system and a drawn board.
// Pose = 11 joints as (x, y) offsets from the deck-top center, screen axes (y down).
// "L" joints are the back side (screen left), "R" the front.
import { INK, STROKE, JITTER, POP_TIME, LAND_TIME, PUSH_INTERVAL, PUSH_DURATION } from './config.js';
import { setInk, sketchLine, sketchPolyline, sketchCircle } from './draw.js';

export const DECK_ABOVE_GROUND = 12; // deck top sits this far above ground (wheel bottoms touch ground)
const WHEEL_R = 4.5, WHEEL_Y = 7.5, TRUCK_X = 17, HEAD_R = 9;
const N = 22; // 11 joints * 2

// Joint order: HIP, CHEST, HEAD, L_ELBOW, L_HAND, R_ELBOW, R_HAND, L_KNEE, L_FOOT, R_KNEE, R_FOOT
const P = (a) => Float32Array.from(a);
const ROLL   = P([0,-40, 3,-70, 5,-84, -10,-58, -20,-47, 14,-60, 24,-51, -11,-21, -14,-2, 12,-21, 14,-2]);
const CROUCH = P([0,-28, 7,-54, 11,-67, -5,-42, -15,-33, 17,-44, 27,-36, -17,-14, -14,-2, 19,-14, 14,-2]);
const POP    = P([0,-42, 4,-72, 6,-86, -12,-62, -24,-58, 16,-64, 28,-62, -13,-20, -16,-2, 15,-28, 12,-2]);
const AIR    = P([0,-34, 5,-63, 8,-77, -12,-52, -24,-58, 18,-54, 30,-60, -15,-22, -14,-2, 17,-22, 14,-2]);
const LAND   = P([0,-24, 8,-48, 12,-60, -4,-36, -14,-28, 18,-38, 28,-30, -18,-12, -14,-2, 20,-12, 14,-2]);
const PUSH_A = P([2,-34, 9,-62, 12,-76, -4,-50, -14,-42, 19,-52, 28,-44, -4,-12, -6,12, 18,-18, 10,-2]);
const PUSH_B = P([0,-36, 8,-64, 11,-78, -8,-52, -18,-44, 18,-54, 27,-46, -18,-16, -30,10, 17,-19, 10,-2]);
// Phase 2: 50-50 grind (low, arms out for balance) and a sprawled crash pose.
const GRIND  = P([0,-32, 6,-60, 9,-74, -14,-54, -30,-58, 20,-56, 36,-60, -15,-17, -14,-2, 17,-17, 14,-2]);
const CRASH  = P([0,-30, 2,-60, 3,-74, -16,-56, -28,-68, 20,-54, 34,-64, -14,-14, -24,-2, 16,-16, 28,-4]);
// Phase 3 tricks: kickflip (feet lifted off the flipping board), grab (front hand on the deck).
const KICKFLIP = P([0,-40, 4,-70, 6,-84, -12,-60, -24,-64, 16,-62, 28,-66, -16,-26, -16,-14, 16,-28, 14,-14]);
const GRAB   = P([0,-26, 8,-48, 13,-60, -12,-42, -24,-50, 14,-28, 22,-3, -14,-16, -14,-2, 16,-18, 14,-2]);
const T_FLIP = 1, T_SPIN = 2, T_GRAB = 3; // same ids as scoring.js

// Per-state easing rates (higher = snappier) and board tilt offsets (negative = nose up).
const RATE = { idle: 8, roll: 12, pop: 30, air: 12, land: 35, grind: 20, crash: 10 };
const ANGLE = { idle: 0, roll: 0, pop: -0.38, air: 0, land: 0, grind: 0, crash: 0 };
const ANGLE_RATE = { idle: 10, roll: 10, pop: 40, air: 5, land: 20, grind: 25, crash: 0 };

const pts = new Float32Array(12); // scratch for polylines (max 6 points)

function lerpInto(out, a, b, t) {
  for (let i = 0; i < N; i++) out[i] = a[i] + (b[i] - a[i]) * t;
}

// Write board-local point (lx, ly), rotated by (c, s) around (x, y), into pts[i].
function rotTo(i, x, y, lx, ly, c, s) {
  pts[i * 2] = x + lx * c - ly * s;
  pts[i * 2 + 1] = y + lx * s + ly * c;
}

export class Skater {
  constructor() {
    this.pose = new Float32Array(N);
    this.target = new Float32Array(N);
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.stateTime = 0;
    this.clock = 0;
    this.pushClock = 0;
    this.landDepth = 1;
    this.boardAngle = 0;
    this.groundAngle = 0;
    this.wheelSpin = 0;
    this.trick = 0;       // T_* id, set every step by main.js from scoring.js
    this.trickPhase = 0;  // 0..1
    // Crash tumble state.
    this.tumble = 0; this.tumbleVel = 0; this.drop = 0;
    this.boardDX = 0; this.boardDY = 0; this.boardVX = 0; this.boardSpinV = 0;
    this.pose.set(CROUCH);
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  startRolling() {
    this.setState('roll');
    this.pushClock = 0; // push right away at run start
  }

  jump() {
    this.pose.set(CROUCH); // snap to crouch, then ease into pop: reads as a wind-up
    this.setState('pop');
  }

  land(impact) {
    this.landDepth = Math.min(1, Math.max(0.35, impact / 900)); // harder landing = deeper squash
    this.setState('land');
  }

  grind() { this.setState('grind'); }

  /** Rolled off an edge (box, rail end, kicker lip). */
  fall() { if (this.state !== 'crash') this.setState('air'); }

  /** Current trick (0 = none) and its 0..1 progress, for animation only. */
  setTrick(type, phase) { this.trick = type; this.trickPhase = phase; }

  /** Slope under the board, radians (screen space, negative = nose up). */
  setGroundAngle(a) { this.groundAngle = a; }

  /** Start the tumble. boardVX = initial board slide speed (negative = bounced back). */
  crash(boardVX) {
    this.setState('crash');
    this.tumble = 0;
    this.tumbleVel = 10;            // decays to ~2 full turns' worth: one flip, then lying down
    this.drop = 0;
    this.boardDX = 0;
    this.boardDY = 0;
    this.boardVX = boardVX;
    this.boardSpinV = Math.PI * 6;  // decays to about one full board flip
  }

  update(dt, speed) {
    this.clock += dt;
    this.stateTime += dt;
    this.wheelSpin += (speed * dt) / WHEEL_R;

    if (this.state === 'pop' && this.stateTime >= POP_TIME) this.setState('air');
    else if (this.state === 'land' && this.stateTime >= LAND_TIME) {
      this.setState('roll');
      this.pushClock = PUSH_DURATION; // coast first, push after the interval
    }

    const t = this.target;
    switch (this.state) {
      case 'idle':
        lerpInto(t, CROUCH, ROLL, 0.75 + 0.25 * Math.sin(this.clock * 2.2)); // ready bob
        break;
      case 'roll': {
        this.pushClock += dt;
        const p = this.pushClock % PUSH_INTERVAL;
        if (p < PUSH_DURATION && this.groundAngle === 0) {
          // Push: foot down (A), sweep back (B), back on the board. Not on slopes.
          const f = p / PUSH_DURATION;
          if (f < 0.25) lerpInto(t, ROLL, PUSH_A, f / 0.25);
          else if (f < 0.75) lerpInto(t, PUSH_A, PUSH_B, (f - 0.25) / 0.5);
          else lerpInto(t, PUSH_B, ROLL, (f - 0.75) / 0.25);
        } else {
          t.set(ROLL);
        }
        break;
      }
      case 'pop': t.set(POP); break;
      case 'air': t.set(AIR); break;
      case 'land': lerpInto(t, ROLL, LAND, this.landDepth); break;
      case 'grind': t.set(GRIND); break;
      case 'crash': t.set(CRASH); break;
    }
    if (this.trick && (this.state === 'air' || this.state === 'pop')) {
      if (this.trick === T_FLIP) t.set(KICKFLIP);
      else if (this.trick === T_GRAB) lerpInto(t, AIR, GRAB, this.trickPhase);
    }

    // Frame-rate independent exponential easing toward the target pose.
    const k = 1 - Math.exp(-RATE[this.state] * dt);
    const pose = this.pose;
    for (let i = 0; i < N; i++) pose[i] += (t[i] - pose[i]) * k;

    if (this.state === 'crash') {
      this.tumble += this.tumbleVel * dt;
      this.tumbleVel *= Math.exp(-1.3 * dt);
      this.drop = Math.min(26, this.drop + 45 * dt); // sink toward the ground while lying down
      this.boardDX += this.boardVX * dt;
      this.boardVX *= Math.exp(-1.5 * dt);
      this.boardAngle += this.boardSpinV * dt;
      this.boardSpinV *= Math.exp(-3 * dt);
    } else {
      const onGround = this.state !== 'air' && this.state !== 'pop';
      const target = ANGLE[this.state] + (onGround || this.state === 'pop' ? this.groundAngle : 0);
      const ka = 1 - Math.exp(-ANGLE_RATE[this.state] * dt);
      this.boardAngle += (target - this.boardAngle) * ka;
    }
  }

  /** (sx, sy) = deck-top center in logical screen coords. */
  draw(ctx, sx, sy) {
    const crashed = this.state === 'crash';
    const c = Math.cos(this.boardAngle), s = Math.sin(this.boardAngle);
    // 360 spin: squash x around the skater (cos of the turn). The path is built under the
    // transform but stroked after restore(), so line widths stay uniform.
    let spinK = 1;
    if (this.trick === T_SPIN && !crashed) {
      spinK = Math.cos(this.trickPhase * Math.PI * 2);
      if (Math.abs(spinK) < 0.08) spinK = spinK < 0 ? -0.08 : 0.08;
    }
    // Kickflip: the deck's vertical profile scales by cos of the flip (wheels end up on top halfway).
    const flipK = this.trick === T_FLIP && !crashed ? Math.cos(this.trickPhase * Math.PI * 2) : 1;
    // Pass 0: main marker stroke. Pass 1: faint thin offset stroke for a hand-drawn feel.
    for (let pass = 0; pass < 2; pass++) {
      const main = pass === 0;
      const x = sx + (main ? 0 : 1.3), y = sy + (main ? 0 : 1);
      const kb = main ? 0 : 1000; // different jitter keys for the second pass
      setInk(ctx, main ? STROKE : STROKE * 0.4, INK, main ? 1 : 0.3);
      ctx.beginPath();
      if (spinK !== 1) { ctx.save(); ctx.translate(sx, 0); ctx.scale(spinK, 1); ctx.translate(-sx, 0); }
      this.boardPath(ctx, x + this.boardDX, y + this.boardDY, c, s, kb, main, flipK);
      if (!crashed) this.bodyPath(ctx, x, y, c, s, kb);
      if (spinK !== 1) ctx.restore();
      ctx.stroke();
      if (!crashed) continue;
      // Tumbling body, detached from the board: rotate around the hip and sink.
      const hx = x + this.pose[0], hy = y + this.pose[1];
      ctx.save();
      ctx.translate(hx, hy + this.drop);
      ctx.rotate(this.tumble);
      ctx.translate(-hx, -hy);
      ctx.beginPath();
      this.bodyPath(ctx, x, y, 1, 0, kb);
      ctx.restore();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  boardPath(ctx, x, y, c, s, kb, main, flipK = 1) {
    // Deck with kicked tail and nose. flipK scales the vertical profile (kickflip).
    rotTo(0, x, y, -30, -6 * flipK, c, s);
    rotTo(1, x, y, -24, 0, c, s);
    rotTo(2, x, y, 24, 0, c, s);
    rotTo(3, x, y, 30, -6 * flipK, c, s);
    sketchPolyline(ctx, pts, 4, 10 + kb, JITTER * 0.6);
    for (let w = -1; w <= 1; w += 2) {
      const lx = w * TRUCK_X;
      const tx = x + lx * c, ty = y + lx * s; // truck top on the deck
      const wy0 = WHEEL_Y * flipK;
      const wx = x + lx * c - wy0 * s, wy = y + lx * s + wy0 * c;
      sketchLine(ctx, tx, ty, wx, wy, 20 + w + kb, 0.4);
      sketchCircle(ctx, wx, wy, WHEEL_R, 30 + w + kb, 0.6);
      if (main) {
        // Rotating spoke so the wheels visibly spin.
        const a = this.wheelSpin + w;
        sketchLine(ctx, wx, wy, wx + Math.cos(a) * WHEEL_R * 0.6, wy + Math.sin(a) * WHEEL_R * 0.6, 40 + w, 0);
      }
    }
  }

  bodyPath(ctx, x, y, c, s, kb) {
    const p = this.pose;
    // Feet live in board space, so they follow the board tilt.
    const lfx = x + p[16] * c - p[17] * s, lfy = y + p[16] * s + p[17] * c;
    const rfx = x + p[20] * c - p[21] * s, rfy = y + p[20] * s + p[21] * c;

    // Legs: L foot, L knee, hip, R knee, R foot.
    pts[0] = lfx; pts[1] = lfy;
    pts[2] = x + p[14]; pts[3] = y + p[15];
    pts[4] = x + p[0]; pts[5] = y + p[1];
    pts[6] = x + p[18]; pts[7] = y + p[19];
    pts[8] = rfx; pts[9] = rfy;
    sketchPolyline(ctx, pts, 5, 50 + kb);

    // Arms: L hand, L elbow, chest, R elbow, R hand.
    pts[0] = x + p[8]; pts[1] = y + p[9];
    pts[2] = x + p[6]; pts[3] = y + p[7];
    pts[4] = x + p[2]; pts[5] = y + p[3];
    pts[6] = x + p[10]; pts[7] = y + p[11];
    pts[8] = x + p[12]; pts[9] = y + p[13];
    sketchPolyline(ctx, pts, 5, 60 + kb);

    // Torso, neck, head.
    const hipX = x + p[0], hipY = y + p[1];
    const chX = x + p[2], chY = y + p[3];
    const hx = x + p[4], hy = y + p[5];
    sketchLine(ctx, hipX, hipY, chX, chY, 70 + kb);
    const dx = hx - chX, dy = hy - chY;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    sketchLine(ctx, chX, chY, hx - (dx / d) * HEAD_R, hy - (dy / d) * HEAD_R, 71 + kb, JITTER * 0.5);
    sketchCircle(ctx, hx, hy, HEAD_R, 72 + kb, JITTER * 0.7);
  }
}

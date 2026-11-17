// world.js: obstacles (pooled), fair generation, difficulty ramp, collision queries,
// event hooks, parallax background doodles and particles. No DOM: also used by tests.
import * as C from './config.js';
import { hash, setInk, sketchLine, sketchPolyline, sketchCircle } from './draw.js';
import {
  S_GROUND, S_BOX, S_RAIL, S_STAIRS, S_KICKER, NO_SUPPORT, CRASH_FACE, CRASH_GAP, airTime,
} from './physics.js';

export const GAP = 0, BOX = 1, RAIL = 2, STAIRS = 3, KICKER = 4;
export const TYPE_NAMES = ['gap', 'box', 'rail', 'stairs', 'kicker'];
const SURFACE_OF = [S_GROUND, S_BOX, S_RAIL, S_STAIRS, S_KICKER];
const UNLOCK = [0, 0, 3, 2, 1];       // stage index at which each type (by id) appears
const INTRO = [-1, KICKER, STAIRS, RAIL, -1]; // type forced once when a stage unlocks

const lerp = (a, b, t) => a + (b - a) * t;
const pts = new Float32Array(40); // scratch for polylines
const BG_SEG = 50; // coarser subdivision for background doodles (fewer path segments)

function makeObstacle(id) {
  // x0..x1 = footprint. STAIRS: xt = end of top platform. KICKER: xt = top of slope, then a
  // flat lip of 2*TRUCK so both trucks leave the lip together. exit = where a skater is surely
  // back on flat ground (worst case), used for spacing.
  return {
    id, active: false, type: 0, x0: 0, x1: 0, xt: 0, h: 0, steps: 0, exit: 0,
    cleared: false, touched: false, touchedSteps: false,
  };
}

export class World {
  constructor(seed = 1) {
    this.pool = [];
    for (let i = 0; i < C.POOL_SIZE; i++) this.pool.push(makeObstacle(i));
    this.active = new Array(C.POOL_SIZE).fill(null); // sorted by x0
    this.count = 0;
    this.particles = [];
    for (let i = 0; i < C.PARTICLE_POOL; i++) this.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1 });
    this.listeners = {};
    this.timeOffset = 0;          // tests: jump straight to max difficulty
    this.surfaceType = S_GROUND;  // set by support()
    this.pType = S_GROUND;
    // Reused event payloads (no per-event allocation).
    this.clearedEvt = { type: 0, touched: false, touchedSteps: false, obstacle: null };
    this.grindEvt = { dist: 0 };
    this.reset(seed);
  }

  reset(seed) {
    for (let i = 0; i < C.POOL_SIZE; i++) { this.pool[i].active = false; this.active[i] = null; }
    for (let i = 0; i < C.PARTICLE_POOL; i++) this.particles[i].life = 0;
    this.count = 0;
    this.seed = (seed | 0) || 1;
    this.time = 0;
    this.nextX = C.FIRST_OBSTACLE_X;
    this.last1 = -1;
    this.last2 = -1;
    this.introStage = 0;
  }

  // ---------- Events: obstacleCleared, grindTick (here); landed, crashed (emitted by main.js) ----------
  on(name, fn) {
    (this.listeners[name] || (this.listeners[name] = [])).push(fn);
  }

  emit(name, payload) {
    const l = this.listeners[name];
    if (!l) return;
    for (let i = 0; i < l.length; i++) l[i](payload);
  }

  // ---------- Difficulty ----------
  rand() { // mulberry32: deterministic per seed, so runs and tests are reproducible
    let t = (this.seed = (this.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  difficulty(t) {
    const x = Math.min(1, Math.max(0, (t + this.timeOffset) / C.RAMP_TIME));
    return x * x * (3 - 2 * x);
  }

  speedAt(t) {
    return C.BASE_SPEED + (C.MAX_SPEED - C.BASE_SPEED) * this.difficulty(t);
  }

  stageAt(t) {
    const tt = t + this.timeOffset;
    let s = 0;
    for (let i = 1; i < C.STAGE_TIMES.length; i++) if (tt >= C.STAGE_TIMES[i]) s = i;
    return s;
  }

  // ---------- Per-step update (call before stepBody while playing) ----------
  update(dt, body) {
    this.time += dt;
    this.spawn(body.x, Math.max(body.speed, 1));
    while (this.count > 0 && this.active[0].x1 < body.x - 600) this.removeFirst();

    for (let i = 0; i < this.count; i++) {
      const o = this.active[i];
      if (o.x0 > body.x + C.TRUCK) break;
      if (o.cleared) continue;
      if (body.onGround && o.type !== GAP && body.x >= o.x0 && body.x <= o.x1 &&
          body.surface === SURFACE_OF[o.type]) {
        o.touched = true;
        if (o.type === STAIRS && body.x > o.xt) o.touchedSteps = true;
      }
      if (body.x - C.TRUCK > o.x1) {
        o.cleared = true;
        const e = this.clearedEvt;
        e.type = o.type; e.touched = o.touched; e.touchedSteps = o.touchedSteps; e.obstacle = o;
        this.emit('obstacleCleared', e);
      }
    }
    if (body.onGround && body.surface === S_RAIL) {
      this.grindEvt.dist = body.x - body.px;
      this.emit('grindTick', this.grindEvt);
    }
  }

  // ---------- Generation ----------
  spawn(bodyX, speedNow) {
    while (this.nextX < bodyX + C.SPAWN_AHEAD && this.count < C.POOL_SIZE - 2) {
      // Estimate difficulty/speed at the moment the skater will arrive here.
      const t = this.time + Math.max(0, this.nextX - bodyX) / speedNow;
      const d = this.difficulty(t), speed = this.speedAt(t), stage = this.stageAt(t);
      const type = this.pickType(stage);
      const o = this.place(type, this.nextX, d, speed);
      let exit = o.exit;
      if (stage >= 4 && this.rand() < C.COMBO_CHANCE) {
        if (type === STAIRS) exit = Math.max(exit, this.place(GAP, o.x1 + speed * C.COMBO_LEAD, d, speed).exit);
        else if (type === KICKER) exit = Math.max(exit, this.placeRailAfterKicker(o, speed).exit);
      }
      // Flat run-up after the exit: shrinks with difficulty, always >= SPACE_T_HARD seconds.
      this.nextX = exit + speed * (lerp(C.SPACE_T_EASY, C.SPACE_T_HARD, d) + this.rand() * C.SPACE_T_RANDOM * (1 - d));
    }
  }

  pickType(stage) {
    let type = -1;
    if (stage > this.introStage) { // show each newly unlocked type right away
      this.introStage = stage;
      type = INTRO[stage];
    }
    for (let tries = 0; type < 0 && tries < 8; tries++) {
      const c = Math.floor(this.rand() * 5);
      if (UNLOCK[c] > stage) continue;
      if (c === this.last1 && c === this.last2) continue; // no triple repeats
      type = c;
    }
    if (type < 0) type = this.last1 === GAP ? BOX : GAP;
    this.last2 = this.last1;
    this.last1 = type;
    return type;
  }

  alloc() {
    for (let i = 0; i < C.POOL_SIZE; i++) {
      const o = this.pool[i];
      if (!o.active) {
        o.active = true;
        o.cleared = o.touched = o.touchedSteps = false;
        o.steps = 0;
        this.active[this.count++] = o;
        return o;
      }
    }
    throw new Error('obstacle pool exhausted');
  }

  removeFirst() {
    this.active[0].active = false;
    for (let i = 1; i < this.count; i++) this.active[i - 1] = this.active[i];
    this.active[--this.count] = null;
  }

  /** Build one obstacle at x0, sized for difficulty d and validated against the jump at `speed`. */
  place(type, x0, d, speed) {
    const o = this.alloc();
    o.type = type;
    o.x0 = o.xt = x0;
    const tap = airTime(C.JUMP_VELOCITY, 0);     // flat tap-jump air time
    const jd = speed * tap * C.AIR_HOLD_FACTOR;  // longest likely jump distance
    const r = this.rand();
    switch (type) {
      case GAP: {
        // Both trucks must be over the hole to fall, so a jump must cover width - 2*TRUCK.
        const maxW = 2 * C.TRUCK + speed * tap * C.GAP_SAFETY;
        const w = Math.min(maxW, lerp(C.GAP_W_MIN, lerp(C.GAP_W_MIN + 30, C.GAP_W_MAX, d), r));
        o.h = 0;
        o.x1 = x0 + w;
        o.exit = Math.max(o.x1 + C.TRUCK, x0 + C.TRUCK + jd);
        break;
      }
      case BOX:
        o.h = lerp(C.BOX_H_MIN, lerp(C.BOX_H_MIN + 8, C.BOX_H_MAX, d), r);
        o.x1 = x0 + lerp(C.BOX_L_MIN, C.BOX_L_MAX, this.rand());
        o.exit = Math.max(o.x1 + C.TRUCK + speed * airTime(0, -o.h), x0 + jd);
        break;
      case RAIL:
        o.h = lerp(C.RAIL_H_MIN, C.RAIL_H_MAX, r);
        o.x1 = x0 + lerp(C.RAIL_L_MIN, C.RAIL_L_MAX, this.rand());
        o.exit = Math.max(o.x1 + C.TRUCK + speed * airTime(0, -o.h), x0 + jd);
        break;
      case STAIRS:
        o.h = lerp(C.STAIR_H_MIN, lerp(C.STAIR_H_MIN + 8, C.STAIR_H_MAX, d), r);
        o.xt = x0 + lerp(C.STAIR_TOP_MIN, C.STAIR_TOP_MAX, this.rand());
        o.steps = Math.round(lerp(C.STAIR_STEPS_MIN, lerp(C.STAIR_STEPS_MIN + 1, C.STAIR_STEPS_MAX, d), this.rand()));
        o.x1 = o.xt + o.steps * C.STAIR_RUN;
        o.exit = Math.max(o.x1 + C.TRUCK, o.xt + C.TRUCK + speed * airTime(C.JUMP_VELOCITY, -o.h) * C.AIR_HOLD_FACTOR);
        break;
      case KICKER:
        o.h = lerp(C.KICKER_H_MIN, C.KICKER_H_MAX, r);
        o.xt = x0 + C.KICKER_L;
        o.x1 = o.xt + 2 * C.TRUCK;
        o.exit = o.x1 + C.TRUCK + speed * airTime(C.KICKER_VY * 1.1, -o.h) * C.AIR_HOLD_FACTOR;
        break;
    }
    return o;
  }

  /** Combo: a rail placed under the no-jump launch arc of kicker k. */
  placeRailAfterKicker(k, speed) {
    const o = this.alloc();
    o.type = RAIL;
    o.h = lerp(C.RAIL_H_MIN, C.RAIL_H_MAX, this.rand());
    const lip = k.x1 + C.TRUCK;                          // launch point (both trucks off the lip)
    const D = speed * airTime(C.KICKER_VY, o.h - k.h);  // where the arc comes down to rail height
    o.x0 = o.xt = lip + 0.45 * D;                         // arc is well above the rail here
    o.x1 = lip + 1.35 * D;                                // room for faster / held launches
    o.exit = Math.max(k.exit, o.x1 + C.TRUCK + speed * airTime(0, -o.h));
    return o;
  }

  // ---------- Collision queries (pure, used by physics and the autoplay planner) ----------
  /** Highest surface under one point; rails only count if we are at/above them. */
  pointSupport(px, y) {
    let best = NO_SUPPORT, type = S_GROUND, inGap = false;
    for (let i = 0; i < this.count; i++) {
      const o = this.active[i];
      if (o.x0 > px) break;
      if (px > o.x1) continue;
      let h = NO_SUPPORT;
      switch (o.type) {
        case GAP: inGap = true; break;
        case BOX: h = o.h; break;
        case RAIL: if (y >= o.h - C.RAIL_TOL) h = o.h; break;
        case STAIRS: h = px <= o.xt ? o.h : o.h * (1 - (px - o.xt) / (o.x1 - o.xt)); break; // ride the nosings
        case KICKER: h = px <= o.xt ? o.h * (px - o.x0) / (o.xt - o.x0) : o.h; break;
      }
      if (h > best) { best = h; type = SURFACE_OF[o.type]; }
    }
    if (!inGap && best < 0) { best = 0; type = S_GROUND; }
    this.pType = type;
    return best;
  }

  /** Board support = the higher of the two trucks. Sets this.surfaceType. */
  support(x, y) {
    const a = this.pointSupport(x - C.TRUCK, y);
    const ta = this.pType;
    const b = this.pointSupport(x + C.TRUCK, y);
    if (a >= b) { this.surfaceType = ta; return a; }
    this.surfaceType = this.pType;
    return b;
  }

  /** Did the nose cross a face this step while too low? Returns a crash reason or 0. */
  faceHit(prevNose, nose, y) {
    for (let i = 0; i < this.count; i++) {
      const o = this.active[i];
      if (o.x0 > nose) break;
      let fx, fh, tol, reason = CRASH_FACE;
      switch (o.type) {
        case BOX: case STAIRS: fx = o.x0; fh = o.h; tol = C.FACE_TOL; break;
        case RAIL: fx = o.x0; fh = o.h; tol = C.RAIL_TOL; break;
        case GAP: fx = o.x1; fh = 0; tol = C.FACE_TOL; reason = CRASH_GAP; break; // far wall
        default: continue;
      }
      if (prevNose < fx && nose >= fx && y < fh - tol) return reason;
    }
    return 0;
  }

  gapAt(x) {
    for (let i = 0; i < this.count; i++) {
      const o = this.active[i];
      if (o.x0 > x) break;
      if (o.type === GAP && x <= o.x1) return o;
    }
    return null;
  }

  nextObstacle(x) {
    for (let i = 0; i < this.count; i++) if (this.active[i].x1 > x) return this.active[i];
    return null;
  }

  // ---------- Drawing ----------
  draw(ctx, camX, viewW) {
    const left = camX - 40, right = camX + viewW + 40, gy = C.GROUND_Y;
    setInk(ctx, C.STROKE, C.INK, 1);
    ctx.beginPath();
    for (let i = 0; i < this.count; i++) {
      const o = this.active[i];
      if (o.x0 > right) break;
      if (o.x1 < left) continue;
      const k = o.id * 37 + 5000;
      const x0 = o.x0 - camX, x1 = o.x1 - camX, xt = o.xt - camX, top = gy - o.h;
      switch (o.type) {
        case GAP:
          sketchLine(ctx, x0, gy, x0 - 2, gy + C.GAP_DEPTH, k);
          sketchLine(ctx, x1, gy, x1 + 2, gy + C.GAP_DEPTH, k + 1);
          break;
        case BOX: // crate with an X brace
          pts[0] = x0; pts[1] = gy; pts[2] = x0; pts[3] = top; pts[4] = x1; pts[5] = top; pts[6] = x1; pts[7] = gy;
          sketchPolyline(ctx, pts, 4, k);
          sketchLine(ctx, x0 + 5, top + 5, x1 - 5, gy - 4, k + 2);
          sketchLine(ctx, x0 + 5, gy - 4, x1 - 5, top + 5, k + 3);
          break;
        case RAIL:
          sketchLine(ctx, x0, top, x1, top, k);
          sketchLine(ctx, x0 + 6, top, x0 + 6, gy, k + 1);
          sketchLine(ctx, x1 - 6, top, x1 - 6, gy, k + 2);
          if (o.x1 - o.x0 > 220) sketchLine(ctx, (x0 + x1) / 2, top, (x0 + x1) / 2, gy, k + 3);
          break;
        case STAIRS: {
          const rise = o.h / o.steps;
          pts[0] = x0; pts[1] = gy; pts[2] = x0; pts[3] = top; pts[4] = xt; pts[5] = top;
          let n = 3;
          for (let s = 1; s <= o.steps; s++) {
            pts[n * 2] = xt + (s - 1) * C.STAIR_RUN; pts[n * 2 + 1] = top + s * rise; n++;
            pts[n * 2] = xt + s * C.STAIR_RUN; pts[n * 2 + 1] = top + s * rise; n++;
          }
          sketchPolyline(ctx, pts, n, k, C.JITTER * 0.7);
          break;
        }
        case KICKER: {
          pts[0] = x0; pts[1] = gy; pts[2] = xt; pts[3] = top; pts[4] = x1; pts[5] = top; pts[6] = x1; pts[7] = gy;
          sketchPolyline(ctx, pts, 4, k);
          const xm = (x0 + xt) / 2;
          sketchLine(ctx, xm, gy - o.h / 2, xm, gy, k + 4);
          break;
        }
      }
    }
    ctx.stroke();

    // Thin detail pass: pit scribbles and platform hatching.
    setInk(ctx, C.STROKE * 0.45, C.INK, 0.5);
    ctx.beginPath();
    for (let i = 0; i < this.count; i++) {
      const o = this.active[i];
      if (o.x0 > right) break;
      if (o.x1 < left) continue;
      const x0 = o.x0 - camX, x1 = o.x1 - camX, k = o.id * 41 + 7000;
      if (o.type === GAP) {
        for (let xx = x0 + 8, n = 0; xx < x1 - 12; xx += 16, n++) {
          sketchLine(ctx, xx, gy + C.GAP_DEPTH - 4, xx + 10, gy + C.GAP_DEPTH - 18, k + n, C.JITTER * 0.6);
        }
      } else if (o.type === STAIRS) {
        const xt = o.xt - camX;
        for (let xx = x0 + 8, n = 0; xx < xt - 14; xx += 20, n++) {
          sketchLine(ctx, xx, gy - 4, xx + 12, gy - o.h + 6, k + n, C.JITTER * 0.6);
        }
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Thin grey parallax doodles: clouds (slowest), city, lamp posts (fastest). */
  drawBackground(ctx, camX, viewW) {
    const gy = C.GROUND_Y;
    setInk(ctx, C.STROKE * 0.45, C.BG_INK, 1);
    ctx.beginPath();

    let off = camX * C.PARALLAX_CLOUDS;
    for (let j = Math.floor((off - 80) / 260), j1 = Math.ceil((off + viewW + 80) / 260); j <= j1; j++) {
      if (hash(j, 501) < -0.2) continue;
      const cx = j * 260 + hash(j, 502) * 60 - off, cy = 70 + hash(j, 503) * 35;
      const r = 14 + (hash(j, 504) + 1) * 5;
      sketchCircle(ctx, cx, cy, r, j * 5, 1);
      sketchCircle(ctx, cx + r * 1.1, cy + 4, r * 0.8, j * 5 + 1, 1);
      sketchCircle(ctx, cx - r, cy + 5, r * 0.7, j * 5 + 2, 1);
    }

    off = camX * C.PARALLAX_CITY;
    for (let j = Math.floor((off - 120) / 110), j1 = Math.ceil((off + viewW) / 110); j <= j1; j++) {
      const hgt = 90 + (hash(j, 601) + 1) * 60, w = 60 + (hash(j, 602) + 1) * 18;
      const bx = j * 110 + hash(j, 603) * 12 - off, top = gy - hgt;
      pts[0] = bx; pts[1] = gy; pts[2] = bx; pts[3] = top; pts[4] = bx + w; pts[5] = top; pts[6] = bx + w; pts[7] = gy;
      sketchPolyline(ctx, pts, 4, j * 11 + 300, 1, BG_SEG);
      for (let r = 0; r < 4; r++) { // window dashes
        const wy = top + 18 + r * 26;
        if (wy > gy - 24) break;
        sketchLine(ctx, bx + 10, wy, bx + 22, wy, j * 11 + 310 + r, 0.6);
        sketchLine(ctx, bx + w - 22, wy, bx + w - 10, wy, j * 11 + 320 + r, 0.6);
      }
      if (hash(j, 604) > 0.5) sketchLine(ctx, bx + w * 0.7, top, bx + w * 0.7, top - 14, j * 11 + 330, 0.6);
    }

    off = camX * C.PARALLAX_LAMPS;
    for (let j = Math.floor((off - 40) / 300), j1 = Math.ceil((off + viewW + 40) / 300); j <= j1; j++) {
      const lx = j * 300 + hash(j, 701) * 40 - off, lt = gy - 150;
      sketchLine(ctx, lx, gy, lx, lt, j * 7 + 800, 0.8, BG_SEG);
      sketchLine(ctx, lx, lt, lx + 18, lt, j * 7 + 801, 0.5);
      sketchCircle(ctx, lx + 18, lt + 6, 5, j * 7 + 802, 0.6);
      sketchLine(ctx, lx - 6, gy, lx + 6, gy, j * 7 + 803, 0.4);
    }
    ctx.stroke();
  }

  // ---------- Particles (pooled; visual only, so Math.random is fine) ----------
  emitParticles(x, y, n, spread, up) {
    for (let i = 0, k = 0; i < C.PARTICLE_POOL && k < n; i++) {
      const p = this.particles[i];
      if (p.life > 0) continue;
      p.x = x + (Math.random() - 0.5) * 24;
      p.y = y + 2;
      p.vx = (Math.random() - 0.5) * spread - 40;
      p.vy = up * (0.4 + Math.random() * 0.6);
      p.life = p.max = 0.3 + Math.random() * 0.3;
      k++;
    }
  }

  dust(x, y) { this.emitParticles(x, y, 4, 160, 90); }
  burst(x, y) { this.emitParticles(x, y, 10, 420, 320); }

  updateParticles(dt) {
    for (let i = 0; i < C.PARTICLE_POOL; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  drawParticles(ctx, camX) {
    setInk(ctx, C.STROKE * 0.5, C.INK, 0.6);
    ctx.beginPath();
    for (let i = 0; i < C.PARTICLE_POOL; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      const sx = p.x - camX, sy = C.GROUND_Y - p.y, f = 0.02 * (p.life / p.max);
      sketchLine(ctx, sx, sy, sx - p.vx * f, sy + p.vy * f, i + 9000, 0);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

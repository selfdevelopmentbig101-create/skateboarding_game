// draw.js: procedural "marker on paper" helpers.
// All sketch helpers ADD to the current path (no beginPath/stroke) so callers can batch
// many lines into one stroke() call. No allocations in hot paths.
import {
  INK, GREY_INK, STROKE, JITTER, BOIL_FPS,
  GROUND_Y, GROUND_SEG, GROUND_WOBBLE, MARK_SPACING,
} from './config.js';

let seed = 0;

/** Re-seed jitter at BOIL_FPS so lines "boil" gently instead of flickering every frame. */
export function setBoil(timeSec) {
  seed = Math.floor(timeSec * BOIL_FPS);
}

/** Deterministic integer hash -> [-1, 1]. Same (i, s) always gives the same value. */
export function hash(i, s) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(s | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295 * 2 - 1;
}

/** Noise that changes with the boil, for small wiggles (e.g. title tilt). */
export function boilNoise(key) {
  return hash(key, seed);
}

/** Canvas resizes reset context state, so call this after every resize. */
export function initInk(ctx) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

export function setInk(ctx, width, color, alpha = 1) {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
}

const SEG = 16; // subdivide lines every ~16 px so long lines wobble along their length

// From the current pen (ax, ay) to (bx, by), with jittered interior points.
function segTo(ctx, ax, ay, bx, by, key, j, segLen) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const n = len > segLen ? Math.min(8, Math.ceil(len / segLen)) : 1;
  if (n > 1 && j > 0) {
    const nx = -dy / len, ny = dx / len; // perpendicular unit vector
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const o = hash(key * 131 + k, seed) * j;
      ctx.lineTo(ax + dx * t + nx * o, ay + dy * t + ny * o);
    }
  }
  ctx.lineTo(bx, by);
}

/**
 * Wobbly straight line. `key` keeps the jitter stable for this line within a boil frame.
 * segLen = subdivision length; background doodles pass a larger one to save path segments.
 */
export function sketchLine(ctx, x1, y1, x2, y2, key, j = JITTER, segLen = SEG) {
  const e = j * 0.5; // endpoints jitter less so joints stay connected
  const ax = x1 + hash(key * 7 + 1, seed) * e, ay = y1 + hash(key * 7 + 2, seed) * e;
  const bx = x2 + hash(key * 7 + 3, seed) * e, by = y2 + hash(key * 7 + 4, seed) * e;
  ctx.moveTo(ax, ay);
  segTo(ctx, ax, ay, bx, by, key, j, segLen);
}

/** Wobbly connected polyline. pts is a flat [x0,y0,x1,y1,...] array; count = number of points. */
export function sketchPolyline(ctx, pts, count, key, j = JITTER, segLen = SEG) {
  const e = j * 0.5;
  let ax = pts[0] + hash(key * 13, seed) * e;
  let ay = pts[1] + hash(key * 13 + 1, seed) * e;
  ctx.moveTo(ax, ay);
  for (let v = 1; v < count; v++) {
    const bx = pts[v * 2] + hash(key * 13 + v * 2, seed) * e;
    const by = pts[v * 2 + 1] + hash(key * 13 + v * 2 + 1, seed) * e;
    segTo(ctx, ax, ay, bx, by, key + v * 17, j, segLen);
    ax = bx; ay = by;
  }
}

/** Hand-drawn circle: slightly uneven radius and a small overshoot past the start. */
export function sketchCircle(ctx, cx, cy, r, key, j = JITTER) {
  const n = r < 6 ? 8 : 12;
  const step = (Math.PI * 2) / n;
  const a0 = hash(key, seed) * Math.PI;
  for (let k = 0; k <= n + 1; k++) {
    const a = a0 + k * step;
    const rr = r + hash(key * 29 + k, seed) * j * 0.5;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}

function groundWobble(i) {
  return GROUND_Y + hash(i, 17) * GROUND_WOBBLE + hash(i, seed) * JITTER * 0.4;
}

/**
 * Flat wobbly ground plus marks so scrolling is visible. Shapes are keyed by world index,
 * so they scroll with the world. `holes` (optional, the World) has gapAt(x) -> gap | null;
 * the line is broken exactly at gap edges. Gap walls are drawn by world.js.
 */
export function drawGround(ctx, camX, viewW, holes = null) {
  const i0 = Math.floor(camX / GROUND_SEG) - 1;
  const i1 = Math.ceil((camX + viewW) / GROUND_SEG) + 1;
  setInk(ctx, STROKE, INK, 1);
  ctx.beginPath();
  let pen = false;
  let lastGap = null;
  for (let i = i0; i <= i1; i++) {
    const wx = i * GROUND_SEG;
    const g = holes ? holes.gapAt(wx) : null;
    if (g) {
      if (pen) ctx.lineTo(g.x0 - camX, GROUND_Y);
      pen = false;
      lastGap = g;
      continue;
    }
    const x = wx - camX, y = groundWobble(i);
    if (!pen) {
      if (lastGap) { ctx.moveTo(lastGap.x1 - camX, GROUND_Y); ctx.lineTo(x, y); }
      else ctx.moveTo(x, y);
      pen = true;
      lastGap = null;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  setInk(ctx, STROKE * 0.5, INK, 0.75);
  ctx.beginPath();
  const m0 = Math.floor(camX / MARK_SPACING) - 1;
  const m1 = Math.ceil((camX + viewW) / MARK_SPACING) + 1;
  for (let m = m0; m <= m1; m++) {
    const r = hash(m, 101);
    if (r < -0.3) continue; // leave some gaps
    const wx = m * MARK_SPACING + hash(m, 202) * MARK_SPACING * 0.3;
    if (holes && (holes.gapAt(wx) || holes.gapAt(wx + 26))) continue;
    const x = wx - camX;
    if (r > 0.55) {
      sketchCircle(ctx, x, GROUND_Y - 3, 2.2, m, 0.5); // pebble on the line
    } else {
      const y = GROUND_Y + 14 + (hash(m, 303) + 1) * 14; // crack below the line
      const len = 8 + (r + 1) * 9;
      sketchLine(ctx, x, y, x + len, y + hash(m, 404) * 2, m * 3 + 1, JITTER * 0.5);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Short grey dash under an airborne skater on the surface at screen y `surfY`; shrinks with height. */
export function drawShadow(ctx, x, height, surfY = GROUND_Y) {
  const w = 24 * Math.max(0.35, 1 - height / 250);
  setInk(ctx, STROKE * 0.6, GREY_INK, 0.6);
  ctx.beginPath();
  sketchLine(ctx, x - w, surfY + 6, x + w, surfY + 6, 777, JITTER * 0.4);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

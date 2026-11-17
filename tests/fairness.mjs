// tests/fairness.mjs: run with `node tests/fairness.mjs` (Node 18+, no dependencies).
// Drives the real generator + physics with the ideal-timing autoplay player and checks that
// every generated sequence is clearable: (1) the normal difficulty ramp from t=0 and
// (2) max difficulty / max speed from the first obstacle.
import * as C from '../game/config.js';
import { World, TYPE_NAMES } from '../game/world.js';
import { createBody, resetBody, jump, stepBody, R_CRASHED, CRASH_GAP } from '../game/physics.js';
import { Planner } from '../game/autoplay.js';

const SEEDS = Number(process.argv[2] || 12);
const TARGET = Number(process.argv[3] || 250); // obstacles to clear per run

function run(seed, maxDifficulty) {
  const world = new World(seed);
  world.timeOffset = maxDifficulty ? 1000 : 0;
  world.reset(seed);
  const body = createBody();
  resetBody(body);
  const planner = new Planner();
  const counts = [0, 0, 0, 0, 0];
  let cleared = 0, grind = 0, hold = false;
  world.on('obstacleCleared', (e) => { cleared++; counts[e.type]++; });
  world.on('grindTick', (e) => { grind += e.dist; });
  const dt = C.FIXED_DT;
  for (let f = 0; f < 60 * 60 * 20 && cleared < TARGET; f++) {
    world.update(dt, body);
    body.speed = world.speedAt(world.time);
    const a = planner.decide(body, world, dt);
    if (a && jump(body)) hold = a === 2;
    if (stepBody(body, dt, world, hold) === R_CRASHED) {
      const o = world.nextObstacle(body.x - 60);
      return {
        ok: false, seed, maxDifficulty, cleared, t: world.time.toFixed(1), x: Math.round(body.x),
        y: Math.round(body.y), reason: body.crash === CRASH_GAP ? 'gap' : 'face',
        near: o ? `${TYPE_NAMES[o.type]} x0=${Math.round(o.x0)} x1=${Math.round(o.x1)} h=${Math.round(o.h)}` : '-',
      };
    }
  }
  return { ok: cleared >= TARGET, seed, maxDifficulty, cleared, counts, grind, t: world.time };
}

let fails = 0;
const total = [0, 0, 0, 0, 0];
const t0 = Date.now();
for (const maxD of [false, true]) {
  for (let s = 1; s <= SEEDS; s++) {
    const r = run(s * 7919, maxD);
    if (!r.ok) { fails++; console.log('FAIL', JSON.stringify(r)); continue; }
    for (let i = 0; i < 5; i++) total[i] += r.counts[i];
  }
}
console.log('obstacles cleared by type:', TYPE_NAMES.map((n, i) => `${n}=${total[i]}`).join(' '));
const missing = TYPE_NAMES.filter((n, i) => total[i] === 0);
if (missing.length) { fails++; console.log('FAIL missing types:', missing.join(', ')); }
console.log(`${fails ? 'FAILED' : 'PASSED'}: ${SEEDS * 2} runs x ${TARGET} obstacles, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fails ? 1 : 0);

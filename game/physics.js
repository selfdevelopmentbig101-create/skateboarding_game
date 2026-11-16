// physics.js: skater body integration. y = height above ground (up = +), x = world distance.
import {
    BASE_SPEED, GRAVITY, JUMP_VELOCITY, JUMP_HOLD_MAX, JUMP_HOLD_GRAVITY,
  } from './config.js';
  
  export function createBody() {
    return { x: 0, y: 0, px: 0, py: 0, vy: 0, speed: BASE_SPEED, onGround: true, boostTime: 0 };
  }
  
  export function resetBody(b) {
    b.x = b.y = b.px = b.py = b.vy = 0;
    b.speed = BASE_SPEED; // Phase 2: difficulty ramp changes speed
    b.onGround = true;
    b.boostTime = 0;
  }
  
  /** Ollie. Returns false if already airborne. */
  export function jump(b) {
    if (!b.onGround) return false;
    b.vy = JUMP_VELOCITY;
    b.onGround = false;
    b.boostTime = 0;
    return true;
  }
  
  /**
   * One fixed step (semi-implicit Euler). `holding` = the jump input is still held:
   * while rising, gravity is reduced for at most JUMP_HOLD_MAX seconds (capped extra height).
   * Returns the downward impact speed on the step it lands, otherwise 0.
   * groundY is the ground height under the skater (0 for flat; Phase 2 passes terrain height).
   */
  export function stepBody(b, dt, groundY, holding) {
    b.px = b.x;
    b.py = b.y;
    b.x += b.speed * dt;
    if (b.onGround) {
      b.y = groundY;
      return 0;
    }
    let g = GRAVITY;
    if (holding && b.vy > 0 && b.boostTime < JUMP_HOLD_MAX) {
      g *= JUMP_HOLD_GRAVITY;
      b.boostTime += dt;
    }
    b.vy -= g * dt;
    b.y += b.vy * dt;
    if (b.y <= groundY && b.vy <= 0) {
      const impact = Math.max(-b.vy, 0.001);
      b.y = groundY;
      b.vy = 0;
      b.onGround = true;
      return impact;
    }
    return 0;
  }
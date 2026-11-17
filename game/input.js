// input.js: Pointer Events + keyboard.
// Every pointerdown is routed by handlers.onPress(clientX, clientY, gameBusy), which returns
// 'ui' (a button took it), 'game' (gameplay touch) or '' (ignored). One 'game' pointer at a time:
// the press is the ollie, and moving SWIPE_MIN logical px is a swipe (one per gesture).
// Keyboard (desktop testing): handlers.onKey(code, isDown) for Space, arrows, Escape, P, Enter.
import { SWIPE_MIN } from './config.js';

const MAX_PTR = 4;
const KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'KeyP', 'Enter'];

/** getScale() = CSS px per logical px (for the swipe threshold). */
export function createInput(target, handlers, getScale) {
  const ptrs = [];
  for (let i = 0; i < MAX_PTR; i++) ptrs.push({ id: -1, kind: '', x0: 0, y0: 0, swiped: false });
  let spaceDown = false;

  function find(id) {
    for (let i = 0; i < MAX_PTR; i++) if (ptrs[i].id === id) return ptrs[i];
    return null;
  }

  function gameHeld() {
    for (let i = 0; i < MAX_PTR; i++) if (ptrs[i].id !== -1 && ptrs[i].kind === 'game') return true;
    return false;
  }

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const slot = find(-1);
    if (!slot) return;
    if (e.cancelable) e.preventDefault();
    const kind = handlers.onPress(e.clientX, e.clientY, gameHeld() || spaceDown);
    if (!kind) return;
    // Set after onPress: isHeld() is checked by the jump, so mark this pointer first if gameplay.
    slot.id = e.pointerId; slot.kind = kind; slot.x0 = e.clientX; slot.y0 = e.clientY; slot.swiped = false;
    if (kind === 'game') handlers.onGameDown();
  }

  function move(e) {
    const p = find(e.pointerId);
    if (!p || p.kind !== 'game' || p.swiped) return;
    const dx = e.clientX - p.x0, dy = e.clientY - p.y0, min = SWIPE_MIN * getScale();
    if (dx * dx + dy * dy < min * min) return;
    p.swiped = true;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    handlers.onSwipe(dir);
  }

  function up(e) {
    const p = find(e.pointerId);
    if (!p) return;
    const kind = p.kind;
    p.id = -1;
    handlers.onRelease(kind);
  }

  function keydown(e) {
    if (KEYS.indexOf(e.code) < 0) return;
    e.preventDefault(); // stop page scroll
    if (e.repeat) return;
    if (e.code === 'Space') spaceDown = true;
    handlers.onKey(e.code, true);
  }

  function keyup(e) {
    if (KEYS.indexOf(e.code) < 0) return;
    if (e.code === 'Space') spaceDown = false;
    handlers.onKey(e.code, false);
  }

  // Losing focus mid-hold must not leave anything stuck "held".
  function blur() {
    for (let i = 0; i < MAX_PTR; i++) {
      if (ptrs[i].id !== -1) { const kind = ptrs[i].kind; ptrs[i].id = -1; handlers.onRelease(kind); }
    }
    if (spaceDown) { spaceDown = false; handlers.onKey('Space', false); }
    handlers.onKey('ArrowDown', false);
  }

  target.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', blur);

  return { isHeld: () => spaceDown || gameHeld() };
}

/** Block pinch zoom, double-tap zoom, long-press menus and page scroll/bounce. */
export function lockGestures() {
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  document.addEventListener('gesturestart', stop);  // iOS pinch
  document.addEventListener('gesturechange', stop);
  document.addEventListener('dblclick', stop);
  document.addEventListener('contextmenu', stop);
  document.addEventListener('touchmove', stop, { passive: false });
}

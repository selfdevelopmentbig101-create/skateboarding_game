// input.js: Pointer Events + keyboard. Phase 1: press/release only (ollie).
// Phase 3 adds swipe detection and on-screen trick buttons here.

/**
 * handlers.onPress(clientX, clientY) / handlers.onRelease(clientX, clientY).
 * Keyboard calls pass (-1, -1). One pointer at a time (one-handed play).
 */
export function createInput(target, handlers) {
    let pointerId = null;
    let keyDown = false;
  
    function down(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (pointerId !== null || keyDown) return; // ignore extra fingers
      pointerId = e.pointerId; // set before the callback so isHeld() is true inside it
      if (e.cancelable) e.preventDefault();
      handlers.onPress(e.clientX, e.clientY);
    }
  
    function up(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      handlers.onRelease(e.clientX, e.clientY);
    }
  
    function keydown(e) {
      if (e.code !== 'Space') return;
      e.preventDefault(); // stop page scroll
      if (e.repeat || keyDown || pointerId !== null) return;
      keyDown = true;
      handlers.onPress(-1, -1);
    }
  
    function keyup(e) {
      if (e.code !== 'Space' || !keyDown) return;
      keyDown = false;
      handlers.onRelease(-1, -1);
    }
  
    // Losing focus mid-hold must not leave the input stuck "held".
    function blur() {
      if (pointerId !== null || keyDown) {
        pointerId = null;
        keyDown = false;
        handlers.onRelease(-1, -1);
      }
    }
  
    target.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
  
    return { isHeld: () => pointerId !== null || keyDown };
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
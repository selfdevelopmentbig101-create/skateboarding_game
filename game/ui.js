// ui.js: canvas-drawn UI in the sketch style: HUD, trick buttons, start / tutorial / pause /
// settings / game-over screens, floating score popups and toasts. Owns button hit-testing.
// All coordinates are logical (same space as the world), safe-area aware.
import * as C from './config.js';
import { setInk, sketchLine, sketchPolyline, sketchCircle, boilNoise } from './draw.js';

const pts = new Float32Array(12);
const POPUPS = 6;
const LABELS = {
  pause: '', settings: '', flip: 'Flip', spin: 'Spin', grab: 'Grab', resume: 'Resume',
  pauseSettings: 'Settings', toggleButtons: '', closeSettings: 'Done', again: 'Play again',
  share: 'Share score', leaderboard: 'Leaderboard', skip: 'Skip',
};
const SCREEN_BUTTONS = {
  menu: ['settings'], tutorial: ['skip'], playing: ['pause'], crashed: [],
  paused: ['resume', 'pauseSettings'], settings: ['toggleButtons', 'closeSettings'],
  gameover: ['again', 'share'],
};
const TUTORIAL = [
  ['Tap to jump', 'Hold a little longer for more air'],
  ['Swipe in the air for tricks', 'Up: flip   Left/Right: spin   Down: grab'],
  ['Land clean to build combos', 'Finish every trick before you touch down!'],
];

export const fmt = (n) => Math.floor(n).toLocaleString('en-US');

export class UI {
  constructor() {
    this.list = Object.keys(LABELS).map((id) => ({ id, label: LABELS[id], x: 0, y: 0, w: 0, h: 0, visible: false }));
    this.b = {};
    for (const btn of this.list) this.b[btn.id] = btn;
    this.pressed = null;
    this.popups = [];
    for (let i = 0; i < POPUPS; i++) this.popups.push({ text: '', t: 0, y: 0 });
    this.toastText = '';
    this.toastT = 0;
    this.safe = { l: 0, t: 0, r: 0, b: 0 };
    this.viewW = C.MIN_VIEW_W;
    this.viewTop = 0;
    this.f = {};
  }

  /** safe = logical insets {l, t, r, b} of the canvas that UI must avoid. */
  layout(view, safe) {
    this.viewW = view.viewW;
    this.viewTop = view.viewTop;
    this.safe = safe;
    const t = view.titleSize, F = C.FONT_STACK;
    this.f = {
      title: view.titleFont, body: view.bodyFont, small: view.smallFont,
      hud: `bold ${Math.round(t * 0.62)}px ${F}`, btn: `bold ${Math.round(t * 0.42)}px ${F}`,
      big: `bold ${Math.round(t * 1.05)}px ${F}`, hudSize: Math.round(t * 0.62),
    };
    const minH = C.TOUCH_MIN_CSS / view.scale; // buttons are at least 44 CSS px
    const W = view.viewW, cx = W / 2, top = view.viewTop + safe.t + 10;
    const sq = Math.max(minH, 40);
    this.place('pause', W - safe.r - 12 - sq, top - 4, sq, sq);
    this.place('settings', W - safe.r - 12 - sq, top - 4, sq, sq);

    const bh = Math.max(minH, 46), gap = 12;
    const bw = Math.max(minH, Math.min(100, (W - safe.l - safe.r - 24 - 2 * gap) / 3));
    const by = C.WORLD_HEIGHT - safe.b - bh - 14, bx = cx - (3 * bw + 2 * gap) / 2;
    this.place('flip', bx, by, bw, bh);
    this.place('spin', bx + bw + gap, by, bw, bh);
    this.place('grab', bx + 2 * (bw + gap), by, bw, bh);

    const cw = Math.min(220, W - safe.l - safe.r - 40), ch = Math.max(minH, 50), cl = cx - cw / 2;
    this.place('resume', cl, 290, cw, ch);
    this.place('pauseSettings', cl, 290 + ch + 16, cw, ch);
    this.place('toggleButtons', cl, 260, cw, ch);
    this.place('closeSettings', cl, 260 + ch + 16, cw, ch);
    this.place('again', cl, 300, cw, ch);
    this.place('share', cl, 300 + ch + 14, cw, ch);
    this.place('leaderboard', cl, 300 + 2 * (ch + 14), cw, ch);
    this.place('skip', W - safe.r - 12 - 90, C.WORLD_HEIGHT - safe.b - sq - 14, 90, sq);
  }

  place(id, x, y, w, h) {
    const b = this.b[id];
    b.x = x; b.y = y; b.w = w; b.h = h;
  }

  /** Choose the visible buttons for a screen. o = { trickButtons, leaderboard }. */
  show(screen, o) {
    for (const b of this.list) b.visible = false;
    for (const id of SCREEN_BUTTONS[screen] || []) this.b[id].visible = true;
    if (screen === 'playing' && o.trickButtons) this.b.flip.visible = this.b.spin.visible = this.b.grab.visible = true;
    if (screen === 'gameover' && o.leaderboard) this.b.leaderboard.visible = true;
    this.b.toggleButtons.label = `Trick buttons: ${o.trickButtons ? 'ON' : 'OFF'}`;
    this.pressed = null;
  }

  /** Button id under a logical point, or null. A little slop makes small targets easier. */
  hit(x, y) {
    for (const b of this.list) {
      if (b.visible && x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6) return b.id;
    }
    return null;
  }

  popup(text) {
    let slot = this.popups[0];
    for (const p of this.popups) {
      if (p.t > 0) p.y -= 30; // push older text up
      if (p.t < slot.t) slot = p;
    }
    slot.text = text;
    slot.t = C.POPUP_TIME;
    slot.y = 0;
  }

  toast(text) {
    this.toastText = text;
    this.toastT = 1.8;
  }

  update(dt) {
    for (const p of this.popups) if (p.t > 0) p.t -= dt;
    if (this.toastT > 0) this.toastT -= dt;
  }

  /** s = { score, best, combo, comboLeft, name, newBest, step, coarse } (reused object). */
  draw(ctx, screen, s) {
    switch (screen) {
      case 'menu': this.drawMenu(ctx, s); break;
      case 'tutorial': this.dim(ctx); this.drawTutorial(ctx, s); break;
      case 'playing': case 'crashed': this.drawHud(ctx, s); break;
      case 'paused': this.drawHud(ctx, s); this.dim(ctx); this.text(ctx, 'Paused', this.viewW / 2, 210, this.f.title); break;
      case 'settings': this.dim(ctx); this.text(ctx, 'Settings', this.viewW / 2, 190, this.f.title); break;
      case 'gameover': this.dim(ctx); this.drawGameOver(ctx, s); break;
    }
    this.drawButtons(ctx);
    this.drawPopups(ctx);
    this.drawToast(ctx);
  }

  // ---------- helpers ----------
  text(ctx, str, x, y, font, color = C.INK, align = 'center') {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y, this.viewW * 0.92);
  }

  rect(ctx, x, y, w, h, key) {
    pts[0] = x; pts[1] = y; pts[2] = x + w; pts[3] = y; pts[4] = x + w; pts[5] = y + h;
    pts[6] = x; pts[7] = y + h; pts[8] = x + 1; pts[9] = y - 1; // slight overshoot, like a marker
    sketchPolyline(ctx, pts, 5, key, C.JITTER * 0.8);
  }

  dim(ctx) {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = C.PAPER;
    ctx.fillRect(0, this.viewTop, this.viewW, C.WORLD_HEIGHT - this.viewTop);
    ctx.globalAlpha = 1;
  }

  drawButtons(ctx) {
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i];
      if (!b.visible) continue;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = b.id === this.pressed ? '#e7e2d4' : C.PAPER;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = 1;
      setInk(ctx, C.STROKE * 0.8, C.INK);
      ctx.beginPath();
      this.rect(ctx, b.x, b.y, b.w, b.h, 2000 + i * 10);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (b.id === 'pause') {
        sketchLine(ctx, cx - 5, cy - 9, cx - 5, cy + 9, 2500);
        sketchLine(ctx, cx + 5, cy - 9, cx + 5, cy + 9, 2501);
      } else if (b.id === 'settings') { // gear doodle
        sketchCircle(ctx, cx, cy, 7, 2502, 0.6);
        for (let k = 0; k < 6; k++) {
          const a = k * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
          sketchLine(ctx, cx + ca * 9, cy + sa * 9, cx + ca * 13, cy + sa * 13, 2510 + k, 0.3);
        }
      }
      ctx.stroke();
      if (b.label) this.text(ctx, b.label, cx, cy + 1, this.f.btn);
    }
  }

  drawHud(ctx, s) {
    const top = this.viewTop + this.safe.t + 10, l = this.safe.l + 14;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = this.f.hud;
    ctx.fillStyle = C.INK;
    ctx.fillText(fmt(s.score), l, top);
    ctx.font = this.f.small;
    ctx.fillStyle = C.GREY_INK;
    ctx.fillText(`Best ${fmt(Math.max(s.best, s.score))}`, l, top + this.f.hudSize + 4);
    if (s.combo > 1) {
      const cx = this.viewW / 2;
      ctx.textAlign = 'center';
      ctx.font = this.f.hud;
      ctx.fillStyle = C.INK;
      ctx.fillText(`x${s.combo}`, cx, top);
      setInk(ctx, C.STROKE, C.INK, 0.8); // remaining combo time on flat ground
      ctx.beginPath();
      const w = 56 * s.comboLeft, by = top + this.f.hudSize + 8;
      if (w > 1) sketchLine(ctx, cx - 28, by, cx - 28 + w, by, 2600, 0.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawMenu(ctx, s) {
    const cx = this.viewW / 2;
    ctx.save();
    ctx.translate(cx, 150);
    ctx.rotate(-0.035 + boilNoise(5) * 0.006); // slight hand-drawn tilt that boils
    this.text(ctx, C.GAME_NAME, 0, 0, this.f.title);
    ctx.restore();
    const uw = Math.min(this.viewW * 0.4, this.f.hudSize * 5);
    setInk(ctx, C.STROKE, C.INK);
    ctx.beginPath();
    sketchLine(ctx, cx - uw, 184, cx + uw, 181, 901);
    ctx.stroke();
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 300);
    this.text(ctx, s.coarse ? 'Tap to start' : 'Click or press Space', cx, 260, this.f.body);
    ctx.globalAlpha = 1;
    this.text(ctx, `Best: ${fmt(s.best)}`, cx, 305, this.f.small, C.GREY_INK);
  }

  drawTutorial(ctx, s) {
    const cx = this.viewW / 2, step = TUTORIAL[s.step];
    this.text(ctx, step[0], cx, 170, this.f.body);
    this.text(ctx, step[1], cx, 205, this.f.small, C.GREY_INK);
    setInk(ctx, C.STROKE, C.INK);
    ctx.beginPath();
    if (s.step === 0) {
      sketchCircle(ctx, cx, 300, 14, 3000);
    } else if (s.step === 1) {
      this.arrow(ctx, cx, 300, 0, -1, 3010);
      this.arrow(ctx, cx, 300, -1, 0, 3020);
      this.arrow(ctx, cx, 300, 1, 0, 3030);
      this.arrow(ctx, cx, 300, 0, 1, 3040);
    } else {
      sketchLine(ctx, cx - 20, 330, cx - 6, 344, 3050); // check mark
      sketchLine(ctx, cx - 6, 344, cx + 24, 312, 3051);
    }
    ctx.stroke();
    if (s.step === 0) { // ripples
      setInk(ctx, C.STROKE * 0.5, C.INK, 0.5);
      ctx.beginPath();
      sketchCircle(ctx, cx, 300, 26, 3001);
      sketchCircle(ctx, cx, 300, 38, 3002);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (s.step === 1) {
      this.text(ctx, 'FLIP', cx, 238, this.f.btn);
      this.text(ctx, 'GRAB', cx, 364, this.f.btn);
      this.text(ctx, 'SPIN', cx - 80, 300, this.f.btn);
      this.text(ctx, 'SPIN', cx + 80, 300, this.f.btn);
    } else {
      this.text(ctx, 'x2', cx - 70, 280, this.f.btn);
      this.text(ctx, 'x3', cx, 276, this.f.hud);
      this.text(ctx, 'x4', cx + 74, 272, this.f.big);
    }
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 300);
    this.text(ctx, `Tap to continue  (${s.step + 1}/3)`, cx, 410, this.f.small);
    ctx.globalAlpha = 1;
  }

  arrow(ctx, cx, cy, dx, dy, key) {
    const x0 = cx + dx * 16, y0 = cy + dy * 16, x1 = cx + dx * 50, y1 = cy + dy * 50;
    sketchLine(ctx, x0, y0, x1, y1, key);
    sketchLine(ctx, x1, y1, x1 - dx * 10 - dy * 8, y1 - dy * 10 - dx * 8, key + 1);
    sketchLine(ctx, x1, y1, x1 - dx * 10 + dy * 8, y1 - dy * 10 + dx * 8, key + 2);
  }

  drawGameOver(ctx, s) {
    const cx = this.viewW / 2;
    this.text(ctx, `Nice run, ${s.name}!`, cx, 130, this.f.body);
    this.text(ctx, fmt(s.score), cx, 188, this.f.big);
    this.text(ctx, `Best: ${fmt(s.best)}`, cx, 236, this.f.small, C.GREY_INK);
    if (s.newBest) { // rubber-stamp badge
      ctx.save();
      ctx.translate(cx, 268);
      ctx.rotate(-0.08 + boilNoise(9) * 0.01);
      setInk(ctx, C.STROKE * 0.8, C.INK);
      ctx.beginPath();
      this.rect(ctx, -62, -15, 124, 30, 2700);
      ctx.stroke();
      this.text(ctx, 'NEW BEST!', 0, 1, this.f.btn);
      ctx.restore();
    }
  }

  drawPopups(ctx) {
    for (const p of this.popups) {
      if (p.t <= 0) continue;
      ctx.globalAlpha = Math.min(1, p.t * 3);
      this.text(ctx, p.text, this.viewW / 2, 240 + p.y - (1 - p.t / C.POPUP_TIME) * 40, this.f.hud);
    }
    ctx.globalAlpha = 1;
  }

  drawToast(ctx) {
    if (this.toastT <= 0) return;
    const w = Math.min(260, this.viewW - 40), h = 40, x = (this.viewW - w) / 2;
    const y = C.WORLD_HEIGHT - this.safe.b - 140;
    ctx.globalAlpha = Math.min(1, this.toastT * 3);
    ctx.fillStyle = C.PAPER;
    ctx.fillRect(x, y, w, h);
    setInk(ctx, C.STROKE * 0.7, C.INK, ctx.globalAlpha);
    ctx.beginPath();
    this.rect(ctx, x, y, w, h, 2800);
    ctx.stroke();
    this.text(ctx, this.toastText, this.viewW / 2, y + h / 2, this.f.btn);
    ctx.globalAlpha = 1;
  }
}

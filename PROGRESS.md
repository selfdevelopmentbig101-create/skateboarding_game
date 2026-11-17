# Sketch Skate: PROGRESS

## Phases done
- [x] Phase 1: Foundation (canvas, sketch renderer, skater on flat ground)
- [x] Phase 2: World (obstacles, collision, crash, fair generation, difficulty)
- [x] Phase 3: Tricks, scoring, combos, HUD and screens
- [x] Phase 4: Telegram integration
- [ ] Phase 5: Bot/README  - [ ] Phase 6: Leaderboard (OPTIONAL)  - [ ] Phase 7: Audit

## Files
- package.json: no dependencies; "type": "module" so Node can run game modules; `npm test` runs all four tests.
- tests/fairness.mjs: generator fairness simulation (ramp + max difficulty, many seeds) with the autoplay bot.
- tests/scoring.mjs: unit tests for trick timing, banking, combo, grab, stairs, grind, distance, crash.
- tests/tg.mjs: (Phase 4) tg.js + dev-mock.js with a fake browser: plain-browser no-ops, init calls, version gating
  (8.0 / 7.0 / 6.0), fullscreen, insets merge, theme, deactivated, closing confirmation, MainButton, name, share
  link, CloudStorage round trip and timeout.
- tests/storage.mjs: (Phase 4) best = max(localStorage, CloudStorage), never lowered, slow cloud falls back.
- game/index.html: page shell, viewport meta, canvas, rotate-hint overlay; Phase 4 loads telegram-web-app.js in
  <head> before main.js.
- game/style.css: full-screen no-zoom/no-scroll layout, letterbox background, rotate hint (unchanged). The outer
  colours come from --outer-bg / --outer-text, which tg.js overwrites from themeParams inside Telegram.
- game/config.js: every tunable constant (layout, loop, physics, collision, difficulty, obstacles, tricks,
  scoring, ink, Telegram).
- game/main.js: layout + safe-area probe, fixed 60 Hz loop + interpolation, game flow (menu, tutorial, playing,
  paused, settings, crashed, gameover), input routing, scoring hookup, Telegram boot/haptics/MainButton/share,
  debug/autoplay/tgmock flags.
- game/tg.js: (Phase 4) all Telegram calls, guarded and version-checked; no-ops outside Telegram.
- game/dev-mock.js: (Phase 4, DEV ONLY) fake Telegram.WebApp, imported by main.js only with ?tgmock=1.
- game/ui.js: canvas UI: HUD, trick buttons, start / tutorial / pause / settings / game-over screens, popups,
  toasts, hit-testing (unchanged in Phase 4).
- game/scoring.js: trick state (kickflip, 360 spin, grab), pending points, banking, combo multiplier.
- game/storage.js: async getBest/setBest (localStorage + Telegram CloudStorage), getFlag/setFlag, getSetting/setSetting.
- game/input.js: Pointer Events (UI vs gameplay pointers, swipe detection) + keyboard (unchanged).
- game/draw.js: seeded hash, boil, sketchLine/Polyline/Circle, ground with gap holes, shadow.
- game/skater.js: stick figure + poses, kickflip board flip, 360 spin squash, crash tumble.
- game/physics.js: body integration vs world, jump with hold-to-extend, crash slide, airTime() helper.
- game/world.js: obstacle pool, seeded fair generator, difficulty ramp + stages, events, obstacle drawing,
  parallax doodles, particle pool.
- game/autoplay.js: DEV ONLY ideal-timing bot (?autoplay=1 and the fairness test).

## config.js constants
Layout: GAME_NAME, WORLD_HEIGHT=640, MIN_VIEW_W=340, MAX_ASPECT=0.8, DPR_CAP=2.5, GROUND_Y=480, SKATER_X_FRAC=0.28
Loop: FIXED_DT=1/60, MAX_FRAME_DT=0.25, MAX_STEPS_PER_FRAME=5
Physics: BASE_SPEED=300, GRAVITY=2300, JUMP_VELOCITY=720, JUMP_HOLD_MAX=0.15, JUMP_HOLD_GRAVITY=0.7, JUMP_BUFFER=0.1
Collision: NOSE=26, TRUCK=17, FACE_TOL=8, RAIL_TOL=10, LAND_TOL=10, SNAP_UP=14, SNAP_DOWN=14, GAP_DEATH=-40
Crash: CRASH_TIME=1.1, CRASH_FRICTION=520
Difficulty: MAX_SPEED=520, RAMP_TIME=70, STAGE_TIMES=[0,10,20,32,45], SPACE_T_EASY=1.3, SPACE_T_HARD=0.6,
  SPACE_T_RANDOM=0.5, COMBO_CHANCE=0.35, COMBO_LEAD=0.3, FIRST_OBSTACLE_X=700, SPAWN_AHEAD=1600,
  POOL_SIZE=24, PARTICLE_POOL=64, AIR_HOLD_FACTOR=1.15
Obstacles: GAP_W 80-190, GAP_SAFETY=0.7, GAP_DEPTH=70, BOX_H 32-52, BOX_L 60-150, RAIL_H 38-48, RAIL_L 160-320,
  STAIR_H 36-54, STAIR_TOP 70-130, STAIR_RUN=24, STAIR_STEPS 3-6, KICKER_H 28-40, KICKER_L=80, KICKER_VY=880
Tricks/scoring: LEADERBOARD_URL='', FLIP_TIME=0.42, SPIN_TIME=0.55, GRAB_RELEASE_TIME=0.12, FLIP_POINTS=100,
  SPIN_POINTS=150, GRAB_POINTS=50, GRAB_BONUS=25, GRAB_BONUS_EVERY=0.25, OLLIE_POINTS=25, STAIR_SET_POINTS=100,
  STAIR_STEP_POINTS=20, GRIND_POINTS_PER_PX=0.2, DIST_POINTS_PER_PX=1/50, COMBO_CAP=10, COMBO_GROUND_TIME=1,
  BANK_DELAY=0.2, LAND_ANGLE_TOL=0.35, SWIPE_MIN=30, TOUCH_MIN_CSS=44, POPUP_TIME=1.1
Animation: POP_TIME=0.12, LAND_TIME=0.18, PUSH_INTERVAL=2.4, PUSH_DURATION=0.75
Ink: PAPER, INK, GREY_INK, BG_INK, STROKE=3.6, JITTER=1.3, BOIL_FPS=10, FONT_STACK
Ground/bg: GROUND_SEG=40, GROUND_WOBBLE=2.5, MARK_SPACING=64, PARALLAX_CLOUDS=0.08, PARALLAX_CITY=0.3, PARALLAX_LAMPS=0.6
Telegram (Phase 4): BOT_USERNAME='<YOUR_BOT_USERNAME>', APP_SHORT_NAME='<YOUR_APP_SHORT_NAME>',
  MINI_APP_LINK=`https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}`, TG_STORAGE_TIMEOUT=1500, TG_FULLSCREEN=true,
  TG_USE_MAIN_BUTTON=true, TG_MAIN_BUTTON_TEXT='🛹 Play again', NAME_MAX=20

## Decisions and assumptions
- Logical units: world height 640 always visible; width from aspect, min 340 (extra sky on narrow phones),
  canvas capped at MAX_ASPECT and letterboxed. Touch landscape: rotate hint, sim frozen.
- Physics y is height above ground (up = +); screen y = GROUND_Y - 12 - y.
- Jump fires on press; holding while rising lowers gravity for up to JUMP_HOLD_MAX s. 0.1 s buffer.
- Events on the World: obstacleCleared, grindTick, landed, crashed (payloads are reused objects).
- All UI is drawn on the canvas and hit-tested in ui.js; no HTML buttons.
- Scoring, tricks, combo, tutorial, pause: as described in Phase 3 (unchanged).
- Phase 4, boot order: main.js never waits for Telegram or storage. With ?tgmock=1 it first imports dev-mock.js,
  then calls tg.init(); saved values (best, tutorial flag, settings) apply when they arrive.
- Phase 4, "in Telegram" = Telegram.WebApp has initData or a platform other than "unknown". The official script
  also defines Telegram.WebApp in a plain browser, so merely having the object is not enough.
- Phase 4, init order: ready(), expand(), disableVerticalSwipes() (>= 7.7), lockOrientation() (>= 8.0, only if the
  app is opened in portrait, because Telegram locks the CURRENT orientation), theme + colours.
- Phase 4, fullscreen: requestFullscreen() on the first tap, once, only on android / android_x / ios clients
  (>= 8.0). Desktop clients keep their normal window. Errors are caught and ignored.
- Phase 4, insets: per side = max(env(safe-area-inset), Telegram safeAreaInset) + contentSafeAreaInset (the
  Telegram header buttons sit inside the safe area, so the two add up). Falls back to the --tg-*-inset-* CSS
  variables if the JS objects are missing. Layout reruns on viewportChanged, safeAreaChanged,
  contentSafeAreaChanged, fullscreenChanged and themeChanged. Height = min(innerHeight, viewportStableHeight).
- Phase 4, theme: bg_color, text_color, button_color, button_text_color, hint_color, secondary_bg_color go to CSS
  variables (--outer-bg, --outer-text, --tg-button, --tg-button-text, --tg-hint, --tg-secondary-bg); only
  #hex values are accepted. Header colour = paper (hex needs 6.9, else "bg_color"); background and bottom bar =
  theme bg_color. The canvas stays paper-white in dark mode.
- Phase 4, haptics: light impact on every ollie (also buffered / button ollies), medium impact on a clean landing,
  error notification on crash, success notification on a new best.
- Phase 4, closing confirmation is on during playing, paused, crashed and settings-opened-from-pause; off on the
  menu, tutorial and game-over screens.
- Phase 4, MainButton "🛹 Play again" shows on game over once the buttons are live (0.3 s), hidden otherwise. The
  in-canvas Play again button stays too (it is the only one in a browser). Showing the MainButton shrinks the
  viewport, so the canvas rescales slightly on game over and back on play.
- Phase 4, best score: max(localStorage, CloudStorage key "best"). Each CloudStorage call gives up after 1.5 s.
  Whichever store is behind is updated. A lower score never overwrites a higher value. Flags and settings stay on
  localStorage only.
- Phase 4, share: openTelegramLink("https://t.me/share/url?url=...&text=..."). While BOT_USERNAME /
  APP_SHORT_NAME are still placeholders, the page's own URL is shared instead of a broken t.me link. Outside
  Telegram: navigator.share, then clipboard (as in Phase 3).
- Phase 4, user name comes from initDataUnsafe.user.first_name (control chars stripped, max 20 chars),
  fallback "Skater". Display only; nothing trusted is derived from it.
- Phase 4, pause on visibilitychange and on Telegram's 'deactivated' event.
- Phase 4, dev mock: ?tgmock=1 [&tgver=7.0] [&tgplatform=ios] [&tgname=Ada] [&tgtheme=dark] [&tgslow=1].
  Old versions throw on unsupported calls, like the real WebApp. A DOM bar emulates the MainButton. Console:
  __tgmock.log, .dark(), .light(), .deactivate(), .activate(), .emit('viewportChanged').
  ?debug=1 also prints a "telegram ..." line.

## Known issues
- Verified in Node by the assistant: `node --check` on main.js, tg.js, storage.js, dev-mock.js, config.js and the
  new tests; tests/tg.mjs (18 tests) and tests/storage.mjs (7 tests) pass.
- NOT run by the assistant in Phase 4: tests/scoring.mjs and tests/fairness.mjs (their game files were not in the
  Phase 4 sandbox; Phase 4 does not touch physics, world or scoring), and any browser or Telegram session. main.js
  was only syntax-checked, not executed.
- Cannot be tested outside Telegram: real expand / fullscreen / orientation lock, real safe-area numbers, real
  haptics, real CloudStorage, real share sheet, header/background colours. See the manual checklist in the
  Phase 4 report.
- The real telegram-web-app.js is loaded from telegram.org; offline, the game still works (tg.js no-ops).
- MainButton changes the viewport height, so the canvas rescales a little on the game-over screen.
- Not verified from earlier phases: real browser rendering and fonts, trick animation look, real-device fps,
  real touch swipes and navigator.share on phones.

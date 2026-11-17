# Sketch Skate: PROGRESS

## Phases done
- [x] Phase 1: Foundation (canvas, sketch renderer, skater on flat ground)
- [x] Phase 2: World (obstacles, collision, crash, fair generation, difficulty)
- [x] Phase 3: Tricks, scoring, combos, HUD and screens
- [ ] Phase 4: Telegram  - [ ] Phase 5: Bot/README  - [ ] Phase 6: Leaderboard (OPTIONAL)  - [ ] Phase 7: Audit

## Files
- package.json: no dependencies; "type": "module" so Node can run game modules; `npm test` runs both tests.
- tests/fairness.mjs: generator fairness simulation (ramp + max difficulty, many seeds) with the autoplay bot.
- tests/scoring.mjs: unit tests for trick timing, banking, combo, grab, stairs, grind, distance, crash.
- game/index.html: page shell, viewport meta, canvas, rotate-hint overlay, loads main.js (unchanged since Phase 1).
- game/style.css: full-screen no-zoom/no-scroll layout, letterbox background, rotate hint (unchanged).
- game/config.js: every tunable constant (layout, loop, physics, collision, difficulty, obstacles, tricks, scoring, ink).
- game/main.js: layout + safe-area probe, fixed 60 Hz loop + interpolation, game flow (menu, tutorial,
  playing, paused, settings, crashed, gameover), input routing, scoring hookup, share, debug/autoplay flags.
- game/ui.js: canvas UI: HUD (score, best, combo + timer bar, pause), trick buttons, start / tutorial /
  pause / settings / game-over screens, popups, toasts, button hit-testing.
- game/scoring.js: trick state (kickflip, 360 spin, grab), pending points, banking, combo multiplier.
- game/storage.js: async getBest/setBest, getFlag/setFlag, getSetting/setSetting on localStorage.
- game/input.js: Pointer Events (UI vs gameplay pointers, swipe detection) + keyboard.
- game/draw.js: seeded hash, boil, sketchLine/Polyline/Circle, ground with gap holes, shadow.
- game/skater.js: stick figure + poses (crouch, roll/push, pop, air, land, grind, crash, kickflip, grab),
  kickflip board flip, 360 spin squash, crash tumble.
- game/physics.js: body integration vs world (two-truck support, nose face hits, kicker launch, rails),
  jump with hold-to-extend, crash slide, airTime() helper.
- game/world.js: obstacle pool, seeded fair generator, difficulty ramp + stages, combos, support/face
  queries, events, obstacle drawing, parallax doodles, particle pool.
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

## Decisions and assumptions
- Logical units: world height 640 always visible; width from aspect, min 340 (extra sky on narrow phones),
  canvas capped at MAX_ASPECT and letterboxed. Touch landscape: rotate hint, sim frozen.
- Physics y is height above ground (up = +); screen y = GROUND_Y - 12 - y.
- Jump fires on press; holding while rising lowers gravity for up to JUMP_HOLD_MAX s (~+24% apex). 0.1 s buffer.
- Board support = higher of the two trucks; faces are hit by the nose. Obstacle rules and fairness as in Phase 2.
- Events on the World: obstacleCleared {type, touched, touchedSteps, obstacle}, grindTick {dist},
  landed {impact, surface}, crashed {reason, distance}. Payloads are reused objects.
- All UI is drawn on the canvas (sketch style) and hit-tested in ui.js; no HTML buttons. Safe-area insets come
  from a hidden probe element using env(safe-area-inset-*). Phase 4 merges Telegram insets in readInsets().
- Input: a touch that starts on a button belongs to the UI (no jump). Gameplay touch: press = ollie, a 30 px
  swipe = trick (one per gesture). Swiping from the ground therefore does ollie + trick. Trick buttons and
  arrow keys also ollie first when on the ground. Grab lasts while the finger/button/key is held.
- Scoring: trick and obstacle points go to "pending"; a clean landing banks them x combo after BANK_DELAY
  (or at the next takeoff). Popup shows base points + multiplier, e.g. "+150 360 SPIN x3". Each bank raises
  the combo (cap 10); more than 1 s on flat ground resets it (box tops, rails, stairs and kickers do not).
  Landing during a trick (including letting go of a grab) = crash. Clean = board within 0.35 rad of level;
  otherwise "SKETCHY" (points and combo lost). Ollie over gap/box/rail = 25. Stairs: whole set jumped =
  100 + 20/step. Grind = 0.2 pts/px, banked on the landing after the rail. Distance = 1 pt per 50 px.
- Tutorial shows once (flag 'tutorialDone'); trick buttons setting saved ('trickButtons', default ON).
- Pause: button, Esc/P, and automatically on visibilitychange. Paused and settings freeze the simulation.
- getUserName() returns "Skater" and Share uses navigator.share, then clipboard; Phase 4 replaces both.
  Leaderboard button only appears if LEADERBOARD_URL is set (Phase 6).

## Known issues
- Verified by the assistant in Node: `node --check` on all JS files; tests/scoring.mjs (11 tests) and
  tests/fairness.mjs pass; headless runs of main.js with a fake DOM exercised menu, tutorial (flag saved),
  swipe kickflip/spin with popups and combo, trick buttons, auto-pause, Esc pause, settings toggle (saved),
  Space resume, crash, game over with NEW BEST, best saved, share clipboard fallback, play again, and a
  4-minute autoplay run, all with no runtime errors.
- Not verified: real browser rendering and fonts, the look of the trick animations, real-device fps, real
  touch swipes and navigator.share on phones.
- ~400-480 path segments per frame on average (peak ~600 with UI). Background subdivision can be reduced.
- The fairness bot uses perfect timing; human comfort comes from the spacing constants.

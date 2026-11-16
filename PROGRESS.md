# Sketch Skate: PROGRESS

## Phases done
- [x] Phase 1: Foundation (canvas, sketch renderer, skater on flat ground)
- [ ] Phase 2: World  - [ ] Phase 3: Tricks/UI  - [ ] Phase 4: Telegram
- [ ] Phase 5: Bot/README  - [ ] Phase 6: Leaderboard (OPTIONAL)  - [ ] Phase 7: Audit

## Files
- game/index.html: page shell, viewport meta, canvas, rotate-hint overlay, loads main.js as a module.
- game/style.css: full-screen no-zoom/no-scroll layout, letterbox background, rotate hint.
- game/config.js: every tunable constant (layout, loop, physics, animation, ink, ground).
- game/main.js: layout/DPR scaling, fixed 60 Hz loop with interpolation, run state, start screen, debug fps.
- game/draw.js: seeded hash, boil, sketchLine/sketchPolyline/sketchCircle, ground + shadow drawing.
- game/skater.js: stick-figure skater, pose keyframes + smoothing, push cycle, board with wheels.
- game/physics.js: skater body, jump with hold-to-extend, fixed-step integration, landing detection.
- game/input.js: Pointer Events + Space key press/release, gesture/zoom blocking.

## config.js constants
GAME_NAME, WORLD_HEIGHT=640, MIN_VIEW_W=340, MAX_ASPECT=0.8, DPR_CAP=2.5, GROUND_Y=480,
SKATER_X_FRAC=0.28, FIXED_DT=1/60, MAX_FRAME_DT=0.25, MAX_STEPS_PER_FRAME=5,
BASE_SPEED=300, GRAVITY=2300, JUMP_VELOCITY=720, JUMP_HOLD_MAX=0.15, JUMP_HOLD_GRAVITY=0.7,
JUMP_BUFFER=0.1, POP_TIME=0.12, LAND_TIME=0.18, PUSH_INTERVAL=2.4, PUSH_DURATION=0.75,
PAPER, INK, GREY_INK, STROKE=3.6, JITTER=1.3, BOIL_FPS=10, FONT_STACK,
GROUND_SEG=40, GROUND_WOBBLE=2.5, MARK_SPACING=64

## Decisions and assumptions
- Logical units: world height 640 always visible; width derived from aspect, min 340
  (narrow phones get extra sky above), canvas capped at MAX_ASPECT and letterboxed.
- Touch device in landscape: rotate hint shown and simulation frozen. Desktop: letterboxed.
- Physics y is height above ground (up = positive); screen y = GROUND_Y - 12 - y.
- Jump fires on press (no latency); holding during ascent lowers gravity for up to
  JUMP_HOLD_MAX s (~+24% height, capped). 0.1 s press buffer before landing.
- Base air time ~0.63 s (apex ~113 px); max hold ~0.75 s (apex ~140 px). Phase 2 fairness uses these.
- Pose joints are offsets from deck-top center; "L" = back side, "R" = front. Feet rotate with the board.
- Two-pass ink: main stroke + faint thin offset stroke. Jitter re-seeded at BOIL_FPS.
- Start screen lives in main.js for now; Phase 3 moves it into ui.js. Best score is a
  constant 0 until Phase 3 (storage.js).
- Ground drawing lives in draw.js; Phase 2 world.js will supply terrain height to physics.
- `?debug=1` shows fps (Phase 2 extends the overlay).

## Known issues
- Not executed by the assistant: no syntax check or device test was run.
- Fonts vary by platform (Marker Felt / Comic Sans where present, else system-ui).
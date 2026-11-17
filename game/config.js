// config.js: every tunable number lives here.
// Units: logical px (world space) and seconds. Physics y is height above ground (up = +).

export const GAME_NAME = 'Sketch Skate';

// --- Layout ---
export const WORLD_HEIGHT = 640;   // logical height that always fits on screen
export const MIN_VIEW_W = 340;     // minimum visible logical width (narrow phones get extra sky)
export const MAX_ASPECT = 0.8;     // max canvas width/height; wider windows are letterboxed
export const DPR_CAP = 2.5;        // devicePixelRatio cap for performance
export const GROUND_Y = 480;       // logical screen y of the ground line
export const SKATER_X_FRAC = 0.28; // skater's horizontal position as a fraction of view width

// --- Loop ---
export const FIXED_DT = 1 / 60;       // physics timestep
export const MAX_FRAME_DT = 0.25;     // clamp after tab switches / hitches
export const MAX_STEPS_PER_FRAME = 5; // avoid spiral of death on slow devices

// --- Physics ---
export const BASE_SPEED = 300;        // starting forward speed, px/s
export const GRAVITY = 2300;          // px/s^2
export const JUMP_VELOCITY = 720;     // initial ollie velocity, px/s (apex ~113 px, air ~0.63 s)
export const JUMP_HOLD_MAX = 0.15;    // max seconds of reduced gravity while holding (caps height)
export const JUMP_HOLD_GRAVITY = 0.7; // gravity multiplier while holding on the way up (~+24% apex)
export const JUMP_BUFFER = 0.1;       // a press this close before landing still jumps on touchdown

// --- Collision (Phase 2) ---
export const NOSE = 26;       // board nose distance from center: hits obstacle faces
export const TRUCK = 17;      // truck distance from center: the two support points
export const FACE_TOL = 8;    // clearing a face this much below its top still counts (snaps up)
export const RAIL_TOL = 10;   // same, for rails
export const LAND_TOL = 10;   // landing accepted if we were at most this far below the surface
export const SNAP_UP = 14;    // max rise per step while rolling (slopes)
export const SNAP_DOWN = 14;  // drops bigger than this make the skater airborne
export const GAP_DEATH = -40; // falling this far into a gap = crash

// --- Crash ---
export const CRASH_TIME = 1.1;      // tumble animation before the game-over screen
export const CRASH_FRICTION = 520;  // px/s^2 slowdown while tumbling

// --- Difficulty (Phase 2) ---
export const MAX_SPEED = 520;       // speed cap, px/s
export const RAMP_TIME = 70;        // seconds until max difficulty (smoothstep curve)
export const STAGE_TIMES = [0, 10, 20, 32, 45]; // unlocks: gap+box, +kicker, +stairs, +rail, +combos
export const SPACE_T_EASY = 1.3;    // seconds of flat run between obstacles at difficulty 0
export const SPACE_T_HARD = 0.6;    // ... at difficulty 1
export const SPACE_T_RANDOM = 0.5;  // extra random spacing (seconds), shrinks with difficulty
export const COMBO_CHANCE = 0.35;   // chance of a combo once unlocked
export const COMBO_LEAD = 0.3;      // seconds between stairs bottom and the gap in a stairs+gap combo
export const FIRST_OBSTACLE_X = 700;
export const SPAWN_AHEAD = 1600;    // generate this far ahead of the skater
export const POOL_SIZE = 24;        // obstacle pool
export const PARTICLE_POOL = 64;
export const AIR_HOLD_FACTOR = 1.15; // margin for longer, held jumps when computing exits

// --- Obstacles ---
export const GAP_W_MIN = 80, GAP_W_MAX = 190;
export const GAP_SAFETY = 0.7;      // max gap = 70% of a tap jump's distance (+ board span)
export const GAP_DEPTH = 70;        // drawn depth
export const BOX_H_MIN = 32, BOX_H_MAX = 52, BOX_L_MIN = 60, BOX_L_MAX = 150;
export const RAIL_H_MIN = 38, RAIL_H_MAX = 48, RAIL_L_MIN = 160, RAIL_L_MAX = 320;
export const STAIR_H_MIN = 36, STAIR_H_MAX = 54, STAIR_TOP_MIN = 70, STAIR_TOP_MAX = 130;
export const STAIR_RUN = 24, STAIR_STEPS_MIN = 3, STAIR_STEPS_MAX = 6;
export const KICKER_H_MIN = 28, KICKER_H_MAX = 40, KICKER_L = 80;
export const KICKER_VY = 880;       // launch speed off the kicker lip, px/s

// --- Skater animation ---
export const POP_TIME = 0.12;      // seconds in "ollie pop" pose before "airborne"
export const LAND_TIME = 0.18;     // landing squash duration
export const PUSH_INTERVAL = 2.4;  // seconds between pushes while rolling
export const PUSH_DURATION = 0.75; // length of one push

// --- Ink ---
export const PAPER = '#fbfaf5';
export const INK = '#1b1b1b';
export const GREY_INK = '#8a8a8a';
export const BG_INK = '#b5b5b5';  // background doodles
export const STROKE = 3.6;   // main marker width, logical px (scales with screen)
export const JITTER = 1.3;   // max wobble offset, logical px
export const BOIL_FPS = 10;  // how often line jitter is re-seeded
export const FONT_STACK = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", system-ui, sans-serif';

// --- Ground and background ---
export const GROUND_SEG = 40;     // world px between ground-line vertices
export const GROUND_WOBBLE = 2.5; // static waviness of the ground line
export const MARK_SPACING = 64;   // world px between ground marks (cracks, pebbles)
export const PARALLAX_CLOUDS = 0.08, PARALLAX_CITY = 0.3, PARALLAX_LAMPS = 0.6;

// --- Tricks and scoring (Phase 3) ---
export const LEADERBOARD_URL = '';  // Phase 6 (OPTIONAL): '<YOUR_WORKER_URL>'. Empty = leaderboard hidden.
export const FLIP_TIME = 0.42;      // kickflip duration, s (must finish before landing)
export const SPIN_TIME = 0.55;      // 360 spin duration, s
export const GRAB_RELEASE_TIME = 0.12; // time to let go of a grab; landing before that = crash
export const FLIP_POINTS = 100, SPIN_POINTS = 150;
export const GRAB_POINTS = 50, GRAB_BONUS = 25, GRAB_BONUS_EVERY = 0.25; // +25 per 0.25 s held
export const OLLIE_POINTS = 25;     // plain ollie over an obstacle
export const STAIR_SET_POINTS = 100, STAIR_STEP_POINTS = 20; // jumping the whole set
export const GRIND_POINTS_PER_PX = 0.2;
export const DIST_POINTS_PER_PX = 1 / 50; // 1 point per "meter"
export const COMBO_CAP = 10;        // max multiplier
export const COMBO_GROUND_TIME = 1; // seconds on flat ground before the combo resets
export const BANK_DELAY = 0.2;      // landing banks after this delay (catches obstacle-cleared events)
export const LAND_ANGLE_TOL = 0.35; // board tilt (rad) still counted as a clean landing
export const SWIPE_MIN = 30;        // swipe threshold, logical px
export const TOUCH_MIN_CSS = 44;    // minimum button size, CSS px
export const POPUP_TIME = 1.1;      // floating score text lifetime, s

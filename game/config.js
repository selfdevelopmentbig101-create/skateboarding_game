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
export const BASE_SPEED = 300;        // forward speed, px/s
export const GRAVITY = 2300;          // px/s^2
export const JUMP_VELOCITY = 720;     // initial ollie velocity, px/s (apex ~113 px, air ~0.63 s)
export const JUMP_HOLD_MAX = 0.15;    // max seconds of reduced gravity while holding (caps height)
export const JUMP_HOLD_GRAVITY = 0.7; // gravity multiplier while holding on the way up (~+24% apex)
export const JUMP_BUFFER = 0.1;       // a press this close before landing still jumps on touchdown

// --- Skater animation ---
export const POP_TIME = 0.12;      // seconds in "ollie pop" pose before "airborne"
export const LAND_TIME = 0.18;     // landing squash duration
export const PUSH_INTERVAL = 2.4;  // seconds between pushes while rolling
export const PUSH_DURATION = 0.75; // length of one push

// --- Ink ---
export const PAPER = '#fbfaf5';
export const INK = '#1b1b1b';
export const GREY_INK = '#8a8a8a';
export const STROKE = 3.6;   // main marker width, logical px (scales with screen)
export const JITTER = 1.3;   // max wobble offset, logical px
export const BOIL_FPS = 10;  // how often line jitter is re-seeded
export const FONT_STACK = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", system-ui, sans-serif';

// --- Ground ---
export const GROUND_SEG = 40;     // world px between ground-line vertices
export const GROUND_WOBBLE = 2.5; // static waviness of the ground line
export const MARK_SPACING = 64;   // world px between ground marks (cracks, pebbles)
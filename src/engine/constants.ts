/** Logical 16:9 viewport dimensions */
export const VIEWPORT_WIDTH = 960;
export const VIEWPORT_HEIGHT = 540;

/** Fixed physics timestep (60 Hz) */
export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 0.1;

/** Player hitbox dimensions */
export const PLAYER_WIDTH = 24;
export const PLAYER_STAND_HEIGHT = 56;
export const PLAYER_DUCK_HEIGHT = 28; // 50% of standing height

/** Horizontal movement physics (px/s and px/s^2) */
export const MAX_RUN_SPEED = 320;
export const GROUND_ACCEL = 2600;
export const GROUND_DECEL = 2800;
export const AIR_ACCEL = 1800;
export const AIR_DECEL = 600;

/** Jumping & gravity physics */
export const GRAVITY = 1750;
export const MAX_FALL_SPEED = 900;
export const JUMP_VELOCITY = -620;
export const DOUBLE_JUMP_VELOCITY = -560;
export const JUMP_CUT_MULTIPLIER = 0.55;
export const JUMP_CUT_THRESHOLD = -220;

/** Forgiveness windows (seconds) */
export const COYOTE_TIME = 0.1; // 100ms
export const JUMP_BUFFER_TIME = 0.1; // 100ms

/** Duck & slide physics */
export const SLIDE_TRIGGER_SPEED = 140;
export const SLIDE_INITIAL_SPEED = 420;
export const SLIDE_FRICTION = 520;
export const SLIDE_STOP_SPEED = 85;
export const SLIDE_MIN_DURATION = 0.22;
export const DUCK_CREEP_SPEED = 95;

/** Death & level transition timings (seconds) */
export const DEATH_DURATION = 0.4; // 400ms
export const LEVEL_COMPLETE_DURATION = 1.15;

/** Default laser parameters */
export const DEFAULT_LASER_THICKNESS = 8;
export const DEFAULT_LASER_WARNING_DURATION = 0.45;

/** Minimalist neon/dark mode color palette */
export const COLORS = {
  bg: '#0d0f1a',
  bgDeep: '#080a12',
  gridMajor: 'rgba(56, 189, 248, 0.08)',
  gridMinor: 'rgba(56, 189, 248, 0.03)',
  horizonGlow: 'rgba(34, 211, 238, 0.06)',

  // Player (Cyan / White)
  playerCore: '#ffffff',
  playerGlow: '#22d3ee',
  playerAccent: '#67e8f9',

  // Solid geometry (Neon Blue / Slate)
  solidFill: '#141b30',
  solidFillTop: '#1b2642',
  solidStroke: '#38bdf8',
  solidGlow: 'rgba(56, 189, 248, 0.45)',
  solidGridLine: 'rgba(56, 189, 248, 0.12)',

  // Lethal hazards (Neon Red / Magenta)
  hazardCore: '#fff1f2',
  hazardFill: '#f43f5e',
  hazardGlow: '#ff2a6d',
  laserWarning: '#fb7185',
  emitterFill: '#1e293b',
  emitterBorder: '#f43f5e',

  // Exit portal (Neon Green / Gold)
  portalOuter: '#10b981',
  portalInner: '#facc15',
  portalCore: '#fef9c3',
  portalGlow: '#34d399',

  // World hints
  hintText: 'rgba(148, 163, 184, 0.72)',
  hintGlow: 'rgba(56, 189, 248, 0.35)',

  // Boss (Crimson / Neon Red)
  bossCore: '#ffe4e6',
  bossMid: '#f43f5e',
  bossGlow: '#ff1744',
  bossEye: '#fef08a',
  bossBallCore: '#ffffff',
  bossBallInner: '#ff4d6d',
  bossBallGlow: '#ff1744',
  doorLockedFill: '#2a0f1c',
  doorLockedStroke: '#f43f5e',
  doorOpenStroke: '#10b981',
} as const;

/**
 * Exact kinematic reach calculations shared by level design and the validator.
 */
export function maxSingleJumpHeight(): number {
  return (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
}

export function maxDoubleJumpHeight(): number {
  return (
    (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY) +
    (DOUBLE_JUMP_VELOCITY * DOUBLE_JUMP_VELOCITY) / (2 * GRAVITY)
  );
}

/**
 * Theoretical maximum horizontal distance reachable from a ledge at y0 to a landing ledge at y1
 * using a full-speed jump + optimal double jump.
 * deltaY = y0 - y1 (positive means jumping UP to a higher ledge; negative means dropping DOWN).
 * Returns 0 if deltaY exceeds maxDoubleJumpHeight().
 */
export function maxDoubleJumpHorizontalReach(deltaY: number): number {
  const h1 = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
  const h2 = (DOUBLE_JUMP_VELOCITY * DOUBLE_JUMP_VELOCITY) / (2 * GRAVITY);
  const maxHeight = h1 + h2;
  if (deltaY > maxHeight) {
    return 0;
  }

  // Case 1: Jumping UP (deltaY > 0). Optimal vertical boost happens when second jump triggers at apex of first jump.
  // Time up1 = |v1|/g, time up2 = |v2|/g, then descend from maxHeight to deltaY: t_down = sqrt(2*(maxHeight - deltaY)/g).
  // Case 2: Flat or dropping DOWN (deltaY <= 0). Even longer horizontal reach if second jump triggers just before falling below landing height:
  // Wait until descending to y0 (time = 2*|v1|/g), then jump2 rises h2 and drops to deltaY (time = |v2|/g + sqrt(2*(h2 - deltaY)/g)).
  const tUp1 = Math.abs(JUMP_VELOCITY) / GRAVITY;
  const tUp2 = Math.abs(DOUBLE_JUMP_VELOCITY) / GRAVITY;

  let maxAirTime: number;
  if (deltaY > 0) {
    // We can delay jump2 as long as we are still at height >= deltaY - h2
    const minTriggerHeight = Math.max(0, deltaY - h2);
    // Descending from h1 to minTriggerHeight takes sqrt(2*(h1 - minTriggerHeight)/g)
    const tDescendBeforeSecond = Math.sqrt(
      Math.max(0, (2 * (h1 - minTriggerHeight)) / GRAVITY)
    );
    const secondApex = minTriggerHeight + h2;
    const tFinalDrop = Math.sqrt(
      Math.max(0, (2 * (secondApex - deltaY)) / GRAVITY)
    );
    maxAirTime = tUp1 + tDescendBeforeSecond + tUp2 + tFinalDrop;
  } else {
    // Flat or dropping: delay second jump until reaching y = 0 (same level as takeoff)
    const tBeforeSecond = 2 * tUp1;
    const tFinalDrop = Math.sqrt((2 * (h2 - deltaY)) / GRAVITY);
    maxAirTime = tBeforeSecond + tUp2 + tFinalDrop;
  }

  // Include coyote time horizontal forgiveness (~50% of coyote window)
  return MAX_RUN_SPEED * maxAirTime + PLAYER_WIDTH;
}

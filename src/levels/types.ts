export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export type SpikeDirection = 'up' | 'down' | 'left' | 'right';

export interface SpikeData extends Rect {
  direction: SpikeDirection;
}

export interface LaserData {
  /** Start point X (emitter A) */
  x1: number;
  /** Start point Y (emitter A) */
  y1: number;
  /** End point X (emitter B) */
  x2: number;
  /** End point Y (emitter B) */
  y2: number;
  /** Beam lethal thickness in pixels (default: 8) */
  thickness?: number;
  /** If true, laser cycles on and off with a warning telegraph */
  timed: boolean;
  /** Total cycle period in seconds (required when timed is true) */
  cyclePeriod?: number;
  /** Duration beam is lethal per cycle in seconds (required when timed is true) */
  activeDuration?: number;
  /** Initial phase offset in seconds (default: 0) */
  phaseOffset?: number;
  /** Warning flicker duration before beam activates in seconds (default: 0.45) */
  warningDuration?: number;
}

export interface LevelHint {
  x: number;
  y: number;
  text: string;
}

export interface BossConfig {
  /** Boss display name (e.g., "Crimson Titan") */
  name: string;
  /** Visual & hitbox scale relative to player (default: 3) */
  scale: number;
  /** Fixed horizontal center X of the boss */
  x: number;
  /** Floor Y surface the boss stands and lands on */
  floorY: number;
  /** Interior room rectangle that bouncing laser balls reflect off */
  arenaBounds: Rect;
  /** X coordinate the player must cross to slam the entry door shut and start the fight */
  triggerX: number;
  /** Entry blast door rect (starts open, slams shut once fight begins) */
  entryDoor: Rect;
  /** Exit blast door rect behind the boss (starts closed, opens when countdown hits 0) */
  exitDoor: Rect;
  /** Survival countdown duration in seconds (30 for Boss 1; later bosses increase by 10-15s) */
  survivalDuration: number;
  /** Boss upward jump impulse (negative px/s) */
  jumpVelocity: number;
  /** Gravity applied to boss (px/s^2) */
  gravity: number;
  /** Minimum delay between boss jumps (seconds) */
  jumpCooldownMin: number;
  /** Maximum delay between boss jumps (seconds) */
  jumpCooldownMax: number;
  /** Time between laser ball throws (seconds) */
  throwCooldown: number;
  /** Telegraph charge/wind-up duration before releasing a laser ball (seconds) */
  windupDuration: number;
  /** Straight-line laser ball speed (px/s) */
  ballSpeed: number;
  /** Laser ball radius (px) */
  ballRadius: number;
  /** Number of wall bounces before a laser ball dissipates (e.g., 5) */
  maxBounces: number;
  /** Maximum simultaneous laser balls allowed in the room */
  maxActiveBalls: number;
}

export interface LevelData {
  id: number;
  name: string;
  subtitle: string;
  width: number;
  height: number;
  killY: number;
  spawn: Vec2;
  portal: Rect;
  solids: Rect[];
  spikes: SpikeData[];
  lasers: LaserData[];
  hints?: LevelHint[];
  boss?: BossConfig;
}

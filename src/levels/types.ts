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
}

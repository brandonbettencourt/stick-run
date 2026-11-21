import type { LaserData, Rect, SpikeData } from '../levels/types.ts';
import { DEFAULT_LASER_THICKNESS } from './constants.ts';

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Slightly inset spike hitbox so grazing the outer 2–3px air corner of a triangle
 * feels fair to the player.
 */
export function getSpikeHitbox(spike: SpikeData): Rect {
  const insetX = Math.min(3, spike.width * 0.15);
  const insetY = Math.min(3, spike.height * 0.18);
  switch (spike.direction) {
    case 'up':
      return {
        x: spike.x + insetX,
        y: spike.y + insetY,
        width: Math.max(2, spike.width - insetX * 2),
        height: Math.max(2, spike.height - insetY),
      };
    case 'down':
      return {
        x: spike.x + insetX,
        y: spike.y,
        width: Math.max(2, spike.width - insetX * 2),
        height: Math.max(2, spike.height - insetY),
      };
    case 'left':
      return {
        x: spike.x + insetY,
        y: spike.y + insetX,
        width: Math.max(2, spike.width - insetY),
        height: Math.max(2, spike.height - insetX * 2),
      };
    case 'right':
      return {
        x: spike.x,
        y: spike.y + insetX,
        width: Math.max(2, spike.width - insetY),
        height: Math.max(2, spike.height - insetX * 2),
      };
  }
}

/**
 * Compute axis-aligned bounding box for a laser beam (supports horizontal & vertical beams).
 */
export function getLaserBeamRect(laser: LaserData): Rect {
  const thickness = laser.thickness ?? DEFAULT_LASER_THICKNESS;
  const half = thickness / 2;
  const minX = Math.min(laser.x1, laser.x2);
  const maxX = Math.max(laser.x1, laser.x2);
  const minY = Math.min(laser.y1, laser.y2);
  const maxY = Math.max(laser.y1, laser.y2);

  if (Math.abs(laser.x2 - laser.x1) >= Math.abs(laser.y2 - laser.y1)) {
    // Horizontal beam
    return {
      x: minX,
      y: minY - half,
      width: Math.max(thickness, maxX - minX),
      height: thickness,
    };
  }
  // Vertical beam
  return {
    x: minX - half,
    y: minY,
    width: thickness,
    height: Math.max(thickness, maxY - minY),
  };
}

/**
 * Check if a crouched/sliding player can safely stand up to `standingHeight`
 * without intersecting any solid ceiling above them.
 */
export function canStandUp(
  currentRect: Rect,
  standingHeight: number,
  solids: readonly Rect[]
): boolean {
  const bottom = currentRect.y + currentRect.height;
  const standingRect: Rect = {
    x: currentRect.x,
    y: bottom - standingHeight,
    width: currentRect.width,
    height: standingHeight,
  };
  for (const solid of solids) {
    if (rectsOverlap(standingRect, solid)) {
      return false;
    }
  }
  return true;
}

export interface MoveResult {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  hitCeiling: boolean;
  hitWallLeft: boolean;
  hitWallRight: boolean;
}

/**
 * Axis-separated AABB movement & solid resolution.
 */
export function moveAndResolveSolids(
  x: number,
  y: number,
  width: number,
  height: number,
  vx: number,
  vy: number,
  dt: number,
  solids: readonly Rect[]
): MoveResult {
  let nextX = x + vx * dt;
  let nextVx = vx;
  let hitWallLeft = false;
  let hitWallRight = false;

  // Horizontal resolution
  const horizRect: Rect = { x: nextX, y, width, height };
  for (const solid of solids) {
    if (rectsOverlap(horizRect, solid)) {
      if (nextVx > 0) {
        nextX = solid.x - width;
        nextVx = 0;
        hitWallRight = true;
      } else if (nextVx < 0) {
        nextX = solid.x + solid.width;
        nextVx = 0;
        hitWallLeft = true;
      }
      horizRect.x = nextX;
    }
  }

  let nextY = y + vy * dt;
  let nextVy = vy;
  let grounded = false;
  let hitCeiling = false;

  // Vertical resolution
  const vertRect: Rect = { x: nextX, y: nextY, width, height };
  for (const solid of solids) {
    if (rectsOverlap(vertRect, solid)) {
      if (nextVy > 0) {
        nextY = solid.y - height;
        nextVy = 0;
        grounded = true;
      } else if (nextVy < 0) {
        nextY = solid.y + solid.height;
        nextVy = 0;
        hitCeiling = true;
      }
      vertRect.y = nextY;
    }
  }

  // Also check if standing directly on a solid when vy === 0
  if (!grounded && nextVy >= 0) {
    const footProbe: Rect = {
      x: nextX + 1,
      y: nextY + height,
      width: Math.max(1, width - 2),
      height: 1.5,
    };
    for (const solid of solids) {
      if (rectsOverlap(footProbe, solid)) {
        grounded = true;
        break;
      }
    }
  }

  return {
    x: nextX,
    y: nextY,
    vx: nextVx,
    vy: nextVy,
    grounded,
    hitCeiling,
    hitWallLeft,
    hitWallRight,
  };
}

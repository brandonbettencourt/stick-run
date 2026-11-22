import type { LaserData, LevelData, Rect, SpikeData } from './types.ts';
import {
  getLaserBeamRect,
  getSpikeHitbox,
  rectsOverlap,
} from '../engine/collision.ts';
import {
  DEFAULT_LASER_WARNING_DURATION,
  PLAYER_DUCK_HEIGHT,
  PLAYER_STAND_HEIGHT,
  PLAYER_WIDTH,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  maxDoubleJumpHeight,
  maxDoubleJumpHorizontalReach,
} from '../engine/constants.ts';

export const VALIDATION_SAFETY_MARGIN = 0.88;
const VALID_SPIKE_DIRS = new Set(['up', 'down', 'left', 'right']);

export interface ValidationResult {
  levelId: number;
  levelName: string;
  errors: string[];
  warnings: string[];
  stats: {
    width: number;
    solids: number;
    spikes: number;
    lasers: number;
    maxRequiredGap: number;
    maxRequiredClimb: number;
    reachable: boolean;
  };
}

interface WalkableSegment {
  id: number;
  x1: number;
  x2: number;
  y: number;
  solidIndex: number;
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function buildWalkableSegments(level: LevelData): WalkableSegment[] {
  const segments: WalkableSegment[] = [];
  let nextId = 0;

  level.solids.forEach((solid, solidIndex) => {
    if (solid.width < PLAYER_WIDTH) return;

    const topSpikes = level.spikes.filter(
      (sp) =>
        sp.direction === 'up' &&
        Math.abs(sp.y + sp.height - solid.y) <= 2 &&
        sp.x < solid.x + solid.width &&
        sp.x + sp.width > solid.x
    );

    const totalSpikeCoverage = topSpikes.reduce((sum, sp) => {
      const overlapStart = Math.max(solid.x, sp.x);
      const overlapEnd = Math.min(solid.x + solid.width, sp.x + sp.width);
      return sum + Math.max(0, overlapEnd - overlapStart);
    }, 0);

    if (totalSpikeCoverage >= solid.width - PLAYER_WIDTH) {
      return;
    }

    segments.push({
      id: nextId++,
      x1: solid.x,
      x2: solid.x + solid.width,
      y: solid.y,
      solidIndex,
    });
  });

  return segments;
}

function canTransitionBetween(
  from: WalkableSegment,
  to: WalkableSegment,
  solids: readonly Rect[],
  maxJumpH: number
): { reachable: boolean; gap: number; climb: number } {
  let gap = 0;
  if (to.x1 > from.x2) {
    gap = to.x1 - from.x2;
  } else if (from.x1 > to.x2) {
    gap = from.x1 - to.x2;
  }

  const climb = from.y - to.y;

  if (climb > maxJumpH * VALIDATION_SAFETY_MARGIN) {
    return { reachable: false, gap, climb };
  }

  const maxHoriz = maxDoubleJumpHorizontalReach(climb) * VALIDATION_SAFETY_MARGIN;
  if (gap > maxHoriz) {
    return { reachable: false, gap, climb };
  }

  const hasClearance = !solids.some(
    (s, idx) =>
      idx !== to.solidIndex &&
      s.x <= to.x1 &&
      s.x + s.width >= to.x2 &&
      s.y + s.height > to.y - PLAYER_DUCK_HEIGHT &&
      s.y < to.y
  );

  return { reachable: hasClearance, gap, climb };
}

function validateLaser(laser: LaserData, idx: number, errors: string[]): void {
  if (
    !isFiniteNumber(laser.x1) ||
    !isFiniteNumber(laser.y1) ||
    !isFiniteNumber(laser.x2) ||
    !isFiniteNumber(laser.y2)
  ) {
    errors.push(`Laser[${idx}] has non-finite coordinates.`);
    return;
  }

  if (laser.x1 === laser.x2 && laser.y1 === laser.y2) {
    errors.push(`Laser[${idx}] has zero length.`);
  }

  if (laser.thickness !== undefined && !isFinitePositive(laser.thickness)) {
    errors.push(`Laser[${idx}] thickness must be a positive number.`);
  }

  if (typeof laser.timed !== 'boolean') {
    errors.push(`Laser[${idx}] missing boolean 'timed' field.`);
    return;
  }

  if (laser.timed) {
    if (!isFinitePositive(laser.cyclePeriod)) {
      errors.push(`Timed Laser[${idx}] requires positive cyclePeriod.`);
    }
    if (!isFinitePositive(laser.activeDuration)) {
      errors.push(`Timed Laser[${idx}] requires positive activeDuration.`);
    }
    if (
      isFinitePositive(laser.cyclePeriod) &&
      isFinitePositive(laser.activeDuration)
    ) {
      if (laser.activeDuration >= laser.cyclePeriod) {
        errors.push(
          `Timed Laser[${idx}] activeDuration (${laser.activeDuration}s) must be less than cyclePeriod (${laser.cyclePeriod}s).`
        );
      }
      const warn = laser.warningDuration ?? DEFAULT_LASER_WARNING_DURATION;
      const offWindow = laser.cyclePeriod - laser.activeDuration;
      if (offWindow < 0.5) {
        errors.push(
          `Timed Laser[${idx}] safe off-window (${offWindow.toFixed(2)}s) is too short (< 0.5s).`
        );
      }
      if (warn < 0 || warn > offWindow) {
        errors.push(
          `Timed Laser[${idx}] warningDuration (${warn}s) exceeds off-window (${offWindow.toFixed(2)}s).`
        );
      }
    }
  }
}

function validateSpike(
  spike: SpikeData,
  idx: number,
  level: LevelData,
  errors: string[]
): void {
  if (
    !isFiniteNumber(spike.x) ||
    !isFiniteNumber(spike.y) ||
    !isFinitePositive(spike.width) ||
    !isFinitePositive(spike.height)
  ) {
    errors.push(`Spike[${idx}] has invalid dimensions.`);
    return;
  }
  if (!VALID_SPIKE_DIRS.has(spike.direction)) {
    errors.push(`Spike[${idx}] has invalid direction '${String(spike.direction)}'.`);
  }

  for (let sIdx = 0; sIdx < level.solids.length; sIdx++) {
    const solid = level.solids[sIdx];
    const insetSpike: Rect = {
      x: spike.x + 1,
      y: spike.y + 1,
      width: Math.max(1, spike.width - 2),
      height: Math.max(1, spike.height - 2),
    };
    if (rectsOverlap(insetSpike, solid)) {
      errors.push(
        `Spike[${idx}] overlaps interior of Solid[${sIdx}] (${solid.x},${solid.y}).`
      );
    }
  }
}

export function validateLevel(
  level: LevelData,
  expectedId?: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (expectedId !== undefined && level.id !== expectedId) {
    errors.push(`Expected id=${expectedId}, got ${String(level.id)}.`);
  }
  if (typeof level.name !== 'string' || level.name.trim().length === 0) {
    errors.push('Missing level name.');
  }
  if (!isFinitePositive(level.width) || level.width < VIEWPORT_WIDTH) {
    errors.push(`Level width (${level.width}) must be >= ${VIEWPORT_WIDTH}.`);
  }
  if (!isFinitePositive(level.height) || level.height < VIEWPORT_HEIGHT) {
    errors.push(`Level height (${level.height}) must be >= ${VIEWPORT_HEIGHT}.`);
  }
  if (!isFinitePositive(level.killY) || level.killY <= level.height) {
    errors.push(`killY (${level.killY}) must be greater than level height (${level.height}).`);
  }

  if (!Array.isArray(level.solids) || level.solids.length === 0) {
    errors.push('Level must contain at least one solid platform.');
  }
  level.solids.forEach((solid, idx) => {
    if (
      !isFiniteNumber(solid.x) ||
      !isFiniteNumber(solid.y) ||
      !isFinitePositive(solid.width) ||
      !isFinitePositive(solid.height)
    ) {
      errors.push(`Solid[${idx}] has invalid coordinates or dimensions.`);
    }
  });

  // Check overhang clearance over lower platforms
  for (let i = 0; i < level.solids.length; i++) {
    const upper = level.solids[i];
    const upperBottom = upper.y + upper.height;
    for (let j = 0; j < level.solids.length; j++) {
      if (i === j) continue;
      const lower = level.solids[j];
      const horizOverlap =
        Math.min(upper.x + upper.width, lower.x + lower.width) -
        Math.max(upper.x, lower.x);
      if (horizOverlap < PLAYER_WIDTH) continue;

      const clearance = lower.y - upperBottom;
      if (clearance > 0 && clearance < PLAYER_DUCK_HEIGHT + 6) {
        errors.push(
          `Solid[${i}] overhang above Solid[${j}] has impossible clearance (${clearance}px; minimum is ${PLAYER_DUCK_HEIGHT + 6}px).`
        );
      }
    }
  }

  level.spikes.forEach((sp, idx) => validateSpike(sp, idx, level, errors));
  level.lasers.forEach((lz, idx) => validateLaser(lz, idx, errors));

  // Spawn point safety
  const spawnRect: Rect = {
    x: level.spawn.x,
    y: level.spawn.y,
    width: PLAYER_WIDTH,
    height: PLAYER_STAND_HEIGHT,
  };
  if (
    spawnRect.x < 0 ||
    spawnRect.x + spawnRect.width > level.width ||
    spawnRect.y < 0 ||
    spawnRect.y + spawnRect.height > level.killY
  ) {
    errors.push('Spawn point is outside level bounds.');
  }
  level.solids.forEach((solid, idx) => {
    if (rectsOverlap(spawnRect, solid)) {
      errors.push(`Spawn point overlaps Solid[${idx}].`);
    }
  });
  level.spikes.forEach((spike, idx) => {
    if (rectsOverlap(spawnRect, getSpikeHitbox(spike))) {
      errors.push(`Spawn point overlaps Spike[${idx}].`);
    }
  });
  level.lasers.forEach((laser, idx) => {
    if (rectsOverlap(spawnRect, getLaserBeamRect(laser))) {
      errors.push(`Spawn point overlaps Laser[${idx}].`);
    }
  });

  const spawnFootProbe: Rect = {
    x: spawnRect.x,
    y: spawnRect.y + spawnRect.height,
    width: spawnRect.width,
    height: 4,
  };
  const spawnGround = level.solids.find((s) => rectsOverlap(spawnFootProbe, s));
  if (!spawnGround) {
    errors.push('Spawn point has no solid ground directly beneath it.');
  }

  // Portal validation
  const portal = level.portal;
  if (
    !isFiniteNumber(portal.x) ||
    !isFiniteNumber(portal.y) ||
    !isFinitePositive(portal.width) ||
    !isFinitePositive(portal.height)
  ) {
    errors.push('Portal has invalid dimensions.');
  } else {
    if (portal.x < 0 || portal.x + portal.width > level.width) {
      errors.push('Portal is outside horizontal level bounds.');
    }
    level.solids.forEach((solid, idx) => {
      if (rectsOverlap(portal, solid)) {
        errors.push(`Portal overlaps Solid[${idx}].`);
      }
    });
    level.spikes.forEach((spike, idx) => {
      if (rectsOverlap(portal, getSpikeHitbox(spike))) {
        errors.push(`Portal overlaps Spike[${idx}].`);
      }
    });
    level.lasers.forEach((laser, idx) => {
      if (!laser.timed && rectsOverlap(portal, getLaserBeamRect(laser))) {
        errors.push(`Portal overlaps static Laser[${idx}].`);
      }
    });
  }

  // Optional Boss encounter validation
  if (level.boss) {
    const b = level.boss;
    if (!b.name || typeof b.name !== 'string') {
      errors.push('Boss is missing a valid name.');
    }
    if (!isFinitePositive(b.scale) || b.scale < 1) {
      errors.push('Boss scale must be >= 1.');
    }
    if (!isFinitePositive(b.survivalDuration)) {
      errors.push('Boss survivalDuration must be positive.');
    }
    if (!isFiniteNumber(b.jumpVelocity) || b.jumpVelocity >= 0) {
      errors.push('Boss jumpVelocity must be a negative finite number.');
    }
    if (!isFinitePositive(b.gravity)) {
      errors.push('Boss gravity must be positive.');
    } else if (isFiniteNumber(b.jumpVelocity) && b.jumpVelocity < 0) {
      const bossMaxJump = (b.jumpVelocity * b.jumpVelocity) / (2 * b.gravity);
      if (bossMaxJump < PLAYER_STAND_HEIGHT + 12) {
        errors.push(
          `Boss jump height (${bossMaxJump.toFixed(1)}px) is too low for player (${PLAYER_STAND_HEIGHT}px) to run underneath.`
        );
      }
    }
    if (!isFinitePositive(b.ballSpeed) || !isFinitePositive(b.ballRadius)) {
      errors.push('Boss laser ball speed and radius must be positive.');
    }
    if (!isFiniteNumber(b.maxBounces) || b.maxBounces < 0) {
      errors.push('Boss maxBounces must be >= 0.');
    }
    if (
      !isFinitePositive(b.arenaBounds.width) ||
      !isFinitePositive(b.arenaBounds.height)
    ) {
      errors.push('Boss arenaBounds must have positive width and height.');
    }
    if (
      b.x < b.arenaBounds.x ||
      b.x > b.arenaBounds.x + b.arenaBounds.width
    ) {
      errors.push('Boss x position must lie inside arenaBounds.');
    }
    if (
      !isFinitePositive(b.entryDoor.width) ||
      !isFinitePositive(b.entryDoor.height) ||
      !isFinitePositive(b.exitDoor.width) ||
      !isFinitePositive(b.exitDoor.height)
    ) {
      errors.push('Boss entryDoor and exitDoor must have positive dimensions.');
    }
  }

  // Physics-based reachability graph
  const segments = buildWalkableSegments(level);
  const maxJumpH = maxDoubleJumpHeight();

  const spawnSeg = segments.find(
    (seg) =>
      spawnRect.x + spawnRect.width > seg.x1 &&
      spawnRect.x < seg.x2 &&
      Math.abs(seg.y - (spawnRect.y + spawnRect.height)) <= 4
  );
  const portalSeg = segments.find(
    (seg) =>
      portal.x + portal.width > seg.x1 &&
      portal.x < seg.x2 &&
      seg.y >= portal.y &&
      seg.y <= portal.y + portal.height + 24
  );

  let reachable = false;
  let maxRequiredGap = 0;
  let maxRequiredClimb = 0;

  if (!spawnSeg) {
    errors.push('Could not locate walkable spawn platform segment.');
  }
  if (!portalSeg) {
    errors.push('Could not locate walkable platform beneath portal.');
  }

  if (spawnSeg && portalSeg) {
    const visited = new Set<number>([spawnSeg.id]);
    const parent = new Map<
      number,
      { prev: number; gap: number; climb: number }
    >();
    const queue: WalkableSegment[] = [spawnSeg];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.id === portalSeg.id) {
        reachable = true;
        break;
      }

      for (const candidate of segments) {
        if (visited.has(candidate.id)) continue;
        const transition = canTransitionBetween(
          current,
          candidate,
          level.solids,
          maxJumpH
        );
        if (transition.reachable) {
          visited.add(candidate.id);
          parent.set(candidate.id, {
            prev: current.id,
            gap: transition.gap,
            climb: transition.climb,
          });
          queue.push(candidate);
        }
      }
    }

    if (!reachable) {
      errors.push(
        `Portal is NOT reachable from spawn with player double-jump physics (max climb ${(maxJumpH * VALIDATION_SAFETY_MARGIN).toFixed(0)}px, max flat gap ${(maxDoubleJumpHorizontalReach(0) * VALIDATION_SAFETY_MARGIN).toFixed(0)}px).`
      );
    } else {
      let cur = portalSeg.id;
      while (parent.has(cur)) {
        const edge = parent.get(cur)!;
        maxRequiredGap = Math.max(maxRequiredGap, edge.gap);
        maxRequiredClimb = Math.max(maxRequiredClimb, Math.max(0, edge.climb));
        cur = edge.prev;
      }
    }
  }

  return {
    levelId: level.id,
    levelName: level.name,
    errors,
    warnings,
    stats: {
      width: level.width,
      solids: level.solids.length,
      spikes: level.spikes.length,
      lasers: level.lasers.length,
      maxRequiredGap: Math.round(maxRequiredGap),
      maxRequiredClimb: Math.round(maxRequiredClimb),
      reachable,
    },
  };
}

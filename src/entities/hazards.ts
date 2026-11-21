import type { LaserData, Rect, SpikeData } from '../levels/types.ts';
import {
  getLaserBeamRect,
  getSpikeHitbox,
  rectsOverlap,
} from '../engine/collision.ts';
import {
  COLORS,
  DEFAULT_LASER_THICKNESS,
  DEFAULT_LASER_WARNING_DURATION,
} from '../engine/constants.ts';

export type LaserPhase = 'off' | 'warning' | 'active';

/**
 * Evaluate whether a laser is currently off, telegraphing (warning), or active (lethal)
 * at a given level elapsed time (seconds).
 */
export function getLaserPhase(laser: LaserData, levelTime: number): LaserPhase {
  if (!laser.timed) {
    return 'active';
  }

  const period = laser.cyclePeriod ?? 3.0;
  const activeDuration = laser.activeDuration ?? 1.2;
  const warningDuration = Math.min(
    laser.warningDuration ?? DEFAULT_LASER_WARNING_DURATION,
    Math.max(0, period - activeDuration)
  );
  const phaseOffset = laser.phaseOffset ?? 0;

  // Positive modulo so negative offsets work cleanly too
  const cyclePos = (((levelTime + phaseOffset) % period) + period) % period;

  if (cyclePos < activeDuration) {
    return 'active';
  }
  if (cyclePos >= period - warningDuration) {
    return 'warning';
  }
  return 'off';
}

export function checkHazardCollision(
  playerRect: Rect,
  spikes: readonly SpikeData[],
  lasers: readonly LaserData[],
  levelTime: number
): boolean {
  for (const spike of spikes) {
    if (rectsOverlap(playerRect, getSpikeHitbox(spike))) {
      return true;
    }
  }

  for (const laser of lasers) {
    if (getLaserPhase(laser, levelTime) !== 'active') continue;
    if (rectsOverlap(playerRect, getLaserBeamRect(laser))) {
      return true;
    }
  }

  return false;
}

export function renderSpikes(
  ctx: CanvasRenderingContext2D,
  spikes: readonly SpikeData[],
  time: number
): void {
  if (spikes.length === 0) return;

  const pulse = 0.85 + 0.15 * Math.sin(time * 6);

  ctx.save();
  for (const spike of spikes) {
    const toothSize = 16;
    ctx.shadowColor = COLORS.hazardGlow;
    ctx.shadowBlur = 12 * pulse;
    ctx.fillStyle = COLORS.hazardFill;
    ctx.strokeStyle = COLORS.hazardCore;
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    if (spike.direction === 'up' || spike.direction === 'down') {
      const count = Math.max(1, Math.round(spike.width / toothSize));
      const step = spike.width / count;
      for (let i = 0; i < count; i++) {
        const x0 = spike.x + i * step;
        const xMid = x0 + step * 0.5;
        const x1 = x0 + step;
        if (spike.direction === 'up') {
          ctx.moveTo(x0, spike.y + spike.height);
          ctx.lineTo(xMid, spike.y);
          ctx.lineTo(x1, spike.y + spike.height);
        } else {
          ctx.moveTo(x0, spike.y);
          ctx.lineTo(xMid, spike.y + spike.height);
          ctx.lineTo(x1, spike.y);
        }
      }
    } else {
      const count = Math.max(1, Math.round(spike.height / toothSize));
      const step = spike.height / count;
      for (let i = 0; i < count; i++) {
        const y0 = spike.y + i * step;
        const yMid = y0 + step * 0.5;
        const y1 = y0 + step;
        if (spike.direction === 'left') {
          ctx.moveTo(spike.x + spike.width, y0);
          ctx.lineTo(spike.x, yMid);
          ctx.lineTo(spike.x + spike.width, y1);
        } else {
          ctx.moveTo(spike.x, y0);
          ctx.lineTo(spike.x + spike.width, yMid);
          ctx.lineTo(spike.x, y1);
        }
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function renderLasers(
  ctx: CanvasRenderingContext2D,
  lasers: readonly LaserData[],
  levelTime: number
): void {
  if (lasers.length === 0) return;

  ctx.save();
  for (const laser of lasers) {
    const phase = getLaserPhase(laser, levelTime);
    const thickness = laser.thickness ?? DEFAULT_LASER_THICKNESS;

    // Draw beam depending on phase
    if (phase === 'active') {
      const flicker = 0.92 + 0.08 * Math.sin(levelTime * 55);

      // Outer magenta/red glow
      ctx.save();
      ctx.strokeStyle = COLORS.hazardGlow;
      ctx.shadowColor = COLORS.hazardGlow;
      ctx.shadowBlur = 20;
      ctx.lineWidth = thickness * 1.45 * flicker;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(laser.x2, laser.y2);
      ctx.stroke();

      // Bright inner core
      ctx.strokeStyle = COLORS.hazardCore;
      ctx.shadowBlur = 8;
      ctx.lineWidth = Math.max(2.5, thickness * 0.45);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(laser.x2, laser.y2);
      ctx.stroke();
      ctx.restore();
    } else if (phase === 'warning') {
      // Rapid telegraph flicker before activation
      const blink = Math.sin(levelTime * 42) > -0.2;
      if (blink) {
        ctx.save();
        ctx.strokeStyle = COLORS.laserWarning;
        ctx.shadowColor = COLORS.hazardGlow;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -levelTime * 90;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(laser.x1, laser.y1);
        ctx.lineTo(laser.x2, laser.y2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw emitter nodes at both endpoints
    drawEmitter(ctx, laser.x1, laser.y1, phase, levelTime);
    drawEmitter(ctx, laser.x2, laser.y2, phase, levelTime);
  }
  ctx.restore();
}

function drawEmitter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  phase: LaserPhase,
  time: number
): void {
  ctx.save();
  ctx.fillStyle = COLORS.emitterFill;
  ctx.strokeStyle =
    phase === 'off' ? 'rgba(244, 63, 94, 0.45)' : COLORS.emitterBorder;
  ctx.lineWidth = 2;
  ctx.shadowColor = phase === 'off' ? 'transparent' : COLORS.hazardGlow;
  ctx.shadowBlur = phase === 'active' ? 12 : phase === 'warning' ? 8 : 0;

  ctx.beginPath();
  ctx.arc(x, y, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Inner charge indicator dot
  const dotRadius =
    phase === 'active'
      ? 3.2
      : phase === 'warning'
        ? 2.2 + Math.abs(Math.sin(time * 24)) * 1.4
        : 1.6;
  ctx.fillStyle =
    phase === 'active'
      ? COLORS.hazardCore
      : phase === 'warning'
        ? COLORS.laserWarning
        : 'rgba(244, 63, 94, 0.35)';
  ctx.beginPath();
  ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

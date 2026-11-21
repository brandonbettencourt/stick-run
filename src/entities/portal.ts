import type { Rect } from '../levels/types.ts';
import { rectsOverlap } from '../engine/collision.ts';
import { COLORS } from '../engine/constants.ts';

export function checkPortalCollision(playerRect: Rect, portal: Rect): boolean {
  return rectsOverlap(playerRect, portal);
}

/**
 * Render a swirling neon green & gold exit portal.
 */
export function renderPortal(
  ctx: CanvasRenderingContext2D,
  portal: Rect,
  time: number
): void {
  const cx = portal.x + portal.width * 0.5;
  const cy = portal.y + portal.height * 0.5;
  const rx = portal.width * 0.52;
  const ry = portal.height * 0.48;
  const pulse = 1 + 0.05 * Math.sin(time * 4.5);

  ctx.save();
  ctx.translate(cx, cy);

  // Soft ambient aura
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, ry * 1.45);
  grad.addColorStop(0, 'rgba(250, 204, 21, 0.45)');
  grad.addColorStop(0.5, 'rgba(16, 185, 129, 0.25)');
  grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 1.7 * pulse, ry * 1.35 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outer swirling neon green ring
  ctx.shadowColor = COLORS.portalGlow;
  ctx.shadowBlur = 22;
  ctx.strokeStyle = COLORS.portalOuter;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * pulse, ry * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Rotating dashed energy arcs
  ctx.save();
  ctx.strokeStyle = COLORS.portalInner;
  ctx.shadowColor = COLORS.portalInner;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 2.6;
  ctx.setLineDash([14, 10]);
  ctx.lineDashOffset = -time * 55;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.78, ry * 0.82, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = COLORS.portalGlow;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 12]);
  ctx.lineDashOffset = time * 42;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.54, ry * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Bright gold/white core
  ctx.shadowColor = COLORS.portalInner;
  ctx.shadowBlur = 16;
  ctx.fillStyle = COLORS.portalCore;
  ctx.globalAlpha = 0.8 + 0.2 * Math.sin(time * 7);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.28, ry * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  // Orbiting glowing motes
  ctx.globalAlpha = 1;
  for (let i = 0; i < 6; i++) {
    const angle = time * 2.4 + (i * Math.PI * 2) / 6;
    const mx = Math.cos(angle) * rx * 1.05;
    const my = Math.sin(angle) * ry * 0.92;
    ctx.fillStyle = i % 2 === 0 ? COLORS.portalInner : COLORS.portalGlow;
    ctx.beginPath();
    ctx.arc(mx, my, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

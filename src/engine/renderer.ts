import type { LevelData, Rect } from '../levels/types.ts';
import { COLORS, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './constants.ts';
import type { Camera } from './camera.ts';
import type { ParticleSystem } from './particles.ts';
import type { Player } from '../entities/player.ts';
import { renderLasers, renderSpikes } from '../entities/hazards.ts';
import { renderPortal } from '../entities/portal.ts';

export class SceneRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    level: LevelData,
    player: Player,
    camera: Camera,
    particles: ParticleSystem,
    levelTime: number
  ): void {
    // 1. Deep dark background + subtle vertical ambient gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, VIEWPORT_HEIGHT);
    bgGrad.addColorStop(0, COLORS.bgDeep);
    bgGrad.addColorStop(0.6, COLORS.bg);
    bgGrad.addColorStop(1, '#101528');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    // 2. Parallax neon grid layers
    this.renderParallaxGrid(ctx, camera.renderX, camera.renderY);

    // 3. World-space rendering
    ctx.save();
    ctx.translate(-camera.renderX, -camera.renderY);

    this.renderHints(ctx, level, levelTime);
    this.renderSolids(ctx, level.solids, camera.renderX);
    renderSpikes(ctx, level.spikes, levelTime);
    renderLasers(ctx, level.lasers, levelTime);
    renderPortal(ctx, level.portal, levelTime);
    player.render(ctx);
    particles.render(ctx);

    ctx.restore();

    // 4. Subtle dark vignette at bottom pit edge
    const pitGlow = ctx.createLinearGradient(0, VIEWPORT_HEIGHT - 46, 0, VIEWPORT_HEIGHT);
    pitGlow.addColorStop(0, 'rgba(244, 63, 94, 0)');
    pitGlow.addColorStop(1, 'rgba(244, 63, 94, 0.12)');
    ctx.fillStyle = pitGlow;
    ctx.fillRect(0, VIEWPORT_HEIGHT - 46, VIEWPORT_WIDTH, 46);
  }

  private renderParallaxGrid(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number
  ): void {
    ctx.save();

    // Distant slow minor grid (0.2x parallax)
    const minorStep = 40;
    const minorOffsetX = -((camX * 0.2) % minorStep);
    const minorOffsetY = -((camY * 0.2) % minorStep);

    ctx.strokeStyle = COLORS.gridMinor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = minorOffsetX; x < VIEWPORT_WIDTH; x += minorStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VIEWPORT_HEIGHT);
    }
    for (let y = minorOffsetY; y < VIEWPORT_HEIGHT; y += minorStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(VIEWPORT_WIDTH, y);
    }
    ctx.stroke();

    // Midground major grid (0.45x parallax)
    const majorStep = 160;
    const majorOffsetX = -((camX * 0.45) % majorStep);
    const majorOffsetY = -((camY * 0.45) % majorStep);

    ctx.strokeStyle = COLORS.gridMajor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = majorOffsetX; x < VIEWPORT_WIDTH; x += majorStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VIEWPORT_HEIGHT);
    }
    for (let y = majorOffsetY; y < VIEWPORT_HEIGHT; y += majorStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(VIEWPORT_WIDTH, y);
    }
    ctx.stroke();

    // Subtle distant neon skyline silhouettes (0.15x parallax)
    const pillarStep = 240;
    const startPillar = Math.floor((camX * 0.15) / pillarStep) - 1;
    ctx.fillStyle = 'rgba(20, 29, 52, 0.55)';
    for (let i = startPillar; i < startPillar + 7; i++) {
      const px = i * pillarStep - camX * 0.15;
      const hash = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      const pw = 60 + hash * 70;
      const ph = 110 + ((hash * 7) % 1) * 160;
      ctx.fillRect(px, VIEWPORT_HEIGHT - ph, pw, ph);
    }

    ctx.restore();
  }

  private renderHints(
    ctx: CanvasRenderingContext2D,
    level: LevelData,
    time: number
  ): void {
    if (!level.hints || level.hints.length === 0) return;

    ctx.save();
    ctx.font = '600 13px "JetBrains Mono", "Fira Code", ui-monospace, monospace';
    ctx.letterSpacing = '1.2px';
    ctx.fillStyle = COLORS.hintText;
    ctx.shadowColor = COLORS.hintGlow;
    ctx.shadowBlur = 8;

    const bob = Math.sin(time * 2.2) * 2.5;
    for (const hint of level.hints) {
      ctx.fillText(hint.text, hint.x, hint.y + bob);
    }
    ctx.restore();
  }

  private renderSolids(
    ctx: CanvasRenderingContext2D,
    solids: readonly Rect[],
    camX: number
  ): void {
    ctx.save();

    for (const s of solids) {
      // Frustum cull offscreen blocks
      if (s.x + s.width < camX - 40 || s.x > camX + VIEWPORT_WIDTH + 40) {
        continue;
      }

      // Base slate-navy fill
      const fillGrad = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.height);
      fillGrad.addColorStop(0, COLORS.solidFillTop);
      fillGrad.addColorStop(1, COLORS.solidFill);
      ctx.fillStyle = fillGrad;
      ctx.fillRect(s.x, s.y, s.width, s.height);

      // Subtle internal tech grid inside large blocks
      ctx.save();
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.width, s.height);
      ctx.clip();
      ctx.strokeStyle = COLORS.solidGridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = s.x + 28; gx < s.x + s.width; gx += 28) {
        ctx.moveTo(gx, s.y);
        ctx.lineTo(gx, s.y + s.height);
      }
      for (let gy = s.y + 28; gy < s.y + s.height; gy += 28) {
        ctx.moveTo(s.x, gy);
        ctx.lineTo(s.x + s.width, gy);
      }
      ctx.stroke();
      ctx.restore();

      // Crisp neon blue border
      ctx.strokeStyle = COLORS.solidStroke;
      ctx.shadowColor = COLORS.solidGlow;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x + 1, s.y + 1, Math.max(0, s.width - 2), Math.max(0, s.height - 2));

      // Bright top surface highlight line
      ctx.strokeStyle = '#7dd3fc';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(s.x + 1, s.y + 1.5);
      ctx.lineTo(s.x + s.width - 1, s.y + 1.5);
      ctx.stroke();
    }

    ctx.restore();
  }
}

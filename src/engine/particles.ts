import { COLORS } from './constants.ts';

interface SparkParticle {
  kind: 'spark';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  gravity: number;
}

interface ShardParticle {
  kind: 'shard';
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  angle: number;
  vAngle: number;
  color: string;
  life: number;
  maxLife: number;
}

interface RingParticle {
  kind: 'ring';
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  maxRadiusX: number;
  maxRadiusY: number;
  color: string;
  life: number;
  maxLife: number;
}

type Particle = SparkParticle | ShardParticle | RingParticle;

export class ParticleSystem {
  private particles: Particle[] = [];

  clear(): void {
    this.particles = [];
  }

  spawnDoubleJumpBurst(x: number, y: number): void {
    // Expanding neon ring under feet
    this.particles.push({
      kind: 'ring',
      x,
      y,
      radiusX: 6,
      radiusY: 2,
      maxRadiusX: 34,
      maxRadiusY: 11,
      color: COLORS.playerGlow,
      life: 0.28,
      maxLife: 0.28,
    });

    // Crisp outward sparks
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 + (Math.random() - 0.5) * 0.3;
      const speed = 70 + Math.random() * 110;
      this.particles.push({
        kind: 'spark',
        x: x + (Math.random() - 0.5) * 8,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.45 + 35,
        size: 2 + Math.random() * 2,
        color: i % 2 === 0 ? COLORS.playerGlow : COLORS.playerCore,
        alpha: 1,
        life: 0.22 + Math.random() * 0.14,
        maxLife: 0.36,
        gravity: 220,
      });
    }
  }

  spawnSlideSpark(x: number, y: number, facing: 1 | -1): void {
    this.particles.push({
      kind: 'spark',
      x,
      y: y - 2,
      vx: -facing * (45 + Math.random() * 80),
      vy: -(20 + Math.random() * 55),
      size: 1.8 + Math.random() * 1.8,
      color: Math.random() > 0.35 ? COLORS.playerGlow : COLORS.playerCore,
      alpha: 0.9,
      life: 0.16 + Math.random() * 0.12,
      maxLife: 0.28,
      gravity: 340,
    });
  }

  spawnDeathShatter(x: number, y: number): void {
    // Glowing shockwave ring
    this.particles.push({
      kind: 'ring',
      x,
      y,
      radiusX: 8,
      radiusY: 8,
      maxRadiusX: 56,
      maxRadiusY: 56,
      color: COLORS.hazardGlow,
      life: 0.36,
      maxLife: 0.36,
    });

    // Stick-limb neon shards spinning outward
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.4;
      const speed = 110 + Math.random() * 210;
      this.particles.push({
        kind: 'shard',
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 24,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        length: 8 + Math.random() * 10,
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 18,
        color: i % 3 === 0 ? COLORS.hazardGlow : COLORS.playerGlow,
        life: 0.38,
        maxLife: 0.38,
      });
    }

    // Fine shatter sparks
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 250;
      this.particles.push({
        kind: 'spark',
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 24,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        size: 2 + Math.random() * 2.5,
        color: i % 2 === 0 ? COLORS.playerCore : COLORS.playerGlow,
        alpha: 1,
        life: 0.3 + Math.random() * 0.14,
        maxLife: 0.44,
        gravity: 520,
      });
    }
  }

  spawnPortalBurst(x: number, y: number): void {
    this.particles.push({
      kind: 'ring',
      x,
      y,
      radiusX: 12,
      radiusY: 18,
      maxRadiusX: 74,
      maxRadiusY: 94,
      color: COLORS.portalGlow,
      life: 0.5,
      maxLife: 0.5,
    });

    for (let i = 0; i < 26; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      this.particles.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2.2 + Math.random() * 2.4,
        color: i % 2 === 0 ? COLORS.portalInner : COLORS.portalGlow,
        alpha: 1,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.7,
        gravity: 40,
      });
    }
  }

  spawnBossStomp(x: number, y: number): void {
    this.particles.push({
      kind: 'ring',
      x,
      y: y - 2,
      radiusX: 16,
      radiusY: 4,
      maxRadiusX: 92,
      maxRadiusY: 18,
      color: COLORS.bossGlow,
      life: 0.34,
      maxLife: 0.34,
    });

    for (let i = 0; i < 16; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      this.particles.push({
        kind: 'spark',
        x: x + (Math.random() - 0.5) * 36,
        y: y - 2,
        vx: side * (90 + Math.random() * 190),
        vy: -(45 + Math.random() * 120),
        size: 2.2 + Math.random() * 2.4,
        color: i % 3 === 0 ? COLORS.bossCore : COLORS.bossGlow,
        alpha: 1,
        life: 0.24 + Math.random() * 0.18,
        maxLife: 0.42,
        gravity: 460,
      });
    }
  }

  spawnLaserBallBounce(x: number, y: number, nx: number, ny: number): void {
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * 1.4;
      const baseAngle = Math.atan2(ny, nx) + spread;
      const speed = 75 + Math.random() * 140;
      this.particles.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(baseAngle) * speed,
        vy: Math.sin(baseAngle) * speed,
        size: 1.8 + Math.random() * 1.8,
        color: i % 2 === 0 ? COLORS.bossBallCore : COLORS.bossBallGlow,
        alpha: 1,
        life: 0.16 + Math.random() * 0.1,
        maxLife: 0.26,
        gravity: 160,
      });
    }
  }

  spawnLaserBallDissipate(x: number, y: number): void {
    this.particles.push({
      kind: 'ring',
      x,
      y,
      radiusX: 6,
      radiusY: 6,
      maxRadiusX: 38,
      maxRadiusY: 38,
      color: COLORS.bossBallGlow,
      life: 0.28,
      maxLife: 0.28,
    });

    for (let i = 0; i < 14; i++) {
      const angle = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.3;
      const speed = 60 + Math.random() * 150;
      this.particles.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 2,
        color: i % 3 === 0 ? COLORS.bossBallCore : COLORS.bossBallInner,
        alpha: 1,
        life: 0.22 + Math.random() * 0.14,
        maxLife: 0.36,
        gravity: 90,
      });
    }
  }

  spawnDoorBurst(x: number, y: number, color: string): void {
    this.particles.push({
      kind: 'ring',
      x,
      y,
      radiusX: 8,
      radiusY: 16,
      maxRadiusX: 46,
      maxRadiusY: 68,
      color,
      life: 0.34,
      maxLife: 0.34,
    });

    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 65 + Math.random() * 170;
      this.particles.push({
        kind: 'spark',
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 60,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 2.2,
        color: i % 3 === 0 ? '#ffffff' : color,
        alpha: 1,
        life: 0.26 + Math.random() * 0.16,
        maxLife: 0.42,
        gravity: 220,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      if (p.kind === 'spark') {
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha = Math.max(0, p.life / p.maxLife);
      } else if (p.kind === 'shard') {
        p.vy += 620 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.vAngle * dt;
      } else {
        const progress = 1 - p.life / p.maxLife;
        const eased = 1 - Math.pow(1 - progress, 2);
        p.radiusX = 6 + (p.maxRadiusX - 6) * eased;
        p.radiusY = 2 + (p.maxRadiusY - 2) * eased;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;
    ctx.save();

    for (const p of this.particles) {
      const ratio = Math.max(0, p.life / p.maxLife);
      if (p.kind === 'spark') {
        ctx.globalAlpha = p.alpha;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * ratio), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'shard') {
        ctx.globalAlpha = ratio;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        const dx = Math.cos(p.angle) * (p.length * 0.5);
        const dy = Math.sin(p.angle) * (p.length * 0.5);
        ctx.beginPath();
        ctx.moveTo(p.x - dx, p.y - dy);
        ctx.lineTo(p.x + dx, p.y + dy);
        ctx.stroke();
      } else {
        ctx.globalAlpha = ratio * 0.9;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5 * ratio + 0.8;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.radiusX, p.radiusY, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

import type { BossConfig, Rect, Vec2 } from '../levels/types.ts';
import type { IAudioManager } from '../engine/audio.ts';
import type { Camera } from '../engine/camera.ts';
import { circleIntersectsRect, rectsOverlap } from '../engine/collision.ts';
import { COLORS, PLAYER_STAND_HEIGHT } from '../engine/constants.ts';
import type { ParticleSystem } from '../engine/particles.ts';

export type BossPhase = 'waiting' | 'fighting' | 'escape';

export interface LaserBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  bounces: number;
  maxBounces: number;
  age: number;
  trail: Vec2[];
}

export interface BossSnapshot {
  readonly name: string;
  readonly phase: BossPhase;
  readonly timeRemaining: number;
  readonly survivalDuration: number;
  readonly entryDoorClosed: boolean;
  readonly exitDoorOpen: boolean;
  readonly x: number;
  readonly footY: number;
  readonly vy: number;
  readonly width: number;
  readonly height: number;
  readonly grounded: boolean;
  readonly throwingWindup: boolean;
  readonly jumpCount: number;
  readonly activeBallCount: number;
  readonly totalBallsThrown: number;
  readonly totalBallsDissipated: number;
  readonly maxObservedBounces: number;
  readonly balls: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly bounces: number;
    readonly maxBounces: number;
  }>;
}

interface BossSkeletonPose {
  head: Vec2;
  headRadius: number;
  shoulder: Vec2;
  hip: Vec2;
  frontKnee: Vec2;
  frontFoot: Vec2;
  backKnee: Vec2;
  backFoot: Vec2;
  frontElbow: Vec2;
  frontHand: Vec2;
  backElbow: Vec2;
  backHand: Vec2;
}

/**
 * Self-contained boss encounter controller + procedural 3x red stick-figure renderer.
 * Manages the locked arena blast doors, survival countdown, boss jump physics,
 * straight-line player-aimed neon laser balls (bouncing up to maxBounces times),
 * and lethal collision checks.
 */
export class BossEncounter {
  readonly config: BossConfig;

  phase: BossPhase = 'waiting';
  timeRemaining: number;

  // Boss body physics (fixed X, vertical jumps only)
  readonly x: number;
  footY: number;
  vy = 0;
  grounded = true;
  facing: 1 | -1 = -1;

  readonly width: number;
  readonly height: number;

  // Door animation states (0 = fully open / retracted upward, 1 = fully closed)
  private entryDoorClosedRatio = 0;
  private exitDoorClosedRatio = 1;

  // Jump & throw timers
  private jumpCooldown = 0;
  private crouchAnticipation = 0;
  private landSquashTimer = 0;
  private throwCooldown = 0;
  private windupTimer = 0;
  private throwFollowTimer = 0;
  private lastAimAngle = Math.PI;
  private animTime = 0;
  private escapeFlashTimer = 0;

  // Projectiles & telemetry
  private balls: LaserBall[] = [];
  private jumpCount = 0;
  private totalBallsThrown = 0;
  private totalBallsDissipated = 0;
  private maxObservedBounces = 0;

  constructor(config: BossConfig) {
    this.config = config;
    this.x = config.x;
    this.footY = config.floorY;
    this.timeRemaining = config.survivalDuration;
    this.width = Math.round(21 * config.scale);
    this.height = Math.round(54 * config.scale);
    this.reset();
  }

  reset(): void {
    this.phase = 'waiting';
    this.timeRemaining = this.config.survivalDuration;
    this.footY = this.config.floorY;
    this.vy = 0;
    this.grounded = true;
    this.facing = -1;
    this.entryDoorClosedRatio = 0;
    this.exitDoorClosedRatio = 1;
    this.jumpCooldown = 1.05;
    this.crouchAnticipation = 0;
    this.landSquashTimer = 0;
    this.throwCooldown = 0.85;
    this.windupTimer = 0;
    this.throwFollowTimer = 0;
    this.lastAimAngle = Math.PI;
    this.animTime = 0;
    this.escapeFlashTimer = 0;
    this.balls = [];
    this.jumpCount = 0;
    this.totalBallsThrown = 0;
    this.totalBallsDissipated = 0;
    this.maxObservedBounces = 0;
  }

  /**
   * Returns solid rects for currently closed blast doors so player physics
   * collides with them seamlessly like normal walls.
   */
  getActiveDoorSolids(): Rect[] {
    const solids: Rect[] = [];
    if (this.phase !== 'waiting') {
      solids.push(this.config.entryDoor);
    }
    if (this.phase !== 'escape') {
      solids.push(this.config.exitDoor);
    }
    return solids;
  }

  /**
   * Locks camera to frame the entire closed arena during the fight,
   * and keeps the arena + boss + open exit door framed during escape,
   * panning smoothly into the exit portal chamber as the player sprints right.
   */
  getCameraLockX(playerCenterX?: number): number | null {
    if (this.phase === 'waiting') {
      return 0;
    }
    const arenaLeft = this.config.entryDoor.x;
    if (this.phase === 'fighting') {
      return arenaLeft;
    }
    // Escape phase: never scroll left past the closed entry door; pan right as player approaches boss
    if (playerCenterX !== undefined && playerCenterX > arenaLeft + 440) {
      return Math.max(arenaLeft, playerCenterX - 440);
    }
    return arenaLeft;
  }

  getBodyHitbox(): Rect {
    // Slightly forgiving bottom clearance when airborne so running/sliding under feels crisp
    const airBottomForgiveness = this.grounded ? 0 : 8;
    const h = Math.max(24, this.height - airBottomForgiveness);
    return {
      x: this.x - this.width * 0.5,
      y: this.footY - this.height,
      width: this.width,
      height: h,
    };
  }

  getSnapshot(): BossSnapshot {
    return {
      name: this.config.name,
      phase: this.phase,
      timeRemaining: Number(this.timeRemaining.toFixed(2)),
      survivalDuration: this.config.survivalDuration,
      entryDoorClosed: this.phase !== 'waiting',
      exitDoorOpen: this.phase === 'escape',
      x: this.x,
      footY: this.footY,
      vy: this.vy,
      width: this.width,
      height: this.height,
      grounded: this.grounded,
      throwingWindup: this.windupTimer > 0,
      jumpCount: this.jumpCount,
      activeBallCount: this.balls.length,
      totalBallsThrown: this.totalBallsThrown,
      totalBallsDissipated: this.totalBallsDissipated,
      maxObservedBounces: this.maxObservedBounces,
      balls: this.balls.map((b) => ({
        x: b.x,
        y: b.y,
        vx: b.vx,
        vy: b.vy,
        bounces: b.bounces,
        maxBounces: b.maxBounces,
      })),
    };
  }

  /** Debug helper for E2E tests to jump countdown close to 0 without waiting 30 real seconds */
  setTimeRemainingForTest(seconds: number): void {
    if (this.phase === 'fighting') {
      this.timeRemaining = Math.max(0, seconds);
    }
  }

  update(
    dt: number,
    playerRect: Rect,
    particles: ParticleSystem,
    audio: IAudioManager,
    camera: Camera
  ): void {
    this.animTime += dt;

    const playerCenterX = playerRect.x + playerRect.width * 0.5;
    const playerCenterY = playerRect.y + playerRect.height * 0.5;
    this.facing = playerCenterX <= this.x ? -1 : 1;

    // 1. Check arena entry trigger
    if (this.phase === 'waiting') {
      if (playerRect.x >= this.config.triggerX) {
        this.phase = 'fighting';
        audio.playDoorSlam();
        camera.shake(7, 0.22);
        particles.spawnDoorBurst(
          this.config.entryDoor.x + this.config.entryDoor.width * 0.5,
          this.config.entryDoor.y + this.config.entryDoor.height * 0.5,
          COLORS.doorLockedStroke
        );
      } else {
        this.animateDoors(dt);
        return;
      }
    }

    // 2. Survival countdown -> unlock exit door behind boss at 0
    if (this.phase === 'fighting') {
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);
      if (this.timeRemaining <= 0) {
        this.phase = 'escape';
        this.escapeFlashTimer = 2.6;
        // Ensure a prompt jump so player can run under right away
        this.jumpCooldown = Math.min(this.jumpCooldown, 0.45);
        audio.playDoorOpen();
        camera.shake(5, 0.2);
        particles.spawnDoorBurst(
          this.config.exitDoor.x + this.config.exitDoor.width * 0.5,
          this.config.exitDoor.y + this.config.exitDoor.height * 0.5,
          COLORS.doorOpenStroke
        );
      }
    } else if (this.escapeFlashTimer > 0) {
      this.escapeFlashTimer = Math.max(0, this.escapeFlashTimer - dt);
    }

    this.animateDoors(dt);

    // 3. Boss vertical jump physics (stationary horizontally)
    this.updateBossJump(dt, particles, audio, camera);

    // 4. Boss laser ball throwing (can throw while grounded OR mid-jump!)
    this.updateBossThrowing(dt, playerCenterX, playerCenterY, audio);

    // 5. Update active bouncing laser balls
    this.updateLaserBalls(dt, particles, audio);
  }

  checkPlayerHit(playerRect: Rect): boolean {
    if (this.phase === 'waiting') {
      // Even before trigger, touching boss body is lethal
      return rectsOverlap(playerRect, this.getBodyHitbox());
    }

    if (rectsOverlap(playerRect, this.getBodyHitbox())) {
      return true;
    }

    for (const ball of this.balls) {
      // Slightly inset lethal core vs outer glow for crisp fairness
      if (circleIntersectsRect(ball.x, ball.y, ball.radius * 0.84, playerRect)) {
        return true;
      }
    }
    return false;
  }

  private animateDoors(dt: number): void {
    const entryTarget = this.phase === 'waiting' ? 0 : 1;
    const exitTarget = this.phase === 'escape' ? 0 : 1;
    const entrySpeed = 7.5; // fast heavy slam
    const exitSpeed = 3.0; // smooth hydraulic slide open

    if (this.entryDoorClosedRatio < entryTarget) {
      this.entryDoorClosedRatio = Math.min(
        entryTarget,
        this.entryDoorClosedRatio + entrySpeed * dt
      );
    } else if (this.entryDoorClosedRatio > entryTarget) {
      this.entryDoorClosedRatio = Math.max(
        entryTarget,
        this.entryDoorClosedRatio - entrySpeed * dt
      );
    }

    if (this.exitDoorClosedRatio < exitTarget) {
      this.exitDoorClosedRatio = Math.min(
        exitTarget,
        this.exitDoorClosedRatio + exitSpeed * dt
      );
    } else if (this.exitDoorClosedRatio > exitTarget) {
      this.exitDoorClosedRatio = Math.max(
        exitTarget,
        this.exitDoorClosedRatio - exitSpeed * dt
      );
    }
  }

  private updateBossJump(
    dt: number,
    particles: ParticleSystem,
    audio: IAudioManager,
    camera: Camera
  ): void {
    if (this.landSquashTimer > 0) {
      this.landSquashTimer = Math.max(0, this.landSquashTimer - dt);
    }

    if (this.grounded) {
      if (this.crouchAnticipation > 0) {
        this.crouchAnticipation -= dt;
        if (this.crouchAnticipation <= 0) {
          this.crouchAnticipation = 0;
          this.grounded = false;
          this.vy = this.config.jumpVelocity;
          this.jumpCount += 1;
        }
      } else {
        this.jumpCooldown -= dt;
        if (this.jumpCooldown <= 0) {
          this.crouchAnticipation = 0.18;
        }
      }
    } else {
      this.vy += this.config.gravity * dt;
      this.footY += this.vy * dt;

      // Prevent boss head from ever clipping ceiling
      const minFootY = this.config.arenaBounds.y + this.height + 6;
      if (this.footY < minFootY) {
        this.footY = minFootY;
        if (this.vy < 0) this.vy = 0;
      }

      if (this.footY >= this.config.floorY) {
        this.footY = this.config.floorY;
        this.vy = 0;
        this.grounded = true;
        this.landSquashTimer = 0.16;
        this.scheduleNextJump();
        audio.playBossStomp();
        camera.shake(5.5, 0.16);
        particles.spawnBossStomp(this.x, this.config.floorY);
      }
    }
  }

  private scheduleNextJump(): void {
    if (this.phase === 'escape') {
      // Frequent, reliable jump openings once exit unlocks
      this.jumpCooldown = 0.85 + Math.random() * 0.45;
      return;
    }
    const span = Math.max(
      0,
      this.config.jumpCooldownMax - this.config.jumpCooldownMin
    );
    this.jumpCooldown = this.config.jumpCooldownMin + Math.random() * span;
  }

  private getThrowHandWorldPos(): Vec2 {
    const scale = this.config.scale;
    // Hand sits around shoulder/chest height in front of boss
    const localX = this.windupTimer > 0 ? -9 : 13;
    const localY = this.grounded ? -37 : -34;
    return {
      x: this.x + this.facing * localX * scale,
      y: this.footY + localY * scale,
    };
  }

  private updateBossThrowing(
    dt: number,
    playerCenterX: number,
    playerCenterY: number,
    audio: IAudioManager
  ): void {
    if (this.throwFollowTimer > 0) {
      this.throwFollowTimer = Math.max(0, this.throwFollowTimer - dt);
    }

    if (this.windupTimer > 0) {
      const hand = this.getThrowHandWorldPos();
      this.lastAimAngle = Math.atan2(
        playerCenterY - hand.y,
        playerCenterX - hand.x
      );
      this.windupTimer -= dt;
      if (this.windupTimer <= 0) {
        this.windupTimer = 0;
        this.launchLaserBall(hand, playerCenterX, playerCenterY, audio);
        this.throwFollowTimer = 0.24;
        this.throwCooldown = this.config.throwCooldown;
      }
      return;
    }

    this.throwCooldown -= dt;
    if (
      this.throwCooldown <= 0 &&
      this.balls.length < this.config.maxActiveBalls
    ) {
      this.windupTimer = this.config.windupDuration;
      const hand = this.getThrowHandWorldPos();
      this.lastAimAngle = Math.atan2(
        playerCenterY - hand.y,
        playerCenterX - hand.x
      );
    }
  }

  private launchLaserBall(
    origin: Vec2,
    targetX: number,
    targetY: number,
    audio: IAudioManager
  ): void {
    let dx = targetX - origin.x;
    let dy = targetY - origin.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) {
      dx = this.facing;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }

    // Keep launch origin cleanly inside arena bounds
    const bounds = this.config.arenaBounds;
    const r = this.config.ballRadius;
    const spawnX = Math.max(
      bounds.x + r + 2,
      Math.min(bounds.x + bounds.width - r - 2, origin.x)
    );
    const spawnY = Math.max(
      bounds.y + r + 2,
      Math.min(bounds.y + bounds.height - r - 2, origin.y)
    );

    this.balls.push({
      x: spawnX,
      y: spawnY,
      vx: dx * this.config.ballSpeed,
      vy: dy * this.config.ballSpeed,
      radius: r,
      bounces: 0,
      maxBounces: this.config.maxBounces,
      age: 0,
      trail: [{ x: spawnX, y: spawnY }],
    });
    this.totalBallsThrown += 1;
    audio.playLaserBallThrow();
  }

  private updateLaserBalls(
    dt: number,
    particles: ParticleSystem,
    audio: IAudioManager
  ): void {
    const b = this.config.arenaBounds;
    const left = b.x;
    const right = b.x + b.width;
    const top = b.y;
    const bottom = b.y + b.height;

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      ball.age += dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      let hitWall = false;
      let nx = 0;
      let ny = 0;

      if (ball.x - ball.radius <= left) {
        ball.x = left + ball.radius;
        ball.vx = Math.abs(ball.vx);
        hitWall = true;
        nx = 1;
      } else if (ball.x + ball.radius >= right) {
        ball.x = right - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        hitWall = true;
        nx = -1;
      }

      if (ball.y - ball.radius <= top) {
        ball.y = top + ball.radius;
        ball.vy = Math.abs(ball.vy);
        hitWall = true;
        ny = 1;
      } else if (ball.y + ball.radius >= bottom) {
        ball.y = bottom - ball.radius;
        ball.vy = -Math.abs(ball.vy);
        hitWall = true;
        ny = -1;
      }

      if (hitWall) {
        ball.bounces += 1;
        if (ball.bounces > ball.maxBounces) {
          // Ball has already bounced maxBounces (5) times; dissipate on next wall hit
          this.maxObservedBounces = Math.max(
            this.maxObservedBounces,
            ball.maxBounces
          );
          particles.spawnLaserBallDissipate(ball.x, ball.y);
          this.balls.splice(i, 1);
          this.totalBallsDissipated += 1;
          continue;
        }
        this.maxObservedBounces = Math.max(
          this.maxObservedBounces,
          ball.bounces
        );
        particles.spawnLaserBallBounce(ball.x, ball.y, nx, ny);
        audio.playLaserBallBounce(ball.bounces);
      }

      // Record smooth motion trail
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 9) {
        ball.trail.shift();
      }
    }
  }

  /**
   * Renders the glowing diegetic countdown backdrop painted on the back wall of the arena.
   * Drawn behind solids/player/boss so players never lose track of the timer mid-dodge.
   */
  renderArenaBackdrop(ctx: CanvasRenderingContext2D): void {
    const bounds = this.config.arenaBounds;
    const cx = bounds.x + bounds.width * 0.5;
    const cy = bounds.y + bounds.height * 0.44;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Subtle red ambient floor danger glow inside boss room
    const roomGlow = ctx.createRadialGradient(
      this.x,
      this.config.floorY - 60,
      20,
      this.x,
      this.config.floorY - 60,
      360
    );
    roomGlow.addColorStop(
      0,
      this.phase === 'escape'
        ? 'rgba(16, 185, 129, 0.11)'
        : 'rgba(244, 63, 94, 0.12)'
    );
    roomGlow.addColorStop(1, 'rgba(244, 63, 94, 0)');
    ctx.fillStyle = roomGlow;
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

    // Boss name eyebrow
    ctx.font = '700 13px "JetBrains Mono", "Fira Code", ui-monospace, monospace';
    ctx.fillStyle =
      this.phase === 'escape'
        ? 'rgba(52, 211, 153, 0.72)'
        : 'rgba(251, 113, 133, 0.58)';
    const headerText =
      this.phase === 'waiting'
        ? `BOSS ARENA // ${this.config.name.toUpperCase()}`
        : this.phase === 'escape'
          ? 'EXIT UNLOCKED // RUN UNDER THE BOSS!'
          : `SURVIVE // ${this.config.name.toUpperCase()}`;
    ctx.fillText(headerText, cx, cy - 58);

    // Giant digital countdown on back wall
    const urgent = this.phase === 'fighting' && this.timeRemaining <= 5;
    const pulse = urgent ? 0.7 + 0.3 * Math.sin(this.animTime * 16) : 1;

    ctx.font = '800 84px "JetBrains Mono", "Fira Code", ui-monospace, monospace';
    if (this.phase === 'escape') {
      ctx.fillStyle = 'rgba(52, 211, 153, 0.34)';
      ctx.shadowColor = 'rgba(16, 185, 129, 0.6)';
      ctx.shadowBlur = 22;
      ctx.fillText('ESCAPE →', cx, cy + 6);
    } else {
      const displayTime = this.timeRemaining.toFixed(1).padStart(4, '0');
      ctx.fillStyle = urgent
        ? `rgba(255, 42, 109, ${(0.32 * pulse).toFixed(2)})`
        : 'rgba(244, 63, 94, 0.22)';
      ctx.shadowColor = 'rgba(255, 23, 68, 0.45)';
      ctx.shadowBlur = urgent ? 24 : 14;
      ctx.fillText(displayTime, cx, cy + 6);
    }

    // Escape hint arrow pointing underneath the boss when exit is open
    if (this.phase === 'escape') {
      const arrowBounce = Math.sin(this.animTime * 9) * 8;
      ctx.font =
        '800 16px "JetBrains Mono", "Fira Code", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(110, 231, 183, 0.9)';
      ctx.shadowColor = COLORS.doorOpenStroke;
      ctx.shadowBlur = 12;
      ctx.fillText(
        'RUN UNDER WHEN HE JUMPS ➔',
        this.x - 160 + arrowBounce,
        this.config.floorY - 26
      );
    }

    ctx.restore();
  }

  /**
   * Renders the animated entry & exit blast doors, the giant 3x red stick-figure boss,
   * and all active bouncing neon laser balls.
   */
  renderForeground(ctx: CanvasRenderingContext2D): void {
    this.renderBlastDoor(
      ctx,
      this.config.entryDoor,
      this.entryDoorClosedRatio,
      this.phase === 'waiting' ? 'open' : 'locked'
    );
    this.renderBlastDoor(
      ctx,
      this.config.exitDoor,
      this.exitDoorClosedRatio,
      this.phase === 'escape' ? 'open' : 'locked'
    );

    this.renderBossStickFigure(ctx);
    this.renderLaserBalls(ctx);
  }

  private renderBlastDoor(
    ctx: CanvasRenderingContext2D,
    door: Rect,
    closedRatio: number,
    status: 'open' | 'locked'
  ): void {
    ctx.save();

    // Doorframe guide rails
    ctx.strokeStyle =
      status === 'open'
        ? 'rgba(16, 185, 129, 0.7)'
        : 'rgba(244, 63, 94, 0.75)';
    ctx.lineWidth = 2;
    ctx.shadowColor =
      status === 'open' ? COLORS.doorOpenStroke : COLORS.doorLockedStroke;
    ctx.shadowBlur = 10;
    ctx.strokeRect(door.x + 1, door.y + 1, door.width - 2, door.height - 2);

    // Sliding door shutter (retracts upward into wall above doorway)
    const visibleH = door.height * closedRatio;
    if (visibleH > 1) {
      ctx.fillStyle = COLORS.doorLockedFill;
      ctx.fillRect(door.x, door.y, door.width, visibleH);

      // Diagonal hazard stripes clipped to shutter
      ctx.save();
      ctx.beginPath();
      ctx.rect(door.x, door.y, door.width, visibleH);
      ctx.clip();

      ctx.strokeStyle = 'rgba(244, 63, 94, 0.42)';
      ctx.lineWidth = 4;
      for (let sy = door.y - 24; sy < door.y + visibleH + 24; sy += 16) {
        ctx.beginPath();
        ctx.moveTo(door.x - 4, sy);
        ctx.lineTo(door.x + door.width + 4, sy + 14);
        ctx.stroke();
      }
      ctx.restore();

      // Bright glowing perimeter + bottom laser seal edge
      ctx.strokeStyle = COLORS.doorLockedStroke;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = COLORS.bossGlow;
      ctx.shadowBlur = 12;
      ctx.strokeRect(door.x + 1, door.y + 1, door.width - 2, visibleH - 2);
    } else if (status === 'open') {
      // Soft green open doorway shimmer
      const openGrad = ctx.createLinearGradient(
        door.x,
        door.y,
        door.x + door.width,
        door.y
      );
      openGrad.addColorStop(0, 'rgba(16, 185, 129, 0.04)');
      openGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.22)');
      openGrad.addColorStop(1, 'rgba(16, 185, 129, 0.04)');
      ctx.fillStyle = openGrad;
      ctx.fillRect(door.x, door.y, door.width, door.height);
    }

    ctx.restore();
  }

  private renderBossStickFigure(ctx: CanvasRenderingContext2D): void {
    const scale = this.config.scale;
    const pose = this.computeBossPose();

    ctx.save();

    // Subtle ground shadow directly under the boss so landing & height gap are easy to read
    const heightOffGround = Math.max(0, this.config.floorY - this.footY);
    const shadowScale = Math.max(0.35, 1 - heightOffGround / 240);
    ctx.fillStyle = 'rgba(255, 23, 68, 0.28)';
    ctx.beginPath();
    ctx.ellipse(
      this.x,
      this.config.floorY - 1,
      36 * shadowScale,
      6 * shadowScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Translate to boss feet center and scale by 3x
    ctx.translate(this.x, this.footY);

    // Landing squash or takeoff crouch springiness
    let squashX = 1;
    let squashY = 1;
    if (this.landSquashTimer > 0) {
      const k = this.landSquashTimer / 0.16;
      squashX = 1 + 0.1 * k;
      squashY = 1 - 0.09 * k;
    } else if (this.crouchAnticipation > 0) {
      const k = 1 - this.crouchAnticipation / 0.18;
      squashX = 1 + 0.08 * k;
      squashY = 1 - 0.1 * k;
    }

    ctx.scale(this.facing * scale * squashX, scale * squashY);

    // Pass 1: Intense crimson outer neon glow
    this.drawBossSkeleton(ctx, pose, COLORS.bossGlow, 4.6, 20);
    // Pass 2: Rich neon red mid stroke
    this.drawBossSkeleton(ctx, pose, COLORS.bossMid, 2.8, 8);
    // Pass 3: Hot rose-white inner core
    this.drawBossSkeleton(ctx, pose, COLORS.bossCore, 1.35, 2);

    // Menacing glowing angry eye + slanted brow inside head ring
    ctx.shadowColor = COLORS.bossEye;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = COLORS.bossEye;
    ctx.lineWidth = 1.15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pose.head.x - 1.4, pose.head.y - 2.4);
    ctx.lineTo(pose.head.x + 3.6, pose.head.y - 0.8);
    ctx.stroke();

    ctx.fillStyle = COLORS.bossEye;
    ctx.beginPath();
    ctx.arc(pose.head.x + 1.8, pose.head.y + 0.5, 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Render charging laser orb & faint telegraph aim sightline in world space during windup
    if (this.windupTimer > 0) {
      const progress =
        1 - this.windupTimer / Math.max(0.01, this.config.windupDuration);
      const hand = this.getThrowHandWorldPos();

      ctx.save();
      // Faint dotted laser aim telegraph toward player
      ctx.strokeStyle = `rgba(255, 42, 109, ${(0.18 + progress * 0.28).toFixed(2)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 7]);
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.lineTo(
        hand.x + Math.cos(this.lastAimAngle) * 210,
        hand.y + Math.sin(this.lastAimAngle) * 210
      );
      ctx.stroke();
      ctx.setLineDash([]);

      // Growing crackling charge orb in hand
      const r = this.config.ballRadius * (0.45 + 0.7 * progress);
      ctx.shadowColor = COLORS.bossBallGlow;
      ctx.shadowBlur = 22;
      ctx.fillStyle = COLORS.bossBallInner;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS.bossBallCore;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, r * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawBossSkeleton(
    ctx: CanvasRenderingContext2D,
    p: BossSkeletonPose,
    color: string,
    lineWidth: number,
    blur: number
  ): void {
    ctx.strokeStyle = color;
    ctx.fillStyle = COLORS.bgDeep;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = COLORS.bossGlow;
    ctx.shadowBlur = blur;

    // Back leg
    ctx.beginPath();
    ctx.moveTo(p.hip.x, p.hip.y);
    ctx.lineTo(p.backKnee.x, p.backKnee.y);
    ctx.lineTo(p.backFoot.x, p.backFoot.y);
    ctx.stroke();

    // Back arm
    ctx.beginPath();
    ctx.moveTo(p.shoulder.x, p.shoulder.y);
    ctx.lineTo(p.backElbow.x, p.backElbow.y);
    ctx.lineTo(p.backHand.x, p.backHand.y);
    ctx.stroke();

    // Torso
    ctx.beginPath();
    ctx.moveTo(p.hip.x, p.hip.y);
    ctx.lineTo(p.shoulder.x, p.shoulder.y);
    ctx.stroke();

    // Front leg
    ctx.beginPath();
    ctx.moveTo(p.hip.x, p.hip.y);
    ctx.lineTo(p.frontKnee.x, p.frontKnee.y);
    ctx.lineTo(p.frontFoot.x, p.frontFoot.y);
    ctx.stroke();

    // Front (throwing) arm
    ctx.beginPath();
    ctx.moveTo(p.shoulder.x, p.shoulder.y);
    ctx.lineTo(p.frontElbow.x, p.frontElbow.y);
    ctx.lineTo(p.frontHand.x, p.frontHand.y);
    ctx.stroke();

    // Head ring
    ctx.beginPath();
    ctx.arc(p.head.x, p.head.y, p.headRadius, 0, Math.PI * 2);
    if (lineWidth < 2) {
      ctx.fill();
    }
    ctx.stroke();
  }

  private computeBossPose(): BossSkeletonPose {
    const t = this.animTime;
    const breathe = Math.sin(t * 3.8) * 1.2;

    let pose: BossSkeletonPose;

    if (!this.grounded) {
      // Airborne jump/fall pose: legs tucked crisply above y=0 so the run-under clearance is unmistakable
      const rising = this.vy < 0;
      pose = {
        head: { x: 2, y: -49 },
        headRadius: 6.8,
        shoulder: { x: 1, y: -39 },
        hip: { x: -1, y: -21 },
        frontKnee: { x: 9, y: rising ? -16 : -12 },
        frontFoot: { x: 6, y: rising ? -5 : -2 },
        backKnee: { x: -6, y: rising ? -15 : -11 },
        backFoot: { x: -9, y: rising ? -4 : -2 },
        frontElbow: { x: 8, y: -42 },
        frontHand: { x: 14, y: -46 },
        backElbow: { x: -8, y: -40 },
        backHand: { x: -14, y: -44 },
      };
    } else {
      // Grounded imposing battle stance
      pose = {
        head: { x: 1, y: -48 + breathe },
        headRadius: 6.8,
        shoulder: { x: 0, y: -38 + breathe },
        hip: { x: 0, y: -21 },
        frontKnee: { x: 6, y: -11 },
        frontFoot: { x: 8, y: -1 },
        backKnee: { x: -6, y: -11 },
        backFoot: { x: -8, y: -1 },
        frontElbow: { x: 7, y: -30 + breathe },
        frontHand: { x: 12, y: -24 + breathe },
        backElbow: { x: -7, y: -31 + breathe },
        backHand: { x: -11, y: -23 + breathe },
      };
    }

    // Layer throwing wind-up / follow-through arm pose on top of BOTH grounded and jumping poses!
    if (this.windupTimer > 0) {
      pose.frontElbow = { x: -6, y: pose.shoulder.y - 3 };
      pose.frontHand = { x: -10, y: pose.shoulder.y + 1 };
      pose.backElbow = { x: 6, y: pose.shoulder.y + 4 };
      pose.backHand = { x: 12, y: pose.shoulder.y + 2 };
    } else if (this.throwFollowTimer > 0) {
      // Snap throwing arm along local aim angle
      const localAimX = Math.cos(this.lastAimAngle) * this.facing;
      const localAimY = Math.sin(this.lastAimAngle);
      pose.frontElbow = {
        x: pose.shoulder.x + localAimX * 8,
        y: pose.shoulder.y + localAimY * 8,
      };
      pose.frontHand = {
        x: pose.shoulder.x + localAimX * 16,
        y: pose.shoulder.y + localAimY * 16,
      };
    }

    return pose;
  }

  private renderLaserBalls(ctx: CanvasRenderingContext2D): void {
    if (this.balls.length === 0) return;

    ctx.save();
    for (const ball of this.balls) {
      const bouncesLeft = Math.max(0, ball.maxBounces - ball.bounces);
      const isFinalBounce = bouncesLeft === 0;
      const flicker =
        isFinalBounce ? 0.72 + 0.28 * Math.sin(this.animTime * 34) : 1;

      // Glowing laser motion trail
      if (ball.trail.length > 1) {
        for (let i = 1; i < ball.trail.length; i++) {
          const prev = ball.trail[i - 1];
          const cur = ball.trail[i];
          const frac = i / ball.trail.length;
          ctx.strokeStyle = isFinalBounce
            ? `rgba(251, 113, 133, ${(frac * 0.45 * flicker).toFixed(2)})`
            : `rgba(255, 23, 68, ${(frac * 0.55).toFixed(2)})`;
          ctx.lineWidth = ball.radius * 1.15 * frac;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(cur.x, cur.y);
          ctx.stroke();
        }
      }

      // Outer neon plasma halo
      ctx.globalAlpha = flicker;
      ctx.shadowColor = COLORS.bossBallGlow;
      ctx.shadowBlur = 22;
      ctx.fillStyle = COLORS.bossBallGlow;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius * 1.12, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright crimson plasma
      ctx.shadowBlur = 10;
      ctx.fillStyle = COLORS.bossBallInner;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius * 0.85, 0, Math.PI * 2);
      ctx.fill();

      // Hot white center core
      ctx.shadowBlur = 0;
      ctx.fillStyle = COLORS.bossBallCore;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius * 0.42, 0, Math.PI * 2);
      ctx.fill();

      // Remaining-bounces indicator ring (shrinks arc as bounces are used up)
      if (ball.maxBounces > 0) {
        const remainingRatio = (bouncesLeft + 1) / (ball.maxBounces + 1);
        ctx.strokeStyle = 'rgba(255, 241, 242, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(
          ball.x,
          ball.y,
          ball.radius + 3.5,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * remainingRatio
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

/** Convenience sanity helper verifying boss jump height allows upright player passage */
export function computeBossMaxJumpHeight(boss: BossConfig): number {
  return (boss.jumpVelocity * boss.jumpVelocity) / (2 * boss.gravity);
}

export function bossAllowsRunUnder(boss: BossConfig): boolean {
  return computeBossMaxJumpHeight(boss) >= PLAYER_STAND_HEIGHT + 24;
}

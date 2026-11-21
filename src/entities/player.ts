import type { Rect, Vec2 } from '../levels/types.ts';
import type { IAudioManager } from '../engine/audio.ts';
import { canStandUp, moveAndResolveSolids } from '../engine/collision.ts';
import {
  AIR_ACCEL,
  AIR_DECEL,
  COLORS,
  COYOTE_TIME,
  DOUBLE_JUMP_VELOCITY,
  DUCK_CREEP_SPEED,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_DECEL,
  JUMP_BUFFER_TIME,
  JUMP_CUT_MULTIPLIER,
  JUMP_CUT_THRESHOLD,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  MAX_RUN_SPEED,
  PLAYER_DUCK_HEIGHT,
  PLAYER_STAND_HEIGHT,
  PLAYER_WIDTH,
  SLIDE_FRICTION,
  SLIDE_INITIAL_SPEED,
  SLIDE_MIN_DURATION,
  SLIDE_STOP_SPEED,
  SLIDE_TRIGGER_SPEED,
} from '../engine/constants.ts';
import type { InputSnapshot } from '../engine/input.ts';
import type { ParticleSystem } from '../engine/particles.ts';

export type PlayerState =
  | 'idle'
  | 'run'
  | 'jump'
  | 'fall'
  | 'doubleJump'
  | 'duck'
  | 'slide'
  | 'dead'
  | 'victory';

export interface PlayerSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  state: PlayerState;
  grounded: boolean;
  facing: 1 | -1;
  jumpsRemaining: number;
}

export class Player {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  width = PLAYER_WIDTH;
  height = PLAYER_STAND_HEIGHT;

  facing: 1 | -1 = 1;
  grounded = false;
  state: PlayerState = 'idle';

  // Jump mechanics
  jumpsRemaining = 2;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private hasUsedDoubleJump = false;

  // Duck & slide mechanics
  private isCrouched = false;
  private slideTimer = 0;
  private slideDirection: 1 | -1 = 1;
  private slideSparkCooldown = 0;

  // Animation timers
  private animTime = 0;
  private runCycle = 0;
  private flipProgress = 1; // 0..1 during double jump flip

  reset(spawn: Vec2): void {
    this.x = spawn.x;
    this.y = spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_STAND_HEIGHT;
    this.facing = 1;
    this.grounded = false;
    this.state = 'idle';
    this.jumpsRemaining = 2;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.hasUsedDoubleJump = false;
    this.isCrouched = false;
    this.slideTimer = 0;
    this.slideDirection = 1;
    this.slideSparkCooldown = 0;
    this.animTime = 0;
    this.runCycle = 0;
    this.flipProgress = 1;
  }

  getRect(): Rect {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    };
  }

  getCenter(): Vec2 {
    return {
      x: this.x + this.width * 0.5,
      y: this.y + this.height * 0.5,
    };
  }

  getSnapshot(): PlayerSnapshot {
    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      width: this.width,
      height: this.height,
      state: this.state,
      grounded: this.grounded,
      facing: this.facing,
      jumpsRemaining: this.jumpsRemaining,
    };
  }

  kill(particles: ParticleSystem, audio: IAudioManager): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    const center = this.getCenter();
    particles.spawnDeathShatter(center.x, center.y);
    audio.playDeath();
  }

  setVictory(): void {
    this.state = 'victory';
    this.vx = 0;
    this.vy = 0;
  }

  private setCrouched(crouched: boolean, solids: readonly Rect[]): boolean {
    if (crouched === this.isCrouched) return true;

    if (crouched) {
      const bottom = this.y + this.height;
      this.height = PLAYER_DUCK_HEIGHT;
      this.y = bottom - PLAYER_DUCK_HEIGHT;
      this.isCrouched = true;
      return true;
    }

    // Attempt to stand up — verify headroom first
    if (!canStandUp(this.getRect(), PLAYER_STAND_HEIGHT, solids)) {
      return false;
    }
    const bottom = this.y + this.height;
    this.height = PLAYER_STAND_HEIGHT;
    this.y = bottom - PLAYER_STAND_HEIGHT;
    this.isCrouched = false;
    return true;
  }

  update(
    input: InputSnapshot,
    dt: number,
    solids: readonly Rect[],
    particles: ParticleSystem,
    audio: IAudioManager
  ): void {
    this.animTime += dt;
    if (this.state === 'dead' || this.state === 'victory') {
      return;
    }

    const moveDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    // Coyote time & jump buffer timers
    if (this.grounded) {
      this.coyoteTimer = COYOTE_TIME;
      this.jumpsRemaining = 2;
      this.hasUsedDoubleJump = false;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    if (input.jumpPressed) {
      this.jumpBufferTimer = JUMP_BUFFER_TIME;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    // Determine slide / duck transitions on the ground
    const currentlySliding = this.state === 'slide';

    if (this.grounded) {
      if (currentlySliding) {
        this.slideTimer += dt;
        // Apply friction decay in slide direction
        const speed = Math.abs(this.vx);
        const nextSpeed = Math.max(0, speed - SLIDE_FRICTION * dt);
        this.vx = this.slideDirection * nextSpeed;

        // Spawn subtle slide sparks
        this.slideSparkCooldown -= dt;
        if (this.slideSparkCooldown <= 0 && nextSpeed > 120) {
          particles.spawnSlideSpark(
            this.x + this.width * 0.5 - this.slideDirection * 6,
            this.y + this.height,
            this.slideDirection
          );
          this.slideSparkCooldown = 0.045;
        }

        const wantsEndSlide =
          nextSpeed <= SLIDE_STOP_SPEED ||
          (!input.downHeld && this.slideTimer >= SLIDE_MIN_DURATION);

        if (wantsEndSlide) {
          if (input.downHeld || !this.setCrouched(false, solids)) {
            this.state = 'duck';
          } else {
            this.state = Math.abs(this.vx) > 10 ? 'run' : 'idle';
          }
        }
      } else if (input.downHeld) {
        // Trigger a momentum-based slide if moving fast enough on press or touchdown
        if (
          !this.isCrouched &&
          Math.abs(this.vx) >= SLIDE_TRIGGER_SPEED
        ) {
          this.setCrouched(true, solids);
          this.slideDirection = this.vx >= 0 ? 1 : -1;
          this.facing = this.slideDirection;
          this.vx =
            this.slideDirection *
            Math.max(Math.abs(this.vx), SLIDE_INITIAL_SPEED);
          this.slideTimer = 0;
          this.slideSparkCooldown = 0;
          this.state = 'slide';
          audio.playSlide();
          particles.spawnSlideSpark(
            this.x + this.width * 0.5,
            this.y + this.height,
            this.slideDirection
          );
        } else {
          this.setCrouched(true, solids);
          this.state = 'duck';
        }
      } else if (this.isCrouched) {
        // Down released — stand up if ceiling is clear, otherwise remain ducking
        if (this.setCrouched(false, solids)) {
          this.state = Math.abs(this.vx) > 10 ? 'run' : 'idle';
        } else {
          this.state = 'duck';
        }
      }
    } else if (this.isCrouched) {
      // Mid-air after sliding off a ledge: stand back up as soon as headroom allows
      this.setCrouched(false, solids);
    }

    // Horizontal acceleration / deceleration (skipped during active slide so friction governs slide)
    if (this.state !== 'slide') {
      if (moveDir !== 0) {
        this.facing = moveDir as 1 | -1;
        const maxSpeed = this.isCrouched ? DUCK_CREEP_SPEED : MAX_RUN_SPEED;
        const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL;
        const targetVx = moveDir * maxSpeed;

        if (this.vx < targetVx) {
          this.vx = Math.min(targetVx, this.vx + accel * dt);
        } else if (this.vx > targetVx) {
          this.vx = Math.max(targetVx, this.vx - accel * dt);
        }
      } else {
        const decel = this.grounded ? GROUND_DECEL : AIR_DECEL;
        if (Math.abs(this.vx) <= decel * dt) {
          this.vx = 0;
        } else {
          this.vx -= Math.sign(this.vx) * decel * dt;
        }
      }
    }

    // Jump execution (ground / coyote jump or mid-air double jump)
    if (this.jumpBufferTimer > 0) {
      const canGroundJump = this.coyoteTimer > 0;
      const canDoubleJump = !canGroundJump && !this.hasUsedDoubleJump && this.jumpsRemaining > 0;

      if (canGroundJump) {
        // Must have headroom to jump out of a crouch/slide
        if (!this.isCrouched || this.setCrouched(false, solids)) {
          this.vy = JUMP_VELOCITY;
          this.grounded = false;
          this.coyoteTimer = 0;
          this.jumpBufferTimer = 0;
          this.jumpsRemaining = 1;
          this.state = 'jump';
          audio.playJump();
        }
      } else if (canDoubleJump) {
        if (!this.isCrouched || this.setCrouched(false, solids)) {
          this.vy = DOUBLE_JUMP_VELOCITY;
          this.jumpBufferTimer = 0;
          this.hasUsedDoubleJump = true;
          this.jumpsRemaining = 0;
          this.flipProgress = 0;
          this.state = 'doubleJump';
          audio.playDoubleJump();
          particles.spawnDoubleJumpBurst(
            this.x + this.width * 0.5,
            this.y + this.height
          );
        }
      }
    }

    // Variable jump height on early jump release
    if (input.jumpReleased && this.vy < JUMP_CUT_THRESHOLD) {
      this.vy *= JUMP_CUT_MULTIPLIER;
    }

    // Gravity
    this.vy = Math.min(MAX_FALL_SPEED, this.vy + GRAVITY * dt);

    // Move & resolve collisions against solid geometry
    const wasGrounded = this.grounded;
    const result = moveAndResolveSolids(
      this.x,
      this.y,
      this.width,
      this.height,
      this.vx,
      this.vy,
      dt,
      solids
    );

    this.x = result.x;
    this.y = result.y;
    this.vx = result.vx;
    this.vy = result.vy;
    this.grounded = result.grounded;

    // If hit a wall during slide, end slide into duck/idle cleanly
    if (this.state === 'slide' && (result.hitWallLeft || result.hitWallRight)) {
      if (input.downHeld || !this.setCrouched(false, solids)) {
        this.state = 'duck';
      } else {
        this.state = 'idle';
      }
    }

    // Prevent leaving left edge of level
    if (this.x < 0) {
      this.x = 0;
      if (this.vx < 0) this.vx = 0;
    }

    // Smooth touchdown into slide if holding Down with horizontal speed
    if (!wasGrounded && this.grounded && input.downHeld && Math.abs(this.vx) >= SLIDE_TRIGGER_SPEED) {
      this.setCrouched(true, solids);
      this.slideDirection = this.vx >= 0 ? 1 : -1;
      this.facing = this.slideDirection;
      this.vx = this.slideDirection * Math.max(Math.abs(this.vx), SLIDE_INITIAL_SPEED);
      this.slideTimer = 0;
      this.state = 'slide';
      audio.playSlide();
    }

    // Update double-jump flip progress
    if (this.flipProgress < 1) {
      this.flipProgress = Math.min(1, this.flipProgress + dt / 0.36);
    }

    // Update run cycle speed proportional to horizontal velocity
    if (this.grounded && !this.isCrouched && Math.abs(this.vx) > 15) {
      this.runCycle += (Math.abs(this.vx) / MAX_RUN_SPEED) * dt * 13;
    } else if (this.isCrouched && this.state === 'duck' && Math.abs(this.vx) > 10) {
      this.runCycle += dt * 7;
    }

    // Update visual state machine
    if (this.grounded) {
      if (this.state === 'slide') {
        // Stay in slide until slide exit condition above triggers
      } else if (this.isCrouched) {
        this.state = 'duck';
      } else if (Math.abs(this.vx) > 15) {
        this.state = 'run';
      } else {
        this.state = 'idle';
      }
    } else {
      if (this.flipProgress < 1) {
        this.state = 'doubleJump';
      } else if (this.vy < 0) {
        this.state = 'jump';
      } else {
        this.state = 'fall';
      }
    }
  }

  /**
   * Procedural articulated neon stick-figure renderer.
   * Coordinates are computed in local space where (0, 0) is bottom-center of the player's feet,
   * then mirrored horizontally by `facing` so all poses stay crisp and expressive.
   */
  render(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'dead') return;

    const footX = this.x + this.width * 0.5;
    const footY = this.y + this.height;

    ctx.save();
    ctx.translate(footX, footY);

    // Apply 360-degree front flip around body center during double jump
    if (this.state === 'doubleJump' && this.flipProgress < 1) {
      const centerOffsetY = -this.height * 0.5;
      ctx.translate(0, centerOffsetY);
      ctx.rotate(this.facing * this.flipProgress * Math.PI * 2);
      ctx.translate(0, -centerOffsetY);
    }

    ctx.scale(this.facing, 1);

    const pose = this.computePose();

    // Outer neon cyan glow pass + crisp white core pass
    this.drawSkeleton(ctx, pose, COLORS.playerGlow, 5.2, 16);
    this.drawSkeleton(ctx, pose, COLORS.playerCore, 2.3, 4);

    ctx.restore();
  }

  private drawSkeleton(
    ctx: CanvasRenderingContext2D,
    p: StickPose,
    color: string,
    lineWidth: number,
    blur: number
  ): void {
    ctx.strokeStyle = color;
    ctx.fillStyle = COLORS.bg;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = COLORS.playerGlow;
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

    // Front arm
    ctx.beginPath();
    ctx.moveTo(p.shoulder.x, p.shoulder.y);
    ctx.lineTo(p.frontElbow.x, p.frontElbow.y);
    ctx.lineTo(p.frontHand.x, p.frontHand.y);
    ctx.stroke();

    // Head (hollow glowing ring with dark center)
    ctx.beginPath();
    ctx.arc(p.head.x, p.head.y, p.headRadius, 0, Math.PI * 2);
    if (lineWidth < 3) {
      ctx.fill();
    }
    ctx.stroke();
  }

  private computePose(): StickPose {
    const t = this.animTime;

    if (this.state === 'slide') {
      // Dramatic low parkour/baseball slide fitting comfortably within 28px height
      const jitter = Math.sin(t * 28) * 0.8;
      return {
        head: { x: -11, y: -21 + jitter },
        headRadius: 6,
        shoulder: { x: -7, y: -14 + jitter },
        hip: { x: 2, y: -6 },
        frontKnee: { x: 11, y: -5 },
        frontFoot: { x: 19, y: -2 },
        backKnee: { x: -4, y: -2 },
        backFoot: { x: -11, y: -2 },
        frontElbow: { x: 0, y: -18 },
        frontHand: { x: 8, y: -15 },
        backElbow: { x: -14, y: -9 },
        backHand: { x: -18, y: -3 },
      };
    }

    if (this.state === 'duck') {
      // Compact crouch inside 28px height; gentle creep bob if moving
      const creep = Math.abs(this.vx) > 10 ? Math.sin(this.runCycle) * 2.5 : 0;
      const breathe = Math.sin(t * 4) * 0.7;
      return {
        head: { x: 4, y: -21 + breathe },
        headRadius: 6,
        shoulder: { x: 1, y: -15 + breathe },
        hip: { x: -5, y: -9 },
        frontKnee: { x: 5 + creep * 0.5, y: -8 },
        frontFoot: { x: 3 + creep, y: -1 },
        backKnee: { x: -2 - creep * 0.5, y: -7 },
        backFoot: { x: -7 - creep, y: -1 },
        frontElbow: { x: 6, y: -11 },
        frontHand: { x: 11, y: -10 },
        backElbow: { x: -5, y: -11 },
        backHand: { x: -2, y: -7 },
      };
    }

    if (this.state === 'doubleJump') {
      // Compact somersault tuck pose
      return {
        head: { x: 4, y: -42 },
        headRadius: 6.5,
        shoulder: { x: 0, y: -34 },
        hip: { x: -4, y: -20 },
        frontKnee: { x: 8, y: -19 },
        frontFoot: { x: 2, y: -11 },
        backKnee: { x: 5, y: -15 },
        backFoot: { x: -2, y: -9 },
        frontElbow: { x: 8, y: -28 },
        frontHand: { x: 10, y: -20 },
        backElbow: { x: -7, y: -29 },
        backHand: { x: -3, y: -21 },
      };
    }

    if (this.state === 'jump') {
      // Energetic upward leap: front knee tucked high, arms reaching up
      return {
        head: { x: 2, y: -49 },
        headRadius: 6.5,
        shoulder: { x: 1, y: -40 },
        hip: { x: -1, y: -22 },
        frontKnee: { x: 9, y: -17 },
        frontFoot: { x: 5, y: -7 },
        backKnee: { x: -5, y: -11 },
        backFoot: { x: -9, y: -2 },
        frontElbow: { x: 8, y: -44 },
        frontHand: { x: 11, y: -52 },
        backElbow: { x: -7, y: -36 },
        backHand: { x: -11, y: -28 },
      };
    }

    if (this.state === 'fall') {
      // Airborne descent: legs ready to land, arms out for balance
      return {
        head: { x: 1, y: -48 },
        headRadius: 6.5,
        shoulder: { x: 0, y: -39 },
        hip: { x: -1, y: -21 },
        frontKnee: { x: 6, y: -11 },
        frontFoot: { x: 7, y: -1 },
        backKnee: { x: -4, y: -12 },
        backFoot: { x: -7, y: -3 },
        frontElbow: { x: 9, y: -42 },
        frontHand: { x: 15, y: -46 },
        backElbow: { x: -9, y: -41 },
        backHand: { x: -15, y: -44 },
      };
    }

    if (this.state === 'run') {
      // Expressive sinusoidal running stride with forward lean
      const s = Math.sin(this.runCycle);
      const c = Math.cos(this.runCycle);
      const bounce = Math.abs(c) * 3.5;

      const hip = { x: 0, y: -22 - bounce };
      const shoulder = { x: 4, y: -39 - bounce };
      const head = { x: 6, y: -48 - bounce };

      // Front & back leg angles
      const legSwing = s * 12;
      const frontFoot = {
        x: hip.x + legSwing,
        y: Math.min(-1, -4 - Math.max(0, c) * 8),
      };
      const frontKnee = {
        x: (hip.x + frontFoot.x) * 0.5 + 4 + Math.max(0, s) * 3,
        y: (hip.y + frontFoot.y) * 0.5 - 2,
      };

      const backFoot = {
        x: hip.x - legSwing,
        y: Math.min(-1, -4 - Math.max(0, -c) * 8),
      };
      const backKnee = {
        x: (hip.x + backFoot.x) * 0.5 + 4 + Math.max(0, -s) * 3,
        y: (hip.y + backFoot.y) * 0.5 - 2,
      };

      // Opposite arm swing
      const armSwing = -s * 10;
      const frontElbow = {
        x: shoulder.x + armSwing * 0.6 - 2,
        y: shoulder.y + 8,
      };
      const frontHand = {
        x: frontElbow.x + 6 + armSwing * 0.4,
        y: frontElbow.y + 3 - Math.max(0, -s) * 5,
      };

      const backElbow = {
        x: shoulder.x - armSwing * 0.6 - 2,
        y: shoulder.y + 8,
      };
      const backHand = {
        x: backElbow.x + 6 - armSwing * 0.4,
        y: backElbow.y + 3 - Math.max(0, s) * 5,
      };

      return {
        head,
        headRadius: 6.5,
        shoulder,
        hip,
        frontKnee,
        frontFoot,
        backKnee,
        backFoot,
        frontElbow,
        frontHand,
        backElbow,
        backHand,
      };
    }

    // Idle / Victory: subtle calm breathing animation
    const breathe = Math.sin(t * 3.2) * 1.4;
    const armSway = Math.sin(t * 3.2) * 1.2;
    return {
      head: { x: 1, y: -48 + breathe },
      headRadius: 6.5,
      shoulder: { x: 0, y: -39 + breathe },
      hip: { x: 0, y: -21 },
      frontKnee: { x: 4, y: -11 },
      frontFoot: { x: 5, y: -1 },
      backKnee: { x: -3, y: -11 },
      backFoot: { x: -5, y: -1 },
      frontElbow: { x: 5, y: -31 + breathe },
      frontHand: { x: 7 + armSway, y: -23 + breathe },
      backElbow: { x: -5, y: -31 + breathe },
      backHand: { x: -6 - armSway, y: -23 + breathe },
    };
  }
}

interface StickPose {
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

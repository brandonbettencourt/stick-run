import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './constants.ts';

export class Camera {
  x = 0;
  y = 0;

  private shakeTime = 0;
  private shakeIntensity = 0;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;

  private levelWidth = VIEWPORT_WIDTH;
  private levelHeight = VIEWPORT_HEIGHT;
  private lockX: number | null = null;

  // Horizontal deadzone boundaries as fractions of viewport width
  private readonly deadzoneLeft = VIEWPORT_WIDTH * 0.3;
  private readonly deadzoneRight = VIEWPORT_WIDTH * 0.44;
  private readonly lookAheadDist = 55;
  private currentLookAhead = 0;

  configure(levelWidth: number, levelHeight: number): void {
    this.levelWidth = Math.max(VIEWPORT_WIDTH, levelWidth);
    this.levelHeight = Math.max(VIEWPORT_HEIGHT, levelHeight);
    this.lockX = null;
  }

  setLockX(x: number | null): void {
    this.lockX = x === null ? null : this.clampX(x);
  }

  snapTo(targetX: number, targetY: number, facing: 1 | -1 = 1): void {
    this.currentLookAhead = facing * this.lookAheadDist;
    this.x =
      this.lockX !== null
        ? this.lockX
        : this.clampX(targetX - VIEWPORT_WIDTH * 0.35 + this.currentLookAhead);
    this.y = this.clampY(targetY - VIEWPORT_HEIGHT * 0.55);
    this.shakeTime = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
  }

  shake(intensity: number, duration: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  update(
    targetCenterX: number,
    targetCenterY: number,
    facing: 1 | -1,
    dt: number
  ): void {
    // Smooth lookahead toward facing direction
    const desiredLookAhead = facing * this.lookAheadDist;
    this.currentLookAhead +=
      (desiredLookAhead - this.currentLookAhead) * Math.min(1, dt * 4.5);

    let desiredX = this.x;
    if (this.lockX !== null) {
      desiredX = this.lockX;
    } else {
      const screenX = targetCenterX + this.currentLookAhead - this.x;
      if (screenX > this.deadzoneRight) {
        desiredX = targetCenterX + this.currentLookAhead - this.deadzoneRight;
      } else if (screenX < this.deadzoneLeft) {
        desiredX = targetCenterX + this.currentLookAhead - this.deadzoneLeft;
      }
      desiredX = this.clampX(desiredX);
    }

    const followRate = 1 - Math.exp(-9 * dt);
    this.x += (desiredX - this.x) * followRate;

    // Subtle vertical follow for levels taller than viewport
    const desiredY = this.clampY(targetCenterY - VIEWPORT_HEIGHT * 0.55);
    this.y += (desiredY - this.y) * (1 - Math.exp(-6 * dt));

    // Screen shake decay
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const factor = this.shakeTime > 0 ? this.shakeIntensity : 0;
      this.shakeOffsetX = (Math.random() * 2 - 1) * factor;
      this.shakeOffsetY = (Math.random() * 2 - 1) * factor;
      this.shakeIntensity *= Math.exp(-10 * dt);
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.shakeIntensity = 0;
    }
  }

  get renderX(): number {
    return Math.round(this.x + this.shakeOffsetX);
  }

  get renderY(): number {
    return Math.round(this.y + this.shakeOffsetY);
  }

  private clampX(x: number): number {
    return Math.max(0, Math.min(this.levelWidth - VIEWPORT_WIDTH, x));
  }

  private clampY(y: number): number {
    return Math.max(0, Math.min(this.levelHeight - VIEWPORT_HEIGHT, y));
  }
}

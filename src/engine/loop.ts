import { FIXED_DT, MAX_FRAME_DT } from './constants.ts';

export class GameLoop {
  private rafId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private running = false;

  constructor(
    private readonly onFixedUpdate: (dt: number) => void,
    private readonly onRender: (alpha: number) => void
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;

    const rawDt = Math.max(0, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const clampedDt = Math.min(rawDt, MAX_FRAME_DT);

    this.accumulator += clampedDt;

    while (this.accumulator >= FIXED_DT) {
      this.onFixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    this.onRender(this.accumulator / FIXED_DT);
    this.rafId = requestAnimationFrame(this.frame);
  };
}

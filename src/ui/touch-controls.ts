import type { InputManager } from '../engine/input.ts';

type MoveDir = 'left' | 'right';

/**
 * Multi-touch dual-thumb controller for mobile & tablet play:
 * - Bottom-left movement pad supports sliding one thumb smoothly between Left and Right.
 * - Bottom-right staggered Slide / Jump buttons track independent pointerIds for true multi-touch.
 * - Automatically shows on coarse-pointer devices or upon first touch input, and hides outside gameplay.
 */
export class TouchControlsController {
  private readonly root: HTMLElement;
  private readonly movePad: HTMLElement;
  private readonly leftBtn: HTMLButtonElement;
  private readonly rightBtn: HTMLButtonElement;
  private readonly slideBtn: HTMLButtonElement;
  private readonly jumpBtn: HTMLButtonElement;

  private readonly movePointers = new Map<number, MoveDir>();
  private readonly slidePointers = new Set<number>();
  private readonly jumpPointers = new Set<number>();

  private touchDetected = false;
  private gameplayActive = false;
  private readonly onTouchModeChangeListeners = new Set<(active: boolean) => void>();

  constructor(private readonly input: InputManager) {
    this.root = this.mustGet('touch-controls');
    this.movePad = this.mustGet('touch-move-pad');
    this.leftBtn = this.mustGet('touch-left-btn') as HTMLButtonElement;
    this.rightBtn = this.mustGet('touch-right-btn') as HTMLButtonElement;
    this.slideBtn = this.mustGet('touch-slide-btn') as HTMLButtonElement;
    this.jumpBtn = this.mustGet('touch-jump-btn') as HTMLButtonElement;

    this.detectTouchCapability();
    this.bindMovePad();
    this.bindActionButton(this.slideBtn, this.slidePointers, 'down');
    this.bindActionButton(this.jumpBtn, this.jumpPointers, 'jump');

    // Prevent long-press context menu on touch controls
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Release any active touches if window loses focus or tab becomes hidden
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });

    this.syncVisibility();
  }

  onTouchModeChange(listener: (active: boolean) => void): () => void {
    this.onTouchModeChangeListeners.add(listener);
    return () => this.onTouchModeChangeListeners.delete(listener);
  }

  isTouchMode(): boolean {
    return this.touchDetected;
  }

  isVisible(): boolean {
    return this.touchDetected && this.gameplayActive;
  }

  setGameplayActive(active: boolean): void {
    if (this.gameplayActive === active) return;
    this.gameplayActive = active;
    if (!active) {
      this.releaseAll();
    }
    this.syncVisibility();
  }

  releaseAll(): void {
    this.movePointers.clear();
    this.slidePointers.clear();
    this.jumpPointers.clear();
    this.leftBtn.classList.remove('is-pressed');
    this.rightBtn.classList.remove('is-pressed');
    this.slideBtn.classList.remove('is-pressed');
    this.jumpBtn.classList.remove('is-pressed');
    this.input.clearVirtualInputs();
  }

  private detectTouchCapability(): void {
    const coarseMedia =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)')
        : null;

    if (coarseMedia?.matches) {
      this.enableTouchMode();
    }

    coarseMedia?.addEventListener?.('change', (e) => {
      if (e.matches) {
        this.enableTouchMode();
      }
    });

    // Also reveal touch controls seamlessly on first touch on hybrid laptops (Chromebook/Surface)
    const onFirstTouch = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        this.enableTouchMode();
        window.removeEventListener('pointerdown', onFirstTouch, { capture: true });
      }
    };
    window.addEventListener('pointerdown', onFirstTouch, { capture: true });
  }

  private enableTouchMode(): void {
    if (this.touchDetected) return;
    this.touchDetected = true;
    document.documentElement.classList.add('has-touch-controls');
    this.syncVisibility();
    for (const listener of this.onTouchModeChangeListeners) {
      listener(true);
    }
  }

  private syncVisibility(): void {
    const visible = this.isVisible();
    this.root.hidden = !visible;
  }

  private resolveMoveDir(e: PointerEvent, preferTarget: boolean): MoveDir {
    if (preferTarget && e.target instanceof Element) {
      const btn = e.target.closest<HTMLElement>('[data-touch-dir]');
      const dir = btn?.dataset.touchDir;
      if (dir === 'left' || dir === 'right') {
        return dir;
      }
    }
    const rect = this.movePad.getBoundingClientRect();
    const midX = rect.left + rect.width * 0.5;
    return e.clientX < midX ? 'left' : 'right';
  }

  private syncMoveState(): void {
    let leftActive = false;
    let rightActive = false;
    for (const dir of this.movePointers.values()) {
      if (dir === 'left') leftActive = true;
      if (dir === 'right') rightActive = true;
    }

    this.input.setVirtualAction('left', leftActive);
    this.input.setVirtualAction('right', rightActive);
    this.leftBtn.classList.toggle('is-pressed', leftActive);
    this.rightBtn.classList.toggle('is-pressed', rightActive);
  }

  private bindMovePad(): void {
    this.movePad.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (e.pointerType === 'touch') this.enableTouchMode();
      try {
        this.movePad.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer cannot be captured (e.g. synthetic events)
      }
      this.movePointers.set(e.pointerId, this.resolveMoveDir(e, true));
      this.syncMoveState();
    });

    this.movePad.addEventListener('pointermove', (e) => {
      if (!this.movePointers.has(e.pointerId)) return;
      e.preventDefault();
      const nextDir = this.resolveMoveDir(e, false);
      if (this.movePointers.get(e.pointerId) !== nextDir) {
        this.movePointers.set(e.pointerId, nextDir);
        this.syncMoveState();
      }
    });

    const releasePointer = (e: PointerEvent) => {
      if (!this.movePointers.has(e.pointerId)) return;
      this.movePointers.delete(e.pointerId);
      if (this.movePad.hasPointerCapture?.(e.pointerId)) {
        try {
          this.movePad.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore release errors
        }
      }
      this.syncMoveState();
    };

    this.movePad.addEventListener('pointerup', releasePointer);
    this.movePad.addEventListener('pointercancel', releasePointer);
    this.movePad.addEventListener('lostpointercapture', releasePointer);
  }

  private bindActionButton(
    btn: HTMLButtonElement,
    activePointers: Set<number>,
    action: 'jump' | 'down'
  ): void {
    const sync = () => {
      const pressed = activePointers.size > 0;
      this.input.setVirtualAction(action, pressed);
      btn.classList.toggle('is-pressed', pressed);
    };

    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (e.pointerType === 'touch') this.enableTouchMode();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer cannot be captured
      }
      activePointers.add(e.pointerId);
      sync();
    });

    const releasePointer = (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.delete(e.pointerId);
      if (btn.hasPointerCapture?.(e.pointerId)) {
        try {
          btn.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore release errors
        }
      }
      sync();
    };

    btn.addEventListener('pointerup', releasePointer);
    btn.addEventListener('pointercancel', releasePointer);
    btn.addEventListener('lostpointercapture', releasePointer);
  }

  private mustGet(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing touch control element #${id}`);
    return el;
  }
}

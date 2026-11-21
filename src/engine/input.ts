export interface InputSnapshot {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
  jumpReleased: boolean;
  downHeld: boolean;
  downPressed: boolean;
  restartPressed: boolean;
  mutePressed: boolean;
}

const PREVENT_DEFAULT_CODES = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
]);

export class InputManager {
  private readonly held = new Set<string>();
  private readonly pressedQueue = new Set<string>();
  private readonly releasedQueue = new Set<string>();

  private readonly onKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onKeyUpBound: (e: KeyboardEvent) => void;
  private readonly onBlurBound: () => void;

  constructor(private readonly target: Window = window) {
    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
    this.onBlurBound = this.handleBlur.bind(this);

    this.target.addEventListener('keydown', this.onKeyDownBound);
    this.target.addEventListener('keyup', this.onKeyUpBound);
    this.target.addEventListener('blur', this.onBlurBound);
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.onKeyDownBound);
    this.target.removeEventListener('keyup', this.onKeyUpBound);
    this.target.removeEventListener('blur', this.onBlurBound);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (PREVENT_DEFAULT_CODES.has(e.code)) {
      // Allow Enter/Space on focused buttons inside dialogs
      const activeTag = document.activeElement?.tagName;
      const inDialog = Boolean(document.activeElement?.closest('dialog[open]'));
      if (!inDialog || (activeTag !== 'BUTTON' && e.code !== 'Space')) {
        e.preventDefault();
      }
    }

    if (!e.repeat && !this.held.has(e.code)) {
      this.pressedQueue.add(e.code);
    }
    this.held.add(e.code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (this.held.has(e.code)) {
      this.releasedQueue.add(e.code);
    }
    this.held.delete(e.code);
  }

  private handleBlur(): void {
    this.held.clear();
    this.pressedQueue.clear();
    this.releasedQueue.clear();
  }

  private isAnyHeld(codes: readonly string[]): boolean {
    for (const c of codes) {
      if (this.held.has(c)) return true;
    }
    return false;
  }

  private isAnyPressed(codes: readonly string[]): boolean {
    for (const c of codes) {
      if (this.pressedQueue.has(c)) return true;
    }
    return false;
  }

  private isAnyReleased(codes: readonly string[]): boolean {
    for (const c of codes) {
      if (this.releasedQueue.has(c)) return true;
    }
    return false;
  }

  /**
   * Read the current input state and consume edge-triggered presses for one fixed tick.
   */
  consumeTick(): InputSnapshot {
    const leftCodes = ['ArrowLeft', 'KeyA'];
    const rightCodes = ['ArrowRight', 'KeyD'];
    const jumpCodes = ['Space', 'ArrowUp', 'KeyW'];
    const downCodes = ['ArrowDown', 'KeyS'];
    const restartCodes = ['KeyR'];
    const muteCodes = ['KeyM'];

    const snapshot: InputSnapshot = {
      left: this.isAnyHeld(leftCodes),
      right: this.isAnyHeld(rightCodes),
      jumpHeld: this.isAnyHeld(jumpCodes),
      jumpPressed: this.isAnyPressed(jumpCodes),
      jumpReleased: this.isAnyReleased(jumpCodes),
      downHeld: this.isAnyHeld(downCodes),
      downPressed: this.isAnyPressed(downCodes),
      restartPressed: this.isAnyPressed(restartCodes),
      mutePressed: this.isAnyPressed(muteCodes),
    };

    this.pressedQueue.clear();
    this.releasedQueue.clear();
    return snapshot;
  }

  /**
   * Clear buffered edge presses (useful on level reset / overlay transitions).
   */
  clearEdges(): void {
    this.pressedQueue.clear();
    this.releasedQueue.clear();
  }
}

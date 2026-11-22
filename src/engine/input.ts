export type VirtualAction = 'left' | 'right' | 'jump' | 'down' | 'restart' | 'mute';

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

  private readonly virtualHeld = new Set<VirtualAction>();
  private readonly virtualPressedQueue = new Set<VirtualAction>();
  private readonly virtualReleasedQueue = new Set<VirtualAction>();

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

  /**
   * Press or release a virtual (touch/on-screen) control action.
   * Feeds the same edge-triggered press/release queues as keyboard events.
   */
  setVirtualAction(action: VirtualAction, active: boolean): void {
    if (active) {
      if (!this.virtualHeld.has(action)) {
        this.virtualPressedQueue.add(action);
      }
      this.virtualHeld.add(action);
    } else {
      if (this.virtualHeld.has(action)) {
        this.virtualReleasedQueue.add(action);
      }
      this.virtualHeld.delete(action);
    }
  }

  /**
   * Fire a one-shot edge-triggered virtual action (e.g. Restart button tap).
   */
  triggerVirtualAction(action: VirtualAction): void {
    this.virtualPressedQueue.add(action);
  }

  /**
   * Release all currently held virtual actions (e.g. when hiding touch controls or changing screens).
   */
  clearVirtualInputs(): void {
    this.virtualHeld.clear();
    this.virtualPressedQueue.clear();
    this.virtualReleasedQueue.clear();
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
    this.clearVirtualInputs();
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
      left: this.isAnyHeld(leftCodes) || this.virtualHeld.has('left'),
      right: this.isAnyHeld(rightCodes) || this.virtualHeld.has('right'),
      jumpHeld: this.isAnyHeld(jumpCodes) || this.virtualHeld.has('jump'),
      jumpPressed: this.isAnyPressed(jumpCodes) || this.virtualPressedQueue.has('jump'),
      jumpReleased: this.isAnyReleased(jumpCodes) || this.virtualReleasedQueue.has('jump'),
      downHeld: this.isAnyHeld(downCodes) || this.virtualHeld.has('down'),
      downPressed: this.isAnyPressed(downCodes) || this.virtualPressedQueue.has('down'),
      restartPressed: this.isAnyPressed(restartCodes) || this.virtualPressedQueue.has('restart'),
      mutePressed: this.isAnyPressed(muteCodes) || this.virtualPressedQueue.has('mute'),
    };

    this.pressedQueue.clear();
    this.releasedQueue.clear();
    this.virtualPressedQueue.clear();
    this.virtualReleasedQueue.clear();
    return snapshot;
  }

  /**
   * Clear buffered edge presses (useful on level reset / overlay transitions).
   */
  clearEdges(): void {
    this.pressedQueue.clear();
    this.releasedQueue.clear();
    this.virtualPressedQueue.clear();
    this.virtualReleasedQueue.clear();
  }
}

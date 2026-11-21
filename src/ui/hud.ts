export interface HudState {
  levelId: number;
  levelCount: number;
  levelName: string;
  levelDeaths: number;
  totalDeaths: number;
  muted: boolean;
}

export class HudController {
  private readonly levelEl: HTMLElement;
  private readonly levelNameEl: HTMLElement;
  private readonly levelDeathsEl: HTMLElement;
  private readonly totalDeathsEl: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;

  constructor(onToggleMute: () => void) {
    this.levelEl = this.mustGet('hud-level');
    this.levelNameEl = this.mustGet('hud-level-name');
    this.levelDeathsEl = this.mustGet('hud-level-deaths');
    this.totalDeathsEl = this.mustGet('hud-total-deaths');
    this.muteBtn = this.mustGet('hud-mute-btn') as HTMLButtonElement;

    this.muteBtn.addEventListener('click', () => {
      onToggleMute();
      // Return focus away from button so Space doesn't accidentally re-click Mute
      this.muteBtn.blur();
    });
  }

  update(state: HudState): void {
    this.levelEl.textContent = `LVL ${state.levelId}/${state.levelCount}`;
    this.levelNameEl.textContent = state.levelName.toUpperCase();
    this.levelDeathsEl.textContent = String(state.levelDeaths);
    this.totalDeathsEl.textContent = String(state.totalDeaths);

    this.muteBtn.setAttribute('aria-pressed', String(state.muted));
    this.muteBtn.textContent = state.muted ? 'MUTED [M]' : 'SFX ON [M]';
    this.muteBtn.classList.toggle('is-muted', state.muted);
  }

  private mustGet(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing HUD element #${id}`);
    return el;
  }
}

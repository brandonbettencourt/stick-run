export interface HudState {
  levelId: number;
  levelCount: number;
  levelName: string;
  levelDeaths: number;
  totalDeaths: number;
  muted: boolean;
  progressPercent: number;
  isTestPlay: boolean;
}

export class HudController {
  private readonly levelEl: HTMLElement;
  private readonly levelNameEl: HTMLElement;
  private readonly levelDeathsEl: HTMLElement;
  private readonly totalDeathsEl: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly editorBtn: HTMLButtonElement;
  private readonly backToEditorBtn: HTMLButtonElement;
  private readonly progressBar: HTMLProgressElement;
  private readonly progressTrack: HTMLElement;
  private readonly progressPctEl: HTMLElement;

  private lastRenderedPct = -1;

  constructor(callbacks: {
    onToggleMute: () => void;
    onOpenEditor: () => void;
    onReturnToEditor: () => void;
  }) {
    this.levelEl = this.mustGet('hud-level');
    this.levelNameEl = this.mustGet('hud-level-name');
    this.levelDeathsEl = this.mustGet('hud-level-deaths');
    this.totalDeathsEl = this.mustGet('hud-total-deaths');
    this.muteBtn = this.mustGet('hud-mute-btn') as HTMLButtonElement;
    this.editorBtn = this.mustGet('hud-editor-btn') as HTMLButtonElement;
    this.backToEditorBtn = this.mustGet('hud-back-editor-btn') as HTMLButtonElement;
    this.progressBar = this.mustGet('hud-progress') as HTMLProgressElement;
    this.progressTrack = this.mustGet('hud-progress-track');
    this.progressPctEl = this.mustGet('hud-progress-pct');

    this.muteBtn.addEventListener('click', () => {
      callbacks.onToggleMute();
      this.muteBtn.blur();
    });

    this.editorBtn.addEventListener('click', () => {
      this.editorBtn.blur();
      callbacks.onOpenEditor();
    });

    this.backToEditorBtn.addEventListener('click', () => {
      this.backToEditorBtn.blur();
      callbacks.onReturnToEditor();
    });
  }

  update(state: HudState): void {
    this.levelEl.textContent = state.isTestPlay
      ? 'TEST PLAY'
      : `LVL ${state.levelId}/${state.levelCount}`;
    this.levelNameEl.textContent = state.levelName.toUpperCase();
    this.levelDeathsEl.textContent = String(state.levelDeaths);
    this.totalDeathsEl.textContent = String(state.totalDeaths);

    this.muteBtn.setAttribute('aria-pressed', String(state.muted));
    this.muteBtn.textContent = state.muted ? 'MUTED [M]' : 'SFX ON [M]';
    this.muteBtn.classList.toggle('is-muted', state.muted);

    this.editorBtn.hidden = state.isTestPlay;
    this.backToEditorBtn.hidden = !state.isTestPlay;

    this.updateProgress(state.progressPercent);
  }

  updateProgress(percent: number): void {
    const clamped = Math.max(0, Math.min(100, percent));
    const rounded = Math.round(clamped);

    this.progressBar.value = clamped;
    this.progressTrack.style.setProperty('--progress-pct', `${clamped.toFixed(1)}%`);

    if (rounded !== this.lastRenderedPct) {
      this.lastRenderedPct = rounded;
      this.progressPctEl.textContent = `${rounded}%`;
    }
  }

  private mustGet(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing HUD element #${id}`);
    return el;
  }
}

import type { BossPhase } from '../entities/boss.ts';

export interface HudBossStatus {
  phase: BossPhase;
  timeRemaining: number;
  survivalDuration: number;
}

export interface HudState {
  levelId: number;
  levelCount: number;
  levelName: string;
  levelDeaths: number;
  totalDeaths: number;
  muted: boolean;
  progressPercent: number;
  isTestPlay: boolean;
  touchMode: boolean;
  boss?: HudBossStatus | null;
}

export class HudController {
  private readonly levelEl: HTMLElement;
  private readonly levelNameEl: HTMLElement;
  private readonly levelDeathsEl: HTMLElement;
  private readonly totalDeathsEl: HTMLElement;
  private readonly restartBtn: HTMLButtonElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly editorBtn: HTMLButtonElement;
  private readonly backToEditorBtn: HTMLButtonElement;
  private readonly progressWrap: HTMLElement;
  private readonly progressBar: HTMLProgressElement;
  private readonly progressTrack: HTMLElement;
  private readonly progressPctEl: HTMLElement;
  private readonly bossStatusLiveEl: HTMLElement;

  private lastRenderedPct = -1;
  private lastBossLabel = '';
  private lastBossPhase: BossPhase | null = null;

  constructor(callbacks: {
    onToggleMute: () => void;
    onRestart: () => void;
    onOpenEditor: () => void;
    onReturnToEditor: () => void;
  }) {
    this.levelEl = this.mustGet('hud-level');
    this.levelNameEl = this.mustGet('hud-level-name');
    this.levelDeathsEl = this.mustGet('hud-level-deaths');
    this.totalDeathsEl = this.mustGet('hud-total-deaths');
    this.restartBtn = this.mustGet('hud-restart-btn') as HTMLButtonElement;
    this.muteBtn = this.mustGet('hud-mute-btn') as HTMLButtonElement;
    this.editorBtn = this.mustGet('hud-editor-btn') as HTMLButtonElement;
    this.backToEditorBtn = this.mustGet('hud-back-editor-btn') as HTMLButtonElement;
    this.progressWrap = this.mustGet('hud-progress-wrap');
    this.progressBar = this.mustGet('hud-progress') as HTMLProgressElement;
    this.progressTrack = this.mustGet('hud-progress-track');
    this.progressPctEl = this.mustGet('hud-progress-pct');
    this.bossStatusLiveEl = this.mustGet('hud-boss-status');

    this.restartBtn.addEventListener('click', () => {
      callbacks.onRestart();
      this.restartBtn.blur();
    });

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
    this.levelEl.classList.toggle('is-boss', Boolean(state.boss));
    this.levelNameEl.textContent = state.levelName.toUpperCase();
    this.levelDeathsEl.textContent = String(state.levelDeaths);
    this.totalDeathsEl.textContent = String(state.totalDeaths);

    this.restartBtn.hidden = !state.touchMode;

    this.muteBtn.setAttribute('aria-pressed', String(state.muted));
    this.muteBtn.textContent = state.muted ? 'MUTED [M]' : 'AUDIO ON [M]';
    this.muteBtn.classList.toggle('is-muted', state.muted);

    this.editorBtn.hidden = state.isTestPlay;
    this.backToEditorBtn.hidden = !state.isTestPlay;

    if (state.boss) {
      this.updateBossTimer(state.boss);
    } else {
      this.clearBossMode();
      this.updateProgress(state.progressPercent);
    }
  }

  private clearBossMode(): void {
    if (this.progressWrap.classList.contains('is-boss-mode')) {
      this.progressWrap.classList.remove(
        'is-boss-mode',
        'is-boss-urgent',
        'is-boss-escape'
      );
      this.progressBar.setAttribute('aria-label', 'Level progress');
      this.lastRenderedPct = -1;
      this.lastBossLabel = '';
      this.lastBossPhase = null;
      this.bossStatusLiveEl.textContent = '';
    }
  }

  updateBossTimer(boss: HudBossStatus): void {
    const duration = Math.max(0.1, boss.survivalDuration);
    const pct =
      boss.phase === 'escape'
        ? 100
        : Math.max(0, Math.min(100, (boss.timeRemaining / duration) * 100));
    const urgent = boss.phase === 'fighting' && boss.timeRemaining <= 5;
    const isEscape = boss.phase === 'escape';

    this.progressWrap.classList.add('is-boss-mode');
    this.progressWrap.classList.toggle('is-boss-urgent', urgent);
    this.progressWrap.classList.toggle('is-boss-escape', isEscape);
    this.progressBar.setAttribute(
      'aria-label',
      isEscape ? 'Exit unlocked, escape under boss' : 'Boss survival countdown'
    );

    this.progressBar.value = pct;
    this.progressTrack.style.setProperty('--progress-pct', `${pct.toFixed(1)}%`);

    const label = isEscape
      ? 'ESCAPE!'
      : `${boss.timeRemaining.toFixed(1)}s`;
    if (label !== this.lastBossLabel) {
      this.lastBossLabel = label;
      this.progressPctEl.textContent = label;
    }

    if (boss.phase !== this.lastBossPhase) {
      this.lastBossPhase = boss.phase;
      if (boss.phase === 'fighting') {
        this.bossStatusLiveEl.textContent = `Boss door locked. Survive ${Math.round(duration)} seconds.`;
      } else if (boss.phase === 'escape') {
        this.bossStatusLiveEl.textContent =
          'Exit door unlocked behind the boss. Run under when he jumps to escape.';
      } else {
        this.bossStatusLiveEl.textContent = '';
      }
    }
  }

  updateProgress(percent: number): void {
    this.clearBossMode();
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

import type { LevelData } from '../levels/types.ts';

export class OverlayController {
  private readonly titleDialog: HTMLDialogElement;
  private readonly titleSubtitleEl: HTMLElement;
  private readonly levelSelectEl: HTMLSelectElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly openEditorBtn: HTMLButtonElement;

  private readonly levelCompleteBanner: HTMLElement;
  private readonly lcTitleEl: HTMLElement;
  private readonly lcSubtitleEl: HTMLElement;
  private readonly lcNextEl: HTMLElement;

  private readonly victoryDialog: HTMLDialogElement;
  private readonly victoryEyebrowEl: HTMLElement;
  private readonly victoryTotalEl: HTMLElement;
  private readonly victoryBreakdownEl: HTMLElement;
  private readonly playAgainBtn: HTMLButtonElement;
  private readonly victoryEditorBtn: HTMLButtonElement;

  constructor(callbacks: {
    onStart: (startLevelIndex: number) => void;
    onPlayAgain: () => void;
    onOpenEditor: () => void;
  }) {
    this.titleDialog = this.mustGet('title-dialog') as HTMLDialogElement;
    this.titleSubtitleEl = this.mustGet('title-subtitle');
    this.levelSelectEl = this.mustGet('title-level-select') as HTMLSelectElement;
    this.startBtn = this.mustGet('start-btn') as HTMLButtonElement;
    this.openEditorBtn = this.mustGet('title-editor-btn') as HTMLButtonElement;

    this.levelCompleteBanner = this.mustGet('level-complete-banner');
    this.lcTitleEl = this.mustGet('lc-title');
    this.lcSubtitleEl = this.mustGet('lc-subtitle');
    this.lcNextEl = this.mustGet('lc-next');

    this.victoryDialog = this.mustGet('victory-dialog') as HTMLDialogElement;
    this.victoryEyebrowEl = this.mustGet('victory-eyebrow');
    this.victoryTotalEl = this.mustGet('victory-total-deaths');
    this.victoryBreakdownEl = this.mustGet('victory-breakdown');
    this.playAgainBtn = this.mustGet('play-again-btn') as HTMLButtonElement;
    this.victoryEditorBtn = this.mustGet('victory-editor-btn') as HTMLButtonElement;

    this.titleDialog.addEventListener('cancel', (e) => {
      e.preventDefault();
    });
    this.victoryDialog.addEventListener('cancel', (e) => {
      e.preventDefault();
    });

    this.startBtn.addEventListener('click', () => {
      const startIndex = Math.max(0, Number(this.levelSelectEl.value) || 0);
      this.closeAll();
      callbacks.onStart(startIndex);
    });

    this.openEditorBtn.addEventListener('click', () => {
      this.closeAll();
      callbacks.onOpenEditor();
    });

    this.playAgainBtn.addEventListener('click', () => {
      this.closeAll();
      callbacks.onPlayAgain();
    });

    this.victoryEditorBtn.addEventListener('click', () => {
      this.closeAll();
      callbacks.onOpenEditor();
    });
  }

  syncPlaylist(levels: readonly LevelData[]): void {
    const prev = this.levelSelectEl.value;
    this.levelSelectEl.replaceChildren();
    levels.forEach((lvl, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      const bossTag = lvl.boss ? ' [BOSS]' : '';
      opt.textContent = `Level ${idx + 1}${bossTag}: ${lvl.name}`;
      this.levelSelectEl.append(opt);
    });
    if (prev && Number(prev) < levels.length) {
      this.levelSelectEl.value = prev;
    } else {
      this.levelSelectEl.value = '0';
    }

    this.titleSubtitleEl.textContent = `Sprint, double-jump, and slide through ${levels.length} neon obstacle courses & boss arenas — or build your own in the Level Editor!`;
  }

  showTitle(levels: readonly LevelData[]): void {
    this.syncPlaylist(levels);
    this.hideLevelComplete();
    if (this.victoryDialog.open) this.victoryDialog.close();
    if (!this.titleDialog.open) {
      this.titleDialog.showModal();
      this.titleDialog.returnValue = '';
    }
  }

  showLevelComplete(
    level: LevelData,
    levelDeaths: number,
    isTestPlay = false
  ): void {
    this.lcTitleEl.textContent = isTestPlay
      ? 'TEST RUN CLEARED!'
      : level.boss
        ? `BOSS ${level.name.toUpperCase()} ESCAPED!`
        : `LEVEL ${level.id} COMPLETE`;
    this.lcSubtitleEl.textContent = `${level.name} — ${levelDeaths} ${levelDeaths === 1 ? 'death' : 'deaths'}`;
    this.lcNextEl.textContent = isTestPlay
      ? 'Returning to Level Editor...'
      : 'Loading next course...';
    this.levelCompleteBanner.hidden = false;
  }

  hideLevelComplete(): void {
    this.levelCompleteBanner.hidden = true;
  }

  showVictory(
    levels: readonly LevelData[],
    deathsByLevel: readonly number[],
    totalDeaths: number
  ): void {
    this.hideLevelComplete();
    if (this.titleDialog.open) this.titleDialog.close();

    this.victoryEyebrowEl.textContent = `ALL ${levels.length} LEVELS CLEARED`;
    this.victoryTotalEl.textContent = String(totalDeaths);
    this.victoryBreakdownEl.replaceChildren();

    levels.forEach((lvl, idx) => {
      const row = document.createElement('li');
      row.className = 'breakdown-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'breakdown-name';
      const bossTag = lvl.boss ? ' [BOSS]' : '';
      nameSpan.textContent = `Level ${idx + 1}${bossTag}: ${lvl.name}`;

      const countSpan = document.createElement('span');
      countSpan.className = 'breakdown-count';
      const deaths = deathsByLevel[idx] ?? 0;
      countSpan.textContent = `${deaths} ${deaths === 1 ? 'death' : 'deaths'}`;

      row.append(nameSpan, countSpan);
      this.victoryBreakdownEl.append(row);
    });

    if (!this.victoryDialog.open) {
      this.victoryDialog.showModal();
      this.victoryDialog.returnValue = '';
    }
  }

  closeAll(): void {
    this.hideLevelComplete();
    if (this.titleDialog.open) {
      this.titleDialog.close();
      this.titleDialog.returnValue = '';
    }
    if (this.victoryDialog.open) {
      this.victoryDialog.close();
      this.victoryDialog.returnValue = '';
    }
  }

  private mustGet(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing overlay element #${id}`);
    return el;
  }
}

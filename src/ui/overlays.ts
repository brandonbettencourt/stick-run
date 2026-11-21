import type { LevelData } from '../levels/types.ts';

export class OverlayController {
  private readonly titleDialog: HTMLDialogElement;
  private readonly startBtn: HTMLButtonElement;

  private readonly levelCompleteBanner: HTMLElement;
  private readonly lcTitleEl: HTMLElement;
  private readonly lcSubtitleEl: HTMLElement;

  private readonly victoryDialog: HTMLDialogElement;
  private readonly victoryTotalEl: HTMLElement;
  private readonly victoryBreakdownEl: HTMLElement;
  private readonly playAgainBtn: HTMLButtonElement;

  constructor(callbacks: {
    onStart: () => void;
    onPlayAgain: () => void;
  }) {
    this.titleDialog = this.mustGet('title-dialog') as HTMLDialogElement;
    this.startBtn = this.mustGet('start-btn') as HTMLButtonElement;

    this.levelCompleteBanner = this.mustGet('level-complete-banner');
    this.lcTitleEl = this.mustGet('lc-title');
    this.lcSubtitleEl = this.mustGet('lc-subtitle');

    this.victoryDialog = this.mustGet('victory-dialog') as HTMLDialogElement;
    this.victoryTotalEl = this.mustGet('victory-total-deaths');
    this.victoryBreakdownEl = this.mustGet('victory-breakdown');
    this.playAgainBtn = this.mustGet('play-again-btn') as HTMLButtonElement;

    // Prevent Escape from closing blocking Title/Victory modals without choosing an action
    // (fallback guard for browsers that do not enforce closedby="none")
    this.titleDialog.addEventListener('cancel', (e) => {
      e.preventDefault();
    });
    this.victoryDialog.addEventListener('cancel', (e) => {
      e.preventDefault();
    });

    this.startBtn.addEventListener('click', () => {
      this.closeAll();
      callbacks.onStart();
    });

    this.playAgainBtn.addEventListener('click', () => {
      this.closeAll();
      callbacks.onPlayAgain();
    });
  }

  showTitle(): void {
    this.hideLevelComplete();
    if (this.victoryDialog.open) this.victoryDialog.close();
    if (!this.titleDialog.open) {
      this.titleDialog.showModal();
      this.titleDialog.returnValue = '';
    }
  }

  showLevelComplete(level: LevelData, levelDeaths: number): void {
    this.lcTitleEl.textContent = `LEVEL ${level.id} COMPLETE`;
    this.lcSubtitleEl.textContent = `${level.name} — ${levelDeaths} ${levelDeaths === 1 ? 'death' : 'deaths'}`;
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

    this.victoryTotalEl.textContent = String(totalDeaths);
    this.victoryBreakdownEl.replaceChildren();

    levels.forEach((lvl, idx) => {
      const row = document.createElement('li');
      row.className = 'breakdown-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'breakdown-name';
      nameSpan.textContent = `Level ${lvl.id}: ${lvl.name}`;

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

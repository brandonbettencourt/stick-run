import type {
  LaserData,
  LevelData,
  LevelHint,
  Rect,
  SpikeData,
  SpikeDirection,
} from '../levels/types.ts';
import {
  LevelPlaylistStore,
  cloneLevelData,
  createStarterLevel,
} from '../levels/store.ts';
import { validateLevel } from '../levels/validator.ts';
import {
  COLORS,
  PLAYER_STAND_HEIGHT,
  PLAYER_WIDTH,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from '../engine/constants.ts';
import { renderLasers, renderSpikes } from '../entities/hazards.ts';
import { renderPortal } from '../entities/portal.ts';

export type EditorTool =
  | 'select'
  | 'solid'
  | 'spike'
  | 'laserStatic'
  | 'laserTimed'
  | 'spawn'
  | 'portal'
  | 'hint';

type Selection =
  | { kind: 'solid'; index: number }
  | { kind: 'spike'; index: number }
  | { kind: 'laser'; index: number }
  | { kind: 'hint'; index: number }
  | { kind: 'spawn' }
  | { kind: 'portal' }
  | null;

type ResizeHandle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'laserA'
  | 'laserB';

type DragOperation =
  | {
      mode: 'move';
      startWorldX: number;
      startWorldY: number;
      snapshot: LevelData;
    }
  | {
      mode: 'resize';
      handle: ResizeHandle;
      startWorldX: number;
      startWorldY: number;
      snapshot: LevelData;
    }
  | {
      mode: 'create';
      tool: EditorTool;
      startWorldX: number;
      startWorldY: number;
      curWorldX: number;
      curWorldY: number;
    }
  | {
      mode: 'pan';
      startScreenX: number;
      startScrollX: number;
    };

const GRID_SIZE = 20;
const HANDLE_RADIUS = 6;

export interface EditorCallbacks {
  onCloseToGame: (levelIndex?: number) => void;
  onTestPlay: (draftLevel: LevelData) => void;
}

export class LevelEditor {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  private readonly nameInput: HTMLInputElement;
  private readonly subtitleInput: HTMLInputElement;
  private readonly widthInput: HTMLInputElement;
  private readonly snapToggle: HTMLInputElement;
  private readonly previewLasersToggle: HTMLInputElement;
  private readonly scrollRange: HTMLInputElement;
  private readonly statusBar: HTMLElement;
  private readonly inspectorBody: HTMLElement;
  private readonly playlistBody: HTMLElement;
  private readonly tabInspectorBtn: HTMLButtonElement;
  private readonly tabPlaylistBtn: HTMLButtonElement;
  private readonly inspectorPanel: HTMLElement;
  private readonly playlistPanel: HTMLElement;
  private readonly insertSelect: HTMLSelectElement;
  private readonly insertBtn: HTMLButtonElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly toastEl: HTMLElement;
  private readonly importInput: HTMLInputElement;

  private isOpen = false;
  private draft: LevelData;
  private editingPlaylistIndex: number | null = 0;

  private activeTool: EditorTool = 'select';
  private selection: Selection = null;
  private drag: DragOperation | null = null;
  private scrollX = 0;
  private snapEnabled = true;
  private previewLasers = true;
  private animTime = 0;
  private rafId: number | null = null;
  private lastRafTime = 0;
  private toastTimer: number | null = null;

  constructor(
    private readonly store: LevelPlaylistStore,
    private readonly callbacks: EditorCallbacks
  ) {
    this.root = this.mustGet('editor-overlay');
    this.canvas = this.mustGet('editor-canvas') as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not acquire editor 2D context');
    this.ctx = ctx;

    this.nameInput = this.mustGet('ed-level-name') as HTMLInputElement;
    this.subtitleInput = this.mustGet('ed-level-subtitle') as HTMLInputElement;
    this.widthInput = this.mustGet('ed-level-width') as HTMLInputElement;
    this.snapToggle = this.mustGet('ed-snap-toggle') as HTMLInputElement;
    this.previewLasersToggle = this.mustGet(
      'ed-preview-lasers'
    ) as HTMLInputElement;
    this.scrollRange = this.mustGet('ed-scroll-range') as HTMLInputElement;
    this.statusBar = this.mustGet('ed-validation-status');
    this.inspectorBody = this.mustGet('ed-inspector-body');
    this.playlistBody = this.mustGet('ed-playlist-list');
    this.tabInspectorBtn = this.mustGet('ed-tab-inspector') as HTMLButtonElement;
    this.tabPlaylistBtn = this.mustGet('ed-tab-playlist') as HTMLButtonElement;
    this.inspectorPanel = this.mustGet('ed-panel-inspector');
    this.playlistPanel = this.mustGet('ed-panel-playlist');
    this.insertSelect = this.mustGet('ed-insert-slot') as HTMLSelectElement;
    this.insertBtn = this.mustGet('ed-insert-btn') as HTMLButtonElement;
    this.saveBtn = this.mustGet('ed-save-btn') as HTMLButtonElement;
    this.toastEl = this.mustGet('ed-toast');
    this.importInput = this.mustGet('ed-import-input') as HTMLInputElement;

    this.draft = cloneLevelData(this.store.getByIndex(0));

    this.bindToolbarEvents();
    this.bindCanvasEvents();
    this.bindKeyboardEvents();

    this.store.onChange(() => {
      if (this.isOpen) {
        this.renderPlaylistUI();
        this.populateInsertOptions();
      }
    });
  }

  get openState(): boolean {
    return this.isOpen;
  }

  getDraftSnapshot(): LevelData {
    return cloneLevelData(this.draft);
  }

  open(levelIndex?: number): void {
    if (levelIndex !== undefined) {
      this.loadPlaylistLevel(levelIndex);
    } else if (this.editingPlaylistIndex === null) {
      this.syncMetadataInputs();
    } else {
      this.loadPlaylistLevel(
        Math.min(this.editingPlaylistIndex, this.store.getCount() - 1)
      );
    }

    this.isOpen = true;
    this.root.hidden = false;
    this.setupCanvasResolution();
    this.populateInsertOptions();
    this.renderPlaylistUI();
    this.renderInspector();
    this.updateValidationBar();
    this.startRenderLoop();
  }

  /** Re-open editor keeping current unsaved draft intact (e.g. returning from Test Play). */
  resumeDraft(): void {
    this.isOpen = true;
    this.root.hidden = false;
    this.setupCanvasResolution();
    this.syncMetadataInputs();
    this.populateInsertOptions();
    this.renderPlaylistUI();
    this.renderInspector();
    this.updateValidationBar();
    this.startRenderLoop();
  }

  close(): void {
    this.isOpen = false;
    this.root.hidden = true;
    this.stopRenderLoop();
  }

  loadPlaylistLevel(index: number): void {
    const clamped = Math.max(0, Math.min(this.store.getCount() - 1, index));
    this.editingPlaylistIndex = clamped;
    this.draft = cloneLevelData(this.store.getByIndex(clamped));
    this.selection = null;
    this.scrollX = 0;
    this.syncMetadataInputs();
    this.renderInspector();
    this.renderPlaylistUI();
    this.updateValidationBar();
  }

  startNewBlankLevel(): void {
    this.editingPlaylistIndex = null;
    this.draft = createStarterLevel(`Gus's Level ${this.store.getCount() + 1}`);
    this.selection = null;
    this.scrollX = 0;
    this.syncMetadataInputs();
    this.renderInspector();
    this.renderPlaylistUI();
    this.updateValidationBar();
    this.showToast('Started a fresh custom level — drag tools to build!');
  }

  private setupCanvasResolution(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = VIEWPORT_WIDTH * dpr;
    this.canvas.height = VIEWPORT_HEIGHT * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private startRenderLoop(): void {
    if (this.rafId !== null) return;
    this.lastRafTime = performance.now();
    const tick = (now: number) => {
      if (!this.isOpen) return;
      const dt = Math.min(0.05, Math.max(0, (now - this.lastRafTime) / 1000));
      this.lastRafTime = now;
      this.animTime += dt;
      this.renderCanvas();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRenderLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private bindToolbarEvents(): void {
    // Back to game
    this.mustGet('ed-back-btn').addEventListener('click', () => {
      this.close();
      this.callbacks.onCloseToGame(this.editingPlaylistIndex ?? 0);
    });

    // Test play current draft
    this.mustGet('ed-test-btn').addEventListener('click', () => {
      this.close();
      this.callbacks.onTestPlay(cloneLevelData(this.draft));
    });

    // Save changes to current playlist slot (or tack onto end if new draft)
    this.saveBtn.addEventListener('click', () => {
      if (this.editingPlaylistIndex !== null) {
        this.store.updateLevel(this.editingPlaylistIndex, this.draft);
        this.showToast(
          `Saved Level ${this.editingPlaylistIndex + 1}: "${this.draft.name}"`
        );
      } else {
        const idx = this.store.insertLevel(this.draft, this.store.getCount());
        this.editingPlaylistIndex = idx;
        this.showToast(`Added "${this.draft.name}" as Level ${idx + 1}!`);
      }
      this.renderPlaylistUI();
      this.populateInsertOptions();
    });

    // Insert custom level at chosen position (e.g., between Level 4 and Level 5!)
    this.insertBtn.addEventListener('click', () => {
      const slot = Number(this.insertSelect.value);
      const insertIndex = Number.isFinite(slot) ? slot : this.store.getCount();
      const inserted = this.store.insertLevel(this.draft, insertIndex);
      this.editingPlaylistIndex = inserted;
      this.draft.id = inserted + 1;
      this.renderPlaylistUI();
      this.populateInsertOptions();
      this.showToast(
        `Inserted "${this.draft.name}" at Level ${inserted + 1}!`
      );
    });

    // New blank level
    this.mustGet('ed-new-btn').addEventListener('click', () => {
      this.startNewBlankLevel();
    });

    // Export JSON
    this.mustGet('ed-export-btn').addEventListener('click', () => {
      const slug = this.draft.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const filename = `level${this.draft.id}-${slug || 'custom'}.json`;
      const blob = new Blob([JSON.stringify(this.draft, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast(`Exported ${filename}`);
    });

    // Import JSON
    this.mustGet('ed-import-btn').addEventListener('click', () => {
      this.importInput.click();
    });
    this.importInput.addEventListener('change', () => {
      const file = this.importInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as LevelData;
          if (!parsed || !Array.isArray(parsed.solids) || !parsed.spawn || !parsed.portal) {
            throw new Error('Invalid level JSON structure');
          }
          this.draft = cloneLevelData(parsed);
          this.editingPlaylistIndex = null;
          this.selection = null;
          this.scrollX = 0;
          this.syncMetadataInputs();
          this.renderInspector();
          this.updateValidationBar();
          this.showToast(`Loaded "${this.draft.name}" — click Insert or Save to add to playlist!`);
        } catch {
          this.showToast('Could not import file — invalid level JSON.');
        } finally {
          this.importInput.value = '';
        }
      };
      reader.readAsText(file);
    });

    // Reset default 10 levels
    this.mustGet('ed-reset-playlist-btn').addEventListener('click', () => {
      this.store.resetToDefaults();
      this.loadPlaylistLevel(0);
      this.showToast('Restored the 10 built-in Stick Run levels.');
    });

    // Metadata inputs
    this.nameInput.addEventListener('input', () => {
      this.draft.name = this.nameInput.value;
      this.updateValidationBar();
    });
    this.subtitleInput.addEventListener('input', () => {
      this.draft.subtitle = this.subtitleInput.value;
    });
    this.widthInput.addEventListener('change', () => {
      const val = Math.max(
        VIEWPORT_WIDTH,
        Math.min(8000, Math.round(Number(this.widthInput.value) || 2400))
      );
      this.draft.width = val;
      this.widthInput.value = String(val);
      this.clampScroll();
      this.syncScrollRange();
      this.updateValidationBar();
    });

    this.snapToggle.addEventListener('change', () => {
      this.snapEnabled = this.snapToggle.checked;
    });
    this.previewLasersToggle.addEventListener('change', () => {
      this.previewLasers = this.previewLasersToggle.checked;
    });

    this.scrollRange.addEventListener('input', () => {
      this.scrollX = Number(this.scrollRange.value) || 0;
    });

    // Pan left/right nudge buttons
    this.mustGet('ed-pan-left').addEventListener('click', () => {
      this.scrollX = Math.max(0, this.scrollX - 320);
      this.syncScrollRange();
    });
    this.mustGet('ed-pan-right').addEventListener('click', () => {
      this.scrollX = Math.min(this.maxScrollX(), this.scrollX + 320);
      this.syncScrollRange();
    });

    // Tool palette buttons
    const toolButtons = this.root.querySelectorAll<HTMLButtonElement>('[data-tool]');
    toolButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool as EditorTool;
        this.setActiveTool(tool);
      });
    });

    // Right sidebar tabs
    this.tabInspectorBtn.addEventListener('click', () => this.switchSidebarTab('inspector'));
    this.tabPlaylistBtn.addEventListener('click', () => this.switchSidebarTab('playlist'));
  }

  private switchSidebarTab(tab: 'inspector' | 'playlist'): void {
    const isInspector = tab === 'inspector';
    this.tabInspectorBtn.classList.toggle('is-active', isInspector);
    this.tabPlaylistBtn.classList.toggle('is-active', !isInspector);
    this.inspectorPanel.hidden = !isInspector;
    this.playlistPanel.hidden = isInspector;
  }

  private setActiveTool(tool: EditorTool): void {
    this.activeTool = tool;
    const toolButtons = this.root.querySelectorAll<HTMLButtonElement>('[data-tool]');
    toolButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.tool === tool);
    });
    this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  }

  private bindKeyboardEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (this.deleteSelection()) {
          e.preventDefault();
        }
      } else if (e.code === 'KeyV') {
        this.setActiveTool('select');
      } else if (e.code === 'KeyB') {
        this.setActiveTool('solid');
      } else if (e.code === 'KeyS') {
        this.setActiveTool('spike');
      } else if (e.code === 'KeyL') {
        this.setActiveTool('laserStatic');
      } else if (e.code === 'KeyT') {
        this.setActiveTool('laserTimed');
      } else if (e.code === 'ArrowRight') {
        this.scrollX = Math.min(this.maxScrollX(), this.scrollX + 160);
        this.syncScrollRange();
      } else if (e.code === 'ArrowLeft') {
        this.scrollX = Math.max(0, this.scrollX - 160);
        this.syncScrollRange();
      }
    });
  }

  private bindCanvasEvents(): void {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.isOpen) return;
      const { screenX, worldX, worldY } = this.pointerToWorld(e);

      // Middle mouse button or Alt+drag pans horizontally
      if (e.button === 1 || e.altKey) {
        this.drag = {
          mode: 'pan',
          startScreenX: screenX,
          startScrollX: this.scrollX,
        };
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }

      if (e.button !== 0) return;

      if (this.activeTool === 'select') {
        // 1. Check resize handles on currently selected object first
        const handle = this.hitTestHandles(worldX, worldY);
        if (handle && this.selection) {
          this.drag = {
            mode: 'resize',
            handle,
            startWorldX: worldX,
            startWorldY: worldY,
            snapshot: cloneLevelData(this.draft),
          };
          this.canvas.setPointerCapture(e.pointerId);
          return;
        }

        // 2. Hit-test entities in reverse draw priority
        const hit = this.hitTestEntity(worldX, worldY);
        this.selection = hit;
        this.renderInspector();
        if (hit) {
          this.switchSidebarTab('inspector');
          this.drag = {
            mode: 'move',
            startWorldX: worldX,
            startWorldY: worldY,
            snapshot: cloneLevelData(this.draft),
          };
          this.canvas.setPointerCapture(e.pointerId);
        }
        return;
      }

      // Placement tools
      if (this.activeTool === 'spawn') {
        this.draft.spawn = {
          x: this.snap(Math.max(0, Math.min(this.draft.width - PLAYER_WIDTH, worldX - PLAYER_WIDTH * 0.5))),
          y: this.snap(Math.max(0, Math.min(VIEWPORT_HEIGHT - PLAYER_STAND_HEIGHT, worldY - PLAYER_STAND_HEIGHT * 0.5))),
        };
        this.selection = { kind: 'spawn' };
        this.setActiveTool('select');
        this.renderInspector();
        this.updateValidationBar();
        return;
      }

      if (this.activeTool === 'portal') {
        this.draft.portal.x = this.snap(
          Math.max(0, Math.min(this.draft.width - this.draft.portal.width, worldX - this.draft.portal.width * 0.5))
        );
        this.draft.portal.y = this.snap(
          Math.max(0, Math.min(VIEWPORT_HEIGHT - this.draft.portal.height, worldY - this.draft.portal.height * 0.5))
        );
        this.selection = { kind: 'portal' };
        this.setActiveTool('select');
        this.renderInspector();
        this.updateValidationBar();
        return;
      }

      if (this.activeTool === 'hint') {
        if (!this.draft.hints) this.draft.hints = [];
        const hint: LevelHint = {
          x: this.snap(Math.max(0, worldX)),
          y: this.snap(Math.max(30, Math.min(VIEWPORT_HEIGHT - 20, worldY))),
          text: 'NEW HINT',
        };
        this.draft.hints.push(hint);
        this.selection = { kind: 'hint', index: this.draft.hints.length - 1 };
        this.setActiveTool('select');
        this.switchSidebarTab('inspector');
        this.renderInspector();
        return;
      }

      // Drag-to-create tools: solid, spike, laserStatic, laserTimed
      const sx = this.snap(Math.max(0, Math.min(this.draft.width, worldX)));
      const sy = this.snap(Math.max(0, Math.min(VIEWPORT_HEIGHT, worldY)));
      this.drag = {
        mode: 'create',
        tool: this.activeTool,
        startWorldX: sx,
        startWorldY: sy,
        curWorldX: sx,
        curWorldY: sy,
      };
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isOpen) return;
      const { screenX, worldX, worldY } = this.pointerToWorld(e);

      if (!this.drag) {
        this.updateHoverCursor(worldX, worldY);
        return;
      }

      if (this.drag.mode === 'pan') {
        const dx = screenX - this.drag.startScreenX;
        this.scrollX = Math.max(
          0,
          Math.min(this.maxScrollX(), this.drag.startScrollX - dx)
        );
        this.syncScrollRange();
        return;
      }

      if (this.drag.mode === 'create') {
        this.drag.curWorldX = this.snap(
          Math.max(0, Math.min(this.draft.width, worldX))
        );
        this.drag.curWorldY = this.snap(
          Math.max(0, Math.min(VIEWPORT_HEIGHT, worldY))
        );
        return;
      }

      if (this.drag.mode === 'move') {
        const dx = worldX - this.drag.startWorldX;
        const dy = worldY - this.drag.startWorldY;
        this.applyMove(dx, dy, this.drag.snapshot);
        this.renderInspector();
        this.updateValidationBar();
        return;
      }

      if (this.drag.mode === 'resize') {
        this.applyResize(
          this.drag.handle,
          worldX,
          worldY,
          this.drag.snapshot
        );
        this.renderInspector();
        this.updateValidationBar();
      }
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.drag) return;
      if (this.drag.mode === 'create') {
        this.finishCreate(this.drag);
      }
      this.drag = null;
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
      this.renderInspector();
      this.updateValidationBar();
    };

    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    // Mouse wheel scrolls horizontally across the level
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.isOpen) return;
        e.preventDefault();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        this.scrollX = Math.max(
          0,
          Math.min(this.maxScrollX(), this.scrollX + delta * 1.1)
        );
        this.syncScrollRange();
      },
      { passive: false }
    );
  }

  private finishCreate(
    op: Extract<DragOperation, { mode: 'create' }>
  ): void {
    const x1 = Math.min(op.startWorldX, op.curWorldX);
    const y1 = Math.min(op.startWorldY, op.curWorldY);
    const w = Math.abs(op.curWorldX - op.startWorldX);
    const h = Math.abs(op.curWorldY - op.startWorldY);

    if (op.tool === 'solid') {
      const rect: Rect =
        w < 16 && h < 16
          ? { x: op.startWorldX, y: op.startWorldY, width: 160, height: 40 }
          : {
              x: x1,
              y: y1,
              width: Math.max(20, w),
              height: Math.max(20, h),
            };
      this.draft.solids.push(rect);
      this.selection = { kind: 'solid', index: this.draft.solids.length - 1 };
      this.switchSidebarTab('inspector');
      return;
    }

    if (op.tool === 'spike') {
      const spike: SpikeData =
        w < 16 && h < 16
          ? {
              x: op.startWorldX,
              y: op.startWorldY - 20,
              width: 48,
              height: 20,
              direction: 'up',
            }
          : {
              x: x1,
              y: y1,
              width: Math.max(20, w),
              height: Math.max(20, h),
              direction: w >= h ? 'up' : 'left',
            };
      this.draft.spikes.push(spike);
      this.selection = { kind: 'spike', index: this.draft.spikes.length - 1 };
      this.switchSidebarTab('inspector');
      return;
    }

    if (op.tool === 'laserStatic' || op.tool === 'laserTimed') {
      const isTimed = op.tool === 'laserTimed';
      let lx1 = op.startWorldX;
      let ly1 = op.startWorldY;
      let lx2 = op.curWorldX;
      let ly2 = op.curWorldY;

      if (Math.hypot(lx2 - lx1, ly2 - ly1) < 20) {
        // Default quick-click laser
        if (isTimed) {
          // Vertical timed laser gate
          lx2 = lx1;
          ly2 = Math.min(VIEWPORT_HEIGHT, ly1 + 160);
        } else {
          // Horizontal static slide-under laser
          lx2 = Math.min(this.draft.width, lx1 + 160);
          ly2 = ly1;
        }
      } else {
        // Snap neatly to horizontal or vertical beam
        if (Math.abs(lx2 - lx1) >= Math.abs(ly2 - ly1)) {
          ly2 = ly1;
        } else {
          lx2 = lx1;
        }
      }

      const laser: LaserData = isTimed
        ? {
            x1: lx1,
            y1: ly1,
            x2: lx2,
            y2: ly2,
            thickness: 8,
            timed: true,
            cyclePeriod: 2.6,
            activeDuration: 1.0,
            phaseOffset: 0,
            warningDuration: 0.45,
          }
        : {
            x1: lx1,
            y1: ly1,
            x2: lx2,
            y2: ly2,
            thickness: 8,
            timed: false,
          };

      this.draft.lasers.push(laser);
      this.selection = { kind: 'laser', index: this.draft.lasers.length - 1 };
      this.switchSidebarTab('inspector');
    }
  }

  private applyMove(dx: number, dy: number, snap: LevelData): void {
    const sel = this.selection;
    if (!sel) return;

    if (sel.kind === 'solid') {
      const orig = snap.solids[sel.index];
      const target = this.draft.solids[sel.index];
      if (!orig || !target) return;
      target.x = this.snap(Math.max(0, Math.min(this.draft.width - orig.width, orig.x + dx)));
      target.y = this.snap(Math.max(0, Math.min(VIEWPORT_HEIGHT + 40, orig.y + dy)));
    } else if (sel.kind === 'spike') {
      const orig = snap.spikes[sel.index];
      const target = this.draft.spikes[sel.index];
      if (!orig || !target) return;
      target.x = this.snap(Math.max(0, Math.min(this.draft.width - orig.width, orig.x + dx)));
      target.y = this.snap(Math.max(0, Math.min(VIEWPORT_HEIGHT - orig.height, orig.y + dy)));
    } else if (sel.kind === 'laser') {
      const orig = snap.lasers[sel.index];
      const target = this.draft.lasers[sel.index];
      if (!orig || !target) return;
      const sdx = this.snap(dx);
      const sdy = this.snap(dy);
      target.x1 = Math.max(0, Math.min(this.draft.width, orig.x1 + sdx));
      target.y1 = Math.max(0, Math.min(VIEWPORT_HEIGHT, orig.y1 + sdy));
      target.x2 = Math.max(0, Math.min(this.draft.width, orig.x2 + sdx));
      target.y2 = Math.max(0, Math.min(VIEWPORT_HEIGHT, orig.y2 + sdy));
    } else if (sel.kind === 'spawn') {
      this.draft.spawn.x = this.snap(
        Math.max(0, Math.min(this.draft.width - PLAYER_WIDTH, snap.spawn.x + dx))
      );
      this.draft.spawn.y = this.snap(
        Math.max(0, Math.min(VIEWPORT_HEIGHT - PLAYER_STAND_HEIGHT, snap.spawn.y + dy))
      );
    } else if (sel.kind === 'portal') {
      this.draft.portal.x = this.snap(
        Math.max(0, Math.min(this.draft.width - snap.portal.width, snap.portal.x + dx))
      );
      this.draft.portal.y = this.snap(
        Math.max(0, Math.min(VIEWPORT_HEIGHT - snap.portal.height, snap.portal.y + dy))
      );
    } else if (sel.kind === 'hint') {
      const orig = snap.hints?.[sel.index];
      const target = this.draft.hints?.[sel.index];
      if (!orig || !target) return;
      target.x = this.snap(Math.max(0, Math.min(this.draft.width - 40, orig.x + dx)));
      target.y = this.snap(Math.max(24, Math.min(VIEWPORT_HEIGHT - 16, orig.y + dy)));
    }
  }

  private applyResize(
    handle: ResizeHandle,
    worldX: number,
    worldY: number,
    snap: LevelData
  ): void {
    const sel = this.selection;
    if (!sel) return;

    if (sel.kind === 'laser') {
      const orig = snap.lasers[sel.index];
      const target = this.draft.lasers[sel.index];
      if (!orig || !target) return;
      const sx = this.snap(Math.max(0, Math.min(this.draft.width, worldX)));
      const sy = this.snap(Math.max(0, Math.min(VIEWPORT_HEIGHT, worldY)));
      if (handle === 'laserA') {
        target.x1 = sx;
        target.y1 = sy;
      } else if (handle === 'laserB') {
        target.x2 = sx;
        target.y2 = sy;
      }
      return;
    }

    const getOrigAndTarget = (): [Rect, Rect] | null => {
      if (sel.kind === 'solid') {
        return [snap.solids[sel.index], this.draft.solids[sel.index]];
      }
      if (sel.kind === 'spike') {
        return [snap.spikes[sel.index], this.draft.spikes[sel.index]];
      }
      if (sel.kind === 'portal') {
        return [snap.portal, this.draft.portal];
      }
      return null;
    };

    const pair = getOrigAndTarget();
    if (!pair) return;
    const [orig, target] = pair;

    const minSize = 20;
    let left = orig.x;
    let top = orig.y;
    let right = orig.x + orig.width;
    let bottom = orig.y + orig.height;

    const sx = this.snap(Math.max(0, Math.min(this.draft.width, worldX)));
    const sy = this.snap(Math.max(0, Math.min(VIEWPORT_HEIGHT + 160, worldY)));

    if (handle.includes('w')) left = Math.min(right - minSize, sx);
    if (handle.includes('e')) right = Math.max(left + minSize, sx);
    if (handle.includes('n')) top = Math.min(bottom - minSize, sy);
    if (handle.includes('s')) bottom = Math.max(top + minSize, sy);

    target.x = left;
    target.y = top;
    target.width = right - left;
    target.height = bottom - top;
  }

  private getSelectedRect(): Rect | null {
    const sel = this.selection;
    if (!sel) return null;
    if (sel.kind === 'solid') return this.draft.solids[sel.index] ?? null;
    if (sel.kind === 'spike') return this.draft.spikes[sel.index] ?? null;
    if (sel.kind === 'portal') return this.draft.portal;
    return null;
  }

  private getHandlesForSelection(): Array<{ handle: ResizeHandle; x: number; y: number }> {
    const sel = this.selection;
    if (!sel) return [];

    if (sel.kind === 'laser') {
      const lz = this.draft.lasers[sel.index];
      if (!lz) return [];
      return [
        { handle: 'laserA', x: lz.x1, y: lz.y1 },
        { handle: 'laserB', x: lz.x2, y: lz.y2 },
      ];
    }

    const r = this.getSelectedRect();
    if (!r) return [];
    const mx = r.x + r.width * 0.5;
    const my = r.y + r.height * 0.5;
    return [
      { handle: 'nw', x: r.x, y: r.y },
      { handle: 'n', x: mx, y: r.y },
      { handle: 'ne', x: r.x + r.width, y: r.y },
      { handle: 'e', x: r.x + r.width, y: my },
      { handle: 'se', x: r.x + r.width, y: r.y + r.height },
      { handle: 's', x: mx, y: r.y + r.height },
      { handle: 'sw', x: r.x, y: r.y + r.height },
      { handle: 'w', x: r.x, y: my },
    ];
  }

  private hitTestHandles(worldX: number, worldY: number): ResizeHandle | null {
    const handles = this.getHandlesForSelection();
    for (const h of handles) {
      if (Math.hypot(worldX - h.x, worldY - h.y) <= HANDLE_RADIUS + 4) {
        return h.handle;
      }
    }
    return null;
  }

  private hitTestEntity(worldX: number, worldY: number): Selection {
    // 1. Spawn
    const sp = this.draft.spawn;
    if (
      worldX >= sp.x - 4 &&
      worldX <= sp.x + PLAYER_WIDTH + 4 &&
      worldY >= sp.y - 4 &&
      worldY <= sp.y + PLAYER_STAND_HEIGHT + 4
    ) {
      return { kind: 'spawn' };
    }

    // 2. Portal
    const p = this.draft.portal;
    if (
      worldX >= p.x &&
      worldX <= p.x + p.width &&
      worldY >= p.y &&
      worldY <= p.y + p.height
    ) {
      return { kind: 'portal' };
    }

    // 3. Lasers (distance to line segment)
    for (let i = this.draft.lasers.length - 1; i >= 0; i--) {
      const lz = this.draft.lasers[i];
      if (pointToSegmentDist(worldX, worldY, lz.x1, lz.y1, lz.x2, lz.y2) <= 12) {
        return { kind: 'laser', index: i };
      }
    }

    // 4. Spikes
    for (let i = this.draft.spikes.length - 1; i >= 0; i--) {
      const s = this.draft.spikes[i];
      if (
        worldX >= s.x &&
        worldX <= s.x + s.width &&
        worldY >= s.y &&
        worldY <= s.y + s.height
      ) {
        return { kind: 'spike', index: i };
      }
    }

    // 5. Hints
    if (this.draft.hints) {
      for (let i = this.draft.hints.length - 1; i >= 0; i--) {
        const h = this.draft.hints[i];
        const approxWidth = Math.max(80, h.text.length * 8.5);
        if (
          worldX >= h.x - 6 &&
          worldX <= h.x + approxWidth &&
          worldY >= h.y - 18 &&
          worldY <= h.y + 8
        ) {
          return { kind: 'hint', index: i };
        }
      }
    }

    // 6. Solids (topmost first)
    for (let i = this.draft.solids.length - 1; i >= 0; i--) {
      const s = this.draft.solids[i];
      if (
        worldX >= s.x &&
        worldX <= s.x + s.width &&
        worldY >= s.y &&
        worldY <= s.y + s.height
      ) {
        return { kind: 'solid', index: i };
      }
    }

    return null;
  }

  private updateHoverCursor(worldX: number, worldY: number): void {
    if (this.activeTool !== 'select') {
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    const handle = this.hitTestHandles(worldX, worldY);
    if (handle) {
      const cursorMap: Record<ResizeHandle, string> = {
        nw: 'nwse-resize',
        se: 'nwse-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize',
        laserA: 'grab',
        laserB: 'grab',
      };
      this.canvas.style.cursor = cursorMap[handle];
      return;
    }

    const hit = this.hitTestEntity(worldX, worldY);
    this.canvas.style.cursor = hit ? 'move' : 'default';
  }

  private deleteSelection(): boolean {
    const sel = this.selection;
    if (!sel) return false;
    if (sel.kind === 'solid') {
      this.draft.solids.splice(sel.index, 1);
    } else if (sel.kind === 'spike') {
      this.draft.spikes.splice(sel.index, 1);
    } else if (sel.kind === 'laser') {
      this.draft.lasers.splice(sel.index, 1);
    } else if (sel.kind === 'hint' && this.draft.hints) {
      this.draft.hints.splice(sel.index, 1);
    } else {
      // Spawn and portal cannot be deleted
      return false;
    }
    this.selection = null;
    this.renderInspector();
    this.updateValidationBar();
    return true;
  }

  private duplicateSelection(): void {
    const sel = this.selection;
    if (!sel) return;
    const offset = 40;
    if (sel.kind === 'solid') {
      const orig = this.draft.solids[sel.index];
      if (!orig) return;
      this.draft.solids.push({ ...orig, x: orig.x + offset });
      this.selection = { kind: 'solid', index: this.draft.solids.length - 1 };
    } else if (sel.kind === 'spike') {
      const orig = this.draft.spikes[sel.index];
      if (!orig) return;
      this.draft.spikes.push({ ...orig, x: orig.x + offset });
      this.selection = { kind: 'spike', index: this.draft.spikes.length - 1 };
    } else if (sel.kind === 'laser') {
      const orig = this.draft.lasers[sel.index];
      if (!orig) return;
      this.draft.lasers.push({
        ...orig,
        x1: orig.x1 + offset,
        x2: orig.x2 + offset,
      });
      this.selection = { kind: 'laser', index: this.draft.lasers.length - 1 };
    } else if (sel.kind === 'hint' && this.draft.hints) {
      const orig = this.draft.hints[sel.index];
      if (!orig) return;
      this.draft.hints.push({ ...orig, x: orig.x + offset, y: orig.y + 24 });
      this.selection = { kind: 'hint', index: this.draft.hints.length - 1 };
    }
    this.renderInspector();
    this.updateValidationBar();
  }

  private renderCanvas(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    // Snap grid lines
    ctx.save();
    const startGridX = Math.floor(this.scrollX / GRID_SIZE) * GRID_SIZE;
    for (let gx = startGridX; gx <= this.scrollX + VIEWPORT_WIDTH; gx += GRID_SIZE) {
      const sx = gx - this.scrollX;
      const isMajor = gx % 100 === 0;
      ctx.strokeStyle = isMajor
        ? 'rgba(56, 189, 248, 0.14)'
        : 'rgba(56, 189, 248, 0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, VIEWPORT_HEIGHT);
      ctx.stroke();

      if (gx % 200 === 0) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(`${gx}`, sx + 4, 13);
      }
    }
    for (let gy = 0; gy <= VIEWPORT_HEIGHT; gy += GRID_SIZE) {
      const isMajor = gy % 100 === 0;
      ctx.strokeStyle = isMajor
        ? 'rgba(56, 189, 248, 0.14)'
        : 'rgba(56, 189, 248, 0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(VIEWPORT_WIDTH, gy);
      ctx.stroke();
    }
    ctx.restore();

    // World space
    ctx.save();
    ctx.translate(-this.scrollX, 0);

    // Level end boundary line
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(this.draft.width, 0);
    ctx.lineTo(this.draft.width, VIEWPORT_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // Hints
    if (this.draft.hints) {
      ctx.save();
      ctx.font = '600 13px ui-monospace, monospace';
      ctx.fillStyle = COLORS.hintText;
      for (const hint of this.draft.hints) {
        ctx.fillText(hint.text, hint.x, hint.y);
      }
      ctx.restore();
    }

    // Solids
    for (const s of this.draft.solids) {
      ctx.fillStyle = COLORS.solidFillTop;
      ctx.fillRect(s.x, s.y, s.width, s.height);
      ctx.strokeStyle = COLORS.solidStroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x + 1, s.y + 1, Math.max(0, s.width - 2), Math.max(0, s.height - 2));
    }

    // Spikes & lasers
    renderSpikes(ctx, this.draft.spikes, this.animTime);
    renderLasers(ctx, this.draft.lasers, this.previewLasers ? this.animTime : 0);

    // Portal
    renderPortal(ctx, this.draft.portal, this.animTime);

    // Spawn indicator (mini neon stick figure silhouette)
    this.renderSpawnMarker(ctx, this.draft.spawn.x, this.draft.spawn.y);

    // Selection outline & resize handles
    this.renderSelectionOverlay(ctx);

    // Live drag-create preview box / line
    if (this.drag?.mode === 'create') {
      this.renderCreatePreview(ctx, this.drag);
    }

    ctx.restore();
  }

  private renderSpawnMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number
  ): void {
    ctx.save();
    ctx.strokeStyle = COLORS.playerGlow;
    ctx.fillStyle = 'rgba(34, 211, 238, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x, y, PLAYER_WIDTH, PLAYER_STAND_HEIGHT);
    ctx.fillRect(x, y, PLAYER_WIDTH, PLAYER_STAND_HEIGHT);
    ctx.setLineDash([]);

    // Simple stick figure inside spawn box
    const cx = x + PLAYER_WIDTH * 0.5;
    const bottom = y + PLAYER_STAND_HEIGHT;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, bottom - 47, 5.5, 0, Math.PI * 2);
    ctx.moveTo(cx, bottom - 41);
    ctx.lineTo(cx, bottom - 20);
    ctx.moveTo(cx - 7, bottom - 32);
    ctx.lineTo(cx + 7, bottom - 32);
    ctx.moveTo(cx, bottom - 20);
    ctx.lineTo(cx - 6, bottom - 2);
    ctx.moveTo(cx, bottom - 20);
    ctx.lineTo(cx + 6, bottom - 2);
    ctx.stroke();

    ctx.fillStyle = COLORS.playerGlow;
    ctx.font = '700 10px ui-monospace, monospace';
    ctx.fillText('SPAWN', x - 4, y - 5);
    ctx.restore();
  }

  private renderSelectionOverlay(ctx: CanvasRenderingContext2D): void {
    const sel = this.selection;
    if (!sel) return;

    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;

    if (sel.kind === 'laser') {
      const lz = this.draft.lasers[sel.index];
      if (lz) {
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(lz.x1, lz.y1);
        ctx.lineTo(lz.x2, lz.y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (sel.kind === 'spawn') {
      ctx.strokeRect(
        this.draft.spawn.x - 3,
        this.draft.spawn.y - 3,
        PLAYER_WIDTH + 6,
        PLAYER_STAND_HEIGHT + 6
      );
    } else if (sel.kind === 'hint' && this.draft.hints?.[sel.index]) {
      const h = this.draft.hints[sel.index];
      ctx.strokeRect(h.x - 4, h.y - 16, Math.max(80, h.text.length * 8.5), 22);
    } else {
      const r = this.getSelectedRect();
      if (r) {
        ctx.strokeRect(r.x - 2, r.y - 2, r.width + 4, r.height + 4);
      }
    }

    // Draw interactive resize / endpoint handles
    const handles = this.getHandlesForSelection();
    for (const h of handles) {
      ctx.fillStyle = '#0d0f1a';
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (h.handle === 'laserA' || h.handle === 'laserB') {
        ctx.arc(h.x, h.y, HANDLE_RADIUS + 1, 0, Math.PI * 2);
      } else {
        ctx.rect(
          h.x - HANDLE_RADIUS * 0.85,
          h.y - HANDLE_RADIUS * 0.85,
          HANDLE_RADIUS * 1.7,
          HANDLE_RADIUS * 1.7
        );
      }
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderCreatePreview(
    ctx: CanvasRenderingContext2D,
    op: Extract<DragOperation, { mode: 'create' }>
  ): void {
    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.fillStyle = 'rgba(250, 204, 21, 0.16)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);

    if (op.tool === 'laserStatic' || op.tool === 'laserTimed') {
      let lx2 = op.curWorldX;
      let ly2 = op.curWorldY;
      if (Math.abs(lx2 - op.startWorldX) >= Math.abs(ly2 - op.startWorldY)) {
        ly2 = op.startWorldY;
      } else {
        lx2 = op.startWorldX;
      }
      ctx.beginPath();
      ctx.moveTo(op.startWorldX, op.startWorldY);
      ctx.lineTo(lx2, ly2);
      ctx.stroke();
    } else {
      const x = Math.min(op.startWorldX, op.curWorldX);
      const y = Math.min(op.startWorldY, op.curWorldY);
      const w = Math.max(20, Math.abs(op.curWorldX - op.startWorldX));
      const h = Math.max(20, Math.abs(op.curWorldY - op.startWorldY));
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }

    ctx.restore();
  }

  private renderInspector(): void {
    const sel = this.selection;
    this.inspectorBody.replaceChildren();

    if (!sel) {
      const empty = document.createElement('p');
      empty.className = 'ed-empty';
      empty.textContent =
        'Click any platform, spike, laser, spawn, or portal on the canvas to move, resize, or inspect it. Or pick a tool on the left to add new components!';
      this.inspectorBody.append(empty);
      return;
    }

    const title = document.createElement('h4');
    title.className = 'ed-insp-title';
    title.textContent =
      sel.kind === 'solid'
        ? `Platform #${sel.index + 1}`
        : sel.kind === 'spike'
          ? `Spikes #${sel.index + 1}`
          : sel.kind === 'laser'
            ? `Laser #${sel.index + 1}`
            : sel.kind === 'hint'
              ? `Hint Text #${sel.index + 1}`
              : sel.kind === 'spawn'
                ? 'Spawn Point'
                : 'Exit Portal';
    this.inspectorBody.append(title);

    const grid = document.createElement('div');
    grid.className = 'ed-insp-grid';

    const addNumberField = (
      label: string,
      value: number,
      step: number,
      onChange: (val: number) => void
    ) => {
      const wrap = document.createElement('label');
      wrap.className = 'ed-field';
      const span = document.createElement('span');
      span.textContent = label;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = String(step);
      input.value = String(value);
      input.addEventListener('change', () => {
        const parsed = Number(input.value);
        if (Number.isFinite(parsed)) {
          onChange(parsed);
          this.updateValidationBar();
        }
      });
      wrap.append(span, input);
      grid.append(wrap);
    };

    if (sel.kind === 'solid' || sel.kind === 'spike' || sel.kind === 'portal') {
      const rect =
        sel.kind === 'solid'
          ? this.draft.solids[sel.index]
          : sel.kind === 'spike'
            ? this.draft.spikes[sel.index]
            : this.draft.portal;

      if (rect) {
        addNumberField('X', rect.x, 10, (v) => (rect.x = Math.max(0, v)));
        addNumberField('Y', rect.y, 10, (v) => (rect.y = v));
        addNumberField('Width', rect.width, 10, (v) => (rect.width = Math.max(20, v)));
        addNumberField('Height', rect.height, 10, (v) => (rect.height = Math.max(20, v)));
      }

      if (sel.kind === 'spike' && this.draft.spikes[sel.index]) {
        const spike = this.draft.spikes[sel.index];
        const wrap = document.createElement('label');
        wrap.className = 'ed-field ed-field--full';
        const span = document.createElement('span');
        span.textContent = 'Direction';
        const select = document.createElement('select');
        (['up', 'down', 'left', 'right'] as SpikeDirection[]).forEach((dir) => {
          const opt = document.createElement('option');
          opt.value = dir;
          opt.textContent = dir.toUpperCase();
          opt.selected = spike.direction === dir;
          select.append(opt);
        });
        select.addEventListener('change', () => {
          spike.direction = select.value as SpikeDirection;
          this.updateValidationBar();
        });
        wrap.append(span, select);
        grid.append(wrap);
      }
    } else if (sel.kind === 'spawn') {
      addNumberField('X', this.draft.spawn.x, 10, (v) => (this.draft.spawn.x = Math.max(0, v)));
      addNumberField('Y', this.draft.spawn.y, 10, (v) => (this.draft.spawn.y = v));
    } else if (sel.kind === 'laser' && this.draft.lasers[sel.index]) {
      const lz = this.draft.lasers[sel.index];
      addNumberField('X1', lz.x1, 10, (v) => (lz.x1 = Math.max(0, v)));
      addNumberField('Y1', lz.y1, 10, (v) => (lz.y1 = v));
      addNumberField('X2', lz.x2, 10, (v) => (lz.x2 = Math.max(0, v)));
      addNumberField('Y2', lz.y2, 10, (v) => (lz.y2 = v));

      const timedWrap = document.createElement('label');
      timedWrap.className = 'ed-check ed-field--full';
      const timedCb = document.createElement('input');
      timedCb.type = 'checkbox';
      timedCb.checked = lz.timed;
      timedCb.addEventListener('change', () => {
        lz.timed = timedCb.checked;
        if (lz.timed) {
          lz.cyclePeriod ??= 2.6;
          lz.activeDuration ??= 1.0;
          lz.warningDuration ??= 0.45;
          lz.phaseOffset ??= 0;
        }
        this.renderInspector();
        this.updateValidationBar();
      });
      const timedLabel = document.createElement('span');
      timedLabel.textContent = 'Timed / Blinking Laser';
      timedWrap.append(timedCb, timedLabel);
      grid.append(timedWrap);

      if (lz.timed) {
        addNumberField('Cycle (s)', lz.cyclePeriod ?? 2.6, 0.1, (v) => (lz.cyclePeriod = Math.max(0.8, v)));
        addNumberField('Active (s)', lz.activeDuration ?? 1.0, 0.1, (v) => (lz.activeDuration = Math.max(0.2, v)));
        addNumberField('Offset (s)', lz.phaseOffset ?? 0, 0.1, (v) => (lz.phaseOffset = v));
        addNumberField('Warn (s)', lz.warningDuration ?? 0.45, 0.05, (v) => (lz.warningDuration = Math.max(0, v)));
      }
    } else if (sel.kind === 'hint' && this.draft.hints?.[sel.index]) {
      const hint = this.draft.hints[sel.index];
      addNumberField('X', hint.x, 10, (v) => (hint.x = Math.max(0, v)));
      addNumberField('Y', hint.y, 10, (v) => (hint.y = v));

      const textWrap = document.createElement('label');
      textWrap.className = 'ed-field ed-field--full';
      const span = document.createElement('span');
      span.textContent = 'Hint Text';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = hint.text;
      input.addEventListener('input', () => {
        hint.text = input.value;
      });
      textWrap.append(span, input);
      grid.append(textWrap);
    }

    this.inspectorBody.append(grid);

    if (sel.kind !== 'spawn' && sel.kind !== 'portal') {
      const actions = document.createElement('div');
      actions.className = 'ed-insp-actions';

      const dupBtn = document.createElement('button');
      dupBtn.type = 'button';
      dupBtn.className = 'ed-mini-btn';
      dupBtn.textContent = 'Duplicate';
      dupBtn.addEventListener('click', () => this.duplicateSelection());

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'ed-mini-btn ed-mini-btn--danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => this.deleteSelection());

      actions.append(dupBtn, delBtn);
      this.inspectorBody.append(actions);
    }
  }

  private renderPlaylistUI(): void {
    const levels = this.store.getLevels();
    this.playlistBody.replaceChildren();

    levels.forEach((lvl, idx) => {
      const row = document.createElement('li');
      row.className = 'ed-playlist-row';
      if (idx === this.editingPlaylistIndex) {
        row.classList.add('is-current');
      }

      const infoBtn = document.createElement('button');
      infoBtn.type = 'button';
      infoBtn.className = 'ed-playlist-load';
      infoBtn.textContent = `${idx + 1}. ${lvl.name}`;
      infoBtn.title = 'Click to edit this level';
      infoBtn.addEventListener('click', () => {
        this.loadPlaylistLevel(idx);
        this.showToast(`Loaded Level ${idx + 1}: "${lvl.name}"`);
      });

      const controls = document.createElement('div');
      controls.className = 'ed-playlist-actions';

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'ed-icon-btn';
      upBtn.textContent = '↑';
      upBtn.title = 'Move earlier in campaign';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => {
        const nextIdx = this.store.moveLevel(idx, idx - 1);
        if (this.editingPlaylistIndex === idx) {
          this.editingPlaylistIndex = nextIdx;
        }
        this.renderPlaylistUI();
        this.populateInsertOptions();
      });

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'ed-icon-btn';
      downBtn.textContent = '↓';
      downBtn.title = 'Move later in campaign';
      downBtn.disabled = idx === levels.length - 1;
      downBtn.addEventListener('click', () => {
        const nextIdx = this.store.moveLevel(idx, idx + 1);
        if (this.editingPlaylistIndex === idx) {
          this.editingPlaylistIndex = nextIdx;
        }
        this.renderPlaylistUI();
        this.populateInsertOptions();
      });

      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'ed-icon-btn ed-icon-btn--play';
      playBtn.textContent = '▶';
      playBtn.title = `Play Level ${idx + 1}`;
      playBtn.addEventListener('click', () => {
        this.close();
        this.callbacks.onCloseToGame(idx);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'ed-icon-btn ed-icon-btn--danger';
      delBtn.textContent = '×';
      delBtn.title = 'Remove from playlist';
      delBtn.disabled = levels.length <= 1;
      delBtn.addEventListener('click', () => {
        this.store.deleteLevel(idx);
        if (this.editingPlaylistIndex !== null) {
          this.editingPlaylistIndex = Math.min(
            this.editingPlaylistIndex,
            this.store.getCount() - 1
          );
        }
        this.renderPlaylistUI();
        this.populateInsertOptions();
      });

      controls.append(upBtn, downBtn, playBtn, delBtn);
      row.append(infoBtn, controls);
      this.playlistBody.append(row);
    });
  }

  private populateInsertOptions(): void {
    const levels = this.store.getLevels();
    const prevValue = this.insertSelect.value;
    this.insertSelect.replaceChildren();

    // Option to tack on at the end (default!)
    const endOpt = document.createElement('option');
    endOpt.value = String(levels.length);
    endOpt.textContent = `At End (as Level ${levels.length + 1})`;
    this.insertSelect.append(endOpt);

    // Option before Level 1
    const startOpt = document.createElement('option');
    startOpt.value = '0';
    startOpt.textContent = `Before Level 1 (${levels[0]?.name ?? ''})`;
    this.insertSelect.append(startOpt);

    // Options between every pair of levels (e.g. Between Level 4 & Level 5!)
    for (let i = 1; i < levels.length; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `Between Level ${i} & Level ${i + 1}`;
      this.insertSelect.append(opt);
    }

    if (prevValue && Number(prevValue) <= levels.length) {
      this.insertSelect.value = prevValue;
    } else {
      this.insertSelect.value = String(levels.length);
    }
  }

  private updateValidationBar(): void {
    const res = validateLevel(this.draft);
    if (res.errors.length === 0) {
      this.statusBar.className = 'ed-status is-valid';
      this.statusBar.textContent = `✓ PLAYABLE — Portal reachable (max gap ${res.stats.maxRequiredGap}px, max climb ${res.stats.maxRequiredClimb}px)`;
    } else {
      this.statusBar.className = 'ed-status is-invalid';
      this.statusBar.textContent = `⚠ ${res.errors[0]}${res.errors.length > 1 ? ` (+${res.errors.length - 1} more)` : ''}`;
    }
  }

  private syncMetadataInputs(): void {
    this.nameInput.value = this.draft.name;
    this.subtitleInput.value = this.draft.subtitle;
    this.widthInput.value = String(this.draft.width);
    this.clampScroll();
    this.syncScrollRange();
  }

  private maxScrollX(): number {
    return Math.max(0, this.draft.width - VIEWPORT_WIDTH);
  }

  private clampScroll(): void {
    this.scrollX = Math.max(0, Math.min(this.maxScrollX(), this.scrollX));
  }

  private syncScrollRange(): void {
    this.scrollRange.max = String(this.maxScrollX());
    this.scrollRange.value = String(Math.round(this.scrollX));
  }

  private pointerToWorld(e: PointerEvent): {
    screenX: number;
    screenY: number;
    worldX: number;
    worldY: number;
  } {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = ((e.clientX - rect.left) / rect.width) * VIEWPORT_WIDTH;
    const screenY = ((e.clientY - rect.top) / rect.height) * VIEWPORT_HEIGHT;
    return {
      screenX,
      screenY,
      worldX: screenX + this.scrollX,
      worldY: screenY,
    };
  }

  private snap(val: number): number {
    return this.snapEnabled ? Math.round(val / GRID_SIZE) * GRID_SIZE : Math.round(val);
  }

  private showToast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true;
    }, 2800);
  }

  private mustGet(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing editor element #${id}`);
    return el;
  }
}

function pointToSegmentDist(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

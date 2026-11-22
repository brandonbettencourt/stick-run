import type { LevelData } from '../levels/types.ts';
import { LevelPlaylistStore, cloneLevelData } from '../levels/store.ts';
import { AudioManager, GAME_MUSIC_URL } from './audio.ts';
import { Camera } from './camera.ts';
import {
  DEATH_DURATION,
  LEVEL_COMPLETE_DURATION,
  PLAYER_WIDTH,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from './constants.ts';
import { InputManager } from './input.ts';
import { GameLoop } from './loop.ts';
import { ParticleSystem } from './particles.ts';
import { SceneRenderer } from './renderer.ts';
import { Player, type PlayerSnapshot } from '../entities/player.ts';
import { checkHazardCollision } from '../entities/hazards.ts';
import { checkPortalCollision } from '../entities/portal.ts';
import { HudController } from '../ui/hud.ts';
import { OverlayController } from '../ui/overlays.ts';
import { LevelEditor } from '../ui/editor.ts';

export type GameScreen =
  | 'title'
  | 'playing'
  | 'levelComplete'
  | 'victory'
  | 'editor';

export interface GameDebugHook {
  readonly screen: GameScreen;
  readonly levelIndex: number;
  readonly levelId: number;
  readonly levelName: string;
  readonly levelCount: number;
  readonly levelDeaths: number;
  readonly totalDeaths: number;
  readonly deathsByLevel: readonly number[];
  readonly progressPercent: number;
  readonly muted: boolean;
  readonly musicUrl: string | null;
  readonly musicActive: boolean;
  readonly player: PlayerSnapshot;
  readonly level: {
    readonly id: number;
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly killY: number;
    readonly spawn: { readonly x: number; readonly y: number };
    readonly portal: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
  };
  loadLevel: (levelNumber: number) => void;
  startGame: () => void;
  openEditor: (levelNumber?: number) => void;
}

declare global {
  interface Window {
    __GAME__?: GameDebugHook;
  }
}

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly store: LevelPlaylistStore;
  private readonly input: InputManager;
  private readonly audio: AudioManager;
  private readonly camera: Camera;
  private readonly particles: ParticleSystem;
  private readonly renderer: SceneRenderer;
  private readonly player: Player;
  private readonly hud: HudController;
  private readonly overlays: OverlayController;
  private readonly editor: LevelEditor;
  private readonly loop: GameLoop;

  private screen: GameScreen = 'title';
  private currentLevelIndex = 0;
  private currentLevel: LevelData;
  private isTestPlay = false;
  private levelTime = 0;

  private deathTimer = 0;
  private levelCompleteTimer = 0;

  private levelDeaths = 0;
  private totalDeaths = 0;
  private deathsByLevel: number[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = context;

    this.store = new LevelPlaylistStore();
    this.currentLevel = this.store.getByIndex(0);
    this.deathsByLevel = this.store.getLevels().map(() => 0);

    this.input = new InputManager();
    this.audio = new AudioManager();
    this.camera = new Camera();
    this.particles = new ParticleSystem();
    this.renderer = new SceneRenderer();
    this.player = new Player();

    this.hud = new HudController({
      onToggleMute: () => {
        this.audio.toggleMute();
        this.syncHud();
      },
      onOpenEditor: () => this.openEditor(this.currentLevelIndex),
      onReturnToEditor: () => this.returnToEditorFromTestPlay(),
    });

    this.overlays = new OverlayController({
      onStart: (startIndex) => this.startNewRun(startIndex),
      onPlayAgain: () => this.startNewRun(0),
      onOpenEditor: () => this.openEditor(this.currentLevelIndex),
    });

    this.editor = new LevelEditor(this.store, {
      onCloseToGame: (levelIndex) => {
        this.isTestPlay = false;
        const idx = Math.max(
          0,
          Math.min(this.store.getCount() - 1, levelIndex ?? this.currentLevelIndex)
        );
        this.deathsByLevel = this.store.getLevels().map((_, i) => this.deathsByLevel[i] ?? 0);
        this.loadLevelInternal(idx, true);
        this.screen = 'playing';
        this.audio.playMusic(GAME_MUSIC_URL);
        this.syncHud();
      },
      onTestPlay: (draftLevel) => {
        this.startTestPlay(draftLevel);
      },
    });

    this.store.onChange(() => {
      this.overlays.syncPlaylist(this.store.getLevels());
      this.deathsByLevel = this.store.getLevels().map((_, i) => this.deathsByLevel[i] ?? 0);
      if (this.currentLevelIndex >= this.store.getCount()) {
        this.currentLevelIndex = Math.max(0, this.store.getCount() - 1);
      }
      if (!this.isTestPlay) {
        this.currentLevel = this.store.getByIndex(this.currentLevelIndex);
      }
      this.syncHud();
    });

    this.audio.onMuteChange(() => this.syncHud());

    this.setupCanvasResolution();
    window.addEventListener('resize', () => this.setupCanvasResolution());

    // Escape returns to editor during Test Play
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isTestPlay && this.screen === 'playing') {
        e.preventDefault();
        this.returnToEditorFromTestPlay();
      }
    });

    this.loadLevelInternal(0, false);
    this.screen = 'title';
    this.overlays.showTitle(this.store.getLevels());
    this.syncHud();
    this.installDebugHook();

    this.loop = new GameLoop(
      (dt) => this.fixedUpdate(dt),
      () => this.render()
    );
    this.loop.start();
  }

  private setupCanvasResolution(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = VIEWPORT_WIDTH * dpr;
    this.canvas.height = VIEWPORT_HEIGHT * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  startNewRun(startLevelIndex = 0): void {
    this.isTestPlay = false;
    this.totalDeaths = 0;
    this.levelDeaths = 0;
    this.deathsByLevel = this.store.getLevels().map(() => 0);
    this.overlays.closeAll();
    this.editor.close();
    const clamped = Math.max(
      0,
      Math.min(this.store.getCount() - 1, startLevelIndex)
    );
    this.loadLevelInternal(clamped, true);
    this.screen = 'playing';
    this.audio.playMusic(GAME_MUSIC_URL);
    this.syncHud();
  }

  loadLevelByNumber(levelNumber: number): void {
    this.isTestPlay = false;
    const clamped = Math.max(
      1,
      Math.min(this.store.getCount(), Math.floor(levelNumber))
    );
    const targetIndex = clamped - 1;
    this.overlays.closeAll();
    this.editor.close();
    this.loadLevelInternal(targetIndex, true);
    this.screen = 'playing';
    this.audio.playMusic(GAME_MUSIC_URL);
    this.syncHud();
  }

  openEditor(levelIndex?: number): void {
    this.isTestPlay = false;
    this.overlays.closeAll();
    this.audio.pauseMusic();
    this.screen = 'editor';
    this.editor.open(levelIndex);
  }

  private startTestPlay(draftLevel: LevelData): void {
    this.isTestPlay = true;
    this.overlays.closeAll();
    this.currentLevel = cloneLevelData(draftLevel);
    this.levelDeaths = 0;
    this.levelTime = 0;
    this.deathTimer = 0;
    this.levelCompleteTimer = 0;
    this.particles.clear();
    this.input.clearEdges();

    this.player.reset(this.currentLevel.spawn);
    this.camera.configure(this.currentLevel.width, this.currentLevel.height);
    const center = this.player.getCenter();
    this.camera.snapTo(center.x, center.y, this.player.facing);

    this.screen = 'playing';
    this.audio.playMusic(GAME_MUSIC_URL);
    this.syncHud();
  }

  private returnToEditorFromTestPlay(): void {
    this.isTestPlay = false;
    this.overlays.closeAll();
    this.audio.pauseMusic();
    this.screen = 'editor';
    this.editor.resumeDraft();
  }

  private loadLevelInternal(index: number, resetLevelDeaths: boolean): void {
    this.currentLevelIndex = index;
    this.currentLevel = this.store.getByIndex(index);
    if (resetLevelDeaths) {
      this.levelDeaths = 0;
    }
    this.levelTime = 0;
    this.deathTimer = 0;
    this.levelCompleteTimer = 0;
    this.particles.clear();
    this.input.clearEdges();

    this.player.reset(this.currentLevel.spawn);
    this.camera.configure(this.currentLevel.width, this.currentLevel.height);
    const center = this.player.getCenter();
    this.camera.snapTo(center.x, center.y, this.player.facing);
  }

  private resetCurrentLevelAfterDeath(): void {
    this.levelTime = 0;
    this.deathTimer = 0;
    this.particles.clear();
    this.input.clearEdges();
    this.player.reset(this.currentLevel.spawn);
    const center = this.player.getCenter();
    this.camera.snapTo(center.x, center.y, this.player.facing);
    this.hud.updateProgress(this.computeProgressPercent());
  }

  private computeProgressPercent(): number {
    if (this.screen === 'levelComplete' || this.screen === 'victory') {
      return 100;
    }
    const spawnCenter = this.currentLevel.spawn.x + PLAYER_WIDTH * 0.5;
    const portalCenter =
      this.currentLevel.portal.x + this.currentLevel.portal.width * 0.5;
    const playerCenter = this.player.x + this.player.width * 0.5;
    const span = portalCenter - spawnCenter;
    if (Math.abs(span) < 1) return 0;
    const ratio = (playerCenter - spawnCenter) / span;
    return Math.max(0, Math.min(100, ratio * 100));
  }

  private triggerDeath(): void {
    if (this.player.state === 'dead') return;
    this.player.kill(this.particles, this.audio);
    this.camera.shake(9, 0.25);
    this.deathTimer = DEATH_DURATION;

    this.levelDeaths += 1;
    if (!this.isTestPlay) {
      this.totalDeaths += 1;
      this.deathsByLevel[this.currentLevelIndex] =
        (this.deathsByLevel[this.currentLevelIndex] ?? 0) + 1;
    }
    this.syncHud();
  }

  private triggerLevelComplete(): void {
    this.player.setVictory();
    const portal = this.currentLevel.portal;
    this.particles.spawnPortalBurst(
      portal.x + portal.width * 0.5,
      portal.y + portal.height * 0.5
    );
    this.audio.playPortal();
    this.camera.shake(4, 0.18);
    this.hud.updateProgress(100);

    if (this.isTestPlay) {
      this.screen = 'levelComplete';
      this.levelCompleteTimer = LEVEL_COMPLETE_DURATION;
      this.overlays.showLevelComplete(this.currentLevel, this.levelDeaths, true);
      return;
    }

    const isLastLevel = this.currentLevelIndex >= this.store.getCount() - 1;
    if (isLastLevel) {
      this.screen = 'victory';
      this.overlays.showVictory(
        this.store.getLevels(),
        this.deathsByLevel,
        this.totalDeaths
      );
    } else {
      this.screen = 'levelComplete';
      this.levelCompleteTimer = LEVEL_COMPLETE_DURATION;
      this.overlays.showLevelComplete(this.currentLevel, this.levelDeaths, false);
    }
  }

  private fixedUpdate(dt: number): void {
    if (this.screen === 'editor') {
      this.input.clearEdges();
      return;
    }

    const input = this.input.consumeTick();

    if (input.mutePressed) {
      this.audio.toggleMute();
    }

    if (this.screen === 'title' || this.screen === 'victory') {
      this.levelTime += dt;
      this.particles.update(dt);
      return;
    }

    if (this.screen === 'levelComplete') {
      this.levelTime += dt;
      this.particles.update(dt);
      this.levelCompleteTimer -= dt;
      if (this.levelCompleteTimer <= 0 || input.jumpPressed) {
        this.overlays.hideLevelComplete();
        if (this.isTestPlay) {
          this.returnToEditorFromTestPlay();
        } else {
          this.loadLevelInternal(this.currentLevelIndex + 1, true);
          this.screen = 'playing';
          this.syncHud();
        }
      }
      return;
    }

    if (input.restartPressed) {
      this.resetCurrentLevelAfterDeath();
      return;
    }

    this.levelTime += dt;
    this.particles.update(dt);

    if (this.player.state === 'dead') {
      this.deathTimer -= dt;
      const center = this.player.getCenter();
      this.camera.update(center.x, center.y, this.player.facing, dt);
      if (this.deathTimer <= 0) {
        this.resetCurrentLevelAfterDeath();
      }
      return;
    }

    this.player.update(
      input,
      dt,
      this.currentLevel.solids,
      this.particles,
      this.audio
    );

    const playerRect = this.player.getRect();

    if (this.player.y > this.currentLevel.killY) {
      this.triggerDeath();
      return;
    }

    if (
      checkHazardCollision(
        playerRect,
        this.currentLevel.spikes,
        this.currentLevel.lasers,
        this.levelTime
      )
    ) {
      this.triggerDeath();
      return;
    }

    if (checkPortalCollision(playerRect, this.currentLevel.portal)) {
      this.triggerLevelComplete();
      return;
    }

    const center = this.player.getCenter();
    this.camera.update(center.x, center.y, this.player.facing, dt);
    this.hud.updateProgress(this.computeProgressPercent());
  }

  private render(): void {
    if (this.screen === 'editor') return;
    this.renderer.render(
      this.ctx,
      this.currentLevel,
      this.player,
      this.camera,
      this.particles,
      this.levelTime
    );
  }

  private syncHud(): void {
    this.hud.update({
      levelId: this.currentLevelIndex + 1,
      levelCount: this.store.getCount(),
      levelName: this.currentLevel.name,
      levelDeaths: this.levelDeaths,
      totalDeaths: this.totalDeaths,
      muted: this.audio.isMuted(),
      progressPercent: this.computeProgressPercent(),
      isTestPlay: this.isTestPlay,
    });
  }

  private installDebugHook(): void {
    const game = this;
    const hook: GameDebugHook = {
      get screen() {
        return game.screen;
      },
      get levelIndex() {
        return game.currentLevelIndex;
      },
      get levelId() {
        return game.currentLevel.id;
      },
      get levelName() {
        return game.currentLevel.name;
      },
      get levelCount() {
        return game.store.getCount();
      },
      get levelDeaths() {
        return game.levelDeaths;
      },
      get totalDeaths() {
        return game.totalDeaths;
      },
      get deathsByLevel() {
        return [...game.deathsByLevel];
      },
      get progressPercent() {
        return Math.round(game.computeProgressPercent());
      },
      get muted() {
        return game.audio.isMuted();
      },
      get musicUrl() {
        return game.audio.getMusicUrl();
      },
      get musicActive() {
        return game.audio.isMusicActive();
      },
      get player() {
        return game.player.getSnapshot();
      },
      get level() {
        const lvl = game.currentLevel;
        return {
          id: lvl.id,
          name: lvl.name,
          width: lvl.width,
          height: lvl.height,
          killY: lvl.killY,
          spawn: { x: lvl.spawn.x, y: lvl.spawn.y },
          portal: { ...lvl.portal },
        };
      },
      loadLevel(n: number) {
        game.loadLevelByNumber(n);
      },
      startGame() {
        game.startNewRun(0);
      },
      openEditor(levelNumber?: number) {
        game.openEditor(
          levelNumber !== undefined ? Math.max(0, levelNumber - 1) : undefined
        );
      },
    };

    window.__GAME__ = hook;
  }
}

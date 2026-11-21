import type { LevelData } from '../levels/types.ts';
import { LEVELS, getLevelByNumber, getLevelCount } from '../levels/index.ts';
import { AudioManager } from './audio.ts';
import { Camera } from './camera.ts';
import {
  DEATH_DURATION,
  LEVEL_COMPLETE_DURATION,
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

export type GameScreen = 'title' | 'playing' | 'levelComplete' | 'victory';

export interface GameDebugHook {
  readonly screen: GameScreen;
  readonly levelIndex: number;
  readonly levelId: number;
  readonly levelName: string;
  readonly levelCount: number;
  readonly levelDeaths: number;
  readonly totalDeaths: number;
  readonly deathsByLevel: readonly number[];
  readonly muted: boolean;
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
}

declare global {
  interface Window {
    __GAME__?: GameDebugHook;
  }
}

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: InputManager;
  private readonly audio: AudioManager;
  private readonly camera: Camera;
  private readonly particles: ParticleSystem;
  private readonly renderer: SceneRenderer;
  private readonly player: Player;
  private readonly hud: HudController;
  private readonly overlays: OverlayController;
  private readonly loop: GameLoop;

  private screen: GameScreen = 'title';
  private currentLevelIndex = 0;
  private currentLevel: LevelData = LEVELS[0];
  private levelTime = 0;

  private deathTimer = 0;
  private levelCompleteTimer = 0;

  private levelDeaths = 0;
  private totalDeaths = 0;
  private deathsByLevel: number[] = LEVELS.map(() => 0);

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = context;

    this.input = new InputManager();
    this.audio = new AudioManager();
    this.camera = new Camera();
    this.particles = new ParticleSystem();
    this.renderer = new SceneRenderer();
    this.player = new Player();

    this.hud = new HudController(() => {
      this.audio.toggleMute();
      this.syncHud();
    });

    this.overlays = new OverlayController({
      onStart: () => this.startNewRun(),
      onPlayAgain: () => this.startNewRun(),
    });

    this.audio.onMuteChange(() => this.syncHud());

    this.setupCanvasResolution();
    window.addEventListener('resize', () => this.setupCanvasResolution());

    this.loadLevelInternal(0, false);
    this.screen = 'title';
    this.overlays.showTitle();
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

  startNewRun(): void {
    this.totalDeaths = 0;
    this.levelDeaths = 0;
    this.deathsByLevel = LEVELS.map(() => 0);
    this.overlays.closeAll();
    this.loadLevelInternal(0, true);
    this.screen = 'playing';
    this.syncHud();
  }

  loadLevelByNumber(levelNumber: number): void {
    const clamped = Math.max(1, Math.min(getLevelCount(), Math.floor(levelNumber)));
    const targetIndex = clamped - 1;
    this.overlays.closeAll();
    this.loadLevelInternal(targetIndex, true);
    this.screen = 'playing';
    this.syncHud();
  }

  private loadLevelInternal(index: number, resetLevelDeaths: boolean): void {
    this.currentLevelIndex = index;
    this.currentLevel = getLevelByNumber(index + 1);
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
  }

  private triggerDeath(): void {
    if (this.player.state === 'dead') return;
    this.player.kill(this.particles, this.audio);
    this.camera.shake(9, 0.25);
    this.deathTimer = DEATH_DURATION;

    this.levelDeaths += 1;
    this.totalDeaths += 1;
    this.deathsByLevel[this.currentLevelIndex] =
      (this.deathsByLevel[this.currentLevelIndex] ?? 0) + 1;
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

    const isLastLevel = this.currentLevelIndex >= getLevelCount() - 1;
    if (isLastLevel) {
      this.screen = 'victory';
      this.overlays.showVictory(LEVELS, this.deathsByLevel, this.totalDeaths);
    } else {
      this.screen = 'levelComplete';
      this.levelCompleteTimer = LEVEL_COMPLETE_DURATION;
      this.overlays.showLevelComplete(this.currentLevel, this.levelDeaths);
    }
  }

  private fixedUpdate(dt: number): void {
    const input = this.input.consumeTick();

    if (input.mutePressed) {
      this.audio.toggleMute();
    }

    // Keep background portal & ambient animations gently alive on title/victory
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
        this.loadLevelInternal(this.currentLevelIndex + 1, true);
        this.screen = 'playing';
        this.syncHud();
      }
      return;
    }

    // Quick restart current level (`R`)
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

    // Check lethal pit threshold
    if (this.player.y > this.currentLevel.killY) {
      this.triggerDeath();
      return;
    }

    // Check spikes & active lasers
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

    // Check portal goal
    if (checkPortalCollision(playerRect, this.currentLevel.portal)) {
      this.triggerLevelComplete();
      return;
    }

    const center = this.player.getCenter();
    this.camera.update(center.x, center.y, this.player.facing, dt);
  }

  private render(): void {
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
      levelId: this.currentLevel.id,
      levelCount: getLevelCount(),
      levelName: this.currentLevel.name,
      levelDeaths: this.levelDeaths,
      totalDeaths: this.totalDeaths,
      muted: this.audio.isMuted(),
    });
  }

  /**
   * Expose lightweight read-only debug/test hook on `window.__GAME__` for Playwright E2E verification.
   */
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
        return getLevelCount();
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
      get muted() {
        return game.audio.isMuted();
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
        game.startNewRun();
      },
    };

    window.__GAME__ = hook;
  }
}

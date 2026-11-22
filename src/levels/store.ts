import type { LevelData } from './types.ts';
import { BUILT_IN_LEVELS } from './index.ts';

const STORAGE_KEY = 'stick-run:playlist:v1';

export function cloneLevelData(level: LevelData): LevelData {
  return {
    id: level.id,
    name: level.name,
    subtitle: level.subtitle,
    width: level.width,
    height: level.height,
    killY: level.killY,
    spawn: { x: level.spawn.x, y: level.spawn.y },
    portal: { ...level.portal },
    solids: level.solids.map((s) => ({ ...s })),
    spikes: level.spikes.map((sp) => ({ ...sp })),
    lasers: level.lasers.map((lz) => ({ ...lz })),
    hints: level.hints ? level.hints.map((h) => ({ ...h })) : [],
    ...(level.boss
      ? {
          boss: {
            ...level.boss,
            arenaBounds: { ...level.boss.arenaBounds },
            entryDoor: { ...level.boss.entryDoor },
            exitDoor: { ...level.boss.exitDoor },
          },
        }
      : {}),
  };
}

export function createStarterLevel(name = 'Custom Course'): LevelData {
  return {
    id: 1,
    name,
    subtitle: 'Custom level created in Stick Run Editor',
    width: 2200,
    height: 540,
    killY: 620,
    spawn: { x: 80, y: 384 },
    portal: { x: 2040, y: 344, width: 44, height: 96 },
    solids: [
      { x: 0, y: 440, width: 700, height: 120 },
      { x: 860, y: 440, width: 520, height: 120 },
      { x: 1540, y: 440, width: 660, height: 120 },
    ],
    spikes: [],
    lasers: [],
    hints: [{ x: 120, y: 300, text: 'CUSTOM LEVEL — GOOD LUCK!' }],
  };
}

/**
 * Manages the active ordered level playlist (built-in 10 levels + any custom or reordered levels).
 * Persists changes to localStorage so Gus can insert custom levels anywhere (e.g. between 4 & 5)
 * or tack them on at the end and keep them across sessions.
 */
export class LevelPlaylistStore {
  private levels: LevelData[] = [];
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.levels = this.loadFromStorage();
    this.renumber();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLevels(): readonly LevelData[] {
    return this.levels;
  }

  getCount(): number {
    return this.levels.length;
  }

  getByIndex(index: number): LevelData {
    const clamped = Math.max(0, Math.min(this.levels.length - 1, index));
    return this.levels[clamped];
  }

  getByNumber(levelNumber: number): LevelData {
    return this.getByIndex(Math.floor(levelNumber) - 1);
  }

  /**
   * Insert a level at any 0-based index (0 = before Level 1, 4 = between Level 4 and Level 5,
   * levels.length = tack on at the end).
   */
  insertLevel(level: LevelData, insertIndex: number): number {
    const clamped = Math.max(0, Math.min(this.levels.length, Math.floor(insertIndex)));
    const copy = cloneLevelData(level);
    this.levels.splice(clamped, 0, copy);
    this.commit();
    return clamped;
  }

  updateLevel(index: number, level: LevelData): void {
    if (index < 0 || index >= this.levels.length) return;
    this.levels[index] = cloneLevelData(level);
    this.commit();
  }

  moveLevel(fromIndex: number, toIndex: number): number {
    if (
      fromIndex < 0 ||
      fromIndex >= this.levels.length ||
      toIndex < 0 ||
      toIndex >= this.levels.length ||
      fromIndex === toIndex
    ) {
      return fromIndex;
    }
    const [item] = this.levels.splice(fromIndex, 1);
    this.levels.splice(toIndex, 0, item);
    this.commit();
    return toIndex;
  }

  deleteLevel(index: number): boolean {
    if (this.levels.length <= 1) return false;
    if (index < 0 || index >= this.levels.length) return false;
    this.levels.splice(index, 1);
    this.commit();
    return true;
  }

  resetToDefaults(): void {
    this.levels = BUILT_IN_LEVELS.map(cloneLevelData);
    this.renumber();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors in restricted contexts
    }
    this.emit();
  }

  private renumber(): void {
    this.levels.forEach((lvl, idx) => {
      lvl.id = idx + 1;
    });
  }

  private commit(): void {
    this.renumber();
    this.saveToStorage();
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private loadFromStorage(): LevelData[] {
    try {
      if (typeof localStorage === 'undefined') {
        return BUILT_IN_LEVELS.map(cloneLevelData);
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return BUILT_IN_LEVELS.map(cloneLevelData);
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return BUILT_IN_LEVELS.map(cloneLevelData);
      }
      const loaded = parsed.map((item) => cloneLevelData(item as LevelData));
      const migrationKey = 'stick-run:migrated-boss-v1';
      if (!localStorage.getItem(migrationKey)) {
        const hasAnyBoss = loaded.some((lvl) => Boolean(lvl.boss));
        if (!hasAnyBoss) {
          for (const builtIn of BUILT_IN_LEVELS) {
            if (builtIn.boss) {
              loaded.push(cloneLevelData(builtIn));
            }
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
        }
        localStorage.setItem(migrationKey, '1');
      }
      return loaded;
    } catch {
      return BUILT_IN_LEVELS.map(cloneLevelData);
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.levels));
    } catch {
      // Ignore storage quota/availability errors
    }
  }
}

import type { LevelData } from './types.ts';
import level1 from './level1.json';
import level2 from './level2.json';
import level3 from './level3.json';
import level4 from './level4.json';
import level5 from './level5.json';
import level6 from './level6.json';
import level7 from './level7.json';
import level8 from './level8.json';
import level9 from './level9.json';
import level10 from './level10.json';

export const BUILT_IN_LEVELS: readonly LevelData[] = [
  level1 as LevelData,
  level2 as LevelData,
  level3 as LevelData,
  level4 as LevelData,
  level5 as LevelData,
  level6 as LevelData,
  level7 as LevelData,
  level8 as LevelData,
  level9 as LevelData,
  level10 as LevelData,
];

/** Backwards-compatible alias for all built-in levels */
export const LEVELS: readonly LevelData[] = BUILT_IN_LEVELS;

export function getLevelCount(): number {
  return BUILT_IN_LEVELS.length;
}

export function getLevelByNumber(levelNumber: number): LevelData {
  const index = Math.max(
    0,
    Math.min(BUILT_IN_LEVELS.length - 1, Math.floor(levelNumber) - 1)
  );
  return BUILT_IN_LEVELS[index];
}

export function getLevelByIndex(index: number): LevelData | null {
  if (index < 0 || index >= BUILT_IN_LEVELS.length) return null;
  return BUILT_IN_LEVELS[index];
}

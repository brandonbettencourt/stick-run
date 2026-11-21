import type { LevelData } from './types.ts';
import level1 from './level1.json';
import level2 from './level2.json';
import level3 from './level3.json';
import level4 from './level4.json';
import level5 from './level5.json';

export const LEVELS: readonly LevelData[] = [
  level1 as LevelData,
  level2 as LevelData,
  level3 as LevelData,
  level4 as LevelData,
  level5 as LevelData,
];

export function getLevelCount(): number {
  return LEVELS.length;
}

/**
 * Retrieve a level by 1-based level number (1..LEVELS.length).
 */
export function getLevelByNumber(levelNumber: number): LevelData {
  const index = Math.max(0, Math.min(LEVELS.length - 1, Math.floor(levelNumber) - 1));
  return LEVELS[index];
}

/**
 * Retrieve a level by 0-based index.
 */
export function getLevelByIndex(index: number): LevelData | null {
  if (index < 0 || index >= LEVELS.length) return null;
  return LEVELS[index];
}

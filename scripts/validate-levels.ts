import { BUILT_IN_LEVELS } from '../src/levels/index.ts';
import {
  VALIDATION_SAFETY_MARGIN,
  validateLevel,
} from '../src/levels/validator.ts';
import {
  maxDoubleJumpHeight,
  maxDoubleJumpHorizontalReach,
} from '../src/engine/constants.ts';

function main(): void {
  console.log('=== Stick Run Level & Physics Validator ===');
  console.log(
    `Physics limits (with ${Math.round(VALIDATION_SAFETY_MARGIN * 100)}% comfort margin): ` +
      `max double-jump climb = ${(maxDoubleJumpHeight() * VALIDATION_SAFETY_MARGIN).toFixed(1)}px, ` +
      `max flat gap = ${(maxDoubleJumpHorizontalReach(0) * VALIDATION_SAFETY_MARGIN).toFixed(1)}px\n`
  );

  let hasErrors = false;

  BUILT_IN_LEVELS.forEach((level, idx) => {
    const result = validateLevel(level, idx + 1);
    const status = result.errors.length === 0 ? 'PASS' : 'FAIL';
    console.log(
      `[${status}] Level ${result.levelId}: ${result.levelName} ` +
        `(width=${result.stats.width}px, solids=${result.stats.solids}, spikes=${result.stats.spikes}, lasers=${result.stats.lasers}, ` +
        `maxGap=${result.stats.maxRequiredGap}px, maxClimb=${result.stats.maxRequiredClimb}px, portalReachable=${result.stats.reachable})`
    );

    for (const w of result.warnings) {
      console.log(`   WARN: ${w}`);
    }
    for (const e of result.errors) {
      console.error(`   ERROR: ${e}`);
      hasErrors = true;
    }
  });

  console.log('');
  if (hasErrors) {
    console.error('Level validation FAILED.');
    process.exit(1);
  }
  console.log(
    `All ${BUILT_IN_LEVELS.length} levels passed schema & physics validation!`
  );
}

main();

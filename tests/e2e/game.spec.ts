import { expect, test, type Page } from '@playwright/test';
import type { GameDebugHook } from '../../src/engine/game.ts';

async function getGame(page: Page) {
  return page.evaluate(() => {
    const g = window.__GAME__ as GameDebugHook | undefined;
    if (!g) throw new Error('window.__GAME__ is not defined');
    return {
      screen: g.screen,
      levelIndex: g.levelIndex,
      levelId: g.levelId,
      levelName: g.levelName,
      levelCount: g.levelCount,
      levelDeaths: g.levelDeaths,
      totalDeaths: g.totalDeaths,
      deathsByLevel: [...g.deathsByLevel],
      muted: g.muted,
      player: { ...g.player },
      level: {
        ...g.level,
        spawn: { ...g.level.spawn },
        portal: { ...g.level.portal },
      },
    };
  });
}

test.describe('Stick Run E2E Playability', () => {
  test('starts cleanly, supports running, jumping, double-jumping, and sliding with hitbox reduction', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await page.goto('/');
    await expect(page.locator('#title-dialog')).toBeVisible();

    // Start run via Start Run button
    await page.getByRole('button', { name: 'START RUN' }).click();
    await expect(page.locator('#title-dialog')).not.toBeVisible();

    const startState = await getGame(page);
    expect(startState.screen).toBe('playing');
    expect(startState.levelId).toBe(1);
    expect(startState.player.height).toBe(56);

    // 1. Run right
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(260);
    const afterRun = await getGame(page);
    expect(afterRun.player.x).toBeGreaterThan(startState.player.x + 35);
    expect(afterRun.player.state).toBe('run');

    // 2. Slide while running (hold ArrowDown while moving fast)
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(100);
    const duringSlide = await getGame(page);
    expect(duringSlide.player.state).toBe('slide');
    expect(duringSlide.player.height).toBe(28); // 50% hitbox reduction!
    await page.keyboard.up('ArrowDown');
    await page.keyboard.up('ArrowRight');

    // Wait for slide to finish and stand back up
    await page.waitForTimeout(350);
    const afterSlide = await getGame(page);
    expect(afterSlide.player.height).toBe(56);

    // 3. Jump & Double Jump
    const beforeJump = await getGame(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(140);
    const midFirstJump = await getGame(page);
    expect(midFirstJump.player.grounded).toBe(false);
    expect(midFirstJump.player.y).toBeLessThan(beforeJump.player.y - 20);
    expect(midFirstJump.player.jumpsRemaining).toBe(1);

    // Trigger mid-air double jump
    await page.keyboard.press('Space');
    await page.waitForTimeout(80);
    const midDoubleJump = await getGame(page);
    expect(midDoubleJump.player.jumpsRemaining).toBe(0);
    expect(midDoubleJump.player.state).toBe('doubleJump');

    // Verify mute toggle (M)
    expect(midDoubleJump.muted).toBe(false);
    await page.keyboard.press('KeyM');
    await page.waitForTimeout(60);
    expect((await getGame(page)).muted).toBe(true);
    await page.keyboard.press('KeyM');
    await page.waitForTimeout(60);
    expect((await getGame(page)).muted).toBe(false);

    expect(errors).toEqual([]);
  });

  test('hitting a hazard increments death counters and resets player to spawn', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await page.goto('/');
    await page.evaluate(() => window.__GAME__?.loadLevel(2));

    const initial = await getGame(page);
    expect(initial.levelId).toBe(2);
    expect(initial.levelDeaths).toBe(0);
    expect(initial.totalDeaths).toBe(0);

    // Run straight right into Pit 1 on Level 2 (ends at x=420) to trigger pit death cleanly
    await page.keyboard.down('ArrowRight');

    await expect
      .poll(async () => (await getGame(page)).totalDeaths, { timeout: 6000 })
      .toBeGreaterThanOrEqual(1);

    await page.keyboard.up('ArrowRight');

    // Wait for ~400ms death shatter animation and automatic respawn at spawn point
    await expect
      .poll(
        async () => {
          const g = await getGame(page);
          return (
            g.player.state !== 'dead' &&
            Math.abs(g.player.x - g.level.spawn.x) < 10 &&
            Math.abs(g.player.y - g.level.spawn.y) < 10
          );
        },
        { timeout: 3000 }
      )
      .toBe(true);

    const afterRespawn = await getGame(page);
    expect(afterRespawn.levelDeaths).toBeGreaterThanOrEqual(1);
    expect(afterRespawn.totalDeaths).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#hud-level-deaths')).toHaveText(
      String(afterRespawn.levelDeaths)
    );
    await expect(page.locator('#hud-total-deaths')).toHaveText(
      String(afterRespawn.totalDeaths)
    );

    expect(errors).toEqual([]);
  });

  test('reaching the Level 1 portal via real keyboard inputs advances to Level 2', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'START RUN' }).click();

    // Navigate Level 1 obstacles using real keyboard controls guided by player position:
    // - Block 1 (x=340): takeoff [260, 325]
    // - Spike 1 (x=590..638): takeoff [520, 575]
    // - Pit 1 (x=780..900): takeoff [715, 775]
    // - Staircase block A (x=1020): takeoff [945, 1005]
    // - Staircase block B (x=1110): takeoff [1035, 1095]
    // - Spike 2 (x=1410..1454): takeoff [1340, 1395]
    // - Pit 2 (x=1560..1700 -> y=400): takeoff [1495, 1555]
    // - Spike 3 (x=1815..1855): takeoff [1745, 1800]
    // - Pit 3 (x=1960..2100): takeoff [1900, 1955]
    // - Final block (x=2230): takeoff [2155, 2215]
    const jumpZones: ReadonlyArray<readonly [number, number]> = [
      [260, 325],
      [520, 575],
      [715, 775],
      [945, 1005],
      [1035, 1095],
      [1340, 1395],
      [1495, 1555],
      [1745, 1800],
      [1900, 1955],
      [2155, 2215],
    ];

    await page.keyboard.down('ArrowRight');

    const startTime = Date.now();
    while (Date.now() - startTime < 15_000) {
      const state = await getGame(page);
      if (state.screen === 'levelComplete' || state.levelId === 2) {
        break;
      }

      const inJumpZone = jumpZones.some(
        ([minX, maxX]) => state.player.x >= minX && state.player.x <= maxX
      );
      const blockedByWall =
        state.player.grounded && state.player.vx === 0 && state.player.x > 120;
      const needMidAirSave =
        !state.player.grounded &&
        state.player.vy > 120 &&
        state.player.y > 370 &&
        state.player.jumpsRemaining > 0;

      if (
        (state.player.grounded && (inJumpZone || blockedByWall)) ||
        needMidAirSave
      ) {
        await page.keyboard.down('Space');
        await page.waitForTimeout(200);
        await page.keyboard.up('Space');
      } else {
        await page.waitForTimeout(20);
      }
    }

    await page.keyboard.up('ArrowRight');

    // Confirm Level 1 completed and automatically advanced to Level 2
    await expect
      .poll(async () => (await getGame(page)).levelId, { timeout: 5000 })
      .toBe(2);

    const level2State = await getGame(page);
    expect(level2State.screen).toBe('playing');
    expect(level2State.levelName).toBe('Skyward Pulse');
    expect(errors).toEqual([]);
  });

  test('all 5 levels load and render cleanly without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await page.goto('/');

    for (let lvl = 1; lvl <= 5; lvl++) {
      await page.evaluate((n) => window.__GAME__?.loadLevel(n), lvl);
      await page.waitForTimeout(120);

      const state = await getGame(page);
      expect(state.levelId).toBe(lvl);
      expect(state.screen).toBe('playing');
      expect(state.player.state).not.toBe('dead');

      // Verify HUD matches loaded level
      await expect(page.locator('#hud-level')).toHaveText(`LVL ${lvl}/5`);

      // Verify canvas rendered non-blank neon graphics
      const hasDrawnPixels = await page.evaluate(() => {
        const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let brightPixels = 0;
        for (let i = 0; i < data.length; i += 4 * 25) {
          // Count pixels visibly brighter than the dark background (#0d0f1a)
          if (data[i] > 40 || data[i + 1] > 40 || data[i + 2] > 60) {
            brightPixels++;
          }
        }
        return brightPixels > 30;
      });
      expect(hasDrawnPixels).toBe(true);
    }

    expect(errors).toEqual([]);
  });
});

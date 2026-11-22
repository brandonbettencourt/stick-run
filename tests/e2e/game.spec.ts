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
      progressPercent: g.progressPercent,
      muted: g.muted,
      musicUrl: g.musicUrl,
      musicActive: g.musicActive,
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
  test('starts cleanly, updates top progress bar, and supports running, jumping, double-jumping, and sliding', async ({
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

    const musicResponsePromise = page.waitForResponse(
      (res) => res.url().includes('velocity_corridor.mp3') && res.status() < 400
    );
    await page.getByRole('button', { name: 'START RUN' }).click();
    await expect(page.locator('#title-dialog')).not.toBeVisible();
    await musicResponsePromise;

    const startState = await getGame(page);
    expect(startState.screen).toBe('playing');
    expect(startState.musicActive).toBe(true);
    expect(startState.musicUrl).toBe('./music/velocity_corridor.mp3');
    expect(startState.levelId).toBe(1);
    expect(startState.levelCount).toBe(10);
    expect(startState.player.height).toBe(56);
    expect(startState.progressPercent).toBe(0);
    await expect(page.locator('#hud-progress-pct')).toHaveText('0%');

    // 1. Run right and verify top progress bar advances toward checkered flag
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(320);
    const afterRun = await getGame(page);
    expect(afterRun.player.x).toBeGreaterThan(startState.player.x + 50);
    expect(afterRun.player.state).toBe('run');
    expect(afterRun.progressPercent).toBeGreaterThan(0);

    const progressVal = await page.locator('#hud-progress').evaluate((el) => {
      return (el as HTMLProgressElement).value;
    });
    expect(progressVal).toBeGreaterThan(0);

    // 2. Slide while running (verify 50% hitbox height reduction)
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(100);
    const duringSlide = await getGame(page);
    expect(duringSlide.player.state).toBe('slide');
    expect(duringSlide.player.height).toBe(28);
    await page.keyboard.up('ArrowDown');
    await page.keyboard.up('ArrowRight');

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

    await page.keyboard.down('ArrowRight');

    await expect
      .poll(async () => (await getGame(page)).totalDeaths, { timeout: 6000 })
      .toBeGreaterThanOrEqual(1);

    await page.keyboard.up('ArrowRight');

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

    await expect
      .poll(async () => (await getGame(page)).levelId, { timeout: 5000 })
      .toBe(2);

    const level2State = await getGame(page);
    expect(level2State.screen).toBe('playing');
    expect(level2State.levelName).toBe('Skyward Pulse');
    expect(errors).toEqual([]);
  });

  test('all 10 built-in levels load and render cleanly without errors', async ({
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

    for (let lvl = 1; lvl <= 10; lvl++) {
      await page.evaluate((n) => window.__GAME__?.loadLevel(n), lvl);
      await page.waitForTimeout(100);

      const state = await getGame(page);
      expect(state.levelId).toBe(lvl);
      expect(state.levelCount).toBe(10);
      expect(state.screen).toBe('playing');
      expect(state.player.state).not.toBe('dead');

      await expect(page.locator('#hud-level')).toHaveText(`LVL ${lvl}/10`);

      const hasDrawnPixels = await page.evaluate(() => {
        const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let brightPixels = 0;
        for (let i = 0; i < data.length; i += 4 * 25) {
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

  test('Visual Level Editor builds a custom level, drags/creates a platform, inserts between Level 4 and 5, and test-plays cleanly', async ({
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
    await page.getByRole('button', { name: 'LEVEL EDITOR' }).click();
    await expect(page.locator('#editor-overlay')).toBeVisible();

    // Start a fresh blank custom level and name it
    await page.getByRole('button', { name: '+ NEW BLANK' }).click();
    await page.locator('#ed-level-name').fill("Gus's Turbo Track");

    // Select Platform tool and drag-create a platform on the editor canvas
    await page.locator('[data-tool="solid"]').click();
    const canvasBox = await page.locator('#editor-canvas').boundingBox();
    expect(canvasBox).not.toBeNull();
    if (canvasBox) {
      await page.mouse.move(canvasBox.x + 260, canvasBox.y + 320);
      await page.mouse.down();
      await page.mouse.move(canvasBox.x + 420, canvasBox.y + 360);
      await page.mouse.up();
    }

    // Inspector should now show the newly created Platform
    await expect(page.locator('.ed-insp-title')).toContainText('Platform');

    // Insert the custom level right between Level 4 and Level 5 (slot index "4")
    await page.locator('#ed-insert-slot').selectOption('4');
    await page.locator('#ed-insert-btn').click();

    // Verify Test Play launches cleanly and returns to editor
    await page.locator('#ed-test-btn').click();
    await expect(page.locator('#editor-overlay')).not.toBeVisible();
    await expect(page.locator('#hud-level')).toHaveText('TEST PLAY');
    await expect(page.locator('#hud-level-name')).toHaveText("GUS'S TURBO TRACK");

    await page.locator('#hud-back-editor-btn').click();
    await expect(page.locator('#editor-overlay')).toBeVisible();

    // Exit editor to game and verify custom level sits at Level 5 of 11!
    await page.locator('#ed-back-btn').click();
    await expect(page.locator('#editor-overlay')).not.toBeVisible();

    const customLevelState = await getGame(page);
    expect(customLevelState.levelCount).toBe(11);
    expect(customLevelState.levelId).toBe(5);
    expect(customLevelState.levelName).toBe("Gus's Turbo Track");

    // Verify original Level 5 ("The Gauntlet") shifted cleanly to Level 6
    await page.evaluate(() => window.__GAME__?.loadLevel(6));
    const shiftedState = await getGame(page);
    expect(shiftedState.levelName).toBe('The Gauntlet');

    expect(errors).toEqual([]);
  });
});

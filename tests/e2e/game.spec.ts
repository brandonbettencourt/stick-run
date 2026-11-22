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
      boss: g.boss ? { ...g.boss, balls: [...g.boss.balls] } : null,
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
    expect(startState.levelCount).toBe(11);
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

  test('all 11 built-in levels load and render cleanly without errors', async ({
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

    for (let lvl = 1; lvl <= 11; lvl++) {
      await page.evaluate((n) => window.__GAME__?.loadLevel(n), lvl);
      await page.waitForTimeout(100);

      const state = await getGame(page);
      expect(state.levelId).toBe(lvl);
      expect(state.levelCount).toBe(11);
      expect(state.screen).toBe('playing');
      expect(state.player.state).not.toBe('dead');

      await expect(page.locator('#hud-level')).toHaveText(`LVL ${lvl}/11`);

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

    // Exit editor to game and verify custom level sits at Level 5 of 12!
    await page.locator('#ed-back-btn').click();
    await expect(page.locator('#editor-overlay')).not.toBeVisible();

    const customLevelState = await getGame(page);
    expect(customLevelState.levelCount).toBe(12);
    expect(customLevelState.levelId).toBe(5);
    expect(customLevelState.levelName).toBe("Gus's Turbo Track");

    // Verify original Level 5 ("The Gauntlet") shifted cleanly to Level 6
    await page.evaluate(() => window.__GAME__?.loadLevel(6));
    const shiftedState = await getGame(page);
    expect(shiftedState.levelName).toBe('The Gauntlet');

    expect(errors).toEqual([]);
  });

  test('Level Editor accurately selects, resizes, moves, and deletes built-in default level features even when letterboxed', async ({
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

    const canvasBox = await page.locator('#editor-canvas').boundingBox();
    expect(canvasBox).not.toBeNull();
    if (!canvasBox) return;

    // Compute exact screen client coordinates for a given 960x540 world point inside the contained canvas
    const targetAspect = 960 / 540;
    const elemAspect = canvasBox.width / canvasBox.height;
    let renderW = canvasBox.width;
    let renderH = canvasBox.height;
    let offsetX = 0;
    let offsetY = 0;
    if (elemAspect > targetAspect) {
      renderH = canvasBox.height;
      renderW = renderH * targetAspect;
      offsetX = (canvasBox.width - renderW) * 0.5;
    } else {
      renderW = canvasBox.width;
      renderH = renderW / targetAspect;
      offsetY = (canvasBox.height - renderH) * 0.5;
    }
    const worldToClient = (wx: number, wy: number) => ({
      x: canvasBox.x + offsetX + (wx / 960) * renderW,
      y: canvasBox.y + offsetY + (wy / 540) * renderH,
    });

    // 1. Select built-in Level 1 spike { x: 590, y: 420, width: 48, height: 20 }
    const spikeCenter = worldToClient(614, 430);
    await page.mouse.click(spikeCenter.x, spikeCenter.y);
    await expect(page.locator('.ed-insp-title')).toHaveText('Spikes #1');

    // Drag-move the compact 20px-tall spike from its center (not swallowed by resize handles)
    const spikeDest = worldToClient(514, 430);
    await page.mouse.move(spikeCenter.x, spikeCenter.y);
    await page.mouse.down();
    await page.mouse.move(spikeDest.x, spikeDest.y);
    await page.mouse.up();
    const spikeXInput = page.locator('#ed-inspector-body label:has-text("X") input').first();
    expect(Number(await spikeXInput.inputValue())).toBeLessThan(550);

    // Delete the built-in spike via Delete button
    await page.locator('#ed-inspector-body').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.ed-insp-title')).toHaveCount(0);

    // 2. Select built-in default floor { x: 0, y: 440, width: 780, height: 120 } (extends below y=540)
    const floorPt = worldToClient(200, 490);
    await page.mouse.click(floorPt.x, floorPt.y);
    await expect(page.locator('.ed-insp-title')).toHaveText('Platform #1');

    // Grab its bottom resize handle (clamped at y=533) and drag up to y=480 to resize height
    const bottomHandle = worldToClient(394.5, 533);
    const resizeTarget = worldToClient(394.5, 480);
    await page.mouse.move(bottomHandle.x, bottomHandle.y);
    await page.mouse.down();
    await page.mouse.move(resizeTarget.x, resizeTarget.y);
    await page.mouse.up();
    const floorHeightInput = page
      .locator('#ed-inspector-body label:has-text("Height") input')
      .first();
    expect(Number(await floorHeightInput.inputValue())).toBe(40);

    // 3. Select built-in step platform { x: 340, y: 380, width: 80, height: 60 } and remove with Delete key
    const stepPt = worldToClient(380, 410);
    await page.mouse.click(stepPt.x, stepPt.y);
    await expect(page.locator('.ed-insp-title')).toHaveText('Platform #2');
    await page.keyboard.press('Delete');
    await expect(page.locator('.ed-insp-title')).toHaveCount(0);

    // 4. Select built-in hint { x: 90, y: 310, text: "A / D or ARROWS to Run" } and delete it
    const hintPt = worldToClient(140, 305);
    await page.mouse.click(hintPt.x, hintPt.y);
    await expect(page.locator('.ed-insp-title')).toHaveText('Hint Text #1');
    await page.keyboard.press('Delete');
    await expect(page.locator('.ed-insp-title')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('Touch controls stay hidden on desktop, appear on touch input, support multi-touch run+slide+double-jump, and hide in Level Editor', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    await expect(page.locator('#touch-controls')).toBeHidden();

    // Start run on desktop pointer — touch controls remain hidden until touch input occurs
    await page.getByRole('button', { name: 'START RUN' }).click();
    await expect(page.locator('#touch-controls')).toBeHidden();
    await expect(page.locator('#hud-restart-btn')).toBeHidden();

    // First touch pointerdown reveals touch controls + HUD restart button
    await page.evaluate(() => {
      window.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'touch',
        })
      );
    });
    await expect(page.locator('#touch-controls')).toBeVisible();
    await expect(page.locator('#hud-restart-btn')).toBeVisible();

    const startState = await getGame(page);

    // Multi-touch: hold Right with pointerId=10, then hold Slide with pointerId=11
    await page.evaluate(() => {
      const rightBtn = document.getElementById('touch-right-btn')!;
      const r = rightBtn.getBoundingClientRect();
      rightBtn.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 10,
          pointerType: 'touch',
          clientX: r.left + r.width * 0.5,
          clientY: r.top + r.height * 0.5,
        })
      );
    });
    await page.waitForTimeout(260);
    const afterTouchRun = await getGame(page);
    expect(afterTouchRun.player.x).toBeGreaterThan(startState.player.x + 35);
    expect(afterTouchRun.player.state).toBe('run');

    // Simultaneously press Slide (pointerId=11) while Right (pointerId=10) stays held
    await page.evaluate(() => {
      const slideBtn = document.getElementById('touch-slide-btn')!;
      const r = slideBtn.getBoundingClientRect();
      slideBtn.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 11,
          pointerType: 'touch',
          clientX: r.left + r.width * 0.5,
          clientY: r.top + r.height * 0.5,
        })
      );
    });
    await page.waitForTimeout(100);
    const duringTouchSlide = await getGame(page);
    expect(duringTouchSlide.player.state).toBe('slide');
    expect(duringTouchSlide.player.height).toBe(28);

    // Release Slide and Right, then test thumb-slide across move pad + Jump & Double Jump
    await page.evaluate(() => {
      const slideBtn = document.getElementById('touch-slide-btn')!;
      const movePad = document.getElementById('touch-move-pad')!;
      slideBtn.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 11,
          pointerType: 'touch',
        })
      );
      // Slide thumb from right to left side of movePad without lifting pointerId=10
      const padRect = movePad.getBoundingClientRect();
      movePad.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          pointerId: 10,
          pointerType: 'touch',
          clientX: padRect.left + padRect.width * 0.2,
          clientY: padRect.top + padRect.height * 0.5,
        })
      );
    });
    await page.waitForTimeout(140);
    await page.evaluate(() => {
      const movePad = document.getElementById('touch-move-pad')!;
      movePad.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 10,
          pointerType: 'touch',
        })
      );
    });
    await page.waitForTimeout(260);

    // Tap Jump twice for Jump + Double Jump
    await page.evaluate(() => {
      const jumpBtn = document.getElementById('touch-jump-btn')!;
      jumpBtn.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 12,
          pointerType: 'touch',
        })
      );
    });
    await page.waitForTimeout(110);
    const firstTouchJump = await getGame(page);
    expect(firstTouchJump.player.grounded).toBe(false);
    expect(firstTouchJump.player.jumpsRemaining).toBe(1);

    await page.evaluate(() => {
      const jumpBtn = document.getElementById('touch-jump-btn')!;
      jumpBtn.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 12,
          pointerType: 'touch',
        })
      );
      jumpBtn.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 13,
          pointerType: 'touch',
        })
      );
    });
    await page.waitForTimeout(80);
    const doubleTouchJump = await getGame(page);
    expect(doubleTouchJump.player.jumpsRemaining).toBe(0);
    expect(doubleTouchJump.player.state).toBe('doubleJump');

    await page.evaluate(() => {
      const jumpBtn = document.getElementById('touch-jump-btn')!;
      jumpBtn.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 13,
          pointerType: 'touch',
        })
      );
    });

    // Verify Safari double-tap-to-zoom events (touchstart/touchend/dblclick) are prevented on Jump
    const zoomPrevented = await page.evaluate(() => {
      const jumpBtn = document.getElementById('touch-jump-btn')!;
      const ts = new Event('touchstart', { bubbles: true, cancelable: true });
      const te = new Event('touchend', { bubbles: true, cancelable: true });
      const dc = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
      jumpBtn.dispatchEvent(ts);
      jumpBtn.dispatchEvent(te);
      jumpBtn.dispatchEvent(dc);
      return ts.defaultPrevented && te.defaultPrevented && dc.defaultPrevented;
    });
    expect(zoomPrevented).toBe(true);

    // HUD Restart button resets player back to spawn
    await page.locator('#hud-restart-btn').click();
    await page.waitForTimeout(80);
    const afterRestart = await getGame(page);
    expect(Math.abs(afterRestart.player.x - afterRestart.level.spawn.x)).toBeLessThan(10);

    // Opening Level Editor hides touch controls; returning to game shows them again
    await page.locator('#hud-editor-btn').click();
    await expect(page.locator('#editor-overlay')).toBeVisible();
    await expect(page.locator('#touch-controls')).toBeHidden();

    await page.locator('#ed-back-btn').click();
    await expect(page.locator('#touch-controls')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Level 11 Boss Arena slams entry door, runs 30s countdown, jumps & throws bouncing laser balls, unlocks exit at 0s, and lets player run under boss to win', async ({
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
    await page.evaluate(() => window.__GAME__?.loadLevel(11));

    const initial = await getGame(page);
    expect(initial.levelId).toBe(11);
    expect(initial.levelName).toBe('Crimson Titan');
    expect(initial.boss).not.toBeNull();
    expect(initial.boss!.phase).toBe('waiting');
    expect(initial.boss!.entryDoorClosed).toBe(false);
    expect(initial.boss!.exitDoorOpen).toBe(false);
    expect(initial.boss!.survivalDuration).toBe(30);
    // Boss is ~3x the 56px tall player
    expect(initial.boss!.height).toBeGreaterThanOrEqual(150);
    await expect(page.locator('#hud-progress-pct')).toHaveText('30.0s');

    const bossFixedX = initial.boss!.x;

    // 1. Walk from bottom-left vestibule into the arena so entry door slams shut
    await page.keyboard.down('ArrowRight');
    await expect
      .poll(async () => (await getGame(page)).boss?.phase, { timeout: 4000 })
      .toBe('fighting');
    await page.keyboard.up('ArrowRight');

    const fightingStart = await getGame(page);
    expect(fightingStart.boss!.entryDoorClosed).toBe(true);
    expect(fightingStart.boss!.exitDoorOpen).toBe(false);

    // 2. Verify locked entry door blocks player from leaving back to the left
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(450);
    await page.keyboard.up('ArrowLeft');
    const againstLeftDoor = await getGame(page);
    expect(againstLeftDoor.player.x).toBeGreaterThanOrEqual(122);

    // 3. Observe boss jumping in place, throwing laser balls, and balls bouncing off walls
    // Dodge (double-jump / move) so aimed balls sail past us and bounce off the arena walls!
    await expect
      .poll(
        async () => {
          const g = await getGame(page);
          if (g.boss?.phase === 'waiting') {
            await page.keyboard.down('ArrowRight');
            await page.waitForTimeout(480);
            await page.keyboard.up('ArrowRight');
            return false;
          }
          // Jump over any incoming laser ball so it bounces off the left wall behind us
          const incomingBall = g.boss?.balls.find(
            (b) =>
              Math.abs(b.x - g.player.x) < 145 &&
              Math.abs(b.y - (g.player.y + 28)) < 90
          );
          if (incomingBall && g.player.grounded) {
            await page.keyboard.down('Space');
            await page.waitForTimeout(220);
            await page.keyboard.up('Space');
          }
          return Boolean(
            g.boss &&
              g.boss.jumpCount >= 1 &&
              g.boss.totalBallsThrown >= 1 &&
              g.boss.maxObservedBounces >= 1 &&
              g.boss.timeRemaining < 29.5
          );
        },
        { timeout: 10_000, intervals: [60] }
      )
      .toBe(true);

    const midFight = await getGame(page);
    expect(midFight.boss!.x).toBe(bossFixedX);
    expect(midFight.boss!.maxObservedBounces).toBeLessThanOrEqual(5);

    // 4. Advance countdown close to 0 and verify exit door behind boss unlocks
    await page.evaluate(() => {
      window.__GAME__?.setBossTimeRemaining(0.25);
    });

    await expect
      .poll(
        async () => {
          const g = await getGame(page);
          if (g.boss?.phase === 'waiting') {
            await page.keyboard.down('ArrowRight');
            await page.waitForTimeout(500);
            await page.keyboard.up('ArrowRight');
            await page.evaluate(() => window.__GAME__?.setBossTimeRemaining(0.2));
            return null;
          }
          return g.boss?.phase ?? null;
        },
        { timeout: 6000 }
      )
      .toBe('escape');

    const escapeState = await getGame(page);
    expect(escapeState.boss!.exitDoorOpen).toBe(true);
    await expect(page.locator('#hud-progress-pct')).toHaveText('ESCAPE!');

    // 5. Sprint under the jumping boss and reach the exit portal to trigger Victory!
    const escapeStart = Date.now();
    while (Date.now() - escapeStart < 15_000) {
      const g = await getGame(page);
      if (g.screen === 'victory') {
        break;
      }
      if (g.boss?.phase === 'waiting') {
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(480);
        await page.keyboard.up('ArrowRight');
        await page.evaluate(() => window.__GAME__?.setBossTimeRemaining(0.01));
        await page.waitForTimeout(60);
        continue;
      }

      const distToBoss = g.boss!.x - g.player.x;
      const bossClearance = 472 - g.boss!.footY;

      if (distToBoss > 115) {
        // Sprint toward the boss while jumping over any low ball in our path
        const ballInPath = g.boss!.balls.find(
          (b) =>
            b.x > g.player.x - 10 &&
            b.x < g.player.x + 110 &&
            b.y > g.player.y - 10
        );
        await page.keyboard.down('ArrowRight');
        if (ballInPath && g.player.grounded) {
          await page.keyboard.down('Space');
          await page.waitForTimeout(180);
          await page.keyboard.up('Space');
        } else {
          await page.waitForTimeout(70);
        }
        await page.keyboard.up('ArrowRight');
      } else if (distToBoss > -55) {
        // Wait right in front of boss, then sprint full-speed underneath when he jumps!
        if (bossClearance >= 48 || g.boss!.vy < -280) {
          await page.keyboard.down('ArrowRight');
          await page.waitForTimeout(700);
          await page.keyboard.up('ArrowRight');
        } else {
          await page.waitForTimeout(25);
        }
      } else {
        // Past boss — sprint straight into the exit portal!
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(200);
        await page.keyboard.up('ArrowRight');
      }
    }

    await expect(page.locator('#victory-dialog')).toBeVisible({ timeout: 5000 });
    expect((await getGame(page)).screen).toBe('victory');
    expect(errors).toEqual([]);
  });
});

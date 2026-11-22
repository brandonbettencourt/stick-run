# Stick Run — Level Authoring Guide

Stick Run ships with **11 built-in handcrafted levels** (`level1.json` through `level10.json` plus Boss Arena `level11.json` in `src/levels/`) **plus a built-in Visual Level Editor** right in the browser!

## Using the Visual Level Editor (No Code Required)

Click **LEVEL EDITOR** on the title screen (or **EDITOR** in the top HUD at any time):

1. **Create or Edit:** Click **+ NEW BLANK** for a clean starter course (ground + spawn + portal), or open the **Playlist Order** tab and click any existing level to edit/remix it.
2. **Add Components:** Pick a tool from the left palette (`Platform / Block`, `Spikes`, `Static Laser`, `Timed Laser`, `Move Spawn`, `Move Portal`, or `Hint Text`) and click or click-and-drag directly on the canvas.
3. **Move & Resize:** Switch to **Select / Move / Resize (`V`)** to drag any object around, drag the **8 corner/edge handles** to resize platforms/overhangs/spikes, or drag the circular endpoints to stretch/rotate laser beams.
4. **Live Playability Check & Test Play:** The bottom status bar validates spawn safety and double-jump reachability in real time. Click **▶ TEST PLAY** to immediately playtest your draft, then click **← EDITOR [ESC]** to tweak it.
5. **Tack On or Insert Anywhere in the Campaign:**
   - Choose a slot from the insert dropdown (e.g., **At End** or **Between Level 4 & Level 5**) and click **+ INSERT**.
   - Use the **↑ / ↓** buttons in the **Playlist Order** tab to reorder any level at any time.
   - Custom levels and playlist order are saved automatically in your browser (`localStorage`).
6. **Promote a Favorite Custom Level to GitHub:** Click **EXPORT JSON** to download the `.json` file, drop it into `src/levels/`, register it in [`src/levels/index.ts`](./index.ts), and push to `main`!

---

## Boss Arenas

Any level JSON can include an optional `"boss"` block (see [`level11.json`](./level11.json) and [`BossConfig`](./types.ts)) to turn the level into a locked-room boss encounter:
- Players enter from the bottom-left doorway; crossing `triggerX` slams `entryDoor` shut and starts the `survivalDuration` countdown (`30`s for Boss 1; future bosses can increase by `10–15`s and tune `throwCooldown`, `ballSpeed`, `maxBounces`, and `maxActiveBalls`).
- The 3× red stick-figure boss jumps vertically in place and throws straight-line neon laser balls aimed at the player (from the ground or mid-jump) that bounce off `arenaBounds` up to `maxBounces` (`5`) times before dissipating.
- When the countdown reaches `0`, `exitDoor` opens behind the boss so the player can run or slide underneath when he jumps to reach the portal.

---

## Coordinate System & Reach Reference

- **Origin `(0, 0)`** is the top-left corner (`x` right, `y` down).
- Logical viewport: **`960 × 540` px** (standard ground top at `y = 440`, `killY = 620`).
- Physics source of truth: [`src/engine/constants.ts`](../engine/constants.ts).

| Metric | Value | Level Design Guideline |
| --- | --- | --- |
| Standing hitbox | `24 × 56` px | Place `spawn.y = groundY - 56` (e.g., `384` on `y = 440` ground) |
| Duck / Slide hitbox | `24 × 28` px | Use **`38–42` px** clearance above the floor for slide tunnels & high lasers |
| Max single jump height | ~`110` px | Keep single-jump step-ups ≤ `90` px |
| Max double jump height | ~`199` px | Keep double-jump step-ups ≤ `160` px |
| Max single jump flat gap | ~`226` px | Keep easy pits `110–160` px wide |
| Max double jump flat gap | ~`380+` px | Keep double-jump pits `180–260` px wide |

## Validation & E2E Testing

```bash
npm run validate-levels   # Validates all built-in JSON levels against schema & jump physics
npm run test:e2e          # Runs Playwright E2E playability & Level Editor tests
```

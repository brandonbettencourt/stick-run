# Stick Run — Level Authoring Guide

Levels are stored as plain, human-readable JSON files in `src/levels/` (`level1.json` through `level5.json`) and registered in [`src/levels/index.ts`](./index.ts).

## Coordinate System

- **Origin `(0, 0)`** is the top-left corner of the level.
- **`x` increases to the right**; **`y` increases downward**.
- The logical game viewport is **`960 × 540` px** (16:9).
- Standard ground top sits at **`y = 440`** (with `height: 120` extending below the viewport), and `killY` defaults to **`620`**.

## Player Dimensions & Reach Reference

Keep these physics values in mind when placing gaps, blocks, overhangs, and lasers (source of truth: `src/engine/constants.ts`):

| Metric | Value | Level Design Guideline |
| --- | --- | --- |
| Standing hitbox | `24 × 56` px | Place `spawn.y = groundY - 56` (e.g., `384` on `y = 440` ground) |
| Duck / Slide hitbox | `24 × 28` px | Use **`38–42` px** clearance above the floor for slide tunnels & high lasers |
| Max single jump height | ~`110` px | Keep single-jump step-ups ≤ `90` px |
| Max double jump height | ~`199` px | Keep double-jump step-ups ≤ `160` px |
| Max single jump flat gap | ~`226` px | Keep easy pits `110–160` px wide |
| Max double jump flat gap | ~`380+` px | Keep double-jump pits `180–260` px wide |

## JSON Schema

```json
{
  "id": 1,
  "name": "Neon Awakening",
  "subtitle": "Short description shown on the HUD/overlay",
  "width": 2400,
  "height": 540,
  "killY": 620,
  "spawn": { "x": 80, "y": 384 },
  "portal": { "x": 2260, "y": 344, "width": 44, "height": 96 },
  "solids": [
    { "x": 0, "y": 440, "width": 680, "height": 120 }
  ],
  "spikes": [
    { "x": 540, "y": 420, "width": 48, "height": 20, "direction": "up" }
  ],
  "lasers": [
    {
      "x1": 1020,
      "y1": 270,
      "x2": 1020,
      "y2": 438,
      "thickness": 8,
      "timed": true,
      "cyclePeriod": 2.8,
      "activeDuration": 1.1,
      "phaseOffset": 0.0,
      "warningDuration": 0.45
    }
  ],
  "hints": [
    { "x": 100, "y": 310, "text": "SPACE to Jump" }
  ]
}
```

### Field Reference

- **`id`**: Sequential integer (`1`, `2`, `3`, ...).
- **`name` / `subtitle`**: Displayed in the HUD and transition overlays.
- **`width` / `height`**: World bounds in pixels (`width >= 960`, `height >= 540`).
- **`killY`**: Falling below this `y` coordinate kills the player instantly.
- **`spawn`**: `{ x, y }` top-left corner of the standing player hitbox (`24 × 56`). Must rest on or just above a solid surface and never overlap a solid or hazard.
- **`portal`**: `{ x, y, width, height }` exit goal rectangle. Standard size is `44 × 96` resting on the floor (`y = floorY - 96`).
- **`solids`**: Array of `{ x, y, width, height }` non-lethal platforms, walls, blocks, and overhangs.
- **`spikes`**: Array of `{ x, y, width, height, direction }` where `direction` is `"up" | "down" | "left" | "right"`.
- **`lasers`**: Array of beams between `(x1, y1)` and `(x2, y2)`:
  - `thickness` (optional, default `8`): Lethal beam width in px.
  - `timed`: `false` for static beams (always active), `true` for pulsing beams.
  - `cyclePeriod`: Total cycle length in seconds (e.g., `2.8`).
  - `activeDuration`: Seconds the beam is lethal per cycle (`< cyclePeriod`).
  - `warningDuration` (optional, default `0.45`): Telegraph flicker window immediately before activation.
  - `phaseOffset` (optional, default `0`): Time offset in seconds to stagger multiple lasers.
- **`hints`** (optional): Floating holographic text cues rendered in the background.

## Adding or Editing a Level

1. Edit an existing `levelN.json` or create a new `level6.json` and import/export it in `src/levels/index.ts`.
2. Run the automated level & physics validator to verify geometry, safety, and reachability:

```bash
npm run validate-levels
```

3. Run the E2E suite to confirm every level loads and renders cleanly:

```bash
npm run test:e2e
```

# Hackathon 2026 — Anshul Bankley (Two Sigma)

Three self-contained Canvas2D behaviors, plus a small launcher that switches
between them live. All are designed for the zero / one / many-player problem,
aim to be legible without narration, and put a real math concept underfoot.

> These are hackathon **examples, not official Math Square exhibits.**

| Behavior | File | The math |
|---|---|---|
| **Eat & Grow (Starfield Ghost Hunt)** | `eat-and-grow.js` | Area-based growth (radius ∝ √mass), a size↔speed trade-off, and a player-to-ghost ratio that scales with the crowd. Collect energy pods to grow; once you're as big as a ghost, power up and chase it down. AI bot-players keep the loop alive with nobody on the floor. |
| **Territory (Splat)** | `territory-splat.js` | Area, measure, and partition of the plane — coverage is literally the fraction each color owns. Walk to paint the floor; step on a rival's paint to claim it; slow fade keeps the map contestable; first color to 40% wins the round. Teams use the MoMath brand palette. |
| **Flow Field (Gravity Vortices)** | `flow-field.js` | A 2D vector field / n-body attractor system with superposition. Each person is a gravity well; glowing particles trace the field's streamlines and braid between people. |
| **Launcher** | `launcher.js` | Not a behavior — hosts the three above and switches between them live with number keys (no reload). Handy pattern for demoing several behaviors at once. |

## How to run

Point the loader in `main.ts` at the launcher (switch with keys **1 / 2 / 3**)
or at a single behavior, then `npm run dev`:

```js
// Launcher — press 1 / 2 / 3 (or ← →) to switch behaviors live:
const beh = await import('./examples/hackathon-2026/anshul-bankley/launcher.js');

// ...or a single behavior directly:
const beh = await import('./examples/hackathon-2026/anshul-bankley/eat-and-grow.js');
```

**Dev tips**
- Set **sensors = Off**, check the **mouse** box, then **click-and-hold + drag**
  to act as a player.
- With the launcher, switching does **not** reload the page, so your sensor and
  mouse settings persist between behaviors.
- Two of these use blob tracking (`floor.users`); the launcher swaps
  `floor.maxUsers` / `floor.setGhosts` per behavior on switch — a useful pattern
  if you host several behaviors at once.

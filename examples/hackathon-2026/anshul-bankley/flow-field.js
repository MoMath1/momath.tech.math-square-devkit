/* MoMath Math Square Behavior
 * © 2026 National Museum of Mathematics. All rights reserved.
 *
 * Hackathon 2026 contribution by Anshul Bankley (Two Sigma).
 * Example only — not an official Math Square exhibit.
 *
 *        Title: Flow Field (Gravity Vortices)
 *  Description: A living vector field. Thousands of glowing particles drift
 *               through an ambient curl-noise flow. Each person on the floor
 *               becomes a gravitational vortex — particles bend into orbit
 *               around them, braiding and colliding between people. Color is
 *               mapped to each particle's direction of travel, so the whole
 *               floor becomes a shifting field of rainbow flow lines.
 *
 *  The math:    A 2D vector field / n-body attractor system. People are
 *               attractors with an inward (gravity) and perpendicular (swirl)
 *               force, plus a short-range core repulsion so particles orbit
 *               rather than collapse. The ambient motion is curl-style
 *               Simplex noise. The math IS the mechanic: you see that you
 *               bend the space around you.
 *
 *  Zero/one/many:
 *    - Zero:  ghosts + curl-noise flow keep an aurora breathing across the
 *             floor as an attract mode.
 *    - One:   the field visibly warps and orbits around a single person.
 *    - Many:  each person is a vortex; streams braid between them — the
 *             pattern gets richer, not just busier, with a crowd.
 *
 *    Framework: Canvas2D (native)
 */

import * as Display from 'display';
import { SimplexNoise } from 'lib/noise';

/* ─── Tunables ─── */
const NUM_PARTICLES = 1800;

// Ambient curl-noise flow (the zero-player aurora)
const FLOW_ACCEL = 0.22;   // strength of ambient push per frame
const NOISE_SCALE = 0.0016; // spatial frequency of the flow field
const NOISE_TIME = 0.004;  // how fast the ambient field evolves

// Per-person attractor forces
const GRAVITY = 14000;     // inward pull
const SWIRL = 22000;       // perpendicular (orbit) force
const SOFTEN = 9000;       // softening (px^2) — keeps near-center forces gentle
const CORE_RADIUS = 62;    // radius of the calm "eye" around each person
const CORE_REPEL = 1.6;    // outward push inside the core (prevents collapse)
const GHOST_WEIGHT = 0.4;  // ghosts pull weaker than real people

// Particle motion
const DAMPING = 0.94;      // velocity bleed per frame
const MAX_SPEED = 7;

// Look
const TRAIL_FADE = 0.085;  // lower = longer glowing trails
const HALO_COLOR = null;   // null = per-person MoMath brand color; or a hex
const TAU = Math.PI * 2;

// MoMath brand palette (Pantone 370 C / 2727 C / 1807 C / 117 C).
const MOMATH = ['#558250', '#475CA0', '#A2223A', '#CA943A'];
const MOMATH_RGB = MOMATH.map(h => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
]);
// Map a position t∈[0,1) around a cyclic MoMath gradient, scaled by brightness.
function momathColor(t, bright) {
  const n = MOMATH_RGB.length;
  const f = (((t % 1) + 1) % 1) * n;
  const i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, k = f - Math.floor(f);
  const a = MOMATH_RGB[i0], b = MOMATH_RGB[i1];
  const r = ((a[0] + (b[0] - a[0]) * k) * bright) | 0;
  const g = ((a[1] + (b[1] - a[1]) * k) * bright) | 0;
  const bl = ((a[2] + (b[2] - a[2]) * k) * bright) | 0;
  return `rgba(${r},${g},${bl},0.55)`;
}

/* ─── State ─── */
let canvas, ctx;
let particles;   // Float32 columns: x, y, px, py, vx, vy
let noise;
let time = 0;

function reseed(i) {
  particles.x[i] = Math.random() * Display.width;
  particles.y[i] = Math.random() * Display.height;
  particles.px[i] = particles.x[i];
  particles.py[i] = particles.y[i];
  particles.vx[i] = 0;
  particles.vy[i] = 0;
}

function init(container) {
  canvas = document.createElement('canvas');
  canvas.width = Display.width;
  canvas.height = Display.height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none'; // let mouse-as-person pass through
  container.appendChild(canvas);
  ctx = canvas.getContext('2d');

  // Start on a solid black field so the first trails read cleanly.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  noise = new SimplexNoise();

  particles = {
    x: new Float32Array(NUM_PARTICLES),
    y: new Float32Array(NUM_PARTICLES),
    px: new Float32Array(NUM_PARTICLES),
    py: new Float32Array(NUM_PARTICLES),
    vx: new Float32Array(NUM_PARTICLES),
    vy: new Float32Array(NUM_PARTICLES),
  };
  for (let i = 0; i < NUM_PARTICLES; i++) reseed(i);
}

function render(floor) {
  time += NOISE_TIME;

  // Fade the previous frame instead of clearing — this is what makes the
  // silky glowing trails. Draw in normal mode...
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(0, 0, 0, ${TRAIL_FADE})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ...then draw all particles additively so overlaps glow toward white.
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1.4;

  const users = floor.users;

  for (let i = 0; i < NUM_PARTICLES; i++) {
    let x = particles.x[i];
    let y = particles.y[i];
    let vx = particles.vx[i];
    let vy = particles.vy[i];

    // 1) Ambient curl-noise flow — an angle field the particle follows.
    const angle = noise.noise(x * NOISE_SCALE, y * NOISE_SCALE + time) * TAU * 2;
    vx += Math.cos(angle) * FLOW_ACCEL;
    vy += Math.sin(angle) * FLOW_ACCEL;

    // 2) Attractor forces from every person (and ghost) on the floor.
    for (let u = 0; u < users.length; u++) {
      const user = users[u];
      const dx = user.x - x;
      const dy = user.y - y;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) + 0.001;
      const nx = dx / d, ny = dy / d;     // unit vector toward the person
      const w = user.id >= 0 ? 1 : GHOST_WEIGHT;

      // Inward gravity (softened so the center never blows up).
      let ar = (w * GRAVITY) / (d2 + SOFTEN);
      // Short-range repulsion carves a calm eye around each person.
      if (d < CORE_RADIUS) ar -= w * CORE_REPEL * (1 - d / CORE_RADIUS);
      // Perpendicular swirl turns the pull into an orbit.
      const at = (w * SWIRL) / (d2 + SOFTEN);

      vx += ar * nx + at * -ny;
      vy += ar * ny + at * nx;
    }

    // 3) Damp and clamp speed for stability.
    vx *= DAMPING;
    vy *= DAMPING;
    let speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > MAX_SPEED) {
      vx = (vx / speed) * MAX_SPEED;
      vy = (vy / speed) * MAX_SPEED;
      speed = MAX_SPEED;
    }

    const px = x, py = y;
    x += vx;
    y += vy;

    // 4) Wrap around the edges so the field is seamless and continuous.
    let wrapped = false;
    if (x < 0) { x += Display.width; wrapped = true; }
    else if (x >= Display.width) { x -= Display.width; wrapped = true; }
    if (y < 0) { y += Display.height; wrapped = true; }
    else if (y >= Display.height) { y -= Display.height; wrapped = true; }

    // 5) Draw a short streak from previous to current position. Color by
    //    direction of travel → rainbow flow lines; brighten with speed.
    if (!wrapped) {
      const t = ((Math.atan2(vy, vx) / TAU) + 1) % 1;   // direction → MoMath gradient
      ctx.strokeStyle = momathColor(t, 0.55 + (speed / MAX_SPEED) * 0.45);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    particles.x[i] = x;
    particles.y[i] = y;
    particles.px[i] = px;
    particles.py[i] = py;
    particles.vx[i] = vx;
    particles.vy[i] = vy;
  }

  // A soft colored halo on each real person makes the "I am the source" read
  // instantly — the vortex clearly belongs to them. Each person gets their
  // own color from the floor's team palette. (Set HALO_COLOR to a single hex
  // string like '#00e5ff' instead if you want everyone the same color.)
  for (let u = 0; u < users.length; u++) {
    const user = users[u];
    if (user.id < 0) continue; // skip ghosts
    const color = HALO_COLOR || MOMATH[user.id % MOMATH.length];
    const g = ctx.createRadialGradient(user.x, user.y, 0, user.x, user.y, CORE_RADIUS);
    g.addColorStop(0, color + 'e6');   // ~90% alpha at center
    g.addColorStop(0.4, color + '40'); // ~25% alpha
    g.addColorStop(1, color + '00');   // transparent edge
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(user.x, user.y, CORE_RADIUS, 0, TAU);
    ctx.fill();
  }
}

export const behavior = {
  title: "Flow Field (Gravity Vortices)",
  frameRate: 'animate',
  numGhosts: 3,      // keep the field alive with zero real players (attract mode)
  init: init,
  render: render
};
export default behavior;

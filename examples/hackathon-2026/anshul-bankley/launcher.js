/* MoMath Math Square Behavior
 * © 2026 National Museum of Mathematics. All rights reserved.
 *
 * Hackathon 2026 contribution by Anshul Bankley (Two Sigma).
 * Example only — not an official Math Square exhibit.
 *
 *        Title: Hackathon 2026 Launcher
 *  Description: A thin wrapper that hosts the three example behaviors and
 *               switches between them live — press 1 / 2 / 3 (or ← →). No page
 *               reload, so your dev settings (sensor source, the mouse checkbox)
 *               stay put when you switch. Each behavior keeps its own canvas; we
 *               show the active one, forward render() to it, and set the floor's
 *               ghost + user-tracking mode to whatever it needs.
 *
 *    Framework: delegates to the individual behaviors (all Canvas2D).
 */

import eatAndGrow from './eat-and-grow.js';
import territory from './territory-splat.js';
import flowField from './flow-field.js';

// Order = key order.
//   numGhosts — floor.setGhosts value (only Flow Field uses ghost "users").
//   maxUsers  — 40 = blob tracking (floor.users); 0 = raw sensor grid only.
const SUBS = [
  { name: 'Eat & Grow',        mod: eatAndGrow, numGhosts: 0, maxUsers: 40 },
  { name: 'Territory (Splat)', mod: territory,  numGhosts: 0, maxUsers: 40 },
  { name: 'Flow Field',        mod: flowField,  numGhosts: 3, maxUsers: 40 },
];

let container, floorRef, overlay;
let active = 0;

function showOnly(idx) {
  for (let i = 0; i < SUBS.length; i++) {
    if (SUBS[i].canvas) SUBS[i].canvas.style.display = (i === idx) ? 'block' : 'none';
  }
}

function updateOverlay() {
  if (!overlay) return;
  overlay.innerHTML = SUBS.map((s, i) =>
    `<span style="color:${i === active ? '#ffd60a' : '#8a8f9a'}">${i + 1} ${s.name}</span>`
  ).join('&nbsp;&nbsp;·&nbsp;&nbsp;') +
    `&nbsp;&nbsp;&nbsp;<span style="color:#5a5f6a">(1–${SUBS.length} to switch)</span>`;
}

function setActive(idx) {
  if (idx < 0 || idx >= SUBS.length || idx === active) return;
  active = idx;
  showOnly(idx);
  if (floorRef) {
    if (floorRef.setGhosts) floorRef.setGhosts(SUBS[idx].numGhosts || 0);
    floorRef.maxUsers = SUBS[idx].maxUsers;
  }
  updateOverlay();
  console.log(`[launcher] switched to ${SUBS[idx].name}`);
}

function init(scene) {
  container = scene;

  // Initialize each behavior once; capture the canvas each one appends so we
  // can show/hide them. (Each behavior appends exactly one canvas in init.)
  for (const s of SUBS) {
    const before = container.childElementCount;
    s.mod.init(container);
    s.canvas = container.children[before] || container.lastElementChild;
  }
  showOnly(active);

  // On-screen legend (its own DOM overlay; never touched by the canvases).
  overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;' +
    'pointer-events:none;font:600 16px system-ui,-apple-system,sans-serif;' +
    'background:rgba(0,0,0,0.5);padding:6px 14px;border-radius:9px;letter-spacing:0.3px;' +
    'max-width:96vw;text-align:center;';
  document.body.appendChild(overlay);
  updateOverlay();

  window.addEventListener('keydown', (e) => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= SUBS.length) setActive(n - 1);
    else if (e.key === 'ArrowRight') setActive((active + 1) % SUBS.length);
    else if (e.key === 'ArrowLeft') setActive((active - 1 + SUBS.length) % SUBS.length);
  });
}

function render(floor) {
  floorRef = floor;
  const s = SUBS[active];
  if (s && s.mod && s.mod.render) s.mod.render(floor);
}

export const behavior = {
  title: "Hackathon 2026 Launcher",
  frameRate: 'animate',
  numGhosts: SUBS[0].numGhosts,
  maxUsers: SUBS[0].maxUsers,
  init: init,
  render: render,
};
export default behavior;

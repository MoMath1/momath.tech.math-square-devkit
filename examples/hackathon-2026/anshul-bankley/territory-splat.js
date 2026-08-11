/* MoMath Math Square Behavior
 * © 2026 National Museum of Mathematics. All rights reserved.
 *
 * Hackathon 2026 contribution by Anshul Bankley (Two Sigma).
 * Example only — not an official Math Square exhibit.
 *
 *        Title: Territory (Splat)
 *  Description: Adapted from Electric Shuffle's "Territory". Walk to paint the
 *               floor your color. Step onto someone else's paint and you take
 *               it over. The floor itself is the scoreboard — whoever holds the
 *               most area is winning, and you can see it at a glance. Paint
 *               slowly fades, so abandoned turf returns to neutral and the map
 *               is always contestable. Painter-bots keep the floor alive when
 *               no one's on it.
 *
 *  The math:    Area / territory and set partition — coverage is literally the
 *               fraction of the plane each color owns. The math is the score.
 *
 *  Zero/one/many:
 *    - Zero:  bots paint an ever-shifting map of colored territories.
 *    - One:   a kid watches their color spread as they run — direct and legible.
 *    - Many:  overlapping claims and overwrites; the floor divides in real time.
 *
 *    Framework: Canvas2D (native)
 */

import * as Display from 'display';

/* ─── Tunables ─── */
const GRID = 128;                       // paint grid resolution
const CELL = Display.width / GRID;       // px per grid cell (8)
const BRUSH = 7;                          // paint radius in cells (~56px) — claims areas
const DECAY = 0.999;                      // per-frame fade (slow — territory accumulates)
const CLEAR_AT = 0.06;                    // intensity below which a cell is neutral
const COVER_MIN = 0.4;                    // intensity that counts toward coverage

const BOT_COUNT = 4;                      // painter-bots (one per MoMath brand color)
const BOT_SPEED = 2.8;

const WIN_PCT = 0.40;                     // a color controlling this much wins the round
const WIN_MS = 1800;                      // celebration length before reset

const ORB_R = 24;                         // player marker radius
const TAU = Math.PI * 2;

// MoMath brand colors as the teams — the floor paints itself in the museum's
// palette (Pantone 370 C green / 2727 C blue / 1807 C crimson / 117 C gold).
const PALETTE = ['#558250', '#475CA0', '#A2223A', '#CA943A'];

/* ─── State ─── */
let canvas, ctx, gridCanvas, gridCtx, imgData;
let owner;     // Int16Array: team index per cell, -1 = neutral
let inten;     // Float32Array: 0..1 paint intensity per cell
let bots;
let teamRGB;   // PALETTE parsed to [r,g,b]
let winUntil = 0, winTeam = -1, winRings = [];
const DEBUG = false;

function rand(min, max) { return min + Math.random() * (max - min); }

function hexToRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function a2(a) { return Math.max(0, Math.min(255, Math.round(a * 255))).toString(16).padStart(2, '0'); }

function spawnBot(i) {
  return {
    // Spread bots evenly across the palette so they never clump in one hue.
    team: Math.round(i * PALETTE.length / BOT_COUNT) % PALETTE.length,
    x: rand(100, Display.width - 100),
    y: rand(100, Display.height - 100),
    tx: rand(0, Display.width),
    ty: rand(0, Display.height),
  };
}

function init(container) {
  canvas = document.createElement('canvas');
  canvas.width = Display.width;
  canvas.height = Display.height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  container.appendChild(canvas);
  ctx = canvas.getContext('2d');

  // Offscreen low-res paint layer, drawn smoothly scaled up for soft blobs.
  gridCanvas = document.createElement('canvas');
  gridCanvas.width = GRID;
  gridCanvas.height = GRID;
  gridCtx = gridCanvas.getContext('2d');
  imgData = gridCtx.createImageData(GRID, GRID);

  owner = new Int16Array(GRID * GRID).fill(-1);
  inten = new Float32Array(GRID * GRID);
  teamRGB = PALETTE.map(hexToRGB);

  bots = [];
  for (let i = 0; i < BOT_COUNT; i++) bots.push(spawnBot(i));
}

/* Stamp a circular brush of one team's paint at a pixel position. */
function stamp(px, py, team) {
  const cx = px / CELL, cy = py / CELL;
  const x0 = Math.max(0, Math.floor(cx - BRUSH)), x1 = Math.min(GRID - 1, Math.ceil(cx + BRUSH));
  const y0 = Math.max(0, Math.floor(cy - BRUSH)), y1 = Math.min(GRID - 1, Math.ceil(cy + BRUSH));
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const dx = gx + 0.5 - cx, dy = gy + 0.5 - cy;
      if (Math.hypot(dx, dy) <= BRUSH) {
        const i = gy * GRID + gx;
        owner[i] = team;
        inten[i] = 1;
      }
    }
  }
}

function moveBot(b) {
  const dx = b.tx - b.x, dy = b.ty - b.y;
  const d = Math.hypot(dx, dy);
  if (d < 30) { b.tx = rand(0, Display.width); b.ty = rand(0, Display.height); }
  else { b.x += (dx / d) * BOT_SPEED; b.y += (dy / d) * BOT_SPEED; }
}

function renderGame(floor) {
  /* ── Gather painters: humans (by id) + bots ── */
  const painters = [];
  for (const user of floor.users) {
    if (user.id < 0) continue;
    if (!Number.isFinite(user.x) || !Number.isFinite(user.y)) continue;
    painters.push({ x: user.x, y: user.y, team: user.id % PALETTE.length, isBot: false });
  }
  for (const b of bots) { moveBot(b); painters.push({ x: b.x, y: b.y, team: b.team, isBot: true }); }

  /* ── Paint, then fade ── */
  for (const p of painters) stamp(p.x, p.y, p.team);

  const N = GRID * GRID;
  const count = new Array(PALETTE.length).fill(0);
  for (let i = 0; i < N; i++) {
    if (owner[i] < 0) continue;
    inten[i] *= DECAY;
    if (inten[i] < CLEAR_AT) { owner[i] = -1; inten[i] = 0; }
    else if (inten[i] >= COVER_MIN) count[owner[i]]++;
  }

  const now = Date.now();

  /* ── Round win: a color controls WIN_PCT of the floor → celebrate + reset ── */
  if (now > winUntil) {
    for (let t = 0; t < PALETTE.length; t++) {
      if (count[t] / N >= WIN_PCT) {
        winTeam = t;
        winUntil = now + WIN_MS;
        winRings = [];
        for (let k = 0; k < 4; k++) winRings.push({ r: 20 + k * 40, delay: k * 90 });
        owner.fill(-1); inten.fill(0);            // wipe the board for the next round
        for (let i = 0; i < count.length; i++) count[i] = 0;
        if (DEBUG) console.log(`[territory] team ${t} wins the round`);
        break;
      }
    }
  }

  /* ── Build the paint image ── */
  const data = imgData.data;
  for (let i = 0; i < N; i++) {
    const o = owner[i], idx = i * 4;
    if (o < 0) { data[idx + 3] = 0; continue; }
    const c = teamRGB[o];
    data[idx] = c[0]; data[idx + 1] = c[1]; data[idx + 2] = c[2];
    data[idx + 3] = Math.min(255, (inten[i] * 255) | 0);
  }
  gridCtx.putImageData(imgData, 0, 0);

  /* ── Render ── */
  ctx.globalCompositeOperation = 'source-over';
  const bg = ctx.createRadialGradient(512, 512, 120, 512, 512, 780);
  bg.addColorStop(0, '#20232e');
  bg.addColorStop(1, '#12141c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.92;
  ctx.drawImage(gridCanvas, 0, 0, GRID, GRID, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;

  // Player / bot markers.
  for (const p of painters) {
    const color = PALETTE[p.team];
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ORB_R, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;

    const hl = ctx.createRadialGradient(p.x - ORB_R * 0.3, p.y - ORB_R * 0.3, ORB_R * 0.1, p.x, p.y, ORB_R);
    hl.addColorStop(0, 'rgba(255,255,255,0.6)');
    hl.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ORB_R, 0, TAU);
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash(p.isBot ? [10, 8] : []);
    ctx.beginPath();
    ctx.arc(p.x, p.y, ORB_R + 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ── Coverage bar (bottom): proportion of the whole floor per team ── */
  const barH = 22, barY = canvas.height - barH - 10;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(10, barY, canvas.width - 20, barH);
  let x = 10, lead = -1, leadN = 0;
  for (let t = 0; t < PALETTE.length; t++) {
    if (count[t] > leadN) { leadN = count[t]; lead = t; }
    if (count[t] === 0) continue;
    const w = (count[t] / N) * (canvas.width - 20);
    ctx.fillStyle = PALETTE[t];
    ctx.fillRect(x, barY, w, barH);
    x += w;
  }
  if (lead >= 0) { // outline the leader's segment
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, barY, (leadN / N) * (canvas.width - 20), barH);
  }

  /* ── Round-win celebration: color flash + expanding rings from center ── */
  if (now < winUntil && winTeam >= 0) {
    const t = (winUntil - now) / WIN_MS;           // 1 → 0
    const color = PALETTE[winTeam];
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(512, 512, 100, 512, 512, 760);
    fg.addColorStop(0, color + a2(0.5 * t));
    fg.addColorStop(1, color + '00');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const elapsed = WIN_MS - (winUntil - now);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    for (const r of winRings) {
      if (elapsed < r.delay) continue;
      const rr = r.r + (elapsed - r.delay) * 0.9;
      ctx.globalAlpha = Math.max(0, t);
      ctx.beginPath(); ctx.arc(512, 512, rr, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  if (DEBUG && lead >= 0) console.log(`[territory] leader team ${lead} @ ${(leadN / N * 100).toFixed(1)}%`);
}

function drawError(err) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1; ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(40, 40, canvas.width - 80, 260);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#ff6b6b'; ctx.font = '28px monospace';
  ctx.fillText('Behavior error (see DevTools console):', 60, 60);
  ctx.fillStyle = '#ffd0d0'; ctx.font = '20px monospace';
  String(err && err.stack ? err.stack : err).split('\n').slice(0, 6)
    .forEach((line, i) => ctx.fillText(line.slice(0, 84), 60, 112 + i * 26));
}

let errorLogged = false;
function render(floor) {
  try {
    renderGame(floor);
  } catch (err) {
    if (!errorLogged) { console.error('[territory] render error:', err); errorLogged = true; }
    try { drawError(err); } catch (_) { /* ignore */ }
  }
}

export const behavior = {
  title: "Territory (Splat)",
  frameRate: 'animate',
  numGhosts: 0,
  init: init,
  render: render,
};
export default behavior;

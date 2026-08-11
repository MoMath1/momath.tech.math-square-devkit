/* MoMath Math Square Behavior
 * © 2026 National Museum of Mathematics. All rights reserved.
 *
 * Hackathon 2026 contribution by Anshul Bankley (Two Sigma).
 * Example only — not an official Math Square exhibit.
 *
 *        Title: Eat & Grow (Starfield Ghost Hunt)
 *  Description: Pac-Man's power-pellet loop set in deep space, with a starfield
 *               backdrop inspired by Hubble's image of Omega Centauri. You are a
 *               glowing orb — sweep up bright energy pods to grow. The instant
 *               you're as big as a ghost, a gold ring lights up and the floor
 *               flashes your color: you're powered. Nearby ghosts turn blue and
 *               flee. Catch one for a fiery blast, then it respawns. Eating a
 *               ghost resets you to small, so the hunt begins again. Two AI
 *               bot-players hunt alongside you, and the number of ghosts scales
 *               up and down with how many people are on the floor.
 *
 *  The math:    Area-based growth (radius ∝ √mass), pursuit / evasion, and a
 *               player-to-ghost ratio that keeps the floor balanced at any size.
 *
 *  Zero/one/many:
 *    - Zero:  bot-players grow and chase 2 ghosts across a living starfield.
 *    - One:   a kid races the bots to power up and catch a ghost first.
 *    - Many:  more people ⇒ more ghosts ⇒ the whole floor becomes a chase.
 *
 *    Framework: Canvas2D (native)
 */

import * as Display from 'display';
import { SimplexNoise } from 'lib/noise';

/* ─── Gameplay tunables ─── */
const START_SIZE = 100;         // starting "mass"
const GHOST_SIZE = 300;         // fixed ghost mass — grow to this to power up
const MAX_SIZE = 460;           // small headroom above ghost size
const PELLET_VALUE = 10;        // mass gained per pod (~20 pods to power up)
const PELLET_COUNT = 65;        // energy pods on the floor at once (thinned for pacing)

// Ghost population scales with the number of real players on the floor.
const MIN_GHOSTS = 2;           // attract-mode floor (with the 2 bots)
const MAX_GHOSTS = 10;          // cap for a full house
const PLAYERS_PER_GHOST = 2;    // +1 ghost per 2 players (tuned for the board)
const GHOST_ADJUST_MS = 1200;   // adjust population at most this often (anti-thrash)

const GHOST_SPEED = 0.6;        // roam ≈ brisk walk (~4 ft/s) so kids can approach
const GHOST_FLEE_MULT = 1.35;   // flee ≈ a jog (~5.5 ft/s) — a running kid catches it
const GHOST_FLEE_RANGE = 340;   // how close a powered player must be to scare it
const GHOST_RESPAWN_MS = 4500;  // time a ghost stays gone after being eaten
const GHOST_BORN_MS = 380;      // materialize (pop-in) duration
const GHOST_MARGIN = 150;       // hard limit: ghosts stay this far from edges
const GHOST_SOFT_MARGIN = 260;  // start steering inward at this distance
const GHOST_WALL_WEIGHT = 1.8;  // how strongly ghosts avoid edges/corners

const BOT_PLAYER_COUNT = 2;     // AI orbs that play the game like humans
const BOT_PLAYER_SPEED = 1.3;   // just above a fleeing ghost — catches rarely; loses to a running kid

const POWER_FLASH_MS = 550;     // screen-edge flash when a player powers up
const DEBUG = true;             // log game events to the DevTools console

/* ─── Ambient light-field (subtle nebula gas) ─── */
const FIELD_COUNT = 340;
const FIELD_FLOW = 0.18;
const FIELD_NOISE_SCALE = 0.0016;
const FIELD_NOISE_TIME = 0.004;
const FIELD_GRAVITY = 7000;
const FIELD_SWIRL = 11000;
const FIELD_SOFTEN = 9000;
const FIELD_DAMP = 0.94;
const FIELD_MAX_SPEED = 6;
const FIELD_ALPHA = 0.09;       // very subtle so it never competes with the game

/* ─── Starfield backdrop ─── */
const BG_STAR_COUNT = 260;      // fewer, dimmer — pure decoration now
const STAR_COLORS = [
  '#ffffff', '#ffffff', '#eaf2ff', '#cfe0ff', '#a9c7ff',
  '#fff3c4', '#ffd27f', '#ffb27f', '#ff8f6b',
];

const TAU = Math.PI * 2;

// Player/orb palette — MoMath brand colors (Pantone 370 C / 2727 C / 1807 C /
// 117 C). Pods stay neon (POD_COLORS) so food still reads as food.
const PALETTE = ['#558250', '#475CA0', '#A2223A', '#CA943A'];

// Energy-pod palette — deliberately NOT starlike, so food never blends in.
const POD_COLORS = ['#00e5ff', '#00ff9d', '#ffe14d', '#ff5cf0', '#ff8a3d'];

// Ghosts are drawn as emoji so kids instantly know to chase them.
const GHOST_EMOJI = ['👾', '👻', '🐙', '🦖', '🦀', '👽', '🤖', '🦑'];
const FRIGHT_COLOR = '#5bc8ff'; // light blue "scared" cue, distinct from brand blue

/* ─── State ─── */
let canvas, ctx;
let playerState;    // Map<userId, {size, powered}>  (humans)
let botPlayers;     // AI orbs that play the game
let ghosts;         // roaming prey (dynamic count)
let ghostSeq = 0;   // ever-increasing id for emoji/color variety
let lastGhostAdjust = 0;
let pellets;        // energy pods
let bgStars;        // decorative background stars
let rings, embers;  // effects
let field, noise, fieldTime = 0;
let powerFlashUntil = 0, powerFlashColor = '#ffffff';

function rand(min, max) { return min + Math.random() * (max - min); }
function orbRadius(size) { return 22 + 2.4 * Math.sqrt(size); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function a2(a) { return Math.max(0, Math.min(255, Math.round(a * 255))).toString(16).padStart(2, '0'); }

function spawnPellet() {
  return {
    x: rand(24, Display.width - 24),
    y: rand(24, Display.height - 24),
    color: pick(POD_COLORS),
    r: rand(9, 13),
    phase: rand(0, TAU),
  };
}

function spawnBgStar() {
  return {
    x: rand(0, Display.width), y: rand(0, Display.height),
    color: pick(STAR_COLORS),
    r: rand(0.4, 1.3),
    base: rand(0.1, 0.32),
    phase: rand(0, TAU), twinkle: rand(0.8, 2.5),
  };
}

function placeGhost(g) {
  g.x = rand(GHOST_MARGIN, Display.width - GHOST_MARGIN);
  g.y = rand(GHOST_MARGIN, Display.height - GHOST_MARGIN);
  g.vx = 0; g.vy = 0;
  g.active = true;
  g.bornAt = Date.now();
  g.fleeing = false;
}

function spawnGhost(seq) {
  const g = {
    color: PALETTE[(seq * 3 + 2) % PALETTE.length],
    emoji: GHOST_EMOJI[seq % GHOST_EMOJI.length],
    respawnAt: 0,
    wanderT: 0, wx: rand(-1, 1), wy: rand(-1, 1),
  };
  placeGhost(g);
  return g;
}

function spawnBotPlayer(i) {
  return {
    id: -(i + 1), powered: false,
    x: rand(200, Display.width - 200), y: rand(200, Display.height - 200),
    vx: 0, vy: 0, size: START_SIZE,
    color: PALETTE[(i * 4 + 1) % PALETTE.length],
    wanderT: 0, wx: rand(-1, 1), wy: rand(-1, 1),
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

  playerState = new Map();
  rings = []; embers = [];
  pellets = [];
  for (let i = 0; i < PELLET_COUNT; i++) pellets.push(spawnPellet());
  bgStars = [];
  for (let i = 0; i < BG_STAR_COUNT; i++) bgStars.push(spawnBgStar());
  ghosts = [];
  for (let i = 0; i < MIN_GHOSTS; i++) ghosts.push(spawnGhost(ghostSeq++));
  botPlayers = [];
  for (let i = 0; i < BOT_PLAYER_COUNT; i++) botPlayers.push(spawnBotPlayer(i));

  noise = new SimplexNoise();
  field = {
    x: new Float32Array(FIELD_COUNT), y: new Float32Array(FIELD_COUNT),
    vx: new Float32Array(FIELD_COUNT), vy: new Float32Array(FIELD_COUNT),
  };
  for (let i = 0; i < FIELD_COUNT; i++) { field.x[i] = rand(0, Display.width); field.y[i] = rand(0, Display.height); }
}

/* Grow or shrink the ghost population toward a target set by player count. */
function adjustGhosts(humanCount, now) {
  if (now - lastGhostAdjust < GHOST_ADJUST_MS) return;
  const target = Math.max(MIN_GHOSTS, Math.min(MAX_GHOSTS,
    MIN_GHOSTS + Math.floor(humanCount / PLAYERS_PER_GHOST)));
  if (ghosts.length < target) {
    const g = spawnGhost(ghostSeq++);
    ghosts.push(g);
    rings.push({ x: g.x, y: g.y, r: 90, maxR: 20, color: '#ffffff', life: 1, width: 4, grow: 0.2, shrink: true });
    if (DEBUG) console.log(`[eat-and-grow] +ghost ${g.emoji} (players=${humanCount}, ghosts=${ghosts.length})`);
    lastGhostAdjust = now;
  } else if (ghosts.length > target) {
    const g = ghosts.pop();
    rings.push({ x: g.x, y: g.y, r: 10, maxR: 120, color: g.color, life: 1, width: 5, grow: 0.16 });
    if (DEBUG) console.log(`[eat-and-grow] -ghost ${g.emoji} (players=${humanCount}, ghosts=${ghosts.length})`);
    lastGhostAdjust = now;
  }
}

function steerGhost(g, players) {
  let threat = null, td = Infinity;
  for (const p of players) {
    if (p.size < GHOST_SIZE) continue;
    const d = Math.hypot(p.x - g.x, p.y - g.y);
    if (d < td) { td = d; threat = p; }
  }
  g.wanderT--;
  if (g.wanderT <= 0) { g.wx = rand(-1, 1); g.wy = rand(-1, 1); g.wanderT = 45; }

  let dx, dy, speed = GHOST_SPEED;
  if (threat && td < GHOST_FLEE_RANGE) {
    dx = g.x - threat.x; dy = g.y - threat.y; g.fleeing = true; speed *= GHOST_FLEE_MULT;
  } else {
    dx = g.wx; dy = g.wy; g.fleeing = false;
  }
  let len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;

  const W = Display.width, H = Display.height, sm = GHOST_SOFT_MARGIN;
  if (g.x < sm)     dx += ((sm - g.x) / sm) * GHOST_WALL_WEIGHT;
  if (g.x > W - sm) dx -= ((g.x - (W - sm)) / sm) * GHOST_WALL_WEIGHT;
  if (g.y < sm)     dy += ((sm - g.y) / sm) * GHOST_WALL_WEIGHT;
  if (g.y > H - sm) dy -= ((g.y - (H - sm)) / sm) * GHOST_WALL_WEIGHT;
  len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;

  g.vx += dx * speed; g.vy += dy * speed;
  g.vx *= 0.8; g.vy *= 0.8;
  g.x += g.vx; g.y += g.vy;

  const m = GHOST_MARGIN;
  if (g.x < m) { g.x = m; g.vx = Math.abs(g.vx); }
  if (g.x > W - m) { g.x = W - m; g.vx = -Math.abs(g.vx); }
  if (g.y < m) { g.y = m; g.vy = Math.abs(g.vy); }
  if (g.y > H - m) { g.y = H - m; g.vy = -Math.abs(g.vy); }
}

function steerBotPlayer(bp) {
  const now = Date.now();
  const powered = bp.size >= GHOST_SIZE;
  let tx = 0, ty = 0, has = false;

  if (powered) {
    let bd = Infinity, tgt = null;
    for (const g of ghosts) {
      if (!g.active || now - g.bornAt < GHOST_BORN_MS) continue;
      const d = Math.hypot(g.x - bp.x, g.y - bp.y);
      if (d < bd) { bd = d; tgt = g; }
    }
    if (tgt) { tx = tgt.x - bp.x; ty = tgt.y - bp.y; has = true; }
  } else {
    let bd = Infinity, tgt = null;
    for (const pel of pellets) {
      const d = Math.hypot(pel.x - bp.x, pel.y - bp.y);
      if (d < bd) { bd = d; tgt = pel; }
    }
    if (tgt) { tx = tgt.x - bp.x; ty = tgt.y - bp.y; has = true; }
  }

  bp.wanderT--;
  if (bp.wanderT <= 0) { bp.wx = rand(-1, 1); bp.wy = rand(-1, 1); bp.wanderT = 30; }
  let dx = has ? tx : bp.wx, dy = has ? ty : bp.wy;
  let len = Math.hypot(dx, dy) || 1;
  dx = dx / len + bp.wx * 0.15; dy = dy / len + bp.wy * 0.15;
  len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;

  bp.vx += dx * BOT_PLAYER_SPEED; bp.vy += dy * BOT_PLAYER_SPEED;
  bp.vx *= 0.75; bp.vy *= 0.75;
  bp.x = Math.max(20, Math.min(Display.width - 20, bp.x + bp.vx));
  bp.y = Math.max(20, Math.min(Display.height - 20, bp.y + bp.vy));
}

function explode(x, y, color) {
  rings.push({ x, y, r: 24, maxR: 300, color: '#ffffff', life: 1, width: 6, grow: 0.11 });
  rings.push({ x, y, r: 16, maxR: 250, color, life: 1, width: 10, grow: 0.10 });
  rings.push({ x, y, r: 10, maxR: 190, color: '#ff9f1c', life: 1, width: 8, grow: 0.09 });
  for (let i = 0; i < 42; i++) {
    const a = rand(0, TAU), sp = rand(3, 16), fire = i < 28;
    embers.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: rand(0.014, 0.022), fire, hue: fire ? 0 : rand(0, 360) });
  }
}

function updateAndDrawField(attractors) {
  fieldTime += FIELD_NOISE_TIME;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < FIELD_COUNT; i++) {
    let x = field.x[i], y = field.y[i], vx = field.vx[i], vy = field.vy[i];
    const ang = noise.noise(x * FIELD_NOISE_SCALE, y * FIELD_NOISE_SCALE + fieldTime) * TAU * 2;
    vx += Math.cos(ang) * FIELD_FLOW; vy += Math.sin(ang) * FIELD_FLOW;
    for (let a = 0; a < attractors.length; a++) {
      const at = attractors[a];
      const dx = at.x - x, dy = at.y - y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2) + 0.001;
      const ar = (at.w * FIELD_GRAVITY) / (d2 + FIELD_SOFTEN), sw = (at.w * FIELD_SWIRL) / (d2 + FIELD_SOFTEN);
      vx += ar * dx / d + sw * -dy / d; vy += ar * dy / d + sw * dx / d;
    }
    vx *= FIELD_DAMP; vy *= FIELD_DAMP;
    const sp = Math.hypot(vx, vy);
    if (sp > FIELD_MAX_SPEED) { vx = vx / sp * FIELD_MAX_SPEED; vy = vy / sp * FIELD_MAX_SPEED; }
    const px = x, py = y; x += vx; y += vy;
    let wrapped = false;
    if (x < 0) { x += Display.width; wrapped = true; } else if (x >= Display.width) { x -= Display.width; wrapped = true; }
    if (y < 0) { y += Display.height; wrapped = true; } else if (y >= Display.height) { y -= Display.height; wrapped = true; }
    if (!wrapped) {
      const hue = ((Math.atan2(vy, vx) / TAU) * 360 + 360) % 360;
      ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${FIELD_ALPHA})`;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
    }
    field.x[i] = x; field.y[i] = y; field.vx[i] = vx; field.vy[i] = vy;
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* An energy pod: glowing halo + solid body + white core + a spinning arc.
   Deliberately object-like so it never reads as a background star. */
function drawPod(p, now) {
  const r = p.r * (0.9 + 0.1 * Math.sin(now / 350 + p.phase));
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.42, 0, TAU); ctx.fill();

  const a = now / 550 + p.phase;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.55, a, a + Math.PI * 1.25); ctx.stroke();
}

function renderGame(floor) {
  const now = Date.now();

  for (const bp of botPlayers) steerBotPlayer(bp);

  /* Unified player list (humans + bot-players). */
  const players = [];
  const liveIds = new Set();
  for (const user of floor.users) {
    if (user.id < 0) continue;
    if (!Number.isFinite(user.x) || !Number.isFinite(user.y)) continue;
    liveIds.add(user.id);
    let st = playerState.get(user.id);
    if (!st) { st = { size: START_SIZE, powered: false }; playerState.set(user.id, st); }
    players.push({ owner: st, id: user.id, x: user.x, y: user.y, size: st.size, color: PALETTE[user.id % PALETTE.length], isBot: false });
  }
  for (const id of playerState.keys()) if (!liveIds.has(id)) playerState.delete(id);
  const humanCount = liveIds.size;
  for (const bp of botPlayers) players.push({ owner: bp, id: bp.id, x: bp.x, y: bp.y, size: bp.size, color: bp.color, isBot: true });

  adjustGhosts(humanCount, now);

  /* Ghosts: respawn timers + movement. */
  for (const g of ghosts) {
    if (!g.active) {
      if (now >= g.respawnAt) {
        placeGhost(g);
        rings.push({ x: g.x, y: g.y, r: 90, maxR: 20, color: '#ffffff', life: 1, width: 4, grow: 0.2, shrink: true });
      }
      continue;
    }
    steerGhost(g, players);
  }

  /* Collect pods → grow. */
  for (const p of players) {
    const r = orbRadius(p.size);
    for (let i = 0; i < pellets.length; i++) {
      const pel = pellets[i];
      if (Math.hypot(pel.x - p.x, pel.y - p.y) < r) {
        p.size = Math.min(MAX_SIZE, p.size + PELLET_VALUE);
        rings.push({ x: pel.x, y: pel.y, r: 4, maxR: 18, color: pel.color, life: 1, width: 3, grow: 0.28 });
        pellets[i] = spawnPellet();
      }
    }
    p.owner.size = p.size;
  }

  /* Powered players eat ghosts. */
  for (const p of players) {
    if (p.size < GHOST_SIZE) continue;
    const r = orbRadius(p.size);
    for (const g of ghosts) {
      if (!g.active || now - g.bornAt < GHOST_BORN_MS) continue;
      if (Math.hypot(g.x - p.x, g.y - p.y) < r) {
        explode(p.x, p.y, p.color);
        g.active = false; g.respawnAt = now + GHOST_RESPAWN_MS;
        p.size = START_SIZE; p.owner.size = START_SIZE;
        if (DEBUG) console.log(`[eat-and-grow] ${p.isBot ? 'bot' : 'player'} ${p.id} ate ghost ${g.emoji}`);
        break;
      }
    }
  }

  /* Detect power-up transitions (for the screen flash). */
  for (const p of players) {
    const nowPow = p.size >= GHOST_SIZE;
    if (nowPow && !p.owner.powered) { powerFlashUntil = now + POWER_FLASH_MS; powerFlashColor = p.color; }
    p.owner.powered = nowPow;
  }

  /* ── Render ── */
  const bg = ctx.createRadialGradient(430, 380, 60, 512, 512, 820);
  bg.addColorStop(0, '#121830'); bg.addColorStop(0.55, '#0a0e1c'); bg.addColorStop(1, '#05070f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const s of bgStars) {
    ctx.globalAlpha = Math.max(0, s.base * (0.55 + 0.45 * Math.sin(now / 1000 * s.twinkle + s.phase)));
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  const attractors = [];
  for (const p of players) attractors.push({ x: p.x, y: p.y, w: 1 });
  for (const g of ghosts) if (g.active) attractors.push({ x: g.x, y: g.y, w: 0.7 });
  updateAndDrawField(attractors);

  for (const p of pellets) drawPod(p, now);

  /* Ghosts — bigger and glowier; they own the screen. */
  for (const g of ghosts) {
    if (!g.active) continue;
    const grow = Math.min(1, (now - g.bornAt) / GHOST_BORN_MS);
    const r = orbRadius(GHOST_SIZE) * grow;
    const glow = g.fleeing ? FRIGHT_COLOR : g.color;
    const jitter = g.fleeing ? rand(-3, 3) : 0;

    ctx.shadowColor = glow; ctx.shadowBlur = 40;
    ctx.globalAlpha = 0.5; ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    ctx.font = `${r * 2.5}px "Apple Color Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(g.emoji, g.x + jitter, g.y);
  }

  /* Players (humans + bots) as glossy orbs; gold ring when powered. */
  for (const p of players) {
    const r = orbRadius(p.size);
    ctx.shadowColor = p.color; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fillStyle = p.color; ctx.fill();
    ctx.shadowBlur = 0;

    const hl = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
    hl.addColorStop(0, 'rgba(255,255,255,0.5)'); hl.addColorStop(0.5, 'rgba(255,255,255,0.08)'); hl.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = hl;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();

    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.setLineDash(p.isBot ? [10, 8] : []);
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    if (p.size >= GHOST_SIZE) {
      const pulse = 1 + 0.1 * Math.sin(now / 150);
      ctx.strokeStyle = '#ffd60a'; ctx.shadowColor = '#ffd60a'; ctx.shadowBlur = 22; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, (r + 12) * pulse, 0, TAU); ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  /* Power-up screen-edge flash. */
  if (now < powerFlashUntil) {
    const t = (powerFlashUntil - now) / POWER_FLASH_MS;
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(512, 512, 320, 512, 512, 780);
    fg.addColorStop(0, powerFlashColor + '00');
    fg.addColorStop(1, powerFlashColor + a2(0.55 * t));
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  /* Explosion rings. */
  for (let i = rings.length - 1; i >= 0; i--) {
    const e = rings[i];
    e.r += (e.maxR - e.r) * (e.grow || 0.12);
    e.life -= e.shrink ? 0.05 : 0.02;
    if (e.life <= 0) { rings.splice(i, 1); continue; }
    ctx.globalAlpha = Math.max(0, e.life);
    ctx.strokeStyle = e.color; ctx.lineWidth = e.width || 4;
    ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(1, e.r), 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* Fiery/rainbow embers. */
  ctx.globalCompositeOperation = 'lighter';
  for (let i = embers.length - 1; i >= 0; i--) {
    const e = embers[i];
    e.x += e.vx; e.y += e.vy; e.vx *= 0.93; e.vy *= 0.93; e.vx += rand(-0.35, 0.35);
    e.life -= e.decay;
    if (e.life <= 0) { embers.splice(i, 1); continue; }
    const size = 10 * e.life + 2;
    ctx.fillStyle = e.fire
      ? `hsla(${55 * e.life}, 100%, ${45 + 35 * e.life}%, ${e.life})`
      : `hsla(${e.hue}, 100%, 62%, ${e.life})`;
    ctx.beginPath(); ctx.arc(e.x, e.y, size, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
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
    if (!errorLogged) { console.error('[eat-and-grow] render error:', err); errorLogged = true; }
    try { drawError(err); } catch (_) { /* ignore */ }
  }
}

export const behavior = {
  title: "Eat & Grow (Starfield Ghost Hunt)",
  frameRate: 'animate',
  numGhosts: 0,
  init: init,
  render: render,
};
export default behavior;

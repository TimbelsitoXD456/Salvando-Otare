// food.js - comida que aparece en el mapa y cura vida: tipos, reglas de aparición y dibujo.
// Los sprites son pixel art escrito aquí mismo (una letra = un color) y se pasan a un canvas
// la primera vez que se dibujan; las simulaciones sin dibujar nunca los crean.

export const FOOD_LIFETIME = 15;          // segundos hasta que desaparece si nadie la coge
export const FOOD_WARNING_TIME = 5;       // últimos segundos: parpadea y se va poniendo roja
export const FOOD_SPAWN_FIRST = 8;        // la primera aparece a los 8 s de partida
export const FOOD_SPAWN_INTERVAL = [10, 14]; // luego una cada 10-14 s
export const FOOD_MAX_ON_MAP = 2;
export const FOOD_SIZE = 30;              // 10x10 píxeles a escala 3

const PX = 3;

// Paleta: una letra = un color ('.' = transparente)
const PALETTE = {
  r: '#e8323c', R: '#a3141e', w: '#ffffff', g: '#3fcf4a', b: '#6b3d1e',        // manzana
  y: '#c9822b', Y: '#f2b544', c: '#8a5418',                                      // empanada
  p: '#ff7eb6', P: '#ff4f9a', k: '#d9365a', m: '#8a4b2a', M: '#b0683a',          // cupcake
  s: '#d9a066', W: '#fff3e0', f: '#ffd400', F: '#ff8c00', n: '#7fd3ff'           // torta
};

export const FOOD_TYPES = {
  manzana:  { label: 'Manzana',  heal: 15, weight: 40, glow: '#ff6b6b', sprite: [
    '....bg....',
    '....bgg...',
    '..rrbrrr..',
    '.rrrrrrrr.',
    '.rwrrrrrr.',
    '.rwrrrrrR.',
    '.rrrrrrrR.',
    '.rrrrrrRR.',
    '..rrrrRR..',
    '...rr.rR..'
  ] },
  empanada: { label: 'Empanada', heal: 25, weight: 35, glow: '#ffc857', sprite: [
    '..........',
    '..........',
    '...yyyy...',
    '..yYYYYy..',
    '.yYYwYYYy.',
    'yYYYYYYYYy',
    'yYYYYYYYYy',
    'yyyyyyyyyy',
    'cycycycycy',
    '..........'
  ] },
  cupcake:  { label: 'Cupcake',  heal: 35, weight: 18, glow: '#ff8fd0', sprite: [
    '.....k....',
    '....kk....',
    '..pppppp..',
    '.ppwpPppp.',
    'ppppppPppp',
    '.PpppppPp.',
    '.mMmMmMmM.',
    '.mMmMmMmM.',
    '..mMmMmM..',
    '..mMmMmM..'
  ] },
  torta:    { label: 'Torta',    heal: 60, weight: 7,  glow: '#fff07a', sprite: [
    '....F.....',
    '....f.....',
    '....n.....',
    '.pPpPpPpP.',
    '.WWWWWWWW.',
    '.ssssssss.',
    '.pppppppp.',
    '.ssssssss.',
    '.WWWWWWWW.',
    '..........'
  ] }
};

// Tipo al azar según su peso (las que más curan salen menos)
export function randomFoodKind() {
  const kinds = Object.keys(FOOD_TYPES);
  const total = kinds.reduce((a, k) => a + FOOD_TYPES[k].weight, 0);
  let r = Math.random() * total;
  for (const k of kinds) { r -= FOOD_TYPES[k].weight; if (r < 0) return k; }
  return kinds[0];
}

// ---------- dibujo ----------
const spriteCache = {};
function makeSprite(rows, tint) {
  const c = document.createElement('canvas');
  c.width = rows[0].length * PX; c.height = rows.length * PX;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = PALETTE[ch] || '#fff';
    g.fillRect(x * PX, y * PX, PX, PX);
  }));
  if (tint) { // misma silueta, toda roja (para cuando va a desaparecer)
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
  }
  return c;
}
function sprites(kind) {
  if (!spriteCache[kind]) {
    const rows = FOOD_TYPES[kind].sprite;
    spriteCache[kind] = { normal: makeSprite(rows), red: makeSprite(rows, '#ff2a2a') };
  }
  return spriteCache[kind];
}

// time: reloj de la partida en segundos (para animar brillo, flotación y parpadeo)
export function drawFood(ctx, f, time) {
  const { normal, red } = sprites(f.kind);
  const warn = f.life < FOOD_WARNING_TIME ? 1 - f.life / FOOD_WARNING_TIME : 0; // 0 → 1 al acercarse al final
  // parpadeo cada vez más rápido en los últimos segundos
  if (warn > 0) {
    const freq = 3 + warn * 9;
    if (Math.sin((time + f.phase) * freq * Math.PI * 2) < -0.3) return;
  }
  const bob = Math.sin((time + f.phase) * 3) * 3;
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2 + bob;
  const pulse = 0.5 + 0.5 * Math.sin((time + f.phase) * 5);
  const glow = warn > 0.5 ? '#ff2a2a' : FOOD_TYPES[f.kind].glow;

  ctx.save();
  // halo luminoso que late
  const radius = f.w * (0.9 + 0.25 * pulse);
  const halo = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
  halo.addColorStop(0, hexAlpha(glow, 0.55 + 0.25 * pulse));
  halo.addColorStop(1, hexAlpha(glow, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // sprite con resplandor; se va volviendo rojo
  ctx.imageSmoothingEnabled = false;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 10 + 10 * pulse;
  const x = Math.round(cx - normal.width / 2), y = Math.round(cy - normal.height / 2);
  ctx.drawImage(normal, x, y);
  if (warn > 0) { ctx.globalAlpha = Math.min(1, warn * 1.2); ctx.drawImage(red, x, y); ctx.globalAlpha = 1; }
  ctx.shadowBlur = 0;

  // destellos: dos estrellitas que giran alrededor
  if (warn < 0.5) {
    for (let i = 0; i < 2; i++) {
      const a = (time + f.phase) * 2.2 + i * Math.PI;
      const sx = cx + Math.cos(a) * f.w * 0.7, sy = cy + Math.sin(a) * f.h * 0.55;
      const sz = 2 + Math.round(2 * (0.5 + 0.5 * Math.sin((time + f.phase) * 9 + i * 2)));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(sx - sz / 2), Math.round(sy - 0.5), sz, 1 + (sz > 3 ? 1 : 0));
      ctx.fillRect(Math.round(sx - 0.5), Math.round(sy - sz / 2), 1 + (sz > 3 ? 1 : 0), sz);
    }
  }
  ctx.restore();
}

// Texto "+25" que sube y se desvanece al comer
export function drawFloatText(ctx, t) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, t.life / 0.4));
  ctx.fillStyle = t.color;
  ctx.font = '12px "Press Start 2P", monospace';
  ctx.fillText(t.text, Math.round(t.x), Math.round(t.y));
  ctx.restore();
}

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

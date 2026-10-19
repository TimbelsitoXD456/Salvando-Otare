// menuBackground.js - fondo del menú: Otare en pixel art al atardecer, con colores vintage.
// Se dibuja a baja resolución (W x H) y el CSS lo amplía pixelado (image-rendering: pixelated).
// Las capas fijas (cielo, sol, montañas, pueblo, vegetación) se pintan una vez; en cada fotograma solo
// se mueven las nubes y titilan algunas ventanas.

const W = 384, H = 216;

// azar con semilla: el paisaje sale siempre igual
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Paleta vintage de atardecer
const SKY = ['#1b1440', '#271a52', '#3a2166', '#5a2a74', '#7f3576', '#a84772', '#d0606a', '#ec8a62', '#f6b46a'];
const SUN = ['#ffe58a', '#ffc46a', '#ff9a5c', '#ff6f6f', '#f0507e'];
const C = {
  star: '#fff3d6',
  cloud: '#f7c9c4', cloudShade: '#c98aa6', cloudDark: '#9a6a9a',
  farMtn: '#5d3d78', farMtnLit: '#7a4f86',
  midMtn: '#3f6455', midMtnLit: '#5a7d58', midMtnDark: '#2f4c45',
  hill: '#5f8445', hillLit: '#7fa052', hillDark: '#47683a',
  road: '#c9ae8c', roadEdge: '#9c826a',
  wall: ['#f3e6d2', '#ead7bf', '#f6efe2', '#e2cbb0', '#f1dcc8'],
  wallShade: '#c9b39a',
  roof: ['#b5523a', '#9c4231', '#c8673f', '#8a3a2c'],
  roofDark: '#6e2c22',
  win: '#3b2a3a', winLit: '#ffd06a',
  leaf: '#24402c', leafLit: '#36593a', leafDark: '#162a1e',
  trunk: '#3a2a22'
};

let staticBack = null;   // cielo + sol
let staticFront = null;  // montañas, pueblo y vegetación
let clouds = [];
let windows = [];        // ventanas que pueden encenderse/apagarse

function layer() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return c;
}
const px = (g, x, y, w = 1, h = 1) => g.fillRect(Math.round(x), Math.round(y), w, h);

// ---------- cielo con bandas y tramado (dithering) entre ellas ----------
function drawSky(g, rnd) {
  const horizon = 132, band = horizon / SKY.length;
  for (let y = 0; y < H; y++) {
    const f = Math.min(SKY.length - 1, y / band);
    const i = Math.floor(f), frac = f - i;
    for (let x = 0; x < W; x++) {
      // tramado de Bayer 2x2: mezcla dos bandas vecinas a cuadritos
      const bayer = [[0, 0.5], [0.75, 0.25]][y & 1][x & 1];
      g.fillStyle = SKY[Math.min(SKY.length - 1, i + (frac > bayer + 0.12 ? 1 : 0))];
      px(g, x, y);
    }
  }
  // estrellas arriba
  g.fillStyle = C.star;
  for (let k = 0; k < 40; k++) {
    const x = rnd() * W, y = rnd() * 45;
    px(g, x, y);
    if (rnd() < 0.15) { px(g, x - 1, y); px(g, x + 1, y); px(g, x, y - 1); px(g, x, y + 1); }
  }
}

// ---------- sol a franjas (como el del menú) ----------
function drawSun(g) {
  const cx = 182, cy = 104, r = 36;
  for (let y = -r; y <= r; y++) {
    const yy = cy + y;
    if (y > 2 && ((y - 2) % 7) < Math.min(4, 1 + (y - 2) / 9)) continue; // franjas que se ensanchan
    const half = Math.floor(Math.sqrt(r * r - y * y));
    g.fillStyle = SUN[Math.min(SUN.length - 1, Math.floor((y + r) / (2 * r) * SUN.length))];
    px(g, cx - half, yy, half * 2 + 1, 1);
  }
}

// ---------- montañas: línea de cresta con senos, rellena hacia abajo ----------
function ridge(x, base, parts) {
  return base + parts.reduce((s, [a, f, p]) => s + a * Math.sin(x * f + p), 0);
}
function drawMountain(g, base, parts, color, lit, dark) {
  let prev = ridge(0, base, parts);
  for (let x = 0; x < W; x++) {
    const top = Math.round(ridge(x, base, parts));
    g.fillStyle = color;
    px(g, x, top, 1, H - top);
    // borde iluminado por el sol (lado izquierdo de las laderas)
    g.fillStyle = top <= prev ? lit : (dark || color);
    px(g, x, top, 1, 2);
    prev = top;
  }
}

// colina cercana donde está el pueblo. La cumbre va en el centro-izquierda (x≈165) para que el pueblo
// quede en la zona que no tapan ni el título (izquierda) ni el panel del menú (derecha).
const TOWN_X = 165;
const hillY = x => 166 - 32 * Math.exp(-(((x - TOWN_X) / 95) ** 2)) - 16 * Math.exp(-(((x - 335) / 60) ** 2));

function drawHill(g, rnd) {
  for (let x = 0; x < W; x++) {
    const top = Math.round(hillY(x));
    g.fillStyle = C.hill; px(g, x, top, 1, H - top);
    g.fillStyle = C.hillLit; px(g, x, top, 1, 2);
    // textura de pasto/arbustos
    for (let y = top + 3; y < H; y += 3) {
      if (rnd() < 0.18) { g.fillStyle = rnd() < 0.5 ? C.hillDark : C.hillLit; px(g, x, y + Math.floor(rnd() * 3)); }
    }
  }
}

// carretera que sube zigzagueando por el pueblo
function drawRoad(g) {
  const pts = [[118, 216], [150, 200], [196, 190], [176, 174], [214, 158], [182, 140]];
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s++) {
      const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
      g.fillStyle = C.roadEdge; px(g, x - 2, y, 5, 1);
      g.fillStyle = C.road; px(g, x - 1, y, 3, 1);
    }
  }
}

// casitas blancas con techos de teja, en terrazas por la ladera
function drawTown(g, rnd) {
  windows = [];
  const houses = [];
  for (let row = 0; row < 7; row++) {
    for (let x = 60 + rnd() * 10; x < 280; x += 7 + rnd() * 8) {
      const ground = hillY(x) + 6 + row * 9 + rnd() * 3;
      if (ground > 207) continue;
      // más casas cerca de la cumbre y la carretera; menos en los bordes
      const density = Math.exp(-(((x - TOWN_X) / 70) ** 2));
      if (rnd() > 0.25 + density) continue;
      houses.push({ x, ground, w: 6 + Math.floor(rnd() * 7), h: 4 + Math.floor(rnd() * 4), wall: C.wall[Math.floor(rnd() * C.wall.length)], roof: C.roof[Math.floor(rnd() * C.roof.length)], lights: rnd() });
    }
  }
  houses.sort((a, b) => a.ground - b.ground);   // de atrás (arriba) hacia delante (abajo)
  for (const h of houses) {
    const x = Math.round(h.x), top = Math.round(h.ground - h.h);
    g.fillStyle = h.wall; px(g, x, top, h.w, h.h);
    g.fillStyle = C.wallShade; px(g, x + h.w - 1, top, 1, h.h);              // lado en sombra
    // techo de teja a dos aguas (más ancho que la pared)
    g.fillStyle = h.roof; px(g, x - 1, top - 2, h.w + 2, 2);
    g.fillStyle = C.roofDark; px(g, x - 1, top - 1, h.w + 2, 1);
    g.fillStyle = h.roof; px(g, x + 1, top - 3, h.w - 2, 1);
    // ventanas y puerta
    for (let wx = x + 1; wx < x + h.w - 2; wx += 3) {
      const lit = h.lights < 0.55 && Math.random() < 0.6;
      g.fillStyle = lit ? C.winLit : C.win;
      px(g, wx, top + 1);
      windows.push({ x: wx, y: top + 1, lit });
    }
    if (h.h >= 6) { g.fillStyle = C.win; px(g, x + Math.floor(h.w / 2), top + h.h - 2, 1, 2); }
  }
}

// vegetación en primer plano: matas y hojas de plátano oscuras
function drawForeground(g, rnd) {
  for (let x = -10; x < W + 10; x += 6 + rnd() * 10) {
    const base = 216, hgt = 10 + rnd() * 26;
    // tronquito
    if (rnd() < 0.3) { g.fillStyle = C.trunk; px(g, x, base - hgt * 0.6, 2, hgt * 0.6); }
    // hojas: abanico de rayas gruesas
    const leaves = 3 + Math.floor(rnd() * 4);
    for (let l = 0; l < leaves; l++) {
      const ang = -Math.PI / 2 + (l / (leaves - 1 || 1) - 0.5) * 2.4 + (rnd() - 0.5) * 0.3;
      const len = hgt * (0.6 + rnd() * 0.5);
      for (let s = 0; s < len; s++) {
        const lx = x + Math.cos(ang) * s, ly = base - hgt * 0.5 + Math.sin(ang) * s + (s * s) / (len * 3);
        g.fillStyle = s > len * 0.7 ? C.leafLit : (s % 4 === 0 ? C.leafDark : C.leaf);
        px(g, lx, ly, 2, 2);
      }
    }
  }
  g.fillStyle = C.leafDark; px(g, 0, 212, W, 4);
}

// nube de bloques: varios "bultos" redondeados con sombra abajo
function makeCloud(rnd, x, y) {
  const puffs = [];
  const n = 3 + Math.floor(rnd() * 4);
  for (let k = 0; k < n; k++) puffs.push({ dx: k * 7 + rnd() * 4, dy: -rnd() * 6, r: 4 + rnd() * 5 });
  return { x, y, speed: 2 + rnd() * 4, puffs };
}
function drawCloud(g, cl) {
  for (const layerColor of [C.cloudDark, C.cloudShade, C.cloud]) {
    const shrink = layerColor === C.cloudDark ? 0 : layerColor === C.cloudShade ? 1 : 2;
    const lift = layerColor === C.cloud ? 1 : 0;
    g.fillStyle = layerColor;
    for (const p of cl.puffs) {
      const r = p.r - shrink;
      for (let y = -r; y <= r; y++) {
        const half = Math.floor(Math.sqrt(r * r - y * y));
        if (y > 1 && layerColor !== C.cloudDark) continue;           // base plana
        px(g, cl.x + p.dx - half, cl.y + p.dy + y - lift, half * 2 + 1, 1);
      }
    }
  }
}

function build() {
  const rnd = seeded(20260519);
  staticBack = layer();
  const b = staticBack.getContext('2d');
  drawSky(b, rnd);
  drawSun(b);

  staticFront = layer();
  const f = staticFront.getContext('2d');
  drawMountain(f, 112, [[10, 0.018, 0.4], [6, 0.047, 1.3], [2, 0.13, 0.2]], C.farMtn, C.farMtnLit);
  drawMountain(f, 132, [[14, 0.012, 2.2], [7, 0.035, 0.6], [2, 0.11, 1.1]], C.midMtn, C.midMtnLit, C.midMtnDark);
  drawHill(f, rnd);
  drawRoad(f);
  drawTown(f, rnd);
  drawForeground(f, rnd);

  clouds = [];
  for (let k = 0; k < 7; k++) clouds.push(makeCloud(rnd, rnd() * (W + 80) - 40, 18 + rnd() * 60));
}

// canvas: <canvas class="otare-bg">; isVisible(): si el menú se ve (en partida no se dibuja)
export function startMenuBackground(canvas, isVisible = () => true) {
  if (!canvas) return;
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  build();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (isVisible()) {
      g.drawImage(staticBack, 0, 0);
      for (const cl of clouds) {
        if (!still) {
          cl.x += cl.speed * dt;
          if (cl.x > W + 10) cl.x = -60;
        }
        drawCloud(g, cl);
      }
      g.drawImage(staticFront, 0, 0);
      // alguna ventana se enciende o se apaga de vez en cuando
      if (!still && Math.random() < dt * 1.5 && windows.length) {
        const w = windows[Math.floor(Math.random() * windows.length)];
        w.lit = !w.lit;
        const f = staticFront.getContext('2d');
        f.fillStyle = w.lit ? C.winLit : C.win;
        px(f, w.x, w.y);
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

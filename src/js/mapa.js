// mapa.js - escenario de la partida en pixel art, inspirado en Otare: cielo nublado, montañas verdes,
// la iglesia blanca con molduras amarillas, casas con tejado de barro, araucarias, postes de luz y una
// carretera de tierra. Las plataformas son tablones de madera; los "pinchos" son zarzales con espinas y
// el "hielo" son tablones mojados con charcos.
//
// El fondo va en capas que se mueven más despacio que la cámara (paralaje). Cada capa se dibuja una sola
// vez en un lienzo aparte (caché) y luego solo se copia: dibujar el escenario cuesta casi nada por frame.
// Solo dibujo: no cambia ninguna colisión.

// ---------- utilidades ----------
function rng(seed) {                       // aleatorio con semilla: el paisaje sale siempre igual
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}
const px = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

// paralaje de cada capa (0 = quieta, 1 = se mueve con el mundo)
const PARALLAX = { clouds: 0.06, far: 0.12, near: 0.25, town: 0.42, trees: 0.62, poles: 0.8 };

// ---------- capas del fondo ----------
function drawClouds(g, w, horizon) {
  const r = rng(11);
  for (let i = 0; i < Math.ceil(w / 170); i++) {
    const cx = i * 170 + r() * 90, cy = 30 + r() * horizon * 0.35, s = 0.7 + r() * 0.8;
    for (let k = 0; k < 6; k++) {
      const bx = cx + (k - 2.5) * 22 * s + r() * 10, by = cy + Math.sin(k * 1.3) * 8 * s;
      const rad = (18 + r() * 16) * s;
      g.fillStyle = k % 2 ? '#e9eef1' : '#f6f8f9';
      g.beginPath(); g.arc(bx, by, rad, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(160,174,186,0.55)';           // panza gris de la nube (sombreada, redonda)
    for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(cx + (k - 1.5) * 24 * s, cy + 12 * s, 20 * s, 7 * s, 0, 0, Math.PI * 2); g.fill(); }
  }
}

// cordillera: línea de cresta con ruido; textura de bosque con puntitos
function drawRidge(g, w, h, baseY, amp, seed, col, dotA, dotB, dotChance) {
  const r = rng(seed);
  const pts = [];
  let y = baseY;
  for (let x = 0; x <= w + 8; x += 8) {
    y += (r() - 0.5) * amp * 0.35 + (baseY - y) * 0.08 + Math.sin(x * 0.006 + seed) * amp * 0.05;
    pts.push([x, y]);
  }
  g.fillStyle = col;
  g.beginPath(); g.moveTo(0, h);
  pts.forEach(([x, yy]) => g.lineTo(x, yy));
  g.lineTo(w + 8, h); g.closePath(); g.fill();
  // copas de árboles en la ladera (puntitos claros y oscuros)
  for (const [x, yy] of pts) {
    for (let d = 2; d < h - yy; d += 7) {
      if (r() < dotChance) px(g, x + r() * 6, yy + d, 3, 2, r() < 0.5 ? dotA : dotB);
    }
    px(g, x, yy - 2, 8, 3, dotA);                      // borde irregular de árboles en la cresta
    if (r() < 0.5) px(g, x + 2, yy - 4, 4, 2, dotA);
  }
}

// La iglesia de Otare: fachada blanca con frontón curvo, molduras amarillas, puerta en arco,
// rosetón cuadrilobulado, remate dorado y campanario a la derecha; tejado de barro detrás.
function drawChurch(g, x, groundY) {
  const W = 132, H = 84, top = groundY - H;
  const Y = '#e2a82c', Yd = '#b27d17', Wh = '#f3f1ea', Sh = '#d9d5c9';
  // tejado de barro detrás (nave)
  g.fillStyle = '#a4502f';
  g.beginPath(); g.moveTo(x - 70, top + 26); g.lineTo(x + 10, top + 4); g.lineTo(x + 14, top + 26); g.closePath(); g.fill();
  for (let i = 0; i < 10; i++) px(g, x - 64 + i * 8, top + 24 - i * 2, 6, 2, '#7d3a22');
  px(g, x - 70, top + 26, 84, H - 26, Wh);            // muro lateral de la nave
  px(g, x - 70, groundY - 10, 84, 10, Y);              // zócalo amarillo
  // campanario (derecha)
  px(g, x + W - 34, top - 6, 42, H + 6, Wh);
  px(g, x + W - 34, top - 6, 42, 3, Y);
  for (let i = 0; i < 3; i++) px(g, x + W - 32 + i * 14, top - 14, 10, 8, Wh);   // almenas curvas
  px(g, x + W - 22, top + 14, 14, 20, '#3b3a3a');       // ventana del campanario
  px(g, x + W - 22, top + 12, 14, 3, Y);
  px(g, x + W - 36, top - 6, 3, H + 6, Y);
  // fachada principal con frontón curvo
  g.fillStyle = Wh;
  g.beginPath();
  g.moveTo(x, groundY); g.lineTo(x, top + 34);
  g.quadraticCurveTo(x + 6, top + 10, x + 34, top + 8);
  g.lineTo(x + W / 2 - 12, top - 4); g.lineTo(x + W / 2, top - 10); g.lineTo(x + W / 2 + 12, top - 4);
  g.lineTo(x + W - 34, top + 8);
  g.quadraticCurveTo(x + W - 10, top + 12, x + W - 6, top + 34);
  g.lineTo(x + W - 6, groundY); g.closePath(); g.fill();
  g.strokeStyle = Y; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x + 2, top + 34); g.quadraticCurveTo(x + 8, top + 12, x + 34, top + 10); g.lineTo(x + W / 2, top - 7);
  g.lineTo(x + W - 34, top + 10); g.quadraticCurveTo(x + W - 12, top + 14, x + W - 8, top + 34); g.stroke();
  px(g, x + W / 2 - 3, top - 22, 6, 12, Y);            // remate dorado
  g.fillStyle = Y; g.beginPath(); g.arc(x + W / 2, top - 23, 4, 0, Math.PI * 2); g.fill();
  px(g, x, top + 34, W - 6, 4, Y);                     // cornisa
  px(g, x, top + 38, W - 6, 2, Sh);
  // pilastras amarillas
  for (const cx of [x + 4, x + 34, x + W - 46, x + W - 18]) { px(g, cx, top + 40, 9, H - 40, Y); px(g, cx + 6, top + 40, 3, H - 40, Yd); }
  // puerta en arco
  const dx = x + W / 2 - 15, dy = groundY - 34;
  g.fillStyle = '#4a2416'; g.beginPath(); g.moveTo(dx, groundY); g.lineTo(dx, dy + 12); g.arc(dx + 15, dy + 12, 15, Math.PI, 0); g.lineTo(dx + 30, groundY); g.closePath(); g.fill();
  g.strokeStyle = Y; g.lineWidth = 3; g.beginPath(); g.arc(dx + 15, dy + 12, 17, Math.PI, 0); g.stroke();
  // rosetón cuadrilobulado y dos óculos
  const rx = x + W / 2, ry = top + 22;
  g.fillStyle = Y; for (const [ox, oy] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) { g.beginPath(); g.arc(rx + ox, ry + oy, 6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#2b2b2b'; for (const [ox, oy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) { g.beginPath(); g.arc(rx + ox, ry + oy, 3.5, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = Y; g.lineWidth = 2;
  for (const ox of [-26, 26]) { g.beginPath(); g.arc(rx + ox, ry + 4, 4, 0, Math.PI * 2); g.stroke(); }
  px(g, x - 70, groundY - 2, W + 80, 2, '#9c3d2a');    // plaza de baldosas rojas
}

function drawHouse(g, x, groundY, w, h, r) {
  const wall = r() < 0.7 ? '#efe9dd' : '#e9d6a8';
  px(g, x, groundY - h, w, h, wall);
  px(g, x, groundY - 6, w, 6, r() < 0.5 ? '#c9a24a' : '#8fa7b8');   // zócalo
  g.fillStyle = '#a4502f';                                           // tejado de barro
  g.beginPath(); g.moveTo(x - 6, groundY - h); g.lineTo(x + w / 2, groundY - h - h * 0.45); g.lineTo(x + w + 6, groundY - h); g.closePath(); g.fill();
  for (let i = 0; i < w / 6; i++) px(g, x - 4 + i * 6, groundY - h - 2, 4, 2, '#7d3a22');
  px(g, x + w * 0.2, groundY - h * 0.55, 8, 9, '#3f5b6b');           // ventana
  px(g, x + w * 0.6, groundY - 18, 10, 18, '#5a2e1a');               // puerta
}

function drawTown(g, w, groundY) {
  const r = rng(77);
  let x = 30;
  while (x < w) {
    if (Math.abs(x - 520) < 140) { x = 690; continue; }   // hueco para la iglesia
    const hw = 46 + r() * 34, hh = 30 + r() * 18;
    drawHouse(g, x, groundY, hw, hh, r);
    x += hw + 18 + r() * 70;
  }
  drawChurch(g, 540, groundY);
}

// araucaria (como la de la foto): tronco fino y pisos de ramas oscuras que se abren hacia abajo
function drawAraucaria(g, x, groundY, h, r) {
  px(g, x - 2, groundY - h, 4, h, '#4a3524');
  const tiers = Math.floor(h / 16);
  for (let i = 0; i < tiers; i++) {
    const ty = groundY - h + 6 + i * 15, half = 6 + i * 3.4;
    g.fillStyle = i % 2 ? '#1f3b25' : '#26472c';
    g.beginPath(); g.moveTo(x - half, ty + 8); g.quadraticCurveTo(x, ty - 6, x + half, ty + 8); g.lineTo(x + half - 3, ty + 11); g.lineTo(x - half + 3, ty + 11); g.closePath(); g.fill();
    for (let k = 0; k < half / 3; k++) if (r() < 0.5) px(g, x - half + r() * half * 2, ty + 2 + r() * 6, 2, 2, '#3d6a43');
  }
}
function drawRoundTree(g, x, groundY, h, r) {
  px(g, x - 3, groundY - h * 0.45, 6, h * 0.45, '#5a3d27');
  for (let k = 0; k < 7; k++) {
    const bx = x + (r() - 0.5) * h * 0.55, by = groundY - h * 0.55 - r() * h * 0.35, rad = h * (0.16 + r() * 0.1);
    g.fillStyle = k % 3 === 0 ? '#2f5f2d' : k % 3 === 1 ? '#3b7436' : '#4c8a3f';
    g.beginPath(); g.arc(bx, by, rad, 0, Math.PI * 2); g.fill();
  }
}
function drawTrees(g, w, groundY) {
  const r = rng(303);
  for (let x = 20; x < w; x += 70 + r() * 110) {
    if (r() < 0.45) drawAraucaria(g, x, groundY, 120 + r() * 90, r);
    else drawRoundTree(g, x, groundY, 70 + r() * 50, r);
  }
}

// postes de luz con los cables colgando (en la foto cruzan todo el cielo)
function drawPoles(g, w, groundY) {
  const top = groundY - 190, gap = 420;
  const poles = [];
  for (let x = 120; x < w + gap; x += gap) poles.push(x);
  g.strokeStyle = 'rgba(40,40,40,0.75)'; g.lineWidth = 1.5;
  for (let i = 0; i < poles.length - 1; i++) {
    for (const dy of [0, 10, 20]) {
      const a = poles[i], b = poles[i + 1], y = top + 8 + dy;
      g.beginPath(); g.moveTo(a, y); g.quadraticCurveTo((a + b) / 2, y + 26, b, y); g.stroke();
    }
  }
  for (const x of poles) {
    px(g, x - 3, top, 6, groundY - top, '#6b5a4a');
    px(g, x - 16, top + 6, 32, 4, '#4f4236');
    px(g, x + 5, top + 34, 8, 6, '#6f7a80');           // transformador / lámpara
  }
}

// ---------- caché de capas ----------
let cache = null;
function buildLayers(W, H, groundY, mapW) {
  const horizon = groundY;
  const widthFor = f => W + Math.max(0, mapW - W) * f + 40;
  const L = {};
  // cielo nublado (fijo, del tamaño de la pantalla)
  L.sky = layer(W, H);
  const sky = L.sky.g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#8fa6b8'); sky.addColorStop(0.55, '#c3d0d9'); sky.addColorStop(1, '#e6ebee');
  L.sky.g.fillStyle = sky; L.sky.g.fillRect(0, 0, W, H);
  L.clouds = layer(widthFor(PARALLAX.clouds) + 400, horizon); drawClouds(L.clouds.g, L.clouds.c.width, horizon);
  L.far = layer(widthFor(PARALLAX.far), H);
  drawRidge(L.far.g, L.far.c.width, H, horizon - 250, 70, 5, '#6d8a78', '#7f9b88', '#5f7d6b', 0.25);
  L.near = layer(widthFor(PARALLAX.near), H);
  drawRidge(L.near.g, L.near.c.width, H, horizon - 175, 60, 9, '#2f5a36', '#3e7044', '#244a2b', 0.55);
  L.town = layer(widthFor(PARALLAX.town), H); drawTown(L.town.g, L.town.c.width, horizon);
  L.trees = layer(widthFor(PARALLAX.trees), H); drawTrees(L.trees.g, L.trees.c.width, horizon);
  L.poles = layer(widthFor(PARALLAX.poles), H); drawPoles(L.poles.g, L.poles.c.width, horizon);
  return L;
}

// Fondo de la partida, en coordenadas de pantalla (antes de mover la cámara)
export function drawBackdrop(ctx, { W, H, cameraX, groundY, mapW, time }) {
  const key = `${W}|${H}|${groundY}|${mapW}`;
  if (!cache || cache.key !== key) cache = { key, L: buildLayers(W, H, groundY, mapW), ground: null };
  const L = cache.L;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(L.sky.c, 0, 0);
  // las nubes además se desplazan solas, muy despacio
  const drift = (time * 6) % 400;
  ctx.drawImage(L.clouds.c, -Math.round(cameraX * PARALLAX.clouds + drift), 0);
  for (const name of ['far', 'near', 'town', 'trees', 'poles']) ctx.drawImage(L[name].c, -Math.round(cameraX * PARALLAX[name]), 0);
  ctx.imageSmoothingEnabled = prev;
}

// ---------- carretera de tierra (el suelo principal), en coordenadas del mundo ----------
function buildGround(w, h) {
  const { c, g } = layer(w, h);
  const r = rng(42);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#9b7a51'); grad.addColorStop(0.5, '#8a6a44'); grad.addColorStop(1, '#6e5235');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  // surcos de las ruedas
  for (const ry of [h * 0.32, h * 0.62]) {
    for (let x = 0; x < w; x += 4) px(g, x, ry + Math.sin(x * 0.02) * 2, 4, 3, r() < 0.8 ? '#735637' : '#7d5f3e');
  }
  // piedritas y tierra suelta
  for (let i = 0; i < w * h / 90; i++) {
    const x = r() * w, y = 8 + r() * (h - 8), k = r();
    px(g, x, y, k < 0.2 ? 3 : 2, 2, k < 0.2 ? '#b9b0a2' : k < 0.6 ? '#a8865b' : '#6b4f33');
  }
  // borde de hierba con matitas
  px(g, 0, 0, w, 5, '#5f8f3c');
  px(g, 0, 5, w, 2, '#4a7330');
  for (let x = 0; x < w; x += 3 + r() * 5) {
    const t = 2 + r() * 6;
    px(g, x, -t + 5, 2, t, r() < 0.5 ? '#6fa344' : '#4f7f33');
    if (r() < 0.05) { px(g, x, 1, 3, 3, r() < 0.5 ? '#f2d14b' : '#f6f6f6'); }   // florecitas
  }
  return c;
}
export function drawGround(ctx, plat) {
  if (!cache) return;
  const key = `${plat.w}|${plat.h}`;
  if (!cache.ground || cache.groundKey !== key) { cache.ground = buildGround(plat.w, plat.h); cache.groundKey = key; }
  ctx.drawImage(cache.ground, Math.round(plat.x), Math.round(plat.y));
}

// ---------- plataformas ----------
const platCache = new Map();
function plankCanvas(w, h, wet) {
  const key = `${w}|${h}|${wet}`;
  if (platCache.has(key)) return platCache.get(key);
  const { c, g } = layer(w, h + 6);
  const r = rng(w * 7 + h);
  const base = wet ? '#5b4030' : '#9a6a3c', dark = wet ? '#3d2a1f' : '#6e4a28', light = wet ? '#6f5240' : '#b47f4a';
  px(g, 0, 0, w, h, base);
  for (let y = 3; y < h - 2; y += 4) for (let x = 0; x < w; x += 6 + r() * 10) px(g, x, y, 4 + r() * 8, 1, dark);  // vetas
  for (let x = 0; x < w; x += 32) { px(g, x, 0, 2, h, dark); px(g, x + 4, 3, 2, 2, '#4a4a4a'); px(g, x + 4, h - 5, 2, 2, '#4a4a4a'); } // juntas y clavos
  px(g, 0, 0, w, 2, light);
  px(g, 0, h - 2, w, 2, dark);
  px(g, 0, h, w, 3, 'rgba(0,0,0,0.25)');                                     // sombra debajo
  if (wet) {                                                                  // charcos con brillo
    for (let x = 8; x < w - 16; x += 26 + r() * 20) {
      const pw = 12 + r() * 16;
      px(g, x, 1, pw, 3, '#6fa9c9'); px(g, x + 2, 1, pw * 0.4, 1, '#d8f1ff');
    }
  }
  platCache.set(key, c);
  return c;
}

// zarzal con espinas (antes "pinchos"): sigue haciendo daño al tocarlo
function bushCanvas(w, h) {
  const key = `bush|${w}|${h}`;
  if (platCache.has(key)) return platCache.get(key);
  const H = h + 30;
  const { c, g } = layer(w + 8, H);
  const r = rng(w * 13);
  px(g, 2, H - h, w + 4, h, '#5a3d27');                                     // jardinera de madera
  px(g, 2, H - h, w + 4, 2, '#7a5536');
  for (let k = 0; k < w / 9; k++) {
    const bx = 6 + r() * (w - 4), by = H - h - 4 - r() * 18, rad = 8 + r() * 7;
    g.fillStyle = k % 3 === 0 ? '#2c5a2a' : k % 3 === 1 ? '#3b7433' : '#285024';
    g.beginPath(); g.arc(bx, by, rad, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < w / 3; i++) {                                         // espinas
    const x = 4 + r() * w, y = H - h - 8 - r() * 24;
    g.strokeStyle = '#e8e2c8'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y - 4 - r() * 3); g.stroke();
  }
  for (let i = 0; i < w / 14; i++) px(g, 4 + r() * w, H - h - 6 - r() * 20, 3, 3, '#c0202a');   // moras rojas
  const out = { c, offY: H - h };
  platCache.set(key, out);
  return out;
}

export function drawPlatform(ctx, p, time) {
  if (p.type === 'spike') {
    const b = bushCanvas(p.w, p.h);
    ctx.drawImage(b.c, Math.round(p.x - 4), Math.round(p.y - b.offY));
    return;
  }
  ctx.drawImage(plankCanvas(p.w, p.h, p.type === 'ice'), Math.round(p.x), Math.round(p.y));
  if (p.type === 'moving') {                                                // cuerdas de las que cuelga
    ctx.strokeStyle = 'rgba(210,190,150,0.8)'; ctx.lineWidth = 2;
    for (const ox of [10, p.w - 10]) { ctx.beginPath(); ctx.moveTo(p.x + ox, p.y); ctx.lineTo(p.x + ox + 8, p.y - 600); ctx.stroke(); }
  }
  if (p.type === 'ice') {                                                   // gotas que caen del tablón mojado
    for (let k = 0; k < 3; k++) {
      const ph = (time * 0.9 + k * 0.37 + p.x * 0.001) % 1;
      const dx = p.x + 14 + ((k * 53 + p.x) % Math.max(1, p.w - 28));
      ctx.fillStyle = `rgba(150,200,230,${(1 - ph).toFixed(2)})`;
      ctx.fillRect(Math.round(dx), Math.round(p.y + p.h + ph * 40), 2, 4);
    }
  }
}

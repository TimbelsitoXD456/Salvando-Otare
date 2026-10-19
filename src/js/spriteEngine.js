// spriteEngine.js - motor de pixel art por piezas, compartido por jugadores (playerSprites.js)
// y enemigos (enemySprites.js).
//
// Las piezas son cuadrículas de letras (una letra = un color de la paleta de cada módulo, '.' = vacío).
// Una pose coloca y gira las piezas alrededor de su articulación; se rasterizan píxel a píxel (giro
// "a lo pixel art", sin difuminar) y se les pone un contorno negro automático.

export const CELL = 2;              // 1 píxel del sprite = 2x2 píxeles de pantalla
export const FW = 76, FH = 46;      // tamaño del fotograma en celdas (ancho: cabe el arma del Fuerte apuntando)
export const AX = 38, AY = 42;      // dónde caen los pies (centro) dentro del fotograma
const OUTLINE = '#141414';

export const grid = rows => {
  const w = Math.max(...rows.map(r => r.length));
  return { w, h: rows.length, rows: rows.map(r => r.padEnd(w, '.')) };
};

// Coloca piezas en el buffer. pl = { g, px, py (articulación en la pieza), x, y (dónde va, en celdas
// respecto a los pies; y negativo = arriba), a (giro en grados; 0 = colgando, 90 = hacia delante,
// 180 = arriba; en piezas horizontales como armas, + = la punta sube) }
// ol: true = la pieza lleva su propio contorno (para que se lea encima del cuerpo, p. ej. un arma)
export function compose(placements, buf = new Array(FW * FH).fill(null)) {
  for (const pl of placements) {
    if (pl.ol) {
      const own = outline(compose([{ ...pl, ol: false }]));
      own.forEach((ch, i) => { if (ch) buf[i] = ch; });
      continue;
    }
    const a = (pl.a || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    const ox = AX + pl.x, oy = AY + pl.y;
    const r = Math.ceil(Math.hypot(Math.max(pl.px, pl.g.w - pl.px), Math.max(pl.py, pl.g.h - pl.py))) + 1;
    for (let Y = Math.floor(oy - r); Y <= Math.ceil(oy + r); Y++) {
      if (Y < 0 || Y >= FH) continue;
      for (let X = Math.floor(ox - r); X <= Math.ceil(ox + r); X++) {
        if (X < 0 || X >= FW) continue;
        const rx = X + 0.5 - ox, ry = Y + 0.5 - oy;
        const i = Math.floor(pl.px + rx * cos - ry * sin);
        const j = Math.floor(pl.py + rx * sin + ry * cos);
        if (i < 0 || j < 0 || i >= pl.g.w || j >= pl.g.h) continue;
        const ch = pl.g.rows[j][i];
        if (ch !== '.') buf[Y * FW + X] = ch;
      }
    }
  }
  return buf;
}

// Punto donde acaba un miembro de longitud len que sale de (x, y) con giro a (para colgar algo de la mano)
export function limbEnd(x, y, a, len) {
  const r = a * Math.PI / 180;
  return { x: x + Math.sin(r) * len, y: y + Math.cos(r) * len };
}

// Gira el fotograma entero (para caer al morir) alrededor de (cx, cy) y lo apoya en el suelo
export function rotateAndGround(src, deg, cx, cy) {
  const a = deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const out = new Array(FW * FH).fill(null);
  const ox = AX + cx, oy = AY + cy;
  for (let Y = 0; Y < FH; Y++) for (let X = 0; X < FW; X++) {
    const rx = X + 0.5 - ox, ry = Y + 0.5 - oy;
    const sx = Math.floor(ox + rx * cos - ry * sin), sy = Math.floor(oy + rx * sin + ry * cos);
    if (sx >= 0 && sy >= 0 && sx < FW && sy < FH && src[sy * FW + sx]) out[Y * FW + X] = src[sy * FW + sx];
  }
  let lowest = -1;
  for (let i = 0; i < out.length; i++) if (out[i]) lowest = Math.max(lowest, Math.floor(i / FW));
  const shift = lowest >= 0 ? AY - 1 - lowest : 0;
  if (!shift) return out;
  const moved = new Array(FW * FH).fill(null);
  for (let i = 0; i < out.length; i++) {
    if (!out[i]) continue;
    const Y = Math.floor(i / FW) + shift;
    if (Y >= 0 && Y < FH) moved[Y * FW + (i % FW)] = out[i];
  }
  return moved;
}

// Contorno negro de 1 píxel alrededor de la silueta
export function outline(buf) {
  const out = buf.slice();
  for (let Y = 0; Y < FH; Y++) for (let X = 0; X < FW; X++) {
    if (buf[Y * FW + X]) continue;
    if ((X > 0 && buf[Y * FW + X - 1]) || (X < FW - 1 && buf[Y * FW + X + 1]) ||
        (Y > 0 && buf[(Y - 1) * FW + X]) || (Y < FH - 1 && buf[(Y + 1) * FW + X])) out[Y * FW + X] = 'K';
  }
  return out;
}

const rgbCache = {};
function rgb(hex) {
  if (!rgbCache[hex]) { const n = parseInt(hex.slice(1), 16); rgbCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  return rgbCache[hex];
}

// white = silueta blanca (destello al recibir daño), conservando el contorno
export function toCanvas(buf, white, palette) {
  const c = document.createElement('canvas');
  c.width = FW; c.height = FH;
  const g = c.getContext('2d');
  const img = g.createImageData(FW, FH);
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (!ch) continue;
    const [r, gg, b] = white && ch !== 'K' ? [255, 255, 255] : rgb(ch === 'K' ? OUTLINE : palette[ch] || '#ff00ff');
    img.data.set([r, gg, b, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Dibuja un fotograma con los pies en (feetX, feetY); flip = mirando a la izquierda
export function blit(ctx, img, feetX, feetY, flip) {
  const y = Math.round(feetY - AY * CELL);
  if (!flip) { ctx.drawImage(img, Math.round(feetX - AX * CELL), y, FW * CELL, FH * CELL); return; }
  ctx.save();
  ctx.translate(Math.round(feetX), 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, -AX * CELL, y, FW * CELL, FH * CELL);
  ctx.restore();
}

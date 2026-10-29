// ayudantes.js - AYUDANTES de la TIENDA (del primer Salvando Otare), en pixel art con el mismo motor
// que los personajes (spriteEngine.js). La lógica de cada uno está en game.js.
//
//   BonkChanti: muñequito cuadrado estilo Minecraft (pelo negro, camiseta turquesa con dibujos,
//   pantalón corto morado y zapatillas amarillas y rojas). Va flotando junto al jugador más herido
//   y le lanza corazones que curan.
//   Otarin: cubito de hielo volador; dispara bolas de hielo que congelan a los enemigos.
//   Guille: piloto de carreras; tira meteoritos y tijeras perforantes.
import { grid, compose, outline, toCanvas, blit } from './spriteEngine.js';

const PALETTE = {
  h: '#23202a', s: '#e8b98a', S: '#c9925f', e: '#23202a', w: '#ffffff', b: '#ff9fb0', m: '#a0522d',
  t: '#4fd1d9', T: '#2a9aa6', g: '#7ddc5a', p: '#ff6fb5', q: '#7b5cd6', Q: '#5a3fae', y: '#ffd23a', r: '#e8323c'
};

const P = {
  head: grid([             // cabeza cuadrada con melena negra (corte "bob")
    '.hhhhhhhh.',
    'hhhhhhhhhh',
    'hhhhhhhhhh',
    'hhsssssshh',
    'hsweswewsh',
    'hseesseesh',
    'hbssmmssbh',
    'hssssssssh',
    '.hSSSSSSh.'
  ]),
  body: grid([             // camiseta turquesa con dibujos verdes y rosas
    'tttttttttt',
    'ttgtttttpt',
    'tgggtttppt',
    'ttgtttttTt',
    'TTTTTTTTTT',
    'qqqqqqqqqq',
    'QqqqqqqqqQ'
  ]),
  arm: grid([
    'ttt',
    'ttt',
    'tTT',
    'sss',
    'sss',
    'sSs'
  ]),
  leg: grid([
    'qqqq',
    'qqqQ',
    'ssss',
    'sssS',
    'yyry',
    'yryy'
  ])
};

// pose: { la, ra (brazos), ll, rl (piernas) } en grados
function build(p) {
  return [
    { g: P.arm, px: 1.5, py: 0, x: -6, y: -12.5, a: p.la },   // brazo de atrás
    { g: P.leg, px: 2, py: 0, x: -2, y: -6, a: p.ll },
    { g: P.leg, px: 2, py: 0, x: 2, y: -6, a: p.rl },
    { g: P.body, px: 5, py: 0, x: 0, y: -13, a: 0 },
    { g: P.head, px: 5, py: 0, x: 0, y: -22, a: 0 },
    { g: P.arm, px: 1.5, py: 0, x: 6, y: -12.5, a: p.ra }     // brazo de delante (el que lanza)
  ];
}
const POSES = {
  // flotando: piernas colgando que se balancean un poco y brazos abiertos
  idle: [{ la: -20, ra: 20, ll: -8, rl: 8 }, { la: -26, ra: 26, ll: 6, rl: -6 }],
  // lanzando un corazón: brazo de delante arriba
  throw: [{ la: -30, ra: 150, ll: -10, rl: 10 }]
};

const cache = new Map();
function frame(state, f) {
  const key = `${state}|${f}`;
  let img = cache.get(key);
  if (!img) {
    const poses = POSES[state];
    img = toCanvas(outline(compose(build(poses[f % poses.length]))), false, PALETTE);
    cache.set(key, img);
  }
  return img;
}

// h: { x, y (centro de los pies), facing, throwT, name } · time: reloj de la partida
export function drawBonkChanti(ctx, h, time) {
  const bob = Math.sin(time * 3.2) * 4;                     // flota subiendo y bajando
  const throwing = time - (h.throwT ?? -9) < 0.3;
  const img = throwing ? frame('throw', 0) : frame('idle', Math.floor(time * 2.5));
  // sombra en el aire (brillo verde suave) y el sprite
  ctx.save();
  ctx.fillStyle = 'rgba(124,255,124,0.18)';
  ctx.beginPath(); ctx.ellipse(Math.round(h.x), Math.round(h.y + bob + 4), 14, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  blit(ctx, img, h.x, h.y + bob, h.facing < 0);
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillStyle = '#b8ffb8';
  const label = 'BonkChanti';
  ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(12,10,24,0.9)';
  ctx.strokeText(label, Math.round(h.x - ctx.measureText(label).width / 2), Math.round(h.y + bob - 50));
  ctx.fillText(label, Math.round(h.x - ctx.measureText(label).width / 2), Math.round(h.y + bob - 50));
}

// Corazón curativo: orbe verde brillante con un corazón rojo en pixel art
const HEART = ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
export function drawHeartOrb(ctx, o, time) {
  const R = 8 + Math.sin(time * 14 + o.x * 0.1) * 1;
  ctx.save();
  ctx.translate(Math.round(o.x), Math.round(o.y));
  ctx.shadowColor = '#a8ffae'; ctx.shadowBlur = 16;
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, R);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#7dff8a'); g.addColorStop(1, 'rgba(57,226,121,0.25)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#e03b3b';
  HEART.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'r') ctx.fillRect(x * 1.5 - 5.25, y * 1.5 - 4.5, 1.5, 1.5); }));
  ctx.restore();
}

// ---------- OTARIN: cubito de hielo volador que congela a los enemigos ----------
// Como en el primer Salvando Otare: cuerpo azul hielo con borde de escarcha blanca, ojitos azul oscuro
// con brillo, sonrisa azulita y copitos de nieve flotando encima.
const OTA_PAL = { W: '#ffffff', h: '#f2fdff', c: '#c0f3ff', C: '#6aeaff', d: '#3fb8d8', e: '#0e3970', s: '#2f9fd6' };
const OTA = [
  '.WWWWWWWWWWWW.',
  'WhhhcccccccccW',
  'WhhccccccccCCW',
  'WhcccccccccCCW',
  'WccccccccCCCCW',
  'WcceecccceeCCW',
  'WcceWcccceWCdW',
  'WcceecccceeCdW',
  'WccCCccccCCCdW',
  'WcCCsCCCCsCddW',
  'WCCCCssssCCddW',
  'WCCCCCCCCCdddW',
  'WCdCdddddddddW',
  '.WWWWWWWWWWWW.'
];
let otaImg = null;
function otarinImage() {
  if (otaImg) return otaImg;
  const c = document.createElement('canvas');
  c.width = OTA[0].length; c.height = OTA.length;
  const g = c.getContext('2d');
  OTA.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = OTA_PAL[ch]; g.fillRect(x, y, 1, 1); } }));
  return (otaImg = c);
}

// o: { x, y (centro), facing, shootT } · time: reloj de la partida
export function drawOtarin(ctx, o, time) {
  const bob = Math.sin(time * 2.6 + 1) * 4;
  const S = 2, img = otarinImage(), w = img.width * S, h = img.height * S;
  const x = Math.round(o.x - w / 2), y = Math.round(o.y - h / 2 + bob);
  ctx.save();
  // brillo frío alrededor (más fuerte justo al disparar)
  const shooting = time - (o.shootT ?? -9) < 0.25;
  ctx.shadowColor = '#6aeaff'; ctx.shadowBlur = shooting ? 22 : 12;
  ctx.imageSmoothingEnabled = false;
  if (o.facing < 0) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); }
  else ctx.drawImage(img, x, y, w, h);
  ctx.restore();
  // copitos de nieve que flotan encima
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 3; i++) {
    const fy = y - 6 - ((time * 12 + i * 7) % 14), fx = x + 6 + i * 8 + Math.sin(time * 3 + i) * 2;
    ctx.fillRect(Math.round(fx), Math.round(fy), 2, 2);
  }
  ctx.font = '8px "Press Start 2P", monospace';
  const label = 'Otarin', lx = Math.round(o.x - ctx.measureText(label).width / 2), ly = y - 20;
  ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(12,10,24,0.9)';
  ctx.strokeText(label, lx, ly);
  ctx.fillStyle = '#9ff4ff'; ctx.fillText(label, lx, ly);
}

// Bola de hielo: orbe azul con borde blanco y un copo de nieve que gira
export function drawIceShot(ctx, s, time) {
  ctx.save();
  ctx.translate(Math.round(s.x), Math.round(s.y));
  ctx.shadowColor = '#6aeaff'; ctx.shadowBlur = 14;
  ctx.fillStyle = 'rgba(106,234,255,0.85)';
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.rotate(time * 6);
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke(); }
  ctx.restore();
}

// Enemigo congelado: bloque de hielo translúcido encima, con brillos (se derrite al final)
export function drawFrozen(ctx, e, time) {
  const left = Math.min(1, e.frozen / 0.4);                 // los últimos 0.4 s se va derritiendo
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.4 * left;
  ctx.fillStyle = '#9fe9ff';
  ctx.fillRect(Math.round(e.x - 4), Math.round(e.y - 4), e.w + 8, e.h + 6);
  ctx.globalAlpha = 0.8 * left + 0.2;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(e.x - 4), Math.round(e.y - 4), e.w + 8, e.h + 6);
  ctx.fillStyle = '#ffffff';
  const tw = (time * 3) % 1;
  ctx.fillRect(Math.round(e.x + 4), Math.round(e.y + 4), 6, 2);
  ctx.fillRect(Math.round(e.x + 4), Math.round(e.y + 4), 2, 8);
  ctx.globalAlpha = 1 - tw;
  ctx.fillRect(Math.round(e.x + e.w - 6), Math.round(e.y + e.h * 0.3), 2, 2);
  ctx.restore();
}

// ---------- GUILLE: piloto con casco y mono de carreras; tira meteoritos y tijeras perforantes ----------
// Como en el diseño: casco verde lima con franja oscura y visera azul, mono rojo con parches blancos,
// bandera azul y blanca, cinturón negro y "SENNA" en amarillo. Lleva una Bloxy Cola en el hombro.
const GUI_PAL = {
  G: '#b8e01a', g: '#87a812', k: '#1d1f2a', v: '#2346c8', V: '#7fd0ff', r: '#e0261e', R: '#9e1610',
  w: '#ffffff', x: '#cfcfd6', b: '#2d5bd8', y: '#ffd23a', n: '#4a2a12', l: '#e8323c', o: '#1d1f2a'
};
const GUI = [
  '.....GGGGGG.....',
  '....GGkkkkGG....',
  '...GGGGkkkkGG.n.',
  '...GGGGGGkkGG.n.',
  '...vvvvvvvvvGnnn',
  '...vVVVVVVvvGlll',
  '...GGGGGGGGGGnnn',
  '....GgggggggGnnn',
  '..rrrrrrrrrrrr..',
  '..rrwwwrwwwwrr..',
  '..rrrrrrwllwrr..',
  '..rrwwwrwwwwrr..',
  '..rrrwwwwwwrrr..',
  '..rrrrbbwwrrrr..',
  '..rrrrbbwwrrrr..',
  '..kkrrrrrrrrkk..',
  '..RRryyyyyrrRR..',
  '....kkkkkkkk....',
  '....rrrrrrrr....',
  '....rrrrrrrr....',
  '....rrr..rrr....',
  '....RRR..RRR....'
];
let guiImg = null;
function guilleImage() {
  if (guiImg) return guiImg;
  const c = document.createElement('canvas');
  c.width = GUI[0].length + 2; c.height = GUI.length + 2;
  const g = c.getContext('2d');
  // contorno oscuro de 1 px y encima el dibujo
  g.fillStyle = '#120e1c';
  GUI.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') g.fillRect(x, y, 3, 3); }));
  GUI.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = GUI_PAL[ch]; g.fillRect(x + 1, y + 1, 1, 1); } }));
  return (guiImg = c);
}

// g: { x, y (centro), facing, castT, throwT } · time: reloj de la partida
export function drawGuille(ctx, g, time) {
  const bob = Math.sin(time * 2.9 + 2) * 4;
  const S = 2, img = guilleImage(), w = img.width * S, h = img.height * S;
  const x = Math.round(g.x - w / 2), y = Math.round(g.y - h / 2 + bob);
  ctx.save();
  // brillo rojo alrededor (más fuerte al lanzar)
  const casting = time - Math.max(g.castT ?? -9, g.throwT ?? -9) < 0.3;
  ctx.shadowColor = '#ff3b2e'; ctx.shadowBlur = casting ? 20 : 8;
  ctx.imageSmoothingEnabled = false;
  if (g.facing < 0) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); }
  else ctx.drawImage(img, x, y, w, h);
  ctx.restore();
  ctx.font = '8px "Press Start 2P", monospace';
  const label = 'Guille', lx = Math.round(g.x - ctx.measureText(label).width / 2), ly = y - 6;
  ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(12,10,24,0.9)';
  ctx.strokeText(label, lx, ly);
  ctx.fillStyle = '#ff8a7a'; ctx.fillText(label, lx, ly);
}

// Tijeras girando: dos hojas plateadas con mangos rojos
export function drawScissors(ctx, s) {
  ctx.save();
  ctx.translate(Math.round(s.x), Math.round(s.y));
  ctx.rotate(s.spin);
  ctx.scale(1.4, 1.4);
  ctx.shadowColor = '#ff3b2e'; ctx.shadowBlur = 10;
  for (const side of [1, -1]) {
    ctx.save();
    ctx.rotate(side * 0.35);
    ctx.fillStyle = '#e8eef5';                       // hoja
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(16, 0); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e0261e'; ctx.lineWidth = 2.5;  // mango
    ctx.beginPath(); ctx.arc(-7, 0, 4.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#1d1f2a'; ctx.fillRect(-1, -1, 2, 2);   // tornillo
  ctx.restore();
}

// Meteorito: primero la sombra que avisa dónde cae y la bola de fuego bajando; luego la explosión (boom)
export function drawMeteor(ctx, m, G, boom = false) {
  ctx.save();
  if (boom) {
    const k = 1 - m.t / 0.4;                          // 0 → 1 mientras dura
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath(); ctx.arc(m.x, m.y, G.meteorRadius * (0.5 + 0.6 * k), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff3b2e'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
    return;
  }
  const k = 1 - m.t / G.meteorWarn;                    // 0 → 1 hasta que cae
  ctx.globalAlpha = 0.25 + 0.35 * k;
  ctx.fillStyle = '#ff3b2e';
  ctx.beginPath(); ctx.ellipse(m.x, m.y + 18, G.meteorRadius * (0.6 + 0.4 * k), 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const fy = m.y - 520 * (1 - k), fx = m.x + 140 * (1 - k);   // baja en diagonal
  ctx.strokeStyle = 'rgba(255,140,40,0.6)'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(fx + 40, fy - 150); ctx.lineTo(fx, fy); ctx.stroke();
  ctx.shadowColor = '#ff3b2e'; ctx.shadowBlur = 20;
  const gr = ctx.createRadialGradient(fx, fy, 2, fx, fy, 16);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#ffb02e'); gr.addColorStop(1, '#e0261e');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(fx, fy, 16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

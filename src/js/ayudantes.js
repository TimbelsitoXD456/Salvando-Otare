// ayudantes.js - AYUDANTES de la TIENDA (del primer Salvando Otare), en pixel art con el mismo motor
// que los personajes (spriteEngine.js). La lógica de cada uno está en game.js.
//
//   BonkChanti: muñequito cuadrado estilo Minecraft (pelo negro, camiseta turquesa con dibujos,
//   pantalón corto morado y zapatillas amarillas y rojas). Va flotando junto al jugador más herido
//   y le lanza corazones que curan.
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

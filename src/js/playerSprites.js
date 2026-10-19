// playerSprites.js - Lanzziano y Jhoabxi en pixel art animado (a partir de los bocetos originales).
//
// Cada personaje se arma con piezas (cabeza, corona/gorra, torso, brazos, piernas, AK) escritas como
// cuadrículas de letras (una letra = un color). Cada pose coloca y gira esas piezas alrededor de su
// articulación (hombro, cadera...), se rasterizan píxel a píxel (giro "a lo pixel art", sin difuminar)
// y se les pone un contorno negro automático, como el trazo de los bocetos.
// Los fotogramas se generan la primera vez que se necesitan y se guardan en caché.
// Solo es dibujo: la caja de colisión del jugador (36x56) no cambia.

import { grid, compose, rotateAndGround, outline, toCanvas, blit } from './spriteEngine.js';

const PALETTE = {
  K: '#141414',
  // Lanzziano
  y: '#f6ee8c', Y: '#d6cb5e',                       // piel amarilla
  c: '#ffd400', C: '#d9a400', w: '#fafafa', W: '#cfd8d8', // corona, camisa blanca
  g: '#a6d84a', G: '#5e9a2a',                       // banda verde
  b: '#efe4cc', B: '#c4b38e',                       // vendas
  k: '#262626',                                     // zapatos
  // Jhoabxi
  s: '#f0c8a0', S: '#cf9f74',                       // piel
  h: '#1b1b1b', q: '#e6e6e6', Q: '#b3b3b3',         // pelo, gorra
  t: '#f4f4f4', T: '#c9c9c9',                       // camiseta
  n: '#2a4a9a', N: '#1b3270',                       // jeans
  m: '#2b2b2b', M: '#5a5a5a', o: '#a4622e', O: '#6e3c1a', // AK: metal y madera
  f: '#ffd400', F: '#fff6b0'                        // fogonazo
};

// ---------- piezas ----------
const L = {
  head: grid([
    '..yyyyyy..',
    '.yyyyyyyy.',
    'yyyyyyyyyy',
    'yyyyKyyKyy',
    'yyyyKyyKyy',
    'yyyyyyyyyY',
    'yyyyyyKKyY',
    '.yyyyyyyY.',
    '..YYYYYY..'
  ]),
  crown: grid([
    'c...c...c',
    'cc.ccc.cc',
    'ccccccccc',
    'cwcccccCc',
    'CCCCCCCCC'
  ]),
  torso: grid([
    'wwwwwwwwww',
    'ggwwwwwwww',
    'gggwwwwwww',
    'wGggwwwwww',
    'wwGggwwwww',
    'wwwGggwwww',
    'wwwwGggwww',
    'wwwwwGggwW',
    'WwwwwwGggW',
    'WWwwwwwGgg'
  ]),
  arm: grid([
    'wwww',
    'wwww',
    'WwwW',
    '.yy.',
    '.yy.',
    '.yy.',
    '.yY.',
    'bbbb',
    'bBbb',
    'bbBb',
    '.bb.'
  ]),
  leg: grid([
    'yyY.',
    'yyY.',
    'yyY.',
    'yyY.',
    'yyY.',
    'yyY.',
    'yyY.',
    'kkkk',
    'kkkk'
  ])
};

const J = {
  head: grid([
    '.qqqqqqq..',
    'qqqqqqqqq.',
    'qQQQQQQQqq',
    'hhhhhhhhh.',
    'hhshhhshh.',
    'hsssKssKs.',
    'hsssssssS.',
    '.ssssssSS.',
    '.sssssSS..'
  ]),
  torso: grid([
    'tttttttT',
    'tttttttT',
    'tttttttT',
    'tttttttT',
    'tttttttT',
    'tttttttT',
    'ttttttTT',
    'ttttttTT'
  ]),
  arm: grid([
    'ttt',
    'ttT',
    'ttT',
    'sss',
    'ssS',
    'ssS',
    'ssS',
    'ssS',
    'sSS'
  ]),
  leg: grid([
    'nnnn',
    'nnnN',
    'nnnN',
    'nnnN',
    'nnnN',
    'nnnN',
    'nnNN',
    'kkkk',
    'kkkk'
  ]),
  // AK: culata de madera, cajón negro, cargador curvo, guardamanos de madera, cañón largo con mira
  gun: grid([
    '............M..........M..',
    'ooo...mmmmmmmmoooooommmm..',
    'oooooommmmmmmmOOOOOOmmmmmm',
    '..OOO.mm.mm...............',
    '...OO..mm..mm.............',
    '.......mm...mm............',
    '.............mm...........'
  ]),
  gunFire: grid([
    '............M..........M...f....',
    'ooo...mmmmmmmmoooooommmm...fFf.f',
    'oooooommmmmmmmOOOOOOmmmmmmfFFFFf',
    '..OOO.mm.mm...............fFf.f.',
    '...OO..mm..mm..............f....',
    '.......mm...mm..................',
    '.............mm.................'
  ])
};

// ---------- poses ----------
// Lanzziano: cuerpo a cuerpo con vendas. Ángulos en grados (0 = colgando, 90 = hacia delante, 180 = arriba).
function lanzziano(pose) {
  const { legB = 0, legF = 0, armB = 0, armF = 0, bob = 0, lean = 0, behind = false, crownTilt = -12 } = pose;
  const up = bob; // el tronco baja 'bob' celdas al pisar
  const armBack = { g: L.arm, px: 2, py: 1, x: -6 + lean, y: -18 + up, a: armB };
  const armFront = { g: L.arm, px: 2, py: 1, x: 6 + lean, y: -18 + up, a: armF, ol: !behind };
  return [
    armBack,
    { g: L.leg, px: 1.5, py: 0, x: -2.5, y: -9, a: legB },
    { g: L.leg, px: 1.5, py: 0, x: 1.5, y: -9, a: legF },
    ...(behind ? [armFront] : []),
    { g: L.torso, px: 5, py: 10, x: lean, y: -9 + up, a: 0 },
    { g: L.head, px: 5, py: 9, x: lean, y: -18 + up, a: 0 },
    { g: L.crown, px: 4.5, py: 5, x: -0.5 + lean, y: -26 + up, a: crownTilt },
    ...(behind ? [] : [armFront])
  ];
}

const L_POSES = {
  idle: [
    { armB: 18, armF: -18, behind: true },              // manos atrás, como en el boceto
    { armB: 18, armF: -18, behind: true, bob: 1, crownTilt: -16 }
  ],
  walk: [
    { legB: -28, legF: 28, armB: -30, armF: 30 },
    { legB: 0, legF: 0, armB: 0, armF: 0, bob: 1 },
    { legB: 14, legF: -14, armB: 30, armF: -30 },
    { legB: 0, legF: 0, armB: 0, armF: 0, bob: 1 }
  ],
  jump: [{ legB: -25, legF: 35, armB: 150, armF: 165, crownTilt: -22 }],
  fall: [{ legB: 12, legF: -12, armB: 115, armF: 125, crownTilt: -4 }],
  dash: [{ legB: -50, legF: -65, armB: -75, armF: -60, lean: 1, crownTilt: -30 }],
  parry: [{ legB: 10, legF: -8, armB: 130, armF: 145 }],    // guardia: puños delante de la cara
  punch: [
    { legB: -12, legF: 18, armB: -25, armF: 90, lean: 1 },  // directo
    { legB: -12, legF: 18, armB: -25, armF: 118, lean: 1 }  // gancho hacia arriba
  ],
  hurt: [{ armB: -35, armF: 40, lean: -1, crownTilt: 10 }]
};

// Jhoabxi: muñeco tipo Roblox (piernas y brazos rígidos) con un AK; apoya el arma con un brazo
// y apunta con la otra mano, como un francotirador. aim = inclinación del arma en grados (+ = arriba).
function jhoabxi(pose) {
  const { legB = 0, legF = 0, aim = 0, gunX = 0, gunY = 0, fire = false, gunAngle = null, armBOff = 0, armFOff = 0, noGun = false } = pose;
  const ga = gunAngle ?? aim;
  // orden: brazo de atrás (mano en la empuñadura, tapada), cuerpo, brazo delantero por DEBAJO del AK
  // (lo sostiene por el guardamanos) y el AK encima
  return [
    { g: J.arm, px: 1.5, py: 1, x: -5.5, y: -16, a: 75 + ga * 0.8 + armBOff },
    { g: J.leg, px: 2, py: 0, x: -2, y: -9, a: legB },
    { g: J.leg, px: 2, py: 0, x: 2, y: -9, a: legF },
    { g: J.torso, px: 4, py: 8, x: 0, y: -9, a: 0 },
    { g: J.head, px: 4.5, py: 9, x: 0.5, y: -17, a: 0 },
    { g: J.arm, px: 1.5, py: 1, x: 5.5, y: -16, a: 65 + ga + armFOff },
    ...(noGun ? [] : [{ g: fire ? J.gunFire : J.gun, px: 0, py: 2, x: -2 + gunX, y: -13 + gunY, a: ga, ol: true }])
  ];
}

const J_POSES = {
  idle: [{}, { gunY: 1, armBOff: -4, armFOff: -4 }],
  // andar Roblox: piernas rectas que van y vienen, sin rodillas ni bote
  walk: [
    { legB: -38, legF: 38 },
    { legB: 0, legF: 0 },
    { legB: 18, legF: -18 },
    { legB: 0, legF: 0 }
  ],
  jump: [{ legB: -18, legF: 18 }],
  fall: [{ legB: 22, legF: -22 }],
  dash: [{ legB: -55, legF: -40, gunAngle: -10 }],
  parry: [{ gunAngle: 60, armBOff: 20, armFOff: 10 }],   // levanta el AK para cubrirse
  shoot: [{ gunX: -1, fire: true }],                       // retroceso + fogonazo
  hurt: [{ gunAngle: -20, armBOff: -20, armFOff: -15 }]
};

// ---------- caché de fotogramas ----------
const cache = new Map();
function frame(kind, state, f, aim) {
  const key = `${kind}|${state}|${f}|${aim}`;
  let fr = cache.get(key);
  if (fr) return fr;
  let buf;
  if (state.startsWith('dead')) {
    // muerte: pose de herido, cae hacia atrás y queda tumbado (Jhoabxi suelta el AK al lado)
    const isL = kind === 'lanzziano';
    const hurt = isL ? lanzziano(L_POSES.hurt[0]) : jhoabxi({ ...J_POSES.hurt[0], noGun: true });
    const base = compose(hurt);
    const angle = state === 'dead0' ? 18 : state === 'dead1' ? 55 : 90;
    buf = rotateAndGround(base, angle, 0, -13);
    if (!isL && state === 'dead2') compose([{ g: J.gun, px: 0, py: 2, x: 4, y: -5, a: 0, ol: true }], buf);
  } else {
    const pose = (kind === 'lanzziano' ? L_POSES : J_POSES)[state];
    const p = pose[f % pose.length];
    buf = compose(kind === 'lanzziano' ? lanzziano(p) : jhoabxi({ aim, ...p, aim: p.gunAngle ?? aim }));
  }
  buf = outline(buf);
  fr = { normal: toCanvas(buf, false, PALETTE), white: toCanvas(buf, true, PALETTE) };
  cache.set(key, fr);
  return fr;
}

// ---------- dibujo ----------
// info: { kind: 'lanzziano' | 'jhoabxi', time (reloj de la partida), aim (grados, solo Jhoabxi), shooting }
export function drawPlayer(ctx, p, info) {
  const a = p.anim || (p.anim = { phase: 0, lastX: p.x, lastMelee: 0, punch: 0, deadT: null, trail: [] });
  const feetX = p.x + p.w / 2, feetY = p.y + p.h;
  let state, f = 0;

  if (!p.alive) {
    if (a.deadT === null) a.deadT = info.time;
    const t = info.time - a.deadT;
    state = t < 0.12 ? 'dead0' : t < 0.3 ? 'dead1' : 'dead2';
  } else if (p.dashing) state = 'dash';
  else if (p.parrying) state = 'parry';
  else if (info.kind === 'lanzziano' && p.meleeTimer > 0) {
    if (p.meleeTimer > a.lastMelee + 0.01) a.punch ^= 1; // cada golpe nuevo alterna directo / gancho
    state = 'punch'; f = a.punch;
  } else if (p.hitFlash > 0) state = 'hurt';                // se encoge al recibir el golpe
  else if (info.kind === 'jhoabxi' && info.shooting) state = 'shoot';
  else if (!p.grounded) state = p.vy < 0 ? 'jump' : 'fall';
  else if (Math.abs(p.vx) > 30) state = 'walk';
  else state = 'idle';
  a.lastMelee = p.meleeTimer;

  // la animación de andar avanza con la distancia recorrida (más rápido = pasos más rápidos)
  a.phase += Math.abs(p.x - a.lastX) / 14;
  a.lastX = p.x;
  if (state === 'walk') f = Math.floor(a.phase) % 4;
  if (state === 'idle') f = Math.floor((info.time + (info.kind === 'jhoabxi' ? 0.3 : 0)) / 0.6) % 2;

  const aim = info.kind === 'jhoabxi' ? info.aim || 0 : 0;
  const fr = frame(info.kind, state, f, aim);
  const flip = p.facing < 0;

  // estela del dash
  // (al morir, dashing/parrying/hitFlash se quedan congelados: solo cuentan si está vivo)
  const dashing = p.alive && p.dashing;
  if (dashing) a.trail.push({ x: feetX, y: feetY, fr, flip });
  if (a.trail.length > 4 || (!dashing && a.trail.length)) a.trail.shift();

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  a.trail.forEach((t, i) => {
    ctx.globalAlpha = 0.12 + 0.08 * i;
    blit(ctx, t.fr.white, t.x, t.y, t.flip);
  });
  ctx.globalAlpha = 1;
  if (p.alive && p.parrying) { ctx.shadowColor = '#7fe8ff'; ctx.shadowBlur = 16; }   // brillo del parry
  else if (dashing) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10; }
  blit(ctx, fr.normal, feetX, feetY, flip);
  ctx.shadowBlur = 0;
  if (p.hitFlash > 0 && p.alive) { ctx.globalAlpha = 0.85; blit(ctx, fr.white, feetX, feetY, flip); }
  ctx.restore();
}

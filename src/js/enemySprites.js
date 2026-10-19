// enemySprites.js - enemigos en pixel art animado (mismo motor que los jugadores: spriteEngine.js).
//   Melle:   soldado con uniforme de camuflaje naranja/verde, gorra y guantes; pega como Lanzziano.
//   Shotter: mismo camuflaje, gorro y la cara medio tapada; dispara con un blaster en la mano.
//   Curados: camisa y pantalón de camuflaje, gorrito de médico con cruz roja; lanza pastillas.
//   Tigre:   el disfraz tradicional (traje naranja con manchas, máscara con orejas y bigote negro); grande.
//   Oscar:   tigrecito más claro y pequeño.  Juan E: el cazador (cara pintada, sombrero metálico, escopeta).
//   Fuerte:  un Shotter musculoso, grande; arma blaster + pistola de portales que dispara bolas verdes.
//   Jefe:    tigre de ojos rojos con la capa del Doctor Doom; invoca levantando la mano con magia verde.
// Solo es dibujo: el tamaño de cada uno lo marca su caja de colisión (makeEnemy en game.js).
import { CELL, grid, compose, rotateAndGround, outline, toCanvas, blit, limbEnd } from './spriteEngine.js';

const PALETTE = {
  a: '#6b7d34', A: '#3f4f1e', r: '#d98a2b', R: '#8a5220',  // camuflaje verde / naranja
  s: '#e3b68c', S: '#c0916a', K: '#141414',                // piel, ojos y cejas
  u: '#4a4a4a', U: '#7a7a7a',                              // guantes
  k: '#262626', c: '#d9b23a',                              // botas / cinturón, hebilla
  z: '#2e2e2e', Z: '#555555',                              // máscara
  v: '#dfe4ec', V: '#7d8796', e: '#39e6ff', E: '#c8fbff',  // blaster y su energía
  w: '#f7f7f7', W: '#cdd5d5', x: '#e8323c', p: '#ff8fc8',  // gorro de médico, cruz roja, pastilla rosa
  // Tigre: traje naranja con manchas verde oscuro, máscara, orejas, bigote negro, manos
  T: '#e8a33a', t: '#f6c453', q: '#c97a24', j: '#3d4a22', J: '#1c2410', i: '#ecc58e',
  m: '#2a2620', M: '#5a5248', h: '#b07a52', H: '#8a5a3c',
  // Oscar: tigrecito más claro
  l: '#f8de95', L: '#e2b65a', g: '#9aa65a', G: '#6f7a3a',
  // Juan E: sombrero metálico, cara pintada de negro, camisa negra, morral, pantalón moteado, escopeta vieja
  n: '#a2a8ae', N: '#5f656b', b: '#e2e6ea', B: '#262626', y: '#b0605a', f: '#1e1e1e',
  C: '#d6c494', Y: '#a8955f', o: '#7a7a7a', O: '#353535', X: '#8a5a2b', Q: '#5c3a1a', F: '#ffd24a',
  // Fuerte: energía verde del arma blaster + pistola de portales
  1: '#7dff5a', 2: '#27c93f', 3: '#eaffdf', 4: '#a8f5c4',
  // Jefe: capa y túnica de Doom (verde, forro oliva), broches naranjas, cinturón, metal; ojos rojos
  5: '#4f6b1f', 6: '#34481a', 7: '#9a9424', D: '#5a7a24', d: '#3e5718',
  8: '#f39a2b', 9: '#5a3a1e', I: '#9aa1a8', P: '#5c6268', 0: '#ff3030'
};

// Capa del jefe: trapecio que se abre hacia abajo, con pliegues y el forro oliva asomando por los bordes
function makeCape() {
  const W = 28, Hh = 27, rows = [];
  for (let y = 0; y < Hh; y++) {
    const half = 8 + (y / (Hh - 1)) * 5.5;
    let row = '';
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x + 0.5 - W / 2);
      if (dx > half) row += '.';
      else if (y === Hh - 1) row += '6';                         // dobladillo
      else if (dx > half - 1.2) row += y > 8 ? '7' : '6';        // borde: forro oliva abajo
      else row += (x % 5 === 0 && y > 4) ? '6' : '5';            // pliegues
    }
    rows.push(row);
  }
  return grid(rows);
}
// Túnica: cadena naranja al cuello, cinturón marrón con placas naranjas, abierta por delante abajo
function makeRobe() {
  const rows = [];
  for (let y = 0; y < 22; y++) {
    let row = '';
    for (let x = 0; x < 14; x++) {
      let ch = x === 13 ? 'd' : 'D';
      if (y === 1 && x >= 3 && x <= 10) ch = '8';                 // cadena
      if (y === 8 || y === 9) ch = (x === 2 || x === 3 || x === 10 || x === 11) ? '8' : '9'; // cinturón
      if (y >= 10 && (x === 6 || x === 7)) ch = 'd';              // abertura delantera
      if (y === 21) ch = 'd';
      row += ch;
    }
    rows.push(row);
  }
  return grid(rows);
}

// ---------- piezas ----------
const P = {
  cap: grid([            // gorra con visera hacia delante (Melle)
    '.aaRRaa...',
    'aAARraaa..',
    'AAAAAAAAAA'
  ]),
  beanie: grid([         // gorro de lana (Shotter)
    '.aRRaAA.',
    'aaRraAAa',
    'RRRRRRRR'
  ]),
  medicCap: grid([       // gorrito de médico con cruz roja (Curados)
    '..wwxww..',
    '.wwxxxww.',
    'wwwwxwwww',
    'WWWWWWWWW'
  ]),
  headCurados: grid([    // cara amable
    'sssssss',
    'sssssss',
    'sssKssK',
    'sssssss',
    'sssKssK',
    '.sssKKS'
  ]),
  armBare: grid([        // manga de camuflaje y mano sin guante (Curados)
    'aaRR',
    'aARr',
    'AAaa',
    'aaar',
    'rraa',
    '.ss.',
    'sssS',
    'sssS',
    '.sS.'
  ]),
  pill: grid([           // pastilla ovalada mitad blanca, mitad rosa
    '.wp.',
    'wwpp',
    '.wp.'
  ]),
  // ----- Tigre (grande): máscara de orejas redondas con bigote negro caído, traje naranja manchado -----
  tigerHead: grid([
    '.ii......ii.',
    'iqi......iqi',
    '.iiTTTTTTTi.',
    '.TTTTTTTTTT.',
    'TTTjTTTTTjTT',
    'TTKKTTTTKKTT',
    'TTKKTTTTKKTT',
    'TTTTTTqTTTTT',
    'TTTmmmmmmTTT',
    '.TmmmmmmmmT.',
    '.mmm.mm.mmm.',
    '.mm..mM..mm.'
  ]),
  tigerTorso: grid([
    '.TTTtTTTtTT.',
    'TTtjTTTTTjTT',
    'TTTTTtTTTTtT',
    'TjTTTTTjTTTT',
    'TTTTtTTTTTjT',
    'TJTTTTTtTTTT',
    'TTTTjTTTJTTT',
    'tTTTTTTTTTtT',
    'TTjTTTtjTTTT',
    'TTTTJTTTTTjT',
    'TtTTTTTTTTTT',
    'TTTTjTTJTTTT'
  ]),
  tigerArm: grid([
    'TTTT',
    'TjTT',
    'TTTt',
    'JTTT',
    'TTjT',
    'TTTT',
    'tjTT',
    'TTTJ',
    'TTTT',
    'TjTT',
    'hhhh',
    'hhhH',
    '.hh.'
  ]),
  tigerLeg: grid([
    'TTTTT',
    'TjTTt',
    'TTTJT',
    'tTTTT',
    'TTTjT',
    'TJTTT',
    'TTTTt',
    'TjTTT',
    'TTTJT',
    'TTTTT',
    'kkkkk',
    'kkkkkk'
  ]),
  // ----- Oscar: tigre pequeño y más claro -----
  oscarHead: grid([
    '.i....i.',
    'iillllii',
    'llllllll',
    'lKKllKKl',
    'llllglll',
    'lllLllll',
    'llMMMMll',
    '.M.MM.M.'
  ]),
  oscarTorso: grid([
    'lllgllll',
    'lLllllgl',
    'lllllLll',
    'glllllll',
    'lllgllLl',
    'lLllllll',
    'llllglll'
  ]),
  oscarArm: grid([
    'lll',
    'llg',
    'Lll',
    'lll',
    'lgl',
    'hhh',
    '.h.'
  ]),
  oscarLeg: grid([
    'lll',
    'lgl',
    'llL',
    'lll',
    'kkk',
    'kkkk'
  ]),
  // ----- Juan E: el cazador (pequeño) -----
  hunterHat: grid([       // sombrero metálico abollado
    '..nbnn...',
    '.nnnbnn..',
    '.nNnnNn..',
    'NNNNNNNNN'
  ]),
  hunterHead: grid([      // cara pintada de negro
    'BBBBBB',
    'BBwBBw',
    'BBBBBB',
    'BBByyB',
    '.BBBBB'
  ]),
  hunterTorso: grid([     // camisa negra con la correa del morral
    'Cfffff',
    'fCffff',
    'ffCfff',
    'fffCff',
    'ffffCf',
    'fffffC'
  ]),
  hunterBag: grid([       // morral de tela
    'CCCC',
    'CYCC',
    'CCCC',
    'YYYY'
  ]),
  hunterArm: grid([
    'fff',
    'fff',
    'ffB',
    'ffB',
    'hhh',
    '.h.'
  ]),
  hunterLeg: grid([       // pantalón moteado
    'oOW',
    'Ooo',
    'oWO',
    'Ooo',
    'kkk',
    'kkkk'
  ]),
  rifle: grid([           // escopeta vieja: culata de madera, cañón largo de metal gris oxidado
    '.......nnnnnnnn',
    'XXXXXXXQQoXooon',
    '.QQQ.o.........'
  ]),
  rifleFire: grid([
    '.......nnnnnnnn.F.',
    'XXXXXXXQQoXooonFtF',
    '.QQQ.o.........F.F'
  ]),
  // ----- Fuerte: un Shotter musculoso (tan grande como el Tigre) -----
  bruteBeanie: grid([
    '.aRRaaAAa.',
    'aaRraaAAaa',
    'RRRRRRRRRR'
  ]),
  bruteHead: grid([      // cejas gruesas y la cara tapada como el Shotter
    'ssssssss',
    'sKKKsKKK',
    'sssKsssK',
    'zzzzzzzz',
    'zZzzzzZz',
    'zzzzzzzz',
    '.zzzzzz.'
  ]),
  bruteTorso: grid([     // ancho de espaldas
    '.aaRRaaaAAaaa.',
    'aaRRraaaaAAraa',
    'AAraaAAaaRRaaa',
    'aaaaAArraaaaAA',
    'rraaaaaRRaaAAa',
    'aAAraaaaaaRraa',
    'aaaRRaAAaaaaar',
    'AaaaaaRraaAAaa',
    '.aAArraaaaarr.',
    '.kkkkkcckkkkk.',
    '.aaRRaaaAAaaa.',
    '.AAaaaRRaaaaa.'
  ]),
  bruteArm: grid([       // manga remangada, antebrazo musculoso y guante
    'aaRRaa',
    'aRRaAA',
    'AAaaaa',
    'aaarra',
    'ssssss',
    'sssssS',
    '.ssssS',
    '.sssS.',
    '.sssS.',
    '.sssS.',
    'uuuuu.',
    'uUuUu.',
    '.uuu..'
  ]),
  bruteLeg: grid([
    'aaRRaa',
    'aRRaAA',
    'AAaaaa',
    'aaarra',
    'rraaaa',
    'aAAraa',
    'aaaRRa',
    'AAaaaa',
    'aaRRaA',
    'kkkkkk',
    'kkkkkkk',
    'kkkkkkk'
  ]),
  // arma: cuerpo blanco del blaster + el tubo de cristal con líquido verde y el emisor de la pistola de portales
  portalGun: grid([
    '....44444......',
    '...4113114.....',
    '.vvvvvvvvvvVV2.',
    'VvvvvvvvvvvVV12',
    '.vVVVVvvvvvVV2.',
    '..VV...........',
    '..VV...........'
  ]),
  portalGunFire: grid([
    '....44444.........',
    '...4113114....1...',
    '.vvvvvvvvvvVV2113.',
    'VvvvvvvvvvvVV13331',
    '.vVVVVvvvvvVV2113.',
    '..VV..........1...',
    '..VV..............'
  ]),
  // ----- Jefe final: tigre de ojos rojos con la capa del Doctor Doom -----
  bossCape: makeCape(),
  bossRobe: makeRobe(),
  bossHood: grid([       // capucha verde con las orejas de tigre asomando; ojos rojos y bigote negro
    '..ii......ii..',
    '.iqiDDDDDDiqi.',
    '..DDDDDDDDDDd.',
    '.DDDTTTTTTDDd.',
    '.DDTTjTTTTTDd.',
    'DDDT00TT00TDdd',
    'DDTTxxTTxxTTDd',
    'DDTTTTqTTTTTDd',
    'DDTTmmmmmmTTDd',
    'DDTmmmmmmmmTDd',
    'DDdmm.mm.mmdDd',
    '.DDmm..m..mmD.',
    '..DD......DD..'
  ]),
  bossArm: grid([        // manga verde y guantelete de metal
    'DDDDd',
    'DDDDd',
    'DDDdd',
    'DDDDd',
    'DDDDd',
    'DDDdd',
    'DDDDd',
    'dDDDd',
    'ddddd',
    'IIIIP',
    'IIIIP',
    '.IIP.',
    '.II..'
  ]),
  bossLeg: grid([        // botas de metal bajo la túnica
    'IIIP',
    'IIIP',
    'IIIP',
    'PPPP',
    'PPPPP'
  ]),
  bossClasp: grid([      // broche naranja redondo
    '.8.',
    '888',
    '.8.'
  ]),
  magicSmall: grid([
    '.1.',
    '131',
    '.1.'
  ]),
  magicBig: grid([
    '..3..',
    '.212.',
    '31113',
    '.212.',
    '..3..'
  ]),
  headMelle: grid([      // cejas de enfado
    'sssssss',
    'ssKKsKK',
    'sssKssK',
    'sssssss',
    'ssssKKS',
    '.sssssS'
  ]),
  headShotter: grid([    // cara medio tapada: solo se ven los ojos
    'sssssss',
    'ssKKsKK',
    'sssKssK',
    'zzzzzzz',
    'zZzzzZz',
    '.zzzzzz'
  ]),
  // camuflaje a manchas (de 2-3 píxeles, no píxel a píxel)
  torso: grid([
    'aaaRRaaA',
    'aaRRraAA',
    'AArraaAa',
    'AAaaaarr',
    'aaaAArrR',
    'rraAAaaa',
    'kkkcckkk',
    'RraaaAAa'
  ]),
  arm: grid([            // manga de camuflaje y guante
    'aaRR',
    'aARr',
    'AAaa',
    'aaar',
    'rraa',
    'uuuu',
    'uUUu',
    'uuuu',
    '.uu.'
  ]),
  leg: grid([
    'aaRr',
    'AaRR',
    'AAaa',
    'aaAA',
    'rraA',
    'Rraa',
    'kkkk',
    'kkkkk',
    'kkkkk'
  ]),
  blaster: grid([
    '..vvvvv..',
    'VvvvvvvvE',
    'VvVVVVvve',
    '.VV......',
    '.VV......'
  ]),
  blasterFire: grid([
    '..vvvvv.....e..e',
    'VvvvvvvvEeEEEe..',
    'VvVVVVvveEEEEEEe',
    '.VV......eEEe...',
    '.VV.....e...e...'
  ])
};

// ---------- poses ----------
// Ángulos en grados: 0 = colgando, 90 = hacia delante, 180 = arriba. aim = inclinación del blaster (+ = arriba)
const SHOULDER_Y = -16, ARM_LEN = 8;
const LOOKS = {
  melle:   { head: P.headMelle,   hat: { g: P.cap, px: 4, py: 3, x: 0, y: -21 },        arm: P.arm },
  shotter: { head: P.headShotter, hat: { g: P.beanie, px: 4, py: 3, x: 0, y: -21 },     arm: P.arm },
  curados: { head: P.headCurados, hat: { g: P.medicCap, px: 4.5, py: 4, x: 0.5, y: -21 }, arm: P.armBare }
};

function soldier(kind, pose) {
  const { legB = 0, legF = 0, armB = 0, armF = 0, bob = 0, lean = 0, fire = false, aim = 0, noGun = false, pill = false } = pose;
  const look = LOOKS[kind];
  const sy = SHOULDER_Y + bob;
  const parts = [
    { g: look.arm, px: 2, py: 1, x: -5 + lean, y: sy, a: armB },
    { g: P.leg, px: 2, py: 0, x: -2, y: -9, a: legB },
    { g: P.leg, px: 2, py: 0, x: 2, y: -9, a: legF },
    { g: P.torso, px: 4, py: 8, x: lean, y: -9 + bob, a: 0 },
    { g: look.head, px: 3.5, py: 6, x: 0.5 + lean, y: -16 + bob, a: 0 },
    { ...look.hat, x: look.hat.x + lean, y: look.hat.y + bob, a: 0 },
    { g: look.arm, px: 2, py: 1, x: 5 + lean, y: sy, a: armF, ol: true }
  ];
  const hand = limbEnd(5 + lean, sy, armF, ARM_LEN);
  if (kind === 'shotter' && !noGun) {
    // el blaster cuelga de la mano del brazo delantero, apuntando
    parts.push({ g: fire ? P.blasterFire : P.blaster, px: 2, py: 3, x: Math.round(hand.x), y: Math.round(hand.y), a: aim, ol: true });
  }
  if (pill) parts.push({ g: P.pill, px: 2, py: 1, x: Math.round(hand.x), y: Math.round(hand.y) - 1, a: 0, ol: true });
  return parts;
}

const MELLE_POSES = {
  // guardia de boxeo con los guantes delante de la cara
  idle: [{ armB: 115, armF: 128 }, { armB: 111, armF: 124, bob: 1 }],
  walk: [
    { legB: -28, legF: 28, armB: 108, armF: 132 },
    { armB: 115, armF: 128, bob: 1 },
    { legB: 14, legF: -14, armB: 122, armF: 120 },
    { armB: 115, armF: 128, bob: 1 }
  ],
  punch: [
    { legB: -12, legF: 18, armB: 120, armF: 90, lean: 1 },   // directo
    { legB: -12, legF: 18, armB: 120, armF: 115, lean: 1 }   // gancho
  ],
  hurt: [{ armB: -35, armF: 40, lean: -1 }]
};

// Shotter: brazo delantero estirado apuntando (90 + aim), el otro relajado
const shotterPose = (extra, aim) => ({ armB: 15, armF: 90 + aim, aim, ...extra });
const SHOTTER_POSES = {
  idle: [{}, { bob: 1 }],
  walk: [{ legB: -28, legF: 28 }, { bob: 1 }, { legB: 14, legF: -14 }, { bob: 1 }],
  shoot: [{ fire: true, lean: -1 }],               // fogonazo y pequeño retroceso
  hurt: [{ armB: -35, armF: 40, lean: -1, noHold: true }]
};

// Curados: sostiene una pastilla y la lanza a sus compañeros
const CURADOS_POSES = {
  idle: [{ armB: 12, armF: 55, pill: true }, { armB: 10, armF: 52, pill: true, bob: 1 }],
  walk: [
    { legB: -28, legF: 28, armB: -20, armF: 55, pill: true },
    { armB: 0, armF: 55, pill: true, bob: 1 },
    { legB: 14, legF: -14, armB: 20, armF: 55, pill: true },
    { armB: 0, armF: 55, pill: true, bob: 1 }
  ],
  throw: [{ armB: -15, armF: 120, lean: 1 }],          // brazo estirado: la pastilla ya va volando
  hurt: [{ armB: -35, armF: 40, lean: -1 }]
};

// Tigre (grande): traje naranja manchado, los brazos en alto como en la foto. Brazo de atrás: ángulo
// negativo = se abre hacia fuera.
function tiger(pose) {
  const { legB = 0, legF = 0, armB = -125, armF = 125, bob = 0, lean = 0 } = pose;
  return [
    { g: P.tigerArm, px: 2, py: 1, x: -8 + lean, y: -23 + bob, a: armB },
    { g: P.tigerLeg, px: 2.5, py: 0, x: -2.5, y: -12, a: legB },
    { g: P.tigerLeg, px: 2.5, py: 0, x: 2.5, y: -12, a: legF },
    { g: P.tigerTorso, px: 6, py: 12, x: lean, y: -12 + bob, a: 0 },
    { g: P.tigerHead, px: 6, py: 9, x: lean, y: -24 + bob, a: 0 },   // el bigote cae sobre el pecho
    { g: P.tigerArm, px: 2, py: 1, x: 8 + lean, y: -23 + bob, a: armF, ol: true }
  ];
}
const TIGER_POSES = {
  idle: [{ armB: -125, armF: 125 }, { armB: -118, armF: 118, bob: 1 }],
  walk: [                                   // anda pesado, meneando los brazos en alto
    { legB: -20, legF: 20, armB: -112, armF: 135 },
    { armB: -125, armF: 125, bob: 1 },
    { legB: 10, legF: -10, armB: -135, armF: 112 },
    { armB: -125, armF: 125, bob: 1 }
  ],
  roar: [{ armB: -168, armF: 168 }],         // invoca a Oscares y Juan E: brazos arriba del todo
  hurt: [{ armB: -40, armF: 40, lean: -1 }]
};

// Oscar: tigrecito más claro y pequeño; lanza zarpazos
function oscar(pose) {
  const { legB = 0, legF = 0, armB = -55, armF = 55, bob = 0, lean = 0 } = pose;
  return [
    { g: P.oscarArm, px: 1.5, py: 1, x: -5.5 + lean, y: -12 + bob, a: armB },
    { g: P.oscarLeg, px: 1.5, py: 0, x: -1.5, y: -6, a: legB },
    { g: P.oscarLeg, px: 1.5, py: 0, x: 1.5, y: -6, a: legF },
    { g: P.oscarTorso, px: 4, py: 7, x: lean, y: -6 + bob, a: 0 },
    { g: P.oscarHead, px: 4, py: 7, x: lean, y: -13 + bob, a: 0 },
    { g: P.oscarArm, px: 1.5, py: 1, x: 5.5 + lean, y: -12 + bob, a: armF, ol: true }
  ];
}
const OSCAR_POSES = {
  idle: [{ armB: -60, armF: 60 }, { armB: -50, armF: 50, bob: 1 }],
  walk: [
    { legB: -25, legF: 25, armB: -40, armF: 75 },
    { bob: 1 },
    { legB: 12, legF: -12, armB: -75, armF: 40 },
    { bob: 1 }
  ],
  swipe: [{ armB: -30, armF: 105, lean: 1 }],   // zarpazo hacia delante
  hurt: [{ armB: -35, armF: 35, lean: -1 }]
};

// Juan E: el cazador (pequeño). Apunta la escopeta vieja; el morral cuelga a un lado.
function hunter(pose) {
  const { legB = 0, legF = 0, aim = 0, bob = 0, fire = false, gunX = 0, armBOff = 0, armFOff = 0, noGun = false } = pose;
  const parts = [
    { g: P.hunterArm, px: 1.5, py: 1, x: -4.5, y: -11 + bob, a: 75 + aim * 0.8 + armBOff },
    { g: P.hunterLeg, px: 1.5, py: 0, x: -1.5, y: -6, a: legB },
    { g: P.hunterLeg, px: 1.5, py: 0, x: 1.5, y: -6, a: legF },
    { g: P.hunterTorso, px: 3, py: 6, x: 0, y: -6 + bob, a: 0 },
    { g: P.hunterBag, px: 2, py: 0, x: -3, y: -7 + bob, a: 0, ol: true },
    { g: P.hunterHead, px: 3, py: 5, x: 0, y: -12 + bob, a: 0 },
    { g: P.hunterHat, px: 4.5, py: 3, x: 0.5, y: -17 + bob, a: 0 },
    { g: P.hunterArm, px: 1.5, py: 1, x: 4.5, y: -11 + bob, a: 65 + aim + armFOff, ol: true }
  ];
  if (!noGun) parts.push({ g: fire ? P.rifleFire : P.rifle, px: 0, py: 1, x: -2 + gunX, y: -9 + bob, a: aim, ol: true });
  return parts;
}
const HUNTER_POSES = {
  idle: [{}, { bob: 1 }],
  walk: [{ legB: -25, legF: 25 }, {}, { legB: 12, legF: -12 }, {}],
  shoot: [{ fire: true, gunX: -1 }],
  hurt: [{ aim: -20, armBOff: -20, armFOff: -20 }]
};

// Fuerte: como el Shotter pero musculoso y del tamaño del Tigre; apunta con el arma de portales a una mano
function brute(pose) {
  const { legB = 0, legF = 0, armB = 0, armF = 0, bob = 0, lean = 0, fire = false, aim = 0, noGun = false } = pose;
  const sy = -23 + bob;
  const parts = [
    { g: P.bruteArm, px: 3, py: 1, x: -9 + lean, y: sy, a: armB },
    { g: P.bruteLeg, px: 3, py: 0, x: -3, y: -12, a: legB },
    { g: P.bruteLeg, px: 3, py: 0, x: 3, y: -12, a: legF },
    { g: P.bruteTorso, px: 7, py: 12, x: lean, y: -12 + bob, a: 0 },
    { g: P.bruteHead, px: 4, py: 7, x: lean, y: -23 + bob, a: 0 },
    { g: P.bruteBeanie, px: 5, py: 3, x: lean, y: -29 + bob, a: 0 },
    { g: P.bruteArm, px: 3, py: 1, x: 9 + lean, y: sy, a: armF, ol: true }
  ];
  if (!noGun) {
    const hand = limbEnd(9 + lean, sy, armF, 11);
    parts.push({ g: fire ? P.portalGunFire : P.portalGun, px: 3, py: 5, x: Math.round(hand.x), y: Math.round(hand.y), a: aim, ol: true });
  }
  return parts;
}
const FUERTE_POSES = {
  idle: [{}, { bob: 1 }],
  walk: [{ legB: -22, legF: 22 }, { bob: 1 }, { legB: 11, legF: -11 }, { bob: 1 }],
  shoot: [{ fire: true, lean: -1 }],
  hurt: [{ armB: -35, armF: 40, lean: -1, noHold: true }]
};

// Jefe final: tigre con la capa de Doom. magic: 0 nada, 1 brillo en la mano, 2 destello grande (invocar/atacar)
const BOSS_SHOULDER = { x: 8.5, y: -26 }, BOSS_ARM = 12.5;
function boss(pose) {
  const { legB = 0, legF = 0, armB = -8, armF = 20, bob = 0, magic = 0 } = pose;
  const sy = BOSS_SHOULDER.y + bob;
  const parts = [
    { g: P.bossCape, px: 14, py: 0, x: 0, y: -27, a: 0 },           // la capa, detrás de todo
    { g: P.bossArm, px: 2.5, py: 1, x: -BOSS_SHOULDER.x, y: sy, a: armB },
    { g: P.bossLeg, px: 2, py: 0, x: -3, y: -5, a: legB },
    { g: P.bossLeg, px: 2, py: 0, x: 3, y: -5, a: legF },
    { g: P.bossRobe, px: 7, py: 0, x: 0, y: -27 + bob, a: 0 },
    { g: P.bossHood, px: 7, py: 13, x: 0, y: -25 + bob, a: 0 },
    { g: P.bossClasp, px: 1.5, py: 1.5, x: -5.5, y: -25.5 + bob, a: 0 },
    { g: P.bossClasp, px: 1.5, py: 1.5, x: 5.5, y: -25.5 + bob, a: 0 },
    { g: P.bossArm, px: 2.5, py: 1, x: BOSS_SHOULDER.x, y: sy, a: armF, ol: true }
  ];
  if (magic) {
    const hand = limbEnd(BOSS_SHOULDER.x, sy, armF, BOSS_ARM);
    const g = magic === 2 ? P.magicBig : P.magicSmall;
    parts.push({ g, px: g.w / 2, py: g.h / 2, x: Math.round(hand.x) + 0.5, y: Math.round(hand.y) + 0.5, a: 0 });
  }
  return parts;
}
const BOSS_POSES = {
  idle: [{ magic: 1 }, { bob: 1, magic: 1 }],                      // la magia brilla en su mano, como en la referencia
  walk: [
    { legB: -15, legF: 15, armB: -14, armF: 28, magic: 1 },
    { bob: 1, magic: 1 },
    { legB: 8, legF: -8, armB: -2, armF: 12, magic: 1 },
    { bob: 1, magic: 1 }
  ],
  summon: [{ armB: -25, armF: 172, magic: 2 }],                    // levanta la mano para invocar
  cast: [{ armB: -15, armF: 95, magic: 2 }],                       // apunta para lanzar su magia
  hurt: [{ armB: -40, armF: 45, bob: 1 }]
};

// Destellos de magia verde alrededor de un punto (invocar del jefe, aparición de sus esbirros)
function magicSparkles(ctx, x, y, time, radius, count) {
  ctx.save();
  ctx.shadowColor = '#7dff5a'; ctx.shadowBlur = 14;
  const g = ctx.createRadialGradient(x, y, 1, x, y, radius);
  g.addColorStop(0, 'rgba(234,255,223,0.9)'); g.addColorStop(0.4, 'rgba(125,255,90,0.55)'); g.addColorStop(1, 'rgba(39,201,63,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#eaffdf';
  for (let k = 0; k < count; k++) {
    const a = time * 4 + k * (Math.PI * 2 / count);
    const r = radius * (0.7 + 0.3 * Math.sin(time * 9 + k));
    const sx = Math.round(x + Math.cos(a) * r), sy = Math.round(y + Math.sin(a) * r);
    ctx.fillRect(sx - 2, sy, 5, 1); ctx.fillRect(sx, sy - 2, 1, 5);   // estrellita
  }
  ctx.restore();
}

// Disparo del Fuerte: bola de energía verde que gira como un portal (R mayor = magia del jefe)
export function drawEnergyBall(ctx, eb, time, R = 7) {
  const spin = time * 9 + eb.x * 0.05;
  ctx.save();
  ctx.translate(Math.round(eb.x), Math.round(eb.y));
  ctx.shadowColor = '#7dff5a'; ctx.shadowBlur = 16;
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, R);
  g.addColorStop(0, '#eaffdf'); g.addColorStop(0.45, '#7dff5a'); g.addColorStop(1, 'rgba(39,201,63,0.15)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  // remolino: dos arcos que giran
  ctx.strokeStyle = 'rgba(234,255,223,0.9)'; ctx.lineWidth = 1.5;
  for (let k = 0; k < 2; k++) {
    ctx.beginPath(); ctx.arc(0, 0, R * 0.65, spin + k * Math.PI, spin + k * Math.PI + 1.6); ctx.stroke();
  }
  ctx.restore();
}

// Por tipo: cómo se arma, sus poses, centro de giro al caer muerto y si apunta (aim)
const KINDS = {
  melle:   { build: p => soldier('melle', p), poses: MELLE_POSES, deathY: -12 },
  shotter: { build: p => soldier('shotter', p), poses: SHOTTER_POSES, deathY: -12, aimed: (p, aim) => (p.noHold ? p : shotterPose(p, aim)) },
  curados: { build: p => soldier('curados', p), poses: CURADOS_POSES, deathY: -12 },
  tigre:   { build: tiger, poses: TIGER_POSES, deathY: -16 },
  oscar:   { build: oscar, poses: OSCAR_POSES, deathY: -9 },
  juan:    { build: hunter, poses: HUNTER_POSES, deathY: -9, aimed: (p, aim) => ({ ...p, aim: p.aim ?? aim }) },
  fuerte:  { build: brute, poses: FUERTE_POSES, deathY: -16, aimed: (p, aim) => (p.noHold ? p : shotterPose(p, aim)) },
  boss:    { build: boss, poses: BOSS_POSES, deathY: -18 }
};

// ---------- caché ----------
const cache = new Map();
function frame(kind, state, f, aim) {
  const key = `${kind}|${state}|${f}|${aim}`;
  let fr = cache.get(key);
  if (fr) return fr;
  const K = KINDS[kind];
  let buf;
  if (state.startsWith('dead')) {
    // muerte: pose de herido, cae hacia atrás y queda tumbado (sueltan el arma)
    const base = compose(K.build({ ...K.poses.hurt[0], noGun: true }));
    const angle = state === 'dead0' ? 18 : state === 'dead1' ? 55 : 90;
    buf = rotateAndGround(base, angle, 0, K.deathY);
  } else {
    const poses = K.poses[state];
    const p = poses[f % poses.length];
    buf = compose(K.build(K.aimed ? K.aimed(p, aim) : p));
  }
  buf = outline(buf);
  fr = { normal: toCanvas(buf, false, PALETTE), white: toCanvas(buf, true, PALETTE) };
  cache.set(key, fr);
  return fr;
}

export const HAS_SPRITE = new Set(Object.keys(KINDS));

// Ataque de cada tipo: [estado, segundos que dura la pose]. Para Shotter, Oscar, Juan E y Tigre se detecta
// porque su temporizador de disparo/invocación se recarga; el Curados cuenta lanzamientos (e.healThrows).
const ATTACK = { shotter: ['shoot', 0.1], fuerte: ['shoot', 0.12], curados: ['throw', 0.2], tigre: ['roar', 0.5], oscar: ['swipe', 0.15], juan: ['shoot', 0.12], boss: ['summon', 0.8] };
const AIMS = new Set(['shotter', 'fuerte', 'juan']);
const SHOOT_GLOW = { shotter: '#39e6ff', fuerte: '#7dff5a', juan: '#ffd24a' };

// Pastilla del Curados en vuelo: cápsula ovalada mitad blanca / mitad rosa que gira
function capsulePath(ctx, len, rad) {
  const h = len / 2 - rad;
  ctx.beginPath();
  ctx.arc(-h, 0, rad, Math.PI / 2, Math.PI * 1.5);
  ctx.arc(h, 0, rad, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
}
export function drawPill(ctx, eb, time) {
  const LEN = 14, RAD = 3.5;
  ctx.save();
  ctx.translate(Math.round(eb.x), Math.round(eb.y));
  ctx.rotate(Math.atan2(eb.vy || 0, eb.vx || 1) + time * 12 + (eb.x % 7));
  ctx.shadowColor = '#ff8fc8'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#141414';
  capsulePath(ctx, LEN + 3, RAD + 1.5);
  ctx.fill();
  ctx.shadowBlur = 0;
  capsulePath(ctx, LEN, RAD);
  ctx.clip();
  ctx.fillStyle = '#f7f7f7'; ctx.fillRect(-LEN / 2, -RAD, LEN / 2, RAD * 2);
  ctx.fillStyle = '#ff8fc8'; ctx.fillRect(0, -RAD, LEN / 2, RAD * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(1, -RAD + 1, LEN / 2 - 3, 1.5); // brillo
  ctx.restore();
}

// info: { time (reloj de la partida), target (jugador al que mira/apunta, o null) }
export function drawEnemy(ctx, e, info) {
  const a = e.anim || (e.anim = { phase: 0, lastX: e.x, facing: 1, punch: 0, lastCd: 0, lastShoot: e.shootTimer || 0, lastThrows: e.healThrows || 0, fireT: -1, lastHp: e.hp, hurtT: -1, deadT: null });
  const feetX = e.x + e.w / 2, feetY = e.y + e.h;
  const t = info.target;

  // hacia dónde mira: hacia donde anda; parado, hacia su objetivo
  if (Math.abs(e.vx) > 10) a.facing = Math.sign(e.vx);
  else if (t) a.facing = (t.x + t.w / 2) >= feetX ? 1 : -1;
  // daño (no curación): pose de herido un momento
  if (e.hp < a.lastHp - 0.01) a.hurtT = info.time;
  a.lastHp = e.hp;

  let state, f = 0, aim = 0;
  if (!e.alive) {
    if (a.deadT === null) a.deadT = info.time;
    const dt = info.time - a.deadT;
    state = dt < 0.12 ? 'dead0' : dt < 0.3 ? 'dead1' : 'dead2';
  } else {
    if (AIMS.has(e.kind) && t) {
      const dx = ((t.x + t.w / 2) - feetX) * a.facing, dy = (t.y + t.h / 2) - (e.y + e.h * 0.4);
      aim = Math.max(-40, Math.min(50, Math.round(Math.atan2(-dy, Math.max(1, dx)) * 180 / Math.PI / 10) * 10));
    }
    // ha disparado / invocado: el temporizador se acaba de recargar
    if (e.kind !== 'curados' && ATTACK[e.kind]) {
      if ((e.shootTimer || 0) > a.lastShoot + 0.05) a.fireT = info.time;
      a.lastShoot = e.shootTimer || 0;
    }
    // ha lanzado una pastilla (game.js cuenta los lanzamientos en e.healThrows)
    if (e.kind === 'curados') {
      if ((e.healThrows || 0) !== (a.lastThrows || 0)) a.fireT = info.time;
      a.lastThrows = e.healThrows || 0;
    }
    // ha pegado: el Melle recarga su ataque a 0.9 s
    const cd = e.attackCooldown || 0;
    if (e.kind === 'melle' && cd > a.lastCd + 0.05) a.punch ^= 1;
    if (e.kind === 'boss' && cd > a.lastCd + 0.05) a.castT = info.time;   // el jefe acaba de lanzar su magia
    a.lastCd = cd;

    // (el jefe recibe golpes todo el rato: sin pose de herido, solo el destello blanco)
    if (e.kind !== 'boss' && info.time - a.hurtT < 0.15) state = 'hurt';
    else if (e.kind === 'melle' && cd > 0.72) { state = 'punch'; f = a.punch; }
    else if (ATTACK[e.kind] && info.time - a.fireT < ATTACK[e.kind][1]) state = ATTACK[e.kind][0];
    else if (e.kind === 'boss' && info.time - (a.castT ?? -9) < 0.3) state = 'cast';
    else if (Math.abs(e.vx) > 15) state = 'walk';
    else state = 'idle';
  }

  a.phase += Math.abs(e.x - a.lastX) / 12;
  a.lastX = e.x;
  if (state === 'walk') f = Math.floor(a.phase) % 4;
  if (state === 'idle') f = Math.floor((info.time + (e.id ? e.id.charCodeAt(0) % 7 * 0.1 : 0)) / 0.5) % 2;

  const fr = frame(e.kind, state, f, aim);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (!e.alive) ctx.globalAlpha = 0.65;
  if (state === 'shoot') { ctx.shadowColor = SHOOT_GLOW[e.kind]; ctx.shadowBlur = 14; } // resplandor del disparo
  if (state === 'roar') { ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 18; }                              // el Tigre invoca
  blit(ctx, fr.normal, feetX, feetY, a.facing < 0);
  ctx.shadowBlur = 0;
  if (e.alive && e.flash > 0) { ctx.globalAlpha = 0.8; blit(ctx, fr.white, feetX, feetY, a.facing < 0); }
  ctx.restore();

  if (e.kind === 'boss' && e.alive) drawBossFx(ctx, e, a, state, f, feetX, feetY, info.time);
  // esbirro del jefe: aparece con un "puf" de magia verde
  if (e.magicSpawn && e.alive) {
    if (a.bornT == null) a.bornT = info.time;
    const age = info.time - a.bornT;
    if (age < 0.6) magicSparkles(ctx, feetX, feetY - e.h / 2, info.time, 10 + age * 40, 6);
  }
}

// Ojos rojos que brillan y la magia en la mano al invocar / atacar
function drawBossFx(ctx, e, a, state, f, feetX, feetY, time) {
  const poses = BOSS_POSES[state] || BOSS_POSES.idle;
  const pose = poses[f % poses.length];
  const bob = pose.bob || 0;
  const toWorld = (cx, cy) => ({ x: feetX + a.facing * cx * CELL, y: feetY + cy * CELL });
  ctx.save();
  ctx.shadowColor = '#ff3030'; ctx.shadowBlur = 10;
  ctx.fillStyle = '#ff5050';
  for (const ex of [-2, 2]) {
    const p = toWorld(ex, -32.5 + bob);
    ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 2), 4, 3);
  }
  ctx.restore();
  if (state === 'summon' || state === 'cast') {
    const hand = limbEnd(BOSS_SHOULDER.x, BOSS_SHOULDER.y + bob, pose.armF, BOSS_ARM);
    const p = toWorld(hand.x, hand.y);
    magicSparkles(ctx, p.x, p.y, time, state === 'summon' ? 22 : 13, state === 'summon' ? 8 : 4);
  }
}

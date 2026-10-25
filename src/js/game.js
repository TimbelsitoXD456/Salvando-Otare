import { isDown, wasPressed, resetInput } from './engine/input.js';
import { createLoop } from './engine/loop.js';
import { addKill, recordRound, recordSurvivalRound, addWin } from './kills.js';
import { coinValue, earnCoins, getCoins } from './tienda.js';
import { createAI } from './ai.js';
import { FOOD_TYPES, FOOD_LIFETIME, FOOD_SPAWN_FIRST, FOOD_SPAWN_INTERVAL, FOOD_MAX_ON_MAP, FOOD_SIZE,
  randomFoodKind, drawFood, drawFloatText } from './food.js';
import { drawPlayer } from './playerSprites.js';
import { drawEnemy, drawPill, drawEnergyBall, HAS_SPRITE } from './enemySprites.js';
import { drawBonkChanti, drawHeartOrb } from './ayudantes.js';

let canvas, ctx, loopHandle, resizeObserver;
let players = [];
let enemies = [];
let bullets = [];
let enemyBullets = [];
let platforms = [];
let foods = [];        // comida en el mapa (food.js)
let floatTexts = [];   // textos "+25" al comer
let foodSpawnTimer = FOOD_SPAWN_FIRST;
let gameTime = 0;      // reloj de la partida (anima la comida)
let helper = null;     // ayudante BonkChanti (objeto de la TIENDA), o null
let heartOrbs = [];    // corazones curativos que lanza BonkChanti
let world = { 
  gravity: 1800, 
  groundOffset: 80,
  mapWidth: 1600, 
  cameraX: 0 
};
let running = false, paused = false, gameOver = false, gameOverType = '';
let simulationMode = false; // true: cada jugador lo controla una IA (ai.js) en vez del teclado
let simStats = newSimStats(); // resumen de la simulación (se muestra al terminar)
// Modo predicción (runHeadless): la partida corre sin canvas, con este tamaño de pantalla fijo
let headlessView = null;
let headlessBusy = false;
let aiParams = null; // parámetros de la IA de simulación (null = IA original); ver AI_PARAM_SPACE en ai.js
let startRound = 1;  // ronda en la que empieza la simulación (para ver enemigos de rondas altas: Tigre, Fuerte, jefe)
let introHold = false; // congelado durante la cuenta atrás 3, 2, 1, PELIEN (se dibuja pero no avanza)
let boosts = {};       // objetos de la TIENDA activos en esta partida: { speed, strength, health } (tienda.js)
let runCoins = 0;      // CapoCoins ganadas en esta partida
let survival = false;  // modo SUPERVIVENCIA: rondas infinitas, un jefe cada 20 (no se gana: se aguanta)
let onResizeCallback = null;
let lastGroundY = null; // altura del suelo en el último resize (null = partida sin crear)

// Almacenar posiciones de botones para detección de clics
let gameOverButtons = {
  retry: { x: 0, y: 0, w: 140, h: 40 },
  menu: { x: 0, y: 0, w: 140, h: 40 }
};

// rounds
let currentRound = 1;
const maxRounds = 20;
let roundAdvanceTimer = 0;
const timeBetweenRounds = 1.0;

// player attack configs
const MELEE = { range: 44, width: 28, damage: 10, duration: 0.12, cooldown: 0.28 }; // Lanzziano ignores cooldown
const JHOABXI_SHOOT_CD = 0.35;
const JHOABXI_BULLET_SPEED = 720;
const JHOABXI_BULLET_DAMAGE = 20;

// enemy templates (user-specified stats)
const ENEMY_TYPES = {
  melle:  { display: 'Melle',   color: '#aa3333', baseHp: 100, baseSpeed: 180, attackDamage: 10, attackRange: 44 },
  shotter:{ display: 'Shotter', color: '#e9e617', baseHp: 80,  baseSpeed: 140, attackDamage: 10, attackRange: 220, shootCd: 0.67, bulletSpeed: 280 },
  fuerte: { display: 'Fuerte',  color: '#2793d6', baseHp: 133, baseSpeed: 130, attackDamage: 20, attackRange: 240, shootCd: 0.77, bulletSpeed: 300 },
  curados:{ display: 'Curados', color: '#de3bc3', baseHp: 90,  baseSpeed: 110, healAmount: 6.7, healCd: 0.80, healSpeed: 300 },
  tigre:  { display: 'Tigre',   color: '#ff8c00', baseHp: 200, baseSpeed: 100, summonCd: 10 },
  oscar:  { display: 'Oscar',   color: '#ec9f33', baseHp: 35,  baseSpeed: 160, shootCd: 0.56, bulletDmg: 10, bulletSpeed: 280 },
  juan:   { display: 'Juan E',  color: '#f8960d', baseHp: 67,  baseSpeed: 140, shootCd: 1.0,  bulletDmg: 20, bulletSpeed: 320 },
  boss:   { display: 'JEFE',    color: '#ffffff', baseHp: 3600, baseSpeed: 120, attackDamage: 40, summonCd: 8 }
};

// helper to create players
function makePlayer(name, x, y, color, controls) {
  // meleeDamage and bulletDamage per player (so we can buff on partner death)
  const meleeBase = MELEE.damage;
  const bulletBase = JHOABXI_BULLET_DAMAGE;
  return {
    name, x, y, w: 36, h: 56, vx: 0, vy: 0,
    accel: 3200, friction: 1600, maxSpeed: 460, jumpPower: 720,
    grounded: false, coyoteTime: 0.12, coyoteTimer: 0,
    jumpBufferTime: 0.10, jumpBufferTimer: 0,
    facing: 1, color, controls,
    dashCooldown: 0.9, dashTimer: 0, dashDuration: 0.18, dashActiveTimer: 0, dashing: false, dashSpeed: 920, dashInvul: false,
    parryDuration: 0.22, parryCooldown: 1.2, parryTimer: 0, parryActiveTimer: 0, parrying: false, parryInvul: false,
    meleeTimer: 0, meleeCooldown: 0, shootingCooldown: 0,
    meleeHitDone: false,
    meleeDamage: meleeBase,
    bulletDamage: bulletBase,
    hp: 140, maxHp: 140, regenRate: 6, regenDelay: 2.0, regenTimer: 0,
    alive: true, bob: 0, hitFlash: 0, deadPose: false
  };
}

// helper to create enemies, with optional overrides (displayName, colorOverride, isMinion)
function makeEnemy(kind, x, y, round = 1, opts = {}) {
  const tpl = ENEMY_TYPES[kind] || ENEMY_TYPES.melle;
  const hp = Math.round((tpl.baseHp || 30) + Math.max(0, round - 1) * 6 + Math.random() * 12);
  // (la velocidad deja de subir en la ronda 30: en supervivencia serían imposibles de esquivar)
  const speed = (tpl.baseSpeed || 60) + Math.round((Math.min(round, 30) - 1) * 4);
  const display = opts.displayName || tpl.display;
  const color = opts.colorOverride || tpl.color;
  // tamaño de cada tipo (el Tigre grande; Oscar y Juan E pequeños)
  const SIZES = { boss: [52, 76], fuerte: [44, 64], tigre: [44, 64], oscar: [32, 40], juan: [30, 40] };
  const [w, h] = SIZES[kind] || [36, 50];

  // Helper para obtener el cooldown inicial
  const getInitialTimer = () => {
    const cd = tpl.shootCd ?? tpl.healCd ?? tpl.summonCd ?? 0;
    return cd > 0 ? cd * (0.3 + Math.random() * 0.7) : 0;
  };

  return {
    id: Math.random().toString(36).slice(2, 9),
    kind,
    display,
    x, y, w, h,
    vx: 0,
    hp,
    maxHp: hp,
    alive: true,
    flash: 0,
    color,
    attackCooldown: 0,
    speed,
    attackRange: tpl.attackRange || 50,
    attackDamage: tpl.attackDamage || 10,
    shootTimer: getInitialTimer(),
    tpl,
    isMinion: !!opts.isMinion,
    isBoss: kind === 'boss'
  };
}
// Helper para crear plataformas
function makePlatform(x, y, width, height, type = 'normal') {
  return {
    x, y, w: width, h: height,
    type, // 'normal', 'moving', 'spike', 'ice'
    color: type === 'spike' ? '#ff4444' : type === 'ice' ? '#6dd5ed' : type === 'moving' ? '#ffaa44' : '#00dd88',
    solid: type !== 'spike', // spike no es sólido, daña
    damage: type === 'spike' ? 15 : 0,
    // para plataformas móviles
    moveSpeed: type === 'moving' ? 80 : 0,
    moveRange: type === 'moving' ? 120 : 0,
    moveDir: 1,
    moveOriginX: x
  };
}

// Generar layout de plataformas para el mapa
function generatePlatforms(mapW, mapH) {
  platforms = [];
  const groundY = mapH - world.groundOffset;
  
  // Suelo principal
  platforms.push(makePlatform(0, groundY, mapW, world.groundOffset, 'normal'));
  
  // Plataformas intermedias (patrón escalonado)
  platforms.push(makePlatform(200, groundY - 180, 140, 20, 'normal'));
  platforms.push(makePlatform(450, groundY - 250, 140, 20, 'ice'));
  platforms.push(makePlatform(700, groundY - 150, 160, 20, 'normal'));
  platforms.push(makePlatform(950, groundY - 280, 140, 20, 'moving'));
  platforms.push(makePlatform(1200, groundY - 120, 140, 20, 'normal'));
  platforms.push(makePlatform(1400, groundY - 220, 160, 20, 'spike'));
  
  // Plataformas adicionales para navegación
  platforms.push(makePlatform(300, groundY - 80, 100, 18, 'normal'));
  platforms.push(makePlatform(600, groundY - 350, 120, 18, 'normal'));
  platforms.push(makePlatform(800, groundY - 80, 100, 18, 'ice'));
  platforms.push(makePlatform(1100, groundY - 180, 120, 18, 'normal'));
}


// spawn player bullet: now aimed at nearest enemy at spawn and flies straight (no homing)
function spawnPlayerBullet(x, y, speed, damage, ownerIndex) {
  // Solo genera bala si el jugador está vivo
  if (ownerIndex != null && !players[ownerIndex]?.alive) return;
  
  const target = findNearestEnemy(x, y);
  let vx = speed, vy = 0;
  if (target) {
    const dx = (target.x + target.w/2) - x;
    const dy = (target.y + target.h/2) - y;
    const len = Math.hypot(dx, dy) || 1;
    vx = (dx / len) * speed;
    vy = (dy / len) * speed;
  } else {
    // fallback: fire horizontally in facing direction
    const dir = (ownerIndex != null && players[ownerIndex]) ? players[ownerIndex].facing : 1;
    vx = dir * speed; vy = 0;
  }

  bullets.push({
    x, y, w: 10, h: 8, speed, damage,
    vx, vy,
    life: 3.0, owner: ownerIndex, type: 'player', homing: false
  });
}

// spawn enemy bullet; supports damage or heal type
function spawnEnemyBullet(x, y, speed, damageOrHeal, kind = 'enemyDamage', targetKind = 'player', ownerId = null) {
  // kind: 'enemyDamage' or 'heal'
  enemyBullets.push({
    x, y, w: 8, h: 8, speed,
    vx: 0, vy: 0, life: 6,
    value: damageOrHeal,
    kind, targetKind, ownerId
  });
}

// homing helper: find nearest target
function findNearestEnemy(refX, refY) {
  let best = null, bd = Infinity;
  for (const e of enemies) if (e.alive) {
    const dx = (e.x + e.w / 2) - refX, dy = (e.y + e.h / 2) - refY;
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function findNearestPlayer(refX, refY) {
  let best = null, bd = Infinity;
  for (const p of players) if (p.alive) {
    const dx = (p.x + p.w / 2) - refX, dy = (p.y + p.h / 2) - refY;
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
// Aliado al que puede curar un Curados: cualquier enemigo vivo menos él mismo y otros Curados
function canBeHealed(e) { return e.alive && e.kind !== 'curados'; }
function findNearestAllyEnemy(refId, refX, refY) {
  let best = null, bd = Infinity;
  for (const e of enemies) if (e.id !== refId && canBeHealed(e)) {
    const dx = (e.x + e.w / 2) - refX, dy = (e.y + e.h / 2) - refY;
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Tiger summon: spawn 2 Oscares and 1 Juan Esteban
function spawnTigerMinions(tiger) {
  if (!hasWorld() || !tiger || !tiger.alive) return;
  const mapW = world.mapWidth;
  const baseY = tiger.y;
  const leftX = Math.max(48, tiger.x - 80);
  const midX = Math.min(mapW - 48, tiger.x + 8);
  const rightX = Math.min(mapW - 48, tiger.x + tiger.w + 80);

  const osc1 = makeEnemy('oscar', leftX, baseY, currentRound, { displayName: 'Oscare', colorOverride: ENEMY_TYPES.oscar.color, isMinion: true });
  const osc2 = makeEnemy('oscar', midX, baseY, currentRound, { displayName: 'Oscare', colorOverride: ENEMY_TYPES.oscar.color, isMinion: true });
  const je   = makeEnemy('juan',  rightX, baseY, currentRound, { displayName: 'Juan Esteban', colorOverride: ENEMY_TYPES.juan.color, isMinion: true });
  // a la altura de los pies del Tigre (son más bajitos que él)
  for (const m of [osc1, osc2, je]) m.y = tiger.y + tiger.h - m.h;

  enemies.push(osc1, osc2, je);
  tiger.shootTimer = ENEMY_TYPES.tigre.summonCd || ENEMY_TYPES.tigre.summonCd === 0 ? ENEMY_TYPES.tigre.summonCd : 12;
}

// spawn boss (if desired)
function spawnBoss(canvasW, canvasH) {
  enemies = [];
  const baseY = canvasH - world.groundOffset - 80;
  const bossX = Math.min(canvasW - 220, Math.max(220, canvasW * 0.65));
  const boss = makeEnemy('boss', bossX, baseY, currentRound);
  boss.y = canvasH - world.groundOffset - boss.h; // apoyado en el suelo según su altura
  // en supervivencia cada jefe es más duro: 3600 de vida en la 20, 7200 en la 40, 10800 en la 60...
  const bossHp = ENEMY_TYPES.boss.baseHp;
  boss.hp = boss.maxHp = survival ? bossHp * Math.max(1, Math.floor(currentRound / maxRounds)) : bossHp;
  boss.shootTimer = ENEMY_TYPES.boss.summonCd || ENEMY_TYPES.boss.summonCd === 0 ? ENEMY_TYPES.boss.summonCd : 8;
  enemies.push(boss);
}

// Controles por teclado con la misma interfaz que la IA: acciones 'left', 'right', 'jump', 'parry', 'dash', 'melee', 'shoot'
function keyboardInput(controls) {
  return {
    isDown: action => !!controls[action] && isDown(controls[action]),
    wasPressed: action => !!controls[action] && wasPressed(controls[action])
  };
}

// Jugando solo en PC: el personaje elegido responde a las DOS distribuciones de teclas (flechas o WASD),
// y el ataque (golpe o disparo, según el personaje) a M, F o J
const SOLO_KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], jump: ['ArrowUp', 'KeyW', 'Space'],
  parry: ['ArrowDown', 'KeyS'], dash: ['Enter', 'KeyX', 'ShiftLeft'], attack: ['KeyM', 'KeyF', 'KeyJ']
};
function soloKeyboardInput(attackAction) {
  const keysFor = action => SOLO_KEYS[action === attackAction ? 'attack' : action] || [];
  return {
    isDown: action => keysFor(action).some(k => isDown(k)),
    // se consulta cada tecla (wasPressed consume la pulsación de cada una)
    wasPressed: action => keysFor(action).reduce((hit, k) => wasPressed(k) || hit, false)
  };
}

// Quién controla a cada jugador [Lanzziano, Jhoabxi] (controles.js): 'keys' | 'solo' | 'touch' | 'ai'
let controlModes = ['keys', 'keys'];
let touchInput = null;        // botones táctiles (touch.js), si algún jugador es 'touch'
let partnerAiParams = null;   // IA compañera (original, o la entrenada si eres admin)

function playerInput(i, p) {
  const role = i === 0 ? 'melee' : 'shooter';
  if (simulationMode) return createAI(role, aiParams);
  const mode = controlModes[i];
  if (mode === 'ai') return createAI(role, partnerAiParams);
  if (mode === 'touch' && touchInput) return touchInput;
  if (mode === 'solo') return soloKeyboardInput(i === 0 ? 'melee' : 'shoot');
  return keyboardInput(p.controls);
}

function setupPlayers(canvasW, canvasH) {
  players = [
    makePlayer('Lanzziano', 100, canvasH - world.groundOffset - 56, '#ffd400', { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', parry: 'ArrowDown', dash: 'Enter', melee: 'KeyM' }),
    makePlayer('Jhoabxi',   200, canvasH - world.groundOffset - 56, '#003366', { left: 'KeyA', right: 'KeyD', jump: 'KeyW', parry: 'KeyS', dash: 'KeyX', shoot: 'KeyF' })
  ];
  // fuente de controles de cada jugador: IA en simulación; en partida, según los Ajustes
  players.forEach((p, i) => { p.input = playerInput(i, p); });
  // objetos de la TIENDA: en partidas de verdad, los activos del jugador; en simulación, ninguno salvo
  // que Predicción / Entrenamiento los pidan (runHeadless({ boosts }))
  for (const p of players) {
    if (boosts.speed) { p.maxSpeed *= 2; p.accel *= 2; }
    if (boosts.strength) { p.meleeDamage *= 2; p.bulletDamage *= 2; }
    if (boosts.health) { p.maxHp *= 2; p.hp = p.maxHp; }
  }
  // ayudante BonkChanti: aparece junto a Lanzziano
  helper = boosts.bonkchanti ? { x: players[0].x - 30, y: players[0].y + 20, facing: 1, cooldown: BONK.firstThrow, throwT: null } : null;
  heartOrbs = [];
  runCoins = 0;
  simStats = newSimStats();
  bullets = []; enemyBullets = []; enemies = [];
  foods = []; floatTexts = []; foodSpawnTimer = FOOD_SPAWN_FIRST; gameTime = 0;
  generatePlatforms(world.mapWidth, canvasH); // NUEVO: Generar plataformas
  currentRound = startRound; roundAdvanceTimer = 0;
  world.cameraX = 0;
  spawnEnemiesForRound(currentRound, world.mapWidth, canvasH); // Usar mapWidth en lugar de canvasW
}

// spawn enemies for round (mix)
// Avisos para la música (music.js vía menu.js); solo en partidas que se ven, no en las simulaciones sin pantalla
function announce(type, detail) {
  if (headlessView || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}
function announceRound() {
  announce('battleState', { round: currentRound, boss: isBossRound(currentRound), tigre: enemies.some(e => e.kind === 'tigre') });
}
// Ronda del jefe: la 20 en modo normal; en supervivencia, cada 20 (20, 40, 60...)
const isBossRound = round => survival ? round % maxRounds === 0 : round >= maxRounds;

function spawnEnemiesForRound(round, canvasW, canvasH) {
  enemies = [];
  if (isBossRound(round)) { spawnBoss(canvasW, canvasH); announceRound(); return; }
  const baseY = canvasH - world.groundOffset - 52;
  // ensure round 1 => 3 enemies; then increase
  const count = Math.min(3 + Math.floor((round - 1) * 1.2), 40);
  for (let i = 0; i < count; i++) {
    const areaX = canvasW * (0.45 + Math.random() * 0.5);
    const r = Math.random();
    let type = 'melle';
    if (round >= 14 && r < 0.12) type = 'fuerte';
    else if (round >= 10 && r < 0.26) type = 'tigre';
    else if (round >= 6 && r >= 0.26 && r < 0.46) type = 'shotter';
    else if (round >= 5 && r >= 0.46 && r < 0.58) type = 'curados';
    else type = 'melle';
    const spawnX = Math.min(canvasW - 60, Math.max(60, areaX + Math.random() * 160 - 80));
    const e = makeEnemy(type, spawnX, baseY, round);
    e.y = baseY + 50 - e.h; // apoyado en el suelo según su altura (los de 50 quedan igual que siempre)
    enemies.push(e);
  }
  announceRound();
}

// utilities
// Movimiento enemigo: cada IA fija e.targetVx y la velocidad real se acerca a ella con esta aceleración (px/s²).
// Así los enemigos alcanzan su velocidad de verdad y los empujones (melee, parry) se frenan solos.
const ENEMY_ACCEL = 1400;
// Dirección horizontal hacia el objetivo; 0 si está casi encima (evita temblar bajo un jugador en plataforma)
function chaseDir(e, target, deadzone = 8) {
  const dx = (target.x + target.w / 2) - (e.x + e.w / 2);
  return Math.abs(dx) < deadzone ? 0 : Math.sign(dx);
}
// Límite de tiradores: solo MAX_ACTIVE_SHOOTERS enemigos con canShoot disparan a la vez.
// Si uno muere, el siguiente más cercano a un jugador ocupa su lugar.
const MAX_ACTIVE_SHOOTERS = 3;
const SHOOTER_KINDS = new Set(['shotter', 'fuerte', 'oscar', 'juan']);
function updateShooterSlots() {
  const shooters = enemies.filter(e => e.alive && SHOOTER_KINDS.has(e.kind));
  let free = MAX_ACTIVE_SHOOTERS - shooters.filter(e => e.canShoot).length;
  if (free <= 0) return;
  const distToPlayer = e => {
    const p = findNearestPlayer(e.x + e.w / 2, e.y + e.h / 2);
    return p ? Math.abs((p.x + p.w / 2) - (e.x + e.w / 2)) : Infinity;
  };
  const waiting = shooters.filter(e => !e.canShoot).sort((a, b) => distToPlayer(a) - distToPlayer(b));
  for (const e of waiting) {
    if (free-- <= 0) break;
    e.canShoot = true;
    // el reemplazo no dispara al instante: espera entre medio y un cooldown completo
    e.shootTimer = (e.tpl.shootCd || 1) * (0.5 + Math.random() * 0.5);
  }
}
// Cooldown con ±15% de variación para que los tiradores no disparen sincronizados
function shootCooldown(base) { return base * (0.85 + Math.random() * 0.3); }
function anyPlayerAlive() { return players.some(p => p.alive && p.hp > 0); }

// Estadísticas de simulación: tiempo, kills y vida perdida por cada jugador según la fuente
function newSimStats() {
  return {
    time: 0, kills: [0, 0], damage: [{ melle: 0, bala: 0, pinchos: 0 }, { melle: 0, bala: 0, pinchos: 0 }],
    healed: [0, 0], food: { spawned: 0, eaten: 0, expired: 0 }
  };
}
// ARMADURA (objeto de la TIENDA): los golpes y disparos enemigos hacen menos daño (los pinchos no)
const ARMOR_REDUCTION = 0.25;
const armorFactor = () => (boosts.armor ? 1 - ARMOR_REDUCTION : 1);

function addDamage(pi, source, amount) {
  const d = simStats.damage[pi];
  if (d && amount > 0) d[source] += amount;
}
// Hay partida que simular: con canvas (normal) o sin él (runHeadless)
function hasWorld() { return !!canvas || !!headlessView; }
function viewRect() { return headlessView || canvas.getBoundingClientRect(); }
function rectsOverlap(a, b) { return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h); }

// HiDPI resizing
function resizeCanvasInternal() {
  if (!canvas) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = Math.max(160, Math.floor(canvas.clientWidth));
  const cssH = Math.max(120, Math.floor(canvas.clientHeight));
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  // Solo se crea la partida la primera vez; en un resize posterior se conserva el estado
  // y se desplaza todo verticalmente para que siga apoyado en el nuevo suelo.
  const groundY = cssH - world.groundOffset;
  if (lastGroundY === null) setupPlayers(cssW, cssH);
  else if (groundY !== lastGroundY) shiftWorldY(groundY - lastGroundY);
  lastGroundY = groundY;
  if (typeof onResizeCallback === 'function') onResizeCallback();
}

function shiftWorldY(dy) {
  for (const list of [players, enemies, bullets, enemyBullets, platforms, foods, floatTexts, heartOrbs]) {
    for (const o of list) o.y += dy;
  }
  if (helper) helper.y += dy;
}

// Jefe: fase de furia al llegar a esta fracción de vida
const BOSS_RAGE = { at: 0.5, summonCd: 8, orbSpeed: 200, spread: 0.3 };

// enemies AI & actions (implements the specified behaviors)
function updateEnemies(dt) {
  if (!hasWorld()) return;
  const rect = viewRect();
  const W = rect.width, H = rect.height;

  updateShooterSlots();

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.alive) continue;

    // find nearest player target
    let target = findNearestPlayer(e.x + e.w / 2, e.y + e.h / 2);
    let bestDist = target ? Math.hypot((target.x + target.w / 2) - (e.x + e.w / 2), (target.y + target.h / 2) - (e.y + e.h / 2)) : Infinity;

    // behavior by kind (cada rama fija la velocidad deseada; por defecto quieto)
    e.targetVx = 0;
    if (e.kind === 'melle') {
      if (target) {
        const dir = (target.x + target.w / 2) < (e.x + e.w / 2) ? -1 : 1;
        if (bestDist > e.attackRange - 6) e.targetVx = chaseDir(e, target) * e.speed * 1.3; // el más rápido: persigue a fondo
        else {
          if ((e.attackCooldown || 0) <= 0) {
            if (!target.parryInvul) { const hpBefore = target.hp; target.hp = Math.max(0, target.hp - ENEMY_TYPES.melle.attackDamage * armorFactor()); addDamage(players.indexOf(target), 'melle', hpBefore - target.hp); target.hitFlash = 0.12; target.regenTimer = target.regenDelay; }
            else { e.hp -= 8; e.flash = 0.12; e.vx = -dir * 90; e.lastHitBy = players.indexOf(target); if (e.hp <= 0) killEnemy(e); }
            e.attackCooldown = 0.9;
          }
        }
      }
    } else if (e.kind === 'shotter') {
      if (target) {
        // se acerca hasta media distancia de tiro y ahí se planta a disparar
        if (bestDist > e.attackRange * 0.5) e.targetVx = chaseDir(e, target) * e.speed * 0.9;
        if (e.canShoot) e.shootTimer -= dt; // sin turno de tiro, no dispara
        if (e.shootTimer <= 0) {
          // shoot a bullet aimed in straight line towards target (no homing)
          const sx = e.x + e.w / 2, sy = e.y + e.h / 2;
          const dx = (target.x + target.w/2) - sx, dy = (target.y + target.h/2) - sy;
          const len = Math.hypot(dx, dy) || 1;
          const vx = (dx / len) * (ENEMY_TYPES.shotter.bulletSpeed || 240);
          const vy = (dy / len) * (ENEMY_TYPES.shotter.bulletSpeed || 240);
          enemyBullets.push({ x: sx, y: sy, w: 8, h: 8, vx, vy, life: 4, value: ENEMY_TYPES.shotter.attackDamage || 10, kind: 'enemyDamage', targetKind: 'player', ownerId: e.id });
          e.shootTimer = shootCooldown(ENEMY_TYPES.shotter.shootCd || 0.67);
        }
      }
    } else if (e.kind === 'fuerte') {
      if (target) {
        if (bestDist > e.attackRange * 0.6) e.targetVx = chaseDir(e, target) * e.speed * 0.8;
        if (e.canShoot) e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          const sx = e.x + e.w / 2, sy = e.y + e.h / 2;
          const dx = (target.x + target.w/2) - sx, dy = (target.y + target.h/2) - sy;
          const len = Math.hypot(dx, dy) || 1;
          const vx = (dx / len) * (ENEMY_TYPES.fuerte.bulletSpeed || 260);
          const vy = (dy / len) * (ENEMY_TYPES.fuerte.bulletSpeed || 260);
          enemyBullets.push({ x: sx, y: sy, w: 10, h: 10, vx, vy, life: 4, value: ENEMY_TYPES.fuerte.attackDamage || 20, kind: 'enemyDamage', targetKind: 'player', ownerId: e.id, style: 'portal' }); // bola de energía verde (solo dibujo)
          e.shootTimer = shootCooldown(ENEMY_TYPES.fuerte.shootCd || 0.77);
        }
      }
    } else if (e.kind === 'curados') {
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        const ally = findNearestAllyEnemy(e.id, e.x + e.w/2, e.y + e.h/2);
        if (ally) {
          const sx = e.x + e.w / 2, sy = e.y + e.h / 2;
          const dx = (ally.x + ally.w/2) - sx, dy = (ally.y + ally.h/2) - sy;
          const len = Math.hypot(dx, dy) || 1;
          const vx = (dx / len) * (ENEMY_TYPES.curados.healSpeed || 260);
          const vy = (dy / len) * (ENEMY_TYPES.curados.healSpeed || 260);
          enemyBullets.push({ x: sx, y: sy, w: 8, h: 8, vx, vy, life: 4, value: ENEMY_TYPES.curados.healAmount || 6.7, kind: 'heal', targetKind: 'enemy', ownerId: e.id });
          e.healThrows = (e.healThrows || 0) + 1; // para la animación de lanzar (enemySprites.js)
        }
        e.shootTimer = ENEMY_TYPES.curados.healCd || 0.80; // <-- curados cooldown 0.80
      }
      // el curador se queda atrás, quieto, curando
    } else if (e.kind === 'tigre') {
      e.shootTimer = Math.max(0, (e.shootTimer || 0) - dt);
      // deambula: cada 1-3 s elige ir a la izquierda, a la derecha o quedarse quieto
      e.wanderTimer = (e.wanderTimer || 0) - dt;
      if (e.wanderTimer <= 0) {
        e.wanderDir = [-1, 0, 1][Math.floor(Math.random() * 3)];
        e.wanderTimer = 1 + Math.random() * 2;
      }
      e.targetVx = e.wanderDir * e.speed * 0.6;
      // cada Tigre invoca UNA sola horda en toda su vida (antes era cada 10 s y las hordas se acumulaban)
      if (!e.summonedHorde && e.shootTimer <= 0) {
        spawnTigerMinions(e);
        e.summonedHorde = true;
        e.flash = 0.25;
      }
    } else if (e.kind === 'oscar') {
      if (e.canShoot) e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        const t = findNearestPlayer(e.x + e.w/2, e.y + e.h/2);
        if (t) {
          const sx = e.x + e.w/2, sy = e.y + e.h/2;
          const dx = (t.x + t.w/2) - sx, dy = (t.y + t.h/2) - sy;
          const len = Math.hypot(dx, dy) || 1;
          const vx = (dx / len) * (ENEMY_TYPES.oscar.bulletSpeed || 240);
          const vy = (dy / len) * (ENEMY_TYPES.oscar.bulletSpeed || 240);
          enemyBullets.push({ x: sx, y: sy, w: 8, h: 8, vx, vy, life: 4, value: ENEMY_TYPES.oscar.bulletDmg || 10, kind: 'enemyDamage', targetKind: 'player', ownerId: e.id });
        }
        e.shootTimer = shootCooldown(ENEMY_TYPES.oscar.shootCd || 0.56);
      }
      if (target) e.targetVx = chaseDir(e, target) * e.speed * 0.4;
    } else if (e.kind === 'juan') {
      if (e.canShoot) e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        const t = findNearestPlayer(e.x + e.w/2, e.y + e.h/2);
        if (t) {
          const sx = e.x + e.w/2, sy = e.y + e.h/2;
          const dx = (t.x + t.w/2) - sx, dy = (t.y + t.h/2) - sy;
          const len = Math.hypot(dx, dy) || 1;
          const vx = (dx / len) * (ENEMY_TYPES.juan.bulletSpeed || 260);
          const vy = (dy / len) * (ENEMY_TYPES.juan.bulletSpeed || 260);
          enemyBullets.push({ x: sx, y: sy, w: 10, h: 10, vx, vy, life: 4, value: ENEMY_TYPES.juan.bulletDmg || 20, kind: 'enemyDamage', targetKind: 'player', ownerId: e.id });
        }
        e.shootTimer = shootCooldown(ENEMY_TYPES.juan.shootCd || 1.0);
      }
      if (target) e.targetVx = chaseDir(e, target) * e.speed * 0.4;
    } else if (e.kind === 'boss') {
      // FASE DE FURIA: con la mitad de la vida, invoca más a menudo, dispara abanicos de 3 bolas más
      // rápidas y persigue más deprisa
      if (!e.enraged && e.hp <= e.maxHp * BOSS_RAGE.at) {
        e.enraged = true;
        e.rageT = gameTime;
        floatTexts.push({ x: e.x - 10, y: e.y - 40, text: '¡FURIA!', color: '#ff4040', life: 1.6 });
        announce('battleState', { round: currentRound, boss: true, rage: true, tigre: false });
      }
      const rage = !!e.enraged;
      e.shootTimer = Math.max(0, (e.shootTimer || 0) - dt);
      if (e.shootTimer <= 0) {
        const minCount = 3 + Math.floor(Math.random() * 4);
        for (let m = 0; m < minCount; m++) {
          const types = ['melle','shotter','fuerte','curados','oscar','juan'];
          const t = types[Math.floor(Math.random() * types.length)];
          const sx = Math.min(world.mapWidth - 60, Math.max(60, e.x + (Math.random() * 200 - 100)));
          const jitter = Math.random() * 6 - 3;
          const min = makeEnemy(t, sx, e.y + jitter, currentRound, { displayName: `Min-${t}`, isMinion: true });
          min.y = e.y + e.h - min.h + jitter; // a los pies del jefe (antes salían flotando)
          min.magicSpawn = true;              // aparece con un "puf" de magia verde (solo dibujo)
          enemies.push(min);
        }
        e.shootTimer = rage ? BOSS_RAGE.summonCd : (ENEMY_TYPES.boss.summonCd || 8);
      }
      if ((e.attackCooldown || 0) <= 0 && Math.random() < 5.4 * dt) {
        const speed = rage ? BOSS_RAGE.orbSpeed : 160;
        const spread = rage ? [-BOSS_RAGE.spread, 0, BOSS_RAGE.spread] : [0];   // en furia, abanico de 3
        players.forEach(t => {
          if (!t.alive) return;
          const sx = e.x + e.w/2, sy = e.y + e.h/2;
          const base = Math.atan2((t.y + t.h/2) - sy, (t.x + t.w/2) - sx);
          for (const da of spread) {
            const a = base + da;
            enemyBullets.push({ x: sx, y: sy, w: 12, h: 12, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 4, value: ENEMY_TYPES.boss.attackDamage || 40, kind: 'enemyDamage', targetKind: 'player', ownerId: e.id, style: 'doom' }); // bola de magia verde (solo dibujo)
          }
        });
        e.attackCooldown = rage ? 1.5 + Math.random() * 1.4 : 1.2 + Math.random() * 1.6;
      }
      // el jefe avanza despacio hacia el jugador más cercano si está lejos (en furia, más deprisa)
      if (target && bestDist > 200) e.targetVx = chaseDir(e, target) * e.speed * (rage ? 0.8 : 0.5);
    }

    // physics and cooldowns: acercar vx a targetVx con aceleración limitada
    const dvx = e.targetVx - e.vx, maxStep = ENEMY_ACCEL * dt;
    e.vx = Math.abs(dvx) <= maxStep ? e.targetVx : e.vx + Math.sign(dvx) * maxStep;
    e.x += e.vx * dt;
    e.x = Math.max(0, Math.min(world.mapWidth - e.w, e.x)); // mantener dentro del mapa
    e.attackCooldown = Math.max(0, (e.attackCooldown || 0) - dt);
    e.shootTimer = Math.max(0, (e.shootTimer || 0));
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
    if (e.hp <= 0) killEnemy(e);
  }
}

// Muerte de un enemigo: la kill es para el jugador que dio el último golpe
function killEnemy(e) {
  if (!e.alive) return;
  e.alive = false;
  const killer = players[e.lastHitBy];
  if (!killer) return;
  if (simulationMode) { simStats.kills[e.lastHitBy]++; return; } // las kills de la IA no cuentan ni dan monedas
  addKill(killer.name);
  // CapoCoins: 1 por enemigo, 2 por Tigre/Fuerte, 100 por el jefe (el doble con X2 Monedas)
  const coins = coinValue(e.kind) * (boosts.coinsx2 ? 2 : 1);   // X2 MONEDAS de la tienda
  earnCoins(coins);
  runCoins += coins;
  floatTexts.push({ x: e.x + e.w / 2 - 8, y: e.y - 14, text: `+${coins}`, color: '#ffd24a', life: 1.0 });
}

function handlePlayerDeath(deadIdx) {
  const dead = players[deadIdx];
  if (!dead) return;
  dead.deadPose = true;
  dead.alive = false;
  dead.vx = 0;
  dead.vy = 0;

  const survivor = players.find((p, idx) => idx !== deadIdx && p.alive);
  if (!survivor) {
    // Si no hay survivor, la derrota se triggerá desde physicsUpdate
    return;
  }

  // Protege contra aplicar buffs múltiples si el survivor muere inmediatamente
  if (!dead.buffApplied) {
    dead.buffApplied = true;
    
    const hpGain = Math.round(dead.maxHp * 0.5);
    survivor.maxHp = Math.round(survivor.maxHp + hpGain);
    survivor.hp = Math.min(survivor.maxHp, Math.round(survivor.hp + hpGain));

    const meleeGain = Math.round((dead.meleeDamage || MELEE.damage) * 0.4);
    const bulletGain = Math.round((dead.bulletDamage || JHOABXI_BULLET_DAMAGE) * 0.4);
    survivor.meleeDamage = (survivor.meleeDamage || MELEE.damage) + meleeGain;
    survivor.bulletDamage = (survivor.bulletDamage || JHOABXI_BULLET_DAMAGE) + bulletGain;
  }
}

// --- Comida (tipos y dibujo en food.js) ---
// Aparece en el suelo (60 %) o encima de una plataforma fija (nunca en pinchos ni en la móvil)
function spawnFood() {
  const ground = platforms[0];
  const raised = platforms.filter(p => p !== ground && (p.type === 'normal' || p.type === 'ice'));
  const kind = randomFoodKind();
  for (let attempt = 0; attempt < 6; attempt++) {
    const plat = (Math.random() < 0.6 || !raised.length) ? ground : raised[Math.floor(Math.random() * raised.length)];
    const minX = plat === ground ? 40 : plat.x + 6;
    const maxX = plat === ground ? world.mapWidth - 40 - FOOD_SIZE : plat.x + plat.w - 6 - FOOD_SIZE;
    const x = minX + Math.random() * Math.max(0, maxX - minX);
    if (foods.some(f => Math.abs(f.x - x) < FOOD_SIZE * 2 && f.plat === (plat === ground ? null : plat))) continue;
    foods.push({
      kind, heal: FOOD_TYPES[kind].heal,
      x, y: plat.y - FOOD_SIZE - 4, w: FOOD_SIZE, h: FOOD_SIZE,
      life: FOOD_LIFETIME,
      plat: plat === ground ? null : plat, // null = en el suelo
      phase: Math.random() * 10            // desfase de la animación
    });
    simStats.food.spawned++;
    return;
  }
}

// Aparición periódica, caducidad a los 15 s y recogida: la coge quien la toque si le falta vida
// (con la vida llena se queda en el mapa para después). Cura hasta la vida máxima.
function updateFoods(dt) {
  foodSpawnTimer -= dt;
  if (foodSpawnTimer <= 0) {
    if (foods.length < FOOD_MAX_ON_MAP) spawnFood();
    foodSpawnTimer = FOOD_SPAWN_INTERVAL[0] + Math.random() * (FOOD_SPAWN_INTERVAL[1] - FOOD_SPAWN_INTERVAL[0]);
  }
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    f.life -= dt;
    if (f.life <= 0) { foods.splice(i, 1); simStats.food.expired++; continue; }
    for (let pi = 0; pi < players.length; pi++) {
      const p = players[pi];
      if (!p.alive || p.hp >= p.maxHp || !rectsOverlap(p, f)) continue;
      const healed = Math.min(f.heal, p.maxHp - p.hp);
      p.hp += healed;
      simStats.healed[pi] += healed;
      simStats.food.eaten++;
      floatTexts.push({ x: f.x, y: f.y, text: `+${Math.round(healed)}`, color: '#7cff7c', life: 1.2 });
      foods.splice(i, 1);
      break;
    }
  }
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    floatTexts[i].life -= dt;
    floatTexts[i].y -= 40 * dt;
    if (floatTexts[i].life <= 0) floatTexts.splice(i, 1);
  }
}

// --- Ayudante BonkChanti (dibujo en ayudantes.js) ---
// En el primer Salvando Otare curaba 20 de vida cada medio segundo (40 por segundo, con 100 de vida
// máxima): aquí los jugadores tienen más vida, se regeneran solos y hay comida, así que cura menos y
// más despacio, pero en plena pelea (cuando la regeneración no funciona). No revive a nadie.
const BONK = {
  speed: 320,        // vuela hacia el jugador más herido (px/s)
  heal: 20,          // vida por corazón (los mismos 20 del primer juego)
  cooldown: 2.0,     // segundos entre corazones (en el primer juego, 0.5)
  firstThrow: 2.0,
  minMissing: 12,    // no gasta corazones si al jugador le falta muy poca vida
  orbSpeed: 380,     // los corazones persiguen al jugador
  orbLife: 2.5
};

function updateHelper(dt, W) {
  if (!helper) return;
  // a quién cuida: el vivo con menos vida (en proporción)
  let target = null;
  for (const p of players) if (p.alive && (!target || p.hp / p.maxHp < target.hp / target.maxHp)) target = p;
  if (target) {
    // flota detrás del jugador, por encima de su hombro (sin taparle), sin salirse de la pantalla
    const cx = target.x + target.w / 2;
    const wantX = Math.max(world.cameraX + 24, Math.min(world.cameraX + W - 24, cx - target.facing * 56));
    const wantY = target.y - 6;
    const dx = wantX - helper.x, dy = wantY - helper.y, d = Math.hypot(dx, dy);
    if (d > 1) { const step = Math.min(d, BONK.speed * dt); helper.x += dx / d * step; helper.y += dy / d * step; }
    if (Math.abs(cx - helper.x) > 4) helper.facing = Math.sign(cx - helper.x);
    helper.cooldown -= dt;
    if (helper.cooldown <= 0 && target.maxHp - target.hp >= BONK.minMissing) {
      heartOrbs.push({ x: helper.x + helper.facing * 10, y: helper.y - 28, w: 12, h: 12, target, life: BONK.orbLife });
      helper.cooldown = BONK.cooldown;
      helper.throwT = gameTime;
    }
  }
  // corazones: persiguen a su jugador y lo curan al tocarlo
  for (let i = heartOrbs.length - 1; i >= 0; i--) {
    const o = heartOrbs[i], t = o.target;
    o.life -= dt;
    if (o.life <= 0 || !t.alive) { heartOrbs.splice(i, 1); continue; }
    const dx = (t.x + t.w / 2) - o.x, dy = (t.y + t.h * 0.4) - o.y, d = Math.hypot(dx, dy) || 1;
    o.x += dx / d * BONK.orbSpeed * dt; o.y += dy / d * BONK.orbSpeed * dt;
    if (d < 20) {
      const healed = Math.min(BONK.heal, t.maxHp - t.hp);
      if (healed > 0) {
        t.hp += healed;
        const pi = players.indexOf(t);
        if (pi >= 0) simStats.healed[pi] += healed;
        floatTexts.push({ x: t.x + t.w / 2 - 10, y: t.y - 10, text: `+${Math.round(healed)}`, color: '#7cff7c', life: 1.0 });
      }
      heartOrbs.splice(i, 1);
    }
  }
}

// PHYSICS: movimientos + manejo de ataques, collisions and regen
function physicsUpdate(dt) {
  if (!hasWorld()) return;
  const rect = viewRect();
  const W = rect.width, H = rect.height, groundY = H - world.groundOffset;
  gameTime += dt;

  // player bullets (straight-line; no homing updates)
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.x += (b.vx || 0) * dt;
    b.y += (b.vy || 0) * dt;

    // collision with enemies
    for (let j = 0; j < enemies.length; j++) {
      const e = enemies[j];
      if (!e.alive) continue;
      if (rectsOverlap(b, e)) {
        e.hp -= b.damage;
        e.lastHitBy = b.owner;
        e.flash = 0.12;
        bullets.splice(i, 1);
        break;
      }
    }
    if (i >= 0 && (b.life <= 0 || b.x < -80 || b.x > world.mapWidth + 80 || b.y < -80 || b.y > H + 80)) {
      const idx = bullets.indexOf(b);
      if (idx >= 0) bullets.splice(idx, 1);
    }
  }

  // enemy bullets update (straight-line homing at spawn; here just move with vx/vy)
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const eb = enemyBullets[i];
    eb.life -= dt;
    eb.x += (eb.vx || 0) * dt;
    eb.y += (eb.vy || 0) * dt;

    if (eb.kind === 'enemyDamage') {
      for (let pi = 0; pi < players.length; pi++) {
        const p = players[pi];
        if (!p.alive) continue;
        if (rectsOverlap(eb, { x: p.x, y: p.y, w: p.w, h: p.h })) {
          if (!p.parryInvul) {
            const hpBefore = p.hp;
            p.hp = Math.max(0, p.hp - eb.value * armorFactor());
            addDamage(pi, 'bala', hpBefore - p.hp);
            p.hitFlash = 0.12;
            p.regenTimer = p.regenDelay;
            if (p.hp <= 0 && p.alive) {
              // handle death and buffs
              const deadIdx = pi;
              p.alive = false;
              p.deadPose = true;
              handlePlayerDeath(deadIdx);
              // check defeat
              if (!anyPlayerAlive()) triggerDefeat();
            }
          }
          enemyBullets.splice(i, 1);
          break;
        }
      }
    } else if (eb.kind === 'heal') {
      // heal allies (enemies). La pastilla nace dentro del Curados que la lanza:
      // atraviesa a los Curados (él incluido) sin curarlos ni gastarse.
      for (let j = 0; j < enemies.length; j++) {
        const ally = enemies[j];
        if (!canBeHealed(ally)) continue;
        if (rectsOverlap(eb, ally)) {
          ally.hp = Math.min(ally.maxHp, ally.hp + eb.value);
          ally.flash = 0.14;
          enemyBullets.splice(i, 1);
          break;
        }
      }
    }

    if (i >= 0 && eb && (eb.life <= 0 || eb.x < -120 || eb.x > world.mapWidth + 120 || eb.y < -120 || eb.y > H + 120)) {
      const idx = enemyBullets.indexOf(eb);
      if (idx >= 0) enemyBullets.splice(idx, 1);
    }
  }
    // Actualizar plataformas móviles
  platforms.forEach(p => {
    if (p.type === 'moving' && p.moveSpeed > 0) {
      p.x += p.moveDir * p.moveSpeed * dt;
      
      // Cambiar dirección en límites
      if (p.x - p.moveOriginX > p.moveRange) {
        p.moveDir = -1;
      } else if (p.x - p.moveOriginX < -p.moveRange) {
        p.moveDir = 1;
      }
    }
  });

  // enemies AI update
  updateEnemies(dt);

  // players update: movement, attacks, regen
  players.forEach((p, pi) => {
    // skip movement/attacks if dead
    if (!p.alive) {
      // keep a "tumbado" visual: no motion, slight rotation handled in render
      p.vx = 0;
      p.vy += 0; // no gravity movement
      return;
    }

    p.coyoteTimer = Math.max(0, (p.coyoteTimer || 0) - dt);
    p.jumpBufferTimer = Math.max(0, (p.jumpBufferTimer || 0) - dt);
    p.dashTimer = Math.max(0, (p.dashTimer || 0) - dt);
    p.parryTimer = Math.max(0, (p.parryTimer || 0) - dt);
    p.meleeTimer = Math.max(0, (p.meleeTimer || 0) - dt);
    p.meleeCooldown = Math.max(0, (p.meleeCooldown || 0) - dt);
    p.shootingCooldown = Math.max(0, (p.shootingCooldown || 0) - dt);
    if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.regenTimer = Math.max(0, (p.regenTimer || 0) - dt);

    // la IA decide sus "teclas" de este frame mirando el estado del juego
    const inp = p.input;
    if (inp.think) inp.think(dt, {
      self: p, partner: players.find(o => o !== p && o.alive) || null,
      enemies, enemyBullets, platforms, foods, meleeRange: MELEE.range,
      viewLeft: world.cameraX + 12, viewRight: world.cameraX + W - 12,
      mapWidth: world.mapWidth
    });

    // inputs horizontal - movement
    const left = inp.isDown('left'), right = inp.isDown('right');
    if (left && !right) p.facing = -1; else if (right && !left) p.facing = 1;
    let targetVx = 0;
    if (left && !right) targetVx = -p.maxSpeed;
    else if (right && !left) targetVx = p.maxSpeed;
    const dv = targetVx - p.vx;
    if (dv !== 0) {
      const acc = Math.sign(dv) * p.accel * dt;
      if (Math.abs(acc) > Math.abs(dv)) p.vx = targetVx; else p.vx += acc;
    }

    // Ice platform friction (resbala más)
    let isOnIce = false;
    for (const plat of platforms) {
      if (plat.type === 'ice' && rectsOverlap({ x: p.x, y: p.y + p.h - 2, w: p.w, h: 2 }, plat)) {
        isOnIce = true;
        break;
      }
    }
    
    // Aplicar friction diferente
    const frictionMult = isOnIce ? 0.5 : 1.0;
    if (Math.abs(p.vx) > 0 && dv === 0) { // Solo cuando NO hay input
      const fren = Math.sign(p.vx) * p.friction * dt * frictionMult;
      if (Math.abs(fren) > Math.abs(p.vx)) p.vx = 0; else p.vx -= fren;
    }

    // jump buffering
    if (inp.wasPressed('jump')) p.jumpBufferTimer = p.jumpBufferTime;
    if (p.grounded) p.coyoteTimer = p.coyoteTime;
    if (p.jumpBufferTimer > 0 && p.coyoteTimer > 0) { p.vy = -p.jumpPower; p.grounded = false; p.coyoteTimer = 0; p.jumpBufferTimer = 0; }

    // dash/parry
    // duración activa con dt (se congela al pausar, a diferencia de setTimeout)
    if (p.dashing) {
      p.dashActiveTimer -= dt;
      if (p.dashActiveTimer <= 0) { p.dashing = false; p.dashInvul = false; }
    }
    if (p.parrying) {
      p.parryActiveTimer -= dt;
      if (p.parryActiveTimer <= 0) { p.parrying = false; p.parryInvul = false; }
    }
    if (inp.wasPressed('dash') && p.dashTimer <= 0 && !p.dashing) {
      p.dashing = true; p.dashTimer = p.dashCooldown; p.dashInvul = true; p.dashActiveTimer = p.dashDuration;
      p.vx = p.facing * p.dashSpeed; p.vy = Math.min(p.vy || 0, 0);
    }
    if (inp.wasPressed('parry') && p.parryTimer <= 0 && !p.parrying) {
      p.parrying = true; p.parryInvul = true; p.parryTimer = p.parryCooldown; p.parryActiveTimer = p.parryDuration;
    }

    // Attacks:
    // Lanzziano: melee keyed - damage per press (no cooldown enforcement)
    if (inp.wasPressed('melee')) {
      p.meleeTimer = MELEE.duration;
      // apply immediate hit once per press (we ensure wasPressed gives edge)
      const hb = { x: p.facing > 0 ? p.x + p.w : p.x - MELEE.range, y: p.y + (p.h - MELEE.width)/2, w: MELEE.range, h: MELEE.width };
      for (const e of enemies) {
        if (!e.alive) continue;
        if (rectsOverlap(hb, e)) {
          e.hp -= (p.meleeDamage || MELEE.damage);
          e.lastHitBy = pi;
          e.flash = 0.12;
          e.vx = p.facing * 140;
        }
      }
    }

    // Jhoabxi: can hold shoot (isDown) and fires bullets every 0.35s
    if (inp.isDown('shoot') && p.shootingCooldown <= 0) {
      const bx = p.x + (p.facing > 0 ? p.w + 6 : -6);
      const by = p.y + Math.round(p.h * 0.45);
      spawnPlayerBullet(bx, by, JHOABXI_BULLET_SPEED, (p.bulletDamage || JHOABXI_BULLET_DAMAGE), pi);
      p.shootingCooldown = JHOABXI_SHOOT_CD;
    }

        // gravity + integrate
    if (!p.dashing) p.vy += world.gravity * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;

    // NUEVO: Colisión con plataformas
    p.grounded = false;
    for (const plat of platforms) {
      if (!plat.solid && plat.type !== 'spike') continue; // Solo sólidas o spike
      
      // Collision detection AABB
      if (rectsOverlap(p, plat)) {
        // Damage on spike
        if (plat.type === 'spike') {
          const hpBefore = p.hp;
          p.hp = Math.max(0, p.hp - plat.damage);
          addDamage(pi, 'pinchos', hpBefore - p.hp);
          p.hitFlash = 0.12;
          p.regenTimer = p.regenDelay;
          // Bounce up
          p.vy = -300;
          break;
        }
        
        // Solid platform collision (resolve from above)
        if (p.vy > 0) { // Cayendo
          p.y = plat.y - p.h;
          p.vy = 0;
          p.grounded = true;
        } else if (p.vy < 0) { // Golpeando desde abajo
          p.y = plat.y + plat.h;
          p.vy = 0;
        }
      }
    }

    // Colisión antiguo suelo (fallback)
    if (p.y + p.h > groundY) { p.y = groundY - p.h; p.vy = 0; p.grounded = true; }

    // bounds (expandir con mapWidth)
    const margin = 8;
    if (p.x < margin) { p.x = margin; p.vx = Math.max(0, p.vx); }
    if (p.x + p.w > world.mapWidth - margin) { p.x = world.mapWidth - margin - p.w; p.vx = Math.min(0, p.vx); }

    // regen
    if (p.hp < p.maxHp && (p.regenTimer || 0) <= 0 && p.alive) {
      p.hp = Math.min(p.maxHp, p.hp + p.regenRate * dt);
    }
    if (p.hp <= 0 && p.alive) {
      p.alive = false;
      p.deadPose = true;
      handlePlayerDeath(pi);
      if (!anyPlayerAlive()) triggerDefeat();
    }
  }); // end players.forEach

  if (!gameOver) { updateFoods(dt); updateHelper(dt, W); }
  updateCamera(W);

  // advance rounds when enemies dead
  if (!gameOver) {
    const aliveEnemies = enemies.filter(e => e.alive);
    if (aliveEnemies.length === 0) {
      if (!survival && currentRound >= maxRounds) {
        triggerVictory();
      } else {
        if (roundAdvanceTimer <= 0) roundAdvanceTimer = timeBetweenRounds;
        roundAdvanceTimer -= dt;
        if (roundAdvanceTimer <= 0) {
          // supervivencia: tras vencer a un jefe, los vivos recuperan toda la vida
          if (survival && isBossRound(currentRound)) {
            players.forEach(p => {
              if (!p.alive) return;
              floatTexts.push({ x: p.x, y: p.y - 18, text: `+${Math.round(p.maxHp - p.hp)}`, color: '#7cff7c', life: 1.4 });
              p.hp = p.maxHp;
            });
          }
          currentRound++;
          spawnEnemiesForRound(currentRound, world.mapWidth, H);
          roundAdvanceTimer = 0;
        }
      }
    }
  }
}

// Cámara cooperativa: los bordes de la pantalla actúan como paredes para los jugadores vivos,
// así nunca se separan más que el ancho de la pantalla y ninguno queda fuera de cámara.
// Se usa la cámara del frame anterior para bloquear (no arrastrar) al que se aleja.
function updateCamera(W) {
  const alive = players.filter(p => p.alive);
  if (alive.length === 0) return;
  const edge = 12;
  const left = world.cameraX + edge;
  const right = world.cameraX + W - edge;
  for (const p of alive) {
    if (p.x < left) { p.x = left; p.vx = Math.max(0, p.vx); }
    if (p.x + p.w > right) { p.x = right - p.w; p.vx = Math.min(0, p.vx); }
  }
  // centrar en el promedio de los vivos (un cuerpo caído no arrastra la cámara)
  const avgX = alive.reduce((sum, p) => sum + p.x + p.w / 2, 0) / alive.length;
  world.cameraX = Math.max(0, Math.min(avgX - W / 2, world.mapWidth - W));
}

// triggers
// el loop sigue corriendo (update ya se salta con gameOver) para que el overlay se redibuje, p. ej. al redimensionar
function triggerDefeat() { if (gameOver) return; gameOver = true; gameOverType = 'defeat'; saveBestRound(); announce('battleEnd', { result: 'defeat' }); }
function triggerVictory() { if (gameOver) return; gameOver = true; gameOverType = 'victory'; saveBestRound(); announce('battleEnd', { result: 'victory' }); }
// ronda más alta del jugador (solo partidas de verdad: las simulaciones no cuentan); en supervivencia
// se guarda aparte, y vencer al jefe del modo normal cuenta como victoria (misiones, desbloquea supervivencia).
// 'runFinished' avisa a cloud.js para subir las CapoCoins ganadas
function saveBestRound() {
  if (simulationMode) return;
  if (survival) recordSurvivalRound(currentRound);
  else {
    recordRound(currentRound);
    if (gameOverType === 'victory') addWin();
  }
  window.dispatchEvent(new CustomEvent('runFinished', { detail: { survival, round: currentRound, result: gameOverType } }));
}

// render function
function render() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;

  // la cámara se actualiza en physicsUpdate (updateCamera)

  // Save canvas state para transformación
  ctx.save();
  ctx.translate(-world.cameraX, 0);

  // background (ajustado al mapa)
  const bg = ctx.createLinearGradient(world.cameraX, 0, world.cameraX, H);
  bg.addColorStop(0, '#062b16'); bg.addColorStop(1, '#0a2b14');
  ctx.fillStyle = bg; ctx.fillRect(world.cameraX, 0, W + world.mapWidth, H);

  // Renderizar plataformas
  platforms.forEach(p => {
    if (p.type === 'spike') {
      // Dibuja pinchos
      ctx.fillStyle = p.color;
      for (let i = 0; i < Math.ceil(p.w / 16); i++) {
        ctx.beginPath();
        ctx.moveTo(Math.round(p.x + i * 16), Math.round(p.y + p.h));
        ctx.lineTo(Math.round(p.x + i * 16 + 8), Math.round(p.y));
        ctx.lineTo(Math.round(p.x + i * 16 + 16), Math.round(p.y + p.h));
        ctx.fill();
      }
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.w, p.h);
      
      // Borde para plataformas hielo
      if (p.type === 'ice') {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.round(p.x), Math.round(p.y), p.w, p.h);
      }
    }
  });

  // ground
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, H - world.groundOffset, world.mapWidth, world.groundOffset);

  // comida (brilla, flota y parpadea en rojo antes de desaparecer)
  foods.forEach(f => drawFood(ctx, f, gameTime));

  // enemies
  enemies.forEach(e => {
    // Melle y Shotter: sprites animados (enemySprites.js); el resto, rectángulos de su color
    if (HAS_SPRITE.has(e.kind)) {
      // el Curados mira al compañero que cura; los demás, al jugador más cercano
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      const target = (e.kind === 'curados' && findNearestAllyEnemy(e.id, cx, cy)) || findNearestPlayer(cx, cy);
      // jefe en FURIA: aura roja que late detrás de él
      if (e.kind === 'boss' && e.enraged && e.alive) {
        const pulse = 0.55 + Math.sin(gameTime * 8) * 0.2, R = e.h * 0.95;
        const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, R);
        glow.addColorStop(0, `rgba(255,40,40,${pulse.toFixed(2)})`); glow.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      }
      drawEnemy(ctx, e, { time: gameTime, target });
      if (!e.alive) return;
    } else {
      if (!e.alive) {
        ctx.fillStyle = 'rgba(120,30,30,0.12)';
        ctx.fillRect(Math.round(e.x), Math.round(e.y + 6), e.w, e.h - 6);
        return;
      }
      ctx.fillStyle = e.flash > 0 ? '#fff6c8' : e.color;
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.w, e.h);
    }

    // hp bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x, e.y - 8, e.w, 6);
    ctx.fillStyle = '#ff6a6a'; ctx.fillRect(e.x, e.y - 8, Math.max(0, Math.round(e.w * (e.hp / e.maxHp))), 6);

    ctx.fillStyle = '#fff'; ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(e.display, Math.round(e.x), Math.round(e.y - 12));

    // marca de tirador con turno: punto de mira rojo sobre el nombre
    if (e.canShoot) {
      const cx = Math.round(e.x + e.w / 2), cy = Math.round(e.y - 30);
      ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
    }
  });

  // bullets
  bullets.forEach(b => { ctx.fillStyle = '#ffdca3'; ctx.fillRect(Math.round(b.x - b.w/2), Math.round(b.y - b.h/2), b.w, b.h); });
  enemyBullets.forEach(eb => {
    if (eb.kind === 'heal') { drawPill(ctx, eb, gameTime); return; } // pastilla del Curados
    if (eb.style === 'portal') { drawEnergyBall(ctx, eb, gameTime); return; }    // disparo del Fuerte
    if (eb.style === 'doom') { drawEnergyBall(ctx, eb, gameTime, 10); return; } // magia del jefe, más grande
    ctx.fillStyle = '#ff9999'; ctx.fillRect(Math.round(eb.x - eb.w/2), Math.round(eb.y - eb.h/2), eb.w, eb.h);
  });

  // players
  // players: sprites animados (playerSprites.js); la caja de colisión sigue siendo p.x/p.y/p.w/p.h
  players.forEach((p, i) => {
    const kind = i === 0 ? 'lanzziano' : 'jhoabxi';
    const cx = p.x + p.w / 2;
    if (p.alive) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(Math.round(cx - 16), Math.round(p.y + p.h - 3), 32, 5); }

    // Jhoabxi apunta el AK al enemigo más cercano que tenga delante (inclinación de 10 en 10 grados)
    let aim = 0;
    if (kind === 'jhoabxi' && p.alive) {
      const t = findNearestEnemy(cx, p.y + p.h * 0.45);
      if (t) {
        const dx = ((t.x + t.w / 2) - cx) * p.facing, dy = (t.y + t.h / 2) - (p.y + p.h * 0.45);
        if (dx > 0) aim = Math.max(-30, Math.min(40, Math.round(Math.atan2(-dy, dx) * 180 / Math.PI / 10) * 10));
      }
    }
    // con ARMADURA: brillo plateado alrededor del personaje (como en el primer Salvando Otare)
    if (boosts.armor && p.alive) { ctx.save(); ctx.shadowColor = '#c9d4de'; ctx.shadowBlur = 12 + Math.sin(gameTime * 4) * 3; }
    drawPlayer(ctx, p, { kind, time: gameTime, aim, shooting: kind === 'jhoabxi' && p.shootingCooldown > JHOABXI_SHOOT_CD - 0.07 });
    if (boosts.armor && p.alive) ctx.restore();

    // golpe de Lanzziano: estela blanca delante del puño
    if (p.alive && p.meleeTimer > MELEE.duration * 0.4) {
      const fx = cx + p.facing * (p.w / 2 + MELEE.range * 0.55), fy = p.y + p.h * 0.42;
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${(p.meleeTimer / MELEE.duration).toFixed(2)})`; ctx.lineWidth = 3;
      const dir = p.facing > 0 ? 0 : Math.PI; // el arco mira hacia donde pega
      ctx.beginPath();
      ctx.arc(fx - p.facing * 14, fy, 18, dir - 0.9, dir + 0.9);
      ctx.stroke();
      ctx.restore();
    }

    // nombre (y modo de la IA) centrados encima, por encima de la corona/gorra
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = p.alive ? '#fff' : 'rgba(255,255,255,0.5)';
    const nameY = p.alive ? p.y - 18 : p.y + p.h - 34;
    ctx.fillText(p.name, Math.round(cx - ctx.measureText(p.name).width / 2), Math.round(nameY));
    // jugador manejado por la IA (simulación o compañero): qué está decidiendo
    if (p.alive && p.input.think && p.input.label) {
      const urgent = p.input.mode === 'retreat' || p.input.mode === 'highGround';
      const label = simulationMode ? p.input.label : `IA · ${p.input.label}`;
      ctx.fillStyle = urgent ? '#ff8080' : p.input.mode === 'eat' ? '#7cff7c' : '#9fe8ff'; ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(label, Math.round(cx - ctx.measureText(label).width / 2), Math.round(p.y - 34));
    }
  });

  // ayudante BonkChanti y sus corazones
  if (helper) drawBonkChanti(ctx, helper, gameTime);
  heartOrbs.forEach(o => drawHeartOrb(ctx, o, gameTime));

  floatTexts.forEach(t => drawFloatText(ctx, t));

  ctx.restore(); // fin del espacio del mundo: el HUD y overlays se dibujan fijos en pantalla

  // HUD players (top-left); en pantallas pequeñas (móvil) más compacto
  const hudSmall = W < 900;
  const hudX = 14, hudY = 12;
  players.forEach((p,i) => {
    const y = hudY + i * (hudSmall ? 26 : 34);
    const boxW = hudSmall ? 130 : 280, boxH = hudSmall ? 14 : 18;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(hudX, y, boxW, boxH);
    ctx.fillStyle = '#7cff7c'; ctx.fillRect(hudX + 2, y + 2, Math.max(0, Math.round((boxW - 4) * (p.hp / p.maxHp))), boxH - 4);
    ctx.fillStyle = '#fff'; ctx.font = `${hudSmall ? 8 : 12}px "Press Start 2P", monospace`;
    ctx.fillText(`${p.name} ${Math.round(p.hp)}/${p.maxHp}`, hudX + boxW + 8, y + boxH - (hudSmall ? 4 : 6));
  });

  // CapoCoins (partidas de verdad): saldo total y lo ganado en esta partida, y los objetos activos
  if (!simulationMode) {
    const cy = hudY + players.length * (hudSmall ? 26 : 34) + 6;
    drawCoinIcon(ctx, hudX + 9, cy + 7, 8);
    ctx.fillStyle = '#ffd24a'; ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(`${getCoins()}`, hudX + 24, cy + 12);
    if (runCoins > 0) { ctx.fillStyle = '#fff3b0'; ctx.font = '9px "Press Start 2P", monospace'; ctx.fillText(`+${runCoins} esta partida`, hudX + 110, cy + 11); }
    const active = [['speed', 'x2 VEL'], ['strength', 'x2 FUE'], ['health', 'x2 VIDA'], ['armor', 'ARMADURA'], ['coinsx2', 'x2 MONEDAS'], ['bonkchanti', 'BONKCHANTI']].filter(([k]) => boosts[k]).map(([, t]) => t);
    if (active.length) { ctx.fillStyle = '#ff6bec'; ctx.font = '8px "Press Start 2P", monospace'; ctx.fillText(active.join('  '), hudX, cy + 30); }
  }

  // HUD right: round + legend
  const legend = controlsLegend();
  const small = W < 900;                          // móvil / ventana estrecha: panel compacto
  const panelW = small ? Math.min(300, W * 0.42) : 380, panelH = 26 + legend.length * (small ? 16 : 22);
  const px = W - panelW - 18, py = 18;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(px, py, panelW, panelH);
  ctx.fillStyle = '#cfe'; ctx.font = `${small ? 9 : 12}px "Press Start 2P", monospace`;
  ctx.fillText(`Ronda: ${survival ? `${currentRound} · SUPERVIVENCIA` : `${currentRound}/${maxRounds}`}${simulationMode ? (aiParams ? '   [IA ENTRENADA' : '   [SIMULACIÓN IA') + (startRound > 1 ? ` · desde ${startRound}]` : ']') : ''}`, px + 12, py + 18);
  ctx.font = `${small ? 7 : 10}px "Press Start 2P", monospace`;
  legend.forEach((line, i) => ctx.fillText(line, px + 12, py + (small ? 34 : 40) + i * (small ? 16 : 22)));

  // enemigos vivos (y balas): abajo a la izquierda; en pantallas pequeñas arriba, para no quedar bajo los botones táctiles
  ctx.fillStyle = '#fff';
  if (hudSmall) {
    ctx.font = '8px "Press Start 2P", monospace';
    // (más abajo si hay objetos activos: su línea va justo debajo de las monedas)
    const boostLine = !simulationMode && Object.values(boosts).some(Boolean) ? 14 : 0;
    ctx.fillText(`Enemigos vivos: ${enemies.filter(e => e.alive).length}`, hudX, hudY + players.length * 26 + (simulationMode ? 12 : 42) + boostLine);
  } else {
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(`Enemigos vivos: ${enemies.filter(e => e.alive).length}`, 12, H - 12);
    ctx.fillText(`Balas: ${bullets.length} / E-Balas: ${enemyBullets.length}`, 12, H - 26);
  }

  
    // overlay
  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#fff'; ctx.font = '28px "Press Start 2P", monospace';
    const text = survival ? 'FIN' : gameOverType === 'victory' ? 'VICTORIA' : 'DERROTA';
    const tw = ctx.measureText(text).width; ctx.fillText(text, (W - tw) / 2, H / 2 - 50);
    ctx.font = '12px "Press Start 2P", monospace';
    const sub = survival ? `Aguantaste hasta la ronda ${currentRound}`
      : gameOverType === 'victory' ? '¡Has completado las rondas!' : 'Todos los jugadores han caído';
    const sw = ctx.measureText(sub).width; ctx.fillText(sub, (W - sw) / 2, H / 2 - 20);
    if (simulationMode) {
      const secs = Math.floor(simStats.time), mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0');
      const summary = `Ronda ${currentRound} · ${mm}:${ss} · Kills ${players[0].name} ${simStats.kills[0]} / ${players[1].name} ${simStats.kills[1]}`;
      ctx.font = '10px "Press Start 2P", monospace'; ctx.fillStyle = '#9fe8ff';
      const smw = ctx.measureText(summary).width; ctx.fillText(summary, (W - smw) / 2, H / 2 + 8);
    }
    
        // NUEVO: Botones interactivos
    // Calcular y guardar posiciones para detección de clics
    gameOverButtons.retry.x = W / 2 - 150;
    gameOverButtons.retry.y = H / 2 + 40;
    gameOverButtons.menu.x = W / 2 + 10;
    gameOverButtons.menu.y = H / 2 + 40;
    
    // Dibujar botón REINTENTAR
    ctx.fillStyle = 'rgba(100,200,100,0.8)';
    ctx.fillRect(gameOverButtons.retry.x, gameOverButtons.retry.y, gameOverButtons.retry.w, gameOverButtons.retry.h);
    ctx.fillStyle = '#000';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText('REINTENTAR', gameOverButtons.retry.x + 5, gameOverButtons.retry.y + 25);
    
    // Dibujar botón MENÚ
    ctx.fillStyle = 'rgba(200,100,100,0.8)';
    ctx.fillRect(gameOverButtons.menu.x, gameOverButtons.menu.y, gameOverButtons.menu.w, gameOverButtons.menu.h);
    ctx.fillStyle = '#000';
    ctx.fillText('MENÚ', gameOverButtons.menu.x + 35, gameOverButtons.menu.y + 25);
  }
}


// Leyenda de controles del HUD según quién maneja a cada jugador
function controlsLegend() {
  if (simulationMode) return ['Los dos jugadores los maneja la IA'];
  const names = ['Lanzziano', 'Jhoabxi'];
  const mine = controlModes.findIndex(m => m === 'solo' || m === 'touch');
  if (mine >= 0) {
    const partner = names[1 - mine];
    if (controlModes[mine] === 'touch') return [`Tú: ${names[mine]} (botones)`, `${partner}: IA`];
    return [
      `Tú: ${names[mine]} · Flechas o WASD`,
      `${mine === 0 ? 'Golpe' : 'Disparo'}: M/F/J · Salto: ↑/W/Espacio`,
      `Parry: ↓/S · Dash: Enter/X · ${partner}: IA`
    ];
  }
  return [
    `${names[0]} (P1): Flechas · Golpe M`,
    `${names[1]} (P2): WASD · Disparo F (mantener)`,
    'Parry: P1 ↓  P2 S   Dash: P1 Enter  P2 X'
  ];
}

// Moneda CapoCoin en pixel art: círculo dorado con borde y una "C"
function drawCoinIcon(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = '#8a5a12'; ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff3b0'; ctx.fillRect(Math.round(cx - r * 0.55), Math.round(cy - r * 0.6), 2, 2);
  ctx.fillStyle = '#8a5a12'; ctx.font = `${Math.round(r * 1.1)}px "Press Start 2P", monospace`;
  ctx.fillText('C', Math.round(cx - r * 0.45), Math.round(cy + r * 0.5));
  ctx.restore();
}

// wrapper update
function update(dt) {
  if (paused || gameOver || introHold) return;
  if (simulationMode) simStats.time += dt;
  physicsUpdate(dt);
}

// public API
// startRound solo se usa en simulación; jugando de verdad siempre se empieza en la ronda 1
// hold: true = empieza congelado hasta releaseHold() (cuenta atrás del menú)
// boosts: objetos de la TIENDA activos ({ speed, strength, health }); no se aplican en simulación
// controls: ['keys'|'solo'|'touch'|'ai', ...] por jugador (controles.js); touch: entrada táctil (touch.js);
// partnerAi: parámetros de la IA compañera (null = la original); survival: modo SUPERVIVENCIA
export function start({ canvas: suppliedCanvas, onResize, simulation = false, aiParams: params = null, startRound: round = 1, hold = false, boosts: shopBoosts = null,
  controls = null, touch = null, partnerAi = null, survival: survivalMode = false } = {}) {
  if (running || headlessBusy) return;
  running = true; paused = false; gameOver = false; gameOverType = ''; onResizeCallback = onResize || null;
  survival = !simulation && !!survivalMode;
  introHold = !!hold;
  simulationMode = !!simulation;
  boosts = { ...(shopBoosts || {}) };   // también en "Ver simulación": los objetos activos del admin
  controlModes = controls || ['keys', 'keys'];
  touchInput = touch;
  partnerAiParams = partnerAi;
  aiParams = simulationMode ? params : null;
  startRound = simulationMode ? clampRound(round) : 1;
  canvas = suppliedCanvas instanceof HTMLCanvasElement ? suppliedCanvas : document.querySelector('canvas#gameCanvas');
  if (!canvas) throw new Error('Canvas no encontrado.');
  ctx = canvas.getContext('2d');
  resizeCanvasInternal();
  if ('ResizeObserver' in window) { resizeObserver = new ResizeObserver(() => resizeCanvasInternal()); resizeObserver.observe(canvas); }
  else window.addEventListener('resize', resizeCanvasInternal);
  resetInput();
  // Un único listener para los botones de game over (se quita en stop())
  canvas.removeEventListener('click', handleGameOverClick);
  canvas.addEventListener('click', handleGameOverClick);
  loopHandle = createLoop({ update(dt) { update(dt); }, render() { render(); } });
  loopHandle.start();
}

export function releaseHold() { introHold = false; }

// Reiniciar la partida (REINTENTAR). hold: true = congelada hasta releaseHold(), para la cuenta atrás
export function restart({ hold = false } = {}) {
  if (!running || !canvas) return;
  gameOver = false;
  gameOverType = '';
  introHold = !!hold;
  setupPlayers(world.mapWidth, canvas.clientHeight);
  loopHandle.start();
}

export function stop() {
  if (!running) return;
  // salir a mitad de partida: subir igualmente las CapoCoins ganadas
  if (!simulationMode && !gameOver && runCoins > 0) window.dispatchEvent(new CustomEvent('runFinished'));
  running = false; paused = false; introHold = false;
  if (loopHandle) loopHandle.stop(); loopHandle = null;
  if (resizeObserver) { try { resizeObserver.unobserve(canvas); } catch(e){} resizeObserver = null; }
  else window.removeEventListener('resize', resizeCanvasInternal);
  if (canvas) canvas.removeEventListener('click', handleGameOverClick);
  gameOver = false; gameOverType = ''; lastGroundY = null;
  canvas = null; ctx = null; players = []; enemies = []; bullets = []; enemyBullets = []; foods = []; floatTexts = []; helper = null; heartOrbs = []; onResizeCallback = null; resetInput();
}
// --- Modo predicción ---
// Corre una partida de simulación IA completa sin canvas ni requestAnimationFrame: física con dt fijo
// de 1/60 y Math.random sembrado (misma semilla = misma partida). El trabajo se reparte en trozos
// de ~200 frames con setTimeout para no congelar la pestaña. Devuelve una promesa con las estadísticas.
const HEADLESS_DT = 1 / 60;
const HEADLESS_VIEW = { width: 1024, height: 768 }; // mismo tamaño que las simulaciones de referencia
const HEADLESS_CHUNK_FRAMES = 200;
const HEADLESS_CHUNK_MS = 16;

// Generador congruencial lineal (el mismo de los scripts de simulación de referencia)
function seededRandom(seed) {
  let s = (Math.floor(seed) || 1) % 2147483648;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

export function isBusy() { return running || headlessBusy; }
function clampRound(r) { return Math.max(1, Math.min(maxRounds, Math.floor(r) || 1)); }

// chunked = false: todo de un tirón (para Web Workers, donde no hay pestaña que congelar)
// boosts: objetos de la TIENDA para medir su efecto ({ speed, strength, health }); por defecto ninguno
export function runHeadless({ seed = 1, maxSeconds = 600, onProgress, isCancelled, aiParams: params = null, chunked = true, startRound: round = 1, boosts: simBoosts = null } = {}) {
  if (running || headlessBusy) return Promise.reject(new Error('Ya hay una partida en marcha.'));
  headlessBusy = true;
  survival = false;
  aiParams = params;
  boosts = { ...(simBoosts || {}) };
  startRound = clampRound(round);
  const random = seededRandom(seed);
  const realRandom = Math.random;
  const maxFrames = Math.round(maxSeconds / HEADLESS_DT);
  const modeFrames = [{}, {}]; // frames vivos de cada jugador en cada modo de la IA
  let frames = 0;

  // Math.random solo se sustituye mientras corre un trozo: entre trozos el resto de la página usa el normal
  const withSeededRandom = fn => {
    Math.random = random;
    try { return fn(); } finally { Math.random = realRandom; }
  };

  withSeededRandom(() => {
    headlessView = HEADLESS_VIEW;
    simulationMode = true; // las kills no van al contador KILLS
    gameOver = false; gameOverType = ''; paused = false;
    setupPlayers(HEADLESS_VIEW.width, HEADLESS_VIEW.height);
  });

  return new Promise((resolve, reject) => {
    const finish = cancelled => {
      // progreso fino: rondas superadas + fracción de enemigos muertos en la última (victoria = 20)
      const killedFrac = enemies.length ? enemies.filter(e => !e.alive).length / enemies.length : 0;
      const result = {
        seed,
        result: cancelled ? 'cancelled' : gameOver ? gameOverType : 'timeout',
        round: currentRound,
        progress: gameOverType === 'victory' ? maxRounds : currentRound - 1 + killedFrac,
        seconds: simStats.time,
        kills: [...simStats.kills],
        damage: simStats.damage.map(d => ({ ...d })),
        healed: [...simStats.healed],
        food: { ...simStats.food },
        modeFrames
      };
      headlessView = null; headlessBusy = false; simulationMode = false; aiParams = null; boosts = {};
      gameOver = false; gameOverType = '';
      players = []; enemies = []; bullets = []; enemyBullets = []; foods = []; floatTexts = []; helper = null; heartOrbs = [];
      resolve(result);
    };
    const chunk = () => {
      try {
        withSeededRandom(() => {
          const t0 = performance.now();
          const chunkFrames = chunked ? HEADLESS_CHUNK_FRAMES : Infinity;
          for (let n = 0; n < chunkFrames && !gameOver && frames < maxFrames; n++) {
            simStats.time += HEADLESS_DT;
            physicsUpdate(HEADLESS_DT);
            frames++;
            players.forEach((p, i) => {
              if (!p.alive) return;
              const m = p.input.mode || '?';
              modeFrames[i][m] = (modeFrames[i][m] || 0) + 1;
            });
            if (chunked && performance.now() - t0 > HEADLESS_CHUNK_MS) break;
          }
        });
      } catch (err) {
        headlessView = null; headlessBusy = false; simulationMode = false; aiParams = null; boosts = {};
        reject(err);
        return;
      }
      if (typeof onProgress === 'function') onProgress({ seconds: simStats.time, round: currentRound });
      if (gameOver || frames >= maxFrames) finish(false);
      else if (typeof isCancelled === 'function' && isCancelled()) finish(true);
      else setTimeout(chunk, 0);
    };
    setTimeout(chunk, 0);
  });
}

// Handler para clics en botones de game over
function handleGameOverClick(e) {
  if (!gameOver || !canvas) return;

  // clientX/clientY ya están en píxeles CSS, igual que las coordenadas de dibujo (no dividir por dpr)
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  // Verificar si clickeó REINTENTAR
  if (clickX >= gameOverButtons.retry.x &&
      clickX <= gameOverButtons.retry.x + gameOverButtons.retry.w &&
      clickY >= gameOverButtons.retry.y &&
      clickY <= gameOverButtons.retry.y + gameOverButtons.retry.h) {
    // el menú hace la transición (círculo negro + 3, 2, 1, PELIEN) y llama a restart();
    // si nadie escucha el evento, se reinicia directamente
    const handled = !window.dispatchEvent(new CustomEvent('gameRetry', { cancelable: true }));
    if (!handled) restart();
    return;
  }

  // Verificar si clickeó MENÚ
  if (clickX >= gameOverButtons.menu.x &&
      clickX <= gameOverButtons.menu.x + gameOverButtons.menu.w &&
      clickY >= gameOverButtons.menu.y &&
      clickY <= gameOverButtons.menu.y + gameOverButtons.menu.h) {
    stop();
    window.dispatchEvent(new CustomEvent('gameEnded'));
  }
}


export function pause() { if (!running || paused) return; paused = true; if (loopHandle) loopHandle.stop(); }
export function resume() { if (!running || !paused) return; paused = false; if (loopHandle) loopHandle.start(); }
export function isPaused() { return !!paused; }
// ai.js - IA "pro" del modo simulación. Controla a un jugador pulsando sus acciones
// ('left', 'right', 'jump', 'parry', 'dash', 'melee', 'shoot') igual que lo haría el teclado.
//
// Piensa en tres capas, de más lenta a más rápida:
//   1. Estrategia (mode): qué quiere hacer ahora, con histéresis para no cambiar de idea cada frame.
//        ATAQUE    ir a por el objetivo más valioso (no el más cercano)
//        CUBRIR    Lanzziano protege a Jhoabxi de los Melle que se le acercan
//        APOYO     Jhoabxi se coloca detrás de Lanzziano y dispara
//        DISTANCIA Jhoabxi se aleja de los Melle sin dejar de disparar
//        RETIRADA  poca vida: huir para regenerar (6 HP/s tras 2 s sin daño)
//        ALTURA    subirse a una plataforma baja: los Melle no llegan arriba
//        REMATAR   un enemigo casi muerto al alcance: acabarlo aunque esté en retirada
//        REAGRUPAR sin enemigos (entre rondas): juntarse y curarse
//        COMER     ir a por comida: ya si va justo de vida o se va a perder; si no, guardarla para luego
//                  (no come si le falta poca vida, deja la comida al compañero si la necesita más)
//   2. Táctica: moverse, golpear, disparar, saltar a plataformas.
//   3. Reflejos: parry, dash o salto ante una bala o golpe inminente (siempre activos).
// Cada jugador tiene su propia IA; se coordinan leyendo el modo del compañero (partner.input.mode).

// --- constantes fijas (física del juego, no se entrenan) ---
const LOOKAHEAD = 0.7;            // segundos que mira al futuro para saber si una bala le va a dar
const STEP = 1 / 60;              // resolución de esa predicción
const JUMP_WINDOW = [0.12, 0.45]; // si no hay parry ni dash, salta: ni muy pronto (no sube a tiempo) ni muy tarde
const MELEE_PRESS_RATE = 0.1;     // como mucho 10 golpes por segundo, como alguien machacando la tecla
const CORNER_MARGIN = 40;         // a esta distancia del borde se considera acorralado
const SPIKE_JUMP_CLEARANCE = 150; // no saltar si hay pinchos a esta distancia horizontal y a alcance de salto
const JUMP_REACH = 170;           // altura que alcanza un salto (~144 px) con margen

// --- parámetros ajustables (el modo Entrenamiento los optimiza dentro de [min, max]) ---
// def = valor de la IA original, hecho a mano y medido en simulación.
export const AI_PARAM_SPACE = {
  // reflejos
  parryWindow:        { def: 0.18, min: 0.05, max: 0.22, label: 'Ventana de parry (s)' },   // el parry dura 0.22 s
  dashWindow:         { def: 0.25, min: 0.05, max: 0.40, label: 'Ventana de dash (s)' },    // dash a través de la bala
  // táctica
  kiteDistance:       { def: 200,  min: 100,  max: 320,  label: 'Jhoabxi huye de Melle a (px)' },
  soloKiteDistance:   { def: 260,  min: 140,  max: 420,  label: 'Jhoabxi solo huye a (px)' },
  supportOffset:      { def: 150,  min: 60,   max: 280,  label: 'Jhoabxi detrás de Lanzziano (px)' },
  melleSpacing:       { def: 50,   min: 30,   max: 70,   label: 'Lanzziano separado de Melle (px)' }, // pega hasta ~74, el Melle a <38
  peelRadius:         { def: 180,  min: 80,   max: 320,  label: 'Radio para CUBRIR (px)' },
  peelMinHp:          { def: 0.35, min: 0.10, max: 0.70, label: 'Vida mínima para CUBRIR' },
  leash:              { def: 0.6,  min: 0.3,  max: 0.9,  label: 'Separación máx. (fracción pantalla)' },
  highGroundMax:      { def: 130,  min: 80,   max: 140,  label: 'Altura máx. de plataforma (px)' }, // el salto llega a ~144
  highGroundSearch:   { def: 450,  min: 150,  max: 700,  label: 'Distancia a buscar plataforma (px)' },
  swarmRadius:        { def: 160,  min: 80,   max: 260,  label: 'Radio de "rodeado" (px)' },
  // estrategia: retirada (por debajo de Hp, o de Swarmed con 3+ Melle encima; vuelve al recuperar Recover)
  retreatMeleeHp:      { def: 0.35, min: 0.10, max: 0.60, label: 'Lanzziano se retira con vida' },
  retreatMeleeSwarmed: { def: 0.50, min: 0.20, max: 0.80, label: 'Lanzziano rodeado se retira con' },
  retreatMeleeRecover: { def: 0.80, min: 0.50, max: 1.00, label: 'Lanzziano vuelve con vida' },
  retreatShooterHp:      { def: 0.25, min: 0.10, max: 0.60, label: 'Jhoabxi se retira con vida' },
  retreatShooterSwarmed: { def: 0.40, min: 0.20, max: 0.80, label: 'Jhoabxi rodeado se retira con' },
  retreatShooterRecover: { def: 0.60, min: 0.40, max: 1.00, label: 'Jhoabxi vuelve con vida' },
  finishHits:         { def: 2,    min: 0,    max: 4,    label: 'Remata si muere en N golpes' },
  finishMinHp:        { def: 0.2,  min: 0,    max: 0.6,  label: 'Vida mínima para rematar' },
  // a quién atacar: valor de cada tipo y peso de vida baja / tirador activo / distancia
  prioCurados:        { def: 6,    min: 0,    max: 8,    label: 'Prioridad Curados' },
  prioTigre:          { def: 5,    min: 0,    max: 8,    label: 'Prioridad Tigre' },
  prioJuan:           { def: 3,    min: 0,    max: 8,    label: 'Prioridad Juan E' },
  prioOscar:          { def: 3,    min: 0,    max: 8,    label: 'Prioridad Oscar' },
  prioShotter:        { def: 3,    min: 0,    max: 8,    label: 'Prioridad Shotter' },
  prioFuerte:         { def: 2.5,  min: 0,    max: 8,    label: 'Prioridad Fuerte' },
  prioBoss:           { def: 2,    min: 0,    max: 8,    label: 'Prioridad Jefe' },
  prioMelle:          { def: 1,    min: 0,    max: 8,    label: 'Prioridad Melle' },
  targetLowHp:        { def: 2,    min: 0,    max: 5,    label: 'Peso: enemigo casi muerto' },
  targetShooting:     { def: 2,    min: 0,    max: 5,    label: 'Peso: tirador activo' },
  targetDistance:     { def: 250,  min: 100,  max: 600,  label: 'Distancia que resta 1 punto (px)' },
  // comida: cuándo comer ya y cuándo guardarla
  eatHp:              { def: 0.5,  min: 0.2,  max: 0.9,  label: 'Come ya con vida bajo' },
  eatMinUseful:       { def: 0.8,  min: 0.3,  max: 1.0,  label: 'Si no, come si aprovecha (fracción)' },
  eatMaxDistance:     { def: 450,  min: 150,  max: 900,  label: 'Distancia máx. para ir a comer (px)' },
  eatDangerRadius:    { def: 110,  min: 0,    max: 300,  label: 'No come con un Melle a (px)' },
  eatExpireTime:      { def: 4,    min: 0,    max: 10,   label: 'Come lo que caduca en (s)' }
};

export const DEFAULT_AI_PARAMS = Object.fromEntries(Object.entries(AI_PARAM_SPACE).map(([k, s]) => [k, s.def]));

// Completa con los valores por defecto y recorta al rango (sirve también para parámetros guardados de versiones viejas)
export function normalizeAIParams(params) {
  const p = {};
  for (const [k, s] of Object.entries(AI_PARAM_SPACE)) {
    const v = Number(params?.[k]);
    p[k] = Number.isFinite(v) ? Math.min(s.max, Math.max(s.min, v)) : s.def;
  }
  return p;
}

export const AI_MODE_LABELS = {
  attack: 'ATAQUE', cover: 'CUBRIR', support: 'APOYO', kite: 'DISTANCIA',
  retreat: 'RETIRADA', highGround: 'ALTURA', finish: 'REMATAR', regroup: 'REAGRUPAR', eat: 'COMER'
};

export function createAI(role, params = null) {
  return new PlayerAI(role, normalizeAIParams(params));
}

const center = o => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
const overlap = (a, b) => !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
const hDist = (a, b) => Math.abs(center(a).x - center(b).x);

function nearest(self, list) {
  const s = center(self);
  let best = null, bestDist = Infinity;
  for (const e of list) {
    const c = center(e);
    const d = Math.hypot(c.x - s.x, c.y - s.y);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

// Pinchos que se solapan horizontalmente con el jugador (ampliado `extra` px a cada lado)
// y que están entre `above` px por encima y sus pies
function spikesNear(self, platforms, extra, above) {
  return platforms.find(pl => pl.type === 'spike'
    && pl.x < self.x + self.w + extra && pl.x + pl.w > self.x - extra
    && pl.y + pl.h >= self.y - above && pl.y <= self.y + self.h + 10);
}

class PlayerAI {
  constructor(role, params) {
    this.role = role;
    this.p = params;
    const r = role === 'melee'
      ? { hp: params.retreatMeleeHp, swarmed: params.retreatMeleeSwarmed, recover: params.retreatMeleeRecover }
      : { hp: params.retreatShooterHp, swarmed: params.retreatShooterSwarmed, recover: params.retreatShooterRecover };
    // volver a la pelea siempre con más vida de la que hizo huir (si no, entraría y saldría cada frame)
    r.recover = Math.max(r.recover, r.hp + 0.05, r.swarmed + 0.05);
    this.retreatRule = r;
    this.kindPriority = {
      curados: params.prioCurados, tigre: params.prioTigre, juan: params.prioJuan, oscar: params.prioOscar,
      shotter: params.prioShotter, fuerte: params.prioFuerte, boss: params.prioBoss, melle: params.prioMelle
    };
    this.held = new Set();     // acciones mantenidas este frame (como isDown)
    this.pressed = new Set();  // acciones pulsadas este frame (como wasPressed, se consumen al leerlas)
    this.meleeTimer = 0;
    this.mode = 'regroup';
    this.retreating = false;   // histéresis de la retirada
    this.runup = false;        // tomando carrerilla para saltar a una plataforma
    this.foodTarget = null;    // comida a la que va (el compañero lo lee para no ir los dos a la misma)
  }

  get label() { return AI_MODE_LABELS[this.mode] || ''; }

  isDown(action) { return this.held.has(action); }
  wasPressed(action) { return this.pressed.delete(action); }

  // Saltar solo si no hay pinchos a alcance del salto
  jump() {
    if (spikesNear(this.view.self, this.view.platforms, SPIKE_JUMP_CLEARANCE, JUMP_REACH)) return false;
    this.pressed.add('jump');
    return true;
  }

  // view: { self, partner, enemies, enemyBullets, platforms, foods, meleeRange, viewLeft, viewRight, mapWidth }
  think(dt, view) {
    this.held.clear();
    this.pressed.clear();
    this.meleeTimer = Math.max(0, this.meleeTimer - dt);
    this.view = view;

    const s = this.analyze(view);
    this.mode = this.chooseMode(s);

    let move = this.act(s);
    const dodgeMove = this.dodge(view, s.enemies);
    if (dodgeMove !== null) move = dodgeMove;

    // encima o dentro de pinchos: salir por el borde más cercano (lo más prioritario)
    const spike = spikesNear(view.self, view.platforms, 0, 60);
    if (spike) {
      const sx = center(view.self).x;
      move = (sx - spike.x) < (spike.x + spike.w - sx) ? -1 : 1;
    }

    if (move < 0) this.held.add('left');
    else if (move > 0) this.held.add('right');
  }

  // ---------- 1. lectura de la situación ----------
  analyze(view) {
    const { self, partner, platforms, mapWidth } = view;
    const enemies = view.enemies.filter(e => e.alive);
    const melles = enemies.filter(e => e.kind === 'melle');
    const hp = self.hp / self.maxHp;
    const ground = platforms.reduce((a, b) => (b.w > a.w ? b : a), platforms[0]);
    const bounds = { left: Math.max(view.viewLeft, 8), right: Math.min(view.viewRight, mapWidth - 8) };
    const damage = this.role === 'melee' ? self.meleeDamage : self.bulletDamage;
    const swarm = melles.filter(e => hDist(e, self) < this.p.swarmRadius).length;
    // centro de masas de los enemigos (para saber "hacia dónde está la pelea")
    const front = enemies.length ? enemies.reduce((sum, e) => sum + center(e).x, 0) / enemies.length : center(self).x;
    return {
      self, partner, enemies, melles, hp, ground, bounds, damage, swarm, front,
      foods: view.foods || [],
      partnerMode: partner?.input?.mode || null,
      onPlatform: this.standingOn(self, platforms, ground)
    };
  }

  // ---------- 2. estrategia ----------
  chooseMode(s) {
    const food = this.pickFood(s);
    this.foodTarget = null;
    const eat = () => { this.foodTarget = food; return 'eat'; };

    if (s.enemies.length === 0) { this.retreating = false; return food ? eat() : 'regroup'; }

    // histéresis: entra en retirada con poca vida y no sale hasta haberse curado bien
    const r = this.retreatRule;
    if (this.retreating && s.hp >= r.recover) this.retreating = false;
    if (!this.retreating && (s.hp < r.hp || (s.hp < r.swarmed && s.swarm >= 3))) this.retreating = true;

    // con poca vida, comer va antes que rematar
    if (food && s.hp < this.p.eatHp) return eat();
    const finishTarget = this.findFinishTarget(s);
    if (finishTarget && s.hp >= this.p.finishMinHp) { this.finishTarget = finishTarget; return 'finish'; }
    // comer cura más rápido que retirarse a regenerar (6 HP/s tras 2 s sin daño)
    if (food) return eat();

    if (this.retreating) {
      // si solo hay Melle cerca, subir a una plataforma es más seguro que correr
      const shootersActive = s.enemies.some(e => e.canShoot);
      if (!shootersActive && this.pickHighGround(s)) return 'highGround';
      return 'retreat';
    }

    if (this.role === 'melee') {
      if (this.findPeelTarget(s)) return 'cover';
      return 'attack';
    }
    // Jhoabxi
    const kiteDist = s.partner ? this.p.kiteDistance : this.p.soloKiteDistance;
    const chaser = nearest(s.self, s.melles);
    if (chaser && hDist(chaser, s.self) < kiteDist) {
      // muchos Melle encima y una plataforma cerca: ganar altura y disparar desde arriba
      if (s.swarm >= 3 && this.pickHighGround(s)) return 'highGround';
      return 'kite';
    }
    return s.partner ? 'support' : 'attack';
  }

  // ¿Comer ahora, y qué? La comida solo se consume si al jugador le falta vida, así que puede guardarse.
  //  - va justo de vida (< eatHp): come lo que tenga a mano
  //  - si no, solo come si aprovecha casi toda la curación (eatMinUseful) o si la comida está a punto
  //    de desaparecer (eatExpireTime): con la vida casi llena, mejor dejarla para luego
  //  - si los dos quieren la misma, se la queda el que más la necesita (y está más cerca)
  //  - no se mete donde hay un Melle encima de la comida, salvo en apuros
  pickFood(s) {
    const { self, partner } = s, p = this.p;
    const missing = self.maxHp - self.hp;
    if (!s.foods.length || missing <= 0) return null;
    const urgent = s.hp < p.eatHp;
    const critical = s.hp < p.eatHp * 0.6;
    const partnerMissing = partner ? partner.maxHp - partner.hp : 0;
    let best = null, bestScore = 0;
    for (const f of s.foods) {
      if (!this.canReachFood(s, f)) continue;
      const d = hDist(f, self);
      if (d > p.eatMaxDistance * (urgent ? 1.5 : 1)) continue;
      if (d / 400 > f.life - 0.3) continue;                 // no llega antes de que desaparezca
      const useful = Math.min(f.heal, missing);
      const expiring = f.life < p.eatExpireTime;
      if (!urgent && !expiring && useful < f.heal * p.eatMinUseful) continue; // guardarla para luego
      if (partner && partner.input?.foodTarget === f && !critical) {
        // reparto: necesidad menos distancia (con desempate fijo por rol, para que nunca se la cedan los dos)
        const mine = missing - d * 0.1 + (this.role === 'melee' ? 0.01 : 0);
        const theirs = partnerMissing - hDist(f, partner) * 0.1 + (this.role === 'melee' ? 0 : 0.01);
        if (theirs > mine) continue;
      }
      if (!critical && s.melles.some(e => hDist(e, f) < p.eatDangerRadius)) continue;
      let score = useful / (1 + d / 250);
      if (expiring) score *= 1.3;
      if (score > bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  // En el suelo, en la plataforma donde está, o en una plataforma baja a la que puede saltar.
  // Fuera de cámara no: los bordes de la pantalla le frenan.
  canReachFood(s, f) {
    const fx = center(f).x;
    if (fx < s.bounds.left || fx > s.bounds.right) return false;
    if (!f.plat || s.onPlatform === f.plat) return true;
    const height = s.ground.y - f.plat.y;
    return height >= 50 && height <= this.p.highGroundMax;
  }

  // Ir hasta la comida (tocarla ya la come)
  goEat(s) {
    const f = this.foodTarget, { self } = s;
    const fx = center(f).x, sx = center(self).x;
    if (f.plat && s.onPlatform !== f.plat) return this.goToPlatform(s, f.plat);
    if (!f.plat && s.onPlatform) {
      const pl = s.onPlatform;
      // la comida está debajo de la plataforma: bajarse por el borde más cercano
      if (fx > pl.x - 10 && fx < pl.x + pl.w + 10) return (sx - pl.x) < (pl.x + pl.w - sx) ? -1 : 1;
    }
    return Math.abs(fx - sx) > 6 ? Math.sign(fx - sx) : 0;
  }

  // Un enemigo cercano que muere en pocos golpes: rematarlo da una kill casi gratis.
  // Solo Lanzziano: las balas de Jhoabxi apuntan solas al más cercano, no puede elegir a quién rematar.
  findFinishTarget(s) {
    if (this.role !== 'melee') return null;
    return s.enemies.find(e => e.hp <= s.damage * this.p.finishHits && hDist(e, s.self) < 120 && e.kind !== 'boss') || null;
  }

  // Melle que amenaza al compañero (para que Lanzziano lo intercepte)
  findPeelTarget(s) {
    if (!s.partner || s.hp < this.p.peelMinHp) return null;
    const threatened = s.partnerMode === 'retreat' || s.partnerMode === 'kite' || s.partnerMode === 'highGround';
    const radius = threatened ? this.p.peelRadius * 1.5 : this.p.peelRadius;
    let best = null, bestDist = radius;
    for (const e of s.melles) {
      const d = hDist(e, s.partner);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  // El objetivo más valioso: tipo peligroso, poca vida, tirador con turno, cercanía
  pickTarget(s) {
    let best = null, bestScore = -Infinity;
    for (const e of s.enemies) {
      let score = this.kindPriority[e.kind] ?? 1;
      score += (1 - e.hp / e.maxHp) * this.p.targetLowHp;    // casi muerto: más fácil de quitar de en medio
      if (e.canShoot) score += this.p.targetShooting;       // ahora mismo está disparando
      score -= hDist(e, s.self) / this.p.targetDistance;    // pero no cruzar el mapa por él
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  // ---------- 3. táctica ----------
  act(s) {
    const shooter = this.role === 'shooter';
    // Jhoabxi dispara siempre que haya enemigos, haga lo que haga (las balas apuntan solas)
    if (shooter && s.enemies.length) this.held.add('shoot');

    switch (this.mode) {
      case 'regroup':    return this.regroup(s);
      case 'eat':        return this.goEat(s);
      case 'finish':     return shooter ? this.holdPosition(s) : this.meleeAttack(s, this.finishTarget);
      case 'retreat':    return this.retreat(s);
      case 'highGround': return this.goToPlatform(s, this.pickHighGround(s));
      case 'cover':      return this.meleeAttack(s, this.findPeelTarget(s));
      case 'kite':       return this.kite(s);
      case 'support':    return this.support(s);
      case 'attack':     return shooter ? this.support(s) : this.meleeAttack(s, this.pickTarget(s));
    }
    return 0;
  }

  // Ir a por un objetivo y golpearlo desde fuera del alcance de los Melle
  meleeAttack(s, target) {
    if (!target) return this.regroup(s);
    const { self } = s;
    const sx = center(self).x, t = center(target);
    const dx = t.x - sx;
    const dir = Math.sign(dx) || self.facing;
    const reach = self.w / 2 + this.view.meleeRange + target.w / 2 - 6;
    if (Math.abs(dx) > reach || Math.abs(t.y - center(self).y) > 50) {
      // si está subido a una plataforma, bajarse andando hacia el objetivo
      return dir;
    }
    // un Melle demasiado cerca: retroceder un paso y pegarle desde fuera de su alcance
    if (s.melles.some(e => Math.abs(center(e).x - sx) < this.p.melleSpacing)) return -dir;
    if (this.meleeTimer <= 0) {
      this.pressed.add('melee');
      this.meleeTimer = MELEE_PRESS_RATE;
    }
    return self.facing === dir ? 0 : dir; // en rango: solo girarse si mira al lado contrario
  }

  // Jhoabxi: alejarse de los Melle sin dejar de disparar
  kite(s) {
    const { self } = s;
    const chaser = nearest(self, s.melles);
    if (!chaser) return this.support(s);
    return this.runFrom(s, center(chaser).x);
  }

  // Huir de un punto; acorralado, pasar por encima o a través
  runFrom(s, fromX) {
    const { self, bounds } = s;
    const dx = fromX - center(self).x;
    const away = -Math.sign(dx) || -self.facing;
    const room = away < 0 ? self.x - bounds.left : bounds.right - (self.x + self.w);
    if (room > CORNER_MARGIN) return away;
    // acorralado: dash a través (da invulnerabilidad) o saltar por encima
    if (self.dashTimer <= 0 && !self.dashing && Math.abs(dx) < 120) {
      this.pressed.add('dash');
      return -away;
    }
    if (!self.grounded) return -away; // ya en el aire: seguir por encima
    if (Math.abs(dx) < 140 && this.jump()) return -away;
    return 0;
  }

  // Retirada: alejarse de la pelea, hacia el lado del compañero si puede (que cubra)
  retreat(s) {
    const { self, partner, melles, enemies } = s;
    const danger = melles.length ? melles : enemies;
    const closest = nearest(self, danger);
    if (!closest) return this.regroup(s);
    // si nadie le persigue de cerca, esconderse detrás del compañero
    if (partner && hDist(closest, self) > 220) return this.moveTo(s, this.behind(s, partner, this.p.supportOffset), 30);
    return this.runFrom(s, center(closest).x);
  }

  // Jhoabxi: plantarse y disparar (moverse le hace disparar peor, medido en simulación);
  // solo se recoloca detrás de Lanzziano si se ha separado demasiado de él
  support(s) {
    const { self, partner, bounds } = s;
    if (!partner) return this.holdPosition(s);
    const tooFar = hDist(partner, self) > (bounds.right - bounds.left) * this.p.leash;
    if (tooFar) return this.moveTo(s, this.behind(s, partner, this.p.supportOffset), 40);
    return this.holdPosition(s);
  }

  // Sin moverse salvo que un Melle se acerque
  holdPosition(s) {
    const chaser = nearest(s.self, s.melles);
    if (chaser && hDist(chaser, s.self) < this.p.kiteDistance) return this.runFrom(s, center(chaser).x);
    return 0;
  }

  // Entre rondas: juntarse con el compañero (y curarse)
  regroup(s) {
    const { self, partner, bounds } = s;
    if (!partner) return 0;
    const dx = center(partner).x - center(self).x;
    const far = Math.abs(dx) > Math.min(140, (bounds.right - bounds.left) * this.p.leash);
    return far ? Math.sign(dx) : 0;
  }

  // Punto a `offset` px de `ally`, en el lado contrario a la pelea
  behind(s, ally, offset) {
    const ax = center(ally).x;
    const side = Math.sign(s.front - ax) || 1;
    return Math.max(s.bounds.left + 20, Math.min(s.bounds.right - 20, ax - side * offset));
  }

  moveTo(s, x, tolerance) {
    const dx = x - center(s.self).x;
    return Math.abs(dx) > tolerance ? Math.sign(dx) : 0;
  }

  // ---------- plataformas ("terreno alto") ----------
  standingOn(self, platforms, ground) {
    if (!self.grounded) return null;
    return platforms.find(pl => pl !== ground && pl.type !== 'spike'
      && Math.abs(self.y + self.h - pl.y) < 3 && self.x + self.w > pl.x && self.x < pl.x + pl.w) || null;
  }

  // Plataforma baja, fija y cercana, que no esté encima de pinchos ni bajo ellos
  pickHighGround(s) {
    if (s.onPlatform && s.onPlatform.type !== 'moving') return s.onPlatform;
    const { self, ground } = s;
    let best = null, bestDist = this.p.highGroundSearch;
    for (const pl of this.view.platforms) {
      if (pl === ground || pl.type === 'spike' || pl.type === 'moving') continue;
      const height = ground.y - pl.y;
      if (height < 50 || height > this.p.highGroundMax) continue;
      if (pl.x < s.bounds.left || pl.x + pl.w > s.bounds.right) continue; // fuera de cámara: inalcanzable
      const d = Math.abs(pl.x + pl.w / 2 - center(self).x);
      if (d < bestDist) { bestDist = d; best = pl; }
    }
    return best;
  }

  // Llegar encima de una plataforma: tomar carrerilla desde fuera y saltar
  // (saltar desde debajo hace chocar con la cabeza)
  goToPlatform(s, pl) {
    if (!pl) return this.retreat(s);
    const { self } = s;
    const sx = center(self).x, px = pl.x + pl.w / 2;
    if (s.onPlatform === pl) { this.runup = false; return Math.abs(sx - px) > pl.w * 0.2 ? Math.sign(px - sx) : 0; }
    if (!self.grounded) return Math.sign(px - sx) || 0;     // en el aire: dirigirse al centro

    const height = s.ground.y - pl.y;
    const [jumpMin, jumpMax] = height <= 90 ? [60, 120] : [120, 160]; // más alta, saltar desde más lejos
    const toward = Math.sign(px - sx) || 1;
    const out = toward > 0 ? pl.x - (self.x + self.w) : self.x - (pl.x + pl.w); // distancia al borde, desde fuera
    if (out < jumpMin) this.runup = true;
    if (this.runup) {
      if (out >= jumpMax) this.runup = false;
      else return -toward;                                   // alejarse para coger carrerilla
    }
    const fastEnough = Math.sign(self.vx) === toward && Math.abs(self.vx) > 250;
    if (out <= jumpMax && fastEnough) this.jump();
    return toward;
  }

  // ---------- reflejos ----------
  // Esquivar: devuelve una dirección si el esquive necesita moverse (dash), o null
  dodge({ self, enemyBullets }, enemies) {
    if (self.parrying || self.dashing) return null; // ya es invulnerable
    const threat = this.findThreat(self, enemyBullets, enemies);
    if (!threat) return null;

    if (threat.t <= this.p.parryWindow && self.parryTimer <= 0) {
      this.pressed.add('parry');
      return null;
    }
    const b = threat.bullet;
    if (!b) {
      // golpe de Melle sin parry disponible: saltar (su golpe no llega tan alto)
      if (self.grounded && threat.t <= 0.2) this.jump();
      return null;
    }
    if (threat.t <= this.p.dashWindow && self.dashTimer <= 0) {
      this.pressed.add('dash');
      return -Math.sign(b.vx) || -self.facing; // hacia donde viene la bala, para atravesarla
    }
    const horizontal = Math.abs(b.vx) > Math.abs(b.vy);
    if (horizontal && self.grounded && threat.t >= JUMP_WINDOW[0] && threat.t <= JUMP_WINDOW[1]) {
      this.jump();
    }
    return null;
  }

  // La amenaza más próxima: una bala que le dará (suponiendo que se queda quieto)
  // o un Melle en rango con el ataque casi listo. t = segundos hasta el impacto.
  findThreat(self, enemyBullets, enemies) {
    let best = null;
    const pad = 4;
    const box = { x: self.x - pad, y: self.y - pad, w: self.w + pad * 2, h: self.h + pad * 2 };
    for (const b of enemyBullets) {
      if (b.kind !== 'enemyDamage') continue;
      for (let t = 0; t <= LOOKAHEAD; t += STEP) {
        if (best && t >= best.t) break;
        if (overlap({ x: b.x + b.vx * t, y: b.y + b.vy * t, w: b.w, h: b.h }, box)) {
          best = { t, bullet: b };
          break;
        }
      }
    }
    const s = center(self);
    for (const e of enemies) {
      if (e.kind !== 'melle') continue;
      const c = center(e);
      if (Math.hypot(c.x - s.x, c.y - s.y) <= e.attackRange - 6 + 12) {
        const t = Math.max(0, e.attackCooldown || 0);
        if (!best || t < best.t) best = { t, melee: e };
      }
    }
    return best;
  }
}

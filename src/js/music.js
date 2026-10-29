// music.js - banda sonora original del juego, compuesta en código y tocada con el sintetizador del
// navegador (Web Audio). No usa archivos de audio.
//
//   menu    "Noche en Otare"       funk retro de terror, pegadizo
//   battle  "Duelo de Caballeros"  fanfarria medieval con ritmo de galope; se intensifica (niveles 0-2)
//   boss    "El Tigre Oscuro"      tema del jefe final
//   + sonidos de la cuenta atrás (3, 2, 1, PELIEN) y melodías de victoria / derrota.
//   + EFECTOS DE SONIDO de la partida (golpes, disparos, saltos, parry...), también sintetizados: SFX más abajo.
//
// Notación de las pistas: un token por semicorchea (16 por compás): 'E4' nota, '.' silencio,
// '-' alarga la nota anterior, 'E4+G4+B4' acorde. Las pistas se repiten cada una con su propia longitud.
// Los navegadores no dejan sonar audio hasta que el usuario hace clic o pulsa una tecla: la música
// arranca con la primera interacción.

// ---------- notas ----------
const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freq(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return null;
  const semis = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (semis - 69) / 12);
}
const seq = (...bars) => bars.join(' ').trim().split(/\s+/);
const repeatBar = (bar, n) => Array(n).fill(bar).join(' ');
const gallop = n => repeatBar(`${n} . ${n} ${n}`, 4);          // ta . ta-ta: el galope de los caballos
const arp4 = (a, b, c, d) => repeatBar(`${a} ${b} ${c} ${d}`, 4);

// ---------- canciones ----------
// tracks: { inst, steps, level (nivel mínimo para sonar), transpose (semitonos) }
// drums: por nivel, 16 caracteres por compás ('x' = golpe) para kick / snare / hat
const SONGS = {
  // ===== MENÚ: "Noche en Otare" (Mi menor, funk de terror ochentero) =====
  menu: {
    bpm: 104,
    tracks: [
      { inst: 'bass', steps: seq(
        'E2 . . E2 . . G2 . A2 . . A2 G2 . E2 .',
        'C2 . . C2 . . E2 . G2 . . G2 E2 . C2 .',
        'A1 . . A1 . . C2 . E2 . . E2 C2 . A1 .',
        'B1 . . B1 . . D#2 . F#2 . . F#2 D#2 . B1 .') },
      { inst: 'stab', steps: seq(
        '. . . . E4+G4+B4 . . . . . . . E4+G4+B4 . . .',
        '. . . . C4+E4+G4 . . . . . . . C4+E4+G4 . . .',
        '. . . . A3+C4+E4 . . . . . . . A3+C4+E4 . . .',
        '. . . . B3+D#4+F#4 . . . . . . . B3+D#4+F#4 . . .') },
      { inst: 'lead', steps: seq(
        'B4 - . . G4 . A4 . B4 - - - . . . .',
        'C5 . B4 . A4 . G4 . E4 - - - . . . .',
        'A4 - . . C5 . . B4 A4 - . . E4 - . .',
        'D#5 - - . B4 - . . F#4 - - - . . . .',
        'E5 - . . D5 . B4 . G4 - . A4 B4 - . .',
        'C5 - . . E5 . D5 . C5 . B4 . G4 - . .',
        'A4 . C5 . E5 - . . D5 . C5 . B4 . A4 .',
        'B4 - - - - - - - . . . . F#4 . A4 .') },
      // un "aullido" de lobo-tigre cada 8 compases
      { inst: 'howl', steps: seq(repeatBar('.', 16 * 7), 'B5 - - - - - - - . . . . . . . .') }
    ],
    drums: [
      { kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }
    ]
  },

  // ===== BATALLA: "Duelo de Caballeros" (Re menor, galope) =====
  battle: {
    bpm: 148,
    fasterAtLevel2: 1.08,
    tracks: [
      { inst: 'bass', steps: seq(gallop('D2'), gallop('Bb1'), gallop('C2'), gallop('A1')) },
      { inst: 'lead', steps: seq(
        'D5 . . A4 D5 . E5 . F5 - . . E5 . D5 .',
        'D5 - . . C5 . Bb4 . A4 - . . Bb4 . C5 .',
        'C5 . . G4 C5 . D5 . E5 - . . D5 . C5 .',
        'C#5 - . . E5 - . . A5 - - - . . . .',
        'F5 . E5 . D5 . A4 . D5 . E5 . F5 . G5 .',
        'F5 - . . D5 - . . Bb4 . C5 . D5 - . .',
        'E5 - . . C5 - . . G4 . A4 . Bb4 . C5 .',
        'A4 - - - C#5 - - - E5 - - - A5 - - -') },
      { inst: 'arp', level: 1, steps: seq(arp4('D4', 'F4', 'A4', 'D5'), arp4('Bb3', 'D4', 'F4', 'Bb4'), arp4('C4', 'E4', 'G4', 'C5'), arp4('A3', 'C#4', 'E4', 'A4')) },
      // nivel 2: la melodía doblada una octava abajo con "metales"
      { inst: 'brass', level: 2, transpose: -12, ref: 'lead' }
    ],
    drums: [
      { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x...x...x...x...' },
      { kick: 'x.....x.x.....x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
      { kick: 'x.x...x.x.x...x.', snare: '....x..x....x.x.', hat: 'xxxxxxxxxxxxxxxx' }
    ]
  },

  // ===== JEFE: "El Tigre Oscuro" (Mi frigio, oscuro y épico) =====
  boss: {
    bpm: 164,
    tracks: [
      { inst: 'bass', steps: seq(
        repeatBar('E2 . E3 .', 4), repeatBar('F2 . F3 .', 4), repeatBar('G2 . G3 .', 4), repeatBar('F2 . F3 .', 4)) },
      { inst: 'pad', steps: seq(
        'E3+B3+E4 - - - - - - - - - - - - - - -',
        'F3+C4+F4 - - - - - - - - - - - - - - -',
        'G3+D4+G4 - - - - - - - - - - - - - - -',
        'F3+C4+F4 - - - - - - - - - - - - - - -') },
      { inst: 'lead', steps: seq(
        'E5 - - . F5 - - . E5 - . . B4 - . .',
        'F5 - - . A5 - . . G5 . F5 . E5 - . .',
        'G5 - - . F5 . E5 . D5 - . . B4 - . .',
        'C5 - - - B4 - - - A#4 - - - B4 - - -',
        'E5 . G5 . B5 - . . A5 . G5 . F5 - E5 .',
        'F5 . A5 . C6 - . . B5 . A5 . G5 - F5 .',
        'G5 - . . F5 - . . E5 - . . D5 - . .',
        'E5 - - - - - - - E4 - - - - - - -') },
      { inst: 'arp', steps: seq(arp4('E4', 'G4', 'B4', 'E5'), arp4('F4', 'A4', 'C5', 'F5'), arp4('G4', 'B4', 'D5', 'G5'), arp4('F4', 'A4', 'C5', 'F5')) },
      { inst: 'brass', transpose: -12, ref: 'lead' }
    ],
    drums: [
      { kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx' }
    ]
  }
};

// Melodías cortas (se tocan una vez)
const JINGLES = {
  victory: { bpm: 150, lead: seq('C5 . E5 . G5 . C6 - - . G5 . C6 - - - - - - -'), bass: seq('C3 - - - E3 - - - G3 - - - C3 - - - - - - -') },
  defeat:  { bpm: 84,  lead: seq('E4 - - . D#4 - - . D4 - - . C#4 - - - - - - -'), bass: seq('A2 - - - - - - - - - - - A1 - - - - - - -') }
};

// ---------- motor de audio ----------
let ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null, analyser = null;
let volume = loadNumber('salvandoOtare.volume', 0.6);
let enabled = loadNumber('salvandoOtare.musicOn', 1) === 1;
let sfxEnabled = loadNumber('salvandoOtare.sfxOn', 1) === 1;   // efectos de sonido, aparte de la música
let ducked = false;
let wanted = null;          // canción que debería sonar ('menu', 'battle', 'boss' o null)
let current = null;         // { name, song, gain, step, nextTime, level }
let level = 0;              // intensidad de la batalla (0-2)
let timer = null;

function loadNumber(key, def) {
  try { const v = Number(localStorage.getItem(key)); return localStorage.getItem(key) === null || !Number.isFinite(v) ? def : v; } catch (e) { return def; }
}
function saveNumber(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();       // evita que se sature al sumar instrumentos
  comp.threshold.value = -14; comp.ratio.value = 4;
  master = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  analyser = ctx.createAnalyser();                    // para musicStatus(): ¿está sonando algo?
  analyser.fftSize = 1024;
  musicBus.connect(master);
  sfxBus.connect(master);
  master.connect(analyser);
  analyser.connect(comp);
  comp.connect(ctx.destination);
  applyVolume();
  // ruido blanco para la batería
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// el volumen general manda sobre los dos canales; la música y los efectos se apagan por separado
function applyVolume() {
  if (!master) return;
  master.gain.setTargetAtTime(volume, ctx.currentTime, 0.08);
  musicBus.gain.setTargetAtTime(enabled ? (ducked ? 0.35 : 1) : 0, ctx.currentTime, 0.08);
  sfxBus.gain.setTargetAtTime(sfxEnabled ? 0.9 : 0, ctx.currentTime, 0.05);
}

// ---------- instrumentos ----------
function envGain(t, peak, attack, dur, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

function tone(dest, type, f, t, dur, peak, opts = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (opts.glideTo) o.frequency.exponentialRampToValueAtTime(opts.glideTo, t + dur);
  let node = o;
  if (opts.vibrato) {                                  // vibrato suave en las notas largas
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.5; lg.gain.value = f * 0.012;
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(t + 0.12); lfo.stop(t + dur);
  }
  if (opts.lowpass) {
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = opts.lowpass;
    node.connect(flt); node = flt;
  }
  const g = envGain(t, peak, opts.attack ?? 0.008, dur, opts.release ?? 0.04);
  node.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dest, t, dur, peak, filterType, filterFreq) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter();
  flt.type = filterType; flt.frequency.value = filterFreq;
  const g = envGain(t, peak, 0.002, dur, dur * 0.8);
  s.connect(flt); flt.connect(g); g.connect(dest);
  s.start(t); s.stop(t + dur + 0.02);
}

const INSTRUMENTS = {
  lead:  (d, f, t, dur) => tone(d, 'square', f, t, dur * 0.92, 0.07, { vibrato: dur > 0.25 }),
  brass: (d, f, t, dur) => tone(d, 'sawtooth', f, t, dur * 0.9, 0.045, { lowpass: 1800, attack: 0.03 }),
  bass:  (d, f, t, dur) => tone(d, 'triangle', f, t, Math.max(0.08, dur * 0.85), 0.2),
  arp:   (d, f, t)      => tone(d, 'square', f, t, 0.07, 0.025),
  stab:  (d, f, t)      => tone(d, 'square', f, t, 0.12, 0.03, { lowpass: 2600 }),
  pad:   (d, f, t, dur) => tone(d, 'triangle', f, t, dur, 0.05, { attack: 0.25, release: 0.3 }),
  howl:  (d, f, t, dur) => tone(d, 'sine', f * 0.75, t, dur, 0.05, { glideTo: f * 1.15, attack: 0.3, release: 0.4 })
};

function drum(kind, d, t) {
  if (kind === 'kick') tone(d, 'sine', 150, t, 0.14, 0.5, { glideTo: 42, attack: 0.002, release: 0.1 });
  else if (kind === 'snare') { noise(d, t, 0.13, 0.22, 'bandpass', 1900); tone(d, 'triangle', 190, t, 0.07, 0.12); }
  else noise(d, t, 0.035, 0.06, 'highpass', 7000);
}

// ---------- efectos de sonido de la partida ----------
// Cada uno es una receta corta de osciladores y ruido. gap: tiempo mínimo entre dos iguales (para que
// una ráfaga de disparos o diez enemigos muriendo a la vez no saturen).
const SFX = {
  punch:   { gap: 0.05, play: (d, t) => { noise(d, t, 0.06, 0.16, 'bandpass', 900); tone(d, 'sine', 140, t, 0.08, 0.22, { glideTo: 60 }); } },
  hit:     { gap: 0.04, play: (d, t) => { noise(d, t, 0.05, 0.12, 'bandpass', 1500); tone(d, 'square', 180, t, 0.05, 0.05, { glideTo: 90, lowpass: 1200 }); } },
  shoot:   { gap: 0.07, play: (d, t) => { noise(d, t, 0.07, 0.16, 'highpass', 1800); tone(d, 'square', 260, t, 0.05, 0.05, { glideTo: 90, lowpass: 2000 }); } },
  jump:    { gap: 0.08, play: (d, t) => tone(d, 'square', 280, t, 0.12, 0.05, { glideTo: 620, lowpass: 3000 }) },
  dash:    { gap: 0.1,  play: (d, t) => { noise(d, t, 0.2, 0.13, 'bandpass', 700); noise(d, t + 0.05, 0.15, 0.08, 'bandpass', 1600); } },
  parry:   { gap: 0.1,  play: (d, t) => { tone(d, 'triangle', 1180, t, 0.28, 0.08); tone(d, 'sine', 1770, t, 0.22, 0.05); tone(d, 'sine', 2650, t, 0.12, 0.03); } },
  block:   { gap: 0.06, play: (d, t) => { tone(d, 'square', 1500, t, 0.08, 0.05, { lowpass: 4000 }); noise(d, t, 0.04, 0.08, 'highpass', 4000); } },
  hurt:    { gap: 0.12, play: (d, t) => tone(d, 'sawtooth', 240, t, 0.16, 0.08, { glideTo: 110, lowpass: 1400 }) },
  enemyShoot: { gap: 0.09, play: (d, t) => tone(d, 'sine', 900, t, 0.08, 0.035, { glideTo: 380 }) },
  bossShoot:  { gap: 0.15, play: (d, t) => { tone(d, 'sawtooth', 160, t, 0.3, 0.06, { glideTo: 70, lowpass: 900 }); noise(d, t, 0.25, 0.05, 'lowpass', 600); } },
  enemyDie:{ gap: 0.06, play: (d, t) => { noise(d, t, 0.22, 0.14, 'lowpass', 1200); tone(d, 'square', 320, t, 0.18, 0.04, { glideTo: 70, lowpass: 1600 }); } },
  coin:    { gap: 0.05, play: (d, t) => { tone(d, 'square', freq('E6'), t, 0.05, 0.03); tone(d, 'square', freq('B6'), t + 0.05, 0.1, 0.03); } },
  bigCoin: { gap: 0.2,  play: (d, t) => ['E6', 'G#6', 'B6', 'E7'].forEach((n, i) => tone(d, 'square', freq(n), t + i * 0.06, 0.12, 0.035)) },
  eat:     { gap: 0.1,  play: (d, t) => { tone(d, 'square', freq('C5'), t, 0.06, 0.05); tone(d, 'square', freq('G5'), t + 0.07, 0.1, 0.05); } },
  iceShot: { gap: 0.1,  play: (d, t) => { tone(d, 'triangle', 900, t, 0.12, 0.05, { glideTo: 1500 }); noise(d, t, 0.1, 0.04, 'highpass', 5000); } },
  freeze:  { gap: 0.08, play: (d, t) => { tone(d, 'sine', 1800, t, 0.25, 0.05, { glideTo: 2600 }); tone(d, 'sine', 2700, t + 0.04, 0.2, 0.03); noise(d, t, 0.18, 0.06, 'highpass', 6000); } },
  meteor:  { gap: 0.12, play: (d, t) => { noise(d, t, 0.45, 0.2, 'lowpass', 700); tone(d, 'sawtooth', 120, t, 0.35, 0.09, { glideTo: 40, lowpass: 800 }); } },
  scissors:{ gap: 0.1,  play: (d, t) => { noise(d, t, 0.05, 0.06, 'highpass', 6000); noise(d, t + 0.07, 0.05, 0.06, 'highpass', 6000); tone(d, 'triangle', 1300, t, 0.06, 0.03, { glideTo: 900 }); } },
  shield:  { gap: 0.2,  play: (d, t) => ['C5', 'G5', 'C6'].forEach((n, i) => tone(d, 'triangle', freq(n), t + i * 0.04, 0.3, 0.05)) },
  reflect: { gap: 0.06, play: (d, t) => { tone(d, 'square', 1700, t, 0.07, 0.04, { glideTo: 2400, lowpass: 5000 }); noise(d, t, 0.04, 0.05, 'highpass', 5000); } },
  heal:    { gap: 0.1,  play: (d, t) => ['C6', 'E6', 'G6'].forEach((n, i) => tone(d, 'sine', freq(n), t + i * 0.05, 0.14, 0.05)) },
  summon:  { gap: 0.3,  play: (d, t) => { tone(d, 'sine', 220, t, 0.6, 0.06, { glideTo: 880, attack: 0.1 }); noise(d, t + 0.1, 0.4, 0.04, 'bandpass', 2500); } },
  roar:    { gap: 0.4,  play: (d, t) => { tone(d, 'sawtooth', 110, t, 0.7, 0.09, { glideTo: 55, lowpass: 700, attack: 0.05 }); noise(d, t, 0.6, 0.12, 'lowpass', 500); } },
  rage:    { gap: 1,    play: (d, t) => { tone(d, 'sawtooth', 70, t, 1.2, 0.12, { glideTo: 40, lowpass: 600, attack: 0.08 }); noise(d, t, 1.0, 0.16, 'lowpass', 400); tone(d, 'square', 180, t + 0.2, 0.8, 0.04, { glideTo: 90, lowpass: 900 }); } },
  playerDown: { gap: 0.5, play: (d, t) => ['A4', 'F4', 'D4', 'A3'].forEach((n, i) => tone(d, 'square', freq(n), t + i * 0.12, 0.16, 0.05, { lowpass: 2400 })) }
};
const lastPlayed = {};
function playEffect(kind, t) {
  const fx = SFX[kind];
  if (!fx || !sfxEnabled) return;
  if (t - (lastPlayed[kind] ?? -1) < fx.gap) return;
  lastPlayed[kind] = t;
  fx.play(sfxBus, t);
}

// ---------- secuenciador ----------
const LOOKAHEAD = 0.12;

function stepDuration(song, lvl) {
  const bpm = song.bpm * (lvl >= 2 && song.fasterAtLevel2 ? song.fasterAtLevel2 : 1);
  return 60 / bpm / 4;
}

function trackSteps(song, tr) {
  return tr.ref ? song.tracks.find(x => x.inst === tr.ref && !x.ref).steps : tr.steps;
}

function scheduleStep(cur, t, sd) {
  const { song, step } = cur;
  for (const tr of song.tracks) {
    if ((tr.level || 0) > cur.level) continue;
    const steps = trackSteps(song, tr);
    const i = step % steps.length;
    const tok = steps[i];
    if (tok === '.' || tok === '-') continue;
    let len = 1;
    while (steps[(i + len) % steps.length] === '-' && len < steps.length) len++;
    for (const name of tok.split('+')) {
      const f = freq(name);
      if (f) INSTRUMENTS[tr.inst](cur.gain, f * Math.pow(2, (tr.transpose || 0) / 12), t, len * sd);
    }
  }
  const drums = song.drums[Math.min(cur.level, song.drums.length - 1)];
  const s16 = step % 16;
  for (const kind of ['kick', 'snare', 'hat']) if (drums[kind][s16] === 'x') drum(kind, cur.gain, t);
}

function tick() {
  if (!ctx || !current) return;
  // pestaña en segundo plano (temporizadores frenados): no tocar de golpe las notas atrasadas
  if (current.nextTime < ctx.currentTime - 0.2) current.nextTime = ctx.currentTime + 0.05;
  while (current.nextTime < ctx.currentTime + LOOKAHEAD) {
    const sd = stepDuration(current.song, current.level);
    scheduleStep(current, current.nextTime, sd);
    current.nextTime += sd;
    current.step++;
  }
}

function startSong(name) {
  const song = SONGS[name];
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.8);   // entra con fundido
  gain.connect(musicBus);
  current = { name, song, gain, step: 0, nextTime: ctx.currentTime + 0.05, level: name === 'battle' ? level : 0 };
  if (!timer) timer = setInterval(tick, 25);
}

function stopCurrent(fade = 0.6) {
  if (!current) return;
  const g = current.gain;
  g.gain.cancelScheduledValues(ctx.currentTime);
  g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fade);
  setTimeout(() => g.disconnect(), (fade + 0.3) * 1000);
  current = null;
}

function sync() {
  if (!ctx || ctx.state !== 'running') return;
  if (current?.name === wanted) return;
  stopCurrent();
  if (wanted) startSong(wanted);
}

// ---------- API ----------
// Llamar una vez: la música arranca con la primera interacción del usuario
export function initMusic() {
  const unlock = () => {
    if (!ensureContext()) return;
    ctx.resume().then(sync);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

// 'menu' | 'battle' | 'boss' | null (silencio)
export function playSong(name) {
  wanted = name;
  sync();
}

// Intensidad de la batalla según la partida: ronda, si hay Tigre, si es el jefe
export function setBattleState({ round = 1, tigre = false, boss = false } = {}) {
  level = round >= 10 || tigre ? 2 : round >= 5 ? 1 : 0;
  if (boss) { if (wanted === 'battle') playSong('boss'); return; }
  if (wanted === 'boss') playSong('battle');
  if (current?.name === 'battle') current.level = level;
}

// Cuenta atrás: 'count' (3, 2, 1) o 'go' (PELIEN)
export function sfx(kind) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.01;
  if (kind === 'count') tone(sfxBus, 'square', freq('A4'), t, 0.14, 0.08);
  else if (kind === 'go') {
    for (const n of ['A4', 'C#5', 'E5', 'A5']) tone(sfxBus, 'square', freq(n), t, 0.5, 0.05, { vibrato: true });
    drum('kick', sfxBus, t);
  } else playEffect(kind, t);
}

// Victoria o derrota: para la música de batalla y toca la melodía corta
export function jingle(kind) {
  wanted = null;
  if (!ctx || ctx.state !== 'running') return;
  stopCurrent(0.3);
  const j = JINGLES[kind];
  if (!j) return;
  const sd = 60 / j.bpm / 4, t0 = ctx.currentTime + 0.35;
  for (const [inst, steps] of [['lead', j.lead], ['bass', j.bass]]) {
    steps.forEach((tok, i) => {
      if (tok === '.' || tok === '-') return;
      let len = 1;
      while (steps[i + len] === '-') len++;
      INSTRUMENTS[inst](musicBus, freq(tok), t0 + i * sd, len * sd);
    });
  }
}

// Pausa: la música baja de volumen
export function setDucked(on) { ducked = !!on; applyVolume(); }

export function setVolume(v) { volume = Math.max(0, Math.min(1, v)); saveNumber('salvandoOtare.volume', volume); applyVolume(); }
export function getVolume() { return volume; }
export function setMusicEnabled(on) { enabled = !!on; saveNumber('salvandoOtare.musicOn', enabled ? 1 : 0); applyVolume(); }
export function isMusicEnabled() { return enabled; }
export function setSfxEnabled(on) { sfxEnabled = !!on; saveNumber('salvandoOtare.sfxOn', sfxEnabled ? 1 : 0); applyVolume(); }
export function isSfxEnabled() { return sfxEnabled; }

// Diagnóstico (consola): qué suena, intensidad y nivel de la señal (0 = silencio)
export function musicStatus() {
  let rms = 0;
  if (analyser) {
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
  }
  return { audio: ctx ? ctx.state : 'sin iniciar', wanted, playing: current?.name || null, level: current?.level ?? level, rms: +rms.toFixed(4) };
}

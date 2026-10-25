// controles.js - preferencias de control (Ajustes) y quién maneja a cada personaje en la partida.
//
//   Dispositivo PC:    2 jugadores con teclado, o uno solo (a elegir) y el otro lo maneja la IA.
//   Dispositivo Móvil: siempre un solo personaje (a elegir) con botones táctiles; el otro, la IA.
// La IA compañera es la original; si eres admin y tienes una IA entrenada guardada, se usa esa.
// La primera vez se detecta si es un móvil (pantalla táctil sin ratón).

const KEY = 'salvandoOtare.controls';
const DEFAULTS = {
  device: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 'mobile' : 'pc',
  pcPlayers: 'both',        // 'both' | 'lanzziano' | 'jhoabxi'
  mobileChar: 'lanzziano'   // 'lanzziano' | 'jhoabxi'
};

export function getControlPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; }
}

export function setControlPref(name, value) {
  const prefs = { ...getControlPrefs(), [name]: value };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {}
  return prefs;
}

// Para game.start(): cómo se controla cada jugador [Lanzziano, Jhoabxi]
//   'keys'  sus teclas de siempre (2 jugadores en el mismo teclado)
//   'solo'  cualquiera de las dos distribuciones de teclas (jugando solo)
//   'touch' botones en pantalla
//   'ai'    la IA compañera
export function controlModes(prefs = getControlPrefs()) {
  if (prefs.device === 'mobile') return prefs.mobileChar === 'jhoabxi' ? ['ai', 'touch'] : ['touch', 'ai'];
  if (prefs.pcPlayers === 'lanzziano') return ['solo', 'ai'];
  if (prefs.pcPlayers === 'jhoabxi') return ['ai', 'solo'];
  return ['keys', 'keys'];
}

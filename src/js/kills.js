// kills.js - progreso local del jugador, guardado en localStorage (persiste entre partidas):
// kills por personaje y la ronda más alta alcanzada. Con cuenta iniciada, cloud.js lo sincroniza
// con Supabase: cada cambio avisa con el evento 'progressChanged'.
const STORAGE_KEY = 'salvandoOtare.kills';
const BEST_ROUND_KEY = 'salvandoOtare.bestRound';
export const PLAYERS = ['Lanzziano', 'Jhoabxi'];

function changed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('progressChanged'));
}

export function getKills() {
  const kills = Object.fromEntries(PLAYERS.map(name => [name, 0]));
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const name of PLAYERS) if (Number.isFinite(saved[name])) kills[name] = saved[name];
  } catch (e) { /* almacenamiento bloqueado o corrupto: empezar en 0 */ }
  return kills;
}

export function addKill(playerName) {
  const kills = getKills();
  kills[playerName] = (kills[playerName] || 0) + 1;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(kills)); } catch (e) {}
  changed();
}

// Sustituir las kills (al sincronizar con la cuenta); no avisa de cambio
export function replaceKills(kills) {
  const clean = Object.fromEntries(PLAYERS.map(name => [name, Math.max(0, Math.floor(Number(kills?.[name]) || 0))]));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(clean)); } catch (e) {}
}

export function getBestRound() {
  try { return Math.max(0, Math.floor(Number(localStorage.getItem(BEST_ROUND_KEY)) || 0)); } catch (e) { return 0; }
}

// Al terminar una partida de verdad (no simulación): guardar si es la ronda más alta
export function recordRound(round) {
  if (round <= getBestRound()) return;
  try { localStorage.setItem(BEST_ROUND_KEY, String(round)); } catch (e) {}
  changed();
}

export function replaceBestRound(round) {
  try { localStorage.setItem(BEST_ROUND_KEY, String(Math.max(0, Math.floor(Number(round) || 0)))); } catch (e) {}
}

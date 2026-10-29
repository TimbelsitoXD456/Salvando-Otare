// misiones.js - MISIONES (rescatadas del primer Salvando Otare): objetivos a largo plazo que dan CapoCoins.
// El progreso sale de lo que ya guarda el juego (kills.js y la tienda). Reclamar la recompensa requiere
// cuenta: lo valida Supabase (supabase/misiones.sql, que tiene esta MISMA lista; si cambias una, cambia
// las dos) y cada misión solo se puede reclamar una vez.
import { getKills, getBestRound, getBestSurvival, getWins } from './kills.js';
import { getItems, ITEMS } from './tienda.js';

// kind: qué se mide · goal: cuánto hace falta · reward: CapoCoins
export const MISSIONS = [
  { id: 'ronda15',   name: 'Principiante Honrado',       desc: 'Llega a la ronda 15 en adelante.',               kind: 'round',     goal: 15,   reward: 100 },
  { id: 'lanz40',    name: 'Boxeador',                   desc: 'Mata 40 enemigos con Lanzziano.',                kind: 'lanzziano', goal: 40,   reward: 120 },
  { id: 'lanz260',   name: 'Mike Lanzz-Tyson',           desc: 'Mata 260 enemigos con Lanzziano.',               kind: 'lanzziano', goal: 260,  reward: 500 },
  { id: 'lanz1000',  name: 'El Exterminador Sagrado',    desc: 'Mata 1000 enemigos con Lanzziano.',              kind: 'lanzziano', goal: 1000, reward: 1399 },
  { id: 'lanz2000',  name: 'Leyenda de Otare',           desc: 'Mata 2000 enemigos con Lanzziano.',              kind: 'lanzziano', goal: 2000, reward: 2345 },
  { id: 'jhoab40',   name: 'Tirador',                    desc: 'Mata 40 enemigos con Jhoabxi.',                  kind: 'jhoabxi',   goal: 40,   reward: 100 },
  { id: 'jhoab260',  name: 'Tiro Fijo-xi',               desc: 'Mata 260 enemigos con Jhoabxi.',                 kind: 'jhoabxi',   goal: 260,  reward: 400 },
  { id: 'jhoab1000', name: 'Maestro de la Puntería',     desc: 'Mata 1000 enemigos con Jhoabxi.',                kind: 'jhoabxi',   goal: 1000, reward: 1399 },
  { id: 'jhoab2000', name: 'Balas Eternas',              desc: 'Mata 2000 enemigos con Jhoabxi.',                kind: 'jhoabxi',   goal: 2000, reward: 2345 },
  { id: 'guille260',  name: 'Corto Circuito',           desc: 'Mata 260 enemigos con Guille.',                  kind: 'guille',    goal: 260,  reward: 450 },
  { id: 'guille1000', name: 'Tormenta en la Sala',      desc: 'Mata 1000 enemigos con Guille.',                 kind: 'guille',    goal: 1000, reward: 1200 },
  { id: 'guille2000', name: 'Leyenda Voltica',          desc: 'Mata 2000 enemigos con Guille.',                 kind: 'guille',    goal: 2000, reward: 2500 },
  { id: 'ganador',   name: 'GANADOR!!!',                 desc: 'Completa en modo normal y vence al jefe final.', kind: 'wins',      goal: 1,    reward: 600 },
  { id: 'superv21',  name: 'Ganador Otra Vez?',          desc: 'Llega a la ronda 21 en el modo supervivencia.',  kind: 'survival',  goal: 21,   reward: 601 },
  { id: 'superv60',  name: 'CUANDO ACABA!?',             desc: 'Llega a la ronda 60 en el modo supervivencia.',  kind: 'survival',  goal: 60,   reward: 1050 },
  { id: 'superv100', name: 'Como Llegamos hasta aqui?!', desc: 'Llega a la ronda 100 en el modo supervivencia.', kind: 'survival',  goal: 100,  reward: 1500 },
  { id: 'comprador', name: 'Comprador',                  desc: 'Compra un objeto en la tienda.',                 kind: 'items',     goal: 1,    reward: 300 },
  { id: 'acurar',    name: 'A Curar',                    desc: 'Compra a BonkChanti.',                           kind: 'bonkchanti', goal: 1,   reward: 490 },
  { id: 'hacefrio',  name: 'Hace Frio en la Cima',       desc: 'Compra a Otarin.',                               kind: 'otarin',     goal: 1,   reward: 700 },
  { id: 'meteorito', name: 'A Oliver le Callo un Meteorito', desc: 'Compra a Guille.',                         kind: 'guillebuy',  goal: 1,   reward: 1111 },
  { id: 'jojo',      name: "JOJO's REFERENCE!",          desc: 'Compra a Nico.',                                 kind: 'nicobuy',    goal: 1,   reward: 1456 },
  { id: 'loteria',   name: 'LOTERIA',                    desc: 'Compra TODA LA TIENDA.',                         kind: 'items',     goal: Object.keys(ITEMS).length, reward: 2000 }
];

const CLAIMED_KEY = 'salvandoOtare.missions';   // copia de las reclamadas en la cuenta: { id: true }

function current(kind) {
  switch (kind) {
    case 'round': return getBestRound();
    case 'lanzziano': return getKills().Lanzziano || 0;
    case 'jhoabxi': return getKills().Jhoabxi || 0;
    case 'guille': return getKills().Guille || 0;
    case 'wins': return getWins();
    case 'survival': return getBestSurvival();
    case 'items': return Object.keys(getItems()).length;
    case 'bonkchanti': return 'bonkchanti' in getItems() ? 1 : 0;
    case 'otarin': return 'otarin' in getItems() ? 1 : 0;
    case 'guillebuy': return 'guille' in getItems() ? 1 : 0;
    case 'nicobuy': return 'nico' in getItems() ? 1 : 0;
    default: return 0;
  }
}

export function getClaimed() {
  try { const c = JSON.parse(localStorage.getItem(CLAIMED_KEY) || '{}'); return c && typeof c === 'object' ? c : {}; }
  catch (e) { return {}; }
}
// cloud.js: lo que dice la cuenta (null = cerrar sesión)
export function setClaimed(claimed) {
  try { localStorage.setItem(CLAIMED_KEY, JSON.stringify(claimed && typeof claimed === 'object' ? claimed : {})); } catch (e) {}
}

// Estado de cada misión: { ...misión, value, done, claimed }
export function missionStates() {
  const claimed = getClaimed();
  return MISSIONS.map(m => {
    const value = current(m.kind);
    return { ...m, value: Math.min(value, m.goal), done: value >= m.goal, claimed: !!claimed[m.id] };
  });
}

// Cuántas están cumplidas y sin reclamar (aviso en el botón del menú)
export const readyCount = () => missionStates().filter(m => m.done && !m.claimed).length;

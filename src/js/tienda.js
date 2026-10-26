// tienda.js - CapoCoins y objetos de la TIENDA (datos y monedero local; la pantalla está en tiendaUI.js).
//
// - Se gana 1 CapoCoin por enemigo, 2 por Tigre/Fuerte y 100 por el jefe (solo partidas de verdad).
// - Las monedas ganadas quedan "pendientes" en el navegador hasta que cloud.js las sube a la cuenta
//   (al terminar la partida). Sin cuenta se acumulan y se suman a la cuenta al iniciar sesión.
// - Con cuenta, el saldo y los objetos los manda Supabase (supabase/tienda.sql); aquí se guarda una copia.
// - Los objetos son permanentes, para los dos jugadores, y se pueden activar o desactivar.
// No usa window/document al importarse: game.js lo importa también dentro de los Web Workers.

export const ITEMS = {
  speed:    { name: 'X2 Velocidad', price: 200, desc: 'Los dos corren el doble de rápido.' },
  strength: { name: 'X2 Fuerza',    price: 300, desc: 'Puños y balas hacen el doble de daño.' },
  health:   { name: 'X2 Vida',      price: 500, desc: 'Los dos empiezan con el doble de vida.' },
  armor:    { name: 'Armadura',     price: 800, desc: 'Los golpes y disparos enemigos hacen un 25 % menos de daño.' },
  coinsx2:  { name: 'X2 Monedas',   price: 675, desc: 'Ganas el doble de CapoCoins por cada enemigo.' },
  // ayudante (del primer Salvando Otare): vuela junto al jugador más herido y le lanza corazones (game.js)
  bonkchanti: { name: 'BonkChanti', price: 1250, desc: 'Ayudante: vuela junto al más herido y le lanza corazones que curan.' },
  otarin:   { name: 'Otarin',       price: 1850, desc: 'Ayudante: cubito de hielo que congela a los enemigos más peligrosos.' }
};

// Opciones del selector "Objetos" de Predicción y Entrenamiento (simular con objetos de la tienda)
// 'mine' = los objetos que el jugador (el admin) tiene comprados y activos ahora mismo
export const BOOST_OPTIONS = {
  mine:     { label: 'Mis objetos', boosts: null },
  none:     { label: 'Ninguno',   boosts: {} },
  speed:    { label: 'Velocidad', boosts: { speed: true } },
  strength: { label: 'Fuerza',    boosts: { strength: true } },
  health:   { label: 'Vida',      boosts: { health: true } },
  armor:    { label: 'Armadura',  boosts: { armor: true } },
  bonk:     { label: 'BonkChanti', boosts: { bonkchanti: true } },
  otarin:   { label: 'Otarin',    boosts: { otarin: true } },
  all:      { label: 'Todos',     boosts: { speed: true, strength: true, health: true, armor: true, coinsx2: true, bonkchanti: true, otarin: true } }
};
// Texto de una opción: 'Mis objetos (VEL, FUE, VIDA, BONK)'
const SHORT = { speed: 'VEL', strength: 'FUE', health: 'VIDA', armor: 'ARM', coinsx2: 'x2$', bonkchanti: 'BONK', otarin: 'OTA' };
export function boostLabel(key) {
  if (key !== 'mine') return (BOOST_OPTIONS[key] || BOOST_OPTIONS.none).label;
  const on = Object.entries(getActiveBoosts()).filter(([, v]) => v).map(([k]) => SHORT[k] || k);
  return `Mis objetos (${on.length ? on.join(', ') : 'ninguno activo'})`;
}
export const boostsFor = key => key === 'mine' ? getActiveBoosts() : ({ ...(BOOST_OPTIONS[key] || BOOST_OPTIONS.none).boosts });

export function coinValue(kind) {
  if (kind === 'boss') return 100;
  if (kind === 'tigre' || kind === 'fuerte') return 2;
  return 1;
}

const WALLET_KEY = 'salvandoOtare.wallet';        // copia del saldo y objetos de la cuenta
const PENDING_KEY = 'salvandoOtare.pendingCoins'; // ganadas y aún no subidas a la cuenta

let wallet = null;   // { coins, items: { speed: true, ... } }
let pending = null;

function load() {
  if (wallet) return;
  try {
    const w = JSON.parse(localStorage.getItem(WALLET_KEY) || 'null');
    wallet = { coins: Math.max(0, Math.floor(Number(w?.coins) || 0)), items: (w && typeof w.items === 'object' && w.items) || {} };
    pending = Math.max(0, Math.floor(Number(localStorage.getItem(PENDING_KEY)) || 0));
  } catch (e) {
    wallet = { coins: 0, items: {} };
    pending = 0;
  }
}
function save() {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
    localStorage.setItem(PENDING_KEY, String(pending));
  } catch (e) {}
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('coinsChanged'));
}

// Saldo que ve el jugador: el de la cuenta + lo ganado aún sin subir
export function getCoins() { load(); return wallet.coins + pending; }
export function getItems() { load(); return { ...wallet.items }; }
export function getPending() { load(); return pending; }

// Objetos comprados y activados → efectos para la partida
export function getActiveBoosts() {
  load();
  return { speed: wallet.items.speed === true, strength: wallet.items.strength === true, health: wallet.items.health === true,
    armor: wallet.items.armor === true, coinsx2: wallet.items.coinsx2 === true,
    bonkchanti: wallet.items.bonkchanti === true, otarin: wallet.items.otarin === true };
}

export function earnCoins(n) {
  load();
  pending += n;
  save();
}

// cloud.js: ya se subieron `n` monedas pendientes
export function clearPending(n = Infinity) {
  load();
  pending = Math.max(0, pending - n);
  save();
}

// cloud.js: copia de lo que dice la cuenta (saldo y/o objetos)
export function setWallet({ coins, items } = {}) {
  load();
  if (Number.isFinite(coins)) wallet.coins = Math.max(0, Math.floor(coins));
  if (items && typeof items === 'object') wallet.items = { ...items };
  save();
}

// Cerrar sesión: el navegador vuelve a ser de invitado, sin saldo ni objetos
export function resetWallet() {
  load();
  wallet = { coins: 0, items: {} };
  pending = 0;
  save();
}

// cloud.js - cuentas y progreso en la nube con Supabase (Auth + tabla progress).
//
// - Registro con correo + contraseña + usuario (correo y usuario únicos; ver supabase/schema.sql).
//   Las contraseñas las guarda Supabase Auth cifradas; el juego nunca las almacena.
// - Progreso: kills, mejor ronda e IA entrenada. Se guarda siempre en el navegador (localStorage) y,
//   con sesión iniciada, se sube a la fila del jugador (cada uno solo puede leer/escribir la suya: RLS).
// - Admin: la cuenta con app_metadata.role = 'admin' (supabase/admin.sql) ve SIMULACIONES.
// - Sin conexión con Supabase (sin internet, file://...), el juego funciona igual en modo invitado.
import { getKills, replaceKills, getBestRound, replaceBestRound, PLAYERS,
  getBestSurvival, replaceBestSurvival, getWins, replaceWins } from './kills.js';
import { setClaimed } from './misiones.js';
import { getTrained, replaceTrained } from './iaEntrenada.js';
import { getPending, clearPending, setWallet, resetWallet } from './tienda.js';

// La clave "anon" es pública por diseño: solo permite lo que dejan las reglas RLS.
// (La clave service_role NUNCA va aquí.)
const SUPABASE_URL = 'https://loxboeyxiudrxibebazy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxveGJvZXl4aXVkcnhpYmViYXp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNjkxNjksImV4cCI6MjEwNDc0NTE2OX0.eX6RswbQmbPtKgsuyujhtZB0KbEuRyqTtYKHWI4vwK8';
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const OWNER_KEY = 'salvandoOtare.owner'; // de qué cuenta es el progreso guardado en este navegador
const PUSH_DELAY = 1500;
const BASE_COLS = 'kills, best_round, trained_ai, capocoins, items';
const MISSION_COLS = 'best_survival, wins, missions';   // columnas de supabase/misiones.sql
let missionCols = true;   // false si el servidor aún no tiene esas columnas
// error de Supabase por una columna que no existe
const missingColumn = error => /column|best_survival|wins|missions/i.test(error?.message || '') && /exist|find|schema/i.test(error?.message || '');

let sb = null;
let session = null;
let profile = null;            // { username, email }
let status = 'loading';        // 'loading' | 'offline' | 'ready'
let syncState = 'idle';        // 'idle' | 'syncing' | 'synced' | 'error'
let recovering = false;        // llegó desde el enlace de "olvidé mi contraseña"
let pushTimer = null;
const listeners = new Set();

const notify = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
const getOwner = () => { try { return localStorage.getItem(OWNER_KEY); } catch (e) { return null; } };
const setOwner = id => { try { id ? localStorage.setItem(OWNER_KEY, id) : localStorage.removeItem(OWNER_KEY); } catch (e) {} };

// ---------- estado para la interfaz ----------
export function onCloudChange(fn) { listeners.add(fn); fn(); return () => listeners.delete(fn); }
export const cloudStatus = () => status;
export const syncStatus = () => syncState;
export const isRecovering = () => recovering;
export const isAdmin = () => session?.user?.app_metadata?.role === 'admin';
export function currentUser() {
  if (!session) return null;
  return { email: session.user.email, username: profile?.username || session.user.user_metadata?.username || '' };
}

// ---------- arranque ----------
export async function initCloud() {
  try {
    const { createClient } = await import(SUPABASE_JS);
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } catch (err) {
    console.warn('Sin conexión con el servidor de cuentas: modo invitado.', err);
    status = 'offline';
    notify();
    return;
  }
  // (las llamadas a Supabase dentro del callback se aplazan: llamarlas ahí mismo puede bloquear la sesión)
  sb.auth.onAuthStateChange((event, s) => setTimeout(() => applySession(s, event), 0));
  const { data } = await sb.auth.getSession();
  status = 'ready';
  await applySession(data.session, 'INITIAL_SESSION');
  window.addEventListener('progressChanged', schedulePush);
  window.addEventListener('online', () => { schedulePush(); flushCoins(); });
  window.addEventListener('runFinished', () => flushCoins());   // fin de partida: subir CapoCoins
}

async function applySession(s, event) {
  if (event === 'PASSWORD_RECOVERY') recovering = true;
  const prevId = session?.user?.id || null;
  session = s || null;
  const id = session?.user?.id || null;
  if (id && id !== prevId) {
    await loadProfile();
    await syncOnLogin();
  } else if (!id && prevId) {
    profile = null;
    resetLocalForGuest();
  }
  notify();
}

async function loadProfile() {
  const { data, error } = await sb.from('profiles').select('username, email').eq('id', session.user.id).maybeSingle();
  if (!error && data) profile = data;
}

// ---------- sincronización ----------
// Al entrar, se junta lo de este navegador con lo de la cuenta:
//  - progreso de invitado (sin dueño): se SUMA a la cuenta (no se pierde lo jugado sin cuenta)
//  - progreso de esta misma cuenta: el máximo de cada valor (puede haber partidas jugadas sin internet)
//  - progreso de OTRA cuenta (otra persona en este PC): se descarta y se usa el de la cuenta
async function syncOnLogin() {
  const uid = session.user.id;
  syncState = 'syncing'; notify();
  let { data: row, error } = await sb.from('progress').select(`${BASE_COLS}, ${MISSION_COLS}`).eq('user_id', uid).maybeSingle();
  if (error && missingColumn(error)) {
    // supabase/misiones.sql aún sin ejecutar: seguir con lo de antes (sin misiones ni supervivencia)
    missionCols = false;
    ({ data: row, error } = await sb.from('progress').select(BASE_COLS).eq('user_id', uid).maybeSingle());
  }
  if (error) { console.warn('No se pudo leer el progreso:', error); syncState = 'error'; return; }
  const owner = getOwner();
  const cloudKills = row?.kills || {};
  const localKills = getKills();
  const mine = owner === uid, guest = !owner;
  const kills = {};
  for (const name of PLAYERS) {
    const c = Number(cloudKills[name]) || 0, l = Number(localKills[name]) || 0;
    kills[name] = guest ? c + l : mine ? Math.max(c, l) : c;
  }
  replaceKills(kills);
  replaceBestRound(guest || mine ? Math.max(row?.best_round || 0, getBestRound()) : (row?.best_round || 0));
  // supervivencia: el máximo; victorias: las de invitado se suman, las de esta cuenta el máximo
  replaceBestSurvival(guest || mine ? Math.max(row?.best_survival || 0, getBestSurvival()) : (row?.best_survival || 0));
  const cloudWins = row?.wins || 0;
  replaceWins(guest ? cloudWins + getWins() : mine ? Math.max(cloudWins, getWins()) : cloudWins);
  setClaimed(row?.missions || {});
  if (row?.trained_ai) replaceTrained(row.trained_ai);
  else if (!(guest || mine)) replaceTrained(null);
  // CapoCoins: el saldo y los objetos los manda la cuenta; las ganadas sin subir (de invitado o sin
  // internet) se suben ahora. Si eran de otra cuenta, se descartan.
  setWallet({ coins: row?.capocoins ?? 0, items: row?.items || {} });
  if (!(guest || mine)) clearPending();
  setOwner(uid);
  await push();
  await flushCoins();
}

// ---------- CapoCoins y tienda ----------
const MAX_COINS_PER_SEND = 3000;   // el mismo límite que pone supabase/tienda.sql
let flushing = false, retryTimer = null;

async function flushCoins() {
  if (!session || !sb || flushing) return;
  const amount = Math.min(getPending(), MAX_COINS_PER_SEND);
  if (amount <= 0) return;
  flushing = true;
  const { data, error } = await sb.rpc('add_capocoins', { amount });
  flushing = false;
  if (error) {
    // 'demasiado_pronto' = otro envío hace menos de 15 s; sin internet, etc.: se reintenta luego
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flushCoins, 16000);
    return;
  }
  clearPending(amount);
  setWallet({ coins: data });
  if (getPending() > 0) { clearTimeout(retryTimer); retryTimer = setTimeout(flushCoins, 16000); } // quedaban más de 3000
  notify();
}

function shopError(error) {
  const m = error?.message || '';
  if (m.includes('sin_saldo')) return 'No tienes suficientes CapoCoins.';
  if (m.includes('ya_comprado')) return 'Ya tienes ese objeto.';
  if (m.includes('no_comprado')) return 'Primero tienes que comprarlo.';
  if (m.includes('sin_sesion')) return 'Inicia sesión en CUENTA para comprar.';
  return friendly(error);
}

// Comprar: lo valida Supabase (precio, saldo, que no lo tengas ya). Devuelve { ok, message }
export async function buyItem(item) {
  if (!sb || !session) return { ok: false, message: 'Inicia sesión en CUENTA para comprar.' };
  await flushCoins();   // que cuenten las monedas recién ganadas
  const { data, error } = await sb.rpc('buy_item', { item });
  if (error) return { ok: false, message: shopError(error) };
  setWallet({ coins: data.capocoins, items: data.items });
  notify();
  return { ok: true, message: '¡Comprado y activado!' };
}

export async function setItemActive(item, active) {
  if (!sb || !session) return { ok: false, message: 'Inicia sesión en CUENTA.' };
  const { data, error } = await sb.rpc('set_item_active', { item, active });
  if (error) return { ok: false, message: shopError(error) };
  setWallet({ items: data });
  notify();
  return { ok: true, message: active ? 'Activado.' : 'Desactivado.' };
}

// ---------- MISIONES (supabase/misiones.sql) ----------
// Cobrar una misión cumplida: lo comprueba el servidor. Devuelve { ok, message }
export async function claimMission(id) {
  if (!sb || !session) return { ok: false, message: 'Inicia sesión en CUENTA para cobrar las misiones.' };
  clearTimeout(pushTimer);
  await push();   // que el servidor tenga las kills y rondas de ahora mismo
  const { data, error } = await sb.rpc('claim_mission', { mid: id });
  if (error) {
    const m = error.message || '';
    if (m.includes('ya_cobrada')) return { ok: false, message: 'Esa misión ya la cobraste.' };
    if (m.includes('no_cumplida')) return { ok: false, message: 'Todavía no está cumplida en tu cuenta.' };
    if (m.includes('claim_mission') || m.includes('mission_info')) return { ok: false, message: 'Las misiones aún no están activadas en el servidor.' };
    return { ok: false, message: shopError(error) };
  }
  setClaimed(data.missions);
  setWallet({ coins: data.capocoins });
  notify();
  return { ok: true, message: `¡+${data.reward} CapoCoins!` };
}

// ---------- GLOBAL RANKS (supabase/ranking.sql) ----------
// Mejores jugadores en kills de Lanzziano, kills de Jhoabxi y CapoCoins; también sin cuenta.
// Devuelve { ok, top: { lanzziano:[{pos,user,value}], jhoabxi:[...], coins:[...] }, me, message }
export async function fetchRanks(topN = 10) {
  if (status === 'loading') await new Promise(r => { const off = onCloudChange(() => { if (status !== 'loading') { off(); r(); } }); });
  if (!sb) return { ok: false, message: 'Sin conexión con el servidor. Revisa tu internet.' };
  await flushCoins();   // que cuenten las monedas recién ganadas
  const { data, error } = await sb.rpc('global_ranks', { top_n: topN });
  if (error) {
    if ((error.message || '').includes('global_ranks')) return { ok: false, message: 'El ranking aún no está activado en el servidor.' };
    return { ok: false, message: friendly(error) };
  }
  return { ok: true, top: data?.top || {}, me: data?.me || {} };
}

// Cerrar sesión: el navegador vuelve a ser de invitado, empezando de cero (lo de la cuenta queda en la nube)
function resetLocalForGuest() {
  replaceKills({});
  replaceBestRound(0);
  replaceTrained(null);
  replaceBestSurvival(0);
  replaceWins(0);
  setClaimed({});
  resetWallet();
  setOwner(null);
  syncState = 'idle';
}

function schedulePush() {
  if (!session) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, PUSH_DELAY);
}

async function push() {
  if (!session || !sb) return;
  syncState = 'syncing'; notify();
  const trained = getTrained();
  const data = {
    user_id: session.user.id,
    kills: getKills(),
    best_round: getBestRound(),
    trained_ai: trained ? { ...trained } : null,
    updated_at: new Date().toISOString()
  };
  if (missionCols) Object.assign(data, { best_survival: getBestSurvival(), wins: getWins() });
  let { error } = await sb.from('progress').upsert(data);
  if (error && missionCols && missingColumn(error)) {
    missionCols = false;   // supabase/misiones.sql aún sin ejecutar: guardar lo de siempre
    delete data.best_survival; delete data.wins;
    ({ error } = await sb.from('progress').upsert(data));
  }
  syncState = error ? 'error' : 'synced';
  if (error) console.warn('No se pudo guardar el progreso en la nube (se reintentará):', error);
  notify();
}

// ---------- cuentas ----------
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const redirectUrl = () => location.origin + location.pathname;

function friendly(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Confirma tu correo antes de entrar (revisa tu bandeja y el spam).';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ese correo ya tiene una cuenta.';
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos seguidos. Espera unos minutos.';
  if (m.includes('database error saving new user')) return 'Ese usuario o correo ya existe.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión con el servidor. Revisa tu internet.';
  return error?.message || 'Algo salió mal. Inténtalo de nuevo.';
}

// Devuelve { ok, message, needsConfirm }
export async function signUp(email, password, username) {
  if (!sb) return { ok: false, message: 'Sin conexión con el servidor de cuentas.' };
  if (!USERNAME_RE.test(username)) return { ok: false, message: 'El usuario debe tener 3-20 letras, números o _ (sin espacios).' };
  const { data: free, error: rpcError } = await sb.rpc('username_available', { name: username });
  if (rpcError) return { ok: false, message: friendly(rpcError) };
  if (!free) return { ok: false, message: 'Ese usuario ya existe. Prueba con otro.' };
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { username }, emailRedirectTo: redirectUrl() }
  });
  if (error) return { ok: false, message: friendly(error) };
  // con confirmación de correo activada, un correo ya registrado no da error: vuelve sin identidades
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { ok: false, message: 'Ese correo ya tiene una cuenta.' };
  }
  if (!data.session) return { ok: true, needsConfirm: true, message: 'Cuenta creada. Te enviamos un correo para confirmarla: ábrelo y vuelve aquí.' };
  return { ok: true, message: '¡Cuenta creada! Ya estás dentro.' };
}

export async function signIn(email, password) {
  if (!sb) return { ok: false, message: 'Sin conexión con el servidor de cuentas.' };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? { ok: false, message: friendly(error) } : { ok: true, message: '¡Hola de nuevo!' };
}

export async function signOut() {
  if (!sb) return;
  clearTimeout(pushTimer);
  await push();                       // subir lo último antes de salir
  await flushCoins();
  await sb.auth.signOut();
}

export async function sendPasswordReset(email) {
  if (!sb) return { ok: false, message: 'Sin conexión con el servidor de cuentas.' };
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  return error ? { ok: false, message: friendly(error) }
    : { ok: true, message: 'Si ese correo tiene cuenta, te llegará un enlace para cambiar la contraseña.' };
}

export async function updatePassword(password) {
  if (!sb) return { ok: false, message: 'Sin conexión con el servidor de cuentas.' };
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { ok: false, message: friendly(error) };
  recovering = false;
  notify();
  return { ok: true, message: 'Contraseña cambiada.' };
}

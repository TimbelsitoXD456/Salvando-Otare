// cloud.js - cuentas y progreso en la nube con Supabase (Auth + tabla progress).
//
// - Registro con correo + contraseña + usuario (correo y usuario únicos; ver supabase/schema.sql).
//   Las contraseñas las guarda Supabase Auth cifradas; el juego nunca las almacena.
// - Progreso: kills, mejor ronda e IA entrenada. Se guarda siempre en el navegador (localStorage) y,
//   con sesión iniciada, se sube a la fila del jugador (cada uno solo puede leer/escribir la suya: RLS).
// - Admin: la cuenta con app_metadata.role = 'admin' (supabase/admin.sql) ve SIMULACIONES.
// - Sin conexión con Supabase (sin internet, file://...), el juego funciona igual en modo invitado.
import { getKills, replaceKills, getBestRound, replaceBestRound, PLAYERS } from './kills.js';
import { getTrained, replaceTrained } from './iaEntrenada.js';

// La clave "anon" es pública por diseño: solo permite lo que dejan las reglas RLS.
// (La clave service_role NUNCA va aquí.)
const SUPABASE_URL = 'https://loxboeyxiudrxibebazy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxveGJvZXl4aXVkcnhpYmViYXp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNjkxNjksImV4cCI6MjEwNDc0NTE2OX0.eX6RswbQmbPtKgsuyujhtZB0KbEuRyqTtYKHWI4vwK8';
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const OWNER_KEY = 'salvandoOtare.owner'; // de qué cuenta es el progreso guardado en este navegador
const PUSH_DELAY = 1500;

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
  window.addEventListener('online', schedulePush);
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
  const { data: row, error } = await sb.from('progress').select('kills, best_round, trained_ai').eq('user_id', uid).maybeSingle();
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
  if (row?.trained_ai) replaceTrained(row.trained_ai);
  else if (!(guest || mine)) replaceTrained(null);
  setOwner(uid);
  await push();
}

// Cerrar sesión: el navegador vuelve a ser de invitado, empezando de cero (lo de la cuenta queda en la nube)
function resetLocalForGuest() {
  replaceKills({});
  replaceBestRound(0);
  replaceTrained(null);
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
  const { error } = await sb.from('progress').upsert({
    user_id: session.user.id,
    kills: getKills(),
    best_round: getBestRound(),
    trained_ai: trained ? { ...trained } : null,
    updated_at: new Date().toISOString()
  });
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

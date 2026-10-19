// cuenta.js - pantalla CUENTA (src/screens/cuenta.html): entrar, registrarse, recuperar contraseña,
// ver el progreso y cerrar sesión. La lógica de Supabase está en cloud.js.
import { cloudStatus, currentUser, isRecovering, syncStatus, signIn, signUp, signOut, sendPasswordReset, updatePassword } from './cloud.js';
import { getKills, getBestRound } from './kills.js';

let tab = 'login';
let busy = false;

const $ = (section, sel) => section.querySelector(sel);

function setMsg(section, text, kind = 'info') {
  const el = $(section, '.acct-msg');
  el.textContent = text || '';
  el.dataset.kind = kind;
}

// Llamado por menu.js con los botones de esta pantalla (data-action="acct-...")
export function handleAccountAction(action, btn, section) {
  if (busy) return;
  if (action === 'acct-tab') {
    tab = btn.dataset.tab;
    setMsg(section, '');
    refreshAccount(section);
  } else if (action === 'acct-logout') {
    run(section, async () => { await signOut(); return { ok: true, message: 'Sesión cerrada.' }; });
  } else if (action === 'acct-forgot') {
    const email = $(section, '.acct-login [name=email]').value.trim();
    if (!email) { setMsg(section, 'Escribe tu correo arriba y vuelve a pulsar "¿Olvidaste tu contraseña?".', 'error'); return; }
    run(section, () => sendPasswordReset(email));
  }
  // 'acct-submit' lo gestionan los formularios (evento submit)
}

async function run(section, fn) {
  busy = true;
  section.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
  setMsg(section, 'Un momento...');
  try {
    const r = await fn();
    setMsg(section, r.message, r.ok ? 'ok' : 'error');
    return r;
  } catch (err) {
    console.error(err);
    setMsg(section, 'Algo salió mal. Inténtalo de nuevo.', 'error');
    return { ok: false };
  } finally {
    busy = false;
    section.querySelectorAll('button, input').forEach(el => { el.disabled = false; });
    refreshAccount(section);
  }
}

function bindForms(section) {
  if (section.dataset.bound) return;
  section.dataset.bound = 'true';
  $(section, '.acct-login').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    run(section, () => signIn(f.email.value.trim(), f.password.value));
  });
  $(section, '.acct-register').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    if (f.password.value !== f.password2.value) { setMsg(section, 'Las contraseñas no coinciden.', 'error'); return; }
    run(section, async () => {
      const r = await signUp(f.email.value.trim(), f.password.value, f.username.value.trim());
      if (r.ok) f.reset();
      return r;
    });
  });
  $(section, '.acct-recovery').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    if (f.password.value !== f.password2.value) { setMsg(section, 'Las contraseñas no coinciden.', 'error'); return; }
    run(section, async () => {
      const r = await updatePassword(f.password.value);
      if (r.ok) f.reset();
      return r;
    });
  });
}

// Pinta la pantalla según el estado (sin conexión / invitado / con sesión / cambiando contraseña)
export function refreshAccount(section) {
  if (!section || !section.dataset.loaded) return;
  bindForms(section);
  const status = cloudStatus();
  const user = currentUser();
  const recovering = isRecovering() && user;

  $(section, '.acct-offline').hidden = status !== 'offline';
  $(section, '.acct-guest').hidden = status !== 'ready' || !!user;
  $(section, '.acct-user').hidden = !user || recovering;
  $(section, '.acct-recovery').hidden = !recovering;

  section.querySelectorAll('.acct-tab').forEach(b => b.classList.toggle('selected', b.dataset.tab === tab));
  $(section, '.acct-login').hidden = tab !== 'login';
  $(section, '.acct-register').hidden = tab !== 'register';

  if (user) {
    $(section, '.acct-name').textContent = user.username || user.email;
    $(section, '.acct-email').textContent = user.email;
    const kills = getKills();
    $(section, '.acct-kills-l').textContent = kills.Lanzziano;
    $(section, '.acct-kills-j').textContent = kills.Jhoabxi;
    $(section, '.acct-best').textContent = getBestRound();
    const sync = syncStatus();
    $(section, '.acct-sync').textContent =
      sync === 'syncing' ? 'Guardando en la nube...' :
      sync === 'synced' ? 'Progreso guardado en tu cuenta.' :
      sync === 'error' ? 'No se pudo guardar en la nube ahora; se reintentará.' : '';
  }
}

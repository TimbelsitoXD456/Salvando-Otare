// misionesUI.js - pantalla MISIONES (lista en misiones.js; el cobro lo valida Supabase vía cloud.js)
import { missionStates, readyCount } from './misiones.js';
import { currentUser, claimMission } from './cloud.js';

let busy = false;
const fmt = n => Number(n || 0).toLocaleString('es');

export async function handleMissionAction(action, btn, section) {
  if (busy || action !== 'mission-claim') return;
  busy = true;
  const msg = section.querySelector('.mis-msg');
  msg.textContent = 'Cobrando...'; msg.dataset.kind = 'info';
  refreshMissions(section);
  try {
    const r = await claimMission(btn.dataset.mission);
    msg.textContent = r.message; msg.dataset.kind = r.ok ? 'ok' : 'error';
  } finally {
    busy = false;
    refreshMissions(section);
  }
}

export function refreshMissions(section) {
  refreshMissionBadge();
  if (!section) return;
  const list = section.querySelector('.mis-list');
  if (!list) return;
  const logged = !!currentUser();
  const states = missionStates();
  const claimed = states.filter(m => m.claimed).length;
  section.querySelector('.mis-summary').textContent = `${claimed} / ${states.length} cobradas`;
  section.querySelector('.mis-guest').hidden = logged;
  // primero las listas para cobrar, luego las que faltan y al final las cobradas
  const order = m => (m.done && !m.claimed ? 0 : m.claimed ? 2 : 1);
  list.innerHTML = [...states].sort((a, b) => order(a) - order(b)).map(m => {
    const pct = Math.round((m.value / m.goal) * 100);
    const ready = m.done && !m.claimed;
    const button = m.claimed
      ? '<span class="mis-done" title="Cobrada">✓</span>'
      : `<button class="menu-btn mis-btn${ready ? ' primary' : ''}" data-action="mission-claim" data-mission="${m.id}"
           ${!ready || !logged || busy ? 'disabled' : ''} title="${ready ? 'Cobrar la recompensa' : 'Aún no está cumplida'}">
           ${ready ? 'COBRAR' : `${pct}%`}</button>`;
    return `
      <div class="mis-item${ready ? ' ready' : ''}${m.claimed ? ' claimed' : ''}">
        <div class="mis-info">
          <b class="mis-name">${m.name}</b>
          <span class="mis-desc">${m.desc}</span>
          <div class="mis-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <span class="mis-meta">${fmt(m.value)} / ${fmt(m.goal)} · <span class="coin-icon" aria-hidden="true"></span>${fmt(m.reward)}</span>
        </div>
        ${button}
      </div>`;
  }).join('');
}

// "MISIONES" en el menú avisa de las que se pueden cobrar
export function refreshMissionBadge() {
  const btn = document.querySelector('[data-action="missions"]');
  if (!btn) return;
  const n = readyCount();
  btn.textContent = n ? `MISIONES (${n})` : 'MISIONES';
  btn.classList.toggle('has-ready', n > 0);
}

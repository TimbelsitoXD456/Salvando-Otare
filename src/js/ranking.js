// ranking.js - pantalla GLOBAL RANKS: los mejores de todos los jugadores con cuenta (Supabase,
// supabase/ranking.sql). Tres tablas: más kills con Lanzziano, más kills con Jhoabxi y más CapoCoins.
import { fetchRanks, currentUser } from './cloud.js';

const TABS = {
  lanzziano: { title: 'MOST KILLS · LANZZIANO', unit: 'kills' },
  jhoabxi:   { title: 'MOST KILLS · JHOABXI',   unit: 'kills' },
  coins:     { title: 'MÁS CAPOCOINS',          unit: 'CapoCoins' }
};

let tab = 'lanzziano';
let data = null;      // última respuesta de fetchRanks
let loading = false;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('es');

// Al abrir la pantalla: pedir el ranking al servidor
export async function refreshRanks(section) {
  if (!section || loading) return;
  loading = true;
  data = null;
  render(section);
  data = await fetchRanks(10);
  loading = false;
  render(section);
}

export function handleRanksAction(action, btn, section) {
  if (action === 'rank-tab') { tab = btn.dataset.tab; render(section); }
  if (action === 'rank-reload') refreshRanks(section);
}

function render(section) {
  section.querySelectorAll('[data-action="rank-tab"]').forEach(b => b.classList.toggle('selected', b.dataset.tab === tab));
  const title = section.querySelector('.ranks-title');
  const body = section.querySelector('.ranks-body');
  const mine = section.querySelector('.ranks-me');
  title.textContent = TABS[tab].title;
  mine.textContent = '';
  if (!data) { body.innerHTML = '<p class="ranks-msg">Cargando ranking…</p>'; return; }
  if (!data.ok) { body.innerHTML = `<p class="ranks-msg ranks-error">${esc(data.message)}</p>`; return; }

  const rows = data.top[tab] || [];
  const me = currentUser()?.username?.toLowerCase();
  if (!rows.length) {
    body.innerHTML = '<p class="ranks-msg">Nadie todavía. ¡Sé el primero!</p>';
  } else {
    const coin = tab === 'coins' ? '<span class="coin-icon" aria-hidden="true"></span>' : '';
    body.innerHTML = `
      <table class="ranks-table">
        <thead><tr><th>#</th><th>Jugador</th><th>${TABS[tab].unit}</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr class="${r.pos <= 3 ? 'rank-top' + r.pos : ''} ${me && r.user.toLowerCase() === me ? 'rank-me' : ''}">
            <td>${r.pos === 1 ? '<span class="rank-crown" aria-label="primero">♛</span>' : r.pos}</td>
            <td>${esc(r.user)}</td>
            <td>${coin}${fmt(r.value)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }
  // tu posición, aunque no estés en el top 10
  const my = data.me?.[tab];
  if (!currentUser()) mine.textContent = 'Inicia sesión en CUENTA para aparecer en el ranking.';
  else if (my) mine.textContent = `Tu puesto: #${my.pos} con ${fmt(my.value)} ${TABS[tab].unit}`;
  else mine.textContent = 'Aún no tienes puntos en esta tabla.';
}

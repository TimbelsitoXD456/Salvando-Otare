// prediccion.js - modo predicción: N partidas de simulación IA sin dibujar (game.runHeadless) y sus medias.
// Las semillas son siempre 1..N, así dos ejecuciones antes y después de un cambio juegan las mismas partidas.
// Las partidas se reparten entre varios núcleos (simPool.js).
import { AI_MODE_LABELS } from './ai.js';
import { runGames } from './simPool.js';
import { getTrained } from './iaEntrenada.js';
import { boostsFor, boostLabel as describeBoosts } from './tienda.js';

const PLAYER_NAMES = ['Lanzziano', 'Jhoabxi'];
const DAMAGE_SOURCES = [['melle', 'Melle'], ['bala', 'Bala'], ['pinchos', 'Pinchos']];

let count = 20;
let useTrained = false;
let startRound = 1; // empezar en una ronda alta para medir enemigos que salen tarde (Tigre, Fuerte)
let boostKey = 'mine'; // objetos de la tienda con los que juega la IA (para medir cuánto ayudan)
let runningRun = false;
let cancelled = false;

// Llamado por menu.js con la acción de cada botón de esta pantalla
export function handlePredictionAction(action, btn, section) {
  if (runningRun) return;
  if (action === 'predict-count') {
    count = +btn.dataset.count || 20;
    section.querySelectorAll('.pred-opt').forEach(b => b.classList.toggle('selected', b === btn));
  } else if (action === 'predict-boost') {
    boostKey = btn.dataset.boost || 'none';
    section.querySelectorAll('.pred-boost-opt').forEach(b => b.classList.toggle('selected', b === btn));
  } else if (action === 'predict-start') {
    startRound = +btn.dataset.round || 1;
    section.querySelectorAll('.pred-start-opt').forEach(b => b.classList.toggle('selected', b === btn));
  } else if (action === 'predict-ai') {
    useTrained = btn.dataset.ai === 'trained';
    refreshPrediction(section);
  } else if (action === 'predict-run') {
    runPrediction(section);
  }
}

// Al mostrar la pantalla: "Entrenada" solo se puede elegir si hay una IA entrenada guardada
export function refreshPrediction(section) {
  const hasTrained = !!getTrained();
  if (!hasTrained) useTrained = false;
  section.querySelectorAll('.pred-ai-opt').forEach(b => {
    b.classList.toggle('selected', (b.dataset.ai === 'trained') === useTrained);
    if (b.dataset.ai === 'trained') {
      b.disabled = !hasTrained;
      b.title = hasTrained ? '' : 'Aún no hay IA entrenada (ve a Entrenamiento)';
    }
  });
}

// Al salir de la pantalla: la tanda en curso se para (las partidas a medias se descartan)
export function cancelPrediction() { if (runningRun) cancelled = true; }

async function runPrediction(section) {
  runningRun = true; cancelled = false;
  const n = count;
  const aiParams = useTrained ? getTrained()?.params ?? null : null;
  const progress = section.querySelector('.pred-progress');
  const fill = section.querySelector('.pred-bar-fill');
  const status = section.querySelector('.pred-status');
  const results = section.querySelector('.pred-results');
  const buttons = section.querySelectorAll('.pred-opt, .pred-ai-opt, .pred-start-opt, .pred-boost-opt, .pred-run');
  const from = startRound;
  const boostLabel = boostKey === 'none' ? '' : `, con objetos: ${describeBoosts(boostKey)}`;
  const boosts = boostsFor(boostKey);
  buttons.forEach(b => { b.disabled = true; });
  progress.hidden = false;
  results.innerHTML = '';
  fill.style.width = '0%';
  status.textContent = `0/${n} partidas`;

  let runs = [];
  const t0 = performance.now();
  try {
    const jobs = Array.from({ length: n }, (_, i) => ({ seed: i + 1, aiParams, startRound: from, boosts }));
    const { results: played } = await runGames(jobs, {
      isCancelled: () => cancelled,
      onProgress: (done, total) => {
        fill.style.width = `${100 * done / total}%`;
        status.textContent = `${done}/${total} partidas`;
      }
    });
    runs = played.filter(Boolean);
  } catch (err) {
    console.error('Error en la predicción:', err);
    status.textContent = 'Error: ' + err.message;
  }
  const realSecs = (performance.now() - t0) / 1000;
  fill.style.width = '100%';
  status.textContent = cancelled
    ? `Cancelado tras ${runs.length} partidas`
    : `${runs.length} partidas con IA ${aiParams ? 'entrenada' : 'original'}${from > 1 ? `, desde la ronda ${from}` : ''}${boostLabel}, en ${realSecs.toFixed(1)} s reales`;
  if (runs.length) results.innerHTML = renderResults(summarize(runs));
  buttons.forEach(b => { b.disabled = false; });
  refreshPrediction(section);
  runningRun = false;
}

export function summarize(runs) {
  const n = runs.length;
  const avg = f => runs.reduce((a, r) => a + f(r), 0) / n;
  const rounds = {};
  for (const r of runs) rounds[r.round] = (rounds[r.round] || 0) + 1;
  const damage = PLAYER_NAMES.map((_, i) => Object.fromEntries(DAMAGE_SOURCES.map(([k]) => [k, avg(r => r.damage[i][k])])));
  const modes = PLAYER_NAMES.map((_, i) => {
    const tot = {};
    for (const r of runs) for (const [m, f] of Object.entries(r.modeFrames[i])) tot[m] = (tot[m] || 0) + f;
    const all = Object.values(tot).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([m, f]) => [m, 100 * f / all]);
  });
  return {
    n,
    wins: runs.filter(r => r.result === 'victory').length,
    timeouts: runs.filter(r => r.result === 'timeout').length,
    avgRound: avg(r => r.round),
    avgProgress: avg(r => r.progress),
    avgSeconds: avg(r => r.seconds),
    rounds,
    kills: PLAYER_NAMES.map((_, i) => avg(r => r.kills[i])),
    healed: PLAYER_NAMES.map((_, i) => avg(r => r.healed?.[i] || 0)),
    food: ['spawned', 'eaten', 'expired'].reduce((o, k) => ({ ...o, [k]: avg(r => r.food?.[k] || 0) }), {}),
    damage,
    modes
  };
}

const fmt1 = x => x.toFixed(1);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const playerClass = i => (i === 0 ? 'pred-lanzziano' : 'pred-jhoabxi');

function renderResults(s) {
  const maxCount = Math.max(...Object.values(s.rounds));
  const roundRows = Object.keys(s.rounds).map(Number).sort((a, b) => a - b).map(r => `
    <div class="pred-hist-row">
      <span class="pred-hist-label">R${r}</span>
      <span class="pred-hist-bar"><span style="width:${100 * s.rounds[r] / maxCount}%"></span></span>
      <span class="pred-hist-count">${s.rounds[r]}</span>
    </div>`).join('');

  const dmgRows = PLAYER_NAMES.map((name, i) => {
    const d = s.damage[i];
    const total = DAMAGE_SOURCES.reduce((a, [k]) => a + d[k], 0);
    return `<tr><th class="${playerClass(i)}">${name}</th>${DAMAGE_SOURCES.map(([k]) => `<td>${Math.round(d[k])}</td>`).join('')}<td>${Math.round(total)}</td></tr>`;
  }).join('');

  const modeBlocks = PLAYER_NAMES.map((name, i) => `
    <div class="pred-modes">
      <h4 class="${playerClass(i)}">${name}</h4>
      ${s.modes[i].map(([m, pct]) => `
        <div class="pred-hist-row">
          <span class="pred-mode-label">${AI_MODE_LABELS[m] || m}</span>
          <span class="pred-hist-bar"><span style="width:${pct}%"></span></span>
          <span class="pred-hist-count">${Math.round(pct)}%</span>
        </div>`).join('')}
    </div>`).join('');

  return `
    <div class="pred-stats">
      <div class="pred-stat"><span>Ronda media</span><b>${fmt1(s.avgRound)}</b></div>
      <div class="pred-stat"><span>Duración media</span><b>${mmss(s.avgSeconds)}</b><small>${Math.round(s.avgSeconds)} s</small></div>
      <div class="pred-stat"><span>Victorias</span><b>${s.wins}/${s.n}</b>${s.timeouts ? `<small>${s.timeouts} sin terminar</small>` : ''}</div>
    </div>

    <h3>Ronda alcanzada</h3>
    <div class="pred-hist">${roundRows}</div>

    <h3>Kills medias</h3>
    <div class="pred-stats">
      ${PLAYER_NAMES.map((name, i) => `<div class="pred-stat"><span class="${playerClass(i)}">${name}</span><b>${fmt1(s.kills[i])}</b></div>`).join('')}
    </div>

    <h3>Daño recibido medio</h3>
    <table class="pred-table">
      <thead><tr><th></th>${DAMAGE_SOURCES.map(([, label]) => `<th>${label}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${dmgRows}</tbody>
    </table>

    <h3>Comida (media por partida)</h3>
    <div class="pred-stats">
      <div class="pred-stat"><span>Aparecidas</span><b>${fmt1(s.food.spawned)}</b></div>
      <div class="pred-stat"><span>Comidas</span><b>${fmt1(s.food.eaten)}</b></div>
      <div class="pred-stat"><span>Perdidas</span><b>${fmt1(s.food.expired)}</b></div>
    </div>
    <table class="pred-table">
      <tbody>${PLAYER_NAMES.map((name, i) => `<tr><th class="${playerClass(i)}">${name}</th><td>+${Math.round(s.healed[i])} HP curados</td></tr>`).join('')}</tbody>
    </table>

    <h3>Tiempo en cada modo</h3>
    ${modeBlocks}
  `;
}

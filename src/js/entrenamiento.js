// entrenamiento.js - modo Entrenamiento: optimiza los parámetros de la IA (AI_PARAM_SPACE en ai.js)
// con un algoritmo evolutivo sencillo, jugando partidas sin dibujar (simPool.js).
//
// Cada generación: el campeón actual + VARIANTS mutaciones suyas juegan las MISMAS GAMES_PER_VARIANT partidas
// (mismas semillas: la comparación es justa). El nuevo campeón es la media ponderada de los 3 mejores: con tanto
// azar por partida, fiarse solo del ganador premia a la variante con suerte. Las semillas cambian en cada
// generación, así lo que ganó por suerte vuelve a medirse con partidas nuevas.
// Al final se valida con las semillas 1..VALIDATION_GAMES (las de Predicción, que el entrenamiento no ha visto):
// IA original contra IA nueva, y se dice si la mejora es clara o puede ser ruido.
import { AI_PARAM_SPACE, DEFAULT_AI_PARAMS, normalizeAIParams } from './ai.js';
import { runGames, workerCount } from './simPool.js';
import { getTrained, saveTrained, clearTrained } from './iaEntrenada.js';
import { summarize } from './prediccion.js';
import { BOOST_OPTIONS, boostsFor, boostLabel } from './tienda.js';

const VARIANTS = 9;              // mutaciones por generación (+ el campeón = 10 candidatos)
const GAMES_PER_VARIANT = 40;
const RECOMBINE_WEIGHTS = [0.5, 0.3, 0.2]; // peso de los 3 mejores en el nuevo campeón
const VALIDATION_GAMES = 100;
const SECONDS_PER_GAME = 0.12;   // coste medio de una partida por núcleo (medido), para estimar el tiempo
const TRAIN_SEED_BASE = 100000;  // semillas de entrenamiento, lejos de las de validación/Predicción (1..100)
const MUTATE_PROB = 0.3;         // probabilidad de mutar cada parámetro (al menos uno siempre)
const SIGMA_START = 0.15;        // tamaño de la mutación, en fracción del rango del parámetro...
const SIGMA_END = 0.05;          // ...que se va afinando hasta este valor en la última generación

let generations = 20;
let boostKey = 'mine';   // objetos de la tienda con los que entrena (tienda.js BOOST_OPTIONS)
let running = false;
let cancelled = false;
let pending = null; // resultado del último entrenamiento, a la espera de Guardar / Descartar

// Llamado por menu.js con la acción de cada botón de esta pantalla
export function handleTrainingAction(action, btn, section) {
  if (running) return;
  if (action === 'train-gens') {
    generations = +btn.dataset.gens || 20;
    section.querySelectorAll('.train-opt').forEach(b => b.classList.toggle('selected', b === btn));
    refreshTraining(section);
  } else if (action === 'train-boost') {
    boostKey = btn.dataset.boost || 'none';
    section.querySelectorAll('.train-boost-opt').forEach(b => b.classList.toggle('selected', b === btn));
    refreshTraining(section);
  } else if (action === 'train-run') {
    train(section);
  } else if (action === 'train-save' && pending) {
    const prev = getTrained();
    saveTrained({
      params: pending.params,
      generations: (prev && pending.fromTrained ? prev.generations || 0 : 0) + pending.generations,
      boosts: pending.boostKey,   // con qué objetos se entrenó ('none' = juego base)
      validation: { original: pending.original.avgRound, trained: pending.trained.avgRound, games: VALIDATION_GAMES }
    });
    pending = null;
    section.querySelector('.train-decision').hidden = true;
    section.querySelector('.train-status').textContent = 'IA entrenada guardada: "Ver simulación" ya la usa.';
    refreshTraining(section);
  } else if (action === 'train-discard') {
    pending = null;
    section.querySelector('.train-decision').hidden = true;
    section.querySelector('.train-status').textContent = 'Descartada: se sigue usando la IA de antes.';
  } else if (action === 'train-reset') {
    clearTrained();
    section.querySelector('.pred-progress').hidden = false;
    section.querySelector('.train-status').textContent = 'Restablecida la IA original.';
    refreshTraining(section);
  }
}

// Al salir de la pantalla: el entrenamiento en curso se para y se descarta
export function cancelTraining() { if (running) cancelled = true; }

// Texto de punto de partida y estimación de tiempo
export function refreshTraining(section) {
  const trained = getTrained();
  const games = generations * (VARIANTS + 1) * GAMES_PER_VARIANT + 2 * VALIDATION_GAMES;
  const mins = Math.max(1, Math.round(games * SECONDS_PER_GAME / workerCount() / 60));
  const trainedWith = trained?.boosts && trained.boosts !== 'none' ? ` (entrenada con objetos: ${BOOST_OPTIONS[trained.boosts]?.label})` : '';
  const withBoosts = boostKey === 'none' ? 'sin objetos' : `con objetos: ${boostLabel(boostKey)}`;
  section.querySelector('.train-start').textContent =
    `Parte de: ${trained ? 'la IA entrenada guardada' + trainedWith : 'la IA original'} · entrena ${withBoosts} · ${games} partidas · ≈${mins} min (${workerCount()} núcleos)`;
  section.querySelector('.train-reset-row').hidden = !trained;
}

// ---------- algoritmo ----------
function gaussian() {
  const u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function mutate(params, sigma) {
  const keys = Object.keys(AI_PARAM_SPACE);
  const child = { ...params };
  let changed = 0;
  for (const k of keys) {
    if (Math.random() < MUTATE_PROB) { child[k] += gaussian() * sigma * (AI_PARAM_SPACE[k].max - AI_PARAM_SPACE[k].min); changed++; }
  }
  if (!changed) {
    const k = keys[Math.floor(Math.random() * keys.length)];
    child[k] += gaussian() * sigma * (AI_PARAM_SPACE[k].max - AI_PARAM_SPACE[k].min);
  }
  return normalizeAIParams(child);
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

// Media ponderada de varios juegos de parámetros (los mejores primero)
function recombine(paramsList, weights) {
  const total = weights.slice(0, paramsList.length).reduce((a, b) => a + b, 0);
  const out = {};
  for (const k of Object.keys(AI_PARAM_SPACE)) {
    out[k] = paramsList.reduce((sum, p, i) => sum + p[k] * weights[i], 0) / total;
  }
  return normalizeAIParams(out);
}

async function train(section) {
  running = true; cancelled = false; pending = null;
  const trained = getTrained();
  const fromTrained = !!trained;
  let champion = trained ? trained.params : { ...DEFAULT_AI_PARAMS };

  const $ = sel => section.querySelector(sel);
  const fill = $('.pred-bar-fill'), status = $('.train-status');
  const genList = $('.train-gens-list'), results = $('.train-results');
  const buttons = section.querySelectorAll('.train-opt, .train-boost-opt, .train-run, .train-reset');
  const usedBoostKey = boostKey, boosts = boostsFor(boostKey);
  buttons.forEach(b => { b.disabled = true; });
  $('.pred-progress').hidden = false;
  $('.train-decision').hidden = true;
  genList.innerHTML = ''; results.innerHTML = '';
  fill.style.width = '0%';

  const G = generations;
  const totalGames = G * (VARIANTS + 1) * GAMES_PER_VARIANT + 2 * VALIDATION_GAMES;
  let gamesDone = 0;
  const t0 = performance.now();
  const history = [];
  const setProgress = (label) => {
    fill.style.width = `${100 * gamesDone / totalGames}%`;
    const elapsed = (performance.now() - t0) / 1000;
    const eta = gamesDone ? elapsed / gamesDone * (totalGames - gamesDone) : 0;
    status.textContent = `${label} · quedan ≈${eta < 60 ? Math.ceil(eta) + ' s' : Math.ceil(eta / 60) + ' min'}`;
  };

  try {
    for (let g = 0; g < G && !cancelled; g++) {
      const sigma = SIGMA_START + (SIGMA_END - SIGMA_START) * (G > 1 ? g / (G - 1) : 1);
      const candidates = [champion, ...Array.from({ length: VARIANTS }, () => mutate(champion, sigma))];
      const seeds = Array.from({ length: GAMES_PER_VARIANT }, (_, i) => TRAIN_SEED_BASE + g * 1000 + i + 1);
      const jobs = candidates.flatMap(params => seeds.map(seed => ({ seed, aiParams: params, boosts })));
      const base = gamesDone;
      const { results: played, cancelled: wasCancelled } = await runGames(jobs, {
        isCancelled: () => cancelled,
        onProgress: done => { gamesDone = base + done; setProgress(`Generación ${g + 1}/${G}`); }
      });
      if (wasCancelled) break;
      const scores = candidates.map((_, c) => mean(played.slice(c * GAMES_PER_VARIANT, (c + 1) * GAMES_PER_VARIANT).map(r => r.progress)));
      const ranking = scores.map((s, c) => c).sort((a, b) => scores[b] - scores[a]);
      const best = ranking[0];
      history.push({ gen: g + 1, championScore: scores[0], bestScore: scores[best], changed: best !== 0 });
      champion = recombine(ranking.slice(0, RECOMBINE_WEIGHTS.length).map(c => candidates[c]), RECOMBINE_WEIGHTS);
      genList.innerHTML = renderHistory(history);
    }

    if (!cancelled) {
      // validación con partidas que el entrenamiento no ha visto
      const seeds = Array.from({ length: VALIDATION_GAMES }, (_, i) => i + 1);
      const jobs = [null, champion].flatMap(params => seeds.map(seed => ({ seed, aiParams: params, boosts })));
      const base = gamesDone;
      const { results: played, cancelled: wasCancelled } = await runGames(jobs, {
        isCancelled: () => cancelled,
        onProgress: done => { gamesDone = base + done; setProgress(`Validando con ${VALIDATION_GAMES} partidas nuevas`); }
      });
      if (!wasCancelled) {
        const orig = played.slice(0, VALIDATION_GAMES), mine = played.slice(VALIDATION_GAMES);
        pending = {
          params: champion, generations: G, fromTrained, boostKey: usedBoostKey,
          original: summarize(orig), trained: summarize(mine),
          diffs: mine.map((r, i) => r.progress - orig[i].progress)
        };
        results.innerHTML = renderVerdict(pending);
        $('.train-decision').hidden = false;
        fill.style.width = '100%';
        status.textContent = `Terminado en ${((performance.now() - t0) / 60000).toFixed(1)} min`;
      }
    }
  } catch (err) {
    console.error('Error en el entrenamiento:', err);
    status.textContent = 'Error: ' + err.message;
  }
  if (cancelled) status.textContent = 'Entrenamiento cancelado (no se ha guardado nada)';
  buttons.forEach(b => { b.disabled = false; });
  refreshTraining(section);
  running = false;
}

// ---------- vista ----------
// "Progreso" = rondas superadas + fracción de la última (más fino que la ronda para comparar variantes)
function renderHistory(history) {
  const max = Math.max(...history.map(h => h.bestScore));
  const min = Math.min(...history.map(h => h.championScore));
  const lo = Math.max(0, Math.floor(min) - 1);
  const pct = v => 100 * (v - lo) / Math.max(0.01, max - lo);
  return `
    <h3>Progreso medio por generación</h3>
    ${history.map(h => `
      <div class="pred-hist-row">
        <span class="pred-hist-label">G${h.gen}</span>
        <span class="pred-hist-bar"><span style="width:${pct(h.bestScore)}%"></span></span>
        <span class="pred-hist-count">${h.bestScore.toFixed(2)}${h.changed ? ' ▲' : ''}</span>
      </div>`).join('')}
    <p class="pred-help">Mejor candidato de cada generación (▲ = una variante superó al campeón). Es la media de ${GAMES_PER_VARIANT} partidas distintas en cada generación: sube y baja por azar.</p>`;
}

function renderVerdict(p) {
  const d = mean(p.diffs);
  const sd = Math.sqrt(p.diffs.reduce((a, x) => a + (x - d) ** 2, 0) / Math.max(1, p.diffs.length - 1));
  const err = 2 * sd / Math.sqrt(p.diffs.length); // ~95 %
  const verdict = d - err > 0 ? ['train-good', 'MEJORA CLARA']
    : d + err < 0 ? ['train-bad', 'EMPEORA']
    : ['train-meh', 'SIN DIFERENCIA CLARA (puede ser ruido)'];

  const row = (label, f) => `<tr><th>${label}</th><td>${f(p.original)}</td><td>${f(p.trained)}</td></tr>`;
  const changes = Object.entries(AI_PARAM_SPACE)
    .map(([k, s]) => ({ s, from: s.def, to: p.params[k], rel: Math.abs(p.params[k] - s.def) / (s.max - s.min) }))
    .filter(c => c.rel >= 0.05)
    .sort((a, b) => b.rel - a.rel)
    .slice(0, 10);
  const fmt = (v, s) => (s.max - s.min) <= 1.5 ? v.toFixed(2) : (s.max - s.min) <= 10 ? v.toFixed(1) : Math.round(v);

  return `
    <h3>Validación (${p.diffs.length} partidas nuevas)</h3>
    <p class="train-verdict ${verdict[0]}">${verdict[1]}<br><small>${d >= 0 ? '+' : ''}${d.toFixed(2)} ± ${err.toFixed(2)} rondas por partida</small></p>
    <table class="pred-table">
      <thead><tr><th></th><th>Original</th><th>Nueva</th></tr></thead>
      <tbody>
        ${row('Ronda media', s => s.avgRound.toFixed(1))}
        ${row('Duración', s => Math.round(s.avgSeconds) + ' s')}
        ${row('Victorias', s => `${s.wins}/${s.n}`)}
        ${row('Kills Lanzziano', s => s.kills[0].toFixed(1))}
        ${row('Kills Jhoabxi', s => s.kills[1].toFixed(1))}
      </tbody>
    </table>
    <h3>Qué ha cambiado (vs. original)</h3>
    ${changes.length ? `<table class="pred-table"><tbody>
      ${changes.map(c => `<tr><th>${c.s.label}</th><td>${fmt(c.from, c.s)} → ${fmt(c.to, c.s)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="pred-help">Nada importante: la IA original ya era la mejor encontrada.</p>'}
  `;
}

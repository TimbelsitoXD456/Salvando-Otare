// simPool.js - juega una lista de partidas de simulación sin dibujar, repartidas en Web Workers
// (una partida por núcleo a la vez). Si los workers no funcionan (p. ej. abriendo el html con file://),
// las juega en la propia pestaña con game.runHeadless, troceadas para no congelarla.
import { runHeadless } from './game.js';

const MAX_WORKERS = 8;
let workers = null;
let workersBroken = false;

export function workerCount() {
  return Math.max(1, Math.min(MAX_WORKERS, (navigator.hardwareConcurrency || 4) - 1));
}

function getWorkers() {
  if (workersBroken || typeof Worker === 'undefined') return null;
  if (!workers) {
    try {
      workers = Array.from({ length: workerCount() },
        () => new Worker(new URL('./simWorker.js', import.meta.url), { type: 'module' }));
    } catch (err) {
      console.warn('Sin Web Workers, se simula en la pestaña:', err);
      workersBroken = true;
      return null;
    }
  }
  return workers;
}

function killWorkers() {
  if (workers) workers.forEach(w => w.terminate());
  workers = null;
}

// jobs: [{ seed, aiParams, maxSeconds?, startRound?, boosts? }]. Devuelve { results, cancelled }: results[i] es el resultado de jobs[i]
// (null si no se llegó a jugar porque se canceló).
// Las tandas van en cola: una nueva espera a que acabe (o se cancele) la anterior.
let queue = Promise.resolve();
export function runGames(jobs, options) {
  const run = queue.then(() => runGamesNow(jobs, options));
  queue = run.catch(() => {});
  return run;
}

async function runGamesNow(jobs, { onProgress, isCancelled } = {}) {
  const results = new Array(jobs.length).fill(null);
  let done = 0;
  const cancelled = () => typeof isCancelled === 'function' && isCancelled();
  const tick = () => { done++; if (typeof onProgress === 'function') onProgress(done, jobs.length); };

  const ws = getWorkers();
  if (ws) {
    try {
      await runOnWorkers(ws, jobs, results, tick, cancelled);
    } catch (err) {
      console.warn('Los workers fallaron, se sigue en la pestaña:', err);
      killWorkers();
      workersBroken = true;
    }
  }
  // lo que quede (sin workers o si fallaron): en la pestaña
  for (let i = 0; i < jobs.length && !cancelled(); i++) {
    if (results[i]) continue;
    const r = await runHeadless({ ...jobs[i], isCancelled: cancelled });
    if (r.result === 'cancelled') break;
    results[i] = r;
    tick();
  }
  return { results, cancelled: cancelled() };
}

function runOnWorkers(ws, jobs, results, tick, cancelled) {
  return new Promise((resolve, reject) => {
    let next = 0, pending = 0, finished = false;
    const end = (err) => {
      if (finished) return;
      finished = true;
      clearInterval(watch);
      ws.forEach(w => { w.onmessage = null; w.onerror = null; });
      if (err) reject(err); else resolve();
    };
    // cancelar: matar los workers al momento (se recrean en la siguiente tanda)
    const watch = setInterval(() => { if (cancelled()) { killWorkers(); end(); } }, 100);
    const feed = w => {
      if (finished) return;
      if (next >= jobs.length) { if (pending === 0) end(); return; }
      const id = next++;
      pending++;
      const { seed, aiParams, maxSeconds = 600, startRound = 1, boosts = null } = jobs[id];
      w.postMessage({ id, seed, aiParams, maxSeconds, startRound, boosts });
    };
    ws.forEach(w => {
      w.onmessage = ({ data }) => {
        pending--;
        if (data.error) { end(new Error(data.error)); return; }
        results[data.id] = data.result;
        tick();
        feed(w);
      };
      w.onerror = e => { e.preventDefault?.(); end(new Error(e.message || 'error al cargar el worker')); };
    });
    if (jobs.length === 0) { end(); return; }
    ws.forEach(feed);
  });
}

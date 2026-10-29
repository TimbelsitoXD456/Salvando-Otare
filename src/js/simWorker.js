// simWorker.js - Web Worker que juega partidas de simulación sin dibujar (lo usa simPool.js).
// Cada worker tiene su propia copia del juego, así varias partidas corren a la vez en núcleos distintos.
import { runHeadless } from './game.js';

self.onmessage = async ({ data }) => {
  try {
    const result = await runHeadless({ seed: data.seed, aiParams: data.aiParams, maxSeconds: data.maxSeconds, startRound: data.startRound, boosts: data.boosts, difficulty: data.difficulty, chunked: false });
    self.postMessage({ id: data.id, result });
  } catch (err) {
    self.postMessage({ id: data.id, error: err.message });
  }
};

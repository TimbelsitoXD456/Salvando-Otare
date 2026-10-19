// loop.js - pequeño wrapper de RAF con deltaTime en segundos
export function createLoop({ update, render, maxDelta = 0.05 } = {}) {
  let rafId = null;
  let last = 0;
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    if (dt > maxDelta) dt = maxDelta;
    last = ts;
    update && update(dt);
    render && render(dt);
    // si update/render llamaron a stop(), no reprogramar el siguiente frame
    if (rafId) rafId = requestAnimationFrame(frame);
  }
  return {
    start() {
      if (rafId) return;
      last = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      if (!rafId) return;
      cancelAnimationFrame(rafId);
      rafId = null;
      last = 0;
    }
  };
}
// input.js - estado simple del teclado
const keyState = new Map();
const keyJustPressed = new Map();

function handleDown(e) {
  if (e.repeat) return;
  keyState.set(e.code, true);
  keyJustPressed.set(e.code, true);
}
function handleUp(e) {
  keyState.set(e.code, false);
  keyJustPressed.set(e.code, false);
}

// en un Web Worker (simulaciones en paralelo) no hay window ni teclado
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleDown);
  window.addEventListener('keyup', handleUp);
}

export function isDown(code) {
  return !!keyState.get(code);
}

export function wasPressed(code) {
  const p = !!keyJustPressed.get(code);
  if (p) keyJustPressed.set(code, false);
  return p;
}

export function resetInput() {
  keyState.clear();
  keyJustPressed.clear();
}
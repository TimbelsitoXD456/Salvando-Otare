// touch.js - controles táctiles para móvil: botones en pantalla (estilo neón) que se comportan como
// las teclas de un jugador. Devuelve una fuente de entrada { isDown, wasPressed } igual que el teclado o la IA.
//
//   izquierda:  ◀  ▶          derecha:  SALTO · GOLPE/DISPARO · PARRY · DASH
// Soporta varios dedos a la vez (moverse y saltar/pegar al mismo tiempo).

let root = null;

// kind: 'melee' (Lanzziano: golpe) o 'shooter' (Jhoabxi: disparo)
export function createTouchControls(container, kind) {
  removeTouchControls();
  const held = new Set();      // acciones con el dedo encima
  const pressed = new Set();   // pulsaciones nuevas aún no leídas por el juego
  const attack = kind === 'shooter' ? 'shoot' : 'melee';

  root = document.createElement('div');
  root.className = 'touch-controls';
  root.innerHTML = `
    <div class="touch-pad touch-left">
      <button class="touch-btn" data-act="left" aria-label="Izquierda">◀</button>
      <button class="touch-btn" data-act="right" aria-label="Derecha">▶</button>
    </div>
    <div class="touch-pad touch-right">
      <button class="touch-btn touch-small" data-act="parry">PARRY</button>
      <button class="touch-btn touch-small" data-act="dash">DASH</button>
      <button class="touch-btn touch-attack" data-act="${attack}">${kind === 'shooter' ? 'DISPARO' : 'GOLPE'}</button>
      <button class="touch-btn touch-jump" data-act="jump" aria-label="Saltar">▲</button>
    </div>
    <div class="touch-rotate">Gira el teléfono en horizontal para jugar mejor ↻</div>`;
  container.appendChild(root);

  const pointers = new Map();  // pointerId → acción
  const down = (btn, e) => {
    e.preventDefault();
    const act = btn.dataset.act;
    pointers.set(e.pointerId, act);
    held.add(act);
    pressed.add(act);
    btn.classList.add('on');
    try { btn.setPointerCapture(e.pointerId); } catch (err) {}
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(8);   // pequeño toque al pulsar
  };
  const up = (btn, e) => {
    const act = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (act && ![...pointers.values()].includes(act)) {
      held.delete(act);
      btn.classList.remove('on');
    }
  };
  root.querySelectorAll('.touch-btn').forEach(btn => {
    btn.addEventListener('pointerdown', e => down(btn, e));
    btn.addEventListener('pointerup', e => up(btn, e));
    btn.addEventListener('pointercancel', e => up(btn, e));
    btn.addEventListener('contextmenu', e => e.preventDefault());   // pulsación larga sin menú
  });

  return {
    isDown: action => held.has(action),
    wasPressed: action => pressed.delete(action)
  };
}

export function removeTouchControls() {
  if (root) { root.remove(); root = null; }
}

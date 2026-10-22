// menu.js - integración con game.js y pausa/overlay
import { getKills } from './kills.js';
import { handlePredictionAction, cancelPrediction, refreshPrediction } from './prediccion.js';
import { handleTrainingAction, cancelTraining, refreshTraining } from './entrenamiento.js';
import { getTrained } from './iaEntrenada.js';
import { startMenuBackground } from './menuBackground.js';
import { initCloud, onCloudChange, isAdmin, currentUser, isRecovering } from './cloud.js';
import { handleAccountAction, refreshAccount } from './cuenta.js';
import { getCoins, getActiveBoosts } from './tienda.js';
import { handleShopAction, refreshShop } from './tiendaUI.js';
import { initMusic, playSong, setBattleState, sfx, jingle, setDucked, setVolume, getVolume, setMusicEnabled, isMusicEnabled } from './music.js';

const Screens = {
  MENU: 'screen-menu',
  SIMS: 'screen-simulaciones',
  KILLS: 'screen-kills',
  PREDICTION: 'screen-prediccion',
  TRAINING: 'screen-entrenamiento',
  ACCOUNT: 'screen-cuenta',
  SHOP: 'screen-tienda',
  SETTINGS: 'screen-settings',
  CREDITS: 'screen-credits',
  GAME: 'screen-game'
};

const app = {
  currentScreen: Screens.MENU,
  buttons: [],
  focusedIndex: 0,
  gameModule: null,
  _canvasOriginalParent: null,
  _canvasOriginalNextSibling: null,
  _pauseBtnEl: null,
  _pauseOverlayEl: null,
  _returnScreen: Screens.MENU, // a dónde volver al salir de la partida (las simulaciones vuelven a SIMULACIONES)
  simStartRound: 1,            // ronda en la que empieza "Ver simulación"

  init() {
    this.cache();
    this.bind();
    this.updateFocusable();
    this.focusButton(0);
    window.addEventListener('resize', () => {
      if (this.currentScreen === Screens.GAME) this.setupCanvas();
    });
    // cuentas (Supabase): el menú se actualiza al entrar/salir; SIMULACIONES solo para el admin
    onCloudChange(() => this.refreshCloudUI());
    initCloud();
    // Música (music.js): suena desde el primer clic o tecla; la partida avisa de ronda, Tigre, jefe y resultado
    initMusic();
    playSong('menu');
    window.addEventListener('battleState', e => { this._battleState = e.detail; setBattleState(e.detail); });
    window.addEventListener('battleEnd', e => jingle(e.detail.result));
    this.bindSettings();
    // CapoCoins: saldo en el menú y en la TIENDA
    window.addEventListener('coinsChanged', () => this.refreshCoins());
    this.refreshCoins();
    // fondo animado de Otare (no se dibuja mientras se juega: el canvas del juego lo tapa)
    startMenuBackground(document.querySelector('.otare-bg'), () => this.currentScreen !== Screens.GAME);
    // REINTENTAR en la pantalla de derrota/victoria: el menú hace la cuenta atrás
    window.addEventListener('gameRetry', (e) => {
      if (!this.gameModule?.restart) return;
      e.preventDefault();
      this.retryGame();
    });
  },

  cache() {
    this.appEl = document.getElementById('app');
    this.screens = {
      menu: document.getElementById(Screens.MENU),
      settings: document.getElementById(Screens.SETTINGS),
      credits: document.getElementById(Screens.CREDITS),
      game: document.getElementById(Screens.GAME)
    };
    this.canvas = document.getElementById('gameCanvas');
    if (this.appEl) {
      const cs = window.getComputedStyle(this.appEl);
      if (cs.position === 'static') this.appEl.style.position = 'relative';
    }
  },

  bind() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.menu-btn, .acct-link');
      if (!btn) return;
      const action = btn.dataset.action || btn.getAttribute('data-action');
      this.handleAction(action, btn);
    });

    document.addEventListener('keydown', (e) => {
      if (this.currentScreen !== Screens.MENU && this.currentScreen !== Screens.SIMS) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); this.focusNext(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.focusPrev(); }
      if (e.key === 'Enter') { e.preventDefault(); this.activateFocused(); }
      // en SIMULACIONES, ← → cambian la ronda inicial
      if (this.currentScreen === Screens.SIMS && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const opts = Array.from(document.querySelectorAll('.sim-round-opt'));
        const i = opts.findIndex(b => +b.dataset.round === this.simStartRound);
        const next = opts[Math.max(0, Math.min(opts.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
        if (next) this.setSimStartRound(+next.dataset.round);
      }
    });
  },

  // botones navegables con ↑ ↓: los de la lista .menu de la pantalla actual (menú principal o SIMULACIONES);
  // no los del selector de ronda, que van con ← →
  updateFocusable(){
    this.buttons = Array.from(document.querySelectorAll(`#${this.currentScreen} .menu > .menu-btn`)).filter(b => !b.hidden);
  },

  // Al entrar/salir de la cuenta: SIMULACIONES solo para el admin, nombre en CUENTA, pantalla CUENTA al día
  refreshCloudUI(){
    const admin = isAdmin();
    document.querySelectorAll('.admin-only').forEach(el => { el.hidden = !admin; });
    const user = currentUser();
    const acctBtn = document.querySelector('.acct-btn');
    if (acctBtn) acctBtn.textContent = user ? 'MI CUENTA' : 'CUENTA';
    const hint = document.querySelector('.acct-hint');
    if (hint) hint.textContent = user ? `Conectado como ${user.username || user.email}` : '';
    // sin permiso de admin no se puede estar en las pantallas de simulación
    if (!admin && [Screens.SIMS, Screens.PREDICTION, Screens.TRAINING].includes(this.currentScreen)) this.showScreen(Screens.MENU);
    if (this.currentScreen === Screens.MENU) { this.updateFocusable(); this.focusedIndex = Math.min(this.focusedIndex, this.buttons.length - 1); }
    // llegó desde el enlace de "olvidé mi contraseña": abrir CUENTA para poner la nueva
    if (isRecovering() && this.currentScreen !== Screens.ACCOUNT && this.currentScreen !== Screens.GAME) this.showAccount();
    refreshAccount(document.getElementById(Screens.ACCOUNT));
    this.refreshCoins();
  },

  // Ajustes: volumen (0-100) y música encendida/apagada; se guardan en el navegador
  bindSettings(){
    const range = document.getElementById('vol-range');
    if (range) {
      range.value = Math.round(getVolume() * 100);
      range.addEventListener('input', () => setVolume(range.value / 100));
    }
    this.refreshMusicToggle();
  },
  refreshMusicToggle(){
    const btn = document.querySelector('.music-toggle');
    if (btn) btn.textContent = `Música: ${isMusicEnabled() ? 'ON' : 'OFF'}`;
  },

  refreshCoins(){
    const n = document.querySelector('.menu-coins-n');
    if (n) n.textContent = getCoins();
    refreshShop(document.getElementById(Screens.SHOP));
  },

  showAccount(){
    return this.showLoadedScreen(Screens.ACCOUNT, 'src/screens/cuenta.html', refreshAccount);
  },

  setSimStartRound(round){
    this.simStartRound = round;
    document.querySelectorAll('.sim-round-opt').forEach(b => b.classList.toggle('selected', +b.dataset.round === round));
  },

  focusButton(idx){
    if (this.buttons.length === 0) return;
    this.focusedIndex = (idx + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b,i) => {
      if (i === this.focusedIndex) { b.classList.add('focused'); b.focus(); }
      else b.classList.remove('focused');
    });
  },

  focusNext(){ this.focusButton(this.focusedIndex + 1) },
  focusPrev(){ this.focusButton(this.focusedIndex - 1) },
  activateFocused(){ const btn = this.buttons[this.focusedIndex]; btn && btn.click(); },

  handleAction(action, btn){
    switch(action){
      case 'play':
        this.launchGame({ boosts: getActiveBoosts() });   // objetos de la TIENDA activos
        break;
      case 'shop':
        this.showLoadedScreen(Screens.SHOP, 'src/screens/tienda.html', refreshShop);
        break;
      case 'shop-buy':
        handleShopAction(action, btn, document.getElementById(Screens.SHOP));
        break;
      case 'sims':
      case 'back-sims':
        if (isAdmin()) this.showSims();
        break;
      case 'account':
        this.showAccount();
        break;
      case 'acct-tab':
      case 'acct-logout':
      case 'acct-forgot':
        handleAccountAction(action, btn, document.getElementById(Screens.ACCOUNT));
        break;
      case 'acct-submit':
        break; // lo gestiona el formulario (cuenta.js)
      case 'simulate':
        // partida en la que una IA controla a cada jugador (ai.js); usa la IA entrenada si hay una guardada
        if (!isAdmin()) break;
        this.launchGame({ simulation: true, aiParams: getTrained()?.params ?? null, startRound: this.simStartRound });
        break;
      case 'sim-round':
        this.setSimStartRound(+btn.dataset.round || 1);
        break;
      case 'kills':
        this.showKills();
        break;
      case 'predict':
        if (!isAdmin()) break;
        this.showLoadedScreen(Screens.PREDICTION, 'src/screens/prediccion.html', refreshPrediction);
        break;
      case 'predict-count':
      case 'predict-ai':
      case 'predict-start':
      case 'predict-boost':
      case 'predict-run':
        handlePredictionAction(action, btn, document.getElementById(Screens.PREDICTION));
        break;
      case 'train':
        if (!isAdmin()) break;
        this.showLoadedScreen(Screens.TRAINING, 'src/screens/entrenamiento.html', refreshTraining);
        break;
      case 'train-gens':
      case 'train-boost':
      case 'train-run':
      case 'train-save':
      case 'train-discard':
      case 'train-reset':
        handleTrainingAction(action, btn, document.getElementById(Screens.TRAINING));
        break;
      case 'settings':
        this.showScreen(Screens.SETTINGS);
        break;
      case 'music-toggle':
        setMusicEnabled(!isMusicEnabled());
        this.refreshMusicToggle();
        break;
      case 'credits':
        this.showScreen(Screens.CREDITS);
        break;
      case 'back':
        this.showScreen(Screens.MENU);
        break;
      case 'back-to-menu':
        // This button no longer in markup; kept for compatibility
        this.stopGameIfRunning().finally(() => this.showScreen(Screens.MENU));
        break;
      default:
        console.log('Acción desconocida:', action);
    }
  },

  // Carga src/screens/kills.html la primera vez y muestra los valores guardados
  async showKills(){
    const section = document.getElementById(Screens.KILLS);
    if (!section) return;
    if (!section.dataset.loaded) {
      try {
        const res = await fetch('src/screens/kills.html');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        section.innerHTML = await res.text();
        section.dataset.loaded = 'true';
      } catch (err) {
        console.error('No se pudo cargar la pantalla de kills:', err);
        return;
      }
    }
    const kills = getKills();
    section.querySelectorAll('[data-kills]').forEach(el => {
      el.textContent = kills[el.dataset.kills] ?? 0;
    });
    this.showScreen(Screens.KILLS);
  },

  // Carga el html de una pantalla (src/screens/...) la primera vez y la muestra; onShow la refresca
  async showLoadedScreen(screenId, url, onShow){
    const section = document.getElementById(screenId);
    if (!section) return;
    if (!section.dataset.loaded) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        section.innerHTML = await res.text();
        section.dataset.loaded = 'true';
      } catch (err) {
        console.error(`No se pudo cargar ${url}:`, err);
        return;
      }
    }
    if (onShow) onShow(section);
    this.showScreen(screenId);
  },

  // Submenú SIMULACIONES, con una línea que dice qué IA se está usando
  showSims(){
    const status = document.querySelector(`#${Screens.SIMS} .sims-ai-status`);
    if (status) status.textContent = `IA en uso: ${getTrained() ? 'ENTRENADA' : 'original'} · ← → elige la ronda`;
    this.showScreen(Screens.SIMS);
  },

  showScreen(screenId){
    if (screenId !== Screens.PREDICTION) cancelPrediction();
    if (screenId !== Screens.TRAINING) cancelTraining();
    Object.values(Screens).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const active = id === screenId;
      el.classList.toggle('active', active);
      el.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    this.currentScreen = screenId;
    if (screenId === Screens.MENU || screenId === Screens.SIMS) {
      this.updateFocusable();
      this.focusButton(0);
    } else {
      const btn = document.querySelector(`#${screenId} .menu-btn`);
      btn && btn.focus();
    }
    if (screenId === Screens.GAME) this.setupCanvas();
    else this.restoreCanvasLayout();
  },

  // Make canvas cover entire interior (no padding)
  setupCanvas(){
    if (!this.canvas || !this.appEl) return;

    if (!this._canvasOriginalParent) {
      this._canvasOriginalParent = this.canvas.parentNode;
      this._canvasOriginalNextSibling = this.canvas.nextSibling;
    }

    if (this.canvas.parentNode !== this.appEl) this.appEl.appendChild(this.canvas);

    // Fill the whole interior (respecting the outer border of app)
    this.canvas.style.position = 'absolute';
    this.canvas.style.left = '0';
    this.canvas.style.top = '0';
    this.canvas.style.right = '0';
    this.canvas.style.bottom = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.zIndex = 20;
    this.canvas.style.borderRadius = '6px';

    this.resizeCanvasToDisplaySize();

    // show pause button
    this.showPauseButton();
  },

  restoreCanvasLayout(){
    if (!this.canvas) return;
    this.canvas.style.position = '';
    this.canvas.style.left = '';
    this.canvas.style.right = '';
    this.canvas.style.top = '';
    this.canvas.style.bottom = '';
    this.canvas.style.width = '';
    this.canvas.style.height = '';
    this.canvas.style.zIndex = '';
    this.canvas.style.borderRadius = '';

    if (this._canvasOriginalParent) {
      try {
        if (this._canvasOriginalNextSibling) {
          this._canvasOriginalParent.insertBefore(this.canvas, this._canvasOriginalNextSibling);
        } else {
          this._canvasOriginalParent.appendChild(this.canvas);
        }
      } catch (e) {
        this._canvasOriginalParent.appendChild(this.canvas);
      }
    }

    this.resizeCanvasToDisplaySize();
    this.hidePauseButton();
    this.hidePauseOverlay();
  },

  resizeCanvasToDisplaySize() {
    if (!this.canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = Math.max(160, Math.floor(this.canvas.clientWidth));
    const cssH = Math.max(120, Math.floor(this.canvas.clientHeight));
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);
  },

  // al salir de la partida: las simulaciones vuelven al submenú SIMULACIONES
  returnFromGame(){
    playSong('menu');
    if (this._returnScreen === Screens.SIMS) this.showSims();
    else this.showScreen(Screens.MENU);
  },

  // Entrada al juego estilo arcade: un círculo negro con anillo neón tapa el menú desde el centro,
  // aparece el juego congelado y una cuenta atrás 3, 2, 1, PELIEN lo arranca.
  launchGame(opts = {}){
    return this.playIntro(async () => {
      await this.startGame({ ...opts, hold: true });
      return !!this.gameModule;               // no se pudo iniciar: startGame ya volvió al menú
    });
  },

  // REINTENTAR (botón dibujado en el canvas de game.js): misma transición sobre la partida perdida
  retryGame(){
    return this.playIntro(async () => {
      this.gameModule.restart({ hold: true });
      return true;
    });
  },

  // enter(): monta la partida congelada mientras la pantalla está en negro; devuelve false si falló
  async playIntro(enter){
    if (this._launching) return;
    this._launching = true;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const fx = document.createElement('div');
    fx.id = 'intro-fx';
    fx.innerHTML = '<div class="iris"></div><div class="iris-ring"></div><div class="countdown" aria-live="assertive"></div>';
    this.appEl.appendChild(fx);
    const count = fx.querySelector('.countdown');
    const show = (text, cls) => {
      count.innerHTML = `<span class="${cls}">${text}</span>`; // un <span> nuevo reinicia la animación
    };
    try {
      playSong(null);                         // la música del menú se apaga con el círculo negro
      fx.classList.add('cover');
      await wait(600);
      if (!(await enter())) { playSong('menu'); return; }
      this.hidePauseButton();                 // sin pausa durante la cuenta atrás
      fx.classList.add('reveal');
      for (const [n, cls] of [['3', 'c3'], ['2', 'c2'], ['1', 'c1']]) {
        show(n, cls);
        sfx('count');
        await wait(800);
      }
      this.gameModule?.releaseHold?.();
      this.showPauseButton();
      show('PELIEN', 'go');
      sfx('go');
      playSong(this._battleState?.boss ? 'boss' : 'battle');   // la ronda ya la avisó la partida
      await wait(1000);
    } finally {
      fx.remove();
      this._launching = false;
    }
  },

  async startGame({ simulation = false, aiParams = null, startRound = 1, hold = false, boosts = null } = {}){
    this._returnScreen = simulation ? Screens.SIMS : Screens.MENU;
    this.showScreen(Screens.GAME);
    try {
      const m = await import('./game.js');
      if (!m || typeof m.start !== 'function') throw new Error('Módulo game.js no exporta start()');
      this.gameModule = m;
      // si se viene de una predicción cancelada, esperar a que suelte la partida sin canvas
      while (m.isBusy()) await new Promise(r => setTimeout(r, 20));
      m.start({ canvas: this.canvas, onResize: () => this.resizeCanvasToDisplaySize(), simulation, aiParams, startRound, hold, boosts });
      // ensure pause button visible
      this.showPauseButton();
    } catch (err) {
      console.error('No se pudo iniciar el juego:', err);
      this.drawPlaceholder();
      this.showScreen(Screens.MENU);
    }
          // Escuchar evento de finalización del juego
      const handleGameEnded = () => {
        this.stopGameIfRunning().finally(() => {
          this.returnFromGame();
        });
        window.removeEventListener('gameEnded', handleGameEnded);
      };
      window.addEventListener('gameEnded', handleGameEnded);
  },

  async stopGameIfRunning(){
    if (this.gameModule) {
      try {
        if (this.gameModule.stop) this.gameModule.stop();
      } catch (err) { console.warn('Error al detener el juego:', err); }
      this.gameModule = null;
    }
    this.hidePauseButton();
    this.hidePauseOverlay();
  },

  showPauseButton(){
    if (this._pauseBtnEl) return;
    const btn = document.createElement('button');
    btn.id = 'pause-btn';
    btn.textContent = 'PAUSA';
    btn.title = 'Pausa';
    btn.addEventListener('click', () => this.togglePause());
    this._pauseBtnEl = btn;
    this.appEl.appendChild(btn);
  },

  hidePauseButton(){
    if (!this._pauseBtnEl) return;
    try { this._pauseBtnEl.remove(); } catch(e){}
    this._pauseBtnEl = null;
  },

  togglePause(){
    if (!this.gameModule) return;
    // if game module exposes isPaused, prefer that
    if (this.gameModule.isPaused && this.gameModule.isPaused()) {
      this.hidePauseOverlay();
      this.gameModule.resume && this.gameModule.resume();
    } else {
      this.gameModule.pause && this.gameModule.pause();
      this.showPauseOverlay();
    }
  },

  showPauseOverlay(){
    if (this._pauseOverlayEl) return;
    setDucked(true);   // en pausa la música baja
    const ov = document.createElement('div');
    ov.id = 'pause-overlay';
    ov.innerHTML = `
      <div class="panel">
        <h2>PAUSA</h2>
        <div class="actions">
          <button class="menu-btn" id="resume-btn">Reanudar</button>
          <button class="menu-btn" id="quit-btn">Volver al menú</button>
        </div>
      </div>
    `;
    this._pauseOverlayEl = ov;
    this.appEl.appendChild(ov);

    ov.querySelector('#resume-btn').addEventListener('click', () => {
      if (this.gameModule && this.gameModule.resume) this.gameModule.resume();
      this.hidePauseOverlay();
    });
    ov.querySelector('#quit-btn').addEventListener('click', async () => {
      await this.stopGameIfRunning();
      this.returnFromGame();
    });
  },

  hidePauseOverlay(){
    setDucked(false);
    if (!this._pauseOverlayEl) return;
    try { this._pauseOverlayEl.remove(); } catch(e){}
    this._pauseOverlayEl = null;
  },

  drawPlaceholder(){
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0,0,w,h);
    const grad = ctx.createLinearGradient(0,0,w,h);
    grad.addColorStop(0, '#062b16');
    grad.addColorStop(1, '#0a2b14');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#00ffd0';
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.fillText('Pantalla del juego (placeholder)', 22, 36);
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
export default app;

// vozIA.js - SIMULACIONES → DESCARGAR AUDIO (solo admin).
// Escribes un texto, la Edge Function voz-jarvis lo lee con la voz de Gemini (Charon = la de J.A.R.V.I.S.)
// y aquí el audio (PCM 16 bits, 24 kHz) se convierte a .mp3 para descargarlo.
// El .mp3 se codifica en el navegador con lamejs; si no carga, se descarga en .wav.
import { generateVoice, VOICE_SAMPLE_RATE, isAdmin } from './cloud.js';

const LAMEJS = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
const MAX_TEXT = 4000;

let voice = 'Charon';
let busy = false;
let lastUrl = null;

// ---------- interfaz ----------
export function refreshVoice(section) {
  const text = section.querySelector('.voice-text');
  if (text && !text.dataset.bound) {
    text.dataset.bound = '1';
    const count = section.querySelector('.voice-count');
    const update = () => { count.textContent = `${text.value.length} / ${MAX_TEXT}`; };
    text.addEventListener('input', update);
    update();
  }
  section.querySelectorAll('.voice-opt').forEach(b => b.classList.toggle('selected', b.dataset.voice === voice));
}

export async function handleVoiceAction(action, btn, section) {
  if (action === 'voice-pick') {
    voice = btn.dataset.voice || 'Charon';
    refreshVoice(section);
    return;
  }
  if (action !== 'voice-run' || busy) return;
  if (!isAdmin()) return;

  const text = section.querySelector('.voice-text').value.trim();
  const tone = section.querySelector('.voice-tone').value.trim();
  const status = section.querySelector('.voice-status');
  const result = section.querySelector('.voice-result');
  const run = section.querySelector('.voice-run');
  if (!text) { status.textContent = 'Escribe un texto primero.'; return; }

  busy = true;
  run.disabled = true;
  result.hidden = true;
  status.textContent = 'Generando la voz con Gemini...';
  try {
    const pcm = new Int16Array(await generateVoice({ text, voice, tone }));
    status.textContent = 'Convirtiendo a .mp3...';
    const { blob, ext } = await encodeAudio(pcm, VOICE_SAMPLE_RATE);
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    section.querySelector('.voice-player').src = lastUrl;
    const link = section.querySelector('.voice-download');
    link.href = lastUrl;
    link.download = fileName(text, ext);
    link.textContent = `DESCARGAR .${ext.toUpperCase()}`;
    result.hidden = false;
    const secs = (pcm.length / VOICE_SAMPLE_RATE).toFixed(1);
    status.textContent = ext === 'mp3' ? `¡Listo! ${secs} s de audio.` : `¡Listo! ${secs} s (en .wav: no cargó el conversor a .mp3).`;
  } catch (err) {
    console.error(err);
    status.textContent = `Error: ${err.message}`;
  } finally {
    busy = false;
    run.disabled = false;
  }
}

// voz_charon_esperen-ya-paso-un-ano.mp3
function fileName(text, ext) {
  const slug = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 6).join('-') || 'audio';
  return `voz_${voice.toLowerCase()}_${slug}.${ext}`;
}

// ---------- codificar ----------
let lamePromise = null;
function loadLame() {
  if (window.lamejs) return Promise.resolve(window.lamejs);
  if (!lamePromise) {
    lamePromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LAMEJS;
      s.onload = () => (window.lamejs ? resolve(window.lamejs) : reject(new Error('lamejs no disponible')));
      s.onerror = () => { lamePromise = null; reject(new Error('No se pudo cargar lamejs')); };
      document.head.appendChild(s);
    });
  }
  return lamePromise;
}

export async function encodeAudio(pcm, sampleRate) {
  try {
    const lame = await loadLame();
    return { blob: toMp3(lame, pcm, sampleRate), ext: 'mp3' };
  } catch (err) {
    console.warn('Sin conversor a .mp3, se usa .wav:', err);
    return { blob: toWav(pcm, sampleRate), ext: 'wav' };
  }
}

// MP3 mono a 128 kbps
function toMp3(lame, pcm, sampleRate) {
  const enc = new lame.Mp3Encoder(1, sampleRate, 128);
  const out = [];
  const STEP = 1152;
  for (let i = 0; i < pcm.length; i += STEP) {
    const buf = enc.encodeBuffer(pcm.subarray(i, i + STEP));
    if (buf.length) out.push(new Uint8Array(buf));
  }
  const end = enc.flush();
  if (end.length) out.push(new Uint8Array(end));
  return new Blob(out, { type: 'audio/mpeg' });
}

function toWav(pcm, sampleRate) {
  const header = new DataView(new ArrayBuffer(44));
  const str = (o, s) => [...s].forEach((c, i) => header.setUint8(o + i, c.charCodeAt(0)));
  const bytes = pcm.length * 2;
  str(0, 'RIFF'); header.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, sampleRate, true); header.setUint32(28, sampleRate * 2, true);
  header.setUint16(32, 2, true); header.setUint16(34, 16, true);
  str(36, 'data'); header.setUint32(40, bytes, true);
  return new Blob([header.buffer, pcm.buffer], { type: 'audio/wav' });
}

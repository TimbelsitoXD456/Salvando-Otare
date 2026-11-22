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
  const batch = section.querySelector('.voice-batch');
  if (batch && !batch.dataset.bound) {
    batch.dataset.bound = '1';
    const count = section.querySelector('.voice-batch-count');
    const update = () => {
      const { items, skipped } = parseBatch(batch.value);
      count.textContent = `${items.length} frases${skipped.length ? ` · ${skipped.length} con huecos` : ''}`;
    };
    batch.addEventListener('input', update);
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
  if (action === 'voice-batch-stop') { batchStop = true; return; }
  if (action === 'voice-batch-run') { if (!busy && isAdmin()) await runBatch(section); return; }
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

// ---------- MODO LOTE ----------
// Cada línea: "nombre | texto | tono". Genera las voces una por una (para no pasarse de la cuota
// de Gemini) y las junta en un .zip con el nombre de cada línea (N. 1.mp3, N. 2.mp3, ...).
let batchStop = false;
let lastZipUrl = null;

export function parseBatch(raw) {
  const items = [], skipped = [];
  String(raw || '').split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l || l.startsWith('#')) return;
    const parts = l.split('|').map(s => s.trim());
    let name, text, tone;
    if (parts.length === 1) { name = `N. ${items.length + skipped.length + 1}`; text = parts[0]; tone = ''; }
    else [name, text, tone = ''] = parts;
    name = (name || `N. ${i + 1}`).replace(/[\\/:*?"<>|]/g, '').trim();
    if (!text) return;
    if (/\[[^\]]*\]/.test(text)) { skipped.push(name); return; }   // hueco sin rellenar: [A], [CAMBIO 1]...
    items.push({ name, text: text.slice(0, MAX_TEXT), tone: tone.slice(0, 120) });
  });
  return { items, skipped };
}

async function runBatch(section) {
  const { items, skipped } = parseBatch(section.querySelector('.voice-batch').value);
  const status = section.querySelector('.voice-batch-status');
  const progress = section.querySelector('.voice-batch-progress');
  const fill = section.querySelector('.voice-batch-fill');
  const result = section.querySelector('.voice-batch-result');
  const log = section.querySelector('.voice-batch-log');
  const runBtn = section.querySelector('.voice-batch-run');
  const stopBtn = section.querySelector('.voice-batch-stop');
  if (!items.length) { progress.hidden = false; status.textContent = 'No hay frases para generar.'; return; }

  busy = true; batchStop = false;
  runBtn.disabled = true; stopBtn.hidden = false;
  progress.hidden = false; result.hidden = true; log.innerHTML = '';
  const files = [], failed = [];
  let ext = 'mp3';

  for (let i = 0; i < items.length && !batchStop; i++) {
    const it = items[i];
    fill.style.width = `${100 * i / items.length}%`;
    status.textContent = `Generando ${i + 1} de ${items.length}: ${it.name}...`;
    let done = false;
    for (let attempt = 1; attempt <= 2 && !done && !batchStop; attempt++) {
      try {
        const pcm = new Int16Array(await generateVoice({ text: it.text, voice, tone: it.tone }));
        const enc = await encodeAudio(pcm, VOICE_SAMPLE_RATE);
        ext = enc.ext;
        files.push({ name: `${it.name}.${enc.ext}`, data: new Uint8Array(await enc.blob.arrayBuffer()) });
        done = true;
      } catch (err) {
        if (attempt === 2) failed.push(`${it.name}: ${err.message}`);
        else await new Promise(r => setTimeout(r, 3000));   // un respiro y se reintenta una vez
      }
    }
  }

  fill.style.width = '100%';
  const notes = [];
  if (batchStop) notes.push('detenido');
  if (failed.length) notes.push(`${failed.length} con error`);
  if (skipped.length) notes.push(`${skipped.length} saltadas por huecos [ ]`);
  status.textContent = `¡Listo! ${files.length} audios${notes.length ? ` (${notes.join(', ')})` : ''}.`;
  log.innerHTML = '';
  [...failed.map(f => `❌ ${f}`), ...skipped.map(s => `⏭️ ${s}: tiene huecos [ ] sin rellenar`)].forEach(t => {
    const li = document.createElement('li'); li.textContent = t; log.appendChild(li);
  });
  if (files.length) {
    if (lastZipUrl) URL.revokeObjectURL(lastZipUrl);
    lastZipUrl = URL.createObjectURL(makeZip(files));
    const link = section.querySelector('.voice-batch-download');
    link.href = lastZipUrl;
    link.download = `audios_${voice.toLowerCase()}.zip`;
    link.textContent = `DESCARGAR .ZIP (${files.length} .${ext})`;
  }
  result.hidden = !files.length && !log.children.length;
  section.querySelector('.voice-batch-download').hidden = !files.length;
  busy = false; runBtn.disabled = false; stopBtn.hidden = true;
}

// ZIP sin comprimir (los .mp3 ya vienen comprimidos), compatible con Windows
const CRC_TABLE = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(d) { let c = ~0; for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 255] ^ (c >>> 8); return (~c) >>> 0; }

export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);   // nombres en UTF-8
    local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, size, true); cen.setUint32(24, size, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + size;
  }
  const cenSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
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

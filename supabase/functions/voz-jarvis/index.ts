// ==========================================================================================
// voz-jarvis — convierte un texto en voz con Gemini (la MISMA voz que usa J.A.R.V.I.S.)
//
// Lo usa la pantalla SIMULACIONES → DESCARGAR AUDIO del juego (src/js/vozIA.js), solo para el admin.
//
// - La API key de Gemini vive SOLO aquí, como secreto de Supabase (GEMINI_API_KEY). Nunca llega
//   al navegador.
// - Solo responde a la cuenta con app_metadata.role = 'admin' (supabase/admin.sql). Cualquier
//   otra cuenta recibe 403, así nadie más gasta tu cuota de Gemini.
// - Igual que el narrador de Jarvis (JarvisDesktop/src/ai/live-narrator.js): Live API de Gemini,
//   voz "Charon", instrucción de leer el texto tal cual, y los textos largos se leen por partes.
//   (El modelo de TTS dedicado solo deja ~10 audios gratis al día; la Live API deja muchos más.)
//
// Entrada (POST JSON):  { text: string, voice?: string, tone?: string }
// Salida:               audio PCM 16 bits, mono, 24 kHz (application/octet-stream).
//                       El navegador lo convierte a .mp3.
// Errores:              JSON { error: "mensaje" }
//
// Desplegar (una sola vez, desde la carpeta del juego):
//   supabase login
//   supabase secrets set GEMINI_API_KEY=TU_API_KEY --project-ref loxboeyxiudrxibebazy
//   supabase functions deploy voz-jarvis --project-ref loxboeyxiudrxibebazy
// ==========================================================================================

const LIVE_MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025";
const LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

const SAMPLE_RATE = 24000;
const MAX_TEXT = 4000;            // caracteres por audio
const MAX_CHUNK_CHARS = 320;      // trozo que se lee de una vez (como en Jarvis)
const PAUSE_BETWEEN_CHUNKS = 0.25; // segundos de silencio entre trozos
const TIMEOUT_MS = 140_000;

// Voces de Gemini que se ofrecen en el juego (Charon = la de Jarvis)
const VOICES = new Set(["Charon", "Puck", "Kore", "Fenrir", "Aoede", "Orus", "Zephyr", "Leda"]);

const NARRATOR_PROMPT = `
Eres un lector de texto en voz alta. En cada turno vas a recibir un texto ya escrito. Tu ÚNICA
tarea es leerlo en voz alta exactamente como está, palabra por palabra, con naturalidad.

No agregues nada propio: nada de saludos, comentarios, ni respuestas al contenido del texto,
ni explicaciones. No cambies ni una palabra. Si el texto es una pregunta, léela como pregunta;
no la respondas.
`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------- ¿es el admin? ----------
async function isAdminRequest(req: Request): Promise<{ ok: boolean; status?: number; message?: string }> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL");
  const apikey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  if (!token || !url) return { ok: false, status: 401, message: "Inicia sesión con la cuenta admin." };

  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey } });
  if (!res.ok) return { ok: false, status: 401, message: "Sesión no válida: vuelve a iniciar sesión." };
  const user = await res.json();
  if (user?.app_metadata?.role !== "admin") return { ok: false, status: 403, message: "Solo el admin puede generar audio." };
  return { ok: true };
}

// ---------- partir un texto largo (misma lógica que live-narrator.js) ----------
function splitForNarration(text: string): string[] {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_CHUNK_CHARS) return clean ? [clean] : [];

  const sentences = clean.match(/[^.!?…;:]+[.!?…;:]+["'”»)]*\s*|[^.!?…;:]+$/g) || [clean];
  const pieces: string[] = [];
  for (const raw of sentences) {
    let sentence = raw;
    while (sentence.length > MAX_CHUNK_CHARS) {
      let cut = sentence.lastIndexOf(", ", MAX_CHUNK_CHARS);
      if (cut < MAX_CHUNK_CHARS * 0.4) cut = sentence.lastIndexOf(" ", MAX_CHUNK_CHARS);
      if (cut <= 0) cut = MAX_CHUNK_CHARS;
      pieces.push(sentence.slice(0, cut + 1));
      sentence = sentence.slice(cut + 1);
    }
    if (sentence) pieces.push(sentence);
  }

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current.trim() && (current + piece).trim().length > MAX_CHUNK_CHARS) {
      chunks.push(current.trim());
      current = piece;
    } else current += piece;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- leer el texto con la Live API y juntar el audio ----------
function narrate(apiKey: string, chunks: string[], voice: string, tone: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const parts: Uint8Array[] = [];
    const silence = new Uint8Array(Math.round(SAMPLE_RATE * PAUSE_BETWEEN_CHUNKS) * 2);
    let index = 0;
    let done = false;

    const ws = new WebSocket(`${LIVE_URL}?key=${encodeURIComponent(apiKey)}`);
    ws.binaryType = "arraybuffer";

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ya estaba cerrado */ }
      if (err) return reject(err);
      const total = parts.reduce((n, p) => n + p.length, 0);
      if (!total) return reject(new Error("Gemini no devolvió audio. Prueba de nuevo en un momento."));
      const out = new Uint8Array(total);
      let o = 0;
      for (const p of parts) { out.set(p, o); o += p.length; }
      resolve(out);
    };

    const timer = setTimeout(() => finish(new Error("Gemini tardó demasiado. Prueba con un texto más corto.")), TIMEOUT_MS);

    const sendNext = () => {
      if (index >= chunks.length) return false;
      if (index > 0) parts.push(silence);
      ws.send(JSON.stringify({ realtimeInput: { text: chunks[index++] } }));
      return true;
    };

    ws.onopen = () => {
      const prompt = tone ? `${NARRATOR_PROMPT}\nLee con este tono de voz: ${tone}.` : NARRATOR_PROMPT;
      ws.send(JSON.stringify({
        setup: {
          model: LIVE_MODEL,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
          systemInstruction: { parts: [{ text: prompt }] },
        },
      }));
    };

    ws.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.setupComplete) { sendNext(); return; }
      const sc = msg.serverContent;
      if (!sc) return;
      for (const part of sc.modelTurn?.parts || []) {
        if (part.inlineData?.data) parts.push(base64ToBytes(part.inlineData.data));
      }
      // terminó de leer este trozo: el siguiente, o listo
      if (sc.turnComplete && !sendNext()) finish();
    };

    ws.onerror = () => finish(new Error("No se pudo conectar con Gemini."));
    ws.onclose = (ev) => {
      if (done) return;
      const why = ev.reason ? ` (${ev.reason})` : "";
      if (parts.length && index >= chunks.length) finish();
      else finish(new Error(`Gemini cerró la conexión${why}. Revisa la API key o la cuota.`));
    };
  });
}

// ---------- servidor ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonError(405, "Usa POST.");

  const admin = await isAdminRequest(req);
  if (!admin.ok) return jsonError(admin.status!, admin.message!);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return jsonError(500, "Falta el secreto GEMINI_API_KEY en Supabase.");

  let body: { text?: string; voice?: string; tone?: string };
  try { body = await req.json(); } catch { return jsonError(400, "Petición no válida."); }

  const text = String(body.text || "").trim();
  if (!text) return jsonError(400, "Escribe un texto.");
  if (text.length > MAX_TEXT) return jsonError(400, `El texto es muy largo (máximo ${MAX_TEXT} caracteres).`);
  const voice = VOICES.has(String(body.voice)) ? String(body.voice) : "Charon";
  const tone = String(body.tone || "").trim().slice(0, 120);

  try {
    const pcm = await narrate(apiKey, splitForNarration(text), voice, tone);
    return new Response(pcm, {
      headers: { ...CORS, "Content-Type": "application/octet-stream", "X-Sample-Rate": String(SAMPLE_RATE) },
    });
  } catch (err) {
    return jsonError(502, (err as Error).message);
  }
});

// iaEntrenada.js - parámetros de la IA salidos del modo Entrenamiento, guardados en localStorage.
// Si hay una IA entrenada guardada, "Ver simulación" la usa; Predicción deja elegir entre ella y la original.
// Con cuenta iniciada, cloud.js la sincroniza con Supabase (evento 'progressChanged').
import { normalizeAIParams } from './ai.js';

const STORAGE_KEY = 'salvandoOtare.iaEntrenada';

function changed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('progressChanged'));
}

// { params, savedAt, generations, validation } o null
export function getTrained() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!data || typeof data.params !== 'object') return null;
    return { ...data, params: normalizeAIParams(data.params) };
  } catch (e) {
    return null;
  }
}

export function saveTrained(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() })); } catch (e) {}
  changed();
}

export function clearTrained() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  changed();
}

// Sustituir la IA entrenada guardada (al sincronizar con la cuenta); no avisa de cambio
export function replaceTrained(data) {
  try {
    if (data && typeof data.params === 'object') localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

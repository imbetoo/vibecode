/*
 * Calendario del Aula Virtual (Moodle), compartido por el popup y el horario
 * completo: el enlace .ics vive en chrome.storage.local y las tareas hechas
 * (UIDs) en chrome.storage.sync, para que se compartan entre ordenadores.
 */
const ICS_KEY = 'icsUrl';
const DONE_KEY = 'completedTasks';

async function getIcsUrl() {
  const { [ICS_KEY]: url } = await chrome.storage.local.get(ICS_KEY);
  return url || '';
}

async function readCompleted() {
  const { [DONE_KEY]: list } = await chrome.storage.sync.get(DONE_KEY);
  return new Set(Array.isArray(list) ? list : []);
}

/** Guarda los UIDs completados (misma clave y formato en el popup y el horario). */
function writeCompleted(set) {
  return chrome.storage.sync.set({ [DONE_KEY]: [...set] });
}

// ---------- Tareas y eventos propios (chrome.storage.sync) ----------
// Un array por tipo. Cada elemento:
//   { uid: 'custom-…', title, subject: código de SUBJECTS o '', date: 'AAAA-MM-DD',
//     time: 'HH:MM' o '' (todo el día), description, created: ISO }
// Hechas o no se guarda en DONE_KEY, igual que las de Moodle.
const CUSTOM_KEYS = { task: 'customTasks', event: 'customEvents' };
const CUSTOM_LIMITS = { title: 120, description: 300 };
const SYNC_ITEM_BYTES = 8192; // chrome.storage.sync: QUOTA_BYTES_PER_ITEM

function isValidCustomItem(item) {
  return Boolean(item) && typeof item.uid === 'string' && typeof item.title === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.date) && (!item.time || /^\d{2}:\d{2}$/.test(item.time));
}

/** Elemento propio -> evento con la misma forma que los del .ics. */
function customToEvent(item) {
  const [y, m, d] = item.date.split('-').map(Number);
  const [h, min] = item.time ? item.time.split(':').map(Number) : [0, 0];
  const allDay = !item.time;
  const start = new Date(y, m - 1, d, h, min);
  // SUBJECTS es un const de schedule-data.js: no cuelga de globalThis.
  const subject = typeof SUBJECTS !== 'undefined' ? SUBJECTS[item.subject] : undefined;
  return {
    uid: item.uid,
    summary: item.title,
    start,
    end: allDay ? new Date(y, m - 1, d + 1) : start,
    allDay,
    category: subject ? subject.name : item.kind === 'event' ? 'Evento' : 'Tarea propia',
    subject: subject ? item.subject : '',
    description: item.description || '',
    kind: item.kind,
    custom: true
  };
}

// Los que ya pasaron se siguen viendo (tachados) esta semana; después se
// borran del almacenamiento al guardar otro.
const CUSTOM_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Pasado hace más de CUSTOM_KEEP_MS: se puede borrar del almacenamiento. */
function isCustomExpired(item, now = new Date()) {
  return customToEvent(item).end < new Date(now.getTime() - CUSTOM_KEEP_MS);
}

/** Eventos propios que aún no han terminado (misma regla que upcomingEvents). */
function upcomingCustomEvents(items, now = new Date()) {
  return items.map(customToEvent).filter(event => event.end >= now);
}

/**
 * Para la lista del popup: los que no han terminado y también los pasados
 * recientes, marcados con `expired` (se pintan tachados al final).
 */
function listCustomEvents(items, now = new Date()) {
  return items
    .filter(item => !isCustomExpired(item, now))
    .map(item => {
      const event = customToEvent(item);
      return { ...event, expired: event.end < now };
    });
}

/** Sin UIDs repetidos (se queda el último): la lista nunca pinta dos veces lo mismo. */
function dedupeByUid(items) {
  return [...new Map(items.map(item => [item.uid, item])).values()];
}

/** Todos los elementos propios guardados, con su `kind`. */
async function readCustomItems() {
  const data = await chrome.storage.sync.get(Object.values(CUSTOM_KEYS));
  return dedupeByUid(Object.entries(CUSTOM_KEYS).flatMap(([kind, key]) =>
    (Array.isArray(data[key]) ? data[key] : []).filter(isValidCustomItem).map(item => ({ ...item, kind }))));
}

/**
 * Aplica un cambio de chrome.storage.onChanged a la lista en memoria usando
 * los `newValue` del propio evento (síncrono: sin otra lectura que compita).
 */
function mergeCustomChanges(items, changes) {
  let next = items;
  for (const [kind, key] of Object.entries(CUSTOM_KEYS)) {
    if (!changes[key]) continue;
    const list = Array.isArray(changes[key].newValue) ? changes[key].newValue : [];
    next = next.filter(item => item.kind !== kind)
      .concat(list.filter(isValidCustomItem).map(item => ({ ...item, kind })));
  }
  return dedupeByUid(next);
}

// Escrituras en cola: cada una lee el array recién guardado justo antes de
// escribir, así dos envíos seguidos no se pisan (lectura-modificación-escritura).
let customWriteQueue = Promise.resolve();

/** Añade un elemento propio. Rechaza con un mensaje legible si no cabe. */
function addCustomItem(kind, item) {
  const key = CUSTOM_KEYS[kind];
  const run = async () => {
    const { [key]: stored } = await chrome.storage.sync.get(key);
    const next = (Array.isArray(stored) ? stored : [])
      .filter(old => isValidCustomItem(old) && !isCustomExpired(old)) // limpia los pasados
      .concat(item);
    const bytes = new TextEncoder().encode(key + JSON.stringify(next)).length;
    if (bytes > SYNC_ITEM_BYTES) throw new Error('No queda espacio para sincronizar más elementos');
    await chrome.storage.sync.set({ [key]: next });
  };
  const result = customWriteQueue.then(run, run);
  customWriteQueue = result.catch(() => {});
  return result;
}

/** Parsea el .ics en un Web Worker para no bloquear el hilo principal. */
function parseInWorker(text) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('ics-worker.js');
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data);
    };
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || 'error al leer el calendario'));
    };
    worker.postMessage({ text, now: Date.now() });
  });
}

/**
 * Descarga y parsea el calendario.
 * @returns {Promise<{uids: string[], upcoming: object[], done: Set<string>}>}
 */
async function fetchCalendar(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('el enlace no devuelve un calendario .ics');
  const [parsed, done] = await Promise.all([parseInWorker(text), readCompleted()]);
  return { ...parsed, done };
}

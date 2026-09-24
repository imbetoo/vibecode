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

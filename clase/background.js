/*
 * Service worker: avisa cuando se abre la nueva tarea de IPE (sábado a las
 * 00:00) y 15 minutos antes de las tareas/eventos con hora.
 *
 * Los avisos no son notificaciones del sistema: se mandan a la pestaña activa,
 * donde content.js pinta un banner propio (ver deliverNotices).
 *
 * Una alarma comprueba la hora cada minuto (alineada al cambio de minuto).
 * Si la tarea de esta semana ya está abierta y aún no se ha avisado, se
 * notifica y se guarda en chrome.storage.local qué apertura se avisó, para
 * no repetir el aviso esa semana. Si Chrome estaba cerrado a las 00:00, el
 * aviso sale en la primera comprobación tras abrirlo (antes de la entrega).
 *
 * En el mismo latido avisa 15 minutos antes de cada tarea o evento con hora
 * (de Moodle o propio; los de "todo el día" no), ver checkUpcomingEvents.
 */
importScripts('ipe.js', 'ics.js', 'moodle.js');

const ALARM = 'ipe-check';
const FLAG = 'ipeNotifiedOpening';

function startChecking() {
  const nextMinute = Math.ceil(Date.now() / 60000) * 60000;
  chrome.alarms.create(ALARM, { when: nextMinute, periodInMinutes: 1 });
}

// ---------- Entrega de avisos a la pestaña activa (banner de content.js) ----------
// Cada aviso se guarda en una cola (chrome.storage.local) y se manda a la
// pestaña web activa. Si no se puede (chrome://, nueva pestaña, PDF, sin
// ventana…), espera y se reintenta al cambiar de pestaña o en el siguiente
// latido, hasta que caduca. Así ningún aviso se pierde ni sale dos veces.

const PENDING_KEY = 'pendingNotices';  // [{ id, kind, title, message, context, expiresAt }]
const NOTICE_MESSAGE = 'SHOW_INJECTED_NOTIFICATION';

/** Pestaña activa de la última ventana usada, si es una web normal. */
async function activeWebTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  // Con host_permissions <all_urls>, tab.url llega en las http(s); en el resto no.
  return tab && /^https?:/.test(tab.url || '') ? tab : null;
}

/** Manda un aviso a la pestaña; true si content.js confirma que lo ha pintado. */
async function sendNotice(tabId, notice) {
  const message = { type: NOTICE_MESSAGE, ...notice };
  try {
    return Boolean(await chrome.tabs.sendMessage(tabId, message));
  } catch {
    // Pestaña abierta antes de instalar/actualizar la extensión: aún no tiene
    // el content script. Se le inyecta y se reintenta una vez.
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return Boolean(await chrome.tabs.sendMessage(tabId, message));
    } catch {
      return false; // página donde no se puede inyectar: el aviso espera
    }
  }
}

async function runDeliverNotices() {
  const { [PENDING_KEY]: stored = [] } = await chrome.storage.local.get(PENDING_KEY);
  const now = Date.now();
  const live = stored.filter(notice => notice.expiresAt > now);
  let remaining = live;
  if (live.length) {
    const tab = await activeWebTab();
    if (tab) {
      remaining = [];
      for (const notice of live) {
        if (!(await sendNotice(tab.id, notice))) remaining.push(notice);
      }
    }
  }
  if (remaining.length !== stored.length) await chrome.storage.local.set({ [PENDING_KEY]: remaining });
}

// En fila, igual que las comprobaciones: dos entregas a la vez podrían leer la
// misma cola y mandar un aviso dos veces.
let deliverQueue = Promise.resolve();

function deliverNotices() {
  deliverQueue = deliverQueue
    .then(runDeliverNotices)
    .catch(error => console.warn('Entrega de avisos:', error));
  return deliverQueue;
}

/** Añade avisos a la cola (sin repetir id) y los intenta entregar ya. */
async function queueNotices(notices) {
  if (!notices.length) return;
  await (deliverQueue = deliverQueue.then(async () => {
    const { [PENDING_KEY]: stored = [] } = await chrome.storage.local.get(PENDING_KEY);
    const ids = new Set(stored.map(n => n.id));
    await chrome.storage.local.set({ [PENDING_KEY]: [...stored, ...notices.filter(n => !ids.has(n.id))] });
  }).catch(error => console.warn('Cola de avisos:', error)));
  return deliverNotices();
}

/** Al pasar el viernes 20:00, la tarea marcada como entregada se desmarca. */
async function clearExpiredIpeDone() {
  const { [IPE_DONE_KEY]: value } = await chrome.storage.sync.get(IPE_DONE_KEY);
  if (ipeDoneExpired(value)) await chrome.storage.sync.remove(IPE_DONE_KEY);
}

async function checkIpeOpening() {
  const now = new Date();
  // Entre la entrega del viernes y la apertura del sábado no hay tarea abierta.
  if (ipeStatus(now).waiting) return;

  const opening = lastIpeOpening(now).toISOString();
  const { [FLAG]: notified } = await chrome.storage.local.get(FLAG);
  if (notified === opening) return;

  await chrome.storage.local.set({ [FLAG]: opening });
  await queueNotices([{
    id: `ipe-${opening}`,
    kind: 'ipe',
    title: 'Entrega IPE',
    message: '¡La tarea de IPE ya está abierta!',
    context: 'Entrega el viernes a las 20:00',
    expiresAt: ipeStatus(now).deadline.getTime() // no tiene sentido después de la entrega
  }]);
}

// ---------- Aviso 15 minutos antes de tareas y eventos con hora ----------

const EVENT_LEAD_MS = 15 * 60 * 1000;
const NOTIFIED_KEY = 'notifiedEvents';      // { "uid|inicio ISO": inicio en ms }
const MOODLE_CACHE_KEY = 'moodleUpcomingCache';
const MOODLE_REFRESH_MS = 10 * 60 * 1000;   // el .ics se descarga, como mucho, cada 10 min
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Próximos eventos de Moodle con caché en chrome.storage.local (el service
 * worker se apaga entre alarmas y perdería la memoria). Si falla la descarga,
 * se usa lo último que hubiera.
 */
async function getMoodleUpcoming(now) {
  const url = await getIcsUrl();
  if (!url) return [];
  const { [MOODLE_CACHE_KEY]: cache } = await chrome.storage.local.get(MOODLE_CACHE_KEY);
  const fresh = cache && cache.url === url && now - cache.fetchedAt < MOODLE_REFRESH_MS;
  if (!fresh) {
    try {
      const calendar = await fetchCalendar(url);
      const events = calendar.upcoming.map(e => ({
        uid: e.uid, summary: e.summary, category: e.category, allDay: e.allDay,
        start: e.start.toISOString(), end: e.end.toISOString()
      }));
      await chrome.storage.local.set({ [MOODLE_CACHE_KEY]: { url, fetchedAt: now.getTime(), events } });
      return calendar.upcoming;
    } catch {
      if (!cache || cache.url !== url) return [];
    }
  }
  return cache.events.map(e => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
}

/** "Empieza en 15 minutos" / "Vence en 3 minutos" (las tareas propias vencen). */
function eventNoticeText(event, ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  const verb = event.kind === 'task' ? 'Vence' : 'Empieza';
  return `${verb} en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

async function runUpcomingEventsCheck() {
  const now = new Date();
  const [moodle, customs, done, stored] = await Promise.all([
    getMoodleUpcoming(now).catch(() => []),
    readCustomItems().catch(() => []),
    readCompleted().catch(() => new Set()),
    chrome.storage.local.get(NOTIFIED_KEY)
  ]);

  // Ya avisados. La clave lleva la hora de inicio: si un evento cambia de
  // hora, se vuelve a avisar. Los de hace más de un día se olvidan.
  const notified = { ...(stored[NOTIFIED_KEY] || {}) };
  let changed = false;
  for (const [key, start] of Object.entries(notified)) {
    if (start < now - DAY_MS) {
      delete notified[key];
      changed = true;
    }
  }

  // Con hora, sin marcar como hecho y empezando en los próximos 15 minutos.
  // (Ventana (0, 15] y no solo el minuto 14–15: si la alarma llega tarde o el
  // ordenador estaba suspendido, el aviso sale igual, con el tiempo real.)
  const due = mergeUpcomingEvents(moodle, customs, now).filter(event => {
    const ms = event.start - now;
    return !event.allDay && !done.has(event.uid) && ms > 0 && ms <= EVENT_LEAD_MS &&
      !notified[`${event.uid}|${event.start.toISOString()}`];
  });

  // Primero se guarda que se avisó y después se encola: si algo falla a
  // medias, como mucho se pierde un aviso, nunca sale repetido.
  for (const event of due) notified[`${event.uid}|${event.start.toISOString()}`] = event.start.getTime();
  if (due.length || changed) await chrome.storage.local.set({ [NOTIFIED_KEY]: notified });

  await queueNotices(due.map(event => ({
    id: `event-${event.uid}|${event.start.toISOString()}`,
    kind: event.kind === 'task' ? 'task' : 'event',
    title: `Próximamente: ${event.summary}`,
    message: eventNoticeText(event, event.start - now),
    context: [
      event.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      event.category
    ].filter(Boolean).join(' · '),
    expiresAt: event.start.getTime() // si no se ha podido mostrar antes de empezar, ya no
  })));
}

// Las comprobaciones van en fila: si coinciden la alarma y el arranque, la
// segunda espera a la primera y ya ve sus avisos guardados.
let eventsCheckQueue = Promise.resolve();

function checkUpcomingEvents() {
  eventsCheckQueue = eventsCheckQueue
    .then(runUpcomingEventsCheck)
    .catch(error => console.warn('Aviso de eventos:', error));
  return eventsCheckQueue;
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.alarms.clear('ipe-opening'); // alarma de la versión 1.1.0
  // Al instalar a mitad de semana no se avisa de una tarea que ya estaba abierta.
  const { [FLAG]: notified } = await chrome.storage.local.get(FLAG);
  if (!notified) await chrome.storage.local.set({ [FLAG]: lastIpeOpening().toISOString() });
  startChecking();
});

chrome.runtime.onStartup.addListener(() => {
  startChecking();
  checkIpeOpening();
  clearExpiredIpeDone();
  checkUpcomingEvents();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== ALARM) return;
  checkIpeOpening();
  clearExpiredIpeDone();
  checkUpcomingEvents();
  deliverNotices(); // reintenta los que esperaban
});

// Al cambiar a otra pestaña o ventana, o al terminar de cargar la activa, se
// entregan los avisos que esperaban una página web donde mostrarse.
chrome.tabs.onActivated.addListener(() => deliverNotices());
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.active) deliverNotices();
});
chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) deliverNotices();
});

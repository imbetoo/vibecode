/*
 * Service worker: avisa con una notificación cuando se abre la nueva tarea
 * de IPE (viernes a las 00:00).
 *
 * Se programa una alarma de un solo disparo para la próxima apertura y, al
 * saltar, se reprograma la siguiente. Así cada aviso se calcula con la hora
 * local real (los cambios de hora no la desplazan como haría una alarma
 * periódica de 7 días).
 */
importScripts('ipe.js');

const ALARM = 'ipe-opening';

function scheduleNextOpening() {
  chrome.alarms.create(ALARM, { when: nextIpeOpening().getTime() });
}

// Solo se crea si no existe: si Chrome estaba cerrado a la hora del aviso,
// la alarma pendiente salta al volver a abrirlo en vez de perderse.
async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM);
  if (!existing) scheduleNextOpening();
}

chrome.runtime.onInstalled.addListener(scheduleNextOpening);
chrome.runtime.onStartup.addListener(ensureAlarm);

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== ALARM) return;
  chrome.notifications.create(`ipe-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon_128.png',
    title: 'Entrega IPE',
    message: '¡La tarea de IPE ya está abierta!',
    priority: 2
  });
  scheduleNextOpening();
});

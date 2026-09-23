/*
 * Service worker: avisa con una notificación cuando se abre la nueva tarea
 * de IPE (viernes a las 00:00).
 *
 * Una alarma comprueba la hora cada minuto (alineada al cambio de minuto).
 * Si la tarea de esta semana ya está abierta y aún no se ha avisado, se
 * notifica y se guarda en chrome.storage.local qué apertura se avisó, para
 * no repetir el aviso esa semana. Si Chrome estaba cerrado a las 00:00, el
 * aviso sale en la primera comprobación tras abrirlo (antes de la entrega).
 */
importScripts('ipe.js');

const ALARM = 'ipe-check';
const FLAG = 'ipeNotifiedOpening';

function startChecking() {
  const nextMinute = Math.ceil(Date.now() / 60000) * 60000;
  chrome.alarms.create(ALARM, { when: nextMinute, periodInMinutes: 1 });
}

async function checkIpeOpening() {
  const now = new Date();
  // Entre la entrega del jueves y la apertura del viernes no hay tarea abierta.
  if (ipeStatus(now).waiting) return;

  const opening = lastIpeOpening(now).toISOString();
  const { [FLAG]: notified } = await chrome.storage.local.get(FLAG);
  if (notified === opening) return;

  await chrome.storage.local.set({ [FLAG]: opening });
  chrome.notifications.create(`ipe-${opening}`, {
    type: 'basic',
    iconUrl: 'icons/icon_128.png',
    title: 'Entrega IPE',
    message: '¡La tarea de IPE ya está abierta!',
    priority: 2
  });
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
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) checkIpeOpening();
});

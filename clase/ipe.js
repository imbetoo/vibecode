/*
 * Tarea semanal de IPE, compartida por el popup y el service worker.
 * - Entrega: jueves a las 20:00.
 * - La siguiente tarea se abre el viernes a las 00:00 (jueves por la noche).
 * Todas las horas son locales.
 */
const IPE_DEADLINE = { weekday: 4, hour: 20, minute: 0 }; // jueves 20:00
const IPE_OPENING  = { weekday: 5, hour: 0,  minute: 0 }; // viernes 00:00

/** Próxima fecha (estrictamente posterior a `now`) de un día/hora semanal. */
function nextWeekly({ weekday, hour, minute }, now = new Date()) {
  const daysAhead = (weekday - now.getDay() + 7) % 7;
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, hour, minute);
  if (candidate <= now) candidate.setDate(candidate.getDate() + 7);
  return candidate;
}

/** Próxima apertura de tarea (viernes 00:00). */
function nextIpeOpening(now = new Date()) {
  return nextWeekly(IPE_OPENING, now);
}

/** Última apertura ya ocurrida (viernes 00:00 anterior o igual a `now`). */
function lastIpeOpening(now = new Date()) {
  const next = nextIpeOpening(now);
  return new Date(next.getFullYear(), next.getMonth(), next.getDate() - 7, IPE_OPENING.hour, IPE_OPENING.minute);
}

/**
 * Estado de la tarea: entre la entrega del jueves y la apertura del viernes
 * se está esperando; el resto del tiempo, cuenta atrás hasta el jueves 20:00.
 * @returns {{waiting: true} | {waiting: false, deadline: Date, ms: number}}
 */
function ipeStatus(now = new Date()) {
  const deadline = nextWeekly(IPE_DEADLINE, now);
  const opening = nextIpeOpening(now);
  if (opening < deadline) return { waiting: true };
  return { waiting: false, deadline, ms: deadline - now };
}

/** "Faltan 2d 14h 30m" o el aviso de espera. */
function ipeCountdownText(now = new Date()) {
  const status = ipeStatus(now);
  if (status.waiting) return 'Esperando nueva tarea...';
  const totalMin = Math.floor(status.ms / 60000);
  const d = Math.floor(totalMin / (24 * 60));
  const h = Math.floor((totalMin % (24 * 60)) / 60);
  const m = totalMin % 60;
  return `Faltan ${d}d ${h}h ${m}m`;
}

// ---------- Casilla "IPE entregada" (chrome.storage.sync) ----------
// Se guarda la fecha de entrega (ISO) de la tarea marcada como hecha.
const IPE_DONE_KEY = 'ipeCompleted';

/** Entrega (ISO) de la tarea abierta ahora, o null entre jueves 20:00 y viernes 00:00. */
function ipeCurrentDeadline(now = new Date()) {
  const status = ipeStatus(now);
  return status.waiting ? null : status.deadline.toISOString();
}

/** La marca guardada ya no vale: su entrega pasó (o es de una versión antigua). */
function ipeDoneExpired(value, now = new Date()) {
  return Boolean(value) && value !== ipeCurrentDeadline(now);
}

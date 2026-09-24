/*
 * Parseador mínimo de calendarios iCalendar (.ics), pensado para la
 * exportación del calendario de Moodle. Solo lee lo que usa la vista de
 * tareas: UID, SUMMARY, DTSTART, DTEND y CATEGORIES de cada VEVENT.
 */

/** Deshace el "folding": una línea que empieza por espacio o tab continúa la anterior. */
function unfoldICS(text) {
  return text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '');
}

/** "NOMBRE;PARAM=x:valor" -> { name, params, value } (los ':' entre comillas no cortan). */
function parseICSLine(line) {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ':' && !inQuotes) { colon = i; break; }
  }
  if (colon === -1) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(';');
  const params = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

/** Quita los escapes de texto de iCalendar (\\, \; \, \n). */
function unescapeICSText(value) {
  return value.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

/**
 * Fecha iCalendar -> { date, allDay }.
 * - 20260925            fecha de día completo (medianoche local)
 * - 20260925T180000Z    UTC
 * - 20260925T200000     hora local (flotante o con TZID: se toma como local)
 */
function parseICSDate(value, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, utc] = m;
  if (h === undefined || params.VALUE === 'DATE') {
    return { date: new Date(+y, +mo - 1, +d), allDay: true };
  }
  const date = utc
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)))
    : new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  return { date, allDay: false };
}

/**
 * Extrae los eventos de un texto .ics.
 * @returns {{uid: string, summary: string, start: Date, end: Date, allDay: boolean, category: string}[]}
 */
function parseICS(text) {
  const events = [];
  let current = null;
  for (const line of unfoldICS(text).split('\n')) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (current && current.start) {
        const { date: start, allDay } = current.start;
        // Sin DTEND: un evento de día completo dura ese día; uno con hora es un instante.
        const end = current.end ? current.end.date
          : allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
          : start;
        const summary = current.summary || '(Sin título)';
        events.push({
          // Sin UID (raro en Moodle) se usa una clave estable de título + fecha.
          uid: current.uid || `${summary}|${start.toISOString()}`,
          summary,
          start,
          end,
          allDay,
          category: current.category || ''
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const prop = parseICSLine(line);
    if (!prop) continue;
    if (prop.name === 'UID') current.uid = prop.value.trim();
    else if (prop.name === 'SUMMARY') current.summary = unescapeICSText(prop.value).trim();
    else if (prop.name === 'DTSTART') current.start = parseICSDate(prop.value, prop.params);
    else if (prop.name === 'DTEND') current.end = parseICSDate(prop.value, prop.params);
    else if (prop.name === 'CATEGORIES') current.category = unescapeICSText(prop.value).trim();
  }
  return events;
}

/** Eventos que aún no han terminado, ordenados por fecha de inicio. */
function upcomingEvents(events, now = new Date()) {
  return events
    .filter(e => e.end >= now)
    .sort((a, b) => a.start - b.start);
}

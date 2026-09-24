/*
 * Web Worker: parsea el .ics fuera del hilo principal del popup, para que
 * un calendario grande no congele la interfaz ni los hovers.
 * Recibe { text, now } y devuelve { uids, upcoming } (o { error }).
 */
importScripts('ics.js');

self.onmessage = ({ data }) => {
  try {
    const events = parseICS(data.text);
    self.postMessage({
      uids: events.map(e => e.uid),             // todos, para limpiar completadas antiguas
      upcoming: upcomingEvents(events, new Date(data.now))
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

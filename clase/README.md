# Clase

Extensión Manifest V3 (Chrome/Brave) con tu horario de clase.

- **Menú**: botón *Horario* (muestra cuántas clases hay hoy), tarjeta *Entrega IPE* con cuenta atrás en vivo hasta el jueves a las 20:00 (entre el jueves 20:00 y el viernes 00:00 muestra *Esperando nueva tarea...*) y *Próximamente...*. Botón de tema también en la cabecera. Al reabrir el popup vuelve a la última vista abierta (menú, horario o tareas), guardada en `localStorage`.
- **IPE entregada**: la tarjeta de IPE tiene un reloj animado y una casilla. Al marcarla, la tarjeta se atenúa, se tacha y cambia de sitio en tres tiempos: se encoge y desvanece, *Tareas Aula Virtual* se desliza a su hueco y la tarjeta reaparece debajo. Se guarda en `chrome.storage.sync` (`ipeCompleted`, con la fecha de entrega), así que se comparte entre ordenadores y caduca sola el jueves a las 20:00 (lo borra el service worker aunque el popup esté cerrado). Entre el jueves 20:00 y el viernes 00:00 la casilla está desactivada.
- **Aviso de IPE**: el service worker comprueba la hora cada minuto y, al abrirse la nueva tarea (viernes 00:00), muestra una notificación del sistema. En `chrome.storage.local` guarda qué semana ya se avisó, así que solo avisa una vez por semana (y si Chrome estaba cerrado a medianoche, avisa al abrirlo, siempre antes de la entrega).
- **Tareas Aula Virtual**: pega el enlace de exportación del calendario de Moodle (Calendario → Exportar calendario → Obtener URL del calendario). Se guarda en `chrome.storage.local` y la vista muestra las tareas pendientes ordenadas por fecha. El engranaje permite cambiar o borrar el enlace. Cada tarea tiene una casilla para marcarla como hecha: se tacha, se atenúa y baja al final (sale con un fundido, las demás se deslizan a su hueco y reaparece en su nuevo sitio). Las completadas (por `UID` del `.ics`) se guardan en `chrome.storage.sync`, así que se comparten entre los ordenadores con la misma cuenta de Chrome; las que desaparecen del calendario se olvidan solas.
- **Horario diario**: abre en el día actual (en fin de semana, el lunes). `‹ L` / `X ›` o las flechas del teclado cambian de día; `Esc` vuelve al menú. Las horas seguidas de la misma asignatura se unen en un solo bloque (nunca a través del recreo) y el tramo en curso aparece resaltado. Al pasar el ratón por una asignatura, su código se funde con las sesiones que le quedan esta semana (*2 sesiones semanales restantes*; en bloques de un solo tramo, *2 restantes*).
- **Horas**: al pasar el ratón por una hora se ve su estado en vivo: *Ya pasó* (✓), los minutos que quedan si está en curso, o cuánto falta para que empiece (*En 12 min*, *En 2 h*, *En 3 d*).
- **Tema claro/oscuro**: botón de sol/luna en la barra del horario. La preferencia se guarda en `localStorage` y la comparte el horario completo.
- **Horario completo**: el botón de expandir abre `full_schedule.html` en una pestaña nueva con la semana entera en una cuadrícula. Al pasar el ratón por un día se ve su número; por una asignatura de la leyenda, el profesor y los periodos semanales (y cuántos quedan esta semana).
  - **Reloj**: arriba a la derecha, la hora en vivo (`HH:MM:SS`, cada bloque se anima por separado al cambiar) y cuánto queda para el fin de las clases de hoy (*Quedan 1 hora y 46 minutos.*). El fin se calcula con la última clase del día en `WEEK` (15:20 los jueves, 14:30 el resto).
  - **Tareas de Moodle**: cada bloque muestra en amarillo cuántas tareas pendientes tiene su asignatura. Una tarea se asigna a la asignatura cuyo código (`csdawBD`…) aparece en su `CATEGORIES` o en su título. Las tareas que vencen un día aparecen en los huecos libres del final de ese día (si no caben, el último hueco dice *N tareas más*). Marcar tareas en el popup lo actualiza al momento.
  - **Recreo**: al pasar el ratón, el texto se ilumina y entra deslizándose la etiqueta `// DESCANSO`.

## Instalar

`chrome://extensions` → activa *Modo de desarrollador* → *Cargar descomprimida* → selecciona esta carpeta `clase/`.

## Editar el horario

Todo está en `schedule-data.js`:

- `SUBJECTS`: nombre, color, profesor (`teacher`) y periodos semanales (`periods`) de cada asignatura.
- `WEEK`: para cada día, `classes` asigna número de tramo → código (`{ 1: 'csdawBD', 2: 'csdawBD' }`).
- `TIME_SLOTS` / `BREAK`: tramos horarios y recreo.

## Archivos

| Archivo | Función |
| --- | --- |
| `manifest.json` | Configuración MV3 |
| `schedule-data.js` | Datos del horario y utilidades compartidas |
| `theme.js` | Tema claro/oscuro compartido |
| `ipe.js` | Reglas de la tarea de IPE (entrega y apertura), compartidas |
| `background.js` | Service worker: alarma y notificación de IPE |
| `ics.js` | Parseador de calendarios `.ics` (UID, SUMMARY, DTSTART, DTEND, CATEGORIES) |
| `ics-worker.js` | Web Worker que parsea el `.ics` fuera del hilo principal |
| `moodle.js` | Enlace del calendario, descarga, parseo en el worker y tareas completadas, compartido |
| `popup.html` / `popup.css` / `popup.js` | Popup: menú y horario diario |
| `full_schedule.html` / `full_schedule.css` / `full_schedule.js` | Horario semanal completo |
| `bg-waves.svg` / `bg-waves-dark.svg` | Fondo de ondas del popup (claro / oscuro) |
| `icons/` | Iconos (`icon.svg` es la fuente) |

# Clase

Extensión Manifest V3 (Chrome/Brave) con tu horario de clase.

- **Menú**: botón *Horario* (muestra cuántas clases hay hoy), tarjeta *Entrega IPE* con cuenta atrás en vivo hasta el viernes a las 20:00 (entre el viernes 20:00 y el sábado 00:00 muestra *Esperando nueva tarea...*) y *Próximamente...*. Botón de tema también en la cabecera. Al reabrir el popup vuelve a la última vista abierta (menú, horario o tareas), guardada en `localStorage`.
- **IPE entregada**: la tarjeta de IPE tiene un reloj animado y una casilla. Al marcarla, la tarjeta se atenúa, se tacha y cambia de sitio en tres tiempos: se encoge y desvanece, *Tareas Aula Virtual* se desliza a su hueco y la tarjeta reaparece debajo. Se guarda en `chrome.storage.sync` (`ipeCompleted`, con la fecha de entrega), así que se comparte entre ordenadores y caduca sola el viernes a las 20:00 (lo borra el service worker aunque el popup esté cerrado). Entre el viernes 20:00 y el sábado 00:00 la casilla está desactivada.
- **Avisos dentro de la página**: los avisos no son notificaciones del sistema, sino un banner propio (estilo macOS) que `content.js` pinta arriba a la derecha de la pestaña web activa: icono de color según el tipo, título, mensaje y hora/asignatura. Usa Inter (incluida en la extensión, no se pide a Google desde las webs), cristal esmerilado y entra/sale deslizándose con un ligero cambio de escala. Se va solo a los 6 s (con el ratón encima espera; tiene botón para cerrar) y varios se apilan. Si la pestaña activa no es una web (`chrome://`, nueva pestaña, PDF…), el aviso espera en una cola (`pendingNotices` en `chrome.storage.local`) y sale al cambiar a una web, salvo que ya haya caducado. En pestañas abiertas antes de instalar la extensión, el script se inyecta con `chrome.scripting`.
  - **15 minutos antes**: en cada latido de un minuto, el service worker avisa de cada tarea o evento con hora, de Moodle o propio, que empiece en los próximos 15 minutos (*Próximamente: …*, *Empieza en 15 minutos* / *Vence en …* para las tareas propias). No avisa de los de *todo el día* ni de los marcados como hechos. Lo ya avisado se guarda en `notifiedEvents` (por UID y hora) para no repetir, y el `.ics` se descarga como mucho cada 10 minutos (caché en `moodleUpcomingCache`).
  - **IPE**: al abrirse la nueva tarea (sábado 00:00) avisa una vez por semana (en `chrome.storage.local` guarda qué semana ya se avisó; si Chrome estaba cerrado a medianoche, avisa al abrirlo, siempre antes de la entrega).
- **Tareas Aula Virtual**: pega el enlace de exportación del calendario de Moodle (Calendario → Exportar calendario → Obtener URL del calendario). Se guarda en `chrome.storage.local` y la vista muestra las tareas pendientes ordenadas por fecha: 4 a la vista y el resto con scroll interno (la última se desvanece si hay más), con los botones *+ Tarea* y *+ Evento* debajo. Cada uno abre una hoja inferior estilo iOS (nombre, asignatura, fecha, hora opcional —vacía = todo el día— y descripción); al guardar se añade a `customTasks` / `customEvents` en `chrome.storage.sync` (UID `custom-…`), aparece en la lista (los eventos con la fecha en azul) y en el horario completo, y se marca como hecha igual que las de Moodle. Las que ya pasaron no desaparecen: se quedan tachadas y atenuadas al final de la lista durante una semana (después se borran solas al guardar otra). La asignatura se elige en un desplegable propio (se navega también con flechas y Esc) y la fecha y la hora tienen selectores propios del mismo estilo: un mini calendario (lunes primero, sin días pasados) y dos columnas de hora y minutos (00, 15, 30, 45) con la opción *Todo el día*. El engranaje permite cambiar o borrar el enlace. Cada tarea tiene una casilla para marcarla como hecha: durante 300 ms se queda en su sitio mientras se rellena la casilla y se tacha el texto, y luego baja al final (sale con un fundido, las demás se deslizan a su hueco y reaparece en su nuevo sitio). Si se marca en otro ordenador, aquí hace la misma animación. Las completadas (por `UID` del `.ics`) se guardan en `chrome.storage.sync`, así que se comparten entre los ordenadores con la misma cuenta de Chrome; las que desaparecen del calendario se olvidan solas.
- **Horario diario**: abre en el día actual (en fin de semana, el lunes). `‹ L` / `X ›` o las flechas del teclado cambian de día; `Esc` vuelve al menú. Las horas seguidas de la misma asignatura se unen en un solo bloque (nunca a través del recreo) y el tramo en curso aparece resaltado. Al pasar el ratón por una asignatura, su código se funde con las sesiones que le quedan esta semana (*2 sesiones semanales restantes*; en bloques de un solo tramo, *2 restantes*).
- **Horas**: al pasar el ratón por una hora se ve su estado en vivo: *Ya pasó* (✓), los minutos que quedan si está en curso, o cuánto falta para que empiece (*En 12 min*, *En 2 h*, *En 3 d*).
- **Tema claro/oscuro**: botón de sol/luna en la barra del horario. El cambio es un fundido de 300 ms (colores y fondo). La preferencia se guarda en `localStorage` y la comparte el horario completo.
- **Horario completo**: el botón de expandir abre `full_schedule.html` en una pestaña nueva con la semana entera en una cuadrícula. Al pasar el ratón por un día se ve su número; por una asignatura de la leyenda, el profesor y los periodos semanales (y cuántos quedan esta semana).
  - **Reloj**: arriba a la derecha, la hora en vivo (`HH:MM:SS`, cada bloque hace un flip suave por separado al cambiar) y cuánto queda para el fin de las clases de hoy (*Quedan 1 hora y 46 minutos.*). El fin se calcula con la última clase del día en `WEEK` (15:20 los jueves, 14:30 el resto).
  - **Tareas de Moodle**: cada bloque muestra en amarillo cuántas tareas pendientes tiene su asignatura. Una tarea se asigna a una asignatura si su código o uno de sus `aliases` (en `schedule-data.js`, p. ej. `IPE`, `CD`, `Programación`) aparece como palabra completa en la categoría del evento ("IPE 1 DAW", "CD 26-27") o, si la categoría no encaja con ninguna, en su título; sin distinguir mayúsculas ni tildes. En la consola de DevTools, `Depuración Moodle:` muestra cómo se ha asignado cada tarea (y cuáles quedaron sin asignar). Las tareas que vencen un día aparecen en los huecos libres del final de ese día (si no caben, el último hueco dice *N tareas más*); en un día sin huecos al final (el jueves) van en tarjetas flotantes bajo su columna (hasta 3). Su casilla marca la tarea como hecha, igual que en el popup, y marcar tareas en el popup lo actualiza al momento.
  - **Recreo**: al pasar el ratón, el texto se convierte en una pastilla de cristal que se abre mostrando `// DESCANSO`, sin romper las líneas laterales.

## Instalar

`chrome://extensions` → activa *Modo de desarrollador* → *Cargar descomprimida* → selecciona esta carpeta `clase/`.

## Editar el horario

Todo está en `schedule-data.js`:

- `SUBJECTS`: nombre, color, profesor (`teacher`), periodos semanales (`periods`) y `aliases` (cómo aparece la asignatura en Moodle) de cada asignatura.
- `WEEK`: para cada día, `classes` asigna número de tramo → código (`{ 1: 'csdawBD', 2: 'csdawBD' }`).
- `TIME_SLOTS` / `BREAK`: tramos horarios y recreo.

## Archivos

| Archivo | Función |
| --- | --- |
| `manifest.json` | Configuración MV3 |
| `schedule-data.js` | Datos del horario y utilidades compartidas |
| `theme.js` | Tema claro/oscuro compartido |
| `ipe.js` | Reglas de la tarea de IPE (entrega y apertura), compartidas |
| `background.js` | Service worker: alarma, avisos de IPE y 15 min antes de tareas/eventos, cola de entrega a la pestaña activa |
| `content.js` / `content.css` | Content script: banner de avisos dentro de las páginas web |
| `fonts/` | Inter (subconjunto latino, pesos 500–600) para el banner, con su licencia OFL |
| `ics.js` | Parseador de calendarios `.ics` (UID, SUMMARY, DTSTART, DTEND, CATEGORIES) |
| `ics-worker.js` | Web Worker que parsea el `.ics` fuera del hilo principal |
| `moodle.js` | Enlace del calendario, descarga, parseo en el worker, tareas completadas y tareas/eventos propios, compartido |
| `popup.html` / `popup.css` / `popup.js` | Popup: menú y horario diario |
| `full_schedule.html` / `full_schedule.css` / `full_schedule.js` | Horario semanal completo |
| `bg-waves.svg` / `bg-waves-dark.svg` | Fondo de ondas del popup (claro / oscuro) |
| `icons/` | Iconos (`icon.svg` es la fuente) |

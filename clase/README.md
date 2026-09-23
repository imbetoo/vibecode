# Clase

Extensión Manifest V3 (Chrome/Brave) con tu horario de clase.

- **Menú**: botón *Horario* (muestra cuántas clases hay hoy) y *Próximamente...*.
- **Horario diario**: abre en el día actual (en fin de semana, el lunes). `‹ L` / `X ›` o las flechas del teclado cambian de día; `Esc` vuelve al menú. Las horas seguidas de la misma asignatura se unen en un solo bloque (nunca a través del recreo) y el tramo en curso aparece resaltado.
- **Horas**: al pasar el ratón por una hora se ve su estado en vivo: *Ya pasó* (✓), los minutos que quedan si está en curso, o cuánto falta para que empiece (*En 12 min*, *En 2 h*, *En 3 d*).
- **Tema claro/oscuro**: botón de sol/luna en la barra del horario. La preferencia se guarda en `localStorage` y la comparte el horario completo.
- **Horario completo**: el botón de expandir abre `full_schedule.html` en una pestaña nueva con la semana entera en una cuadrícula. Al pasar el ratón por un día se ve su número; por una asignatura de la leyenda, el profesor y los periodos semanales (y cuántos quedan esta semana).

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
| `popup.html` / `popup.css` / `popup.js` | Popup: menú y horario diario |
| `full_schedule.html` / `full_schedule.css` / `full_schedule.js` | Horario semanal completo |
| `bg-waves.svg` / `bg-waves-dark.svg` | Fondo de ondas del popup (claro / oscuro) |
| `icons/` | Iconos (`icon.svg` es la fuente) |

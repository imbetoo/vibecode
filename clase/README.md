# Clase

Extensión Manifest V3 (Chrome/Brave) con tu horario de clase.

- **Menú**: botón *Horario* (muestra cuántas clases hay hoy) y *Próximamente...*.
- **Horario diario**: abre en el día actual (en fin de semana, el lunes). `‹ L` / `X ›` o las flechas del teclado cambian de día; `Esc` vuelve al menú. Las horas seguidas de la misma asignatura se unen en un solo bloque (nunca a través del recreo) y el tramo en curso aparece resaltado.
- **Horario completo**: el botón de expandir abre `full_schedule.html` en una pestaña nueva con la semana entera en una cuadrícula.

## Instalar

`chrome://extensions` → activa *Modo de desarrollador* → *Cargar descomprimida* → selecciona esta carpeta `clase/`.

## Editar el horario

Todo está en `schedule-data.js`:

- `SUBJECTS`: nombre y color de cada asignatura.
- `WEEK`: para cada día, `classes` asigna número de tramo → código (`{ 1: 'csdawBD', 2: 'csdawBD' }`). Lunes, miércoles y viernes están vacíos por ahora.
- `TIME_SLOTS` / `BREAK`: tramos horarios y recreo.

## Archivos

| Archivo | Función |
| --- | --- |
| `manifest.json` | Configuración MV3 |
| `schedule-data.js` | Datos del horario y utilidades compartidas |
| `popup.html` / `popup.css` / `popup.js` | Popup: menú y horario diario |
| `full_schedule.html` / `full_schedule.css` / `full_schedule.js` | Horario semanal completo |
| `bg-waves.svg` | Fondo de ondas claras del popup |
| `icons/` | Iconos (`icon.svg` es la fuente) |

# bSTG

Extensión Manifest V3 para Brave/Chrome que agrupa automáticamente las pestañas por su dominio principal, con nombres de grupo personalizables.

## Funcionamiento

- **Agrupación automática**: cuando dos o más pestañas de una ventana comparten dominio principal (`github.com`, `gist.github.com` → `github.com`), se agrupan juntas.
- **Nombres personalizados**: desde el popup puedes asignar un nombre a un dominio (`github.com` → `Desarrollo`). Las reglas se guardan en `chrome.storage.sync`, así que sobreviven a reinicios y se sincronizan entre dispositivos con la misma cuenta.
  - Una regla cubre también los subdominios (`github.com` cubre `gist.github.com`); si hay varias, gana la más específica (`docs.google.com` antes que `google.com`).
  - Varios dominios con el mismo nombre comparten grupo (`github.com` y `gitlab.com` → `Desarrollo`).
  - Al crear, editar o borrar una regla, los grupos abiertos se renombran al momento sin deshacerse.
- **Nombre por defecto**: sin regla, el grupo se llama como el dominio (`Github`). El color sale de un hash del nombre, así que un mismo nombre tiene siempre el mismo color.
- **Limpieza**: si en un grupo queda una sola pestaña, el grupo se deshace.
- **Páginas ignoradas**: solo se agrupan páginas `http(s)`. Las internas (`chrome://`, `brave://`, `edge://`, `about:`, extensiones…) y las pestañas fijadas no se agrupan nunca.
- **Grupos manuales respetados**: un grupo solo se considera de la extensión si su título coincide con el nombre que le corresponde a alguna de sus pestañas. Las pestañas de grupos que has creado tú con otro nombre no se tocan.

Los eventos se agrupan con un *debounce* de 500 ms y las operaciones sobre grupos se ejecutan de una en una. Todas las llamadas que modifican pestañas toleran que una pestaña o un grupo desaparezca a mitad de la operación.

## Popup

- Formulario **Dominio** + **Nombre del grupo** → **Guardar**. El dominio se rellena con el de la pestaña activa y admite pegar una URL completa.
- Lista de reglas guardadas con botón **Eliminar**. Haz clic en una regla para cargarla en el formulario y editarla.
- **Reagrupar ahora** reorganiza las pestañas de todas las ventanas.

## Archivos

| Archivo | Función |
| --- | --- |
| `manifest.json` | Configuración MV3 |
| `background.js` | Service worker: agrupado, limpieza y renombrado |
| `shared.js` | Utilidades de dominio y reglas compartidas por el service worker y el popup |
| `popup.html` / `popup.js` | Interfaz de gestión de reglas |
| `icons/` | Iconos de la extensión (`icon_16/32/48/128.png`) |

## Instalación (modo desarrollador)

1. Abre `chrome://extensions` (o `brave://extensions`).
2. Activa el **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y selecciona esta carpeta.

## Permisos

- `tabs`: leer la URL de las pestañas para saber su dominio.
- `tabGroups`: crear, renombrar y colorear grupos.
- `storage`: guardar las reglas de nombres en `chrome.storage.sync`.

## Limitaciones conocidas

- El dominio principal se calcula con una heurística ligera (sufijos tipo `co.uk`, `com.ar`, `gob.es` y hostings compartidos como `github.io`), no con la Public Suffix List completa.
- Sin reglas, los dominios con el mismo nombre base comparten grupo (`google.com` y `google.es` → `Google`).
- Si sacas a mano una pestaña de un grupo, se volverá a agrupar la próxima vez que navegues o abras una pestaña en esa ventana.
- `chrome.storage.sync` admite como máximo 512 elementos, es decir, unas 500 reglas.

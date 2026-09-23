# Smart Tab Grouper

Extensión Manifest V3 para Brave/Chrome que agrupa automáticamente las pestañas por su dominio principal.

## Funcionamiento

- **Agrupación automática**: cuando dos o más pestañas de una ventana comparten dominio principal (`github.com`, `gist.github.com` → `github.com`), se agrupan juntas.
- **Título y color**: el grupo se llama como el dominio (`Github`). El color sale de un hash del nombre, así que un mismo dominio tiene siempre el mismo color.
- **Limpieza**: si en un grupo queda una sola pestaña, el grupo se deshace.
- **Páginas ignoradas**: solo se agrupan páginas `http(s)`. Las internas (`chrome://`, `brave://`, `edge://`, `about:`, extensiones…) y las pestañas fijadas no se agrupan nunca.
- **Grupos manuales respetados**: un grupo solo se considera de la extensión si su título coincide con el dominio de alguna de sus pestañas. Las pestañas de grupos que has creado tú con otro nombre no se tocan.
- **Reorganización manual**: haz clic en el icono de la extensión para reorganizar todas las ventanas.

Los eventos se agrupan con un *debounce* de 500 ms y las reconciliaciones se ejecutan de una en una. Todas las llamadas que modifican pestañas toleran que una pestaña o un grupo desaparezca a mitad de la operación.

## Instalación (modo desarrollador)

1. Abre `chrome://extensions` (o `brave://extensions`).
2. Activa el **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y selecciona esta carpeta.

## Permisos

- `tabs`: leer la URL de las pestañas para saber su dominio.
- `tabGroups`: crear, renombrar y colorear grupos.

## Limitaciones conocidas

- El dominio principal se calcula con una heurística ligera (sufijos tipo `co.uk`, `com.ar`, `gob.es` y hostings compartidos como `github.io`), no con la Public Suffix List completa.
- Los dominios con el mismo nombre base comparten grupo (`google.com` y `google.es` → `Google`).
- Si sacas a mano una pestaña de un grupo, se volverá a agrupar la próxima vez que navegues o abras una pestaña en esa ventana.

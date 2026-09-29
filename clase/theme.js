/*
 * Tema claro/oscuro compartido por el popup y el horario completo.
 * Se carga al principio del <body> para aplicar la clase antes de pintar.
 */
const THEME_KEY = 'clase-theme';

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

const THEME_FADE_MS = 300;
let themeFadeTimer = 0;

/**
 * Aplica el tema. Con `animate`, .theme-transition activa durante 300 ms las
 * transiciones de color de toda la página (ver el CSS) y luego se quita, para
 * no dejar transiciones globales activas (causarían lag al redimensionar).
 */
function applyTheme(theme, { animate = false } = {}) {
  const dark = theme === 'dark';
  if (document.body.classList.contains('dark-theme') === dark) return;
  if (animate) {
    document.body.classList.add('theme-transition');
    clearTimeout(themeFadeTimer);
    themeFadeTimer = setTimeout(() => document.body.classList.remove('theme-transition'), THEME_FADE_MS);
  }
  document.body.classList.toggle('dark-theme', dark);
}

function toggleTheme() {
  const next = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
  applyTheme(next, { animate: true });
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Sin almacenamiento el cambio dura hasta cerrar la página.
  }
  return next;
}

applyTheme(readTheme());

// Si se cambia el tema en el popup, la pestaña del horario completo lo sigue.
window.addEventListener('storage', event => {
  if (event.key === THEME_KEY) applyTheme(readTheme(), { animate: true });
});

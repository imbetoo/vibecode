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

function applyTheme(theme) {
  document.body.classList.toggle('dark-theme', theme === 'dark');
}

function toggleTheme() {
  const next = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
  applyTheme(next);
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
  if (event.key === THEME_KEY) applyTheme(readTheme());
});

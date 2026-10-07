/*
 * Content script: banner flotante (estilo notificación de macOS) dentro de la
 * página, para los avisos del service worker (IPE y tareas/eventos con hora).
 *
 * Todo se crea con createElement/textContent: el texto viene de Moodle o de
 * las tareas propias y nunca se interpreta como HTML en la página.
 */
(() => {
  // Puede inyectarse dos veces (manifiesto + chrome.scripting en pestañas
  // abiertas antes de instalar): el segundo no registra nada.
  if (globalThis.__claseExtNotifications) return;
  globalThis.__claseExtNotifications = true;

  const VISIBLE_MS = 6000;  // tiempo en pantalla
  const LEAVE_MS = 400;     // igual que la animación de salida en content.css
  const RESUME_MS = 2500;   // al sacar el ratón de encima, lo que queda
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let stack = null;

  /** Contenedor fijo arriba a la derecha donde se apilan los banners. */
  function getStack() {
    if (!stack || !stack.isConnected) {
      stack = document.createElement('div');
      stack.className = 'clase-ext-stack';
      (document.body || document.documentElement).append(stack);
    }
    return stack;
  }

  function bellIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M6 9.5a6 6 0 0 1 12 0c0 4.2 1.6 5.9 2.3 6.6.3.3.1.9-.4.9H4.1c-.5 0-.7-.6-.4-.9.7-.7 2.3-2.4 2.3-6.6zM9.8 19.5a2.3 2.3 0 0 0 4.4 0');
    svg.append(path);
    return svg;
  }

  function show({ id, kind, title, message, context }) {
    const container = getStack();
    // El mismo aviso no se pinta dos veces.
    if ([...container.children].some(el => el.dataset.id === id)) return;

    const banner = document.createElement('div');
    banner.className = `clase-ext-notification clase-ext-notification--${kind || 'event'}`;
    banner.dataset.id = id;
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    const icon = document.createElement('span');
    icon.className = 'clase-ext-notification__icon';
    icon.append(bellIcon());

    const body = document.createElement('span');
    body.className = 'clase-ext-notification__body';
    const app = document.createElement('span');
    app.className = 'clase-ext-notification__app';
    app.textContent = 'Clase';
    const strong = document.createElement('strong');
    strong.className = 'clase-ext-notification__title';
    strong.textContent = title;
    const text = document.createElement('span');
    text.className = 'clase-ext-notification__message';
    text.textContent = message;
    body.append(app, strong, text);
    if (context) {
      const extra = document.createElement('span');
      extra.className = 'clase-ext-notification__context';
      extra.textContent = context;
      body.append(extra);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'clase-ext-notification__close';
    close.setAttribute('aria-label', 'Cerrar aviso');
    close.textContent = '×';

    banner.append(icon, body, close);
    container.append(banner);

    let timer = 0;
    const leave = () => {
      clearTimeout(timer);
      if (banner.classList.contains('is-leaving')) return;
      banner.classList.add('is-leaving');
      setTimeout(() => {
        banner.remove();
        if (stack && !stack.children.length) stack.remove();
      }, LEAVE_MS);
    };
    const schedule = ms => {
      clearTimeout(timer);
      timer = setTimeout(leave, ms);
    };

    schedule(VISIBLE_MS);
    // Con el ratón encima no se va (como en macOS); al salir, un poco más.
    banner.addEventListener('mouseenter', () => clearTimeout(timer));
    banner.addEventListener('mouseleave', () => {
      if (!banner.classList.contains('is-leaving')) schedule(RESUME_MS);
    });
    close.addEventListener('click', leave);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'SHOW_INJECTED_NOTIFICATION') return;
    show(message);
    sendResponse({ shown: true }); // el service worker solo lo da por entregado con esto
  });
})();

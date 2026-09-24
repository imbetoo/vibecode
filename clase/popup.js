(() => {
  const app = document.getElementById('app');
  const menuView = document.getElementById('menu-view');
  const scheduleView = document.getElementById('schedule-view');
  const tasksView = document.getElementById('tasks-view');
  const grid = document.getElementById('day-grid');
  const dayTitle = document.getElementById('day-title');
  const prevLabel = document.getElementById('prev-label');
  const nextLabel = document.getElementById('next-label');
  const prevButton = document.getElementById('prev-day');
  const nextButton = document.getElementById('next-day');

  const today = todayIndex();
  let dayIndex = today;

  // ---------- Menú ----------

  function renderMenu() {
    const now = new Date();
    document.getElementById('menu-date').textContent = now.toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long'
    });

    const day = WEEK[today];
    const count = groupDay(day).length;
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const prefix = isWeekend ? 'El lunes' : 'Hoy';
    document.getElementById('menu-summary').textContent = count
      ? `${prefix}: ${count} ${count === 1 ? 'clase' : 'clases'}`
      : `${prefix}: sin clases cargadas`;
  }

  // ---------- Cuenta atrás de la entrega de IPE ----------

  const ipeText = document.getElementById('ipe-countdown-text');

  function updateIPECountdown() {
    const text = ipeCountdownText();
    if (ipeText.textContent !== text) ipeText.textContent = text; // solo el texto, y solo si cambia
  }

  // Cada minuto, arrancando en el cambio de minuto para no ir desfasado.
  function startIPECountdown() {
    updateIPECountdown();
    const msToNextMinute = 60000 - (Date.now() % 60000);
    setTimeout(() => {
      updateIPECountdown();
      setInterval(updateIPECountdown, 60000);
    }, msToNextMinute);
  }

  // ---------- Navegación entre vistas ----------

  const VIEWS = { menu: menuView, schedule: scheduleView, tasks: tasksView };

  /** Muestra una vista; las demás quedan inertes (sin foco ni clics). */
  function showView(name) {
    app.classList.toggle('is-schedule', name === 'schedule');
    app.classList.toggle('is-tasks', name === 'tasks');
    for (const [key, view] of Object.entries(VIEWS)) view.inert = key !== name;
  }

  function currentView() {
    if (app.classList.contains('is-schedule')) return 'schedule';
    if (app.classList.contains('is-tasks')) return 'tasks';
    return 'menu';
  }

  function showSchedule() {
    showView('schedule');
    renderDay();
  }

  function showMenu() {
    showView('menu');
  }

  function showTasks() {
    showView('tasks');
    loadTasks();
  }

  // ---------- Horario diario ----------

  const iconSvg = (cls, path) =>
    `<svg class="${cls}" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">` +
    '<circle cx="12" cy="12" r="11" fill="currentColor"/>' +
    `<path d="${path}" fill="none" stroke="var(--pill-bg)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    '</svg>';
  // Reloj y check van juntos; el hover solo alterna la clase is-done.
  const STATUS_ICONS = iconSvg('icon-clock', 'M12 6.5V12l3.5 2.5') + iconSvg('icon-check', 'M7 12.5l3.2 3.2L17 9');

  /** Momento (Date) de una hora "HH:MM" en la fecha dada. */
  function at(date, time) {
    const [h, m] = time.split(':').map(Number);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
  }

  /** "En 12 min", "En 2 h", "En 3 d" */
  function formatUntil(minutes) {
    if (minutes < 60) return `En ${minutes} min`;
    if (minutes < 24 * 60) return `En ${Math.floor(minutes / 60)} h`;
    return `En ${Math.round(minutes / (24 * 60))} d`;
  }

  /**
   * Estado de un tramo del día mostrado respecto a ahora: terminado,
   * en curso (minutos que quedan) o futuro (cuánto falta).
   */
  function slotStatus(slot, dayDate, now = new Date()) {
    const start = at(dayDate, slot.start);
    const end = at(dayDate, slot.end);
    if (now >= end) {
      return { label: 'Ya pasó', done: true, title: 'Clase terminada' };
    }
    if (now >= start) {
      const left = Math.ceil((end - now) / 60000);
      return { label: `${left} min`, done: false, title: `Quedan ${left} min` };
    }
    const until = Math.ceil((start - now) / 60000);
    return { label: formatUntil(until), done: false, title: `Empieza ${formatUntil(until).toLowerCase()}` };
  }

  function createTimePill(slot, isNow, dayDate) {
    const pill = document.createElement('div');
    pill.className = 'time-pill' + (isNow ? ' is-now' : '');
    pill.style.gridRow = String(slotRow(slot.id));
    pill.setAttribute('aria-label', `${formatTime(slot.start)} a ${formatTime(slot.end)}`);

    const times = document.createElement('span');
    times.className = 'time-pill__times';
    const start = document.createElement('span');
    start.textContent = formatTime(slot.start);
    const dash = document.createElement('span');
    dash.className = 'time-pill__dash';
    const end = document.createElement('span');
    end.textContent = formatTime(slot.end);
    times.append(start, dash, end);

    // Al pasar el ratón: estado en vivo (texto arriba, icono abajo). Se
    // recalcula en cada hover para que no se quede desfasado.
    const status = document.createElement('span');
    status.className = 'time-pill__status';
    status.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'time-pill__label';
    const icon = document.createElement('span');
    icon.className = 'time-pill__icon';
    icon.innerHTML = STATUS_ICONS; // una sola vez, al crear la píldora
    status.append(label, icon);

    // En cada hover solo se tocan el texto y dos clases, y solo si cambian.
    const updateStatus = () => {
      const state = slotStatus(slot, dayDate);
      if (label.textContent !== state.label) {
        label.textContent = state.label;
        label.classList.toggle('is-long', state.label.length > 7);
      }
      icon.classList.toggle('is-done', state.done);
      if (pill.title !== state.title) pill.title = state.title;
    };
    updateStatus();
    pill.addEventListener('mouseenter', updateStatus);

    pill.append(times, status);
    return pill;
  }

  function createSubjectBlock(block) {
    const subject = SUBJECTS[block.code] || { name: block.code, color: '#8e8e93' };
    const el = document.createElement('div');
    el.className = 'subject-block' + (block.from === block.to ? ' is-single' : '');
    el.style.gridRow = `${slotRow(block.from)} / ${slotRow(block.to) + 1}`;
    el.style.backgroundColor = subject.color;
    el.style.color = textColorFor(subject.color);

    const name = document.createElement('span');
    name.className = 'subject-block__name';
    name.textContent = subject.name;
    const code = document.createElement('span');
    code.className = 'subject-block__code';
    code.textContent = block.code;

    el.append(name, code);
    return el;
  }

  function renderEmptyDay() {
    const empty = document.createElement('div');
    empty.className = 'empty-day';
    empty.innerHTML =
      '<span class="empty-day__title">Sin clases cargadas</span>' +
      '<span class="empty-day__text">Añade las clases de este día en <code>schedule-data.js</code></span>';
    grid.style.gridTemplateRows = '';
    grid.replaceChildren(empty);
  }

  function renderDay(direction) {
    const day = WEEK[dayIndex];
    const prev = WEEK[(dayIndex + WEEK.length - 1) % WEEK.length];
    const next = WEEK[(dayIndex + 1) % WEEK.length];

    dayTitle.textContent = day.name;
    dayTitle.classList.toggle('is-long', day.name.length > 7);
    prevLabel.textContent = prev.short;
    nextLabel.textContent = next.short;
    prevButton.title = `Día anterior (${prev.name})`;
    nextButton.title = `Día siguiente (${next.name})`;

    animateGrid(direction);

    const blocks = groupDay(day);
    if (!blocks.length) {
      renderEmptyDay();
      return;
    }

    const slots = TIME_SLOTS.slice(0, visibleSlotCount(day));
    const rows = slots.map(() => 'var(--row-h)');
    if (slots.length > BREAK.afterSlot) rows.splice(BREAK.afterSlot, 0, 'var(--break-h)');
    grid.style.gridTemplateRows = rows.join(' ');

    const nowSlot = dayIndex === todayIndex() && isWeekday() ? currentSlotId() : null;
    const dayDate = weekDates()[dayIndex];
    const fragment = document.createDocumentFragment();
    slots.forEach(slot => fragment.append(createTimePill(slot, slot.id === nowSlot, dayDate)));
    blocks.forEach(block => fragment.append(createSubjectBlock(block)));
    grid.replaceChildren(fragment);
  }

  function animateGrid(direction) {
    grid.classList.remove('is-entering', 'from-left', 'from-right');
    if (!direction) return;
    void grid.offsetWidth; // reinicia la animación
    grid.classList.add('is-entering', direction < 0 ? 'from-left' : 'from-right');
  }

  function isWeekday() {
    const d = new Date().getDay();
    return d !== 0 && d !== 6;
  }

  function changeDay(step) {
    dayIndex = (dayIndex + step + WEEK.length) % WEEK.length;
    renderDay(step);
  }

  // ---------- Tareas del Aula Virtual (calendario .ics de Moodle) ----------

  const ICS_KEY = 'icsUrl';
  const tasksSetup = document.getElementById('tasks-setup');
  const tasksList = document.getElementById('tasks-list');
  const tasksStatus = document.getElementById('tasks-status');
  const tasksSettings = document.getElementById('tasks-settings');
  const icsInput = document.getElementById('ics-url');
  const icsCancel = document.getElementById('ics-cancel');
  const icsClear = document.getElementById('ics-clear');

  async function getIcsUrl() {
    const { [ICS_KEY]: url } = await chrome.storage.local.get(ICS_KEY);
    return url || '';
  }

  /** Acepta http(s) y webcal (Moodle a veces da webcal://, que es https). */
  function normalizeIcsUrl(value) {
    const url = new URL(value.trim().replace(/^webcal:\/\//i, 'https://'));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
    return url.href;
  }

  function setTasksStatus(text, isError = false) {
    tasksStatus.textContent = text;
    tasksStatus.classList.toggle('is-error', isError);
  }

  /** Formulario para pegar el enlace; si ya hay uno, permite cancelar o borrarlo. */
  function showSetup(currentUrl = '') {
    tasksSetup.hidden = false;
    tasksList.hidden = true;
    tasksSettings.hidden = true;
    icsInput.value = currentUrl;
    icsCancel.hidden = !currentUrl;
    icsClear.hidden = !currentUrl;
    setTasksStatus(currentUrl ? 'Cambia o borra el enlace' : 'Sin calendario configurado');
  }

  function showList() {
    tasksSetup.hidden = true;
    tasksList.hidden = false;
    tasksSettings.hidden = false;
  }

  // Tareas marcadas como hechas: UIDs del .ics en chrome.storage.sync, para
  // que se compartan entre los ordenadores con la misma cuenta de Chrome.
  const DONE_KEY = 'completedTasks';
  let completed = new Set();
  let loadedAt = '';

  async function readCompleted() {
    const { [DONE_KEY]: list } = await chrome.storage.sync.get(DONE_KEY);
    return new Set(Array.isArray(list) ? list : []);
  }

  async function saveCompleted() {
    try {
      await chrome.storage.sync.set({ [DONE_KEY]: [...completed] });
    } catch (error) {
      setTasksStatus(`No se pudo sincronizar (${error.message})`, true);
    }
  }

  function updateTasksCount() {
    const pending = tasksList.querySelectorAll('.task:not(.task--completed)').length;
    setTasksStatus(`${pending} ${pending === 1 ? 'pendiente' : 'pendientes'} · ${loadedAt}`);
  }

  /** Refleja `completed` en los li ya pintados: solo clases y checked, sin reconstruir. */
  function applyCompleted() {
    for (const li of tasksList.querySelectorAll('.task')) {
      const done = completed.has(li.dataset.uid);
      li.classList.toggle('task--completed', done);
      li.querySelector('.task__check').checked = done;
    }
    updateTasksCount();
  }

  /** Parsea el .ics en un Web Worker para no bloquear el hilo principal. */
  function parseInWorker(text) {
    return new Promise((resolve, reject) => {
      const worker = new Worker('ics-worker.js');
      worker.onmessage = ({ data }) => {
        worker.terminate();
        if (data.error) reject(new Error(data.error));
        else resolve(data);
      };
      worker.onerror = event => {
        worker.terminate();
        reject(new Error(event.message || 'error al leer el calendario'));
      };
      worker.postMessage({ text, now: Date.now() });
    });
  }

  let loadSeq = 0;

  async function loadTasks() {
    const seq = ++loadSeq;
    const url = await getIcsUrl();
    if (seq !== loadSeq) return;
    if (!url) {
      showSetup();
      return;
    }
    showList();
    setTasksStatus('Cargando…');
    tasksList.replaceChildren();

    let parsed, done;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error('el enlace no devuelve un calendario .ics');
      [parsed, done] = await Promise.all([parseInWorker(text), readCompleted()]);
    } catch (error) {
      if (seq === loadSeq) setTasksStatus(`No se pudo cargar (${error.message})`, true);
      return;
    }
    if (seq !== loadSeq) return; // hubo otra carga (o un cambio de enlace) mientras tanto

    // Olvida las completadas que ya no están en el calendario: así la lista
    // guardada no crece sin límite (sync admite 8 KB por clave).
    const inFeed = new Set(parsed.uids);
    completed = new Set([...done].filter(uid => inFeed.has(uid)));
    if (completed.size !== done.size) saveCompleted();

    loadedAt = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    renderTasks(parsed.upcoming);
  }

  /** Pinta la lista una vez por carga; marcar tareas después no la reconstruye. */
  function renderTasks(events) {
    if (!events.length) {
      const empty = document.createElement('li');
      empty.className = 'tasks-empty';
      empty.textContent = 'No hay tareas próximas. ¡Todo al día!';
      tasksList.replaceChildren(empty);
      updateTasksCount();
      return;
    }

    const now = new Date();
    const items = events.map(event => {
      const li = document.createElement('li');
      li.className = 'task';
      li.dataset.uid = event.uid;

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'task__check';
      check.setAttribute('aria-label', `Marcar como hecha: ${event.summary}`);

      const date = document.createElement('span');
      date.className = 'task__date';
      const day = document.createElement('span');
      day.className = 'task__day';
      day.textContent = String(event.start.getDate());
      const month = document.createElement('span');
      month.className = 'task__month';
      month.textContent = event.start.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
      date.append(day, month);

      const body = document.createElement('span');
      body.className = 'task__body';
      const title = document.createElement('span');
      title.className = 'task__title';
      title.textContent = event.summary;
      const meta = document.createElement('span');
      meta.className = 'task__meta';
      const weekday = event.start.toLocaleDateString('es-ES', { weekday: 'long' });
      const time = event.allDay
        ? 'Todo el día'
        : event.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      meta.textContent = [weekday, time, event.category].filter(Boolean).join(' · ');
      body.append(title, meta);

      const when = document.createElement('span');
      when.className = 'task__when';
      const minutes = Math.ceil((event.start - now) / 60000);
      when.textContent = minutes <= 0 ? 'Ahora' : formatUntil(minutes);
      when.classList.toggle('is-soon', minutes < 24 * 60);

      li.title = `${event.summary}\n${event.start.toLocaleString('es-ES')}`;
      li.append(check, date, body, when);
      return li;
    });
    tasksList.replaceChildren(...items);
    applyCompleted();
  }

  // Un solo listener para todas las casillas (delegación de eventos).
  tasksList.addEventListener('change', event => {
    const check = event.target;
    if (!check.matches('.task__check')) return;
    const li = check.closest('.task');
    if (check.checked) completed.add(li.dataset.uid);
    else completed.delete(li.dataset.uid);
    li.classList.toggle('task--completed', check.checked);
    updateTasksCount();
    saveCompleted();
  });

  // Si se marca una tarea en otro ordenador, se refleja aquí sin recargar.
  // (Fuera de la extensión, p. ej. abriendo popup.html a mano, no hay chrome.storage.)
  globalThis.chrome?.storage?.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes[DONE_KEY]) return;
    completed = new Set(changes[DONE_KEY].newValue || []);
    applyCompleted();
  });

  tasksSetup.addEventListener('submit', async event => {
    event.preventDefault();
    let url;
    try {
      url = normalizeIcsUrl(icsInput.value);
    } catch {
      setTasksStatus('Pega un enlace http(s) válido', true);
      icsInput.focus();
      return;
    }
    await chrome.storage.local.set({ [ICS_KEY]: url });
    loadTasks();
  });

  tasksSettings.addEventListener('click', async () => showSetup(await getIcsUrl()));
  icsCancel.addEventListener('click', loadTasks);
  icsClear.addEventListener('click', async () => {
    await chrome.storage.local.remove(ICS_KEY);
    loadSeq++;
    tasksList.replaceChildren();
    showSetup();
  });

  // ---------- Horario completo ----------

  function openFullSchedule() {
    const url = 'full_schedule.html';
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  }

  // ---------- Eventos ----------

  document.getElementById('open-schedule').addEventListener('click', showSchedule);
  document.getElementById('open-tasks').addEventListener('click', showTasks);
  document.querySelectorAll('.js-back-to-menu').forEach(button => {
    button.addEventListener('click', showMenu);
  });
  document.getElementById('open-full').addEventListener('click', openFullSchedule);
  document.querySelectorAll('.js-toggle-theme').forEach(button => {
    button.addEventListener('click', toggleTheme);
  });
  prevButton.addEventListener('click', () => changeDay(-1));
  nextButton.addEventListener('click', () => changeDay(1));

  document.addEventListener('keydown', event => {
    const view = currentView();
    if (view === 'tasks' && event.key === 'Escape') {
      event.preventDefault();
      showMenu();
      return;
    }
    if (view !== 'schedule') return;
    if (event.key === 'ArrowLeft') changeDay(-1);
    else if (event.key === 'ArrowRight') changeDay(1);
    else if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      showMenu();
    }
  });

  renderMenu();
  startIPECountdown();
})();

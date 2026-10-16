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
    applyIpeDone(); // el viernes a las 20:00 la casilla caduca y se desmarca sola
  }

  // ---------- Casilla "IPE entregada" ----------
  // En chrome.storage.sync se guarda la entrega (viernes 20:00) de la tarea
  // marcada. Al pasar esa hora la marca caduca: se borra y la tarjeta vuelve
  // a su sitio. Entre el viernes 20:00 y el sábado 00:00 no hay tarea.

  const ipeCard = document.getElementById('ipe-card');
  const ipeCheck = document.getElementById('ipe-check');
  const menuButtons = ipeCard.parentElement;
  let ipeDoneFor = '';

  /**
   * Reordena con FLIP: mide dónde está cada elemento, aplica el cambio y los
   * anima (solo transform, en la GPU) desde su sitio anterior. El elemento
   * que cambia de sitio no entra: hace su propia salida y entrada.
   */
  function flipReorder(items, change) {
    const before = items.map(item => item.getBoundingClientRect().top);
    change();
    const ease = getComputedStyle(document.documentElement).getPropertyValue('--ease').trim();
    items.forEach((item, i) => {
      const dy = before[i] - item.getBoundingClientRect().top;
      if (!dy) return;
      item.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        { duration: 600, easing: ease }
      );
    });
  }

  function reorderMenu(change) {
    flipReorder([...menuButtons.children].filter(card => card !== ipeCard), change);
  }

  /** Solo alterna clases, `checked` y `disabled`, y solo si cambian. */
  function applyIpeDone({ animate = true, delay = 0 } = {}) {
    if (ipeDoneExpired(ipeDoneFor)) {
      ipeDoneFor = '';
      chrome.storage.sync.remove(IPE_DONE_KEY).catch(() => {});
    }
    const deadline = ipeCurrentDeadline();
    const done = Boolean(deadline) && ipeDoneFor === deadline;
    if (ipeCheck.checked !== done) ipeCheck.checked = done;
    if (ipeCheck.disabled !== !deadline) ipeCheck.disabled = !deadline;
    moveIpeCard(done, animate && currentView() === 'menu', delay);
  }

  // Cambio de sitio en tres tiempos: la tarjeta sale (se encoge y se
  // desvanece), con ella invisible cambia el `order` mientras las demás se
  // deslizan a su hueco, y vuelve a entrar ya en su nueva posición.
  const IPE_LEAVE_MS = 250; // igual que la transición de .is-leaving en popup.css
  let ipeTarget = null;     // estado al que va la tarjeta mientras sale
  let ipeTimer = 0;

  function moveIpeCard(done, animate, delay = 0) {
    if (!animate) {
      clearTimeout(ipeTimer);
      ipeTimer = 0;
      ipeCard.classList.remove('is-leaving');
      ipeCard.classList.toggle('is-checked', done);
      return;
    }
    ipeTarget = done;
    if (ipeTimer) return; // ya está saliendo: al terminar usará el último estado
    if (ipeCard.classList.contains('is-checked') === done) return;
    // Primero se ve el check (delay), luego sale, cambia de sitio y entra.
    ipeTimer = setTimeout(() => {
      if (ipeCard.classList.contains('is-checked') === ipeTarget) { ipeTimer = 0; return; }
      ipeCard.classList.add('is-leaving');
      ipeTimer = setTimeout(() => {
        ipeTimer = 0;
        reorderMenu(() => ipeCard.classList.toggle('is-checked', ipeTarget));
        ipeCard.classList.remove('is-leaving'); // entrada: vuelve a su escala y opacidad
      }, IPE_LEAVE_MS);
    }, delay);
  }

  async function loadIpeDone() {
    try {
      const { [IPE_DONE_KEY]: value } = await chrome.storage.sync.get(IPE_DONE_KEY);
      ipeDoneFor = typeof value === 'string' ? value : '';
    } catch {
      ipeDoneFor = ''; // fuera de la extensión no hay chrome.storage
    }
    applyIpeDone({ animate: false });
  }

  ipeCheck.addEventListener('animationend', () => ipeCheck.classList.remove('is-popping'));

  ipeCheck.addEventListener('change', () => {
    ipeDoneFor = ipeCheck.checked ? ipeCurrentDeadline() || '' : '';
    if (ipeCheck.checked) ipeCheck.classList.add('is-popping');
    applyIpeDone({ delay: ipeCheck.checked ? CHECK_SHOW_MS : 0 });
    chrome.storage.sync.set({ [IPE_DONE_KEY]: ipeDoneFor }).catch(() => {});
  });

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

  const focusView = document.getElementById('focus-view');
  const VIEWS = { menu: menuView, schedule: scheduleView, tasks: tasksView, focus: focusView };
  const VIEW_KEY = 'clase-last-view';

  /** Muestra una vista; las demás quedan inertes (sin foco ni clics). */
  function showView(name) {
    app.classList.toggle('is-schedule', name === 'schedule');
    app.classList.toggle('is-tasks', name === 'tasks');
    app.classList.toggle('is-focus', name === 'focus');
    for (const [key, view] of Object.entries(VIEWS)) view.inert = key !== name;
    // El enfoque no se guarda como "última vista": se restaura desde su sesión
    // (ver restoreFocus), y al acabar se vuelve a las tareas.
    if (name === 'focus') return;
    try {
      localStorage.setItem(VIEW_KEY, name); // al reabrir el popup se vuelve aquí
    } catch {
      // Sin almacenamiento, el popup abre siempre en el menú.
    }
  }

  /**
   * Abre el popup en la última vista usada. Se coloca sin el deslizamiento
   * de entrada: la vista ya está en su sitio cuando se pinta el popup.
   */
  function restoreLastView() {
    if (restoreFocus()) return; // una sesión de enfoque en marcha manda
    let saved = 'menu';
    try {
      saved = localStorage.getItem(VIEW_KEY) || 'menu';
    } catch {}
    if (saved !== 'schedule' && saved !== 'tasks') return;
    app.classList.add('is-restoring');
    if (saved === 'schedule') showSchedule();
    else showTasks();
    void app.offsetWidth; // aplica la posición final antes de reactivar las transiciones
    app.classList.remove('is-restoring');
  }

  function currentView() {
    if (app.classList.contains('is-schedule')) return 'schedule';
    if (app.classList.contains('is-tasks')) return 'tasks';
    if (app.classList.contains('is-focus')) return 'focus';
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

  /** "7 sesiones semanales restantes" (en bloques de un tramo, "7 restantes"). */
  function remainingText(count, short) {
    if (short) return `${count} ${count === 1 ? 'restante' : 'restantes'}`;
    return count === 1 ? '1 sesión semanal restante' : `${count} sesiones semanales restantes`;
  }

  /**
   * Sesiones de la asignatura que quedan esta semana. Para un día futuro se
   * cuentan desde el inicio de ese día; para hoy o uno pasado, desde ahora.
   */
  function remainingSessions(code, dayDate) {
    const ref = new Date(Math.max(Date.now(), dayDate.getTime()));
    return Math.max(0, SUBJECTS[code].periods - periodsDoneThisWeek(code, ref));
  }

  function createSubjectBlock(block, dayDate) {
    const subject = SUBJECTS[block.code] || { name: block.code, color: '#8e8e93' };
    const el = document.createElement('div');
    el.className = 'subject-block' + (block.from === block.to ? ' is-single' : '');
    el.style.gridRow = `${slotRow(block.from)} / ${slotRow(block.to) + 1}`;
    el.style.backgroundColor = subject.color;
    el.style.color = textColorFor(subject.color);

    const name = document.createElement('span');
    name.className = 'subject-block__name';
    name.textContent = subject.name;
    const foot = document.createElement('span');
    foot.className = 'subject-block__foot';
    const code = document.createElement('span');
    code.className = 'subject-block__code';
    code.textContent = block.code;
    foot.append(code);

    // Hover: el código se funde con las sesiones restantes (misma celda).
    if (SUBJECTS[block.code]?.periods) {
      const short = block.from === block.to;
      const remaining = document.createElement('span');
      remaining.className = 'subject-block__remaining';
      remaining.setAttribute('aria-hidden', 'true');
      // Se recalcula al entrar el ratón; solo cambia el texto si hace falta.
      const updateRemaining = () => {
        const text = remainingText(remainingSessions(block.code, dayDate), short);
        if (remaining.textContent !== text) remaining.textContent = text;
      };
      updateRemaining();
      el.addEventListener('mouseenter', updateRemaining);
      foot.append(remaining);
    }

    el.append(name, foot);
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
    blocks.forEach(block => fragment.append(createSubjectBlock(block, dayDate)));
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

  // ---------- Modo enfoque (pomodoro de 25 min) ----------
  // La sesión vive en chrome.storage.local (focusState), así sobrevive a
  // cerrar el popup, y una alarma (FOCUS_ALARM) hace que el service worker
  // avise al acabar aunque el popup esté cerrado. Una copia en localStorage
  // (síncrono) permite abrir el popup directamente en el temporizador, sin
  // pintar antes otra vista; chrome.storage.local es la fuente de verdad.

  const FOCUS_KEY = 'focusState';
  const FOCUS_MIRROR = 'clase-focus';
  const FOCUS_ALARM = 'focus-end';
  const FOCUS_MS = 25 * 60 * 1000;

  const focusTitle = document.getElementById('focus-task-title');
  const focusTimer = document.getElementById('focus-timer');
  const focusBar = document.getElementById('focus-progress-bar');
  const focusEnds = document.getElementById('focus-ends');
  const focusExitLabel = document.getElementById('focus-exit-label');
  let focusTick = 0;
  let focusSession = null; // { title, endTime } de la sesión pintada

  // Icono (diana) del botón de cada tarea: se crea una vez y se clona.
  const FOCUS_ICON = (() => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'task__focus-btn';
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'aria-hidden': 'true' })) {
      svg.setAttribute(k, v);
    }
    for (const r of [9, 5]) {
      const circle = document.createElementNS(svgNs, 'circle');
      circle.setAttribute('cx', 12);
      circle.setAttribute('cy', 12);
      circle.setAttribute('r', r);
      svg.append(circle);
    }
    const dot = document.createElementNS(svgNs, 'circle');
    for (const [k, v] of Object.entries({ cx: 12, cy: 12, r: 1.6, fill: 'currentColor', stroke: 'none' })) dot.setAttribute(k, v);
    svg.append(dot);
    button.append(svg);
    return button;
  })();

  function readFocusMirror() {
    try {
      const state = JSON.parse(localStorage.getItem(FOCUS_MIRROR) || 'null');
      return state?.active && state.endTime > Date.now() ? state : null;
    } catch {
      return null;
    }
  }

  function writeFocusMirror(state) {
    try {
      if (state) localStorage.setItem(FOCUS_MIRROR, JSON.stringify(state));
      else localStorage.removeItem(FOCUS_MIRROR);
    } catch {}
  }

  const formatClock = ms => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  /** Pinta un segundo del temporizador: solo textContent y un transform. */
  function renderFocusTick() {
    const left = focusSession.endTime - Date.now();
    if (left <= 0) {
      finishFocus();
      return;
    }
    const text = formatClock(left);
    if (focusTimer.textContent !== text) focusTimer.textContent = text;
    // La barra va un segundo por delante: su transición dura 1 s y llega justo.
    const done = Math.min(1, (FOCUS_MS - left + 1000) / FOCUS_MS);
    focusBar.style.transform = `scaleX(${done.toFixed(4)})`;
    // Siguiente tick en el cambio de segundo respecto a endTime (sin deriva).
    focusTick = setTimeout(renderFocusTick, (left % 1000) || 1000);
  }

  function startFocusUI(title, endTime, { instant = false } = {}) {
    clearTimeout(focusTick);
    focusSession = { title, endTime };
    focusTitle.textContent = title;
    focusTitle.title = title;
    focusTimer.classList.remove('is-done');
    focusExitLabel.textContent = 'Salir';
    focusEnds.textContent = `Termina a las ${new Date(endTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    // La barra arranca ya en su punto, sin animar desde 0.
    focusBar.style.transition = 'none';
    focusBar.style.transform = `scaleX(${Math.min(1, (FOCUS_MS - (endTime - Date.now())) / FOCUS_MS).toFixed(4)})`;
    void focusBar.offsetWidth;
    focusBar.style.transition = '';

    if (instant) app.classList.add('is-restoring');
    showView('focus');
    if (instant) {
      void app.offsetWidth;
      app.classList.remove('is-restoring');
    }
    renderFocusTick();
  }

  /** Sonido corto (dos notas suaves) con Web Audio, sin archivos. */
  function playChime() {
    try {
      const audio = new AudioContext();
      [880, 1318.5].forEach((freq, i) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const t = audio.currentTime + i * 0.18;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(audio.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      });
      setTimeout(() => audio.close(), 1200);
    } catch {
      // Sin audio (o bloqueado): queda el aviso visual.
    }
  }

  async function clearFocusSession() {
    writeFocusMirror(null);
    try {
      await Promise.all([chrome.storage.local.remove(FOCUS_KEY), chrome.alarms.clear(FOCUS_ALARM)]);
    } catch {}
  }

  /** Fin con el popup abierto: "¡Completado!", sonido y se cierra la sesión
      (así la alarma del service worker ya no avisa por duplicado). */
  function finishFocus() {
    clearTimeout(focusTick);
    focusTimer.textContent = '¡Completado!';
    focusTimer.classList.add('is-done');
    focusBar.style.transform = 'scaleX(1)';
    focusEnds.textContent = 'Buen trabajo. Tómate 5 minutos.';
    focusExitLabel.textContent = 'Volver';
    focusSession = null;
    playChime();
    clearFocusSession();
  }

  async function beginFocus(title, uid) {
    const endTime = Date.now() + FOCUS_MS;
    const state = { active: true, title, uid, endTime };
    writeFocusMirror(state);
    startFocusUI(title, endTime);
    try {
      await chrome.storage.local.set({ [FOCUS_KEY]: state });
      await chrome.alarms.create(FOCUS_ALARM, { when: endTime });
    } catch {
      // Fuera de la extensión: el temporizador funciona igual mientras esté abierto.
    }
  }

  /** Al abrir el popup: si hay sesión en marcha, directo al temporizador. */
  function restoreFocus() {
    const state = readFocusMirror();
    if (!state) return false;
    startFocusUI(state.title, state.endTime, { instant: true });
    return true;
  }

  /** Comprueba la copia síncrona contra chrome.storage.local y corrige. */
  async function verifyFocusSession() {
    let state = null;
    try {
      ({ [FOCUS_KEY]: state } = await chrome.storage.local.get(FOCUS_KEY));
    } catch {
      return;
    }
    const live = state?.active && state.endTime > Date.now() ? state : null;
    writeFocusMirror(live);
    if (live && (!focusSession || focusSession.endTime !== live.endTime)) {
      startFocusUI(live.title, live.endTime, { instant: true });
    } else if (!live && focusSession && currentView() === 'focus') {
      // La sesión se cerró en otro sitio (p. ej. ya terminó): fuera.
      clearTimeout(focusTick);
      focusSession = null;
      showTasks();
    }
  }

  document.getElementById('focus-exit').addEventListener('click', () => {
    clearTimeout(focusTick);
    focusSession = null;
    clearFocusSession();
    showTasks();
  });

  // ---------- Tareas del Aula Virtual (calendario .ics de Moodle) ----------

  const tasksSetup = document.getElementById('tasks-setup');
  const tasksList = document.getElementById('tasks-list');
  const customActions = document.getElementById('custom-actions');

  // Degradado inferior solo si queda algo por debajo (hay más de 4 tareas y
  // no se ha llegado al final): solo alterna una clase, y solo si cambia.
  function updateListFade() {
    const more = tasksList.scrollHeight - tasksList.scrollTop - tasksList.clientHeight > 1;
    if (tasksList.classList.contains('has-more') !== more) tasksList.classList.toggle('has-more', more);
  }
  tasksList.addEventListener('scroll', updateListFade, { passive: true });
  new ResizeObserver(updateListFade).observe(tasksList);
  new MutationObserver(updateListFade).observe(tasksList, { childList: true });

  // ---------- Hoja inferior: nueva tarea / evento propio ----------

  const sheet = document.getElementById('sheet');
  const sheetBackdrop = document.getElementById('sheet-backdrop');
  const sheetTitle = document.getElementById('sheet-title');
  const sheetName = document.getElementById('sheet-name');
  const sheetDesc = document.getElementById('sheet-desc');
  const sheetError = document.getElementById('sheet-error');
  const sheetSubmit = document.getElementById('sheet-submit');

  const SHEET_TEXT = {
    task:  { title: 'Nueva tarea',  name: 'Nombre de la tarea', submit: '+ Añadir tarea' },
    event: { title: 'Nuevo evento', name: 'Nombre del evento',  submit: '+ Añadir evento' }
  };

  let sheetKind = 'task';
  let sheetOpener = null;
  let sheetFocusTimer = 0;

  const pad2 = n => String(n).padStart(2, '0');
  const isoDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const parseIso = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  /** Pone el scroll de una columna para que `item` quede centrado (sin scrollIntoView,
      que también desplazaría la hoja y el popup). */
  function centerInColumn(column, item) {
    column.scrollTop = item.offsetTop - (column.clientHeight - item.offsetHeight) / 2;
  }

  // ---------- Menús desplegables propios (asignatura, fecha, hora) ----------
  // Todos comparten la misma lógica: botón + menú flotante, uno abierto como
  // mucho, se cierran con un clic fuera o con Esc (que no cierra la hoja).

  const popovers = [];

  function createPopover(root, { onOpen } = {}) {
    const button = root.querySelector('.custom-select-btn');
    const menu = root.querySelector('.custom-select-menu');
    const popover = {
      root,
      button,
      isOpen: () => root.classList.contains('is-open'),
      open() {
        popovers.forEach(other => other !== popover && other.close());
        onOpen?.(); // construye/actualiza el contenido y pone el foco dentro
        root.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
        menu.inert = false;
        popover.focusInitial?.();
      },
      close({ focusButton = false } = {}) {
        if (!popover.isOpen()) return;
        root.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        menu.inert = true;
        if (focusButton) button.focus({ preventScroll: true });
      }
    };
    button.addEventListener('click', () => (popover.isOpen() ? popover.close() : popover.open()));
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation(); // que no cierre también la hoja
        popover.close({ focusButton: true });
      }
    });
    popovers.push(popover);
    return popover;
  }

  const openPopover = () => popovers.find(popover => popover.isOpen());
  const closePopovers = () => popovers.forEach(popover => popover.close());

  // Clic fuera de un menú abierto: se cierra.
  document.addEventListener('pointerdown', event => {
    for (const popover of popovers) {
      if (popover.isOpen() && !popover.root.contains(event.target)) popover.close();
    }
  });

  // ---------- Asignatura ----------

  const subjectSelect = document.getElementById('subject-select');
  const subjectLabel = subjectSelect.querySelector('.custom-select-value');
  const subjectMenu = subjectSelect.querySelector('.custom-select-menu');
  let subjectValue = '';

  // Opciones creadas una sola vez: "Sin asignatura" + SUBJECTS con su color.
  [['', { name: 'Sin asignatura' }], ...Object.entries(SUBJECTS)].forEach(([code, subject]) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'custom-select-option';
    option.setAttribute('role', 'option');
    option.dataset.value = code;
    const swatch = document.createElement('span');
    swatch.className = 'custom-select-swatch';
    if (subject.color) swatch.style.background = subject.color;
    const name = document.createElement('span');
    name.className = 'custom-select-name';
    name.textContent = subject.name;
    option.append(swatch, name);
    subjectMenu.append(option);
  });
  const subjectOptions = [...subjectMenu.querySelectorAll('.custom-select-option')];

  const subjectPopover = createPopover(subjectSelect);
  subjectPopover.focusInitial = () => {
    const current = subjectOptions.find(o => o.dataset.value === subjectValue) || subjectOptions[0];
    centerInColumn(subjectMenu, current);
    current.focus({ preventScroll: true });
  };

  function setSubject(code) {
    subjectValue = code;
    subjectLabel.textContent = code ? SUBJECTS[code].name : 'Sin asignatura';
    subjectPopover.button.classList.toggle('has-value', Boolean(code));
    for (const option of subjectOptions) {
      option.setAttribute('aria-selected', String(option.dataset.value === code));
    }
  }

  subjectMenu.addEventListener('click', event => {
    const option = event.target.closest('.custom-select-option');
    if (!option) return;
    setSubject(option.dataset.value);
    subjectPopover.close({ focusButton: true });
  });

  // Flechas para moverse por las opciones; Tab sale del menú.
  subjectMenu.addEventListener('keydown', event => {
    const i = subjectOptions.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = subjectOptions[(i + (event.key === 'ArrowDown' ? 1 : -1) + subjectOptions.length) % subjectOptions.length];
      next.focus({ preventScroll: true });
    } else if (event.key === 'Tab') {
      subjectPopover.close();
    }
  });

  // ---------- Fecha: mini calendario ----------
  // El esqueleto (cabecera, días de la semana y 42 celdas) se crea una vez;
  // al abrir o cambiar de mes solo cambian textos, clases y atributos de las
  // celdas, así el menú nunca cambia de tamaño.

  const datePicker = document.getElementById('date-picker');
  const dateLabel = datePicker.querySelector('.custom-select-value');
  const dateMenu = datePicker.querySelector('.custom-select-menu');
  let dateValue = '';            // 'AAAA-MM-DD'
  let dateView = new Date();     // día 1 del mes mostrado

  const calHeader = document.createElement('div');
  calHeader.className = 'cal-header';
  const calPrev = document.createElement('button');
  calPrev.type = 'button';
  calPrev.className = 'cal-nav';
  calPrev.setAttribute('aria-label', 'Mes anterior');
  calPrev.textContent = '‹';
  const calTitle = document.createElement('span');
  calTitle.className = 'cal-title';
  const calNext = document.createElement('button');
  calNext.type = 'button';
  calNext.className = 'cal-nav';
  calNext.setAttribute('aria-label', 'Mes siguiente');
  calNext.textContent = '›';
  calHeader.append(calPrev, calTitle, calNext);

  const calWeekdays = document.createElement('div');
  calWeekdays.className = 'cal-weekdays';
  for (const letter of ['L', 'M', 'X', 'J', 'V', 'S', 'D']) {
    const cell = document.createElement('span');
    cell.textContent = letter;
    calWeekdays.append(cell);
  }

  const calGrid = document.createElement('div');
  calGrid.className = 'cal-grid';
  const calCells = Array.from({ length: 42 }, () => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day';
    calGrid.append(cell);
    return cell;
  });
  dateMenu.append(calHeader, calWeekdays, calGrid);

  function renderCalendar() {
    const today = isoDate(new Date());
    const year = dateView.getFullYear();
    const month = dateView.getMonth();
    const title = dateView.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    calTitle.textContent = title.charAt(0).toUpperCase() + title.slice(1);
    const offset = (new Date(year, month, 1).getDay() + 6) % 7; // lunes primero
    const days = new Date(year, month + 1, 0).getDate();
    calCells.forEach((cell, i) => {
      const day = i - offset + 1;
      const inMonth = day >= 1 && day <= days;
      const iso = inMonth ? isoDate(new Date(year, month, day)) : '';
      cell.textContent = inMonth ? String(day) : '';
      cell.dataset.date = iso;
      cell.classList.toggle('is-blank', !inMonth);
      cell.classList.toggle('is-today', iso === today);
      cell.disabled = !inMonth || iso < today; // no se puede elegir el pasado
      cell.setAttribute('aria-pressed', String(inMonth && iso === dateValue));
      if (inMonth) {
        cell.setAttribute('aria-label', new Date(year, month, day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
      } else {
        cell.removeAttribute('aria-label');
      }
    });
    // No hay meses anteriores al actual que elegir.
    const now = new Date();
    calPrev.disabled = year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth());
  }

  function dateText(iso) {
    const today = new Date();
    if (iso === isoDate(today)) return 'Hoy';
    if (iso === isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))) return 'Mañana';
    return parseIso(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function setDate(iso) {
    dateValue = iso;
    dateLabel.textContent = dateText(iso);
  }

  const datePopover = createPopover(datePicker, {
    onOpen() {
      const selected = parseIso(dateValue);
      dateView = new Date(selected.getFullYear(), selected.getMonth(), 1);
      renderCalendar();
    }
  });
  datePopover.focusInitial = () => {
    (calCells.find(cell => cell.getAttribute('aria-pressed') === 'true') || calNext).focus({ preventScroll: true });
  };

  calPrev.addEventListener('click', () => {
    dateView = new Date(dateView.getFullYear(), dateView.getMonth() - 1, 1);
    renderCalendar();
  });
  calNext.addEventListener('click', () => {
    dateView = new Date(dateView.getFullYear(), dateView.getMonth() + 1, 1);
    renderCalendar();
  });
  calGrid.addEventListener('click', event => {
    const cell = event.target.closest('.cal-day');
    if (!cell || cell.disabled || !cell.dataset.date) return;
    setDate(cell.dataset.date);
    datePopover.close({ focusButton: true });
  });

  // ---------- Hora: dos columnas (horas y minutos) ----------

  const timePicker = document.getElementById('time-picker');
  const timeLabel = timePicker.querySelector('.custom-select-value');
  const timeMenu = timePicker.querySelector('.custom-select-menu');
  let timeValue = '';            // 'HH:MM' o '' (todo el día)

  const allDayButton = document.createElement('button');
  allDayButton.type = 'button';
  allDayButton.className = 'time-allday';
  allDayButton.textContent = 'Todo el día';

  function timeColumn(label, values, part) {
    const wrap = document.createElement('div');
    wrap.className = 'time-col';
    const head = document.createElement('span');
    head.className = 'time-col__head';
    head.textContent = label;
    const list = document.createElement('div');
    list.className = 'time-col__list';
    for (const value of values) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'time-option';
      option.dataset.part = part;
      option.dataset.value = value;
      option.textContent = value;
      list.append(option);
    }
    wrap.append(head, list);
    return { wrap, list, options: [...list.children] };
  }

  const hourColumn = timeColumn('Hora', Array.from({ length: 24 }, (_, h) => pad2(h)), 'h');
  const minuteColumn = timeColumn('Min', ['00', '15', '30', '45'], 'm');
  const timeColumns = document.createElement('div');
  timeColumns.className = 'time-cols';
  timeColumns.append(hourColumn.wrap, minuteColumn.wrap);
  timeMenu.append(allDayButton, timeColumns);

  function setTime(value) {
    timeValue = value;
    timeLabel.textContent = value || 'Todo el día';
    timePicker.querySelector('.custom-select-btn').classList.toggle('has-value', Boolean(value));
    const [h, m] = value ? value.split(':') : ['', ''];
    hourColumn.options.forEach(o => o.setAttribute('aria-pressed', String(o.dataset.value === h)));
    minuteColumn.options.forEach(o => o.setAttribute('aria-pressed', String(o.dataset.value === m)));
    allDayButton.setAttribute('aria-pressed', String(!value));
  }

  const timePopover = createPopover(timePicker);
  timePopover.focusInitial = () => {
    // Sin hora elegida, la columna se abre por la hora actual.
    const hour = timeValue ? timeValue.slice(0, 2) : pad2(new Date().getHours());
    const option = hourColumn.options.find(o => o.dataset.value === hour);
    centerInColumn(hourColumn.list, option);
    (timeValue ? option : allDayButton).focus({ preventScroll: true });
  };

  // Hora: se marca y el menú sigue abierto para elegir minutos (si aún no
  // había, :00). Minutos: se marca y se cierra. "Todo el día": sin hora.
  timeMenu.addEventListener('click', event => {
    if (event.target === allDayButton) {
      setTime('');
      timePopover.close({ focusButton: true });
      return;
    }
    const option = event.target.closest('.time-option');
    if (!option) return;
    const [h, m] = timeValue ? timeValue.split(':') : [pad2(new Date().getHours()), '00'];
    if (option.dataset.part === 'h') {
      setTime(`${option.dataset.value}:${m}`);
    } else {
      setTime(`${h}:${option.dataset.value}`);
      timePopover.close({ focusButton: true });
    }
  });

  const isSheetOpen = () => app.classList.contains('is-sheet-open');

  function setSheetError(text) {
    sheetError.textContent = text;
    sheetError.hidden = !text;
  }

  function openSheet(kind, opener) {
    const text = SHEET_TEXT[kind];
    sheetKind = kind;
    sheetOpener = opener;
    sheet.reset();
    sheetTitle.textContent = text.title;
    sheetName.placeholder = text.name;
    sheetSubmit.textContent = text.submit;
    sheetSubmit.disabled = false;
    setSheetError('');
    closePopovers();
    setSubject('');
    setDate(isoDate(new Date()));
    setTime('');

    sheet.inert = false;
    tasksView.inert = true; // la lista de detrás no recibe foco ni clics
    app.classList.add('is-sheet-open');
    // Foco al nombre sin que el navegador desplace nada mientras sube la hoja.
    clearTimeout(sheetFocusTimer);
    sheetFocusTimer = setTimeout(() => sheetName.focus({ preventScroll: true }), 200);
  }

  function closeSheet() {
    if (!isSheetOpen()) return;
    clearTimeout(sheetFocusTimer);
    closePopovers();
    app.classList.remove('is-sheet-open'); // revierte hoja, zoom y desenfoque
    sheet.inert = true;
    if (currentView() === 'tasks') tasksView.inert = false;
    sheetOpener?.focus({ preventScroll: true });
  }

  sheet.addEventListener('submit', async event => {
    event.preventDefault();
    if (sheetSubmit.disabled) return; // ya se está guardando

    const title = sheetName.value.trim();
    if (!title) {
      setSheetError('Escribe un nombre');
      sheetName.focus({ preventScroll: true });
      return;
    }
    const item = {
      uid: `custom-${crypto.randomUUID()}`,
      title: title.slice(0, CUSTOM_LIMITS.title),
      subject: subjectValue,
      date: dateValue,
      time: timeValue,
      description: sheetDesc.value.trim().slice(0, CUSTOM_LIMITS.description),
      created: new Date().toISOString()
    };
    if (customToEvent(item).end < new Date()) {
      setSheetError('Esa hora ya ha pasado');
      timePopover.button.focus({ preventScroll: true });
      return;
    }

    sheetSubmit.disabled = true;
    setSheetError('');
    // Una sola fuente de verdad: aquí solo se guarda. Quien actualiza la
    // lista es chrome.storage.onChanged (más abajo), que en Chrome puede
    // llegar incluso antes de que termine este await; si además se añadiera
    // aquí a mano, el elemento saldría dos veces.
    justAddedUid = item.uid; // lo recoge ese repintado para animar la entrada
    try {
      await addCustomItem(sheetKind, item);
    } catch (error) {
      // No se cierra: lo escrito sigue ahí para reintentar.
      justAddedUid = null;
      setSheetError(`No se pudo guardar (${error.message})`);
      sheetSubmit.disabled = false;
      return;
    }
    closeSheet();
    // Si la lista aún estaba cargando, esa carga leyó las propias antes de
    // guardar esta: se recarga para no perderla de vista.
    if (!listLoaded) loadTasks();
  });

  document.getElementById('btn-add-task').addEventListener('click', event => openSheet('task', event.currentTarget));
  document.getElementById('btn-add-event').addEventListener('click', event => openSheet('event', event.currentTarget));
  sheet.querySelector('.js-sheet-close').addEventListener('click', closeSheet);
  sheetBackdrop.addEventListener('click', closeSheet);
  const tasksStatus = document.getElementById('tasks-status');
  const tasksSettings = document.getElementById('tasks-settings');
  const icsInput = document.getElementById('ics-url');
  const icsCancel = document.getElementById('ics-cancel');
  const icsClear = document.getElementById('ics-clear');

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
    progressRing.hidden = true;
    taskFilters.hidden = true;
    customActions.hidden = true;
    tasksSettings.hidden = true;
    icsInput.value = currentUrl;
    icsCancel.hidden = !currentUrl;
    icsClear.hidden = !currentUrl;
    setTasksStatus(currentUrl ? 'Cambia o borra el enlace' : 'Sin calendario configurado');
  }

  function showList() {
    tasksSetup.hidden = true;
    tasksList.hidden = false;
    progressRing.hidden = false;
    taskFilters.hidden = false;
    // Recién mostrada ya tiene medidas reales: se coloca el slider sin animar.
    updateFilterSlider(taskFilters.querySelector('.filter-pill.is-active'), { animate: false });
    customActions.hidden = false;
    tasksSettings.hidden = false;
  }

  // Tareas marcadas como hechas: UIDs del .ics en chrome.storage.sync, para
  // que se compartan entre los ordenadores con la misma cuenta de Chrome.
  let completed = new Set();
  let loadedAt = '';

  async function saveCompleted() {
    try {
      await writeCompleted(completed);
    } catch (error) {
      setTasksStatus(`No se pudo sincronizar (${error.message})`, true);
    }
  }

  function updateTasksCount() {
    const pending = tasksList.querySelectorAll('.task:not(.task--completed):not(.is-expired)').length;
    setTasksStatus(`${pending} ${pending === 1 ? 'pendiente' : 'pendientes'} · ${loadedAt}`);
    updateProgressRing(); // siempre a la par que el contador
  }

  // ---------- Anillo de progreso ----------

  const progressRing = document.getElementById('progress-ring');

  /**
   * % de tareas hechas en el trazo verde: cuenta TODOS los .task pintados (los
   * pasados, .is-expired, también) y como hecha la que tiene .task--completed
   * o la casilla marcada. offset = 88 − porcentaje × 88: 88 = vacío, 0 = lleno.
   */
  function updateProgressRing() {
    const ringFill = document.querySelector('.progress-ring__fill');
    if (!ringFill) return;
    const tasks = [...document.querySelectorAll('#tasks-list .task')];
    if (tasks.length === 0) {
      ringFill.style.strokeDashoffset = '88';
      progressRing.title = 'Sin tareas';
      return;
    }
    const completed = tasks.filter(t => t.classList.contains('task--completed') || t.querySelector('.task__check').checked).length;
    const percent = completed / tasks.length;
    ringFill.style.strokeDashoffset = String(88 - (percent * 88));
    // Mismo recuento en el texto que sale al pasar el ratón por el anillo.
    progressRing.title = `${completed} de ${tasks.length} hechas (${Math.round(percent * 100)} %)`;
  }

  /**
   * Refleja `completed` en los li ya pintados: solo clases y checked, sin
   * reconstruir. Al pintar la lista (animate = false) se aplica de golpe; si
   * llega un cambio de otro ordenador (animate = true), cada tarea que cambia
   * hace la misma animación que al marcarla a mano.
   */
  function applyCompleted({ animate = false } = {}) {
    for (const li of tasksList.querySelectorAll('.task')) {
      const done = completed.has(li.dataset.uid);
      const check = li.querySelector('.task__check');
      if (check.checked !== done) check.checked = done;
      if (li.classList.contains('task--completed') === done) continue;
      if (animate) startTaskToggle(li, done);
      else li.classList.toggle('task--completed', done);
    }
    updateTasksCount();
  }

  let loadSeq = 0;

  // Lo último cargado, para volver a pintar sin descargar el .ics otra vez
  // (al crear un elemento propio o al llegar un cambio de otro ordenador).
  let moodleUpcoming = [];
  let customItems = [];
  let listLoaded = false;
  let justAddedUid = null;

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
    listLoaded = false;

    // Si el .ics falla, las tareas propias se siguen mostrando.
    const [calendar, customs] = await Promise.allSettled([fetchCalendar(url), readCustomItems()]);
    if (seq !== loadSeq) return; // hubo otra carga (o un cambio de enlace) mientras tanto

    customItems = customs.status === 'fulfilled' ? customs.value : [];
    let done;
    if (calendar.status === 'fulfilled') {
      moodleUpcoming = calendar.value.upcoming;
      done = calendar.value.done;
      // Olvida las completadas que ya no están ni en el calendario ni entre
      // las propias: así la lista guardada no crece sin límite (8 KB por clave).
      const known = new Set([...calendar.value.uids, ...customItems.map(item => item.uid)]);
      completed = new Set([...done].filter(uid => known.has(uid)));
      if (completed.size !== done.size) saveCompleted();
    } else {
      moodleUpcoming = [];
      try {
        completed = await readCompleted();
      } catch {
        completed = new Set();
      }
      if (seq !== loadSeq) return;
    }

    loadedAt = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    listLoaded = true;
    renderAll();
    if (calendar.status === 'rejected') {
      setTasksStatus(`No se pudo cargar (${calendar.reason.message})`, true);
    }
  }

  /**
   * Moodle + propias, por fecha. Las propias que ya pasaron no desaparecen:
   * van tachadas al final (ver .is-expired). Siempre se pinta desde estos
   * arrays, y renderTasks vacía la lista antes (replaceChildren).
   */
  function renderAll() {
    const events = [...moodleUpcoming, ...listCustomEvents(customItems)]
      .sort((a, b) => a.start - b.start);
    let visible = applyTaskFilter(events);
    // Lo recién creado no puede quedar oculto por el filtro (p. ej. una tarea
    // para mañana creada estando en "Hoy"): se vuelve a "Todo" para verla.
    if (justAddedUid && currentTaskFilter !== 'all' && !visible.some(e => e.uid === justAddedUid)) {
      setTaskFilter('all');
      visible = events;
    }
    renderTasks(visible);
  }

  // ---------- Filtros en píldora ----------

  const TASK_FILTER_KEY = 'clase-task-filter';
  const taskFilters = document.getElementById('task-filters');
  const filterPills = [...taskFilters.querySelectorAll('.filter-pill')];
  const filterSlider = document.getElementById('filter-slider');
  let currentTaskFilter = 'all';

  /**
   * Coloca el slider trasero bajo el botón activo. offsetLeft/offsetWidth son
   * medidas de layout (no de transform), así que valen aunque la vista esté
   * desplazada fuera de pantalla. La primera colocación y las de
   * `animate: false` (mostrar la barra, cambios de tamaño) son de golpe; solo
   * al cambiar de filtro se desliza.
   */
  function updateFilterSlider(activeButton, { animate = true } = {}) {
    if (!activeButton || !filterSlider) return;
    const width = activeButton.offsetWidth;
    if (!width) return; // barra oculta: se colocará al mostrarse (ResizeObserver, showList)
    const transform = `translateX(${activeButton.offsetLeft}px)`;
    const widthPx = `${width}px`;
    if (filterSlider.style.transform === transform && filterSlider.style.width === widthPx) return;
    const instant = !animate || !filterSlider.style.width;
    if (instant) filterSlider.style.transition = 'none';
    filterSlider.style.transform = transform;
    filterSlider.style.width = widthPx;
    if (instant) {
      void filterSlider.offsetWidth; // aplica la posición antes de reactivar la transición
      filterSlider.style.transition = '';
    }
    // Si la barra desborda (pantalla estrecha, zoom), que el activo se vea.
    if (taskFilters.scrollWidth > taskFilters.clientWidth) {
      const left = activeButton.offsetLeft - 3;
      const right = activeButton.offsetLeft + width + 3;
      const view = taskFilters.scrollLeft + taskFilters.clientWidth;
      const target = left < taskFilters.scrollLeft ? left : right > view ? right - taskFilters.clientWidth : null;
      if (target !== null) taskFilters.scrollTo({ left: target, behavior: instant ? 'auto' : 'smooth' });
    }
  }

  const activeFilterPill = () => taskFilters.querySelector('.filter-pill.is-active');

  // Si cambia el tamaño de la barra (se muestra, carga la fuente...), el
  // slider se recoloca sin animar.
  new ResizeObserver(() => updateFilterSlider(activeFilterPill(), { animate: false })).observe(taskFilters);

  // También sirve de lista de filtros válidos (ver setTaskFilter).
  const EMPTY_TEXT = {
    all: 'No hay tareas próximas. ¡Todo al día!',
    today: 'Nada para hoy. ¡Disfruta!',
    week: 'Nada para esta semana. ¡Qué calma!',
    events: 'Sin eventos. Crea uno con + Evento.'
  };

  /** Mismo día (año, mes y día) que hoy, sin mirar la hora. */
  function isToday(date, now = new Date()) {
    return date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
  }

  /**
   * Semana natural de `now`: [lunes 00:00, lunes siguiente 00:00). El domingo
   * es getDay() = 0 y cuenta como último día (hay que retroceder 6 días, no
   * avanzar 1). Los días se suman con el constructor de Date, que respeta los
   * cambios de hora de verano; el fin es exclusivo, así que no deja hueco
   * entre el domingo 23:59:59 y el lunes.
   */
  function weekRange(now = new Date()) {
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0);
    const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7, 0, 0, 0);
    return [monday, nextMonday];
  }

  /**
   * - all: todo.
   * - today: lo que es hoy (por fecha de inicio).
   * - week: lo que empieza entre el lunes y el domingo de esta semana.
   * - events: los eventos propios. El .ics de Moodle no distingue entregas
   *   de eventos (solo trae título y curso), así que sus elementos no entran.
   */
  function applyTaskFilter(events) {
    if (currentTaskFilter === 'today') {
      const now = new Date();
      return events.filter(event => isToday(event.start, now));
    }
    if (currentTaskFilter === 'week') {
      const [monday, nextMonday] = weekRange();
      return events.filter(event => event.start >= monday && event.start < nextMonday);
    }
    if (currentTaskFilter === 'events') return events.filter(event => event.kind === 'event');
    return events;
  }

  /** Marca la píldora activa (clase + aria-pressed) y recuerda el filtro. */
  function setTaskFilter(filter) {
    currentTaskFilter = filter in EMPTY_TEXT ? filter : 'all';
    for (const pill of filterPills) {
      const active = pill.dataset.filter === currentTaskFilter;
      pill.classList.toggle('is-active', active);
      pill.setAttribute('aria-pressed', String(active));
    }
    // Todos los caminos (clic, filtro recordado, "Todo" al crear algo) pasan
    // por aquí, así que el slider los sigue a todos.
    updateFilterSlider(activeFilterPill());
    try {
      localStorage.setItem(TASK_FILTER_KEY, currentTaskFilter);
    } catch {}
  }

  // Al reabrir el popup, el último filtro usado.
  try {
    setTaskFilter(localStorage.getItem(TASK_FILTER_KEY) || 'all');
  } catch {}

  taskFilters.addEventListener('click', event => {
    const pill = event.target.closest('.filter-pill');
    if (!pill || pill.dataset.filter === currentTaskFilter) return;
    setTaskFilter(pill.dataset.filter);
    if (!listLoaded) return; // aún cargando: la carga ya pintará con este filtro
    renderAll();
    // Fundido corto de la lista nueva (reinicia la animación).
    tasksList.classList.remove('is-switching');
    void tasksList.offsetWidth;
    tasksList.classList.add('is-switching');
    tasksList.scrollTop = 0;
  });
  tasksList.addEventListener('animationend', event => {
    if (event.target === tasksList) tasksList.classList.remove('is-switching');
  });

  /** Pinta la lista una vez por carga; marcar tareas después no la reconstruye. */
  function renderTasks(events) {
    if (!events.length) {
      const empty = document.createElement('li');
      empty.className = 'tasks-empty';
      empty.textContent = EMPTY_TEXT[currentTaskFilter];
      tasksList.replaceChildren(empty);
      updateTasksCount();
      return;
    }

    const now = new Date();
    const items = events.map(event => {
      const li = document.createElement('li');
      li.className = 'task' + (event.kind === 'event' ? ' task--event' : '') + (event.expired ? ' is-expired' : '');
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
      when.textContent = event.expired ? 'Pasó' : minutes <= 0 ? 'Ahora' : formatUntil(minutes);
      when.classList.toggle('is-soon', !event.expired && minutes < 24 * 60);

      li.title = [event.summary, event.start.toLocaleString('es-ES'), event.description].filter(Boolean).join('\n');
      const focusBtn = FOCUS_ICON.cloneNode(true);
      focusBtn.setAttribute('aria-label', `Modo enfoque: ${event.summary}`);
      focusBtn.title = 'Modo enfoque (25 min)';

      li.append(check, date, body, when, focusBtn);
      return li;
    });
    tasksList.replaceChildren(...items);
    applyCompleted();

    // El elemento recién creado entra con la misma animación que al moverse.
    const added = justAddedUid && items.find(li => li.dataset.uid === justAddedUid);
    justAddedUid = null;
    if (added) {
      added.classList.add('is-entering');
      added.addEventListener('animationend', () => added.classList.remove('is-entering'), { once: true });
      added.scrollIntoView({ block: 'nearest' });
    }
  }

  // Al marcar, la tarea no se teletransporta: sale (.is-exiting, 200 ms),
  // cambia de `order` mientras es invisible (las demás se deslizan a su
  // hueco) y entra ya en su sitio (.is-entering, 300 ms).
  const TASK_EXIT_MS = 200;
  const TASK_ENTER_MS = 300;
  const taskTimers = new WeakMap();

  // Antes de moverse, la tarea se queda 300 ms en su sitio mostrando el
  // cambio (.is-completing / .is-uncompleting): relleno, check y texto.
  const CHECK_SHOW_MS = 300;

  /** Empieza el cambio visual de una tarea y la mueve al acabar. */
  function startTaskToggle(li, done) {
    li.classList.toggle('is-completing', done);
    li.classList.toggle('is-uncompleting', !done);
    moveTask(li, CHECK_SHOW_MS);
  }

  function moveTask(li, delay = 0) {
    clearTimeout(taskTimers.get(li));
    li.classList.remove('is-entering');
    // Vuelta atrás antes de empezar a salir: ya está en su sitio, no se mueve.
    const done = completed.has(li.dataset.uid);
    if (!li.classList.contains('is-exiting') && li.classList.contains('task--completed') === done) {
      li.classList.remove('is-completing', 'is-uncompleting');
      return;
    }
    if (delay) {
      taskTimers.set(li, setTimeout(() => moveTask(li), delay));
      return;
    }
    li.classList.add('is-exiting');
    taskTimers.set(li, setTimeout(() => {
      const others = [...tasksList.children].filter(item => item !== li);
      flipReorder(others, () => {
        // Estado actual (por si se volvió a marcar o llegó un cambio de sync).
        li.classList.toggle('task--completed', completed.has(li.dataset.uid));
        li.classList.remove('is-completing', 'is-uncompleting');
      });
      li.classList.remove('is-exiting');
      li.classList.add('is-entering');
      updateTasksCount();
      taskTimers.set(li, setTimeout(() => li.classList.remove('is-entering'), TASK_ENTER_MS));
    }, TASK_EXIT_MS));
  }

  tasksList.addEventListener('animationend', event => event.target.classList.remove('is-popping'));

  // Botón de enfoque de cada tarea (delegado): empieza un pomodoro sobre ella.
  tasksList.addEventListener('click', event => {
    const button = event.target.closest('.task__focus-btn');
    if (!button) return;
    const li = button.closest('.task');
    beginFocus(li.querySelector('.task__title').textContent, li.dataset.uid);
  });

  // Un solo listener para todas las casillas (delegación de eventos).
  tasksList.addEventListener('change', event => {
    const check = event.target;
    if (!check.matches('.task__check')) return;
    const li = check.closest('.task');
    if (check.checked) {
      completed.add(li.dataset.uid);
      check.classList.add('is-popping');
    } else {
      completed.delete(li.dataset.uid);
    }
    startTaskToggle(li, check.checked);
    updateProgressRing(); // el anillo avanza a la vez que se rellena la casilla
    // Se guarda ya (no tras los 300 ms): si el popup se cierra justo después,
    // el cambio no se pierde. Su eco en onChanged no toca la lista (abajo).
    saveCompleted();
  });

  // Si se marca una tarea en otro ordenador, se refleja aquí sin recargar.
  // (Fuera de la extensión, p. ej. abriendo popup.html a mano, no hay chrome.storage.)
  globalThis.chrome?.storage?.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes[IPE_DONE_KEY]) {
      ipeDoneFor = changes[IPE_DONE_KEY].newValue || '';
      applyIpeDone();
    }
    if (changes[DONE_KEY]) {
      const next = new Set(changes[DONE_KEY].newValue || []);
      // Eco de lo que se acaba de guardar aquí: el estado ya es ese y la
      // animación en curso no se corta. Solo se aplica si viene de fuera.
      const same = next.size === completed.size && [...next].every(uid => completed.has(uid));
      if (!same) {
        completed = next;
        applyCompleted({ animate: true });
      }
    }
    if (Object.values(CUSTOM_KEYS).some(key => changes[key])) {
      const next = mergeCustomChanges(customItems, changes);
      // Si es el eco de lo que acabamos de guardar aquí, no se repinta (se
      // cortaría la animación de entrada del elemento nuevo).
      const key = items => JSON.stringify(items.map(i => i.uid).sort());
      const changed = key(next) !== key(customItems);
      customItems = next;
      if (changed && listLoaded) renderAll();
    }
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
    if (isSheetOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Primero se cierra el desplegable si está abierto; luego, la hoja.
        const popover = openPopover();
        if (popover) popover.close({ focusButton: true });
        else closeSheet();
      }
      return; // con la hoja abierta, las teclas son para sus campos
    }
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

  renderMenu(); // el menú se pinta siempre: es a donde vuelve "‹ Menú"
  startIPECountdown();
  loadIpeDone();
  restoreLastView();
  verifyFocusSession();
})();

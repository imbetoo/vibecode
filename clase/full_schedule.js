(() => {
  const grid = document.getElementById('week-grid');
  const HEADER_ROWS = 1;

  const now = new Date();
  const weekday = now.getDay();
  const todayCol = weekday >= 1 && weekday <= 5 ? weekday - 1 : null;

  document.getElementById('page-date').textContent = now.toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const slotCount = Math.max(...WEEK.map(visibleSlotCount));
  const slots = TIME_SLOTS.slice(0, slotCount);
  const row = slotId => slotRow(slotId) + HEADER_ROWS;
  const dayColumn = index => index + 2;

  // Filas: cabecera, tramos y el hueco del recreo. Los tramos crecen si un
  // nombre largo necesita más alto, así nunca se corta el texto.
  const rows = ['auto', ...slots.map(() => 'minmax(var(--row-h), auto)')];
  if (slots.length > BREAK.afterSlot) rows.splice(BREAK.afterSlot + HEADER_ROWS, 0, 'var(--break-h)');
  grid.style.gridTemplateRows = rows.join(' ');

  const fragment = document.createDocumentFragment();

  function add(el, rowStart, rowEnd, col) {
    el.style.gridRow = rowEnd ? `${rowStart} / ${rowEnd}` : String(rowStart);
    if (col) el.style.gridColumn = String(col);
    fragment.append(el);
    return el;
  }

  function div(className, text) {
    const el = document.createElement('div');
    el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  // Cabecera
  add(div('corner'), 1, null, 1);
  const dates = weekDates(now);
  WEEK.forEach((day, i) => {
    const head = div('day-head' + (i === todayCol ? ' is-today' : ''));
    const pill = document.createElement('span');
    pill.className = 'day-head__pill';
    pill.title = dates[i].toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const name = document.createElement('span');
    name.textContent = day.name;
    const num = document.createElement('span');
    num.className = 'day-head__num';
    num.textContent = String(dates[i].getDate());
    pill.append(name, num);
    head.append(pill);
    add(head, 1, null, dayColumn(i));
  });

  // Columna de horas
  slots.forEach(slot => {
    const pill = div('time-pill');
    const start = document.createElement('span');
    start.textContent = formatTime(slot.start);
    const end = document.createElement('span');
    end.className = 'time-pill__end';
    end.textContent = formatTime(slot.end);
    pill.append(start, end);
    add(pill, row(slot.id), null, 1);
  });

  // Recreo: al pasar el ratón aparece la etiqueta "// DESCANSO".
  if (slots.length > BREAK.afterSlot) {
    const breakRow = div('break-row');
    const label = document.createElement('span');
    label.className = 'break-row__label';
    label.textContent = `Recreo · ${formatTime(BREAK.start)} – ${formatTime(BREAK.end)}`;
    const tag = document.createElement('span');
    tag.className = 'break-row__tag';
    tag.setAttribute('aria-hidden', 'true');
    tag.textContent = '// DESCANSO';
    label.append(tag);
    breakRow.append(label);
    add(breakRow, BREAK.afterSlot + 1 + HEADER_ROWS);
  }

  // Bloques de asignaturas y huecos libres. Se guardan los contadores de
  // tareas de cada asignatura y los huecos del final de cada día, para
  // rellenarlos cuando llegue el calendario de Moodle (sin reconstruir nada).
  const taskCounters = [];            // { code, el }
  const trailingCells = WEEK.map(() => []);

  WEEK.forEach((day, i) => {
    const col = dayColumn(i);
    const covered = new Set();
    const lastClass = Math.max(0, ...Object.keys(day.classes).map(Number));

    groupDay(day).forEach(block => {
      const subject = SUBJECTS[block.code] || { name: block.code, color: '#8e8e93' };
      const el = div('subject-block');
      el.style.background = subject.color;
      el.style.color = textColorFor(subject.color);
      el.classList.toggle('is-light', luminanceOf(subject.color) > 0.35);

      const first = TIME_SLOTS.find(s => s.id === block.from);
      const last = TIME_SLOTS.find(s => s.id === block.to);
      el.title = `${subject.name} · ${formatTime(first.start)} – ${formatTime(last.end)}`;
      el.append(div('subject-block__name', subject.name));
      el.append(div('subject-block__meta', `${block.code} · ${formatTime(first.start)}–${formatTime(last.end)}`));
      const counter = div('subject-block__tasks');
      counter.hidden = true;
      el.append(counter);
      taskCounters.push({ code: block.code, el: counter });

      add(el, row(block.from), row(block.to) + 1, col);
      for (let id = block.from; id <= block.to; id++) covered.add(id);
    });

    slots.forEach(slot => {
      if (covered.has(slot.id)) return;
      const cell = add(div('empty-cell'), row(slot.id), null, col);
      if (slot.id > lastClass) trailingCells[i].push(cell);
    });
  });

  grid.replaceChildren(fragment);

  // Leyenda: pastilla que al pasar el ratón se abre con profesor y periodos.
  const legend = document.getElementById('legend-list');
  Object.entries(SUBJECTS).forEach(([code, subject]) => {
    const item = document.createElement('li');
    item.className = 'legend-item';
    item.tabIndex = 0;

    const makeHead = () => {
      const head = div('legend-head');
      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      swatch.style.background = subject.color;
      const name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = subject.name;
      const headCode = document.createElement('span');
      headCode.className = 'legend-code';
      headCode.textContent = code;
      head.append(swatch, name, headCode);
      return head;
    };

    // Copia invisible que reserva el hueco de la pastilla en el flujo.
    const sizer = div('legend-sizer');
    sizer.setAttribute('aria-hidden', 'true');
    sizer.append(makeHead());

    const card = div('legend-card');
    const details = div('legend-details');
    details.append(div('legend-teacher', subject.teacher || 'Por asignar'));
    if (subject.periods) {
      const remaining = Math.max(0, subject.periods - periodsDoneThisWeek(code, now));
      const periods = div('legend-periods');
      periods.append(
        `${subject.periods} ${subject.periods === 1 ? 'periodo semanal' : 'periodos semanais'},`,
        document.createElement('br'),
        `${remaining} ${remaining === 1 ? 'restante' : 'restantes'} `
      );
      const detailCode = document.createElement('span');
      detailCode.className = 'legend-code';
      detailCode.textContent = ` ${code}`;
      periods.append(detailCode);
      details.append(periods);
    }

    card.append(makeHead(), details);
    item.append(sizer, card);
    legend.append(item);
  });

  // ---------- Tareas del Aula Virtual ----------

  const norm = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Códigos más largos primero, para que uno corto no gane a otro que lo contiene.
  const CODES = Object.keys(SUBJECTS)
    .map(code => [code, norm(code)])
    .sort((a, b) => b[1].length - a[1].length);

  /** Asignatura de un evento de Moodle según su categoría (curso) o su título. */
  function subjectOf(event) {
    const haystack = norm(`${event.category} ${event.summary}`);
    const match = CODES.find(([, key]) => haystack.includes(key));
    return match ? match[0] : null;
  }

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const timeText = event => event.allDay
    ? 'Todo el día'
    : event.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  /** Actualiza texto y visibilidad de un elemento solo si cambian. */
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  /** Mete (o quita) una tarea en un hueco libre; el bloque se crea una sola vez. */
  function setSlotTask(cell, title, meta, tooltip) {
    let slot = cell.querySelector('.task-in-slot');
    if (!title) {
      if (slot) slot.hidden = true;
      cell.classList.remove('has-task');
      return;
    }
    if (!slot) {
      slot = div('task-in-slot');
      const body = div('task-in-slot__body');
      body.append(div('task-in-slot__title'), div('task-in-slot__meta'));
      const check = document.createElement('span');
      check.className = 'task-in-slot__check';
      check.setAttribute('aria-hidden', 'true');
      slot.append(body, check);
      cell.append(slot);
    }
    setText(slot.querySelector('.task-in-slot__title'), title);
    setText(slot.querySelector('.task-in-slot__meta'), meta);
    slot.title = tooltip;
    slot.hidden = false;
    cell.classList.add('has-task');
  }

  let upcoming = [];
  let completed = new Set();

  function applyTasks() {
    const pending = upcoming.filter(event => !completed.has(event.uid));

    // Contador amarillo de cada bloque: tareas pendientes de su asignatura.
    const perSubject = {};
    for (const event of pending) {
      const code = subjectOf(event);
      if (code) perSubject[code] = (perSubject[code] || 0) + 1;
    }
    for (const { code, el } of taskCounters) {
      const n = perSubject[code] || 0;
      setText(el, `${n} ${n === 1 ? 'tarea pendiente' : 'tareas pendientes'}`);
      if (el.hidden !== !n) el.hidden = !n;
    }

    // Huecos del final de cada día: las tareas que vencen ese día.
    WEEK.forEach((day, i) => {
      const cells = trailingCells[i];
      const due = pending.filter(event => sameDay(event.start, dates[i]));
      cells.forEach((cell, k) => {
        const event = due[k];
        if (!event) return setSlotTask(cell, null);
        const overflow = due.length - cells.length;
        if (k === cells.length - 1 && overflow > 0) {
          return setSlotTask(cell, `${overflow + 1} tareas más`, `${day.name} · desde ${timeText(event)}`,
            due.slice(k).map(e => e.summary).join('\n'));
        }
        setSlotTask(cell, event.summary, `${day.name} ${timeText(event)}`,
          `${event.summary}\n${event.start.toLocaleString('es-ES')}`);
      });
    });
  }

  async function loadTasks() {
    try {
      const url = await getIcsUrl();
      if (!url) return;
      const calendar = await fetchCalendar(url);
      upcoming = calendar.upcoming;
      completed = calendar.done;
      applyTasks();
    } catch {
      // Sin enlace, sin red o fuera de la extensión: el horario sigue sin tareas.
    }
  }

  // Si se marca una tarea en el popup (o en otro ordenador), se refleja aquí.
  globalThis.chrome?.storage?.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[DONE_KEY]) {
      completed = new Set(changes[DONE_KEY].newValue || []);
      applyTasks();
    } else if (area === 'local' && changes[ICS_KEY]) {
      upcoming = [];
      applyTasks();
      loadTasks();
    }
  });

  loadTasks();

  // ---------- Reloj y cuenta atrás hasta el fin de las clases ----------

  const clock = document.getElementById('header-clock');
  const countdown = document.getElementById('header-countdown');

  /** Fin de las clases de un día: el final de su último tramo con clase. */
  function classesEnd(day, date) {
    const last = Math.max(...Object.keys(day.classes).map(Number));
    return at(date, TIME_SLOTS.find(s => s.id === last).end);
  }

  function classesStart(day, date) {
    const first = Math.min(...Object.keys(day.classes).map(Number));
    return at(date, TIME_SLOTS.find(s => s.id === first).start);
  }

  function at(date, time) {
    const [h, m] = time.split(':').map(Number);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
  }

  /** "Quedan 1 hora y 46 minutos." / "Queda 1 minuto." */
  function remainingText(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const parts = [];
    if (h) parts.push(`${h} ${h === 1 ? 'hora' : 'horas'}`);
    if (m) parts.push(`${m} ${m === 1 ? 'minuto' : 'minutos'}`);
    const singular = parts.length === 1 && (h || m) === 1;
    return `${singular ? 'Queda' : 'Quedan'} ${parts.join(' y ')}.`;
  }

  function countdownText(now) {
    const d = now.getDay();
    const day = WEEK[d - 1];
    if (!day || !Object.keys(day.classes).length) return 'Hoy no hay clases.';
    const start = classesStart(day, now);
    const end = classesEnd(day, now);
    if (now < start) return `Las clases empiezan a las ${start.getHours()}:${String(start.getMinutes()).padStart(2, '0')}.`;
    if (now >= end) return 'Clases terminadas por hoy.';
    return remainingText(Math.ceil((end - now) / 60000));
  }

  // Reloj en tres bloques (hh:mm:ss) creados una sola vez. Cada segundo solo
  // se toca el textContent del bloque que cambia y se le pone .tick para la
  // animación de entrada; animationend la quita para el siguiente cambio.
  const clockParts = ['clock-h', 'clock-m', 'clock-s'].map((id, i) => {
    const part = document.createElement('span');
    part.id = id;
    part.className = 'clock-part';
    part.addEventListener('animationend', () => part.classList.remove('tick'));
    if (i) {
      const sep = document.createElement('span');
      sep.className = 'clock-sep';
      sep.textContent = ':';
      clock.append(sep);
    }
    clock.append(part);
    return part;
  });

  const pad = n => String(n).padStart(2, '0');

  function renderClock(now, animate) {
    [now.getHours(), now.getMinutes(), now.getSeconds()].forEach((value, i) => {
      const part = clockParts[i];
      const text = pad(value);
      if (part.textContent === text) return;
      part.textContent = text;
      if (animate) part.classList.add('tick');
    });
  }

  // Cada segundo, alineado al cambio de segundo.
  function tick(animate = true) {
    const now = new Date();
    renderClock(now, animate);
    setText(countdown, countdownText(now));
    setTimeout(tick, 1000 - (Date.now() % 1000));
  }
  tick(false); // la primera pintura, sin animación
})();

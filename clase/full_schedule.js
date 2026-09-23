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

  // Recreo
  if (slots.length > BREAK.afterSlot) {
    const breakRow = div('break-row', `Recreo · ${formatTime(BREAK.start)} – ${formatTime(BREAK.end)}`);
    add(breakRow, BREAK.afterSlot + 1 + HEADER_ROWS);
  }

  // Bloques de asignaturas y huecos libres
  WEEK.forEach((day, i) => {
    const col = dayColumn(i);
    const covered = new Set();

    groupDay(day).forEach(block => {
      const subject = SUBJECTS[block.code] || { name: block.code, color: '#8e8e93' };
      const el = div('subject-block');
      el.style.background = subject.color;
      el.style.color = textColorFor(subject.color);

      const first = TIME_SLOTS.find(s => s.id === block.from);
      const last = TIME_SLOTS.find(s => s.id === block.to);
      el.title = `${subject.name} · ${formatTime(first.start)} – ${formatTime(last.end)}`;
      el.append(div('subject-block__name', subject.name));
      el.append(div('subject-block__meta', `${block.code} · ${formatTime(first.start)}–${formatTime(last.end)}`));

      add(el, row(block.from), row(block.to) + 1, col);
      for (let id = block.from; id <= block.to; id++) covered.add(id);
    });

    slots.forEach(slot => {
      if (!covered.has(slot.id)) add(div('empty-cell'), row(slot.id), null, col);
    });
  });

  grid.replaceChildren(fragment);

  // Leyenda: pastilla que al pasar el ratón se abre con profesor y periodos.
  const legend = document.getElementById('legend-list');
  Object.entries(SUBJECTS).forEach(([code, subject]) => {
    const item = document.createElement('li');
    item.className = 'legend-item';
    item.tabIndex = 0;

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

    item.append(head, details);
    legend.append(item);
  });
})();

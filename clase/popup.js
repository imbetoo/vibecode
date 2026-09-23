(() => {
  const app = document.getElementById('app');
  const menuView = document.getElementById('menu-view');
  const scheduleView = document.getElementById('schedule-view');
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

  // ---------- Navegación entre vistas ----------

  function showSchedule() {
    app.classList.add('is-schedule');
    menuView.inert = true;
    scheduleView.inert = false;
    renderDay();
  }

  function showMenu() {
    app.classList.remove('is-schedule');
    scheduleView.inert = true;
    menuView.inert = false;
  }

  // ---------- Horario diario ----------

  function createTimePill(slot, isNow) {
    const pill = document.createElement('div');
    pill.className = 'time-pill' + (isNow ? ' is-now' : '');
    pill.style.gridRow = String(slotRow(slot.id));
    pill.setAttribute('aria-label', `${formatTime(slot.start)} a ${formatTime(slot.end)}`);

    const start = document.createElement('span');
    start.textContent = formatTime(slot.start);
    const end = document.createElement('span');
    end.className = 'time-pill__end';
    end.textContent = formatTime(slot.end);

    pill.append(start, end);
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
    const fragment = document.createDocumentFragment();
    slots.forEach(slot => fragment.append(createTimePill(slot, slot.id === nowSlot)));
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
  document.getElementById('back-to-menu').addEventListener('click', showMenu);
  document.getElementById('open-full').addEventListener('click', openFullSchedule);
  prevButton.addEventListener('click', () => changeDay(-1));
  nextButton.addEventListener('click', () => changeDay(1));

  document.addEventListener('keydown', event => {
    if (!app.classList.contains('is-schedule')) return;
    if (event.key === 'ArrowLeft') changeDay(-1);
    else if (event.key === 'ArrowRight') changeDay(1);
    else if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      showMenu();
    }
  });

  renderMenu();
})();

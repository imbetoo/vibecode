/*
 * Datos del horario y utilidades compartidas entre el popup y la página
 * del horario completo. Para cambiar el horario basta con editar este archivo.
 */

// Asignaturas: nombre visible, color del bloque, profesor y periodos semanales.
const SUBJECTS = {
  csdawBD:    { name: 'Bases de Datos',                 color: '#6accff', teacher: 'Mercedes Hernández Losada', periods: 7 },
  csdawIP:    { name: 'Inglés Profesional',             color: '#ffe95e', teacher: 'María Elvira Varón Gil',    periods: 2 },
  csdawCD:    { name: 'Contornos de Desenvolvemento',   color: '#921200', teacher: 'Patricia González Pardo',   periods: 3 },
  csdawPR:    { name: 'Programación',                   color: '#ff94d0', teacher: 'Marta Rey López',           periods: 9 },
  csdawLMSXI: { name: 'Linguaxe de Marcas e Sistemas',  color: '#7b75ff', teacher: 'Isaac Rincón Moraña',       periods: 4 },
  csdawSSI:   { name: 'Sistemas Informáticos',          color: '#47ff94', teacher: 'Cristina Puga Barreiros',   periods: 6 },
  csdawIPEI:  { name: 'Itinerario Persoal para a Empresa', color: '#ffb36b', teacher: 'Adelina Cobo Rodríguez',    periods: 4 },
  csdawSASP:  { name: 'Sustentabilidade Aplicada',      color: '#f06a5a', teacher: 'Agustín Sobral Crespo',     periods: 1 }
};

// Tramos horarios fijos. El recreo va entre el tramo 4 y el 5.
const TIME_SLOTS = [
  { id: 1, start: '08:10', end: '09:00' },
  { id: 2, start: '09:00', end: '09:50' },
  { id: 3, start: '09:50', end: '10:40' },
  { id: 4, start: '10:40', end: '11:30' },
  { id: 5, start: '12:00', end: '12:50' },
  { id: 6, start: '12:50', end: '13:40' },
  { id: 7, start: '13:40', end: '14:30' },
  { id: 8, start: '14:30', end: '15:20' } // Solo jueves
];

const BREAK = { afterSlot: 4, start: '11:30', end: '12:00' };

// Semana de lunes a viernes. `classes` asigna tramo -> código de asignatura.
const WEEK = [
  {
    short: 'L', name: 'Lunes',
    classes: {
      1: 'csdawSSI',  2: 'csdawSSI',
      3: 'csdawIPEI', 4: 'csdawIPEI',
      5: 'csdawSASP',
      6: 'csdawPR',   7: 'csdawPR'
    }
  },
  {
    short: 'M', name: 'Martes',
    classes: {
      1: 'csdawBD', 2: 'csdawBD',
      3: 'csdawIP', 4: 'csdawIP',
      5: 'csdawCD',
      6: 'csdawPR', 7: 'csdawPR'
    }
  },
  {
    short: 'X', name: 'Miércoles',
    classes: {
      1: 'csdawSSI',   2: 'csdawSSI',
      3: 'csdawLMSXI', 4: 'csdawLMSXI',
      5: 'csdawBD',    6: 'csdawBD',    7: 'csdawBD'
    }
  },
  {
    short: 'J', name: 'Jueves',
    classes: {
      1: 'csdawLMSXI', 2: 'csdawLMSXI',
      3: 'csdawCD',    4: 'csdawCD',
      5: 'csdawSSI',   6: 'csdawSSI',
      7: 'csdawPR',    8: 'csdawPR'
    }
  },
  {
    short: 'V', name: 'Viernes',
    classes: {
      1: 'csdawPR',   2: 'csdawPR',   3: 'csdawPR',
      4: 'csdawIPEI',
      5: 'csdawIPEI',
      6: 'csdawBD',   7: 'csdawBD'
    }
  }
];

// Tramos que se muestran como mínimo aunque el día acabe antes.
const DEFAULT_VISIBLE_SLOTS = 7;

/** Índice (0-4) del día a mostrar hoy; en fin de semana, el lunes. */
function todayIndex(date = new Date()) {
  const d = date.getDay(); // 0 domingo … 6 sábado
  return d === 0 || d === 6 ? 0 : d - 1;
}

/** Número de tramos visibles para un día (hasta su última clase, mínimo 7). */
function visibleSlotCount(day) {
  const used = Object.keys(day.classes).map(Number);
  return Math.max(DEFAULT_VISIBLE_SLOTS, ...used);
}

/**
 * Agrupa los tramos consecutivos de la misma asignatura en bloques.
 * Nunca une a través del recreo.
 * @returns {{code: string, from: number, to: number}[]}
 */
function groupDay(day) {
  const blocks = [];
  for (const slot of TIME_SLOTS) {
    const code = day.classes[slot.id];
    if (!code) continue;
    const last = blocks[blocks.length - 1];
    const contiguous = last && last.to === slot.id - 1 && last.to !== BREAK.afterSlot;
    if (contiguous && last.code === code) {
      last.to = slot.id;
    } else {
      blocks.push({ code, from: slot.id, to: slot.id });
    }
  }
  return blocks;
}

/** Fila de rejilla (1-based) de un tramo, dejando una fila para el recreo. */
function slotRow(slotId) {
  return slotId <= BREAK.afterSlot ? slotId : slotId + 1;
}

/** "08:10" -> "8:10" */
function formatTime(t) {
  return t.replace(/^0/, '');
}

function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Tramo en curso para una fecha, o null. */
function currentSlotId(date = new Date()) {
  const now = date.getHours() * 60 + date.getMinutes();
  const slot = TIME_SLOTS.find(s => now >= toMinutes(s.start) && now < toMinutes(s.end));
  return slot ? slot.id : null;
}

/**
 * Fechas (Date) de lunes a viernes de la semana que se muestra: la actual,
 * o la siguiente si es fin de semana (igual que todayIndex).
 */
function weekDates(date = new Date()) {
  const d = date.getDay();
  const offset = d === 0 ? 1 : d === 6 ? 2 : 1 - d;
  return WEEK.map((_, i) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset + i));
}

/**
 * Periodos de una asignatura que ya han terminado esta semana según WEEK.
 * En fin de semana cuenta como semana nueva (0).
 */
function periodsDoneThisWeek(code, date = new Date()) {
  const d = date.getDay();
  if (d === 0 || d === 6) return 0;
  const today = d - 1;
  const now = date.getHours() * 60 + date.getMinutes();
  let done = 0;
  WEEK.forEach((day, i) => {
    for (const [slotId, c] of Object.entries(day.classes)) {
      if (c !== code || i > today) continue;
      const slot = TIME_SLOTS.find(s => s.id === Number(slotId));
      if (i < today || now >= toMinutes(slot.end)) done++;
    }
  });
  return done;
}

/** Color de texto legible (oscuro o claro) sobre un fondo dado. */
function textColorFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.35 ? 'rgba(20, 20, 30, 0.88)' : 'rgba(255, 255, 255, 0.95)';
}

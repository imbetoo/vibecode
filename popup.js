/**
 * bSTG — popup para gestionar las reglas de nombre de grupos.
 * Las reglas viven en chrome.storage.sync (ver shared.js); el service worker
 * escucha los cambios y renombra/reagrupa por su cuenta.
 */

'use strict';

/* global BSTG */

const MSG_REGROUP_ALL = 'bstg:regroup-all';

const form = document.getElementById('rule-form');
const domainInput = document.getElementById('domain');
const nameInput = document.getElementById('name');
const saveButton = document.getElementById('save');
const statusEl = document.getElementById('status');
const rulesList = document.getElementById('rules');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');
const regroupButton = document.getElementById('regroup');

let statusTimer = null;
/** Última copia de las reglas mostradas. @type {Map<string, string>} */
let currentRules = new Map();

/**
 * @param {string} message
 * @param {'ok'|'error'|''} [kind]
 */
function showStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
  clearTimeout(statusTimer);
  if (message && kind !== 'error') {
    statusTimer = setTimeout(() => showStatus(''), 2500);
  }
}

/** Traduce los errores de cuota de storage.sync a algo comprensible. */
function describeStorageError(error) {
  const message = (error && error.message) || String(error);
  if (/QUOTA_BYTES|MAX_ITEMS/i.test(message)) {
    return 'No queda espacio para más reglas en el almacenamiento sincronizado.';
  }
  if (/MAX_WRITE_OPERATIONS/i.test(message)) {
    return 'Demasiados cambios seguidos. Espera un momento y vuelve a intentarlo.';
  }
  return `No se pudo guardar: ${message}`;
}

/* ------------------------------------------------------------------------ */
/* Renderizado                                                              */
/* ------------------------------------------------------------------------ */

/** @param {Map<string, string>} rules */
function renderRules(rules) {
  const entries = [...rules.entries()].sort(([a], [b]) => a.localeCompare(b));

  rulesList.replaceChildren(...entries.map(([domain, name]) => {
    const item = document.createElement('li');

    // Clic en la regla: cargarla en el formulario para editarla.
    const info = document.createElement('div');
    info.className = 'rule';
    info.title = 'Editar esta regla';
    info.addEventListener('click', () => {
      domainInput.value = domain;
      nameInput.value = name;
      nameInput.focus();
      nameInput.select();
      updateSaveLabel();
    });

    const nameEl = document.createElement('div');
    nameEl.className = 'rule-name';
    nameEl.textContent = name;

    const domainEl = document.createElement('div');
    domainEl.className = 'rule-domain';
    domainEl.textContent = domain;

    info.append(nameEl, domainEl);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete';
    deleteButton.textContent = 'Eliminar';
    deleteButton.setAttribute('aria-label', `Eliminar la regla de ${domain}`);
    deleteButton.addEventListener('click', () => deleteRule(domain));

    item.append(info, deleteButton);
    return item;
  }));

  emptyEl.hidden = entries.length > 0;
  rulesList.hidden = entries.length === 0;
  countEl.textContent = entries.length > 0 ? String(entries.length) : '';
  currentRules = rules;
  updateSaveLabel();
}

async function refresh() {
  try {
    renderRules(await BSTG.loadRules());
  } catch (error) {
    showStatus(`No se pudieron cargar las reglas: ${error.message || error}`, 'error');
  }
}

/** "Guardar" o "Actualizar" según si el dominio ya tiene regla. */
function updateSaveLabel() {
  const domain = BSTG.normalizeDomainInput(domainInput.value);
  saveButton.textContent = domain && currentRules.has(domain) ? 'Actualizar' : 'Guardar';
}

/* ------------------------------------------------------------------------ */
/* Acciones                                                                 */
/* ------------------------------------------------------------------------ */

async function saveRule(event) {
  event.preventDefault();

  const domain = BSTG.normalizeDomainInput(domainInput.value);
  const name = BSTG.normalizeGroupName(nameInput.value);

  domainInput.setAttribute('aria-invalid', String(!domain));
  nameInput.setAttribute('aria-invalid', String(!name));

  if (!domain) {
    showStatus('Introduce un dominio válido, p. ej. github.com', 'error');
    domainInput.focus();
    return;
  }
  if (!name) {
    showStatus('Introduce un nombre para el grupo.', 'error');
    nameInput.focus();
    return;
  }

  const existed = currentRules.has(domain);
  saveButton.disabled = true;
  try {
    await chrome.storage.sync.set({ [BSTG.ruleKey(domain)]: name });
    domainInput.value = '';
    nameInput.value = '';
    showStatus(existed ? `Regla de ${domain} actualizada.` : `Regla guardada: ${domain} → ${name}`, 'ok');
    domainInput.focus();
    // La lista se actualiza sola vía storage.onChanged.
  } catch (error) {
    showStatus(describeStorageError(error), 'error');
  } finally {
    saveButton.disabled = false;
  }
}

async function deleteRule(domain) {
  try {
    await chrome.storage.sync.remove(BSTG.ruleKey(domain));
    showStatus(`Regla de ${domain} eliminada.`, 'ok');
  } catch (error) {
    showStatus(`No se pudo eliminar: ${error.message || error}`, 'error');
  }
}

async function regroupAll() {
  regroupButton.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: MSG_REGROUP_ALL });
    showStatus('Reorganizando pestañas…', 'ok');
  } catch (error) {
    showStatus(`No se pudo reorganizar: ${error.message || error}`, 'error');
  } finally {
    regroupButton.disabled = false;
  }
}

/** Rellena el dominio con el de la pestaña activa para agilizar el alta. */
async function prefillFromActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab && (tab.pendingUrl || tab.url);
    if (!url) return;
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return;
    const mainDomain = BSTG.getMainDomain(hostname);
    if (mainDomain && !domainInput.value) {
      domainInput.value = mainDomain;
      updateSaveLabel();
      nameInput.focus();
    }
  } catch {
    // Sin pestaña activa utilizable: el usuario escribe el dominio a mano.
  }
}

/* ------------------------------------------------------------------------ */
/* Inicio                                                                   */
/* ------------------------------------------------------------------------ */

form.addEventListener('submit', saveRule);
regroupButton.addEventListener('click', regroupAll);
domainInput.addEventListener('input', () => {
  domainInput.removeAttribute('aria-invalid');
  updateSaveLabel();
});
nameInput.addEventListener('input', () => nameInput.removeAttribute('aria-invalid'));

// Refleja cambios hechos desde otra ventana del popup o desde otro dispositivo.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && Object.keys(changes).some((key) => key.startsWith(BSTG.RULE_PREFIX))) {
    refresh();
  }
});

refresh().then(prefillFromActiveTab);

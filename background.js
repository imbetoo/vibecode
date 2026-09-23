/**
 * bSTG — service worker (Manifest V3).
 *
 * Agrupa automáticamente las pestañas de cada ventana según su dominio
 * principal y deshace los grupos que se quedan con una sola pestaña. El
 * título de cada grupo sale de las reglas personalizadas guardadas en
 * chrome.storage.sync (popup) o, si no hay regla, del propio dominio.
 *
 * Diseño:
 *  - Los eventos de pestañas NO modifican nada directamente: solo marcan la
 *    ventana afectada como "sucia" y reinician un temporizador (debounce).
 *  - Cuando el temporizador vence, cada ventana sucia se "reconcilia": se
 *    leen (de forma asíncrona) las reglas de storage y el estado real de la
 *    ventana, y se calcula qué agrupar / desagrupar.
 *  - Reconciliaciones y renombrados se serializan en una cola de promesas,
 *    de modo que nunca hay dos ejecutándose a la vez sobre las mismas pestañas.
 *  - Toda llamada que muta pestañas tolera que éstas desaparezcan entre la
 *    lectura y la escritura (pestaña cerrada, ventana cerrada, arrastre...).
 *
 * Un grupo se considera "gestionado" por la extensión cuando su título
 * coincide con el título que le corresponde a alguna de sus pestañas (p. ej.
 * el grupo "Desarrollo" que contiene una pestaña de github.com cuando existe
 * la regla github.com -> Desarrollo). Los grupos creados manualmente con otro
 * nombre se respetan y sus pestañas no se tocan.
 */

'use strict';

importScripts('shared.js'); /* global BSTG */

/* ------------------------------------------------------------------------ */
/* Configuración                                                            */
/* ------------------------------------------------------------------------ */

const DEBOUNCE_MS = 500;

/** Reintentos cuando el navegador bloquea la edición (p. ej. arrastrando). */
const MAX_EDIT_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 150;

/** Colores admitidos por chrome.tabGroups. */
const GROUP_COLORS = Object.freeze([
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
]);

/** Solo se agrupan páginas web; chrome://, brave://, edge://, about:, file:,
 *  chrome-extension://, devtools://, view-source:, etc. quedan fuera. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Mensaje que envía el botón "Reagrupar ahora" del popup. */
const MSG_REGROUP_ALL = 'bstg:regroup-all';

const TAB_GROUP_ID_NONE = chrome.tabGroups.TAB_GROUP_ID_NONE; // -1
const WINDOW_ID_NONE = chrome.windows.WINDOW_ID_NONE; // -1

/* ------------------------------------------------------------------------ */
/* Títulos y colores                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Lee las reglas de nombre. Si storage falla por cualquier motivo se sigue
 * funcionando con los nombres por defecto en lugar de bloquear el agrupado.
 * @returns {Promise<Map<string, string>>}
 */
async function loadRulesSafe() {
  try {
    return await BSTG.loadRules();
  } catch (error) {
    console.warn('[bSTG] No se pudieron leer las reglas; se usan los nombres por defecto:', error);
    return new Map();
  }
}

/**
 * Título de grupo que corresponde a una pestaña, o null si no debe agruparse.
 * Se usa `pendingUrl` cuando existe porque refleja la navegación en curso.
 * @param {chrome.tabs.Tab} tab
 * @param {Map<string, string>} rules
 * @returns {string|null}
 */
function getTabLabel(tab, rules) {
  if (tab.pinned) return null; // Las pestañas fijadas no pueden estar en grupos.

  const rawUrl = tab.pendingUrl || tab.url;
  if (!rawUrl) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;

  return BSTG.resolveGroupTitle(url.hostname, rules);
}

/**
 * Color estable para un título: el mismo nombre recibe siempre el mismo
 * color, lo que ayuda a reconocer los grupos de un vistazo.
 * @param {string} label
 * @returns {string}
 */
function colorForLabel(label) {
  let hash = 5381;
  for (let i = 0; i < label.length; i += 1) {
    hash = ((hash << 5) + hash + label.charCodeAt(i)) >>> 0; // djb2
  }
  return GROUP_COLORS[hash % GROUP_COLORS.length];
}

/* ------------------------------------------------------------------------ */
/* Envoltorios seguros sobre la API                                         */
/* ------------------------------------------------------------------------ */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error) {
  return (error && error.message) || String(error);
}

/** El usuario está arrastrando una pestaña: la operación puede reintentarse. */
function isEditBlockedError(error) {
  return /cannot be edited right now|user may be dragging/i.test(errorMessage(error));
}

/** La pestaña, el grupo o la ventana ya no existen. */
function isGoneError(error) {
  return /no (tab|group|window) with id|invalid tab id|tab not found/i.test(errorMessage(error));
}

/**
 * Ejecuta `fn` reintentando con backoff exponencial mientras el navegador
 * rechace la edición por un arrastre en curso.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withEditRetry(fn) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isEditBlockedError(error) || attempt >= MAX_EDIT_RETRIES) throw error;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
}

/**
 * Filtra los ids de pestañas que siguen existiendo en la ventana indicada.
 * @param {number[]} tabIds
 * @param {number} windowId
 * @returns {Promise<number[]>}
 */
async function filterLiveTabIds(tabIds, windowId) {
  const results = await Promise.all(
    tabIds.map((id) => chrome.tabs.get(id).catch(() => null)),
  );
  return results
    .filter((tab) => tab && tab.windowId === windowId && !tab.pinned)
    .map((tab) => tab.id);
}

/**
 * chrome.tabs.group tolerante a condiciones de carrera. Si alguna pestaña se
 * cerró entre la lectura y la escritura, la API rechaza el lote completo; en
 * ese caso se revalidan los ids y se reintenta una vez con los supervivientes.
 *
 * @param {number[]} tabIds
 * @param {number} windowId
 * @param {number|null} groupId  Grupo existente, o null para crear uno nuevo.
 * @returns {Promise<number|null>} id del grupo resultante, o null si no se hizo nada.
 */
async function safeGroupTabs(tabIds, windowId, groupId) {
  const minTabs = groupId === null ? 2 : 1;

  const attempt = (ids) => withEditRetry(() => chrome.tabs.group(
    groupId === null
      ? { tabIds: ids, createProperties: { windowId } }
      : { tabIds: ids, groupId },
  ));

  if (tabIds.length < minTabs) return null;

  try {
    return await attempt(tabIds);
  } catch (error) {
    if (!isGoneError(error)) throw error;

    // ¿Desapareció el grupo destino? Entonces no hay nada que reintentar aquí;
    // la próxima reconciliación creará uno nuevo si procede.
    if (groupId !== null) {
      const group = await chrome.tabGroups.get(groupId).catch(() => null);
      if (!group) return null;
    }

    const liveIds = await filterLiveTabIds(tabIds, windowId);
    if (liveIds.length < minTabs) return null;

    try {
      return await attempt(liveIds);
    } catch (retryError) {
      if (isGoneError(retryError)) return null; // Otra carrera: se resolverá en el próximo ciclo.
      throw retryError;
    }
  }
}

/**
 * chrome.tabs.ungroup tolerante a pestañas cerradas.
 * @param {number[]} tabIds
 * @param {number} windowId
 */
async function safeUngroupTabs(tabIds, windowId) {
  if (tabIds.length === 0) return;
  try {
    await withEditRetry(() => chrome.tabs.ungroup(tabIds));
  } catch (error) {
    if (!isGoneError(error)) throw error;
    const liveIds = await filterLiveTabIds(tabIds, windowId);
    if (liveIds.length === 0) return;
    try {
      await withEditRetry(() => chrome.tabs.ungroup(liveIds));
    } catch (retryError) {
      if (!isGoneError(retryError)) throw retryError;
    }
  }
}

/**
 * chrome.tabGroups.update tolerante a que el grupo ya no exista.
 * @param {number} groupId
 * @param {chrome.tabGroups.UpdateProperties} props
 */
async function safeUpdateGroup(groupId, props) {
  try {
    await withEditRetry(() => chrome.tabGroups.update(groupId, props));
  } catch (error) {
    if (!isGoneError(error)) throw error;
  }
}

/* ------------------------------------------------------------------------ */
/* Reconciliación                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Lee el estado actual de una ventana y lo pre-procesa.
 * @param {number} windowId
 * @param {Map<string, string>} rules
 */
async function takeSnapshot(windowId, rules) {
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({ windowId }),
    chrome.tabGroups.query({ windowId }),
  ]);

  /** @type {Map<number, string|null>} */
  const labelByTab = new Map(tabs.map((tab) => [tab.id, getTabLabel(tab, rules)]));

  /** @type {Map<number, chrome.tabGroups.TabGroup>} */
  const managedGroups = new Map();
  for (const group of groups) {
    const isManaged = Boolean(group.title) && tabs.some(
      (tab) => tab.groupId === group.id && labelByTab.get(tab.id) === group.title,
    );
    if (isManaged) managedGroups.set(group.id, group);
  }

  return { tabs, labelByTab, managedGroups };
}

/**
 * Lleva una ventana al estado deseado:
 *  1. Saca de los grupos gestionados las pestañas cuyo título ya no coincide.
 *  2. Agrupa las pestañas que comparten título (2 o más).
 *  3. Deshace los grupos gestionados que se quedan con una sola pestaña.
 * @param {number} windowId
 */
async function reconcileWindow(windowId) {
  const win = await chrome.windows.get(windowId).catch(() => null);
  if (!win || win.type !== 'normal') return; // Solo las ventanas normales admiten grupos.

  // Las reglas se consultan (de forma asíncrona) antes de calcular ningún
  // título. Se leen una sola vez por reconciliación para que todas las
  // decisiones de esta pasada usen el mismo conjunto de reglas.
  const rules = await loadRulesSafe();
  const { tabs, labelByTab, managedGroups } = await takeSnapshot(windowId, rules);

  // --- 1. Pestañas que ya no encajan en su grupo (otro dominio, regla nueva o página interna). ---
  const strayTabIds = tabs
    .filter((tab) => {
      const group = managedGroups.get(tab.groupId);
      return group && labelByTab.get(tab.id) !== group.title;
    })
    .map((tab) => tab.id);
  await safeUngroupTabs(strayTabIds, windowId);
  const strayIds = new Set(strayTabIds);

  // --- 2. Agrupar por título (regla personalizada o dominio). ---
  /** @type {Map<string, chrome.tabs.Tab[]>} */
  const buckets = new Map();
  for (const tab of tabs) {
    const label = labelByTab.get(tab.id);
    if (!label) continue;

    const inManagedGroup = managedGroups.has(tab.groupId) && !strayIds.has(tab.id);
    const isFree = tab.groupId === TAB_GROUP_ID_NONE || strayIds.has(tab.id);
    if (!inManagedGroup && !isFree) continue; // Grupo creado por el usuario: no se toca.

    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(tab);
  }

  for (const [label, bucketTabs] of buckets) {
    if (bucketTabs.length < 2) continue;

    // Grupo destino: el gestionado con ese título que ya contiene más pestañas
    // del bucket. Si hay duplicados (p. ej. tras mover pestañas entre
    // ventanas), el resto se fusiona en éste.
    const countByGroup = new Map();
    for (const tab of bucketTabs) {
      if (strayIds.has(tab.id)) continue;
      const group = managedGroups.get(tab.groupId);
      if (group && group.title === label) {
        countByGroup.set(group.id, (countByGroup.get(group.id) || 0) + 1);
      }
    }
    let targetGroupId = null;
    let best = 0;
    for (const [groupId, count] of countByGroup) {
      if (count > best) {
        best = count;
        targetGroupId = groupId;
      }
    }

    const missingIds = bucketTabs
      .filter((tab) => strayIds.has(tab.id) || tab.groupId !== targetGroupId)
      .map((tab) => tab.id);

    if (targetGroupId !== null) {
      if (missingIds.length > 0) {
        const result = await safeGroupTabs(missingIds, windowId, targetGroupId);
        if (result === null) {
          // El grupo destino desapareció durante el proceso: reintentar pronto.
          scheduleWindow(windowId);
        }
      }
    } else {
      const newGroupId = await safeGroupTabs(missingIds, windowId, null);
      if (newGroupId !== null) {
        await safeUpdateGroup(newGroupId, {
          title: label,
          color: colorForLabel(label),
          collapsed: false,
        });
      }
    }
  }

  // --- 3. Limpieza: grupos gestionados con una única pestaña. ---
  // Se relee el estado porque los pasos anteriores (y el usuario) lo cambian.
  const after = await takeSnapshot(windowId, rules);
  const tabsPerGroup = new Map();
  for (const tab of after.tabs) {
    if (after.managedGroups.has(tab.groupId)) {
      if (!tabsPerGroup.has(tab.groupId)) tabsPerGroup.set(tab.groupId, []);
      tabsPerGroup.get(tab.groupId).push(tab.id);
    }
  }
  const lonelyTabIds = [];
  for (const tabIds of tabsPerGroup.values()) {
    if (tabIds.length === 1) lonelyTabIds.push(tabIds[0]);
  }
  await safeUngroupTabs(lonelyTabIds, windowId);
}
/* ------------------------------------------------------------------------ */
/* Cambios de reglas                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Reconstruye las reglas tal y como estaban antes de un cambio de storage.
 * @param {Map<string, string>} currentRules
 * @param {Record<string, chrome.storage.StorageChange>} changes
 * @returns {Map<string, string>}
 */
function previousRules(currentRules, changes) {
  const rules = new Map(currentRules);
  for (const [key, change] of Object.entries(changes)) {
    if (!key.startsWith(BSTG.RULE_PREFIX)) continue;
    const domain = key.slice(BSTG.RULE_PREFIX.length);
    if (typeof change.oldValue === 'string' && change.oldValue) {
      rules.set(domain, change.oldValue);
    } else {
      rules.delete(domain);
    }
  }
  return rules;
}

/**
 * Tras añadir, cambiar o borrar una regla, renombra los grupos existentes en
 * lugar de destruirlos y recrearlos: el grupo "Github" pasa a llamarse
 * "Desarrollo" conservando su posición y sus pestañas. Sin este paso el
 * grupo antiguo dejaría de reconocerse como gestionado (su título ya no
 * coincidiría con el de ninguna pestaña) y se quedaría huérfano.
 *
 * Solo se tocan grupos que eran gestionados con las reglas anteriores. Lo
 * que no encaje (pestañas que ahora van a otro grupo, grupos que ahora
 * comparten nombre y deben fusionarse) lo resuelve la reconciliación.
 *
 * @param {Map<string, string>} oldRules
 * @param {Map<string, string>} newRules
 */
async function renameGroupsAfterRuleChange(oldRules, newRules) {
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'], populate: true });

  for (const win of windows) {
    const groups = await chrome.tabGroups.query({ windowId: win.id }).catch(() => []);

    for (const group of groups) {
      if (!group.title) continue;

      // Pestañas del grupo que lo hacían "gestionado" con las reglas antiguas.
      const ownTabs = win.tabs.filter(
        (tab) => tab.groupId === group.id && getTabLabel(tab, oldRules) === group.title,
      );
      if (ownTabs.length === 0) continue; // Grupo del usuario: no se toca.

      // Nuevo título: el mayoritario entre esas pestañas con las reglas nuevas.
      const votes = new Map();
      for (const tab of ownTabs) {
        const title = getTabLabel(tab, newRules);
        if (title) votes.set(title, (votes.get(title) || 0) + 1);
      }
      let newTitle = null;
      let best = 0;
      for (const [title, count] of votes) {
        if (count > best) {
          best = count;
          newTitle = title;
        }
      }

      if (newTitle && newTitle !== group.title) {
        await safeUpdateGroup(group.id, { title: newTitle, color: colorForLabel(newTitle) });
      }
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Debounce + cola serializada                                              */
/* ------------------------------------------------------------------------ */

/** Ventanas pendientes de reconciliar. */
const dirtyWindows = new Set();
let debounceTimer = null;
/** Cola que garantiza que las operaciones sobre grupos nunca se solapan. */
let queue = Promise.resolve();

/**
 * Añade una tarea a la cola. Un error en una tarea no bloquea las siguientes.
 * @param {() => Promise<void>} task
 * @param {string} description
 */
function enqueue(task, description) {
  queue = queue.then(task).catch((error) => {
    if (!isGoneError(error)) console.warn(`[bSTG] Error en ${description}:`, error);
  });
  return queue;
}

/**
 * Marca una ventana como pendiente y (re)inicia el debounce.
 * @param {number|undefined} windowId
 */
function scheduleWindow(windowId) {
  if (typeof windowId !== 'number' || windowId === WINDOW_ID_NONE) return;
  dirtyWindows.add(windowId);
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushDirtyWindows, DEBOUNCE_MS);
}

function flushDirtyWindows() {
  debounceTimer = null;
  const windowIds = [...dirtyWindows];
  dirtyWindows.clear();

  for (const windowId of windowIds) {
    enqueue(() => reconcileWindow(windowId), `la reconciliación de la ventana ${windowId}`);
  }
}

async function scheduleAllWindows() {
  try {
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    windows.forEach((win) => scheduleWindow(win.id));
  } catch (error) {
    console.warn('[bSTG] No se pudieron enumerar las ventanas:', error);
  }
}

/* ------------------------------------------------------------------------ */
/* Listeners (registrados de forma síncrona en el nivel superior, como exige */
/* MV3 para que despierten al service worker).                              */
/* ------------------------------------------------------------------------ */

chrome.tabs.onCreated.addListener((tab) => {
  scheduleWindow(tab.windowId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Solo interesan cambios que alteran el dominio o la posibilidad de agrupar.
  // Los cambios de `groupId` se ignoran a propósito: los provoca la propia
  // extensión y reaccionar a ellos generaría bucles.
  if (changeInfo.url !== undefined || changeInfo.pinned !== undefined) {
    scheduleWindow(tab.windowId);
  }
});

// Necesario para la limpieza de grupos de una sola pestaña.
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (!removeInfo.isWindowClosing) scheduleWindow(removeInfo.windowId);
});

// Pestañas arrastradas entre ventanas: afectan a ambas.
chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
  scheduleWindow(detachInfo.oldWindowId);
});
chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  scheduleWindow(attachInfo.newWindowId);
});

// Reglas añadidas/editadas/borradas desde el popup (o sincronizadas desde
// otro dispositivo): renombrar los grupos afectados y reconciliar todo.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;
  if (!Object.keys(changes).some((key) => key.startsWith(BSTG.RULE_PREFIX))) return;

  enqueue(async () => {
    const newRules = await loadRulesSafe();
    await renameGroupsAfterRuleChange(previousRules(newRules, changes), newRules);
  }, 'el renombrado de grupos');
  scheduleAllWindows();
});

// Botón "Reagrupar ahora" del popup.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === MSG_REGROUP_ALL) {
    scheduleAllWindows().then(() => sendResponse({ ok: true }));
    return true; // Respuesta asíncrona.
  }
  return false;
});

// Organizar lo que ya estaba abierto al instalar/actualizar y al arrancar.
chrome.runtime.onInstalled.addListener(() => {
  scheduleAllWindows();
});
chrome.runtime.onStartup.addListener(() => {
  scheduleAllWindows();
});

/**
 * bSTG — utilidades compartidas entre el service worker (vía importScripts)
 * y el popup (vía <script>). Sin dependencias y sin efectos secundarios.
 *
 * Las reglas de nombre se guardan en chrome.storage.sync con una clave por
 * dominio ("rule:github.com" -> "Desarrollo") en lugar de un único objeto:
 * así cada regla cuenta por separado para el límite de 8 KB por elemento
 * de storage.sync y dos dispositivos que editen reglas distintas no se pisan.
 */

'use strict';

// eslint-disable-next-line no-unused-vars
const BSTG = (() => {
  const RULE_PREFIX = 'rule:';
  const MAX_NAME_LENGTH = 40;

  /**
   * Segundos niveles genéricos bajo ccTLDs (bbc.co.uk, mercadolibre.com.ar,
   * boe.gob.es...). Heurística ligera en lugar de la Public Suffix List.
   */
  const GENERIC_SECOND_LEVELS = new Set([
    'ac', 'co', 'com', 'edu', 'gob', 'gov', 'go', 'mil', 'ne', 'net', 'nic',
    'nom', 'or', 'org', 'ltd', 'plc', 'sch',
  ]);

  /** Sufijos de hosting compartido en los que cada subdominio es un sitio
   *  distinto (usuario.github.io no es "github.io"). */
  const SHARED_HOSTING_SUFFIXES = new Set([
    'github.io', 'gitlab.io', 'blogspot.com', 'herokuapp.com', 'netlify.app',
    'vercel.app', 'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com',
    'azurewebsites.net', 'cloudfront.net', 'appspot.com', 'wordpress.com',
    'tumblr.com', 'neocities.org', 'glitch.me', 'onrender.com', 'fly.dev',
  ]);

  const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
  const HOSTNAME_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

  function isIpHost(host) {
    return IPV4_RE.test(host) || host.includes(':') || host.startsWith('[');
  }

  /** Minúsculas, sin punto final y sin "www.". */
  function cleanHost(hostname) {
    return (hostname || '').toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  }

  /**
   * Dominio principal de un hostname.
   *   gist.github.com -> github.com · www.bbc.co.uk -> bbc.co.uk
   *   alice.github.io -> alice.github.io · 10.0.0.1 / localhost -> tal cual
   * @param {string} hostname
   * @returns {string|null}
   */
  function getMainDomain(hostname) {
    const host = cleanHost(hostname);
    if (!host) return null;
    if (isIpHost(host)) return host;

    const labels = host.split('.').filter(Boolean);
    if (labels.length <= 2) return labels.join('.');

    let take = 2;
    const tld = labels[labels.length - 1];
    const secondLevel = labels[labels.length - 2];
    if (tld.length === 2 && GENERIC_SECOND_LEVELS.has(secondLevel)) {
      take = 3;
    } else if (SHARED_HOSTING_SUFFIXES.has(`${secondLevel}.${tld}`)) {
      take = 3;
    }
    return labels.slice(-take).join('.');
  }

  /**
   * Título por defecto de un dominio principal.
   *   github.com -> "Github" · bbc.co.uk -> "Bbc" · 10.0.0.1 -> "10.0.0.1"
   * @param {string} domain
   * @returns {string}
   */
  function domainToLabel(domain) {
    if (isIpHost(domain)) return domain;
    const name = domain.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * Normaliza lo que el usuario escribe en el campo "Dominio". Acepta un
   * dominio suelto o una URL completa pegada desde la barra de direcciones.
   *   "https://www.GitHub.com/user/repo" -> "github.com"
   * @param {string} input
   * @returns {string|null} null si no es un dominio válido.
   */
  function normalizeDomainInput(input) {
    const raw = (input || '').trim();
    if (!raw) return null;

    let hostname;
    try {
      hostname = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`).hostname;
    } catch {
      return null;
    }

    const host = cleanHost(hostname);
    if (!host) return null;
    if (isIpHost(host)) return host;
    return HOSTNAME_RE.test(host) ? host : null;
  }

  /** Limpia y valida un nombre de grupo. Devuelve null si queda vacío. */
  function normalizeGroupName(input) {
    const name = (input || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
    return name || null;
  }

  function ruleKey(domain) {
    return RULE_PREFIX + domain;
  }

  /**
   * Extrae las reglas de un objeto devuelto por chrome.storage.sync.get.
   * @param {Record<string, unknown>} items
   * @returns {Map<string, string>} dominio -> nombre de grupo
   */
  function rulesFromItems(items) {
    const rules = new Map();
    for (const [key, value] of Object.entries(items || {})) {
      if (key.startsWith(RULE_PREFIX) && typeof value === 'string' && value) {
        rules.set(key.slice(RULE_PREFIX.length), value);
      }
    }
    return rules;
  }

  /** @returns {Promise<Map<string, string>>} */
  async function loadRules() {
    return rulesFromItems(await chrome.storage.sync.get(null));
  }

  /**
   * Título de grupo para un hostname: la regla más específica que lo cubra
   * (docs.google.com gana a google.com) o, si no hay ninguna, el título por
   * defecto del dominio principal. Las reglas se aplican a los subdominios:
   * una regla para "github.com" cubre también "gist.github.com".
   *
   * Pestañas con distintos dominios y el mismo nombre personalizado acaban
   * en el mismo grupo (github.com y gitlab.com -> "Desarrollo").
   *
   * @param {string} hostname
   * @param {Map<string, string>} rules
   * @returns {string|null}
   */
  function resolveGroupTitle(hostname, rules) {
    const host = cleanHost(hostname);
    const mainDomain = getMainDomain(host);
    if (!mainDomain) return null;

    if (rules && rules.size > 0) {
      if (isIpHost(host)) {
        if (rules.has(host)) return rules.get(host);
      } else {
        const labels = host.split('.');
        const minLabels = mainDomain.split('.').length;
        for (let i = 0; labels.length - i >= minLabels; i += 1) {
          const candidate = labels.slice(i).join('.');
          if (rules.has(candidate)) return rules.get(candidate);
        }
      }
    }
    return domainToLabel(mainDomain);
  }

  return Object.freeze({
    RULE_PREFIX,
    MAX_NAME_LENGTH,
    getMainDomain,
    domainToLabel,
    normalizeDomainInput,
    normalizeGroupName,
    ruleKey,
    rulesFromItems,
    loadRules,
    resolveGroupTitle,
  });
})();

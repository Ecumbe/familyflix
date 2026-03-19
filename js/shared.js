/* =========================================================
   FamilyFlix v6.1 — shared.js
   Base completa para frontend + Google Apps Script + Worker
   Ajustado para Apps Script vía GET (evita CORS en GitHub Pages)
   ========================================================= */

const FF_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyksursDb7DMx8wXL4nodOqLwI9UvLP-e5PgLF2BTm1wU18MLPgz0va2g_CDPaS5XyZfA/exec',
  WORKER_URL: 'https://familyflix-worker.canonedu17.workers.dev',
  SHEETS: {
    CONTENT_TSV: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQLDXRtWlOPk8n9cz8UwzvB_0G3gHCUofVDgF5azBpUFPo0ZQuZDl2230T8mLkyA1N9dYtkkuQP0Y1w/pub?gid=0&single=true&output=tsv',
    EPISODES_TSV: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQLDXRtWlOPk8n9cz8UwzvB_0G3gHCUofVDgF5azBpUFPo0ZQuZDl2230T8mLkyA1N9dYtkkuQP0Y1w/pub?gid=1661853453&single=true&output=tsv'
  },
  R2_PUBLIC_BASE: 'https://pub-eb7091956e164433aa5c9ef0bcc70356.r2.dev/',
  STORAGE_KEYS: {
    THEME: 'ff_theme',
    SESSION: 'ff_session',
    ADMIN_SECRET: 'ff_admin_secret',
    VIDEO_BASE_URL: 'ff_video_base_url',
    CONTENT_CACHE: 'ff_content_cache_v3',
    EPISODES_CACHE: 'ff_episodes_cache_v1'
  },
  CATALOG_CACHE_TTL_MS: 5 * 60 * 1000
};

const FF_STATE = {
  content: [],
  episodes: [],
  videoBaseUrl: '',
  videoBaseLoaded: false,
  videoBaseLoadingPromise: null,
  contentLoadingPromise: null,
  episodesLoadingPromise: null,
  userStateLoadingPromise: null,
  userState: {
    progress: [],
    favorites: [],
    continueWatching: []
  },
  indexes: {
    contentById: new Map(),
    episodeById: new Map(),
    episodesBySeries: new Map(),
    favoriteKeys: new Set(),
    progressByKey: new Map(),
    latestSeriesProgressByContent: new Map()
  }
};

/* -------------------------------
   Utilidades base
--------------------------------*/
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

function fmtDateTime(date = new Date()) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function fmtDurationSeconds(seconds = 0) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function parseDurationToSeconds(value = '') {
  const txt = String(value || '').trim();
  if (!txt) return 0;

  if (/^\d+$/.test(txt)) return Number(txt);

  const parts = txt.split(':').map(v => Number(v));
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function debounce(fn, delay = 500) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function splitTags(value = '') {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeRatingValue(value = '') {
  const normalized = Number(String(value ?? '').replace(',', '.').trim());
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return Math.max(0, Math.min(10, Math.round(normalized * 10) / 10));
}

function normalizeRatingCount(value = 0) {
  const normalized = Number(String(value ?? '').replace(/[^\d.-]/g, '').trim());
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return Math.round(normalized);
}

function formatRatingCount(value = 0) {
  const count = normalizeRatingCount(value);
  if (!count) return '';
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1).replace(/\.0$/, '')}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  }
  return String(count);
}

function getRatingState(item = {}) {
  const rating = normalizeRatingValue(item.rating || '');
  const count = normalizeRatingCount(item.ratingCount || 0);
  const source = String(item.ratingSource || '').trim();
  return {
    rating,
    count,
    source,
    hasRating: rating > 0,
    fillPercent: Math.max(0, Math.min(100, rating * 10)),
    valueText: rating ? rating.toFixed(1) : ''
  };
}

function formatRatingShortText(item = {}) {
  const state = getRatingState(item);
  return state.hasRating ? `\u2605 ${state.valueText}` : '';
}

function buildRatingPill(item = {}, options = {}) {
  const state = getRatingState(item);
  if (!state.hasRating) return '';

  const showCount = Boolean(options.showCount);
  const showSource = Boolean(options.showSource);
  const compact = Boolean(options.compact);
  const classes = ['ff-rating-chip'];
  if (compact) classes.push('ff-rating-chip--compact');
  const starText = '\u2605\u2605\u2605\u2605\u2605';

  const titleParts = [`${state.valueText}/10`];
  if (state.count) titleParts.push(`${formatRatingCount(state.count)} votos`);
  if (state.source) titleParts.push(state.source);

  return `
    <span class="${classes.join(' ')}" title="${escapeHtml(titleParts.join(' · '))}">
      <span class="ff-rating-stars" aria-hidden="true">
        <span class="ff-rating-stars-base">${starText}</span>
        <span class="ff-rating-stars-fill" style="width:${state.fillPercent}%">${starText}</span>
      </span>
      <span class="ff-rating-value">${escapeHtml(state.valueText)}</span>
      ${showCount && state.count ? `<span class="ff-rating-count">${escapeHtml(formatRatingCount(state.count))}</span>` : ''}
      ${showSource && state.source ? `<span class="ff-rating-source">${escapeHtml(state.source)}</span>` : ''}
    </span>
  `.trim();
}

function isAllAudienceToken(value = '') {
  const token = String(value || '').trim().toLowerCase();
  return !token || token === 'todos' || token === '*' || token === 'all';
}

function normalizeAudienceTokens(value = '') {
  const rawList = Array.isArray(value) ? value : splitTags(value);
  const normalized = [];
  const seen = new Set();

  rawList.forEach((entry) => {
    const raw = String(entry || '').trim();
    const key = raw.toLowerCase();
    if (!raw || seen.has(key)) return;
    seen.add(key);
    normalized.push(raw);
  });

  const all = !normalized.length || normalized.some(isAllAudienceToken);
  return {
    all,
    list: all ? [] : normalized
  };
}

function uniqueBy(arr = [], getKey = v => v) {
  const map = new Map();
  arr.forEach(item => map.set(getKey(item), item));
  return [...map.values()];
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* -------------------------------
   Tema
--------------------------------*/
function initTheme() {
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem(FF_CONFIG.STORAGE_KEYS.THEME, 'dark');
}

function toggleTheme() {
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem(FF_CONFIG.STORAGE_KEYS.THEME, 'dark');
}

/* -------------------------------
   Toast
--------------------------------*/
function ensureToastEl() {
  let el = document.getElementById('_ff_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = '_ff_toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  return el;
}

function showToast(message, type = 'success') {
  const el = ensureToastEl();
  el.className = `toast ${type} show`;
  el.textContent = message;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* -------------------------------
   Sesión y auth
--------------------------------*/
function getSession() {
  const local = safeJsonParse(localStorage.getItem(FF_CONFIG.STORAGE_KEYS.SESSION), null);
  if (local?.ok && local?.user?.id) {
    return local;
  }

  const session = safeJsonParse(sessionStorage.getItem(FF_CONFIG.STORAGE_KEYS.SESSION), null);
  if (session?.ok && session?.user?.id) {
    localStorage.setItem(FF_CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(session));
    return session;
  }

  return null;
}

function setSession(data) {
  localStorage.setItem(FF_CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(data));
  sessionStorage.setItem(FF_CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(data));
}

function clearSession() {
  localStorage.removeItem(FF_CONFIG.STORAGE_KEYS.SESSION);
  sessionStorage.removeItem(FF_CONFIG.STORAGE_KEYS.SESSION);
}

function isLoggedIn() {
  const session = getSession();
  return Boolean(session?.ok && session?.user?.id);
}

function getCurrentUser() {
  return getSession()?.user || null;
}

function isAdmin() {
  return getCurrentUser()?.rol === 'admin';
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

function requireAdmin() {
  if (!requireAuth()) return false;
  if (!isAdmin()) {
    showToast('No tienes acceso a esta sección.', 'error');
    window.location.href = 'home.html';
    return false;
  }
  return true;
}

/* -------------------------------
   API Apps Script
   IMPORTANTE: usamos GET para evitar CORS en GitHub Pages
--------------------------------*/
function normalizeAppsScriptUrl(url = '') {
  return String(url || '').trim();
}

async function apiCall(action, payload = {}) {
  const base = normalizeAppsScriptUrl(FF_CONFIG.APPS_SCRIPT_URL);
  if (!base) {
    throw new Error('Falta configurar FF_CONFIG.APPS_SCRIPT_URL');
  }

  const url = new URL(base);
  url.searchParams.set('action', action);
  url.searchParams.set('data', JSON.stringify(payload || {}));
  url.searchParams.set('_t', Date.now().toString());

  const res = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store'
  });

  const text = await res.text();
  const data = safeJsonParse(text, null);

  if (!res.ok) {
    throw new Error((data && data.error) || `Error ${res.status} de Apps Script`);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Respuesta inválida de Apps Script');
  }

  if (!data.ok) {
    throw new Error(data.error || 'Error de Apps Script');
  }

  return data;
}

async function loginUser(usuario, password) {
  return apiCall('login', { usuario, password });
}

async function createUser(payload) {
  return apiCall('createUser', payload);
}

async function listUsers() {
  return apiCall('listUsers', {});
}

async function updateUser(payload) {
  return apiCall('updateUser', payload);
}

async function deleteUserRemote(id) {
  return apiCall('deleteUser', { id });
}

async function addContent(payload) {
  return apiCall('addOrUpdateContent', payload);
}

async function deleteContentRemote(id, force = false) {
  return apiCall('deleteContent', { id, force });
}

async function addEpisode(payload) {
  return apiCall('addOrUpdateEpisode', payload);
}

async function deleteEpisodeRemote(id) {
  return apiCall('deleteEpisode', { id });
}

async function listCatalogFromApi() {
  return apiCall('listCatalog', {});
}

async function listEpisodesFromApi() {
  return apiCall('listEpisodes', {});
}

async function saveProgressRemote(payload) {
  return apiCall('saveProgress', payload);
}

async function getUserStateRemote(usuarioId) {
  return apiCall('getUserBootstrap', { usuarioId });
}

async function toggleFavoriteRemote(payload) {
  return apiCall('toggleFavorite', payload);
}

async function getVideoBaseUrlRemote() {
  return apiCall('getVideoBaseUrl', {});
}

async function setVideoBaseUrlRemote(url, source = 'manual') {
  return apiCall('setVideoBaseUrl', { url, source });
}

/* -------------------------------
   Worker Cloudflare
--------------------------------*/
function normalizeWorkerBaseUrl(url = '') {
  return String(url || '').replace(/\/$/, '');
}

function getAdminSecret() {
  return localStorage.getItem(FF_CONFIG.STORAGE_KEYS.ADMIN_SECRET) || '';
}

function setAdminSecret(secret) {
  localStorage.setItem(FF_CONFIG.STORAGE_KEYS.ADMIN_SECRET, secret || '');
}

function isAbsoluteHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function normalizeVideoBaseUrl(url = '') {
  return String(url || '').trim().replace(/\/+$/, '');
}

function getVideoBaseUrl() {
  return FF_STATE.videoBaseUrl
    || normalizeVideoBaseUrl(localStorage.getItem(FF_CONFIG.STORAGE_KEYS.VIDEO_BASE_URL) || '')
    || detectCurrentAppVideoBaseUrl();
}

function setVideoBaseUrl(url) {
  const normalized = normalizeVideoBaseUrl(url);
  FF_STATE.videoBaseUrl = normalized;
  FF_STATE.videoBaseLoaded = true;
  if (normalized) {
    localStorage.setItem(FF_CONFIG.STORAGE_KEYS.VIDEO_BASE_URL, normalized);
  } else {
    localStorage.removeItem(FF_CONFIG.STORAGE_KEYS.VIDEO_BASE_URL);
  }
  return normalized;
}

async function ensureVideoBaseUrlLoaded(force = false) {
  if (!force && FF_STATE.videoBaseLoaded) {
    return getVideoBaseUrl();
  }

  if (!force && FF_STATE.videoBaseLoadingPromise) {
    return FF_STATE.videoBaseLoadingPromise;
  }

  FF_STATE.videoBaseLoadingPromise = (async () => {
    const currentOrigin = detectCurrentAppVideoBaseUrl();
    const localValue = normalizeVideoBaseUrl(localStorage.getItem(FF_CONFIG.STORAGE_KEYS.VIDEO_BASE_URL) || '');
    let remoteValue = '';

    try {
      const remote = await getVideoBaseUrlRemote();
      remoteValue = normalizeVideoBaseUrl(remote?.url || '');
    } catch (error) {
      console.error(error);
    }

    const resolved = currentOrigin || remoteValue || localValue || '';
    setVideoBaseUrl(resolved);
    FF_STATE.videoBaseLoaded = true;
    FF_STATE.videoBaseLoadingPromise = null;
    return resolved;
  })();

  return FF_STATE.videoBaseLoadingPromise;
}

function detectCurrentAppVideoBaseUrl() {
  if (typeof window === 'undefined' || !window.location) return '';
  const { protocol, hostname, origin } = window.location;
  if (!/^https?:$/i.test(protocol || '')) return '';
  if (/trycloudflare\.com$/i.test(hostname || '')) return normalizeVideoBaseUrl(origin);
  return '';
}

function safeDecodeUriComponent(value = '') {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function joinPublicVideoUrl(base, path = '') {
  const cleanBase = normalizeVideoBaseUrl(base);
  const cleanPath = String(path || '').trim().replace(/^\/+/, '');
  if (!cleanPath) return '';
  if (!cleanBase) return cleanPath;

  const parts = cleanPath.split('?');
  const pathname = parts.shift() || '';
  const query = parts.length ? `?${parts.join('?')}` : '';
  const encodedPath = pathname
    .split('/')
    .filter(Boolean)
    .map(part => encodeURIComponent(safeDecodeUriComponent(part)))
    .join('/');

  return `${cleanBase}/${encodedPath}${query}`;
}

function extractQuickTunnelPath(url = '') {
  try {
    const parsed = new URL(String(url || '').trim());
    if (!/trycloudflare\.com$/i.test(parsed.hostname)) return '';
    return safeDecodeUriComponent(parsed.pathname || '').replace(/^\/+/, '');
  } catch {
    return '';
  }
}

async function workerRequest(path, options = {}) {
  if (!FF_CONFIG.WORKER_URL) {
    throw new Error('Falta configurar FF_CONFIG.WORKER_URL');
  }

  const headers = {
    ...(options.headers || {}),
    'X-Admin-Secret': getAdminSecret()
  };

  const base = normalizeWorkerBaseUrl(FF_CONFIG.WORKER_URL);
  const finalPath = String(path || '').startsWith('/') ? path : `/${path}`;

  const res = await fetch(`${base}${finalPath}`, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Error ${res.status} del Worker`);
  }
  return data;
}

async function uploadFileToR2(file) {
  const form = new FormData();
  form.append('file', file);
  return workerRequest('/upload', { method: 'POST', body: form });
}

async function listR2Files(options = {}) {
  const prefix = String(options.prefix || '').trim();
  const limit = Math.max(1, Math.min(1000, Number(options.limit) || 1000));
  const allFiles = [];
  let cursor = '';
  let pages = 0;

  while (pages < 25) {
    const params = new URLSearchParams();
    if (prefix) params.set('prefix', prefix);
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);

    const res = await workerRequest(`/list?${params.toString()}`, { method: 'GET' });
    allFiles.push(...(res.files || []));
    pages += 1;

    if (!res.truncated || !res.cursor) {
      return {
        ok: true,
        files: uniqueBy(allFiles, file => file.name)
      };
    }

    cursor = res.cursor;
  }

  return {
    ok: true,
    files: uniqueBy(allFiles, file => file.name)
  };
}

async function deleteR2File(name) {
  return workerRequest(`/delete?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
}

async function analyzeWithAI(titleToSearch, contentType, extraContext = '', extraPayload = {}) {
  return workerRequest('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titleToSearch, contentType, extraContext, ...extraPayload })
  });
}

async function getTrailerData({ title, contentType = 'pelicula', year = 0, seriesTitle = '' } = {}) {
  const params = new URLSearchParams();
  if (title) params.set('title', title);
  if (contentType) params.set('contentType', contentType);
  if (year) params.set('year', String(year));
  if (seriesTitle) params.set('seriesTitle', seriesTitle);
  return workerRequest(`/trailer?${params.toString()}`, { method: 'GET' });
}

function buildR2Url(fileName = '') {
  const raw = String(fileName || '').trim();
  if (!raw) return '';

  if (isAbsoluteHttpUrl(raw)) {
    const activeVideoBase = getVideoBaseUrl();
    const quickTunnelPath = activeVideoBase ? extractQuickTunnelPath(raw) : '';
    return quickTunnelPath ? joinPublicVideoUrl(activeVideoBase, quickTunnelPath) : raw;
  }

  return joinPublicVideoUrl(getVideoBaseUrl() || FF_CONFIG.R2_PUBLIC_BASE, raw);
}

/* -------------------------------
   TSV público para catálogo
--------------------------------*/
async function fetchTsv(url) {
  if (!url) return '';
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`No se pudo leer ${url}`);
  return res.text();
}

function parseTsv(text = '') {
  const clean = String(text || '').trim();
  if (!clean) return [];
  const lines = clean.split('\n').filter(Boolean);
  const headers = lines[0].split('\t').map(v => v.trim().replace(/\r/g, ''));
  return lines.slice(1).map(line => {
    const cols = line.split('\t').map(v => v.trim().replace(/\r/g, ''));
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] || '';
    });
    return row;
  });
}

function normalizeContentRow(row = {}) {
  const rawAudience = row.usuariosPermitidos || row.visibleToUsers || row.audiencia || row.visibleTo || '';
  const hasLegacyShift = !String(row.creadoPor || '').trim() && /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2})?$/.test(String(rawAudience || '').trim());
  const audience = normalizeAudienceTokens(hasLegacyShift ? 'todos' : rawAudience);
  const yearValue = Number(row.anio || row['año'] || row['aÃ±o']) || null;
  return {
    id: row.id || '',
    titulo: row.titulo || '',
    tituloOriginal: row.tituloOriginal || '',
    tipo: (row.tipo || 'pelicula').toLowerCase(),
    categoria: row.categoria || 'Familia',
    generos: splitTags(row.generos),
    anio: yearValue,
    ['a\u00f1o']: yearValue,
    sinopsis: row.sinopsis || '',
    tags: splitTags(row.tags),
    portadaUrl: row.portadaUrl || row.portadaId || '',
    backdropUrl: row.backdropUrl || '',
    logoUrl: row.logoUrl || row.titleLogoUrl || row.tituloLogoUrl || '',
    previewVideoUrl: row.previewVideoUrl || row.previewUrl || row.previewClipUrl || row.clipPreviewUrl || '',
    previewStart: row.previewStart || row.previewAt || row.previewOffset || row.previewStartSeconds || '',
    sagaId: row.sagaId || row.saga || row.collectionId || '',
    sagaTitulo: row.sagaTitulo || row.sagaTitle || row.collectionTitle || row.collection || '',
    sagaOrden: Number(row.sagaOrden || row.ordenSaga || row.collectionOrder || 0) || 0,
    sagaBackdropUrl: row.sagaBackdropUrl || row.collectionBackdropUrl || '',
    sagaPortadaUrl: row.sagaPortadaUrl || row.collectionPosterUrl || '',
    rating: normalizeRatingValue(row.rating || ''),
    ratingCount: normalizeRatingCount(row.ratingCount || 0),
    ratingSource: String(row.ratingSource || '').trim(),
    r2Url: row.r2Url || '',
    driveUrl: row.driveUrl || row.driveId || '',
    subtitulos: String(row.subtitulos || '').trim(),
    destacado: String(row.destacado || '').toLowerCase() === 'si',
    duracion: row.duracion || '',
    clasificacion: row.clasificacion || '',
    idioma: row.idioma || '',
    estado: (row.estado || 'activo').toLowerCase(),
    usuariosPermitidosRaw: audience.all ? 'todos' : audience.list.join(', '),
    usuariosPermitidos: audience.list,
    visibleToAll: audience.all,
    fechaRegistro: hasLegacyShift ? (row.usuariosPermitidos || '') : (row.fechaRegistro || ''),
    creadoPor: hasLegacyShift ? (row.fechaRegistro || '') : (row.creadoPor || '')
  };
}

function normalizeEpisodeRow(row = {}) {
  return {
    id: row.id || '',
    serieId: row.serieId || '',
    temporada: Number(row.temporada) || 1,
    numeroEpisodio: Number(row.numeroEpisodio || row.numero) || 1,
    titulo: row.titulo || '',
    tituloOriginal: row.tituloOriginal || '',
    sinopsis: row.sinopsis || '',
    duracion: row.duracion || '',
    r2Url: row.r2Url || '',
    driveUrl: row.driveUrl || row.driveId || '',
    portadaUrl: row.portadaUrl || row.portadaId || '',
    previewVideoUrl: row.previewVideoUrl || row.previewUrl || row.previewClipUrl || row.clipPreviewUrl || '',
    previewStart: row.previewStart || row.previewAt || row.previewOffset || row.previewStartSeconds || '',
    airDate: row.airDate || '',
    subtitulos: String(row.subtitulos || '').trim(),
    estado: (row.estado || 'activo').toLowerCase(),
    fechaRegistro: row.fechaRegistro || '',
    creadoPor: row.creadoPor || ''
  };
}

function pickApiList(res, keys = []) {
  for (const key of keys) {
    if (Array.isArray(res?.[key])) return res[key];
  }
  return [];
}

function readCatalogCache(storageKey, options = {}) {
  const allowExpired = Boolean(options.allowExpired);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];

    const payload = JSON.parse(raw);
    const ts = Number(payload?.ts || 0);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!ts || !items.length) return [];
    if (!allowExpired && Date.now() - ts > Number(FF_CONFIG.CATALOG_CACHE_TTL_MS || 0)) return [];
    return items;
  } catch (error) {
    console.warn('No se pudo leer cache local.', error);
    return [];
  }
}

function writeCatalogCache(storageKey, items = []) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      ts: Date.now(),
      items: Array.isArray(items) ? items : []
    }));
  } catch (error) {
    console.warn('No se pudo guardar cache local.', error);
  }
}

function progressLookupKey(itemType, contenidoId, episodioId = '') {
  return `${itemType || ''}::${contenidoId || ''}::${episodioId || ''}`;
}

function progressTimestamp(record = {}) {
  return new Date(record?.ultimaVisualizacion || 0).getTime() || 0;
}

function rebuildCatalogIndexes() {
  const contentById = new Map();
  const episodeById = new Map();
  const episodesBySeries = new Map();

  FF_STATE.content.forEach((item) => {
    contentById.set(String(item.id), item);
  });

  FF_STATE.episodes.forEach((episode) => {
    episodeById.set(String(episode.id), episode);
    if (episode.estado !== 'activo') return;

    const key = String(episode.serieId || '');
    if (!episodesBySeries.has(key)) episodesBySeries.set(key, []);
    episodesBySeries.get(key).push(episode);
  });

  episodesBySeries.forEach((list) => {
    list.sort((a, b) => (a.temporada - b.temporada) || (a.numeroEpisodio - b.numeroEpisodio));
  });

  FF_STATE.indexes.contentById = contentById;
  FF_STATE.indexes.episodeById = episodeById;
  FF_STATE.indexes.episodesBySeries = episodesBySeries;
}

function rebuildUserStateIndexes() {
  const favoriteKeys = new Set();
  const progressByKey = new Map();
  const latestSeriesProgressByContent = new Map();

  (FF_STATE.userState.favorites || []).forEach((favorite) => {
    favoriteKeys.add(favoriteKeyFor(favorite.tipo, favorite.contenidoId, favorite.episodioId));
  });

  (FF_STATE.userState.progress || []).forEach((record) => {
    const key = progressLookupKey(record.tipo, record.contenidoId, record.episodioId);
    const current = progressByKey.get(key);
    if (!current || progressTimestamp(record) >= progressTimestamp(current)) {
      progressByKey.set(key, record);
    }

    if (
      record.tipo !== 'episodio'
      || Number(record.porcentaje || 0) <= 0
      || String(record.completado || '').toLowerCase() === 'si'
    ) {
      return;
    }

    const contentKey = String(record.contenidoId || '');
    const currentSeriesRecord = latestSeriesProgressByContent.get(contentKey);
    if (!currentSeriesRecord || progressTimestamp(record) >= progressTimestamp(currentSeriesRecord)) {
      latestSeriesProgressByContent.set(contentKey, record);
    }
  });

  FF_STATE.indexes.favoriteKeys = favoriteKeys;
  FF_STATE.indexes.progressByKey = progressByKey;
  FF_STATE.indexes.latestSeriesProgressByContent = latestSeriesProgressByContent;
}

function setContentState(items = []) {
  FF_STATE.content = items.filter(item => item.id && item.estado !== 'oculto' && canUserAccessContent(item));
  rebuildCatalogIndexes();
  return FF_STATE.content;
}

function setEpisodesState(items = []) {
  FF_STATE.episodes = items.filter(item => item.id && item.estado !== 'oculto');
  rebuildCatalogIndexes();
  return FF_STATE.episodes;
}

function canUserAccessContent(item, user = getCurrentUser()) {
  if (!item?.id) return false;
  if (!user?.id) return true;
  if (String(user.rol || '').toLowerCase() === 'admin') return true;

  const audience = normalizeAudienceTokens(
    item.usuariosPermitidosRaw || item.usuariosPermitidos || item.visibleToUsers || ''
  );
  if (audience.all) return true;

  const userKeys = new Set(
    [user.id, user.usuario]
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  );

  return audience.list.some(entry => userKeys.has(String(entry || '').trim().toLowerCase()));
}

async function fetchContent(options = {}) {
  const force = Boolean(options?.force);
  const preferApi = Boolean(options?.preferApi);

  if (!force && FF_STATE.content.length) return FF_STATE.content;
  if (!force && FF_STATE.contentLoadingPromise) return FF_STATE.contentLoadingPromise;

  if (!force) {
    const cachedItems = readCatalogCache(FF_CONFIG.STORAGE_KEYS.CONTENT_CACHE, { allowExpired: true })
      .map(normalizeContentRow)
      .filter(item => item.id && item.estado !== 'oculto');
    if (cachedItems.length && !FF_STATE.content.length) {
      setContentState(cachedItems);
    }
  }

  FF_STATE.contentLoadingPromise = (async () => {
    ensureVideoBaseUrlLoaded();
    const previousItems = [...FF_STATE.content];

    const sources = preferApi
      ? [
          async () => {
            const res = await listCatalogFromApi();
            return pickApiList(res, ['content', 'catalog', 'items']);
          },
          async () => parseTsv(await fetchTsv(FF_CONFIG.SHEETS.CONTENT_TSV))
        ]
      : [
          async () => parseTsv(await fetchTsv(FF_CONFIG.SHEETS.CONTENT_TSV)),
          async () => {
            const res = await listCatalogFromApi();
            return pickApiList(res, ['content', 'catalog', 'items']);
          }
        ];

    let gotEmptyResponse = false;
    let successfulLoads = 0;

    try {
      for (const loadItems of sources) {
        try {
          const items = (await loadItems())
            .map(normalizeContentRow)
            .filter(item => item.id && item.estado !== 'oculto');
          successfulLoads++;
          if (items.length) {
            writeCatalogCache(FF_CONFIG.STORAGE_KEYS.CONTENT_CACHE, items);
            return setContentState(items);
          }
          gotEmptyResponse = true;
        } catch (error) {
          console.error(error);
        }
      }

      if (gotEmptyResponse && successfulLoads > 0) {
        writeCatalogCache(FF_CONFIG.STORAGE_KEYS.CONTENT_CACHE, []);
        return setContentState([]);
      }

      return previousItems.length ? setContentState(previousItems) : FF_STATE.content;
    } finally {
      FF_STATE.contentLoadingPromise = null;
    }
  })();

  return FF_STATE.contentLoadingPromise;
}

async function fetchEpisodes(options = {}) {
  const force = Boolean(options?.force);
  const preferApi = Boolean(options?.preferApi);

  if (!force && FF_STATE.episodes.length) return FF_STATE.episodes;
  if (!force && FF_STATE.episodesLoadingPromise) return FF_STATE.episodesLoadingPromise;

  if (!force) {
    const cachedItems = readCatalogCache(FF_CONFIG.STORAGE_KEYS.EPISODES_CACHE, { allowExpired: true })
      .map(normalizeEpisodeRow)
      .filter(item => item.id && item.estado !== 'oculto');
    if (cachedItems.length && !FF_STATE.episodes.length) {
      setEpisodesState(cachedItems);
    }
  }

  FF_STATE.episodesLoadingPromise = (async () => {
    ensureVideoBaseUrlLoaded();
    const previousItems = [...FF_STATE.episodes];

    const sources = preferApi
      ? [
          async () => {
            const res = await listEpisodesFromApi();
            return pickApiList(res, ['episodes', 'items']);
          },
          async () => parseTsv(await fetchTsv(FF_CONFIG.SHEETS.EPISODES_TSV))
        ]
      : [
          async () => parseTsv(await fetchTsv(FF_CONFIG.SHEETS.EPISODES_TSV)),
          async () => {
            const res = await listEpisodesFromApi();
            return pickApiList(res, ['episodes', 'items']);
          }
        ];

    let gotEmptyResponse = false;
    let successfulLoads = 0;

    try {
      for (const loadItems of sources) {
        try {
          const items = (await loadItems())
            .map(normalizeEpisodeRow)
            .filter(item => item.id && item.estado !== 'oculto');
          successfulLoads++;
          if (items.length) {
            writeCatalogCache(FF_CONFIG.STORAGE_KEYS.EPISODES_CACHE, items);
            return setEpisodesState(items);
          }
          gotEmptyResponse = true;
        } catch (error) {
          console.error(error);
        }
      }

      if (gotEmptyResponse && successfulLoads > 0) {
        writeCatalogCache(FF_CONFIG.STORAGE_KEYS.EPISODES_CACHE, []);
        return setEpisodesState([]);
      }

      return previousItems.length ? setEpisodesState(previousItems) : FF_STATE.episodes;
    } finally {
      FF_STATE.episodesLoadingPromise = null;
    }
  })();

  return FF_STATE.episodesLoadingPromise;
}

async function loadCatalog(options = {}) {
  await Promise.all([fetchContent(options), fetchEpisodes(options)]);
  return {
    content: FF_STATE.content,
    episodes: FF_STATE.episodes
  };
}

/* -------------------------------
   Estado del usuario
--------------------------------*/
async function loadUserState() {
  const user = getCurrentUser();
  if (!user?.id) {
    FF_STATE.userState = { progress: [], favorites: [], continueWatching: [] };
    rebuildUserStateIndexes();
    return FF_STATE.userState;
  }

  if (FF_STATE.userStateLoadingPromise) return FF_STATE.userStateLoadingPromise;

  FF_STATE.userStateLoadingPromise = (async () => {
    try {
      const res = await getUserStateRemote(user.id);
      FF_STATE.userState = {
        progress: res.progress || [],
        favorites: res.favorites || [],
        continueWatching: res.continueWatching || []
      };
      rebuildUserStateIndexes();
      return FF_STATE.userState;
    } catch (error) {
      console.error(error);
      FF_STATE.userState = { progress: [], favorites: [], continueWatching: [] };
      rebuildUserStateIndexes();
      return FF_STATE.userState;
    } finally {
      FF_STATE.userStateLoadingPromise = null;
    }
  })();

  return FF_STATE.userStateLoadingPromise;
}

function favoriteKeyFor(itemType, contenidoId, episodioId = '') {
  return `${itemType}::${contenidoId || ''}::${episodioId || ''}`;
}

function isFavorite(itemType, contenidoId, episodioId = '') {
  const key = favoriteKeyFor(itemType, contenidoId, episodioId);
  return FF_STATE.indexes.favoriteKeys.has(key);
}

function getProgressRecord(itemType, contenidoId, episodioId = '') {
  return FF_STATE.indexes.progressByKey.get(progressLookupKey(itemType, contenidoId, episodioId)) || null;
}

function getProgressPercent(itemType, contenidoId, episodioId = '') {
  return Number(getProgressRecord(itemType, contenidoId, episodioId)?.porcentaje || 0);
}

function getContentProgressState(item = {}) {
  if (!item?.id) {
    return { hasProgress: false, percent: 0, record: null, type: item?.tipo || '' };
  }

  if (item.tipo === 'pelicula') {
    const record = getProgressRecord('pelicula', item.id, '');
    const percent = Number(record?.porcentaje || 0);
    return {
      hasProgress: percent > 0 && percent < 100,
      percent,
      record,
      type: 'pelicula'
    };
  }

  const record = FF_STATE.indexes.latestSeriesProgressByContent.get(String(item.id)) || null;

  const percent = Number(record?.porcentaje || 0);
  return {
    hasProgress: percent > 0,
    percent,
    record,
    type: 'serie'
  };
}

function getEpisodeProgressState(contenidoId, episodioId = '', fallbackDuration = '') {
  const record = getProgressRecord('episodio', contenidoId, episodioId);
  const viewedSeconds = Math.max(0, Math.floor(Number(record?.segundosVistos || 0)));
  const durationFromRecord = Math.max(0, Math.floor(Number(record?.duracionSegundos || 0)));
  const fallbackSeconds = parseDurationToSeconds(fallbackDuration);
  const durationSeconds = durationFromRecord || fallbackSeconds;
  const percent = durationSeconds
    ? Math.min(100, Math.round((viewedSeconds / durationSeconds) * 100))
    : Number(record?.porcentaje || 0);

  return {
    record,
    viewedSeconds,
    durationSeconds,
    percent,
    hasProgress: viewedSeconds > 0 || percent > 0
  };
}

function getContinueWatchingItems() {
  const progress = [...(FF_STATE.userState.progress || [])]
    .filter(p => Number(p.porcentaje) > 0 && String(p.completado || '').toLowerCase() !== 'si')
    .sort((a, b) => progressTimestamp(b) - progressTimestamp(a));

  return progress.map(p => {
    if (p.tipo === 'pelicula') {
      const item = FF_STATE.indexes.contentById.get(String(p.contenidoId || ''));
      if (!item) return null;
      return { kind: 'content', item, progress: p };
    }

    const ep = FF_STATE.indexes.episodeById.get(String(p.episodioId || ''));
    const serie = FF_STATE.indexes.contentById.get(String(p.contenidoId || ''));
    if (!ep || !serie) return null;
    return { kind: 'episode', episode: ep, serie, progress: p };
  }).filter(Boolean);
}

async function toggleFavorite(itemType, contenidoId, episodioId = '') {
  const user = getCurrentUser();
  if (!user?.id) throw new Error('No hay usuario autenticado');

  const payload = {
    usuarioId: user.id,
    tipo: itemType,
    contenidoId,
    episodioId
  };

  const res = await toggleFavoriteRemote(payload);
  await loadUserState();
  return res;
}

async function savePlaybackProgress({
  tipo,
  contenidoId,
  episodioId = '',
  temporada = '',
  numeroEpisodio = '',
  segundosVistos = 0,
  duracionSegundos = 0,
  completado = 'no'
}) {
  const user = getCurrentUser();
  if (!user?.id) throw new Error('No hay usuario autenticado');

  const porcentaje = duracionSegundos > 0
    ? Math.min(100, Math.round((Number(segundosVistos || 0) / Number(duracionSegundos || 1)) * 100))
    : 0;

  const payload = {
    usuarioId: user.id,
    contenidoId,
    episodioId,
    tipo,
    temporada,
    numeroEpisodio,
    segundosVistos: Number(segundosVistos || 0),
    duracionSegundos: Number(duracionSegundos || 0),
    porcentaje,
    completado,
    ultimaVisualizacion: fmtDateTime()
  };

  const res = await saveProgressRemote(payload);
  await loadUserState();
  return res;
}

/* -------------------------------
   Consultas y helpers de catálogo
--------------------------------*/
function getSeriesEpisodes(serieId) {
  const serie = getContentById(serieId);
  if (!serie || !canUserAccessContent(serie)) return [];
  return FF_STATE.indexes.episodesBySeries.get(String(serieId)) || [];
}

function buildSeasonsMap(episodes = []) {
  const map = new Map();
  episodes.forEach(ep => {
    const season = Number(ep.temporada) || 1;
    if (!map.has(season)) map.set(season, []);
    map.get(season).push(ep);
  });
  for (const [, list] of map.entries()) {
    list.sort((a, b) => a.numeroEpisodio - b.numeroEpisodio);
  }
  return map;
}

function getContentById(id) {
  return FF_STATE.indexes.contentById.get(String(id)) || null;
}

function getEpisodeById(id) {
  return FF_STATE.indexes.episodeById.get(String(id)) || null;
}

function getFeaturedContent() {
  return FF_STATE.content.filter(item => item.estado === 'activo' && item.destacado);
}

function getMovies() {
  return FF_STATE.content.filter(item => item.estado === 'activo' && item.tipo === 'pelicula');
}

function getSeries() {
  return FF_STATE.content.filter(item => item.estado === 'activo' && item.tipo === 'serie');
}

function searchCatalog(query = '') {
  const q = slugify(query);
  if (!q) return FF_STATE.content.filter(item => item.estado === 'activo');

  return FF_STATE.content.filter(item => {
    const haystack = [
      item.titulo,
      item.tituloOriginal,
      item.categoria,
      ...(item.generos || []),
      ...(item.tags || []),
      item.sinopsis
    ].join(' ');

    return slugify(haystack).includes(q);
  });
}

function getCategories() {
  const values = FF_STATE.content
    .filter(item => item.estado === 'activo')
    .flatMap(item => [item.categoria, ...(item.generos || [])])
    .filter(Boolean)
    .map(v => String(v).trim());

  return uniqueBy(values, v => v).sort((a, b) => a.localeCompare(b, 'es'));
}

function getItemsByCategory(category = '') {
  const target = String(category || '').trim().toLowerCase();
  return FF_STATE.content.filter(item => {
    const set = [item.categoria, ...(item.generos || [])].map(v => String(v || '').trim().toLowerCase());
    return set.includes(target) && item.estado === 'activo';
  });
}

function getHeroItem() {
  return getFeaturedContent()[0] || FF_STATE.content.find(item => item.estado === 'activo') || null;
}

function getPlayableUrl(item = {}) {
  return buildR2Url(item.r2Url || '') || item.driveUrl || '';
}

function isDriveUrl(url = '') {
  return /drive\.google\.com/i.test(String(url || ''));
}

function toDrivePreviewUrl(url = '') {
  const txt = String(url || '').trim();
  if (!txt) return '';

  const matchId = txt.match(/\/d\/([^/]+)/) || txt.match(/[?&]id=([^&]+)/);
  const driveId = matchId?.[1] || txt;
  return `https://drive.google.com/file/d/${driveId}/preview`;
}

/* -------------------------------
   Render helpers
--------------------------------*/
function mediaCardImage(url, fallback = '🎬', title = '') {
  if (url) {
    return `<div class="media-image-shell" data-media-fallback="true"><img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" data-fallback="${escapeHtml(fallback)}" data-title="${escapeHtml(title)}" onerror="handleMediaImageError(this)"></div>`;
  }
  return buildMediaFallbackMarkup(fallback, title);
}

function buildMediaFallbackMarkup(fallback = '🎬', title = '') {
  const safeFallback = escapeHtml(fallback);
  const safeTitle = escapeHtml(String(title || '').trim());
  return `
    <div class="media-fallback">
      <strong>${safeFallback}</strong>
      ${safeTitle ? `<span>${safeTitle}</span>` : ''}
    </div>
  `;
}

function mediaYear(item = {}) {
  return item.anio || item['año'] || item['aÃ±o'] || '';
}

function handleMediaImageError(imgEl) {
  if (!imgEl) return;
  const fallback = imgEl.getAttribute('data-fallback') || '🎬';
  const title = imgEl.getAttribute('data-title') || imgEl.getAttribute('alt') || '';
  const container = imgEl.closest('[data-media-fallback]');
  if (container) {
    container.innerHTML = buildMediaFallbackMarkup(fallback, title);
  }
}

function mediaBadge(itemType, progressPercent) {
  if (progressPercent >= 100) return '<div class="badge badge-done">✓ Visto</div>';
  if (progressPercent > 0) return `<div class="badge badge-wip">${progressPercent}%</div>`;
  return itemType === 'serie'
    ? '<div class="badge badge-serie">SERIE</div>'
    : '<div class="badge badge-new">NUEVO</div>';
}

function buildMediaCard(item) {
  const type = item.tipo || 'pelicula';
  const progress = getContentProgressState(item).percent;
  const img = mediaCardImage(item.portadaUrl, type === 'serie' ? '📺' : '🎬', item.titulo);
  const year = mediaYear(item);
  const metaText = [
    item.categoria || '',
    year ? String(year) : '',
    formatRatingShortText(item)
  ].filter(Boolean).join(' • ');
  return `
    <article class="media-card" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(type)}">
      <button class="media-card__btn" type="button" onclick="openContentDetail('${escapeHtml(item.id)}')">
        <div class="media-card__image">${img}</div>
        ${mediaBadge(type, progress)}
        <div class="media-card__body">
          <h3 class="media-card__title">${escapeHtml(item.titulo)}</h3>
          <p class="media-card__meta">${escapeHtml(metaText)}</p>
        </div>
      </button>
    </article>
  `;
}

function buildEpisodeCard(ep, serie) {
  const progress = getProgressPercent('episodio', serie.id, ep.id);
  const img = mediaCardImage(ep.portadaUrl || serie.portadaUrl, '🎞️', ep.titulo || serie.titulo);
  return `
    <article class="episode-card" data-id="${escapeHtml(ep.id)}">
      <button class="episode-card__btn" type="button" onclick="goToPlayer('${escapeHtml(serie.id)}','${escapeHtml(ep.id)}')">
        <div class="episode-card__image">${img}</div>
        ${mediaBadge('episodio', progress)}
        <div class="episode-card__body">
          <h4 class="episode-card__title">T${ep.temporada} · E${ep.numeroEpisodio} · ${escapeHtml(ep.titulo)}</h4>
          <p class="episode-card__meta">${escapeHtml(ep.duracion || '')}</p>
        </div>
      </button>
    </article>
  `;
}

/* -------------------------------
   Navegación
--------------------------------*/
function goToHome() {
  window.location.href = 'home.html';
}

function goToAdmin() {
  window.location.href = 'admin.html';
}

function goToPlayer(contenidoId, episodioId = '') {
  const url = new URL('player.html', window.location.href);
  url.searchParams.set('id', contenidoId);
  if (episodioId) url.searchParams.set('episode', episodioId);
  window.location.href = url.toString();
}

function openContentDetail(contenidoId) {
  const item = getContentById(contenidoId);
  if (!item) return;

  const modal = document.getElementById('detailModal');
  if (!modal) {
    if (item.tipo === 'pelicula') {
      goToPlayer(item.id);
    }
    return;
  }

  const titleEl = modal.querySelector('[data-detail="title"]');
  const metaEl = modal.querySelector('[data-detail="meta"]');
  const synopsisEl = modal.querySelector('[data-detail="synopsis"]');
  const imageEl = modal.querySelector('[data-detail="image"]');
  const actionsEl = modal.querySelector('[data-detail="actions"]');
  const seasonsEl = modal.querySelector('[data-detail="seasons"]');
  const metaValues = [item.categoria, mediaYear(item)]
    .filter(Boolean)
    .map((value) => `<span class="modal-meta-item">${escapeHtml(String(value))}</span>`);
  const ratingMarkup = buildRatingPill(item, { showCount: true, showSource: true });

  if (titleEl) titleEl.textContent = item.titulo || '';
  if (metaEl) metaEl.innerHTML = [...metaValues, ratingMarkup].filter(Boolean).join('');
  if (synopsisEl) synopsisEl.textContent = item.sinopsis || 'Sin sinopsis disponible.';
  if (imageEl) imageEl.innerHTML = mediaCardImage(item.portadaUrl, item.tipo === 'serie' ? '📺' : '🎬', item.titulo);

  if (actionsEl) {
    const favText = isFavorite(item.tipo, item.id) ? 'Quitar favorito' : 'Favorito';
    actionsEl.innerHTML = `
      <button class="btn btn-primary" type="button" onclick="${item.tipo === 'serie' ? `playFirstEpisode('${escapeHtml(item.id)}')` : `goToPlayer('${escapeHtml(item.id)}')`}">
        ▶ Reproducir
      </button>
      <button class="btn btn-secondary" type="button" onclick="toggleFavoriteFromUI('${escapeHtml(item.tipo)}','${escapeHtml(item.id)}','')">♡ ${favText}</button>
      <button class="btn btn-ghost" type="button" onclick="closeDetailModal()">Cerrar</button>
    `;
  }

  if (seasonsEl) {
    if (item.tipo !== 'serie') {
      seasonsEl.innerHTML = '';
    } else {
      const episodes = getSeriesEpisodes(item.id);
      const seasons = buildSeasonsMap(episodes);
      seasonsEl.innerHTML = [...seasons.entries()].map(([season, eps]) => `
        <section class="season-block">
          <h4>Temporada ${season}</h4>
          <div class="episode-grid">
            ${eps.map(ep => buildEpisodeCard(ep, item)).join('')}
          </div>
        </section>
      `).join('');
    }
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeDetailModal() {
  const modal = document.getElementById('detailModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function playFirstEpisode(serieId) {
  const first = getSeriesEpisodes(serieId)[0];
  if (!first) {
    showToast('Esta serie todavía no tiene episodios.', 'error');
    return;
  }
  goToPlayer(serieId, first.id);
}

async function toggleFavoriteFromUI(tipo, contenidoId, episodioId = '') {
  try {
    await toggleFavorite(tipo, contenidoId, episodioId);
    showToast('Favoritos actualizados.');
    return true;
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo actualizar favorito.', 'error');
    return false;
  }
}

/* -------------------------------
   Navegacion TV / teclado
--------------------------------*/
const FF_TV_NAV = {
  focusClass: 'ff-tv-focusable',
  activeClass: 'is-tv-focus',
  nativeSelector: 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"]',
  enrichSelector: '[onclick], .episode-link, [data-tv-focus]'
};

let ffTvNavigationBooted = false;

function isNativeFocusableElement(el) {
  return el instanceof HTMLElement && el.matches(FF_TV_NAV.nativeSelector);
}

function isManualTextEntry(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.matches('textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
  if (!el.matches('input')) return false;
  return !el.matches('[type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"]');
}

function hasFocusableChild(el) {
  return el instanceof HTMLElement
    && Boolean(el.querySelector('a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"]'));
}

function shouldPrepareCustomFocusable(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (isNativeFocusableElement(el)) return false;
  if (el.matches('html, body, label, form, .modal-bd, [data-tv-ignore]')) return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  if (hasFocusableChild(el)) return false;
  return true;
}

function markTvFocusable(el) {
  if (!(el instanceof HTMLElement)) return;
  el.classList.add(FF_TV_NAV.focusClass);
}

function prepareTvFocusableElements(root = document) {
  const scope = root?.querySelectorAll ? root : document;

  qsa(FF_TV_NAV.nativeSelector, scope).forEach(markTvFocusable);
  qsa(FF_TV_NAV.enrichSelector, scope).forEach((el) => {
    if (!shouldPrepareCustomFocusable(el)) return;
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    markTvFocusable(el);
  });
}

function isTvCandidateVisible(el) {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false;
  if (el.hidden || el.closest('[hidden], [inert]')) return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getTvFocusCandidates() {
  return uniqueBy(qsa(`.${FF_TV_NAV.focusClass}`), el => el).filter(isTvCandidateVisible);
}

function getTvRect(el) {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    centerX: rect.left + (rect.width / 2),
    centerY: rect.top + (rect.height / 2)
  };
}

function sortTvCandidatesByReadingOrder(candidates = []) {
  return [...candidates].sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    const topDiff = rectA.top - rectB.top;
    if (Math.abs(topDiff) > 10) return topDiff;
    return rectA.left - rectB.left;
  });
}

function focusTvElement(el) {
  if (!(el instanceof HTMLElement)) return false;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return document.activeElement === el;
}

function getDirectionalScore(currentRect, candidateRect, direction) {
  const dx = candidateRect.centerX - currentRect.centerX;
  const dy = candidateRect.centerY - currentRect.centerY;

  let primary = 0;
  let secondary = 0;
  let overlap = 0;

  if (direction === 'left') {
    if (dx >= -6) return Number.POSITIVE_INFINITY;
    primary = Math.abs(dx);
    secondary = Math.abs(dy);
    overlap = Math.max(0, Math.min(currentRect.bottom, candidateRect.bottom) - Math.max(currentRect.top, candidateRect.top));
  } else if (direction === 'right') {
    if (dx <= 6) return Number.POSITIVE_INFINITY;
    primary = dx;
    secondary = Math.abs(dy);
    overlap = Math.max(0, Math.min(currentRect.bottom, candidateRect.bottom) - Math.max(currentRect.top, candidateRect.top));
  } else if (direction === 'up') {
    if (dy >= -6) return Number.POSITIVE_INFINITY;
    primary = Math.abs(dy);
    secondary = Math.abs(dx);
    overlap = Math.max(0, Math.min(currentRect.right, candidateRect.right) - Math.max(currentRect.left, candidateRect.left));
  } else if (direction === 'down') {
    if (dy <= 6) return Number.POSITIVE_INFINITY;
    primary = dy;
    secondary = Math.abs(dx);
    overlap = Math.max(0, Math.min(currentRect.right, candidateRect.right) - Math.max(currentRect.left, candidateRect.left));
  } else {
    return Number.POSITIVE_INFINITY;
  }

  return (primary * 1000) + (secondary * 20) - overlap;
}

function moveTvFocus(direction) {
  const candidates = getTvFocusCandidates();
  if (!candidates.length) return false;

  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!(active instanceof HTMLElement) || !active.classList.contains(FF_TV_NAV.focusClass)) {
    return focusTvElement(sortTvCandidatesByReadingOrder(candidates)[0]);
  }

  const currentRect = getTvRect(active);
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  candidates.forEach((candidate) => {
    if (candidate === active) return;
    const score = getDirectionalScore(currentRect, getTvRect(candidate), direction);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return best ? focusTvElement(best) : false;
}

function updateTvActiveClass(nextFocused = null) {
  qsa(`.${FF_TV_NAV.focusClass}.${FF_TV_NAV.activeClass}`).forEach((el) => {
    if (el !== nextFocused) el.classList.remove(FF_TV_NAV.activeClass);
  });
  if (nextFocused instanceof HTMLElement) {
    nextFocused.classList.add(FF_TV_NAV.activeClass);
  }
}

function handleTvFocusIn(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest(`.${FF_TV_NAV.focusClass}`) : null;
  updateTvActiveClass(target);
}

function handleTvFocusOut(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest(`.${FF_TV_NAV.focusClass}`) : null;
  if (target && document.activeElement !== target) {
    target.classList.remove(FF_TV_NAV.activeClass);
  }
}

function handleTvNavigationKeydown(event) {
  const key = event.key;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (key === 'Enter' || key === ' ') {
    if (!active || isNativeFocusableElement(active) || isManualTextEntry(active)) return;
    if (!active.classList.contains(FF_TV_NAV.focusClass)) return;
    event.preventDefault();
    active.click();
    return;
  }

  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;
  if (active && isManualTextEntry(active)) return;

  event.preventDefault();
  moveTvFocus(key.replace('Arrow', '').toLowerCase());
}

function initTvNavigation() {
  return;
  if (ffTvNavigationBooted) return;
  ffTvNavigationBooted = true;

  const start = () => {
    prepareTvFocusableElements(document);

    document.addEventListener('keydown', handleTvNavigationKeydown, true);
    document.addEventListener('focusin', handleTvFocusIn, true);
    document.addEventListener('focusout', handleTvFocusOut, true);

    const rescan = debounce(() => prepareTvFocusableElements(document), 80);
    const observer = new MutationObserver(rescan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'disabled', 'tabindex', 'role']
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
    return;
  }

  start();
}

/* -------------------------------
   Inicialización global
--------------------------------*/
function bootstrapShared() {
  initTheme();

  Object.assign(window, {
    FF_CONFIG,
    FF_STATE,
    escapeHtml,
    slugify,
    fmtDateTime,
    fmtDurationSeconds,
    parseDurationToSeconds,
    safeJsonParse,
    debounce,
    handleMediaImageError,
    splitTags,
    qs,
    qsa,
    sleep,
    initTheme,
    toggleTheme,
    showToast,
    getSession,
    setSession,
    clearSession,
    isLoggedIn,
    getCurrentUser,
    isAdmin,
    logout,
    requireAuth,
    requireAdmin,
    apiCall,
    loginUser,
    createUser,
    listUsers,
    updateUser,
    deleteUserRemote,
    addContent,
    deleteContentRemote,
    addEpisode,
    deleteEpisodeRemote,
    listCatalogFromApi,
    listEpisodesFromApi,
    saveProgressRemote,
    getUserStateRemote,
    toggleFavoriteRemote,
    getVideoBaseUrlRemote,
    setVideoBaseUrlRemote,
    ensureVideoBaseUrlLoaded,
    getAdminSecret,
    setAdminSecret,
    getVideoBaseUrl,
    setVideoBaseUrl,
    isAbsoluteHttpUrl,
    workerRequest,
    uploadFileToR2,
    listR2Files,
    deleteR2File,
    analyzeWithAI,
    getTrailerData,
    buildR2Url,
    fetchTsv,
    parseTsv,
    normalizeContentRow,
    normalizeEpisodeRow,
    getRatingState,
    formatRatingShortText,
    buildRatingPill,
    fetchContent,
    fetchEpisodes,
    loadCatalog,
    loadUserState,
    favoriteKeyFor,
    isFavorite,
    canUserAccessContent,
    getProgressRecord,
    getProgressPercent,
    getContentProgressState,
    getEpisodeProgressState,
    getContinueWatchingItems,
    toggleFavorite,
    savePlaybackProgress,
    getSeriesEpisodes,
    buildSeasonsMap,
    getContentById,
    getEpisodeById,
    getFeaturedContent,
    getMovies,
    getSeries,
    searchCatalog,
    getCategories,
    getItemsByCategory,
    getHeroItem,
    getPlayableUrl,
    isDriveUrl,
    toDrivePreviewUrl,
    mediaCardImage,
    mediaBadge,
    buildMediaCard,
    buildEpisodeCard,
    goToHome,
    goToAdmin,
    goToPlayer,
    openContentDetail,
    closeDetailModal,
    playFirstEpisode,
    toggleFavoriteFromUI
  });
}

bootstrapShared();

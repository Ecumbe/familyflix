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
    ADMIN_SECRET: 'ff_admin_secret'
  }
};

const FF_STATE = {
  content: [],
  episodes: [],
  userState: {
    progress: [],
    favorites: [],
    continueWatching: []
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
  const saved = localStorage.getItem(FF_CONFIG.STORAGE_KEYS.THEME);
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    return;
  }
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(FF_CONFIG.STORAGE_KEYS.THEME, next);
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
  return safeJsonParse(sessionStorage.getItem(FF_CONFIG.STORAGE_KEYS.SESSION), null);
}

function setSession(data) {
  sessionStorage.setItem(FF_CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(data));
}

function clearSession() {
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

async function addContent(payload) {
  return apiCall('addOrUpdateContent', payload);
}

async function addEpisode(payload) {
  return apiCall('addOrUpdateEpisode', payload);
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

async function listR2Files() {
  return workerRequest('/list', { method: 'GET' });
}

async function deleteR2File(name) {
  return workerRequest(`/delete?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
}

async function analyzeWithAI(titleToSearch, contentType, extraContext = '') {
  return workerRequest('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titleToSearch, contentType, extraContext })
  });
}

function buildR2Url(fileName = '') {
  return `${FF_CONFIG.R2_PUBLIC_BASE}${encodeURIComponent(fileName)}`;
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
  return {
    id: row.id || '',
    titulo: row.titulo || '',
    tituloOriginal: row.tituloOriginal || '',
    tipo: (row.tipo || 'pelicula').toLowerCase(),
    categoria: row.categoria || 'Familia',
    generos: splitTags(row.generos),
    año: Number(row.año) || null,
    sinopsis: row.sinopsis || '',
    tags: splitTags(row.tags),
    portadaUrl: row.portadaUrl || row.portadaId || '',
    backdropUrl: row.backdropUrl || '',
    r2Url: row.r2Url || '',
    driveUrl: row.driveUrl || row.driveId || '',
    destacado: String(row.destacado || '').toLowerCase() === 'si',
    duracion: row.duracion || '',
    clasificacion: row.clasificacion || '',
    idioma: row.idioma || '',
    estado: (row.estado || 'activo').toLowerCase(),
    fechaRegistro: row.fechaRegistro || '',
    creadoPor: row.creadoPor || ''
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
    airDate: row.airDate || '',
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

async function fetchContent() {
  try {
    const tsv = await fetchTsv(FF_CONFIG.SHEETS.CONTENT_TSV);
    const items = parseTsv(tsv)
      .map(normalizeContentRow)
      .filter(item => item.id && item.estado !== 'oculto');
    if (items.length) {
      FF_STATE.content = items;
      return FF_STATE.content;
    }
  } catch (error) {
    console.error(error);
  }

  try {
    const res = await listCatalogFromApi();
    FF_STATE.content = pickApiList(res, ['content', 'catalog', 'items'])
      .map(normalizeContentRow)
      .filter(item => item.id && item.estado !== 'oculto');
    return FF_STATE.content;
  } catch (error) {
    console.error(error);
    FF_STATE.content = [];
    return [];
  }
}

async function fetchEpisodes() {
  try {
    const tsv = await fetchTsv(FF_CONFIG.SHEETS.EPISODES_TSV);
    const items = parseTsv(tsv)
      .map(normalizeEpisodeRow)
      .filter(item => item.id && item.estado !== 'oculto');
    if (items.length) {
      FF_STATE.episodes = items;
      return FF_STATE.episodes;
    }
  } catch (error) {
    console.error(error);
  }

  try {
    const res = await listEpisodesFromApi();
    FF_STATE.episodes = pickApiList(res, ['episodes', 'items'])
      .map(normalizeEpisodeRow)
      .filter(item => item.id && item.estado !== 'oculto');
    return FF_STATE.episodes;
  } catch (error) {
    console.error(error);
    FF_STATE.episodes = [];
    return [];
  }
}

async function loadCatalog() {
  await Promise.all([fetchContent(), fetchEpisodes()]);
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
    return FF_STATE.userState;
  }

  try {
    const res = await getUserStateRemote(user.id);
    FF_STATE.userState = {
      progress: res.progress || [],
      favorites: res.favorites || [],
      continueWatching: res.continueWatching || []
    };
    return FF_STATE.userState;
  } catch (error) {
    console.error(error);
    FF_STATE.userState = { progress: [], favorites: [], continueWatching: [] };
    return FF_STATE.userState;
  }
}

function favoriteKeyFor(itemType, contenidoId, episodioId = '') {
  return `${itemType}::${contenidoId || ''}::${episodioId || ''}`;
}

function isFavorite(itemType, contenidoId, episodioId = '') {
  const key = favoriteKeyFor(itemType, contenidoId, episodioId);
  return (FF_STATE.userState.favorites || []).some(f =>
    favoriteKeyFor(f.tipo, f.contenidoId, f.episodioId) === key
  );
}

function getProgressRecord(itemType, contenidoId, episodioId = '') {
  return (FF_STATE.userState.progress || []).find(p =>
    p.tipo === itemType &&
    String(p.contenidoId || '') === String(contenidoId || '') &&
    String(p.episodioId || '') === String(episodioId || '')
  ) || null;
}

function getProgressPercent(itemType, contenidoId, episodioId = '') {
  return Number(getProgressRecord(itemType, contenidoId, episodioId)?.porcentaje || 0);
}

function getContinueWatchingItems() {
  const progress = [...(FF_STATE.userState.progress || [])]
    .filter(p => Number(p.porcentaje) > 0 && String(p.completado || '').toLowerCase() !== 'si')
    .sort((a, b) => new Date(b.ultimaVisualizacion || 0) - new Date(a.ultimaVisualizacion || 0));

  return progress.map(p => {
    if (p.tipo === 'pelicula') {
      const item = FF_STATE.content.find(c => c.id === p.contenidoId);
      if (!item) return null;
      return { kind: 'content', item, progress: p };
    }

    const ep = FF_STATE.episodes.find(e => e.id === p.episodioId);
    const serie = FF_STATE.content.find(c => c.id === p.contenidoId);
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
  return FF_STATE.episodes
    .filter(ep => ep.serieId === serieId && ep.estado === 'activo')
    .sort((a, b) => (a.temporada - b.temporada) || (a.numeroEpisodio - b.numeroEpisodio));
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
  return FF_STATE.content.find(item => String(item.id) === String(id)) || null;
}

function getEpisodeById(id) {
  return FF_STATE.episodes.find(item => String(item.id) === String(id)) || null;
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
  return item.r2Url || item.driveUrl || '';
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
function mediaCardImage(url, fallback = '🎬') {
  if (url) {
    return `<img src="${escapeHtml(url)}" alt="" loading="lazy">`;
  }
  return `<div class="card-ph">${fallback}</div>`;
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
  const progress = getProgressPercent(type, item.id, '');
  const img = mediaCardImage(item.portadaUrl, type === 'serie' ? '📺' : '🎬');
  return `
    <article class="media-card" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(type)}">
      <button class="media-card__btn" type="button" onclick="openContentDetail('${escapeHtml(item.id)}')">
        <div class="media-card__image">${img}</div>
        ${mediaBadge(type, progress)}
        <div class="media-card__body">
          <h3 class="media-card__title">${escapeHtml(item.titulo)}</h3>
          <p class="media-card__meta">${escapeHtml(item.categoria || '')}${item.año ? ` • ${item.año}` : ''}</p>
        </div>
      </button>
    </article>
  `;
}

function buildEpisodeCard(ep, serie) {
  const progress = getProgressPercent('episodio', serie.id, ep.id);
  const img = mediaCardImage(ep.portadaUrl || serie.portadaUrl, '🎞️');
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

  if (titleEl) titleEl.textContent = item.titulo || '';
  if (metaEl) metaEl.textContent = [item.categoria, item.año].filter(Boolean).join(' • ');
  if (synopsisEl) synopsisEl.textContent = item.sinopsis || 'Sin sinopsis disponible.';
  if (imageEl) imageEl.innerHTML = mediaCardImage(item.portadaUrl, item.tipo === 'serie' ? '📺' : '🎬');

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
   Inicialización global
--------------------------------*/
function bootstrapShared() {
  initTheme();

  window.FF_CONFIG = FF_CONFIG;
  window.FF_STATE = FF_STATE;

  window.escapeHtml = escapeHtml;
  window.slugify = slugify;
  window.fmtDateTime = fmtDateTime;
  window.fmtDurationSeconds = fmtDurationSeconds;
  window.parseDurationToSeconds = parseDurationToSeconds;
  window.safeJsonParse = safeJsonParse;
  window.debounce = debounce;
  window.splitTags = splitTags;
  window.qs = qs;
  window.qsa = qsa;
  window.sleep = sleep;

  window.initTheme = initTheme;
  window.toggleTheme = toggleTheme;
  window.showToast = showToast;

  window.getSession = getSession;
  window.setSession = setSession;
  window.clearSession = clearSession;
  window.isLoggedIn = isLoggedIn;
  window.getCurrentUser = getCurrentUser;
  window.isAdmin = isAdmin;
  window.logout = logout;
  window.requireAuth = requireAuth;
  window.requireAdmin = requireAdmin;

  window.apiCall = apiCall;
  window.loginUser = loginUser;
  window.createUser = createUser;
  window.listUsers = listUsers;
  window.addContent = addContent;
  window.addEpisode = addEpisode;
  window.listCatalogFromApi = listCatalogFromApi;
  window.listEpisodesFromApi = listEpisodesFromApi;
  window.saveProgressRemote = saveProgressRemote;
  window.getUserStateRemote = getUserStateRemote;
  window.toggleFavoriteRemote = toggleFavoriteRemote;

  window.getAdminSecret = getAdminSecret;
  window.setAdminSecret = setAdminSecret;
  window.workerRequest = workerRequest;
  window.uploadFileToR2 = uploadFileToR2;
  window.listR2Files = listR2Files;
  window.deleteR2File = deleteR2File;
  window.analyzeWithAI = analyzeWithAI;
  window.buildR2Url = buildR2Url;

  window.fetchTsv = fetchTsv;
  window.parseTsv = parseTsv;
  window.normalizeContentRow = normalizeContentRow;
  window.normalizeEpisodeRow = normalizeEpisodeRow;
  window.fetchContent = fetchContent;
  window.fetchEpisodes = fetchEpisodes;
  window.loadCatalog = loadCatalog;

  window.loadUserState = loadUserState;
  window.favoriteKeyFor = favoriteKeyFor;
  window.isFavorite = isFavorite;
  window.getProgressRecord = getProgressRecord;
  window.getProgressPercent = getProgressPercent;
  window.getContinueWatchingItems = getContinueWatchingItems;
  window.toggleFavorite = toggleFavorite;
  window.savePlaybackProgress = savePlaybackProgress;

  window.getSeriesEpisodes = getSeriesEpisodes;
  window.buildSeasonsMap = buildSeasonsMap;
  window.getContentById = getContentById;
  window.getEpisodeById = getEpisodeById;
  window.getFeaturedContent = getFeaturedContent;
  window.getMovies = getMovies;
  window.getSeries = getSeries;
  window.searchCatalog = searchCatalog;
  window.getCategories = getCategories;
  window.getItemsByCategory = getItemsByCategory;
  window.getHeroItem = getHeroItem;
  window.getPlayableUrl = getPlayableUrl;
  window.isDriveUrl = isDriveUrl;
  window.toDrivePreviewUrl = toDrivePreviewUrl;

  window.mediaCardImage = mediaCardImage;
  window.mediaBadge = mediaBadge;
  window.buildMediaCard = buildMediaCard;
  window.buildEpisodeCard = buildEpisodeCard;

  window.goToHome = goToHome;
  window.goToAdmin = goToAdmin;
  window.goToPlayer = goToPlayer;
  window.openContentDetail = openContentDetail;
  window.closeDetailModal = closeDetailModal;
  window.playFirstEpisode = playFirstEpisode;
  window.toggleFavoriteFromUI = toggleFavoriteFromUI;
}

bootstrapShared();

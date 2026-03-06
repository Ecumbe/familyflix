/* ============================================================
   FAMILYFLIX — shared.js
   Tema, Google Sheets, utilidades globales
   ============================================================ */

// ─── GOOGLE SHEETS CONFIG ───────────────────────────────────
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQLDXRtWlOPk8n9cz8UwzvB_0G3gHCUofVDgF5azBpUFPo0ZQuZDl2230T8mLkyA1N9dYtkkuQP0Y1w/pub?output=csv';
const COL = { titulo:0, driveId:1, categoria:2, anio:3, duracion:4, sinopsis:5, tags:6, portadaId:7, r2Url:8 };

// ─── DRIVE HELPERS ────────────────────────────────────────────
// Acepta tanto ID puro como URL completa de Drive
function extractDriveId(raw) {
  if (!raw) return '';
  raw = raw.trim().replace(/"/g, '');
  const match = raw.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (match) return match[1];
  if (!raw.includes('/') && raw.length > 10) return raw;
  return raw;
}
function driveEmbed(id) { return `https://drive.google.com/file/d/${id}/preview`; }
function driveThumb(id, size=400) { return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`; }

// ─── CARGAR VIDEOS DESDE GOOGLE SHEETS ──────────────────────
async function fetchVideos() {
  try {
    const res = await fetch(SHEET_URL + '&t=' + Date.now());
    if (!res.ok) throw new Error('Sheet no disponible');
    const csv = await res.text();
    return parseCSV(csv);
  } catch(e) {
    console.warn('Usando datos de muestra:', e.message);
    return getSampleVideos();
  }
}

function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return getSampleVideos();
  const videos = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (!cols[COL.titulo] || !cols[COL.driveId]) continue;
    const driveId   = extractDriveId(cols[COL.driveId]);
    const portadaId = extractDriveId(cols[COL.portadaId] || cols[COL.driveId]);
    videos.push({
      id:        'v' + i,
      title:     cols[COL.titulo].replace(/"/g,'').trim(),
      driveId,
      category:  cols[COL.categoria] ? cols[COL.categoria].replace(/"/g,'').trim() : 'Familia',
      year:      cols[COL.anio]      ? parseInt(cols[COL.anio].replace(/"/g,''))   : null,
      duration:  cols[COL.duracion]  ? cols[COL.duracion].replace(/"/g,'').trim()  : '',
      synopsis:  cols[COL.sinopsis]  ? cols[COL.sinopsis].replace(/"/g,'').trim()  : '',
      tags:      cols[COL.tags]      ? cols[COL.tags].replace(/"/g,'').split(',').map(t=>t.trim()).filter(Boolean) : [],
      thumbnail: portadaId ? driveThumb(portadaId) : '',
      r2Url: cols[COL.r2Url] ? cols[COL.r2Url].replace(/"/g,'').trim() : '',
    });
  }
  return videos.length ? videos : getSampleVideos();
}

function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

function getSampleVideos() {
  return [
    { id:'demo1', title:'Viaje a París 2022',   driveId:'1EmdHHGYAqYsnS7wk9ViLq6RjNeEyICoD', category:'Viajes',     year:2022, duration:'3:30',    synopsis:'Video de prueba conectado a Google Drive.', tags:['Demo'], thumbnail:'' },
    { id:'demo2', title:'Navidad 2023',          driveId:'', category:'Navidad',    year:2023, duration:'1:20:00', synopsis:'La reunión más especial del año.',                tags:['Navidad'],   thumbnail:'' },
    { id:'demo3', title:'Vacaciones Playa 2023', driveId:'', category:'Vacaciones', year:2023, duration:'55:00',   synopsis:'Una semana perfecta en la playa.',                tags:['Playa'],     thumbnail:'' },
  ];
}

// ─── TEMA ────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('ff_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ff_theme', theme);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// ─── AUTH ─────────────────────────────────────────────────────
const PASSWORDS = { admin:'familia2024admin', viewer:'familia2024', guest:'invitado123' };
function checkAuth() {
  if (!sessionStorage.getItem('ff_auth')) { window.location.href = 'index.html'; return false; }
  return true;
}
function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

// ─── PROGRESO ─────────────────────────────────────────────────
function getProgress() { return JSON.parse(localStorage.getItem('ff_progress') || '{}'); }
function saveVideoProgress(id, pct) {
  const p = getProgress(); p[id] = Math.round(pct);
  localStorage.setItem('ff_progress', JSON.stringify(p));
}

// ─── CATEGORÍAS ───────────────────────────────────────────────
const CAT_EMOJI = { 'Viajes':'✈️','Cumpleaños':'🎂','Navidad':'🎄','Vacaciones':'🏖️','Familia':'👨‍👩‍👧','Eventos':'🎉','General':'🎬' };
function catEmoji(cat) { return CAT_EMOJI[cat] || '🎬'; }

// ─── TOAST ────────────────────────────────────────────────────
function showToast(msg, type='success') {
  let t = document.getElementById('globalToast');
  if (!t) { t = document.createElement('div'); t.id='globalToast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = `toast ${type} show`;
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 3500);
}

// ─── FORMAT ──────────────────────────────────────────────────
function fmtPct(pct) {
  if (pct <= 0) return 'Sin ver';
  if (pct >= 100) return '✅ Completo';
  return `${pct}% visto`;
}

initTheme();

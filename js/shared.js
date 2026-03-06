/* ============================================================
   FAMILYFLIX v3 — shared.js
   ============================================================ */

// ─── SHEETS CONFIG ───────────────────────────────────────────
const SHEET_CONTENT  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQLDXRtWlOPk8n9cz8UwzvB_0G3gHCUofVDgF5azBpUFPo0ZQuZDl2230T8mLkyA1N9dYtkkuQP0Y1w/pub?gid=0&single=true&output=csv';
const SHEET_EPISODES = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQLDXRtWlOPk8n9cz8UwzvB_0G3gHCUofVDgF5azBpUFPo0ZQuZDl2230T8mLkyA1N9dYtkkuQP0Y1w/pub?gid=1661853453&single=true&output=csv';

// Columnas hoja "contenido" (gid=0):
// id | titulo | tipo | categoria | año | sinopsis | tags | portadaId | r2Url | driveId | destacado | duracion
const CC = {id:0,titulo:1,tipo:2,categoria:3,anio:4,sinopsis:5,tags:6,portadaId:7,r2Url:8,driveId:9,destacado:10,duracion:11};

// Columnas hoja "episodios" (gid=1661853453):
// serieId | numero | titulo | r2Url | driveId | duracion | sinopsis | portadaId
const CE = {serieId:0,numero:1,titulo:2,r2Url:3,driveId:4,duracion:5,sinopsis:6,portadaId:7};

// ─── FETCH ───────────────────────────────────────────────────
async function fetchContent() {
  try {
    const res = await fetch(SHEET_CONTENT + '&t=' + Date.now());
    if (!res.ok) throw new Error('no content');
    return parseContent(await res.text());
  } catch(e) {
    console.warn('Usando datos de muestra:', e.message);
    return getSampleContent();
  }
}

async function fetchEpisodes() {
  try {
    const res = await fetch(SHEET_EPISODES + '&t=' + Date.now());
    if (!res.ok) throw new Error('no episodes');
    return parseEpisodes(await res.text());
  } catch(e) {
    console.warn('Sin episodios:', e.message);
    return [];
  }
}

// ─── PARSE CONTENIDO ─────────────────────────────────────────
function parseContent(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return getSampleContent();
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    if (!c[CC.titulo]) continue;
    const cl = v => (c[v] || '').replace(/"/g,'').trim();
    const portadaId = extractDriveId(cl(CC.portadaId));
    const driveId   = extractDriveId(cl(CC.driveId));
    items.push({
      id:        cl(CC.id) || 'c'+i,
      title:     cl(CC.titulo),
      type:      cl(CC.tipo).toLowerCase() || 'pelicula',
      category:  cl(CC.categoria) || 'Familia',
      year:      cl(CC.anio) ? parseInt(cl(CC.anio)) : null,
      synopsis:  cl(CC.sinopsis),
      tags:      cl(CC.tags) ? cl(CC.tags).split(',').map(t=>t.trim()).filter(Boolean) : [],
      portadaId,
      r2Url:     cl(CC.r2Url),
      driveId,
      duration:  cl(CC.duracion),
      featured:  cl(CC.destacado).toLowerCase() === 'si',
      thumbnail: portadaId ? driveThumb(portadaId) : (driveId ? driveThumb(driveId) : ''),
    });
  }
  return items.length ? items : getSampleContent();
}

// ─── PARSE EPISODIOS ─────────────────────────────────────────
function parseEpisodes(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const eps = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    if (!c[CE.serieId] && !c[CE.titulo]) continue;
    const cl = v => (c[v] || '').replace(/"/g,'').trim();
    const portadaId = extractDriveId(cl(CE.portadaId));
    const driveId   = extractDriveId(cl(CE.driveId));
    const serieId   = cl(CE.serieId);
    eps.push({
      id:        `ep_${serieId}_${i}`,
      serieId,
      number:    parseInt(cl(CE.numero)) || i,
      title:     cl(CE.titulo) || `Episodio ${i}`,
      r2Url:     cl(CE.r2Url),
      driveId,
      duration:  cl(CE.duracion),
      synopsis:  cl(CE.sinopsis),
      thumbnail: portadaId ? driveThumb(portadaId) : (driveId ? driveThumb(driveId) : ''),
    });
  }
  return eps;
}

// ─── CSV PARSER ──────────────────────────────────────────────
function parseCSVLine(line) {
  const res = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { res.push(cur); cur = ''; }
    else { cur += ch; }
  }
  res.push(cur);
  return res;
}

// ─── SAMPLE DATA ─────────────────────────────────────────────
function getSampleContent() {
  return [
    { id:'p1', title:'Video de prueba', type:'pelicula', category:'General', year:2024, synopsis:'Video de prueba. Agrega tus videos en Google Sheets.', tags:['Demo'], portadaId:'', r2Url:'https://pub-eb7091956e164433aa5c9ef0bcc70356.r2.dev/M%C3%BAsica%20Bosque%20M%C3%A1gico%20Instrumental%E2%94%82M%C3%BAsica%20instrumental%20relajante.mp4', driveId:'1EmdHHGYAqYsnS7wk9ViLq6RjNeEyICoD', duration:'3:30', featured:true, thumbnail:'' },
    { id:'s1', title:'Serie de ejemplo',  type:'serie',    category:'Familia',  year:2024, synopsis:'Ejemplo de serie con episodios.',                      tags:['Demo'], portadaId:'', r2Url:'', driveId:'', duration:'', featured:false, thumbnail:'' },
  ];
}

// ─── DRIVE HELPERS ───────────────────────────────────────────
function extractDriveId(raw) {
  if (!raw) return '';
  raw = raw.trim().replace(/"/g,'');
  const m = raw.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  if (!raw.includes('/') && raw.length > 10) return raw;
  return raw;
}
function driveEmbed(id) { return `https://drive.google.com/file/d/${id}/preview`; }
function driveThumb(id, sz=400) { return `https://drive.google.com/thumbnail?id=${id}&sz=w${sz}`; }

// ─── PROGRESO ────────────────────────────────────────────────
function getProgress()       { return JSON.parse(localStorage.getItem('ff_prog') || '{}'); }
function getTimeProg()       { return JSON.parse(localStorage.getItem('ff_time') || '{}'); }
function savePct(id, pct)    { const p=getProgress(); p[id]=Math.round(pct);  localStorage.setItem('ff_prog', JSON.stringify(p)); }
function saveTimeSecs(id, s) { const p=getTimeProg(); p[id]=s;                localStorage.setItem('ff_time', JSON.stringify(p)); }
function getPct(id)          { return getProgress()[id]  || 0; }
function getTimeSecs(id)     { return getTimeProg()[id]  || 0; }

// ─── TEMA ────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('ff_theme');
  const dark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (dark ? 'dark' : 'light'));
}
function applyTheme(t) { document.documentElement.setAttribute('data-theme',t); localStorage.setItem('ff_theme',t); }
function toggleTheme() { applyTheme(document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark'); }

// ─── AUTH ────────────────────────────────────────────────────
const PASSWORDS = { admin:'familia2024admin', viewer:'familia2024', guest:'invitado123' };
function checkAuth()  { if(!sessionStorage.getItem('ff_auth')){ window.location.href='index.html'; return false; } return true; }
function logout()     { sessionStorage.clear(); window.location.href='index.html'; }

// ─── CATEGORÍAS ──────────────────────────────────────────────
const CAT_EMOJI = {'Viajes':'✈️','Cumpleaños':'🎂','Navidad':'🎄','Vacaciones':'🏖️','Familia':'👨‍👩‍👧','Eventos':'🎉','General':'🎬'};
function catEmoji(c) { return CAT_EMOJI[c] || '🎬'; }

// ─── TOAST ───────────────────────────────────────────────────
function showToast(msg, type='success') {
  let t = document.getElementById('gToast');
  if (!t) { t=document.createElement('div'); t.id='gToast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent=msg; t.className=`toast ${type} show`;
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'), 3500);
}

// ─── FORMAT ──────────────────────────────────────────────────
function fmtPct(p)  { if(p<=0)return'Sin ver'; if(p>=100)return'✅ Completo'; return`${p}% visto`; }
function fmtTime(s) { if(!s||isNaN(s))return'0:00:00'; const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=Math.floor(s%60); return`${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; }
function parseDur(str) { if(!str)return 0; const p=str.split(':').map(Number); if(p.length===3)return p[0]*3600+p[1]*60+p[2]; if(p.length===2)return p[0]*60+p[1]; return 0; }

// ─── BADGE ───────────────────────────────────────────────────
function getBadge(id, isNew=false) {
  const pct = getPct(id);
  if (pct >= 100) return { cls:'badge-done',     label:'✓ Visto' };
  if (pct  >   0) return { cls:'badge-progress', label:`${pct}%` };
  if (isNew)      return { cls:'badge-new',       label:'NUEVO' };
  return null;
}

initTheme();

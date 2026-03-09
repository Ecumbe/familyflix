/* ════════════════════════════════════════
   FAMILYFLIX v4 — shared.js (TSV Engine)
   ════════════════════════════════════════ */

// ¡NUEVO FORMATO! TSV en lugar de CSV para evitar errores de comas
const SHEET_CONTENT  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQLDXRtWlOPk8n9cz8UwzvB_0G3gHCUofVDgF5azBpUFPo0ZQuZDl2230T8mLkyA1N9dYtkkuQP0Y1w/pub?gid=0&single=true&output=tsv';
const SHEET_EPISODES = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQLDXRtWlOPk8n9cz8UwzvB_0G3gHCUofVDgF5azBpUFPo0ZQuZDl2230T8mLkyA1N9dYtkkuQP0Y1w/pub?gid=1661853453&single=true&output=tsv';

const CC = {id:0,titulo:1,tipo:2,categoria:3,anio:4,sinopsis:5,tags:6,portadaId:7,r2Url:8,driveId:9,destacado:10,duracion:11};
const CE = {serieId:0,numero:1,titulo:2,r2Url:3,driveId:4,duracion:5,sinopsis:6,portadaId:7};

async function fetchContent() {
  try {
    const r = await fetch(SHEET_CONTENT + '&t=' + Date.now());
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return parseContent(await r.text());
  } catch (e) { 
    console.error("Fallo al cargar Contenido:", e);
    return getSampleContent(); 
  }
}

async function fetchEpisodes() {
  try {
    const r = await fetch(SHEET_EPISODES + '&t=' + Date.now());
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return parseEpisodes(await r.text());
  } catch (e) { 
    console.error("Fallo al cargar Episodios:", e);
    return []; 
  }
}

// Lector TSV a prueba de balas
function parseContent(tsv) {
  const lines = tsv.trim().split('\n');
  if (lines.length < 2) return getSampleContent();
  
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t').map(x => x.replace(/\r$/, '').trim());
    if (!c[CC.titulo]) continue;
    
    const pid = extractId(c[CC.portadaId]);
    const did = extractId(c[CC.driveId]);
    out.push({
      id:        c[CC.id] || 'c'+i,
      title:     c[CC.titulo],
      type:      (c[CC.tipo] || 'pelicula').toLowerCase(),
      category:  c[CC.categoria] || 'Familia',
      year:      c[CC.anio] ? parseInt(c[CC.anio]) : null,
      synopsis:  c[CC.sinopsis],
      tags:      c[CC.tags] ? c[CC.tags].split(',').map(t=>t.trim()).filter(Boolean) : [],
      portadaId: pid, r2Url: c[CC.r2Url], driveId: did,
      duration:  c[CC.duracion],
      featured:  (c[CC.destacado] || '').toLowerCase() === 'si',
      thumbnail: pid ? pid : (did ? driveThumb(did) : ''),
    });
  }
  return out.length ? out : getSampleContent();
}

function parseEpisodes(tsv) {
  const lines = tsv.trim().split('\n');
  if (lines.length < 2) return [];
  const out = [];
  
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t').map(x => x.replace(/\r$/, '').trim());
    if (!c[CE.serieId]) continue;
    
    const pid = extractId(c[CE.portadaId]);
    const did = extractId(c[CE.driveId]);
    out.push({
      id:        `ep_${c[CE.serieId]}_${i}`,
      serieId:   c[CE.serieId],
      number:    parseInt(c[CE.numero]) || i,
      title:     c[CE.titulo] || `Episodio ${i}`,
      r2Url:     c[CE.r2Url], driveId: did,
      duration:  c[CE.duracion], synopsis: c[CE.sinopsis],
      thumbnail: pid ? pid : (did ? driveThumb(did) : ''),
    });
  }
  return out;
}

function getSampleContent() {
  return [{id:'p1',title:'Video de Prueba',type:'pelicula',category:'General',year:2024,synopsis:'No se pudo leer la hoja. Revisa la consola.',tags:['Demo'],portadaId:'',r2Url:'',driveId:'',duration:'0:00',featured:true,thumbnail:''}];
}

function extractId(raw) {
  if(!raw)return'';
  raw=raw.trim().replace(/"/g,'');
  if(raw.startsWith('http')) return raw;
  const m=raw.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if(m)return m[1];
  if(!raw.includes('/')&&raw.length>10)return raw;
  return raw;
}
function driveEmbed(id){return`https://drive.google.com/file/d/${id}/preview`}
function driveThumb(id,sz=400){return`https://drive.google.com/thumbnail?id=${id}&sz=w${sz}`}

function getProg(){return JSON.parse(localStorage.getItem('ff_p')||'{}')}
function getTime(){return JSON.parse(localStorage.getItem('ff_t')||'{}')}
function savePct(id,pct){const p=getProg();p[id]=Math.round(pct);localStorage.setItem('ff_p',JSON.stringify(p))}
function saveTime(id,s){const p=getTime();p[id]=s;localStorage.setItem('ff_t',JSON.stringify(p))}
function getPct(id){return getProg()[id]||0}
function getTimeSec(id){return getTime()[id]||0}

function initTheme(){
  const s=localStorage.getItem('ff_th');
  const dark=window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(s||(dark?'dark':'light'));
}
function applyTheme(t){document.documentElement.setAttribute('data-theme',t);localStorage.setItem('ff_th',t)}
function toggleTheme(){applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')}

const PASSWORDS={admin:'12345',viewer:'familia2024',guest:'invitado123'};

function checkAuth(){
  const ok=sessionStorage.getItem('ff_ok')||sessionStorage.getItem('ff_auth');
  if(!ok){window.location.href='index.html';return false}
  return true;
}
function logout(){sessionStorage.clear();window.location.href='index.html'}

const CAT_EMOJI={'Viajes':'✈️','Cumpleaños':'🎂','Navidad':'🎄','Vacaciones':'🏖️','Familia':'👨‍👩‍👧','Eventos':'🎉','General':'🎬'};
function catEmoji(c){return CAT_EMOJI[c]||'🎬'}
function fmtPct(p){if(p<=0)return'Sin ver';if(p>=100)return'✓ Completo';return`${p}% visto`}
function fmtTime(s){if(!s||isNaN(s))return'0:00:00';const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=Math.floor(s%60);return`${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`}

function getBadge(id){
  const p=getPct(id);
  if(p>=100)return{cls:'badge-done',txt:'✓ Visto'};
  if(p>0)return{cls:'badge-wip',txt:`${p}%`};
  return{cls:'badge-new',txt:'NUEVO'};
}

function showToast(msg,type='success'){
  let t=document.getElementById('_toast');
  if(!t){t=document.createElement('div');t.id='_toast';t.className='toast';document.body.appendChild(t)}
  t.textContent=msg;t.className=`toast ${type} show`;
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3500);
}

initTheme();

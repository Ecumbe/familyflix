/* ════════════════════════════════════════
   FAMILYFLIX v4 — shared.js
   ════════════════════════════════════════ */

// URLs actualizadas forzando el formato CSV
const SHEET_CONTENT  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQLDXRtWlOPk8n9cz8UwzvB_0G3gHCUofVDgF5azBpUFPo0ZQuZDl2230T8mLkyA1N9dYtkkuQP0Y1w/pub?gid=0&single=true&output=csv';
const SHEET_EPISODES = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQLDXRtWlOPk8n9cz8UwzvB_0G3gHCUofVDgF5azBpUFPo0ZQuZDl2230T8mLkyA1N9dYtkkuQP0Y1w/pub?gid=1661853453&single=true&output=csv';

const CC = {id:0,titulo:1,tipo:2,categoria:3,anio:4,sinopsis:5,tags:6,portadaId:7,r2Url:8,driveId:9,destacado:10,duracion:11};
const CE = {serieId:0,numero:1,titulo:2,r2Url:3,driveId:4,duracion:5,sinopsis:6,portadaId:7};

async function fetchContent() {
  try {
    const r = await fetch(SHEET_CONTENT + '&t=' + Date.now());
    if (!r.ok) throw new Error('Error HTTP: ' + r.status);
    return parseContent(await r.text());
  } catch (err) { 
    console.error('Error cargando contenido de Sheets:', err);
    return getSampleContent(); 
  }
}

async function fetchEpisodes() {
  try {
    const r = await fetch(SHEET_EPISODES + '&t=' + Date.now());
    if (!r.ok) throw new Error('Error HTTP: ' + r.status);
    return parseEpisodes(await r.text());
  } catch (err) { 
    console.error('Error cargando episodios de Sheets:', err);
    return []; 
  }
}

function parseContent(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return getSampleContent();
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = csvLine(lines[i]);
    const cl = v => (c[v]||'').replace(/"/g,'').trim();
    if (!cl(CC.titulo)) continue;
    
    // El ID real o uno generado basado en la fila
    const rowId = cl(CC.id) || 'c'+i;
    
    // Ajuste para leer portadas desde URL directa o ID de Drive
    let rawPortada = cl(CC.portadaId);
    let thumb = '';
    if (rawPortada.startsWith('http')) {
      thumb = rawPortada; // Si la IA trajo una URL real
    } else if (rawPortada) {
      thumb = driveThumb(extractId(rawPortada)); // Si es un Drive ID
    } else if (cl(CC.driveId)) {
      thumb = driveThumb(extractId(cl(CC.driveId))); // Fallback al Drive ID del video
    }

    out.push({
      id:        rowId,
      title:     cl(CC.titulo),
      type:      cl(CC.tipo).toLowerCase() || 'pelicula',
      category:  cl(CC.categoria) || 'Familia',
      year:      cl(CC.anio) ? parseInt(cl(CC.anio)) : null,
      synopsis:  cl(CC.sinopsis),
      tags:      cl(CC.tags) ? cl(CC.tags).split(',').map(t=>t.trim()).filter(Boolean) : [],
      portadaId: rawPortada, 
      r2Url:     cl(CC.r2Url), 
      driveId:   extractId(cl(CC.driveId)),
      duration:  cl(CC.duracion),
      featured:  cl(CC.destacado).toLowerCase() === 'si',
      thumbnail: thumb,
    });
  }
  return out.length ? out : getSampleContent();
}

function parseEpisodes(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = csvLine(lines[i]);
    const cl = v => (c[v]||'').replace(/"/g,'').trim();
    if (!cl(CE.serieId)) continue;
    
    let rawPortada = cl(CE.portadaId);
    let thumb = '';
    if (rawPortada.startsWith('http')) {
      thumb = rawPortada;
    } else if (rawPortada) {
      thumb = driveThumb(extractId(rawPortada));
    } else if (cl(CE.driveId)) {
      thumb = driveThumb(extractId(cl(CE.driveId)));
    }

    out.push({
      id:        `ep_${cl(CE.serieId)}_${i}`,
      serieId:   cl(CE.serieId),
      number:    parseInt(cl(CE.numero)) || i,
      title:     cl(CE.titulo) || `Episodio ${i}`,
      r2Url:     cl(CE.r2Url), 
      driveId:   extractId(cl(CE.driveId)),
      duration:  cl(CE.duracion), 
      synopsis:  cl(CE.sinopsis),
      thumbnail: thumb,
    });
  }
  return out;
}

function csvLine(line) {
  const r=[];let cur='';let q=false;
  for(const ch of line){if(ch==='"'){q=!q}else if(ch===','&&!q){r.push(cur);cur=''}else{cur+=ch}}
  r.push(cur);return r;
}

function getSampleContent() {
  return [
    {id:'p1',title:'Video de Prueba',type:'pelicula',category:'General',year:2024,synopsis:'No se pudo cargar la base de datos. Revisa la consola.',tags:['Demo'],portadaId:'',r2Url:'https://pub-eb7091956e164433aa5c9ef0bcc70356.r2.dev/M%C3%BAsica%20Bosque%20M%C3%A1gico%20Instrumental%E2%94%82M%C3%BAsica%20instrumental%20relajante.mp4',driveId:'',duration:'3:30',featured:true,thumbnail:''},
  ];
}

function extractId(raw) {
  if(!raw)return'';
  raw=raw.trim().replace(/"/g,'');
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

// Compatibilidad con v3
function savePcts(id,pct){savePct(id,pct)}
function saveTimeSecs(id,s){saveTime(id,s)}
function getPcts(id){return getPct(id)}
function getTimeSecs(id){return getTimeSec(id)}

function initTheme(){
  const s=localStorage.getItem('ff_th');
  const dark=window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(s||(dark?'dark':'light'));
}
function applyTheme(t){document.documentElement.setAttribute('data-theme',t);localStorage.setItem('ff_th',t)}
function toggleTheme(){applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')}

const PASSWORDS={admin:'familia2024admin',viewer:'familia2024',guest:'invitado123'};

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

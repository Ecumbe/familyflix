// ============================================================
// FamilyFlix — Google Apps Script v3
// Base completa para usuarios, login, contenido, episodios,
// progreso, favoritos y continuar viendo.
//
// 1) Pega este archivo completo en script.google.com
// 2) Cambia SOLO la constante SHEET_ID
// 3) Ejecuta manualmente initSystem() una sola vez
// 4) Implementar -> Nueva implementación -> Aplicación web
// 5) Acceso: Cualquier persona con el enlace
// ============================================================

const SHEET_ID = '1-_lNyCaFw2s0uGrg1FezzuzW43qGNCHB2i3S_AAt6jI';
const VIDEO_BASE_URL_PROPERTY = 'familyflix_video_base_url';
const VIDEO_BASE_URL_UPDATED_AT_PROPERTY = 'familyflix_video_base_url_updated_at';
const VIDEO_BASE_URL_SOURCE_PROPERTY = 'familyflix_video_base_url_source';

const SHEETS = {
  contenido: 'contenido',
  episodios: 'episodios',
  usuarios: 'usuarios',
  progreso: 'progreso',
  favoritos: 'favoritos',
  continuar: 'continuar_viendo',
};

const HEADERS = {
  contenido: [
    'id','titulo','tituloOriginal','tipo','categoria','generos','año','sinopsis','tags',
    'portadaUrl','backdropUrl','r2Url','driveUrl','destacado','duracion','clasificacion',
    'idioma','estado','usuariosPermitidos','fechaRegistro','creadoPor','rating','ratingCount','ratingSource','subtitulos','logoUrl','previewVideoUrl','previewStart'
  ],
  episodios: [
    'id','serieId','temporada','numeroEpisodio','titulo','tituloOriginal','sinopsis',
    'duracion','r2Url','driveUrl','portadaUrl','airDate','estado','fechaRegistro','creadoPor','subtitulos','previewVideoUrl','previewStart'
  ],
  usuarios: [
    'id','usuario','passwordHash','nombreMostrado','rol','estado','avatarUrl','fechaCreacion','creadoPor'
  ],
  progreso: [
    'id','usuarioId','contenidoId','episodioId','tipo','temporada','numeroEpisodio',
    'segundosVistos','duracionSegundos','porcentaje','completado','ultimaVisualizacion','estado'
  ],
  favoritos: [
    'id','usuarioId','contenidoId','episodioId','tipo','fechaAgregado'
  ],
  continuar: [
    'id','usuarioId','contenidoId','episodioId','tipo','tituloMostrado','portadaUrl',
    'segundosVistos','duracionSegundos','porcentaje','ultimaVisualizacion'
  ],
};

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function handleRequest_(e, method) {
  try {
    const payload = parsePayload_(e, method);
    const action = String(payload.action || '').trim();
    const data = payload.data || payload.row || {};

    switch (action) {
      case 'ping':
        return out_({ ok: true, message: 'FamilyFlix Apps Script v3 activo ✅' });

      case 'initSystem':
        return out_({ ok: true, result: initSystem() });

      case 'login':
        return out_(login_(data));

      case 'createUser':
        return out_(createUser_(data));

      case 'listUsers':
        return out_({ ok: true, users: listUsers_() });

      case 'updateUser':
        return out_(updateUser_(data));

      case 'deleteUser':
        return out_(deleteUser_(data));

      case 'toggleUserStatus':
        return out_(toggleUserStatus_(data));

      case 'changePassword':
        return out_(changePassword_(data));

      case 'addContent':
      case 'addOrUpdateContent':
        return out_(addOrUpdateContent_(data));

      case 'deleteContent':
        return out_(deleteContent_(data));

      case 'addEpisode':
      case 'addOrUpdateEpisode':
        return out_(addOrUpdateEpisode_(data));

      case 'deleteEpisode':
        return out_(deleteEpisode_(data));

      case 'listCatalog':
        return out_({ ok: true, content: listCatalog_() });

      case 'listEpisodes':
        return out_({ ok: true, episodes: listEpisodes_() });

      case 'listSeries':
        return out_({ ok: true, series: listSeries_() });

      case 'getVideoBaseUrl':
        return out_(getVideoBaseUrl_());

      case 'setVideoBaseUrl':
        return out_(setVideoBaseUrl_(data));

      case 'syncQuickTunnelUrls':
        return out_(syncQuickTunnelUrls_(data));

      case 'saveProgress':
        return out_(saveProgress_(data));

      case 'toggleFavorite':
        return out_(toggleFavorite_(data));

      case 'listFavorites':
        return out_(listFavorites_(data));

      case 'upsertContinueWatching':
        return out_(upsertContinueWatching_(data));

      case 'getUserState':
      case 'getUserBootstrap':
        return out_(getUserBootstrap_(data));

      default:
        return out_({ ok: false, error: 'Acción desconocida: ' + action });
    }
  } catch (err) {
    return out_({ ok: false, error: err.message, stack: String(err.stack || '') });
  }
}

function parsePayload_(e, method) {
  if (method === 'POST') {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    return JSON.parse(raw || '{}');
  }
  const action = e && e.parameter ? e.parameter.action : '';
  const dataRaw = e && e.parameter ? e.parameter.data : '{}';
  return { action: action, data: JSON.parse(dataRaw || '{}') };
}

function out_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// INICIALIZACIÓN
// ============================================================

function initSystem() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const created = [];
  Object.keys(SHEETS).forEach((key) => {
    const name = SHEETS[key];
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      created.push(name);
    }
    ensureHeader_(sh, HEADERS[key]);
  });

  seedAdminIfMissing_();

  return {
    message: 'Sistema inicializado correctamente.',
    createdSheets: created,
    sheets: SHEETS,
  };
}

function ensureHeader_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const same = headers.every((h, i) => String(current[i] || '').trim() === h);
  if (!same) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function seedAdminIfMissing_() {
  const sh = getSheet_('usuarios');
  const rows = getObjects_('usuarios');
  const exists = rows.some(r => normalize_(r.usuario) === 'admin');
  if (exists) return;

  sh.appendRow([
    nextId_('usr'),
    'admin',
    hashPassword_('12345'),
    'Administrador',
    'admin',
    'activo',
    '',
    nowIso_(),
    'system',
  ]);
}

// ============================================================
// USUARIOS / LOGIN
// ============================================================

function login_(data) {
  const usuario = normalize_(data.usuario);
  const password = String(data.password || '');
  if (!usuario || !password) {
    return { ok: false, error: 'Usuario y contraseña son obligatorios.' };
  }

  const users = getObjects_('usuarios');
  const found = users.find(u => normalize_(u.usuario) === usuario);
  if (!found) {
    return { ok: false, error: 'Usuario no encontrado.' };
  }
  if (normalize_(found.estado) !== 'activo') {
    return { ok: false, error: 'Usuario inactivo.' };
  }
  if (found.passwordHash !== hashPassword_(password)) {
    return { ok: false, error: 'Contraseña incorrecta.' };
  }

  return {
    ok: true,
    user: {
      id: found.id,
      usuario: found.usuario,
      nombreMostrado: found.nombreMostrado,
      rol: found.rol,
      estado: found.estado,
      avatarUrl: found.avatarUrl || '',
    }
  };
}

function createUser_(data) {
  const usuario = normalize_(data.usuario);
  const password = String(data.password || '');
  const nombreMostrado = String(data.nombreMostrado || '').trim();
  const rol = normalize_(data.rol || 'familiar');
  const estado = normalize_(data.estado || 'activo');
  const avatarUrl = String(data.avatarUrl || '').trim();
  const creadoPor = String(data.creadoPor || 'admin').trim();

  if (!usuario) return { ok: false, error: 'El usuario es obligatorio.' };
  if (!password) return { ok: false, error: 'La contraseña es obligatoria.' };
  if (!nombreMostrado) return { ok: false, error: 'El nombre mostrado es obligatorio.' };
  if (!['admin', 'familiar'].includes(rol)) return { ok: false, error: 'Rol inválido.' };
  if (!['activo', 'inactivo'].includes(estado)) return { ok: false, error: 'Estado inválido.' };

  const users = getObjects_('usuarios');
  const exists = users.some(u => normalize_(u.usuario) === usuario);
  if (exists) return { ok: false, error: 'Ese usuario ya existe.' };

  const sh = getSheet_('usuarios');
  sh.appendRow([
    nextId_('usr'),
    usuario,
    hashPassword_(password),
    nombreMostrado,
    rol,
    estado,
    avatarUrl,
    nowIso_(),
    creadoPor,
  ]);

  return { ok: true, message: 'Usuario creado correctamente.' };
}

function listUsers_() {
  return getObjects_('usuarios').map(u => ({
    id: u.id,
    usuario: u.usuario,
    nombreMostrado: u.nombreMostrado,
    rol: u.rol,
    estado: u.estado,
    avatarUrl: u.avatarUrl || '',
    fechaCreacion: u.fechaCreacion || '',
    creadoPor: u.creadoPor || '',
  }));
}

function updateUser_(data) {
  const id = str_(data.id);
  if (!id) return { ok: false, error: 'Falta el id del usuario.' };

  const ref = findRowById_('usuarios', id);
  if (!ref) return { ok: false, error: 'Usuario no encontrado.' };

  const current = ref.obj || {};
  const usuario = normalize_(data.usuario || current.usuario);
  const password = String(data.password || '');
  const nombreMostrado = str_(data.nombreMostrado || current.nombreMostrado);
  const rol = normalize_(data.rol || current.rol || 'familiar');
  const estado = normalize_(data.estado || current.estado || 'activo');
  const avatarUrl = data.avatarUrl === undefined ? str_(current.avatarUrl) : str_(data.avatarUrl);

  if (!usuario) return { ok: false, error: 'El usuario es obligatorio.' };
  if (!nombreMostrado) return { ok: false, error: 'El nombre mostrado es obligatorio.' };
  if (!['admin', 'familiar'].includes(rol)) return { ok: false, error: 'Rol inválido.' };
  if (!['activo', 'inactivo'].includes(estado)) return { ok: false, error: 'Estado inválido.' };

  const users = getObjects_('usuarios');
  const exists = users.some(u => str_(u.id) !== id && normalize_(u.usuario) === usuario);
  if (exists) return { ok: false, error: 'Ese usuario ya existe.' };

  if (wouldLeaveWithoutActiveAdmin_(current, id, rol, estado)) {
    return { ok: false, error: 'Debe quedar al menos un administrador activo.' };
  }

  const passwordHash = password ? hashPassword_(password) : str_(current.passwordHash);
  ref.sheet.getRange(ref.rowIndex, 1, 1, HEADERS.usuarios.length).setValues([[
    id,
    usuario,
    passwordHash,
    nombreMostrado,
    rol,
    estado,
    avatarUrl,
    str_(current.fechaCreacion || nowIso_()),
    str_(current.creadoPor || 'system'),
  ]]);

  return { ok: true, message: 'Usuario actualizado.' };
}

function toggleUserStatus_(data) {
  const id = String(data.id || '').trim();
  if (!id) return { ok: false, error: 'Falta el id del usuario.' };

  const ref = findRowById_('usuarios', id);
  if (!ref) return { ok: false, error: 'Usuario no encontrado.' };

  const nextStatus = normalize_(ref.obj.estado) === 'activo' ? 'inactivo' : 'activo';
  if (wouldLeaveWithoutActiveAdmin_(ref.obj, id, normalize_(ref.obj.rol), nextStatus)) {
    return { ok: false, error: 'Debe quedar al menos un administrador activo.' };
  }
  ref.sheet.getRange(ref.rowIndex, colIndex_('usuarios', 'estado')).setValue(nextStatus);

  return { ok: true, message: 'Estado actualizado.', estado: nextStatus };
}

function changePassword_(data) {
  const id = String(data.id || '').trim();
  const password = String(data.password || '');
  if (!id) return { ok: false, error: 'Falta el id del usuario.' };
  if (!password) return { ok: false, error: 'Falta la nueva contraseña.' };

  const ref = findRowById_('usuarios', id);
  if (!ref) return { ok: false, error: 'Usuario no encontrado.' };

  ref.sheet.getRange(ref.rowIndex, colIndex_('usuarios', 'passwordHash')).setValue(hashPassword_(password));
  return { ok: true, message: 'Contraseña actualizada.' };
}

function deleteUser_(data) {
  const id = str_(data.id);
  if (!id) return { ok: false, error: 'Falta el id del usuario.' };

  const ref = findRowById_('usuarios', id);
  if (!ref) return { ok: false, error: 'Usuario no encontrado.' };

  if (wouldLeaveWithoutActiveAdmin_(ref.obj, id, 'eliminado', 'inactivo')) {
    return { ok: false, error: 'Debe quedar al menos un administrador activo.' };
  }

  deleteRowsByFieldValues_('progreso', 'usuarioId', [id]);
  deleteRowsByFieldValues_('favoritos', 'usuarioId', [id]);
  deleteRowsByFieldValues_('continuar', 'usuarioId', [id]);
  ref.sheet.deleteRow(ref.rowIndex);

  return { ok: true, message: 'Usuario eliminado.' };
}

// ============================================================
// CONTENIDO Y EPISODIOS
// ============================================================

function addOrUpdateContent_(data) {
  const row = sanitizeContent_(data.row || data);
  const validation = validateContent_(row);
  if (!validation.ok) return validation;

  const sh = getSheet_('contenido');
  const existing = row.id ? findRowById_('contenido', row.id) : null;

  if (existing) {
    sh.getRange(existing.rowIndex, 1, 1, HEADERS.contenido.length).setValues([contentRow_(row)]);
    return { ok: true, message: 'Contenido actualizado.', id: row.id };
  }

  if (!row.id) row.id = nextId_(row.tipo === 'serie' ? 'ser' : 'pel');

  const dup = getObjects_('contenido').some(r => normalize_(r.id) === normalize_(row.id));
  if (dup) return { ok: false, error: 'El ID de contenido ya existe: ' + row.id };

  sh.appendRow(contentRow_(row));
  return { ok: true, message: 'Contenido guardado.', id: row.id };
}

function addOrUpdateEpisode_(data) {
  const row = sanitizeEpisode_(data.row || data);
  const validation = validateEpisode_(row);
  if (!validation.ok) return validation;

  const series = getObjects_('contenido');
  const serie = series.find(r => r.id === row.serieId && normalize_(r.tipo) === 'serie');
  if (!serie) return { ok: false, error: 'La serie indicada no existe en la hoja contenido.' };

  const allEpisodes = getObjects_('episodios');
  const duplicatedCombo = allEpisodes.some(ep =>
    ep.id !== row.id &&
    ep.serieId === row.serieId &&
    Number(ep.temporada) === Number(row.temporada) &&
    Number(ep.numeroEpisodio) === Number(row.numeroEpisodio)
  );
  if (duplicatedCombo) {
    return { ok: false, error: 'Ya existe un episodio con esa serie, temporada y número.' };
  }

  const sh = getSheet_('episodios');
  const existing = row.id ? findRowById_('episodios', row.id) : null;

  if (existing) {
    sh.getRange(existing.rowIndex, 1, 1, HEADERS.episodios.length).setValues([episodeRow_(row)]);
    return { ok: true, message: 'Episodio actualizado.', id: row.id };
  }

  if (!row.id) row.id = nextId_('epi');

  sh.appendRow(episodeRow_(row));
  return { ok: true, message: 'Episodio guardado.', id: row.id };
}

function deleteContent_(data) {
  const id = str_(data.id);
  const force = normalize_(data.force) === 'si' || data.force === true;
  if (!id) return { ok: false, error: 'Falta el id del contenido.' };

  const ref = findRowById_('contenido', id);
  if (!ref) return { ok: false, error: 'Contenido no encontrado.' };

  const type = normalize_(ref.obj.tipo || '');
  if (type === 'serie') {
    const relatedEpisodes = getObjects_('episodios').filter(ep => str_(ep.serieId) === id);
    if (relatedEpisodes.length && !force) {
      return {
        ok: false,
        error: 'La serie tiene episodios asociados. Eliminalos primero o usa force.',
        relatedEpisodes: relatedEpisodes.map(ep => ({ id: ep.id, titulo: ep.titulo }))
      };
    }
    if (relatedEpisodes.length) {
      deleteRowsByIds_('episodios', relatedEpisodes.map(ep => ep.id));
    }
  }

  ref.sheet.deleteRow(ref.rowIndex);
  return { ok: true, message: 'Contenido eliminado.', id: id };
}

function deleteEpisode_(data) {
  const id = str_(data.id);
  if (!id) return { ok: false, error: 'Falta el id del episodio.' };

  const ref = findRowById_('episodios', id);
  if (!ref) return { ok: false, error: 'Episodio no encontrado.' };

  ref.sheet.deleteRow(ref.rowIndex);
  return { ok: true, message: 'Episodio eliminado.', id: id };
}

function listSeries_() {
  return getObjects_('contenido')
    .filter(r => normalize_(r.tipo) === 'serie' && normalize_(r.estado || 'activo') !== 'oculto')
    .map(r => ({
      id: r.id,
      titulo: r.titulo,
      año: r['año'] || '',
      categoria: r.categoria || '',
      portadaUrl: r.portadaUrl || '',
      estado: r.estado || 'activo',
    }));
}

function listCatalog_() {
  return getObjects_('contenido')
    .filter(r => normalize_(r.estado || 'activo') !== 'oculto')
    .map(sanitizeContent_);
}

function listEpisodes_() {
  return getObjects_('episodios')
    .filter(r => normalize_(r.estado || 'activo') !== 'oculto')
    .map(sanitizeEpisode_);
}

function getVideoBaseUrl_() {
  const props = PropertiesService.getScriptProperties();
  return {
    ok: true,
    url: str_(props.getProperty(VIDEO_BASE_URL_PROPERTY)),
    updatedAt: str_(props.getProperty(VIDEO_BASE_URL_UPDATED_AT_PROPERTY)),
    source: str_(props.getProperty(VIDEO_BASE_URL_SOURCE_PROPERTY))
  };
}

function setVideoBaseUrl_(data) {
  const props = PropertiesService.getScriptProperties();
  const url = str_(data.url).replace(/\/+$/, '');
  const source = str_(data.source || 'manual');

  if (url) {
    const updatedAt = nowIso_();
    props.setProperty(VIDEO_BASE_URL_PROPERTY, url);
    props.setProperty(VIDEO_BASE_URL_UPDATED_AT_PROPERTY, updatedAt);
    props.setProperty(VIDEO_BASE_URL_SOURCE_PROPERTY, source);
    return { ok: true, url: url, updatedAt: updatedAt, source: source };
  }

  props.deleteProperty(VIDEO_BASE_URL_PROPERTY);
  props.deleteProperty(VIDEO_BASE_URL_UPDATED_AT_PROPERTY);
  props.deleteProperty(VIDEO_BASE_URL_SOURCE_PROPERTY);
  return { ok: true, url: '', updatedAt: '', source: '' };
}

function syncQuickTunnelUrls_(data) {
  const url = str_(data.url).replace(/\/+$/, '');
  const source = str_(data.source || 'quick_tunnel_auto');
  if (!url) {
    return { ok: false, error: 'Falta la URL publica del Quick Tunnel.' };
  }

  const baseResult = setVideoBaseUrl_({ url: url, source: source });
  if (!baseResult.ok) return baseResult;

  const content = rewriteQuickTunnelUrlsInSheet_('contenido', url);
  const episodes = rewriteQuickTunnelUrlsInSheet_('episodios', url);

  return {
    ok: true,
    url: url,
    source: source,
    updatedAt: baseResult.updatedAt,
    updatedContent: content.updatedRows,
    updatedEpisodes: episodes.updatedRows,
    updatedTotal: Number(content.updatedRows || 0) + Number(episodes.updatedRows || 0)
  };
}

function sanitizeContent_(data) {
  const rawAudience = data.usuariosPermitidos || data.visibleToUsers || data.audiencia;
  const hasLegacyShift = !str_(data.creadoPor) && /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2})?$/.test(str_(rawAudience));
  return {
    id: str_(data.id),
    titulo: str_(data.titulo),
    tituloOriginal: str_(data.tituloOriginal),
    tipo: normalize_(data.tipo || 'pelicula'),
    categoria: str_(data.categoria || 'Familia'),
    generos: arrayOrCsv_(data.generos),
    año: numberOrBlank_(data.año),
    sinopsis: str_(data.sinopsis),
    tags: arrayOrCsv_(data.tags),
    portadaUrl: str_(data.portadaUrl),
    backdropUrl: str_(data.backdropUrl),
    r2Url: str_(data.r2Url),
    driveUrl: str_(data.driveUrl),
    destacado: normalize_(data.destacado) === 'si' ? 'si' : '',
    duracion: str_(data.duracion),
    clasificacion: str_(data.clasificacion || 'Familiar'),
    idioma: str_(data.idioma || 'Español'),
    estado: normalize_(data.estado || 'activo'),
    usuariosPermitidos: sanitizeAllowedUsersCsv_(hasLegacyShift ? 'todos' : rawAudience),
    fechaRegistro: str_(hasLegacyShift ? data.usuariosPermitidos : (data.fechaRegistro || nowIso_())),
    creadoPor: str_(hasLegacyShift ? data.fechaRegistro : (data.creadoPor || 'admin')),
    rating: numberOrBlank_(data.rating),
    ratingCount: numberOrBlank_(data.ratingCount),
    ratingSource: str_(data.ratingSource),
    subtitulos: str_(data.subtitulos),
    logoUrl: str_(data.logoUrl),
    previewVideoUrl: str_(data.previewVideoUrl || data.previewUrl || data.previewClipUrl),
    previewStart: str_(data.previewStart || data.previewAt || data.previewOffset || data.previewStartSeconds),
  };
}

function sanitizeEpisode_(data) {
  return {
    id: str_(data.id),
    serieId: str_(data.serieId),
    temporada: numberOrBlank_(data.temporada),
    numeroEpisodio: numberOrBlank_(data.numeroEpisodio),
    titulo: str_(data.titulo),
    tituloOriginal: str_(data.tituloOriginal),
    sinopsis: str_(data.sinopsis),
    duracion: str_(data.duracion),
    r2Url: str_(data.r2Url),
    driveUrl: str_(data.driveUrl),
    portadaUrl: str_(data.portadaUrl),
    airDate: str_(data.airDate),
    estado: normalize_(data.estado || 'activo'),
    fechaRegistro: str_(data.fechaRegistro || nowIso_()),
    creadoPor: str_(data.creadoPor || 'admin'),
    subtitulos: str_(data.subtitulos),
    previewVideoUrl: str_(data.previewVideoUrl || data.previewUrl || data.previewClipUrl),
    previewStart: str_(data.previewStart || data.previewAt || data.previewOffset || data.previewStartSeconds),
  };
}

function validateContent_(row) {
  if (!row.titulo) return { ok: false, error: 'El título es obligatorio.' };
  if (!['pelicula', 'serie'].includes(row.tipo)) return { ok: false, error: 'Tipo inválido en contenido.' };
  if (!['activo', 'borrador', 'oculto'].includes(row.estado)) return { ok: false, error: 'Estado inválido en contenido.' };
  if (row.tipo === 'pelicula' && !row.r2Url && !row.driveUrl && row.estado === 'activo') {
    return { ok: false, error: 'La película activa debe tener r2Url o driveUrl.' };
  }
  return { ok: true };
}

function validateEpisode_(row) {
  if (!row.serieId) return { ok: false, error: 'El serieId es obligatorio.' };
  if (!row.temporada) return { ok: false, error: 'La temporada es obligatoria.' };
  if (!row.numeroEpisodio) return { ok: false, error: 'El número de episodio es obligatorio.' };
  if (!row.titulo) return { ok: false, error: 'El título del episodio es obligatorio.' };
  if (!['activo', 'borrador', 'oculto'].includes(row.estado)) return { ok: false, error: 'Estado inválido en episodio.' };
  if (!row.r2Url && !row.driveUrl && row.estado === 'activo') {
    return { ok: false, error: 'El episodio activo debe tener r2Url o driveUrl.' };
  }
  return { ok: true };
}

function rewriteQuickTunnelUrlsInSheet_(key, baseUrl) {
  const sh = getSheet_(key);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) {
    return { updatedRows: 0 };
  }

  const headers = values[0].map(String);
  const r2Idx = headers.indexOf('r2Url');
  if (r2Idx === -1) {
    return { updatedRows: 0 };
  }

  let updatedRows = 0;
  const updates = [];
  for (var i = 1; i < values.length; i++) {
    const current = str_(values[i][r2Idx]);
    if (!current) continue;

    if (!shouldRewriteQuickTunnelUrl_(current)) continue;

    const relativePath = extractQuickTunnelRelativePath_(current);
    if (!relativePath) continue;

    const nextUrl = joinQuickTunnelUrl_(baseUrl, relativePath);
    if (!nextUrl || nextUrl === current) continue;

    updates.push({
      rowIndex: i + 1,
      value: nextUrl
    });
    updatedRows++;
  }

  updates.forEach(function(update) {
    sh.getRange(update.rowIndex, r2Idx + 1).setValue(update.value);
  });

  return { updatedRows: updatedRows };
}

function shouldRewriteQuickTunnelUrl_(value) {
  const raw = str_(value);
  if (!raw) return false;
  if (isR2PublicUrl_(raw)) return false;
  if (/^https?:\/\//i.test(raw)) {
    return isQuickTunnelUrl_(raw);
  }
  return true;
}

function isQuickTunnelUrl_(value) {
  const raw = str_(value);
  if (!raw) return false;
  return /^https?:\/\/[^\/?#]+\.trycloudflare\.com(?:[\/?#]|$)/i.test(raw);
}

function isR2PublicUrl_(value) {
  const raw = str_(value);
  if (!raw) return false;
  return /^https?:\/\/pub-eb7091956e164433aa5c9ef0bcc70356\.r2\.dev(?:[\/?#]|$)/i.test(raw);
}

function extractQuickTunnelRelativePath_(value) {
  const raw = str_(value);
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    const match = raw.match(/^https?:\/\/[^\/?#]+(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i);
    const pathname = match && match[1] ? match[1] : '';
    return decodeURIComponent(String(pathname || '')).replace(/^\/+/, '');
  }

  return raw.replace(/[?#].*$/, '').replace(/^\/+/, '');
}

function joinQuickTunnelUrl_(baseUrl, relativePath) {
  const base = str_(baseUrl).replace(/\/+$/, '');
  const path = str_(relativePath).replace(/^\/+/, '');
  if (!base || !path) return '';

  const encodedPath = path.split('/').filter(Boolean).map(function(part) {
    return encodeURIComponent(part);
  }).join('/');

  return base + '/' + encodedPath;
}

function contentRow_(r) {
  return HEADERS.contenido.map(h => r[h] || '');
}

function episodeRow_(r) {
  return HEADERS.episodios.map(h => r[h] || '');
}

// ============================================================
// PROGRESO / FAVORITOS / CONTINUAR VIENDO
// ============================================================

function saveProgress_(data) {
  const row = {
    id: str_(data.id),
    usuarioId: str_(data.usuarioId),
    contenidoId: str_(data.contenidoId),
    episodioId: str_(data.episodioId),
    tipo: normalize_(data.tipo),
    temporada: numberOrBlank_(data.temporada),
    numeroEpisodio: numberOrBlank_(data.numeroEpisodio),
    segundosVistos: numberOrZero_(data.segundosVistos),
    duracionSegundos: numberOrZero_(data.duracionSegundos),
    porcentaje: numberOrZero_(data.porcentaje),
    completado: normalize_(data.completado) === 'si' ? 'si' : 'no',
    ultimaVisualizacion: str_(data.ultimaVisualizacion || nowIso_()),
    estado: normalize_(data.estado || 'viendo'),
  };

  if (!row.usuarioId) return { ok: false, error: 'usuarioId es obligatorio.' };
  if (!row.contenidoId) return { ok: false, error: 'contenidoId es obligatorio.' };
  if (!['pelicula', 'episodio'].includes(row.tipo)) return { ok: false, error: 'Tipo de progreso inválido.' };

  const keyMatch = (p) => p.usuarioId === row.usuarioId && p.contenidoId === row.contenidoId && p.episodioId === row.episodioId;
  const all = getObjects_('progreso');
  const existing = all.find(keyMatch);
  const sh = getSheet_('progreso');

  if (existing) {
    const ref = findRowById_('progreso', existing.id);
    row.id = existing.id;
    sh.getRange(ref.rowIndex, 1, 1, HEADERS.progreso.length).setValues([HEADERS.progreso.map(h => row[h] || '')]);
  } else {
    row.id = nextId_('prg');
    sh.appendRow(HEADERS.progreso.map(h => row[h] || ''));
  }

  upsertContinueWatching_({
    usuarioId: row.usuarioId,
    contenidoId: row.contenidoId,
    episodioId: row.episodioId,
    tipo: row.tipo,
    tituloMostrado: str_(data.tituloMostrado),
    portadaUrl: str_(data.portadaUrl),
    segundosVistos: row.segundosVistos,
    duracionSegundos: row.duracionSegundos,
    porcentaje: row.porcentaje,
    ultimaVisualizacion: row.ultimaVisualizacion,
  });

  return { ok: true, message: 'Progreso guardado.' };
}

function toggleFavorite_(data) {
  const usuarioId = str_(data.usuarioId);
  const contenidoId = str_(data.contenidoId);
  const episodioId = str_(data.episodioId);
  const tipo = normalize_(data.tipo || (episodioId ? 'episodio' : 'pelicula'));

  if (!usuarioId) return { ok: false, error: 'usuarioId es obligatorio.' };
  if (!contenidoId && !episodioId) return { ok: false, error: 'Falta contenidoId o episodioId.' };

  const sh = getSheet_('favoritos');
  const all = getObjects_('favoritos');
  const existing = all.find(f =>
    f.usuarioId === usuarioId &&
    String(f.contenidoId || '') === contenidoId &&
    String(f.episodioId || '') === episodioId
  );

  if (existing) {
    const ref = findRowById_('favoritos', existing.id);
    sh.deleteRow(ref.rowIndex);
    return { ok: true, favorite: false, message: 'Quitado de favoritos.' };
  }

  sh.appendRow([
    nextId_('fav'),
    usuarioId,
    contenidoId,
    episodioId,
    tipo,
    nowIso_(),
  ]);

  return { ok: true, favorite: true, message: 'Agregado a favoritos.' };
}

function listFavorites_(data) {
  const usuarioId = str_(data.usuarioId);
  if (!usuarioId) return { ok: false, error: 'usuarioId es obligatorio.' };

  const favorites = getObjects_('favoritos').filter(f => f.usuarioId === usuarioId);
  return { ok: true, favorites: favorites };
}

function upsertContinueWatching_(data) {
  const row = {
    id: str_(data.id),
    usuarioId: str_(data.usuarioId),
    contenidoId: str_(data.contenidoId),
    episodioId: str_(data.episodioId),
    tipo: normalize_(data.tipo),
    tituloMostrado: str_(data.tituloMostrado),
    portadaUrl: str_(data.portadaUrl),
    segundosVistos: numberOrZero_(data.segundosVistos),
    duracionSegundos: numberOrZero_(data.duracionSegundos),
    porcentaje: numberOrZero_(data.porcentaje),
    ultimaVisualizacion: str_(data.ultimaVisualizacion || nowIso_()),
  };

  if (!row.usuarioId || !row.contenidoId) return { ok: false, error: 'usuarioId y contenidoId son obligatorios.' };

  const sh = getSheet_('continuar');
  const all = getObjects_('continuar');
  const existing = all.find(c => c.usuarioId === row.usuarioId && c.contenidoId === row.contenidoId && c.episodioId === row.episodioId);

  if (existing) {
    const ref = findRowById_('continuar', existing.id);
    row.id = existing.id;
    sh.getRange(ref.rowIndex, 1, 1, HEADERS.continuar.length).setValues([HEADERS.continuar.map(h => row[h] || '')]);
  } else {
    row.id = nextId_('cvw');
    sh.appendRow(HEADERS.continuar.map(h => row[h] || ''));
  }

  return { ok: true, message: 'Continuar viendo actualizado.' };
}

function getUserBootstrap_(data) {
  const usuarioId = str_(data.usuarioId);
  if (!usuarioId) return { ok: false, error: 'usuarioId es obligatorio.' };

  const progress = getObjects_('progreso').filter(r => r.usuarioId === usuarioId);
  const favorites = getObjects_('favoritos').filter(r => r.usuarioId === usuarioId);
  const continueWatching = getObjects_('continuar')
    .filter(r => r.usuarioId === usuarioId)
    .sort((a, b) => String(b.ultimaVisualizacion || '').localeCompare(String(a.ultimaVisualizacion || '')));

  return {
    ok: true,
    progress: progress,
    favorites: favorites,
    continueWatching: continueWatching,
  };
}

// ============================================================
// HELPERS
// ============================================================

function getSheet_(key) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const name = SHEETS[key];
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('No existe la hoja: ' + name);
  ensureHeader_(sh, HEADERS[key]);
  return sh;
}

function getObjects_(key) {
  const sh = getSheet_(key);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  }).filter(obj => Object.values(obj).some(v => String(v || '').trim() !== ''));
}

function findRowById_(key, id) {
  const sh = getSheet_(key);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const idIdx = headers.indexOf('id');
  if (idIdx === -1) throw new Error('La hoja ' + key + ' no tiene columna id.');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idIdx]).trim() === String(id).trim()) {
      const obj = {};
      headers.forEach((h, idx) => obj[h] = values[i][idx]);
      return { sheet: sh, rowIndex: i + 1, obj: obj };
    }
  }
  return null;
}

function deleteRowsByIds_(key, ids) {
  const wanted = ids.map(str_).filter(Boolean);
  if (!wanted.length) return;

  const sh = getSheet_(key);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(String);
  const idIdx = headers.indexOf('id');
  if (idIdx === -1) throw new Error('La hoja ' + key + ' no tiene columna id.');

  const rowIndexes = [];
  for (var i = 1; i < values.length; i++) {
    if (wanted.indexOf(String(values[i][idIdx]).trim()) !== -1) {
      rowIndexes.push(i + 1);
    }
  }

  rowIndexes.sort(function(a, b) { return b - a; }).forEach(function(rowIndex) {
    sh.deleteRow(rowIndex);
  });
}

function deleteRowsByFieldValues_(key, headerName, values) {
  const wanted = values.map(str_).filter(Boolean);
  if (!wanted.length) return;

  const sh = getSheet_(key);
  const valuesMatrix = sh.getDataRange().getValues();
  if (valuesMatrix.length < 2) return;
  const headers = valuesMatrix[0].map(String);
  const headerIdx = headers.indexOf(headerName);
  if (headerIdx === -1) throw new Error('La hoja ' + key + ' no tiene columna ' + headerName + '.');

  const rowIndexes = [];
  for (var i = 1; i < valuesMatrix.length; i++) {
    if (wanted.indexOf(String(valuesMatrix[i][headerIdx]).trim()) !== -1) {
      rowIndexes.push(i + 1);
    }
  }

  rowIndexes.sort(function(a, b) { return b - a; }).forEach(function(rowIndex) {
    sh.deleteRow(rowIndex);
  });
}

function countActiveAdminsExcluding_(excludeId) {
  return getObjects_('usuarios').filter(function(user) {
    if (str_(user.id) === str_(excludeId)) return false;
    return normalize_(user.rol) === 'admin' && normalize_(user.estado) === 'activo';
  }).length;
}

function wouldLeaveWithoutActiveAdmin_(currentUser, targetId, nextRol, nextEstado) {
  const isActiveAdmin = normalize_(currentUser.rol) === 'admin' && normalize_(currentUser.estado) === 'activo';
  if (!isActiveAdmin) return false;

  const keepsAdminActive = normalize_(nextRol) === 'admin' && normalize_(nextEstado) === 'activo';
  if (keepsAdminActive) return false;

  return countActiveAdminsExcluding_(targetId) === 0;
}

function colIndex_(key, headerName) {
  const idx = HEADERS[key].indexOf(headerName);
  if (idx === -1) throw new Error('No existe la columna ' + headerName + ' en ' + key);
  return idx + 1;
}

function nextId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function hashPassword_(plain) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(plain), Utilities.Charset.UTF_8);
  return digest.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function normalize_(v) {
  return String(v || '').trim().toLowerCase();
}

function str_(v) {
  return String(v || '').trim();
}

function numberOrBlank_(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? '' : n;
}

function numberOrZero_(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function arrayOrCsv_(v) {
  if (Array.isArray(v)) return v.map(str_).filter(Boolean).join(', ');
  return str_(v);
}

function sanitizeAllowedUsersCsv_(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map(function(part) { return part.trim(); })
        .filter(Boolean);

  if (!list.length) return 'todos';

  const normalized = [];
  const seen = {};

  list.forEach(function(entry) {
    const raw = str_(entry);
    const key = normalize_(raw);
    if (!raw || seen[key]) return;
    seen[key] = true;
    normalized.push(raw);
  });

  if (!normalized.length) return 'todos';
  if (normalized.some(function(entry) {
    const key = normalize_(entry);
    return key === 'todos' || key === '*' || key === 'all';
  })) {
    return 'todos';
  }

  return normalized.join(', ');
}

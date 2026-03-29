// PhoenixFuel — Allegati: Scontrini + DAS ricevuti (Storage Supabase)

var BUCKET_ALLEGATI = 'allegati';
var STORAGE_LIMIT_MB = 1024; // Piano Free Supabase = 1 GB

// ── TAB SWITCHING ALLEGATI ──────────────────────────────────────
function switchAllegatiTab(btn) {
  document.querySelectorAll('.all-tab').forEach(function(t) {
    t.style.background = 'var(--bg)'; t.style.color = 'var(--text)';
    t.style.border = '0.5px solid var(--border)'; t.classList.remove('active');
  });
  btn.style.background = ''; btn.style.color = ''; btn.style.border = '';
  btn.classList.add('active');
  document.querySelectorAll('.all-panel').forEach(function(p) { p.style.display = 'none'; });
  document.getElementById(btn.dataset.tab).style.display = '';
  if (btn.dataset.tab === 'all-scontrini') caricaRegistroScontrini();
  else if (btn.dataset.tab === 'all-das') caricaRegistroDasRicevuti();
}

// ── CARICA TAB ALLEGATI ─────────────────────────────────────────
function caricaAllegati() {
  _initAnnoScontrini();
  _initAnnoDasRic();
  caricaRegistroScontrini();
  aggiornaIndicatoreStorage();
}

// ── INDICATORE SPAZIO STORAGE ───────────────────────────────────
async function aggiornaIndicatoreStorage() {
  var container = document.getElementById('storage-usage-bar');
  if (!container) return;

  // Somma dimensioni da tabella allegati (nuovi) + documenti_ordine (vecchi)
  var [resAll, resDoc] = await Promise.all([
    sb.from('allegati').select('dimensione_bytes'),
    sb.from('documenti_ordine').select('id')  // non ha dimensione, stimiamo
  ]);

  var totBytes = 0;
  (resAll.data || []).forEach(function(r) { totBytes += Number(r.dimensione_bytes || 0); });

  // Stima vecchi documenti ordine: ~300KB ciascuno (PDF medi)
  var nDocOrdine = (resDoc.data || []).length;
  totBytes += nDocOrdine * 300000;

  var usatoMB = totBytes / (1024 * 1024);
  var pct = Math.min(100, Math.round((usatoMB / STORAGE_LIMIT_MB) * 100));

  // Colori: verde < 60%, giallo 60-80%, rosso > 80%
  var barColor, textColor, bgColor;
  if (pct < 60) {
    barColor = '#639922'; textColor = '#27500A'; bgColor = '#EAF3DE';
  } else if (pct < 80) {
    barColor = '#BA7517'; textColor = '#633806'; bgColor = '#FAEEDA';
  } else {
    barColor = '#E24B4A'; textColor = '#791F1F'; bgColor = '#FCEBEB';
  }

  var usatoLabel = usatoMB < 1 ? Math.round(usatoMB * 1024) + ' KB' : usatoMB.toFixed(1) + ' MB';
  var limiteLabel = STORAGE_LIMIT_MB >= 1024 ? (STORAGE_LIMIT_MB / 1024).toFixed(0) + ' GB' : STORAGE_LIMIT_MB + ' MB';

  var nAllegati = (resAll.data || []).length;
  var totFiles = nAllegati + nDocOrdine;

  container.innerHTML =
    '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:' + bgColor + ';border-radius:10px;border:0.5px solid ' + barColor + '33">' +
      '<div style="font-size:18px">💾</div>' +
      '<div style="flex:1">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<span style="font-size:12px;font-weight:600;color:' + textColor + '">Spazio storage</span>' +
          '<span style="font-size:11px;color:' + textColor + '">' + totFiles + ' file · ' + usatoLabel + ' / ' + limiteLabel + '</span>' +
        '</div>' +
        '<div style="height:8px;background:rgba(0,0,0,0.08);border-radius:4px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:4px;transition:width 0.4s"></div>' +
        '</div>' +
        (pct >= 80 ? '<div style="font-size:10px;color:#A32D2D;margin-top:3px;font-weight:500">⚠️ Spazio quasi esaurito — valuta upgrade a piano Pro</div>' : '') +
      '</div>' +
    '</div>';
}

function _initAnnoScontrini() {
  var sel = document.getElementById('all-sco-anno');
  if (!sel || sel.options.length > 1) return;
  var anno = new Date().getFullYear();
  sel.innerHTML = '';
  for (var a = anno; a >= anno - 3; a--) {
    sel.innerHTML += '<option value="' + a + '"' + (a === anno ? ' selected' : '') + '>' + a + '</option>';
  }
  var mesSel = document.getElementById('all-sco-mese');
  if (mesSel) mesSel.value = String(new Date().getMonth() + 1).padStart(2, '0');
}

function _initAnnoDasRic() {
  var sel = document.getElementById('das-ric-filtro-anno');
  if (!sel || sel.options.length > 1) return;
  var anno = new Date().getFullYear();
  sel.innerHTML = '';
  for (var a = anno; a >= anno - 3; a--) {
    sel.innerHTML += '<option value="' + a + '"' + (a === anno ? ' selected' : '') + '>' + a + '</option>';
  }
  var mesSel = document.getElementById('das-ric-filtro-mese');
  if (mesSel) mesSel.value = String(new Date().getMonth() + 1).padStart(2, '0');
  // Data form
  var dRic = document.getElementById('das-ric-data');
  if (dRic && !dRic.value) dRic.value = oggiISO;
  // Popola dropdown fornitore nel form
  _popolaFornitoreDasRic();
  // Popola prodotto
  popolaDropdownProdotti('das-ric-prodotto', false);
}

async function _popolaFornitoreDasRic() {
  var { data: fornitori } = await sb.from('fornitori').select('nome').eq('attivo', true).order('nome');
  var selForm = document.getElementById('das-ric-fornitore');
  var selFiltro = document.getElementById('das-ric-filtro-fornitore');
  (fornitori || []).forEach(function(f) {
    if (selForm) selForm.innerHTML += '<option>' + esc(f.nome) + '</option>';
    if (selFiltro) selFiltro.innerHTML += '<option>' + esc(f.nome) + '</option>';
  });
}

// ═══════════════════════════════════════════════════════════════════
// SCONTRINI — Upload da Cassa (inline preview)
// ═══════════════════════════════════════════════════════════════════

async function uploadScontrinoCassa(input) {
  var files = input.files;
  if (!files || !files.length) return;
  var data = document.getElementById('cassa-data').value;
  if (!data) { toast('Seleziona prima una data nella cassa'); return; }

  toast('Caricamento ' + files.length + ' file...');
  for (var i = 0; i < files.length; i++) {
    await _uploadAllegato(files[i], 'scontrino', data, data, 'stazione_cassa');
  }
  input.value = '';
  toast('Scontrino/i caricati!');
  caricaScontriniCassaPreview(data);
  aggiornaIndicatoreStorage();
}

async function caricaScontriniCassaPreview(data) {
  var container = document.getElementById('scontrini-cassa-preview');
  if (!container) return;
  var { data: allegati } = await sb.from('allegati').select('*')
    .eq('tipo', 'scontrino').eq('data', data).order('created_at');
  if (!allegati || !allegati.length) {
    container.innerHTML = '';
    return;
  }
  var html = '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">📎 Scontrini allegati (' + allegati.length + ')</div>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  allegati.forEach(function(a) {
    var url = _getPublicUrl(a.path_storage);
    var isImage = _isImmagine(a.mime_type);
    html += '<div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:0.5px solid var(--border);background:var(--bg);cursor:pointer" title="' + esc(a.nome_file) + '">';
    if (isImage) {
      html += '<img src="' + url + '" onclick="apriLightbox(\'' + url + '\')" style="width:100%;height:100%;object-fit:cover" />';
    } else {
      html += '<a href="' + url + '" target="_blank" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:28px;text-decoration:none;color:var(--text-muted)">📄</a>';
    }
    html += '<button onclick="eliminaAllegato(\'' + a.id + '\',\'' + esc(a.path_storage) + '\',function(){caricaScontriniCassaPreview(\'' + data + '\')})" style="position:absolute;top:2px;right:2px;background:rgba(226,75,74,0.9);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:18px;text-align:center">×</button>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════
// SCONTRINI — Registro completo (tab Allegati → Scontrini)
// ═══════════════════════════════════════════════════════════════════

async function uploadScontrinoRegistro(input) {
  var files = input.files;
  if (!files || !files.length) return;
  var data = oggiISO;
  toast('Caricamento ' + files.length + ' file...');
  for (var i = 0; i < files.length; i++) {
    await _uploadAllegato(files[i], 'scontrino', data, data, 'stazione_cassa');
  }
  input.value = '';
  toast('Scontrino/i caricati!');
  caricaRegistroScontrini();
  aggiornaIndicatoreStorage();
}

async function caricaRegistroScontrini() {
  var anno = (document.getElementById('all-sco-anno') || {}).value || new Date().getFullYear();
  var mese = (document.getElementById('all-sco-mese') || {}).value || '';
  var daISO, aISO;
  if (mese) {
    daISO = anno + '-' + mese + '-01';
    var ultimoGg = new Date(anno, parseInt(mese), 0).getDate();
    aISO = anno + '-' + mese + '-' + String(ultimoGg).padStart(2, '0');
  } else {
    daISO = anno + '-01-01';
    aISO = anno + '-12-31';
  }

  var { data: allegati } = await sb.from('allegati').select('*')
    .eq('tipo', 'scontrino').gte('data', daISO).lte('data', aISO)
    .order('data', { ascending: false });

  var container = document.getElementById('all-sco-griglia');
  if (!allegati || !allegati.length) {
    container.innerHTML = '<div style="grid-column:1/-1;font-size:12px;color:var(--text-hint);padding:20px 0;text-align:center">Nessuno scontrino per il periodo selezionato</div>';
    return;
  }

  // Raggruppa per data
  var perData = {};
  allegati.forEach(function(a) {
    if (!perData[a.data]) perData[a.data] = [];
    perData[a.data].push(a);
  });

  var html = '';
  Object.keys(perData).sort().reverse().forEach(function(data) {
    var items = perData[data];
    var dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });
    html += '<div style="grid-column:1/-1;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-top:8px;padding-bottom:4px;border-bottom:0.5px solid var(--border)">' + dataFmt + ' (' + items.length + ')</div>';
    items.forEach(function(a) {
      var url = _getPublicUrl(a.path_storage);
      var isImage = _isImmagine(a.mime_type);
      html += '<div style="position:relative;border-radius:10px;overflow:hidden;border:0.5px solid var(--border);background:var(--bg)">';
      if (isImage) {
        html += '<img src="' + url + '" onclick="apriLightbox(\'' + url + '\')" style="width:100%;height:140px;object-fit:cover;cursor:zoom-in;display:block" />';
      } else {
        html += '<a href="' + url + '" target="_blank" style="display:flex;align-items:center;justify-content:center;width:100%;height:140px;font-size:36px;text-decoration:none;color:var(--text-muted)">📄</a>';
      }
      html += '<div style="padding:6px 8px;font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(a.nome_file) + '">' + esc(a.nome_file) + '</div>';
      html += '<div style="position:absolute;top:4px;right:4px;display:flex;gap:3px">';
      html += '<a href="' + url + '" target="_blank" download style="background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer;text-align:center;line-height:22px;text-decoration:none">⬇</a>';
      html += '<button onclick="eliminaAllegato(\'' + a.id + '\',\'' + esc(a.path_storage) + '\',caricaRegistroScontrini)" style="background:rgba(226,75,74,0.85);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer;line-height:22px">×</button>';
      html += '</div></div>';
    });
  });
  container.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════
// DAS RICEVUTI — Registrazione e registro
// ═══════════════════════════════════════════════════════════════════

async function salvaDasRicevuto() {
  var data = document.getElementById('das-ric-data').value;
  var fornitore = document.getElementById('das-ric-fornitore').value;
  var prodotto = document.getElementById('das-ric-prodotto').value;
  var numero = document.getElementById('das-ric-numero').value.trim();
  var litri = parseFloat(document.getElementById('das-ric-litri').value) || 0;
  var note = document.getElementById('das-ric-note').value.trim();
  var fileInput = document.getElementById('das-ric-file');

  if (!data) { toast('Inserisci la data'); return; }
  if (!fornitore) { toast('Seleziona il fornitore'); return; }
  if (!prodotto) { toast('Seleziona il prodotto'); return; }
  if (!numero) { toast('Inserisci il numero DAS'); return; }
  if (litri <= 0) { toast('Inserisci i litri dichiarati'); return; }

  toast('Salvataggio in corso...');

  var pathStorage = null;
  var nomeFile = null;
  var mimeType = null;
  var dimBytes = null;

  // Upload file se presente
  if (fileInput.files && fileInput.files.length) {
    var file = fileInput.files[0];
    if (file.size > 15 * 1024 * 1024) { toast('File troppo grande (max 15MB)'); return; }
    nomeFile = file.name;
    mimeType = file.type;
    dimBytes = file.size;
    var mm = String(new Date(data).getMonth() + 1).padStart(2, '0');
    var yyyy = data.substring(0, 4);
    var safeName = nomeFile.replace(/[^a-zA-Z0-9._-]/g, '_');
    pathStorage = 'das-ricevuti/' + yyyy + '/' + mm + '/' + Date.now() + '_' + safeName;

    var { error: errUp } = await sb.storage.from(BUCKET_ALLEGATI).upload(pathStorage, file, { contentType: mimeType });
    if (errUp) { toast('Errore upload: ' + errUp.message); return; }
  }

  var record = {
    tipo: 'das_ricevuto',
    data: data,
    fornitore: fornitore,
    prodotto: prodotto,
    numero_das: numero,
    litri_das: litri,
    note: note || null,
    nome_file: nomeFile || 'nessun file',
    path_storage: pathStorage || '',
    bucket: BUCKET_ALLEGATI,
    mime_type: mimeType,
    dimensione_bytes: dimBytes,
    riferimento_tabella: 'stazione',
    riferimento_id: data,
    caricato_da: utenteCorrente ? utenteCorrente.nome : null
  };

  var { error } = await sb.from('allegati').insert([record]);
  if (error) { toast('Errore: ' + error.message); return; }

  _auditLog('registra_das_ricevuto', 'allegati', 'DAS ' + numero + ' da ' + fornitore + ' — ' + litri + 'L ' + prodotto);
  toast('DAS ricevuto registrato!');
  aggiornaIndicatoreStorage();

  // Reset form
  document.getElementById('das-ric-numero').value = '';
  document.getElementById('das-ric-litri').value = '';
  document.getElementById('das-ric-note').value = '';
  if (fileInput) fileInput.value = '';

  caricaRegistroDasRicevuti();
}

async function caricaRegistroDasRicevuti() {
  var anno = (document.getElementById('das-ric-filtro-anno') || {}).value || new Date().getFullYear();
  var mese = (document.getElementById('das-ric-filtro-mese') || {}).value || '';
  var fornitore = (document.getElementById('das-ric-filtro-fornitore') || {}).value || '';

  var daISO, aISO;
  if (mese) {
    daISO = anno + '-' + mese + '-01';
    var ultimoGg = new Date(anno, parseInt(mese), 0).getDate();
    aISO = anno + '-' + mese + '-' + String(ultimoGg).padStart(2, '0');
  } else {
    daISO = anno + '-01-01';
    aISO = anno + '-12-31';
  }

  var query = sb.from('allegati').select('*')
    .eq('tipo', 'das_ricevuto').gte('data', daISO).lte('data', aISO)
    .order('data', { ascending: false });

  if (fornitore) query = query.eq('fornitore', fornitore);

  var { data: allegati } = await query;
  var tbody = document.getElementById('das-ric-tabella');

  if (!allegati || !allegati.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-hint);padding:20px">Nessun DAS ricevuto per il periodo selezionato</td></tr>';
    return;
  }

  var html = '';
  var totLitri = 0;
  allegati.forEach(function(a) {
    var url = a.path_storage ? _getPublicUrl(a.path_storage) : '';
    var isImage = _isImmagine(a.mime_type);
    totLitri += Number(a.litri_das || 0);

    html += '<tr>';
    html += '<td>' + a.data + '</td>';
    html += '<td style="font-weight:600">' + esc(a.fornitore || '') + '</td>';
    html += '<td>' + esc(a.prodotto || '') + '</td>';
    html += '<td style="font-family:var(--font-mono);font-weight:500">' + esc(a.numero_das || '') + '</td>';
    html += '<td style="font-family:var(--font-mono)">' + fmtL(a.litri_das || 0) + '</td>';
    html += '<td style="font-size:11px;color:var(--text-muted)">' + esc(a.note || '') + '</td>';

    // Allegato
    if (url) {
      if (isImage) {
        html += '<td><img src="' + url + '" onclick="apriLightbox(\'' + url + '\')" style="width:40px;height:40px;object-fit:cover;border-radius:6px;cursor:zoom-in;border:0.5px solid var(--border)" /></td>';
      } else {
        html += '<td><a href="' + url + '" target="_blank" style="color:var(--accent);text-decoration:none;font-size:12px">📄 Apri</a></td>';
      }
    } else {
      html += '<td style="font-size:10px;color:var(--text-hint)">—</td>';
    }

    // Azioni
    html += '<td>';
    if (url) html += '<a href="' + url + '" download target="_blank" class="btn-edit" title="Scarica">⬇</a>';
    html += '<button class="btn-danger" onclick="eliminaAllegato(\'' + a.id + '\',\'' + esc(a.path_storage) + '\',caricaRegistroDasRicevuti)">x</button>';
    html += '</td></tr>';
  });

  // Riga totale
  html += '<tr style="font-weight:700;background:var(--bg)"><td colspan="4">TOTALE (' + allegati.length + ' DAS)</td><td style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</td><td colspan="3"></td></tr>';

  tbody.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY COMUNI ALLEGATI
// ═══════════════════════════════════════════════════════════════════

async function _uploadAllegato(file, tipo, data, rifId, rifTabella, extra) {
  if (file.size > 15 * 1024 * 1024) { toast('File troppo grande: ' + file.name + ' (max 15MB)'); return null; }

  var mm = String(new Date(data).getMonth() + 1).padStart(2, '0');
  var yyyy = data.substring(0, 4);
  var cartella = tipo === 'scontrino' ? 'scontrini' : tipo === 'das_ricevuto' ? 'das-ricevuti' : 'altri';
  var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  var pathStorage = cartella + '/' + yyyy + '/' + mm + '/' + Date.now() + '_' + safeName;

  var { error: errUp } = await sb.storage.from(BUCKET_ALLEGATI).upload(pathStorage, file, { contentType: file.type });
  if (errUp) { toast('Errore upload: ' + errUp.message); return null; }

  var record = Object.assign({
    tipo: tipo,
    data: data,
    riferimento_id: rifId || null,
    riferimento_tabella: rifTabella || null,
    nome_file: file.name,
    path_storage: pathStorage,
    bucket: BUCKET_ALLEGATI,
    mime_type: file.type,
    dimensione_bytes: file.size,
    caricato_da: utenteCorrente ? utenteCorrente.nome : null
  }, extra || {});

  var { data: inserted, error: errDb } = await sb.from('allegati').insert([record]).select().single();
  if (errDb) { toast('Errore DB: ' + errDb.message); return null; }
  return inserted;
}

async function eliminaAllegato(id, pathStorage, callback) {
  if (!confirm('Eliminare questo allegato?')) return;

  // Elimina da storage (solo se path valido)
  if (pathStorage) {
    await sb.storage.from(BUCKET_ALLEGATI).remove([pathStorage]);
  }
  // Elimina record
  await sb.from('allegati').delete().eq('id', id);
  toast('Allegato eliminato');
  aggiornaIndicatoreStorage();

  if (typeof callback === 'function') callback();
}

function _getPublicUrl(path) {
  if (!path) return '';
  return SUPABASE_URL + '/storage/v1/object/public/' + BUCKET_ALLEGATI + '/' + path;
}

function _isImmagine(mimeType) {
  return mimeType && (mimeType.indexOf('image/') === 0);
}

// ── LIGHTBOX ────────────────────────────────────────────────────
function apriLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox-overlay').style.display = 'flex';
}

function chiudiLightbox(event) {
  if (event && event.target && event.target.tagName === 'IMG') return;
  document.getElementById('lightbox-overlay').style.display = 'none';
  document.getElementById('lightbox-img').src = '';
}

// Chiudi con Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('lightbox-overlay').style.display === 'flex') {
    chiudiLightbox();
  }
});

// PhoenixFuel — Allegati: Scontrini + DAS ricevuti (collegati a ordini)

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
  else if (btn.dataset.tab === 'all-das') { caricaDasOrdiniStazione(); caricaStoricoDasStazione(); }
}

// ── CARICA TAB ALLEGATI ─────────────────────────────────────────
function caricaAllegati() {
  _initAnnoScontrini();
  _initAnnoStoricoDas();
  caricaRegistroScontrini();
  aggiornaIndicatoreStorage();
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

function _initAnnoStoricoDas() {
  var sel = document.getElementById('das-ric-filtro-anno');
  if (!sel || sel.options.length > 1) return;
  var anno = new Date().getFullYear();
  sel.innerHTML = '';
  for (var a = anno; a >= anno - 3; a--) {
    sel.innerHTML += '<option value="' + a + '"' + (a === anno ? ' selected' : '') + '>' + a + '</option>';
  }
  var mesSel = document.getElementById('das-ric-filtro-mese');
  if (mesSel) mesSel.value = String(new Date().getMonth() + 1).padStart(2, '0');
}

// ── INDICATORE SPAZIO STORAGE ───────────────────────────────────
async function aggiornaIndicatoreStorage() {
  var container = document.getElementById('storage-usage-bar');
  if (!container) return;

  var [resAll, resDoc] = await Promise.all([
    sb.from('allegati').select('dimensione_bytes'),
    sb.from('documenti_ordine').select('id')
  ]);

  var totBytes = 0;
  (resAll.data || []).forEach(function(r) { totBytes += Number(r.dimensione_bytes || 0); });
  var nDocOrdine = (resDoc.data || []).length;
  totBytes += nDocOrdine * 300000;

  var usatoMB = totBytes / (1024 * 1024);
  var pct = Math.min(100, Math.round((usatoMB / STORAGE_LIMIT_MB) * 100));

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
// DAS RICEVUTI — Collegati a ordini (Stazione + Deposito)
// ═══════════════════════════════════════════════════════════════════

// Funzione generica: carica ordini in attesa di DAS per un tipo_ordine
async function _caricaDasOrdini(tipoOrdine, containerId, filtroStatoId) {
  var filtro = document.getElementById(filtroStatoId);
  var filtroVal = filtro ? filtro.value : 'senza_das';

  // Carica ordini recenti (ultimi 60gg) del tipo richiesto
  var daData = new Date();
  daData.setDate(daData.getDate() - 60);
  var daISO = daData.toISOString().split('T')[0];

  var query = sb.from('ordini').select('id,data,fornitore,prodotto,litri,stato,note')
    .eq('tipo_ordine', tipoOrdine).neq('stato', 'annullato')
    .gte('data', daISO).order('data', { ascending: false });

  var [ordiniRes, docsRes] = await Promise.all([
    query,
    sb.from('documenti_ordine').select('ordine_id,nome_file,percorso_storage,tipo,created_at')
      .eq('tipo', 'das').order('created_at', { ascending: false })
  ]);

  var ordini = ordiniRes.data || [];
  var docs = docsRes.data || [];

  // Mappa ordineId → documenti DAS
  var docMap = {};
  docs.forEach(function(d) {
    if (!docMap[d.ordine_id]) docMap[d.ordine_id] = [];
    docMap[d.ordine_id].push(d);
  });

  // Filtra
  if (filtroVal === 'senza_das') {
    ordini = ordini.filter(function(o) { return !docMap[o.id] || !docMap[o.id].length; });
  } else if (filtroVal === 'con_das') {
    ordini = ordini.filter(function(o) { return docMap[o.id] && docMap[o.id].length; });
  }

  var container = document.getElementById(containerId);
  if (!container) return;

  if (!ordini.length) {
    var msgVuoto = filtroVal === 'senza_das'
      ? '✅ Tutti gli ordini recenti hanno il DAS allegato'
      : 'Nessun ordine trovato per questo filtro';
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px">' + msgVuoto + '</div>';
    return;
  }

  var html = '';
  ordini.forEach(function(o) {
    var hasDas = docMap[o.id] && docMap[o.id].length;
    var borderColor = hasDas ? '#639922' : '#BA7517';
    var bgColor = hasDas ? '#EAF3DE' : '#FAEEDA';
    var inputId = 'das-file-' + o.id;

    html += '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:' + bgColor + ';border-left:4px solid ' + borderColor + ';border-radius:0 10px 10px 0;margin-bottom:6px;flex-wrap:wrap">';

    // Info ordine
    html += '<div style="flex:1;min-width:200px">';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
    html += '<span style="font-family:var(--font-mono);font-weight:600;font-size:13px">' + o.data + '</span>';
    html += '<span style="font-weight:600">' + esc(o.fornitore) + '</span>';
    html += '<span class="badge blue" style="font-size:9px">' + esc(o.prodotto) + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:13px;font-weight:500">' + fmtL(o.litri) + '</span>';
    html += badgeStato(o.stato);
    html += '</div>';

    // DAS già allegati
    if (hasDas) {
      docMap[o.id].forEach(function(d) {
        var url = SUPABASE_URL + '/storage/v1/object/public/Das/' + d.percorso_storage;
        var isImg = _isImmagine(_getMimeFromName(d.nome_file));
        html += '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:11px">';
        html += '<span style="color:#639922;font-weight:600">✅ DAS:</span>';
        if (isImg) {
          html += '<img src="' + url + '" onclick="apriLightbox(\'' + url + '\')" style="width:32px;height:32px;object-fit:cover;border-radius:4px;cursor:zoom-in;border:0.5px solid var(--border)" />';
        }
        html += '<a href="' + url + '" target="_blank" style="color:var(--accent);text-decoration:none">' + esc(d.nome_file) + '</a>';
        html += '<span style="color:var(--text-hint)">' + new Date(d.created_at).toLocaleDateString('it-IT') + '</span>';
        html += '<button onclick="eliminaDocDas(\'' + d.ordine_id + '\',\'' + esc(d.percorso_storage) + '\',\'' + tipoOrdine + '\')" class="btn-danger" style="font-size:10px;padding:1px 6px">x</button>';
        html += '</div>';
      });
    }
    html += '</div>';

    // Upload
    html += '<div style="display:flex;gap:6px;align-items:center">';
    html += '<input type="file" id="' + inputId + '" accept="image/*,.pdf" style="display:none" onchange="uploadDasOrdine(\'' + o.id + '\',\'' + inputId + '\',\'' + tipoOrdine + '\')" />';
    html += '<button class="btn-primary" style="font-size:12px;padding:7px 14px;white-space:nowrap" onclick="document.getElementById(\'' + inputId + '\').click()">' + (hasDas ? '📎 Aggiungi altro' : '📷 Allega DAS') + '</button>';
    html += '</div>';

    html += '</div>';
  });

  container.innerHTML = html;
}

// Wrapper per Stazione
function caricaDasOrdiniStazione() {
  _caricaDasOrdini('stazione_servizio', 'das-ordini-stazione-lista', 'das-ric-filtro-stato');
}

// Wrapper per Deposito
function caricaDasOrdiniDeposito() {
  _caricaDasOrdini('entrata_deposito', 'das-ordini-deposito-lista', 'das-dep-filtro-stato');
}

// ── UPLOAD DAS A ORDINE ─────────────────────────────────────────
// Usa la stessa tabella documenti_ordine + bucket Das (compatibile con admin)
async function uploadDasOrdine(ordineId, inputId, tipoOrdine) {
  var fileInput = document.getElementById(inputId);
  if (!fileInput || !fileInput.files.length) { toast('Seleziona un file'); return; }
  var file = fileInput.files[0];
  if (file.size > 15 * 1024 * 1024) { toast('File troppo grande (max 15MB)'); return; }

  var nomeFile = file.name;
  var safeName = nomeFile.replace(/[^a-zA-Z0-9._-]/g, '_');
  var percorso = ordineId + '/' + Date.now() + '_' + safeName;

  toast('Caricamento DAS...');

  var { error: errUp } = await sb.storage.from('Das').upload(percorso, file, { contentType: file.type });
  if (errUp) { toast('Errore upload: ' + errUp.message); return; }

  var { error: errDb } = await sb.from('documenti_ordine').insert([{
    ordine_id: ordineId,
    nome_file: nomeFile,
    tipo: 'das',
    percorso_storage: percorso
  }]);
  if (errDb) { toast('Errore salvataggio: ' + errDb.message); return; }

  _auditLog('upload_das_fornitore', 'documenti_ordine', 'DAS allegato a ordine ' + ordineId + ' — ' + nomeFile);
  // NOTA: questo è il DAS del FORNITORE (documento di accompagnamento in entrata/stazione),
  // non il DAS firmato dal cliente. Per il flusso "DAS firmato → ordine consegnato",
  // vedi _uploadDocConsegna in pf-anagrafica.js sezione Consegne.
  toast('DAS allegato all\'ordine!');
  fileInput.value = '';

  // Ricarica la lista corretta
  if (tipoOrdine === 'stazione_servizio') caricaDasOrdiniStazione();
  else caricaDasOrdiniDeposito();
}

// ── ELIMINA DAS DA ORDINE ───────────────────────────────────────
async function eliminaDocDas(ordineId, percorso, tipoOrdine) {
  if (!confirm('Eliminare questo DAS allegato?')) return;
  await sb.storage.from('Das').remove([percorso]);
  await sb.from('documenti_ordine').delete().eq('ordine_id', ordineId).eq('percorso_storage', percorso);
  toast('DAS eliminato');
  if (tipoOrdine === 'stazione_servizio') caricaDasOrdiniStazione();
  else caricaDasOrdiniDeposito();
}

// ── STORICO DAS STAZIONE ────────────────────────────────────────
async function caricaStoricoDasStazione() {
  var anno = (document.getElementById('das-ric-filtro-anno') || {}).value || new Date().getFullYear();
  var mese = (document.getElementById('das-ric-filtro-mese') || {}).value || '';
  var daISO, aISO;
  if (mese) {
    daISO = anno + '-' + mese + '-01';
    var ultimoGg = new Date(anno, parseInt(mese), 0).getDate();
    aISO = anno + '-' + mese + '-' + String(ultimoGg).padStart(2, '0');
  } else {
    daISO = anno + '-01-01';
    aISO = anno + '-12-31';
  }

  var { data: ordini } = await sb.from('ordini').select('id,data,fornitore,prodotto,litri')
    .eq('tipo_ordine', 'stazione_servizio').neq('stato', 'annullato')
    .gte('data', daISO).lte('data', aISO).order('data', { ascending: false });

  if (!ordini || !ordini.length) {
    document.getElementById('das-storico-stazione-tabella').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-hint);padding:20px">Nessun ordine per il periodo</td></tr>';
    return;
  }

  var ids = ordini.map(function(o) { return o.id; });
  var { data: docs } = await sb.from('documenti_ordine').select('*').eq('tipo', 'das').in('ordine_id', ids);
  var docMap = {};
  (docs || []).forEach(function(d) {
    if (!docMap[d.ordine_id]) docMap[d.ordine_id] = [];
    docMap[d.ordine_id].push(d);
  });

  var html = '';
  ordini.forEach(function(o) {
    var dasLista = docMap[o.id] || [];
    if (!dasLista.length) {
      html += '<tr><td>' + fmtD(o.data) + '</td><td>' + esc(o.fornitore) + '</td><td>' + esc(o.prodotto) + '</td>';
      html += '<td style="font-family:var(--font-mono)">' + fmtL(o.litri) + '</td>';
      html += '<td style="color:var(--text-hint);font-size:11px">—</td><td></td></tr>';
    } else {
      dasLista.forEach(function(d) {
        var url = SUPABASE_URL + '/storage/v1/object/public/Das/' + d.percorso_storage;
        var isImg = _isImmagine(_getMimeFromName(d.nome_file));
        html += '<tr><td>' + fmtD(o.data) + '</td><td style="font-weight:600">' + esc(o.fornitore) + '</td><td>' + esc(o.prodotto) + '</td>';
        html += '<td style="font-family:var(--font-mono)">' + fmtL(o.litri) + '</td>';
        html += '<td>';
        if (isImg) {
          html += '<img src="' + url + '" onclick="apriLightbox(\'' + url + '\')" style="width:36px;height:36px;object-fit:cover;border-radius:4px;cursor:zoom-in;border:0.5px solid var(--border);vertical-align:middle;margin-right:6px" />';
        }
        html += '<a href="' + url + '" target="_blank" style="color:var(--accent);text-decoration:none;font-size:12px">' + esc(d.nome_file) + '</a></td>';
        html += '<td style="font-size:10px;color:var(--text-hint)">' + new Date(d.created_at).toLocaleDateString('it-IT') + '</td></tr>';
      });
    }
  });
  document.getElementById('das-storico-stazione-tabella').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY COMUNI ALLEGATI
// ═══════════════════════════════════════════════════════════════════

async function _uploadAllegato(file, tipo, data, rifId, rifTabella, extra) {
  if (file.size > 15 * 1024 * 1024) { toast('File troppo grande: ' + file.name + ' (max 15MB)'); return null; }

  var mm = String(new Date(data).getMonth() + 1).padStart(2, '0');
  var yyyy = data.substring(0, 4);
  var cartella = tipo === 'scontrino' ? 'scontrini' : 'altri';
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
  if (pathStorage) {
    await sb.storage.from(BUCKET_ALLEGATI).remove([pathStorage]);
  }
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

function _getMimeFromName(nome) {
  if (!nome) return '';
  var ext = nome.split('.').pop().toLowerCase();
  var map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
  return map[ext] || '';
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

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('lightbox-overlay').style.display === 'flex') {
    chiudiLightbox();
  }
});

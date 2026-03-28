// PhoenixFuel — Postazione, Bacheca, Offline, Audit, Avvio
// ── POSTAZIONE — SWITCH RAPIDO ──────────────────────────────────
function togglePostazione() {
  var dd = document.getElementById('postazione-dropdown');
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

async function switchPostazione(nuova) {
  document.getElementById('postazione-dropdown').style.display = 'none';
  if (!utenteCorrente) return;
  if (utenteCorrente.postazione === nuova) return;

  // Aggiorna in DB
  await sb.from('utenti').update({ postazione: nuova }).eq('id', utenteCorrente.id);
  utenteCorrente.postazione = nuova;

  // Aggiorna label
  var postLabels = { 'ufficio':'🏢 Ufficio', 'stazione_oppido':'⛽ Stazione Oppido', 'deposito_vibo':'🏭 Deposito Vibo', 'logistica':'🚛 Logistica' };
  document.getElementById('utente-postazione').textContent = postLabels[nuova] || '';

  // Naviga alla sezione relativa
  var sezionePost = { 'stazione_oppido':'stazione', 'deposito_vibo':'deposito', 'logistica':'logistica' };
  var sez = sezionePost[nuova] || 'dashboard';
  var navItem = document.querySelector('.nav-item[onclick*="' + sez + '"]') || document.querySelector('.nav-item');
  setSection(sez, navItem);
  toast('Postazione: ' + (postLabels[nuova] || nuova));
}

// Chiudi dropdown cliccando fuori
document.addEventListener('click', function(e) {
  var dd = document.getElementById('postazione-dropdown');
  var post = document.getElementById('utente-postazione');
  if (dd && dd.style.display !== 'none' && !dd.contains(e.target) && e.target !== post && !post.contains(e.target)) {
    dd.style.display = 'none';
  }
});

// ── BACHECA AVVISI ──────────────────────────────────────────────
async function caricaBacheca() {
  var filtro = document.getElementById('bac-filtro')?.value || '';
  var q = sb.from('bacheca_avvisi').select('*').order('created_at', { ascending: false }).limit(50);
  if (filtro === 'non_letto') q = q.eq('letto', false);
  else if (filtro) q = q.eq('tipo', filtro);
  var { data: avvisi } = await q;
  var lista = document.getElementById('bacheca-lista');
  if (!lista) return;

  if (!avvisi || !avvisi.length) {
    lista.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Nessun avviso</div>';
    return;
  }

  var tipoBadge = {
    comunicazione: '<span class="badge blue">comunicazione</span>',
    anomalia: '<span class="badge amber">anomalia</span>',
    criticita: '<span class="badge red">criticità</span>',
    richiesta: '<span class="badge teal">richiesta</span>',
    sistema: '<span class="badge purple">sistema</span>'
  };

  lista.innerHTML = avvisi.map(function(a) {
    var cls = 'bacheca-item';
    if (!a.letto) cls += ' non-letto';
    if (a.priorita === 'urgente') cls += ' urgente';
    if (a.tipo === 'sistema') cls += ' sistema';
    var dataFmt = new Date(a.created_at).toLocaleString('it-IT', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    var postLabel = { 'ufficio':'Ufficio', 'stazione_oppido':'Stazione', 'deposito_vibo':'Deposito', 'logistica':'Logistica' };

    return '<div class="' + cls + '" onclick="segnaLettoAvviso(\'' + a.id + '\',this)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          (tipoBadge[a.tipo] || '') +
          (a.priorita === 'urgente' ? '<span class="badge red" style="font-size:9px">URGENTE</span>' : '') +
          (!a.letto ? '<span style="width:8px;height:8px;border-radius:50%;background:#E24B4A;display:inline-block"></span>' : '') +
        '</div>' +
        '<span style="font-size:10px;color:var(--text-muted)">' + dataFmt + '</span>' +
      '</div>' +
      '<div style="font-size:13px;line-height:1.5;margin-bottom:6px">' + esc(a.messaggio) + '</div>' +
      '<div style="font-size:10px;color:var(--text-muted)">Da: <strong>' + esc(a.mittente_nome || 'Sistema') + '</strong>' +
        (a.postazione ? ' · ' + (postLabel[a.postazione] || a.postazione) : '') +
      '</div>' +
    '</div>';
  }).join('');
}

async function inviaAvviso() {
  var tipo = document.getElementById('bac-tipo').value;
  var priorita = document.getElementById('bac-priorita').value;
  var messaggio = document.getElementById('bac-messaggio').value.trim();
  if (!messaggio) { toast('Scrivi un messaggio'); return; }

  var record = {
    tipo: tipo,
    priorita: priorita,
    messaggio: messaggio,
    mittente_id: utenteCorrente ? utenteCorrente.id : null,
    mittente_nome: utenteCorrente ? utenteCorrente.nome : 'Sconosciuto',
    postazione: utenteCorrente ? utenteCorrente.postazione : null,
    letto: false
  };

  var r = await _sbWrite('bacheca_avvisi', 'insert', [record]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  toast(r._offline ? '⚡ Avviso salvato offline' : 'Avviso inviato!');
  document.getElementById('bac-messaggio').value = '';
  document.getElementById('bac-priorita').value = 'normale';
  caricaBacheca();
}

async function segnaLettoAvviso(id, el) {
  if (!utenteCorrente || utenteCorrente.ruolo !== 'admin') return;
  await sb.from('bacheca_avvisi').update({ letto: true, data_lettura: new Date().toISOString() }).eq('id', id);
  if (el) { el.classList.remove('non-letto'); }
  aggiornaBadgeBacheca();
}

async function segnaLettiBacheca() {
  if (!utenteCorrente || utenteCorrente.ruolo !== 'admin') { toast('Solo l\'admin può segnare come letti'); return; }
  if (!confirm('Segnare tutti gli avvisi come letti?')) return;
  await sb.from('bacheca_avvisi').update({ letto: true, data_lettura: new Date().toISOString() }).eq('letto', false);
  toast('Tutti gli avvisi segnati come letti');
  caricaBacheca();
  aggiornaBadgeBacheca();
}

async function aggiornaBadgeBacheca() {
  var badge = document.getElementById('bacheca-badge');
  if (!badge) return;
  try {
    var { count } = await sb.from('bacheca_avvisi').select('*', { count: 'exact', head: true }).eq('letto', false);
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch(e) { badge.style.display = 'none'; }
}

// Avviso di sistema (chiamabile da qualsiasi funzione)
async function inviaAvvisoSistema(messaggio, tipo) {
  await _sbWrite('bacheca_avvisi', 'insert', [{
    tipo: tipo || 'sistema',
    priorita: 'urgente',
    messaggio: messaggio,
    mittente_nome: 'Sistema PhoenixFuel',
    postazione: null,
    letto: false
  }]);
}

// ── PWA OFFLINE ─────────────────────────────────────────────────
var _isOnline = navigator.onLine;
var _offlineQueue = [];
var _DB_NAME = 'PhoenixFuelOffline';
var _DB_VERSION = 3;

function _openOfflineDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(_DB_NAME, _DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('dataCache')) {
        db.createObjectStore('dataCache', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('ordini_backlog')) {
        db.createObjectStore('ordini_backlog', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function() { reject(req.error); };
  });
}

// ── Cache dati per consultazione offline ──
async function _salvaCacheOffline(key, data) {
  try {
    var db = await _openOfflineDB();
    var tx = db.transaction('dataCache', 'readwrite');
    tx.objectStore('dataCache').put({ key: key, data: data, timestamp: Date.now() });
  } catch(e) { console.warn('Cache save error:', e); }
}

async function _leggiCacheOffline(key) {
  try {
    var db = await _openOfflineDB();
    var tx = db.transaction('dataCache', 'readonly');
    return new Promise(function(resolve) {
      var req = tx.objectStore('dataCache').get(key);
      req.onsuccess = function() { resolve(req.result ? req.result.data : null); };
      req.onerror = function() { resolve(null); };
    });
  } catch(e) { return null; }
}

// Scarica dati essenziali in cache all'avvio (se online)
async function _aggiornaDataCacheOffline() {
  if (!navigator.onLine) return;
  try {
    var [clientiR, fornitoriR, prodottiR, cisR, prezziR] = await Promise.all([
      sb.from('clienti').select('id,nome,tipo,cliente_rete,fido_massimo,giorni_pagamento,citta,attivo').order('nome'),
      sb.from('fornitori').select('id,nome,fido_massimo,giorni_pagamento').eq('attivo',true).order('nome'),
      sb.from('prodotti').select('*').order('ordine_visualizzazione'),
      sb.from('cisterne').select('*').eq('sede','deposito_vibo'),
      sb.from('prezzi').select('*, basi_carico(id,nome)').eq('data', oggiISO)
    ]);
    await Promise.all([
      _salvaCacheOffline('clienti', clientiR.data || []),
      _salvaCacheOffline('fornitori', fornitoriR.data || []),
      _salvaCacheOffline('prodotti', prodottiR.data || []),
      _salvaCacheOffline('cisterne_deposito', cisR.data || []),
      _salvaCacheOffline('prezzi_oggi', prezziR.data || [])
    ]);
  } catch(e) { console.warn('Cache data refresh error:', e); }
}

// ── AUDIT LOG ────────────────────────────────────────────────────
async function _auditLog(azione, tabella, dettaglio) {
  try {
    await sb.from('audit_log').insert([{
      utente_id: utenteCorrente ? utenteCorrente.id : null,
      utente_nome: utenteCorrente ? utenteCorrente.nome : 'Sistema',
      postazione: utenteCorrente ? utenteCorrente.postazione : null,
      azione: azione,
      tabella: tabella,
      dettaglio: typeof dettaglio === 'string' ? dettaglio : JSON.stringify(dettaglio).substring(0, 500)
    }]);
  } catch(e) {} // Non bloccare mai per errore log
}

async function caricaAuditLog() {
  var { data: logs } = await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(50);
  var tbody = document.getElementById('audit-log-tabella');
  if (!tbody) return;
  if (!logs || !logs.length) { tbody.innerHTML = '<tr><td colspan="5" class="loading">Nessuna attività registrata</td></tr>'; return; }
  tbody.innerHTML = logs.map(function(r) {
    var dt = new Date(r.created_at).toLocaleString('it-IT', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return '<tr><td style="font-size:10px;white-space:nowrap">' + dt + '</td><td style="font-size:11px;font-weight:500">' + esc(r.utente_nome||'—') + '</td><td><span class="badge gray" style="font-size:9px">' + esc(r.azione) + '</span></td><td style="font-size:10px">' + esc(r.tabella) + '</td><td style="font-size:10px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.dettaglio||'') + '</td></tr>';
  }).join('');
}

async function esportaBackup() {
  toast('Generazione backup...');
  if (typeof XLSX === 'undefined') { toast('Libreria Excel non caricata'); return; }
  try {
    var [ordR, cliR, forR, cisR, cassR, letR, preR, cosR, prelR, versR, credR] = await Promise.all([
      sb.from('ordini').select('*').order('data',{ascending:false}).limit(5000),
      sb.from('clienti').select('*').order('nome'),
      sb.from('fornitori').select('*').order('nome'),
      sb.from('cisterne').select('*').order('sede').order('nome'),
      sb.from('stazione_cassa').select('*').order('data',{ascending:false}).limit(365),
      sb.from('stazione_letture').select('*').order('data',{ascending:false}).limit(3000),
      sb.from('stazione_prezzi').select('*').order('data',{ascending:false}).limit(1000),
      sb.from('stazione_costi').select('*').order('data',{ascending:false}).limit(1000),
      sb.from('prelievi_autoconsumo').select('*').order('data',{ascending:false}).limit(2000),
      sb.from('stazione_versamenti').select('*').order('data',{ascending:false}).limit(1000),
      sb.from('stazione_crediti').select('*').order('data_emissione',{ascending:false}).limit(500)
    ]);
    var wb = XLSX.utils.book_new();
    var tables = [
      ['Ordini', ordR.data], ['Clienti', cliR.data], ['Fornitori', forR.data],
      ['Cisterne', cisR.data], ['Cassa', cassR.data], ['Letture', letR.data],
      ['PrezziPompa', preR.data], ['Costi', cosR.data], ['Prelievi', prelR.data],
      ['Versamenti', versR.data], ['Crediti', credR.data]
    ];
    tables.forEach(function(t) {
      if (t[1] && t[1].length) {
        var ws = XLSX.utils.json_to_sheet(t[1]);
        XLSX.utils.book_append_sheet(wb, ws, t[0]);
      }
    });
    var dataStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, 'Backup_PhoenixFuel_' + dataStr + '.xlsx');
    _auditLog('backup_export', 'sistema', tables.length + ' tabelle esportate');
    toast('Backup esportato con successo!');
  } catch(e) { toast('Errore backup: ' + e.message); }
}

// Wrapper Supabase write: se offline accoda, se online esegue normalmente
// Se online ma fallisce per rete → accoda
async function _sbWrite(table, action, data, conflictOrMatch) {
  if (!navigator.onLine) {
    await _addToOfflineQueue({ table: table, action: action, data: data, match: conflictOrMatch || null });
    return { data: null, error: null, _offline: true };
  }
  try {
    var q = sb.from(table);
    if (action === 'insert') return await q.insert(Array.isArray(data) ? data : [data]);
    if (action === 'upsert') return await q.upsert(data, { onConflict: conflictOrMatch || '' });
    if (action === 'update' && conflictOrMatch) {
      q = q.update(data);
      Object.entries(conflictOrMatch).forEach(function(e) { q = q.eq(e[0], e[1]); });
      return await q;
    }
    if (action === 'delete' && conflictOrMatch) {
      q = q.delete();
      Object.entries(conflictOrMatch).forEach(function(e) { q = q.eq(e[0], e[1]); });
      return await q;
    }
    return { data: null, error: { message: 'Azione non riconosciuta' } };
  } catch(err) {
    // Errore rete → accoda
    var isNetErr = !navigator.onLine || (err instanceof TypeError) || (err.message && (err.message.indexOf('fetch') >= 0 || err.message.indexOf('network') >= 0 || err.message.indexOf('Failed') >= 0 || err.message.indexOf('NetworkError') >= 0 || err.message.indexOf('Load failed') >= 0));
    if (isNetErr) {
      _isOnline = false;
      _updateOnlineStatus();
      await _addToOfflineQueue({ table: table, action: action, data: data, match: conflictOrMatch || null });
      return { data: null, error: null, _offline: true };
    }
    return { data: null, error: err };
  }
}

// Contatore operazioni offline per toast unico
var _offlineOpsCount = 0;

async function _addToOfflineQueue(operation) {
  try {
    var db = await _openOfflineDB();
    var tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').add({
      timestamp: Date.now(),
      table: operation.table,
      action: operation.action, // 'insert','update','upsert','delete'
      data: operation.data,
      match: operation.match || null
    });
    return new Promise(function(resolve) { tx.oncomplete = resolve; });
  } catch(e) { console.warn('Offline queue error:', e); }
}

async function _syncOfflineQueue() {
  try {
    var db = await _openOfflineDB();
    var tx = db.transaction('queue', 'readonly');
    var store = tx.objectStore('queue');
    var all = await new Promise(function(resolve) {
      var req = store.getAll();
      req.onsuccess = function() { resolve(req.result); };
    });

    if (!all || !all.length) return;
    toast('Sincronizzazione ' + all.length + ' operazioni offline...');

    var synced = 0;
    for (var i = 0; i < all.length; i++) {
      var op = all[i];
      try {
        if (op.action === 'insert') {
          await sb.from(op.table).insert(op.data);
        } else if (op.action === 'update' && op.match) {
          var q = sb.from(op.table).update(op.data);
          Object.entries(op.match).forEach(function(entry) { q = q.eq(entry[0], entry[1]); });
          await q;
        } else if (op.action === 'upsert') {
          await sb.from(op.table).upsert(op.data, { onConflict: op.match || '' });
        } else if (op.action === 'delete' && op.match) {
          var dq = sb.from(op.table).delete();
          Object.entries(op.match).forEach(function(entry) { dq = dq.eq(entry[0], entry[1]); });
          await dq;
        }
        synced++;
        // Rimuovi dalla coda
        var delTx = db.transaction('queue', 'readwrite');
        delTx.objectStore('queue').delete(op.id);
      } catch(e) { console.warn('Sync failed for op', op.id, e); }
    }

    if (synced > 0) {
      toast('✅ ' + synced + ' operazioni sincronizzate!');
      // Notifica in bacheca (diretto, no _sbWrite per evitare ricorsione)
      try {
        await sb.from('bacheca_avvisi').insert([{
          tipo: 'sistema', priorita: 'normale',
          messaggio: synced + ' operazioni offline sincronizzate con successo.',
          mittente_nome: 'Sistema PhoenixFuel', letto: false
        }]);
      } catch(e) {}
      aggiornaBadgeBacheca();
    }
  } catch(e) { console.warn('Sync error:', e); }
}

// Online/Offline detection
function _updateOnlineStatus() {
  var wasOffline = !_isOnline;
  _isOnline = navigator.onLine;
  var banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = _isOnline ? 'none' : 'block';

  // Torna online: sincronizza coda + aggiorna cache
  if (_isOnline && wasOffline) {
    _syncOfflineQueue();
    syncOrdiniBacklog();
    _aggiornaDataCacheOffline();
    aggiornaBadgeBacheca();
  }
}

window.addEventListener('online', _updateOnlineStatus);
window.addEventListener('offline', _updateOnlineStatus);
setTimeout(_updateOnlineStatus, 1000);

// ── BACKLOG ORDINI OFFLINE ──────────────────────────────────────
async function _salvaOrdineBacklog(record) {
  try {
    var db = await _openOfflineDB();
    var tx = db.transaction('ordini_backlog', 'readwrite');
    tx.objectStore('ordini_backlog').add({
      record: record,
      timestamp: Date.now(),
      synced: false
    });
    return new Promise(function(resolve) { tx.oncomplete = resolve; });
  } catch(e) { console.warn('Backlog save error:', e); }
}

async function _leggiOrdiniBacklog() {
  try {
    var db = await _openOfflineDB();
    var tx = db.transaction('ordini_backlog', 'readonly');
    return new Promise(function(resolve) {
      var req = tx.objectStore('ordini_backlog').getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { resolve([]); };
    });
  } catch(e) { return []; }
}

async function _eliminaOrdineBacklog(id) {
  try {
    var db = await _openOfflineDB();
    var tx = db.transaction('ordini_backlog', 'readwrite');
    tx.objectStore('ordini_backlog').delete(id);
  } catch(e) {}
}

async function mostraBacklogOrdini() {
  var backlog = await _leggiOrdiniBacklog();
  var wrap = document.getElementById('ordini-backlog');
  var tbody = document.getElementById('backlog-ordini-tbody');
  if (!wrap || !tbody) return;

  if (!backlog.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  var tipoLabels = { 'cliente':'cliente', 'entrata_deposito':'deposito', 'stazione_servizio':'stazione', 'autoconsumo':'autoconsumo' };

  tbody.innerHTML = backlog.map(function(b) {
    var r = b.record;
    var dt = new Date(b.timestamp).toLocaleString('it-IT', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return '<tr style="background:#FDF3D0">' +
      '<td>' + r.data + '</td>' +
      '<td>' + badgeStato(r.tipo_ordine || 'cliente') + '</td>' +
      '<td>' + esc(r.cliente || '—') + '</td>' +
      '<td>' + esc(r.prodotto || '—') + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td>' +
      '<td>' + esc(r.fornitore || '—') + '</td>' +
      '<td><span class="badge amber">⚡ offline</span><br><span style="font-size:9px;color:var(--text-muted)">' + dt + '</span></td>' +
      '<td><button class="btn-danger" style="font-size:10px;padding:3px 8px" onclick="eliminaOrdineBacklog(' + b.id + ')">Annulla</button></td>' +
      '</tr>';
  }).join('');
}

async function eliminaOrdineBacklog(id) {
  if (!confirm('Eliminare questo ordine in attesa?')) return;
  await _eliminaOrdineBacklog(id);
  toast('Ordine rimosso dal backlog');
  mostraBacklogOrdini();
}

async function syncOrdiniBacklog() {
  if (!navigator.onLine) { toast('Sei offline, impossibile sincronizzare'); return; }
  var backlog = await _leggiOrdiniBacklog();
  if (!backlog.length) { toast('Nessun ordine da sincronizzare'); return; }

  toast('Sincronizzazione ' + backlog.length + ' ordini...');
  var synced = 0, fidoAlerts = [];

  for (var i = 0; i < backlog.length; i++) {
    var b = backlog[i];
    var record = b.record;
    try {
      // Inserisci ordine nel DB
      var { data: nuovoOrdine, error } = await sb.from('ordini').insert([record]).select().single();
      if (error) {
        console.warn('Sync ordine fallito:', error.message);
        continue;
      }
      synced++;
      _auditLog('sync_ordine_offline', 'ordini', record.tipo_ordine + ' ' + record.cliente + ' ' + record.prodotto + ' ' + fmtL(record.litri));

      // Uscita deposito automatica se PhoenixFuel
      if (record.fornitore && record.fornitore.toLowerCase().indexOf('phoenix') >= 0 && (record.tipo_ordine === 'cliente' || record.tipo_ordine === 'stazione_servizio')) {
        try { await confermaUscitaDeposito(nuovoOrdine.id, true); } catch(e) {}
      }

      // Check fido post-sync
      if (record.tipo_ordine === 'cliente' && record.cliente_id) {
        try {
          var { data: cl } = await sb.from('clienti').select('fido_massimo,giorni_pagamento,nome').eq('id', record.cliente_id).single();
          if (cl && Number(cl.fido_massimo) > 0) {
            var { data: ordNP } = await sb.from('ordini').select('data,costo_litro,trasporto_litro,margine,iva,litri,giorni_pagamento').or('cliente_id.eq.' + record.cliente_id + ',cliente.eq.' + cl.nome).neq('stato','annullato').eq('pagato',false);
            var usato = 0;
            (ordNP||[]).forEach(function(o) {
              var scad = new Date(o.data); scad.setDate(scad.getDate() + (o.giorni_pagamento || cl.giorni_pagamento || 30));
              if (scad > oggi) usato += prezzoConIva(o) * Number(o.litri);
            });
            var pctFido = Math.round((usato / Number(cl.fido_massimo)) * 100);
            if (pctFido >= 100) {
              fidoAlerts.push(cl.nome + ' — fido SUPERATO al ' + pctFido + '% (' + fmtE(usato) + '/' + fmtE(cl.fido_massimo) + ') — Ordine ' + record.prodotto + ' ' + fmtL(record.litri));
            } else if (pctFido >= 80) {
              fidoAlerts.push(cl.nome + ' — fido al ' + pctFido + '% (' + fmtE(usato) + '/' + fmtE(cl.fido_massimo) + ')');
            }
          }
        } catch(e) {}
      }

      // Rimuovi dal backlog
      await _eliminaOrdineBacklog(b.id);
    } catch(e) { console.warn('Sync ordine err:', e); }
  }

  if (synced > 0) toast('✅ ' + synced + ' ordini sincronizzati!');

  // Invia alert fido in bacheca
  if (fidoAlerts.length) {
    var msg = '⚠ ALERT FIDO dopo sync ordini offline:\n' + fidoAlerts.join('\n');
    inviaAvvisoSistema(msg, 'sistema');
    aggiornaBadgeBacheca();
  }

  mostraBacklogOrdini();
  // Ricarica ordini se siamo nella sezione
  if (document.getElementById('s-ordini').classList.contains('active')) caricaOrdini();
}

// ── AVVIO ─────────────────────────────────────────────────────────
inizializza();

// ── PWA SERVICE WORKER ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

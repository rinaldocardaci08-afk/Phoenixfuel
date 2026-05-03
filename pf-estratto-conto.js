// ═══════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Estratto Conto Clienti (Patch v20260503k)
// ═══════════════════════════════════════════════════════════════════════════
// Tab "📋 Estratto Conto" dentro sezione Clienti.
//
// Livelli:
//   1. Dashboard generale: KPI aziendali, aging, distribuzione per banca,
//      tabella clienti per fatturato anno corrente
//   2. Vista cliente singolo: KPI cliente, indice puntualità, fatturato
//      24 mesi (2 anni a confronto), aging fatture aperte, estratto conto
//      tabellare con filtri
//   3. Modale modifica modalità pagamento abituale
// ═══════════════════════════════════════════════════════════════════════════


// Stato globale
var _ecStato = {
  vista: 'dashboard',       // 'dashboard' | 'cliente'
  clienteSelezionato: null, // id cliente
  filtroFatture: 'tutte',   // 'tutte' | 'aperte' | 'scadute'
  // Cache dati
  fatture: [],
  clienti: [],
  banche: [],
  riconciliazioni: []
};


// Helper formattazione (riusiamo standard del progetto)
function _ecFmt(n) { return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function _ecFmtDec(n) { return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _ecFmtImpKb(n) { var v = Number(n || 0); if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + 'k'; return v.toFixed(0); }
function _ecFmtPerc(n) { return (Number(n || 0) * 100).toFixed(1) + '%'; }
function _ecFmtData(iso) {
  if (!iso) return '—';
  var p = String(iso).substring(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}
function _ecEsc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var _EC_MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
var _EC_MESI_FULL = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];


// ────────────────────────────────────────────────────────────────────────
// MAIN: render
// ────────────────────────────────────────────────────────────────────────
async function renderEstrattoConto() {
  var el = document.getElementById('ec-content');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">⏳ Caricamento estratto conto...</div>';

  // Carico tutto in parallelo
  var [resFatt, resCli, resIst, resRic] = await Promise.all([
    sb.from('estratto_conto_cliente').select('*'),
    sb.from('clienti').select('id,nome,ragione_sociale,piva,codice_fiscale,giorni_pagamento,modalita_pagamento,banca_accredito_id,cliente_rete,attivo').eq('attivo', true),
    sb.from('banche_istituti').select('id,nome'),
    sb.from('foglio_giornale_riconciliazioni').select('fattura_emessa_id,importo_imputato,movimento_id')
  ]);

  if (resFatt.error) {
    el.innerHTML = '<div style="padding:20px;color:#A32D2D">Errore: ' + _ecEsc(resFatt.error.message) + '</div>';
    return;
  }

  _ecStato.fatture = resFatt.data || [];
  _ecStato.clienti = resCli.data || [];
  _ecStato.banche = resIst.data || [];
  _ecStato.riconciliazioni = resRic.data || [];

  // Render in base alla vista corrente
  if (_ecStato.vista === 'cliente' && _ecStato.clienteSelezionato) {
    el.innerHTML = _ecRenderCliente();
  } else {
    _ecStato.vista = 'dashboard';
    el.innerHTML = _ecRenderDashboard();
  }
}


// ════════════════════════════════════════════════════════════════════════
// VISTA 1: DASHBOARD GENERALE
// ════════════════════════════════════════════════════════════════════════
function _ecRenderDashboard() {
  var oggi = new Date();
  var oggiIso = oggi.toISOString().split('T')[0];
  var fatture = _ecStato.fatture;

  // Calcoli KPI
  var fattAperte = fatture.filter(function(f) {
    return f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale';
  });
  var creditoTot = fattAperte.reduce(function(s, f) { return s + Number(f.saldo_residuo || 0); }, 0);
  var fattScadute = fattAperte.filter(function(f) { return f.data_scadenza && f.data_scadenza < oggiIso; });
  var creditoScaduto = fattScadute.reduce(function(s, f) { return s + Number(f.saldo_residuo || 0); }, 0);
  var pScaduto = creditoTot > 0 ? creditoScaduto / creditoTot : 0;

  // DSO medio aziendale = (Crediti / Ricavi annui) × 365
  var anno = oggi.getFullYear();
  var inizioAnnoIso = anno + '-01-01';
  var fattAnno = fatture.filter(function(f) { return f.data >= inizioAnnoIso; });
  var ricaviAnno = fattAnno.reduce(function(s, f) { return s + Number(f.importo_totale || 0); }, 0);
  var giorniTrascorsi = Math.ceil((oggi - new Date(inizioAnnoIso)) / 86400000);
  var dsoMedio = ricaviAnno > 0 ? Math.round((creditoTot / ricaviAnno) * giorniTrascorsi) : 0;

  // Clienti con almeno 1 fattura aperta
  var clientiAttiviSet = {};
  fattAperte.forEach(function(f) { if (f.cliente_id) clientiAttiviSet[f.cliente_id] = true; });
  var nClientiAttivi = Object.keys(clientiAttiviSet).length;

  // Aging buckets (giorni di ritardo dalla scadenza)
  var aging = { non_scaduto: 0, b30: 0, b60: 0, b90: 0, oltre: 0 };
  fattAperte.forEach(function(f) {
    var imp = Number(f.saldo_residuo || 0);
    if (!f.data_scadenza) { aging.non_scaduto += imp; return; }
    if (f.data_scadenza >= oggiIso) { aging.non_scaduto += imp; return; }
    var ggRitardo = Math.floor((oggi - new Date(f.data_scadenza + 'T00:00:00')) / 86400000);
    if (ggRitardo <= 30) aging.b30 += imp;
    else if (ggRitardo <= 60) aging.b60 += imp;
    else if (ggRitardo <= 90) aging.b90 += imp;
    else aging.oltre += imp;
  });

  // Distribuzione per banca/modalità
  var perDestinazione = { intesa: 0, mps: 0, bnl: 0, bcc: 0, altre: 0, nondefinita: 0 };
  fattAperte.forEach(function(f) {
    var imp = Number(f.saldo_residuo || 0);
    if (!f.modalita_pagamento || f.modalita_pagamento === 'assegno' || f.modalita_pagamento === 'contanti') {
      perDestinazione.nondefinita += imp;
    } else if (f.banca_accredito_id) {
      // Trovo la banca
      var b = _ecStato.banche.find(function(x) { return x.id === f.banca_accredito_id; });
      if (b) {
        var nm = (b.nome || '').toLowerCase();
        if (nm.indexOf('intesa') >= 0) perDestinazione.intesa += imp;
        else if (nm.indexOf('mps') >= 0 || nm.indexOf('monte') >= 0) perDestinazione.mps += imp;
        else if (nm.indexOf('bnl') >= 0) perDestinazione.bnl += imp;
        else if (nm.indexOf('bcc') >= 0 || nm.indexOf('cooperativo') >= 0) perDestinazione.bcc += imp;
        else perDestinazione.altre += imp;
      } else perDestinazione.altre += imp;
    } else {
      perDestinazione.nondefinita += imp;
    }
  });

  // Top clienti per fatturato anno corrente
  var perCliente = {};
  fattAnno.forEach(function(f) {
    var k = f.cliente_id || ('orf_' + (f.cessionario_denominazione || ''));
    if (!perCliente[k]) {
      perCliente[k] = {
        cliente_id: f.cliente_id,
        nome: f.cessionario_denominazione || '—',
        fatturato: 0,
        aperto: 0,
        scaduto: 0
      };
    }
    perCliente[k].fatturato += Number(f.importo_totale || 0);
    if (f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale') {
      perCliente[k].aperto += Number(f.saldo_residuo || 0);
      if (f.data_scadenza && f.data_scadenza < oggiIso) {
        perCliente[k].scaduto += Number(f.saldo_residuo || 0);
      }
    }
  });

  // Arricchisco con dati clienti (modalità pagamento)
  Object.keys(perCliente).forEach(function(k) {
    var pc = perCliente[k];
    var cli = _ecStato.clienti.find(function(c) { return c.id === pc.cliente_id; });
    if (cli) {
      pc.modalita = cli.modalita_pagamento;
      pc.banca_id = cli.banca_accredito_id;
    }
  });

  var elencoClienti = Object.values(perCliente).sort(function(a, b) { return b.fatturato - a.fatturato; });

  // Costruzione HTML
  var html = '';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">';
  html += '<div>';
  html += '<div style="font-size:15px;font-weight:500;color:var(--text)">📋 Estratto Conto Clienti</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Crediti aperti, scaduti, comportamenti pagamento · ' + anno + '</div>';
  html += '</div>';
  html += '<input type="text" oninput="_ecFiltraTabella(this.value)" placeholder="🔍 Cerca cliente..." style="font-size:12px;padding:6px 12px;border:0.5px solid var(--border);border-radius:4px;width:240px"/>';
  html += '</div>';

  // KPI 4 cards
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:14px">';
  html += _ecKpiCard('Credito totale aperto', '€ ' + _ecFmt(creditoTot), '#412402', '#FAEEDA', '#BA7517', 'su ' + fattAperte.length + ' fatture');
  html += _ecKpiCard('Di cui scaduto', '€ ' + _ecFmt(creditoScaduto), '#791F1F', '#FCEBEB', '#A32D2D', _ecFmtPerc(pScaduto) + ' del credito · ' + fattScadute.length + ' fatture');
  html += _ecKpiCard('DSO medio aziendale', dsoMedio + ' gg', '#0C447C', '#E6F1FB', '#185FA5', 'Days Sales Outstanding');
  html += _ecKpiCard('Clienti attivi', String(nClientiAttivi), '#173404', '#EAF3DE', '#639922', 'con almeno 1 fattura aperta');
  html += '</div>';

  // Aging + distribuzione banca
  html += '<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-bottom:14px">';

  // Aging buckets
  html += '<div style="background:#FAF8F2;padding:14px 16px;border-radius:6px;border:0.5px solid #e5e0d2">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600;margin-bottom:10px">📊 Aging crediti scaduti (per fascia di ritardo)</div>';
  var totAging = aging.b30 + aging.b60 + aging.b90 + aging.oltre;
  if (totAging > 0) {
    html += '<div style="display:flex;height:36px;border-radius:6px;overflow:hidden;border:0.5px solid #ddd">';
    [
      { val: aging.b30, bg: '#FAEEDA', col: '#412402', lab: '0-30 gg' },
      { val: aging.b60, bg: '#F4D7B0', col: '#412402', lab: '31-60 gg' },
      { val: aging.b90, bg: '#E89A8E', col: '#501313', lab: '61-90 gg' },
      { val: aging.oltre, bg: '#A32D2D', col: 'white', lab: 'oltre 90' }
    ].forEach(function(x) {
      var w = (x.val / totAging) * 100;
      if (w < 1) return;
      html += '<div title="' + x.lab + ': € ' + _ecFmt(x.val) + '" style="width:' + w.toFixed(1) + '%;background:' + x.bg + ';display:flex;align-items:center;justify-content:center;color:' + x.col + ';font-size:11px;font-weight:600;min-width:0;overflow:hidden">€ ' + _ecFmtImpKb(x.val) + '</div>';
    });
    html += '</div>';
    html += '<div style="display:flex;font-size:9px;color:#666;margin-top:5px;justify-content:space-between">';
    html += '<span>0-30 gg</span><span>31-60 gg</span><span>61-90 gg</span><span>oltre 90 gg ⚠</span>';
    html += '</div>';
  } else {
    html += '<div style="font-size:11px;color:#888;font-style:italic;padding:10px 0">Nessun credito scaduto.</div>';
  }
  // Non scaduto info
  if (aging.non_scaduto > 0) {
    html += '<div style="font-size:10px;color:#27500A;margin-top:8px">✓ Crediti ancora a scadere: <strong>€ ' + _ecFmt(aging.non_scaduto) + '</strong></div>';
  }
  html += '</div>';

  // Distribuzione per banca
  html += '<div style="background:#FAF8F2;padding:14px 16px;border-radius:6px;border:0.5px solid #e5e0d2">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600;margin-bottom:10px">🏦 Crediti per banca destinazione</div>';
  html += '<div style="display:flex;flex-direction:column;gap:6px;font-size:10px">';
  var totalDest = perDestinazione.intesa + perDestinazione.mps + perDestinazione.bnl + perDestinazione.bcc + perDestinazione.altre + perDestinazione.nondefinita;
  function _ecRigaDest(label, imp, color) {
    if (imp <= 0 || totalDest <= 0) return '';
    var pp = ((imp / totalDest) * 100).toFixed(0);
    return '<div style="display:flex;justify-content:space-between"><span><span style="display:inline-block;width:9px;height:9px;background:' + color + ';border-radius:1px;margin-right:4px"></span>' + label + '</span><strong>€ ' + _ecFmtImpKb(imp) + ' (' + pp + '%)</strong></div>';
  }
  html += _ecRigaDest('Intesa Sanpaolo', perDestinazione.intesa, '#185FA5');
  html += _ecRigaDest('MPS', perDestinazione.mps, '#A32D2D');
  html += _ecRigaDest('BNL', perDestinazione.bnl, '#0C447C');
  html += _ecRigaDest('BCC', perDestinazione.bcc, '#639922');
  html += _ecRigaDest('Altre banche', perDestinazione.altre, '#BA7517');
  html += _ecRigaDest('Assegno/contanti/non def.', perDestinazione.nondefinita, '#888');
  html += '</div></div>';

  html += '</div>'; // fine grid

  // Tabella clienti per fatturato
  html += '<div style="background:#FAF8F2;padding:14px 16px;border-radius:6px;border:0.5px solid #e5e0d2">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600">👥 Clienti per fatturato (' + anno + ')</div>';
  html += '<div style="font-size:10px;color:#666">' + elencoClienti.length + ' clienti totali · click su una riga per dettagli</div>';
  html += '</div>';

  if (elencoClienti.length === 0) {
    html += '<div style="text-align:center;padding:30px;color:#888;font-style:italic;font-size:11px">Nessun cliente con fatturato in ' + anno + '.</div>';
  } else {
    html += '<div id="ec-tabella-clienti">';
    html += _ecRenderTabellaClienti(elencoClienti);
    html += '</div>';
  }
  html += '</div>';

  // Cache elenco per filtro live
  window._ecElencoCache = elencoClienti;

  return html;
}


function _ecRenderTabellaClienti(elenco) {
  var html = '<table style="width:100%;border-collapse:collapse;font-size:11px">';
  html += '<thead><tr style="background:white">';
  html += '<th style="padding:7px 9px;text-align:left;border-bottom:0.5px solid var(--border);width:30px">#</th>';
  html += '<th style="padding:7px 9px;text-align:left;border-bottom:0.5px solid var(--border)">Cliente</th>';
  html += '<th style="padding:7px 9px;text-align:right;border-bottom:0.5px solid var(--border)">Fatturato</th>';
  html += '<th style="padding:7px 9px;text-align:right;border-bottom:0.5px solid var(--border)">Aperto</th>';
  html += '<th style="padding:7px 9px;text-align:right;border-bottom:0.5px solid var(--border)">Scaduto</th>';
  html += '<th style="padding:7px 9px;text-align:center;border-bottom:0.5px solid var(--border)">Pagamento</th>';
  html += '<th style="padding:7px 9px;text-align:right;border-bottom:0.5px solid var(--border);width:80px"></th>';
  html += '</tr></thead><tbody>';

  elenco.slice(0, 200).forEach(function(c, i) {
    if (!c.cliente_id) return; // skip orfani senza id
    var rowBg = c.scaduto > 0 ? 'background:#FCEBEB;' : '';
    html += '<tr style="border-bottom:0.5px solid var(--border);' + rowBg + 'cursor:pointer" onclick="_ecApriCliente(\'' + _ecEsc(c.cliente_id) + '\')">';
    html += '<td style="padding:6px 9px;font-family:var(--font-mono);color:#888">' + (i + 1) + '</td>';
    html += '<td style="padding:6px 9px;font-weight:500">' + _ecEsc(c.nome) + '</td>';
    html += '<td style="padding:6px 9px;text-align:right;font-family:var(--font-mono)">' + _ecFmtDec(c.fatturato) + '</td>';
    html += '<td style="padding:6px 9px;text-align:right;font-family:var(--font-mono);color:' + (c.aperto > 0 ? '#412402' : '#888') + '">' + (c.aperto > 0 ? _ecFmtDec(c.aperto) : '—') + '</td>';
    html += '<td style="padding:6px 9px;text-align:right;font-family:var(--font-mono);color:' + (c.scaduto > 0 ? '#A32D2D;font-weight:500' : '#888') + '">' + (c.scaduto > 0 ? _ecFmtDec(c.scaduto) : '—') + '</td>';
    html += '<td style="padding:6px 9px;text-align:center">' + _ecBadgePagamento(c.modalita, c.banca_id) + '</td>';
    html += '<td style="padding:6px 9px;text-align:right"><span style="background:#fff;border:0.5px solid var(--border);font-size:10px;padding:3px 8px;border-radius:3px">📂 Apri</span></td>';
    html += '</tr>';
  });

  if (elenco.length > 200) {
    html += '<tr><td colspan="7" style="padding:8px;text-align:center;color:#888;font-size:10px;font-style:italic">... + altri ' + (elenco.length - 200) + ' clienti (filtra per cercarli)</td></tr>';
  }
  html += '</tbody></table>';
  return html;
}


function _ecBadgePagamento(modalita, bancaId) {
  if (!modalita) return '<span style="color:#888;font-size:10px;font-style:italic">non def.</span>';
  var label = modalita;
  var bg = '#F1EFE8', col = '#666';
  if (modalita === 'bonifico' || modalita === 'riba') {
    var b = _ecStato.banche.find(function(x) { return x.id === bancaId; });
    var nm = b ? b.nome : '?';
    label = (modalita === 'bonifico' ? 'Bonifico' : 'RiBa') + ' ' + (nm || '?');
    var nl = (nm || '').toLowerCase();
    if (nl.indexOf('intesa') >= 0) { bg = '#E6F1FB'; col = '#0C447C'; }
    else if (nl.indexOf('mps') >= 0 || nl.indexOf('monte') >= 0) { bg = '#FCEBEB'; col = '#A32D2D'; }
    else if (nl.indexOf('bnl') >= 0) { bg = '#E6F1FB'; col = '#0C447C'; }
    else if (nl.indexOf('bcc') >= 0 || nl.indexOf('cooperativo') >= 0) { bg = '#EAF3DE'; col = '#27500A'; }
  } else if (modalita === 'assegno') { label = 'Assegno'; bg = '#F1EFE8'; col = '#666'; }
  else if (modalita === 'contanti') { label = 'Contanti'; bg = '#FAEEDA'; col = '#412402'; }
  return '<span style="background:' + bg + ';color:' + col + ';font-size:9px;padding:2px 6px;border-radius:3px;font-weight:600">' + _ecEsc(label) + '</span>';
}


function _ecKpiCard(label, value, vColor, bg, border, sub) {
  var html = '<div style="background:' + bg + ';border-left:3px solid ' + border + ';padding:10px 14px;border-radius:6px">';
  html += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.4px;font-weight:500;color:' + vColor + ';opacity:0.85">' + _ecEsc(label) + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:500;color:' + vColor + ';margin-top:3px">' + value + '</div>';
  if (sub) html += '<div style="font-size:10px;color:' + vColor + ';opacity:0.75;margin-top:3px">' + sub + '</div>';
  html += '</div>';
  return html;
}


// Filtro live
function _ecFiltraTabella(val) {
  var v = (val || '').toLowerCase();
  var elenco = window._ecElencoCache || [];
  var filtrato = elenco;
  if (v) filtrato = elenco.filter(function(c) { return (c.nome || '').toLowerCase().indexOf(v) >= 0; });
  var el = document.getElementById('ec-tabella-clienti');
  if (el) el.innerHTML = _ecRenderTabellaClienti(filtrato);
}


// ════════════════════════════════════════════════════════════════════════
// VISTA 2: CLIENTE SINGOLO
// ════════════════════════════════════════════════════════════════════════
function _ecApriCliente(clienteId) {
  _ecStato.vista = 'cliente';
  _ecStato.clienteSelezionato = clienteId;
  _ecStato.filtroFatture = 'tutte';
  var el = document.getElementById('ec-content');
  if (el) el.innerHTML = _ecRenderCliente();
}


function _ecChiudiCliente() {
  _ecStato.vista = 'dashboard';
  _ecStato.clienteSelezionato = null;
  var el = document.getElementById('ec-content');
  if (el) el.innerHTML = _ecRenderDashboard();
}


function _ecRenderCliente() {
  var clienteId = _ecStato.clienteSelezionato;
  var cliente = _ecStato.clienti.find(function(c) { return c.id === clienteId; });
  if (!cliente) return '<div style="padding:20px">Cliente non trovato. <button onclick="_ecChiudiCliente()">← Torna</button></div>';

  var oggi = new Date();
  var oggiIso = oggi.toISOString().split('T')[0];
  var anno = oggi.getFullYear();
  var inizioAnnoIso = anno + '-01-01';
  var fineAnnoPrecIso = (anno - 1) + '-12-31';
  var inizioAnnoPrecIso = (anno - 1) + '-01-01';

  // Tutte le fatture del cliente
  var fattCli = _ecStato.fatture.filter(function(f) { return f.cliente_id === clienteId; });
  var fattAperte = fattCli.filter(function(f) { return f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale'; });

  // KPI
  var creditoAperto = fattAperte.reduce(function(s, f) { return s + Number(f.saldo_residuo || 0); }, 0);
  var creditoScaduto = fattAperte.filter(function(f) { return f.data_scadenza && f.data_scadenza < oggiIso; }).reduce(function(s, f) { return s + Number(f.saldo_residuo || 0); }, 0);

  var fattAnnoCli = fattCli.filter(function(f) { return f.data >= inizioAnnoIso; });
  var fattAnnoPrecCli = fattCli.filter(function(f) { return f.data >= inizioAnnoPrecIso && f.data <= fineAnnoPrecIso; });
  var fattAnno = fattAnnoCli.reduce(function(s, f) { return s + Number(f.importo_totale || 0); }, 0);
  var fattAnnoPrec = fattAnnoPrecCli.reduce(function(s, f) { return s + Number(f.importo_totale || 0); }, 0);
  var deltaFatt = fattAnnoPrec > 0 ? (fattAnno - fattAnnoPrec) / fattAnnoPrec : null;

  // Ultimo pagamento (dalla riconciliazione più recente)
  var ricCli = _ecStato.riconciliazioni.filter(function(r) {
    return fattCli.some(function(f) { return f.fattura_id === r.fattura_emessa_id; });
  });
  // Per data ultimo pagamento serve incrocio con foglio_giornale_movimenti — fallback approssimativo
  var ultimoImporto = ricCli.length > 0 ? ricCli[ricCli.length - 1].importo_imputato : null;

  // Indice puntualità: media (data_pagamento - data_scadenza) sulle fatture saldate
  // Fallback: uso giorni_pagamento del cliente come riferimento e calcolo basato su scadute aperte
  var ggMedi = _ecCalcolaPuntualita(fattCli);

  // Aging fatture aperte
  var aging = _ecCalcolaAging(fattAperte, oggiIso);

  // Costruzione HTML
  var html = '';

  // Header con bottone torna + badge modalità + bottone modifica
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:0.5px solid var(--border);padding-bottom:12px;margin-bottom:14px;flex-wrap:wrap;gap:10px">';
  html += '<div>';
  html += '<div style="font-size:16px;font-weight:500;color:#26215C">' + _ecEsc(cliente.ragione_sociale || cliente.nome || '—') + '</div>';
  var subHeader = [];
  if (cliente.piva) subHeader.push('P.IVA ' + _ecEsc(cliente.piva));
  else if (cliente.codice_fiscale) subHeader.push('C.F. ' + _ecEsc(cliente.codice_fiscale));
  subHeader.push(fattCli.length + ' fatture totali');
  if (cliente.cliente_rete) subHeader.push('<span style="background:#E6F1FB;color:#0C447C;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:600">RETE</span>');
  html += '<div style="font-size:11px;color:#666;margin-top:3px">' + subHeader.join(' · ') + '</div>';
  // Badge modalità + bottone modifica
  html += '<div style="font-size:11px;margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  html += _ecBadgePagamento(cliente.modalita_pagamento, cliente.banca_accredito_id);
  html += '<button onclick="_ecApriModaleModalita(\'' + _ecEsc(cliente.id) + '\')" style="background:#fff;border:0.5px solid var(--border);font-size:10px;padding:3px 8px;border-radius:3px;cursor:pointer">✏️ Modifica modalità</button>';
  html += '</div>';
  html += '</div>';
  html += '<button onclick="_ecChiudiCliente()" style="background:white;border:0.5px solid var(--border);font-size:11px;padding:6px 12px;border-radius:4px;cursor:pointer">← Torna a elenco</button>';
  html += '</div>';

  // 4 KPI
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:14px">';
  html += _ecKpiCard('Credito aperto', '€ ' + _ecFmt(creditoAperto), '#412402', '#FAEEDA', '#BA7517', fattAperte.length + ' fatture');
  html += _ecKpiCard('Di cui scaduto', '€ ' + _ecFmt(creditoScaduto), '#791F1F', '#FCEBEB', '#A32D2D', creditoAperto > 0 ? _ecFmtPerc(creditoScaduto / creditoAperto) + ' del credito' : '0%');
  var deltaTxt = '';
  if (deltaFatt !== null) {
    var ic = deltaFatt >= 0 ? '↑' : '↓';
    var col = deltaFatt >= 0 ? '#27500A' : '#791F1F';
    deltaTxt = '<span style="color:' + col + ';font-weight:600">' + ic + ' ' + Math.abs(deltaFatt * 100).toFixed(0) + '%</span> vs ' + (anno - 1);
  }
  html += _ecKpiCard('Fatturato ' + anno, '€ ' + _ecFmt(fattAnno), '#173404', '#EAF3DE', '#639922', deltaTxt || (fattAnnoCli.length + ' fatture'));
  if (ultimoImporto !== null) {
    html += _ecKpiCard('Ultimo pagamento', '€ ' + _ecFmtDec(ultimoImporto), '#0C447C', '#E6F1FB', '#185FA5', 'da riconciliazione');
  } else {
    html += _ecKpiCard('Ultimo pagamento', '—', '#0C447C', '#E6F1FB', '#185FA5', 'nessun incasso registrato');
  }
  html += '</div>';

  // Indice di puntualità (barra colorata)
  html += _ecRenderPuntualita(cliente, ggMedi);

  // Grafico fatturato 2 anni + Aging fatture aperte (2 colonne)
  html += '<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:14px;margin-bottom:14px">';
  html += _ecRenderGraficoFatturato(fattAnnoCli, fattAnnoPrecCli, anno);
  html += _ecRenderAging(aging);
  html += '</div>';

  // Estratto conto fatture
  html += _ecRenderEstrattoFatture(fattCli);

  return html;
}


function _ecCalcolaPuntualita(fattCli) {
  // Per ora calcolo basato sui giorni medi di ritardo delle fatture scadute aperte
  // (in futuro, quando avremo data_pagamento riconciliata, cambierò calcolo)
  var oggi = new Date();
  var oggiIso = oggi.toISOString().split('T')[0];
  var fattAperteScad = fattCli.filter(function(f) {
    return (f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale')
        && f.data_scadenza && f.data_scadenza < oggiIso;
  });
  if (fattAperteScad.length === 0) return null;
  var sumGg = 0;
  fattAperteScad.forEach(function(f) {
    sumGg += Math.floor((oggi - new Date(f.data_scadenza + 'T00:00:00')) / 86400000);
  });
  return Math.round(sumGg / fattAperteScad.length);
}


function _ecRenderPuntualita(cliente, ggMedi) {
  var html = '<div style="background:#FAF8F2;padding:14px 16px;border-radius:6px;border:0.5px solid #e5e0d2;margin-bottom:14px">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600;margin-bottom:10px">⚖️ Indice di Puntualità Pagamenti</div>';

  if (ggMedi === null) {
    html += '<div style="font-size:11px;color:#888;font-style:italic;padding:10px 0">Nessun dato disponibile (nessuna fattura scaduta o saldata recente).</div>';
    html += '</div>';
    return html;
  }

  // Scala da -15 (sx) a +60 (dx). Posizione del cursore in %
  var minScale = -15, maxScale = 60;
  var clamped = Math.max(minScale, Math.min(maxScale, ggMedi));
  var posPerc = ((clamped - minScale) / (maxScale - minScale)) * 100;

  html += '<div style="position:relative;height:40px;background:linear-gradient(90deg,#27500A 0%,#639922 25%,#FAEEDA 50%,#E29325 65%,#A32D2D 90%);border-radius:6px;border:0.5px solid #888">';
  // Linea zero (al 20% della scala: (0+15)/75)
  var zeroPos = ((0 - minScale) / (maxScale - minScale)) * 100;
  html += '<div style="position:absolute;top:-3px;bottom:-3px;width:2px;background:rgba(0,0,0,0.4);left:' + zeroPos + '%;transform:translateX(-50%)"></div>';
  // Cursore cliente
  html += '<div style="position:absolute;top:-3px;bottom:-3px;width:3px;background:#1a2332;left:' + posPerc + '%;transform:translateX(-50%);border-radius:2px"></div>';
  // Tooltip cursore
  var ggLabel = (ggMedi > 0 ? '+' : '') + ggMedi + ' gg medi';
  html += '<div style="position:absolute;top:-22px;left:' + posPerc + '%;transform:translateX(-50%);background:#1a2332;color:white;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;white-space:nowrap">' + ggLabel + '</div>';
  html += '</div>';

  html += '<div style="display:flex;justify-content:space-between;font-size:9px;color:#666;margin-top:5px">';
  html += '<span>−15gg<br/><span style="color:#27500A;font-weight:600">Anticipa</span></span>';
  html += '<span>0gg<br/><span style="color:#444;font-weight:600">In giornata</span></span>';
  html += '<span>+15gg<br/><span style="color:#BA7517;font-weight:600">Lieve ritardo</span></span>';
  html += '<span>+30gg<br/><span style="color:#E29325;font-weight:600">Ritardo</span></span>';
  html += '<span>+45gg+<br/><span style="color:#A32D2D;font-weight:600">Critico</span></span>';
  html += '</div>';

  html += '<div style="font-size:10px;color:#666;margin-top:8px;font-style:italic">';
  html += 'Calcolato sulla media dei giorni di ritardo delle fatture scadute non ancora saldate. ';
  html += '<strong>Termine pagamento contrattuale</strong>: ' + (cliente.giorni_pagamento || 60) + ' gg dalla data fattura.';
  html += '</div>';

  html += '</div>';
  return html;
}


function _ecRenderGraficoFatturato(fattAnno, fattAnnoPrec, anno) {
  // Aggrego per mese
  var perMeseAnno = new Array(12).fill(0);
  var perMeseAnnoPrec = new Array(12).fill(0);
  fattAnno.forEach(function(f) {
    if (f.data) {
      var m = parseInt(f.data.substring(5, 7), 10) - 1;
      perMeseAnno[m] += Number(f.importo_totale || 0);
    }
  });
  fattAnnoPrec.forEach(function(f) {
    if (f.data) {
      var m = parseInt(f.data.substring(5, 7), 10) - 1;
      perMeseAnnoPrec[m] += Number(f.importo_totale || 0);
    }
  });

  var maxVal = 0;
  for (var i = 0; i < 12; i++) {
    maxVal = Math.max(maxVal, perMeseAnno[i], perMeseAnnoPrec[i]);
  }
  if (maxVal <= 0) maxVal = 1;

  var w = 480, h = 160;
  var leftPad = 40, rightPad = 8, topPad = 20, bottomPad = 25;
  var chartW = w - leftPad - rightPad;
  var chartH = h - topPad - bottomPad;
  var slotW = chartW / 12;
  var barW = Math.min(slotW * 0.4, 14);
  var spacing = (slotW - 2 * barW) / 2;

  var totAnno = perMeseAnno.reduce(function(s, x) { return s + x; }, 0);
  var totAnnoPrec = perMeseAnnoPrec.reduce(function(s, x) { return s + x; }, 0);
  var deltaTxt = '';
  if (totAnnoPrec > 0) {
    var d = (totAnno - totAnnoPrec) / totAnnoPrec;
    var ic = d >= 0 ? '↑' : '↓';
    var col = d >= 0 ? '#27500A' : '#791F1F';
    deltaTxt = ' <span style="color:' + col + ';font-weight:600">' + ic + ' ' + Math.abs(d * 100).toFixed(0) + '%</span>';
  }

  var html = '<div style="background:#FAF8F2;padding:14px 16px;border-radius:6px;border:0.5px solid #e5e0d2">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600;margin-bottom:10px">📈 Fatturato mensile · ' + anno + ' vs ' + (anno - 1) + '</div>';

  html += '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:160px">';
  html += '<line x1="' + leftPad + '" y1="' + topPad + '" x2="' + leftPad + '" y2="' + (h - bottomPad) + '" stroke="#ccc" stroke-width="0.5"/>';
  html += '<line x1="' + leftPad + '" y1="' + (h - bottomPad) + '" x2="' + (w - rightPad) + '" y2="' + (h - bottomPad) + '" stroke="#ccc" stroke-width="0.5"/>';

  // Tick verticali
  for (var t = 0; t <= 4; t++) {
    var val = (maxVal / 4) * t;
    var y = (h - bottomPad) - (chartH * t / 4);
    html += '<text x="' + (leftPad - 4) + '" y="' + (y + 3) + '" text-anchor="end" font-size="8" fill="#888">' + _ecFmtImpKb(val) + '</text>';
  }

  for (var m = 0; m < 12; m++) {
    var xBase = leftPad + (m * slotW) + spacing;
    // Anno precedente (grigio chiaro)
    var hPrec = (perMeseAnnoPrec[m] / maxVal) * chartH;
    if (hPrec > 0) {
      var yPrec = (h - bottomPad) - hPrec;
      html += '<rect x="' + xBase.toFixed(1) + '" y="' + yPrec.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hPrec.toFixed(1) + '" fill="#888" opacity="0.5" rx="1"><title>' + _EC_MESI_FULL[m] + ' ' + (anno - 1) + ': € ' + _ecFmt(perMeseAnnoPrec[m]) + '</title></rect>';
    }
    // Anno corrente (blu)
    var hCur = (perMeseAnno[m] / maxVal) * chartH;
    if (hCur > 0) {
      var yCur = (h - bottomPad) - hCur;
      html += '<rect x="' + (xBase + barW).toFixed(1) + '" y="' + yCur.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hCur.toFixed(1) + '" fill="#185FA5" rx="1"><title>' + _EC_MESI_FULL[m] + ' ' + anno + ': € ' + _ecFmt(perMeseAnno[m]) + '</title></rect>';
    }
    // Label mese
    html += '<text x="' + (xBase + barW).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="8" fill="#888">' + _EC_MESI[m] + '</text>';
  }

  html += '</svg>';

  html += '<div style="display:flex;gap:14px;margin-top:6px;font-size:10px;justify-content:center">';
  html += '<span><span style="display:inline-block;width:9px;height:9px;background:#888;opacity:0.5;border-radius:1px;margin-right:4px"></span>' + (anno - 1) + ' (€ ' + _ecFmt(totAnnoPrec) + ')</span>';
  html += '<span><span style="display:inline-block;width:9px;height:9px;background:#185FA5;border-radius:1px;margin-right:4px"></span>' + anno + ' (€ ' + _ecFmt(totAnno) + ')' + deltaTxt + '</span>';
  html += '</div>';

  html += '</div>';
  return html;
}


function _ecCalcolaAging(fattAperte, oggiIso) {
  var oggi = new Date(oggiIso + 'T00:00:00');
  var aging = {
    non_scaduto: { imp: 0, n: 0 },
    b30: { imp: 0, n: 0 },
    b60: { imp: 0, n: 0 },
    b90: { imp: 0, n: 0 },
    oltre: { imp: 0, n: 0 }
  };
  fattAperte.forEach(function(f) {
    var imp = Number(f.saldo_residuo || 0);
    if (!f.data_scadenza || f.data_scadenza >= oggiIso) {
      aging.non_scaduto.imp += imp; aging.non_scaduto.n++;
      return;
    }
    var ggRit = Math.floor((oggi - new Date(f.data_scadenza + 'T00:00:00')) / 86400000);
    if (ggRit <= 30) { aging.b30.imp += imp; aging.b30.n++; }
    else if (ggRit <= 60) { aging.b60.imp += imp; aging.b60.n++; }
    else if (ggRit <= 90) { aging.b90.imp += imp; aging.b90.n++; }
    else { aging.oltre.imp += imp; aging.oltre.n++; }
  });
  return aging;
}


function _ecRenderAging(aging) {
  var totAll = aging.non_scaduto.imp + aging.b30.imp + aging.b60.imp + aging.b90.imp + aging.oltre.imp;
  if (totAll <= 0) totAll = 1;

  var html = '<div style="background:#FAF8F2;padding:14px 16px;border-radius:6px;border:0.5px solid #e5e0d2">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600;margin-bottom:10px">📅 Aging fatture aperte</div>';
  html += '<div style="display:flex;flex-direction:column;gap:6px">';

  function rigaAging(label, dati, color, etiq) {
    var pp = (dati.imp / totAll) * 100;
    var html = '<div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">';
    html += '<span style="' + (etiq === 'critico' ? 'color:#A32D2D;font-weight:600' : '') + '">' + label + (etiq === 'critico' ? ' ⚠' : '') + '</span>';
    html += '<span style="font-family:var(--font-mono);' + (etiq === 'critico' ? 'color:#A32D2D;font-weight:600' : '') + '">€ ' + _ecFmt(dati.imp) + ' (' + dati.n + ' ft.)</span>';
    html += '</div>';
    html += '<div style="background:white;height:10px;border-radius:2px;overflow:hidden;border:0.5px solid #ccc"><div style="width:' + Math.min(100, pp).toFixed(1) + '%;height:100%;background:' + color + '"></div></div>';
    html += '</div>';
    return html;
  }

  html += rigaAging('Non scadute', aging.non_scaduto, '#639922');
  html += rigaAging('0-30 gg ritardo', aging.b30, '#FAEEDA');
  html += rigaAging('31-60 gg ritardo', aging.b60, '#E29325');
  html += rigaAging('61-90 gg ritardo', aging.b90, '#D14040');
  html += rigaAging('Oltre 90 gg', aging.oltre, '#A32D2D', 'critico');

  html += '</div></div>';
  return html;
}


function _ecRenderEstrattoFatture(fattCli) {
  var oggi = new Date();
  var oggiIso = oggi.toISOString().split('T')[0];
  var filtro = _ecStato.filtroFatture;

  // Filtro
  var fattFilt = fattCli.slice();
  if (filtro === 'aperte') {
    fattFilt = fattFilt.filter(function(f) { return f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale'; });
  } else if (filtro === 'scadute') {
    fattFilt = fattFilt.filter(function(f) {
      return (f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale')
          && f.data_scadenza && f.data_scadenza < oggiIso;
    });
  }

  // Ordino per data emissione decrescente
  fattFilt.sort(function(a, b) { return (a.data < b.data) ? 1 : -1; });

  var nTutte = fattCli.length;
  var nAperte = fattCli.filter(function(f) { return f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale'; }).length;
  var nScadute = fattCli.filter(function(f) {
    return (f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale')
        && f.data_scadenza && f.data_scadenza < oggiIso;
  }).length;

  var html = '<div style="background:#FAF8F2;padding:0;border-radius:6px;border:0.5px solid #e5e0d2;overflow:hidden">';
  html += '<div style="padding:10px 14px;background:white;border-bottom:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600">📋 Estratto conto fatture (' + fattFilt.length + ' / ' + nTutte + ')</div>';
  html += '<div style="display:flex;gap:6px">';
  html += '<div style="display:flex;background:#f0f0f0;border-radius:4px;padding:2px">';
  html += _ecTabFiltro('tutte', 'Tutte (' + nTutte + ')', filtro === 'tutte');
  html += _ecTabFiltro('aperte', 'Aperte (' + nAperte + ')', filtro === 'aperte');
  html += _ecTabFiltro('scadute', 'Scadute (' + nScadute + ')', filtro === 'scadute');
  html += '</div>';
  html += '<button onclick="_ecStampaEstratto()" style="background:#185FA5;color:white;font-size:10px;padding:5px 10px;border:0;border-radius:3px;cursor:pointer">🖨️ Stampa</button>';
  html += '</div></div>';

  if (fattFilt.length === 0) {
    html += '<div style="text-align:center;padding:30px;color:#888;font-style:italic;font-size:11px">Nessuna fattura per il filtro selezionato.</div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr style="background:#fafaf6">';
    html += '<th style="padding:6px 9px;text-align:left;border-bottom:0.5px solid var(--border)">Fattura</th>';
    html += '<th style="padding:6px 9px;text-align:left;border-bottom:0.5px solid var(--border)">Data emissione</th>';
    html += '<th style="padding:6px 9px;text-align:left;border-bottom:0.5px solid var(--border)">Scadenza</th>';
    html += '<th style="padding:6px 9px;text-align:right;border-bottom:0.5px solid var(--border)">Importo</th>';
    html += '<th style="padding:6px 9px;text-align:right;border-bottom:0.5px solid var(--border)">Pagato</th>';
    html += '<th style="padding:6px 9px;text-align:right;border-bottom:0.5px solid var(--border)">Saldo</th>';
    html += '<th style="padding:6px 9px;text-align:center;border-bottom:0.5px solid var(--border)">Stato</th>';
    html += '<th style="padding:6px 9px;text-align:center;border-bottom:0.5px solid var(--border)">Δgg</th>';
    html += '</tr></thead><tbody>';

    fattFilt.forEach(function(f) {
      var isOpen = f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale';
      var isScad = isOpen && f.data_scadenza && f.data_scadenza < oggiIso;
      var rowBg = isScad ? 'background:#FCEBEB;' : '';
      var ggDiff = '';
      var ggColor = '';
      if (f.data_scadenza) {
        var dScad = new Date(f.data_scadenza + 'T00:00:00');
        var diff = Math.floor((oggi - dScad) / 86400000);
        if (isOpen) {
          if (diff > 0) { ggDiff = '+' + diff; ggColor = diff > 30 ? '#A32D2D' : '#BA7517'; }
          else if (diff < 0) { ggDiff = String(diff); ggColor = '#27500A'; }
          else { ggDiff = '0'; ggColor = '#444'; }
        }
      }
      html += '<tr style="border-bottom:0.5px solid var(--border);' + rowBg + '">';
      html += '<td style="padding:5px 9px;font-family:var(--font-mono);font-size:10px">' + _ecEsc(f.numero || '') + '/' + _ecEsc(String(f.anno || '')) + '</td>';
      html += '<td style="padding:5px 9px">' + _ecFmtData(f.data) + '</td>';
      html += '<td style="padding:5px 9px">' + _ecFmtData(f.data_scadenza) + '</td>';
      html += '<td style="padding:5px 9px;text-align:right;font-family:var(--font-mono)">' + _ecFmtDec(f.importo_totale) + '</td>';
      html += '<td style="padding:5px 9px;text-align:right;font-family:var(--font-mono);color:' + (Number(f.importo_incassato) > 0 ? '#27500A' : '#888') + '">' + (Number(f.importo_incassato) > 0 ? _ecFmtDec(f.importo_incassato) : '—') + '</td>';
      html += '<td style="padding:5px 9px;text-align:right;font-family:var(--font-mono);font-weight:' + (Number(f.saldo_residuo) > 0 ? '600' : 'normal') + ';color:' + (Number(f.saldo_residuo) > 0 ? (isScad ? '#791F1F' : '#412402') : '#888') + '">' + (Number(f.saldo_residuo) > 0 ? _ecFmtDec(f.saldo_residuo) : '—') + '</td>';
      html += '<td style="padding:5px 9px;text-align:center">' + _ecBadgeStato(f.stato_pagamento, isScad) + '</td>';
      html += '<td style="padding:5px 9px;text-align:center;font-weight:600;color:' + ggColor + '">' + ggDiff + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
  }
  html += '</div>';
  return html;
}


function _ecTabFiltro(filtro, label, attivo) {
  return '<button onclick="_ecCambiaFiltroFatture(\'' + filtro + '\')" style="background:' + (attivo ? '#0C447C' : 'transparent') + ';color:' + (attivo ? 'white' : '#444') + ';font-size:10px;padding:4px 10px;border:0;border-radius:3px;font-weight:500;cursor:pointer">' + label + '</button>';
}


function _ecCambiaFiltroFatture(filtro) {
  _ecStato.filtroFatture = filtro;
  var el = document.getElementById('ec-content');
  if (el) el.innerHTML = _ecRenderCliente();
}


function _ecBadgeStato(stato, isScad) {
  var bg, color, label;
  if (stato === 'saldata') { bg = '#E6F1FB'; color = '#0C447C'; label = 'Pagata'; }
  else if (stato === 'parziale') { bg = '#FAEEDA'; color = '#BA7517'; label = 'Parziale'; }
  else if (isScad) { bg = '#FCEBEB'; color = '#A32D2D'; label = 'Scaduta'; }
  else { bg = '#EAF3DE'; color = '#27500A'; label = 'Aperta'; }
  return '<span style="background:' + bg + ';color:' + color + ';font-size:9px;padding:2px 6px;border-radius:3px;font-weight:600">' + label + '</span>';
}


// ════════════════════════════════════════════════════════════════════════
// MODALE MODIFICA MODALITÀ PAGAMENTO
// ════════════════════════════════════════════════════════════════════════
function _ecApriModaleModalita(clienteId) {
  var cliente = _ecStato.clienti.find(function(c) { return c.id === clienteId; });
  if (!cliente) { if (typeof toast === 'function') toast('Cliente non trovato'); return; }

  var html = '<div style="max-width:520px;width:100%">';
  html += '<div style="font-size:14px;font-weight:500;margin-bottom:12px;color:var(--text)">✏️ Modalità di pagamento abituale</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Cliente: <strong>' + _ecEsc(cliente.ragione_sociale || cliente.nome || '—') + '</strong></div>';

  // Tipo pagamento
  html += '<div style="margin-bottom:12px">';
  html += '<label style="font-size:11px;color:var(--text-muted);font-weight:500;display:block;margin-bottom:4px">Tipo pagamento</label>';
  html += '<select id="ec-mod-tipo" onchange="_ecToggleBancaSelect()" style="width:100%;font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px">';
  var opts = [
    { v: '', l: '— Nessuna preferenza —' },
    { v: 'bonifico', l: 'Bonifico bancario' },
    { v: 'riba', l: 'Ricevuta bancaria (RiBa)' },
    { v: 'assegno', l: 'Assegno' },
    { v: 'contanti', l: 'Contanti' }
  ];
  opts.forEach(function(o) {
    var sel = (cliente.modalita_pagamento || '') === o.v ? ' selected' : '';
    html += '<option value="' + o.v + '"' + sel + '>' + o.l + '</option>';
  });
  html += '</select></div>';

  // Banca (solo per bonifico/riba)
  var showBanca = cliente.modalita_pagamento === 'bonifico' || cliente.modalita_pagamento === 'riba';
  html += '<div id="ec-mod-banca-wrap" style="margin-bottom:12px;display:' + (showBanca ? 'block' : 'none') + '">';
  html += '<label style="font-size:11px;color:var(--text-muted);font-weight:500;display:block;margin-bottom:4px">Banca di accredito abituale</label>';
  html += '<select id="ec-mod-banca" style="width:100%;font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px">';
  html += '<option value="">— Nessuna preferenza —</option>';
  // Ordine: Intesa → MPS → BNL → BCC → altre
  var banchOrd = _ecStato.banche.slice().sort(function(a, b) { return _ecPrioritaBanca(a.nome) - _ecPrioritaBanca(b.nome); });
  banchOrd.forEach(function(b) {
    var sel = cliente.banca_accredito_id === b.id ? ' selected' : '';
    html += '<option value="' + _ecEsc(b.id) + '"' + sel + '>' + _ecEsc(b.nome) + '</option>';
  });
  html += '</select></div>';

  html += '<div style="background:#FFF7E6;border-left:3px solid #BA7517;padding:8px 12px;font-size:10px;color:#412402;border-radius:0 4px 4px 0;margin-bottom:14px">';
  html += '💡 Questa info viene usata da <strong>Anticipo Fatture</strong>: in cima quelle con stessa banca SBF, sotto la separatrice quelle con destinazione diversa.';
  html += '</div>';

  html += '<div style="display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:0.5px solid var(--border)">';
  html += '<button onclick="chiudiModal()" style="background:transparent;border:0.5px solid var(--border);font-size:12px;padding:6px 14px;border-radius:4px;cursor:pointer">Annulla</button>';
  html += '<button onclick="_ecSalvaModalita(\'' + _ecEsc(clienteId) + '\')" style="background:#185FA5;color:white;font-size:12px;padding:6px 14px;border:0;border-radius:4px;font-weight:500;cursor:pointer">Salva</button>';
  html += '</div>';

  html += '</div>';
  apriModal(html);
}


function _ecPrioritaBanca(nome) {
  var n = (nome || '').toLowerCase();
  if (n.indexOf('intesa') >= 0) return 1;
  if (n.indexOf('mps') >= 0 || n.indexOf('monte') >= 0) return 2;
  if (n.indexOf('bnl') >= 0) return 3;
  if (n.indexOf('bcc') >= 0 || n.indexOf('cooperativo') >= 0) return 4;
  return 99;
}


function _ecToggleBancaSelect() {
  var tipo = document.getElementById('ec-mod-tipo').value;
  var wrap = document.getElementById('ec-mod-banca-wrap');
  if (wrap) wrap.style.display = (tipo === 'bonifico' || tipo === 'riba') ? 'block' : 'none';
}


async function _ecSalvaModalita(clienteId) {
  var tipo = document.getElementById('ec-mod-tipo').value || null;
  var bancaId = document.getElementById('ec-mod-banca').value || null;
  // Se tipo non è bonifico/riba, banca non ha senso
  if (tipo !== 'bonifico' && tipo !== 'riba') bancaId = null;

  var res = await sb.from('clienti').update({
    modalita_pagamento: tipo,
    banca_accredito_id: bancaId
  }).eq('id', clienteId);

  if (res.error) { alert('Errore aggiornamento: ' + res.error.message); console.error(res.error); return; }

  if (typeof toast === 'function') toast('✓ Modalità pagamento aggiornata');
  if (typeof _auditLog === 'function') {
    _auditLog('clienti', 'clienti', 'Aggiornata modalità pagamento cliente ' + clienteId.substring(0, 8) + ': ' + (tipo || 'nessuna') + ' / banca ' + (bancaId ? bancaId.substring(0, 8) : 'nessuna'));
  }
  chiudiModal();

  // Re-render
  await renderEstrattoConto();
}


// Stampa estratto conto cliente (rimando alla nuova finestra)
function _ecStampaEstratto() {
  var clienteId = _ecStato.clienteSelezionato;
  if (!clienteId) return;
  var cliente = _ecStato.clienti.find(function(c) { return c.id === clienteId; });
  if (!cliente) return;

  var oggi = new Date();
  var oggiIso = oggi.toISOString().split('T')[0];
  var fattCli = _ecStato.fatture.filter(function(f) { return f.cliente_id === clienteId; });
  var filtro = _ecStato.filtroFatture;
  var fattFilt = fattCli.slice();
  if (filtro === 'aperte') fattFilt = fattFilt.filter(function(f) { return f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale'; });
  else if (filtro === 'scadute') fattFilt = fattFilt.filter(function(f) { return (f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale') && f.data_scadenza && f.data_scadenza < oggiIso; });
  fattFilt.sort(function(a, b) { return (a.data < b.data) ? 1 : -1; });

  var totSaldo = fattFilt.reduce(function(s, f) { return s + Number(f.saldo_residuo || 0); }, 0);
  var filtroLabel = ({ tutte: 'Tutte', aperte: 'Solo aperte', scadute: 'Solo scadute' })[filtro] || 'Tutte';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Estratto Conto — ' + _ecEsc(cliente.ragione_sociale || cliente.nome) + '</title>';
  html += '<style>';
  html += '@page { size: A4 landscape; margin: 12mm; }';
  html += 'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a2332; font-size: 10pt; margin: 0; }';
  html += 'h1 { font-size: 14pt; margin: 0 0 4px 0; }';
  html += '.meta { font-size: 9pt; color: #666; margin-bottom: 14px; }';
  html += 'table { width: 100%; border-collapse: collapse; font-size: 9pt; }';
  html += 'th { background: #f0efe8; border: 0.5px solid #888; padding: 5px 7px; text-align: left; font-weight: 600; }';
  html += 'td { border: 0.5px solid #888; padding: 4px 7px; }';
  html += '.num { font-family: "SF Mono", monospace; text-align: right; }';
  html += '.totale { background: #f5f5f0; font-weight: 600; }';
  html += '.row-scaduta { background: #FFF5F5; }';
  html += '.no-print { position: fixed; bottom: 20px; right: 20px; }';
  html += '@media print { .no-print { display: none !important; } }';
  html += '</style></head><body>';

  html += '<h1>📋 Estratto Conto Cliente</h1>';
  html += '<div class="meta"><strong>' + _ecEsc(cliente.ragione_sociale || cliente.nome || '—') + '</strong>';
  if (cliente.piva) html += ' · P.IVA ' + _ecEsc(cliente.piva);
  html += ' · Filtro: ' + filtroLabel + ' · ' + fattFilt.length + ' fatture · saldo aperto totale € ' + _ecFmtDec(totSaldo) + '</div>';

  html += '<table><thead><tr>';
  html += '<th>Fattura</th><th>Data emissione</th><th>Scadenza</th><th>Importo (€)</th><th>Pagato (€)</th><th>Saldo (€)</th><th>Stato</th>';
  html += '</tr></thead><tbody>';

  fattFilt.forEach(function(f) {
    var isOpen = f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale';
    var isScad = isOpen && f.data_scadenza && f.data_scadenza < oggiIso;
    var statoLabel = f.stato_pagamento === 'saldata' ? 'Pagata' : (f.stato_pagamento === 'parziale' ? 'Parziale' : (isScad ? 'Scaduta' : 'Aperta'));
    var rowCls = isScad ? 'row-scaduta' : '';
    html += '<tr class="' + rowCls + '">';
    html += '<td>' + _ecEsc(f.numero || '') + '/' + _ecEsc(String(f.anno || '')) + '</td>';
    html += '<td>' + _ecFmtData(f.data) + '</td>';
    html += '<td>' + _ecFmtData(f.data_scadenza) + '</td>';
    html += '<td class="num">' + _ecFmtDec(f.importo_totale) + '</td>';
    html += '<td class="num">' + (Number(f.importo_incassato) > 0 ? _ecFmtDec(f.importo_incassato) : '—') + '</td>';
    html += '<td class="num">' + (Number(f.saldo_residuo) > 0 ? _ecFmtDec(f.saldo_residuo) : '—') + '</td>';
    html += '<td>' + statoLabel + '</td>';
    html += '</tr>';
  });

  html += '<tr class="totale"><td colspan="5">TOTALE SALDO APERTO</td><td class="num">' + _ecFmtDec(totSaldo) + '</td><td></td></tr>';
  html += '</tbody></table>';

  html += '<div style="margin-top:14px;font-size:8pt;color:#888;text-align:center;border-top:0.5px solid #ccc;padding-top:6px">PhoenixFuel ERP — Stampato il ' + _ecFmtData(oggiIso) + '</div>';

  html += '<div class="no-print"><button onclick="window.print()" style="padding:8px 16px;margin:0 4px;background:#185FA5;color:white;border:0;border-radius:6px;cursor:pointer;font-size:11pt">🖨️ Stampa</button>';
  html += '<button onclick="window.close()" style="padding:8px 16px;margin:0 4px;background:#A32D2D;color:white;border:0;border-radius:6px;cursor:pointer;font-size:11pt">✕ Chiudi</button></div>';
  html += '<script>window.onload=function(){setTimeout(function(){window.print()},500)}</' + 'script>';
  html += '</body></html>';

  var w = window.open('', '_blank', 'width=1100,height=800');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

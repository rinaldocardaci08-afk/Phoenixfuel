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
  // Patch v20260503s: vista grafico 'fatturato' | 'litri' (toggle nel grafico cliente)
  vistaGrafico: (typeof localStorage !== 'undefined' && localStorage.getItem('pf-ec-vista-grafico')) || 'fatturato',
  // Cache dati
  fatture: [],
  clienti: [],
  banche: [],
  riconciliazioni: [],
  ordini: []  // Patch v20260503s: ordini cliente per grafico litri
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
  // Patch v20260503s: aggiungo query ordini cliente (per grafico litri)
  // Patch v20260503t (FIX): paginazione + esclusione annullati per coerenza con anagrafica.
  //                        Senza paginazione Supabase tronca a 1000 record → grafico falsato.
  //                        La paginazione si applica anche a fatture/riconciliazioni che possono superare 1000.
  var dueAnniFa = new Date(); dueAnniFa.setFullYear(dueAnniFa.getFullYear() - 2);
  var dueAnniFaIso = dueAnniFa.toISOString().split('T')[0];

  // Helper paginazione generica
  async function _ecCaricaPaginate(builderFn) {
    var out = [];
    var from = 0; var batch = 1000;
    while (true) {
      var q = await builderFn(from, from + batch - 1);
      if (q.error) { console.error('[ec/paginate]', q.error); return { data: out, error: q.error }; }
      var d = q.data || [];
      if (d.length === 0) break;
      out = out.concat(d);
      if (d.length < batch) break;
      from += batch;
    }
    return { data: out, error: null };
  }

  // Carica clienti e banche (sempre piccoli, no paginazione necessaria)
  var [resCli, resIst] = await Promise.all([
    sb.from('clienti').select('id,nome,ragione_sociale,piva,codice_fiscale,giorni_pagamento,modalita_pagamento,banca_accredito_id,cliente_rete,attivo,fido_massimo').eq('attivo', true),
    sb.from('banche_istituti').select('id,nome')
  ]);

  // Carica fatture (paginate)
  var resFatt = await _ecCaricaPaginate(function(a, b) {
    return sb.from('estratto_conto_cliente').select('*').range(a, b);
  });

  // Carica riconciliazioni (paginate)
  var resRic = await _ecCaricaPaginate(function(a, b) {
    return sb.from('foglio_giornale_riconciliazioni').select('fattura_emessa_id,importo_imputato,movimento_id').range(a, b);
  });

  // Carica ordini (paginati + esclusione annullati)
  var resOrd = await _ecCaricaPaginate(function(a, b) {
    return sb.from('ordini')
      .select('id,cliente_id,data,litri,tipo_ordine,stato,costo_litro,trasporto_litro,margine,iva,prodotto,data_scadenza,fattura_id,fattura_riga_id,pagato')
      .eq('tipo_ordine', 'cliente')
      .neq('stato', 'annullato')
      .gte('data', dueAnniFaIso)
      .range(a, b);
  });

  if (resFatt.error) {
    el.innerHTML = '<div style="padding:20px;color:#A32D2D">Errore: ' + _ecEsc(resFatt.error.message) + '</div>';
    return;
  }

  _ecStato.fatture = resFatt.data || [];
  _ecStato.clienti = resCli.data || [];
  _ecStato.banche = resIst.data || [];
  _ecStato.riconciliazioni = resRic.data || [];

  // ── ANTICIPI (27/07): quali fatture sono state presentate in banca e per
  // quanto. Serve per l'etichetta "Anticipata · Istituto" accanto alla
  // scadenza e per sapere quanto rientra alla banca quando si incassa.
  try {
    var resAnt = await Promise.all([
      sb.from('anticipi_sbf_fatture').select('id,presentazione_id,fattura_id,importo_anticipato,importo_estinto,stato'),
      sb.from('anticipi_sbf_presentazioni').select('id,affidamento_id,stato'),
      sb.from('banche_affidamenti').select('id,istituto_id')
    ]);
    var presMap = {}, affMap = {};
    (resAnt[1].data || []).forEach(function (p) { presMap[p.id] = p; });
    (resAnt[2].data || []).forEach(function (a) { affMap[a.id] = a; });
    _ecStato.anticipiPerFattura = {};
    (resAnt[0].data || []).forEach(function (r) {
      if (!r.fattura_id) return;
      if (r.stato === 'estinta') return;                       // gia rientrata: niente etichetta
      var pres = presMap[r.presentazione_id] || {};
      var aff  = affMap[pres.affidamento_id] || {};
      var ist  = (_ecStato.banche || []).filter(function (b) { return b.id === aff.istituto_id; })[0];
      _ecStato.anticipiPerFattura[r.fattura_id] = {
        rigaId: r.id,
        istitutoId: aff.istituto_id || null,
        istituto: ist ? ist.nome : 'banca',
        anticipato: Math.max(0, Number(r.importo_anticipato || 0) - Number(r.importo_estinto || 0))
      };
    });
  } catch (e) {
    console.warn('[ec] anticipi', e);
    _ecStato.anticipiPerFattura = {};
  }
  _ecStato.ordini = resOrd.data || [];

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


// ═══════════════════════════════════════════════════════════════════
// INCASSO FATTURE CLIENTE (27/07)
// Si spuntano una o piu fatture aperte e si registra l'incasso: totale o
// parziale, con banca e modalita. L'importo si distribuisce DALLA SCADENZA
// PIU VECCHIA, come paga un cliente in ritardo e come lavora la banca.
// Scrittura: un movimento di ENTRATA nel foglio giornale + una riconciliazione
// per fattura — il saldo residuo lo ricalcola la vista, come per i fornitori.
// Se la fattura e' ANTICIPATA e si spunta "comunicata alla banca", parte anche
// l'estinzione dell'anticipo (funzione unica in pf-anticipi.js), che libera il
// fido e fa uscire dal conto la parte della banca.
// ═══════════════════════════════════════════════════════════════════
var _ecSel = {};        // { fatturaId: true } — si muta in loco, mai riassegnata

function _ecToggleFatt(id, cb) {
  if (cb && cb.checked) _ecSel[id] = true; else delete _ecSel[id];
  _ecRenderCliente();
}
function _ecDeseleziona() {
  Object.keys(_ecSel).forEach(function (k) { delete _ecSel[k]; });
  _ecRenderCliente();
}
function _ecFattureSelezionate() {
  return (_ecStato.fatture || []).filter(function (f) { return _ecSel[f.id]; })
    .sort(function (a, b) {
      var sa = a.data_scadenza || '9999-12-31', sb2 = b.data_scadenza || '9999-12-31';
      return sa < sb2 ? -1 : (sa > sb2 ? 1 : 0);
    });
}

function _ecBoxSelezione(fattVisibili) {
  var sel = _ecFattureSelezionate();
  if (!sel.length) return '';
  var oggiIso = new Date().toISOString().split('T')[0];
  var tot = sel.reduce(function (a, f) { return a + Number(f.saldo_residuo || 0); }, 0);
  var scad = sel.filter(function (f) { return f.data_scadenza && f.data_scadenza < oggiIso; })
                .reduce(function (a, f) { return a + Number(f.saldo_residuo || 0); }, 0);
  return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;background:#E6F1FB;border-top:1px solid #378ADD;padding:10px 14px">'
    + '<div style="font-size:12px;color:#0C447C">'
      + '<strong>' + sel.length + (sel.length === 1 ? ' fattura selezionata' : ' fatture selezionate') + '</strong> · '
      + '<span style="font-family:var(--font-mono);font-weight:700">' + _ecFmtDec(tot) + '</span>'
      + (scad > 0 ? ' <span style="color:#A32D2D">· di cui scaduto ' + _ecFmtDec(scad) + '</span>' : '')
    + '</div>'
    + '<div style="display:flex;gap:8px">'
      + '<button onclick="_ecDeseleziona()" style="background:white;border:0.5px solid var(--border);border-radius:6px;padding:7px 12px;font-size:11.5px;cursor:pointer">Deseleziona</button>'
      + '<button onclick="_ecApriIncasso()" style="background:#185FA5;color:#fff;border:none;border-radius:6px;padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer">Registra incasso</button>'
    + '</div></div>';
}

// Distribuzione dell'importo sulle fatture selezionate, dalla piu vecchia
function _ecDistribuisci(sel, importo) {
  var resta = Math.round(Number(importo || 0) * 100) / 100;
  return sel.map(function (f) {
    var res = Number(f.saldo_residuo || 0);
    var q = Math.min(res, Math.max(0, resta));
    q = Math.round(q * 100) / 100;
    resta = Math.round((resta - q) * 100) / 100;
    return { f: f, quota: q, saldata: q >= res - 0.005 };
  });
}

async function _ecSalvaIncasso() {
  var btn = document.getElementById('ec-inc-salva');
  var sel = _ecFattureSelezionate();
  if (!sel.length) { toast('Nessuna fattura selezionata'); return; }

  var imp = parseFloat((document.getElementById('ec-inc-importo') || {}).value) || 0;
  var data = (document.getElementById('ec-inc-data') || {}).value || '';
  var bancaId = (document.getElementById('ec-inc-banca') || {}).value || null;
  var modalita = (document.getElementById('ec-inc-modalita') || {}).value || 'bonifico';
  var elCom = document.getElementById('ec-inc-comunicata');
  var comunicata = !!(elCom && (elCom.type === 'checkbox' ? elCom.checked : elCom.value === '1'));

  if (!(imp > 0)) { toast('Indica un importo maggiore di zero'); return; }
  if (!data) { toast('Indica la data dell\'incasso'); return; }
  if (!bancaId) { toast('Scegli l\'istituto'); return; }

  var dist = _ecDistribuisci(sel, imp).filter(function (d) { return d.quota > 0; });
  if (!dist.length) { toast('L\'importo non copre nessuna fattura'); return; }

  var cliente = (_ecStato.clienti || []).filter(function (c) { return c.id === _ecStato.clienteSelezionato; })[0] || {};
  if (btn) { btn.disabled = true; btn.textContent = 'Registro…'; btn.style.opacity = '0.6'; }

  try {
    // 1. ENTRATA sul conto per l'intero incassato dal cliente
    var insMov = await sb.from('foglio_giornale_movimenti').insert([{
      data: data,
      tipo: 'entrata',
      importo: Math.round(imp * 100) / 100,
      descrizione: 'Incasso ' + (cliente.ragione_sociale || cliente.nome || 'cliente')
        + ' · ' + dist.length + (dist.length === 1 ? ' fattura' : ' fatture'),
      banca_id: bancaId,
      cassa_tipo: null,
      metodo: modalita,
      origine: 'auto-fattura',   // valore ammesso dal vincolo su foglio_giornale_movimenti
      note: null
    }]).select('id').single();
    if (insMov.error) throw insMov.error;

    // 2. una riconciliazione per fattura: e' questa che abbassa il saldo residuo
    var righe = dist.map(function (d) {
      return { movimento_id: insMov.data.id, fattura_emessa_id: d.f.id, ordine_id: null, fattura_ricevuta_id: null, importo_imputato: d.quota };
    });
    var insRic = await sb.from('foglio_giornale_riconciliazioni').insert(righe);
    if (insRic.error) {
      await sb.from('foglio_giornale_movimenti').delete().eq('id', insMov.data.id);   // niente movimenti orfani
      throw insRic.error;
    }

    // 3. se comunicata alla banca: rientro degli anticipi (funzione unica)
    var nAnt = 0, totAnt = 0;
    if (comunicata && typeof antEstinguiAnticipo === 'function') {
      for (var i = 0; i < dist.length; i++) {
        var an = (_ecStato.anticipiPerFattura || {})[dist[i].f.id];
        if (!an || !(an.anticipato > 0)) continue;
        var quotaAnt = Math.min(an.anticipato, dist[i].quota);
        try {
          await antEstinguiAnticipo(an.rigaId, { importo: quotaAnt, data: data, bancaId: an.istitutoId || bancaId });
          nAnt++; totAnt += quotaAnt;
        } catch (e) {
          console.warn('[ec] estinzione anticipo fallita', e);
          toast('Incasso registrato, ma il rientro dell\'anticipo della ' + (dist[i].f.numero || '') + ' non è passato: fallo dal Quadro anticipi');
        }
      }
    }

    if (typeof _auditLog === 'function') {
      _auditLog('incasso_cliente', 'foglio_giornale_movimenti',
        (cliente.ragione_sociale || cliente.nome || '') + ' · ' + _ecFmtDec(imp) + ' · ' + dist.length + ' fatture'
        + (nAnt ? ' · rientro anticipi ' + _ecFmtDec(totAnt) : ''));
    }

    chiudiModal();
    toast('✓ Incasso registrato: ' + _ecFmtDec(imp) + ' su ' + dist.length + (dist.length === 1 ? ' fattura' : ' fatture')
      + (nAnt ? ' · rientro anticipi ' + _ecFmtDec(totAnt) : ''));
    Object.keys(_ecSel).forEach(function (k) { delete _ecSel[k]; });
    await renderEstrattoConto();
  } catch (e) {
    console.error('[ec] incasso', e);
    toast('Errore: ' + ((e && e.message) || e));
    if (btn) { btn.disabled = false; btn.textContent = 'Registra'; btn.style.opacity = '1'; }
  }
}

function _ecApriIncasso() {
  var sel = _ecFattureSelezionate();
  if (!sel.length) { toast('Nessuna fattura selezionata'); return; }
  var tot = sel.reduce(function (a, f) { return a + Number(f.saldo_residuo || 0); }, 0);
  var cliente = (_ecStato.clienti || []).filter(function (c) { return c.id === _ecStato.clienteSelezionato; })[0] || {};
  var banche = _ecStato.banche || [];
  var bancaDef = cliente.banca_accredito_id || (banche[0] && banche[0].id) || '';

  var h = '<div style="font-size:16px;font-weight:600;margin-bottom:2px">Registra incasso</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">' + _ecEsc(cliente.ragione_sociale || cliente.nome || '') + ' · ' + sel.length + (sel.length === 1 ? ' fattura' : ' fatture') + '</div>';

  h += '<div style="display:flex;gap:6px;margin-bottom:14px">'
    + '<button id="ec-inc-tot" onclick="_ecIncTipo(true)" style="flex:1;background:#185FA5;color:#fff;border:none;border-radius:7px;padding:8px;font-size:12px;cursor:pointer">Totale</button>'
    + '<button id="ec-inc-par" onclick="_ecIncTipo(false)" style="flex:1;background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:7px;padding:8px;font-size:12px;cursor:pointer">Parziale</button>'
    + '</div>';

  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
    + '<div><label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Importo incassato</label>'
      + '<input id="ec-inc-importo" type="number" step="0.01" value="' + tot.toFixed(2) + '" oninput="_ecIncAggiorna()" style="width:100%;padding:9px;margin-top:4px;border:0.5px solid var(--border);border-radius:7px;font-family:var(--font-mono);font-size:15px"></div>'
    + '<div><label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Data incasso</label>'
      + '<input id="ec-inc-data" type="date" value="' + new Date().toISOString().split('T')[0] + '" style="width:100%;padding:9px;margin-top:4px;border:0.5px solid var(--border);border-radius:7px;font-size:14px"></div>'
    + '<div><label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Istituto</label>'
      + '<select id="ec-inc-banca" onchange="_ecIncAggiorna()" style="width:100%;padding:9px;margin-top:4px;border:0.5px solid var(--border);border-radius:7px;font-size:14px">'
      + banche.map(function (b) { return '<option value="' + b.id + '"' + (b.id === bancaDef ? ' selected' : '') + '>' + _ecEsc(b.nome) + '</option>'; }).join('')
      + '</select></div>'
    + '<div><label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Modalità</label>'
      + '<select id="ec-inc-modalita" style="width:100%;padding:9px;margin-top:4px;border:0.5px solid var(--border);border-radius:7px;font-size:14px">'
      + '<option value="bonifico">Bonifico</option><option value="riba">Ri.Ba.</option><option value="assegno">Assegno</option><option value="contanti">Contanti</option>'
      + '</select></div>'
    + '</div>';

  h += '<div id="ec-inc-distrib"></div>';
  h += '<div id="ec-inc-anticipi"></div>';

  h += '<div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">'
    + '<button onclick="chiudiModal()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer;font-size:12px">Annulla</button>'
    + '<button id="ec-inc-salva" onclick="_ecSalvaIncasso()" style="padding:9px 18px;border:none;border-radius:8px;background:#185FA5;color:#fff;font-size:12px;font-weight:600;cursor:pointer">Registra</button>'
    + '</div>';

  apriModal(h);
  _ecIncAggiorna();
}

function _ecIncTipo(totale) {
  var sel = _ecFattureSelezionate();
  var inp = document.getElementById('ec-inc-importo');
  var bT = document.getElementById('ec-inc-tot'), bP = document.getElementById('ec-inc-par');
  if (totale) {
    if (inp) inp.value = sel.reduce(function (a, f) { return a + Number(f.saldo_residuo || 0); }, 0).toFixed(2);
    if (bT) { bT.style.background = '#185FA5'; bT.style.color = '#fff'; bT.style.border = 'none'; }
    if (bP) { bP.style.background = 'var(--bg)'; bP.style.color = 'var(--text)'; bP.style.border = '0.5px solid var(--border)'; }
  } else {
    if (bP) { bP.style.background = '#185FA5'; bP.style.color = '#fff'; bP.style.border = 'none'; }
    if (bT) { bT.style.background = 'var(--bg)'; bT.style.color = 'var(--text)'; bT.style.border = '0.5px solid var(--border)'; }
    if (inp) { inp.focus(); inp.select(); }
  }
  _ecIncAggiorna();
}

function _ecIncAggiorna() {
  var sel = _ecFattureSelezionate();
  var imp = parseFloat((document.getElementById('ec-inc-importo') || {}).value) || 0;
  var bancaSel = (document.getElementById('ec-inc-banca') || {}).value || null;
  var dist = _ecDistribuisci(sel, imp);

  var box = document.getElementById('ec-inc-distrib');
  if (box) {
    box.innerHTML = '<div style="background:var(--bg-card);border-radius:8px;padding:10px 12px">'
      + '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Come viene distribuito</div>'
      + dist.map(function (d) {
          return '<div style="display:flex;justify-content:space-between;font-size:12px;line-height:1.7' + (d.quota <= 0 ? ';opacity:.45' : '') + '">'
            + '<span>' + _ecEsc(d.f.numero || '') + ' · scad. ' + _ecFmtData(d.f.data_scadenza) + '</span>'
            + '<span style="font-family:var(--font-mono)">' + _ecFmtDec(d.quota)
              + (d.quota <= 0 ? ' <span style="color:var(--text-muted)">non coperta</span>'
                              : (d.saldata ? ' <span style="color:#3B6D11">saldata</span>'
                                           : ' <span style="color:#8A4F06">acconto</span>')) + '</span></div>';
        }).join('')
      + '<div style="font-size:11px;color:var(--text-muted);margin-top:7px">Dalla scadenza più vecchia alla più recente.</div>'
      + '</div>';
  }

  // anticipi coinvolti + flag "comunicata alla banca"
  var antBox = document.getElementById('ec-inc-anticipi');
  if (!antBox) return;
  var coinvolti = dist.filter(function (d) { return d.quota > 0 && (_ecStato.anticipiPerFattura || {})[d.f.id]; });
  if (!coinvolti.length) { antBox.innerHTML = ''; return; }

  var diversa = coinvolti.filter(function (d) {
    var a = _ecStato.anticipiPerFattura[d.f.id];
    return a.istitutoId && bancaSel && a.istitutoId !== bancaSel;
  });
  var totAnt = coinvolti.reduce(function (a, d) {
    var an = _ecStato.anticipiPerFattura[d.f.id];
    return a + Math.min(Number(an.anticipato || 0), d.quota);
  }, 0);

  var h = '<div style="margin-top:10px;background:' + (diversa.length ? '#FFF1DC' : '#E6F1FB') + ';border-left:3px solid ' + (diversa.length ? '#E0A458' : '#378ADD') + ';border-radius:0 8px 8px 0;padding:10px 12px">';
  h += '<div style="font-size:12px;color:' + (diversa.length ? '#633806' : '#0C447C') + ';line-height:1.6">'
    + '<strong>' + coinvolti.length + (coinvolti.length === 1 ? ' fattura anticipata' : ' fatture anticipate') + '</strong> · rientro alla banca ' + _ecFmtDec(totAnt) + '</div>';
  if (diversa.length) {
    h += '<div style="font-size:11.5px;color:#8A4F06;margin-top:5px">L\'incasso è su un istituto diverso da quello che ha anticipato: la banca non può stornare da sola. Registro solo l\'entrata; il rientro lo gestisci dal Quadro anticipi.</div>';
    h += '<input type="hidden" id="ec-inc-comunicata" value="0">';
  } else {
    h += '<label style="display:flex;align-items:center;gap:8px;margin-top:7px;font-size:12px;color:#0C447C;cursor:pointer">'
      + '<input type="checkbox" id="ec-inc-comunicata" style="width:15px;height:15px;cursor:pointer">'
      + 'Comunicata alla banca — registra anche il rientro dell\'anticipo</label>'
      + '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Se non la spunti, l\'incasso entra tutto sul conto e l\'anticipo resta aperto: lo chiuderai dal Quadro anticipi quando la banca stornerà.</div>';
  }
  h += '</div>';
  antBox.innerHTML = h;
}

// ═══════════════════════════════════════════════════════════════════
// FIDO CLIENTE (27/07) — stessa regola dei fornitori, al contrario:
// l'esposizione RAGIONA SUGLI ORDINI, non solo sulle fatture. Una consegna
// gia fatta ma non ancora fatturata e' rischio a tutti gli effetti: se si
// aspetta la fattura per accorgersi dello sforamento, si e' gia consegnato.
//   esposizione = saldo residuo delle fatture aperte
//               + consegne non fatturate e non pagate (valorizzate IVA inc.)
// ═══════════════════════════════════════════════════════════════════
function _ecValoreOrdine(o) {
  var p = (Number(o.costo_litro || 0) + Number(o.trasporto_litro || 0) + Number(o.margine || 0));
  return p * Number(o.litri || 0) * (1 + Number(o.iva != null ? o.iva : 22) / 100);
}

function _ecEsposizioneCliente(clienteId) {
  var oggiIso = new Date().toISOString().split('T')[0];
  var fatt = (_ecStato.fatture || []).filter(function (f) {
    return f.cliente_id === clienteId && (f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale');
  });
  var fatturato = fatt.reduce(function (a, f) { return a + Number(f.saldo_residuo || 0); }, 0);
  var scaduto = fatt.filter(function (f) { return f.data_scadenza && f.data_scadenza < oggiIso; })
                    .reduce(function (a, f) { return a + Number(f.saldo_residuo || 0); }, 0);

  // consegne senza fattura: ne' fattura_id ne' riga fattura, non pagate
  var consegne = (_ecStato.ordini || []).filter(function (o) {
    return o.cliente_id === clienteId && o.stato === 'consegnato'
      && !o.fattura_id && !o.fattura_riga_id && !o.pagato;
  });
  var nonFatturato = consegne.reduce(function (a, o) { return a + _ecValoreOrdine(o); }, 0);

  return {
    fatturato: fatturato,
    nonFatturato: nonFatturato,
    totale: fatturato + nonFatturato,
    scaduto: scaduto,
    nConsegne: consegne.length,
    fattAperte: fatt
  };
}

function _ecBarraFido(cliente, esp) {
  var fido = Number(cliente.fido_massimo || 0);
  var h = '';

  if (!(fido > 0)) {
    h += '<div style="border:0.5px dashed var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px;background:#FAF8F2">'
      + '<div style="height:14px;border-radius:7px;background:#EDEAE1;margin-bottom:8px"></div>'
      + '<div style="font-size:12.5px;color:#666;line-height:1.6">Fido non impostato su questo cliente.<br>Esposizione attuale <strong style="font-family:var(--font-mono);color:#412402">' + _ecFmtDec(esp.totale) + '</strong></div>'
      + '</div>';
    return h;
  }

  var pct = Math.min(100, (esp.totale / fido) * 100);
  var pctFatt = Math.min(100, (esp.fatturato / fido) * 100);
  var pctCons = Math.max(0, Math.min(100 - pctFatt, (esp.nonFatturato / fido) * 100));
  var oltre = esp.totale > fido;
  var col = oltre ? '#C0392B' : (pct >= 85 ? '#E0A458' : '#639922');
  var colTratteggio = oltre ? 'repeating-linear-gradient(45deg,#C0392B,#C0392B 4px,#E06B5B 4px,#E06B5B 8px)'
                            : (pct >= 85 ? 'repeating-linear-gradient(45deg,#BA7517,#BA7517 4px,#E0A458 4px,#E0A458 8px)'
                                         : 'repeating-linear-gradient(45deg,#3B6D11,#3B6D11 4px,#639922 4px,#639922 8px)');

  h += '<div style="border:0.5px solid ' + (oltre ? '#E24B4A' : 'var(--border)') + ';border-radius:10px;padding:12px 14px;margin-bottom:14px;background:' + (oltre ? '#FCEBEB' : '#FAF8F2') + '">';
  h += '<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:5px">'
    + '<span style="color:#666">Fido utilizzato <strong style="color:' + col + '">' + Math.round((esp.totale / fido) * 100) + '%</strong></span>'
    + '<span style="font-family:var(--font-mono);font-weight:600">' + _ecFmtDec(esp.totale) + ' / ' + _ecFmtDec(fido) + '</span></div>';
  h += '<div style="display:flex;height:16px;border-radius:8px;overflow:hidden;background:#EDEAE1;margin-bottom:7px">'
    + '<div style="width:' + pctFatt.toFixed(1) + '%;background:' + col + '"></div>'
    + '<div style="width:' + pctCons.toFixed(1) + '%;background:' + colTratteggio + '"></div></div>';
  h += '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11.5px;color:#666;margin-bottom:12px">'
    + '<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + col + ';margin-right:5px"></span>Fatturato aperto <span style="font-family:var(--font-mono);color:#412402">' + _ecFmtDec(esp.fatturato) + '</span></span>'
    + '<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + colTratteggio + ';margin-right:5px"></span>Consegne non fatturate <span style="font-family:var(--font-mono);color:#412402">' + _ecFmtDec(esp.nonFatturato) + '</span>'
      + (esp.nConsegne ? ' <span style="color:#999">(' + esp.nConsegne + ')</span>' : '') + '</span>'
    + '</div>';

  h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding-top:11px;border-top:0.5px solid var(--border)">';
  if (oltre) {
    h += '<div><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px">Oltre fido di</div>'
      + '<div style="font-size:21px;font-weight:700;font-family:var(--font-mono);color:#A32D2D">' + _ecFmtDec(esp.totale - fido) + '</div>'
      + '<div style="font-size:11px;color:#A32D2D">consegne da fermare o incasso da chiedere</div></div>';
  } else {
    h += '<div><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px">Fido disponibile</div>'
      + '<div style="font-size:21px;font-weight:700;font-family:var(--font-mono);color:#3B6D11">' + _ecFmtDec(fido - esp.totale) + '</div></div>';
  }
  h += '<div><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px">Scaduto</div>'
    + '<div style="font-size:21px;font-weight:700;font-family:var(--font-mono);color:' + (esp.scaduto > 0 ? '#A32D2D' : '#888') + '">' + (esp.scaduto > 0 ? _ecFmtDec(esp.scaduto) : '—') + '</div></div>';

  var prossime = esp.fattAperte.filter(function (f) { return f.data_scadenza; })
    .sort(function (a, b) { return a.data_scadenza < b.data_scadenza ? -1 : 1; });
  var oggiIso = new Date().toISOString().split('T')[0];
  var pross = prossime.filter(function (f) { return f.data_scadenza >= oggiIso; })[0];
  h += '<div><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px">Prossima scadenza</div>'
    + '<div style="font-size:21px;font-weight:700;font-family:var(--font-mono)">' + (pross ? _ecFmtData(pross.data_scadenza).slice(0, 5) : '—') + '</div>'
    + (pross ? '<div style="font-size:11px;color:#666;font-family:var(--font-mono)">' + _ecFmtDec(pross.saldo_residuo) + '</div>' : '') + '</div>';
  h += '</div>';

  h += _ecTimelineScadenze(esp.fattAperte);
  h += '</div>';
  return h;
}

// Timeline delle scadenze: un pallino per fattura aperta, data sopra e
// importo sotto, dimensione proporzionale, rosso per lo scaduto.
function _ecTimelineScadenze(fattAperte) {
  var conScad = (fattAperte || []).filter(function (f) { return f.data_scadenza && Number(f.saldo_residuo) > 0; })
    .sort(function (a, b) { return a.data_scadenza < b.data_scadenza ? -1 : 1; });
  if (conScad.length < 2) return '';

  var oggiIso = new Date().toISOString().split('T')[0];
  var t0 = new Date(conScad[0].data_scadenza + 'T12:00:00').getTime();
  var t1 = new Date(conScad[conScad.length - 1].data_scadenza + 'T12:00:00').getTime();
  var span = Math.max(1, t1 - t0);
  var maxImp = conScad.reduce(function (m, f) { return Math.max(m, Number(f.saldo_residuo || 0)); }, 0) || 1;

  var h = '<div style="margin-top:14px;padding-top:12px;border-top:0.5px solid var(--border)">'
    + '<div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px;margin-bottom:22px">Scadenze delle sue fatture</div>'
    + '<div style="position:relative;height:58px;margin:0 14px">'
    + '<div style="position:absolute;top:27px;left:0;right:0;height:3px;background:#EDEAE1;border-radius:2px"></div>';

  conScad.forEach(function (f) {
    var t = new Date(f.data_scadenza + 'T12:00:00').getTime();
    var x = ((t - t0) / span) * 100;
    var scaduta = f.data_scadenza < oggiIso;
    var d = 9 + Math.round((Number(f.saldo_residuo || 0) / maxImp) * 7);
    h += '<div title="' + _ecEsc(f.numero || '') + ' · ' + _ecFmtDec(f.saldo_residuo) + '" style="position:absolute;left:' + x.toFixed(1) + '%;top:0;transform:translateX(-50%);text-align:center;white-space:nowrap">'
      + '<div style="font-size:10px;font-family:var(--font-mono);color:' + (scaduta ? '#A32D2D' : '#666') + ';margin-bottom:4px">' + _ecFmtData(f.data_scadenza).slice(0, 5) + '</div>'
      + '<div style="width:' + d + 'px;height:' + d + 'px;border-radius:50%;background:' + (scaduta ? '#E24B4A' : '#378ADD') + ';margin:0 auto;border:2px solid #FAF8F2"></div>'
      + '<div style="font-size:10px;font-family:var(--font-mono);color:' + (scaduta ? '#A32D2D' : '#412402') + ';margin-top:4px">' + _ecFmtImpKb(f.saldo_residuo) + '</div>'
      + '</div>';
  });
  h += '</div></div>';
  return h;
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
  // BARRA FIDO (27/07): esposizione = fatturato aperto + consegne non fatturate
  html += _ecBarraFido(cliente, _ecEsposizioneCliente(clienteId));

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

  // Grafico fatturato/litri 2 anni + Aging fatture aperte (2 colonne)
  // Patch v20260503s: filtro ordini per cliente + anno
  var inizioAnnoIso2 = anno + '-01-01';
  var fineAnnoIso2 = anno + '-12-31';
  var inizioAnnoPrecIso2 = (anno - 1) + '-01-01';
  var fineAnnoPrecIso2 = (anno - 1) + '-12-31';
  var ordiniCli = _ecStato.ordini.filter(function(o) { return o.cliente_id === clienteId; });
  var ordiniAnno = ordiniCli.filter(function(o) { return o.data >= inizioAnnoIso2 && o.data <= fineAnnoIso2; });
  var ordiniAnnoPrec = ordiniCli.filter(function(o) { return o.data >= inizioAnnoPrecIso2 && o.data <= fineAnnoPrecIso2; });

  html += '<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:14px;margin-bottom:14px">';
  html += _ecRenderGraficoFatturato(fattAnnoCli, fattAnnoPrecCli, anno, ordiniAnno, ordiniAnnoPrec);
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


function _ecRenderGraficoFatturato(fattAnno, fattAnnoPrec, anno, ordiniAnno, ordiniAnnoPrec) {
  // Patch v20260503s: salvo dataset in cache globale per re-render quando si cambia toggle
  ordiniAnno = ordiniAnno || [];
  ordiniAnnoPrec = ordiniAnnoPrec || [];
  window._ecGraficoCache = { fattAnno: fattAnno, fattAnnoPrec: fattAnnoPrec, ordiniAnno: ordiniAnno, ordiniAnnoPrec: ordiniAnnoPrec, anno: anno };

  var html = '<div style="background:#FAF8F2;padding:14px 16px;border-radius:6px;border:0.5px solid #e5e0d2">';
  // Header con toggle bottoni
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap">';
  html += '<div id="ec-grafico-titolo" style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600"></div>';
  html += '<div style="display:flex;gap:4px">';
  html += '<button id="ec-graf-btn-fatt" onclick="_ecSetVistaGrafico(\'fatturato\')" style="font-size:10px;padding:4px 10px;border:0.5px solid #185FA5;border-radius:4px;cursor:pointer;font-weight:600">€ Fatturato</button>';
  html += '<button id="ec-graf-btn-litri" onclick="_ecSetVistaGrafico(\'litri\')" style="font-size:10px;padding:4px 10px;border:0.5px solid #BA7517;border-radius:4px;cursor:pointer;font-weight:600">L Litri</button>';
  html += '</div></div>';
  // Container SVG che verrà popolato/rinfrescato dinamicamente
  html += '<div id="ec-grafico-svg-container"></div>';
  // Container legenda
  html += '<div id="ec-grafico-legenda" style="display:flex;gap:14px;margin-top:6px;font-size:10px;justify-content:center"></div>';
  html += '</div>';

  // Schedulo render iniziale dopo che il DOM è pronto
  setTimeout(function() { _ecRiprodurriGrafico(); }, 0);

  return html;
}

// Patch v20260503s: re-render del grafico in base a vista corrente (fatturato/litri)
function _ecRiprodurriGrafico() {
  var cache = window._ecGraficoCache;
  if (!cache) return;
  var contSvg = document.getElementById('ec-grafico-svg-container');
  var contTit = document.getElementById('ec-grafico-titolo');
  var contLeg = document.getElementById('ec-grafico-legenda');
  if (!contSvg || !contTit || !contLeg) return;

  var vista = _ecStato.vistaGrafico === 'litri' ? 'litri' : 'fatturato';
  // Aggiorna stato bottoni
  var btnF = document.getElementById('ec-graf-btn-fatt');
  var btnL = document.getElementById('ec-graf-btn-litri');
  if (btnF && btnL) {
    if (vista === 'fatturato') {
      btnF.style.background = '#185FA5'; btnF.style.color = 'white';
      btnL.style.background = 'transparent'; btnL.style.color = '#BA7517';
    } else {
      btnF.style.background = 'transparent'; btnF.style.color = '#185FA5';
      btnL.style.background = '#BA7517'; btnL.style.color = 'white';
    }
  }

  // Aggrega dati per mese
  var perMeseAnno = new Array(12).fill(0);
  var perMeseAnnoPrec = new Array(12).fill(0);
  if (vista === 'fatturato') {
    cache.fattAnno.forEach(function(f) { if (f.data) { var m = parseInt(f.data.substring(5, 7), 10) - 1; perMeseAnno[m] += Number(f.importo_totale || 0); } });
    cache.fattAnnoPrec.forEach(function(f) { if (f.data) { var m = parseInt(f.data.substring(5, 7), 10) - 1; perMeseAnnoPrec[m] += Number(f.importo_totale || 0); } });
    contTit.innerHTML = '📈 Fatturato mensile · ' + cache.anno + ' vs ' + (cache.anno - 1);
  } else {
    cache.ordiniAnno.forEach(function(o) { if (o.data) { var m = parseInt(o.data.substring(5, 7), 10) - 1; perMeseAnno[m] += Number(o.litri || 0); } });
    cache.ordiniAnnoPrec.forEach(function(o) { if (o.data) { var m = parseInt(o.data.substring(5, 7), 10) - 1; perMeseAnnoPrec[m] += Number(o.litri || 0); } });
    contTit.innerHTML = '🛢️ Litri ordinati mensili · ' + cache.anno + ' vs ' + (cache.anno - 1);
  }

  var maxVal = 0;
  for (var i = 0; i < 12; i++) maxVal = Math.max(maxVal, perMeseAnno[i], perMeseAnnoPrec[i]);
  if (maxVal <= 0) maxVal = 1;

  var w = 480, h = 160;
  var leftPad = 44, rightPad = 8, topPad = 20, bottomPad = 25;
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

  // Colori in base alla vista
  var colorPrec = vista === 'fatturato' ? '#888' : '#D3B675';
  var colorCur = vista === 'fatturato' ? '#185FA5' : '#BA7517';

  // Helper formatter Y-axis e tooltip
  function _fmtVal(v) {
    if (vista === 'fatturato') return _ecFmtImpKb(v);
    // Litri: con k se > 1000
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + 'k';
    return v.toFixed(0);
  }
  function _fmtTot(v) {
    if (vista === 'fatturato') return '€ ' + _ecFmt(v);
    return _ecFmt(v) + ' L';
  }
  function _fmtTooltipMese(meseLabel, valore) {
    if (vista === 'fatturato') return meseLabel + ': € ' + _ecFmt(valore);
    return meseLabel + ': ' + _ecFmt(valore) + ' L';
  }

  var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:160px">';
  svg += '<line x1="' + leftPad + '" y1="' + topPad + '" x2="' + leftPad + '" y2="' + (h - bottomPad) + '" stroke="#ccc" stroke-width="0.5"/>';
  svg += '<line x1="' + leftPad + '" y1="' + (h - bottomPad) + '" x2="' + (w - rightPad) + '" y2="' + (h - bottomPad) + '" stroke="#ccc" stroke-width="0.5"/>';

  for (var t = 0; t <= 4; t++) {
    var val = (maxVal / 4) * t;
    var y = (h - bottomPad) - (chartH * t / 4);
    svg += '<text x="' + (leftPad - 4) + '" y="' + (y + 3) + '" text-anchor="end" font-size="8" fill="#888">' + _fmtVal(val) + '</text>';
  }

  for (var m = 0; m < 12; m++) {
    var xBase = leftPad + (m * slotW) + spacing;
    var hPrec = (perMeseAnnoPrec[m] / maxVal) * chartH;
    if (hPrec > 0) {
      var yPrec = (h - bottomPad) - hPrec;
      svg += '<rect x="' + xBase.toFixed(1) + '" y="' + yPrec.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hPrec.toFixed(1) + '" fill="' + colorPrec + '" opacity="0.5" rx="1"><title>' + _fmtTooltipMese(_EC_MESI_FULL[m] + ' ' + (cache.anno - 1), perMeseAnnoPrec[m]) + '</title></rect>';
    }
    var hCur = (perMeseAnno[m] / maxVal) * chartH;
    if (hCur > 0) {
      var yCur = (h - bottomPad) - hCur;
      svg += '<rect x="' + (xBase + barW).toFixed(1) + '" y="' + yCur.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hCur.toFixed(1) + '" fill="' + colorCur + '" rx="1"><title>' + _fmtTooltipMese(_EC_MESI_FULL[m] + ' ' + cache.anno, perMeseAnno[m]) + '</title></rect>';
    }
    svg += '<text x="' + (xBase + barW).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="8" fill="#888">' + _EC_MESI[m] + '</text>';
  }
  svg += '</svg>';

  contSvg.innerHTML = svg;

  // Legenda
  var legHtml = '';
  legHtml += '<span><span style="display:inline-block;width:9px;height:9px;background:' + colorPrec + ';opacity:0.5;border-radius:1px;margin-right:4px"></span>' + (cache.anno - 1) + ' (' + _fmtTot(totAnnoPrec) + ')</span>';
  legHtml += '<span><span style="display:inline-block;width:9px;height:9px;background:' + colorCur + ';border-radius:1px;margin-right:4px"></span>' + cache.anno + ' (' + _fmtTot(totAnno) + ')' + deltaTxt + '</span>';
  contLeg.innerHTML = legHtml;
}

// Patch v20260503s: setter per cambio vista grafico (chiamato dai bottoni)
function _ecSetVistaGrafico(vista) {
  if (vista !== 'fatturato' && vista !== 'litri') return;
  _ecStato.vistaGrafico = vista;
  try { localStorage.setItem('pf-ec-vista-grafico', vista); } catch (e) {}
  _ecRiprodurriGrafico();
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
  var _nomeCli = (function () {
    var c = (_ecStato.clienti || []).filter(function (x) { return x.id === _ecStato.clienteSelezionato; })[0];
    return c ? (c.ragione_sociale || c.nome || '') : '';
  })();
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600">📋 Estratto conto fatture'
    + (_nomeCli ? ' · <span style="text-transform:none;color:#26215C;font-size:12px">' + _ecEsc(_nomeCli) + '</span>' : '')
    + ' (' + fattFilt.length + ' / ' + nTutte + ')</div>';
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
    html += '<th style="padding:6px 4px;width:26px;border-bottom:0.5px solid var(--border)"></th>';
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
      var ant = (_ecStato.anticipiPerFattura || {})[f.id] || null;
      html += '<tr style="border-bottom:0.5px solid var(--border);' + rowBg + (_ecSel[f.id] ? 'background:#E6F1FB;' : '') + '">';
      html += '<td style="padding:5px 4px;text-align:center">'
        + (isOpen ? '<input type="checkbox"' + (_ecSel[f.id] ? ' checked' : '') + ' onclick="_ecToggleFatt(\'' + f.id + '\',this)" style="width:15px;height:15px;cursor:pointer;accent-color:#185FA5">' : '')
        + '</td>';
      html += '<td style="padding:5px 9px;font-family:var(--font-mono);font-size:10px">' + _ecEsc(f.numero || '') + '/' + _ecEsc(String(f.anno || '')) + '</td>';
      html += '<td style="padding:5px 9px">' + _ecFmtData(f.data) + '</td>';
      html += '<td style="padding:5px 9px">' + _ecFmtData(f.data_scadenza)
        + (ant ? '<div style="font-size:9.5px;color:#0C447C;background:#E6F1FB;border-radius:8px;padding:1px 6px;display:inline-block;margin-top:2px">Anticipata · ' + _ecEsc(ant.istituto) + '</div>' : '')
        + '</td>';
      html += '<td style="padding:5px 9px;text-align:right;font-family:var(--font-mono)">' + _ecFmtDec(f.importo_totale) + '</td>';
      html += '<td style="padding:5px 9px;text-align:right;font-family:var(--font-mono);color:' + (Number(f.importo_incassato) > 0 ? '#27500A' : '#888') + '">' + (Number(f.importo_incassato) > 0 ? _ecFmtDec(f.importo_incassato) : '—') + '</td>';
      html += '<td style="padding:5px 9px;text-align:right;font-family:var(--font-mono);font-weight:' + (Number(f.saldo_residuo) > 0 ? '600' : 'normal') + ';color:' + (Number(f.saldo_residuo) > 0 ? (isScad ? '#791F1F' : '#412402') : '#888') + '">' + (Number(f.saldo_residuo) > 0 ? _ecFmtDec(f.saldo_residuo) : '—') + '</td>';
      html += '<td style="padding:5px 9px;text-align:center">' + _ecBadgeStato(f.stato_pagamento, isScad) + '</td>';
      html += '<td style="padding:5px 9px;text-align:center;font-weight:600;color:' + ggColor + '">' + ggDiff + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
  }
  html += _ecBoxSelezione(fattFilt);
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

  // KPI calcolati
  var fattAperte = fattCli.filter(function(f) { return f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale'; });
  var fattScad = fattAperte.filter(function(f) { return f.data_scadenza && f.data_scadenza < oggiIso; });
  var totAperto = fattAperte.reduce(function(s, f) { return s + Number(f.saldo_residuo || 0); }, 0);
  var totScad = fattScad.reduce(function(s, f) { return s + Number(f.saldo_residuo || 0); }, 0);
  var totFiltrato = fattFilt.reduce(function(s, f) { return s + Number(f.saldo_residuo || 0); }, 0);
  // Indice puntualità (semplificato): % fatture saldate non scadute / totale
  var fattAnnoCli = fattCli.filter(function(f) { var d = new Date(f.data); return d.getFullYear() === oggi.getFullYear(); });
  var nSaldate = fattAnnoCli.filter(function(f) { return f.stato_pagamento === 'saldata'; }).length;
  var puntualita = fattAnnoCli.length > 0 ? Math.round((nSaldate / fattAnnoCli.length) * 100) : null;
  // Ritardo medio fatture scadute (giorni)
  var ritardiScad = fattScad.map(function(f) {
    var d1 = new Date(f.data_scadenza), d2 = new Date(oggiIso);
    return Math.floor((d2 - d1) / 86400000);
  });
  var ritardoMedio = ritardiScad.length > 0 ? Math.round(ritardiScad.reduce(function(s,x){return s+x;},0) / ritardiScad.length) : 0;
  // Modalità pagamento
  var bancaCli = cliente.banca_accredito_id ? _ecStato.banche.find(function(b) { return b.id === cliente.banca_accredito_id; }) : null;
  var modPag = (cliente.modalita_pagamento || '').toString();
  var modPagLabel = ({ bonifico: 'Bonifico bancario', riba: 'RiBa', assegno: 'Assegno', contanti: 'Contanti' })[modPag] || (modPag ? modPag : 'Non specificata');

  var filtroLabel = ({ tutte: 'Tutte le fatture', aperte: 'Solo fatture aperte', scadute: 'Solo fatture scadute' })[filtro] || 'Tutte';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Estratto Conto — ' + _ecEsc(cliente.ragione_sociale || cliente.nome) + '</title>';
  html += '<style>';
  html += '@page { size: A4; margin: 14mm 14mm 12mm 14mm; }';
  html += '* { box-sizing: border-box; }';
  html += 'body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 9.5pt; margin: 0; line-height: 1.4; }';
  html += '.header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 2px solid #791F1F; margin-bottom: 14px; }';
  html += '.brand-name { font-size: 18pt; font-weight: 700; color: #791F1F; letter-spacing: 0.5px; line-height: 1.1; }';
  html += '.brand-sub { font-size: 8.5pt; color: #666; margin-top: 3px; }';
  html += '.brand-info { font-size: 7.5pt; color: #888; margin-top: 5px; line-height: 1.5; }';
  html += '.doc-label { font-size: 7.5pt; color: #888; text-transform: uppercase; letter-spacing: 0.8px; }';
  html += '.doc-tipo { font-size: 11pt; font-weight: 600; margin-top: 3px; color: #1a1a1a; }';
  html += '.doc-data { font-size: 8pt; color: #666; margin-top: 2px; }';
  html += '.cliente-box { background: #FAFAF7; border-left: 3px solid #791F1F; padding: 8px 12px; margin-bottom: 14px; border-radius: 0 3px 3px 0; }';
  html += '.cliente-label { font-size: 7.5pt; color: #888; text-transform: uppercase; letter-spacing: 0.8px; }';
  html += '.cliente-nome { font-size: 11pt; font-weight: 600; margin-top: 2px; }';
  html += '.cliente-info { font-size: 8pt; color: #555; margin-top: 2px; line-height: 1.5; }';
  html += '.kpi-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 14px; }';
  html += '.kpi { padding: 9px 11px; border-radius: 5px; }';
  html += '.kpi-rosso { background: #FCEBEB; }';
  html += '.kpi-rosso .kpi-l { color: #501313; }';
  html += '.kpi-rosso .kpi-v { color: #501313; }';
  html += '.kpi-rosso .kpi-s { color: #791F1F; }';
  html += '.kpi-giallo { background: #FAEEDA; }';
  html += '.kpi-giallo .kpi-l { color: #633806; }';
  html += '.kpi-giallo .kpi-v { color: #633806; }';
  html += '.kpi-giallo .kpi-s { color: #854F0B; }';
  html += '.kpi-verde { background: #EAF3DE; }';
  html += '.kpi-verde .kpi-l { color: #173404; }';
  html += '.kpi-verde .kpi-v { color: #173404; }';
  html += '.kpi-verde .kpi-s { color: #27500A; }';
  html += '.kpi-l { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5px; }';
  html += '.kpi-v { font-size: 16pt; font-weight: 600; margin-top: 3px; font-feature-settings: "tnum"; line-height: 1.1; }';
  html += '.kpi-s { font-size: 7.5pt; margin-top: 2px; }';
  html += '.section-h { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }';
  html += '.section-t { font-size: 10pt; font-weight: 600; }';
  html += '.section-c { font-size: 7.5pt; color: #888; }';
  html += 'table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }';
  html += 'th { background: #F5F2EA; border-bottom: 1px solid #ddd; padding: 6px 7px; text-align: left; font-weight: 600; color: #555; font-size: 8pt; }';
  html += 'td { padding: 5px 7px; border-bottom: 0.5px solid #eee; font-feature-settings: "tnum"; }';
  html += '.num { text-align: right; font-feature-settings: "tnum"; }';
  html += '.fmono { font-family: "SF Mono", Consolas, monospace; }';
  html += '.row-scaduta { background: #FFFAF2; }';
  html += '.row-saldo { color: #633806; font-weight: 600; }';
  html += '.tot-row { background: #791F1F; color: white; }';
  html += '.tot-row td { padding: 9px 7px; font-weight: 600; border: 0; }';
  html += '.tot-row .num { font-size: 12pt; }';
  html += '.badge { display: inline-block; padding: 2px 7px; border-radius: 8px; font-size: 7.5pt; font-weight: 500; }';
  html += '.badge-verde { background: #EAF3DE; color: #173404; }';
  html += '.badge-giallo { background: #FAEEDA; color: #633806; }';
  html += '.badge-grigio { background: #EEE; color: #555; }';
  html += '.footer-note { margin-top: 16px; padding: 9px 11px; background: #FAFAF7; border-radius: 4px; font-size: 7.5pt; color: #555; line-height: 1.6; }';
  html += '.footer-end { margin-top: 12px; padding-top: 8px; border-top: 0.5px solid #ddd; display: flex; justify-content: space-between; font-size: 7pt; color: #888; }';
  html += '.no-print { position: fixed; bottom: 20px; right: 20px; z-index: 9999; }';
  html += '@media print { .no-print { display: none !important; } }';
  html += '</style></head><body>';

  // HEADER
  html += '<div class="header">';
  html += '<div>';
  html += '<div class="brand-name">PHOENIX FUEL S.r.l.</div>';
  html += '<div class="brand-sub">Distribuzione carburanti · Vibo Valentia</div>';
  html += '<div class="brand-info">Sede legale: Vibo Valentia (VV)<br>info@phoenixfuel.it</div>';
  html += '</div>';
  html += '<div style="text-align:right">';
  html += '<div class="doc-label">Estratto Conto</div>';
  html += '<div class="doc-tipo">' + _ecEsc(filtroLabel) + '</div>';
  html += '<div class="doc-data">Emesso il ' + _ecFmtData(oggiIso) + '</div>';
  html += '</div>';
  html += '</div>';

  // CLIENTE BOX
  html += '<div class="cliente-box">';
  html += '<div class="cliente-label">Spett.le Cliente</div>';
  html += '<div class="cliente-nome">' + _ecEsc(cliente.ragione_sociale || cliente.nome || '—') + '</div>';
  html += '<div class="cliente-info">';
  if (cliente.piva) html += 'P.IVA ' + _ecEsc(cliente.piva);
  if (cliente.codice_fiscale && cliente.codice_fiscale !== cliente.piva) html += ' · CF ' + _ecEsc(cliente.codice_fiscale);
  html += '<br>Modalità pagamento: ' + _ecEsc(modPagLabel);
  if (bancaCli) html += ' · Banca accredito: ' + _ecEsc(bancaCli.nome);
  html += ' · Termine: ' + (cliente.giorni_pagamento || 60) + ' gg dalla data fattura';
  html += '</div>';
  html += '</div>';

  // KPI 3 CARDS
  html += '<div class="kpi-grid">';
  // Saldo aperto
  html += '<div class="kpi kpi-rosso">';
  html += '<div class="kpi-l">Saldo aperto</div>';
  html += '<div class="kpi-v">€ ' + _ecFmtDec(totAperto) + '</div>';
  html += '<div class="kpi-s">' + fattAperte.length + ' fatture aperte</div>';
  html += '</div>';
  // Scadute
  if (totScad > 0) {
    html += '<div class="kpi kpi-giallo">';
    html += '<div class="kpi-l">Scadute</div>';
    html += '<div class="kpi-v">€ ' + _ecFmtDec(totScad) + '</div>';
    html += '<div class="kpi-s">' + fattScad.length + ' fatture · ritardo medio ' + ritardoMedio + ' gg</div>';
    html += '</div>';
  } else {
    html += '<div class="kpi kpi-verde">';
    html += '<div class="kpi-l">Scadute</div>';
    html += '<div class="kpi-v">€ 0,00</div>';
    html += '<div class="kpi-s">Nessuna fattura scaduta</div>';
    html += '</div>';
  }
  // Indice puntualità
  if (puntualita !== null) {
    var classPunt = puntualita >= 80 ? 'kpi-verde' : (puntualita >= 60 ? 'kpi-giallo' : 'kpi-rosso');
    html += '<div class="kpi ' + classPunt + '">';
    html += '<div class="kpi-l">Indice puntualità</div>';
    html += '<div class="kpi-v">' + puntualita + '%</div>';
    html += '<div class="kpi-s">' + nSaldate + '/' + fattAnnoCli.length + ' fatture saldate ' + oggi.getFullYear() + '</div>';
    html += '</div>';
  } else {
    html += '<div class="kpi kpi-verde">';
    html += '<div class="kpi-l">Indice puntualità</div>';
    html += '<div class="kpi-v">—</div>';
    html += '<div class="kpi-s">Nessuna fattura ' + oggi.getFullYear() + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // SECTION HEADER
  html += '<div class="section-h">';
  html += '<div class="section-t">Dettaglio fatture · ' + _ecEsc(filtroLabel) + '</div>';
  html += '<div class="section-c">' + fattFilt.length + ' voci · al ' + _ecFmtData(oggiIso) + '</div>';
  html += '</div>';

  // TABELLA
  html += '<table>';
  html += '<thead><tr>';
  html += '<th>Numero</th><th>Data</th><th>Scadenza</th>';
  html += '<th class="num">Importo</th><th class="num">Incassato</th><th class="num">Saldo</th>';
  html += '<th style="text-align:center">Stato</th>';
  html += '</tr></thead><tbody>';

  fattFilt.forEach(function(f) {
    var isOpen = f.stato_pagamento === 'aperta' || f.stato_pagamento === 'parziale';
    var isScad = isOpen && f.data_scadenza && f.data_scadenza < oggiIso;
    var rowCls = isScad ? 'row-scaduta' : '';
    var giorni = 0;
    if (isScad) {
      var d1 = new Date(f.data_scadenza), d2 = new Date(oggiIso);
      giorni = Math.floor((d2 - d1) / 86400000);
    }
    var statoBadge = '';
    if (f.stato_pagamento === 'saldata') statoBadge = '<span class="badge badge-grigio">Pagata</span>';
    else if (isScad) statoBadge = '<span class="badge badge-giallo">Scaduta ' + giorni + 'gg</span>';
    else if (f.stato_pagamento === 'parziale') statoBadge = '<span class="badge badge-giallo">Parziale</span>';
    else statoBadge = '<span class="badge badge-verde">In termini</span>';

    html += '<tr class="' + rowCls + '">';
    html += '<td class="fmono">' + _ecEsc(f.numero || '') + '/' + _ecEsc(String(f.anno || '')) + '</td>';
    html += '<td>' + _ecFmtData(f.data) + '</td>';
    html += '<td>' + _ecFmtData(f.data_scadenza) + '</td>';
    html += '<td class="num">€ ' + _ecFmtDec(f.importo_totale) + '</td>';
    html += '<td class="num">' + (Number(f.importo_incassato) > 0 ? '€ ' + _ecFmtDec(f.importo_incassato) : '<span style="color:#888">—</span>') + '</td>';
    var saldoCls = (isScad && Number(f.saldo_residuo) > 0) ? 'num row-saldo' : 'num';
    html += '<td class="' + saldoCls + '">' + (Number(f.saldo_residuo) > 0 ? '€ ' + _ecFmtDec(f.saldo_residuo) : '<span style="color:#888">—</span>') + '</td>';
    html += '<td style="text-align:center">' + statoBadge + '</td>';
    html += '</tr>';
  });

  // RIGA TOTALE COLORATA
  html += '<tr class="tot-row">';
  html += '<td colspan="5">SALDO TOTALE ' + _ecEsc(filtroLabel.toUpperCase()) + ' AL ' + _ecFmtData(oggiIso) + '</td>';
  html += '<td class="num">€ ' + _ecFmtDec(totFiltrato) + '</td>';
  html += '<td></td>';
  html += '</tr>';
  html += '</tbody></table>';

  // FOOTER NOTE PAGAMENTO
  html += '<div class="footer-note">';
  html += '<strong>Modalità di pagamento:</strong> ';
  if (modPag === 'bonifico' && bancaCli) {
    html += 'bonifico bancario su ' + _ecEsc(bancaCli.nome) + ', intestato a Phoenix Fuel S.r.l. Si prega di indicare nella causale i numeri delle fatture saldate. ';
  } else if (modPag === 'riba') {
    html += 'pagamento mediante RiBa presso ' + (bancaCli ? _ecEsc(bancaCli.nome) : 'banca concordata') + '. ';
  } else if (modPag === 'assegno') {
    html += 'assegno bancario intestato a Phoenix Fuel S.r.l. ';
  } else if (modPag === 'contanti') {
    html += 'pagamento in contanti presso la sede. ';
  }
  html += 'Per quesiti su questo estratto conto, contattare amministrazione@phoenixfuel.it';
  html += '</div>';

  // FOOTER FINALE
  html += '<div class="footer-end">';
  html += '<span>Phoenix Fuel S.r.l. · Documento riservato</span>';
  html += '<span>Generato ' + _ecFmtData(oggiIso) + ' ' + String(oggi.getHours()).padStart(2,'0') + ':' + String(oggi.getMinutes()).padStart(2,'0') + '</span>';
  html += '</div>';

  // BOTTONI no-print
  html += '<div class="no-print"><button onclick="window.print()" style="padding:8px 16px;margin:0 4px;background:#185FA5;color:white;border:0;border-radius:6px;cursor:pointer;font-size:11pt">🖨️ Stampa</button>';
  html += '<button onclick="window.close()" style="padding:8px 16px;margin:0 4px;background:#A32D2D;color:white;border:0;border-radius:6px;cursor:pointer;font-size:11pt">✕ Chiudi</button></div>';
  html += '<script>window.onload=function(){setTimeout(function(){window.print()},500)}</' + 'script>';
  html += '</body></html>';

  var w = window.open('', '_blank', 'width=900,height=1100');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

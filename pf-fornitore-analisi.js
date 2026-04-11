// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Analisi fornitori
// Modulo dedicato all'analisi avanzata di uno o più fornitori:
// • Scheda singolo fornitore: KPI + acquisti per mese per prodotto +
//   distribuzione basi + prezzi medi per prodotto × base + scadenze
// • Confronto multi-fornitore: KPI affiancati + grafico a linee mensile
//   + tabella prezzi medi SOLO su basi comuni (trasporto eliminato
//   dalla differenza) + distribuzione prodotti affiancata
// Non tocca apriSchedaFornitore esistente.
// ═══════════════════════════════════════════════════════════════════

// Colori fornitore coerenti (fallback se il fornitore non ha colore proprio)
var _afColoriFallback = ['#D4A017','#378ADD','#639922','#6B5FCC','#BA7517','#D85A30','#1D9E75','#C0392B'];
var _afChartsAttivi = []; // per distruggere i chart prima di rerender

function _afColoreFornitore(nome, idx, fornitori) {
  var f = (fornitori||[]).find(function(x){ return x.nome === nome; });
  if (f && f.colore) return f.colore;
  return _afColoriFallback[idx % _afColoriFallback.length];
}

function _afDistruggiCharts() {
  _afChartsAttivi.forEach(function(c) { try { c.destroy(); } catch(e) {} });
  _afChartsAttivi = [];
}

function _afMese(data) {
  return String(data).substring(0,7); // YYYY-MM
}

function _afFormattaMese(yyyymm) {
  var MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  var p = yyyymm.split('-');
  return MESI[parseInt(p[1])-1] + ' ' + p[0].substring(2);
}

// ─── APERTURA MODALE SELEZIONE ─────────────────────────────────────
async function apriAnalisiFornitore() {
  var annoCor = new Date().getFullYear();
  var inizioAnno = annoCor + '-01-01';
  var oggiStr = new Date().toISOString().split('T')[0];

  // Carica fornitori attivi con statistiche rapide
  var { data: fornitori } = await sb.from('fornitori').select('id,nome,colore,attivo').eq('attivo', true).order('nome');
  if (!fornitori || !fornitori.length) { toast('Nessun fornitore attivo'); return; }

  // Carica ordini per calcolare KPI rapidi (dall'inizio anno)
  var { data: ordini } = await sb.from('ordini')
    .select('fornitore,litri,costo_litro,trasporto_litro')
    .eq('tipo_ordine','entrata_deposito')
    .neq('stato','annullato')
    .gte('data', inizioAnno);

  // Aggrega per fornitore
  var stats = {};
  (ordini||[]).forEach(function(o) {
    if (!stats[o.fornitore]) stats[o.fornitore] = { ordini: 0, litri: 0, importo: 0 };
    stats[o.fornitore].ordini++;
    stats[o.fornitore].litri += Number(o.litri||0);
    stats[o.fornitore].importo += (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri||0);
  });

  var h = '<div style="font-size:17px;font-weight:600;margin-bottom:6px">📊 Analisi fornitori</div>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Seleziona uno o più fornitori per aprire la scheda di analisi. Con 2+ fornitori si attiva la modalità confronto.</div>';

  h += '<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">';
  h += '<div class="form-group" style="margin:0"><label>Dal</label><input type="date" id="af-dal" value="' + inizioAnno + '" style="font-size:13px;padding:6px 10px" /></div>';
  h += '<div class="form-group" style="margin:0"><label>Al</label><input type="date" id="af-al" value="' + oggiStr + '" style="font-size:13px;padding:6px 10px" /></div>';
  h += '</div>';

  h += '<div style="max-height:340px;overflow-y:auto;border:0.5px solid var(--border);border-radius:8px;padding:8px;margin-bottom:14px">';
  fornitori.forEach(function(f) {
    var s = stats[f.nome] || { ordini: 0, litri: 0, importo: 0 };
    var col = f.colore || '#888';
    var isDisabled = s.ordini === 0;
    var bg = isDisabled ? 'opacity:0.45' : '';
    h += '<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:0.5px solid var(--border);cursor:pointer;' + bg + '">';
    h += '<input type="checkbox" class="af-chk" value="' + esc(f.nome) + '" ' + (isDisabled?'disabled':'') + ' />';
    h += '<div style="width:12px;height:12px;border-radius:50%;background:' + col + ';flex-shrink:0"></div>';
    h += '<div style="flex:1"><div style="font-weight:500;font-size:13px">' + esc(f.nome) + '</div>';
    if (s.ordini > 0) {
      h += '<div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">' + s.ordini + ' ordini · ' + fmtL(s.litri) + ' · ' + fmtE(s.importo) + '</div>';
    } else {
      h += '<div style="font-size:11px;color:var(--text-muted)">nessun acquisto nel periodo</div>';
    }
    h += '</div></label>';
  });
  h += '</div>';

  h += '<div style="display:flex;gap:8px">';
  h += '<button class="btn-primary" style="flex:1;background:#639922" onclick="_afGeneraDaModale()">📊 Genera analisi</button>';
  h += '<button onclick="chiudiModalePermessi()" style="padding:10px 18px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer">Annulla</button>';
  h += '</div>';

  apriModal(h);
}

function _afGeneraDaModale() {
  var checks = document.querySelectorAll('.af-chk:checked');
  if (!checks.length) { toast('Seleziona almeno un fornitore'); return; }
  var nomi = Array.from(checks).map(function(c){ return c.value; });
  var dal = document.getElementById('af-dal').value;
  var al = document.getElementById('af-al').value;
  chiudiModalePermessi();
  generaAnalisiFornitore(nomi, dal, al);
}

// ─── GENERAZIONE ANALISI (singolo o confronto) ─────────────────────
async function generaAnalisiFornitore(nomiFornitori, dal, al) {
  _afDistruggiCharts();
  var w = _apriReport('Analisi fornitori'); if (!w) return;

  // Carica dati comuni
  var [fornRes, ordRes, basiRes] = await Promise.all([
    sb.from('fornitori').select('*').in('nome', nomiFornitori),
    sb.from('ordini').select('id,data,fornitore,prodotto,litri,costo_litro,trasporto_litro,base_carico_id,stato,giorni_pagamento,pagato_fornitore,data_pagamento_fornitore,tipo_ordine').in('fornitore', nomiFornitori).eq('tipo_ordine','entrata_deposito').neq('stato','annullato').gte('data', dal).lte('data', al).order('data'),
    sb.from('basi_carico').select('id,nome,citta')
  ]);

  var fornitori = fornRes.data || [];
  var ordini = ordRes.data || [];
  var basi = basiRes.data || [];
  var basiMap = {};
  basi.forEach(function(b) { basiMap[b.id] = b; });

  // Scrivi l'HTML iniziale della nuova finestra (SOLO struttura, NO script inline)
  var titolo = nomiFornitori.length === 1 
    ? 'Analisi fornitore — ' + nomiFornitori[0]
    : 'Confronto fornitori — ' + nomiFornitori.join(' vs ');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + _esc(titolo) + '</title>';
  html += '<style>';
  html += 'body{font-family:Arial,sans-serif;font-size:12px;margin:0;padding:16mm;color:#1a1a18;background:#fafaf5}';
  html += '@media print{@page{size:portrait;margin:10mm}.no-print{display:none!important}.section{page-break-inside:avoid}}';
  html += '.card{background:#fff;border:0.5px solid #e0ded5;border-radius:10px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04)}';
  html += '.card-title{font-size:13px;font-weight:600;color:#D4A017;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;border-bottom:2px solid #D4A017;padding-bottom:6px}';
  html += 'table{width:100%;border-collapse:collapse;font-size:11px}';
  html += 'th{padding:8px 10px;background:#f5f4ef;text-transform:uppercase;font-size:9px;letter-spacing:0.3px;text-align:left;border-bottom:1px solid #ddd}';
  html += 'td{padding:7px 10px;border-bottom:0.5px solid #eee}';
  html += '.m{font-family:Courier New,monospace;text-align:right}';
  html += '.kpi{background:#fff;border-radius:8px;padding:12px 16px;border-left:4px solid #D4A017;flex:1;min-width:140px}';
  html += '.kpi-label{font-size:9px;text-transform:uppercase;color:#888;letter-spacing:0.5px;margin-bottom:4px}';
  html += '.kpi-value{font-size:18px;font-weight:bold;font-family:Courier New,monospace}';
  html += '.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600}';
  html += '</style></head><body>';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #D4A017;padding-bottom:10px;margin-bottom:16px">';
  html += '<div><div style="font-size:22px;font-weight:bold;color:#D4A017">' + (nomiFornitori.length===1?'ANALISI FORNITORE':'CONFRONTO FORNITORI') + '</div>';
  html += '<div style="font-size:14px;color:#333;margin-top:4px;font-weight:500">' + _esc(nomiFornitori.join(' · ')) + '</div>';
  html += '<div style="font-size:10px;color:#888;margin-top:2px">Periodo: ' + fmtD(dal) + ' → ' + fmtD(al) + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:9px;color:#666">Stampato: ' + new Date().toLocaleDateString('it-IT') + ' ' + new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) + '</div></div></div>';

  if (!ordini.length) {
    html += '<div class="card"><div style="text-align:center;padding:30px;color:#888">Nessun ordine di acquisto trovato nel periodo selezionato.</div></div>';
    html += '</body></html>';
    w.document.open(); w.document.write(html); w.document.close();
    return;
  }

  if (nomiFornitori.length === 1) {
    html += _afRenderSingolo(nomiFornitori[0], fornitori[0] || {}, ordini, basiMap);
  } else {
    html += _afRenderConfronto(nomiFornitori, fornitori, ordini, basiMap);
  }

  // Footer + bottoni
  html += '<div style="margin-top:20px;font-size:9px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:8px">Phoenix Fuel SRL · Analisi interna fornitori · Dati estratti da gestionale PhoenixFuel</div>';
  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D4A017;color:#fff">🖨️ Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div>';
  html += '</body></html>';

  // Step 1: scrivi solo l'HTML statico (senza script Chart.js né rendering)
  w.document.open();
  w.document.write(html);
  w.document.close();

  // Step 2: prepara i dati e la funzione di rendering nella finestra figlio
  // SENZA passare per JSON.stringify dentro un <script> HTML (evita corruption)
  w._afData = _afPreparaDati(nomiFornitori, fornitori, ordini, basiMap);
  w._afRenderCharts = _afRenderChartsFn();

  // Step 3: carica Chart.js dinamicamente nella finestra figlio
  // (niente document.write, niente parser HTML, usa le DOM API)
  var script = w.document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4';
  script.onload = function() {
    try {
      w._afRenderCharts(w);
    } catch(e) {
      console.error('Errore rendering grafici:', e);
    }
  };
  script.onerror = function() {
    console.error('Impossibile caricare Chart.js dal CDN');
  };
  w.document.head.appendChild(script);
}

// ─── RENDER SINGOLO FORNITORE ──────────────────────────────────────
function _afRenderSingolo(nome, fornitore, ordini, basiMap) {
  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var ggPagDefault = Number(fornitore.giorni_pagamento || 30);

  var tot = { litri: 0, importo: 0, ordini: ordini.length };
  ordini.forEach(function(o) {
    tot.litri += Number(o.litri||0);
    tot.importo += (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri||0);
  });

  // Aggrega per prodotto
  var perProdotto = {};
  ordini.forEach(function(o) {
    var p = o.prodotto;
    if (!perProdotto[p]) perProdotto[p] = { litri: 0, importo: 0, ordini: 0 };
    perProdotto[p].litri += Number(o.litri||0);
    perProdotto[p].importo += (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri||0);
    perProdotto[p].ordini++;
  });

  // Aggrega per base di carico
  var perBase = {};
  ordini.forEach(function(o) {
    var bKey = o.base_carico_id ? (basiMap[o.base_carico_id] ? basiMap[o.base_carico_id].nome : 'Base sconosciuta') : 'Senza base';
    if (!perBase[bKey]) perBase[bKey] = { litri: 0, importo: 0, ordini: 0 };
    perBase[bKey].litri += Number(o.litri||0);
    perBase[bKey].importo += (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri||0);
    perBase[bKey].ordini++;
  });

  // Fido segmentato per fascia di scadenza
  // OPZIONE A: scadute considerate come pagate (stessa logica di caricaFornitori in pf-anagrafica.js)
  // SOLO LETTURA: nessun UPDATE al DB. La scheda 📋 fa l'auto-pagamento, qui replichiamo solo la regola di calcolo.
  var fidoMax = Number(fornitore.fido_massimo||0) || Number(fornitore.fido||0);
  var segmenti = { f0_15: 0, f16_30: 0, f31_45: 0, f46p: 0 };
  var fidoUsato = 0;
  var nonPagatiOrdini = []; // solo non pagati e non scaduti
  ordini.forEach(function(o) {
    if (o.pagato_fornitore) return;
    var ggOrdine = Number(o.giorni_pagamento || ggPagDefault);
    var scad = new Date(o.data); scad.setDate(scad.getDate() + ggOrdine);
    var ggResidui = Math.floor((scad - oggi) / 86400000);
    // Scaduta = considerata pagata (Opzione A): salta dal calcolo fido
    if (ggResidui < 0) return;
    var imp = (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri||0);
    fidoUsato += imp;
    nonPagatiOrdini.push({ ordine: o, scadenza: scad, ggResidui: ggResidui, importo: imp });
    if (ggResidui <= 15) segmenti.f0_15 += imp;
    else if (ggResidui <= 30) segmenti.f16_30 += imp;
    else if (ggResidui <= 45) segmenti.f31_45 += imp;
    else segmenti.f46p += imp;
  });
  var fidoResiduo = fidoMax > 0 ? fidoMax - fidoUsato : 0;
  var pctFido = fidoMax > 0 ? Math.round((fidoUsato / fidoMax) * 100) : 0;

  // Puntualità pagamenti (solo ordini pagati con data_pagamento_fornitore)
  var pagamenti = [];
  ordini.forEach(function(o) {
    if (!o.pagato_fornitore || !o.data_pagamento_fornitore) return;
    var ggOrdine = Number(o.giorni_pagamento || ggPagDefault);
    var scad = new Date(o.data); scad.setDate(scad.getDate() + ggOrdine);
    var dataPag = new Date(o.data_pagamento_fornitore);
    var delta = Math.floor((dataPag - scad) / 86400000); // negativo=anticipo, positivo=ritardo
    var imp = (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri||0);
    pagamenti.push({ ordine: o, scadenza: scad, dataPag: dataPag, delta: delta, importo: imp, ggContratto: ggOrdine });
  });
  var statsPag = null;
  if (pagamenti.length > 0) {
    var sommaDelta = 0, anticipi = 0, ritardi = 0, puntuali = 0, maxRitardo = 0;
    pagamenti.forEach(function(p) {
      sommaDelta += p.delta;
      if (p.delta < 0) anticipi++;
      else if (p.delta > 0) { ritardi++; if (p.delta > maxRitardo) maxRitardo = p.delta; }
      else puntuali++;
    });
    statsPag = {
      n: pagamenti.length,
      mediaDelta: sommaDelta / pagamenti.length,
      anticipi: anticipi,
      ritardi: ritardi,
      puntuali: puntuali,
      maxRitardo: maxRitardo,
      pctPuntuali: Math.round(((anticipi + puntuali) / pagamenti.length) * 100)
    };
  }

  // Quota su totale acquisti (% di questo fornitore sul totale acquisti del periodo)
  // Calcoliamo lato server? No, qui non ho i dati totali. La metto come "ticket medio" e basta.
  var ticketMedio = tot.ordini > 0 ? tot.importo / tot.ordini : 0;
  var litriMedi = tot.ordini > 0 ? tot.litri / tot.ordini : 0;

  // Calcola mesi attivi per derivare "media mensile"
  var mesiSet = new Set();
  ordini.forEach(function(o) { mesiSet.add(_afMese(o.data)); });
  var nMesi = mesiSet.size || 1;
  var mediaMensileLitri = tot.litri / nMesi;
  var mediaMensileImporto = tot.importo / nMesi;

  var h = '';

  // ── KPI HEADER ────────────────────────────────────────────────
  h += '<div class="card section"><div class="card-title">📊 Indicatori chiave</div>';
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
  h += '<div class="kpi"><div class="kpi-label">Ordini</div><div class="kpi-value">' + tot.ordini + '</div></div>';
  h += '<div class="kpi"><div class="kpi-label">Litri totali</div><div class="kpi-value">' + fmtL(tot.litri) + '</div></div>';
  h += '<div class="kpi"><div class="kpi-label">Importo totale</div><div class="kpi-value">' + fmtE(tot.importo) + '</div></div>';
  h += '<div class="kpi"><div class="kpi-label">Ticket medio</div><div class="kpi-value">' + fmtE(ticketMedio) + '</div></div>';
  h += '</div></div>';

  // ── BARRA FIDO SEGMENTATA ─────────────────────────────────────
  if (fidoMax > 0) {
    var fidoColor = pctFido >= 90 ? '#A32D2D' : pctFido >= 60 ? '#BA7517' : '#639922';
    h += '<div class="card section"><div class="card-title">💳 Fido fornitore</div>';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:12px">';
    h += '<div><div style="font-size:10px;color:#888;text-transform:uppercase">Fido massimo</div><div style="font-family:Courier New,monospace;font-size:18px;font-weight:bold">' + fmtE(fidoMax) + '</div></div>';
    h += '<div><div style="font-size:10px;color:#888;text-transform:uppercase">Esposizione</div><div style="font-family:Courier New,monospace;font-size:18px;font-weight:bold;color:' + fidoColor + '">' + fmtE(fidoUsato) + ' <span style="font-size:11px">(' + pctFido + '%)</span></div></div>';
    h += '<div><div style="font-size:10px;color:#888;text-transform:uppercase">Disponibile</div><div style="font-family:Courier New,monospace;font-size:18px;font-weight:bold;color:#639922">' + fmtE(fidoResiduo) + '</div></div>';
    h += '<div><div style="font-size:10px;color:#888;text-transform:uppercase">Termini</div><div style="font-family:Courier New,monospace;font-size:14px;font-weight:600">' + ggPagDefault + ' giorni</div></div>';
    h += '</div>';

    // Barra principale: usato vs disponibile
    h += '<div style="height:22px;width:100%;background:#eee;border-radius:6px;overflow:hidden;margin-bottom:14px;display:flex">';
    h += '<div style="height:100%;width:' + Math.min(100,pctFido) + '%;background:' + fidoColor + ';display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:600">' + (pctFido >= 15 ? fmtE(fidoUsato) + ' impegnato' : '') + '</div>';
    if (pctFido < 100) {
      h += '<div style="height:100%;flex:1;display:flex;align-items:center;justify-content:center;color:#27500A;font-size:10px;font-weight:600">' + ((100-pctFido) >= 15 ? fmtE(fidoResiduo) + ' disponibile' : '') + '</div>';
    }
    h += '</div>';

    // Barra segmentata per scadenza (solo se c'è esposizione)
    if (fidoUsato > 0) {
      h += '<div style="font-size:11px;color:#666;margin-bottom:6px;font-weight:600">Suddivisione esposizione per fascia di scadenza:</div>';
      h += '<div style="height:18px;width:100%;background:#f5f4ef;border-radius:6px;overflow:hidden;display:flex">';
      var segCols = [
        { key: 'f0_15', label: '0-15gg', color: '#D85A30' },
        { key: 'f16_30', label: '16-30gg', color: '#BA7517' },
        { key: 'f31_45', label: '31-45gg', color: '#D4A017' },
        { key: 'f46p', label: 'oltre 45gg', color: '#639922' }
      ];
      segCols.forEach(function(s) {
        var v = segmenti[s.key];
        if (v > 0) {
          var pct = (v / fidoUsato) * 100;
          h += '<div title="' + s.label + ': ' + fmtE(v) + '" style="height:100%;width:' + pct + '%;background:' + s.color + ';display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:600">' + (pct >= 8 ? Math.round(pct) + '%' : '') + '</div>';
        }
      });
      h += '</div>';
      h += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:10px">';
      segCols.forEach(function(s) {
        var v = segmenti[s.key];
        if (v > 0) {
          h += '<div style="display:flex;align-items:center;gap:4px"><div style="width:10px;height:10px;background:' + s.color + ';border-radius:2px"></div><span>' + s.label + ': <strong>' + fmtE(v) + '</strong></span></div>';
        }
      });
      h += '</div>';
    }
    h += '</div>';
  }

  // ── GRAFICO ACQUISTI MENSILI PER PRODOTTO ────────────────────
  h += '<div class="card section"><div class="card-title">📈 Acquisti per mese e prodotto</div>';
  h += '<div style="height:280px;position:relative"><canvas id="af-chart-mese-prod"></canvas></div></div>';

  // ── DISTRIBUZIONE PRODOTTI ────────────────────────────────────
  h += '<div class="card section"><div class="card-title">🎯 Distribuzione per prodotto</div>';
  h += '<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">';
  h += '<div style="width:220px;height:220px;flex-shrink:0"><canvas id="af-chart-prodotti"></canvas></div>';
  h += '<div style="flex:1;min-width:260px"><table>';
  h += '<thead><tr><th>Prodotto</th><th class="m">Litri</th><th class="m">Importo</th><th class="m">%</th></tr></thead><tbody>';
  Object.keys(perProdotto).sort(function(a,b){ return perProdotto[b].litri - perProdotto[a].litri; }).forEach(function(p) {
    var d = perProdotto[p];
    var pct = tot.litri > 0 ? (d.litri / tot.litri * 100) : 0;
    h += '<tr><td><strong>' + _esc(p) + '</strong></td><td class="m">' + fmtL(d.litri) + '</td><td class="m">' + fmtE(d.importo) + '</td><td class="m">' + pct.toFixed(1) + '%</td></tr>';
  });
  h += '</tbody></table></div></div></div>';

  // ── ACQUISTI PER BASE DI CARICO ───────────────────────────────
  h += '<div class="card section"><div class="card-title">📍 Acquisti per base di carico</div>';
  h += '<table><thead><tr><th>Base</th><th class="m">Ordini</th><th class="m">Litri</th><th class="m">Importo</th><th class="m">Litri/ordine</th></tr></thead><tbody>';
  Object.keys(perBase).sort(function(a,b){ return perBase[b].litri - perBase[a].litri; }).forEach(function(b) {
    var d = perBase[b];
    h += '<tr><td><strong>' + _esc(b) + '</strong></td><td class="m">' + d.ordini + '</td><td class="m">' + fmtL(d.litri) + '</td><td class="m">' + fmtE(d.importo) + '</td><td class="m">' + fmtL(d.litri/d.ordini) + '</td></tr>';
  });
  h += '</tbody></table></div>';

  // ── PUNTUALITÀ PAGAMENTI ──────────────────────────────────────
  h += '<div class="card section"><div class="card-title">⏱ Puntualità pagamenti</div>';
  if (statsPag) {
    var deltaCol = statsPag.mediaDelta < -1 ? '#639922' : statsPag.mediaDelta > 1 ? '#A32D2D' : '#BA7517';
    var deltaSegno = statsPag.mediaDelta > 0 ? '+' : '';
    var deltaTesto = statsPag.mediaDelta < -1 ? 'in anticipo' : statsPag.mediaDelta > 1 ? 'in ritardo' : 'puntuale';
    var deltaIcon = statsPag.mediaDelta < -1 ? '🟢' : statsPag.mediaDelta > 1 ? '🔴' : '🟡';
    h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">';
    h += '<div class="kpi" style="border-left-color:' + deltaCol + '"><div class="kpi-label">Media delta</div><div class="kpi-value" style="color:' + deltaCol + '">' + deltaIcon + ' ' + deltaSegno + statsPag.mediaDelta.toFixed(1) + ' gg</div><div style="font-size:9px;color:#888;margin-top:2px">' + deltaTesto + ' vs scadenza</div></div>';
    h += '<div class="kpi"><div class="kpi-label">Pagate puntuali</div><div class="kpi-value">' + statsPag.pctPuntuali + '%</div><div style="font-size:9px;color:#888;margin-top:2px">' + (statsPag.anticipi + statsPag.puntuali) + ' su ' + statsPag.n + '</div></div>';
    h += '<div class="kpi"><div class="kpi-label">In ritardo</div><div class="kpi-value">' + statsPag.ritardi + '</div><div style="font-size:9px;color:#888;margin-top:2px">max ' + statsPag.maxRitardo + ' gg</div></div>';
    h += '<div class="kpi"><div class="kpi-label">Campione</div><div class="kpi-value">' + statsPag.n + '</div><div style="font-size:9px;color:#888;margin-top:2px">fatture pagate</div></div>';
    h += '</div>';

    // Tabella ultime 10 fatture pagate
    h += '<div style="font-size:11px;font-weight:600;color:#666;margin-bottom:6px">Ultime fatture pagate (10 più recenti):</div>';
    h += '<table><thead><tr><th>Data ord.</th><th>Prodotto</th><th class="m">Litri</th><th class="m">Importo</th><th>Scad.</th><th>Pagata il</th><th class="m">Delta gg</th></tr></thead><tbody>';
    pagamenti.sort(function(a,b){ return b.dataPag - a.dataPag; }).slice(0,10).forEach(function(p) {
      var col = p.delta < 0 ? '#639922' : p.delta > 0 ? '#A32D2D' : '#666';
      var segno = p.delta > 0 ? '+' : '';
      h += '<tr>';
      h += '<td>' + fmtD(p.ordine.data) + '</td>';
      h += '<td style="font-size:10px">' + _esc(p.ordine.prodotto) + '</td>';
      h += '<td class="m">' + fmtL(p.ordine.litri) + '</td>';
      h += '<td class="m">' + fmtE(p.importo) + '</td>';
      h += '<td>' + fmtD(p.scadenza.toISOString().split('T')[0]) + '</td>';
      h += '<td>' + fmtD(p.dataPag.toISOString().split('T')[0]) + '</td>';
      h += '<td class="m" style="color:' + col + ';font-weight:700">' + segno + p.delta + ' gg</td>';
      h += '</tr>';
    });
    h += '</tbody></table>';
  } else {
    h += '<div style="padding:16px;text-align:center;color:#888;background:#f5f4ef;border-radius:8px;font-size:11px">Nessuna fattura pagata con data effettiva nel periodo selezionato.<br>Per vedere la puntualità abilita il flag "pagato" e inserisci la data di pagamento sugli ordini.</div>';
  }
  h += '</div>';

  // ── PROSSIME SCADENZE ─────────────────────────────────────────
  h += '<div class="card section"><div class="card-title">🗓 Prossime scadenze</div>';
  if (nonPagatiOrdini.length === 0) {
    h += '<div style="padding:16px;text-align:center;color:#639922;background:#EAF3DE;border-radius:8px;font-size:12px;font-weight:600">✅ Nessuna fattura aperta. Tutto pagato.</div>';
  } else {
    nonPagatiOrdini.sort(function(a,b){ return a.scadenza - b.scadenza; });
    h += '<table><thead><tr><th>Data ord.</th><th>Prodotto</th><th class="m">Litri</th><th class="m">Importo</th><th>Scadenza</th><th class="m">Giorni</th><th>Stato</th></tr></thead><tbody>';
    nonPagatiOrdini.slice(0,15).forEach(function(p) {
      var sem, col, label;
      if (p.ggResidui <= 7) { sem = '🟠'; col = '#D85A30'; label = 'critica'; }
      else if (p.ggResidui <= 15) { sem = '🟡'; col = '#BA7517'; label = 'imminente'; }
      else { sem = '🟢'; col = '#639922'; label = 'ok'; }
      h += '<tr>';
      h += '<td>' + fmtD(p.ordine.data) + '</td>';
      h += '<td style="font-size:10px">' + _esc(p.ordine.prodotto) + '</td>';
      h += '<td class="m">' + fmtL(p.ordine.litri) + '</td>';
      h += '<td class="m"><strong>' + fmtE(p.importo) + '</strong></td>';
      h += '<td>' + fmtD(p.scadenza.toISOString().split('T')[0]) + '</td>';
      h += '<td class="m" style="color:' + col + ';font-weight:700">+' + p.ggResidui + '</td>';
      h += '<td style="color:' + col + ';font-weight:600">' + sem + ' ' + label + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table>';
    if (nonPagatiOrdini.length > 15) {
      h += '<div style="font-size:10px;color:#888;margin-top:6px;text-align:right">... e altre ' + (nonPagatiOrdini.length - 15) + ' scadenze più lontane</div>';
    }
    // Totali
    h += '<div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid #eee;font-size:11px">';
    h += '<div><strong>' + nonPagatiOrdini.length + '</strong> fatture aperte (non scadute)</div>';
    h += '<div>Totale aperto: <strong>' + fmtE(fidoUsato) + '</strong></div>';
    h += '</div>';
  }
  h += '</div>';

  // ── BOX INDICATORI CHIAVE FINALI ──────────────────────────────
  h += '<div class="card section"><div class="card-title">📌 Riepilogo periodo</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;font-size:12px">';
  h += '<div><div style="font-size:9px;color:#888;text-transform:uppercase">Ordini totali</div><div style="font-family:Courier New,monospace;font-weight:600;font-size:14px">' + tot.ordini + '</div></div>';
  h += '<div><div style="font-size:9px;color:#888;text-transform:uppercase">Litri totali</div><div style="font-family:Courier New,monospace;font-weight:600;font-size:14px">' + fmtL(tot.litri) + '</div></div>';
  h += '<div><div style="font-size:9px;color:#888;text-transform:uppercase">Spesa totale</div><div style="font-family:Courier New,monospace;font-weight:600;font-size:14px">' + fmtE(tot.importo) + '</div></div>';
  h += '<div><div style="font-size:9px;color:#888;text-transform:uppercase">Ticket medio</div><div style="font-family:Courier New,monospace;font-weight:600;font-size:14px">' + fmtE(ticketMedio) + '</div></div>';
  h += '<div><div style="font-size:9px;color:#888;text-transform:uppercase">Litri/ordine medi</div><div style="font-family:Courier New,monospace;font-weight:600;font-size:14px">' + fmtL(litriMedi) + '</div></div>';
  h += '<div><div style="font-size:9px;color:#888;text-transform:uppercase">Mesi attivi</div><div style="font-family:Courier New,monospace;font-weight:600;font-size:14px">' + nMesi + '</div></div>';
  h += '<div><div style="font-size:9px;color:#888;text-transform:uppercase">Litri/mese medi</div><div style="font-family:Courier New,monospace;font-weight:600;font-size:14px">' + fmtL(mediaMensileLitri) + '</div></div>';
  h += '<div><div style="font-size:9px;color:#888;text-transform:uppercase">Spesa/mese media</div><div style="font-family:Courier New,monospace;font-weight:600;font-size:14px">' + fmtE(mediaMensileImporto) + '</div></div>';
  h += '</div></div>';

  return h;
}

// ─── RENDER CONFRONTO MULTI-FORNITORE ──────────────────────────────
function _afRenderConfronto(nomi, fornitori, ordini, basiMap) {
  // Aggrega per fornitore
  var perForn = {};
  nomi.forEach(function(n) { 
    perForn[n] = { 
      litri: 0, importo: 0, ordini: 0, 
      perMese: {}, 
      perProdotto: {},
      perMeseProdotto: {}, // {mese: {prodotto: litri}}
      basiSet: new Set(),
      perBase: {} // {baseNome: {litri, importo, ordini}}
    }; 
  });
  
  ordini.forEach(function(o) {
    var f = perForn[o.fornitore]; if (!f) return;
    var l = Number(o.litri||0);
    var imp = (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * l;
    f.litri += l;
    f.importo += imp;
    f.ordini++;
    var mese = _afMese(o.data);
    if (!f.perMese[mese]) f.perMese[mese] = { litri: 0, importo: 0 };
    f.perMese[mese].litri += l;
    f.perMese[mese].importo += imp;
    if (!f.perProdotto[o.prodotto]) f.perProdotto[o.prodotto] = 0;
    f.perProdotto[o.prodotto] += l;
    if (!f.perMeseProdotto[mese]) f.perMeseProdotto[mese] = {};
    f.perMeseProdotto[mese][o.prodotto] = (f.perMeseProdotto[mese][o.prodotto] || 0) + l;
    if (o.base_carico_id) {
      var baseNome = basiMap[o.base_carico_id] ? basiMap[o.base_carico_id].nome : 'Base sconosciuta';
      f.basiSet.add(baseNome);
      if (!f.perBase[baseNome]) f.perBase[baseNome] = { litri: 0, importo: 0, ordini: 0 };
      f.perBase[baseNome].litri += l;
      f.perBase[baseNome].importo += imp;
      f.perBase[baseNome].ordini++;
    }
  });

  // Tutti i prodotti coinvolti
  var prodottiSet = new Set();
  ordini.forEach(function(o) { prodottiSet.add(o.prodotto); });
  var prodotti = Array.from(prodottiSet).sort();

  // Tutti i mesi coinvolti
  var mesiSet = new Set();
  ordini.forEach(function(o) { mesiSet.add(_afMese(o.data)); });
  var mesi = Array.from(mesiSet).sort();

  // Tutte le basi coinvolte
  var basiTutteSet = new Set();
  nomi.forEach(function(n) { perForn[n].basiSet.forEach(function(b) { basiTutteSet.add(b); }); });
  var basiTutte = Array.from(basiTutteSet).sort();

  var h = '';

  // KPI affiancati
  h += '<div class="card section"><div class="card-title">📊 KPI a confronto</div>';
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
  nomi.forEach(function(n, idx) {
    var d = perForn[n];
    var col = _afColoreFornitore(n, idx, fornitori);
    h += '<div style="flex:1;min-width:200px;background:#fff;border-radius:8px;padding:14px;border-top:4px solid ' + col + ';border:0.5px solid #e0ded5">';
    h += '<div style="font-size:14px;font-weight:700;color:' + col + ';margin-bottom:8px">' + _esc(n) + '</div>';
    h += '<div style="font-size:10px;color:#888">Ordini</div><div style="font-family:Courier New,monospace;font-weight:600;margin-bottom:6px">' + d.ordini + '</div>';
    h += '<div style="font-size:10px;color:#888">Litri</div><div style="font-family:Courier New,monospace;font-weight:600;margin-bottom:6px">' + fmtL(d.litri) + '</div>';
    h += '<div style="font-size:10px;color:#888">Importo</div><div style="font-family:Courier New,monospace;font-weight:700;font-size:14px">' + fmtE(d.importo) + '</div>';
    h += '<div style="font-size:10px;color:#888;margin-top:6px">Ticket medio</div><div style="font-family:Courier New,monospace;font-weight:600">' + fmtE(d.ordini>0 ? d.importo/d.ordini : 0) + '</div>';
    h += '</div>';
  });
  h += '</div></div>';

  // ── GRAFICO 1: Andamento mensile per fornitore (totali) ─────────
  h += '<div class="card section"><div class="card-title">📈 Andamento acquisti mensili (litri totali per fornitore)</div>';
  h += '<div style="height:300px;position:relative"><canvas id="af-chart-linee"></canvas></div>';
  h += '<div style="font-size:10px;color:#888;margin-top:6px">Una linea per ogni fornitore selezionato. Mostra il volume totale mensile.</div>';
  h += '</div>';

  // ── GRAFICO 2: Per prodotto e fornitore (linee separate) ────────
  // Una linea per ogni combinazione prodotto×fornitore
  h += '<div class="card section"><div class="card-title">📊 Acquisti mensili per prodotto e fornitore</div>';
  h += '<div style="height:340px;position:relative"><canvas id="af-chart-prodforn"></canvas></div>';
  h += '<div style="font-size:10px;color:#888;margin-top:6px">Una linea per ogni combinazione fornitore×prodotto. Stile: continua = ' + _esc(nomi[0]) + (nomi.length>1?', tratteggiata = ' + _esc(nomi[1]):'') + (nomi.length>2?', punteggiata = ' + _esc(nomi[2]):'') + '. Colore: prodotto.</div>';
  h += '</div>';

  // ── BASI DI CARICO PER FORNITORE (no prezzi) ────────────────────
  h += '<div class="card section"><div class="card-title">📍 Basi di carico utilizzate</div>';
  h += '<table><thead><tr><th>Base</th>';
  nomi.forEach(function(n) { h += '<th class="m">' + _esc(n) + ' (L)</th>'; });
  h += '<th class="m">Totale</th></tr></thead><tbody>';
  basiTutte.forEach(function(base) {
    var rigaTot = 0;
    var celle = nomi.map(function(n) { var l = (perForn[n].perBase[base]||{}).litri || 0; rigaTot += l; return l; });
    h += '<tr><td><strong>' + _esc(base) + '</strong></td>';
    celle.forEach(function(l) { h += '<td class="m">' + (l > 0 ? fmtL(l) : '—') + '</td>'; });
    h += '<td class="m"><strong>' + fmtL(rigaTot) + '</strong></td></tr>';
  });
  h += '</tbody></table></div>';

  // ── DISTRIBUZIONE PER PRODOTTO (tabella affiancata) ─────────────
  h += '<div class="card section"><div class="card-title">🎯 Distribuzione totale per prodotto</div>';
  h += '<table><thead><tr><th>Prodotto</th>';
  nomi.forEach(function(n) { h += '<th class="m">' + _esc(n) + ' (L)</th>'; });
  h += '<th class="m">Totale</th></tr></thead><tbody>';
  prodotti.forEach(function(prod) {
    var rigaTot = 0;
    var celle = nomi.map(function(n) { var l = perForn[n].perProdotto[prod] || 0; rigaTot += l; return l; });
    h += '<tr><td><strong>' + _esc(prod) + '</strong></td>';
    celle.forEach(function(l) { h += '<td class="m">' + (l > 0 ? fmtL(l) : '—') + '</td>'; });
    h += '<td class="m"><strong>' + fmtL(rigaTot) + '</strong></td></tr>';
  });
  h += '</tbody></table></div>';

  return h;
}

// ─── PREPARA DATI PER I GRAFICI (oggetto JS puro, no serializzazione) ──
function _afPreparaDati(nomi, fornitori, ordini, basiMap) {
  var dati = {
    nomi: nomi,
    isConfronto: nomi.length > 1
  };

  // Estrai mesi e prodotti
  var mesiSet = new Set();
  var prodottiSet = new Set();
  ordini.forEach(function(o) { mesiSet.add(_afMese(o.data)); prodottiSet.add(o.prodotto); });
  var mesi = Array.from(mesiSet).sort();
  var prodotti = Array.from(prodottiSet).sort();

  dati.mesi = mesi;
  dati.mesiLabel = mesi.map(function(m) { return _afFormattaMese(m); });
  dati.prodotti = prodotti;

  if (nomi.length === 1) {
    var dataMeseProd = {};
    var dataProd = {};
    ordini.forEach(function(o) {
      var m = _afMese(o.data);
      if (!dataMeseProd[m]) dataMeseProd[m] = {};
      dataMeseProd[m][o.prodotto] = (dataMeseProd[m][o.prodotto] || 0) + Number(o.litri||0);
      dataProd[o.prodotto] = (dataProd[o.prodotto] || 0) + Number(o.litri||0);
    });
    dati.dataMeseProd = dataMeseProd;
    dati.dataProd = dataProd;
  } else {
    var perFornMese = {};
    nomi.forEach(function(n) { perFornMese[n] = {}; mesi.forEach(function(m) { perFornMese[n][m] = 0; }); });
    var perFornProdMese = {};
    nomi.forEach(function(n) {
      perFornProdMese[n] = {};
      prodotti.forEach(function(p) {
        perFornProdMese[n][p] = {};
        mesi.forEach(function(m) { perFornProdMese[n][p][m] = 0; });
      });
    });
    ordini.forEach(function(o) {
      var m = _afMese(o.data);
      if (perFornMese[o.fornitore]) perFornMese[o.fornitore][m] += Number(o.litri||0);
      if (perFornProdMese[o.fornitore] && perFornProdMese[o.fornitore][o.prodotto]) {
        perFornProdMese[o.fornitore][o.prodotto][m] += Number(o.litri||0);
      }
    });
    dati.perFornMese = perFornMese;
    dati.perFornProdMese = perFornProdMese;
    dati.colori = nomi.map(function(n, i) { return _afColoreFornitore(n, i, fornitori); });
  }

  // Colori prodotti
  dati.coloriProdotti = { 'Gasolio Autotrazione':'#BA7517', 'Benzina':'#378ADD', 'Gasolio Agricolo':'#639922', 'HVO':'#6B5FCC', 'AdBlue':'#0088CC' };

  return dati;
}

// ─── FUNZIONE DI RENDERING (riceve la finestra figlio, legge w._afData) ──
function _afRenderChartsFn() {
  return function(w) {
    var D = w._afData;
    var CP = D.coloriProdotti;
    var Chart = w.Chart;
    var DASH = [[], [8,4], [2,3], [10,4,2,4], [6,2,2,2]];

    function commonOpts() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: function(c) { return c.dataset.label + ': ' + Number(c.parsed.y).toLocaleString('it-IT') + ' L'; }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: function(v) { return Number(v).toLocaleString('it-IT') + ' L'; } }
          }
        }
      };
    }

    if (D.isConfronto) {
      // GRAFICO 1 — totali per fornitore
      var ctx = w.document.getElementById('af-chart-linee');
      if (ctx) {
        var datasets1 = D.nomi.map(function(n, i) {
          return {
            label: n,
            data: D.mesi.map(function(m){ return D.perFornMese[n][m] || 0; }),
            borderColor: D.colori[i],
            backgroundColor: D.colori[i] + '22',
            borderWidth: 3,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: false
          };
        });
        new Chart(ctx, { type: 'line', data: { labels: D.mesiLabel, datasets: datasets1 }, options: commonOpts() });
      }

      // GRAFICO 2 — linee per (fornitore × prodotto)
      var ctx2 = w.document.getElementById('af-chart-prodforn');
      if (ctx2) {
        var datasets2 = [];
        D.nomi.forEach(function(n, fi) {
          D.prodotti.forEach(function(p) {
            var data = D.mesi.map(function(m) {
              return (D.perFornProdMese[n] && D.perFornProdMese[n][p] && D.perFornProdMese[n][p][m]) || 0;
            });
            var hasData = data.some(function(v) { return v > 0; });
            if (!hasData) return;
            datasets2.push({
              label: n + ' · ' + p,
              data: data,
              borderColor: CP[p] || '#888',
              backgroundColor: (CP[p] || '#888') + '22',
              borderWidth: 2.5,
              borderDash: DASH[fi % DASH.length],
              tension: 0.3,
              pointRadius: 3,
              pointHoverRadius: 5,
              fill: false
            });
          });
        });
        var opts2 = commonOpts();
        opts2.plugins.legend.labels.boxWidth = 24;
        opts2.plugins.legend.labels.font = { size: 10 };
        new Chart(ctx2, { type: 'line', data: { labels: D.mesiLabel, datasets: datasets2 }, options: opts2 });
      }
    } else {
      // SINGOLO — line chart multi-prodotto
      var ctx1 = w.document.getElementById('af-chart-mese-prod');
      if (ctx1) {
        var datasets = D.prodotti.map(function(p) {
          var data = D.mesi.map(function(m) {
            return (D.dataMeseProd[m] && D.dataMeseProd[m][p]) || 0;
          });
          var hasData = data.some(function(v) { return v > 0; });
          if (!hasData) return null;
          return {
            label: p,
            data: data,
            borderColor: CP[p] || '#888',
            backgroundColor: (CP[p] || '#888') + '22',
            borderWidth: 3,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: false
          };
        }).filter(function(d) { return d !== null; });
        new Chart(ctx1, { type: 'line', data: { labels: D.mesiLabel, datasets: datasets }, options: commonOpts() });
      }

      // Donut prodotti
      var ctx3 = w.document.getElementById('af-chart-prodotti');
      if (ctx3) {
        var labels = Object.keys(D.dataProd);
        var data = labels.map(function(p) { return D.dataProd[p]; });
        var colors = labels.map(function(p) { return CP[p] || '#888'; });
        new Chart(ctx3, {
          type: 'doughnut',
          data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } }
          }
        });
      }
    }
  };
}

// Nota: _esc è già definito in pf-fatture.js, lo riuso globalmente.

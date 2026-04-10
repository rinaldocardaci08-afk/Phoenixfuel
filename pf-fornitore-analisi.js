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

  // Scrivi l'HTML iniziale della nuova finestra
  var titolo = nomiFornitori.length === 1 
    ? 'Analisi fornitore — ' + nomiFornitori[0]
    : 'Confronto fornitori — ' + nomiFornitori.join(' vs ');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + _esc(titolo) + '</title>';
  html += '<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></' + 'script>';
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
  html += '<script>' + _afScriptRender(nomiFornitori, fornitori, ordini, basiMap) + '</' + 'script>';
  html += '</body></html>';

  w.document.open(); w.document.write(html); w.document.close();
}

// ─── RENDER SINGOLO FORNITORE ──────────────────────────────────────
function _afRenderSingolo(nome, fornitore, ordini, basiMap) {
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

  // Prezzi medi per prodotto × base
  var prezziMed = {};
  ordini.forEach(function(o) {
    var b = o.base_carico_id && basiMap[o.base_carico_id] ? basiMap[o.base_carico_id].nome : 'Senza base';
    var key = o.prodotto + '||' + b;
    if (!prezziMed[key]) prezziMed[key] = { prodotto: o.prodotto, base: b, litri: 0, valore: 0 };
    var l = Number(o.litri||0);
    var c = Number(o.costo_litro||0) + Number(o.trasporto_litro||0);
    prezziMed[key].litri += l;
    prezziMed[key].valore += l * c;
  });

  // Fido
  var fidoMax = Number(fornitore.fido_massimo||0) || Number(fornitore.fido||0);
  var fidoUsato = 0;
  ordini.forEach(function(o) { if (!o.pagato_fornitore) fidoUsato += (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri||0); });
  var fidoResiduo = fidoMax > 0 ? fidoMax - fidoUsato : 0;
  var pctFido = fidoMax > 0 ? Math.round((fidoUsato / fidoMax) * 100) : 0;

  var h = '';

  // KPI header
  h += '<div class="card section"><div class="card-title">📊 Indicatori chiave</div>';
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
  h += '<div class="kpi"><div class="kpi-label">Ordini</div><div class="kpi-value">' + tot.ordini + '</div></div>';
  h += '<div class="kpi"><div class="kpi-label">Litri totali</div><div class="kpi-value">' + fmtL(tot.litri) + '</div></div>';
  h += '<div class="kpi"><div class="kpi-label">Importo totale</div><div class="kpi-value">' + fmtE(tot.importo) + '</div></div>';
  h += '<div class="kpi"><div class="kpi-label">Ticket medio</div><div class="kpi-value">' + fmtE(tot.ordini > 0 ? tot.importo / tot.ordini : 0) + '</div></div>';
  h += '</div>';

  // Barra fido
  if (fidoMax > 0) {
    var fidoColor = pctFido >= 90 ? '#A32D2D' : pctFido >= 60 ? '#BA7517' : '#639922';
    h += '<div style="margin-top:14px;padding-top:14px;border-top:0.5px solid #eee">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
    h += '<div style="font-size:11px;font-weight:600;color:#666;text-transform:uppercase">Fido fornitore</div>';
    h += '<div style="font-size:11px;font-family:Courier New,monospace"><span style="color:#666">Max</span> <strong>' + fmtE(fidoMax) + '</strong> · <span style="color:' + fidoColor + '">Usato <strong>' + fmtE(fidoUsato) + '</strong></span> · <span style="color:#639922">Disp <strong>' + fmtE(fidoResiduo) + '</strong></span></div>';
    h += '</div>';
    h += '<div style="height:12px;width:100%;background:#eee;border-radius:6px;overflow:hidden"><div style="height:100%;width:' + Math.min(100,pctFido) + '%;background:' + fidoColor + '"></div></div>';
    h += '<div style="font-size:10px;color:#888;margin-top:3px;text-align:right">' + pctFido + '% utilizzato</div>';
    h += '</div>';
  }
  h += '</div>';

  // Grafico acquisti per prodotto (stacked bar mensile)
  h += '<div class="card section"><div class="card-title">📈 Acquisti per mese e prodotto</div>';
  h += '<div style="height:260px;position:relative"><canvas id="af-chart-mese-prod"></canvas></div></div>';

  // Distribuzione prodotti (donut)
  h += '<div class="card section"><div class="card-title">🎯 Distribuzione per prodotto</div>';
  h += '<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">';
  h += '<div style="width:200px;height:200px;flex-shrink:0"><canvas id="af-chart-prodotti"></canvas></div>';
  h += '<div style="flex:1;min-width:260px"><table>';
  h += '<thead><tr><th>Prodotto</th><th class="m">Litri</th><th class="m">Importo</th><th class="m">%</th></tr></thead><tbody>';
  Object.keys(perProdotto).sort(function(a,b){ return perProdotto[b].litri - perProdotto[a].litri; }).forEach(function(p) {
    var d = perProdotto[p];
    var pct = tot.litri > 0 ? (d.litri / tot.litri * 100) : 0;
    h += '<tr><td><strong>' + _esc(p) + '</strong></td><td class="m">' + fmtL(d.litri) + '</td><td class="m">' + fmtE(d.importo) + '</td><td class="m">' + pct.toFixed(1) + '%</td></tr>';
  });
  h += '</tbody></table></div></div></div>';

  // Acquisti per base di carico
  h += '<div class="card section"><div class="card-title">📍 Acquisti per base di carico</div>';
  h += '<table><thead><tr><th>Base</th><th class="m">Ordini</th><th class="m">Litri</th><th class="m">Importo</th><th class="m">Litri/ordine</th></tr></thead><tbody>';
  Object.keys(perBase).sort(function(a,b){ return perBase[b].litri - perBase[a].litri; }).forEach(function(b) {
    var d = perBase[b];
    h += '<tr><td><strong>' + _esc(b) + '</strong></td><td class="m">' + d.ordini + '</td><td class="m">' + fmtL(d.litri) + '</td><td class="m">' + fmtE(d.importo) + '</td><td class="m">' + fmtL(d.litri/d.ordini) + '</td></tr>';
  });
  h += '</tbody></table></div>';

  // Prezzi medi per prodotto × base
  h += '<div class="card section"><div class="card-title">💰 Prezzi medi per prodotto × base (costo + trasporto)</div>';
  h += '<table><thead><tr><th>Prodotto</th><th>Base</th><th class="m">Litri</th><th class="m">Prezzo medio €/L</th></tr></thead><tbody>';
  var sortedKeys = Object.keys(prezziMed).sort(function(a,b) {
    if (prezziMed[a].prodotto !== prezziMed[b].prodotto) return prezziMed[a].prodotto.localeCompare(prezziMed[b].prodotto);
    return prezziMed[a].base.localeCompare(prezziMed[b].base);
  });
  sortedKeys.forEach(function(k) {
    var d = prezziMed[k];
    var media = d.litri > 0 ? d.valore / d.litri : 0;
    h += '<tr><td>' + _esc(d.prodotto) + '</td><td>' + _esc(d.base) + '</td><td class="m">' + fmtL(d.litri) + '</td><td class="m"><strong>€ ' + media.toFixed(4) + '</strong></td></tr>';
  });
  h += '</tbody></table></div>';

  return h;
}

// ─── RENDER CONFRONTO MULTI-FORNITORE ──────────────────────────────
function _afRenderConfronto(nomi, fornitori, ordini, basiMap) {
  // Aggrega per fornitore
  var perForn = {};
  nomi.forEach(function(n) { perForn[n] = { litri: 0, importo: 0, ordini: 0, perMese: {}, perProdotto: {}, basiSet: new Set(), prezziPerBaseProd: {} }; });
  
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
    if (o.base_carico_id) {
      var baseNome = basiMap[o.base_carico_id] ? basiMap[o.base_carico_id].nome : 'Base sconosciuta';
      f.basiSet.add(baseNome);
      var key = o.prodotto + '||' + baseNome;
      if (!f.prezziPerBaseProd[key]) f.prezziPerBaseProd[key] = { litri: 0, valore: 0 };
      f.prezziPerBaseProd[key].litri += l;
      f.prezziPerBaseProd[key].valore += l * (Number(o.costo_litro||0) + Number(o.trasporto_litro||0));
    }
  });

  // Calcola basi comuni (intersezione di tutti i set)
  var basiTutte = nomi.map(function(n) { return Array.from(perForn[n].basiSet); });
  var basiComuni = basiTutte.reduce(function(acc, arr) {
    if (!acc) return arr;
    return acc.filter(function(b) { return arr.indexOf(b) >= 0; });
  }, null) || [];
  var basiTutteSet = new Set();
  basiTutte.forEach(function(arr) { arr.forEach(function(b) { basiTutteSet.add(b); }); });
  var basiNonComuni = Array.from(basiTutteSet).filter(function(b) { return basiComuni.indexOf(b) < 0; });

  // Tutti i prodotti coinvolti
  var prodottiSet = new Set();
  ordini.forEach(function(o) { prodottiSet.add(o.prodotto); });
  var prodotti = Array.from(prodottiSet).sort();

  // Tutti i mesi coinvolti
  var mesiSet = new Set();
  ordini.forEach(function(o) { mesiSet.add(_afMese(o.data)); });
  var mesi = Array.from(mesiSet).sort();

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

  // Grafico a linee mensile
  h += '<div class="card section"><div class="card-title">📈 Andamento acquisti mensili (litri)</div>';
  h += '<div style="height:300px;position:relative"><canvas id="af-chart-linee"></canvas></div></div>';

  // Prezzi medi basi comuni
  h += '<div class="card section"><div class="card-title">💰 Confronto prezzi medi su basi comuni</div>';
  if (basiComuni.length === 0) {
    h += '<div style="padding:20px;text-align:center;color:#888;background:#fef8ed;border-radius:8px;border:1px dashed #D4A017">';
    h += '⚠️ I fornitori selezionati non condividono nessuna base di carico comune.<br>';
    h += '<div style="font-size:11px;margin-top:6px">Il confronto sui prezzi medi richiede basi comuni per essere significativo (il trasporto varia tra basi diverse e falserebbe il confronto).</div>';
    h += '</div>';
  } else {
    h += '<div style="font-size:11px;color:#666;margin-bottom:10px">Basi comuni a tutti i fornitori selezionati: <strong>' + basiComuni.map(function(b){ return _esc(b); }).join(', ') + '</strong></div>';
    basiComuni.forEach(function(base) {
      h += '<div style="margin-bottom:14px">';
      h += '<div style="font-size:12px;font-weight:600;color:#D4A017;margin-bottom:6px">📍 ' + _esc(base) + '</div>';
      h += '<table><thead><tr><th>Prodotto</th>';
      nomi.forEach(function(n) { h += '<th class="m">' + _esc(n) + '</th>'; });
      h += '<th class="m">Miglior prezzo</th></tr></thead><tbody>';
      prodotti.forEach(function(prod) {
        var prezzi = [];
        nomi.forEach(function(n) {
          var k = prod + '||' + base;
          var d = perForn[n].prezziPerBaseProd[k];
          prezzi.push(d && d.litri > 0 ? d.valore / d.litri : null);
        });
        // Skip se nessuno dei fornitori ha dati
        if (prezzi.every(function(p) { return p === null; })) return;
        var prezziValidi = prezzi.filter(function(p) { return p !== null; });
        var minP = Math.min.apply(null, prezziValidi);
        var minIdx = prezzi.indexOf(minP);
        h += '<tr><td><strong>' + _esc(prod) + '</strong></td>';
        prezzi.forEach(function(p, i) {
          if (p === null) {
            h += '<td class="m" style="color:#ccc">—</td>';
          } else {
            var bg = i === minIdx && prezziValidi.length > 1 ? 'background:#EAF3DE;color:#27500A;font-weight:700' : '';
            h += '<td class="m" style="' + bg + '">€ ' + p.toFixed(4) + '</td>';
          }
        });
        if (prezziValidi.length > 1) {
          var delta = Math.max.apply(null, prezziValidi) - minP;
          h += '<td class="m"><strong style="color:#639922">' + _esc(nomi[minIdx]) + '</strong><br><span style="font-size:9px;color:#888">−€ ' + delta.toFixed(4) + '</span></td>';
        } else {
          h += '<td class="m" style="color:#888;font-size:10px">solo ' + _esc(nomi[minIdx]) + '</td>';
        }
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    });
  }
  h += '</div>';

  // Basi non comuni (info)
  if (basiNonComuni.length > 0) {
    h += '<div class="card section"><div class="card-title">ℹ️ Basi non condivise (non confrontabili)</div>';
    h += '<div style="font-size:11px;color:#666;margin-bottom:8px">Le seguenti basi sono servite da un solo fornitore e non rientrano nel confronto prezzi:</div>';
    h += '<table><thead><tr><th>Base</th><th>Fornitore</th><th class="m">Litri</th></tr></thead><tbody>';
    basiNonComuni.forEach(function(base) {
      nomi.forEach(function(n) {
        if (!perForn[n].basiSet.has(base)) return;
        var tot = 0;
        Object.keys(perForn[n].prezziPerBaseProd).forEach(function(k) {
          var parts = k.split('||');
          if (parts[1] === base) tot += perForn[n].prezziPerBaseProd[k].litri;
        });
        h += '<tr><td><strong>' + _esc(base) + '</strong></td><td>' + _esc(n) + '</td><td class="m">' + fmtL(tot) + '</td></tr>';
      });
    });
    h += '</tbody></table></div>';
  }

  // Distribuzione per prodotto (tabella affiancata)
  h += '<div class="card section"><div class="card-title">📊 Distribuzione per prodotto</div>';
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

// ─── SCRIPT DI RENDER CHART (eseguito nella nuova finestra) ────────
function _afScriptRender(nomi, fornitori, ordini, basiMap) {
  // Serializza i dati necessari al rendering dei chart
  var datiChart = {
    nomi: nomi,
    isConfronto: nomi.length > 1
  };

  if (nomi.length === 1) {
    // Singolo: stacked bar mese×prodotto + donut prodotti
    var mesiSet = new Set();
    var prodottiSet = new Set();
    ordini.forEach(function(o) { mesiSet.add(_afMese(o.data)); prodottiSet.add(o.prodotto); });
    var mesi = Array.from(mesiSet).sort();
    var prodotti = Array.from(prodottiSet).sort();
    var dataMeseProd = {}; // {mese: {prodotto: litri}}
    var dataProd = {};
    ordini.forEach(function(o) {
      var m = _afMese(o.data);
      if (!dataMeseProd[m]) dataMeseProd[m] = {};
      dataMeseProd[m][o.prodotto] = (dataMeseProd[m][o.prodotto] || 0) + Number(o.litri||0);
      dataProd[o.prodotto] = (dataProd[o.prodotto] || 0) + Number(o.litri||0);
    });
    datiChart.mesi = mesi;
    datiChart.prodotti = prodotti;
    datiChart.mesiLabel = mesi.map(function(m) { return _afFormattaMese(m); });
    datiChart.dataMeseProd = dataMeseProd;
    datiChart.dataProd = dataProd;
  } else {
    // Confronto: line chart litri per mese per fornitore
    var mesiSet = new Set();
    ordini.forEach(function(o) { mesiSet.add(_afMese(o.data)); });
    var mesi = Array.from(mesiSet).sort();
    var perForn = {};
    nomi.forEach(function(n) { perForn[n] = {}; mesi.forEach(function(m) { perForn[n][m] = 0; }); });
    ordini.forEach(function(o) {
      var m = _afMese(o.data);
      if (perForn[o.fornitore]) perForn[o.fornitore][m] += Number(o.litri||0);
    });
    datiChart.mesi = mesi;
    datiChart.mesiLabel = mesi.map(function(m) { return _afFormattaMese(m); });
    datiChart.perForn = perForn;
    datiChart.colori = nomi.map(function(n, i) { return _afColoreFornitore(n, i, fornitori); });
  }

  var coloriProdotti = { 'Gasolio Autotrazione':'#BA7517', 'Benzina':'#378ADD', 'Gasolio Agricolo':'#639922', 'HVO':'#6B5FCC', 'AdBlue':'#0088CC' };

  return 'var D = ' + JSON.stringify(datiChart) + ';' +
    'var CP = ' + JSON.stringify(coloriProdotti) + ';' +
    'window.addEventListener("load", function() {' +
    '  if (typeof Chart === "undefined") return;' +
    '  if (D.isConfronto) {' +
    '    var ctx = document.getElementById("af-chart-linee");' +
    '    if (ctx) {' +
    '      var datasets = D.nomi.map(function(n, i) {' +
    '        return { label: n, data: D.mesi.map(function(m){ return D.perForn[n][m] || 0; }), borderColor: D.colori[i], backgroundColor: D.colori[i]+"33", borderWidth: 2.5, tension: 0.3, pointRadius: 4, pointHoverRadius: 6, fill: false };' +
    '      });' +
    '      new Chart(ctx, { type: "line", data: { labels: D.mesiLabel, datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top", labels: { font: { size: 11 } } }, tooltip: { callbacks: { label: function(c) { return c.dataset.label + ": " + Number(c.parsed.y).toLocaleString("it-IT") + " L"; } } } }, scales: { y: { beginAtZero: true, ticks: { callback: function(v) { return Number(v).toLocaleString("it-IT") + " L"; } } } } } });' +
    '    }' +
    '  } else {' +
    '    var ctx1 = document.getElementById("af-chart-mese-prod");' +
    '    if (ctx1) {' +
    '      var datasets = D.prodotti.map(function(p) {' +
    '        return { label: p, data: D.mesi.map(function(m) { return (D.dataMeseProd[m] && D.dataMeseProd[m][p]) || 0; }), backgroundColor: CP[p] || "#888", borderWidth: 0 };' +
    '      });' +
    '      new Chart(ctx1, { type: "bar", data: { labels: D.mesiLabel, datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top", labels: { font: { size: 11 } } } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: function(v) { return Number(v).toLocaleString("it-IT") + " L"; } } } } } });' +
    '    }' +
    '    var ctx2 = document.getElementById("af-chart-prodotti");' +
    '    if (ctx2) {' +
    '      var labels = Object.keys(D.dataProd);' +
    '      var data = labels.map(function(p) { return D.dataProd[p]; });' +
    '      var colors = labels.map(function(p) { return CP[p] || "#888"; });' +
    '      new Chart(ctx2, { type: "doughnut", data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { font: { size: 10 }, padding: 8 } } } } });' +
    '    }' +
    '  }' +
    '});';
}

// Nota: _esc è già definito in pf-fatture.js, lo riuso globalmente.

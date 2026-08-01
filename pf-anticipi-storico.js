// ═══════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Storico Anticipi v2 (Patch v20260503i)
// ═══════════════════════════════════════════════════════════════════════════
// Tab "📊 Storico Anticipi" dentro Banche.
// 
// Sub-tabs:
//   1. 🏦 Totali (default): vista cumulativa con KPI, % anticipato/fatturato,
//      utilizzo fidi, istogramma mensile per banca, torta quota istituto
//   2. Banca singola (Intesa, MPS, BNL, BCC, ...): KPI + tabella mensile
//      con colonna "📋 Vedi" per aprire elenco fatture del mese
//
// Modale "Elenco fatture":
//   - Toggle Tutte / Solo attive
//   - Tabella con badge stato + bottone stampa print-friendly
//
// Esclude presentazioni con stato='rifiutata' (Opzione B).
// ═══════════════════════════════════════════════════════════════════════════


// Stato globale
var _antsStato = {
  annoCorrente: new Date().getFullYear(),
  bancaSelezionataId: 'totali',  // 'totali' = vista cumulativa, altrimenti UUID istituto
  banche: [],
  presentazioni: [],
  fatture: [],                    // tutte anticipi_sbf_fatture
  affidamenti: [],                // banche_affidamenti per utilizzo fidi
  fatturatoConsumo: 0,            // somma fatture_emesse anno corrente verso clienti non-rete
  fatturatoTotale: 0
};

// v20260801a — fido anticipi per banca: solo le linee di anticipo (prima si
//               sommavano anche cassa e mutui) e utilizzo calcolato davvero,
//               piu tutte le letture paginate.
var _ANTS_STATI_VALIDI = ['anticipata', 'anticipata_parziale', 'estinta', 'insoluta'];

// v20260801a — Un istituto ha piu linee di fido (anticipi, cassa, mutui...).
// Qui contano SOLO quelle di anticipo: prima si sommava tutto l'attivo, cosi
// Intesa risultava 650.000 invece di 600.000 (600.000 anticipi + 50.000 cassa)
// e BNL compariva pur avendo solo una linea di cassa.
// Stessi tipi usati da pf-anticipi.js.
var _ANTS_TIPI_ANTICIPO = ['anticipo_fatture', 'sbf', 'castelletto', 'autoliquidante'];

// Lettura a blocchi: PostgREST ne restituisce mille per volta e non avvisa.
async function _antsLeggiTutte(tabella, colonne, filtri) {
  var fuori = [], da = 0, blocco = 1000;
  for (var giro = 0; giro < 60; giro++) {
    var q = sb.from(tabella).select(colonne);
    if (typeof filtri === 'function') q = filtri(q);
    var r = await q.range(da, da + blocco - 1);
    if (r.error) return { data: null, error: r.error };
    var righe = r.data || [];
    fuori = fuori.concat(righe);
    if (righe.length < blocco) break;
    da += blocco;
  }
  return { data: fuori, error: null };
}

var _ANTS_MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
var _ANTS_MESI_FULL = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

// Colori per banca (assegnati dinamicamente alle prime 4 banche per priorità)
var _ANTS_PALETTE = ['#185FA5', '#A32D2D', '#0C447C', '#639922', '#BA7517', '#791F1F', '#27500A', '#412402'];


// Helpers formattazione
function _antsFmtImporto(n) { return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function _antsFmtImportoDec(n) { return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _antsFmtImpKb(n) { var v = Number(n || 0); if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + 'k'; return v.toFixed(0); }
function _antsFmtPerc(n) { return (Number(n || 0) * 100).toFixed(1) + '%'; }
function _antsFmtData(iso) { if (!iso) return '—'; var p = String(iso).substring(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
function _antsEsc(str) { if (str == null) return ''; return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }


function _antsPrioritaBanca(nome) {
  var n = (nome || '').toLowerCase();
  if (n.indexOf('intesa') >= 0) return 1;
  if (n.indexOf('mps') >= 0 || n.indexOf('monte') >= 0) return 2;
  if (n.indexOf('bnl') >= 0) return 3;
  if (n.indexOf('bcc') >= 0 || n.indexOf('credito cooperativo') >= 0) return 4;
  return 99;
}


function _antsColoreBanca(idx) {
  return _ANTS_PALETTE[idx % _ANTS_PALETTE.length];
}


// ────────────────────────────────────────────────────────────────────────
// MAIN: render storico
// ────────────────────────────────────────────────────────────────────────
async function renderAntStorico() {
  var el = document.getElementById('ant-storico-content');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">⏳ Caricamento storico...</div>';

  var anno = _antsStato.annoCorrente;
  var inizioAnno = anno + '-01-01';
  var fineAnno = anno + '-12-31';

  // Carico tutto in parallelo
  // v20260801a: letture paginate. anticipi_sbf_fatture e fatture_emesse hanno
  // superato le mille righe: senza paginazione PostgREST ne restituiva mille e
  // taceva, quindi lo storico calcolava su dati parziali senza avvisare.
  var [resPres, resFatt, resAff, resIst, resFattEm] = await Promise.all([
    _antsLeggiTutte('anticipi_sbf_presentazioni', '*', function(q) { return q.in('stato', _ANTS_STATI_VALIDI).order('data_presentazione', { ascending: false }); }),
    _antsLeggiTutte('anticipi_sbf_fatture', '*', function(q) { return q.neq('stato', 'esclusa'); }),
    sb.from('banche_affidamenti').select('id,istituto_id,tipo,importo_accordato,importo_utilizzato,stato').eq('stato', 'attivo').in('tipo', _ANTS_TIPI_ANTICIPO),
    sb.from('banche_istituti').select('id,nome'),
    // Fatturato consumo: fatture emesse anno corrente, escludo clienti rete
    _antsLeggiTutte('fatture_emesse', 'importo_totale,cliente_id,data', function(q) { return q.gte('data', inizioAnno).lte('data', fineAnno); })
  ]);

  if (resPres.error) {
    el.innerHTML = '<div style="padding:20px;color:#A32D2D">Errore: ' + _antsEsc(resPres.error.message) + '</div>';
    return;
  }

  var presentazioni = resPres.data || [];
  var fatture = resFatt.data || [];
  var affidamenti = resAff.data || [];
  var istituti = resIst.data || [];
  var fattureEmesse = resFattEm.data || [];

  // Mappe
  var mappaAff = {};
  affidamenti.forEach(function(a) { mappaAff[a.id] = a; });
  var mappaIst = {};
  istituti.forEach(function(i) { mappaIst[i.id] = i.nome; });

  // Arricchisco presentazioni
  presentazioni.forEach(function(p) {
    var aff = mappaAff[p.affidamento_id];
    p._istituto_id = aff ? aff.istituto_id : null;
    p._banca_nome = mappaIst[p._istituto_id] || '—';
    p._anno = p.data_presentazione ? new Date(p.data_presentazione).getFullYear() : null;
    p._mese = p.data_presentazione ? new Date(p.data_presentazione).getMonth() : null;
  });

  _antsStato.presentazioni = presentazioni;
  _antsStato.fatture = fatture;
  _antsStato.affidamenti = affidamenti;
  _antsStato.istituti = istituti;

  // Carico cliente_rete per separare fatturato consumo / totale
  var clientIds = {};
  fattureEmesse.forEach(function(f) { if (f.cliente_id) clientIds[f.cliente_id] = true; });
  var idsArr = Object.keys(clientIds);
  var clientiReteSet = {};
  if (idsArr.length > 0) {
    var resCli = await sb.from('clienti').select('id,cliente_rete').in('id', idsArr);
    (resCli.data || []).forEach(function(c) { if (c.cliente_rete === true) clientiReteSet[c.id] = true; });
  }

  var fattConsumo = 0, fattTot = 0;
  fattureEmesse.forEach(function(f) {
    var imp = Number(f.importo_totale || 0);
    fattTot += imp;
    if (!clientiReteSet[f.cliente_id]) fattConsumo += imp;
  });
  _antsStato.fatturatoConsumo = fattConsumo;
  _antsStato.fatturatoTotale = fattTot;

  // Banche distinte: solo quelle che hanno almeno una presentazione storica
  var banche = [];
  var bancheVisti = {};
  presentazioni.forEach(function(p) {
    if (p._istituto_id && !bancheVisti[p._istituto_id]) {
      bancheVisti[p._istituto_id] = true;
      banche.push({ id: p._istituto_id, nome: p._banca_nome });
    }
  });
  banche.sort(function(a, b) {
    var pa = _antsPrioritaBanca(a.nome);
    var pb = _antsPrioritaBanca(b.nome);
    if (pa !== pb) return pa - pb;
    return a.nome.localeCompare(b.nome);
  });
  // Assegno indice colore stabile
  banche.forEach(function(b, i) { b._colore = _antsColoreBanca(i); });
  _antsStato.banche = banche;

  // Anni disponibili
  var anniSet = {};
  presentazioni.forEach(function(p) { if (p._anno) anniSet[p._anno] = true; });
  var anniArr = Object.keys(anniSet).map(function(a) { return parseInt(a, 10); }).sort(function(a, b) { return b - a; });
  if (anniArr.length === 0) anniArr = [new Date().getFullYear()];
  if (anniArr.indexOf(_antsStato.annoCorrente) < 0) _antsStato.annoCorrente = anniArr[0];

  el.innerHTML = _antsRenderHtml(banche, anniArr);
}


// Render principale: header + sub-tabs + contenuto
function _antsRenderHtml(banche, anniArr) {
  var html = '';
  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">';
  html += '<div>';
  html += '<div style="font-size:15px;font-weight:500;color:var(--text)">📊 Storico Anticipi per Banca</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Totali presentazioni SBF — escluse rifiutate</div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;align-items:center">';
  html += '<label style="font-size:11px;color:var(--text-muted)">Anno:</label>';
  html += '<select onchange="_antsCambiaAnno(this.value)" style="font-size:12px;padding:5px 10px;border:0.5px solid var(--border);border-radius:4px">';
  anniArr.forEach(function(a) {
    html += '<option value="' + a + '"' + (a === _antsStato.annoCorrente ? ' selected' : '') + '>' + a + '</option>';
  });
  html += '</select>';
  html += '</div>';
  html += '</div>';

  // Sub-tabs: Totali + banche
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;border-bottom:0.5px solid var(--border);padding-bottom:8px">';
  // Totali
  var attivaTot = _antsStato.bancaSelezionataId === 'totali';
  html += '<button onclick="_antsSelezionaBanca(\'totali\')" style="font-size:12px;padding:7px 14px;border-radius:5px;cursor:pointer;font-weight:500;';
  if (attivaTot) html += 'background:#0C447C;color:white;border:1px solid #0C447C';
  else html += 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)';
  html += '">🏦 Totali</button>';

  banche.forEach(function(b) {
    var attiva = b.id === _antsStato.bancaSelezionataId;
    html += '<button onclick="_antsSelezionaBanca(\'' + _antsEsc(b.id) + '\')" style="font-size:12px;padding:7px 14px;border-radius:5px;cursor:pointer;font-weight:500;';
    if (attiva) html += 'background:#0C447C;color:white;border:1px solid #0C447C';
    else html += 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)';
    html += '">' + _antsEsc(b.nome) + '</button>';
  });
  html += '</div>';

  // Contenuto
  html += '<div id="ants-contenuto">';
  if (attivaTot) {
    html += _antsRenderTotali();
  } else {
    html += _antsRenderBanca();
  }
  html += '</div>';

  return html;
}


// ════════════════════════════════════════════════════════════════════════
// VISTA TOTALI
// ════════════════════════════════════════════════════════════════════════
function _antsRenderTotali() {
  var anno = _antsStato.annoCorrente;
  var presAnno = _antsStato.presentazioni.filter(function(p) { return p._anno === anno; });
  var presAnnoPrec = _antsStato.presentazioni.filter(function(p) { return p._anno === (anno - 1); });

  var totAnno = presAnno.reduce(function(s, p) { return s + Number(p.importo_anticipato_totale || 0); }, 0);
  var totAnnoPrec = presAnnoPrec.reduce(function(s, p) { return s + Number(p.importo_anticipato_totale || 0); }, 0);
  var totInsoluti = presAnno.filter(function(p) { return p.stato === 'insoluta'; }).reduce(function(s, p) { return s + Number(p.importo_anticipato_totale || 0); }, 0);
  var pInsoluti = totAnno > 0 ? totInsoluti / totAnno : 0;

  var deltaPerc = totAnnoPrec > 0 ? ((totAnno - totAnnoPrec) / totAnnoPrec) : null;

  // % Anticipato su Fatturato Consumo
  var fattCons = _antsStato.fatturatoConsumo;
  var pAntCons = fattCons > 0 ? totAnno / fattCons : 0;

  var html = '';

  // 3 KPI
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:18px">';
  html += _antsKpiCard('Anticipato ' + anno, _antsFmtImporto(totAnno) + ' €', '#173404', '#EAF3DE', '#639922', presAnno.length + ' presentazioni');
  var deltaText = '';
  if (deltaPerc !== null) {
    var deltaIcon = deltaPerc >= 0 ? '↑' : '↓';
    var deltaCol = deltaPerc >= 0 ? '#27500A' : '#791F1F';
    deltaText = '<span style="color:' + deltaCol + ';font-weight:600">' + deltaIcon + ' ' + Math.abs(deltaPerc * 100).toFixed(0) + '%</span> vs ' + (anno - 1);
  }
  html += _antsKpiCard('Anticipato ' + (anno - 1), _antsFmtImporto(totAnnoPrec) + ' €', '#412402', '#FAEEDA', '#BA7517', deltaText);
  html += _antsKpiCard('Insoluti ' + anno, _antsFmtImporto(totInsoluti) + ' €', '#791F1F', '#FCEBEB', '#A32D2D', _antsFmtPerc(pInsoluti) + ' sul totale');
  html += '</div>';

  // Bilancia anticipato vs fatturato consumo
  html += '<div style="background:#FAF8F2;padding:14px 16px;border-radius:6px;border:0.5px solid #e5e0d2;margin-bottom:14px">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600;margin-bottom:10px">📈 Anticipato vs Fatturato Consumo (gennaio - oggi ' + anno + ')</div>';
  html += '<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px;align-items:center">';
  html += '<div>';
  var pBar = fattCons > 0 ? Math.min(100, (totAnno / fattCons) * 100) : 0;
  html += '<div style="background:#fff;height:32px;border-radius:6px;overflow:hidden;border:0.5px solid #ccc;display:flex;position:relative">';
  html += '<div style="width:' + pBar.toFixed(1) + '%;background:linear-gradient(90deg,#639922,#7AB52A);display:flex;align-items:center;padding-left:12px;font-size:11px;color:white;font-weight:600;white-space:nowrap;min-width:0;overflow:hidden">€ ' + _antsFmtImporto(totAnno) + '</div>';
  html += '<div style="flex:1;background:#f5f5f0;display:flex;align-items:center;justify-content:flex-end;padding-right:12px;font-size:10px;color:#666;white-space:nowrap">€ ' + _antsFmtImporto(fattCons) + ' fatt. consumo</div>';
  html += '</div>';
  html += '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:#666">';
  html += '<span><strong style="color:#27500A">Anticipato</strong></span>';
  html += '<span><strong style="color:#444">Fatturato consumo</strong></span>';
  html += '</div>';
  html += '</div>';
  // Card percentuale
  html += '<div style="text-align:center;background:white;padding:8px;border-radius:6px;border:0.5px solid #ddd">';
  html += '<div style="font-size:10px;color:#666;margin-bottom:2px">% Anticipato su Fatturato Consumo</div>';
  html += '<div style="font-family:var(--font-mono);font-size:24px;font-weight:600;color:#27500A">' + (pAntCons * 100).toFixed(0) + '%</div>';
  html += '<div style="font-size:9px;color:#888;margin-top:2px;font-style:italic">i clienti rete sono esclusi dal calcolo</div>';
  html += '</div>';
  html += '</div></div>';

  // Utilizzo fidi per banca
  html += _antsRenderUtilizzoFidi();

  // Istogramma mensile per banca + torta
  html += '<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:18px">';
  html += _antsRenderIstogrammaMensile(presAnno);
  html += _antsRenderTortaQuota(presAnno);
  html += '</div>';

  html += '<div style="font-size:9px;color:#888;font-style:italic;border-top:0.5px solid #e5e0d2;padding-top:8px">';
  html += 'ℹ️ Il calcolo "% Anticipato su Fatturato Consumo" considera solo le fatture verso clienti NON marcati come "rete". I clienti rete sono di norma esclusi dagli anticipi.';
  html += '</div>';

  return html;
}


function _antsRenderUtilizzoFidi() {
  var html = '<div style="background:#FAF8F2;padding:14px 16px;border-radius:6px;border:0.5px solid #e5e0d2;margin-bottom:14px">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600;margin-bottom:10px">🏦 Utilizzo Fidi Anticipi per Banca (oggi)</div>';

  // Aggrego per istituto. Gli affidamenti sono gia filtrati ai soli tipi di
  // anticipo, quindi qui entrano solo quelle linee.
  var perIstituto = {};
  var affDiIst = {};
  _antsStato.affidamenti.forEach(function(a) {
    if (!perIstituto[a.istituto_id]) perIstituto[a.istituto_id] = { accordato: 0, utilizzato: 0 };
    perIstituto[a.istituto_id].accordato += Number(a.importo_accordato || 0);
    affDiIst[a.id] = a.istituto_id;
  });

  // v20260801a — L'utilizzo NON si legge piu da importo_utilizzato scritto
  // sull'affidamento: quel campo resta indietro (Intesa ci teneva 548.192,10
  // mentre l'utilizzo vero era 473.173,10). Si calcola come nel resto del
  // programma: anticipato meno estinto, modulo per modulo.
  var estintoDiPres = {};
  (_antsStato.fatture || []).forEach(function(f) {
    estintoDiPres[f.presentazione_id] = (estintoDiPres[f.presentazione_id] || 0) + Number(f.importo_estinto || 0);
  });
  (_antsStato.presentazioni || []).forEach(function(pr) {
    var istId = affDiIst[pr.affidamento_id];
    if (!istId || !perIstituto[istId]) return;
    var vivo = Number(pr.importo_anticipato_totale || 0) - (estintoDiPres[pr.id] || 0);
    if (vivo > 0) perIstituto[istId].utilizzato += vivo;
  });

  var righe = [];
  _antsStato.banche.forEach(function(b) {
    var dati = perIstituto[b.id];
    if (!dati || dati.accordato <= 0) return;
    var perc = dati.utilizzato / dati.accordato;
    righe.push({ banca: b, accordato: dati.accordato, utilizzato: dati.utilizzato, perc: perc });
  });

  if (righe.length === 0) {
    html += '<div style="font-size:11px;color:#888;font-style:italic;padding:10px 0">Nessun affidamento attivo trovato.</div>';
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:8px">';
    righe.forEach(function(r) {
      var perc100 = Math.min(100, r.perc * 100);
      var col1, col2, txtCol;
      if (r.perc >= 0.80) { col1 = '#A32D2D'; col2 = '#D14040'; txtCol = '#791F1F'; }
      else if (r.perc >= 0.50) { col1 = '#BA7517'; col2 = '#E29325'; txtCol = '#BA7517'; }
      else { col1 = '#639922'; col2 = '#7AB52A'; txtCol = '#27500A'; }
      html += '<div>';
      html += '<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px">';
      html += '<span><strong>' + _antsEsc(r.banca.nome) + '</strong> · accordato € ' + _antsFmtImporto(r.accordato) + '</span>';
      html += '<span style="color:' + txtCol + ';font-weight:600">' + (r.perc * 100).toFixed(0) + '% utilizzato (€ ' + _antsFmtImporto(r.utilizzato) + ')</span>';
      html += '</div>';
      html += '<div style="background:white;height:14px;border-radius:3px;overflow:hidden;border:0.5px solid #ccc">';
      html += '<div style="width:' + perc100.toFixed(1) + '%;height:100%;background:linear-gradient(90deg,' + col1 + ',' + col2 + ')"></div>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}


function _antsRenderIstogrammaMensile(presAnno) {
  // Aggrego per mese × banca
  var perMese = {};  // {meseIdx: {bancaId: importo}}
  for (var m = 0; m < 12; m++) perMese[m] = {};
  presAnno.forEach(function(p) {
    if (p._mese == null || !p._istituto_id) return;
    if (!perMese[p._mese][p._istituto_id]) perMese[p._mese][p._istituto_id] = 0;
    perMese[p._mese][p._istituto_id] += Number(p.importo_anticipato_totale || 0);
  });

  // Trovo max colonna (somma tutte le banche di un mese)
  var maxMese = 0;
  for (var m = 0; m < 12; m++) {
    var sum = 0;
    Object.keys(perMese[m]).forEach(function(bid) { sum += perMese[m][bid]; });
    if (sum > maxMese) maxMese = sum;
  }
  if (maxMese <= 0) maxMese = 1;

  var w = 480, h = 180;
  var leftPad = 40, rightPad = 8, topPad = 18, bottomPad = 25;
  var chartW = w - leftPad - rightPad;
  var chartH = h - topPad - bottomPad;
  var slotW = chartW / 12;
  var nBanche = _antsStato.banche.length || 1;
  var barreW = Math.min(slotW * 0.7 / nBanche, 12);
  var spacingTot = slotW - (barreW * nBanche);
  var spacingX = spacingTot / 2;

  var html = '<div style="background:#FAF8F2;padding:14px 16px;border-radius:6px;border:0.5px solid #e5e0d2">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600;margin-bottom:10px">📊 Anticipato per mese e banca (' + _antsStato.annoCorrente + ')</div>';

  html += '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:180px">';
  // Assi
  html += '<line x1="' + leftPad + '" y1="' + topPad + '" x2="' + leftPad + '" y2="' + (h - bottomPad) + '" stroke="#ccc" stroke-width="0.5"/>';
  html += '<line x1="' + leftPad + '" y1="' + (h - bottomPad) + '" x2="' + (w - rightPad) + '" y2="' + (h - bottomPad) + '" stroke="#ccc" stroke-width="0.5"/>';

  // Tick verticali (4 linee)
  for (var t = 0; t <= 4; t++) {
    var val = (maxMese / 4) * t;
    var y = (h - bottomPad) - (chartH * t / 4);
    html += '<text x="' + (leftPad - 4) + '" y="' + (y + 3) + '" text-anchor="end" font-size="8" fill="#888">' + _antsFmtImpKb(val) + '</text>';
  }

  // Barre per ogni mese
  for (var m = 0; m < 12; m++) {
    var xBase = leftPad + (m * slotW) + spacingX;
    _antsStato.banche.forEach(function(b, idxB) {
      var importo = perMese[m][b.id] || 0;
      if (importo <= 0) return;
      var hb = (importo / maxMese) * chartH;
      var x = xBase + (idxB * barreW);
      var y = (h - bottomPad) - hb;
      html += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barreW.toFixed(1) + '" height="' + hb.toFixed(1) + '" fill="' + b._colore + '" rx="1">';
      html += '<title>' + _antsEsc(b.nome) + ' · ' + _ANTS_MESI_FULL[m] + ' ' + _antsStato.annoCorrente + ': € ' + _antsFmtImporto(importo) + '</title>';
      html += '</rect>';
    });
    // Label mese
    html += '<text x="' + (xBase + (slotW / 2) - spacingX).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="8" fill="#888">' + _ANTS_MESI[m] + '</text>';
  }
  html += '</svg>';

  // Legenda
  html += '<div style="display:flex;gap:12px;margin-top:6px;font-size:10px;justify-content:center;flex-wrap:wrap">';
  _antsStato.banche.forEach(function(b) {
    html += '<span><span style="display:inline-block;width:9px;height:9px;background:' + b._colore + ';border-radius:1px;margin-right:4px;vertical-align:middle"></span>' + _antsEsc(b.nome) + '</span>';
  });
  html += '</div>';

  html += '</div>';
  return html;
}


function _antsRenderTortaQuota(presAnno) {
  // Aggrego per banca
  var perBanca = {};
  _antsStato.banche.forEach(function(b) { perBanca[b.id] = 0; });
  presAnno.forEach(function(p) {
    if (!p._istituto_id) return;
    if (perBanca[p._istituto_id] == null) perBanca[p._istituto_id] = 0;
    perBanca[p._istituto_id] += Number(p.importo_anticipato_totale || 0);
  });
  var totale = 0;
  Object.keys(perBanca).forEach(function(k) { totale += perBanca[k]; });

  var html = '<div style="background:#FAF8F2;padding:14px 16px;border-radius:6px;border:0.5px solid #e5e0d2">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:#666;letter-spacing:0.4px;font-weight:600;margin-bottom:10px">🥧 Quota per istituto ' + _antsStato.annoCorrente + '</div>';

  if (totale === 0) {
    html += '<div style="text-align:center;padding:30px;color:#888;font-size:11px;font-style:italic">Nessun dato per ' + _antsStato.annoCorrente + '</div>';
    html += '</div>';
    return html;
  }

  // SVG torta
  var cx = 100, cy = 100, r = 70, rInner = 35;
  var svg = '<svg viewBox="0 0 200 200" style="width:100%;height:170px">';
  var startAngle = -Math.PI / 2; // parto da nord

  var legenda = [];
  _antsStato.banche.forEach(function(b) {
    var importo = perBanca[b.id] || 0;
    if (importo <= 0) return;
    var perc = importo / totale;
    var endAngle = startAngle + (perc * 2 * Math.PI);
    var largeArc = perc > 0.5 ? 1 : 0;
    var x1 = cx + r * Math.cos(startAngle);
    var y1 = cy + r * Math.sin(startAngle);
    var x2 = cx + r * Math.cos(endAngle);
    var y2 = cy + r * Math.sin(endAngle);
    svg += '<path d="M ' + cx + ' ' + cy + ' L ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z" fill="' + b._colore + '"><title>' + _antsEsc(b.nome) + ': € ' + _antsFmtImporto(importo) + ' (' + (perc * 100).toFixed(0) + '%)</title></path>';
    legenda.push({ banca: b, importo: importo, perc: perc });
    startAngle = endAngle;
  });

  // Cerchio interno per effetto donut
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rInner + '" fill="#FAF8F2"/>';
  svg += '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" font-size="11" fill="#444" font-weight="600">€ ' + _antsFmtImpKb(totale) + '</text>';
  svg += '<text x="' + cx + '" y="' + (cy + 11) + '" text-anchor="middle" font-size="9" fill="#888">totale</text>';
  svg += '</svg>';

  html += svg;

  // Legenda dettagliata
  html += '<div style="font-size:10px;display:flex;flex-direction:column;gap:3px;margin-top:6px">';
  legenda.sort(function(a, b) { return b.importo - a.importo; });
  legenda.forEach(function(l) {
    html += '<div style="display:flex;justify-content:space-between">';
    html += '<span><span style="display:inline-block;width:9px;height:9px;background:' + l.banca._colore + ';border-radius:1px;margin-right:4px"></span>' + _antsEsc(l.banca.nome) + '</span>';
    html += '<strong>' + (l.perc * 100).toFixed(0) + '% (€ ' + _antsFmtImpKb(l.importo) + ')</strong>';
    html += '</div>';
  });
  html += '</div>';

  html += '</div>';
  return html;
}


// ════════════════════════════════════════════════════════════════════════
// VISTA BANCA SINGOLA
// ════════════════════════════════════════════════════════════════════════
function _antsRenderBanca() {
  var bancaId = _antsStato.bancaSelezionataId;
  var banca = _antsStato.banche.find(function(b) { return b.id === bancaId; });
  if (!banca) return '<div style="padding:20px;color:var(--text-muted)">Banca non trovata</div>';

  var nomeBanca = banca.nome;
  var anno = _antsStato.annoCorrente;

  var presBanca = _antsStato.presentazioni.filter(function(p) { return p._istituto_id === bancaId; });
  var presAnno = presBanca.filter(function(p) { return p._anno === anno; });
  var presAnnoPrec = presBanca.filter(function(p) { return p._anno === (anno - 1); });

  var totAnno = presAnno.reduce(function(s, p) { return s + Number(p.importo_anticipato_totale || 0); }, 0);
  var totAnnoPrec = presAnnoPrec.reduce(function(s, p) { return s + Number(p.importo_anticipato_totale || 0); }, 0);
  var totVita = presBanca.reduce(function(s, p) { return s + Number(p.importo_anticipato_totale || 0); }, 0);
  var nVita = presBanca.length;
  var mediaVita = nVita > 0 ? totVita / nVita : 0;
  var deltaPerc = totAnnoPrec > 0 ? ((totAnno - totAnnoPrec) / totAnnoPrec) : null;

  var html = '';

  // Header banca con bottone elenco fatture anno
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  html += '<div style="font-size:13px;font-weight:500;color:#0C447C">' + _antsEsc(nomeBanca) + ' · ' + anno + '</div>';
  html += '<button onclick="_antsApriElencoFatture(\'' + _antsEsc(bancaId) + '\', null)" style="background:#0C447C;color:white;font-size:11px;padding:6px 12px;border:0;border-radius:4px;font-weight:500;cursor:pointer">📋 Elenco fatture anno</button>';
  html += '</div>';

  // KPI 4 cards
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">';
  html += _antsKpiCard('Anticipato ' + anno, _antsFmtImporto(totAnno) + ' €', '#173404', '#EAF3DE', '#639922', presAnno.length + ' presentazioni');
  var deltaText = '';
  if (deltaPerc !== null) {
    var deltaIcon = deltaPerc >= 0 ? '↑' : '↓';
    var deltaCol = deltaPerc >= 0 ? '#27500A' : '#791F1F';
    deltaText = '<span style="color:' + deltaCol + ';font-weight:600">' + deltaIcon + ' ' + Math.abs(deltaPerc * 100).toFixed(0) + '%</span> vs ' + (anno - 1);
  }
  html += _antsKpiCard('Anticipato ' + (anno - 1), _antsFmtImporto(totAnnoPrec) + ' €', '#412402', '#FAEEDA', '#BA7517', deltaText);
  html += _antsKpiCard('Totale vita banca', _antsFmtImporto(totVita) + ' €', '#0C447C', '#E6F1FB', '#185FA5', nVita + ' presentazioni');
  html += _antsKpiCard('Importo medio', _antsFmtImporto(mediaVita) + ' €', '#412402', '#FAEEDA', '#BA7517', 'su tutte le presentazioni');
  html += '</div>';

  if (presAnno.length === 0) {
    html += '<div style="background:var(--bg);border-radius:6px;padding:30px;text-align:center;color:var(--text-muted);font-style:italic;font-size:12px">';
    html += 'Nessuna presentazione su <strong>' + _antsEsc(nomeBanca) + '</strong> nel ' + anno + '.';
    html += '</div>';
    return html;
  }

  // Aggregazione mensile
  var perMese = [];
  for (var m = 0; m < 12; m++) perMese.push({ mese: m, n: 0, lordo: 0, anticipato: 0, estinto: 0, insoluto: 0 });
  presAnno.forEach(function(p) {
    if (p._mese == null) return;
    var b = perMese[p._mese];
    b.n++;
    b.lordo += Number(p.importo_richiesto || 0);
    b.anticipato += Number(p.importo_anticipato_totale || 0);
    if (p.stato === 'estinta') b.estinto += Number(p.importo_anticipato_totale || 0);
    if (p.stato === 'insoluta') b.insoluto += Number(p.importo_anticipato_totale || 0);
  });

  // Tabella mensile con colonna "Vedi"
  html += '<div style="background:var(--bg);border-radius:6px;overflow:hidden;border:0.5px solid var(--border)">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
  html += '<thead><tr style="background:#FAF8F2">';
  html += '<th style="padding:8px 10px;text-align:left;font-weight:600;border-bottom:0.5px solid var(--border)">Mese</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;border-bottom:0.5px solid var(--border)">N°</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;border-bottom:0.5px solid var(--border)">Richiesto (€)</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;border-bottom:0.5px solid var(--border)">Anticipato (€)</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;border-bottom:0.5px solid var(--border)">Rientrato (€)</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;border-bottom:0.5px solid var(--border)">Insoluti (€)</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;border-bottom:0.5px solid var(--border)">% Ins.</th>';
  html += '<th style="padding:8px 10px;text-align:center;font-weight:600;border-bottom:0.5px solid var(--border);background:#FFF7E6">📋 Fatture</th>';
  html += '</tr></thead><tbody>';

  perMese.forEach(function(m) {
    if (m.n === 0) return;
    var pIns = m.anticipato > 0 ? (m.insoluto / m.anticipato) : 0;
    var rowBg = pIns > 0.05 ? '#FCEBEB' : '';
    html += '<tr style="border-bottom:0.5px solid var(--border)' + (rowBg ? ';background:' + rowBg : '') + '">';
    html += '<td style="padding:8px 10px">' + _ANTS_MESI_FULL[m.mese] + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono)">' + m.n + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono)">' + _antsFmtImportoDec(m.lordo) + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-weight:500;color:#173404">' + _antsFmtImportoDec(m.anticipato) + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);color:#0C447C">' + _antsFmtImportoDec(m.estinto) + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);color:' + (m.insoluto > 0 ? '#A32D2D;font-weight:500' : 'var(--text-muted)') + '">' + (m.insoluto > 0 ? _antsFmtImportoDec(m.insoluto) : '—') + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);color:' + (pIns > 0 ? '#A32D2D' : 'var(--text-muted)') + '">' + (pIns > 0 ? _antsFmtPerc(pIns) : '—') + '</td>';
    html += '<td style="padding:6px 10px;text-align:center"><button onclick="_antsApriElencoFatture(\'' + _antsEsc(bancaId) + '\', ' + m.mese + ')" style="background:white;border:0.5px solid #BA7517;color:#BA7517;font-size:10px;padding:3px 8px;border-radius:3px;cursor:pointer">📋 Vedi</button></td>';
    html += '</tr>';
  });

  // Totale
  var totN = perMese.reduce(function(s, m) { return s + m.n; }, 0);
  var totLordo = perMese.reduce(function(s, m) { return s + m.lordo; }, 0);
  var totAnticipato = perMese.reduce(function(s, m) { return s + m.anticipato; }, 0);
  var totEstinto = perMese.reduce(function(s, m) { return s + m.estinto; }, 0);
  var totInsoluto = perMese.reduce(function(s, m) { return s + m.insoluto; }, 0);
  var pInsTot = totAnticipato > 0 ? (totInsoluto / totAnticipato) : 0;

  html += '<tr style="background:#F1EFE8;font-weight:600">';
  html += '<td style="padding:9px 10px">TOTALE ' + anno + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono)">' + totN + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono)">' + _antsFmtImportoDec(totLordo) + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);color:#173404">' + _antsFmtImportoDec(totAnticipato) + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);color:#0C447C">' + _antsFmtImportoDec(totEstinto) + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);color:' + (totInsoluto > 0 ? '#A32D2D' : 'var(--text-muted)') + '">' + (totInsoluto > 0 ? _antsFmtImportoDec(totInsoluto) : '—') + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);color:' + (pInsTot > 0 ? '#A32D2D' : 'var(--text-muted)') + '">' + (pInsTot > 0 ? _antsFmtPerc(pInsTot) : '—') + '</td>';
  html += '<td style="padding:9px 10px;text-align:center;color:#888">—</td>';
  html += '</tr>';

  html += '</tbody></table></div>';

  return html;
}


// KPI card helper
function _antsKpiCard(label, value, vColor, bg, border, sub) {
  var html = '<div style="background:' + bg + ';border-left:3px solid ' + border + ';padding:10px 14px;border-radius:6px">';
  html += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.4px;font-weight:500;color:' + vColor + ';opacity:0.85">' + _antsEsc(label) + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:500;color:' + vColor + ';margin-top:3px">' + value + '</div>';
  if (sub) html += '<div style="font-size:10px;color:' + vColor + ';opacity:0.75;margin-top:3px">' + sub + '</div>';
  html += '</div>';
  return html;
}


// ════════════════════════════════════════════════════════════════════════
// MODALE ELENCO FATTURE
// ════════════════════════════════════════════════════════════════════════
// bancaId, mese (null=tutto anno)
function _antsApriElencoFatture(bancaId, mese) {
  // Stato modale
  window._antsElencoStato = {
    bancaId: bancaId,
    mese: mese,
    filtro: 'tutte'  // 'tutte' | 'rientrata' | 'insoluta' | 'attiva'
  };
  _antsRenderElencoFatture();
}


function _antsRenderElencoFatture() {
  var st = window._antsElencoStato;
  if (!st) return;

  var banca = _antsStato.banche.find(function(b) { return b.id === st.bancaId; });
  if (!banca) return;
  var anno = _antsStato.annoCorrente;

  // Filtro presentazioni della banca + anno + (mese se specificato)
  var presFiltrate = _antsStato.presentazioni.filter(function(p) {
    if (p._istituto_id !== st.bancaId) return false;
    if (p._anno !== anno) return false;
    if (st.mese != null && p._mese !== st.mese) return false;
    return true;
  });

  var presIds = {};
  presFiltrate.forEach(function(p) { presIds[p.id] = p; });

  // Patch v20260503j: classifico fatture in base allo STATO PRESENTAZIONE (non fattura)
  // Logica:
  //   - "rientrate" = fatture di presentazioni con stato='estinta'
  //   - "insolute"  = fatture di presentazioni con stato='insoluta'
  //   - "attive"    = fatture di presentazioni con stato='anticipata' o 'anticipata_parziale'
  //   - "tutte"     = tutte e tre le categorie sopra
  // Le fatture con f.stato='esclusa' sono SEMPRE escluse (Opzione A confermata).
  function statoPresFattura(f) {
    var p = presIds[f.presentazione_id];
    if (!p) return null;
    if (p.stato === 'estinta') return 'rientrata';
    if (p.stato === 'insoluta') return 'insoluta';
    if (p.stato === 'anticipata' || p.stato === 'anticipata_parziale') return 'attiva';
    return null;
  }

  // Filtro fatture: in tutti i casi escludo le 'esclusa' e quelle di presentazioni
  // non visibili nel filtro corrente
  var fatturePool = _antsStato.fatture.filter(function(f) {
    if (f.stato === 'esclusa') return false;
    if (!presIds[f.presentazione_id]) return false;
    var sp = statoPresFattura(f);
    return sp != null;
  });

  // Conteggi per le 4 tab
  var nRientrate = fatturePool.filter(function(f) { return statoPresFattura(f) === 'rientrata'; }).length;
  var nInsolute = fatturePool.filter(function(f) { return statoPresFattura(f) === 'insoluta'; }).length;
  var nAttive = fatturePool.filter(function(f) { return statoPresFattura(f) === 'attiva'; }).length;
  var nTutte = nRientrate + nInsolute + nAttive;

  // Filtro corrente
  var fatturePres = fatturePool.filter(function(f) {
    var sp = statoPresFattura(f);
    if (st.filtro === 'tutte') return true;
    return sp === st.filtro;
  });

  var totImporto = fatturePres.reduce(function(s, f) { return s + Number(f.totale_fattura || 0); }, 0);

  var titoloPeriodo = st.mese != null
    ? _ANTS_MESI_FULL[st.mese] + ' ' + anno
    : 'Anno ' + anno;

  // Rimuovo eventuale modal esistente
  var existing = document.getElementById('ants-elenco-modal');
  if (existing) existing.remove();

  var html = '<div id="ants-elenco-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)_antsChiudiElenco()">';
  html += '<div style="background:white;border-radius:12px;width:100%;max-width:1100px;height:calc(100vh - 40px);display:flex;flex-direction:column;box-shadow:0 16px 48px rgba(0,0,0,0.4);overflow:hidden">';

  // Header
  html += '<div style="padding:14px 20px;border-bottom:0.5px solid var(--border);background:#FAF8F2;flex-shrink:0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">';
  html += '<div>';
  html += '<div style="font-size:14px;font-weight:500;color:var(--text)">📋 Fatture anticipate · ' + _antsEsc(banca.nome) + ' · ' + titoloPeriodo + '</div>';
  html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' + presFiltrate.length + ' presentazioni · ' + fatturePres.length + ' fatture · € ' + _antsFmtImporto(totImporto) + '</div>';
  html += '</div>';
  html += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">';

  // Toggle 4 tab: Tutte / Rientrate / Insolute / Attive (ordine richiesto utente)
  html += '<div style="display:flex;background:#f0f0f0;border-radius:5px;padding:2px">';
  html += _antsTabBtn('tutte', 'Tutte (' + nTutte + ')', st.filtro === 'tutte', '#0C447C');
  html += _antsTabBtn('rientrata', '✓ Rientrate (' + nRientrate + ')', st.filtro === 'rientrata', '#0C447C');
  html += _antsTabBtn('insoluta', '✗ Insolute (' + nInsolute + ')', st.filtro === 'insoluta', '#A32D2D');
  html += _antsTabBtn('attiva', '🟢 Attive (' + nAttive + ')', st.filtro === 'attiva', '#27500A');
  html += '</div>';

  html += '<button onclick="_antsStampaElenco()" style="background:#185FA5;color:white;font-size:11px;padding:6px 12px;border:0;border-radius:4px;font-weight:500;cursor:pointer">🖨️ Stampa</button>';
  html += '<button onclick="_antsChiudiElenco()" style="background:white;border:0.5px solid var(--border);font-size:14px;padding:6px 10px;border-radius:5px;cursor:pointer">✕</button>';
  html += '</div>';
  html += '</div>';

  // Body con tabella
  html += '<div style="flex:1;overflow-y:auto;padding:14px 20px;min-height:0">';

  if (fatturePres.length === 0) {
    html += '<div style="text-align:center;padding:40px;color:#888;font-style:italic">Nessuna fattura per i criteri selezionati.</div>';
  } else {
    html += '<div style="background:var(--bg);border-radius:6px;overflow:hidden;border:0.5px solid var(--border)">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr style="background:white">';
    html += '<th style="padding:7px 9px;text-align:left;border-bottom:0.5px solid var(--border)">Modulo SBF</th>';
    html += '<th style="padding:7px 9px;text-align:left;border-bottom:0.5px solid var(--border)">Data pres.</th>';
    html += '<th style="padding:7px 9px;text-align:left;border-bottom:0.5px solid var(--border)">N° Fattura</th>';
    html += '<th style="padding:7px 9px;text-align:left;border-bottom:0.5px solid var(--border)">Cliente</th>';
    html += '<th style="padding:7px 9px;text-align:right;border-bottom:0.5px solid var(--border)">Importo</th>';
    html += '<th style="padding:7px 9px;text-align:left;border-bottom:0.5px solid var(--border)">Scadenza</th>';
    html += '<th style="padding:7px 9px;text-align:center;border-bottom:0.5px solid var(--border)">Stato</th>';
    html += '</tr></thead><tbody>';

    // Ordinamento: prima per stato (rientrate, insolute, attive), poi per data presentazione decrescente
    var ordineStato = { rientrata: 1, insoluta: 2, attiva: 3 };
    fatturePres.sort(function(a, b) {
      var sa = statoPresFattura(a), sb = statoPresFattura(b);
      if (sa !== sb) return (ordineStato[sa] || 9) - (ordineStato[sb] || 9);
      var pa = presIds[a.presentazione_id], pb = presIds[b.presentazione_id];
      if (pa.data_presentazione !== pb.data_presentazione) {
        return (pa.data_presentazione < pb.data_presentazione) ? 1 : -1;
      }
      return (a.numero_fattura || '').localeCompare(b.numero_fattura || '');
    });

    fatturePres.forEach(function(f) {
      var p = presIds[f.presentazione_id];
      var protocollo = p.numero_protocollo || ('P-' + p.id.substring(0, 6));
      var sp = statoPresFattura(f);
      var rowBg = sp === 'insoluta' ? 'background:#FCEBEB;' : (sp === 'rientrata' ? 'background:#F4F9FE;' : '');
      html += '<tr style="border-bottom:0.5px solid var(--border);' + rowBg + '">';
      html += '<td style="padding:5px 9px;font-family:var(--font-mono);font-size:10px">' + _antsEsc(protocollo) + '</td>';
      html += '<td style="padding:5px 9px">' + _antsFmtData(p.data_presentazione) + '</td>';
      html += '<td style="padding:5px 9px">' + _antsEsc(f.numero_fattura || '—') + '</td>';
      html += '<td style="padding:5px 9px">' + _antsEsc((f.cliente_nome || '—').substring(0, 50)) + '</td>';
      html += '<td style="padding:5px 9px;text-align:right;font-family:var(--font-mono)">' + _antsFmtImportoDec(f.totale_fattura) + '</td>';
      html += '<td style="padding:5px 9px">' + _antsFmtData(f.scadenza_banca) + '</td>';
      html += '<td style="padding:5px 9px;text-align:center">' + _antsBadgeStatoPres(sp) + '</td>';
      html += '</tr>';
    });

    // Totale
    html += '<tr style="background:#F1EFE8;font-weight:600">';
    html += '<td style="padding:8px 9px" colspan="4">TOTALE</td>';
    html += '<td style="padding:8px 9px;text-align:right;font-family:var(--font-mono)">' + _antsFmtImportoDec(totImporto) + '</td>';
    html += '<td style="padding:8px 9px" colspan="2"></td>';
    html += '</tr>';

    html += '</tbody></table></div>';
  }

  html += '</div>';

  html += '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
}


// Helper button tab
function _antsTabBtn(filtro, label, attivo, colore) {
  return '<button onclick="_antsCambiaFiltro(\'' + filtro + '\')" style="background:' + (attivo ? colore : 'transparent') + ';color:' + (attivo ? 'white' : '#444') + ';font-size:10px;padding:5px 10px;border:0;border-radius:4px;font-weight:500;cursor:pointer">' + label + '</button>';
}


// Badge basato sullo stato della presentazione (più significativo dello stato fattura)
function _antsBadgeStatoPres(sp) {
  var bg, color, label;
  if (sp === 'attiva') { bg = '#EAF3DE'; color = '#27500A'; label = '🟢 Attiva'; }
  else if (sp === 'rientrata') { bg = '#E6F1FB'; color = '#0C447C'; label = '✓ Rientrata'; }
  else if (sp === 'insoluta') { bg = '#FCEBEB'; color = '#A32D2D'; label = '✗ Insoluta'; }
  else { bg = '#F1EFE8'; color = '#666'; label = '—'; }
  return '<span style="background:' + bg + ';color:' + color + ';font-size:9px;padding:1px 6px;border-radius:3px;font-weight:600">' + _antsEsc(label) + '</span>';
}


function _antsChiudiElenco() {
  var m = document.getElementById('ants-elenco-modal');
  if (m) m.remove();
  window._antsElencoStato = null;
}


function _antsCambiaFiltro(filtro) {
  if (!window._antsElencoStato) return;
  window._antsElencoStato.filtro = filtro;
  _antsRenderElencoFatture();
}


// ════════════════════════════════════════════════════════════════════════
// STAMPA ELENCO (window.print)
// ════════════════════════════════════════════════════════════════════════
function _antsStampaElenco() {
  var st = window._antsElencoStato;
  if (!st) return;

  var banca = _antsStato.banche.find(function(b) { return b.id === st.bancaId; });
  if (!banca) return;
  var anno = _antsStato.annoCorrente;

  var presFiltrate = _antsStato.presentazioni.filter(function(p) {
    if (p._istituto_id !== st.bancaId) return false;
    if (p._anno !== anno) return false;
    if (st.mese != null && p._mese !== st.mese) return false;
    return true;
  });
  var presIds = {};
  presFiltrate.forEach(function(p) { presIds[p.id] = p; });

  // Patch v20260503j: stesso criterio del modale (stato presentazione)
  function statoPresFattura(f) {
    var p = presIds[f.presentazione_id];
    if (!p) return null;
    if (p.stato === 'estinta') return 'rientrata';
    if (p.stato === 'insoluta') return 'insoluta';
    if (p.stato === 'anticipata' || p.stato === 'anticipata_parziale') return 'attiva';
    return null;
  }

  var fatturePres = _antsStato.fatture.filter(function(f) {
    if (f.stato === 'esclusa') return false;
    if (!presIds[f.presentazione_id]) return false;
    var sp = statoPresFattura(f);
    if (sp == null) return false;
    if (st.filtro === 'tutte') return true;
    return sp === st.filtro;
  });

  var ordineStato = { rientrata: 1, insoluta: 2, attiva: 3 };
  fatturePres.sort(function(a, b) {
    var sa = statoPresFattura(a), sb = statoPresFattura(b);
    if (sa !== sb) return (ordineStato[sa] || 9) - (ordineStato[sb] || 9);
    var pa = presIds[a.presentazione_id], pb = presIds[b.presentazione_id];
    if (pa.data_presentazione !== pb.data_presentazione) return (pa.data_presentazione < pb.data_presentazione) ? 1 : -1;
    return (a.numero_fattura || '').localeCompare(b.numero_fattura || '');
  });

  var totImporto = fatturePres.reduce(function(s, f) { return s + Number(f.totale_fattura || 0); }, 0);
  var titoloPeriodo = st.mese != null ? _ANTS_MESI_FULL[st.mese] + ' ' + anno : 'Anno ' + anno;
  var filtroLabel = ({ tutte: 'Tutte', rientrata: 'Solo rientrate', insoluta: 'Solo insolute', attiva: 'Solo attive' })[st.filtro] || 'Tutte';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Elenco Fatture Anticipate — ' + _antsEsc(banca.nome) + '</title>';
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
  html += '.stato-attiva { background: #EAF3DE; color: #27500A; padding: 1px 5px; border-radius: 3px; font-size: 8.5pt; font-weight: 600; }';
  html += '.stato-rientrata { background: #E6F1FB; color: #0C447C; padding: 1px 5px; border-radius: 3px; font-size: 8.5pt; font-weight: 600; }';
  html += '.stato-insoluta { background: #FCEBEB; color: #A32D2D; padding: 1px 5px; border-radius: 3px; font-size: 8.5pt; font-weight: 600; }';
  html += '.row-insoluta { background: #FFF5F5; }';
  html += '.row-rientrata { background: #F8FBFE; }';
  html += '.no-print { position: fixed; bottom: 20px; right: 20px; }';
  html += '@media print { .no-print { display: none !important; } }';
  html += '</style></head><body>';

  html += '<h1>📋 Elenco Fatture Anticipate</h1>';
  html += '<div class="meta"><strong>' + _antsEsc(banca.nome) + '</strong> · ' + _antsEsc(titoloPeriodo) + ' · Filtro: ' + filtroLabel + ' · ' + presFiltrate.length + ' presentazioni · ' + fatturePres.length + ' fatture · totale € ' + _antsFmtImportoDec(totImporto) + '</div>';

  html += '<table><thead><tr>';
  html += '<th>Modulo SBF</th><th>Data pres.</th><th>N° Fattura</th><th>Data fattura</th><th>Cliente</th><th>Importo (€)</th><th>Scadenza</th><th>Stato</th>';
  html += '</tr></thead><tbody>';

  fatturePres.forEach(function(f) {
    var p = presIds[f.presentazione_id];
    var prot = p.numero_protocollo || ('P-' + p.id.substring(0, 6));
    var sp = statoPresFattura(f);
    var rowCls = sp === 'insoluta' ? 'row-insoluta' : (sp === 'rientrata' ? 'row-rientrata' : '');
    var statoCls = 'stato-' + sp;
    var statoLabel = sp === 'attiva' ? 'Attiva' : (sp === 'rientrata' ? 'Rientrata' : (sp === 'insoluta' ? 'Insoluta' : '—'));
    html += '<tr class="' + rowCls + '">';
    html += '<td>' + _antsEsc(prot) + '</td>';
    html += '<td>' + _antsFmtData(p.data_presentazione) + '</td>';
    html += '<td>' + _antsEsc(f.numero_fattura || '—') + '</td>';
    html += '<td>' + _antsFmtData(f.data_emissione) + '</td>';
    html += '<td>' + _antsEsc((f.cliente_nome || '—').substring(0, 60)) + '</td>';
    html += '<td class="num">' + _antsFmtImportoDec(f.totale_fattura) + '</td>';
    html += '<td>' + _antsFmtData(f.scadenza_banca) + '</td>';
    html += '<td><span class="' + statoCls + '">' + _antsEsc(statoLabel) + '</span></td>';
    html += '</tr>';
  });

  html += '<tr class="totale"><td colspan="5">TOTALE</td><td class="num">' + _antsFmtImportoDec(totImporto) + '</td><td colspan="2"></td></tr>';
  html += '</tbody></table>';

  html += '<div style="margin-top:14px;font-size:8pt;color:#888;text-align:center;border-top:0.5px solid #ccc;padding-top:6px">PhoenixFuel ERP — Stampato il ' + _antsFmtData(new Date().toISOString().split('T')[0]) + '</div>';

  html += '<div class="no-print"><button onclick="window.print()" style="padding:8px 16px;margin:0 4px;background:#185FA5;color:white;border:0;border-radius:6px;cursor:pointer;font-size:11pt">🖨️ Stampa</button>';
  html += '<button onclick="window.close()" style="padding:8px 16px;margin:0 4px;background:#A32D2D;color:white;border:0;border-radius:6px;cursor:pointer;font-size:11pt">✕ Chiudi</button></div>';
  html += '<script>window.onload=function(){setTimeout(function(){window.print()},500)}</' + 'script>';
  html += '</body></html>';

  var w = window.open('', '_blank', 'width=1100,height=800');
  w.document.open();
  w.document.write(html);
  w.document.close();
}


// ════════════════════════════════════════════════════════════════════════
// Navigazione
// ════════════════════════════════════════════════════════════════════════
function _antsCambiaAnno(anno) {
  _antsStato.annoCorrente = parseInt(anno, 10);
  // Ricarica completa: il fatturato consumo dipende dall'anno
  renderAntStorico();
}

function _antsSelezionaBanca(bancaId) {
  _antsStato.bancaSelezionataId = bancaId;
  _antsRiRender();
}

function _antsRiRender() {
  var el = document.getElementById('ant-storico-content');
  if (!el) return;
  var anniSet = {};
  _antsStato.presentazioni.forEach(function(p) { if (p._anno) anniSet[p._anno] = true; });
  var anniArr = Object.keys(anniSet).map(function(a) { return parseInt(a, 10); }).sort(function(a, b) { return b - a; });
  if (anniArr.length === 0) anniArr = [new Date().getFullYear()];
  el.innerHTML = _antsRenderHtml(_antsStato.banche, anniArr);
}

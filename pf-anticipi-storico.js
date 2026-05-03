// ═══════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Storico Anticipi per Banca (Patch v20260503h)
// ═══════════════════════════════════════════════════════════════════════════
// Tab "📊 Storico Anticipi" dentro Banche.
// Mostra totali storici per banca, anno, mese delle presentazioni SBF.
//
// Layout:
//   1. Selettore anno + sub-tabs banche (dinamiche da banche_affidamenti)
//   2. Per banca selezionata:
//      - 4 KPI in alto (totali anno corrente, anno precedente, vita, importo medio)
//      - Tabella mensile (12 righe): n° presentazioni, lordo richiesto,
//        anticipato netto, rientrato, insoluti, % insoluti
//      - Grafico barre mensile
//
// Esclude presentazioni con stato='rifiutata' (Opzione B) — non rappresentano
// operatività bancaria reale.
// ═══════════════════════════════════════════════════════════════════════════


// ────────────────────────────────────────────────────────────────────────
// Stato globale
// ────────────────────────────────────────────────────────────────────────
var _antsStato = {
  annoCorrente: new Date().getFullYear(),
  bancaSelezionataId: null,
  banche: [],          // istituti che hanno almeno una presentazione SBF storica
  presentazioni: []    // cache delle presentazioni caricate
};

// Stati inclusi nello storico (Opzione B: tutti tranne 'rifiutata')
var _ANTS_STATI_VALIDI = ['anticipata', 'anticipata_parziale', 'estinta', 'insoluta'];


// ────────────────────────────────────────────────────────────────────────
// Helper formattazione
// ────────────────────────────────────────────────────────────────────────
function _antsFmtImporto(n) {
  return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function _antsFmtImportoDec(n) {
  return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _antsFmtImpKb(n) {
  var v = Number(n || 0);
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + 'k';
  return v.toFixed(0);
}

function _antsFmtPerc(n) {
  return (Number(n || 0) * 100).toFixed(1) + '%';
}

var _ANTS_MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
var _ANTS_MESI_FULL = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];


// ────────────────────────────────────────────────────────────────────────
// MAIN: render storico
// ────────────────────────────────────────────────────────────────────────
async function renderAntStorico() {
  var el = document.getElementById('ant-storico-content');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">⏳ Caricamento storico...</div>';

  // Carico tutte le presentazioni SBF (escluse rifiutate) + affidamenti per banca
  var [resPres, resAff, resIst] = await Promise.all([
    sb.from('anticipi_sbf_presentazioni').select('id,affidamento_id,data_presentazione,importo_richiesto,importo_anticipato_totale,stato,scadenza_banca_default').in('stato', _ANTS_STATI_VALIDI).order('data_presentazione', { ascending: false }),
    sb.from('banche_affidamenti').select('id,istituto_id,stato'),
    sb.from('banche_istituti').select('id,nome')
  ]);

  if (resPres.error) {
    el.innerHTML = '<div style="padding:20px;color:#A32D2D">Errore caricamento: ' + _antsEsc(resPres.error.message) + '</div>';
    return;
  }

  var presentazioni = resPres.data || [];
  var affidamenti = resAff.data || [];
  var istituti = resIst.data || [];

  // Mappa affidamento_id → istituto_id → nome
  var mappaAff = {};
  affidamenti.forEach(function(a) { mappaAff[a.id] = a.istituto_id; });
  var mappaIst = {};
  istituti.forEach(function(i) { mappaIst[i.id] = i.nome; });

  // Arricchisco presentazioni con istituto_id e nome banca
  presentazioni.forEach(function(p) {
    p._istituto_id = mappaAff[p.affidamento_id];
    p._banca_nome = mappaIst[p._istituto_id] || '—';
    p._anno = p.data_presentazione ? new Date(p.data_presentazione).getFullYear() : null;
    p._mese = p.data_presentazione ? new Date(p.data_presentazione).getMonth() : null;
  });

  _antsStato.presentazioni = presentazioni;

  // Banche distinte (solo quelle con almeno una presentazione storica)
  var banche = [];
  var bancheVisti = {};
  presentazioni.forEach(function(p) {
    if (p._istituto_id && !bancheVisti[p._istituto_id]) {
      bancheVisti[p._istituto_id] = true;
      banche.push({ id: p._istituto_id, nome: p._banca_nome });
    }
  });

  // Ordinamento banche: Intesa → MPS → BNL → BCC → altre alfabetico
  banche.sort(function(a, b) {
    var pa = _antsPrioritaBanca(a.nome);
    var pb = _antsPrioritaBanca(b.nome);
    if (pa !== pb) return pa - pb;
    return a.nome.localeCompare(b.nome);
  });

  _antsStato.banche = banche;

  // Default: prima banca selezionata
  if (!_antsStato.bancaSelezionataId && banche.length > 0) {
    _antsStato.bancaSelezionataId = banche[0].id;
  }

  // Anni disponibili (dal più recente al più vecchio)
  var anniDisponibili = {};
  presentazioni.forEach(function(p) {
    if (p._anno) anniDisponibili[p._anno] = true;
  });
  var anniArr = Object.keys(anniDisponibili).map(function(a) { return parseInt(a, 10); }).sort(function(a, b) { return b - a; });
  if (anniArr.length === 0) anniArr = [new Date().getFullYear()];

  if (anniArr.indexOf(_antsStato.annoCorrente) < 0) {
    _antsStato.annoCorrente = anniArr[0];
  }

  // Render finale
  el.innerHTML = _antsRenderHtml(banche, anniArr);
}


function _antsPrioritaBanca(nome) {
  var n = (nome || '').toLowerCase();
  if (n.indexOf('intesa') >= 0) return 1;
  if (n.indexOf('mps') >= 0 || n.indexOf('monte') >= 0) return 2;
  if (n.indexOf('bnl') >= 0) return 3;
  if (n.indexOf('bcc') >= 0 || n.indexOf('credito cooperativo') >= 0) return 4;
  return 99;
}


function _antsEsc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// ────────────────────────────────────────────────────────────────────────
// Render principale
// ────────────────────────────────────────────────────────────────────────
function _antsRenderHtml(banche, anniArr) {
  if (banche.length === 0) {
    return '<div style="text-align:center;padding:40px;color:var(--text-muted);font-style:italic">' +
      'Nessuna presentazione SBF storica trovata.<br/>' +
      '<span style="font-size:11px">Crea il primo modulo dalla tab "📄 Anticipo Fatture".</span>' +
      '</div>';
  }

  var html = '';

  // Header con titolo + selettore anno
  html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">';
  html += '<div>';
  html += '<div style="font-size:15px;font-weight:500;color:var(--text)">📊 Storico Anticipi per Banca</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Totali presentazioni SBF anno per anno, mese per mese (escluse rifiutate)</div>';
  html += '</div>';

  html += '<div style="display:flex;gap:8px;align-items:center">';
  html += '<label style="font-size:11px;color:var(--text-muted)">Anno:</label>';
  html += '<select id="ants-sel-anno" onchange="_antsCambiaAnno(this.value)" style="font-size:12px;padding:5px 10px;border:0.5px solid var(--border);border-radius:4px">';
  anniArr.forEach(function(a) {
    html += '<option value="' + a + '"' + (a === _antsStato.annoCorrente ? ' selected' : '') + '>' + a + '</option>';
  });
  html += '</select>';
  html += '</div>';
  html += '</div>';

  // Sotto-tabs per banca
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;border-bottom:0.5px solid var(--border);padding-bottom:8px">';
  banche.forEach(function(b) {
    var attiva = b.id === _antsStato.bancaSelezionataId;
    html += '<button onclick="_antsSelezionaBanca(\'' + _antsEsc(b.id) + '\')" style="font-size:12px;padding:7px 14px;border-radius:5px;cursor:pointer;font-weight:500;';
    if (attiva) {
      html += 'background:#0C447C;color:white;border:1px solid #0C447C';
    } else {
      html += 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)';
    }
    html += '">' + _antsEsc(b.nome) + '</button>';
  });
  html += '</div>';

  // Contenuto banca selezionata
  html += '<div id="ants-contenuto-banca">';
  html += _antsRenderContenutoBanca();
  html += '</div>';

  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Contenuto per banca selezionata
// ────────────────────────────────────────────────────────────────────────
function _antsRenderContenutoBanca() {
  var bancaId = _antsStato.bancaSelezionataId;
  if (!bancaId) return '<div style="padding:20px;color:var(--text-muted)">Seleziona una banca</div>';

  var banca = _antsStato.banche.find(function(b) { return b.id === bancaId; });
  var nomeBanca = banca ? banca.nome : '—';
  var anno = _antsStato.annoCorrente;

  // Filtro presentazioni per questa banca
  var presBanca = _antsStato.presentazioni.filter(function(p) { return p._istituto_id === bancaId; });
  var presAnno = presBanca.filter(function(p) { return p._anno === anno; });
  var presAnnoPrec = presBanca.filter(function(p) { return p._anno === (anno - 1); });

  // KPI
  var totAnno = presAnno.reduce(function(s, p) { return s + Number(p.importo_anticipato_totale || 0); }, 0);
  var totAnnoPrec = presAnnoPrec.reduce(function(s, p) { return s + Number(p.importo_anticipato_totale || 0); }, 0);
  var totVita = presBanca.reduce(function(s, p) { return s + Number(p.importo_anticipato_totale || 0); }, 0);
  var nVita = presBanca.length;
  var mediaVita = nVita > 0 ? totVita / nVita : 0;

  var deltaPerc = totAnnoPrec > 0 ? ((totAnno - totAnnoPrec) / totAnnoPrec) : null;

  var html = '';

  // KPI 4 cards
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:16px">';
  html += _antsKpiCard('Anticipato ' + anno, _antsFmtImporto(totAnno) + ' €', '#27500A', '#EAF3DE', '#639922', presAnno.length + ' presentazioni');
  var deltaText = '';
  if (deltaPerc !== null) {
    var deltaIcon = deltaPerc >= 0 ? '↑' : '↓';
    var deltaColor = deltaPerc >= 0 ? '#27500A' : '#791F1F';
    deltaText = '<span style="color:' + deltaColor + ';font-weight:600">' + deltaIcon + ' ' + Math.abs(deltaPerc * 100).toFixed(0) + '%</span> vs ' + (anno - 1);
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
  for (var m = 0; m < 12; m++) {
    perMese.push({ mese: m, n: 0, lordo: 0, anticipato: 0, estinto: 0, insoluto: 0, nInsolute: 0 });
  }
  presAnno.forEach(function(p) {
    if (p._mese == null) return;
    var bucket = perMese[p._mese];
    bucket.n++;
    bucket.lordo += Number(p.importo_richiesto || 0);
    bucket.anticipato += Number(p.importo_anticipato_totale || 0);
    if (p.stato === 'estinta') bucket.estinto += Number(p.importo_anticipato_totale || 0);
    if (p.stato === 'insoluta') {
      bucket.insoluto += Number(p.importo_anticipato_totale || 0);
      bucket.nInsolute++;
    }
  });

  // Trovo max per il grafico
  var maxAnt = perMese.reduce(function(m, x) { return Math.max(m, x.anticipato); }, 0);

  // Grafico barre mensile
  html += '<div style="background:var(--bg);padding:12px 14px;border-radius:6px;margin-bottom:14px">';
  html += '<div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.4px;font-weight:500;margin-bottom:10px">Distribuzione mensile ' + anno + '</div>';
  html += _antsRenderBarreMensili(perMese, maxAnt);
  html += '</div>';

  // Tabella mensile
  html += '<div style="background:var(--bg);border-radius:6px;overflow:hidden;border:0.5px solid var(--border)">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
  html += '<thead><tr style="background:#FAF8F2">';
  html += '<th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text);border-bottom:0.5px solid var(--border)">Mese</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;color:var(--text);border-bottom:0.5px solid var(--border)">N°</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;color:var(--text);border-bottom:0.5px solid var(--border)">Richiesto (€)</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;color:var(--text);border-bottom:0.5px solid var(--border)">Anticipato (€)</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;color:var(--text);border-bottom:0.5px solid var(--border)">Rientrato (€)</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;color:var(--text);border-bottom:0.5px solid var(--border)">Insoluti (€)</th>';
  html += '<th style="padding:8px 10px;text-align:right;font-weight:600;color:var(--text);border-bottom:0.5px solid var(--border)">% Insoluti</th>';
  html += '</tr></thead><tbody>';

  perMese.forEach(function(m) {
    if (m.n === 0) return;
    var pInsoluto = m.anticipato > 0 ? (m.insoluto / m.anticipato) : 0;
    var rowBg = pInsoluto > 0.05 ? '#FCEBEB' : '';
    html += '<tr style="border-bottom:0.5px solid var(--border)' + (rowBg ? ';background:' + rowBg : '') + '">';
    html += '<td style="padding:8px 10px">' + _ANTS_MESI_FULL[m.mese] + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono)">' + m.n + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono)">' + _antsFmtImportoDec(m.lordo) + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-weight:500;color:#173404">' + _antsFmtImportoDec(m.anticipato) + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);color:#0C447C">' + _antsFmtImportoDec(m.estinto) + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);color:' + (m.insoluto > 0 ? '#A32D2D;font-weight:500' : 'var(--text-muted)') + '">' + (m.insoluto > 0 ? _antsFmtImportoDec(m.insoluto) : '—') + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);color:' + (pInsoluto > 0 ? '#A32D2D' : 'var(--text-muted)') + '">' + (pInsoluto > 0 ? _antsFmtPerc(pInsoluto) : '—') + '</td>';
    html += '</tr>';
  });

  // Riga totale
  var totN = perMese.reduce(function(s, m) { return s + m.n; }, 0);
  var totLordo = perMese.reduce(function(s, m) { return s + m.lordo; }, 0);
  var totAnticipato = perMese.reduce(function(s, m) { return s + m.anticipato; }, 0);
  var totEstinto = perMese.reduce(function(s, m) { return s + m.estinto; }, 0);
  var totInsoluto = perMese.reduce(function(s, m) { return s + m.insoluto; }, 0);
  var pInsolutoTot = totAnticipato > 0 ? (totInsoluto / totAnticipato) : 0;

  html += '<tr style="background:#F1EFE8;font-weight:600">';
  html += '<td style="padding:9px 10px">TOTALE ' + anno + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono)">' + totN + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono)">' + _antsFmtImportoDec(totLordo) + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);color:#173404">' + _antsFmtImportoDec(totAnticipato) + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);color:#0C447C">' + _antsFmtImportoDec(totEstinto) + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);color:' + (totInsoluto > 0 ? '#A32D2D' : 'var(--text-muted)') + '">' + (totInsoluto > 0 ? _antsFmtImportoDec(totInsoluto) : '—') + '</td>';
  html += '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);color:' + (pInsolutoTot > 0 ? '#A32D2D' : 'var(--text-muted)') + '">' + (pInsolutoTot > 0 ? _antsFmtPerc(pInsolutoTot) : '—') + '</td>';
  html += '</tr>';

  html += '</tbody></table></div>';

  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render KPI card
// ────────────────────────────────────────────────────────────────────────
function _antsKpiCard(label, value, valueColor, bgColor, borderColor, sublabel) {
  var html = '<div style="background:' + bgColor + ';border-left:3px solid ' + borderColor + ';padding:10px 14px;border-radius:6px">';
  html += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.4px;font-weight:500;color:' + valueColor + ';opacity:0.85">' + _antsEsc(label) + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:500;color:' + valueColor + ';margin-top:3px">' + value + '</div>';
  if (sublabel) {
    html += '<div style="font-size:10px;color:' + valueColor + ';opacity:0.75;margin-top:3px">' + sublabel + '</div>';
  }
  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render barre mensili
// ────────────────────────────────────────────────────────────────────────
function _antsRenderBarreMensili(perMese, maxVal) {
  if (maxVal <= 0) maxVal = 1;
  var w = 720, h = 90;
  var slotW = w / 12;
  var barreW = Math.min(slotW * 0.6, 36);
  var spacingX = (slotW - barreW) / 2;
  var maxBarH = h - 22;

  var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:80px">';

  perMese.forEach(function(m, idx) {
    var x = idx * slotW + spacingX;
    var heAnt = (m.anticipato / maxVal) * maxBarH;
    var y = h - 18 - heAnt;
    if (heAnt > 0) {
      svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barreW.toFixed(1) + '" height="' + heAnt.toFixed(1) + '" fill="#639922" rx="2"><title>' + _ANTS_MESI_FULL[m.mese] + ': ' + _antsFmtImportoDec(m.anticipato) + ' € · ' + m.n + ' presentazioni</title></rect>';
      // Insoluto sovrapposto in rosso (parte alta della barra)
      if (m.insoluto > 0) {
        var heIns = (m.insoluto / maxVal) * maxBarH;
        svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barreW.toFixed(1) + '" height="' + heIns.toFixed(1) + '" fill="#A32D2D" rx="2" opacity="0.85"><title>' + _ANTS_MESI_FULL[m.mese] + ': insoluti ' + _antsFmtImportoDec(m.insoluto) + ' €</title></rect>';
      }
    }
    // Label mese sotto
    svg += '<text x="' + (x + barreW/2).toFixed(1) + '" y="' + (h - 4) + '" text-anchor="middle" font-size="10" fill="#888">' + _ANTS_MESI[m.mese] + '</text>';
  });

  svg += '</svg>';
  // Legenda
  svg += '<div style="display:flex;gap:14px;margin-top:6px;font-size:10px;color:var(--text-muted)">';
  svg += '<span><span style="display:inline-block;width:9px;height:9px;background:#639922;border-radius:1px;margin-right:4px;vertical-align:middle"></span>Anticipato</span>';
  svg += '<span><span style="display:inline-block;width:9px;height:9px;background:#A32D2D;border-radius:1px;margin-right:4px;vertical-align:middle"></span>Insoluti</span>';
  svg += '</div>';

  return svg;
}


// ────────────────────────────────────────────────────────────────────────
// Navigazione
// ────────────────────────────────────────────────────────────────────────
function _antsCambiaAnno(anno) {
  _antsStato.annoCorrente = parseInt(anno, 10);
  _antsRiRender();
}

function _antsSelezionaBanca(bancaId) {
  _antsStato.bancaSelezionataId = bancaId;
  _antsRiRender();
}

function _antsRiRender() {
  // Re-render senza ricaricare i dati dal DB
  var el = document.getElementById('ant-storico-content');
  if (!el) return;

  // Anni disponibili (sempre stessi)
  var anniDisponibili = {};
  _antsStato.presentazioni.forEach(function(p) { if (p._anno) anniDisponibili[p._anno] = true; });
  var anniArr = Object.keys(anniDisponibili).map(function(a) { return parseInt(a, 10); }).sort(function(a, b) { return b - a; });
  if (anniArr.length === 0) anniArr = [new Date().getFullYear()];

  el.innerHTML = _antsRenderHtml(_antsStato.banche, anniArr);
}

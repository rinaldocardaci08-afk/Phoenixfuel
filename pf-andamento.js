// PhoenixFuel — Finanze: Andamento
// v20260804d — tre viste dentro Trimestrali (conto economico, budget costi,
//              confronto anni) e nessuna nuova linguetta in cima
// v20260804c — trasporti terzisti come voce 5.1 dentro Servizi: fuori dal
//              primo margine, dentro il secondo, e contati una volta sola
// v20260804b — acquisti al solo costo prodotto, come nel Report acquisti:
//              il trasporto e un debito verso il vettore e ha una riga sua
// v20260804a — via i colli di bottiglia: giacenze e budget tenuti in
//              memoria per data e per anno, e le due date in parallelo
// v20260803g — anche i due semestri accanto ai trimestri
// v20260803f — un calcolo solo per anno tenuto in memoria, ricavi con lo
//              stesso algoritmo di Vendite, e maschera dei costi
// v20260803e — le DUE VISTE del documento: A istituzionale e B operativo,
//              piu imposte stimate e utile netto in fondo alla cascata
// v20260803d — i ricavi si calcolano come nella sezione Vendite: prima
//              escludevo per errore le vendite dal nostro deposito
// v20260803c — due linguette separate: Giacenza Magazzini e Trimestrali
// v20260803b — aggiunto il CONTO ECONOMICO trimestrale
// v20260803a — primo pannello: VALORIZZAZIONE GIACENZE.
//
// Non ricalcola niente. Il sistema di riconciliazione con DAS e registro
// resta quello che c'e: questo pannello gli CHIEDE i litri a una data
// qualunque — gia conciliati e gia rettificati — e li valorizza al costo
// medio in vigore quel giorno. Da qui leggeranno anche i trimestrali,
// cosi il magazzino non falsa piu il conto economico.
//
// Il PDF e pensato per il commercialista: dice sempre come sono
// valorizzate le giacenze e se il dato e convalidato o calcolato.

var _andData = null;      // data di riferimento scelta
var _andGiac = null;      // ultimo risultato, per la stampa

function _andOggi() { return new Date().toISOString().split('T')[0]; }

function _andNum(v, dec) {
  if (v === null || v === undefined) return '—';
  var d = (dec === undefined) ? 0 : dec;
  return Number(v).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function _andEuro(v) { return v === null || v === undefined ? '—' : '\u20ac ' + _andNum(v, 2); }
function _andSede(s) { return s === 'deposito_vibo' ? 'Deposito Vibo' : (s === 'stazione_oppido' ? 'Stazione Oppido' : s); }
function _andIt(iso) { return iso ? iso.split('-').reverse().join('/') : '—'; }

async function caricaAndamento() {
  var cont = document.getElementById('and-content');
  if (!cont) return;
  if (!_andData) _andData = _andOggi();
  _andRenderGuscio();
  await _andCaricaGiacenze();
}

function _andRenderGuscio() {
  var cont = document.getElementById('and-content');
  if (!cont) return;
  var h = '';
  h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">';
  h += '<span style="font-size:12px;color:var(--text-muted)">Giacenze alla data</span>';
  h += '<input type="date" id="and-data" value="' + _andData + '" onchange="andCambiaData(this.value)"'
     + ' style="padding:7px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:var(--font-mono)">';
  h += '<button onclick="andCambiaData(\'' + _andOggi() + '\')" style="font-size:12px;padding:7px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">Oggi</button>';
  h += '<button onclick="andCambiaData(\'' + (new Date().getFullYear() - 1) + '-12-31\')" style="font-size:12px;padding:7px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">Chiusura anno scorso</button>';
  h += '<span style="margin-left:auto"><button onclick="andStampaGiacenze()" style="font-size:12px;padding:7px 15px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">&#128424; Stampa o salva in PDF</button></span>';
  h += '</div>';
  h += '<div id="and-giacenze"><div class="loading" style="padding:24px">Calcolo le giacenze...</div></div>';
  cont.innerHTML = h;
}

function andCambiaData(v) {
  if (!v) return;
  _andData = v;
  var el = document.getElementById('and-data');
  if (el) el.value = v;
  _andCaricaGiacenze();
}

async function _andCaricaGiacenze() {
  var box = document.getElementById('and-giacenze');
  if (!box) return;
  box.innerHTML = '<div class="loading" style="padding:24px">Calcolo le giacenze al ' + _andIt(_andData) + '...</div>';
  try {
    _andGiac = await window.pfData.getValoreGiacenze(_andData);
    box.innerHTML = _andRenderGiacenze(_andGiac);
  } catch (e) {
    _andGiac = null;
    box.innerHTML = '<div style="padding:20px;color:#A32D2D;font-size:13px">Non riesco a calcolare le giacenze: '
      + esc((e && e.message) || String(e)) + '</div>';
  }
}

function _andRenderGiacenze(res) {
  var righe = res.righe || [];
  if (!righe.length) return '<div style="padding:20px;color:var(--text-muted);font-size:13px">Nessuna giacenza da valorizzare.</div>';

  // solo i prodotti che hanno litri o un valore: le righe a zero fanno
  // rumore e basta, ma si possono mostrare col pulsante
  var vive = righe.filter(function (r) { return Math.abs(Number(r.litri || 0)) > 0.5; });
  var mostrate = _andTutte ? righe : vive;
  var totale = vive.reduce(function (a, r) { return a + (r.valore || 0); }, 0);
  var senzaCosto = vive.filter(function (r) { return r.cmp === null; });
  var daCisterna = vive.filter(function (r) { return r.fonteCmp && r.fonteCmp.indexOf('cisterna') === 0; });

  var h = '';
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">';
  ['deposito_vibo', 'stazione_oppido'].forEach(function (sede) {
    var g = vive.filter(function (r) { return r.sede === sede; });
    if (!g.length) return;
    var v = g.reduce(function (a, r) { return a + (r.valore || 0); }, 0);
    var l = g.reduce(function (a, r) { return a + Number(r.litri || 0); }, 0);
    h += '<div style="flex:1;min-width:210px;background:var(--bg-kpi);border-radius:10px;padding:13px 15px">'
      + '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">' + _andSede(sede) + '</div>'
      + '<div style="font-size:21px;font-weight:700;font-family:var(--font-mono);margin-top:3px">' + _andEuro(v) + '</div>'
      + '<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">' + _andNum(l) + ' litri</div></div>';
  });
  h += '<div style="flex:1;min-width:210px;background:var(--bg-kpi);border-radius:10px;padding:13px 15px;border:0.5px solid var(--border)">'
    + '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Totale magazzino</div>'
    + '<div style="font-size:21px;font-weight:700;font-family:var(--font-mono);margin-top:3px">' + _andEuro(totale) + '</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">al ' + _andIt(res.data) + '</div></div>';
  h += '</div>';

  h += '<div class="card" style="padding:14px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:10px">';
  h += '<div style="font-size:13px;font-weight:600">Giacenze per sede e prodotto</div>';
  h += '<button onclick="andMostraTutte()" style="font-size:11px;padding:4px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-muted);cursor:pointer">'
     + (_andTutte ? 'nascondi i prodotti a zero' : 'mostra anche i prodotti a zero') + '</button>';
  h += '</div>';

  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">';
  h += '<tr style="color:var(--text-muted);text-align:right">'
    + '<th style="text-align:left;padding:6px 8px;font-weight:500">Sede</th>'
    + '<th style="text-align:left;padding:6px 8px;font-weight:500">Prodotto</th>'
    + '<th style="padding:6px 8px;font-weight:500">Litri</th>'
    + '<th style="padding:6px 8px;font-weight:500">di cui rettifiche</th>'
    + '<th style="padding:6px 8px;font-weight:500">Costo medio</th>'
    + '<th style="padding:6px 8px;font-weight:500">Valore</th></tr>';

  var sedePrec = null;
  mostrate.forEach(function (r) {
    var nuovaSede = (r.sede !== sedePrec); sedePrec = r.sede;
    h += '<tr style="border-top:0.5px solid var(--border);text-align:right">';
    h += '<td style="text-align:left;padding:7px 8px' + (nuovaSede ? ';font-weight:600' : ';color:var(--text-muted)') + '">'
       + (nuovaSede ? esc(_andSede(r.sede)) : '') + '</td>';
    h += '<td style="text-align:left;padding:7px 8px">' + esc(r.prodotto) + '</td>';
    h += '<td style="padding:7px 8px;font-family:var(--font-mono)">' + _andNum(r.litri) + '</td>';
    h += '<td style="padding:7px 8px;font-family:var(--font-mono);font-size:11.5px;color:'
       + (Number(r.rettifiche || 0) ? '#854F0B' : 'var(--text-muted)') + '">'
       + (Number(r.rettifiche || 0) ? (r.rettifiche > 0 ? '+' : '') + _andNum(r.rettifiche) : '—') + '</td>';
    h += '<td style="padding:7px 8px;font-family:var(--font-mono)"'
       + (r.dataCmp ? ' title="costo del ' + _andIt(r.dataCmp) + '"' : '') + '>'
       + (r.cmp === null ? '<span style="color:#A32D2D">nessun costo</span>' : _andNum(r.cmp, 6)) + '</td>';
    h += '<td style="padding:7px 8px;font-family:var(--font-mono);font-weight:700">' + _andEuro(r.valore) + '</td>';
    h += '</tr>';
  });
  h += '<tr style="border-top:0.5px solid var(--border-strong,var(--border));background:var(--bg-kpi);text-align:right">'
    + '<td colspan="5" style="text-align:left;padding:9px 8px;font-weight:600">TOTALE</td>'
    + '<td style="padding:9px 8px;font-family:var(--font-mono);font-weight:700;font-size:14px">' + _andEuro(totale) + '</td></tr>';
  h += '</table></div>';

  // quello che il commercialista deve sapere, scritto e non nascosto
  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:10px;line-height:1.7">';
  h += 'Litri presi dal sistema di riconciliazione con DAS e registro, rettifiche comprese. '
     + 'Valorizzazione al <strong>costo medio ponderato d\'acquisto in vigore alla data scelta</strong>: '
     + 'si usa sempre l\'ultimo costo registrato FINO a quel giorno, mai uno successivo.';
  if (daCisterna.length) {
    h += '<br><span style="color:#854F0B">Per ' + daCisterna.map(function (r) { return esc(r.prodotto); }).join(', ')
       + ' non c\'e storico del costo a quella data: usato il costo medio di oggi.</span>';
  }
  if (senzaCosto.length) {
    h += '<br><span style="color:#A32D2D">Senza costo e quindi non valorizzati: '
       + senzaCosto.map(function (r) { return esc(r.prodotto) + ' (' + _andSede(r.sede) + ')'; }).join(', ') + '.</span>';
  }
  h += '</div></div>';
  return h;
}

var _andTutte = false;
function andMostraTutte() {
  _andTutte = !_andTutte;
  if (_andGiac) {
    var box = document.getElementById('and-giacenze');
    if (box) box.innerHTML = _andRenderGiacenze(_andGiac);
  }
}

// Foglio per il commercialista: finestra pulita, si salva in PDF dal
// dialogo di stampa. Nessuna libreria.
function andStampaGiacenze() {
  if (!_andGiac || !(_andGiac.righe || []).length) {
    if (typeof toast === 'function') toast('Non ci sono giacenze da stampare');
    return;
  }
  var righe = _andGiac.righe.filter(function (r) { return Math.abs(Number(r.litri || 0)) > 0.5; });
  var totale = righe.reduce(function (a, r) { return a + (r.valore || 0); }, 0);
  var w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Il browser ha bloccato la finestra: consenti i popup e riprova'); return; }

  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8">'
    + '<title>Giacenze valorizzate al ' + _andIt(_andGiac.data) + '</title><style>'
    + 'body{font-family:Calibri,Arial,sans-serif;color:#222;margin:2cm;font-size:12.5px}'
    + 'h1{font-size:19px;margin:0 0 2px}.sub{color:#666;font-size:12px;margin-bottom:20px}'
    + 'table{width:100%;border-collapse:collapse;margin-bottom:14px}'
    + 'th{font-size:11px;color:#666;font-weight:600;border-bottom:1.5px solid #999;padding:6px 8px;text-align:right}'
    + 'th.l{text-align:left}td{border-bottom:1px solid #e5e5e5;padding:6px 8px;text-align:right;font-family:Consolas,monospace}'
    + 'td.l{text-align:left;font-family:Calibri,Arial,sans-serif}'
    + 'tr.sede td{background:#f3f3f3;font-weight:700;font-family:Calibri,Arial,sans-serif}'
    + 'tr.tot td{border-top:1.5px solid #999;border-bottom:none;font-weight:700;font-size:14px;padding-top:9px}'
    + '.note{color:#666;font-size:10.5px;margin-top:20px;border-top:1px solid #eee;padding-top:10px;line-height:1.7}'
    + '@media print{body{margin:1.6cm}}</style></head><body>';
  doc += '<h1>Phoenix Fuel S.r.l. &mdash; giacenze valorizzate</h1>';
  doc += '<div class="sub">Situazione al ' + _andIt(_andGiac.data) + ' &middot; deposito di Vibo Valentia e stazione di Oppido Mamertina</div>';
  doc += '<table><tr><th class="l">Prodotto</th><th>Litri</th><th>Costo medio &euro;/L</th><th>Valore &euro;</th></tr>';

  ['deposito_vibo', 'stazione_oppido'].forEach(function (sede) {
    var g = righe.filter(function (r) { return r.sede === sede; });
    if (!g.length) return;
    var vs = g.reduce(function (a, r) { return a + (r.valore || 0); }, 0);
    var ls = g.reduce(function (a, r) { return a + Number(r.litri || 0); }, 0);
    doc += '<tr class="sede"><td class="l" colspan="4">' + _andSede(sede) + '</td></tr>';
    g.forEach(function (r) {
      doc += '<tr><td class="l">' + r.prodotto + '</td><td>' + _andNum(r.litri) + '</td>'
        + '<td>' + (r.cmp === null ? '—' : _andNum(r.cmp, 6)) + '</td>'
        + '<td>' + (r.valore === null ? '—' : _andNum(r.valore, 2)) + '</td></tr>';
    });
    doc += '<tr><td class="l"><em>Totale ' + _andSede(sede) + '</em></td><td><em>' + _andNum(ls) + '</em></td>'
      + '<td></td><td><em>' + _andNum(vs, 2) + '</em></td></tr>';
  });
  doc += '<tr class="tot"><td class="l">TOTALE MAGAZZINO</td><td></td><td></td><td>' + _andNum(totale, 2) + '</td></tr>';
  doc += '</table>';

  var convalidate = righe.filter(function (r) { return (r.fonteIniziale || '').indexOf('convalidata') >= 0; }).length;
  doc += '<div class="note">';
  doc += '<strong>Come sono determinate.</strong> Le quantita provengono dal sistema di carico e scarico, '
      + 'riconciliato con i documenti di accompagnamento e con il registro di magazzino, e comprendono le rettifiche di inventario confermate '
      + '(cali di viaggio, cali tecnici, eccedenze, scatti a vuoto).<br>';
  doc += '<strong>Valorizzazione</strong> al costo medio ponderato d\'acquisto in vigore alla data indicata: '
      + 'per ciascun prodotto si applica l\'ultimo costo medio registrato fino a quel giorno.<br>';
  if (convalidate) {
    doc += '<strong>Nota.</strong> ' + convalidate + ' delle giacenze riportate partono da una chiusura d\'esercizio '
        + 'convalidata con rilevazione fisica; le altre sono calcolate dai movimenti.<br>';
  }
  var senza = righe.filter(function (r) { return r.cmp === null; });
  if (senza.length) {
    doc += '<strong>Non valorizzati</strong> per assenza di un costo di riferimento: '
        + senza.map(function (r) { return r.prodotto; }).join(', ') + '.<br>';
  }
  doc += 'Documento generato da PhoenixFuel il ' + new Date().toLocaleDateString('it-IT') + '.';
  doc += '</div></body></html>';

  w.document.write(doc);
  w.document.close();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}

// ═══ v20260803b · CONTO ECONOMICO TRIMESTRALE ══════════════════════
// Costruito sul sistema che gia esiste, non su stime.
//
//   RICAVI     = ingrosso (ordini a cliente: prezzo netto x litri)
//                + dettaglio (letture della stazione x prezzo netto)
//   COSTO DEL VENDUTO = acquisti del periodo
//                + rimanenza iniziale - rimanenza finale
//   Le rimanenze arrivano da pfData.getValoreGiacenze, che legge il
//   sistema di riconciliazione con DAS e registro (rettifiche comprese)
//   e valorizza al costo medio in vigore a quella data.
//
// Senza le rimanenze il trimestre in cui riempi il deposito risulterebbe
// in perdita e quello dopo in utile: e il motivo per cui in bilancio
// esiste la variazione delle rimanenze.
//
// Le voci che NON vengono dai movimenti (personale, servizi, godimento
// beni, oneri diversi, ammortamenti, oneri e proventi finanziari) sono
// prese dal budget e marcate con l'asterisco: sono stime finche non
// arriva il bilancio.

var CE_ALIQUOTA = 0.427;   // IRES + IRAP, aliquota usata nel suo bilancio
var _ceStile = 'A';        // A istituzionale · B operativo
function ceStile(x) { _ceStile = x; _ceRender(); }

var _ceAnno = new Date().getFullYear();
var _ceQ = null;         // 1..4 oppure 'anno'
var _ceDati = null;

var _CE_VOCI_BUDGET = [
  { id: 'personale',           label: 'Costi del personale' },
  { id: 'servizi',             label: 'Servizi' },
  { id: 'godimento_beni',      label: 'Godimento beni di terzi' },
  { id: 'oneri_diversi',       label: 'Oneri diversi di gestione' }
];

function _ceTrimestre(q, anno) {
  // v20260803g — anche i due semestri: H1 e H2. Costano nulla, perche i
  // periodi sono somme di mesi gia calcolati, e servono per confrontare
  // col totale di Vendite, che si legge al 30 giugno.
  var m = { 1: ['01-01', '03-31'], 2: ['04-01', '06-30'], 3: ['07-01', '09-30'], 4: ['10-01', '12-31'],
            h1: ['01-01', '06-30'], h2: ['07-01', '12-31'] }[q];
  return { dal: anno + '-' + m[0], al: anno + '-' + m[1] };
}

// Da quale mese parte il periodo e quanti mesi prende.
function _ceFinestra(q) {
  if (q === 'anno') return { da: 0, quanti: 12 };
  if (q === 'h1') return { da: 0, quanti: 6 };
  if (q === 'h2') return { da: 6, quanti: 6 };
  return { da: (q - 1) * 3, quanti: 3 };
}

// I trimestri di budget che compongono il periodo.
function _ceTrimestriDi(q) {
  if (q === 'anno') return [1, 2, 3, 4];
  if (q === 'h1') return [1, 2];
  if (q === 'h2') return [3, 4];
  return [q];
}

function _ceEtichetta(q, anno) {
  if (q === 'anno') return 'Esercizio ' + anno;
  if (q === 'h1') return 'Primo semestre ' + anno;
  if (q === 'h2') return 'Secondo semestre ' + anno;
  return 'Trimestre Q' + q + ' ' + anno;
}

// Giorno precedente, per la rimanenza di apertura: la giacenza al 31/03
// e la chiusura del primo trimestre e insieme l'apertura del secondo.
function _ceGiornoPrima(iso) {
  var d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// ═══ v20260803f · UN CALCOLO SOLO PER ANNO ═════════════════════════
// Prima ogni clic su Q1 o Q2 rifaceva tutte le query: lento e inutile,
// perche i mesi passati non cambiano. Ora l'anno si calcola UNA volta,
// resta in memoria, e i trimestri sono somme di mesi. Si rifa solo
// cambiando anno o toccando i costi.
//
// E soprattutto: ricavi ingrosso e dettaglio sono calcolati con LO
// STESSO ALGORITMO della sezione Vendite (pf-anagrafica.js), prezzo
// diverso in giornata compreso. Cosi i due numeri non possono divergere.
var _ceCache = {};        // anno -> { mesi:[12] }
var _ceCacheGiac = {};    // data -> valorizzazione giacenze
var _ceCacheBud = {};     // anno -> righe di budget
function ceSvuotaCache() { _ceCache = {}; _ceCacheGiac = {}; _ceCacheBud = {}; }

// La chiusura di un trimestre e l'apertura del successivo sono LA STESSA
// data: calcolandola una volta sola, passare da Q1 a Q2 non ricalcola
// niente. E le giacenze sono la parte lenta.
async function _ceGiacenze(data) {
  if (!_ceCacheGiac[data]) _ceCacheGiac[data] = await window.pfData.getValoreGiacenze(data);
  return _ceCacheGiac[data];
}

// v20260804a — Le cinque date di confine dell'anno (chiusura precedente e
// fine di ogni trimestre) si calcolano TUTTE INSIEME la prima volta.
// Cosi qualunque trimestre, semestre o anno si apra dopo, le giacenze
// sono gia pronte e non si aspetta piu nulla.
async function _ceGiacenzeAnno(anno) {
  var date = [(anno - 1) + '-12-31', anno + '-03-31', anno + '-06-30',
              anno + '-09-30', anno + '-12-31'];
  var mancanti = date.filter(function (d) { return !_ceCacheGiac[d]; });
  if (!mancanti.length) return;
  var res = await Promise.all(mancanti.map(function (d) {
    return window.pfData.getValoreGiacenze(d);
  }));
  mancanti.forEach(function (d, i) { _ceCacheGiac[d] = res[i]; });
}

async function _ceBudget(anno) {
  if (!_ceCacheBud[anno]) {
    var rb = await sb.from('budget_costi_annuali').select('*').eq('anno', anno);
    _ceCacheBud[anno] = rb.data || [];
  }
  return _ceCacheBud[anno];
}

async function _cePagina(tab, campi, da, a, extra) {
  var out = [], from = 0;
  for (var g = 0; g < 60; g++) {
    var q = sb.from(tab).select(campi).gte('data', da).lte('data', a);
    if (extra) q = extra(q);
    var r = await q.range(from, from + 999);
    if (r.error) throw r.error;
    var b = r.data || [];
    out = out.concat(b);
    if (b.length < 1000) break;
    from += 1000;
  }
  return out;
}

async function _ceCaricaAnno(anno) {
  if (_ceCache[anno]) return _ceCache[anno];
  var da = anno + '-01-01', a = anno + '-12-31';
  var daPrev = (anno - 1) + '-12-25';   // serve la lettura precedente al 1 gennaio

  var r = await Promise.all([
    // ingrosso: identico a Vendite
    _cePagina('ordini', 'data,litri,costo_litro,trasporto_litro,margine,iva', da, a,
      function (q) { return q.neq('stato', 'annullato').eq('tipo_ordine', 'cliente'); }),
    // acquisti: tutti gli ordini non annullati, i giri interni si tolgono dopo
    _cePagina('ordini', 'data,litri,costo_litro,trasporto_litro,fornitore,tipo_ordine', da, a,
      function (q) { return q.neq('stato', 'annullato'); }),
    sb.from('stazione_pompe').select('id,prodotto').eq('attiva', true),
    _cePagina('stazione_letture', 'data,pompa_id,lettura,litri_prezzo_diverso,prezzo_diverso', daPrev, a,
      function (q) { return q.order('data'); }),
    sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', da).lte('data', a),
    sb.from('stazione_costi').select('data,prodotto,costo_litro').gte('data', da).lte('data', a)
  ]);

  var allIng = r[0], allOrd = r[1];
  var pompeMap = {}; (r[2].data || []).forEach(function (p) { pompeMap[p.id] = p; });
  var prezziMap = {}; (r[4].data || []).forEach(function (p) { prezziMap[p.data + '_' + p.prodotto] = Number(p.prezzo_litro); });
  var costiMap = {}; (r[5].data || []).forEach(function (c) { costiMap[c.data + '_' + c.prodotto] = Number(c.costo_litro); });

  // dettaglio giorno per giorno, stesso identico calcolo di Vendite
  var lettPerData = {};
  (r[3] || []).forEach(function (l) { (lettPerData[l.data] = lettPerData[l.data] || []).push(l); });
  var dateOrd = Object.keys(lettPerData).sort();
  var dettPerGiorno = {};
  for (var di = 0; di < dateOrd.length; di++) {
    var data = dateOrd[di], prevD = di > 0 ? dateOrd[di - 1] : null;
    var litriG = 0, incassoG = 0, costoG = 0;
    if (prevD) {
      lettPerData[data].forEach(function (l) {
        var pompa = pompeMap[l.pompa_id]; if (!pompa) return;
        var pl = (lettPerData[prevD] || []).filter(function (x) { return x.pompa_id === l.pompa_id; })[0];
        if (!pl) return;
        var lv = Number(l.lettura) - Number(pl.lettura); if (lv <= 0) return;
        var pr = (prezziMap[data + '_' + pompa.prodotto] || 0) / 1.22;
        var co = costiMap[data + '_' + pompa.prodotto] || 0;
        var litriPD = Number(l.litri_prezzo_diverso || 0);
        var prezzoPD = Number(l.prezzo_diverso || 0) / 1.22;
        var hasCambio = litriPD > 0 && prezzoPD > 0;
        var litriStd = hasCambio ? Math.max(0, lv - litriPD) : lv;
        litriG += lv;
        incassoG += (litriStd * pr) + (hasCambio ? litriPD * prezzoPD : 0);
        costoG += lv * co;
      });
    }
    dettPerGiorno[data] = { litri: litriG, incasso: incassoG, costo: costoG };
  }

  var _noIva = function (o) {
    return (typeof prezzoNoIva === 'function')
      ? prezzoNoIva(o)
      : Number(o.costo_litro || 0) + Number(o.trasporto_litro || 0) + Number(o.margine || 0);
  };

  var mesi = [];
  for (var m = 0; m < 12; m++) {
    var pref = anno + '-' + String(m + 1).padStart(2, '0');
    var x = { ingLitri: 0, ingFatt: 0, ingMarg: 0, dettLitri: 0, dettInc: 0, dettCosto: 0,
              acquisti: 0, trasporti: 0, litriAcq: 0, nOrdiniAcq: 0, senzaPrezzo: 0 };
    allIng.forEach(function (o) {
      if (String(o.data).indexOf(pref) !== 0) return;
      var l = Number(o.litri || 0);
      x.ingLitri += l; x.ingFatt += _noIva(o) * l; x.ingMarg += Number(o.margine || 0) * l;
    });
    // v20260804b — ACQUISTI COME NEL REPORT ACQUISTI.
    // Regola scritta in pf-fornitore-analisi.js riga 20: il costo verso il
    // fornitore e SOLO `costo_litro`; il `trasporto_litro` e un debito
    // verso il VETTORE e si tiene separato. Sommandoli, i Trimestrali non
    // potevano combaciare col Report acquisti.
    // Il trasporto resta un costo dell'azienda, ma sta in una riga sua.
    allOrd.forEach(function (o) {
      if (String(o.data).indexOf(pref) !== 0) return;
      if (String(o.fornitore || '').toLowerCase().indexOf('phoenix') >= 0) return;
      var l = Number(o.litri || 0);
      x.acquisti += Number(o.costo_litro || 0) * l;
      x.trasporti += Number(o.trasporto_litro || 0) * l;
      x.litriAcq += l;
      x.nOrdiniAcq++;
    });
    Object.keys(dettPerGiorno).forEach(function (d) {
      if (d.indexOf(pref) !== 0) return;
      x.dettLitri += dettPerGiorno[d].litri;
      x.dettInc += dettPerGiorno[d].incasso;
      x.dettCosto += dettPerGiorno[d].costo;
    });
    mesi.push(x);
  }
  _ceCache[anno] = { mesi: mesi };
  return _ceCache[anno];
}

async function _ceCalcola(q, anno) {
  var per = (q === 'anno') ? { dal: anno + '-01-01', al: anno + '-12-31' } : _ceTrimestre(q, anno);
  var primaDelDal = _ceGiornoPrima(per.dal);

  var cache = await _ceCaricaAnno(anno);
  await _ceGiacenzeAnno(anno);
  var fin = _ceFinestra(q);
  var da = fin.da, quanti = fin.quanti;
  var acc = { ingLitri: 0, ingFatt: 0, ingMarg: 0, dettLitri: 0, dettInc: 0, dettCosto: 0,
              acquisti: 0, trasporti: 0, litriAcq: 0, nOrdiniAcq: 0 };
  for (var i = da; i < da + quanti; i++) {
    var m = cache.mesi[i];
    Object.keys(acc).forEach(function (k) { acc[k] += m[k]; });
  }

  var bud = {};
  var righeBud = await _ceBudget(anno);
  var trim = _ceTrimestriDi(q);
  righeBud.forEach(function (b) {
    bud[b.voce] = (q === 'anno') ? Number(b.annuo || 0)
      : trim.reduce(function (a, t) { return a + Number(b['q' + t] || 0); }, 0);
  });

  // le due date insieme, non in fila
  var due = await Promise.all([_ceGiacenze(primaDelDal), _ceGiacenze(per.al)]);
  var apertura = due[0], chiusura = due[1];
  var somma = function (g) { return (g.righe || []).reduce(function (a, x) { return a + (x.valore || 0); }, 0); };
  var rimIniziale = somma(apertura), rimFinale = somma(chiusura);

  var ricavi = acc.ingFatt + acc.dettInc;
  var costoVenduto = acc.acquisti + rimIniziale - rimFinale;
  var margineLordo = ricavi - costoVenduto;
  var costiFissi = _CE_VOCI_BUDGET.reduce(function (a, v) { return a + (bud[v.id] || 0); }, 0);
  var servizi = (bud.servizi || 0) + acc.trasporti;   // 5.1 + 5.2
  var ebitda = margineLordo - acc.trasporti - costiFissi;
  var amm = bud.ammortamenti || 0;
  var ebit = ebitda - amm;
  var onFin = bud.oneri_finanziari || 0;
  var provFin = bud.proventi_finanziari || 0;
  var risultato = ebit - onFin + provFin;
  var imposte = Math.max(0, risultato * CE_ALIQUOTA);
  var utile = risultato - imposte;

  return {
    imposte: imposte, utile: utile,
    periodo: per, anno: anno, q: q,
    ricaviIngrosso: acc.ingFatt, ricaviDettaglio: acc.dettInc, ricavi: ricavi,
    litriIngrosso: acc.ingLitri, litriDettaglio: acc.dettLitri,
    margineIngrosso: acc.ingMarg, senzaPrezzo: 0, litriAcquistati: acc.litriAcq,
    acquisti: acc.acquisti, trasporti: acc.trasporti, servizi: servizi, nOrdiniAcq: acc.nOrdiniAcq,
    rimIniziale: rimIniziale, rimFinale: rimFinale,
    costoVenduto: costoVenduto, margineLordo: margineLordo,
    budget: bud, costiFissi: costiFissi,
    ebitda: ebitda, ammortamenti: amm, ebit: ebit,
    oneriFin: onFin, proventiFin: provFin, risultato: risultato,
    budgetMancante: !righeBud.length,
    mesi: cache.mesi
  };
}

// v20260803c — I trimestrali stanno in una linguetta LORO: mescolarli
// alle giacenze confondeva due cose diverse.
async function _ceRender() {
  var box = document.getElementById('and-vista') || document.getElementById('and-ce');
  if (!box) return;
  if (_ceQ === null) {
    var m = new Date().getMonth();
    _ceQ = Math.floor(m / 3) + 1;
  }
  box.innerHTML = '<div class="loading" style="padding:24px">Calcolo il conto economico...</div>';
  try {
    _ceDati = await _ceCalcola(_ceQ, _ceAnno);
    box.innerHTML = _ceHtml(_ceDati);
  } catch (e) {
    _ceDati = null;
    box.innerHTML = '<div style="padding:20px;color:#A32D2D;font-size:13px">Non riesco a calcolare il conto economico: '
      + esc((e && e.message) || String(e)) + '</div>';
  }
}

function ceVai(q) { _ceQ = q; _ceRender(); }
function ceAnnoCambia(a) { _ceAnno = Number(a); _ceRender(); }

function _ceRiga(label, valore, opt) {
  opt = opt || {};
  var col = opt.colore || (opt.forte ? 'var(--text)' : 'var(--text-muted)');
  return '<tr style="' + (opt.sfondo ? 'background:var(--bg-kpi);' : '') + '">'
    + '<td style="padding:' + (opt.forte ? '9px' : '7px') + ' 8px;' + (opt.indenta ? 'padding-left:22px;' : '')
      + (opt.forte ? 'font-weight:700;' : '') + 'color:' + col + '">' + label + (opt.stima ? ' <span style="color:#854F0B" title="voce da budget, non da movimenti">*</span>' : '') + '</td>'
    + '<td style="padding:' + (opt.forte ? '9px' : '7px') + ' 8px;text-align:right;font-family:var(--font-mono);'
      + (opt.forte ? 'font-weight:700;font-size:14px;' : '') + 'color:' + (opt.coloreVal || col) + '">'
      + (opt.segno && Number(valore) > 0 ? '+' : '') + _andEuro(valore) + '</td>'
    + '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted)">'
      + (opt.pct !== undefined && opt.pct !== null ? _andNum(opt.pct, 2) + '%' : '') + '</td></tr>';
}

// ═══ v20260803e · DUE VISTE ════════════════════════════════════════
// A — ISTITUZIONALE: tabella formale, intestazione blu notte, bande
//     colorate sui risultati intermedi. Per la banca e per la stampa.
// B — OPERATIVO: riquadri con barre sui margini. Per la consultazione
//     di tutti i giorni.
// Stessi numeri, stessa cascata: cambia solo come si leggono.
var C_CE = { navy: '#0B2545', blu: '#185FA5', bluL: '#E8F4FD', bluL2: '#E6F1FB',
             verde: '#1D9E75', verdeL: '#D4F5E8', verdeT: '#0F6E56',
             gold: '#C49B2A', goldL: '#FFF3D6', goldT: '#8B5A00',
             rosso: '#E24B4A', ambra: '#BA7517', bianco: '#FFFFFF' };

function _ceVoci(d) {
  return [
    { l: 'Ricavi delle vendite', v: d.ricavi, tipo: 'reale' },
    // il dettaglio non si perde: chi legge deve vedere quanto e magazzino
    { l: 'Acquisti del periodo', v: -d.acquisti, tipo: 'reale', sotto: true },
    { l: 'Rimanenze iniziali', v: -d.rimIniziale, tipo: 'reale', sotto: true },
    { l: 'Rimanenze finali', v: d.rimFinale, tipo: 'reale', sotto: true },
    { l: 'Costo del venduto', v: -d.costoVenduto, tipo: 'reale' },
    { cod: 'R1', l: 'MARGINE LORDO COMMERCIALE', v: d.margineLordo, pct: true, banda: 1 },
    { l: 'Personale', v: -(d.budget.personale || 0), tipo: 'stima' },
    // v20260804c — SERVIZI COME NEL BILANCIO DEL COMMERCIALISTA.
    // I trasporti terzisti sono la voce 5.1 DENTRO i servizi, non un
    // costo a se: restano cosi FUORI dal primo margine e pesano sul
    // secondo. E il valore non e stimato — si calcola carico per carico
    // dagli ordini, quindi il budget "servizi" va inteso al NETTO dei
    // trasporti, altrimenti lo stesso costo verrebbe contato due volte.
    { l: 'Servizi', v: -(d.servizi || 0), tipo: 'reale', gruppo: true },
    { l: '5.1 Trasporti terzisti', v: -d.trasporti, tipo: 'reale', sotto: true },
    { l: '5.2 Altri servizi', v: -(d.budget.servizi || 0), tipo: 'stima', sotto: true },
    { l: 'Godimento beni di terzi', v: -(d.budget.godimento_beni || 0), tipo: 'stima' },
    { l: 'Oneri diversi di gestione', v: -(d.budget.oneri_diversi || 0), tipo: 'stima' },
    { cod: 'R2', l: 'EBITDA', v: d.ebitda, pct: true, banda: 2 },
    { l: 'Ammortamenti', v: -(d.ammortamenti || 0), tipo: 'stima' },
    { cod: 'R3', l: 'RISULTATO OPERATIVO (EBIT)', v: d.ebit, pct: true, banda: 3 },
    { l: 'Oneri finanziari', v: -(d.oneriFin || 0), tipo: 'stima' },
    { l: 'Proventi finanziari', v: d.proventiFin || 0, tipo: 'stima' },
    { cod: 'R4', l: 'RISULTATO ANTE IMPOSTE', v: d.risultato, pct: true, banda: 4 },
    { l: 'Imposte stimate (' + (CE_ALIQUOTA * 100).toFixed(1).replace('.', ',') + '%)', v: -d.imposte, tipo: 'stima' },
    { cod: '\u2605', l: 'UTILE NETTO STIMATO', v: d.utile, pct: true, banda: 5 }
  ];
}

function _ceBarra(d) {
  var h = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:14px">';
  [1, 2, 3, 4].forEach(function (q) {
    var on = _ceQ === q;
    h += '<button onclick="ceVai(' + q + ')" style="font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer;font-weight:600;'
      + (on ? 'background:' + C_CE.navy + ';color:#fff;border:0.5px solid ' + C_CE.navy : 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)') + '">Q' + q + '</button>';
  });
  [['h1', '1\u00b0 semestre'], ['h2', '2\u00b0 semestre'], ['anno', 'Totale ' + d.anno]].forEach(function (x) {
    var on = _ceQ === x[0];
    h += '<button onclick="ceVai(\'' + x[0] + '\')" style="font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer;font-weight:600;'
      + (on ? 'background:' + C_CE.navy + ';color:#fff;border:0.5px solid ' + C_CE.navy : 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)') + '">' + x[1] + '</button>';
  });
  h += '<input type="number" value="' + d.anno + '" onchange="ceAnnoCambia(this.value)" style="width:82px;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:var(--font-mono);margin-left:6px">';
  h += '<span style="display:flex;gap:3px;background:var(--bg-kpi);border-radius:8px;padding:3px;margin-left:8px">';
  [['A', 'A \u2014 Istituzionale'], ['B', 'B \u2014 Operativo']].forEach(function (x) {
    var on = _ceStile === x[0];
    h += '<button onclick="ceStile(\'' + x[0] + '\')" style="padding:6px 14px;font-size:12px;border:none;border-radius:6px;cursor:pointer;font-weight:'
      + (on ? '600' : '400') + ';background:' + (on ? C_CE.navy : 'transparent') + ';color:' + (on ? '#fff' : 'var(--text-muted)') + '">' + x[1] + '</button>';
  });
  h += '</span>';
  h += '<span style="margin-left:auto"><button onclick="ceStampa()" style="font-size:12px;padding:7px 15px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">&#128424; Stampa o salva in PDF</button></span>';
  h += '</div>';
  return h;
}

function _ceNote(d) {
  var h = '<div style="font-size:11px;color:var(--text-muted);margin-top:12px;line-height:1.7">';
  h += 'Ricavi calcolati come nella sezione <strong>Vendite</strong>. Acquisti come nel <strong>Report acquisti</strong>: solo il costo del prodotto, esclusi i prelievi dal nostro deposito. I <strong>trasporti terzisti</strong> non entrano nel primo margine: sono la voce 5.1 dentro i Servizi, calcolata carico per carico dagli ordini, quindi la voce di budget \'Altri servizi\' va tenuta al NETTO dei trasporti. '
     + 'Rimanenze dal sistema di carico e scarico riconciliato con DAS e registro, valorizzate al costo medio del giorno. '
     + 'Le voci in <span style="color:' + C_CE.ambra + '">ambra</span> vengono dal budget annuale, non dai movimenti.';
  if (d.senzaPrezzo > 0) {
    h += '<br><span style="color:' + C_CE.ambra + '">' + _andNum(d.senzaPrezzo) + ' litri erogati in stazione senza prezzo del giorno: non sono nei ricavi.</span>';
  }
  h += '</div>';
  return h;
}

function _ceHtml(d) {
  var h = _ceBarra(d);
  if (d.budgetMancante) {
    h += '<div style="background:' + C_CE.goldL + ';border:0.5px solid #E4C892;border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:12.5px;color:' + C_CE.goldT + '">'
      + 'Nessun budget caricato per il ' + d.anno + ': personale, servizi, ammortamenti e oneri finanziari sono a zero e il risultato non e attendibile.</div>';
  }
  h += (_ceStile === 'B') ? _ceStileB(d) : _ceStileA(d);
  h += _ceNote(d);
  return h;
}

// ── A · ISTITUZIONALE ──────────────────────────────────────────────
function _ceStileA(d) {
  var pctOf = function (v) { return d.ricavi ? v / d.ricavi * 100 : 0; };
  var bande = {
    1: { bg: C_CE.bluL,  bordo: C_CE.blu,   testo: C_CE.navy },
    2: { bg: C_CE.verdeL, bordo: C_CE.verde, testo: C_CE.verdeT },
    3: { bg: C_CE.bluL2, bordo: C_CE.blu,   testo: C_CE.navy },
    4: { bg: C_CE.goldL, bordo: C_CE.gold,  testo: C_CE.goldT }
  };
  var h = '<div style="background:#fff;border-radius:10px;overflow:hidden;border:0.5px solid var(--border)">';
  h += '<div style="background:' + C_CE.navy + ';color:#fff;padding:16px 18px">'
     + '<div style="font-size:16px;font-weight:700;letter-spacing:0.5px">PHOENIX FUEL S.R.L.</div>'
     + '<div style="font-size:12px;opacity:0.85;margin-top:2px">'
     + _ceEtichetta(d.q, d.anno)
     + ' \u00b7 dal ' + _andIt(d.periodo.dal) + ' al ' + _andIt(d.periodo.al) + '</div></div>';
  h += '<table style="width:100%;border-collapse:collapse;font-size:13px;color:#222">';
  h += '<tr style="background:#f7f7f5;color:#666;font-size:10.5px;text-transform:uppercase;letter-spacing:0.4px">'
     + '<th style="width:34px;padding:7px 6px"></th>'
     + '<th style="text-align:left;padding:7px 8px;font-weight:600">Voce</th>'
     + '<th style="text-align:right;padding:7px 10px;font-weight:600;width:140px">Importo</th>'
     + '<th style="text-align:right;padding:7px 10px;font-weight:600;width:78px">% Fatt.</th></tr>';
  var alt = 0;
  _ceVoci(d).forEach(function (r) {
    var neg = Number(r.v) < 0;
    if (r.banda) {
      var b = bande[r.banda];
      var finale = (r.banda === 5);
      h += '<tr style="background:' + (finale ? C_CE.navy : b.bg) + ';color:' + (finale ? '#fff' : b.testo) + '">'
        + '<td style="padding:11px 6px;text-align:center;font-size:11px;font-weight:700;opacity:0.85">' + (r.cod || '') + '</td>'
        + '<td style="padding:11px 8px;font-weight:700;letter-spacing:0.3px">' + r.l + '</td>'
        + '<td style="padding:11px 10px;text-align:right;font-family:var(--font-mono);font-weight:700;font-size:14.5px">' + _andEuro(r.v) + '</td>'
        + '<td style="padding:11px 10px;text-align:right;font-family:var(--font-mono);font-size:12px">' + _andNum(pctOf(r.v), 2) + '%</td></tr>';
    } else {
      alt++;
      h += '<tr style="background:' + (r.gruppo ? '#F2F4F7' : (alt % 2 ? '#FAFAF8' : '#fff')) + '">'
        + '<td style="padding:8px 6px;text-align:center;color:' + C_CE.ambra + ';font-weight:700">' + (r.tipo === 'stima' ? '*' : '') + '</td>'
        + '<td style="padding:8px 8px;padding-left:' + (r.sotto ? '30px' : '16px') + ';color:' + (r.sotto ? '#666' : '#333')
          + ';font-size:' + (r.sotto ? '12px' : '13px') + (r.gruppo ? ';font-weight:600' : '') + '">' + r.l + '</td>'
        + '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);color:' + (neg ? C_CE.rosso : '#222') + '">' + _andEuro(r.v) + '</td>'
        + '<td></td></tr>';
    }
  });
  h += '</table>';
  h += '<div style="padding:10px 14px;background:#f7f7f5;font-size:10.5px;color:#666;border-top:1px solid #eee">'
     + '<span style="color:' + C_CE.ambra + ';font-weight:700">*</span> valori stimati su base budget annuale</div>';
  h += '</div>';
  return h;
}

// ── B · OPERATIVO ──────────────────────────────────────────────────
function _ceStileB(d) {
  var pctOf = function (v) { return d.ricavi ? v / d.ricavi * 100 : 0; };
  var card = function (titolo, valore, pct, colore, largh) {
    var p = Math.max(0, Math.min(100, Math.abs(pct) * 8));   // scala leggibile su margini sottili
    return '<div style="flex:1;min-width:' + (largh || 210) + 'px;background:var(--bg-kpi);border-radius:10px;padding:13px 15px">'
      + '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">' + titolo + '</div>'
      + '<div style="font-size:21px;font-weight:700;font-family:var(--font-mono);margin-top:3px;color:' + colore + '">' + _andEuro(valore) + '</div>'
      + '<div style="height:6px;border-radius:3px;background:var(--bg);margin-top:7px;overflow:hidden">'
      + '<div style="height:100%;width:' + p.toFixed(1) + '%;background:' + colore + '"></div></div>'
      + '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + _andNum(pct, 2) + '% dei ricavi</div></div>';
  };
  var verde = '#27500A', rosso = '#A32D2D';
  var col = function (v) { return v >= 0 ? verde : rosso; };

  var h = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">';
  h += card('Ricavi', d.ricavi, 100, 'var(--text)');
  h += card('Margine lordo', d.margineLordo, pctOf(d.margineLordo), col(d.margineLordo));
  h += card('EBITDA', d.ebitda, pctOf(d.ebitda), col(d.ebitda));
  h += card('Utile netto stimato', d.utile, pctOf(d.utile), col(d.utile));
  h += '</div>';

  h += '<div class="card" style="padding:14px"><table style="width:100%;border-collapse:collapse;font-size:12.5px">';
  _ceVoci(d).forEach(function (r) {
    var forte = !!r.banda;
    var neg = Number(r.v) < 0;
    h += '<tr style="' + (forte ? 'background:var(--bg-kpi);' : '') + 'border-top:0.5px solid var(--border)">'
      + '<td style="padding:' + (forte ? '9px' : '7px') + ' 8px;' + (forte ? 'font-weight:700;' : 'padding-left:20px;color:var(--text-muted);') + '">'
      + r.l + (r.tipo === 'stima' ? ' <span style="color:' + C_CE.ambra + '" title="voce da budget, non da movimenti">*</span>' : '') + '</td>'
      + '<td style="padding:' + (forte ? '9px' : '7px') + ' 8px;text-align:right;font-family:var(--font-mono);'
      + (forte ? 'font-weight:700;font-size:14px;color:' + col(r.v) + ';' : 'color:' + (neg ? rosso : 'var(--text)') + ';') + '">' + _andEuro(r.v) + '</td>'
      + '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted)">'
      + (r.pct ? _andNum(pctOf(r.v), 2) + '%' : '') + '</td></tr>';
  });
  h += '</table>';
  h += '<div style="display:flex;gap:22px;flex-wrap:wrap;margin-top:12px;font-size:11.5px;color:var(--text-muted)">';
  h += '<span>Litri ingrosso <strong style="color:var(--text);font-family:var(--font-mono)">' + _andNum(d.litriIngrosso) + '</strong></span>';
  h += '<span>Litri stazione <strong style="color:var(--text);font-family:var(--font-mono)">' + _andNum(d.litriDettaglio) + '</strong></span>';
  h += '<span>Acquistati <strong style="color:var(--text);font-family:var(--font-mono)">' + _andNum(d.litriAcquistati) + '</strong> L in '
     + _andNum(d.nOrdiniAcq) + ' ordini &middot; medio <strong style="color:var(--text);font-family:var(--font-mono)">'
     + (d.litriAcquistati ? (d.acquisti / d.litriAcquistati).toFixed(4) : '—') + '</strong> &euro;/L</span>';
  if (d.litriIngrosso) {
    h += '<span>Margine ingrosso <strong style="color:var(--text);font-family:var(--font-mono)">'
      + _andNum(d.margineIngrosso / d.litriIngrosso, 4) + ' &euro;/L</strong></span>';
  }
  h += '</div></div>';
  return h;
}

function ceStampa() {
  var d = _ceDati;
  if (!d) { if (typeof toast === 'function') toast('Nessun conto economico da stampare'); return; }
  var w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Il browser ha bloccato la finestra: consenti i popup e riprova'); return; }
  var riga = function (l, v, o) {
    o = o || {};
    return '<tr class="' + (o.forte ? 'f' : '') + '"><td class="l"' + (o.indenta ? ' style="padding-left:26px"' : '') + '>'
      + l + (o.stima ? ' *' : '') + '</td><td>' + _andNum(v, 2) + '</td><td>'
      + (d.ricavi ? _andNum(v / d.ricavi * 100, 2) + '%' : '') + '</td></tr>';
  };
  var titolo = _ceEtichetta(d.q, d.anno);
  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Conto economico ' + titolo + '</title><style>'
    + 'body{font-family:Calibri,Arial,sans-serif;color:#222;margin:2cm;font-size:12.5px}'
    + 'h1{font-size:19px;margin:0 0 2px}.sub{color:#666;font-size:12px;margin-bottom:20px}'
    + 'table{width:100%;border-collapse:collapse}'
    + 'th{font-size:11px;color:#666;font-weight:600;border-bottom:1.5px solid #999;padding:6px 8px;text-align:right}'
    + 'th.l{text-align:left}td{padding:5px 8px;text-align:right;font-family:Consolas,monospace;border-bottom:1px solid #eee}'
    + 'td.l{text-align:left;font-family:Calibri,Arial,sans-serif}'
    + 'tr.f td{font-weight:700;background:#f4f4f4;font-size:13.5px}'
    + '.note{color:#666;font-size:10.5px;margin-top:20px;border-top:1px solid #eee;padding-top:10px;line-height:1.7}'
    + '@media print{body{margin:1.6cm}}</style></head><body>';
  doc += '<h1>Phoenix Fuel S.r.l. &mdash; conto economico</h1>';
  doc += '<div class="sub">' + titolo + ' &middot; dal ' + _andIt(d.periodo.dal) + ' al ' + _andIt(d.periodo.al) + '</div>';
  doc += '<table><tr><th class="l">Voce</th><th>Importo &euro;</th><th>% ricavi</th></tr>';
  doc += riga('Ricavi ingrosso', d.ricaviIngrosso);
  doc += riga('Ricavi stazione Oppido', d.ricaviDettaglio);
  doc += riga('RICAVI', d.ricavi, { forte: true });
  doc += riga('Acquisti del periodo', -d.acquisti, { indenta: true });
  doc += riga('Rimanenze iniziali', -d.rimIniziale, { indenta: true });
  doc += riga('Rimanenze finali', d.rimFinale, { indenta: true });
  doc += riga('Costo del venduto', -d.costoVenduto, { forte: true });
  doc += riga('MARGINE LORDO', d.margineLordo, { forte: true });
  doc += riga('Personale', -(d.budget.personale || 0), { indenta: true, stima: true });
  doc += riga('Servizi', -(d.servizi || 0), { indenta: true });
  doc += riga('5.1 Trasporti terzisti', -d.trasporti, { indenta: true });
  doc += riga('5.2 Altri servizi', -(d.budget.servizi || 0), { indenta: true, stima: true });
  doc += riga('Godimento beni di terzi', -(d.budget.godimento_beni || 0), { indenta: true, stima: true });
  doc += riga('Oneri diversi di gestione', -(d.budget.oneri_diversi || 0), { indenta: true, stima: true });
  doc += riga('EBITDA', d.ebitda, { forte: true });
  doc += riga('Ammortamenti', -(d.ammortamenti || 0), { indenta: true, stima: true });
  doc += riga('Risultato operativo', d.ebit, { forte: true });
  doc += riga('Oneri finanziari', -(d.oneriFin || 0), { indenta: true, stima: true });
  doc += riga('Proventi finanziari', d.proventiFin || 0, { indenta: true, stima: true });
  doc += riga('RISULTATO ANTE IMPOSTE', d.risultato, { forte: true });
  doc += riga('Imposte stimate (' + (CE_ALIQUOTA * 100).toFixed(1).replace('.', ',') + '%)', -d.imposte, { indenta: true, stima: true });
  doc += riga('UTILE NETTO STIMATO', d.utile, { forte: true });
  doc += '</table>';
  doc += '<div class="note"><strong>* Voci da budget.</strong> Personale, servizi, godimento beni, oneri diversi, ammortamenti e oneri finanziari '
      + 'sono ripartiti dal budget annuale e non derivano dai movimenti: sono stime fino al bilancio.<br>'
      + '<strong>Ricavi e acquisti</strong> derivano dagli ordini registrati; i ricavi al dettaglio dalle erogazioni della stazione.<br>'
      + '<strong>Rimanenze</strong> dal sistema di carico e scarico riconciliato con documenti di accompagnamento e registro, '
      + 'rettifiche di inventario comprese, valorizzate al costo medio ponderato d\'acquisto del giorno.<br>'
      + 'Documento generato da PhoenixFuel il ' + new Date().toLocaleDateString('it-IT') + '.</div>';
  doc += '</body></html>';
  w.document.write(doc);
  w.document.close();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}

// ═══ v20260803f · MASCHERA DEI COSTI ═══════════════════════════════
// I costi che il programma non puo ricavare dai movimenti si inseriscono
// qui: personale, servizi, godimento beni, oneri diversi, ammortamenti,
// oneri e proventi finanziari. Si scrive l'annuo e i quattro trimestri si
// dividono da soli; toccando un trimestre quella voce non si ridivide
// piu (resta la ripartizione decisa a mano).
var _bud = [];
var _budAnno = new Date().getFullYear();
var _BUD_VOCI = [
  { id: 'personale', label: 'Costi del personale' },
  { id: 'servizi', label: 'Altri servizi (esclusi trasporti terzisti)' },
  { id: 'godimento_beni', label: 'Godimento beni di terzi' },
  { id: 'oneri_diversi', label: 'Oneri diversi di gestione' },
  { id: 'ammortamenti', label: 'Ammortamenti' },
  { id: 'oneri_finanziari', label: 'Oneri finanziari' },
  { id: 'proventi_finanziari', label: 'Proventi finanziari' }
];

async function caricaBudget() {
  var box = document.getElementById('and-vista') || document.getElementById('and-budget');
  if (!box) return;
  box.innerHTML = '<div class="loading" style="padding:24px">Carico i costi...</div>';
  var r = await sb.from('budget_costi_annuali').select('*').eq('anno', _budAnno);
  var m = {};
  (r.data || []).forEach(function (b) { m[b.voce] = b; });
  _bud = _BUD_VOCI.map(function (v) {
    var b = m[v.id] || {};
    return { voce: v.id, label: v.label, annuo: Number(b.annuo || 0),
             q1: Number(b.q1 || 0), q2: Number(b.q2 || 0), q3: Number(b.q3 || 0), q4: Number(b.q4 || 0),
             override: !!b.override_trimestre, nuovo: !m[v.id] };
  });
  _budRender();
}

function budAnnoCambia(a) { _budAnno = Number(a); caricaBudget(); }

function _budRender() {
  var box = document.getElementById('and-vista') || document.getElementById('and-budget');
  if (!box) return;
  var inp = 'width:110px;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px;text-align:right;font-family:var(--font-mono)';
  var h = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">';
  h += '<span style="font-size:12px;color:var(--text-muted)">Costi dell\'anno</span>';
  h += '<input type="number" value="' + _budAnno + '" onchange="budAnnoCambia(this.value)" style="width:88px;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:var(--font-mono)">';
  h += '<span style="margin-left:auto"><button onclick="budSalva()" class="btn-primary" style="font-size:12px;padding:8px 16px">&#128190; Salva</button></span>';
  h += '</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px">Scrivi l\'importo annuo: i trimestri si dividono da soli. '
     + 'Se correggi un singolo trimestre, quella voce non si ridivide piu.</div>';

  h += '<div class="card" style="padding:14px"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">';
  h += '<tr style="color:var(--text-muted);text-align:right">'
     + '<th style="text-align:left;padding:6px 8px;font-weight:500">Voce</th>'
     + '<th style="padding:6px 8px;font-weight:500">Annuo</th>'
     + '<th style="padding:6px 8px;font-weight:500">Q1</th><th style="padding:6px 8px;font-weight:500">Q2</th>'
     + '<th style="padding:6px 8px;font-weight:500">Q3</th><th style="padding:6px 8px;font-weight:500">Q4</th>'
     + '<th style="padding:6px 8px;font-weight:500"></th></tr>';
  var tot = { annuo: 0, q1: 0, q2: 0, q3: 0, q4: 0 };
  _bud.forEach(function (b, i) {
    ['annuo', 'q1', 'q2', 'q3', 'q4'].forEach(function (k) { tot[k] += Number(b[k] || 0); });
    h += '<tr style="border-top:0.5px solid var(--border);text-align:right">'
      + '<td style="text-align:left;padding:7px 8px">' + b.label + '</td>'
      + '<td style="padding:7px 8px"><input type="number" step="0.01" value="' + b.annuo + '" oninput="_budAnnuo(' + i + ',this.value)" style="' + inp + ';border-color:#A9C9EC"></td>';
    ['q1', 'q2', 'q3', 'q4'].forEach(function (k) {
      h += '<td style="padding:7px 8px"><input type="number" step="0.01" value="' + b[k] + '" oninput="_budTrim(' + i + ',\'' + k + '\',this.value)" style="' + inp + ';width:96px"></td>';
    });
    h += '<td style="padding:7px 8px;text-align:left;font-size:10.5px;color:#854F0B">' + (b.override ? 'a mano' : '') + '</td></tr>';
  });
  h += '<tr style="border-top:0.5px solid var(--border);background:var(--bg-kpi);text-align:right">'
    + '<td style="text-align:left;padding:9px 8px;font-weight:700">Totale</td>'
    + '<td style="padding:9px 8px;font-family:var(--font-mono);font-weight:700">' + _andNum(tot.annuo, 2) + '</td>';
  ['q1', 'q2', 'q3', 'q4'].forEach(function (k) {
    h += '<td style="padding:9px 8px;font-family:var(--font-mono);font-weight:700">' + _andNum(tot[k], 2) + '</td>';
  });
  h += '<td></td></tr></table></div></div>';
  box.innerHTML = h;
}

function _budAnnuo(i, v) {
  var b = _bud[i]; if (!b) return;
  b.annuo = Number(v || 0);
  if (!b.override) {
    var q = Math.round(b.annuo / 4 * 100) / 100;
    b.q1 = b.q2 = b.q3 = q;
    b.q4 = Math.round((b.annuo - q * 3) * 100) / 100;   // l'ultimo assorbe l'arrotondamento
    _budRender();
  }
}

function _budTrim(i, k, v) {
  var b = _bud[i]; if (!b) return;
  b[k] = Number(v || 0);
  b.override = true;                       // toccato a mano: non si ridivide piu
  b.annuo = Math.round((Number(b.q1) + Number(b.q2) + Number(b.q3) + Number(b.q4)) * 100) / 100;
}

async function budSalva() {
  try {
    var righe = _bud.map(function (b) {
      return { anno: _budAnno, voce: b.voce, annuo: b.annuo,
               q1: b.q1, q2: b.q2, q3: b.q3, q4: b.q4,
               override_trimestre: b.override, updated_at: new Date().toISOString() };
    });
    var up = await sb.from('budget_costi_annuali').upsert(righe, { onConflict: 'anno,voce' });
    if (up.error) throw up.error;
    if (typeof _auditLog === 'function') {
      _auditLog('budget_costi', 'budget_costi_annuali', 'anno ' + _budAnno + ' aggiornato');
    }
    // i costi sono cambiati: il conto economico va rifatto
    ceSvuotaCache();
    toast('\u2713 Costi salvati');
    caricaBudget();
  } catch (e) {
    toast('Errore: ' + ((e && e.message) || e));
  }
}

// ═══ v20260804d · TRE VISTE DENTRO TRIMESTRALI ═════════════════════
// Niente altre linguette in cima: conto economico, budget costi e
// confronto anni stanno tutti dentro Trimestrali.
var _trimVista = 'ce';

// I codici sono quelli del piano dei conti del commercialista, presi
// dalla sua situazione contabile: 61 costi della produzione, 610107
// acquisti carburanti, 610143 spese di trasporto, 63 servizi, 65
// godimento beni di terzi. Gli altri sono allineati alla stessa logica.
var CE_CODICI = {
  ricavi: '51', ricaviIngrosso: '510101', ricaviDettaglio: '510107',
  costiProd: '61', acquisti: '610107', trasporti: '610143',
  servizi: '63', godimento: '65', personale: '67',
  ammortamenti: '68', oneriDiversi: '69',
  oneriFin: '85', proventiFin: '81', imposte: '90'
};

function trimVista(v) {
  _trimVista = v;
  if (v === 'budget') caricaBudget();
  else if (v === 'confronto') _cfrRender();
  else _ceRender();
}

function _trimBarra() {
  var voci = [['ce', '\ud83d\udcca Conto economico'], ['budget', '\u2699\ufe0f Budget costi'], ['confronto', '\ud83d\udcc8 Confronto anni']];
  var h = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">';
  voci.forEach(function (x) {
    var on = _trimVista === x[0];
    h += '<button onclick="trimVista(\'' + x[0] + '\')" style="font-size:12.5px;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:600;'
      + (on ? 'background:#0B2545;color:#fff;border:0.5px solid #0B2545' : 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)') + '">' + x[1] + '</button>';
  });
  return h + '</div>';
}

async function caricaTrimestrali() {
  var box = document.getElementById('and-ce');
  if (!box) return;
  box.innerHTML = _trimBarra() + '<div id="and-vista"><div class="loading" style="padding:24px">Caricamento...</div></div>';
  trimVista(_trimVista);
}

// ═══ CONFRONTO ANNI ════════════════════════════════════════════════
// Il 2026 arriva dai movimenti veri del programma. Il 2025 NO: nel
// programma e incompleto e darebbe cali inesistenti. Si prende dal
// BILANCIO depositato (`bilanci_annuali`) e si ripartisce — diviso 4
// per un trimestre, diviso 2 per un semestre — con la nota STIMA
// accanto. E un documento interno per capire la direzione, non da
// mandare fuori. Dall'anno prossimo il confronto sara sui dati veri di
// entrambi gli anni.
var _cfrQ = null;
var _cfrBilanci = null;

function cfrVai(q) { _cfrQ = q; _cfrRender(); }

async function _cfrRender() {
  var box = document.getElementById('and-vista');
  if (!box) return;
  if (_cfrQ === null) _cfrQ = Math.floor(new Date().getMonth() / 3) + 1;
  box.innerHTML = '<div class="loading" style="padding:24px">Confronto in corso...</div>';
  try {
    var anno = _ceAnno;
    var d = await _ceCalcola(_cfrQ, anno);
    if (!_cfrBilanci) {
      var rb = await sb.from('bilanci_annuali').select('*');
      _cfrBilanci = {};
      (rb.data || []).forEach(function (b) { _cfrBilanci[b.esercizio] = b; });
    }
    box.innerHTML = _cfrHtml(d, _cfrBilanci[anno - 1], anno);
  } catch (e) {
    box.innerHTML = '<div style="padding:20px;color:#A32D2D;font-size:13px">Non riesco a fare il confronto: '
      + esc((e && e.message) || String(e)) + '</div>';
  }
}

function _cfrQuota(q) {
  if (q === 'anno') return 1;
  if (q === 'h1' || q === 'h2') return 2;
  return 4;
}

function _cfrHtml(d, bil, anno) {
  var div = _cfrQuota(_cfrQ);
  var p = function (v) { return (Number(v || 0)) / div; };
  var ebitdaBil = null;
  if (bil) {
    var costiBil = p(bil.costo_merci) + p(bil.servizi) + p(bil.personale) + p(bil.godimento_beni) + p(bil.oneri_diversi);
    ebitdaBil = p(bil.fatturato) - costiBil;
  }

  var righe = bil ? [
    { cod: CE_CODICI.ricavi, l: 'VALORE DELLA PRODUZIONE', a: d.ricavi, b: p(bil.fatturato), buono: 1, banda: 'ricavi' },
    { cod: CE_CODICI.ricaviIngrosso, l: 'Ricavi ingrosso', a: d.ricaviIngrosso, b: null, sotto: true },
    { cod: CE_CODICI.ricaviDettaglio, l: 'Ricavi stazione Oppido', a: d.ricaviDettaglio, b: null, sotto: true },
    { cod: CE_CODICI.costiProd, l: 'COSTI DELLA PRODUZIONE', a: d.costoVenduto + d.trasporti, b: p(bil.costo_merci), buono: -1, banda: 'costi' },
    { cod: CE_CODICI.acquisti, l: 'Acquisti carburanti', a: d.acquisti, b: null, sotto: true },
    { cod: CE_CODICI.trasporti, l: 'Spese di trasporto', a: d.trasporti, b: null, sotto: true, dai: true },
    { cod: 'R1', l: 'MARGINE LORDO', a: d.margineLordo, b: p(bil.fatturato) - p(bil.costo_merci), buono: 1, banda: 'margine' },
    { cod: CE_CODICI.personale, l: 'Per il personale', a: d.budget.personale || 0, b: p(bil.personale), buono: -1 },
    { cod: CE_CODICI.servizi, l: 'Per servizi', a: d.servizi, b: p(bil.servizi), buono: -1 },
    { cod: CE_CODICI.godimento, l: 'Per godimento beni di terzi', a: d.budget.godimento_beni || 0, b: p(bil.godimento_beni), buono: -1 },
    { cod: 'R2', l: 'EBITDA', a: d.ebitda, b: ebitdaBil, buono: 1, banda: 'margine' },
    { cod: CE_CODICI.ammortamenti, l: 'Ammortamenti', a: d.ammortamenti, b: p(bil.ammortamenti), buono: -1 },
    { cod: CE_CODICI.oneriFin, l: 'Oneri finanziari', a: d.oneriFin, b: p(bil.oneri_finanziari), buono: -1 },
    { cod: '\u2605', l: 'RISULTATO ANTE IMPOSTE', a: d.risultato, b: p(bil.utile_netto), buono: 1, banda: 'finale' }
  ] : [];

  var h = '';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:14px">';
  [[1, 'Q1'], [2, 'Q2'], [3, 'Q3'], [4, 'Q4'], ['h1', '1\u00b0 sem.'], ['h2', '2\u00b0 sem.'], ['anno', 'Anno']].forEach(function (x) {
    var on = String(_cfrQ) === String(x[0]);
    h += '<button onclick="cfrVai(' + (typeof x[0] === 'number' ? x[0] : '\'' + x[0] + '\'') + ')" style="font-size:12px;padding:8px 15px;border-radius:7px;cursor:pointer;font-weight:600;'
      + (on ? 'background:#0B2545;color:#fff;border:0.5px solid #0B2545' : 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)') + '">' + x[1] + '</button>';
  });
  h += '<span style="margin-left:auto;font-size:11.5px;color:var(--text-muted)">' + _andIt(d.periodo.dal) + ' \u2014 ' + _andIt(d.periodo.al) + '</span>';
  h += '</div>';

  if (!bil) {
    return h + '<div style="padding:20px;background:' + C_CE.goldL + ';border-radius:10px;color:' + C_CE.goldT + ';font-size:13px">'
      + 'Manca il bilancio ' + (anno - 1) + ' in archivio: senza quello non c\'e niente da confrontare.</div>';
  }

  var bande = { ricavi: { bg: C_CE.bluL, tx: C_CE.navy }, costi: { bg: '#FCEBEB', tx: '#8B2020' },
                margine: { bg: C_CE.verdeL, tx: C_CE.verdeT }, finale: { bg: C_CE.navy, tx: '#fff' } };

  h += '<div style="background:#fff;border:0.5px solid var(--border);border-radius:10px;overflow:hidden">';
  h += '<div style="background:' + C_CE.navy + ';color:#fff;padding:13px 16px">'
     + '<div style="font-size:15px;font-weight:700;letter-spacing:0.5px">PHOENIX FUEL S.R.L. \u2014 confronto ' + _ceEtichetta(_cfrQ, anno).toLowerCase() + '</div>'
     + '<div style="font-size:11.5px;opacity:0.85;margin-top:2px">' + anno + ' dai movimenti \u00b7 ' + (anno - 1)
     + ' dal bilancio depositato' + (div > 1 ? ', ripartito in ' + div + ' (stima)' : '') + '</div></div>';

  h += '<table style="width:100%;border-collapse:collapse;font-size:12.5px;color:#222;table-layout:fixed">';
  h += '<tr style="background:#f7f7f5;color:#666;font-size:10.5px">'
     + '<th style="width:72px;padding:7px 8px;text-align:left">CODICE</th>'
     + '<th style="padding:7px 8px;text-align:left">DESCRIZIONE</th>'
     + '<th style="width:120px;padding:7px 10px;text-align:right">' + anno + '</th>'
     + '<th style="width:120px;padding:7px 10px;text-align:right">' + (anno - 1) + '</th>'
     + '<th style="width:158px;padding:7px 10px;text-align:right">SCOSTAMENTO</th></tr>';

  var alt = 0;
  righe.forEach(function (r) {
    var ban = r.banda ? bande[r.banda] : null;
    var delta = (r.b === null || r.b === undefined) ? null : r.a - r.b;
    var pct = (delta !== null && r.b) ? delta / Math.abs(r.b) * 100 : null;
    // il verde e quando fa BENE: ricavi che salgono, costi che scendono
    var col = 'var(--text-muted)';
    if (delta !== null && Math.abs(delta) > 0.005) {
      var meglio = (delta * (r.buono || 1)) > 0;
      col = meglio ? '#27500A' : '#A32D2D';
    }
    var frec = (delta === null) ? '' : (delta > 0 ? '\u25b2' : (delta < 0 ? '\u25bc' : ''));
    alt++;
    h += '<tr style="background:' + (ban ? ban.bg : (alt % 2 ? '#FAFAF8' : '#fff')) + ';color:' + (ban ? ban.tx : '#333') + '">';
    h += '<td style="padding:' + (ban ? '10px' : '7px') + ' 8px;font-size:10.5px;' + (ban ? 'font-weight:700' : 'color:#999') + '">' + r.cod + '</td>';
    h += '<td style="padding:' + (ban ? '10px' : '7px') + ' 8px;' + (ban ? 'font-weight:700' : 'padding-left:22px;color:' + (r.sotto ? '#666' : '#333')) + '">'
       + r.l + (r.dai ? ' <span style="font-size:10px;color:#1D9E75">\u00b7 dai carichi</span>' : '') + '</td>';
    h += '<td style="padding:' + (ban ? '10px' : '7px') + ' 10px;text-align:right;font-family:var(--font-mono)' + (ban ? ';font-weight:700' : '') + '">' + _andNum(r.a, 2) + '</td>';
    h += '<td style="padding:' + (ban ? '10px' : '7px') + ' 10px;text-align:right;font-family:var(--font-mono)">'
       + (r.b === null ? '<span style="opacity:0.4">\u2014</span>' : _andNum(r.b, 2) + (div > 1 ? ' <span style="font-size:9.5px;opacity:0.6">stima</span>' : '')) + '</td>';
    h += '<td style="padding:' + (ban ? '10px' : '7px') + ' 10px;text-align:right;font-family:var(--font-mono);color:' + (r.banda === 'finale' && col === '#27500A' ? '#7BE0B0' : col) + (ban ? ';font-weight:700' : '') + '">'
       + (delta === null ? '' : frec + ' ' + (delta >= 0 ? '+' : '') + _andNum(delta, 2)
          + (pct !== null ? '<div style="font-size:11px;font-weight:400">' + (pct >= 0 ? '+' : '') + _andNum(pct, 2) + '%</div>' : '')) + '</td>';
    h += '</tr>';
  });
  h += '</table>';
  h += '<div style="padding:10px 14px;background:#f7f7f5;font-size:10.5px;color:#666;border-top:1px solid #eee">'
     + 'Sui <strong>ricavi</strong> il verde e crescita. Sui <strong>costi</strong> il verde e risparmio: rosso quando aumentano.'
     + (div > 1 ? '<br>Il ' + (anno - 1) + ' viene dal bilancio annuale diviso ' + div + ': e una ripartizione uniforme, serve a leggere la direzione, non a chiudere un periodo.' : '')
     + '</div></div>';
  return h;
}

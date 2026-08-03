// PhoenixFuel — Finanze: Andamento
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
  var m = { 1: ['01-01', '03-31'], 2: ['04-01', '06-30'], 3: ['07-01', '09-30'], 4: ['10-01', '12-31'] }[q];
  return { dal: anno + '-' + m[0], al: anno + '-' + m[1] };
}

// Giorno precedente, per la rimanenza di apertura: la giacenza al 31/03
// e la chiusura del primo trimestre e insieme l'apertura del secondo.
function _ceGiornoPrima(iso) {
  var d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

async function _ceCalcola(q, anno) {
  var per = (q === 'anno') ? { dal: anno + '-01-01', al: anno + '-12-31' } : _ceTrimestre(q, anno);
  var primaDelDal = _ceGiornoPrima(per.dal);

  var r = await Promise.all([
    sb.from('ordini')
      .select('data,tipo_ordine,stato,fornitore,litri,costo_litro,trasporto_litro,margine')
      .gte('data', per.dal).lte('data', per.al).neq('stato', 'annullato'),
    sb.from('stazione_letture').select('data,pompa_id,lettura')
      .gte('data', primaDelDal).lte('data', per.al).order('data'),
    sb.from('stazione_pompe').select('id,prodotto,attiva'),
    sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro')
      .gte('data', per.dal).lte('data', per.al),
    sb.from('budget_costi_annuali').select('*').eq('anno', anno)
  ]);
  if (r[0].error) throw r[0].error;

  // ── ingrosso e acquisti ──
  // v20260803d — I RICAVI SI CALCOLANO COME IN VENDITE, non a modo mio.
  // pf-vendite-prodotto.js fa: prezzoNoIva(o) x litri sugli ordini
  // 'cliente' non annullati. Stessa identica cosa qui, cosi i due numeri
  // non possono divergere.
  // L'ERRORE che avevo fatto: escludevo il fornitore PhoenixFuel anche
  // dai RICAVI. Ma quelli sono le vendite dal NOSTRO deposito — nel 2026
  // 1.436 ordini per 7,67 milioni — e buttarli via faceva uscire tutto
  // negativo. Phoenix va escluso SOLO dagli acquisti: un prelievo dal
  // proprio deposito non e un acquisto da terzi, e gia stato comprato
  // quando e entrato.
  var _noIva = function (o) {
    return (typeof prezzoNoIva === 'function')
      ? prezzoNoIva(o)
      : Number(o.costo_litro || 0) + Number(o.trasporto_litro || 0) + Number(o.margine || 0);
  };
  var ordini = r[0].data || [];
  var ricaviIngrosso = 0, acquisti = 0, litriIngrosso = 0, margineIngrosso = 0, litriAcquistati = 0;
  ordini.forEach(function (o) {
    var l = Number(o.litri || 0);
    var interno = String(o.fornitore || '').toLowerCase().indexOf('phoenix') >= 0;
    if (!interno) {
      acquisti += (Number(o.costo_litro || 0) + Number(o.trasporto_litro || 0)) * l;
      litriAcquistati += l;
    }
    if (o.tipo_ordine === 'cliente') {
      ricaviIngrosso += _noIva(o) * l;
      margineIngrosso += Number(o.margine || 0) * l;
      litriIngrosso += l;
    }
  });

  // ── dettaglio: litri erogati dalle pompe x prezzo netto del giorno ──
  var pompe = {};
  (r[2].data || []).forEach(function (p) { pompe[p.id] = p.prodotto; });
  var prezzi = {};
  (r[3].data || []).forEach(function (p) { prezzi[p.data + '|' + p.prodotto] = Number(p.prezzo_litro || 0); });
  var perPompa = {};
  (r[1].data || []).forEach(function (x) { (perPompa[x.pompa_id] = perPompa[x.pompa_id] || []).push(x); });
  var ricaviDettaglio = 0, litriDettaglio = 0, senzaPrezzo = 0;
  Object.keys(perPompa).forEach(function (pid) {
    var arr = perPompa[pid].sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    var prod = pompe[pid];
    for (var i = 1; i < arr.length; i++) {
      if (arr[i].data < per.dal) continue;
      var l = Number(arr[i].lettura) - Number(arr[i - 1].lettura);
      if (!(l > 0)) continue;
      litriDettaglio += l;
      var pIva = prezzi[arr[i].data + '|' + prod];
      if (!pIva) { senzaPrezzo += l; continue; }
      ricaviDettaglio += l * (pIva / 1.22);
    }
  });

  // ── rimanenze ──
  var apertura = await window.pfData.getValoreGiacenze(primaDelDal);
  var chiusura = await window.pfData.getValoreGiacenze(per.al);
  var somma = function (g) {
    return (g.righe || []).reduce(function (a, x) { return a + (x.valore || 0); }, 0);
  };
  var rimIniziale = somma(apertura), rimFinale = somma(chiusura);

  // ── voci da budget ──
  var bud = {};
  (r[4].data || []).forEach(function (b) {
    var v = (q === 'anno') ? Number(b.annuo || 0) : Number(b['q' + q] || 0);
    bud[b.voce] = v;
  });

  var ricavi = ricaviIngrosso + ricaviDettaglio;
  var costoVenduto = acquisti + rimIniziale - rimFinale;
  var margineLordo = ricavi - costoVenduto;
  var costiFissi = _CE_VOCI_BUDGET.reduce(function (a, v) { return a + (bud[v.id] || 0); }, 0);
  var ebitda = margineLordo - costiFissi;
  var amm = bud.ammortamenti || 0;
  var ebit = ebitda - amm;
  var onFin = bud.oneri_finanziari || 0;
  var provFin = bud.proventi_finanziari || 0;
  var risultato = ebit - onFin + provFin;

  return {
    periodo: per, anno: anno, q: q,
    ricaviIngrosso: ricaviIngrosso, ricaviDettaglio: ricaviDettaglio, ricavi: ricavi,
    litriIngrosso: litriIngrosso, litriDettaglio: litriDettaglio,
    margineIngrosso: margineIngrosso, senzaPrezzo: senzaPrezzo, litriAcquistati: litriAcquistati,
    acquisti: acquisti, rimIniziale: rimIniziale, rimFinale: rimFinale,
    costoVenduto: costoVenduto, margineLordo: margineLordo,
    budget: bud, costiFissi: costiFissi,
    ebitda: ebitda, ammortamenti: amm, ebit: ebit,
    oneriFin: onFin, proventiFin: provFin, risultato: risultato,
    budgetMancante: !(r[4].data || []).length
  };
}

// v20260803c — I trimestrali stanno in una linguetta LORO: mescolarli
// alle giacenze confondeva due cose diverse.
async function caricaTrimestrali() { await _ceRender(); }

async function _ceRender() {
  var box = document.getElementById('and-ce');
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

function _ceHtml(d) {
  var pct = function (v) { return d.ricavi ? v / d.ricavi * 100 : 0; };
  var h = '';

  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:14px">';
  [1, 2, 3, 4].forEach(function (q) {
    var on = _ceQ === q;
    h += '<button onclick="ceVai(' + q + ')" style="font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer;font-weight:600;'
      + (on ? 'background:#26215C;color:#fff;border:0.5px solid #26215C' : 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)') + '">Q' + q + '</button>';
  });
  var onA = _ceQ === 'anno';
  h += '<button onclick="ceVai(\'anno\')" style="font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer;font-weight:600;'
    + (onA ? 'background:#26215C;color:#fff;border:0.5px solid #26215C' : 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)') + '">Anno</button>';
  h += '<input type="number" value="' + d.anno + '" onchange="ceAnnoCambia(this.value)" style="width:82px;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:var(--font-mono);margin-left:6px">';
  h += '<span style="font-size:11.5px;color:var(--text-muted)">dal ' + _andIt(d.periodo.dal) + ' al ' + _andIt(d.periodo.al) + '</span>';
  h += '<span style="margin-left:auto"><button onclick="ceStampa()" style="font-size:12px;padding:7px 15px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">&#128424; Stampa o salva in PDF</button></span>';
  h += '</div>';

  if (d.budgetMancante) {
    h += '<div style="background:#FAEEDA;border:0.5px solid #E4C892;border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:12.5px;color:#854F0B">'
      + 'Nessun budget caricato per il ' + d.anno + ': personale, servizi, ammortamenti e oneri finanziari risultano a zero e il risultato non e attendibile.</div>';
  }

  h += '<div class="card" style="padding:14px">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  h += '<tr style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.4px">'
    + '<th style="text-align:left;padding:6px 8px;font-weight:500">Voce</th>'
    + '<th style="text-align:right;padding:6px 8px;font-weight:500;width:130px">Importo</th>'
    + '<th style="text-align:right;padding:6px 8px;font-weight:500;width:70px">% ricavi</th></tr>';

  h += _ceRiga('Ricavi ingrosso', d.ricaviIngrosso, { pct: pct(d.ricaviIngrosso) });
  h += _ceRiga('Ricavi stazione Oppido', d.ricaviDettaglio, { pct: pct(d.ricaviDettaglio) });
  h += _ceRiga('RICAVI', d.ricavi, { forte: true, sfondo: true, pct: 100 });

  h += _ceRiga('Acquisti del periodo', -d.acquisti, { indenta: true });
  h += _ceRiga('Rimanenze iniziali', -d.rimIniziale, { indenta: true });
  h += _ceRiga('Rimanenze finali', d.rimFinale, { indenta: true, coloreVal: '#27500A' });
  h += _ceRiga('Costo del venduto', -d.costoVenduto, { forte: true, pct: pct(d.costoVenduto) });

  h += _ceRiga('MARGINE LORDO', d.margineLordo, { forte: true, sfondo: true, pct: pct(d.margineLordo),
        coloreVal: d.margineLordo >= 0 ? '#27500A' : '#A32D2D' });

  _CE_VOCI_BUDGET.forEach(function (v) {
    h += _ceRiga(v.label, -(d.budget[v.id] || 0), { indenta: true, stima: true });
  });
  h += _ceRiga('EBITDA', d.ebitda, { forte: true, sfondo: true, pct: pct(d.ebitda),
        coloreVal: d.ebitda >= 0 ? '#27500A' : '#A32D2D' });

  h += _ceRiga('Ammortamenti', -(d.ammortamenti || 0), { indenta: true, stima: true });
  h += _ceRiga('Risultato operativo', d.ebit, { forte: true, pct: pct(d.ebit),
        coloreVal: d.ebit >= 0 ? '#27500A' : '#A32D2D' });

  h += _ceRiga('Oneri finanziari', -(d.oneriFin || 0), { indenta: true, stima: true });
  h += _ceRiga('Proventi finanziari', d.proventiFin || 0, { indenta: true, stima: true });
  h += _ceRiga('RISULTATO ANTE IMPOSTE', d.risultato, { forte: true, sfondo: true, pct: pct(d.risultato),
        coloreVal: d.risultato >= 0 ? '#27500A' : '#A32D2D' });
  h += '</table>';

  h += '<div style="display:flex;gap:22px;flex-wrap:wrap;margin-top:12px;font-size:11.5px;color:var(--text-muted)">';
  h += '<span>Litri venduti ingrosso <strong style="color:var(--text);font-family:var(--font-mono)">' + _andNum(d.litriIngrosso) + '</strong></span>';
  h += '<span>Litri stazione <strong style="color:var(--text);font-family:var(--font-mono)">' + _andNum(d.litriDettaglio) + '</strong></span>';
  if (d.litriIngrosso) {
    h += '<span>Margine ingrosso <strong style="color:var(--text);font-family:var(--font-mono)">'
      + _andNum(d.margineIngrosso / d.litriIngrosso, 4) + ' &euro;/L</strong></span>';
  }
  h += '</div>';

  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:10px;line-height:1.7">';
  h += 'Le voci con <span style="color:#854F0B">*</span> vengono dal budget annuale, non dai movimenti: sono stime finche non arriva il bilancio. '
     + 'Ricavi e acquisti sono presi dagli ordini; le rimanenze dal sistema di carico e scarico riconciliato con DAS e registro, '
     + 'valorizzate al costo medio del giorno.';
  if (d.senzaPrezzo > 0) {
    h += '<br><span style="color:#854F0B">' + _andNum(d.senzaPrezzo) + ' litri erogati in stazione non hanno il prezzo del giorno: non sono nei ricavi.</span>';
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
  var titolo = (d.q === 'anno' ? 'Esercizio ' + d.anno : 'Trimestre Q' + d.q + ' ' + d.anno);
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
  _CE_VOCI_BUDGET.forEach(function (v) { doc += riga(v.label, -(d.budget[v.id] || 0), { indenta: true, stima: true }); });
  doc += riga('EBITDA', d.ebitda, { forte: true });
  doc += riga('Ammortamenti', -(d.ammortamenti || 0), { indenta: true, stima: true });
  doc += riga('Risultato operativo', d.ebit, { forte: true });
  doc += riga('Oneri finanziari', -(d.oneriFin || 0), { indenta: true, stima: true });
  doc += riga('Proventi finanziari', d.proventiFin || 0, { indenta: true, stima: true });
  doc += riga('RISULTATO ANTE IMPOSTE', d.risultato, { forte: true });
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

// PhoenixFuel — Finanze: Andamento
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

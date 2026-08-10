// PhoenixFuel — Preventivo a cliente
// v20260805a
//
// Dal listino prezzi: scelto cliente, deposito e prodotto, mostra per
// ogni fornitore attivo il prezzo che si puo fare al cliente.
//
// NIENTE QUERY NUOVE (regola sua del 05/08):
//   - i costi e i fornitori vengono dalla tabella `prezzi`, la stessa che
//     genera il listino;
//   - il margine proposto e la MEDIA DEGLI ULTIMI ORDINI calcolata
//     esattamente come in pf-ordini.js: stesso filtro, stesso limite;
//   - il dettaglio si apre con `mostraUltimiOrdiniClienteAnagrafica`, lo
//     stesso popup che si vede in Ordini;
//   - i costi di trasporto vengono da `costi_trasporto`, gestita in
//     Logistica → Mezzi propri.

var _pvState = { clienteId: '', clienteNome: '', baseId: '', prodotto: '', margine: 0, trasporto: 0 };
var _pvBasi = [];
var _pvClienti = [];
var _pvProdotti = [];
var _pvTrasporti = [];
var _pvPrezzi = [];

function _pvNum(v, d) { return Number(v || 0).toFixed(d === undefined ? 6 : d); }
function _pvData() {
  var el = document.getElementById('filtro-data-prezzi');
  return (el && el.value) ? el.value : new Date().toISOString().split('T')[0];
}

async function apriPreventivoCliente() {
  var data = _pvData();
  apriModal('<div style="padding:24px;text-align:center;color:var(--text-muted)">Carico il listino del ' + _pfIsoToIt(data) + '...</div>');
  try {
    var r = await Promise.all([
      sb.from('prezzi').select('*, basi_carico(id,nome)').eq('data', data),
      sb.from('clienti').select('id,nome').eq('attivo', true).order('nome'),
      (typeof pfCostiTrasporto === 'function')
        ? pfCostiTrasporto()
        : sb.from('costi_trasporto').select('*').eq('attivo', true).order('valore').then(function (x) { return x.data || []; })
    ]);
    _pvPrezzi = (r[0].data || []).filter(function (p) { return Number(p.costo_litro) > 0; });
    _pvClienti = r[1].data || [];
    _pvTrasporti = r[2] || [];

    // basi e prodotti: solo quelli che hanno davvero un prezzo oggi
    var vistiB = {}, vistiP = {};
    _pvBasi = []; _pvProdotti = [];
    _pvPrezzi.forEach(function (p) {
      var b = p.basi_carico;
      if (b && !vistiB[b.id]) { vistiB[b.id] = true; _pvBasi.push({ id: b.id, nome: b.nome }); }
      if (p.prodotto && !vistiP[p.prodotto]) { vistiP[p.prodotto] = true; _pvProdotti.push(p.prodotto); }
    });
    _pvBasi.sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
    _pvProdotti.sort();

    if (!_pvBasi.length) {
      apriModal('<div style="padding:20px;font-size:13px;color:var(--text-muted)">Nessun prezzo inserito per il '
        + _pfIsoToIt(data) + ': senza listino non posso fare un preventivo.</div>'
        + '<div style="display:flex;justify-content:flex-end;margin-top:14px"><button onclick="chiudiModal()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer">Chiudi</button></div>');
      return;
    }
    if (!_pvState.baseId || !vistiB[_pvState.baseId]) _pvState.baseId = _pvBasi[0].id;
    if (!_pvState.prodotto || !vistiP[_pvState.prodotto]) _pvState.prodotto = _pvProdotti[0];
    if (!_pvState.trasporto && _pvTrasporti.length) _pvState.trasporto = Number(_pvTrasporti[0].valore);
    _pvRender();
  } catch (e) {
    apriModal('<div style="padding:20px;color:#A32D2D;font-size:13px">Errore: ' + esc((e && e.message) || e) + '</div>');
  }
}

// Il margine medio: STESSO calcolo di pf-ordini.js, non uno nuovo.
async function _pvMargineMedio(clienteId, clienteNome, prodotto) {
  if (!clienteId || !prodotto || !clienteNome) return 0;
  var r = await sb.from('ordini').select('margine')
    .or('cliente_id.eq.' + clienteId + ',cliente.eq.' + clienteNome)
    .eq('prodotto', prodotto).neq('stato', 'annullato').eq('tipo_ordine', 'cliente')
    .gt('margine', 0).order('data', { ascending: false }).limit(10);
  var d = r.data || [];
  if (!d.length) return 0;
  return d.reduce(function (s, o) { return s + Number(o.margine); }, 0) / d.length;
}

async function pvCambia(campo, valore) {
  if (campo === 'cliente') {
    _pvState.clienteId = valore;
    var c = _pvClienti.filter(function (x) { return x.id === valore; })[0];
    _pvState.clienteNome = c ? c.nome : '';
  } else if (campo === 'base') _pvState.baseId = valore;
  else if (campo === 'prodotto') _pvState.prodotto = valore;
  else if (campo === 'trasporto') _pvState.trasporto = Number(valore || 0);
  else if (campo === 'margine') { _pvState.margine = Number(valore || 0); _pvRender(); return; }

  // cliente o prodotto cambiati: si ripropone il margine dagli ordini
  if (campo === 'cliente' || campo === 'prodotto') {
    _pvState.margine = await _pvMargineMedio(_pvState.clienteId, _pvState.clienteNome, _pvState.prodotto);
  }
  _pvRender();
}

// Il dettaglio: lo stesso popup che si apre in Ordini.
function pvDettaglioMargine() {
  if (!_pvState.clienteId) { toast('Scegli prima il cliente'); return; }
  if (typeof mostraUltimiOrdiniClienteAnagrafica === 'function') {
    var f = /benzina/i.test(_pvState.prodotto) ? 'benzina'
          : (/gasolio/i.test(_pvState.prodotto) ? 'gasolio' : 'tutti');
    mostraUltimiOrdiniClienteAnagrafica(_pvState.clienteId, _pvState.clienteNome, f);
  } else {
    toast('Dettaglio non disponibile');
  }
}

function _pvRighe() {
  var S = _pvState;
  return _pvPrezzi
    .filter(function (p) {
      return p.basi_carico && p.basi_carico.id === S.baseId && p.prodotto === S.prodotto;
    })
    .map(function (p) {
      var costo = Number(p.costo_litro || 0);
      var netto = costo + S.trasporto + S.margine;
      return { fornitore: p.fornitore, base: p.basi_carico.nome, costo: costo,
               netto: netto, ivato: netto * (1 + Number(p.iva || 22) / 100) };
    })
    .sort(function (a, b) { return a.netto - b.netto; });
}

function _pvRender() {
  var S = _pvState;
  var sel = 'width:100%;padding:9px 10px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:13px';
  var lbl = 'font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:4px;display:block';

  var h = '<div style="max-width:820px">';
  h += '<div style="font-size:16px;font-weight:600">Preventivo a cliente</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:16px">Listino del ' + _pfIsoToIt(_pvData())
     + ' &middot; solo i fornitori con il prezzo gia inserito</div>';

  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">';
  h += '<div style="flex:1.4;min-width:200px"><span style="' + lbl + '">Cliente</span>'
    + '<select onchange="pvCambia(\'cliente\', this.value)" style="' + sel + '">'
    + '<option value="">scegli il cliente\u2026</option>'
    + _pvClienti.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === S.clienteId ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
      }).join('') + '</select></div>';
  h += '<div style="flex:1.2;min-width:170px"><span style="' + lbl + '">Deposito da cui fornire</span>'
    + '<select onchange="pvCambia(\'base\', this.value)" style="' + sel + '">'
    + _pvBasi.map(function (b) {
        return '<option value="' + b.id + '"' + (b.id === S.baseId ? ' selected' : '') + '>' + esc(b.nome) + '</option>';
      }).join('') + '</select></div>';
  h += '<div style="flex:1.2;min-width:170px"><span style="' + lbl + '">Prodotto</span>'
    + '<select onchange="pvCambia(\'prodotto\', this.value)" style="' + sel + '">'
    + _pvProdotti.map(function (p) {
        return '<option value="' + esc(p) + '"' + (p === S.prodotto ? ' selected' : '') + '>' + esc(p) + '</option>';
      }).join('') + '</select></div>';
  h += '</div>';

  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">';
  h += '<div style="flex:1;min-width:190px"><span style="' + lbl + '">Margine &euro;/lt '
    + '<span onclick="pvDettaglioMargine()" title="Le ultime consegne a questo cliente" style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#185FA5;color:#fff;font-size:10px;font-weight:700;cursor:pointer;vertical-align:middle">i</span></span>'
    + '<input type="number" step="0.000001" value="' + _pvNum(S.margine) + '" onchange="pvCambia(\'margine\', this.value)" style="' + sel + ';text-align:right;font-family:var(--font-mono)">'
    + '<div style="font-size:10.5px;color:#0C447C;margin-top:3px">'
    + (S.clienteId ? 'media degli ultimi ordini di questo cliente &middot; premi <strong>i</strong> per il dettaglio'
                   : 'scegli il cliente per avere il margine proposto') + '</div></div>';
  h += '<div style="flex:1;min-width:190px"><span style="' + lbl + '">Trasporto &euro;/lt</span>';
  if (_pvTrasporti.length) {
    h += '<select onchange="pvCambia(\'trasporto\', this.value)" style="' + sel + '">'
      + _pvTrasporti.map(function (t) {
          return '<option value="' + t.valore + '"' + (Number(t.valore) === S.trasporto ? ' selected' : '') + '>'
            + Number(t.valore).toFixed(3).replace('.', ',') + (t.descrizione ? ' \u2014 ' + esc(t.descrizione) : '') + '</option>';
        }).join('') + '</select>';
  } else {
    h += '<input type="number" step="0.000001" value="' + _pvNum(S.trasporto) + '" onchange="pvCambia(\'trasporto\', this.value)" style="' + sel + ';text-align:right;font-family:var(--font-mono)">'
      + '<div style="font-size:10.5px;color:#854F0B;margin-top:3px">Nessun costo di trasporto in archivio: si inseriscono in Logistica &rarr; Mezzi propri</div>';
  }
  h += '</div></div>';

  var righe = _pvRighe();
  if (!righe.length) {
    h += '<div style="padding:18px;background:var(--bg-kpi);border-radius:10px;font-size:13px;color:var(--text-muted)">'
      + 'Nessun fornitore ha il prezzo di <strong>' + esc(S.prodotto) + '</strong> da questo deposito nel listino di oggi.</div>';
  } else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
    h += '<tr style="color:var(--text-muted);font-size:10.5px;text-transform:uppercase;letter-spacing:0.3px">'
      + '<th style="text-align:left;padding:7px 8px;font-weight:500">Fornitore</th>'
      + '<th style="text-align:right;padding:7px 8px;font-weight:500;width:104px">Costo &euro;/lt</th>'
      + '<th style="text-align:right;padding:7px 8px;font-weight:500;width:104px">Trasporto</th>'
      + '<th style="text-align:right;padding:7px 8px;font-weight:500;width:96px">Margine</th>'
      + '<th style="text-align:right;padding:7px 8px;font-weight:500;width:170px">Prezzo imponibile &middot; ivato</th></tr>';
    righe.forEach(function (r, i) {
      var best = (i === 0);
      h += '<tr style="border-top:0.5px solid var(--border)' + (best ? ';background:#EAF3DE' : '') + '">'
        + '<td style="padding:11px 8px"><strong>' + esc(r.fornitore) + '</strong> <span style="font-size:11px;color:var(--text-muted)">' + esc(r.base) + '</span>'
          + (best ? ' <span style="font-size:10px;background:#639922;color:#fff;padding:1px 7px;border-radius:8px;margin-left:4px">migliore</span>' : '') + '</td>'
        + '<td style="padding:11px 8px;text-align:right;font-family:var(--font-mono);color:#A32D2D">' + _pvNum(r.costo) + '</td>'
        + '<td style="padding:11px 8px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + _pvNum(S.trasporto) + '</td>'
        + '<td style="padding:11px 8px;text-align:right;font-family:var(--font-mono);color:#27500A">' + _pvNum(S.margine) + '</td>'
        + '<td style="padding:11px 8px;text-align:right;font-family:var(--font-mono)"><strong style="' + (best ? 'color:#27500A' : '') + '">' + _pvNum(r.netto) + '</strong>'
          + '<div style="font-size:11px;color:var(--text-muted)">' + _pvNum(r.ivato, 5) + ' ivato</div></td></tr>';
    });
    h += '</table>';
  }

  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:10px;line-height:1.6">'
    + 'Costo e fornitori vengono dal listino del giorno, in sola lettura. Trasporto e margine sono quelli scelti sopra: '
    + 'per cambiarli si usano i campi, non la tabella.</div>';

  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">';
  h += '<button onclick="chiudiModal()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer">Chiudi</button>';
  if (righe.length) {
    h += '<button onclick="pvStampa()" class="btn-primary" style="padding:9px 18px">&#128424; Stampa preventivo</button>';
  }
  h += '</div></div>';
  apriModal(h);
}

function pvStampa() {
  var S = _pvState, righe = _pvRighe();
  if (!righe.length) return;
  var w = window.open('', '_blank');
  if (!w) { toast('Il browser ha bloccato la finestra: consenti i popup e riprova'); return; }
  var oggi = new Date().toLocaleDateString('it-IT');
  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Preventivo ' + oggi + '</title><style>'
    + 'body{font-family:Calibri,Arial,sans-serif;color:#222;margin:2cm;font-size:12.5px;line-height:1.5}'
    + 'h1{font-size:17px;margin:0 0 3px}.mitt{font-size:11px;color:#555;margin-bottom:20px}'
    + 'table{width:100%;border-collapse:collapse;margin:14px 0}'
    + 'th{font-size:10.5px;color:#555;font-weight:600;border-bottom:1.5px solid #999;padding:6px 8px;text-align:right}'
    + 'th.l{text-align:left}td{border-bottom:1px solid #eee;padding:7px 8px;text-align:right;font-family:Consolas,monospace}'
    + 'td.l{text-align:left;font-family:Calibri,Arial,sans-serif}'
    + '.note{color:#666;font-size:10.5px;margin-top:20px;border-top:1px solid #eee;padding-top:10px}'
    + '@media print{body{margin:1.6cm}}</style></head><body>';
  doc += '<h1>PHOENIX FUEL S.R.L.</h1>';
  doc += '<div class="mitt">Zona Industriale &mdash; 89900 Vibo Valentia (VV) &middot; P.IVA 02744150802</div>';
  if (S.clienteNome) doc += '<div>Spett.le <strong>' + S.clienteNome + '</strong></div>';
  doc += '<div style="text-align:right">Vibo Valentia, ' + oggi + '</div>';
  doc += '<p><strong>Preventivo &mdash; ' + S.prodotto + '</strong><br>Consegna da '
      + (righe[0] ? righe[0].base : '') + ', prezzi validi per la giornata odierna.</p>';
  doc += '<table><tr><th class="l">Fornitore</th><th>Prezzo imponibile &euro;/L</th><th>Prezzo ivato &euro;/L</th></tr>';
  righe.forEach(function (r) {
    doc += '<tr><td class="l">' + r.fornitore + '</td><td>' + _pvNum(r.netto) + '</td><td>' + _pvNum(r.ivato, 5) + '</td></tr>';
  });
  doc += '</table>';
  doc += '<div class="note">Prezzi comprensivi di trasporto, riferiti al listino del ' + _pfIsoToIt(_pvData())
      + '. Soggetti a variazione secondo l\'andamento del mercato. Documento generato da PhoenixFuel.</div>';
  doc += '</body></html>';
  w.document.write(doc);
  w.document.close();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}

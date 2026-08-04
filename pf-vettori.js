// PhoenixFuel — Logistica: Report vettori
// v20260804a
//
// Serve a mandare a ogni vettore, ogni mese, la PREFATTURA che ci
// aspettiamo di ricevere: i viaggi che ha fatto, i litri portati e
// l'importo calcolato al prezzo per litro concordato.
//
// FONTE: i carichi, che e la stessa gia usata dal report viaggi in
// Logistica. Ogni carico e un viaggio; `trasportatore_id` nullo vuol dire
// mezzi propri. Il valore del trasporto e `trasporto_litro x litri` sugli
// ordini del carico — la funzione €/litro che c'e gia su ogni ordine.
// Nessun calcolo nuovo.

var _vetAnno = new Date().getFullYear();
var _vetDati = null;
var _vetGrafici = [];

var _VET_MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
var _VET_COLORI = ['#185FA5', '#639922', '#BA7517', '#8E8CA8', '#1D9E75',
                   '#A32D2D', '#26215C', '#C49B2A'];

function _vetNum(v, d) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('it-IT', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
}
function _vetEuro(v) { return '\u20ac ' + _vetNum(v, 2); }

async function caricaReportVettori() {
  var box = document.getElementById('vet-content');
  if (!box) return;
  box.innerHTML = '<div class="loading" style="padding:24px">Carico i viaggi del ' + _vetAnno + '...</div>';
  try {
    _vetDati = await _vetCarica(_vetAnno);
    box.innerHTML = _vetHtml(_vetDati);
    _vetDisegna();
  } catch (e) {
    box.innerHTML = '<div style="padding:20px;color:#A32D2D;font-size:13px">Non riesco a caricare i viaggi: '
      + esc((e && e.message) || String(e)) + '</div>';
  }
}

function vetAnno(a) { _vetAnno = Number(a); caricaReportVettori(); }

async function _vetCarica(anno) {
  var r = await sb.from('carichi')
    .select('id,data,trasportatore_id,mezzo_targa,autista,stato,carico_ordini(ordini(litri,trasporto_litro,prodotto,cliente)),trasportatori(nome)')
    .gte('data', anno + '-01-01').lte('data', anno + '-12-31')
    .order('data');
  if (r.error) throw r.error;

  var perVettore = {};
  (r.data || []).forEach(function (c) {
    var ordini = (c.carico_ordini || []).map(function (co) { return co.ordini; }).filter(Boolean);
    var litri = ordini.reduce(function (s, o) { return s + Number(o.litri || 0); }, 0);
    var imp = ordini.reduce(function (s, o) { return s + Number(o.trasporto_litro || 0) * Number(o.litri || 0); }, 0);
    var key = (c.trasportatori && c.trasportatore_id) ? c.trasportatore_id : 'proprio';
    var nome = (c.trasportatori && c.trasportatore_id) ? c.trasportatori.nome : 'Mezzi propri';
    if (!perVettore[key]) {
      perVettore[key] = { id: key, nome: nome, proprio: (key === 'proprio'),
                          viaggi: 0, litri: 0, importo: 0,
                          mesi: _VET_MESI.map(function () { return { viaggi: 0, litri: 0, importo: 0 }; }),
                          carichi: [] };
    }
    var v = perVettore[key];
    var m = Number(String(c.data).substring(5, 7)) - 1;
    v.viaggi++; v.litri += litri; v.importo += imp;
    if (m >= 0 && m < 12) { v.mesi[m].viaggi++; v.mesi[m].litri += litri; v.mesi[m].importo += imp; }
    v.carichi.push({ id: c.id, data: c.data, mese: m, litri: litri, importo: imp,
                     targa: c.mezzo_targa, autista: c.autista, stato: c.stato,
                     prodotti: [].concat.apply([], ordini.map(function (o) { return o.prodotto || ''; })),
                     clienti: ordini.map(function (o) { return o.cliente || ''; }) });
  });

  var elenco = Object.keys(perVettore).map(function (k) { return perVettore[k]; })
    .sort(function (a, b) { return b.litri - a.litri; });
  return { anno: anno, vettori: elenco,
           totViaggi: elenco.reduce(function (a, v) { return a + v.viaggi; }, 0),
           totLitri: elenco.reduce(function (a, v) { return a + v.litri; }, 0),
           totImporto: elenco.reduce(function (a, v) { return a + v.importo; }, 0) };
}

function _vetHtml(d) {
  var oggi = new Date().getFullYear();
  var h = '';

  h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">';
  [oggi, oggi - 1].forEach(function (a) {
    var on = _vetAnno === a;
    h += '<button onclick="vetAnno(' + a + ')" style="font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer;font-weight:600;'
      + (on ? 'background:#185FA5;color:#fff;border:0.5px solid #185FA5' : 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)') + '">' + a + '</button>';
  });
  h += '<span style="font-size:11.5px;color:var(--text-muted);margin-left:6px">viaggi registrati nei carichi</span>';
  h += '</div>';

  if (!d.vettori.length) {
    return h + '<div style="padding:20px;background:var(--bg-kpi);border-radius:10px;font-size:13px;color:var(--text-muted)">'
      + 'Nessun viaggio registrato nel ' + d.anno + '.</div>';
  }

  // ── tre numeri in cima ──
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">';
  [['Viaggi', _vetNum(d.totViaggi), d.vettori.length + ' vettori'],
   ['Litri trasportati', _vetNum(d.totLitri), 'nel ' + d.anno],
   ['Costo trasporto', _vetEuro(d.totImporto),
    d.totLitri ? _vetNum(d.totImporto / d.totLitri, 4) + ' \u20ac/L medio' : '']
  ].forEach(function (k) {
    h += '<div style="flex:1;min-width:190px;background:var(--bg-kpi);border-radius:10px;padding:13px 15px">'
      + '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">' + k[0] + '</div>'
      + '<div style="font-size:21px;font-weight:700;font-family:var(--font-mono);margin-top:3px">' + k[1] + '</div>'
      + '<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">' + k[2] + '</div></div>';
  });
  h += '</div>';

  // ── i due grafici ──
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">';
  h += '<div class="card" style="flex:1;min-width:280px;padding:14px">'
    + '<div style="font-size:13px;font-weight:600;margin-bottom:10px">Litri per vettore</div>'
    + '<div style="position:relative;height:260px"><canvas id="vet-torta"></canvas></div></div>';
  h += '<div class="card" style="flex:2;min-width:340px;padding:14px">'
    + '<div style="font-size:13px;font-weight:600;margin-bottom:10px">Costo trasporto mese per mese</div>'
    + '<div style="position:relative;height:260px"><canvas id="vet-barre"></canvas></div></div>';
  h += '</div>';

  // ── tabella per vettore ──
  h += '<div class="card" style="padding:14px">';
  h += '<div style="font-size:13px;font-weight:600;margin-bottom:10px">Dettaglio per vettore</div>';
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">';
  h += '<tr style="color:var(--text-muted);text-align:right">'
    + '<th style="text-align:left;padding:6px 8px;font-weight:500">Vettore</th>'
    + '<th style="padding:6px 8px;font-weight:500">Viaggi</th>'
    + '<th style="padding:6px 8px;font-weight:500">Litri</th>'
    + '<th style="padding:6px 8px;font-weight:500">&euro;/L medio</th>'
    + '<th style="padding:6px 8px;font-weight:500">Importo</th>'
    + '<th style="padding:6px 8px;font-weight:500">Prefattura</th></tr>';
  d.vettori.forEach(function (v, i) {
    h += '<tr style="border-top:0.5px solid var(--border);text-align:right">'
      + '<td style="text-align:left;padding:8px">'
        + '<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + _VET_COLORI[i % _VET_COLORI.length] + ';margin-right:7px"></span>'
        + esc(v.nome) + (v.proprio ? ' <span style="font-size:10px;color:var(--text-muted)">non fattura</span>' : '') + '</td>'
      + '<td style="padding:8px;font-family:var(--font-mono)">' + _vetNum(v.viaggi) + '</td>'
      + '<td style="padding:8px;font-family:var(--font-mono)">' + _vetNum(v.litri) + '</td>'
      + '<td style="padding:8px;font-family:var(--font-mono)">' + (v.litri ? _vetNum(v.importo / v.litri, 4) : '—') + '</td>'
      + '<td style="padding:8px;font-family:var(--font-mono);font-weight:700">' + _vetEuro(v.importo) + '</td>'
      + '<td style="padding:8px;text-align:left">'
        + (v.proprio ? '<span style="font-size:11px;color:var(--text-muted)">&mdash;</span>'
           : '<select onchange="if(this.value!==\'\'){vetPrefattura(\'' + v.id + '\', this.value); this.selectedIndex=0;}"'
             + ' style="font-size:11.5px;padding:5px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">'
             + '<option value="">scegli il mese\u2026</option>'
             + v.mesi.map(function (m, j) {
                 return m.viaggi ? '<option value="' + j + '">' + _VET_MESI[j] + ' \u00b7 ' + m.viaggi + ' viaggi</option>' : '';
               }).join('')
             + '</select>')
      + '</td></tr>';
  });
  h += '<tr style="border-top:0.5px solid var(--border);background:var(--bg-kpi);text-align:right">'
    + '<td style="text-align:left;padding:9px 8px;font-weight:700">TOTALE</td>'
    + '<td style="padding:9px 8px;font-family:var(--font-mono);font-weight:700">' + _vetNum(d.totViaggi) + '</td>'
    + '<td style="padding:9px 8px;font-family:var(--font-mono);font-weight:700">' + _vetNum(d.totLitri) + '</td>'
    + '<td></td>'
    + '<td style="padding:9px 8px;font-family:var(--font-mono);font-weight:700">' + _vetEuro(d.totImporto) + '</td>'
    + '<td></td></tr>';
  h += '</table></div>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:10px">'
    + 'I viaggi vengono dai carichi registrati; l\'importo e il prezzo per litro dell\'ordine moltiplicato per i litri, '
    + 'lo stesso valore che compare in Logistica. I <strong>mezzi propri</strong> sono nel conteggio ma non emettono fattura.</div>';
  h += '</div>';
  return h;
}

function _vetDisegna() {
  _vetGrafici.forEach(function (g) { try { g.destroy(); } catch (e) {} });
  _vetGrafici = [];
  var d = _vetDati;
  if (!d || !d.vettori.length || typeof Chart === 'undefined') return;

  var ct = document.getElementById('vet-torta');
  if (ct) {
    _vetGrafici.push(new Chart(ct, {
      type: 'doughnut',
      data: { labels: d.vettori.map(function (v) { return v.nome; }),
              datasets: [{ data: d.vettori.map(function (v) { return Math.round(v.litri); }),
                           backgroundColor: d.vettori.map(function (v, i) { return _VET_COLORI[i % _VET_COLORI.length]; }),
                           borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false,
                 plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } } }
    }));
  }

  var cb = document.getElementById('vet-barre');
  if (cb) {
    _vetGrafici.push(new Chart(cb, {
      type: 'bar',
      data: { labels: _VET_MESI.map(function (m) { return m.substring(0, 3); }),
              datasets: d.vettori.map(function (v, i) {
                return { label: v.nome,
                         data: v.mesi.map(function (m) { return Math.round(m.importo * 100) / 100; }),
                         backgroundColor: _VET_COLORI[i % _VET_COLORI.length] };
              }) },
      options: { responsive: true, maintainAspectRatio: false,
                 scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
                 plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } } }
    }));
  }
}

// ═══ PREFATTURA MENSILE ════════════════════════════════════════════
// Il documento da mandare al vettore: i viaggi che ha fatto quel mese,
// i litri e l'importo che ci aspettiamo di vedere in fattura.
function vetPrefattura(vettoreId, mese) {
  var d = _vetDati; if (!d) return;
  mese = Number(mese);
  var v = d.vettori.filter(function (x) { return String(x.id) === String(vettoreId); })[0];
  if (!v) return;
  var righe = v.carichi.filter(function (c) { return c.mese === mese; })
    .sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  if (!righe.length) { if (typeof toast === 'function') toast('Nessun viaggio in quel mese'); return; }

  var totL = righe.reduce(function (a, c) { return a + c.litri; }, 0);
  var totE = righe.reduce(function (a, c) { return a + c.importo; }, 0);
  var w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Il browser ha bloccato la finestra: consenti i popup e riprova'); return; }

  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8">'
    + '<title>Prefattura ' + _VET_MESI[mese] + ' ' + d.anno + ' - ' + v.nome + '</title><style>'
    + 'body{font-family:Calibri,Arial,sans-serif;color:#222;margin:2cm;font-size:12.5px;line-height:1.5}'
    + 'h1{font-size:17px;margin:0 0 3px}.mitt{font-size:11px;color:#555;margin-bottom:20px}'
    + '.dest{margin-bottom:16px}.ogg{font-weight:700;margin:14px 0}'
    + 'table{width:100%;border-collapse:collapse;margin:12px 0}'
    + 'th{font-size:10.5px;color:#555;font-weight:600;border-bottom:1.5px solid #999;padding:6px 8px;text-align:right}'
    + 'th.l{text-align:left}td{border-bottom:1px solid #eee;padding:6px 8px;text-align:right;font-family:Consolas,monospace}'
    + 'td.l{text-align:left;font-family:Calibri,Arial,sans-serif}'
    + 'tr.tot td{border-top:1.5px solid #999;border-bottom:none;font-weight:700;font-size:13.5px;padding-top:9px}'
    + '.note{color:#666;font-size:10.5px;margin-top:22px;border-top:1px solid #eee;padding-top:10px}'
    + '@media print{body{margin:1.6cm}}</style></head><body>';
  doc += '<h1>PHOENIX FUEL S.R.L.</h1>';
  doc += '<div class="mitt">Zona Industriale &mdash; 89900 Vibo Valentia (VV) &middot; P.IVA 02744150802 &middot; phoenixfuel@legalmail.it</div>';
  doc += '<div class="dest">Spett.le<br><strong>' + v.nome + '</strong></div>';
  doc += '<div style="text-align:right">Vibo Valentia, ' + new Date().toLocaleDateString('it-IT') + '</div>';
  doc += '<div class="ogg">Oggetto: riepilogo trasporti ' + _VET_MESI[mese] + ' ' + d.anno + '</div>';
  doc += '<p>Di seguito il riepilogo dei viaggi risultanti dai nostri registri per il mese indicato, '
      + 'con i relativi importi calcolati al prezzo per litro concordato.</p>';
  doc += '<table><tr><th class="l">Data</th><th class="l">Mezzo</th><th class="l">Autista</th>'
      + '<th>Litri</th><th>&euro;/L</th><th>Importo &euro;</th></tr>';
  righe.forEach(function (c) {
    doc += '<tr><td class="l">' + String(c.data).split('-').reverse().join('/') + '</td>'
      + '<td class="l">' + (c.targa || '&mdash;') + '</td>'
      + '<td class="l">' + (c.autista || '&mdash;') + '</td>'
      + '<td>' + _vetNum(c.litri) + '</td>'
      + '<td>' + (c.litri ? _vetNum(c.importo / c.litri, 4) : '&mdash;') + '</td>'
      + '<td>' + _vetNum(c.importo, 2) + '</td></tr>';
  });
  doc += '<tr class="tot"><td class="l" colspan="3">TOTALE ' + righe.length + ' viaggi</td>'
      + '<td>' + _vetNum(totL) + '</td><td></td><td>' + _vetNum(totE, 2) + '</td></tr></table>';
  doc += '<p>Vi preghiamo di emettere fattura per l\'importo di <strong>' + _vetEuro(totE)
      + '</strong> oltre IVA, segnalandoci eventuali difformita rispetto ai viaggi qui riportati.</p>';
  doc += '<div class="note">Importi calcolati sui litri trasportati e sul prezzo per litro registrato in ciascun ordine. '
      + 'Documento generato da PhoenixFuel il ' + new Date().toLocaleDateString('it-IT') + '.</div>';
  doc += '</body></html>';
  w.document.write(doc);
  w.document.close();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}

// PhoenixFuel — Logistica: Report vettori
// v20260930b — pulsante 📄 Stampa PDF nella sezione per base: stampa ESATTAMENTE
//   la selezione a video (filtri base/vettore/mese) con barre, tabella e totali.
// v20260930a — nuova sezione DETTAGLIO PER BASE DI CARICO sotto il dettaglio per
//   vettore: filtri base + vettore + anno + mese, barre dei litri per base divise
//   per vettore e tabella a due livelli (base → vettori) con litri/viaggio e €/L,
//   in verde il vettore piu' conveniente della base e in rosso il piu' caro.
//   La base arriva da ordini.base_carico_id: se un carico raccoglie ordini di
//   basi diverse, i litri vanno su ciascuna base per la loro quota.
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
    _vetRenderBasi();
    _vetDisegna();
  } catch (e) {
    box.innerHTML = '<div style="padding:20px;color:#A32D2D;font-size:13px">Non riesco a caricare i viaggi: '
      + esc((e && e.message) || String(e)) + '</div>';
  }
}

function vetAnno(a) { _vetAnno = Number(a); caricaReportVettori(); }

async function _vetCarica(anno) {
  var r = await sb.from('carichi')
    .select('id,data,trasportatore_id,mezzo_targa,autista,stato,carico_ordini(ordini(litri,trasporto_litro,prodotto,cliente,base_carico_id)),trasportatori(nome)')
    .gte('data', anno + '-01-01').lte('data', anno + '-12-31')
    .order('data');
  if (r.error) throw r.error;

  // nomi delle basi di carico (anagrafica piccola, lettura unica)
  var basi = {};
  try {
    var rb = await sb.from('basi_carico').select('id,nome');
    (rb.data || []).forEach(function (b) { basi[b.id] = b.nome; });
  } catch (eb) { console.warn('[vettori] basi di carico non lette:', eb && eb.message); }

  // righe elementari base × vettore × mese: una per ogni ordine del carico
  var righeBase = [];

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

    // una riga per ordine: cosi' un carico con ordini di basi diverse finisce
    // su ciascuna base con i suoi litri, senza inventare attribuzioni
    var caricoContato = {};
    ordini.forEach(function (o) {
      var bId = o.base_carico_id || '_senza';
      righeBase.push({
        baseId: bId,
        baseNome: basi[bId] || (bId === '_senza' ? 'Base non indicata' : 'Base ' + String(bId).slice(0, 8)),
        vettoreId: key, vettoreNome: nome, proprio: (key === 'proprio'),
        mese: m, caricoId: c.id,
        litri: Number(o.litri || 0),
        importo: Number(o.trasporto_litro || 0) * Number(o.litri || 0),
        primoDelCarico: !caricoContato[bId + '|' + key] && (caricoContato[bId + '|' + key] = true)
      });
    });
  });

  var elenco = Object.keys(perVettore).map(function (k) { return perVettore[k]; })
    .sort(function (a, b) { return b.litri - a.litri; });
  return { anno: anno, vettori: elenco, righeBase: righeBase,
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

  h += '<div id="vet-basi" style="margin-top:16px"></div>';
  return h;
}

// ═══════════════════════════════════════════════════════════════════════════
// DETTAGLIO PER BASE DI CARICO (30/09)
// Da quale base partono i viaggi e come si dividono fra i vettori: serve a
// decidere a chi affidare i viaggi di ogni base guardando il €/litro.
// Nessuna query nuova: si usano le righe gia' caricate per il report vettori.
// ═══════════════════════════════════════════════════════════════════════════
var _vetBaseF = { base: '', vettore: '', mese: '' };

function vetBaseFiltro(campo, valore) { _vetBaseF[campo] = valore || ''; _vetRenderBasi(); }

function _vetRighiFiltrate() {
  var d = _vetDati; if (!d || !d.righeBase) return [];
  return d.righeBase.filter(function (r) {
    if (_vetBaseF.base && r.baseId !== _vetBaseF.base) return false;
    if (_vetBaseF.vettore && r.vettoreId !== _vetBaseF.vettore) return false;
    if (_vetBaseF.mese !== '' && String(r.mese) !== String(_vetBaseF.mese)) return false;
    return true;
  });
}

function _vetRenderBasi() {
  var box = document.getElementById('vet-basi');
  var d = _vetDati;
  if (!box || !d) return;
  if (!d.righeBase || !d.righeBase.length) {
    box.innerHTML = '<div class="card" style="padding:14px;font-size:12.5px;color:var(--text-muted)">Nessun viaggio con base di carico nel ' + d.anno + '.</div>';
    return;
  }

  // elenchi per le tendine (sempre completi, non filtrati)
  var basiEl = {}, vettEl = {};
  d.righeBase.forEach(function (r) { basiEl[r.baseId] = r.baseNome; vettEl[r.vettoreId] = r.vettoreNome; });

  var righe = _vetRighiFiltrate();
  var perBase = {};
  righe.forEach(function (r) {
    var b = perBase[r.baseId] || (perBase[r.baseId] = { id: r.baseId, nome: r.baseNome, litri: 0, importo: 0, viaggi: {}, vett: {} });
    b.litri += r.litri; b.importo += r.importo; b.viaggi[r.caricoId] = true;
    var v = b.vett[r.vettoreId] || (b.vett[r.vettoreId] = { id: r.vettoreId, nome: r.vettoreNome, proprio: r.proprio, litri: 0, importo: 0, viaggi: {} });
    v.litri += r.litri; v.importo += r.importo; v.viaggi[r.caricoId] = true;
  });
  var basi = Object.keys(perBase).map(function (k) { return perBase[k]; }).sort(function (a, b) { return b.litri - a.litri; });
  var totLitri = basi.reduce(function (s, b) { return s + b.litri; }, 0);
  var totImp = basi.reduce(function (s, b) { return s + b.importo; }, 0);
  var totViaggi = basi.reduce(function (s, b) { return s + Object.keys(b.viaggi).length; }, 0);

  var sel = 'font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer';
  var h = '<div class="card" style="padding:14px">';
  h += '<div style="font-size:14px;font-weight:700">🏭 Dettaglio per base di carico</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">Quanti viaggi partono da ogni base e come si dividono fra i vettori.</div>';

  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">';
  h += '<select onchange="vetBaseFiltro(\'base\', this.value)" style="' + sel + '"><option value="">Tutte le basi</option>'
    + Object.keys(basiEl).sort(function (a, b) { return String(basiEl[a]).localeCompare(String(basiEl[b])); })
        .map(function (k) { return '<option value="' + k + '"' + (_vetBaseF.base === k ? ' selected' : '') + '>' + esc(basiEl[k]) + '</option>'; }).join('')
    + '</select>';
  h += '<select onchange="vetBaseFiltro(\'vettore\', this.value)" style="' + sel + '"><option value="">Tutti i vettori</option>'
    + Object.keys(vettEl).sort(function (a, b) { return String(vettEl[a]).localeCompare(String(vettEl[b])); })
        .map(function (k) { return '<option value="' + k + '"' + (_vetBaseF.vettore === k ? ' selected' : '') + '>' + esc(vettEl[k]) + '</option>'; }).join('')
    + '</select>';
  h += '<select onchange="vetBaseFiltro(\'mese\', this.value)" style="' + sel + '"><option value="">Tutto l\'anno ' + d.anno + '</option>'
    + _VET_MESI.map(function (m, i) { return '<option value="' + i + '"' + (String(_vetBaseF.mese) === String(i) ? ' selected' : '') + '>' + m + '</option>'; }).join('')
    + '</select>';
  h += '<button onclick="vetBasiPdf()" title="Stampa in PDF esattamente quello che vedi" style="font-size:12px;padding:6px 12px;border:0.5px solid #A32D2D;border-radius:7px;background:var(--bg);color:#A32D2D;font-weight:600;cursor:pointer">📄 Stampa PDF</button>';
  h += '<span style="margin-left:auto;font-size:11.5px;color:var(--text-muted)">' + _vetNum(totViaggi) + ' viaggi · ' + _vetNum(totLitri) + ' litri</span>';
  h += '</div>';

  if (!basi.length) {
    h += '<div style="padding:18px;text-align:center;font-size:12.5px;color:var(--text-muted)">Nessun viaggio con questi filtri.</div></div>';
    box.innerHTML = h;
    return;
  }

  // barre: litri per base divisi per vettore
  var COL = ['#185FA5', '#7E9BBD', '#B9C6D4', '#639922', '#BA7517', '#A32D2D', '#6B5FCC'];
  var colVett = {}; Object.keys(vettEl).forEach(function (k, i) { colVett[k] = COL[i % COL.length]; });
  var mx = basi[0].litri || 1;
  h += '<div style="border:0.5px solid var(--border);border-radius:10px;padding:11px 13px;margin-bottom:12px">';
  h += '<div style="font-size:12px;font-weight:600;margin-bottom:8px">Litri per base, divisi per vettore</div>';
  basi.forEach(function (b) {
    var vv = Object.keys(b.vett).map(function (k) { return b.vett[k]; }).sort(function (x, y) { return y.litri - x.litri; });
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      + '<div style="width:130px;font-size:11px;text-align:right;overflow:hidden;white-space:nowrap">' + esc(b.nome) + '</div>'
      + '<div style="flex:1;display:flex;height:16px;border-radius:3px;overflow:hidden;background:var(--bg)">'
      + '<div style="width:' + (b.litri / mx * 100).toFixed(1) + '%;display:flex">'
      + vv.map(function (v) { return '<div title="' + esc(v.nome) + ': ' + _vetNum(v.litri) + ' L" style="width:' + (v.litri / b.litri * 100).toFixed(1) + '%;background:' + colVett[v.id] + '"></div>'; }).join('')
      + '</div></div>'
      + '<div style="width:100px;font-size:11px;font-family:var(--font-mono);text-align:right">' + _vetNum(b.litri) + '</div></div>';
  });
  h += '<div style="display:flex;gap:14px;margin-top:9px;font-size:10.5px;color:var(--text-muted);flex-wrap:wrap">'
    + Object.keys(vettEl).map(function (k) {
        return '<span><span style="display:inline-block;width:9px;height:9px;background:' + colVett[k] + ';border-radius:2px"></span> ' + esc(vettEl[k]) + '</span>';
      }).join('') + '</div></div>';

  // tabella base → vettori
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px">';
  h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Base · vettore</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Viaggi</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Litri</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Litri/viaggio</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">€/litro</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Costo</th></tr>';
  basi.forEach(function (b) {
    var nv = Object.keys(b.viaggi).length;
    h += '<tr style="background:var(--bg-kpi);font-weight:700">'
      + '<td style="padding:7px">' + esc(b.nome) + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + _vetNum(nv) + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + _vetNum(b.litri) + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + (nv ? _vetNum(b.litri / nv) : '—') + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + (b.litri ? _vetNum(b.importo / b.litri, 4) : '—') + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + _vetEuro(b.importo) + '</td></tr>';
    var vv = Object.keys(b.vett).map(function (k) { return b.vett[k]; }).sort(function (x, y) { return y.litri - x.litri; });
    var costi = vv.filter(function (v) { return v.litri > 0 && v.importo > 0; }).map(function (v) { return v.importo / v.litri; });
    var min = costi.length ? Math.min.apply(null, costi) : null, max = costi.length ? Math.max.apply(null, costi) : null;
    vv.forEach(function (v) {
      var nvv = Object.keys(v.viaggi).length;
      var el = v.litri ? v.importo / v.litri : 0;
      var col = (costi.length > 1 && v.importo > 0)
        ? (Math.abs(el - min) < 1e-9 ? '#27500A' : (Math.abs(el - max) < 1e-9 ? '#A32D2D' : 'var(--text)'))
        : 'var(--text)';
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:6px 7px 6px 22px">' + esc(v.nome)
          + (v.proprio ? ' <span style="font-size:9px;background:var(--bg);border:0.5px solid var(--border);padding:1px 6px;border-radius:7px;color:var(--text-muted)">non fattura</span>' : '') + '</td>'
        + '<td style="padding:6px 7px;text-align:right;font-family:var(--font-mono)">' + _vetNum(nvv) + '</td>'
        + '<td style="padding:6px 7px;text-align:right;font-family:var(--font-mono)">' + _vetNum(v.litri) + '</td>'
        + '<td style="padding:6px 7px;text-align:right;font-family:var(--font-mono)">' + (nvv ? _vetNum(v.litri / nvv) : '—') + '</td>'
        + '<td style="padding:6px 7px;text-align:right;font-family:var(--font-mono);color:' + col + ';font-weight:600">' + (v.litri ? _vetNum(el, 4) : '—') + '</td>'
        + '<td style="padding:6px 7px;text-align:right;font-family:var(--font-mono)">' + _vetEuro(v.importo) + '</td></tr>';
    });
  });
  h += '<tr style="background:var(--bg-kpi);font-weight:700">'
    + '<td style="padding:8px">TOTALE</td>'
    + '<td style="padding:8px;text-align:right;font-family:var(--font-mono)">' + _vetNum(totViaggi) + '</td>'
    + '<td style="padding:8px;text-align:right;font-family:var(--font-mono)">' + _vetNum(totLitri) + '</td>'
    + '<td></td>'
    + '<td style="padding:8px;text-align:right;font-family:var(--font-mono)">' + (totLitri ? _vetNum(totImp / totLitri, 4) : '—') + '</td>'
    + '<td style="padding:8px;text-align:right;font-family:var(--font-mono)">' + _vetEuro(totImp) + '</td></tr>';
  h += '</table></div>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:9px">In verde il €/litro più basso della base, in rosso il più alto. '
    + 'La base viene dall\'ordine: se un viaggio raccoglie ordini di basi diverse, i litri vanno su ciascuna base per la loro quota. '
    + 'I viaggi senza carico registrato non compaiono qui — si vedono nel blocco “viaggi da attribuire”.</div>';
  h += '</div>';
  box.innerHTML = h;
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

// ── PDF della selezione (30/09) ────────────────────────────────────────────
// Stampa esattamente quello che si vede: stessi filtri, stesse barre, stessa
// tabella. Nessun calcolo nuovo: si riusano le righe gia' in memoria.
function vetBasiPdf() {
  var d = _vetDati; if (!d) return;
  var righe = _vetRighiFiltrate();
  if (!righe.length) { if (typeof toast === 'function') toast('Nessun viaggio da stampare con questi filtri'); return; }

  var perBase = {};
  righe.forEach(function (r) {
    var b = perBase[r.baseId] || (perBase[r.baseId] = { nome: r.baseNome, litri: 0, importo: 0, viaggi: {}, vett: {} });
    b.litri += r.litri; b.importo += r.importo; b.viaggi[r.caricoId] = true;
    var v = b.vett[r.vettoreId] || (b.vett[r.vettoreId] = { nome: r.vettoreNome, proprio: r.proprio, litri: 0, importo: 0, viaggi: {} });
    v.litri += r.litri; v.importo += r.importo; v.viaggi[r.caricoId] = true;
  });
  var basi = Object.keys(perBase).map(function (k) { return perBase[k]; }).sort(function (a, b) { return b.litri - a.litri; });
  var totLitri = basi.reduce(function (s2, b) { return s2 + b.litri; }, 0);
  var totImp = basi.reduce(function (s2, b) { return s2 + b.importo; }, 0);
  var totViaggi = basi.reduce(function (s2, b) { return s2 + Object.keys(b.viaggi).length; }, 0);

  // etichette dei filtri attivi, per scriverle nel documento
  var nomiBase = {}, nomiVett = {};
  d.righeBase.forEach(function (r) { nomiBase[r.baseId] = r.baseNome; nomiVett[r.vettoreId] = r.vettoreNome; });
  var filtri = [];
  filtri.push('Base: ' + (_vetBaseF.base ? (nomiBase[_vetBaseF.base] || '—') : 'tutte'));
  filtri.push('Vettore: ' + (_vetBaseF.vettore ? (nomiVett[_vetBaseF.vettore] || '—') : 'tutti'));
  filtri.push('Periodo: ' + (_vetBaseF.mese !== '' ? _VET_MESI[Number(_vetBaseF.mese)] + ' ' + d.anno : 'anno ' + d.anno));

  var mx = basi[0].litri || 1;
  var COL = ['#185FA5', '#7E9BBD', '#B9C6D4', '#639922', '#BA7517', '#A32D2D', '#6B5FCC'];
  var colVett = {}; Object.keys(nomiVett).forEach(function (k, i) { colVett[k] = COL[i % COL.length]; });

  var barre = basi.map(function (b) {
    var vv = Object.keys(b.vett).map(function (k) { return { k: k, v: b.vett[k] }; }).sort(function (x, y) { return y.v.litri - x.v.litri; });
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'
      + '<div style="width:140px;font-size:9px;text-align:right">' + b.nome + '</div>'
      + '<div style="flex:1;background:#F2F2F2;border-radius:3px;height:14px"><div style="width:' + (b.litri / mx * 100).toFixed(1) + '%;height:14px;display:flex;border-radius:3px;overflow:hidden">'
      + vv.map(function (x) { return '<div style="width:' + (x.v.litri / b.litri * 100).toFixed(1) + '%;background:' + (colVett[x.k] || '#999') + '"></div>'; }).join('')
      + '</div></div>'
      + '<div style="width:95px;font-size:9px;font-family:Consolas,monospace;text-align:right">' + _vetNum(b.litri) + '</div></div>';
  }).join('');
  var legenda = Object.keys(nomiVett).map(function (k) {
    return '<span style="margin-right:12px"><span style="display:inline-block;width:8px;height:8px;background:' + colVett[k] + '"></span> ' + nomiVett[k] + '</span>';
  }).join('');

  var corpo = '';
  basi.forEach(function (b) {
    var nv = Object.keys(b.viaggi).length;
    corpo += '<tr style="background:#EAF0F7;font-weight:700"><td>' + b.nome + '</td>'
      + '<td class="n">' + _vetNum(nv) + '</td><td class="n">' + _vetNum(b.litri) + '</td>'
      + '<td class="n">' + (nv ? _vetNum(b.litri / nv) : '—') + '</td>'
      + '<td class="n">' + (b.litri ? _vetNum(b.importo / b.litri, 4) : '—') + '</td>'
      + '<td class="n">' + _vetEuro(b.importo) + '</td></tr>';
    var vv = Object.keys(b.vett).map(function (k) { return b.vett[k]; }).sort(function (x, y) { return y.litri - x.litri; });
    var costi = vv.filter(function (v) { return v.litri > 0 && v.importo > 0; }).map(function (v) { return v.importo / v.litri; });
    var min = costi.length ? Math.min.apply(null, costi) : null, max = costi.length ? Math.max.apply(null, costi) : null;
    vv.forEach(function (v) {
      var nvv = Object.keys(v.viaggi).length, el = v.litri ? v.importo / v.litri : 0;
      var col = (costi.length > 1 && v.importo > 0)
        ? (Math.abs(el - min) < 1e-9 ? '#27500A' : (Math.abs(el - max) < 1e-9 ? '#A32D2D' : '#222')) : '#222';
      corpo += '<tr><td style="padding-left:16px">' + v.nome + (v.proprio ? ' <span style="font-size:8px;color:#777">non fattura</span>' : '') + '</td>'
        + '<td class="n">' + _vetNum(nvv) + '</td><td class="n">' + _vetNum(v.litri) + '</td>'
        + '<td class="n">' + (nvv ? _vetNum(v.litri / nvv) : '—') + '</td>'
        + '<td class="n" style="color:' + col + ';font-weight:600">' + (v.litri ? _vetNum(el, 4) : '—') + '</td>'
        + '<td class="n">' + _vetEuro(v.importo) + '</td></tr>';
    });
  });

  var oggi = new Date().toLocaleDateString('it-IT');
  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Trasporti per base ' + d.anno + '</title><style>'
    + '@page{size:A4;margin:13mm}body{font-family:Calibri,Arial,sans-serif;font-size:10.5px;color:#222;margin:0}'
    + 'h1{font-size:15px;margin:0}.sub{font-size:10px;color:#555;margin:2px 0 10px}'
    + '.filtri{font-size:10px;background:#F4F6F8;border:1px solid #DDD;border-radius:6px;padding:7px 10px;margin-bottom:12px}'
    + '.kpi{display:flex;gap:8px;margin-bottom:12px}.k{flex:1;border:1px solid #DDD;border-radius:6px;padding:7px 9px}'
    + '.k .l{font-size:8.5px;color:#666;text-transform:uppercase}.k .v{font-size:15px;font-weight:700;font-family:Consolas,monospace}'
    + '.box{border:1px solid #DDD;border-radius:6px;padding:10px 12px;margin-bottom:12px}'
    + 'table{width:100%;border-collapse:collapse;font-size:9.5px}thead{display:table-header-group}'
    + 'th{background:#0B2545;color:#fff;padding:6px 7px;font-size:8.5px;text-transform:uppercase;text-align:right}'
    + 'th.l{text-align:left}td{padding:5px 7px;border-bottom:1px solid #E8E8E8}td.n{text-align:right;font-family:Consolas,monospace}'
    + 'tr{page-break-inside:avoid}.foot{margin-top:14px;border-top:1px solid #DDD;padding-top:5px;font-size:8px;color:#777;text-align:center}'
    + '</style></head><body>'
    + '<h1>PHOENIX FUEL S.R.L. &mdash; Trasporti per base di carico</h1>'
    + '<div class="sub">Uffici e Deposito: Zona Industriale, 89900 Portosalvo (VV) &middot; P.IVA 02744150802 &middot; documento generato il ' + oggi + '</div>'
    + '<div class="filtri"><strong>Selezione:</strong> ' + filtri.join(' &nbsp;&middot;&nbsp; ') + '</div>'
    + '<div class="kpi">'
    + '<div class="k"><div class="l">Basi</div><div class="v">' + basi.length + '</div></div>'
    + '<div class="k"><div class="l">Viaggi</div><div class="v">' + _vetNum(totViaggi) + '</div></div>'
    + '<div class="k"><div class="l">Litri</div><div class="v">' + _vetNum(totLitri) + '</div></div>'
    + '<div class="k"><div class="l">Costo trasporto</div><div class="v">' + _vetEuro(totImp) + '</div><div class="l">' + (totLitri ? _vetNum(totImp / totLitri, 4) + ' &euro;/L medio' : '') + '</div></div>'
    + '</div>'
    + '<div class="box"><div style="font-size:11px;font-weight:700;margin-bottom:8px">Litri per base, divisi per vettore</div>' + barre
    + '<div style="font-size:8.5px;color:#555;margin-top:7px">' + legenda + '</div></div>'
    + '<table><thead><tr><th class="l">Base &middot; vettore</th><th>Viaggi</th><th>Litri</th><th>Litri/viaggio</th><th>&euro;/litro</th><th>Costo</th></tr></thead><tbody>'
    + corpo
    + '<tr style="background:#EAF0F7;font-weight:700"><td>TOTALE</td><td class="n">' + _vetNum(totViaggi) + '</td><td class="n">' + _vetNum(totLitri) + '</td><td></td>'
    + '<td class="n">' + (totLitri ? _vetNum(totImp / totLitri, 4) : '—') + '</td><td class="n">' + _vetEuro(totImp) + '</td></tr>'
    + '</tbody></table>'
    + '<div style="font-size:8.5px;color:#555;margin-top:8px">In verde il &euro;/litro piu\' basso della base, in rosso il piu\' alto. La base viene dall\'ordine: un viaggio con ordini di basi diverse ripartisce i litri fra le basi. I viaggi senza carico registrato non sono compresi.</div>'
    + '<div class="foot">Phoenix Fuel S.r.l. &middot; P.IVA 02744150802 &mdash; dati estratti dal gestionale PhoenixFuel</div>'
    + '</body></html>';

  var w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Abilita i popup per creare il PDF'); return; }
  w.document.write(doc); w.document.close(); w.focus();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}

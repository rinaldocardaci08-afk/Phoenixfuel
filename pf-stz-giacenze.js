// PhoenixFuel — Stazione: Giacenze mensili

// ═══════════════════════════════════════════════════════════════════
// TOGGLE VISTA GIACENZE STAZIONE (Giorno / Settimana / Mese)
// Step B.2: solo segmented control, Giorno e Settimana sono placeholder.
// Step B.3 implementerà Giorno e Settimana con vista tabellare multi-prodotto.
// Indipendente dalla dgwToggleVista del deposito per evitare collisioni.
// ═══════════════════════════════════════════════════════════════════
function stzgToggleVista(target) {
  var btnGg = document.getElementById('stzg-btn-giorno');
  var btnWk = document.getElementById('stzg-btn-week');
  var btnMs = document.getElementById('stzg-btn-mese');
  var blocoGg = document.getElementById('stzg-blocco-giorno');
  var blocoWk = document.getElementById('stzg-blocco-week');
  var blocoMs = document.getElementById('stzg-blocco-mese');
  if (!btnMs || !blocoMs) return;

  function _resetBtn(b) {
    if (!b) return;
    b.style.background = 'var(--bg)';
    b.style.color = 'var(--text)';
    b.style.border = '0.5px solid var(--border)';
  }
  function _activeBtn(b) {
    if (!b) return;
    b.style.background = 'var(--primary)';
    b.style.color = '#fff';
    b.style.border = '';
  }
  _resetBtn(btnGg); _resetBtn(btnWk); _resetBtn(btnMs);

  if (target === 'giorno') {
    _activeBtn(btnGg);
    if (blocoGg) blocoGg.style.display = '';
    if (blocoWk) blocoWk.style.display = 'none';
    blocoMs.style.display = 'none';
  } else if (target === 'week') {
    _activeBtn(btnWk);
    if (blocoGg) blocoGg.style.display = 'none';
    if (blocoWk) blocoWk.style.display = '';
    blocoMs.style.display = 'none';
  } else {
    // default: 'mese'
    _activeBtn(btnMs);
    if (blocoGg) blocoGg.style.display = 'none';
    if (blocoWk) blocoWk.style.display = 'none';
    blocoMs.style.display = '';
  }
}

// ═══════════════════════════════════════════════════════════════════
// GIACENZE MENSILI STAZIONE (trimestri)
// ═══════════════════════════════════════════════════════════════════

var _gmDati = null; // { prodotti: [{nome,coeff}], mesi: [{mese,prodotto,giacInizio,entrate,venduti,...}] }
var _gmTrim = 1;
var _gmMesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
var _gmCoeff = { 'default': 0.00085 }; // override per prodotto

function switchTrimestre(btn) {
  document.querySelectorAll('.gm-trim').forEach(function(t) {
    t.style.background = 'var(--bg)'; t.style.color = 'var(--text)';
    t.style.border = '0.5px solid var(--border)'; t.classList.remove('active');
  });
  btn.style.background = ''; btn.style.color = ''; btn.style.border = '';
  btn.classList.add('active');
  _gmTrim = parseInt(btn.dataset.trim);
  renderGiacenzeMensili();
}

async function caricaGiacenzeMensili() {
  // Step B.2: assicura che il segmented control mostri "Mese" come vista attiva quando si apre il tab Giacenza
  if (typeof stzgToggleVista === 'function') { try { stzgToggleVista('mese'); } catch(e) {} }
  // Init anno
  var selAnno = document.getElementById('gm-anno');
  if (selAnno && selAnno.options.length === 0) {
    var annoCorr = new Date().getFullYear();
    for (var y = annoCorr; y >= annoCorr - 5; y--) selAnno.innerHTML += '<option value="' + y + '"' + (y === annoCorr ? ' selected' : '') + '>' + y + '</option>';
  }
  var anno = parseInt(selAnno.value);

  // Identifica prodotti stazione (da cisterne)
  var { data: cisterne } = await sb.from('cisterne').select('prodotto').eq('sede', 'stazione_oppido');
  var prodottiSet = {};
  (cisterne || []).forEach(function(c) { if (c.prodotto) prodottiSet[c.prodotto] = true; });
  var prodotti = Object.keys(prodottiSet).sort(function(a,b){ if(a.toLowerCase().indexOf("gasolio")>=0&&b.toLowerCase().indexOf("gasolio")<0) return -1; if(a.toLowerCase().indexOf("gasolio")<0&&b.toLowerCase().indexOf("gasolio")>=0) return 1; return a.localeCompare(b); });
  if (!prodotti.length) prodotti = ['Gasolio Autotrazione', 'Benzina'];

  // Coefficienti cali tecnici
  _gmCoeff = {};
  prodotti.forEach(function(p) {
    _gmCoeff[p] = p.toLowerCase().indexOf('benzina') >= 0 ? 0.0025 : 0.00085;
  });

  // Carica dati salvati
  var { data: salvati } = await sb.from('giacenze_mensili').select('*').eq('anno', anno).order('mese');
  var salvMap = {};
  (salvati || []).forEach(function(s) { salvMap[s.prodotto + '_' + s.mese] = s; });

  // Carica giacenze inizio anno (dalla chiusura anno precedente o cisterne)
  var giacInizioAnno = {};
  var { data: giacAnnoPrec } = await sb.from('giacenze_mensili').select('prodotto,giacenza_rilevata')
    .eq('anno', anno - 1).eq('mese', 12);
  if (giacAnnoPrec && giacAnnoPrec.length) {
    giacAnnoPrec.forEach(function(g) { if (g.giacenza_rilevata !== null) giacInizioAnno[g.prodotto] = Number(g.giacenza_rilevata); });
  }
  // Fallback: primo mese salvato con giacenza_inizio
  prodotti.forEach(function(p) {
    if (giacInizioAnno[p] === undefined) {
      var s1 = salvMap[p + '_1'];
      if (s1 && Number(s1.giacenza_inizio) > 0) giacInizioAnno[p] = Number(s1.giacenza_inizio);
      else giacInizioAnno[p] = 0;
    }
  });

  // Per ogni mese: calcola entrate e venduti da DB
  var daISO = anno + '-01-01';
  var aISO = anno + '-12-31';

  var [ordiniRes, lettRes, lettPrecRes] = await Promise.all([
    sb.from('ordini').select('data,prodotto,litri').eq('tipo_ordine', 'stazione_servizio')
      .neq('stato', 'annullato').gte('data', daISO).lte('data', aISO),
    sb.from('stazione_letture').select('data,pompa_id,lettura')
      .gte('data', daISO).lte('data', aISO).order('data'),
    sb.from('stazione_letture').select('pompa_id,lettura,data')
      .lt('data', daISO).order('data', { ascending: false }).limit(50)
  ]);

  // Entrate per mese/prodotto
  var entrateMese = {};
  (ordiniRes.data || []).forEach(function(o) {
    var m = parseInt(o.data.substring(5, 7));
    var k = o.prodotto + '_' + m;
    entrateMese[k] = (entrateMese[k] || 0) + Number(o.litri);
  });

  // Venduti per mese/prodotto (da letture pompe)
  var { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva', true);
  var pompaMap = {};
  (pompe || []).forEach(function(p) { pompaMap[p.id] = p.prodotto; });

  // Costruisci mappa letture per pompa per data
  var tutteLett = (lettRes.data || []).concat(lettPrecRes.data || []);
  // Ordina per pompa e data
  var lettPerPompa = {};
  tutteLett.forEach(function(l) {
    if (!lettPerPompa[l.pompa_id]) lettPerPompa[l.pompa_id] = [];
    lettPerPompa[l.pompa_id].push({ data: l.data, lettura: Number(l.lettura) });
  });
  Object.keys(lettPerPompa).forEach(function(pid) {
    lettPerPompa[pid].sort(function(a, b) { return a.data < b.data ? -1 : 1; });
  });

  // Calcola venduti per mese/prodotto
  var vendutiMese = {};
  (pompe || []).forEach(function(p) {
    var arr = lettPerPompa[p.id] || [];
    for (var i = 1; i < arr.length; i++) {
      var dataCorr = arr[i].data;
      if (dataCorr < daISO || dataCorr > aISO) continue;
      var m = parseInt(dataCorr.substring(5, 7));
      var litri = Math.max(0, arr[i].lettura - arr[i - 1].lettura);
      var k = p.prodotto + '_' + m;
      vendutiMese[k] = (vendutiMese[k] || 0) + litri;
    }
  });

  // Costruisci array mesi per ogni prodotto
  var risultato = {};
  prodotti.forEach(function(prod) {
    risultato[prod] = [];
    var giacCorr = giacInizioAnno[prod] || 0;
    var diffCum = 0;

    for (var m = 1; m <= 12; m++) {
      var k = prod + '_' + m;
      var salv = salvMap[k] || {};
      var entrate = entrateMese[k] || 0;
      var venduti = Math.round(vendutiMese[k] || 0);
      var eccedenze = Number(salv.eccedenze_viaggio || 0);
      var caliV = Number(salv.cali_viaggio || 0);
      var scatti = Number(salv.scatti_vuoto || 0);
      var coeff = _gmCoeff[prod] || 0.00085;
      var caliSuggeriti = Math.round(entrate * coeff * 100) / 100;
      var caliTecnici = salv.cali_tecnici !== undefined && salv.cali_tecnici !== null ? Number(salv.cali_tecnici) : caliSuggeriti;
      var giacRilevata = salv.giacenza_rilevata !== undefined && salv.giacenza_rilevata !== null ? Number(salv.giacenza_rilevata) : null;

      var giacPresunta = Math.round((giacCorr + entrate + eccedenze - caliV - scatti - caliTecnici - venduti) * 100) / 100;
      var diffMese = giacRilevata !== null ? Math.round((giacPresunta - giacRilevata) * 100) / 100 : null;
      if (diffMese !== null) diffCum = Math.round((diffCum + diffMese) * 100) / 100;

      risultato[prod].push({
        mese: m, giacInizio: Math.round(giacCorr), entrate: entrate, eccedenze: eccedenze,
        caliViaggio: caliV, scatti: scatti, caliSuggeriti: caliSuggeriti, caliTecnici: caliTecnici,
        venduti: venduti, giacPresunta: giacPresunta, giacRilevata: giacRilevata,
        diffMese: diffMese, diffCumulata: giacRilevata !== null ? diffCum : null
      });

      // La giacenza inizio del mese dopo = giacenza rilevata se disponibile, altrimenti presunta
      giacCorr = giacRilevata !== null ? giacRilevata : giacPresunta;
    }
  });

  _gmDati = { prodotti: prodotti, mesi: risultato, anno: anno, giacInizioAnno: giacInizioAnno };
  renderGiacenzeMensili();
}

function renderGiacenzeMensili() {
  if (!_gmDati) return;
  var container = document.getElementById('gm-contenuto');
  var trim = _gmTrim;

  if (trim === 0) {
    // Vista totali anno
    container.innerHTML = _renderTotaliAnno();
    return;
  }

  var mesiIdx = trim === 1 ? [0,1,2] : trim === 2 ? [3,4,5] : trim === 3 ? [6,7,8] : [9,10,11];
  var html = '';

  _gmDati.prodotti.forEach(function(prod) {
    var dati = _gmDati.mesi[prod];
    var coeff = _gmCoeff[prod] || 0.00085;
    var pi = cacheProdotti.find(function(p) { return p.nome === prod; });
    var col = pi ? pi.colore : '#888';
    var isBenz = prod.toLowerCase().indexOf('benzina') >= 0;

    html += '<div style="font-size:12px;font-weight:500;color:#D85A30;text-transform:uppercase;letter-spacing:0.4px;border-bottom:2px solid #D85A30;padding-bottom:4px;margin:14px 0 6px;display:flex;align-items:center;gap:6px">';
    html += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + col + '"></span>' + esc(prod);
    html += '<span style="font-size:9px;color:var(--text-muted);font-weight:400;text-transform:none;letter-spacing:0">(cali: entrate x ' + coeff + ')</span></div>';

    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr>';
    html += '<th style="text-align:left;padding:6px 8px;border:0.5px solid var(--border);background:var(--bg);font-size:9px;text-transform:uppercase;min-width:170px"></th>';
    mesiIdx.forEach(function(i) {
      html += '<th style="text-align:right;padding:6px 8px;border:0.5px solid var(--border);background:var(--bg);font-size:10px;text-transform:uppercase;min-width:85px">' + _gmMesi[i] + '</th>';
    });
    html += '</tr></thead><tbody>';

    // Righe
    var righe = [
      { key: 'giacInizio', label: 'Giacenza inizio mese', cls: 'auto', badge: 'auto', color: '#0C447C', bg: '#E6F1FB' },
      { key: 'entrate', label: '+ Entrate (carichi)', cls: 'auto', badge: 'auto', color: '#0C447C', bg: '#E6F1FB' },
      { key: 'eccedenze', label: '+ Eccedenze viaggio', cls: 'manual', badge: 'man.', color: '#633806', bg: '#FAEEDA', input: 'eccedenze_viaggio' },
      { key: 'caliViaggio', label: '- Cali viaggio', cls: 'manual', badge: 'man.', color: '#633806', bg: '#FAEEDA', input: 'cali_viaggio', neg: true },
      { key: 'scatti', label: '- Scatti a vuoto', cls: 'manual', badge: 'man.', color: '#633806', bg: '#FAEEDA', input: 'scatti_vuoto', neg: true },
      { key: 'caliTecnici', label: '- Cali tecnici', cls: 'sug', badge: 'sug.', color: '#3C3489', bg: '#EEEDFE', input: 'cali_tecnici', neg: true },
      { key: 'venduti', label: '- Litri venduti (pompe)', cls: 'auto', badge: 'auto', color: '#0C447C', bg: '#E6F1FB', neg: true }
    ];

    righe.forEach(function(r) {
      var bgStyle = r.cls === 'auto' ? 'background:#E6F1FB' : r.cls === 'manual' ? 'background:#FAEEDA' : 'background:#EEEDFE';
      html += '<tr style="' + bgStyle + '"><td style="padding:5px 8px;border:0.5px solid var(--border);color:var(--text-muted)">' + r.label;
      html += ' <span style="display:inline-block;font-size:8px;padding:1px 5px;border-radius:3px;background:' + r.bg + ';color:' + r.color + ';margin-left:3px">' + r.badge + '</span>';
      if (r.key === 'caliTecnici') html += '<br/><span style="font-size:9px;color:#534AB7">suggerimento: entrate x ' + coeff + '</span>';
      html += '</td>';
      mesiIdx.forEach(function(i) {
        var d = dati[i];
        var val = d[r.key];
        if (r.input) {
          var placeholder = r.key === 'caliTecnici' ? d.caliSuggeriti : 0;
          html += '<td style="padding:2px 4px;border:0.5px solid var(--border);' + bgStyle + '">';
          html += '<input type="number" class="gm-input" data-prod="' + esc(prod) + '" data-mese="' + (i + 1) + '" data-field="' + r.input + '" value="' + (val || 0) + '" placeholder="' + placeholder + '" step="1" style="width:100%;font-family:var(--font-mono);font-size:12px;text-align:right;border:none;background:transparent;color:' + (r.neg ? '#A32D2D' : 'var(--text)') + ';padding:4px 6px" /></td>';
        } else {
          html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;' + (r.neg ? 'color:#A32D2D' : '') + '">' + _sep(Math.round(val).toLocaleString('it-IT')) + '</td>';
        }
      });
      html += '</tr>';
    });

    // Separatore
    html += '<tr><td style="padding:2px 0;border:none;border-top:2px solid ' + col + '" colspan="' + (mesiIdx.length + 1) + '"></td></tr>';

    // Giacenza presunta
    html += '<tr style="background:#EAF3DE"><td style="padding:5px 8px;border:0.5px solid var(--border);font-weight:500">= Giacenza presunta</td>';
    mesiIdx.forEach(function(i) {
      html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:#27500A">' + _sep(Math.round(dati[i].giacPresunta).toLocaleString('it-IT')) + '</td>';
    });
    html += '</tr>';

    // Giacenza rilevata (input)
    html += '<tr style="background:#FAEEDA"><td style="padding:5px 8px;border:0.5px solid var(--border);font-weight:500">Giacenza rilevata <span style="display:inline-block;font-size:8px;padding:1px 5px;border-radius:3px;background:#FAEEDA;color:#633806;margin-left:3px">man.</span></td>';
    mesiIdx.forEach(function(i) {
      var val = dati[i].giacRilevata;
      html += '<td style="padding:2px 4px;border:0.5px solid var(--border);background:#FAEEDA"><input type="number" class="gm-input" data-prod="' + esc(prod) + '" data-mese="' + (i + 1) + '" data-field="giacenza_rilevata" value="' + (val !== null ? val : '') + '" placeholder="—" step="1" style="width:100%;font-family:var(--font-mono);font-size:12px;text-align:right;border:none;background:transparent;color:var(--text);padding:4px 6px;font-weight:500" /></td>';
    });
    html += '</tr>';

    // Differenza mese
    html += '<tr style="background:#FCEBEB"><td style="padding:5px 8px;border:0.5px solid var(--border);font-weight:500">Differenza mese</td>';
    mesiIdx.forEach(function(i) {
      var d = dati[i];
      if (d.diffMese !== null) {
        var c = d.diffMese >= 0 ? '#27500A' : '#A32D2D';
        html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:' + c + '">' + (d.diffMese >= 0 ? '+' : '') + _sep(Math.round(d.diffMese).toLocaleString('it-IT')) + '</td>';
      } else {
        html += '<td style="padding:5px 8px;border:0.5px solid var(--border);text-align:center;color:var(--text-hint);font-size:10px">—</td>';
      }
    });
    html += '</tr>';

    // Differenza cumulata
    html += '<tr style="background:#FCEBEB"><td style="padding:5px 8px;border:0.5px solid var(--border);font-weight:500">Diff. cumulata anno</td>';
    mesiIdx.forEach(function(i) {
      var d = dati[i];
      if (d.diffCumulata !== null) {
        var c = d.diffCumulata >= 0 ? '#27500A' : '#A32D2D';
        html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:' + c + '">' + (d.diffCumulata >= 0 ? '+' : '') + _sep(Math.round(d.diffCumulata).toLocaleString('it-IT')) + '</td>';
      } else {
        html += '<td style="padding:5px 8px;border:0.5px solid var(--border);text-align:center;color:var(--text-hint);font-size:10px">—</td>';
      }
    });
    html += '</tr></tbody></table></div>';
  });

  container.innerHTML = html;
}

function _renderTotaliAnno() {
  if (!_gmDati) return '';
  var html = '<div style="font-size:12px;font-weight:500;color:#D85A30;text-transform:uppercase;letter-spacing:0.4px;border-bottom:2px solid #D85A30;padding-bottom:4px;margin:14px 0 6px">Riepilogo annuale ' + _gmDati.anno + '</div>';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="text-align:left;padding:6px 10px;border:0.5px solid var(--border);background:var(--bg);font-size:10px;text-transform:uppercase;min-width:180px"></th>';
  _gmDati.prodotti.forEach(function(prod) {
    var pi = cacheProdotti.find(function(p) { return p.nome === prod; });
    var col = pi ? pi.colore : '#888';
    html += '<th style="text-align:right;padding:6px 10px;border:0.5px solid var(--border);background:var(--bg);font-size:10px;min-width:110px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-right:4px;vertical-align:middle"></span>' + esc(prod) + '</th>';
  });
  html += '</tr></thead><tbody>';

  var campi = [
    { label: 'Giacenza inizio anno', bg: '#E6F1FB', calc: function(d) { return d[0].giacInizio; } },
    { label: 'Totale entrate', bg: '#E6F1FB', calc: function(d) { var s = 0; d.forEach(function(m) { s += m.entrate; }); return s; } },
    { label: 'Totale eccedenze viaggio', bg: '#FAEEDA', calc: function(d) { var s = 0; d.forEach(function(m) { s += m.eccedenze; }); return s; } },
    { label: 'Totale cali viaggio', bg: '#FAEEDA', neg: true, calc: function(d) { var s = 0; d.forEach(function(m) { s += m.caliViaggio; }); return s; } },
    { label: 'Totale scatti a vuoto', bg: '#FAEEDA', neg: true, calc: function(d) { var s = 0; d.forEach(function(m) { s += m.scatti; }); return s; } },
    { label: 'Totale cali tecnici', bg: '#EEEDFE', neg: true, calc: function(d) { var s = 0; d.forEach(function(m) { s += m.caliTecnici; }); return s; } },
    { label: 'Totale litri venduti', bg: '#E6F1FB', neg: true, calc: function(d) { var s = 0; d.forEach(function(m) { s += m.venduti; }); return s; } }
  ];

  campi.forEach(function(c) {
    html += '<tr style="background:' + c.bg + '"><td style="padding:5px 10px;border:0.5px solid var(--border);color:var(--text-muted)">' + c.label + '</td>';
    _gmDati.prodotti.forEach(function(prod) {
      var val = c.calc(_gmDati.mesi[prod]);
      html += '<td style="padding:5px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;' + (c.neg ? 'color:#A32D2D' : '') + '">' + _sep(Math.round(val).toLocaleString('it-IT')) + '</td>';
    });
    html += '</tr>';
  });

  // Separatore
  html += '<tr><td style="padding:2px 0;border:none;border-top:2px solid #D85A30" colspan="' + (_gmDati.prodotti.length + 1) + '"></td></tr>';

  // Giacenza presunta fine anno
  html += '<tr style="background:#EAF3DE"><td style="padding:6px 10px;border:0.5px solid var(--border);font-weight:500">Giacenza presunta fine anno</td>';
  _gmDati.prodotti.forEach(function(prod) {
    var ultimo = _gmDati.mesi[prod][11];
    html += '<td style="padding:6px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:#27500A">' + _sep(Math.round(ultimo.giacPresunta).toLocaleString('it-IT')) + '</td>';
  });
  html += '</tr>';

  // Giacenza rilevata fine anno (dicembre)
  html += '<tr style="background:#FAEEDA"><td style="padding:6px 10px;border:0.5px solid var(--border);font-weight:500">Giacenza rilevata fine anno</td>';
  _gmDati.prodotti.forEach(function(prod) {
    var ultimo = _gmDati.mesi[prod][11];
    html += '<td style="padding:6px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500">' + (ultimo.giacRilevata !== null ? _sep(Math.round(ultimo.giacRilevata).toLocaleString('it-IT')) : '—') + '</td>';
  });
  html += '</tr>';

  // Differenza annuale
  html += '<tr style="background:#FCEBEB"><td style="padding:6px 10px;border:0.5px solid var(--border);font-weight:500">Differenza annuale totale</td>';
  _gmDati.prodotti.forEach(function(prod) {
    var ultimo = _gmDati.mesi[prod][11];
    if (ultimo.diffCumulata !== null) {
      var c = ultimo.diffCumulata >= 0 ? '#27500A' : '#A32D2D';
      html += '<td style="padding:6px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:' + c + '">' + (ultimo.diffCumulata >= 0 ? '+' : '') + _sep(Math.round(ultimo.diffCumulata).toLocaleString('it-IT')) + '</td>';
    } else {
      html += '<td style="padding:6px 10px;border:0.5px solid var(--border);text-align:center;color:var(--text-hint)">—</td>';
    }
  });
  html += '</tr>';

  // Tolleranza
  html += '<tr style="background:var(--bg)"><td style="padding:5px 10px;border:0.5px solid var(--border);color:var(--text-muted)">Tolleranza (1% venduto)</td>';
  _gmDati.prodotti.forEach(function(prod) {
    var totV = 0; _gmDati.mesi[prod].forEach(function(m) { totV += m.venduti; });
    html += '<td style="padding:5px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right">' + _sep(Math.round(totV * 0.01).toLocaleString('it-IT')) + '</td>';
  });
  html += '</tr>';

  // Residuo in tolleranza
  html += '<tr style="background:#EAF3DE"><td style="padding:6px 10px;border:0.5px solid var(--border);font-weight:500">Residuo in tolleranza</td>';
  _gmDati.prodotti.forEach(function(prod) {
    var totV = 0; _gmDati.mesi[prod].forEach(function(m) { totV += m.venduti; });
    var toll = Math.round(totV * 0.01);
    var ultimo = _gmDati.mesi[prod][11];
    var diffAnn = ultimo.diffCumulata !== null ? Math.abs(Math.round(ultimo.diffCumulata)) : 0;
    var residuo = toll - diffAnn;
    var c = residuo >= 0 ? '#27500A' : '#A32D2D';
    html += '<td style="padding:6px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:' + c + '">' + _sep(residuo.toLocaleString('it-IT')) + '</td>';
  });
  html += '</tr></tbody></table></div>';
  return html;
}

async function salvaGiacenzeMensili() {
  if (!_gmDati) { toast('Carica prima i dati'); return; }
  var anno = _gmDati.anno;
  var inputs = document.querySelectorAll('.gm-input');
  var records = {};

  inputs.forEach(function(inp) {
    var prod = inp.dataset.prod;
    var mese = parseInt(inp.dataset.mese);
    var field = inp.dataset.field;
    var val = inp.value !== '' ? parseFloat(inp.value) : null;
    var k = prod + '_' + mese;
    if (!records[k]) records[k] = { anno: anno, mese: mese, prodotto: prod };
    records[k][field] = val;
  });

  // Aggiungi giacenza_inizio
  Object.keys(records).forEach(function(k) {
    var r = records[k];
    var dati = _gmDati.mesi[r.prodotto];
    if (dati && dati[r.mese - 1]) {
      r.giacenza_inizio = dati[r.mese - 1].giacInizio;
    }
  });

  var arr = Object.values(records);
  if (!arr.length) { toast('Nessun dato da salvare'); return; }

  toast('Salvataggio giacenze...');
  for (var i = 0; i < arr.length; i++) {
    var r = arr[i];
    var { data: existing } = await sb.from('giacenze_mensili').select('id')
      .eq('anno', r.anno).eq('mese', r.mese).eq('prodotto', r.prodotto).maybeSingle();
    if (existing) {
      await sb.from('giacenze_mensili').update(r).eq('id', existing.id);
    } else {
      await sb.from('giacenze_mensili').insert([r]);
    }
  }

  _auditLog('salva_giacenze_mensili', 'giacenze_mensili', 'Anno ' + anno);
  toast('Giacenze mensili salvate!');
  caricaGiacenzeMensili();
}

async function stampaGiacenzeMensili() {
  if (!_gmDati) { toast('Carica prima i dati'); return; }
  var w = _apriReport("Giacenze mensili"); if (!w) return;
  var anno = _gmDati.anno;

  var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Giacenze Mensili ' + anno + '</title>';
  h += '<style>body{font-family:Arial,sans-serif;font-size:9px;margin:0;padding:8mm;color:#1a1a18}@media print{.no-print{display:none!important}@page{size:landscape;margin:6mm}}table{width:100%;border-collapse:collapse}th,td{padding:4px 6px;border:1px solid #ccc;font-size:9px}th{background:#f5f5f0;font-size:8px;text-transform:uppercase;text-align:right}th:first-child{text-align:left}.m{font-family:Courier New,monospace;text-align:right}.sect{font-size:11px;font-weight:bold;color:#D85A30;border-bottom:2px solid #D85A30;padding-bottom:3px;margin:12px 0 5px}</style></head><body>';
  h += '<div style="display:flex;justify-content:space-between;border-bottom:3px solid #D85A30;padding-bottom:8px;margin-bottom:8px"><div><div style="font-size:16px;font-weight:bold;color:#D85A30">GIACENZE MENSILI STAZIONE — ' + anno + '</div><div style="font-size:10px;color:#666">Stazione Oppido Mamertina</div></div><div style="text-align:right"><div style="font-size:12px;font-weight:bold">PHOENIX FUEL SRL</div><div style="font-size:8px;color:#666">Generato: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  _gmDati.prodotti.forEach(function(prod) {
    var dati = _gmDati.mesi[prod];
    var pi = cacheProdotti.find(function(p) { return p.nome === prod; });
    var col = pi ? pi.colore : '#888';
    h += '<div class="sect"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-right:4px"></span>' + esc(prod) + '</div>';
    h += '<table><thead><tr><th style="text-align:left"></th>';
    _gmMesi.forEach(function(m) { h += '<th>' + m.substring(0, 3) + '</th>'; });
    h += '</tr></thead><tbody>';
    var labels = ['Giac. inizio','+ Entrate','+ Eccedenze','- Cali viaggio','- Scatti vuoto','- Cali tecnici','- Venduti','','= Giac. presunta','Giac. rilevata','Diff. mese','Diff. cumulata'];
    var keys = ['giacInizio','entrate','eccedenze','caliViaggio','scatti','caliTecnici','venduti','sep','giacPresunta','giacRilevata','diffMese','diffCumulata'];
    keys.forEach(function(key, ki) {
      if (key === 'sep') { h += '<tr><td style="padding:1px;border:none;border-top:2px solid ' + col + '" colspan="13"></td></tr>'; return; }
      var bg = ki <= 1 || ki === 6 ? '#E6F1FB' : ki <= 5 ? '#FAEEDA' : ki === 8 ? '#EAF3DE' : ki === 9 ? '#FAEEDA' : '#FCEBEB';
      if (ki === 5) bg = '#EEEDFE';
      h += '<tr style="background:' + bg + '"><td style="border:1px solid #ccc;font-size:8px">' + labels[ki] + '</td>';
      for (var m = 0; m < 12; m++) {
        var val = dati[m][key];
        if (val === null || val === undefined) { h += '<td class="m" style="border:1px solid #ccc;color:#999">—</td>'; }
        else {
          var neg = ki >= 3 && ki <= 6;
          var isRes = ki >= 10;
          var c2 = isRes ? (val >= 0 ? '#27500A' : '#A32D2D') : neg ? '#A32D2D' : '';
          h += '<td class="m" style="border:1px solid #ccc;' + (c2 ? 'color:' + c2 : '') + '">' + (isRes && val >= 0 ? '+' : '') + _sep(Math.round(val).toLocaleString('it-IT')) + '</td>';
        }
      }
      h += '</tr>';
    });
    h += '</tbody></table>';
  });

  h += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D85A30;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  w.document.open(); w.document.write(h); w.document.close();
}

// ═══════════════════════════════════════════════════════════════════
// CHIUSURA ANNO — Registra giacenza finale e passa al nuovo anno
// ═══════════════════════════════════════════════════════════════════
async function chiusuraAnno() {
  var anno = parseInt(document.getElementById('gm-anno').value);
  if (!anno) { toast('Seleziona un anno'); return; }

  // Carica prodotti stazione
  var { data: cisterne } = await sb.from('cisterne').select('prodotto').eq('sede', 'stazione_oppido');
  var prodottiSet = {};
  (cisterne || []).forEach(function(c) { if (c.prodotto) prodottiSet[c.prodotto] = true; });
  var prodotti = Object.keys(prodottiSet).sort(function(a,b){ if(a.toLowerCase().indexOf("gasolio")>=0&&b.toLowerCase().indexOf("gasolio")<0) return -1; if(a.toLowerCase().indexOf("gasolio")<0&&b.toLowerCase().indexOf("gasolio")>=0) return 1; return a.localeCompare(b); });
  if (!prodotti.length) prodotti = ['Gasolio Autotrazione', 'Benzina'];

  // Carica giacenza salvata dicembre anno corrente (se già esiste)
  var { data: dicSalvati } = await sb.from('giacenze_mensili').select('*').eq('anno', anno).eq('mese', 12);
  var dicMap = {};
  (dicSalvati || []).forEach(function(s) { dicMap[s.prodotto] = s; });

  // Calcola giacenza presunta di fine anno (da dati)
  var giacPresunta = {};
  if (_gmDati && _gmDati.anno === anno) {
    prodotti.forEach(function(p) {
      if (_gmDati.mesi[p] && _gmDati.mesi[p][11]) {
        giacPresunta[p] = Math.round(_gmDati.mesi[p][11].giacPresunta);
      }
    });
  }

  var h = '<div style="font-size:16px;font-weight:500;margin-bottom:4px">📋 Chiusura anno ' + anno + '</div>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;line-height:1.6">';
  h += 'Inserisci la <strong>giacenza reale rilevata al 31/12/' + anno + '</strong> per ogni prodotto.<br/>';
  h += 'Questo valore diventerà la <strong>giacenza iniziale del ' + (anno + 1) + '</strong>.</div>';

  h += '<div style="display:grid;gap:12px">';
  prodotti.forEach(function(p) {
    var pi = cacheProdotti ? cacheProdotti.find(function(x) { return x.nome === p; }) : null;
    var col = pi ? pi.colore : '#888';
    var salvata = dicMap[p] ? Number(dicMap[p].giacenza_rilevata) : '';
    var presunta = giacPresunta[p] || '—';

    h += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:var(--radius);padding:14px 18px;border-left:4px solid ' + col + '">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    h += '<div style="font-size:13px;font-weight:500"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + col + ';margin-right:6px"></span>' + esc(p) + '</div>';
    h += '<div style="font-size:11px;color:var(--text-muted)">Presunta: <strong style="font-family:var(--font-mono)">' + (typeof presunta === 'number' ? _sep(presunta.toLocaleString('it-IT')) + ' L' : presunta) + '</strong></div>';
    h += '</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    h += '<div><label style="font-size:11px;color:var(--text-muted)">Giacenza rilevata al 31/12/' + anno + '</label>';
    h += '<input type="number" id="chiusura-' + p.replace(/\s/g, '_') + '" value="' + (salvata !== '' && salvata !== null ? salvata : '') + '" placeholder="Litri rilevati" step="1" style="width:100%;font-family:var(--font-mono);font-size:16px;padding:10px 12px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg-card);color:var(--text)" /></div>';
    h += '<div><label style="font-size:11px;color:var(--text-muted)">Note (opzionali)</label>';
    h += '<input type="text" id="chiusura-note-' + p.replace(/\s/g, '_') + '" value="' + (dicMap[p] ? esc(dicMap[p].note || '') : 'Inventario fisico 31/12/' + anno) + '" placeholder="Es. inventario fisico" style="width:100%;font-size:13px;padding:10px 12px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg-card);color:var(--text)" /></div>';
    h += '</div></div>';
  });
  h += '</div>';

  h += '<div style="display:flex;gap:8px;margin-top:16px">';
  h += '<button class="btn-primary" style="flex:1;background:#D85A30;font-size:14px;padding:12px" onclick="_salvaChiusuraAnno(' + anno + ')">💾 Salva chiusura ' + anno + '</button>';
  h += '<button onclick="chiudiModal()" style="flex:0 0 auto;padding:12px 20px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button>';
  h += '</div>';

  apriModal(h);
}

async function _salvaChiusuraAnno(anno) {
  var { data: cisterne } = await sb.from('cisterne').select('prodotto').eq('sede', 'stazione_oppido');
  var prodottiSet = {};
  (cisterne || []).forEach(function(c) { if (c.prodotto) prodottiSet[c.prodotto] = true; });
  var prodotti = Object.keys(prodottiSet).sort(function(a,b){ if(a.toLowerCase().indexOf("gasolio")>=0&&b.toLowerCase().indexOf("gasolio")<0) return -1; if(a.toLowerCase().indexOf("gasolio")<0&&b.toLowerCase().indexOf("gasolio")>=0) return 1; return a.localeCompare(b); });
  if (!prodotti.length) prodotti = ['Gasolio Autotrazione', 'Benzina'];

  var salvati = 0;
  for (var i = 0; i < prodotti.length; i++) {
    var p = prodotti[i];
    var inputId = 'chiusura-' + p.replace(/\s/g, '_');
    var noteId = 'chiusura-note-' + p.replace(/\s/g, '_');
    var valEl = document.getElementById(inputId);
    var noteEl = document.getElementById(noteId);
    if (!valEl || valEl.value === '') continue;
    var val = parseFloat(valEl.value);
    if (isNaN(val) || val < 0) { toast('Valore non valido per ' + p); return; }
    var note = noteEl ? noteEl.value : '';

    // Upsert giacenza dicembre
    var { data: existing } = await sb.from('giacenze_mensili').select('id')
      .eq('anno', anno).eq('mese', 12).eq('prodotto', p).maybeSingle();
    var record = {
      anno: anno, mese: 12, prodotto: p,
      giacenza_rilevata: val, note: note || 'Chiusura anno ' + anno
    };
    if (existing) {
      await sb.from('giacenze_mensili').update(record).eq('id', existing.id);
    } else {
      await sb.from('giacenze_mensili').insert([record]);
    }
    salvati++;
  }

  if (salvati === 0) { toast('Inserisci almeno una giacenza'); return; }

  _auditLog('chiusura_anno', 'giacenze_mensili', 'Chiusura ' + anno + ': ' + salvati + ' prodotti');
  toast('Chiusura anno ' + anno + ' salvata! Giacenze iniziali ' + (anno + 1) + ' impostate.');
  chiudiModal();
  caricaGiacenzeMensili();
}

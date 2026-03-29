// PhoenixFuel — Futures ICE Gasoil
// Analisi curve futures, contango/backwardation, segnali operativi

var _chartFutures = null;
var _chartFuturesStorico = null;

function _getMesiFutures() {
  var mesi = [];
  var now = new Date();
  for (var i = 0; i < 6; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    var label = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][d.getMonth()] + ' ' + d.getFullYear();
    var value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    mesi.push({ label: label, value: value });
  }
  return mesi;
}

async function renderFutures() {
  var wrap = document.getElementById('futures-wrap');
  if (!wrap) return;
  var prodotto = 'Gasolio Autotrazione';
  var mesi = _getMesiFutures();

  // Input form
  var html = '<div class="card" style="margin-bottom:16px">';
  html += '<div class="card-title">Inserisci quotazioni Futures ICE Gasoil</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Inserisci i prezzi dei contratti futures ICE Gasoil (€/tonnellata o €/litro) per le prossime scadenze. Fonte: <a href="https://www.theice.com/products/34361831/Low-Sulphur-Gasoil-Futures" target="_blank" style="color:#378ADD">ICE Exchange</a></div>';
  html += '<div class="form-grid">';
  html += '<div class="form-group"><label>Data rilevazione</label><input type="date" id="fut-data" value="' + oggiISO + '" /></div>';
  html += '<div class="form-group"><label>Prodotto</label><select id="fut-prodotto" style="font-size:14px;padding:8px 12px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)"><option value="Gasolio Autotrazione">Gasolio ICE</option><option value="Benzina">Benzina RBOB</option></select></div>';
  html += '</div>';
  html += '<div style="font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin:10px 0 6px">Scadenze contratti (€/litro o $/tonn)</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">';
  mesi.forEach(function(m) {
    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:8px 10px;text-align:center">';
    html += '<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">' + m.label + '</div>';
    html += '<input type="number" class="fut-scad-input" data-scadenza="' + m.value + '" step="0.0001" placeholder="0.0000" style="width:100%;font-family:var(--font-mono);font-size:14px;text-align:center;border:0.5px solid var(--border);border-radius:6px;padding:6px;background:var(--bg);color:var(--text)" />';
    html += '</div>';
  });
  html += '</div>';
  html += '<button class="btn-primary" onclick="salvaFutures()" style="margin-top:10px">💾 Salva quotazioni futures</button>';
  html += '</div>';

  // KPI + Curva + Analisi
  html += '<div class="grid4" style="margin-bottom:12px" id="fut-kpi"></div>';
  html += '<div class="card" style="margin-bottom:16px"><div class="card-title">Curva futures (struttura a termine)</div><canvas id="chart-futures" height="260"></canvas></div>';
  html += '<div class="card" style="margin-bottom:16px" id="fut-analisi"></div>';
  html += '<div class="card" style="margin-bottom:16px"><div class="card-title">Storico front-month</div><canvas id="chart-futures-storico" height="240"></canvas></div>';
  html += '<div class="card"><div class="card-title">Storico quotazioni</div><div style="overflow-x:auto"><table><thead><tr><th>Data</th>';
  mesi.forEach(function(m) { html += '<th style="text-align:right">' + m.label + '</th>'; });
  html += '<th>Struttura</th></tr></thead><tbody id="fut-tabella"><tr><td colspan="8" class="loading">Caricamento...</td></tr></tbody></table></div></div>';

  wrap.innerHTML = html;

  // Carica dati salvati
  await _caricaDatiFutures();
}

async function _caricaDatiFutures() {
  var prodotto = document.getElementById('fut-prodotto')?.value || 'Gasolio Autotrazione';
  var { data: tutti } = await sb.from('futures_prezzi').select('*').eq('prodotto', prodotto).order('data', { ascending: false }).limit(500);
  if (!tutti || !tutti.length) {
    document.getElementById('fut-kpi').innerHTML = '';
    document.getElementById('fut-analisi').innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted)">Inserisci le prime quotazioni futures per attivare l\'analisi</div>';
    document.getElementById('fut-tabella').innerHTML = '<tr><td colspan="8" class="loading">Nessun dato</td></tr>';
    return;
  }

  // Raggruppa per data
  var perData = {};
  tutti.forEach(function(f) {
    if (!perData[f.data]) perData[f.data] = {};
    perData[f.data][f.scadenza] = Number(f.prezzo);
  });
  var dateOrd = Object.keys(perData).sort().reverse();
  var mesi = _getMesiFutures();

  // Popola input con ultima data
  var ultimaData = dateOrd[0];
  var ultimiPrezzi = perData[ultimaData];
  document.querySelectorAll('.fut-scad-input').forEach(function(inp) {
    var scad = inp.dataset.scadenza;
    if (ultimiPrezzi[scad]) inp.value = ultimiPrezzi[scad];
  });

  // Analisi curva corrente
  var scadenze = mesi.map(function(m) { return m.value; });
  var prezziCurva = scadenze.map(function(s) { return ultimiPrezzi[s] || null; });
  var prezziValidi = prezziCurva.filter(function(p) { return p !== null; });

  if (prezziValidi.length < 2) {
    document.getElementById('fut-analisi').innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted)">Serve almeno 2 scadenze per analizzare la curva</div>';
    return;
  }

  var frontMonth = prezziValidi[0];
  var backMonth = prezziValidi[prezziValidi.length - 1];
  var spread = backMonth - frontMonth;
  var isContango = spread > 0.001;
  var isBackwardation = spread < -0.001;
  var struttura = isContango ? 'CONTANGO' : isBackwardation ? 'BACKWARDATION' : 'FLAT';
  var strutturaColor = isContango ? '#E24B4A' : isBackwardation ? '#639922' : '#BA7517';

  // CMP corrente dal benchmark
  var { data: cmpData } = await sb.from('stazione_costi').select('costo_litro').eq('prodotto', prodotto).order('data', { ascending: false }).limit(1);
  var cmp = cmpData && cmpData.length ? Number(cmpData[0].costo_litro) : 0;
  var deltaFutCmp = cmp > 0 ? frontMonth - cmp : 0;

  // Variazione front-month vs settimana scorsa
  var varSettimanale = 0;
  if (dateOrd.length >= 2) {
    var settimanaPrima = dateOrd.find(function(d) { return d <= new Date(new Date(ultimaData).getTime() - 5 * 86400000).toISOString().split('T')[0]; });
    if (settimanaPrima && perData[settimanaPrima]) {
      var frontPrec = null;
      scadenze.forEach(function(s) { if (frontPrec === null && perData[settimanaPrima][s]) frontPrec = perData[settimanaPrima][s]; });
      if (frontPrec) varSettimanale = frontMonth - frontPrec;
    }
  }

  // KPI
  document.getElementById('fut-kpi').innerHTML =
    '<div class="kpi"><div class="kpi-label">Front-month</div><div class="kpi-value" style="color:#BA7517">€ ' + frontMonth.toFixed(4) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Var. settimanale</div><div class="kpi-value" style="color:' + (varSettimanale >= 0 ? '#E24B4A' : '#639922') + '">' + (varSettimanale >= 0 ? '+' : '') + varSettimanale.toFixed(4) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Struttura</div><div class="kpi-value" style="color:' + strutturaColor + '">' + struttura + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Spread curva</div><div class="kpi-value" style="color:' + strutturaColor + '">' + (spread >= 0 ? '+' : '') + spread.toFixed(4) + '</div></div>';

  // Segnale operativo
  var segnale = '', consiglio = '';
  if (isContango) {
    segnale = '📈 CONTANGO — i prezzi futuri sono superiori ai prezzi spot';
    consiglio = 'Il mercato si aspetta prezzi in salita. Valuta di anticipare gli acquisti e aumentare le scorte di deposito. Lo spread contango di € ' + spread.toFixed(4) + '/L suggerisce che comprare ora è vantaggioso rispetto ad aspettare.';
  } else if (isBackwardation) {
    segnale = '📉 BACKWARDATION — i prezzi futuri sono inferiori ai prezzi spot';
    consiglio = 'Il mercato si aspetta prezzi in discesa. Puoi ritardare gli acquisti non urgenti e ridurre le scorte. Lo spread di € ' + Math.abs(spread).toFixed(4) + '/L indica che i prezzi dovrebbero scendere nei prossimi mesi.';
  } else {
    segnale = '➡️ FLAT — la curva futures è piatta';
    consiglio = 'Il mercato non prevede variazioni significative. Procedi con gli acquisti pianificati normalmente.';
  }

  document.getElementById('fut-analisi').innerHTML =
    '<div style="font-size:11px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Analisi curva futures</div>' +
    '<div style="padding:12px 16px;border-left:4px solid ' + strutturaColor + ';background:var(--bg);border-radius:0 8px 8px 0;margin-bottom:12px">' +
      '<div style="font-size:14px;font-weight:600;color:' + strutturaColor + '">' + segnale + '</div>' +
      '<div style="font-size:12px;color:var(--text);margin-top:6px;line-height:1.6">' + consiglio + '</div>' +
    '</div>' +
    (cmp > 0 ? '<div style="padding:10px 14px;background:var(--bg);border-radius:8px;font-size:12px"><strong>Tuo CMP:</strong> € ' + cmp.toFixed(4) + ' · <strong>Front-month:</strong> € ' + frontMonth.toFixed(4) + ' · <strong>Delta:</strong> <span style="color:' + (deltaFutCmp >= 0 ? '#E24B4A' : '#639922') + ';font-weight:600">' + (deltaFutCmp >= 0 ? '+' : '') + deltaFutCmp.toFixed(4) + '</span>' + (deltaFutCmp < 0 ? ' (stai comprando sotto il futures — buon posizionamento)' : ' (il futures è sopra il tuo CMP — il mercato prevede rialzi)') + '</div>' : '');

  // Grafico curva
  var ctx = document.getElementById('chart-futures');
  if (ctx && prezziValidi.length >= 2) {
    if (_chartFutures) _chartFutures.destroy();
    var labelsCurva = mesi.filter(function(m, i) { return prezziCurva[i] !== null; }).map(function(m) { return m.label; });
    _chartFutures = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labelsCurva,
        datasets: [
          { label: 'Futures ' + prodotto, data: prezziValidi, borderColor: strutturaColor, backgroundColor: strutturaColor + '20', borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 5, pointBackgroundColor: strutturaColor },
          cmp > 0 ? { label: 'Tuo CMP', data: Array(labelsCurva.length).fill(cmp), borderColor: '#639922', borderWidth: 1.5, borderDash: [5, 3], fill: false, pointRadius: 0 } : null
        ].filter(Boolean)
      },
      options: { responsive: true, plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: false } } }
    });
  }

  // Grafico storico front-month
  var ctxS = document.getElementById('chart-futures-storico');
  if (ctxS && dateOrd.length >= 3) {
    if (_chartFuturesStorico) _chartFuturesStorico.destroy();
    var storicoDate = dateOrd.slice(0, 60).reverse();
    var storicoValori = storicoDate.map(function(d) {
      var pd = perData[d];
      for (var i = 0; i < scadenze.length; i++) { if (pd[scadenze[i]]) return pd[scadenze[i]]; }
      return null;
    });
    _chartFuturesStorico = new Chart(ctxS, {
      type: 'line',
      data: {
        labels: storicoDate.map(function(d) { return d.substring(5); }),
        datasets: [{ label: 'Front-month', data: storicoValori, borderColor: '#BA7517', backgroundColor: 'rgba(186,117,23,0.1)', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 1 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false }, x: { ticks: { maxTicksLimit: 15, font: { size: 9 } } } } }
    });
  }

  // Tabella storico
  var tbody = document.getElementById('fut-tabella');
  var maxRighe = Math.min(dateOrd.length, 30);
  var righeHtml = '';
  for (var i = 0; i < maxRighe; i++) {
    var d = dateOrd[i];
    var pd = perData[d];
    var valori = scadenze.map(function(s) { return pd[s] || null; });
    var validi = valori.filter(function(v) { return v !== null; });
    var strut = '—';
    if (validi.length >= 2) {
      var sp = validi[validi.length - 1] - validi[0];
      strut = sp > 0.001 ? '<span style="color:#E24B4A">Contango</span>' : sp < -0.001 ? '<span style="color:#639922">Backw.</span>' : '<span style="color:#BA7517">Flat</span>';
    }
    righeHtml += '<tr' + (i % 2 ? ' style="background:var(--bg)"' : '') + '><td style="font-weight:500">' + d + '</td>';
    valori.forEach(function(v) {
      righeHtml += '<td style="text-align:right;font-family:var(--font-mono)">' + (v !== null ? '€ ' + v.toFixed(4) : '—') + '</td>';
    });
    righeHtml += '<td style="text-align:center;font-size:11px;font-weight:500">' + strut + '</td></tr>';
  }
  tbody.innerHTML = righeHtml || '<tr><td colspan="8" class="loading">Nessun dato</td></tr>';
}

async function salvaFutures() {
  var data = document.getElementById('fut-data').value;
  var prodotto = document.getElementById('fut-prodotto').value;
  if (!data) { toast('Seleziona una data'); return; }

  var inputs = document.querySelectorAll('.fut-scad-input');
  var records = [];
  inputs.forEach(function(inp) {
    var prezzo = parseFloat(inp.value);
    if (prezzo > 0) {
      records.push({ data: data, prodotto: prodotto, scadenza: inp.dataset.scadenza, prezzo: prezzo });
    }
  });

  if (!records.length) { toast('Inserisci almeno un prezzo'); return; }

  for (var i = 0; i < records.length; i++) {
    await sb.from('futures_prezzi').upsert(records[i], { onConflict: 'data,prodotto,scadenza' });
  }

  _auditLog('salva_futures', 'futures_prezzi', data + ' — ' + prodotto + ' — ' + records.length + ' scadenze');
  toast('Quotazioni futures salvate!');
  await _caricaDatiFutures();
}

// Alert futures per dashboard
async function caricaAlertFutures() {
  var el = document.getElementById('dash-alert-futures');
  if (!el) return;

  var { data: ultimi } = await sb.from('futures_prezzi').select('data,scadenza,prezzo,prodotto')
    .eq('prodotto', 'Gasolio Autotrazione').order('data', { ascending: false }).limit(20);

  if (!ultimi || ultimi.length < 2) { el.style.display = 'none'; return; }

  // Raggruppa per data
  var perData = {};
  ultimi.forEach(function(f) {
    if (!perData[f.data]) perData[f.data] = {};
    perData[f.data][f.scadenza] = Number(f.prezzo);
  });
  var dateOrd = Object.keys(perData).sort().reverse();
  if (!dateOrd.length) { el.style.display = 'none'; return; }

  var ultimaData = dateOrd[0];
  var pd = perData[ultimaData];
  var scadenze = Object.keys(pd).sort();
  if (scadenze.length < 2) { el.style.display = 'none'; return; }

  var front = pd[scadenze[0]];
  var back = pd[scadenze[scadenze.length - 1]];
  var spread = back - front;
  var isContango = spread > 0.001;
  var isBackwardation = spread < -0.001;

  if (!isContango && !isBackwardation) { el.style.display = 'none'; return; }

  var colore = isContango ? '#E24B4A' : '#639922';
  var icona = isContango ? '📈' : '📉';
  var testo = isContango
    ? 'Futures in CONTANGO (+€ ' + spread.toFixed(4) + '/L) — il mercato prevede rialzi, valuta anticipare acquisti'
    : 'Futures in BACKWARDATION (€ ' + spread.toFixed(4) + '/L) — il mercato prevede ribassi';

  el.style.display = '';
  el.innerHTML = '<div style="padding:10px 14px;background:' + colore + '12;border-left:4px solid ' + colore + ';border-radius:0 8px 8px 0;font-size:12px;color:' + colore + ';font-weight:500">' + icona + ' ' + testo + '</div>';
}

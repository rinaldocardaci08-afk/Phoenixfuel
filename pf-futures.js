// PhoenixFuel — Futures ICE Gasoil (LGO=F + EUR/USD)

var _chartFutEuro = null, _chartFutLgo = null, _chartFutEurusd = null;
var FUTURES_LITRI_CARICO = 35000;
var FUTURES_LITRI_TONNELLATA = 1175;

// ═══════════════════════════════════════════
// FETCH DATI YAHOO FINANCE
// ═══════════════════════════════════════════
async function _fetchDatiFutures() {
  try {
    var [resLgo, resEur] = await Promise.all([
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/LGO%3DF?interval=1d&range=30d'),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/EURUSD%3DX?interval=1d&range=30d')
    ]);
    if (!resLgo.ok || !resEur.ok) throw new Error('HTTP error');
    var [jLgo, jEur] = await Promise.all([resLgo.json(), resEur.json()]);

    var rLgo = jLgo.chart.result[0], rEur = jEur.chart.result[0];
    var mLgo = rLgo.meta, mEur = rEur.meta;

    var lgoOggi  = mLgo.regularMarketPrice;
    var lgoPrec  = mLgo.chartPreviousClose || mLgo.previousClose;
    var eurOggi  = mEur.regularMarketPrice;
    var eurPrec  = mEur.chartPreviousClose || mEur.previousClose;

    // Serie storiche per i grafici
    var tsLgo = rLgo.timestamp || [];
    var clLgo = rLgo.indicators.quote[0].close || [];
    var tsEur = rEur.timestamp || [];
    var clEur = rEur.indicators.quote[0].close || [];

    var mapLgo = {}, mapEur = {};
    tsLgo.forEach(function(t, i) { if (clLgo[i] != null) mapLgo[new Date(t * 1000).toISOString().split('T')[0]] = clLgo[i]; });
    tsEur.forEach(function(t, i) { if (clEur[i] != null) mapEur[new Date(t * 1000).toISOString().split('T')[0]] = clEur[i]; });

    var dateComuni = Object.keys(mapLgo).filter(function(d) { return mapEur[d]; }).sort();

    var serieEuroL  = dateComuni.map(function(d) { return Math.round((mapLgo[d] / mapEur[d] / FUTURES_LITRI_TONNELLATA) * 100000) / 100000; });
    var serieLgo    = dateComuni.map(function(d) { return Math.round(mapLgo[d] * 100) / 100; });
    var serieEurusd = dateComuni.map(function(d) { return Math.round(mapEur[d] * 10000) / 10000; });

    var prezzoOggi  = lgoOggi  / eurOggi  / FUTURES_LITRI_TONNELLATA;
    var prezzoIeri  = lgoPrec  / eurPrec  / FUTURES_LITRI_TONNELLATA;
    var varEuroL    = prezzoOggi - prezzoIeri;
    var varPctLgo   = ((lgoOggi - lgoPrec) / lgoPrec) * 100;
    var varPctEur   = ((eurOggi - eurPrec) / eurPrec) * 100;
    var impattoNetto = varPctLgo - varPctEur;
    var segnale     = impattoNetto > 1.5 ? 'rialzo' : impattoNetto < -1.5 ? 'ribasso' : 'stabile';

    return {
      lgoOggi: lgoOggi, lgoPrec: lgoPrec,
      eurOggi: eurOggi, eurPrec: eurPrec,
      prezzoOggi: prezzoOggi, prezzoIeri: prezzoIeri,
      varEuroL: varEuroL, impattoNetto: impattoNetto,
      varPctLgo: varPctLgo, varPctEur: varPctEur, segnale: segnale,
      dateComuni: dateComuni, serieEuroL: serieEuroL,
      serieLgo: serieLgo, serieEurusd: serieEurusd,
      aggiornato: new Date(mLgo.regularMarketTime * 1000)
    };
  } catch(e) {
    console.warn('Futures fetch error:', e);
    return null;
  }
}

// ═══════════════════════════════════════════
// SUPABASE — salva e carica storico
// ═══════════════════════════════════════════
async function _salvaFuturesStorico(dati) {
  try {
    var oggi = new Date().toISOString().split('T')[0];
    await sb.from('futures_storico').upsert({
      data: oggi,
      lgo_usd:           Math.round(dati.lgoOggi * 100) / 100,
      eurusd:            Math.round(dati.eurOggi * 10000) / 10000,
      prezzo_euro_litro: Math.round(dati.prezzoOggi * 100000) / 100000,
      var_euro_litro:    Math.round(dati.varEuroL * 100000) / 100000,
      segnale:           dati.segnale,
      impatto_pct:       Math.round(dati.impattoNetto * 100) / 100
    }, { onConflict: 'data' });
  } catch(e) { console.warn('Salva futures err:', e); }
}

async function _caricaFuturesStorico() {
  try {
    var { data } = await sb.from('futures_storico')
      .select('*').order('data', { ascending: false }).limit(30);
    return data || [];
  } catch(e) { return []; }
}

// ═══════════════════════════════════════════
// RENDER PRINCIPALE SEZIONE FUTURES
// ═══════════════════════════════════════════
async function renderFutures() {
  var wrap = document.getElementById('futures-wrap');
  if (!wrap) return;

  wrap.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:14px">⏳ Recupero dati mercato in corso…</div>';

  var dati = await _fetchDatiFutures();

  if (!dati) {
    wrap.innerHTML =
      '<div style="text-align:center;padding:48px;color:var(--text-muted);background:var(--surface);border-radius:10px;border:1px solid var(--border)">' +
      '<div style="font-size:32px;margin-bottom:12px">⚠️</div>' +
      '<div style="font-size:14px;margin-bottom:6px">Dati ICE Gasoil non disponibili</div>' +
      '<div style="font-size:12px">Il mercato potrebbe essere chiuso oppure il servizio temporaneamente non raggiungibile.<br>Riprova dopo le 17:30 nei giorni feriali.</div>' +
      '<button onclick="renderFutures()" style="margin-top:16px;padding:8px 20px;border-radius:6px;border:none;background:var(--primary);color:#fff;cursor:pointer">🔄 Riprova</button>' +
      '</div>';
    return;
  }

  await _salvaFuturesStorico(dati);
  var storico = await _caricaFuturesStorico();
  _renderFuturesUI(wrap, dati, storico);
}

// ═══════════════════════════════════════════
// BUILD HTML UI
// ═══════════════════════════════════════════
function _renderFuturesUI(wrap, dati, storico) {
  var su        = dati.varEuroL >= 0;
  var colS      = dati.segnale === 'rialzo' ? '#E24B4A' : dati.segnale === 'ribasso' ? '#639922' : '#BA7517';
  var iconS     = dati.segnale === 'rialzo' ? '🔴' : dati.segnale === 'ribasso' ? '🟢' : '🟡';
  var testoS    = dati.segnale === 'rialzo' ? 'Probabile rialzo prezzi domani' :
                  dati.segnale === 'ribasso' ? 'Probabile ribasso prezzi domani' : 'Mercato stabile';
  var consiglioS= dati.segnale === 'rialzo' ? 'Valuta di anticipare l\'ordine o aggiornare il listino' :
                  dati.segnale === 'ribasso' ? 'Potresti attendere per acquistare a prezzi migliori' : 'Nessuna azione urgente';
  var impattoCarico = dati.varEuroL * FUTURES_LITRI_CARICO;
  var oraAgg    = dati.aggiornato.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  var dataAgg   = dati.aggiornato.toLocaleDateString('it-IT');

  // Semaforo luci
  var lampR = dati.segnale === 'rialzo'  ? 'background:#E24B4A;box-shadow:0 0 10px #E24B4A' : 'background:#1a1a1a';
  var lampY = dati.segnale === 'stabile' ? 'background:#BA7517;box-shadow:0 0 10px #BA7517' : 'background:#1a1a1a';
  var lampG = dati.segnale === 'ribasso' ? 'background:#639922;box-shadow:0 0 10px #639922' : 'background:#1a1a1a';

  var varPctEuroL = dati.prezzoIeri > 0 ? (dati.varEuroL / dati.prezzoIeri * 100) : 0;

  wrap.innerHTML =
    // ── Semaforo alert ──
    '<div style="background:var(--surface);border:1px solid ' + colS + ';border-left:4px solid ' + colS + ';border-radius:10px;padding:16px 20px;display:flex;align-items:center;gap:16px;margin-bottom:16px">' +
      '<div style="display:flex;flex-direction:column;gap:5px;align-items:center">' +
        '<div style="width:16px;height:16px;border-radius:50%;' + lampR + '"></div>' +
        '<div style="width:16px;height:16px;border-radius:50%;' + lampY + '"></div>' +
        '<div style="width:16px;height:16px;border-radius:50%;' + lampG + '"></div>' +
      '</div>' +
      '<div style="flex:1">' +
        '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Segnale Mercato · ICE Gasoil + EUR/USD</div>' +
        '<div style="font-size:17px;font-weight:700;color:' + colS + '">' + iconS + ' ' + testoS + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:3px">' +
          'LGO=F ' + (dati.varPctLgo >= 0 ? '+' : '') + dati.varPctLgo.toFixed(2) + '% &nbsp;·&nbsp; ' +
          'EUR/USD ' + (dati.varPctEur >= 0 ? '+' : '') + dati.varPctEur.toFixed(2) + '% &nbsp;·&nbsp; ' +
          'Impatto netto <strong style="color:' + colS + '">' + (dati.impattoNetto >= 0 ? '+' : '') + dati.impattoNetto.toFixed(2) + '%</strong>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-hint);font-family:var(--font-mono);text-align:right">' + oraAgg + ' · ' + dataAgg + '<br><span style="font-size:10px">Aggiorn. auto 17:30</span></div>' +
    '</div>' +

    // ── KPI 4 cards ──
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">' +
      _kpiFut('Gasolio Ieri', dati.prezzoIeri.toFixed(5) + ' €/L', 'riferimento chiusura', 'var(--text-muted)') +
      _kpiFut('Gasolio Oggi', dati.prezzoOggi.toFixed(5) + ' €/L',
              (su ? '▲ +' : '▼ ') + Math.abs(dati.varEuroL).toFixed(5) + ' €/L (' + (su ? '+' : '') + varPctEuroL.toFixed(2) + '%)',
              su ? '#E24B4A' : '#639922') +
      _kpiFut('LGO=F (ICE)', dati.lgoOggi.toFixed(2) + ' $/t',
              (dati.lgoOggi >= dati.lgoPrec ? '▲ +' : '▼ ') + Math.abs(dati.lgoOggi - dati.lgoPrec).toFixed(2) + ' $/t',
              dati.lgoOggi >= dati.lgoPrec ? '#E24B4A' : '#639922') +
      _kpiFut('EUR/USD', dati.eurOggi.toFixed(4),
              (dati.eurOggi >= dati.eurPrec ? '▲ +' : '▼ ') + Math.abs(dati.eurOggi - dati.eurPrec).toFixed(4),
              dati.eurOggi >= dati.eurPrec ? '#E24B4A' : '#639922') +
    '</div>' +

    // ── Impatto carico ──
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin-bottom:14px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">' +
      '<div style="flex:2;min-width:200px">' +
        '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">📦 Impatto su carico standard (' + _sep(FUTURES_LITRI_CARICO) + ' L)</div>' +
        '<div style="font-family:var(--font-mono);font-size:26px;font-weight:700;color:' + (impattoCarico >= 0 ? '#E24B4A' : '#639922') + '">' +
          (impattoCarico >= 0 ? '+ ' : '– ') + fmtE(Math.abs(impattoCarico)) +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">Rispetto all\'acquisto di ieri allo stesso prezzo di mercato</div>' +
      '</div>' +
      '<div style="width:1px;height:50px;background:var(--border)"></div>' +
      '<div style="flex:1;min-width:170px">' +
        '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Calcolo</div>' +
        '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);line-height:1.9">' +
          _sep(FUTURES_LITRI_CARICO) + ' L × ' + dati.varEuroL.toFixed(5) + '<br>' +
          '= <strong style="color:' + (impattoCarico >= 0 ? '#E24B4A' : '#639922') + '">' +
            (impattoCarico >= 0 ? '+ ' : '– ') + fmtE(Math.abs(impattoCarico)) +
          '</strong>' +
        '</div>' +
      '</div>' +
      '<div style="width:1px;height:50px;background:var(--border)"></div>' +
      '<div style="flex:1;min-width:160px">' +
        '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Consiglio</div>' +
        '<div style="font-size:13px;color:' + colS + ';line-height:1.5">' + consiglioS + '</div>' +
      '</div>' +
    '</div>' +

    // ── Grafici ──
    '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:16px">' +
      '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px">' +
        '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">' +
          'Trend €/litro — 30 giorni' +
          '<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:' + (su?'rgba(226,75,74,.15)':'rgba(99,153,34,.15)') + ';color:' + (su?'#E24B4A':'#639922') + '">' +
            (su?'▲ +':'▼ ') + Math.abs(varPctEuroL).toFixed(2) + '%</span>' +
        '</div>' +
        '<canvas id="chart-fut-euro" height="130"></canvas>' +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px">' +
        '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">LGO=F · $/t</div>' +
        '<canvas id="chart-fut-lgo" height="130"></canvas>' +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px">' +
        '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">EUR/USD</div>' +
        '<canvas id="chart-fut-eurusd" height="130"></canvas>' +
      '</div>' +
    '</div>' +

    // ── Storico tabella ──
    (storico.length > 0 ?
      '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">' +
        '<div style="padding:12px 16px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em">Storico giornaliero</div>' +
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr style="background:var(--bg)">' +
            '<th style="padding:8px 12px;text-align:left;color:var(--text-hint);font-weight:500">Data</th>' +
            '<th style="padding:8px 12px;text-align:right;color:var(--text-hint);font-weight:500">€/L</th>' +
            '<th style="padding:8px 12px;text-align:right;color:var(--text-hint);font-weight:500">Var. €/L</th>' +
            '<th style="padding:8px 12px;text-align:right;color:var(--text-hint);font-weight:500">LGO=F</th>' +
            '<th style="padding:8px 12px;text-align:right;color:var(--text-hint);font-weight:500">EUR/USD</th>' +
            '<th style="padding:8px 12px;text-align:right;color:var(--text-hint);font-weight:500">Impatto 35kL</th>' +
            '<th style="padding:8px 12px;text-align:center;color:var(--text-hint);font-weight:500">Segnale</th>' +
          '</tr></thead>' +
          '<tbody>' +
            storico.map(function(r, i) {
              var var_l = Number(r.var_euro_litro);
              var imp = var_l * FUTURES_LITRI_CARICO;
              var sc = r.segnale === 'rialzo' ? '🔴' : r.segnale === 'ribasso' ? '🟢' : '🟡';
              var col = var_l > 0 ? '#E24B4A' : var_l < 0 ? '#639922' : 'var(--text-muted)';
              return '<tr style="border-top:1px solid var(--border)' + (i % 2 ? ';background:var(--bg)' : '') + '">' +
                '<td style="padding:8px 12px">' + r.data + '</td>' +
                '<td style="padding:8px 12px;text-align:right;font-family:var(--font-mono)">' + Number(r.prezzo_euro_litro).toFixed(5) + '</td>' +
                '<td style="padding:8px 12px;text-align:right;font-family:var(--font-mono);color:' + col + '">' + (var_l >= 0 ? '+' : '') + var_l.toFixed(5) + '</td>' +
                '<td style="padding:8px 12px;text-align:right;font-family:var(--font-mono);color:#378ADD">' + Number(r.lgo_usd).toFixed(2) + '</td>' +
                '<td style="padding:8px 12px;text-align:right;font-family:var(--font-mono);color:#6B5FCC">' + Number(r.eurusd).toFixed(4) + '</td>' +
                '<td style="padding:8px 12px;text-align:right;font-family:var(--font-mono);color:' + col + '">' + (imp >= 0 ? '+' : '–') + ' ' + fmtE(Math.abs(imp)) + '</td>' +
                '<td style="padding:8px 12px;text-align:center">' + sc + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table></div>' +
      '</div>'
    : '') ;

  // Render grafici con piccolo delay (DOM deve essere pronto)
  setTimeout(function() { _renderFutCharts(dati); }, 60);
}

function _kpiFut(label, val, delta, deltaColor) {
  return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px">' +
    '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">' + label + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:18px;font-weight:600;color:var(--text)">' + val + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:11px;color:' + deltaColor + ';margin-top:4px">' + delta + '</div>' +
  '</div>';
}

function _renderFutCharts(dati) {
  var baseOpt = {
    responsive: true, animation: { duration: 700 },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { color: 'var(--text-hint)', font: { size: 9 }, maxTicksLimit: 7 } },
      y: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { color: 'var(--text-hint)', font: { size: 9, family: 'monospace' } }, beginAtZero: false }
    },
    elements: { point: { radius: 1.5, hoverRadius: 5 } }
  };

  var labels = dati.dateComuni.map(function(d) { return d.substring(5); });

  if (_chartFutEuro)   { _chartFutEuro.destroy();   _chartFutEuro   = null; }
  if (_chartFutLgo)    { _chartFutLgo.destroy();    _chartFutLgo    = null; }
  if (_chartFutEurusd) { _chartFutEurusd.destroy(); _chartFutEurusd = null; }

  var c1 = document.getElementById('chart-fut-euro');
  if (c1) _chartFutEuro = new Chart(c1, {
    type: 'line',
    data: { labels: labels, datasets: [{
      data: dati.serieEuroL, borderColor: '#BA7517',
      backgroundColor: 'rgba(186,117,23,0.10)', fill: true, tension: 0.4, borderWidth: 2
    }]},
    options: Object.assign({}, baseOpt, { plugins: { legend:{display:false}, tooltip:{ callbacks:{ label:function(c){return '€ '+c.raw.toFixed(5)+'/L';} } } } })
  });

  var c2 = document.getElementById('chart-fut-lgo');
  if (c2) _chartFutLgo = new Chart(c2, {
    type: 'line',
    data: { labels: labels, datasets: [{
      data: dati.serieLgo, borderColor: '#378ADD',
      backgroundColor: 'rgba(55,138,221,0.08)', fill: true, tension: 0.4, borderWidth: 2
    }]},
    options: Object.assign({}, baseOpt, { plugins: { legend:{display:false}, tooltip:{ callbacks:{ label:function(c){return '$ '+c.raw.toFixed(2)+'/t';} } } } })
  });

  var c3 = document.getElementById('chart-fut-eurusd');
  if (c3) _chartFutEurusd = new Chart(c3, {
    type: 'line',
    data: { labels: labels, datasets: [{
      data: dati.serieEurusd, borderColor: '#6B5FCC',
      backgroundColor: 'rgba(107,95,204,0.07)', fill: true, tension: 0.4, borderWidth: 2
    }]},
    options: Object.assign({}, baseOpt, { plugins: { legend:{display:false}, tooltip:{ callbacks:{ label:function(c){return c.raw.toFixed(4);} } } } })
  });
}

// ═══════════════════════════════════════════
// ALERT DASHBOARD — chiamata da renderDashboard
// ═══════════════════════════════════════════
async function caricaAlertFutures() {
  var wrap = document.getElementById('dash-alert-futures');
  if (!wrap) return;

  // Mostra solo dopo le 17:30
  var ora = new Date();
  if (ora.getHours() < 17 || (ora.getHours() === 17 && ora.getMinutes() < 30)) {
    wrap.style.display = 'none'; return;
  }

  // Se già letto oggi, non mostrare
  var key = 'pf_fut_dismissed_' + ora.toISOString().split('T')[0];
  if (localStorage.getItem(key)) { wrap.style.display = 'none'; return; }

  var dati = await _fetchDatiFutures();
  if (!dati) { wrap.style.display = 'none'; return; }

  var col  = dati.segnale === 'rialzo' ? '#E24B4A' : dati.segnale === 'ribasso' ? '#639922' : '#BA7517';
  var icon = dati.segnale === 'rialzo' ? '🔴' : dati.segnale === 'ribasso' ? '🟢' : '🟡';
  var txt  = dati.segnale === 'rialzo' ? 'Probabile rialzo gasolio domani' :
             dati.segnale === 'ribasso' ? 'Probabile ribasso gasolio domani' : 'Gasolio: mercato stabile';
  var imp  = dati.varEuroL * FUTURES_LITRI_CARICO;

  wrap.style.display = 'block';
  wrap.innerHTML =
    '<div onclick="_futuresAlertClick()" style="cursor:pointer;border:1px solid ' + col + ';border-left:4px solid ' + col + ';' +
    'border-radius:0 8px 8px 0;padding:10px 14px;background:var(--surface);display:flex;align-items:center;gap:10px;' +
    'transition:opacity .2s" onmouseover="this.style.opacity=\'.85\'" onmouseout="this.style.opacity=\'1\'">' +
      '<span style="font-size:20px">' + icon + '</span>' +
      '<div style="flex:1">' +
        '<div style="font-weight:600;color:' + col + ';font-size:13px">' + txt + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' +
          'Impatto carico 35k L: <strong style="color:' + col + '">' + (imp >= 0 ? '+' : '–') + ' ' + fmtE(Math.abs(imp)) + '</strong>' +
          ' &nbsp;·&nbsp; <em>Clicca per i dettagli</em>' +
        '</div>' +
      '</div>' +
      '<span style="font-size:18px;color:var(--text-hint)">›</span>' +
    '</div>';
}

function _futuresAlertClick() {
  // Marca letto e nascondi
  var key = 'pf_fut_dismissed_' + new Date().toISOString().split('T')[0];
  localStorage.setItem(key, '1');
  var w = document.getElementById('dash-alert-futures');
  if (w) w.style.display = 'none';
  // Naviga a Benchmark › Futures
  setSection('benchmark');
  setTimeout(function() {
    var tab = document.getElementById('tab-futures');
    if (tab) tab.click();
  }, 350);
}

// Aggiornamento automatico alle 17:30 (polling ogni minuto)
setInterval(function() {
  var t = new Date();
  if (t.getHours() === 17 && t.getMinutes() === 30) {
    // Se la dashboard è visibile, ricarica alert
    var dash = document.getElementById('dash-alert-futures');
    if (dash) caricaAlertFutures();
    // Se la sezione futures è aperta, ricarica dati
    var fw = document.getElementById('futures-wrap');
    if (fw && fw.offsetParent !== null) renderFutures();
  }
}, 60000);

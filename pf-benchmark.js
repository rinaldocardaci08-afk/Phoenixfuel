// PhoenixFuel — Benchmark mercato, trend, previsioni
let _chartBenchmark = null;

async function salvaBenchmark() {
  var data = document.getElementById('bench-data').value;
  var prodotto = document.getElementById('bench-prodotto').value;
  var prezzo = parseFloat(document.getElementById('bench-prezzo').value);
  if (!data || !prezzo || prezzo <= 0) { toast('Compila data e prezzo'); return; }
  var { error } = await sb.from('benchmark_prezzi').upsert({ data: data, prodotto: prodotto, prezzo: prezzo }, { onConflict: 'data,prodotto' });
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Benchmark salvato!');
  document.getElementById('bench-prezzo').value = '';
  caricaBenchmark();
}

async function caricaBenchmark() {
  var prodotto = document.getElementById('bench-filtro-prodotto')?.value || 'Gasolio Autotrazione';
  // Data default
  var dataInput = document.getElementById('bench-data');
  if (dataInput && !dataInput.value) dataInput.value = oggiISO;

  // Carica dati in parallelo: benchmark + CMP deposito + prezzi vendita ingrosso
  var [benchRes, cisRes, ordRes] = await Promise.all([
    sb.from('benchmark_prezzi').select('*').eq('prodotto', prodotto).order('data', { ascending: false }).limit(90),
    sb.from('cisterne').select('prodotto,livello_attuale,costo_medio').eq('sede', 'deposito_vibo'),
    sb.from('ordini').select('data,prodotto,costo_litro,trasporto_litro,margine,iva,litri').eq('tipo_ordine', 'cliente').eq('prodotto', prodotto).neq('stato', 'annullato').order('data', { ascending: false }).limit(500)
  ]);

  var benchDati = (benchRes.data || []).reverse(); // cronologico
  if (!benchDati.length) {
    document.getElementById('bench-kpi').innerHTML = '';
    document.getElementById('bench-posizionamento').innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Inserisci il primo prezzo benchmark per iniziare</div>';
    document.getElementById('bench-analisi').innerHTML = '';
    document.getElementById('bench-tabella').innerHTML = '<tr><td colspan="8" class="loading">Nessun dato</td></tr>';
    return;
  }

  // CMP corrente
  var cisProd = (cisRes.data || []).filter(function(c) { return c.prodotto === prodotto && Number(c.livello_attuale) > 0; });
  var totLitri = cisProd.reduce(function(s, c) { return s + Number(c.livello_attuale); }, 0);
  var cmpCorrente = totLitri > 0 ? cisProd.reduce(function(s, c) { return s + Number(c.costo_medio || 0) * Number(c.livello_attuale); }, 0) / totLitri : 0;

  // Prezzo vendita medio ultimi 30 giorni
  var trentaGgFa = new Date(); trentaGgFa.setDate(trentaGgFa.getDate() - 30);
  var trentaISO = trentaGgFa.toISOString().split('T')[0];
  var ordRecenti = (ordRes.data || []).filter(function(o) { return o.data >= trentaISO; });
  var totFatt = 0, totL = 0;
  ordRecenti.forEach(function(o) { totFatt += prezzoConIva(o) * Number(o.litri); totL += Number(o.litri); });
  var prezzoVenditaMedio = totL > 0 ? totFatt / totL : 0;

  // Prezzi vendita per giorno (per tabella)
  var venditePerGiorno = {};
  (ordRes.data || []).forEach(function(o) {
    if (!venditePerGiorno[o.data]) venditePerGiorno[o.data] = { fatt: 0, litri: 0 };
    venditePerGiorno[o.data].fatt += prezzoConIva(o) * Number(o.litri);
    venditePerGiorno[o.data].litri += Number(o.litri);
  });

  var ultimo = benchDati[benchDati.length - 1];
  var benchOggi = Number(ultimo.prezzo);
  var spread = prezzoVenditaMedio > 0 && cmpCorrente > 0 ? prezzoVenditaMedio - cmpCorrente : 0;
  var vantaggioAcq = cmpCorrente > 0 ? benchOggi - cmpCorrente : 0;
  var markupVendita = prezzoVenditaMedio > 0 ? prezzoVenditaMedio - benchOggi : 0;

  // ═══ KPI ═══
  var kpiWrap = document.getElementById('bench-kpi');
  kpiWrap.innerHTML =
    '<div class="kpi"><div class="kpi-label">Benchmark ' + prodotto.split(' ')[0] + '</div><div class="kpi-value" style="font-family:var(--font-mono)">€ ' + benchOggi.toFixed(4) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Tuo CMP deposito</div><div class="kpi-value" style="font-family:var(--font-mono);color:' + (vantaggioAcq > 0 ? '#639922' : '#E24B4A') + '">€ ' + cmpCorrente.toFixed(4) + '</div><div style="font-size:10px;color:' + (vantaggioAcq > 0 ? '#639922' : '#E24B4A') + ';margin-top:2px">' + (vantaggioAcq > 0 ? '−' : '+') + '€ ' + Math.abs(vantaggioAcq).toFixed(4) + ' ' + (vantaggioAcq > 0 ? 'sotto' : 'sopra') + ' mercato</div></div>' +
    '<div class="kpi"><div class="kpi-label">Prezzo vendita medio</div><div class="kpi-value" style="font-family:var(--font-mono)">€ ' + prezzoVenditaMedio.toFixed(4) + '</div><div style="font-size:10px;color:' + (markupVendita >= 0 ? '#639922' : '#E24B4A') + ';margin-top:2px">' + (markupVendita >= 0 ? '+' : '') + '€ ' + markupVendita.toFixed(4) + ' su benchmark</div></div>' +
    '<div class="kpi" style="background:' + (spread >= 0.03 ? '#EAF3DE' : '#FCEBEB') + ';border:0.5px solid ' + (spread >= 0.03 ? '#639922' : '#E24B4A') + '"><div class="kpi-label" style="color:' + (spread >= 0.03 ? '#27500A' : '#791F1F') + '">Spread totale</div><div class="kpi-value" style="font-family:var(--font-mono);color:' + (spread >= 0.03 ? '#3B6D11' : '#E24B4A') + '">€ ' + spread.toFixed(4) + '/L</div><div style="font-size:10px;color:' + (spread >= 0.03 ? '#3B6D11' : '#E24B4A') + ';margin-top:2px">' + (prezzoVenditaMedio > 0 ? (spread / prezzoVenditaMedio * 100).toFixed(1) + '% su vendita' : '') + '</div></div>';

  // ═══ BARRA POSIZIONAMENTO ═══
  var posWrap = document.getElementById('bench-posizionamento');
  if (cmpCorrente > 0 && prezzoVenditaMedio > 0) {
    var minP = Math.min(cmpCorrente, benchOggi, prezzoVenditaMedio) - 0.02;
    var maxP = Math.max(cmpCorrente, benchOggi, prezzoVenditaMedio) + 0.02;
    var range = maxP - minP;
    var pctCmp = ((cmpCorrente - minP) / range) * 80 + 10;
    var pctBench = ((benchOggi - minP) / range) * 80 + 10;
    var pctVend = ((prezzoVenditaMedio - minP) / range) * 80 + 10;

    posWrap.innerHTML = '<div style="font-size:11px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px">Posizionamento prezzo — ' + prodotto + '</div>' +
      '<div style="position:relative;height:65px;margin-bottom:16px">' +
        '<div style="position:absolute;top:26px;left:5%;right:5%;height:14px;background:linear-gradient(90deg,#EAF3DE 0%,#FAEEDA 50%,#FCEBEB 100%);border-radius:7px;opacity:0.6"></div>' +
        '<div style="position:absolute;top:6px;left:' + pctCmp + '%;text-align:center;transform:translateX(-50%)"><div style="font-size:9px;font-weight:700;color:#639922;white-space:nowrap">CMP € ' + cmpCorrente.toFixed(3) + '</div><div style="width:2px;height:16px;background:#639922;margin:2px auto"></div><div style="width:12px;height:12px;background:#639922;border-radius:50%;margin:0 auto"></div></div>' +
        '<div style="position:absolute;top:6px;left:' + pctBench + '%;text-align:center;transform:translateX(-50%)"><div style="font-size:9px;font-weight:700;color:#BA7517;white-space:nowrap">Bench € ' + benchOggi.toFixed(3) + '</div><div style="width:2px;height:16px;background:#BA7517;margin:2px auto"></div><div style="width:12px;height:12px;background:#BA7517;border-radius:50%;margin:0 auto"></div></div>' +
        '<div style="position:absolute;top:6px;left:' + pctVend + '%;text-align:center;transform:translateX(-50%)"><div style="font-size:9px;font-weight:700;color:#378ADD;white-space:nowrap">Vendita € ' + prezzoVenditaMedio.toFixed(3) + '</div><div style="width:2px;height:16px;background:#378ADD;margin:2px auto"></div><div style="width:12px;height:12px;background:#378ADD;border-radius:50%;margin:0 auto"></div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">' +
        '<div style="padding:8px 12px;border-left:3px solid ' + (vantaggioAcq >= 0 ? '#639922' : '#E24B4A') + ';background:var(--bg);border-radius:0 8px 8px 0"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Vantaggio acquisto</div><div style="font-size:15px;font-weight:600;color:' + (vantaggioAcq >= 0 ? '#639922' : '#E24B4A') + ';font-family:var(--font-mono)">' + (vantaggioAcq >= 0 ? '−' : '+') + '€ ' + Math.abs(vantaggioAcq).toFixed(4) + '/L</div></div>' +
        '<div style="padding:8px 12px;border-left:3px solid ' + (markupVendita >= 0 ? '#378ADD' : '#E24B4A') + ';background:var(--bg);border-radius:0 8px 8px 0"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Markup su benchmark</div><div style="font-size:15px;font-weight:600;color:' + (markupVendita >= 0 ? '#378ADD' : '#E24B4A') + ';font-family:var(--font-mono)">' + (markupVendita >= 0 ? '+' : '') + '€ ' + markupVendita.toFixed(4) + '/L</div></div>' +
        '<div style="padding:8px 12px;border-left:3px solid ' + (spread >= 0.03 ? '#6B5FCC' : '#E24B4A') + ';background:var(--bg);border-radius:0 8px 8px 0"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Spread totale</div><div style="font-size:15px;font-weight:600;color:' + (spread >= 0.03 ? '#6B5FCC' : '#E24B4A') + ';font-family:var(--font-mono)">€ ' + spread.toFixed(4) + '/L</div></div>' +
      '</div>';
  } else {
    posWrap.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:10px">Servono CMP e prezzi vendita per la barra posizionamento</div>';
  }

  // ═══ MEDIE MOBILI + TREND + PREVISIONE ═══
  var prezziArr = benchDati.map(function(b) { return Number(b.prezzo); });
  var ma7 = _mediaMoving(prezziArr, 7);
  var ma30 = _mediaMoving(prezziArr, 30);

  // Trend: regressione lineare ultimi 7 giorni
  var ultimi7 = prezziArr.slice(-7);
  var trend7 = _regressione(ultimi7);
  var trendDir = trend7.slope > 0.0005 ? 'salita' : trend7.slope < -0.0005 ? 'discesa' : 'stabile';
  var trendColor = trendDir === 'salita' ? '#E24B4A' : trendDir === 'discesa' ? '#639922' : '#BA7517';
  var trendIcon = trendDir === 'salita' ? '↑' : trendDir === 'discesa' ? '↓' : '→';

  // Previsione 3-5 giorni
  var previsioni = [];
  for (var d = 1; d <= 5; d++) {
    previsioni.push(Math.round((trend7.intercept + trend7.slope * (ultimi7.length + d)) * 10000) / 10000);
  }

  // Segnale operativo
  var segnale = '', segnaleColor = '', consiglio = '';
  if (trendDir === 'salita') {
    segnale = 'ANTICIPA ACQUISTI — il prezzo di mercato sta salendo';
    segnaleColor = '#E24B4A';
    if (vantaggioAcq > 0) {
      consiglio = 'Il tuo CMP è ancora sotto il benchmark di € ' + vantaggioAcq.toFixed(4) + '/L — hai un vantaggio temporaneo. Conviene anticipare gli acquisti prima che il CMP si adegui al rialzo. Se hai giacenza sufficiente in deposito, usa il prodotto da magazzino finché il mercato non si stabilizza.';
    } else {
      consiglio = 'Il CMP è sopra il benchmark — stai pagando di più del mercato. Conviene usare il prodotto da magazzino ed evitare nuovi acquisti finché il trend non si inverte.';
    }
  } else if (trendDir === 'discesa') {
    segnale = 'RITARDA ACQUISTI — il prezzo di mercato sta scendendo';
    segnaleColor = '#639922';
    consiglio = 'Il mercato è in calo. Conviene ritardare i nuovi acquisti per beneficiare di prezzi più bassi nei prossimi giorni. Usa il prodotto da magazzino per le consegne correnti. Spread attuale a € ' + spread.toFixed(4) + '/L — ' + (spread >= 0.03 ? 'margine sano.' : 'attenzione, margine basso!');
  } else {
    segnale = 'MERCATO STABILE — acquista secondo il piano normale';
    segnaleColor = '#BA7517';
    consiglio = 'Il mercato è stabile. Acquista secondo il piano normale. ' + (vantaggioAcq > 0 ? 'Il tuo CMP è sotto il benchmark di € ' + vantaggioAcq.toFixed(4) + '/L — buon posizionamento.' : 'Il CMP è allineato al mercato.') + ' Spread a € ' + spread.toFixed(4) + '/L — ' + (spread >= 0.03 ? 'margine nella norma.' : 'margine sotto soglia, valuta un ritocco prezzi.');
  }

  // Alert soglia spread
  var soglia = parseFloat(document.getElementById('bench-soglia')?.value) || 0.030;
  if (spread > 0 && spread < soglia) {
    inviaAvvisoSistema('⚠ Spread ' + prodotto + ' a € ' + spread.toFixed(4) + '/L — sotto soglia minima € ' + soglia.toFixed(3), 'sistema');
  }

  var analisiWrap = document.getElementById('bench-analisi');
  analisiWrap.innerHTML =
    '<div style="font-size:11px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Analisi trend e previsioni</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">' +
      '<div style="padding:12px 16px;background:var(--bg);border-radius:8px;border-left:4px solid ' + trendColor + '">' +
        '<div style="font-size:18px;font-weight:600;color:' + trendColor + '">' + trendIcon + ' Trend in ' + trendDir + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Pendenza: ' + (trend7.slope >= 0 ? '+' : '') + (trend7.slope * 1000).toFixed(2) + '‰ al giorno</div>' +
        '<div style="font-size:12px;font-weight:500;color:' + segnaleColor + ';margin-top:8px;padding:6px 10px;background:' + segnaleColor + '15;border-radius:6px">' + segnale + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;padding:8px 10px;background:var(--bg);border-radius:6px;line-height:1.5;border-left:3px solid ' + segnaleColor + '">💡 ' + consiglio + '</div>' +
      '</div>' +
      '<div style="padding:12px 16px;background:var(--bg);border-radius:8px">' +
        '<div style="font-size:11px;font-weight:500;color:var(--text-muted);margin-bottom:8px">Previsione benchmark (regressione lineare)</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          previsioni.map(function(p, i) {
            var diff = p - benchOggi;
            return '<div style="text-align:center;padding:6px 10px;background:var(--bg-card);border-radius:6px;border:0.5px solid var(--border);min-width:60px"><div style="font-size:9px;color:var(--text-muted)">+' + (i + 1) + ' gg</div><div style="font-size:13px;font-weight:600;font-family:var(--font-mono)">€ ' + p.toFixed(4) + '</div><div style="font-size:9px;color:' + (diff >= 0 ? '#E24B4A' : '#639922') + '">' + (diff >= 0 ? '+' : '') + diff.toFixed(4) + '</div></div>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--text-muted);padding:8px 12px;background:var(--bg);border-radius:6px">' +
      '<strong>MA7:</strong> € ' + (ma7.length ? ma7[ma7.length - 1].toFixed(4) : '—') +
      ' · <strong>MA30:</strong> € ' + (ma30.length ? ma30[ma30.length - 1].toFixed(4) : '—') +
      (ma7.length && ma30.length ? (ma7[ma7.length - 1] > ma30[ma30.length - 1] ? ' · <span style="color:#E24B4A">MA7 > MA30 (trend rialzista)</span>' : ' · <span style="color:#639922">MA7 < MA30 (trend ribassista)</span>') : '') +
    '</div>';

  // ═══ GRAFICO ═══
  var labels = benchDati.map(function(b) { return b.data.substring(5); });
  var dataBench = prezziArr;
  var dataMa7 = ma7;

  if (_chartBenchmark) _chartBenchmark.destroy();
  var ctx = document.getElementById('chart-benchmark');
  if (ctx) {
    _chartBenchmark = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Benchmark', data: dataBench, borderColor: '#BA7517', backgroundColor: 'rgba(186,117,23,0.1)', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 2 },
          { label: 'MA7', data: dataMa7, borderColor: '#6B5FCC', borderWidth: 1.5, borderDash: [5, 3], fill: false, tension: 0.3, pointRadius: 0 },
          { label: 'CMP', data: Array(labels.length).fill(cmpCorrente > 0 ? cmpCorrente : null), borderColor: '#639922', borderWidth: 1.5, borderDash: [3, 3], fill: false, pointRadius: 0 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: false } } }
    });
  }

  // ═══ TABELLA STORICO ═══
  var tbody = document.getElementById('bench-tabella');
  var righe = benchDati.slice().reverse(); // più recente in cima
  tbody.innerHTML = righe.map(function(b, idx) {
    var prezzo = Number(b.prezzo);
    var idxCrono = benchDati.length - 1 - idx; // indice cronologico
    var ma7Val = ma7[idxCrono]; var ma30Val = ma30[idxCrono];
    var prev = idx < righe.length - 1 ? Number(righe[idx + 1].prezzo) : null;
    var varGg = prev !== null ? prezzo - prev : 0;
    var vGiorno = venditePerGiorno[b.data];
    var prezzoVendGiorno = vGiorno && vGiorno.litri > 0 ? vGiorno.fatt / vGiorno.litri : 0;
    var spreadGiorno = prezzoVendGiorno > 0 && cmpCorrente > 0 ? prezzoVendGiorno - cmpCorrente : 0;

    return '<tr' + (idx % 2 ? ' style="background:var(--bg)"' : '') + '>' +
      '<td style="font-weight:500">' + b.data.substring(5) + '</td>' +
      '<td style="text-align:right;font-family:var(--font-mono);color:#BA7517">' + prezzo.toFixed(4) + '</td>' +
      '<td style="text-align:right;font-family:var(--font-mono);color:#639922">' + (cmpCorrente > 0 ? cmpCorrente.toFixed(4) : '—') + '</td>' +
      '<td style="text-align:right;font-family:var(--font-mono);color:#378ADD">' + (prezzoVendGiorno > 0 ? prezzoVendGiorno.toFixed(4) : '—') + '</td>' +
      '<td style="text-align:right;font-family:var(--font-mono);font-weight:600;color:#6B5FCC">' + (spreadGiorno > 0 ? spreadGiorno.toFixed(4) : '—') + '</td>' +
      '<td style="text-align:right;font-family:var(--font-mono);font-size:10px">' + (ma7Val ? ma7Val.toFixed(4) : '—') + '</td>' +
      '<td style="text-align:right;font-family:var(--font-mono);font-size:10px">' + (ma30Val ? ma30Val.toFixed(4) : '—') + '</td>' +
      '<td style="text-align:right;font-size:10px;color:' + (varGg > 0 ? '#E24B4A' : varGg < 0 ? '#639922' : 'var(--text-muted)') + '">' + (varGg !== 0 ? (varGg > 0 ? '+' : '') + varGg.toFixed(4) : '—') + '</td>' +
      '</tr>';
  }).join('');
}

// ── Aggiorna benchmark dalla media prezzi fornitori ──

// Pulsante manuale
async function aggiornaBenchmarkDaPrezzi() {
  var data = document.getElementById('filtro-data-prezzi')?.value || document.getElementById('pr-data')?.value || oggiISO;
  toast('Calcolo media prezzi del ' + data + '...');
  await _calcolaBenchmarkDaMedia(data, true);
}

// Auto dopo salvaPrezzo
async function _aggiornaBenchmarkAuto(data) {
  await _calcolaBenchmarkDaMedia(data, false);
}

async function _calcolaBenchmarkDaMedia(data, mostraToast) {
  // Carica tutti i prezzi del giorno (escluso PhoenixFuel che è interno)
  var { data: prezzi } = await sb.from('prezzi').select('prodotto,costo_litro,fornitore').eq('data', data);
  if (!prezzi || !prezzi.length) { if (mostraToast) toast('Nessun prezzo trovato per il ' + data); return; }

  // Filtra PhoenixFuel (è prezzo interno, non di mercato)
  var prezziEsterni = prezzi.filter(function(p) {
    return !p.fornitore || p.fornitore.toLowerCase().indexOf('phoenix') === -1;
  });
  if (!prezziEsterni.length) { if (mostraToast) toast('Nessun prezzo fornitore esterno trovato'); return; }

  // Calcola media per prodotto
  var perProdotto = {};
  prezziEsterni.forEach(function(p) {
    if (!perProdotto[p.prodotto]) perProdotto[p.prodotto] = { somma: 0, count: 0 };
    perProdotto[p.prodotto].somma += Number(p.costo_litro);
    perProdotto[p.prodotto].count++;
  });

  var salvati = 0;
  var dettagli = [];
  var entries = Object.entries(perProdotto);
  for (var i = 0; i < entries.length; i++) {
    var prodotto = entries[i][0];
    var v = entries[i][1];
    var media = Math.round((v.somma / v.count) * 10000) / 10000;
    var { error } = await sb.from('benchmark_prezzi').upsert({ data: data, prodotto: prodotto, prezzo: media }, { onConflict: 'data,prodotto' });
    if (!error) {
      salvati++;
      dettagli.push(prodotto + ': € ' + media.toFixed(4) + ' (media ' + v.count + ' fornitori)');
    }
  }

  if (salvati > 0) {
    if (mostraToast) toast('Benchmark aggiornato: ' + dettagli.join(' · '));
    _auditLog('benchmark_auto', 'benchmark_prezzi', data + ' — ' + dettagli.join(', '));
  }
}

// ── Utility matematiche ──
function _mediaMoving(arr, periodo) {
  var result = [];
  for (var i = 0; i < arr.length; i++) {
    if (i < periodo - 1) { result.push(null); continue; }
    var sum = 0;
    for (var j = i - periodo + 1; j <= i; j++) sum += arr[j];
    result.push(Math.round((sum / periodo) * 10000) / 10000);
  }
  return result;
}

function _regressione(arr) {
  var n = arr.length;
  if (n < 2) return { slope: 0, intercept: arr[0] || 0 };
  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (var i = 0; i < n; i++) {
    sumX += i; sumY += arr[i]; sumXY += i * arr[i]; sumX2 += i * i;
  }
  var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  var intercept = (sumY - slope * sumX) / n;
  return { slope: slope, intercept: intercept };
}

// ── Tab switcher Benchmark / Futures ──
function _switchBenchTab(tab) {
  var isStd = tab === 'std';
  var wStd = document.getElementById('bench-std-wrap');
  var wFut = document.getElementById('futures-wrap');
  var tStd = document.getElementById('tab-benchmark-std');
  var tFut = document.getElementById('tab-futures');
  if (wStd) wStd.style.display = isStd ? '' : 'none';
  if (wFut) wFut.style.display = isStd ? 'none' : '';
  if (tStd) { tStd.style.color = isStd ? 'var(--primary)' : 'var(--text-muted)'; tStd.style.borderBottomColor = isStd ? 'var(--primary)' : 'transparent'; tStd.style.fontWeight = isStd ? '600' : '500'; }
  if (tFut) { tFut.style.color = isStd ? 'var(--text-muted)' : 'var(--primary)'; tFut.style.borderBottomColor = isStd ? 'transparent' : 'var(--primary)'; tFut.style.fontWeight = isStd ? '500' : '600'; }
  if (!isStd) renderFutures();
}

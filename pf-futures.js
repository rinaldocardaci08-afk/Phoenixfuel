// PhoenixFuel — Futures ICE Gasoil + EUR/USD
// Fetch live da Yahoo Finance, calcolo prezzo euro/litro, semaforo, alert dashboard

var _chartFutEuro = null, _chartFutLgo = null, _chartFutEurusd = null;
var _futuresDati = null;
var LITRI_PER_TONNELLATA = 1175;
var CARICO_STANDARD = 35000;

async function _fetchYahoo(ticker, range, interval) {
  var proxies = [
    function(u) { return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); },
    function(u) { return 'https://thingproxy.freeboard.io/fetch/' + u; },
    function(u) { return 'https://corsproxy.org/?' + encodeURIComponent(u); }
  ];
  var baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '?interval=' + (interval||'1d') + '&range=' + (range||'1mo');
  for (var p = 0; p < proxies.length; p++) {
    try {
      var url = proxies[p](baseUrl);
      var res = await fetch(url);
      if (!res.ok) continue;
      var raw = await res.json();
      var json = raw.contents ? JSON.parse(raw.contents) : raw;
      if (json.chart && json.chart.result) return json.chart.result[0];
    } catch (e) { continue; }
  }
  console.warn('Yahoo fetch failed for ' + ticker + ' (all proxies)');
  return null;
}

async function _fetchDatiFutures() {
  var [lgoData, eurData] = await Promise.all([_fetchYahoo('LGO=F','1mo','1d'), _fetchYahoo('EURUSD=X','1mo','1d')]);
  if (!lgoData || !eurData) return null;
  var lM = lgoData.meta, eM = eurData.meta;
  var lgoOggi = lM.regularMarketPrice, lgoPrec = lM.chartPreviousClose || lM.previousClose;
  var eurOggi = eM.regularMarketPrice, eurPrec = eM.chartPreviousClose || eM.previousClose;
  var euroLOggi = (lgoOggi / eurOggi) / LITRI_PER_TONNELLATA;
  var euroLIeri = (lgoPrec / eurPrec) / LITRI_PER_TONNELLATA;
  var varEL = euroLOggi - euroLIeri;
  var varPct = euroLIeri > 0 ? (varEL / euroLIeri) * 100 : 0;
  var varLgo = lgoOggi - lgoPrec, varLgoPct = lgoPrec > 0 ? (varLgo / lgoPrec) * 100 : 0;
  var varEur = eurOggi - eurPrec;
  var segnale = varPct > 1.5 ? 'rialzo' : varPct < -1.5 ? 'ribasso' : 'stabile';
  var impatto = varEL * CARICO_STANDARD;

  var lTs = lgoData.timestamp||[], eTs = eurData.timestamp||[];
  var lC = (lgoData.indicators&&lgoData.indicators.quote&&lgoData.indicators.quote[0]) ? lgoData.indicators.quote[0].close : [];
  var eC = (eurData.indicators&&eurData.indicators.quote&&eurData.indicators.quote[0]) ? eurData.indicators.quote[0].close : [];
  var dateComuni=[], serieEuroL=[], serieLgo=[], serieEurusd=[];
  for (var i = 0; i < lTs.length; i++) {
    var dL = new Date(lTs[i]*1000).toISOString().split('T')[0];
    var lV = lC[i]; if (!lV) continue;
    var eV = null;
    for (var j = 0; j < eTs.length; j++) { if (new Date(eTs[j]*1000).toISOString().split('T')[0] === dL && eC[j]) { eV = eC[j]; break; } }
    if (!eV) continue;
    dateComuni.push(dL); serieLgo.push(Math.round(lV*100)/100);
    serieEurusd.push(Math.round(eV*10000)/10000);
    serieEuroL.push(Math.round((lV/eV/LITRI_PER_TONNELLATA)*100000)/100000);
  }
  return { lgoOggi:lgoOggi, lgoPrec:lgoPrec, varLgo:varLgo, varLgoPct:varLgoPct, eurOggi:eurOggi, eurPrec:eurPrec, varEur:varEur, euroLitroOggi:euroLOggi, euroLitroIeri:euroLIeri, varEuroLitro:varEL, varPct:varPct, segnale:segnale, impatto:impatto, dateComuni:dateComuni, serieEuroL:serieEuroL, serieLgo:serieLgo, serieEurusd:serieEurusd, aggiornato:new Date(lM.regularMarketTime*1000).toLocaleString('it-IT') };
}

async function renderFutures() {
  var wrap = document.getElementById('futures-wrap'); if (!wrap) return;
  wrap.innerHTML = '<div class="loading" style="padding:40px;text-align:center">Caricamento dati ICE Gasoil + EUR/USD...</div>';
  var dati = await _fetchDatiFutures(); _futuresDati = dati;
  if (!dati) { wrap.innerHTML = '<div class="card" style="padding:20px;text-align:center;color:var(--text-muted)">Impossibile caricare i dati da Yahoo Finance.<br/><button class="btn-primary" style="margin-top:12px" onclick="renderFutures()">Riprova</button></div>'; return; }
  _salvaFuturesStorico(dati);
  var sC = dati.segnale==='rialzo'?'#E24B4A':dati.segnale==='ribasso'?'#639922':'#BA7517';
  var sI = dati.segnale==='rialzo'?'🔴':dati.segnale==='ribasso'?'🟢':'🟡';
  var sT = dati.segnale==='rialzo'?'Probabile rialzo prezzi domani':dati.segnale==='ribasso'?'Probabile ribasso prezzi domani':'Mercato stabile';
  var vS = dati.varEuroLitro>=0?'+':'';
  var h = '';
  // Semaforo
  h += '<div style="padding:16px 20px;border:2px solid '+sC+';border-radius:12px;margin-bottom:16px;background:'+sC+'08"><div style="display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap"><div><div style="font-size:11px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Segnale mercato · ICE Gasoil + EUR/USD</div><div style="font-size:18px;font-weight:500;color:'+sC+';margin-top:4px">'+sI+' '+sT+'</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">Gasoil '+(dati.varLgoPct>=0?'+':'')+dati.varLgoPct.toFixed(1)+'% in USD · EUR/USD '+(dati.varEur>=0?'+':'')+((dati.varEur/dati.eurPrec)*100).toFixed(1)+'% · Impatto netto <span style="color:'+sC+';font-weight:500">'+(dati.varPct>=0?'+':'')+dati.varPct.toFixed(1)+'%</span> in euro</div></div><div style="text-align:right;font-size:11px;color:var(--text-muted)">'+dati.aggiornato+'<br/>Aggiorn. auto</div></div></div>';
  // KPI
  h += '<div class="grid4" style="margin-bottom:14px">';
  h += '<div class="kpi"><div class="kpi-label">Gasolio ieri</div><div class="kpi-value" style="font-family:var(--font-mono)">'+dati.euroLitroIeri.toFixed(3)+' <small>€/L</small></div><div style="font-size:10px;color:var(--text-muted)">riferimento chiusura</div></div>';
  h += '<div class="kpi"><div class="kpi-label">Gasolio oggi</div><div class="kpi-value" style="font-family:var(--font-mono);color:'+sC+'">'+dati.euroLitroOggi.toFixed(3)+' <small>€/L</small></div><div style="font-size:10px;color:'+sC+'">'+(dati.varEuroLitro>=0?'▲':'▼')+' '+vS+dati.varEuroLitro.toFixed(3)+' €/L ('+vS+dati.varPct.toFixed(1)+'%)</div></div>';
  h += '<div class="kpi"><div class="kpi-label">LGO=F (ICE)</div><div class="kpi-value" style="font-family:var(--font-mono)">'+Math.round(dati.lgoOggi)+' <small>$/t</small></div><div style="font-size:10px;color:'+(dati.varLgo>=0?'#E24B4A':'#639922')+'">'+(dati.varLgo>=0?'▲':'▼')+' '+(dati.varLgo>=0?'+':'')+dati.varLgo.toFixed(1)+' $/t</div></div>';
  h += '<div class="kpi"><div class="kpi-label">EUR/USD</div><div class="kpi-value" style="font-family:var(--font-mono)">'+dati.eurOggi.toFixed(4)+'</div><div style="font-size:10px;color:'+(dati.varEur>=0?'#639922':'#E24B4A')+'">'+(dati.varEur>=0?'▼':'▲')+' '+(dati.varEur>=0?'+':'')+dati.varEur.toFixed(4)+' '+(dati.varEur>=0?'(rafforz.)':'(indebol.)')+'</div></div>';
  h += '</div>';
  // Impatto carico
  var impA = Math.abs(dati.impatto), impC = dati.impatto>=0?'#E24B4A':'#639922', impS = dati.impatto>=0?'+':'−';
  var cons = dati.segnale==='rialzo'?'Valuta di anticipare l\'ordine o aggiornare il listino clienti':dati.segnale==='ribasso'?'Puoi ritardare gli acquisti non urgenti':'Procedi con gli acquisti pianificati';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">';
  h += '<div class="card" style="text-align:center;border-left:4px solid '+impC+';border-radius:0 12px 12px 0"><div style="font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px">Impatto su carico ('+_sep((CARICO_STANDARD).toLocaleString('it-IT'))+' L)</div><div style="font-size:28px;font-weight:500;color:'+impC+';font-family:var(--font-mono)">'+impS+' '+_sep(Math.round(impA).toLocaleString('it-IT'))+',00 €</div><div style="font-size:10px;color:var(--text-muted);margin-top:4px">Rispetto all\'acquisto di ieri</div></div>';
  h += '<div class="card" style="text-align:center"><div style="font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px">Dettaglio calcolo</div><div style="font-size:13px;font-family:var(--font-mono);color:var(--text);line-height:2">'+_sep((CARICO_STANDARD).toLocaleString('it-IT'))+' L × '+dati.varEuroLitro.toFixed(3)+' €/L<br/>= <strong style="color:'+impC+'">'+_sep(Math.round(impA).toLocaleString('it-IT'))+' € in '+(dati.impatto>=0?'più':'meno')+'</strong></div></div>';
  h += '<div class="card" style="text-align:center"><div style="font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px">Consiglio operativo</div><div style="font-size:14px;font-weight:500;color:'+sC+';margin-top:12px;font-style:italic">'+cons+'</div></div>';
  h += '</div>';
  // Grafici
  h += '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:16px">';
  h += '<div class="card"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center">Trend €/litro — ultimi 14 giorni <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:'+sC+'18;color:'+sC+';font-weight:500">'+(dati.varPct>=0?'▲':'▼')+' '+(dati.varPct>=0?'+':'')+dati.varPct.toFixed(1)+'%</span></div><div style="position:relative;height:220px"><canvas id="chart-fut-euro"></canvas></div></div>';
  h += '<div class="card"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center">LGO=F <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:'+(dati.varLgoPct>=0?'#E24B4A':'#639922')+'18;color:'+(dati.varLgoPct>=0?'#E24B4A':'#639922')+';font-weight:500">'+(dati.varLgoPct>=0?'▲':'▼')+' '+(dati.varLgoPct>=0?'+':'')+dati.varLgoPct.toFixed(1)+'%</span></div><div style="position:relative;height:220px"><canvas id="chart-fut-lgo"></canvas></div></div>';
  h += '<div class="card"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center">EUR/USD <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:'+(dati.varEur>=0?'#639922':'#E24B4A')+'18;color:'+(dati.varEur>=0?'#639922':'#E24B4A')+';font-weight:500">'+(dati.varEur>=0?'▼':'▲')+' '+((dati.varEur/dati.eurPrec)*100>=0?'+':'')+((dati.varEur/dati.eurPrec)*100).toFixed(1)+'%</span></div><div style="position:relative;height:220px"><canvas id="chart-fut-eurusd"></canvas></div></div>';
  h += '</div>';
  // Storico
  h += '<div class="card"><div class="card-title">Storico giornaliero (salvato)</div><div style="overflow-x:auto"><table><thead><tr><th>Data</th><th style="text-align:right">€/litro</th><th style="text-align:right">Var. €/L</th><th style="text-align:right">LGO $/t</th><th style="text-align:right">EUR/USD</th><th style="text-align:center">Segnale</th><th style="text-align:right">Impatto</th></tr></thead><tbody id="fut-storico-tabella"><tr><td colspan="7" class="loading">Caricamento...</td></tr></tbody></table></div></div>';
  wrap.innerHTML = h;
  _renderGraficiFutures(dati);
  _caricaStoricoFuturesDB();
}

function _renderGraficiFutures(dati) {
  var bO = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false},ticks:{font:{size:9},maxTicksLimit:8}},y:{beginAtZero:false,ticks:{font:{size:9}}}}, elements:{point:{radius:1.5,hoverRadius:5}} };
  var lb = dati.dateComuni.map(function(d){return d.substring(5).replace('-','/');});
  if (_chartFutEuro) _chartFutEuro.destroy();
  if (_chartFutLgo) _chartFutLgo.destroy();
  if (_chartFutEurusd) _chartFutEurusd.destroy();
  var c1=document.getElementById('chart-fut-euro');
  if(c1)_chartFutEuro=new Chart(c1,{type:'line',data:{labels:lb,datasets:[{data:dati.serieEuroL,borderColor:'#BA7517',backgroundColor:'rgba(186,117,23,0.10)',fill:true,tension:0.4,borderWidth:2}]},options:Object.assign({},bO,{plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return '€ '+c.raw.toFixed(4)+'/L';}}}}})});
  var c2=document.getElementById('chart-fut-lgo');
  if(c2)_chartFutLgo=new Chart(c2,{type:'line',data:{labels:lb,datasets:[{data:dati.serieLgo,borderColor:'#378ADD',backgroundColor:'rgba(55,138,221,0.08)',fill:true,tension:0.4,borderWidth:2}]},options:Object.assign({},bO,{plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return '$ '+c.raw.toFixed(2)+'/t';}}}}})});
  var c3=document.getElementById('chart-fut-eurusd');
  if(c3)_chartFutEurusd=new Chart(c3,{type:'line',data:{labels:lb,datasets:[{data:dati.serieEurusd,borderColor:'#6B5FCC',backgroundColor:'rgba(107,95,204,0.07)',fill:true,tension:0.4,borderWidth:2}]},options:Object.assign({},bO,{plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.raw.toFixed(4);}}}}})});
}

async function _salvaFuturesStorico(dati) {
  var oggi = new Date().toISOString().split('T')[0];
  await sb.from('futures_storico').upsert({ data:oggi, lgo_usd:Math.round(dati.lgoOggi*100)/100, eurusd:Math.round(dati.eurOggi*10000)/10000, prezzo_euro_litro:Math.round(dati.euroLitroOggi*100000)/100000, var_euro_litro:Math.round(dati.varEuroLitro*100000)/100000, segnale:dati.segnale, impatto_pct:Math.round(dati.varPct*100)/100 }, {onConflict:'data'});
}

async function _caricaStoricoFuturesDB() {
  var {data:storico}=await sb.from('futures_storico').select('*').order('data',{ascending:false}).limit(30);
  var tb=document.getElementById('fut-storico-tabella');if(!tb)return;
  if(!storico||!storico.length){tb.innerHTML='<tr><td colspan="7" class="loading">Nessuno storico</td></tr>';return;}
  tb.innerHTML=storico.map(function(r,i){var c=r.segnale==='rialzo'?'#E24B4A':r.segnale==='ribasso'?'#639922':'#BA7517';var ic=r.segnale==='rialzo'?'🔴':r.segnale==='ribasso'?'🟢':'🟡';var imp=Number(r.var_euro_litro||0)*CARICO_STANDARD;return '<tr'+(i%2?' style="background:var(--bg)"':'')+'><td style="font-weight:500">'+r.data+'</td><td style="text-align:right;font-family:var(--font-mono);color:#BA7517">'+Number(r.prezzo_euro_litro).toFixed(4)+'</td><td style="text-align:right;font-family:var(--font-mono);color:'+c+'">'+(Number(r.var_euro_litro)>=0?'+':'')+Number(r.var_euro_litro).toFixed(4)+'</td><td style="text-align:right;font-family:var(--font-mono)">'+Number(r.lgo_usd).toFixed(2)+'</td><td style="text-align:right;font-family:var(--font-mono)">'+Number(r.eurusd).toFixed(4)+'</td><td style="text-align:center">'+ic+'</td><td style="text-align:right;font-family:var(--font-mono);color:'+c+'">'+(imp>=0?'+':'−')+' '+fmtE(Math.abs(imp))+'</td></tr>';}).join('');
}

// Alert dashboard dopo le 17:30
async function caricaAlertFutures() {
  var w=document.getElementById('dash-alert-futures');if(!w)return;
  var ora=new Date();
  if(ora.getHours()<17||(ora.getHours()===17&&ora.getMinutes()<30)){w.style.display='none';return;}
  var key='pf_fut_dismissed_'+ora.toISOString().split('T')[0];
  try{if(localStorage.getItem(key)){w.style.display='none';return;}}catch(e){}
  var dati=await _fetchDatiFutures();if(!dati){w.style.display='none';return;}
  var c=dati.segnale==='rialzo'?'#E24B4A':dati.segnale==='ribasso'?'#639922':'#BA7517';
  var ic=dati.segnale==='rialzo'?'🔴':dati.segnale==='ribasso'?'🟢':'🟡';
  var tx=dati.segnale==='rialzo'?'Probabile rialzo gasolio domani':dati.segnale==='ribasso'?'Probabile ribasso gasolio domani':'Mercato gasolio stabile';
  var imp=dati.impatto;
  w.style.display='';
  w.innerHTML='<div onclick="_futuresAlertClick()" style="padding:12px 16px;border:2px solid '+c+';border-radius:12px;background:'+c+'08;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px"><div style="display:flex;align-items:center;gap:10px;flex:1"><span style="font-size:20px">'+ic+'</span><div><div style="font-size:13px;font-weight:500;color:'+c+'">'+tx+'</div><div style="font-size:11px;color:var(--text-muted)">€/L: '+dati.euroLitroOggi.toFixed(3)+' ('+(dati.varEuroLitro>=0?'+':'')+dati.varEuroLitro.toFixed(3)+') · Impatto: <strong style="color:'+c+'">'+(imp>=0?'+':'−')+' '+fmtE(Math.abs(imp))+'</strong> · <em>Clicca per dettagli</em></div></div></div><span style="font-size:18px;color:var(--text-hint)">›</span></div>';
}

function _futuresAlertClick() {
  try{localStorage.setItem('pf_fut_dismissed_'+new Date().toISOString().split('T')[0],'1');}catch(e){}
  var w=document.getElementById('dash-alert-futures');if(w)w.style.display='none';
  setSection('benchmark');
  setTimeout(function(){var t=document.getElementById('tab-futures');if(t)t.click();},350);
}

setInterval(function(){var t=new Date();if(t.getHours()===17&&t.getMinutes()===30){var d=document.getElementById('dash-alert-futures');if(d)caricaAlertFutures();var f=document.getElementById('futures-wrap');if(f&&f.offsetParent!==null)renderFutures();}},60000);

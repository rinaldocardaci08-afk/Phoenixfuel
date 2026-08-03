// PhoenixFuel — Futures ICE Gasoil + EUR/USD
// v20260803a — il dettaglio della funzione server puo essere elenco o testo:
//              prima .join() alla cieca mandava tutto in errore
// v20260802b — la scomposizione dell accisa si vede anche quando le
//              quotazioni mancano: prima l intera sezione usciva prima
// v20260802a — scomposizione del prezzo: accisa scorporata dal costo dei
//              carichi, confronto col mercato sul prodotto puro e avviso
//              prima che la deroga decada
// Fetch live da Yahoo Finance, calcolo prezzo euro/litro, semaforo, alert dashboard

var _chartFutEuro = null, _chartFutLgo = null, _chartFutEurusd = null;
var _futuresDati = null;
var LITRI_PER_TONNELLATA = 1175;
var CARICO_STANDARD = 35000;

async function _fetchYahoo(ticker, range, interval) {
  // Yahoo Finance richiede un backend proxy (Edge Function) per CORS
  // Per ora disabilitato — usare inserimento manuale
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
  var dati = await _fetchDatiFutures(); _futuresDati = dati;
  if (!dati) { _renderFuturesManuale(wrap); return; }
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
  h += '<div class="kpi"><div class="kpi-label">EUR/USD</div><div class="kpi-value" style="font-family:var(--font-mono)">'+dati.eurOggi.toFixed(6)+'</div><div style="font-size:10px;color:'+(dati.varEur>=0?'#639922':'#E24B4A')+'">'+(dati.varEur>=0?'▼':'▲')+' '+(dati.varEur>=0?'+':'')+dati.varEur.toFixed(6)+' '+(dati.varEur>=0?'(rafforz.)':'(indebol.)')+'</div></div>';
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
  if(c1)_chartFutEuro=new Chart(c1,{type:'line',data:{labels:lb,datasets:[{data:dati.serieEuroL,borderColor:'#BA7517',backgroundColor:'rgba(186,117,23,0.10)',fill:true,tension:0.4,borderWidth:2}]},options:Object.assign({},bO,{plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return '€ '+c.raw.toFixed(6)+'/L';}}}}})});
  var c2=document.getElementById('chart-fut-lgo');
  if(c2)_chartFutLgo=new Chart(c2,{type:'line',data:{labels:lb,datasets:[{data:dati.serieLgo,borderColor:'#378ADD',backgroundColor:'rgba(55,138,221,0.08)',fill:true,tension:0.4,borderWidth:2}]},options:Object.assign({},bO,{plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return '$ '+c.raw.toFixed(2)+'/t';}}}}})});
  var c3=document.getElementById('chart-fut-eurusd');
  if(c3)_chartFutEurusd=new Chart(c3,{type:'line',data:{labels:lb,datasets:[{data:dati.serieEurusd,borderColor:'#6B5FCC',backgroundColor:'rgba(107,95,204,0.07)',fill:true,tension:0.4,borderWidth:2}]},options:Object.assign({},bO,{plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.raw.toFixed(6);}}}}})});
}

async function _salvaFuturesStorico(dati) {
  var oggi = new Date().toISOString().split('T')[0];
  await sb.from('futures_storico').upsert({ data:oggi, lgo_usd:Math.round(dati.lgoOggi*100)/100, eurusd:Math.round(dati.eurOggi*10000)/10000, prezzo_euro_litro:Math.round(dati.euroLitroOggi*100000)/100000, var_euro_litro:Math.round(dati.varEuroLitro*100000)/100000, segnale:dati.segnale, impatto_pct:Math.round(dati.varPct*100)/100 }, {onConflict:'data'});
}

async function _caricaStoricoFuturesDB() {
  var {data:storico}=await sb.from('futures_storico').select('*').order('data',{ascending:false}).limit(30);
  var tb=document.getElementById('fut-storico-tabella');if(!tb)return;
  if(!storico||!storico.length){tb.innerHTML='<tr><td colspan="7" class="loading">Nessuno storico</td></tr>';return;}
  tb.innerHTML=storico.map(function(r,i){var c=r.segnale==='rialzo'?'#E24B4A':r.segnale==='ribasso'?'#639922':'#BA7517';var ic=r.segnale==='rialzo'?'🔴':r.segnale==='ribasso'?'🟢':'🟡';var imp=Number(r.var_euro_litro||0)*CARICO_STANDARD;return '<tr'+(i%2?' style="background:var(--bg)"':'')+'><td style="font-weight:500">'+fmtD(r.data)+'</td><td style="text-align:right;font-family:var(--font-mono);color:#BA7517">'+Number(r.prezzo_euro_litro).toFixed(6)+'</td><td style="text-align:right;font-family:var(--font-mono);color:'+c+'">'+(Number(r.var_euro_litro)>=0?'+':'')+Number(r.var_euro_litro).toFixed(6)+'</td><td style="text-align:right;font-family:var(--font-mono)">'+Number(r.lgo_usd).toFixed(2)+'</td><td style="text-align:right;font-family:var(--font-mono)">'+Number(r.eurusd).toFixed(6)+'</td><td style="text-align:center">'+ic+'</td><td style="text-align:right;font-family:var(--font-mono);color:'+c+'">'+(imp>=0?'+':'−')+' '+fmtE(Math.abs(imp))+'</td></tr>';}).join('');
}

// Alert dashboard dopo le 17:30 — usa dati salvati nel DB
async function caricaAlertFutures() {
  var w=document.getElementById('dash-alert-futures');if(!w)return;
  var ora=new Date();
  if(ora.getHours()<17||(ora.getHours()===17&&ora.getMinutes()<30)){w.style.display='none';return;}
  var key='pf_fut_dismissed_'+ora.toISOString().split('T')[0];
  try{if(localStorage.getItem(key)){w.style.display='none';return;}}catch(e){}
  // Leggi ultimo dato dal DB
  var {data:ultimo}=await sb.from('futures_storico').select('*').order('data',{ascending:false}).limit(1).maybeSingle();
  if(!ultimo||!ultimo.segnale){w.style.display='none';return;}
  // Solo se il dato è di oggi
  if(ultimo.data!==oggiISO){w.style.display='none';return;}
  var c=ultimo.segnale==='rialzo'?'#E24B4A':ultimo.segnale==='ribasso'?'#639922':'#BA7517';
  var ic=ultimo.segnale==='rialzo'?'🔴':ultimo.segnale==='ribasso'?'🟢':'🟡';
  var tx=ultimo.segnale==='rialzo'?'Probabile rialzo gasolio domani':ultimo.segnale==='ribasso'?'Probabile ribasso gasolio domani':'Mercato gasolio stabile';
  var imp=Number(ultimo.var_euro_litro||0)*CARICO_STANDARD;
  w.style.display='';
  w.innerHTML='<div onclick="_futuresAlertClick()" style="padding:12px 16px;border:2px solid '+c+';border-radius:12px;background:'+c+'08;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px"><div style="display:flex;align-items:center;gap:10px;flex:1"><span style="font-size:20px">'+ic+'</span><div><div style="font-size:13px;font-weight:500;color:'+c+'">'+tx+'</div><div style="font-size:11px;color:var(--text-muted)">€/L: '+Number(ultimo.prezzo_euro_litro).toFixed(3)+' ('+(Number(ultimo.var_euro_litro)>=0?'+':'')+Number(ultimo.var_euro_litro).toFixed(3)+') · Impatto: <strong style="color:'+c+'">'+(imp>=0?'+':'−')+' '+fmtE(Math.abs(imp))+'</strong> · <em>Clicca per dettagli</em></div></div></div><span style="font-size:18px;color:var(--text-hint)">›</span></div>';
}

function _futuresAlertClick() {
  try{localStorage.setItem('pf_fut_dismissed_'+new Date().toISOString().split('T')[0],'1');}catch(e){}
  var w=document.getElementById('dash-alert-futures');if(w)w.style.display='none';
  setSection('benchmark');
  setTimeout(function(){var t=document.getElementById('tab-futures');if(t)t.click();},350);
}

// Polling rimosso — dati inseriti manualmente

// ═══ INSERIMENTO MANUALE (fallback quando Yahoo non disponibile) ═══
function _renderFuturesManuale(wrap) {
  var h = '<div class="card" style="margin-bottom:16px">';
  h += '<div class="card-title">Inserimento manuale — ICE Gasoil + EUR/USD</div>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Inserisci i dati da <a href="https://www.reuters.com/markets/quote/LGOc1/" target="_blank" style="color:#378ADD">Reuters LGO Futures</a> e <a href="https://www.google.com/finance/quote/EUR-USD" target="_blank" style="color:#378ADD">Google Finance EUR/USD</a></div>';
  h += '<div class="form-grid">';
  h += '<div class="form-group"><label>Data</label><input type="date" id="fut-m-data" value="' + oggiISO + '" /></div>';
  h += '<div class="form-group"><label>LGO=F ($/tonnellata)</label><input type="number" id="fut-m-lgo" step="0.01" placeholder="Es. 691.00" style="font-family:var(--font-mono);font-size:16px" /></div>';
  h += '<div class="form-group"><label>EUR/USD</label><input type="number" id="fut-m-eurusd" step="0.000001" placeholder="Es. 1.0832" style="font-family:var(--font-mono);font-size:16px" /></div>';
  h += '</div>';
  h += '<div id="fut-m-preview" style="margin-top:12px"></div>';
  h += '<div style="display:flex;gap:8px;margin-top:10px">';
  h += '<button class="btn-primary" onclick="_calcolaFuturesManuale()">📊 Calcola</button>';
  h += '<button class="btn-primary" style="background:#639922" onclick="_salvaFuturesManuale()">💾 Salva</button>';
  h += '</div></div>';
  // Storico
  h += '<div class="card"><div class="card-title">Storico giornaliero</div><div style="overflow-x:auto"><table><thead><tr><th>Data</th><th style="text-align:right">€/litro</th><th style="text-align:right">Var. €/L</th><th style="text-align:right">LGO $/t</th><th style="text-align:right">EUR/USD</th><th style="text-align:center">Segnale</th><th style="text-align:right">Impatto ' + _sep((CARICO_STANDARD).toLocaleString('it-IT')) + 'L</th></tr></thead><tbody id="fut-storico-tabella"><tr><td colspan="7" class="loading">Caricamento...</td></tr></tbody></table></div></div>';
  wrap.innerHTML = h;
  _caricaStoricoFuturesDB();
}

function _calcolaFuturesManuale() {
  var lgo = parseFloat(document.getElementById('fut-m-lgo').value);
  var eur = parseFloat(document.getElementById('fut-m-eurusd').value);
  if (!lgo || !eur) { toast('Inserisci LGO e EUR/USD'); return; }
  var euroL = (lgo / eur) / LITRI_PER_TONNELLATA;
  // Prendi ieri dal DB per calcolare variazione
  var prev = document.getElementById('fut-storico-tabella');
  var primaRiga = prev ? prev.querySelector('tr td:nth-child(2)') : null;
  var ieriEL = primaRiga ? parseFloat(primaRiga.textContent) : 0;
  var varEL = ieriEL > 0 ? euroL - ieriEL : 0;
  var varPct = ieriEL > 0 ? (varEL / ieriEL) * 100 : 0;
  var segnale = varPct > 1.5 ? 'rialzo' : varPct < -1.5 ? 'ribasso' : 'stabile';
  var sC = segnale === 'rialzo' ? '#E24B4A' : segnale === 'ribasso' ? '#639922' : '#BA7517';
  var sI = segnale === 'rialzo' ? '🔴' : segnale === 'ribasso' ? '🟢' : '🟡';
  var sT = segnale === 'rialzo' ? 'Probabile rialzo' : segnale === 'ribasso' ? 'Probabile ribasso' : 'Stabile';
  var impatto = varEL * CARICO_STANDARD;
  var impS = impatto >= 0 ? '+' : '−';
  var impC = impatto >= 0 ? '#E24B4A' : '#639922';

  var ph = '<div style="padding:14px 18px;border:2px solid ' + sC + ';border-radius:12px;background:' + sC + '08;margin-bottom:12px">';
  ph += '<div style="font-size:16px;font-weight:500;color:' + sC + '">' + sI + ' ' + sT + '</div>';
  ph += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Prezzo: <strong style="font-family:var(--font-mono)">' + euroL.toFixed(6) + ' €/L</strong>';
  if (ieriEL > 0) ph += ' · Var: <span style="color:' + sC + '">' + (varEL >= 0 ? '+' : '') + varEL.toFixed(6) + ' (' + (varPct >= 0 ? '+' : '') + varPct.toFixed(1) + '%)</span>';
  ph += '</div></div>';
  ph += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
  ph += '<div class="kpi"><div class="kpi-label">€/litro</div><div class="kpi-value" style="font-family:var(--font-mono);color:#BA7517">' + euroL.toFixed(6) + '</div></div>';
  ph += '<div class="kpi"><div class="kpi-label">Impatto carico ' + _sep((CARICO_STANDARD).toLocaleString('it-IT')) + 'L</div><div class="kpi-value" style="font-family:var(--font-mono);color:' + impC + '">' + impS + ' ' + fmtE(Math.abs(impatto)) + '</div></div>';
  ph += '<div class="kpi"><div class="kpi-label">Segnale</div><div class="kpi-value" style="color:' + sC + '">' + sT + '</div></div>';
  ph += '</div>';
  document.getElementById('fut-m-preview').innerHTML = ph;

  // Salva per il salvataggio
  window._futManuale = { lgo: lgo, eur: eur, euroL: euroL, varEL: varEL, segnale: segnale, varPct: varPct };
}

async function _salvaFuturesManuale() {
  if (!window._futManuale) { _calcolaFuturesManuale(); if (!window._futManuale) return; }
  var data = document.getElementById('fut-m-data').value;
  if (!data) { toast('Seleziona data'); return; }
  var d = window._futManuale;
  await sb.from('futures_storico').upsert({
    data: data, lgo_usd: Math.round(d.lgo * 100) / 100, eurusd: Math.round(d.eur * 10000) / 10000,
    prezzo_euro_litro: Math.round(d.euroL * 100000) / 100000, var_euro_litro: Math.round(d.varEL * 100000) / 100000,
    segnale: d.segnale, impatto_pct: Math.round(d.varPct * 100) / 100
  }, { onConflict: 'data' });
  toast('Dati futures salvati!');
  _caricaStoricoFuturesDB();
}

// ═══════════════════════════════════════════════════════════════════════════
// VISTA MERCATO UNIFICATA (29/07)
// Una pagina sola: la serie ICE Gasoil convertita in €/litro (quella che
// futures_storico gia salva), le medie a 7 e 30 giorni (stesso calcolo del
// benchmark) e i TUOI CARICHI sovrapposti, cosi si vede se hai comprato
// sopra o sotto il mercato di quel giorno.
// Carichi usati per il confronto: Eni e Ludoil a deposito, dove NON c'e'
// trasporto del fornitore a sporcare il paragone (regola di Rinaldo).
// Tutto in IMPONIBILE: l'IVA si mostra a parte, e' solo cassa.
// Nessuna tabella nuova, nessuna query nuova: legge futures_storico e ordini.
// ═══════════════════════════════════════════════════════════════════════════
var _mktChart = null;
var _mktGiorni = 90;
var _MKT_IVA = 0.22;

function _mktMedia(arr, n) {
  return arr.map(function (_, i) {
    if (i < n - 1) return null;
    var s = 0;
    for (var k = i - n + 1; k <= i; k++) s += arr[k];
    return Math.round((s / n) * 1000000) / 1000000;
  });
}

function mktPeriodo(g) { _mktGiorni = g; renderMercato(); }

// ═══ v20260802a · ACCISE ═══════════════════════════════════════════
// Il costo di un carico non e tutto prodotto: dentro c'e l'accisa, che
// cambia per legge e non c'entra col mercato. Senza scorporarla ogni
// confronto costo↔quotazione e falso — al ribasso finche vale la deroga,
// all'insu appena decade. In fattura e stampata l'aliquota PIENA
// (Accisa=0,6229): quella applicata e piena meno la riduzione in vigore
// quel giorno.
var _mktAccise = [];

function _mktProdottoChiave(nome) {
  var n = String(nome || '').toLowerCase();
  if (n.indexOf('benzina') >= 0) return 'benzina';
  if (n.indexOf('gasolio') >= 0 || n.indexOf('diesel') >= 0) return 'gasolio';
  return null;
}

// Accisa in vigore per un prodotto in una data. null se non la conosciamo:
// meglio non mostrare niente che mostrare un numero inventato.
function _mktAccisaAl(dataISO, prodotto) {
  var k = _mktProdottoChiave(prodotto);
  if (!k || !dataISO) return null;
  var righe = _mktAccise.filter(function (a) {
    return a.prodotto === k
      && a.data_inizio <= dataISO
      && (!a.data_fine || a.data_fine >= dataISO);
  });
  if (!righe.length) return null;
  var a = righe[righe.length - 1];
  var piena = Number(a.accisa_piena || 0);
  var rid = Number(a.riduzione || 0);
  return { piena: piena, riduzione: rid, applicata: Math.round((piena - rid) * 100000) / 100000,
           descrizione: a.descrizione || '' };
}

// Il prossimo scalino: quando la riduzione oggi in vigore finisce e di
// quanto sale il costo. Serve a non farsi cogliere di sorpresa.
function _mktProssimoScalino(oggiISO) {
  var k = 'gasolio';
  var ora = _mktAccisaAl(oggiISO, k);
  if (!ora || !(ora.riduzione > 0)) return null;
  var corrente = _mktAccise.filter(function (a) {
    return a.prodotto === k && a.data_inizio <= oggiISO && (!a.data_fine || a.data_fine >= oggiISO);
  }).pop();
  if (!corrente || !corrente.data_fine) return null;
  var dopo = _mktAccise.filter(function (a) {
    return a.prodotto === k && a.data_inizio > corrente.data_fine;
  })[0];
  var riduzioneDopo = dopo ? Number(dopo.riduzione || 0) : 0;
  var salto = Math.round((ora.riduzione - riduzioneDopo) * 100000) / 100000;
  if (!(salto > 0)) return null;
  var g = Math.round((new Date(corrente.data_fine + 'T12:00:00') - new Date(oggiISO + 'T12:00:00')) / 86400000);
  return { fine: corrente.data_fine, giorni: g, salto: salto };
}


// Scompone il costo dei carichi: prodotto puro, accisa, e confronto col
// mercato di quel giorno. Solo i carichi SENZA trasporto fornitore, perche
// il trasporto sporcherebbe il paragone (regola sua del 29/07).
function _mktSezioneAccise(carichi, serie) {
  if (!_mktAccise.length) {
    return '<div class="card" style="margin-top:14px;padding:14px;font-size:12px;color:var(--text-muted)">'
      + 'Composizione del prezzo non disponibile: non ci sono accise registrate.</div>';
  }
  var oggi = new Date().toISOString().split('T')[0];
  var h = '';

  // avviso dello scalino, se in arrivo
  var sc = _mktProssimoScalino(oggi);
  if (sc && sc.giorni >= 0) {
    var litri = 35000;
    var ultimi = carichi.filter(function (o) { return Number(o.litri) > 0; });
    if (ultimi.length) {
      var somma = ultimi.reduce(function (x, o) { return x + Number(o.litri); }, 0);
      litri = Math.round(somma / ultimi.length / 1000) * 1000 || 35000;
    }
    h += '<div style="margin-top:14px;background:#FAEEDA;border:0.5px solid #E4C892;border-left:3px solid #BA7517;border-radius:10px;padding:13px 15px">'
      + '<div style="font-size:13px;font-weight:700;color:#854F0B">&#9888; Fra ' + sc.giorni + ' giorni l\'accisa torna piena</div>'
      + '<div style="font-size:12px;color:#854F0B;margin-top:4px">Dal ' + fmtD(sc.fine) + ' la riduzione di '
      + sc.salto.toFixed(4) + ' &euro;/L decade. A parita di mercato il costo sale di <strong>'
      + sc.salto.toFixed(4) + ' &euro;/L</strong>: su un carico da ' + litri.toLocaleString('it-IT')
      + ' L sono <strong>' + (sc.salto * litri).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      + ' &euro;</strong> in piu. Non e il mercato che sale: e lo Stato che riprende quanto aveva sospeso.</div></div>';
  }

  // tabella di scomposizione, ultimi carichi puliti
  var puliti = carichi.filter(function (o) {
    return !(Number(o.trasporto_litro) > 0) && _mktAccisaAl(o.data, o.prodotto);
  }).slice(-12).reverse();

  h += '<div class="card" style="margin-top:14px;padding:14px">';
  h += '<div style="font-size:13px;font-weight:600;margin-bottom:4px">Di cosa e fatto il prezzo che paghi</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px">Solo i carichi senza trasporto del fornitore: sono gli unici confrontabili col mercato senza correzioni.</div>';

  if (!puliti.length) {
    h += '<div style="font-size:12px;color:var(--text-muted)">Nessun carico confrontabile nel periodo scelto.</div></div>';
    return h;
  }

  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<tr style="color:var(--text-muted);text-align:right">'
    + '<th style="text-align:left;padding:6px 8px;font-weight:500">Data</th>'
    + '<th style="text-align:left;padding:6px 8px;font-weight:500">Fornitore</th>'
    + '<th style="text-align:left;padding:6px 8px;font-weight:500">Prodotto</th>'
    + '<th style="padding:6px 8px;font-weight:500">Litri</th>'
    + '<th style="padding:6px 8px;font-weight:500">Costo &euro;/L</th>'
    + '<th style="padding:6px 8px;font-weight:500">Accisa</th>'
    + '<th style="padding:6px 8px;font-weight:500">Prodotto puro</th>'
    + '<th style="padding:6px 8px;font-weight:500">Mercato</th>'
    + '<th style="padding:6px 8px;font-weight:500">Scarto</th></tr>';

  var etich = [], vProd = [], vAcc = [];
  puliti.forEach(function (o) {
    var acc = _mktAccisaAl(o.data, o.prodotto);
    var costo = Number(o.costo_litro);
    var puro = Math.round((costo - acc.applicata) * 100000) / 100000;
    var mkt = null;
    for (var i = serie.length - 1; i >= 0; i--) {
      if (serie[i].data <= o.data) { mkt = Number(serie[i].prezzo_euro_litro || 0); break; }
    }
    var scarto = (mkt != null) ? Math.round((puro - mkt) * 100000) / 100000 : null;
    h += '<tr style="border-top:0.5px solid var(--border);text-align:right">'
      + '<td style="text-align:left;padding:7px 8px">' + fmtD(o.data) + '</td>'
      + '<td style="text-align:left;padding:7px 8px">' + esc(o.fornitore) + '</td>'
      + '<td style="text-align:left;padding:7px 8px">' + esc(o.prodotto) + '</td>'
      + '<td style="padding:7px 8px;font-family:var(--font-mono)">' + Number(o.litri).toLocaleString('it-IT') + '</td>'
      + '<td style="padding:7px 8px;font-family:var(--font-mono)">' + costo.toFixed(4) + '</td>'
      + '<td style="padding:7px 8px;font-family:var(--font-mono);color:#854F0B" title="piena ' + acc.piena.toFixed(4)
        + (acc.riduzione ? ' meno riduzione ' + acc.riduzione.toFixed(4) : '') + '">' + acc.applicata.toFixed(4) + '</td>'
      + '<td style="padding:7px 8px;font-family:var(--font-mono);font-weight:700">' + puro.toFixed(4) + '</td>'
      + '<td style="padding:7px 8px;font-family:var(--font-mono);color:var(--text-muted)">' + (mkt != null ? mkt.toFixed(4) : '&mdash;') + '</td>'
      + '<td style="padding:7px 8px;font-family:var(--font-mono);color:' + (scarto == null ? 'var(--text-muted)' : (scarto >= 0 ? '#A32D2D' : '#3B6D11')) + '">'
        + (scarto == null ? '&mdash;' : (scarto >= 0 ? '+' : '') + scarto.toFixed(4)) + '</td>'
      + '</tr>';
    etich.push(fmtD(o.data)); vProd.push(puro); vAcc.push(acc.applicata);
  });
  h += '</table></div>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">Lo <strong>scarto</strong> e la differenza fra il prodotto puro e la quotazione: e il margine del fornitore piu la logistica. L\'accisa non c\'entra col mercato.</div>';

  h += '<div style="position:relative;height:230px;margin-top:12px"><canvas id="mkt-acc-chart"></canvas></div>';
  h += '</div>';

  window._mktAccGraf = { etich: etich.slice().reverse(), prod: vProd.slice().reverse(), acc: vAcc.slice().reverse() };
  return h;
}

function _mktDisegnaGraficoAccise() {
  var d = window._mktAccGraf;
  var cv = document.getElementById('mkt-acc-chart');
  if (!d || !cv || typeof Chart === 'undefined' || !d.etich.length) return;
  if (window._mktAccChart) { try { window._mktAccChart.destroy(); } catch (e) {} }
  window._mktAccChart = new Chart(cv, {
    type: 'bar',
    data: { labels: d.etich, datasets: [
      { label: 'Prodotto', data: d.prod, backgroundColor: '#2a78d6', maxBarThickness: 34 },
      { label: 'Accisa', data: d.acc, backgroundColor: '#BA7517', maxBarThickness: 34 }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#9b9b9b', font: { size: 11 } } } },
      scales: {
        x: { stacked: true, ticks: { color: '#9b9b9b', font: { size: 10 } }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#9b9b9b', font: { size: 10 } }, grid: { color: 'rgba(150,150,150,0.15)' } }
      }
    }
  });
}

// v20260803a — il dettaglio puo arrivare come elenco o come testo gia
// unito: prima si chiamava .join() alla cieca e una stringa mandava tutto
// in errore ("d.dettaglio.join is not a function").
function _mktDettaglio(d) {
  if (!d) return '';
  if (Array.isArray(d)) return d.length ? ' \u2014 ' + d.join(' \u00b7 ') : '';
  return ' \u2014 ' + String(d);
}

async function renderMercato() {
  var el = document.getElementById('mercato-wrap');
  if (!el) return;
  el.innerHTML = '<div class="loading" style="padding:30px">Caricamento mercato…</div>';

  var dal = new Date(); dal.setDate(dal.getDate() - _mktGiorni);
  var dalISO = dal.toISOString().split('T')[0];

  var serie = [], carichi = [];
  try {
    var r = await Promise.all([
      sb.from('futures_storico').select('*').gte('data', dalISO).order('data', { ascending: true }),
      sb.from('ordini').select('data,fornitore,prodotto,litri,costo_litro,trasporto_litro,tipo_ordine,stato')
        .eq('tipo_ordine', 'entrata_deposito').neq('stato', 'annullato')
        .gte('data', dalISO).order('data', { ascending: true }),
      sb.from('accise_storico').select('*').order('data_inizio')
    ]);
    _mktAccise = r[2] && !r[2].error ? (r[2].data || []) : [];
    serie = r[0].data || [];
    // TUTTI i carichi (29/07): il filtro Eni/Ludoil vale solo per l'analisi
    // delle accise, dove il trasporto del fornitore falserebbe il conto. Qui
    // si distinguono per DATO, non per nome: chi non ha trasporto e'
    // confrontabile col mercato in modo pulito, gli altri lo includono.
    carichi = (r[1].data || []).filter(function (o) {
      return Number(o.litri) > 0 && Number(o.costo_litro) > 0;
    });
  } catch (e) {
    el.innerHTML = '<div class="card"><div style="color:#A32D2D;font-size:13px">Errore lettura dati: ' + esc((e && e.message) || e) + '</div></div>';
    return;
  }

  var h = '';

  // barra comandi: periodo + aggiorna adesso
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">';
  h += '<div style="display:flex;gap:6px">'
    + [[30, '1M'], [90, '3M'], [180, '6M'], [365, '1A']].map(function (p) {
        var on = _mktGiorni === p[0];
        return '<button onclick="mktPeriodo(' + p[0] + ')" style="font-size:12px;padding:6px 14px;border:0.5px solid ' + (on ? '#185FA5' : 'var(--border)') + ';border-radius:7px;background:' + (on ? '#185FA5' : 'var(--bg)') + ';color:' + (on ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (on ? '600' : '500') + '">' + p[1] + '</button>';
      }).join('')
    + '</div>';
  h += '<div style="display:flex;gap:8px;align-items:center">'
    + '<span id="mkt-esito" style="font-size:11.5px;color:var(--text-muted);max-width:420px;text-align:right;line-height:1.5"></span>'
    + '<button id="mkt-btn-stor" onclick="mktCaricaStorico()" style="font-size:12px;padding:7px 15px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">↧ Carica storico</button>'
    + '<button id="mkt-btn-agg" onclick="mktAggiornaOra()" style="font-size:12px;padding:7px 15px;border:0.5px solid #378ADD;border-radius:7px;background:var(--bg-card);color:#0C447C;font-weight:600;cursor:pointer">⟳ Aggiorna adesso</button>'
    + '</div></div>';

  if (!serie.length) {
    h += '<div class="card"><div style="font-size:13px;color:var(--text-muted);line-height:1.7">'
      + 'Nessuna quotazione nel periodo. Premi <strong>↧ Carica storico</strong> per ricostruire gli ultimi mesi in una volta sola, '
      + 'oppure <strong>⟳ Aggiorna adesso</strong> per la sola chiusura di oggi. '
      + 'Resta possibile inserire a mano dalla linguetta <strong>Futures ICE</strong>.</div></div>';
    // v20260802b: la scomposizione dell'accisa NON dipende dal mercato —
    // prodotto puro = costo meno accisa. Senza quotazioni restano vuote solo
    // le colonne Mercato e Scarto. Prima si usciva di qui e la sezione non
    // compariva affatto.
    h += _mktSezioneAccise(carichi, serie);
    el.innerHTML = h;
    _mktDisegnaGraficoAccise();
    return;
  }

  var lab = serie.map(function (r) { return fmtD(r.data).substring(0, 5); });
  var prezzi = serie.map(function (r) { return Number(r.prezzo_euro_litro || 0); });
  var ma7 = _mktMedia(prezzi, 7), ma30 = _mktMedia(prezzi, 30);
  var ultimo = prezzi[prezzi.length - 1];
  var prec = prezzi.length > 1 ? prezzi[prezzi.length - 2] : ultimo;
  var varG = ultimo - prec;
  var m7 = ma7[ma7.length - 1], m30 = ma30[ma30.length - 1];
  var tendenza = (m7 != null && m30 != null) ? (m7 > m30 ? 'In salita' : 'In discesa') : '—';
  var colTend = (m7 != null && m30 != null) ? (m7 > m30 ? '#A32D2D' : '#3B6D11') : 'var(--text-muted)';

  // ultimo carico e confronto col mercato di quel giorno
  var ultC = carichi.length ? carichi[carichi.length - 1] : null;
  var costoUlt = ultC ? (Number(ultC.costo_litro) + Number(ultC.trasporto_litro || 0)) : null;
  var mktQuelGiorno = null;
  if (ultC) {
    for (var i = serie.length - 1; i >= 0; i--) {
      if (serie[i].data <= ultC.data) { mktQuelGiorno = Number(serie[i].prezzo_euro_litro || 0); break; }
    }
  }

  var kpi = function (lab2, val, sub, col) {
    return '<div class="kpi"><div class="kpi-label">' + lab2 + '</div>'
      + '<div class="kpi-value" style="font-family:var(--font-mono);color:' + (col || 'var(--text)') + '">' + val + '</div>'
      + (sub ? '<div style="font-size:11px;color:var(--text-muted)">' + sub + '</div>' : '') + '</div>';
  };
  h += '<div class="grid4" style="margin-bottom:16px">'
    + kpi('Mercato ' + fmtD(serie[serie.length - 1].data), ultimo.toFixed(4),
          (varG >= 0 ? '+' : '') + varG.toFixed(4) + ' sul giorno', varG >= 0 ? '#A32D2D' : '#3B6D11')
    + kpi('Tendenza', tendenza, (m7 != null && m30 != null) ? 'MA7 ' + (m7 > m30 ? 'sopra' : 'sotto') + ' MA30' : 'servono più giorni', colTend)
    + kpi('Tuo ultimo carico', costoUlt != null ? costoUlt.toFixed(4) : '—',
          ultC ? esc(ultC.fornitore) + ' · ' + fmtD(ultC.data) + (Number(ultC.trasporto_litro || 0) > 0 ? ' · trasporto incluso' : '') : 'nessun carico nel periodo')
    + kpi('Scarto sul mercato', (costoUlt != null && mktQuelGiorno) ? ((costoUlt - mktQuelGiorno) >= 0 ? '+' : '') + (costoUlt - mktQuelGiorno).toFixed(4) : '—',
          'prodotto + accisa + margine fornitore')
    + '</div>';

  h += '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:8px;font-size:11.5px;color:var(--text-muted)">'
    + '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#2a78d6;margin-right:5px"></span>Mercato €/L</span>'
    + '<span><span style="display:inline-block;width:10px;height:2px;background:#eb6834;margin-right:5px;vertical-align:middle"></span>Media 7 giorni</span>'
    + '<span><span style="display:inline-block;width:10px;height:2px;background:#898781;margin-right:5px;vertical-align:middle"></span>Media 30 giorni</span>'
    + '<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#1baf7a;margin-right:5px"></span>Carichi senza trasporto fornitore</span>'
    + '<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#fff;border:2px solid #1baf7a;margin-right:5px"></span>Carichi con trasporto incluso</span>'
    + '</div>';
  h += '<div class="card"><div style="position:relative;height:300px"><canvas id="mkt-chart"></canvas></div></div>';

  // nota IVA: si lavora in imponibile, il finito e' solo informativo
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">'
    + '<div class="kpi" style="flex:1;min-width:200px"><div class="kpi-label">Valore usato nei conti (imponibile)</div>'
      + '<div class="kpi-value" style="font-family:var(--font-mono)">' + ultimo.toFixed(4) + '</div></div>'
    + '<div class="kpi" style="flex:1;min-width:200px"><div class="kpi-label">Solo informativo: con IVA 22%</div>'
      + '<div class="kpi-value" style="font-family:var(--font-mono);color:var(--text-muted)">' + (ultimo * (1 + _MKT_IVA)).toFixed(4) + '</div>'
      + '<div style="font-size:11px;color:var(--text-muted)">l\'IVA la recuperi: non entra mai nei confronti</div></div>'
    + '</div>';

  // ═══ Composizione del prezzo · accise ═══
  h += _mktSezioneAccise(carichi, serie);

  el.innerHTML = h;

  // grafico
  var _punto = function (o) {
    var iLab = -1;
    for (var i = 0; i < serie.length; i++) { if (serie[i].data === o.data) { iLab = i; break; } }
    if (iLab < 0) return null;
    return { x: lab[iLab], y: Math.round((Number(o.costo_litro) + Number(o.trasporto_litro || 0)) * 10000) / 10000,
             _f: o.fornitore, _l: o.litri, _t: Number(o.trasporto_litro || 0) };
  };
  var puntiPuliti = carichi.filter(function (o) { return !(Number(o.trasporto_litro) > 0); }).map(_punto).filter(Boolean);
  var puntiTrasp  = carichi.filter(function (o) { return Number(o.trasporto_litro) > 0; }).map(_punto).filter(Boolean);

  if (_mktChart) _mktChart.destroy();
  var cv = document.getElementById('mkt-chart');
  if (cv && typeof Chart !== 'undefined') {
    _mktChart = new Chart(cv, {
      data: {
        labels: lab,
        datasets: [
          { type: 'line', label: 'Mercato', data: prezzi, borderColor: '#2a78d6', backgroundColor: 'rgba(42,120,214,0.10)', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.3 },
          { type: 'line', label: 'MA7', data: ma7, borderColor: '#eb6834', borderWidth: 2, borderDash: [5, 3], pointRadius: 0, fill: false, tension: 0.3 },
          { type: 'line', label: 'MA30', data: ma30, borderColor: '#898781', borderWidth: 2, borderDash: [2, 3], pointRadius: 0, fill: false, tension: 0.3 },
          { type: 'scatter', label: 'Carichi', data: puntiPuliti, backgroundColor: '#1baf7a', pointRadius: 7, pointHoverRadius: 9, borderColor: '#fff', borderWidth: 2 },
          { type: 'scatter', label: 'Carichi', data: puntiTrasp, backgroundColor: '#fff', pointRadius: 6, pointHoverRadius: 8, borderColor: '#1baf7a', borderWidth: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) {
          if (c.dataset.label === 'Carichi') { var p = c.raw;
            return (p._f || '') + ': € ' + Number(p.y).toFixed(4) + '/L · ' + fmtL(p._l) + (p._t > 0 ? ' · trasporto incluso' : ''); }
          return c.dataset.label + ': € ' + Number(c.parsed.y).toFixed(4) + '/L';
        } } } },
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 9 } },
                  y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 10 }, callback: function (v) { return Number(v).toFixed(3); } } } }
      }
    });
  }

  _mktDisegnaGraficoAccise();
}

// Recupero storico: la stessa funzione, chiamata con un numero di giorni.
// Serve la prima volta — senza almeno un mese di serie le medie non dicono nulla.
async function mktCaricaStorico() {
  var giorni = _mktGiorni > 180 ? 365 : 180;
  if (!confirm('Ricostruisco la serie degli ultimi ' + giorni + ' giorni?\n\n'
      + 'I giorni già presenti vengono riscritti con lo stesso valore, quindi si può ripetere senza doppioni.')) return;
  var btn = document.getElementById('mkt-btn-stor');
  var out = document.getElementById('mkt-esito');
  if (btn) { btn.disabled = true; btn.textContent = 'Ricostruisco…'; }
  if (out) { out.textContent = ''; out.style.color = 'var(--text-muted)'; }
  try {
    var res = await sb.functions.invoke('mercato-gasolio', { body: { giorni: giorni } });
    if (res.error) throw res.error;
    var d = res.data || {};
    if (!d.ok) throw new Error((d.errore || 'risposta non valida')
      + _mktDettaglio(d.dettaglio));
    if (out) { out.style.color = '#3B6D11'; out.textContent = '✓ ' + (d.messaggio || 'storico caricato'); }
    await renderMercato();
  } catch (e) {
    var msg = (e && e.message) || String(e);
    if (out) { out.style.color = '#A32D2D'; out.textContent = '✕ ' + msg; }
    if (typeof toast === 'function') toast('Storico non caricato: ' + msg);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↧ Carica storico'; }
  }
}

// Chiama la funzione sul server che prende chiusura di Londra e cambio.
// Stessa funzione che poi girera' da sola alle 17:35: qui la si prova subito.
async function mktAggiornaOra() {
  var btn = document.getElementById('mkt-btn-agg');
  var out = document.getElementById('mkt-esito');
  if (btn) { btn.disabled = true; btn.textContent = 'Aggiorno…'; }
  if (out) { out.textContent = ''; out.style.color = 'var(--text-muted)'; }
  try {
    var res = await sb.functions.invoke('mercato-gasolio', { body: { manuale: true } });
    if (res.error) throw res.error;
    var d = res.data || {};
    if (d.ok) {
      if (out) { out.style.color = '#3B6D11'; out.textContent = '✓ ' + (d.messaggio || 'aggiornato'); }
      await renderMercato();
      return;
    }
    // il dettaglio dice QUALE fonte ha risposto e come: senza, si resta al buio
    throw new Error((d.errore || 'risposta non valida')
      + _mktDettaglio(d.dettaglio));
  } catch (e) {
    var msg = (e && e.message) || String(e);
    if (out) { out.style.color = '#A32D2D'; out.textContent = '✕ ' + msg; }
    if (typeof toast === 'function') toast('Aggiornamento non riuscito: ' + msg);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⟳ Aggiorna adesso'; }
  }
}

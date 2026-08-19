// PhoenixFuel — Futures ICE Gasoil + EUR/USD
// v20260819a — BENCHMARK MERCATO rifatto sui listini VERI: la linea non e'
//              piu' petrolio + accisa + uno scarto medio ricavato all'indietro
//              dai carichi (numero costruito, confronto senza significato),
//              ma la media dei listini dei fornitori base Vibo Marina letta
//              da `prezzi`. Fascia = forbice min-max fra fornitori dello
//              stesso giorno. Pallini = carichi su costo_litro, verdi sotto
//              la media e rossi sopra. KPI con lo scarto in millesimi e in
//              euro sui litri comprati. Proiezione tratteggiata dall'ultimo
//              listino col ritardo di due quotazioni della matrice Eni.
// v20260818a — note mercati scomposte petrolio/cambio, soglia 350 € a carico
// v20260803g — con lo sguardo aperto la previsione sale subito sotto i due
//              grafici: mercato adesso e prossimo listino in un blocco solo
// v20260803f — previsione del prossimo listino: matrice Eni Vibo, variazione
//              in millesimi propagata agli altri fornitori col loro scarto,
//              coefficiente e scarti RIMISURATI dai listini veri
// v20260803e — foglio stampabile con SOLI grafici e andamento (niente prezzo
//              atteso ne consigli), e riquadri dei grafici allargati perche
//              i valori esterni erano tagliati
// v20260803d — Guarda adesso mostra due grafici a confronto (Brent e cambio,
//              ultime due chiusure piu il valore di adesso), il suggerimento
//              in evidenza e un foglio stampabile da salvare in PDF
// v20260803c — pulsante Guarda adesso: legge il mercato in tempo reale ma
//              NON registra niente e non entra nel previsionale
// v20260803b — tutto sullo stesso piano: la linea sale al livello dei carichi
//              (petrolio + accisa + scarto medio) e i pallini si colorano da
//              rosso a verde secondo quanto stanno sopra o sotto; vista per
//              giorno/settimana/mese; solo gasolio autotrazione nel grafico;
//              scomposizione del prezzo a settimane navigabili, gasolio e
//              benzina soltanto
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

// v20260803b — vista giorno / settimana / mese
var _mktGran = 'settimana';
function mktGranularita(g) { _mktGran = g; renderMercato(); }

// Etichetta del periodo a cui appartiene una data.
function _mktBucket(dataISO) {
  if (_mktGran === 'mese') return dataISO.substring(0, 7);
  if (_mktGran === 'giorno') return dataISO;
  // settimana ISO: si usa il LUNEDI come chiave, cosi l'ordine alfabetico
  // e anche quello cronologico
  var d = new Date(dataISO + 'T12:00:00');
  var g = (d.getDay() + 6) % 7;          // 0 = lunedi
  d.setDate(d.getDate() - g);
  return d.toISOString().split('T')[0];
}

function _mktEtichettaBucket(k) {
  if (_mktGran === 'mese') {
    var mesi = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
    return mesi[Number(k.substring(5, 7)) - 1] + ' ' + k.substring(2, 4);
  }
  if (_mktGran === 'giorno') return fmtD(k).substring(0, 5);
  return fmtD(k).substring(0, 5);   // lunedi della settimana
}

// Media dei valori dentro ogni periodo, in ordine cronologico.
function _mktAggrega(righe, valore) {
  var m = {};
  righe.forEach(function (r) {
    var k = _mktBucket(r.data);
    var v = valore(r);
    if (v === null || v === undefined || isNaN(v)) return;
    (m[k] = m[k] || []).push(v);
  });
  return Object.keys(m).sort().map(function (k) {
    var somma = m[k].reduce(function (a, b) { return a + b; }, 0);
    return { chiave: k, etichetta: _mktEtichettaBucket(k), valore: somma / m[k].length, n: m[k].length };
  });
}

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
var _mktSettSel = null;
function mktSettimana(passo) {
  // passo +1 = una settimana piu indietro. Lo spostamento si fa sulla data
  // gia scelta: sette giorni avanti o indietro, poi la sezione riaggancia
  // la settimana piu vicina fra quelle che hanno carichi.
  if (!_mktSettSel) return;
  var d = new Date(_mktSettSel + 'T12:00:00');
  d.setDate(d.getDate() - 7 * passo);
  _mktSettSel = d.toISOString().split('T')[0];
  renderMercato();
}
// Lunedi della settimana di una data: chiave stabile e ordinabile.
function _mktLunedi(dataISO) {
  var d = new Date(dataISO + 'T12:00:00');
  var g = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - g);
  return d.toISOString().split('T')[0];
}

function _mktSezioneAccise(carichi, serie, carichiTutti) {
  // se non arriva l'elenco completo si usa quello filtrato: meglio una
  // tabella parziale che una sezione che va in errore
  if (!carichiTutti) carichiTutti = carichi || [];
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

  // v20260803b — Qui si guarda UNA SETTIMANA alla volta, navigabile.
  // Con tre mesi di carichi la tabella diventava un elenco illeggibile.
  // Prodotti: solo gasolio e benzina (regola sua del 03/08).
  var idonei = carichiTutti.filter(function (o) {
    var k = _mktProdottoChiave(o.prodotto);
    return !(Number(o.trasporto_litro) > 0)
      && (k === 'gasolio' || k === 'benzina')
      && String(o.prodotto || '').toLowerCase().indexOf('agricol') < 0
      && _mktAccisaAl(o.data, o.prodotto);
  });

  h += '<div class="card" style="margin-top:14px;padding:14px">';
  h += '<div style="font-size:13px;font-weight:600;margin-bottom:4px">Di cosa e fatto il prezzo che paghi</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px">Gasolio e benzina, una settimana alla volta. Solo i carichi senza trasporto del fornitore: sono gli unici confrontabili col mercato senza correzioni.</div>';

  if (!idonei.length) {
    h += '<div style="font-size:12px;color:var(--text-muted)">Nessun carico confrontabile nel periodo scelto.</div></div>';
    return h;
  }

  // settimane disponibili, dalla piu recente
  var settimane = [];
  idonei.forEach(function (o) {
    var k = _mktLunedi(o.data);
    if (settimane.indexOf(k) < 0) settimane.push(k);
  });
  settimane.sort().reverse();
  if (!_mktSettSel) _mktSettSel = settimane[0];
  if (settimane.indexOf(_mktSettSel) < 0) {
    // la settimana scelta non ha carichi: si prende la piu vicina che ne ha
    var mig = settimane[0], dist = Infinity;
    settimane.forEach(function (k) {
      var d = Math.abs(new Date(k + 'T12:00:00') - new Date(_mktSettSel + 'T12:00:00'));
      if (d < dist) { dist = d; mig = k; }
    });
    _mktSettSel = mig;
  }
  var iSett = settimane.indexOf(_mktSettSel);

  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">';
  h += '<button onclick="mktSettimana(1)"' + (iSett >= settimane.length - 1 ? ' disabled' : '')
     + ' style="font-size:12px;padding:6px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:' + (iSett >= settimane.length - 1 ? 'not-allowed;opacity:0.4' : 'pointer') + '">&#8249; precedente</button>';
  h += '<strong style="font-size:12.5px">Settimana del ' + fmtD(_mktSettSel) + '</strong>';
  h += '<button onclick="mktSettimana(-1)"' + (iSett <= 0 ? ' disabled' : '')
     + ' style="font-size:12px;padding:6px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:' + (iSett <= 0 ? 'not-allowed;opacity:0.4' : 'pointer') + '">successiva &#8250;</button>';
  h += '<span style="font-size:11px;color:var(--text-muted);margin-left:auto">' + settimane.length + ' settimane con carichi nel periodo</span>';
  h += '</div>';

  var puliti = idonei.filter(function (o) { return _mktLunedi(o.data) === _mktSettSel; })
                     .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  if (!puliti.length) {
    h += '<div style="font-size:12px;color:var(--text-muted)">Nessun carico in questa settimana.</div></div>';
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


// ═══ v20260803f · PREVISIONE DEL PROSSIMO LISTINO ══════════════════
// Misurata sui dati veri di Rinaldo (79 giorni Ludoil + 70 Eni Vibo,
// maggio-agosto 2026), non ipotizzata:
//
//   1. Il listino di un giorno NON nasce dalla chiusura del giorno prima.
//      Guardando indietro di una quotazione la correlazione e 0,15-0,18;
//      di DUE quotazioni sale a 0,45-0,70; di tre ricade a 0,10.
//      Quindi il movimento del petrolio di oggi si vede sul listino di
//      DOPODOMANI, non di domani. E un giorno in piu per decidere.
//   2. Il listino si muove piu del greggio: coefficiente misurato fra
//      0,86 (Eni Vibo) e 1,45 (Ludoil).
//   3. MATRICE = ENI VIBO, il fornitore su cui si fanno i volumi. Gli
//      altri ricevono la STESSA variazione in millesimi, partendo dal
//      loro scarto (Ludoil sta ~6 millesimi sotto Eni).
//
// Coefficiente e scarti NON sono fissati nel codice: il programma li
// rimisura sulla finestra mostrata, cosi se il fornitore cambia
// condizioni se ne accorge da solo. In pagina si vede su quanti giorni.
var _mktListini = [];
var MKT_MATRICE = 'eni';

// Giorni in cui i fornitori si separano in modo anomalo: variazioni di
// accisa non registrate su tutti, o errori di battitura. Vanno esclusi
// dalla misura, altrimenti sporcano il coefficiente.
function _mktScartaAnomali(serie) {
  var d = serie.slice();
  var var_ = [];
  for (var i = 1; i < d.length; i++) var_.push(Math.abs(d[i].costo - d[i - 1].costo));
  if (var_.length < 5) return d;
  var ord = var_.slice().sort(function (a, b) { return a - b; });
  var mediana = ord[Math.floor(ord.length / 2)];
  var soglia = Math.max(0.08, mediana * 8);   // salti fuori scala
  var fuori = {};
  for (var j = 1; j < d.length; j++) {
    if (Math.abs(d[j].costo - d[j - 1].costo) > soglia) fuori[d[j].data] = true;
  }
  return d.filter(function (x) { return !fuori[x.data]; });
}

function _mktSerieFornitore(nome) {
  var m = {};
  _mktListini.forEach(function (x) {
    if (String(x.fornitore || '').toLowerCase().indexOf(nome) < 0) return;
    m[x.data] = Number(x.costo_litro);
  });
  return Object.keys(m).sort().map(function (d) { return { data: d, costo: m[d] }; });
}

// ═══ v20260819b · QUANDO LA PREVISIONE DEVE TACERE ══════════════════
// `futures_storico` si riempie solo aprendo la pagina, quindi ha buchi:
// il 19/08 le ultime tre chiusure erano 31/07, 03/08 e 19/08. La
// previsione fa quot[n-2] − quot[n-3] credendo di misurare due giorni,
// e misurava invece SEDICI giorni: usciva "prossimo listino −47
// millesimi" mentre i listini veri salivano da 1,6286 a 1,6822.
// Due chiusure si considerano consecutive se distano al massimo cinque
// giorni: copre venerdi→lunedi e i ponti. Oltre, il salto non e' un
// movimento di mercato ma un pezzo di serie che manca, e non si usa.
var MKT_MAX_GAP = 5;          // giorni fra due chiusure consecutive
var MKT_LISTINO_VECCHIO = 7;  // oltre, il listino e' fermo e non si proietta

function _mktGiorniFra(dataA, dataB) {
  return Math.round((new Date(dataB + 'T12:00:00') - new Date(dataA + 'T12:00:00')) / 86400000);
}

function _mktOggi() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// Regressione della variazione del listino sulla variazione del petrolio
// di DUE quotazioni prima. Restituisce anche quanto e affidabile.
// v20260819b — si calibra SOLO su catene consecutive: se fra le quotazioni
// usate, o fra queste e il listino, c'e' un buco, la coppia si scarta.
// Prima entravano anche i salti a cavallo dei buchi e gonfiavano il
// coefficiente.
function _mktCalibra(serie, quot) {
  var qd = quot.map(function (x) { return x.data; });
  var xs = [], ys = [], scartate = 0;
  for (var i = 1; i < serie.length; i++) {
    var dc = serie[i].costo - serie[i - 1].costo;
    if (Math.abs(dc) < 1e-9) continue;              // listino non aggiornato
    if (_mktGiorniFra(serie[i - 1].data, serie[i].data) > MKT_MAX_GAP) { scartate++; continue; }
    var prec = [];
    for (var j = 0; j < qd.length; j++) if (qd[j] < serie[i].data) prec.push(j);
    if (prec.length < 3) continue;
    var qA = quot[prec[prec.length - 3]];
    var qB = quot[prec[prec.length - 2]];
    var qC = quot[prec[prec.length - 1]];
    // la catena qA → qB → qC → listino dev'essere tutta senza buchi
    if (_mktGiorniFra(qA.data, qB.data) > MKT_MAX_GAP) { scartate++; continue; }
    if (_mktGiorniFra(qB.data, qC.data) > MKT_MAX_GAP) { scartate++; continue; }
    if (_mktGiorniFra(qC.data, serie[i].data) > MKT_MAX_GAP) { scartate++; continue; }
    xs.push(qB.v - qA.v);
    ys.push(dc);
  }
  if (xs.length < 12) return null;
  var n = xs.length;
  var mx = xs.reduce(function (a, b) { return a + b; }, 0) / n;
  var my = ys.reduce(function (a, b) { return a + b; }, 0) / n;
  var sxy = 0, sxx = 0, syy = 0;
  for (var k = 0; k < n; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += Math.pow(xs[k] - mx, 2); syy += Math.pow(ys[k] - my, 2); }
  if (!sxx || !syy) return null;
  var b = sxy / sxx, a = my - b * mx;
  var r = sxy / Math.sqrt(sxx * syy);
  // errore medio della previsione, e quanto sbaglierebbe dire "non cambia"
  var e1 = 0, e0 = 0;
  for (var z = 0; z < n; z++) { e1 += Math.abs(a + b * xs[z] - ys[z]); e0 += Math.abs(ys[z]); }
  return { n: n, a: a, b: b, r: r, errore: e1 / n, erroreFermo: e0 / n, scartate: scartate };
}

// Scarto di un fornitore rispetto alla matrice, misurato sugli ultimi
// giorni in cui entrambi hanno listino.
function _mktScarto(serieAltro, serieMatrice, giorni) {
  var m = {};
  serieMatrice.forEach(function (x) { m[x.data] = x.costo; });
  var d = serieAltro.filter(function (x) { return m[x.data] !== undefined; }).slice(-(giorni || 10));
  if (!d.length) return null;
  var v = d.map(function (x) { return x.costo - m[x.data]; }).sort(function (a, b) { return a - b; });
  return { mediana: v[Math.floor(v.length / 2)], n: v.length };
}

// ═══ v20260819b · IL CALCOLO, UNO SOLO ══════════════════════════════
// Lo usano sia la sezione Previsione sia la proiezione tratteggiata del
// grafico: un metodo solo, cosi non possono dire due cose diverse.
// Restituisce sempre un oggetto: { ok:false, motivo } quando i dati non
// reggono, { ok:true, ... } quando reggono. Il chiamante decide come
// mostrarlo, ma non decide SE i numeri valgono.
function _mktPrevisioneCalcolo(serie) {
  if (!_mktListini.length) return { ok: false, motivo: 'Nessun listino nel periodo.' };
  if (!serie.length) return { ok: false, motivo: 'Nessuna chiusura di mercato nel periodo.' };

  var quot = serie.map(function (r) {
    return { data: r.data, v: Number(r.prezzo_euro_litro || 0) };
  }).filter(function (x) { return x.v > 0; });
  if (quot.length < 4) {
    return { ok: false, motivo: 'Servono almeno quattro chiusure di mercato: ce ne sono ' + quot.length + '.' };
  }

  // ── Le ultime tre chiusure devono essere davvero consecutive ────────
  // Il modello legge la differenza fra la penultima e la terzultima
  // credendo di misurare un giorno di mercato. Se in mezzo mancano
  // giorni, quella differenza e' un pezzo di serie assente, non un
  // movimento: si tace.
  var n = quot.length;
  var g1 = _mktGiorniFra(quot[n - 2].data, quot[n - 1].data);
  var g2 = _mktGiorniFra(quot[n - 3].data, quot[n - 2].data);
  if (g1 > MKT_MAX_GAP || g2 > MKT_MAX_GAP) {
    var da = g2 > MKT_MAX_GAP ? quot[n - 3].data : quot[n - 2].data;
    var a  = g2 > MKT_MAX_GAP ? quot[n - 2].data : quot[n - 1].data;
    var gg = Math.max(g1, g2);
    return { ok: false, buco: true, da: da, a: a, giorni: gg,
      motivo: 'Fra le ultime chiusure di mercato manca un pezzo di serie: da ' + fmtD(da)
        + ' si salta a ' + fmtD(a) + ', ' + gg + ' giorni. Il modello leggerebbe quel salto come se fosse '
        + 'il movimento di un giorno solo e sbaglierebbe di parecchi centesimi.' };
  }

  var matrice = _mktScartaAnomali(_mktSerieFornitore(MKT_MATRICE));
  if (matrice.length < 15) {
    return { ok: false, motivo: 'Servono almeno quindici listini della matrice Eni Vibo: ce ne sono ' + matrice.length + '.' };
  }

  // La matrice stessa non dev'essere ferma: proiettare da un prezzo di
  // due settimane fa vuol dire spacciare per attuale una base morta.
  var ultimo = matrice[matrice.length - 1];
  var eta = _mktGiorniFra(ultimo.data, _mktOggi());
  if (eta > MKT_LISTINO_VECCHIO) {
    return { ok: false, motivo: 'L\'ultimo listino Eni Vibo e\' del ' + fmtD(ultimo.data)
      + ', fermo da ' + eta + ' giorni: non c\'e\' una base attuale da cui proiettare.' };
  }

  var cal = _mktCalibra(matrice, quot);
  if (!cal) {
    return { ok: false, motivo: 'Non ci sono abbastanza aggiornamenti di listino consecutivi per misurare il legame col petrolio.' };
  }

  // ── Il modello deve battere il non far niente ───────────────────────
  // Se l'errore medio della previsione e' pari o peggiore di quello che
  // si farebbe dicendo "domani il listino non cambia", la previsione non
  // aggiunge informazione: meglio il silenzio di un numero grande a
  // schermo che il numero non lo merita.
  if (cal.errore >= cal.erroreFermo) {
    return { ok: false, cal: cal,
      motivo: 'Il modello sbaglia in media ' + Math.round(cal.errore * 1000) + ' millesimi, '
        + 'contro ' + Math.round(cal.erroreFermo * 1000) + ' di chi dicesse "domani non cambia niente": '
        + 'non aggiunge niente e resta muto.' };
  }

  var dProx = quot[n - 2].v - quot[n - 3].v;
  var dDopo = quot[n - 1].v - quot[n - 2].v;
  return { ok: true, cal: cal, matrice: matrice, ultimo: ultimo, quot: quot,
           varProx: cal.a + cal.b * dProx, varDopo: cal.a + cal.b * dDopo };
}

function _mktSezionePrevisione(serie) {
  if (!_mktListini.length) return '';
  var P = _mktPrevisioneCalcolo(serie);

  var mill = function (x) { return (x >= 0 ? '+' : '') + Math.round(x * 1000) + ' millesimi'; };
  var col = function (x) { return x > 0.0005 ? '#A32D2D' : (x < -0.0005 ? '#27500A' : 'var(--text-muted)'); };
  var oggi = _mktOggi();

  var h = '<div class="card" id="mkt-card-prev" style="margin-top:14px;padding:14px">';
  h += '<div style="font-size:13px;font-weight:600;margin-bottom:2px">Previsione del prossimo listino</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">'
     + 'Matrice <strong>Eni Vibo</strong>. Il movimento del petrolio si riflette sul listino dopo <strong>due quotazioni</strong>: '
     + 'quello di oggi si vedra fra due giorni, non domani.</div>';

  if (!P.ok) {
    // v20260819b — La previsione tace, ma la pagina non sparisce: la
    // tabella dei listini resta, perche' quelli sono un dato di fatto e
    // non una stima.
    h += '<div style="background:rgba(186,117,23,0.10);border-left:3px solid #BA7517;border-radius:6px;padding:11px 13px;margin-bottom:12px">'
       + '<div style="font-size:12.5px;font-weight:600;color:#BA7517;margin-bottom:3px">Previsione sospesa</div>'
       + '<div style="font-size:11.5px;color:var(--text);line-height:1.6">' + esc(P.motivo) + '</div>'
       + (P.buco ? '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.6">'
           + 'Lo storico si riempie solo aprendo questa pagina: i buchi nascono cosi. '
           + 'Premi <strong>↧ Carica storico</strong> per ricostruire i giorni mancanti.</div>' : '')
       + '</div>';
  } else {
    h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">';
    h += '<div style="flex:1;min-width:210px;background:var(--bg-kpi);border-radius:10px;padding:12px 14px">'
       + '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Prossimo listino</div>'
       + '<div style="font-size:22px;font-weight:700;font-family:var(--font-mono);margin-top:3px;color:' + col(P.varProx) + '">' + mill(P.varProx) + '</div>'
       + '<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">da ' + P.ultimo.costo.toFixed(6) + ' del ' + fmtD(P.ultimo.data)
       + ' a <strong style="color:var(--text)">' + (P.ultimo.costo + P.varProx).toFixed(6) + '</strong></div></div>';
    h += '<div style="flex:1;min-width:210px;background:var(--bg-kpi);border-radius:10px;padding:12px 14px">'
       + '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Il listino dopo</div>'
       + '<div style="font-size:22px;font-weight:700;font-family:var(--font-mono);margin-top:3px;color:' + col(P.varDopo) + '">' + mill(P.varDopo) + '</div>'
       + '<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">dal movimento del petrolio di oggi</div></div>';
    h += '</div>';
  }

  // ── Tabella listini: c'e' SEMPRE, previsione o no ────────────────────
  // v20260819b — Ogni fornitore porta la data del suo ultimo listino. Se
  // e' fermo da piu' di una settimana, l'Atteso va a trattino: Q8 il
  // 19/08 mostrava 1,520000 del 06/08 e ci sommava sopra la variazione,
  // sputando un 1,634568 che nessuno aveva mai quotato.
  var matriceT = P.ok ? P.matrice : _mktScartaAnomali(_mktSerieFornitore(MKT_MATRICE));
  var ultimoT = matriceT.length ? matriceT[matriceT.length - 1] : null;

  var righe = [];
  if (ultimoT) {
    righe.push({ nome: 'Eni Vibo', matrice: true, ultimo: ultimoT, scarto: null,
                 eta: _mktGiorniFra(ultimoT.data, oggi) });
  }
  ['ludoil', 'q8'].forEach(function (nome) {
    var sr = _mktSerieFornitore(nome);
    if (!sr.length) return;
    var u = sr[sr.length - 1];
    righe.push({ nome: nome === 'ludoil' ? 'Ludoil Vibo' : 'Q8 Vibo', matrice: false, ultimo: u,
                 scarto: ultimoT ? _mktScarto(sr, matriceT, 10) : null,
                 eta: _mktGiorniFra(u.data, oggi) });
  });

  if (!righe.length) {
    h += '<div style="font-size:12px;color:var(--text-muted)">Nessun listino da mostrare.</div></div>';
    return h;
  }

  h += '<table style="width:100%;border-collapse:collapse;font-size:12.5px">';
  h += '<tr style="color:var(--text-muted);text-align:right">'
     + '<th style="text-align:left;padding:6px 8px;font-weight:500">Fornitore</th>'
     + '<th style="padding:6px 8px;font-weight:500">Scarto su Eni</th>'
     + '<th style="padding:6px 8px;font-weight:500">Ultimo listino</th>'
     + '<th style="padding:6px 8px;font-weight:500">Atteso</th></tr>';

  var qualcunoFermo = false;
  righe.forEach(function (x) {
    var vecchio = x.eta > MKT_LISTINO_VECCHIO;
    if (vecchio) qualcunoFermo = true;
    var colData = vecchio ? 'var(--text-muted)' : 'var(--text-muted)';
    var atteso = '<span style="color:var(--text-muted)">&mdash;</span>';
    if (P.ok && !vecchio) {
      if (x.matrice) atteso = (x.ultimo.costo + P.varProx).toFixed(6);
      else if (x.scarto) atteso = (P.ultimo.costo + x.scarto.mediana + P.varProx).toFixed(6);
    }
    h += '<tr style="border-top:0.5px solid var(--border);text-align:right' + (vecchio ? ';opacity:0.55' : '') + '">'
       + '<td style="text-align:left;padding:7px 8px">' + esc(x.nome)
         + (x.matrice ? ' <span style="font-size:10px;color:var(--text-muted)">matrice</span>' : '')
         + (vecchio ? ' <span style="font-size:10px;color:#BA7517">fermo da ' + x.eta + ' giorni</span>' : '')
         + '</td>'
       + '<td style="padding:7px 8px;font-family:var(--font-mono);color:var(--text-muted)"'
         + (x.scarto ? ' title="mediana degli ultimi ' + x.scarto.n + ' giorni in comune"' : '') + '>'
         + (x.matrice ? '&mdash;' : (x.scarto ? (x.scarto.mediana >= 0 ? '+' : '') + Math.round(x.scarto.mediana * 1000) + ' mill.' : '&mdash;'))
       + '</td>'
       + '<td style="padding:7px 8px;font-family:var(--font-mono)">' + x.ultimo.costo.toFixed(6)
         + '<div style="font-size:10px;color:' + colData + ';font-family:var(--font-sans)">' + fmtD(x.ultimo.data) + '</div></td>'
       + '<td style="padding:7px 8px;font-family:var(--font-mono);font-weight:700">' + atteso + '</td></tr>';
  });
  h += '</table>';

  if (qualcunoFermo) {
    h += '<div style="font-size:11px;color:#BA7517;margin-top:8px;line-height:1.6">'
       + 'I fornitori fermi da piu\' di ' + MKT_LISTINO_VECCHIO + ' giorni restano in elenco con la loro data, '
       + 'ma senza Atteso: proiettare una variazione su un prezzo vecchio produce un numero che nessuno ha mai quotato.</div>';
  }

  if (P.ok) {
    h += '<div style="font-size:11px;color:var(--text-muted);margin-top:10px;line-height:1.6">'
       + 'Coefficiente <strong>' + P.cal.b.toFixed(2) + '</strong> misurato su <strong>' + P.cal.n + '</strong> aggiornamenti di listino consecutivi '
       + '(affidabilita ' + Math.round(Math.abs(P.cal.r) * 100) + '%). Errore medio <strong>' + Math.round(P.cal.errore * 1000) + ' millesimi</strong>, '
       + 'contro ' + Math.round(P.cal.erroreFermo * 1000) + ' se si dicesse "non cambia niente". '
       + (P.cal.scartate ? P.cal.scartate + ' aggiornamenti scartati perche a cavallo di un buco nello storico. ' : '')
       + 'E un indicatore di tendenza per decidere se rimandare un carico, non un prezzo.</div>';
  }
  h += '</div>';
  return h;
}

async function renderMercato() {
  var el = document.getElementById('mercato-wrap');
  if (!el) return;
  el.innerHTML = '<div class="loading" style="padding:30px">Caricamento mercato…</div>';

  var dal = new Date(); dal.setDate(dal.getDate() - _mktGiorni);
  var dalISO = dal.toISOString().split('T')[0];

  var serie = [], carichi = [], carichiTutti = [];
  try {
    var r = await Promise.all([
      sb.from('futures_storico').select('*').gte('data', dalISO).order('data', { ascending: true }),
      sb.from('ordini').select('data,fornitore,prodotto,litri,costo_litro,trasporto_litro,tipo_ordine,stato')
        .eq('tipo_ordine', 'entrata_deposito').neq('stato', 'annullato')
        .gte('data', dalISO).order('data', { ascending: true }),
      sb.from('accise_storico').select('*').order('data_inizio'),
      sb.from('prezzi').select('data,fornitore,costo_litro,base_carico_id,basi_carico(nome)')
        .ilike('prodotto', '%gasolio%auto%').gte('data', dalISO).order('data')
    ]);
    _mktListini = (r[3] && !r[3].error ? (r[3].data || []) : []).filter(function (x) {
      var b = x.basi_carico && x.basi_carico.nome ? x.basi_carico.nome : '';
      return /vibo/i.test(b) && Number(x.costo_litro) > 0;
    });
    _mktAccise = r[2] && !r[2].error ? (r[2].data || []) : [];
    serie = r[0].data || [];
    // TUTTI i carichi (29/07): il filtro Eni/Ludoil vale solo per l'analisi
    // delle accise, dove il trasporto del fornitore falserebbe il conto. Qui
    // si distinguono per DATO, non per nome: chi non ha trasporto e'
    // confrontabile col mercato in modo pulito, gli altri lo includono.
    // v20260803b — In QUESTA pagina si ragiona SOLO sul gasolio autotrazione:
    // il Brent e il suo riferimento, e mettere accanto benzina e agricolo
    // confonde e basta (regola sua del 03/08).
    carichiTutti = (r[1].data || []).filter(function (o) {
      return Number(o.litri) > 0 && Number(o.costo_litro) > 0;
    });
    carichi = carichiTutti.filter(function (o) {
      return _mktProdottoChiave(o.prodotto) === 'gasolio'
        && String(o.prodotto || '').toLowerCase().indexOf('agricol') < 0;
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
  // v20260803b — Aggregazione: con un punto al giorno su tre mesi il grafico
  // e illeggibile. Raggruppando per settimana o mese le variazioni si vedono.
  h += '<div style="display:flex;gap:6px;align-items:center">'
    + '<span style="font-size:11px;color:var(--text-muted);margin-right:2px">vista</span>'
    + [['giorno', 'Giorno'], ['settimana', 'Settimana'], ['mese', 'Mese']].map(function (p) {
        var on = _mktGran === p[0];
        return '<button onclick="mktGranularita(\'' + p[0] + '\')" style="font-size:12px;padding:6px 12px;border:0.5px solid ' + (on ? '#185FA5' : 'var(--border)') + ';border-radius:7px;background:' + (on ? '#185FA5' : 'var(--bg)') + ';color:' + (on ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (on ? '600' : '500') + '">' + p[1] + '</button>';
      }).join('')
    + '</div>';
  h += '<div style="display:flex;gap:8px;align-items:center">'
    + '<span id="mkt-esito" style="font-size:11.5px;color:var(--text-muted);max-width:420px;text-align:right;line-height:1.5"></span>'
    + '<button id="mkt-btn-stor" onclick="mktCaricaStorico()" style="font-size:12px;padding:7px 15px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">↧ Carica storico</button>'
    + '<button id="mkt-btn-ora" onclick="mktGuardaAdesso()" title="Legge il mercato in questo momento senza registrare niente" style="font-size:12px;padding:7px 15px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">&#128065; Guarda adesso</button>'
    + '<button id="mkt-btn-agg" onclick="mktAggiornaOra()" style="font-size:12px;padding:7px 15px;border:0.5px solid #378ADD;border-radius:7px;background:var(--bg-card);color:#0C447C;font-weight:600;cursor:pointer">⟳ Aggiorna adesso</button>'
    + '</div></div>';

  h += '<div id="mkt-ora-box"></div>';

  // v20260819a — Il grafico ora si regge sui LISTINI, non sulle quotazioni.
  // Senza quotazioni resta fuori solo la proiezione: il benchmark si disegna
  // lo stesso. Il vecchio codice usciva di qui e faceva sparire tutta la
  // pagina (regola: un filtro nuovo deve fallire aperto).
  if (!serie.length) {
    h += '<div class="card" style="margin-bottom:14px"><div style="font-size:12.5px;color:var(--text-muted);line-height:1.7">'
      + 'Nessuna quotazione nel periodo: il confronto sui listini resta, manca solo la proiezione. '
      + 'Premi <strong>↧ Carica storico</strong> per ricostruire gli ultimi mesi in una volta sola, '
      + 'oppure <strong>⟳ Aggiorna adesso</strong> per la sola chiusura di oggi.</div></div>';
  }

  if (!_mktListini.length) {
    h += '<div class="card"><div style="font-size:13px;color:var(--text-muted);line-height:1.7">'
      + 'Nessun listino <strong>gasolio autotrazione</strong> con base <strong>Vibo Marina</strong> in questo periodo: '
      + 'senza listini non c\'è niente contro cui confrontare i carichi. Allarga il periodo con 3M / 6M / 1A.</div></div>';
    // v20260802b: la scomposizione dell'accisa NON dipende dal mercato —
    // prodotto puro = costo meno accisa. Prima si usciva di qui e la sezione
    // non compariva affatto.
    h += _mktSezioneAccise(carichi, serie, carichiTutti);
    el.innerHTML = h;
    _mktDisegnaGraficoAccise();
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  // v20260819a — BENCHMARK SUI LISTINI VERI
  // Prima la linea era petrolio + accisa + uno "scarto medio" ricavato
  // all'indietro dai carichi stessi: un numero costruito, contro cui il
  // confronto non diceva niente (infatti in alto usciva "nessun carico
  // confrontabile"). Ora la linea e' la MEDIA DEI LISTINI VERI dei
  // fornitori base Vibo Marina su gasolio autotrazione, letta da `prezzi`.
  // I fornitori Vibo sono tutti FRANCO PARTENZA: si confronta il solo
  // costo_litro e il trasporto resta fuori, perche' e' costo di logistica
  // e non prezzo del fornitore.
  // ═══════════════════════════════════════════════════════════════════

  // Un valore per fornitore e per giorno: l'ultima riga vince, come fa gia'
  // _mktSerieFornitore. Le righe del Deposito sono costruite dal programma
  // (_isDeposito) e non sono un fornitore: fuori da ogni media di mercato.
  var perGiorno = {};
  _mktListini.forEach(function (x) {
    var f = String(x.fornitore || '').trim();
    if (!f || /phoenix|deposito/i.test(f)) return;
    if (!(Number(x.costo_litro) > 0)) return;
    (perGiorno[x.data] = perGiorno[x.data] || {})[f.toLowerCase()] = Number(x.costo_litro);
  });
  var benchGiorno = Object.keys(perGiorno).sort().map(function (d) {
    var nomi = Object.keys(perGiorno[d]);
    var v = nomi.map(function (k) { return perGiorno[d][k]; });
    var somma = v.reduce(function (a, b) { return a + b; }, 0);
    return { data: d, media: somma / v.length,
             min: Math.min.apply(null, v), max: Math.max.apply(null, v),
             n: v.length, nomi: nomi };
  });

  if (!benchGiorno.length) {
    h += '<div class="card"><div style="font-size:13px;color:var(--text-muted);line-height:1.7">'
      + 'I listini letti sono tutti a costo zero o del solo Deposito: niente da confrontare.</div></div>';
    h += _mktSezioneAccise(carichi, serie, carichiTutti);
    el.innerHTML = h;
    _mktDisegnaGraficoAccise();
    return;
  }

  // Aggregazione nel periodo scelto (giorno / settimana / mese). Il metodo
  // e' quello che c'e' gia': _mktAggrega, stessa chiave di bucket dei carichi.
  var aggMedia = _mktAggrega(benchGiorno, function (r) { return r.media; });
  var aggMin   = _mktAggrega(benchGiorno, function (r) { return r.min; });
  var aggMax   = _mktAggrega(benchGiorno, function (r) { return r.max; });
  var mapMin = {}, mapMax = {};
  aggMin.forEach(function (b) { mapMin[b.chiave] = b.valore; });
  aggMax.forEach(function (b) { mapMax[b.chiave] = b.valore; });

  var lab     = aggMedia.map(function (b) { return b.etichetta; });
  var linMed  = aggMedia.map(function (b) { return Math.round(b.valore * 1000000) / 1000000; });
  var linMin  = aggMedia.map(function (b) { return mapMin[b.chiave] !== undefined ? Math.round(mapMin[b.chiave] * 1000000) / 1000000 : null; });
  var linMax  = aggMedia.map(function (b) { return mapMax[b.chiave] !== undefined ? Math.round(mapMax[b.chiave] * 1000000) / 1000000 : null; });

  var ultimoG = benchGiorno[benchGiorno.length - 1];
  var ultimo  = aggMedia[aggMedia.length - 1].valore;
  var prec    = aggMedia.length > 1 ? aggMedia[aggMedia.length - 2].valore : ultimo;
  var varG    = ultimo - prec;

  // ── Carichi: scarto sulla media dei listini dello stesso periodo ─────
  // Solo costo_litro: il trasporto e' fuori dal confronto (franco partenza).
  var mediaPerBucket = {};
  aggMedia.forEach(function (b) { mediaPerBucket[b.chiave] = b.valore; });
  var nConf = 0, nSotto = 0, totLitri = 0, totEuro = 0;
  carichi.forEach(function (o) {
    var k = _mktBucket(o.data);
    if (mediaPerBucket[k] === undefined) { o._scarto = null; return; }
    o._scarto = Number(o.costo_litro) - mediaPerBucket[k];
    nConf++;
    if (o._scarto < 0) nSotto++;
    totLitri += Number(o.litri);
    totEuro  += o._scarto * Number(o.litri);
  });
  var scartoPesato = totLitri ? totEuro / totLitri : null;

  // ── Proiezione: si riusa lo STESSO calcolo della sezione Previsione ──
  // v20260819b — Un metodo solo: se la previsione tace perche' lo storico
  // ha un buco o perche' il modello non batte il "non cambia niente", la
  // riga tratteggiata non si disegna. Prima erano due strade diverse e
  // potevano contraddirsi.
  var proiez = null;
  var _P = _mktPrevisioneCalcolo(serie);
  if (_P.ok) proiez = { varProx: _P.varProx, r: _P.cal.r, valore: ultimo + _P.varProx };
  if (proiez) {
    lab.push('atteso');
    linMed.push(null); linMin.push(null); linMax.push(null);
  }
  var linProi = lab.map(function (_, i) {
    if (!proiez) return null;
    if (i === lab.length - 2) return Math.round(ultimo * 1000000) / 1000000;
    if (i === lab.length - 1) return Math.round(proiez.valore * 1000000) / 1000000;
    return null;
  });

  var mill = function (x) { return (x >= 0 ? '+' : '') + Math.round(x * 1000); };
  var forbiceUlt = ultimoG.max - ultimoG.min;

  var kpi = function (lab2, val, sub, col) {
    return '<div class="kpi"><div class="kpi-label">' + lab2 + '</div>'
      + '<div class="kpi-value" style="font-family:var(--font-mono);color:' + (col || 'var(--text)') + '">' + val + '</div>'
      + (sub ? '<div style="font-size:11px;color:var(--text-muted)">' + sub + '</div>' : '') + '</div>';
  };

  h += '<div class="grid4" style="margin-bottom:16px">'
    + kpi('Listino medio ' + fmtD(ultimoG.data), ultimo.toFixed(4),
          (varG >= 0 ? '+' : '') + Math.round(varG * 1000) + ' millesimi sul periodo precedente',
          varG >= 0 ? '#A32D2D' : '#3B6D11')
    + kpi('Forbice fra fornitori', mill(forbiceUlt).replace('+', '') + ' mill.',
          ultimoG.n > 1 ? 'da ' + ultimoG.min.toFixed(4) + ' a ' + ultimoG.max.toFixed(4) + ' · ' + ultimoG.n + ' fornitori'
                        : 'un solo listino quel giorno')
    + (function () {
        var ultC = carichi.length ? carichi[carichi.length - 1] : null;
        if (!ultC) return kpi('Tuo ultimo carico', '—', 'nessun carico nel periodo');
        var sc = (ultC._scarto === null || ultC._scarto === undefined) ? null : ultC._scarto;
        return kpi('Tuo ultimo carico', Number(ultC.costo_litro).toFixed(4),
          esc(ultC.fornitore) + ' · ' + fmtD(ultC.data)
            + (sc === null ? '' : ' · ' + mill(sc) + ' mill. sulla media'),
          sc === null ? null : (sc <= 0 ? '#3B6D11' : '#A32D2D'));
      })()
    + (function () {
        if (!nConf) return kpi('Come abbiamo comprato', '—', 'nessun carico nel periodo dei listini');
        return kpi('Come abbiamo comprato', nSotto + ' su ' + nConf + ' sotto',
          mill(scartoPesato) + ' millesimi · '
            + (totEuro >= 0 ? '+' : '−') + ' € ' + Math.abs(Math.round(totEuro)).toLocaleString('it-IT') + ' su ' + fmtL(totLitri) + ' L',
          scartoPesato <= 0 ? '#3B6D11' : '#A32D2D');
      })()
    + '</div>';

  h += '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:8px;font-size:11.5px;color:var(--text-muted)">'
    + '<span><span style="display:inline-block;width:10px;height:2px;background:#26215C;margin-right:5px;vertical-align:middle"></span>Media listini fornitori · base Vibo Marina</span>'
    + '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(217,222,13,0.55);margin-right:5px"></span>Forbice min–max fra fornitori</span>'
    + '<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#639922;margin-right:4px"></span>'
      + '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#A32D2D;margin-right:5px"></span>'
      + 'Carichi sotto · sopra la media</span>'
    + (proiez ? '<span><span style="display:inline-block;width:12px;height:2px;background:#BA7517;margin-right:5px;vertical-align:middle"></span>Proiezione dal petrolio di due quotazioni fa</span>' : '')
    + '<span>Confronto sul solo <strong>costo_litro</strong>: i fornitori Vibo sono franco partenza, il trasporto è logistica</span>'
    + '</div>';
  h += '<div class="card" id="mkt-card-graf"><div style="position:relative;height:300px"><canvas id="mkt-chart"></canvas></div></div>';

  // nota IVA: si lavora in imponibile, il finito e' solo informativo
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">'
    + '<div class="kpi" style="flex:1;min-width:200px"><div class="kpi-label">Valore usato nei conti (imponibile)</div>'
      + '<div class="kpi-value" style="font-family:var(--font-mono)">' + ultimo.toFixed(4) + '</div></div>'
    + '<div class="kpi" style="flex:1;min-width:200px"><div class="kpi-label">Solo informativo: con IVA 22%</div>'
      + '<div class="kpi-value" style="font-family:var(--font-mono);color:var(--text-muted)">' + (ultimo * (1 + _MKT_IVA)).toFixed(4) + '</div>'
      + '<div style="font-size:11px;color:var(--text-muted)">l\'IVA la recuperi: non entra mai nei confronti</div></div>'
    + '</div>';
  h += _mktSezionePrevisione(serie);

  // ═══ Composizione del prezzo · accise ═══
  h += _mktSezioneAccise(carichi, serie, carichiTutti);

  el.innerHTML = h;

  // ── Grafico ─────────────────────────────────────────────────────────
  // I pallini sono i carichi, collocati nel loro periodo. Il colore non e'
  // piu' una sfumatura: verde se sotto la media dei listini, rosso se sopra.
  // Il diametro cresce coi litri, cosi un carico grosso comprato male si
  // vede subito.
  var litriPunti = carichi.map(function (o) { return Number(o.litri) || 0; });
  var maxLitri = litriPunti.length ? Math.max.apply(null, litriPunti) : 0;
  var _raggio = function (l) {
    if (!(maxLitri > 0)) return 6;
    return 5 + Math.round(4 * Math.min(1, (Number(l) || 0) / maxLitri));
  };
  var _punto = function (o) {
    var k = _mktBucket(o.data);
    if (mediaPerBucket[k] === undefined) return null;
    return { x: _mktEtichettaBucket(k),
             y: Math.round(Number(o.costo_litro) * 1000000) / 1000000,
             _f: o.fornitore, _l: o.litri, _d: o.data,
             _t: Number(o.trasporto_litro || 0), _s: o._scarto };
  };
  var puntiSotto = carichi.filter(function (o) { return o._scarto !== null && o._scarto !== undefined && o._scarto < 0; }).map(_punto).filter(Boolean);
  var puntiSopra = carichi.filter(function (o) { return o._scarto !== null && o._scarto !== undefined && o._scarto >= 0; }).map(_punto).filter(Boolean);

  var _tipCarico = function (p) {
    return (p._f || '') + ' · ' + fmtD(p._d) + ': € ' + Number(p.y).toFixed(4) + '/L · ' + fmtL(p._l) + ' L'
      + (p._s === null || p._s === undefined ? ''
         : ' · ' + (p._s >= 0 ? '+' : '') + Math.round(p._s * 1000) + ' mill. sulla media')
      + (p._t > 0 ? ' · trasporto ' + Number(p._t).toFixed(4) + ' fuori confronto' : '');
  };

  if (_mktChart) _mktChart.destroy();
  var cv = document.getElementById('mkt-chart');
  if (cv && typeof Chart !== 'undefined') {
    _mktChart = new Chart(cv, {
      data: {
        labels: lab,
        datasets: [
          // la fascia: il min fa da base, il max ci riempie sopra (fill '-1')
          { type: 'line', label: 'Minimo fornitori', data: linMin, borderColor: 'rgba(217,222,13,0.55)', borderWidth: 1, pointRadius: 0, fill: false, tension: 0.25, spanGaps: true },
          { type: 'line', label: 'Massimo fornitori', data: linMax, borderColor: 'rgba(217,222,13,0.55)', backgroundColor: 'rgba(217,222,13,0.30)', borderWidth: 1, pointRadius: 0, fill: '-1', tension: 0.25, spanGaps: true },
          { type: 'line', label: 'Media listini', data: linMed, borderColor: '#26215C', borderWidth: 2.5, pointRadius: 0, fill: false, tension: 0.25, spanGaps: true },
          { type: 'line', label: 'Proiezione', data: linProi, borderColor: '#BA7517', borderWidth: 2, borderDash: [5, 4], pointRadius: 3, pointBackgroundColor: '#BA7517', fill: false, spanGaps: true },
          { type: 'scatter', label: 'Comprato sotto la media', data: puntiSotto, backgroundColor: '#639922', pointRadius: puntiSotto.map(function (p) { return _raggio(p._l); }), pointHoverRadius: 10, borderColor: '#fff', borderWidth: 2 },
          { type: 'scatter', label: 'Comprato sopra la media', data: puntiSopra, backgroundColor: '#A32D2D', pointRadius: puntiSopra.map(function (p) { return _raggio(p._l); }), pointHoverRadius: 10, borderColor: '#fff', borderWidth: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) {
          var d = c.dataset.label;
          if (d === 'Comprato sotto la media' || d === 'Comprato sopra la media') return _tipCarico(c.raw);
          if (c.parsed.y === null || c.parsed.y === undefined) return null;
          return d + ': € ' + Number(c.parsed.y).toFixed(4) + '/L';
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
// v20260803c — SGUARDO ESTEMPORANEO.
// Legge il mercato in questo momento e lo mostra, ma NON scrive niente:
// non entra nella serie storica e non partecipa al previsionale. Serve a
// dare un'occhiata durante la giornata senza sporcare i dati, perche il
// valore su cui si decide e la CHIUSURA delle 17:30, non il prezzo delle
// undici del mattino. Usa il modo { prova: true } della funzione server,
// che per costruzione non tocca il database.
// v20260803d — SGUARDO ESTEMPORANEO, con i due andamenti a confronto.
// Legge il mercato ADESSO e lo mette accanto alle ultime due chiusure, per
// Brent e per cambio. Non scrive NIENTE: non entra nella serie storica e
// non partecipa al previsionale — il numero su cui si decide resta la
// chiusura delle 17:30. Serve a capire durante la giornata se conviene
// rimandare un carico al giorno dopo.
// Le due chiusure sono gli ultimi due giorni CON DATI, non gli ultimi due
// di calendario: di lunedi sabato e domenica non esistono.
var _mktSguardo = null;

function _mktSpark(punti, colore, perStampa) {
  // tre punti: due chiusure e adesso. Scala sui valori stessi, con un po'
  // di margine sopra e sotto per non appiattire la linea sui bordi.
  var vals = punti.map(function (p) { return p.v; });
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if (hi === lo) { hi = lo + 1; lo = lo - 1; }
  var marg = (hi - lo) * 0.28; lo -= marg; hi += marg;
  var W = 300, H = 80;
  var xy = punti.map(function (p, i) {
    return { x: W * i / (punti.length - 1), y: H - H * (p.v - lo) / (hi - lo), p: p };
  });
  var d = 'M' + xy.map(function (q) { return q.x.toFixed(1) + ',' + q.y.toFixed(1); }).join(' L');
  // viewBox largo: le etichette del primo e dell'ultimo punto sporgono oltre
  // la linea e venivano tagliate ai bordi.
  var h = '<svg viewBox="-34 -16 368 116" style="width:100%;height:auto">';
  var cAsse = perStampa ? '#ccc' : 'var(--border)';
  var cTesto = perStampa ? '#888' : 'var(--text-muted)';
  var cUlt = perStampa ? '#333' : 'var(--text)';
  h += '<line x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '" stroke="' + cAsse + '" stroke-width="0.5"/>';
  h += '<path d="' + d + '" fill="none" stroke="' + colore + '" stroke-width="2.5"/>';
  xy.forEach(function (q, i) {
    var ultimo = (i === xy.length - 1);
    h += '<circle cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="' + (ultimo ? 6 : 4) + '" fill="' + colore + '"'
       + (ultimo ? ' stroke="#fff" stroke-width="2"' : '') + '/>';
    var anchor = i === 0 ? 'start' : (ultimo ? 'end' : 'middle');
    h += '<text x="' + q.x.toFixed(1) + '" y="' + Math.max(-2, q.y - 10).toFixed(1) + '" text-anchor="' + anchor
       + '" font-size="10" fill="' + (ultimo ? colore : cTesto) + '"' + (ultimo ? ' font-weight="600"' : '') + '>' + q.p.et + '</text>';
    h += '<text x="' + q.x.toFixed(1) + '" y="' + (H + 14) + '" text-anchor="' + anchor + '" font-size="10" fill="'
       + (ultimo ? cUlt : cTesto) + '"' + (ultimo ? ' font-weight="600"' : '') + '>' + q.p.lab + '</text>';
  });
  h += '</svg>';
  return h;
}

function _mktCartaSguardo(titolo, punti, dec, suffisso) {
  var ora = punti[punti.length - 1].v, prec = punti[punti.length - 2].v;
  var delta = ora - prec;
  var pct = prec ? (delta / Math.abs(prec) * 100) : 0;
  var giu = delta < 0;
  var col = Math.abs(delta) < 1e-9 ? 'var(--text-muted)' : (giu ? '#A32D2D' : '#27500A');
  var frec = Math.abs(delta) < 1e-9 ? '=' : (giu ? '\u25bc' : '\u25b2');
  var h = '<div style="flex:1;min-width:280px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:12px;padding:14px 16px">';
  h += '<div style="font-size:12px;color:var(--text-muted)">' + titolo + '</div>';
  h += '<div style="display:flex;align-items:baseline;gap:10px;margin:2px 0 10px;flex-wrap:wrap">';
  h += '<span style="font-size:29px;font-weight:700;font-family:var(--font-mono)">' + ora.toFixed(dec) + '</span>';
  h += '<span style="font-size:15px;font-weight:700;color:' + col + '">' + frec + ' ' + (delta >= 0 ? '+' : '') + delta.toFixed(dec) + '</span>';
  h += '<span style="font-size:13px;color:' + col + '">' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%</span>';
  h += '</div>';
  h += _mktSpark(punti, col === 'var(--text-muted)' ? '#8E8CA8' : col);
  return h + '</div>';
}

async function mktGuardaAdesso() {
  var btn = document.getElementById('mkt-btn-ora');
  var box = document.getElementById('mkt-ora-box');
  var graf = document.getElementById('mkt-card-graf');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardo…'; }
  try {
    var res = await sb.functions.invoke('mercato-gasolio', { body: { prova: true } });
    if (res.error) throw res.error;
    var d = res.data || {};
    if (!d.ok) throw new Error((d.errore || 'nessuna risposta') + _mktDettaglio(d.dettaglio));

    // ultime due chiusure con dati veri
    var st = await sb.from('futures_storico').select('data,brent_usd,eurusd')
      .not('brent_usd', 'is', null).order('data', { ascending: false }).limit(2);
    var chius = (st.data || []).slice().reverse();

    var oggiISO = new Date().toISOString().split('T')[0];
    var acc = _mktAccisaAl(oggiISO, 'gasolio');
    var pet = Number(d.petrolio_euro_litro || 0);
    var ora = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    var puntiB = chius.map(function (r) { return { v: Number(r.brent_usd), et: Number(r.brent_usd).toFixed(2), lab: 'ch. ' + fmtD(r.data).substring(0, 5) }; });
    puntiB.push({ v: Number(d.brent || 0), et: Number(d.brent || 0).toFixed(2), lab: 'adesso' });
    var puntiC = chius.map(function (r) { return { v: Number(r.eurusd), et: Number(r.eurusd).toFixed(4), lab: 'ch. ' + fmtD(r.data).substring(0, 5) }; });
    puntiC.push({ v: Number(d.cambio || 0), et: Number(d.cambio || 0).toFixed(4), lab: 'adesso' });

    var h = '<div style="margin-bottom:16px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:12px">';
    h += '<div style="font-size:14px;font-weight:700">&#128065; Sguardo delle ' + ora + '</div>';
    h += '<div style="font-size:11.5px;color:var(--text-muted)">non registrato &middot; non entra nel previsionale &middot; '
       + '<span onclick="mktChiudiSguardo()" style="text-decoration:underline;cursor:pointer">torna al grafico</span></div>';
    h += '</div>';

    if (puntiB.length < 3) {
      h += '<div style="font-size:12px;color:#854F0B;margin-bottom:10px">Mancano le chiusure precedenti: il confronto non e disponibile. Premi &#8595; Carica storico.</div>';
      h += '<div style="font-size:13px">Brent <strong style="font-family:var(--font-mono)">' + Number(d.brent || 0).toFixed(2) + '</strong> $/bbl &middot; '
         + 'cambio <strong style="font-family:var(--font-mono)">' + Number(d.cambio || 0).toFixed(4) + '</strong></div>';
      h += '</div>';
      if (box) box.innerHTML = h;
      if (graf) graf.style.display = '';
      return;
    }

    h += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    h += _mktCartaSguardo('Brent ICE &middot; $/barile', puntiB, 2);
    h += _mktCartaSguardo('Cambio EUR / USD', puntiC, 4);
    h += '</div>';

    // ═══ IL SUGGERIMENTO, in evidenza ═══
    // v20260818a — Il verso lo decide l'EFFETTO IN EURO, non il conteggio dei segnali.
    // Prima si sommava +1/-1 per petrolio e per cambio come se pesassero uguale: con
    // Brent +8,86% e cambio +0,50% il punteggio si annullava e usciva "segnali
    // contrastanti" mentre il costo saliva di 1.331 € sul carico. Il petrolio muove il
    // costo molto piu' del cambio, quindi si guarda quanto pesano davvero in €/L.
    //
    // SCOMPOSIZIONE ESATTA (le due parti sommate ridanno il delta totale):
    //   effPetrolio = brent di adesso al cambio VECCHIO, meno la chiusura precedente
    //   effCambio   = il resto, cioe' quanto ha spostato il solo cambio
    var brentOra  = Number(puntiB[2].v);
    var brentPrec = Number(puntiB[1].v);
    var camOra    = Number(puntiC[2].v);
    var camPrec   = Number(puntiC[1].v);

    var petPrec  = brentPrec / 158.987 / camPrec;
    var petCamFermo = brentOra / 158.987 / camPrec;
    var effPetrolio = petCamFermo - petPrec;
    var effCambio   = pet - petCamFermo;
    var deltaEuroL  = pet - petPrec;

    var litri = 35000;
    var eff = deltaEuroL * litri;

    // Sotto questa cifra spostare un carico costa piu' in rotture di magazzino
    // che in risparmio: il consiglio deve dire di stare fermi.
    var MKT_SOGLIA_EURO = 350;

    var pctB = brentPrec ? (brentOra - brentPrec) / brentPrec * 100 : 0;
    var pctC = camPrec ? (camOra - camPrec) / camPrec * 100 : 0;

    function _mktSeg(n, d) {
      return (n >= 0 ? '+' : '\u2212') + Math.abs(n).toFixed(d);
    }

    // Racconto dei due fattori, uno per riga.
    var rigaPet = 'Brent <strong style="font-family:var(--font-mono)">' + brentPrec.toFixed(2)
      + ' \u2192 ' + brentOra.toFixed(2) + '</strong> $/barile (' + _mktSeg(pctB, 2) + '%): '
      + (effPetrolio > 0 ? 'spinge il costo in su' : (effPetrolio < 0 ? 'spinge il costo in giu' : 'fermo'))
      + ' di <strong style="font-family:var(--font-mono)">' + _mktSeg(effPetrolio, 4) + ' &euro;/L</strong>.';

    var rigaCam = 'Cambio <strong style="font-family:var(--font-mono)">' + camPrec.toFixed(4)
      + ' \u2192 ' + camOra.toFixed(4) + '</strong> (' + _mktSeg(pctC, 2) + '%): '
      + (effCambio < 0 ? 'l\'euro si rafforza e, siccome il petrolio si compra in dollari, restituisce'
        : (effCambio > 0 ? 'l\'euro si indebolisce e aggiunge' : 'il cambio non sposta niente,'))
      + ' <strong style="font-family:var(--font-mono)">' + _mktSeg(effCambio, 4) + ' &euro;/L</strong>.';

    // I due fattori si compensano davvero solo se tirano in direzioni opposte
    // E il risultato netto resta sotto soglia.
    var opposti = (effPetrolio > 0 && effCambio < 0) || (effPetrolio < 0 && effCambio > 0);
    var sottoSoglia = Math.abs(eff) < MKT_SOGLIA_EURO;

    var cfg, consiglio;
    if (sottoSoglia) {
      consiglio = '<strong>Consiglio non vincolante:</strong> lo scarto resta sotto la soglia di '
        + MKT_SOGLIA_EURO + ' &euro; a carico. Non vale la pena anticipare o rinviare: '
        + 'spostare un carico per questa cifra costa piu\' in rotture di magazzino che in risparmio.';
      cfg = { bg: '#FAEEDA', bordo: '#BA7517', col: '#854F0B',
              tit: '&#9878; ' + (opposti ? 'I due fattori si compensano' : 'Movimento sotto soglia'),
              txt: rigaPet + '<br/>' + rigaCam };
    } else if (eff > 0) {
      consiglio = '<strong>Consiglio non vincolante:</strong> i segnali puntano al rialzo. '
        + 'Se devi caricare per il deposito nei prossimi giorni, va ragionata la possibilita\' di <strong>anticipare</strong> l\'acquisto.';
      cfg = { bg: '#FCEBEB', bordo: '#E24B4A', col: '#A32D2D',
              tit: '&#128070; Costo in salita' + (opposti ? ' \u2014 il cambio attutisce' : ''),
              txt: rigaPet + '<br/>' + rigaCam };
    } else {
      consiglio = '<strong>Consiglio non vincolante:</strong> i segnali puntano al ribasso. '
        + 'Se hai un carico programmato, va ragionata la possibilita\' di <strong>rinviarlo</strong> di qualche giorno.';
      cfg = { bg: '#EAF3DE', bordo: '#639922', col: '#27500A',
              tit: '&#128071; Costo in calo' + (opposti ? ' \u2014 il petrolio frena la discesa' : ''),
              txt: rigaPet + '<br/>' + rigaCam };
    }
    cfg.consiglio = consiglio;

    h += '<div style="margin-top:14px;background:' + cfg.bg + ';border:0.5px solid ' + cfg.bordo + ';border-left:5px solid ' + cfg.bordo + ';border-radius:12px;padding:16px 18px">';
    h += '<div style="font-size:17px;font-weight:700;color:' + cfg.col + ';margin-bottom:8px">' + cfg.tit + '</div>';
    h += '<div style="font-size:13.5px;color:' + cfg.col + ';line-height:1.75">' + cfg.txt + '</div>';
    h += '<div style="font-size:13px;color:' + cfg.col + ';margin-top:10px;padding-top:10px;border-top:0.5px solid ' + cfg.bordo + '">';
    h += 'Effetto netto <strong style="font-family:var(--font-mono)">' + _mktSeg(deltaEuroL, 4) + ' &euro;/L</strong>'
       + ' &middot; sul carico da ' + litri.toLocaleString('it-IT') + ' L: '
       + '<strong style="font-family:var(--font-mono);font-size:16px">' + (eff >= 0 ? '+' : '\u2212')
       + Math.abs(eff).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' &euro;</strong>';
    h += '</div>';
    h += '<div style="font-size:13px;color:' + cfg.col + ';margin-top:10px;line-height:1.65">' + cfg.consiglio + '</div>';
    h += '<div style="font-size:11px;color:' + cfg.col + ';opacity:0.8;margin-top:10px">Stima sul valore di adesso, non sulla chiusura. Il numero buono arriva alle 17:30. Soglia di intervento ' + MKT_SOGLIA_EURO + ' &euro; a carico.</div>';
    h += '</div>';

    h += '<div style="display:flex;gap:22px;flex-wrap:wrap;margin-top:12px;font-size:12.5px;color:var(--text-muted)">';
    h += '<span>Petrolio <strong style="font-family:var(--font-mono);color:var(--text)">' + pet.toFixed(4) + '</strong> &euro;/L</span>';
    if (acc) h += '<span>con accisa <strong style="font-family:var(--font-mono);color:var(--text)">' + (pet + acc.applicata).toFixed(4) + '</strong> &euro;/L</span>';
    h += '<span style="margin-left:auto"><button onclick="mktStampaSguardo()" style="font-size:12px;padding:7px 15px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">&#128424; Stampa o salva in PDF</button></span>';
    h += '</div></div>';

    _mktSguardo = { ora: ora, brent: puntiB, cambio: puntiC, pet: pet,
                    accisa: acc ? acc.applicata : null, cfg: cfg, eff: eff, litri: litri };

    // v20260803g — Sotto i due grafici va SUBITO la valutazione sui prezzi:
    // come si e mosso il mercato adesso, e cosa vuol dire sul prossimo
    // listino. Un blocco solo, senza i KPI e la legenda in mezzo. Quando si
    // chiude lo sguardo la previsione torna al suo posto piu in basso.
    var prev = document.getElementById('mkt-card-prev');
    if (prev) { h += prev.outerHTML; prev.style.display = 'none'; }

    if (box) box.innerHTML = h;
    if (graf) graf.style.display = 'none';
  } catch (e) {
    var msg = (e && e.message) || String(e);
    if (box) box.innerHTML = '<div style="margin-bottom:14px;font-size:12px;color:#A32D2D">&#10005; ' + esc(msg) + '</div>';
    if (graf) graf.style.display = '';
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '&#128065; Guarda adesso'; }
  }
}

function mktChiudiSguardo() {
  var box = document.getElementById('mkt-ora-box');
  var graf = document.getElementById('mkt-card-graf');
  if (box) box.innerHTML = '';
  if (graf) graf.style.display = '';
  var prev = document.getElementById('mkt-card-prev');
  if (prev) prev.style.display = '';
}

// Foglio stampabile: si apre in una finestra pulita e si salva in PDF dal
// dialogo di stampa. Nessuna libreria, come la stampa dell'estratto conto.
// v20260803e — Nel foglio ci vanno SOLO I GRAFICI E L'ANDAMENTO (regola sua
// del 03/08): niente prezzo atteso, niente consiglio sui carichi. Chi lo
// riceve deve vedere come si sono mossi Brent e cambio, punto.
function mktStampaSguardo() {
  var S = _mktSguardo;
  if (!S) { if (typeof toast === 'function') toast('Premi prima "Guarda adesso"'); return; }
  var oggi = new Date().toLocaleDateString('it-IT');

  var blocco = function (titolo, punti, dec) {
    var ora = punti[punti.length - 1].v, prec = punti[punti.length - 2].v;
    var delta = ora - prec, pct = prec ? delta / Math.abs(prec) * 100 : 0;
    var col = delta < 0 ? '#A32D2D' : (delta > 0 ? '#27500A' : '#666');
    var frec = Math.abs(delta) < 1e-9 ? '=' : (delta < 0 ? '\u25bc' : '\u25b2');
    var b = '<div class="blk">';
    b += '<div class="tit">' + titolo + '</div>';
    b += '<div class="val">' + ora.toFixed(dec)
       + ' <span style="color:' + col + ';font-size:15px">' + frec + ' ' + (delta >= 0 ? '+' : '') + delta.toFixed(dec)
       + ' <span style="font-size:12px">(' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%)</span></span></div>';
    b += _mktSpark(punti, col === '#666' ? '#8E8CA8' : col, true);
    b += '<table class="t"><tr>'
       + punti.map(function (p) { return '<th>' + p.lab + '</th>'; }).join('') + '</tr><tr>'
       + punti.map(function (p) { return '<td>' + p.v.toFixed(dec) + '</td>'; }).join('') + '</tr></table>';
    return b + '</div>';
  };

  var w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Il browser ha bloccato la finestra: consenti i popup e riprova'); return; }
  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Andamento mercato ' + oggi + '</title><style>'
    + 'body{font-family:Calibri,Arial,sans-serif;color:#222;margin:2cm;font-size:13px}'
    + 'h1{font-size:19px;margin:0 0 2px}.sub{color:#666;font-size:12px;margin-bottom:22px}'
    + '.blk{margin-bottom:26px;page-break-inside:avoid}'
    + '.tit{font-size:13px;color:#555;margin-bottom:2px}'
    + '.val{font-size:26px;font-weight:700;font-family:Consolas,monospace;margin-bottom:6px}'
    + 'table.t{width:100%;border-collapse:collapse;margin-top:6px}'
    + 'table.t th{font-size:10px;color:#888;font-weight:400;border-bottom:1px solid #ddd;padding:4px 6px;text-align:center}'
    + 'table.t td{font-family:Consolas,monospace;font-size:13px;padding:5px 6px;text-align:center}'
    + '.note{color:#777;font-size:11px;margin-top:26px;border-top:1px solid #eee;padding-top:10px}'
    + '@media print{body{margin:1.6cm}}'
    + '</style></head><body>';
  doc += '<h1>Phoenix Fuel &mdash; andamento del mercato</h1>';
  doc += '<div class="sub">' + oggi + ' alle ' + S.ora + ' &middot; rilevazione infragiornaliera, non e la chiusura ufficiale</div>';
  doc += blocco('Brent ICE &mdash; dollari al barile', S.brent, 2);
  doc += blocco('Cambio EUR / USD', S.cambio, 4);
  doc += '<div class="note">Ultime due chiusure e valore delle ' + S.ora + '. Documento generato da PhoenixFuel.</div>';
  doc += '</body></html>';
  w.document.write(doc);
  w.document.close();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}
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

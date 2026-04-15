// PhoenixFuel — M2: Test automatizzati + M3: Notifiche push

var _testResults = [];

async function eseguiTestAutomatizzati() {
  _testResults = [];
  var wrap = document.getElementById('test-risultati');
  if (wrap) wrap.innerHTML = '<div class="loading">Esecuzione test in corso...</div>';
  toast('Test in corso...');
  await _testPrezzoCalcoli();
  await _testMarginiOrdini();
  await _testFidoClienti();
  await _testCMPStazione();
  await _testCoerenzaReport();
  await _testOrdiniAnomali();
  _renderTestResults(wrap);
}

async function _testPrezzoCalcoli() {
  var o = { costo_litro:1.25, trasporto_litro:0.018, margine:0.05, iva:22 };
  var an = 1.25+0.018+0.05, ai = an*1.22;
  _testResults.push({ nome:'prezzoNoIva calcolo', ok:Math.abs(prezzoNoIva(o)-an)<0.0001, atteso:an.toFixed(4), ottenuto:prezzoNoIva(o).toFixed(4) });
  _testResults.push({ nome:'prezzoConIva calcolo', ok:Math.abs(prezzoConIva(o)-ai)<0.001, atteso:ai.toFixed(4), ottenuto:prezzoConIva(o).toFixed(4) });
}

async function _testMarginiOrdini() {
  var {data:ordini} = await sb.from('ordini').select('margine,costo_litro').eq('tipo_ordine','cliente').neq('stato','annullato').limit(2000);
  var neg=0, alti=0, noCosto=0;
  (ordini||[]).forEach(function(o){if(Number(o.margine)<0)neg++;if(Number(o.margine)>0.20)alti++;if(Number(o.costo_litro)===0)noCosto++;});
  _testResults.push({nome:'Ordini margine negativo',ok:neg===0,atteso:'0',ottenuto:String(neg),note:neg>0?'Ordini con margine < 0':''});
  _testResults.push({nome:'Ordini margine > 0.20 €/L',ok:alti===0,atteso:'0',ottenuto:String(alti),note:alti>0?'Margini molto alti — verificare':''});
  _testResults.push({nome:'Ordini senza costo_litro',ok:noCosto===0,atteso:'0',ottenuto:String(noCosto),note:noCosto>0?'Dati incompleti':''});
}

async function _testFidoClienti() {
  var {data:clienti}=await sb.from('clienti').select('id,nome,fido_max');
  var {data:ordini}=await sb.from('ordini').select('cliente,cliente_id,costo_litro,trasporto_litro,margine,iva,litri').eq('tipo_ordine','cliente').neq('stato','annullato').eq('pagato',false);
  var conFido=(clienti||[]).filter(function(c){return Number(c.fido_max)>0;}), sforati=0;
  conFido.forEach(function(c){var imp=0;(ordini||[]).forEach(function(o){if(o.cliente_id===c.id||o.cliente===c.nome)imp+=prezzoConIva(o)*Number(o.litri);});if(imp>Number(c.fido_max)*1.1)sforati++;});
  _testResults.push({nome:'Clienti con fido configurato',ok:conFido.length>0,atteso:'> 0',ottenuto:String(conFido.length)});
  _testResults.push({nome:'Clienti fido sforato > 110%',ok:sforati===0,atteso:'0',ottenuto:String(sforati),note:sforati>0?sforati+' clienti oltre il fido':''});
}

async function _testCMPStazione() {
  var oggi=new Date().toISOString().split('T')[0], meseFa=new Date(Date.now()-30*86400000).toISOString().split('T')[0];
  var {data:costi}=await sb.from('stazione_costi').select('data,prodotto,costo_litro').gte('data',meseFa).lte('data',oggi);
  var {data:prezzi}=await sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data',meseFa).lte('data',oggi);
  var gcosti=new Set((costi||[]).map(function(c){return c.data;}));
  var gprezzi=new Set((prezzi||[]).map(function(p){return p.data;}));
  _testResults.push({nome:'Giorni CMP inserito (30gg)',ok:gcosti.size>0,atteso:'> 0',ottenuto:String(gcosti.size)});
  _testResults.push({nome:'Giorni prezzi pompa (30gg)',ok:gprezzi.size>0,atteso:'> 0',ottenuto:String(gprezzi.size)});
  var margNeg=0;(costi||[]).forEach(function(c){var p=(prezzi||[]).find(function(p){return p.data===c.data&&p.prodotto===c.prodotto;});if(p&&Number(c.costo_litro)>=Number(p.prezzo_litro))margNeg++;});
  _testResults.push({nome:'Giorni CMP >= prezzo pompa (margine negativo)',ok:margNeg===0,atteso:'0',ottenuto:String(margNeg),note:margNeg>0?'Stazione vende sotto costo!':''});
}

async function _testCoerenzaReport() {
  var anno=new Date().getFullYear(), da=anno+'-01-01', a=anno+'-12-31';
  var allOrd=[], from=0;
  while(true){var{data:b}=await sb.from('ordini').select('litri,costo_litro,trasporto_litro,margine,iva').eq('tipo_ordine','cliente').neq('stato','annullato').gte('data',da).lte('data',a).range(from,from+999);if(!b||!b.length)break;allOrd=allOrd.concat(b);if(b.length<1000)break;from+=1000;}
  var margS=0, fattN=0, costoT=0;
  allOrd.forEach(function(o){margS+=Number(o.margine)*Number(o.litri);fattN+=prezzoNoIva(o)*Number(o.litri);costoT+=(Number(o.costo_litro)+Number(o.trasporto_litro))*Number(o.litri);});
  var margC=fattN-costoT, diff=Math.abs(margS-margC);
  _testResults.push({nome:'Ordini '+anno+' caricati (paginazione)',ok:allOrd.length>0,atteso:'> 0',ottenuto:String(allOrd.length)});
  _testResults.push({nome:'Quadratura: SUM(margine×litri) = fatt − costo',ok:diff<1,atteso:fmtE(margS),ottenuto:fmtE(margC),note:diff>=1?'Scarto € '+fmtE(diff):'Perfetto'});
}

async function _testOrdiniAnomali() {
  var {data:ordini}=await sb.from('ordini').select('data,cliente,prodotto,litri').eq('tipo_ordine','cliente').neq('stato','annullato');
  var chiavi={}, numD=0;
  (ordini||[]).forEach(function(o){var k=o.data+'|'+o.cliente+'|'+o.prodotto+'|'+o.litri;chiavi[k]=(chiavi[k]||0)+1;});
  // Soglia 3+: 2 consegne identiche stesso giorno sono normali per grossisti (AP, ENNEGI, Stil.Tra ecc.).
  Object.values(chiavi).forEach(function(v){if(v>2)numD+=v-1;});
  _testResults.push({nome:'Ordini sospetti (3+ identici stesso giorno)',ok:numD<5,atteso:'< 5',ottenuto:String(numD),note:numD>0?numD+' con 3+ righe stessa data/cliente/prodotto/litri':''});
}

function _renderTestResults(wrap) {
  if(!wrap)return;
  var ok=_testResults.filter(function(t){return t.ok;}).length, ko=_testResults.length-ok;
  var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div style="font-size:14px;font-weight:500">'+_testResults.length+' test eseguiti</div><div style="display:flex;gap:8px"><span style="padding:4px 12px;border-radius:6px;font-size:12px;font-weight:500;background:#EAF3DE;color:#27500A">✅ '+ok+' passati</span>';
  if(ko>0)h+='<span style="padding:4px 12px;border-radius:6px;font-size:12px;font-weight:500;background:#FCEBEB;color:#791F1F">❌ '+ko+' falliti</span>';
  h+='</div></div>';
  h+='<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="text-align:left;padding:5px 8px;border:0.5px solid var(--border);background:var(--bg)">Test</th><th style="padding:5px 8px;border:0.5px solid var(--border);background:var(--bg);width:50px">Esito</th><th style="padding:5px 8px;border:0.5px solid var(--border);background:var(--bg);text-align:right">Atteso</th><th style="padding:5px 8px;border:0.5px solid var(--border);background:var(--bg);text-align:right">Ottenuto</th><th style="padding:5px 8px;border:0.5px solid var(--border);background:var(--bg)">Note</th></tr></thead><tbody>';
  _testResults.forEach(function(t){var bg=t.ok?'':'background:#FCEBEB';h+='<tr style="'+bg+'"><td style="padding:4px 8px;border:0.5px solid var(--border);font-weight:500">'+t.nome+'</td><td style="padding:4px 8px;border:0.5px solid var(--border);text-align:center">'+(t.ok?'✅':'❌')+'</td><td style="padding:4px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right">'+(t.atteso||'')+'</td><td style="padding:4px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;color:'+(t.ok?'#639922':'#E24B4A')+'">'+(t.ottenuto||'')+'</td><td style="padding:4px 8px;border:0.5px solid var(--border);font-size:10px;color:var(--text-muted)">'+(t.note||'')+'</td></tr>';});
  h+='</tbody></table><div style="font-size:10px;color:var(--text-muted);margin-top:6px;text-align:right">'+new Date().toLocaleString('it-IT')+'</div>';
  wrap.innerHTML=h;
  toast(ko===0?'Tutti i '+_testResults.length+' test passati!':ko+' test falliti su '+_testResults.length);
}

// Fine test automatizzati

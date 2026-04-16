// PhoenixFuel — M2: Test automatizzati + M3: Notifiche push
// ═══════════════════════════════════════════════════════════════════
// Ogni test può popolare `items` con record problematici per ispezione.
// In UI compare link "🔍 Ispeziona" che apre modale con lista+suggerimenti.
// ═══════════════════════════════════════════════════════════════════

var _testResults = [];
window._testItemsMap = {}; // chiave: nomeTest, valore: array items

async function eseguiTestAutomatizzati() {
  _testResults = [];
  window._testItemsMap = {};
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

function _pushTest(t) {
  _testResults.push(t);
  if (t.items && t.items.length) window._testItemsMap[t.nome] = t.items;
}

async function _testPrezzoCalcoli() {
  var o = { costo_litro:1.25, trasporto_litro:0.018, margine:0.05, iva:22 };
  var an = 1.25+0.018+0.05, ai = an*1.22;
  _pushTest({ nome:'prezzoNoIva calcolo', ok:Math.abs(prezzoNoIva(o)-an)<0.0001, atteso:an.toFixed(4), ottenuto:prezzoNoIva(o).toFixed(4) });
  _pushTest({ nome:'prezzoConIva calcolo', ok:Math.abs(prezzoConIva(o)-ai)<0.001, atteso:ai.toFixed(4), ottenuto:prezzoConIva(o).toFixed(4) });
}

async function _testMarginiOrdini() {
  var {data:ordini} = await sb.from('ordini').select('id,data,cliente,prodotto,litri,margine,costo_litro').eq('tipo_ordine','cliente').neq('stato','annullato').limit(2000);
  var neg=[], alti=[], noCosto=[];
  (ordini||[]).forEach(function(o){
    if(Number(o.margine)<0) neg.push(o);
    if(Number(o.margine)>0.20) alti.push(o);
    if(Number(o.costo_litro)===0) noCosto.push(o);
  });
  _pushTest({
    nome:'Ordini margine negativo', ok:neg.length===0,
    atteso:'0', ottenuto:String(neg.length),
    note:neg.length>0?'Ordini con margine < 0':'',
    items: neg.map(function(o){return {id:o.id,data:o.data,cliente:o.cliente,prodotto:o.prodotto,litri:o.litri,valore:'margine € '+Number(o.margine).toFixed(4)};}),
    suggerimento:'Vai in Ordini → apri ordine → modifica margine. Se import sbagliato: cancella e reinserisci con prezzo corretto.'
  });
  _pushTest({
    nome:'Ordini margine > 0.20 €/L', ok:alti.length===0,
    atteso:'0', ottenuto:String(alti.length),
    note:alti.length>0?'Margini molto alti — verificare':'',
    items: alti.map(function(o){return {id:o.id,data:o.data,cliente:o.cliente,prodotto:o.prodotto,litri:o.litri,valore:'margine € '+Number(o.margine).toFixed(4)};}),
    suggerimento:'Margini > 20 cent/L sono rari. Verifica che il prezzo di vendita sia corretto (non dimezzato lo sconto, etc).'
  });
  _pushTest({
    nome:'Ordini senza costo_litro', ok:noCosto.length===0,
    atteso:'0', ottenuto:String(noCosto.length),
    note:noCosto.length>0?'Dati incompleti':'',
    items: noCosto.map(function(o){return {id:o.id,data:o.data,cliente:o.cliente,prodotto:o.prodotto,litri:o.litri,valore:'costo mancante'};}),
    suggerimento:'Apri ordine e inserisci costo/L. Se storico vecchio puoi lasciare 0 o usare CMP medio mese.'
  });
}

async function _testFidoClienti() {
  var {data:clienti}=await sb.from('clienti').select('id,nome,fido_massimo,giorni_pagamento');
  var {data:ordini}=await sb.from('ordini').select('id,data,cliente,cliente_id,costo_litro,trasporto_litro,margine,iva,litri,giorni_pagamento').eq('tipo_ordine','cliente').neq('stato','annullato').eq('pagato',false);
  var conFido=(clienti||[]).filter(function(c){return Number(c.fido_massimo)>0;}), sforati=[];
  var oggiD = new Date(); oggiD.setHours(0,0,0,0);
  conFido.forEach(function(c){
    var imp=0;
    (ordini||[]).forEach(function(o){
      if(o.cliente_id===c.id||o.cliente===c.nome){
        var ggPag = Number(c.giorni_pagamento||30);
        var scad = new Date(o.data); scad.setDate(scad.getDate()+ggPag);
        if (scad <= oggiD) return; // scaduta: non conta (Opzione A)
        imp+=prezzoConIva(o)*Number(o.litri);
      }
    });
    if(imp>Number(c.fido_massimo)*1.1) sforati.push({id:c.id,nome:c.nome,fidoMax:Number(c.fido_massimo),esposizione:imp,pct:Math.round(imp/Number(c.fido_massimo)*100)});
  });
  _pushTest({nome:'Clienti con fido configurato',ok:conFido.length>0,atteso:'> 0',ottenuto:String(conFido.length)});
  _pushTest({
    nome:'Clienti fido sforato > 110%', ok:sforati.length===0,
    atteso:'0', ottenuto:String(sforati.length),
    note:sforati.length>0?sforati.length+' clienti oltre il fido':'',
    items: sforati.map(function(s){return {id:s.id,data:'',cliente:s.nome,prodotto:'',litri:0,valore:'€ '+s.esposizione.toFixed(0)+' ('+s.pct+'%) su fido € '+s.fidoMax.toFixed(0)};}),
    suggerimento:'Vai in Clienti → apri scheda cliente → vedi ordini non pagati. Sollecita pagamento o aumenta fido se giustificato.'
  });
}

async function _testCMPStazione() {
  var oggi=new Date().toISOString().split('T')[0], meseFa=new Date(Date.now()-30*86400000).toISOString().split('T')[0];
  var {data:costi}=await sb.from('stazione_costi').select('data,prodotto,costo_litro').gte('data',meseFa).lte('data',oggi);
  var {data:prezzi}=await sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data',meseFa).lte('data',oggi);
  var gcosti=new Set((costi||[]).map(function(c){return c.data;}));
  var gprezzi=new Set((prezzi||[]).map(function(p){return p.data;}));
  _pushTest({nome:'Giorni CMP inserito (30gg)',ok:gcosti.size>0,atteso:'> 0',ottenuto:String(gcosti.size)});
  _pushTest({nome:'Giorni prezzi pompa (30gg)',ok:gprezzi.size>0,atteso:'> 0',ottenuto:String(gprezzi.size)});
  var margNeg=[];
  (costi||[]).forEach(function(c){
    var p=(prezzi||[]).find(function(p){return p.data===c.data&&p.prodotto===c.prodotto;});
    if(p&&Number(c.costo_litro)>=Number(p.prezzo_litro)/1.22){
      margNeg.push({data:c.data,prodotto:c.prodotto,costo:Number(c.costo_litro),prezzoNet:Number(p.prezzo_litro)/1.22});
    }
  });
  _pushTest({
    nome:'Stazione: costo >= prezzo netto (margine negativo)', ok:margNeg.length===0,
    atteso:'0', ottenuto:String(margNeg.length),
    note:margNeg.length>0?'Stazione vende sotto costo!':'',
    items: margNeg.map(function(m){return {id:m.data+'_'+m.prodotto,data:m.data,cliente:m.prodotto,prodotto:'',litri:0,valore:'costo '+m.costo.toFixed(3)+' >= prezzo netto '+m.prezzoNet.toFixed(3)};}),
    suggerimento:'Vai in Stazione → Marginalità → frecce ← → fino alla data problematica. Verifica che il costo sia corretto o aumenta il prezzo pompa.'
  });
}

async function _testCoerenzaReport() {
  var anno=new Date().getFullYear(), da=anno+'-01-01', a=anno+'-12-31';
  var allOrd=[], from=0;
  while(true){var{data:b}=await sb.from('ordini').select('id,data,cliente,prodotto,litri,costo_litro,trasporto_litro,margine,iva').eq('tipo_ordine','cliente').neq('stato','annullato').gte('data',da).lte('data',a).range(from,from+999);if(!b||!b.length)break;allOrd=allOrd.concat(b);if(b.length<1000)break;from+=1000;}
  var margS=0, fattN=0, costoT=0;
  var scarti=[];
  allOrd.forEach(function(o){
    var ms = Number(o.margine)*Number(o.litri);
    var fn = prezzoNoIva(o)*Number(o.litri);
    var ct = (Number(o.costo_litro)+Number(o.trasporto_litro))*Number(o.litri);
    var mc = fn - ct;
    margS += ms; fattN += fn; costoT += ct;
    if (Math.abs(ms - mc) > 0.5) {
      scarti.push({id:o.id,data:o.data,cliente:o.cliente,prodotto:o.prodotto,litri:o.litri,valore:'margine€'+ms.toFixed(2)+' vs calc€'+mc.toFixed(2)+' (Δ'+(ms-mc).toFixed(2)+')'});
    }
  });
  var margC=fattN-costoT, diff=Math.abs(margS-margC);
  _pushTest({nome:'Ordini '+anno+' caricati (paginazione)',ok:allOrd.length>0,atteso:'> 0',ottenuto:String(allOrd.length)});
  _pushTest({
    nome:'Quadratura: SUM(margine×litri) = fatt − costo',
    ok:diff<1, atteso:fmtE(margS), ottenuto:fmtE(margC),
    note:diff>=1?'Scarto € '+diff.toFixed(2):'Perfetto',
    items: scarti.slice(0, 100),  // max 100 per non bloccare modale
    suggerimento: diff>=1 ? 'Alcuni ordini hanno margine salvato diverso dal calcolato (prezzo-costo). Aprili e ricalcola, o usa la sanatoria SQL.' : ''
  });
}

async function _testOrdiniAnomali() {
  var {data:ordini}=await sb.from('ordini').select('id,data,cliente,prodotto,litri').eq('tipo_ordine','cliente').neq('stato','annullato');
  var chiavi={}, sospetti=[];
  (ordini||[]).forEach(function(o){var k=o.data+'|'+o.cliente+'|'+o.prodotto+'|'+o.litri;if(!chiavi[k])chiavi[k]=[];chiavi[k].push(o);});
  Object.keys(chiavi).forEach(function(k){
    if(chiavi[k].length>2) sospetti = sospetti.concat(chiavi[k]);
  });
  _pushTest({
    nome:'Ordini sospetti (3+ identici stesso giorno)', ok:sospetti.length<5,
    atteso:'< 5', ottenuto:String(sospetti.length),
    note:sospetti.length>0?sospetti.length+' con 3+ righe stessa data/cliente/prodotto/litri':'',
    items: sospetti.map(function(o){return {id:o.id,data:o.data,cliente:o.cliente,prodotto:o.prodotto,litri:o.litri,valore:''};}),
    suggerimento:'3+ ordini identici stessa data sono rari. Controlla in Ordini o Storico consegne: se sono duplicati da import cancella i più vecchi.'
  });
}

function _renderTestResults(wrap) {
  if(!wrap)return;
  var ok=_testResults.filter(function(t){return t.ok;}).length, ko=_testResults.length-ok;
  var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div style="font-size:14px;font-weight:500">'+_testResults.length+' test eseguiti</div><div style="display:flex;gap:8px"><span style="padding:4px 12px;border-radius:6px;font-size:12px;font-weight:500;background:#EAF3DE;color:#27500A">✅ '+ok+' passati</span>';
  if(ko>0)h+='<span style="padding:4px 12px;border-radius:6px;font-size:12px;font-weight:500;background:#FCEBEB;color:#791F1F">❌ '+ko+' falliti</span>';
  h+='</div></div>';
  h+='<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="text-align:left;padding:5px 8px;border:0.5px solid var(--border);background:var(--bg)">Test</th><th style="padding:5px 8px;border:0.5px solid var(--border);background:var(--bg);width:50px">Esito</th><th style="padding:5px 8px;border:0.5px solid var(--border);background:var(--bg);text-align:right">Atteso</th><th style="padding:5px 8px;border:0.5px solid var(--border);background:var(--bg);text-align:right">Ottenuto</th><th style="padding:5px 8px;border:0.5px solid var(--border);background:var(--bg)">Note / Ispeziona</th></tr></thead><tbody>';
  _testResults.forEach(function(t){
    var bg=t.ok?'':'background:#FCEBEB';
    var hasItems = !t.ok && window._testItemsMap[t.nome] && window._testItemsMap[t.nome].length;
    var noteHtml = (t.note||'');
    if (hasItems) {
      var nomeEsc = String(t.nome).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      noteHtml = '<div>'+noteHtml+'</div><button onclick="apriDettaglioTest(\''+nomeEsc+'\')" style="margin-top:4px;font-size:10px;padding:3px 10px;background:#A32D2D;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:500">🔍 Ispeziona '+window._testItemsMap[t.nome].length+' record</button>';
    }
    h+='<tr style="'+bg+'"><td style="padding:4px 8px;border:0.5px solid var(--border);font-weight:500">'+t.nome+'</td><td style="padding:4px 8px;border:0.5px solid var(--border);text-align:center">'+(t.ok?'✅':'❌')+'</td><td style="padding:4px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right">'+(t.atteso||'')+'</td><td style="padding:4px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;color:'+(t.ok?'#639922':'#E24B4A')+'">'+(t.ottenuto||'')+'</td><td style="padding:4px 8px;border:0.5px solid var(--border);font-size:10px;color:var(--text-muted)">'+noteHtml+'</td></tr>';
  });
  h+='</tbody></table><div style="font-size:10px;color:var(--text-muted);margin-top:6px;text-align:right">'+new Date().toLocaleString('it-IT')+'</div>';
  wrap.innerHTML=h;
  toast(ko===0?'Tutti i '+_testResults.length+' test passati!':ko+' test falliti su '+_testResults.length);
}

// ── MODALE DETTAGLIO TEST FALLITO ──
function apriDettaglioTest(nomeTest) {
  var items = window._testItemsMap[nomeTest] || [];
  var test = _testResults.find(function(t){return t.nome===nomeTest;});
  var sugg = test && test.suggerimento ? test.suggerimento : '';
  var h = '<div style="font-size:16px;font-weight:600;margin-bottom:8px;color:#791F1F">🔍 '+esc(nomeTest)+'</div>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">'+items.length+' record da controllare</div>';
  if (sugg) {
    h += '<div style="background:#FAEEDA;border-left:3px solid #BA7517;padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:12px;font-size:12px;line-height:1.4"><strong>💡 Come risolvere:</strong><br>'+esc(sugg)+'</div>';
  }
  h += '<div style="max-height:400px;overflow-y:auto;border:0.5px solid var(--border);border-radius:8px"><table style="width:100%;font-size:11px;border-collapse:collapse"><thead><tr style="background:var(--bg);position:sticky;top:0"><th style="padding:6px 10px;text-align:left;font-weight:500">Data</th><th style="padding:6px 10px;text-align:left;font-weight:500">Cliente/Prodotto</th><th style="padding:6px 10px;text-align:right;font-weight:500">Litri</th><th style="padding:6px 10px;text-align:left;font-weight:500">Problema</th><th style="padding:6px 10px;text-align:center;font-weight:500">ID</th></tr></thead><tbody>';
  items.forEach(function(it) {
    var idShort = String(it.id||'').substring(0,8);
    h += '<tr style="border-top:0.5px solid var(--border)">';
    h += '<td style="padding:5px 10px;font-family:var(--font-mono)">'+esc(it.data||'-')+'</td>';
    h += '<td style="padding:5px 10px">'+esc(it.cliente||it.prodotto||'-')+'</td>';
    h += '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono)">'+(it.litri?Number(it.litri).toLocaleString('it-IT'):'-')+'</td>';
    h += '<td style="padding:5px 10px;font-size:10px">'+esc(it.valore||'-')+'</td>';
    h += '<td style="padding:5px 10px;text-align:center"><code style="font-size:9px;background:var(--bg);padding:1px 4px;border-radius:3px;cursor:pointer" onclick="navigator.clipboard.writeText(\''+esc(String(it.id||''))+'\');toast(\'ID copiato\')" title="Clicca per copiare">'+esc(idShort)+'...</code></td>';
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  h += '<div style="display:flex;gap:8px;margin-top:14px">';
  h += '<button onclick="esportaTestCSV(\''+String(nomeTest).replace(/'/g,"\\'")+'\')" class="btn-primary" style="font-size:12px;padding:6px 14px;background:#378ADD">📥 Esporta CSV</button>';
  h += '<button onclick="chiudiModalePermessi()" style="padding:6px 14px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer">Chiudi</button>';
  h += '</div>';
  apriModal(h);
}

function esportaTestCSV(nomeTest) {
  var items = window._testItemsMap[nomeTest] || [];
  if (!items.length) { toast('Nessun dato'); return; }
  var csv = 'Data,Cliente,Prodotto,Litri,Problema,ID\n';
  items.forEach(function(it) {
    var row = [it.data||'', it.cliente||'', it.prodotto||'', it.litri||'', (it.valore||'').replace(/,/g,';'), it.id||''];
    csv += row.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',') + '\n';
  });
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'test_' + nomeTest.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'') + '_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV scaricato');
}

// Fine test automatizzati

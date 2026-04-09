// PhoenixFuel — Stazione: Report mensili, Stampe, Export Excel
function initReportStazione() {
  var annoCorr = new Date().getFullYear();
  var meseCorr = String(new Date().getMonth()+1).padStart(2,'0');
  ['stz-rep-anno','stz-rep-cassa-anno','stz-rep-vend-anno'].forEach(function(id) {
    var sel = document.getElementById(id);
    if (sel && sel.options.length === 0) {
      for (var y = annoCorr; y >= annoCorr - 5; y--) sel.innerHTML += '<option value="' + y + '"' + (y===annoCorr?' selected':'') + '>' + y + '</option>';
    }
  });
  // Anno per report annuale vendite dettaglio
  var vdettAnno = document.getElementById('vdett-anno');
  if (vdettAnno && vdettAnno.options.length === 0) {
    for (var y = annoCorr; y >= annoCorr - 5; y--) vdettAnno.innerHTML += '<option value="' + y + '"' + (y===annoCorr?' selected':'') + '>' + y + '</option>';
  }
  ['stz-rep-mese','stz-rep-cassa-mese','stz-rep-vend-mese'].forEach(function(id) {
    var sel = document.getElementById(id);
    if (sel) sel.value = meseCorr;
  });
  var fgData = document.getElementById('fg-data');
  if (fgData && !fgData.value) fgData.value = oggiISO;
}

async function _caricaDatiCassaMese(anno, mese) {
  var da = anno + '-' + mese + '-01';
  var ultimoGiorno = new Date(Number(anno), Number(mese), 0).getDate();
  var a = anno + '-' + mese + '-' + String(ultimoGiorno).padStart(2,'0');
  var [cassaRes, speseRes] = await Promise.all([
    sb.from('stazione_cassa').select('*').gte('data', da).lte('data', a).order('data'),
    sb.from('stazione_spese_contanti').select('data,importo').gte('data', da).lte('data', a)
  ]);
  var casse = cassaRes.data || [];
  var speseMap = {};
  (speseRes.data || []).forEach(function(s) { speseMap[s.data] = (speseMap[s.data] || 0) + Number(s.importo); });
  return { casse: casse, speseMap: speseMap, da: da, a: a, ultimoGiorno: ultimoGiorno };
}

async function stampaReportCassaMensile() {
  var w = _apriReport("Report cassa mensile"); if (!w) return;
  var anno = document.getElementById('stz-rep-cassa-anno').value;
  var mese = document.getElementById('stz-rep-cassa-mese').value;
  if (!anno || !mese) { toast('Seleziona anno e mese'); return; }
  var meseNome = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1];

  toast('Generazione report cassa...');
  var r = await _caricaDatiCassaMese(anno, mese);
  var casse = r.casse, speseMap = r.speseMap;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report Cassa ' + meseNome + ' ' + anno + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:9px;margin:0;padding:6mm;color:#1a1a18}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:5mm}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#6B5FCC;color:#fff;padding:4px 3px;font-size:7px;text-transform:uppercase;letter-spacing:0.2px;border:1px solid #5A4FBB;text-align:right}' +
    'th:first-child{text-align:left}' +
    'td{padding:3px 4px;border:1px solid #ddd;font-size:9px;text-align:right;font-family:Courier New,monospace}' +
    'td:first-child{text-align:left;font-family:Arial,sans-serif;font-weight:500}' +
    '.tot{background:#f0f0f0;font-weight:bold}.tot td{border-top:2px solid #6B5FCC}' +
    '.alt{background:#fafaf8}' +
    '</style></head><body>';

  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6B5FCC;padding-bottom:8px;margin-bottom:10px">';
  html += '<div><div style="font-size:16px;font-weight:bold;color:#6B5FCC">REPORT CASSA MENSILE — STAZIONE OPPIDO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:2px">' + meseNome + ' ' + anno + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:13px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:8px;color:#666">Generato il ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  html += '<table><thead><tr>';
  html += '<th style="text-align:left;width:42px">Data</th>';
  html += '<th>Vendite tot.</th>';
  html += '<th style="background:#185FA5">Bancomat</th>';
  html += '<th style="background:#534AB7">Carte Nexi</th>';
  html += '<th style="background:#993C1D">Carte Aziend.</th>';
  html += '<th>Cred. emessi</th>';
  html += '<th>Cred. rimb.</th>';
  html += '<th>Rimb. gg prec</th>';
  html += '<th>Spese cont.</th>';
  html += '<th style="background:#3B6D11">Cont. versati</th>';
  html += '</tr></thead><tbody>';

  var totV=0, totB=0, totN=0, totA=0, totCE=0, totCR=0, totRP=0, totSP=0, totCV=0;

  casse.forEach(function(c, idx) {
    var gg = c.data.substring(8) + '/' + c.data.substring(5,7);
    var vendite = Number(c.totale_vendite||0);
    var banc = Number(c.bancomat||0);
    var nexi = Number(c.carte_nexi||0);
    var azien = Number(c.carte_aziendali||0);
    var ce = Number(c.crediti_emessi||0);
    var cr = Number(c.rimborsi_effettuati||0);
    var rp = Number(c.rimborsi_giorni_prec||0);
    var sp = speseMap[c.data] || 0;
    var cv = Number(c.versato||0);

    totV+=vendite; totB+=banc; totN+=nexi; totA+=azien; totCE+=ce; totCR+=cr; totRP+=rp; totSP+=sp; totCV+=cv;

    html += '<tr' + (idx%2 ? ' class="alt"' : '') + '>';
    html += '<td>' + gg + '</td>';
    html += '<td>' + fmtE(vendite) + '</td>';
    html += '<td>' + fmtE(banc) + '</td>';
    html += '<td>' + fmtE(nexi) + '</td>';
    html += '<td>' + fmtE(azien) + '</td>';
    html += '<td>' + (ce > 0 ? fmtE(ce) : '—') + '</td>';
    html += '<td>' + (cr > 0 ? fmtE(cr) : '—') + '</td>';
    html += '<td>' + (rp > 0 ? fmtE(rp) : '—') + '</td>';
    html += '<td>' + (sp > 0 ? fmtE(sp) : '—') + '</td>';
    html += '<td style="font-weight:bold;color:#3B6D11">' + fmtE(cv) + '</td>';
    html += '</tr>';
  });

  html += '<tr class="tot">';
  html += '<td>TOTALE</td>';
  html += '<td>' + fmtE(totV) + '</td>';
  html += '<td>' + fmtE(totB) + '</td>';
  html += '<td>' + fmtE(totN) + '</td>';
  html += '<td>' + fmtE(totA) + '</td>';
  html += '<td>' + fmtE(totCE) + '</td>';
  html += '<td>' + fmtE(totCR) + '</td>';
  html += '<td>' + fmtE(totRP) + '</td>';
  html += '<td>' + fmtE(totSP) + '</td>';
  html += '<td style="color:#3B6D11">' + fmtE(totCV) + '</td>';
  html += '</tr></tbody></table>';

  if (!casse.length) {
    html += '<div style="text-align:center;padding:20px;color:#888">Nessun dato cassa per ' + meseNome + ' ' + anno + '</div>';
  }

  html += '<div style="text-align:center;font-size:8px;color:#aaa;margin-top:10px;border-top:1px solid #ddd;padding-top:5px">PhoenixFuel Srl — Report cassa ' + meseNome + ' ' + anno + '</div>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button>';
  html += '</div></body></html>';

  w.document.open(); w.document.write(html); w.document.close();
}

async function esportaCassaExcel() {
  var anno = document.getElementById('stz-rep-cassa-anno').value;
  var mese = document.getElementById('stz-rep-cassa-mese').value;
  if (!anno || !mese) { toast('Seleziona anno e mese'); return; }
  var meseNome = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1];

  toast('Generazione Excel...');
  var r = await _caricaDatiCassaMese(anno, mese);
  var casse = r.casse, speseMap = r.speseMap;

  if (typeof XLSX === 'undefined') { toast('Libreria Excel non caricata. Ricarica la pagina.'); return; }

  var header = ['Data','Vendite totali','Bancomat','Carte Nexi','Carte Aziendali','Crediti emessi','Crediti rimborsati','Rimb. gg prec.','Spese contanti','Contanti versati'];
  var righe = [header];
  var totV=0, totB=0, totN=0, totA=0, totCE=0, totCR=0, totRP=0, totSP=0, totCV=0;

  casse.forEach(function(c) {
    var vendite = Number(c.totale_vendite||0);
    var banc = Number(c.bancomat||0);
    var nexi = Number(c.carte_nexi||0);
    var azien = Number(c.carte_aziendali||0);
    var ce = Number(c.crediti_emessi||0);
    var cr = Number(c.rimborsi_effettuati||0);
    var rp = Number(c.rimborsi_giorni_prec||0);
    var sp = speseMap[c.data] || 0;
    var cv = Number(c.versato||0);
    totV+=vendite; totB+=banc; totN+=nexi; totA+=azien; totCE+=ce; totCR+=cr; totRP+=rp; totSP+=sp; totCV+=cv;
    righe.push([c.data, vendite, banc, nexi, azien, ce, cr, rp, sp, cv]);
  });

  righe.push(['TOTALE', totV, totB, totN, totA, totCE, totCR, totRP, totSP, totCV]);

  var ws = XLSX.utils.aoa_to_sheet(righe);
  // Formatta colonne numeriche
  var range = XLSX.utils.decode_range(ws['!ref']);
  for (var R = 1; R <= range.e.r; R++) {
    for (var C = 1; C <= 9; C++) {
      var addr = XLSX.utils.encode_cell({r:R,c:C});
      if (ws[addr]) ws[addr].z = '#,##0.00';
    }
  }
  ws['!cols'] = [{wch:12},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14}];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cassa ' + meseNome);
  XLSX.writeFile(wb, 'ReportCassa_' + meseNome + '_' + anno + '.xlsx');
  toast('Excel generato!');
}

async function stampaReportMensileContatori() {
  var w = _apriReport("Report contatori mensile"); if (!w) return;
  var anno = document.getElementById('stz-rep-anno').value;
  var mese = document.getElementById('stz-rep-mese').value;
  if (!anno || !mese) { toast('Seleziona anno e mese'); return; }

  var da = anno + '-' + mese + '-01';
  var ultimoGiorno = new Date(Number(anno), Number(mese), 0).getDate();
  var a = anno + '-' + mese + '-' + String(ultimoGiorno).padStart(2,'0');
  var meseNome = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1];

  toast('Generazione report in corso...');

  var { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  var pompeIds = (pompe||[]).map(function(p){return p.id;});
  if (!pompeIds.length) { toast('Nessuna pompa configurata'); return; }

  var giornoPre = new Date(new Date(da).getTime()-86400000).toISOString().split('T')[0];
  var { data: letture } = await sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).gte('data',giornoPre).lte('data',a).order('data');

  var lettPerPompaData = {};
  (letture||[]).forEach(function(l){
    if (!lettPerPompaData[l.pompa_id]) lettPerPompaData[l.pompa_id] = {};
    lettPerPompaData[l.pompa_id][l.data] = l;
  });

  var giorni = [];
  for (var d = 1; d <= ultimoGiorno; d++) {
    giorni.push(anno + '-' + mese + '-' + String(d).padStart(2,'0'));
  }

  var nPompe = pompe.length;
  var colTotale = 1 + (nPompe * 2) + 1;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contatori ' + meseNome + ' ' + anno + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:8mm;color:#1a1a18}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:6mm}}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:14px}' +
    'th{background:#6B5FCC;color:#fff;padding:4px 3px;font-size:7px;text-transform:uppercase;letter-spacing:0.2px;border:1px solid #5A4FBB;text-align:center}' +
    'th.sub{background:#7B73CC;font-size:7px;padding:2px 3px}' +
    'td{padding:3px 4px;border:1px solid #ddd;font-size:9px}' +
    '.m{font-family:Courier New,monospace;text-align:right}' +
    '.b{font-weight:bold}' +
    '.tot{background:#f0f0f0;font-weight:bold}' +
    '.tot td{border-top:2px solid #6B5FCC}' +
    '.lt{text-align:right;background:#fafaf8}' +
    '</style></head><body>';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6B5FCC;padding-bottom:8px;margin-bottom:12px">';
  html += '<div><div style="font-size:16px;font-weight:bold;color:#6B5FCC">REGISTRO CONTATORI — STAZIONE OPPIDO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:2px">' + meseNome + ' ' + anno + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:13px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:8px;color:#666">Generato il ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  // ═══ TABELLA UNICA ORIZZONTALE ═══
  // Header: Data | Pompa1 Cont. | Pompa1 Litri | Pompa2 Cont. | ... | Litri totali
  html += '<table><thead><tr><th rowspan="2" style="width:45px">Data</th>';
  pompe.forEach(function(p) {
    var _pi = cacheProdotti.find(function(pp){return pp.nome===p.prodotto;});
    var colore = _pi ? _pi.colore : '#888';
    html += '<th colspan="2" style="border-bottom:2px solid ' + colore + '">' + esc(p.nome) + '</th>';
  });
  html += '<th rowspan="2" style="background:#534AB7;width:60px">Litri<br>totali</th></tr>';
  html += '<tr>';
  pompe.forEach(function() {
    html += '<th class="sub">Cont.</th><th class="sub">Litri</th>';
  });
  html += '</tr></thead><tbody>';

  // Dati per giorno
  var totPerPompa = {};
  pompe.forEach(function(p) { totPerPompa[p.id] = { litri:0, nome:p.nome, prodotto:p.prodotto }; });
  var totGenerale = 0;

  giorni.forEach(function(data) {
    var litriGiorno = 0;
    var hasData = false;
    var celle = '';

    pompe.forEach(function(pompa) {
      var lettPompa = lettPerPompaData[pompa.id] || {};
      var lettOggi = lettPompa[data];

      if (!lettOggi) {
        celle += '<td class="m" style="color:#ccc">—</td><td class="m" style="color:#ccc">—</td>';
        return;
      }
      hasData = true;
      var lettura = Number(lettOggi.lettura);
      var datePrev = Object.keys(lettPompa).filter(function(d){return d < data;}).sort();
      var prevData = datePrev.length ? datePrev[datePrev.length-1] : null;
      if (!prevData && lettPompa[giornoPre]) prevData = giornoPre;
      var lettIeri = prevData ? lettPompa[prevData] : null;
      var litri = lettIeri ? lettura - Number(lettIeri.lettura) : null;

      celle += '<td class="m" style="font-size:8px;color:#666">' + String(lettura) + '</td>';
      if (litri !== null && litri > 0) {
        celle += '<td class="m b">' + fmtL(litri) + '</td>';
        totPerPompa[pompa.id].litri += litri;
        litriGiorno += litri;
      } else {
        celle += '<td class="m" style="color:#ccc">—</td>';
      }
    });

    totGenerale += litriGiorno;
    var gg = data.substring(8);
    html += '<tr' + (!hasData ? ' style="opacity:0.3"' : '') + '><td><strong>' + gg + '/' + mese + '</strong></td>' + celle + '<td class="m b lt">' + (litriGiorno > 0 ? fmtL(litriGiorno) : '—') + '</td></tr>';
  });

  // Riga totale
  html += '<tr class="tot"><td>TOTALE</td>';
  pompe.forEach(function(p) {
    html += '<td></td><td class="m">' + fmtL(totPerPompa[p.id].litri) + '</td>';
  });
  html += '<td class="m">' + fmtL(totGenerale) + '</td></tr>';
  html += '</tbody></table>';

  // ═══ RIEPILOGO ═══
  html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px">';

  // Per pompa
  html += '<div style="flex:1;min-width:200px"><div style="font-size:10px;font-weight:bold;color:#6B5FCC;margin-bottom:6px;border-bottom:1px solid #6B5FCC;padding-bottom:3px">Riepilogo per pompa</div>';
  html += '<table><thead><tr><th style="text-align:left">Pompa</th><th>Prodotto</th><th>Litri</th></tr></thead><tbody>';
  pompe.forEach(function(p) {
    var _pi = cacheProdotti.find(function(pp){return pp.nome===p.prodotto;});
    var colore = _pi ? _pi.colore : '#888';
    html += '<tr><td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+colore+';margin-right:3px"></span><strong>' + esc(p.nome) + '</strong></td><td style="font-size:8px">' + esc(p.prodotto) + '</td><td class="m b">' + fmtL(totPerPompa[p.id].litri) + '</td></tr>';
  });
  html += '<tr class="tot"><td colspan="2">TOTALE</td><td class="m">' + fmtL(totGenerale) + '</td></tr>';
  html += '</tbody></table></div>';

  // Per prodotto
  var perProdotto = {};
  pompe.forEach(function(p) {
    if (!perProdotto[p.prodotto]) {
      var _pi = cacheProdotti.find(function(pp){return pp.nome===p.prodotto;});
      perProdotto[p.prodotto] = { litri:0, colore: _pi ? _pi.colore : '#888' };
    }
    perProdotto[p.prodotto].litri += totPerPompa[p.id].litri;
  });

  html += '<div style="flex:1;min-width:200px"><div style="font-size:10px;font-weight:bold;color:#6B5FCC;margin-bottom:6px;border-bottom:1px solid #6B5FCC;padding-bottom:3px">Riepilogo per prodotto</div>';
  html += '<table><thead><tr><th style="text-align:left">Prodotto</th><th>Litri</th></tr></thead><tbody>';
  Object.entries(perProdotto).forEach(function([prod, v]) {
    html += '<tr><td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+v.colore+';margin-right:3px"></span><strong>' + esc(prod) + '</strong></td><td class="m b">' + fmtL(v.litri) + '</td></tr>';
  });
  html += '<tr class="tot"><td>TOTALE MESE</td><td class="m">' + fmtL(totGenerale) + '</td></tr>';
  html += '</tbody></table></div>';
  html += '</div>';

  html += '<div style="text-align:center;font-size:8px;color:#aaa;margin-top:12px;border-top:1px solid #ddd;padding-top:5px">PhoenixFuel Srl — Registro contatori ' + meseNome + ' ' + anno + '</div>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  w.document.open();
  w.document.write(html);
  w.document.close();
}

async function _caricaDatiVenditeMese(anno, mese) {
  var da = anno + '-' + mese + '-01';
  var ultimoGiorno = new Date(Number(anno), Number(mese), 0).getDate();
  var a = anno + '-' + mese + '-' + String(ultimoGiorno).padStart(2,'0');
  var { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  var pompeIds = (pompe||[]).map(function(p){return p.id;});
  if (!pompeIds.length) return { righe:[], totali:{} };
  var giornoPre = new Date(new Date(da).getTime()-86400000).toISOString().split('T')[0];
  var [lettRes, prezRes, costiRes, lettPreRes] = await Promise.all([
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).gte('data',da).lte('data',a).order('data'),
    sb.from('stazione_prezzi').select('*').gte('data',da).lte('data',a),
    sb.from('stazione_costi').select('*').gte('data',da).lte('data',a),
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).lte('data',giornoPre).order('data',{ascending:false}).limit(pompeIds.length)
  ]);
  var letture=lettRes.data||[], prezzi=prezRes.data||[], costiDb=costiRes.data||[], lettPre=lettPreRes.data||[];
  var prezziMap={}; prezzi.forEach(function(p){prezziMap[p.data+'_'+p.prodotto]=p.prezzo_litro;});
  var costiMap={}; costiDb.forEach(function(c){costiMap[c.data+'_'+c.prodotto]=Number(c.costo_litro);});
  var tutteLetture=[...lettPre,...letture];
  var dateUniche=[...new Set(letture.map(function(l){return l.data;}))].sort();
  var righe=[], totV={gasolio:0,benzina:0,incasso:0,costo:0,margine:0};
  dateUniche.forEach(function(data){
    var gG=0,gB=0,inc=0,costoG=0;
    pompe.forEach(function(pompa){
      var lettOggi=tutteLetture.find(function(l){return l.pompa_id===pompa.id&&l.data===data;});
      var dp=tutteLetture.filter(function(l){return l.pompa_id===pompa.id&&l.data<data;}).map(function(l){return l.data;}).sort();
      var dPrec=dp.length?dp[dp.length-1]:null;
      var lettIeri=dPrec?tutteLetture.find(function(l){return l.pompa_id===pompa.id&&l.data===dPrec;}):null;
      if(lettOggi&&lettIeri){
        var litri=Number(lettOggi.lettura)-Number(lettIeri.lettura);
        if(litri>0){
          var prezzo=Number(prezziMap[data+'_'+pompa.prodotto]||0)/1.22;
          var costo=costiMap[data+'_'+pompa.prodotto]||0;
          var litriPD=Number(lettOggi.litri_prezzo_diverso||0);
          var prezzoPD=Number(lettOggi.prezzo_diverso||0)/1.22;
          var hasCambio=litriPD>0&&prezzoPD>0;
          var litriStd=hasCambio?Math.max(0,litri-litriPD):litri;
          if(pompa.prodotto==='Gasolio Autotrazione') gG+=litri; else gB+=litri;
          inc+=(litriStd*prezzo)+(hasCambio?litriPD*prezzoPD:0);
          costoG+=litri*costo;
        }
      }
    });
    var marg=inc-costoG;
    totV.gasolio+=gG;totV.benzina+=gB;totV.incasso+=inc;totV.costo+=costoG;totV.margine+=marg;
    righe.push({data:data,gasolio:gG,benzina:gB,totale:gG+gB,incasso:inc,costo:costoG,margine:marg});
  });
  return {righe:righe,totali:totV};
}

async function stampaReportVenditeStazione() {
  var anno=document.getElementById('stz-rep-vend-anno').value;
  var mese=document.getElementById('stz-rep-vend-mese').value;
  if(!anno||!mese){toast('Seleziona anno e mese');return;}
  var meseNome=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1];
  toast('Generazione report vendite...');
  var r=await _caricaDatiVenditeMese(anno,mese);
  var righe=r.righe,t=r.totali;

  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report Vendite '+meseNome+' '+anno+'</title>'+
    '<style>body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:8mm;color:#1a1a18}'+
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:6mm}}'+
    'table{width:100%;border-collapse:collapse}'+
    'th{background:#6B5FCC;color:#fff;padding:5px 4px;font-size:8px;text-transform:uppercase;border:1px solid #5A4FBB;text-align:right}'+
    'th:first-child{text-align:left}'+
    'td{padding:4px 5px;border:1px solid #ddd;font-size:9px;text-align:right;font-family:Courier New,monospace}'+
    'td:first-child{text-align:left;font-family:Arial;font-weight:500}'+
    '.tot{background:#f0f0f0;font-weight:bold}.tot td{border-top:2px solid #6B5FCC}'+
    '.alt{background:#fafaf8}'+
    '</style></head><body>';

  html+='<div style="display:flex;justify-content:space-between;border-bottom:2px solid #6B5FCC;padding-bottom:8px;margin-bottom:10px">';
  html+='<div><div style="font-size:16px;font-weight:bold;color:#6B5FCC">REPORT VENDITE — STAZIONE OPPIDO</div>';
  html+='<div style="font-size:12px;color:#666;margin-top:2px">'+meseNome+' '+anno+'</div></div>';
  html+='<div style="text-align:right"><div style="font-size:13px;font-weight:bold">PHOENIX FUEL SRL</div>';
  html+='<div style="font-size:8px;color:#666">Generato il '+new Date().toLocaleDateString('it-IT')+'</div></div></div>';

  html+='<table><thead><tr><th style="text-align:left;width:50px">Data</th><th>Gasolio (L)</th><th>Benzina (L)</th><th>Totale (L)</th><th>Incasso €</th><th>Costo €</th><th>Margine €</th></tr></thead><tbody>';
  righe.forEach(function(r,i){
    var mc=r.margine>=0?'#639922':'#E24B4A';
    html+='<tr'+(i%2?' class="alt"':'')+'><td>'+r.data.substring(8)+'/'+r.data.substring(5,7)+'</td><td>'+fmtL(r.gasolio)+'</td><td>'+fmtL(r.benzina)+'</td><td style="font-weight:bold">'+fmtL(r.totale)+'</td><td>'+fmtE(r.incasso)+'</td><td>'+(r.costo>0?fmtE(r.costo):'—')+'</td><td style="font-weight:bold;color:'+mc+'">'+(r.costo>0?fmtMe(r.margine):'—')+'</td></tr>';
  });
  var tmc=t.margine>=0?'#639922':'#E24B4A';
  html+='<tr class="tot"><td>TOTALE</td><td>'+fmtL(t.gasolio)+'</td><td>'+fmtL(t.benzina)+'</td><td>'+fmtL(t.gasolio+t.benzina)+'</td><td>'+fmtE(t.incasso)+'</td><td>'+(t.costo>0?fmtE(t.costo):'—')+'</td><td style="color:'+tmc+'">'+(t.costo>0?fmtMe(t.margine):'—')+'</td></tr>';
  html+='</tbody></table>';

  if(!righe.length) html+='<div style="text-align:center;padding:20px;color:#888">Nessun dato vendite</div>';
  html+='<div style="text-align:center;font-size:8px;color:#aaa;margin-top:10px;border-top:1px solid #ddd;padding-top:5px">PhoenixFuel Srl — Report vendite '+meseNome+' '+anno+'</div>';
  html+='<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  var w=window.open('','_blank');w.document.write(html);w.document.close();
}

async function esportaVenditeExcel() {
  var anno=document.getElementById('stz-rep-vend-anno').value;
  var mese=document.getElementById('stz-rep-vend-mese').value;
  if(!anno||!mese){toast('Seleziona anno e mese');return;}
  var meseNome=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1];
  toast('Generazione Excel vendite...');
  var r=await _caricaDatiVenditeMese(anno,mese);
  if(typeof XLSX==='undefined'){toast('Libreria Excel non caricata');return;}
  var header=['Data','Gasolio (L)','Benzina (L)','Totale (L)','Incasso €','Costo €','Margine €'];
  var rows=[header];
  r.righe.forEach(function(v){rows.push([v.data,v.gasolio,v.benzina,v.totale,Math.round(v.incasso*100)/100,Math.round(v.costo*100)/100,Math.round(v.margine*100)/100]);});
  var t=r.totali;
  rows.push(['TOTALE',t.gasolio,t.benzina,t.gasolio+t.benzina,Math.round(t.incasso*100)/100,Math.round(t.costo*100)/100,Math.round(t.margine*100)/100]);
  var ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:12},{wch:12},{wch:12},{wch:12},{wch:14},{wch:14},{wch:14}];
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Vendite '+meseNome);
  XLSX.writeFile(wb,'ReportVendite_'+meseNome+'_'+anno+'.xlsx');
  toast('Excel vendite generato!');
}


// ═══════════════════════════════════════════════════════════════════
// REPORT ANNUALE STAZIONE — Due tabelle (IVA incl. + Netto IVA) + Istogrammi
// ═══════════════════════════════════════════════════════════════════

function stampaReportAnnualeDettaglio() {
  var anno = document.getElementById('vdett-anno')?.value || new Date().getFullYear();
  _stampaReportAnnualeInterno(anno);
}

function stampaReportAnnualeStazione() {
  var anno = document.getElementById('stz-rep-vend-anno')?.value || new Date().getFullYear();
  _stampaReportAnnualeInterno(anno);
}

async function _stampaReportAnnualeInterno(anno) {
  if (!anno) { toast('Seleziona l\'anno'); return; }
  toast('Generazione report annuale...');

  var mesiNomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var datiMesi = [];

  for (var m = 1; m <= 12; m++) {
    var mese = String(m).padStart(2, '0');
    var r = await _caricaDatiVenditeMese(anno, mese);
    var t = r.totali;
    var litriTot = (t.gasolio || 0) + (t.benzina || 0);
    var margPct = t.incasso > 0 ? ((t.margine / t.incasso) * 100) : 0;
    datiMesi.push({
      mese: mesiNomi[m - 1], meseBreve: mesiNomi[m - 1].substring(0, 3),
      gasolio: t.gasolio || 0, benzina: t.benzina || 0, litri: litriTot,
      incasso: t.incasso || 0, costo: t.costo || 0, margine: t.margine || 0,
      margPct: margPct, giorni: r.righe ? r.righe.length : 0
    });
  }

  var totA = { gasolio:0, benzina:0, litri:0, incasso:0, costo:0, margine:0, giorni:0 };
  datiMesi.forEach(function(d) {
    totA.gasolio+=d.gasolio; totA.benzina+=d.benzina; totA.litri+=d.litri;
    totA.incasso+=d.incasso; totA.costo+=d.costo; totA.margine+=d.margine; totA.giorni+=d.giorni;
  });
  totA.margPct = totA.incasso > 0 ? ((totA.margine / totA.incasso) * 100) : 0;
  var mediaGG = totA.giorni > 0 ? Math.round(totA.litri / totA.giorni) : 0;
  var maxLitri = Math.max.apply(null, datiMesi.map(function(d){return d.litri;})) || 1;

  var w = _apriReport('Report annuale stazione ' + anno); if (!w) return;

  var css = '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;background:#fff}';
  css += '.page{padding:10mm;margin:0 auto}';
  css += '@media print{.no-print{display:none!important}@page{size:landscape;margin:6mm}.page2{page-break-before:always}}';
  css += '@media screen{.page{max-width:297mm;box-shadow:0 2px 12px rgba(0,0,0,0.08);margin:10px auto}body{background:#f5f4f0}}';
  css += 'table{width:100%;border-collapse:collapse}';
  css += 'th{padding:5px 4px;font-size:8px;text-transform:uppercase;border:1px solid;text-align:right}';
  css += 'th:first-child{text-align:left}';
  css += 'td{padding:4px 6px;border:1px solid #ddd;font-size:10px;text-align:right;font-family:Courier New,monospace}';
  css += 'td:first-child{text-align:left;font-family:Arial;font-weight:500}';
  css += '.tot td{border-top:3px solid;font-weight:bold}';
  css += '.bar{height:16px;border-radius:3px;display:inline-block}';
  css += '.kpi-row{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}';
  css += '.kpi-box{flex:1;min-width:90px;padding:10px 14px;border-radius:8px;border-left:4px solid}';
  css += '</style>';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report Annuale Stazione ' + anno + '</title>' + css + '</head><body>';

  // ═══ PAGINA 1: VALORI IVA INCLUSA ═══
  html += '<div class="page">';
  html += '<div style="display:flex;justify-content:space-between;border-bottom:3px solid #D85A30;padding-bottom:8px;margin-bottom:14px">';
  html += '<div><div style="font-size:20px;font-weight:bold;color:#D85A30">REPORT ANNUALE VENDITE</div>';
  html += '<div style="font-size:13px;color:#666">Stazione Oppido Mamertina — Anno ' + anno + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  // KPI
  html += '<div class="kpi-row">';
  html += '<div class="kpi-box" style="background:#FAECE7;border-color:#D85A30"><div style="font-size:8px;color:#993C1D;text-transform:uppercase">Litri totali</div><div style="font-size:18px;font-weight:bold;color:#712B13;font-family:Courier New">' + fmtL(totA.litri) + '</div></div>';
  html += '<div class="kpi-box" style="background:#FAECE7;border-color:#D85A30"><div style="font-size:8px;color:#993C1D;text-transform:uppercase">Incasso totale IVA incl.</div><div style="font-size:18px;font-weight:bold;color:#712B13;font-family:Courier New">' + fmtE(totA.incasso) + '</div></div>';
  html += '<div class="kpi-box" style="background:#EAF3DE;border-color:#639922"><div style="font-size:8px;color:#27500A;text-transform:uppercase">Margine totale</div><div style="font-size:18px;font-weight:bold;color:#173404;font-family:Courier New">' + fmtMe(totA.margine) + '</div></div>';
  html += '<div class="kpi-box" style="background:#EAF3DE;border-color:#639922"><div style="font-size:8px;color:#27500A;text-transform:uppercase">Marginalità</div><div style="font-size:18px;font-weight:bold;color:#173404;font-family:Courier New">' + totA.margPct.toFixed(2) + '%</div></div>';
  html += '<div class="kpi-box" style="background:#E6F1FB;border-color:#378ADD"><div style="font-size:8px;color:#0C447C;text-transform:uppercase">Media lt/giorno</div><div style="font-size:18px;font-weight:bold;color:#042C53;font-family:Courier New">' + fmtL(mediaGG) + '</div></div>';
  html += '</div>';

  // TABELLA IVA INCLUSA
  html += '<div style="font-size:12px;font-weight:bold;color:#D85A30;margin-bottom:6px">Valori IVA inclusa</div>';
  html += _tabellaAnnuale(datiMesi, totA, maxLitri, false);

  // TABELLA NETTO IVA
  html += '<div style="font-size:12px;font-weight:bold;color:#6B5FCC;margin:16px 0 6px">Imponibili al netto IVA</div>';
  html += _tabellaAnnuale(datiMesi, totA, maxLitri, true);

  html += '</div>'; // fine pagina 1

  // ═══ PAGINA 2: GRAFICI ═══
  html += '<div class="page page2">';
  html += '<div style="font-size:16px;font-weight:bold;color:#D85A30;margin-bottom:14px">Grafici annuali — Stazione Oppido ' + anno + '</div>';

  // Istogramma vendite
  html += '<div style="font-size:12px;font-weight:bold;color:#D85A30;margin-bottom:8px">Andamento vendite mensili (litri)</div>';
  html += '<div style="display:flex;align-items:flex-end;gap:6px;height:160px;border-bottom:2px solid #ddd;padding-bottom:4px">';
  datiMesi.forEach(function(d) {
    if (d.litri === 0) return;
    var hGas = Math.round((d.gasolio / maxLitri) * 140);
    var hBen = Math.round((d.benzina / maxLitri) * 140);
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
    html += '<div style="font-size:8px;font-weight:bold;color:#333">' + fmtL(d.litri) + '</div>';
    html += '<div style="display:flex;gap:1px;align-items:flex-end">';
    html += '<div style="width:14px;height:' + hGas + 'px;background:#D4A017;border-radius:2px 2px 0 0"></div>';
    html += '<div style="width:14px;height:' + hBen + 'px;background:#378ADD;border-radius:2px 2px 0 0"></div>';
    html += '</div><div style="font-size:8px;color:#666;margin-top:2px">' + d.meseBreve + '</div></div>';
  });
  html += '</div>';
  html += '<div style="display:flex;gap:14px;margin-top:6px;font-size:9px;color:#666">';
  html += '<div><span style="display:inline-block;width:10px;height:10px;background:#D4A017;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Gasolio</div>';
  html += '<div><span style="display:inline-block;width:10px;height:10px;background:#378ADD;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Benzina</div>';
  html += '</div>';

  // Istogramma fatturato IVA incl. vs Netto
  html += '<div style="margin-top:20px;font-size:12px;font-weight:bold;color:#6B5FCC;margin-bottom:8px">Fatturato mensile: IVA inclusa vs imponibile netto</div>';
  var maxFatt = Math.max.apply(null, datiMesi.map(function(d){return d.incasso;})) || 1;
  html += '<div style="display:flex;align-items:flex-end;gap:6px;height:140px;border-bottom:2px solid #ddd;padding-bottom:4px">';
  datiMesi.forEach(function(d) {
    if (d.incasso === 0) return;
    var nettoIva = Math.round(d.incasso / 1.22);
    var hIva = Math.round((d.incasso / maxFatt) * 120);
    var hNet = Math.round((nettoIva / maxFatt) * 120);
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
    html += '<div style="font-size:7px;font-weight:bold;color:#333">' + Math.round(d.incasso/1000) + 'k</div>';
    html += '<div style="display:flex;gap:1px;align-items:flex-end">';
    html += '<div style="width:14px;height:' + hIva + 'px;background:#D85A30;border-radius:2px 2px 0 0"></div>';
    html += '<div style="width:14px;height:' + hNet + 'px;background:#6B5FCC;border-radius:2px 2px 0 0"></div>';
    html += '</div><div style="font-size:8px;color:#666;margin-top:2px">' + d.meseBreve + '</div></div>';
  });
  html += '</div>';
  html += '<div style="display:flex;gap:14px;margin-top:6px;font-size:9px;color:#666">';
  html += '<div><span style="display:inline-block;width:10px;height:10px;background:#D85A30;border-radius:2px;vertical-align:middle;margin-right:3px"></span>IVA inclusa</div>';
  html += '<div><span style="display:inline-block;width:10px;height:10px;background:#6B5FCC;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Imponibile netto</div>';
  html += '</div>';

  // Istogramma marginalità
  html += '<div style="margin-top:20px;font-size:12px;font-weight:bold;color:#639922;margin-bottom:8px">Marginalità mensile (%)</div>';
  var maxMarg = Math.max.apply(null, datiMesi.map(function(d){return d.margPct;})) || 1;
  html += '<div style="display:flex;align-items:flex-end;gap:6px;height:120px;border-bottom:2px solid #ddd;padding-bottom:4px">';
  datiMesi.forEach(function(d) {
    if (d.litri === 0) return;
    var hBar = Math.round((d.margPct / maxMarg) * 100);
    var barColor = d.margPct >= totA.margPct ? '#639922' : '#BA7517';
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
    html += '<div style="font-size:8px;font-weight:bold;color:' + barColor + '">' + d.margPct.toFixed(1) + '%</div>';
    html += '<div style="width:22px;height:' + hBar + 'px;background:' + barColor + ';border-radius:2px 2px 0 0"></div>';
    html += '<div style="font-size:8px;color:#666;margin-top:2px">' + d.meseBreve + '</div></div>';
  });
  html += '</div>';
  html += '<div style="font-size:9px;color:#666;margin-top:4px">Media annuale: <strong style="color:#639922">' + totA.margPct.toFixed(2) + '%</strong> — Verde = sopra media, arancione = sotto media</div>';

  // Footer
  html += '<div style="text-align:center;font-size:8px;color:#aaa;border-top:1px solid #e8e8e8;padding-top:6px;margin-top:14px">PhoenixFuel Srl — Report annuale vendite stazione — ' + anno + '</div>';
  html += '</div>'; // fine pagina 2

  // Bottoni
  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D85A30;color:#fff">Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button>';
  html += '</div></body></html>';

  w.document.open(); w.document.write(html); w.document.close();
}

function _tabellaAnnuale(datiMesi, totA, maxLitri, nettoIva) {
  var iva = nettoIva ? 1.22 : 1;
  var thBg = nettoIva ? '#EEEDFE' : '#FAECE7';
  var thCol = nettoIva ? '#534AB7' : '#993C1D';
  var thBor = nettoIva ? '#534AB7' : '#C04A20';
  var totBg = nettoIva ? '#EEEDFE' : '#FAECE7';
  var totBor = nettoIva ? '#6B5FCC' : '#D85A30';
  var totCol = nettoIva ? '#3C3489' : '#712B13';

  var h = '<table><thead><tr>';
  h += '<th style="text-align:left;background:' + thBg + ';color:' + thCol + ';border-color:' + thBor + '">Mese</th>';
  h += '<th style="background:' + thBg + ';color:' + thCol + ';border-color:' + thBor + '">Gg</th>';
  h += '<th style="background:' + thBg + ';color:' + thCol + ';border-color:' + thBor + '">Gasolio (L)</th>';
  h += '<th style="background:' + thBg + ';color:' + thCol + ';border-color:' + thBor + '">Benzina (L)</th>';
  h += '<th style="background:' + thBg + ';color:' + thCol + ';border-color:' + thBor + '">Totale (L)</th>';
  h += '<th style="background:' + thBg + ';color:' + thCol + ';border-color:' + thBor + '">' + (nettoIva ? 'Incasso netto' : 'Incasso IVA incl.') + '</th>';
  h += '<th style="background:' + thBg + ';color:' + thCol + ';border-color:' + thBor + '">' + (nettoIva ? 'Costo netto' : 'Costo IVA incl.') + '</th>';
  h += '<th style="background:' + thBg + ';color:' + thCol + ';border-color:' + thBor + '">Margine</th>';
  h += '<th style="background:' + thBg + ';color:' + thCol + ';border-color:' + thBor + '">Marg. %</th>';
  h += '<th style="background:' + thBg + ';color:' + thCol + ';border-color:' + thBor + ';width:100px;text-align:left">Litri</th>';
  h += '</tr></thead><tbody>';

  datiMesi.forEach(function(d, i) {
    if (d.litri === 0 && d.incasso === 0) return;
    var inc = d.incasso / iva;
    var cos = d.costo / iva;
    var marg = inc - cos;
    var mp = inc > 0 ? (marg / inc * 100) : 0;
    var mc = marg >= 0 ? '#639922' : '#E24B4A';
    var barW = Math.round((d.litri / maxLitri) * 100);
    h += '<tr' + (i % 2 ? ' style="background:#fafaf8"' : '') + '>';
    h += '<td style="font-weight:600">' + d.mese + '</td>';
    h += '<td>' + d.giorni + '</td>';
    h += '<td>' + fmtL(d.gasolio) + '</td>';
    h += '<td>' + fmtL(d.benzina) + '</td>';
    h += '<td style="font-weight:600">' + fmtL(d.litri) + '</td>';
    h += '<td>' + fmtE(inc) + '</td>';
    h += '<td>' + (cos > 0 ? fmtE(cos) : '—') + '</td>';
    h += '<td style="color:' + mc + ';font-weight:600">' + (marg !== 0 ? fmtE(marg) : '—') + '</td>';
    h += '<td style="color:' + mc + '">' + (mp > 0 ? mp.toFixed(2) + '%' : '—') + '</td>';
    h += '<td style="text-align:left"><div class="bar" style="width:' + barW + '%;background:' + totBor + '"></div></td>';
    h += '</tr>';
  });

  // Riga totale
  var tInc = totA.incasso / iva;
  var tCos = totA.costo / iva;
  var tMarg = tInc - tCos;
  var tMp = tInc > 0 ? (tMarg / tInc * 100) : 0;
  var tmc = tMarg >= 0 ? '#639922' : '#E24B4A';
  h += '<tr class="tot" style="background:' + totBg + '">';
  h += '<td style="color:' + totCol + ';border-color:' + totBor + '">TOTALE ' + '</td>';
  h += '<td style="color:' + totCol + ';border-color:' + totBor + '">' + totA.giorni + '</td>';
  h += '<td style="color:' + totCol + ';border-color:' + totBor + '">' + fmtL(totA.gasolio) + '</td>';
  h += '<td style="color:' + totCol + ';border-color:' + totBor + '">' + fmtL(totA.benzina) + '</td>';
  h += '<td style="color:' + totCol + ';border-color:' + totBor + '">' + fmtL(totA.litri) + '</td>';
  h += '<td style="color:' + totCol + ';border-color:' + totBor + '">' + fmtE(tInc) + '</td>';
  h += '<td style="color:' + totCol + ';border-color:' + totBor + '">' + (tCos > 0 ? fmtE(tCos) : '—') + '</td>';
  h += '<td style="color:' + tmc + ';border-color:' + totBor + '">' + fmtE(tMarg) + '</td>';
  h += '<td style="color:' + tmc + ';border-color:' + totBor + '">' + tMp.toFixed(2) + '%</td>';
  h += '<td style="border-color:' + totBor + '"></td>';
  h += '</tr></tbody></table>';
  return h;
}

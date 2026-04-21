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
  // IVA standard per Gasolio Auto / Benzina = 22%
  // Dati di input:
  //   - prezziMap = prezzo POMPA (IVA compresa, es. 1,6200)
  //   - costiMap  = costo approvvigionamento netto IVA (trasferimento interno)
  // Output per giorno:
  //   - incasso          = ciò che entra in cassa (IVA compresa = prezzo pompa × litri)
  //   - costo            = costo approvvigionamento IVA compresa (per coerenza visiva)
  //   - margine          = ricavo netto IVA − costo netto IVA (redditività vera, IVA è partita di giro)
  var IVA = 0.22;
  var righe=[], totV={gasolio:0,benzina:0,incasso:0,costo:0,margine:0};
  dateUniche.forEach(function(data){
    var gG=0, gB=0;
    var incIvaIncl=0, costoIvaIncl=0, ricNetto=0, costoNetto=0;
    pompe.forEach(function(pompa){
      var lettOggi=tutteLetture.find(function(l){return l.pompa_id===pompa.id&&l.data===data;});
      var dp=tutteLetture.filter(function(l){return l.pompa_id===pompa.id&&l.data<data;}).map(function(l){return l.data;}).sort();
      var dPrec=dp.length?dp[dp.length-1]:null;
      var lettIeri=dPrec?tutteLetture.find(function(l){return l.pompa_id===pompa.id&&l.data===dPrec;}):null;
      if(lettOggi&&lettIeri){
        var litri=Number(lettOggi.lettura)-Number(lettIeri.lettura);
        if(litri>0){
          // prezzi POMPA (IVA incl.) dal DB
          var prezzoIvaIncl = Number(prezziMap[data+'_'+pompa.prodotto]||0);
          var prezzoNetto   = prezzoIvaIncl / (1+IVA);
          var costoNet      = Number(costiMap[data+'_'+pompa.prodotto]||0);   // già netto
          var costoIvaInclU = costoNet * (1+IVA);                              // IVA compresa
          // Cambio prezzo intraday
          var litriPD     = Number(lettOggi.litri_prezzo_diverso||0);
          var prezzoPDIva = Number(lettOggi.prezzo_diverso||0);
          var prezzoPDNet = prezzoPDIva / (1+IVA);
          var hasCambio   = litriPD>0 && prezzoPDIva>0;
          var litriStd    = hasCambio ? Math.max(0, litri-litriPD) : litri;

          if (pompa.prodotto==='Gasolio Autotrazione') gG+=litri; else gB+=litri;

          // Incassi reali in cassa (IVA compresa)
          incIvaIncl += litriStd*prezzoIvaIncl + (hasCambio ? litriPD*prezzoPDIva : 0);
          // Ricavi netti IVA (per margine)
          ricNetto   += litriStd*prezzoNetto   + (hasCambio ? litriPD*prezzoPDNet : 0);
          // Costi: mostro l'IVA incl. nella colonna "Costo", uso il netto per il margine
          costoIvaIncl += litri*costoIvaInclU;
          costoNetto   += litri*costoNet;
        }
      }
    });
    var marg = ricNetto - costoNetto;  // margine = solo imponibili, IVA è partita di giro
    totV.gasolio += gG; totV.benzina += gB;
    totV.incasso += incIvaIncl;
    totV.costo   += costoIvaIncl;
    totV.margine += marg;
    righe.push({data:data, gasolio:gG, benzina:gB, totale:gG+gB,
                incasso:incIvaIncl, costo:costoIvaIncl, margine:marg});
  });
  return {righe:righe, totali:totV};
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

  html+='<table><thead><tr><th style="text-align:left;width:50px">Data</th><th>Gasolio (L)</th><th>Benzina (L)</th><th>Totale (L)</th><th>Incasso € (IVA incl.)</th><th>Costo € (IVA incl.)</th><th>Margine € (netto IVA)</th></tr></thead><tbody>';
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
  var header=['Data','Gasolio (L)','Benzina (L)','Totale (L)','Incasso € (IVA incl.)','Costo € (IVA incl.)','Margine € (netto IVA)'];
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
    var inc = d.incasso / iva;          // colonna Incasso (IVA incl. o netto secondo toggle)
    var cos = d.costo / iva;            // colonna Costo (idem)
    // Margine: sempre ricavo netto − costo netto (l'IVA è partita di giro)
    // d.incasso e d.costo qui sono IVA incl., quindi /1.22 per ottenere il netto in entrambi
    var marg = (d.incasso / 1.22) - (d.costo / 1.22);
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
  // Margine sempre netto IVA (ricavo netto − costo netto)
  var tMarg = (totA.incasso / 1.22) - (totA.costo / 1.22);
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

// ═══════════════════════════════════════════════════════════════════
// REPORT MENSILE STAZIONE (sfondo scuro, 2 pagine: pompe + marginalità)
// Cambi prezzo nello stesso giorno mostrati come righe affiancate.
// ═══════════════════════════════════════════════════════════════════
function _initReportMargAnno() {
  var sel = document.getElementById('rep-marg-anno');
  if (!sel || sel.options.length) return;
  var annoCorr = new Date().getFullYear();
  for (var y = annoCorr; y >= annoCorr - 5; y--) {
    sel.innerHTML += '<option value="' + y + '"' + (y===annoCorr?' selected':'') + '>' + y + '</option>';
  }
  var meseSel = document.getElementById('rep-marg-mese');
  if (meseSel) meseSel.value = String(new Date().getMonth()+1).padStart(2,'0');
}
document.addEventListener('DOMContentLoaded', function(){ setTimeout(_initReportMargAnno, 800); });
// Init anche al click sul tab Marginalità
document.addEventListener('click', function(e){
  var t = e.target && e.target.closest && e.target.closest('.stz-tab[data-tab="stz-marginalita"]');
  if (t) setTimeout(_initReportMargAnno, 200);
});

async function stampaReportStazioneMese() {
  var anno = document.getElementById('rep-marg-anno').value;
  var mese = document.getElementById('rep-marg-mese').value;
  if (!anno || !mese) { toast('Seleziona anno e mese'); return; }
  var meseNomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var meseNome = meseNomi[Number(mese)-1];
  var ultimoG = new Date(Number(anno), Number(mese), 0).getDate();
  var da = anno + '-' + mese + '-01';
  var a = anno + '-' + mese + '-' + String(ultimoG).padStart(2,'0');
  // Per il delta giornaliero serve ANCHE l'ultima lettura del mese precedente
  var giornoPrima = new Date(Number(anno), Number(mese)-1, 0).toISOString().split('T')[0];

  toast('Generazione report stazione...');

  var [pompeRes, lettRes, prezziRes, costiRes] = await Promise.all([
    sb.from('stazione_pompe').select('id,nome,prodotto,ordine').eq('attiva',true).order('ordine'),
    sb.from('stazione_letture').select('pompa_id,data,lettura,litri_prezzo_diverso,prezzo_diverso').gte('data', giornoPrima).lte('data', a).order('data'),
    sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', da).lte('data', a).order('data'),
    sb.from('stazione_costi').select('data,prodotto,costo_litro').gte('data', da).lte('data', a).order('data')
  ]);
  var pompe = pompeRes.data || [];
  var pompeMap = {}; pompe.forEach(function(p){ pompeMap[p.id] = p; });
  var letture = lettRes.data || [];
  var prezziAll = prezziRes.data || [];
  var costiAll = costiRes.data || [];

  // Costruisci giorni del mese
  var giorni = [];
  for (var d = 1; d <= ultimoG; d++) {
    var dataISO = anno + '-' + mese + '-' + String(d).padStart(2,'0');
    giorni.push(dataISO);
  }
  var GG = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];

  // Letture per pompa per data
  var lettByPompa = {}; pompe.forEach(function(p){ lettByPompa[p.id] = {}; });
  letture.forEach(function(l){
    if (lettByPompa[l.pompa_id]) lettByPompa[l.pompa_id][l.data] = Number(l.lettura);
  });

  // Per ogni giorno, calcola litri venduti per ogni pompa (delta vs lettura più recente prec)
  function getLettPrec(pid, dataISO) {
    // Cerca la lettura più recente <= giorno-1
    var keys = Object.keys(lettByPompa[pid] || {}).filter(function(k){ return k < dataISO; }).sort();
    return keys.length ? lettByPompa[pid][keys[keys.length-1]] : null;
  }

  // Prezzi per data,prodotto: array (può avere più valori per cambi giornalieri)
  var prezziByGP = {};
  prezziAll.forEach(function(p){
    var k = p.data + '_' + p.prodotto;
    if (!prezziByGP[k]) prezziByGP[k] = [];
    prezziByGP[k].push(Number(p.prezzo_litro));
  });
  // Cambi prezzo intra-giorno: aggregati dalle letture (campo litri_prezzo_diverso/prezzo_diverso)
  // Per ogni (data, prodotto): {litriPD: somma, prezzoPD: media ponderata}
  var cambiByGP = {};
  letture.forEach(function(l) {
    var litriPD = Number(l.litri_prezzo_diverso || 0);
    var prezzoPD = Number(l.prezzo_diverso || 0);
    if (litriPD <= 0 || prezzoPD <= 0) return;
    var pompa = pompeMap[l.pompa_id]; if (!pompa) return;
    var k = l.data + '_' + pompa.prodotto;
    if (!cambiByGP[k]) cambiByGP[k] = { litriTot: 0, valoreTot: 0 };
    cambiByGP[k].litriTot += litriPD;
    cambiByGP[k].valoreTot += litriPD * prezzoPD;
  });
  // Funzione: dato (data, prodotto), ritorna prezzo del cambio (media ponderata se più pompe stesso giorno)
  function getCambioPrezzo(data, prodotto) {
    var c = cambiByGP[data + '_' + prodotto];
    if (!c || c.litriTot <= 0) return null;
    return { prezzo: c.valoreTot / c.litriTot, litri: c.litriTot };
  }
  var costiByGP = {};
  costiAll.forEach(function(c){
    var k = c.data + '_' + c.prodotto;
    if (!costiByGP[k]) costiByGP[k] = [];
    costiByGP[k].push(Number(c.costo_litro));
  });

  // ═══ COSTRUZIONE DATI PER PAGINA 1 (POMPE) ═══
  var righeP1 = [];  // {data, ggLabel, perPompa:{pid:litri}, totGas, totBenz, totLitri, totEur}
  var sumPerPompa = {}; pompe.forEach(function(p){ sumPerPompa[p.id]=0; });
  var sumTotGas=0, sumTotBenz=0, sumTotLitri=0, sumTotEur=0;

  giorni.forEach(function(dataISO) {
    var dt = new Date(dataISO+'T12:00:00');
    var perPompa = {}, totGas=0, totBenz=0, totEur=0;
    pompe.forEach(function(p){
      var lOggi = (lettByPompa[p.id]||{})[dataISO];
      var lPrec = getLettPrec(p.id, dataISO);
      var litri = (lOggi != null && lPrec != null) ? Math.max(0, lOggi - lPrec) : 0;
      perPompa[p.id] = litri;
      sumPerPompa[p.id] += litri;
      // Prezzo medio venduto: media dei prezzi del giorno per il prodotto
      var prezzi = prezziByGP[dataISO+'_'+p.prodotto] || [];
      var prezzoMedio = prezzi.length ? prezzi.reduce(function(a,b){return a+b;},0)/prezzi.length : 0;
      var eur = litri * prezzoMedio;
      totEur += eur;
      var isGas = (p.prodotto || '').toLowerCase().indexOf('gasolio') >= 0;
      if (isGas) totGas += litri; else totBenz += litri;
    });
    var totLitri = totGas + totBenz;
    sumTotGas += totGas; sumTotBenz += totBenz; sumTotLitri += totLitri; sumTotEur += totEur;
    righeP1.push({
      data: dataISO, dt: dt, ggLabel: GG[dt.getDay()],
      perPompa: perPompa, totGas: totGas, totBenz: totBenz, totLitri: totLitri, totEur: totEur
    });
  });

  // ═══ COSTRUZIONE DATI PAGINA 2 (MARGINALITÀ) ═══
  var righeP2 = [];  // per ogni giorno: subRows array (1+ per cambi prezzo) + totali
  var marg_tot_gas = 0, marg_tot_benz = 0, marg_tot_eur = 0, lt_tot_gas = 0, lt_tot_benz = 0;

  righeP1.forEach(function(r) {
    var prezziGas = (prezziByGP[r.data+'_Gasolio Autotrazione'] || []);
    var costiGas  = (costiByGP[r.data+'_Gasolio Autotrazione'] || []);
    var prezziBenz = (prezziByGP[r.data+'_Benzina'] || []);
    var costiBenz  = (costiByGP[r.data+'_Benzina'] || []);
    // Cambi prezzo intra-giorno letti dalle letture pompe
    var cambioGas = getCambioPrezzo(r.data, 'Gasolio Autotrazione');
    var cambioBenz = getCambioPrezzo(r.data, 'Benzina');
    var hasCambioGas = !!cambioGas;
    var hasCambioBenz = !!cambioBenz;
    var nRighe = (hasCambioGas || hasCambioBenz) ? 2 : 1;

    // subRows: riga 0 = prezzo standard del giorno, riga 1 = cambio prezzo (se presente)
    var prezzoStdGas = prezziGas.length ? prezziGas[prezziGas.length-1] : null;
    var costoStdGas = costiGas.length ? costiGas[costiGas.length-1] : null;
    var prezzoStdBenz = prezziBenz.length ? prezziBenz[prezziBenz.length-1] : null;
    var costoStdBenz = costiBenz.length ? costiBenz[costiBenz.length-1] : null;

    var subRows = [];
    if (nRighe === 1) {
      subRows.push({
        gasPrezzo: prezzoStdGas, gasCosto: costoStdGas,
        benzPrezzo: prezzoStdBenz, benzCosto: costoStdBenz,
        labelGas: '', labelBenz: ''
      });
    } else {
      // Riga 0: prezzo standard
      subRows.push({
        gasPrezzo: prezzoStdGas, gasCosto: costoStdGas,
        benzPrezzo: prezzoStdBenz, benzCosto: costoStdBenz,
        labelGas: hasCambioGas ? ' (std)' : '',
        labelBenz: hasCambioBenz ? ' (std)' : ''
      });
      // Riga 1: prezzo cambiato (se Gas o Benz)
      subRows.push({
        gasPrezzo: hasCambioGas ? cambioGas.prezzo : prezzoStdGas,
        gasCosto: costoStdGas,
        benzPrezzo: hasCambioBenz ? cambioBenz.prezzo : prezzoStdBenz,
        benzCosto: costoStdBenz,
        labelGas: hasCambioGas ? ' (cambio: ' + Math.round(cambioGas.litri) + 'L)' : '',
        labelBenz: hasCambioBenz ? ' (cambio: ' + Math.round(cambioBenz.litri) + 'L)' : ''
      });
    }

    // Margine giornaliero: tiene conto dei cambi prezzo (litri al prezzo std + litri al prezzo cambio)
    var costoG = costoStdGas || 0;
    var costoB = costoStdBenz || 0;
    var litriCambioGas = hasCambioGas ? cambioGas.litri : 0;
    var litriCambioBenz = hasCambioBenz ? cambioBenz.litri : 0;
    var litriStdGas = Math.max(0, r.totGas - litriCambioGas);
    var litriStdBenz = Math.max(0, r.totBenz - litriCambioBenz);
    var prezzoNetStdGas = (prezzoStdGas || 0) / 1.22;
    var prezzoNetCambioGas = hasCambioGas ? cambioGas.prezzo / 1.22 : 0;
    var prezzoNetStdBenz = (prezzoStdBenz || 0) / 1.22;
    var prezzoNetCambioBenz = hasCambioBenz ? cambioBenz.prezzo / 1.22 : 0;
    var margGiornoGas = (prezzoNetStdGas - costoG) * litriStdGas + (prezzoNetCambioGas - costoG) * litriCambioGas;
    var margGiornoBenz = (prezzoNetStdBenz - costoB) * litriStdBenz + (prezzoNetCambioBenz - costoB) * litriCambioBenz;
    var margGiorno = margGiornoGas + margGiornoBenz;
    var margLitroGiorno = r.totLitri > 0 ? margGiorno / r.totLitri : 0;

    marg_tot_gas += margGiornoGas;
    marg_tot_benz += margGiornoBenz;
    marg_tot_eur += margGiorno;
    lt_tot_gas += r.totGas;
    lt_tot_benz += r.totBenz;

    righeP2.push({
      data: r.data, dt: r.dt, ggLabel: r.ggLabel,
      subRows: subRows,
      cambioGas: hasCambioGas, cambioBenz: hasCambioBenz, nRighe: nRighe,
      margGiorno: margGiorno, margLitroGiorno: margLitroGiorno,
      gasMargL: r.totGas > 0 ? margGiornoGas/r.totGas : 0,
      benzMargL: r.totBenz > 0 ? margGiornoBenz/r.totBenz : 0
    });
  });

  var marg_eur_l_gas = lt_tot_gas > 0 ? marg_tot_gas / lt_tot_gas : 0;
  var marg_eur_l_benz = lt_tot_benz > 0 ? marg_tot_benz / lt_tot_benz : 0;
  var marg_eur_l_tot = sumTotLitri > 0 ? marg_tot_eur / sumTotLitri : 0;

  // ═══ HTML ═══
  var w = window.open('', '_blank');
  if (!w) { toast('Popup bloccato'); return; }

  function fE(n) { return '€ ' + Number(n).toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}); }
  function fL(n) { return Number(Math.round(n)).toLocaleString('it-IT'); }
  function f3(n) { return Number(n).toFixed(3).replace('.', ','); }
  function f4(n) { return Number(n).toFixed(4).replace('.', ','); }

  // ─── HEADER pompe table ───
  var thPompe = '';
  pompe.forEach(function(p){
    var isGas = (p.prodotto||'').toLowerCase().indexOf('gasolio') >= 0;
    var col = isGas ? '#C0DD97' : '#B5D4F4';
    thPompe += '<th style="padding:7px 8px;text-align:right;color:'+col+';font-weight:500;border-bottom:1px solid #3a3a35">'+esc(p.nome)+'</th>';
  });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report stazione ' + meseNome + ' ' + anno + '</title>';
  html += '<style>';
  html += 'body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:8mm;background:#1a1a18;color:#E8E6DA}';
  html += '@media print{@page{size:A4 landscape;margin:6mm} body{padding:0}}';
  html += '.page{padding:14mm;margin-bottom:8mm;background:#1a1a18;border-radius:8px;page-break-after:always}';
  html += '.page:last-child{page-break-after:auto}';
  html += 'table{width:100%;border-collapse:collapse;font-size:10.5px;font-family:"Courier New",monospace}';
  html += 'th{background:#26261f;text-align:right;color:#9a978a;font-weight:500;padding:6px 8px}';
  html += 'td{padding:5px 8px;text-align:right;border-bottom:0.5px solid #2c2c25}';
  html += 'th:first-child,td:first-child{text-align:left}';
  html += '.tot-row{border-top:1.5px solid #4a4a40;background:#26261f;font-weight:bold}';
  html += '.lbl{font-size:11px;color:#9a978a;text-transform:uppercase;letter-spacing:0.4px;font-weight:500;margin-bottom:6px}';
  html += '.card{background:#26261f;border-radius:8px;padding:10px 14px}';
  html += '.no-print{position:fixed;bottom:20px;right:20px}';
  html += '@media print{.no-print{display:none}}';
  html += '</style></head><body>';

  // ════ PAGINA 1 — POMPE ════
  html += '<div class="page">';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:0.5px solid #3a3a35;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:500;color:#F5F2E5">Report stazione Oppido</div>';
  html += '<div style="font-size:11px;color:#9a978a">' + meseNome + ' ' + anno + ' · Pagina 1/2 · Pompe</div></div>';
  html += '<div style="font-size:11px;color:#9a978a;text-align:right">Phoenix Fuel S.r.l.</div></div>';

  html += '<div class="lbl">Letture giornaliere per pompa</div>';
  html += '<table><thead><tr><th>Data</th>' + thPompe;
  html += '<th style="background:#1f3320;color:#97C459">Tot Gas</th>';
  html += '<th style="background:#0c2540;color:#85B7EB">Tot Benz</th>';
  html += '<th style="background:#3a2818;color:#FAC775">Tot litri</th>';
  html += '<th>€ giorno</th></tr></thead><tbody>';
  righeP1.forEach(function(r){
    var dStr = r.data.split('-').reverse().join('/').substring(0,5);
    html += '<tr><td>' + dStr + ' ' + r.ggLabel + '</td>';
    pompe.forEach(function(p){ html += '<td>' + fL(r.perPompa[p.id]) + '</td>'; });
    html += '<td style="background:#1f3320;color:#C0DD97">' + fL(r.totGas) + '</td>';
    html += '<td style="background:#0c2540;color:#B5D4F4">' + fL(r.totBenz) + '</td>';
    html += '<td style="background:#3a2818;color:#FAC775;font-weight:bold">' + fL(r.totLitri) + '</td>';
    html += '<td>' + fE(r.totEur) + '</td></tr>';
  });
  html += '<tr class="tot-row"><td style="color:#F5F2E5">Totale mese</td>';
  pompe.forEach(function(p){ html += '<td>' + fL(sumPerPompa[p.id]) + '</td>'; });
  html += '<td style="background:#27500A;color:#EAF3DE">' + fL(sumTotGas) + '</td>';
  html += '<td style="background:#0C447C;color:#E6F1FB">' + fL(sumTotBenz) + '</td>';
  html += '<td style="background:#633806;color:#FAEEDA">' + fL(sumTotLitri) + '</td>';
  html += '<td style="color:#F5F2E5">' + fE(sumTotEur) + '</td></tr>';
  html += '</tbody></table>';

  html += '<div class="lbl" style="margin-top:14px">Riepilogo mensile pompe</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">';
  html += '<div class="card"><div style="font-size:10px;color:#9a978a">Litri totali</div><div style="font-size:18px;font-weight:bold;color:#FAC775">' + fL(sumTotLitri) + '</div></div>';
  var pctGas = sumTotLitri > 0 ? Math.round(sumTotGas/sumTotLitri*100) : 0;
  var pctBenz = sumTotLitri > 0 ? Math.round(sumTotBenz/sumTotLitri*100) : 0;
  html += '<div class="card"><div style="font-size:10px;color:#9a978a">Gas (' + pctGas + '%)</div><div style="font-size:18px;font-weight:bold;color:#C0DD97">' + fL(sumTotGas) + '</div></div>';
  html += '<div class="card"><div style="font-size:10px;color:#9a978a">Benz (' + pctBenz + '%)</div><div style="font-size:18px;font-weight:bold;color:#B5D4F4">' + fL(sumTotBenz) + '</div></div>';
  html += '<div class="card"><div style="font-size:10px;color:#9a978a">Media giornaliera</div><div style="font-size:18px;font-weight:bold;color:#F5F2E5">' + fL(sumTotLitri/ultimoG) + ' L</div></div>';
  html += '</div>';
  html += '</div>';  // page 1

  // ════ PAGINA 2 — MARGINALITÀ ════
  html += '<div class="page">';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:0.5px solid #3a3a35;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:500;color:#F5F2E5">Report stazione Oppido</div>';
  html += '<div style="font-size:11px;color:#9a978a">' + meseNome + ' ' + anno + ' · Pagina 2/2 · Marginalità</div></div>';
  html += '<div style="font-size:11px;color:#9a978a;text-align:right">Phoenix Fuel S.r.l.</div></div>';

  // 3 card riepilogo
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">';
  html += '<div style="background:#3a2818;border-radius:8px;padding:12px 14px;border-left:3px solid #FAC775">';
  html += '<div style="font-size:10px;color:#FAC775;text-transform:uppercase">Marginalità totale</div>';
  html += '<div style="font-size:22px;font-weight:bold;color:#FAEEDA">' + fE(marg_tot_eur) + '</div>';
  html += '<div style="font-size:11px;color:#FAC775">€ ' + f3(marg_eur_l_tot) + '/L medio</div></div>';
  html += '<div style="background:#1f3320;border-radius:8px;padding:12px 14px;border-left:3px solid #97C459">';
  html += '<div style="font-size:10px;color:#97C459;text-transform:uppercase">Marg. Gasolio</div>';
  html += '<div style="font-size:22px;font-weight:bold;color:#EAF3DE">' + fE(marg_tot_gas) + '</div>';
  html += '<div style="font-size:11px;color:#C0DD97">€ ' + f3(marg_eur_l_gas) + '/L</div></div>';
  html += '<div style="background:#0c2540;border-radius:8px;padding:12px 14px;border-left:3px solid #85B7EB">';
  html += '<div style="font-size:10px;color:#85B7EB;text-transform:uppercase">Marg. Benzina</div>';
  html += '<div style="font-size:22px;font-weight:bold;color:#E6F1FB">' + fE(marg_tot_benz) + '</div>';
  html += '<div style="font-size:11px;color:#B5D4F4">€ ' + f3(marg_eur_l_benz) + '/L</div></div>';
  html += '</div>';

  html += '<div class="lbl">Marginalità giornaliera (cambi prezzo come righe affiancate)</div>';
  html += '<table><thead><tr>';
  html += '<th>Data</th>';
  html += '<th style="text-align:center;color:#97C459">Gas: prezzo</th>';
  html += '<th style="color:#97C459">costo</th>';
  html += '<th style="color:#97C459">marg/L</th>';
  html += '<th style="text-align:center;color:#85B7EB">Benz: prezzo</th>';
  html += '<th style="color:#85B7EB">costo</th>';
  html += '<th style="color:#85B7EB">marg/L</th>';
  html += '<th style="color:#FAC775">€ marg gg</th>';
  html += '<th style="color:#FAC775">€/L marg</th>';
  html += '</tr></thead><tbody>';

  righeP2.forEach(function(r){
    var dStr = r.data.split('-').reverse().join('/').substring(0,5);
    var bg = (r.cambioGas || r.cambioBenz) ? 'background:#221d12' : '';
    if (r.nRighe === 1) {
      var s = r.subRows[0];
      html += '<tr style="' + bg + '"><td>' + dStr + ' ' + r.ggLabel + '</td>';
      html += '<td style="text-align:center">' + (s.gasPrezzo!=null ? f3(s.gasPrezzo) : '—') + '</td>';
      html += '<td>' + (s.gasCosto!=null ? f3(s.gasCosto) : '—') + '</td>';
      var mgL = (s.gasPrezzo!=null && s.gasCosto!=null) ? (s.gasPrezzo/1.22 - s.gasCosto) : null;
      html += '<td style="color:#C0DD97">' + (mgL!=null ? (mgL>=0?'+':'')+f3(mgL) : '—') + '</td>';
      html += '<td style="text-align:center">' + (s.benzPrezzo!=null ? f3(s.benzPrezzo) : '—') + '</td>';
      html += '<td>' + (s.benzCosto!=null ? f3(s.benzCosto) : '—') + '</td>';
      var mbL = (s.benzPrezzo!=null && s.benzCosto!=null) ? (s.benzPrezzo/1.22 - s.benzCosto) : null;
      html += '<td style="color:#B5D4F4">' + (mbL!=null ? (mbL>=0?'+':'')+f3(mbL) : '—') + '</td>';
      html += '<td style="color:#FAC775">' + fE(r.margGiorno) + '</td>';
      html += '<td style="color:#FAC775">' + (r.margLitroGiorno>=0?'+':'') + f3(r.margLitroGiorno) + '</td>';
      html += '</tr>';
    } else {
      r.subRows.forEach(function(s, idx){
        var primaRiga = (idx === 0);
        html += '<tr style="' + bg + '">';
        if (primaRiga) {
          html += '<td rowspan="' + r.nRighe + '" style="vertical-align:top;border-right:0.5px solid #3a3a35">' + dStr + ' ' + r.ggLabel;
          html += '<div style="font-size:9px;color:#FAC775;margin-top:3px">⚡ ' + r.nRighe + ' prezzi</div></td>';
        }
        var labGas = s.labelGas || '';
        var labBenz = s.labelBenz || '';
        html += '<td style="text-align:center"><span style="color:#9a978a;font-size:10px">' + (s.gasPrezzo!=null ? f3(s.gasPrezzo)+labGas : '—') + '</span></td>';
        html += '<td>' + (s.gasCosto!=null ? f3(s.gasCosto) : '—') + '</td>';
        var mgL = (s.gasPrezzo!=null && s.gasCosto!=null) ? (s.gasPrezzo/1.22 - s.gasCosto) : null;
        html += '<td style="color:#C0DD97">' + (mgL!=null ? (mgL>=0?'+':'')+f3(mgL) : '—') + '</td>';
        html += '<td style="text-align:center"><span style="color:#9a978a;font-size:10px">' + (s.benzPrezzo!=null ? f3(s.benzPrezzo)+labBenz : '—') + '</span></td>';
        html += '<td>' + (s.benzCosto!=null ? f3(s.benzCosto) : '—') + '</td>';
        var mbL = (s.benzPrezzo!=null && s.benzCosto!=null) ? (s.benzPrezzo/1.22 - s.benzCosto) : null;
        html += '<td style="color:#B5D4F4">' + (mbL!=null ? (mbL>=0?'+':'')+f3(mbL) : '—') + '</td>';
        if (primaRiga) {
          html += '<td rowspan="' + r.nRighe + '" style="vertical-align:middle;color:#FAC775;border-left:0.5px solid #3a3a35">' + fE(r.margGiorno) + '</td>';
          html += '<td rowspan="' + r.nRighe + '" style="vertical-align:middle;color:#FAC775">' + (r.margLitroGiorno>=0?'+':'') + f3(r.margLitroGiorno) + '</td>';
        }
        html += '</tr>';
      });
    }
  });
  html += '<tr class="tot-row"><td style="color:#F5F2E5">Totale mese</td>';
  html += '<td colspan="3" style="text-align:right;color:#C0DD97">media Gas: ' + (marg_eur_l_gas>=0?'+':'') + f3(marg_eur_l_gas) + '/L</td>';
  html += '<td colspan="3" style="text-align:right;color:#B5D4F4">media Benz: ' + (marg_eur_l_benz>=0?'+':'') + f3(marg_eur_l_benz) + '/L</td>';
  html += '<td style="background:#633806;color:#FAEEDA">' + fE(marg_tot_eur) + '</td>';
  html += '<td style="background:#633806;color:#FAEEDA">' + (marg_eur_l_tot>=0?'+':'') + f3(marg_eur_l_tot) + '</td></tr>';
  html += '</tbody></table>';
  html += '</div>';  // page 2

  html += '<div class="no-print" style="display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="background:#FAC775;color:#1a1a18;border:none;padding:10px 18px;border-radius:8px;font-weight:bold;cursor:pointer;font-size:13px">📄 Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="background:#E24B4A;color:white;border:none;padding:10px 18px;border-radius:8px;font-weight:bold;cursor:pointer;font-size:13px">Chiudi</button>';
  html += '</div>';
  html += '</body></html>';

  w.document.open(); w.document.write(html); w.document.close();
}

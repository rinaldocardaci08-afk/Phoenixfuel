// PhoenixFuel — Stazione: Letture contatori
async function caricaTabLetture() {
  await caricaFormLetture();
  await caricaStoricoLetture();
}

async function caricaFormLetture() {
  const data = document.getElementById('stz-data-lettura').value || oggiISO;
  const { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  if (!pompe||!pompe.length) { document.getElementById('stz-form-letture').innerHTML='<div class="loading">Nessuna pompa configurata</div>'; return; }

  // Carica letture oggi + precedenti in parallelo
  const pompeIds = pompe.map(p=>p.id);
  const ieri = new Date(new Date(data).getTime()-86400000).toISOString().split('T')[0];
  const [lettOggiRes, lettPrecRes, prezziRes] = await Promise.all([
    sb.from('stazione_letture').select('*').eq('data',data).in('pompa_id',pompeIds),
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).lte('data',ieri).order('data',{ascending:false}),
    sb.from('stazione_prezzi').select('*').eq('data',data)
  ]);
  const lettMap = {}; (lettOggiRes.data||[]).forEach(l => lettMap[l.pompa_id]={ lettura:Number(l.lettura), litri_pd:Number(l.litri_prezzo_diverso||0), prezzo_pd:Number(l.prezzo_diverso||0) });
  // Per ogni pompa, prendi l'ultima lettura precedente
  const lettIeriMap = {};
  pompe.forEach(p => {
    const ultima = (lettPrecRes.data||[]).find(l=>l.pompa_id===p.id);
    if (ultima) lettIeriMap[p.id] = Number(ultima.lettura);
  });
  const prezzoMap = {}; (prezziRes.data||[]).forEach(pr => prezzoMap[pr.prodotto]=Number(pr.prezzo_litro));

  // Salva dati per calcolo live e report
  window._stzPompe = pompe;
  window._stzIeriMap = lettIeriMap;
  window._stzPrezzoMap = prezzoMap;
  window._stzData = data;

  let html = '';
  pompe.forEach(p => {
    const rec = lettMap[p.id];
    const val = rec ? rec.lettura : '';
    const litriDivSaved = rec ? rec.litri_pd : '';
    const prezzoDivSaved = rec ? rec.prezzo_pd : '';
    const precVal = lettIeriMap[p.id];
    const _pi = cacheProdotti.find(pp=>pp.nome===p.prodotto); const colore = _pi ? _pi.colore : '#888';
    const precRaw = precVal !== undefined ? String(precVal) : '—';
    const prezzo = prezzoMap[p.prodotto] || 0;

    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:4px solid ' + colore + ';border-radius:10px;padding:14px;margin-bottom:10px">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><div style="width:10px;height:10px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:14px">' + esc(p.nome) + '</strong><span style="font-size:11px;color:var(--text-muted);margin-left:auto">' + esc(p.prodotto) + '</span></div>';
    // Contatori stile meccanico — Giorno prec. e Oggi stessa dimensione
    html += '<div style="display:flex;gap:12px;margin-bottom:8px;flex-wrap:wrap">';
    // Giorno prec. (contatore meccanico)
    html += '<div style="flex:1;min-width:160px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Giorno prec.</div>';
    html += '<div style="background:#1a1a1a;border-radius:8px;padding:8px 12px;display:inline-flex;align-items:center;gap:1px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4)"><span style="font-family:\'Courier New\',monospace;font-size:18px;font-weight:700;color:#f0f0f0;letter-spacing:3px">' + precRaw + '</span></div></div>';
    // Oggi (contatore meccanico con input)
    html += '<div style="flex:1;min-width:160px"><div style="font-size:10px;color:var(--text);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:600">Oggi</div>';
    html += '<input type="number" class="stz-lettura-input" data-pompa="' + p.id + '" data-prodotto="' + esc(p.prodotto) + '" value="' + val + '" placeholder="00000000" step="0.01" max="99999999" oninput="calcolaLettureVendite()" style="font-family:\'Courier New\',monospace;font-size:18px;font-weight:700;padding:8px 12px;border:none;border-radius:8px;background:#1a1a1a;color:#7CFC00;width:180px;max-width:100%;text-align:left;letter-spacing:3px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4)" /></div>';
    html += '</div>';
    // Risultati calcolati per questa pompa — dettaglio suddivisione
    html += '<div id="stz-calc-' + p.id + '" style="padding:8px 12px;background:var(--bg-card);border-radius:8px;border:0.5px solid var(--border);margin-bottom:8px;font-size:12px"></div>';
    // Prezzo standard
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
    html += '<span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Prezzo pompa:</span>';
    html += '<span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:#1a1a18">' + (prezzo ? '€ ' + prezzo.toFixed(3) : '<span style="color:#E24B4A">non impostato</span>') + '</span>';
    html += '</div>';
    // Cambio prezzo — riga dedicata più grande
    html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;background:#FFF8E1;border:0.5px solid #F0D080;border-radius:8px">';
    html += '<span style="font-size:12px;color:#8B6914;font-weight:600;white-space:nowrap">⚡ Cambio prezzo:</span>';
    html += '<span style="font-size:12px;color:#8B6914">Litri</span>';
    html += '<input type="number" class="stz-litri-div" data-pompa="' + p.id + '" value="' + (litriDivSaved || '') + '" placeholder="0" step="0.01" oninput="calcolaLettureVendite()" style="font-family:var(--font-mono);font-size:15px;font-weight:600;padding:8px 12px;border:0.5px solid #F0D080;border-radius:8px;background:#fff;color:#1a1a18;width:120px;text-align:right" />';
    html += '<span style="font-size:12px;color:#8B6914">€/L</span>';
    html += '<input type="number" class="stz-prezzo-div" data-pompa="' + p.id + '" data-prodotto="' + esc(p.prodotto) + '" value="' + (prezzoDivSaved || '') + '" placeholder="0.000" step="0.001" oninput="copiaPrezzoCambio(this);calcolaLettureVendite()" style="font-family:var(--font-mono);font-size:15px;font-weight:600;padding:8px 12px;border:0.5px solid #F0D080;border-radius:8px;background:#fff;color:#1a1a18;width:120px;text-align:right" />';
    html += '</div>';
    html += '</div>';
  });
  document.getElementById('stz-form-letture').innerHTML = html;

  // Calcola subito se ci sono già valori
  calcolaLettureVendite();
}

function calcolaLettureVendite() {
  const pompe = window._stzPompe || [];
  const ieriMap = window._stzIeriMap || {};
  const prezzoMap = window._stzPrezzoMap || {};
  let totLitri = 0, totEuro = 0, compilate = 0;
  let litriGasolio = 0, euroGasolio = 0, litriBenzina = 0, euroBenzina = 0;

  pompe.forEach(p => {
    const input = document.querySelector('.stz-lettura-input[data-pompa="' + p.id + '"]');
    const elCalc = document.getElementById('stz-calc-' + p.id);
    if (!input || !elCalc) return;

    const valOggi = parseFloat(input.value);
    const valIeri = ieriMap[p.id];
    const prezzoStd = prezzoMap[p.prodotto] || 0;
    const _pi = cacheProdotti.find(pp=>pp.nome===p.prodotto); const colore = _pi ? _pi.colore : '#888';

    const inputLitriDiv = document.querySelector('.stz-litri-div[data-pompa="' + p.id + '"]');
    const inputPrezzoDiv = document.querySelector('.stz-prezzo-div[data-pompa="' + p.id + '"]');
    const litriDiv = inputLitriDiv ? parseFloat(inputLitriDiv.value) || 0 : 0;
    const prezzoDiv = inputPrezzoDiv ? parseFloat(inputPrezzoDiv.value) || 0 : 0;

    if (!isNaN(valOggi) && valIeri !== undefined) {
      compilate++;
      const litri = valOggi - valIeri;
      const litriStd = Math.max(0, litri - litriDiv);
      const euroStd = litriStd * prezzoStd;
      const euroDiv = litriDiv * prezzoDiv;
      const euro = euroStd + euroDiv;

      var calcHtml = '<div style="display:flex;gap:16px;font-size:13px;margin-bottom:4px"><span style="color:var(--text-muted)">Litri totali: <strong style="font-family:var(--font-mono)">' + (litri >= 0 ? litri.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' L' : '⚠ negativo') + '</strong></span><span style="color:#1a1a18">Venduto: <strong style="font-family:var(--font-mono);color:#639922">€ ' + euro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</strong></span></div>';
      if (litriDiv > 0 && prezzoDiv > 0) {
        calcHtml += '<div style="font-size:11px;color:var(--text-muted);padding-top:4px;border-top:0.5px dashed var(--border)">';
        calcHtml += '<div>↳ ' + litriStd.toLocaleString('it-IT',{maximumFractionDigits:2}) + ' L × € ' + prezzoStd.toFixed(3) + ' = <strong style="font-family:var(--font-mono)">€ ' + euroStd.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</strong></div>';
        calcHtml += '<div style="color:#1a1a18">↳ ' + litriDiv.toLocaleString('it-IT',{maximumFractionDigits:2}) + ' L × € ' + prezzoDiv.toFixed(3) + ' = <strong style="font-family:var(--font-mono)">€ ' + euroDiv.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</strong> <span style="font-size:9px;background:#1a1a18;color:#fff;padding:1px 5px;border-radius:4px">cambio prezzo</span></div>';
        calcHtml += '</div>';
      }
      elCalc.innerHTML = calcHtml;

      if (litri >= 0) {
        totLitri += litri; totEuro += euro;
        var isGasolio = p.prodotto.toLowerCase().indexOf('gasolio') >= 0;
        if (isGasolio) { litriGasolio += litri; euroGasolio += euro; }
        else { litriBenzina += litri; euroBenzina += euro; }
      }
    } else {
      elCalc.innerHTML = '<span style="color:var(--text-muted);font-size:13px">Litri: <strong style="font-family:var(--font-mono)">—</strong></span>';
    }
  });

  var totEl = document.getElementById('stz-totali-letture');
  if (totEl) {
    totEl.innerHTML = '<div style="display:flex;gap:20px;padding:12px 16px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)">' +
      '<div><span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Totale litri</span><div style="font-size:18px;font-weight:700;font-family:var(--font-mono)">' + totLitri.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' L</div></div>' +
      '<div><span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Totale venduto</span><div style="font-size:18px;font-weight:700;font-family:var(--font-mono);color:#639922">€ ' + totEuro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</div></div>' +
      '</div>';
  }

  var el = document.getElementById('stz-totali-live');
  if (el) {
    el.innerHTML =
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.5);margin-bottom:14px;font-weight:600">Totali live</div>' +
      '<div style="margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#BA7517"></div><span style="font-size:11px;font-weight:600;color:#fff">GASOLIO</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:#fff">' + litriGasolio.toLocaleString('it-IT', {maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:#7CFC00">€ ' + euroGasolio.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#378ADD"></div><span style="font-size:11px;font-weight:600;color:#87CEFA">BENZINA</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:#87CEFA">' + litriBenzina.toLocaleString('it-IT', {maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:#7CFC00">€ ' + euroBenzina.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:12px">' +
        '<div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:6px">TOTALE</div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:20px;font-weight:800;color:#fff">' + totLitri.toLocaleString('it-IT', {maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:20px;font-weight:800;color:#7CFC00">€ ' + totEuro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</span></div>' +
        '<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:8px;text-align:center">' + compilate + ' / ' + pompe.length + ' pompe</div>' +
      '</div>';
  }
}

function stampaReportLetture() {
  const pompe = window._stzPompe || [];
  const ieriMap = window._stzIeriMap || {};
  const prezzoMap = window._stzPrezzoMap || {};
  const data = window._stzData || oggiISO;
  const dataFmt = new Date(data).toLocaleDateString('it-IT');

  let righe = '', totLitri = 0, totEuro = 0;
  pompe.forEach(p => {
    const input = document.querySelector('.stz-lettura-input[data-pompa="' + p.id + '"]');
    const valOggi = input ? parseFloat(input.value) : NaN;
    const valIeri = ieriMap[p.id];
    const prezzoStd = prezzoMap[p.prodotto] || 0;
    const litri = (!isNaN(valOggi) && valIeri !== undefined) ? valOggi - valIeri : 0;

    // Prezzo diverso
    const inputLD = document.querySelector('.stz-litri-div[data-pompa="' + p.id + '"]');
    const inputPD = document.querySelector('.stz-prezzo-div[data-pompa="' + p.id + '"]');
    const litriDiv = inputLD ? parseFloat(inputLD.value) || 0 : 0;
    const prezzoDiv = inputPD ? parseFloat(inputPD.value) || 0 : 0;
    const litriStd = Math.max(0, litri - litriDiv);
    const euro = (litriStd * prezzoStd) + (litriDiv * prezzoDiv);

    if (litri > 0) { totLitri += litri; totEuro += euro; }
    const _pi = cacheProdotti.find(pp=>pp.nome===p.prodotto); const colore = _pi ? _pi.colore : '#888';

    righe += '<tr>' +
      '<td style="padding:8px;border:1px solid #ddd"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:4px"></span><strong>' + esc(p.nome) + '</strong></td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">' + (valIeri !== undefined ? _sep(valIeri.toLocaleString('it-IT',{maximumFractionDigits:2})) : '—') + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;font-weight:bold">' + (!isNaN(valOggi) ? _sep(valOggi.toLocaleString('it-IT',{maximumFractionDigits:2})) : '—') + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">' + _sep(litri.toLocaleString('it-IT',{maximumFractionDigits:2})) + ' L</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">€ ' + prezzoStd.toFixed(3) + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;font-weight:bold">€ ' + _sep(euro.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})) + '</td>' +
      '</tr>';
    // Riga aggiuntiva per prezzo diverso
    if (litriDiv > 0 && prezzoDiv > 0) {
      righe += '<tr style="background:#f0f0f0;font-size:10px">' +
        '<td style="padding:4px 8px;border:1px solid #ddd;color:#333" colspan="3">↳ di cui a cambio prezzo</td>' +
        '<td style="padding:4px 8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;color:#333">' + _sep(litriDiv.toLocaleString('it-IT',{maximumFractionDigits:2})) + ' L</td>' +
        '<td style="padding:4px 8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;color:#333">€ ' + prezzoDiv.toFixed(3) + '</td>' +
        '<td style="padding:4px 8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;color:#333;font-weight:bold">€ ' + _sep((litriDiv * prezzoDiv).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})) + '</td>' +
        '</tr>';
    }
  });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Letture Stazione ' + dataFmt + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:12px;margin:0;padding:15mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:10mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}.rpt-header>div:last-child{text-align:left!important}.rpt-kpi{flex-direction:column!important;gap:6px!important}table{font-size:9px}th,td{padding:4px 3px!important}.rpt-actions{bottom:8px!important;right:8px!important}button{padding:8px 12px!important;font-size:12px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#D4A017;color:#fff;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;border:1px solid #B8900F;text-align:center}' +
    '.tot td{border-top:3px solid #D4A017!important;font-weight:bold;font-size:13px;background:#FDF3D0!important}' +
    '</style></head><body>';

  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #D4A017;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:20px;font-weight:bold;color:#D4A017">LETTURE CONTATORI</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Stazione Oppido — Data: <strong>' + dataFmt + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div></div></div>';

  html += '<div class="rpt-kpi" style="display:flex;gap:12px;margin-bottom:14px">';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#7A5D00;text-transform:uppercase">Litri totali</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">' + _sep(totLitri.toLocaleString('it-IT',{maximumFractionDigits:2})) + ' L</div></div>';
  html += '<div style="background:#EAF3DE;border:1px solid #639922;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#27500A;text-transform:uppercase">Incasso totale</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace;color:#639922">€ ' + _sep(totEuro.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})) + '</div></div>';
  html += '</div>';

  html += '<table><thead><tr><th>Pompa</th><th>Contatore prec.</th><th>Contatore oggi</th><th>Litri venduti</th><th>Prezzo/L</th><th>Incasso €</th></tr></thead><tbody>';
  html += righe;
  html += '<tr class="tot"><td style="padding:8px;border:1px solid #ddd">TOTALE</td><td style="padding:8px;border:1px solid #ddd"></td><td style="padding:8px;border:1px solid #ddd"></td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + _sep(totLitri.toLocaleString('it-IT',{maximumFractionDigits:2})) + ' L</td><td style="padding:8px;border:1px solid #ddd"></td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">€ ' + _sep(totEuro.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})) + '</td></tr>';
  html += '</tbody></table>';

  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D4A017;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  var w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

async function salvaLetture() {
  const data = document.getElementById('stz-data-lettura').value;
  if (!data) { toast('Seleziona una data'); return; }
  const inputs = document.querySelectorAll('.stz-lettura-input');
  var upserts = [], cpOps = [], _offlineBatch = [];
  for (const inp of inputs) {
    const val = parseFloat(inp.value);
    if (isNaN(val)) continue;
    const pompaId = inp.dataset.pompa;
    const prodotto = inp.dataset.prodotto;
    const inputLD = document.querySelector('.stz-litri-div[data-pompa="' + pompaId + '"]');
    const inputPD = document.querySelector('.stz-prezzo-div[data-pompa="' + pompaId + '"]');
    const litriPD = inputLD ? parseFloat(inputLD.value) || 0 : 0;
    const prezzoPD = inputPD ? parseFloat(inputPD.value) || 0 : 0;
    upserts.push(_sbWrite('stazione_letture', 'upsert', { pompa_id:pompaId, data, lettura:val, litri_prezzo_diverso:litriPD, prezzo_diverso:prezzoPD }, 'pompa_id,data'));
    const cpKey = prodotto + ' (cambio prezzo)';
    if (litriPD > 0 && prezzoPD > 0) {
      cpOps.push(_sbWrite('stazione_prezzi', 'upsert', { data, prodotto:cpKey, prezzo_litro:prezzoPD }, 'data,prodotto'));
    } else {
      cpOps.push(_sbWrite('stazione_prezzi', 'delete', null, { data: data, prodotto: cpKey }));
    }
  }
  if (!upserts.length) { toast('Inserisci almeno una lettura'); return; }
  var results = await Promise.all(upserts);
  var anyOffline = results.some(function(r) { return r._offline; });
  var errore = results.find(r => r.error);
  if (errore) { toast('Errore: ' + errore.error.message); return; }
  await Promise.all(cpOps);
  toast(anyOffline ? '⚡ ' + upserts.length + ' letture salvate offline' : upserts.length + ' letture salvate!');

  // ═══ Auto-crea prezzi pompa per giorno successivo ═══
  try {
    var domani = new Date(new Date(data).getTime() + 86400000).toISOString().split('T')[0];
    var pompe = window._stzPompe || [];
    var prodottiUnici = [...new Set(pompe.map(function(p){return p.prodotto;}))];
    var prezziDomani = [];
    prodottiUnici.forEach(function(prodotto) {
      // Priorità: cambio prezzo del giorno > prezzo standard del giorno
      var cpKey = prodotto + ' (cambio prezzo)';
      var inputCP = document.querySelector('.stz-prezzo-div[data-prodotto="' + prodotto + '"]');
      var prezzoCP = inputCP ? parseFloat(inputCP.value) || 0 : 0;
      var prezzoStd = (window._stzPrezzoMap || {})[prodotto] || 0;
      var prezzoFinale = prezzoCP > 0 ? prezzoCP : prezzoStd;
      if (prezzoFinale > 0) {
        prezziDomani.push(sb.from('stazione_prezzi').upsert({ data: domani, prodotto: prodotto, prezzo_litro: prezzoFinale }, { onConflict:'data,prodotto' }));
      }
    });
    if (prezziDomani.length) {
      await Promise.all(prezziDomani);
      toast('Prezzi ' + domani + ' preparati automaticamente');
    }
  } catch(e) { console.warn('Auto prezzi domani:', e); }

  calcolaLettureVendite();
  caricaStoricoLetture();
  caricaStoricoPrezzi();

  // Chiedi se vuole andare al giorno successivo
  var domaniNav = new Date(new Date(data).getTime() + 86400000).toISOString().split('T')[0];
  if (confirm('Letture salvate! Prezzi preparati per il ' + domaniNav + '.\nVuoi andare al giorno ' + domaniNav + '?')) {
    document.getElementById('stz-data-lettura').value = domaniNav;
    caricaFormLetture();
  }
}

async function caricaStoricoLetture() {
  // Carica solo ultimi 90 giorni per performance
  var limite = new Date(); limite.setDate(limite.getDate()-90);
  var limiteISO = limite.toISOString().split('T')[0];
  const [lettRes, pompeRes, prezziRes] = await Promise.all([
    sb.from('stazione_letture').select('*').gte('data',limiteISO).order('data',{ascending:false}),
    sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine'),
    sb.from('stazione_prezzi').select('*').gte('data',limiteISO).order('data',{ascending:false})
  ]);
  const letture = lettRes.data; const pompe = pompeRes.data; const prezzi = prezziRes.data;

  if (!letture||!letture.length) {
    document.getElementById('stz-storico-letture').innerHTML='<tr><td colspan="6" class="loading">Nessuna lettura</td></tr>';
    document.getElementById('stz-storico-data-label').textContent = '—';
    return;
  }

  // Cache globale per navigazione
  const dateUniche = [...new Set(letture.map(l=>l.data))].sort().reverse();
  const pompeMap = {}; (pompe||[]).forEach(p=>pompeMap[p.id]=p);
  const prezziMap = {}; (prezzi||[]).forEach(p=>{ prezziMap[p.data+'_'+p.prodotto]=p.prezzo_litro; });
  const lettureByData = {};
  letture.forEach(l => { if(!lettureByData[l.data]) lettureByData[l.data]=[]; lettureByData[l.data].push(l); });
  const lettureByPompa = {};
  letture.forEach(l => { if(!lettureByPompa[l.pompa_id]) lettureByPompa[l.pompa_id]=[]; lettureByPompa[l.pompa_id].push(l); });

  window._storicoLetture = { dateUniche, pompeMap, prezziMap, lettureByData, lettureByPompa, indice: 0 };
  renderStoricoGiorno(0);
}

function storicoLettureGiorno(dir) {
  if (!window._storicoLetture) return;
  const s = window._storicoLetture;
  const nuovoIdx = s.indice - dir; // -dir perché dateUniche è desc (0=più recente)
  if (nuovoIdx < 0 || nuovoIdx >= s.dateUniche.length) return;
  s.indice = nuovoIdx;
  renderStoricoGiorno(nuovoIdx);
}

function renderStoricoGiorno(idx) {
  const s = window._storicoLetture;
  if (!s) return;
  const data = s.dateUniche[idx];
  const lettureGiorno = s.lettureByData[data] || [];

  const dataFmt = new Date(data).toLocaleDateString('it-IT', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
  document.getElementById('stz-storico-data-label').textContent = dataFmt;

  const tbody = document.getElementById('stz-storico-letture');
  let html = '', totLitriG=0, totEuroG=0, totLitriB=0, totEuroB=0;

  lettureGiorno.forEach(l => {
    const pompa = s.pompeMap[l.pompa_id];
    if (!pompa) return;
    const _pi = cacheProdotti.find(pp=>pp.nome===pompa.prodotto); const colore = _pi ? _pi.colore : '#888';
    const storPompa = s.lettureByPompa[l.pompa_id]||[];
    const iSorted = storPompa.sort((a,b)=>b.data.localeCompare(a.data));
    const myIdx = iSorted.findIndex(x=>x.id===l.id);
    const prec = myIdx < iSorted.length-1 ? iSorted[myIdx+1] : null;
    const litri = prec ? Number(l.lettura)-Number(prec.lettura) : null;
    const prezzo = Number(s.prezziMap[l.data+'_'+pompa.prodotto]||0);

    // Cambio prezzo
    const litriPD = Number(l.litri_prezzo_diverso||0);
    const prezzoPD = Number(l.prezzo_diverso||0);
    const hasCambio = litriPD > 0 && prezzoPD > 0;

    var incasso = null;
    var litriStd = litri;
    var euroStd = 0, euroDiv = 0;
    if (litri !== null && prezzo) {
      if (hasCambio) {
        litriStd = Math.max(0, litri - litriPD);
        euroStd = litriStd * prezzo;
        euroDiv = litriPD * prezzoPD;
        incasso = euroStd + euroDiv;
      } else {
        incasso = litri * prezzo;
      }
    }

    if (litri!==null && litri >= 0) {
      var isGasolio = pompa.prodotto.toLowerCase().indexOf('gasolio') >= 0;
      if (isGasolio) { totLitriG += litri; totEuroG += (incasso||0); }
      else { totLitriB += litri; totEuroB += (incasso||0); }
    }

    html += '<tr>' +
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:4px"></span>' + esc(pompa.nome) + '</td>' +
      '<td style="font-family:var(--font-mono);color:var(--text-muted)">' + (prec ? String(Number(prec.lettura)) : '—') + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:bold">' + String(Number(l.lettura)) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:bold">' + (litri!==null?fmtL(litri):'—') + '</td>' +
      '<td style="font-family:var(--font-mono)">' + (prezzo?fmt(prezzo):'—') + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:bold">' + (incasso!==null?fmtE(incasso):'—') + '</td>' +
      '</tr>';

    // Sotto-riga cambio prezzo
    if (hasCambio && litri !== null) {
      html += '<tr style="background:#f5f5f0;font-size:10px">' +
        '<td style="padding:3px 8px;color:#1a1a18" colspan="3">↳ di cui ' + fmtL(litriStd) + ' L × € ' + prezzo.toFixed(3) + ' = ' + fmtE(euroStd) + '</td>' +
        '<td style="padding:3px 8px;color:#1a1a18;font-family:var(--font-mono)">' + fmtL(litriPD) + '</td>' +
        '<td style="padding:3px 8px;color:#1a1a18;font-family:var(--font-mono)">€ ' + prezzoPD.toFixed(3) + '</td>' +
        '<td style="padding:3px 8px;color:#1a1a18;font-family:var(--font-mono);font-weight:bold">' + fmtE(euroDiv) + ' <span style="font-size:8px;background:#1a1a18;color:#fff;padding:1px 4px;border-radius:3px">cambio prezzo</span></td>' +
        '</tr>';
    }
  });

  var totLitri = totLitriG + totLitriB;
  var totEuro = totEuroG + totEuroB;
  html += '<tr style="background:var(--bg);font-weight:bold;border-top:2px solid var(--border)">' +
    '<td colspan="3" style="font-size:11px;text-transform:uppercase">Totale giorno</td>' +
    '<td style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</td><td></td>' +
    '<td style="font-family:var(--font-mono);color:#639922">' + fmtE(totEuro) + '</td></tr>';

  tbody.innerHTML = html;

  var riepEl = document.getElementById('stz-storico-riepilogo');
  if (riepEl) {
    riepEl.innerHTML = '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:120px;padding:10px 14px;background:var(--bg);border-radius:8px;border-left:3px solid #BA7517"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px">Gasolio</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">' + fmtL(totLitriG) + ' L</div><div style="font-family:var(--font-mono);font-size:13px;color:#639922">' + fmtE(totEuroG) + '</div></div>' +
      '<div style="flex:1;min-width:120px;padding:10px 14px;background:var(--bg);border-radius:8px;border-left:3px solid #378ADD"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px">Benzina</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">' + fmtL(totLitriB) + ' L</div><div style="font-family:var(--font-mono);font-size:13px;color:#639922">' + fmtE(totEuroB) + '</div></div>' +
      '<div style="flex:1;min-width:120px;padding:10px 14px;background:var(--bg);border-radius:8px;border-left:3px solid #639922"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px">Totale</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">' + fmtL(totLitri) + ' L</div><div style="font-family:var(--font-mono);font-size:13px;color:#639922;font-weight:700">' + fmtE(totEuro) + '</div></div>' +
      '</div>';
  }
}

// ── Auto-copia prezzo cambio tra pompe stesso prodotto ──
function copiaPrezzoCambio(input) {
  const prodotto = input.dataset.prodotto;
  const pompaId = input.dataset.pompa;
  const val = input.value;
  document.querySelectorAll('.stz-prezzo-div[data-prodotto="' + prodotto + '"]').forEach(inp => {
    if (inp.dataset.pompa !== pompaId) inp.value = val;
  });
}


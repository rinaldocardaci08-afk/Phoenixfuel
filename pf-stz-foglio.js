// PhoenixFuel — Stazione: Foglio giornaliero operatore

// ═══════════════════════════════════════════════════════════════════
// FOGLIO GIORNALIERO OPERATORE STAZIONE (interattivo)
// ═══════════════════════════════════════════════════════════════════

var _fgDati = {};

function fgGiorno(dir) {
  var input = document.getElementById('fg-data');
  var d = input.value ? new Date(input.value) : new Date();
  d.setDate(d.getDate() + dir);
  input.value = d.toISOString().split('T')[0];
  caricaFoglioGiornaliero();
}

async function caricaFoglioGiornaliero() {
  var input = document.getElementById('fg-data');
  if (!input.value) input.value = oggiISO;
  var data = input.value;
  var giornoPre = new Date(new Date(data+'T12:00:00').getTime()-86400000).toISOString().split('T')[0];

  // FIX: usa select('*') e order('ordine') come il tab letture funzionante
  var { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  if (!pompe || !pompe.length) {
    document.getElementById('fg-pompe-tabella').innerHTML='<div style="color:var(--text-hint);padding:12px;text-align:center">Nessuna pompa configurata</div>';
    document.getElementById('fg-riepilogo-vendite').innerHTML='';
    document.getElementById('fg-carte-auto').innerHTML='';
    document.getElementById('fg-crediti-auto').innerHTML='';
    _fgDati = { totEuro:0, totCarte:0, bancomat:0, nexi:0, aziendali:0, creditiEmessi:0, rimborsi:0, rimborsiPrec:0, litriPerProdotto:{}, pompe:[], ieriMap:{}, oggiMap:{}, prezzoMap:{} };
    fgCalcola();
    return;
  }

  // FIX: filtra letture per pompa_id come fa caricaFormLetture
  var pompeIds = pompe.map(function(p){ return p.id; });
  var [lettOggiRes, lettIeriRes, prezziRes, cassaRes, speseRes] = await Promise.all([
    sb.from('stazione_letture').select('*').eq('data',data).in('pompa_id',pompeIds),
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).lte('data',giornoPre).order('data',{ascending:false}),
    sb.from('stazione_prezzi').select('*').eq('data',data),
    sb.from('stazione_cassa').select('*').eq('data',data).maybeSingle(),
    sb.from('stazione_spese_contanti').select('*').eq('data',data).order('created_at')
  ]);

  var lettOggi = lettOggiRes.data || [];
  var lettIeri = lettIeriRes.data || [];
  var prezzi = prezziRes.data || [];
  var cassa = cassaRes.data;
  var spese = speseRes.data || [];

  var prezzoMap = {};
  prezzi.forEach(function(p){ prezzoMap[p.prodotto] = Number(p.prezzo_litro); });

  // Per ogni pompa, prendi l'ultima lettura precedente (come fa caricaFormLetture)
  var ieriMap = {};
  pompe.forEach(function(p) {
    var ultima = lettIeri.find(function(l){ return l.pompa_id === p.id; });
    if (ultima) ieriMap[p.id] = Number(ultima.lettura);
  });

  var oggiMap = {};
  lettOggi.forEach(function(l){ oggiMap[l.pompa_id] = l; });

  // ── POMPE: tabella orizzontale ────────────────────────────────
  var litriPerProdotto = {}, totLitri = 0, totEuro = 0;
  var thCols = '', trIeri = '', trOggi = '', trDiff = '';

  pompe.forEach(function(p) {
    var pi = cacheProdotti.find(function(pp){ return pp.nome === p.prodotto; });
    var col = pi ? pi.colore : '#888';
    var lO = oggiMap[p.id];
    var vO = lO ? Number(lO.lettura) : null;
    var vI = ieriMap[p.id];
    var litri = (vO !== null && vI !== undefined) ? Math.max(0, vO - vI) : 0;
    var prezzo = prezzoMap[p.prodotto] || 0;
    var euro = litri * prezzo;
    totLitri += litri;
    totEuro += euro;
    if (!litriPerProdotto[p.prodotto]) litriPerProdotto[p.prodotto] = { litri: 0, euro: 0, prezzo: prezzo };
    litriPerProdotto[p.prodotto].litri += litri;
    litriPerProdotto[p.prodotto].euro += euro;

    thCols += '<th style="padding:5px 6px;border:1px solid var(--border);text-align:center;background:' + col + ';font-size:8px;text-transform:uppercase;color:#fff">' + esc(p.prodotto) + '<br/>' + esc(p.nome) + '</th>';
    trIeri += '<td style="padding:5px 6px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right">' + (vI !== undefined ? _sep(vI.toLocaleString('it-IT', {maximumFractionDigits:1})) : '—') + '</td>';
    trOggi += '<td style="padding:5px 6px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:bold">' + (vO !== null ? _sep(vO.toLocaleString('it-IT', {maximumFractionDigits:1})) : '—') + '</td>';
    trDiff += '<td style="padding:5px 6px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:bold">' + (litri > 0 ? _sep(litri.toLocaleString('it-IT', {maximumFractionDigits:1})) : '—') + '</td>';
  });

  document.getElementById('fg-pompe-tabella').innerHTML =
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr>' +
    '<th style="padding:5px 6px;border:1px solid var(--border);text-align:left;background:var(--bg);font-size:8px"></th>' + thCols +
    '</tr></thead><tbody>' +
    '<tr><td style="padding:5px 6px;border:1px solid var(--border);font-weight:600;background:var(--bg)">Lettura gg. prima</td>' + trIeri + '</tr>' +
    '<tr><td style="padding:5px 6px;border:1px solid var(--border);font-weight:600;background:var(--bg)">Lettura oggi</td>' + trOggi + '</tr>' +
    '<tr style="background:#FDF3D0"><td style="padding:5px 6px;border:1px solid var(--border);font-weight:bold">Litri venduti</td>' + trDiff + '</tr>' +
    '</tbody></table></div>';

  // ── RIEPILOGO VENDITE ─────────────────────────────────────────
  var rH = '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:var(--bg);font-size:8px;text-transform:uppercase"><th style="padding:5px 8px;border:1px solid var(--border);text-align:left"></th><th style="padding:5px 8px;border:1px solid var(--border);text-align:right">Litri</th><th style="padding:5px 8px;border:1px solid var(--border);text-align:right">€/L</th><th style="padding:5px 8px;border:1px solid var(--border);text-align:right">Totale €</th></tr></thead><tbody>';
  Object.keys(litriPerProdotto).forEach(function(prod) {
    var d2 = litriPerProdotto[prod];
    var pi = cacheProdotti.find(function(pp){ return pp.nome === prod; });
    var col = pi ? pi.colore : '#888';
    rH += '<tr><td style="padding:5px 8px;border:1px solid var(--border);font-weight:600"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-right:4px;vertical-align:middle"></span>' + esc(prod) + '</td>';
    rH += '<td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right">' + _sep(d2.litri.toLocaleString('it-IT', {maximumFractionDigits:1})) + '</td>';
    rH += '<td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right">€ ' + d2.prezzo.toFixed(3) + '</td>';
    rH += '<td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:bold">' + fmtE(d2.euro) + '</td></tr>';
  });
  rH += '<tr style="background:#EAF3DE;font-weight:bold"><td style="padding:6px 8px;border:1px solid var(--border);font-size:11px" colspan="2">TOTALE GENERALE</td><td style="border:1px solid var(--border)"></td><td style="padding:6px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-size:13px;color:#639922">' + fmtE(totEuro) + '</td></tr></tbody></table>';
  document.getElementById('fg-riepilogo-vendite').innerHTML = rH;

  // ── CARTE (auto da cassa) ─────────────────────────────────────
  var bk = cassa ? Number(cassa.bancomat || 0) : 0;
  var nx = cassa ? Number(cassa.carte_nexi || 0) : 0;
  var az = cassa ? Number(cassa.carte_aziendali || 0) : 0;
  var tc = bk + nx + az;
  document.getElementById('fg-carte-auto').innerHTML =
    '<table style="width:100%;border-collapse:collapse;font-size:10px">' +
    '<tr><td style="padding:3px 5px;border:1px solid var(--border)">Bancomat</td><td style="padding:3px 5px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;width:40%">' + fmtE(bk) + '</td></tr>' +
    '<tr><td style="padding:3px 5px;border:1px solid var(--border)">Nexi</td><td style="padding:3px 5px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right">' + fmtE(nx) + '</td></tr>' +
    '<tr><td style="padding:3px 5px;border:1px solid var(--border)">Carte aziendali</td><td style="padding:3px 5px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right">' + fmtE(az) + '</td></tr>' +
    '<tr style="background:#E6F1FB;font-weight:bold"><td style="padding:4px 5px;border:1px solid var(--border)">Totale</td><td style="padding:4px 5px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;color:#0C447C">' + fmtE(tc) + '</td></tr></table>';

  // ── CREDITI (auto da cassa) ───────────────────────────────────
  var ce = cassa ? Number(cassa.crediti_emessi || 0) : 0;
  var ri = cassa ? Number(cassa.rimborsi_effettuati || 0) : 0;
  var rp = cassa ? Number(cassa.rimborsi_giorni_prec || 0) : 0;
  var sc = ce - ri - rp;
  document.getElementById('fg-crediti-auto').innerHTML =
    '<table style="width:100%;border-collapse:collapse;font-size:10px">' +
    '<tr><td style="padding:3px 5px;border:1px solid var(--border)">Crediti emessi</td><td style="padding:3px 5px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;width:40%;color:#639922">+ ' + fmtE(ce) + '</td></tr>' +
    '<tr><td style="padding:3px 5px;border:1px solid var(--border)">Rimborsi</td><td style="padding:3px 5px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;color:#A32D2D">− ' + fmtE(ri) + '</td></tr>' +
    '<tr><td style="padding:3px 5px;border:1px solid var(--border)">Rimb. gg prec.</td><td style="padding:3px 5px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;color:#A32D2D">− ' + fmtE(rp) + '</td></tr>' +
    '<tr style="background:#FAEEDA;font-weight:bold"><td style="padding:4px 5px;border:1px solid var(--border)">Saldo</td><td style="padding:4px 5px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;color:#633806">' + (sc >= 0 ? '+ ' : '− ') + fmtE(Math.abs(sc)) + '</td></tr></table>';

  // ── SPESE (da DB) ─────────────────────────────────────────────
  var ls = document.getElementById('fg-spese-lista');
  ls.innerHTML = '';
  spese.forEach(function(s) { _fgRigaSpesa(s.nota || '', Number(s.importo || 0)); });
  if (!spese.length) _fgRigaSpesa('', 0);

  // ── BANCONOTE (da cassa se salvate) ───────────────────────────
  [100,50,20,10,5,2,1].forEach(function(t) {
    var el = document.getElementById('fg-b' + t);
    if (el) el.value = cassa ? (Number(cassa['banconote_' + t]) || 0) : 0;
  });
  var me = document.getElementById('fg-monete');
  if (me) me.value = cassa ? (Number(cassa.monete_varie) || 0) : 0;

  // Salva dati per calcoli e stampa
  _fgDati = {
    totEuro: totEuro, totCarte: tc, bancomat: bk, nexi: nx, aziendali: az,
    creditiEmessi: ce, rimborsi: ri, rimborsiPrec: rp,
    litriPerProdotto: litriPerProdotto, pompe: pompe,
    ieriMap: ieriMap, oggiMap: oggiMap, prezzoMap: prezzoMap
  };
  fgCalcola();
}

// ── SPESE ────────────────────────────────────────────────────────
function _fgRigaSpesa(nota, importo) {
  var l = document.getElementById('fg-spese-lista');
  var div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px';
  div.innerHTML =
    '<input type="text" class="fg-spesa-nota" value="' + esc(nota) + '" placeholder="Descrizione spesa..." style="flex:1;font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)" />' +
    '<input type="number" class="fg-spesa-importo" value="' + (importo || '') + '" placeholder="0.00" step="0.01" oninput="fgCalcola()" style="font-family:var(--font-mono);font-size:13px;text-align:right;width:100px;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)" />' +
    '<button onclick="this.parentElement.remove();fgCalcola()" style="font-size:12px;padding:2px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;color:#A32D2D">x</button>';
  l.appendChild(div);
}

function fgAggiungiSpesa() { _fgRigaSpesa('', 0); }

// ── CALCOLO QUADRATURA ──────────────────────────────────────────
function fgCalcola() {
  var tagli = [100, 50, 20, 10, 5, 2, 1], totC = 0;
  tagli.forEach(function(t) {
    var n = parseInt(document.getElementById('fg-b' + t).value) || 0;
    var tot = n * t;
    document.getElementById('fg-b' + t + '-tot').textContent = '€ ' + _sep(tot.toLocaleString('it-IT'));
    totC += tot;
  });
  var mon = parseFloat(document.getElementById('fg-monete').value) || 0;
  document.getElementById('fg-monete-tot').textContent = '€ ' + mon.toFixed(2);
  totC += mon;
  document.getElementById('fg-contanti-totale').textContent = fmtE(totC);

  var totSp = 0;
  document.querySelectorAll('.fg-spesa-importo').forEach(function(i) { totSp += parseFloat(i.value) || 0; });

  var tV = _fgDati.totEuro || 0;
  var tCa = _fgDati.totCarte || 0;
  var contAtt = Math.max(0, Math.round((tV - tCa) * 100) / 100);
  var crN = (_fgDati.creditiEmessi || 0) - (_fgDati.rimborsi || 0) - (_fgDati.rimborsiPrec || 0);
  var daV = Math.round((contAtt + crN - totSp) * 100) / 100;
  var diff = Math.round((totC - daV) * 100) / 100;
  var dCol = Math.abs(diff) < 0.01 ? '#639922' : '#E24B4A';
  var dBg = Math.abs(diff) < 0.01 ? '#EAF3DE' : '#FCEBEB';

  var q = '<table style="width:100%;border-collapse:collapse;font-size:11px">';
  q += '<tr><td style="padding:5px 8px;border:1px solid var(--border)">Totale vendite (da letture)</td><td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:bold">' + fmtE(tV) + '</td></tr>';
  q += '<tr><td style="padding:5px 8px;border:1px solid var(--border)">Totale carte</td><td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right">' + fmtE(tCa) + '</td></tr>';
  q += '<tr><td style="padding:5px 8px;border:1px solid var(--border);font-weight:600">Contanti attesi (vendite − carte)</td><td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:bold">' + fmtE(contAtt) + '</td></tr>';
  q += '<tr><td style="padding:5px 8px;border:1px solid var(--border)">Crediti − Rimborsi − Spese</td><td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right">' + (crN - totSp >= 0 ? '+ ' : '− ') + fmtE(Math.abs(crN - totSp)) + '</td></tr>';
  q += '<tr style="background:#EAF3DE"><td style="padding:6px 8px;border:1px solid var(--border);font-weight:bold;font-size:12px">Da versare</td><td style="padding:6px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:bold;font-size:13px;color:#639922">' + fmtE(daV) + '</td></tr>';
  q += '<tr><td style="padding:5px 8px;border:1px solid var(--border);font-weight:600">Contanti contati (per taglio)</td><td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:bold">' + fmtE(totC) + '</td></tr>';
  q += '<tr style="background:' + dBg + '"><td style="padding:6px 8px;border:1px solid var(--border);font-weight:bold;font-size:12px">Differenza</td><td style="padding:6px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:bold;font-size:13px;color:' + dCol + '">' + (diff >= 0 ? '+ ' : '− ') + fmtE(Math.abs(diff)) + '</td></tr>';
  q += '</table>';
  document.getElementById('fg-quadratura').innerHTML = q;
}

// ── SALVA ────────────────────────────────────────────────────────
async function salvaFoglioGiornaliero() {
  var data = document.getElementById('fg-data').value;
  if (!data) { toast('Seleziona una data'); return; }
  var bn = {};
  [100, 50, 20, 10, 5, 2, 1].forEach(function(t) {
    bn['banconote_' + t] = parseInt(document.getElementById('fg-b' + t).value) || 0;
  });
  bn.monete_varie = parseFloat(document.getElementById('fg-monete').value) || 0;

  var { data: ex } = await sb.from('stazione_cassa').select('id').eq('data', data).maybeSingle();
  if (ex) {
    await sb.from('stazione_cassa').update(bn).eq('data', data);
  } else {
    bn.data = data;
    bn.totale_vendite = _fgDati.totEuro || 0;
    await sb.from('stazione_cassa').insert([bn]);
  }

  await sb.from('stazione_spese_contanti').delete().eq('data', data);
  var sa = [];
  document.querySelectorAll('#fg-spese-lista > div').forEach(function(r) {
    var n = r.querySelector('.fg-spesa-nota').value;
    var i = parseFloat(r.querySelector('.fg-spesa-importo').value) || 0;
    if (i > 0 || n.trim()) sa.push({ data: data, nota: n, importo: i });
  });
  if (sa.length) await sb.from('stazione_spese_contanti').insert(sa);

  _auditLog('salva_foglio_giornaliero', 'stazione_cassa', 'Foglio giornaliero ' + data);
  toast('Foglio giornaliero salvato!');
}

// ── STAMPA ───────────────────────────────────────────────────────
async function stampaFoglioGiornaliero() {
  var w = _apriReport("Foglio giornaliero"); if (!w) return;
  var data = document.getElementById('fg-data').value || oggiISO;
  var dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  var d = _fgDati;
  var pompe = d.pompe || [];

  // Tagli banconote dalla UI
  var tagli = [100, 50, 20, 10, 5, 2, 1], totCont = 0, tagliH = '';
  tagli.forEach(function(t) {
    var n = parseInt(document.getElementById('fg-b' + t).value) || 0;
    var tot = n * t; totCont += tot;
    tagliH += '<tr><td style="padding:2px 5px;border:1px solid #ccc;background:#f8f8f5;font-weight:500">€ ' + t + '</td><td style="padding:2px 5px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:center;width:20%">' + (n || '') + '</td><td style="padding:2px 5px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right;width:30%">€ ' + tot.toFixed(2) + '</td></tr>';
  });
  var mon = parseFloat(document.getElementById('fg-monete').value) || 0; totCont += mon;
  tagliH += '<tr><td style="padding:2px 5px;border:1px solid #ccc;background:#f8f8f5;font-weight:500">Monete</td><td style="padding:2px 5px;border:1px solid #ccc"></td><td style="padding:2px 5px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right">€ ' + mon.toFixed(2) + '</td></tr>';
  tagliH += '<tr style="background:#EAF3DE;font-weight:bold"><td style="padding:3px 5px;border:1px solid #ccc" colspan="2">Totale contanti</td><td style="padding:3px 5px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right;color:#639922;font-size:11px">€ ' + _sep(totCont.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})) + '</td></tr>';

  // Spese
  var totSp = 0, spH = '';
  document.querySelectorAll('#fg-spese-lista > div').forEach(function(r) {
    var n2 = r.querySelector('.fg-spesa-nota').value || '—';
    var i = parseFloat(r.querySelector('.fg-spesa-importo').value) || 0;
    if (i > 0 || n2.trim()) { totSp += i; spH += '<tr><td style="padding:3px 6px;border:1px solid #ccc">' + esc(n2) + '</td><td style="padding:3px 6px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right;color:#A32D2D">− € ' + i.toFixed(2) + '</td></tr>'; }
  });
  spH += '<tr style="background:#FCEBEB;font-weight:bold"><td style="padding:4px 6px;border:1px solid #ccc">Totale spese</td><td style="padding:4px 6px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right;color:#A32D2D">− € ' + totSp.toFixed(2) + '</td></tr>';

  // Quadratura
  var contAtt = Math.max(0, d.totEuro - d.totCarte);
  var crN = d.creditiEmessi - d.rimborsi - d.rimborsiPrec;
  var daV = Math.round((contAtt + crN - totSp) * 100) / 100;
  var diff = Math.round((totCont - daV) * 100) / 100;
  var dC = Math.abs(diff) < 0.01 ? '#639922' : '#A32D2D';
  var dB = Math.abs(diff) < 0.01 ? '#EAF3DE' : '#FCEBEB';

  // Pompe orizzontali
  var thP = '', tI = '', tO = '', tD = '';
  pompe.forEach(function(p) {
    var pi = cacheProdotti.find(function(pp){ return pp.nome === p.prodotto; });
    var col = pi ? pi.colore : '#888';
    var lO = d.oggiMap[p.id]; var vO = lO ? Number(lO.lettura) : null; var vI = d.ieriMap[p.id];
    var li = (vO !== null && vI !== undefined) ? Math.max(0, vO - vI) : 0;
    thP += '<th style="padding:4px;border:1px solid #C04A20;text-align:center;background:' + col + ';color:#fff;font-size:7px;text-transform:uppercase">' + esc(p.prodotto) + '<br/>' + esc(p.nome) + '</th>';
    tI += '<td style="padding:4px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right;font-size:9px">' + (vI !== undefined ? _sep(vI.toLocaleString('it-IT', {maximumFractionDigits:1})) : '—') + '</td>';
    tO += '<td style="padding:4px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right;font-weight:bold;font-size:9px">' + (vO !== null ? _sep(vO.toLocaleString('it-IT', {maximumFractionDigits:1})) : '—') + '</td>';
    tD += '<td style="padding:4px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right;font-weight:bold;font-size:9px">' + (li > 0 ? _sep(li.toLocaleString('it-IT', {maximumFractionDigits:1})) : '—') + '</td>';
  });

  // Riepilogo prodotti
  var rieH = '';
  Object.keys(d.litriPerProdotto).forEach(function(pr) {
    var pp = d.litriPerProdotto[pr];
    var pi = cacheProdotti.find(function(p){ return p.nome === pr; });
    var col = pi ? pi.colore : '#888';
    rieH += '<tr><td style="padding:4px 6px;border:1px solid #ccc;font-weight:600"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + col + ';margin-right:3px"></span>' + esc(pr) + '</td><td style="padding:4px 6px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right">' + _sep(pp.litri.toLocaleString('it-IT', {maximumFractionDigits:1})) + '</td><td style="padding:4px 6px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right">€ ' + pp.prezzo.toFixed(3) + '</td><td style="padding:4px 6px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right;font-weight:bold">€ ' + _sep(pp.euro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})) + '</td></tr>';
  });

  // HTML completo
  var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Foglio Giornaliero ' + data + '</title>';
  h += '<style>body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:10mm;color:#1a1a18}@media print{.no-print{display:none!important}@page{size:portrait;margin:8mm}}@media(max-width:600px){body{padding:4mm;font-size:9px}.fg-grid{grid-template-columns:1fr!important}}table{width:100%;border-collapse:collapse}.sect{font-size:10px;font-weight:bold;color:#D85A30;text-transform:uppercase;letter-spacing:0.4px;border-bottom:2px solid #D85A30;padding-bottom:3px;margin:10px 0 5px}.m{font-family:Courier New,monospace;text-align:right}</style></head><body>';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #D85A30;padding-bottom:8px;margin-bottom:8px"><div><div style="font-size:18px;font-weight:bold;color:#D85A30">FOGLIO GIORNALIERO STAZIONE</div><div style="font-size:12px;margin-top:3px"><strong>' + dataFmt.charAt(0).toUpperCase() + dataFmt.slice(1) + '</strong></div></div><div style="text-align:right"><div style="font-size:13px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div><div style="font-size:8px;color:#666">Stazione Oppido Mamertina</div></div></div>';
  h += '<div class="sect">⛽ Letture contatori pompe</div>';
  h += '<table><thead><tr><th style="padding:4px;border:1px solid #ccc;text-align:left;background:#f5f5f0;font-size:7px"></th>' + thP + '</tr></thead><tbody>';
  h += '<tr><td style="padding:4px 5px;border:1px solid #ccc;font-weight:600;background:#f8f8f5;font-size:9px">Lettura gg. prima</td>' + tI + '</tr>';
  h += '<tr><td style="padding:4px 5px;border:1px solid #ccc;font-weight:600;background:#f8f8f5;font-size:9px">Lettura oggi</td>' + tO + '</tr>';
  h += '<tr style="background:#FDF3D0"><td style="padding:4px 5px;border:1px solid #ccc;font-weight:bold;font-size:9px">Litri venduti</td>' + tD + '</tr></tbody></table>';
  h += '<table style="margin-top:6px"><thead><tr style="background:#f5f5f0;font-size:7px;text-transform:uppercase"><th style="padding:4px 6px;border:1px solid #ccc;text-align:left"></th><th style="padding:4px 6px;border:1px solid #ccc;text-align:right">Litri</th><th style="padding:4px 6px;border:1px solid #ccc;text-align:right">€/L</th><th style="padding:4px 6px;border:1px solid #ccc;text-align:right">Totale</th></tr></thead><tbody>' + rieH;
  h += '<tr style="background:#EAF3DE;font-weight:bold"><td style="padding:5px 6px;border:1px solid #ccc;font-size:11px" colspan="2">TOTALE GENERALE</td><td style="border:1px solid #ccc"></td><td style="padding:5px 6px;border:1px solid #ccc;font-family:Courier New,monospace;text-align:right;font-size:12px;color:#639922">€ ' + _sep(d.totEuro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})) + '</td></tr></tbody></table>';
  h += '<div class="fg-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">';
  h += '<div><div class="sect">💳 Vendite carte</div><table><tr><td style="padding:2px 4px;border:1px solid #ccc;font-size:9px">Bancomat</td><td class="m" style="padding:2px 4px;border:1px solid #ccc;font-size:9px">€ ' + d.bancomat.toFixed(2) + '</td></tr><tr><td style="padding:2px 4px;border:1px solid #ccc;font-size:9px">Nexi</td><td class="m" style="padding:2px 4px;border:1px solid #ccc;font-size:9px">€ ' + d.nexi.toFixed(2) + '</td></tr><tr><td style="padding:2px 4px;border:1px solid #ccc;font-size:9px">Carte aziendali</td><td class="m" style="padding:2px 4px;border:1px solid #ccc;font-size:9px">€ ' + d.aziendali.toFixed(2) + '</td></tr><tr style="background:#E6F1FB;font-weight:bold"><td style="padding:3px 4px;border:1px solid #ccc;font-size:9px">Totale</td><td class="m" style="padding:3px 4px;border:1px solid #ccc;font-size:9px;color:#0C447C">€ ' + d.totCarte.toFixed(2) + '</td></tr></table></div>';
  h += '<div><div class="sect">📋 Crediti / rimborsi</div><table><tr><td style="padding:2px 4px;border:1px solid #ccc;font-size:9px">Crediti</td><td class="m" style="padding:2px 4px;border:1px solid #ccc;font-size:9px;color:#639922">+ € ' + d.creditiEmessi.toFixed(2) + '</td></tr><tr><td style="padding:2px 4px;border:1px solid #ccc;font-size:9px">Rimborsi</td><td class="m" style="padding:2px 4px;border:1px solid #ccc;font-size:9px;color:#A32D2D">− € ' + d.rimborsi.toFixed(2) + '</td></tr><tr><td style="padding:2px 4px;border:1px solid #ccc;font-size:9px">Rimb. gg prec.</td><td class="m" style="padding:2px 4px;border:1px solid #ccc;font-size:9px;color:#A32D2D">− € ' + d.rimborsiPrec.toFixed(2) + '</td></tr><tr style="background:#FAEEDA;font-weight:bold"><td style="padding:3px 4px;border:1px solid #ccc;font-size:9px">Saldo</td><td class="m" style="padding:3px 4px;border:1px solid #ccc;font-size:9px;color:#633806">' + (crN >= 0 ? '+' : '−') + ' € ' + Math.abs(crN).toFixed(2) + '</td></tr></table></div>';
  h += '<div><div class="sect">💶 Incassi contanti</div><table>' + tagliH + '</table></div></div>';
  h += '<div class="sect">📝 Spese per contanti</div><table>' + spH + '</table>';
  h += '<div class="sect">✅ Quadratura giornata</div><table>';
  h += '<tr><td style="padding:4px 6px;border:1px solid #ccc">Totale vendite</td><td class="m" style="padding:4px 6px;border:1px solid #ccc;font-weight:bold">€ ' + _sep(d.totEuro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})) + '</td></tr>';
  h += '<tr><td style="padding:4px 6px;border:1px solid #ccc">Totale carte</td><td class="m" style="padding:4px 6px;border:1px solid #ccc">€ ' + d.totCarte.toFixed(2) + '</td></tr>';
  h += '<tr><td style="padding:4px 6px;border:1px solid #ccc;font-weight:600">Contanti attesi</td><td class="m" style="padding:4px 6px;border:1px solid #ccc;font-weight:bold">€ ' + contAtt.toFixed(2) + '</td></tr>';
  h += '<tr style="background:#EAF3DE"><td style="padding:5px 6px;border:1px solid #ccc;font-weight:bold;font-size:11px">Da versare</td><td class="m" style="padding:5px 6px;border:1px solid #ccc;font-weight:bold;font-size:12px;color:#639922">€ ' + daV.toFixed(2) + '</td></tr>';
  h += '<tr><td style="padding:4px 6px;border:1px solid #ccc;font-weight:600">Contanti contati</td><td class="m" style="padding:4px 6px;border:1px solid #ccc;font-weight:bold">€ ' + _sep(totCont.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})) + '</td></tr>';
  h += '<tr style="background:' + dB + '"><td style="padding:5px 6px;border:1px solid #ccc;font-weight:bold;font-size:11px">Differenza</td><td class="m" style="padding:5px 6px;border:1px solid #ccc;font-weight:bold;font-size:12px;color:' + dC + '">' + (diff >= 0 ? '+' : '−') + ' € ' + Math.abs(diff).toFixed(2) + '</td></tr></table>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px"><div><div style="font-size:8px;color:#666;margin-bottom:3px">Operatore di turno</div><div style="border-bottom:1px solid #999;min-height:32px"></div><div style="font-size:7px;color:#999;margin-top:2px">Data e firma</div></div><div><div style="font-size:8px;color:#666;margin-bottom:3px">Responsabile</div><div style="border-bottom:1px solid #999;min-height:32px"></div><div style="font-size:7px;color:#999;margin-top:2px">Data e firma</div></div></div>';
  h += '<div style="margin-top:10px;border-top:1px solid #ddd;padding-top:4px;display:flex;justify-content:space-between;font-size:7px;color:#999"><span>PhoenixFuel — Foglio giornaliero stazione Oppido</span><span>Generato: ' + new Date().toLocaleString('it-IT') + '</span></div>';
  h += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D85A30;color:#fff">🖨️ Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button></div></body></html>';
  w.document.open(); w.document.write(h); w.document.close();
}

function generaFoglioGiornaliero() { stampaFoglioGiornaliero(); }

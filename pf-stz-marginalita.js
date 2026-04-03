// PhoenixFuel — Stazione: Marginalità e CMP
// ══════════════════════════════════════════════════════════════
// ── MARGINALITÀ STAZIONE ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════

async function caricaMarginalita() {
  // Carica ultimi 90 giorni per performance
  var limDate = new Date(); limDate.setDate(limDate.getDate()-90);
  var limISO = limDate.toISOString().split('T')[0];

  const [lettRes, pompeRes, prezziRes, costiRes, cisRes, cmpRes] = await Promise.all([
    sb.from('stazione_letture').select('*').gte('data',limISO).order('data',{ascending:false}),
    sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine'),
    sb.from('stazione_prezzi').select('*').gte('data',limISO).order('data',{ascending:false}),
    sb.from('stazione_costi').select('*').gte('data',limISO).order('data',{ascending:false}),
    sb.from('cisterne').select('prodotto,livello_attuale,costo_medio').eq('sede','stazione_oppido'),
    sb.from('stazione_cmp_storico').select('*').eq('sede','stazione_oppido').order('created_at',{ascending:false}).limit(20)
  ]);

  const letture = lettRes.data;
  const pompe = pompeRes.data;
  const prezzi = prezziRes.data;
  const costi = costiRes.data;
  const cisterne = cisRes.data;
  const cmpStorico = cmpRes.data;

  if (!letture||!letture.length) {
    document.getElementById('marg-pompe-content').innerHTML='<div class="loading">Nessuna lettura disponibile</div>';
    document.getElementById('marg-data-label').textContent = '—';
    return;
  }

  const dateUniche = [...new Set(letture.map(l=>l.data))].sort().reverse();
  const pompeMap = {}; (pompe||[]).forEach(p=>pompeMap[p.id]=p);
  const prezziMap = {}; (prezzi||[]).forEach(p=>{ prezziMap[p.data+'_'+p.prodotto]=p.prezzo_litro; });
  const costiMap = {}; (costi||[]).forEach(c=>{ costiMap[c.data+'_'+c.prodotto]=Number(c.costo_litro); });
  const lettureByData = {};
  letture.forEach(l => { if(!lettureByData[l.data]) lettureByData[l.data]=[]; lettureByData[l.data].push(l); });
  const lettureByPompa = {};
  letture.forEach(l => { if(!lettureByPompa[l.pompa_id]) lettureByPompa[l.pompa_id]=[]; lettureByPompa[l.pompa_id].push(l); });

  // Calcola CMP corrente per prodotto (media ponderata cisterne)
  const cmpCorrente = {};
  const cmpPerProdotto = {};
  (cisterne||[]).forEach(c => {
    var p = c.prodotto;
    if (!cmpPerProdotto[p]) cmpPerProdotto[p] = { litri:0, valore:0 };
    var liv = Number(c.livello_attuale||0);
    var cm = Number(c.costo_medio||0);
    cmpPerProdotto[p].litri += liv;
    cmpPerProdotto[p].valore += liv * cm;
  });
  Object.entries(cmpPerProdotto).forEach(function([p,v]) {
    cmpCorrente[p] = v.litri > 0 ? Math.round((v.valore / v.litri) * 1000000) / 1000000 : 0;
  });

  window._margData = { dateUniche, pompeMap, prezziMap, costiMap, lettureByData, lettureByPompa, pompe, indice: 0, cmpCorrente, cmpStorico: cmpStorico||[] };
  renderMargGiorno(0);
  renderStoricoMarg();
  renderStoricoCMP();
}

function renderStoricoMarg() {
  var m = window._margData;
  if (!m) return;
  var tbody = document.getElementById('marg-storico-tabella');
  if (!tbody) return;
  var html = '';
  // Ultimi 30 giorni con dati
  var giorniDaMostrare = m.dateUniche.slice(0, 30);
  giorniDaMostrare.forEach(function(data) {
    var lettG = m.lettureByData[data] || [];
    var litriGas=0, litriBenz=0, venduto=0, costoTot=0;
    lettG.forEach(function(l) {
      var pompa = m.pompeMap[l.pompa_id]; if (!pompa) return;
      var storPompa = (m.lettureByPompa[l.pompa_id]||[]).sort(function(a,b){return b.data.localeCompare(a.data);});
      var myIdx = storPompa.findIndex(function(x){return x.id===l.id;});
      var prec = myIdx < storPompa.length-1 ? storPompa[myIdx+1] : null;
      var litri = prec ? Number(l.lettura)-Number(prec.lettura) : 0;
      if (litri <= 0) return;
      var prezzo = Number(m.prezziMap[data+'_'+pompa.prodotto]||0);
      var costo = m.costiMap[data+'_'+pompa.prodotto] || 0;
      var litriPD = Number(l.litri_prezzo_diverso||0);
      var prezzoPD = Number(l.prezzo_diverso||0);
      var hasCambio = litriPD > 0 && prezzoPD > 0;
      var litriStd = hasCambio ? Math.max(0, litri - litriPD) : litri;
      var prezzoN = prezzo / 1.22, prezzoPDN = prezzoPD / 1.22;
      var vend = (litriStd * prezzoN) + (hasCambio ? litriPD * prezzoPDN : 0);
      var costoG = litri * costo;
      venduto += vend;
      costoTot += costoG;
      var isGasolio = pompa.prodotto.toLowerCase().indexOf('gasolio') >= 0;
      if (isGasolio) litriGas += litri; else litriBenz += litri;
    });
    var margine = venduto - costoTot;
    var totLitri = litriGas + litriBenz;
    var margL = totLitri > 0 ? margine / totLitri : 0;
    var hasCosti = costoTot > 0;
    var margColor = margine >= 0 ? '#639922' : '#E24B4A';
    var dataFmt = new Date(data).toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'short'});
    html += '<tr><td><strong>' + dataFmt + '</strong></td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(litriGas) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(litriBenz) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtE(venduto) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + (hasCosti ? fmtE(costoTot) : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:bold;color:' + (hasCosti?margColor:'var(--text-muted)') + '">' + (hasCosti ? fmtE(margine) : '—') + '</td>' +
      '<td style="font-family:var(--font-mono);color:' + (hasCosti?margColor:'var(--text-muted)') + '">' + (hasCosti ? '€ ' + margL.toFixed(4) : '—') + '</td></tr>';
  });
  tbody.innerHTML = html || '<tr><td colspan="7" class="loading">Nessun dato</td></tr>';
}

function renderStoricoCMP() {
  var m = window._margData;
  if (!m) return;

  // CMP corrente
  var cmpEl = document.getElementById('marg-cmp-corrente');
  if (cmpEl && m.cmpCorrente) {
    var cmpHtml = '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    Object.entries(m.cmpCorrente).forEach(function([prodotto, cmp]) {
      var _pi = cacheProdotti.find(function(p){return p.nome===prodotto;}); var colore = _pi ? _pi.colore : '#888';
      cmpHtml += '<div style="flex:1;min-width:140px;padding:10px 14px;background:var(--bg);border-radius:8px;border-left:3px solid ' + colore + '">';
      cmpHtml += '<div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px">' + esc(prodotto) + '</div>';
      cmpHtml += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700">€ ' + (cmp > 0 ? cmp.toFixed(4) : '—') + '</div>';
      cmpHtml += '<div style="font-size:9px;color:var(--text-muted)">CMP corrente</div>';
      cmpHtml += '</div>';
    });
    cmpHtml += '</div>';
    cmpEl.innerHTML = cmpHtml;
  }

  // Storico CMP
  var tbody = document.getElementById('marg-cmp-storico');
  if (!tbody) return;
  var storico = m.cmpStorico || [];
  if (!storico.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessuna variazione registrata</td></tr>';
    return;
  }
  var html = '';
  storico.slice(0, 20).forEach(function(r) {
    var _pi = cacheProdotti.find(function(p){return p.nome===r.prodotto;}); var colore = _pi ? _pi.colore : '#888';
    var dataFmt = new Date(r.data).toLocaleDateString('it-IT');
    html += '<tr>' +
      '<td>' + dataFmt + '</td>' +
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:4px"></span>' + esc(r.prodotto) + '</td>' +
      '<td style="font-family:var(--font-mono);color:var(--text-muted)">€ ' + Number(r.cmp_precedente).toFixed(4) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(r.litri_caricati) + ' L</td>' +
      '<td style="font-family:var(--font-mono)">€ ' + Number(r.costo_carico).toFixed(4) + '/L</td>' +
      '<td style="font-family:var(--font-mono);font-weight:bold;color:#639922">€ ' + Number(r.cmp_nuovo).toFixed(4) + '</td>' +
      '</tr>';
  });
  tbody.innerHTML = html;
}

function margGiorno(dir) {
  if (!window._margData) return;
  var m = window._margData;
  var nuovoIdx = m.indice - dir;
  if (nuovoIdx < 0 || nuovoIdx >= m.dateUniche.length) return;
  m.indice = nuovoIdx;
  renderMargGiorno(nuovoIdx);
}

function renderMargGiorno(idx) {
  var m = window._margData;
  if (!m) return;
  var data = m.dateUniche[idx];
  var lettureGiorno = m.lettureByData[data] || [];

  var dataFmt = new Date(data).toLocaleDateString('it-IT', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
  document.getElementById('marg-data-label').textContent = dataFmt;
  // Label OGGI/DOMANI/IERI + giorno settimana
  var elLbl = document.getElementById('marg-data-lbl');
  var elDay = document.getElementById('marg-data-day');
  if (elLbl) {
    var oggi = new Date(); oggi.setHours(0,0,0,0);
    var sel = new Date(data + 'T12:00:00'); sel.setHours(0,0,0,0);
    var diff = Math.round((sel - oggi) / 86400000);
    if (diff === 0) { elLbl.textContent = 'OGGI'; elLbl.style.background = '#378ADD'; elLbl.style.color = '#fff'; elLbl.style.display = 'inline-block'; }
    else if (diff === 1) { elLbl.textContent = 'DOMANI'; elLbl.style.background = '#639922'; elLbl.style.color = '#fff'; elLbl.style.display = 'inline-block'; }
    else if (diff === -1) { elLbl.textContent = 'IERI'; elLbl.style.background = '#BA7517'; elLbl.style.color = '#fff'; elLbl.style.display = 'inline-block'; }
    else { elLbl.style.display = 'none'; }
  }
  if (elDay) {
    var selD = new Date(data + 'T12:00:00');
    var GIORNI = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
    var dayColors = { 0:['#FCEBEB','#791F1F'], 1:['#E6F1FB','#0C447C'], 2:['#E6F1FB','#0C447C'], 3:['#E6F1FB','#0C447C'], 4:['#E6F1FB','#0C447C'], 5:['#E6F1FB','#0C447C'], 6:['#EEEDFE','#3C3489'] };
    var dc = dayColors[selD.getDay()];
    elDay.textContent = GIORNI[selD.getDay()];
    elDay.style.background = dc[0]; elDay.style.color = dc[1]; elDay.style.display = 'inline-block';
  }

  var el = document.getElementById('marg-pompe-content');
  var html = '';

  // Ordina per ordine pompa (come Totalizzatori: Pompa 1, 2, 3, 4)
  var lettureOrdinate = lettureGiorno.slice().sort(function(a, b) {
    var pa = m.pompeMap[a.pompa_id]; var pb = m.pompeMap[b.pompa_id];
    return ((pa && pa.ordine) || 99) - ((pb && pb.ordine) || 99);
  });

  lettureOrdinate.forEach(function(l) {
    var pompa = m.pompeMap[l.pompa_id];
    if (!pompa) return;
    var _pi = cacheProdotti.find(function(pp){return pp.nome===pompa.prodotto;}); var colore = _pi ? _pi.colore : '#888';
    // Lettura precedente
    var storPompa = (m.lettureByPompa[l.pompa_id]||[]).sort(function(a,b){return b.data.localeCompare(a.data);});
    var myIdx = storPompa.findIndex(function(x){return x.id===l.id;});
    var prec = myIdx < storPompa.length-1 ? storPompa[myIdx+1] : null;
    var litri = prec ? Number(l.lettura)-Number(prec.lettura) : 0;
    if (litri < 0) litri = 0;
    var prezzo = Number(m.prezziMap[data+'_'+pompa.prodotto]||0);

    // Cambio prezzo
    var litriPD = Number(l.litri_prezzo_diverso||0);
    var prezzoPD = Number(l.prezzo_diverso||0);
    var hasCambio = litriPD > 0 && prezzoPD > 0;
    var litriStd = hasCambio ? Math.max(0, litri - litriPD) : litri;

    // Costo salvato o CMP come default
    var costoSaved = m.costiMap[data+'_'+pompa.prodotto] || '';
    var costoProposto = costoSaved;
    var isCMP = false;
    if (!costoProposto && m.cmpCorrente && m.cmpCorrente[pompa.prodotto]) {
      costoProposto = m.cmpCorrente[pompa.prodotto];
      isCMP = true;
    }

    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:4px solid ' + colore + ';border-radius:10px;padding:14px;margin-bottom:10px">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><div style="width:10px;height:10px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:16px">' + esc(pompa.nome) + '</strong><span style="font-size:13px;color:var(--text-muted);margin-left:auto">' + esc(pompa.prodotto) + ' — ' + fmtL(litri) + ' L totali</span></div>';

    var prezzoN = prezzo ? (prezzo / 1.22) : 0;
    var costoIva = costoProposto ? (Number(costoProposto) * 1.22).toFixed(3) : '';
    var cmpBadge = isCMP ? ' <span style="font-size:8px;background:#378ADD;color:#fff;padding:1px 4px;border-radius:3px">CMP</span>' : '';
    var brdCol = isCMP ? '#378ADD' : 'var(--border)';
    var inpStyle = 'font-family:var(--font-mono);font-size:16px;font-weight:600;padding:5px 10px;border-radius:6px;background:#fff;color:#1a1a18;width:115px;text-align:right;border:0.5px solid ';

    // Riga litri standard
    html += '<div style="display:grid;grid-template-columns:0.8fr 1fr 1.2fr 1.2fr;gap:8px;align-items:start;padding:8px 12px;background:var(--bg-card);border-radius:8px;border:0.5px solid var(--border);margin-bottom:6px">';
    // Col 1: Litri
    html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Litri</div><div style="font-family:var(--font-mono);font-size:20px;font-weight:700">' + fmtL(litriStd) + '</div></div>';
    // Col 2: Vendita netto + IVA
    html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Vendita €/L</div>';
    html += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:600;color:#1a1a18">' + (prezzoN ? '€ ' + prezzoN.toFixed(4) + ' <span style="font-size:10px;color:var(--text-muted)">netto</span>' : '—') + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted)">' + (prezzo ? '€ ' + prezzo.toFixed(3) + ' IVA' : '') + '</div>';
    html += '</div>';
    // Col 3: Costo netto + IVA (linked inputs)
    html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Costo €/L' + cmpBadge + '</div>';
    html += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px"><input type="number" class="marg-costo" data-pompa="' + l.pompa_id + '" data-prodotto="' + esc(pompa.prodotto) + '" data-data="' + data + '" data-litri="' + litriStd + '" data-prezzo="' + prezzo + '" value="' + (costoProposto || '') + '" placeholder="0.000" step="0.001" oninput="syncCostoIva(this);copiaCostoMarg(this);calcolaMargini()" style="' + inpStyle + brdCol + '" /><span style="font-size:10px;color:var(--text-muted)">netto</span></div>';
    html += '<div style="display:flex;align-items:center;gap:4px"><input type="number" class="marg-costo-iva" data-linked="' + l.pompa_id + '" value="' + costoIva + '" placeholder="0.000" step="0.001" oninput="syncCostoNetto(this,\'' + l.pompa_id + '\')" style="' + inpStyle + 'var(--border);opacity:0.7" /><span style="font-size:10px;color:var(--text-muted)">IVA</span></div>';
    html += '</div>';
    // Col 4: Margine netto + IVA
    html += '<div id="marg-res-' + l.pompa_id + '"><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Margine €/L</div><div style="font-family:var(--font-mono);font-size:16px;font-weight:700">—</div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-top:4px">Margine tot</div><div style="font-family:var(--font-mono);font-size:16px;font-weight:700">—</div></div>';
    html += '</div>';

    // Riga cambio prezzo
    if (hasCambio) {
      var prezzoPDN = prezzoPD ? (prezzoPD / 1.22) : 0;
      html += '<div style="display:grid;grid-template-columns:0.8fr 1fr 1.2fr 1.2fr;gap:8px;align-items:start;padding:8px 12px;background:#f5f5f0;border-radius:8px;border:0.5px solid var(--border);margin-bottom:6px">';
      // Col 1: Litri cambio
      html += '<div><div style="font-size:11px;color:#1a1a18;text-transform:uppercase">Litri <span style="font-size:9px;background:#1a1a18;color:#fff;padding:1px 4px;border-radius:3px">cambio</span></div><div style="font-family:var(--font-mono);font-size:20px;font-weight:700">' + fmtL(litriPD) + '</div></div>';
      // Col 2: Vendita netto + IVA
      html += '<div><div style="font-size:11px;color:#1a1a18;text-transform:uppercase">Vendita €/L</div>';
      html += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:600">' + (prezzoPDN ? '€ ' + prezzoPDN.toFixed(4) + ' <span style="font-size:10px;color:var(--text-muted)">netto</span>' : '—') + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted)">' + (prezzoPD ? '€ ' + prezzoPD.toFixed(3) + ' IVA' : '') + '</div>';
      html += '</div>';
      // Col 3: Costo netto + IVA
      html += '<div><div style="font-size:11px;color:#1a1a18;text-transform:uppercase">Costo €/L' + cmpBadge + '</div>';
      html += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px"><input type="number" class="marg-costo-cp" data-pompa="' + l.pompa_id + '" data-prodotto="' + esc(pompa.prodotto) + '" data-data="' + data + '" data-litri="' + litriPD + '" data-prezzo="' + prezzoPD + '" value="' + (costoProposto || '') + '" placeholder="0.000" step="0.001" oninput="syncCostoIva(this);copiaCostoMarg(this);calcolaMargini()" style="' + inpStyle + brdCol + '" /><span style="font-size:10px;color:var(--text-muted)">netto</span></div>';
      html += '<div style="display:flex;align-items:center;gap:4px"><input type="number" class="marg-costo-cp-iva" data-linked-cp="' + l.pompa_id + '" value="' + costoIva + '" placeholder="0.000" step="0.001" oninput="syncCostoNettoCp(this,\'' + l.pompa_id + '\')" style="' + inpStyle + 'var(--border);opacity:0.7" /><span style="font-size:10px;color:var(--text-muted)">IVA</span></div>';
      html += '</div>';
      // Col 4: Margine
      html += '<div id="marg-res-cp-' + l.pompa_id + '"><div style="font-size:11px;color:#1a1a18;text-transform:uppercase">Margine €/L</div><div style="font-family:var(--font-mono);font-size:16px;font-weight:700">—</div><div style="font-size:11px;color:#1a1a18;text-transform:uppercase;margin-top:4px">Margine tot</div><div style="font-family:var(--font-mono);font-size:16px;font-weight:700">—</div></div>';
      html += '</div>';
    }

    html += '</div>';
  });

  el.innerHTML = html;
  calcolaMargini();
  _resetSaved('btn-salva-costi');
  var hasCostiSalvati = false;
  document.querySelectorAll('.marg-costo').forEach(function(inp) { if (parseFloat(inp.value) > 0) hasCostiSalvati = true; });
  if (hasCostiSalvati) _markSaved('btn-salva-costi');
}

function copiaCostoMarg(input) {
  var prodotto = input.dataset.prodotto;
  var pompaId = input.dataset.pompa;
  var val = input.value;
  var isCp = input.classList.contains('marg-costo-cp');
  var selector = isCp ? '.marg-costo-cp' : '.marg-costo';
  document.querySelectorAll(selector + '[data-prodotto="' + prodotto + '"]').forEach(function(inp) {
    if (inp.dataset.pompa !== pompaId) {
      inp.value = val;
      syncCostoIva(inp);
    }
  });
}

// Netto → IVA: aggiorna il campo IVA linked
function syncCostoIva(inpNetto) {
  var val = parseFloat(inpNetto.value) || 0;
  var isCp = inpNetto.classList.contains('marg-costo-cp');
  var pompaId = inpNetto.dataset.pompa;
  var selIva = isCp ? '.marg-costo-cp-iva[data-linked-cp="' + pompaId + '"]' : '.marg-costo-iva[data-linked="' + pompaId + '"]';
  var elIva = document.querySelector(selIva);
  if (elIva) elIva.value = val > 0 ? (val * 1.22).toFixed(3) : '';
}

// IVA → Netto (standard)
function syncCostoNetto(inpIva, pompaId) {
  var val = parseFloat(inpIva.value) || 0;
  var netto = val > 0 ? val / 1.22 : 0;
  var elNetto = document.querySelector('.marg-costo[data-pompa="' + pompaId + '"]');
  if (elNetto) {
    elNetto.value = netto > 0 ? netto.toFixed(3) : '';
    copiaCostoMarg(elNetto);
    calcolaMargini();
  }
}

// IVA → Netto (cambio prezzo)
function syncCostoNettoCp(inpIva, pompaId) {
  var val = parseFloat(inpIva.value) || 0;
  var netto = val > 0 ? val / 1.22 : 0;
  var elNetto = document.querySelector('.marg-costo-cp[data-pompa="' + pompaId + '"]');
  if (elNetto) {
    elNetto.value = netto > 0 ? netto.toFixed(3) : '';
    copiaCostoMarg(elNetto);
    calcolaMargini();
  }
}

function calcolaMargini() {
  var litriGasolio=0, euroGasolio=0, margGasolio=0;
  var litriBenzina=0, euroBenzina=0, margBenzina=0;

  // Litri standard
  document.querySelectorAll('.marg-costo').forEach(function(inp) {
    var costo = parseFloat(inp.value) || 0;
    var prezzo = parseFloat(inp.dataset.prezzo) || 0;
    var prezzoN = prezzo / 1.22;
    var litri = parseFloat(inp.dataset.litri) || 0;
    var pompaId = inp.dataset.pompa;
    var prodotto = inp.dataset.prodotto;
    var margL = prezzoN > 0 && costo > 0 ? prezzoN - costo : 0;
    var margTot = margL * litri;
    var isGasolio = prodotto.toLowerCase().indexOf('gasolio') >= 0;

    var elRes = document.getElementById('marg-res-' + pompaId);
    if (elRes) {
      var mColor = margL >= 0 ? '#639922' : '#E24B4A';
      var margLIva = margL * 1.22;
      var margTotIva = margTot * 1.22;
      elRes.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Margine €/L</div>' +
        '<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? '€ ' + margL.toFixed(4) + ' <span style="font-size:10px;font-weight:400;color:var(--text-muted)">netto</span>' : '—') + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted)">' + (costo > 0 ? '€ ' + margLIva.toFixed(4) + ' IVA' : '') + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-top:4px">Margine tot</div>' +
        '<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? fmtE(margTot) + ' <span style="font-size:10px;font-weight:400;color:var(--text-muted)">netto</span>' : '—') + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted)">' + (costo > 0 ? fmtE(margTotIva) + ' IVA' : '') + '</div>';
    }

    if (costo > 0 && litri > 0) {
      if (isGasolio) { litriGasolio += litri; euroGasolio += litri*prezzoN; margGasolio += margTot; }
      else { litriBenzina += litri; euroBenzina += litri*prezzoN; margBenzina += margTot; }
    }
  });

  // Litri cambio prezzo
  document.querySelectorAll('.marg-costo-cp').forEach(function(inp) {
    var costo = parseFloat(inp.value) || 0;
    var prezzo = parseFloat(inp.dataset.prezzo) || 0;
    var prezzoN = prezzo / 1.22;
    var litri = parseFloat(inp.dataset.litri) || 0;
    var pompaId = inp.dataset.pompa;
    var prodotto = inp.dataset.prodotto;
    var margL = prezzoN > 0 && costo > 0 ? prezzoN - costo : 0;
    var margTot = margL * litri;
    var isGasolio = prodotto.toLowerCase().indexOf('gasolio') >= 0;

    var elRes = document.getElementById('marg-res-cp-' + pompaId);
    if (elRes) {
      var mColor = margL >= 0 ? '#639922' : '#E24B4A';
      var margLIva = margL * 1.22;
      var margTotIva = margTot * 1.22;
      elRes.innerHTML = '<div style="font-size:11px;color:#1a1a18;text-transform:uppercase">Margine €/L</div>' +
        '<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? '€ ' + margL.toFixed(4) + ' <span style="font-size:10px;font-weight:400;color:var(--text-muted)">netto</span>' : '—') + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted)">' + (costo > 0 ? '€ ' + margLIva.toFixed(4) + ' IVA' : '') + '</div>' +
        '<div style="font-size:11px;color:#1a1a18;text-transform:uppercase;margin-top:4px">Margine tot</div>' +
        '<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? fmtE(margTot) + ' <span style="font-size:10px;font-weight:400;color:var(--text-muted)">netto</span>' : '—') + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted)">' + (costo > 0 ? fmtE(margTotIva) + ' IVA' : '') + '</div>';
    }

    if (costo > 0 && litri > 0) {
      if (isGasolio) { litriGasolio += litri; euroGasolio += litri*prezzoN; margGasolio += margTot; }
      else { litriBenzina += litri; euroBenzina += litri*prezzoN; margBenzina += margTot; }
    }
  });

  var totLitri = litriGasolio + litriBenzina;
  var totEuro = euroGasolio + euroBenzina;
  var totMarg = margGasolio + margBenzina;

  // Pannello live
  var el = document.getElementById('marg-totali-live');
  if (el) {
    var fmtN = function(v){return '€ ' + v.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});};
    el.innerHTML =
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.5);margin-bottom:14px;font-weight:600">Marginalità live</div>' +
      '<div style="margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#BA7517"></div><span style="font-size:11px;font-weight:600;color:#fff">GASOLIO</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#fff">' + litriGasolio.toLocaleString('it-IT',{maximumFractionDigits:0}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto netto</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:#7CFC00">' + fmtN(euroGasolio) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Venduto IVA</span><span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.4)">' + fmtN(euroGasolio*1.22) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine netto</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:800;color:' + (margGasolio>=0?'#7CFC00':'#FF6B6B') + '">' + fmtN(margGasolio) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Margine IVA</span><span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.4)">' + fmtN(margGasolio*1.22) + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#378ADD"></div><span style="font-size:11px;font-weight:600;color:#87CEFA">BENZINA</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#87CEFA">' + litriBenzina.toLocaleString('it-IT',{maximumFractionDigits:0}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto netto</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:#7CFC00">' + fmtN(euroBenzina) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Venduto IVA</span><span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.4)">' + fmtN(euroBenzina*1.22) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine netto</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:800;color:' + (margBenzina>=0?'#7CFC00':'#FF6B6B') + '">' + fmtN(margBenzina) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Margine IVA</span><span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.4)">' + fmtN(margBenzina*1.22) + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:12px">' +
        '<div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:6px">TOTALE GIORNATA</div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:#fff">' + totLitri.toLocaleString('it-IT',{maximumFractionDigits:0}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto netto</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:800;color:#7CFC00">' + fmtN(totEuro) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Venduto IVA</span><span style="font-family:var(--font-mono);font-size:12px;color:rgba(255,255,255,0.4)">' + fmtN(totEuro*1.22) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine netto</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:800;color:' + (totMarg>=0?'#7CFC00':'#FF6B6B') + '">' + fmtN(totMarg) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Margine IVA</span><span style="font-family:var(--font-mono);font-size:12px;color:rgba(255,255,255,0.4)">' + fmtN(totMarg*1.22) + '</span></div>' +
      '</div>';
  }
}

async function salvaCostiMarg() {
  if (!_checkSaved('btn-salva-costi')) return;
  var inputs = document.querySelectorAll('.marg-costo');
  var salvati = {}, anyOffline = false;
  var ops = [];
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    var costo = parseFloat(inp.value);
    if (isNaN(costo) || costo <= 0) continue;
    var key = inp.dataset.data + '_' + inp.dataset.prodotto;
    if (salvati[key]) continue;
    ops.push(_sbWrite('stazione_costi', 'upsert', { data:inp.dataset.data, prodotto:inp.dataset.prodotto, costo_litro:costo }, 'data,prodotto'));
    salvati[key] = true;
  }
  if (!ops.length) { toast('Inserisci almeno un costo'); return; }
  var results = await Promise.all(ops);
  anyOffline = results.some(function(r) { return r._offline; });
  var errore = results.find(function(r) { return r.error; });
  if (errore) { toast('Errore: ' + errore.error.message); return; }
  var count = Object.keys(salvati).length;
  // Aggiorna cache
  var m = window._margData;
  if (m) {
    for (var k in salvati) {
      var parts = k.split('_'); var d = parts[0]; var p = parts.slice(1).join('_');
      var inp2 = document.querySelector('.marg-costo[data-data="'+d+'"][data-prodotto="'+p+'"]');
      if (inp2) m.costiMap[d+'_'+p] = parseFloat(inp2.value);
    }
  }
  // Toast viene mostrato alla fine della funzione

  // ═══ Auto-crea costi per giorno successivo da CMP cisterne ═══
  try {
    // Trova la data dei costi salvati
    var dataCorr = null;
    var inputs2 = document.querySelectorAll('.marg-costo');
    for (var j = 0; j < inputs2.length; j++) { if (inputs2[j].dataset.data) { dataCorr = inputs2[j].dataset.data; break; } }
    if (dataCorr) {
      var domani = new Date(new Date(dataCorr).getTime() + 86400000).toISOString().split('T')[0];
      var { data: cisterne } = await sb.from('cisterne').select('prodotto,livello_attuale,costo_medio').eq('sede','stazione_oppido');
      if (cisterne && cisterne.length) {
        // Calcola CMP per prodotto
        var cmpPerProdotto = {};
        cisterne.forEach(function(c) {
          if (!cmpPerProdotto[c.prodotto]) cmpPerProdotto[c.prodotto] = { litri:0, valore:0 };
          cmpPerProdotto[c.prodotto].litri += Number(c.livello_attuale||0);
          cmpPerProdotto[c.prodotto].valore += Number(c.livello_attuale||0) * Number(c.costo_medio||0);
        });
        var costiDomani = [];
        Object.entries(cmpPerProdotto).forEach(function([prodotto, v]) {
          var cmp = v.litri > 0 ? Math.round(v.valore / v.litri * 1000000) / 1000000 : 0;
          if (cmp > 0) {
            costiDomani.push(sb.from('stazione_costi').upsert({ data: domani, prodotto: prodotto, costo_litro: cmp }, { onConflict:'data,prodotto' }));
          }
        });
        if (costiDomani.length) {
          await Promise.all(costiDomani);
          toast('Costi ' + domani + ' preparati da CMP');
        }
      }
    }
  } catch(e) { console.warn('Auto costi domani:', e); }

  renderStoricoMarg();

  // Auto-avanza: ricarica marginalità con i nuovi dati
  if (dataCorr) {
    var domani = new Date(new Date(dataCorr).getTime() + 86400000).toISOString().split('T')[0];
    toast(anyOffline ? '⚡ ' + count + ' costi salvati offline' : count + ' costi salvati! Dati ' + domani + ' preparati.');
    _markSaved('btn-salva-costi');
    await caricaMarginalita();
  } else {
    toast(anyOffline ? '⚡ ' + count + ' costi salvati offline' : count + ' costi salvati!');
    _markSaved('btn-salva-costi');
  }
}

// ── Prezzi pompa ──

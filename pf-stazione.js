// PhoenixFuel — Stazione Oppido
// ── STAZIONE OPPIDO ──────────────────────────────────────────────
function switchStazioneTab(btn) {
  document.querySelectorAll('.stz-tab').forEach(b => { b.style.background='var(--bg)'; b.style.color='var(--text)'; b.style.border='0.5px solid var(--border)'; b.classList.remove('active'); });
  btn.style.background=''; btn.style.color=''; btn.style.border=''; btn.classList.add('active');
  document.querySelectorAll('.stz-panel').forEach(p => p.style.display='none');
  document.getElementById(btn.dataset.tab).style.display='';
  const loaders = { 'stz-dashboard':caricaStazioneDashboard, 'stz-letture':caricaTabLetture, 'stz-prezzi':caricaTabPrezzi, 'stz-versamenti':caricaTabVersamenti, 'stz-magazzino':caricaMagazzinoStazione, 'stz-marginalita':caricaMarginalita, 'stz-cassa':caricaCassa, 'stz-foglio':caricaFoglioGiornaliero, 'stz-giacenze':caricaGiacenzeMensili, 'stz-allegati':caricaAllegati, 'stz-report':initReportStazione };
  if (loaders[btn.dataset.tab]) loaders[btn.dataset.tab]();
}

async function caricaStazione() {
  // Nascondi tab senza permesso
  _applicaPermessiTab('stazione', '.stz-tab', {
    'stz-dashboard':'stazione.dashboard', 'stz-letture':'stazione.letture',
    'stz-prezzi':'stazione.prezzi', 'stz-versamenti':'stazione.versamenti',
    'stz-magazzino':'stazione.magazzino', 'stz-marginalita':'stazione.marginalita',
    'stz-cassa':'stazione.cassa', 'stz-report':'stazione.report'
  });
  // Init date fields
  document.getElementById('stz-data-lettura').value = oggiISO;
  document.getElementById('stz-data-lettura').onchange = function() { caricaFormLetture(); };
  document.getElementById('stz-data-prezzo').value = oggiISO;
  document.getElementById('stz-data-vers').value = oggiISO;
  caricaStazioneDashboard();
  _popolaSelAnnoGiac('giac-stz-anno');
}

// ── Dashboard ──
async function caricaOrdiniDaCaricare() {
  const { data: ordini } = await sb.from('ordini').select('*').eq('tipo_ordine','stazione_servizio').eq('stato','confermato').or('ricevuto_stazione.eq.false,ricevuto_stazione.is.null').order('data',{ascending:false});
  const el = document.getElementById('stz-da-caricare');
  if (!el) return;
  if (!ordini || !ordini.length) { el.innerHTML = ''; return; }

  let html = '<div class="card" style="border-left:4px solid #6B5FCC">';
  html += '<div class="card-title" style="color:#6B5FCC">📦 Ordini in arrivo — da ricevere in cisterna (' + ordini.length + ')</div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Prodotto</th><th>Litri</th><th>Fornitore</th><th>Stato</th><th></th></tr></thead><tbody>';
  ordini.forEach(function(r) {
    const dataFmt = new Date(r.data).toLocaleDateString('it-IT');
    const _pi = cacheProdotti.find(function(p) { return p.nome === r.prodotto; });
    const colore = _pi ? _pi.colore : '#888';
    html += '<tr>' +
      '<td>' + dataFmt + '</td>' +
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:4px"></span>' + esc(r.prodotto) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td>' +
      '<td>' + esc(r.fornitore) + '</td>' +
      '<td>' + badgeStato(r.stato) + '</td>' +
      '<td><button class="btn-primary" style="font-size:11px;padding:4px 12px;background:#639922" onclick="riceviOrdineStazione(\'' + r.id + '\',' + r.litri + ',\'' + esc(r.prodotto) + '\')">📦 Ricevi</button></td>' +
      '</tr>';
  });
  html += '</tbody></table></div></div>';
  el.innerHTML = html;
}

async function riceviOrdineStazione(ordineId, litri, prodotto) {
  // Trova cisterne stazione per questo prodotto
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','stazione_oppido').eq('prodotto',prodotto).order('nome');
  if (!cisterne || !cisterne.length) { toast('Nessuna cisterna trovata per ' + prodotto + ' alla stazione'); return; }

  // Carica dati ordine per mostrare costo
  const { data: ordine } = await sb.from('ordini').select('costo_litro,trasporto_litro').eq('id',ordineId).single();
  const costoOrdine = ordine ? Number(ordine.costo_litro||0) + Number(ordine.trasporto_litro||0) : 0;

  const prodInfo = cacheProdotti.find(p => p.nome === prodotto);
  const colore = prodInfo ? prodInfo.colore : '#888';
  const totLitri = Number(litri);

  // Calcola CMP attuale per questo prodotto
  let litriAttuali = 0, valoreAttuale = 0;
  cisterne.forEach(c => { litriAttuali += Number(c.livello_attuale||0); valoreAttuale += Number(c.livello_attuale||0) * Number(c.costo_medio||0); });
  const cmpAttuale = litriAttuali > 0 ? valoreAttuale / litriAttuali : 0;
  const cmpDopo = (litriAttuali + totLitri) > 0 ? (valoreAttuale + totLitri * costoOrdine) / (litriAttuali + totLitri) : costoOrdine;

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">📦 Ricezione ' + esc(prodotto) + '</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Quantità da caricare: <strong style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</strong></div>';

  // Info CMP
  html += '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">';
  html += '<div style="flex:1;min-width:100px;padding:8px 12px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Costo carico</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">€ ' + costoOrdine.toFixed(4) + '</div></div>';
  html += '<div style="flex:1;min-width:100px;padding:8px 12px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">CMP attuale</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">' + (cmpAttuale > 0 ? '€ ' + cmpAttuale.toFixed(4) : '—') + '</div></div>';
  html += '<div style="flex:1;min-width:100px;padding:8px 12px;background:#EAF3DE;border-radius:8px;border:0.5px solid #639922"><div style="font-size:9px;color:#27500A;text-transform:uppercase">CMP dopo carico</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#639922">€ ' + cmpDopo.toFixed(4) + '</div></div>';
  html += '</div>';

  html += '<div style="margin-bottom:12px">';
  cisterne.forEach(c => {
    const capMax = Number(c.capacita_max);
    const livAtt = Number(c.livello_attuale);
    const spazio = Math.max(0, capMax - livAtt);
    const pct = capMax > 0 ? Math.round((livAtt / capMax) * 100) : 0;
    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
    html += '<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:6px"></span><strong>' + esc(c.nome) + '</strong></div>';
    html += '<span style="font-size:11px;color:var(--text-muted)">' + pct + '% — ' + fmtL(livAtt) + ' / ' + fmtL(capMax) + ' — spazio: <strong>' + fmtL(spazio) + '</strong></span>';
    html += '</div>';
    html += '<div style="height:6px;background:var(--border);border-radius:3px;margin-bottom:8px"><div style="height:100%;width:' + pct + '%;background:' + colore + ';border-radius:3px;opacity:0.7"></div></div>';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:12px;width:80px">Litri da caricare:</span><input type="number" class="stz-ricevi-input" data-cisterna="' + c.id + '" data-spazio="' + spazio + '" value="0" min="0" max="' + (capMax * 1.1) + '" step="100" oninput="calcolaRicezioneStazione(' + totLitri + ')" style="font-family:var(--font-mono);font-size:15px;font-weight:600;padding:8px 12px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text);width:140px;max-width:100%;text-align:right" /></div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div id="stz-ricevi-totale" style="padding:10px 14px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border);margin-bottom:12px;font-size:13px"></div>';
  html += '<div style="display:flex;gap:8px"><button class="btn-primary" style="flex:1;background:#639922" onclick="confermaRicezioneStazione(\'' + ordineId + '\',' + totLitri + ')">✅ Conferma ricezione</button><button class="btn-secondary" onclick="chiudiModal()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button></div>';

  apriModal(html);
  calcolaRicezioneStazione(totLitri);
}

function calcolaRicezioneStazione(totLitri) {
  const inputs = document.querySelectorAll('.stz-ricevi-input');
  let totAssegnati = 0;
  inputs.forEach(inp => { totAssegnati += parseFloat(inp.value) || 0; });
  const diff = totLitri - totAssegnati;
  const el = document.getElementById('stz-ricevi-totale');
  if (el) {
    const ok = Math.abs(diff) < 0.01;
    el.innerHTML = '<div style="display:flex;justify-content:space-between"><span>Assegnati: <strong style="font-family:var(--font-mono)">' + fmtL(totAssegnati) + '</strong> / ' + fmtL(totLitri) + '</span><span style="color:' + (ok ? '#639922' : '#E24B4A') + ';font-weight:600">' + (ok ? '✅ OK' : (diff > 0 ? '⚠ Rimangono ' + fmtL(diff) : '⚠ Eccesso di ' + fmtL(-diff))) + '</span></div>';
  }
}

async function confermaRicezioneStazione(ordineId, totLitri) {
  const inputs = document.querySelectorAll('.stz-ricevi-input');
  let totAssegnati = 0;
  inputs.forEach(inp => { totAssegnati += parseFloat(inp.value) || 0; });
  if (Math.abs(totLitri - totAssegnati) > 0.5) {
    if (!confirm('I litri assegnati (' + fmtL(totAssegnati) + ') non corrispondono al totale ordine (' + fmtL(totLitri) + '). Procedere comunque?')) return;
  }

  // Carica ordine per ottenere costo e trasporto
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) { toast('Ordine non trovato'); return; }
  const costoCarico = Number(ordine.costo_litro || 0) + Number(ordine.trasporto_litro || 0);
  const prodotto = ordine.prodotto;

  for (const inp of inputs) {
    const val = parseFloat(inp.value) || 0;
    if (val <= 0) continue;
    const cisId = inp.dataset.cisterna;
    const { data: cis } = await sb.from('cisterne').select('livello_attuale,costo_medio').eq('id', cisId).single();
    if (!cis) continue;

    // Calcolo CMP: (litri_esistenti × costo_medio_attuale + litri_nuovi × costo_carico) / totale_litri
    const litriPrec = Number(cis.livello_attuale);
    const cmpPrec = Number(cis.costo_medio || 0);
    const nuovoLivello = litriPrec + val;
    var cmpNuovo = 0;
    if (nuovoLivello > 0) {
      cmpNuovo = ((litriPrec * cmpPrec) + (val * costoCarico)) / nuovoLivello;
    }
    // Arrotonda a 6 decimali
    cmpNuovo = Math.round(cmpNuovo * 1000000) / 1000000;

    const { error } = await sb.from('cisterne').update({ livello_attuale: nuovoLivello, costo_medio: cmpNuovo, updated_at: new Date().toISOString() }).eq('id', cisId);
    if (error) { toast('Errore cisterna: ' + error.message); return; }

    // Registra nello storico CMP
    await sb.from('stazione_cmp_storico').insert([{
      data: ordine.data || oggiISO,
      prodotto: prodotto,
      sede: 'stazione_oppido',
      cmp_precedente: cmpPrec,
      cmp_nuovo: cmpNuovo,
      litri_precedenti: litriPrec,
      litri_caricati: val,
      costo_carico: costoCarico,
      ordine_id: ordineId
    }]);
  }

  const { error } = await sb.from('ordini').update({ ricevuto_stazione: true }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }

  toast('✅ ' + fmtL(totAssegnati) + ' ricevuti — CMP aggiornato a € ' + cmpNuovo.toFixed(4) + '/L');
  chiudiModal();
  caricaOrdiniDaCaricare();
  caricaStazioneDashboard();
}

let _stzDashCharts = {};
function _destroyStzDashCharts() { Object.values(_stzDashCharts).forEach(c=>c.destroy()); _stzDashCharts={}; }

async function caricaStazioneDashboard() {
  await caricaOrdiniDaCaricare();

  const oggi = oggiISO;
  const inizioMese = oggi.substring(0,8) + '01';
  const { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  const pompeIds = (pompe||[]).map(p=>p.id);
  if (!pompeIds.length) return;

  const [lettRes, prezRes, versRes, lettPrecRes, cisRes, costiRes] = await Promise.all([
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).gte('data',inizioMese).order('data'),
    sb.from('stazione_prezzi').select('*').gte('data',inizioMese).order('data'),
    sb.from('stazione_versamenti').select('*').gte('data',inizioMese).order('data'),
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).eq('data', new Date(new Date(inizioMese).getTime()-86400000).toISOString().split('T')[0]),
    sb.from('cisterne').select('*').eq('sede','stazione_oppido').order('prodotto,nome'),
    sb.from('stazione_costi').select('*').gte('data',inizioMese).lte('data',oggi)
  ]);

  const letture = lettRes.data||[];
  const prezzi = prezRes.data||[];
  const versamenti = versRes.data||[];
  const lettPrec = lettPrecRes.data||[];
  const cisterne = cisRes.data||[];
  const costiDb = costiRes.data||[];

  // ═══ CISTERNE ═══
  const cisEl = document.getElementById('stz-dash-cisterne');
  if (cisEl && cisterne.length) {
    var cisHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">';
    cisterne.forEach(function(c) {
      var _pi = cacheProdotti.find(function(p){return p.nome===c.prodotto;}); var colore = _pi ? _pi.colore : '#888';
      var pct = Number(c.capacita_max) > 0 ? Math.round(Number(c.livello_attuale)/Number(c.capacita_max)*100) : 0;
      var cmp = Number(c.costo_medio||0);
      cisHtml += '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:3px solid '+colore+';border-radius:10px;padding:12px">';
      cisHtml += '<div style="font-size:12px;font-weight:600;margin-bottom:4px">'+esc(c.nome)+'</div>';
      cisHtml += '<div style="height:6px;background:var(--border);border-radius:3px;margin-bottom:6px"><div style="height:100%;width:'+pct+'%;background:'+colore+';border-radius:3px"></div></div>';
      cisHtml += '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="font-family:var(--font-mono);font-weight:700">'+fmtL(c.livello_attuale)+' L</span><span style="color:var(--text-muted)">'+pct+'%</span></div>';
      if (cmp > 0) cisHtml += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">CMP: <strong style="font-family:var(--font-mono)">€ '+cmp.toFixed(4)+'</strong></div>';
      cisHtml += '</div>';
    });
    cisHtml += '</div>';
    cisEl.innerHTML = cisHtml;
  } else if (cisEl) {
    cisEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Nessuna cisterna configurata</div>';
  }

  // ═══ VENDITE PER GIORNO ═══
  const tutteLetture = [...lettPrec, ...letture];
  const prezziMap = {};
  prezzi.forEach(p => { prezziMap[p.data+'_'+p.prodotto] = p.prezzo_litro; });
  const costiMap = {};
  costiDb.forEach(c => { costiMap[c.data+'_'+c.prodotto] = Number(c.costo_litro); });

  const venditeGiorno = {};
  const dateUniche = [...new Set(letture.map(l=>l.data))].sort();
  dateUniche.forEach(data => {
    let totLitriG=0, totLitriB=0, incasso=0, costo=0;
    (pompe||[]).forEach(pompa => {
      const lettOggi = tutteLetture.find(l=>l.pompa_id===pompa.id && l.data===data);
      const datePrecedenti = tutteLetture.filter(l=>l.pompa_id===pompa.id && l.data<data).map(l=>l.data).sort();
      const dataPrec = datePrecedenti.length ? datePrecedenti[datePrecedenti.length-1] : null;
      const lettIeri = dataPrec ? tutteLetture.find(l=>l.pompa_id===pompa.id && l.data===dataPrec) : null;
      if (lettOggi && lettIeri) {
        const litri = Number(lettOggi.lettura) - Number(lettIeri.lettura);
        if (litri > 0) {
          const prezzo = Number(prezziMap[data+'_'+pompa.prodotto] || 0);
          const co = costiMap[data+'_'+pompa.prodotto] || 0;
          if (pompa.prodotto === 'Gasolio Autotrazione') totLitriG += litri;
          else totLitriB += litri;
          incasso += litri * prezzo;
          costo += litri * co;
        }
      }
    });
    const vers = (versamenti||[]).filter(v=>v.data===data);
    const totVers = vers.reduce((s,v)=>s+Number(v.contanti||0)+Number(v.pos||0),0);
    venditeGiorno[data] = { gasolio:totLitriG, benzina:totLitriB, totale:totLitriG+totLitriB, incasso, costo, margine:incasso-costo, versamento:totVers };
  });

  // ═══ KPI ═══
  const vOggi = venditeGiorno[oggi] || { gasolio:0, benzina:0, totale:0, incasso:0 };
  document.getElementById('stz-litri-oggi').textContent = fmtL(vOggi.totale);
  document.getElementById('stz-incasso-oggi').textContent = fmtE(vOggi.incasso);

  let totLitriMese=0, totIncassoMese=0;
  Object.values(venditeGiorno).forEach(v => { totLitriMese+=v.totale; totIncassoMese+=v.incasso; });
  document.getElementById('stz-litri-mese').textContent = fmtL(totLitriMese);
  document.getElementById('stz-incasso-mese').textContent = fmtE(totIncassoMese);

  const totCash = (versamenti||[]).reduce((s,v)=>s+Number(v.contanti||0),0);
  const totPos = (versamenti||[]).reduce((s,v)=>s+Number(v.pos||0),0);
  document.getElementById('stz-vers-contanti').textContent = fmtE(totCash);
  document.getElementById('stz-vers-pos').textContent = fmtE(totPos);

  // ═══ TABELLA ULTIMI 7 GIORNI ═══
  const tbody = document.getElementById('stz-dash-tabella');
  const ultimi7 = dateUniche.slice(-7).reverse();
  if (!ultimi7.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun dato</td></tr>'; }
  else {
    tbody.innerHTML = ultimi7.map(data => {
      const v = venditeGiorno[data];
      return '<tr><td>' + data + '</td><td style="font-family:var(--font-mono)">' + fmtL(v.gasolio) + '</td><td style="font-family:var(--font-mono)">' + fmtL(v.benzina) + '</td><td style="font-family:var(--font-mono);font-weight:bold">' + fmtL(v.totale) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.incasso) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.versamento) + '</td></tr>';
    }).join('');
  }

  // ═══ GRAFICI ═══
  _destroyStzDashCharts();
  const labels = dateUniche.map(d => { var dt=new Date(d); return dt.getDate()+'/'+(dt.getMonth()+1); });
  const dataGasolio = dateUniche.map(d => Math.round(venditeGiorno[d].gasolio));
  const dataBenzina = dateUniche.map(d => Math.round(venditeGiorno[d].benzina));
  const dataIncasso = dateUniche.map(d => Math.round(venditeGiorno[d].incasso*100)/100);
  const dataMargine = dateUniche.map(d => Math.round(venditeGiorno[d].margine*100)/100);

  // Grafico Litri
  var ctxL = document.getElementById('stz-dash-chart-litri');
  if (ctxL) {
    _stzDashCharts.litri = new Chart(ctxL.getContext('2d'), {
      type:'bar', data:{ labels, datasets:[
        { label:'Gasolio', data:dataGasolio, backgroundColor:'#BA7517', borderRadius:4 },
        { label:'Benzina', data:dataBenzina, backgroundColor:'#378ADD', borderRadius:4 }
      ]}, options:{ responsive:true, plugins:{legend:{position:'top',labels:{font:{size:10}}}}, scales:{y:{beginAtZero:true,stacked:true,ticks:{callback:v=>fmtL(v)}},x:{stacked:true,ticks:{font:{size:9}}}} }
    });
  }

  // Grafico Fatturato
  var ctxF = document.getElementById('stz-dash-chart-fatturato');
  if (ctxF) {
    _stzDashCharts.fatturato = new Chart(ctxF.getContext('2d'), {
      type:'bar', data:{ labels, datasets:[
        { label:'Incasso €', data:dataIncasso, backgroundColor:'#639922', borderRadius:4 }
      ]}, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}},x:{ticks:{font:{size:9}}}} }
    });
  }

  // Grafico Margine
  var ctxM = document.getElementById('stz-dash-chart-margine');
  if (ctxM) {
    var coloriMargine = dataMargine.map(v => v >= 0 ? '#639922' : '#E24B4A');
    _stzDashCharts.margine = new Chart(ctxM.getContext('2d'), {
      type:'bar', data:{ labels, datasets:[
        { label:'Margine €', data:dataMargine, backgroundColor:coloriMargine, borderRadius:4 }
      ]}, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:false,ticks:{callback:v=>fmtE(v)}},x:{ticks:{font:{size:9}}}} }
    });
  }
}

// ── Letture contatori ──
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
      var vend = (litriStd * prezzo) + (hasCambio ? litriPD * prezzoPD : 0);
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

  var el = document.getElementById('marg-pompe-content');
  var html = '';

  lettureGiorno.forEach(function(l) {
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
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><div style="width:10px;height:10px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:14px">' + esc(pompa.nome) + '</strong><span style="font-size:11px;color:var(--text-muted);margin-left:auto">' + esc(pompa.prodotto) + ' — ' + fmtL(litri) + ' L totali</span></div>';

    // Riga litri standard
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;align-items:center;padding:8px 12px;background:var(--bg-card);border-radius:8px;border:0.5px solid var(--border);margin-bottom:6px">';
    html += '<div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Litri</div><div style="font-family:var(--font-mono);font-size:15px;font-weight:700">' + fmtL(litriStd) + '</div></div>';
    html += '<div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Vendita €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600;color:#1a1a18">' + (prezzo ? '€ ' + prezzo.toFixed(3) : '—') + '</div></div>';
    html += '<div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Costo €/L' + (isCMP ? ' <span style="font-size:8px;background:#378ADD;color:#fff;padding:1px 4px;border-radius:3px">CMP</span>' : '') + '</div><input type="number" class="marg-costo" data-pompa="' + l.pompa_id + '" data-prodotto="' + esc(pompa.prodotto) + '" data-data="' + data + '" data-litri="' + litriStd + '" data-prezzo="' + prezzo + '" value="' + (costoProposto || '') + '" placeholder="0.000" step="0.001" oninput="copiaCostoMarg(this);calcolaMargini()" style="font-family:var(--font-mono);font-size:15px;font-weight:600;padding:6px 10px;border:0.5px solid ' + (isCMP ? '#378ADD' : 'var(--border)') + ';border-radius:8px;background:#fff;color:#1a1a18;width:110px;text-align:right" /></div>';
    html += '<div id="marg-res-' + l.pompa_id + '"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Margine €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">—</div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-top:4px">Margine tot</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">—</div></div>';
    html += '</div>';

    // Riga cambio prezzo
    if (hasCambio) {
      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;align-items:center;padding:8px 12px;background:#f5f5f0;border-radius:8px;border:0.5px solid var(--border);margin-bottom:6px">';
      html += '<div><div style="font-size:9px;color:#1a1a18;text-transform:uppercase">Litri <span style="font-size:8px;background:#1a1a18;color:#fff;padding:1px 4px;border-radius:3px">cambio</span></div><div style="font-family:var(--font-mono);font-size:15px;font-weight:700">' + fmtL(litriPD) + '</div></div>';
      html += '<div><div style="font-size:9px;color:#1a1a18;text-transform:uppercase">Vendita €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600">€ ' + prezzoPD.toFixed(3) + '</div></div>';
      html += '<div><div style="font-size:9px;color:#1a1a18;text-transform:uppercase">Costo €/L' + (isCMP ? ' <span style="font-size:8px;background:#378ADD;color:#fff;padding:1px 4px;border-radius:3px">CMP</span>' : '') + '</div><input type="number" class="marg-costo-cp" data-pompa="' + l.pompa_id + '" data-prodotto="' + esc(pompa.prodotto) + '" data-data="' + data + '" data-litri="' + litriPD + '" data-prezzo="' + prezzoPD + '" value="' + (costoProposto || '') + '" placeholder="0.000" step="0.001" oninput="copiaCostoMarg(this);calcolaMargini()" style="font-family:var(--font-mono);font-size:15px;font-weight:600;padding:6px 10px;border:0.5px solid ' + (isCMP ? '#378ADD' : 'var(--border)') + ';border-radius:8px;background:#fff;color:#1a1a18;width:110px;text-align:right" /></div>';
      html += '<div id="marg-res-cp-' + l.pompa_id + '"><div style="font-size:9px;color:#1a1a18;text-transform:uppercase">Margine €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">—</div><div style="font-size:9px;color:#1a1a18;text-transform:uppercase;margin-top:4px">Margine tot</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">—</div></div>';
      html += '</div>';
    }

    html += '</div>';
  });

  el.innerHTML = html;
  calcolaMargini();
}

function copiaCostoMarg(input) {
  var prodotto = input.dataset.prodotto;
  var pompaId = input.dataset.pompa;
  var val = input.value;
  var isCp = input.classList.contains('marg-costo-cp');
  var selector = isCp ? '.marg-costo-cp' : '.marg-costo';
  document.querySelectorAll(selector + '[data-prodotto="' + prodotto + '"]').forEach(function(inp) {
    if (inp.dataset.pompa !== pompaId) inp.value = val;
  });
}

function calcolaMargini() {
  var litriGasolio=0, euroGasolio=0, margGasolio=0;
  var litriBenzina=0, euroBenzina=0, margBenzina=0;

  // Litri standard
  document.querySelectorAll('.marg-costo').forEach(function(inp) {
    var costo = parseFloat(inp.value) || 0;
    var prezzo = parseFloat(inp.dataset.prezzo) || 0;
    var litri = parseFloat(inp.dataset.litri) || 0;
    var pompaId = inp.dataset.pompa;
    var prodotto = inp.dataset.prodotto;
    var margL = prezzo > 0 && costo > 0 ? prezzo - costo : 0;
    var margTot = margL * litri;
    var isGasolio = prodotto.toLowerCase().indexOf('gasolio') >= 0;

    var elRes = document.getElementById('marg-res-' + pompaId);
    if (elRes) {
      var mColor = margL >= 0 ? '#639922' : '#E24B4A';
      elRes.innerHTML = '<div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Margine €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? '€ ' + margL.toFixed(4) : '—') + '</div>' +
        '<div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-top:4px">Margine tot</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? fmtE(margTot) : '—') + '</div>';
    }

    if (costo > 0 && litri > 0) {
      if (isGasolio) { litriGasolio += litri; euroGasolio += litri*prezzo; margGasolio += margTot; }
      else { litriBenzina += litri; euroBenzina += litri*prezzo; margBenzina += margTot; }
    }
  });

  // Litri cambio prezzo
  document.querySelectorAll('.marg-costo-cp').forEach(function(inp) {
    var costo = parseFloat(inp.value) || 0;
    var prezzo = parseFloat(inp.dataset.prezzo) || 0;
    var litri = parseFloat(inp.dataset.litri) || 0;
    var pompaId = inp.dataset.pompa;
    var prodotto = inp.dataset.prodotto;
    var margL = prezzo > 0 && costo > 0 ? prezzo - costo : 0;
    var margTot = margL * litri;
    var isGasolio = prodotto.toLowerCase().indexOf('gasolio') >= 0;

    var elRes = document.getElementById('marg-res-cp-' + pompaId);
    if (elRes) {
      var mColor = margL >= 0 ? '#639922' : '#E24B4A';
      elRes.innerHTML = '<div style="font-size:9px;color:#1a1a18;text-transform:uppercase">Margine €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? '€ ' + margL.toFixed(4) : '—') + '</div>' +
        '<div style="font-size:9px;color:#1a1a18;text-transform:uppercase;margin-top:4px">Margine tot</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? fmtE(margTot) : '—') + '</div>';
    }

    if (costo > 0 && litri > 0) {
      if (isGasolio) { litriGasolio += litri; euroGasolio += litri*prezzo; margGasolio += margTot; }
      else { litriBenzina += litri; euroBenzina += litri*prezzo; margBenzina += margTot; }
    }
  });

  var totLitri = litriGasolio + litriBenzina;
  var totEuro = euroGasolio + euroBenzina;
  var totMarg = margGasolio + margBenzina;

  // Pannello live
  var el = document.getElementById('marg-totali-live');
  if (el) {
    el.innerHTML =
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.5);margin-bottom:14px;font-weight:600">Marginalità live</div>' +
      '<div style="margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#BA7517"></div><span style="font-size:11px;font-weight:600;color:#fff">GASOLIO</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#fff">' + litriGasolio.toLocaleString('it-IT',{maximumFractionDigits:0}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#7CFC00">€ ' + euroGasolio.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:800;color:' + (margGasolio>=0?'#7CFC00':'#FF6B6B') + '">€ ' + margGasolio.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#378ADD"></div><span style="font-size:11px;font-weight:600;color:#87CEFA">BENZINA</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#87CEFA">' + litriBenzina.toLocaleString('it-IT',{maximumFractionDigits:0}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#7CFC00">€ ' + euroBenzina.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:800;color:' + (margBenzina>=0?'#7CFC00':'#FF6B6B') + '">€ ' + margBenzina.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:12px">' +
        '<div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:6px">TOTALE GIORNATA</div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:#fff">' + totLitri.toLocaleString('it-IT',{maximumFractionDigits:0}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:#7CFC00">€ ' + totEuro.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine</span><span style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:' + (totMarg>=0?'#7CFC00':'#FF6B6B') + '">€ ' + totMarg.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
      '</div>';
  }
}

async function salvaCostiMarg() {
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
  toast(anyOffline ? '⚡ ' + count + ' costi salvati offline' : count + ' costi salvati!');

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

  // Chiedi se vuole andare al giorno successivo
  if (dataCorr) {
    var domani = new Date(new Date(dataCorr).getTime() + 86400000).toISOString().split('T')[0];
    if (confirm('Costi salvati! Dati preparati per il ' + domani + '.\nVuoi andare al giorno ' + domani + '?')) {
      // Ricarica marginalità con i nuovi dati e naviga al giorno più recente
      await caricaMarginalita();
    }
  }
}

// ── Prezzi pompa ──
async function caricaTabPrezzi() { await caricaStoricoPrezzi(); }

async function salvaPrezziPompa() {
  const data = document.getElementById('stz-data-prezzo').value;
  if (!data) { toast('Seleziona una data'); return; }
  const gasolio = parseFloat(document.getElementById('stz-prezzo-gasolio').value);
  const benzina = parseFloat(document.getElementById('stz-prezzo-benzina').value);
  if (isNaN(gasolio) && isNaN(benzina)) { toast('Inserisci almeno un prezzo'); return; }
  let salvati = 0, anyOffline = false;
  if (!isNaN(gasolio)) {
    const r = await _sbWrite('stazione_prezzi', 'upsert', { data, prodotto:'Gasolio Autotrazione', prezzo_litro:gasolio }, 'data,prodotto');
    if (r.error) { toast('Errore: '+r.error.message); return; }
    if (r._offline) anyOffline = true;
    salvati++;
  }
  if (!isNaN(benzina)) {
    const r = await _sbWrite('stazione_prezzi', 'upsert', { data, prodotto:'Benzina', prezzo_litro:benzina }, 'data,prodotto');
    if (r.error) { toast('Errore: '+r.error.message); return; }
    if (r._offline) anyOffline = true;
    salvati++;
  }
  toast(anyOffline ? '⚡ ' + salvati + ' prezzi salvati offline' : salvati + ' prezzi salvati!');
  document.getElementById('stz-prezzo-gasolio').value = '';
  document.getElementById('stz-prezzo-benzina').value = '';
  caricaStoricoPrezzi();
}

async function caricaStoricoPrezzi() {
  const { data } = await sb.from('stazione_prezzi').select('*').order('data',{ascending:false}).limit(50);
  const tbody = document.getElementById('stz-storico-prezzi');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="4" class="loading">Nessun prezzo</td></tr>'; return; }
  const perData = {};
  data.forEach(r => { if(!perData[r.data]) perData[r.data]={}; perData[r.data][r.prodotto]=r; });
  var html = '';
  Object.entries(perData).sort((a,b)=>b[0].localeCompare(a[0])).forEach(([data,prodotti]) => {
    const g = prodotti['Gasolio Autotrazione'];
    const b = prodotti['Benzina'];
    const cpG = prodotti['Gasolio Autotrazione (cambio prezzo)'];
    const cpB = prodotti['Benzina (cambio prezzo)'];
    html += '<tr><td>' + data + '</td><td style="font-family:var(--font-mono)">' + (g?'€ '+Number(g.prezzo_litro).toFixed(3):'—') + '</td><td style="font-family:var(--font-mono)">' + (b?'€ '+Number(b.prezzo_litro).toFixed(3):'—') + '</td><td><button class="btn-danger" onclick="eliminaPrezziPompa(\''+data+'\')">x</button></td></tr>';
    if (cpG || cpB) {
      html += '<tr style="background:#f5f5f0;font-size:10px"><td style="padding:3px 8px"><span style="background:#1a1a18;color:#fff;padding:1px 5px;border-radius:4px;font-size:8px">cambio prezzo</span></td><td style="padding:3px 8px;font-family:var(--font-mono);color:#1a1a18">' + (cpG ? '€ '+Number(cpG.prezzo_litro).toFixed(3) : '') + '</td><td style="padding:3px 8px;font-family:var(--font-mono);color:#1a1a18">' + (cpB ? '€ '+Number(cpB.prezzo_litro).toFixed(3) : '') + '</td><td></td></tr>';
    }
  });
  tbody.innerHTML = html;
}

async function eliminaPrezziPompa(data) {
  if (!confirm('Eliminare i prezzi del ' + data + '?')) return;
  await sb.from('stazione_prezzi').delete().eq('data',data);
  toast('Prezzi eliminati');
  caricaStoricoPrezzi();
}

// ── Versamenti ──
async function caricaTabVersamenti() { await caricaStoricoVersamenti(); }

async function salvaVersamento() {
  const data = document.getElementById('stz-data-vers').value;
  if (!data) { toast('Seleziona una data'); return; }
  const contanti = parseFloat(document.getElementById('stz-vers-cash').value) || 0;
  const pos = parseFloat(document.getElementById('stz-vers-pos-input').value) || 0;
  if (contanti === 0 && pos === 0) { toast('Inserisci almeno un importo'); return; }
  const note = document.getElementById('stz-vers-note').value.trim();
  const r = await _sbWrite('stazione_versamenti', 'insert', [{ data, contanti, pos, note: note || null }]);
  if (r.error) { toast('Errore: '+r.error.message); return; }
  toast(r._offline ? '⚡ Versamento salvato offline' : 'Versamento salvato! Totale: ' + fmtE(contanti+pos));
  document.getElementById('stz-vers-cash').value = '';
  document.getElementById('stz-vers-pos-input').value = '';
  document.getElementById('stz-vers-note').value = '';
  caricaStoricoVersamenti();
}

async function caricaStoricoVersamenti() {
  const { data } = await sb.from('stazione_versamenti').select('*').order('data',{ascending:false}).limit(30);
  const tbody = document.getElementById('stz-storico-versamenti');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="6" class="loading">Nessun versamento</td></tr>'; return; }
  tbody.innerHTML = data.map(r => {
    const tot = Number(r.contanti||0)+Number(r.pos||0);
    return '<tr><td>' + r.data + '</td><td style="font-family:var(--font-mono)">' + fmtE(r.contanti||0) + '</td><td style="font-family:var(--font-mono)">' + fmtE(r.pos||0) + '</td><td style="font-family:var(--font-mono);font-weight:bold">' + fmtE(tot) + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td><button class="btn-danger" onclick="eliminaVersamento(\''+r.id+'\')">x</button></td></tr>';
  }).join('');
}

async function eliminaVersamento(id) {
  if (!confirm('Eliminare questo versamento?')) return;
  await sb.from('stazione_versamenti').delete().eq('id',id);
  toast('Versamento eliminato');
  caricaStoricoVersamenti();
}

// ── Magazzino stazione ──
async function caricaMagazzinoStazione() {
  await caricaTabelaPompe();
  await caricaGiacenzeStazione();
  caricaRettifiche('stazione');
}

async function caricaTabelaPompe() {
  // Popola dropdown prodotti
  const sel = document.getElementById('stz-pompa-prodotto');
  if (sel) {
    sel.innerHTML = cacheProdotti.filter(p => p.attivo && p.categoria === 'benzine').map(p => '<option value="' + esc(p.nome) + '">' + esc(p.nome) + '</option>').join('');
  }

  const { data: pompe } = await sb.from('stazione_pompe').select('*').order('ordine');
  const tbody = document.getElementById('stz-tabella-pompe');
  if (!pompe || !pompe.length) { tbody.innerHTML = '<tr><td colspan="5" class="loading">Nessuna pompa</td></tr>'; return; }
  tbody.innerHTML = pompe.map(p => {
    const prodInfo = cacheProdotti.find(pr => pr.nome === p.prodotto);
    const colore = prodInfo ? prodInfo.colore : '#888';
    const statoBadge = p.attiva ? '<span class="badge green">Attiva</span>' : '<span class="badge red">Disattiva</span>';
    return '<tr>' +
      '<td style="font-family:var(--font-mono)">' + p.ordine + '</td>' +
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:6px"></span><strong>' + esc(p.nome) + '</strong></td>' +
      '<td>' + esc(p.prodotto) + '</td>' +
      '<td>' + statoBadge + '</td>' +
      '<td>' +
        '<button class="btn-edit" onclick="editaPompa(\'' + p.id + '\')" title="Modifica">✏️</button>' +
        '<button class="btn-edit" onclick="togglePompa(\'' + p.id + '\',' + p.attiva + ')" title="' + (p.attiva ? 'Disattiva' : 'Attiva') + '">' + (p.attiva ? '🔒' : '🔓') + '</button>' +
        '<button class="btn-danger" onclick="eliminaPompa(\'' + p.id + '\',\'' + esc(p.nome) + '\')">x</button>' +
      '</td></tr>';
  }).join('');
}

async function salvaPompa() {
  const nome = document.getElementById('stz-pompa-nome').value.trim();
  const prodotto = document.getElementById('stz-pompa-prodotto').value;
  if (!nome) { toast('Inserisci un nome per la pompa'); return; }
  if (!prodotto) { toast('Seleziona un prodotto'); return; }
  // Calcola ordine successivo
  const { data: existing } = await sb.from('stazione_pompe').select('ordine').order('ordine',{ascending:false}).limit(1);
  const nextOrdine = existing && existing.length ? existing[0].ordine + 1 : 1;
  const { error } = await sb.from('stazione_pompe').insert([{ nome, prodotto, ordine: nextOrdine }]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Pompa "' + nome + '" aggiunta!');
  document.getElementById('stz-pompa-nome').value = '';
  caricaTabelaPompe();
}

async function editaPompa(id) {
  const { data: p } = await sb.from('stazione_pompe').select('*').eq('id', id).single();
  if (!p) return;
  const opzProd = cacheProdotti.filter(pr => pr.attivo && pr.categoria === 'benzine').map(pr =>
    '<option value="' + esc(pr.nome) + '"' + (pr.nome === p.prodotto ? ' selected' : '') + '>' + esc(pr.nome) + '</option>'
  ).join('');
  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Modifica pompa: ' + esc(p.nome) + '</div>';
  html += '<div class="form-grid">';
  html += '<div class="form-group"><label>Nome</label><input type="text" id="edit-pompa-nome" value="' + esc(p.nome) + '" /></div>';
  html += '<div class="form-group"><label>Prodotto</label><select id="edit-pompa-prodotto">' + opzProd + '</select></div>';
  html += '<div class="form-group"><label>Ordine</label><input type="number" id="edit-pompa-ordine" value="' + p.ordine + '" /></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn-primary" onclick="confermaEditaPompa(\'' + id + '\')">Salva</button><button class="btn-secondary" onclick="chiudiModal()">Annulla</button></div>';
  apriModal(html);
}

async function confermaEditaPompa(id) {
  const nome = document.getElementById('edit-pompa-nome').value.trim();
  const prodotto = document.getElementById('edit-pompa-prodotto').value;
  const ordine = parseInt(document.getElementById('edit-pompa-ordine').value) || 0;
  if (!nome) { toast('Nome obbligatorio'); return; }
  const { error } = await sb.from('stazione_pompe').update({ nome, prodotto, ordine }).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Pompa aggiornata!');
  chiudiModal();
  caricaTabelaPompe();
}

async function togglePompa(id, attiva) {
  const { error } = await sb.from('stazione_pompe').update({ attiva: !attiva }).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast(attiva ? 'Pompa disattivata' : 'Pompa attivata');
  caricaTabelaPompe();
}

async function eliminaPompa(id, nome) {
  if (!confirm('Eliminare la pompa "' + nome + '"?\n\nATTENZIONE: le letture associate verranno perse.')) return;
  await sb.from('stazione_letture').delete().eq('pompa_id', id);
  const { error } = await sb.from('stazione_pompe').delete().eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Pompa eliminata');
  caricaTabelaPompe();
}

async function caricaGiacenzeStazione() {
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','stazione_oppido').order('tipo').order('nome');

  let cisHtmlAll = '';
  if (cisterne && cisterne.length) {
    const perProdotto = {};
    cisterne.forEach(c => {
      if (!perProdotto[c.prodotto]) perProdotto[c.prodotto] = [];
      perProdotto[c.prodotto].push(c);
    });

    Object.entries(perProdotto).forEach(([prodNome, gruppo]) => {
      const prodInfo = cacheProdotti.find(p => p.nome === prodNome);
      const colore = prodInfo ? prodInfo.colore : '#888';
      const nCis = gruppo.length;
      const capGruppo = gruppo.reduce((s, c) => s + Number(c.capacita_max), 0);
      let totG = 0;

      let cisHtml = '';
      gruppo.forEach(c => {
        const capMax = Number(c.capacita_max);
        const livAtt = Number(c.livello_attuale);
        const pct = capMax > 0 ? Math.round((livAtt / capMax) * 100) : 0;
        const cmp = Number(c.costo_medio||0);
        totG += livAtt;
        cisHtml += '<div class="dep-cisterna' + (pct < 30 ? ' alert' : '') + '">' +
          '<div class="dep-cisterna-name">' + c.nome + '</div>' +
          cisternasvg(pct, colore) +
          '<div class="dep-cisterna-litri">' + _sep(livAtt.toLocaleString('it-IT')) + ' L</div>' +
          '<div class="dep-cisterna-pct">' + pct + '% · cap. ' + _sep(capMax.toLocaleString('it-IT')) + ' L</div>' +
          (cmp > 0 ? '<div style="font-size:9px;color:var(--text-muted);margin-top:2px">CMP: <strong style="font-family:var(--font-mono)">€ ' + cmp.toFixed(4) + '</strong></div>' : '') +
          '</div>';
      });

      const subLabel = nCis + (nCis === 1 ? ' cisterna' : ' cisterne') + ' · ' + _sep(capGruppo.toLocaleString('it-IT')).replace(/\./g, "'") + ' L';
      // CMP medio ponderato per il gruppo
      let cmpGruppo = 0, valGruppo = 0;
      gruppo.forEach(c => { valGruppo += Number(c.livello_attuale||0) * Number(c.costo_medio||0); });
      cmpGruppo = totG > 0 ? valGruppo / totG : 0;
      const cmpLabel = cmpGruppo > 0 ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">CMP: <strong style="font-family:var(--font-mono)">€ ' + cmpGruppo.toFixed(4) + '</strong> · Valore: <strong style="font-family:var(--font-mono)">' + fmtE(totG * cmpGruppo) + '</strong></div>' : '';
      cisHtmlAll += '<div style="margin-bottom:12px"><div class="dep-product-header"><div class="dep-product-dot" style="background:' + colore + '"></div><div><div class="dep-product-title">' + esc(prodNome) + '</div><div class="dep-product-sub">' + subLabel + '</div>' + cmpLabel + '</div><div class="dep-product-total">' + fmtL(totG) + '</div></div><div class="dep-cisterne-grid">' + cisHtml + '</div></div>';
    });
  } else {
    cisHtmlAll = '<div class="loading">Nessuna cisterna configurata per la stazione</div>';
  }
  const elCis = document.getElementById('stz-cisterne-grafiche');
  if (elCis) elCis.innerHTML = cisHtmlAll;

  // Popola dropdown anni
  const selAnno = document.getElementById('stz-acq-anno');
  if (selAnno && selAnno.options.length <= 1) {
    const annoCorr = new Date().getFullYear();
    for (let y = annoCorr; y >= annoCorr - 5; y--) {
      selAnno.innerHTML += '<option value="' + y + '">' + y + '</option>';
    }
  }

  const { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  const { data: links } = await sb.from('pompe_cisterne').select('*, stazione_pompe(nome), cisterne(nome)');
  let linkHtml = '';
  if (pompe && pompe.length) {
    linkHtml += '<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">collegamento pompe e cisterne</div>';
    linkHtml += '<div style="display:flex;flex-wrap:wrap;gap:10px">';
    pompe.forEach(p => {
      const prodInfo = cacheProdotti.find(pr => pr.nome === p.prodotto);
      const colore = prodInfo ? prodInfo.colore : '#888';
      const collegati = (links||[]).filter(l => l.pompa_id === p.id).map(l => l.cisterne?.nome || '?');
      linkHtml += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px 14px;min-width:180px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><div style="width:8px;height:8px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:13px">' + esc(p.nome) + '</strong></div>' +
        '<div style="font-size:11px;color:var(--text-muted)">' + (collegati.length ? collegati.join(', ') : 'Nessuna cisterna') + '</div>' +
        '</div>';
    });
    linkHtml += '</div>';
  }
  document.getElementById('stz-magazzino-content').innerHTML = linkHtml;
}

async function stampaReportAcquistiStazione() {
  var w = _apriReport("Report acquisti stazione"); if (!w) return;
  // Leggi filtri
  const anno = document.getElementById('stz-acq-anno').value;
  const da = document.getElementById('stz-acq-da').value;
  const a = document.getElementById('stz-acq-a').value;

  let query = sb.from('ordini').select('*').eq('tipo_ordine','stazione_servizio').neq('stato','annullato');
  let periodoLabel = 'Tutti i dati';
  if (da && a) {
    query = query.gte('data', da).lte('data', a);
    periodoLabel = 'Dal ' + new Date(da).toLocaleDateString('it-IT') + ' al ' + new Date(a).toLocaleDateString('it-IT');
  } else if (anno) {
    query = query.gte('data', anno + '-01-01').lte('data', anno + '-12-31');
    periodoLabel = 'Anno ' + anno;
  }
  const { data: ordini } = await query.order('data',{ascending:false});
  if (!ordini || !ordini.length) { toast('Nessun acquisto trovato per il periodo selezionato'); return; }

  let totLitri = 0, totValore = 0;
  let righeHtml = '';
  ordini.forEach(function(r, i) {
    var litri = Number(r.litri);
    var costoTot = Number(r.costo_litro) * litri;
    totLitri += litri;
    totValore += costoTot;
    var dataFmt = new Date(r.data).toLocaleDateString('it-IT');
    righeHtml += '<tr>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:center">' + (i+1) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + dataFmt + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + esc(r.prodotto) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(litri) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmt(Number(r.costo_litro)) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">' + fmtE(costoTot) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + esc(r.fornitore) + '</td>' +
      '</tr>';
  });

  // Riepilogo per anno e prodotto
  var perAnno = {};
  ordini.forEach(function(r) {
    var anno = r.data.substring(0,4);
    if (!perAnno[anno]) perAnno[anno] = {};
    if (!perAnno[anno][r.prodotto]) perAnno[anno][r.prodotto] = { litri:0, valore:0, ordini:0 };
    perAnno[anno][r.prodotto].litri += Number(r.litri);
    perAnno[anno][r.prodotto].valore += Number(r.costo_litro) * Number(r.litri);
    perAnno[anno][r.prodotto].ordini++;
  });

  var riepilogoHtml = '';
  Object.keys(perAnno).sort().reverse().forEach(function(anno) {
    riepilogoHtml += '<tr><td colspan="4" style="padding:8px;border:1px solid #ddd;background:#f5f5f5;font-weight:bold">' + anno + '</td></tr>';
    Object.entries(perAnno[anno]).forEach(function(entry) {
      var prod = entry[0], v = entry[1];
      riepilogoHtml += '<tr><td style="padding:6px 8px;border:1px solid #ddd;padding-left:20px">' + esc(prod) + '</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:center">' + v.ordini + '</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(v.litri) + '</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(v.valore) + '</td></tr>';
    });
  });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acquisti Stazione Oppido</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:15mm}' +
    '@media print{.no-print{display:none!important}@page{size:portrait;margin:10mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}.rpt-header>div:last-child{text-align:left!important}.rpt-kpi{flex-direction:column!important;gap:6px!important}table{font-size:9px}th,td{padding:4px 3px!important}.rpt-actions{bottom:8px!important;right:8px!important}button{padding:8px 12px!important;font-size:12px!important}}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:16px}' +
    'th{background:#6B5FCC;color:#fff;padding:8px 6px;font-size:9px;text-transform:uppercase;letter-spacing:0.4px;border:1px solid #5A4FBB;text-align:center}' +
    '.tot td{border-top:3px solid #6B5FCC!important;font-weight:bold;font-size:12px;background:#EEEDFE!important}' +
    '</style></head><body>';

  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6B5FCC;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:20px;font-weight:bold;color:#6B5FCC">ACQUISTI STAZIONE OPPIDO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Periodo: <strong>' + periodoLabel + '</strong> — Ordini: <strong>' + ordini.length + '</strong> — Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div></div></div>';

  html += '<div class="rpt-kpi" style="display:flex;gap:12px;margin-bottom:14px">';
  html += '<div style="background:#EEEDFE;border:1px solid #6B5FCC;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#26215C;text-transform:uppercase">Litri totali</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">' + fmtL(totLitri) + '</div></div>';
  html += '<div style="background:#EEEDFE;border:1px solid #6B5FCC;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#26215C;text-transform:uppercase">Valore totale</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">' + fmtE(totValore) + '</div></div>';
  html += '</div>';

  html += '<div style="font-size:12px;font-weight:bold;color:#6B5FCC;margin-bottom:6px;text-transform:uppercase">Riepilogo per anno</div>';
  html += '<table><thead><tr><th>Prodotto</th><th>Ordini</th><th>Litri</th><th>Valore</th></tr></thead><tbody>' + riepilogoHtml + '</tbody></table>';

  html += '<div style="font-size:12px;font-weight:bold;color:#6B5FCC;margin-bottom:6px;text-transform:uppercase">Dettaglio ordini</div>';
  html += '<table><thead><tr><th>#</th><th>Data</th><th>Prodotto</th><th>Litri</th><th>Costo/L</th><th>Totale</th><th>Fornitore</th></tr></thead><tbody>';
  html += righeHtml;
  html += '<tr class="tot"><td style="padding:8px;border:1px solid #ddd" colspan="3">TOTALE</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(totLitri) + '</td><td style="padding:8px;border:1px solid #ddd"></td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(totValore) + '</td><td style="padding:8px;border:1px solid #ddd"></td></tr>';
  html += '</tbody></table>';

  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ── Report stazione ──
// ══════════════════════════════════════════════════════════════
// ── CASSA STAZIONE ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

async function caricaCassa() {
  var input = document.getElementById('cassa-data');
  if (!input.value) input.value = oggiISO;
  var data = input.value;

  // Carica dati salvati in parallelo
  var [cassaRes, speseRes, totVendite] = await Promise.all([
    sb.from('stazione_cassa').select('*').eq('data', data).maybeSingle(),
    sb.from('stazione_spese_contanti').select('*').eq('data', data).order('created_at'),
    _calcolaTotVenditeDaLetture(data)
  ]);
  var cassa = cassaRes.data;
  var spese = speseRes.data;
  document.getElementById('cassa-tot-vendite').textContent = fmtE(totVendite);

  // Popola campi
  document.getElementById('cassa-bancomat').value = cassa ? cassa.bancomat || '' : '';
  document.getElementById('cassa-nexi').value = cassa ? cassa.carte_nexi || '' : '';
  document.getElementById('cassa-aziendali').value = cassa ? cassa.carte_aziendali || '' : '';
  document.getElementById('cassa-crediti-emessi').value = cassa ? cassa.crediti_emessi || '' : '';
  document.getElementById('cassa-rimborsi').value = cassa ? cassa.rimborsi_effettuati || '' : '';
  document.getElementById('cassa-rimborsi-prec').value = cassa ? cassa.rimborsi_giorni_prec || '' : '';
  document.getElementById('cassa-versato').value = cassa ? cassa.versato || '' : '';

  // Popola spese contanti
  var listaSpese = document.getElementById('cassa-spese-lista');
  listaSpese.innerHTML = '';
  (spese||[]).forEach(function(s) {
    _aggiungiRigaSpesa(s.id, s.nota || '', s.importo || 0);
  });

  window._cassaTotVendite = totVendite;
  calcolaCassa();
  caricaCrediti();
  caricaRegistroDifferenze();
  caricaScontriniCassaPreview(data);
}

async function _calcolaTotVenditeDaLetture(data) {
  var { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true);
  var pompeIds = (pompe||[]).map(function(p){return p.id;});
  if (!pompeIds.length) return 0;
  var giornoPre = new Date(new Date(data).getTime()-86400000).toISOString().split('T')[0];
  var [r1, r2, r3] = await Promise.all([
    sb.from('stazione_letture').select('*').eq('data',data).in('pompa_id',pompeIds),
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).lte('data',giornoPre).order('data',{ascending:false}).limit(pompeIds.length),
    sb.from('stazione_prezzi').select('*').eq('data',data)
  ]);
  var lettOggi = r1.data; var lettPrec = r2.data; var prezzi = r3.data;
  var prezziMap = {};
  (prezzi||[]).forEach(function(p){ prezziMap[p.prodotto] = Number(p.prezzo_litro); });
  var pompeMap = {};
  (pompe||[]).forEach(function(p){ pompeMap[p.id] = p; });
  var tot = 0;
  (lettOggi||[]).forEach(function(l) {
    var pompa = pompeMap[l.pompa_id]; if (!pompa) return;
    var prec = (lettPrec||[]).find(function(x){return x.pompa_id===l.pompa_id;});
    if (!prec) return;
    var litri = Number(l.lettura) - Number(prec.lettura);
    if (litri <= 0) return;
    var prezzo = prezziMap[pompa.prodotto] || 0;
    var litriPD = Number(l.litri_prezzo_diverso||0);
    var prezzoPD = Number(l.prezzo_diverso||0);
    if (litriPD > 0 && prezzoPD > 0) {
      tot += (Math.max(0, litri - litriPD) * prezzo) + (litriPD * prezzoPD);
    } else {
      tot += litri * prezzo;
    }
  });
  return tot;
}

function cassaGiorno(dir) {
  var input = document.getElementById('cassa-data');
  var d = input.value ? new Date(input.value) : new Date();
  d.setDate(d.getDate() + dir);
  input.value = d.toISOString().split('T')[0];
  caricaCassa();
}

function aggiungiSpesaCassa() {
  _aggiungiRigaSpesa('new_' + Date.now(), '', 0);
  calcolaCassa();
}

function _aggiungiRigaSpesa(id, nota, importo) {
  var lista = document.getElementById('cassa-spese-lista');
  var row = document.createElement('div');
  row.dataset.speseId = id;
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px';
  row.innerHTML = '<input type="text" class="cassa-spesa-nota" value="' + esc(nota) + '" placeholder="Nota spesa..." style="font-size:12px;flex:1;padding:4px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text)" />' +
    '<input type="number" class="cassa-spesa-importo" value="' + (importo || '') + '" placeholder="0.00" step="0.01" oninput="calcolaCassa()" style="font-family:var(--font-mono);font-size:13px;text-align:right;width:90px;padding:4px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text)" />' +
    '<button onclick="this.parentElement.remove();calcolaCassa()" style="font-size:12px;padding:2px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;color:#A32D2D">x</button>';
  lista.appendChild(row);
}

function calcolaCassa() {
  var bancomat = parseFloat(document.getElementById('cassa-bancomat').value) || 0;
  var nexi = parseFloat(document.getElementById('cassa-nexi').value) || 0;
  var aziendali = parseFloat(document.getElementById('cassa-aziendali').value) || 0;
  var creditiEmessi = parseFloat(document.getElementById('cassa-crediti-emessi').value) || 0;
  var rimborsi = parseFloat(document.getElementById('cassa-rimborsi').value) || 0;
  var rimborsiPrec = parseFloat(document.getElementById('cassa-rimborsi-prec').value) || 0;
  var versato = parseFloat(document.getElementById('cassa-versato').value) || 0;

  var totSpese = 0;
  document.querySelectorAll('.cassa-spesa-importo').forEach(function(inp) { totSpese += parseFloat(inp.value) || 0; });

  var totVendite = window._cassaTotVendite || 0;

  // Somma incassi carte
  var totCarte = Math.round((bancomat + nexi + aziendali) * 100) / 100;
  document.getElementById('cassa-tot-incassi').textContent = fmtE(totCarte);

  // Contanti = vendite - carte (sempre auto)
  var contanti = Math.max(0, Math.round((totVendite - totCarte) * 100) / 100);
  document.getElementById('cassa-val-contanti').textContent = fmtE(contanti);

  // KPI: carte non devono superare vendite
  var kpiQ = document.getElementById('cassa-kpi-quadra');
  if (totCarte > 0 && totCarte <= totVendite + 0.50) {
    kpiQ.style.background = '#EAF3DE'; kpiQ.style.borderColor = '#639922';
  } else if (totCarte > totVendite + 0.50) {
    kpiQ.style.background = '#FCEBEB'; kpiQ.style.borderColor = '#E24B4A';
  } else {
    kpiQ.style.background = ''; kpiQ.style.borderColor = '';
  }

  // Crediti da rimborsare = saldo giornaliero
  var creditiDaRimborsare = Math.round((creditiEmessi - rimborsi) * 100) / 100;
  var elCrediti = document.getElementById('cassa-crediti-sospesi');
  elCrediti.textContent = (creditiDaRimborsare >= 0 ? '+ ' : '− ') + fmtE(Math.abs(creditiDaRimborsare));
  elCrediti.style.color = creditiDaRimborsare >= 0 ? '#639922' : '#A32D2D';

  // Contanti da versare = contanti + crediti emessi - rimborsi - rimborsi gg prec - spese
  var daVersare = Math.round((contanti + creditiEmessi - rimborsi - rimborsiPrec - totSpese) * 100) / 100;
  document.getElementById('cassa-da-versare').textContent = fmtE(daVersare);
  document.getElementById('cassa-kpi-daversare').textContent = fmtE(daVersare);

  // Differenza versamento
  var differenza = Math.round((versato - daVersare) * 100) / 100;
  document.getElementById('cassa-differenza').textContent = fmtE(differenza);
  var kpiDiff = document.getElementById('cassa-kpi-diff');
  if (Math.abs(differenza) < 0.01 && versato > 0) {
    kpiDiff.style.background = '#EAF3DE'; kpiDiff.style.borderColor = '#639922';
    document.getElementById('cassa-differenza').style.color = '#639922';
  } else if (versato > 0) {
    kpiDiff.style.background = '#FCEBEB'; kpiDiff.style.borderColor = '#E24B4A';
    document.getElementById('cassa-differenza').style.color = '#A32D2D';
  } else {
    kpiDiff.style.background = ''; kpiDiff.style.borderColor = '';
    document.getElementById('cassa-differenza').style.color = '';
  }
}

async function salvaCassa() {
  var data = document.getElementById('cassa-data').value;
  if (!data) { toast('Seleziona una data'); return; }

  var bancomat = parseFloat(document.getElementById('cassa-bancomat').value) || 0;
  var nexi = parseFloat(document.getElementById('cassa-nexi').value) || 0;
  var aziendali = parseFloat(document.getElementById('cassa-aziendali').value) || 0;
  
  var creditiEmessi = parseFloat(document.getElementById('cassa-crediti-emessi').value) || 0;
  var rimborsi = parseFloat(document.getElementById('cassa-rimborsi').value) || 0;
  var rimborsiPrec = parseFloat(document.getElementById('cassa-rimborsi-prec').value) || 0;
  var versato = parseFloat(document.getElementById('cassa-versato').value) || 0;
  var totVendite = window._cassaTotVendite || 0;

  var contanti = Math.max(0, Math.round((totVendite - bancomat - nexi - aziendali) * 100) / 100);

  var totSpese = 0;
  document.querySelectorAll('.cassa-spesa-importo').forEach(function(inp) { totSpese += parseFloat(inp.value) || 0; });
  var daVersare = Math.round((contanti + creditiEmessi - rimborsi - rimborsiPrec - totSpese) * 100) / 100;
  var differenza = Math.round((versato - daVersare) * 100) / 100;
  var creditiDaRimborsare = Math.round((creditiEmessi - rimborsi) * 100) / 100;

  var record = {
    data, totale_vendite: totVendite,
    bancomat, carte_nexi: nexi, carte_aziendali: aziendali, contanti,
    crediti_emessi: creditiEmessi, rimborsi_effettuati: rimborsi,
    rimborsi_giorni_prec: rimborsiPrec, crediti_da_rimborsare: creditiDaRimborsare,
    contanti_da_versare: daVersare, versato, differenza
  };

  // Se offline: accoda tutto e esci
  if (!navigator.onLine) {
    await _sbWrite('stazione_cassa', 'upsert', record, 'data');
    // Spese: delete prima, poi insert (evita doppioni)
    await _sbWrite('stazione_spese_contanti', 'delete', null, { data: data });
    var speseOff = [];
    document.querySelectorAll('#cassa-spese-lista > div').forEach(function(row) {
      var nota = row.querySelector('.cassa-spesa-nota').value;
      var imp = parseFloat(row.querySelector('.cassa-spesa-importo').value) || 0;
      if (imp > 0) speseOff.push({ data: data, nota: nota, importo: imp });
    });
    if (speseOff.length) await _sbWrite('stazione_spese_contanti', 'insert', speseOff);
    // Crediti
    var saldoOff = Math.round((creditiEmessi - rimborsi - rimborsiPrec) * 100) / 100;
    if (saldoOff !== 0 || creditiEmessi > 0 || rimborsi > 0 || rimborsiPrec > 0) {
      await _sbWrite('stazione_crediti', 'upsert', { data_emissione: data, importo: saldoOff, nota: 'Crediti: ' + fmtE(creditiEmessi) + ' | Rimborsi: ' + fmtE(rimborsi) + ' | Rimb.prec: ' + fmtE(rimborsiPrec) }, 'data_emissione');
    }
    // Versamento: delete prima, poi insert (evita doppioni)
    await _sbWrite('stazione_versamenti', 'delete', null, { data: data, note: 'Da registro cassa' });
    var totCarteOff = Math.round((bancomat + nexi + aziendali) * 100) / 100;
    if (versato > 0 || totCarteOff > 0) {
      await _sbWrite('stazione_versamenti', 'insert', [{ data: data, contanti: versato, pos: totCarteOff, note: 'Da registro cassa' }]);
    }
    toast('⚡ Registro cassa salvato offline');
    calcolaCassa();
    return;
  }

  // Controlla se esiste già un registro per questa data
  var { data: cassaEsistente } = await sb.from('stazione_cassa').select('id').eq('data', data).maybeSingle();
  if (cassaEsistente) {
    if (!confirm('Esiste già un registro cassa per il ' + data + '.\nVuoi sovrascriverlo?')) return;
  }

  var { error } = await sb.from('stazione_cassa').upsert(record, { onConflict: 'data' });
  if (error) { toast('Errore: ' + error.message); return; }

  // Registra versamento automatico nella sezione Versamenti
  try {
    var totCarte = Math.round((bancomat + nexi + aziendali) * 100) / 100;
    await sb.from('stazione_versamenti').delete().eq('data', data).eq('note', 'Da registro cassa');
    if (versato > 0 || totCarte > 0) {
      await sb.from('stazione_versamenti').insert([{ data: data, contanti: versato, pos: totCarte, note: 'Da registro cassa' }]);
    }
  } catch(e) { console.warn('Errore versamento auto:', e); }

  // Salva spese contanti (batch)
  await sb.from('stazione_spese_contanti').delete().eq('data', data);
  var speseInserts = [];
  var righeSpese = document.querySelectorAll('#cassa-spese-lista > div');
  for (var i = 0; i < righeSpese.length; i++) {
    var nota = righeSpese[i].querySelector('.cassa-spesa-nota').value;
    var importo = parseFloat(righeSpese[i].querySelector('.cassa-spesa-importo').value) || 0;
    if (importo > 0) speseInserts.push({ data, nota, importo });
  }
  if (speseInserts.length) await sb.from('stazione_spese_contanti').insert(speseInserts);

  // Registro crediti giornaliero: un solo record per giorno
  // Saldo = crediti emessi - rimborsi - rimborsi gg precedenti
  var saldoCredGiorno = Math.round((creditiEmessi - rimborsi - rimborsiPrec) * 100) / 100;
  if (saldoCredGiorno !== 0 || creditiEmessi > 0 || rimborsi > 0 || rimborsiPrec > 0) {
    var notaCred = 'Crediti: ' + fmtE(creditiEmessi) + ' | Rimborsi: ' + fmtE(rimborsi) + ' | Rimb.prec: ' + fmtE(rimborsiPrec);
    var { data: esistente } = await sb.from('stazione_crediti').select('id').eq('data_emissione', data).maybeSingle();
    if (esistente) {
      await sb.from('stazione_crediti').update({ importo: saldoCredGiorno, nota: notaCred }).eq('id', esistente.id);
    } else {
      await sb.from('stazione_crediti').insert([{ data_emissione: data, importo: saldoCredGiorno, nota: notaCred }]);
    }
  }

  _auditLog('salva_cassa', 'stazione_cassa', data + ' vendite:' + fmtE(totVendite) + ' versato:' + fmtE(versato));
  toast('Registro cassa salvato!');
  calcolaCassa();
  caricaCrediti();
}

// ── REGISTRO CREDITI GIORNALIERO ──
async function caricaCrediti() {
  var { data: crediti } = await sb.from('stazione_crediti').select('*').order('data_emissione',{ascending:false}).limit(60);
  var tbody = document.getElementById('cred-tabella');

  var totale = 0, totMese = 0;
  var inizioMese = oggiISO.substring(0,8) + '01';

  (crediti||[]).forEach(function(c) {
    var imp = Number(c.importo||0);
    totale += imp;
    if (c.data_emissione >= inizioMese) totMese += imp;
  });

  // KPI
  var elTot = document.getElementById('cred-totale');
  elTot.textContent = fmtE(totale);
  elTot.style.color = totale >= 0 ? '#A32D2D' : '#639922';

  var elMese = document.getElementById('cred-mese');
  elMese.textContent = fmtE(totMese);
  elMese.style.color = totMese >= 0 ? '#A32D2D' : '#639922';

  if (!crediti || !crediti.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun registro</td></tr>';
    return;
  }

  tbody.innerHTML = crediti.map(function(c) {
    var imp = Number(c.importo||0);
    var isPos = imp >= 0;
    var colore = isPos ? '#A32D2D' : '#639922';
    var segno = isPos ? '+' : '−';
    // Estrai dettagli dalla nota
    var notaParts = (c.nota||'').split('|').map(function(s){return s.trim();});
    var credVal = '—', rimbVal = '—', rimbPrecVal = '—';
    notaParts.forEach(function(p) {
      if (p.indexOf('Crediti:') === 0) credVal = p.replace('Crediti:','').trim();
      if (p.indexOf('Rimborsi:') === 0) rimbVal = p.replace('Rimborsi:','').trim();
      if (p.indexOf('Rimb.prec:') === 0) rimbPrecVal = p.replace('Rimb.prec:','').trim();
    });
    return '<tr><td style="font-weight:500">' + c.data_emissione + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:11px">' + credVal + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:11px">' + rimbVal + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:11px">' + rimbPrecVal + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:600;color:' + colore + '">' + segno + ' ' + fmtE(Math.abs(imp)) + '</td>' +
      '<td style="font-size:11px;color:var(--text-muted)">' + (isPos ? 'credito netto' : 'riduzione crediti') + '</td></tr>';
  }).join('');
}

// ── REGISTRO DIFFERENZE CASSA ──
async function caricaRegistroDifferenze() {
  // Popola selettore anno
  var selAnno = document.getElementById('diff-cassa-anno');
  if (selAnno && selAnno.options.length === 0) {
    var ac = new Date().getFullYear();
    for (var y = ac; y >= ac - 3; y--) selAnno.innerHTML += '<option value="' + y + '"' + (y===ac?' selected':'') + '>' + y + '</option>';
  }

  var anno = selAnno ? selAnno.value : new Date().getFullYear();
  var mese = document.getElementById('diff-cassa-mese')?.value || '';
  var da = anno + '-' + (mese || '01') + '-01';
  var ultimoGg = mese ? new Date(Number(anno), Number(mese), 0).getDate() : 31;
  var a = anno + '-' + (mese || '12') + '-' + String(ultimoGg).padStart(2, '0');

  var { data: casse } = await sb.from('stazione_cassa').select('data,contanti_da_versare,versato,differenza').gte('data', da).lte('data', a).order('data');

  var tbody = document.getElementById('diff-cassa-tabella');
  var kpiWrap = document.getElementById('diff-cassa-kpi');
  if (!casse || !casse.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Nessun dato per il periodo selezionato</td></tr>';
    kpiWrap.innerHTML = '';
    return;
  }

  // Calcola totali e cumulata
  var totDaVersare = 0, totVersato = 0, totDiff = 0, ggConDiff = 0, cumulata = 0;
  var righe = casse.map(function(c) {
    var daVers = Number(c.contanti_da_versare || 0);
    var versato = Number(c.versato || 0);
    var diff = Math.round((versato - daVers) * 100) / 100;
    cumulata = Math.round((cumulata + diff) * 100) / 100;
    totDaVersare += daVers;
    totVersato += versato;
    totDiff += diff;
    if (Math.abs(diff) >= 0.01) ggConDiff++;
    return { data: c.data, daVersare: daVers, versato: versato, diff: diff, cumulata: cumulata };
  });

  totDiff = Math.round(totDiff * 100) / 100;

  // KPI
  var diffColor = Math.abs(totDiff) < 0.01 ? '#639922' : '#E24B4A';
  var cumColor = Math.abs(cumulata) < 0.01 ? '#639922' : '#E24B4A';
  kpiWrap.innerHTML =
    '<div class="kpi"><div class="kpi-label">Giorni registrati</div><div class="kpi-value">' + casse.length + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Giorni con differenza</div><div class="kpi-value" style="color:' + (ggConDiff === 0 ? '#639922' : '#E24B4A') + '">' + ggConDiff + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Diff. totale periodo</div><div class="kpi-value" style="font-family:var(--font-mono);color:' + diffColor + '">' + (totDiff >= 0 ? '+' : '') + fmtE(totDiff) + '</div></div>' +
    '<div class="kpi" style="border:1px solid ' + cumColor + '"><div class="kpi-label">Saldo cumulato</div><div class="kpi-value" style="font-family:var(--font-mono);color:' + cumColor + '">' + (cumulata >= 0 ? '+' : '') + fmtE(cumulata) + '</div></div>';

  // Tabella (più recente in cima)
  var html = '';
  var meseCorrente = '';
  var righeReverse = righe.slice().reverse();

  righeReverse.forEach(function(r, idx) {
    var meseRiga = r.data.substring(0, 7);
    // Riga riepilogo mensile se cambia mese
    if (meseCorrente && meseRiga !== meseCorrente) {
      var righeDelMese = righe.filter(function(x) { return x.data.startsWith(meseCorrente); });
      var totMDa = righeDelMese.reduce(function(s, x) { return s + x.daVersare; }, 0);
      var totMVers = righeDelMese.reduce(function(s, x) { return s + x.versato; }, 0);
      var totMDiff = Math.round((totMVers - totMDa) * 100) / 100;
      var mColor = Math.abs(totMDiff) < 0.01 ? '#639922' : '#E24B4A';
      var meseNome = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'][Number(meseCorrente.split('-')[1])];
      html += '<tr style="background:#EEEDFE;font-weight:600"><td style="font-size:11px">📅 ' + meseNome + '</td><td style="font-family:var(--font-mono)">' + fmtE(totMDa) + '</td><td style="font-family:var(--font-mono)">' + fmtE(totMVers) + '</td><td style="font-family:var(--font-mono);color:' + mColor + '">' + (totMDiff >= 0 ? '+' : '') + fmtE(totMDiff) + '</td><td></td></tr>';
    }
    meseCorrente = meseRiga;

    var dColor = Math.abs(r.diff) < 0.01 ? '#639922' : '#E24B4A';
    var cColor = Math.abs(r.cumulata) < 0.01 ? '#639922' : r.cumulata > 0 ? '#639922' : '#E24B4A';
    var dataFmt = new Date(r.data).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });

    html += '<tr' + (idx % 2 ? ' style="background:var(--bg)"' : '') + '>' +
      '<td style="font-weight:500;font-size:11px">' + dataFmt + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtE(r.daVersare) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtE(r.versato) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:600;color:' + dColor + '">' + (r.diff >= 0 ? '+' : '') + fmtE(r.diff) + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:11px;color:' + cColor + '">' + (r.cumulata >= 0 ? '+' : '') + fmtE(r.cumulata) + '</td></tr>';
  });

  // Ultimo mese in corso
  if (meseCorrente) {
    var righeDelMese = righe.filter(function(x) { return x.data.startsWith(meseCorrente); });
    var totMDa = righeDelMese.reduce(function(s, x) { return s + x.daVersare; }, 0);
    var totMVers = righeDelMese.reduce(function(s, x) { return s + x.versato; }, 0);
    var totMDiff = Math.round((totMVers - totMDa) * 100) / 100;
    var mColor = Math.abs(totMDiff) < 0.01 ? '#639922' : '#E24B4A';
    var meseNome = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'][Number(meseCorrente.split('-')[1])];
    html += '<tr style="background:#EEEDFE;font-weight:600"><td style="font-size:11px">📅 ' + meseNome + '</td><td style="font-family:var(--font-mono)">' + fmtE(totMDa) + '</td><td style="font-family:var(--font-mono)">' + fmtE(totMVers) + '</td><td style="font-family:var(--font-mono);color:' + mColor + '">' + (totMDiff >= 0 ? '+' : '') + fmtE(totMDiff) + '</td><td></td></tr>';
  }

  // Riga totale anno
  html += '<tr style="border-top:2px solid var(--accent);font-weight:700"><td>TOTALE</td><td style="font-family:var(--font-mono)">' + fmtE(totDaVersare) + '</td><td style="font-family:var(--font-mono)">' + fmtE(totVersato) + '</td><td style="font-family:var(--font-mono);color:' + diffColor + '">' + (totDiff >= 0 ? '+' : '') + fmtE(totDiff) + '</td><td style="font-family:var(--font-mono);color:' + cumColor + '">' + (cumulata >= 0 ? '+' : '') + fmtE(cumulata) + '</td></tr>';

  tbody.innerHTML = html;
}

async function stampaRegistroDifferenze() {
  var w = _apriReport("Registro differenze cassa"); if (!w) return;
  var anno = document.getElementById('diff-cassa-anno')?.value || new Date().getFullYear();
  var mese = document.getElementById('diff-cassa-mese')?.value || '';
  var meseNome = mese ? ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1] : 'Anno completo';
  var da = anno + '-' + (mese || '01') + '-01';
  var ultimoGg = mese ? new Date(Number(anno), Number(mese), 0).getDate() : 31;
  var a = anno + '-' + (mese || '12') + '-' + String(ultimoGg).padStart(2, '0');

  var { data: casse } = await sb.from('stazione_cassa').select('data,contanti_da_versare,versato').gte('data', da).lte('data', a).order('data');
  if (!casse || !casse.length) { toast('Nessun dato'); return; }

  var cumulata = 0;
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Registro Differenze Cassa</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:8mm}@media print{@page{size:portrait;margin:6mm}.no-print{display:none!important}}table{width:100%;border-collapse:collapse}th{background:#6B5FCC;color:#fff;padding:4px 6px;font-size:8px;text-transform:uppercase;border:1px solid #5A4FBB;text-align:right}th:first-child{text-align:left}td{padding:3px 6px;border:1px solid #ddd;font-size:9px;text-align:right;font-family:Courier New,monospace}td:first-child{text-align:left;font-family:Arial;font-weight:500}.alt{background:#fafaf8}.tot{background:#f0f0f0;font-weight:bold}.tot td{border-top:2px solid #6B5FCC}.ok{color:#639922}.err{color:#E24B4A}.mese{background:#EEEDFE;font-weight:bold}</style></head><body>';

  html += '<div style="display:flex;justify-content:space-between;border-bottom:2px solid #6B5FCC;padding-bottom:8px;margin-bottom:10px"><div><div style="font-size:16px;font-weight:bold;color:#6B5FCC">REGISTRO DIFFERENZE CASSA</div><div style="font-size:12px;color:#666;margin-top:2px">Stazione Oppido — ' + meseNome + ' ' + anno + '</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:bold">PHOENIX FUEL SRL</div></div></div>';

  html += '<table><thead><tr><th style="text-align:left">Data</th><th>Da versare</th><th>Versato</th><th>Differenza</th><th>Cumulata</th></tr></thead><tbody>';

  var totDa = 0, totVers = 0, meseCorr = '', ggDiff = 0;
  casse.forEach(function(c, i) {
    var daV = Number(c.contanti_da_versare || 0);
    var vers = Number(c.versato || 0);
    var diff = Math.round((vers - daV) * 100) / 100;
    cumulata = Math.round((cumulata + diff) * 100) / 100;
    totDa += daV; totVers += vers;
    if (Math.abs(diff) >= 0.01) ggDiff++;
    var cls = Math.abs(diff) < 0.01 ? 'ok' : 'err';
    html += '<tr' + (i % 2 ? ' class="alt"' : '') + '><td>' + c.data + '</td><td>' + fmtE(daV) + '</td><td>' + fmtE(vers) + '</td><td class="' + cls + '" style="font-weight:bold">' + (diff >= 0 ? '+' : '') + fmtE(diff) + '</td><td class="' + (Math.abs(cumulata) < 0.01 ? 'ok' : 'err') + '">' + (cumulata >= 0 ? '+' : '') + fmtE(cumulata) + '</td></tr>';
  });

  var totDiff = Math.round((totVers - totDa) * 100) / 100;
  html += '<tr class="tot"><td>TOTALE (' + casse.length + ' gg, ' + ggDiff + ' con diff.)</td><td>' + fmtE(totDa) + '</td><td>' + fmtE(totVers) + '</td><td class="' + (Math.abs(totDiff) < 0.01 ? 'ok' : 'err') + '">' + (totDiff >= 0 ? '+' : '') + fmtE(totDiff) + '</td><td class="' + (Math.abs(cumulata) < 0.01 ? 'ok' : 'err') + '">' + (cumulata >= 0 ? '+' : '') + fmtE(cumulata) + '</td></tr>';
  html += '</tbody></table>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

// ── OCR SCONTRINO STAZIONE ──────────────────────────────────────
async function ocrScontrino(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var statusEl = document.getElementById('ocr-status');
  statusEl.style.display = 'block';
  statusEl.innerHTML = '⏳ Lettura scontrino in corso... (può impiegare 10-20 secondi)';

  try {
    var worker = await Tesseract.createWorker('ita');
    var { data } = await worker.recognize(file);
    await worker.terminate();
    var testo = data.text;

    statusEl.innerHTML = '✅ Scontrino letto! Estrazione dati...';

    // Parsing dei dati dallo scontrino
    var risultato = _parseScontrino(testo);

    // Mostra risultati per conferma
    var html = '<div style="font-size:13px;font-weight:600;margin-bottom:10px">📋 Dati estratti dallo scontrino</div>';

    // Letture pompe
    if (risultato.pompe.length) {
      html += '<div style="font-size:11px;font-weight:500;color:var(--text-muted);margin-bottom:6px">TOTALIZZATORI POMPE</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin-bottom:12px">';
      risultato.pompe.forEach(function(p) {
        html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;border-left:3px solid ' + (p.prodotto === 'Diesel' ? '#D4A017' : '#639922') + '">';
        html += '<div style="font-size:10px;color:var(--text-muted)">' + p.nome + ' (' + p.prodotto + ')</div>';
        html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:600">' + p.finale + '</div>';
        html += '<div style="font-size:10px;color:var(--text-hint)">diff: ' + p.differenza + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Incassi
    html += '<div style="font-size:11px;font-weight:500;color:var(--text-muted);margin-bottom:6px">INCASSI</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;margin-bottom:12px">';
    html += '<div style="padding:6px 10px;background:var(--bg);border-radius:6px"><div style="font-size:10px;color:var(--text-muted)">Bancomat</div><div style="font-family:var(--font-mono);font-weight:600">' + fmtE(risultato.bancomat) + '</div></div>';
    html += '<div style="padding:6px 10px;background:var(--bg);border-radius:6px"><div style="font-size:10px;color:var(--text-muted)">Nexi</div><div style="font-family:var(--font-mono);font-weight:600">' + fmtE(risultato.nexi) + '</div></div>';
    html += '<div style="padding:6px 10px;background:var(--bg);border-radius:6px"><div style="font-size:10px;color:var(--text-muted)">Totale carte</div><div style="font-family:var(--font-mono);font-weight:600">' + fmtE(risultato.totCarte) + '</div></div>';
    html += '<div style="padding:6px 10px;background:var(--bg);border-radius:6px"><div style="font-size:10px;color:var(--text-muted)">Totale stazione</div><div style="font-family:var(--font-mono);font-weight:600">' + fmtE(risultato.totaleStazione) + '</div></div>';
    html += '</div>';

    // Crediti
    html += '<div style="font-size:11px;font-weight:500;color:var(--text-muted);margin-bottom:6px">CREDITI</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;margin-bottom:12px">';
    html += '<div style="padding:6px 10px;background:var(--bg);border-radius:6px"><div style="font-size:10px;color:var(--text-muted)">Emessi</div><div style="font-family:var(--font-mono);font-weight:600">' + fmtE(risultato.creditiEmessi) + '</div></div>';
    html += '<div style="padding:6px 10px;background:var(--bg);border-radius:6px"><div style="font-size:10px;color:var(--text-muted)">Rimborsati</div><div style="font-family:var(--font-mono);font-weight:600">' + fmtE(risultato.creditiRimborsati) + '</div></div>';
    html += '<div style="padding:6px 10px;background:var(--bg);border-radius:6px"><div style="font-size:10px;color:var(--text-muted)">Rimb. gg prec</div><div style="font-family:var(--font-mono);font-weight:600">' + fmtE(risultato.creditiRimbPrec) + '</div></div>';
    html += '</div>';

    html += '<div style="display:flex;gap:8px;margin-top:8px">';
    html += '<button class="btn-primary" style="flex:1;background:#639922" onclick="applicaOcrCassa()">✅ Applica alla cassa</button>';
    html += '<button class="btn-primary" style="background:#378ADD" onclick="applicaOcrLetture()">⛽ Applica alle letture</button>';
    html += '<button onclick="document.getElementById(\'ocr-status\').style.display=\'none\'" style="padding:8px 14px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer;font-size:12px">Chiudi</button>';
    html += '</div>';

    statusEl.innerHTML = html;

    // Salva risultato per applicazione
    window._ocrRisultato = risultato;

  } catch(e) {
    statusEl.innerHTML = '❌ Errore lettura: ' + e.message + '. Riprova con una foto più nitida.';
    console.error('OCR error:', e);
  }

  input.value = '';
}

function _parseScontrino(testo) {
  var r = {
    pompe: [], bancomat: 0, nexi: 0, totCarte: 0, totaleStazione: 0,
    creditiEmessi: 0, creditiRimborsati: 0, creditiRimbPrec: 0, contanti: 0
  };

  var righe = testo.split('\n').map(function(l) { return l.trim(); });

  // Parsing totalizzatori pompe
  var pompaCorrente = null, prodottoCorrente = '';
  for (var i = 0; i < righe.length; i++) {
    var riga = righe[i];

    // Pompa XX
    var mPompa = riga.match(/Pompa\s+(\d+)/i);
    if (mPompa) { pompaCorrente = 'Pompa ' + mPompa[1]; continue; }

    // Prodotto (Verde/Diesel)
    if (pompaCorrente && /^(Verde|Diesel|Gasolio|Benzina)/i.test(riga)) {
      prodottoCorrente = riga.trim();
      continue;
    }

    // Totalizzatore finale
    var mFinale = riga.match(/total[il]zzatore\s+finale\s+(\d+)/i);
    if (mFinale && pompaCorrente) {
      var mIniziale = (righe[i - 1] || '').match(/total[il]zzatore\s+[Ii]niziale\s+(\d+)/i);
      var mDiff = (righe[i + 1] || '').match(/differenza\s+(\d+)/i);
      r.pompe.push({
        nome: pompaCorrente,
        prodotto: prodottoCorrente || '—',
        iniziale: mIniziale ? parseInt(mIniziale[1]) : 0,
        finale: parseInt(mFinale[1]),
        differenza: mDiff ? parseInt(mDiff[1]) : 0
      });
      pompaCorrente = null;
      prodottoCorrente = '';
      continue;
    }

    // Importi — parsing numeri formato italiano (1.010,34 o 102,30)
    var _pNum = function(s) {
      if (!s) return 0;
      s = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      return parseFloat(s) || 0;
    };

    // BANCOMAT OUTDOOR importo
    if (/BANCOMAT\s+OUTDOOR/i.test(riga)) {
      // Cerca "Importo complessivo Euro" nelle prossime righe
      for (var j = i + 1; j < Math.min(i + 8, righe.length); j++) {
        var mBanc = righe[j].match(/[Ii]mporto\s+complessivo\s+Euro\s+([\d.,]+)/);
        if (mBanc) { r.bancomat = _pNum(mBanc[1]); break; }
      }
    }

    // NEXI OUTDOOR importo
    if (/NEXI\s+OUTDOOR/i.test(riga)) {
      for (var j = i + 1; j < Math.min(i + 8, righe.length); j++) {
        var mNexi = righe[j].match(/[Ii]mporto\s+complessivo\s+Euro\s+([\d.,]+)/);
        if (mNexi) { r.nexi = _pNum(mNexi[1]); break; }
      }
    }

    // TOTALE GENERALE DI STAZIONE CON CARTE
    var mTotCarte = riga.match(/CON\s+CARTE.*?Euro\s+([\d.,]+)/i);
    if (!mTotCarte) mTotCarte = riga.match(/TOTALE\s+GENERALE\s+DI\s+STAZIONE/i) ? (righe[i + 1] || '').match(/CON\s+CARTE.*?Euro\s+([\d.,]+)/i) : null;
    if (mTotCarte) r.totCarte = _pNum(mTotCarte[1]);

    // TOTALE GENERALE DI STAZIONE Euro
    var mTotGen = riga.match(/TOTALE\s+GENERALE[\s\S]*?Euro\s+([\d.,]+)/i);
    if (mTotGen && !/CON CARTE/i.test(riga)) r.totaleStazione = _pNum(mTotGen[1]);

    // Crediti emessi
    var mCredE = riga.match(/crediti\s+emess[il].*?([\d.,]+)/i);
    if (mCredE) r.creditiEmessi = _pNum(mCredE[1]);

    // Crediti rimborsati
    var mCredR = riga.match(/[Cc]rediti\s+rimborsati.*?([\d.,]+)/i);
    if (mCredR) r.creditiRimborsati = _pNum(mCredR[1]);

    // Crediti rimb giorni prec
    var mCredP = riga.match(/[Cc]rediti\s+rimb.*?giorni\s+prec.*?([\d.,]+)/i);
    if (mCredP) r.creditiRimbPrec = _pNum(mCredP[1]);

    // Incasso netto (contanti)
    var mContanti = riga.match(/[Ii]ncasso\s+netto.*?([\d.,]+)/i);
    if (mContanti) r.contanti = _pNum(mContanti[1]);
  }

  // Fallback totale carte
  if (r.totCarte === 0 && (r.bancomat > 0 || r.nexi > 0)) r.totCarte = r.bancomat + r.nexi;

  return r;
}

function applicaOcrCassa() {
  var r = window._ocrRisultato;
  if (!r) { toast('Nessun dato OCR disponibile'); return; }

  // Compila campi cassa
  if (r.bancomat > 0) document.getElementById('cassa-bancomat').value = r.bancomat.toFixed(2);
  if (r.nexi > 0) document.getElementById('cassa-nexi').value = r.nexi.toFixed(2);
  if (r.creditiEmessi > 0) document.getElementById('cassa-crediti-emessi').value = r.creditiEmessi.toFixed(2);
  if (r.creditiRimborsati > 0) document.getElementById('cassa-rimborsi').value = r.creditiRimborsati.toFixed(2);
  if (r.creditiRimbPrec > 0) document.getElementById('cassa-rimborsi-prec').value = r.creditiRimbPrec.toFixed(2);

  calcolaCassa();
  toast('✅ Dati scontrino applicati alla cassa!');
  document.getElementById('ocr-status').style.display = 'none';
}

async function applicaOcrLetture() {
  var r = window._ocrRisultato;
  if (!r || !r.pompe.length) { toast('Nessun totalizzatore trovato'); return; }

  // Mappa pompe dello scontrino alle pompe del sistema
  var { data: pompeSistema } = await sb.from('stazione_pompe').select('id,nome,prodotto,ordine_visualizzazione').eq('attiva', true).order('ordine_visualizzazione');
  if (!pompeSistema || !pompeSistema.length) { toast('Nessuna pompa configurata nel sistema'); return; }

  // Mostra dialog di mappatura
  var html = '<div style="font-size:15px;font-weight:500;margin-bottom:12px">Associa totalizzatori alle pompe</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Verifica che ogni totalizzatore sia associato alla pompa corretta, poi conferma.</div>';

  r.pompe.forEach(function(p, idx) {
    html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px">';
    html += '<div style="flex:1"><strong>' + p.nome + '</strong> (' + p.prodotto + ')<br><span style="font-family:var(--font-mono);font-size:14px">' + p.finale + '</span> <span style="font-size:10px;color:var(--text-hint)">diff: ' + p.differenza + '</span></div>';
    html += '<span style="font-size:16px">→</span>';
    html += '<select id="ocr-mappa-' + idx + '" style="font-size:12px;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text)">';
    html += '<option value="">— Ignora —</option>';
    pompeSistema.forEach(function(ps) {
      // Auto-match per nome/ordine
      var sel = '';
      var pompaNum = p.nome.match(/\d+/);
      if (pompaNum && ps.nome && ps.nome.indexOf(pompaNum[0]) >= 0) sel = ' selected';
      else if (pompaNum && ps.ordine_visualizzazione === parseInt(pompaNum[0])) sel = ' selected';
      html += '<option value="' + ps.id + '"' + sel + '>' + ps.nome + ' (' + ps.prodotto + ')</option>';
    });
    html += '</select></div>';
  });

  html += '<div style="display:flex;gap:8px;margin-top:12px">';
  html += '<button class="btn-primary" style="flex:1;background:#639922" onclick="confermaOcrLetture()">✅ Salva letture</button>';
  html += '<button onclick="chiudiModalePermessi()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button>';
  html += '</div>';

  apriModal(html);
}

async function confermaOcrLetture() {
  var r = window._ocrRisultato;
  if (!r || !r.pompe.length) return;
  var data = document.getElementById('cassa-data').value || oggiISO;
  var salvate = 0;

  for (var idx = 0; idx < r.pompe.length; idx++) {
    var sel = document.getElementById('ocr-mappa-' + idx);
    if (!sel || !sel.value) continue;
    var pompaId = sel.value;
    var lettura = r.pompe[idx].finale;

    var { error } = await sb.from('stazione_letture').upsert({
      pompa_id: pompaId, data: data, lettura: lettura
    }, { onConflict: 'pompa_id,data' });

    if (!error) salvate++;
  }

  chiudiModalePermessi();
  toast('✅ ' + salvate + ' letture salvate da scontrino!');
  document.getElementById('ocr-status').style.display = 'none';
  _auditLog('ocr_letture', 'stazione_letture', salvate + ' letture da OCR scontrino ' + data);

  // Ricarica letture se siamo nel tab letture
  if (document.getElementById('stz-letture') && document.getElementById('stz-letture').style.display !== 'none') {
    caricaTabLetture();
  }
}

async function stampaCassa() {
  var w = _apriReport("Registro cassa"); if (!w) return;
  var data = document.getElementById('cassa-data').value;
  if (!data) { toast('Seleziona una data'); return; }
  var dataFmt = new Date(data).toLocaleDateString('it-IT', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  var totVendite = window._cassaTotVendite || 0;
  var bancomat = parseFloat(document.getElementById('cassa-bancomat').value) || 0;
  var nexi = parseFloat(document.getElementById('cassa-nexi').value) || 0;
  var aziendali = parseFloat(document.getElementById('cassa-aziendali').value) || 0;
  
  var contanti = Math.max(0, Math.round((totVendite - bancomat - nexi - aziendali) * 100) / 100);
  var creditiEmessi = parseFloat(document.getElementById('cassa-crediti-emessi').value) || 0;
  var rimborsi = parseFloat(document.getElementById('cassa-rimborsi').value) || 0;
  var rimborsiPrec = parseFloat(document.getElementById('cassa-rimborsi-prec').value) || 0;
  var creditiDaRimborsare = Math.round((creditiEmessi - rimborsi) * 100) / 100;
  var versato = parseFloat(document.getElementById('cassa-versato').value) || 0;
  var totSpese = 0;
  var speseHtml = '';
  document.querySelectorAll('#cassa-spese-lista > div').forEach(function(row) {
    var nota = row.querySelector('.cassa-spesa-nota').value || '—';
    var imp = parseFloat(row.querySelector('.cassa-spesa-importo').value) || 0;
    if (imp > 0) { totSpese += imp; speseHtml += '<tr><td style="padding:4px 8px;border:1px solid #ddd;padding-left:20px;color:#666">− Spesa: ' + esc(nota) + '</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:#A32D2D">− € ' + imp.toFixed(2) + '</td></tr>'; }
  });
  var daVersare = Math.round((contanti + creditiEmessi - rimborsi - rimborsiPrec - totSpese) * 100) / 100;
  var differenza = Math.round((versato - daVersare) * 100) / 100;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Registro Cassa ' + data + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}@media print{.no-print{display:none!important}@page{size:portrait;margin:8mm}}table{width:100%;border-collapse:collapse;margin-bottom:12px}td{padding:6px 8px;border:1px solid #ddd}.mono{font-family:Courier New,monospace;text-align:right;font-weight:bold}.section{font-size:10px;font-weight:bold;color:#6B5FCC;text-transform:uppercase;letter-spacing:0.3px;padding:8px;background:#f5f5f5;border:1px solid #ddd}</style></head><body>';
  html += '<div style="display:flex;justify-content:space-between;border-bottom:2px solid #6B5FCC;padding-bottom:8px;margin-bottom:14px"><div><div style="font-size:16px;font-weight:bold;color:#6B5FCC">REGISTRO CASSA — STAZIONE OPPIDO</div><div style="font-size:12px;color:#666;margin-top:2px">' + dataFmt + '</div></div><div style="text-align:right"><div style="font-size:12px;font-weight:bold">PHOENIX FUEL SRL</div></div></div>';
  html += '<table><tr class="section"><td colspan="2">Riepilogo giornata</td></tr>';
  html += '<tr style="background:#EAF3DE"><td style="font-weight:bold">Totale vendite (letture)</td><td class="mono" style="color:#639922">' + fmtE(totVendite) + '</td></tr>';
  html += '</table>';
  html += '<table><tr class="section"><td colspan="2">Incassi carte</td></tr>';
  html += '<tr><td>Bancomat</td><td class="mono">' + fmtE(bancomat) + '</td></tr>';
  html += '<tr><td>Carte Nexi</td><td class="mono">' + fmtE(nexi) + '</td></tr>';
  html += '<tr><td>Carte aziendali</td><td class="mono">' + fmtE(aziendali) + '</td></tr>';
  html += '<tr style="background:#f0f0f0;font-weight:bold"><td>Totale incassi carte</td><td class="mono">' + fmtE(bancomat+nexi+aziendali) + '</td></tr>';
  html += '</table>';
  html += '<table><tr class="section"><td colspan="2">Operazioni contanti</td></tr>';
  html += '<tr style="font-weight:bold"><td>Contanti (vendite − carte)</td><td class="mono">' + fmtE(contanti) + '</td></tr>';
  html += '<tr><td>+ Crediti emessi</td><td class="mono" style="color:#639922">+ ' + fmtE(creditiEmessi) + '</td></tr>';
  html += '<tr><td>− Rimborsi effettuati</td><td class="mono" style="color:#A32D2D">− ' + fmtE(rimborsi) + '</td></tr>';
  html += '<tr><td>− Rimborsi giorni prec.</td><td class="mono" style="color:#A32D2D">− ' + fmtE(rimborsiPrec) + '</td></tr>';
  html += '<tr><td>Crediti da rimborsare (saldo gg)</td><td class="mono" style="color:' + (creditiDaRimborsare >= 0 ? '#639922' : '#A32D2D') + '">' + (creditiDaRimborsare >= 0 ? '+ ' : '− ') + fmtE(Math.abs(creditiDaRimborsare)) + '</td></tr>';
  html += speseHtml;
  html += '<tr style="background:#EAF3DE;font-weight:bold"><td>Contanti da versare</td><td class="mono" style="color:#639922">' + fmtE(daVersare) + '</td></tr>';
  html += '</table>';
  html += '<table><tr class="section"><td colspan="2">Quadratura versamento</td></tr>';
  html += '<tr><td>Da versare</td><td class="mono">' + fmtE(daVersare) + '</td></tr>';
  html += '<tr><td>Versato</td><td class="mono">' + fmtE(versato) + '</td></tr>';
  var diffColor = Math.abs(differenza) < 0.01 ? '#639922' : '#A32D2D';
  html += '<tr style="background:' + (Math.abs(differenza)<0.01 ? '#EAF3DE' : '#FCEBEB') + ';font-weight:bold"><td>Differenza</td><td class="mono" style="color:' + diffColor + '">' + fmtE(differenza) + '</td></tr>';
  html += '</table>';
  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div>';
  html += '</body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

function initReportStazione() {
  var annoCorr = new Date().getFullYear();
  var meseCorr = String(new Date().getMonth()+1).padStart(2,'0');
  ['stz-rep-anno','stz-rep-cassa-anno','stz-rep-vend-anno'].forEach(function(id) {
    var sel = document.getElementById(id);
    if (sel && sel.options.length === 0) {
      for (var y = annoCorr; y >= annoCorr - 5; y--) sel.innerHTML += '<option value="' + y + '"' + (y===annoCorr?' selected':'') + '>' + y + '</option>';
    }
  });
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
          var prezzo=Number(prezziMap[data+'_'+pompa.prodotto]||0);
          var costo=costiMap[data+'_'+pompa.prodotto]||0;
          var litriPD=Number(lettOggi.litri_prezzo_diverso||0);
          var prezzoPD=Number(lettOggi.prezzo_diverso||0);
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
    html+='<tr'+(i%2?' class="alt"':'')+'><td>'+r.data.substring(8)+'/'+r.data.substring(5,7)+'</td><td>'+fmtL(r.gasolio)+'</td><td>'+fmtL(r.benzina)+'</td><td style="font-weight:bold">'+fmtL(r.totale)+'</td><td>'+fmtE(r.incasso)+'</td><td>'+(r.costo>0?fmtE(r.costo):'—')+'</td><td style="font-weight:bold;color:'+mc+'">'+(r.costo>0?fmtE(r.margine):'—')+'</td></tr>';
  });
  var tmc=t.margine>=0?'#639922':'#E24B4A';
  html+='<tr class="tot"><td>TOTALE</td><td>'+fmtL(t.gasolio)+'</td><td>'+fmtL(t.benzina)+'</td><td>'+fmtL(t.gasolio+t.benzina)+'</td><td>'+fmtE(t.incasso)+'</td><td>'+(t.costo>0?fmtE(t.costo):'—')+'</td><td style="color:'+tmc+'">'+(t.costo>0?fmtE(t.margine):'—')+'</td></tr>';
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


// Backward compatibility
async function generaReportStazione() { stampaReportVenditeStazione(); }

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

// ═══════════════════════════════════════════════════════════════════
// GIACENZE MENSILI STAZIONE (trimestri)
// ═══════════════════════════════════════════════════════════════════

var _gmDati = null; // { prodotti: [{nome,coeff}], mesi: [{mese,prodotto,giacInizio,entrate,venduti,...}] }
var _gmTrim = 1;
var _gmMesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
var _gmCoeff = { 'default': 0.00085 }; // override per prodotto

function switchTrimestre(btn) {
  document.querySelectorAll('.gm-trim').forEach(function(t) {
    t.style.background = 'var(--bg)'; t.style.color = 'var(--text)';
    t.style.border = '0.5px solid var(--border)'; t.classList.remove('active');
  });
  btn.style.background = ''; btn.style.color = ''; btn.style.border = '';
  btn.classList.add('active');
  _gmTrim = parseInt(btn.dataset.trim);
  renderGiacenzeMensili();
}

async function caricaGiacenzeMensili() {
  // Init anno
  var selAnno = document.getElementById('gm-anno');
  if (selAnno && selAnno.options.length === 0) {
    var annoCorr = new Date().getFullYear();
    for (var y = annoCorr; y >= annoCorr - 5; y--) selAnno.innerHTML += '<option value="' + y + '"' + (y === annoCorr ? ' selected' : '') + '>' + y + '</option>';
  }
  var anno = parseInt(selAnno.value);

  // Identifica prodotti stazione (da cisterne)
  var { data: cisterne } = await sb.from('cisterne').select('prodotto').eq('sede', 'stazione_oppido');
  var prodottiSet = {};
  (cisterne || []).forEach(function(c) { if (c.prodotto) prodottiSet[c.prodotto] = true; });
  var prodotti = Object.keys(prodottiSet).sort();
  if (!prodotti.length) prodotti = ['Gasolio Autotrazione', 'Benzina'];

  // Coefficienti cali tecnici
  _gmCoeff = {};
  prodotti.forEach(function(p) {
    _gmCoeff[p] = p.toLowerCase().indexOf('benzina') >= 0 ? 0.0025 : 0.00085;
  });

  // Carica dati salvati
  var { data: salvati } = await sb.from('giacenze_mensili').select('*').eq('anno', anno).order('mese');
  var salvMap = {};
  (salvati || []).forEach(function(s) { salvMap[s.prodotto + '_' + s.mese] = s; });

  // Carica giacenze inizio anno (dalla chiusura anno precedente o cisterne)
  var giacInizioAnno = {};
  var { data: giacAnnoPrec } = await sb.from('giacenze_mensili').select('prodotto,giacenza_rilevata')
    .eq('anno', anno - 1).eq('mese', 12);
  if (giacAnnoPrec && giacAnnoPrec.length) {
    giacAnnoPrec.forEach(function(g) { if (g.giacenza_rilevata !== null) giacInizioAnno[g.prodotto] = Number(g.giacenza_rilevata); });
  }
  // Fallback: primo mese salvato con giacenza_inizio
  prodotti.forEach(function(p) {
    if (giacInizioAnno[p] === undefined) {
      var s1 = salvMap[p + '_1'];
      if (s1 && Number(s1.giacenza_inizio) > 0) giacInizioAnno[p] = Number(s1.giacenza_inizio);
      else giacInizioAnno[p] = 0;
    }
  });

  // Per ogni mese: calcola entrate e venduti da DB
  var daISO = anno + '-01-01';
  var aISO = anno + '-12-31';

  var [ordiniRes, lettRes, lettPrecRes] = await Promise.all([
    sb.from('ordini').select('data,prodotto,litri').eq('tipo_ordine', 'stazione_servizio')
      .neq('stato', 'annullato').gte('data', daISO).lte('data', aISO),
    sb.from('stazione_letture').select('data,pompa_id,lettura')
      .gte('data', daISO).lte('data', aISO).order('data'),
    sb.from('stazione_letture').select('pompa_id,lettura,data')
      .lt('data', daISO).order('data', { ascending: false }).limit(50)
  ]);

  // Entrate per mese/prodotto
  var entrateMese = {};
  (ordiniRes.data || []).forEach(function(o) {
    var m = parseInt(o.data.substring(5, 7));
    var k = o.prodotto + '_' + m;
    entrateMese[k] = (entrateMese[k] || 0) + Number(o.litri);
  });

  // Venduti per mese/prodotto (da letture pompe)
  var { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva', true);
  var pompaMap = {};
  (pompe || []).forEach(function(p) { pompaMap[p.id] = p.prodotto; });

  // Costruisci mappa letture per pompa per data
  var tutteLett = (lettRes.data || []).concat(lettPrecRes.data || []);
  // Ordina per pompa e data
  var lettPerPompa = {};
  tutteLett.forEach(function(l) {
    if (!lettPerPompa[l.pompa_id]) lettPerPompa[l.pompa_id] = [];
    lettPerPompa[l.pompa_id].push({ data: l.data, lettura: Number(l.lettura) });
  });
  Object.keys(lettPerPompa).forEach(function(pid) {
    lettPerPompa[pid].sort(function(a, b) { return a.data < b.data ? -1 : 1; });
  });

  // Calcola venduti per mese/prodotto
  var vendutiMese = {};
  (pompe || []).forEach(function(p) {
    var arr = lettPerPompa[p.id] || [];
    for (var i = 1; i < arr.length; i++) {
      var dataCorr = arr[i].data;
      if (dataCorr < daISO || dataCorr > aISO) continue;
      var m = parseInt(dataCorr.substring(5, 7));
      var litri = Math.max(0, arr[i].lettura - arr[i - 1].lettura);
      var k = p.prodotto + '_' + m;
      vendutiMese[k] = (vendutiMese[k] || 0) + litri;
    }
  });

  // Costruisci array mesi per ogni prodotto
  var risultato = {};
  prodotti.forEach(function(prod) {
    risultato[prod] = [];
    var giacCorr = giacInizioAnno[prod] || 0;
    var diffCum = 0;

    for (var m = 1; m <= 12; m++) {
      var k = prod + '_' + m;
      var salv = salvMap[k] || {};
      var entrate = entrateMese[k] || 0;
      var venduti = Math.round(vendutiMese[k] || 0);
      var eccedenze = Number(salv.eccedenze_viaggio || 0);
      var caliV = Number(salv.cali_viaggio || 0);
      var scatti = Number(salv.scatti_vuoto || 0);
      var coeff = _gmCoeff[prod] || 0.00085;
      var caliSuggeriti = Math.round(entrate * coeff * 100) / 100;
      var caliTecnici = salv.cali_tecnici !== undefined && salv.cali_tecnici !== null ? Number(salv.cali_tecnici) : caliSuggeriti;
      var giacRilevata = salv.giacenza_rilevata !== undefined && salv.giacenza_rilevata !== null ? Number(salv.giacenza_rilevata) : null;

      var giacPresunta = Math.round((giacCorr + entrate + eccedenze - caliV - scatti - caliTecnici - venduti) * 100) / 100;
      var diffMese = giacRilevata !== null ? Math.round((giacPresunta - giacRilevata) * 100) / 100 : null;
      if (diffMese !== null) diffCum = Math.round((diffCum + diffMese) * 100) / 100;

      risultato[prod].push({
        mese: m, giacInizio: Math.round(giacCorr), entrate: entrate, eccedenze: eccedenze,
        caliViaggio: caliV, scatti: scatti, caliSuggeriti: caliSuggeriti, caliTecnici: caliTecnici,
        venduti: venduti, giacPresunta: giacPresunta, giacRilevata: giacRilevata,
        diffMese: diffMese, diffCumulata: giacRilevata !== null ? diffCum : null
      });

      // La giacenza inizio del mese dopo = giacenza rilevata se disponibile, altrimenti presunta
      giacCorr = giacRilevata !== null ? giacRilevata : giacPresunta;
    }
  });

  _gmDati = { prodotti: prodotti, mesi: risultato, anno: anno, giacInizioAnno: giacInizioAnno };
  renderGiacenzeMensili();
}

function renderGiacenzeMensili() {
  if (!_gmDati) return;
  var container = document.getElementById('gm-contenuto');
  var trim = _gmTrim;

  if (trim === 0) {
    // Vista totali anno
    container.innerHTML = _renderTotaliAnno();
    return;
  }

  var mesiIdx = trim === 1 ? [0,1,2] : trim === 2 ? [3,4,5] : trim === 3 ? [6,7,8] : [9,10,11];
  var html = '';

  _gmDati.prodotti.forEach(function(prod) {
    var dati = _gmDati.mesi[prod];
    var coeff = _gmCoeff[prod] || 0.00085;
    var pi = cacheProdotti.find(function(p) { return p.nome === prod; });
    var col = pi ? pi.colore : '#888';
    var isBenz = prod.toLowerCase().indexOf('benzina') >= 0;

    html += '<div style="font-size:12px;font-weight:500;color:#D85A30;text-transform:uppercase;letter-spacing:0.4px;border-bottom:2px solid #D85A30;padding-bottom:4px;margin:14px 0 6px;display:flex;align-items:center;gap:6px">';
    html += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + col + '"></span>' + esc(prod);
    html += '<span style="font-size:9px;color:var(--text-muted);font-weight:400;text-transform:none;letter-spacing:0">(cali: entrate x ' + coeff + ')</span></div>';

    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr>';
    html += '<th style="text-align:left;padding:6px 8px;border:0.5px solid var(--border);background:var(--bg);font-size:9px;text-transform:uppercase;min-width:170px"></th>';
    mesiIdx.forEach(function(i) {
      html += '<th style="text-align:right;padding:6px 8px;border:0.5px solid var(--border);background:var(--bg);font-size:10px;text-transform:uppercase;min-width:85px">' + _gmMesi[i] + '</th>';
    });
    html += '</tr></thead><tbody>';

    // Righe
    var righe = [
      { key: 'giacInizio', label: 'Giacenza inizio mese', cls: 'auto', badge: 'auto', color: '#0C447C', bg: '#E6F1FB' },
      { key: 'entrate', label: '+ Entrate (carichi)', cls: 'auto', badge: 'auto', color: '#0C447C', bg: '#E6F1FB' },
      { key: 'eccedenze', label: '+ Eccedenze viaggio', cls: 'manual', badge: 'man.', color: '#633806', bg: '#FAEEDA', input: 'eccedenze_viaggio' },
      { key: 'caliViaggio', label: '- Cali viaggio', cls: 'manual', badge: 'man.', color: '#633806', bg: '#FAEEDA', input: 'cali_viaggio', neg: true },
      { key: 'scatti', label: '- Scatti a vuoto', cls: 'manual', badge: 'man.', color: '#633806', bg: '#FAEEDA', input: 'scatti_vuoto', neg: true },
      { key: 'caliTecnici', label: '- Cali tecnici', cls: 'sug', badge: 'sug.', color: '#3C3489', bg: '#EEEDFE', input: 'cali_tecnici', neg: true },
      { key: 'venduti', label: '- Litri venduti (pompe)', cls: 'auto', badge: 'auto', color: '#0C447C', bg: '#E6F1FB', neg: true }
    ];

    righe.forEach(function(r) {
      var bgStyle = r.cls === 'auto' ? 'background:#E6F1FB' : r.cls === 'manual' ? 'background:#FAEEDA' : 'background:#EEEDFE';
      html += '<tr style="' + bgStyle + '"><td style="padding:5px 8px;border:0.5px solid var(--border);color:var(--text-muted)">' + r.label;
      html += ' <span style="display:inline-block;font-size:8px;padding:1px 5px;border-radius:3px;background:' + r.bg + ';color:' + r.color + ';margin-left:3px">' + r.badge + '</span>';
      if (r.key === 'caliTecnici') html += '<br/><span style="font-size:9px;color:#534AB7">suggerimento: entrate x ' + coeff + '</span>';
      html += '</td>';
      mesiIdx.forEach(function(i) {
        var d = dati[i];
        var val = d[r.key];
        if (r.input) {
          var placeholder = r.key === 'caliTecnici' ? d.caliSuggeriti : 0;
          html += '<td style="padding:2px 4px;border:0.5px solid var(--border);' + bgStyle + '">';
          html += '<input type="number" class="gm-input" data-prod="' + esc(prod) + '" data-mese="' + (i + 1) + '" data-field="' + r.input + '" value="' + (val || 0) + '" placeholder="' + placeholder + '" step="1" style="width:100%;font-family:var(--font-mono);font-size:12px;text-align:right;border:none;background:transparent;color:' + (r.neg ? '#A32D2D' : 'var(--text)') + ';padding:4px 6px" /></td>';
        } else {
          html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;' + (r.neg ? 'color:#A32D2D' : '') + '">' + _sep(Math.round(val).toLocaleString('it-IT')) + '</td>';
        }
      });
      html += '</tr>';
    });

    // Separatore
    html += '<tr><td style="padding:2px 0;border:none;border-top:2px solid ' + col + '" colspan="' + (mesiIdx.length + 1) + '"></td></tr>';

    // Giacenza presunta
    html += '<tr style="background:#EAF3DE"><td style="padding:5px 8px;border:0.5px solid var(--border);font-weight:500">= Giacenza presunta</td>';
    mesiIdx.forEach(function(i) {
      html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:#27500A">' + _sep(Math.round(dati[i].giacPresunta).toLocaleString('it-IT')) + '</td>';
    });
    html += '</tr>';

    // Giacenza rilevata (input)
    html += '<tr style="background:#FAEEDA"><td style="padding:5px 8px;border:0.5px solid var(--border);font-weight:500">Giacenza rilevata <span style="display:inline-block;font-size:8px;padding:1px 5px;border-radius:3px;background:#FAEEDA;color:#633806;margin-left:3px">man.</span></td>';
    mesiIdx.forEach(function(i) {
      var val = dati[i].giacRilevata;
      html += '<td style="padding:2px 4px;border:0.5px solid var(--border);background:#FAEEDA"><input type="number" class="gm-input" data-prod="' + esc(prod) + '" data-mese="' + (i + 1) + '" data-field="giacenza_rilevata" value="' + (val !== null ? val : '') + '" placeholder="—" step="1" style="width:100%;font-family:var(--font-mono);font-size:12px;text-align:right;border:none;background:transparent;color:var(--text);padding:4px 6px;font-weight:500" /></td>';
    });
    html += '</tr>';

    // Differenza mese
    html += '<tr style="background:#FCEBEB"><td style="padding:5px 8px;border:0.5px solid var(--border);font-weight:500">Differenza mese</td>';
    mesiIdx.forEach(function(i) {
      var d = dati[i];
      if (d.diffMese !== null) {
        var c = d.diffMese >= 0 ? '#27500A' : '#A32D2D';
        html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:' + c + '">' + (d.diffMese >= 0 ? '+' : '') + _sep(Math.round(d.diffMese).toLocaleString('it-IT')) + '</td>';
      } else {
        html += '<td style="padding:5px 8px;border:0.5px solid var(--border);text-align:center;color:var(--text-hint);font-size:10px">—</td>';
      }
    });
    html += '</tr>';

    // Differenza cumulata
    html += '<tr style="background:#FCEBEB"><td style="padding:5px 8px;border:0.5px solid var(--border);font-weight:500">Diff. cumulata anno</td>';
    mesiIdx.forEach(function(i) {
      var d = dati[i];
      if (d.diffCumulata !== null) {
        var c = d.diffCumulata >= 0 ? '#27500A' : '#A32D2D';
        html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:' + c + '">' + (d.diffCumulata >= 0 ? '+' : '') + _sep(Math.round(d.diffCumulata).toLocaleString('it-IT')) + '</td>';
      } else {
        html += '<td style="padding:5px 8px;border:0.5px solid var(--border);text-align:center;color:var(--text-hint);font-size:10px">—</td>';
      }
    });
    html += '</tr></tbody></table></div>';
  });

  container.innerHTML = html;
}

function _renderTotaliAnno() {
  if (!_gmDati) return '';
  var html = '<div style="font-size:12px;font-weight:500;color:#D85A30;text-transform:uppercase;letter-spacing:0.4px;border-bottom:2px solid #D85A30;padding-bottom:4px;margin:14px 0 6px">Riepilogo annuale ' + _gmDati.anno + '</div>';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="text-align:left;padding:6px 10px;border:0.5px solid var(--border);background:var(--bg);font-size:10px;text-transform:uppercase;min-width:180px"></th>';
  _gmDati.prodotti.forEach(function(prod) {
    var pi = cacheProdotti.find(function(p) { return p.nome === prod; });
    var col = pi ? pi.colore : '#888';
    html += '<th style="text-align:right;padding:6px 10px;border:0.5px solid var(--border);background:var(--bg);font-size:10px;min-width:110px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-right:4px;vertical-align:middle"></span>' + esc(prod) + '</th>';
  });
  html += '</tr></thead><tbody>';

  var campi = [
    { label: 'Giacenza inizio anno', bg: '#E6F1FB', calc: function(d) { return d[0].giacInizio; } },
    { label: 'Totale entrate', bg: '#E6F1FB', calc: function(d) { var s = 0; d.forEach(function(m) { s += m.entrate; }); return s; } },
    { label: 'Totale eccedenze viaggio', bg: '#FAEEDA', calc: function(d) { var s = 0; d.forEach(function(m) { s += m.eccedenze; }); return s; } },
    { label: 'Totale cali viaggio', bg: '#FAEEDA', neg: true, calc: function(d) { var s = 0; d.forEach(function(m) { s += m.caliViaggio; }); return s; } },
    { label: 'Totale scatti a vuoto', bg: '#FAEEDA', neg: true, calc: function(d) { var s = 0; d.forEach(function(m) { s += m.scatti; }); return s; } },
    { label: 'Totale cali tecnici', bg: '#EEEDFE', neg: true, calc: function(d) { var s = 0; d.forEach(function(m) { s += m.caliTecnici; }); return s; } },
    { label: 'Totale litri venduti', bg: '#E6F1FB', neg: true, calc: function(d) { var s = 0; d.forEach(function(m) { s += m.venduti; }); return s; } }
  ];

  campi.forEach(function(c) {
    html += '<tr style="background:' + c.bg + '"><td style="padding:5px 10px;border:0.5px solid var(--border);color:var(--text-muted)">' + c.label + '</td>';
    _gmDati.prodotti.forEach(function(prod) {
      var val = c.calc(_gmDati.mesi[prod]);
      html += '<td style="padding:5px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;' + (c.neg ? 'color:#A32D2D' : '') + '">' + _sep(Math.round(val).toLocaleString('it-IT')) + '</td>';
    });
    html += '</tr>';
  });

  // Separatore
  html += '<tr><td style="padding:2px 0;border:none;border-top:2px solid #D85A30" colspan="' + (_gmDati.prodotti.length + 1) + '"></td></tr>';

  // Giacenza presunta fine anno
  html += '<tr style="background:#EAF3DE"><td style="padding:6px 10px;border:0.5px solid var(--border);font-weight:500">Giacenza presunta fine anno</td>';
  _gmDati.prodotti.forEach(function(prod) {
    var ultimo = _gmDati.mesi[prod][11];
    html += '<td style="padding:6px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:#27500A">' + _sep(Math.round(ultimo.giacPresunta).toLocaleString('it-IT')) + '</td>';
  });
  html += '</tr>';

  // Giacenza rilevata fine anno (dicembre)
  html += '<tr style="background:#FAEEDA"><td style="padding:6px 10px;border:0.5px solid var(--border);font-weight:500">Giacenza rilevata fine anno</td>';
  _gmDati.prodotti.forEach(function(prod) {
    var ultimo = _gmDati.mesi[prod][11];
    html += '<td style="padding:6px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500">' + (ultimo.giacRilevata !== null ? _sep(Math.round(ultimo.giacRilevata).toLocaleString('it-IT')) : '—') + '</td>';
  });
  html += '</tr>';

  // Differenza annuale
  html += '<tr style="background:#FCEBEB"><td style="padding:6px 10px;border:0.5px solid var(--border);font-weight:500">Differenza annuale totale</td>';
  _gmDati.prodotti.forEach(function(prod) {
    var ultimo = _gmDati.mesi[prod][11];
    if (ultimo.diffCumulata !== null) {
      var c = ultimo.diffCumulata >= 0 ? '#27500A' : '#A32D2D';
      html += '<td style="padding:6px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:' + c + '">' + (ultimo.diffCumulata >= 0 ? '+' : '') + _sep(Math.round(ultimo.diffCumulata).toLocaleString('it-IT')) + '</td>';
    } else {
      html += '<td style="padding:6px 10px;border:0.5px solid var(--border);text-align:center;color:var(--text-hint)">—</td>';
    }
  });
  html += '</tr>';

  // Tolleranza
  html += '<tr style="background:var(--bg)"><td style="padding:5px 10px;border:0.5px solid var(--border);color:var(--text-muted)">Tolleranza (1% venduto)</td>';
  _gmDati.prodotti.forEach(function(prod) {
    var totV = 0; _gmDati.mesi[prod].forEach(function(m) { totV += m.venduti; });
    html += '<td style="padding:5px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right">' + _sep(Math.round(totV * 0.01).toLocaleString('it-IT')) + '</td>';
  });
  html += '</tr>';

  // Residuo in tolleranza
  html += '<tr style="background:#EAF3DE"><td style="padding:6px 10px;border:0.5px solid var(--border);font-weight:500">Residuo in tolleranza</td>';
  _gmDati.prodotti.forEach(function(prod) {
    var totV = 0; _gmDati.mesi[prod].forEach(function(m) { totV += m.venduti; });
    var toll = Math.round(totV * 0.01);
    var ultimo = _gmDati.mesi[prod][11];
    var diffAnn = ultimo.diffCumulata !== null ? Math.abs(Math.round(ultimo.diffCumulata)) : 0;
    var residuo = toll - diffAnn;
    var c = residuo >= 0 ? '#27500A' : '#A32D2D';
    html += '<td style="padding:6px 10px;border:0.5px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:' + c + '">' + _sep(residuo.toLocaleString('it-IT')) + '</td>';
  });
  html += '</tr></tbody></table></div>';
  return html;
}

async function salvaGiacenzeMensili() {
  if (!_gmDati) { toast('Carica prima i dati'); return; }
  var anno = _gmDati.anno;
  var inputs = document.querySelectorAll('.gm-input');
  var records = {};

  inputs.forEach(function(inp) {
    var prod = inp.dataset.prod;
    var mese = parseInt(inp.dataset.mese);
    var field = inp.dataset.field;
    var val = inp.value !== '' ? parseFloat(inp.value) : null;
    var k = prod + '_' + mese;
    if (!records[k]) records[k] = { anno: anno, mese: mese, prodotto: prod };
    records[k][field] = val;
  });

  // Aggiungi giacenza_inizio
  Object.keys(records).forEach(function(k) {
    var r = records[k];
    var dati = _gmDati.mesi[r.prodotto];
    if (dati && dati[r.mese - 1]) {
      r.giacenza_inizio = dati[r.mese - 1].giacInizio;
    }
  });

  var arr = Object.values(records);
  if (!arr.length) { toast('Nessun dato da salvare'); return; }

  toast('Salvataggio giacenze...');
  for (var i = 0; i < arr.length; i++) {
    var r = arr[i];
    var { data: existing } = await sb.from('giacenze_mensili').select('id')
      .eq('anno', r.anno).eq('mese', r.mese).eq('prodotto', r.prodotto).maybeSingle();
    if (existing) {
      await sb.from('giacenze_mensili').update(r).eq('id', existing.id);
    } else {
      await sb.from('giacenze_mensili').insert([r]);
    }
  }

  _auditLog('salva_giacenze_mensili', 'giacenze_mensili', 'Anno ' + anno);
  toast('Giacenze mensili salvate!');
  caricaGiacenzeMensili();
}

async function stampaGiacenzeMensili() {
  if (!_gmDati) { toast('Carica prima i dati'); return; }
  var w = _apriReport("Giacenze mensili"); if (!w) return;
  var anno = _gmDati.anno;

  var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Giacenze Mensili ' + anno + '</title>';
  h += '<style>body{font-family:Arial,sans-serif;font-size:9px;margin:0;padding:8mm;color:#1a1a18}@media print{.no-print{display:none!important}@page{size:landscape;margin:6mm}}table{width:100%;border-collapse:collapse}th,td{padding:4px 6px;border:1px solid #ccc;font-size:9px}th{background:#f5f5f0;font-size:8px;text-transform:uppercase;text-align:right}th:first-child{text-align:left}.m{font-family:Courier New,monospace;text-align:right}.sect{font-size:11px;font-weight:bold;color:#D85A30;border-bottom:2px solid #D85A30;padding-bottom:3px;margin:12px 0 5px}</style></head><body>';
  h += '<div style="display:flex;justify-content:space-between;border-bottom:3px solid #D85A30;padding-bottom:8px;margin-bottom:8px"><div><div style="font-size:16px;font-weight:bold;color:#D85A30">GIACENZE MENSILI STAZIONE — ' + anno + '</div><div style="font-size:10px;color:#666">Stazione Oppido Mamertina</div></div><div style="text-align:right"><div style="font-size:12px;font-weight:bold">PHOENIX FUEL SRL</div><div style="font-size:8px;color:#666">Generato: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  _gmDati.prodotti.forEach(function(prod) {
    var dati = _gmDati.mesi[prod];
    var pi = cacheProdotti.find(function(p) { return p.nome === prod; });
    var col = pi ? pi.colore : '#888';
    h += '<div class="sect"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-right:4px"></span>' + esc(prod) + '</div>';
    h += '<table><thead><tr><th style="text-align:left"></th>';
    _gmMesi.forEach(function(m) { h += '<th>' + m.substring(0, 3) + '</th>'; });
    h += '</tr></thead><tbody>';
    var labels = ['Giac. inizio','+ Entrate','+ Eccedenze','- Cali viaggio','- Scatti vuoto','- Cali tecnici','- Venduti','','= Giac. presunta','Giac. rilevata','Diff. mese','Diff. cumulata'];
    var keys = ['giacInizio','entrate','eccedenze','caliViaggio','scatti','caliTecnici','venduti','sep','giacPresunta','giacRilevata','diffMese','diffCumulata'];
    keys.forEach(function(key, ki) {
      if (key === 'sep') { h += '<tr><td style="padding:1px;border:none;border-top:2px solid ' + col + '" colspan="13"></td></tr>'; return; }
      var bg = ki <= 1 || ki === 6 ? '#E6F1FB' : ki <= 5 ? '#FAEEDA' : ki === 8 ? '#EAF3DE' : ki === 9 ? '#FAEEDA' : '#FCEBEB';
      if (ki === 5) bg = '#EEEDFE';
      h += '<tr style="background:' + bg + '"><td style="border:1px solid #ccc;font-size:8px">' + labels[ki] + '</td>';
      for (var m = 0; m < 12; m++) {
        var val = dati[m][key];
        if (val === null || val === undefined) { h += '<td class="m" style="border:1px solid #ccc;color:#999">—</td>'; }
        else {
          var neg = ki >= 3 && ki <= 6;
          var isRes = ki >= 10;
          var c2 = isRes ? (val >= 0 ? '#27500A' : '#A32D2D') : neg ? '#A32D2D' : '';
          h += '<td class="m" style="border:1px solid #ccc;' + (c2 ? 'color:' + c2 : '') + '">' + (isRes && val >= 0 ? '+' : '') + _sep(Math.round(val).toLocaleString('it-IT')) + '</td>';
        }
      }
      h += '</tr>';
    });
    h += '</tbody></table>';
  });

  h += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D85A30;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  w.document.open(); w.document.write(h); w.document.close();
}

// ═══════════════════════════════════════════════════════════════════
// GIACENZE MENSILI STAZIONE (trimestri)
// ═══════════════════════════════════════════════════════════════════

var _gmAnno = new Date().getFullYear();
var _gmTrim = 1;
var _gmDati = {}; // { prodotto: { mesi: [{...}], coeff } }
var _gmMesiNomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
var _gmCoeff = { 'Gasolio Autotrazione': 0.00085, 'Benzina': 0.0025 };

function switchTrimestre(btn) {
  document.querySelectorAll('.gm-trim').forEach(function(t) {
    t.style.background = 'var(--bg)'; t.style.color = 'var(--text)';
    t.style.border = '0.5px solid var(--border)'; t.classList.remove('active');
  });
  btn.style.background = ''; btn.style.color = ''; btn.style.border = '';
  btn.classList.add('active');
  _gmTrim = parseInt(btn.dataset.trim);
  _renderGiacenzeMensili();
}

async function caricaGiacenzeMensili() {
  var sel = document.getElementById('gm-anno');
  if (sel && sel.options.length === 0) {
    var ac = new Date().getFullYear();
    for (var y = ac; y >= ac - 5; y--) sel.innerHTML += '<option value="' + y + '"' + (y === ac ? ' selected' : '') + '>' + y + '</option>';
  }
  _gmAnno = parseInt((sel || {}).value) || new Date().getFullYear();
  var anno = _gmAnno;

  // Carica dati salvati, ordini e letture in parallelo
  var daAnno = anno + '-01-01', aAnno = anno + '-12-31';
  var [gmRes, ordRes, lettRes, lettPrecRes, pompeRes, prezziRes] = await Promise.all([
    sb.from('giacenze_mensili').select('*').eq('anno', anno),
    sb.from('ordini').select('data,prodotto,litri,stato').eq('tipo_ordine', 'stazione_servizio').neq('stato', 'annullato').gte('data', daAnno).lte('data', aAnno),
    sb.from('stazione_letture').select('data,pompa_id,lettura,litri_prezzo_diverso,prezzo_diverso').gte('data', daAnno).lte('data', aAnno).order('data'),
    sb.from('stazione_letture').select('pompa_id,lettura,data').lt('data', daAnno).order('data', { ascending: false }).limit(50),
    sb.from('stazione_pompe').select('id,prodotto').eq('attiva', true),
    sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', daAnno).lte('data', aAnno)
  ]);

  var gmSalvati = gmRes.data || [];
  var ordini = ordRes.data || [];
  var letture = lettRes.data || [];
  var lettPrec = lettPrecRes.data || [];
  var pompe = pompeRes.data || [];
  var prezziAll = prezziRes.data || [];

  // Mappa pompa → prodotto
  var pompaMap = {};
  pompe.forEach(function(p) { pompaMap[p.id] = p.prodotto; });

  // Calcola entrate per mese/prodotto dagli ordini
  var entrateMese = {}; // 'prodotto-MM' → litri
  ordini.forEach(function(o) {
    var m = parseInt(o.data.substring(5, 7));
    var k = o.prodotto + '-' + m;
    entrateMese[k] = (entrateMese[k] || 0) + Number(o.litri);
  });

  // Calcola litri venduti per mese/prodotto dalle letture
  // Per ogni pompa e mese: ultima lettura del mese - prima lettura del mese (o ultima del mese prec)
  var vendutiMese = {}; // 'prodotto-MM' → litri
  // Raggruppa letture per pompa
  var lettPerPompa = {};
  letture.forEach(function(l) {
    if (!lettPerPompa[l.pompa_id]) lettPerPompa[l.pompa_id] = [];
    lettPerPompa[l.pompa_id].push(l);
  });
  // Per letture precedenti all'anno
  var lettPrecMap = {};
  pompe.forEach(function(p) {
    var t = lettPrec.find(function(l) { return l.pompa_id === p.id; });
    if (t) lettPrecMap[p.id] = Number(t.lettura);
  });

  for (var mese = 1; mese <= 12; mese++) {
    var mm = String(mese).padStart(2, '0');
    var inizioM = anno + '-' + mm + '-01';
    var fineM = anno + '-' + mm + '-' + String(new Date(anno, mese, 0).getDate()).padStart(2, '0');
    var mesePre = mese === 1 ? 12 : mese - 1;
    var annoPreM = mese === 1 ? anno - 1 : anno;

    pompe.forEach(function(p) {
      var prod = pompaMap[p.id] || p.prodotto;
      var tutteLett = (lettPerPompa[p.id] || []);
      // Letture di questo mese
      var lettMese = tutteLett.filter(function(l) { return l.data >= inizioM && l.data <= fineM; });
      if (!lettMese.length) return;

      // Ultima lettura del mese
      var ultimaM = lettMese[lettMese.length - 1];
      // Prima lettura del mese prec (o ultima dell'anno prec)
      var lettMesePrec;
      if (mese === 1) {
        lettMesePrec = lettPrecMap[p.id];
      } else {
        var mmP = String(mesePre).padStart(2, '0');
        var fineMP = anno + '-' + mmP + '-' + String(new Date(anno, mesePre, 0).getDate()).padStart(2, '0');
        var lettP = tutteLett.filter(function(l) { return l.data <= fineMP; });
        lettMesePrec = lettP.length ? Number(lettP[lettP.length - 1].lettura) : lettPrecMap[p.id];
      }
      if (lettMesePrec === undefined) return;
      var litriPompa = Math.max(0, Number(ultimaM.lettura) - lettMesePrec);
      var k = prod + '-' + mese;
      vendutiMese[k] = (vendutiMese[k] || 0) + litriPompa;
    });
  }

  // Determina prodotti attivi (Gasolio Autotrazione e Benzina tipicamente)
  var prodotti = [];
  var prodSet = {};
  pompe.forEach(function(p) { if (!prodSet[p.prodotto]) { prodSet[p.prodotto] = true; prodotti.push(p.prodotto); } });

  // Costruisci dati per prodotto
  _gmDati = {};
  prodotti.forEach(function(prod) {
    var coeff = _gmCoeff[prod] || 0.001;
    var mesi = [];
    for (var m = 1; m <= 12; m++) {
      var salvato = gmSalvati.find(function(g) { return g.prodotto === prod && g.mese === m; });
      var entrate = entrateMese[prod + '-' + m] || 0;
      var venduti = Math.round(vendutiMese[prod + '-' + m] || 0);
      var caliSugg = Math.round(entrate * coeff * 100) / 100;

      mesi.push({
        mese: m,
        giacenza_inizio: salvato ? Number(salvato.giacenza_inizio || 0) : 0,
        entrate: entrate,
        eccedenze_viaggio: salvato ? Number(salvato.eccedenze_viaggio || 0) : 0,
        cali_viaggio: salvato ? Number(salvato.cali_viaggio || 0) : 0,
        scatti_vuoto: salvato ? Number(salvato.scatti_vuoto || 0) : 0,
        cali_tecnici: salvato ? Number(salvato.cali_tecnici || 0) : caliSugg,
        cali_suggerimento: caliSugg,
        venduti: venduti,
        giacenza_rilevata: salvato ? salvato.giacenza_rilevata : null,
        note: salvato ? salvato.note : ''
      });
    }
    _gmDati[prod] = { mesi: mesi, coeff: coeff };
  });

  _renderGiacenzeMensili();
}

function _renderGiacenzeMensili() {
  var trim = _gmTrim;
  var container = document.getElementById('gm-contenuto');
  if (!container) return;

  if (trim === 0) {
    _renderGiacenzeTotaliAnno(container);
    return;
  }

  var mesiIdx = trim === 1 ? [0,1,2] : trim === 2 ? [3,4,5] : trim === 3 ? [6,7,8] : [9,10,11];
  var html = '';

  Object.keys(_gmDati).forEach(function(prod) {
    var d = _gmDati[prod];
    var pi = cacheProdotti.find(function(pp) { return pp.nome === prod; });
    var col = pi ? pi.colore : '#888';

    html += '<div style="font-size:12px;font-weight:500;color:#D85A30;text-transform:uppercase;letter-spacing:0.4px;border-bottom:2px solid #D85A30;padding-bottom:4px;margin:14px 0 6px;display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + col + '"></span>' + esc(prod) + ' <span style="font-size:9px;color:var(--text-muted);font-weight:400;text-transform:none;letter-spacing:0">(cali: entrate x ' + d.coeff + ')</span></div>';

    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr>';
    html += '<th style="padding:6px 8px;border:1px solid var(--border);text-align:left;background:var(--bg);font-size:9px;text-transform:uppercase;min-width:170px"></th>';
    mesiIdx.forEach(function(mi) { html += '<th style="padding:6px 8px;border:1px solid var(--border);text-align:right;background:var(--bg);font-size:10px;text-transform:uppercase;min-width:90px">' + _gmMesiNomi[mi] + '</th>'; });
    html += '</tr></thead><tbody>';

    // Righe
    var righe = [
      { key: 'giacenza_inizio', label: 'Giacenza inizio mese', tipo: 'auto', segno: '' },
      { key: 'entrate', label: '+ Entrate (carichi)', tipo: 'auto', segno: '' },
      { key: 'eccedenze_viaggio', label: '+ Eccedenze viaggio', tipo: 'man', segno: '' },
      { key: 'cali_viaggio', label: '- Cali viaggio', tipo: 'man', segno: '-' },
      { key: 'scatti_vuoto', label: '- Scatti a vuoto', tipo: 'man', segno: '-' },
      { key: 'cali_tecnici', label: '- Cali tecnici', tipo: 'sug', segno: '-' },
      { key: 'venduti', label: '- Litri venduti (pompe)', tipo: 'auto', segno: '-' }
    ];

    var bgMap = { auto: '#E6F1FB', man: '#FAEEDA', sug: '#EEEDFE' };
    var badgeMap = { auto: '<span style="display:inline-block;font-size:8px;padding:1px 5px;border-radius:3px;margin-left:3px;background:#E6F1FB;color:#0C447C">auto</span>', man: '<span style="display:inline-block;font-size:8px;padding:1px 5px;border-radius:3px;margin-left:3px;background:#FAEEDA;color:#633806">man.</span>', sug: '<span style="display:inline-block;font-size:8px;padding:1px 5px;border-radius:3px;margin-left:3px;background:#EEEDFE;color:#3C3489">sug.</span>' };

    righe.forEach(function(r) {
      html += '<tr style="background:' + bgMap[r.tipo] + '"><td style="padding:5px 8px;border:1px solid var(--border);color:var(--text-muted)">' + r.label + ' ' + badgeMap[r.tipo] + '</td>';
      mesiIdx.forEach(function(mi) {
        var m = d.mesi[mi];
        var val = m[r.key];
        var inputable = r.tipo === 'man' || r.tipo === 'sug';
        var colore = r.segno === '-' ? 'color:#A32D2D' : '';
        if (inputable) {
          var inputId = 'gm-' + prod.replace(/\s/g, '_') + '-' + r.key + '-' + (mi + 1);
          var placeholder = r.tipo === 'sug' ? 'sug: ' + Math.round(m.cali_suggerimento) : '0';
          html += '<td style="padding:2px 4px;border:1px solid var(--border)"><input type="number" id="' + inputId + '" value="' + (val || '') + '" placeholder="' + placeholder + '" style="width:100%;font-family:var(--font-mono);font-size:12px;text-align:right;border:none;background:transparent;color:var(--text);padding:3px 4px" /></td>';
        } else {
          html += '<td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;' + colore + '">' + _sep(Math.round(val).toLocaleString('it-IT')) + '</td>';
        }
      });
      html += '</tr>';
    });

    // Separatore
    html += '<tr><td colspan="4" style="padding:2px 0;border:none;border-top:2px solid ' + col + '"></td></tr>';

    // Giacenza presunta (calcolata)
    html += '<tr style="background:#EAF3DE"><td style="padding:6px 8px;border:1px solid var(--border);font-weight:500;color:var(--text)">= Giacenza presunta</td>';
    mesiIdx.forEach(function(mi) {
      var m = d.mesi[mi];
      var presunta = m.giacenza_inizio + m.entrate + m.eccedenze_viaggio - m.cali_viaggio - m.scatti_vuoto - m.cali_tecnici - m.venduti;
      html += '<td style="padding:6px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:#27500A">' + _sep(Math.round(presunta).toLocaleString('it-IT')) + '</td>';
    });
    html += '</tr>';

    // Giacenza rilevata (manuale)
    html += '<tr style="background:#FAEEDA"><td style="padding:5px 8px;border:1px solid var(--border);font-weight:500;color:var(--text)">Giacenza rilevata <span style="display:inline-block;font-size:8px;padding:1px 5px;border-radius:3px;margin-left:3px;background:#FAEEDA;color:#633806">man.</span></td>';
    mesiIdx.forEach(function(mi) {
      var m = d.mesi[mi];
      var inputId = 'gm-' + prod.replace(/\s/g, '_') + '-rilevata-' + (mi + 1);
      html += '<td style="padding:2px 4px;border:1px solid var(--border)"><input type="number" id="' + inputId + '" value="' + (m.giacenza_rilevata !== null ? m.giacenza_rilevata : '') + '" placeholder="—" style="width:100%;font-family:var(--font-mono);font-size:12px;text-align:right;border:none;background:transparent;color:var(--text);padding:3px 4px;font-weight:500" /></td>';
    });
    html += '</tr>';

    // Differenza mese
    html += '<tr style="background:#FCEBEB"><td style="padding:5px 8px;border:1px solid var(--border);font-weight:500;color:var(--text)">Differenza mese</td>';
    mesiIdx.forEach(function(mi) {
      var m = d.mesi[mi];
      var presunta = m.giacenza_inizio + m.entrate + m.eccedenze_viaggio - m.cali_viaggio - m.scatti_vuoto - m.cali_tecnici - m.venduti;
      var diff = m.giacenza_rilevata !== null ? Math.round(presunta - m.giacenza_rilevata) : 0;
      var dCol = m.giacenza_rilevata === null ? 'var(--text-hint)' : diff >= 0 ? '#27500A' : '#A32D2D';
      html += '<td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:' + dCol + '">' + (m.giacenza_rilevata !== null ? (diff >= 0 ? '+' : '') + _sep(diff.toLocaleString('it-IT')) : '—') + '</td>';
    });
    html += '</tr>';

    // Differenza cumulata da inizio anno
    html += '<tr style="background:#FCEBEB"><td style="padding:5px 8px;border:1px solid var(--border);font-weight:500;color:var(--text)">Diff. cumulata anno</td>';
    mesiIdx.forEach(function(mi) {
      var cumul = 0;
      for (var j = 0; j <= mi; j++) {
        var mj = d.mesi[j];
        var pj = mj.giacenza_inizio + mj.entrate + mj.eccedenze_viaggio - mj.cali_viaggio - mj.scatti_vuoto - mj.cali_tecnici - mj.venduti;
        if (mj.giacenza_rilevata !== null) cumul += Math.round(pj - mj.giacenza_rilevata);
      }
      html += '<td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500">' + (cumul >= 0 ? '+' : '') + _sep(cumul.toLocaleString('it-IT')) + '</td>';
    });
    html += '</tr>';

    html += '</tbody></table></div>';
  });

  container.innerHTML = html;
}

function _renderGiacenzeTotaliAnno(container) {
  var prodotti = Object.keys(_gmDati);
  var html = '<div style="font-size:12px;font-weight:500;color:#D85A30;text-transform:uppercase;letter-spacing:0.4px;border-bottom:2px solid #D85A30;padding-bottom:4px;margin:10px 0 6px">Riepilogo annuale ' + _gmAnno + '</div>';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr>';
  html += '<th style="padding:6px 8px;border:1px solid var(--border);text-align:left;background:var(--bg);font-size:9px;text-transform:uppercase;min-width:180px"></th>';
  prodotti.forEach(function(prod) {
    var pi = cacheProdotti.find(function(pp) { return pp.nome === prod; }); var col = pi ? pi.colore : '#888';
    html += '<th style="padding:6px 10px;border:1px solid var(--border);text-align:right;background:var(--bg);font-size:10px;min-width:110px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-right:4px;vertical-align:middle"></span>' + esc(prod) + '</th>';
  });
  html += '</tr></thead><tbody>';

  var righe = [
    { label: 'Giacenza inizio anno', calc: function(d) { return d.mesi[0].giacenza_inizio; }, bg: '#E6F1FB' },
    { label: 'Totale entrate', calc: function(d) { var s = 0; d.mesi.forEach(function(m) { s += m.entrate; }); return s; }, bg: '#E6F1FB' },
    { label: 'Totale eccedenze viaggio', calc: function(d) { var s = 0; d.mesi.forEach(function(m) { s += m.eccedenze_viaggio; }); return s; }, bg: '#FAEEDA' },
    { label: 'Totale cali viaggio', calc: function(d) { var s = 0; d.mesi.forEach(function(m) { s += m.cali_viaggio; }); return s; }, bg: '#FAEEDA', neg: true },
    { label: 'Totale scatti a vuoto', calc: function(d) { var s = 0; d.mesi.forEach(function(m) { s += m.scatti_vuoto; }); return s; }, bg: '#FAEEDA', neg: true },
    { label: 'Totale cali tecnici', calc: function(d) { var s = 0; d.mesi.forEach(function(m) { s += m.cali_tecnici; }); return s; }, bg: '#EEEDFE', neg: true },
    { label: 'Totale litri venduti', calc: function(d) { var s = 0; d.mesi.forEach(function(m) { s += m.venduti; }); return s; }, bg: '#E6F1FB', neg: true }
  ];

  righe.forEach(function(r) {
    html += '<tr style="background:' + r.bg + '"><td style="padding:5px 8px;border:1px solid var(--border);color:var(--text-muted)">' + r.label + '</td>';
    prodotti.forEach(function(prod) {
      var v = Math.round(r.calc(_gmDati[prod]));
      html += '<td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;' + (r.neg ? 'color:#A32D2D' : '') + '">' + _sep(v.toLocaleString('it-IT')) + '</td>';
    });
    html += '</tr>';
  });

  // Separatore
  html += '<tr><td colspan="' + (1 + prodotti.length) + '" style="padding:2px 0;border:none;border-top:2px solid #D85A30"></td></tr>';

  // Giacenza presunta fine anno
  html += '<tr style="background:#EAF3DE"><td style="padding:6px 8px;border:1px solid var(--border);font-weight:500">Giacenza presunta fine anno</td>';
  prodotti.forEach(function(prod) {
    var d = _gmDati[prod]; var ultimo = d.mesi[11];
    var presunta = ultimo.giacenza_inizio + ultimo.entrate + ultimo.eccedenze_viaggio - ultimo.cali_viaggio - ultimo.scatti_vuoto - ultimo.cali_tecnici - ultimo.venduti;
    html += '<td style="padding:6px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:#27500A">' + _sep(Math.round(presunta).toLocaleString('it-IT')) + '</td>';
  });
  html += '</tr>';

  // Giacenza rilevata fine anno (ultimo mese con rilevata)
  html += '<tr style="background:#FAEEDA"><td style="padding:5px 8px;border:1px solid var(--border);font-weight:500">Giacenza rilevata fine anno</td>';
  prodotti.forEach(function(prod) {
    var d = _gmDati[prod]; var ril = d.mesi[11].giacenza_rilevata;
    html += '<td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500">' + (ril !== null ? _sep(Math.round(ril).toLocaleString('it-IT')) : '—') + '</td>';
  });
  html += '</tr>';

  // Differenza totale anno
  html += '<tr style="background:#FCEBEB"><td style="padding:6px 8px;border:1px solid var(--border);font-weight:500">Differenza annuale totale</td>';
  prodotti.forEach(function(prod) {
    var d = _gmDati[prod]; var cumul = 0;
    d.mesi.forEach(function(m) {
      var p = m.giacenza_inizio + m.entrate + m.eccedenze_viaggio - m.cali_viaggio - m.scatti_vuoto - m.cali_tecnici - m.venduti;
      if (m.giacenza_rilevata !== null) cumul += Math.round(p - m.giacenza_rilevata);
    });
    var dCol = cumul >= 0 ? '#27500A' : '#A32D2D';
    html += '<td style="padding:6px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right;font-weight:500;color:' + dCol + '">' + (cumul >= 0 ? '+' : '') + _sep(cumul.toLocaleString('it-IT')) + '</td>';
  });
  html += '</tr>';

  // Tolleranza
  html += '<tr style="background:var(--bg)"><td style="padding:5px 8px;border:1px solid var(--border);color:var(--text-muted)">Tolleranza (1% venduto)</td>';
  prodotti.forEach(function(prod) {
    var d = _gmDati[prod]; var totV = 0; d.mesi.forEach(function(m) { totV += m.venduti; });
    html += '<td style="padding:5px 8px;border:1px solid var(--border);font-family:var(--font-mono);text-align:right">' + _sep(Math.round(totV * 0.01).toLocaleString('it-IT')) + '</td>';
  });
  html += '</tr>';

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

async function salvaGiacenzeMensili() {
  var anno = _gmAnno;
  var records = [];

  Object.keys(_gmDati).forEach(function(prod) {
    var d = _gmDati[prod];
    var prodKey = prod.replace(/\s/g, '_');
    for (var mi = 0; mi < 12; mi++) {
      var m = d.mesi[mi];
      var mese = mi + 1;
      // Leggi valori dagli input se visibili
      var eccV = _gmReadInput('gm-' + prodKey + '-eccedenze_viaggio-' + mese, m.eccedenze_viaggio);
      var calV = _gmReadInput('gm-' + prodKey + '-cali_viaggio-' + mese, m.cali_viaggio);
      var scaV = _gmReadInput('gm-' + prodKey + '-scatti_vuoto-' + mese, m.scatti_vuoto);
      var calT = _gmReadInput('gm-' + prodKey + '-cali_tecnici-' + mese, m.cali_tecnici);
      var rilV = _gmReadInput('gm-' + prodKey + '-rilevata-' + mese, m.giacenza_rilevata);

      // Aggiorna dati in memoria
      m.eccedenze_viaggio = eccV;
      m.cali_viaggio = calV;
      m.scatti_vuoto = scaV;
      m.cali_tecnici = calT;
      m.giacenza_rilevata = rilV;

      // Giacenza inizio del mese successivo = rilevata di questo mese
      if (mi < 11 && rilV !== null) {
        d.mesi[mi + 1].giacenza_inizio = rilV;
      }

      records.push({
        anno: anno,
        mese: mese,
        prodotto: prod,
        giacenza_inizio: m.giacenza_inizio,
        eccedenze_viaggio: eccV || 0,
        cali_viaggio: calV || 0,
        scatti_vuoto: scaV || 0,
        cali_tecnici: calT || 0,
        giacenza_rilevata: rilV,
        updated_at: new Date().toISOString()
      });
    }
  });

  // Upsert tutti i record
  var { error } = await sb.from('giacenze_mensili').upsert(records, { onConflict: 'anno,mese,prodotto' });
  if (error) { toast('Errore: ' + error.message); return; }
  _auditLog('salva_giacenze_mensili', 'giacenze_mensili', 'Anno ' + anno);
  toast('Giacenze mensili salvate!');
  _renderGiacenzeMensili();
}

function _gmReadInput(id, fallback) {
  var el = document.getElementById(id);
  if (!el) return fallback;
  var v = el.value.trim();
  if (v === '') return null;
  return parseFloat(v);
}

async function stampaGiacenzeMensili() {
  var w = _apriReport('Giacenze mensili'); if (!w) return;
  var anno = _gmAnno;
  var prodotti = Object.keys(_gmDati);

  var css = 'body{font-family:Arial,sans-serif;font-size:9px;margin:0;padding:8mm;color:#1a1a18}@media print{.no-print{display:none!important}@page{size:landscape;margin:6mm}}table{width:100%;border-collapse:collapse}th,td{padding:4px 6px;border:1px solid #ccc;font-size:9px}th{background:#f5f5f0;font-size:8px;text-transform:uppercase;text-align:right}th:first-child{text-align:left}.m{font-family:Courier New,monospace;text-align:right}.sect{font-size:11px;font-weight:bold;color:#D85A30;border-bottom:2px solid #D85A30;padding-bottom:3px;margin:12px 0 5px}';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Giacenze mensili ' + anno + '</title><style>' + css + '</style></head><body>';
  html += '<div style="display:flex;justify-content:space-between;border-bottom:3px solid #D85A30;padding-bottom:8px;margin-bottom:10px"><div><div style="font-size:16px;font-weight:bold;color:#D85A30">GIACENZE MENSILI STAZIONE — ' + anno + '</div><div style="font-size:10px;color:#666;margin-top:2px">Stazione Oppido Mamertina</div></div><div style="text-align:right"><div style="font-size:12px;font-weight:bold">PHOENIX FUEL SRL</div><div style="font-size:8px;color:#666">Generato: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  prodotti.forEach(function(prod) {
    var d = _gmDati[prod]; var pi = cacheProdotti.find(function(pp) { return pp.nome === prod; }); var col = pi ? pi.colore : '#888';
    html += '<div class="sect"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-right:4px"></span>' + esc(prod) + ' (cali: x' + d.coeff + ')</div>';
    html += '<table><thead><tr><th style="text-align:left"></th>';
    for (var i = 0; i < 12; i++) html += '<th>' + _gmMesiNomi[i].substring(0, 3) + '</th>';
    html += '</tr></thead><tbody>';

    // Righe dati
    var labels = ['Giac. inizio','+ Entrate','+ Ecced. viaggio','- Cali viaggio','- Scatti vuoto','- Cali tecnici','- Lt venduti'];
    var keys = ['giacenza_inizio','entrate','eccedenze_viaggio','cali_viaggio','scatti_vuoto','cali_tecnici','venduti'];
    labels.forEach(function(lab, idx) {
      html += '<tr><td style="color:#666">' + lab + '</td>';
      for (var i = 0; i < 12; i++) { html += '<td class="m">' + _sep(Math.round(d.mesi[i][keys[idx]]).toLocaleString('it-IT')) + '</td>'; }
      html += '</tr>';
    });
    // Presunta
    html += '<tr style="background:#EAF3DE;font-weight:bold"><td>= Giac. presunta</td>';
    for (var i = 0; i < 12; i++) { var m = d.mesi[i]; var p = m.giacenza_inizio + m.entrate + m.eccedenze_viaggio - m.cali_viaggio - m.scatti_vuoto - m.cali_tecnici - m.venduti; html += '<td class="m" style="color:#27500A">' + _sep(Math.round(p).toLocaleString('it-IT')) + '</td>'; }
    html += '</tr>';
    // Rilevata
    html += '<tr style="background:#FAEEDA;font-weight:bold"><td>Giac. rilevata</td>';
    for (var i = 0; i < 12; i++) { var r = d.mesi[i].giacenza_rilevata; html += '<td class="m">' + (r !== null ? _sep(Math.round(r).toLocaleString('it-IT')) : '—') + '</td>'; }
    html += '</tr>';
    // Diff mese
    html += '<tr style="background:#FCEBEB"><td>Diff. mese</td>';
    for (var i = 0; i < 12; i++) { var m = d.mesi[i]; var p = m.giacenza_inizio + m.entrate + m.eccedenze_viaggio - m.cali_viaggio - m.scatti_vuoto - m.cali_tecnici - m.venduti; var df = m.giacenza_rilevata !== null ? Math.round(p - m.giacenza_rilevata) : 0; var dc = m.giacenza_rilevata !== null ? (df >= 0 ? '#27500A' : '#A32D2D') : '#999'; html += '<td class="m" style="color:' + dc + '">' + (m.giacenza_rilevata !== null ? (df >= 0 ? '+' : '') + df : '—') + '</td>'; }
    html += '</tr>';
    // Diff cumulata
    html += '<tr style="background:#FCEBEB"><td>Diff. cumulata</td>';
    var cum = 0;
    for (var i = 0; i < 12; i++) { var m = d.mesi[i]; var p = m.giacenza_inizio + m.entrate + m.eccedenze_viaggio - m.cali_viaggio - m.scatti_vuoto - m.cali_tecnici - m.venduti; if (m.giacenza_rilevata !== null) cum += Math.round(p - m.giacenza_rilevata); html += '<td class="m" style="font-weight:bold">' + (cum >= 0 ? '+' : '') + cum + '</td>'; }
    html += '</tr></tbody></table>';
  });

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D85A30;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

// PhoenixFuel — Deposito, Rettifiche, Autoconsumo
// ── DEPOSITO ─────────────────────────────────────────────────────

function switchDepositoTab(btn) {
  document.querySelectorAll('.dep-tab').forEach(function(t) {
    t.style.background = 'var(--bg)'; t.style.color = 'var(--text)';
    t.style.border = '0.5px solid var(--border)'; t.classList.remove('active');
  });
  btn.style.background = ''; btn.style.color = ''; btn.style.border = '';
  btn.classList.add('active');
  document.querySelectorAll('.dep-panel').forEach(function(p) { p.style.display = 'none'; });
  document.getElementById(btn.dataset.tab).style.display = '';
  if (btn.dataset.tab === 'dep-ricezione-das') caricaDasOrdiniDeposito();
  if (btn.dataset.tab === 'dep-giacenze-gg') caricaGiacenzeGiornaliere();
}

function cisternasvg(pct, colore) {
  const altMax=80, liv=Math.round((pct/100)*altMax), y=10+(altMax-liv);
  const fill = pct<20?'#E24B4A':pct<35?'#BA7517':colore;
  return '<svg class="dep-cisterna-svg" viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="10" width="50" height="80" rx="4" fill="#e8e7e3" stroke="#ccc" stroke-width="1"/><rect x="5" y="' + y + '" width="50" height="' + liv + '" rx="2" fill="' + fill + '" opacity="0.85"/><rect x="5" y="10" width="50" height="80" rx="4" fill="none" stroke="#bbb" stroke-width="1.5"/><rect x="20" y="5" width="20" height="8" rx="2" fill="#ccc"/><line x1="5" y1="30" x2="8" y2="30" stroke="#bbb" stroke-width="1"/><line x1="5" y1="50" x2="8" y2="50" stroke="#bbb" stroke-width="1"/><line x1="5" y1="70" x2="8" y2="70" stroke="#bbb" stroke-width="1"/></svg>';
}

async function caricaDeposito() {
  _cacheCisterne = null; // Invalida cache per ordini
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','deposito_vibo').order('tipo').order('nome');
  if (!cisterne) return;

  // Raggruppa cisterne per tipo
  const tipi = [...new Set(cisterne.map(c => c.tipo))];
  // Ordina tipi secondo ordine_visualizzazione dei prodotti
  const tipiOrdinati = [...tipi].sort((a, b) => {
    const pa = cacheProdotti.find(p => p.tipo_cisterna === a);
    const pb = cacheProdotti.find(p => p.tipo_cisterna === b);
    return (pa ? pa.ordine_visualizzazione : 99) - (pb ? pb.ordine_visualizzazione : 99);
  });

  const container = document.getElementById('container-deposito-prodotti');
  let totaleStoccato = 0, capacitaTotale = 0, allerte = 0;
  let htmlBenzine = '', htmlMagazzino = '';

  tipiOrdinati.forEach(tipo => {
    const gruppo = cisterne.filter(c => c.tipo === tipo);
    if (!gruppo.length) return;
    const prodNome = gruppo[0].prodotto || tipo;
    const prodInfo = cacheProdotti.find(p => p.tipo_cisterna === tipo || p.nome === prodNome);
    const colore = prodInfo ? prodInfo.colore : '#888';
    const categoria = prodInfo ? prodInfo.categoria : 'altro';
    const um = prodInfo && prodInfo.unita_misura === 'pezzi' ? 'pz' : 'L';
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
        '<div class="dep-cisterna-litri">' + _sep(livAtt.toLocaleString('it-IT')) + ' ' + um + '</div>' +
        '<div class="dep-cisterna-pct">' + pct + '% · cap. ' + _sep(capMax.toLocaleString('it-IT')) + ' ' + um + '</div>' +
        (cmp > 0 ? '<div style="font-size:9px;color:var(--text-muted);margin-top:2px">CMP: <strong style="font-family:var(--font-mono)">€ ' + cmp.toFixed(4) + '</strong></div>' : '') +
        '</div>';
    });

    const subLabel = nCis + (nCis === 1 ? ' cisterna' : ' cisterne') + ' · ' + _sep(capGruppo.toLocaleString('it-IT')) + ' ' + um;
    const totLabel = um === 'pz' ? _sep(totG.toLocaleString('it-IT')) + ' pz' : fmtL(totG);
    // CMP medio ponderato per il gruppo
    let cmpGruppo = 0;
    if (um !== 'pz') {
      let valGruppo = 0;
      gruppo.forEach(c => { valGruppo += Number(c.livello_attuale||0) * Number(c.costo_medio||0); });
      cmpGruppo = totG > 0 ? valGruppo / totG : 0;
    }
    const cmpLabel = cmpGruppo > 0 ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">CMP: <strong style="font-family:var(--font-mono)">€ ' + cmpGruppo.toFixed(4) + '</strong> · Valore: <strong style="font-family:var(--font-mono)">' + fmtE(totG * cmpGruppo) + '</strong></div>' : '';
    const cardHtml = '<div class="card"><div class="dep-product-header"><div class="dep-product-dot" style="background:' + colore + '"></div><div><div class="dep-product-title">' + esc(prodNome) + '</div><div class="dep-product-sub">' + subLabel + '</div>' + cmpLabel + '</div><div class="dep-product-total">' + totLabel + '</div></div><div class="dep-cisterne-grid">' + cisHtml + '</div></div>';

    if (categoria === 'benzine') { htmlBenzine += cardHtml; totaleStoccato += totG; capacitaTotale += capGruppo; } else { htmlMagazzino += cardHtml; }
  });

  // Allerte: ricalcola solo benzine
  allerte = 0;
  cisterne.filter(c => { const pi = cacheProdotti.find(p => p.tipo_cisterna === c.tipo || p.nome === c.prodotto); return pi && pi.categoria === 'benzine'; }).forEach(c => {
    const pct = Number(c.capacita_max) > 0 ? Math.round((Number(c.livello_attuale) / Number(c.capacita_max)) * 100) : 0;
    if (pct < 30) allerte++;
  });

  let finalHtml = '';
  if (htmlBenzine) finalHtml += '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">⛽ Cisterne Carburanti</div>' + htmlBenzine;
  if (htmlMagazzino) finalHtml += '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px">📦 Magazzino Altri Prodotti</div>' + htmlMagazzino;
  if (container) container.innerHTML = finalHtml;
  document.getElementById('dep-capacita').textContent = fmtL(capacitaTotale);
  document.getElementById('dep-totale').textContent = fmtL(totaleStoccato);
  document.getElementById('dep-pct').textContent = capacitaTotale > 0 ? Math.round((totaleStoccato / capacitaTotale) * 100) + '%' : '—';
  document.getElementById('dep-allerta').textContent = allerte;
  const { data: mov } = await sb.from('ordini').select('*').or('tipo_ordine.eq.entrata_deposito,tipo_ordine.eq.stazione_servizio,tipo_ordine.eq.autoconsumo,fornitore.ilike.%phoenix%').order('created_at',{ascending:false}).limit(10);
  const tbody = document.getElementById('dep-movimenti');
  if (!mov||!mov.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun movimento</td></tr>'; return; }
  const movBadge = { 'entrata_deposito':'<span class="badge teal">Entrata</span>', 'stazione_servizio':'<span class="badge purple">Stazione</span>', 'autoconsumo':'<span class="badge gray">Autoconsumo</span>' };
  tbody.innerHTML = mov.map(r => '<tr><td>' + r.data + '</td><td>' + (movBadge[r.tipo_ordine]||'<span class="badge amber">Uscita</span>') + '</td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td>' + esc(r.fornitore) + '</td><td>' + badgeStato(r.stato) + '</td></tr>').join('');
  caricaRettifiche('deposito');
  _popolaSelAnnoGiac('giac-dep-anno');
}

async function aggiornaCisterna(cisternaId, litri, tipo, ordineId, data, costoLitro) {
  const { data: cis } = await sb.from('cisterne').select('*').eq('id', cisternaId).single();
  if (!cis) return;
  let nuovoLivello, nuovoCostoMedio = Number(cis.costo_medio||0);
  const cmpPrec = Number(cis.costo_medio||0);
  const litriPrec = Number(cis.livello_attuale);
  if (tipo==='entrata') {
    nuovoLivello = litriPrec + Number(litri);
    if (costoLitro && costoLitro > 0 && nuovoLivello > 0) {
      const costoVecchio = litriPrec * cmpPrec;
      nuovoCostoMedio = (costoVecchio + Number(litri)*Number(costoLitro)) / nuovoLivello;
      nuovoCostoMedio = Math.round(nuovoCostoMedio * 1000000) / 1000000;
    }
  } else {
    nuovoLivello = Math.max(0, litriPrec - Number(litri));
  }
  await sb.from('cisterne').update({ livello_attuale:nuovoLivello, costo_medio:nuovoCostoMedio, updated_at:new Date().toISOString() }).eq('id', cisternaId);
  await sb.from('movimenti_cisterne').insert([{ cisterna_id:cisternaId, ordine_id:ordineId, tipo, litri, data }]);
  // Registra variazione CMP nello storico se entrata con costo
  if (tipo === 'entrata' && costoLitro && costoLitro > 0) {
    await sb.from('stazione_cmp_storico').insert([{
      data: data || oggiISO,
      prodotto: cis.prodotto || '',
      sede: cis.sede || 'deposito_vibo',
      cmp_precedente: cmpPrec,
      cmp_nuovo: nuovoCostoMedio,
      litri_precedenti: litriPrec,
      litri_caricati: Number(litri),
      costo_carico: Number(costoLitro),
      ordine_id: ordineId
    }]);
  }
}

async function apriModaleAssegnaCisterna(ordineId) {
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) return;
  const prodottoMap = getProdottoTipoCisterna();
  const tipo = prodottoMap[ordine.prodotto] || 'autotrazione';
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('tipo', tipo).eq('sede','deposito_vibo').order('nome');
  if (!cisterne||!cisterne.length) { toast('Nessuna cisterna trovata per questo prodotto'); return; }

  // Distribuzione automatica ottimale
  let litriRimanenti = Number(ordine.litri);
  const distribuzione = {};
  const ordinate = [...cisterne].map(c=>({...c, spazio:Number(c.capacita_max)-Number(c.livello_attuale)})).filter(c=>c.spazio>0).sort((a,b)=>b.spazio-a.spazio);
  ordinate.forEach(c => {
    if (litriRimanenti <= 0) return;
    const qta = Math.min(litriRimanenti, c.spazio);
    distribuzione[c.id] = qta;
    litriRimanenti -= qta;
  });

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">Distribuzione carico — ' + ordine.prodotto + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Totale da caricare: <strong>' + fmtL(ordine.litri) + '</strong></div>';
  if (litriRimanenti > 0) html += '<div class="alert-box" style="margin-bottom:12px">Spazio insufficiente! Mancano ' + fmtL(litriRimanenti) + '</div>';

  cisterne.forEach(c => {
    const pct = Math.round((Number(c.livello_attuale)/Number(c.capacita_max))*100);
    const spazio = Number(c.capacita_max) - Number(c.livello_attuale);
    const qtaSuggerita = distribuzione[c.id] || 0;
    html += '<div style="padding:12px;background:var(--bg-kpi);border-radius:8px;margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:13px;font-weight:500">' + c.nome + '</span><span style="font-size:11px;color:var(--text-muted)">Spazio: ' + fmtL(spazio) + '</span></div>' +
      '<div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:8px"><div style="height:100%;width:' + pct + '%;background:' + (pct<30?'#E24B4A':pct<60?'#BA7517':'#639922') + ';border-radius:2px"></div></div>' +
      '<div style="display:flex;align-items:center;gap:8px"><label style="font-size:11px;color:var(--text-muted)">Litri da caricare:</label>' +
      '<input type="number" id="cis-qty-' + c.id + '" value="' + qtaSuggerita + '" min="0" max="' + spazio + '" style="flex:1;padding:4px 8px;border:0.5px solid var(--border);border-radius:6px;font-size:12px;background:var(--bg)" oninput="aggiornaTotaleCarico2(' + ordine.litri + ')" />' +
      '<span style="font-size:11px;color:var(--text-muted);white-space:nowrap">max ' + fmtL(spazio) + '</span></div></div>';
  });

  html += '<div style="background:var(--bg-kpi);padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:12px;display:flex;gap:16px">' +
    '<span>Totale ordine: <strong>' + fmtL(ordine.litri) + '</strong></span>' +
    '<span>Assegnato: <strong id="tot-assegnato">—</strong></span>' +
    '<span id="msg-diff" style="color:#A32D2D"></span></div>';
  html += '<div style="display:flex;gap:8px"><button class="btn-primary" style="flex:1" onclick="confermaCaricoDeposito(\'' + ordineId + '\')">Conferma carico</button><button onclick="chiudiModalePermessi()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button></div>';

  apriModal(html);
  window._cisterneCarico = cisterne;
  aggiornaTotaleCarico2(ordine.litri);
}

function aggiornaTotaleCarico2(totaleOrdine) {
  const cisterne = window._cisterneCarico || [];
  let totAssegnato = 0;
  cisterne.forEach(c => { const inp = document.getElementById('cis-qty-'+c.id); if(inp) totAssegnato += parseFloat(inp.value)||0; });
  const elTot = document.getElementById('tot-assegnato');
  const elMsg = document.getElementById('msg-diff');
  if (elTot) elTot.textContent = fmtL(totAssegnato);
  if (elMsg) {
    const diff = totaleOrdine - totAssegnato;
    elMsg.textContent = diff > 0 ? 'Mancano ' + fmtL(diff) : diff < 0 ? 'Eccesso ' + fmtL(Math.abs(diff)) : 'OK';
    elMsg.style.color = diff === 0 ? '#3B6D11' : '#A32D2D';
  }
}

async function confermaCaricoDeposito(ordineId) {
  const cisterne = window._cisterneCarico || [];
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) return;
  let totAssegnato = 0;
  cisterne.forEach(c => { const inp = document.getElementById('cis-qty-'+c.id); if(inp) totAssegnato += parseFloat(inp.value)||0; });
  const diff = Math.abs(Number(ordine.litri) - totAssegnato);
  if (diff > 1) { toast('Il totale assegnato non corrisponde. Ordine: ' + fmtL(ordine.litri) + ', Assegnato: ' + fmtL(totAssegnato)); return; }
  for (const c of cisterne) {
    const inp = document.getElementById('cis-qty-'+c.id);
    const qta = parseFloat(inp?.value)||0;
    if (qta > 0) await aggiornaCisterna(c.id, qta, 'entrata', ordineId, ordine.data, Number(ordine.costo_litro||0) + Number(ordine.trasporto_litro||0));
  }
  await sb.from('ordini').update({ stato:'confermato', caricato_deposito:true }).eq('id', ordineId);
  _auditLog('carico_deposito', 'cisterne', ordine.prodotto + ' ' + fmtL(ordine.litri) + ' da ' + ordine.fornitore);
  toast('Carico confermato! Cisterne aggiornate.');
  chiudiModalePermessi();
  caricaDeposito();
  caricaOrdini();
}

async function confermaUscitaDeposito(ordineId, auto) {
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) return;
  const prodottoMap = getProdottoTipoCisterna();
  const tipo = prodottoMap[ordine.prodotto] || 'autotrazione';
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('tipo', tipo).eq('sede','deposito_vibo').order('livello_attuale',{ascending:false});
  if (!cisterne||!cisterne.length) { toast('Nessuna cisterna trovata per questo prodotto'); return; }

  // Filtra cisterne con giacenza sufficiente
  var cisConGiac = cisterne.filter(function(c) { return Number(c.livello_attuale) >= Number(ordine.litri); });

  // Nessuna cisterna ha abbastanza
  if (cisConGiac.length === 0) {
    toast('Nessuna cisterna ha giacenza sufficiente per ' + fmtL(ordine.litri) + ' L! Max: ' + fmtL(cisterne[0].livello_attuale));
    return;
  }

  // 1 sola cisterna O flusso automatico → scarico diretto dalla più piena
  if (cisConGiac.length === 1 || auto) {
    await _eseguiUscitaDeposito(ordineId, ordine, cisConGiac[0]);
    return;
  }

  // 2+ cisterne e click manuale → mostra selettore
  var defaultCis = cisConGiac[0]; // già ordinato per livello desc
  var html = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">Scegli cisterna per uscita — ' + ordine.prodotto + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">' + ordine.cliente + ' · <strong>' + fmtL(ordine.litri) + '</strong></div>';
  html += '<div style="margin:14px 0">';

  cisConGiac.forEach(function(c) {
    var pct = Math.round((Number(c.livello_attuale) / Number(c.capacita_max)) * 100);
    var cmp = Number(c.costo_medio || 0);
    var isDefault = c.id === defaultCis.id;
    var barColor = pct < 20 ? '#E24B4A' : pct < 40 ? '#BA7517' : '#639922';

    html += '<label style="display:block;padding:14px 16px;background:' + (isDefault ? '#EAF3DE' : 'var(--bg)') + ';border:' + (isDefault ? '2px solid #639922' : '0.5px solid var(--border)') + ';border-radius:10px;margin-bottom:8px;cursor:pointer">';
    html += '<div style="display:flex;align-items:center;gap:10px">';
    html += '<input type="radio" name="cis-uscita" value="' + c.id + '"' + (isDefault ? ' checked' : '') + ' style="width:18px;height:18px" />';
    html += '<div style="flex:1">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-weight:500">' + c.nome + '</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:600">' + fmtL(c.livello_attuale) + ' / ' + fmtL(c.capacita_max) + '</span></div>';
    html += '<div style="height:5px;background:var(--border);border-radius:3px;margin-bottom:4px"><div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:3px"></div></div>';
    html += '<div style="display:flex;gap:16px;font-size:10px;color:var(--text-muted)"><span>Riempimento: ' + pct + '%</span><span>CMP: <strong style="font-family:var(--font-mono)">€ ' + cmp.toFixed(4) + '</strong></span><span>Dopo uscita: ' + fmtL(Number(c.livello_attuale) - Number(ordine.litri)) + '</span></div>';
    html += '</div></div></label>';
  });

  html += '</div>';
  html += '<div style="display:flex;gap:8px"><button class="btn-primary" style="flex:1;background:#639922" onclick="confermaSceltaCisternaUscita(\'' + ordineId + '\')">Conferma uscita</button><button onclick="chiudiModalePermessi()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button></div>';

  apriModal(html);
}

async function confermaSceltaCisternaUscita(ordineId) {
  var sel = document.querySelector('input[name="cis-uscita"]:checked');
  if (!sel) { toast('Seleziona una cisterna'); return; }
  var cisId = sel.value;
  var { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  var { data: cis } = await sb.from('cisterne').select('*').eq('id', cisId).single();
  if (!ordine || !cis) { toast('Errore dati'); return; }
  if (Number(cis.livello_attuale) < Number(ordine.litri)) { toast('Giacenza insufficiente!'); return; }
  await _eseguiUscitaDeposito(ordineId, ordine, cis);
  chiudiModalePermessi();
}

async function _eseguiUscitaDeposito(ordineId, ordine, cis) {
  await aggiornaCisterna(cis.id, ordine.litri, 'uscita', ordineId, ordine.data);
  await sb.from('ordini').update({ stato:'confermato', cisterna_id:cis.id }).eq('id', ordineId);
  _auditLog('uscita_deposito', 'cisterne', ordine.prodotto + ' ' + fmtL(ordine.litri) + ' per ' + ordine.cliente + ' da ' + cis.nome + ' (CMP € ' + Number(cis.costo_medio||0).toFixed(4) + ')');
  toast('Uscita registrata da ' + cis.nome + '!');
  caricaDeposito();
  caricaOrdini();
}

// ── RETTIFICHE INVENTARIO ─────────────────────────────────────────
async function caricaRettifiche(tipo) {
  const tbodyId = tipo === 'deposito' ? 'rett-deposito-storico' : 'rett-stazione-storico';
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const { data } = await sb.from('rettifiche_inventario').select('*, cisterne(nome)').eq('tipo', tipo).order('data',{ascending:false}).order('created_at',{ascending:false}).limit(100);
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="8" class="loading">Nessuna rettifica</td></tr>'; return; }
  tbody.innerHTML = data.map(r => {
    const diff = Number(r.differenza);
    const diffColor = diff > 0 ? '#639922' : diff < 0 ? '#E24B4A' : 'var(--text)';
    const diffLabel = (diff > 0 ? '+' : '') + _sep(diff.toLocaleString('it-IT')).replace(/\./g, "'") + ' L';
    const statoBadge = r.confermata ? '<span class="badge green">Confermata</span>' : '<span class="badge amber">In attesa</span>';
    const cisNome = r.cisterne ? r.cisterne.nome : '—';
    let azioni = '';
    if (!r.confermata) {
      azioni = '<button class="btn-primary" style="font-size:10px;padding:3px 8px" onclick="confermaRettifica(\'' + r.id + '\',\'' + tipo + '\')">✓ Conferma</button> ';
      azioni += '<button class="btn-danger" style="font-size:10px;padding:3px 6px" onclick="eliminaRettifica(\'' + r.id + '\',\'' + tipo + '\')">x</button>';
    } else {
      azioni = '<span style="font-size:10px;color:var(--text-hint)">' + (r.confermata_da || '') + '</span>';
    }
    return '<tr><td>' + r.data + '</td><td>' + esc(cisNome) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.giacenza_sistema||0) + '</td><td style="font-family:var(--font-mono);font-weight:600">' + fmtL(r.giacenza_rilevata) + '</td><td style="font-family:var(--font-mono);color:' + diffColor + ';font-weight:600">' + diffLabel + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td>' + statoBadge + '</td><td>' + azioni + '</td></tr>';
  }).join('');
}

async function nuovaRettifica(tipo) {
  const sede = tipo === 'deposito' ? 'deposito_vibo' : 'stazione_oppido';
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede', sede).order('tipo').order('nome');
  if (!cisterne || !cisterne.length) { toast('Nessuna cisterna trovata'); return; }

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Nuova rettifica — ' + (tipo === 'deposito' ? 'Deposito Vibo' : 'Stazione Oppido') + '</div>';
  html += '<div class="form-grid">';
  html += '<div class="form-group"><label>Data rilevazione</label><input type="date" id="rett-data" value="' + oggiISO + '" /></div>';
  html += '<div class="form-group"><label>Cisterna</label><select id="rett-cisterna" onchange="aggiornaGiacenzaSistema()">';
  cisterne.forEach(c => {
    const prodInfo = cacheProdotti.find(p => p.nome === c.prodotto);
    const colore = prodInfo ? prodInfo.colore : '#888';
    html += '<option value="' + c.id + '" data-livello="' + c.livello_attuale + '">' + esc(c.nome) + ' (' + esc(c.prodotto) + ' — attuale: ' + fmtL(c.livello_attuale) + ')</option>';
  });
  html += '</select></div>';
  html += '<div class="form-group"><label>Giacenza a sistema</label><input type="text" id="rett-sistema" readonly style="background:var(--bg);color:var(--text-muted);font-family:var(--font-mono)" /></div>';
  html += '<div class="form-group"><label>Giacenza rilevata</label><input type="number" id="rett-rilevata" step="0.01" placeholder="Inserisci quantità reale" oninput="calcolaDiffRettifica()" /></div>';
  html += '<div class="form-group"><label>Differenza</label><input type="text" id="rett-diff" readonly style="background:var(--bg);font-family:var(--font-mono);font-weight:600" /></div>';
  html += '<div class="form-group"><label>Note / motivazione</label><input type="text" id="rett-note" placeholder="Es. inventario fisico, errore carico..." /></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn-primary" onclick="salvaRettifica(\'' + tipo + '\')">💾 Salva rettifica</button><button class="btn-secondary" onclick="chiudiModal()">Annulla</button></div>';
  apriModal(html);
  aggiornaGiacenzaSistema();
}

function aggiornaGiacenzaSistema() {
  const sel = document.getElementById('rett-cisterna');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const livello = opt ? opt.dataset.livello : '0';
  document.getElementById('rett-sistema').value = fmtL(livello);
  calcolaDiffRettifica();
}

function calcolaDiffRettifica() {
  const sel = document.getElementById('rett-cisterna');
  const opt = sel ? sel.options[sel.selectedIndex] : null;
  const sistema = opt ? Number(opt.dataset.livello) : 0;
  const rilevata = parseFloat(document.getElementById('rett-rilevata').value);
  const diffEl = document.getElementById('rett-diff');
  if (!isNaN(rilevata)) {
    const diff = rilevata - sistema;
    diffEl.value = (diff > 0 ? '+' : '') + _sep(diff.toLocaleString('it-IT')).replace(/\./g, "'") + ' L';
    diffEl.style.color = diff > 0 ? '#639922' : diff < 0 ? '#E24B4A' : 'var(--text)';
  } else {
    diffEl.value = '—';
    diffEl.style.color = 'var(--text)';
  }
}

async function salvaRettifica(tipo) {
  const data = document.getElementById('rett-data').value;
  if (!data) { toast('Seleziona una data'); return; }
  const cisternaId = document.getElementById('rett-cisterna').value;
  const sel = document.getElementById('rett-cisterna');
  const opt = sel.options[sel.selectedIndex];
  const sistema = Number(opt.dataset.livello);
  const rilevata = parseFloat(document.getElementById('rett-rilevata').value);
  if (isNaN(rilevata) || rilevata < 0) { toast('Inserisci una giacenza valida'); return; }
  const note = document.getElementById('rett-note').value.trim();

  const record = {
    tipo,
    data,
    cisterna_id: cisternaId,
    prodotto: opt.textContent.split('(')[1]?.split(' —')[0]?.trim() || '',
    giacenza_sistema: sistema,
    giacenza_rilevata: rilevata,
    differenza: rilevata - sistema,
    note: note || null
  };
  const { error } = await sb.from('rettifiche_inventario').insert([record]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Rettifica salvata — in attesa di conferma');
  chiudiModal();
  caricaRettifiche(tipo);
}

async function confermaRettifica(id, tipo) {
  if (!confirm('Confermare questa rettifica?\n\nLa giacenza della cisterna verrà aggiornata al valore rilevato. Questa operazione non è reversibile.')) return;

  const { data: rett } = await sb.from('rettifiche_inventario').select('*').eq('id', id).single();
  if (!rett) { toast('Rettifica non trovata'); return; }

  // Aggiorna cisterna con la giacenza rilevata
  const { error: errCis } = await sb.from('cisterne').update({
    livello_attuale: rett.giacenza_rilevata,
    updated_at: new Date().toISOString()
  }).eq('id', rett.cisterna_id);
  if (errCis) { toast('Errore aggiornamento cisterna: ' + errCis.message); return; }

  // Segna come confermata
  const { error: errRett } = await sb.from('rettifiche_inventario').update({
    confermata: true,
    confermata_da: utenteCorrente.nome || utenteCorrente.email,
    confermata_il: new Date().toISOString()
  }).eq('id', id);
  if (errRett) { toast('Errore conferma: ' + errRett.message); return; }

  toast('Rettifica confermata — giacenza aggiornata!');
  caricaRettifiche(tipo);
  if (tipo === 'deposito') caricaDeposito();
  else caricaGiacenzeStazione();
}

async function eliminaRettifica(id, tipo) {
  if (!confirm('Eliminare questa rettifica non confermata?')) return;
  const { error } = await sb.from('rettifiche_inventario').delete().eq('id', id).eq('confermata', false);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Rettifica eliminata');
  caricaRettifiche(tipo);
}

async function stampaRettifiche(tipo) {
  var w = _apriReport("Rettifiche inventario"); if (!w) return;
  const sedeLabel = tipo === 'deposito' ? 'Deposito Vibo' : 'Stazione Oppido';
  const { data } = await sb.from('rettifiche_inventario').select('*, cisterne(nome)').eq('tipo', tipo).order('data',{ascending:false}).order('created_at',{ascending:false});
  if (!data || !data.length) { toast('Nessuna rettifica da stampare'); return; }

  let righeHtml = '';
  data.forEach(function(r, i) {
    var diff = Number(r.differenza || 0);
    var diffColor = diff > 0 ? '#639922' : diff < 0 ? '#E24B4A' : '#333';
    var diffLabel = (diff > 0 ? '+' : '') + _sep(diff.toLocaleString('it-IT')).replace(/\./g, "'") + ' L';
    var stato = r.confermata ? 'CONFERMATA' : 'IN ATTESA';
    var statoColor = r.confermata ? '#639922' : '#BA7517';
    var confInfo = r.confermata ? (r.confermata_da || '') + (r.confermata_il ? ' — ' + new Date(r.confermata_il).toLocaleDateString('it-IT') : '') : '';
    righeHtml += '<tr>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:center">' + (i+1) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + r.data + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + esc(r.cisterne ? r.cisterne.nome : '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + esc(r.prodotto || '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(r.giacenza_sistema||0) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">' + fmtL(r.giacenza_rilevata) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:' + diffColor + ';font-weight:bold">' + diffLabel + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;font-size:10px">' + esc(r.note||'—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;color:' + statoColor + ';font-weight:bold;font-size:10px">' + stato + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;font-size:9px;color:#666">' + confInfo + '</td>' +
      '</tr>';
  });

  var totConfirmate = data.filter(function(r) { return r.confermata; }).length;
  var totAttesa = data.filter(function(r) { return !r.confermata; }).length;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rettifiche ' + sedeLabel + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}.rpt-header>div:last-child{text-align:left!important}table{font-size:9px}th,td{padding:4px 3px!important}.rpt-actions{bottom:8px!important;right:8px!important}button{padding:8px 12px!important;font-size:12px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#6B5FCC;color:#fff;padding:7px 5px;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #5A4FBB;text-align:center}' +
    '</style></head><body>';

  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6B5FCC;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#6B5FCC">REGISTRO RETTIFICHE INVENTARIO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Sede: <strong>' + sedeLabel + '</strong> — Totale: <strong>' + data.length + '</strong> rettifiche</div>';
  html += '<div style="font-size:11px;color:#666">Confermate: <strong style="color:#639922">' + totConfirmate + '</strong> — In attesa: <strong style="color:#BA7517">' + totAttesa + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  html += '<table><thead><tr><th>#</th><th>Data</th><th>Cisterna</th><th>Prodotto</th><th>Giac. sistema</th><th>Giac. rilevata</th><th>Differenza</th><th>Note</th><th>Stato</th><th>Confermata da</th></tr></thead><tbody>';
  html += righeHtml;
  html += '</tbody></table>';

  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ── AUTOCONSUMO ──────────────────────────────────────────────────
async function caricaAutoconsumo() {
  // Cisterna autoconsumo
  const { data: cis } = await sb.from('cisterne').select('*').eq('sede','autoconsumo').single();
  if (cis) {
    const pct = Number(cis.capacita_max) > 0 ? Math.round((Number(cis.livello_attuale) / Number(cis.capacita_max)) * 100) : 0;
    document.getElementById('ac-giacenza').textContent = fmtL(cis.livello_attuale);
    const el = document.getElementById('ac-cisterna-grafica');
    if (el) {
      el.innerHTML = '<div class="card"><div class="dep-product-header"><div class="dep-product-dot" style="background:#BA7517"></div><div><div class="dep-product-title">' + esc(cis.nome) + '</div><div class="dep-product-sub">Gasolio Autotrazione · cap. ' + fmtL(cis.capacita_max) + '</div></div><div class="dep-product-total">' + fmtL(cis.livello_attuale) + '</div></div><div class="dep-cisterne-grid"><div class="dep-cisterna">' + cisternasvg(pct, '#BA7517') + '<div class="dep-cisterna-litri">' + _sep(Number(cis.livello_attuale).toLocaleString('it-IT')) + ' L</div><div class="dep-cisterna-pct">' + pct + '% · cap. ' + _sep(Number(cis.capacita_max).toLocaleString('it-IT')) + ' L</div></div></div></div>';
    }
    window._cisternaAutoconsumo = cis;
  }

  // Prelievi mese
  const inizioMese = oggiISO.substring(0,8) + '01';
  const { data: prelMese } = await sb.from('prelievi_autoconsumo').select('litri').gte('data', inizioMese).lte('data', oggiISO);
  const totMese = (prelMese||[]).reduce((s,p) => s + Number(p.litri), 0);
  document.getElementById('ac-prelievi-mese').textContent = fmtL(totMese);

  // Ordini autoconsumo confermati da ricevere
  await caricaOrdiniAutoconsumo();

  // Popola mezzi propri
  const { data: mezzi } = await sb.from('mezzi').select('id,targa').eq('attivo',true).order('targa');
  const selM = document.getElementById('ac-mezzo');
  if (selM && mezzi) selM.innerHTML = '<option value="">Seleziona camion...</option>' + mezzi.map(m => '<option value="' + m.id + '" data-targa="' + esc(m.targa) + '">' + m.targa + '</option>').join('');

  // Data default
  const dataEl = document.getElementById('ac-data');
  if (dataEl && !dataEl.value) dataEl.value = oggiISO;

  // Filtri anno
  const selAnno = document.getElementById('ac-filtro-anno');
  if (selAnno && selAnno.options.length <= 1) {
    const annoCorrente = new Date().getFullYear();
    selAnno.innerHTML = '';
    for (let a = annoCorrente; a >= annoCorrente - 3; a--) selAnno.innerHTML += '<option value="' + a + '">' + a + '</option>';
  }
  const da = document.getElementById('ac-filtro-da');
  const aa = document.getElementById('ac-filtro-a');
  if (da && !da.value) da.value = inizioMese;
  if (aa && !aa.value) aa.value = oggiISO;

  caricaPrelievi();
  _popolaSelAnnoGiac('giac-ac-anno');

  // Popola selettori storico ordini autoconsumo
  var selOrdAnno = document.getElementById('ac-ord-anno');
  if (selOrdAnno && selOrdAnno.options.length === 0) {
    var annoC = new Date().getFullYear();
    for (var yy = annoC; yy >= annoC - 5; yy--) selOrdAnno.innerHTML += '<option value="' + yy + '"' + (yy===annoC?' selected':'') + '>' + yy + '</option>';
  }
  var selOrdMese = document.getElementById('ac-ord-mese');
  if (selOrdMese) selOrdMese.value = String(new Date().getMonth()+1).padStart(2,'0');
  caricaStoricoOrdiniAutoconsumo();
}

async function caricaOrdiniAutoconsumo() {
  const { data: ordini } = await sb.from('ordini').select('*').eq('tipo_ordine','autoconsumo').eq('stato','confermato').or('caricato_deposito.eq.false,caricato_deposito.is.null').order('data',{ascending:false});
  const el = document.getElementById('ac-da-ricevere');
  if (!el) return;
  if (!ordini || !ordini.length) { el.innerHTML = ''; return; }

  let html = '<div class="card" style="border-left:4px solid #BA7517">';
  html += '<div class="card-title" style="color:#BA7517">📦 Ordini autoconsumo da ricevere (' + ordini.length + ')</div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Prodotto</th><th>Litri</th><th>Fornitore</th><th></th></tr></thead><tbody>';
  ordini.forEach(function(r) {
    html += '<tr><td>' + new Date(r.data).toLocaleDateString('it-IT') + '</td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td>' + esc(r.fornitore) + '</td><td><button class="btn-primary" style="font-size:11px;padding:4px 12px;background:#BA7517" onclick="riceviAutoconsumo(\'' + r.id + '\',' + r.litri + ')">📦 Ricevi</button></td></tr>';
  });
  html += '</tbody></table></div></div>';
  el.innerHTML = html;
}

async function riceviAutoconsumo(ordineId, litri) {
  const cis = window._cisternaAutoconsumo;
  if (!cis) { toast('Cisterna autoconsumo non trovata'); return; }
  if (!confirm('Confermi la ricezione di ' + fmtL(litri) + ' L nella cisterna autoconsumo?')) return;

  const nuovoLivello = Number(cis.livello_attuale) + Number(litri);
  const { error: errCis } = await sb.from('cisterne').update({ livello_attuale: nuovoLivello, updated_at: new Date().toISOString() }).eq('id', cis.id);
  if (errCis) { toast('Errore cisterna: ' + errCis.message); return; }

  await sb.from('ordini').update({ caricato_deposito: true }).eq('id', ordineId);
  toast('✅ ' + fmtL(litri) + ' L ricevuti nella cisterna autoconsumo!');
  caricaAutoconsumo();
}

async function caricaStoricoOrdiniAutoconsumo() {
  var anno = document.getElementById('ac-ord-anno').value;
  var mese = document.getElementById('ac-ord-mese').value;
  if (!anno) return;

  var da = anno + '-' + (mese || '01') + '-01';
  var ultimoGg = mese ? new Date(Number(anno), Number(mese), 0).getDate() : 31;
  var a = anno + '-' + (mese || '12') + '-' + String(ultimoGg).padStart(2,'0');

  var { data: ordini } = await sb.from('ordini').select('*').eq('tipo_ordine','autoconsumo').neq('stato','annullato').gte('data', da).lte('data', a).order('data',{ascending:false});

  var tbody = document.getElementById('ac-storico-ordini');
  var totDiv = document.getElementById('ac-storico-totali');

  if (!ordini || !ordini.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Nessun ordine nel periodo</td></tr>';
    totDiv.innerHTML = '';
    return;
  }

  var totLitri = 0, totValore = 0;
  tbody.innerHTML = ordini.map(function(r, idx) {
    var costo = Number(r.costo_litro||0) + Number(r.trasporto_litro||0);
    var totale = costo * Number(r.litri);
    totLitri += Number(r.litri);
    totValore += totale;
    var ricevuto = r.caricato_deposito;
    var badge = ricevuto ? '<span class="badge green">Ricevuto</span>' : '<span class="badge amber">Da ricevere</span>';
    return '<tr' + (idx%2 ? ' style="background:var(--bg)"' : '') + '>' +
      '<td>' + r.data + '</td>' +
      '<td>' + esc(r.prodotto) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td>' +
      '<td>' + esc(r.fornitore) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmt(costo) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:500">' + fmtE(totale) + '</td>' +
      '<td>' + badge + '</td></tr>';
  }).join('');

  var meseNome = mese ? ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1] : 'Anno ' + anno;
  totDiv.innerHTML = '<strong>' + ordini.length + ' ordini</strong> · ' + meseNome + ' ' + anno + ' · Totale: <strong>' + fmtL(totLitri) + ' L</strong> · Valore: <strong>' + fmtE(totValore) + '</strong>';
}

async function salvaPrelievoAutoconsumo() {
  const data = document.getElementById('ac-data').value;
  const mezzoId = document.getElementById('ac-mezzo').value;
  const mezzoTarga = document.getElementById('ac-mezzo').options[document.getElementById('ac-mezzo').selectedIndex]?.dataset?.targa || '';
  const litri = parseFloat(document.getElementById('ac-litri').value);
  const note = document.getElementById('ac-note').value;
  if (!data || !mezzoId || !litri || litri <= 0) { toast('Compila data, camion e litri'); return; }

  const cis = window._cisternaAutoconsumo;
  if (!cis) { toast('Cisterna autoconsumo non trovata'); return; }
  if (Number(cis.livello_attuale) < litri) { toast('Giacenza insufficiente! Disponibili: ' + fmtL(cis.livello_attuale)); return; }

  // Registra prelievo
  const r1 = await _sbWrite('prelievi_autoconsumo', 'insert', [{ data, mezzo_id: mezzoId, mezzo_targa: mezzoTarga, litri, note }]);
  if (r1.error) { toast('Errore: ' + r1.error.message); return; }

  // Scala dalla cisterna
  const nuovoLivello = Number(cis.livello_attuale) - litri;
  await _sbWrite('cisterne', 'update', { livello_attuale: nuovoLivello, updated_at: new Date().toISOString() }, { id: cis.id });

  toast(r1._offline ? '⚡ Prelievo ' + fmtL(litri) + ' L salvato offline' : '⛽ Prelievo di ' + fmtL(litri) + ' L registrato per ' + mezzoTarga);
  document.getElementById('ac-litri').value = '';
  document.getElementById('ac-note').value = '';
  caricaAutoconsumo();
}

function resetFiltroCamion() {
  const sel = document.getElementById('ac-filtro-camion');
  if (sel) { sel.innerHTML = '<option value="">Tutti i camion</option>'; }
}

async function caricaPrelievi() {
  const da = document.getElementById('ac-filtro-da').value;
  const a = document.getElementById('ac-filtro-a').value;
  const filtroCamion = document.getElementById('ac-filtro-camion').value;
  if (!da || !a) return;
  let q = sb.from('prelievi_autoconsumo').select('*').gte('data', da).lte('data', a);
  if (filtroCamion) q = q.eq('mezzo_targa', filtroCamion);
  const { data } = await q.order('data',{ascending:false}).order('created_at',{ascending:false});
  const tbody = document.getElementById('ac-tabella-prelievi');

  // Popola dropdown camion (solo se vuoto o cambio periodo)
  const sel = document.getElementById('ac-filtro-camion');
  if (sel.options.length <= 1) {
    const { data: tutti } = await sb.from('prelievi_autoconsumo').select('mezzo_targa').gte('data', da).lte('data', a);
    const targhe = [...new Set((tutti||[]).map(r => r.mezzo_targa).filter(Boolean))].sort();
    const valPrec = sel.value;
    sel.innerHTML = '<option value="">Tutti i camion</option>' + targhe.map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('');
    sel.value = valPrec;
  }

  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Nessun prelievo' + (filtroCamion ? ' per ' + filtroCamion : '') + '</td></tr>';
    document.getElementById('ac-totale-prelievi').innerHTML = '';
    return;
  }
  let totLitri = 0;
  tbody.innerHTML = data.map(function(r) {
    totLitri += Number(r.litri);
    return '<tr><td>' + new Date(r.data).toLocaleDateString('it-IT') + '</td><td>' + esc(r.mezzo_targa||'—') + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td><button class="btn-danger" onclick="eliminaPrelievo(\'' + r.id + '\')">x</button></td></tr>';
  }).join('');
  document.getElementById('ac-totale-prelievi').innerHTML = 'Totale periodo' + (filtroCamion ? ' (' + filtroCamion + ')' : '') + ': <strong style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</strong> — ' + data.length + ' prelievi';
}

async function eliminaPrelievo(id) {
  if (!confirm('Eliminare questo prelievo? I litri verranno restituiti alla cisterna.')) return;
  const { data: prel } = await sb.from('prelievi_autoconsumo').select('*').eq('id', id).single();
  if (!prel) return;
  const { error } = await sb.from('prelievi_autoconsumo').delete().eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  // Restituisci litri alla cisterna
  const cis = window._cisternaAutoconsumo;
  if (cis) {
    const nuovoLivello = Number(cis.livello_attuale) + Number(prel.litri);
    await sb.from('cisterne').update({ livello_attuale: nuovoLivello, updated_at: new Date().toISOString() }).eq('id', cis.id);
  }
  toast('Prelievo eliminato');
  caricaAutoconsumo();
}

async function stampaPrelievi() {
  var w = _apriReport("Prelievi autoconsumo"); if (!w) return;
  const da = document.getElementById('ac-filtro-da').value;
  const a = document.getElementById('ac-filtro-a').value;
  const filtroCamion = document.getElementById('ac-filtro-camion').value;
  if (!da || !a) { toast('Seleziona il periodo'); return; }
  let q = sb.from('prelievi_autoconsumo').select('*').gte('data', da).lte('data', a);
  if (filtroCamion) q = q.eq('mezzo_targa', filtroCamion);
  const { data } = await q.order('data',{ascending:false});
  if (!data || !data.length) { toast('Nessun prelievo nel periodo'); return; }

  const daFmt = new Date(da).toLocaleDateString('it-IT');
  const aFmt = new Date(a).toLocaleDateString('it-IT');
  let totLitri = 0;
  let righeHtml = '';
  // Raggruppa per camion
  const perCamion = {};
  data.forEach(function(r, i) {
    totLitri += Number(r.litri);
    const targa = r.mezzo_targa || '—';
    if (!perCamion[targa]) perCamion[targa] = 0;
    perCamion[targa] += Number(r.litri);
    righeHtml += '<tr>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:center">' + (i+1) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + new Date(r.data).toLocaleDateString('it-IT') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;font-weight:500">' + esc(targa) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">' + fmtL(r.litri) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;font-size:10px">' + esc(r.note||'—') + '</td>' +
      '</tr>';
  });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Registro Prelievi Autoconsumo</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}' +
    '@media print{.no-print{display:none!important}@page{margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}.rpt-header>div:last-child{text-align:left!important}table{font-size:9px}th,td{padding:4px 3px!important}.rpt-actions{bottom:8px!important;right:8px!important}button{padding:8px 12px!important;font-size:12px!important}}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:14px}' +
    'th{background:#BA7517;color:#fff;padding:7px 5px;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #9A6213;text-align:center}' +
    '.tot td{border-top:3px solid #BA7517!important;font-weight:bold;font-size:11px;background:#FDF3D0!important}' +
    '</style></head><body>';

  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #BA7517;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#BA7517">REGISTRO PRELIEVI AUTOCONSUMO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Periodo: <strong>' + daFmt + ' — ' + aFmt + '</strong>' + (filtroCamion ? ' · Camion: <strong>' + esc(filtroCamion) + '</strong>' : '') + ' · Prelievi: <strong>' + data.length + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  // Riepilogo per camion
  html += '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">';
  html += '<div style="background:#FDF3D0;border:1px solid #BA7517;border-radius:6px;padding:10px 18px;text-align:center"><div style="font-size:8px;color:#7A5D00;text-transform:uppercase">Totale litri</div><div style="font-size:18px;font-weight:bold;font-family:Courier New,monospace">' + fmtL(totLitri) + '</div></div>';
  Object.keys(perCamion).sort().forEach(function(targa) {
    html += '<div style="background:#F5F5F5;border:1px solid #ddd;border-radius:6px;padding:10px 14px;text-align:center"><div style="font-size:8px;color:#666;text-transform:uppercase">' + esc(targa) + '</div><div style="font-size:14px;font-weight:bold;font-family:Courier New,monospace">' + fmtL(perCamion[targa]) + '</div></div>';
  });
  html += '</div>';

  html += '<table><thead><tr><th>#</th><th>Data</th><th>Camion</th><th>Litri</th><th>Note</th></tr></thead><tbody>';
  html += righeHtml;
  html += '<tr class="tot"><td style="padding:7px;border:1px solid #ddd" colspan="3">TOTALE</td><td style="padding:7px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(totLitri) + '</td><td style="padding:7px;border:1px solid #ddd"></td></tr>';
  html += '</tbody></table>';

  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#BA7517;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ═══════════════════════════════════════════════════════════════════
// GIACENZE GIORNALIERE DEPOSITO v2 — Lettura asta + Cali/Eccedenze + Alert
// ═══════════════════════════════════════════════════════════════════

var _ggProdotti = [];
var _ggDatiGiorno = {};
var GG_SOGLIA_ALERT = 500; // litri — soglia differenza per alert admin

async function caricaGiacenzeGiornaliere() {
  var dataEl = document.getElementById('gg-data');
  if (!dataEl.value) dataEl.value = oggiISO;
  var data = dataEl.value;

  // Soglia alert
  var sogliaEl = document.getElementById('gg-soglia');
  if (sogliaEl && sogliaEl.value) GG_SOGLIA_ALERT = parseInt(sogliaEl.value) || 500;

  // Identifica prodotti deposito dalle cisterne
  var { data: cisterne } = await sb.from('cisterne').select('prodotto,capacita,livello_attuale').eq('sede','deposito_vibo');
  var prodMap = {};
  (cisterne||[]).forEach(function(c) {
    if (!prodMap[c.prodotto]) prodMap[c.prodotto] = { capacita:0, attuale:0 };
    prodMap[c.prodotto].capacita += Number(c.capacita||0);
    prodMap[c.prodotto].attuale += Number(c.livello_attuale||0);
  });
  _ggProdotti = Object.keys(prodMap).sort();
  // Se mancano prodotti noti, aggiungili
  ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO'].forEach(function(p) {
    if (_ggProdotti.indexOf(p) < 0) _ggProdotti.push(p);
  });

  // Popola selettori mese e prodotto se vuoti
  var selMese = document.getElementById('gg-mese');
  if (selMese && selMese.options.length === 0) {
    var mesiNomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    var meseCorr = new Date().getMonth();
    for (var i = 0; i < 12; i++) selMese.innerHTML += '<option value="' + (i+1) + '"' + (i===meseCorr?' selected':'') + '>' + mesiNomi[i] + '</option>';
  }
  var selProd = document.getElementById('gg-prodotto-filtro');
  if (selProd && selProd.options.length === 0) {
    selProd.innerHTML = '<option value="">Tutti</option>';
    _ggProdotti.forEach(function(p) { selProd.innerHTML += '<option value="' + p + '">' + p + '</option>'; });
  }

  // Giacenza giorno precedente dal DB
  var giornoPrima = new Date(new Date(data).getTime() - 86400000).toISOString().split('T')[0];
  var { data: precSalv } = await sb.from('giacenze_giornaliere').select('prodotto,giacenza_rilevata,giacenza_teorica')
    .eq('data', giornoPrima).eq('sede','deposito_vibo');
  var precMap = {};
  (precSalv||[]).forEach(function(g) { precMap[g.prodotto] = g.giacenza_rilevata !== null ? Number(g.giacenza_rilevata) : Number(g.giacenza_teorica); });

  // Giacenza già salvata per oggi
  var { data: oggiSalv } = await sb.from('giacenze_giornaliere').select('*').eq('data', data).eq('sede','deposito_vibo');
  var oggiMap = {};
  (oggiSalv||[]).forEach(function(g) { oggiMap[g.prodotto] = g; });

  // Entrate: ordini entrata_deposito del giorno
  var { data: entrate } = await sb.from('ordini').select('prodotto,litri')
    .eq('tipo_ordine','entrata_deposito').neq('stato','annullato').eq('data', data);
  var entrateMap = {};
  (entrate||[]).forEach(function(o) { entrateMap[o.prodotto] = (entrateMap[o.prodotto]||0) + Number(o.litri); });

  // Uscite: ordini da deposito verso clienti + stazione + autoconsumo
  var { data: uscCl } = await sb.from('ordini').select('prodotto,litri')
    .eq('tipo_ordine','cliente').neq('stato','annullato').ilike('fornitore','%phoenix%').eq('data', data);
  var { data: uscSt } = await sb.from('ordini').select('prodotto,litri')
    .eq('tipo_ordine','stazione_servizio').neq('stato','annullato').eq('data', data);
  var { data: uscAu } = await sb.from('ordini').select('prodotto,litri')
    .eq('tipo_ordine','autoconsumo').neq('stato','annullato').eq('data', data);
  var usciteMap = {};
  [uscCl, uscSt, uscAu].forEach(function(arr) {
    (arr||[]).forEach(function(o) { usciteMap[o.prodotto] = (usciteMap[o.prodotto]||0) + Number(o.litri); });
  });

  // Colori prodotti
  var coloriProd = { 'Gasolio Autotrazione':'#D4A017', 'Benzina':'#639922', 'Gasolio Agricolo':'#6B5FCC', 'HVO':'#1D9E75' };

  // Render form per ogni prodotto
  _ggDatiGiorno = {};
  var h = '<div style="display:grid;gap:10px;margin-top:12px">';
  _ggProdotti.forEach(function(prod) {
    var pi = cacheProdotti ? cacheProdotti.find(function(p){return p.nome===prod;}) : null;
    var col = pi ? pi.colore : (coloriProd[prod] || '#888');
    var inizio = precMap[prod] || prodMap[prod]?.attuale || 0;
    var ent = entrateMap[prod] || 0;
    var usc = usciteMap[prod] || 0;
    var salvata = oggiMap[prod];
    var caliEcc = salvata ? Number(salvata.cali_eccedenze || 0) : 0;
    var teorica = Math.round(inizio + ent - usc + caliEcc);
    var rilevata = salvata && salvata.giacenza_rilevata !== null ? Number(salvata.giacenza_rilevata) : '';
    var diff = rilevata !== '' ? Math.round(rilevata - teorica) : null;
    var nota = salvata ? (salvata.note||'') : '';

    _ggDatiGiorno[prod] = { inizio:inizio, entrate:ent, uscite:usc, caliEcc:caliEcc, teorica:teorica };

    h += '<div style="background:var(--bg);border:0.5px solid var(--border);padding:14px 18px;border-left:4px solid ' + col + ';border-radius:0">';
    h += '<div style="font-size:13px;font-weight:500;margin-bottom:10px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + col + ';margin-right:6px"></span>' + esc(prod) + '</div>';

    // Riga 1: 5 colonne (inizio, entrate, uscite, cali/ecc input, teorica)
    h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:10px">';
    h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Giac. inizio</div><div style="font-family:var(--font-mono);font-size:15px;font-weight:500">' + fmtL(inizio) + '</div></div>';
    h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">+ Entrate</div><div style="font-family:var(--font-mono);font-size:15px;color:#639922;font-weight:500">' + fmtL(ent) + '</div></div>';
    h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">- Uscite</div><div style="font-family:var(--font-mono);font-size:15px;color:#A32D2D;font-weight:500">' + fmtL(usc) + '</div></div>';
    h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">+/- Cali / eccedenze</div>';
    h += '<input type="number" class="gg-cali" data-prodotto="' + esc(prod) + '" value="' + caliEcc + '" step="1" oninput="_ggRicalcola(\'' + esc(prod) + '\')" style="width:100%;font-family:var(--font-mono);font-size:14px;font-weight:500;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:' + (caliEcc >= 0 ? (caliEcc > 0 ? '#639922' : 'var(--text)') : '#A32D2D') + '" /></div>';
    h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">= Teorica</div><div class="gg-teorica-display" data-prodotto="' + esc(prod) + '" style="font-family:var(--font-mono);font-size:15px;font-weight:600">' + fmtL(teorica) + '</div></div>';
    h += '</div>';

    // Riga 2: rilevata, differenza, note
    h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
    h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Giacenza rilevata (asta)</div>';
    h += '<input type="number" class="gg-rilevata" data-prodotto="' + esc(prod) + '" value="' + rilevata + '" placeholder="' + teorica + '" step="1" oninput="_ggCalcDiff(\'' + esc(prod) + '\')" style="width:100%;font-family:var(--font-mono);font-size:16px;font-weight:600;padding:8px 12px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg-card);color:var(--text)" /></div>';
    h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Differenza</div>';
    h += '<div class="gg-diff-display" data-prodotto="' + esc(prod) + '" style="font-family:var(--font-mono);font-size:16px;font-weight:600;padding:8px 0;color:' + (diff !== null ? (diff >= 0 ? '#639922' : '#A32D2D') : 'var(--text-muted)') + '">' + (diff !== null ? (diff >= 0 ? '+' : '') + fmtL(diff) : '—') + '</div></div>';
    h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Note</div>';
    h += '<input type="text" class="gg-nota" data-prodotto="' + esc(prod) + '" value="' + esc(nota) + '" placeholder="Es. inventario fisico" style="width:100%;font-size:13px;padding:8px 12px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg-card);color:var(--text)" /></div>';
    h += '</div></div>';
  });
  h += '</div>';

  // Alert box (nascosto, si mostra al salvataggio)
  h += '<div id="gg-alert-box" style="display:none;margin-top:12px"></div>';

  document.getElementById('gg-form-prodotti').innerHTML = h;

  // KPI
  _ggAggiornaKPI(oggiMap);

  // Registro
  caricaRegistroGiornaliero();
}

function _ggRicalcola(prod) {
  var dati = _ggDatiGiorno[prod]; if (!dati) return;
  var caliEl = document.querySelector('.gg-cali[data-prodotto="' + prod + '"]');
  var cali = caliEl ? parseFloat(caliEl.value) || 0 : 0;
  // Aggiorna colore cali
  if (caliEl) caliEl.style.color = cali > 0 ? '#639922' : cali < 0 ? '#A32D2D' : 'var(--text)';
  var nuovaTeor = Math.round(dati.inizio + dati.entrate - dati.uscite + cali);
  dati.caliEcc = cali;
  dati.teorica = nuovaTeor;
  var teorEl = document.querySelector('.gg-teorica-display[data-prodotto="' + prod + '"]');
  if (teorEl) teorEl.textContent = fmtL(nuovaTeor);
  // Aggiorna placeholder rilevata
  var rilEl = document.querySelector('.gg-rilevata[data-prodotto="' + prod + '"]');
  if (rilEl) rilEl.placeholder = nuovaTeor;
  // Ricalcola differenza
  _ggCalcDiff(prod);
}

function _ggCalcDiff(prod) {
  var dati = _ggDatiGiorno[prod]; if (!dati) return;
  var rilEl = document.querySelector('.gg-rilevata[data-prodotto="' + prod + '"]');
  var diffEl = document.querySelector('.gg-diff-display[data-prodotto="' + prod + '"]');
  if (!rilEl || !diffEl) return;
  var val = parseFloat(rilEl.value);
  if (isNaN(val)) { diffEl.textContent = '—'; diffEl.style.color = 'var(--text-muted)'; return; }
  var diff = Math.round(val - dati.teorica);
  diffEl.textContent = (diff >= 0 ? '+' : '') + fmtL(diff);
  diffEl.style.color = diff >= 0 ? '#639922' : '#A32D2D';
}

function _ggAggiornaKPI(oggiMap) {
  var totTeor = 0, totRilev = 0, hasRilev = false;
  _ggProdotti.forEach(function(p) {
    totTeor += (_ggDatiGiorno[p] ? _ggDatiGiorno[p].teorica : 0);
    var s = oggiMap ? oggiMap[p] : null;
    if (s && s.giacenza_rilevata !== null) { totRilev += Number(s.giacenza_rilevata); hasRilev = true; }
  });
  var diffTot = hasRilev ? totRilev - totTeor : null;
  var kpiEl = document.getElementById('gg-kpi');
  if (!kpiEl) return;
  kpiEl.innerHTML =
    '<div class="kpi"><div class="kpi-label">Prodotti monitorati</div><div class="kpi-value">' + _ggProdotti.length + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Giacenza teorica totale</div><div class="kpi-value" style="font-family:var(--font-mono)">' + fmtL(totTeor) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Giacenza rilevata totale</div><div class="kpi-value" style="font-family:var(--font-mono);color:' + (hasRilev ? '#6B5FCC' : 'var(--text-muted)') + '">' + (hasRilev ? fmtL(totRilev) : '—') + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Differenza totale</div><div class="kpi-value" style="font-family:var(--font-mono);color:' + (diffTot !== null ? (diffTot >= 0 ? '#639922' : '#A32D2D') : 'var(--text-muted)') + '">' + (diffTot !== null ? (diffTot >= 0 ? '+' : '') + fmtL(diffTot) : '—') + '</div></div>';
}

async function salvaGiacenzeGiornaliere() {
  var data = document.getElementById('gg-data').value;
  if (!data) { toast('Seleziona una data'); return; }
  var salvati = 0, alerts = [];

  for (var i = 0; i < _ggProdotti.length; i++) {
    var prod = _ggProdotti[i];
    var rilEl = document.querySelector('.gg-rilevata[data-prodotto="' + prod + '"]');
    var caliEl = document.querySelector('.gg-cali[data-prodotto="' + prod + '"]');
    var notaEl = document.querySelector('.gg-nota[data-prodotto="' + prod + '"]');
    var rilevata = rilEl && rilEl.value !== '' ? parseFloat(rilEl.value) : null;
    var caliEcc = caliEl ? parseFloat(caliEl.value) || 0 : 0;
    var nota = notaEl ? notaEl.value : '';
    var dati = _ggDatiGiorno[prod] || {};
    var teorica = Math.round((dati.inizio || 0) + (dati.entrate || 0) - (dati.uscite || 0) + caliEcc);
    var diff = rilevata !== null ? Math.round(rilevata - teorica) : null;

    var record = {
      data: data, prodotto: prod, sede: 'deposito_vibo',
      giacenza_inizio: dati.inizio || 0,
      entrate: dati.entrate || 0,
      uscite: dati.uscite || 0,
      cali_eccedenze: caliEcc,
      giacenza_teorica: teorica,
      giacenza_rilevata: rilevata,
      differenza: diff,
      note: nota || null,
      rilevata_da: utenteCorrente ? utenteCorrente.nome : 'admin'
    };

    var { data: existing } = await sb.from('giacenze_giornaliere').select('id')
      .eq('data', data).eq('prodotto', prod).eq('sede','deposito_vibo').maybeSingle();
    if (existing) await sb.from('giacenze_giornaliere').update(record).eq('id', existing.id);
    else await sb.from('giacenze_giornaliere').insert([record]);
    salvati++;

    // Alert se differenza supera soglia
    if (diff !== null && Math.abs(diff) >= GG_SOGLIA_ALERT) {
      alerts.push({ prodotto: prod, diff: diff, teorica: teorica, rilevata: rilevata });
    }
  }

  // Mostra alert
  var alertBox = document.getElementById('gg-alert-box');
  if (alerts.length && alertBox) {
    var ah = '';
    alerts.forEach(function(a) {
      var col = a.diff < 0 ? '#A32D2D' : '#BA7517';
      ah += '<div style="padding:10px 14px;border-left:4px solid ' + col + ';background:' + (a.diff < 0 ? '#FCEBEB' : '#FAEEDA') + ';border-radius:0 8px 8px 0;margin-bottom:6px;font-size:12px;color:' + col + '">';
      ah += '<strong>Alert ' + esc(a.prodotto) + '</strong> — Differenza <strong>' + (a.diff >= 0 ? '+' : '') + fmtL(a.diff) + ' L</strong> supera soglia (' + fmtL(GG_SOGLIA_ALERT) + ' L). Teorica: ' + fmtL(a.teorica) + ', Rilevata: ' + fmtL(a.rilevata) + '</div>';
    });
    alertBox.innerHTML = ah;
    alertBox.style.display = '';

    // Invia alert in bacheca admin
    var msg = 'Giacenze deposito ' + data + ': ';
    alerts.forEach(function(a, idx) {
      msg += (idx > 0 ? ' | ' : '') + a.prodotto + ' diff ' + (a.diff >= 0 ? '+' : '') + a.diff + 'L (teorica ' + Math.round(a.teorica) + ', rilevata ' + Math.round(a.rilevata) + ')';
    });
    inviaAvvisoSistema(msg, 'anomalia');
  } else if (alertBox) {
    alertBox.style.display = 'none';
  }

  toast('Giacenze giornaliere salvate! (' + salvati + ' prodotti)');
  _auditLog('salva_giacenze_gg', 'giacenze_giornaliere', data + ' — ' + salvati + ' prodotti');
  caricaRegistroGiornaliero();
}

async function caricaRegistroGiornaliero() {
  var mese = document.getElementById('gg-mese')?.value || (new Date().getMonth() + 1);
  var anno = new Date().getFullYear();
  var prodFiltro = document.getElementById('gg-prodotto-filtro')?.value || '';
  var da = anno + '-' + String(mese).padStart(2,'0') + '-01';
  var ultimoGg = new Date(anno, Number(mese), 0).getDate();
  var a = anno + '-' + String(mese).padStart(2,'0') + '-' + ultimoGg;

  var q = sb.from('giacenze_giornaliere').select('*').eq('sede','deposito_vibo').gte('data', da).lte('data', a).order('data',{ascending:false});
  if (prodFiltro) q = q.eq('prodotto', prodFiltro);
  var { data: righe } = await q;

  var tbody = document.getElementById('gg-registro');
  if (!righe || !righe.length) { tbody.innerHTML = '<tr><td colspan="11" class="loading">Nessuna lettura nel periodo</td></tr>'; return; }

  var coloriProd = { 'Gasolio Autotrazione':'#D4A017', 'Benzina':'#639922', 'Gasolio Agricolo':'#6B5FCC', 'HVO':'#1D9E75' };

  // Diff cumulata per prodotto (ordine cronologico per calcolo)
  var righeAsc = righe.slice().reverse();
  var cumMap = {};
  righeAsc.forEach(function(r) {
    if (!cumMap[r.prodotto]) cumMap[r.prodotto] = 0;
    if (r.differenza !== null) cumMap[r.prodotto] += Number(r.differenza);
    r._cum = r.differenza !== null ? cumMap[r.prodotto] : null;
  });

  // Render in ordine discendente
  var html = '';
  righe.forEach(function(r, idx) {
    var pi = cacheProdotti ? cacheProdotti.find(function(p){return p.nome===r.prodotto;}) : null;
    var col = pi ? pi.colore : (coloriProd[r.prodotto] || '#888');
    var diffCol = r.differenza !== null ? (Number(r.differenza) >= 0 ? '#639922' : '#A32D2D') : 'var(--text-muted)';
    var cumCol = r._cum !== null ? (r._cum >= 0 ? '#639922' : '#A32D2D') : 'var(--text-muted)';
    var caliVal = Number(r.cali_eccedenze || 0);
    var caliCol = caliVal > 0 ? '#639922' : caliVal < 0 ? '#A32D2D' : 'var(--text-muted)';
    var bg = idx % 2 ? 'background:var(--bg)' : '';
    var isAlert = r.differenza !== null && Math.abs(Number(r.differenza)) >= GG_SOGLIA_ALERT;

    html += '<tr style="' + bg + (isAlert ? ';border-left:3px solid #E24B4A' : '') + '">';
    html += '<td style="font-weight:500">' + r.data + '</td>';
    html += '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-right:4px"></span>' + esc(r.prodotto) + '</td>';
    html += '<td style="font-family:var(--font-mono);text-align:right">' + fmtL(r.giacenza_inizio||0) + '</td>';
    html += '<td style="font-family:var(--font-mono);text-align:right;color:#639922">' + fmtL(r.entrate||0) + '</td>';
    html += '<td style="font-family:var(--font-mono);text-align:right;color:#A32D2D">' + fmtL(r.uscite||0) + '</td>';
    html += '<td style="font-family:var(--font-mono);text-align:right;color:' + caliCol + '">' + (caliVal !== 0 ? (caliVal > 0 ? '+' : '') + fmtL(caliVal) : '0') + '</td>';
    html += '<td style="font-family:var(--font-mono);text-align:right;font-weight:500">' + fmtL(r.giacenza_teorica||0) + '</td>';
    html += '<td style="font-family:var(--font-mono);text-align:right;font-weight:600;color:#6B5FCC">' + (r.giacenza_rilevata !== null ? fmtL(r.giacenza_rilevata) : '—') + '</td>';
    html += '<td style="font-family:var(--font-mono);text-align:right;color:' + diffCol + ';font-weight:500">' + (r.differenza !== null ? (Number(r.differenza) >= 0 ? '+' : '') + fmtL(r.differenza) : '—') + '</td>';
    html += '<td style="font-family:var(--font-mono);text-align:right;color:' + cumCol + ';font-weight:500">' + (r._cum !== null ? (r._cum >= 0 ? '+' : '') + fmtL(r._cum) : '—') + '</td>';
    html += '<td style="font-size:10px;color:var(--text-muted)">' + esc(r.note||'') + '</td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}

async function stampaGiacenzeGiornaliere() {
  var w = _apriReport('Giacenze giornaliere deposito'); if (!w) return;
  var mese = document.getElementById('gg-mese')?.value || (new Date().getMonth() + 1);
  var anno = new Date().getFullYear();
  var mesiNomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var meseNome = mesiNomi[Number(mese)-1];
  var da = anno + '-' + String(mese).padStart(2,'0') + '-01';
  var ultimoGg = new Date(anno, Number(mese), 0).getDate();
  var a = anno + '-' + String(mese).padStart(2,'0') + '-' + ultimoGg;

  var { data: righe } = await sb.from('giacenze_giornaliere').select('*').eq('sede','deposito_vibo').gte('data', da).lte('data', a).order('data');
  if (!righe || !righe.length) { w.close(); toast('Nessun dato'); return; }

  var css = '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px}' +
    '.page{padding:10mm;margin:0 auto}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:6mm}}' +
    '@media screen{.page{max-width:297mm;box-shadow:0 2px 12px rgba(0,0,0,0.08);margin:10px auto}body{background:#f5f4f0}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#6B5FCC;color:#fff;padding:5px 4px;font-size:8px;text-transform:uppercase;border:1px solid #5A4FBB;text-align:center}' +
    'td{padding:4px 6px;border:1px solid #ddd;font-size:10px}' +
    '.m{font-family:Courier New,monospace;text-align:right}' +
    '</style>';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Giacenze Giornaliere — ' + meseNome + ' ' + anno + '</title>' + css + '</head><body><div class="page">';
  html += '<div style="display:flex;justify-content:space-between;border-bottom:3px solid #6B5FCC;padding-bottom:8px;margin-bottom:12px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#6B5FCC">REGISTRO GIACENZE GIORNALIERE</div>';
  html += '<div style="font-size:11px;color:#666">Deposito Vibo Valentia — ' + meseNome + ' ' + anno + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:14px;font-weight:bold">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:9px;color:#666">Generato: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  html += '<table><thead><tr><th>Data</th><th>Prodotto</th><th>Giac. inizio</th><th>Entrate</th><th>Uscite</th><th>Cali/Ecc.</th><th>Giac. teorica</th><th>Giac. rilevata</th><th>Differenza</th><th>Diff. cum.</th><th>Note</th></tr></thead><tbody>';

  var cumMap = {};
  righe.forEach(function(r, idx) {
    if (!cumMap[r.prodotto]) cumMap[r.prodotto] = 0;
    if (r.differenza !== null) cumMap[r.prodotto] += Number(r.differenza);
    var cum = r.differenza !== null ? cumMap[r.prodotto] : null;
    var dC = r.differenza !== null ? (Number(r.differenza) >= 0 ? '#639922' : '#A32D2D') : '#999';
    var cC = cum !== null ? (cum >= 0 ? '#639922' : '#A32D2D') : '#999';
    var caliV = Number(r.cali_eccedenze||0);
    var caliC = caliV > 0 ? '#639922' : caliV < 0 ? '#A32D2D' : '#999';

    html += '<tr' + (idx%2?' style="background:#f9f9f6"':'') + '>';
    html += '<td style="font-weight:500">' + r.data.substring(5) + '</td>';
    html += '<td>' + r.prodotto + '</td>';
    html += '<td class="m">' + fmtL(r.giacenza_inizio||0) + '</td>';
    html += '<td class="m" style="color:#639922">' + fmtL(r.entrate||0) + '</td>';
    html += '<td class="m" style="color:#A32D2D">' + fmtL(r.uscite||0) + '</td>';
    html += '<td class="m" style="color:' + caliC + '">' + (caliV !== 0 ? (caliV > 0 ? '+' : '') + fmtL(caliV) : '0') + '</td>';
    html += '<td class="m" style="font-weight:500">' + fmtL(r.giacenza_teorica||0) + '</td>';
    html += '<td class="m" style="font-weight:600;color:#6B5FCC">' + (r.giacenza_rilevata!==null?fmtL(r.giacenza_rilevata):'—') + '</td>';
    html += '<td class="m" style="color:' + dC + '">' + (r.differenza!==null?(Number(r.differenza)>=0?'+':'')+fmtL(r.differenza):'—') + '</td>';
    html += '<td class="m" style="color:' + cC + ';font-weight:500">' + (cum!==null?(cum>=0?'+':'')+fmtL(cum):'—') + '</td>';
    html += '<td style="font-size:9px;color:#666">' + (r.note||'') + '</td></tr>';
  });

  html += '</tbody></table>';
  html += '<div style="text-align:center;font-size:8px;color:#aaa;border-top:1px solid #e8e8e8;padding-top:6px;margin-top:10px">PhoenixFuel Srl — Registro giacenze giornaliere deposito — ' + meseNome + ' ' + anno + '</div>';
  html += '</div>';
  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button>';
  html += '</div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

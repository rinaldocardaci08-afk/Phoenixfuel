// PhoenixFuel — Deposito, Rettifiche, Autoconsumo
// ── DEPOSITO ─────────────────────────────────────────────────────

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
  caricaDasOrdiniDeposito();
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


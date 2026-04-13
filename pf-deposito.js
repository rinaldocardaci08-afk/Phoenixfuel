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
  if (btn.dataset.tab === 'dep-giacenze') {
    // Tab unificato Giacenze: di default mostra la vista Singolo giorno
    // dgwToggleVista gestisce poi il passaggio tra giorno/week/mese
    if (typeof dgwToggleVista === 'function') {
      dgwToggleVista('giorno');
    } else {
      caricaGiacenzeGiornaliere();
    }
  }
}

function cisternasvg(pct, colore) {
  pct = Math.max(0, Math.min(100, pct));
  const altMax=80, liv=Math.round((pct/100)*altMax), y=10+(altMax-liv);
  const fill = pct<20?'#E24B4A':pct<35?'#BA7517':colore;
  return '<svg class="dep-cisterna-svg" viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="10" width="50" height="80" rx="4" fill="#e8e7e3" stroke="#ccc" stroke-width="1"/><rect x="5" y="' + y + '" width="50" height="' + liv + '" rx="2" fill="' + fill + '" opacity="0.85"/><rect x="5" y="10" width="50" height="80" rx="4" fill="none" stroke="#bbb" stroke-width="1.5"/><rect x="20" y="5" width="20" height="8" rx="2" fill="#ccc"/><line x1="5" y1="30" x2="8" y2="30" stroke="#bbb" stroke-width="1"/><line x1="5" y1="50" x2="8" y2="50" stroke="#bbb" stroke-width="1"/><line x1="5" y1="70" x2="8" y2="70" stroke="#bbb" stroke-width="1"/></svg>';
}

async function caricaDeposito() {
  _cacheCisterne = null; // Invalida cache per ordini
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','deposito_vibo').order('tipo').order('nome');
  if (!cisterne) return;

  // ═══════════════════════════════════════════════════════════════════
  // ALLINEAMENTO IN MEMORIA al calcolo canonico pfData.getGiacenzaAllaData
  // Comandamento: giacenza = iniziale + entrate − uscite.
  // cisterne.livello_attuale sul DB può essere disallineata (bug noto),
  // quindi qui lo sovrascriviamo in memoria con il calcolato per prodotto.
  // Distribuiamo il totale per prodotto sulle cisterne del prodotto in
  // proporzione al loro livello_attuale DB (così almeno il peso relativo
  // tra cisterne dello stesso prodotto è preservato).
  // ═══════════════════════════════════════════════════════════════════
  try {
    if (typeof pfData !== 'undefined' && pfData.getGiacenzaAllaData) {
      var oggi = new Date().toISOString().split('T')[0];
      var prodottiUnici = [...new Set(cisterne.map(function(c) { return c.prodotto; }))];
      for (var pi = 0; pi < prodottiUnici.length; pi++) {
        var prod = prodottiUnici[pi];
        var giac = await pfData.getGiacenzaAllaData('deposito_vibo', prod, oggi);
        var calcTot = giac.calcolata;
        var cisDelProd = cisterne.filter(function(c) { return c.prodotto === prod; });
        var sommaDb = cisDelProd.reduce(function(s,c) { return s + Number(c.livello_attuale || 0); }, 0);
        if (sommaDb > 0) {
          cisDelProd.forEach(function(c) {
            var quota = Number(c.livello_attuale || 0) / sommaDb;
            c.livello_attuale = Math.round(calcTot * quota);
          });
        } else if (cisDelProd.length > 0) {
          var quotaEqua = Math.round(calcTot / cisDelProd.length);
          cisDelProd.forEach(function(c) { c.livello_attuale = quotaEqua; });
        }
      }
    }
  } catch (e) {
    console.warn('[caricaDeposito] allineamento calcolato fallito, uso DB:', e);
  }

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
    var isAdmin = utenteCorrente && utenteCorrente.ruolo === 'admin';
    var cmpEditBtn = isAdmin ? ' <button onclick="_apriModificaCMP(\'' + esc(prodNome) + '\',\'' + gruppo.map(function(c){return c.id;}).join(',') + '\',' + totG + ',' + cmpGruppo.toFixed(6) + ')" style="font-size:9px;padding:1px 6px;background:none;border:0.5px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text-muted)" title="Modifica CMP">✏️</button>' : '';
    const cmpLabel = '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">CMP: <strong style="font-family:var(--font-mono)">€ ' + cmpGruppo.toFixed(4) + '</strong>' + (totG > 0 ? ' · Valore: <strong style="font-family:var(--font-mono)">' + fmtE(totG * cmpGruppo) + '</strong>' : '') + cmpEditBtn + '</div>';
    const distBtn = nCis > 1 ? '<button class="btn-primary" style="font-size:11px;padding:5px 12px;background:#6B5FCC;white-space:nowrap" onclick="apriDistribuzioneCisterne(\'' + esc(prodNome) + '\',\'deposito_vibo\')">⚖️ Distribuisci</button>' : '';
    const cardHtml = '<div class="card"><div class="dep-product-header"><div class="dep-product-dot" style="background:' + colore + '"></div><div><div class="dep-product-title">' + esc(prodNome) + '</div><div class="dep-product-sub">' + subLabel + '</div>' + cmpLabel + '</div><div style="display:flex;align-items:center;gap:10px">' + distBtn + '<div class="dep-product-total">' + totLabel + '</div></div></div><div class="dep-cisterne-grid">' + cisHtml + '</div></div>';

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
  // Default: movimenti di oggi (non più ultimi 10)
  var inpMovData = document.getElementById('mov-data');
  if (inpMovData && !inpMovData.value) inpMovData.value = new Date().toISOString().split('T')[0];
  await caricaMovimentiDeposito('data');
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
  // ── LOCK DIFENSIVO: impedisce doppi carichi ──
  if (ordine.caricato_deposito) {
    toast('⚠ Ordine già caricato sul deposito. Usa ↩️ per annullare prima di riprovare.');
    return;
  }
  if (ordine.stato === 'annullato') {
    toast('Ordine annullato: non caricabile');
    return;
  }
  // Warning ordini con data futura
  var oggiISO_c = new Date().toISOString().split('T')[0];
  if (ordine.data && ordine.data > oggiISO_c) {
    if (!confirm('⚠ Questo ordine è programmato per il ' + fmtD(ordine.data) + ' (futuro).\n\nSe confermi ora, la cisterna verrà caricata oggi ' + fmtD(oggiISO_c) + ' e la giacenza potrebbe non riflettere la realtà fisica fino alla data dell\'ordine.\n\nContinuare comunque?')) return;
  }
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
  // ── LOCK DIFENSIVO: impedisce doppi scarichi ──
  // Se l'ordine ha già cisterna_id valorizzato significa che è già stato scaricato.
  // Senza questo check, click multipli o chiamate programmatiche doppie causano
  // decrementi ripetuti della stessa cisterna.
  if (ordine.cisterna_id) {
    if (!auto) {
      toast('⚠ Ordine già scaricato da una cisterna. Usa ↩️ per annullare prima di riprovare.');
    }
    return;
  }
  if (ordine.stato === 'consegnato') {
    if (!auto) toast('Ordine già consegnato: non è possibile scaricare di nuovo');
    return;
  }
  if (ordine.stato === 'annullato') {
    if (!auto) toast('Ordine annullato: non scaricabile');
    return;
  }
  // Warning ordini con data futura
  var oggiISO_u = new Date().toISOString().split('T')[0];
  if (ordine.data && ordine.data > oggiISO_u) {
    if (!confirm('⚠ Questo ordine è programmato per il ' + fmtD(ordine.data) + ' (futuro).\n\nSe confermi ora, la cisterna verrà scaricata oggi ' + fmtD(oggiISO_u) + ' e la giacenza potrebbe non riflettere la realtà fisica fino alla data dell\'ordine.\n\nContinuare comunque?')) return;
  }
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
    return '<tr><td>' + fmtD(r.data) + '</td><td>' + esc(cisNome) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.giacenza_sistema||0) + '</td><td style="font-family:var(--font-mono);font-weight:600">' + fmtL(r.giacenza_rilevata) + '</td><td style="font-family:var(--font-mono);color:' + diffColor + ';font-weight:600">' + diffLabel + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td>' + statoBadge + '</td><td>' + azioni + '</td></tr>';
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
      '<td style="padding:6px 8px;border:1px solid #ddd">' + fmtD(r.data) + '</td>' +
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
  // Carica TUTTE le cisterne autoconsumo (può esserci una per prodotto)
  const { data: cisterneAC } = await sb.from('cisterne').select('*').eq('sede','autoconsumo').order('prodotto');
  window._cisterneAutoconsumo = {};
  (cisterneAC||[]).forEach(function(c) { window._cisterneAutoconsumo[c.prodotto] = c; });

  // Retrocompatibilità: window._cisternaAutoconsumo = prima cisterna Gasolio Autotrazione (o la prima in assoluto)
  var cisPrimary = window._cisterneAutoconsumo['Gasolio Autotrazione'] || (cisterneAC && cisterneAC[0]) || null;
  window._cisternaAutoconsumo = cisPrimary;

  // KPI giacenza totale (somma di tutte le cisterne autoconsumo)
  var totGiacAC = (cisterneAC||[]).reduce(function(s,c){ return s + Number(c.livello_attuale||0); }, 0);
  var elGiac = document.getElementById('ac-giacenza');
  if (elGiac) elGiac.textContent = fmtL(totGiacAC);

  // Grafica cisterne: renderizza tutte le cisterne autoconsumo (una card per ciascuna)
  const el = document.getElementById('ac-cisterna-grafica');
  if (el) {
    if (cisterneAC && cisterneAC.length) {
      var coloriAC = { 'Gasolio Autotrazione':'#BA7517', 'AdBlue':'#0088CC', 'Benzina':'#378ADD', 'Gasolio Agricolo':'#639922', 'HVO':'#6B5FCC' };
      var htmlAC = '';
      cisterneAC.forEach(function(c) {
        var pct = Number(c.capacita_max) > 0 ? Math.round((Number(c.livello_attuale) / Number(c.capacita_max)) * 100) : 0;
        var col = coloriAC[c.prodotto] || '#BA7517';
        htmlAC += '<div class="card" style="margin-bottom:10px"><div class="dep-product-header"><div class="dep-product-dot" style="background:'+col+'"></div><div><div class="dep-product-title">' + esc(c.nome) + '</div><div class="dep-product-sub">' + esc(c.prodotto) + ' · cap. ' + fmtL(c.capacita_max) + '</div></div><div class="dep-product-total">' + fmtL(c.livello_attuale) + '</div></div><div class="dep-cisterne-grid"><div class="dep-cisterna">' + cisternasvg(pct, col) + '<div class="dep-cisterna-litri">' + _sep(Number(c.livello_attuale).toLocaleString('it-IT')) + ' L</div><div class="dep-cisterna-pct">' + pct + '% · cap. ' + _sep(Number(c.capacita_max).toLocaleString('it-IT')) + ' L</div></div></div></div>';
      });
      el.innerHTML = htmlAC;
    } else {
      el.innerHTML = '<div class="card"><div class="card-title">Nessuna cisterna autoconsumo configurata</div></div>';
    }
  }

  // Prelievi mese
  const inizioMese = oggiISO.substring(0,8) + '01';
  const { data: prelMese } = await sb.from('prelievi_autoconsumo').select('litri').gte('data', inizioMese).lte('data', oggiISO);
  const totMese = (prelMese||[]).reduce((s,p) => s + Number(p.litri), 0);
  document.getElementById('ac-prelievi-mese').textContent = fmtL(totMese);

  // Popola dropdown prodotto nel form prelievi (se presente)
  var selProd = document.getElementById('ac-prodotto');
  if (selProd && cisterneAC) {
    var curP = selProd.value;
    selProd.innerHTML = cisterneAC.map(function(c){ return '<option value="'+esc(c.prodotto)+'">'+esc(c.prodotto)+'</option>'; }).join('');
    if (curP && cisterneAC.find(function(c){return c.prodotto===curP;})) selProd.value = curP;
  }

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
  // Leggi l'ordine per conoscere il prodotto
  const { data: ord } = await sb.from('ordini').select('prodotto,litri').eq('id', ordineId).single();
  if (!ord) { toast('Ordine non trovato'); return; }

  // Trova la cisterna autoconsumo del prodotto giusto
  const mappa = window._cisterneAutoconsumo || {};
  const cis = mappa[ord.prodotto];
  if (!cis) { toast('Cisterna autoconsumo per ' + ord.prodotto + ' non trovata. Crearla prima dal pannello cisterne.'); return; }
  if (!confirm('Confermi la ricezione di ' + fmtL(litri) + ' L di ' + ord.prodotto + ' nella cisterna "' + cis.nome + '"?')) return;

  // Controllo capacità massima
  const nuovoLivello = Number(cis.livello_attuale) + Number(litri);
  if (nuovoLivello > Number(cis.capacita_max)) {
    toast('Capacità cisterna insufficiente! Max: ' + fmtL(cis.capacita_max) + ', attuale: ' + fmtL(cis.livello_attuale));
    return;
  }

  const { error: errCis } = await sb.from('cisterne').update({ livello_attuale: nuovoLivello, updated_at: new Date().toISOString() }).eq('id', cis.id);
  if (errCis) { toast('Errore cisterna: ' + errCis.message); return; }

  await sb.from('ordini').update({ caricato_deposito: true }).eq('id', ordineId);
  toast('✅ ' + fmtL(litri) + ' L di ' + ord.prodotto + ' ricevuti in "' + cis.nome + '"');
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
      '<td>' + fmtD(r.data) + '</td>' +
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
  // Prodotto selezionato (dropdown ac-prodotto); fallback 'Gasolio Autotrazione' per retrocompatibilità
  var selProd = document.getElementById('ac-prodotto');
  var prodotto = (selProd && selProd.value) ? selProd.value : 'Gasolio Autotrazione';

  if (!data || !mezzoId || !litri || litri <= 0) { toast('Compila data, camion e litri'); return; }

  // Trova la cisterna autoconsumo del prodotto selezionato
  const mappa = window._cisterneAutoconsumo || {};
  const cis = mappa[prodotto];
  if (!cis) { toast('Cisterna autoconsumo ' + prodotto + ' non trovata'); return; }
  if (Number(cis.livello_attuale) < litri) { toast('Giacenza insufficiente! Disponibili: ' + fmtL(cis.livello_attuale) + ' L di ' + prodotto); return; }

  // Registra prelievo (con prodotto)
  const r1 = await _sbWrite('prelievi_autoconsumo', 'insert', [{ data, mezzo_id: mezzoId, mezzo_targa: mezzoTarga, litri, note, prodotto }]);
  if (r1.error) { toast('Errore: ' + r1.error.message); return; }

  // Scala dalla cisterna
  const nuovoLivello = Number(cis.livello_attuale) - litri;
  await _sbWrite('cisterne', 'update', { livello_attuale: nuovoLivello, updated_at: new Date().toISOString() }, { id: cis.id });

  toast(r1._offline ? '⚡ Prelievo ' + fmtL(litri) + ' L salvato offline' : '⛽ Prelievo di ' + fmtL(litri) + ' L ' + prodotto + ' registrato per ' + mezzoTarga);
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
  // Restituisci litri alla cisterna del prodotto corretto (fallback Gasolio Autotrazione per prelievi storici senza campo prodotto)
  const mappa = window._cisterneAutoconsumo || {};
  const prodPrel = prel.prodotto || 'Gasolio Autotrazione';
  const cis = mappa[prodPrel] || window._cisternaAutoconsumo;
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

  // Identifica prodotti deposito dalle cisterne (solo per elenco prodotti, NON per livello)
  var { data: cisterne } = await sb.from('cisterne').select('prodotto,capacita_max').eq('sede','deposito_vibo');
  var prodMap = {};
  (cisterne||[]).forEach(function(c) {
    if (!prodMap[c.prodotto]) prodMap[c.prodotto] = { capacita:0, attuale:0 };
    prodMap[c.prodotto].capacita += Number(c.capacita_max||0);
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
  // Fix timezone-safe: usa Date.UTC per evitare off-by-one in fuso Europe/Rome
  var _ggParts = data.split('-');
  var _ggDPrec = new Date(Date.UTC(parseInt(_ggParts[0]), parseInt(_ggParts[1]) - 1, parseInt(_ggParts[2])));
  _ggDPrec.setUTCDate(_ggDPrec.getUTCDate() - 1);
  var giornoPrima = _ggDPrec.toISOString().split('T')[0];
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
    .eq('tipo_ordine','cliente').neq('stato','annullato')
    .or('fornitore.ilike.%phoenix%,fornitore.ilike.%deposito%').eq('data', data);
  var { data: uscSt } = await sb.from('ordini').select('prodotto,litri')
    .eq('tipo_ordine','stazione_servizio').neq('stato','annullato')
    .or('fornitore.ilike.%phoenix%,fornitore.ilike.%deposito%').eq('data', data);
  var { data: uscAu } = await sb.from('ordini').select('prodotto,litri')
    .eq('tipo_ordine','autoconsumo').neq('stato','annullato').eq('data', data);
  var usciteMap = {};
  [uscCl, uscSt, uscAu].forEach(function(arr) {
    (arr||[]).forEach(function(o) { usciteMap[o.prodotto] = (usciteMap[o.prodotto]||0) + Number(o.litri); });
  });

  // Render tabella compatta multi-prodotto
  _ggDatiGiorno = {};

  // Header con frecce di navigazione + label Oggi/Ieri/Domani
  var dataObj = new Date(data + 'T00:00:00');
  var oggiObj = new Date(oggiISO + 'T00:00:00');
  var diffGg = Math.round((dataObj - oggiObj) / 86400000);
  var labelRel = '';
  if (diffGg === 0) labelRel = 'Oggi';
  else if (diffGg === -1) labelRel = 'Ieri';
  else if (diffGg === 1) labelRel = 'Domani';
  else if (diffGg === -2) labelRel = 'L\'altro ieri';
  else if (diffGg === 2) labelRel = 'Dopodomani';
  else if (diffGg < 0) labelRel = Math.abs(diffGg) + ' giorni fa';
  else labelRel = 'Tra ' + diffGg + ' giorni';
  var giorniSett = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  var labelGiorno = giorniSett[dataObj.getDay()] + ' ' + dataObj.toLocaleDateString('it-IT');

  var h = '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-top:12px">';

  // Barra navigazione giorno
  h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:0.5px solid var(--border);background:var(--bg-card)">';
  h += '<div>';
  h += '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">' + labelRel + '</div>';
  h += '<div style="font-size:15px;font-weight:500;margin-top:2px">' + labelGiorno + '</div>';
  h += '</div>';
  h += '<div style="display:flex;gap:6px">';
  h += '<button onclick="_ggCambiaGiorno(-1)" title="Giorno precedente" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:6px 12px;font-size:14px;cursor:pointer;color:var(--text)">‹</button>';
  h += '<button onclick="_ggVaiOggi()" title="Vai a oggi" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;color:var(--text)">Oggi</button>';
  h += '<button onclick="_ggCambiaGiorno(1)" title="Giorno successivo" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:6px 12px;font-size:14px;cursor:pointer;color:var(--text)">›</button>';
  h += '<button onclick="_ggMostraDettaglio(\'' + data + '\')" title="Dettaglio movimenti del giorno" style="margin-left:6px;width:30px;height:30px;border-radius:50%;background:#378ADD;color:#fff;border:none;cursor:pointer;font-family:Georgia,serif;font-size:16px;font-weight:700;font-style:italic;line-height:1;padding:0;display:flex;align-items:center;justify-content:center" onmouseover="this.style.background=\'#185FA5\'" onmouseout="this.style.background=\'#378ADD\'">i</button>';
  h += '</div>';
  h += '</div>';

  // Tabella prodotti
  h += '<div style="overflow-x:auto">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  h += '<thead><tr style="background:var(--bg-card)">';
  h += '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Prodotto</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Apertura</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:#185FA5;text-transform:uppercase;letter-spacing:0.4px">+ Entrate</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:#A32D2D;text-transform:uppercase;letter-spacing:0.4px">− Uscite</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Δ giorno</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">+/− Cali</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Teorica</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Rilevata</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Differenza</th>';
  h += '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Note</th>';
  h += '</tr></thead><tbody>';

  // Ordine fisso prodotti: Gasolio Autotrazione → Benzina → Gasolio Agricolo → HVO
  var ordineProdotti = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO'];
  var prodottiOrdinati = ordineProdotti.filter(function(p) { return _ggProdotti.indexOf(p) >= 0; });
  _ggProdotti.forEach(function(p) { if (prodottiOrdinati.indexOf(p) < 0) prodottiOrdinati.push(p); });

  // ═══════════════════════════════════════════════════════════════════
  // Pre-carica apertura per ogni prodotto via pfData.getGiacenzaAllaData(giornoPrima)
  // Unica sorgente di verità (comandamento #1). Se giornoPrima < 01/01
  // dell'anno o pfData fallisce, fallback su precMap (rilevata/teorica salvate).
  // ═══════════════════════════════════════════════════════════════════
  var aperturaCalcolata = {};
  if (typeof pfData !== 'undefined' && pfData.getGiacenzaAllaData) {
    try {
      var promises = prodottiOrdinati.map(function(prod) {
        return pfData.getGiacenzaAllaData('deposito_vibo', prod, giornoPrima)
          .then(function(g) { return { prod: prod, calc: g.calcolata }; })
          .catch(function(e) { console.warn('[caricaGiacenzeGiornaliere] pfData fallita per', prod, e); return { prod: prod, calc: null }; });
      });
      var risultati = await Promise.all(promises);
      risultati.forEach(function(r) { if (r.calc !== null) aperturaCalcolata[r.prod] = r.calc; });
    } catch (e) {
      console.warn('[caricaGiacenzeGiornaliere] allineamento calcolato fallito:', e);
    }
  }

  prodottiOrdinati.forEach(function(prod) {
    var pi = cacheProdotti ? cacheProdotti.find(function(p){return p.nome===prod;}) : null;
    var col = pi ? pi.colore : (coloriProd[prod] || '#888');
    // Priorità apertura:
    // 1. rilevata salvata gg prec (precMap) — il proprietario l'ha misurata
    // 2. calcolata pfData del gg prec — fiume dei litri
    // 3. 0 (prodotto nuovo o senza dati)
    var inizio;
    if (precMap[prod] !== undefined && precMap[prod] !== null) {
      inizio = precMap[prod];
    } else if (aperturaCalcolata[prod] !== undefined) {
      inizio = aperturaCalcolata[prod];
    } else {
      inizio = 0;
    }
    var ent = entrateMap[prod] || 0;
    var usc = usciteMap[prod] || 0;
    var deltaGiornoVal = ent - usc;
    var salvata = oggiMap[prod];
    var caliEcc = salvata ? Number(salvata.cali_eccedenze || 0) : 0;
    var teorica = Math.round(inizio + ent - usc + caliEcc);
    var rilevata = salvata && salvata.giacenza_rilevata !== null ? Number(salvata.giacenza_rilevata) : '';
    var diff = rilevata !== '' ? Math.round(rilevata - teorica) : null;
    var nota = salvata ? (salvata.note||'') : '';

    _ggDatiGiorno[prod] = { inizio:inizio, entrate:ent, uscite:usc, caliEcc:caliEcc, teorica:teorica };

    var colDelta, txtDelta;
    if (deltaGiornoVal > 0) { colDelta = '#639922'; txtDelta = '+' + fmtL(deltaGiornoVal); }
    else if (deltaGiornoVal < 0) { colDelta = '#A32D2D'; txtDelta = fmtL(deltaGiornoVal); }
    else { colDelta = 'var(--text-muted)'; txtDelta = '—'; }

    h += '<tr style="border-top:0.5px solid var(--border)">';
    h += '<td style="padding:12px 14px;font-weight:500;border-left:3px solid ' + col + '"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-right:6px"></span>' + esc(prod) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + fmtL(inizio) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-weight:500;color:' + (ent>0?'#185FA5':'var(--text-muted)') + '">' + (ent>0?'+':'') + fmtL(ent) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-weight:500;color:' + (usc>0?'#A32D2D':'var(--text-muted)') + '">' + (usc>0?'−':'') + fmtL(usc) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-weight:600;color:' + colDelta + '">' + txtDelta + '</td>';
    h += '<td style="padding:12px 10px;text-align:right">';
    h += '<input type="number" class="gg-cali" data-prodotto="' + esc(prod) + '" value="' + caliEcc + '" step="1" oninput="_ggRicalcola(\'' + esc(prod) + '\')" style="width:80px;font-family:var(--font-mono);font-size:12px;padding:5px 7px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:' + (caliEcc>=0?(caliEcc>0?'#639922':'var(--text)'):'#A32D2D') + ';text-align:right" />';
    h += '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-size:14px;font-weight:600"><span class="gg-teorica-display" data-prodotto="' + esc(prod) + '">' + fmtL(teorica) + '</span></td>';
    h += '<td style="padding:12px 10px;text-align:right">';
    h += '<input type="number" class="gg-rilevata" data-prodotto="' + esc(prod) + '" value="' + rilevata + '" placeholder="' + teorica + '" step="1" oninput="_ggCalcDiff(\'' + esc(prod) + '\')" style="width:90px;font-family:var(--font-mono);font-size:14px;font-weight:600;padding:5px 7px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);text-align:right" />';
    h += '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-weight:600"><span class="gg-diff-display" data-prodotto="' + esc(prod) + '" style="color:' + (diff!==null?(diff>=0?'#639922':'#A32D2D'):'var(--text-muted)') + '">' + (diff!==null?(diff>=0?'+':'')+fmtL(diff):'—') + '</span></td>';
    h += '<td style="padding:12px 14px">';
    h += '<input type="text" class="gg-nota" data-prodotto="' + esc(prod) + '" value="' + esc(nota) + '" placeholder="—" style="width:100%;min-width:140px;font-size:12px;padding:5px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text)" />';
    h += '</td>';
    h += '</tr>';
  });

  h += '</tbody></table></div>';
  h += '</div>';

  // Alert box (nascosto, si mostra al salvataggio)
  h += '<div id="gg-alert-box" style="display:none;margin-top:12px"></div>';

  // Container per il dettaglio movimenti del giorno (popolato da dgwMostraDettaglioGiornoGG al click sul bottone info)
  h += '<div id="gg-dettaglio-box" style="margin-top:14px"></div>';

  document.getElementById('gg-form-prodotti').innerHTML = h;

  // KPI
  _ggAggiornaKPI(oggiMap);

  // Registro
  caricaRegistroGiornaliero();
}

function _ggCambiaGiorno(deltaGiorni) {
  var dataEl = document.getElementById('gg-data');
  if (!dataEl) return;
  var corr = dataEl.value || oggiISO;
  // Fix timezone-safe (Europe/Rome): usa Date.UTC per evitare off-by-one
  var parts = corr.split('-');
  var nuovaData = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
  nuovaData.setUTCDate(nuovaData.getUTCDate() + deltaGiorni);
  dataEl.value = nuovaData.toISOString().split('T')[0];
  caricaGiacenzeGiornaliere();
}

function _ggVaiOggi() {
  var dataEl = document.getElementById('gg-data');
  if (!dataEl) return;
  dataEl.value = oggiISO;
  caricaGiacenzeGiornaliere();
}

// Toggle del dettaglio movimenti del giorno nella vista giornaliera tabellare.
// Riusa _movRenderBlocchi (stesso renderer della vista settimanale).
var _ggDettaglioCorrente = null;
async function _ggMostraDettaglio(iso) {
  var box = document.getElementById('gg-dettaglio-box');
  if (!box) return;
  // Toggle: secondo click sullo stesso giorno = chiude
  if (_ggDettaglioCorrente === iso) {
    box.innerHTML = '';
    _ggDettaglioCorrente = null;
    return;
  }
  _ggDettaglioCorrente = iso;
  box.innerHTML = '<div class="loading" style="padding:16px;text-align:center">Caricamento movimenti del ' + (typeof fmtD==='function'?fmtD(iso):iso) + '...</div>';

  // Query: include solo i veri movimenti del deposito.
  // FIX 13/04 sera: stazione_servizio era preso TUTTO (anche consegne dirette
  // Ludoil/Eni→stazione che NON escono dal deposito). Ora aggiungiamo filtro
  // fornitore Phoenix anche per stazione_servizio, coerente con pfData.
  var res = await sb.from('ordini').select('*,basi_carico(nome)')
    .eq('data', iso)
    .order('created_at', { ascending: false });

  if (res.error) {
    box.innerHTML = '<div class="loading" style="padding:16px;text-align:center;color:#A32D2D">Errore: ' + esc(res.error.message) + '</div>';
    return;
  }

  // Filtro in JS per coerenza con pfData
  function _isPhoenix(o) {
    var f = (o.fornitore || '').toLowerCase();
    return f.indexOf('phoenix') >= 0 || f.indexOf('deposito') >= 0;
  }
  var movimentiTutti = res.data || [];
  var movimenti = movimentiTutti.filter(function(o) {
    if (o.stato === 'annullato') return false;
    if (o.tipo_ordine === 'entrata_deposito') return true;
    if (o.tipo_ordine === 'autoconsumo') return true;
    if (o.tipo_ordine === 'cliente' && _isPhoenix(o)) return true;
    if (o.tipo_ordine === 'stazione_servizio' && _isPhoenix(o)) return true;
    return false;
  });
  var entrate = movimenti.filter(function(r) { return r.tipo_ordine === 'entrata_deposito'; });
  var uscite  = movimenti.filter(function(r) { return r.tipo_ordine !== 'entrata_deposito'; });

  var dataLbl = (typeof fmtD==='function') ? fmtD(iso) : iso;
  var header = '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:8px 8px 0 0;border-bottom:none">';
  header += '<div style="font-size:13px;font-weight:600;color:var(--text)">Dettaglio movimenti del ' + dataLbl + '</div>';
  header += '<button class="btn-edit" style="font-size:11px;padding:3px 10px" onclick="_ggMostraDettaglio(\'' + iso + '\')" title="Chiudi">✕</button>';
  header += '</div>';

  var body;
  if (typeof _movRenderBlocchi === 'function') {
    body = '<div style="padding:12px 14px;border:0.5px solid var(--border);border-top:none;border-radius:0 0 8px 8px;background:var(--bg-card)">';
    body += _movRenderBlocchi(entrate, uscite, true, true, 'compact');
    body += '</div>';
  } else {
    body = '<div style="padding:16px;color:#A32D2D">Errore: funzione di rendering non trovata. Ricarica la pagina.</div>';
  }

  box.innerHTML = header + body;
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
    html += '<td style="font-weight:500">' + fmtD(r.data) + '</td>';
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


// ═══════════════════════════════════════════════════════════════════
// (F) SMISTAMENTO DIRETTO v2 — Ordine fornitore → Clienti + Carico
// ═══════════════════════════════════════════════════════════════════

var _smistOrdine = null;
var _smistRighe = 0;
var _smistClienti = [];
var _smistMezzi = [];
var _smistSedi = {};

async function apriModaleSmistamento(ordineId) {
  var { data: ordine } = await sb.from('ordini').select('*,basi_carico(nome)').eq('id', ordineId).single();
  if (!ordine) { toast('Ordine non trovato'); return; }
  _smistOrdine = ordine;
  _smistRighe = 0;

  // Precarica dati
  var [clRes, mzRes, trRes, mzTrRes, autRes] = await Promise.all([
    sb.from('clienti').select('id,nome,tipo,cliente_rete').order('nome'),
    sb.from('mezzi').select('id,targa,capacita_totale,autista_default').eq('attivo', true).order('targa'),
    sb.from('trasportatori').select('id,nome').eq('attivo', true).order('nome'),
    sb.from('mezzi_trasportatori').select('id,targa,capacita_totale,trasportatore_id').order('targa'),
    sb.from('autisti').select('id,nome,trasportatore_id').order('nome')
  ]);
  _smistClienti = clRes.data || [];
  _smistMezzi = mzRes.data || [];
  var trasportatori = trRes.data || [];
  var mezziTr = mzTrRes.data || [];
  var autistiTr = autRes.data || [];

  // Salva per cascata
  window._smistTrasportatori = trasportatori;
  window._smistMezziPropri = _smistMezzi;
  window._smistMezziTr = mezziTr;
  window._smistAutistiTr = autistiTr;

  var optsClienti = '<option value="">— Seleziona cliente —</option>';
  _smistClienti.forEach(function(c) { optsClienti += '<option value="' + c.id + '" data-nome="' + esc(c.nome) + '">' + esc(c.nome) + '</option>'; });
  window._smistOptsClienti = optsClienti;

  // Opzioni vettori
  var optsVettori = '<option value="proprio">Phoenix Fuel Srl (mezzo proprio)</option>';
  trasportatori.forEach(function(t) { optsVettori += '<option value="' + t.id + '">' + esc(t.nome) + '</option>'; });

  var baseNome = ordine.basi_carico ? ordine.basi_carico.nome : '—';

  var h = '<div style="font-size:18px;font-weight:500;margin-bottom:4px">Smistamento diretto</div>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Distribuisci i litri tra i clienti e organizza il carico. La merce va direttamente dal fornitore ai clienti.</div>';

  // Header ordine
  h += '<div style="padding:14px 18px;border:2px solid #D85A30;border-radius:12px;margin-bottom:16px;background:#D85A3010">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  h += '<div><div style="font-size:11px;color:#D85A30;text-transform:uppercase;letter-spacing:0.4px">Ordine fornitore</div>';
  h += '<div style="font-size:16px;font-weight:500">' + esc(ordine.fornitore) + ' — ' + fmtL(ordine.litri) + ' L ' + esc(ordine.prodotto) + '</div>';
  h += '<div style="font-size:12px;color:var(--text-muted)">Costo: <span style="font-family:var(--font-mono);font-weight:500">' + fmt(ordine.costo_litro) + ' €/L</span> — Base: ' + esc(baseNome) + ' — Data: ' + ordine.data + '</div></div>';
  h += '<div style="font-family:var(--font-mono);font-size:22px;font-weight:500">' + fmtL(ordine.litri) + ' L</div>';
  h += '</div></div>';

  // Sezione trasporto
  h += '<div style="font-size:11px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;padding-bottom:4px;border-bottom:0.5px solid var(--border)">Trasporto</div>';
  h += '<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px">';
  h += '<div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">Vettore</div>';
  h += '<select id="smist-vettore" onchange="_smistVettoreChange()" style="width:100%;font-size:13px;padding:7px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">' + optsVettori + '</select></div>';
  h += '<div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">Mezzo / targa</div>';
  h += '<select id="smist-mezzo" onchange="_smistMezzoChange()" style="width:100%;font-size:13px;padding:7px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)"><option value="">—</option></select></div>';
  h += '<div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">Autista</div>';
  h += '<select id="smist-autista" style="width:100%;font-size:13px;padding:7px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)"><option value="">—</option></select></div>';
  h += '<div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">Data carico</div>';
  h += '<input type="date" id="smist-data-carico" value="' + oggiISO + '" style="width:100%" /></div>';
  h += '<div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">Data consegna</div>';
  h += '<input type="date" id="smist-data-consegna" value="' + oggiISO + '" style="width:100%" /></div>';
  h += '</div>';

  // Distribuzione clienti
  h += '<div style="font-size:11px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;padding-bottom:4px;border-bottom:0.5px solid var(--border)">Distribuzione clienti (ordine di consegna)</div>';
  h += '<div id="smist-righe" style="display:grid;gap:8px"></div>';
  h += '<button onclick="_smistAggiungiRiga()" style="margin-top:8px;padding:6px 14px;font-size:12px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;color:var(--text)">+ Aggiungi cliente</button>';

  // Riepilogo
  h += '<div id="smist-riepilogo" style="margin-top:14px;padding:14px 18px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)"></div>';

  // Info
  h += '<div style="margin-top:10px;padding:10px 14px;background:#E1F5EE;border-radius:8px;font-size:12px;color:#085041">Il sistema crea automaticamente: ordini cliente + DAS + carico con sequenza consegne + movimenti deposito (entrata + uscite). Ordine fornitore marcato come "smistato".</div>';

  // Bottoni
  h += '<div style="display:flex;gap:8px;margin-top:14px">';
  h += '<button class="btn-primary" style="flex:1;background:#D85A30;font-size:14px;padding:12px" onclick="confermaSmistamento()">Conferma smistamento + crea carico</button>';
  h += '<button onclick="chiudiModal()" style="flex:0 0 auto;padding:12px 20px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button>';
  h += '</div>';

  apriModal(h);
  _smistVettoreChange(); // Popola mezzi per vettore default (proprio)
  _smistAggiungiRiga();
  _smistAggiornaRiepilogo();
}

function _smistVettoreChange() {
  var vettore = document.getElementById('smist-vettore').value;
  var selMezzo = document.getElementById('smist-mezzo');
  var selAutista = document.getElementById('smist-autista');

  if (vettore === 'proprio') {
    // Mezzi propri
    selMezzo.innerHTML = '<option value="">— Seleziona mezzo —</option>';
    (window._smistMezziPropri||[]).forEach(function(m) {
      selMezzo.innerHTML += '<option value="' + m.id + '" data-targa="' + esc(m.targa) + '" data-autista="' + esc(m.autista_default||'') + '">' + esc(m.targa) + ' (' + fmtL(m.capacita_totale) + 'L)</option>';
    });
    selAutista.innerHTML = '<option value="">— Seleziona autista —</option>';
  } else {
    // Mezzi del trasportatore
    var trId = vettore;
    selMezzo.innerHTML = '<option value="">— Seleziona mezzo —</option>';
    (window._smistMezziTr||[]).filter(function(m) { return m.trasportatore_id === trId; }).forEach(function(m) {
      selMezzo.innerHTML += '<option value="tr_' + m.id + '" data-targa="' + esc(m.targa) + '">' + esc(m.targa) + ' (' + fmtL(m.capacita_totale) + 'L)</option>';
    });
    // Autisti del trasportatore
    selAutista.innerHTML = '<option value="">— Seleziona autista —</option>';
    (window._smistAutistiTr||[]).filter(function(a) { return a.trasportatore_id === trId; }).forEach(function(a) {
      selAutista.innerHTML += '<option value="' + esc(a.nome) + '">' + esc(a.nome) + '</option>';
    });
    // Se un solo autista, selezionalo
    var autFiltrati = (window._smistAutistiTr||[]).filter(function(a) { return a.trasportatore_id === trId; });
    if (autFiltrati.length === 1) selAutista.value = autFiltrati[0].nome;
  }
  _smistAggiornaRiepilogo();
}

function _smistMezzoChange() {
  var sel = document.getElementById('smist-mezzo');
  if (!sel || !sel.value) return;
  var opt = sel.options[sel.selectedIndex];
  var autista = opt.dataset.autista || '';
  // Per mezzi propri, precompila autista_default
  if (autista) {
    var selA = document.getElementById('smist-autista');
    // Cerca se esiste come option
    var found = false;
    for (var i = 0; i < selA.options.length; i++) {
      if (selA.options[i].value === autista) { selA.selectedIndex = i; found = true; break; }
    }
    if (!found) {
      selA.innerHTML += '<option value="' + esc(autista) + '">' + esc(autista) + '</option>';
      selA.value = autista;
    }
  }
  _smistAggiornaRiepilogo();
}

function _smistAggiungiRiga() {
  _smistRighe++;
  var idx = _smistRighe;
  var o = _smistOrdine;
  var pNetto = Number(o.costo_litro) + 0.018 + 0.045;

  var h = '<div class="smist-riga" data-idx="' + idx + '" style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;padding:12px 14px;position:relative">';
  h += '<div style="position:absolute;top:8px;right:8px"><button onclick="this.closest(\'.smist-riga\').remove();_smistAggiornaRiepilogo()" style="border:none;background:none;cursor:pointer;font-size:14px;color:#A32D2D">x</button></div>';

  // Riga principale: seq + cliente + litri + trasporto + margine + prezzo + totale
  h += '<div style="display:grid;grid-template-columns:36px 2fr 1fr 1fr 1fr 1fr 1fr;gap:8px;align-items:end">';

  // Sequenza
  h += '<div><div style="font-size:10px;color:var(--text-muted)">Seq.</div>';
  h += '<div style="width:32px;height:32px;border-radius:50%;background:#D85A30;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:500">' + idx + '</div></div>';

  // Cliente
  h += '<div><div style="font-size:10px;color:var(--text-muted)">Cliente</div>';
  h += '<select class="smist-cliente" data-idx="' + idx + '" onchange="_smistPrecompila(' + idx + ')" style="width:100%;font-size:13px;padding:7px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">' + window._smistOptsClienti + '</select></div>';

  // Litri
  h += '<div><div style="font-size:10px;color:var(--text-muted)">Litri</div>';
  h += '<input type="number" class="smist-litri" data-idx="' + idx + '" step="100" placeholder="0" oninput="_smistRicalcolaRiga(' + idx + ');_smistAggiornaRiepilogo()" style="width:100%;font-family:var(--font-mono);font-size:14px;font-weight:500;padding:7px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);text-align:right" /></div>';

  // Trasporto
  h += '<div><div style="font-size:10px;color:var(--text-muted)">Trasporto</div>';
  h += '<input type="number" class="smist-trasporto" data-idx="' + idx + '" step="0.001" value="0.018" oninput="_smistRicalcolaRiga(' + idx + ');_smistAggiornaRiepilogo()" style="width:100%;font-family:var(--font-mono);font-size:12px;padding:7px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);text-align:right" /></div>';

  // Margine
  h += '<div><div style="font-size:10px;color:var(--text-muted)">Margine</div>';
  h += '<input type="number" class="smist-margine" data-idx="' + idx + '" step="0.001" value="0.045" oninput="_smistRicalcolaRiga(' + idx + ');_smistAggiornaRiepilogo()" style="width:100%;font-family:var(--font-mono);font-size:12px;padding:7px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);text-align:right" /></div>';

  // Prezzo netto editabile
  h += '<div><div style="font-size:10px;color:var(--text-muted)">Prezzo netto</div>';
  h += '<input type="number" class="smist-prezzo" data-idx="' + idx + '" step="0.001" value="' + pNetto.toFixed(4) + '" oninput="_smistDaPrezzoNetto(' + idx + ')" style="width:100%;font-family:var(--font-mono);font-size:13px;font-weight:500;padding:7px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:#D85A30;text-align:right" /></div>';

  // Totale
  h += '<div><div style="font-size:10px;color:var(--text-muted)">Totale</div>';
  h += '<div class="smist-totale" data-idx="' + idx + '" style="font-family:var(--font-mono);font-size:13px;font-weight:500;padding:7px 0">—</div></div>';

  h += '</div>';

  // Sede scarico (caricata al cambio cliente)
  h += '<div class="smist-sede-wrap" data-idx="' + idx + '" style="padding-left:44px;margin-top:6px;font-size:11px;color:var(--text-muted)"></div>';

  h += '</div>';

  document.getElementById('smist-righe').insertAdjacentHTML('beforeend', h);
}

async function _smistPrecompila(idx) {
  var sel = document.querySelector('.smist-cliente[data-idx="' + idx + '"]');
  if (!sel || !sel.value) return;
  var clienteId = sel.value;
  var clienteNome = sel.options[sel.selectedIndex].dataset.nome;
  var prod = _smistOrdine.prodotto;

  // Precompila trasporto e margine dagli ultimi ordini
  var { data: ultimi } = await sb.from('ordini').select('trasporto_litro,margine')
    .or('cliente_id.eq.' + clienteId + ',cliente.eq.' + clienteNome)
    .eq('prodotto', prod).eq('tipo_ordine','cliente').neq('stato','annullato')
    .gt('margine', 0).order('data',{ascending:false}).limit(5);

  if (ultimi && ultimi.length) {
    var avgTr = ultimi.reduce(function(s, o) { return s + Number(o.trasporto_litro); }, 0) / ultimi.length;
    var avgMg = ultimi.reduce(function(s, o) { return s + Number(o.margine); }, 0) / ultimi.length;
    var trEl = document.querySelector('.smist-trasporto[data-idx="' + idx + '"]');
    var mgEl = document.querySelector('.smist-margine[data-idx="' + idx + '"]');
    if (trEl) trEl.value = avgTr.toFixed(4);
    if (mgEl) mgEl.value = avgMg.toFixed(4);
    _smistRicalcolaRiga(idx);
  }

  // Carica sedi scarico del cliente
  var { data: sedi } = await sb.from('sedi_scarico').select('id,nome,indirizzo,citta,provincia').eq('cliente_id', clienteId);
  var sedeWrap = document.querySelector('.smist-sede-wrap[data-idx="' + idx + '"]');
  if (sedeWrap) {
    if (sedi && sedi.length) {
      var sh = 'Sede scarico: <select class="smist-sede" data-idx="' + idx + '" style="font-size:11px;padding:3px 6px;border:0.5px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)">';
      sedi.forEach(function(s, i) {
        sh += '<option value="' + s.id + '" data-nome="' + esc(s.nome||'') + '"' + (i===0?' selected':'') + '>' + esc((s.nome||'') + (s.indirizzo ? ' — ' + s.indirizzo : '') + (s.citta ? ', ' + s.citta : '') + (s.provincia ? ' (' + s.provincia + ')' : '')) + '</option>';
      });
      sh += '</select>';
      sedeWrap.innerHTML = sh;
    } else {
      sedeWrap.innerHTML = 'Sede scarico: <em>nessuna sede configurata</em>';
    }
  }

  _smistAggiornaRiepilogo();
}

function _smistRicalcolaRiga(idx) {
  var costo = Number(_smistOrdine.costo_litro);
  var tr = parseFloat(document.querySelector('.smist-trasporto[data-idx="' + idx + '"]')?.value) || 0;
  var mg = parseFloat(document.querySelector('.smist-margine[data-idx="' + idx + '"]')?.value) || 0;
  var litri = parseFloat(document.querySelector('.smist-litri[data-idx="' + idx + '"]')?.value) || 0;
  var pNetto = costo + tr + mg;
  var prEl = document.querySelector('.smist-prezzo[data-idx="' + idx + '"]');
  if (prEl) prEl.value = pNetto.toFixed(4);
  var totEl = document.querySelector('.smist-totale[data-idx="' + idx + '"]');
  if (totEl) totEl.textContent = litri > 0 ? fmtE(pNetto * litri) : '—';
}

function _smistDaPrezzoNetto(idx) {
  var costo = Number(_smistOrdine.costo_litro);
  var tr = parseFloat(document.querySelector('.smist-trasporto[data-idx="' + idx + '"]')?.value) || 0;
  var pNetto = parseFloat(document.querySelector('.smist-prezzo[data-idx="' + idx + '"]')?.value) || 0;
  var mg = pNetto - costo - tr;
  var mgEl = document.querySelector('.smist-margine[data-idx="' + idx + '"]');
  if (mgEl) mgEl.value = mg.toFixed(4);
  var litri = parseFloat(document.querySelector('.smist-litri[data-idx="' + idx + '"]')?.value) || 0;
  var totEl = document.querySelector('.smist-totale[data-idx="' + idx + '"]');
  if (totEl) totEl.textContent = litri > 0 ? fmtE(pNetto * litri) : '—';
  _smistAggiornaRiepilogo();
}

function _smistAggiornaRiepilogo() {
  if (!_smistOrdine) return;
  var totLitri = Number(_smistOrdine.litri);
  var assegnati = 0, totFatt = 0, totMarg = 0, nClienti = 0;
  document.querySelectorAll('.smist-riga').forEach(function(riga) {
    var idx = riga.dataset.idx;
    var litri = parseFloat(document.querySelector('.smist-litri[data-idx="' + idx + '"]')?.value) || 0;
    var pNetto = parseFloat(document.querySelector('.smist-prezzo[data-idx="' + idx + '"]')?.value) || 0;
    var mg = parseFloat(document.querySelector('.smist-margine[data-idx="' + idx + '"]')?.value) || 0;
    var cl = document.querySelector('.smist-cliente[data-idx="' + idx + '"]')?.value;
    if (cl && litri > 0) nClienti++;
    assegnati += litri;
    totFatt += pNetto * litri;
    totMarg += mg * litri;
  });
  var residuo = totLitri - assegnati;
  var resColor = residuo > 0 ? '#BA7517' : residuo === 0 ? '#639922' : '#A32D2D';
  var mezzoSel = document.getElementById('smist-mezzo');
  var autistaSel = document.getElementById('smist-autista');
  var autista = autistaSel && autistaSel.value ? autistaSel.value : '—';
  var mezzoTxt = mezzoSel && mezzoSel.selectedIndex > 0 ? mezzoSel.options[mezzoSel.selectedIndex].dataset.targa : '—';
  var vettoreSel = document.getElementById('smist-vettore');
  var vettoreTxt = vettoreSel ? vettoreSel.options[vettoreSel.selectedIndex].text : '—';

  var h = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">';
  h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Litri fornitore</div><div style="font-family:var(--font-mono);font-size:18px;font-weight:500">' + fmtL(totLitri) + '</div></div>';
  h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Assegnati a clienti</div><div style="font-family:var(--font-mono);font-size:18px;font-weight:500;color:#D85A30">' + fmtL(assegnati) + '</div></div>';
  h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Residuo in deposito</div><div style="font-family:var(--font-mono);font-size:18px;font-weight:600;color:' + resColor + '">' + fmtL(residuo) + '</div></div>';
  h += '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Margine totale</div><div style="font-family:var(--font-mono);font-size:18px;font-weight:500;color:#639922">' + fmtE(totMarg) + '</div></div>';
  h += '</div>';
  h += '<div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;font-size:11px;color:var(--text-muted)">';
  h += '<div>Consegne: <span style="font-weight:500;color:var(--text)">' + nClienti + ' clienti</span></div>';
  h += '<div>Vettore: <span style="font-weight:500;color:var(--text)">' + esc(vettoreTxt) + '</span></div>';
  h += '<div>Mezzo: <span style="font-weight:500;color:var(--text)">' + esc(mezzoTxt) + '</span></div>';
  h += '<div>Autista: <span style="font-weight:500;color:var(--text)">' + esc(autista) + '</span></div>';
  h += '</div>';
  if (residuo < 0) h += '<div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:#FCEBEB;color:#A32D2D;font-size:12px;font-weight:500">I litri assegnati superano quelli disponibili!</div>';

  document.getElementById('smist-riepilogo').innerHTML = h;
}

async function confermaSmistamento() {
  if (!_smistOrdine) return;
  var ordine = _smistOrdine;
  var totLitri = Number(ordine.litri);

  // Validazione mezzo/autista
  var mezzoSel = document.getElementById('smist-mezzo');
  var autistaSel = document.getElementById('smist-autista');
  var autista = autistaSel ? autistaSel.value : '';
  var vettoreSel = document.getElementById('smist-vettore');
  var vettoreId = vettoreSel ? vettoreSel.value : 'proprio';
  var dataCarico = document.getElementById('smist-data-carico')?.value || oggiISO;
  var dataConsegna = document.getElementById('smist-data-consegna')?.value || oggiISO;
  if (!mezzoSel || !mezzoSel.value) { toast('Seleziona un mezzo'); return; }
  if (!autista) { toast('Seleziona un autista'); return; }

  var mezzoOpt = mezzoSel.options[mezzoSel.selectedIndex];
  var mezzoId = mezzoSel.value.startsWith('tr_') ? null : mezzoSel.value;
  var mezzoTarga = mezzoOpt.dataset.targa || '';
  var trasportatoreId = vettoreId !== 'proprio' ? vettoreId : null;

  // Raccogli righe
  var righe = [];
  var assegnati = 0;
  var seq = 0;
  document.querySelectorAll('.smist-riga').forEach(function(riga) {
    var idx = riga.dataset.idx;
    var sel = document.querySelector('.smist-cliente[data-idx="' + idx + '"]');
    var clienteId = sel ? sel.value : '';
    var clienteNome = sel && sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].dataset.nome : '';
    var litri = parseFloat(document.querySelector('.smist-litri[data-idx="' + idx + '"]')?.value) || 0;
    var trasporto = parseFloat(document.querySelector('.smist-trasporto[data-idx="' + idx + '"]')?.value) || 0;
    var margine = parseFloat(document.querySelector('.smist-margine[data-idx="' + idx + '"]')?.value) || 0;
    var sedeSel = document.querySelector('.smist-sede[data-idx="' + idx + '"]');
    var sedeId = sedeSel ? sedeSel.value : null;
    var sedeNome = sedeSel && sedeSel.selectedIndex >= 0 ? (sedeSel.options[sedeSel.selectedIndex].dataset.nome || '') : '';
    if (!clienteId || litri <= 0) return;
    seq++;
    assegnati += litri;
    righe.push({ clienteId:clienteId, clienteNome:clienteNome, litri:litri, trasporto:trasporto, margine:margine, seq:seq, sedeId:sedeId, sedeNome:sedeNome });
  });

  if (!righe.length) { toast('Aggiungi almeno un cliente'); return; }
  if (assegnati > totLitri) { toast('Litri assegnati (' + fmtL(assegnati) + ') superano disponibili (' + fmtL(totLitri) + ')!'); return; }
  var residuo = totLitri - assegnati;

  var det = righe.map(function(r) { return r.seq + '. ' + r.clienteNome + ' ' + fmtL(r.litri) + 'L'; }).join('\n');
  if (!confirm('Confermi smistamento?\n\n' + det + (residuo > 0 ? '\nResiduo in deposito: ' + fmtL(residuo) + ' L' : '') + '\n\nMezzo: ' + mezzoTarga + ' — Autista: ' + autista + '\n\nVerranno creati: ' + righe.length + ' ordini + DAS + carico.')) return;

  toast('Smistamento in corso...');

  // 1. Trova cisterna
  var cisterna = await _trovaCisternaPerProdotto(ordine.prodotto);
  var livelloAtt = cisterna ? Number(cisterna.livello_attuale) : 0;

  // 2. Entrata deposito (tutti i litri)
  if (cisterna) {
    await sb.from('movimenti_cisterne').insert([{ cisterna_id:cisterna.id, ordine_id:ordine.id, tipo:'entrata', litri:totLitri, note:'Smistamento — entrata ' + ordine.fornitore }]);
  }

  // 3. Crea carico
  var caricoRecord = { data:dataConsegna, mezzo_id:mezzoId, mezzo_targa:mezzoTarga, autista:autista, trasportatore_id:trasportatoreId, stato:'programmato', note:'Smistamento da ' + ordine.fornitore + ' ' + fmtL(totLitri) + 'L' };
  var { data: carico } = await sb.from('carichi').insert([caricoRecord]).select().single();

  // 4. Per ogni riga: crea ordine + carico_ordini + uscita deposito
  var ordiniCreati = [];
  for (var i = 0; i < righe.length; i++) {
    var r = righe[i];
    var nuovoOrdine = {
      data: ordine.data,
      cliente: r.clienteNome,
      cliente_id: r.clienteId,
      prodotto: ordine.prodotto,
      litri: r.litri,
      costo_litro: Number(ordine.costo_litro),
      trasporto_litro: r.trasporto,
      margine: r.margine,
      iva: ordine.iva || 22,
      fornitore: 'PhoenixFuel',
      tipo_ordine: 'cliente',
      stato: 'programmato',
      pagato: false,
      note: 'Smistamento da ' + ordine.fornitore + ' del ' + ordine.data,
      smistamento: true,
      ordine_fornitore_id: ordine.id,
      sede_scarico_id: r.sedeId || null,
      sede_scarico_nome: r.sedeNome || null
    };
    var { data: nuovo } = await sb.from('ordini').insert([nuovoOrdine]).select().single();
    if (nuovo) {
      ordiniCreati.push(nuovo);
      // Carico ordine con sequenza
      if (carico) await sb.from('carico_ordini').insert([{ carico_id:carico.id, ordine_id:nuovo.id, sequenza:r.seq }]);
      // Uscita deposito
      if (cisterna) await sb.from('movimenti_cisterne').insert([{ cisterna_id:cisterna.id, ordine_id:nuovo.id, tipo:'uscita', litri:r.litri, note:'Smistamento → ' + r.clienteNome }]);
    }
  }

  // 5. Aggiorna cisterna: solo residuo resta
  if (cisterna) {
    await sb.from('cisterne').update({ livello_attuale: livelloAtt + residuo }).eq('id', cisterna.id);
  }

  // 6. Genera DAS per tutte le consegne
  if (carico && ordiniCreati.length && typeof _generaDasPerCarico === 'function') {
    await _generaDasPerCarico(carico.id, ordiniCreati, mezzoTarga, autista, dataConsegna);
  }

  // 7. Marca ordine fornitore come smistato
  var detNote = righe.map(function(r) { return r.clienteNome + ' ' + fmtL(r.litri) + 'L'; }).join(', ');
  await sb.from('ordini').update({
    caricato_deposito: true,
    stato: 'confermato',
    note: (ordine.note ? ordine.note + ' | ' : '') + 'SMISTATO: ' + detNote + (residuo > 0 ? ' + ' + fmtL(residuo) + 'L deposito' : '')
  }).eq('id', ordine.id);

  // 8. Audit
  _auditLog('smistamento', 'ordini', ordine.fornitore + ' ' + fmtL(totLitri) + 'L ' + ordine.prodotto + ' → ' + righe.length + ' clienti, carico ' + (carico ? carico.id.substring(0,8) : '—'));

  toast('Smistamento completato! ' + righe.length + ' ordini + carico + DAS creati.');
  chiudiModal();
  if (typeof caricaOrdini === 'function') caricaOrdini();
  if (typeof caricaDeposito === 'function') caricaDeposito();
  if (typeof caricaCarichi === 'function') caricaCarichi();
}

async function _trovaCisternaPerProdotto(prodotto) {
  var { data: cist } = await sb.from('cisterne').select('*').eq('sede','deposito_vibo').eq('prodotto', prodotto).order('livello_attuale',{ascending:false}).limit(1);
  return cist && cist.length ? cist[0] : null;
}


// ── Modifica manuale CMP deposito (solo admin) ────────────────────
function _apriModificaCMP(prodNome, cisterneIds, litriTotali, cmpAttuale) {
  var html = '<div style="font-size:16px;font-weight:600;margin-bottom:8px">✏️ Modifica CMP — ' + esc(prodNome) + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">';
  html += 'CMP attuale: <strong style="font-family:var(--font-mono)">€ ' + Number(cmpAttuale).toFixed(6) + '</strong> · ';
  html += 'Giacenza totale: <strong style="font-family:var(--font-mono)">' + fmtL(litriTotali) + '</strong></div>';
  html += '<div style="font-size:12px;color:#A32D2D;background:#FCEBEB;padding:10px 12px;border-radius:8px;margin-bottom:14px">';
  html += '⚠️ Questa operazione modifica il costo medio ponderato su tutte le cisterne del gruppo. ';
  html += 'Usare solo per correggere valori errati.</div>';
  html += '<div class="form-group"><label>Nuovo CMP (€/L)</label>';
  html += '<input type="number" id="cmp-nuovo-val" value="' + Number(cmpAttuale).toFixed(6) + '" step="0.000001" ';
  html += 'style="font-family:var(--font-mono);font-size:18px;font-weight:600;padding:10px 14px;width:100%" /></div>';
  html += '<div style="display:flex;gap:8px;margin-top:16px">';
  html += '<button class="btn-primary" style="flex:1;background:#D85A30;padding:12px" ';
  html += 'onclick="_confermaCMPDeposito(\'' + cisterneIds + '\',\'' + esc(prodNome) + '\')" >💾 Salva nuovo CMP</button>';
  html += '</div>';
  apriModal(html);
}

async function _confermaCMPDeposito(cisterneIdsStr, prodNome) {
  var nuovoCMP = parseFloat(document.getElementById('cmp-nuovo-val').value);
  if (isNaN(nuovoCMP) || nuovoCMP <= 0) { toast('Inserisci un valore valido'); return; }

  var ids = cisterneIdsStr.split(',').filter(Boolean);
  if (!ids.length) { toast('Nessuna cisterna trovata'); return; }

  if (!confirm('Confermi la modifica del CMP di ' + prodNome + ' a € ' + nuovoCMP.toFixed(6) + ' su tutte le ' + ids.length + ' cisterne?\n\nNOTA: questa modifica vale dalla data di oggi in poi. I giorni precedenti mantengono il loro CMP storico.')) return;

  // Leggo prima il CMP attuale e la sede per poterlo registrare nello storico
  var { data: cisternePre } = await sb.from('cisterne').select('id,prodotto,sede,costo_medio,livello_attuale').in('id', ids);
  var cmpPrecedente = cisternePre && cisternePre[0] ? Number(cisternePre[0].costo_medio || 0) : 0;
  var sede = cisternePre && cisternePre[0] ? cisternePre[0].sede : 'deposito_vibo';
  var litriTotali = (cisternePre || []).reduce(function(s, c) { return s + Number(c.livello_attuale || 0); }, 0);

  var ops = ids.map(function(id) {
    return sb.from('cisterne').update({ costo_medio: nuovoCMP, updated_at: new Date().toISOString() }).eq('id', id);
  });
  var results = await Promise.all(ops);
  var err = results.find(function(r){ return r.error; });
  if (err) { toast('Errore: ' + err.error.message); return; }

  // Registra la modifica nello storico CMP con la data di oggi.
  // Questo fix chiude il bug per cui le modifiche manuali non lasciavano traccia
  // e il listino prezzi non poteva risalire al CMP storico di un giorno specifico.
  var oggiISO = new Date().toISOString().split('T')[0];
  try {
    await sb.from('stazione_cmp_storico').insert([{
      data: oggiISO,
      prodotto: prodNome,
      sede: sede,
      cmp_precedente: cmpPrecedente,
      cmp_nuovo: nuovoCMP,
      litri_precedenti: litriTotali,
      litri_caricati: 0,
      costo_carico: nuovoCMP,
      ordine_id: null
    }]);
  } catch(e) {
    console.warn('Impossibile registrare modifica CMP nello storico:', e);
  }

  _auditLog('modifica_cmp_manuale', 'cisterne', 'CMP ' + prodNome + ' modificato da ' + cmpPrecedente.toFixed(6) + ' a ' + nuovoCMP.toFixed(6) + ' (storico aggiornato)');

  toast('✓ CMP ' + prodNome + ' aggiornato a € ' + nuovoCMP.toFixed(6));
  chiudiModale();
  caricaDeposito();
}

// ═══════════════════════════════════════════════════════════════════
// HELPER GLOBALE: restituisce il CMP storico in vigore a una data X
// ═══════════════════════════════════════════════════════════════════
// Legge la tabella stazione_cmp_storico e trova il record con data <= dataISO
// più recente per quel prodotto + sede. Ritorna il cmp_nuovo di quel record.
//
// Logica di fallback:
//   1. Se trova un record storico valido → ritorna cmp_nuovo del record
//   2. Se non trova nulla (prodotto mai storicizzato o data antecedente a
//      qualsiasi record) → ritorna il CMP corrente della cisterna (fallback
//      al comportamento vecchio, nessun peggioramento)
//   3. Se anche la cisterna non esiste → ritorna 0
//
// Cache in memoria per evitare query ripetute nello stesso render del listino:
// la chiave è "prodotto|sede|data" e la cache viene ripulita manualmente
// da caricaPrezzi() quando cambia la data del filtro.
// ═══════════════════════════════════════════════════════════════════
var _cmpStoricoCache = {};

function _cmpStoricoSvuotaCache() {
  _cmpStoricoCache = {};
}

async function _cmpStoricoAllaData(prodotto, sede, dataISO) {
  if (!prodotto || !dataISO) return 0;
  sede = sede || 'deposito_vibo';

  var key = prodotto + '|' + sede + '|' + dataISO;
  if (_cmpStoricoCache[key] !== undefined) return _cmpStoricoCache[key];

  // Cerca il record storico più recente con data <= dataISO
  var { data: records, error } = await sb.from('stazione_cmp_storico')
    .select('cmp_nuovo, data')
    .eq('prodotto', prodotto)
    .eq('sede', sede)
    .lte('data', dataISO)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (!error && records && records.length > 0) {
    var cmp = Number(records[0].cmp_nuovo || 0);
    _cmpStoricoCache[key] = cmp;
    return cmp;
  }

  // Fallback: leggi il CMP corrente dalla tabella cisterne
  // (media ponderata sulle cisterne di quel prodotto e sede)
  var { data: cisterne } = await sb.from('cisterne')
    .select('livello_attuale, costo_medio')
    .eq('prodotto', prodotto)
    .eq('sede', sede);

  if (cisterne && cisterne.length > 0) {
    var totL = cisterne.reduce(function(s, c) { return s + Number(c.livello_attuale || 0); }, 0);
    if (totL > 0) {
      var valTot = cisterne.reduce(function(s, c) {
        return s + Number(c.livello_attuale || 0) * Number(c.costo_medio || 0);
      }, 0);
      var cmpFallback = valTot / totL;
      _cmpStoricoCache[key] = cmpFallback;
      return cmpFallback;
    }
  }

  _cmpStoricoCache[key] = 0;
  return 0;
}

// ── MOVIMENTI DEPOSITO: caricamento con filtri data/mese/anno ──────
var _movCache = [];
var _movBadgeMap = {
  'entrata_deposito': '<span class="badge teal">Entrata</span>',
  'stazione_servizio': '<span class="badge purple">Stazione</span>',
  'autoconsumo': '<span class="badge gray">Autoconsumo</span>'
};

async function caricaMovimentiDeposito(modo) {
  var tbody = document.getElementById('dep-movimenti');
  var countEl = document.getElementById('mov-count');
  if (!tbody) return;

  // Popola dropdown anno se vuoto
  var selAnno = document.getElementById('mov-anno');
  if (selAnno && selAnno.options.length === 0) {
    var annoCorr = new Date().getFullYear();
    for (var y = annoCorr; y >= annoCorr - 3; y--) {
      selAnno.innerHTML += '<option value="' + y + '"' + (y === annoCorr ? ' selected' : '') + '>' + y + '</option>';
    }
  }
  // Pre-compila mese corrente la prima volta
  var selMese = document.getElementById('mov-mese');
  if (selMese && !selMese.value && modo !== 'mese') {
    selMese.value = new Date().getMonth() + 1;
  }

  tbody.innerHTML = '<tr><td colspan="6" class="loading">Caricamento...</td></tr>';

  var query = sb.from('ordini').select('*,basi_carico(nome)')
    .or('tipo_ordine.eq.entrata_deposito,tipo_ordine.eq.stazione_servizio,tipo_ordine.eq.autoconsumo,fornitore.ilike.%phoenix%');

  if (modo === 'data') {
    var dataVal = document.getElementById('mov-data').value;
    if (!dataVal) { modo = 'ultimi'; }
    else {
      query = query.eq('data', dataVal).order('created_at', { ascending: false });
      // Reset altri filtri
      if (selMese) selMese.value = '';
    }
  }

  if (modo === 'mese') {
    var mese = parseInt(document.getElementById('mov-mese').value);
    var anno = parseInt(document.getElementById('mov-anno').value);
    if (!mese || !anno) { modo = 'ultimi'; }
    else {
      var mStr = String(mese).padStart(2, '0');
      var ultGg = new Date(anno, mese, 0).getDate();
      var daISO = anno + '-' + mStr + '-01';
      var aISO = anno + '-' + mStr + '-' + String(ultGg).padStart(2, '0');
      query = query.gte('data', daISO).lte('data', aISO).order('data', { ascending: false }).order('created_at', { ascending: false });
      // Reset data singola
      var dEl = document.getElementById('mov-data');
      if (dEl) dEl.value = '';
    }
  }

  if (modo === 'ultimi') {
    query = query.order('created_at', { ascending: false }).limit(10);
    // Reset filtri
    var dEl2 = document.getElementById('mov-data');
    if (dEl2) dEl2.value = '';
    if (selMese) selMese.value = '';
  }

  var res = await query;
  if (res.error) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Errore: ' + esc(res.error.message) + '</td></tr>';
    if (countEl) countEl.textContent = '';
    return;
  }

  _movCache = res.data || [];
  _movAppliaRicerca();
}

function _movAppliaRicerca() {
  var container = document.getElementById('dep-movimenti');
  var countEl = document.getElementById('mov-count');
  if (!container) return;

  var searchEl = document.getElementById('mov-search');
  var q = searchEl ? (searchEl.value || '').trim().toLowerCase() : '';
  var tipoFiltroEl = document.getElementById('mov-tipo-eu');
  var tipoFiltro = tipoFiltroEl ? tipoFiltroEl.value : 'tutti';

  var filtrati = _movCache;

  // Filtro ricerca libera (prodotto, fornitore, cliente, base)
  if (q) {
    filtrati = filtrati.filter(function(r) {
      var baseNome = r.basi_carico && r.basi_carico.nome ? r.basi_carico.nome : '';
      var haystack = ((r.prodotto || '') + ' ' + (r.fornitore || '') + ' ' + (r.cliente || '') + ' ' + baseNome).toLowerCase();
      return haystack.indexOf(q) >= 0;
    });
  }

  // Split in entrate / uscite
  var entrate = filtrati.filter(function(r) { return r.tipo_ordine === 'entrata_deposito'; });
  var uscite = filtrati.filter(function(r) { return r.tipo_ordine !== 'entrata_deposito'; });

  // Applica filtro visibilità sezioni
  var mostraEntrate = (tipoFiltro !== 'uscite');
  var mostraUscite = (tipoFiltro !== 'entrate');

  container.innerHTML = _movRenderBlocchi(entrate, uscite, mostraEntrate, mostraUscite, 'full');

  if (countEl) {
    var totaleMostrato = (mostraEntrate ? entrate.length : 0) + (mostraUscite ? uscite.length : 0);
    var suffix = '';
    if (q) suffix = ' (ricerca)';
    else if (tipoFiltro !== 'tutti') suffix = ' (' + tipoFiltro + ')';
    countEl.textContent = totaleMostrato + ' movimenti' + suffix;
  }
}

// Renderer condiviso per i due blocchi Entrate/Uscite.
// Usato sia nella card "Movimenti recenti" del deposito che nel pannello dettaglio
// della vista giacenze settimanali. Parametro modo: 'full' (tabella completa) o
// 'compact' (mini-tabella per pannello giornaliero).
function _movRenderBlocchi(entrate, uscite, mostraEntrate, mostraUscite, modo) {
  var compact = modo === 'compact';
  var fontSize = compact ? '11px' : '12px';
  var padCell = compact ? '4px 6px' : '8px 6px';
  var padHdr = compact ? '4px 6px' : '6px 6px';

  // Calcola totali litri
  var totLEntrate = 0, totLUscite = 0;
  entrate.forEach(function(r) { totLEntrate += Number(r.litri || 0); });
  uscite.forEach(function(r) { totLUscite += Number(r.litri || 0); });

  var html = '';

  // ── Blocco ENTRATE ──
  if (mostraEntrate) {
    html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#E1F5EE;border-left:3px solid #1D9E75;border-radius:0 6px 6px 0;margin-bottom:6px">';
    html += '<span style="font-size:13px;font-weight:600;color:#085041">↓ ENTRATE</span>';
    if (entrate.length > 0) {
      html += '<span style="font-size:11px;color:#0F6E56">' + entrate.length + ' movimenti · ' + fmtL(totLEntrate) + '</span>';
    } else {
      html += '<span style="font-size:11px;color:#0F6E56;font-style:italic">Nessun movimento</span>';
    }
    html += '</div>';

    if (entrate.length > 0) {
      html += '<table style="width:100%;border-collapse:collapse;font-size:' + fontSize + ';margin-bottom:' + (mostraUscite ? '14px' : '0') + '">';
      html += '<thead><tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;text-align:left">';
      html += '<th style="padding:' + padHdr + ';font-weight:500">Data</th>';
      html += '<th style="padding:' + padHdr + ';font-weight:500">Prodotto</th>';
      html += '<th style="padding:' + padHdr + ';font-weight:500;text-align:right">Litri</th>';
      html += '<th style="padding:' + padHdr + ';font-weight:500">Fornitore · Base carico</th>';
      html += '<th style="padding:' + padHdr + ';font-weight:500">Stato</th>';
      html += '</tr></thead><tbody>';
      entrate.forEach(function(r) {
        var baseNome = r.basi_carico && r.basi_carico.nome ? r.basi_carico.nome : '';
        var contr = esc(r.fornitore || '—');
        if (baseNome) contr += ' <span style="font-size:10px;color:var(--text-muted)">· ' + esc(baseNome) + '</span>';
        html += '<tr style="border-top:0.5px solid var(--border)">';
        html += '<td style="padding:' + padCell + '">' + fmtD(r.data) + '</td>';
        html += '<td style="padding:' + padCell + '">' + esc(r.prodotto) + '</td>';
        html += '<td style="padding:' + padCell + ';text-align:right;font-family:var(--font-mono)">' + fmtL(r.litri) + '</td>';
        html += '<td style="padding:' + padCell + '">' + contr + '</td>';
        html += '<td style="padding:' + padCell + '">' + badgeStato(r.stato) + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
    }
  }

  // ── Blocco USCITE ──
  if (mostraUscite) {
    html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#FAEEDA;border-left:3px solid #BA7517;border-radius:0 6px 6px 0;margin-bottom:6px' + (mostraEntrate && entrate.length === 0 ? ';margin-top:10px' : '') + '">';
    html += '<span style="font-size:13px;font-weight:600;color:#633806">↑ USCITE</span>';
    if (uscite.length > 0) {
      html += '<span style="font-size:11px;color:#854F0B">' + uscite.length + ' movimenti · ' + fmtL(totLUscite) + '</span>';
    } else {
      html += '<span style="font-size:11px;color:#854F0B;font-style:italic">Nessun movimento</span>';
    }
    html += '</div>';

    if (uscite.length > 0) {
      html += '<table style="width:100%;border-collapse:collapse;font-size:' + fontSize + '">';
      html += '<thead><tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;text-align:left">';
      html += '<th style="padding:' + padHdr + ';font-weight:500">Data</th>';
      html += '<th style="padding:' + padHdr + ';font-weight:500">Tipo</th>';
      html += '<th style="padding:' + padHdr + ';font-weight:500">Prodotto</th>';
      html += '<th style="padding:' + padHdr + ';font-weight:500;text-align:right">Litri</th>';
      html += '<th style="padding:' + padHdr + ';font-weight:500">Cliente</th>';
      html += '<th style="padding:' + padHdr + ';font-weight:500">Stato</th>';
      html += '</tr></thead><tbody>';
      uscite.forEach(function(r) {
        var badge = _movBadgeMap[r.tipo_ordine] || '<span class="badge amber">Uscita</span>';
        var contr = esc(r.cliente || r.fornitore || '—');
        html += '<tr style="border-top:0.5px solid var(--border)">';
        html += '<td style="padding:' + padCell + '">' + fmtD(r.data) + '</td>';
        html += '<td style="padding:' + padCell + '">' + badge + '</td>';
        html += '<td style="padding:' + padCell + '">' + esc(r.prodotto) + '</td>';
        html += '<td style="padding:' + padCell + ';text-align:right;font-family:var(--font-mono)">' + fmtL(r.litri) + '</td>';
        html += '<td style="padding:' + padCell + '">' + contr + '</td>';
        html += '<td style="padding:' + padCell + '">' + badgeStato(r.stato) + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
    }
  }

  // Se tutto è filtrato via (nessun blocco visibile e nessun dato)
  if (!mostraEntrate && !mostraUscite) {
    html = '<div class="loading" style="padding:20px;text-align:center">Nessun filtro selezionato</div>';
  } else if (entrate.length === 0 && uscite.length === 0 && mostraEntrate && mostraUscite) {
    html = '<div class="loading" style="padding:20px;text-align:center">Nessun movimento per i filtri selezionati</div>';
  }

  return html;
}

// ── ANNULLA OPERAZIONE DEPOSITO (scarico o carico) ─────────────────
// Compensativo: non modifica il CMP, inserisce un movimento inverso.
// Azzera cisterna_id/caricato_deposito sull'ordine e lo riporta a 'in attesa'.
async function annullaOperazioneDeposito(ordineId, tipoOperazione) {
  var { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) { toast('Ordine non trovato'); return; }

  var msgOp, movCompensativo, nuovoStato;
  if (tipoOperazione === 'uscita') {
    if (!ordine.cisterna_id) { toast('Ordine non risulta scaricato da alcuna cisterna'); return; }
    msgOp = 'Vuoi annullare lo scarico di ' + fmtL(ordine.litri) + ' ' + esc(ordine.prodotto) + ' per ' + esc(ordine.cliente || ordine.fornitore) + '?\n\nI litri verranno ripristinati sulla cisterna (movimento compensativo, CMP invariato).\nL\'ordine tornerà allo stato "in attesa".\n\nContinuare?';
    movCompensativo = 'entrata'; // reinserisco i litri
    nuovoStato = 'in attesa';
  } else if (tipoOperazione === 'entrata') {
    if (!ordine.caricato_deposito) { toast('Ordine non risulta caricato'); return; }
    msgOp = 'Vuoi annullare il carico di ' + fmtL(ordine.litri) + ' ' + esc(ordine.prodotto) + ' da ' + esc(ordine.fornitore) + '?\n\nI litri verranno rimossi dalle cisterne caricate (movimento compensativo, CMP invariato).\nL\'ordine tornerà allo stato "in attesa".\n\nContinuare?';
    movCompensativo = 'uscita';
    nuovoStato = 'in attesa';
  } else {
    toast('Tipo operazione non riconosciuto'); return;
  }

  if (!confirm(msgOp)) return;

  try {
    if (tipoOperazione === 'uscita') {
      // Reinserisco i litri sulla cisterna scaricata
      var { data: cis } = await sb.from('cisterne').select('*').eq('id', ordine.cisterna_id).single();
      if (!cis) { toast('Cisterna originale non trovata'); return; }
      var nuovoLiv = Number(cis.livello_attuale) + Number(ordine.litri);
      // Attenzione: potrebbe superare capacita_max se nel frattempo è stata caricata. Avviso ma procedo.
      if (cis.capacita_max && nuovoLiv > Number(cis.capacita_max)) {
        if (!confirm('⚠ Il ripristino porterebbe la cisterna sopra la capacità massima (' + fmtL(nuovoLiv) + ' > ' + fmtL(cis.capacita_max) + '). Procedere comunque?')) return;
      }
      await sb.from('cisterne').update({ livello_attuale: nuovoLiv, updated_at: new Date().toISOString() }).eq('id', cis.id);
      await sb.from('movimenti_cisterne').insert([{
        cisterna_id: cis.id, ordine_id: ordineId, tipo: 'entrata',
        litri: Number(ordine.litri),
        data: new Date().toISOString().split('T')[0],
        note: 'Compensativo: annullamento scarico ordine'
      }]);
      await sb.from('ordini').update({ stato: nuovoStato, cisterna_id: null }).eq('id', ordineId);
    } else {
      // Annullamento carico: trovo tutti i movimenti 'entrata' di questo ordine e inverto ciascuno
      var { data: movimenti } = await sb.from('movimenti_cisterne').select('*').eq('ordine_id', ordineId).eq('tipo', 'entrata');
      if (!movimenti || !movimenti.length) { toast('Nessun movimento di carico trovato per questo ordine'); return; }
      for (var i = 0; i < movimenti.length; i++) {
        var m = movimenti[i];
        // Salto quelli che sono già compensativi o potrebbero creare loop
        if (m.note && m.note.indexOf('Compensativo') >= 0) continue;
        var { data: cisEntr } = await sb.from('cisterne').select('*').eq('id', m.cisterna_id).single();
        if (!cisEntr) continue;
        var nLiv = Math.max(0, Number(cisEntr.livello_attuale) - Number(m.litri));
        await sb.from('cisterne').update({ livello_attuale: nLiv, updated_at: new Date().toISOString() }).eq('id', m.cisterna_id);
        await sb.from('movimenti_cisterne').insert([{
          cisterna_id: m.cisterna_id, ordine_id: ordineId, tipo: 'uscita',
          litri: Number(m.litri),
          data: new Date().toISOString().split('T')[0],
          note: 'Compensativo: annullamento carico ordine'
        }]);
      }
      await sb.from('ordini').update({ stato: nuovoStato, caricato_deposito: false }).eq('id', ordineId);
    }

    _auditLog('annulla_' + tipoOperazione + '_deposito', 'ordini', 'Annullato ' + tipoOperazione + ' ordine ' + ordineId + ' (' + fmtL(ordine.litri) + ' ' + ordine.prodotto + ')');
    toast('✓ Operazione annullata. Ordine tornato in attesa.');
    caricaDeposito();
    caricaOrdini();
  } catch (e) {
    console.error('annullaOperazioneDeposito:', e);
    toast('Errore durante l\'annullamento: ' + (e.message || e));
  }
}

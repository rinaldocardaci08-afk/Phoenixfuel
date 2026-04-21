// PhoenixFuel — Consegne, Vendite, Clienti, Fornitori, Basi, Prodotti
// ── CONSEGNE ─────────────────────────────────────────────────────
async function caricaConsegne() {
  var filtroEl = document.getElementById('filtro-data-consegne');
  if (!filtroEl.value) filtroEl.value = oggiISO;
  _labelGiorno('filtro-data-consegne');
  const dataFiltro = filtroEl.value;

  const { data } = await sb.from('ordini').select('*').eq('data', dataFiltro).neq('stato','annullato').order('cliente');
  const tbody = document.getElementById('tabella-consegne');

  if (!data||!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Nessun ordine per questa data</td></tr>';
    ['tot-consegne','tot-completate','tot-inattesa','tot-programmati','tot-litri-cons','tot-fatt-netto-cons','tot-fatt-iva-cons','tot-margine-cons'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent='0'; });
  } else {
    const consegnabili = data.filter(r=>r.tipo_ordine==='cliente' || r.tipo_ordine==='stazione_servizio' || r.tipo_ordine==='entrata_deposito');
    document.getElementById('tot-consegne').textContent = consegnabili.length;
    document.getElementById('tot-completate').textContent = consegnabili.filter(r=>r.stato==='confermato').length;
    document.getElementById('tot-inattesa').textContent = consegnabili.filter(r=>r.stato==='in attesa').length;
    document.getElementById('tot-programmati').textContent = consegnabili.filter(r=>r.stato==='programmato').length;
    // KPI aggiuntivi
    let tLitri=0, tNetto=0, tIva=0, tMargine=0;
    consegnabili.forEach(r => { const l=Number(r.litri); tLitri+=l; tNetto+=prezzoNoIva(r)*l; tIva+=prezzoConIva(r)*l; tMargine+=Number(r.margine)*l; });
    const elL=document.getElementById('tot-litri-cons'); if(elL) elL.textContent=fmtL(tLitri);
    const elN=document.getElementById('tot-fatt-netto-cons'); if(elN) elN.textContent=fmtE(tNetto);
    const elI=document.getElementById('tot-fatt-iva-cons'); if(elI) elI.textContent=fmtE(tIva);
    const elM=document.getElementById('tot-margine-cons'); if(elM) elM.innerHTML=fmtMe(tMargine);

    // Render consegne con semafori DAS/Cartellino
    tbody.innerHTML = data.filter(r=>r.tipo_ordine==='cliente' || r.tipo_ordine==='stazione_servizio' || r.tipo_ordine==='entrata_deposito').map(r => {
      const tot = prezzoConIva(r) * Number(r.litri);

      // Semafori DAS firmato e Cartellino
      var hasDas = !!r.das_firmato_url;
      var hasCart = !!r.cartellino_url;
      var dasSemaforo = hasDas
        ? '<div style="text-align:center"><div style="display:flex;align-items:center;gap:3px;justify-content:center"><div style="width:9px;height:9px;border-radius:50%;background:#639922"></div><span style="font-size:9px;color:#27500A;font-weight:500">Allegato</span></div><a href="' + esc(r.das_firmato_url) + '" target="_blank" style="font-size:9px;color:#639922;text-decoration:none">Apri</a></div>'
        : '<div style="text-align:center"><div style="display:flex;align-items:center;gap:3px;justify-content:center"><div style="width:9px;height:9px;border-radius:50%;background:#E24B4A"></div><span style="font-size:9px;color:#791F1F;font-weight:500">Mancante</span></div><button style="font-size:9px;padding:2px 8px;background:#FCEBEB;color:#791F1F;border:0.5px solid #F09595;border-radius:5px;cursor:pointer" onclick="allegaDocConsegna(\'' + r.id + '\',\'das_firmato\')">Allega</button></div>';
      var cartSemaforo = hasCart
        ? '<div style="text-align:center"><div style="display:flex;align-items:center;gap:3px;justify-content:center"><div style="width:9px;height:9px;border-radius:50%;background:#639922"></div><span style="font-size:9px;color:#27500A;font-weight:500">Allegato</span></div><a href="' + esc(r.cartellino_url) + '" target="_blank" style="font-size:9px;color:#639922;text-decoration:none">Apri</a></div>'
        : '<div style="text-align:center"><div style="display:flex;align-items:center;gap:3px;justify-content:center"><div style="width:9px;height:9px;border-radius:50%;background:#E24B4A"></div><span style="font-size:9px;color:#791F1F;font-weight:500">Mancante</span></div><button style="font-size:9px;padding:2px 8px;background:#FCEBEB;color:#791F1F;border:0.5px solid #F09595;border-radius:5px;cursor:pointer" onclick="allegaDocConsegna(\'' + r.id + '\',\'cartellino\')">Allega</button></div>';

      // Azioni in base al tipo ordine
      let azioniHtml = '';
      if (r.tipo_ordine === 'entrata_deposito' && !r.caricato_deposito && r.stato !== 'annullato') {
        azioniHtml += '<button class="btn-primary" style="font-size:10px;padding:3px 8px;background:#639922" onclick="apriModaleAssegnaCisterna(\'' + r.id + '\')">📦 Carica</button> ';
      } else if (r.stato === 'in attesa' || r.stato === 'programmato') {
        azioniHtml += '<button class="btn-primary" style="font-size:10px;padding:3px 8px" title="Conferma ordine (scarica cisterna)" onclick="confermaOrdineConsegna(\'' + r.id + '\')">✅</button> ';
      } else if (r.stato === 'consegnato') {
        azioniHtml += '<button class="btn-edit" style="color:#D85A30" title="Annulla consegna (rimuove DAS firmato)" onclick="annullaConsegnaOrdine(\'' + r.id + '\')">↩️</button> ';
      }
      azioniHtml += '<button class="btn-edit" title="Conferma ordine PDF" onclick="apriConfermaOrdine(\'' + r.id + '\')">📄</button>';
      azioniHtml += '<button class="btn-edit" title="DAS" onclick="mostraDasOrdine(\'' + r.id + '\')">🚛</button>';
      if (r.stato !== 'consegnato' && r.stato !== 'annullato'
          && !(r.tipo_ordine === 'entrata_deposito' && r.caricato_deposito === true)) {
        azioniHtml += '<button style="font-size:10px;padding:3px 10px;background:#D85A30;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:500" onclick="apriDirottamento(\'' + r.id + '\',null)">Dirotta</button>';
      }

      return '<tr><td><strong>' + esc(r.cliente) + '</strong> ' + (r.tipo_ordine !== 'cliente' ? badgeStato(r.tipo_ordine) : '') + (r.destinazione ? '<div style="font-size:10px;color:#6B5FCC">📍 ' + esc(r.destinazione) + '</div>' : '') + '</td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td><td>' + badgeStato(r.stato, r) + '</td><td>' + dasSemaforo + '</td><td>' + cartSemaforo + '</td><td>' + azioniHtml + '</td></tr>';
    }).join('');
  }

  // Ordini non processati (in attesa, qualsiasi data passata o oggi)
  await caricaNonProcessati();
}

async function confermaOrdineConsegna(ordineId) {
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) { toast('Ordine non trovato'); return; }
  if (!confirm('Confermare la consegna di ' + fmtL(ordine.litri) + ' di ' + ordine.prodotto + ' a ' + ordine.cliente + '?')) return;

  // Se l'ordine ha già il DAS firmato allegato → va direttamente a 'consegnato' (fatturabile)
  // Altrimenti → 'confermato' (scaricato dalla cisterna ma in attesa del DAS per la fatturazione)
  var nuovoStato = ordine.das_firmato_url ? 'consegnato' : 'confermato';

  if (ordine.cisterna_id) {
    // Già scaricato dal deposito, solo cambio stato
    await sb.from('ordini').update({ stato: nuovoStato }).eq('id', ordineId);
  } else if (ordine.fornitore && ordine.fornitore.toLowerCase().includes('phoenix')) {
    // Deve ancora scaricare la cisterna → confermaUscitaDeposito fa tutto
    await confermaUscitaDeposito(ordineId, true);
    // Se dopo lo scarico c'è già il DAS firmato, alziamo lo stato a consegnato
    if (nuovoStato === 'consegnato') {
      await sb.from('ordini').update({ stato: 'consegnato' }).eq('id', ordineId);
    }
  } else {
    // Ordine con fornitore esterno (triangolazione), solo cambio stato
    await sb.from('ordini').update({ stato: nuovoStato }).eq('id', ordineId);
  }
  toast(nuovoStato === 'consegnato' ? '✅ Ordine consegnato (DAS presente)' : '✅ Ordine confermato');
  caricaConsegne();
}

// ══════════════════════════════════════════════════════════════════
// Annulla consegna: rimuove DAS e Cartellino dallo Storage e dal DB,
// riporta l'ordine a stato 'confermato' (non più fatturabile fino a
// quando non viene ricaricato un nuovo DAS firmato).
// ══════════════════════════════════════════════════════════════════
async function annullaConsegnaOrdine(ordineId) {
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) { toast('Ordine non trovato'); return; }
  if (ordine.stato !== 'consegnato') { toast('L\'ordine non è in stato consegnato'); return; }

  if (!confirm('Annullare la consegna?\n\nVerranno rimossi:\n• DAS firmato\n• Cartellino (se presente)\n\nL\'ordine tornerà in stato \'confermato\' e non sarà più fatturabile finché non carichi un nuovo DAS firmato.\n\nContinuare?')) return;

  // Rimuovi file DAS firmato dallo Storage (se presente)
  if (ordine.das_firmato_url) {
    try {
      var m = ordine.das_firmato_url.match(/\/Das\/(.+)$/);
      if (m && m[1]) await sb.storage.from('Das').remove([decodeURIComponent(m[1])]);
    } catch(e) { console.warn('Errore rimozione file DAS:', e); }
  }
  // Rimuovi file Cartellino dallo Storage (se presente)
  if (ordine.cartellino_url) {
    try {
      var m2 = ordine.cartellino_url.match(/\/Das\/(.+)$/);
      if (m2 && m2[1]) await sb.storage.from('Das').remove([decodeURIComponent(m2[1])]);
    } catch(e) { console.warn('Errore rimozione file Cartellino:', e); }
  }

  // Azzera colonne DB e riporta a stato 'confermato'
  var { error } = await sb.from('ordini').update({
    stato: 'confermato',
    das_firmato_url: null,
    das_firmato_nome: null,
    cartellino_url: null,
    cartellino_nome: null
  }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }

  if (typeof _auditLog === 'function') _auditLog('annulla_consegna', 'ordini', 'Annullata consegna ordine ' + ordineId + ' — ' + ordine.cliente);
  toast('↩️ Consegna annullata. Ricarica il DAS firmato per completare nuovamente.');
  caricaConsegne();
}

async function caricaNonProcessati() {
  const { data: ordini } = await sb.from('ordini').select('*').eq('stato', 'in attesa').lte('data', oggiISO).order('data',{ascending:true}).order('cliente');
  const tbody = document.getElementById('tabella-non-processati');
  if (!ordini || !ordini.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun ordine in attesa</td></tr>';
    return;
  }
  tbody.innerHTML = ordini.map(r => {
    const tot = prezzoConIva(r) * Number(r.litri);
    const isPassato = r.data < oggiISO;
    const rowStyle = isPassato ? 'background:#FCEBEB' : '';
    return '<tr style="' + rowStyle + '"><td>' + r.data + (isPassato ? ' <span style="font-size:9px;color:#A32D2D;font-weight:500">SCADUTO</span>' : '') + '</td><td><strong>' + esc(r.cliente) + '</strong></td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td><td style="white-space:nowrap">' +
      '<button class="btn-edit" title="Riprogramma data" onclick="riprogrammaOrdine(\'' + r.id + '\')">📅</button>' +
      '<button class="btn-danger" title="Annulla ordine" onclick="annullaOrdine(\'' + r.id + '\')">x</button>' +
      '</td></tr>';
  }).join('');
}

async function riprogrammaOrdine(ordineId) {
  const nuovaData = prompt('Inserisci la nuova data di consegna (formato: AAAA-MM-GG):');
  if (!nuovaData) return;
  // Valida formato data
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nuovaData)) { toast('Formato data non valido. Usa AAAA-MM-GG'); return; }
  const { data: ordine } = await sb.from('ordini').select('giorni_pagamento').eq('id', ordineId).single();
  const ggPag = ordine ? ordine.giorni_pagamento || 30 : 30;
  const dataScad = new Date(nuovaData);
  dataScad.setDate(dataScad.getDate() + ggPag);
  const { error } = await sb.from('ordini').update({ data: nuovaData, data_scadenza: dataScad.toISOString().split('T')[0] }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Ordine riprogrammato al ' + nuovaData);
  caricaConsegne();
}

async function annullaOrdine(ordineId) {
  if (!confirm('Sei sicuro di voler annullare questo ordine? L\'operazione non è reversibile.')) return;
  const { error } = await sb.from('ordini').update({ stato: 'annullato' }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Ordine annullato');
  caricaConsegne();
}

// ══════════════════════════════════════════════════════════════════
// ALLEGA DAS FIRMATO / CARTELLINO
// ══════════════════════════════════════════════════════════════════

function allegaDocConsegna(ordineId, tipoDoc) {
  var label = tipoDoc === 'das_firmato' ? 'DAS firmato' : 'Cartellino';
  var html = '<div style="font-size:16px;font-weight:600;margin-bottom:12px">📎 Allega ' + label + '</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Scatta una foto o carica un file PDF del ' + label + ' firmato dal cliente.</div>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
  html += '<button class="btn-primary" style="font-size:14px;padding:10px 20px;background:#378ADD" onclick="document.getElementById(\'doc-cons-file\').click()">📁 Scegli file</button>';
  html += '<input type="file" id="doc-cons-file" accept="image/*,.pdf" style="display:none" onchange="_uploadDocConsegna(\'' + ordineId + '\',\'' + tipoDoc + '\',this)" />';
  html += '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted)">oppure incolla un URL:</div>';
  html += '<div style="display:flex;gap:8px;margin-top:6px">';
  html += '<input type="text" id="doc-cons-url" placeholder="https://..." style="flex:1;font-size:13px;padding:8px 12px" />';
  html += '<button class="btn-primary" style="padding:8px 16px" onclick="_salvaUrlDocConsegna(\'' + ordineId + '\',\'' + tipoDoc + '\')">Salva</button>';
  html += '</div>';
  apriModal(html);
}

async function _uploadDocConsegna(ordineId, tipoDoc, input) {
  var file = input.files[0]; if (!file) return;
  toast('Caricamento in corso...');
  var path = 'consegne/' + ordineId + '/' + tipoDoc + '_' + Date.now() + '_' + file.name;
  var { error } = await sb.storage.from('Das').upload(path, file);
  if (error) { toast('Errore upload: ' + error.message); return; }
  var url = SUPABASE_URL + '/storage/v1/object/public/Das/' + path;
  var update = {};
  update[tipoDoc + '_url'] = url;
  update[tipoDoc + '_nome'] = file.name;
  await sb.from('ordini').update(update).eq('id', ordineId);
  // Se è il DAS firmato → aggiorna stato ordine a consegnato
  if (tipoDoc === 'das_firmato') { await _aggiornaStatoConsegnato(ordineId); }
  toast('✅ ' + (tipoDoc === 'das_firmato' ? 'DAS firmato' : 'Cartellino') + ' allegato!');
  chiudiModalePermessi();
  caricaConsegne();
}

async function _salvaUrlDocConsegna(ordineId, tipoDoc) {
  var url = document.getElementById('doc-cons-url').value.trim();
  if (!url) { toast('Inserisci un URL'); return; }
  var update = {};
  update[tipoDoc + '_url'] = url;
  update[tipoDoc + '_nome'] = tipoDoc === 'das_firmato' ? 'DAS firmato' : 'Cartellino';
  await sb.from('ordini').update(update).eq('id', ordineId);
  // Se è il DAS firmato → aggiorna stato ordine a consegnato
  if (tipoDoc === 'das_firmato') { await _aggiornaStatoConsegnato(ordineId); }
  toast('✅ URL salvato!');
  chiudiModalePermessi();
  caricaConsegne();
}

// ══════════════════════════════════════════════════════════════════
// STORICO CONSEGNE
// ══════════════════════════════════════════════════════════════════

function toggleStoricoConsegne() {
  var body = document.getElementById('storico-consegne-body');
  var toggle = document.getElementById('storico-consegne-toggle');
  if (body.style.display === 'none') {
    body.style.display = '';
    toggle.textContent = '▲ Chiudi';
    _initAnnoConsegne();
  } else {
    body.style.display = 'none';
    toggle.textContent = '▼ Espandi';
  }
}

function _initAnnoConsegne() {
  var sel = document.getElementById('filtro-anno-consegne');
  if (!sel || sel.options.length > 1) return;
  var ac = new Date().getFullYear();
  for (var y = ac; y >= ac - 5; y--) sel.innerHTML += '<option value="' + y + '">' + y + '</option>';
}

function _setMeseAnnoConsegne() {
  var anno = document.getElementById('filtro-anno-consegne').value;
  var mese = document.getElementById('filtro-mese-consegne').value;
  if (anno && mese) {
    var ultimo = new Date(parseInt(anno), parseInt(mese), 0).getDate();
    document.getElementById('filtro-da-consegne').value = anno + '-' + mese + '-01';
    document.getElementById('filtro-a-consegne').value = anno + '-' + mese + '-' + String(ultimo).padStart(2,'0');
    caricaStoricoConsegne();
  } else if (anno) {
    document.getElementById('filtro-da-consegne').value = anno + '-01-01';
    document.getElementById('filtro-a-consegne').value = anno + '-12-31';
    caricaStoricoConsegne();
  }
}

async function caricaStoricoConsegne() {
  var da = document.getElementById('filtro-da-consegne').value;
  var a = document.getElementById('filtro-a-consegne').value;
  var tbody = document.getElementById('tabella-storico-consegne');
  if (!da && !a) {
    var oggi = new Date(); var meseFA = new Date(oggi); meseFA.setMonth(meseFA.getMonth()-1);
    da = meseFA.toISOString().split('T')[0]; a = oggi.toISOString().split('T')[0];
    document.getElementById('filtro-da-consegne').value = da;
    document.getElementById('filtro-a-consegne').value = a;
  }
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Caricamento...</td></tr>';
  var q = sb.from('ordini').select('*').in('tipo_ordine',['cliente','stazione_servizio']).neq('stato','annullato').order('data',{ascending:false}).order('cliente');
  if (da) q = q.gte('data', da);
  if (a) q = q.lte('data', a);
  q = q.limit(1000);
  var { data: ordini } = await q;
  if (!ordini||!ordini.length) { tbody.innerHTML = '<tr><td colspan="8" class="loading">Nessuna consegna nel periodo</td></tr>'; return; }
  window._storicoConsegneData = ordini;
  filtraStoricoConsegne();
}

function filtraStoricoConsegne() {
  var ordini = window._storicoConsegneData || [];
  var qTxt = (document.getElementById('search-consegne').value||'').toLowerCase();
  var filtroDoc = document.getElementById('filtro-docs-consegne').value;
  var filtrati = ordini.filter(function(r) {
    if (qTxt && (r.cliente||'').toLowerCase().indexOf(qTxt) < 0) return false;
    if (filtroDoc === 'manca_das' && r.das_firmato_url) return false;
    if (filtroDoc === 'manca_cart' && r.cartellino_url) return false;
    if (filtroDoc === 'completo' && (!r.das_firmato_url || !r.cartellino_url)) return false;
    return true;
  });
  var tbody = document.getElementById('tabella-storico-consegne');
  if (!filtrati.length) { tbody.innerHTML = '<tr><td colspan="8" class="loading">Nessuna consegna con questi filtri</td></tr>'; return; }
  tbody.innerHTML = filtrati.map(function(r) {
    var tot = prezzoConIva(r) * Number(r.litri);
    var dasIco = r.das_firmato_url ? '<div style="width:10px;height:10px;border-radius:50%;background:#639922;display:inline-block"></div> <span style="font-size:9px;color:#27500A">OK</span>' : '<div style="width:10px;height:10px;border-radius:50%;background:#E24B4A;display:inline-block"></div> <span style="font-size:9px;color:#791F1F">No</span>';
    var cartIco = r.cartellino_url ? '<div style="width:10px;height:10px;border-radius:50%;background:#639922;display:inline-block"></div> <span style="font-size:9px;color:#27500A">OK</span>' : '<div style="width:10px;height:10px;border-radius:50%;background:#E24B4A;display:inline-block"></div> <span style="font-size:9px;color:#791F1F">No</span>';
    return '<tr><td>' + fmtD(r.data) + '</td><td><strong>' + esc(r.cliente) + '</strong>' + (r.destinazione ? '<div style="font-size:9px;color:var(--text-muted)">📍 ' + esc(r.destinazione) + '</div>' : '') + '</td><td>' + esc(r.prodotto) + '</td><td class="m">' + fmtL(r.litri) + '</td><td class="m">' + fmtE(tot) + '</td><td>' + badgeStato(r.stato, r) + '</td><td style="text-align:center">' + dasIco + '</td><td style="text-align:center">' + cartIco + '</td></tr>';
  }).join('');
}

function stampaStoricoConsegne() {
  var w = _apriReport("Storico consegne"); if (!w) return;
  var ordini = window._storicoConsegneData || [];
  var qTxt = (document.getElementById('search-consegne').value||'').toLowerCase();
  var filtroDoc = document.getElementById('filtro-docs-consegne').value;
  var filtrati = ordini.filter(function(r) {
    if (qTxt && (r.cliente||'').toLowerCase().indexOf(qTxt) < 0) return false;
    if (filtroDoc === 'manca_das' && r.das_firmato_url) return false;
    if (filtroDoc === 'manca_cart' && r.cartellino_url) return false;
    if (filtroDoc === 'completo' && (!r.das_firmato_url || !r.cartellino_url)) return false;
    return true;
  });
  if (!filtrati.length) { toast('Nessuna consegna da stampare'); return; }

  var da = document.getElementById('filtro-da-consegne').value;
  var a = document.getElementById('filtro-a-consegne').value;
  var periodoFmt = 'Dal ' + new Date(da+'T12:00:00').toLocaleDateString('it-IT') + ' al ' + new Date(a+'T12:00:00').toLocaleDateString('it-IT');

  var totL=0, totF=0, totM=0, totDas=0, totCart=0;
  filtrati.forEach(function(r) { totL+=Number(r.litri); totF+=prezzoConIva(r)*Number(r.litri); totM+=Number(r.margine)*Number(r.litri); if(r.das_firmato_url) totDas++; if(r.cartellino_url) totCart++; });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Storico consegne</title>';
  html += '<style>body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:10mm;color:#1a1a18}@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}table{width:100%;border-collapse:collapse}th{background:#D85A30;color:#fff;padding:5px 6px;font-size:8px;text-transform:uppercase;border:1px solid #993C1D}td{padding:5px 6px;border:1px solid #ddd;font-size:10px}.m{font-family:Courier New,monospace;text-align:right}.sem{display:inline-block;width:10px;height:10px;border-radius:50%}</style></head><body>';

  html += '<div style="display:flex;justify-content:space-between;border-bottom:3px solid #D85A30;padding-bottom:8px;margin-bottom:10px"><div><div style="font-size:18px;font-weight:bold;color:#D85A30">STORICO CONSEGNE</div><div style="font-size:11px;color:#666;margin-top:2px">' + periodoFmt + '</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:bold">PHOENIX FUEL SRL</div><div style="font-size:9px;color:#666">Generato: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">';
  html += '<div style="background:#FAECE7;border:1px solid #D85A30;border-radius:6px;padding:6px 14px;text-align:center"><div style="font-size:8px;color:#712B13;text-transform:uppercase">Consegne</div><div style="font-size:16px;font-weight:bold">' + filtrati.length + '</div></div>';
  html += '<div style="background:#FAECE7;border:1px solid #D85A30;border-radius:6px;padding:6px 14px;text-align:center"><div style="font-size:8px;color:#712B13;text-transform:uppercase">Litri</div><div style="font-size:16px;font-weight:bold;font-family:Courier New,monospace">' + fmtL(totL) + '</div></div>';
  html += '<div style="background:#EAF3DE;border:1px solid #639922;border-radius:6px;padding:6px 14px;text-align:center"><div style="font-size:8px;color:#27500A;text-transform:uppercase">DAS firmati</div><div style="font-size:16px;font-weight:bold;color:' + (totDas===filtrati.length?'#639922':'#E24B4A') + '">' + totDas + '/' + filtrati.length + '</div></div>';
  html += '<div style="background:#EAF3DE;border:1px solid #639922;border-radius:6px;padding:6px 14px;text-align:center"><div style="font-size:8px;color:#27500A;text-transform:uppercase">Cartellini</div><div style="font-size:16px;font-weight:bold;color:' + (totCart===filtrati.length?'#639922':'#E24B4A') + '">' + totCart + '/' + filtrati.length + '</div></div>';
  html += '</div>';

  html += '<table><thead><tr><th>#</th><th>Data</th><th style="text-align:left">Cliente</th><th style="text-align:left">Destinazione</th><th>Prodotto</th><th>Litri</th><th>Totale IVA</th><th>Stato</th><th>DAS firmato</th><th>Cartellino</th></tr></thead><tbody>';
  filtrati.forEach(function(r, i) {
    var tot = prezzoConIva(r) * Number(r.litri);
    var dasC = r.das_firmato_url ? '#639922' : '#E24B4A';
    var cartC = r.cartellino_url ? '#639922' : '#E24B4A';
    html += '<tr' + (i%2 ? ' style="background:#fafaf5"' : '') + '><td style="text-align:center;color:#999">' + (i+1) + '</td><td>' + fmtD(r.data) + '</td><td style="font-weight:500">' + esc(r.cliente) + '</td><td style="font-size:9px;color:#555">' + esc(r.destinazione||'—') + '</td><td>' + esc(r.prodotto) + '</td><td class="m">' + fmtL(r.litri) + '</td><td class="m">' + fmtE(tot) + '</td><td style="text-align:center">' + (r.stato||'—') + '</td><td style="text-align:center"><span class="sem" style="background:' + dasC + '"></span> ' + (r.das_firmato_url?'SI':'NO') + '</td><td style="text-align:center"><span class="sem" style="background:' + cartC + '"></span> ' + (r.cartellino_url?'SI':'NO') + '</td></tr>';
  });
  html += '</tbody></table>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D85A30;color:#fff">🖨️ Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button></div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

// ── ELENCO VENDITE GIORNALIERO (stampabile) ─────────────────────
async function generaElencoVenditeGiorno() {
  var w = _apriReport('Elenco vendite'); if (!w) return;
  var dataFiltro = document.getElementById('filtro-data-consegne').value || oggiISO;
  var res = await sb.from('ordini').select('*').eq('data', dataFiltro).neq('stato','annullato').eq('tipo_ordine','cliente').order('cliente');
  var ordini = res.data || [];
  if (!ordini.length) { w.close(); toast('Nessun ordine vendita per questa data'); return; }

  var totLitri=0, totNetto=0, totIva=0, totMargine=0, totCosto=0;
  var perCliente = {};
  var righeArr = [];
  ordini.forEach(function(r, i) {
    var litri = Number(r.litri);
    var pNetto = prezzoNoIva(r);
    var pIva = prezzoConIva(r);
    var marg = Number(r.margine) * litri;
    var costoAcq = Number(r.costo_litro) * litri;
    var netto = pNetto * litri;
    var iva = pIva * litri;
    totLitri += litri; totNetto += netto; totIva += iva; totMargine += marg; totCosto += costoAcq;
    // Per cliente
    var cl = r.cliente || '—';
    if (!perCliente[cl]) perCliente[cl] = { ordini:0, litri:0, netto:0, iva:0, margine:0 };
    perCliente[cl].ordini++; perCliente[cl].litri += litri;
    perCliente[cl].netto += netto; perCliente[cl].iva += iva; perCliente[cl].margine += marg;
    righeArr.push('<tr>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:center;font-size:10px">' + (i+1) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;font-weight:bold;font-size:10px">' + esc(r.cliente) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;font-size:10px">' + esc(r.prodotto) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-size:10px">' + fmtL(litri) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-size:10px">' + fmt(pNetto) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-size:10px">' + fmtE(netto) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:center;font-size:10px">' + r.iva + '%</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold;font-size:10px">' + fmtE(iva) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:#639922;font-size:10px">' + fmtE(marg) + '</td>' +
      '</tr>');
  });

  var dataFmt = new Date(dataFiltro).toLocaleDateString('it-IT');

  // CSS base
  var css = '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px}' +
    '.page{width:210mm;min-height:297mm;padding:15mm 12mm;margin:0 auto;background:#fff}' +
    '@media print{.no-print{display:none!important}.page{margin:0;padding:10mm;page-break-after:always}.page:last-child{page-break-after:auto}@page{size:portrait;margin:0}}' +
    '@media screen{.page{box-shadow:0 2px 12px rgba(0,0,0,0.08);margin:10px auto}body{background:#f5f4f0}}' +
    '@media(max-width:600px){.page{padding:4mm!important;width:auto!important;min-height:auto!important}body{font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}.rpt-kpi{grid-template-columns:repeat(2,1fr)!important}table{font-size:8px!important}th,td{padding:3px 2px!important}.rpt-actions{bottom:8px!important;right:8px!important}button{padding:8px 12px!important;font-size:12px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#D4A017;color:#fff;padding:6px 5px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #B8900F;text-align:center}' +
    '.tot-row td{border-top:3px solid #D4A017!important;font-weight:bold;background:#FDF3D0!important}' +
    '.section-title{font-size:11px;font-weight:bold;color:#D4A017;text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 6px;border-bottom:1px solid #e8e8e8;padding-bottom:3px}' +
    '.page-label{font-size:9px;color:#bbb;text-align:right;margin-bottom:4px}' +
    '</style>';

  // ═══ PAGINA 1: Header + KPI + Riepilogo per cliente ═══
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elenco Vendite ' + dataFmt + '</title>' + css + '</head><body>';

  html += '<div class="page">';
  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #D4A017;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:20px;font-weight:bold;color:#D4A017">ELENCO VENDITE INGROSSO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Data: <strong>' + dataFmt + '</strong> — Ordini: <strong>' + ordini.length + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Vendita all\'ingrosso di carburanti</div></div></div>';

  // KPI
  html += '<div class="rpt-kpi" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px">';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:10px;text-align:center"><div style="font-size:8px;color:#7A5D00;text-transform:uppercase">Litri totali</div><div style="font-size:16px;font-weight:bold;font-family:Courier New,monospace">' + fmtL(totLitri) + '</div></div>';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:10px;text-align:center"><div style="font-size:8px;color:#7A5D00;text-transform:uppercase">Fatt. netto</div><div style="font-size:16px;font-weight:bold;font-family:Courier New,monospace">' + fmtE(totNetto) + '</div></div>';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:10px;text-align:center"><div style="font-size:8px;color:#7A5D00;text-transform:uppercase">Fatt. IVA incl.</div><div style="font-size:16px;font-weight:bold;font-family:Courier New,monospace">' + fmtE(totIva) + '</div></div>';
  html += '<div style="background:#EAF3DE;border:1px solid #639922;border-radius:6px;padding:10px;text-align:center"><div style="font-size:8px;color:#27500A;text-transform:uppercase">Margine</div><div style="font-size:16px;font-weight:bold;font-family:Courier New,monospace;color:#639922">' + fmtMe(totMargine) + '</div></div>';
  html += '<div style="background:#FCEBEB;border:1px solid #E24B4A;border-radius:6px;padding:10px;text-align:center"><div style="font-size:8px;color:#791F1F;text-transform:uppercase">Costo acquisto</div><div style="font-size:16px;font-weight:bold;font-family:Courier New,monospace;color:#A32D2D">' + fmtE(totCosto) + '</div></div>';
  html += '</div>';

  // Riepilogo per CLIENTE
  html += '<div class="section-title">Riepilogo vendite per cliente</div>';
  html += '<table><thead><tr><th>Cliente</th><th>Ordini</th><th>Litri</th><th>Fatt. netto</th><th>Fatt. IVA incl.</th><th>Margine</th></tr></thead><tbody>';
  var clArr = Object.entries(perCliente).sort(function(a,b) { return b[1].iva - a[1].iva; });
  clArr.forEach(function(entry) {
    var c = entry[0], v = entry[1];
    html += '<tr><td style="padding:5px 6px;border:1px solid #ddd;font-weight:bold">' + esc(c) + '</td><td style="padding:5px 6px;border:1px solid #ddd;text-align:center;font-family:Courier New,monospace">' + v.ordini + '</td><td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(v.litri) + '</td><td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(v.netto) + '</td><td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">' + fmtE(v.iva) + '</td><td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:#639922">' + fmtMe(v.margine) + '</td></tr>';
  });
  html += '<tr class="tot-row"><td style="padding:6px;border:1px solid #ddd;font-weight:bold">TOTALE</td><td style="padding:6px;border:1px solid #ddd;text-align:center;font-family:Courier New,monospace">' + ordini.length + '</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(totLitri) + '</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(totNetto) + '</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">' + fmtE(totIva) + '</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:#639922">' + fmtMe(totMargine) + '</td></tr>';
  html += '</tbody></table>';
  html += '<div style="text-align:center;font-size:9px;color:#aaa;border-top:1px solid #e8e8e8;padding-top:6px;margin-top:10px">PhoenixFuel Srl — Elenco vendite ' + dataFmt + '</div>';
  html += '</div>'; // chiude pagina 1

  // ═══ PAGINE DETTAGLIO ORDINI (paginato ~35 righe) ═══
  var RPP = 35;
  var theadHtml = '<thead><tr><th>#</th><th>Cliente</th><th>Prodotto</th><th>Litri</th><th>Prezzo/L netto</th><th>Tot. netto</th><th>IVA</th><th>Tot. IVA incl.</th><th>Margine</th></tr></thead>';
  var rigaTot = '<tr class="tot-row"><td style="padding:6px;border:1px solid #ddd" colspan="3">TOTALE (' + ordini.length + ' ordini)</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(totLitri) + '</td><td style="padding:6px;border:1px solid #ddd"></td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(totNetto) + '</td><td style="padding:6px;border:1px solid #ddd"></td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(totIva) + '</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:#639922">' + fmtMe(totMargine) + '</td></tr>';

  var totPag = Math.ceil(righeArr.length / RPP);
  for (var p = 0; p < totPag; p++) {
    var s = p * RPP, e = Math.min(s + RPP, righeArr.length);
    var isLast = (p === totPag - 1);
    html += '<div class="page">';
    html += '<div class="page-label">Dettaglio ordini — Pag. ' + (p+1) + '/' + totPag + ' — ' + dataFmt + '</div>';
    if (p === 0) html += '<div class="section-title">Dettaglio singoli ordini</div>';
    html += '<table>' + theadHtml + '<tbody>' + righeArr.slice(s, e).join('');
    if (isLast) html += rigaTot;
    html += '</tbody></table>';
    if (isLast) html += '<div style="text-align:center;font-size:9px;color:#aaa;border-top:1px solid #e8e8e8;padding-top:6px;margin-top:10px">PhoenixFuel Srl — Documento interno</div>';
    html += '</div>';
  }

  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="background:#D4A017;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="background:#E24B4A;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold">✕ Chiudi</button>';
  html += '</div></body></html>';

  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ── VENDITE ───────────────────────────────────────────────────────
function caricaVendite() {
  _applicaPermessiTab('vendite', '.vend-tab', {
    'vend-ingrosso':'vendite.ingrosso', 'vend-dettaglio':'vendite.dettaglio',
    'vend-annuale':'vendite.annuale', 'vend-margine-cliente':'vendite.margine-cliente'
  });
  const activeTab = document.querySelector('.vend-tab.active');
  if (activeTab && activeTab.dataset.tab === 'vend-dettaglio') caricaVenditeDettaglio();
  else if (activeTab && activeTab.dataset.tab === 'vend-annuale') caricaVenditeAnnuali();
  else if (activeTab && activeTab.dataset.tab === 'vend-margine-cliente') caricaMargineCliente();
  else caricaVenditeIngrosso();
}

async function caricaVenditeIngrosso() {
  // Imposta date default se non impostate
  const daEl = document.getElementById('vend-da');
  const aEl = document.getElementById('vend-a');
  if (!daEl.value) daEl.value = new Date(oggi.getFullYear(),oggi.getMonth(),1).toISOString().split('T')[0];
  if (!aEl.value) aEl.value = oggiISO;
  const da = daEl.value;
  const a = aEl.value;
  const filtroProd = document.getElementById('vend-prodotto').value;
  const filtroGruppo = document.getElementById('vend-sottogruppo').value; // 'rete' | 'consumo' | ''

  // Carica mappa clienti rete/consumo se serve filtrare
  let clientiReteMap = null;
  if (filtroGruppo) {
    const { data: clAll } = await sb.from('clienti').select('nome,cliente_rete');
    clientiReteMap = {};
    (clAll||[]).forEach(c => { clientiReteMap[c.nome] = !!c.cliente_rete; });
  }

  let baseQuery = sb.from('ordini').select('*').gte('data', da).lte('data', a).neq('stato','annullato').eq('tipo_ordine','cliente');
  if (filtroProd) baseQuery = baseQuery.eq('prodotto', filtroProd);
  let allData = [];
  let from = 0;
  while (true) {
    const { data: batch } = await baseQuery.range(from, from + 999);
    if (!batch || !batch.length) break;
    allData = allData.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
  }

  // Filtra per sottogruppo
  let data = allData;
  if (filtroGruppo && clientiReteMap) {
    data = allData.filter(r => {
      const isRete = clientiReteMap[r.cliente] || false;
      return filtroGruppo === 'rete' ? isRete : !isRete;
    });
  }
  if (!data.length) {
    document.getElementById('vend-fatturato').textContent = '—';
    document.getElementById('vend-litri').textContent = '—';
    document.getElementById('vend-margine').textContent = '—';
    document.getElementById('vend-ordini').textContent = '0';
    document.getElementById('tabella-vendite').innerHTML = '<tr><td colspan="4" class="loading">Nessun dato per il filtro selezionato</td></tr>';
    document.getElementById('tabella-vendite-clienti').innerHTML = '<tr><td colspan="5" class="loading">—</td></tr>';
    return;
  }

  let fatturato=0, litri=0, margine=0;
  const pf={}, pc={};
  data.forEach(r => {
    const tot = prezzoNoIva(r) * Number(r.litri);
    const marg = Number(r.margine) * Number(r.litri);
    fatturato += tot; litri += Number(r.litri); margine += marg;
    // Per fornitore
    if (!pf[r.fornitore]) pf[r.fornitore] = {litri:0, fatturato:0, margine:0};
    pf[r.fornitore].litri += Number(r.litri);
    pf[r.fornitore].fatturato += tot;
    pf[r.fornitore].margine += marg;
    // Per cliente
    const cl = r.cliente || 'Sconosciuto';
    if (!pc[cl]) pc[cl] = {litri:0, fatturato:0, margine:0, ordini:0};
    pc[cl].litri += Number(r.litri);
    pc[cl].fatturato += tot;
    pc[cl].margine += marg;
    pc[cl].ordini++;
  });

  document.getElementById('vend-fatturato').textContent = fmtE(fatturato);
  document.getElementById('vend-litri').textContent = fmtL(litri);
  document.getElementById('vend-margine').innerHTML = fmtMe(margine);
  document.getElementById('vend-ordini').textContent = data.length;

  // Tabella per fornitore
  const tbody = document.getElementById('tabella-vendite');
  const righeF = Object.entries(pf).sort((a,b) => b[1].fatturato - a[1].fatturato);
  tbody.innerHTML = righeF.length ? righeF.map(([f,v]) => '<tr><td><strong>' + esc(f) + '</strong></td><td style="font-family:var(--font-mono)">' + fmtL(v.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.fatturato) + '</td><td style="font-family:var(--font-mono)">' + fmtMe(v.margine) + '</td></tr>').join('') : '<tr><td colspan="4" class="loading">Nessun dato</td></tr>';

  // Tabella per cliente
  const tbCl = document.getElementById('tabella-vendite-clienti');
  const righeCl = Object.entries(pc).sort((a,b) => b[1].fatturato - a[1].fatturato);
  tbCl.innerHTML = righeCl.length ? righeCl.map(([c,v]) => '<tr><td><strong>' + esc(c) + '</strong></td><td style="font-family:var(--font-mono)">' + fmtL(v.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.fatturato) + '</td><td style="font-family:var(--font-mono)">' + fmtMe(v.margine) + '</td><td>' + v.ordini + '</td></tr>').join('') : '<tr><td colspan="5" class="loading">Nessun dato</td></tr>';

  // Grafici vendite
  const coloriGrafico = ['#D4A017','#378ADD','#639922','#3B6D11','#D85A30','#6B5FCC','#BA7517','#E24B4A'];

  // Grafico fornitori
  const ctxVF = document.getElementById('chart-vend-fornitori');
  if (ctxVF && righeF.length) {
    if (window._chartVendForn) window._chartVendForn.destroy();
    window._chartVendForn = new Chart(ctxVF.getContext('2d'), {
      type:'bar', data:{
        labels:righeF.map(([f])=>f.length>18?f.substring(0,18)+'…':f),
        datasets:[{ label:'Fatturato €', data:righeF.map(([,v])=>Math.round(v.fatturato*100)/100), backgroundColor:righeF.map((_,i)=>coloriGrafico[i%coloriGrafico.length]), borderRadius:6 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}}} }
    });
  }

  // Grafico clienti top 10
  const ctxVC = document.getElementById('chart-vend-clienti');
  const top10 = righeCl.slice(0,10);
  if (ctxVC && top10.length) {
    if (window._chartVendCl) window._chartVendCl.destroy();
    window._chartVendCl = new Chart(ctxVC.getContext('2d'), {
      type:'bar', data:{
        labels:top10.map(([c])=>c.length>15?c.substring(0,15)+'…':c),
        datasets:[{ label:'Fatturato €', data:top10.map(([,v])=>Math.round(v.fatturato*100)/100), backgroundColor:top10.map((_,i)=>coloriGrafico[i%coloriGrafico.length]), borderRadius:6 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}}} }
    });
  }
}

// ── VENDITE DETTAGLIO (Stazione Oppido) ──────────────────────────
let _chartDettIncasso=null, _chartDettMargine=null;

async function caricaVenditeDettaglio() {
  const daEl = document.getElementById('vdett-da');
  const aEl = document.getElementById('vdett-a');
  if (!daEl.value) daEl.value = new Date(oggi.getFullYear(),oggi.getMonth(),1).toISOString().split('T')[0];
  if (!aEl.value) aEl.value = oggiISO;
  const da = daEl.value, a = aEl.value;

  // Letture pompe nel periodo
  const { data: pompe } = await sb.from('stazione_pompe').select('id,nome,prodotto').eq('attiva',true);
  const { data: letture } = await sb.from('stazione_letture').select('*').gte('data', da).lte('data', a).order('data');
  const { data: prezziPompa } = await sb.from('stazione_prezzi').select('*').gte('data', da).lte('data', a);

  // Costo approvvigionamento: priorità a stazione_costi (marginalità), fallback su ordini stazione
  const { data: ordStz } = await sb.from('ordini').select('*').eq('tipo_ordine','stazione_servizio').neq('stato','annullato').gte('data', da).lte('data', a);
  const costoApprovvOrdini = (ordStz||[]).reduce((s,r) => s + Number(r.costo_litro) * Number(r.litri), 0);
  const { data: costiMarg } = await sb.from('stazione_costi').select('*').gte('data', da).lte('data', a);
  const costiMargMap = {};
  (costiMarg||[]).forEach(c => { costiMargMap[c.data+'_'+c.prodotto] = Number(c.costo_litro); });

  // Calcola vendite giornaliere da letture
  const giorniMap = {};
  const pompeMap = {};
  (pompe||[]).forEach(p => { pompeMap[p.id] = p; });

  // Raggruppa letture per data
  const letturePerData = {};
  (letture||[]).forEach(l => {
    if (!letturePerData[l.data]) letturePerData[l.data] = [];
    letturePerData[l.data].push(l);
  });

  // Prezzi per data/prodotto
  const prezziMap = {};
  (prezziPompa||[]).forEach(p => { prezziMap[p.data + '_' + p.prodotto] = Number(p.prezzo_litro); });

  const dateOrdinate = Object.keys(letturePerData).sort();
  let totIncasso=0, totLitri=0, totGasolio=0, totBenzina=0;

  dateOrdinate.forEach(data => {
    const gg = { litriG:0, litriB:0, incasso:0 };
    letturePerData[data].forEach(l => {
      const pompa = pompeMap[l.pompa_id];
      if (!pompa) return;
      // Trova lettura giorno precedente
      const datePrev = dateOrdinate.filter(d => d < data);
      const prevData = datePrev.length ? datePrev[datePrev.length-1] : null;
      let precLettura = null;
      if (prevData && letturePerData[prevData]) {
        const pl = letturePerData[prevData].find(x => x.pompa_id === l.pompa_id);
        if (pl) precLettura = Number(pl.lettura);
      }
      if (precLettura === null) return;
      const litriVenduti = Number(l.lettura) - precLettura;
      if (litriVenduti <= 0) return;
      const prezzo = prezziMap[data + '_' + pompa.prodotto] || 0;
      const incasso = litriVenduti * prezzo;
      if (pompa.prodotto === 'Gasolio Autotrazione') gg.litriG += litriVenduti;
      else gg.litriB += litriVenduti;
      gg.incasso += incasso;
    });
    giorniMap[data] = gg;
    totGasolio += gg.litriG;
    totBenzina += gg.litriB;
    totLitri += gg.litriG + gg.litriB;
    totIncasso += gg.incasso;
  });

  // Calcola costi per giorno da stazione_costi
  // IVA standard 22% (Gasolio Auto / Benzina).
  // - stazione_costi contiene il costo approvvigionamento NETTO IVA (trasferimento interno dal deposito)
  // - stazione_prezzi contiene il prezzo POMPA IVA INCLUSA (quello reale in cassa)
  // Logica corretta:
  //   • incasso mostrato = IVA inclusa (già così qui, nessun scorporo)
  //   • costo mostrato    = IVA inclusa per coerenza visiva
  //   • margine           = ricavo NETTO − costo NETTO (l'IVA è partita di giro erario)
  const IVA = 0.22;
  let totCostoReale = 0;
  const hasCostiReali = Object.keys(costiMargMap).length > 0;
  dateOrdinate.forEach(data => {
    const gg = giorniMap[data];
    // Costo NETTO del giorno (per il margine)
    const costoGasolioNetto = costiMargMap[data+'_Gasolio Autotrazione'] || 0;
    const costoBenzinaNetto = costiMargMap[data+'_Benzina'] || 0;
    const costoGNetto = (gg.litriG * costoGasolioNetto) + (gg.litriB * costoBenzinaNetto);
    // Costo IVA incl. (per la colonna "Costo approvv.")
    const costoGIvaIncl = costoGNetto * (1+IVA);
    // Ricavo netto IVA (per il margine)
    const ricavoNetto = gg.incasso / (1+IVA);
    // Dati giornalieri visualizzati
    gg.costo = costoGIvaIncl;                       // colonna "Costo approvv." = IVA incl.
    gg.margine = ricavoNetto - costoGNetto;          // margine vero = netto − netto
    gg._costoNetto = costoGNetto;
    gg._ricavoNetto = ricavoNetto;
    totCostoReale += costoGIvaIncl;
  });
  // Fallback: se non ci sono costi reali, usa quelli dagli ordini stazione (già netti)
  // e mostro anche questi in IVA incl. per coerenza colonna.
  const costoApprovv = hasCostiReali ? totCostoReale : (costoApprovvOrdini * (1+IVA));
  // Margine totale = ricavo NETTO − costo NETTO
  const totRicavoNetto = totIncasso / (1+IVA);
  const totCostoNetto = hasCostiReali
    ? dateOrdinate.reduce(function(s,d){ return s + (giorniMap[d]._costoNetto || 0); }, 0)
    : costoApprovvOrdini;
  const margineDettaglio = totRicavoNetto - totCostoNetto;

  // KPI
  document.getElementById('vdett-incasso').textContent = fmtE(totIncasso);
  document.getElementById('vdett-litri').textContent = fmtL(totLitri);
  document.getElementById('vdett-costo').textContent = fmtE(costoApprovv);
  document.getElementById('vdett-margine').innerHTML = fmtMe(margineDettaglio);

  // Tabella giornaliera
  const tbody = document.getElementById('tabella-vend-dettaglio');
  if (!dateOrdinate.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Nessuna lettura nel periodo</td></tr>';
  } else {
    tbody.innerHTML = dateOrdinate.map(d => {
      const g = giorniMap[d];
      const totG = g.litriG + g.litriB;
      const hasCosto = g.costo > 0;
      const margG = g.margine || 0;
      const margColor = margG >= 0 ? '#639922' : '#A32D2D';
      return '<tr><td>' + d + '</td><td style="font-family:var(--font-mono)">' + fmtL(g.litriG) + '</td><td style="font-family:var(--font-mono)">' + fmtL(g.litriB) + '</td><td style="font-family:var(--font-mono);font-weight:500">' + fmtL(totG) + '</td><td style="font-family:var(--font-mono)">' + fmtE(g.incasso) + '</td><td style="font-family:var(--font-mono);color:' + (hasCosto?'var(--text)':'var(--text-muted)') + '">' + (hasCosto ? fmtE(g.costo) : '—') + '</td><td style="font-family:var(--font-mono);color:' + (hasCosto ? margColor : 'var(--text-muted)') + '">' + (hasCosto ? fmtE(margG) : '—') + '</td></tr>';
    }).join('');
    // Riga totale
    tbody.innerHTML += '<tr style="border-top:2px solid var(--accent);font-weight:500"><td>TOTALE</td><td style="font-family:var(--font-mono)">' + fmtL(totGasolio) + '</td><td style="font-family:var(--font-mono)">' + fmtL(totBenzina) + '</td><td style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(totIncasso) + '</td><td style="font-family:var(--font-mono)">' + fmtE(costoApprovv) + '</td><td style="font-family:var(--font-mono);color:' + (margineDettaglio >= 0 ? '#639922' : '#A32D2D') + '">' + fmtMe(margineDettaglio) + '</td></tr>';
  }

  // Grafici
  const labelsG = dateOrdinate.map(d => { const dt=new Date(d); return dt.getDate()+'/'+(dt.getMonth()+1); });
  const ctxI = document.getElementById('chart-dett-incasso');
  if (ctxI) {
    if (_chartDettIncasso) _chartDettIncasso.destroy();
    _chartDettIncasso = new Chart(ctxI.getContext('2d'), {
      type:'bar', data:{ labels:labelsG, datasets:[{ label:'Incasso €', data:dateOrdinate.map(d=>Math.round(giorniMap[d].incasso*100)/100), backgroundColor:'#6B5FCC', borderRadius:4 }] },
      options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}},x:{ticks:{maxTicksLimit:15,font:{size:9}}}} }
    });
  }
  const ctxM = document.getElementById('chart-dett-margine');
  if (ctxM) {
    const costoG = costoApprovv / (dateOrdinate.length || 1);
    if (_chartDettMargine) _chartDettMargine.destroy();
    _chartDettMargine = new Chart(ctxM.getContext('2d'), {
      type:'line', data:{ labels:labelsG, datasets:[{ label:'Margine €', data:dateOrdinate.map(d=>Math.round((giorniMap[d].incasso-costoG)*100)/100), borderColor:'#639922', backgroundColor:'rgba(99,153,34,0.1)', fill:true, tension:0.3, pointRadius:2 }] },
      options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>'€ '+v}},x:{ticks:{maxTicksLimit:15,font:{size:9}}}} }
    });
  }
}

// ── VENDITE RIEPILOGO ANNUALE ────────────────────────────────────
const MESI_NOMI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
let _chartAnnFatt=null, _chartAnnLitri=null;

async function caricaVenditeAnnuali() {
  // Popola select anno
  const selAnno = document.getElementById('vann-anno');
  if (selAnno.options.length === 0) {
    const annoCorr = oggi.getFullYear();
    for (let a = annoCorr; a >= annoCorr - 4; a--) selAnno.innerHTML += '<option value="' + a + '">' + a + '</option>';
  }
  // Popola anche i selettori di confronto
  const selC1 = document.getElementById('vann-confronto-a1');
  const selC2 = document.getElementById('vann-confronto-a2');
  if (selC1 && selC1.options.length === 0) {
    const annoCorr = oggi.getFullYear();
    for (let a = annoCorr; a >= annoCorr - 4; a--) {
      selC1.innerHTML += '<option value="' + a + '">' + a + '</option>';
      selC2.innerHTML += '<option value="' + a + '">' + a + '</option>';
    }
    selC1.value = annoCorr;
    selC2.value = annoCorr - 1;
  }
  const anno = parseInt(selAnno.value);
  if (!anno) return;

  // === Filtro periodo da/a ===
  // Default: 01/01/anno → oggi (se anno corrente) oppure 31/12/anno (se anni passati/futuri)
  const inpDa = document.getElementById('vann-da');
  const inpA  = document.getElementById('vann-a');
  const oggiISO = oggi.toISOString().split('T')[0];
  const annoCorrente = oggi.getFullYear();
  const defaultDa = anno + '-01-01';
  const defaultA  = (anno === annoCorrente) ? oggiISO : (anno + '-12-31');
  // Se input vuoti o l'anno selezionato non corrisponde alle date negli input → ripristina default
  const annoInDa = (inpDa && inpDa.value) ? parseInt(inpDa.value.substring(0,4)) : null;
  const annoInA  = (inpA  && inpA.value)  ? parseInt(inpA.value.substring(0,4))  : null;
  if (!inpDa.value || !inpA.value || annoInDa !== anno || annoInA !== anno) {
    inpDa.value = defaultDa;
    inpA.value  = defaultA;
  }
  const da = inpDa.value;
  const a  = inpA.value;

  // Ingrosso: ordini tipo_ordine='cliente'
  let allIng = [];
  let from = 0;
  while (true) {
    const { data: batch } = await sb.from('ordini').select('data,litri,costo_litro,trasporto_litro,margine,iva').gte('data', da).lte('data', a).neq('stato','annullato').eq('tipo_ordine','cliente').range(from, from + 999);
    if (!batch || !batch.length) break;
    allIng = allIng.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
  }

  // Dettaglio: letture stazione
  const { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true);
  // Include giorno precedente a inizio anno per calcolare litri 1° gennaio
  var daPrev = new Date(anno, 0, 0).toISOString().split('T')[0];
  var allLetture = [];
  var fromL = 0;
  while (true) {
    var { data: batchL } = await sb.from('stazione_letture').select('data,pompa_id,lettura,litri_prezzo_diverso,prezzo_diverso').gte('data', daPrev).lte('data', a).order('data').range(fromL, fromL + 999);
    if (!batchL || !batchL.length) break;
    allLetture = allLetture.concat(batchL);
    if (batchL.length < 1000) break;
    fromL += 1000;
  }
  const letture = allLetture;
  const { data: prezziP } = await sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', da).lte('data', a);
  const { data: costiP } = await sb.from('stazione_costi').select('data,prodotto,costo_litro').gte('data', da).lte('data', a);

  const pompeMap = {};
  (pompe||[]).forEach(p => { pompeMap[p.id] = p; });
  const prezziMap = {};
  (prezziP||[]).forEach(p => { prezziMap[p.data + '_' + p.prodotto] = Number(p.prezzo_litro); });
  const costiDetMap = {};
  (costiP||[]).forEach(c => { costiDetMap[c.data + '_' + c.prodotto] = Number(c.costo_litro); });

  // Calcola dettaglio per giorno (ottimizzato)
  const lettPerData = {};
  (letture||[]).forEach(l => { if (!lettPerData[l.data]) lettPerData[l.data] = []; lettPerData[l.data].push(l); });
  const dateOrd = Object.keys(lettPerData).sort();

  const dettaglioPerGiorno = {};
  for (var di = 0; di < dateOrd.length; di++) {
    var data = dateOrd[di];
    var prevD = di > 0 ? dateOrd[di-1] : null;
    let litriG = 0, incassoG = 0, costoG = 0;
    if (prevD) {
      lettPerData[data].forEach(l => {
        const pompa = pompeMap[l.pompa_id]; if (!pompa) return;
        const pl = (lettPerData[prevD]||[]).find(x => x.pompa_id === l.pompa_id);
        if (!pl) return;
        const lv = Number(l.lettura) - Number(pl.lettura); if (lv <= 0) return;
        const pr = (prezziMap[data + '_' + pompa.prodotto] || 0) / 1.22;
        const co = costiDetMap[data + '_' + pompa.prodotto] || 0;
        const litriPD = Number(l.litri_prezzo_diverso||0);
        const prezzoPD = Number(l.prezzo_diverso||0) / 1.22;
        const hasCambio = litriPD > 0 && prezzoPD > 0;
        const litriStd = hasCambio ? Math.max(0, lv - litriPD) : lv;
        litriG += lv;
        incassoG += (litriStd * pr) + (hasCambio ? litriPD * prezzoPD : 0);
        costoG += lv * co;
      });
    }
    dettaglioPerGiorno[data] = { litri: litriG, incasso: incassoG, costo: costoG, margine: incassoG - costoG };
  }

  // Aggrega per mese
  const mesi = [];
  for (let m = 0; m < 12; m++) {
    let ingLitri=0, ingFatt=0, ingMarg=0, dettLitri=0, dettInc=0, dettMarg=0;
    const mStr = String(m+1).padStart(2,'0');
    const prefix = anno + '-' + mStr;

    allIng.forEach(r => { if (r.data.startsWith(prefix)) { ingLitri += Number(r.litri); ingFatt += prezzoNoIva(r)*Number(r.litri); ingMarg += Number(r.margine)*Number(r.litri); } });
    Object.entries(dettaglioPerGiorno).forEach(([d,v]) => { if (d.startsWith(prefix)) { dettLitri += v.litri; dettInc += v.incasso; dettMarg += v.margine; } });

    mesi.push({ mese: MESI_NOMI[m], ingLitri, ingFatt, ingMarg, dettLitri, dettInc, dettMarg, totLitri: ingLitri+dettLitri, totFatt: ingFatt+dettInc, totMarg: ingMarg+dettMarg });
  }

  // Salva dati per filtro vista
  window._annualeData = { mesi: mesi, anno: anno, da: da, a: a };
  _renderTabellaAnnuale();

  // Grafici
  const labelsM = mesi.map(m => m.mese.substring(0,3));
  const ctxF = document.getElementById('chart-ann-fatturato');
  if (ctxF) {
    if (_chartAnnFatt) _chartAnnFatt.destroy();
    _chartAnnFatt = new Chart(ctxF.getContext('2d'), {
      type:'bar', data:{ labels:labelsM, datasets:[
        { label:'Ingrosso', data:mesi.map(m=>Math.round(m.ingFatt)), backgroundColor:'#D4A017', borderRadius:4 },
        { label:'Dettaglio', data:mesi.map(m=>Math.round(m.dettInc)), backgroundColor:'#6B5FCC', borderRadius:4 }
      ] }, options:{ responsive:true, plugins:{legend:{position:'top',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}},x:{}} }
    });
  }
  const ctxL = document.getElementById('chart-ann-litri');
  if (ctxL) {
    if (_chartAnnLitri) _chartAnnLitri.destroy();
    _chartAnnLitri = new Chart(ctxL.getContext('2d'), {
      type:'bar', data:{ labels:labelsM, datasets:[
        { label:'Ingrosso', data:mesi.map(m=>Math.round(m.ingLitri)), backgroundColor:'#D4A017', borderRadius:4 },
        { label:'Dettaglio', data:mesi.map(m=>Math.round(m.dettLitri)), backgroundColor:'#6B5FCC', borderRadius:4 }
      ] }, options:{ responsive:true, plugins:{legend:{position:'top',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtL(v)}},x:{}} }
    });
  }
}

function _renderTabellaAnnuale() {
  var d = window._annualeData; if (!d) return;
  var mesi = d.mesi, anno = d.anno;
  // Label totale: se range = anno intero → "TOTALE anno", altrimenti "TOTALE gg/mm/aaaa — gg/mm/aaaa"
  var rangePieno = (d.da === anno + '-01-01' && d.a === anno + '-12-31');
  var labelTot;
  if (rangePieno) {
    labelTot = 'TOTALE ' + anno;
  } else {
    var _fd = function(iso){ var p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; };
    labelTot = 'TOTALE ' + _fd(d.da) + ' — ' + _fd(d.a);
  }
  var vista = (document.getElementById('vann-vista') || {}).value || 'totale';
  var thead = document.getElementById('thead-vend-annuale');
  var tbody = document.getElementById('tabella-vend-annuale');
  var mono = 'font-family:var(--font-mono)';

  if (vista === 'ingrosso') {
    thead.innerHTML = '<tr><th>Mese</th><th>Litri</th><th>Fatturato</th><th>Margine</th><th>€/L margine</th></tr>';
    var tL=0,tF=0,tM=0;
    tbody.innerHTML = mesi.map(function(m) {
      tL+=m.ingLitri; tF+=m.ingFatt; tM+=m.ingMarg;
      var mpl = m.ingLitri > 0 ? (m.ingMarg/m.ingLitri).toFixed(4) : '—';
      var mc = m.ingMarg >= 0 ? '#639922' : '#E24B4A';
      return '<tr' + (!m.ingLitri?' style="opacity:0.4"':'') + '><td><strong>' + m.mese + '</strong></td><td style="'+mono+'">' + fmtL(m.ingLitri) + '</td><td style="'+mono+'">' + fmtE(m.ingFatt) + '</td><td style="'+mono+';color:'+mc+'">' + fmtE(m.ingMarg) + '</td><td style="'+mono+';color:'+mc+'">' + mpl + '</td></tr>';
    }).join('');
    var tc = tM >= 0 ? '#639922' : '#E24B4A';
    tbody.innerHTML += '<tr style="border-top:2px solid var(--accent);font-weight:600"><td>'+labelTot+'</td><td style="'+mono+'">'+fmtL(tL)+'</td><td style="'+mono+'">'+fmtE(tF)+'</td><td style="'+mono+';color:'+tc+'">'+fmtE(tM)+'</td><td style="'+mono+';color:'+tc+'">'+(tL>0?(tM/tL).toFixed(4):'—')+'</td></tr>';
  } else if (vista === 'dettaglio') {
    thead.innerHTML = '<tr><th>Mese</th><th>Litri</th><th>Incasso netto</th><th>Margine</th><th>€/L margine</th></tr>';
    var tL=0,tI=0,tM=0;
    tbody.innerHTML = mesi.map(function(m) {
      tL+=m.dettLitri; tI+=m.dettInc; tM+=m.dettMarg;
      var mpl = m.dettLitri > 0 ? (m.dettMarg/m.dettLitri).toFixed(4) : '—';
      var mc = m.dettMarg >= 0 ? '#639922' : '#E24B4A';
      return '<tr' + (!m.dettLitri?' style="opacity:0.4"':'') + '><td><strong>' + m.mese + '</strong></td><td style="'+mono+';color:#6B5FCC">' + fmtL(m.dettLitri) + '</td><td style="'+mono+';color:#6B5FCC">' + fmtE(m.dettInc) + '</td><td style="'+mono+';color:'+mc+'">' + fmtE(m.dettMarg) + '</td><td style="'+mono+';color:'+mc+'">' + mpl + '</td></tr>';
    }).join('');
    var tc = tM >= 0 ? '#639922' : '#E24B4A';
    tbody.innerHTML += '<tr style="border-top:2px solid var(--accent);font-weight:600"><td>'+labelTot+'</td><td style="'+mono+';color:#6B5FCC">'+fmtL(tL)+'</td><td style="'+mono+';color:#6B5FCC">'+fmtE(tI)+'</td><td style="'+mono+';color:'+tc+'">'+fmtE(tM)+'</td><td style="'+mono+';color:'+tc+'">'+(tL>0?(tM/tL).toFixed(4):'—')+'</td></tr>';
  } else {
    thead.innerHTML = '<tr><th>Mese</th><th>Litri ingrosso</th><th>Fatt. ingrosso</th><th>Margine ingrosso</th><th>Litri dettaglio</th><th>Incasso dettaglio</th><th>Margine dettaglio</th><th>Totale litri</th><th>Totale fatturato</th><th>Totale margine</th></tr>';
    var totIL=0,totIF=0,totIM=0,totDL=0,totDI=0,totDM=0,totTL=0,totTF=0,totTM=0;
    tbody.innerHTML = mesi.map(function(m) {
      totIL+=m.ingLitri; totIF+=m.ingFatt; totIM+=m.ingMarg; totDL+=m.dettLitri; totDI+=m.dettInc; totDM+=m.dettMarg; totTL+=m.totLitri; totTF+=m.totFatt; totTM+=m.totMarg;
      var hasData = m.ingLitri > 0 || m.dettLitri > 0;
      var dmColor = m.dettMarg >= 0 ? '#639922' : '#E24B4A';
      var tmColor = m.totMarg >= 0 ? '#639922' : '#E24B4A';
      return '<tr'+ (!hasData?' style="opacity:0.4"':'') +'><td><strong>'+m.mese+'</strong></td><td style="'+mono+'">'+fmtL(m.ingLitri)+'</td><td style="'+mono+'">'+fmtE(m.ingFatt)+'</td><td style="'+mono+';color:#639922">'+fmtE(m.ingMarg)+'</td><td style="'+mono+';color:#6B5FCC">'+fmtL(m.dettLitri)+'</td><td style="'+mono+';color:#6B5FCC">'+fmtE(m.dettInc)+'</td><td style="'+mono+';color:'+dmColor+'">'+fmtE(m.dettMarg)+'</td><td style="'+mono+';font-weight:500">'+fmtL(m.totLitri)+'</td><td style="'+mono+';font-weight:500">'+fmtE(m.totFatt)+'</td><td style="'+mono+';font-weight:bold;color:'+tmColor+'">'+fmtE(m.totMarg)+'</td></tr>';
    }).join('');
    var tmTotColor = totTM >= 0 ? '#639922' : '#E24B4A';
    tbody.innerHTML += '<tr style="border-top:2px solid var(--accent);font-weight:600"><td>'+labelTot+'</td><td style="'+mono+'">'+fmtL(totIL)+'</td><td style="'+mono+'">'+fmtE(totIF)+'</td><td style="'+mono+';color:#639922">'+fmtE(totIM)+'</td><td style="'+mono+';color:#6B5FCC">'+fmtL(totDL)+'</td><td style="'+mono+';color:#6B5FCC">'+fmtE(totDI)+'</td><td style="'+mono+';color:#639922">'+fmtE(totDM)+'</td><td style="'+mono+'">'+fmtL(totTL)+'</td><td style="'+mono+'">'+fmtE(totTF)+'</td><td style="'+mono+';font-weight:bold;color:'+tmTotColor+'">'+fmtE(totTM)+'</td></tr>';
  }
}

function filtraVistaAnnuale() { _renderTabellaAnnuale(); }

// Cambio anno: azzera i campi data così caricaVenditeAnnuali ripristina i default per il nuovo anno
function cambiaAnnoVenditeAnnuali() {
  var inpDa = document.getElementById('vann-da');
  var inpA  = document.getElementById('vann-a');
  if (inpDa) inpDa.value = '';
  if (inpA)  inpA.value  = '';
  caricaVenditeAnnuali();
}

// Ripristina periodo: 01/01/anno → oggi (anno corrente) o 31/12/anno (anni passati)
function resetVenditeAnnualiPeriodo() {
  var selAnno = document.getElementById('vann-anno');
  if (!selAnno || !selAnno.value) return;
  var anno = parseInt(selAnno.value);
  var inpDa = document.getElementById('vann-da');
  var inpA  = document.getElementById('vann-a');
  var oggiISO = oggi.toISOString().split('T')[0];
  inpDa.value = anno + '-01-01';
  inpA.value  = (anno === oggi.getFullYear()) ? oggiISO : (anno + '-12-31');
  caricaVenditeAnnuali();
}

// ── REPORT PDF DETTAGLIO ─────────────────────────────────────────
async function stampaReportDettaglio() {
  var w = _apriReport("Report vendite dettaglio"); if (!w) return;
  const da = document.getElementById('vdett-da').value;
  const a = document.getElementById('vdett-a').value;
  if (!da||!a) { toast('Seleziona il periodo'); return; }
  // Rigenera i dati come in caricaVenditeDettaglio ma per il report
  toast('Generazione report in corso...');
  // Usa i dati già nella tabella
  const tbody = document.getElementById('tabella-vend-dettaglio');
  const righe = tbody.querySelectorAll('tr');
  if (!righe.length) { toast('Nessun dato da stampare'); return; }
  let righeHtml = '';
  righe.forEach(tr => { righeHtml += '<tr>' + tr.innerHTML.replace(/var\(--font-mono\)/g,'Courier New,monospace').replace(/var\(--text-muted\)/g,'#666') + '</tr>'; });

  const daFmt = new Date(da).toLocaleDateString('it-IT');
  const aFmt = new Date(a).toLocaleDateString('it-IT');
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vendite Dettaglio Stazione</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}table{font-size:9px}th,td{padding:4px 3px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#6B5FCC;color:#fff;padding:7px 5px;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #5A4FBB;text-align:center}' +
    'td{padding:6px 8px;border:1px solid #ddd}' +
    '</style></head><body>';
  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6B5FCC;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#6B5FCC">VENDITE AL DETTAGLIO — STAZIONE OPPIDO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Periodo: <strong>' + daFmt + ' — ' + aFmt + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';
  html += '<table><thead><tr><th>Data</th><th>Gasolio (L)</th><th>Benzina (L)</th><th>Tot. Litri</th><th>Incasso € (IVA incl.)</th><th>Costo approvv. (IVA incl.)</th><th>Margine € (netto IVA)</th></tr></thead><tbody>';
  html += righeHtml + '</tbody></table>';
  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

// ── REPORT PDF ANNUALE ───────────────────────────────────────────
async function stampaReportAnnuale() {
  var w = _apriReport("Report annuale"); if (!w) return;
  const anno = document.getElementById('vann-anno').value;
  if (!anno) { toast('Seleziona un anno'); return; }
  const tbody = document.getElementById('tabella-vend-annuale');
  const righe = tbody.querySelectorAll('tr');
  if (!righe.length) { toast('Nessun dato da stampare'); return; }
  let righeHtml = '';
  righe.forEach(tr => { righeHtml += '<tr>' + tr.innerHTML.replace(/var\(--font-mono\)/g,'Courier New,monospace').replace(/var\(--accent\)/g,'#D85A30') + '</tr>'; });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Riepilogo Annuale ' + anno + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}table{font-size:9px}th,td{padding:4px 3px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#639922;color:#fff;padding:7px 5px;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #4A7A19;text-align:center}' +
    'td{padding:6px 8px;border:1px solid #ddd}' +
    '</style></head><body>';
  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #639922;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#639922">RIEPILOGO VENDITE ANNUALE ' + anno + '</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Ingrosso (clienti diretti) + Dettaglio (stazione Oppido)</div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';
  html += '<table><thead><tr><th>Mese</th><th>Litri ingrosso</th><th>Fatt. ingrosso</th><th>Margine ingrosso</th><th>Litri dettaglio</th><th>Incasso dettaglio</th><th>Margine dettaglio</th><th>Totale litri</th><th>Totale fatturato</th><th>Totale margine</th></tr></thead><tbody>';
  html += righeHtml + '</tbody></table>';
  html += '<div style="text-align:center;font-size:9px;color:#aaa;border-top:1px solid #e8e8e8;padding-top:8px;margin-top:14px">PhoenixFuel Srl — Riepilogo annuale ' + anno + '</div>';
  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#639922;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

// ── CONFRONTO ANNO SU ANNO ───────────────────────────────────────
let _chartConfLitri=null, _chartConfFatt=null;
let _ultimoConfronto = null;

async function _caricaDatiAnno(anno) {
  const da = anno + '-01-01', a = anno + '-12-31';
  // Ingrosso
  let allIng = [], from = 0;
  while (true) {
    const { data: batch } = await sb.from('ordini').select('data,litri,costo_litro,trasporto_litro,margine,iva').gte('data', da).lte('data', a).neq('stato','annullato').eq('tipo_ordine','cliente').range(from, from + 999);
    if (!batch || !batch.length) break;
    allIng = allIng.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  // Dettaglio
  const { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true);
  const { data: letture } = await sb.from('stazione_letture').select('data,pompa_id,lettura').gte('data', da).lte('data', a).order('data');
  const { data: prezziP } = await sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', da).lte('data', a);
  const pompeMap = {}; (pompe||[]).forEach(p => { pompeMap[p.id] = p; });
  const prezziMap = {}; (prezziP||[]).forEach(p => { prezziMap[p.data+'_'+p.prodotto] = Number(p.prezzo_litro); });
  const lettPerData = {}; (letture||[]).forEach(l => { if (!lettPerData[l.data]) lettPerData[l.data] = []; lettPerData[l.data].push(l); });
  const dateOrd = Object.keys(lettPerData).sort();
  const dettPerGiorno = {};
  dateOrd.forEach(data => {
    let litriG=0, incassoG=0;
    lettPerData[data].forEach(l => {
      const pompa = pompeMap[l.pompa_id]; if (!pompa) return;
      const prev = dateOrd.filter(d => d < data);
      const prevD = prev.length ? prev[prev.length-1] : null;
      let precL = null;
      if (prevD && lettPerData[prevD]) { const pl = lettPerData[prevD].find(x => x.pompa_id === l.pompa_id); if (pl) precL = Number(pl.lettura); }
      if (precL === null) return;
      const lv = Number(l.lettura) - precL; if (lv <= 0) return;
      litriG += lv; incassoG += lv * (prezziMap[data+'_'+pompa.prodotto] || 0);
    });
    dettPerGiorno[data] = { litri: litriG, incasso: incassoG };
  });
  // Aggrega per mese
  const mesi = [];
  for (let m = 0; m < 12; m++) {
    let ingLitri=0, ingFatt=0, ingMarg=0, dettLitri=0, dettInc=0;
    const prefix = anno + '-' + String(m+1).padStart(2,'0');
    allIng.forEach(r => { if (r.data.startsWith(prefix)) { ingLitri += Number(r.litri); ingFatt += prezzoNoIva(r)*Number(r.litri); ingMarg += Number(r.margine)*Number(r.litri); } });
    Object.entries(dettPerGiorno).forEach(([d,v]) => { if (d.startsWith(prefix)) { dettLitri += v.litri; dettInc += v.incasso; } });
    mesi.push({ ingLitri, ingFatt, ingMarg, dettLitri, dettInc, totLitri: ingLitri+dettLitri, totFatt: ingFatt+dettInc });
  }
  return mesi;
}

async function confrontaAnni() {
  const anno1 = parseInt(document.getElementById('vann-confronto-a1').value);
  const anno2 = parseInt(document.getElementById('vann-confronto-a2').value);
  if (!anno1 || !anno2) { toast('Seleziona entrambi gli anni'); return; }
  if (anno1 === anno2) { toast('Seleziona due anni diversi'); return; }

  const wrap = document.getElementById('confronto-anni-content');
  wrap.innerHTML = '<div class="loading" style="padding:20px 0">Caricamento dati ' + anno1 + ' e ' + anno2 + '...</div>';

  const [mesi1, mesi2] = await Promise.all([_caricaDatiAnno(anno1), _caricaDatiAnno(anno2)]);
  _ultimoConfronto = { anno1, anno2, mesi1, mesi2 };

  // Tabella confronto
  let html = '<div style="overflow-x:auto"><table><thead><tr>';
  html += '<th>Mese</th>';
  html += '<th>Litri ' + anno1 + '</th><th>Litri ' + anno2 + '</th><th>Diff. litri</th><th>Δ %</th>';
  html += '<th>Fatt. ' + anno1 + '</th><th>Fatt. ' + anno2 + '</th><th>Diff. fatt.</th><th>Δ %</th>';
  html += '</tr></thead><tbody>';

  let tot1L=0,tot2L=0,tot1F=0,tot2F=0;
  for (let m = 0; m < 12; m++) {
    const l1 = mesi1[m].totLitri, l2 = mesi2[m].totLitri;
    const f1 = mesi1[m].totFatt, f2 = mesi2[m].totFatt;
    const diffL = l1 - l2, diffF = f1 - f2;
    const pctL = l2 > 0 ? ((l1 - l2) / l2 * 100) : (l1 > 0 ? 100 : 0);
    const pctF = f2 > 0 ? ((f1 - f2) / f2 * 100) : (f1 > 0 ? 100 : 0);
    tot1L+=l1; tot2L+=l2; tot1F+=f1; tot2F+=f2;
    const colL = diffL > 0 ? '#639922' : diffL < 0 ? '#A32D2D' : 'var(--text-muted)';
    const colF = diffF > 0 ? '#639922' : diffF < 0 ? '#A32D2D' : 'var(--text-muted)';
    const arrowL = diffL > 0 ? '▲' : diffL < 0 ? '▼' : '—';
    const arrowF = diffF > 0 ? '▲' : diffF < 0 ? '▼' : '—';
    const hasData = l1 > 0 || l2 > 0;
    html += '<tr' + (!hasData ? ' style="opacity:0.35"' : '') + '>';
    html += '<td><strong>' + MESI_NOMI[m] + '</strong></td>';
    html += '<td style="font-family:var(--font-mono)">' + fmtL(l1) + '</td>';
    html += '<td style="font-family:var(--font-mono)">' + fmtL(l2) + '</td>';
    html += '<td style="font-family:var(--font-mono);color:' + colL + ';font-weight:500">' + arrowL + ' ' + fmtL(Math.abs(diffL)) + '</td>';
    html += '<td style="font-family:var(--font-mono);color:' + colL + ';font-weight:500">' + (pctL > 0 ? '+' : '') + pctL.toFixed(1) + '%</td>';
    html += '<td style="font-family:var(--font-mono)">' + fmtE(f1) + '</td>';
    html += '<td style="font-family:var(--font-mono)">' + fmtE(f2) + '</td>';
    html += '<td style="font-family:var(--font-mono);color:' + colF + ';font-weight:500">' + arrowF + ' ' + fmtE(Math.abs(diffF)) + '</td>';
    html += '<td style="font-family:var(--font-mono);color:' + colF + ';font-weight:500">' + (pctF > 0 ? '+' : '') + pctF.toFixed(1) + '%</td>';
    html += '</tr>';
  }
  // Riga totale
  const tdL = tot1L - tot2L, tdF = tot1F - tot2F;
  const tpL = tot2L > 0 ? ((tot1L-tot2L)/tot2L*100) : 0;
  const tpF = tot2F > 0 ? ((tot1F-tot2F)/tot2F*100) : 0;
  const tcL = tdL > 0 ? '#639922' : tdL < 0 ? '#A32D2D' : 'var(--text-muted)';
  const tcF = tdF > 0 ? '#639922' : tdF < 0 ? '#A32D2D' : 'var(--text-muted)';
  html += '<tr style="border-top:2px solid var(--accent);font-weight:600">';
  html += '<td>TOTALE</td>';
  html += '<td style="font-family:var(--font-mono)">' + fmtL(tot1L) + '</td>';
  html += '<td style="font-family:var(--font-mono)">' + fmtL(tot2L) + '</td>';
  html += '<td style="font-family:var(--font-mono);color:' + tcL + '">' + (tdL>0?'▲':'▼') + ' ' + fmtL(Math.abs(tdL)) + '</td>';
  html += '<td style="font-family:var(--font-mono);color:' + tcL + '">' + (tpL>0?'+':'') + tpL.toFixed(1) + '%</td>';
  html += '<td style="font-family:var(--font-mono)">' + fmtE(tot1F) + '</td>';
  html += '<td style="font-family:var(--font-mono)">' + fmtE(tot2F) + '</td>';
  html += '<td style="font-family:var(--font-mono);color:' + tcF + '">' + (tdF>0?'▲':'▼') + ' ' + fmtE(Math.abs(tdF)) + '</td>';
  html += '<td style="font-family:var(--font-mono);color:' + tcF + '">' + (tpF>0?'+':'') + tpF.toFixed(1) + '%</td>';
  html += '</tr></tbody></table></div>';

  // Canvas per grafici
  html += '<div class="grid2" style="margin-top:16px">';
  html += '<div><div style="font-size:13px;font-weight:500;margin-bottom:8px">Litri totali — ' + anno1 + ' vs ' + anno2 + '</div><canvas id="chart-conf-litri" height="250"></canvas></div>';
  html += '<div><div style="font-size:13px;font-weight:500;margin-bottom:8px">Fatturato imponibile — ' + anno1 + ' vs ' + anno2 + '</div><canvas id="chart-conf-fatt" height="250"></canvas></div>';
  html += '</div>';

  wrap.innerHTML = html;

  // Grafici
  const labelsM = MESI_NOMI.map(n => n.substring(0,3));

  const ctxL = document.getElementById('chart-conf-litri');
  if (ctxL) {
    if (_chartConfLitri) _chartConfLitri.destroy();
    _chartConfLitri = new Chart(ctxL.getContext('2d'), {
      type:'bar', data:{ labels:labelsM, datasets:[
        { label:String(anno1), data:mesi1.map(m=>Math.round(m.totLitri)), backgroundColor:'#D4A017', borderRadius:4 },
        { label:String(anno2), data:mesi2.map(m=>Math.round(m.totLitri)), backgroundColor:'rgba(212,160,23,0.35)', borderRadius:4 }
      ] }, options:{ responsive:true, plugins:{legend:{position:'top',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtL(v)}}} }
    });
  }

  const ctxF = document.getElementById('chart-conf-fatt');
  if (ctxF) {
    if (_chartConfFatt) _chartConfFatt.destroy();
    _chartConfFatt = new Chart(ctxF.getContext('2d'), {
      type:'bar', data:{ labels:labelsM, datasets:[
        { label:String(anno1), data:mesi1.map(m=>Math.round(m.totFatt)), backgroundColor:'#378ADD', borderRadius:4 },
        { label:String(anno2), data:mesi2.map(m=>Math.round(m.totFatt)), backgroundColor:'rgba(55,138,221,0.35)', borderRadius:4 }
      ] }, options:{ responsive:true, plugins:{legend:{position:'top',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}}} }
    });
  }
}

function stampaConfrontoAnni() {
  if (!_ultimoConfronto) { toast('Prima esegui un confronto'); return; }
  const { anno1, anno2 } = _ultimoConfronto;
  const wrap = document.getElementById('confronto-anni-content');
  const tbl = wrap.querySelector('table');
  if (!tbl) { toast('Nessun dato da stampare'); return; }
  let righeHtml = tbl.innerHTML.replace(/var\(--font-mono\)/g,'Courier New,monospace').replace(/var\(--text-muted\)/g,'#666').replace(/var\(--accent\)/g,'#D85A30');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confronto ' + anno1 + ' vs ' + anno2 + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:9px}.rpt-header{flex-direction:column!important;gap:8px}table{font-size:8px}th,td{padding:3px 2px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#378ADD;color:#fff;padding:7px 5px;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #2A6DB5;text-align:center}' +
    'td{padding:6px 8px;border:1px solid #ddd}' +
    '</style></head><body>';
  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #378ADD;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#378ADD">CONFRONTO VENDITE ' + anno1 + ' vs ' + anno2 + '</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Litri e fatturato imponibile — Ingrosso + Dettaglio</div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';
  html += '<table>' + righeHtml + '</table>';
  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#378ADD;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';
  var w = window.open('','_blank'); w.document.write(html); w.document.close();
}

// ── MARGINALITÀ PER CLIENTE ─────────────────────────────────────
let _chartMrcMargine = null, _chartMrcMargineLitro = null;

async function caricaMargineCliente() {
  // Popola selettori
  var selAnno = document.getElementById('mrc-anno');
  if (selAnno && selAnno.options.length === 0) {
    var ac = new Date().getFullYear();
    for (var y = ac; y >= ac - 5; y--) selAnno.innerHTML += '<option value="' + y + '"' + (y===ac?' selected':'') + '>' + y + '</option>';
  }

  var anno = selAnno ? selAnno.value : new Date().getFullYear();
  var mese = document.getElementById('mrc-mese')?.value || '';
  var da = anno + '-' + (mese || '01') + '-01';
  var ultimoGg = mese ? new Date(Number(anno), Number(mese), 0).getDate() : 31;
  var a = anno + '-' + (mese || '12') + '-' + String(ultimoGg).padStart(2,'0');

  var { data: ordiniRaw } = await sb.from('ordini').select('cliente,cliente_id,prodotto,litri,costo_litro,trasporto_litro,margine,iva').eq('tipo_ordine','cliente').neq('stato','annullato').gte('data',da).lte('data',a).range(0,999);
  // Paginazione: carica TUTTI gli ordini (fix >1000 righe)
  var ordini = ordiniRaw || [];
  if (ordini.length === 1000) {
    var from = 1000;
    while (true) {
      var { data: batch } = await sb.from('ordini').select('cliente,cliente_id,prodotto,litri,costo_litro,trasporto_litro,margine,iva').eq('tipo_ordine','cliente').neq('stato','annullato').gte('data',da).lte('data',a).range(from, from + 999);
      if (!batch || !batch.length) break;
      ordini = ordini.concat(batch);
      if (batch.length < 1000) break;
      from += 1000;
    }
  }

  // Carica info clienti per tipo
  var { data: clientiInfo } = await sb.from('clienti').select('id,nome,tipo,cliente_rete');
  var clientiMap = {};
  (clientiInfo||[]).forEach(function(c) { clientiMap[c.id] = c; clientiMap[c.nome] = c; });

  // Filtra per sottogruppo rete/consumo
  var sottogruppo = document.getElementById('mrc-sottogruppo')?.value || '';
  var ordiniFiltrati = (ordini||[]);
  if (sottogruppo === 'rete') {
    ordiniFiltrati = ordiniFiltrati.filter(function(o) { var info = clientiMap[o.cliente_id] || clientiMap[o.cliente]; return info && info.cliente_rete; });
  } else if (sottogruppo === 'consumo') {
    ordiniFiltrati = ordiniFiltrati.filter(function(o) { var info = clientiMap[o.cliente_id] || clientiMap[o.cliente]; return !info || !info.cliente_rete; });
  }

  // Aggrega per cliente
  var perCliente = {};
  ordiniFiltrati.forEach(function(o) {
    var key = o.cliente || '—';
    if (!perCliente[key]) perCliente[key] = { cliente:key, cliente_id:o.cliente_id, ordini:0, litri:0, fatturato:0, costo:0, margine:0 };
    var p = perCliente[key];
    var fatt = prezzoNoIva(o) * Number(o.litri);
    var marg = Number(o.margine) * Number(o.litri);
    var costo = (Number(o.costo_litro) + Number(o.trasporto_litro)) * Number(o.litri);
    p.ordini++;
    p.litri += Number(o.litri);
    p.fatturato += fatt;
    p.costo += costo;
    p.margine += marg;
  });

  var lista = Object.values(perCliente).sort(function(a,b) { return b.margine - a.margine; });
  var totale = { ordini:0, litri:0, fatturato:0, costo:0, margine:0 };
  lista.forEach(function(c) { totale.ordini+=c.ordini; totale.litri+=c.litri; totale.fatturato+=c.fatturato; totale.costo+=c.costo; totale.margine+=c.margine; });

  // KPI
  var kpiWrap = document.getElementById('mrc-kpi');
  var margMedio = totale.litri > 0 ? totale.margine / totale.litri : 0;
  var pctMarg = totale.fatturato > 0 ? (totale.margine / totale.fatturato) * 100 : 0;
  kpiWrap.innerHTML = '<div class="kpi"><div class="kpi-label">Clienti attivi</div><div class="kpi-value">' + lista.length + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Margine totale</div><div class="kpi-value" style="color:#639922">' + fmtMe(totale.margine) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Margine medio/L</div><div class="kpi-value">€ ' + margMedio.toFixed(4) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">% margine su fatt.</div><div class="kpi-value">' + pctMarg.toFixed(1) + '%</div></div>';

  // Tabella
  var tbody = document.getElementById('mrc-tabella');
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="9" class="loading">Nessun dato</td></tr>'; return; }

  var html = lista.map(function(c, idx) {
    var info = clientiMap[c.cliente_id] || clientiMap[c.cliente] || {};
    var tipo = info.tipo || '—';
    var ml = c.litri > 0 ? c.margine / c.litri : 0;
    var pct = c.fatturato > 0 ? (c.margine / c.fatturato) * 100 : 0;
    var mColor = c.margine >= 0 ? '#639922' : '#E24B4A';
    return '<tr' + (idx % 2 ? ' style="background:var(--bg)"' : '') + '>' +
      '<td><strong>' + esc(c.cliente) + '</strong></td>' +
      '<td><span class="badge ' + (info.cliente_rete ? 'purple' : 'gray') + '" style="font-size:9px">' + (info.cliente_rete ? 'Rete' : 'Consumo') + '</span></td>' +
      '<td style="text-align:center">' + c.ordini + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(c.litri) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtE(c.fatturato) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtE(c.costo) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:600;color:' + mColor + '">' + fmtMe(c.margine) + '</td>' +
      '<td style="font-family:var(--font-mono);color:' + mColor + '">€ ' + ml.toFixed(4) + '</td>' +
      '<td style="font-family:var(--font-mono);color:' + mColor + '">' + pct.toFixed(1) + '%</td></tr>';
  }).join('');

  // Riga totale
  var tmColor = totale.margine >= 0 ? '#639922' : '#E24B4A';
  html += '<tr style="border-top:2px solid var(--accent);font-weight:600"><td>TOTALE</td><td></td><td style="text-align:center">' + totale.ordini + '</td><td style="font-family:var(--font-mono)">' + fmtL(totale.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(totale.fatturato) + '</td><td style="font-family:var(--font-mono)">' + fmtE(totale.costo) + '</td><td style="font-family:var(--font-mono);color:' + tmColor + '">' + fmtMe(totale.margine) + '</td><td style="font-family:var(--font-mono);color:' + tmColor + '">€ ' + margMedio.toFixed(4) + '</td><td style="font-family:var(--font-mono);color:' + tmColor + '">' + pctMarg.toFixed(1) + '%</td></tr>';
  tbody.innerHTML = html;

  // Grafici
  var top10 = lista.slice(0, 10);
  var labels = top10.map(function(c) { return c.cliente.length > 15 ? c.cliente.substring(0,15) + '…' : c.cliente; });

  if (_chartMrcMargine) _chartMrcMargine.destroy();
  var ctx1 = document.getElementById('chart-mrc-margine');
  if (ctx1) {
    _chartMrcMargine = new Chart(ctx1, {
      type: 'bar', data: {
        labels: labels,
        datasets: [{ label: 'Margine €', data: top10.map(function(c){return Math.round(c.margine*100)/100;}), backgroundColor: top10.map(function(c){return c.margine>=0?'rgba(99,153,34,0.7)':'rgba(226,75,74,0.7)';}) }]
      }, options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
    });
  }

  if (_chartMrcMargineLitro) _chartMrcMargineLitro.destroy();
  var ctx2 = document.getElementById('chart-mrc-marginelitro');
  if (ctx2) {
    _chartMrcMargineLitro = new Chart(ctx2, {
      type: 'bar', data: {
        labels: labels,
        datasets: [{ label: '€/L', data: top10.map(function(c){return c.litri>0?Math.round((c.margine/c.litri)*10000)/10000:0;}), backgroundColor: 'rgba(55,138,221,0.7)' }]
      }, options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
    });
  }
}

async function stampaMargineCliente() {
  var w = _apriReport("Margine per Cliente"); if (!w) return;
  var anno = document.getElementById('mrc-anno').value;
  var mese = document.getElementById('mrc-mese')?.value || '';
  var meseNome = mese ? ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1] : 'Anno completo';
  var da = anno + '-' + (mese || '01') + '-01';
  var ultimoGg = mese ? new Date(Number(anno), Number(mese), 0).getDate() : 31;
  var a = anno + '-' + (mese || '12') + '-' + String(ultimoGg).padStart(2,'0');

  var { data: ordiniRaw } = await sb.from('ordini').select('cliente,cliente_id,litri,costo_litro,trasporto_litro,margine,iva').eq('tipo_ordine','cliente').neq('stato','annullato').gte('data',da).lte('data',a).range(0,999);
  var ordini = ordiniRaw || [];
  if (ordini.length === 1000) {
    var from = 1000;
    while (true) {
      var { data: batch } = await sb.from('ordini').select('cliente,cliente_id,litri,costo_litro,trasporto_litro,margine,iva').eq('tipo_ordine','cliente').neq('stato','annullato').gte('data',da).lte('data',a).range(from, from + 999);
      if (!batch || !batch.length) break;
      ordini = ordini.concat(batch);
      if (batch.length < 1000) break;
      from += 1000;
    }
  }
  var sottogruppo = document.getElementById('mrc-sottogruppo')?.value || '';
  var ordFiltrati = ordini || [];
  if (sottogruppo) {
    var { data: clInfo } = await sb.from('clienti').select('id,nome,cliente_rete');
    var clMap = {}; (clInfo||[]).forEach(function(c){clMap[c.id]=c;clMap[c.nome]=c;});
    ordFiltrati = ordFiltrati.filter(function(o) { var i = clMap[o.cliente_id]||clMap[o.cliente]; return sottogruppo==='rete'?(i&&i.cliente_rete):(!i||!i.cliente_rete); });
  }
  var sottLabel = sottogruppo === 'rete' ? ' — Solo Rete' : sottogruppo === 'consumo' ? ' — Solo Consumo' : '';
  var perCliente = {};
  ordFiltrati.forEach(function(o) {
    var k = o.cliente||'—';
    if (!perCliente[k]) perCliente[k] = { cliente:k, ordini:0, litri:0, fatturato:0, costo:0, margine:0 };
    var p = perCliente[k]; p.ordini++;
    var fatt = prezzoNoIva(o)*Number(o.litri); var marg = Number(o.margine)*Number(o.litri);
    p.litri+=Number(o.litri); p.fatturato+=fatt; p.costo+=(Number(o.costo_litro)+Number(o.trasporto_litro))*Number(o.litri); p.margine+=marg;
  });
  var lista = Object.values(perCliente).sort(function(a,b){return b.margine-a.margine;});
  var tot = { ordini:0, litri:0, fatturato:0, costo:0, margine:0 };
  lista.forEach(function(c){tot.ordini+=c.ordini;tot.litri+=c.litri;tot.fatturato+=c.fatturato;tot.costo+=c.costo;tot.margine+=c.margine;});

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Margine per Cliente</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:9px;margin:0;padding:8mm}@media print{.no-print{display:none!important}@page{size:landscape;margin:6mm}}table{width:100%;border-collapse:collapse}th{background:#6B5FCC;color:#fff;padding:5px 4px;font-size:8px;text-transform:uppercase;border:1px solid #5A4FBB;text-align:right}th:first-child{text-align:left}td{padding:3px 5px;border:1px solid #ddd;font-size:9px;text-align:right;font-family:Courier New,monospace}td:first-child{text-align:left;font-family:Arial;font-weight:500}.tot{background:#f0f0f0;font-weight:bold}.tot td{border-top:2px solid #6B5FCC}.alt{background:#fafaf8}</style></head><body>';
  html += '<div style="display:flex;justify-content:space-between;border-bottom:2px solid #6B5FCC;padding-bottom:8px;margin-bottom:10px"><div><div style="font-size:16px;font-weight:bold;color:#6B5FCC">MARGINALITÀ PER CLIENTE</div><div style="font-size:12px;color:#666;margin-top:2px">' + meseNome + ' ' + anno + sottLabel + '</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:bold">PHOENIX FUEL SRL</div></div></div>';
  html += '<table><thead><tr><th style="text-align:left">Cliente</th><th>Ordini</th><th>Litri</th><th>Fatturato</th><th>Costo</th><th>Margine</th><th>€/L</th><th>%</th></tr></thead><tbody>';
  lista.forEach(function(c,i) {
    var ml = c.litri>0?c.margine/c.litri:0; var pct = c.fatturato>0?(c.margine/c.fatturato)*100:0;
    html += '<tr' + (i%2?' class="alt"':'') + '><td>' + esc(c.cliente) + '</td><td style="text-align:center">' + c.ordini + '</td><td>' + fmtL(c.litri) + '</td><td>' + fmtE(c.fatturato) + '</td><td>' + fmtE(c.costo) + '</td><td style="font-weight:bold;color:' + (c.margine>=0?'#639922':'#E24B4A') + '">' + fmtMe(c.margine) + '</td><td>€ ' + ml.toFixed(4) + '</td><td>' + pct.toFixed(1) + '%</td></tr>';
  });
  var tMl = tot.litri>0?tot.margine/tot.litri:0; var tPct = tot.fatturato>0?(tot.margine/tot.fatturato)*100:0;
  html += '<tr class="tot"><td>TOTALE</td><td style="text-align:center">' + tot.ordini + '</td><td>' + fmtL(tot.litri) + '</td><td>' + fmtE(tot.fatturato) + '</td><td>' + fmtE(tot.costo) + '</td><td style="color:#639922">' + fmtMe(tot.margine) + '</td><td>€ ' + tMl.toFixed(4) + '</td><td>' + tPct.toFixed(1) + '%</td></tr>';
  html += '</tbody></table>';
  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

async function esportaMargineClienteExcel() {
  var anno = document.getElementById('mrc-anno').value;
  var mese = document.getElementById('mrc-mese')?.value || '';
  var meseNome = mese ? ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][Number(mese)-1] : 'Anno';
  var da = anno + '-' + (mese || '01') + '-01';
  var ultimoGg = mese ? new Date(Number(anno), Number(mese), 0).getDate() : 31;
  var a = anno + '-' + (mese || '12') + '-' + String(ultimoGg).padStart(2,'0');
  if (typeof XLSX === 'undefined') { toast('Libreria Excel non caricata'); return; }

  var { data: ordiniRaw } = await sb.from('ordini').select('cliente,cliente_id,litri,costo_litro,trasporto_litro,margine,iva').eq('tipo_ordine','cliente').neq('stato','annullato').gte('data',da).lte('data',a).range(0,999);
  var ordini = ordiniRaw || [];
  if (ordini.length === 1000) {
    var from = 1000;
    while (true) {
      var { data: batch } = await sb.from('ordini').select('cliente,cliente_id,litri,costo_litro,trasporto_litro,margine,iva').eq('tipo_ordine','cliente').neq('stato','annullato').gte('data',da).lte('data',a).range(from, from + 999);
      if (!batch || !batch.length) break;
      ordini = ordini.concat(batch);
      if (batch.length < 1000) break;
      from += 1000;
    }
  }
  var sottogruppo = document.getElementById('mrc-sottogruppo')?.value || '';
  var ordFiltrati = ordini || [];
  if (sottogruppo) {
    var { data: clInfo } = await sb.from('clienti').select('id,nome,cliente_rete');
    var clMap = {}; (clInfo||[]).forEach(function(c){clMap[c.id]=c;clMap[c.nome]=c;});
    ordFiltrati = ordFiltrati.filter(function(o) { var i = clMap[o.cliente_id]||clMap[o.cliente]; return sottogruppo==='rete'?(i&&i.cliente_rete):(!i||!i.cliente_rete); });
  }
  var sottLabel = sottogruppo === 'rete' ? '_Rete' : sottogruppo === 'consumo' ? '_Consumo' : '';
  var perCliente = {};
  ordFiltrati.forEach(function(o) {
    var k = o.cliente||'—';
    if (!perCliente[k]) perCliente[k] = { cliente:k, ordini:0, litri:0, fatturato:0, costo:0, margine:0 };
    var p = perCliente[k]; p.ordini++;
    var fatt = prezzoNoIva(o)*Number(o.litri); var marg = Number(o.margine)*Number(o.litri);
    p.litri+=Number(o.litri); p.fatturato+=fatt; p.costo+=(Number(o.costo_litro)+Number(o.trasporto_litro))*Number(o.litri); p.margine+=marg;
  });
  var lista = Object.values(perCliente).sort(function(a,b){return b.margine-a.margine;});

  var rows = [['Cliente','Ordini','Litri','Fatturato','Costo','Margine','€/L','% Margine']];
  lista.forEach(function(c) {
    var ml = c.litri>0?Math.round((c.margine/c.litri)*10000)/10000:0;
    var pct = c.fatturato>0?Math.round((c.margine/c.fatturato)*1000)/10:0;
    rows.push([c.cliente, c.ordini, Math.round(c.litri), Math.round(c.fatturato*100)/100, Math.round(c.costo*100)/100, Math.round(c.margine*100)/100, ml, pct]);
  });
  var ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:25},{wch:8},{wch:12},{wch:14},{wch:14},{wch:14},{wch:10},{wch:10}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Margine ' + meseNome + ' ' + anno);
  XLSX.writeFile(wb, 'MargineCliente_' + meseNome + '_' + anno + sottLabel + '.xlsx');
  toast('Excel margine clienti esportato!');
}

// ── CLIENTI ───────────────────────────────────────────────────────
async function salvaCliente(id=null) {
  const record = { nome:document.getElementById('cl-nome').value.trim(), tipo:document.getElementById('cl-tipo').value, cliente_rete:document.getElementById('cl-rete').checked, piva:document.getElementById('cl-piva').value, codice_fiscale:document.getElementById('cl-cf').value, indirizzo:document.getElementById('cl-indirizzo').value, citta:document.getElementById('cl-citta').value, provincia:document.getElementById('cl-provincia').value, telefono:document.getElementById('cl-telefono').value, email:document.getElementById('cl-email').value, giorni_pagamento:parseInt(document.getElementById('cl-gg').value), zona_consegna:document.getElementById('cl-zona').value, prodotti_abituali:document.getElementById('cl-prodotti').value, note:document.getElementById('cl-note').value };
  // Fido: solo admin può modificarlo
  var isAdmin = utenteCorrente && utenteCorrente.ruolo === 'admin';
  if (isAdmin) {
    record.fido_massimo = parseFloat(document.getElementById('cl-fido').value) || 0;
  }
  if (!record.nome) { toast('Inserisci il nome'); return; }
  let error, clienteId = id;
  if (id) { ({error}=await sb.from('clienti').update(record).eq('id',id)); }
  else {
    const res = await sb.from('clienti').insert([record]).select().single();
    error = res.error;
    if (res.data) clienteId = res.data.id;
  }
  if (error) { toast('Errore: '+error.message); return; }
  if (isAdmin && record.fido_massimo !== undefined) _auditLog('modifica_fido', 'clienti', record.nome + ' fido: ' + fmtE(record.fido_massimo));
  // Salva sedi di scarico
  if (clienteId) await salvaSediCliente(clienteId);
  toast(id?'Cliente aggiornato!':'Cliente salvato!');
  cacheClienti=[]; chiudiModal(); caricaClienti();
}

async function apriModaleCliente(id=null) {
  document.getElementById('modal-title').textContent = id ? 'Modifica cliente' : 'Nuovo cliente';
  document.getElementById('modal-save-btn').onclick = () => salvaCliente(id);
  ['cl-nome','cl-piva','cl-cf','cl-indirizzo','cl-citta','cl-provincia','cl-telefono','cl-email','cl-fido','cl-zona','cl-prodotti','cl-note'].forEach(c => { const el=document.getElementById(c); if(el) el.value=''; });
  document.getElementById('cl-tipo').value='azienda'; document.getElementById('cl-gg').value='30';
  document.getElementById('cl-rete').checked = false;
  document.getElementById('cl-sedi-lista').innerHTML = '';
  if (id) {
    const{data}=await sb.from('clienti').select('*').eq('id',id).single();
    if(data){ ['nome','piva','cf:codice_fiscale','indirizzo','citta','provincia','telefono','email'].forEach(f => { const[k,v]=f.split(':'); const el=document.getElementById('cl-'+(v||k)); if(el) el.value=data[v||k]||''; }); document.getElementById('cl-tipo').value=data.tipo||'azienda'; document.getElementById('cl-fido').value=data.fido_massimo||0; document.getElementById('cl-gg').value=data.giorni_pagamento||30; document.getElementById('cl-zona').value=data.zona_consegna||''; document.getElementById('cl-prodotti').value=data.prodotti_abituali||''; document.getElementById('cl-note').value=data.note||''; document.getElementById('cl-rete').checked = !!data.cliente_rete; }
    await caricaSediCliente(id);
  } else {
    document.getElementById('cl-sedi-wrap').style.display = 'block';
  }
  // Fido: solo admin può modificarlo
  var fidoEl = document.getElementById('cl-fido');
  if (fidoEl) {
    var isAdmin = utenteCorrente && utenteCorrente.ruolo === 'admin';
    fidoEl.disabled = !isAdmin;
    fidoEl.style.opacity = isAdmin ? '1' : '0.5';
    fidoEl.title = isAdmin ? '' : 'Solo l\'amministratore può modificare il fido';
  }
  document.getElementById('modal-overlay').style.display='flex';
  document.getElementById('modal-clienti').style.display='block';
  document.getElementById('modal-fornitori').style.display='none';
}

async function caricaClienti() {
  const { data } = await sb.from('clienti').select('*').order('nome');
  const tbody = document.getElementById('tabella-clienti');
  if (!data||!data.length) { tbody.innerHTML = '<tr><td colspan="13" class="loading">Nessun cliente</td></tr>'; return; }

  var attivi = data.filter(function(r){ return r.attivo !== false; });
  var inattivi = data.filter(function(r){ return r.attivo === false; });

  // Carica ordini non pagati per fido
  const clientiConFido = data.filter(r => Number(r.fido_massimo||0) > 0);
  let ordiniMap = {};
  if (clientiConFido.length) {
    const { data: ordNonPagati } = await sb.from('ordini').select('cliente,cliente_id,data,costo_litro,trasporto_litro,margine,iva,litri,giorni_pagamento,pagato').neq('stato','annullato').eq('pagato', false);
    (ordNonPagati||[]).forEach(o => {
      const key = o.cliente_id || o.cliente;
      if (!ordiniMap[key]) ordiniMap[key] = [];
      ordiniMap[key].push(o);
    });
  }

  function rigaCliente(r) {
    let fidoUsatoHtml = '—', fidoResiduoHtml = '—';
    const fidoMax = Number(r.fido_massimo || 0);
    if (fidoMax > 0) {
      const ordini = (ordiniMap[r.id]||[]).concat(ordiniMap[r.nome]||[]);
      const seen = new Set();
      let usato = 0;
      ordini.forEach(o => {
        const k = o.cliente_id + '_' + o.data + '_' + o.litri;
        if (seen.has(k)) return; seen.add(k);
        const scad = new Date(o.data);
        scad.setDate(scad.getDate() + (o.giorni_pagamento || r.giorni_pagamento || 30));
        if (scad > oggi) usato += prezzoConIva(o) * Number(o.litri);
      });
      const residuo = fidoMax - usato;
      fidoUsatoHtml = '<span style="font-family:var(--font-mono)">' + fmtE(usato) + '</span>';
      fidoResiduoHtml = fidoBar(usato, fidoMax) + ' <span style="font-size:11px;font-family:var(--font-mono)">' + fmtE(residuo) + '</span>';
    }
    return '<tr><td><strong>' + esc(r.nome) + '</strong></td><td><span class="badge blue">' + esc(r.tipo||'azienda') + '</span></td><td>' + (r.cliente_rete ? '<span class="badge purple">Rete</span>' : '<span class="badge gray">Consumo</span>') + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.piva||'—') + '</td><td>' + esc(r.citta||'—') + '</td><td>' + esc(r.telefono||'—') + '</td><td style="font-family:var(--font-mono)">' + (fidoMax>0?fmtE(fidoMax):'—') + '</td><td>' + fidoUsatoHtml + '</td><td>' + fidoResiduoHtml + '</td><td>' + (r.giorni_pagamento||30) + ' gg</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.prodotti_abituali||'—') + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td><button class="btn-primary" style="font-size:11px;padding:4px 10px" onclick="apriSchedaCliente(\'' + r.id + '\',\'' + esc(r.nome).replace(/'/g,"\\'") + '\')">📋 Scheda</button> <button class="btn-edit" onclick="apriModaleCliente(\'' + r.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'clienti\',\'' + r.id + '\',caricaClienti)">x</button></td></tr>';
  }

  var html = attivi.map(rigaCliente).join('');
  if (inattivi.length) {
    html += '<tr><td colspan="13" style="background:var(--bg);padding:12px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;border-top:2px solid var(--border)">Clienti inattivi (' + inattivi.length + ')</td></tr>';
    html += inattivi.map(function(r) { return rigaCliente(r).replace('<tr>', '<tr style="opacity:0.5">'); }).join('');
  }
  tbody.innerHTML = html;
}

function filtraClienti() {
  const q = (document.getElementById('search-clienti').value||'').toLowerCase();
  const righe = document.querySelectorAll('#tabella-clienti tr');
  righe.forEach(tr => {
    if (tr.querySelector('td[colspan]')) { tr.style.display = q ? 'none' : ''; return; }
    const testo = tr.textContent.toLowerCase();
    tr.style.display = !q || testo.includes(q) ? '' : 'none';
  });
}

// ── SCHEDA CLIENTE CON GESTIONE PAGAMENTI ────────────────────────
async function apriSchedaCliente(clienteId, clienteNome) {
  const { data: cliente } = await sb.from('clienti').select('*').eq('id', clienteId).single();
  if (!cliente) { toast('Cliente non trovato'); return; }

  const { data: ordini } = await sb.from('ordini').select('id,data,prodotto,litri,costo_litro,trasporto_litro,margine,iva,stato,pagato,data_pagamento,data_scadenza,giorni_pagamento,note_pagamento').or('cliente_id.eq.' + clienteId + ',cliente.eq.' + clienteNome).neq('stato','annullato').order('data',{ascending:false}).limit(500);

  const fidoMax = Number(cliente.fido_massimo || 0);
  let fidoUsato = 0;
  (ordini||[]).forEach(o => {
    if (o.pagato) return; // Se pagato non conta nel fido
    const scad = new Date(o.data);
    scad.setDate(scad.getDate() + (o.giorni_pagamento || cliente.giorni_pagamento || 30));
    if (scad > oggi) fidoUsato += prezzoConIva(o) * Number(o.litri);
  });
  const fidoResiduo = fidoMax - fidoUsato;
  const pctFido = fidoMax > 0 ? Math.round((fidoUsato / fidoMax) * 100) : 0;

  let html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px">';
  html += '<div><div style="font-size:18px;font-weight:500">' + esc(clienteNome) + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">' + esc(cliente.tipo||'azienda') + ' · ' + (cliente.cliente_rete ? '<span class="badge purple" style="font-size:10px">Rete</span>' : '<span class="badge gray" style="font-size:10px">Consumo</span>') + ' · ' + esc(cliente.citta||'—') + ' · P.IVA: ' + esc(cliente.piva||'—') + '</div></div>';
  if (fidoMax > 0) {
    const fidoColor = pctFido >= 90 ? '#A32D2D' : pctFido >= 60 ? '#BA7517' : '#639922';
    html += '<div style="text-align:right"><div style="font-size:10px;color:var(--text-hint);text-transform:uppercase">Fido</div>';
    html += '<div style="font-size:16px;font-weight:500;font-family:var(--font-mono);color:' + fidoColor + '">' + fmtE(fidoResiduo) + ' <span style="font-size:11px;color:var(--text-muted)">/ ' + fmtE(fidoMax) + '</span></div>';
    html += '<div style="height:4px;width:100%;max-width:120px;background:var(--bg-kpi);border-radius:2px;margin-top:4px"><div style="height:100%;width:' + Math.min(100,pctFido) + '%;background:' + fidoColor + ';border-radius:2px"></div></div></div>';
  }
  html += '</div>';

  // Tabella ordini con gestione pagamenti
  html += '<div style="max-height:400px;overflow-y:auto">';
  html += '<table style="width:100%;font-size:12px"><thead><tr><th>Data</th><th>Prodotto</th><th>Litri</th><th>Prezzo/L</th><th>Totale</th><th>Scadenza</th><th>Pagato</th><th>Data pag.</th><th></th></tr></thead><tbody>';

  if (!ordini || !ordini.length) {
    html += '<tr><td colspan="9" class="loading">Nessun ordine</td></tr>';
  } else {
    ordini.forEach(o => {
      const tot = prezzoConIva(o) * Number(o.litri);
      const scadData = o.data_scadenza ? fmtD(o.data_scadenza) : '—';
      const isPagato = o.pagato === true;
      const isScaduto = !isPagato && o.data_scadenza && new Date(o.data_scadenza) < oggi;
      const rowStyle = isPagato ? 'opacity:0.5' : isScaduto ? 'background:#FCEBEB' : '';

      html += '<tr style="' + rowStyle + '">';
      html += '<td>' + fmtD(o.data) + '</td>';
      html += '<td>' + o.prodotto + '</td>';
      html += '<td style="font-family:var(--font-mono)">' + fmtL(o.litri) + '</td>';
      html += '<td style="font-family:var(--font-mono)">' + fmt(prezzoConIva(o)) + '</td>';
      html += '<td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td>';
      html += '<td>' + scadData + (isScaduto ? ' <span style="color:#A32D2D;font-size:10px;font-weight:500">SCADUTO</span>' : '') + '</td>';
      html += '<td><input type="checkbox" ' + (isPagato ? 'checked' : '') + ' onchange="togglePagamento(\'' + o.id + '\',this.checked,\'' + clienteId + '\',\'' + clienteNome.replace(/'/g,"\\'") + '\')" /></td>';
      html += '<td>';
      if (isPagato && o.data_pagamento) {
        html += '<span style="font-size:11px;color:#639922">' + fmtD(o.data_pagamento) + '</span>';
      } else if (!isPagato && o.data_pagamento && o.data_pagamento > oggiISO) {
        html += '<span style="font-size:11px;color:#378ADD">' + fmtD(o.data_pagamento) + '</span> <span style="font-size:9px;color:#378ADD;font-weight:500">PROGRAMMATO</span>';
        html += '<br/><input type="date" style="font-size:10px;padding:1px 3px;border:0.5px solid var(--border);border-radius:4px;background:var(--bg);margin-top:2px" value="' + o.data_pagamento + '" onchange="impostaDataPagamento(\'' + o.id + '\',this.value,\'' + clienteId + '\',\'' + clienteNome.replace(/'/g,"\\'") + '\')" />';
      } else {
        html += '<input type="date" style="font-size:11px;padding:2px 4px;border:0.5px solid var(--border);border-radius:4px;background:var(--bg)" value="' + (o.data_pagamento||'') + '" onchange="impostaDataPagamento(\'' + o.id + '\',this.value,\'' + clienteId + '\',\'' + clienteNome.replace(/'/g,"\\'") + '\')" />';
      }
      html += '</td>';
      html += '<td style="font-size:10px;color:var(--text-muted)">' + (o.note_pagamento||'') + '</td>';
      html += '</tr>';
    });
  }

  html += '</tbody></table></div>';

  // Riepilogo
  const totOrdini = (ordini||[]).length;
  const totPagati = (ordini||[]).filter(o => o.pagato).length;
  const totDaPagare = (ordini||[]).filter(o => !o.pagato).length;
  const totScaduti = (ordini||[]).filter(o => !o.pagato && o.data_scadenza && new Date(o.data_scadenza) < oggi).length;
  html += '<div style="display:flex;gap:16px;margin-top:12px;font-size:11px;color:var(--text-muted);flex-wrap:wrap">';
  html += '<span>Totale ordini: <strong>' + totOrdini + '</strong></span>';
  html += '<span style="color:#639922">Pagati: <strong>' + totPagati + '</strong></span>';
  html += '<span>Da pagare: <strong>' + totDaPagare + '</strong></span>';
  if (totScaduti > 0) html += '<span style="color:#A32D2D">Scaduti: <strong>' + totScaduti + '</strong></span>';
  html += '</div>';

  html += '<button class="btn-primary" style="width:100%;margin-top:14px" onclick="chiudiModalePermessi()">Chiudi</button>';
  apriModal(html);
}

// ── SEDI DI SCARICO (inline nel form cliente) ───────────────────
function aggiungiRigaSede(s) {
  const lista = document.getElementById('cl-sedi-lista');
  const div = document.createElement('div');
  div.className = 'cl-sede-row';
  div.dataset.id = s ? s.id : 'new';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px;padding:10px;background:var(--bg-kpi);border-radius:8px';
  div.innerHTML = '<div class="form-group"><label>Nome sede</label><input type="text" class="sede-r-nome" value="' + esc(s ? s.nome : '') + '" placeholder="Es. Cantiere Via Roma" /></div>' +
    '<div class="form-group"><label>Indirizzo</label><input type="text" class="sede-r-indirizzo" value="' + esc(s ? s.indirizzo || '' : '') + '" /></div>' +
    '<div class="form-group"><label>Città</label><input type="text" class="sede-r-citta" value="' + esc(s ? s.citta || '' : '') + '" /></div>' +
    '<div style="display:flex;flex-direction:column;gap:4px;align-items:center"><button class="btn-danger" onclick="this.closest(\'.cl-sede-row\').remove()" title="Rimuovi">x</button>' +
    '<label style="font-size:10px;display:flex;align-items:center;gap:3px;cursor:pointer"><input type="radio" name="sede-default" class="sede-r-default" ' + (s && s.is_default ? 'checked' : '') + ' /> def.</label></div>';
  lista.appendChild(div);
}

async function caricaSediCliente(clienteId) {
  const wrap = document.getElementById('cl-sedi-wrap');
  const lista = document.getElementById('cl-sedi-lista');
  if (!clienteId) { wrap.style.display = 'none'; lista.innerHTML = ''; return; }
  wrap.style.display = 'block';
  lista.innerHTML = '';
  const { data: sedi } = await sb.from('sedi_scarico').select('*').eq('cliente_id', clienteId).eq('attivo', true).order('is_default',{ascending:false}).order('nome');
  if (sedi && sedi.length) {
    sedi.forEach(s => aggiungiRigaSede(s));
  }
}

async function salvaSediCliente(clienteId) {
  if (!clienteId) return;
  const righe = document.querySelectorAll('.cl-sede-row');
  const idsPresenti = [];

  for (const row of righe) {
    const sedeId = row.dataset.id;
    const nome = row.querySelector('.sede-r-nome').value.trim();
    const indirizzo = row.querySelector('.sede-r-indirizzo').value;
    const citta = row.querySelector('.sede-r-citta').value;
    const is_default = row.querySelector('.sede-r-default').checked;
    if (!nome) continue;

    const record = { cliente_id: clienteId, nome, indirizzo, citta, is_default };

    if (sedeId && sedeId !== 'new') {
      await sb.from('sedi_scarico').update(record).eq('id', sedeId);
      idsPresenti.push(sedeId);
    } else {
      const { data: nuovo } = await sb.from('sedi_scarico').insert([record]).select().single();
      if (nuovo) idsPresenti.push(nuovo.id);
    }
  }

  // Disattiva sedi rimosse
  const { data: tuttiDb } = await sb.from('sedi_scarico').select('id').eq('cliente_id', clienteId).eq('attivo', true);
  if (tuttiDb) {
    for (const s of tuttiDb) {
      if (!idsPresenti.includes(s.id)) {
        await sb.from('sedi_scarico').update({ attivo: false }).eq('id', s.id);
      }
    }
  }
}

async function togglePagamento(ordineId, pagato, clienteId, clienteNome) {
  const update = { pagato };
  if (pagato) {
    update.data_pagamento = new Date().toISOString().split('T')[0];
  } else {
    update.data_pagamento = null;
  }
  const { error } = await sb.from('ordini').update(update).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  toast(pagato ? 'Ordine segnato come pagato' : 'Pagamento rimosso');
  apriSchedaCliente(clienteId, clienteNome);
}

async function impostaDataPagamento(ordineId, data, clienteId, clienteNome) {
  if (!data) return;
  const isPagato = data <= oggiISO; // Pagato solo se data è oggi o passata
  const { error } = await sb.from('ordini').update({ data_pagamento: data, pagato: isPagato }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  if (isPagato) {
    toast('Ordine segnato come pagato');
  } else {
    toast('Pagamento programmato per il ' + new Date(data).toLocaleDateString('it-IT'));
  }
  apriSchedaCliente(clienteId, clienteNome);
}

// ── SCADENZARIO CREDITI ──────────────────────────────────────────
async function caricaScadenzario() {
  // 1 sola query: tutti ordini non pagati tipo cliente
  const { data: ordini } = await sb.from('ordini').select('id,data,cliente,cliente_id,prodotto,litri,costo_litro,trasporto_litro,margine,iva,giorni_pagamento,stato').eq('tipo_ordine','cliente').neq('stato','annullato').eq('pagato',false);
  const { data: clienti } = await sb.from('clienti').select('id,nome,cliente_rete,fido_massimo,giorni_pagamento');

  const clMap = {};
  (clienti||[]).forEach(c => { clMap[c.nome] = c; if (c.id) clMap[c.id] = c; });

  const oggiMs = oggi.getTime();
  const MS_DAY = 86400000;

  // Fasce aging
  const fasce = [
    { label: 'Non scaduto', min: -Infinity, max: 0, ordini: 0, importo: 0, color: '#639922', bg: '#EAF3DE' },
    { label: 'Scaduto 1–30 gg', min: 1, max: 30, ordini: 0, importo: 0, color: '#BA7517', bg: '#FAEEDA' },
    { label: 'Scaduto 31–60 gg', min: 31, max: 60, ordini: 0, importo: 0, color: '#D85A30', bg: '#FDE8D8' },
    { label: 'Scaduto 61–90 gg', min: 61, max: 90, ordini: 0, importo: 0, color: '#A32D2D', bg: '#FCEBEB' },
    { label: 'Scaduto oltre 90 gg', min: 91, max: Infinity, ordini: 0, importo: 0, color: '#791F1F', bg: '#F5D5D5' }
  ];

  let totCrediti = 0, totScaduti = 0, totInScadenza = 0, totOk = 0;
  const perCliente = {};

  (ordini||[]).forEach(o => {
    const cl = clMap[o.cliente_id] || clMap[o.cliente] || {};
    const ggPag = o.giorni_pagamento || cl.giorni_pagamento || 30;
    const scadenza = new Date(o.data);
    scadenza.setDate(scadenza.getDate() + ggPag);
    const ggScaduto = Math.floor((oggiMs - scadenza.getTime()) / MS_DAY);
    const importo = prezzoConIva(o) * Number(o.litri);

    totCrediti += importo;
    if (ggScaduto > 0) totScaduti += importo;
    else if (ggScaduto > -30) totInScadenza += importo;
    else totOk += importo;

    // Fascia aging
    for (const f of fasce) {
      if (ggScaduto >= f.min && ggScaduto <= f.max) {
        f.ordini++; f.importo += importo; break;
      }
    }

    // Per cliente
    const nomeC = o.cliente || '—';
    if (!perCliente[nomeC]) perCliente[nomeC] = { ordini: 0, importo: 0, scaduto: 0, maxGgScaduto: 0, rete: cl.cliente_rete || false, fidoMax: Number(cl.fido_massimo || 0) };
    perCliente[nomeC].ordini++;
    perCliente[nomeC].importo += importo;
    if (ggScaduto > 0) {
      perCliente[nomeC].scaduto += importo;
      perCliente[nomeC].maxGgScaduto = Math.max(perCliente[nomeC].maxGgScaduto, ggScaduto);
    }
  });

  // KPI
  document.getElementById('scad-totale').textContent = fmtE(totCrediti);
  document.getElementById('scad-scaduti').textContent = fmtE(totScaduti);
  document.getElementById('scad-inscadenza').textContent = fmtE(totInScadenza);
  document.getElementById('scad-ok').textContent = fmtE(totOk);

  // Tabella aging fasce
  const tbFasce = document.getElementById('scad-aging-fasce');
  tbFasce.innerHTML = fasce.map(f => {
    const pct = totCrediti > 0 ? Math.round((f.importo / totCrediti) * 100) : 0;
    return '<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + f.color + ';margin-right:6px"></span><strong>' + f.label + '</strong></td><td style="font-family:var(--font-mono)">' + f.ordini + '</td><td style="font-family:var(--font-mono)">' + fmtE(f.importo) + '</td><td><div style="display:flex;align-items:center;gap:6px"><div style="height:8px;width:' + pct + '%;max-width:100px;background:' + f.color + ';border-radius:4px"></div><span style="font-size:11px;font-family:var(--font-mono)">' + pct + '%</span></div></td></tr>';
  }).join('') + '<tr style="font-weight:bold;border-top:2px solid var(--border)"><td>TOTALE</td><td style="font-family:var(--font-mono)">' + (ordini||[]).length + '</td><td style="font-family:var(--font-mono)">' + fmtE(totCrediti) + '</td><td>100%</td></tr>';

  // Tabella dettaglio per cliente (ordinata per scaduto desc)
  const clArr = Object.entries(perCliente).sort((a, b) => b[1].scaduto - a[1].scaduto);
  const tbDett = document.getElementById('scad-dettaglio');
  tbDett.innerHTML = clArr.map(([nome, v]) => {
    const pctFido = v.fidoMax > 0 ? Math.round((v.importo / v.fidoMax) * 100) : 0;
    const fidoColor = pctFido >= 90 ? '#A32D2D' : pctFido >= 60 ? '#BA7517' : '#639922';
    const scadColor = v.maxGgScaduto > 90 ? '#791F1F' : v.maxGgScaduto > 60 ? '#A32D2D' : v.maxGgScaduto > 30 ? '#D85A30' : v.maxGgScaduto > 0 ? '#BA7517' : '#639922';
    return '<tr>' +
      '<td><strong>' + esc(nome) + '</strong></td>' +
      '<td>' + (v.rete ? '<span class="badge purple">Rete</span>' : '<span class="badge gray">Consumo</span>') + '</td>' +
      '<td style="font-family:var(--font-mono)">' + v.ordini + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtE(v.importo) + '</td>' +
      '<td style="font-family:var(--font-mono);color:' + (v.scaduto > 0 ? '#A32D2D' : 'var(--text-muted)') + ';font-weight:' + (v.scaduto > 0 ? '600' : '400') + '">' + (v.scaduto > 0 ? fmtE(v.scaduto) : '—') + '</td>' +
      '<td style="font-family:var(--font-mono);color:' + scadColor + ';font-weight:500">' + (v.maxGgScaduto > 0 ? v.maxGgScaduto + ' gg' : '—') + '</td>' +
      '<td style="font-family:var(--font-mono)">' + (v.fidoMax > 0 ? fmtE(v.fidoMax) : '—') + '</td>' +
      '<td>' + (v.fidoMax > 0 ? '<span style="font-family:var(--font-mono);color:' + fidoColor + ';font-weight:500">' + pctFido + '%</span>' : '—') + '</td>' +
      '</tr>';
  }).join('');

  if (!clArr.length) tbDett.innerHTML = '<tr><td colspan="8" class="loading">Nessun credito aperto</td></tr>';
  toast('Scadenzario aggiornato: ' + (ordini||[]).length + ' ordini aperti');
}

function stampaScadenzario() {
  const kpiTot = document.getElementById('scad-totale').textContent;
  const kpiScad = document.getElementById('scad-scaduti').textContent;
  const kpiInScad = document.getElementById('scad-inscadenza').textContent;
  const kpiOk = document.getElementById('scad-ok').textContent;
  if (kpiTot === '—') { toast('Prima aggiorna lo scadenzario'); return; }

  const tblFasce = document.getElementById('scad-aging-fasce').closest('table').outerHTML;
  const tblDett = document.getElementById('scad-dettaglio').closest('table').outerHTML;

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scadenzario Crediti</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm;color:#000}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:9px}table{font-size:8px}th,td{padding:3px 2px!important}.kpi-grid{grid-template-columns:1fr 1fr!important}}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:14px}' +
    'th{background:#378ADD;color:#fff;padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #2A6DB5;text-align:left}' +
    'td{padding:5px 8px;border:1px solid #ddd}' +
    '.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}' +
    '.kpi-box{border-radius:8px;padding:14px;text-align:center;border:1px solid #ddd}' +
    '.kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}' +
    '.kpi-val{font-size:18px;font-weight:bold;font-family:Courier New,monospace}' +
    '.badge{display:inline-block;padding:2px 6px;border-radius:10px;font-size:9px;font-weight:500}' +
    '.badge.purple{background:#EEEDFE;color:#26215C}.badge.gray{background:#eee;color:#666}' +
    '</style></head><body>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #378ADD;padding-bottom:10px;margin-bottom:14px">' +
    '<div><div style="font-size:18px;font-weight:bold;color:#378ADD">SCADENZARIO CREDITI CLIENTI</div>' +
    '<div style="font-size:12px;color:#666;margin-top:3px">Generato il ' + oggi.toLocaleDateString('it-IT') + '</div></div>' +
    '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div></div></div>' +
    '<div class="kpi-grid">' +
    '<div class="kpi-box" style="background:#E6F1FB;border-color:#B8D4F0"><div class="kpi-label" style="color:#0C447C">Totale crediti</div><div class="kpi-val">' + kpiTot + '</div></div>' +
    '<div class="kpi-box" style="background:#FCEBEB;border-color:#E8AAAA"><div class="kpi-label" style="color:#791F1F">Scaduti</div><div class="kpi-val" style="color:#A32D2D">' + kpiScad + '</div></div>' +
    '<div class="kpi-box" style="background:#FAEEDA;border-color:#E8D5A8"><div class="kpi-label" style="color:#633806">In scadenza 30gg</div><div class="kpi-val" style="color:#BA7517">' + kpiInScad + '</div></div>' +
    '<div class="kpi-box" style="background:#EAF3DE;border-color:#B8D4A0"><div class="kpi-label" style="color:#27500A">Entro termini</div><div class="kpi-val" style="color:#639922">' + kpiOk + '</div></div>' +
    '</div>' +
    '<div style="font-size:12px;font-weight:bold;color:#378ADD;text-transform:uppercase;margin-bottom:8px">Aging per fascia</div>' +
    tblFasce.replace(/var\(--font-mono\)/g,'Courier New,monospace').replace(/var\(--border\)/g,'#ddd').replace(/var\(--text-muted\)/g,'#666') +
    '<div style="font-size:12px;font-weight:bold;color:#378ADD;text-transform:uppercase;margin-bottom:8px;margin-top:16px">Dettaglio per cliente</div>' +
    tblDett.replace(/var\(--font-mono\)/g,'Courier New,monospace').replace(/var\(--border\)/g,'#ddd').replace(/var\(--text-muted\)/g,'#666') +
    '<div style="text-align:center;font-size:9px;color:#aaa;margin-top:20px;border-top:1px solid #ddd;padding-top:8px">PhoenixFuel Srl — Report generato il ' + oggi.toLocaleDateString('it-IT') + ' — Documento interno</div>' +
    '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">' +
    '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#378ADD;color:#fff">🖨️ Stampa / PDF</button>' +
    '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#666;color:#fff">✕ Chiudi</button></div>' +
    '</body></html>';

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ── FORNITORI ─────────────────────────────────────────────────────
async function caricaCheckboxBasi(selectedIds=[]) {
  const{data}=await sb.from('basi_carico').select('id,nome').eq('attivo',true).order('nome');
  const wrap = document.getElementById('fo-basi-check');
  if (!wrap) return;
  wrap.innerHTML = data ? data.map(b => '<label class="check-label"><input type="checkbox" value="' + b.id + '"' + (selectedIds.includes(b.id)?' checked':'') + '/> ' + b.nome + '</label>').join('') : '';
}

async function salvaFornitore(id=null) {
  const record = { nome:document.getElementById('fo-nome').value.trim(), ragione_sociale:document.getElementById('fo-ragione').value, piva:document.getElementById('fo-piva').value, indirizzo:document.getElementById('fo-indirizzo').value, citta:document.getElementById('fo-citta').value, telefono:document.getElementById('fo-telefono').value, email:document.getElementById('fo-email').value, contatto:document.getElementById('fo-contatto').value, fido_massimo:parseFloat(document.getElementById('fo-fido').value)||0, giorni_pagamento:parseInt(document.getElementById('fo-gg').value), note:document.getElementById('fo-note').value, colore:document.getElementById('fo-colore').value||'#FAEEDA' };
  if (!record.nome) { toast('Inserisci il nome'); return; }
  let foId = id;
  if (id) { const{error}=await sb.from('fornitori').update(record).eq('id',id); if(error){toast('Errore: '+error.message);return;} }
  else { const{data:fo,error}=await sb.from('fornitori').insert([record]).select().single(); if(error){toast('Errore: '+error.message);return;} foId=fo.id; }
  await sb.from('fornitori_basi').delete().eq('fornitore_id',foId);
  const checks = document.querySelectorAll('#fo-basi-check input:checked');
  if (checks.length) await sb.from('fornitori_basi').insert(Array.from(checks).map(c=>({fornitore_id:foId,base_carico_id:c.value})));
  toast(id?'Fornitore aggiornato!':'Fornitore salvato!');
  cacheFornitori=[]; chiudiModal(); caricaFornitori();
}

async function apriModaleFornitore(id=null) {
  document.getElementById('modal-title').textContent = id ? 'Modifica fornitore' : 'Nuovo fornitore';
  document.getElementById('modal-save-btn').onclick = () => salvaFornitore(id);
  ['fo-nome','fo-ragione','fo-piva','fo-indirizzo','fo-citta','fo-telefono','fo-email','fo-contatto','fo-fido','fo-note'].forEach(c => { const el=document.getElementById(c); if(el) el.value=''; });
  document.getElementById('fo-gg').value='30';
  let selectedBasi=[];
  if (id) {
    const{data}=await sb.from('fornitori').select('*, fornitori_basi(base_carico_id)').eq('id',id).single();
    if(data){ document.getElementById('fo-nome').value=data.nome||''; document.getElementById('fo-ragione').value=data.ragione_sociale||''; document.getElementById('fo-piva').value=data.piva||''; document.getElementById('fo-indirizzo').value=data.indirizzo||''; document.getElementById('fo-citta').value=data.citta||''; document.getElementById('fo-telefono').value=data.telefono||''; document.getElementById('fo-email').value=data.email||''; document.getElementById('fo-contatto').value=data.contatto||''; document.getElementById('fo-fido').value=data.fido_massimo||0; document.getElementById('fo-gg').value=data.giorni_pagamento||30; document.getElementById('fo-note').value=data.note||''; document.getElementById('fo-colore').value=data.colore||'#FAEEDA'; selectedBasi=data.fornitori_basi?data.fornitori_basi.map(fb=>fb.base_carico_id):[]; }
  }
  await caricaCheckboxBasi(selectedBasi);
  document.getElementById('modal-overlay').style.display='flex';
  document.getElementById('modal-fornitori').style.display='block';
  document.getElementById('modal-clienti').style.display='none';
}

function fidoBar(usato, max) {
  if (!max) return '—';
  const pct = Math.min(100,Math.round((usato/max)*100));
  const cls = pct<60?'fido-ok':pct<85?'fido-warn':'fido-danger';
  return '<div class="fido-bar-wrap"><div class="fido-bar"><div class="fido-fill ' + cls + '" style="width:' + pct + '%"></div></div><span style="font-size:10px">' + pct + '%</span></div>';
}

async function caricaFornitori() {
  const{data}=await sb.from('fornitori').select('*, fornitori_basi(base_carico_id, basi_carico(nome))').order('nome');
  const tbody=document.getElementById('tabella-fornitori');
  if (!data||!data.length){tbody.innerHTML='<tr><td colspan="12" class="loading">Nessun fornitore</td></tr>';return;}

  // Carica TUTTI gli ordini per fido fornitori in UNA query
  const fornConFido = data.filter(r => Number(r.fido_massimo||0) > 0 || Number(r.fido||0) > 0);
  let ordFornMap = {};
  if (fornConFido.length) {
    const nomi = fornConFido.map(f => f.nome);
    var limiteAnno = new Date(); limiteAnno.setFullYear(limiteAnno.getFullYear()-1);
    var limiteAnnoISO = limiteAnno.toISOString().split('T')[0];
    const { data: ordTutti } = await sb.from('ordini').select('fornitore,data,costo_litro,trasporto_litro,litri,giorni_pagamento,pagato_fornitore').neq('stato','annullato').in('fornitore', nomi).gte('data',limiteAnnoISO);
    (ordTutti||[]).forEach(o => {
      if (!ordFornMap[o.fornitore]) ordFornMap[o.fornitore] = [];
      ordFornMap[o.fornitore].push(o);
    });
  }

  tbody.innerHTML = data.map(r => {
    let usato = 0, residuo = 0;
    const fidoMax = Number(r.fido_massimo||0) || Number(r.fido||0);
    const ggPag = r.giorni_pagamento || 30;
    if (fidoMax > 0) {
      const ords = ordFornMap[r.nome] || [];
      ords.forEach(o => {
        if (o.pagato_fornitore) return;
        // SEMPRE ggPag del fornitore, non quello salvato sull'ordine
        if (o.data) {
          var scad = new Date(o.data);
          scad.setDate(scad.getDate() + ggPag);
          if (scad <= oggi) return; // Scaduta = pagata
        }
        usato += (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri);
      });
      residuo = fidoMax - usato;
    }
    const basi=r.fornitori_basi?r.fornitori_basi.map(fb=>fb.basi_carico?.nome).filter(Boolean).join(', '):'—';
    return '<tr><td><strong>' + esc(r.nome) + '</strong></td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.piva||'—') + '</td><td>' + esc(r.citta||'—') + '</td><td>' + esc(r.contatto||'—') + '</td><td>' + esc(r.telefono||'—') + '</td><td style="font-family:var(--font-mono)">' + (fidoMax>0?fmtE(fidoMax):'—') + '</td><td style="font-family:var(--font-mono)">' + (fidoMax>0?fmtE(usato):'—') + '</td><td>' + (fidoMax>0?fidoBar(usato,fidoMax)+' <span style="font-size:11px;font-family:var(--font-mono);color:'+(residuo<0?'#A32D2D':'inherit')+';font-weight:'+(residuo<0?'600':'normal')+'">'+fmtE(residuo)+'</span>':'—') + '</td><td>' + ggPag + ' gg</td><td style="font-size:11px;color:var(--text-muted)">' + esc(basi) + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td><button class="btn-primary" style="font-size:11px;padding:4px 10px" onclick="apriSchedaFornitore(\'' + r.id + '\',\'' + String(r.nome||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">📋 Scheda</button> <button class="btn-edit" onclick="apriModaleFornitore(\'' + r.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'fornitori\',\'' + r.id + '\',caricaFornitori)">x</button></td></tr>';
  }).join('');
}

function filtraFornitori() {
  const q = (document.getElementById('search-fornitori').value||'').toLowerCase();
  const righe = document.querySelectorAll('#tabella-fornitori tr');
  righe.forEach(tr => {
    const testo = tr.textContent.toLowerCase();
    tr.style.display = !q || testo.includes(q) ? '' : 'none';
  });
}

async function apriSchedaFornitore(fornitoreId, fornitoreNome) {
  const { data: fornitore } = await sb.from('fornitori').select('*').eq('id', fornitoreId).single();
  if (!fornitore) { toast('Fornitore non trovato'); return; }

  // Ordini di acquisto da questo fornitore
  const { data: ordini } = await sb.from('ordini').select('id,data,prodotto,litri,costo_litro,trasporto_litro,iva,stato,tipo_ordine,pagato_fornitore,data_pagamento_fornitore,giorni_pagamento').eq('fornitore', fornitoreNome).neq('stato','annullato').order('data',{ascending:false}).limit(500);

  // Auto-pagamento: segna come pagate le fatture scadute (batch)
  var ggPag = fornitore.giorni_pagamento || 30;
  var idsScaduti = [];
  var datePag = {};
  (ordini||[]).forEach(function(o) {
    if (o.pagato_fornitore || !o.data) return;
    var scadenza = new Date(o.data);
    scadenza.setDate(scadenza.getDate() + (o.giorni_pagamento || ggPag));
    if (scadenza <= oggi) {
      idsScaduti.push(o.id);
      datePag[o.id] = scadenza.toISOString().split('T')[0];
    }
  });
  if (idsScaduti.length) {
    try {
      await Promise.all(idsScaduti.map(function(id) {
        return sb.from('ordini').update({ pagato_fornitore: true, data_pagamento_fornitore: datePag[id] }).eq('id', id);
      }));
      (ordini||[]).forEach(function(o) {
        if (datePag[o.id]) { o.pagato_fornitore = true; o.data_pagamento_fornitore = datePag[o.id]; }
      });
      toast(idsScaduti.length + ' fatture scadute segnate come pagate');
    } catch(e) { console.warn('Auto-pagamento fallito:', e); }
  }

  const fidoMax = Number(fornitore.fido_massimo||0) || Number(fornitore.fido||0);
  // Opzione A: scaduta = pagata, NON conta nel fido (allineato a pf-fornitore-analisi.js)
  // IMPORTANTE: usa SEMPRE i giorni_pagamento del FORNITORE (master), non quelli salvati sull'ordine
  // (ordini vecchi possono avere valore "congelato" precedente alla modifica del fornitore)
  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var ggPagFornitore = Number(fornitore.giorni_pagamento || 30);
  var fidoUsato = 0, totNonPagato = 0, totPagato = 0, totScaduto = 0;
  (ordini||[]).forEach(function(o) {
    var costo = (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri);
    if (o.pagato_fornitore) { totPagato += costo; return; }
    var scad = new Date(o.data); scad.setDate(scad.getDate() + ggPagFornitore);
    var ggResidui = Math.floor((scad - oggi) / 86400000);
    if (ggResidui < 0) {
      totScaduto += costo;
    } else {
      fidoUsato += costo;
      totNonPagato += costo;
    }
  });
  var fidoResiduo = fidoMax > 0 ? fidoMax - fidoUsato : 0;
  var pctFido = fidoMax > 0 ? Math.round((fidoUsato / fidoMax) * 100) : 0;

  var html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px">';
  html += '<div><div style="font-size:18px;font-weight:500">' + esc(fornitoreNome) + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">' + esc(fornitore.citta||'—') + ' · P.IVA: ' + esc(fornitore.piva||'—') + ' · Pag. ' + ggPag + ' gg</div></div>';

  // Grafico fido
  if (fidoMax > 0) {
    var fidoColor = pctFido >= 90 ? '#A32D2D' : pctFido >= 60 ? '#BA7517' : '#639922';
    html += '<div style="text-align:right;min-width:200px">';
    html += '<div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;margin-bottom:4px">Fido fornitore</div>';
    html += '<div style="display:flex;gap:12px;justify-content:flex-end;margin-bottom:6px">';
    html += '<div style="text-align:center"><div style="font-size:9px;color:var(--text-muted)">Fido</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600">' + fmtE(fidoMax) + '</div></div>';
    html += '<div style="text-align:center"><div style="font-size:9px;color:var(--text-muted)">Utilizzato</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600;color:' + fidoColor + '">' + fmtE(fidoUsato) + '</div></div>';
    html += '<div style="text-align:center"><div style="font-size:9px;color:var(--text-muted)">Disponibile</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600;color:' + (fidoResiduo < 0 ? '#A32D2D' : '#639922') + '">' + fmtE(fidoResiduo) + '</div></div>';
    html += '</div>';
    html += '<div style="height:8px;width:100%;background:var(--border);border-radius:4px"><div style="height:100%;width:' + Math.min(100,pctFido) + '%;background:' + fidoColor + ';border-radius:4px;transition:width 0.3s"></div></div>';
    html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' + pctFido + '% utilizzato</div>';
    html += '</div>';
  }
  html += '</div>';

  // Tabella ordini con gestione pagamenti
  html += '<div style="max-height:400px;overflow-y:auto">';
  html += '<table style="width:100%;font-size:12px"><thead><tr><th>Data</th><th>Tipo</th><th>Prodotto</th><th>Litri</th><th>Costo/L</th><th>Totale</th><th>Scadenza</th><th>Pagato</th><th>Data pag.</th></tr></thead><tbody>';

  if (!ordini || !ordini.length) {
    html += '<tr><td colspan="9" class="loading">Nessun ordine</td></tr>';
  } else {
    ordini.forEach(function(o) {
      var costoUnitario = Number(o.costo_litro||0) + Number(o.trasporto_litro||0);
      var tot = costoUnitario * Number(o.litri);
      var isPagato = o.pagato_fornitore === true;
      var scadData = new Date(o.data);
      scadData.setDate(scadData.getDate() + ggPag);
      var scadISO = scadData.toISOString().split('T')[0];
      var isScaduto = !isPagato && scadData <= oggi;
      var tipoLabel = o.tipo_ordine === 'stazione_servizio' ? '<span class="badge purple" style="font-size:9px">Stazione</span>' : o.tipo_ordine === 'entrata_deposito' ? '<span class="badge teal" style="font-size:9px">Deposito</span>' : '<span class="badge blue" style="font-size:9px">' + esc(o.tipo_ordine) + '</span>';
      var rowStyle = isPagato ? 'opacity:0.5' : '';

      html += '<tr style="' + rowStyle + '">';
      html += '<td>' + fmtD(o.data) + '</td>';
      html += '<td>' + tipoLabel + '</td>';
      html += '<td style="font-size:11px">' + esc(o.prodotto) + '</td>';
      html += '<td style="font-family:var(--font-mono)">' + fmtL(o.litri) + '</td>';
      html += '<td style="font-family:var(--font-mono)">€ ' + costoUnitario.toFixed(4) + '</td>';
      html += '<td style="font-family:var(--font-mono);font-weight:500">' + fmtE(tot) + '</td>';
      html += '<td style="font-size:11px">' + fmtD(scadISO) + (isScaduto ? ' <span style="color:#A32D2D;font-size:9px;font-weight:500">SCADUTA</span>' : '') + '</td>';
      html += '<td><input type="checkbox" ' + (isPagato ? 'checked' : '') + ' onchange="togglePagamentoFornitore(\'' + o.id + '\',this.checked,\'' + fornitoreId + '\',\'' + fornitoreNome.replace(/'/g,"\\'") + '\')" /></td>';
      html += '<td>';
      if (isPagato && o.data_pagamento_fornitore) {
        html += '<span style="font-size:11px;color:#639922">' + fmtD(o.data_pagamento_fornitore) + '</span>';
      } else {
        html += '<input type="date" style="font-size:11px;padding:2px 4px;border:0.5px solid var(--border);border-radius:4px;background:var(--bg)" value="' + (o.data_pagamento_fornitore||'') + '" onchange="impostaDataPagFornitore(\'' + o.id + '\',this.value,\'' + fornitoreId + '\',\'' + fornitoreNome.replace(/'/g,"\\'") + '\')" />';
      }
      html += '</td>';
      html += '</tr>';
    });
  }

  html += '</tbody></table></div>';

  // Riepilogo
  var totOrdini = (ordini||[]).length;
  var nPagati = (ordini||[]).filter(function(o){return o.pagato_fornitore;}).length;
  var nDaPagare = totOrdini - nPagati;
  html += '<div style="display:flex;gap:16px;margin-top:12px;font-size:11px;color:var(--text-muted);flex-wrap:wrap">';
  html += '<span>Totale ordini: <strong>' + totOrdini + '</strong></span>';
  html += '<span style="color:#639922">Pagati: <strong>' + nPagati + '</strong> (' + fmtE(totPagato) + ')</span>';
  html += '<span>Da pagare: <strong>' + nDaPagare + '</strong> (' + fmtE(totNonPagato) + ')</span>';
  html += '</div>';

  html += '<button class="btn-primary" style="width:100%;margin-top:14px" onclick="chiudiModalePermessi()">Chiudi</button>';
  apriModal(html);
}

async function togglePagamentoFornitore(ordineId, pagato, fornitoreId, fornitoreNome) {
  var update = { pagato_fornitore: pagato };
  if (pagato) update.data_pagamento_fornitore = oggiISO;
  else update.data_pagamento_fornitore = null;
  var { error } = await sb.from('ordini').update(update).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  toast(pagato ? '✅ Fattura segnata come pagata' : 'Fattura segnata come non pagata');
  apriSchedaFornitore(fornitoreId, fornitoreNome);
}

async function impostaDataPagFornitore(ordineId, data, fornitoreId, fornitoreNome) {
  var { error } = await sb.from('ordini').update({ data_pagamento_fornitore: data || null }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Data pagamento aggiornata');
  apriSchedaFornitore(fornitoreId, fornitoreNome);
}

// ── BASI DI CARICO ────────────────────────────────────────────────
async function salvaBasi() {
  const record={nome:document.getElementById('ba-nome').value.trim(),indirizzo:document.getElementById('ba-indirizzo').value,citta:document.getElementById('ba-citta').value,provincia:document.getElementById('ba-provincia').value,note:document.getElementById('ba-note').value};
  if (!record.nome){toast('Inserisci il nome');return;}
  const{error}=await sb.from('basi_carico').insert([record]);
  if (error){toast('Errore: '+error.message);return;}
  toast('Base salvata!'); caricaBasi();
}

async function caricaBasi() {
  const{data}=await sb.from('basi_carico').select('*, fornitori_basi(fornitore_id, fornitori(nome))').order('nome');
  const tbody=document.getElementById('tabella-basi');
  if (!data||!data.length){tbody.innerHTML='<tr><td colspan="6" class="loading">Nessuna base</td></tr>';return;}
  tbody.innerHTML=data.map(r => {
    const forn=r.fornitori_basi?r.fornitori_basi.map(fb=>fb.fornitori?.nome).filter(Boolean).join(', '):'—';
    return '<tr><td><strong>' + r.nome + '</strong></td><td>' + (r.indirizzo||'—') + '</td><td>' + (r.citta||'—') + '</td><td style="font-size:11px;color:var(--text-muted)">' + forn + '</td><td style="font-size:11px;color:var(--text-muted)">' + (r.note||'—') + '</td><td><button class="btn-edit" onclick="editaBase(\'' + r.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'basi_carico\',\'' + r.id + '\',caricaBasi)">x</button></td></tr>';
  }).join('');
}

async function editaBase(id) {
  const { data: base } = await sb.from('basi_carico').select('*, fornitori_basi(fornitore_id)').eq('id', id).single();
  if (!base) return;
  const { data: fornitori } = await sb.from('fornitori').select('id,nome').eq('attivo',true).order('nome');
  const fornitoriAssegnati = (base.fornitori_basi||[]).map(fb => fb.fornitore_id);

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Modifica base: ' + esc(base.nome) + '</div>';
  html += '<div class="form-grid">';
  html += '<div class="form-group"><label>Nome</label><input type="text" id="edit-ba-nome" value="' + esc(base.nome) + '" /></div>';
  html += '<div class="form-group"><label>Indirizzo</label><input type="text" id="edit-ba-indirizzo" value="' + esc(base.indirizzo||'') + '" /></div>';
  html += '<div class="form-group"><label>Città</label><input type="text" id="edit-ba-citta" value="' + esc(base.citta||'') + '" /></div>';
  html += '<div class="form-group"><label>Provincia</label><input type="text" id="edit-ba-provincia" value="' + esc(base.provincia||'') + '" /></div>';
  html += '<div class="form-group"><label>Note</label><input type="text" id="edit-ba-note" value="' + esc(base.note||'') + '" /></div>';
  html += '</div>';
  html += '<div style="margin-top:12px"><div style="font-size:12px;font-weight:500;margin-bottom:8px">Fornitori associati</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
  (fornitori||[]).forEach(f => {
    const checked = fornitoriAssegnati.includes(f.id) ? ' checked' : '';
    html += '<label style="display:flex;align-items:center;gap:4px;font-size:12px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:5px 10px;cursor:pointer"><input type="checkbox" class="edit-ba-forn" value="' + f.id + '"' + checked + ' /> ' + esc(f.nome) + '</label>';
  });
  html += '</div></div>';
  html += '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn-primary" onclick="confermaEditaBase(\'' + id + '\')">Salva</button><button class="btn-secondary" onclick="chiudiModal()">Annulla</button></div>';
  apriModal(html);
}

async function confermaEditaBase(id) {
  const record = {
    nome: document.getElementById('edit-ba-nome').value.trim(),
    indirizzo: document.getElementById('edit-ba-indirizzo').value,
    citta: document.getElementById('edit-ba-citta').value,
    provincia: document.getElementById('edit-ba-provincia').value,
    note: document.getElementById('edit-ba-note').value
  };
  if (!record.nome) { toast('Nome obbligatorio'); return; }
  const { error } = await sb.from('basi_carico').update(record).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }

  // Aggiorna fornitori associati
  await sb.from('fornitori_basi').delete().eq('base_carico_id', id);
  const checks = document.querySelectorAll('.edit-ba-forn:checked');
  if (checks.length) {
    await sb.from('fornitori_basi').insert(Array.from(checks).map(c => ({ fornitore_id: c.value, base_carico_id: id })));
  }

  toast('Base aggiornata!');
  chiudiModal();
  caricaBasi();
}

// ── PRODOTTI ─────────────────────────────────────────────────────

async function caricaProdotti() {
  const { data } = await sb.from('prodotti').select('*').order('ordine_visualizzazione');
  cacheProdotti = data || [];
  const tbody = document.getElementById('tabella-prodotti');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="8" class="loading">Nessun prodotto</td></tr>'; return; }
  tbody.innerHTML = data.map(r => {
    const catBadge = r.categoria === 'benzine' ? '<span class="badge teal">Benzine</span>' : '<span class="badge gray">Altro</span>';
    const statoBadge = r.attivo ? '<span class="badge green">Attivo</span>' : '<span class="badge red">Disattivo</span>';
    const um = r.unita_misura === 'pezzi' ? 'pz' : 'L';
    const capLabel = r.capacita_default ? _sep(Number(r.capacita_default).toLocaleString('it-IT')) + ' ' + um : '—';
    return '<tr>' +
      '<td><div style="width:14px;height:14px;border-radius:50%;background:' + esc(r.colore) + '"></div></td>' +
      '<td><strong>' + esc(r.nome) + '</strong></td>' +
      '<td>' + catBadge + '</td>' +
      '<td>' + r.iva_default + '%</td>' +
      '<td style="font-family:var(--font-mono);font-size:11px">' + capLabel + '</td>' +
      '<td style="font-size:11px;color:var(--text-muted)">' + (r.unita_misura === 'pezzi' ? 'Pezzi' : 'Litri') + '</td>' +
      '<td>' + statoBadge + '</td>' +
      '<td>' +
        '<button class="btn-edit" onclick="toggleProdottoAttivo(\'' + r.id + '\',' + r.attivo + ')" title="' + (r.attivo ? 'Disattiva' : 'Attiva') + '">' + (r.attivo ? '🔒' : '🔓') + '</button>' +
        '<button class="btn-edit" onclick="editaProdotto(\'' + r.id + '\')" title="Modifica">✏️</button>' +
        '<button class="btn-danger" onclick="eliminaProdotto(\'' + r.id + '\')">x</button>' +
      '</td></tr>';
  }).join('');
}

async function salvaProdotto() {
  const nome = document.getElementById('prod-nome').value.trim();
  if (!nome) { toast('Inserisci un nome prodotto'); return; }
  const record = {
    nome,
    categoria: document.getElementById('prod-categoria').value,
    iva_default: parseInt(document.getElementById('prod-iva').value),
    colore: document.getElementById('prod-colore').value,
    tipo_cisterna: document.getElementById('prod-tipo-cisterna').value.trim() || null,
    capacita_default: parseFloat(document.getElementById('prod-capacita').value) || 0,
    unita_misura: document.getElementById('prod-unita').value
  };
  const { error } = await sb.from('prodotti').insert([record]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Prodotto salvato!');
  document.getElementById('prod-nome').value = '';
  document.getElementById('prod-tipo-cisterna').value = '';
  document.getElementById('prod-colore').value = '#888888';
  document.getElementById('prod-capacita').value = '';
  caricaProdotti();
}

async function toggleProdottoAttivo(id, attualeAttivo) {
  const { error } = await sb.from('prodotti').update({ attivo: !attualeAttivo }).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast(attualeAttivo ? 'Prodotto disattivato' : 'Prodotto attivato');
  caricaProdotti();
}

async function editaProdotto(id) {
  const prod = cacheProdotti.find(p => p.id === id);
  if (!prod) return;
  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Modifica prodotto: ' + esc(prod.nome) + '</div>';
  html += '<div class="form-grid">';
  html += '<div class="form-group"><label>Nome</label><input type="text" id="edit-prod-nome" value="' + esc(prod.nome) + '" /></div>';
  html += '<div class="form-group"><label>Categoria</label><select id="edit-prod-categoria"><option value="benzine"' + (prod.categoria === 'benzine' ? ' selected' : '') + '>Benzine</option><option value="altro"' + (prod.categoria === 'altro' ? ' selected' : '') + '>Altro</option></select></div>';
  html += '<div class="form-group"><label>IVA %</label><select id="edit-prod-iva"><option value="22"' + (prod.iva_default === 22 ? ' selected' : '') + '>22%</option><option value="10"' + (prod.iva_default === 10 ? ' selected' : '') + '>10%</option><option value="4"' + (prod.iva_default === 4 ? ' selected' : '') + '>4%</option></select></div>';
  html += '<div class="form-group"><label>Colore</label><input type="color" id="edit-prod-colore" value="' + (prod.colore || '#888888') + '" /></div>';
  html += '<div class="form-group"><label>Tipo cisterna</label><input type="text" id="edit-prod-cisterna" value="' + esc(prod.tipo_cisterna || '') + '" /></div>';
  html += '<div class="form-group"><label>Capacità max</label><input type="number" id="edit-prod-capacita" value="' + (prod.capacita_default || 0) + '" /></div>';
  html += '<div class="form-group"><label>Unità misura</label><select id="edit-prod-unita"><option value="litri"' + (prod.unita_misura !== 'pezzi' ? ' selected' : '') + '>Litri</option><option value="pezzi"' + (prod.unita_misura === 'pezzi' ? ' selected' : '') + '>Pezzi</option></select></div>';
  html += '<div class="form-group"><label>Ordine visual.</label><input type="number" id="edit-prod-ordine" value="' + (prod.ordine_visualizzazione || 0) + '" /></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn-primary" onclick="confermaEditaProdotto(\'' + id + '\')">Salva</button><button class="btn-secondary" onclick="chiudiModal()">Annulla</button></div>';
  apriModal(html);
}

async function confermaEditaProdotto(id) {
  const record = {
    nome: document.getElementById('edit-prod-nome').value.trim(),
    categoria: document.getElementById('edit-prod-categoria').value,
    iva_default: parseInt(document.getElementById('edit-prod-iva').value),
    colore: document.getElementById('edit-prod-colore').value,
    tipo_cisterna: document.getElementById('edit-prod-cisterna').value.trim() || null,
    capacita_default: parseFloat(document.getElementById('edit-prod-capacita').value) || 0,
    unita_misura: document.getElementById('edit-prod-unita').value,
    ordine_visualizzazione: parseInt(document.getElementById('edit-prod-ordine').value) || 0
  };
  if (!record.nome) { toast('Nome obbligatorio'); return; }
  const { error } = await sb.from('prodotti').update(record).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Prodotto aggiornato!');
  chiudiModal();
  caricaProdotti();
}

async function eliminaProdotto(id) {
  const prod = cacheProdotti.find(p => p.id === id);
  if (!confirm('Eliminare il prodotto "' + (prod?.nome || '') + '"?\n\nATTENZIONE: funziona solo se non ci sono ordini con questo prodotto.')) return;
  const { error } = await sb.from('prodotti').delete().eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Prodotto eliminato');
  caricaProdotti();
}


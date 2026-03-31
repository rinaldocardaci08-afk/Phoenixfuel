// PhoenixFuel — Stazione: Prezzi pompa, Versamenti, Magazzino, Acquisti
async function caricaTabPrezzi() { await caricaStoricoPrezzi(); }

async function salvaPrezziPompa() {
  const data = document.getElementById('stz-data-prezzo').value;
  if (!data) { toast('Seleziona una data'); return; }
  if (!_checkSaved('btn-salva-prezzi')) return;
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
  _markSaved('btn-salva-prezzi');
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

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
    selAnno.value = annoCorr;
    caricaReportAcquistiStazione();
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

async function _queryAcquistiStazione() {
  var anno = document.getElementById('stz-acq-anno').value;
  var mese = document.getElementById('stz-acq-mese').value;
  var da = document.getElementById('stz-acq-da').value;
  var a = document.getElementById('stz-acq-a').value;

  var query = sb.from('ordini').select('*').eq('tipo_ordine','stazione_servizio').neq('stato','annullato');
  var periodoLabel = 'Tutti i dati';
  if (da && a) {
    query = query.gte('data', da).lte('data', a);
    periodoLabel = new Date(da+'T12:00:00').toLocaleDateString('it-IT') + ' — ' + new Date(a+'T12:00:00').toLocaleDateString('it-IT');
  } else if (anno && mese) {
    var ultimoGiorno = new Date(parseInt(anno), parseInt(mese), 0).getDate();
    query = query.gte('data', anno+'-'+mese+'-01').lte('data', anno+'-'+mese+'-'+String(ultimoGiorno).padStart(2,'0'));
    var MESI = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    periodoLabel = MESI[parseInt(mese)] + ' ' + anno;
  } else if (anno) {
    query = query.gte('data', anno+'-01-01').lte('data', anno+'-12-31');
    periodoLabel = 'Anno ' + anno;
  }
  var { data: ordini } = await query.order('data',{ascending:false});
  return { ordini: ordini || [], periodoLabel: periodoLabel };
}

function _calcolaRiepilogoAcquisti(ordini) {
  var perProdotto = {};
  var totLitri = 0, totImponibile = 0, totIva = 0, totTotale = 0;
  ordini.forEach(function(r) {
    var litri = Number(r.litri);
    var costoL = Number(r.costo_litro);
    var aliquotaIva = Number(r.iva) || 22;
    var imponibile = costoL * litri;
    var iva = imponibile * aliquotaIva / 100;
    var totale = imponibile + iva;
    totLitri += litri; totImponibile += imponibile; totIva += iva; totTotale += totale;
    if (!perProdotto[r.prodotto]) perProdotto[r.prodotto] = { litri:0, imponibile:0, iva:0, totale:0, ordini:0, costoSum:0 };
    var p = perProdotto[r.prodotto];
    p.litri += litri; p.imponibile += imponibile; p.iva += iva; p.totale += totale; p.ordini++; p.costoSum += costoL * litri;
  });
  return { perProdotto, totLitri, totImponibile, totIva, totTotale };
}

async function caricaReportAcquistiStazione() {
  var el = document.getElementById('stz-acquisti-report');
  if (!el) return;
  var { ordini, periodoLabel } = await _queryAcquistiStazione();
  if (!ordini.length) { el.innerHTML = '<div class="loading">Nessun acquisto trovato per il periodo selezionato</div>'; return; }
  var r = _calcolaRiepilogoAcquisti(ordini);
  var mono = 'font-family:var(--font-mono)';
  var html = '';

  // KPI cards
  html += '<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">';
  html += '<div style="background:#EEEDFE;border-radius:8px;padding:12px 20px;flex:1;min-width:120px;text-align:center"><div style="font-size:10px;color:#26215C;text-transform:uppercase">Litri totali</div><div style="font-size:20px;font-weight:700;'+mono+'">'+fmtL(r.totLitri)+'</div></div>';
  html += '<div style="background:#EEEDFE;border-radius:8px;padding:12px 20px;flex:1;min-width:120px;text-align:center"><div style="font-size:10px;color:#26215C;text-transform:uppercase">Imponibile</div><div style="font-size:20px;font-weight:700;'+mono+'">'+fmtE(r.totImponibile)+'</div></div>';
  html += '<div style="background:#EEEDFE;border-radius:8px;padding:12px 20px;flex:1;min-width:120px;text-align:center"><div style="font-size:10px;color:#26215C;text-transform:uppercase">IVA</div><div style="font-size:20px;font-weight:700;'+mono+'">'+fmtE(r.totIva)+'</div></div>';
  html += '<div style="background:#EEEDFE;border-radius:8px;padding:12px 20px;flex:1;min-width:120px;text-align:center"><div style="font-size:10px;color:#26215C;text-transform:uppercase">Totale IVA incl.</div><div style="font-size:20px;font-weight:700;'+mono+'">'+fmtE(r.totTotale)+'</div></div>';
  html += '<div style="background:#EEEDFE;border-radius:8px;padding:12px 20px;flex:1;min-width:120px;text-align:center"><div style="font-size:10px;color:#26215C;text-transform:uppercase">Ordini</div><div style="font-size:20px;font-weight:700;'+mono+'">'+ordini.length+'</div></div>';
  html += '</div>';

  // Riepilogo per prodotto
  html += '<div style="font-size:12px;font-weight:600;color:#6B5FCC;margin-bottom:6px;text-transform:uppercase">Riepilogo per prodotto</div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Prodotto</th><th>Ordini</th><th>Litri</th><th>Prezzo medio €/L</th><th>Imponibile</th><th>IVA</th><th>Totale</th></tr></thead><tbody>';
  Object.entries(r.perProdotto).forEach(function(e) {
    var prod = e[0], v = e[1];
    var pm = v.litri > 0 ? (v.costoSum / v.litri).toFixed(4) : '—';
    html += '<tr><td><strong>'+esc(prod)+'</strong></td><td style="text-align:center">'+v.ordini+'</td><td style="'+mono+';text-align:right">'+fmtL(v.litri)+'</td><td style="'+mono+';text-align:right">€ '+pm+'</td><td style="'+mono+';text-align:right">'+fmtE(v.imponibile)+'</td><td style="'+mono+';text-align:right">'+fmtE(v.iva)+'</td><td style="'+mono+';text-align:right;font-weight:600">'+fmtE(v.totale)+'</td></tr>';
  });
  html += '<tr style="border-top:2px solid var(--accent);font-weight:600"><td>TOTALE</td><td style="text-align:center">'+ordini.length+'</td><td style="'+mono+';text-align:right">'+fmtL(r.totLitri)+'</td><td style="'+mono+';text-align:right">€ '+(r.totLitri>0?(r.totImponibile/r.totLitri).toFixed(4):'—')+'</td><td style="'+mono+';text-align:right">'+fmtE(r.totImponibile)+'</td><td style="'+mono+';text-align:right">'+fmtE(r.totIva)+'</td><td style="'+mono+';text-align:right;font-weight:700">'+fmtE(r.totTotale)+'</td></tr>';
  html += '</tbody></table></div>';

  // Dettaglio ordini
  html += '<div style="font-size:12px;font-weight:600;color:#6B5FCC;margin-bottom:6px;margin-top:16px;text-transform:uppercase">Dettaglio ordini</div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>#</th><th>Data</th><th>Prodotto</th><th>Fornitore</th><th>Litri</th><th>€/L netto</th><th>Imponibile</th><th>IVA</th><th>Totale</th></tr></thead><tbody>';
  ordini.forEach(function(o, i) {
    var litri = Number(o.litri), costoL = Number(o.costo_litro), aliq = Number(o.iva)||22;
    var imp = costoL*litri, iva = imp*aliq/100, tot = imp+iva;
    html += '<tr><td style="text-align:center">'+(i+1)+'</td><td>'+new Date(o.data+'T12:00:00').toLocaleDateString('it-IT')+'</td><td>'+esc(o.prodotto)+'</td><td>'+esc(o.fornitore)+'</td><td style="'+mono+';text-align:right">'+fmtL(litri)+'</td><td style="'+mono+';text-align:right">'+fmt(costoL)+'</td><td style="'+mono+';text-align:right">'+fmtE(imp)+'</td><td style="'+mono+';text-align:right">'+fmtE(iva)+'</td><td style="'+mono+';text-align:right;font-weight:600">'+fmtE(tot)+'</td></tr>';
  });
  html += '<tr style="border-top:2px solid var(--accent);font-weight:600"><td colspan="4">TOTALE</td><td style="'+mono+';text-align:right">'+fmtL(r.totLitri)+'</td><td></td><td style="'+mono+';text-align:right">'+fmtE(r.totImponibile)+'</td><td style="'+mono+';text-align:right">'+fmtE(r.totIva)+'</td><td style="'+mono+';text-align:right;font-weight:700">'+fmtE(r.totTotale)+'</td></tr>';
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

async function stampaReportAcquistiStazione() {
  var w = _apriReport("Report acquisti stazione"); if (!w) return;
  var { ordini, periodoLabel } = await _queryAcquistiStazione();
  if (!ordini || !ordini.length) { toast('Nessun acquisto trovato'); return; }
  var r = _calcolaRiepilogoAcquisti(ordini);

  // Riepilogo per prodotto HTML
  var riepilogoHtml = '';
  Object.entries(r.perProdotto).forEach(function(e) {
    var prod = e[0], v = e[1];
    var pm = v.litri > 0 ? (v.costoSum / v.litri).toFixed(4) : '—';
    riepilogoHtml += '<tr><td style="padding:6px 8px;border:1px solid #ddd"><strong>'+esc(prod)+'</strong></td><td style="padding:6px 8px;border:1px solid #ddd;text-align:center">'+v.ordini+'</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtL(v.litri)+'</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">€ '+pm+'</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtE(v.imponibile)+'</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtE(v.iva)+'</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">'+fmtE(v.totale)+'</td></tr>';
  });
  riepilogoHtml += '<tr class="tot"><td style="padding:8px;border:1px solid #ddd">TOTALE</td><td style="padding:8px;border:1px solid #ddd;text-align:center">'+ordini.length+'</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtL(r.totLitri)+'</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">€ '+(r.totLitri>0?(r.totImponibile/r.totLitri).toFixed(4):'—')+'</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtE(r.totImponibile)+'</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtE(r.totIva)+'</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">'+fmtE(r.totTotale)+'</td></tr>';

  // Dettaglio ordini HTML
  var righeHtml = '';
  ordini.forEach(function(o, i) {
    var litri = Number(o.litri), costoL = Number(o.costo_litro), aliq = Number(o.iva)||22;
    var imp = costoL*litri, iva = imp*aliq/100, tot = imp+iva;
    righeHtml += '<tr><td style="padding:6px 8px;border:1px solid #ddd;text-align:center">'+(i+1)+'</td><td style="padding:6px 8px;border:1px solid #ddd">'+new Date(o.data+'T12:00:00').toLocaleDateString('it-IT')+'</td><td style="padding:6px 8px;border:1px solid #ddd">'+esc(o.prodotto)+'</td><td style="padding:6px 8px;border:1px solid #ddd">'+esc(o.fornitore)+'</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtL(litri)+'</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmt(costoL)+'</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtE(imp)+'</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtE(iva)+'</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">'+fmtE(tot)+'</td></tr>';
  });
  righeHtml += '<tr class="tot"><td style="padding:8px;border:1px solid #ddd" colspan="4">TOTALE</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtL(r.totLitri)+'</td><td></td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtE(r.totImponibile)+'</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">'+fmtE(r.totIva)+'</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">'+fmtE(r.totTotale)+'</td></tr>';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acquisti Stazione Oppido</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:15mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:10mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}table{font-size:9px}th,td{padding:4px 3px!important}}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:16px}' +
    'th{background:#6B5FCC;color:#fff;padding:8px 6px;font-size:9px;text-transform:uppercase;letter-spacing:0.4px;border:1px solid #5A4FBB;text-align:center}' +
    '.tot td{border-top:3px solid #6B5FCC!important;font-weight:bold;font-size:12px;background:#EEEDFE!important}' +
    '</style></head><body>';

  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6B5FCC;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:20px;font-weight:bold;color:#6B5FCC">ACQUISTI STAZIONE OPPIDO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Periodo: <strong>' + periodoLabel + '</strong> — Ordini: <strong>' + ordini.length + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  html += '<div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap">';
  html += '<div style="background:#EEEDFE;border:1px solid #6B5FCC;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#26215C;text-transform:uppercase">Litri totali</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">'+fmtL(r.totLitri)+'</div></div>';
  html += '<div style="background:#EEEDFE;border:1px solid #6B5FCC;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#26215C;text-transform:uppercase">Imponibile</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">'+fmtE(r.totImponibile)+'</div></div>';
  html += '<div style="background:#EEEDFE;border:1px solid #6B5FCC;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#26215C;text-transform:uppercase">IVA</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">'+fmtE(r.totIva)+'</div></div>';
  html += '<div style="background:#EEEDFE;border:1px solid #6B5FCC;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#26215C;text-transform:uppercase">Totale</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">'+fmtE(r.totTotale)+'</div></div>';
  html += '</div>';

  html += '<div style="font-size:12px;font-weight:bold;color:#6B5FCC;margin-bottom:6px;text-transform:uppercase">Riepilogo per prodotto</div>';
  html += '<table><thead><tr><th>Prodotto</th><th>Ordini</th><th>Litri</th><th>Prezzo medio €/L</th><th>Imponibile</th><th>IVA</th><th>Totale</th></tr></thead><tbody>' + riepilogoHtml + '</tbody></table>';

  html += '<div style="font-size:12px;font-weight:bold;color:#6B5FCC;margin-bottom:6px;text-transform:uppercase">Dettaglio ordini</div>';
  html += '<table><thead><tr><th>#</th><th>Data</th><th>Prodotto</th><th>Fornitore</th><th>Litri</th><th>€/L netto</th><th>Imponibile</th><th>IVA</th><th>Totale</th></tr></thead><tbody>' + righeHtml + '</tbody></table>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  w.document.open(); w.document.write(html); w.document.close();
}

// ── Report stazione ──

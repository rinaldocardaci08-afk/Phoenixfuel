// PhoenixFuel — Stazione: Cassa, Crediti, Differenze, OCR
// ══════════════════════════════════════════════════════════════
// ── CASSA STAZIONE ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

async function caricaCassa() {
  var input = document.getElementById('cassa-data');
  if (!input.value) input.value = oggiISO;
  var data = input.value;
  _labelGiorno('cassa-data');
  _resetSaved('btn-salva-cassa');

  // Carica dati salvati in parallelo
  var [cassaRes, speseRes, totVendite] = await Promise.all([
    sb.from('stazione_cassa').select('*').eq('data', data).maybeSingle(),
    sb.from('stazione_spese_contanti').select('*').eq('data', data).order('created_at'),
    _calcolaTotVenditeDaLetture(data)
  ]);
  var cassa = cassaRes.data;
  if (cassa) _markSaved('btn-salva-cassa');
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
  if (!_checkSaved('btn-salva-cassa')) return;

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
    _markSaved('btn-salva-cassa');
    calcolaCassa();
    return;
  }

  // Upsert diretto — sovrascrive se esiste (senza confirm bloccante su mobile)
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
  _markSaved('btn-salva-cassa');
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
    html += '<tr' + (i % 2 ? ' class="alt"' : '') + '><td>' + fmtD(c.data) + '</td><td>' + fmtE(daV) + '</td><td>' + fmtE(vers) + '</td><td class="' + cls + '" style="font-weight:bold">' + (diff >= 0 ? '+' : '') + fmtE(diff) + '</td><td class="' + (Math.abs(cumulata) < 0.01 ? 'ok' : 'err') + '">' + (cumulata >= 0 ? '+' : '') + fmtE(cumulata) + '</td></tr>';
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

    html += '<div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">';
    html += '<button class="btn-primary" style="width:100%;padding:14px;font-size:16px;font-weight:600;background:#639922" onclick="applicaOcrCassa()">✅ Applica alla cassa</button>';
    html += '<button class="btn-primary" style="width:100%;padding:14px;font-size:16px;font-weight:600;background:#378ADD" onclick="applicaOcrLetture()">⛽ Applica alle letture (totalizzatori)</button>';
    html += '<button onclick="document.getElementById(\'ocr-status\').style.display=\'none\'" style="width:100%;padding:12px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer;font-size:14px">Chiudi</button>';
    html += '</div>';

    statusEl.innerHTML = html;
    // Scroll ai bottoni su mobile
    setTimeout(function() { statusEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);

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

  // Applica tutti i valori (anche 0 — l'utente può modificare dopo)
  document.getElementById('cassa-bancomat').value = r.bancomat ? r.bancomat.toFixed(2) : '';
  document.getElementById('cassa-nexi').value = r.nexi ? r.nexi.toFixed(2) : '';
  document.getElementById('cassa-crediti-emessi').value = r.creditiEmessi ? r.creditiEmessi.toFixed(2) : '';
  document.getElementById('cassa-rimborsi').value = r.creditiRimborsati ? r.creditiRimborsati.toFixed(2) : '';
  document.getElementById('cassa-rimborsi-prec').value = r.creditiRimbPrec ? r.creditiRimbPrec.toFixed(2) : '';

  calcolaCassa();
  toast('✅ Dati scontrino applicati alla cassa!');
  document.getElementById('ocr-status').style.display = 'none';
  // Scroll al form cassa per vedere i valori inseriti
  var cassaForm = document.getElementById('cassa-bancomat');
  if (cassaForm) cassaForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // Ricarica letture e cassa (vendite dipendono dalle letture)
  try {
    if (typeof caricaFormLetture === 'function') caricaFormLetture();
    if (typeof caricaStoricoLetture === 'function') caricaStoricoLetture();
    if (typeof calcolaCassa === 'function') calcolaCassa();
  } catch(e) { console.warn('Refresh dopo OCR:', e); }
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


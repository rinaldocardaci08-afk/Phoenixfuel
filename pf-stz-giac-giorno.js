// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Giacenza giornaliera stazione Oppido
// Step B.3.a.1: guscio read-only (solo visualizzazione + log console).
// NIENTE salvataggio, NIENTE frecce, NIENTE banner. Verrà aggiunto in B.3.a.2.
//
// Fonti dati:
//   - pompe: stazione_pompe (attiva=true)
//   - letture: stazione_letture (pompa_id, data, lettura)
//   - entrate: ordini (tipo_ordine='stazione_servizio') via pfData
//   - apertura: giacenze_giornaliere (sede='stazione_oppido'), fallback cisterne.livello_attuale
//
// Aggregazione: 1 riga per prodotto (multi-cisterna sommato).
// ═══════════════════════════════════════════════════════════════════

var _stzGiornoDati = null;

async function caricaStzGiacenzaGiorno() {
  // Al primo caricamento l'input stzg-data non esiste ancora (viene creato dal render).
  // Se non c'è, usiamo oggiISO come default. Alle chiamate successive leggiamo dall'input.
  var dataEl = document.getElementById('stzg-data');
  var data = (dataEl && dataEl.value) ? dataEl.value : oggiISO;
  // Fix timezone-safe: calcolo giornoPrima manipolando Date in UTC esplicito.
  // Il vecchio metodo new Date(data+'T00:00:00').getTime()-86400000 falliva in fuso orario
  // diverso da UTC: 2026-01-01T00:00 ora locale = 2025-12-31T23:00 UTC, poi -1 giorno = 30/12 UTC.
  // Soluzione: parse componenti e usa Date.UTC per restare in UTC tutto il tempo.
  var _parts = data.split('-');
  var _d = new Date(Date.UTC(parseInt(_parts[0]), parseInt(_parts[1]) - 1, parseInt(_parts[2])));
  _d.setUTCDate(_d.getUTCDate() - 1);
  var giornoPrima = _d.toISOString().split('T')[0];

  // Step B.3.a.3: assicura che la catena di giacenze_giornaliere sia costruita
  // dal 31/12/2025 fino al giorno precedente al target, così l'apertura viene
  // letta da record salvato e non dal fallback cisterne.livello_attuale.
  try {
    if (data >= '2026-01-01' && data <= oggiISO) {
      await _stzgAssicuraCatena(giornoPrima);
    }
  } catch (err) {
    console.warn('[_stzgAssicuraCatena] errore ricostruzione catena:', err);
  }

  try {

  // ── QUERIES PARALLELE ──
  var [
    pompeRes,
    cisterneRes,
    lettOggiRes,
    lettPrecRes,
    giacPrecRes,
    giacOggiRes
  ] = await Promise.all([
    sb.from('stazione_pompe').select('id,nome,prodotto,attiva').eq('attiva', true),
    sb.from('cisterne').select('prodotto,livello_attuale,capacita_max').eq('sede', 'stazione_oppido'),
    sb.from('stazione_letture').select('pompa_id,lettura').eq('data', data),
    sb.from('stazione_letture').select('pompa_id,lettura').eq('data', giornoPrima),
    sb.from('giacenze_giornaliere').select('prodotto,giacenza_rilevata,giacenza_teorica').eq('data', giornoPrima).eq('sede', 'stazione_oppido'),
    sb.from('giacenze_giornaliere').select('*').eq('data', data).eq('sede', 'stazione_oppido')
  ]);

  var pompe = pompeRes.data || [];
  var cisterne = cisterneRes.data || [];
  var lettOggi = lettOggiRes.data || [];
  var lettPrec = lettPrecRes.data || [];
  var giacPrec = giacPrecRes.data || [];
  var giacOggi = giacOggiRes.data || [];

  // ── ENTRATE via pfData (migrazione) ──
  // Solo ordini effettivamente RICEVUTI in stazione. Ordini confermati ma non ancora
  // ricevuti non devono influire sulla giacenza (coerente con pfData.getGiacenzaAllaData).
  var entrateOrdini = [];
  try {
    if (typeof pfData !== 'undefined' && pfData.getOrdini) {
      var tuttiOrd = await pfData.getOrdini({ da: data, a: data });
      entrateOrdini = tuttiOrd.filter(function(o) { return o.tipo_ordine === 'stazione_servizio' && o.ricevuto_stazione === true; });
    } else {
      // Fallback se pfData non è caricato
      var res = await sb.from('ordini').select('prodotto,litri,stato').eq('tipo_ordine', 'stazione_servizio').eq('data', data).in('stato', ['confermato', 'consegnato']).eq('ricevuto_stazione', true);
      entrateOrdini = res.data || [];
    }
  } catch (e) {
    console.warn('[pf-stz-giac-giorno] errore caricamento entrate:', e);
  }

  // ── PROCESSING ──
  // Mappa pompa_id → prodotto
  var pompaProd = {};
  pompe.forEach(function(p) { pompaProd[p.id] = p.prodotto; });

  // Uscite per prodotto: differenza letture
  var usciteProd = {};
  var letturePresenti = lettOggi.length > 0;
  var letturaPrecedentePresente = lettPrec.length > 0;
  pompe.forEach(function(p) {
    var lOggi = lettOggi.find(function(l) { return l.pompa_id === p.id; });
    var lPrec = lettPrec.find(function(l) { return l.pompa_id === p.id; });
    if (lOggi && lPrec) {
      var diff = Number(lOggi.lettura) - Number(lPrec.lettura);
      if (diff > 0) {
        if (!usciteProd[p.prodotto]) usciteProd[p.prodotto] = 0;
        usciteProd[p.prodotto] += diff;
      }
    }
  });

  // Entrate per prodotto
  var entrateProd = {};
  entrateOrdini.forEach(function(o) {
    if (!entrateProd[o.prodotto]) entrateProd[o.prodotto] = 0;
    entrateProd[o.prodotto] += Number(o.litri || 0);
  });

  // Apertura per prodotto: rilevata gg prec, fallback calcolata, fallback cisterna.livello_attuale
  var aperturaProd = {};
  var cisterneProd = {};
  cisterne.forEach(function(c) {
    if (!cisterneProd[c.prodotto]) cisterneProd[c.prodotto] = 0;
    cisterneProd[c.prodotto] += Number(c.livello_attuale || 0);
  });
  // Raggruppa per prodotto le rilevate/calcolate del giorno precedente
  var giacPrecMap = {};
  giacPrec.forEach(function(g) {
    giacPrecMap[g.prodotto] = g.giacenza_rilevata !== null && g.giacenza_rilevata !== undefined
      ? Number(g.giacenza_rilevata)
      : Number(g.giacenza_teorica || 0);
  });
  // Mappa giacenze già salvate per oggi
  var giacOggiMap = {};
  giacOggi.forEach(function(g) { giacOggiMap[g.prodotto] = g; });

  // ── AGGREGAZIONE PER PRODOTTO ──
  var prodottiSet = {};
  cisterne.forEach(function(c) { prodottiSet[c.prodotto] = true; });
  pompe.forEach(function(p) { prodottiSet[p.prodotto] = true; });
  // Ordine fisso
  var ordineFisso = ['Gasolio Autotrazione', 'Benzina', 'Gasolio Agricolo', 'HVO'];
  var prodotti = ordineFisso.filter(function(p) { return prodottiSet[p]; });
  Object.keys(prodottiSet).forEach(function(p) { if (prodotti.indexOf(p) < 0) prodotti.push(p); });

  var righeProd = [];
  prodotti.forEach(function(prod) {
    var apertura = giacPrecMap[prod] !== undefined ? giacPrecMap[prod] : (cisterneProd[prod] || 0);
    var ent = entrateProd[prod] || 0;
    var usc = usciteProd[prod] || 0;
    var deltaGg = ent - usc;
    var salvata = giacOggiMap[prod];
    var caliEcc = salvata ? Number(salvata.cali_eccedenze || 0) : 0;
    var teorica = Math.round(apertura + ent - usc + caliEcc);
    var rilevata = salvata && salvata.giacenza_rilevata !== null && salvata.giacenza_rilevata !== undefined ? Number(salvata.giacenza_rilevata) : '';
    var diff = rilevata !== '' ? Math.round(rilevata - teorica) : null;
    var nota = salvata ? (salvata.note || '') : '';
    righeProd.push({
      prodotto: prod,
      apertura: apertura,
      entrate: ent,
      uscite: usc,
      delta: deltaGg,
      caliEcc: caliEcc,
      teorica: teorica,
      rilevata: rilevata,
      differenza: diff,
      nota: nota
    });
  });

  _stzGiornoDati = { data: data, righe: righeProd, letturePresenti: letturePresenti };

  // ── RENDER ──
  _stzGiornoRender();

  } catch (err) {
    console.error('[pf-stz-giac-giorno] ERRORE:', err);
    var cont = document.getElementById('stzg-blocco-giorno-contenuto');
    if (cont) {
      cont.innerHTML = '<div class="card"><div class="card-title">📅 Giacenza giornaliera — stazione Oppido</div>' +
        '<div style="padding:16px;color:#A32D2D;font-size:12px">' +
        '<strong>Errore caricamento:</strong> ' + (err && err.message ? esc(err.message) : String(err)) +
        '<div style="margin-top:8px;color:var(--text-muted);font-size:11px">Apri la console del browser (F12) per il dettaglio completo.</div>' +
        '<div style="margin-top:12px">Data: <input type="date" id="stzg-data" value="' + data + '" onchange="caricaStzGiacenzaGiorno()" style="font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)"/></div>' +
        '</div></div>';
    }
  }
}

function _stzGiornoRender() {
  var d = _stzGiornoDati;
  if (!d) return;
  var container = document.getElementById('stzg-blocco-giorno-contenuto');
  if (!container) return;

  var coloriProd = { 'Gasolio Autotrazione': '#D4A017', 'Benzina': '#639922', 'Gasolio Agricolo': '#6B5FCC', 'HVO': '#1D9E75' };

  var dataObj = new Date(d.data + 'T00:00:00');
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
  var giorniSett = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  var labelGiorno = giorniSett[dataObj.getDay()] + ' ' + dataObj.toLocaleDateString('it-IT');

  var inputDisabled = !d.letturePresenti;
  var disabledAttr = inputDisabled ? ' disabled' : '';
  var opacStyle = inputDisabled ? ';opacity:0.5' : '';

  var h = '<div class="card" style="padding:0;overflow:hidden">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:0.5px solid var(--border);background:var(--bg-card);flex-wrap:wrap;gap:8px">';
  h += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">' + labelRel + ' — stazione Oppido</div>';
  h += '<div style="font-size:15px;font-weight:500;margin-top:2px">' + labelGiorno + '</div></div>';
  h += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">';
  h += '<input type="date" id="stzg-data" value="' + d.data + '" onchange="caricaStzGiacenzaGiorno()" style="font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);margin-right:8px"/>';
  h += '<button onclick="_stzgCambiaGiorno(-1)" title="Precedente" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:6px 12px;font-size:14px;cursor:pointer;color:var(--text)">‹</button>';
  h += '<button onclick="_stzgVaiOggi()" title="Oggi" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;color:var(--text)">Oggi</button>';
  h += '<button onclick="_stzgCambiaGiorno(1)" title="Successivo" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:6px 12px;font-size:14px;cursor:pointer;color:var(--text)">›</button>';
  h += '<button onclick="_stzgMostraDettaglio(\'' + d.data + '\')" title="Dettaglio movimenti" style="margin-left:6px;width:30px;height:30px;border-radius:50%;background:#378ADD;color:#fff;border:none;cursor:pointer;font-family:Georgia,serif;font-size:16px;font-weight:700;font-style:italic;line-height:1;padding:0;display:flex;align-items:center;justify-content:center">i</button>';
  h += '</div></div>';

  if (!d.letturePresenti) {
    h += '<div style="padding:12px 18px;background:rgba(186,117,23,0.1);border-bottom:0.5px solid #BA7517;display:flex;align-items:center;gap:10px">';
    h += '<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#BA7517;color:#fff;font-weight:700;font-size:14px;flex-shrink:0">!</span>';
    h += '<div style="font-size:12px;color:#BA7517">Lettura pompe non inserita per questo giorno. Le uscite mostrate sono <strong>0 L</strong>. <a href="javascript:void(0)" onclick="_stzgVaiATotalizzatori()" style="color:#BA7517;text-decoration:underline;font-weight:500">Vai a Totalizzatori</a></div>';
    h += '</div>';
  }

  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:var(--bg-card)">';
  h += '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase">Prodotto</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase">Apertura</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;color:#185FA5;text-transform:uppercase">+ Entrate</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;color:#A32D2D;text-transform:uppercase">− Uscite pompe</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase">Δ giorno</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase">Cali</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase">Teorica</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase">Rilevata</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase">Differenza</th>';
  h += '<th style="text-align:left;padding:10px 14px;font-size:10px;color:var(--text-muted);text-transform:uppercase">Note</th>';
  h += '</tr></thead><tbody>';

  d.righe.forEach(function(r) {
    var col = coloriProd[r.prodotto] || '#888';
    var colDelta, txtDelta;
    if (r.delta > 0) { colDelta = '#639922'; txtDelta = '+' + fmtL(r.delta); }
    else if (r.delta < 0) { colDelta = '#A32D2D'; txtDelta = fmtL(r.delta); }
    else { colDelta = 'var(--text-muted)'; txtDelta = '—'; }
    var pe = esc(r.prodotto);

    h += '<tr style="border-top:0.5px solid var(--border)">';
    h += '<td style="padding:12px 14px;font-weight:500;border-left:3px solid ' + col + '"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-right:6px"></span>' + pe + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + fmtL(r.apertura) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-weight:500;color:' + (r.entrate > 0 ? '#185FA5' : 'var(--text-muted)') + '">' + (r.entrate > 0 ? '+' : '') + fmtL(r.entrate) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-weight:500;color:' + (r.uscite > 0 ? '#A32D2D' : 'var(--text-muted)') + '">' + (r.uscite > 0 ? '−' : '') + fmtL(r.uscite) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-weight:600;color:' + colDelta + '">' + txtDelta + '</td>';
    h += '<td style="padding:12px 10px;text-align:right"><input type="number" class="stzg-cali" data-prodotto="' + pe + '" value="' + r.caliEcc + '" step="1" oninput="_stzgRicalcola(\'' + pe + '\')" onchange="stzSalvaGiacenzaGiornoRiga(\'' + pe + '\')"' + disabledAttr + ' style="width:70px;font-family:var(--font-mono);font-size:11px;padding:4px 6px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text);text-align:right' + opacStyle + '"/></td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-size:13px;font-weight:600"><span class="stzg-teorica" data-prodotto="' + pe + '">' + fmtL(r.teorica) + '</span></td>';
    h += '<td style="padding:12px 10px;text-align:right"><input type="number" class="stzg-rilevata" data-prodotto="' + pe + '" value="' + r.rilevata + '" placeholder="' + r.teorica + '" step="1" oninput="_stzgCalcDiff(\'' + pe + '\')" onchange="stzSalvaGiacenzaGiornoRiga(\'' + pe + '\')"' + disabledAttr + ' style="width:80px;font-family:var(--font-mono);font-size:12px;font-weight:600;padding:4px 6px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text);text-align:right' + opacStyle + '"/></td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-weight:600"><span class="stzg-diff" data-prodotto="' + pe + '" style="color:' + (r.differenza !== null ? (r.differenza >= 0 ? '#639922' : '#A32D2D') : 'var(--text-muted)') + '">' + (r.differenza !== null ? (r.differenza >= 0 ? '+' : '') + fmtL(r.differenza) : '—') + '</span></td>';
    h += '<td style="padding:12px 14px"><input type="text" class="stzg-nota" data-prodotto="' + pe + '" value="' + esc(r.nota) + '" onchange="stzSalvaGiacenzaGiornoRiga(\'' + pe + '\')"' + disabledAttr + ' placeholder="—" style="width:100%;min-width:140px;font-size:12px;padding:4px 8px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text)' + opacStyle + '"/></td>';
    h += '</tr>';
  });

  h += '</tbody></table></div></div>';
  h += '<div id="stzg-dettaglio-box" style="margin-top:14px"></div>';
  container.innerHTML = h;
}

function _stzgCambiaGiorno(deltaGiorni) {
  var dataEl = document.getElementById('stzg-data');
  var corr = (dataEl && dataEl.value) ? dataEl.value : oggiISO;
  var parts = corr.split('-');
  var nuovaData = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
  nuovaData.setUTCDate(nuovaData.getUTCDate() + deltaGiorni);
  if (dataEl) dataEl.value = nuovaData.toISOString().split('T')[0];
  caricaStzGiacenzaGiorno();
}

function _stzgVaiOggi() {
  var dataEl = document.getElementById('stzg-data');
  if (dataEl) dataEl.value = oggiISO;
  caricaStzGiacenzaGiorno();
}

function _stzgVaiATotalizzatori() {
  var btn = document.querySelector('.stz-tab[data-tab="stz-letture"]');
  if (btn) btn.click();
}

function _stzgRicalcola(prod) {
  if (!_stzGiornoDati) return;
  var riga = _stzGiornoDati.righe.find(function(r) { return r.prodotto === prod; });
  if (!riga) return;
  var caliEl = document.querySelector('.stzg-cali[data-prodotto="' + prod + '"]');
  if (!caliEl) return;
  var nuoviCali = Number(caliEl.value || 0);
  riga.caliEcc = nuoviCali;
  riga.teorica = Math.round(riga.apertura + riga.entrate - riga.uscite + nuoviCali);
  var teorEl = document.querySelector('.stzg-teorica[data-prodotto="' + prod + '"]');
  if (teorEl) teorEl.textContent = fmtL(riga.teorica);
  _stzgCalcDiff(prod);
}

function _stzgCalcDiff(prod) {
  if (!_stzGiornoDati) return;
  var riga = _stzGiornoDati.righe.find(function(r) { return r.prodotto === prod; });
  if (!riga) return;
  var rilEl = document.querySelector('.stzg-rilevata[data-prodotto="' + prod + '"]');
  var diffEl = document.querySelector('.stzg-diff[data-prodotto="' + prod + '"]');
  if (!rilEl || !diffEl) return;
  var rilVal = rilEl.value.trim();
  if (rilVal === '') {
    riga.rilevata = '';
    riga.differenza = null;
    diffEl.textContent = '—';
    diffEl.style.color = 'var(--text-muted)';
    return;
  }
  var rilNum = Number(rilVal);
  riga.rilevata = rilNum;
  riga.differenza = Math.round(rilNum - riga.teorica);
  diffEl.textContent = (riga.differenza >= 0 ? '+' : '') + fmtL(riga.differenza);
  diffEl.style.color = riga.differenza >= 0 ? '#639922' : '#A32D2D';
}

async function stzSalvaGiacenzaGiornoRiga(prod) {
  if (!_stzGiornoDati) return;
  var riga = _stzGiornoDati.righe.find(function(r) { return r.prodotto === prod; });
  if (!riga) return;
  var caliEl = document.querySelector('.stzg-cali[data-prodotto="' + prod + '"]');
  var rilEl = document.querySelector('.stzg-rilevata[data-prodotto="' + prod + '"]');
  var notaEl = document.querySelector('.stzg-nota[data-prodotto="' + prod + '"]');
  var caliVal = caliEl ? Number(caliEl.value || 0) : 0;
  var rilStr = rilEl ? rilEl.value.trim() : '';
  var rilVal = rilStr === '' ? null : Number(rilStr);
  var notaVal = notaEl ? (notaEl.value || '') : '';
  var teoricaCalc = Math.round(riga.apertura + riga.entrate - riga.uscite + caliVal);

  var payload = {
    data: _stzGiornoDati.data,
    sede: 'stazione_oppido',
    prodotto: prod,
    giacenza_inizio: Math.round(riga.apertura),
    entrate: Math.round(riga.entrate),
    uscite: Math.round(riga.uscite),
    cali_eccedenze: caliVal,
    giacenza_teorica: teoricaCalc,
    giacenza_rilevata: rilVal,
    differenza: rilVal === null ? null : Math.round(rilVal - teoricaCalc),
    note: notaVal
  };

  try {
    var res = await sb.from('giacenze_giornaliere').upsert(payload, { onConflict: 'data,sede,prodotto' });
    if (res.error) throw res.error;
    if (typeof toast === 'function') toast('✓ Salvato ' + prod);
  } catch (err) {
    console.error('[stzSalva] errore:', err);
    if (typeof toast === 'function') toast('✗ Errore: ' + (err.message || err));
  }
}

var _stzgDettaglioCorrente = null;
async function _stzgMostraDettaglio(iso) {
  var box = document.getElementById('stzg-dettaglio-box');
  if (!box) return;
  if (_stzgDettaglioCorrente === iso) {
    box.innerHTML = '';
    _stzgDettaglioCorrente = null;
    return;
  }
  _stzgDettaglioCorrente = iso;
  var dataLbl = (typeof fmtD === 'function') ? fmtD(iso) : iso;
  box.innerHTML = '<div class="loading" style="padding:16px;text-align:center">Caricamento movimenti del ' + dataLbl + '...</div>';

  try {
    var entrateOrd = [];
    if (typeof pfData !== 'undefined' && pfData.getOrdini) {
      var tutti = await pfData.getOrdini({ da: iso, a: iso });
      entrateOrd = tutti.filter(function(o) { return o.tipo_ordine === 'stazione_servizio'; });
    } else {
      var res = await sb.from('ordini').select('*,basi_carico(nome)').eq('tipo_ordine', 'stazione_servizio').eq('data', iso).in('stato', ['confermato', 'consegnato']);
      entrateOrd = res.data || [];
    }

    var usciteTot = 0;
    if (_stzGiornoDati && _stzGiornoDati.righe) {
      _stzGiornoDati.righe.forEach(function(r) { usciteTot += r.uscite; });
    }

    var header = '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:8px 8px 0 0;border-bottom:none">';
    header += '<div style="font-size:13px;font-weight:600;color:var(--text)">Dettaglio movimenti del ' + dataLbl + '</div>';
    header += '<button class="btn-edit" style="font-size:11px;padding:3px 10px" onclick="_stzgMostraDettaglio(\'' + iso + '\')" title="Chiudi">✕</button>';
    header += '</div>';

    var body = '<div style="padding:12px 14px;border:0.5px solid var(--border);border-top:none;border-radius:0 0 8px 8px;background:var(--bg-card)">';
    if (typeof _movRenderBlocchi === 'function') {
      body += _movRenderBlocchi(entrateOrd, [], true, false, 'compact');
    } else {
      body += '<div style="font-size:12px;color:var(--text-muted)">Entrate del giorno: ' + entrateOrd.length + ' ordini</div>';
    }
    body += '<div style="margin-top:10px;padding-top:10px;border-top:0.5px solid var(--border);font-size:11px;color:var(--text-muted)">Uscite totali (da letture pompe): <strong style="font-family:var(--font-mono);color:var(--text)">' + fmtL(usciteTot) + ' L</strong> · Dettaglio per pompa nel tab <strong>Totalizzatori</strong>.</div>';
    body += '</div>';
    box.innerHTML = header + body;
  } catch (err) {
    box.innerHTML = '<div style="padding:16px;color:#A32D2D;font-size:12px">Errore: ' + (err.message || err) + '</div>';
  }
}

// ═══════════════════════════════════════════════════════════════════
// RICOSTRUZIONE CATENA giacenze_giornaliere stazione_oppido
// Dal 31/12/2025 (apertura manuale) fino a dataTarget inclusa.
// Idempotente: non tocca record esistenti, inserisce solo i mancanti
// con giacenza_rilevata=null (snapshot di sistema).
// ═══════════════════════════════════════════════════════════════════
async function _stzgAssicuraCatena(dataTarget) {
  var DATA_INIZIO = '2025-12-31'; // apertura nota (inserita manuale)
  if (dataTarget < DATA_INIZIO) return;

  // Carica in blocco TUTTO ciò che serve nel range [DATA_INIZIO, dataTarget]
  var [pompeRes, giacRes, lettRes, ordRes] = await Promise.all([
    sb.from('stazione_pompe').select('id,nome,prodotto,attiva').eq('attiva', true),
    sb.from('giacenze_giornaliere').select('*').eq('sede', 'stazione_oppido').gte('data', DATA_INIZIO).lte('data', dataTarget).order('data'),
    sb.from('stazione_letture').select('pompa_id,lettura,data').gte('data', DATA_INIZIO).lte('data', dataTarget).order('data'),
    sb.from('ordini').select('data,prodotto,litri,tipo_ordine,stato').eq('tipo_ordine', 'stazione_servizio').gte('data', DATA_INIZIO).lte('data', dataTarget).in('stato', ['confermato','consegnato']).eq('ricevuto_stazione', true)
  ]);

  var pompe = pompeRes.data || [];
  var giacEsistenti = giacRes.data || [];
  var letture = lettRes.data || [];
  var ordini = ordRes.data || [];

  // Indicizza
  var pompaProd = {};
  pompe.forEach(function(p) { pompaProd[p.id] = p.prodotto; });

  // Mappa letture: {data: {pompa_id: lettura}}
  var lettureByData = {};
  letture.forEach(function(l) {
    if (!lettureByData[l.data]) lettureByData[l.data] = {};
    lettureByData[l.data][l.pompa_id] = Number(l.lettura);
  });

  // Mappa entrate: {data: {prodotto: litri_totali}}
  var entrateByData = {};
  ordini.forEach(function(o) {
    if (!entrateByData[o.data]) entrateByData[o.data] = {};
    if (!entrateByData[o.data][o.prodotto]) entrateByData[o.data][o.prodotto] = 0;
    entrateByData[o.data][o.prodotto] += Number(o.litri || 0);
  });

  // Mappa record esistenti: {"data__prodotto": row}
  var giacMap = {};
  giacEsistenti.forEach(function(g) { giacMap[g.data + '__' + g.prodotto] = g; });

  // Prodotti distinti presenti
  var prodottiSet = {};
  pompe.forEach(function(p) { prodottiSet[p.prodotto] = true; });
  var prodotti = Object.keys(prodottiSet);

  // Cammina giorno per giorno da DATA_INIZIO+1 fino a dataTarget
  var giornoCorr = DATA_INIZIO;
  var daInserire = [];

  while (giornoCorr < dataTarget) {
    // Calcola giorno successivo (UTC-safe)
    var parts = giornoCorr.split('-');
    var dx = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
    dx.setUTCDate(dx.getUTCDate() + 1);
    var giornoSucc = dx.toISOString().split('T')[0];

    prodotti.forEach(function(prod) {
      // Skip se il record per giornoSucc/prod esiste già
      if (giacMap[giornoSucc + '__' + prod]) return;

      // Apertura = rilevata di giornoCorr, fallback teorica di giornoCorr
      var recPrec = giacMap[giornoCorr + '__' + prod];
      if (!recPrec) return; // senza giorno prec non posso calcolare, salto
      var apertura = (recPrec.giacenza_rilevata !== null && recPrec.giacenza_rilevata !== undefined)
        ? Number(recPrec.giacenza_rilevata)
        : Number(recPrec.giacenza_teorica || 0);

      // Uscite = somma diff letture delle pompe di questo prodotto
      var lettOggi = lettureByData[giornoSucc] || {};
      var lettPrec = lettureByData[giornoCorr] || {};
      var uscite = 0;
      pompe.forEach(function(p) {
        if (p.prodotto !== prod) return;
        if (lettOggi[p.id] !== undefined && lettPrec[p.id] !== undefined) {
          var diff = lettOggi[p.id] - lettPrec[p.id];
          if (diff > 0) uscite += diff;
        }
      });

      // Entrate
      var entrate = (entrateByData[giornoSucc] && entrateByData[giornoSucc][prod]) || 0;

      var teorica = Math.round(apertura + entrate - uscite);
      var record = {
        data: giornoSucc,
        sede: 'stazione_oppido',
        prodotto: prod,
        giacenza_inizio: Math.round(apertura),
        entrate: Math.round(entrate),
        uscite: Math.round(uscite),
        cali_eccedenze: 0,
        giacenza_teorica: teorica,
        giacenza_rilevata: null,
        differenza: null,
        note: ''
      };
      daInserire.push(record);
      // Aggiungi al map per i giorni successivi del loop
      giacMap[giornoSucc + '__' + prod] = record;
    });

    giornoCorr = giornoSucc;
  }

  if (daInserire.length === 0) {
    return;
  }

  var res = await sb.from('giacenze_giornaliere').upsert(daInserire, { onConflict: 'data,sede,prodotto' });
  if (res.error) {
    console.error('[_stzgAssicuraCatena] errore upsert:', res.error);
    throw res.error;
  }
}

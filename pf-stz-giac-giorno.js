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
  var giornoPrima = new Date(new Date(data + 'T00:00:00').getTime() - 86400000).toISOString().split('T')[0];

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
  var entrateOrdini = [];
  try {
    if (typeof pfData !== 'undefined' && pfData.getOrdini) {
      var tuttiOrd = await pfData.getOrdini({ da: data, a: data });
      entrateOrdini = tuttiOrd.filter(function(o) { return o.tipo_ordine === 'stazione_servizio'; });
    } else {
      // Fallback se pfData non è caricato
      var res = await sb.from('ordini').select('prodotto,litri,stato').eq('tipo_ordine', 'stazione_servizio').eq('data', data).in('stato', ['confermato', 'consegnato']);
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

  // ── LOG CONSOLE PER VERIFICA SENTINELLE ──
  console.log('[pf-stz-giac-giorno] ' + data + ' — letture oggi: ' + lettOggi.length + ', letture gg prec: ' + lettPrec.length);
  righeProd.forEach(function(r) {
    console.log('  ' + r.prodotto + ': apertura ' + r.apertura + ', entrate +' + r.entrate + ', uscite -' + r.uscite + ', teorica ' + r.teorica + (r.rilevata !== '' ? ', rilevata ' + r.rilevata : ''));
  });

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

  var h = '<div class="card">';
  h += '<div class="card-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  h += '<span>📅 Giacenza giornaliera — stazione Oppido</span>';
  h += '<div style="display:flex;gap:6px;align-items:center">';
  h += '<label style="font-size:11px;color:var(--text-muted)">Data:</label>';
  h += '<input type="date" id="stzg-data" value="' + d.data + '" onchange="caricaStzGiacenzaGiorno()" style="font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)"/>';
  h += '</div>';
  h += '</div>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Vista read-only (step B.3.a.1). Salvataggio, frecce e banner nel prossimo step. Controlla la console del browser (F12) per verificare i numeri contro le sentinelle.</div>';

  if (!d.letturePresenti) {
    h += '<div style="padding:10px 14px;background:rgba(186,117,23,0.1);border:0.5px solid #BA7517;border-radius:8px;margin-bottom:12px;font-size:12px;color:#BA7517">⚠️ Nessuna lettura pompe inserita per questo giorno. Le uscite mostrate sono 0 L.</div>';
  }

  h += '<div style="overflow-x:auto">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:var(--bg-card)">';
  h += '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Prodotto</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase">Apertura</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:#185FA5;text-transform:uppercase">+ Entrate</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:#A32D2D;text-transform:uppercase">− Uscite pompe</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase">Δ giorno</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase">Cali</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase">Teorica</th>';
  h += '<th style="text-align:right;padding:10px 10px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase">Rilevata</th>';
  h += '<th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:500;color:var(--text-muted);text-transform:uppercase">Differenza</th>';
  h += '</tr></thead><tbody>';

  d.righe.forEach(function(r) {
    var col = coloriProd[r.prodotto] || '#888';
    var colDelta, txtDelta;
    if (r.delta > 0) { colDelta = '#639922'; txtDelta = '+' + fmtL(r.delta); }
    else if (r.delta < 0) { colDelta = '#A32D2D'; txtDelta = fmtL(r.delta); }
    else { colDelta = 'var(--text-muted)'; txtDelta = '—'; }

    h += '<tr style="border-top:0.5px solid var(--border)">';
    h += '<td style="padding:12px 14px;font-weight:500;border-left:3px solid ' + col + '"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-right:6px"></span>' + esc(r.prodotto) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + fmtL(r.apertura) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-weight:500;color:' + (r.entrate > 0 ? '#185FA5' : 'var(--text-muted)') + '">' + (r.entrate > 0 ? '+' : '') + fmtL(r.entrate) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-weight:500;color:' + (r.uscite > 0 ? '#A32D2D' : 'var(--text-muted)') + '">' + (r.uscite > 0 ? '−' : '') + fmtL(r.uscite) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-weight:600;color:' + colDelta + '">' + txtDelta + '</td>';
    h += '<td style="padding:12px 10px;text-align:right"><input type="number" disabled value="' + r.caliEcc + '" style="width:70px;font-family:var(--font-mono);font-size:11px;padding:4px 6px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text-muted);text-align:right;opacity:0.6"/></td>';
    h += '<td style="padding:12px 10px;text-align:right;font-family:var(--font-mono);font-size:13px;font-weight:600">' + fmtL(r.teorica) + '</td>';
    h += '<td style="padding:12px 10px;text-align:right"><input type="number" disabled value="' + r.rilevata + '" placeholder="' + r.teorica + '" style="width:80px;font-family:var(--font-mono);font-size:12px;padding:4px 6px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text-muted);text-align:right;opacity:0.6"/></td>';
    h += '<td style="padding:12px 14px;text-align:right;font-family:var(--font-mono);font-weight:600;color:' + (r.differenza !== null ? (r.differenza >= 0 ? '#639922' : '#A32D2D') : 'var(--text-muted)') + '">' + (r.differenza !== null ? (r.differenza >= 0 ? '+' : '') + fmtL(r.differenza) : '—') + '</td>';
    h += '</tr>';
  });

  h += '</tbody></table></div>';
  h += '</div>';

  container.innerHTML = h;
}

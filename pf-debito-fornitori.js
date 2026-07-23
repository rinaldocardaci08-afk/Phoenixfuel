// ═══════════════════════════════════════════════════════════════════
// pf-debito-fornitori.js — QUERY MADRE del DEBITO FORNITORI
// v20260723c — FIX FIDO (squadratura segnalata da Rinaldo su Q8): una fattura
//   agganciata a ordini TUTTI flag-pagati (pagato_fornitore, es. avvio dati)
//   è un debito GIÀ ESTINTO anche se nessun pagamento è registrato in
//   pagamenti_fornitori — prima rientrava nell'esposizione a pieno residuo,
//   gonfiando il fido occupato dell'importo della fattura. Ora saldata=true.
// v20260723b — ogni ordine è arricchito anche con numeroFattura e fattSaldata
//   della fattura a cui è agganciato: così le viste mostrano il numero in riga
//   (come in Consegne clienti) senza un elenco fatture separato.
// v20260723a
//
// REGOLA QUERY MADRE (costituzionale, Rinaldo): una sola query per dominio,
// da cui DERIVANO tutte le viste come rami con parametri. Niente query
// disgiunte da riconciliare a mano: i numeri combaciano per costruzione.
//
// Questo modulo è l'UNICO punto del programma che legge il debito fornitori.
// Consumatori (rami): estratto conto fornitore, scadenzario/Fatture Fornitori,
// linguetta Senza fattura, pannello fido in dashboard, scheda fornitori.
// I moduli non ancora convertiti sono elencati in QUERY_MADRI_PHOENIXFUEL.md.
//
// REGOLE INCORPORATE (una volta sola, qui):
//   • PERIMETRO: tutti gli ordini dei fornitori in ANAGRAFICA, dal 1° gennaio
//     dell'anno precedente. NESSUN filtro su tipo_ordine: un ordine fornitore
//     è un debito qualunque sia il luogo di scarico (deposito, Oppido,
//     consegna diretta dal cliente). Phoenix non è in anagrafica → esce da sé.
//   • SCADENZA: pfScadenzaFornitore — giorni SEMPRE da fornitori.giorni_pagamento
//     (mai dall'ordine), la data_scadenza della fattura prevale, sab/dom → lunedì.
//   • IMPORTI: imponibile = costo_litro × litri; totale = imponibile × (1+iva/100),
//     iva default 22. Il fido si calcola sul totale IVA compresa.
//   • PAGINAZIONE: _pfFetchAllPages sempre (tabella che cresce).
//
// USO:
//   var d = await pfDebitoDati();          // cache di sessione
//   var d = await pfDebitoDati(true);      // ricarica forzata
//   pfDebitoInvalida();                    // da chiamare DOPO OGNI SCRITTURA
//                                          // su ordini/fatture_ricevute/pagamenti_fornitori
// Restituisce { fornitori, fornitoriMap, ordini, fatture, pagamenti }:
//   ordini  arricchiti: imponibile, totale, scadenza, pagato, fatturaId (+ campi grezzi)
//   fatture arricchite: totale, pagato, nPag, ultimoPag, residuo, saldata, ordini[]
// ═══════════════════════════════════════════════════════════════════

var _dfCache = null;

// ── Regola di scadenza UNICA (spostata qui da pf-estratto-fornitore.js;
//    la usano anche pf-finanze.js e pf-scadenzario-fornitori.js) ──
function pfScadenzaFornitore(dataOrdine, ggFornitore, dataScadenzaFattura) {
  var base = dataScadenzaFattura ? String(dataScadenzaFattura).slice(0, 10) : null;
  if (!base) {
    if (!dataOrdine) return null;
    var d = new Date(String(dataOrdine).slice(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() + Number(ggFornitore || 30));
    base = d.toISOString().slice(0, 10);
  }
  var x = new Date(base + 'T12:00:00');
  var g = x.getDay();
  if (g === 6) x.setDate(x.getDate() + 2);
  if (g === 0) x.setDate(x.getDate() + 1);
  return x.toISOString().slice(0, 10);
}

function pfDebitoInvalida() { _dfCache = null; }

async function pfDebitoDati(force) {
  if (_dfCache && !force) return _dfCache;

  var da = (new Date().getFullYear() - 1) + '-01-01';
  var r = await Promise.all([
    sb.from('fornitori').select('id,nome,fido_massimo,giorni_pagamento,colore').order('nome'),
    _pfFetchAllPages(function () {
      return sb.from('ordini')
        .select('id,data,fornitore,prodotto,litri,costo_litro,trasporto_litro,iva,stato,tipo_ordine,pagato_fornitore,data_pagamento_fornitore,fattura_ricevuta_id,das_firmato_url')
        .neq('stato', 'annullato')
        .gte('data', da)
        .order('data', { ascending: false });
    }),
    sb.from('fatture_ricevute').select('*'),
    sb.from('pagamenti_fornitori').select('*').order('data_pagamento', { ascending: true })
  ]);

  var fornitori = r[0].data || [];
  var fornitoriMap = {};
  fornitori.forEach(function (f) {
    if (f.nome) fornitoriMap[String(f.nome).toLowerCase().trim()] = f;
  });

  // Perimetro: SOLO fornitori in anagrafica (Phoenix siamo noi, non c'è).
  var ordini = (r[1] || []).filter(function (o) {
    return !!fornitoriMap[String(o.fornitore || '').toLowerCase().trim()];
  });

  var fatture = r[2].data || [];
  var pagamenti = r[3].data || [];
  var fattMap = {};
  fatture.forEach(function (f) { fattMap[f.id] = f; });

  // Arricchimento ordini: importi e scadenza con la regola unica.
  ordini.forEach(function (o) {
    var forn = fornitoriMap[String(o.fornitore || '').toLowerCase().trim()] || {};
    var gg = Number(forn.giorni_pagamento || 30);
    var fatt = o.fattura_ricevuta_id ? fattMap[o.fattura_ricevuta_id] : null;
    o.imponibile = Math.round(Number(o.costo_litro || 0) * Number(o.litri || 0) * 100) / 100;
    o.totale = Math.round(Number(o.costo_litro || 0) * Number(o.litri || 0) * (1 + Number(o.iva == null ? 22 : o.iva) / 100) * 100) / 100;
    o.scadenza = pfScadenzaFornitore(o.data, gg, fatt ? fatt.data_scadenza : null);
    o.pagato = !!o.pagato_fornitore;
    o.fatturaId = o.fattura_ricevuta_id || null;
    o.costoL = Number(o.costo_litro || 0);
  });

  // Arricchimento fatture: pagato/residuo/saldata e ordini collegati.
  var pagPerFatt = {};
  pagamenti.forEach(function (p) {
    if (!pagPerFatt[p.fattura_ricevuta_id]) pagPerFatt[p.fattura_ricevuta_id] = { tot: 0, n: 0, ultima: null };
    var m = pagPerFatt[p.fattura_ricevuta_id];
    m.tot += Number(p.importo || 0); m.n++;
    if (!m.ultima || String(p.data_pagamento) > String(m.ultima)) m.ultima = p.data_pagamento;
  });
  fatture.forEach(function (f) {
    var ords = ordini.filter(function (o) { return o.fatturaId === f.id; });
    ords.forEach(function (o) { o.numeroFattura = f.numero_fattura || null; });
    var tot = Number(f.importo_dichiarato || 0) || ords.reduce(function (s, o) { return s + o.totale; }, 0);
    var pg = pagPerFatt[f.id] || { tot: 0, n: 0, ultima: null };
    f.numero = f.numero_fattura;
    f.data = f.data_fattura;
    f.scadenza = f.data_scadenza;
    f.totale = tot;
    f.pagato = pg.tot; f.nPag = pg.n; f.ultimoPag = pg.ultima;
    f.residuo = Math.round((tot - pg.tot) * 100) / 100;
    // Debito estinto anche via flag ordini: PAGATO vince pure sul calcolo,
    // non solo sul label (regola ibrida — il flag dice che è stato pagato).
    var flagPagata = ords.length > 0 && ords.every(function (o) { return !!o.pagato; });
    f.saldata = f.residuo <= 0.01 || flagPagata;
    if (f.saldata && f.residuo > 0.01) f.residuo = 0;
    f.ordini = ords;
    ords.forEach(function (o) { o.fattSaldata = f.saldata; o.fattAcconti = f.nPag > 0 && !f.saldata; });
  });

  _dfCache = { fornitori: fornitori, fornitoriMap: fornitoriMap, ordini: ordini, fatture: fatture, pagamenti: pagamenti };
  return _dfCache;
}

// ═══════════════════════════════════════════════════════════════════
// RAMI — derivazioni con parametri, nessuna query propria
// ═══════════════════════════════════════════════════════════════════

// Esposizione di un elenco di ordini/fatture: ordini non pagati senza fattura
// + residui delle fatture aperte (regola unica del fido).
function pfDebitoEsposizione(ordini, fatture) {
  var a = ordini.filter(function (o) { return !o.fatturaId && !o.pagato; })
                .reduce(function (s, o) { return s + o.totale; }, 0);
  var b = fatture.reduce(function (s, f) { return s + (f.saldata ? 0 : f.residuo); }, 0);
  return Math.round((a + b) * 100) / 100;
}

// Ramo: ordini e fatture di UN fornitore (estratto conto, linguetta Senza fattura).
async function pfDebitoFornitore(nome, force) {
  var d = await pfDebitoDati(force);
  var k = String(nome || '').toLowerCase().trim();
  var ordini = d.ordini.filter(function (o) { return String(o.fornitore || '').toLowerCase().trim() === k; });
  var fatture = d.fatture.filter(function (f) {
    return String(f.fornitore_nome || '').toLowerCase().trim() === k
        || ordini.some(function (o) { return o.fatturaId === f.id; });
  }).sort(function (a, b) { return String(b.data || '').localeCompare(String(a.data || '')); });
  return { ordini: ordini, fatture: fatture, fornitore: d.fornitoriMap[k] || null };
}

// Ramo: card per fornitore (panoramica estratto conto + pannello fido dashboard).
// annoSel = anno per "acquistato"; l'esposizione è sempre lo stato attuale.
async function pfDebitoCards(annoSel, force) {
  var d = await pfDebitoDati(force);
  var annoG = Number(annoSel) || new Date().getFullYear();
  var oggi = new Date().toISOString().slice(0, 10);

  return d.fornitori.map(function (f) {
    var nome = String(f.nome || ''), gg = Number(f.giorni_pagamento || 30), fido = Number(f.fido_massimo || 0);
    var k = nome.toLowerCase().trim();
    var suoi = d.ordini.filter(function (o) { return String(o.fornitore || '').toLowerCase().trim() === k; });
    var sueFatt = d.fatture.filter(function (x) { return String(x.fornitore_nome || '').toLowerCase().trim() === k; });
    var aperti = suoi.filter(function (o) { return !o.pagato && !o.fatturaId; });
    var esp = pfDebitoEsposizione(suoi, sueFatt);
    var scad = aperti.map(function (o) { return o.scadenza; }).filter(Boolean).sort();
    var annoOrd = suoi.filter(function (o) { return String(o.data).slice(0, 4) === String(annoG); });
    return {
      id: f.id, nome: nome, gg: gg, fido: fido,
      esp: esp, nAperti: aperti.length,
      prossima: scad.length ? scad[0] : null,
      scadute: scad.filter(function (x) { return x < oggi; }).length,
      acq: annoOrd.reduce(function (s, o) { return s + o.imponibile; }, 0),
      litri: annoOrd.reduce(function (s, o) { return s + Number(o.litri || 0); }, 0),
      euro: annoOrd.reduce(function (s, o) { return s + o.totale; }, 0),
      ordiniAnno: annoOrd
    };
  }).filter(function (c) { return c.fido > 0 || c.nAperti > 0 || c.acq > 0; })
    .sort(function (a, b) { return b.esp - a.esp; });
}

// ═══════════════════════════════════════════════════════════════════
// pf-debito-fornitori.js — QUERY MADRE del DEBITO FORNITORI
// v20260724a — sugli ordini di fatture con acconti sono esposti anche
//   fattPagatoVal (acconti versati) e fattResiduo (residuo della fattura),
//   così elenchi e stampa mostrano il debito residuo senza ricalcoli.
// v20260723d — FIDO SEMPRE DAGLI ORDINI (direttiva Rinaldo, ripristinata):
//   l'esposizione è Σ totale IVA inc. degli ORDINI ancora vivi (non pagati e
//   non su fattura saldata) MENO gli acconti registrati sulle fatture aperte.
//   L'importo DICHIARATO della fattura NON entra mai nel fido: l'ordine pesa
//   dal momento in cui esiste (just in time), la fattura porta solo numero e
//   scadenza, il pagamento libera. Gli scarti dichiarato↔ordini restano
//   visibili SOLO nell'override quadratura. (v20260723c aveva fatto seguire
//   al fido il dichiarato: direttiva violata, annullata qui.)
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
        .select('id,data,fornitore,prodotto,litri,costo_litro,trasporto_litro,iva,stato,tipo_ordine,pagato_fornitore,data_pagamento_fornitore,fattura_ricevuta_id,das_firmato_url,cliente,sede_scarico_nome,destinazione')
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
    ords.forEach(function (o) {
      o.fattSaldata = f.saldata;
      o.fattAcconti = f.nPag > 0 && !f.saldata;
      o.fattPagatoVal = f.pagato;
      o.fattResiduo = f.residuo;
    });
  });

  _dfCache = { fornitori: fornitori, fornitoriMap: fornitoriMap, ordini: ordini, fatture: fatture, pagamenti: pagamenti };
  return _dfCache;
}

// ═══════════════════════════════════════════════════════════════════
// RAMI — derivazioni con parametri, nessuna query propria
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// NUMERO FATTURA GIA' USATO (27/07 — richiesta Rinaldo)
// Un fornitore fattura piu ordini nella STESSA fattura, quindi trovare il
// numero gia presente non deve essere un blocco: si aggancia l'ordine alla
// fattura che esiste. Il vincolo unique (fornitore, numero) resta e va
// rispettato — non si crea mai una seconda fattura con lo stesso numero.
// Scritto qui una volta sola e usato dai tre punti che registrano un numero:
// motore (pf-reg-fattura), scadenzario, estratto conto.
// ═══════════════════════════════════════════════════════════════════

// Cerca la fattura di quel fornitore con quel numero. null se non c'e.
async function pfFatturaConNumero(fornitoreId, fornitoreNome, numero) {
  var num = String(numero || '').trim();
  if (!num) return null;
  try {
    var q = sb.from('fatture_ricevute').select('*').eq('numero_fattura', num);
    if (fornitoreId) q = q.eq('fornitore_id', fornitoreId);
    else if (fornitoreNome) q = q.ilike('fornitore_nome', String(fornitoreNome).trim());
    var res = await q;
    if (res.error) return null;
    return (res.data && res.data[0]) || null;
  } catch (e) {
    console.warn('[debito] ricerca numero fattura', e);
    return null;
  }
}

// Chiede se agganciare gli ordini alla fattura esistente, mostrando cosa c'e
// gia dentro. Ritorna true/false.
async function pfChiediAggancioFattura(f, nOrdiniNuovi, fmt) {
  var euro = fmt || function (v) { return '€ ' + Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var nGia = 0, totGia = 0;
  try {
    var res = await sb.from('ordini').select('id,litri,costo_litro,iva').eq('fattura_ricevuta_id', f.id);
    (res.data || []).forEach(function (o) {
      nGia++;
      totGia += Number(o.costo_litro || 0) * Number(o.litri || 0) * (1 + Number(o.iva != null ? o.iva : 22) / 100);
    });
  } catch (e) { /* il conteggio e' solo informativo */ }

  var dataF = f.data_fattura ? String(f.data_fattura).split('-').reverse().join('/') : '—';
  var msg = 'Il numero ' + f.numero_fattura + ' esiste gia per questo fornitore.\n\n'
    + 'Fattura del ' + dataF
    + (nGia ? ' · ' + nGia + (nGia === 1 ? ' ordine gia agganciato' : ' ordini gia agganciati') + ' · ' + euro(totGia) : ' · nessun ordine agganciato')
    + (f.importo_dichiarato ? '\nImporto dichiarato: ' + euro(f.importo_dichiarato) : '')
    + '\n\nAggancio anche ' + nOrdiniNuovi + (nOrdiniNuovi === 1 ? ' ordine' : ' ordini') + ' a QUESTA fattura?\n'
    + '(non viene creata una seconda fattura con lo stesso numero)';
  return confirm(msg);
}

// Aggancia gli ordini alla fattura esistente.
async function pfAgganciaOrdiniAFattura(fatturaId, ordiniIds) {
  var res = await sb.from('ordini').update({ fattura_ricevuta_id: fatturaId }).in('id', ordiniIds);
  if (res.error) throw res.error;
  pfDebitoInvalida();
  return true;
}

// Esposizione = FIDO DAGLI ORDINI (regola costituzionale):
//   Σ totale IVA inc. degli ordini VIVI (non flag-pagati e non su fattura
//   saldata) − acconti registrati sulle fatture aperte.
// Il dichiarato della fattura non entra: il debito in tempo reale è l'ordine.
function pfDebitoEsposizione(ordini, fatture) {
  var a = ordini.filter(function (o) { return !o.pagato && !o.fattSaldata; })
                .reduce(function (s, o) { return s + o.totale; }, 0);
  var acconti = fatture.reduce(function (s, f) { return s + (f.saldata ? 0 : Number(f.pagato || 0)); }, 0);
  return Math.round(Math.max(0, a - acconti) * 100) / 100;
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
    // PROSSIMA SCADENZA (28/07): si guardano gli ordini VIVI — non pagati e non
    // su fattura saldata — cioe' lo stesso perimetro dell'esposizione. Prima si
    // guardavano solo quelli SENZA fattura, quindi un ordine gia numerato ma da
    // pagare non contava: per Q8 usciva 07/09 invece del 06/08 reale.
    var vivi = suoi.filter(function (o) { return !o.pagato && !o.fattSaldata; });
    var scad = vivi.map(function (o) { return o.scadenza; }).filter(Boolean).sort();
    var annoOrd = suoi.filter(function (o) { return String(o.data).slice(0, 4) === String(annoG); });
    return {
      id: f.id, nome: nome, gg: gg, fido: fido,
      esp: esp,
      // quota dell'esposizione GIA' su fattura e quota ancora DA FATTURARE
      // (30/07): servono a colorare la barra del fido in due toni
      espFatturato: vivi.filter(function (o) { return o.fatturaId; })
                        .reduce(function (a, o) { return a + Number(o.totale || 0); }, 0),
      espDaFatturare: vivi.filter(function (o) { return !o.fatturaId; })
                          .reduce(function (a, o) { return a + Number(o.totale || 0); }, 0),
      nAperti: aperti.length,
      prossima: scad.length ? scad[0] : null,
      prossimaImporto: scad.length ? vivi.filter(function (o) { return o.scadenza === scad[0]; })
                                         .reduce(function (a, o) { return a + Number(o.totale || 0); }, 0) : 0,
      scadute: scad.filter(function (x) { return x < oggi; }).length,
      acq: annoOrd.reduce(function (s, o) { return s + o.imponibile; }, 0),
      litri: annoOrd.reduce(function (s, o) { return s + Number(o.litri || 0); }, 0),
      euro: annoOrd.reduce(function (s, o) { return s + o.totale; }, 0),
      ordiniAnno: annoOrd
    };
  }).filter(function (c) { return c.fido > 0 || c.nAperti > 0 || c.acq > 0; })
    .sort(function (a, b) { return b.esp - a.esp; });
}

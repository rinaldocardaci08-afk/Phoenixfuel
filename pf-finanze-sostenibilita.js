// ═══════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Sostenibilità Finanziaria operativa (Patch v20260503b)
// ═══════════════════════════════════════════════════════════════════════════
// Sub-tab "📊 Sostenibilità" dentro Finanze.
// REWRITE COMPLETO: da vista cumulativa 13 settimane a vista operativa
// settimanale con orizzonte 8 settimane (~2 mesi, copre ciclo Q8 45gg).
//
// Layout:
//   1. Header con cash netto + dispFidi + capacità totale
//   2. 4 semafori in alto (blocchi: Sett 1-2 / 3-4 / 5-6 / 7-8)
//   3. Calendario settimanale (7 giorni) con frecce ◀▶ Sett +/- 1
//   4. Dettaglio giorno selezionato: lista flussi previsti
//   5. Grafico barre giornaliero del giorno+settimana
//   6. Note implementazione
//
// FIX ricompresi:
//   - bug 2: fatture già anticipate via SBF escluse dalle entrate cliente
//   - bug 4: cliente_rete=true escluso dal suggerimento anticipi
//   - bug 5: cache fatture passata al suggerimento (no doppio fetch)
//   - bug 6: query saldo iniziale parallelizzate
//   - bug 7: saldi limitati ultimi 90 giorni
// ═══════════════════════════════════════════════════════════════════════════


// ────────────────────────────────────────────────────────────────────────
// COSTANTI CONFIGURABILI
// ────────────────────────────────────────────────────────────────────────
var SOSTENIBILITA_SOGLIE = {
  verde:  1.20,
  giallo: 0.95
};

var SOSTENIBILITA_SCARTO_SBF = 0.10;

var SOSTENIBILITA_BLOCCHI = [
  { label: 'Sett. 1-2', settimane: [1, 2] },
  { label: 'Sett. 3-4', settimane: [3, 4] },
  { label: 'Sett. 5-6', settimane: [5, 6] },
  { label: 'Sett. 7-8', settimane: [7, 8] }
];

var SOSTENIBILITA_NUM_SETTIMANE = 8;


// ────────────────────────────────────────────────────────────────────────
// Stato globale
// ────────────────────────────────────────────────────────────────────────
var _sostStato = {
  saldoIniziale: 0,
  dispFidi: 0,
  blocchi: [],
  perSett: [],
  perGiorno: {},
  flussiCache: null,
  settimanaIdx: 1,
  giornoSelezionato: null
};


// ────────────────────────────────────────────────────────────────────────
// Helper formattazione
// ────────────────────────────────────────────────────────────────────────
function _sostFmtImporto(n) {
  return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _sostFmtImpKb(n) {
  var v = Number(n || 0);
  var abs = Math.abs(v);
  if (abs >= 1000) return (v / 1000).toFixed(0) + 'k';
  return v.toFixed(0);
}

function _sostDateToIso(d) {
  return d.toISOString().split('T')[0];
}

function _sostIsoToDate(iso) {
  return new Date(iso + 'T12:00:00');
}

function _sostFmtData(iso) {
  if (!iso) return '—';
  var p = String(iso).substring(0, 10).split('-');
  if (p.length !== 3) return iso;
  return p[2] + '/' + p[1];
}

var _SOST_GIORNI = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
var _SOST_GIORNI_FULL = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
var _SOST_MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];


// ────────────────────────────────────────────────────────────────────────
// Calcolo settimane
// ────────────────────────────────────────────────────────────────────────
function _sostCalcolaSettimane() {
  var settimane = [];
  var oggi = new Date();
  var dow = oggi.getDay();
  var diffLun = dow === 0 ? -6 : 1 - dow;
  var lun = new Date(oggi);
  lun.setDate(oggi.getDate() + diffLun);

  for (var i = 0; i < SOSTENIBILITA_NUM_SETTIMANE; i++) {
    var inizio = new Date(lun);
    inizio.setDate(lun.getDate() + (i * 7));
    var fine = new Date(inizio);
    fine.setDate(inizio.getDate() + 6);
    settimane.push({
      numero: i + 1,
      daISO: _sostDateToIso(inizio),
      aISO: _sostDateToIso(fine),
      lunedi: new Date(inizio)
    });
  }
  return settimane;
}


// ────────────────────────────────────────────────────────────────────────
// Caricamento saldo iniziale (parallelo + 90gg recenti)
// ────────────────────────────────────────────────────────────────────────
async function _sostCaricaSaldoIniziale() {
  var oggi = new Date();
  var unTrimestreFa = new Date(oggi);
  unTrimestreFa.setDate(oggi.getDate() - 90);
  var sogliaIso = _sostDateToIso(unTrimestreFa);

  var [resC, resS, resA] = await Promise.all([
    sb.from('banche_conti').select('id,attivo').eq('attivo', true),
    sb.from('banche_saldi_giornalieri').select('conto_id,saldo_contabile,data').gte('data', sogliaIso).order('data', { ascending: false }),
    sb.from('banche_affidamenti').select('importo_accordato,importo_utilizzato,stato').eq('stato', 'attivo')
  ]);

  if (resC.error || resS.error || resA.error) {
    console.warn('[sost] errore carico saldi:', resC.error || resS.error || resA.error);
  }

  var contiAttivi = {};
  (resC.data || []).forEach(function(c) { contiAttivi[c.id] = true; });

  var ultimoPerConto = {};
  (resS.data || []).forEach(function(r) {
    if (!ultimoPerConto[r.conto_id] && contiAttivi[r.conto_id]) {
      ultimoPerConto[r.conto_id] = Number(r.saldo_contabile || 0);
    }
  });
  var cashNetto = 0;
  Object.keys(ultimoPerConto).forEach(function(k) { cashNetto += ultimoPerConto[k]; });

  var dispFidi = 0;
  (resA.data || []).forEach(function(a) {
    var residuo = Number(a.importo_accordato || 0) - Number(a.importo_utilizzato || 0);
    if (residuo > 0) dispFidi += residuo;
  });

  return { cashNetto: cashNetto, dispFidi: dispFidi };
}


// ────────────────────────────────────────────────────────────────────────
// Caricamento flussi (con esclusione fatture già anticipate)
// ────────────────────────────────────────────────────────────────────────
async function _sostCaricaFlussi(daISO, aISO) {
  var [fattRes, ordRes, mutRes, sbfRes, sbfFatturaIds] = await Promise.all([
    sb.from('estratto_conto_cliente').select('fattura_id,cliente_id,cessionario_denominazione,numero,anno,data,importo_totale,saldo_residuo,stato_pagamento').gt('saldo_residuo', 0.01),
    sb.from('ordini').select('id,data,fornitore,litri,costo_litro,trasporto_litro,iva,giorni_pagamento,pagato_fornitore,prodotto').eq('tipo_ordine', 'entrata_deposito').eq('pagato_fornitore', false),
    sb.from('banche_finanziamenti_rate').select('id,finanziamento_id,data_scadenza,rata').gte('data_scadenza', daISO).lte('data_scadenza', aISO),
    // Patch v20260503l: la colonna in anticipi_sbf_fatture si chiama "fattura_id" (NON fattura_emessa_id)
    sb.from('anticipi_sbf_fatture').select('id,fattura_id,scadenza_banca,importo_anticipato_calcolato,importo_estinto,stato').eq('stato', 'anticipata').gte('scadenza_banca', daISO).lte('scadenza_banca', aISO),
    sb.from('anticipi_sbf_fatture').select('fattura_id,stato').eq('stato', 'anticipata')
  ]);

  var fattureGiaAnticipate = {};
  (sbfFatturaIds.data || []).forEach(function(f) {
    if (f.fattura_id) fattureGiaAnticipate[f.fattura_id] = true;
  });

  var fatture = (fattRes.data || []).filter(function(f) {
    return !fattureGiaAnticipate[f.fattura_id];
  });

  return {
    fatture: fatture,
    ordini: ordRes.data || [],
    mutui: mutRes.data || [],
    sbfRientri: sbfRes.data || [],
    fattureAnticipateCount: Object.keys(fattureGiaAnticipate).length
  };
}


function _sostScadenzaOrdine(o) {
  var dt = new Date(o.data + 'T12:00:00');
  dt.setDate(dt.getDate() + Number(o.giorni_pagamento || 30));
  return _sostDateToIso(dt);
}

function _sostImportoOrdine(o) {
  var litri = Number(o.litri || 0);
  var costoUnit = Number(o.costo_litro || 0) + Number(o.trasporto_litro || 0);
  var imponibile = litri * costoUnit;
  return imponibile * (1 + (Number(o.iva || 22)) / 100);
}

function _sostScadenzaFattura(f) {
  var dt = new Date((f.data || _sostDateToIso(new Date())) + 'T12:00:00');
  dt.setDate(dt.getDate() + 60);
  return _sostDateToIso(dt);
}


// ────────────────────────────────────────────────────────────────────────
// Aggregazione per giorno + settimana + blocco
// ────────────────────────────────────────────────────────────────────────
function _sostAggrega(settimane, flussi, saldoIniziale) {
  var perGiorno = {};

  function addEntrata(iso, item) {
    if (!perGiorno[iso]) perGiorno[iso] = { entrate: [], uscite: [], totEnt: 0, totUsc: 0 };
    perGiorno[iso].entrate.push(item);
    perGiorno[iso].totEnt += item.importo;
  }
  function addUscita(iso, item) {
    if (!perGiorno[iso]) perGiorno[iso] = { entrate: [], uscite: [], totEnt: 0, totUsc: 0 };
    perGiorno[iso].uscite.push(item);
    perGiorno[iso].totUsc += item.importo;
  }

  var daISO = settimane[0].daISO;
  var aISO = settimane[settimane.length - 1].aISO;

  flussi.fatture.forEach(function(f) {
    var scad = _sostScadenzaFattura(f);
    if (scad >= daISO && scad <= aISO) {
      addEntrata(scad, {
        tipo: 'fattura_cliente',
        importo: Number(f.saldo_residuo || 0),
        descrizione: 'Ft. ' + (f.numero || '?') + '/' + (f.anno || '?') + ' — ' + (f.cessionario_denominazione || '—').substring(0, 40),
        riferimento: f.fattura_id
      });
    }
  });

  flussi.ordini.forEach(function(o) {
    var scad = _sostScadenzaOrdine(o);
    if (scad >= daISO && scad <= aISO) {
      addUscita(scad, {
        tipo: 'ordine_fornitore',
        importo: _sostImportoOrdine(o),
        descrizione: 'Pag. ' + (o.fornitore || '—').substring(0, 40) + ' — ' + (o.prodotto || '') + ' ' + Number(o.litri || 0).toLocaleString('it-IT') + ' L',
        riferimento: o.id
      });
    }
  });

  flussi.mutui.forEach(function(r) {
    if (r.data_scadenza >= daISO && r.data_scadenza <= aISO) {
      addUscita(r.data_scadenza, {
        tipo: 'rata_mutuo',
        importo: Number(r.rata || 0),
        descrizione: 'Rata mutuo',
        riferimento: r.id
      });
    }
  });

  flussi.sbfRientri.forEach(function(sbf) {
    if (sbf.scadenza_banca >= daISO && sbf.scadenza_banca <= aISO) {
      var imp = Number(sbf.importo_anticipato_calcolato || 0) - Number(sbf.importo_estinto || 0);
      if (imp > 0) {
        addUscita(sbf.scadenza_banca, {
          tipo: 'rientro_sbf',
          importo: imp,
          descrizione: 'Rientro SBF banca',
          riferimento: sbf.id
        });
      }
    }
  });

  // Aggrego per settimana
  var perSett = settimane.map(function(s) {
    var entrate = 0, uscite = 0;
    var d = new Date(s.lunedi);
    var giorniSett = [];
    for (var i = 0; i < 7; i++) {
      var iso = _sostDateToIso(d);
      var dati = perGiorno[iso] || { entrate: [], uscite: [], totEnt: 0, totUsc: 0 };
      entrate += dati.totEnt;
      uscite += dati.totUsc;
      giorniSett.push({ iso: iso, dow: d.getDay(), giorno: d.getDate(), dati: dati });
      d.setDate(d.getDate() + 1);
    }
    return {
      numero: s.numero,
      daISO: s.daISO,
      aISO: s.aISO,
      entrate: entrate,
      uscite: uscite,
      saldoNetto: entrate - uscite,
      giorni: giorniSett
    };
  });

  var cumulato = saldoIniziale;
  perSett.forEach(function(s) {
    s.saldoInizio = cumulato;
    cumulato += s.saldoNetto;
    s.saldoFine = cumulato;
  });

  var blocchi = SOSTENIBILITA_BLOCCHI.map(function(b) {
    var settBlocco = perSett.filter(function(s) { return b.settimane.indexOf(s.numero) >= 0; });
    var entr = settBlocco.reduce(function(s, x) { return s + x.entrate; }, 0);
    var usc = settBlocco.reduce(function(s, x) { return s + x.uscite; }, 0);
    var saldoInizioBlocco = settBlocco.length ? settBlocco[0].saldoInizio : saldoIniziale;
    var saldoFineBlocco = settBlocco.length ? settBlocco[settBlocco.length - 1].saldoFine : saldoIniziale;
    var saldoNettoBlocco = entr - usc;

    var indice = usc > 0 ? (saldoInizioBlocco + entr) / usc : 999;

    var semaforo;
    if (indice < SOSTENIBILITA_SOGLIE.giallo) semaforo = 'rosso';
    else if (saldoNettoBlocco < 0 || indice < SOSTENIBILITA_SOGLIE.verde) semaforo = 'giallo';
    else semaforo = 'verde';

    return {
      label: b.label,
      daISO: settBlocco.length ? settBlocco[0].daISO : null,
      aISO: settBlocco.length ? settBlocco[settBlocco.length - 1].aISO : null,
      entrate: entr, uscite: usc,
      saldoNetto: saldoNettoBlocco,
      saldoInizio: saldoInizioBlocco, saldoFine: saldoFineBlocco,
      indice: indice, semaforo: semaforo
    };
  });

  return { perGiorno: perGiorno, perSett: perSett, blocchi: blocchi };
}


// ────────────────────────────────────────────────────────────────────────
// Suggerimento anticipi (con filtro cliente_rete)
// ────────────────────────────────────────────────────────────────────────
async function _sostSuggerisciAnticipi(deficit, fattureCache) {
  if (deficit <= 0) return null;

  var clientIds = {};
  fattureCache.forEach(function(f) { if (f.cliente_id) clientIds[f.cliente_id] = true; });
  var idsArr = Object.keys(clientIds);

  var clientiRete = {};
  if (idsArr.length > 0) {
    var resCli = await sb.from('clienti').select('id,cliente_rete').in('id', idsArr);
    (resCli.data || []).forEach(function(c) {
      if (c.cliente_rete === true) clientiRete[c.id] = true;
    });
  }

  var fatture = fattureCache
    .filter(function(f) {
      return f.stato_pagamento === 'aperta'
          && Number(f.saldo_residuo || 0) > 0
          && !clientiRete[f.cliente_id];
    })
    .sort(function(a, b) { return Number(b.saldo_residuo) - Number(a.saldo_residuo); })
    .slice(0, 50);

  var selezione = [];
  var lordo = 0, netto = 0;
  for (var i = 0; i < fatture.length; i++) {
    var f = fatture[i];
    var nuovoLordo = lordo + Number(f.saldo_residuo);
    var nuovoNetto = nuovoLordo * (1 - SOSTENIBILITA_SCARTO_SBF);
    selezione.push(f);
    lordo = nuovoLordo;
    netto = nuovoNetto;
    if (nuovoNetto >= deficit) break;
  }

  return {
    selezione: selezione,
    lordo: lordo,
    netto: netto,
    coperturaCompleta: netto >= deficit,
    deficit: deficit
  };
}


// ────────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────────
async function caricaSostenibilita() {
  var el = document.getElementById('sost-content');
  if (!el) return;
  el.innerHTML = '<div class="loading" style="padding:20px;font-size:12px">Caricamento sostenibilità...</div>';

  var settimane = _sostCalcolaSettimane();
  var daISO = settimane[0].daISO;
  var aISO = settimane[settimane.length - 1].aISO;

  var [saldoData, flussi] = await Promise.all([
    _sostCaricaSaldoIniziale(),
    _sostCaricaFlussi(daISO, aISO)
  ]);

  var saldoIniziale = saldoData.cashNetto;
  var dispFidi = saldoData.dispFidi;
  var agg = _sostAggrega(settimane, flussi, saldoIniziale);

  _sostStato.saldoIniziale = saldoIniziale;
  _sostStato.dispFidi = dispFidi;
  _sostStato.blocchi = agg.blocchi;
  _sostStato.perSett = agg.perSett;
  _sostStato.perGiorno = agg.perGiorno;
  _sostStato.flussiCache = flussi;

  if (!_sostStato.settimanaIdx || _sostStato.settimanaIdx < 1 || _sostStato.settimanaIdx > 8) {
    _sostStato.settimanaIdx = 1;
  }
  if (!_sostStato.giornoSelezionato) {
    _sostStato.giornoSelezionato = _sostDateToIso(new Date());
  }

  var blocchiCritici = agg.blocchi.filter(function(b) { return b.semaforo === 'rosso'; });
  var deficitMassimo = 0;
  blocchiCritici.forEach(function(b) {
    var def = b.uscite - (b.saldoInizio + b.entrate);
    if (def > deficitMassimo) deficitMassimo = def;
  });

  var html = '';
  html += _sostRenderHeader(saldoIniziale, dispFidi, agg.blocchi);
  html += _sostRenderSemafori(agg.blocchi);

  if (deficitMassimo > 0) {
    var sugg = await _sostSuggerisciAnticipi(deficitMassimo, flussi.fatture);
    html += _sostRenderSuggerimento(sugg, blocchiCritici[0]);
  }

  html += _sostRenderSezioneCalendario();
  html += _sostRenderNoteImpl(flussi.fattureAnticipateCount);

  el.innerHTML = html;
}


// ────────────────────────────────────────────────────────────────────────
// Render: Header
// ────────────────────────────────────────────────────────────────────────
function _sostRenderHeader(saldoIniziale, dispFidi, blocchi) {
  var ultimo = blocchi.length ? blocchi[blocchi.length - 1].saldoFine : saldoIniziale;
  var capTot = saldoIniziale + dispFidi;

  var html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:14px">';
  html += '<div style="flex:1;min-width:280px">';
  html += '<div style="font-size:15px;font-weight:500;color:var(--text)">📊 Sostenibilità finanziaria operativa — 8 settimane</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">';
  html += 'Cash netto conti: <strong style="font-family:var(--font-mono);color:' + (saldoIniziale >= 0 ? '#173404' : '#501313') + '">' + _sostFmtImporto(saldoIniziale) + ' €</strong>';
  html += ' · Previsto a 8 sett: <strong style="font-family:var(--font-mono);color:' + (ultimo >= 0 ? '#173404' : '#501313') + '">' + _sostFmtImporto(ultimo) + ' €</strong>';
  html += '</div>';
  if (dispFidi > 0) {
    html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">';
    html += 'Disponibile su affidamenti: <strong style="font-family:var(--font-mono);color:#0C447C">' + _sostFmtImporto(dispFidi) + ' €</strong>';
    html += ' · Capacità operativa totale: <strong style="font-family:var(--font-mono);color:' + (capTot >= 0 ? '#173404' : '#501313') + '">' + _sostFmtImporto(capTot) + ' €</strong>';
    html += '</div>';
  }
  html += '</div>';
  html += '<button onclick="caricaSostenibilita()" style="font-size:11px;padding:6px 12px;background:var(--bg);border:0.5px solid var(--border);border-radius:4px;cursor:pointer;align-self:flex-start">🔄 Aggiorna</button>';
  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render: 4 semafori compatti
// ────────────────────────────────────────────────────────────────────────
function _sostRenderSemafori(blocchi) {
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:18px">';
  blocchi.forEach(function(b, idx) {
    var col;
    if (b.semaforo === 'verde') col = { bg: '#EAF3DE', border: '#639922', text: '#173404', label: 'VERDE', pallino: '#639922' };
    else if (b.semaforo === 'giallo') col = { bg: '#FAEEDA', border: '#BA7517', text: '#412402', label: 'GIALLO', pallino: '#BA7517' };
    else col = { bg: '#FCEBEB', border: '#A32D2D', text: '#501313', label: 'ROSSO', pallino: '#A32D2D' };

    var indiceLabel = b.indice >= 99 ? '∞' : b.indice.toFixed(2);
    var icona = b.semaforo === 'verde' ? '✓' : b.semaforo === 'giallo' ? '⚠' : '✗';
    var primaSett = SOSTENIBILITA_BLOCCHI[idx].settimane[0];

    html += '<div onclick="_sostVaiAllaSettimana(' + primaSett + ')" title="Click per andare alla settimana ' + primaSett + '" style="background:' + col.bg + ';border:0.5px solid ' + col.border + ';border-radius:6px;padding:10px;cursor:pointer;transition:transform 0.1s" onmouseover="this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.transform=\'\'">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
    html += '<div style="font-size:10px;text-transform:uppercase;color:' + col.text + ';letter-spacing:0.4px;font-weight:600">' + esc(b.label) + '</div>';
    html += '<span style="width:8px;height:8px;border-radius:50%;background:' + col.pallino + ';display:inline-block"></span>';
    html += '</div>';
    html += '<div style="font-size:10px;color:' + col.text + ';margin-bottom:4px">' + _sostFmtData(b.daISO) + ' - ' + _sostFmtData(b.aISO) + '</div>';
    var sn = b.saldoNetto;
    html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:500;color:' + col.text + '">' + (sn >= 0 ? '+ ' : '− ') + _sostFmtImporto(Math.abs(sn)) + '</div>';
    html += '<div style="font-size:9px;color:' + col.text + ';margin-top:2px">Idx ' + indiceLabel + ' ' + icona + ' · E ' + _sostFmtImpKb(b.entrate) + ' · U ' + _sostFmtImpKb(b.uscite) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render: suggerimento anticipi
// ────────────────────────────────────────────────────────────────────────
function _sostRenderSuggerimento(sugg, bloccoCritico) {
  if (!sugg || !bloccoCritico) return '';
  var html = '<div style="background:#FCEBEB;border-left:4px solid #A32D2D;border-radius:0 6px 6px 0;padding:14px 16px;margin-bottom:14px">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
  html += '<div style="font-size:18px">⚠️</div>';
  html += '<div style="font-size:13px;font-weight:600;color:#501313">Periodo critico: ' + esc(bloccoCritico.label) + ' (' + _sostFmtData(bloccoCritico.daISO) + ' - ' + _sostFmtData(bloccoCritico.aISO) + ')</div>';
  html += '</div>';
  html += '<div style="font-size:11px;color:#501313;line-height:1.5;margin-bottom:10px">Deficit previsto: <strong>' + _sostFmtImporto(sugg.deficit) + ' €</strong>.</div>';

  if (sugg.selezione.length === 0) {
    html += '<div style="background:white;border-radius:4px;padding:10px 12px;font-size:11px;color:var(--text-muted);font-style:italic">Nessuna fattura aperta disponibile per anticipo (escluse fatture cliente_rete e già anticipate).</div>';
  } else {
    html += '<div style="background:white;border-radius:4px;padding:10px 12px">';
    html += '<div style="font-size:11px;color:#501313;margin-bottom:6px;font-weight:600">💡 Suggerimento anticipo SBF</div>';
    html += '<div style="font-size:11px;color:#501313;line-height:1.6">';
    html += 'Anticipa <strong>' + sugg.selezione.length + ' fattur' + (sugg.selezione.length > 1 ? 'e' : 'a') + '</strong> ';
    html += '(lordo <strong>' + _sostFmtImporto(sugg.lordo) + ' €</strong>, netto stimato <strong>' + _sostFmtImporto(sugg.netto) + ' €</strong>):';
    html += '</div>';
    html += '<ul style="font-size:11px;color:#501313;margin:6px 0 0 18px;padding:0">';
    sugg.selezione.slice(0, 5).forEach(function(f) {
      html += '<li>F.' + esc(String(f.numero || '')) + '/' + esc(String(f.anno || '')) + ' ' + esc((f.cessionario_denominazione || '').substring(0, 40)) + ' — ' + _sostFmtImporto(f.saldo_residuo) + ' €</li>';
    });
    if (sugg.selezione.length > 5) html += '<li>... + altre ' + (sugg.selezione.length - 5) + '</li>';
    html += '</ul>';
    html += '<div style="font-size:10px;color:' + (sugg.coperturaCompleta ? '#27500A' : '#A32D2D') + ';margin-top:8px;font-style:italic">';
    if (sugg.coperturaCompleta) html += '✓ Copertura completa del deficit';
    else html += '⚠ Copertura parziale: ' + _sostFmtImporto(sugg.netto) + ' € su ' + _sostFmtImporto(sugg.deficit) + ' €';
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render: SEZIONE CALENDARIO OPERATIVO
// ────────────────────────────────────────────────────────────────────────
function _sostRenderSezioneCalendario() {
  var idx = _sostStato.settimanaIdx;
  var sett = _sostStato.perSett[idx - 1];
  if (!sett) return '<div style="padding:14px;color:var(--text-muted);font-style:italic">Settimana non disponibile</div>';

  var html = '<div style="border-top:0.5px solid var(--border);padding-top:14px;margin-top:8px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">';
  html += '<div>';
  html += '<div style="font-size:14px;font-weight:500;color:var(--text)">📅 Settimana ' + idx + ' di 8</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + _sostFmtData(sett.daISO) + ' - ' + _sostFmtData(sett.aISO) + ' · Saldo inizio ' + _sostFmtImporto(sett.saldoInizio) + ' € → fine ' + _sostFmtImporto(sett.saldoFine) + ' €</div>';
  html += '</div>';
  html += '<div style="display:flex;gap:6px;align-items:center">';
  html += '<button ' + (idx <= 1 ? 'disabled' : '') + ' onclick="_sostNavigaSett(-1)" style="font-size:14px;padding:4px 10px;background:var(--bg);border:0.5px solid var(--border);border-radius:4px;cursor:' + (idx <= 1 ? 'not-allowed' : 'pointer') + ';opacity:' + (idx <= 1 ? '0.4' : '1') + '">◀</button>';
  html += '<span style="font-size:11px;color:var(--text-muted);min-width:60px;text-align:center">Sett. ' + idx + '/8</span>';
  html += '<button ' + (idx >= 8 ? 'disabled' : '') + ' onclick="_sostNavigaSett(1)" style="font-size:14px;padding:4px 10px;background:var(--bg);border:0.5px solid var(--border);border-radius:4px;cursor:' + (idx >= 8 ? 'not-allowed' : 'pointer') + ';opacity:' + (idx >= 8 ? '0.4' : '1') + '">▶</button>';
  html += '</div>';
  html += '</div>';

  html += _sostRenderKpiSettimana(sett);
  html += _sostRenderCalendarioSett(sett);
  html += _sostRenderBarreSett(sett);
  html += _sostRenderDettaglioGiorno(sett);

  html += '</div>';
  return html;
}


function _sostRenderKpiSettimana(sett) {
  var saldoSett = sett.saldoNetto;
  var saldoBg = saldoSett >= 0 ? '#FAEEDA' : '#FCEBEB';
  var saldoBorder = saldoSett >= 0 ? '#BA7517' : '#A32D2D';
  var saldoColor = saldoSett >= 0 ? '#173404' : '#501313';
  var saldoLabel = saldoSett >= 0 ? '#412402' : '#791F1F';

  var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">';
  html += '<div style="background:#EAF3DE;padding:8px 10px;border-radius:6px;border-left:3px solid #639922">';
  html += '<div style="font-size:9px;text-transform:uppercase;color:#27500A;letter-spacing:0.4px;font-weight:500">Entrate previste</div>';
  html += '<div style="font-family:var(--font-mono);font-size:15px;font-weight:500;color:#173404">+ ' + _sostFmtImporto(sett.entrate) + '</div></div>';

  html += '<div style="background:#FCEBEB;padding:8px 10px;border-radius:6px;border-left:3px solid #A32D2D">';
  html += '<div style="font-size:9px;text-transform:uppercase;color:#791F1F;letter-spacing:0.4px;font-weight:500">Uscite previste</div>';
  html += '<div style="font-family:var(--font-mono);font-size:15px;font-weight:500;color:#501313">− ' + _sostFmtImporto(sett.uscite) + '</div></div>';

  html += '<div style="background:' + saldoBg + ';padding:8px 10px;border-radius:6px;border-left:3px solid ' + saldoBorder + '">';
  html += '<div style="font-size:9px;text-transform:uppercase;color:' + saldoLabel + ';letter-spacing:0.4px;font-weight:500">Saldo netto sett.</div>';
  html += '<div style="font-family:var(--font-mono);font-size:15px;font-weight:500;color:' + saldoColor + '">' + (saldoSett >= 0 ? '+ ' : '− ') + _sostFmtImporto(Math.abs(saldoSett)) + '</div></div>';
  html += '</div>';
  return html;
}


function _sostRenderCalendarioSett(sett) {
  var oggiIso = _sostDateToIso(new Date());
  var html = '<div class="pf-scroll-x"><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:12px">';
  sett.giorni.forEach(function(g) {
    var dati = g.dati;
    var isOggi = g.iso === oggiIso;
    var isSelez = g.iso === _sostStato.giornoSelezionato;
    var isWeekend = g.dow === 0 || g.dow === 6;

    var bg, border, color;
    if (isSelez) { bg = '#BFDFF7'; border = '2px solid #185FA5'; color = '#0C447C'; }
    else if (isOggi) { bg = '#EAF3DE'; border = '1.5px solid #639922'; color = '#173404'; }
    else if (isWeekend) { bg = '#F5F1E8'; border = '0.5px solid var(--border)'; color = 'var(--text-muted)'; }
    else { bg = 'var(--bg)'; border = '0.5px solid var(--border)'; color = 'var(--text)'; }

    html += '<div onclick="_sostSelezionaGiorno(\'' + g.iso + '\')" style="background:' + bg + ';border:' + border + ';border-radius:6px;padding:8px 6px;cursor:pointer;min-height:78px;color:' + color + '">';
    html += '<div style="font-size:11px;font-weight:500;margin-bottom:4px">' + _SOST_GIORNI[g.dow] + ' ' + g.giorno + '</div>';
    if (dati.totEnt > 0) html += '<div style="font-size:10px;color:#173404;font-family:var(--font-mono)">+ ' + _sostFmtImpKb(dati.totEnt) + '</div>';
    if (dati.totUsc > 0) html += '<div style="font-size:10px;color:#501313;font-family:var(--font-mono)">− ' + _sostFmtImpKb(dati.totUsc) + '</div>';
    if (dati.totEnt === 0 && dati.totUsc === 0) html += '<div style="font-size:10px;color:var(--text-muted);font-style:italic">—</div>';
    html += '</div>';
  });
  html += '</div></div>';   // chiude griglia + contenitore scorrevole
  return html;
}


function _sostRenderBarreSett(sett) {
  var maxVal = 0;
  sett.giorni.forEach(function(g) {
    if (g.dati.totEnt > maxVal) maxVal = g.dati.totEnt;
    if (g.dati.totUsc > maxVal) maxVal = g.dati.totUsc;
  });
  if (maxVal <= 0) maxVal = 1;

  var w = 600, h = 70;
  var slotW = w / 7;
  var barreW = Math.min(slotW * 0.4, 32);
  var spacingX = (slotW - barreW) / 2;
  var middleY = h / 2;
  var maxBarH = (h / 2) - 4;

  var svg = '<div style="background:var(--bg);padding:8px 10px;border-radius:6px;margin-bottom:12px">';
  svg += '<div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.4px;font-weight:500;margin-bottom:6px">Andamento giornaliero settimana</div>';
  svg += '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:60px">';
  svg += '<line x1="0" y1="' + middleY + '" x2="' + w + '" y2="' + middleY + '" stroke="rgba(0,0,0,0.15)" stroke-width="0.5" stroke-dasharray="2,2"/>';

  sett.giorni.forEach(function(g, idx) {
    var x = idx * slotW + spacingX;
    var heEnt = (g.dati.totEnt / maxVal) * maxBarH;
    var heUsc = (g.dati.totUsc / maxVal) * maxBarH;
    if (heEnt > 0) {
      svg += '<rect x="' + x.toFixed(1) + '" y="' + (middleY - heEnt).toFixed(1) + '" width="' + barreW.toFixed(1) + '" height="' + heEnt.toFixed(1) + '" fill="#639922" rx="2" style="cursor:pointer" onclick="_sostSelezionaGiorno(\'' + g.iso + '\')"><title>' + _SOST_GIORNI[g.dow] + ' ' + g.giorno + ' — Entrate: + ' + _sostFmtImporto(g.dati.totEnt) + '</title></rect>';
    }
    if (heUsc > 0) {
      svg += '<rect x="' + x.toFixed(1) + '" y="' + middleY + '" width="' + barreW.toFixed(1) + '" height="' + heUsc.toFixed(1) + '" fill="#A32D2D" rx="2" style="cursor:pointer" onclick="_sostSelezionaGiorno(\'' + g.iso + '\')"><title>' + _SOST_GIORNI[g.dow] + ' ' + g.giorno + ' — Uscite: − ' + _sostFmtImporto(g.dati.totUsc) + '</title></rect>';
    }
  });
  svg += '</svg>';

  svg += '<div class="pf-scroll-x"><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;font-size:9px;color:var(--text-muted);margin-top:2px;text-align:center">';
  sett.giorni.forEach(function(g) {
    svg += '<span>' + _SOST_GIORNI[g.dow] + '</span>';
  });
  svg += '</div></div>';   // chiude riga giorni + contenitore scorrevole
  svg += '</div>';
  return svg;
}


function _sostRenderDettaglioGiorno(sett) {
  var iso = _sostStato.giornoSelezionato;
  var giorno = sett.giorni.find(function(g) { return g.iso === iso; });
  if (!giorno) {
    giorno = sett.giorni[0];
    _sostStato.giornoSelezionato = giorno.iso;
  }
  var dati = giorno.dati;
  var d = _sostIsoToDate(giorno.iso);
  var labelGiorno = _SOST_GIORNI_FULL[d.getDay()] + ' ' + d.getDate() + ' ' + _SOST_MESI[d.getMonth()] + ' ' + d.getFullYear();
  var saldo = dati.totEnt - dati.totUsc;

  var html = '<div style="border-top:0.5px solid var(--border);padding-top:12px">';
  html += '<div style="font-size:13px;font-weight:500;color:var(--text);margin-bottom:8px">' + esc(labelGiorno) + '</div>';

  if (dati.entrate.length === 0 && dati.uscite.length === 0) {
    html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;padding:14px 0;text-align:center">Nessun flusso previsto in questo giorno</div>';
    html += '</div>';
    return html;
  }

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';

  html += '<div>';
  html += '<div style="font-size:10px;text-transform:uppercase;color:#27500A;font-weight:600;letter-spacing:0.4px;padding:0 4px;margin-bottom:6px">▼ Entrate previste</div>';
  if (dati.entrate.length === 0) {
    html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;padding:6px 12px">—</div>';
  } else {
    dati.entrate.forEach(function(item) { html += _sostRenderRigaFlusso(item, 'entrata'); });
  }
  html += '<div style="background:#F1EFE8;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;display:flex;justify-content:space-between;margin-top:6px">';
  html += '<span>Totale</span><span style="font-family:var(--font-mono);color:#173404">+ ' + _sostFmtImporto(dati.totEnt) + '</span></div>';
  html += '</div>';

  html += '<div>';
  html += '<div style="font-size:10px;text-transform:uppercase;color:#791F1F;font-weight:600;letter-spacing:0.4px;padding:0 4px;margin-bottom:6px">▼ Uscite previste</div>';
  if (dati.uscite.length === 0) {
    html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;padding:6px 12px">—</div>';
  } else {
    dati.uscite.forEach(function(item) { html += _sostRenderRigaFlusso(item, 'uscita'); });
  }
  html += '<div style="background:#F1EFE8;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;display:flex;justify-content:space-between;margin-top:6px">';
  html += '<span>Totale</span><span style="font-family:var(--font-mono);color:#501313">− ' + _sostFmtImporto(dati.totUsc) + '</span></div>';
  html += '</div>';

  html += '</div>';

  html += '<div style="background:' + (saldo >= 0 ? '#FAEEDA' : '#FCEBEB') + ';border:1px solid ' + (saldo >= 0 ? '#BA7517' : '#A32D2D') + ';border-radius:6px;padding:10px 14px;margin-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:12px">';
  html += '<span style="color:' + (saldo >= 0 ? '#633806' : '#791F1F') + ';font-weight:500">Saldo netto giornata</span>';
  html += '<span style="font-family:var(--font-mono);font-size:14px;font-weight:600;color:' + (saldo >= 0 ? '#173404' : '#501313') + '">' + (saldo >= 0 ? '+ ' : '− ') + _sostFmtImporto(Math.abs(saldo)) + ' €</span>';
  html += '</div>';

  html += '</div>';
  return html;
}


function _sostRenderRigaFlusso(item, tipo) {
  var bg, borderL, amountColor;
  if (tipo === 'entrata') {
    bg = '#EAF3DE'; borderL = '#639922'; amountColor = '#173404';
  } else if (item.tipo === 'rientro_sbf') {
    bg = '#E6F1FB'; borderL = '#185FA5'; amountColor = '#0C447C';
  } else {
    bg = '#FCEBEB'; borderL = '#A32D2D'; amountColor = '#501313';
  }
  var sign = tipo === 'entrata' ? '+ ' : '− ';

  var tagTipo = '';
  if (item.tipo === 'fattura_cliente') tagTipo = '<span style="background:rgba(0,0,0,0.05);color:var(--text-muted);font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px">cliente</span>';
  else if (item.tipo === 'ordine_fornitore') tagTipo = '<span style="background:rgba(0,0,0,0.05);color:var(--text-muted);font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px">fornitore</span>';
  else if (item.tipo === 'rata_mutuo') tagTipo = '<span style="background:rgba(0,0,0,0.05);color:var(--text-muted);font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px">mutuo</span>';
  else if (item.tipo === 'rientro_sbf') tagTipo = '<span style="background:#BFDFF7;color:#0C447C;font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px;font-weight:600">SBF</span>';

  var html = '<div style="background:' + bg + ';border-left:3px solid ' + borderL + ';border-radius:0 6px 6px 0;padding:7px 10px;font-size:11px;margin-bottom:5px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">';
  html += '<div style="flex:1">' + esc(item.descrizione) + tagTipo + '</div>';
  html += '<div style="font-family:var(--font-mono);font-weight:500;color:' + amountColor + '">' + sign + _sostFmtImporto(item.importo) + '</div>';
  html += '</div></div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Navigazione
// ────────────────────────────────────────────────────────────────────────
function _sostNavigaSett(direzione) {
  var nuovo = _sostStato.settimanaIdx + direzione;
  if (nuovo < 1 || nuovo > SOSTENIBILITA_NUM_SETTIMANE) return;
  _sostStato.settimanaIdx = nuovo;
  var sett = _sostStato.perSett[nuovo - 1];
  if (sett && sett.giorni.length) {
    _sostStato.giornoSelezionato = sett.giorni[0].iso;
  }
  _sostRiRender();
}

function _sostVaiAllaSettimana(numSett) {
  if (numSett < 1 || numSett > SOSTENIBILITA_NUM_SETTIMANE) return;
  _sostStato.settimanaIdx = numSett;
  var sett = _sostStato.perSett[numSett - 1];
  if (sett && sett.giorni.length) {
    _sostStato.giornoSelezionato = sett.giorni[0].iso;
  }
  _sostRiRender();
}

function _sostSelezionaGiorno(iso) {
  _sostStato.giornoSelezionato = iso;
  _sostRiRender();
}

function _sostRiRender() {
  if (!_sostStato.perSett.length) {
    caricaSostenibilita();
    return;
  }
  var el = document.getElementById('sost-content');
  if (!el) return;

  var html = '';
  html += _sostRenderHeader(_sostStato.saldoIniziale, _sostStato.dispFidi, _sostStato.blocchi);
  html += _sostRenderSemafori(_sostStato.blocchi);

  var blocchiCritici = _sostStato.blocchi.filter(function(b) { return b.semaforo === 'rosso'; });
  if (blocchiCritici.length) {
    var deficitMassimo = 0;
    blocchiCritici.forEach(function(b) {
      var def = b.uscite - (b.saldoInizio + b.entrate);
      if (def > deficitMassimo) deficitMassimo = def;
    });
    _sostSuggerisciAnticipi(deficitMassimo, _sostStato.flussiCache.fatture).then(function(sugg) {
      var box = document.getElementById('sost-sugg-box');
      if (box) box.innerHTML = _sostRenderSuggerimento(sugg, blocchiCritici[0]);
    });
    html += '<div id="sost-sugg-box"></div>';
  }

  html += _sostRenderSezioneCalendario();
  html += _sostRenderNoteImpl(_sostStato.flussiCache ? _sostStato.flussiCache.fattureAnticipateCount : 0);

  el.innerHTML = html;
}


// ────────────────────────────────────────────────────────────────────────
// Note
// ────────────────────────────────────────────────────────────────────────
function _sostRenderNoteImpl(fattureAnticipateCount) {
  var html = '<div style="border-top:0.5px solid var(--border);margin-top:18px;padding-top:12px;font-size:10px;color:var(--text-muted);font-style:italic;line-height:1.6">';
  html += 'ℹ️ <strong>Stima parziale</strong>: spese ricorrenti (stipendi, F24, affitti, bollette) non incluse. Per averle considerate, registrale dal foglio giornale come uscite Modo B. ';
  html += 'Le scadenze fatture clienti sono stimate a +60 giorni dalla data fattura.';
  if (fattureAnticipateCount > 0) {
    html += ' Sono escluse <strong>' + fattureAnticipateCount + ' fatture già anticipate via SBF</strong> (sono già state monetizzate).';
  }
  html += ' Cash netto = somma saldi conti attivi. Disponibile fidi = (accordato − utilizzato) sui fidi attivi.';
  html += '</div>';
  return html;
}

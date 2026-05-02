// ═══════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Sostenibilità Finanziaria (Patch v20260502h)
// ═══════════════════════════════════════════════════════════════════════════
// Sub-tab "📊 Sostenibilità" dentro la sezione Finanze.
// Vista A (semafori in alto) + Vista B (curva saldo previsto in basso).
// Previsionale 13 settimane (standard bancario).
// Algoritmo suggerimento anticipi SBF per coprire periodi deficitari.
//
// NESSUNA scrittura DB: solo aggregazione e visualizzazione di dati esistenti.
// ═══════════════════════════════════════════════════════════════════════════


// ────────────────────────────────────────────────────────────────────────
// COSTANTI CONFIGURABILI (modificare qui per aggiustare soglie)
// ────────────────────────────────────────────────────────────────────────
var SOSTENIBILITA_SOGLIE = {
  verde:  1.20,   // indice >= 1.20 → verde "comodo"
  giallo: 0.95    // 0.95 <= indice < 1.20 → giallo "sotto pressione"
                  // indice < 0.95 → rosso "critico"
};

var SOSTENIBILITA_SCARTO_SBF = 0.10;  // 10% scarto banca tipico per anticipi

var SOSTENIBILITA_BLOCCHI = [
  { label: 'Sett. 1-2',    settimane: [1, 2] },
  { label: 'Sett. 3-6',    settimane: [3, 4, 5, 6] },
  { label: 'Sett. 7-10',   settimane: [7, 8, 9, 10] },
  { label: 'Sett. 11-13',  settimane: [11, 12, 13] }
];


// ────────────────────────────────────────────────────────────────────────
// Stato globale
// ────────────────────────────────────────────────────────────────────────
var _sostStato = {
  saldoIniziale: 0,
  blocchi: [],         // [{label, daISO, aISO, settimane, entrate, uscite, indice, semaforo}]
  serie: [],           // [{settimana, saldoCumulato}] per curva 13 settimane
  fattureAperte: [],   // per algoritmo suggerimento
  deficitMassimo: 0
};


// ────────────────────────────────────────────────────────────────────────
// Helper formattazione (riusa quelli del foglio giornale se disponibili)
// ────────────────────────────────────────────────────────────────────────
function _sostFmtImporto(n) {
  return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _sostFmtImpKb(n) {
  // Versione compatta per la curva: "12k" o "1.5k"
  var v = Number(n || 0);
  var abs = Math.abs(v);
  if (abs >= 1000) return (v / 1000).toFixed(0) + 'k';
  return v.toFixed(0);
}

function _sostDateToIso(d) {
  return d.toISOString().split('T')[0];
}

function _sostFmtData(iso) {
  if (!iso) return '—';
  var p = String(iso).substring(0, 10).split('-');
  if (p.length !== 3) return iso;
  return p[2] + '/' + p[1];
}


// ────────────────────────────────────────────────────────────────────────
// Calcolo settimane: lunedì-domenica, partendo dalla settimana corrente
// ────────────────────────────────────────────────────────────────────────
function _sostCalcola13Settimane() {
  var settimane = [];
  var oggi = new Date();
  // Lunedì della settimana corrente
  var dow = oggi.getDay();
  var diffLun = dow === 0 ? -6 : 1 - dow;
  var lun = new Date(oggi);
  lun.setDate(oggi.getDate() + diffLun);

  for (var i = 0; i < 13; i++) {
    var inizio = new Date(lun);
    inizio.setDate(lun.getDate() + (i * 7));
    var fine = new Date(inizio);
    fine.setDate(inizio.getDate() + 6);
    settimane.push({
      numero: i + 1,
      daISO: _sostDateToIso(inizio),
      aISO: _sostDateToIso(fine)
    });
  }
  return settimane;
}


// ────────────────────────────────────────────────────────────────────────
// Caricamento dati: saldo iniziale + flussi previsti
// ────────────────────────────────────────────────────────────────────────
async function _sostCaricaSaldoIniziale() {
  // Patch v20260502j (opzione C): ritorno oggetto strutturato con
  //   - cashNetto: somma algebrica saldi conti (positivi e negativi)
  //   - dispFidi: capacità residua su affidamenti attivi (accordato - utilizzato)
  //   - dettaglio: array per visualizzazione opzionale
  // Solo "cashNetto" è usato nel calcolo dell'indice (prudente).
  // "dispFidi" è informativo nell'header.

  // 1. Saldi più recenti per conto (solo conti attivi)
  var resC = await sb.from('banche_conti').select('id,attivo,istituto_id').eq('attivo', true);
  var contiAttivi = {};
  (resC.data || []).forEach(function(c) { contiAttivi[c.id] = true; });

  var resS = await sb.from('banche_saldi_giornalieri').select('conto_id,saldo_contabile,data').order('data', { ascending: false });
  if (resS.error) { console.warn('[sost] saldi:', resS.error); return { cashNetto: 0, dispFidi: 0, dettaglio: [] }; }

  var ultimoPerConto = {};
  (resS.data || []).forEach(function(r) {
    if (!ultimoPerConto[r.conto_id] && contiAttivi[r.conto_id]) {
      ultimoPerConto[r.conto_id] = Number(r.saldo_contabile || 0);
    }
  });
  var cashNetto = 0;
  Object.keys(ultimoPerConto).forEach(function(k) { cashNetto += ultimoPerConto[k]; });

  // 2. Disponibilità residua su affidamenti attivi
  var resA = await sb.from('banche_affidamenti').select('importo_accordato,importo_utilizzato,stato').eq('stato', 'attivo');
  var dispFidi = 0;
  (resA.data || []).forEach(function(a) {
    var residuo = Number(a.importo_accordato || 0) - Number(a.importo_utilizzato || 0);
    if (residuo > 0) dispFidi += residuo;
  });

  return { cashNetto: cashNetto, dispFidi: dispFidi, dettaglio: ultimoPerConto };
}


async function _sostCaricaFlussi(daISO, aISO) {
  // Carica in parallelo tutte le fonti di entrata/uscita previste nel periodo
  var [fattRes, ordRes, mutRes, sbfRes] = await Promise.all([
    // 1. Fatture clienti aperte: TUTTE quelle ancora aperte (semplificazione,
    //    senza scadenza precisa il sistema non può sapere quando arriveranno).
    //    Le considero spalmate sui 13 settimane in base a data fattura + 60gg medi.
    sb.from('estratto_conto_cliente').select('fattura_id,data,saldo_residuo,stato_pagamento').gt('saldo_residuo', 0.01),

    // 2. Ordini fornitori non pagati nel periodo (scadenza = data + giorni_pagamento)
    sb.from('ordini').select('id,data,fornitore,litri,costo_litro,trasporto_litro,iva,giorni_pagamento,pagato_fornitore')
      .eq('tipo_ordine', 'entrata_deposito').eq('pagato_fornitore', false),

    // 3. Rate mutui in scadenza nel periodo
    sb.from('banche_finanziamenti_rate').select('finanziamento_id,data_scadenza,rata').gte('data_scadenza', daISO).lte('data_scadenza', aISO),

    // 4. Rientri SBF previsti (fatture anticipate con scadenza_banca nel periodo)
    sb.from('anticipi_sbf_fatture').select('id,scadenza_banca,importo_anticipato_calcolato,importo_estinto,stato')
      .eq('stato', 'anticipata').gte('scadenza_banca', daISO).lte('scadenza_banca', aISO)
  ]);

  return {
    fatture: fattRes.data || [],
    ordini: ordRes.data || [],
    mutui: mutRes.data || [],
    sbfRientri: sbfRes.data || []
  };
}


// Calcola data scadenza prevista per un ordine fornitore
function _sostScadenzaOrdine(o) {
  var dt = new Date(o.data + 'T12:00:00');
  dt.setDate(dt.getDate() + Number(o.giorni_pagamento || 30));
  return _sostDateToIso(dt);
}

// Calcola importo netto fattura passiva (prezzo + trasporto, IVA inclusa)
function _sostImportoOrdine(o) {
  var litri = Number(o.litri || 0);
  var costoUnit = Number(o.costo_litro || 0) + Number(o.trasporto_litro || 0);
  var imponibile = litri * costoUnit;
  return imponibile * (1 + (Number(o.iva || 22)) / 100);
}

// Calcola data scadenza presunta per fattura cliente (data + 60 giorni medi)
function _sostScadenzaFattura(f) {
  var dt = new Date((f.data || _sostDateToIso(new Date())) + 'T12:00:00');
  dt.setDate(dt.getDate() + 60);
  return _sostDateToIso(dt);
}


// ────────────────────────────────────────────────────────────────────────
// Aggregazione settimanale → blocchi per semafori + serie per curva
// ────────────────────────────────────────────────────────────────────────
function _sostAggrega(settimane, flussi, saldoIniziale) {
  // Per ogni settimana calcolo entrate/uscite previste
  var perSett = settimane.map(function(s) {
    var entrate = 0, uscite = 0;
    var dettaglio = { fatture: [], ordini: [], mutui: [], sbfRientri: [] };

    // Entrate: fatture clienti con scadenza prevista nella settimana
    flussi.fatture.forEach(function(f) {
      var scad = _sostScadenzaFattura(f);
      if (scad >= s.daISO && scad <= s.aISO) {
        entrate += Number(f.saldo_residuo || 0);
        dettaglio.fatture.push(f);
      }
    });

    // Uscite: ordini fornitori
    flussi.ordini.forEach(function(o) {
      var scad = _sostScadenzaOrdine(o);
      if (scad >= s.daISO && scad <= s.aISO) {
        uscite += _sostImportoOrdine(o);
        dettaglio.ordini.push(o);
      }
    });

    // Uscite: rate mutui
    flussi.mutui.forEach(function(r) {
      if (r.data_scadenza >= s.daISO && r.data_scadenza <= s.aISO) {
        uscite += Number(r.rata || 0);
        dettaglio.mutui.push(r);
      }
    });

    // Uscite: rientri SBF
    flussi.sbfRientri.forEach(function(sbf) {
      if (sbf.scadenza_banca >= s.daISO && sbf.scadenza_banca <= s.aISO) {
        var imp = Number(sbf.importo_anticipato_calcolato || 0) - Number(sbf.importo_estinto || 0);
        if (imp > 0) {
          uscite += imp;
          dettaglio.sbfRientri.push(sbf);
        }
      }
    });

    return {
      numero: s.numero,
      daISO: s.daISO,
      aISO: s.aISO,
      entrate: entrate,
      uscite: uscite,
      saldoNetto: entrate - uscite,
      dettaglio: dettaglio
    };
  });

  // Calcolo serie cumulata (saldo previsto a fine ogni settimana)
  var serie = [];
  var cumulato = saldoIniziale;
  perSett.forEach(function(s) {
    cumulato += s.saldoNetto;
    serie.push({ numero: s.numero, saldoCumulato: cumulato });
  });

  // Blocchi (raggruppamento settimane secondo SOSTENIBILITA_BLOCCHI)
  var blocchi = SOSTENIBILITA_BLOCCHI.map(function(b) {
    var sett = perSett.filter(function(s) { return b.settimane.indexOf(s.numero) >= 0; });
    var entr = sett.reduce(function(s, x) { return s + x.entrate; }, 0);
    var usc = sett.reduce(function(s, x) { return s + x.uscite; }, 0);

    // Saldo iniziale del blocco = saldo cumulato alla fine della settimana precedente
    var saldoInizioBlocco = saldoIniziale;
    var primaSett = b.settimane[0];
    if (primaSett > 1) {
      var serPrec = serie.find(function(x) { return x.numero === primaSett - 1; });
      if (serPrec) saldoInizioBlocco = serPrec.saldoCumulato;
    }

    var indice = usc > 0 ? (saldoInizioBlocco + entr) / usc : 999;
    var saldoNettoBlocco = entr - usc;

    // Patch v20260502k: regola di sicurezza
    // - Verde solo se saldo netto del blocco >= 0 E indice >= soglia verde
    //   (significa: incassi sufficienti e capacità di pagare uscite)
    // - Giallo se indice tra giallo e verde, OPPURE se saldo netto blocco < 0
    //   anche con indice alto (= "stai bruciando cassa anche se hai riserva")
    // - Rosso se indice sotto soglia giallo (cassa insufficiente)
    var semaforo;
    if (indice < SOSTENIBILITA_SOGLIE.giallo) {
      semaforo = 'rosso';
    } else if (saldoNettoBlocco < 0 || indice < SOSTENIBILITA_SOGLIE.verde) {
      semaforo = 'giallo';
    } else {
      semaforo = 'verde';
    }

    return {
      label: b.label,
      daISO: sett[0] ? sett[0].daISO : null,
      aISO: sett[sett.length - 1] ? sett[sett.length - 1].aISO : null,
      entrate: entr,
      uscite: usc,
      saldoNetto: saldoNettoBlocco,
      indice: indice,
      semaforo: semaforo,
      saldoInizio: saldoInizioBlocco
    };
  });

  return { perSett: perSett, blocchi: blocchi, serie: serie };
}


// ────────────────────────────────────────────────────────────────────────
// Algoritmo suggerimento anticipi (Algoritmo A: importo decrescente)
// ────────────────────────────────────────────────────────────────────────
async function _sostSuggerisciAnticipi(deficit) {
  if (deficit <= 0) return null;
  var fabbisognoLordo = deficit / (1 - SOSTENIBILITA_SCARTO_SBF);

  // Carico fatture aperte ordinate per saldo decrescente
  var res = await sb.from('estratto_conto_cliente')
    .select('fattura_id,cliente_id,cessionario_denominazione,numero,anno,data,importo_totale,saldo_residuo,stato_pagamento')
    .eq('stato_pagamento', 'aperta')
    .order('saldo_residuo', { ascending: false })
    .limit(50);

  var fatture = (res.data || []).filter(function(f) { return Number(f.saldo_residuo || 0) > 0; });

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
// CARICAMENTO E RENDER PRINCIPALE
// ────────────────────────────────────────────────────────────────────────
async function caricaSostenibilita() {
  var el = document.getElementById('sost-content');
  if (!el) return;
  el.innerHTML = '<div class="loading" style="padding:20px;font-size:12px">Caricamento sostenibilità...</div>';

  var settimane = _sostCalcola13Settimane();
  var daISO = settimane[0].daISO;
  var aISO = settimane[12].aISO;

  var saldoInizialeData = await _sostCaricaSaldoIniziale();
  var saldoIniziale = saldoInizialeData.cashNetto;
  var dispFidi = saldoInizialeData.dispFidi;
  var flussi = await _sostCaricaFlussi(daISO, aISO);
  var agg = _sostAggrega(settimane, flussi, saldoIniziale);

  _sostStato.saldoIniziale = saldoIniziale;
  _sostStato.dispFidi = dispFidi;
  _sostStato.blocchi = agg.blocchi;
  _sostStato.serie = agg.serie;
  _sostStato.perSett = agg.perSett;

  // Trovo blocco più critico (per suggerimento anticipi)
  var blocchiCritici = agg.blocchi.filter(function(b) { return b.semaforo === 'rosso'; });
  var deficitMassimo = 0;
  blocchiCritici.forEach(function(b) {
    var def = b.uscite - (b.saldoInizio + b.entrate);
    if (def > deficitMassimo) deficitMassimo = def;
  });
  _sostStato.deficitMassimo = deficitMassimo;

  var html = '';
  html += _sostRenderHeader(saldoIniziale, dispFidi, agg.serie);
  html += _sostRenderSemafori(agg.blocchi);
  if (deficitMassimo > 0) {
    var sugg = await _sostSuggerisciAnticipi(deficitMassimo);
    html += _sostRenderSuggerimento(sugg, blocchiCritici[0]);
  }
  html += _sostRenderCurva(agg.serie, saldoIniziale);
  html += _sostRenderRiepilogo(agg.blocchi);
  html += _sostRenderNoteImpl();

  el.innerHTML = html;
}


// ────────────────────────────────────────────────────────────────────────
// Render: Header
// ────────────────────────────────────────────────────────────────────────
function _sostRenderHeader(saldoIniziale, dispFidi, serie) {
  var ultimo = serie.length ? serie[serie.length - 1].saldoCumulato : saldoIniziale;
  // Capacità totale = cashNetto + dispFidi (capacità operativa reale dell'azienda)
  var capTot = saldoIniziale + dispFidi;
  var capPrevista = ultimo + dispFidi;

  var html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:14px">';
  html += '<div style="flex:1;min-width:280px">';
  html += '<div style="font-size:15px;font-weight:500;color:var(--text)">📊 Sostenibilità finanziaria — 13 settimane</div>';
  // Riga 1: cash netto attuale e previsto
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">';
  html += 'Cash netto conti: <strong style="font-family:var(--font-mono);color:' + (saldoIniziale >= 0 ? '#173404' : '#501313') + '">' + _sostFmtImporto(saldoIniziale) + ' €</strong>';
  html += ' · Previsto a 13 sett: <strong style="font-family:var(--font-mono);color:' + (ultimo >= 0 ? '#173404' : '#501313') + '">' + _sostFmtImporto(ultimo) + ' €</strong>';
  html += '</div>';
  // Riga 2: disponibile fidi + capacità totale
  if (dispFidi > 0) {
    html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">';
    html += 'Disponibile su affidamenti: <strong style="font-family:var(--font-mono);color:#0C447C">' + _sostFmtImporto(dispFidi) + ' €</strong>';
    html += ' · Capacità operativa totale: <strong style="font-family:var(--font-mono);color:' + (capTot >= 0 ? '#173404' : '#501313') + '">' + _sostFmtImporto(capTot) + ' €</strong>';
    html += '</div>';
    html += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px;font-style:italic">L\'indice di sostenibilità è calcolato sul cash netto (prudente). Il disponibile su fidi è capacità di assorbimento.</div>';
  }
  html += '</div>';
  html += '<button onclick="caricaSostenibilita()" style="font-size:11px;padding:6px 12px;background:var(--bg);border:0.5px solid var(--border);border-radius:4px;cursor:pointer;align-self:flex-start">🔄 Aggiorna</button>';
  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render: 4 blocchi semafori
// ────────────────────────────────────────────────────────────────────────
function _sostRenderSemafori(blocchi) {
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:18px">';
  blocchi.forEach(function(b) {
    var col;
    if (b.semaforo === 'verde')  col = { bg: '#EAF3DE', border: '#639922', text: '#173404', label: 'VERDE',  pallino: '#639922' };
    else if (b.semaforo === 'giallo') col = { bg: '#FAEEDA', border: '#BA7517', text: '#412402', label: 'GIALLO', pallino: '#BA7517' };
    else col = { bg: '#FCEBEB', border: '#A32D2D', text: '#501313', label: 'ROSSO',  pallino: '#A32D2D' };

    var indiceLabel = b.indice >= 99 ? '∞' : b.indice.toFixed(2);
    var icona = b.semaforo === 'verde' ? '✓' : b.semaforo === 'giallo' ? '⚠' : '✗';

    html += '<div style="background:' + col.bg + ';border:0.5px solid ' + col.border + ';border-radius:6px;padding:12px">';
    html += '<div style="font-size:10px;text-transform:uppercase;color:' + col.text + ';letter-spacing:0.4px;font-weight:600;margin-bottom:4px">' + esc(b.label) + '</div>';
    html += '<div style="font-size:11px;color:' + col.text + ';margin-bottom:6px">' + _sostFmtData(b.daISO) + ' - ' + _sostFmtData(b.aISO) + '</div>';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
    html += '<span style="width:10px;height:10px;border-radius:50%;background:' + col.pallino + ';display:inline-block"></span>';
    html += '<span style="font-size:10px;color:' + col.text + ';font-weight:600">' + col.label + '</span>';
    html += '</div>';
    var sn = b.saldoNetto;
    html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:500;color:' + col.text + '">' + (sn >= 0 ? '+ ' : '− ') + _sostFmtImporto(Math.abs(sn)) + '</div>';
    html += '<div style="font-size:9px;color:' + col.text + ';margin-top:2px">Entrate ' + _sostFmtImpKb(b.entrate) + ' · Uscite ' + _sostFmtImpKb(b.uscite) + '</div>';
    html += '<div style="font-size:10px;color:' + col.text + ';margin-top:6px;font-weight:500">Indice ' + indiceLabel + ' ' + icona + '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render: Suggerimento anticipi SBF (se deficit)
// ────────────────────────────────────────────────────────────────────────
function _sostRenderSuggerimento(sugg, bloccoCritico) {
  if (!sugg || !bloccoCritico) return '';
  var html = '<div style="background:#FCEBEB;border-left:4px solid #A32D2D;border-radius:0 6px 6px 0;padding:14px 16px;margin-bottom:14px">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
  html += '<div style="font-size:18px">⚠️</div>';
  html += '<div style="font-size:13px;font-weight:600;color:#501313">Periodo critico: ' + esc(bloccoCritico.label) + ' (' + _sostFmtData(bloccoCritico.daISO) + ' - ' + _sostFmtData(bloccoCritico.aISO) + ')</div>';
  html += '</div>';
  html += '<div style="font-size:11px;color:#501313;line-height:1.5;margin-bottom:10px">';
  html += 'Il deficit previsto è <strong>' + _sostFmtImporto(sugg.deficit) + ' €</strong>. Le uscite superano gli incassi attesi più il saldo iniziale.';
  html += '</div>';

  if (sugg.selezione.length === 0) {
    html += '<div style="background:white;border-radius:4px;padding:10px 12px;font-size:11px;color:var(--text-muted);font-style:italic">Nessuna fattura aperta disponibile per anticipo. Considera altre fonti di finanziamento.</div>';
  } else {
    html += '<div style="background:white;border-radius:4px;padding:10px 12px">';
    html += '<div style="font-size:11px;color:#501313;margin-bottom:6px;font-weight:600">💡 Suggerimento anticipo SBF</div>';
    html += '<div style="font-size:11px;color:#501313;line-height:1.6">';
    html += 'Anticipa <strong>' + sugg.selezione.length + ' fattur' + (sugg.selezione.length > 1 ? 'e' : 'a') + ' apert' + (sugg.selezione.length > 1 ? 'e' : 'a') + '</strong> ';
    html += '(totale lordo <strong>' + _sostFmtImporto(sugg.lordo) + ' €</strong>, netto stimato <strong>' + _sostFmtImporto(sugg.netto) + ' €</strong> dopo scarto ' + (SOSTENIBILITA_SCARTO_SBF * 100).toFixed(0) + '%) ordinate per importo decrescente:';
    html += '</div>';
    html += '<ul style="font-size:11px;color:#501313;margin:6px 0 0 18px;padding:0">';
    sugg.selezione.slice(0, 5).forEach(function(f) {
      html += '<li>F.' + esc(String(f.numero || '')) + '/' + esc(String(f.anno || '')) + ' ' + esc((f.cessionario_denominazione || '').substring(0, 40)) + ' — ' + _sostFmtImporto(f.saldo_residuo) + ' € (' + _sostFmtData(f.data) + ')</li>';
    });
    if (sugg.selezione.length > 5) {
      html += '<li>... + altre ' + (sugg.selezione.length - 5) + ' fatture</li>';
    }
    html += '</ul>';
    html += '<div style="font-size:10px;color:' + (sugg.coperturaCompleta ? '#27500A' : '#A32D2D') + ';margin-top:8px;font-style:italic">';
    if (sugg.coperturaCompleta) {
      html += '✓ Copertura completa del deficit con questa selezione';
    } else {
      html += '⚠ Selezione esaurita: ' + _sostFmtImporto(sugg.netto) + ' € coperti su ' + _sostFmtImporto(sugg.deficit) + ' € necessari';
    }
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render: Curva saldo previsto SVG
// ────────────────────────────────────────────────────────────────────────
function _sostRenderCurva(serie, saldoIniziale) {
  var html = '<div style="border-top:0.5px solid var(--border);padding-top:14px;margin-top:8px">';
  html += '<div style="font-size:13px;font-weight:500;margin-bottom:10px;color:var(--text)">Andamento saldo previsto — vista analitica</div>';
  html += '<div style="background:var(--bg);border-radius:6px;padding:14px">';

  // Calcolo viewport
  var w = 700, h = 240;
  var pad = { top: 20, right: 20, bottom: 30, left: 50 };
  var innerW = w - pad.left - pad.right;
  var innerH = h - pad.top - pad.bottom;

  // Range Y
  var valori = [saldoIniziale].concat(serie.map(function(s) { return s.saldoCumulato; }));
  var maxY = Math.max.apply(null, valori);
  var minY = Math.min.apply(null, valori);
  if (minY > 0) minY = 0;
  if (maxY < 0) maxY = 0;
  // Aggiungo padding 10%
  var range = maxY - minY;
  if (range === 0) range = Math.abs(maxY) || 1000;
  maxY += range * 0.1;
  minY -= range * 0.1;

  function xPos(idx) { return pad.left + (idx / 13) * innerW; }
  function yPos(val) { return pad.top + ((maxY - val) / (maxY - minY)) * innerH; }

  var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;max-height:280px">';
  svg += '<defs><linearGradient id="critArea" x1="0%" y1="0%" x2="0%" y2="100%">';
  svg += '<stop offset="0%" style="stop-color:#A32D2D;stop-opacity:0.15"/>';
  svg += '<stop offset="100%" style="stop-color:#A32D2D;stop-opacity:0.02"/>';
  svg += '</linearGradient></defs>';

  // Linea zero
  if (minY < 0 && maxY > 0) {
    var y0 = yPos(0);
    svg += '<line x1="' + pad.left + '" y1="' + y0 + '" x2="' + (w - pad.right) + '" y2="' + y0 + '" stroke="#A32D2D" stroke-width="1" stroke-dasharray="4,4"/>';
    svg += '<text x="' + (pad.left - 5) + '" y="' + (y0 - 3) + '" font-size="9" fill="#A32D2D" text-anchor="end">Soglia critica</text>';
  }

  // Assi
  svg += '<line x1="' + pad.left + '" y1="' + pad.top + '" x2="' + pad.left + '" y2="' + (h - pad.bottom) + '" stroke="rgba(0,0,0,0.2)" stroke-width="0.5"/>';
  svg += '<line x1="' + pad.left + '" y1="' + (h - pad.bottom) + '" x2="' + (w - pad.right) + '" y2="' + (h - pad.bottom) + '" stroke="rgba(0,0,0,0.2)" stroke-width="0.5"/>';

  // Tick Y (5 livelli)
  for (var t = 0; t <= 4; t++) {
    var v = minY + (maxY - minY) * (t / 4);
    var y = yPos(v);
    svg += '<text x="' + (pad.left - 5) + '" y="' + (y + 3) + '" font-size="9" fill="rgba(0,0,0,0.5)" text-anchor="end">' + _sostFmtImpKb(v) + '</text>';
  }

  // Linea curva (con punto 0 = saldo iniziale)
  var puntiPath = ['M ' + xPos(0) + ' ' + yPos(saldoIniziale)];
  serie.forEach(function(s, idx) {
    puntiPath.push('L ' + xPos(idx + 1) + ' ' + yPos(s.saldoCumulato));
  });
  svg += '<path d="' + puntiPath.join(' ') + '" stroke="#185FA5" stroke-width="2.5" fill="none"/>';

  // Punti colorati per ogni settimana
  serie.forEach(function(s, idx) {
    var col = '#639922';
    // Capisco semaforo del blocco corrispondente
    var bloccoSem = 'verde';
    _sostStato.blocchi.forEach(function(b) {
      if (SOSTENIBILITA_BLOCCHI[_sostStato.blocchi.indexOf(b)]) {
        var settInBlocco = SOSTENIBILITA_BLOCCHI[_sostStato.blocchi.indexOf(b)].settimane;
        if (settInBlocco.indexOf(s.numero) >= 0) bloccoSem = b.semaforo;
      }
    });
    if (bloccoSem === 'giallo') col = '#BA7517';
    else if (bloccoSem === 'rosso') col = '#A32D2D';
    var r = bloccoSem === 'rosso' ? 4 : 3.5;
    svg += '<circle cx="' + xPos(idx + 1) + '" cy="' + yPos(s.saldoCumulato) + '" r="' + r + '" fill="' + col + '"><title>Sett. ' + s.numero + ': ' + _sostFmtImporto(s.saldoCumulato) + ' €</title></circle>';
  });

  // Punto 0 (saldo iniziale)
  svg += '<circle cx="' + xPos(0) + '" cy="' + yPos(saldoIniziale) + '" r="4" fill="#185FA5"><title>Saldo iniziale: ' + _sostFmtImporto(saldoIniziale) + ' €</title></circle>';

  // Etichette X (settimane)
  for (var i = 0; i <= 13; i++) {
    if (i === 0 || i === 13 || i % 2 === 1) {
      svg += '<text x="' + xPos(i) + '" y="' + (h - pad.bottom + 14) + '" font-size="9" fill="rgba(0,0,0,0.5)" text-anchor="middle">' + (i === 0 ? 'Oggi' : 'S.' + i) + '</text>';
    }
  }

  svg += '</svg>';
  html += svg;
  html += '</div>';
  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render: Riepilogo statistico (3 colonne)
// ────────────────────────────────────────────────────────────────────────
function _sostRenderRiepilogo(blocchi) {
  var nVerde = 0, nGiallo = 0, nRosso = 0;
  blocchi.forEach(function(b) {
    if (b.semaforo === 'verde') nVerde += SOSTENIBILITA_BLOCCHI[blocchi.indexOf(b)].settimane.length;
    else if (b.semaforo === 'giallo') nGiallo += SOSTENIBILITA_BLOCCHI[blocchi.indexOf(b)].settimane.length;
    else nRosso += SOSTENIBILITA_BLOCCHI[blocchi.indexOf(b)].settimane.length;
  });

  var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px">';

  html += '<div style="background:#EAF3DE;border-left:3px solid #639922;border-radius:0 6px 6px 0;padding:10px 12px">';
  html += '<div style="font-size:10px;text-transform:uppercase;color:#27500A;font-weight:600;letter-spacing:0.4px;margin-bottom:4px">Periodi sostenibili</div>';
  html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:500;color:#173404">' + nVerde + ' sett.</div>';
  html += '<div style="font-size:10px;color:#27500A;margin-top:2px">indice ≥ ' + SOSTENIBILITA_SOGLIE.verde.toFixed(2) + '</div>';
  html += '</div>';

  html += '<div style="background:#FAEEDA;border-left:3px solid #BA7517;border-radius:0 6px 6px 0;padding:10px 12px">';
  html += '<div style="font-size:10px;text-transform:uppercase;color:#633806;font-weight:600;letter-spacing:0.4px;margin-bottom:4px">Sotto pressione</div>';
  html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:500;color:#412402">' + nGiallo + ' sett.</div>';
  html += '<div style="font-size:10px;color:#633806;margin-top:2px">indice ' + SOSTENIBILITA_SOGLIE.giallo.toFixed(2) + ' - ' + SOSTENIBILITA_SOGLIE.verde.toFixed(2) + '</div>';
  html += '</div>';

  html += '<div style="background:#FCEBEB;border-left:3px solid #A32D2D;border-radius:0 6px 6px 0;padding:10px 12px">';
  html += '<div style="font-size:10px;text-transform:uppercase;color:#791F1F;font-weight:600;letter-spacing:0.4px;margin-bottom:4px">Critiche</div>';
  html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:500;color:#501313">' + nRosso + ' sett.</div>';
  html += '<div style="font-size:10px;color:#791F1F;margin-top:2px">indice &lt; ' + SOSTENIBILITA_SOGLIE.giallo.toFixed(2) + '</div>';
  html += '</div>';

  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Note implementazione per primo rilascio
// ────────────────────────────────────────────────────────────────────────
function _sostRenderNoteImpl() {
  return '<div style="border-top:0.5px solid var(--border);margin-top:18px;padding-top:12px;font-size:10px;color:var(--text-muted);font-style:italic;line-height:1.6">' +
    'ℹ️ <strong>Stima parziale</strong>: spese ricorrenti (stipendi, F24, affitti, bollette) <strong>non incluse</strong> nel calcolo automatico. ' +
    'Per averle considerate, registrale dal foglio giornale come uscite Modo B. ' +
    'Le scadenze fatture clienti sono stimate a +60 giorni dalla data fattura. ' +
    'Il <strong>cash netto</strong> è la somma algebrica dei saldi conti attivi (positivi e negativi). Il <strong>disponibile su affidamenti</strong> è (accordato − utilizzato) sui fidi attivi e rappresenta la capacità di credito ancora disponibile. ' +
    'Soglie modificabili nel codice (variabile <code>SOSTENIBILITA_SOGLIE</code>).' +
    '</div>';
}
